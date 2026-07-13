// OSM landuse polygon fetch and point-in-polygon lookup for Solar SiteIQ.
// Fetches all landuse/natural area polygons in northern Malaysia via Overpass,
// builds a bbox-filtered ring index, and provides O(1)-amortised lookups per cell.
// Cached in localStorage (7-day TTL) via osmDb.ts — no DuckDB dependency.

import type { LandUseClass, RiskLevel } from '../types';
import { idbGet, idbSet } from './idbCache';
import { overpassPost, stitchRings } from './overpass';

export const OSM_LANDUSE_CACHE_KEY = 'northern-my-landuse-v10'; // v10: village/hamlet place nodes now map to 'kampung', not 'urban'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface LanduseRing {
  landUse: LandUseClass;
  floodRisk: RiskLevel;
  isProtected: boolean;
  ring: [number, number][];
  bbox: { s: number; n: number; w: number; e: number };
}

let _rings: LanduseRing[] | null = null;

// ── OSM tag → SiteIQ classification ──────────────────────────────────────────

interface OsmTags { [key: string]: string }

interface LanduseAttrs {
  landUse: LandUseClass;
  floodRisk: RiskLevel;
  isProtected: boolean;
}

function tagsToAttrs(tags: OsmTags): LanduseAttrs | null {
  const lu      = tags['landuse'];
  const nat     = tags['natural'];
  const wetland = tags['wetland'];
  const crop    = tags['crop'];

  if (wetland === 'mangrove')                        return { landUse: 'forest',     floodRisk: 'medium', isProtected: true  };
  if (lu === 'paddy' || lu === 'rice_field')         return { landUse: 'paddy',      floodRisk: 'medium', isProtected: false };
  if (crop === 'rice' || crop === 'paddy')           return { landUse: 'paddy',      floodRisk: 'medium', isProtected: false };
  if (lu === 'rubber')                               return { landUse: 'rubber',     floodRisk: 'low',    isProtected: false };
  if (lu === 'oil_palm')                             return { landUse: 'oil_palm',   floodRisk: 'low',    isProtected: false };
  if (lu === 'orchard')                              return { landUse: 'mixed_agri', floodRisk: 'low',    isProtected: false };
  if (lu === 'farmland') {
    // Detect rice-tagged farmland (common in areas where landuse=paddy isn't used)
    if (crop === 'rice' || crop === 'paddy')         return { landUse: 'paddy',      floodRisk: 'medium', isProtected: false };
                                                     return { landUse: 'mixed_agri', floodRisk: 'low',    isProtected: false };
  }
  if (lu === 'forest')                               return { landUse: 'forest',     floodRisk: 'low',    isProtected: false };
  if (nat === 'wood')                                return { landUse: 'forest',     floodRisk: 'low',    isProtected: false };
  if (lu === 'industrial')                           return { landUse: 'industrial', floodRisk: 'low',    isProtected: false };
  if (lu === 'residential')                          return { landUse: 'urban',      floodRisk: 'low',    isProtected: false };
  if (lu === 'commercial')                           return { landUse: 'commercial', floodRisk: 'low',    isProtected: false };
  if (lu === 'quarry')                               return { landUse: 'urban',      floodRisk: 'low',    isProtected: false };
  if (lu === 'reservoir')                            return { landUse: 'water',      floodRisk: 'low',    isProtected: false };
  if (nat === 'water') {
    // Distinguish rivers/canals (no FPV) from still water bodies (FPV at 30%)
    const waterType = tags['water'] ?? '';
    const isRiver = waterType === 'river' || waterType === 'stream'
                 || waterType === 'canal' || waterType === 'drain';
    if (isRiver) return { landUse: 'river', floodRisk: 'medium', isProtected: true };
    return { landUse: 'water', floodRisk: 'low', isProtected: false };
  }
  const waterway = tags['waterway'];
  if (waterway === 'riverbank')                      return { landUse: 'river',      floodRisk: 'medium', isProtected: true  };
  if (nat === 'wetland')                             return { landUse: 'idle_agri',  floodRisk: 'high',   isProtected: false };
  if (nat === 'scrub')                               return { landUse: 'idle_agri',  floodRisk: 'low',    isProtected: false };
  if (nat === 'grassland')                           return { landUse: 'idle_agri',  floodRisk: 'low',    isProtected: false };
  if (lu === 'cemetery')                             return { landUse: 'urban',      floodRisk: 'low',    isProtected: false };
  if (lu === 'greenfield')                           return { landUse: 'idle_agri',  floodRisk: 'low',    isProtected: false };
  return null;
}

