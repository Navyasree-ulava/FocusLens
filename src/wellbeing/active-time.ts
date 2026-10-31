import type { ActivityRecord } from '../tracking/types';

export function activeDurationBetween(
  records: readonly ActivityRecord[],
  startedAt: number,
  endedAt: number,
  openInterval?: { startedAt: number; endedAt: number } | null,
): number {
  const intervals = records.map(({ startedAt: start, endedAt: end }) => [Math.max(start, startedAt), Math.min(end, endedAt)] as const);
  if (openInterval) intervals.push([Math.max(openInterval.startedAt, startedAt), Math.min(openInterval.endedAt, endedAt)]);
  const sorted = intervals.filter(([start, end]) => end > start).toSorted((left, right) => left[0] - right[0]);
  let total = 0;
  let currentStart: number | null = null;
  let currentEnd = 0;
  for (const [start, end] of sorted) {
    if (currentStart === null) { currentStart = start; currentEnd = end; continue; }
    if (start <= currentEnd) currentEnd = Math.max(currentEnd, end);
    else { total += currentEnd - currentStart; currentStart = start; currentEnd = end; }
  }
  return total + (currentStart === null ? 0 : currentEnd - currentStart);
}
