// ESA WorldCover 2021 client for Solar SiteIQ.
// Fetches the pre-classified 1 km grid from /api/worldcover,
// caches in DuckDB, and provides a synchronous lookup by cell coordinate.

import { getWorldcoverCache, putWorldcoverCache } from './duckDb';
import type { LandUseClass, RiskLevel } from '../types';

// Must match api/worldcover.ts
const BBOX = { south: 3.700, north: 7.100, west: 99.500, east: 102.100 };
const STEP  = 0.009;
const GRID_W = Math.round((BBOX.east  - BBOX.west)  / STEP); // 289
const GRID_H = Math.round((BBOX.north - BBOX.south) / STEP); // 378
const CACHE_KEY = 'northernmy-009';

// Flat grid of WorldCover class codes indexed by [row * W + col]
// row 0 = southernmost latitude (3.700°N), row H-1 = northernmost (7.091°N)
let _wcGrid: number[] | null = null;
let _fetchPromise: Promise<void> | null = null;

interface WorldCoverResponse {
  width: number;
  height: number;
  grid: number[];
}

async function doFetch(): Promise<void> {
  // In local dev: skip DuckDB (WASM not needed here) and skip the API proxy
  // (Vercel functions not available). Grid will use the zone-based fallback in grid1km.ts.
  if (import.meta.env.DEV) {
    _wcGrid = new Array<number>(GRID_W * GRID_H).fill(0);
    return;
  }

  // Production: try DuckDB cache first (avoids re-fetching the WMS PNG on every load)
  const cached = await getWorldcoverCache(CACHE_KEY).catch(() => null);
  if (cached && cached.length > 0) {
    _wcGrid = cached;
    return;
  }

  try {
    const res = await fetch('/api/worldcover');
    if (!res.ok) {
      _wcGrid = new Array<number>(GRID_W * GRID_H).fill(0);
      return;
    }
    const data = await res.json() as WorldCoverResponse;
    _wcGrid = data.grid;
    await putWorldcoverCache(CACHE_KEY, _wcGrid).catch(() => null);
  } catch {
    _wcGrid = new Array<number>(GRID_W * GRID_H).fill(0);
  }
}

/** Trigger a single fetch (idempotent). */
export function ensureWorldcoverLoaded(): Promise<void> {
  if (!_fetchPromise) {
    _fetchPromise = doFetch().catch(() => {
      _fetchPromise = null;
    });
  }
  return _fetchPromise;
}

/** Return the raw WorldCover class code for a cell centre coordinate (synchronous). */
export function getWorldcoverClass(lat: number, lng: number): number {
  if (!_wcGrid) return 0;
  const col = Math.round((lng - BBOX.west) / STEP);
  const row = Math.round((lat - BBOX.south) / STEP);
  if (col < 0 || col >= GRID_W || row < 0 || row >= GRID_H) return 0;
  return _wcGrid[row * GRID_W + col] ?? 0;
}

// ── Class → LandUse mapping ───────────────────────────────────────────────────

const WC_TO_LANDUSE: Record<number, LandUseClass> = {
  10: 'forest',      // Tree cover
  20: 'mixed_agri',  // Shrubland
  30: 'idle_agri',   // Grassland
  40: 'mixed_agri',  // Cropland (refined by OSM landuse polygons)
  50: 'urban',       // Built-up
  60: 'idle_agri',   // Bare / sparse vegetation
  70: 'idle_agri',   // Snow/ice (not present in Malaysia)
  80: 'water',       // Permanent water bodies
  90: 'water',       // Herbaceous wetland
  95: 'forest',      // Mangroves
  100: 'idle_agri',  // Moss/lichen
};

// Flood risk defaults by WorldCover class
const WC_TO_FLOOD: Record<number, RiskLevel> = {
  80: 'high',
  90: 'high',
  95: 'medium',
  30: 'medium',
  10: 'low',
  20: 'low',
  40: 'medium',
  50: 'low',
  60: 'low',
};

// Classes that are inherently protected.
// 10 = dense tree cover → Permanent Reserved Forest (PRF) policy in Malaysia
const PROTECTED_CLASSES = new Set([10, 95]);

/** Map a WorldCover class code to a SiteIQ land use class. */
export function wcToLandUse(wcClass: number): LandUseClass {
  return WC_TO_LANDUSE[wcClass] ?? 'unknown';
}

/** Map a WorldCover class code to a flood risk level. */
export function wcToFloodRisk(wcClass: number): RiskLevel {
  return WC_TO_FLOOD[wcClass] ?? 'low';
}

/** Is the WorldCover class inherently protected? */
export function wcIsProtected(wcClass: number): boolean {
  return PROTECTED_CLASSES.has(wcClass);
}
