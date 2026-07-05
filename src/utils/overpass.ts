import type { TransmissionLine, LineStatus } from '../data/transmissionLines';
import type { SubstationFeature } from '../data/infraLayers';
import { readOsmCache, writeOsmCache, clearOsmStore } from './osmDb';

const CACHE_TTL_MS      = 24 * 60 * 60 * 1000;
const CACHE_VERSION     = 'v6';
const CACHE_VERSION_SUB = 'sub-v2';

// ─── Server-side Redis cache helpers (L2 between IndexedDB and Overpass) ────────
// Skipped entirely in local dev (no Vercel runtime).

type ServerCacheType = 'lines' | 'substations' | 'boundaries';

async function readServerCache<T>(type: ServerCacheType): Promise<T | null> {
  if (import.meta.env.DEV) return null;
  try {
    const res = await fetch(`/api/osm-cache?type=${type}`);
    if (!res.ok) return null;
    const json = await res.json() as { data: T | null };
    return json.data;
  } catch {
    return null;
  }
}

async function writeServerCache<T>(type: ServerCacheType, data: T): Promise<void> {
  if (import.meta.env.DEV) return;
  try {
    await fetch('/api/osm-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    });
  } catch {
    // Non-blocking background upload — ignore failures
  }
}

// ─── Overpass endpoints (tried in order on each request) ─────────────────────

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

export async function overpassPost(body: string, signal?: AbortSignal): Promise<Response> {
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal,
      });
      if (resp.ok) return resp;
      // non-2xx (e.g. 429 rate-limit) — try next endpoint
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e; // propagate intentional abort
      // network error — try next endpoint
    }
  }
  throw new Error('All Overpass endpoints unavailable');
}

// ─── Cache key helpers ────────────────────────────────────────────────────────

function lineCacheKey(bbox: [number, number, number, number], minVoltageV: number): string {
  return `${CACHE_VERSION}:${bbox.join(',')}:${minVoltageV}`;
}

function subCacheKey(bbox: [number, number, number, number], minVoltageKV: number): string {
  return `${CACHE_VERSION_SUB}:${bbox.join(',')}:${minVoltageKV}`;
}

// ─── Voltage parsing ──────────────────────────────────────────────────────────
// OSM standard: voltage in Volts (e.g. "132000"). Many SEA contributors tag in kV
// (e.g. "132"). Detect by checking if max value < 1000 → treat as kV × 1000.

function parseVoltageV(tag: string | undefined): number | null {
  if (!tag) return null;
  const nums = tag.split(/[;,]/).map((p) => parseInt(p.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
  if (nums.length === 0) return null;
  const maxVal = Math.max(...nums);
  return maxVal < 1000 ? maxVal * 1000 : maxVal;
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

// Returns the maximum great-circle distance (km) between any two consecutive nodes.
// Used to reject likely submarine cables or OSM ways with sparse/erroneous geometry.
function maxNodeSpanKm(coords: [number, number][]): number {
  let max = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lat1, lon1] = coords[i - 1];
    const [lat2, lon2] = coords[i];
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(a));
    if (km > max) max = km;
  }
  return max;
}

// ─── Transmission line helpers ────────────────────────────────────────────────

function inferStatus(tags: Record<string, string>): LineStatus {
  if (tags['construction:power'] === 'line' || tags['power'] === 'construction') return 'under_construction';
  if (tags['planned:power'] === 'line') return 'planned';
  return 'existing';
}

type VoltageBucket = 500 | 400 | 275 | 230 | 132;

function voltageKVtoBucket(kv: number): VoltageBucket {
  if (kv >= 450) return 500;
  if (kv >= 350) return 400;
  if (kv >= 200) return 275;
  if (kv >= 150) return 230;
  return 132;
}

// ─── SEA sub-regions ──────────────────────────────────────────────────────────

