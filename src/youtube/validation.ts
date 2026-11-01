import { z } from 'zod';
import { YOUTUBE_PLAYBACK_STATES } from './types';

const videoIdSchema = z.string().regex(/^[\w-]{11}$/).nullable();

export const youtubeMetadataSchema = z.object({
  videoId: videoIdSchema,
  title: z.string().max(300).nullable(),
  channelName: z.string().max(200).nullable(),
  videoUrl: z.string().url().nullable(),
  isShort: z.boolean(),
}).strict().refine((metadata) => {
  if (metadata.videoId === null) return metadata.videoUrl === null && !metadata.isShort;
  if (!metadata.videoUrl) return false;
  try {
    const url = new URL(metadata.videoUrl);
    if (url.origin !== 'https://www.youtube.com') return false;
    const validWatch = !metadata.isShort && url.pathname === '/watch' && url.searchParams.get('v') === metadata.videoId;
    const validShort = url.pathname === `/shorts/${metadata.videoId}` && metadata.isShort;
    return validWatch || validShort;
  } catch {
    return false;
  }
}, { message: 'Video URL must be a canonical YouTube URL for its video ID.' });

export const youtubePageStateSchema = z.object({
  metadata: youtubeMetadataSchema,
  playbackState: z.enum(YOUTUBE_PLAYBACK_STATES),
}).strict();

export const youtubeSegmentSchema = youtubePageStateSchema.extend({
  id: z.string().uuid(),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
}).strict().refine((segment) => segment.endedAt > segment.startedAt && segment.durationMs === segment.endedAt - segment.startedAt, {
  message: 'YouTube segment duration must match its start and end timestamps.',
  path: ['durationMs'],
});

export const youtubeContextMessageSchema = z.object({
  type: z.literal('focuslens-youtube-context'),
  active: z.boolean(),
  observedAt: z.number().int().nonnegative(),
  checkpoint: z.boolean().optional(),
}).strict();

export const youtubeContextResponseSchema = z.object({
  active: z.boolean(),
  observedAt: z.number().int().nonnegative(),
}).strict();

export const youtubeContentMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('focuslens-youtube-context-request') }).strict(),
  z.object({ type: z.literal('focuslens-youtube-segment'), segment: youtubeSegmentSchema }).strict(),
  z.object({
    type: z.literal('focuslens-youtube-page-state'),
    pageState: youtubePageStateSchema,
    active: z.boolean(),
    segmentStartedAt: z.number().int().nonnegative().nullable(),
  }).strict(),
]);

export const youtubeCurrentStateSchema = z.object({
  tabId: z.number().int().nonnegative(),
  active: z.boolean(),
  pageState: youtubePageStateSchema,
  segmentStartedAt: z.number().int().nonnegative().nullable(),
  updatedAt: z.number().int().nonnegative(),
}).strict();
