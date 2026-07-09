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
import { getOsmLanduseAt } from './osmLanduse';
import { getIplanLanduseAt } from './iplanLanduse';
import { getRoadDistAt } from './roadDistGrid';
import { getRiverCoverage, DOMINANT_RIVER_THRESHOLD } from './riverGrid';

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

// ── Road distance — polyline-based ───────────────────────────────────────────
// Major road corridors in northern Peninsular Malaysia as polylines.
// Using pointToPolylineKm gives the true perpendicular distance to the road,
// producing smooth continuous contours instead of circular Voronoi blobs.
const ROAD_POLYLINES: [number, number][][] = [
  // North-South Expressway (E1) + Federal Route 1 — Kedah/Perlis section
  [
    [6.63, 100.43], // Bukit Kayu Hitam (Thai border)
    [6.42, 100.37], // Jitra
    [6.27, 100.42], // Kodiang / Kepala Batas
    [6.12, 100.37], // Alor Setar
    [5.97, 100.41], // Gurun
    [5.83, 100.45], // Bedong
    [5.73, 100.47], // Sungai Petani North
    [5.65, 100.49], // Sungai Petani
    [5.56, 100.48], // Bukit Tengah
    [5.42, 100.40], // Butterworth
    [5.28, 100.42], // Juru
    [5.14, 100.53], // Nibong Tebal
  ],
  // North-South Expressway (E1) — Perak section
  [
    [5.14, 100.53], // Nibong Tebal
    [5.03, 100.72], // Parit Buntar
    [4.97, 100.81], // Bagan Serai
    [4.85, 100.73], // Taiping
    [4.77, 100.93], // Kuala Kangsar area
    [4.60, 101.10], // Gopeng
    [4.55, 101.10], // Ipoh North
    [4.42, 101.08], // Ipoh
    [4.30, 101.11], // Simpang Pulai
    [4.13, 101.19], // Batu Gajah / Kampar area
    [3.97, 101.22], // Kampar
    [3.82, 101.27], // Tapah
    [3.73, 101.30], // Slim River
  ],
  // East-West Highway (E8): Butterworth → Gerik → (Kota Bharu direction)
  [
    [5.40, 100.40], // Butterworth
    [5.38, 100.65], // heading east through mainland Penang
    [5.28, 100.88], // Sungai Siput South
    [5.25, 100.98], // Lenggong area
    [5.32, 101.15], // heading north-east to Gerik
    [5.42, 101.13], // Gerik
    [5.62, 101.45], // Gerik East (entering Kelantan range)
  ],
  // Ipoh → Teluk Intan → Lumut (west Perak coastal road)
  [
    [4.42, 101.08], // Ipoh
    [4.35, 100.97], // Batu Gajah
    [4.22, 100.88], // heading west
    [4.08, 100.73], // Sitiawan
    [3.97, 100.72], // Lumut
  ],
  // Taiping → Teluk Intan (west coast Perak)
  [
    [4.85, 100.73], // Taiping
    [4.65, 100.68], // Pantai Remis area
    [4.40, 100.63], // Bagan Datoh
    [4.22, 100.63], // Teluk Intan
  ],
  // Alor Setar → Baling (east Kedah corridor)
  [
    [6.12, 100.37], // Alor Setar
    [5.97, 100.60], // heading east
    [5.82, 100.74], // Kuala Nerang area
    [5.69, 100.91], // Baling
  ],
  // Perlis internal (Kangar ↔ Arau ↔ Padang Besar)
  [
    [6.45, 100.20], // Kangar
    [6.52, 100.32], // Arau
    [6.63, 100.43], // Padang Besar / Changlun
  ],
];

function estimateRoadDistKm(lat: number, lng: number): number {
  let min = Infinity;
  const p = { lat, lng };
  for (const poly of ROAD_POLYLINES) {
    const d = pointToPolylineKm(p, poly);
    if (d < min) min = d;
  }
  return +min.toFixed(1);
}

// ── Exact transmission-line distance (per cell) ───────────────────────────────
// Formerly a coarse 0.05° snap lookup, which caused visible 5 km square blocks
// in the composite score heatmap. Computing per cell is ~150 ms for 25 k cells
// × 49 lines and removes the quantisation artefact entirely.

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

// ── Geographic paddy zone heuristic ──────────────────────────────────────────
// When neither iPlan nor OSM has data, WorldCover 2021 cannot distinguish
// paddy from generic cropland or bare ground (off-season plowed fields).
// These bboxes match the two largest paddy irrigation schemes in northern MY:
//   MADA   — Muda Agricultural Development Authority (Kedah + Perlis)
//   Kerian — IADA Kerian (north Perak, near Kedah border)
// Within these zones, WorldCover class 40 (cropland) and class 0 (no data)
// are overwhelmingly paddy, so we promote them rather than falling through
// to mixed_agri / idle_agri.

const PADDY_ZONES = [
  { s: 5.60, n: 6.65, w: 99.90, e: 100.75 }, // MADA (Kedah + Perlis)
  { s: 4.55, n: 5.10, w: 100.35, e: 100.72 }, // IADA Kerian (north Perak)
] as const;

function isInPaddyZone(lat: number, lng: number): boolean {
  return PADDY_ZONES.some((z) => lat >= z.s && lat <= z.n && lng >= z.w && lng <= z.e);
}

