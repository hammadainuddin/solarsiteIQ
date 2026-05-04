import type {
  CandidateSite,
  DataCentre,
  SiteScores,
  ScoredCandidateSite,
  ScoringWeights,
  ZoningStatus,
  RiskLevel,
} from '../types';

// ─── Weights ─────────────────────────────────────────────────────────────────

export const DEFAULT_WEIGHTS: ScoringWeights = {
  power:          0.30,
  competition:    0.20,
  utilities:      0.20,
  landRegulatory: 0.15,
  marketAccess:   0.15,
};

// ─── Supplementary types returned by the engine ──────────────────────────────

export interface PowerBreakdown {
  distanceScore:      number;
  capacityScore:      number;
  distanceKm:         number;
  capacityMVA:        number;
}

export interface CompetitionBreakdown {
  operationalMWIn10km: number;
  pipelineMWIn30km:    number;
  operationalCountIn10km: number;
  pipelineCountIn30km: number;
  penalty:             number;
}

export interface UtilitiesBreakdown {
  fibreScore:   number;
  carrierScore: number;
  waterScore:   number;
  fibreKm:      number;
  carrierCount: number;
  waterKm:      number;
}

export interface LandRegulatoryBreakdown {
  zoningScore:   number;
  floodScore:    number;
  seismicScore:  number;
  zoningStatus:  ZoningStatus;
  floodRisk:     RiskLevel;
  seismicRisk:   RiskLevel;
}

export interface MarketAccessBreakdown {
  cityScore:    number;
  cityKey:      string;
  matchedEntry: string;
}

export interface ScoringBreakdown {
  power:          PowerBreakdown;
  competition:    CompetitionBreakdown;
  utilities:      UtilitiesBreakdown;
  landRegulatory: LandRegulatoryBreakdown;
  marketAccess:   MarketAccessBreakdown;
}

/**
 * Returned by calculateSiteScore — extends SiteScores with full transparency.
 * Assignable to SiteScores wherever that interface is required.
 */
export interface ScoringResult extends SiteScores {
  /** 'high' = all key fields present; 'medium' = 1–2 gaps; 'low' = 3+ gaps */
  confidence: 'high' | 'medium' | 'low';
  /** Names of CandidateSite fields that were missing or zero */
  dataGaps: string[];
  /** Per-dimension sub-scores and the raw inputs used */
  breakdown: ScoringBreakdown;
}

// ─── Haversine ────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two lat/lng points, in kilometres. */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function avg(...values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ─── 1. POWER (30%) ──────────────────────────────────────────────────────────
//
// distanceScore:  <1km=100  1–3km=85  3–5km=70  5–10km=50  ≥10km=25
// capacityScore: >100MVA=100  50–100=80  20–50=60  <20=30
// power = round(distanceScore×0.6 + capacityScore×0.4)

function scorePower(site: CandidateSite): PowerBreakdown & { score: number } {
  const km  = site.distanceToSubstationKm;
  const mva = site.substationCapacityMVA;

  const distanceScore =
    km  <  1 ? 100 :
    km  <  3 ?  85 :
    km  <  5 ?  70 :
    km  < 10 ?  50 : 25;

  const capacityScore =
    mva > 100 ? 100 :
    mva >=  50 ?  80 :
    mva >=  20 ?  60 : 30;

  const score = Math.round(distanceScore * 0.6 + capacityScore * 0.4);

  return { score, distanceScore, capacityScore, distanceKm: km, capacityMVA: mva };
}

// ─── 2. COMPETITION (20%) ─────────────────────────────────────────────────────
//
// Higher existing MW nearby = more competition = lower score (inverse metric).
//
// nearMW     = sum capacityMW of OPERATIONAL DCs within 10 km
// pipelineMW = sum capacityMW of non-operational DCs within 30 km
// score      = max(0, 100 − (nearMW/500 × 60) − (pipelineMW/1000 × 40))

