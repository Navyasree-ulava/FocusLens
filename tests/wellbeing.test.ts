import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbActivityStore } from '../src/tracking/indexeddb-store';
import { isExcludedDomain, loadWellbeingSettings, parseWellbeingSettings, saveWellbeingSettings, WELLBEING_SETTINGS_KEY } from '../src/wellbeing/settings-store';
import type { FocusSession } from '../src/wellbeing/types';

beforeEach(async () => browser.storage.local.clear());

describe('older stored data', () => {
  it('keeps legacy focus-session records accessible without making them part of the tracker', async () => {
    const database = new IndexedDbActivityStore(`focuslens-legacy-session-${crypto.randomUUID()}`);
    const session: FocusSession = {
      id: 'legacy-session', goal: 'Plan a project', targetMinutes: 25, status: 'completed',
      startedAt: 1_000, updatedAt: 2_000, endedAt: 2_000,
      blocks: [{ startedAt: 1_000, endedAt: 2_000 }],
    };
    await database.saveFocusSession(session);
    expect(await database.listFocusSessions()).toEqual([session]);
    expect((await database.exportData()).activity).toEqual([]);
  });
});

describe('wellbeing settings', () => {
  it('normalizes excluded domains and preserves tracking preferences from older settings', async () => {
    const parsed = parseWellbeingSettings({ minimumActiveDayMinutes: 5, trackingPaused: true, excludedDomains: ['https://Work.Example/path', 'work.example'], dailyGoalMinutes: 180, breakReminders: true });
    expect(parsed).toEqual({ minimumActiveDayMinutes: 5, trackingPaused: true, excludedDomains: ['work.example'] });
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
