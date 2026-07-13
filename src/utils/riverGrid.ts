// OSM river polygon coverage grid for Solar SiteIQ.
// Pre-rasterised from waterway=river / natural=water(river) polygon geometry by
// scripts/download-river-grid.mjs. Stores, per 1 km cell, the fraction of the
// cell's area covered by a river polygon (0–1) — not just centreline crossing.

import { idbGet, idbSet } from './idbCache';

export const RIVER_CACHE_KEY = 'river-grid-v3'; // v3 = fixed multipolygon ring stitching (was falsely marking paddy fields as river)
const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

// Coverage fraction at/above which a cell is considered "dominant river" —
// i.e. so much of the cell is river that it should be labelled purely 'River'
// rather than showing the underlying (likely mis-sampled) land use.
export const DOMINANT_RIVER_THRESHOLD = 0.5;

interface RiverGridFile { version: number; cells: Record<string, number> }

let _cells: Record<string, number> | null = null;
let _loadPromise: Promise<void> | null = null;

async function loadGrid(): Promise<void> {
  const cached = await idbGet<Record<string, number>>(RIVER_CACHE_KEY);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    _cells = cached.data;
    console.info(`River grid: ${Object.keys(_cells).length} cells from IndexedDB`);
    return;
  }

  try {
    const res = await fetch('/data/river-grid.json');
    if (!res.ok) { _cells = {}; return; }
    const data = (await res.json()) as RiverGridFile;
    if (data?.version === 2 && data.cells) {
      _cells = data.cells;
      await idbSet(RIVER_CACHE_KEY, data.cells);
      console.info(`River grid: ${Object.keys(_cells).length} cells loaded from CDN`);
    } else {
      _cells = {};
    }
  } catch {
    _cells = {};
  }
}

export function ensureRiverGridLoaded(): Promise<void> {
  if (_cells !== null) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _loadPromise = loadGrid().catch(() => { _loadPromise = null; });
  return _loadPromise;
}

/** Fraction (0–1) of the 1 km cell covered by a river polygon. 0 if no data or no river. */
export function getRiverCoverage(lat: number, lng: number): number {
  if (!_cells) return 0;
  const key = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
  return _cells[key] ?? 0;
}

/** True if any part of a river polygon overlaps this cell (coverage > 0). */
export function isRiverbankCell(lat: number, lng: number): boolean {
  return getRiverCoverage(lat, lng) > 0;
}

/** True if the cell is so dominated by river that it should be labelled purely 'River'. */
export function isDominantRiverCell(lat: number, lng: number): boolean {
  return getRiverCoverage(lat, lng) >= DOMINANT_RIVER_THRESHOLD;
}
