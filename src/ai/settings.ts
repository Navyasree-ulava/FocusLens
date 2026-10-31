import { z } from 'zod';
import type { AISettings } from './types';

export const AI_SETTINGS_KEY = 'focuslens.ai-settings';
export const AI_API_KEY_SESSION_KEY = 'focuslens.ai-api-key';
export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  endpoint: 'https://api.openai.com/v1/responses',
  model: '',
};

const settingsSchema = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().trim().url().max(500).default(DEFAULT_AI_SETTINGS.endpoint),
  model: z.string().trim().max(100).default(''),
}).refine(({ endpoint }) => {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch { return false; }
}, { message: 'Use HTTPS, or localhost for a local provider.', path: ['endpoint'] }).refine(({ endpoint }) => {
  const url = new URL(endpoint);
  return !url.username && !url.password && !url.search && !url.hash;
}, { message: 'Endpoint cannot include credentials, a query, or a fragment.', path: ['endpoint'] });

export function parseAISettings(value: unknown): AISettings {
  const parsed = settingsSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_AI_SETTINGS };
}

export async function loadAISettings(): Promise<AISettings> {
  const stored = await browser.storage.local.get(AI_SETTINGS_KEY);
  return parseAISettings(stored[AI_SETTINGS_KEY]);
}

export async function saveAISettings(settings: AISettings): Promise<AISettings> {
  const parsed = settingsSchema.parse(settings);
  if (parsed.enabled && !parsed.model) throw new Error('Enter a model name before enabling AI classification.');
  await browser.storage.local.set({ [AI_SETTINGS_KEY]: parsed });
  if (!parsed.enabled) await browser.storage.session.remove(AI_API_KEY_SESSION_KEY);
  return parsed;
}

export async function saveAIAPIKey(key: string): Promise<void> {
  const value = key.trim();
  if (value.length < 8 || value.length > 300) throw new Error('Enter a valid API key.');
  await browser.storage.session.set({ [AI_API_KEY_SESSION_KEY]: value });
}

export async function loadAIAPIKey(): Promise<string | null> {
  const session = await browser.storage.session.get(AI_API_KEY_SESSION_KEY);
  const key = session[AI_API_KEY_SESSION_KEY];
  return typeof key === 'string' && key.length > 0 ? key : null;
}

export function aiEndpointOrigin(endpoint: string): string {
  return new URL(settingsSchema.parse({ ...DEFAULT_AI_SETTINGS, endpoint }).endpoint).origin;
}

export function aiHostPermissionPattern(endpoint: string): string {
  const url = new URL(settingsSchema.parse({ ...DEFAULT_AI_SETTINGS, endpoint }).endpoint);
  return `${url.protocol}//${url.hostname}/*`;
}
