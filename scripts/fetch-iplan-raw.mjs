/**
 * One-time (rarely re-run) raw data fetch for Malaysian iPlan (GTsemasa) land use.
 *
 * Fetches RAW attributes only (gunatanah1/2/3, kod_gtn) for every grid sample
 * point — no classification logic here. Results are cached to
 * scripts/cache/iplan-raw.json so that scripts/build-iplan-grid.mjs can iterate
 * on classification rules instantly, entirely offline, without ever re-querying
 * the remote iPlan server.
 *
 * Resumable: already-cached points are skipped, so an interrupted or
 * throttled run can simply be re-invoked to pick up where it left off.
 * Progress is checkpointed to disk every SAVE_EVERY completions.
 *
 * Usage:
 *   node scripts/fetch-iplan-raw.mjs
 *
 * Requirements: Node 18+ (native fetch). No npm packages needed.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = resolve(__dir, 'cache');
const CACHE_FILE = resolve(CACHE_DIR, 'iplan-raw.json');

const IPLAN_BASE = 'https://scharms.planmalaysia.gov.my/arcgis/rest/services/iPLAN';

// Grid constants — must match src/utils/grid1km.ts and build-iplan-grid.mjs exactly
const GRID_STEP   = 0.009;
const GRID_BBOX   = { south: 3.700, north: 7.100, west: 99.500, east: 102.100 };
const SAMPLE_OFF  = 0.003; // centre + NE/SW corner offsets, same 3-point sampling as before
const CONCURRENCY = 10;
const TIMEOUT_MS  = 15_000;
const SAVE_EVERY  = 1000; // checkpoint cache to disk periodically

const STATE_SERVICES = [
  { key: 'perlis', service: 'GTsemasa_09', s: 6.25, n: 6.75, w: 99.88, e: 100.52 },
  { key: 'penang', service: 'GTsemasa_07', s: 5.08, n: 5.68, w: 100.08, e: 100.58 },
  { key: 'kedah',  service: 'GTsemasa_02', s: 5.50, n: 6.80, w: 99.85, e: 101.30 },
  { key: 'perak',  service: 'GTsemasa_08', s: 3.68, n: 5.65, w: 100.18, e: 102.05 },
];

// The 4 bboxes above pairwise OVERLAP (Perlis x Kedah, Penang x Kedah,
// Penang x Perak, Kedah x Perak all overlap — real Malaysian state boundaries
// follow rivers/ridges, not rectangles). Picking just the first bbox match
// silently misrouted border-area queries to the wrong state's cadastral
// service — confirmed for Pengkalan Hulu/Gerik (real Perak territory, per
// Nominatim) landing in the Kedah/Perak overlap band and being routed to
// Kedah's service, which correctly has no data there and returns null,
// masking Perak's real data (verified: Perak's service returns actual
// Hutan Simpan Kekal / Getah records for the same coordinates). Now returns
// ALL matching services so the caller can try each and keep the first hit.
function getServiceUrls(lat, lng) {
  return STATE_SERVICES
    .filter((st) => lat >= st.s && lat <= st.n && lng >= st.w && lng <= st.e)
    .map((st) => `${IPLAN_BASE}/${st.service}/MapServer`);
}

function pointKey(lat, lng) {
  return `${lat.toFixed(5)}_${lng.toFixed(5)}`;
}

// ── Raw point query — no classification, just the 4 attribute fields ─────────

async function queryOneService(serviceUrl, lat, lng) {
  const params = new URLSearchParams({
    f:              'json',
    geometry:       `${lng},${lat}`, // ArcGIS REST: x=lng, y=lat
    geometryType:   'esriGeometryPoint',
    inSR:           '4326',
    spatialRel:     'esriSpatialRelIntersects',
    outFields:      'gunatanah1,gunatanah2,gunatanah3,kod_gtn',
    returnGeometry: 'false',
    outSR:          '4326',
  });
  const res = await fetch(`${serviceUrl}/0/query?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const feat = data.features?.[0];
  if (!feat) return null; // confirmed: no parcel in THIS service
  const a = feat.attributes ?? {};
  return { g1: a.gunatanah1 ?? '', g2: a.gunatanah2 ?? '', g3: a.gunatanah3 ?? '', kod: a.kod_gtn ?? '' };
}

// Try each candidate service in turn (only relevant in state-bbox overlap
// zones — most points have exactly one candidate) and keep the first real hit.
// A null from one service only means "no parcel in THAT state's system" — it
// does NOT mean the coordinate has no data at all when another service also
// covers it.
async function queryPointRaw(serviceUrls, lat, lng) {
  for (const url of serviceUrls) {
    const result = await queryOneService(url, lat, lng);
    if (result) return result;
  }
  return null; // no service covering this point returned data
}

// ── Cache I/O ──────────────────────────────────────────────────────────────────

function loadCache() {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8')).points ?? {};
  } catch {
    return {};
  }
}

function saveCache(points) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const payload = JSON.stringify({ version: 1, fetchedAt: new Date().toISOString(), points });
  writeFileSync(CACHE_FILE, payload, 'utf8');
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function runPool(tasks, limit) {
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const points = loadCache();
  console.log(`Loaded ${Object.keys(points).length} cached raw points from ${CACHE_FILE}\n`);

  // Generate every (cell centre + NE/SW sample point), same order/formula as
  // the classification-time lookup in build-iplan-grid.mjs.
  const jobs = [];
  for (let la = GRID_BBOX.south; la < GRID_BBOX.north; la = +(la + GRID_STEP).toFixed(3)) {
    for (let lo = GRID_BBOX.west; lo < GRID_BBOX.east; lo = +(lo + GRID_STEP).toFixed(3)) {
      const cLat = +(la + GRID_STEP / 2).toFixed(4);
      const cLng = +(lo + GRID_STEP / 2).toFixed(4);
      const svcUrls = getServiceUrls(cLat, cLng);
      if (svcUrls.length === 0) continue;
      jobs.push({ lat: cLat, lng: cLng, svcUrls });
      jobs.push({ lat: +(cLat + SAMPLE_OFF).toFixed(5), lng: +(cLng + SAMPLE_OFF).toFixed(5), svcUrls });
      jobs.push({ lat: +(cLat - SAMPLE_OFF).toFixed(5), lng: +(cLng - SAMPLE_OFF).toFixed(5), svcUrls });
    }
  }

  const todo = jobs.filter((j) => !(pointKey(j.lat, j.lng) in points));
  console.log(`${jobs.length} total sample points — ${jobs.length - todo.length} already cached, ${todo.length} to fetch\n`);

  if (todo.length === 0) {
    console.log('Nothing to fetch — raw cache is already complete.');
    console.log('Run node scripts/build-iplan-grid.mjs to regenerate the classified grid.\n');
    return;
  }

  let done = 0, failed = 0;
  const startMs = Date.now();

  const tasks = todo.map((j) => async () => {
    const key = pointKey(j.lat, j.lng);
    try {
      points[key] = await queryPointRaw(j.svcUrls, j.lat, j.lng); // may be null — a valid "no parcel in any candidate service" result
    } catch {
      failed++; // leave unset — retried on next invocation, not cached as a false "no data"
    }
    done++;
    if (done % 200 === 0 || done === todo.length) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
      const pct = ((done / todo.length) * 100).toFixed(1);
      const eta = done > 0
        ? (((Date.now() - startMs) / done) * (todo.length - done) / 1000).toFixed(0)
        : '?';
      process.stdout.write(`\r  ${pct}%  ${done}/${todo.length}  ${failed} failed  ${elapsed}s elapsed  ~${eta}s remaining   `);
    }
    if (done % SAVE_EVERY === 0) saveCache(points);
  });

  await runPool(tasks, CONCURRENCY);
  saveCache(points);

  console.log(`\n\n✓  ${Object.keys(points).length} total raw points cached (${failed} failed this run — re-run to retry)`);
  console.log(`   Written to ${CACHE_FILE}`);
  console.log('   Run node scripts/build-iplan-grid.mjs to (re)generate public/data/iplan-grid.json instantly, offline.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