// ── Point-in-ring ray-cast (same algorithm as grid1km.ts / overpass.ts) ──────

function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (((yi > lat) !== (yj > lat)) &&
        (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Overpass element types ────────────────────────────────────────────────────

interface OverpassElement {
  type: string;
  id?: number;
  lat?: number; // present on nodes
  lon?: number; // present on nodes
  tags?: OsmTags;
  geometry?: { lat: number; lon: number }[];
}

// ── Fetch from Overpass ───────────────────────────────────────────────────────

// Includes:
//  - ways AND multipolygon relations (large agricultural blocks are often relations in Malaysia)
//  - landuse=rice_field and crop=rice/paddy variants used by Malaysian OSM contributors
//  - place=village/hamlet/town/city nodes — primary way kampungs are mapped in OSM Malaysia
//  - timeout bumped to 120s to handle larger relation result sets
//  - explicit equality filters + per-clause bbox (not global [bbox:] + regex ~"...") —
//    overpass-api.de returns HTTP 406 for regex tag filters in this environment; this
//    is the same fix already applied in scripts/build-road-grid.mjs and
//    scripts/download-river-grid.mjs. Without it every query silently fails over to
//    slower/rate-limited mirrors, and OSM landuse data goes empty for the whole app
//    when all three configured endpoints happen to be unavailable at once.
const OSM_BBOX_STR = '3.7,99.5,7.1,102.1';
const OVERPASS_QUERY = `
[out:json][timeout:120];
(
  way["landuse"="paddy"](${OSM_BBOX_STR});
  way["landuse"="rubber"](${OSM_BBOX_STR});
  way["landuse"="oil_palm"](${OSM_BBOX_STR});
  way["landuse"="farmland"](${OSM_BBOX_STR});
  way["landuse"="orchard"](${OSM_BBOX_STR});
  way["landuse"="forest"](${OSM_BBOX_STR});
  way["landuse"="industrial"](${OSM_BBOX_STR});
  way["landuse"="residential"](${OSM_BBOX_STR});
  way["landuse"="commercial"](${OSM_BBOX_STR});
  way["landuse"="reservoir"](${OSM_BBOX_STR});
  way["landuse"="quarry"](${OSM_BBOX_STR});
  way["landuse"="cemetery"](${OSM_BBOX_STR});
  way["landuse"="greenfield"](${OSM_BBOX_STR});
  way["landuse"="rice_field"](${OSM_BBOX_STR});
  way["crop"="rice"](${OSM_BBOX_STR});
  way["crop"="paddy"](${OSM_BBOX_STR});
  way["natural"="wood"](${OSM_BBOX_STR});
  way["natural"="scrub"](${OSM_BBOX_STR});
  way["natural"="grassland"](${OSM_BBOX_STR});
  way["natural"="water"](${OSM_BBOX_STR});
  way["natural"="wetland"](${OSM_BBOX_STR});
  way["wetland"="mangrove"](${OSM_BBOX_STR});
  way["waterway"="riverbank"](${OSM_BBOX_STR});
  relation["type"="multipolygon"]["landuse"="paddy"](${OSM_BBOX_STR});
  relation["type"="multipolygon"]["landuse"="rubber"](${OSM_BBOX_STR});
  relation["type"="multipolygon"]["landuse"="oil_palm"](${OSM_BBOX_STR});
  relation["type"="multipolygon"]["landuse"="farmland"](${OSM_BBOX_STR});
  relation["type"="multipolygon"]["landuse"="orchard"](${OSM_BBOX_STR});
  relation["type"="multipolygon"]["landuse"="forest"](${OSM_BBOX_STR});
  relation["type"="multipolygon"]["landuse"="rice_field"](${OSM_BBOX_STR});
  relation["type"="multipolygon"]["crop"="rice"](${OSM_BBOX_STR});
  relation["type"="multipolygon"]["crop"="paddy"](${OSM_BBOX_STR});
  relation["type"="multipolygon"]["natural"="water"](${OSM_BBOX_STR});
  node["place"="city"](${OSM_BBOX_STR});
  node["place"="town"](${OSM_BBOX_STR});
  node["place"="village"](${OSM_BBOX_STR});
  node["place"="hamlet"](${OSM_BBOX_STR});
  node["place"="suburb"](${OSM_BBOX_STR});
  node["place"="neighbourhood"](${OSM_BBOX_STR});
  node["place"="quarter"](${OSM_BBOX_STR});
);
out geom;
`.trim();

interface OverpassRelationMember {
  type: string;
  role: string;
  geometry?: { lat: number; lon: number }[];
}

function parseElements(elements: (OverpassElement & { members?: OverpassRelationMember[] })[]): LanduseRing[] {
  const rings: LanduseRing[] = [];

  for (const el of elements) {
    if (!el.tags) continue;

    // Place node (village/hamlet/town/city/...) — handled BEFORE the
    // tagsToAttrs()/landuse-tag check below, since a place node only carries
    // place=/name= tags with no landuse/natural/crop tag at all. tagsToAttrs()
    // would return null for it and the old code's `if (!attrs) continue` was
    // silently discarding every place node before ever reaching the node
    // handling — meaning towns were never actually being flagged as urban via
    // this path. Real settlements vary hugely in extent, so size the circle
    // by place type rather than using one fixed small radius for everything —
    // a city/town needs to cover several km of built-up area (OSM's explicit
    // landuse=residential/commercial polygon coverage is frequently incomplete
    // even for large towns), while a hamlet is genuinely tiny.
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number' && el.tags['place']) {
      const place = el.tags['place'];
      const radius = PLACE_RING_RADIUS[place] ?? PLACE_RING_RADIUS.village;
      // village/hamlet = rural settlement ('kampung'), distinct from proper
      // town/city/suburb development ('urban') — much lower density, more open
      // surrounding land, very different solar-development implications.
      const isRural = place === 'village' || place === 'hamlet';
      pushRing(rings, { landUse: isRural ? 'kampung' : 'urban', floodRisk: 'low', isProtected: false },
        createCircleRing(el.lat, el.lon, radius));
      continue;
    }

    const attrs = tagsToAttrs(el.tags);
    if (!attrs) continue;

    if (el.type === 'way' && el.geometry) {
      // Standard closed way
      const ring = el.geometry.map((n) => [n.lat, n.lon] as [number, number]);
      if (ring.length < 3) continue;
      pushRing(rings, attrs, ring);

    } else if (el.type === 'relation' && el.members) {
      // Multipolygon "outer" boundaries are frequently split across several way
      // members that share endpoints (common for large/irregular features like
      // reservoirs and forest blocks) — each individual member is an OPEN arc,
      // not a standalone ring. Naively closing each member on its own draws a
      // false chord that can cut across huge swathes of unrelated land (this
      // caused Tasik Timah Tasoh's reservoir relation to falsely bleed into
      // surrounding farmland). Stitch matching endpoints into full closed rings
      // using the same algorithm as fetchNorthernMyBoundariesFromOSM.
      const outerArcs = el.members
        .filter((m) => m.role === 'outer' && m.geometry && m.geometry.length >= 2)
        .map((m) => m.geometry!.map((n) => [n.lat, n.lon] as [number, number]));
      if (outerArcs.length === 0) continue;
      for (const ring of stitchRings(outerArcs)) {
        pushRing(rings, attrs, ring);
      }
    }
  }

  return rings;
}

// Circle radius by OSM place= type — real settlements vary hugely in extent.
// A single node marks the settlement's notional "centre"; a city/town's actual
// built-up area can span several km, well beyond OSM's often-incomplete
// landuse=residential/commercial polygon coverage, so the fallback circle needs
// to be large enough to catch most of it. Small radius (~780 m, one grid cell)
// is kept for genuinely small settlements to avoid bleeding into surrounding farmland.
const PLACE_RING_RADIUS: Record<string, number> = {
  city:          0.030, // ~3.3 km — major cities (Alor Setar, Ipoh, Sungai Petani)
  town:          0.022, // ~2.4 km — significant towns
  suburb:        0.014, // ~1.6 km — sub-areas within larger urban agglomerations
  neighbourhood: 0.010, // ~1.1 km
  quarter:       0.010,
  village:       0.007, // ~780 m — marks roughly one grid cell as urban
  hamlet:        0.007,
};

function createCircleRing(lat: number, lng: number, radius: number): [number, number][] {
  const pts: [number, number][] = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    pts.push([lat + radius * Math.sin(a), lng + radius * Math.cos(a)]);
  }
  return pts;
}

