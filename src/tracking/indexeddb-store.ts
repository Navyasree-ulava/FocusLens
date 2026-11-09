import type { ActivityRecord, ActivityStore, TrackerState } from './types';
import type { YouTubeSegment } from '../youtube/types';
import type { FocusSession } from '../wellbeing/types';
import type { AIClassification } from '../ai/types';

const DATABASE_NAME = 'focuslens-local';
const DATABASE_VERSION = 4;
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

  async saveAIClassification(classification: AIClassification): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction('aiClassifications', 'readwrite');
    const done = transactionResult(transaction);
    transaction.objectStore('aiClassifications').put(classification);
    await done;
  }

  async listAIClassifications(): Promise<AIClassification[]> {
    const database = await this.openDatabase();
    const transaction = database.transaction('aiClassifications', 'readonly');
    const done = transactionResult(transaction);
    const values = await requestResult(transaction.objectStore('aiClassifications').getAll()) as AIClassification[];
    await done;
    return values;
  }

  async clearAllData(): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(['activity', 'metadata', 'youtube', 'focusSessions', 'aiClassifications'], 'readwrite');
    const done = transactionResult(transaction);
    transaction.objectStore('activity').clear();
    transaction.objectStore('metadata').clear();
    transaction.objectStore('youtube').clear();
    transaction.objectStore('focusSessions').clear();
    transaction.objectStore('aiClassifications').clear();
    await done;
  }

  async exportData(): Promise<{ activity: ActivityRecord[]; youtube: YouTubeSegment[]; focusSessions: FocusSession[]; aiClassifications: AIClassification[]; trackerState: TrackerState | null }> {
    const database = await this.openDatabase();
    const transaction = database.transaction(['activity', 'metadata', 'youtube', 'focusSessions', 'aiClassifications'], 'readonly');
    const done = transactionResult(transaction);
    const activityPromise = requestResult(transaction.objectStore('activity').getAll()) as Promise<ActivityRecord[]>;
    const youtubePromise = requestResult(transaction.objectStore('youtube').getAll()) as Promise<YouTubeSegment[]>;
    const focusSessionsPromise = requestResult(transaction.objectStore('focusSessions').getAll()) as Promise<FocusSession[]>;
    const aiPromise = requestResult(transaction.objectStore('aiClassifications').getAll()) as Promise<AIClassification[]>;
    const statePromise = requestResult(transaction.objectStore('metadata').get(STATE_KEY)) as Promise<StoredState | undefined>;
    const [activity, youtube, focusSessions, aiClassifications, state] = await Promise.all([activityPromise, youtubePromise, focusSessionsPromise, aiPromise, statePromise]);
    await done;
    return { activity, youtube, focusSessions, aiClassifications, trackerState: state?.value ?? null };
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    let opening: Promise<IDBDatabase>;
    opening = new Promise((resolve, reject) => {
      const request = this.indexedDb.open(this.databaseName, DATABASE_VERSION);
      let blocked = false;
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
        if (!database.objectStoreNames.contains('aiClassifications')) {
          database.createObjectStore('aiClassifications', { keyPath: 'videoId' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        if (blocked) {
          // A blocked request can still succeed after the older connection closes.
          // This attempt has already failed for its callers, so do not leak its connection.
          database.close();
          return;
        }
        database.onversionchange = () => {
          database.close();
          if (this.databasePromise === opening) this.databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error('Unable to open local activity storage.'));
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Local activity storage upgrade is blocked by another open page.'));
      };
    });
    this.databasePromise = opening;
    // A failed open must not poison this store for the lifetime of the worker.
    void opening.catch(() => {
      if (this.databasePromise === opening) this.databasePromise = null;
    });
    return opening;
  }
}