const SEA_BBOXES: [number, number, number, number][] = [
  [1.0,   99.5,  7.5,  104.5],  // Peninsular MY + SG (7.5°N covers Perlis)
  [-8.5,  106.0, -5.5, 111.5],  // Java
  [12.5,   99.5, 15.5, 101.5],  // Bangkok metro
  [12.0,  121.0, 18.5, 122.5],  // Luzon (PH north)
  [8.0,   104.5, 23.0, 107.5],  // Vietnam coast
  [-6.0,   94.5,  6.0, 106.0],  // Sumatera
  [-5.0,  108.0,  5.0, 118.0],  // Kalimantan + Sarawak
  [-6.0,  118.5,  2.0, 126.0],  // Sulawesi
  [5.5,    97.5, 20.5, 105.7],  // Thailand full
  [5.5,   118.5, 12.5, 127.5],  // Philippines south
  [4.0,  114.5,  7.5,  119.5],  // Sabah (East Malaysia)
];

// Northern Peninsular Malaysia only (Perak, Kedah, Penang, Perlis)
const NORTHERN_MY_BBOX: [number, number, number, number] = [3.5, 99.5, 7.2, 102.5];

// ─── Transmission line fetch ──────────────────────────────────────────────────

interface OverpassWay {
  id: number;
  tags: Record<string, string>;
  geometry: { lat: number; lon: number }[];
}

async function fetchLinesBbox(
  bbox: [number, number, number, number],
  minVoltageV: number,
  signal?: AbortSignal,
): Promise<TransmissionLine[]> {
  const [south, west, north, east] = bbox;
  const body = `data=${encodeURIComponent(
    `[out:json][timeout:60];way["power"="line"]["voltage"](${south},${west},${north},${east});out geom;`,
  )}`;

  const resp = await overpassPost(body, signal);
  const data = (await resp.json()) as { elements: OverpassWay[] };
  const lines: TransmissionLine[] = [];

  for (const way of data.elements) {
    if (!way.geometry || way.geometry.length < 2) continue;
    const voltageV = parseVoltageV(way.tags['voltage']);
    if (voltageV === null || voltageV < minVoltageV) continue;
    const bucket = voltageKVtoBucket(voltageV / 1000);
    const coords = way.geometry.map((pt) => [pt.lat, pt.lon] as [number, number]);
    // Skip submarine cables / sparse ways — any >50 km node gap means open-water crossing
    if (maxNodeSpanKm(coords) > 50) continue;
    lines.push({
      id: `osm-${way.id}`,
      name: way.tags['name'] ?? `${bucket} kV line`,
      voltage_kV: bucket,
      status: inferStatus(way.tags),
      operator: way.tags['operator'] ?? 'Unknown operator',
      coords,
    });
  }
  return lines;
}

export async function clearOSMCache(): Promise<void> {
  await clearOsmStore('lines');
}

export async function fetchTransmissionLinesFromOSM(
  minVoltageV: number,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<TransmissionLine[]> {
  const allLines: TransmissionLine[] = [];
  let fetchErrors = 0;
  let done = 0;
  const total = SEA_BBOXES.length;
  const CONCURRENCY = 2; // stay within Overpass ~2 simultaneous slots per IP

  for (let i = 0; i < SEA_BBOXES.length; i += CONCURRENCY) {
    if (signal?.aborted) return []; // intentional abort — exit cleanly
    const batch = SEA_BBOXES.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (bbox) => {
        const key = lineCacheKey(bbox, minVoltageV);
        const cached = await readOsmCache<TransmissionLine[]>('lines', key);

        if (cached) {
          allLines.push(...cached.data);
          onProgress?.(++done, total);
          if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
            // Stale — background refresh without blocking
            fetchLinesBbox(bbox, minVoltageV)
              .then((lines) => writeOsmCache('lines', key, lines))
              .catch(() => {});
          }
          return;
        }

        try {
          const lines = await fetchLinesBbox(bbox, minVoltageV, signal);
          await writeOsmCache('lines', key, lines);
          allLines.push(...lines);
        } catch (e) {
          if ((e as Error).name === 'AbortError') return; // abort is not a fetch error
          fetchErrors++;
        }
        onProgress?.(++done, total);
      }),
    );
    if (i + CONCURRENCY < SEA_BBOXES.length && !signal?.aborted) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (signal?.aborted) return [];

  if (allLines.length === 0 && fetchErrors > 0) {
    throw new Error(`Overpass fetches failed (${fetchErrors}/${SEA_BBOXES.length} regions)`);
  }

  const seen = new Set<string>();
  return allLines.filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });
}

