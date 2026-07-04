/**
 * Pre-rasterise OSM river POLYGON geometry to a 1 km cell grid, computing the
 * fraction of each cell's area covered by a river/riverbank polygon.
 *
 * Uses polygon area coverage (not centreline distance) so we can distinguish:
 *  - a cell fully covered by a wide river (e.g. Sungai Perak) → coverage ≈ 1.0
 *  - a cell only clipped by a riverbank at its edge      → coverage ≈ 0.1–0.3
 *
 * Output: public/data/river-grid.json  { version: 2, cells: { key: fraction } }
 * Key format "${cLat.toFixed(4)}_${cLng.toFixed(4)}" — matches iplan-grid.json.
 *
 * Usage:  node scripts/download-river-grid.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR  = resolve(__dir, '../public/data');
const OUT_FILE = resolve(OUT_DIR, 'river-grid.json');

const GRID_STEP = 0.009;
const GRID_BBOX = { south: 3.700, north: 7.100, west: 99.500, east: 102.100 };
const SUB = 5; // 5×5 = 25 sample points per cell for coverage estimation

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Polygon-mapped river surfaces — OSM contributors only draw a river as an area
// when it's wide/significant, so this tag set is already a reasonable proxy for
// "large river body" as opposed to every minor stream (which stays a line).
// Per-clause bbox filter (not global [bbox:]) and explicit equality (not regex) —
// both avoid 406 responses seen previously from overpass-api.de.
const BBOX_STR = `${GRID_BBOX.south},${GRID_BBOX.west},${GRID_BBOX.north},${GRID_BBOX.east}`;
const QUERY = `
[out:json][timeout:180];
(
  way["natural"="water"]["water"="river"](${BBOX_STR});
  way["natural"="water"]["water"="riverbank"](${BBOX_STR});
  way["waterway"="riverbank"](${BBOX_STR});
  relation["natural"="water"]["water"="river"]["type"="multipolygon"](${BBOX_STR});
  relation["natural"="water"]["water"="riverbank"]["type"="multipolygon"](${BBOX_STR});
);
out geom;
`.trim();

async function fetchOverpass() {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`  Trying ${endpoint} ...`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(QUERY),
        signal: AbortSignal.timeout(200_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.elements?.length) throw new Error('Empty response');
      return data.elements;
    } catch (err) {
      console.warn(`  Failed: ${err.message}`);
    }
  }
  throw new Error('All Overpass endpoints failed');
}

// ── Ring extraction ────────────────────────────────────────────────────────────

function ringFromGeometry(geom) {
  if (!geom || geom.length < 3) return null;
  return geom.map((n) => [n.lat, n.lon]); // [lat, lng] pairs
}

// Multipolygon "outer" boundaries are frequently split across several way members
// that share endpoints (common for long features like rivers/coastlines) — each
// individual member is an OPEN arc, not a standalone ring. Naively closing each
// member on its own (wrapping last point back to first) draws a false chord that
// can cut across huge swathes of unrelated land. Stitch matching endpoints
// together into full closed rings before running point-in-polygon tests.
function keyOf(pt) {
  return `${pt[0].toFixed(6)}_${pt[1].toFixed(6)}`;
}

function assembleRingsFromArcs(arcs) {
  const rings = [];
  const remaining = arcs.map((a) => a.slice());

  while (remaining.length > 0) {
    let current = remaining.shift();
    let closed = keyOf(current[0]) === keyOf(current[current.length - 1]);

    let progress = true;
    while (!closed && progress) {
      progress = false;
      const tailKey = keyOf(current[current.length - 1]);
      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        if (keyOf(cand[0]) === tailKey) {
          current = current.concat(cand.slice(1));
          remaining.splice(i, 1);
          progress = true;
          break;
        }
        if (keyOf(cand[cand.length - 1]) === tailKey) {
          current = current.concat(cand.slice(0, -1).reverse());
          remaining.splice(i, 1);
          progress = true;
          break;
        }
      }
      closed = keyOf(current[0]) === keyOf(current[current.length - 1]);
    }

    // Discard dangling (unclosed) chains — an incomplete ring is safer to skip
    // than to draw a bogus closing line across unrelated land.
    if (closed && current.length >= 4) rings.push(current);
  }

  return rings;
}

function extractRings(elements) {
  const rings = [];
  for (const el of elements) {
    if (el.type === 'way' && el.geometry) {
      const ring = ringFromGeometry(el.geometry);
      if (ring) rings.push(ring);
    } else if (el.type === 'relation' && el.members) {
      const outerArcs = el.members
        .filter((m) => m.role === 'outer' && m.geometry && m.geometry.length >= 2)
        .map((m) => m.geometry.map((n) => [n.lat, n.lon]))
        .filter((arc) => arc.length >= 2);
      if (outerArcs.length === 0) continue;
      rings.push(...assembleRingsFromArcs(outerArcs));
    }
  }
  return rings;
}

// ── Point-in-ring (ray cast) ────────────────────────────────────────────────────

function pointInRing(lat, lng, ring) {
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

function ringBbox(ring) {
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  for (const [lat, lng] of ring) {
    if (lat < s) s = lat; if (lat > n) n = lat;
    if (lng < w) w = lng; if (lng > e) e = lng;
  }
  return { s, n, w, e };
}

// ── Rasterise coverage fraction per cell ───────────────────────────────────────

function cellIndexRange(bbox) {
  const i0 = Math.max(0, Math.floor((bbox.s - GRID_BBOX.south) / GRID_STEP) - 1);
  const i1 = Math.min(
    Math.round((GRID_BBOX.north - GRID_BBOX.south) / GRID_STEP) - 1,
    Math.ceil((bbox.n - GRID_BBOX.south) / GRID_STEP) + 1,
  );
  const j0 = Math.max(0, Math.floor((bbox.w - GRID_BBOX.west) / GRID_STEP) - 1);
  const j1 = Math.min(
    Math.round((GRID_BBOX.east - GRID_BBOX.west) / GRID_STEP) - 1,
    Math.ceil((bbox.e - GRID_BBOX.west) / GRID_STEP) + 1,
  );
  return { i0, i1, j0, j1 };
}

function main2(rings) {
  const cellFraction = new Map(); // key -> fraction (0-1), keeps max across overlapping rings

  for (const ring of rings) {
    const bbox = ringBbox(ring);
    const { i0, i1, j0, j1 } = cellIndexRange(bbox);
    if (i1 < i0 || j1 < j0) continue;

    for (let i = i0; i <= i1; i++) {
      const swLat = GRID_BBOX.south + i * GRID_STEP;
      for (let j = j0; j <= j1; j++) {
        const swLng = GRID_BBOX.west + j * GRID_STEP;
        // Quick reject: cell bbox vs ring bbox
        if (swLat + GRID_STEP < bbox.s || swLat > bbox.n) continue;
        if (swLng + GRID_STEP < bbox.w || swLng > bbox.e) continue;

        let inside = 0;
        for (let a = 0; a < SUB; a++) {
          const lat = swLat + (GRID_STEP * (a + 0.5)) / SUB;
          for (let b = 0; b < SUB; b++) {
            const lng = swLng + (GRID_STEP * (b + 0.5)) / SUB;
            if (pointInRing(lat, lng, ring)) inside++;
          }
        }
        if (inside === 0) continue;

        // Keep as fixed-4-decimal strings (not round-tripped through Number) so the
        // key always matches the client lookup's lat.toFixed(4)/lng.toFixed(4) format.
        const key = `${(swLat + GRID_STEP / 2).toFixed(4)}_${(swLng + GRID_STEP / 2).toFixed(4)}`;
        const fraction = inside / (SUB * SUB);
        const prev = cellFraction.get(key) ?? 0;
        if (fraction > prev) cellFraction.set(key, fraction);
      }
    }
  }

  return cellFraction;
}

async function main() {
  console.log('Fetching river polygon geometry from Overpass...\n');
  const elements = await fetchOverpass();

  const rings = extractRings(elements);
  console.log(`\n  ${rings.length} river polygon rings extracted`);

  const cellFraction = main2(rings);
  console.log(`  ${cellFraction.size} cells with river coverage\n`);

  const cells = {};
  for (const [key, frac] of cellFraction) cells[key] = +frac.toFixed(2);

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = JSON.stringify({ version: 2, cells });
  writeFileSync(OUT_FILE, payload, 'utf8');

  const sizeMb = (payload.length / 1_048_576).toFixed(2);
  const dominant = Object.values(cells).filter((f) => f >= 0.5).length;
  console.log(`✓  Written to ${OUT_FILE}  (${sizeMb} MB)`);
  console.log(`   ${dominant} cells are dominant-river (coverage ≥ 0.5)`);
  console.log('   Commit public/data/river-grid.json to deploy.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
