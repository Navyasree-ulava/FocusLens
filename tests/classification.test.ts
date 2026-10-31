import { beforeEach, describe, expect, it } from 'vitest';
import { classifyDomain } from '../src/classification/classify-domain';
import { normalizeDomain } from '../src/classification/normalize-domain';
import { summarizeWebsiteTime } from '../src/classification/productivity-summary';
import { deleteDomainOverride, DOMAIN_OVERRIDES_STORAGE_KEY, loadDomainOverrides, parseDomainOverrides, saveDomainOverride } from '../src/classification/settings-store';

beforeEach(async () => {
  await browser.storage.local.clear();
});

describe('website classification', () => {
  it('uses conservative purpose defaults and leaves mixed-use domains neutral', () => {
    expect(classifyDomain('github.com')).toMatchObject({ category: 'Coding & Development', productivity: 'neutral', source: 'default' });
    expect(classifyDomain('linkedin.com')).toMatchObject({ category: 'Social Media', productivity: 'neutral', source: 'default' });
    expect(classifyDomain('youtube.com')).toMatchObject({ category: 'Entertainment', productivity: 'neutral', source: 'default' });
    expect(classifyDomain('khanacademy.org')).toMatchObject({ category: 'Learning', productivity: 'productive', source: 'default' });
    expect(classifyDomain('shop.example')).toMatchObject({ category: 'Unknown', productivity: 'unknown', source: 'unknown' });
  });

  it('matches domain suffixes on label boundaries and chooses the most specific rule', () => {
    const rules = [
      { domain: 'example.com', category: 'Social Media' as const, productivity: 'neutral' as const, updatedAt: 1 },
      { domain: 'work.example.com', category: 'Professional Work' as const, productivity: 'productive' as const, updatedAt: 2 },
    ];
    expect(classifyDomain('mail.work.example.com', rules)).toMatchObject({ category: 'Professional Work', source: 'user' });
    expect(classifyDomain('notexample.com', rules).category).toBe('Unknown');
  });

  it('normalizes pasted domains and rejects browser-internal schemes', () => {
    expect(normalizeDomain(' www.Example.com ')).toBe('example.com');
    expect(normalizeDomain('https://www.Example.com/path?query=secret')).toBe('example.com');
    expect(normalizeDomain('chrome://settings')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
  });

  it('drops malformed stored overrides and keeps valid entries', () => {
    expect(parseDomainOverrides([
      { domain: 'not a domain', category: 'Learning', productivity: 'productive', updatedAt: 1 },
      { domain: 'example.com', category: 'Social Media', productivity: 'recreational', updatedAt: 2 },
      { domain: 'missing-intent.com', category: 'Unknown', productivity: 'productive', updatedAt: 3 },
    ])).toEqual([
      { domain: 'example.com', category: 'Social Media', productivity: 'recreational', updatedAt: 2 },
    ]);
  });

  it('persists and removes user rules in local extension storage', async () => {
    const saved = await saveDomainOverride({ domain: 'www.Example.com', category: 'Social Media', productivity: 'productive' });
    expect(saved).toHaveLength(1);
    expect(saved.at(0)?.domain).toBe('example.com');
    expect(await loadDomainOverrides()).toEqual(saved);
    expect((await browser.storage.local.get(DOMAIN_OVERRIDES_STORAGE_KEY))[DOMAIN_OVERRIDES_STORAGE_KEY]).toEqual(saved);
    expect(await deleteDomainOverride('example.com')).toEqual([]);
    expect(await loadDomainOverrides()).toEqual([]);
  });

  it('aggregates stored time by category and excludes unknown time from the ratio', () => {
    const summary = summarizeWebsiteTime([
      { domain: 'khanacademy.org', durationMs: 100 },
      { domain: 'youtube.com', durationMs: 200 },
      { domain: 'steamcommunity.com', durationMs: 100 },
      { domain: 'unlisted.example', durationMs: 50 },
      { domain: 'reddit.com', durationMs: -1 },
    ]);
    expect(summary).toMatchObject({
      productiveMs: 100,
      neutralMs: 200,
      recreationalMs: 100,
      unknownMs: 50,
      classifiedMs: 400,
      productivityRatio: 0.25,
    });
    expect(summary.categoryMs.Entertainment).toBe(200);
    expect(summary.categoryMs.Gaming).toBe(100);
    expect(summary.categoryMs.Unknown).toBe(50);
  });

  it('returns no ratio when there is no classified browsing time', () => {
    expect(summarizeWebsiteTime([]).productivityRatio).toBeNull();
    expect(summarizeWebsiteTime([{ domain: 'unlisted.example', durationMs: 10 }]).productivityRatio).toBeNull();
  });
});
