import { IndexedDbActivityStore } from '../src/tracking/indexeddb-store';
import { TrackingEngine } from '../src/tracking/engine';
import { readBrowserContext } from '../src/tracking/browser-context';
import type { TrackerState } from '../src/tracking/types';
import { youtubeContentMessageSchema } from '../src/youtube/validation';

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

  const enqueue = (work: () => Promise<void>) => {
    workQueue = workQueue.then(work).catch((error: unknown) => {
      console.error('[FocusLens] Activity update failed.', error);
    });
    return workQueue;
  };

  const isYouTubeTab = (context: { domain: string } | null | undefined): boolean => context?.domain === 'www.youtube.com';

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
    const current = await tracker.reconcile({
      observedAt: now,
      focused,
      idle,
      context: focused ? browserContext.context : null,
    });
    await sendYouTubeContext(previous, current, now, checkpoint);
  };

  const ensureCheckpointAlarm = async () => {
    const alarm = await browser.alarms.get(CHECKPOINT_ALARM);
    if (!alarm) await browser.alarms.create(CHECKPOINT_ALARM, { periodInMinutes: CHECKPOINT_PERIOD_MINUTES });
  };

  const initialize = async () => {
    await ensureCheckpointAlarm();
    browser.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
    const session = await browser.storage.session.get(SESSION_MARKER);
    if (!session[SESSION_MARKER]) {
      await tracker.endPreviousBrowserSession(Date.now());
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
      });
    }
  });
  browser.runtime.onInstalled.addListener(() => void enqueue(initialize));
  browser.runtime.onStartup.addListener(() => void enqueue(initialize));
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const parsed = youtubeContentMessageSchema.safeParse(message);
    const senderUrl = sender.url ?? sender.tab?.url;
    if (!parsed.success || sender.tab?.id === undefined || sender.tab.incognito) return false;
    try {
      if (!senderUrl || new URL(senderUrl).hostname !== 'www.youtube.com') return false;
    } catch {
      return false;
    }

    const tabId = sender.tab.id;
    switch (parsed.data.type) {
      case 'focuslens-youtube-context-request':
        void store.readState().then((state) => {
          const active = Boolean(
            state && state.intervalStartedAt !== null && state.focused && !state.idle &&
            state.context?.tabId === tabId && state.context?.domain === 'www.youtube.com',
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
            for (const popupPort of popupPorts) popupPort.postMessage({ type: 'focuslens-youtube-updated' });
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
        void store.readState().then(async (state) => {
          const active = Boolean(
            state && state.intervalStartedAt !== null && state.focused && !state.idle &&
            state.context?.tabId === tabId && state.context?.domain === 'www.youtube.com',
          );
          await browser.storage.session.set({
            [YOUTUBE_CURRENT_STATE_KEY]: {
              tabId,
              active,
              pageState,
              updatedAt: Date.now(),
            },
          });
          sendResponse({ ok: true });
          for (const popupPort of popupPorts) popupPort.postMessage({ type: 'focuslens-youtube-updated' });
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
