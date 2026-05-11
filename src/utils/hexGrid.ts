import { latLngToCell, cellToLatLng, cellToBoundary } from 'h3-js';
import type { HexTile, LandUseClass, RiskLevel, NorthernMyState } from '../types';
import type { SubstationFeature } from '../data/infraLayers';
import type { TransmissionLine } from '../data/transmissionLines';
import type { StateBoundaryGeo } from './overpass';
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

// Rough state bounding boxes for tile → state assignment.
// Priority order: Perlis first (overlaps Kedah NW), then Perak-east before Kedah so
// Hulu Perak tiles (e.g. Gerik ~5.42°N 101.12°E) are correctly assigned to Perak
// rather than Kedah whose eastern boundary was previously too wide.
const STATE_BOXES: { state: NorthernMyState; south: number; north: number; west: number; east: number }[] = [
  { state: 'Perlis', south: 6.20, north: 6.75, west: 99.90, east: 100.50 },
  // Perak-east shard catches Hulu Perak / Gerik (>101°E) before Kedah box is tested
  { state: 'Perak',  south: 5.00, north: 5.65, west: 101.00, east: 102.00 },
  // Kedah east boundary trimmed to 101.00 — beyond that is Perak (Hulu Perak district)
  { state: 'Kedah',  south: 5.30, north: 6.40, west: 100.05, east: 101.00 },
  { state: 'Penang', south: 5.10, north: 5.55, west: 100.10, east: 100.55 },
  { state: 'Perak',  south: 3.80, north: 5.65, west: 100.30, east: 102.00 },
];

function getStateForCoord(lat: number, lng: number): NorthernMyState | null {
  // Priority order matters — Perlis before Kedah (overlap in NW corner)
  for (const b of STATE_BOXES) {
    if (lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east) return b.state;
  }
  return null;
}

/** Returns all states that this hex tile touches (center + all 6 vertices), using rectangular boxes. */
function getStatesForTile(h3Index: string, centerLat: number, centerLng: number): NorthernMyState[] {
  const vertices = cellToBoundary(h3Index) as [number, number][];
  const found = new Set<NorthernMyState>();
  for (const [lat, lng] of [[centerLat, centerLng], ...vertices]) {
    const s = getStateForCoord(lat, lng);
    if (s) found.add(s);
  }
  return [...found];
}

// ─── Polygon-based state / offshore detection ───────────────────────────────
// When real OSM state boundaries are available we use them as ground truth.
// Ray-casting point-in-polygon; ring bbox pre-check eliminates ~95% of work.

interface IndexedRing {
  state: NorthernMyState;
  ring: [number, number][];
  bbox: { s: number; n: number; w: number; e: number };
}

function buildRingIndex(boundaries: StateBoundaryGeo[]): IndexedRing[] {
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
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Returns the state polygon that contains the point, or null. */
function pointToState(lat: number, lng: number, rings: IndexedRing[]): NorthernMyState | null {
  for (const r of rings) {
    if (lat < r.bbox.s || lat > r.bbox.n || lng < r.bbox.w || lng > r.bbox.e) continue;
    if (pointInRing(lat, lng, r.ring)) return r.state;
  }
  return null;
}

/**
 * Sample the tile at its center + 6 vertices against state polygons.
 * Returns the set of states touched and how many of the 7 sample points are on land.
 */
function sampleTileAgainstPolygons(
  centerLat: number,
  centerLng: number,
  vertices: [number, number][],
  rings: IndexedRing[],
): { states: NorthernMyState[]; onLand: number } {
  const found = new Set<NorthernMyState>();
  let onLand = 0;
  for (const [lat, lng] of [[centerLat, centerLng] as [number, number], ...vertices]) {
    const s = pointToState(lat, lng, rings);
    if (s) { found.add(s); onLand++; }
  }
  return { states: [...found], onLand };
}

// ── Offshore exclusion boxes ──────────────────────────────────────────────────
// Cover clearly offshore areas; tile centres (and majority of vertices) inside any
// box are discarded.  Inland water bodies sit east of 101.0°E and are untouched.
//
// Perak has 6 graduated bands following the actual Strait of Malacca coastline.
// East edges are set at the actual coastline longitude so tile centres on the sea
// are caught by the box directly:
//   N Perak  (4.85–5.20°N): coast ~100.47°E  (Parit Buntar / Kerian)
//   Beruas   (4.55–4.85°N): coast ~100.52°E
//   Lumut    (4.25–4.55°N): coast ~100.57°E  (Teluk Batik)
//   Sitiawan (4.05–4.25°N): coast ~100.63°E  (box 100.62°E)
//   Bagan D. (3.80–4.05°N): coast ~100.72°E  (box 100.71°E)
//   S Perak  (3.70–3.80°N): coast ~100.78°E  (box 100.77°E)
const OFFSHORE_BOXES: { south: number; north: number; west: number; east: number }[] = [
  // 1. Far-west open sea (west of 100.00°E)
  { south: 3.70, north: 7.10, west: 99.50, east: 100.00 },
  // 2. Sea off Perlis coast
  { south: 6.20, north: 7.10, west: 100.00, east: 100.15 },
  // 3. Sea off north Kedah coast
  { south: 5.80, north: 6.20, west: 100.00, east: 100.12 },
  // 4. Sea off south Kedah / Penang area
  { south: 5.20, north: 5.80, west: 100.00, east: 100.15 },
  // 5. Sea south-west of Penang island / N Perak boundary (~100.35°E mainland)
  { south: 4.85, north: 5.20, west: 100.00, east: 100.30 },
  // 6. N Perak — Parit Buntar / Kerian coast (coast ~100.47°E)
  { south: 4.85, north: 5.20, west: 100.00, east: 100.47 },
  // 7. Beruas / Trong area (coast ~100.52°E)
  { south: 4.55, north: 4.85, west: 100.00, east: 100.52 },
  // 8. Teluk Batik / Lumut area (coast ~100.57°E)
  { south: 4.25, north: 4.55, west: 100.00, east: 100.57 },
  // 9. Sitiawan / Segari headland (coast ~100.63°E)
  { south: 4.05, north: 4.25, west: 100.00, east: 100.62 },
  // 10. Bagan Datoh / lower Perak (coast ~100.72°E)
  { south: 3.80, north: 4.05, west: 100.00, east: 100.71 },
  // 11. Southern Perak delta (coast ~100.78°E)
  { south: 3.70, north: 3.80, west: 100.00, east: 100.77 },
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
  precomputedStates?: NorthernMyState[],
): HexTile {
  const states = precomputedStates ?? getStatesForTile(h3Index, lat, lng);
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
    states,
    scores: { solar, grid, land, availability, climate, road, envSocial, composite },
    attributes: { ghiKwhM2Day: ghi, distToGridKm, nearestGridVoltageKV, landUse, floodRisk, distToRoadKm, isProtected, estimatedCapacityMW },
  };
}

