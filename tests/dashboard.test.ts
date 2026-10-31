import { describe, expect, it } from 'vitest';
import { buildDailyUsage, buildTimeline, buildWebsiteUsage } from '../src/analytics/dashboard';
import type { ActivityRecord } from '../src/tracking/types';

const localDate = (year: number, month: number, day: number, hour = 12) => new Date(year, month, day, hour).getTime();
const record = (id: string, domain: string, startedAt: number, durationMs: number): ActivityRecord => ({
  id, domain, startedAt, durationMs, endedAt: startedAt + durationMs,
});

describe('dashboard analytics', () => {
  it('builds actual local-day totals from interval overlap', () => {
    const now = localDate(2026, 2, 9);
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const records = [record('today', 'example.com', today.getTime() + 60_000, 120_000), record('yesterday', 'example.com', yesterday.getTime(), 300_000)];
    expect(buildDailyUsage(records, now, 2).map((item) => item.durationMs)).toEqual([300_000, 120_000]);
  });

  it('ranks visited domains using their stored time and current user classifications', () => {
    const records = [record('a', 'youtube.com', 1, 10_000), record('b', 'example.com', 2, 30_000), record('c', 'youtube.com', 3, 5_000)];
    expect(buildWebsiteUsage(records, [{ domain: 'youtube.com', category: 'Learning', productivity: 'productive', updatedAt: 1 }])).toEqual([
      { domain: 'example.com', durationMs: 30_000, category: 'Unknown', productivity: 'unknown' },
      { domain: 'youtube.com', durationMs: 15_000, category: 'Learning', productivity: 'productive' },
    ]);
  });

  it('shows timeline entries newest first and returns a true empty list', () => {
    const entries = [record('old', 'old.example', 1, 5), record('new', 'new.example', 9, 1)];
    expect(buildTimeline(entries).map((item) => item.domain)).toEqual(['new.example', 'old.example']);
    expect(buildTimeline([])).toEqual([]);
  });
});
