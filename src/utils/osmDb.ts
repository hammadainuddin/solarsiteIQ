import { openDB } from 'idb';

const DB_NAME    = 'dc-siteiq-osm';
const DB_VERSION = 2;

export interface OsmCacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('lines'))       db.createObjectStore('lines');
    if (!db.objectStoreNames.contains('substations')) db.createObjectStore('substations');
    if (!db.objectStoreNames.contains('boundaries'))  db.createObjectStore('boundaries');
  },
});

export type OsmStore = 'lines' | 'substations' | 'boundaries';

export async function readOsmCache<T>(
  store: OsmStore,
  key: string,
): Promise<OsmCacheEntry<T> | null> {
  try {
    const db = await dbPromise;
    return (await db.get(store, key)) ?? null;
  } catch {
    return null;
  }
}

export async function writeOsmCache<T>(
  store: OsmStore,
  key: string,
  data: T,
): Promise<void> {
  try {
    const db = await dbPromise;
    await db.put(store, { data, fetchedAt: Date.now() }, key);
  } catch {
    // quota or permission error — silently ignore
  }
}

export async function clearOsmStore(store: OsmStore): Promise<void> {
  try {
    const db = await dbPromise;
    await db.clear(store);
  } catch {}
}

/** Returns the oldest fetchedAt across all entries in the store (proxy for "last full fetch"). */
export async function getOsmStoreFetchedAt(store: OsmStore): Promise<number | null> {
  try {
    const db  = await dbPromise;
    const all = await db.getAll(store) as OsmCacheEntry<unknown>[];
    if (all.length === 0) return null;
    return Math.min(...all.map((e) => e.fetchedAt));
  } catch {
    return null;
  }
}
