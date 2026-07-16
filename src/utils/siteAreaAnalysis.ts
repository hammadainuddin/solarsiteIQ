// Site area polygon analysis for Solar SiteIQ.
// Given a drawn polygon (array of [lat, lng] vertices) and the full tile set,
// identifies which 1 km cells lie inside, then aggregates capacity, yield,
// and constraint data for the SiteAreaInfoBox.

import type { HexTile } from '../types';
import { getGoThreshold, CONDITIONAL_GO_THRESHOLD } from './solarScoring';
import { GRID_STEP, GRID_BBOX } from './grid1km';

export interface SiteAreaResult {
  drawnAreaKm2: number;
  cellsInside: HexTile[];     // tiles the polygon overlaps (fraction > 0)
  suitableCells: HexTile[];   // overlapped tiles with composite ≥ CONDITIONAL_GO_THRESHOLD
  goCells: HexTile[];         // overlapped tiles with composite ≥ GO_THRESHOLD
  // Area-weighted coverage (km²) — the fraction of each overlapped cell that
  // actually falls inside the polygon, summed. Correct for polygons both larger
  // and smaller than the 1 km grid (a sub-cell polygon still reports its slice).
  coveredAreaKm2: number;
  suitableAreaKm2: number;
  goAreaKm2: number;
  totalCapacityMWp: number;
  groundMountMWp: number;
  fpvMWp: number;
  rooftopMWp: number;
  totalYieldGWhPerYear: number;
  avgCapacityFactor: number;  // %
  avgPvgisEyKWhPerKWp: number;
  avgScore: number;
  avgGridDistKm: number;
  landUseBreakdown: { landUse: string; count: number; capacityMWp: number }[];
  topConstraint: string;
}

const GROUND_MOUNT_TYPES = new Set(['idle_agri', 'rubber', 'mixed_agri', 'oil_palm', 'paddy', 'livestock']);
const FPV_TYPES           = new Set(['water', 'aquaculture']); // aquaculture ponds host floating PV
const ROOFTOP_TYPES       = new Set(['industrial', 'commercial']);

// ── Shoelace area (degrees → km²) ────────────────────────────────────────────

export function shoelaceAreaKm2(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const avgLat = ring.reduce((s, [lat]) => s + lat, 0) / ring.length;
  const latKm = 111.32;
  const lngKm = 111.32 * Math.cos((avgLat * Math.PI) / 180);

  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [lati, lngi] = ring[i];
    const [latn, lngn] = ring[(i + 1) % n];
    sum += lngi * latn - lngn * lati;
  }
  return Math.abs(sum / 2) * lngKm * latKm;
}

// ── Point-in-polygon ray-cast ─────────────────────────────────────────────────

