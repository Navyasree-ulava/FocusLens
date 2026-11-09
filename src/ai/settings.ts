import { z } from 'zod';
import { AI_PROVIDERS, type AIProvider, type AISettings } from './types';

export const AI_SETTINGS_KEY = 'focuslens.ai-settings';
export const AI_API_KEY_SESSION_KEY = 'focuslens.ai-api-key';
export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  provider: 'jev',
  endpoint: 'http://127.0.0.1:8000/v1/classifier',
  model: '',
};

export const AI_PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  jev: 'http://127.0.0.1:8000/v1/classifier',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  grok: 'https://api.x.ai/v1/responses',
  openai: 'https://api.openai.com/v1/responses',
};

const settingsSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(AI_PROVIDERS).default(DEFAULT_AI_SETTINGS.provider),
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
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const endpoint = typeof candidate.endpoint === 'string' ? candidate.endpoint : DEFAULT_AI_SETTINGS.endpoint;
  const inferredProvider: AIProvider = endpoint.includes('generativelanguage.googleapis.com')
    ? 'gemini'
    : endpoint.includes('api.x.ai') ? 'grok' : endpoint.endsWith('/v1/classifier') ? 'jev' : 'openai';
  const parsed = settingsSchema.safeParse({ ...candidate, provider: candidate.provider ?? inferredProvider });
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
  if (!parsed.enabled || parsed.provider === 'jev') await browser.storage.session.remove(AI_API_KEY_SESSION_KEY);
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

export function endpointForProvider(provider: AIProvider): string {
  return AI_PROVIDER_ENDPOINTS[provider];
}
