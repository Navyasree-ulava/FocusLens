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
import { endFocusSession, focusSessionElapsedMs, pauseFocusSession, resumeFocusSession, startFocusSession, summarizeFocusSession } from '../../src/wellbeing/focus-sessions';
import { DEFAULT_WELLBEING_SETTINGS, loadWellbeingSettings, saveWellbeingSettings } from '../../src/wellbeing/settings-store';
import type { FocusSession, WellbeingSettings } from '../../src/wellbeing/types';
import type { AIClassification } from '../../src/ai/types';
import { DEFAULT_AI_SETTINGS, aiEndpointOrigin, aiHostPermissionPattern, loadAIAPIKey, loadAISettings, saveAIAPIKey, saveAISettings } from '../../src/ai/settings';
import type { AISettings } from '../../src/ai/types';

type View = 'Overview' | 'Activity' | 'Websites' | 'YouTube' | 'Focus Sessions' | 'Settings';
interface DashboardData {
  records: ActivityRecord[];
  focusRecords: ActivityRecord[];
  youtubeRecords: YouTubeSegment[];
  aiClassifications: AIClassification[];
  overrides: DomainOverride[];
  tracker: TrackerState | null;
  todayMs: number;
  daily: DailyUsage[];
  timeline: TimelineEntry[];
  websites: WebsiteUsage[];
  youtubeSummary: YouTubeSummary;
  sessions: FocusSession[];
  wellbeing: WellbeingSettings;
  loading: boolean;
  error: boolean;
}

