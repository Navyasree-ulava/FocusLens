import { classifyYouTubeVideo } from './classify-video';
import type { YouTubeCategory, YouTubeSegment, YouTubeSettings } from './types';

export interface YouTubeSummary {
  activeViewingMs: number;
  educationalViewingMs: number;
  entertainmentViewingMs: number;
  shortsMs: number;
  pausedMs: number;
  bufferingMs: number;
  browsingMs: number;
  unknownViewingMs: number;
  categoryMs: Record<YouTubeCategory, number>;
}

export interface WatchedVideo {
  videoId: string;
  title: string | null;
  channelName: string | null;
  videoUrl: string;
  durationMs: number;
}

export interface WatchedChannel {
  channelName: string;
  durationMs: number;
}

const EDUCATIONAL_CATEGORIES = new Set<YouTubeCategory>([
  'Technical Learning',
  'Educational',
  'Professional Development',
]);
const ENTERTAINMENT_CATEGORIES = new Set<YouTubeCategory>(['Entertainment', 'Music', 'Gaming']);

export function summarizeYouTubeTime(
  records: readonly YouTubeSegment[],
  settings: YouTubeSettings = { learningGoals: [], overrides: [] },
): YouTubeSummary {
  const categoryMs = Object.fromEntries(
    ['Technical Learning', 'Educational', 'Professional Development', 'News', 'Entertainment', 'Music', 'Gaming', 'Shorts / Casual Browsing', 'Unknown']
      .map((category) => [category, 0]),
  ) as Record<YouTubeCategory, number>;
  const summary: YouTubeSummary = {
    activeViewingMs: 0,
    educationalViewingMs: 0,
    entertainmentViewingMs: 0,
    shortsMs: 0,
    pausedMs: 0,
    bufferingMs: 0,
    browsingMs: 0,
    unknownViewingMs: 0,
    categoryMs,
  };

  for (const record of records) {
    if (!Number.isFinite(record.durationMs) || record.durationMs <= 0) continue;
    const category = classifyYouTubeVideo(record.metadata, settings).category;
    categoryMs[category] += record.durationMs;
    if (record.playbackState === 'paused') summary.pausedMs += record.durationMs;
    else if (record.playbackState === 'buffering') summary.bufferingMs += record.durationMs;
    else if (record.playbackState === 'browsing') summary.browsingMs += record.durationMs;
    else {
      summary.activeViewingMs += record.durationMs;
      if (EDUCATIONAL_CATEGORIES.has(category)) summary.educationalViewingMs += record.durationMs;
      else if (ENTERTAINMENT_CATEGORIES.has(category)) summary.entertainmentViewingMs += record.durationMs;
      else if (category === 'Shorts / Casual Browsing') summary.shortsMs += record.durationMs;
      else if (category === 'Unknown') summary.unknownViewingMs += record.durationMs;
    }
  }
  return summary;
}

export function mostWatchedVideos(records: readonly YouTubeSegment[], limit = 5): WatchedVideo[] {
  const totals = new Map<string, WatchedVideo>();
  for (const record of records) {
    const { videoId, title, channelName, videoUrl } = record.metadata;
    if (record.playbackState !== 'playing' || !videoId || !videoUrl || record.durationMs <= 0) continue;
    const current = totals.get(videoId);
    if (current) current.durationMs += record.durationMs;
    else totals.set(videoId, { videoId, title, channelName, videoUrl, durationMs: record.durationMs });
  }
  return [...totals.values()].toSorted((left, right) => right.durationMs - left.durationMs).slice(0, limit);
}

export function mostWatchedChannels(records: readonly YouTubeSegment[], limit = 5): WatchedChannel[] {
  const totals = new Map<string, WatchedChannel>();
  for (const record of records) {
    const channelName = record.metadata.channelName?.trim();
    if (record.playbackState !== 'playing' || !channelName || record.durationMs <= 0) continue;
    const key = channelName.toLocaleLowerCase();
    const current = totals.get(key);
    if (current) current.durationMs += record.durationMs;
    else totals.set(key, { channelName, durationMs: record.durationMs });
  }
  return [...totals.values()].toSorted((left, right) => right.durationMs - left.durationMs).slice(0, limit);
}