function scoreCompetition(
  site: CandidateSite,
  allDCs: DataCentre[],
): CompetitionBreakdown & { score: number } {
  const { lat, lng } = site.coordinates;

  let operationalMWIn10km  = 0;
  let pipelineMWIn30km     = 0;
  let operationalCountIn10km = 0;
  let pipelineCountIn30km  = 0;

  for (const dc of allDCs) {
    const distKm = haversineDistance(lat, lng, dc.coordinates.lat, dc.coordinates.lng);

    if (dc.status === 'operational' && distKm <= 10) {
      operationalMWIn10km  += dc.capacityMW;
      operationalCountIn10km++;
    } else if (dc.status !== 'operational' && distKm <= 30) {
      pipelineMWIn30km += dc.capacityMW;
      pipelineCountIn30km++;
    }
  }

  const penalty = (operationalMWIn10km / 500) * 60 + (pipelineMWIn30km / 1000) * 40;
  const score   = clamp(Math.round(100 - penalty));

  return {
    score,
    operationalMWIn10km,
    pipelineMWIn30km,
    operationalCountIn10km,
    pipelineCountIn30km,
    penalty: Math.round(penalty * 10) / 10,
  };
}

// ─── 3. UTILITIES (20%) ──────────────────────────────────────────────────────
//
// fibreScore:  <0.5km=100  0.5–2km=80  2–5km=60  ≥5km=30
// carrierScore: ≥4=100  3=80  2=60  1=30  0=10 (data gap)
// waterScore:  <2km=100  2–5km=80  ≥5km=50
// utilities = round(avg(fibre, carrier, water))

function scoreUtilities(site: CandidateSite): UtilitiesBreakdown & { score: number } {
  const fKm    = site.distanceToFibreKm;
  const count  = site.fibreCarrierCount;
  const wKm    = site.distanceToWaterKm;

  const fibreScore =
    fKm  < 0.5 ? 100 :
    fKm  <   2 ?  80 :
    fKm  <   5 ?  60 : 30;

  const carrierScore =
    count >= 4 ? 100 :
    count === 3 ?  80 :
    count === 2 ?  60 :
    count === 1 ?  30 : 10;

  const waterScore =
    wKm <  2 ? 100 :
    wKm <  5 ?  80 : 50;

  const score = Math.round(avg(fibreScore, carrierScore, waterScore));

  return {
    score,
    fibreScore, carrierScore, waterScore,
    fibreKm: fKm, carrierCount: count, waterKm: wKm,
  };
}

// ─── 4. LAND & REGULATORY (15%) ──────────────────────────────────────────────
//
// zoningScore:
//   approved_(industrial|tech_park|sez) → 100
//   pending_rezoning                    → 70
//   residential_conversion              → 40
//   agricultural_conversion             → 40
//   unzoned                             → 20
//   restricted                          → 20
//
// floodScore:   low=100  medium=70  high=20  extreme=0
// seismicScore: low=100  medium=80  high=50  extreme=20
// landRegulatory = round(avg(zoning, flood, seismic))

const ZONING_SCORE: Record<ZoningStatus, number> = {
  approved_industrial:     100,
  approved_tech_park:      100,
  approved_sez:            100,
  pending_rezoning:         70,
  residential_conversion:   40,
  agricultural_conversion:  40,
  unzoned:                  20,
  restricted:               20,
};

const FLOOD_SCORE: Record<RiskLevel, number> = {
  low:     100,
  medium:   70,
  high:     20,
  extreme:   0,
};

const SEISMIC_SCORE: Record<RiskLevel, number> = {
  low:     100,
  medium:   80,
  high:     50,
  extreme:  20,
};

function scoreLandRegulatory(
  site: CandidateSite,
): LandRegulatoryBreakdown & { score: number } {
  const zoningScore  = ZONING_SCORE[site.zoningStatus]  ?? 20;
  const floodScore   = FLOOD_SCORE[site.floodRisk]       ?? 20;
  const seismicScore = SEISMIC_SCORE[site.seismicRisk]   ?? 50;

  const score = Math.round(avg(zoningScore, floodScore, seismicScore));

  return {
    score,
    zoningScore, floodScore, seismicScore,
    zoningStatus: site.zoningStatus,
    floodRisk:    site.floodRisk,
    seismicRisk:  site.seismicRisk,
  };
}

// ─── 5. MARKET ACCESS (15%) ──────────────────────────────────────────────────
//
// Hard-coded city tier scores; matched case-insensitively against site.city.
// JB=90  KL=80  Singapore=95  Jakarta=75  Bangkok=70  Manila=65  HCMC=65

interface MarketEntry {
  score:    number;
  label:    string;
  patterns: RegExp;
}