/**
 * Generate hex tiles covering northern Peninsular Malaysia.
 *
 * When `boundaries` is provided (real OSM state polygons), point-in-polygon is the
 * ground-truth for "is this tile on land?" — STATE_BOXES / OFFSHORE_BOXES are bypassed
 * and a tile is kept only if ≥3 of its 7 sample points (center + 6 vertices) lie inside
 * a state polygon. This is the only reliable way to follow the actual coastline.
 *
 * Without `boundaries` (initial render before async fetch completes) we fall back to
 * the rectangular STATE_BOXES + OFFSHORE_BOXES approximation.
 */
export function generateNorthernMyHexTiles(
  lines: TransmissionLine[],
  subs: SubstationFeature[],
  boundaries?: StateBoundaryGeo[] | null,
): HexTile[] {
  const seen = new Set<string>();
  const tiles: HexTile[] = [];
  const rings = boundaries && boundaries.length > 0 ? buildRingIndex(boundaries) : null;

  for (let lat = NORTH_MY_BOUNDS.minLat; lat <= NORTH_MY_BOUNDS.maxLat; lat += 0.04) {
    for (let lng = NORTH_MY_BOUNDS.minLng; lng <= NORTH_MY_BOUNDS.maxLng; lng += 0.05) {
      const h3Index = latLngToCell(lat, lng, H3_RESOLUTION);
      if (seen.has(h3Index)) continue;
      seen.add(h3Index);

      const [cLat, cLng] = cellToLatLng(h3Index);

      if (rings) {
        // ─── Polygon path: actual OSM state borders are source of truth ───
        const verts = cellToBoundary(h3Index) as [number, number][];
        const { states, onLand } = sampleTileAgainstPolygons(cLat, cLng, verts, rings);
        // Keep the tile if ≥3 of 7 sample points are on land. Excludes pure-sea
        // tiles while keeping coastal tiles that span the shoreline.
        if (onLand < 3) continue;
        tiles.push(buildTile(h3Index, cLat, cLng, lines, subs, states));
      } else {
        // ─── Rectangular fallback used until OSM boundaries load ───
        if (!isInNorthernPeninsularMy(cLat, cLng)) continue;
        if (isOffshore(cLat, cLng)) continue;
        const verts = cellToBoundary(h3Index) as [number, number][];
        const offshoreVertCount = verts.filter(([vLat, vLng]) => isOffshore(vLat, vLng)).length;
        if (offshoreVertCount >= 4) continue;
        tiles.push(buildTile(h3Index, cLat, cLng, lines, subs));
      }
    }
  }

  return tiles;
}

export function hexBoundary(h3Index: string): [number, number][] {
  return cellToBoundary(h3Index) as [number, number][];
}
