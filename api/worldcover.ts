// Vercel serverless function: ESA WorldCover 2021 land-cover classification proxy.
// GET /api/worldcover  →  fetches a WMS GetMap PNG from Terrascope covering
// northern Malaysia at 0.009° resolution (≈1 km), parses pixel colors to class
// codes, caches in Upstash Redis for 30 days, returns a flat grid array.
//
// Response: { width: number, height: number, grid: number[] }
// grid[y * width + x] = WorldCover class code (10, 20, 30, 40, 50, 60, 80, 90, 95) or 0

/* eslint-disable @typescript-eslint/no-explicit-any */

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_TTL   = 30 * 24 * 3600; // 30 days — WorldCover 2021 is static
const CACHE_KEY   = 'siteiq-worldcover-v1-northernmy-009';

// Northern Malaysia bounding box (must match BBOX in grid1km.ts)
const BBOX = { south: 3.700, north: 7.100, west: 99.500, east: 102.100 };
const STEP = 0.009;

const GRID_W = Math.round((BBOX.east  - BBOX.west)  / STEP); // 289
const GRID_H = Math.round((BBOX.north - BBOX.south) / STEP); // 378

// Terrascope WorldCover WMS (global, free, no auth)
const WMS_URL =
  `https://services.terrascope.be/wms/v2?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap` +
  `&LAYERS=WORLDCOVER_2021_MAP&FORMAT=image%2Fpng` +
  `&BBOX=${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}` +
  `&WIDTH=${GRID_W}&HEIGHT=${GRID_H}&SRS=EPSG%3A4326`;

// Official ESA WorldCover v2.0 color palette (RGB → class code)
// Each entry: [R, G, B, class]
const PALETTE: [number, number, number, number][] = [
  [0,   100,   0,  10],  // Tree cover
  [255, 187,  34,  20],  // Shrubland
  [255, 255,  76,  30],  // Grassland
  [240, 150, 255,  40],  // Cropland
  [250,   0,   0,  50],  // Built-up
  [180, 180, 180,  60],  // Bare/sparse vegetation
  [240, 240, 240,  70],  // Snow and ice
  [0,   100, 200,  80],  // Permanent water bodies
  [0,   150, 160,  90],  // Herbaceous wetland
  [0,   207, 117,  95],  // Mangroves
  [250, 230, 160, 100],  // Moss and lichen
];

function rgbToClass(r: number, g: number, b: number): number {
  let bestClass = 0;
  let bestDist = Infinity;
  for (const [pr, pg, pb, cls] of PALETTE) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestDist) { bestDist = d; bestClass = cls; }
  }
  // Ignore very distant matches (likely transparent/no-data pixel)
  return bestDist < 15_000 ? bestClass : 0;
}

async function redisGet(key: string): Promise<string | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    if (!res.ok) return null;
    const body = await res.json() as { result: string | null };
    return body.result ?? null;
  } catch { return null; }
}

async function redisSet(key: string, value: string): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(REDIS_URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, value, 'EX', String(REDIS_TTL)]),
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();

  // 1. Try Redis cache first
  const cached = await redisGet(CACHE_KEY);
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return res.json(JSON.parse(cached));
  }

  // 2. Fetch WorldCover PNG from Terrascope WMS
  let pngBuffer: Buffer;
  try {
    const wmsRes = await fetch(WMS_URL, {
      headers: { Accept: 'image/png' },
      // 25-second timeout — generous for WMS cold start
      signal: AbortSignal.timeout(25_000),
    });
    if (!wmsRes.ok) {
      return res.status(502).json({ error: `WMS returned ${wmsRes.status}` });
    }
    const arrayBuf = await wmsRes.arrayBuffer();
    pngBuffer = Buffer.from(arrayBuf);
  } catch (err: any) {
    return res.status(502).json({ error: `WMS fetch failed: ${String(err?.message ?? err)}` });
  }

  // 3. Parse PNG using sharp (available on Vercel Node.js runtime)
  let grid: number[];
  try {
    // Dynamic import to avoid bundling issues in Vite dev server
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(pngBuffer)
      .resize(GRID_W, GRID_H, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels; // 3 (RGB) or 4 (RGBA)
    grid = new Array<number>(GRID_W * GRID_H).fill(0);

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const idx = (y * GRID_W + x) * channels;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const alpha = channels === 4 ? data[idx + 3] : 255;
        grid[y * GRID_W + x] = alpha > 20 ? rgbToClass(r, g, b) : 0;
      }
    }
  } catch (err: any) {
    return res.status(500).json({ error: `PNG parse failed: ${String(err?.message ?? err)}` });
  }

  // 4. Cache in Redis and respond
  const payload = { width: GRID_W, height: GRID_H, grid };
  const payloadStr = JSON.stringify(payload);
  await redisSet(CACHE_KEY, payloadStr).catch(() => null);

  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  return res.json(payload);
}
