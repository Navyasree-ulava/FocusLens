import { useEffect, useState, type FormEvent } from 'react';
import { formatMinutes } from '../../src/format';
import { CATEGORY_DEFINITIONS, defaultProductivityFor, PRODUCTIVITY_VALUES, type ProductivityValue, type WebsiteCategory } from '../../src/classification/categories';
import { classifyDomain } from '../../src/classification/classify-domain';
import { summarizeWebsiteTime, type ProductivitySummary } from '../../src/classification/productivity-summary';
import { deleteDomainOverride, loadDomainOverrides, saveDomainOverride, type DomainOverride } from '../../src/classification/settings-store';
import { IndexedDbActivityStore } from '../../src/tracking/indexeddb-store';
import { localDayBounds } from '../../src/tracking/time';
import type { TrackerState } from '../../src/tracking/types';
import { YOUTUBE_CATEGORIES, type YouTubeCategory, type YouTubePageState, type YouTubeSegment, type YouTubeSettings } from '../../src/youtube/types';
import { deleteLearningGoal, deleteYouTubeOverride, loadYouTubeSettings, saveLearningGoal, saveYouTubeOverride } from '../../src/youtube/settings-store';
import { mostWatchedVideos, summarizeYouTubeTime } from '../../src/youtube/summary';
import { endFocusSession, focusSessionElapsedMs, pauseFocusSession, resumeFocusSession, startFocusSession, summarizeFocusSession } from '../../src/wellbeing/focus-sessions';
import { DEFAULT_WELLBEING_SETTINGS, loadWellbeingSettings, saveWellbeingSettings } from '../../src/wellbeing/settings-store';
import type { FocusSession, WellbeingSettings } from '../../src/wellbeing/types';
import type { ActivityRecord } from '../../src/tracking/types';

interface PopupData {
  state: TrackerState | null;
  activeMsToday: number;
  summary: ProductivitySummary;
  ready: boolean;
  error: boolean;
  youtubeSegments: YouTubeSegment[];
  youtubePageState: YouTubePageState | null;
  focusSession: FocusSession | null;
  wellbeing: WellbeingSettings;
  records: ActivityRecord[];
}

const activityStore = new IndexedDbActivityStore();
const FOCUS_SESSION_END_ALARM = 'focuslens-focus-session-end';

function displayDuration(milliseconds: number): string {
  if (milliseconds > 0 && milliseconds < 60_000) return '<1m';
  return formatMinutes(milliseconds / 60_000);
}

