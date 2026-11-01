import { summarizeWebsiteTime, type ProductivitySummary } from '../classification/productivity-summary';
import type { DomainOverride } from '../classification/settings-store';
import type { ActivityRecord } from '../tracking/types';

export interface DailyUsageSummary {
  activeMs: number;
  categories: ProductivitySummary['categoryMs'];
}

/** Clips to the requested local-day window and counts overlapping intervals once. */
export function summarizeDailyUsage(
  records: readonly ActivityRecord[],
  start: number,
  end: number,
  overrides: readonly DomainOverride[] = [],
  openInterval?: { domain: string; startedAt: number; endedAt: number },
): DailyUsageSummary {
  const candidates = [...records, ...(openInterval ? [{ ...openInterval, id: 'open', durationMs: openInterval.endedAt - openInterval.startedAt }] : [])]
    .flatMap((record) => {
      if (!Number.isFinite(record.startedAt) || !Number.isFinite(record.endedAt) || !Number.isFinite(record.durationMs) || record.durationMs <= 0) return [];
      const boundedEnd = Math.min(record.endedAt, record.startedAt + record.durationMs, end);
      const boundedStart = Math.max(record.startedAt, start);
      return boundedEnd > boundedStart ? [{ domain: record.domain, startedAt: boundedStart, endedAt: boundedEnd }] : [];
    })
    .toSorted((left, right) => left.startedAt - right.startedAt || left.endedAt - right.endedAt);

  const uniqueTime: { domain: string; durationMs: number }[] = [];
  let countedUntil = start;
  for (const interval of candidates) {
    const effectiveStart = Math.max(interval.startedAt, countedUntil);
    if (interval.endedAt <= effectiveStart) continue;
    uniqueTime.push({ domain: interval.domain, durationMs: interval.endedAt - effectiveStart });
    countedUntil = interval.endedAt;
  }
  const summary = summarizeWebsiteTime(uniqueTime, overrides);
  return {
    activeMs: Object.values(summary.categoryMs).reduce((total, value) => total + value, 0),
    categories: summary.categoryMs,
  };
}
