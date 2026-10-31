import type { YouTubePageState, YouTubeVideoMetadata, YouTubePlaybackState } from './types';

const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
const VIDEO_SELECTORS = [
  'ytd-watch-metadata h1 yt-formatted-string',
  'ytd-watch-metadata h1',
  'meta[name="title"]',
  'meta[property="og:title"]',
  'title',
];
const CHANNEL_SELECTORS = [
  'ytd-watch-metadata #channel-name yt-formatted-string',
  'ytd-watch-metadata #channel-name a',
  '#owner #channel-name a',
  'ytd-channel-name a',
  'meta[itemprop="author"]',
];

function cleanText(value: string | null | undefined, maxLength: number): string | null {
  const result = value?.replace(/\s+/g, ' ').trim().slice(0, maxLength) ?? '';
  return result || null;
}

function elementText(document: Document, selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const content = element?.tagName === 'META'
      ? (element as HTMLMetaElement).content
      : element?.textContent;
    const value = cleanText(content, 300);
    if (value) return value;
  }
  return null;
}

export function readYouTubeMetadata(url: URL, document: Document): YouTubeVideoMetadata {
  const shortMatch = /^\/shorts\/([\w-]{11})(?:\/|$)/.exec(url.pathname);
  const videoId = shortMatch?.[1] ?? (url.pathname === '/watch' ? url.searchParams.get('v') : null);
  const validVideoId = videoId && VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  const isShort = validVideoId !== null && shortMatch !== null;
  const title = elementText(document, VIDEO_SELECTORS)?.replace(/\s+-\s+YouTube$/, '') ?? null;
  const channelName = elementText(document, CHANNEL_SELECTORS);

  return {
    videoId: validVideoId,
    title,
    channelName,
    videoUrl: validVideoId
      ? (isShort ? `https://www.youtube.com/shorts/${validVideoId}` : `https://www.youtube.com/watch?v=${validVideoId}`)
      : null,
    isShort,
  };
}

export function readPlaybackState(video: HTMLVideoElement | null): YouTubePlaybackState {
  if (!video || video.ended) return 'browsing';
  if (video.paused) return 'paused';
  if (video.readyState < 3) return 'buffering';
  return 'playing';
}

export function readPageState(url: URL, document: Document, video: HTMLVideoElement | null): YouTubePageState {
  return {
    metadata: readYouTubeMetadata(url, document),
    playbackState: readPlaybackState(video),
  };
}
