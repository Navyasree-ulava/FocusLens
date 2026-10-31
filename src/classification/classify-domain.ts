import { defaultProductivityFor, type ProductivityValue, type WebsiteCategory } from './categories';
import { DOMAIN_RULES } from './domain-rules';
import { normalizeDomain } from './normalize-domain';
import type { DomainOverride } from './settings-store';

export interface WebsiteClassification {
  domain: string;
  category: WebsiteCategory;
  productivity: ProductivityValue;
  source: 'default' | 'user' | 'unknown';
}

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function classifyDomain(host: string, overrides: readonly DomainOverride[] = []): WebsiteClassification {
  const domain = normalizeDomain(host);
  if (!domain) return { domain: '', category: 'Unknown', productivity: 'unknown', source: 'unknown' };

  const override = [...overrides]
    .filter((item) => matchesDomain(domain, item.domain))
    .sort((left, right) => right.domain.length - left.domain.length)[0];
  if (override) {
    return { domain, category: override.category, productivity: override.productivity, source: 'user' };
  }

  const rule = DOMAIN_RULES.find((item) => matchesDomain(domain, item.domain));
  if (!rule) return { domain, category: 'Unknown', productivity: 'unknown', source: 'unknown' };
  return {
    domain,
    category: rule.category,
    productivity: rule.productivity ?? defaultProductivityFor(rule.category),
    source: 'default',
  };
}
