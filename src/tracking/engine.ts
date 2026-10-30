import { splitIntervalAtLocalMidnights } from './time';
import type { ActivityStore, ActiveContext, BrowserSnapshot, TrackerState, TrackingEngineOptions } from './types';

const EMPTY_STATE: TrackerState = {
  version: 1,
  updatedAt: 0,
  focused: false,
  idle: true,
  context: null,
  intervalStartedAt: null,
};

function sameContext(left: ActiveContext | null, right: ActiveContext | null): boolean {
  return left?.tabId === right?.tabId && left?.windowId === right?.windowId && left?.domain === right?.domain;
}

export class TrackingEngine {
  private readonly createId: () => string;

  constructor(
    private readonly store: ActivityStore,
    private readonly options: TrackingEngineOptions,
  ) {
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  async reconcile(snapshot: BrowserSnapshot): Promise<TrackerState> {
    const previous = (await this.store.readState()) ?? EMPTY_STATE;
    const eligibleContext = snapshot.focused && !snapshot.idle ? snapshot.context : null;
    const maxGap = this.options.maxUnobservedGapMs ?? Number.POSITIVE_INFINITY;
    const observationGap = snapshot.observedAt - previous.updatedAt;
    const staleObservation = previous.intervalStartedAt !== null && observationGap > maxGap;
    const shouldContinue =
      previous.intervalStartedAt !== null &&
      !staleObservation &&
      previous.focused &&
      !previous.idle &&
      sameContext(previous.context, eligibleContext);

    const records = [];
    if (previous.intervalStartedAt !== null && !shouldContinue && previous.context) {
      const transitionBoundary = staleObservation
        ? previous.updatedAt
        : snapshot.idle && !previous.idle
          ? snapshot.observedAt - this.options.idleThresholdMs
          : snapshot.observedAt;
      const endedAt = Math.max(previous.intervalStartedAt, transitionBoundary);
      records.push(...splitIntervalAtLocalMidnights(
        previous.intervalStartedAt,
        endedAt,
        previous.context.domain,
        this.createId,
      ));
    }

    const nextState: TrackerState = {
      version: 1,
      updatedAt: snapshot.observedAt,
      focused: snapshot.focused,
      idle: snapshot.idle,
      context: snapshot.context,
      intervalStartedAt: eligibleContext ? (shouldContinue ? previous.intervalStartedAt : snapshot.observedAt) : null,
    };

    await this.store.commit(nextState, records);
    return nextState;
  }

  async checkpoint(now: number): Promise<TrackerState> {
    const previous = (await this.store.readState()) ?? EMPTY_STATE;
    if (previous.intervalStartedAt === null || !previous.context || now <= previous.intervalStartedAt) {
      const nextState = { ...previous, updatedAt: now };
      await this.store.commit(nextState, []);
      return nextState;
    }

    const records = splitIntervalAtLocalMidnights(
      previous.intervalStartedAt,
      now,
      previous.context.domain,
      this.createId,
    );
    const nextState = { ...previous, updatedAt: now, intervalStartedAt: now };
    await this.store.commit(nextState, records);
    return nextState;
  }

  async endPreviousBrowserSession(now: number): Promise<TrackerState> {
    const previous = (await this.store.readState()) ?? EMPTY_STATE;
    const checkpoint = previous.updatedAt;
    const records = previous.intervalStartedAt !== null && previous.context
      ? splitIntervalAtLocalMidnights(
          previous.intervalStartedAt,
          Math.max(previous.intervalStartedAt, checkpoint),
          previous.context.domain,
          this.createId,
        )
      : [];
    const nextState: TrackerState = {
      ...previous,
      updatedAt: now,
      intervalStartedAt: null,
      focused: false,
      idle: true,
    };
    await this.store.commit(nextState, records);
    return nextState;
  }
}
