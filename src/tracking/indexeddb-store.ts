import type { ActivityRecord, ActivityStore, TrackerState } from './types';

const DATABASE_NAME = 'focuslens-local';
const DATABASE_VERSION = 1;
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