function trackerStatus(state: TrackerState | null, trackingPaused = false): { label: string; detail: string; color: string } {
  if (trackingPaused) return { label: 'Paused', detail: 'Tracking is paused in your settings', color: 'bg-[#777870]' };
  if (!state) return { label: 'Starting', detail: 'Checking the active browser tab', color: 'bg-[#d9bc72]' };
  if (state.intervalStartedAt !== null) return { label: 'Tracking', detail: 'Counting this active tab', color: 'bg-[#a9da7b]' };
  if (!state.focused) return { label: 'Paused', detail: 'Waiting for the browser to be focused', color: 'bg-[#777870]' };
  if (state.idle) return { label: 'Paused', detail: 'Idle time is excluded', color: 'bg-[#777870]' };
  return { label: 'Not counting', detail: 'This page cannot be tracked', color: 'bg-[#777870]' };
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function App() {
  const [data, setData] = useState<PopupData>({
    state: null,
    activeMsToday: 0,
    summary: summarizeWebsiteTime([]),
    ready: false,
    error: false,
    youtubeSegments: [],
    youtubePageState: null,
    focusSession: null,
    wellbeing: DEFAULT_WELLBEING_SETTINGS,
    records: [],
  });
  const [overrides, setOverrides] = useState<DomainOverride[]>([]);
  const [draftCategory, setDraftCategory] = useState<WebsiteCategory>('Unknown');
  const [draftProductivity, setDraftProductivity] = useState<ProductivityValue>('unknown');
  const [customDomain, setCustomDomain] = useState('');
  const [customCategory, setCustomCategory] = useState<WebsiteCategory>('Learning');
  const [customProductivity, setCustomProductivity] = useState<ProductivityValue>('productive');
  const [currentMessage, setCurrentMessage] = useState('');
  const [managerMessage, setManagerMessage] = useState('');
  const [youtubeSettings, setYouTubeSettings] = useState<YouTubeSettings>({ learningGoals: [], overrides: [] });
  const [learningGoalDraft, setLearningGoalDraft] = useState('');
  const [youtubeRuleDraft, setYouTubeRuleDraft] = useState('');
  const [youtubeRuleScope, setYouTubeRuleScope] = useState<'video' | 'channel'>('video');
  const [youtubeRuleCategory, setYouTubeRuleCategory] = useState<YouTubeCategory>('Educational');
  const [youtubeMessage, setYouTubeMessage] = useState('');
  const [focusGoalDraft, setFocusGoalDraft] = useState('Focused work');

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const now = Date.now();
        const [state, userOverrides, videoSettings, session, focusSessions, wellbeing] = await Promise.all([
          activityStore.readState(),
          loadDomainOverrides(),
          loadYouTubeSettings(),
          browser.storage.session.get('focuslens-youtube-current-state'),
          activityStore.listFocusSessions(),
          loadWellbeingSettings(),
        ]);
        const { start, end } = localDayBounds(now);
        const records = await activityStore.listRecords(start, end);
        const currentFocusSession = focusSessions.find((item) => item.status !== 'completed');
        const focusRecords = currentFocusSession
          ? await activityStore.listRecords(Math.min(start, currentFocusSession.startedAt), end)
          : records;
        if (state?.intervalStartedAt !== null && state?.context && now > state.intervalStartedAt) {
          focusRecords.push({
            id: 'current-open-focus',
            startedAt: state.intervalStartedAt,
            endedAt: now,
            durationMs: now - state.intervalStartedAt,
            domain: state.context.domain,
          });
        }
        const youtubeSegments = await activityStore.listYouTubeSegments(start, end);
        const youtubeState = session['focuslens-youtube-current-state'] as { pageState?: YouTubePageState } | undefined;
        const storedMs = records.reduce((total, record) => total + record.durationMs, 0);
        const openMs = state?.intervalStartedAt !== null && state?.context
          ? Math.max(0, now - Math.max(state.intervalStartedAt, start))
          : 0;
        const summaryRecords = records.map(({ domain, durationMs }) => ({ domain, durationMs }));
        if (openMs > 0 && state?.context) summaryRecords.push({ domain: state.context.domain, durationMs: openMs });
        if (mounted) {
          setOverrides(userOverrides);
          setYouTubeSettings(videoSettings);
          setData({
            state,
            activeMsToday: storedMs + openMs,
            summary: summarizeWebsiteTime(summaryRecords, userOverrides),
            ready: true,
            error: false,
            youtubeSegments,
            youtubePageState: youtubeState?.pageState ?? null,
            focusSession: focusSessions.find((item) => item.status !== 'completed') ?? null,
            wellbeing,
            records: focusRecords,
          });
        }
      } catch {
        if (mounted) setData((current) => ({ ...current, ready: true, error: true }));
      }
    };

    const port = browser.runtime.connect({ name: 'focuslens-popup' });
    port.onMessage.addListener((message: { type: string }) => {
      if (message.type === 'focuslens-tracker-updated' || message.type === 'focuslens-youtube-updated') void refresh();
    });
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      port.disconnect();
    };
  }, []);

  const status = trackerStatus(data.state, data.wellbeing.trackingPaused);
  const active = Boolean(data.state && data.state.intervalStartedAt !== null && data.state.context);
  const currentDomain = data.state?.context?.domain ?? '';
  const classification = classifyDomain(currentDomain, overrides);

  useEffect(() => {
    setDraftCategory(classification.category);
    setDraftProductivity(classification.productivity);
  }, [classification.category, classification.productivity, currentDomain]);

  const persistOverride = async (
    domain: string,
    category: WebsiteCategory,
    productivity: ProductivityValue,
    setMessage: (message: string) => void,
  ) => {
    try {
      const next = await saveDomainOverride({ domain, category, productivity });
      setOverrides(next);
      setMessage(`Saved ${domain.trim()} on this device.`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this website rule.');
      return false;
    }
  };

  const saveCurrentDomain = async () => {
    if (!currentDomain) return;
    await persistOverride(currentDomain, draftCategory, draftProductivity, setCurrentMessage);
  };

  const addCustomDomain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await persistOverride(customDomain, customCategory, customProductivity, setManagerMessage);
    if (saved) setCustomDomain('');
  };

  const removeOverride = async (domain: string) => {
    try {
      const next = await deleteDomainOverride(domain);
      setOverrides(next);
      setManagerMessage(`Removed the custom rule for ${domain}.`);
    } catch {
      setManagerMessage('Could not remove this website rule.');
    }
  };

  const saveGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setYouTubeSettings(await saveLearningGoal(learningGoalDraft));
      setLearningGoalDraft('');
      setYouTubeMessage('Learning goal saved on this device.');
    } catch (error) {
      setYouTubeMessage(error instanceof Error ? error.message : 'Could not save this goal.');
    }
  };

  const saveYouTubeRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setYouTubeSettings(await saveYouTubeOverride(youtubeRuleScope, youtubeRuleDraft, youtubeRuleCategory));
      setYouTubeRuleDraft('');
      setYouTubeMessage('YouTube preference saved on this device.');
    } catch (error) {
      setYouTubeMessage(error instanceof Error ? error.message : 'Could not save this preference.');
    }
  };

  const removeYouTubeRule = async (scope: 'video' | 'channel', key: string) => {
    try {
      setYouTubeSettings(await deleteYouTubeOverride(scope, key));
      setYouTubeMessage('YouTube preference removed.');
    } catch {
      setYouTubeMessage('Could not remove this preference.');
    }
  };

  const currentVideo = data.youtubePageState?.metadata;
  const youtubeSummary = summarizeYouTubeTime(data.youtubeSegments, youtubeSettings);
  const isCurrentYouTube = currentDomain === 'www.youtube.com';
  const focusSession = data.focusSession;
  const focusSummary = focusSession ? summarizeFocusSession(focusSession, data.records, overrides) : null;

  const startQuickFocusSession = async () => {
    try {
      const session = startFocusSession(focusGoalDraft, 25, Date.now());
      await activityStore.saveFocusSession(session);
      await browser.alarms.create(FOCUS_SESSION_END_ALARM, { when: Date.now() + session.targetMinutes * 60_000 });
      setData((current) => ({ ...current, focusSession: session }));
    } catch (error) { setCurrentMessage(error instanceof Error ? error.message : 'Could not start the focus session.'); }
  };

  const updateFocusSession = async (action: 'pause' | 'resume' | 'end') => {
    if (!focusSession) return;
    const now = Date.now();
    const session = action === 'pause' ? pauseFocusSession(focusSession, now) : action === 'resume' ? resumeFocusSession(focusSession, now) : endFocusSession(focusSession, now);
    await activityStore.saveFocusSession(session);
    if (action === 'pause' || action === 'end') await browser.alarms.clear(FOCUS_SESSION_END_ALARM);
    else await browser.alarms.create(FOCUS_SESSION_END_ALARM, {
      when: now + Math.max(1_000, focusSession.targetMinutes * 60_000 - focusSessionElapsedMs(session, now)),
    });
    setData((current) => ({ ...current, focusSession: action === 'end' ? null : session }));
  };

  const toggleTracking = async () => {
    const wellbeing = await saveWellbeingSettings({ ...data.wellbeing, trackingPaused: !data.wellbeing.trackingPaused });
    setData((current) => ({ ...current, wellbeing }));
  };

  const updateCategory = (category: WebsiteCategory, custom = false) => {
    if (custom) {
      setCustomCategory(category);
      setCustomProductivity(category === 'Unknown' ? 'unknown' : defaultProductivityFor(category));
      return;
    }
    setDraftCategory(category);
    setDraftProductivity(category === 'Unknown' ? 'unknown' : defaultProductivityFor(category));
  };

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
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-3 text-[10px]">
          <span className="text-[#85847a]">Productive <b className="ml-1 font-medium text-[#b3d783]">{!data.ready ? '—' : displayDuration(data.summary.productiveMs)}</b></span>
          <span className="text-[#85847a]">Recreational <b className="ml-1 font-medium text-[#e6b278]">{!data.ready ? '—' : displayDuration(data.summary.recreationalMs)}</b></span>
          <span className="text-[#85847a]">Neutral <b className="ml-1 font-medium text-[#c9c7bc]">{!data.ready ? '—' : displayDuration(data.summary.neutralMs)}</b></span>
          <span className="text-[#85847a]">Unknown <b className="ml-1 font-medium text-[#c9c7bc]">{!data.ready ? '—' : displayDuration(data.summary.unknownMs)}</b></span>
        </div>
        <p className="mt-3 text-[10px] text-[#777870]">
          Classified browsing ratio: {!data.ready || data.summary.productivityRatio === null ? '—' : `${Math.round(data.summary.productivityRatio * 100)}%`}
        </p>
        <p className="mt-1 text-[9px] leading-4 text-[#69685f]">Productive time ÷ productive, recreational, and neutral time. Unknown is excluded.</p>
      </section>

      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-[#aaa99f]">Current website</h2>
          <span className="text-[10px] text-[#777870]">{active ? 'Active tab' : 'Not counting'}</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-[#252620] text-sm text-[#a8aa95]">◎</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{currentDomain || '—'}</p>
            <p className="mt-0.5 text-[11px] text-[#777870]">{classification.source === 'user' ? 'Your custom rule' : 'Default classification'}</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-[#929188]">{classification.category}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="text-[10px] text-[#87867d]">
            Category
            <select value={draftCategory} onChange={(event) => updateCategory(event.target.value as WebsiteCategory)} disabled={!currentDomain} className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#111210] px-2 py-2 text-[11px] text-[#d8d6cc] disabled:opacity-50">
              {CATEGORY_DEFINITIONS.map(({ name }) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="text-[10px] text-[#87867d]">
            Browsing intent
            <select value={draftProductivity} onChange={(event) => setDraftProductivity(event.target.value as ProductivityValue)} disabled={!currentDomain || draftCategory === 'Unknown'} className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#111210] px-2 py-2 text-[11px] capitalize text-[#d8d6cc] disabled:opacity-50">
              {PRODUCTIVITY_VALUES.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </label>
        </div>
        <button type="button" onClick={() => void saveCurrentDomain()} disabled={!currentDomain} className="mt-3 w-full rounded-lg bg-[#c9ee8e] px-3 py-2 text-[11px] font-semibold text-[#20251b] disabled:opacity-40">
          Save rule for this domain
        </button>
        {currentMessage && <p role="status" className="mt-2 text-[10px] text-[#b3d783]">{currentMessage}</p>}
        <p className="mt-2 text-[10px] leading-4 text-[#777870]">Social media, coding, work, and communication start as neutral. Change the intent to match your use.</p>
      </section>

      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <div className="flex items-center justify-between"><h2 className="text-xs font-medium text-[#aaa99f]">Focus session</h2><button type="button" onClick={() => void toggleTracking()} className="text-[10px] text-[#aaa99f]">{data.wellbeing.trackingPaused ? 'Resume tracking' : 'Pause tracking'}</button></div>
        {focusSession ? <><p className="mt-3 truncate text-sm font-medium">{focusSession.goal}</p><p className="mt-1 text-[10px] text-[#777870]">{focusSession.status} · {displayDuration(focusSummary?.focusedMs ?? 0)} tracked</p><div className="mt-3 flex gap-2">{focusSession.status === 'active' ? <button type="button" onClick={() => void updateFocusSession('pause')} className="rounded-lg border border-white/[.1] px-3 py-2 text-[10px]">Pause</button> : <button type="button" onClick={() => void updateFocusSession('resume')} className="rounded-lg border border-white/[.1] px-3 py-2 text-[10px]">Resume</button>}<button type="button" onClick={() => void updateFocusSession('end')} className="rounded-lg bg-[#c9ee8e] px-3 py-2 text-[10px] font-semibold text-[#20251b]">End session</button></div></> : <form onSubmit={(event) => { event.preventDefault(); void startQuickFocusSession(); }} className="mt-3 flex gap-2"><input value={focusGoalDraft} onChange={(event) => setFocusGoalDraft(event.target.value)} maxLength={120} required placeholder="Focus goal" className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#111210] px-2 py-2 text-[10px] text-[#e2e0d7]" /><button type="submit" className="rounded-lg bg-[#c9ee8e] px-3 py-2 text-[10px] font-semibold text-[#20251b]">Start 25m</button></form>}
      </section>

      <details className="mt-4 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <summary className="cursor-pointer list-none text-xs font-medium text-[#c9c7bc]">Manage domains and custom rules ({overrides.length}) <span className="float-right text-[#777870]">⌄</span></summary>
        <form onSubmit={(event) => void addCustomDomain(event)} className="mt-4 space-y-3">
          <label className="block text-[10px] text-[#87867d]">
            Add a domain
            <input required value={customDomain} onChange={(event) => setCustomDomain(event.target.value)} placeholder="example.com" className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#111210] px-3 py-2 text-xs text-[#e2e0d7] placeholder:text-[#626159]" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-[#87867d]">
              Category
              <select value={customCategory} onChange={(event) => updateCategory(event.target.value as WebsiteCategory, true)} className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#111210] px-2 py-2 text-[11px] text-[#d8d6cc]">
                {CATEGORY_DEFINITIONS.map(({ name }) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-[#87867d]">
              Browsing intent
              <select value={customProductivity} onChange={(event) => setCustomProductivity(event.target.value as ProductivityValue)} disabled={customCategory === 'Unknown'} className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#111210] px-2 py-2 text-[11px] capitalize text-[#d8d6cc] disabled:opacity-50">
                {PRODUCTIVITY_VALUES.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
              </select>
            </label>
          </div>
          <button type="submit" className="w-full rounded-lg border border-white/[0.1] px-3 py-2 text-[11px] font-medium text-[#d8d6cc] hover:bg-white/[0.04]">Add or update domain</button>
        </form>
        {managerMessage && <p role="status" className="mt-3 text-[10px] text-[#b3d783]">{managerMessage}</p>}
        <div className="mt-3 space-y-2">
          {overrides.map((override) => (
            <div key={override.domain} className="flex items-center gap-2 border-t border-white/[0.06] pt-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-[#d8d6cc]">{override.domain}</p>
                <p className="text-[10px] text-[#777870]">{override.category} · {override.productivity}</p>
              </div>
              <button type="button" onClick={() => void removeOverride(override.domain)} className="rounded-md px-2 py-1 text-[10px] text-[#c9927e] hover:bg-white/[0.04]">Remove</button>
            </div>
          ))}
          {overrides.length === 0 && <p className="text-[10px] text-[#777870]">No custom domain rules saved yet.</p>}
        </div>
      </details>

      <button type="button" onClick={() => void browser.tabs.create({ url: new URL('/dashboard.html', window.location.href).toString() })} className="mt-4 w-full rounded-xl bg-[#c9ee8e] px-4 py-3 text-xs font-semibold text-[#20251b] hover:bg-[#d6f3a6]">Open analytics dashboard ↗</button>

      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-[#aaa99f]">YouTube today</h2>
          <span className="text-[10px] text-[#777870]">Playing time</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <p className="text-[#85847a]">Learning <b className="ml-1 font-medium text-[#b3d783]">{displayDuration(youtubeSummary.educationalViewingMs)}</b></p>
          <p className="text-[#85847a]">Entertainment <b className="ml-1 font-medium text-[#e6b278]">{displayDuration(youtubeSummary.entertainmentViewingMs)}</b></p>
          <p className="text-[#85847a]">Shorts <b className="ml-1 font-medium text-[#c9c7bc]">{displayDuration(youtubeSummary.shortsMs)}</b></p>
          <p className="text-[#85847a]">Paused <b className="ml-1 font-medium text-[#c9c7bc]">{displayDuration(youtubeSummary.pausedMs)}</b></p>
          <p className="text-[#85847a]">Buffering <b className="ml-1 font-medium text-[#c9c7bc]">{displayDuration(youtubeSummary.bufferingMs)}</b></p>
          <p className="text-[#85847a]">Browsing <b className="ml-1 font-medium text-[#c9c7bc]">{displayDuration(youtubeSummary.browsingMs)}</b></p>
        </div>
        {isCurrentYouTube && currentVideo && <p className="mt-3 truncate border-t border-white/[0.06] pt-3 text-[11px] text-[#c9c7bc]" title={currentVideo.title ?? undefined}>Now: {currentVideo.title ?? 'Unknown video'} · {currentVideo.channelName ?? 'Unknown channel'}</p>}
        {mostWatchedVideos(data.youtubeSegments, 3).map((video) => <a key={video.videoId} href={video.videoUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-[10px] text-[#aaa99f] hover:text-[#c9ee8e]">{video.title ?? video.videoId} · {displayDuration(video.durationMs)}</a>)}
        {data.youtubeSegments.length === 0 && <p className="mt-2 text-[10px] text-[#777870]">Your local YouTube activity will appear here.</p>}
      </section>

      <details className="mt-4 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <summary className="cursor-pointer list-none text-xs font-medium text-[#c9c7bc]">YouTube learning goals and rules</summary>
        <form onSubmit={(event) => void saveGoal(event)} className="mt-3 flex gap-2">
          <input required value={learningGoalDraft} onChange={(event) => setLearningGoalDraft(event.target.value)} placeholder="e.g. React, statistics" className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#111210] px-2 py-2 text-[10px] text-[#e2e0d7] placeholder:text-[#626159]" />
          <button type="submit" className="rounded-lg border border-white/[0.1] px-2.5 text-[10px] text-[#d8d6cc]">Add goal</button>
        </form>
        {youtubeSettings.learningGoals.map((goal) => <div key={goal} className="mt-2 flex items-center justify-between text-[10px] text-[#aaa99f]"><span>{goal}</span><button type="button" onClick={() => void deleteLearningGoal(goal).then(setYouTubeSettings)} className="text-[#c9927e]">Remove</button></div>)}
        <form onSubmit={(event) => void saveYouTubeRule(event)} className="mt-4 space-y-2 border-t border-white/[0.06] pt-3">
          <p className="text-[10px] text-[#87867d]">Classify a channel or video ID</p>
          <div className="grid grid-cols-[0.8fr_1fr] gap-2">
            <select value={youtubeRuleScope} onChange={(event) => setYouTubeRuleScope(event.target.value as 'video' | 'channel')} className="rounded-lg border border-white/[0.1] bg-[#111210] px-2 py-2 text-[10px] text-[#d8d6cc]"><option value="video">Video ID</option><option value="channel">Channel name</option></select>
            <select value={youtubeRuleCategory} onChange={(event) => setYouTubeRuleCategory(event.target.value as YouTubeCategory)} className="rounded-lg border border-white/[0.1] bg-[#111210] px-2 py-2 text-[10px] text-[#d8d6cc]">{YOUTUBE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>
          </div>
          <div className="flex gap-2"><input required value={youtubeRuleDraft} onChange={(event) => setYouTubeRuleDraft(event.target.value)} placeholder={youtubeRuleScope === 'video' ? '11-character video ID' : 'Channel name'} className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#111210] px-2 py-2 text-[10px] text-[#e2e0d7] placeholder:text-[#626159]" /><button type="submit" className="rounded-lg border border-white/[0.1] px-2.5 text-[10px] text-[#d8d6cc]">Save rule</button></div>
        </form>
        {youtubeSettings.overrides.map((rule) => <div key={`${rule.scope}-${rule.key}`} className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[#aaa99f]"><span className="min-w-0 truncate">{rule.scope}: {rule.key} · {rule.category}</span><button type="button" onClick={() => void removeYouTubeRule(rule.scope, rule.key)} className="text-[#c9927e]">Remove</button></div>)}
        {youtubeMessage && <p role="status" className="mt-2 text-[10px] text-[#b3d783]">{youtubeMessage}</p>}
      </details>

      <section className="mt-4 rounded-2xl border border-white/[0.08] bg-[#191a17] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-sm text-[#c5e98f]">◈</span>
          <div>
            <h2 className="text-xs font-medium text-[#d6d4cb]">Local by design</h2>
            <p className="mt-1 text-[11px] leading-4 text-[#88877e]">
              Activity stays on this device. YouTube video titles and channels are stored for local reports. Background tabs, idle time, and incognito windows are excluded.
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-5 border-t border-white/[0.08] pt-4 text-center text-[10px] text-[#777870]">
        Website paths and searches are not saved · YouTube video links are canonical
      </footer>
    </main>
  );
}
