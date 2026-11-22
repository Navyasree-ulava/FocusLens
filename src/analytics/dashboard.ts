import { classifyDomain } from '../classification/classify-domain';
import type { DomainOverride } from '../classification/settings-store';
import type { ActivityRecord } from '../tracking/types';
import type { ProductivityValue, WebsiteCategory } from '../classification/categories';
import { getDomain } from 'tldts';

export interface WebsiteUsage {
  domain: string;
  durationMs: number;
  category: WebsiteCategory;
  productivity: ProductivityValue;
}

/** Expects normalized activity intervals so dashboard totals share one de-duplicated source. */
export function buildWebsiteUsage(records: readonly ActivityRecord[], overrides: readonly DomainOverride[] = []): WebsiteUsage[] {
  const totals = new Map<string, number>();
  for (const record of records) {
    const root = getDomain(record.domain, { allowPrivateDomains: true }) ?? record.domain;
    totals.set(root, (totals.get(root) ?? 0) + record.durationMs);
  }
  return [...totals].map(([domain, durationMs]) => {
    const classification = classifyDomain(domain, overrides);
    return { domain, durationMs, category: classification.category, productivity: classification.productivity };
  }).toSorted((left, right) => right.durationMs - left.durationMs || left.domain.localeCompare(right.domain));
}
