import { z } from 'zod';
import { YOUTUBE_CATEGORIES, type YouTubeCategory, type YouTubeRuleOverride, type YouTubeSettings } from './types';
import { normalizeYouTubeChannel } from './classify-video';

export const YOUTUBE_SETTINGS_STORAGE_KEY = 'focuslens.youtube-settings';
const DEFAULT_SETTINGS: YouTubeSettings = { learningGoals: [], overrides: [] };

const overrideSchema = z.object({
  scope: z.enum(['video', 'channel']),
  key: z.string().min(1).max(100),
  category: z.enum(YOUTUBE_CATEGORIES),
  updatedAt: z.number().int().nonnegative(),
}).refine((override) => override.scope !== 'video' || /^[\w-]{11}$/.test(override.key), {
  message: 'A video override needs a valid video ID.',
  path: ['key'],
});

let settingsQueue: Promise<void> = Promise.resolve();

export function parseYouTubeSettings(value: unknown): YouTubeSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
  const candidate = value as { learningGoals?: unknown; overrides?: unknown };
  const goals = Array.isArray(candidate.learningGoals)
    ? [...new Map(candidate.learningGoals.flatMap((goal) => {
        const parsedGoal = z.string().trim().min(1).max(80).safeParse(goal);
        return parsedGoal.success ? [[parsedGoal.data.toLocaleLowerCase(), parsedGoal.data] as const] : [];
      })).values()].slice(0, 40)
    : [];
  const overrides = Array.isArray(candidate.overrides)
    ? candidate.overrides.flatMap((item) => {
        const parsedOverride = overrideSchema.safeParse(item);
        if (!parsedOverride.success) return [];
        const override = parsedOverride.data;
        const key = override.scope === 'channel' ? normalizeYouTubeChannel(override.key) : override.key;
        return key ? [{ ...override, key }] : [];
      }).slice(0, 200)
    : [];
  return { learningGoals: goals, overrides };
}

export async function loadYouTubeSettings(): Promise<YouTubeSettings> {
  const stored = await browser.storage.local.get(YOUTUBE_SETTINGS_STORAGE_KEY);
  return parseYouTubeSettings(stored[YOUTUBE_SETTINGS_STORAGE_KEY]);
}

export function saveLearningGoal(goal: string): Promise<YouTubeSettings> {
  return mutateSettings((settings) => {
    const value = goal.trim().slice(0, 80);
    if (!value) throw new Error('Enter a learning goal.');
    if (!settings.learningGoals.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      if (settings.learningGoals.length >= 40) throw new Error('You can save up to 40 learning goals.');
      settings.learningGoals.push(value);
    }
  });
}

export function deleteLearningGoal(goal: string): Promise<YouTubeSettings> {
  return mutateSettings((settings) => {
    settings.learningGoals = settings.learningGoals.filter((item) => item.toLocaleLowerCase() !== goal.toLocaleLowerCase());
  });
}

export function saveYouTubeOverride(
  scope: YouTubeRuleOverride['scope'],
  key: string,
  category: YouTubeCategory,
): Promise<YouTubeSettings> {
  return mutateSettings((settings) => {
    const normalizedKey = scope === 'channel' ? normalizeYouTubeChannel(key) : key.trim();
    const override = overrideSchema.parse({ scope, key: normalizedKey, category, updatedAt: Date.now() });
    if (!settings.overrides.some((item) => item.scope === scope && item.key === normalizedKey) && settings.overrides.length >= 200) {
      throw new Error('You can save up to 200 YouTube rules.');
    }
    settings.overrides = [
      ...settings.overrides.filter((item) => item.scope !== scope || item.key !== normalizedKey),
      override,
    ];
  });
}

export function deleteYouTubeOverride(scope: YouTubeRuleOverride['scope'], key: string): Promise<YouTubeSettings> {
  return mutateSettings((settings) => {
    const normalizedKey = scope === 'channel' ? normalizeYouTubeChannel(key) : key.trim();
    settings.overrides = settings.overrides.filter((item) => item.scope !== scope || item.key !== normalizedKey);
  });
}

function mutateSettings(mutation: (settings: YouTubeSettings) => void): Promise<YouTubeSettings> {
  const operation = settingsQueue.then(async () => {
    const next = parseYouTubeSettings(await loadYouTubeSettings());
    mutation(next);
    await browser.storage.local.set({ [YOUTUBE_SETTINGS_STORAGE_KEY]: next });
    return next;
  });
  settingsQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
