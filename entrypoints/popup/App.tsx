import { useEffect, useState } from 'react';
import { buildActivityDays, currentOpenActivity, formatActivityDuration, normalizeActivityRecords, trackingStatus } from '../../src/analytics/activity';
import { IndexedDbActivityStore } from '../../src/tracking/indexeddb-store';
import { localDayBounds } from '../../src/tracking/time';
import type { TrackerState } from '../../src/tracking/types';
import { loadWellbeingSettings } from '../../src/wellbeing/settings-store';
import { isBrowserExtensionContext } from '../../src/tracking/extension-context';

interface PopupData {
  activeMs: number;
  state: TrackerState | null;
  paused: boolean;
  ready: boolean;
  error: boolean;
}

const activityStore = new IndexedDbActivityStore();
const initialData: PopupData = { activeMs: 0, state: null, paused: false, ready: false, error: false };

function shortStatus(state: TrackerState | null, paused: boolean): string {
  const label = trackingStatus(state, paused);
  if (label === 'Tracking active tab') return 'Tracking';
  if (label === 'Browser window unfocused') return 'Window unfocused';
  if (label === 'Paused while idle') return 'Idle';
  if (label === 'Paused in Settings') return 'Paused';
  if (label === 'Starting') return 'Starting';
  return 'No website tab';
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
        const start = localDayBounds(now).start;
        const [state, settings, records] = await Promise.all([
          activityStore.readState(), loadWellbeingSettings(), activityStore.listRecords(start - 86_400_000, now + 1),
        ]);
        const open = currentOpenActivity(state, now, settings.trackingPaused);
        const normalized = normalizeActivityRecords(open ? [...records, open] : records, start, now + 1);
        const [today] = buildActivityDays(normalized, start, now + 1);
        if (mounted) setData({ activeMs: today?.durationMs ?? 0, state, paused: settings.trackingPaused, ready: true, error: false });
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
    } catch { /* The periodic update still keeps the popup current. */ }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => { mounted = false; window.clearInterval(timer); port?.disconnect(); };
  }, [extensionContext]);

  if (!extensionContext) return <main className="grid min-h-screen w-[360px] place-items-center bg-[#111210] px-5 text-center text-[#f2f0e9]"><section><div className="brand-mark mx-auto grid size-9 place-items-center rounded-xl font-bold">F</div><h1 className="mt-3 text-sm font-semibold">Open FocusLens in your browser</h1><p className="mt-2 text-xs leading-5 text-[#aaa99f]">This view needs the FocusLens extension to read local activity.</p></section></main>;

  const label = shortStatus(data.state, data.paused);
  return <main className="popup-shell min-h-screen w-[360px] bg-[#111210] px-4 py-4 text-[#f2f0e9]">
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2.5"><div className="brand-mark grid size-8 place-items-center rounded-[11px] text-sm font-bold">F</div><div><h1 className="text-sm font-semibold tracking-[-0.03em]">FocusLens</h1><p className="text-[9px] text-[#777870]">YOUR BROWSING, SIMPLIFIED</p></div></div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#252620] px-2.5 py-1 text-[10px] text-[#aaa99f]"><span className={`size-1.5 rounded-full ${label === 'Tracking' ? 'bg-[#a9da7b]' : 'bg-[#777870]'}`} />{label}</span>
    </header>
    <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4" aria-labelledby="daily-usage-heading">
      <div className="flex items-center justify-between"><h2 id="daily-usage-heading" className="text-xs font-medium text-[#c9c7bc]">Active browsing today</h2><span className="text-[10px] text-[#777870]">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
      <p className="mt-3 text-[32px] font-semibold tracking-[-0.06em] tabular-nums">{!data.ready ? '—' : data.error ? 'Unavailable' : formatActivityDuration(data.activeMs)}</p>
      {data.error ? <p role="alert" className="mt-2 text-[11px] text-[#d79880]">Could not read local activity.</p> : <p className="mt-2 text-[11px] text-[#777870]">Foreground time across websites, including YouTube.</p>}
      {data.ready && !data.error && <p className="mt-3 text-[10px] text-[#aaa99f]">{data.paused ? 'Tracking is paused in Settings.' : label === 'No website tab' ? 'Open a regular website tab to start tracking. Past activity is saved.' : label === 'Tracking' ? 'This website is being counted now.' : `Tracking status: ${label.toLowerCase()}.`}</p>}
    </section>
    <a href={browser.runtime.getURL('/dashboard.html')} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-between rounded-xl px-1 py-2 text-[11px] text-[#aaa99f] hover:text-[#c9ee8e]"><span>Open dashboard</span><span aria-hidden="true">↗</span></a>
    <p className="mt-1 text-center text-[9px] text-[#67685f]">Saved locally · counted once across overlapping intervals</p>
  </main>;
}
