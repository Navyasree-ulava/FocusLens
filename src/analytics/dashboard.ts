import { classifyDomain } from '../classification/classify-domain';
import type { YouTubeSegment, YouTubeSettings } from '../youtube/types';
import { classifyYouTubeVideo } from '../youtube/classify-video';
import type { AIClassification } from '../ai/types';
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

export interface DashboardInsights {
  productiveHour: { hour: number; durationMs: number } | null;
  biggestDistraction: { domain: string; durationMs: number } | null;
  weeklyChangeMs: number;
  thisWeekMs: number;
  previousWeekMs: number;
  learningGoals: { goal: string; durationMs: number }[];
}

function intervalOverlap(record: { startedAt: number; endedAt: number }, start: number, end: number): number {
  return Math.max(0, Math.min(record.endedAt, end) - Math.max(record.startedAt, start));
}

export function buildDashboardInsights(
  records: readonly ActivityRecord[],
  youtube: readonly YouTubeSegment[],
  now: number,
  overrides: readonly DomainOverride[] = [],
  youtubeSettings: YouTubeSettings = { learningGoals: [], overrides: [] },
  aiClassifications: readonly AIClassification[] = [],
): DashboardInsights {
  const today = localDayBounds(now).start;
  const weekStartDate = new Date(today);
  weekStartDate.setDate(weekStartDate.getDate() - 6);
  const weekStart = weekStartDate.getTime();
  const previousStartDate = new Date(weekStart);
  previousStartDate.setDate(previousStartDate.getDate() - 7);
  const previousStart = previousStartDate.getTime();
  const end = localDayBounds(now).end;
  const thisWeekMs = records.reduce((sum, record) => sum + intervalOverlap(record, weekStart, end), 0);
  const previousWeekMs = records.reduce((sum, record) => sum + intervalOverlap(record, previousStart, weekStart), 0);

  const productiveByHour = new Array<number>(24).fill(0);
  const distractionTotals = new Map<string, number>();
  for (const record of records) {
    const start = Math.max(record.startedAt, weekStart);
    const finish = Math.min(record.endedAt, end);
    if (finish <= start) continue;
    const classification = classifyDomain(record.domain, overrides);
    if (classification.productivity === 'recreational') {
      distractionTotals.set(record.domain, (distractionTotals.get(record.domain) ?? 0) + finish - start);
    }
    if (classification.productivity !== 'productive') continue;
    let cursor = start;
    while (cursor < finish) {
      const nextHour = new Date(cursor);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      const boundary = Math.min(finish, nextHour.getTime());
      const hour = new Date(cursor).getHours();
      productiveByHour[hour] = (productiveByHour[hour] ?? 0) + boundary - cursor;
      cursor = boundary;
    }
  }
  const bestHour = Math.max(...productiveByHour);
  const productiveHourIndex = productiveByHour.indexOf(bestHour);
  const distractions = [...distractionTotals].toSorted((a, b) => b[1] - a[1]);
  const learningGoals = youtubeSettings.learningGoals.map((goal) => ({
    goal,
    durationMs: youtube.reduce((sum, segment) => {
      if (segment.playbackState !== 'playing') return sum;
      const category = classifyYouTubeVideo(segment.metadata, { ...youtubeSettings, learningGoals: [goal] },
        aiClassifications.find((item) => item.videoId === segment.metadata.videoId));
      return category.source === 'goal' ? sum + intervalOverlap(segment, weekStart, end) : sum;
    }, 0),
  })).toSorted((a, b) => b.durationMs - a.durationMs);

  return {
    productiveHour: bestHour > 0 ? { hour: productiveHourIndex, durationMs: bestHour } : null,
    biggestDistraction: distractions[0] ? { domain: distractions[0][0], durationMs: distractions[0][1] } : null,
    weeklyChangeMs: thisWeekMs - previousWeekMs,
    thisWeekMs,
    previousWeekMs,
    learningGoals,
  };
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
