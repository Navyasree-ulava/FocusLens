import { z } from 'zod';
import { normalizeDomain } from '../classification/normalize-domain';
import type { WellbeingSettings } from './types';

export const WELLBEING_SETTINGS_KEY = 'focuslens.wellbeing-settings';
export const DEFAULT_WELLBEING_SETTINGS: WellbeingSettings = {
  dailyGoalMinutes: 120,
  trackingPaused: false,
  excludedDomains: [],
  breakReminders: false,
  breakReminderMinutes: 50,
  distractionReminders: false,
  distractionReminderMinutes: 30,
};

const settingsSchema = z.object({
  dailyGoalMinutes: z.number().int().min(15).max(1440).default(120),
  trackingPaused: z.boolean().default(false),
  excludedDomains: z.array(z.string().max(253)).max(200).default([]),
  breakReminders: z.boolean().default(false),
  breakReminderMinutes: z.number().int().min(20).max(180).default(50),
  distractionReminders: z.boolean().default(false),
  distractionReminderMinutes: z.number().int().min(10).max(120).default(30),
}).strip();

export function parseWellbeingSettings(value: unknown): WellbeingSettings {
  const result = settingsSchema.safeParse(value);
  if (!result.success) return { ...DEFAULT_WELLBEING_SETTINGS };
  const excludedDomains = [...new Set(result.data.excludedDomains.flatMap((raw) => {
    const domain = normalizeDomain(raw);
    return domain ? [domain] : [];
  }))].slice(0, 200);
  return { ...result.data, excludedDomains };
}

export async function loadWellbeingSettings(): Promise<WellbeingSettings> {
  const stored = await browser.storage.local.get(WELLBEING_SETTINGS_KEY);
  return parseWellbeingSettings(stored[WELLBEING_SETTINGS_KEY]);
}

export async function saveWellbeingSettings(settings: WellbeingSettings): Promise<WellbeingSettings> {
  const parsed = parseWellbeingSettings(settings);
  await browser.storage.local.set({ [WELLBEING_SETTINGS_KEY]: parsed });
  return parsed;
}

export function isExcludedDomain(host: string, excludedDomains: readonly string[]): boolean {
  const domain = normalizeDomain(host);
  return Boolean(domain && excludedDomains.some((excluded) => domain === excluded || domain.endsWith(`.${excluded}`)));
}
