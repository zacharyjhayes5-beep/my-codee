/**
 * IndexedDB primitives. Knows about object stores and promises; knows nothing
 * about prospects, policies or backups. Everything above this file talks to
 * `repository.ts` instead.
 */

export const DB_NAME = "fb-dashboard";
/** v2 added calls, reviews and audit. v3 adds opportunities. v4 adds campaigns. */
export const DB_VERSION = 4;

/** Stores holding one row per record, keyed by the record's own id. */
export const RECORD_STORES = [
  "prospects",
  "policies",
  "tasks",
  "suggestions",
  "calls",
  "reviews",
  "audit",
  "opportunities",
  "campaigns",
] as const;
export type RecordStore = (typeof RECORD_STORES)[number];

/** Key/value store for things that aren't id-bearing records. */
export const META_STORE = "meta";

export interface MetaRow {
  key: string;
  value: unknown;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let openPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (openPromise) return openPromise;

  openPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of RECORD_STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another open tab"));
  });

  return openPromise;
}

/** Drops the cached handle — tests reopen a fresh database between cases. */
export function resetDbHandle() {
  openPromise = null;
}

export async function readAll<T>(store: RecordStore): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  return promisify(tx.objectStore(store).getAll() as IDBRequest<T[]>);
}

/**
 * Replaces a store's whole contents in one transaction. The app holds each
 * collection as an array in memory and hands the whole thing back on every
 * change, so a wholesale swap matches how the data is actually used — and it
 * cannot leave a half-written store behind if something throws midway.
 */
export async function writeAll<T extends { id: string }>(store: RecordStore, rows: T[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  os.clear();
  for (const row of rows) os.put(row);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function readMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const row = await promisify(tx.objectStore(META_STORE).get(key) as IDBRequest<MetaRow | undefined>);
  return row ? (row.value as T) : undefined;
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readwrite");
  tx.objectStore(META_STORE).put({ key, value });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** True when the browser can actually give us a database. */
export async function isAvailable(): Promise<boolean> {
  try {
    if (typeof indexedDB === "undefined") return false;
    await openDb();
    return true;
  } catch {
    return false;
  }
}
