import { useEffect, useMemo, useRef, useState } from 'react';
import { activityHistoryStart, activityLevel, activityTooltip, buildActivityCalendar, buildActivityDays, calculateActivityStreaks, currentOpenActivity, dateFromKey, dateKey, formatActivityDuration, formatDayLabel, mergeActivityDays, normalizeActivityRecords, todayDateKey, trackingStatus, type ActivityDay, type ActivityWeek } from '../../src/analytics/activity';
import { buildWebsiteUsage, type WebsiteUsage } from '../../src/analytics/dashboard';
import { CATEGORY_DEFINITIONS, defaultProductivityFor, type ProductivityValue, type WebsiteCategory } from '../../src/classification/categories';
import { loadDomainOverrides, saveDomainOverride, type DomainOverride } from '../../src/classification/settings-store';
import { IndexedDbActivityStore } from '../../src/tracking/indexeddb-store';
import { localDayBounds } from '../../src/tracking/time';
import type { ActivityRecord, TrackerState } from '../../src/tracking/types';
import { DEFAULT_WELLBEING_SETTINGS, loadWellbeingSettings, saveWellbeingSettings } from '../../src/wellbeing/settings-store';
import type { WellbeingSettings } from '../../src/wellbeing/types';
import type { AISettings } from '../../src/ai/types';
import { AI_PROVIDER_ENDPOINTS, DEFAULT_AI_SETTINGS, aiHostPermissionPattern, loadAIAPIKey, loadAISettings, saveAIAPIKey, saveAISettings } from '../../src/ai/settings';
import { AI_PROVIDERS } from '../../src/ai/types';
import { AIWebsiteClassifier, type AIWebsiteClassification } from '../../src/ai/website-provider';
import { SimpleJevClassifier } from '../../src/ai/simple-jev';
import { fetchFromExtensionWorker } from '../../src/ai/extension-fetch';
import { isBrowserExtensionContext } from '../../src/tracking/extension-context';

type View = 'Overview' | 'Activity' | 'Websites' | 'Categories' | 'Settings';
type ActivityRange = 'today' | '7' | '30' | 'custom';

interface DashboardData {
  records: ActivityRecord[];
  days: ActivityDay[];
  streakDays: ActivityDay[];
  weeks: ActivityWeek[];
  websites: WebsiteUsage[];
  overrides: DomainOverride[];
  tracker: TrackerState | null;
  wellbeing: WellbeingSettings;
  loading: boolean;
  error: boolean;
}

const store = new IndexedDbActivityStore();
const emptyData: DashboardData = {
  records: [], days: [], streakDays: [], weeks: [], websites: [], overrides: [], tracker: null,
  wellbeing: DEFAULT_WELLBEING_SETTINGS, loading: true, error: false,
};
const DAY_MS = 24 * 60 * 60_000;

const duration = formatActivityDuration;

const HEATMAP_COLORS = ['bg-[#23251f]', 'bg-[#2f4a32]', 'bg-[#3f6b3c]', 'bg-[#5c9a4b]', 'bg-[#8ccb63]'] as const;
const HEATMAP_HOVERS = ['hover:bg-[#2f3129]', 'hover:bg-[#3b5c3d]', 'hover:bg-[#4d7f47]', 'hover:bg-[#6cb256]', 'hover:bg-[#9cde70]'] as const;
const HEATMAP_LEVEL_LABELS = ['No activity', 'Under 15 minutes', 'Under 1 hour', 'Under 3 hours', '3 hours or more'] as const;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const TOOLTIP_WIDTH = 232;

function heatmapCellClass(level: 0 | 1 | 2 | 3 | 4, selected: boolean): string {
  return `${HEATMAP_COLORS[level]} ${HEATMAP_HOVERS[level]} ${selected ? 'ring-1 ring-[#d8eab7]' : ''}`;
}

function clipRecordsToRange(records: readonly ActivityRecord[], start: number, end: number): ActivityRecord[] {
  return records.flatMap((record) => {
    const clippedStart = Math.max(start, record.startedAt);
    const clippedEnd = Math.min(end, record.endedAt);
    if (clippedEnd <= clippedStart) return [];
    const entries: ActivityRecord[] = [];
    let cursor = clippedStart;
    while (cursor < clippedEnd) {
      const dayEnd = localDayBounds(cursor).end;
      const segmentEnd = Math.min(clippedEnd, dayEnd);
      entries.push({ ...record, id: `${record.id}-${cursor}`, startedAt: cursor, endedAt: segmentEnd, durationMs: segmentEnd - cursor });
      cursor = segmentEnd;
    }
    return entries;
  }).toSorted((left, right) => right.startedAt - left.startedAt);
}