const MARKET_TIERS: MarketEntry[] = [
  {
    label:    'Singapore',
    score:     95,
    patterns: /singapore/i,
  },
  {
    label:    'Johor Bahru',
    score:     90,
    patterns: /johor|iskandar|nusajaya|kulai|senai|sedenak|tebrau|plentong|skudai|pasir gudang/i,
  },
  {
    label:    'Kuala Lumpur',
    score:     80,
    patterns: /kuala lumpur|cyberjaya|petaling|putrajaya|shah alam|subang|klang|cheras|ampang/i,
  },
  {
    label:    'Jakarta',
    score:     75,
    patterns: /jakarta|bekasi|karawang|tangerang|cibitung|cikarang|depok|bogor/i,
  },
  {
    label:    'Bangkok',
    score:     70,
    patterns: /bangkok|nonthaburi|pathum thani|samut prakan|chonburi|bang na/i,
  },
  {
    label:    'Manila',
    score:     65,
    patterns: /manila|makati|taguig|quezon|pasay|paran[aã]que|bgc|clark|pampanga/i,
  },
  {
    label:    'Ho Chi Minh City',
    score:     65,
    patterns: /ho chi minh|hcmc|saigon|binh duong|thu duc|dong nai/i,
  },
  {
    label:    'Penang',
    score:     72,
    patterns: /penang|george town|bayan lepas/i,
  },
  {
    label:    'Kuala Lumpur (North)',
    score:     74,
    patterns: /rawang|selayang|gombak|kepong/i,
  },
];

const MARKET_ACCESS_FALLBACK = 60;

function scoreMarketAccess(
  site: CandidateSite,
): MarketAccessBreakdown & { score: number } {
  const haystack = `${site.city} ${site.country}`;

  for (const entry of MARKET_TIERS) {
    if (entry.patterns.test(haystack)) {
      return {
        score:        entry.score,
        cityScore:    entry.score,
        cityKey:      site.city,
        matchedEntry: entry.label,
      };
    }
  }

  return {
    score:        MARKET_ACCESS_FALLBACK,
    cityScore:    MARKET_ACCESS_FALLBACK,
    cityKey:      site.city,
    matchedEntry: 'Unknown (default)',
  };
}

// ─── Data-gap detector ────────────────────────────────────────────────────────

function detectDataGaps(site: CandidateSite): string[] {
  const gaps: string[] = [];

  if (site.substationCapacityMVA === 0)
    gaps.push('substationCapacityMVA');

  if (site.fibreCarrierCount === 0)
    gaps.push('fibreCarrierCount');

  if (site.distanceToSubstationKm === 0)
    gaps.push('distanceToSubstationKm (check — exactly on substation?)');

  if (site.distanceToFibreKm === 0)
    gaps.push('distanceToFibreKm (check — exactly on fibre node?)');

  if (site.distanceToWaterKm === 0)
    gaps.push('distanceToWaterKm');

  if (site.askingPriceUSD === 0)
    gaps.push('askingPriceUSD');

  return gaps;
}

function confidenceLevel(gaps: string[]): 'high' | 'medium' | 'low' {
  if (gaps.length === 0) return 'high';
  if (gaps.length <= 2)  return 'medium';
  return 'low';
}

// ─── Main: calculateSiteScore ─────────────────────────────────────────────────

/**
 * Score a candidate site across five weighted dimensions using the DC_DATABASE
 * as the competitive context.
 *
 * Returns a ScoringResult which satisfies SiteScores and additionally carries
 * the per-dimension breakdown and a data-completeness confidence flag.
 *
 * rank is set to 0 — populate it after sorting a list with rankCandidateSites().
 */
