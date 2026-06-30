/**
 * One-time download script for PVGIS solar yield data for northern Malaysia.
 *
 * Queries the EU JRC PVGIS API at 0.1° resolution (35 lat × 27 lng = 945 points).
 * Stores a compact static file served by Vite/Vercel with no runtime API dependency.
 *
 * Usage:
 *   node scripts/download-pvgis.mjs
 *
 * Requirements: Node 18+ (native fetch). No npm packages needed.
 * Estimated runtime: ~30–60 seconds at concurrency 20.
 * PVGIS rate limit: 30 req/s — concurrency 20 is comfortably within that.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR  = resolve(__dir, '../public/data');
const OUT_FILE = resolve(OUT_DIR, 'pvgis-grid.json');

const PVGIS_BASE = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';

// Grid parameters — match src/utils/pvgis.ts
const BBOX = { south: 3.70, north: 7.10, west: 99.50, east: 102.10 };
const STEP = 0.05; // degrees — matches PVGIS SARAH-3 native 0.05° resolution

// Fixed-tilt system parameters (typical Malaysian LSS ground-mount)
const SYSTEM = { peakpower: 1, loss: 14, angle: 10, aspect: 0 }; // 1 kWp, 10° tilt south-facing

const CONCURRENCY = 20;

// ── Grid generation ───────────────────────────────────────────────────────────

function generateGrid() {
  const points = [];
  for (let la = BBOX.south; la <= BBOX.north + 0.001; la = Math.round((la + STEP) * 100) / 100) {
    for (let lo = BBOX.west; lo <= BBOX.east + 0.001; lo = Math.round((lo + STEP) * 100) / 100) {
      points.push([Math.round(la * 100) / 100, Math.round(lo * 100) / 100]);
    }
  }
  return points;
}

// ── PVGIS fetch ───────────────────────────────────────────────────────────────

async function fetchPoint(lat, lng) {
  const params = new URLSearchParams({
    lat:          String(lat),
    lon:          String(lng),
    peakpower:    String(SYSTEM.peakpower),
    loss:         String(SYSTEM.loss),
    mountingplace: 'free',
    angle:        String(SYSTEM.angle),
    aspect:       String(SYSTEM.aspect),
    outputformat: 'json',
  });
  const url = `${PVGIS_BASE}?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for (${lat}, ${lng})`);
  const json = await res.json();
  const fixed = json?.outputs?.totals?.fixed;
  if (!fixed?.E_y) throw new Error(`No E_y in response for (${lat}, ${lng})`);

  return {
    lat,
    lng,
    eY:  +(fixed.E_y).toFixed(1),                  // kWh/kWp/yr — peakpower=1 so E_y is already specific yield
    hiY: +(fixed['H(i)_y'] ?? 0).toFixed(1),       // plane-of-array irradiation, kWh/m²/yr
    pr:  +(1 - Math.abs(fixed.l_total ?? 14) / 100).toFixed(4),
  };
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function runPool(tasks, limit) {
  const results = new Array(tasks.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const points = generateGrid();
  console.log(`PVGIS download: ${points.length} grid points at ${STEP}° resolution\n`);

  const results = [];
  let done = 0, errors = 0;
  const startMs = Date.now();

  const tasks = points.map(([lat, lng]) => async () => {
    try {
      const pt = await fetchPoint(lat, lng);
      results.push(pt);
    } catch (err) {
      errors++;
      console.warn(`  ✗ (${lat}, ${lng}): ${err.message}`);
    }
    done++;
    if (done % 50 === 0 || done === points.length) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
      const pct = ((done / points.length) * 100).toFixed(1);
      process.stdout.write(`\r  ${pct}%  ${done}/${points.length}  ${errors} errors  ${elapsed}s elapsed   `);
    }
  });

  await runPool(tasks, CONCURRENCY);
  console.log('\n');

  if (results.length === 0) {
    console.error('No data retrieved. Check network access to re.jrc.ec.europa.eu');
    process.exit(1);
  }

  // Sort by lat then lng for reproducible output
  results.sort((a, b) => a.lat - b.lat || a.lng - b.lng);

  const payload = JSON.stringify({ version: 1, step: STEP, bbox: BBOX, points: results });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, payload, 'utf8');

  const sizekb = (payload.length / 1024).toFixed(1);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  const eYRange = [Math.min(...results.map(r=>r.eY)), Math.max(...results.map(r=>r.eY))];
  console.log(`✓  ${results.length} points (${sizekb} KB) in ${elapsed}s → ${OUT_FILE}`);
  console.log(`   eY range: ${eYRange[0]}–${eYRange[1]} kWh/kWp/yr`);
  console.log('   Commit public/data/pvgis-grid.json to deploy.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
