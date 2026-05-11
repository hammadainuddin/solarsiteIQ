// Vercel serverless function — NOT processed by Vite.
// Uses the Upstash Redis REST API directly via fetch (Node 18+ built-in).
// Required env vars:
//   UPSTASH_REDIS_REST_URL   — from Vercel → Integrations → Upstash Redis
//   UPSTASH_REDIS_REST_TOKEN — same
//   ADMIN_PASSWORD           — defaults to hardcoded value if omitted

/* eslint-disable @typescript-eslint/no-explicit-any */

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'infraseasaltcaramel';
const REDIS_URL      = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN    = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY      = 'siteiq-llm-config';

async function redisGet(key: string): Promise<unknown> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const res = await fetch(`${REDIS_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!res.ok) return null;
  const body = await res.json() as { result: string | null };
  if (!body.result) return null;
  try { return JSON.parse(body.result); } catch { return body.result; }
}

async function redisSet(key: string, value: unknown): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Upstash Redis not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.');
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['SET', key, JSON.stringify(value)]),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Redis SET failed: ${msg}`);
  }
}

// Env-var fallback: admin can set LLM_API_KEY etc. in Vercel without Redis.
function envVarConfig(): unknown {
  if (!process.env.LLM_API_KEY) return null;
  return {
    provider:   process.env.LLM_PROVIDER  ?? 'gemini',
    apiKey:     process.env.LLM_API_KEY,
    model:      process.env.LLM_MODEL     ?? 'gemini-2.5-flash',
    baseUrl:    process.env.LLM_BASE_URL  ?? '',
    webSearch:  process.env.LLM_WEB_SEARCH !== 'false',
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const config = await redisGet(REDIS_KEY) ?? envVarConfig();
    return res.json({ config });
  }

  if (req.method === 'POST') {
    const { password, config } = req.body as { password?: string; config?: unknown };
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
    try {
      await redisSet(REDIS_KEY, config);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(503).json({ error: String(err?.message ?? err) });
    }
  }

  return res.status(405).end();
}