export default function App() {
  const extensionContext = isBrowserExtensionContext();
  const [view, setView] = useState<View>('Overview');
  const [data, setData] = useState<DashboardData>(emptyData);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activityRange, setActivityRange] = useState<ActivityRange>('today');
  const [siteSort, setSiteSort] = useState<'most' | 'least' | 'alphabetical'>('most');
  const recordsCache = useRef<ActivityRecord[] | null>(null);
  const streakDaysCache = useRef<ActivityDay[] | null>(null);

  useEffect(() => {
    if (!extensionContext) {
      setData((current) => ({ ...current, loading: false, error: true }));
      return;
    }
    let mounted = true;
    const refresh = async () => {
      try {
        const now = Date.now();
        const historyStart = activityHistoryStart(now);
        const recentStart = Math.max(historyStart - DAY_MS, localDayBounds(now - 2 * DAY_MS).start);
        const [state, overrides, wellbeing, recentRecords] = await Promise.all([
          store.readState(), loadDomainOverrides(), loadWellbeingSettings(), store.listRecords(recentStart, now + 1),
        ]);
        const storedRecords = recordsCache.current === null
          ? await store.listRecords(historyStart - DAY_MS, now + 1)
          : [...new Map([...recordsCache.current, ...recentRecords].map((record) => [record.id, record])).values()];
        const normalizedStored = normalizeActivityRecords(storedRecords, historyStart, now + 1);
        if (mounted) recordsCache.current = normalizedStored;
        const open = currentOpenActivity(state, now, wellbeing.trackingPaused);
        const records = normalizeActivityRecords(open ? [...normalizedStored, open] : normalizedStored, historyStart, now + 1);
        const days = buildActivityDays(records, historyStart, now + 1);
        let allTimeDays = streakDaysCache.current;
        if (!allTimeDays) {
          // The longest streak is all-time, so read the full activity store once per dashboard session.
          const allRecords = await store.listRecords(0, now + 1);
          const firstStart = allRecords.length ? localDayBounds(allRecords[0]!.startedAt).start : historyStart;
          allTimeDays = buildActivityDays(normalizeActivityRecords(allRecords, firstStart, now + 1), firstStart, now + 1);
          if (mounted) streakDaysCache.current = allTimeDays;
        }
        if (mounted) setData({
          records,
          days,
          streakDays: mergeActivityDays(allTimeDays, days),
          weeks: buildActivityCalendar(days, now),
          websites: buildWebsiteUsage(records, overrides),
          overrides,
          tracker: state,
          wellbeing,
          loading: false,
          error: false,
        });
      } catch {
        if (mounted) setData((current) => ({ ...current, loading: false, error: true }));
      }
    };
    void refresh();
    const onUpdate = (message: unknown) => {
      if (message && typeof message === 'object' && 'type' in message &&
        (message.type === 'focuslens-activity-updated' || message.type === 'focuslens-analytics-updated')) void refresh();
    };
    browser.runtime.onMessage.addListener(onUpdate);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { mounted = false; window.clearInterval(timer); browser.runtime.onMessage.removeListener(onUpdate); };
  }, [extensionContext, refreshNonce]);

  const now = Date.now();
  const todayKeyValue = todayDateKey(now);
  const today = data.days.find((day) => day.dateKey === todayKeyValue) ?? null;
  const streaks = calculateActivityStreaks(data.streakDays, now, data.wellbeing.minimumActiveDayMinutes * 60_000);
  const todayRecords = clipRecordsToRange(data.records, localDayBounds(now).start, now + 1);
  const todaySites = buildWebsiteUsage(todayRecords, data.overrides);
  const todayMostVisited = todaySites[0];
  const selectedBounds = selectedDate ? localDayBounds(dateFromKey(selectedDate)) : null;
  const selectedRecords = selectedBounds ? clipRecordsToRange(data.records, selectedBounds.start, selectedBounds.end) : [];
  const selectedSites = buildWebsiteUsage(selectedRecords, data.overrides);
  const selectedTotalMs = selectedRecords.reduce((total, record) => total + record.durationMs, 0);

  const visibleActivity = useMemo(() => {
    const current = Date.now();
    if (activityRange === 'custom') {
      const start = localDayBounds(dateFromKey(selectedDate ?? todayDateKey(current))).start;
      return clipRecordsToRange(data.records, start, localDayBounds(start).end);
    }
    const days = activityRange === 'today' ? 1 : Number(activityRange);
    const startDate = new Date(localDayBounds(current).start);
    startDate.setDate(startDate.getDate() - (days - 1));
    return clipRecordsToRange(data.records, startDate.getTime(), current + 1);
  }, [activityRange, data.records, selectedDate]);

  const sortedSites = useMemo(() => [...data.websites].toSorted((left, right) => {
    if (siteSort === 'least') return left.durationMs - right.durationMs;
    if (siteSort === 'alphabetical') return left.domain.localeCompare(right.domain);
    return right.durationMs - left.durationMs;
  }), [data.websites, siteSort]);

  const refresh = () => setRefreshNonce((value) => value + 1);
  const chooseDay = (day: ActivityDay) => setSelectedDate(day.dateKey);

  if (!extensionContext) return <main className="grid min-h-screen place-items-center bg-[#111210] px-6 text-[#f2f0e9]"><section className="max-w-md rounded-2xl border border-white/[.08] bg-[#191a17] p-6"><h1 className="text-lg font-semibold">Open FocusLens in your browser</h1><p className="mt-2 text-sm leading-6 text-[#aaa99f]">The dashboard needs the FocusLens extension to read activity saved in this browser profile.</p></section></main>;

  const status = trackingStatus(data.tracker, data.wellbeing.trackingPaused);
  return <div className="min-h-screen bg-[#111210] text-[#f2f0e9]">
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-white/[0.07] bg-[#151613] px-5 py-6 lg:block">
      <Brand />
      <p className="mt-12 px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-[#696a62]">Your activity</p>
      <Navigation view={view} setView={setView} vertical />
      <div className="absolute bottom-6 left-5 right-5 rounded-xl border border-white/[.07] bg-[#191a17] p-3"><p className="text-xs font-medium">Stored on this device</p><p className="mt-1 text-[10px] leading-4 text-[#777870]">Browsing activity stays in this browser profile.</p></div>
    </aside>
    <main className="mx-auto max-w-7xl px-5 py-7 lg:ml-60 lg:px-10 lg:py-9">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[.07] pb-6">
        <div><p className="text-xs text-[#8f9087]">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.05em]">{view}</h1><p className="mt-1 text-sm text-[#85867d]">See where your browsing time goes.</p></div>
        <div className="flex items-center gap-2 rounded-full border border-white/[.08] bg-[#191a17] px-3 py-2 text-xs text-[#aaa99f]"><span className={`size-2 rounded-full ${status === 'Tracking active tab' ? 'bg-[#a9da7b]' : 'bg-[#777870]'}`} />{status}</div>
      </header>
      <Navigation view={view} setView={setView} />
      {status === 'No website tab to track' && <p className="mt-4 text-[11px] text-[#777870]">FocusLens records regular website tabs. Extension pages and browser settings are skipped; past activity remains available below.</p>}
      {data.error && <div role="alert" className="mt-5 rounded-xl border border-[#bd765d]/30 bg-[#bd765d]/10 p-4 text-sm text-[#e4ac97]">Could not read local activity. Try reloading the dashboard.</div>}
      {data.loading ? <div className="py-20 text-center text-sm text-[#777870]">Loading your activity…</div> : <>
        {view === 'Overview' && <div className="mt-6 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Today" value={duration(today?.durationMs ?? 0)} note="Active browsing time" />
            <Metric label="Websites today" value={String(today?.websites.length ?? 0)} note="Distinct domains" />
            <Metric label="Most visited today" value={todayMostVisited?.domain ?? '—'} note={todayMostVisited ? duration(todayMostVisited.durationMs) : 'No activity yet'} />
            <Metric label="Current streak" value={`${streaks.current} ${streaks.current === 1 ? 'day' : 'days'}`} note={`Longest ${streaks.longest}d · all recorded history · ${data.wellbeing.minimumActiveDayMinutes}m minimum`} />
          </div>
          <ActivityHeatmap weeks={data.weeks} selectedDate={selectedDate} todayKey={todayKeyValue} onSelect={chooseDay} />
          {selectedDate && <SelectedDay date={selectedDate} records={selectedRecords} websites={selectedSites} totalMs={selectedTotalMs} onShowToday={() => setSelectedDate(todayKeyValue)} onClose={() => setSelectedDate(null)} />}
          <WebsiteList websites={data.websites.slice(0, 8)} />
        </div>}
        {view === 'Activity' && <ActivityView records={visibleActivity} range={activityRange} selectedDate={selectedDate} setRange={setActivityRange} setSelectedDate={setSelectedDate} />}
        {view === 'Websites' && <WebsitesView websites={sortedSites} sort={siteSort} setSort={setSiteSort} overrides={data.overrides} onSave={async (domain, category, productivity) => { await saveDomainOverride({ domain, category, productivity }); refresh(); }} />}
        {view === 'Categories' && <CategoriesView websites={data.websites} />}
        {view === 'Settings' && <SettingsView settings={data.wellbeing} refresh={refresh} clearCachedActivity={() => { recordsCache.current = null; streakDaysCache.current = null; refresh(); }} />}
      </>}
      <footer className="mt-10 border-t border-white/[.07] py-5 text-center text-[10px] text-[#67685f]">Daily totals count foreground browsing once and use your local calendar day.</footer>
    </main>
  </div>;
}

