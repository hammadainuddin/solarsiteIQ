// OSM client-side cache — DuckDB-backed (replaces IndexedDB/idb).
// Same public interface as the original so overpass.ts is unchanged.

import {
  readOsmDuckCache, writeOsmDuckCache, clearOsmDuckStore, getOsmDuckStoreFetchedAt,
} from './duckDb';

export { type OsmCacheEntry } from './duckDb';
export type OsmStore = 'lines' | 'substations' | 'boundaries';

export interface OsmCacheEntryLocal<T> {
  data: T;
  fetchedAt: number;
}

export async function readOsmCache<T>(
  store: OsmStore,
  key: string,
): Promise<OsmCacheEntryLocal<T> | null> {
  const entry = await readOsmDuckCache<T>(store, key);
  if (!entry) return null;
  return { data: entry.data, fetchedAt: entry.fetchedAt };
}

export async function writeOsmCache<T>(
  store: OsmStore,
  key: string,
  data: T,
): Promise<void> {
  await writeOsmDuckCache<T>(store, key, data);
}

export async function clearOsmStore(store: OsmStore): Promise<void> {
  await clearOsmDuckStore(store);
}

export async function getOsmStoreFetchedAt(store: OsmStore): Promise<number | null> {
  return getOsmDuckStoreFetchedAt(store);
}
