import type { PlayerId } from '../../objects/player/PlayerId.ts';
import type { ReplayStorage } from './ReplayStorage.ts';
import { decodeStoredReplay, mergeStoredReplay } from './replayStorageCodec.ts';
import type { StoredReplay } from './StoredReplay.ts';

const DATABASE = 'bloom-valley-recordings-v1';
const STORE = 'recordings';

/** No eviction: unsuccessful uploads must never disappear to make room. */
export class IndexedDBReplayStorage implements ReplayStorage {
  private opening: Promise<IDBDatabase> | undefined;
  constructor(private readonly factory: IDBFactory | undefined = globalThis.indexedDB) {}

  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      if (!this.factory) { reject(new Error('IndexedDB is unavailable')); return; }
      const request = this.factory.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('ownerId', 'ownerId');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.opening = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another tab'));
    });
    this.opening.catch(() => { this.opening = undefined; });
    return this.opening;
  }

  async get(key: string): Promise<unknown | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(key);
      transaction.oncomplete = () => resolve(request.result as unknown);
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('IndexedDB read failed'));
    });
  }

  async list(ownerId: PlayerId): Promise<readonly unknown[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).index('ownerId').getAll(ownerId);
      transaction.oncomplete = () => resolve(request.result as unknown[]);
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('IndexedDB read failed'));
    });
  }

  async put(item: StoredReplay): Promise<StoredReplay> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const request = store.get(item.key);
      let merged = item;
      let mergeError: unknown;
      request.onsuccess = () => {
        try {
          merged = mergeStoredReplay(request.result === undefined ? undefined : decodeStoredReplay(request.result), item);
          store.put(merged);
        } catch (error) { mergeError = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(merged);
      transaction.onerror = transaction.onabort = () => reject(mergeError ?? transaction.error ?? request.error ?? new Error('IndexedDB write failed'));
    });
  }
}
