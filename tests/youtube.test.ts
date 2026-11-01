import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbActivityStore } from '../src/tracking/indexeddb-store';
import { classifyYouTubeVideo } from '../src/youtube/classify-video';
import { clipYouTubeSegments, mostWatchedChannels, mostWatchedVideos, summarizeYouTubeTime } from '../src/youtube/summary';
import { deleteLearningGoal, deleteYouTubeOverride, loadYouTubeSettings, parseYouTubeSettings, saveLearningGoal, saveYouTubeOverride, YOUTUBE_SETTINGS_STORAGE_KEY } from '../src/youtube/settings-store';
import { youtubeSegmentSchema } from '../src/youtube/validation';
import { readPlaybackState, readYouTubeMetadata } from '../src/youtube/metadata';
import { YouTubeSegmentTracker } from '../src/youtube/tracker';
import { isYouTubeHost } from '../src/youtube/hosts';
import type { YouTubePageState, YouTubeSegment, YouTubeSettings } from '../src/youtube/types';

const metadata = {
  videoId: 'abcdefghijk',
  title: 'React Hooks Tutorial for Beginners',
  channelName: 'Code School',
  videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  isShort: false,
};
const settings: YouTubeSettings = { learningGoals: [], overrides: [] };

function pageState(overrides: Partial<YouTubePageState> = {}): YouTubePageState {
  return { metadata, playbackState: 'playing', ...overrides };
}

function segment(overrides: Partial<YouTubeSegment> = {}): YouTubeSegment {
  return {
    id: crypto.randomUUID(),
    ...pageState(),
    startedAt: 1_000,
    endedAt: 2_000,
    durationMs: 1_000,
    ...overrides,
  };
}

beforeEach(async () => {
  await browser.storage.local.clear();
});

describe('YouTube metadata and classification', () => {
  it('recognizes both the YouTube apex and www host', () => {
    expect(isYouTubeHost('youtube.com')).toBe(true);
    expect(isYouTubeHost('www.youtube.com')).toBe(true);
    expect(isYouTubeHost('m.youtube.com')).toBe(false);
    expect(isYouTubeHost('youtube.com.attacker.example')).toBe(false);
  });

  it('extracts only the canonical video ID URL and detects Shorts paths', () => {
    const document = {
      querySelector: (selector: string) => selector === 'title'
        ? { tagName: 'TITLE', textContent: 'React Hooks Tutorial for Beginners - YouTube' }
        : null,
    } as unknown as Document;
    const watch = readYouTubeMetadata(new URL('https://www.youtube.com/watch?v=abcdefghijk&list=private'), document);
    expect(watch).toMatchObject({
      videoId: 'abcdefghijk',
      title: 'React Hooks Tutorial for Beginners',
      videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      isShort: false,
    });
    const short = readYouTubeMetadata(new URL('https://www.youtube.com/shorts/abcdefghijk?feature=share'), document);
    expect(short).toMatchObject({ videoId: 'abcdefghijk', isShort: true, videoUrl: 'https://www.youtube.com/shorts/abcdefghijk' });
    expect(readYouTubeMetadata(new URL('https://www.youtube.com/watch?v=bad'), document).videoId).toBeNull();
  });

  it('distinguishes playing, paused, buffering, and browsing states', () => {
    const video = { paused: false, ended: false, readyState: 3 } as HTMLVideoElement;
    expect(readPlaybackState(video)).toBe('playing');
    expect(readPlaybackState({ ...video, readyState: 2 } as HTMLVideoElement)).toBe('buffering');
    expect(readPlaybackState({ ...video, paused: true } as HTMLVideoElement)).toBe('paused');
    expect(readPlaybackState(null)).toBe('browsing');
    expect(readPlaybackState({ ...video, ended: true } as HTMLVideoElement)).toBe('browsing');
  });

  it('uses video and channel preferences before metadata heuristics', () => {
    expect(classifyYouTubeVideo(metadata, {
      learningGoals: ['react'],
      overrides: [{ scope: 'video', key: metadata.videoId!, category: 'Entertainment', updatedAt: 1 }],
    })).toEqual({ category: 'Entertainment', source: 'user' });
    expect(classifyYouTubeVideo({ ...metadata, videoId: 'zyxwvutsrqp', title: 'A day in my life' }, {
      learningGoals: [],
      overrides: [{ scope: 'channel', key: 'code school', category: 'Educational', updatedAt: 1 }],
    })).toEqual({ category: 'Educational', source: 'user' });
  });

  it('uses learning goals and available title metadata without labeling every video', () => {
    expect(classifyYouTubeVideo(metadata, { learningGoals: ['react'], overrides: [] })).toEqual({ category: 'Technical Learning', source: 'goal' });
    expect(classifyYouTubeVideo({ ...metadata, title: 'An introduction to world history' }, settings).category).toBe('Educational');
    expect(classifyYouTubeVideo({ ...metadata, title: 'Breaking news and headlines' }, settings).category).toBe('News');
    expect(classifyYouTubeVideo({ ...metadata, title: 'A day in my life' }, settings).category).toBe('Unknown');
  });

  it('uses AI results only for ambiguous videos and leaves explicit user rules in control', () => {
    const ai = { videoId: metadata.videoId!, category: 'Educational' as const, confidence: 0.9, reason: 'Educational video', classifiedAt: 10 };
    expect(classifyYouTubeVideo({ ...metadata, title: 'A day in my life' }, settings, ai)).toEqual({ category: 'Educational', source: 'ai' });
    expect(classifyYouTubeVideo({ ...metadata, title: 'A day in my life' }, settings, { ...ai, confidence: 0.59 })).toEqual({ category: 'Unknown', source: 'unknown' });
    expect(classifyYouTubeVideo(metadata, { ...settings, overrides: [{ scope: 'video', key: metadata.videoId!, category: 'Music', updatedAt: 10 }] }, ai)).toEqual({ category: 'Music', source: 'user' });
    expect(classifyYouTubeVideo({ ...metadata, title: 'React Hooks Tutorial for Beginners' }, settings, { ...ai, category: 'News' })).toEqual({ category: 'Technical Learning', source: 'metadata' });
    const record = segment({ metadata: { ...metadata, title: 'A day in my life' }, durationMs: 5_000, endedAt: 6_000 });
    expect(summarizeYouTubeTime([record], settings, [ai]).educationalViewingMs).toBe(5_000);
  });

  it('labels Shorts as casual browsing unless a user rule or learning goal matches', () => {
    const short = { ...metadata, isShort: true, title: 'A silly dance clip' };
    expect(classifyYouTubeVideo(short, settings)).toEqual({ category: 'Shorts / Casual Browsing', source: 'short' });
    expect(classifyYouTubeVideo(short, { learningGoals: ['dance'], overrides: [] }).source).toBe('goal');
  });
});