function Brand() {
  return <div className="flex items-center gap-3"><span className="brand-mark grid size-9 place-items-center rounded-xl font-bold">F</span><div><p className="font-semibold tracking-tight">FocusLens</p><p className="text-[10px] tracking-[.16em] text-[#777870]">YOUR BROWSING, SIMPLIFIED</p></div></div>;
}

function Navigation({ view, setView, vertical = false }: { view: View; setView: (view: View) => void; vertical?: boolean }) {
  const items: View[] = ['Overview', 'Activity', 'Websites', 'Categories', 'Settings'];
  return <nav className={`${vertical ? 'mt-3 space-y-1' : 'mt-4 flex gap-2 overflow-auto lg:hidden'}`} aria-label="Main navigation">
    {items.map((item) => <button key={item} type="button" onClick={() => setView(item)} aria-current={view === item ? 'page' : undefined}
      className={`${vertical ? 'flex w-full items-center gap-3 text-left' : 'shrink-0'} rounded-lg px-3 py-2.5 text-sm ${view === item ? 'bg-[#252720] text-[#d8eab7]' : 'text-[#92938a] hover:bg-white/[.03]'}`}>{item}</button>)}
  </nav>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <section className="min-w-0 rounded-xl border border-white/[.07] bg-[#191a17] p-4"><p className="text-[11px] text-[#85867d]">{label}</p><p className="mt-3 truncate text-2xl font-semibold tracking-[-.04em] tabular-nums text-[#e7e6df]">{value}</p><p className="mt-1.5 truncate text-[10px] text-[#6f7068]">{note}</p></section>;
}

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-white/[.07] bg-[#191a17] p-5 ${className}`}><header className="mb-4"><h2 className="text-sm font-medium">{title}</h2>{subtitle && <p className="mt-1 text-[10px] text-[#777870]">{subtitle}</p>}</header>{children}</section>;
}

