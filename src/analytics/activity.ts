import type { ActivityRecord, TrackerState } from '../tracking/types';
import { localDayBounds } from '../tracking/time';

export const MINIMUM_ACTIVE_DAY_MS = 60_000;
export const ACTIVITY_HISTORY_MONTHS = 12;

export interface ActivityDay {
  date: number;
  dateKey: string;
  durationMs: number;
  websites: string[];
  recordCount: number;
}

export interface ActivityWeek {
  days: ActivityDay[];
  monthLabel: string | null;
}

export interface ActivityStreaks {
  current: number;
  longest: number;
}

export type TrackingStatus =
  | 'Starting'
  | 'Tracking active tab'
  | 'Paused in Settings'
  | 'Browser window unfocused'
  | 'Paused while idle'
  | 'No website tab to track';

export function dateKey(timestamp: Date | number): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateFromKey(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year!, month! - 1, day!).getTime();
}

export function todayDateKey(now: number): string {
  return dateKey(localDayBounds(now).start);
}

/** Whole minutes above a minute, exact seconds below it, so short intervals stay honest. */
export function formatActivityDuration(durationMs: number): string {
  const milliseconds = Math.max(0, Math.floor(durationMs));
  if (milliseconds < 60_000) return milliseconds === 0 ? '0m' : `${Math.max(1, Math.floor(milliseconds / 1_000))}s`;
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatDayLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/**
 * 0 means no activity at all. Any recorded activity is at least level 1, even
 * below the one-minute streak minimum, so an active day never looks empty.
 */
export function activityLevel(durationMs: number): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  if (durationMs < 15 * 60_000) return 1;
  if (durationMs < 60 * 60_000) return 2;
  if (durationMs < 3 * 60 * 60_000) return 3;
  return 4;
}

export function activityHistoryStart(now: number): number {
  const start = new Date(localDayBounds(now).start);
  start.setDate(1);
  start.setMonth(start.getMonth() - (ACTIVITY_HISTORY_MONTHS - 1));
  return start.getTime();
}

/** Returns chronological, valid intervals with overlapping time counted only once. */
export function normalizeActivityRecords(
  records: readonly ActivityRecord[],
  start: number,
  end: number,
): ActivityRecord[] {
  const candidates = records.flatMap((record) => {
    if (!Number.isFinite(record.startedAt) || !Number.isFinite(record.endedAt) ||
      !Number.isFinite(record.durationMs) || record.durationMs <= 0 || record.endedAt <= record.startedAt) return [];
    const boundedStart = Math.max(start, record.startedAt);
    const boundedEnd = Math.min(end, record.endedAt, record.startedAt + record.durationMs);
    return boundedEnd > boundedStart ? [{ ...record, startedAt: boundedStart, endedAt: boundedEnd }] : [];
  }).toSorted((left, right) => left.startedAt - right.startedAt || left.endedAt - right.endedAt || left.id.localeCompare(right.id));

  let countedUntil = start;
  return candidates.flatMap((record) => {
    const startedAt = Math.max(record.startedAt, countedUntil);
    if (record.endedAt <= startedAt) return [];
    const normalized = { ...record, startedAt, durationMs: record.endedAt - startedAt };
    countedUntil = record.endedAt;
    return [normalized];
  });
}

export function buildActivityDays(
  records: readonly ActivityRecord[],
  start: number,
  end: number,
): ActivityDay[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const firstDay = localDayBounds(start).start;
  const lastDay = localDayBounds(Math.max(start, end - 1)).start;
  const days: ActivityDay[] = [];
  const dayByStart = new Map<number, ActivityDay>();
  for (let day = firstDay; day <= lastDay;) {
    const item: ActivityDay = { date: day, dateKey: dateKey(day), durationMs: 0, websites: [], recordCount: 0 };
    days.push(item);
    dayByStart.set(day, item);
    day = localDayBounds(day).end;
  }

  for (const record of records) {
    let cursor = record.startedAt;
    while (cursor < record.endedAt) {
      const bounds = localDayBounds(cursor);
      const day = dayByStart.get(bounds.start);
      const segmentEnd = Math.min(bounds.end, record.endedAt);
      if (day && segmentEnd > cursor) {
        day.durationMs += segmentEnd - cursor;
        day.recordCount += 1;
        if (!day.websites.includes(record.domain)) day.websites.push(record.domain);
      }
      cursor = segmentEnd;
    }
  }
  return days;
}

