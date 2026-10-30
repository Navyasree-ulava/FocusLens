import type { ActivityRecord } from './types';

export function splitIntervalAtLocalMidnights(
  startedAt: number,
  endedAt: number,
  domain: string,
  createId: () => string,
): ActivityRecord[] {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return [];

  const records: ActivityRecord[] = [];
  let cursor = startedAt;

  while (cursor < endedAt) {
    const nextLocalMidnight = new Date(cursor);
    nextLocalMidnight.setHours(24, 0, 0, 0);
    const boundary = Math.min(endedAt, nextLocalMidnight.getTime());

    records.push({
      id: createId(),
      startedAt: cursor,
      endedAt: boundary,
      durationMs: boundary - cursor,
      domain,
    });
    cursor = boundary;
  }

  return records;
}

export function localDayBounds(timestamp: number): { start: number; end: number } {
  const startDate = new Date(timestamp);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);
  return { start: startDate.getTime(), end: endDate.getTime() };
}
