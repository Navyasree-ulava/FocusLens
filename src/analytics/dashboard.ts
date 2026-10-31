import { classifyDomain } from '../classification/classify-domain';
import type { DomainOverride } from '../classification/settings-store';
import type { ActivityRecord } from '../tracking/types';
import { localDayBounds } from '../tracking/time';

export interface DailyUsage {
  date: number;
  label: string;
  durationMs: number;
}

export interface WebsiteUsage {
  domain: string;
  durationMs: number;
  category: string;
  productivity: string;
}

export interface TimelineEntry {
  startedAt: number;
  endedAt: number;
  domain: string;
  durationMs: number;
}

export function buildDailyUsage(records: readonly ActivityRecord[], now: number, days = 7): DailyUsage[] {
  const today = localDayBounds(now).start;
  return Array.from({ length: days }, (_, index) => {
    const dateValue = new Date(today);
    dateValue.setDate(dateValue.getDate() - (days - index - 1));
    const date = dateValue.getTime();
    const bounds = localDayBounds(date);
    const durationMs = records.reduce((total, record) => {
      const overlap = Math.max(0, Math.min(record.endedAt, bounds.end) - Math.max(record.startedAt, bounds.start));
      return total + overlap;
    }, 0);
    return { date, label: new Date(date).toLocaleDateString(undefined, { weekday: 'short' }), durationMs };
  });
}

export function buildWebsiteUsage(records: readonly ActivityRecord[], overrides: readonly DomainOverride[] = []): WebsiteUsage[] {
  const totals = new Map<string, number>();
  for (const record of records) totals.set(record.domain, (totals.get(record.domain) ?? 0) + record.durationMs);
  return [...totals].map(([domain, durationMs]) => {
    const classification = classifyDomain(domain, overrides);
    return { domain, durationMs, category: classification.category, productivity: classification.productivity };
  }).toSorted((left, right) => right.durationMs - left.durationMs);
}

export function buildTimeline(records: readonly ActivityRecord[]): TimelineEntry[] {
  return records.filter((record) => record.durationMs > 0)
    .map(({ startedAt, endedAt, domain, durationMs }) => ({ startedAt, endedAt, domain, durationMs }))
    .toSorted((left, right) => right.startedAt - left.startedAt);
}
