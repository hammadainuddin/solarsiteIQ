// PVGIS EU JRC REST API client for Solar SiteIQ.
// Pre-fetches a coarse 0.25° grid (≈154 calls) and bilinearly interpolates
// yield for every 1 km cell centre.  Results are cached in DuckDB.

import { getAllPvgisCache, getPvgisCache, putPvgisCache, type PvgisRow } from './duckDb';

const PVGIS_BASE = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';

// Bounding box for northern Malaysia
const BBOX = { south: 3.70, north: 7.10, west: 99.50, east: 102.10 };

// Coarse grid spacing for pre-fetch (0.25° ≈ 28 km)
const COARSE_STEP = 0.25;

// Ground-mounted solar density (kWp per km²). IEC standard spacing for
// single-axis trackers at ~2× row pitch gives ~4 500 kWp/km².
export const SOLAR_DENSITY_KWP_PER_KM2 = 4_500;

// Fraction of each 1 km² cell area realistically developable by land use
export const USABLE_FRACTION: Partial<Record<string, number>> = {
  idle_agri:  0.70,
  rubber:     0.50,
  mixed_agri: 0.40,
  oil_palm:   0.25,
  paddy:      0.10,
  water:      0.15,
  urban:      0.03,
  forest:     0.00,
};

export interface PvgisResult {
  eY: number;       // kWh/kWp/year
  perfRatio: number;
  hiY: number;      // irradiation on inclined plane, kWh/m²/year
}

interface PvgisApiResponse {
  outputs?: {
    totals?: {
      fixed?: {
        E_y?: number;
        l_total?: number;
        'H(i)_y'?: number;
      };
    };
  };
}

async function fetchPvgisPoint(lat: number, lng: number): Promise<PvgisResult | null> {
  // Round to 4 decimal places to keep URLs clean
  const flatLat = Math.round(lat * 1000) / 1000;
  const flatLng = Math.round(lng * 1000) / 1000;

  // Check DuckDB first
  const cached = await getPvgisCache(flatLat, flatLng).catch(() => null);
  if (cached) {
    return { eY: cached.e_y, perfRatio: cached.perf_ratio, hiY: cached.h_i_y };
  }

  try {
    const url =
      `${PVGIS_BASE}?lat=${flatLat}&lon=${flatLng}` +
      `&peakpower=1000&loss=14&mounted=1&outputformat=json`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const json = await res.json() as PvgisApiResponse;
    const fixed = json.outputs?.totals?.fixed;
    if (!fixed?.E_y) return null;

    const eY = fixed.E_y / 1000; // response is for 1000 kWp → convert to per kWp
    const lTotal = Math.abs(fixed.l_total ?? 14);
    const perfRatio = 1 - lTotal / 100;
    const hiY = fixed['H(i)_y'] ?? 0;

    const row: PvgisRow = { lat: flatLat, lng: flatLng, e_y: eY, perf_ratio: perfRatio, h_i_y: hiY };
    await putPvgisCache(row).catch(() => null);

    return { eY, perfRatio, hiY };
  } catch {
    return null;
  }
}

// In-memory lookup built from the coarse grid
let _pvgisGrid: Map<string, PvgisResult> | null = null;

function gridKey(lat: number, lng: number): string {
  return `${Math.round(lat * 100) / 100}_${Math.round(lng * 100) / 100}`;
}

/** Load all cached PVGIS rows from DuckDB into an in-memory Map. */
async function loadCacheIntoMemory(): Promise<Map<string, PvgisResult>> {
  const rows = await getAllPvgisCache();
  const map = new Map<string, PvgisResult>();
  for (const r of rows) {
    map.set(gridKey(r.lat, r.lng), { eY: r.e_y, perfRatio: r.perf_ratio, hiY: r.h_i_y });
  }
  return map;
}

/**
 * Pre-fetch PVGIS data for all 0.25° grid points in northern Malaysia.
 * Skips points already in DuckDB.  Reports progress via callback.
 */
