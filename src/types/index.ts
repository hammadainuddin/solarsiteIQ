// ─── Primitives & Enumerations ───────────────────────────────────────────────

export interface Coordinates {
  lat: number;
  lng: number;
}

export type Country = 'MY' | 'SG' | 'ID' | 'TH' | 'VN' | 'PH' | 'MM' | 'KH' | 'LA' | 'BN';

export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';

export type WaterAvailability = 'abundant' | 'adequate' | 'constrained' | 'critical';

export type ZoningStatus =
  | 'approved_industrial'
  | 'approved_tech_park'
  | 'approved_sez'
  | 'pending_rezoning'
  | 'residential_conversion'
  | 'agricultural_conversion'
  | 'unzoned'
  | 'restricted';

export type WaterSourceType =
  | 'municipal_piped'
  | 'river_abstraction'
  | 'reservoir'
  | 'groundwater_bore'
  | 'recycled_industrial'
  | 'rainwater_harvesting'
  | 'desalination';

// ─── 1. DataCentre ───────────────────────────────────────────────────────────

export type DCStatus = 'operational' | 'construction' | 'announced' | 'rumoured';

export type TierRating = 'I' | 'II' | 'III' | 'IV';

export type OperatorType = 'colo' | 'hyperscale' | 'enterprise' | 'government' | 'carrier_neutral';

export type SourceReliability = 'confirmed' | 'inferred' | 'rumoured';

export interface DataCentre {
  id: string;
  name: string;
  operator: string;
  country: Country;
  city: string;
  coordinates: Coordinates;

  // Status & timeline
  status: DCStatus;
  /** ISO date string or year string e.g. "2026-Q3" */
  expectedCOD: string;
  sourceReliability: SourceReliability;

  // Capacity
  capacityMW: number;
  itLoadMW: number;
  pue: number;
  tierRating: TierRating;
  operatorType: OperatorType;

  // Tenants & commercial
  hyperscalerTenants: string[];
  /** Estimated occupancy 0–1 */
  occupancyRate?: number;

  // Infrastructure
  powerSource: string;
  /** Total gross land footprint */
  landAreaHa: number;
  /** Gross floor area, m² */
  grossFloorAreaM2?: number;

  // Tags & notes
  tags?: string[];
  notes?: string;

  // Optional deep-dossier extensions (seeded for select DCs)
  plantLayout?: DCPlantLayout;
  intel?: DCIntelligence;
}

// ─── DC Intelligence (history, ownership, evidence) ──────────────────────────

export type SourceType =
  | 'press_release'
  | 'regulatory'
  | 'company_filing'
  | 'news'
  | 'analyst_report'
  | 'site_visit';

export interface EvidenceItem {
  claim: string;
  source: string;
  url?: string;
  /** ISO date or quarter string */
  date: string;
  type: SourceType;
  confidence: 'high' | 'medium' | 'low';
}

export interface DevelopmentMilestone {
  /** ISO date or quarter string e.g. "2025-Q3" */
  date: string;
  title: string;
  detail?: string;
  status: 'completed' | 'in_progress' | 'planned';
}

export interface OwnershipEntity {
  entity: string;
  sinceYear: number;
  /** Equity stake 0–100 */
  stake?: number;
}

export interface OwnershipEvent {
  entity: string;
  from: number;
  to: number;
  event: string;
}

export interface OwnershipChain {
  current: OwnershipEntity[];
  history?: OwnershipEvent[];
}

export interface DCIntelligence {
  /** Short narrative (2–3 paragraphs) */
  history: string;
  timeline: DevelopmentMilestone[];
  ownership: OwnershipChain;
  evidence: EvidenceItem[];
  keyContacts?: { name: string; role: string }[];
}

// ─── DC Plant Layout (animated power-flow view) ──────────────────────────────

export type DCBlockStatus = 'live' | 'commissioning' | 'under_construction' | 'planned';

export interface DCBlock {
  id: string;
  name: string;
  capacityMW: number;
  status: DCBlockStatus;
  commissionDate?: string;
  gridCol: number;
  gridRow: number;
  /** 0–100, drives flow animation speed for live blocks */
  utilisationPct?: number;
}

export interface DCSubstation {
  id: string;
  name: string;
  /** Substation capacity, MW */
  mw: number;
  gridCol: number;
  gridRow: number;
}

