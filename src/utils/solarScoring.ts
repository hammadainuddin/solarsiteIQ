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
export const SCORING_CONFIG_VERSION = 'scoring-v2';

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

// 71 (not the more obvious round 70) — calibrated together with the
// land-dominant DIMENSION_WEIGHTS above via simulation against the real
// land-use/PVGIS/grid-distance data so the 'Go' tier total lands under the
// northern-region 80 GW target (MyRER: Peninsular Malaysia solar potential
// <150 GW). Shared by every place that needs to know what counts as 'Go' —
// do not hardcode 70 elsewhere.
export const GO_THRESHOLD = 71;
export const CONDITIONAL_GO_THRESHOLD = 45;

export function scoreToVerdict(composite: number): 'Go' | 'Conditional Go' | 'Avoid' {
  if (composite >= GO_THRESHOLD) return 'Go';
  if (composite >= CONDITIONAL_GO_THRESHOLD) return 'Conditional Go';
  return 'Avoid';
}

export function scoreToColor(score: number, opacity = 0.65): string {
  if (score >= GO_THRESHOLD) return `rgba(34, 197, 94,  ${opacity})`; // green-500
  if (score >= CONDITIONAL_GO_THRESHOLD) return `rgba(251, 191, 36, ${opacity})`; // amber-400
  return                  `rgba(239, 68,  68,  ${opacity})`; // red-500
}