export async function prefetchPvgisGrid(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (let la = BBOX.south; la <= BBOX.north + 0.001; la = Math.round((la + COARSE_STEP) * 1000) / 1000) lats.push(la);
  for (let lo = BBOX.west;  lo <= BBOX.east  + 0.001; lo = Math.round((lo + COARSE_STEP) * 1000) / 1000) lngs.push(lo);

  const points: [number, number][] = [];
  for (const la of lats) for (const lo of lngs) points.push([la, lo]);

  const total = points.length;
  let done = 0;
  const CONCURRENCY = 20; // well within PVGIS 30 req/s limit

  for (let i = 0; i < points.length; i += CONCURRENCY) {
    const batch = points.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(([la, lo]) => fetchPvgisPoint(la, lo)));
    done += batch.length;
    onProgress?.(done, total);
  }

  _pvgisGrid = await loadCacheIntoMemory();
}

/** Ensure the in-memory grid is populated (loads from DuckDB if not already). */
export async function ensurePvgisGrid(): Promise<void> {
  if (_pvgisGrid !== null) return;
  if (import.meta.env.DEV) {
    // Skip DuckDB in dev — use empty map so interpolatePvgis returns DEFAULT_EY immediately
    _pvgisGrid = new Map();
    return;
  }
  _pvgisGrid = await loadCacheIntoMemory();
}

/** Default yield for locations not yet in cache (~northern Malaysia average). */
const DEFAULT_EY = 1_420; // kWh/kWp/year

/**
 * Bilinear interpolation of PVGIS yield at an arbitrary 1 km cell centre.
 * Falls back to the nearest coarse-grid value, then to the northern-Malaysia default.
 */
export function interpolatePvgis(lat: number, lng: number): PvgisResult {
  if (!_pvgisGrid || _pvgisGrid.size === 0) {
    return { eY: DEFAULT_EY, perfRatio: 0.86, hiY: DEFAULT_EY / 0.86 };
  }

  // Find surrounding coarse grid corners
  const la0 = Math.floor(lat / COARSE_STEP) * COARSE_STEP;
  const la1 = la0 + COARSE_STEP;
  const lo0 = Math.floor(lng / COARSE_STEP) * COARSE_STEP;
  const lo1 = lo0 + COARSE_STEP;

  const q00 = _pvgisGrid.get(gridKey(la0, lo0));
  const q10 = _pvgisGrid.get(gridKey(la1, lo0));
  const q01 = _pvgisGrid.get(gridKey(la0, lo1));
  const q11 = _pvgisGrid.get(gridKey(la1, lo1));

  // Need all four corners for bilinear; fall back to nearest if any missing
  if (!q00 || !q10 || !q01 || !q11) {
    const fallback = q00 ?? q10 ?? q01 ?? q11;
    if (fallback) return fallback;
    return { eY: DEFAULT_EY, perfRatio: 0.86, hiY: DEFAULT_EY / 0.86 };
  }

  const tx = (lng - lo0) / COARSE_STEP;
  const ty = (lat - la0) / COARSE_STEP;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const eY = lerp(lerp(q00.eY, q01.eY, tx), lerp(q10.eY, q11.eY, tx), ty);
  const pr = lerp(lerp(q00.perfRatio, q01.perfRatio, tx), lerp(q10.perfRatio, q11.perfRatio, tx), ty);
  const hi = lerp(lerp(q00.hiY, q01.hiY, tx), lerp(q10.hiY, q11.hiY, tx), ty);

  return { eY, perfRatio: pr, hiY: hi };
}

/** Calculate installed capacity and annual yield for a 1 km² cell. */
export function calcCapacity(
  landUse: string,
  isProtected: boolean,
  pvgisEy: number,
): { capacityKWp: number; annualYieldMWh: number } {
  if (isProtected || landUse === 'forest') return { capacityKWp: 0, annualYieldMWh: 0 };
  const fraction = USABLE_FRACTION[landUse] ?? 0.30;
  const capacityKWp = 1.0 * fraction * SOLAR_DENSITY_KWP_PER_KM2;
  const annualYieldMWh = (capacityKWp * pvgisEy) / 1_000;
  return { capacityKWp: Math.round(capacityKWp), annualYieldMWh: Math.round(annualYieldMWh) };
}