export interface DCPlantLayout {
  blocks: DCBlock[];
  substations: DCSubstation[];
  gridSize: { cols: number; rows: number };
}

// ─── Pin drop ────────────────────────────────────────────────────────────────

export interface PinLocation {
  lat: number;
  lng: number;
  droppedAt: number;
}

// ─── Workflows ───────────────────────────────────────────────────────────────

export type WorkflowType =
  | 'power'
  | 'carbon'
  | 'load'
  | 'connectivity'
  | 'environment'
  | 'suitability';

export interface WorkflowResult {
  type: WorkflowType;
  score: number;
  verdict: 'Go' | 'Conditional Go' | 'Avoid';
  metrics: Record<string, string>;
  topFindings: string[];
  keyRisk?: string;
  summary?: string;
}

// ─── 2. CandidateSite ────────────────────────────────────────────────────────

export type CandidateSiteStatus = 'available' | 'under_review' | 'shortlisted' | 'loi_signed' | 'rejected';

export interface CandidateSite {
  id: string;
  name: string;
  country: Country;
  city: string;
  coordinates: Coordinates;
  status: CandidateSiteStatus;

  // Land
  landAreaHa: number;
  /** Total asking price in USD */
  askingPriceUSD: number;
  zoningStatus: ZoningStatus;

  // Risk
  floodRisk: RiskLevel;
  seismicRisk: RiskLevel;
  politicalRisk: RiskLevel;

  // Power
  distanceToSubstationKm: number;
  /** Committed or available capacity at nearest substation */
  substationCapacityMVA: number;
  /** Voltage level of nearest grid connection point */
  gridVoltageKV?: number;
  /** Whether grid connection is dedicated or shared */
  dedicatedGridConnection?: boolean;

  // Connectivity
  distanceToFibreKm: number;
  fibreCarrierCount: number;
  /** Distance to nearest internet exchange, km */
  distanceToIXKm?: number;
  /** Distance to nearest international airport, km */
  distanceToAirportKm?: number;

  // Water & cooling
  distanceToWaterKm: number;
  waterSourceType: WaterSourceType;
  waterAvailability: WaterAvailability;
  /** Max sustainable daily abstraction, m³/day */
  waterAbstractionLimitM3Day?: number;

  // Financial snapshot
  /** Estimated total development capex in USD millions */
  estimatedCapexUSDM?: number;
  /** Estimated annual opex in USD millions */
  estimatedAnnualOpexUSDM?: number;

  // Auto-calculated — populated by scoring engine
  scores: SiteScores;

  tags?: string[];
  notes: string;
  /** ISO date string when site was added to the database */
  createdAt?: string;
  /** Last updated ISO date */
  updatedAt?: string;
}

// ─── 3. SiteScores ───────────────────────────────────────────────────────────

export interface SiteScores {
  /** Grid availability, substation proximity & capacity: 0–100 */
  power: number;
  /** Proximity to existing DCs; market saturation penalty: 0–100 */
  competition: number;
  /** Fibre, water, roads, airport access: 0–100 */
  utilities: number;
  /** Zoning, flood/seismic risk, political stability: 0–100 */
  landRegulatory: number;
  /** Airport proximity, city GDP, tech talent index: 0–100 */
  marketAccess: number;
  /** Weighted composite of the five dimensions: 0–100 */
  total: number;
  /** Position after sorting all shortlisted sites by total score */
  rank: number;
}

export interface ScoringWeights {
  power: number;
  competition: number;
  utilities: number;
  landRegulatory: number;
  marketAccess: number;
}

export interface ScoredCandidateSite extends CandidateSite {
  scores: SiteScores;
}

// ─── 4. Financial Model ──────────────────────────────────────────────────────

export interface FinancialInputs {
  // --- Site / physical parameters ---
  /** Contracted IT load at stabilisation, MW */
  itLoadMW: number;
  pue: number;
  /** Gross land area developed */
  landAreaHa: number;

  // --- Revenue drivers ---
  /** Average colocation rate per kW per month, USD */
  revenuePerKwPerMonthUSD: number;
  /** Long-run stabilised occupancy (0–1) */
  occupancyRate: number;
  /** Years from COD to reach stabilised occupancy */
  rampUpYears: number;

  // --- Capital structure ---
  /** All-in development capex, USD millions */
  capexUSDM: number;
  /** Equity as a fraction of total capex (0–1) */
  equityRatio: number;
  /** Annual cost of debt, % */
  debtCostPct: number;
  /** Loan tenor, years */
  debtTenorYears: number;

