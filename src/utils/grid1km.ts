// 1 km × 1 km regular lat/lng grid for Solar SiteIQ.
// Replaces the H3 resolution-6 hex grid (~36 km²) with a 0.009° × 0.009° grid
// (~1.0 km × 1.0 km at 4–7°N). Cells are labelled by their SW corner.
//
// Cell ID format: "${swLat.toFixed(3)}_${swLng.toFixed(3)}" e.g. "4.500_100.008"
// This string is stored in HexTile.h3Index for backward compatibility.

import type { HexTile, LandUseClass, RiskLevel, NorthernMyState } from '../types';
import type { SubstationFeature } from '../data/infraLayers';
import type { TransmissionLine } from '../data/transmissionLines';
import type { StateBoundaryGeo } from './overpass';
import {
  scoreGHI, scoreGridProximity, scoreLandUse, scoreFloodRisk,
  scoreRoadAccess, scoreEnvSocial, compositeScore,
} from './solarScoring';
import { haversineKm, pointToPolylineKm } from './spatialContext';
import { estimateGHI } from './ghi';
import { getZoneAt } from '../data/solarZones';
import { getWorldcoverClass, wcToLandUse, wcToFloodRisk, wcIsProtected } from './worldcover';
import { interpolatePvgis, calcCapacity } from './pvgis';

// ── Grid constants ────────────────────────────────────────────────────────────
export const GRID_STEP  = 0.009; // degrees ≈ 1.0 km at Malaysia's latitude
export const GRID_BBOX  = { south: 3.700, north: 7.100, west: 99.500, east: 102.100 };
export const GRID_W     = Math.round((GRID_BBOX.east  - GRID_BBOX.west)  / GRID_STEP); // 289
export const GRID_H     = Math.round((GRID_BBOX.north - GRID_BBOX.south) / GRID_STEP); // 378

// ── Re-export polygon helpers from hexGrid.ts (they are state-independent) ──
// We re-implement them here to avoid importing hexGrid.ts and creating a
// circular dependency, since hexGrid.ts now imports from this file.

interface IndexedRing {
  state: NorthernMyState;
  ring: [number, number][];
  bbox: { s: number; n: number; w: number; e: number };
}

export function buildRingIndex(boundaries: StateBoundaryGeo[]): IndexedRing[] {
  const out: IndexedRing[] = [];
  for (const sb of boundaries) {
    for (const ring of sb.rings) {
      let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
      for (const [lat, lng] of ring) {
        if (lat < s) s = lat;
        if (lat > n) n = lat;
        if (lng < w) w = lng;
        if (lng > e) e = lng;
      }
      out.push({ state: sb.state, ring, bbox: { s, n, w, e } });
    }
  }
  return out;
}

function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointToState(lat: number, lng: number, rings: IndexedRing[]): NorthernMyState | null {
  for (const r of rings) {
    if (lat < r.bbox.s || lat > r.bbox.n || lng < r.bbox.w || lng > r.bbox.e) continue;
    if (pointInRing(lat, lng, r.ring)) return r.state;
  }
  return null;
}

// ── Pre-computed coarse spatial lookup for grid/substation distances ─────────
// Building a 0.05° resolution lookup grid avoids calling nearestGridInfo (which
// is O(lines × segments)) for every one of the 52k cells. Instead we pre-build
// once (~3 000 points) and do O(1) lookups per cell.

interface GridDistEntry { distKm: number; voltageKV: number }
const DIST_SNAP = 0.05; // degrees (~5 km)

