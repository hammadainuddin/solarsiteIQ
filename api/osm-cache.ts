// Shared server-side cache for OSM transmission line, substation, and boundary data.
// GET  /api/osm-cache?type=lines|substations|boundaries  → read from Redis
// POST /api/osm-cache                                     → write to Redis (body: { type, data })
//
// No auth needed — data is public OSM. Vercel body limit is 4.5 MB; northern-MY
// data is ~300–600 KB JSON which is well within that.

/* eslint-disable @typescript-eslint/no-explicit-any */

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — OSM data changes rarely

const VALID_TYPES = ['lines', 'substations', 'boundaries'] as const;
type CacheType = typeof VALID_TYPES[number];

function redisKey(type: CacheType): string {
  return `siteiq-osm-${type}`;
}

async function redisGet(key: string): Promise<unknown> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    if (!res.ok) return null;
    const body = await res.json() as { result: string | null };
    if (!body.result) return null;
    return JSON.parse(body.result);
  } catch {
    return null;
  }
}

async function redisSet(key: string, value: unknown): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(REDIS_URL!, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['SET', key, JSON.stringify(value), 'EX', String(TTL_SECONDS)]),
  });
}

export default async function handler(req: any, res: any) {
  const type = (req.query?.type ?? '') as string;

  if (!VALID_TYPES.includes(type as CacheType)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const key = redisKey(type as CacheType);

  // ── GET: return cached data ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    const data = await redisGet(key);
    return res.json({ data: data ?? null });
  }

  // ── POST: store data from client after successful Overpass fetch ─────────────
  if (req.method === 'POST') {
    const { data } = req.body as { data?: unknown };
    if (!data) return res.status(400).json({ error: 'Missing data field' });

    // Basic sanity: must be a non-empty array
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'data must be a non-empty array' });
    }

    await redisSet(key, data);
    return res.json({ ok: true, count: (data as unknown[]).length });
  }

  return res.status(405).end();
}
