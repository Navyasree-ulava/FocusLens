import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbActivityStore } from '../src/tracking/indexeddb-store';
import { endFocusSession, focusSessionElapsedMs, pauseFocusSession, resumeFocusSession, startFocusSession, summarizeFocusSession } from '../src/wellbeing/focus-sessions';
import { isExcludedDomain, loadWellbeingSettings, parseWellbeingSettings, saveWellbeingSettings, WELLBEING_SETTINGS_KEY } from '../src/wellbeing/settings-store';
import type { ActivityRecord } from '../src/tracking/types';
import { activeDurationBetween } from '../src/wellbeing/active-time';

beforeEach(async () => browser.storage.local.clear());

describe('focus sessions', () => {
  it('validates a goal and supports start, pause, resume, and end transitions', () => {
    expect(() => startFocusSession(' ', 25, 1)).toThrow('Add a focus goal first.');
    expect(() => startFocusSession('Read', 2, 1)).toThrow('Choose a session');
    const started = startFocusSession('Read documentation', 25, 1_000, 'session-1');
    const paused = pauseFocusSession(started, 6_000);
    const resumed = resumeFocusSession(paused, 10_000);
    const ended = endFocusSession(resumed, 20_000);
    expect(paused).toMatchObject({ status: 'paused', blocks: [{ startedAt: 1_000, endedAt: 6_000 }] });
    expect(resumed.status).toBe('active');
    expect(resumed.blocks[1]).toEqual({ startedAt: 10_000, endedAt: null });
    expect(ended).toMatchObject({ status: 'completed', endedAt: 20_000, blocks: [{ startedAt: 1_000, endedAt: 6_000 }, { startedAt: 10_000, endedAt: 20_000 }] });
    expect(focusSessionElapsedMs(ended)).toBe(15_000);
  });

  it('summarizes only activity overlapping active session blocks', () => {
    const session = startFocusSession('Study', 25, 1_000, 'session-2');
    const records: ActivityRecord[] = [
      { id: 'before', domain: 'docs.google.com', startedAt: 0, endedAt: 1_000, durationMs: 1_000 },
      { id: 'productive', domain: 'developer.mozilla.org', startedAt: 2_000, endedAt: 7_000, durationMs: 5_000 },
      { id: 'recreational', domain: 'youtube.com', startedAt: 7_000, endedAt: 9_000, durationMs: 2_000 },
      { id: 'unknown', domain: 'some-unknown-site.example', startedAt: 9_000, endedAt: 10_000, durationMs: 1_000 },
      { id: 'after', domain: 'example.com', startedAt: 12_000, endedAt: 15_000, durationMs: 3_000 },
    ];
    const summary = summarizeFocusSession(session, records, [], 10_000);
    expect(summary).toEqual({ focusedMs: 8_000, productiveMs: 5_000, recreationalMs: 0, neutralMs: 2_000, unknownMs: 1_000 });
  });

  it('persists focus sessions and clears them with local activity data', async () => {
    const database = new IndexedDbActivityStore(`focuslens-session-${crypto.randomUUID()}`);
    const session = startFocusSession('Plan project', 50, 2_000);
    await database.saveFocusSession(session);
    expect(await database.listFocusSessions()).toEqual([session]);
    await database.clearAllData();
    expect(await database.listFocusSessions()).toEqual([]);
  });
});

describe('wellbeing settings', () => {
  it('normalizes excluded domains, persists daily goals, pause and reminder preferences', async () => {
    const parsed = parseWellbeingSettings({ dailyGoalMinutes: 180, trackingPaused: true, excludedDomains: ['https://Work.Example/path', 'work.example'], breakReminders: true, breakReminderMinutes: 30 });
    expect(parsed).toEqual({ dailyGoalMinutes: 180, trackingPaused: true, excludedDomains: ['work.example'], breakReminders: true, breakReminderMinutes: 30, distractionReminders: false, distractionReminderMinutes: 30 });
    await saveWellbeingSettings(parsed);
    expect(await loadWellbeingSettings()).toEqual(parsed);
    expect((await browser.storage.local.get(WELLBEING_SETTINGS_KEY))[WELLBEING_SETTINGS_KEY]).toEqual(parsed);
  });

  it('excludes a domain and its subdomains only', () => {
    expect(isExcludedDomain('mail.private.example', ['private.example'])).toBe(true);
    expect(isExcludedDomain('notprivate.example', ['private.example'])).toBe(false);
    expect(isExcludedDomain('other.example', ['private.example'])).toBe(false);
  });
});

describe('active time reminders', () => {
  it('counts only active interval overlap since the last reminder', () => {
    const records: ActivityRecord[] = [
      { id: 'before', domain: 'example.com', startedAt: 0, endedAt: 10_000, durationMs: 10_000 },
      { id: 'active', domain: 'example.com', startedAt: 10_000, endedAt: 40_000, durationMs: 30_000 },
    ];
    expect(activeDurationBetween(records, 5_000, 35_000, { startedAt: 30_000, endedAt: 50_000 })).toBe(30_000);
    expect(activeDurationBetween(records, 35_000, 45_000)).toBe(5_000);
  });
});
