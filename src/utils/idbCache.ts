// Thin IndexedDB wrapper for large persistent blobs (e.g. OSM landuse rings).
// localStorage has a ~5 MB quota that gets silently exceeded; IDB has no practical limit.

const DB_NAME = 'siteiq-cache';
const DB_VERSION = 1;
const STORE = 'blobs';

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => { _dbPromise = null; reject(req.error); };
  });
  return _dbPromise;
}

export async function idbGet<T>(key: string): Promise<{ data: T; fetchedAt: number } | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put({ data, fetchedAt: Date.now() }, key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch {
    // Silently skip — next load will re-fetch
  }
}
