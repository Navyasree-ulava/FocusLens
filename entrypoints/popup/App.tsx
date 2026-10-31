import { useEffect, useState } from 'react';
import { formatMinutes } from '../../src/format';
import { IndexedDbActivityStore } from '../../src/tracking/indexeddb-store';
import { localDayBounds } from '../../src/tracking/time';
import type { TrackerState } from '../../src/tracking/types';

interface PopupData {
  state: TrackerState | null;
  activeMsToday: number;
  ready: boolean;
  error: boolean;
}

const activityStore = new IndexedDbActivityStore();

function displayDuration(milliseconds: number): string {
  if (milliseconds > 0 && milliseconds < 60_000) return '<1m';
  return formatMinutes(milliseconds / 60_000);
}

function trackerStatus(state: TrackerState | null): { label: string; detail: string; color: string } {
  if (!state) return { label: 'Starting', detail: 'Checking the active browser tab', color: 'bg-[#d9bc72]' };
  if (state.intervalStartedAt !== null) return { label: 'Tracking', detail: 'Counting this active tab', color: 'bg-[#a9da7b]' };
  if (!state.focused) return { label: 'Paused', detail: 'Waiting for the browser to be focused', color: 'bg-[#777870]' };
  if (state.idle) return { label: 'Paused', detail: 'Idle time is excluded', color: 'bg-[#777870]' };
  return { label: 'Not counting', detail: 'This page cannot be tracked', color: 'bg-[#777870]' };
}

export default function App() {
  const [data, setData] = useState<PopupData>({ state: null, activeMsToday: 0, ready: false, error: false });

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const now = Date.now();
        const state = await activityStore.readState();
        const { start, end } = localDayBounds(now);
        const records = await activityStore.listRecords(start, end);
        const storedMs = records.reduce((total, record) => total + record.durationMs, 0);
        const openMs = state?.intervalStartedAt !== null && state?.context
          ? Math.max(0, now - Math.max(state.intervalStartedAt, start))
          : 0;
        if (mounted) setData({ state, activeMsToday: storedMs + openMs, ready: true, error: false });
      } catch {
        if (mounted) setData((current) => ({ ...current, ready: true, error: true }));
      }
    };

    const port = browser.runtime.connect({ name: 'focuslens-popup' });
    port.onMessage.addListener((message: { type: string }) => {
      if (message.type === 'focuslens-tracker-updated') void refresh();
    });
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      port.disconnect();
    };
  }, []);

  const status = trackerStatus(data.state);
  const active = Boolean(data.state && data.state.intervalStartedAt !== null && data.state.context);

  return (
    <main className="popup-shell min-h-screen w-[360px] bg-[#111210] p-5 text-[#f2f0e9]">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="brand-mark grid size-8 place-items-center rounded-[11px] text-sm font-bold">F</div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-[-0.03em]">FocusLens</h1>
            <p className="text-[10px] text-[#87877f]">YOUR TIME, IN FOCUS</p>
          </div>
        </div>
        <span className="status-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium">
          <span className={`size-1.5 rounded-full ${status.color}`} /> {status.label}
        </span>
      </header>

      <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[#aaa99f]">Active browsing today</p>
          <span className="text-[10px] text-[#777870]">Local time</span>
        </div>
        <p className="mt-4 text-[32px] font-semibold tracking-[-0.06em] tabular-nums">
          {!data.ready ? '—' : data.error ? 'Unavailable' : displayDuration(data.activeMsToday)}
        </p>
        <p className="mt-1 text-[11px] text-[#8e8d83]">
          {data.error ? 'Local activity storage could not be read.' : status.detail}
        </p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-[#282923]" aria-label="Activity totals are based on stored active intervals" />
      </section>

      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-[#aaa99f]">Current website</h2>
          <span className="text-[10px] text-[#777870]">{active ? 'Active tab' : 'Not counting'}</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-[#252620] text-sm text-[#a8aa95]">◎</div>
          <div>
            <p className="text-sm font-medium">{data.state?.context?.domain ?? '—'}</p>
            <p className="mt-0.5 text-[11px] text-[#777870]">Website categories arrive in Phase 2</p>
          </div>
          <span className="ml-auto rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-[#929188]">Unclassified</span>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-sm text-[#c5e98f]">◈</span>
          <div>
            <h2 className="text-xs font-medium text-[#d6d4cb]">Local by design</h2>
            <p className="mt-1 text-[11px] leading-4 text-[#88877e]">
              Only website domains and active time are stored on this device. Background tabs, idle time, and incognito windows are excluded.
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-5 border-t border-white/[0.08] pt-4 text-center text-[10px] text-[#777870]">
        No page paths or query strings are saved
      </footer>
    </main>
  );
}