const store = new IndexedDbActivityStore();
const FOCUS_SESSION_END_ALARM = 'focuslens-focus-session-end';
const emptyYouTube = summarizeYouTubeTime([]);
const emptyData: DashboardData = {
  records: [], focusRecords: [], youtubeRecords: [], aiClassifications: [], overrides: [], tracker: null, todayMs: 0,
  daily: [], timeline: [], websites: [], youtubeSummary: emptyYouTube, sessions: [], wellbeing: DEFAULT_WELLBEING_SETTINGS, loading: true, error: false,
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
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const now = Date.now();
        const { start, end } = dateWindow(now, 7);
        const [state, overrides, settings, records, youtubeRecords, sessions, wellbeing, aiClassifications] = await Promise.all([
          store.readState(), loadDomainOverrides(), loadYouTubeSettings(),
          store.listRecords(start, end), store.listYouTubeSegments(start, now + 1), store.listFocusSessions(), loadWellbeingSettings(),
          store.listAIClassifications(),
        ]);
        const todayBounds = localDayBounds(now);
        const oldestSessionStart = sessions.reduce((oldest, session) => Math.min(oldest, session.startedAt), start);
        const focusRecords = oldestSessionStart < start ? await store.listRecords(oldestSessionStart, end) : records;
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
          focusRecords: focusRecords === records ? withOpen : [...focusRecords, ...withOpen.filter((record) => record.id === 'current-open')],
          youtubeRecords,
          aiClassifications,
          overrides,
          tracker: state,
          todayMs: todayStored + currentOpenMs,
          daily,
          timeline: buildTimeline(withOpen.filter((record) => record.endedAt > todayBounds.start)),
          websites: buildWebsiteUsage(withOpen, overrides),
          youtubeSummary: summarizeYouTubeTime(youtubeRecords, settings, aiClassifications),
          sessions,
          wellbeing,
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
  }, [refreshNonce]);

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

  const refresh = async () => {
    setRefreshNonce((current) => current + 1);
  };
  const todayProgress = Math.min(100, Math.round(data.todayMs / (data.wellbeing.dailyGoalMinutes * 60_000) * 100));
  return <div className="min-h-screen bg-[#111210] text-[#f2f0e9]">
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-white/[0.07] bg-[#151613] px-5 py-6 lg:block">
      <div className="flex items-center gap-3"><span className="brand-mark grid size-9 place-items-center rounded-xl font-bold">F</span><div><p className="font-semibold tracking-tight">FocusLens</p><p className="text-[10px] tracking-[.16em] text-[#777870]">YOUR TIME, IN FOCUS</p></div></div>
      <p className="mt-12 px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-[#696a62]">Workspace</p>
      <nav className="mt-3 space-y-1">{(['Overview', 'Activity', 'Websites', 'YouTube', 'Focus Sessions', 'Settings'] as View[]).map((item) => <button key={item} onClick={() => setView(item)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${view === item ? 'bg-[#252720] text-[#d8eab7]' : 'text-[#92938a] hover:bg-white/[.03]'}`}><span className="text-xs">{item === 'Overview' ? '◫' : item === 'Activity' ? '◷' : item === 'Websites' ? '◎' : item === 'YouTube' ? '▷' : item === 'Settings' ? '⚙' : '◴'}</span>{item}</button>)}</nav>
      <div className="absolute bottom-6 left-5 right-5 rounded-xl border border-white/[.07] bg-[#191a17] p-3"><p className="text-xs font-medium">Local by design</p><p className="mt-1 text-[10px] leading-4 text-[#777870]">Your activity stays in this browser profile.</p></div>
    </aside>
    <main className="mx-auto max-w-7xl px-5 py-7 lg:ml-60 lg:px-10 lg:py-9">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[.07] pb-6">
        <div><p className="text-xs text-[#8f9087]">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.05em]">{view}</h1><p className="mt-1 text-sm text-[#85867d]">A clear view of where your browsing time goes.</p></div>
        <div className="flex items-center gap-2 rounded-full border border-white/[.08] bg-[#191a17] px-3 py-2 text-xs text-[#aaa99f]"><span className="size-2 rounded-full bg-[#a9da7b]" />{status}</div>
      </header>
      <nav className="mt-4 flex gap-2 overflow-auto lg:hidden">{(['Overview', 'Activity', 'Websites', 'YouTube', 'Focus Sessions', 'Settings'] as View[]).map((item) => <button key={item} onClick={() => setView(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs ${view === item ? 'bg-[#252720] text-[#d8eab7]' : 'text-[#92938a]'}`}>{item}</button>)}</nav>
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
          <div className="mt-5"><Panel title="Daily browsing goal" subtitle={`${data.wellbeing.dailyGoalMinutes} minutes · ${todayProgress}% complete`}><div className="h-2 overflow-hidden rounded-full bg-[#252620]"><div className="h-full rounded-full bg-[#a9da7b]" style={{ width: `${todayProgress}%` }} /></div></Panel></div>
        </>}
        {view === 'Activity' && <div className="mt-7"><Timeline entries={data.timeline} detailed /></div>}
        {view === 'Websites' && <div className="mt-7"><WebsiteTable websites={data.websites} detailed /></div>}
        {view === 'YouTube' && <div className="mt-7 grid gap-5 xl:grid-cols-[1.2fr_1fr]"><YouTubeCard summary={data.youtubeSummary} videos={topVideos} detailed /><Panel title="Most watched channels" subtitle="Ranked by stored playing time">{topChannels.length ? <div className="divide-y divide-white/[.06]">{topChannels.map((channel) => <div key={channel.channelName} className="flex justify-between py-3 text-sm"><span className="truncate pr-3">{channel.channelName}</span><span className="text-[#aaa99f]">{duration(channel.durationMs)}</span></div>)}</div> : <Empty>No YouTube viewing records yet.</Empty>}</Panel></div>}
        {view === 'Focus Sessions' && <FocusSessionsView sessions={data.sessions} records={data.focusRecords} overrides={data.overrides} refresh={refresh} />}
        {view === 'Settings' && <SettingsView settings={data.wellbeing} refresh={refresh} />}
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

