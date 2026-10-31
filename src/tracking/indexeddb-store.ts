import type { ActivityRecord, ActivityStore, TrackerState } from './types';
import type { YouTubeSegment } from '../youtube/types';
import type { FocusSession } from '../wellbeing/types';

const DATABASE_NAME = 'focuslens-local';
const DATABASE_VERSION = 3;
const STATE_KEY = 'tracker-state';

interface StoredState {
  key: string;
  value: TrackerState;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

export class IndexedDbActivityStore implements ActivityStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly databaseName = DATABASE_NAME,
    private readonly indexedDb: IDBFactory = indexedDB,
  ) {}

  async readState(): Promise<TrackerState | null> {
    const database = await this.openDatabase();
    const transaction = database.transaction('metadata', 'readonly');
    const done = transactionResult(transaction);
    const stored = await requestResult(transaction.objectStore('metadata').get(STATE_KEY)) as StoredState | undefined;
    await done;
    return stored?.value ?? null;
  }

  async commit(state: TrackerState, records: ActivityRecord[]): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(['activity', 'metadata'], 'readwrite');
    const done = transactionResult(transaction);
    const activity = transaction.objectStore('activity');
    for (const record of records) activity.put(record);
    transaction.objectStore('metadata').put({ key: STATE_KEY, value: state } satisfies StoredState);
    await done;
  }

  async listRecords(startInclusive: number, endExclusive: number): Promise<ActivityRecord[]> {
    const database = await this.openDatabase();
    const transaction = database.transaction('activity', 'readonly');
    const done = transactionResult(transaction);
    const index = transaction.objectStore('activity').index('startedAt');
    const range = IDBKeyRange.bound(startInclusive, endExclusive, false, true);
    const records = await requestResult(index.getAll(range)) as ActivityRecord[];
    await done;
    return records;
  }

  async appendYouTubeSegment(segment: YouTubeSegment): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction('youtube', 'readwrite');
    const done = transactionResult(transaction);
    transaction.objectStore('youtube').put(segment);
    await done;
  }

  async listYouTubeSegments(startInclusive: number, endExclusive: number): Promise<YouTubeSegment[]> {
    const database = await this.openDatabase();
    const transaction = database.transaction('youtube', 'readonly');
    const done = transactionResult(transaction);
    const range = IDBKeyRange.upperBound(endExclusive, true);
    const segments = (await requestResult(transaction.objectStore('youtube').index('startedAt').getAll(range)) as YouTubeSegment[])
      .filter((segment) => segment.endedAt > startInclusive);
    await done;
    return segments;
  }

  async saveFocusSession(session: FocusSession): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction('focusSessions', 'readwrite');
    const done = transactionResult(transaction);
    transaction.objectStore('focusSessions').put(session);
    await done;
  }

  async listFocusSessions(): Promise<FocusSession[]> {
    const database = await this.openDatabase();
    const transaction = database.transaction('focusSessions', 'readonly');
    const done = transactionResult(transaction);
    const sessions = await requestResult(transaction.objectStore('focusSessions').getAll()) as FocusSession[];
    await done;
    return sessions.toSorted((left, right) => right.startedAt - left.startedAt);
  }

  async clearAllData(): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(['activity', 'metadata', 'youtube', 'focusSessions'], 'readwrite');
    const done = transactionResult(transaction);
    transaction.objectStore('activity').clear();
    transaction.objectStore('metadata').clear();
    transaction.objectStore('youtube').clear();
    transaction.objectStore('focusSessions').clear();
    await done;
  }

  async exportData(): Promise<{ activity: ActivityRecord[]; youtube: YouTubeSegment[]; focusSessions: FocusSession[]; trackerState: TrackerState | null }> {
    const database = await this.openDatabase();
    const transaction = database.transaction(['activity', 'metadata', 'youtube', 'focusSessions'], 'readonly');
    const done = transactionResult(transaction);
    const activityPromise = requestResult(transaction.objectStore('activity').getAll()) as Promise<ActivityRecord[]>;
    const youtubePromise = requestResult(transaction.objectStore('youtube').getAll()) as Promise<YouTubeSegment[]>;
    const focusSessionsPromise = requestResult(transaction.objectStore('focusSessions').getAll()) as Promise<FocusSession[]>;
    const statePromise = requestResult(transaction.objectStore('metadata').get(STATE_KEY)) as Promise<StoredState | undefined>;
    const [activity, youtube, focusSessions, state] = await Promise.all([activityPromise, youtubePromise, focusSessionsPromise, statePromise]);
    await done;
    return { activity, youtube, focusSessions, trackerState: state?.value ?? null };
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDb.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('activity')) {
          const activity = database.createObjectStore('activity', { keyPath: 'id' });
          activity.createIndex('startedAt', 'startedAt', { unique: false });
          activity.createIndex('domain', 'domain', { unique: false });
        }
        if (!database.objectStoreNames.contains('metadata')) {
          database.createObjectStore('metadata', { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains('youtube')) {
          const youtube = database.createObjectStore('youtube', { keyPath: 'id' });
          youtube.createIndex('startedAt', 'startedAt', { unique: false });
          youtube.createIndex('videoId', 'metadata.videoId', { unique: false });
          youtube.createIndex('channelName', 'metadata.channelName', { unique: false });
        }
        if (!database.objectStoreNames.contains('focusSessions')) {
          database.createObjectStore('focusSessions', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error('Unable to open local activity storage.'));
      request.onblocked = () => reject(new Error('Local activity storage upgrade is blocked by another open page.'));
    });
    return this.databasePromise;
  }
}
