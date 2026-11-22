import { IndexedDbActivityStore } from '../src/tracking/indexeddb-store';
import { TrackingEngine } from '../src/tracking/engine';
import { readBrowserContext } from '../src/tracking/browser-context';
import type { TrackerState } from '../src/tracking/types';
import { youtubeContentMessageSchema } from '../src/youtube/validation';
import { isExcludedDomain, loadWellbeingSettings } from '../src/wellbeing/settings-store';
import { isYouTubeHost } from '../src/youtube/hosts';

const IDLE_THRESHOLD_SECONDS = 60;
const IDLE_THRESHOLD_MS = IDLE_THRESHOLD_SECONDS * 1_000;
const CHECKPOINT_ALARM = 'focuslens-activity-checkpoint';
const SESSION_MARKER = 'focuslens-browser-session';
const CHECKPOINT_PERIOD_MINUTES = 1;
const POPUP_PORT_NAME = 'focuslens-popup';
const YOUTUBE_CURRENT_STATE_KEY = 'focuslens-youtube-current-state';

export default defineBackground(() => {
  const store = new IndexedDbActivityStore();
  const tracker = new TrackingEngine(store, {
    idleThresholdMs: IDLE_THRESHOLD_MS,
    maxUnobservedGapMs: 2 * CHECKPOINT_PERIOD_MINUTES * 60_000,
  });
  const popupPorts = new Set<Browser.runtime.Port>();
  let workQueue = Promise.resolve();

  const notifyAnalyticsUpdated = () => {
    void browser.runtime.sendMessage({ type: 'focuslens-analytics-updated' }).catch(() => undefined);
    for (const port of popupPorts) {
      try { port.postMessage({ type: 'focuslens-youtube-updated' }); }
      catch { popupPorts.delete(port); }
    }
  };

  const enqueue = (work: () => Promise<void>) => {
    workQueue = workQueue.then(work).catch((error: unknown) => {
      console.error('[FocusLens] Activity update failed.', error);
    });
    return workQueue;
  };

  const isYouTubeTab = (context: { domain: string } | null | undefined): boolean => isYouTubeHost(context?.domain);

  const sendYouTubeContext = async (
    previous: TrackerState | null,
    current: TrackerState,
    observedAt: number,
    checkpoint = false,
  ) => {
    const candidateTabIds = new Set<number>();
    if (isYouTubeTab(previous?.context) && previous?.context) candidateTabIds.add(previous.context.tabId);
    if (isYouTubeTab(current.context) && current.context) candidateTabIds.add(current.context.tabId);
    for (const tabId of candidateTabIds) {
      const active = current.intervalStartedAt !== null && current.focused && !current.idle && current.context?.tabId === tabId;
      try {
        await browser.tabs.sendMessage(tabId, {
          type: 'focuslens-youtube-context',
          active,
          observedAt,
          checkpoint,
        });
      } catch {
        // The content script may not be loaded yet; it requests current context after injection.
      }
    }
  };

  const synchronize = async (idleOverride?: boolean, focusOverride?: boolean, checkpoint = false): Promise<void> => {
    const now = Date.now();
    const browserContext = await readBrowserContext(popupPorts.size > 0);
    const idle = idleOverride ?? (await browser.idle.queryState(IDLE_THRESHOLD_SECONDS)) !== 'active';
    const focused = focusOverride ?? browserContext.focused;
    const previous = await store.readState();
    const settings = await loadWellbeingSettings();
    const domain = browserContext.context?.domain;
    const eligible = !settings.trackingPaused && !isExcludedDomain(domain ?? '', settings.excludedDomains);
    const current = await tracker.reconcile({
      observedAt: now,
      focused,
      idle,
      context: focused && eligible ? browserContext.context : null,
    });
    await sendYouTubeContext(previous, current, now, checkpoint);
    void browser.runtime.sendMessage({ type: 'focuslens-activity-updated' }).catch(() => undefined);
  };

  const ensureCheckpointAlarm = async () => {
    const alarm = await browser.alarms.get(CHECKPOINT_ALARM);
    if (!alarm) await browser.alarms.create(CHECKPOINT_ALARM, { periodInMinutes: CHECKPOINT_PERIOD_MINUTES });
  };

  const initialize = async () => {
    await ensureCheckpointAlarm();
    browser.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
    await Promise.all([
      browser.alarms.clear('focuslens-focus-session-end'),
      browser.alarms.clear('focuslens-break-reminder'),
      browser.alarms.clear('focuslens-distraction-reminder'),
    ]);
    const session = await browser.storage.session.get(SESSION_MARKER);
    if (!session[SESSION_MARKER]) {
      const now = Date.now();
      await tracker.endPreviousBrowserSession(now);
      await browser.storage.session.set({ [SESSION_MARKER]: crypto.randomUUID() });
    }
    await synchronize();
  };

  browser.tabs.onActivated.addListener(() => void enqueue(() => synchronize()));
  browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'complete') void enqueue(() => synchronize());
  });
  browser.tabs.onRemoved.addListener(() => void enqueue(() => synchronize()));
  browser.windows.onFocusChanged.addListener((windowId) => {
    const noWindowFocused = windowId === browser.windows.WINDOW_ID_NONE;
    void enqueue(() => synchronize(undefined, noWindowFocused && popupPorts.size === 0 ? false : undefined));
  });
  browser.idle.onStateChanged.addListener((state) => {
    void enqueue(() => synchronize(state !== 'active'));
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CHECKPOINT_ALARM) {
      void enqueue(async () => {
        await synchronize(undefined, undefined, true);
        await tracker.checkpoint(Date.now());
        void browser.runtime.sendMessage({ type: 'focuslens-activity-updated' }).catch(() => undefined);
      });
    }
  });
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes['focuslens.wellbeing-settings']) {
      void enqueue(async () => {
        await synchronize();
      });
    }
  });
  browser.runtime.onInstalled.addListener(() => void enqueue(initialize));
  browser.runtime.onStartup.addListener(() => void enqueue(initialize));
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && typeof message === 'object' && 'type' in message && message.type === 'focuslens-ai-fetch') {
      const extensionRoot = browser.runtime.getURL('');
      if (!sender.url?.startsWith(extensionRoot) || sender.tab?.incognito) return false;
      const request = message as { url?: unknown; method?: unknown; headers?: unknown; body?: unknown };
      if (typeof request.url !== 'string' || request.method !== 'POST' || typeof request.body !== 'string') return false;
      const body = request.body;
      let endpoint: URL;
      try { endpoint = new URL(request.url); }
      catch { sendResponse({ error: 'Simple Jev endpoint URL is invalid.' }); return true; }
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        sendResponse({ error: 'Simple Jev endpoint must be a clean HTTPS URL.' }); return true;
      }
      void browser.permissions.contains({ origins: [`${endpoint.origin}/*`] }).then(async (hasAccess) => {
        if (!hasAccess) { sendResponse({ error: 'FocusLens does not have access to the Simple Jev host. Enable it in Settings first.' }); return; }
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
          sendResponse({ status: response.status, body: await response.text() });
        } catch {
          sendResponse({ error: 'The FocusLens background worker could not connect to Simple Jev. Check the connection or try again later.' });
        }
      }).catch(() => sendResponse({ error: 'FocusLens could not verify access to the Simple Jev host. Reload the extension.' }));
      return true;
    }

    const parsed = youtubeContentMessageSchema.safeParse(message);
    const senderUrl = sender.url ?? sender.tab?.url;
    if (!parsed.success || sender.tab?.id === undefined || sender.tab.incognito) return false;
    try {
      if (!senderUrl || !isYouTubeHost(new URL(senderUrl).hostname)) return false;
    } catch {
      return false;
    }

    const tabId = sender.tab.id;
    switch (parsed.data.type) {
      case 'focuslens-youtube-context-request':
        void store.readState().then((state) => {
          const active = Boolean(
            state && state.intervalStartedAt !== null && state.focused && !state.idle &&
            state.context?.tabId === tabId && isYouTubeHost(state.context?.domain),
          );
          sendResponse({ active, observedAt: Date.now() });
        }).catch(() => sendResponse({ active: false, observedAt: Date.now() }));
        return true;
      case 'focuslens-youtube-segment':
        {
          const segment = parsed.data.segment;
        void enqueue(async () => {
          try {
            await store.appendYouTubeSegment(segment);
            sendResponse({ ok: true });
            notifyAnalyticsUpdated();
          } catch (error) {
            sendResponse({ ok: false });
            throw error;
          }
        });
        return true;
        }
      case 'focuslens-youtube-page-state':
        {
        const pageState = parsed.data.pageState;
        const requestedActive = parsed.data.active;
        const requestedSegmentStart = parsed.data.segmentStartedAt;
        void store.readState().then(async (state) => {
          const active = requestedActive && Boolean(
            state && state.intervalStartedAt !== null && state.focused && !state.idle &&
            state.context?.tabId === tabId && isYouTubeHost(state.context?.domain),
          );
          const now = Date.now();
          await browser.storage.session.set({
            [YOUTUBE_CURRENT_STATE_KEY]: {
              tabId,
              active,
              pageState,
              segmentStartedAt: active && requestedSegmentStart !== null && requestedSegmentStart <= now
                ? requestedSegmentStart
                : null,
              updatedAt: now,
            },
          });
          sendResponse({ ok: true });
          notifyAnalyticsUpdated();
        }).catch(() => sendResponse({ ok: false }));
        return true;
        }
    }
  });
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== POPUP_PORT_NAME) return;
    popupPorts.add(port);
    void enqueue(async () => {
      await synchronize();
      for (const popupPort of popupPorts) {
        try {
          popupPort.postMessage({ type: 'focuslens-tracker-updated' });
        } catch {
          popupPorts.delete(popupPort);
        }
      }
    });
    port.onDisconnect.addListener(() => {
      popupPorts.delete(port);
      void enqueue(() => synchronize());
    });
  });

  void enqueue(initialize);
});
