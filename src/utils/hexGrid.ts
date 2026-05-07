import { latLngToCell, cellToLatLng, cellToBoundary } from 'h3-js';
import type { HexTile, LandUseClass, RiskLevel, NorthernMyState } from '../types';
import type { SubstationFeature } from '../data/infraLayers';
import type { TransmissionLine } from '../data/transmissionLines';
import { estimateGHI } from './ghi';
import { getZoneAt } from '../data/solarZones';
import {
  scoreGHI, scoreGridProximity, scoreLandUse, scoreFloodRisk,
  scoreRoadAccess, scoreEnvSocial, compositeScore,
} from './solarScoring';
import { haversineKm, pointToPolylineKm } from './spatialContext';

export const H3_RESOLUTION = 6;

// Bounding box covering all four northern states with margin
// minLat 3.70 ensures southern Perak (Teluk Intan / Bidor area, ~3.80°N) is included
const NORTH_MY_BOUNDS = { minLat: 3.70, maxLat: 7.10, minLng: 99.50, maxLng: 102.10 };

// Rough state bounding boxes for tile → state assignment
const STATE_BOXES: { state: NorthernMyState; south: number; north: number; west: number; east: number }[] = [
  { state: 'Perlis', south: 6.20, north: 6.75, west: 99.90, east: 100.50 },
  { state: 'Kedah',  south: 5.30, north: 6.40, west: 100.05, east: 101.20 },
  { state: 'Penang', south: 5.10, north: 5.55, west: 100.10, east: 100.55 },
  { state: 'Perak',  south: 3.80, north: 5.40, west: 100.30, east: 102.00 },
];

function getStateForCoord(lat: number, lng: number): NorthernMyState | null {
  // Priority order matters — Perlis before Kedah (overlap in NW corner)
  for (const b of STATE_BOXES) {
    if (lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east) return b.state;
  }
  return null;
}

// ── Offshore exclusion boxes ──────────────────────────────────────────────────
// The rectangular state boxes include open sea tiles along the Strait of Malacca.
// These boxes cover clearly offshore areas; tile centres inside any of them are
// discarded.  Inland water bodies (Temenggor / Bersia reservoir, ex-mining ponds)
// sit east of lng 101.0+ and are never touched by these boxes — they remain as
// legitimate floating solar (FPV) candidates.
//
// Box edges are set ~0.05–0.10° inland from the actual coastline to avoid cutting
// the coastal land strip.  Approximate Strait coastline longitudes for reference:
//   Perlis (6.2–6.5°N): ~100.20°E  |  Kedah (5.5–6.2°N): ~100.12–100.30°E
//   Penang W (5.2–5.5°N): ~100.20°E  |  N.Perak (4.4–5.2°N): ~100.45°E
//   Mid-Perak (4.0–4.4°N): ~100.50°E  |  S.Perak (3.7–4.0°N): ~100.55°E
const OFFSHORE_BOXES: { south: number; north: number; west: number; east: number }[] = [
  // 1. Far-west open sea (west of 100.00°E) — clearly offshore for all four states
  { south: 3.70, north: 7.10, west: 99.50, east: 100.00 },
  // 2. Sea off Perlis coast
  { south: 6.20, north: 7.10, west: 100.00, east: 100.15 },
  // 3. Sea off north Kedah coast
  { south: 5.80, north: 6.20, west: 100.00, east: 100.12 },
  // 4. Sea off south Kedah / Penang area (mainland shore starts ~100.30°E here)
  { south: 5.20, north: 5.80, west: 100.00, east: 100.15 },
  // 5. Sea south-west of Penang island (island starts ~100.20°E, coast ~100.40°E)
  { south: 4.85, north: 5.20, west: 100.00, east: 100.25 },
  // 6. Sea off north Perak coast (coast starts ~100.45°E)
  { south: 4.40, north: 4.85, west: 100.00, east: 100.32 },
  // 7. Sea off mid-Perak coast (coast starts ~100.50°E)
  { south: 4.00, north: 4.40, west: 100.00, east: 100.40 },
  // 8. Sea off south Perak coast (coast starts ~100.55°E)
  { south: 3.70, north: 4.00, west: 100.00, east: 100.48 },
];

function isOffshore(lat: number, lng: number): boolean {
  return OFFSHORE_BOXES.some(
    (b) => lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east,
  );
}

function isInNorthernPeninsularMy(lat: number, lng: number): boolean {
  // Quick bbox check — state assignment handles finer filtering
  return (
    lat >= NORTH_MY_BOUNDS.minLat && lat <= NORTH_MY_BOUNDS.maxLat &&
    lng >= NORTH_MY_BOUNDS.minLng && lng <= NORTH_MY_BOUNDS.maxLng &&
    getStateForCoord(lat, lng) !== null
  );
}