function ActivityHeatmap({ weeks, selectedDate, todayKey, onSelect }: { weeks: ActivityWeek[]; selectedDate: string | null; todayKey: string; onSelect: (day: ActivityDay) => void }) {
  const [hovered, setHovered] = useState<{ day: ActivityDay; x: number; y: number } | null>(null);
  const columns = Math.max(weeks.length, 1);
  const todayDate = dateFromKey(todayKey);
  const showTooltip = (day: ActivityDay, x: number, y: number) => setHovered({ day, x, y });

  return <Panel title="Browsing activity" subtitle="Past 12 months · hover a day for details · select a day to inspect it">
    <div onMouseLeave={() => setHovered(null)}>
      <div className="overflow-x-auto pb-2" role="group" aria-label="Browsing activity calendar">
        <div className="grid gap-x-1 gap-y-1" style={{ minWidth: Math.max(660, 42 + columns * 11), gridTemplateColumns: `30px repeat(${columns}, minmax(9px, 1fr))` }}>
          <span aria-hidden="true" />
          {weeks.map((week, index) => <span key={`month-${index}`} data-month-label={week.monthLabel ?? undefined} className="h-4 min-w-0 whitespace-nowrap text-[9px] leading-4 text-[#85867d]">{week.monthLabel}</span>)}
          {WEEKDAY_LABELS.map((label, dayIndex) => <HeatmapRow key={label} label={label} dayIndex={dayIndex} weeks={weeks} selectedDate={selectedDate} todayDate={todayDate} onSelect={onSelect} onHover={showTooltip} onHoverEnd={() => setHovered(null)} />)}
        </div>
      </div>
      {hovered && <HeatmapTooltip day={hovered.day} x={hovered.x} y={hovered.y} />}
    </div>
    <div className="mt-3 flex items-center justify-between gap-3 text-[9px] text-[#777870]">
      <span>Less activity</span>
      <span className="flex items-center gap-1" aria-label="Activity intensity scale">
        {HEATMAP_COLORS.map((color, level) => <i key={color} className={`size-2.5 rounded-[3px] ${color}`} title={HEATMAP_LEVEL_LABELS[level]} />)}
      </span>
      <span>More</span>
    </div>
  </Panel>;
}

function HeatmapRow({ label, dayIndex, weeks, selectedDate, todayDate, onSelect, onHover, onHoverEnd }: {
  label: string; dayIndex: number; weeks: ActivityWeek[]; selectedDate: string | null; todayDate: number;
  onSelect: (day: ActivityDay) => void; onHover: (day: ActivityDay, x: number, y: number) => void; onHoverEnd: () => void;
}) {
  return <>
    <span className={`pr-1 text-right text-[9px] leading-[10px] text-[#777870] ${dayIndex % 2 === 1 ? 'invisible sm:visible' : ''}`}>{label}</span>
    {weeks.map((week, index) => {
      const day = week.days[dayIndex]!;
      const isFuture = day.date > todayDate;
      const isSelected = selectedDate === day.dateKey;
      const isToday = day.dateKey === dateKey(todayDate);
      return <button key={`${label}-${index}`} type="button" disabled={isFuture} aria-label={activityTooltip(day)}
        aria-pressed={isSelected} onClick={() => onSelect(day)}
        onMouseEnter={(event) => onHover(day, event.clientX, event.clientY)}
        onFocus={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onHover(day, rect.left + rect.width / 2, rect.top); }}
        onBlur={onHoverEnd}
        className={`aspect-square w-full rounded-[3px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-white disabled:cursor-default disabled:opacity-25 ${heatmapCellClass(activityLevel(day.durationMs), isSelected)} ${isToday && !isSelected ? 'ring-1 ring-white/25' : ''}`} />;
    })}
  </>;
}

