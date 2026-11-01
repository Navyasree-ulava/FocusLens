import { describe, expect, it } from 'vitest';
import { summarizeDailyUsage } from '../src/analytics/daily-usage';
import type { ActivityRecord } from '../src/tracking/types';

const hour = 60 * 60_000;
const record = (id: string, domain: string, startedAt: number, endedAt: number, durationMs = endedAt - startedAt): ActivityRecord => ({
  id, domain, startedAt, endedAt, durationMs,
});

describe('daily usage summary', () => {
  it('clips to today and counts overlapping or corrupt stored intervals once', () => {
    const dayStart = new Date(2026, 9, 31).getTime();
    const now = dayStart + 12 * hour;
    const result = summarizeDailyUsage([
      record('first', 'learn.example', dayStart + 8 * hour, dayStart + 10 * hour),
      record('overlap', 'fun.example', dayStart + 9 * hour, dayStart + 11 * hour),
      // Simulates stale/corrupt data that claims over a day of use beyond the current time.
      record('long', 'learn.example', dayStart + 11 * hour, dayStart + 54 * hour, 43 * hour),
    ], dayStart, now, [
      { domain: 'learn.example', category: 'Learning', productivity: 'productive', updatedAt: now },
      { domain: 'fun.example', category: 'Entertainment', productivity: 'recreational', updatedAt: now },
    ], { domain: 'fun.example', startedAt: dayStart + 11.5 * hour, endedAt: now });

    expect(result.activeMs).toBe(4 * hour);
    expect(result.categories.Learning).toBe(3 * hour);
    expect(result.categories.Entertainment).toBe(hour);
    expect(result.activeMs).toBeLessThanOrEqual(now - dayStart);
  });
});
