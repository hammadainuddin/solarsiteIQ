// OSM client-side cache backed by localStorage.
// localStorage is synchronous, always available, and requires no WASM init —
// unlike the previous DuckDB implementation which blocked OSM fetching for
// 10-30 seconds while the WebAssembly module loaded.
// Boundary GeoJSON is typically <500 KB — well within the 5 MB localStorage limit.

export type OsmStore = 'lines' | 'substations' | 'boundaries';

export interface OsmCacheEntryLocal<T> {
  data: T;
  fetchedAt: number;
}

function lsKey(store: OsmStore, key: string): string {
  return `siteiq-osm-${store}-${key}`;
}

export async function readOsmCache<T>(
  store: OsmStore,
  key: string,
): Promise<OsmCacheEntryLocal<T> | null> {
  try {
    const raw = localStorage.getItem(lsKey(store, key));
    if (!raw) return null;
    return JSON.parse(raw) as OsmCacheEntryLocal<T>;
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
    localStorage.setItem(lsKey(store, key), JSON.stringify({ data, fetchedAt: Date.now() }));
  } catch {
    // Quota exceeded — silently skip; next load will re-fetch from Overpass
  }
}

export async function clearOsmStore(store: OsmStore): Promise<void> {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(`siteiq-osm-${store}-`)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

export async function getOsmStoreFetchedAt(store: OsmStore): Promise<number | null> {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(`siteiq-osm-${store}-`)) {
        const raw = localStorage.getItem(k);
        if (raw) return (JSON.parse(raw) as OsmCacheEntryLocal<unknown>).fetchedAt;
      }
    }
    return null;
  } catch {
    return null;
  }
}