function HeatmapTooltip({ day, x, y }: { day: ActivityDay; x: number; y: number }) {
  const left = Math.max(8, Math.min(x - TOOLTIP_WIDTH / 2, window.innerWidth - TOOLTIP_WIDTH - 8));
  const placeAbove = y > window.innerHeight * 0.62;
  return <div role="tooltip" className="pointer-events-none fixed z-50 rounded-lg border border-white/[.12] bg-[#23241f] px-3 py-2.5 text-[#e7e6df] shadow-xl" style={{ left, top: placeAbove ? y - 12 : y + 18, width: TOOLTIP_WIDTH, transform: placeAbove ? 'translateY(-100%)' : undefined }}>
    <p className="text-[11px] font-medium">{formatDayLabel(day.date)}</p>
    <dl className="mt-2 space-y-1 text-[10px]">
      <div className="flex justify-between gap-3"><dt className="text-[#92938a]">Active browsing</dt><dd className="tabular-nums">{formatActivityDuration(day.durationMs)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-[#92938a]">Websites visited</dt><dd className="tabular-nums">{day.websites.length}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-[#92938a]">Activity intervals</dt><dd className="tabular-nums">{day.recordCount}</dd></div>
    </dl>
  </div>;
}

function SelectedDay({ date, records, websites, totalMs, onShowToday, onClose }: { date: string; records: ActivityRecord[]; websites: WebsiteUsage[]; totalMs: number; onShowToday: () => void; onClose: () => void }) {
  return <Panel title={formatDayLabel(dateFromKey(date))} subtitle="Your local calendar day">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-2xl font-semibold tracking-[-.03em] tabular-nums">{formatActivityDuration(totalMs)}</p>
        <p className="text-[10px] text-[#777870]">{websites.length} {websites.length === 1 ? 'website' : 'websites'} · {records.length} {records.length === 1 ? 'interval' : 'intervals'}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onShowToday} className="rounded-lg border border-white/[.1] px-2.5 py-1.5 text-[10px] text-[#c9ee8e] hover:bg-white/[.04]">Today</button>
        <button type="button" onClick={onClose} className="rounded-lg border border-white/[.1] px-2.5 py-1.5 text-[10px] text-[#aaa99f] hover:bg-white/[.04]">Close</button>
      </div>
    </div>
    {records.length === 0 ? <Empty>No browsing recorded on this day.</Empty> : <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#777870]">Websites</h3>
        <div className="divide-y divide-white/[.06]">{websites.map((site) => <div key={site.domain} className="flex items-center gap-3 py-2"><p className="min-w-0 flex-1 truncate text-xs">{site.domain}</p><span className="text-[10px] text-[#777870]">{site.category}</span><span className="w-16 text-right text-xs tabular-nums text-[#aaa99f]">{formatActivityDuration(site.durationMs)}</span></div>)}</div>
      </div>
      <div>
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#777870]">Intervals</h3>
        <div className="max-h-60 divide-y divide-white/[.06] overflow-y-auto">{records.map((entry) => <div key={entry.id} className="flex items-center gap-3 py-2"><span className="w-16 shrink-0 text-[10px] tabular-nums text-[#777870]">{new Date(entry.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span><p className="min-w-0 flex-1 truncate text-xs">{entry.domain}</p><span className="text-xs tabular-nums text-[#aaa99f]">{formatActivityDuration(entry.durationMs)}</span></div>)}</div>
      </div>
    </div>}
  </Panel>;
}

function WebsiteList({ websites }: { websites: WebsiteUsage[] }) {
  return <Panel title="Websites" subtitle="Total active time · past 12 months">
    {websites.length ? <div className="divide-y divide-white/[.06]">{websites.map((site, index) => <WebsiteSummaryRow key={site.domain} site={site} index={index} />)}</div> : <Empty>No website activity recorded yet. Visited websites will appear here.</Empty>}
  </Panel>;
}

function WebsiteSummaryRow({ site, index }: { site: WebsiteUsage; index: number }) {
  return <div className="flex items-center gap-3 py-3"><span className="w-5 text-[10px] text-[#686960]">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{site.domain}</p><p className="mt-1 text-[10px] text-[#777870]">{site.category}</p></div><span className="shrink-0 text-xs tabular-nums text-[#aaa99f]">{duration(site.durationMs)}</span></div>;
}

function ActivityView({ records, range, selectedDate, setRange, setSelectedDate }: { records: ActivityRecord[]; range: ActivityRange; selectedDate: string | null; setRange: (range: ActivityRange) => void; setSelectedDate: (date: string) => void }) {
  const byDate = new Map<string, ActivityRecord[]>();
  for (const record of records) {
    const date = new Date(record.startedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    byDate.set(key, [...(byDate.get(key) ?? []), record]);
  }
  const groups = [...byDate.entries()].toSorted((left, right) => right[0].localeCompare(left[0]));
  return <div className="mt-6">
    <Panel title="Activity timeline" subtitle="Foreground website intervals grouped by your local date">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {([['today', 'Today'], ['7', '7 days'], ['30', '30 days'], ['custom', 'Choose date']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setRange(value)} aria-pressed={range === value} className={`rounded-lg px-3 py-2 text-[11px] ${range === value ? 'bg-[#c9ee8e] font-medium text-[#20251b]' : 'border border-white/[.1] text-[#aaa99f] hover:bg-white/[.04]'}`}>{label}</button>)}
        {range === 'custom' && <input type="date" value={selectedDate ?? todayDateKey(Date.now())} min={todayDateKey(activityHistoryStart(Date.now()))} max={todayDateKey(Date.now())} onChange={(event) => setSelectedDate(event.target.value)} aria-label="Choose activity date" className="rounded-lg border border-white/[.1] bg-[#111210] px-2.5 py-2 text-[11px] text-[#d8d6cc]" />}
      </div>
      {groups.length ? <div className="space-y-6">{groups.map(([date, entries]) => <section key={date}><h3 className="mb-2 text-xs font-medium text-[#c9ee8e]">{formatDayLabel(dateFromKey(date))}</h3><div className="divide-y divide-white/[.06]">{entries.map((entry) => <div key={entry.id} className="flex items-center gap-3 py-2.5"><span className="w-16 shrink-0 text-[10px] tabular-nums text-[#777870]">{new Date(entry.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span><span className="size-1.5 shrink-0 rounded-full bg-[#a9da7b]" /><p className="min-w-0 flex-1 truncate text-xs">{entry.domain}</p><span className="shrink-0 text-xs tabular-nums text-[#aaa99f]">{duration(entry.durationMs)}</span></div>)}</div></section>)}</div> : <Empty>No browsing activity for this date range.</Empty>}
    </Panel>
  </div>;
}

function WebsitesView({ websites, sort, setSort, overrides, onSave }: { websites: WebsiteUsage[]; sort: 'most' | 'least' | 'alphabetical'; setSort: (sort: 'most' | 'least' | 'alphabetical') => void; overrides: DomainOverride[]; onSave: (domain: string, category: WebsiteCategory, productivity: ProductivityValue) => Promise<void> }) {
  return <div className="mt-6"><Panel title="Websites" subtitle="Active time and category · past 12 months">
    <div className="mb-4 flex items-center justify-between gap-3"><span className="text-[10px] text-[#777870]">{websites.length} domains</span><select aria-label="Sort websites" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-lg border border-white/[.1] bg-[#111210] px-2.5 py-2 text-[10px] text-[#d8d6cc]"><option value="most">Most time</option><option value="least">Least time</option><option value="alphabetical">A to Z</option></select></div>
    {websites.length ? <div className="divide-y divide-white/[.06]">{websites.map((site) => <WebsiteEditor key={site.domain} site={site} override={overrides.find((item) => item.domain === site.domain)} onSave={onSave} />)}</div> : <Empty>Websites will appear after FocusLens records browsing activity.</Empty>}
  </Panel></div>;
}

function CategoriesView({ websites }: { websites: WebsiteUsage[] }) {
  const totals = new Map<WebsiteCategory, { durationMs: number; sites: number }>();
  for (const site of websites) {
    const current = totals.get(site.category) ?? { durationMs: 0, sites: 0 };
    totals.set(site.category, { durationMs: current.durationMs + site.durationMs, sites: current.sites + 1 });
  }
  const rows = CATEGORY_DEFINITIONS.map(({ name }) => ({ name, ...(totals.get(name) ?? { durationMs: 0, sites: 0 }) })).filter((row) => row.sites > 0).toSorted((a, b) => b.durationMs - a.durationMs);
  const total = rows.reduce((sum, row) => sum + row.durationMs, 0);
  return <div className="mt-6"><Panel title="Categories" subtitle="Browsing time grouped by category · past 12 months">
    {rows.length ? <div className="space-y-4">{rows.map((row) => <div key={row.name}><div className="mb-1 flex justify-between gap-3 text-xs"><span>{row.name} <span className="text-[#777870]">· {row.sites} {row.sites === 1 ? 'site' : 'sites'}</span></span><span className="tabular-nums text-[#c9ee8e]">{duration(row.durationMs)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-[#a9da7b]" style={{ width: `${Math.max(2, row.durationMs / total * 100)}%` }} /></div></div>)}</div> : <Empty>Categories will appear after FocusLens records browsing activity.</Empty>}
  </Panel></div>;
}

function WebsiteEditor({ site, override, onSave }: { site: WebsiteUsage; override?: DomainOverride; onSave: (domain: string, category: WebsiteCategory, productivity: ProductivityValue) => Promise<void> }) {
  const [category, setCategory] = useState(site.category);
  const [productivity, setProductivity] = useState(site.productivity);
  const [suggestion, setSuggestion] = useState<AIWebsiteClassification | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCategory(site.category); setProductivity(site.productivity); }, [site.category, site.productivity]);

  const save = async (nextCategory = category, nextProductivity = productivity) => {
    setBusy(true);
    try { await onSave(site.domain, nextCategory, nextProductivity); setMessage('Saved'); setSuggestion(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the category.'); }
    finally { setBusy(false); }
  };
  const requestSuggestion = async () => {
    setBusy(true);
    setMessage('Starting category suggestion…');
    setSuggestion(null);
    try {
      const settings = await loadAISettings();
      if (!settings.enabled) throw new Error('Enable Simple Jev in Settings first.');
      const hasHostAccess = await browser.permissions.contains({ origins: [aiHostPermissionPattern(settings.endpoint)] });
      if (!hasHostAccess) throw new Error('FocusLens does not have access to the Simple Jev host. Open Settings, select Enable and save, and allow host access.');
      const result = settings.provider === 'jev'
        ? await new SimpleJevClassifier(settings, fetchFromExtensionWorker).classifyWebsite(site.domain)
        : await classifyWithConfiguredProvider(settings, site.domain);
      setSuggestion(result);
      setMessage('Review the suggestion before saving.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not classify this website.'); }
    finally { setBusy(false); }
  };
  const saveSuggestion = () => suggestion && void save(suggestion.category, defaultProductivityFor(suggestion.category));
  const updateCategory = (next: WebsiteCategory) => { setCategory(next); setProductivity(next === 'Unknown' ? 'unknown' : defaultProductivityFor(next)); };

  return <div className="grid gap-3 py-4 sm:grid-cols-[minmax(150px,1fr)_130px_100px_auto] sm:items-center">
    <div className="min-w-0"><p className="truncate text-xs font-medium">{site.domain}</p><p className="mt-1 text-[10px] text-[#777870]">{override ? 'Your category' : 'Suggested default'}</p></div>
    <select aria-label={`Category for ${site.domain}`} value={category} onChange={(event) => updateCategory(event.target.value as WebsiteCategory)} className="rounded-lg border border-white/[.1] bg-[#111210] px-2 py-2 text-[10px] text-[#d8d6cc]">{CATEGORY_DEFINITIONS.map(({ name }) => <option key={name} value={name}>{name}</option>)}</select>
    <span className="text-xs tabular-nums text-[#aaa99f]">{duration(site.durationMs)}</span>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void save()} disabled={busy || (category === site.category && productivity === site.productivity)} className="rounded-lg border border-white/[.1] px-2.5 py-2 text-[10px] disabled:opacity-40">Save</button>
      {site.category === 'Unknown' && !suggestion && <button type="button" onClick={() => void requestSuggestion()} disabled={busy} className="rounded-lg border border-[#c9ee8e]/20 px-2.5 py-2 text-[10px] text-[#c9ee8e] disabled:opacity-50">{busy ? 'Checking…' : 'Suggest'}</button>}
      {suggestion && <button type="button" onClick={saveSuggestion} disabled={busy} className="rounded-lg bg-[#c9ee8e] px-2.5 py-2 text-[10px] font-medium text-[#20251b]">Use {suggestion.category} · {Math.round(suggestion.confidence * 100)}%</button>}
    </div>
    {(message || suggestion) && <p role="status" aria-live="polite" className={`text-[10px] sm:col-span-4 ${message.startsWith('Could not') || message.startsWith('Enable ') ? 'text-[#e4ac97]' : 'text-[#b3d783]'}`}>{message}{suggestion ? ` ${suggestion.reason}` : ''}</p>}
  </div>;
}

async function classifyWithConfiguredProvider(settings: AISettings, domain: string): Promise<AIWebsiteClassification> {
  const key = await loadAIAPIKey();
  if (!key) throw new Error('Add the provider key in Settings first.');
  return new AIWebsiteClassifier(settings, key).classify(domain);
}

function SettingsView({ settings, refresh, clearCachedActivity }: { settings: WellbeingSettings; refresh: () => void; clearCachedActivity: () => void }) {
  const [excludedDraft, setExcludedDraft] = useState('');
  const [message, setMessage] = useState('');
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [aiKey, setAiKey] = useState('');
  const [keyAvailable, setKeyAvailable] = useState(false);
  useEffect(() => { void Promise.all([loadAISettings(), loadAIAPIKey()]).then(([config, key]) => { setAiSettings(config); setKeyAvailable(Boolean(key)); }); }, []);

  const save = async (next: WellbeingSettings) => {
    try { await saveWellbeingSettings(next); setMessage('Saved on this device.'); refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save settings.'); }
  };
  const addExcluded = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = await saveWellbeingSettings({ ...settings, excludedDomains: [...settings.excludedDomains, excludedDraft] });
    if (next.excludedDomains.length > settings.excludedDomains.length) { setExcludedDraft(''); setMessage('Excluded domain saved.'); refresh(); }
    else setMessage('Enter a valid, new website domain.');
  };
  const configureAI = async (enabled: boolean) => {
    try {
      const previous = await loadAISettings();
      if (!enabled) {
        const saved = await saveAISettings({ ...previous, enabled: false });
        await browser.permissions.remove({ origins: [aiHostPermissionPattern(previous.endpoint)] });
        setAiSettings(saved); setKeyAvailable(false); setMessage('Category suggestions are off.'); return;
      }
      const secret = aiSettings.provider === 'jev' ? null : aiKey.trim() || (previous.provider === aiSettings.provider ? await loadAIAPIKey() : null);
      if (aiSettings.provider !== 'jev' && !secret) throw new Error('Enter the provider API key.');
      const permitted = await browser.permissions.request({ origins: [aiHostPermissionPattern(aiSettings.endpoint)] });
      if (!permitted) throw new Error('Provider permission was not granted.');
      if (secret) await saveAIAPIKey(secret);
      const saved = await saveAISettings({ ...aiSettings, enabled: true });
      setAiSettings(saved); setAiKey(''); setKeyAvailable(Boolean(secret));
      setMessage('Category suggestions enabled. They run only when you request one.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save classifier settings.'); }
  };
  const exportData = async () => {
    try {
      const [database, localSettings] = await Promise.all([store.exportData(), browser.storage.local.get(null)]);
      const file = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...database, settings: localSettings }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a'); link.href = url; link.download = `focuslens-export-${todayDateKey(Date.now())}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage('Activity export downloaded.');
    } catch { setMessage('Could not export local data.'); }
  };
  const deleteData = async () => {
    if (!window.confirm('Delete all FocusLens activity, categories, and settings from this browser? This cannot be undone.')) return;
    try {
      const ai = await loadAISettings();
      await browser.permissions.remove({ origins: [aiHostPermissionPattern(ai.endpoint)] });
      await store.clearAllData();
      await Promise.all([browser.storage.local.clear(), browser.storage.session.clear()]);
      setMessage('All FocusLens data was deleted.'); clearCachedActivity();
    } catch { setMessage('Could not delete all local data.'); }
  };

  return <div className="mt-6 grid gap-4 xl:grid-cols-2">
    <Panel title="Tracking" subtitle="Choose what FocusLens counts as an active day.">
      <label className="flex items-center justify-between gap-4 border-b border-white/[.06] py-3"><span><b className="block text-xs font-medium">Pause tracking</b><small className="mt-1 block text-[10px] text-[#777870]">Stop recording new website activity.</small></span><input type="checkbox" checked={settings.trackingPaused} onChange={(event) => void save({ ...settings, trackingPaused: event.target.checked })} className="accent-[#a9da7b]" /></label>
      <form onSubmit={(event) => { event.preventDefault(); void save({ ...settings, minimumActiveDayMinutes: Number(new FormData(event.currentTarget).get('minimumActiveDayMinutes')) }); }} className="flex items-center justify-between gap-4 border-b border-white/[.06] py-3"><label htmlFor="minimumActiveDayMinutes"><b className="block text-xs font-medium">Minimum for an active day</b><small className="mt-1 block text-[10px] text-[#777870]">Used to calculate your activity streak.</small></label><div className="flex items-center gap-2"><input id="minimumActiveDayMinutes" name="minimumActiveDayMinutes" type="number" min="1" max="60" defaultValue={settings.minimumActiveDayMinutes} className="w-16 rounded-lg border border-white/[.1] bg-[#111210] px-2 py-2 text-xs" /><span className="text-[10px] text-[#777870]">min</span><button className="rounded-lg border border-white/[.1] px-2 py-2 text-[10px]">Save</button></div></form>
      <form onSubmit={(event) => void addExcluded(event)} className="mt-4 flex gap-2"><input value={excludedDraft} onChange={(event) => setExcludedDraft(event.target.value)} placeholder="Exclude a domain" aria-label="Domain to exclude" className="min-w-0 flex-1 rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2 text-xs" /><button className="rounded-lg border border-white/[.1] px-3 py-2 text-[10px]">Add</button></form>
      {settings.excludedDomains.length > 0 && <div className="mt-3 divide-y divide-white/[.06]">{settings.excludedDomains.map((domain) => <div key={domain} className="flex items-center justify-between py-2 text-xs text-[#aaa99f]">{domain}<button type="button" onClick={() => void save({ ...settings, excludedDomains: settings.excludedDomains.filter((item) => item !== domain) })} className="text-[10px] text-[#c9ee8e]">Remove</button></div>)}</div>}
      <p className="mt-4 text-[10px] text-[#777870]">Change a website’s category from the Websites page. YouTube activity continues to count under youtube.com.</p>
    </Panel>
    <Panel title="Optional Simple Jev suggestions" subtitle="Suggestions are manual and never change a category until you accept it.">
      <p className="mb-4 text-[10px] leading-5 text-[#aaa99f]">The hosted Featherless demo is the default and requires an internet connection. It does not need an API key. Only the hostname you choose is sent. The demo is rate limited; wait and retry manually.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[10px] text-[#85867d]">Provider<select value={aiSettings.provider} onChange={(event) => { const provider = event.target.value as AISettings['provider']; setAiSettings((current) => ({ ...current, provider, endpoint: AI_PROVIDER_ENDPOINTS[provider], model: provider === 'jev' ? DEFAULT_AI_SETTINGS.model : '' })); }} className="mt-1.5 w-full rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2.5 text-xs text-[#e2e0d7]">{AI_PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider === 'jev' ? 'Simple Jev' : provider === 'gemini' ? 'Gemini' : provider === 'grok' ? 'Grok' : 'OpenAI'}</option>)}</select></label>
        <label className="text-[10px] text-[#85867d]">Model<input value={aiSettings.model} onChange={(event) => setAiSettings((current) => ({ ...current, model: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2.5 text-xs text-[#e2e0d7]" /></label>
        <label className="text-[10px] text-[#85867d] sm:col-span-2">API endpoint<input value={aiSettings.endpoint} onChange={(event) => setAiSettings((current) => ({ ...current, endpoint: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2.5 text-xs text-[#e2e0d7]" /></label>
        {aiSettings.provider !== 'jev' && <label className="text-[10px] text-[#85867d] sm:col-span-2">API key<input type="password" autoComplete="off" value={aiKey} onChange={(event) => setAiKey(event.target.value)} placeholder={keyAvailable ? 'Key set for this browser session' : 'Enter provider key'} className="mt-1.5 w-full rounded-lg border border-white/[.1] bg-[#111210] px-3 py-2.5 text-xs text-[#e2e0d7]" /></label>}
      </div>
      <div className="mt-4 flex items-center gap-3"><button type="button" onClick={() => void configureAI(true)} className="rounded-lg bg-[#c9ee8e] px-3 py-2.5 text-xs font-semibold text-[#20251b]">Enable and save</button>{aiSettings.enabled && <button type="button" onClick={() => void configureAI(false)} className="rounded-lg border border-white/[.1] px-3 py-2.5 text-xs">Disable</button>}<span className="text-[10px] text-[#777870]">{aiSettings.enabled ? 'Enabled for manual suggestions' : 'Off'}</span></div>
    </Panel>
    <Panel title="Your data" subtitle="Activity, website categories, and settings are stored locally.">
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void exportData()} className="rounded-lg border border-white/[.1] px-3 py-2.5 text-xs">Export activity</button><button type="button" onClick={() => void deleteData()} className="rounded-lg border border-[#bd765d]/30 px-3 py-2.5 text-xs text-[#d79880]">Delete all data</button></div>
      {message && <p role="status" className="mt-4 text-xs text-[#b3d783]">{message}</p>}
    </Panel>
  </div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-white/[.08] px-4 py-8 text-center text-xs text-[#777870]">{children}</p>;
}
