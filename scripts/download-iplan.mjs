/**
 * One-time download script for Malaysian iPlan (GTsemasa) land use data.
 *
 * Strategy: point-sample the ArcGIS REST API at each 1 km grid cell centre
 * (returnGeometry=false — only attributes). This produces a compact ~2 MB
 * grid lookup file instead of the 500 MB+ polygon geometry approach.
 *
 * Output: public/data/iplan-grid.json  ({version:2, grid:{key:landUseClass}})
 * Key format: "${cLat.toFixed(4)}_${cLng.toFixed(4)}" (matches grid1km.ts)
 *
 * Usage:
 *   node scripts/download-iplan.mjs
 *
 * Requirements: Node 18+ (native fetch). No npm packages needed.
 * Estimated runtime: 5–10 minutes at concurrency 50.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR  = resolve(__dir, '../public/data');
const OUT_FILE = resolve(OUT_DIR, 'iplan-grid.json');

const IPLAN_BASE = 'https://scharms.planmalaysia.gov.my/arcgis/rest/services/iPLAN';

// Grid constants — must match src/utils/grid1km.ts exactly
const GRID_STEP  = 0.009;
const GRID_BBOX  = { south: 3.700, north: 7.100, west: 99.500, east: 102.100 };
const CONCURRENCY = 15;
const TIMEOUT_MS  = 15_000;

// State services — checked in priority order (smallest/most specific first)
// so Perlis and Penang cells are routed to the correct service before Kedah/Perak.
const STATE_SERVICES = [
  { key: 'perlis', service: 'GTsemasa_09', s: 6.25, n: 6.75, w: 99.88, e: 100.52 },
  { key: 'penang', service: 'GTsemasa_07', s: 5.08, n: 5.68, w: 100.08, e: 100.58 },
  { key: 'kedah',  service: 'GTsemasa_02', s: 5.50, n: 6.80, w: 99.85, e: 101.30 },
  { key: 'perak',  service: 'GTsemasa_08', s: 3.68, n: 5.65, w: 100.18, e: 102.05 },
];

function getServiceUrl(cLat, cLng) {
  for (const st of STATE_SERVICES) {
    if (cLat >= st.s && cLat <= st.n && cLng >= st.w && cLng <= st.e) {
      return `${IPLAN_BASE}/${st.service}/MapServer`;
    }
  }
  return null;
}

// ── iPlan attribute → SiteIQ land use class ───────────────────────────────────

function iplanToLandUse(attrs) {
  const g1  = (attrs.gunatanah1 ?? '').trim();
  const g2  = (attrs.gunatanah2 ?? '').toLowerCase();
  const g3  = (attrs.gunatanah3 ?? '').toLowerCase(); // gunatanah3 holds crop type
  const kod = (attrs.kod_gtn    ?? '').toUpperCase();

  if (g1 === 'Hutan') {
    if (kod.startsWith('HT402')) return 'idle_agri';
    return 'forest';
  }
  if (g1 === 'Pertanian') {
    // kod_gtn is the authoritative field — check it first before free-text matching
    if (kod === 'PT101') return 'oil_palm'; // Kelapa Sawit
    if (kod === 'PT102') return 'rubber';   // Getah
    if (kod === 'PT103') return 'paddy';    // Padi
    // Oil palm text check BEFORE rubber — avoids false rubber from ambiguous records
    if (g3.includes('kelapa sawit') || g3.includes('oil palm') || g2.includes('kelapa sawit')) return 'oil_palm';
    if (g3.includes('getah') || g3.includes('rubber') || g2.includes('getah')) return 'rubber';
    if (g3.includes('padi') || g3.includes('paddy') || g2.includes('padi') || g2.includes('paddy')) return 'paddy';
    if (g3.includes('tidak diusahakan') || g3.includes('terbiar') || g3.includes('kosong')) return 'idle_agri';
    if (g2.includes('penternakan') || g2.includes('ternakan') || g3.includes('penternakan') || g3.includes('ternakan')) return 'mixed_agri';
    return 'mixed_agri';
  }
  if (g1 === 'Tanah Kosong')      return 'idle_agri';
  if (g1 === 'Tanah Pembangunan') return 'urban';
  if (g1 === 'Badan Air') {
    const notFpv = g2.includes('sungai') || g3.includes('sungai')
                || g2.includes('laut')   || g3.includes('laut')
                || g2.includes('selat')  || g3.includes('selat');
    if (notFpv) return null;
    return 'water';
  }
  if (g1 === 'Industri')       return 'industrial';
  if (g1 === 'Komersial')      return 'commercial';
  if (g1 === 'Perumahan')      return 'urban';
  if (g1 === 'Pengangkutan')                     return 'urban'; // bus stations, airports
  if (g1 === 'Infrastruktur dan Utiliti')        return 'urban'; // actual combined g1 value
  if (g1 === 'Institusi dan Kemudahan Masyarakat') return 'urban'; // actual combined g1 value
  if (g1 === 'Pembangunan Bercampur')            return 'urban'; // mixed-use development
  if (g1 === 'Tanah Lapang dan Rekreasi')        return 'urban'; // parks, sports fields, stadiums
  // Legacy / variant spellings (some services use shorter forms)
  if (g1 === 'Institusi')      return 'urban';
  if (g1 === 'Kemudahan Awam') return 'urban';
  if (g1 === 'Infrastruktur')  return 'urban';
  if (g1 === 'Utiliti')        return 'urban';
  return null;
}

// ── Multi-point resolution ────────────────────────────────────────────────────
// Urban/institutional presence in any sub-point overrides agricultural labels —
// catches kampungs whose 1 km cell centre lands in surrounding plantation.
// For agricultural classes, highest-priority result wins.

const LU_PRIORITY = {
  industrial: 9, commercial: 8, urban: 7,
  paddy: 6, oil_palm: 5, rubber: 4, mixed_agri: 3, idle_agri: 2, water: 1, forest: 0,
};

function resolveResults(results) {
  const valid = results.filter(Boolean);
  if (valid.length === 0) return null;
  for (const cls of ['industrial', 'commercial', 'urban']) {
    if (valid.includes(cls)) return cls;
  }
  return valid.reduce((best, lu) =>
    (LU_PRIORITY[lu] ?? -1) > (LU_PRIORITY[best] ?? -1) ? lu : best
  );
}

// ── Point query ───────────────────────────────────────────────────────────────

async function queryPoint(serviceUrl, cLat, cLng) {
  // ArcGIS REST: geometry=x,y where x=lng, y=lat
  const params = new URLSearchParams({
    f:               'json',
    geometry:        `${cLng},${cLat}`,
    geometryType:    'esriGeometryPoint',
    inSR:            '4326',
    spatialRel:      'esriSpatialRelIntersects',
    outFields:       'gunatanah1,gunatanah2,gunatanah3,kod_gtn',
    returnGeometry:  'false',
    outSR:           '4326',
  });
  const url = `${serviceUrl}/0/query?${params}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const feat = data.features?.[0];
  if (!feat) return null;
  return iplanToLandUse(feat.attributes ?? {});
}

// ── 5-point cell query ────────────────────────────────────────────────────────
// Samples centre + 4 corners at ±0.003° (~333m) to catch small villages/estates
// whose parcel polygon doesn't cover the cell centre.

async function queryCell(svcUrl, cLat, cLng) {
  const OFF = 0.003;
  const points = [
    [cLat,       cLng      ], // centre (primary)
    [cLat + OFF, cLng + OFF], // NE corner
    [cLat - OFF, cLng - OFF], // SW corner — 3 points covers most village scenarios
  ];
  const results = await Promise.all(
    points.map(([la, lo]) => queryPoint(svcUrl, la, lo).catch(() => null))
  );
  return resolveResults(results);
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function runPool(tasks, limit) {
  const results = new Array(tasks.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]().catch(() => null); // null on error = skip cell
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Generate all cell centres in the same order as grid1km.ts
  const cells = [];
  for (let la = GRID_BBOX.south; la < GRID_BBOX.north; la = +(la + GRID_STEP).toFixed(3)) {
    for (let lo = GRID_BBOX.west; lo < GRID_BBOX.east; lo = +(lo + GRID_STEP).toFixed(3)) {
      const cLat = +(la + GRID_STEP / 2).toFixed(4);
      const cLng = +(lo + GRID_STEP / 2).toFixed(4);
      const svcUrl = getServiceUrl(cLat, cLng);
      if (!svcUrl) continue; // outside all 4 state bboxes
      cells.push({ cLat, cLng, svcUrl });
    }
  }

  console.log(`iPlan point-sampling: ${cells.length} cells × 3 points = ${cells.length * 3} queries across 4 states\n`);
  console.log(`Concurrency: ${CONCURRENCY}  ·  Timeout: ${TIMEOUT_MS / 1000}s per point\n`);

  const grid = {};
  let done = 0, hits = 0;
  const startMs = Date.now();

  const tasks = cells.map((cell) => async () => {
    const lu = await queryCell(cell.svcUrl, cell.cLat, cell.cLng);
    done++;
    if (lu) {
      grid[`${cell.cLat.toFixed(4)}_${cell.cLng.toFixed(4)}`] = lu;
      hits++;
    }
    if (done % 500 === 0 || done === cells.length) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
      const pct = ((done / cells.length) * 100).toFixed(1);
      const eta = done > 0
        ? (((Date.now() - startMs) / done) * (cells.length - done) / 1000).toFixed(0)
        : '?';
      process.stdout.write(`\r  ${pct}%  ${done}/${cells.length} cells  ${hits} hits  ${elapsed}s elapsed  ~${eta}s remaining   `);
    }
  });

  await runPool(tasks, CONCURRENCY);
  console.log('\n');

  if (Object.keys(grid).length === 0) {
    console.error('No data retrieved — check network access to scharms.planmalaysia.gov.my');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = JSON.stringify({ version: 2, grid });
  writeFileSync(OUT_FILE, payload, 'utf8');

  const sizeMb = (payload.length / 1_048_576).toFixed(2);
  const elapsed = ((Date.now() - startMs) / 1000 / 60).toFixed(1);
  console.log(`✓  ${hits} cells with iPlan data (${sizeMb} MB)  in ${elapsed} min`);
  console.log(`   Written to ${OUT_FILE}`);
  console.log('   Gzip will compress this to ~30% — commit public/data/iplan-grid.json to deploy.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
