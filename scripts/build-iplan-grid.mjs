/**
 * Builds public/data/iplan-grid.json from the locally-cached raw iPlan
 * attributes (scripts/cache/iplan-raw.json, produced by fetch-iplan-raw.mjs).
 *
 * This is pure local computation — no network calls. Iterate on the
 * classification rules below and re-run freely; it completes in well under
 * a second regardless of how many times you tune the mapping.
 *
 * Usage:
 *   node scripts/build-iplan-grid.mjs
 *
 * If scripts/cache/iplan-raw.json doesn't exist yet, run
 *   node scripts/fetch-iplan-raw.mjs
 * first (one-time, network-bound, resumable).
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = resolve(__dir, 'cache/iplan-raw.json');
const OUT_DIR    = resolve(__dir, '../public/data');
const OUT_FILE   = resolve(OUT_DIR, 'iplan-grid.json');

// Grid constants — must match src/utils/grid1km.ts and fetch-iplan-raw.mjs exactly
const GRID_STEP  = 0.009;
const GRID_BBOX  = { south: 3.700, north: 7.100, west: 99.500, east: 102.100 };
const SAMPLE_OFF = 0.003;

// Only used to decide which cells fall inside iPlan's 4-state coverage —
// no network calls happen here, this is just a bbox filter.
const STATE_BOUNDS = [
  { s: 6.25, n: 6.75, w: 99.88, e: 100.52 }, // Perlis
  { s: 5.08, n: 5.68, w: 100.08, e: 100.58 }, // Penang
  { s: 5.50, n: 6.80, w: 99.85, e: 101.30 }, // Kedah
  { s: 3.68, n: 5.65, w: 100.18, e: 102.05 }, // Perak
];

function isInAnyState(lat, lng) {
  return STATE_BOUNDS.some((b) => lat >= b.s && lat <= b.n && lng >= b.w && lng <= b.e);
}

function pointKey(lat, lng) {
  return `${lat.toFixed(5)}_${lng.toFixed(5)}`;
}

// ── iPlan attribute → SiteIQ land use class ───────────────────────────────────

function iplanToLandUse(attrs) {
  const g1  = (attrs.gunatanah1 ?? '').trim();
  const g2  = (attrs.gunatanah2 ?? '').toLowerCase();
  const g3  = (attrs.gunatanah3 ?? '').toLowerCase(); // gunatanah3 holds crop type
  const kod = (attrs.kod_gtn    ?? '').toUpperCase();

  // Reservoir/dam/lake water surfaces are sometimes classified under
  // 'Infrastruktur dan Utiliti' > 'Bekalan Air' > 'Empangan' (water supply
  // infrastructure) rather than under 'Badan Air' (water bodies) — e.g. Tasik
  // Timah Tasoh (Perlis) is filed this way. Catch this before the g1 branches
  // below would otherwise blanket-map it to urban/infrastructure.
  if (g3.includes('empangan') || g3.includes('tasik') || g3.includes('kolam takungan')) {
    return 'water';
  }

  if (g1 === 'Hutan') {
    if (kod.startsWith('HT402')) return 'idle_agri';
    // Officially gazetted reserve/protection forest and mangrove (Hutan Simpan
    // Kekal, Hutan Tanah Kerajaan, Hutan Perlindungan, Hutan Paya Laut) is a
    // strong, legally significant signal — classified separately from generic
    // "Kawasan Berhutan" (informal forested area) so it can get veto priority
    // in resolveResults(). River-mouth mangrove reserves in particular form
    // narrow strips that are often smaller than the 3-point sample spread, so
    // without veto power a single sample point landing just outside the strip
    // (on adjacent cleared/agricultural land) would flip the whole cell away
    // from forest — this is what was happening along Sungai Merbok.
    if (g2.includes('simpan kekal') || g2.includes('tanah kerajaan')
     || g3.includes('perlindungan') || g3.includes('paya laut')) {
      return 'forest_reserve';
    }
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
  if (g1 === 'Tanah Kosong') {
    // g1='Tanah Kosong' (vacant land) is NOT uniformly rural/idle — its gunatanah2
    // sub-category distinguishes urban vacant lots (earmarked for development,
    // squatter settlements, contaminated/brownfield sites) from genuinely idle rural land.
    if (g2.includes('pembangunan'))   return 'urban'; // vacant lot earmarked/under active development
    if (g2.includes('setinggan'))     return 'urban'; // squatter settlement — informal urban housing
    if (g3.includes('tapak projek'))  return 'urban'; // site under construction / abandoned project
    if (g3.includes('brownfield') || g3.includes('tercemar')) return 'urban'; // former industrial / contaminated site
    if (g3.includes('pelupusan'))     return 'urban'; // landfill / waste disposal site
    return 'idle_agri'; // Tanah Tidak Diusahakan, Semula Jadi, Tanah Lapang — genuinely idle/undeveloped
  }
  if (g1 === 'Tanah Pembangunan') return 'urban';
  if (g1 === 'Badan Air') {
    const isRiver = g2.includes('sungai') || g3.includes('sungai')
                 || g2.includes('laut')   || g3.includes('laut')
                 || g2.includes('selat')  || g3.includes('selat');
    if (isRiver) return 'river'; // rivers/sea — no solar, distinct from lakes/reservoirs
    // Still water bodies (tasik, kolam, empangan, takungan) → FPV viable at 30%
    return 'water';
  }
  if (g1 === 'Industri')       return 'industrial';
  if (g1 === 'Komersial')      return 'commercial';
  // Plain residential ('Perumahan') is classified separately from the other urban
  // categories below — a single small housing cluster/isolated house sample point
  // inside an otherwise much larger paddy/agri block shouldn't flip the whole cell's
  // classification. See resolveResults(): 'urban_soft' needs 2 of 3 points to win,
  // while the harder categories below (schools, government facilities, designated
  // development land, transport, mixed-use) keep single-hit veto power since those
  // represent deliberate, significant development rather than incidental housing.
  if (g1 === 'Perumahan')      return 'urban_soft';
  if (g1 === 'Pengangkutan')                     return 'urban'; // bus stations, airports
  // Transmission line / pylon corridors ("Laluan Rentis") are narrow linear
  // easements routed over whatever land use already exists beneath them — they
  // don't occupy real footprint the way a substation or treatment plant does.
  // Without this exception a single sample point landing on a pylon route
  // crossing a forest reserve or paddy field would wrongly veto the cell to
  // 'infrastructure' (observed: a 500kV corridor through Sungai Merbok mangrove
  // reserve was outvoting 2 genuine forest hits at the same cell).
  if (g3.includes('laluan rentis')) return null;
  // Utility/infra facilities — water treatment, substations, telecom towers,
  // drainage, gas/petroleum supply. Distinct from 'urban' since these are
  // occupied single-purpose facility footprints, not generic developable land.
  // (Reservoir/dam/lake water surfaces are already caught above by the early
  // empangan/tasik/kolam-takungan check before reaching this branch.)
  if (g1 === 'Infrastruktur dan Utiliti')        return 'infrastructure'; // actual combined g1 value
  if (g1 === 'Institusi dan Kemudahan Masyarakat') return 'urban'; // actual combined g1 value
  if (g1 === 'Pembangunan Bercampur')            return 'urban'; // mixed-use development
  if (g1 === 'Tanah Lapang dan Rekreasi') {
    // 'Zon Penampan' (buffer/setback zone) is undeveloped clear-strip land kept
    // around infrastructure (e.g. reservoir shorelines) — not actually built-up.
    // Because 'urban' has veto priority in resolveResults(), classifying this as
    // urban let a single buffer-zone sample point outvote 2 real 'water' hits at
    // the same cell (this is exactly what caused Tasik Timah Tasoh's shoreline
    // cells to show as urban instead of water).
    if (g3.includes('zon penampan')) return 'idle_agri';
    return 'urban'; // parks, playing fields, stadiums, community halls
  }
  // Legacy / variant spellings (some services use shorter forms)
  if (g1 === 'Institusi')      return 'urban';
  if (g1 === 'Kemudahan Awam') return 'urban';
  if (g1 === 'Infrastruktur')  return 'infrastructure';
  if (g1 === 'Utiliti')        return 'infrastructure';
  return null;
}

// ── Multi-point resolution ────────────────────────────────────────────────────
// Institutional/commercial/industrial/infrastructure presence in any sub-point
// overrides agricultural labels — catches real development (schools, factories,
// government facilities) whose footprint is small relative to the 1 km cell.
// Plain residential ('urban_soft') instead needs 2 of 3 points to win, so an
// isolated small housing cluster inside a much larger paddy/agri block doesn't
// flip the whole cell away from what it mostly actually is.
// For agricultural classes, highest-priority result wins.

const LU_PRIORITY = {
  industrial: 9, commercial: 8, urban: 7, infrastructure: 7, urban_soft: 7, forest_reserve: 7,
  paddy: 6, oil_palm: 5, rubber: 4, mixed_agri: 3, idle_agri: 2, water: 1, forest: 0, river: 0,
};

function resolveResults(results) {
  const valid = results.filter(Boolean);
  if (valid.length === 0) return null;
  for (const cls of ['industrial', 'commercial', 'urban', 'infrastructure']) {
    if (valid.includes(cls)) return cls;
  }
  // Gazetted forest reserve/mangrove — single-hit veto, same tier as hard urban
  // signals (see the 'forest_reserve' comment in iplanToLandUse above).
  if (valid.includes('forest_reserve')) return 'forest';
  const softCount = valid.filter((v) => v === 'urban_soft').length;
  if (softCount >= 2) return 'urban';
  const rest = valid.filter((v) => v !== 'urban_soft' && v !== 'forest_reserve');
  if (rest.length > 0) {
    return rest.reduce((best, lu) => (LU_PRIORITY[lu] ?? -1) > (LU_PRIORITY[best] ?? -1) ? lu : best);
  }
  return 'urban'; // the only signal across all 3 points was a single residential hit
}

function toIplanAttrs(raw) {
  if (!raw) return null;
  return { gunatanah1: raw.g1, gunatanah2: raw.g2, gunatanah3: raw.g3, kod_gtn: raw.kod };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(CACHE_FILE)) {
    console.error(`Raw cache not found at ${CACHE_FILE}`);
    console.error('Run node scripts/fetch-iplan-raw.mjs first (one-time, network-bound).');
    process.exit(1);
  }

  const cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  const points = cache.points ?? {};
  console.log(`Loaded ${Object.keys(points).length} raw points (fetched ${cache.fetchedAt})\n`);

  const grid = {};
  let cellCount = 0, hits = 0, missingRawData = 0;

  for (let la = GRID_BBOX.south; la < GRID_BBOX.north; la = +(la + GRID_STEP).toFixed(3)) {
    for (let lo = GRID_BBOX.west; lo < GRID_BBOX.east; lo = +(lo + GRID_STEP).toFixed(3)) {
      const cLat = +(la + GRID_STEP / 2).toFixed(4);
      const cLng = +(lo + GRID_STEP / 2).toFixed(4);
      if (!isInAnyState(cLat, cLng)) continue;
      cellCount++;

      const samplePts = [
        [cLat, cLng],
        [+(cLat + SAMPLE_OFF).toFixed(5), +(cLng + SAMPLE_OFF).toFixed(5)],
        [+(cLat - SAMPLE_OFF).toFixed(5), +(cLng - SAMPLE_OFF).toFixed(5)],
      ];

      let anyMissing = false;
      const results = samplePts.map(([lat, lng]) => {
        const key = pointKey(lat, lng);
        if (!(key in points)) { anyMissing = true; return null; }
        return iplanToLandUse(toIplanAttrs(points[key]) ?? {});
      });
      if (anyMissing) missingRawData++;

      const lu = resolveResults(results);
      if (lu) {
        grid[`${cLat.toFixed(4)}_${cLng.toFixed(4)}`] = lu;
        hits++;
      }
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = JSON.stringify({ version: 2, grid });
  writeFileSync(OUT_FILE, payload, 'utf8');

  const sizeMb = (payload.length / 1_048_576).toFixed(2);
  console.log(`✓  ${hits}/${cellCount} cells classified (${sizeMb} MB)`);
  if (missingRawData > 0) {
    console.log(`   ${missingRawData} cells have incomplete raw sample data — run fetch-iplan-raw.mjs to fill gaps`);
  }
  console.log(`   Written to ${OUT_FILE}\n`);
}

main();