function buildGridDistLookup(
  lines: TransmissionLine[],
  subs: SubstationFeature[],
): Map<string, GridDistEntry> {
  const lookup = new Map<string, GridDistEntry>();
  const latMin = +(Math.floor(GRID_BBOX.south / DIST_SNAP) * DIST_SNAP).toFixed(2);
  const latMax = +(Math.ceil (GRID_BBOX.north  / DIST_SNAP) * DIST_SNAP).toFixed(2);
  const lngMin = +(Math.floor(GRID_BBOX.west   / DIST_SNAP) * DIST_SNAP).toFixed(2);
  const lngMax = +(Math.ceil (GRID_BBOX.east    / DIST_SNAP) * DIST_SNAP).toFixed(2);
  for (let la = +latMin; la <= +latMax + 0.001; la = +(la + DIST_SNAP).toFixed(2)) {
    for (let lo = +lngMin; lo <= +lngMax + 0.001; lo = +(lo + DIST_SNAP).toFixed(2)) {
      lookup.set(`${la.toFixed(2)}_${lo.toFixed(2)}`, nearestGridInfo(la, lo, lines, subs));
    }
  }
  return lookup;
}

function snapGridDist(lat: number, lng: number, lookup: Map<string, GridDistEntry>): GridDistEntry {
  const la = +(Math.round(lat / DIST_SNAP) * DIST_SNAP).toFixed(2);
  const lo = +(Math.round(lng / DIST_SNAP) * DIST_SNAP).toFixed(2);
  return lookup.get(`${la}_${lo}`) ?? { distKm: 50, voltageKV: 132 };
}

// ── Road distance approximation (same nodes as hexGrid.ts) ───────────────────
const ROAD_NODES: [number, number][] = [
  [6.40, 100.30], [6.20, 100.38], [6.10, 100.37], [5.98, 100.42],
  [5.82, 100.46], [5.65, 100.49], [5.52, 100.46], [5.38, 100.42],
  [5.22, 100.41], [5.10, 100.49], [4.98, 100.75], [4.85, 100.96],
  [4.65, 101.03], [4.30, 101.15], [4.12, 101.28], [3.90, 101.35],
  [5.68, 100.92], [5.80, 100.74], [5.75, 100.60],
  [5.42, 101.14], [5.30, 101.22],
];

function estimateRoadDistKm(lat: number, lng: number): number {
  let min = Infinity;
  const p = { lat, lng };
  for (const [rlat, rlng] of ROAD_NODES) {
    const d = haversineKm(p, { lat: rlat, lng: rlng });
    if (d < min) min = d;
  }
  return +min.toFixed(1);
}

function nearestGridInfo(
  lat: number,
  lng: number,
  lines: TransmissionLine[],
  subs: SubstationFeature[],
): { distKm: number; voltageKV: number } {
  let minDist = Infinity;
  let bestVoltage = 132;
  const p = { lat, lng };
  for (const line of lines) {
    if (line.status === 'planned') continue;
    const d = pointToPolylineKm(p, line.coords as [number, number][]);
    if (d < minDist) { minDist = d; bestVoltage = line.voltage_kV; }
  }
  for (const sub of subs) {
    const d = haversineKm(p, { lat: sub.lat, lng: sub.lng });
    if (d < minDist) { minDist = d; bestVoltage = sub.properties.voltageKV; }
  }
  return { distKm: +minDist.toFixed(1), voltageKV: bestVoltage };
}

// ── Cell ID ───────────────────────────────────────────────────────────────────

/** Convert SW corner coordinates to cell ID string. */
export function makeCellId(swLat: number, swLng: number): string {
  return `${swLat.toFixed(3)}_${swLng.toFixed(3)}`;
}

/** Parse a cell ID back to SW corner coordinates. */
export function parseCellId(id: string): [number, number] {
  const [lat, lng] = id.split('_').map(Number);
  return [lat, lng];
}

/** Return the four corners of a 1 km cell as lat/lng tuples (clockwise). */
export function cellBounds(cellId: string): [number, number][] {
  const [swLat, swLng] = parseCellId(cellId);
  const neLat = +(swLat + GRID_STEP).toFixed(3);
  const neLng = +(swLng + GRID_STEP).toFixed(3);
  return [
    [swLat, swLng],
    [swLat, neLng],
    [neLat, neLng],
    [neLat, swLng],
  ];
}

