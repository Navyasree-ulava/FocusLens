import { useEffect, useState } from 'react';
import { CATEGORY_DEFINITIONS, type WebsiteCategory } from '../../src/classification/categories';
import { loadDomainOverrides } from '../../src/classification/settings-store';
import { summarizeDailyUsage } from '../../src/analytics/daily-usage';
import { formatMinutes } from '../../src/format';
import { IndexedDbActivityStore } from '../../src/tracking/indexeddb-store';
import { localDayBounds } from '../../src/tracking/time';
import type { TrackerState } from '../../src/tracking/types';
import { loadWellbeingSettings } from '../../src/wellbeing/settings-store';
import { isBrowserExtensionContext } from '../../src/tracking/extension-context';

interface PopupData {
  activeMs: number;
  categories: Record<WebsiteCategory, number>;
  state: TrackerState | null;
  paused: boolean;
  ready: boolean;
  error: boolean;
}

const activityStore = new IndexedDbActivityStore();
const initialData: PopupData = {
  activeMs: 0,
  categories: Object.fromEntries(CATEGORY_DEFINITIONS.map(({ name }) => [name, 0])) as Record<WebsiteCategory, number>,
  state: null,
  paused: false,
  ready: false,
  error: false,
};

const categoryColors: Record<WebsiteCategory, string> = {
  Learning: '#a9da7b',
  'Coding & Development': '#83c9b3',
  Documentation: '#8cb8e8',
  Academic: '#a9a0e8',
  'Professional Work': '#83b9c7',
  Communication: '#d1c67d',
  'Social Media': '#dca17e',
  Entertainment: '#e6a278',
  Gaming: '#d68c9c',
  Shopping: '#bd9a78',
  Unknown: '#777870',
};

function duration(milliseconds: number): string {
  if (milliseconds > 0 && milliseconds < 60_000) return '<1m';
  return formatMinutes(milliseconds / 60_000);
}

function statusLabel(state: TrackerState | null, paused: boolean): string {
  if (paused) return 'Paused';
  if (state?.intervalStartedAt !== null && state?.intervalStartedAt !== undefined) return 'Tracking';
  if (state?.focused === false) return 'Browser unfocused';
  if (state?.idle) return 'Idle';
  return 'Waiting';
}

export default function App() {
  const extensionContext = isBrowserExtensionContext();
  const [data, setData] = useState<PopupData>(initialData);

  useEffect(() => {
    if (!extensionContext) return;
    let mounted = true;
    const refresh = async () => {
      try {
        const now = Date.now();
        const { start } = localDayBounds(now);
        const [state, overrides, wellbeing] = await Promise.all([
          activityStore.readState(),
          loadDomainOverrides(),
          loadWellbeingSettings(),
        ]);
        const records = await activityStore.listRecords(start, now + 1);
        const openInterval = state?.intervalStartedAt !== null && state?.intervalStartedAt !== undefined && state.context
          ? { domain: state.context.domain, startedAt: state.intervalStartedAt, endedAt: now }
          : undefined;
        const summary = summarizeDailyUsage(records, start, now, overrides, openInterval);
        if (mounted) setData({
          activeMs: summary.activeMs,
          categories: summary.categories,
          state,
          paused: wellbeing.trackingPaused,
          ready: true,
          error: false,
        });
      } catch {
        if (mounted) setData((current) => ({ ...current, ready: true, error: true }));
      }
    };

    let port: ReturnType<typeof browser.runtime.connect> | undefined;
    try {
      port = browser.runtime.connect({ name: 'focuslens-popup' });
      port.onMessage.addListener((message: { type: string }) => {
        if (message.type === 'focuslens-tracker-updated') void refresh();
      });
    } catch { /* The periodic refresh still works if a runtime port is unavailable. */ }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      port?.disconnect();
    };
  }, [extensionContext]);

  const label = statusLabel(data.state, data.paused);
  const usedCategories = CATEGORY_DEFINITIONS
    .map(({ name }) => ({ name, value: data.categories[name] }))
    .filter(({ value }) => value > 0)
    .toSorted((left, right) => right.value - left.value);

  if (!extensionContext) return <main className="grid min-h-screen w-[360px] place-items-center bg-[#111210] px-5 text-center text-[#f2f0e9]"><section><div className="brand-mark mx-auto grid size-9 place-items-center rounded-xl font-bold">F</div><h1 className="mt-3 text-sm font-semibold">Open FocusLens in your browser</h1><p className="mt-2 text-xs leading-5 text-[#aaa99f]">This view needs the FocusLens extension to read local activity.</p></section></main>;

  return <main className="popup-shell min-h-screen w-[360px] bg-[#111210] px-4 py-4 text-[#f2f0e9]">
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="brand-mark grid size-8 place-items-center rounded-[11px] text-sm font-bold">F</div>
        <div><h1 className="text-sm font-semibold tracking-[-0.03em]">FocusLens</h1><p className="text-[9px] text-[#777870]">YOUR TIME, IN FOCUS</p></div>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#252620] px-2.5 py-1 text-[10px] text-[#aaa99f]">
        <span className={`size-1.5 rounded-full ${label === 'Tracking' ? 'bg-[#a9da7b]' : 'bg-[#777870]'}`} />{label}
      </span>
    </header>

    <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4" aria-labelledby="daily-usage-heading">
      <div className="flex items-center justify-between">
        <h2 id="daily-usage-heading" className="text-xs font-medium text-[#c9c7bc]">Today’s usage</h2>
        <span className="text-[10px] text-[#777870]">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </div>
      <p className="mt-3 text-[32px] font-semibold tracking-[-0.06em] tabular-nums">
        {!data.ready ? '—' : data.error ? 'Unavailable' : duration(data.activeMs)}
      </p>
      {data.error ? <p role="alert" className="mt-2 text-[11px] text-[#d79880]">Could not read local activity.</p> : <>
        {data.ready && data.activeMs > 0 && <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-[#252620]" aria-label="Daily time by category">
          {usedCategories.map(({ name, value }) => <span key={name} title={`${name} ${duration(value)}`} style={{ width: `${value / data.activeMs * 100}%`, backgroundColor: categoryColors[name] }} />)}
        </div>}
        <div className="mt-3 space-y-3">
          {usedCategories.map(({ name, value }) => <div key={name} className="flex items-center gap-2.5 text-[11px]">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColors[name] }} />
            <span className="min-w-0 flex-1 truncate text-[#aaa99f]">{name}</span>
            <span className="shrink-0 tabular-nums text-[#e2e0d7]">{duration(value)}</span>
          </div>)}
          {data.ready && usedCategories.length === 0 && <p className="py-2 text-[11px] text-[#777870]">No browsing time recorded today yet.</p>}
        </div>
      </>}
    </section>

    <a href={browser.runtime.getURL('/dashboard.html')} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-between rounded-xl px-1 py-2 text-[11px] text-[#aaa99f] hover:text-[#c9ee8e]">
      <span>Open dashboard</span><span aria-hidden="true">↗</span>
    </a>
    <p className="mt-1 text-center text-[9px] text-[#67685f]">Stored locally · time is grouped by your website categories</p>
  </main>;
}