describe('YouTube segment tracker', () => {
  it('records only while the YouTube tab is active and splits playback transitions', () => {
    const segments: YouTubeSegment[] = [];
    const tracker = new YouTubeSegmentTracker((record) => segments.push(record), 120_000, () => `segment-${segments.length}`);
    tracker.setContextActive(false, 0);
    tracker.setContextActive(true, 1_000);
    tracker.updatePageState(pageState(), 3_000);
    tracker.checkpoint(60_000);
    tracker.updatePageState(pageState({ playbackState: 'paused' }), 70_000);
    tracker.setContextActive(false, 80_000);
    expect(segments.map(({ playbackState, startedAt, endedAt }) => [playbackState, startedAt, endedAt])).toEqual([
      ['browsing', 1_000, 3_000], ['playing', 3_000, 60_000], ['playing', 60_000, 70_000], ['paused', 70_000, 80_000],
    ]);
  });

  it('does not count a long gap after missed checkpoints', () => {
    const segments: YouTubeSegment[] = [];
    const tracker = new YouTubeSegmentTracker((record) => segments.push(record), 120_000, () => `segment-${segments.length}`);
    tracker.setContextActive(true, 0);
    tracker.updatePageState(pageState(), 1_000);
    tracker.checkpoint(60_000);
    tracker.checkpoint(600_000);
    tracker.end(610_000);
    expect(segments.map(({ startedAt, endedAt }) => [startedAt, endedAt])).toEqual([[0, 1_000], [1_000, 60_000], [600_000, 610_000]]);
  });

  it('treats a SPA video transition as a new video record', () => {
    const segments: YouTubeSegment[] = [];
    const tracker = new YouTubeSegmentTracker((record) => segments.push(record), 120_000, () => `segment-${segments.length}`);
    tracker.setContextActive(true, 1_000);
    tracker.updatePageState(pageState(), 2_000);
    tracker.updatePageState(pageState({ metadata: { ...metadata, videoId: 'zyxwvutsrqp', title: 'Python programming' } }), 12_000);
    tracker.end(18_000);
    expect(segments.map(({ metadata: item, startedAt, endedAt }) => [item.videoId, startedAt, endedAt])).toEqual([
      [null, 1_000, 2_000], ['abcdefghijk', 2_000, 12_000], ['zyxwvutsrqp', 12_000, 18_000],
    ]);
  });
});