// ── Determine land use for a cell ─────────────────────────────────────────────
// Priority:
//  1. solarZones.ts protected entries (forest reserves, Ramsar sites)
//  2. OSM-derived landuse for cropland refinement (paddy / rubber / oil_palm)
//  3. WorldCover 2021 class

interface OsmLanduse {
  landUse: LandUseClass;
  floodRisk: RiskLevel;
}

function getLandUseForCell(
  cLat: number,
  cLng: number,
  osmLanduse?: OsmLanduse | null,
): { landUse: LandUseClass; floodRisk: RiskLevel; isProtected: boolean; wcClass: number } {
  // 1. Protected zone override from solarZones.ts
  const zone = getZoneAt(cLat, cLng);
  if (zone?.isProtected) {
    return {
      landUse: zone.landUse,
      floodRisk: zone.floodRisk,
      isProtected: true,
      wcClass: 10, // treat as tree cover
    };
  }

  // 2. WorldCover primary classification
  const wcClass = getWorldcoverClass(cLat, cLng);
  let landUse  = wcToLandUse(wcClass);
  let floodRisk = wcToFloodRisk(wcClass);
  const isProtected = wcIsProtected(wcClass) || (zone?.isProtected ?? false);

  // 3. Refine cropland (class 40) with OSM landuse polygon data
  if (wcClass === 40 && osmLanduse) {
    landUse   = osmLanduse.landUse;
    floodRisk = osmLanduse.floodRisk;
  }

  // 4. Fall back to zone data if WorldCover returned no-data (class 0)
  if (wcClass === 0 && zone) {
    landUse   = zone.landUse;
    floodRisk = zone.floodRisk;
  }

  // 5. WorldCover unavailable (dev mode or API not yet loaded) — use a coarse
  //    location-aware heuristic so cells render with a realistic score.
  //    East of 101.3°E is Titiwangsa highlands → forest; coastal strip (<100.6°E
  //    below 5°N) is mangrove-heavy → mixed_agri; interior lowlands → oil_palm.
  if (wcClass === 0 && !zone) {
    if (cLng > 101.3) {
      landUse   = 'forest';
      floodRisk = 'low';
    } else if (cLng < 100.6 && cLat < 5.0) {
      landUse   = 'mixed_agri';
      floodRisk = 'medium';
    } else if (cLat > 5.8) {
      landUse   = 'paddy';      // Kedah/Perlis rice bowl
      floodRisk = 'medium';
    } else {
      landUse   = 'oil_palm';   // interior Perak / south Kedah lowlands
      floodRisk = 'low';
    }
  }

  return { landUse, floodRisk, isProtected, wcClass };
}

// ── Build one tile ────────────────────────────────────────────────────────────