// ─── Substation fetch ─────────────────────────────────────────────────────────

interface OverpassSubElement {
  type: 'node' | 'way';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

async function fetchSubstationsBbox(
  bbox: [number, number, number, number],
  minVoltageKV: number,
  signal?: AbortSignal,
): Promise<SubstationFeature[]> {
  const [south, west, north, east] = bbox;
  const body = `data=${encodeURIComponent(
    `[out:json][timeout:60];(node["power"="substation"]["voltage"](${south},${west},${north},${east});way["power"="substation"]["voltage"](${south},${west},${north},${east}););out center tags;`,
  )}`;

  const resp = await overpassPost(body, signal);
  const data = (await resp.json()) as { elements: OverpassSubElement[] };
  const subs: SubstationFeature[] = [];

  for (const el of data.elements) {
    const lat = el.type === 'node' ? el.lat : el.center?.lat;
    const lon = el.type === 'node' ? el.lon : el.center?.lon;
    if (lat == null || lon == null) continue;

    const voltageV = parseVoltageV(el.tags['voltage']);
    if (voltageV === null) continue;
    const voltageKV = voltageV / 1000;
    if (voltageKV < minVoltageKV) continue;

    const name = el.tags['name']
      ?? el.tags['name:en']
      ?? `${Math.round(voltageKV)} kV Substation`;

    subs.push({
      id: `osm-sub-${el.id}`,
      lat,
      lng: lon,
      properties: {
        name,
        operator: el.tags['operator'] ?? el.tags['owner'] ?? 'Unknown',
        voltageKV: Math.round(voltageKV),
        capacityMVA: 0,
        availableHeadroomMVA: 0,
        dedicatedFeedAvailable: false,
        notes: el.tags['description'] ?? el.tags['note'] ?? undefined,
      },
    });
  }
  return subs;
}

export async function clearOSMSubCache(): Promise<void> {
  await clearOsmStore('substations');
}

export async function fetchSubstationsFromOSM(
  minVoltageKV: number,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<SubstationFeature[]> {
  const allSubs: SubstationFeature[] = [];
  let fetchErrors = 0;
  let done = 0;
  const total = SEA_BBOXES.length;
  const CONCURRENCY = 2;

  for (let i = 0; i < SEA_BBOXES.length; i += CONCURRENCY) {
    if (signal?.aborted) return [];
    const batch = SEA_BBOXES.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (bbox) => {
        const key = subCacheKey(bbox, minVoltageKV);
        const cached = await readOsmCache<SubstationFeature[]>('substations', key);

        if (cached) {
          allSubs.push(...cached.data);
          onProgress?.(++done, total);
          if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
            fetchSubstationsBbox(bbox, minVoltageKV)
              .then((subs) => writeOsmCache('substations', key, subs))
              .catch(() => {});
          }
          return;
        }

        try {
          const subs = await fetchSubstationsBbox(bbox, minVoltageKV, signal);
          await writeOsmCache('substations', key, subs);
          allSubs.push(...subs);
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          fetchErrors++;
        }
        onProgress?.(++done, total);
      }),
    );
    if (i + CONCURRENCY < SEA_BBOXES.length && !signal?.aborted) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (signal?.aborted) return [];

  if (allSubs.length === 0 && fetchErrors > 0) {
    throw new Error(`Overpass substation fetches failed (${fetchErrors}/${SEA_BBOXES.length} regions)`);
  }

