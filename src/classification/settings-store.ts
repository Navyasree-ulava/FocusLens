import { z } from 'zod';
import { PRODUCTIVITY_VALUES, WEBSITE_CATEGORIES, type ProductivityValue, type WebsiteCategory } from './categories';
import { normalizeDomain } from './normalize-domain';

export const DOMAIN_OVERRIDES_STORAGE_KEY = 'focuslens.domain-overrides';

const domainOverrideSchema = z.object({
  domain: z.string().min(1).max(253).refine((domain) => normalizeDomain(domain) === domain),
  category: z.enum(WEBSITE_CATEGORIES),
  productivity: z.enum(PRODUCTIVITY_VALUES),
  updatedAt: z.number().int().nonnegative(),
}).refine((override) => override.category !== 'Unknown' || override.productivity === 'unknown', {
  message: 'Unknown websites must use the unknown productivity value.',
  path: ['productivity'],
});

const overridesSchema = z.array(domainOverrideSchema);

export type DomainOverride = z.infer<typeof domainOverrideSchema>;

export interface DomainOverrideInput {
  domain: string;
  category: WebsiteCategory;
  productivity: ProductivityValue;
}

export function parseDomainOverrides(value: unknown): DomainOverride[] {
  const parsed = overridesSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const result = domainOverrideSchema.safeParse(candidate);
    return result.success ? [result.data] : [];
  });
}

let mutationQueue: Promise<void> = Promise.resolve();

export async function loadDomainOverrides(): Promise<DomainOverride[]> {
  const stored = await browser.storage.local.get(DOMAIN_OVERRIDES_STORAGE_KEY);
  return parseDomainOverrides(stored[DOMAIN_OVERRIDES_STORAGE_KEY]);
}

export function saveDomainOverride(input: DomainOverrideInput): Promise<DomainOverride[]> {
  return queueMutation(async () => {
    const domain = normalizeDomain(input.domain);
    if (!domain) throw new Error('Enter a valid website domain.');
    const override = domainOverrideSchema.parse({ ...input, domain, updatedAt: Date.now() });
    const current = await loadDomainOverrides();
    const next = [...current.filter((item) => item.domain !== domain), override]
      .toSorted((left, right) => left.domain.localeCompare(right.domain));
    await browser.storage.local.set({ [DOMAIN_OVERRIDES_STORAGE_KEY]: next });
    return next;
  });
}

export function deleteDomainOverride(domain: string): Promise<DomainOverride[]> {
  return queueMutation(async () => {
    const normalized = normalizeDomain(domain);
    if (!normalized) return loadDomainOverrides();
    const next = (await loadDomainOverrides()).filter((item) => item.domain !== normalized);
    await browser.storage.local.set({ [DOMAIN_OVERRIDES_STORAGE_KEY]: next });
    return next;
  });
}

function queueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(mutation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}
