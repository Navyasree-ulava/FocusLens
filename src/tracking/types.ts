export interface ActiveContext {
  tabId: number;
  windowId: number;
  domain: string;
}

export interface ActivityRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  domain: string;
}

export interface TrackerState {
  version: 1;
  updatedAt: number;
  focused: boolean;
  idle: boolean;
  context: ActiveContext | null;
  intervalStartedAt: number | null;
}

export interface BrowserSnapshot {
  observedAt: number;
  focused: boolean;
  idle: boolean;
  context: ActiveContext | null;
}

export interface ActivityStore {
  readState(): Promise<TrackerState | null>;
  commit(state: TrackerState, records: ActivityRecord[]): Promise<void>;
  listRecords(startInclusive: number, endExclusive: number): Promise<ActivityRecord[]>;
}

export interface TrackingEngineOptions {
  idleThresholdMs: number;
  maxUnobservedGapMs?: number;
  createId?: () => string;
}
