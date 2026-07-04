// OSM landuse polygon fetch and point-in-polygon lookup for Solar SiteIQ.
// Fetches all landuse/natural area polygons in northern Malaysia via Overpass,
// builds a bbox-filtered ring index, and provides O(1)-amortised lookups per cell.
// Cached in localStorage (7-day TTL) via osmDb.ts — no DuckDB dependency.

import type { LandUseClass, RiskLevel } from '../types';
import { idbGet, idbSet } from './idbCache';
import { overpassPost } from './overpass';

const CACHE_KEY = 'northern-my-landuse-v6'; // v6: river polygons → dedicated 'river' class; FPV lakes only
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
const OVERPASS_QUERY = `[out:json][timeout:120][bbox:3.7,99.5,7.1,102.1];
(
  way["landuse"~"^(paddy|rubber|oil_palm|farmland|orchard|forest|industrial|residential|commercial|reservoir|quarry|cemetery|greenfield)$"];
  way["landuse"="rice_field"];
  way["crop"~"^(rice|paddy)$"];
  way["natural"~"^(wood|scrub|grassland|water|wetland)$"];
  way["wetland"="mangrove"];
  way["waterway"="riverbank"];
  relation["type"="multipolygon"]["landuse"~"^(paddy|rubber|oil_palm|farmland|orchard|forest)$"];
  relation["type"="multipolygon"]["landuse"="rice_field"];
  relation["type"="multipolygon"]["crop"~"^(rice|paddy)$"];
  node["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter)$"];
);
out geom qt;`;

interface OverpassRelationMember {
  type: string;
  role: string;
  geometry?: { lat: number; lon: number }[];
}

function parseElements(elements: (OverpassElement & { members?: OverpassRelationMember[] })[]): LanduseRing[] {
  const rings: LanduseRing[] = [];

  for (const el of elements) {
    if (!el.tags) continue;
    const attrs = tagsToAttrs(el.tags);
    if (!attrs) continue;

    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      // Place node (village/hamlet/town/city) — create a circle ring around the point
      // so pointInRing() correctly catches the 1 km cell centre containing this node.
      pushRing(rings, { landUse: 'urban', floodRisk: 'low', isProtected: false },
        createCircleRing(el.lat, el.lon));
      continue;
    }

    if (el.type === 'way' && el.geometry) {
      // Standard closed way
      const ring = el.geometry.map((n) => [n.lat, n.lon] as [number, number]);
      if (ring.length < 3) continue;
      pushRing(rings, attrs, ring);

    } else if (el.type === 'relation' && el.members) {
      // Multipolygon relation — take each outer member's geometry as a separate ring
      for (const m of el.members) {
        if (m.role !== 'outer' || !m.geometry) continue;
        const ring = m.geometry.map((n) => [n.lat, n.lon] as [number, number]);
        if (ring.length < 3) continue;
        pushRing(rings, attrs, ring);
      }
    }
  }

  return rings;
}

// Radius just large enough to guarantee the 1 km cell centre is inside
// when the place node is anywhere within that cell (max offset = 0.0045°√2 ≈ 0.00636°).
const PLACE_RING_RADIUS = 0.007; // ~780 m — marks only the containing 1 km cell as urban

function createCircleRing(lat: number, lng: number, radius = PLACE_RING_RADIUS): [number, number][] {
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
    const cached = await idbGet<LanduseRing[]>(CACHE_KEY);
    if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
      _rings = cached.data;
      return;
    }

    try {
      const rings = await fetchFromOverpass(signal);
      _rings = rings;
      await idbSet(CACHE_KEY, rings);
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
