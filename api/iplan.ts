// Vercel serverless proxy for Malaysian government iPlan ArcGIS REST API.
// The ArcGIS server (scharms.planmalaysia.gov.my) does not send CORS headers,
// so browser fetch() is blocked by the same-origin policy. This proxy runs
// server-side (no CORS restriction) and forwards paginated results to the client.
//
// GET /api/iplan?state=<kedah|penang|perak|perlis>&offset=<N>

/* eslint-disable @typescript-eslint/no-explicit-any */

const IPLAN_BASE = 'https://scharms.planmalaysia.gov.my/arcgis/rest/services/iPLAN';

const SERVICES: Record<string, string> = {
  kedah:  'GTsemasa_02',
  penang: 'GTsemasa_07',
  perak:  'GTsemasa_08',
  perlis: 'GTsemasa_09',
};

const WHERE_CLAUSE =
  "gunatanah1 IN ('Pertanian','Hutan','Tanah Kosong','Badan Air','Industri','Komersial','Perumahan','Tanah Pembangunan')";

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();

  const { state, offset = '0' } = req.query as { state?: string; offset?: string };

  if (!state || !SERVICES[state]) {
    return res.status(400).json({
      error: `Invalid state "${state}". Valid values: ${Object.keys(SERVICES).join(', ')}`,
    });
  }

  const serviceUrl = `${IPLAN_BASE}/${SERVICES[state]}/MapServer`;
  const params = new URLSearchParams({
    f:                  'json',
    where:              WHERE_CLAUSE,
    outFields:          'gunatanah1,gunatanah2,gunatanah3,kod_gtn',
    outSR:              '4326',
    returnGeometry:     'true',
    geometryType:       'esriGeometryPolygon',
    resultRecordCount:  '1000',
    resultOffset:       String(offset),
    maxAllowableOffset: '0.0001',
  });

  try {
    const upstream = await fetch(`${serviceUrl}/0/query?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(25_000), // 25s upstream timeout
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `iPlan upstream returned HTTP ${upstream.status}`,
      });
    }

    const data = await upstream.json();

    // Cache aggressively — official MY land use data changes at most monthly
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000');
    return res.json(data);
  } catch (err: any) {
    console.error('[api/iplan] proxy error:', err?.message ?? err);
    return res.status(502).json({ error: String(err?.message ?? 'upstream failed') });
  }
}