function FocusSessionsView({
  sessions, records, overrides, refresh,
}: { sessions: FocusSession[]; records: ActivityRecord[]; overrides: DomainOverride[]; refresh: () => Promise<void> }) {
  const [goal, setGoal] = useState('Focused work');
  const [minutes, setMinutes] = useState(25);
  const [message, setMessage] = useState('');
  const current = sessions.find((session) => session.status !== 'completed');
  const begin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await store.saveFocusSession(startFocusSession(goal, minutes, Date.now()));
      await browser.alarms.create(FOCUS_SESSION_END_ALARM, { when: Date.now() + minutes * 60_000 });
      setMessage('Focus session started.');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not start the focus session.'); }
  };
  const update = async (operation: 'pause' | 'resume' | 'end') => {
    if (!current) return;
    const now = Date.now();
    const next = operation === 'pause' ? pauseFocusSession(current, now) : operation === 'resume' ? resumeFocusSession(current, now) : endFocusSession(current, now);
    await store.saveFocusSession(next);
    if (operation === 'pause' || operation === 'end') await browser.alarms.clear(FOCUS_SESSION_END_ALARM);
    else await browser.alarms.create(FOCUS_SESSION_END_ALARM, {
      when: now + Math.max(1_000, current.targetMinutes * 60_000 - focusSessionElapsedMs(next, now)),
    });
    setMessage(operation === 'end' ? 'Focus session ended.' : operation === 'pause' ? 'Focus session paused.' : 'Focus session resumed.');
    await refresh();
  };
  return <div className="mt-7 space-y-5">
    <Panel title="Focus session" subtitle="Only active browser time inside the session is included in its summary">
      {current ? <div className="rounded-xl border border-[#a9da7b]/20 bg-[#20211d] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-medium">{current.goal}</p><p className="mt-1 text-xs text-[#85867d]">{current.targetMinutes} minute target · {current.status}</p></div><span className="text-xs text-[#a9da7b]">{duration(summarizeFocusSession(current, records, overrides).focusedMs)} tracked</span></div><div className="mt-4 flex gap-2">{current.status === 'active' ? <button onClick={() => void update('pause')} className="rounded-lg border border-white/[.1] px-3 py-2 text-xs">Pause</button> : <button onClick={() => void update('resume')} className="rounded-lg border border-white/[.1] px-3 py-2 text-xs">Resume</button>}<button onClick={() => void update('end')} className="rounded-lg bg-[#c9ee8e] px-3 py-2 text-xs font-semibold text-[#20251b]">End session</button></div></div> : <form onSubmit={(event) => void begin(event)} className="grid gap-3 sm:grid-cols-[1fr_150px_auto]"><label className="text-[10px] text-[#85867d]">What will you focus on?<input value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={120} required className="mt-1.5 w-full rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2.5 text-xs text-[#e2e0d7]" /></label><label className="text-[10px] text-[#85867d]">Target duration<select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2.5 text-xs text-[#e2e0d7]"><option value={25}>25 minutes</option><option value={50}>50 minutes</option><option value={90}>90 minutes</option><option value={120}>120 minutes</option></select></label><button type="submit" className="self-end rounded-lg bg-[#c9ee8e] px-4 py-2.5 text-xs font-semibold text-[#20251b]">Start focus</button></form>}
      {message && <p role="status" className="mt-3 text-xs text-[#b3d783]">{message}</p>}
    </Panel>
    <Panel title="Session history" subtitle="Productive and recreational time use your website classifications">{sessions.length ? <div className="divide-y divide-white/[.06]">{sessions.map((session) => { const summary = summarizeFocusSession(session, records, overrides); return <div key={session.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]"><div><p className="text-sm font-medium">{session.goal}</p><p className="mt-1 text-[10px] text-[#777870]">{new Date(session.startedAt).toLocaleString()} · {session.targetMinutes} min target · {session.status}</p></div><div className="flex gap-4 text-[10px] text-[#85867d]"><span>Focused <b className="ml-1 text-[#d8d6cc]">{duration(summary.focusedMs)}</b></span><span>Productive <b className="ml-1 text-[#b3d783]">{duration(summary.productiveMs)}</b></span><span>Recreational <b className="ml-1 text-[#e6b278]">{duration(summary.recreationalMs)}</b></span></div></div>; })}</div> : <Empty>No focus sessions yet. Start one when you are ready.</Empty>}</Panel>
  </div>;
}

function SettingsView({ settings, refresh }: { settings: WellbeingSettings; refresh: () => Promise<void> }) {
  const [excludedDraft, setExcludedDraft] = useState('');
  const [message, setMessage] = useState('');
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [aiKey, setAiKey] = useState('');
  const [aiKeyAvailable, setAiKeyAvailable] = useState(false);
  useEffect(() => {
    void Promise.all([loadAISettings(), loadAIAPIKey()]).then(([config, key]) => {
      setAiSettings(config);
      setAiKeyAvailable(Boolean(key));
    });
  }, []);
  const save = async (next: WellbeingSettings) => {
    try {
      const saved = await saveWellbeingSettings(next);
      await refresh();
      setMessage('Settings saved on this device.');
      return saved;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save settings.'); return null; }
  };
  const addExcluded = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await save({ ...settings, excludedDomains: [...settings.excludedDomains, excludedDraft] });
    if (saved && saved.excludedDomains.length > settings.excludedDomains.length) setExcludedDraft('');
    else if (saved) setMessage('Enter a valid, new website domain.');
  };
  const enableBreakReminders = async (checked: boolean) => {
    if (!checked) { await save({ ...settings, breakReminders: false }); return; }
    try {
      const granted = await browser.permissions.request({ permissions: ['notifications'] });
      if (!granted) { setMessage('Notification permission was not granted. Break reminders remain off.'); return; }
      await save({ ...settings, breakReminders: true });
    } catch { setMessage('Could not enable notification permission.'); }
  };
  const enableDistractionReminders = async (checked: boolean) => {
    if (!checked) { await save({ ...settings, distractionReminders: false }); return; }
    try {
      const granted = await browser.permissions.request({ permissions: ['notifications'] });
      if (!granted) { setMessage('Notification permission was not granted. Site check-ins remain off.'); return; }
      await save({ ...settings, distractionReminders: true });
    } catch { setMessage('Could not enable notification permission.'); }
  };
  const saveAIConfiguration = async (enable: boolean) => {
    try {
      if (!enable) {
        const savedSettings = await loadAISettings();
        const disabledSettings = await saveAISettings({ ...savedSettings, enabled: false });
        setAiSettings(disabledSettings);
        setAiKey('');
        setAiKeyAvailable(false);
        await browser.permissions.remove({ origins: [aiHostPermissionPattern(savedSettings.endpoint)] });
        setMessage('AI classification is off. Its API key was cleared from this browser session.');
        return;
      }
      const previousSettings = await loadAISettings();
      const previousOrigin = aiEndpointOrigin(previousSettings.endpoint);
      const origin = aiEndpointOrigin(aiSettings.endpoint);
      if (!aiSettings.model.trim()) throw new Error('Enter a model name.');
      const secret = aiKey.trim() || await loadAIAPIKey();
      if (!secret) throw new Error('Enter an API key. The key stays in this browser session.');
      const permitted = await browser.permissions.request({ origins: [aiHostPermissionPattern(aiSettings.endpoint)] });
      if (!permitted) throw new Error('Provider permission was not granted. AI remains off.');
      await saveAIAPIKey(secret);
      const saved = await saveAISettings({ ...aiSettings, enabled: true });
      if (previousOrigin !== origin) await browser.permissions.remove({ origins: [aiHostPermissionPattern(previousSettings.endpoint)] });
      setAiSettings(saved);
      setAiKey('');
      setAiKeyAvailable(true);
      setMessage('AI enabled. Classification runs only when you press Classify with AI.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save AI settings.'); }
  };
  const exportData = async () => {
    try {
      const [database, localSettings] = await Promise.all([store.exportData(), browser.storage.local.get(null)]);
      const file = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...database, settings: localSettings }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `focuslens-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage('Local activity export downloaded.');
    } catch { setMessage('Could not export local data.'); }
  };
  const deleteData = async () => {
    if (!window.confirm('Delete all FocusLens activity, YouTube records, sessions, and settings from this browser? This cannot be undone.')) return;
    try {
      const aiConfig = await loadAISettings();
      await browser.permissions.remove({ origins: [aiHostPermissionPattern(aiConfig.endpoint)] });
      await browser.permissions.remove({ permissions: ['notifications'] });
      await store.clearAllData();
      await Promise.all([browser.storage.local.clear(), browser.storage.session.clear()]);
      setMessage('All FocusLens data was deleted from this browser.');
      await refresh();
    } catch { setMessage('Could not delete all FocusLens data.'); }
  };
  return <div className="mt-7 grid gap-5 xl:grid-cols-2">
    <Panel title="Tracking and goals" subtitle="These settings apply across the extension">
      <div className="divide-y divide-white/[.06]">
        <label className="flex items-center justify-between gap-4 py-4"><span><b className="block text-xs font-medium">Pause tracking</b><small className="mt-1 block text-[10px] text-[#777870]">Stop new website and YouTube activity intervals</small></span><input type="checkbox" checked={settings.trackingPaused} onChange={(event) => void save({ ...settings, trackingPaused: event.target.checked })} className="accent-[#a9da7b]" /></label>
        <form onSubmit={(event) => { event.preventDefault(); void save({ ...settings, dailyGoalMinutes: Number(new FormData(event.currentTarget).get('dailyGoalMinutes')) }); }} className="flex items-center justify-between gap-4 py-4"><label htmlFor="dailyGoalMinutes"><b className="block text-xs font-medium">Daily browsing goal</b><small className="mt-1 block text-[10px] text-[#777870]">A personal target, not a productivity score</small></label><div className="flex items-center gap-2"><input name="dailyGoalMinutes" type="number" min="15" max="1440" defaultValue={settings.dailyGoalMinutes} className="w-20 rounded-lg border border-white/[.1] bg-[#111210] px-2 py-2 text-xs" /><button className="rounded-lg border border-white/[.1] px-2 py-2 text-[10px]">Save</button></div></form>
        <label className="flex items-center justify-between gap-4 py-4"><span><b className="block text-xs font-medium">Break reminders</b><small className="mt-1 block text-[10px] text-[#777870]">Optional notification during active browsing</small></span><input type="checkbox" checked={settings.breakReminders} onChange={(event) => void enableBreakReminders(event.target.checked)} className="accent-[#a9da7b]" /></label>
        {settings.breakReminders && <label className="flex items-center justify-between gap-4 py-3 text-xs text-[#aaa99f]">Remind every<select value={settings.breakReminderMinutes} onChange={(event) => void save({ ...settings, breakReminderMinutes: Number(event.target.value) })} className="rounded-lg border border-white/[.1] bg-[#111210] px-2 py-2 text-xs"><option value={20}>20 minutes</option><option value={30}>30 minutes</option><option value={50}>50 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option></select></label>}
        <label className="flex items-center justify-between gap-4 border-t border-white/[.06] py-4"><span><b className="block text-xs font-medium">Recreational-site check-ins</b><small className="mt-1 block text-[10px] text-[#777870]">Optional reminder based on your current site classifications</small></span><input type="checkbox" checked={settings.distractionReminders} onChange={(event) => void enableDistractionReminders(event.target.checked)} className="accent-[#a9da7b]" /></label>
        {settings.distractionReminders && <label className="flex items-center justify-between gap-4 py-3 text-xs text-[#aaa99f]">Remind after<select value={settings.distractionReminderMinutes} onChange={(event) => void save({ ...settings, distractionReminderMinutes: Number(event.target.value) })} className="rounded-lg border border-white/[.1] bg-[#111210] px-2 py-2 text-xs"><option value={10}>10 minutes</option><option value={20}>20 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option><option value={120}>120 minutes</option></select></label>}
      </div>
      <h3 className="mt-5 border-t border-white/[.06] pt-4 text-xs font-medium">Excluded domains</h3><p className="mt-1 text-[10px] text-[#777870]">These domains and their subdomains will not be tracked.</p>
      <form onSubmit={(event) => void addExcluded(event)} className="mt-3 flex gap-2"><input value={excludedDraft} onChange={(event) => setExcludedDraft(event.target.value)} placeholder="example.com" className="min-w-0 flex-1 rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2 text-xs" /><button className="rounded-lg border border-white/[.1] px-3 text-[10px]">Exclude</button></form>
      <div className="mt-2 space-y-1">{settings.excludedDomains.map((domain) => <div key={domain} className="flex justify-between py-1.5 text-xs text-[#aaa99f]">{domain}<button onClick={() => void save({ ...settings, excludedDomains: settings.excludedDomains.filter((item) => item !== domain) })} className="text-[#c9927e]">Remove</button></div>)}</div>
    </Panel>
    <Panel title="Your local data" subtitle="Export a copy or clear the data stored by FocusLens">
      <p className="text-xs leading-5 text-[#aaa99f]">FocusLens keeps website intervals, YouTube video metadata, focus sessions, and your rules on this device. Nothing is uploaded.</p>
      <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void exportData()} className="rounded-lg border border-white/[.1] px-3 py-2.5 text-xs">Export local data</button><button onClick={() => void deleteData()} className="rounded-lg border border-[#bd765d]/30 px-3 py-2.5 text-xs text-[#d79880]">Delete all FocusLens data</button></div>
      {message && <p role="status" className="mt-4 text-xs text-[#b3d783]">{message}</p>}
    </Panel>
    <div className="xl:col-span-2">
      <Panel title="Optional AI classification" subtitle="Disabled by default. You decide which provider receives a request.">
        <p className="rounded-xl border border-[#d8bd79]/20 bg-[#d8bd79]/[.05] p-3 text-[11px] leading-5 text-[#cfc6a1]">When enabled, AI is called only after you press <b>Classify with AI</b> on an unknown YouTube video. FocusLens sends that video's title, channel name, and Shorts status to the endpoint below. It does not send the video ID, URL, watch history, or learning goals. The provider's data handling policy applies. Your API key is kept in session storage and cleared when the browser closes.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-[10px] text-[#85867d]">OpenAI-compatible Responses API endpoint<input value={aiSettings.endpoint} onChange={(event) => setAiSettings((current) => ({ ...current, endpoint: event.target.value }))} placeholder="https://api.openai.com/v1/responses" className="mt-1.5 w-full rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2.5 text-xs text-[#e2e0d7]" /></label>
          <label className="text-[10px] text-[#85867d]">Model<input value={aiSettings.model} onChange={(event) => setAiSettings((current) => ({ ...current, model: event.target.value }))} placeholder="Your provider's model name" className="mt-1.5 w-full rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2.5 text-xs text-[#e2e0d7]" /></label>
          <label className="text-[10px] text-[#85867d] sm:col-span-2">API key<input type="password" autoComplete="off" value={aiKey} onChange={(event) => setAiKey(event.target.value)} placeholder={aiKeyAvailable ? 'Key is set for this browser session · enter to replace' : 'Enter key · not stored across browser restarts'} className="mt-1.5 w-full rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2.5 text-xs text-[#e2e0d7] placeholder:text-[#626159]" /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void saveAIConfiguration(true)} className="rounded-lg bg-[#c9ee8e] px-3 py-2.5 text-xs font-semibold text-[#20251b]">Enable AI and save</button>{aiSettings.enabled && <button onClick={() => void saveAIConfiguration(false)} className="rounded-lg border border-white/[.1] px-3 py-2.5 text-xs">Disable AI and clear key</button>}<span className="self-center text-[10px] text-[#777870]">{aiSettings.enabled ? aiKeyAvailable ? 'Enabled for manual requests' : 'Enabled · API key needs re-entry' : 'Off'}</span></div>
        {message && <p role="status" className="mt-3 text-xs text-[#b3d783]">{message}</p>}
      </Panel>
    </div>
  </div>;
}
