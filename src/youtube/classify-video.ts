import { YOUTUBE_CATEGORIES, type ClassifiedYouTubeSegment, type YouTubeCategory, type YouTubeSegment, type YouTubeSettings, type YouTubeVideoMetadata } from './types';

export interface YouTubeClassification {
  category: YouTubeCategory;
  source: 'goal' | 'user' | 'metadata' | 'short' | 'unknown';
}

const TECHNICAL_TERMS = [
  'programming', 'coding', 'javascript', 'typescript', 'python', 'react', 'software engineering',
  'data structures', 'algorithms', 'computer science', 'machine learning', 'deep learning', 'devops',
  'web development', 'database', 'api design', 'system design', 'terminal', 'linux tutorial',
];
const PROFESSIONAL_TERMS = [
  'career development', 'job interview', 'interview skills', 'resume writing', 'leadership',
  'workplace communication', 'project management', 'business skills', 'professional development',
];
const NEWS_TERMS = ['news', 'breaking', 'headlines', 'current affairs', 'election results', 'press briefing'];
const GAMING_TERMS = ['gameplay', 'playthrough', 'walkthrough', 'gaming', 'speedrun', 'let us play', "let's play"];
const MUSIC_TERMS = ['official music video', 'lyrics video', 'official audio', 'live performance', 'full album', 'song', 'music'];
const EDUCATIONAL_TERMS = [
  'lecture', 'lesson', 'explained', 'explainer', 'documentary', 'science', 'history', 'mathematics',
  'learn', 'education', 'classroom', 'experiment', 'how it works', 'tutorial', 'beginner guide',
];
const ENTERTAINMENT_TERMS = ['comedy', 'funny', 'challenge', 'vlog', 'reaction', 'prank', 'trailer', 'sketch', 'compilation'];

function normalizedText(value: string): string {
  return value.normalize('NFKD').toLocaleLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function includesTerm(text: string, term: string): boolean {
  return ` ${text} `.includes(` ${normalizedText(term)} `);
}

function matchesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => includesTerm(text, term));
}

export function normalizeYouTubeChannel(channelName: string | null): string {
  return normalizedText(channelName ?? '').replace(/^@/, '');
}

export function classifyYouTubeVideo(
  metadata: YouTubeVideoMetadata,
  settings: YouTubeSettings = { learningGoals: [], overrides: [] },
): YouTubeClassification {
  const videoOverride = metadata.videoId
    ? settings.overrides.find((item) => item.scope === 'video' && item.key === metadata.videoId)
    : undefined;
  if (videoOverride) return { category: videoOverride.category, source: 'user' };

  const channelKey = normalizeYouTubeChannel(metadata.channelName);
  const channelOverride = channelKey
    ? settings.overrides.find((item) => item.scope === 'channel' && item.key === channelKey)
    : undefined;
  if (channelOverride) return { category: channelOverride.category, source: 'user' };

  const title = normalizedText(metadata.title ?? '');
  const channel = normalizeYouTubeChannel(metadata.channelName);
  const content = `${title} ${channel}`.trim();
  if (settings.learningGoals.some((goal) => includesTerm(title, goal))) {
    return {
      category: matchesAny(content, TECHNICAL_TERMS) ? 'Technical Learning' : 'Educational',
      source: 'goal',
    };
  }

  if (metadata.isShort) return { category: 'Shorts / Casual Browsing', source: 'short' };
  if (matchesAny(content, TECHNICAL_TERMS)) return { category: 'Technical Learning', source: 'metadata' };
  if (matchesAny(content, PROFESSIONAL_TERMS)) return { category: 'Professional Development', source: 'metadata' };
  if (matchesAny(content, NEWS_TERMS)) return { category: 'News', source: 'metadata' };
  if (matchesAny(content, GAMING_TERMS)) return { category: 'Gaming', source: 'metadata' };
  if (matchesAny(content, MUSIC_TERMS)) return { category: 'Music', source: 'metadata' };
  if (matchesAny(content, EDUCATIONAL_TERMS)) return { category: 'Educational', source: 'metadata' };
  if (matchesAny(content, ENTERTAINMENT_TERMS)) return { category: 'Entertainment', source: 'metadata' };
  return { category: 'Unknown', source: 'unknown' };
}

export function classifyYouTubeSegment(
  segment: YouTubeSegment,
  settings: YouTubeSettings,
): ClassifiedYouTubeSegment {
  const classification = classifyYouTubeVideo(segment.metadata, settings);
  return { ...segment, category: classification.category, classificationSource: classification.source };
}

export function isYouTubeCategory(value: string): value is YouTubeCategory {
  return (YOUTUBE_CATEGORIES as readonly string[]).includes(value);
}
