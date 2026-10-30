import { IndexedDbActivityStore } from '../src/tracking/indexeddb-store';
import { TrackingEngine } from '../src/tracking/engine';
import { readBrowserContext } from '../src/tracking/browser-context';

const IDLE_THRESHOLD_SECONDS = 60;
const IDLE_THRESHOLD_MS = IDLE_THRESHOLD_SECONDS * 1_000;
const CHECKPOINT_ALARM = 'focuslens-activity-checkpoint';
const SESSION_MARKER = 'focuslens-browser-session';
const CHECKPOINT_PERIOD_MINUTES = 1;

export default defineBackground(() => {
  const store = new IndexedDbActivityStore();
  const tracker = new TrackingEngine(store, {
    idleThresholdMs: IDLE_THRESHOLD_MS,
    maxUnobservedGapMs: 2 * CHECKPOINT_PERIOD_MINUTES * 60_000,
  });
  let workQueue = Promise.resolve();

  const enqueue = (work: () => Promise<void>) => {
    workQueue = workQueue.then(work).catch((error: unknown) => {
      console.error('[FocusLens] Activity update failed.', error);
    });
    return workQueue;
  };

  const synchronize = async (idleOverride?: boolean, focusOverride?: boolean) => {
    const now = Date.now();
    const browserContext = await readBrowserContext();
    const idle = idleOverride ?? (await browser.idle.queryState(IDLE_THRESHOLD_SECONDS)) !== 'active';
    const focused = focusOverride ?? browserContext.focused;
    await tracker.reconcile({
      observedAt: now,
      focused,
      idle,
      context: focused ? browserContext.context : null,
    });
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
    void enqueue(() => synchronize(undefined, noWindowFocused ? false : undefined));
  });
  browser.idle.onStateChanged.addListener((state) => {
    void enqueue(() => synchronize(state !== 'active'));
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CHECKPOINT_ALARM) {
      void enqueue(async () => {
        await synchronize();
        await tracker.checkpoint(Date.now());
      });
    }
  });
  browser.runtime.onInstalled.addListener(() => void enqueue(initialize));
  browser.runtime.onStartup.addListener(() => void enqueue(initialize));

  void enqueue(initialize);
});
