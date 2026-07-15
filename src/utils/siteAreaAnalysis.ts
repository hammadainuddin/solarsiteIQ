// Site area polygon analysis for Solar SiteIQ.
// Given a drawn polygon (array of [lat, lng] vertices) and the full tile set,
// identifies which 1 km cells lie inside, then aggregates capacity, yield,
// and constraint data for the SiteAreaInfoBox.

import type { HexTile } from '../types';
import { getGoThreshold, CONDITIONAL_GO_THRESHOLD } from './solarScoring';

export interface SiteAreaResult {
  drawnAreaKm2: number;
  cellsInside: HexTile[];
  suitableCells: HexTile[];   // composite ≥ CONDITIONAL_GO_THRESHOLD
  goCells: HexTile[];         // composite ≥ GO_THRESHOLD
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

  // Pre-compute bbox for fast exclusion
  let bboxS = Infinity, bboxN = -Infinity, bboxW = Infinity, bboxE = -Infinity;
  for (const [lat, lng] of ring) {
    if (lat < bboxS) bboxS = lat;
    if (lat > bboxN) bboxN = lat;
    if (lng < bboxW) bboxW = lng;
    if (lng > bboxE) bboxE = lng;
  }

  const cellsInside: HexTile[] = [];
  for (const tile of tiles) {
    const { centerLat: lat, centerLng: lng } = tile;
    if (lat < bboxS || lat > bboxN || lng < bboxW || lng > bboxE) continue;
    if (pointInRing(lat, lng, ring)) cellsInside.push(tile);
  }

  const suitableCells = cellsInside.filter((t) => t.scores.composite >= CONDITIONAL_GO_THRESHOLD);
  const goCells       = cellsInside.filter((t) => t.scores.composite >= getGoThreshold());

  // Capacity totals
  let groundMountKWp = 0, fpvKWp = 0, rooftopKWp = 0;
  let totalYieldMWh = 0, sumEy = 0, sumScore = 0, sumGridDist = 0;

  const luMap = new Map<string, { count: number; capacityKWp: number }>();

  for (const t of cellsInside) {
    const lu = t.attributes.landUse;
    const cap = t.attributes.capacityKWp;

    if (GROUND_MOUNT_TYPES.has(lu)) groundMountKWp += cap;
    else if (FPV_TYPES.has(lu))     fpvKWp         += cap;
    else if (ROOFTOP_TYPES.has(lu)) rooftopKWp     += cap;

    totalYieldMWh += t.attributes.annualYieldMWh;
    sumEy         += t.attributes.pvgisEyKWhPerKWp;
    sumScore      += t.scores.composite;
    sumGridDist   += t.attributes.distToGridKm;

    const entry = luMap.get(lu) ?? { count: 0, capacityKWp: 0 };
    entry.count++;
    entry.capacityKWp += cap;
    luMap.set(lu, entry);
  }

  const n = cellsInside.length || 1;
  const totalCapacityKWp = groundMountKWp + fpvKWp + rooftopKWp;
  const totalCapacityMWp = totalCapacityKWp / 1_000;
  const totalYieldGWh    = totalYieldMWh / 1_000;
  const avgScore         = Math.round(sumScore / n);
  const avgGridDistKm    = Math.round(sumGridDist / n * 10) / 10;
  const avgEy            = Math.round(sumEy / n);

  // Capacity factor: yield / (capacity × 8760h) × 100
  const avgCF = totalCapacityKWp > 0
    ? (totalYieldMWh / (totalCapacityKWp * 8.76)) * 100
    : 0;

  // Land use breakdown sorted by capacity descending
  const landUseBreakdown = Array.from(luMap.entries())
    .map(([landUse, { count, capacityKWp }]) => ({
      landUse,
      count,
      capacityMWp: Math.round(capacityKWp / 1_000 * 10) / 10,
    }))
    .sort((a, b) => b.capacityMWp - a.capacityMWp);

  // Top constraint heuristic
  let topConstraint: string;
  if (cellsInside.length === 0) {
    topConstraint = 'No grid cells in drawn area';
  } else if (avgGridDistKm > 25) {
    topConstraint = `Grid distance (avg ${avgGridDistKm} km to nearest line)`;
  } else if (goCells.length === 0 && cellsInside.length > 0) {
    topConstraint = 'Low composite score — check land/flood/grid constraints';
  } else {
    const topLu = landUseBreakdown[0]?.landUse ?? '';
    if (topLu === 'paddy') topConstraint = 'Food security restriction (paddy land conversion)';
    else if (topLu === 'forest') topConstraint = 'Protected forest — not developable';
    else if (topLu === 'urban') topConstraint = 'Urban / residential — fragmented ownership';
    else topConstraint = `Grid connection (avg ${avgGridDistKm} km)`;
  }

  return {
    drawnAreaKm2: Math.round(drawnAreaKm2 * 10) / 10,
    cellsInside,
    suitableCells,
    goCells,
    totalCapacityMWp: Math.round(totalCapacityMWp * 10) / 10,
    groundMountMWp:   Math.round(groundMountKWp  / 1_000 * 10) / 10,
    fpvMWp:           Math.round(fpvKWp          / 1_000 * 10) / 10,
    rooftopMWp:       Math.round(rooftopKWp      / 1_000 * 10) / 10,
    totalYieldGWhPerYear: Math.round(totalYieldGWh * 10) / 10,
    avgCapacityFactor:    Math.round(avgCF * 10) / 10,
    avgPvgisEyKWhPerKWp: avgEy,
    avgScore,
    avgGridDistKm,
    landUseBreakdown,
    topConstraint,
  };
}