describe('YouTube settings and reports', () => {
  it('clips YouTube records to the selected day and counts overlaps once', () => {
    const records = [
      segment({ startedAt: 0, endedAt: 20_000, durationMs: 20_000 }),
      segment({ startedAt: 10_000, endedAt: 30_000, durationMs: 20_000 }),
      segment({ startedAt: 30_000, endedAt: 40_000, durationMs: 10_000 }),
    ];
    const clipped = clipYouTubeSegments(records, 15_000, 35_000);
    expect(clipped.map(({ startedAt, endedAt, durationMs }) => [startedAt, endedAt, durationMs])).toEqual([
      [15_000, 20_000, 5_000], [20_000, 30_000, 10_000], [30_000, 35_000, 5_000],
    ]);
    expect(clipped.reduce((total, item) => total + item.durationMs, 0)).toBe(20_000);
  });

  it('projects only an active current video into today’s total', () => {
    const current = {
      tabId: 7,
      active: true,
      pageState: pageState(),
      segmentStartedAt: 12_000,
      updatedAt: 19_000,
    };
    expect(clipYouTubeSegments([], 10_000, 20_000, current).map(({ startedAt, endedAt }) => [startedAt, endedAt])).toEqual([[12_000, 20_000]]);
    expect(clipYouTubeSegments([], 10_000, 20_000, { ...current, active: false })).toEqual([]);
  });

  it('saves learning goals and explicit channel/video overrides locally', async () => {
    await saveLearningGoal('React');
    await saveLearningGoal('react');
    await saveYouTubeOverride('channel', '@Code School', 'Technical Learning');
    await saveYouTubeOverride('video', 'abcdefghijk', 'Educational');
    const loaded = await loadYouTubeSettings();
    expect(loaded.learningGoals).toEqual(['React']);
    expect(loaded.overrides.map(({ scope, key, category }) => [scope, key, category])).toEqual([
      ['channel', 'code school', 'Technical Learning'],
      ['video', 'abcdefghijk', 'Educational'],
    ]);
    expect((await browser.storage.local.get(YOUTUBE_SETTINGS_STORAGE_KEY))[YOUTUBE_SETTINGS_STORAGE_KEY]).toEqual(loaded);
    await deleteLearningGoal('react');
    await deleteYouTubeOverride('video', 'abcdefghijk');
    expect(await loadYouTubeSettings()).toEqual({ learningGoals: [], overrides: [{ scope: 'channel', key: 'code school', category: 'Technical Learning', updatedAt: expect.any(Number) }] });
  });

  it('drops malformed settings entries and segment records', () => {
    expect(parseYouTubeSettings({
      learningGoals: ['   ', 'Math'],
      overrides: [
        { scope: 'video', key: 'bad', category: 'News', updatedAt: 1 },
        { scope: 'channel', key: '@Good Channel', category: 'Educational', updatedAt: 2 },
      ],
    })).toMatchObject({ learningGoals: ['Math'], overrides: [{ scope: 'channel', key: 'good channel' }] });
    expect(youtubeSegmentSchema.safeParse(segment()).success).toBe(true);
    expect(youtubeSegmentSchema.safeParse(segment({ durationMs: 1, endedAt: 10_000 })).success).toBe(false);
  });

  it('separates video, paused, buffering, browsing, and Shorts time', () => {
    const records = [
      segment({ durationMs: 30_000, endedAt: 31_000 }),
      segment({ id: crypto.randomUUID(), playbackState: 'paused', durationMs: 5_000, endedAt: 6_000 }),
      segment({ id: crypto.randomUUID(), playbackState: 'buffering', durationMs: 2_000, endedAt: 3_000 }),
      segment({ id: crypto.randomUUID(), playbackState: 'browsing', durationMs: 10_000, endedAt: 11_000 }),
      segment({
        id: crypto.randomUUID(),
        metadata: { ...metadata, videoId: 'zyxwvutsrqp', title: 'Short clip', isShort: true, videoUrl: 'https://www.youtube.com/shorts/zyxwvutsrqp' },
        durationMs: 8_000,
        endedAt: 9_000,
      }),
    ];
    expect(summarizeYouTubeTime(records)).toMatchObject({
      activeViewingMs: 38_000,
      educationalViewingMs: 30_000,
      entertainmentViewingMs: 0,
      shortsMs: 8_000,
      pausedMs: 5_000,
      bufferingMs: 2_000,
      browsingMs: 10_000,
    });
    expect(mostWatchedVideos(records, 1)[0]?.durationMs).toBe(30_000);
    expect(mostWatchedChannels(records, 1)[0]).toMatchObject({ channelName: 'Code School', durationMs: 38_000 });
  });

  it('persists video segments in the same local database across store instances', async () => {
    const databaseName = `focuslens-youtube-test-${crypto.randomUUID()}`;
    const firstStore = new IndexedDbActivityStore(databaseName);
    await firstStore.appendYouTubeSegment(segment());
    const reopenedStore = new IndexedDbActivityStore(databaseName);
    const records = await reopenedStore.listYouTubeSegments(0, 3_000);
    expect(records).toHaveLength(1);
    expect(records[0]?.metadata.videoId).toBe(metadata.videoId);
  });
});
