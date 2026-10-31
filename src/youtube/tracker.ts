import type { YouTubePageState, YouTubeSegment } from './types';

export type YouTubeSegmentSink = (segment: YouTubeSegment) => void;

function samePageState(left: YouTubePageState, right: YouTubePageState): boolean {
  return left.playbackState === right.playbackState &&
    left.metadata.videoId === right.metadata.videoId &&
    left.metadata.title === right.metadata.title &&
    left.metadata.channelName === right.metadata.channelName &&
    left.metadata.videoUrl === right.metadata.videoUrl &&
    left.metadata.isShort === right.metadata.isShort;
}

export class YouTubeSegmentTracker {
  private active = false;
  private segmentStartedAt: number | null = null;
  private lastCheckpointAt: number | null = null;
  private pageState: YouTubePageState = {
    metadata: { videoId: null, title: null, channelName: null, videoUrl: null, isShort: false },
    playbackState: 'browsing',
  };

  constructor(
    private readonly saveSegment: YouTubeSegmentSink,
    private readonly maxUnobservedGapMs = 120_000,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  setContextActive(active: boolean, now: number): void {
    this.handleLongGap(now);
    if (active === this.active) return;
    this.closeAt(now);
    this.active = active;
    if (active) {
      this.segmentStartedAt = now;
      this.lastCheckpointAt = now;
    }
  }

  updatePageState(pageState: YouTubePageState, now: number): void {
    this.handleLongGap(now);
    if (samePageState(this.pageState, pageState)) return;
    this.closeAt(now);
    this.pageState = pageState;
    if (this.active) {
      this.segmentStartedAt = now;
      this.lastCheckpointAt = now;
    }
  }

  checkpoint(now: number): void {
    const stale = this.lastCheckpointAt !== null && now - this.lastCheckpointAt > this.maxUnobservedGapMs;
    this.closeAt(stale && this.lastCheckpointAt !== null ? this.lastCheckpointAt : now);
    if (this.active) this.segmentStartedAt = now;
    this.lastCheckpointAt = now;
  }

  end(now: number): void {
    this.handleLongGap(now);
    this.closeAt(now);
    this.active = false;
    this.segmentStartedAt = null;
    this.lastCheckpointAt = null;
  }

  private handleLongGap(now: number): void {
    if (this.segmentStartedAt === null || this.lastCheckpointAt === null) return;
    if (now - this.lastCheckpointAt <= this.maxUnobservedGapMs) return;
    this.closeAt(this.lastCheckpointAt);
    this.segmentStartedAt = this.active ? now : null;
    this.lastCheckpointAt = now;
  }

  private closeAt(endedAt: number): void {
    const startedAt = this.segmentStartedAt;
    if (startedAt === null || endedAt <= startedAt) return;
    this.saveSegment({
      id: this.createId(),
      ...this.pageState,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
    });
    this.segmentStartedAt = null;
  }
}
