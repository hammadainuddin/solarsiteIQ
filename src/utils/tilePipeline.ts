// Shared tile-generation pipeline + persistent tile cache for Solar SiteIQ.
//
// Exactly ONE place in the app runs the expensive data-load + score-all-cells
// sequence (AppContext). Both the dashboard and the screening map consume the
// same result, which fixes two long-standing issues:
//  - The dashboard previously ran its own duplicate pipeline WITHOUT loading
//    iPlan/PVGIS/road/river data first, so every cell scored on blank
//    fallbacks and its capacity figures were wildly inflated.
//  - The map's tiles lived in SolarMapView local state, so every route change
//    away and back re-ran the whole multi-minute pipeline from scratch.
//
// Generated tiles are cached in IndexedDB under a key COMPOSED from the
// version constants of every dataset and the scoring config they were derived
// from — bumping any input version automatically invalidates stale tiles, so
// there is no separate version to remember to bump here.

import type { HexTile } from '../types';
import type { TransmissionLine } from '../data/transmissionLines';
import type { SubstationFeature } from '../data/infraLayers';
import type { StateBoundaryGeo } from './overpass';
import { idbGet, idbSet } from './idbCache';
import { generate1KmTiles } from './grid1km';
import { ensureWorldcoverLoaded } from './worldcover';
import { ensureIplanLanduseLoaded, IPLAN_CACHE_KEY } from './iplanLanduse';
import { ensureOsmLanduseLoaded, OSM_LANDUSE_CACHE_KEY } from './osmLanduse';
import { ensurePvgisGrid, PVGIS_CACHE_KEY } from './pvgis';
import { ensureRoadDistGrid, ROAD_CACHE_KEY } from './roadDistGrid';
import { ensureRiverGridLoaded, RIVER_CACHE_KEY } from './riverGrid';
import { SCORING_CONFIG_VERSION } from './solarScoring';
import { fetchNorthernMyLinesFromOSM, fetchNorthernMySubsFromOSM } from './overpass';

const TILES_CACHE_KEY = [
  'tiles', SCORING_CONFIG_VERSION, IPLAN_CACHE_KEY, OSM_LANDUSE_CACHE_KEY,
  PVGIS_CACHE_KEY, ROAD_CACHE_KEY, RIVER_CACHE_KEY,
].join('::');

// Tiles also depend on OSM transmission lines/substations, which refresh on a
// 24h stale-while-revalidate cycle — so cap tile age at the same 24h.
const TILES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Session-level memory cache — route changes within one session never touch IDB.
let _memoryTiles: HexTile[] | null = null;

export async function getCachedTiles(): Promise<HexTile[] | null> {
  if (_memoryTiles && _memoryTiles.length > 0) return _memoryTiles;
  try {
    const cached = await idbGet<HexTile[]>(TILES_CACHE_KEY);
    if (cached && (Date.now() - cached.fetchedAt) < TILES_CACHE_TTL_MS && cached.data.length > 0) {
      _memoryTiles = cached.data;
      console.info(`Tiles: ${cached.data.length} cells restored from IndexedDB (no rebuild)`);
      return cached.data;
    }
  } catch { /* fall through to rebuild */ }
  return null;
}

async function setCachedTiles(tiles: HexTile[]): Promise<void> {
  _memoryTiles = tiles;
  try {
    await idbSet(TILES_CACHE_KEY, tiles);
  } catch (err) {
    console.warn('Tiles: IDB cache write failed (will rebuild next session):', err);
  }
}

export interface TilePipelineCallbacks {
  onPhase?: (phase: string) => void;
  onProgress?: (pct: number, totalCells: number) => void;
  /** Fired whenever fresher OSM lines/subs arrive (initial fetch or background revalidate). */
  onLines?: (lines: TransmissionLine[]) => void;
  onSubs?: (subs: SubstationFeature[]) => void;
  isCancelled?: () => boolean;
}

/**
 * Full tile pipeline: load every dataset, fetch grid infra, score all cells.
 * Checks the tile cache first — on a hit, only the (cheap, IDB-backed) lines/
 * subs fetch runs so the map still gets its display layers.
 */
export async function runTilePipeline(
  boundaries: StateBoundaryGeo[],
  extraSubstations: SubstationFeature[],
  cb: TilePipelineCallbacks = {},
): Promise<HexTile[]> {
  const cancelled = () => cb.isCancelled?.() ?? false;

  // Lines/subs are needed regardless of tile-cache state (map display layers),
  // and tiles depend on them when rebuilding. Warm-cache path is instant.
  cb.onPhase?.('Loading transmission network…');
  const [lines, subs] = await Promise.all([
    fetchNorthernMyLinesFromOSM(
      132_000, undefined, undefined,
      (fresh) => { if (!cancelled() && fresh.length > 0) cb.onLines?.(fresh); },
    ).then((ls) => { if (!cancelled() && ls.length > 0) cb.onLines?.(ls); return ls; }),
    fetchNorthernMySubsFromOSM(
      132, undefined, undefined,
      (fresh) => { if (!cancelled() && fresh.length > 0) cb.onSubs?.(fresh); },
    ).then((ss) => { if (!cancelled() && ss.length > 0) cb.onSubs?.(ss); return ss; }),
  ]);
  if (cancelled()) return [];

  // The ensure* loaders below always run, even when tiles come from cache —
  // features beyond tile scoring (pin-drop analysis, workflow panels) read the
  // same in-memory grids, and on a warm IDB cache they all resolve in well
  // under a second. Only the expensive score-all-cells loop is skippable.
  cb.onPhase?.('Loading land cover…');
  await ensureWorldcoverLoaded();
  if (cancelled()) return [];

  cb.onPhase?.('Loading official land use data…');
  // 500 ms is enough for an IndexedDB cache hit to resolve; if the remote
  // server is unreachable the grid falls back to OSM/WorldCover and a
  // successful background load lands in IDB for the next session.
  await Promise.race([
    ensureIplanLanduseLoaded().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 500)),
  ]);
  if (cancelled()) return [];

  cb.onPhase?.('Loading OSM land use data…');
  await ensureOsmLanduseLoaded();
  if (cancelled()) return [];

  cb.onPhase?.('Loading solar irradiance data…');
  await ensurePvgisGrid();
  if (cancelled()) return [];

  cb.onPhase?.('Loading road access data…');
  await ensureRoadDistGrid();
  if (cancelled()) return [];

  cb.onPhase?.('Loading river geometry…');
  await ensureRiverGridLoaded();
  if (cancelled()) return [];

  const cached = await getCachedTiles();
  if (cached) {
    cb.onPhase?.('');
    return cached;
  }

  cb.onPhase?.('Building 1 km grid…');
  const tiles = await generate1KmTiles(
    lines, [...subs, ...extraSubstations], boundaries,
    (done, total) => { if (!cancelled()) cb.onProgress?.(Math.round((done / total) * 100), total); },
  );
  if (cancelled()) return [];

  await setCachedTiles(tiles);
  cb.onPhase?.('');
  return tiles;
}
