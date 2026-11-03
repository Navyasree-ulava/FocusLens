import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbActivityStore } from '../src/tracking/indexeddb-store';
import { TrackingEngine } from '../src/tracking/engine';
import { contextFromWindow, getTrackableDomain, readBrowserContext } from '../src/tracking/browser-context';
import { localDayBounds, splitIntervalAtLocalMidnights } from '../src/tracking/time';
import type { BrowserSnapshot } from '../src/tracking/types';

let databaseNumber = 0;
let idNumber = 0;

function createEngine() {
  const databaseName = `focuslens-test-${databaseNumber++}`;
  const store = new IndexedDbActivityStore(databaseName);
  return { databaseName, store, engine: new TrackingEngine(store, { idleThresholdMs: 60_000, createId: () => `record-${idNumber++}` }) };
}

function snapshot(observedAt: number, overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
  return {
    observedAt,
    focused: true,
    idle: false,
    context: { tabId: 1, windowId: 2, domain: 'learn.example' },
    ...overrides,
  };
}

afterEach(() => { idNumber = 0; vi.restoreAllMocks(); });

describe('tracking engine', () => {
  it('records consecutive active-tab intervals without overlap', async () => {
    const { store, engine } = createEngine();
    await engine.reconcile(snapshot(1_000));
    await engine.reconcile(snapshot(8_000, { context: { tabId: 3, windowId: 2, domain: 'docs.example' } }));
    await engine.checkpoint(15_000);
    await engine.reconcile(snapshot(20_000, { focused: false, context: null }));

    const records = await store.listRecords(0, 30_000);
    expect(records.map(({ domain, startedAt, endedAt }) => [domain, startedAt, endedAt])).toEqual([
      ['learn.example', 1_000, 8_000],
      ['docs.example', 8_000, 15_000],
      ['docs.example', 15_000, 20_000],
    ]);
    expect(records.reduce((sum, record) => sum + record.durationMs, 0)).toBe(19_000);
    expect(records.every((record) => record.endedAt > record.startedAt)).toBe(true);
  });

  it('excludes the idle threshold and the remaining idle period', async () => {
    const { store, engine } = createEngine();
    await engine.reconcile(snapshot(0));
    await engine.reconcile(snapshot(90_000, { idle: true }));
    await engine.reconcile(snapshot(100_000, { idle: false }));
    await engine.reconcile(snapshot(110_000, { focused: false, context: null }));

    const records = await store.listRecords(0, 200_000);
    expect(records.map(({ startedAt, endedAt }) => [startedAt, endedAt])).toEqual([[0, 30_000], [100_000, 110_000]]);
  });

  it('keeps an open interval across service-worker recreation and closes it once', async () => {
    const { databaseName, engine } = createEngine();
    await engine.reconcile(snapshot(1_000));
    const restartedStore = new IndexedDbActivityStore(databaseName);
    const restartedEngine = new TrackingEngine(restartedStore, { idleThresholdMs: 60_000, createId: () => `record-${idNumber++}` });
    await restartedEngine.reconcile(snapshot(5_000));
    await restartedEngine.reconcile(snapshot(9_000, { focused: false, context: null }));

    const records = await restartedStore.listRecords(0, 20_000);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ startedAt: 1_000, endedAt: 9_000, durationMs: 8_000 });
  });

  it('closes browser-shutdown gaps at the last durable checkpoint', async () => {
    const { store, engine } = createEngine();
    await engine.reconcile(snapshot(1_000));
    await engine.checkpoint(5_000);
    await engine.endPreviousBrowserSession(100_000);
    await engine.reconcile(snapshot(110_000));
    await engine.reconcile(snapshot(115_000, { focused: false, context: null }));

    const records = await store.listRecords(0, 120_000);
    expect(records.map(({ startedAt, endedAt }) => [startedAt, endedAt])).toEqual([[1_000, 5_000], [110_000, 115_000]]);
  });

  it('does not count a long unobserved gap after delayed browser events', async () => {
    const databaseName = `focuslens-test-${databaseNumber++}`;
    const store = new IndexedDbActivityStore(databaseName);
    const engine = new TrackingEngine(store, {
      idleThresholdMs: 60_000,
      maxUnobservedGapMs: 120_000,
      createId: () => `record-${idNumber++}`,
    });
    await engine.reconcile(snapshot(1_000));
    await engine.checkpoint(60_000);
    await engine.reconcile(snapshot(600_000));
    await engine.reconcile(snapshot(610_000, { focused: false, context: null }));

    const records = await store.listRecords(0, 700_000);
    expect(records.map(({ startedAt, endedAt }) => [startedAt, endedAt])).toEqual([[1_000, 60_000], [600_000, 610_000]]);
  });

  it('splits long intervals at the device local midnight', () => {
    const today = localDayBounds(new Date(2026, 9, 30, 12).getTime());
    const records = splitIntervalAtLocalMidnights(today.start - 10_000, today.start + 10_000, 'example.com', () => `id-${idNumber++}`);
    expect(records.map(({ startedAt, endedAt, durationMs }) => [startedAt, endedAt, durationMs])).toEqual([
      [today.start - 10_000, today.start, 10_000],
      [today.start, today.start + 10_000, 10_000],
    ]);
  });

  it('stores only a normalized hostname and ignores non-web URLs', () => {
    expect(getTrackableDomain('https://Sub.Example.com:8443/path?secret=1#fragment')).toBe('sub.example.com');
    expect(getTrackableDomain('chrome://settings')).toBeNull();
    expect(getTrackableDomain('file:///private/document.pdf')).toBeNull();
    expect(getTrackableDomain('not a URL')).toBeNull();
  });

  it('keeps the active website available while the extension popup is open', () => {
    const lastFocusedWindow = {
      focused: false,
      id: 12,
      incognito: false,
      tabs: [{ active: true, id: 7, incognito: false, url: 'https://focus.example/path' }],
    } as Browser.windows.Window;

    expect(contextFromWindow(lastFocusedWindow)).toEqual({ focused: false, context: null });
    expect(contextFromWindow(lastFocusedWindow, true)).toEqual({
      focused: true,
      context: { tabId: 7, windowId: 12, domain: 'focus.example' },
    });
  });

  it('reads the last normal browser window when the extension popup is open', async () => {
    const getLastFocused = vi.spyOn(browser.windows, 'getLastFocused').mockResolvedValue({
      focused: false,
      id: 12,
      incognito: false,
      type: 'normal',
      tabs: [],
    } as never);
    const queryTabs = vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { active: true, id: 7, windowId: 12, incognito: false, url: 'https://youtube.com/watch?v=abcdefghijk' },
    ] as never);
    await expect(readBrowserContext(true)).resolves.toEqual({
      focused: true,
      context: { tabId: 7, windowId: 12, domain: 'youtube.com' },
    });
    expect(getLastFocused).toHaveBeenCalledWith({ windowTypes: ['normal'] });
    expect(queryTabs).toHaveBeenCalledWith({ active: true, windowId: 12 });
  });

  it('recovers the active tab when Chromium omits populated tabs from that window', async () => {
    const getLastFocused = vi.spyOn(browser.windows, 'getLastFocused').mockResolvedValue({
      focused: false, id: 12, incognito: false, type: 'normal', tabs: [],
    } as never);
    const queryTabs = vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { active: true, id: 7, windowId: 12, incognito: false, url: 'https://youtube.com/watch?v=abcdefghijk' },
    ] as never);
    await expect(readBrowserContext(true)).resolves.toEqual({
      focused: true,
      context: { tabId: 7, windowId: 12, domain: 'youtube.com' },
    });
    expect(getLastFocused).toHaveBeenCalledWith({ windowTypes: ['normal'] });
    expect(queryTabs).toHaveBeenCalledWith({ active: true, windowId: 12 });
  });
});

