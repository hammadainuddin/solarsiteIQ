import type { LandUseClass, RiskLevel } from '../types';

// ── Solar Resource (GHI-based) ────────────────────────────────────────────────
export function scoreGHI(ghi: number): number {
  if (ghi >= 5.4) return 100;
  if (ghi >= 5.2) return 85 + ((ghi - 5.2) / 0.2) * 15;
  if (ghi >= 5.0) return 65 + ((ghi - 5.0) / 0.2) * 20;
  if (ghi >= 4.8) return 45 + ((ghi - 4.8) / 0.2) * 20;
  if (ghi >= 4.5) return 20 + ((ghi - 4.5) / 0.3) * 25;
  return 10;
}

// ── Grid Interconnection ──────────────────────────────────────────────────────
export function scoreGridProximity(distKm: number, voltageKV: number): number {
  // Base score from distance
  let distScore: number;
  if (distKm <= 2)   distScore = 100;
  else if (distKm <= 5)  distScore = 90 - ((distKm - 2)  / 3)  * 20;
  else if (distKm <= 15) distScore = 70 - ((distKm - 5)  / 10) * 25;
  else if (distKm <= 30) distScore = 45 - ((distKm - 15) / 15) * 20;
  else if (distKm <= 60) distScore = 25 - ((distKm - 30) / 30) * 20;
  else distScore = 5;

  // Voltage bonus: 275/500 kV substations are significantly more valuable
  let voltBonus = 0;
  if (voltageKV >= 275) voltBonus = 15;
  else if (voltageKV >= 132) voltBonus = 5;

  return Math.min(100, Math.round(distScore + voltBonus));
}

// ── Land Suitability ─────────────────────────────────────────────────────────
const LAND_USE_SCORES: Record<LandUseClass, number> = {
  idle_agri:  95,
  rubber:     75,
  mixed_agri: 65,
  oil_palm:   55,
  industrial: 60, // rooftop — landlord agreement needed
  commercial: 55, // rooftop — complex ownership/tenancy
  paddy:      35, // food security constraint, conversion requires approval
  water:      45, // FPV viable but extra permitting
  urban:      10,
  kampung:    20, // rural village — lower density than proper urban, more surrounding open land
  infrastructure: 5, // occupied utility facility footprint — very limited availability
  forest:      0, // protected / not viable
  river:       0, // flowing water — not developable
  unknown:    50,
};

export function scoreLandUse(landUse: LandUseClass, isProtected: boolean): number {
  if (isProtected) return 0;
  return LAND_USE_SCORES[landUse] ?? 50;
}

// ── Flood / Climate Risk ──────────────────────────────────────────────────────
const FLOOD_SCORES: Record<RiskLevel, number> = {
  low:     95,
  medium:  65,
  high:    30,
  extreme:  5,
};

export function scoreFloodRisk(risk: RiskLevel): number {
  return FLOOD_SCORES[risk] ?? 50;
}

// ── Road Access ───────────────────────────────────────────────────────────────
export function scoreRoadAccess(distKm: number): number {
  if (distKm <= 1)   return 100;
  if (distKm <= 3)   return 90 - ((distKm - 1) / 2) * 15;
  if (distKm <= 8)   return 75 - ((distKm - 3) / 5) * 25;
  if (distKm <= 20)  return 50 - ((distKm - 8) / 12) * 25;
  if (distKm <= 40)  return 25 - ((distKm - 20) / 20) * 15;
  return 10;
}

// ── Environmental & Social ────────────────────────────────────────────────────
export function scoreEnvSocial(isProtected: boolean, landUse: LandUseClass, floodRisk: RiskLevel): number {
  if (isProtected) return 0;
  let score = 80;
  if (landUse === 'forest')  score = 0;
  if (landUse === 'river')   score = 0;
  if (landUse === 'water')   score -= 15;
  if (landUse === 'paddy')   score -= 20; // community / food-security sensitivity
  if (floodRisk === 'high')    score -= 10;
  if (floodRisk === 'extreme') score -= 25;
  return Math.max(0, score);
}