// ── Determine land use for a cell ─────────────────────────────────────────────
// Priority:
//  1. solarZones.ts protected entries (forest reserves, Ramsar sites)
//  2. iPlan GTsemasa  (official MY government current land use — primary)
//  3. OSM landuse polygon (secondary — fills iPlan gaps)
//  4. WorldCover 2021 class (tertiary fallback) + paddy zone heuristic
//  5. Paddy zone default / idle_agri

function getLandUseForCell(
  cLat: number,
  cLng: number,
): { landUse: LandUseClass; floodRisk: RiskLevel; isProtected: boolean; wcClass: number } {
  // 1. Protected zone override from solarZones.ts
  const zone = getZoneAt(cLat, cLng);
  if (zone?.isProtected) {
    return { landUse: zone.landUse, floodRisk: zone.floodRisk, isProtected: true, wcClass: 10 };
  }

  // 2. iPlan (official Malaysian government land use data)
  const iplan = getIplanLanduseAt(cLat, cLng);
  if (iplan) {
    return { landUse: iplan.landUse, floodRisk: iplan.floodRisk, isProtected: iplan.isProtected, wcClass: 0 };
  }

  // 3. OSM landuse polygon
  const osm = getOsmLanduseAt(cLat, cLng);
  if (osm) {
    return { landUse: osm.landUse, floodRisk: osm.floodRisk, isProtected: osm.isProtected, wcClass: 0 };
  }

  // 4. WorldCover 2021 fallback (with paddy zone heuristic)
  const wcClass = getWorldcoverClass(cLat, cLng);
  if (wcClass !== 0) {
    // In MADA / Kerian: WorldCover cropland (40) = paddy with high confidence.
    // Off-season paddy (plowed bare soil) also often maps to class 60 — promote that too.
    if (isInPaddyZone(cLat, cLng) && (wcClass === 40 || wcClass === 60)) {
      return { landUse: 'paddy', floodRisk: 'medium', isProtected: false, wcClass };
    }
    // WorldCover class 10 ("tree cover") is well documented to conflate oil palm and
    // rubber plantation canopy with genuine forest across Southeast Asia. Real gazetted
    // forest reserves are already caught by the solarZones.ts registry in step 1 above,
    // so reaching class 10 here (no iPlan, no OSM, no protected-zone match) in this
    // heavily-cultivated lowland corridor is overwhelmingly more likely to be plantation
    // than true forest — e.g. Kerian coastal belt oil palm blocks with no iPlan/OSM
    // coverage were showing up as 'forest' purely from this WorldCover misclassification.
    if (wcClass === 10) {
      return { landUse: 'oil_palm', floodRisk: 'low', isProtected: false, wcClass };
    }
    return {
      landUse: wcToLandUse(wcClass),
      floodRisk: wcToFloodRisk(wcClass),
      isProtected: wcIsProtected(wcClass),
      wcClass,
    };
  }

  // 5. Last resort — no iPlan, no OSM, and no WorldCover class at all (wcClass 0).
  // Previously defaulted to 'paddy' for any coordinate inside the giant MADA/Kerian
  // geographic bboxes, regardless of whether that coordinate was an actual paddy
  // field, a town, a river, or open coastline — the same "guess from a big
  // rectangle" pattern that caused the Kuala Gula protected-zone bug. This branch
  // is also the ONLY thing that runs in local dev, since worldcover.ts intentionally
  // stubs wcClass to 0 there (no Vercel API route available), so in dev mode this
  // default applied to every single cell without iPlan/OSM data across all 4
  // states — e.g. Sungai Petani's outskirts and the wider Kedah west coast
  // reported as blanket 'paddy'. Default to 'idle_agri' (unknown/undetermined)
  // instead of confidently asserting a specific crop with no actual evidence.
  return { landUse: 'idle_agri', floodRisk: 'low', isProtected: false, wcClass: 0 };
}

// ── Build one tile ────────────────────────────────────────────────────────────

function buildCell(
  swLat: number,
  swLng: number,
  states: NorthernMyState[],
  lines: TransmissionLine[],
  subs: SubstationFeature[],
): HexTile {
  const cLat = +(swLat + GRID_STEP / 2).toFixed(4);
  const cLng = +(swLng + GRID_STEP / 2).toFixed(4);

  let { landUse, floodRisk, isProtected, wcClass } = getLandUseForCell(cLat, cLng);

  // River polygon overlay (ground-truth OSM geometry) — corrects iPlan/OSM/WorldCover
  // point-sampling errors where a cell fully covered by river gets labelled by
  // whatever adjacent land parcel the sample point happened to hit.
  const riverCoverage = getRiverCoverage(cLat, cLng);
  const isRiverbank   = riverCoverage > 0;
  if (riverCoverage >= DOMINANT_RIVER_THRESHOLD) {
    landUse = 'river';
    isProtected = true;
    floodRisk = 'high';
  }

  const pvgis = interpolatePvgis(cLat, cLng);
  const ghi   = pvgis.hiY > 0 ? pvgis.hiY / 365 : estimateGHI(cLat, cLng);

  const { distKm: distToGridKm, voltageKV: nearestGridVoltageKV } = nearestGridInfo(cLat, cLng, lines, subs);
  const distToRoadKm = getRoadDistAt(cLat, cLng) ?? estimateRoadDistKm(cLat, cLng);
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
    paddy: 25, water: 40, industrial: 65, commercial: 55,
    urban: 5, infrastructure: 3, forest: 0, river: 0,
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
      isRiverbank,
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

      tiles.push(buildCell(swLat, swLng, [state], lines, subs));
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
