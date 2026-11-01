import { readPageState } from '../src/youtube/metadata';
import { YouTubeSegmentTracker } from '../src/youtube/tracker';
import { youtubeContextMessageSchema, youtubeContextResponseSchema } from '../src/youtube/validation';
import type { YouTubeSegment } from '../src/youtube/types';

const PAGE_STATE_MESSAGE = 'focuslens-youtube-page-state';
const SEGMENT_MESSAGE = 'focuslens-youtube-segment';
const CONTEXT_REQUEST_MESSAGE = 'focuslens-youtube-context-request';
const MEDIA_EVENTS = [
  'play', 'playing', 'pause', 'waiting', 'stalled', 'canplay', 'canplaythrough',
  'ended', 'emptied', 'loadeddata', 'loadedmetadata', 'seeking', 'seeked',
];

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    let activeInBrowser = false;
    let currentVideo: HTMLVideoElement | null = null;
    let refreshTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let lastPublishedPageState = '';

    const send = (message: unknown) => {
      void browser.runtime.sendMessage(message).catch(() => undefined);
    };

    const tracker = new YouTubeSegmentTracker((segment: YouTubeSegment) => {
      send({ type: SEGMENT_MESSAGE, segment });
    });

    const currentLocation = () => new URL(window.location.href);

    const publishPageState = (force = false) => {
      const video = findCurrentVideo();
      const now = Date.now();
      const pageState = readPageState(currentLocation(), document, video);
      tracker.updatePageState(pageState, now);
      const serialized = JSON.stringify(pageState);
      if (force || serialized !== lastPublishedPageState) {
        lastPublishedPageState = serialized;
        send({
          type: PAGE_STATE_MESSAGE,
          pageState,
          active: activeInBrowser && document.visibilityState === 'visible',
          segmentStartedAt: tracker.getCurrentSegmentStartedAt(),
        });
      }
    };

    const onMediaEvent = () => scheduleRefresh();
    const detachVideo = () => {
      if (!currentVideo) return;
      for (const eventName of MEDIA_EVENTS) currentVideo.removeEventListener(eventName, onMediaEvent);
      currentVideo = null;
    };
    function findCurrentVideo(): HTMLVideoElement | null {
      const nextVideo = document.querySelector('video');
      if (nextVideo !== currentVideo) {
        detachVideo();
        currentVideo = nextVideo;
        if (currentVideo) {
          for (const eventName of MEDIA_EVENTS) currentVideo.addEventListener(eventName, onMediaEvent);
        }
      }
      return currentVideo;
    }

    function scheduleRefresh() {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(publishPageState, 150);
    }

    const requestCurrentContext = async () => {
      try {
        const response: unknown = await browser.runtime.sendMessage({ type: CONTEXT_REQUEST_MESSAGE });
        const parsed = youtubeContextResponseSchema.safeParse(response);
        if (!parsed.success) return;
        const observedAt = parsed.data.observedAt;
        activeInBrowser = parsed.data.active;
        tracker.setContextActive(activeInBrowser && document.visibilityState === 'visible', observedAt);
        publishPageState(true);
      } catch {
        activeInBrowser = false;
      }
    };

    browser.runtime.onMessage.addListener((message: unknown) => {
      const parsed = youtubeContextMessageSchema.safeParse(message);
      if (!parsed.success) return false;
      activeInBrowser = parsed.data.active;
      const active = activeInBrowser && document.visibilityState === 'visible';
      tracker.setContextActive(active, parsed.data.observedAt);
      if (parsed.data.checkpoint) tracker.checkpoint(parsed.data.observedAt);
      publishPageState(true);
      return false;
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        activeInBrowser = false;
        tracker.setContextActive(false, Date.now());
        publishPageState(true);
      } else {
        void requestCurrentContext();
      }
    });
    document.addEventListener('yt-navigate-finish', scheduleRefresh);
    document.addEventListener('yt-page-data-updated', scheduleRefresh);
    window.addEventListener('popstate', scheduleRefresh);
    window.addEventListener('pagehide', () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
      activeInBrowser = false;
      tracker.end(Date.now());
      publishPageState(true);
      detachVideo();
    }, { once: true });

    const observer = new MutationObserver(scheduleRefresh);
    if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    publishPageState();
    heartbeatTimer = window.setInterval(() => {
      if (activeInBrowser && document.visibilityState === 'visible') publishPageState(true);
    }, 5_000);
    void requestCurrentContext();
  },
});
