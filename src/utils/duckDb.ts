// DuckDB-WASM singleton for Solar SiteIQ.
// Uses the jsDelivr CDN EH bundle — no SharedArrayBuffer / COOP headers required.
// Schema stores: grid cells, PVGIS cache, WorldCover cache, OSM tables.

import * as duckdb from '@duckdb/duckdb-wasm';

let _dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function initDb(): Promise<duckdb.AsyncDuckDB> {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' }),
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);

  await initSchema(db);
  return db;
}

async function initSchema(db: duckdb.AsyncDuckDB): Promise<void> {
  const conn = await db.connect();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS grid_cells (
        cell_id       VARCHAR PRIMARY KEY,
        center_lat    DOUBLE,
        center_lng    DOUBLE,
        state         VARCHAR,
        land_use      VARCHAR,
        flood_risk    VARCHAR,
        is_protected  BOOLEAN,
        pvgis_e_y     DOUBLE,
        pvgis_pr      DOUBLE,
        dist_grid_km  DOUBLE,
        nearest_kv    INTEGER,
        dist_road_km  DOUBLE,
        score_solar   DOUBLE,
        score_grid    DOUBLE,
        score_land    DOUBLE,
        score_avail   DOUBLE,
        score_climate DOUBLE,
        score_road    DOUBLE,
        score_env     DOUBLE,
        score_composite DOUBLE,
        capacity_kwp  DOUBLE,
        annual_yield_mwh DOUBLE,
        wc_class      INTEGER,
        computed_at   TIMESTAMP
      );
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS pvgis_cache (
        lat        DOUBLE,
        lng        DOUBLE,
        e_y        DOUBLE,
        perf_ratio DOUBLE,
        h_i_y      DOUBLE,
        fetched_at BIGINT,
        PRIMARY KEY (lat, lng)
      );
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS worldcover_cache (
        bbox_key   VARCHAR PRIMARY KEY,
        data       VARCHAR,
        fetched_at BIGINT
      );
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS osm_cache (
        store      VARCHAR,
        cache_key  VARCHAR,
        data       VARCHAR,
        fetched_at BIGINT,
        PRIMARY KEY (store, cache_key)
      );
    `);
  } finally {
    await conn.close();
  }
}

export function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!_dbPromise) {
    _dbPromise = initDb().catch((err) => {
      _dbPromise = null;
      throw err;
    });
  }
  return _dbPromise;
}

// ── Grid cells ────────────────────────────────────────────────────────────────

export interface GridCellRow {
  cell_id: string;
  center_lat: number;
  center_lng: number;
  state: string;
  land_use: string;
  flood_risk: string;
  is_protected: boolean;
  pvgis_e_y: number;
  pvgis_pr: number;
  dist_grid_km: number;
  nearest_kv: number;
  dist_road_km: number;
  score_solar: number;
  score_grid: number;
  score_land: number;
  score_avail: number;
  score_climate: number;
  score_road: number;
  score_env: number;
  score_composite: number;
  capacity_kwp: number;
  annual_yield_mwh: number;
  wc_class: number;
}

export async function upsertGridCells(rows: GridCellRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  const conn = await db.connect();
  try {
    // Batch insert in chunks
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const vals = chunk.map((r) =>
        `('${r.cell_id}',${r.center_lat},${r.center_lng},'${r.state}','${r.land_use}','${r.flood_risk}',${r.is_protected},${r.pvgis_e_y},${r.pvgis_pr},${r.dist_grid_km},${r.nearest_kv},${r.dist_road_km},${r.score_solar},${r.score_grid},${r.score_land},${r.score_avail},${r.score_climate},${r.score_road},${r.score_env},${r.score_composite},${r.capacity_kwp},${r.annual_yield_mwh},${r.wc_class},NOW())`
      ).join(',');
      await conn.query(`
        INSERT OR REPLACE INTO grid_cells
        (cell_id,center_lat,center_lng,state,land_use,flood_risk,is_protected,pvgis_e_y,pvgis_pr,
         dist_grid_km,nearest_kv,dist_road_km,score_solar,score_grid,score_land,score_avail,
         score_climate,score_road,score_env,score_composite,capacity_kwp,annual_yield_mwh,wc_class,computed_at)
        VALUES ${vals};
      `);
    }
  } finally {
    await conn.close();
  }
}

export async function getAllGridCells(): Promise<GridCellRow[]> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const result = await conn.query('SELECT * FROM grid_cells ORDER BY center_lat, center_lng;');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (result.toArray() as any[]).map((r) => ({
      cell_id: r.cell_id,
      center_lat: Number(r.center_lat),
      center_lng: Number(r.center_lng),
      state: r.state ?? '',
      land_use: r.land_use ?? 'unknown',
      flood_risk: r.flood_risk ?? 'low',
      is_protected: Boolean(r.is_protected),
      pvgis_e_y: Number(r.pvgis_e_y ?? 0),
      pvgis_pr: Number(r.pvgis_pr ?? 0),
      dist_grid_km: Number(r.dist_grid_km ?? 999),
      nearest_kv: Number(r.nearest_kv ?? 132),
      dist_road_km: Number(r.dist_road_km ?? 999),
      score_solar: Number(r.score_solar ?? 0),
      score_grid: Number(r.score_grid ?? 0),
      score_land: Number(r.score_land ?? 0),
      score_avail: Number(r.score_avail ?? 0),
      score_climate: Number(r.score_climate ?? 0),
      score_road: Number(r.score_road ?? 0),
      score_env: Number(r.score_env ?? 0),
      score_composite: Number(r.score_composite ?? 0),
      capacity_kwp: Number(r.capacity_kwp ?? 0),
      annual_yield_mwh: Number(r.annual_yield_mwh ?? 0),
      wc_class: Number(r.wc_class ?? 0),
    }));
  } finally {
    await conn.close();
  }
}

export async function getGridCellCount(): Promise<number> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const result = await conn.query('SELECT COUNT(*) AS n FROM grid_cells;');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Number((result.toArray() as any[])[0]?.n ?? 0);
  } finally {
    await conn.close();
  }
}

// ── PVGIS cache ───────────────────────────────────────────────────────────────

export interface PvgisRow {
  lat: number;
  lng: number;
  e_y: number;
  perf_ratio: number;
  h_i_y: number;
}

export async function getPvgisCache(lat: number, lng: number): Promise<PvgisRow | null> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const result = await conn.query(
      `SELECT * FROM pvgis_cache WHERE lat=${lat} AND lng=${lng} LIMIT 1;`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = result.toArray() as any[];
    if (rows.length === 0) return null;
    return { lat: Number(rows[0].lat), lng: Number(rows[0].lng), e_y: Number(rows[0].e_y), perf_ratio: Number(rows[0].perf_ratio), h_i_y: Number(rows[0].h_i_y) };
  } finally {
    await conn.close();
  }
}

export async function putPvgisCache(row: PvgisRow): Promise<void> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    await conn.query(
      `INSERT OR REPLACE INTO pvgis_cache (lat,lng,e_y,perf_ratio,h_i_y,fetched_at)
       VALUES (${row.lat},${row.lng},${row.e_y},${row.perf_ratio},${row.h_i_y},${Date.now()});`,
    );
  } finally {
    await conn.close();
  }
}

export async function getAllPvgisCache(): Promise<PvgisRow[]> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const result = await conn.query('SELECT * FROM pvgis_cache;');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (result.toArray() as any[]).map((r) => ({
      lat: Number(r.lat), lng: Number(r.lng),
      e_y: Number(r.e_y), perf_ratio: Number(r.perf_ratio), h_i_y: Number(r.h_i_y),
    }));
  } finally {
    await conn.close();
  }
}

// ── WorldCover cache ──────────────────────────────────────────────────────────

export async function getWorldcoverCache(bboxKey: string): Promise<number[] | null> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const result = await conn.query(
      `SELECT data, fetched_at FROM worldcover_cache WHERE bbox_key='${bboxKey}' LIMIT 1;`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = result.toArray() as any[];
    if (rows.length === 0) return null;
    const ageMs = Date.now() - Number(rows[0].fetched_at);
    if (ageMs > 30 * 24 * 3600 * 1000) return null; // 30-day TTL
    return JSON.parse(rows[0].data) as number[];
  } finally {
    await conn.close();
  }
}

export async function putWorldcoverCache(bboxKey: string, data: number[]): Promise<void> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const escaped = JSON.stringify(data).replace(/'/g, "''");
    await conn.query(
      `INSERT OR REPLACE INTO worldcover_cache (bbox_key, data, fetched_at)
       VALUES ('${bboxKey}', '${escaped}', ${Date.now()});`,
    );
  } finally {
    await conn.close();
  }
}

// ── OSM cache (replaces IndexedDB) ───────────────────────────────────────────

export interface OsmCacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export async function readOsmDuckCache<T>(
  store: string,
  key: string,
): Promise<OsmCacheEntry<T> | null> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const safeStore = store.replace(/'/g, "''");
    const safeKey   = key.replace(/'/g, "''");
    const result = await conn.query(
      `SELECT data, fetched_at FROM osm_cache WHERE store='${safeStore}' AND cache_key='${safeKey}' LIMIT 1;`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = result.toArray() as any[];
    if (rows.length === 0) return null;
    return { data: JSON.parse(rows[0].data) as T, fetchedAt: Number(rows[0].fetched_at) };
  } catch {
    return null;
  } finally {
    await conn.close();
  }
}

export async function writeOsmDuckCache<T>(
  store: string,
  key: string,
  data: T,
): Promise<void> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const safeStore   = store.replace(/'/g, "''");
    const safeKey     = key.replace(/'/g, "''");
    const serialized  = JSON.stringify(data).replace(/'/g, "''");
    await conn.query(
      `INSERT OR REPLACE INTO osm_cache (store, cache_key, data, fetched_at)
       VALUES ('${safeStore}', '${safeKey}', '${serialized}', ${Date.now()});`,
    );
  } catch {
    // silently ignore quota or permission errors
  } finally {
    await conn.close();
  }
}

export async function clearOsmDuckStore(store: string): Promise<void> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const safeStore = store.replace(/'/g, "''");
    await conn.query(`DELETE FROM osm_cache WHERE store='${safeStore}';`);
  } catch {} finally {
    await conn.close();
  }
}

export async function getOsmDuckStoreFetchedAt(store: string): Promise<number | null> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const safeStore = store.replace(/'/g, "''");
    const result = await conn.query(
      `SELECT MIN(fetched_at) AS oldest FROM osm_cache WHERE store='${safeStore}';`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = result.toArray() as any[];
    const val = rows[0]?.oldest;
    return val != null ? Number(val) : null;
  } catch {
    return null;
  } finally {
    await conn.close();
  }
}