// Approximate road distance — uses a grid of known A/B road nodes in northern MY
const ROAD_NODES: [number, number][] = [
  // North-South Expressway (E1) corridor
  [6.40, 100.30], [6.20, 100.38], [6.10, 100.37], [5.98, 100.42],
  [5.82, 100.46], [5.65, 100.49], [5.52, 100.46], [5.38, 100.42],
  [5.22, 100.41], [5.10, 100.49], [4.98, 100.75], [4.85, 100.96],
  [4.65, 101.03], [4.30, 101.15], [4.12, 101.28], [3.90, 101.35],
  // Trunk roads east Kedah / Perak
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

// H3 resolution 6 average cell area (km²)
const H3_RES6_AREA_KM2 = 36.13;

// Utility-scale solar density for ground-mount (MW/km²).
// Accounts for panel row spacing, access tracks, inverter buildings, and buffer zones.
const SOLAR_DENSITY_MW_KM2 = 4.5;

// Usable fraction by land use — represents what share of a tile's area
// is realistically developable for solar after deducting existing structures,
// active agricultural operations, and other committed uses.
const USABLE_FRACTION: Partial<Record<LandUseClass, number>> = {
  idle_agri:  0.70, // Fallow / unused farmland — minimal competing use
  rubber:     0.50, // Ageing rubber estates; some processing facilities present
  mixed_agri: 0.40, // Mix of crops, farm buildings and tracks
  oil_palm:   0.25, // Active plantation with mills; significant committed use
  paddy:      0.10, // MADA irrigated paddy — actively farmed, flood infrastructure
  water:      0.15, // Floating solar potential (reservoir / mining pond)
  urban:      0.03, // Rooftop / car-park solar only within urban tiles
  forest:     0.00, // Protected/gazetted forest — not developable
};

function estimateCapacityMW(landUse: LandUseClass, isProtected: boolean): number {
  if (isProtected) return 0;
  const fraction = USABLE_FRACTION[landUse] ?? 0.30;
  return Math.round(H3_RES6_AREA_KM2 * fraction * SOLAR_DENSITY_MW_KM2);
}

// Availability score — proxy using land use and parcel size estimate
function scoreAvailability(landUse: LandUseClass, isProtected: boolean): number {
  if (isProtected) return 0;
  const base: Partial<Record<LandUseClass, number>> = {
    idle_agri:  90,
    rubber:     70,
    mixed_agri: 60,
    oil_palm:   50,
    paddy:      25,
    water:      35,
    urban:       5,
    forest:      0,
  };
  return base[landUse] ?? 50;
}

export function buildTile(
  h3Index: string,
  lat: number,
  lng: number,
  lines: TransmissionLine[],
  subs: SubstationFeature[],
): HexTile {
  const state = getStateForCoord(lat, lng);
  const ghi = estimateGHI(lat, lng);
  const zone = getZoneAt(lat, lng);
  const landUse: LandUseClass = zone?.landUse ?? 'unknown';
  const floodRisk: RiskLevel = zone?.floodRisk ?? 'low';
  const isProtected = zone?.isProtected ?? false;

  const { distKm: distToGridKm, voltageKV: nearestGridVoltageKV } = nearestGridInfo(lat, lng, lines, subs);
  const distToRoadKm = estimateRoadDistKm(lat, lng);

  const solar             = Math.round(scoreGHI(ghi));
  const grid              = scoreGridProximity(distToGridKm, nearestGridVoltageKV);
  const land              = scoreLandUse(landUse, isProtected);
  const availability      = scoreAvailability(landUse, isProtected);
  const climate           = scoreFloodRisk(floodRisk);
  const road              = Math.round(scoreRoadAccess(distToRoadKm));
  const envSocial         = scoreEnvSocial(isProtected, landUse, floodRisk);
  const composite         = compositeScore({ solar, grid, land, availability, climate, road, envSocial });
  const estimatedCapacityMW = estimateCapacityMW(landUse, isProtected);

  return {
    h3Index,
    centerLat: lat,
    centerLng: lng,
    state,
    scores: { solar, grid, land, availability, climate, road, envSocial, composite },
    attributes: { ghiKwhM2Day: ghi, distToGridKm, nearestGridVoltageKV, landUse, floodRisk, distToRoadKm, isProtected, estimatedCapacityMW },
  };
}

export function generateNorthernMyHexTiles(
  lines: TransmissionLine[],
  subs: SubstationFeature[],
): HexTile[] {
  const seen = new Set<string>();
  const tiles: HexTile[] = [];

  for (let lat = NORTH_MY_BOUNDS.minLat; lat <= NORTH_MY_BOUNDS.maxLat; lat += 0.04) {
    for (let lng = NORTH_MY_BOUNDS.minLng; lng <= NORTH_MY_BOUNDS.maxLng; lng += 0.05) {
      const h3Index = latLngToCell(lat, lng, H3_RESOLUTION);
      if (seen.has(h3Index)) continue;
      seen.add(h3Index);

      const [cLat, cLng] = cellToLatLng(h3Index);
      if (!isInNorthernPeninsularMy(cLat, cLng)) continue;
      if (isOffshore(cLat, cLng)) continue; // exclude open-sea tiles

      tiles.push(buildTile(h3Index, cLat, cLng, lines, subs));
    }
  }

  return tiles;
}

export function hexBoundary(h3Index: string): [number, number][] {
  return cellToBoundary(h3Index) as [number, number][];
}