function buildCell(
  swLat: number,
  swLng: number,
  states: NorthernMyState[],
  distLookup: Map<string, GridDistEntry>,
  roadLookup: Map<string, number>,
): HexTile {
  const cLat = +(swLat + GRID_STEP / 2).toFixed(4);
  const cLng = +(swLng + GRID_STEP / 2).toFixed(4);

  const { landUse, floodRisk, isProtected, wcClass } = getLandUseForCell(cLat, cLng);

  // PVGIS yield (interpolated from pre-fetched coarse grid; defaults if not yet fetched)
  const pvgis = interpolatePvgis(cLat, cLng);
  const ghi   = pvgis.hiY > 0 ? pvgis.hiY / 365 : estimateGHI(cLat, cLng);

  const { distKm: distToGridKm, voltageKV: nearestGridVoltageKV } = snapGridDist(cLat, cLng, distLookup);
  const distToRoadKm = roadLookup.get(`${+(Math.round(cLat / DIST_SNAP) * DIST_SNAP).toFixed(2)}_${+(Math.round(cLng / DIST_SNAP) * DIST_SNAP).toFixed(2)}`) ?? estimateRoadDistKm(cLat, cLng);
  const { capacityKWp, annualYieldMWh } = calcCapacity(landUse, isProtected, pvgis.eY);

  const solar       = Math.round(scoreGHI(ghi));
  const grid        = scoreGridProximity(distToGridKm, nearestGridVoltageKV);
  const land        = scoreLandUse(landUse as LandUseClass, isProtected);
  const climate     = scoreFloodRisk(floodRisk);
  const road        = Math.round(scoreRoadAccess(distToRoadKm));
  const envSocial   = scoreEnvSocial(isProtected, landUse as LandUseClass, floodRisk);

  // Availability: proportion of tile area realistically acquirable
  const AVAIL_SCORES: Partial<Record<LandUseClass, number>> = {
    idle_agri: 90, rubber: 70, mixed_agri: 60, oil_palm: 50,
    paddy: 25, water: 35, urban: 5, forest: 0,
  };
  const availability = isProtected ? 0 : ((AVAIL_SCORES[landUse as LandUseClass] ?? 50));

  const composite = compositeScore({ solar, grid, land, availability, climate, road, envSocial });

  return {
    h3Index: makeCellId(swLat, swLng),
    centerLat: cLat,
    centerLng: cLng,
    states,
    scores: { solar, grid, land, availability, climate, road, envSocial, composite },
    attributes: {
      ghiKwhM2Day: +ghi.toFixed(2),
      distToGridKm,
      nearestGridVoltageKV,
      landUse: landUse as LandUseClass,
      floodRisk,
      distToRoadKm,
      isProtected,
      estimatedCapacityMW: Math.round(capacityKWp / 1000 * 10) / 10,
      capacityKWp,
      pvgisEyKWhPerKWp: +pvgis.eY.toFixed(0),
      annualYieldMWh,
      worldcoverClass: wcClass,
    },
  };
}

// ── Main generator ────────────────────────────────────────────────────────────

/**
 * Generate all 1 km × 1 km grid tiles for northern Malaysia.
 * Pre-builds spatial lookup grids for O(1) distance queries per cell.
 * Calls `onProgress(done, total)` every 2 000 cells.
 */
export async function generate1KmTiles(
  lines: TransmissionLine[],
  subs: SubstationFeature[],
  boundaries: StateBoundaryGeo[],
  onProgress?: (done: number, total: number) => void,
): Promise<HexTile[]> {
  const rings = buildRingIndex(boundaries);

  // Pre-build O(1) spatial lookup grids — avoids per-cell O(lines × segments) scan
  const distLookup = buildGridDistLookup(lines, subs);
  const roadLookup = new Map<string, number>();
  for (const [key] of distLookup) {
    const [la, lo] = key.split('_').map(Number);
    roadLookup.set(key, estimateRoadDistKm(la, lo));
  }

  const tiles: HexTile[] = [];

  const latVals: number[] = [];
  const lngVals: number[] = [];
  for (let la = GRID_BBOX.south; la < GRID_BBOX.north; la = +(la + GRID_STEP).toFixed(3)) latVals.push(la);
  for (let lo = GRID_BBOX.west;  lo < GRID_BBOX.east;  lo = +(lo + GRID_STEP).toFixed(3)) lngVals.push(lo);

  const total = latVals.length * lngVals.length;
  let processed = 0;

  for (const swLat of latVals) {
    for (const swLng of lngVals) {
      const cLat = +(swLat + GRID_STEP / 2).toFixed(4);
      const cLng = +(swLng + GRID_STEP / 2).toFixed(4);

      // Land filter: cell centre must be inside a state polygon
      const state = pointToState(cLat, cLng, rings);
      if (!state) {
        processed++;
        continue;
      }

      tiles.push(buildCell(swLat, swLng, [state], distLookup, roadLookup));
      processed++;

      if (processed % 2_000 === 0) {
        onProgress?.(processed, total);
        // Yield to the event loop to keep UI responsive
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  onProgress?.(processed, total);
  return tiles;
}
