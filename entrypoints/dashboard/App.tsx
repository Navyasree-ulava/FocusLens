import { useEffect, useMemo, useState } from 'react';
import { formatMinutes } from '../../src/format';
import { summarizeWebsiteTime } from '../../src/classification/productivity-summary';
import { loadDomainOverrides, type DomainOverride } from '../../src/classification/settings-store';
import { buildDailyUsage, buildTimeline, buildWebsiteUsage, type DailyUsage, type TimelineEntry, type WebsiteUsage } from '../../src/analytics/dashboard';
import { IndexedDbActivityStore } from '../../src/tracking/indexeddb-store';
import { localDayBounds } from '../../src/tracking/time';
import type { ActivityRecord, TrackerState } from '../../src/tracking/types';
import { loadYouTubeSettings } from '../../src/youtube/settings-store';
import { mostWatchedChannels, mostWatchedVideos, summarizeYouTubeTime, type YouTubeSummary } from '../../src/youtube/summary';
import type { YouTubeSegment } from '../../src/youtube/types';

type View = 'Overview' | 'Activity' | 'Websites' | 'YouTube';
interface DashboardData {
  records: ActivityRecord[];
  youtubeRecords: YouTubeSegment[];
  overrides: DomainOverride[];
  tracker: TrackerState | null;
  todayMs: number;
  daily: DailyUsage[];
  timeline: TimelineEntry[];
  websites: WebsiteUsage[];
  youtubeSummary: YouTubeSummary;
  loading: boolean;
  error: boolean;
}

const store = new IndexedDbActivityStore();
const emptyYouTube = summarizeYouTubeTime([]);
const emptyData: DashboardData = {
  records: [], youtubeRecords: [], overrides: [], tracker: null, todayMs: 0,
  daily: [], timeline: [], websites: [], youtubeSummary: emptyYouTube, loading: true, error: false,
};

function duration(ms: number): string {
  if (ms > 0 && ms < 60_000) return '<1m';
  return formatMinutes(ms / 60_000);
}

function dateWindow(now: number, days: number) {
  const start = new Date(localDayBounds(now).start);
  start.setDate(start.getDate() - (days - 1));
  return { start: start.getTime(), end: localDayBounds(now).end };
}