// ── Weighted Composite ────────────────────────────────────────────────────────
// Land suitability (land + availability, both land-use-derived) is the
// dominant criterion at 50% combined weight — tuned so the northern region's
// 'Go' tier total stays comfortably under MyRER's Peninsular Malaysia solar
// potential ceiling (<150 GW; northern region target <80 GW). Previously land
// use was a minority factor (30% combined) and irradiance/grid/road access
// could push marginal land (paddy, urban fringe) into 'Go' on infrastructure
// merits alone — verified via simulation this let ~1,780 GW of gross
// theoretical land (100% usable-fraction ground-mount assumption) collapse
// into a still-unrealistic multi-hundred-GW 'Go' tier.
export const DIMENSION_WEIGHTS = {
  solar:        0.20,
  grid:         0.15,
  land:         0.35,
  availability: 0.15,
  climate:      0.07,
  road:         0.05,
  envSocial:    0.03,
} as const;

// Bump whenever DIMENSION_WEIGHTS, GO_THRESHOLD, or any scoring function
// changes — it feeds the composed tile-cache key in tilePipeline.ts, so stale
// pre-scored tiles in IndexedDB are discarded instead of silently served with
// outdated scores.
export const SCORING_CONFIG_VERSION = 'scoring-v3'; // v3 = Langkawi exclusion + Suitable middle tier

export interface RawScores {
  solar: number;
  grid: number;
  land: number;
  availability: number;
  climate: number;
  road: number;
  envSocial: number;
}

export function compositeScore(s: RawScores): number {
  return Math.round(
    s.solar        * DIMENSION_WEIGHTS.solar        +
    s.grid         * DIMENSION_WEIGHTS.grid         +
    s.land         * DIMENSION_WEIGHTS.land         +
    s.availability * DIMENSION_WEIGHTS.availability +
    s.climate      * DIMENSION_WEIGHTS.climate      +
    s.road         * DIMENSION_WEIGHTS.road         +
    s.envSocial    * DIMENSION_WEIGHTS.envSocial
  );
}

// ── Capacity-budgeted Go threshold ───────────────────────────────────────────
// MyRER puts Peninsular Malaysia's total solar potential under 150 GW; the
// northern region's 'Go' tier is targeted at <80 GW of that. A FIXED score
// threshold cannot reliably deliver this: the composite distribution shifts
// whenever any input dataset changes (denser OSM transmission lines raise
// grid scores, OSM landuse coverage reclassifies cells, etc.), and a 1-point
// threshold move can swing selected capacity by hundreds of GW near the
// distribution's bulk. So instead of a hardcoded cutoff, the pipeline
// CALIBRATES the Go threshold against the actual scored tiles: the smallest
// threshold (never below GO_THRESHOLD_FLOOR) whose selected capacity fits the
// budget. Selection is therefore ≤ budget by construction, always.

export const GO_CAPACITY_BUDGET_GW = 80;
// A second, wider tier sits between Go and Conditional Go: 'Suitable'. It
// extends the selection until CUMULATIVE capacity (Go + Suitable) reaches this
// ceiling — targeted at the 100–150 GW band, i.e. up to MyRER's <150 GW
// peninsula-wide potential. Same budget-calibration approach as Go, just a
// higher cumulative ceiling.
export const SUITABLE_CAPACITY_BUDGET_GW = 150;
// Floors from the original weight/threshold calibration — a bar never drops
// below its floor even if the budget would allow it.
export const GO_THRESHOLD_FLOOR = 71;
export const SUITABLE_THRESHOLD_FLOOR = 55;
export const CONDITIONAL_GO_THRESHOLD = 45;

export type TileVerdict = 'Go' | 'Suitable' | 'Conditional Go' | 'Avoid';