  // --- Operating costs ---
  /** Non-energy cash opex at stabilisation, USD millions per year */
  opexCashUSDM: number;
  /** Grid energy cost, USD per kWh */
  energyCostUSDPerKwh: number;
  /** Annual escalator on energy cost (0–1) */
  energyEscalatorPct: number;
  /** Annual escalator on revenue (0–1) */
  revenueEscalatorPct: number;
  /** Annual escalator on cash opex (0–1) */
  opexEscalatorPct: number;

  // --- Tax & accounting ---
  corporateTaxRatePct: number;
  /** Straight-line depreciation period for capex, years */
  depreciationYears: number;
  /** Investment tax credit or capital allowance, fraction of capex */
  investmentTaxCreditPct: number;

  // --- DCF parameters ---
  /** WACC / required rate of return (0–1) */
  discountRate: number;
  /** Total model horizon */
  projectLifeYears: number;
  /** Terminal value growth rate (Gordon Growth, 0–1) */
  terminalGrowthRatePct: number;
}

export interface YearlyCashFlow {
  year: number;
  /** Contracted IT capacity utilised, MW */
  itLoadMWActual: number;
  occupancyRate: number;
  revenue: number;
  energyCost: number;
  cashOpex: number;
  /** Total operating cost = energyCost + cashOpex */
  totalOpex: number;
  ebitda: number;
  ebitdaMarginPct: number;
  depreciation: number;
  ebit: number;
  interestExpense: number;
  ebt: number;
  taxExpense: number;
  netIncome: number;
  /** Free cash flow to equity after debt service */
  fcfe: number;
  /** Free cash flow to firm (unlevered) */
  fcff: number;
  /** Capex outflow (positive = spend) */
  capexOutflow: number;
  debtRepayment: number;
  cumulativeFcfe: number;
  /** Discounted FCFF for NPV build-up */
  pvFcff: number;
}

export interface FinancialOutputs {
  // --- P&L summary ---
  annualRevenueUSDM: number;
  annualTotalOpexUSDM: number;
  ebitdaUSDM: number;
  ebitdaMarginPct: number;
  /** After tax net income at stabilisation */
  netIncomeUSDM: number;

  // --- Returns ---
  npvUSDM: number;
  /** Equity IRR, % */
  equityIrrPct: number;
  /** Project (unlevered) IRR, % */
  projectIrrPct: number;
  /** Simple cash-on-cash payback period from COD, years */
  paybackYears: number;
  /** MOIC on equity */
  equityMultiple: number;

  // --- Debt ---
  debtUSDM: number;
  equityUSDM: number;
  annualDebtServiceUSDM: number;
  /** Stabilised DSCR */
  dscr: number;

  // --- Terminal value ---
  terminalValueUSDM: number;

  // --- Detailed table ---
  cashFlows: YearlyCashFlow[];
}

// ─── 5. MapLayer ─────────────────────────────────────────────────────────────

export type MapLayerType =
  | 'point'
  | 'line'
  | 'polygon'
  | 'heatmap'
  | 'cluster';

export type MapLayerId =
  | 'existing_datacentres'
  | 'candidate_sites'
  | 'power_substations'
  | 'transmission_lines'
  | 'fibre_routes'
  | 'submarine_cables'
  | 'flood_zones'
  | 'seismic_zones'
  | 'special_economic_zones'
  | 'administrative_boundaries'
  | 'water_sources'
  | 'water_treatment';

/** GeoJSON-compatible feature for a map layer data item */
export interface MapFeature<P = Record<string, unknown>> {
  id: string;
  coordinates: Coordinates;
  /** Optional secondary coordinates for line/polygon features */
  geometry?: Coordinates[];
  properties: P;
}

export interface MapLayer<P = Record<string, unknown>> {
  id: MapLayerId;
  name: string;
  type: MapLayerType;
  visible: boolean;
  /** Hex colour used for rendering */
  color: string;
  /** Opacity 0–1 */
  opacity?: number;
  /** Min zoom level at which this layer renders */
  minZoom?: number;
  /** Max zoom level at which this layer renders */
  maxZoom?: number;
  /** z-order for rendering stack */
  zIndex?: number;
  description?: string;
  data: MapFeature<P>[];
}

