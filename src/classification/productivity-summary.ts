import type { ProductivityValue, WebsiteCategory } from './categories';
import { classifyDomain } from './classify-domain';
import type { DomainOverride } from './settings-store';

export interface DomainDuration {
  domain: string;
  durationMs: number;
}

export interface ProductivitySummary {
  productiveMs: number;
  recreationalMs: number;
  neutralMs: number;
  unknownMs: number;
  classifiedMs: number;
  productivityRatio: number | null;
  categoryMs: Record<WebsiteCategory, number>;
}

function addValue(summary: ProductivitySummary, value: ProductivityValue, durationMs: number): void {
  if (value === 'productive') summary.productiveMs += durationMs;
  else if (value === 'recreational') summary.recreationalMs += durationMs;
  else if (value === 'neutral') summary.neutralMs += durationMs;
  else summary.unknownMs += durationMs;
}

export function summarizeWebsiteTime(
  records: readonly DomainDuration[],
  overrides: readonly DomainOverride[] = [],
): ProductivitySummary {
  const categoryMs: Record<WebsiteCategory, number> = {
    Learning: 0,
    'Coding & Development': 0,
    Documentation: 0,
    Academic: 0,
    'Professional Work': 0,
    Communication: 0,
    'Social Media': 0,
    Entertainment: 0,
    Gaming: 0,
    Shopping: 0,
    Unknown: 0,
  };
  const summary: ProductivitySummary = {
    productiveMs: 0,
    recreationalMs: 0,
    neutralMs: 0,
    unknownMs: 0,
    classifiedMs: 0,
    productivityRatio: null,
    categoryMs,
  };

  for (const record of records) {
    if (!Number.isFinite(record.durationMs) || record.durationMs <= 0) continue;
    const classification = classifyDomain(record.domain, overrides);
    categoryMs[classification.category] += record.durationMs;
    addValue(summary, classification.productivity, record.durationMs);
  }

  summary.classifiedMs = summary.productiveMs + summary.recreationalMs + summary.neutralMs;
  summary.productivityRatio = summary.classifiedMs > 0
    ? summary.productiveMs / summary.classifiedMs
    : null;
  return summary;
}