export function calculateSiteScore(
  site:   CandidateSite,
  allDCs: DataCentre[],
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoringResult {
  const power          = scorePower(site);
  const competition    = scoreCompetition(site, allDCs);
  const utilities      = scoreUtilities(site);
  const landRegulatory = scoreLandRegulatory(site);
  const marketAccess   = scoreMarketAccess(site);

  const total = clamp(Math.round(
    power.score          * weights.power          +
    competition.score    * weights.competition    +
    utilities.score      * weights.utilities      +
    landRegulatory.score * weights.landRegulatory +
    marketAccess.score   * weights.marketAccess,
  ));

  const dataGaps = detectDataGaps(site);

  return {
    // SiteScores fields
    power:          power.score,
    competition:    competition.score,
    utilities:      utilities.score,
    landRegulatory: landRegulatory.score,
    marketAccess:   marketAccess.score,
    total,
    rank: 0,

    // Extended fields
    confidence: confidenceLevel(dataGaps),
    dataGaps,
    breakdown: {
      power:          { distanceScore: power.distanceScore, capacityScore: power.capacityScore, distanceKm: power.distanceKm, capacityMVA: power.capacityMVA },
      competition:    { operationalMWIn10km: competition.operationalMWIn10km, pipelineMWIn30km: competition.pipelineMWIn30km, operationalCountIn10km: competition.operationalCountIn10km, pipelineCountIn30km: competition.pipelineCountIn30km, penalty: competition.penalty },
      utilities:      { fibreScore: utilities.fibreScore, carrierScore: utilities.carrierScore, waterScore: utilities.waterScore, fibreKm: utilities.fibreKm, carrierCount: utilities.carrierCount, waterKm: utilities.waterKm },
      landRegulatory: { zoningScore: landRegulatory.zoningScore, floodScore: landRegulatory.floodScore, seismicScore: landRegulatory.seismicScore, zoningStatus: landRegulatory.zoningStatus, floodRisk: landRegulatory.floodRisk, seismicRisk: landRegulatory.seismicRisk },
      marketAccess:   { cityScore: marketAccess.cityScore, cityKey: marketAccess.cityKey, matchedEntry: marketAccess.matchedEntry },
    },
  };
}

// ─── rankCandidateSites ───────────────────────────────────────────────────────

/**
 * Score and rank an array of candidate sites.
 * Returns a sorted (descending total score) array with rank populated.
 */
export function rankCandidateSites(
  sites:   CandidateSite[],
  allDCs:  DataCentre[],
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoredCandidateSite[] {
  const scored = sites.map((s): ScoredCandidateSite => {
    const result = calculateSiteScore(s, allDCs, weights);
    return { ...s, scores: result };
  });

  scored.sort((a, b) => b.scores.total - a.scores.total);

  return scored.map((s, i) => ({
    ...s,
    scores: { ...s.scores, rank: i + 1 },
  }));
}

// ─── Weight validation helper ─────────────────────────────────────────────────

/** Returns true when the five weights sum to within 0.005 of 1.0. */
export function weightsAreValid(w: ScoringWeights): boolean {
  const sum = w.power + w.competition + w.utilities + w.landRegulatory + w.marketAccess;
  return Math.abs(sum - 1) < 0.005;
}

/** Normalises weights so they sum exactly to 1.0. */
export function normaliseWeights(w: ScoringWeights): ScoringWeights {
  const sum = w.power + w.competition + w.utilities + w.landRegulatory + w.marketAccess;
  if (sum === 0) return { ...DEFAULT_WEIGHTS };
  const f = 1 / sum;
  return {
    power:          Math.round(w.power          * f * 1000) / 1000,
    competition:    Math.round(w.competition    * f * 1000) / 1000,
    utilities:      Math.round(w.utilities      * f * 1000) / 1000,
    landRegulatory: Math.round(w.landRegulatory * f * 1000) / 1000,
    marketAccess:   Math.round(w.marketAccess   * f * 1000) / 1000,
  };
}

// ─── Score band labels ────────────────────────────────────────────────────────

export type ScoreBand = 'Exceptional' | 'Strong' | 'Moderate' | 'Weak' | 'Poor';

export function scoreBand(total: number): ScoreBand {
  if (total >= 85) return 'Exceptional';
  if (total >= 70) return 'Strong';
  if (total >= 55) return 'Moderate';
  if (total >= 40) return 'Weak';
  return 'Poor';
}

export const SCORE_BAND_COLOR: Record<ScoreBand, string> = {
  Exceptional: '#10B981',
  Strong:      '#34D399',
  Moderate:    '#F59E0B',
  Weak:        '#F97316',
  Poor:        '#EF4444',
};

// ─── Legacy shim — kept for ScorecardView backward compat ────────────────────

/** @deprecated use calculateSiteScore + rankCandidateSites */
export { rankCandidateSites as rankSites };