let _goThreshold = GO_THRESHOLD_FLOOR;
let _suitableThreshold = SUITABLE_THRESHOLD_FLOOR;

/** Current Go cutoff — calibrated by the tile pipeline; floor until then. */
export function getGoThreshold(): number {
  return _goThreshold;
}

/** Current Suitable (middle-tier) cutoff — calibrated by the tile pipeline. */
export function getSuitableThreshold(): number {
  return _suitableThreshold;
}

/**
 * Calibrate both tier cutoffs against the actual scored tiles so each tier's
 * cumulative capacity stays within its budget:
 *   Go        — cumulative ≤ GO_CAPACITY_BUDGET_GW
 *   Suitable  — cumulative (Go + Suitable) ≤ SUITABLE_CAPACITY_BUDGET_GW
 * Called by the tile pipeline whenever a fresh (or cache-restored) tile set is
 * available. Selection is therefore ≤ budget by construction, regardless of how
 * the input datasets evolve.
 */
export function calibrateThresholds(
  tiles: ReadonlyArray<{ scores: { composite: number }; attributes: { estimatedCapacityMW: number } }>,
): { goThreshold: number; suitableThreshold: number } {
  // capacityByScore[s] = total MW of tiles whose composite === s
  const capacityByScore = new Array<number>(101).fill(0);
  for (const t of tiles) {
    const s = Math.max(0, Math.min(100, t.scores.composite));
    capacityByScore[s] += t.attributes.estimatedCapacityMW;
  }

  let cumulative = 0;

  // Go tier: walk down from 100, admit bands until the next would exceed budget.
  const goBudgetMW = GO_CAPACITY_BUDGET_GW * 1000;
  let goThreshold = 101; // nothing qualifies if even score-100 tiles overflow the budget
  for (let s = 100; s >= GO_THRESHOLD_FLOOR; s--) {
    if (cumulative + capacityByScore[s] > goBudgetMW) break;
    cumulative += capacityByScore[s];
    goThreshold = s;
  }

  // Suitable tier: continue accumulating from just below the Go cutoff, against
  // the higher cumulative ceiling. Never rises above the Go cutoff, never drops
  // below its floor.
  const suitableBudgetMW = SUITABLE_CAPACITY_BUDGET_GW * 1000;
  let suitableThreshold = goThreshold; // default: no Suitable band if none fits
  for (let s = goThreshold - 1; s >= SUITABLE_THRESHOLD_FLOOR; s--) {
    if (cumulative + capacityByScore[s] > suitableBudgetMW) break;
    cumulative += capacityByScore[s];
    suitableThreshold = s;
  }

  _goThreshold = goThreshold;
  _suitableThreshold = suitableThreshold;
  console.info(`Thresholds calibrated — Go ≥${goThreshold}, Suitable ≥${suitableThreshold} (cumulative ${(cumulative / 1000).toFixed(1)} GW, budgets ${GO_CAPACITY_BUDGET_GW}/${SUITABLE_CAPACITY_BUDGET_GW} GW)`);
  return { goThreshold, suitableThreshold };
}

export function scoreToVerdict(composite: number): TileVerdict {
  if (composite >= _goThreshold) return 'Go';
  if (composite >= _suitableThreshold) return 'Suitable';
  if (composite >= CONDITIONAL_GO_THRESHOLD) return 'Conditional Go';
  return 'Avoid';
}

export function scoreToColor(score: number, opacity = 0.65): string {
  if (score >= _goThreshold) return `rgba(34, 197, 94,  ${opacity})`;   // green-500 — Go
  if (score >= _suitableThreshold) return `rgba(132, 204, 22, ${opacity})`; // lime-500 — Suitable
  if (score >= CONDITIONAL_GO_THRESHOLD) return `rgba(251, 191, 36, ${opacity})`; // amber-400 — Conditional
  return                  `rgba(239, 68,  68,  ${opacity})`; // red-500 — Avoid
}