  const seen = new Set<string>();
  return allSubs.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

// ─── Northern Malaysia focused helpers ───────────────────────────────────────
// Single-bbox fetch covering only Perak, Kedah, Penang, Perlis — fast (~5 s).

export async function fetchNorthernMyLinesFromOSM(
  minVoltageV = 132_000,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
  onRefresh?: (lines: TransmissionLine[]) => void,
): Promise<TransmissionLine[]> {
  const key = lineCacheKey(NORTHERN_MY_BBOX, minVoltageV);

  // L1 — IndexedDB (instant for returning visitors on the same browser)
  const cached = await readOsmCache<TransmissionLine[]>('lines', key);
  if (cached) {
    onProgress?.(1, 1);
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      // Stale-while-revalidate: return cached data immediately, refresh in background,
      // then notify the caller so the current session gets fresh data too.
      fetchLinesBbox(NORTHERN_MY_BBOX, minVoltageV)
        .then((lines) => {
          writeOsmCache('lines', key, lines);
          writeServerCache('lines', lines);
          onRefresh?.(lines);
        })
        .catch(() => {});
    }
    return cached.data;
  }

  // L2 — server Redis cache (shared across all visitors, populated after first ever load)
  const serverCached = await readServerCache<TransmissionLine[]>('lines');
  if (serverCached && serverCached.length > 0) {
    await writeOsmCache('lines', key, serverCached); // save locally for next session
    onProgress?.(1, 1);
    return serverCached;
  }

  // L3 — live Overpass fetch (slow, only happens when Redis is cold)
  const lines = await fetchLinesBbox(NORTHERN_MY_BBOX, minVoltageV, signal);
  await writeOsmCache('lines', key, lines);
  writeServerCache('lines', lines).catch(() => {}); // background upload to Redis
  onProgress?.(1, 1);
  return lines;
}

// ─── State administrative boundary fetch ─────────────────────────────────────

export interface StateBoundaryGeo {
  state: 'Perlis' | 'Kedah' | 'Penang' | 'Perak';
  rings: [number, number][][]; // each ring is a closed polygon [lat, lng][]
}

const BOUNDARY_CACHE_KEY = 'borders-v1:northern-my';

interface OverpassRelationMember {
  type: 'way' | 'node';
  ref: number;
  role: string;
  geometry?: { lat: number; lon: number }[];
}

interface OverpassRelation {
  type: 'relation';
  id: number;
  tags: Record<string, string>;
  members: OverpassRelationMember[];
}

function approxEq(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 0.00015 && Math.abs(a[1] - b[1]) < 0.00015;
}