export default function App() {
  const [view, setView] = useState<View>('Overview');
  const [data, setData] = useState<DashboardData>(emptyData);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const now = Date.now();
        const { start, end } = dateWindow(now, 7);
        const [state, overrides, settings, records, youtubeRecords] = await Promise.all([
          store.readState(), loadDomainOverrides(), loadYouTubeSettings(),
          store.listRecords(start, end), store.listYouTubeSegments(start, now + 1),
        ]);
        const todayBounds = localDayBounds(now);
        const currentOpenMs = state?.intervalStartedAt !== null && state?.context
          ? Math.max(0, now - Math.max(state.intervalStartedAt, todayBounds.start))
          : 0;
        const currentDomain = state?.context?.domain;
        const withOpen = currentOpenMs > 0 && currentDomain
          ? [...records, { id: 'current-open', domain: currentDomain, startedAt: now - currentOpenMs, endedAt: now, durationMs: currentOpenMs }]
          : records;
        const todayStored = records.filter((record) => record.startedAt < todayBounds.end && record.endedAt > todayBounds.start)
          .reduce((total, record) => total + Math.max(0, Math.min(record.endedAt, todayBounds.end) - Math.max(record.startedAt, todayBounds.start)), 0);
        const daily = buildDailyUsage(withOpen, now, 7);
        if (mounted) setData({
          records: withOpen,
          youtubeRecords,
          overrides,
          tracker: state,
          todayMs: todayStored + currentOpenMs,
          daily,
          timeline: buildTimeline(withOpen.filter((record) => record.endedAt > todayBounds.start)),
          websites: buildWebsiteUsage(withOpen, overrides),
          youtubeSummary: summarizeYouTubeTime(youtubeRecords, settings),
          loading: false,
          error: false,
        });
      } catch {
        if (mounted) setData((current) => ({ ...current, loading: false, error: true }));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const todayStart = localDayBounds(Date.now()).start;
  const websiteSummary = useMemo(() => summarizeWebsiteTime(
    data.records.filter((record) => record.endedAt > todayStart)
      .map(({ domain, startedAt, endedAt }) => ({
        domain,
        durationMs: Math.max(0, endedAt - Math.max(startedAt, todayStart)),
      })), data.overrides,
  ), [data.records, data.overrides, todayStart]);
  const maxDaily = Math.max(1, ...data.daily.map((day) => day.durationMs));
  const topVideos = mostWatchedVideos(data.youtubeRecords, 5);
  const topChannels = mostWatchedChannels(data.youtubeRecords, 5);
  const status = data.tracker?.intervalStartedAt !== null && data.tracker?.intervalStartedAt !== undefined
    ? 'Tracking now'
    : data.tracker?.idle ? 'Paused while idle' : data.tracker?.focused === false ? 'Browser not focused' : 'Waiting for activity';

  return <div className="min-h-screen bg-[#111210] text-[#f2f0e9]">
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-white/[0.07] bg-[#151613] px-5 py-6 lg:block">
      <div className="flex items-center gap-3"><span className="brand-mark grid size-9 place-items-center rounded-xl font-bold">F</span><div><p className="font-semibold tracking-tight">FocusLens</p><p className="text-[10px] tracking-[.16em] text-[#777870]">YOUR TIME, IN FOCUS</p></div></div>
      <p className="mt-12 px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-[#696a62]">Workspace</p>
      <nav className="mt-3 space-y-1">{(['Overview', 'Activity', 'Websites', 'YouTube'] as View[]).map((item) => <button key={item} onClick={() => setView(item)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${view === item ? 'bg-[#252720] text-[#d8eab7]' : 'text-[#92938a] hover:bg-white/[.03]'}`}><span className="text-xs">{item === 'Overview' ? '◫' : item === 'Activity' ? '◷' : item === 'Websites' ? '◎' : '▷'}</span>{item}</button>)}</nav>
      <div className="absolute bottom-6 left-5 right-5 rounded-xl border border-white/[.07] bg-[#191a17] p-3"><p className="text-xs font-medium">Local by design</p><p className="mt-1 text-[10px] leading-4 text-[#777870]">Your activity stays in this browser profile.</p></div>
    </aside>
    <main className="mx-auto max-w-7xl px-5 py-7 lg:ml-60 lg:px-10 lg:py-9">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[.07] pb-6">
        <div><p className="text-xs text-[#8f9087]">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.05em]">{view}</h1><p className="mt-1 text-sm text-[#85867d]">A clear view of where your browsing time goes.</p></div>
        <div className="flex items-center gap-2 rounded-full border border-white/[.08] bg-[#191a17] px-3 py-2 text-xs text-[#aaa99f]"><span className="size-2 rounded-full bg-[#a9da7b]" />{status}</div>
      </header>
      <nav className="mt-4 flex gap-2 overflow-auto lg:hidden">{(['Overview', 'Activity', 'Websites', 'YouTube'] as View[]).map((item) => <button key={item} onClick={() => setView(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs ${view === item ? 'bg-[#252720] text-[#d8eab7]' : 'text-[#92938a]'}`}>{item}</button>)}</nav>
      {data.error && <div role="alert" className="mt-6 rounded-xl border border-[#bd765d]/30 bg-[#bd765d]/10 p-4 text-sm text-[#e4ac97]">FocusLens could not read local activity. Reload the dashboard to try again.</div>}
      {data.loading ? <div className="py-20 text-center text-sm text-[#777870]">Loading local activity…</div> : <>
        {view === 'Overview' && <>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric title="Active browsing today" value={duration(data.todayMs)} note="Foreground time only" />
            <Metric title="Productive classified" value={duration(websiteSummary.productiveMs)} note="Based on your site rules" tone="green" />
            <Metric title="Recreational classified" value={duration(websiteSummary.recreationalMs)} note="Based on your site rules" tone="orange" />
            <Metric title="Browsing ratio" value={websiteSummary.productivityRatio === null ? '—' : `${Math.round(websiteSummary.productivityRatio * 100)}%`} note="Productive ÷ classified browsing" />
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Panel title="Browsing trend" subtitle="Daily active time · last 7 days"><div className="flex h-52 items-end gap-3 pt-5">{data.daily.map((day) => <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] tabular-nums text-[#85867d]">{day.durationMs ? duration(day.durationMs) : ''}</span><div className="flex w-full flex-1 items-end"><div title={`${day.label}: ${duration(day.durationMs)}`} className={`w-full rounded-t-md ${day.durationMs ? 'bg-gradient-to-t from-[#7caa57] to-[#c9ee8e]' : 'bg-[#252620]'}`} style={{ height: `${day.durationMs ? Math.max(5, day.durationMs / maxDaily * 100) : 3}%` }} /></div><span className="text-[10px] text-[#777870]">{day.label}</span></div>)}</div></Panel>
            <Panel title="Time by intent" subtitle="Unknown time is excluded from the ratio"><IntentBars summary={websiteSummary} /></Panel>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-2"><WebsiteTable websites={data.websites.slice(0, 5)} /><YouTubeCard summary={data.youtubeSummary} videos={topVideos.slice(0, 3)} /></div>
          <div className="mt-5"><Timeline entries={data.timeline.slice(0, 8)} /></div>
        </>}
        {view === 'Activity' && <div className="mt-7"><Timeline entries={data.timeline} detailed /></div>}
        {view === 'Websites' && <div className="mt-7"><WebsiteTable websites={data.websites} detailed /></div>}
        {view === 'YouTube' && <div className="mt-7 grid gap-5 xl:grid-cols-[1.2fr_1fr]"><YouTubeCard summary={data.youtubeSummary} videos={topVideos} detailed /><Panel title="Most watched channels" subtitle="Ranked by stored playing time">{topChannels.length ? <div className="divide-y divide-white/[.06]">{topChannels.map((channel) => <div key={channel.channelName} className="flex justify-between py-3 text-sm"><span className="truncate pr-3">{channel.channelName}</span><span className="text-[#aaa99f]">{duration(channel.durationMs)}</span></div>)}</div> : <Empty>No YouTube viewing records yet.</Empty>}</Panel></div>}
      </>}
      <footer className="mt-10 border-t border-white/[.07] py-5 text-center text-[10px] text-[#67685f]">Statistics are calculated from stored activity on this device. Browsing ratio describes site classifications, not personal productivity.</footer>
    </main>
  </div>;
}

function Metric({ title, value, note, tone }: { title: string; value: string; note: string; tone?: 'green' | 'orange' }) {
  return <section className="rounded-2xl border border-white/[.07] bg-[#191a17] p-5"><p className="text-xs text-[#85867d]">{title}</p><p className={`mt-4 text-3xl font-semibold tracking-[-.05em] tabular-nums ${tone === 'green' ? 'text-[#c4e995]' : tone === 'orange' ? 'text-[#e6b278]' : ''}`}>{value}</p><p className="mt-2 text-[10px] text-[#6f7068]">{note}</p></section>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/[.07] bg-[#191a17] p-5"><div className="mb-4"><h2 className="text-sm font-medium">{title}</h2>{subtitle && <p className="mt-1 text-[10px] text-[#777870]">{subtitle}</p>}</div>{children}</section>;
}

function IntentBars({ summary }: { summary: ReturnType<typeof summarizeWebsiteTime> }) {
  const total = summary.classifiedMs;
  const entries = [
    ['Productive', summary.productiveMs, 'bg-[#a9da7b]'],
    ['Recreational', summary.recreationalMs, 'bg-[#dda36f]'],
    ['Neutral', summary.neutralMs, 'bg-[#85867d]'],
  ] as const;
  return <div>{total > 0 ? <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-[#252620]">{entries.map(([label, value, color]) => <div key={label} title={`${label} ${duration(value)}`} className={color} style={{ width: `${value / total * 100}%` }} />)}</div> : <Empty>No classified browsing time yet.</Empty>}<div className="mt-5 space-y-3">{entries.map(([label, value, color]) => <div key={label} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-[#999a91]"><i className={`size-2 rounded-full ${color}`} />{label}</span><b className="font-medium text-[#d3d1c7]">{duration(value)}</b></div>)}<div className="flex justify-between border-t border-white/[.06] pt-3 text-[10px] text-[#777870]"><span>Unknown</span><span>{duration(summary.unknownMs)}</span></div></div></div>;
}

function WebsiteTable({ websites, detailed = false }: { websites: WebsiteUsage[]; detailed?: boolean }) {
  return <Panel title={detailed ? 'All websites' : 'Top websites'} subtitle="Ranked by active time on this device">{websites.length ? <div className="divide-y divide-white/[.06]">{websites.map((site, index) => <div key={site.domain} className="flex items-center gap-3 py-3"><span className="w-5 text-[10px] text-[#686960]">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{site.domain}</p><p className="mt-1 text-[10px] text-[#777870]">{site.category} · {site.productivity}</p></div><span className="text-xs tabular-nums text-[#aaa99f]">{duration(site.durationMs)}</span></div>)}</div> : <Empty>No website activity recorded yet.</Empty>}</Panel>;
}

function Timeline({ entries, detailed = false }: { entries: TimelineEntry[]; detailed?: boolean }) {
  return <Panel title={detailed ? 'Activity timeline' : 'Recent activity'} subtitle="Individual stored foreground intervals">{entries.length ? <div className="divide-y divide-white/[.06]">{entries.map((entry, index) => <div key={`${entry.startedAt}-${index}`} className="flex items-center gap-3 py-3"><span className="w-16 text-[10px] tabular-nums text-[#777870]">{new Date(entry.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span><span className="size-2 rounded-full bg-[#a9da7b]" /><p className="min-w-0 flex-1 truncate text-xs">{entry.domain}</p><span className="text-xs tabular-nums text-[#aaa99f]">{duration(entry.durationMs)}</span></div>)}</div> : <Empty>No activity recorded yet. New intervals will appear here.</Empty>}</Panel>;
}

function YouTubeCard({ summary, videos, detailed = false }: { summary: YouTubeSummary; videos: ReturnType<typeof mostWatchedVideos>; detailed?: boolean }) {
  const categories = [
    ['Educational', summary.educationalViewingMs], ['Entertainment', summary.entertainmentViewingMs], ['Shorts', summary.shortsMs],
  ] as const;
  return <Panel title={detailed ? 'YouTube viewing' : 'YouTube this week'} subtitle="Video playback state is kept locally"><div className="grid grid-cols-2 gap-3">{categories.map(([label, value]) => <div key={label} className="rounded-xl bg-[#20211d] p-3"><p className="text-[10px] text-[#85867d]">{label}</p><p className="mt-2 text-lg font-medium tabular-nums">{duration(value)}</p></div>)}</div><div className="mt-4 grid grid-cols-3 gap-2 text-[10px] text-[#85867d]">{[['Paused', summary.pausedMs], ['Buffering', summary.bufferingMs], ['Browsing', summary.browsingMs]].map(([label, value]) => <div key={label as string}>{label}<b className="mt-1 block font-medium text-[#c9c7bc]">{duration(value as number)}</b></div>)}</div><div className="mt-5 border-t border-white/[.06] pt-4"><p className="mb-2 text-[10px] text-[#85867d]">Most watched videos</p>{videos.length ? videos.map((video) => <a key={video.videoId} href={video.videoUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 border-t border-white/[.04] py-2.5 text-xs hover:text-[#c9ee8e]"><span className="min-w-0 truncate">{video.title ?? video.videoId}<span className="mt-1 block truncate text-[10px] text-[#777870]">{video.channelName ?? 'Unknown channel'}</span></span><span className="shrink-0 text-[10px] text-[#aaa99f]">{duration(video.durationMs)}</span></a>) : <Empty>No YouTube viewing records yet.</Empty>}</div></Panel>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-white/[.08] px-4 py-8 text-center text-xs text-[#777870]">{children}</p>;
}