export function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (((yi > lat) !== (yj > lat)) &&
        (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Main analysis ─────────────────────────────────────────────────────────────

export function analyzeArea(
  ring: [number, number][],
  tiles: HexTile[],
): SiteAreaResult {
  const drawnAreaKm2 = shoelaceAreaKm2(ring);

  // Polygon bbox
  let bboxS = Infinity, bboxN = -Infinity, bboxW = Infinity, bboxE = -Infinity;
  for (const [lat, lng] of ring) {
    if (lat < bboxS) bboxS = lat;
    if (lat > bboxN) bboxN = lat;
    if (lng < bboxW) bboxW = lng;
    if (lng > bboxE) bboxE = lng;
  }

  // Index tiles by integer grid cell so a sample point can find its cell in O(1).
  const cellIdx = (lat: number, lng: number) =>
    `${Math.floor((lat - GRID_BBOX.south) / GRID_STEP)}_${Math.floor((lng - GRID_BBOX.west) / GRID_STEP)}`;
  const tileByCell = new Map<string, HexTile>();
  for (const t of tiles) tileByCell.set(cellIdx(t.centerLat, t.centerLng), t);

  // Rasterise the polygon at sub-cell resolution and tally, per overlapped cell,
  // how much of it falls inside. This replaces the old "cell centre inside
  // polygon" test, which returned nothing for polygons smaller than a 1 km cell
  // (no centre landed inside) — the cause of the all-zero result.
  const SUB = 5;                       // 5×5 sub-samples per 1 km cell (~200 m)
  const subStep = GRID_STEP / SUB;
  const samplesPerCell = SUB * SUB;
  const perCellSamples = new Map<string, number>();
  for (let lat = bboxS + subStep / 2; lat <= bboxN; lat += subStep) {
    for (let lng = bboxW + subStep / 2; lng <= bboxE; lng += subStep) {
      if (!pointInRing(lat, lng, ring)) continue;
      const key = cellIdx(lat, lng);
      perCellSamples.set(key, (perCellSamples.get(key) ?? 0) + 1);
    }
  }
  // Fallback for a polygon so small it slips between sub-samples: attribute its
  // shoelace area to the cell containing its centroid, so a tiny site still
  // reports its slice instead of nothing.
  if (perCellSamples.size === 0 && drawnAreaKm2 > 0) {
    const cLatMid = ring.reduce((s, v) => s + v[0], 0) / ring.length;
    const cLngMid = ring.reduce((s, v) => s + v[1], 0) / ring.length;
    const frac = Math.min(samplesPerCell, Math.max(1, Math.round(drawnAreaKm2 * samplesPerCell)));
    perCellSamples.set(cellIdx(cLatMid, cLngMid), frac);
  }

  const cellsInside: HexTile[] = [];
  const fractionByTile = new Map<HexTile, number>();
  for (const [key, samples] of perCellSamples) {
    const tile = tileByCell.get(key);
    if (!tile) continue; // sample fell on an untiled cell (outside state land polygon)
    const fraction = Math.min(1, samples / samplesPerCell);
    cellsInside.push(tile);
    fractionByTile.set(tile, fraction);
  }

  const suitableCells = cellsInside.filter((t) => t.scores.composite >= CONDITIONAL_GO_THRESHOLD);
  const goCells       = cellsInside.filter((t) => t.scores.composite >= getGoThreshold());

  // Area-weighted coverage (each full 1 km cell = 1 km²)
  const sumFrac = (arr: HexTile[]) => arr.reduce((s, t) => s + (fractionByTile.get(t) ?? 0), 0);
  const coveredAreaKm2  = sumFrac(cellsInside);
  const suitableAreaKm2 = sumFrac(suitableCells);
  const goAreaKm2       = sumFrac(goCells);

  // Capacity/yield totals, each cell weighted by its overlap fraction.
  let groundMountKWp = 0, fpvKWp = 0, rooftopKWp = 0;
  let totalYieldMWh = 0, wSumEy = 0, wSumScore = 0, wSumGridDist = 0;
  const luMap = new Map<string, { areaKm2: number; capacityKWp: number }>();

  for (const t of cellsInside) {
    const f = fractionByTile.get(t) ?? 0;
    const lu = t.attributes.landUse;
    const cap = t.attributes.capacityKWp * f;

    if (GROUND_MOUNT_TYPES.has(lu)) groundMountKWp += cap;
    else if (FPV_TYPES.has(lu))     fpvKWp         += cap;
    else if (ROOFTOP_TYPES.has(lu)) rooftopKWp     += cap;

    totalYieldMWh += t.attributes.annualYieldMWh * f;
    wSumEy        += t.attributes.pvgisEyKWhPerKWp * f;
    wSumScore     += t.scores.composite * f;
    wSumGridDist  += t.attributes.distToGridKm * f;

    const entry = luMap.get(lu) ?? { areaKm2: 0, capacityKWp: 0 };
    entry.areaKm2 += f;
    entry.capacityKWp += cap;
    luMap.set(lu, entry);
  }

  const wTot = coveredAreaKm2 || 1; // fraction-weighted denominator
  const totalCapacityKWp = groundMountKWp + fpvKWp + rooftopKWp;
  const totalCapacityMWp = totalCapacityKWp / 1_000;
  const totalYieldGWh    = totalYieldMWh / 1_000;
  const avgScore         = Math.round(wSumScore / wTot);
  const avgGridDistKm    = Math.round(wSumGridDist / wTot * 10) / 10;
  const avgEy            = Math.round(wSumEy / wTot);

  const avgCF = totalCapacityKWp > 0
    ? (totalYieldMWh / (totalCapacityKWp * 8.76)) * 100
    : 0;

  const landUseBreakdown = Array.from(luMap.entries())
    .map(([landUse, { areaKm2, capacityKWp }]) => ({
      landUse,
      count: Math.round(areaKm2 * 10) / 10, // km² (kept as `count` for interface compatibility)
      capacityMWp: Math.round(capacityKWp / 1_000 * 10) / 10,
    }))
    .sort((a, b) => b.capacityMWp - a.capacityMWp);

  // Top constraint heuristic
  let topConstraint: string;
  if (cellsInside.length === 0) {
    topConstraint = 'Drawn area is over water / unclassified land — no developable grid cells';
  } else if (avgGridDistKm > 25) {
    topConstraint = `Grid distance (avg ${avgGridDistKm} km to nearest line)`;
  } else if (goCells.length === 0) {
    topConstraint = 'Low composite score — check land/flood/grid constraints';
  } else {
    const topLu = landUseBreakdown[0]?.landUse ?? '';
    if (topLu === 'paddy') topConstraint = 'Food security restriction (paddy land conversion)';
    else if (topLu === 'forest') topConstraint = 'Protected forest — not developable';
    else if (topLu === 'urban') topConstraint = 'Urban / residential — fragmented ownership';
    else topConstraint = `Grid connection (avg ${avgGridDistKm} km)`;
  }

  return {
    drawnAreaKm2: Math.round(drawnAreaKm2 * 100) / 100,
    cellsInside,
    suitableCells,
    goCells,
    coveredAreaKm2:  Math.round(coveredAreaKm2 * 100) / 100,
    suitableAreaKm2: Math.round(suitableAreaKm2 * 100) / 100,
    goAreaKm2:       Math.round(goAreaKm2 * 100) / 100,
    totalCapacityMWp: Math.round(totalCapacityMWp * 10) / 10,
    groundMountMWp:   Math.round(groundMountKWp  / 1_000 * 10) / 10,
    fpvMWp:           Math.round(fpvKWp          / 1_000 * 10) / 10,
    rooftopMWp:       Math.round(rooftopKWp      / 1_000 * 10) / 10,
    totalYieldGWhPerYear: Math.round(totalYieldGWh * 100) / 100,
    avgCapacityFactor:    Math.round(avgCF * 10) / 10,
    avgPvgisEyKWhPerKWp: avgEy,
    avgScore,
    avgGridDistKm,
    landUseBreakdown,
    topConstraint,
  };
}