export function buildActivityCalendar(days: readonly ActivityDay[], now: number): ActivityWeek[] {
  if (!days.length) return [];
  const first = new Date(days[0]!.date);
  first.setDate(first.getDate() - first.getDay());
  const last = new Date(localDayBounds(now).start);
  last.setDate(last.getDate() + (6 - last.getDay()));

  const byDate = new Map(days.map((day) => [day.dateKey, day]));
  const weeks: ActivityWeek[] = [];
  const cursor = new Date(first);
  while (cursor <= last) {
    const entries: ActivityDay[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const key = dateKey(cursor);
      entries.push(byDate.get(key) ?? { date: cursor.getTime(), dateKey: key, durationMs: 0, websites: [], recordCount: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    const firstOfMonth = entries.find((day) => new Date(day.date).getDate() === 1 && day.date >= days[0]!.date);
    weeks.push({
      days: entries,
      monthLabel: (firstOfMonth || weeks.length === 0) && entries.some((day) => day.date >= days[0]!.date && day.date <= localDayBounds(now).start)
        ? new Date((firstOfMonth ?? entries[0]!).date).toLocaleDateString(undefined, { month: 'short' })
        : null,
    });
  }
  return weeks;
}

/** Combines day summaries, preferring the fresher entry when the same date appears twice. */
export function mergeActivityDays(base: readonly ActivityDay[], current: readonly ActivityDay[]): ActivityDay[] {
  const byDate = new Map(base.map((day) => [day.dateKey, day]));
  for (const day of current) byDate.set(day.dateKey, day);
  return [...byDate.values()].toSorted((left, right) => left.date - right.date);
}

export function calculateActivityStreaks(days: readonly ActivityDay[], now: number, minimumMs = MINIMUM_ACTIVE_DAY_MS): ActivityStreaks {
  const todayStart = localDayBounds(now).start;
  const eligible = days.filter((day) => day.date <= todayStart)
    .toSorted((left, right) => left.date - right.date);
  const active = (day: ActivityDay | undefined) => Boolean(day && day.durationMs >= minimumMs);
  const byDateKey = new Map(eligible.map((day) => [day.dateKey, day]));
  const runLengths = new Map<string, number>();
  let longest = 0;

  // Adjacency is calendar-based, not array-based: full-history and sparse inputs can skip days.
  for (const day of eligible) {
    if (!active(day)) continue;
    const previous = new Date(day.date);
    previous.setDate(previous.getDate() - 1);
    const run = (runLengths.get(dateKey(previous)) ?? 0) + 1;
    runLengths.set(day.dateKey, run);
    longest = Math.max(longest, run);
  }

  const cursor = new Date(todayStart);
  if (!active(byDateKey.get(todayDateKey(now)))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (active(byDateKey.get(dateKey(cursor)))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

export function activityTooltip(day: ActivityDay): string {
  return `${formatDayLabel(day.date)}\nActive browsing: ${formatActivityDuration(day.durationMs)}\nWebsites visited: ${day.websites.length}\nActivity intervals: ${day.recordCount}`;
}

export function trackingStatus(state: TrackerState | null, paused: boolean): TrackingStatus {
  if (paused) return 'Paused in Settings';
  if (!state) return 'Starting';
  if (state.intervalStartedAt !== null && state.context && state.focused && !state.idle) return 'Tracking active tab';
  if (!state.focused) return 'Browser window unfocused';
  if (state.idle) return 'Paused while idle';
  return 'No website tab to track';
}

export function currentOpenActivity(state: TrackerState | null, now: number, paused: boolean): ActivityRecord | null {
  if (!state || paused || !state.focused || state.idle || state.intervalStartedAt === null || !state.context) return null;
  const startedAt = Math.max(state.intervalStartedAt, activityHistoryStart(now));
  if (now <= startedAt) return null;
  return { id: 'current-open', domain: state.context.domain, startedAt, endedAt: now, durationMs: now - startedAt };
}
