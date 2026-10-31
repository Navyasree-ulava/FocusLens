export const YOUTUBE_CATEGORIES = [
  'Technical Learning',
  'Educational',
  'Professional Development',
  'News',
  'Entertainment',
  'Music',
  'Gaming',
  'Shorts / Casual Browsing',
  'Unknown',
] as const;

export type YouTubeCategory = (typeof YOUTUBE_CATEGORIES)[number];

export const YOUTUBE_PLAYBACK_STATES = ['playing', 'paused', 'buffering', 'browsing'] as const;
export type YouTubePlaybackState = (typeof YOUTUBE_PLAYBACK_STATES)[number];

export interface YouTubeVideoMetadata {
  videoId: string | null;
  title: string | null;
  channelName: string | null;
  videoUrl: string | null;
  isShort: boolean;
}

export interface YouTubePageState {
  metadata: YouTubeVideoMetadata;
  playbackState: YouTubePlaybackState;
}

export interface YouTubeSegment extends YouTubePageState {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface YouTubeRuleOverride {
  scope: 'video' | 'channel';
  key: string;
  category: YouTubeCategory;
  updatedAt: number;
}

export interface YouTubeSettings {
  learningGoals: string[];
  overrides: YouTubeRuleOverride[];
}

export interface ClassifiedYouTubeSegment extends YouTubeSegment {
  category: YouTubeCategory;
  classificationSource: 'goal' | 'user' | 'metadata' | 'short' | 'unknown';
}