function pushRing(
  rings: LanduseRing[],
  attrs: LanduseAttrs,
  ring: [number, number][],
): void {
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  for (const [lat, lon] of ring) {
    if (lat < s) s = lat; if (lat > n) n = lat;
    if (lon < w) w = lon; if (lon > e) e = lon;
  }
  rings.push({ ...attrs, ring, bbox: { s, n, w, e } });
}

async function fetchFromOverpass(signal?: AbortSignal): Promise<LanduseRing[]> {
  const resp = await overpassPost('data=' + encodeURIComponent(OVERPASS_QUERY), signal);
  const json = await resp.json() as { elements: (OverpassElement & { members?: OverpassRelationMember[] })[] };
  return parseElements(json.elements ?? []);
}

// ── Public API ────────────────────────────────────────────────────────────────

let _loadPromise: Promise<void> | null = null;

/** Fetch and index OSM landuse polygons (idempotent; uses localStorage cache). */
export function ensureOsmLanduseLoaded(signal?: AbortSignal): Promise<void> {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    // Check IndexedDB cache first — IDB has no size limit so large ring datasets persist reliably
    const cached = await idbGet<LanduseRing[]>(OSM_LANDUSE_CACHE_KEY);
    if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
      _rings = cached.data;
      return;
    }

    try {
      const rings = await fetchFromOverpass(signal);
      _rings = rings;
      await idbSet(OSM_LANDUSE_CACHE_KEY, rings);
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      console.warn('OSM landuse fetch failed, continuing without polygon data:', err);
      _rings = [];
    }
  })().catch((err) => {
    _loadPromise = null; // allow retry on next call
    if ((err as Error).name !== 'AbortError') throw err;
  });
  return _loadPromise;
}

/**
 * Return the SiteIQ land use classification for a point.
 * Returns null if rings haven't loaded or no polygon covers the point.
 */
export function getOsmLanduseAt(
  lat: number,
  lng: number,
): { landUse: LandUseClass; floodRisk: RiskLevel; isProtected: boolean } | null {
  if (!_rings || _rings.length === 0) return null;
  for (const r of _rings) {
    if (lat < r.bbox.s || lat > r.bbox.n || lng < r.bbox.w || lng > r.bbox.e) continue;
    if (pointInRing(lat, lng, r.ring)) {
      return { landUse: r.landUse, floodRisk: r.floodRisk, isProtected: r.isProtected };
    }
  }
  return null;
}