export function stitchRings(segments: [number, number][][]): [number, number][][] {
  const rings: [number, number][][] = [];
  const rem = segments.filter((s) => s.length >= 2).map((s) => s.slice() as [number, number][]);

  while (rem.length > 0) {
    const ring = rem.splice(0, 1)[0].slice() as [number, number][];
    let budget = rem.length + 1;

    while (budget-- > 0) {
      if (ring.length > 3 && approxEq(ring[0], ring[ring.length - 1])) break;
      let matched = false;
      for (let i = 0; i < rem.length; i++) {
        const seg = rem[i];
        const sS = seg[0], sE = seg[seg.length - 1];
        const rS = ring[0],  rE = ring[ring.length - 1];
        if (approxEq(rE, sS)) {
          ring.push(...seg.slice(1)); rem.splice(i, 1); matched = true; break;
        } else if (approxEq(rE, sE)) {
          ring.push(...[...seg].reverse().slice(1)); rem.splice(i, 1); matched = true; break;
        } else if (approxEq(rS, sE)) {
          ring.unshift(...seg.slice(0, -1)); rem.splice(i, 1); matched = true; break;
        } else if (approxEq(rS, sS)) {
          ring.unshift(...[...seg].reverse().slice(0, -1)); rem.splice(i, 1); matched = true; break;
        }
      }
      if (!matched) break;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

function osmNameToState(name: string): StateBoundaryGeo['state'] | null {
  const n = name.toLowerCase();
  if (n.includes('perlis'))          return 'Perlis';
  if (n.includes('kedah'))           return 'Kedah';
  if (n.includes('pinang') || n.includes('penang')) return 'Penang';
  if (n.includes('perak'))           return 'Perak';
  return null;
}

async function fetchBoundariesFromOverpass(signal?: AbortSignal): Promise<StateBoundaryGeo[]> {
  const [south, west, north, east] = NORTHERN_MY_BBOX;
  const query = `[out:json][timeout:90];(relation["boundary"="administrative"]["admin_level"="4"](${south},${west},${north},${east}););out geom;`;
  const resp = await overpassPost(`data=${encodeURIComponent(query)}`, signal);
  const data = (await resp.json()) as { elements: OverpassRelation[] };

  const results: StateBoundaryGeo[] = [];

  for (const rel of data.elements) {
    if (rel.type !== 'relation') continue;
    const stateName = osmNameToState(rel.tags['name'] ?? rel.tags['name:en'] ?? '');
    if (!stateName) continue;

    const outerSegs: [number, number][][] = rel.members
      .filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry && m.geometry.length >= 2)
      .map((m) => m.geometry!.map((pt) => [pt.lat, pt.lon] as [number, number]));

    const rings = stitchRings(outerSegs);
    if (rings.length > 0) results.push({ state: stateName, rings });
  }

  return results;
}

export async function fetchNorthernMyBoundariesFromOSM(
  signal?: AbortSignal,
): Promise<StateBoundaryGeo[]> {
  // L1 — IndexedDB
  const cached = await readOsmCache<StateBoundaryGeo[]>('boundaries', BOUNDARY_CACHE_KEY);
  if (cached) {
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      fetchBoundariesFromOverpass()
        .then((b) => {
          writeOsmCache('boundaries', BOUNDARY_CACHE_KEY, b);
          writeServerCache('boundaries', b);
        })
        .catch(() => {});
    }
    return cached.data;
  }

  // L2 — server Redis cache
  const serverCached = await readServerCache<StateBoundaryGeo[]>('boundaries');
  if (serverCached && serverCached.length > 0) {
    await writeOsmCache('boundaries', BOUNDARY_CACHE_KEY, serverCached);
    return serverCached;
  }

  // L3 — live Overpass fetch
  const boundaries = await fetchBoundariesFromOverpass(signal);
  if (boundaries.length > 0) {
    await writeOsmCache('boundaries', BOUNDARY_CACHE_KEY, boundaries);
    writeServerCache('boundaries', boundaries).catch(() => {});
  }
  return boundaries;
}

export async function fetchNorthernMySubsFromOSM(
  minVoltageKV = 132,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
  onRefresh?: (subs: SubstationFeature[]) => void,
): Promise<SubstationFeature[]> {
  const key = subCacheKey(NORTHERN_MY_BBOX, minVoltageKV);

  // L1 — IndexedDB
  const cached = await readOsmCache<SubstationFeature[]>('substations', key);
  if (cached) {
    onProgress?.(1, 1);
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      fetchSubstationsBbox(NORTHERN_MY_BBOX, minVoltageKV)
        .then((subs) => {
          writeOsmCache('substations', key, subs);
          writeServerCache('substations', subs);
          onRefresh?.(subs);
        })
        .catch(() => {});
    }
    return cached.data;
  }

  // L2 — server Redis cache
  const serverCached = await readServerCache<SubstationFeature[]>('substations');
  if (serverCached && serverCached.length > 0) {
    await writeOsmCache('substations', key, serverCached);
    onProgress?.(1, 1);
    return serverCached;
  }

  // L3 — live Overpass fetch
  const subs = await fetchSubstationsBbox(NORTHERN_MY_BBOX, minVoltageKV, signal);
  await writeOsmCache('substations', key, subs);
  writeServerCache('substations', subs).catch(() => {});
  onProgress?.(1, 1);
  return subs;
}