// ─── Legacy aliases (kept for backward compat with existing pages) ────────────

/** @deprecated Use CandidateSite */
export type DCSite = CandidateSite;

/** @deprecated Use CandidateSiteStatus */
export type SiteStatus = CandidateSiteStatus;

/** @deprecated Use FinancialInputs */
export type FinancialAssumptions = FinancialInputs;

/** @deprecated Use FinancialOutputs */
export type FinancialOutput = FinancialOutputs;

/** @deprecated Use ScoringWeights */
export type ScoringWeight = ScoringWeights;

/** @deprecated Use ScoredCandidateSite */
export interface ScoredSite extends CandidateSite {
  scores: SiteScores;
  rank: number;
}

// ─── Kept unchanged — used by existing components ────────────────────────────

export interface InfraLayer {
  id: MapLayerId;
  label: string;
  color: string;
  defaultVisible: boolean;
  description: string;
}

export interface MapMarker {
  id: string;
  coordinates: Coordinates;
  type: 'site' | 'substation' | 'fibre_pop' | 'existing_dc';
  label: string;
  metadata?: Record<string, string | number>;
}

// ─── Solar SiteIQ ─────────────────────────────────────────────────────────────

export type SolarWorkflowType =
  | 'solar_resource'
  | 'grid_interconnection'
  | 'land_suitability'
  | 'land_availability'
  | 'climate_risk'
  | 'road_access'
  | 'env_social'
  | 'site_suitability';

export interface SolarWorkflowResult {
  type: SolarWorkflowType;
  score: number;
  verdict: 'Go' | 'Conditional Go' | 'Avoid';
  metrics: Record<string, string>;
  topFindings: string[];
  keyRisk?: string;
  summary?: string;
}

export type LandUseClass =
  | 'idle_agri'
  | 'paddy'
  | 'oil_palm'
  | 'rubber'
  | 'mixed_agri'
  | 'industrial'
  | 'commercial'
  | 'urban'
  | 'infrastructure' // utility/infra facilities — water treatment, substations, telecom towers, drainage
  | 'forest'
  | 'water'   // still water body — lake/reservoir/pond, FPV-eligible
  | 'river'   // flowing river/sea — not FPV-eligible, zero capacity
  | 'unknown';

export type NorthernMyState = 'Perak' | 'Kedah' | 'Penang' | 'Perlis';

export interface HexTileScores {
  solar: number;
  grid: number;
  land: number;
  availability: number;
  climate: number;
  road: number;
  envSocial: number;
  composite: number;
}

export interface HexTile {
  /** For 1 km grid cells this holds the cell ID "swLat3_swLng3"; for legacy H3 tiles it holds the H3 index. */
  h3Index: string;
  centerLat: number;
  centerLng: number;
  states: NorthernMyState[];
  scores: HexTileScores;
  attributes: {
    ghiKwhM2Day: number;
    distToGridKm: number;
    nearestGridVoltageKV: number;
    landUse: LandUseClass;
    floodRisk: RiskLevel;
    distToRoadKm: number;
    isProtected: boolean;
    /** Legacy flat capacity estimate (MW). Use capacityKWp + annualYieldMWh for PVGIS-based values. */
    estimatedCapacityMW: number;
    /** Installed DC capacity (kWp) for this 1 km² cell based on land use and PVGIS density. */
    capacityKWp: number;
    /** PVGIS annual energy yield (kWh/kWp/year) for this cell's location. */
    pvgisEyKWhPerKWp: number;
    /** Expected annual generation (MWh/year) = capacityKWp × pvgisEyKWhPerKWp / 1000. */
    annualYieldMWh: number;
    /** Raw ESA WorldCover 2021 class code (10=forest, 40=cropland, 50=built-up, 80=water, etc.). */
    worldcoverClass: number;
    /** True if a major river (OSM waterway=river) crosses this 1 km cell. Overlay flag — independent of landUse. */
    isRiverbank: boolean;
  };
}

export type HexScoreDimension = keyof HexTileScores;

// ─── UI State ────────────────────────────────────────────────────────────────

export interface AppState {
  selectedSiteId: string | null;
  activeLayerIds: MapLayerId[];
  scoringWeights: ScoringWeights;
  financialInputs: FinancialInputs;
  filterCountries: Country[];
  filterMinScore: number;
  compareIds: string[];
}
