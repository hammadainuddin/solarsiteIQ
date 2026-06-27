// Vercel serverless function: Copernicus Data Space OAuth token exchange.
// POST /api/sentinel2-token  body: { clientId, clientSecret }
// Returns { accessToken, expiresIn } caching the token in Upstash Redis for 9 min.
// The token TTL from Copernicus is 10 minutes; we cache 1 minute early to avoid
// serving expired tokens.

/* eslint-disable @typescript-eslint/no-explicit-any */

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CACHE_TTL   = 9 * 60; // 9 minutes

const COPERNICUS_TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';

async function redisCacheGet(key: string): Promise<string | null> {
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

async function redisCacheSet(key: string, value: string): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(REDIS_URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, value, 'EX', String(CACHE_TTL)]),
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const { clientId, clientSecret } = (req.body ?? {}) as {
    clientId?: string;
    clientSecret?: string;
  };

  if (!clientId?.trim() || !clientSecret?.trim()) {
    return res.status(400).json({ error: 'clientId and clientSecret are required' });
  }

  // Use a per-client cache key so different users get separate tokens
  const cacheKey = `siteiq-sentinel2-token-${clientId}`;

  // Return cached token if still valid
  const cached = await redisCacheGet(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  // Exchange credentials for access token
  try {
    const form = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
    });

    const tokenRes = await fetch(COPERNICUS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:   form.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      return res.status(tokenRes.status).json({
        error: `Copernicus OAuth failed (${tokenRes.status}): ${errText.slice(0, 200)}`,
      });
    }

    const data = await tokenRes.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      return res.status(502).json({ error: 'No access_token in Copernicus response' });
    }

    const payload = { accessToken: data.access_token, expiresIn: data.expires_in ?? 600 };
    await redisCacheSet(cacheKey, JSON.stringify(payload));

    return res.json(payload);
  } catch (err: any) {
    return res.status(502).json({ error: `Token exchange error: ${String(err?.message ?? err)}` });
  }
}
