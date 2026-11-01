import { describe, expect, it } from 'vitest';
import { buildDailyUsage, buildDashboardInsights, buildTimeline, buildWebsiteUsage } from '../src/analytics/dashboard';
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

  it('builds weekly insights from classified intervals and goal-matched playback', () => {
    const now = localDate(2026, 2, 20, 12);
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const daysAgo = (days: number, hour = 9) => {
      const date = new Date(today); date.setDate(date.getDate() - days); date.setHours(hour);
      return date.getTime();
    };
    const records = [
      record('productive-morning', 'work.test', daysAgo(1, 9), 2 * 60 * 60_000),
      record('productive-afternoon', 'work.test', daysAgo(2, 14), 60 * 60_000),
      record('recreation', 'fun.test', daysAgo(1, 16), 4 * 60 * 60_000),
      record('previous-week', 'fun.test', daysAgo(9), 10 * 60 * 60_000),
    ];
    const youtube = [{
      id: 'goal-video', startedAt: daysAgo(1), endedAt: daysAgo(1) + 20 * 60_000, durationMs: 20 * 60_000,
      playbackState: 'playing' as const,
      metadata: { videoId: 'python-video', title: 'Python for beginners', channelName: 'Code class', videoUrl: 'https://youtube.com/watch?v=python-video', isShort: false },
    }];
    const insights = buildDashboardInsights(records, youtube, now, [
      { domain: 'work.test', category: 'Professional Work', productivity: 'productive', updatedAt: now },
      { domain: 'fun.test', category: 'Entertainment', productivity: 'recreational', updatedAt: now },
    ], { learningGoals: ['Python'], overrides: [] });

    expect(insights.productiveHour?.hour).toBe(9);
    expect(insights.biggestDistraction).toEqual({ domain: 'fun.test', durationMs: 4 * 60 * 60_000 });
    expect(insights.thisWeekMs).toBe(7 * 60 * 60_000);
    expect(insights.previousWeekMs).toBe(10 * 60 * 60_000);
    expect(insights.learningGoals).toEqual([{ goal: 'Python', durationMs: 20 * 60_000 }]);
  });
});
