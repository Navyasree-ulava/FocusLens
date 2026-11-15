import { describe, expect, it } from 'vitest';
import {
  activityHistoryStart,
  activityLevel,
  activityTooltip,
  buildActivityCalendar,
  buildActivityDays,
  calculateActivityStreaks,
  currentOpenActivity,
  dateFromKey,
  dateKey,
  formatActivityDuration,
  mergeActivityDays,
  MINIMUM_ACTIVE_DAY_MS,
  normalizeActivityRecords,
  todayDateKey,
  trackingStatus,
} from '../src/analytics/activity';
import type { ActivityDay } from '../src/analytics/activity';
import type { ActivityRecord, TrackerState } from '../src/tracking/types';
import { localDayBounds } from '../src/tracking/time';

const record = (id: string, domain: string, startedAt: number, endedAt: number, durationMs = endedAt - startedAt): ActivityRecord => ({
  id, domain, startedAt, endedAt, durationMs,
});

function day(date: number, durationMs: number): ActivityDay {
  const value = new Date(date);
  const dateKey = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return { date, dateKey, durationMs, websites: durationMs ? ['example.com'] : [], recordCount: durationMs ? 1 : 0 };
}

describe('activity aggregation and calendar', () => {
  it('uses one deduplicated interval source for overlapping and inconsistent records', () => {
    const start = new Date(2026, 10, 10).getTime();
    const normalized = normalizeActivityRecords([
      record('first', 'one.example', start + 1_000, start + 61_000),
      record('overlap', 'two.example', start + 31_000, start + 91_000, 120_000),
      record('invalid', 'three.example', start + 100_000, start + 90_000),
    ], start, start + 120_000);

    expect(normalized.map(({ domain, durationMs }) => [domain, durationMs])).toEqual([
      ['one.example', 60_000], ['two.example', 30_000],
    ]);
    const [summary] = buildActivityDays(normalized, start, start + 120_000);
    expect(summary?.durationMs).toBe(90_000);
    expect(summary?.websites).toEqual(['one.example', 'two.example']);
  });

  it('groups activity by local calendar days across midnight and DST-aware day lengths', () => {
    const start = new Date(2026, 10, 10).getTime();
    const midnight = localDayBounds(start).end;
    const days = buildActivityDays([record('spans-midnight', 'example.com', midnight - 30_000, midnight + 90_000)], start, midnight + 120_000);
    expect(days.map(({ durationMs }) => durationMs)).toEqual([30_000, 90_000]);
    expect(days.map(({ dateKey }) => dateKey)).toEqual(['2026-11-10', '2026-11-11']);
  });

  it('builds a twelve-calendar-month, Sunday-aligned heatmap through today', () => {
    const now = new Date(2026, 10, 10, 15).getTime();
    const start = activityHistoryStart(now);
    expect(new Date(start).getFullYear()).toBe(2025);
    expect(new Date(start).getMonth()).toBe(11);
    expect(new Date(start).getDate()).toBe(1);
    const days = buildActivityDays([], start, now + 1);
    const calendar = buildActivityCalendar(days, now);
    expect(calendar.length).toBeGreaterThanOrEqual(48);
    expect(calendar.length).toBeLessThanOrEqual(54);
    expect(calendar.flatMap((week) => week.days)).toHaveLength(calendar.length * 7);
    expect(calendar.at(-1)?.days.some((item) => item.dateKey === '2026-11-10')).toBe(true);
  });

  it('counts current and longest streaks with a one-minute local-day threshold', () => {
    const today = new Date(2026, 10, 10, 12).getTime();
    const todayStart = localDayBounds(today).start;
    const dates = Array.from({ length: 8 }, (_, index) => {
      const date = new Date(todayStart);
      date.setDate(date.getDate() - (7 - index));
      return date.getTime();
    });
    const entries = dates.map((date, index) => day(date, [MINIMUM_ACTIVE_DAY_MS, 5, MINIMUM_ACTIVE_DAY_MS, MINIMUM_ACTIVE_DAY_MS, 0, MINIMUM_ACTIVE_DAY_MS, MINIMUM_ACTIVE_DAY_MS, MINIMUM_ACTIVE_DAY_MS][index] ?? 0));
    entries.push(day(todayStart + 86_400_000, 10 * MINIMUM_ACTIVE_DAY_MS));
    expect(calculateActivityStreaks(entries, today)).toEqual({ current: 3, longest: 3 });
    // With today absent from the summary, the current streak still falls back to yesterday.
    expect(calculateActivityStreaks(entries.slice(0, -2), today)).toEqual({ current: 2, longest: 2 });
  });

  it('shows exact hover details, including sub-minute sessions', () => {
    const start = new Date(2026, 10, 9).getTime();
    const [item] = buildActivityDays([record('short', 'example.com', start, start + 45_000)], start, start + 60_000);
    expect(activityTooltip(item!)).toContain('Monday, November 9, 2026');
    expect(activityTooltip(item!)).toContain('Active browsing: 45s');
    expect(activityTooltip(item!)).toContain('Websites visited: 1');
    expect(activityTooltip(item!)).toContain('Activity intervals: 1');
  });

  it('shows any recorded activity in the heatmap while keeping zero days empty', () => {
    expect(activityLevel(0)).toBe(0);
    expect(activityLevel(15_000)).toBe(1);
    expect(activityLevel(15 * 60_000)).toBe(2);
    expect(activityLevel(60 * 60_000)).toBe(3);
    expect(activityLevel(3 * 60 * 60_000)).toBe(4);
    expect(formatActivityDuration(0)).toBe('0m');
    expect(formatActivityDuration(45_000)).toBe('45s');
    expect(formatActivityDuration(4 * 3_600_000 + 32 * 60_000 + 30_000)).toBe('4h 32m');
  });

  it('keeps local date keys and open activity aligned with the user calendar', () => {
    const start = new Date(2026, 10, 10, 23, 30).getTime();
    const midnight = localDayBounds(start).end;
    expect(dateKey(midnight - 1)).toBe('2026-11-10');
    expect(todayDateKey(midnight + 1)).toBe('2026-11-11');
    expect(dateFromKey('2026-11-11')).toBe(midnight);
    const state: TrackerState = {
      version: 1, updatedAt: start, focused: true, idle: false,
      context: { tabId: 1, windowId: 1, domain: 'example.com' }, intervalStartedAt: start - 600_000,
    };
    expect(currentOpenActivity(state, start, false)).toMatchObject({ domain: 'example.com', durationMs: 600_000 });
    expect(currentOpenActivity(state, start, true)).toBeNull();
    expect(currentOpenActivity({ ...state, idle: true }, start, false)).toBeNull();
    expect(currentOpenActivity({ ...state, focused: false }, start, false)).toBeNull();
  });

  it('merges full-history days with fresher recent days so old streaks still count', () => {
    const today = new Date(2026, 10, 10, 9).getTime();
    const todayStart = localDayBounds(today).start;
    const oldDay = new Date(todayStart);
    oldDay.setMonth(oldDay.getMonth() - 14);
    const oldDate = oldDay.getTime();
    const oldRun = [0, 1, 2].map((offset) => day(localDayBounds(oldDate + offset * 86_400_000).start, 5 * MINIMUM_ACTIVE_DAY_MS));
    const recent = [day(localDayBounds(todayStart - 86_400_000).start, 5 * MINIMUM_ACTIVE_DAY_MS), day(todayStart, 5 * MINIMUM_ACTIVE_DAY_MS)];
    const merged = mergeActivityDays(oldRun, recent);
    expect(merged).toHaveLength(5);
    expect(calculateActivityStreaks(merged, today)).toEqual({ current: 2, longest: 3 });
    const withFourDayRun = mergeActivityDays([...oldRun, day(localDayBounds(oldDate + 3 * 86_400_000).start, 5 * MINIMUM_ACTIVE_DAY_MS)], recent);
    expect(calculateActivityStreaks(withFourDayRun, today).longest).toBe(4);
  });

  it('prefers the fresher day when merging duplicate local dates', () => {
    const date = localDayBounds(new Date(2026, 10, 10, 9).getTime()).start;
    const stale = day(date, MINIMUM_ACTIVE_DAY_MS);
    const fresh = { ...stale, durationMs: 90 * 60_000, websites: ['a.example', 'b.example'], recordCount: 2 };
    expect(mergeActivityDays([stale], [fresh])).toEqual([fresh]);
    expect(mergeActivityDays([fresh], [stale])).toEqual([stale]);
  });

  it('starts the current streak from yesterday when today is below the minimum', () => {
    const today = new Date(2026, 10, 10, 9).getTime();
    const todayStart = localDayBounds(today).start;
    const previous = (offset: number) => {
      const value = new Date(todayStart);
      value.setDate(value.getDate() - offset);
      return value.getTime();
    };
    const days = [day(previous(2), 5 * MINIMUM_ACTIVE_DAY_MS), day(previous(1), 5 * MINIMUM_ACTIVE_DAY_MS), day(todayStart, 30_000)];
    expect(calculateActivityStreaks(days, today)).toEqual({ current: 2, longest: 2 });
  });

  it('explains status from pause, focus, idle, and eligible-tab state', () => {
    expect(trackingStatus(null, false)).toBe('Starting');
    expect(trackingStatus({ version: 1, updatedAt: 1, focused: true, idle: false, context: null, intervalStartedAt: null }, false)).toBe('No website tab to track');
    expect(trackingStatus({ version: 1, updatedAt: 1, focused: false, idle: false, context: null, intervalStartedAt: null }, false)).toBe('Browser window unfocused');
    expect(trackingStatus({ version: 1, updatedAt: 1, focused: true, idle: true, context: null, intervalStartedAt: null }, false)).toBe('Paused while idle');
    expect(trackingStatus({ version: 1, updatedAt: 1, focused: true, idle: false, context: null, intervalStartedAt: null }, true)).toBe('Paused in Settings');
  });
});
