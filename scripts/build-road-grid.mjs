/**
 * One-time build script: pre-computes road distance for every 1 km cell in northern Malaysia.
 *
 * Downloads trunk/primary/secondary/tertiary road network from Overpass, then for each
 * cell centre computes distance to the nearest road segment and stores the result in a
 * compact static grid file (same key format as iplan-grid.json).
 *
 * Usage:
 *   node scripts/build-road-grid.mjs
 *
 * Output: public/data/road-dist-grid.json
 *   { version: 1, grid: { "5.7045_100.4135": 1.2, ... } }   distances in km
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR  = resolve(__dir, '../public/data');
const OUT_FILE = resolve(OUT_DIR, 'road-dist-grid.json');

// Must match GRID_BBOX and GRID_STEP in src/utils/grid1km.ts
const BBOX      = { south: 3.700, north: 7.100, west: 99.500, east: 102.100 };
const GRID_STEP = 0.009;   // ~1 km per cell
const MAX_DIST  = 80;      // km — cells farther than this from any road get omitted (ocean)

// Road network query: trunk, primary, secondary, tertiary (relevant for heavy vehicle access)
// Using explicit equality filters instead of regex to avoid Overpass 406 errors.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const BBOX_STR = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const OVERPASS_QUERY = `
[out:json][timeout:180];
(
  way["highway"="trunk"](${BBOX_STR});
  way["highway"="trunk_link"](${BBOX_STR});
  way["highway"="primary"](${BBOX_STR});
  way["highway"="primary_link"](${BBOX_STR});
  way["highway"="secondary"](${BBOX_STR});
  way["highway"="secondary_link"](${BBOX_STR});
  way["highway"="tertiary"](${BBOX_STR});
);
out geom;
`.trim();

// ── Geometry ──────────────────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Distance from point P to segment A-B in km (flat-earth approximation — <0.1% error at 5°N).
 */
function pointToSegKm(pLat, pLng, aLat, aLng, bLat, bLng) {
  const dx = bLng - aLng, dy = bLat - aLat;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-14) return haversineKm(pLat, pLng, aLat, aLng);
  let t = ((pLng - aLng) * dx + (pLat - aLat) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return haversineKm(pLat, pLng, aLat + t * dy, aLng + t * dx);
}

// ── Spatial bucket index ──────────────────────────────────────────────────────
// Group segments by their midpoint rounded to BUCKET_SIZE degrees.
// For each query point we search the 3×3 neighbourhood of buckets (~60 km radius at 0.1°).

const BUCKET = 0.1;

function bucketKey(lat, lng) {
  return `${Math.floor(lat / BUCKET)}_${Math.floor(lng / BUCKET)}`;
}

function buildIndex(segments) {
  const idx = new Map(); // key -> [{aLat, aLng, bLat, bLng}]
  for (const [aLat, aLng, bLat, bLng] of segments) {
    const mLat = (aLat + bLat) / 2, mLng = (aLng + bLng) / 2;
    const k = bucketKey(mLat, mLng);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push([aLat, aLng, bLat, bLng]);
  }
  return idx;
}

function nearestRoadKm(lat, lng, idx) {
  const bLat0 = Math.floor(lat / BUCKET), bLng0 = Math.floor(lng / BUCKET);
  let minDist = Infinity;
  for (let dlat = -1; dlat <= 1; dlat++) {
    for (let dlng = -1; dlng <= 1; dlng++) {
      const segs = idx.get(`${bLat0 + dlat}_${bLng0 + dlng}`);
      if (!segs) continue;
      for (const [aLat, aLng, bLat, bLng] of segs) {
        const d = pointToSegKm(lat, lng, aLat, aLng, bLat, bLng);
        if (d < minDist) minDist = d;
      }
    }
  }
  return minDist;
}

// ── Overpass fetch ────────────────────────────────────────────────────────────

async function fetchRoads() {
  const body = `data=${encodeURIComponent(OVERPASS_QUERY)}`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    console.log(`Querying ${endpoint} …`);
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal:  AbortSignal.timeout(200_000),
      });
      if (!res.ok) {
        console.warn(`  HTTP ${res.status} from ${endpoint}, trying next…`);
        continue;
      }
      const data = await res.json();
      console.log(`  ${data.elements.length} way elements received`);
      return data.elements;
    } catch (err) {
      console.warn(`  ${err.message} from ${endpoint}, trying next…`);
    }
  }
  throw new Error('All Overpass endpoints failed');
}

function extractSegments(elements) {
  const segs = [];
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    for (let i = 0; i < el.geometry.length - 1; i++) {
      const a = el.geometry[i], b = el.geometry[i + 1];
      if (a && b && a.lat != null && b.lat != null) {
        segs.push([a.lat, a.lon, b.lat, b.lon]);
      }
    }
  }
  return segs;
}

// ── Grid iteration ────────────────────────────────────────────────────────────

function* iterCells() {
  for (
    let swLat = BBOX.south;
    swLat < BBOX.north;
    swLat = +(swLat + GRID_STEP).toFixed(3)
  ) {
    for (
      let swLng = BBOX.west;
      swLng < BBOX.east;
      swLng = +(swLng + GRID_STEP).toFixed(3)
    ) {
      const cLat = +(swLat + GRID_STEP / 2).toFixed(4);
      const cLng = +(swLng + GRID_STEP / 2).toFixed(4);
      yield [cLat, cLng];
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startMs = Date.now();

  // 1. Download road network
  const elements = await fetchRoads();
  const segments = extractSegments(elements);
  console.log(`  ${segments.length} road segments extracted`);

  // 2. Build spatial index
  const idx = buildIndex(segments);
  console.log(`  Spatial index built (${idx.size} buckets)`);

  // 3. Compute per-cell distances
  const grid = {};
  let total = 0, stored = 0, done = 0;
  for (const _ of iterCells()) total++;

  console.log(`\nComputing road distances for ${total.toLocaleString()} cells…`);
  const logEvery = 10_000;

  for (const [cLat, cLng] of iterCells()) {
    const distKm = nearestRoadKm(cLat, cLng, idx);
    if (distKm < MAX_DIST) {
      grid[`${cLat}_${cLng}`] = +distKm.toFixed(2);
      stored++;
    }
    done++;
    if (done % logEvery === 0) {
      const pct = ((done / total) * 100).toFixed(1);
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
      process.stdout.write(`\r  ${pct}%  ${done.toLocaleString()}/${total.toLocaleString()}  stored ${stored.toLocaleString()}  ${elapsed}s   `);
    }
  }
  console.log('\n');

  // 4. Write output
  mkdirSync(OUT_DIR, { recursive: true });
  const payload = JSON.stringify({ version: 1, bbox: BBOX, step: GRID_STEP, grid });
  writeFileSync(OUT_FILE, payload, 'utf8');

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  const sizekb  = (payload.length / 1024).toFixed(0);
  const distVals = Object.values(grid);
  const minD = Math.min(...distVals), maxD = Math.max(...distVals);
  console.log(`✓  ${stored.toLocaleString()} cells (${sizekb} KB) in ${elapsed}s → ${OUT_FILE}`);
  console.log(`   dist range: ${minD.toFixed(2)}–${maxD.toFixed(2)} km`);
  console.log('   Commit public/data/road-dist-grid.json to deploy.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
