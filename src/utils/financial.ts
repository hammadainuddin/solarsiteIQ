/**
 * DC SiteIQ — Financial Model
 *
 * Two models live here:
 *   1. runFinancialModel()  — comprehensive project-finance DCF (20-year)
 *   2. buildFinancialModel() — lightweight DCF used by FinancialView sliders (legacy)
 *
 * The legacy model uses FinancialInputs / FinancialOutputs from types/index.ts.
 * The comprehensive model uses DCFInputs / DCFOutputs defined below.
 */

import type { FinancialInputs, FinancialOutputs, YearlyCashFlow } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Comprehensive DCF types
// ─────────────────────────────────────────────────────────────────────────────

export interface DCFInputs {
  // ── Project metadata ────────────────────────────────────────────────────────
  projectName: string;
  country: string;
  /** Total build-out capacity across all phases, MW IT load */
  totalCapacityMW: number;
  phases: 1 | 2 | 3;
  /** First-phase capacity delivered at COD, MW */
  phase1CapacityMW: number;
  /** Calendar year of Phase 1 commercial operations date */
  phase1COD: number;
  constructionPeriodMonths: number;

  // ── Capex (USD per kW IT load, or USD absolute for land) ───────────────────
  landCostUSDTotal: number;
  /** Site prep, structure, shell — USD/kW IT */
  civils_capex_per_kw: number;
  /** Cooling plant, CRAC/CRAH, piping — USD/kW IT */
  mechanical_capex_per_kw: number;
  /** UPS, PDU, gensets, LV — USD/kW IT */
  electrical_capex_per_kw: number;
  /** 132/275 kV grid connection, transformers — USD/MW IT */
  powerInfra_capex_per_MW: number;
  /** Applied to sum of all cost lines above, % */
  contingencyPct: number;

  // ── Revenue ─────────────────────────────────────────────────────────────────
  /** Base rack rate at COD, USD/kW/month */
  rackRateUSD_kW_month: number;
  /**
   * Utilisation schedule: index 0 = Year 1, …, index 5 = Year 6,
   * index 6 = Year 7 onwards. Values are fractions (0–1).
   */
  utilisationYear: [number, number, number, number, number, number, number];
  /** Annual contract escalation applied to the rack rate, % */
  contractEscalationPctPA: number;
  /** Informational: weighted average contract length, years */
  avgContractYears: number;

  // ── Operating costs ─────────────────────────────────────────────────────────
  pue: number;
  powerCostUSD_kWh: number;
  /** Fully-loaded staff cost per MW of total facility capacity, USD/MW/year */
  staffingUSD_MW_year: number;
  /** Applied to total capex, % */
  maintenancePctCapex: number;
  /** Applied to total capex, % */
  insurancePctCapex: number;
  /** Flat annual amount, USD */
  propertyTaxUSDYear: number;

  // ── Financing ───────────────────────────────────────────────────────────────
  /** Equity as a share of total capex, % (e.g. 35 = 35%) */
  equityPct: number;
  /** Annual interest on outstanding debt, % */
  debtInterestRatePct: number;
  /** Total loan life including grace period, years */
  debtTenorYears: number;
  /** Interest-only years at start of debt tenor */
  debtGracePeriodYears: number;
  /** Corporate income tax rate applied to EBT, % */
  taxRatePct: number;
  /** Straight-line depreciation period for total capex, years */
  depreciationYears: number;
  /** WACC used for project NPV discount, decimal (e.g. 0.08) */
  wacc: number;
  /** Required equity return used for equity NPV discount, decimal */
  requiredEquityReturn: number;

  // ── Bring Your Own Power (optional on-site solar + battery) ─────────────────
  byopEnabled: boolean;
  /** Installed solar PV nameplate, MW DC */
  solarCapacityMWdc: number;
  /** Annual solar capacity factor, % (e.g. 18) */
  solarCapacityFactorPct: number;
  /** All-in solar capex, USD per W DC (e.g. 0.85) */
  solarCapexUSD_Wdc: number;
  /** Solar O&M, USD per kW DC per year */
  solarOpexUSD_kWyr: number;
  /** Battery storage energy capacity, MWh */
  batteryStorageMWh: number;
  /** All-in battery capex, USD per kWh nameplate */
  batteryCapexUSD_kWh: number;
  /** Round-trip efficiency, % (e.g. 88) */
  batteryRoundTripPct: number;
  /** Target share of DC load that BYOP supplies (after firming), 0–100 */
  gridDisplacementPct: number;
}

// ─── Per-year output row ──────────────────────────────────────────────────────

export interface DCFYearData {
  /** 0 = pre-operations (capex year); 1–20 = operating years */
  year: number;
  calendarYear: number;

  // Capacity
  capacityMW: number;
  utilisationPct: number;
  itLoadMW: number;

  // Revenue
  revenueUSDM: number;
  rackRateEffective: number;   // post-escalation USD/kW/month

  // Opex breakdown (USD M)
  powerCostUSDM: number;
  staffingUSDM: number;
  maintenanceUSDM: number;
  insuranceUSDM: number;
  propertyTaxUSDM: number;
  totalOpexUSDM: number;

  // P&L (USD M)
  ebitdaUSDM: number;
  ebitdaMarginPct: number;
  depreciationUSDM: number;
  ebitUSDM: number;
  interestUSDM: number;
  ebtUSDM: number;
  taxUSDM: number;
  netIncomeUSDM: number;

  // Financing / balance sheet (USD M)
  capexUSDM: number;              // Year 0 = total capex; else 0
  debtDrawdownUSDM: number;       // Year 0 = total debt; else 0
  principalRepaymentUSDM: number;
  totalDebtServiceUSDM: number;   // interest + principal
  outstandingDebtUSDM: number;    // balance at end of year
  dscrRatio: number | null;       // null when no debt service

  // Cash flows (USD M)
  projectFcfUSDM: number;         // EBIT×(1−t) + D&A − capexOutflow
  equityCfUSDM: number;           // netIncome + D&A − capex + debtDrawdown − principal
  cumulativeEquityCfUSDM: number;
}

// ─── Capex breakdown ─────────────────────────────────────────────────────────

export interface CapexBreakdown {
  land: number;
  civils: number;
  mechanical: number;
  electrical: number;
  powerInfra: number;
  contingency: number;
  total: number;
}

// ─── Aggregate outputs ────────────────────────────────────────────────────────

export interface DCFOutputs {
  // Capex & financing (USD M)
  totalCapexUSDM: number;
  capexBreakdown: CapexBreakdown;
  equityContributionUSDM: number;
  debtContributionUSDM: number;

  // Returns
  projectIRRPct: number;
  equityIRRPct: number;
  projectNPVUSDM: number;        // at inputs.wacc
  equityNPVUSDM: number;         // at inputs.requiredEquityReturn
  paybackPeriodYears: number | null;
  equityMultiple: number;        // cumulative equity CF / initial equity injection

  // Debt service
  peakDebtUSDM: number;
  debtRepaidByYear: number | null;
  minDSCR: number;
  avgDSCR: number;

  // Stabilised P&L (Year 7+ metrics)
  stabilisedRevenueUSDM: number;
  stabilisedEbitdaUSDM: number;
  stabilisedEbitdaMarginPct: number;
  stabilisedNetIncomeUSDM: number;

  yearlyData: DCFYearData[];
}

// ─── Scenario types ───────────────────────────────────────────────────────────

export interface ScenarioResult {
  label: 'Base' | 'Bull' | 'Bear';
  description: string;
  inputs: DCFInputs;
  outputs: DCFOutputs;
}

export interface ScenarioSet {
  base: ScenarioResult;
  bull: ScenarioResult;
  bear: ScenarioResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Default inputs (100 MW campus, Johor Bahru)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_DCF_INPUTS: DCFInputs = {
  projectName: 'DC Campus — Johor Bahru',
  country: 'MY',
  totalCapacityMW: 100,
  phases: 2,
  phase1CapacityMW: 50,
  phase1COD: 2026,
  constructionPeriodMonths: 30,

  // Capex
  landCostUSDTotal: 15_000_000,      // ~15 ha industrial @ $1M/ha
  civils_capex_per_kw: 250,          // site + structure
  mechanical_capex_per_kw: 350,      // cooling plant
  electrical_capex_per_kw: 300,      // UPS/genset/PDU
  powerInfra_capex_per_MW: 800_000,  // 275kV substation & cable
  contingencyPct: 10,

  // Revenue
  rackRateUSD_kW_month: 115,
  utilisationYear: [0.25, 0.46, 0.63, 0.75, 0.83, 0.88, 0.90],
  contractEscalationPctPA: 2.0,
  avgContractYears: 5,

  // Opex
  pue: 1.35,
  powerCostUSD_kWh: 0.079,           // TNB industrial tariff
  staffingUSD_MW_year: 55_000,
  maintenancePctCapex: 1.0,
  insurancePctCapex: 0.4,
  propertyTaxUSDYear: 180_000,

  // Financing
  equityPct: 35,
  debtInterestRatePct: 5.5,
  debtTenorYears: 15,
  debtGracePeriodYears: 2,
  taxRatePct: 24,
  depreciationYears: 20,
  wacc: 0.08,
  requiredEquityReturn: 0.15,

  // BYOP — disabled by default; sensible Malaysia/SEA defaults if enabled
  byopEnabled: false,
  solarCapacityMWdc: 0,
  solarCapacityFactorPct: 18,
  solarCapexUSD_Wdc: 0.85,
  solarOpexUSD_kWyr: 12,
  batteryStorageMWh: 0,
  batteryCapexUSD_kWh: 280,
  batteryRoundTripPct: 88,
  gridDisplacementPct: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Math utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Round to n decimal places. */
function rd(v: number, n = 4): number {
  const f = Math.pow(10, n);
  return Math.round(v * f) / f;
}

/** Round to 2 dp for USD M presentation. */
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Internal Rate of Return via Newton-Raphson with multiple initial guesses.
 * Returns IRR as a percentage (e.g. 18.5 for 18.5%) or NaN if unconverged.
 *
 * @param flows  Year-0 outflow (negative) followed by Year-1..N inflows
 */
export function newtonRaphsonIRR(flows: number[]): number {
  // Must have at least one sign change — early exit for degenerate cases
  let hasPos = false, hasNeg = false;
  for (const f of flows) {
    if (f > 0) hasPos = true;
    if (f < 0) hasNeg = true;
  }
  if (!hasPos || !hasNeg) return NaN;

  const MAX_ITER = 500;
  const TOL = 1e-9;

  // Bisection fallback helper for robustness
  function npvAt(r: number): number {
    return flows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  }

  // Try a range of starting guesses
  const seeds = [0.1, 0.15, 0.2, 0.05, 0.25, 0.30, 0.40, 0.50, -0.05, 0.01];

  for (const seed of seeds) {
    let r = seed;
    let converged = false;

    for (let i = 0; i < MAX_ITER; i++) {
      let npv = 0;
      let dnpv = 0;
      for (let t = 0; t < flows.length; t++) {
        const denom = Math.pow(1 + r, t);
        npv  += flows[t] / denom;
        dnpv -= t * flows[t] / (denom * (1 + r));
      }
      if (Math.abs(dnpv) < 1e-14) break;
      const delta = npv / dnpv;
      r -= delta;
      if (Math.abs(delta) < TOL) { converged = true; break; }
    }

    if (converged && r > -0.99 && r < 10 && isFinite(r)) {
      return rd(r * 100, 2);  // return as %
    }
  }

  // Last resort: bisection between -99% and +500%
  let lo = -0.99, hi = 5.0;
  if (Math.sign(npvAt(lo)) === Math.sign(npvAt(hi))) return NaN;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = npvAt(mid);
    if (Math.abs(v) < TOL || (hi - lo) / 2 < TOL) return rd(mid * 100, 2);
    if (Math.sign(v) === Math.sign(npvAt(lo))) lo = mid; else hi = mid;
  }

  return NaN;
}

/** Net Present Value of a cash-flow series at a given discount rate (decimal). */
function npvOf(flows: number[], discountRate: number): number {
  return flows.reduce((s, cf, t) => s + cf / Math.pow(1 + discountRate, t), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Capex calculator
// ─────────────────────────────────────────────────────────────────────────────

function calcCapex(inp: DCFInputs): CapexBreakdown {
  const kwIT = inp.totalCapacityMW * 1_000;
  const land      = r2(inp.landCostUSDTotal / 1e6);
  const civils    = r2((inp.civils_capex_per_kw    * kwIT) / 1e6);
  const mechanical= r2((inp.mechanical_capex_per_kw * kwIT) / 1e6);
  const electrical= r2((inp.electrical_capex_per_kw * kwIT) / 1e6);
  const powerInfra= r2((inp.powerInfra_capex_per_MW  * inp.totalCapacityMW) / 1e6);

  const base       = land + civils + mechanical + electrical + powerInfra;
  const contingency= r2(base * inp.contingencyPct / 100);

  // BYOP capex (solar + battery) — folded into total project capex
  const byop = calcBYOPCapex(inp);
  const total = r2(base + contingency + byop.totalUSDM);

  return { land, civils, mechanical, electrical, powerInfra, contingency, total };
}

// ─── BYOP helper ─────────────────────────────────────────────────────────────

export interface BYOPSummary {
  /** Total BYOP capex, USD M */
  totalUSDM: number;
  solarUSDM: number;
  batteryUSDM: number;
  /** Annual solar generation pre-firming losses, MWh */
  rawGenMWh: number;
  /** Annual electricity supplied to DC after firming losses, MWh */
  netDeliveredMWh: number;
  /** Annual solar O&M, USD M */
  solarOpexUSDM: number;
}

export function calcBYOPCapex(inp: DCFInputs): BYOPSummary {
  if (!inp.byopEnabled) {
    return { totalUSDM: 0, solarUSDM: 0, batteryUSDM: 0, rawGenMWh: 0, netDeliveredMWh: 0, solarOpexUSDM: 0 };
  }
  const solarUSDM   = r2((inp.solarCapacityMWdc * 1e6 * inp.solarCapexUSD_Wdc) / 1e6);
  const batteryUSDM = r2((inp.batteryStorageMWh * 1_000 * inp.batteryCapexUSD_kWh) / 1e6);
  const rawGenMWh   = inp.solarCapacityMWdc * 8_760 * (inp.solarCapacityFactorPct / 100);
  // Approx firming loss: assume the stored fraction equals gridDisplacementPct/2,
  // and that fraction takes a roundtrip-efficiency hit.
  const storedFrac  = Math.min(1, inp.gridDisplacementPct / 100 / 2);
  const netDeliveredMWh = rawGenMWh * (1 - storedFrac * (1 - inp.batteryRoundTripPct / 100));
  const solarOpexUSDM = r2((inp.solarCapacityMWdc * 1_000 * inp.solarOpexUSD_kWyr) / 1e6);
  return {
    totalUSDM: r2(solarUSDM + batteryUSDM),
    solarUSDM,
    batteryUSDM,
    rawGenMWh: rd(rawGenMWh, 0),
    netDeliveredMWh: rd(netDeliveredMWh, 0),
    solarOpexUSDM,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Main model
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_YEARS = 20;

export function runFinancialModel(inp: DCFInputs): DCFOutputs {
  // ── 5.1 Capex & financing ──────────────────────────────────────────────────

  const breakdown   = calcCapex(inp);
  const totalCapex  = breakdown.total;                          // USD M
  const equityUSDM  = r2(totalCapex * inp.equityPct / 100);
  const debtUSDM    = r2(totalCapex - equityUSDM);

  // Equal-principal repayment schedule (common in project finance)
  const repayYears  = Math.max(1, inp.debtTenorYears - inp.debtGracePeriodYears);
  const annualPrincipal = r2(debtUSDM / repayYears);

  // ── 5.2 Year-0 (construction) row ─────────────────────────────────────────

  const zeroRow: DCFYearData = {
    year: 0,
    calendarYear: inp.phase1COD - 1,
    capacityMW: inp.totalCapacityMW,
    utilisationPct: 0,
    itLoadMW: 0,
    revenueUSDM: 0,
    rackRateEffective: inp.rackRateUSD_kW_month,
    powerCostUSDM: 0,
    staffingUSDM: 0,
    maintenanceUSDM: 0,
    insuranceUSDM: 0,
    propertyTaxUSDM: 0,
    totalOpexUSDM: 0,
    ebitdaUSDM: 0,
    ebitdaMarginPct: 0,
    depreciationUSDM: 0,
    ebitUSDM: 0,
    interestUSDM: 0,
    ebtUSDM: 0,
    taxUSDM: 0,
    netIncomeUSDM: 0,
    capexUSDM: totalCapex,
    debtDrawdownUSDM: debtUSDM,
    principalRepaymentUSDM: 0,
    totalDebtServiceUSDM: 0,
    outstandingDebtUSDM: debtUSDM,
    dscrRatio: null,
    projectFcfUSDM: -totalCapex,
    equityCfUSDM: -equityUSDM,
    cumulativeEquityCfUSDM: -equityUSDM,
  };

  // ── 5.3 Operating years 1–20 ───────────────────────────────────────────────

  const yearlyData: DCFYearData[] = [zeroRow];

  // Running state
  let outstandingDebt = debtUSDM;
  let cumulativeEquityCf = -equityUSDM;

  // Aggregate accumulators for IRR & NPV
  const projectFlows: number[] = [-totalCapex];
  const equityFlows:  number[] = [-equityUSDM];
  const dscrValues:   number[] = [];

  // Fixed annual opex components (not dependent on utilisation)
  const staffingUSDM     = r2((inp.staffingUSD_MW_year * inp.totalCapacityMW) / 1e6);
  const maintenanceUSDM  = r2(totalCapex * inp.maintenancePctCapex / 100);
  const insuranceUSDM    = r2(totalCapex * inp.insurancePctCapex / 100);
  const propertyTaxUSDM  = r2(inp.propertyTaxUSDYear / 1e6);

  // BYOP precomputed values (zero when disabled)
  const byop             = calcBYOPCapex(inp);

  for (let y = 1; y <= MODEL_YEARS; y++) {
    // ── Utilisation ──────────────────────────────────────────────────────────
    const utilIdx     = Math.min(y - 1, 6);          // clamp at index 6 (Year 7+)
    const utilisationPct = inp.utilisationYear[utilIdx];
    const itLoadMW    = r2(inp.totalCapacityMW * utilisationPct);

    // ── Revenue ──────────────────────────────────────────────────────────────
    const escalFactor    = Math.pow(1 + inp.contractEscalationPctPA / 100, y - 1);
    const rackRateEff    = rd(inp.rackRateUSD_kW_month * escalFactor, 4);
    const revenueUSDM    = r2(itLoadMW * 1_000 * rackRateEff * 12 / 1e6);

    // ── Opex ─────────────────────────────────────────────────────────────────
    // Power: IT load only (not total capacity) drives energy consumption.
    // BYOP displaces grid energy up to the configured target share of load.
    const totalLoadMWh   = itLoadMW * inp.pue * 8_760;
    const targetDisplacementMWh = totalLoadMWh * (inp.gridDisplacementPct / 100);
    const byopDeliveredMWh      = Math.min(byop.netDeliveredMWh, targetDisplacementMWh);
    const gridMWh               = Math.max(0, totalLoadMWh - byopDeliveredMWh);
    const powerCostUSDM  = r2((gridMWh * 1_000 * inp.powerCostUSD_kWh) / 1e6);
    const solarOpexUSDM  = inp.byopEnabled ? byop.solarOpexUSDM : 0;
    const totalOpexUSDM  = r2(powerCostUSDM + solarOpexUSDM + staffingUSDM + maintenanceUSDM + insuranceUSDM + propertyTaxUSDM);

    // ── P&L ──────────────────────────────────────────────────────────────────
    const ebitdaUSDM     = r2(revenueUSDM - totalOpexUSDM);
    const ebitdaMarginPct= revenueUSDM > 0 ? r2((ebitdaUSDM / revenueUSDM) * 100) : 0;
    const depreciationUSDM = y <= inp.depreciationYears ? r2(totalCapex / inp.depreciationYears) : 0;
    const ebitUSDM       = r2(ebitdaUSDM - depreciationUSDM);

    // ── Debt service ─────────────────────────────────────────────────────────
    const interestUSDM   = r2(outstandingDebt * inp.debtInterestRatePct / 100);
    const inGracePeriod  = y <= inp.debtGracePeriodYears;
    const debtFullyRepaid= y > inp.debtTenorYears;
    const principalUSDM  = (!inGracePeriod && !debtFullyRepaid) ? annualPrincipal : 0;
    const debtServiceUSDM= r2(interestUSDM + principalUSDM);

    // Update outstanding debt (reduced by principal paid)
    outstandingDebt      = r2(Math.max(0, outstandingDebt - principalUSDM));

    // ── Tax & net income ──────────────────────────────────────────────────────
    const ebtUSDM        = r2(ebitUSDM - interestUSDM);
    const taxUSDM        = r2(Math.max(0, ebtUSDM) * inp.taxRatePct / 100);
    const netIncomeUSDM  = r2(ebtUSDM - taxUSDM);

    // ── DSCR ─────────────────────────────────────────────────────────────────
    const dscrRatio: number | null = debtServiceUSDM > 0
      ? r2(ebitdaUSDM / debtServiceUSDM)
      : null;
    if (dscrRatio !== null) dscrValues.push(dscrRatio);

    // ── Cash flows ────────────────────────────────────────────────────────────
    // Project FCF (unlevered, post-tax): EBIT×(1−t) + D&A
    const nopat          = r2(ebitUSDM * (1 - inp.taxRatePct / 100));
    const projectFcfUSDM = r2(nopat + depreciationUSDM);

    // Equity CF: net income + D&A − principal (no capex in operating years)
    const equityCfUSDM   = r2(netIncomeUSDM + depreciationUSDM - principalUSDM);
    cumulativeEquityCf   = r2(cumulativeEquityCf + equityCfUSDM);

    projectFlows.push(projectFcfUSDM);
    equityFlows.push(equityCfUSDM);

    yearlyData.push({
      year: y,
      calendarYear: inp.phase1COD + y - 1,
      capacityMW: inp.totalCapacityMW,
      utilisationPct,
      itLoadMW,
      revenueUSDM,
      rackRateEffective: rackRateEff,
      powerCostUSDM,
      staffingUSDM,
      maintenanceUSDM,
      insuranceUSDM,
      propertyTaxUSDM,
      totalOpexUSDM,
      ebitdaUSDM,
      ebitdaMarginPct,
      depreciationUSDM,
      ebitUSDM,
      interestUSDM,
      ebtUSDM,
      taxUSDM,
      netIncomeUSDM,
      capexUSDM: 0,
      debtDrawdownUSDM: 0,
      principalRepaymentUSDM: principalUSDM,
      totalDebtServiceUSDM: debtServiceUSDM,
      outstandingDebtUSDM: outstandingDebt,
      dscrRatio,
      projectFcfUSDM,
      equityCfUSDM,
      cumulativeEquityCfUSDM: cumulativeEquityCf,
    });
  }

  // ── 5.4 Aggregate metrics ──────────────────────────────────────────────────

  const projectIRRPct = newtonRaphsonIRR(projectFlows);
  const equityIRRPct  = newtonRaphsonIRR(equityFlows);

  const projectNPVUSDM = r2(npvOf(projectFlows, inp.wacc));
  const equityNPVUSDM  = r2(npvOf(equityFlows,  inp.requiredEquityReturn));

  // Payback: first year where cumulative equity CF turns positive
  const paybackRow = yearlyData.slice(1).find((r) => r.cumulativeEquityCfUSDM >= 0);
  const paybackPeriodYears: number | null = paybackRow ? paybackRow.year : null;

  // Equity multiple: total equity CFs received / initial equity injection
  const totalEquityCf = equityFlows.slice(1).reduce((s, v) => s + v, 0);
  const equityMultiple = equityUSDM > 0 ? r2(totalEquityCf / equityUSDM) : 0;

  // Debt metrics
  const peakDebtUSDM = debtUSDM;
  const fullyRepaidRow = yearlyData.slice(1).find((r) => r.outstandingDebtUSDM === 0);
  const debtRepaidByYear: number | null = fullyRepaidRow ? fullyRepaidRow.year : null;
  const minDSCR = dscrValues.length > 0 ? r2(Math.min(...dscrValues)) : 0;
  const avgDSCR = dscrValues.length > 0 ? r2(dscrValues.reduce((s, v) => s + v, 0) / dscrValues.length) : 0;

  // Stabilised metrics: use Year 7+ (utilisationYear[6]) row, before escalation distorts
  const stabYear = yearlyData.find((r) => r.year === 7) ?? yearlyData[yearlyData.length - 1];
  const stabilisedRevenueUSDM     = stabYear.revenueUSDM;
  const stabilisedEbitdaUSDM      = stabYear.ebitdaUSDM;
  const stabilisedEbitdaMarginPct  = stabYear.ebitdaMarginPct;
  const stabilisedNetIncomeUSDM    = stabYear.netIncomeUSDM;

  return {
    totalCapexUSDM: totalCapex,
    capexBreakdown: breakdown,
    equityContributionUSDM: equityUSDM,
    debtContributionUSDM: debtUSDM,
    projectIRRPct,
    equityIRRPct,
    projectNPVUSDM,
    equityNPVUSDM,
    paybackPeriodYears,
    equityMultiple,
    peakDebtUSDM,
    debtRepaidByYear,
    minDSCR,
    avgDSCR,
    stabilisedRevenueUSDM,
    stabilisedEbitdaUSDM,
    stabilisedEbitdaMarginPct,
    stabilisedNetIncomeUSDM,
    yearlyData,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Scenario generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs three variants of the model:
 *   Bull  — +20% rack rate, −15% capex (all per-kW & per-MW cost lines)
 *   Base  — no change
 *   Bear  — −20% rack rate, +15% capex
 *
 * Power cost, opex, and financial structure are held constant so the scenarios
 * isolate the revenue and capex sensitivities.
 */
export function generateScenarios(base: DCFInputs): ScenarioSet {
  function applyCapexMultiplier(inp: DCFInputs, m: number): DCFInputs {
    return {
      ...inp,
      landCostUSDTotal:        inp.landCostUSDTotal        * m,
      civils_capex_per_kw:     inp.civils_capex_per_kw     * m,
      mechanical_capex_per_kw: inp.mechanical_capex_per_kw * m,
      electrical_capex_per_kw: inp.electrical_capex_per_kw * m,
      powerInfra_capex_per_MW: inp.powerInfra_capex_per_MW * m,
    };
  }

  const bullInputs: DCFInputs = applyCapexMultiplier(
    { ...base, rackRateUSD_kW_month: rd(base.rackRateUSD_kW_month * 1.20, 2) },
    0.85,
  );
  const bearInputs: DCFInputs = applyCapexMultiplier(
    { ...base, rackRateUSD_kW_month: rd(base.rackRateUSD_kW_month * 0.80, 2) },
    1.15,
  );

  return {
    base: {
      label: 'Base',
      description: 'Base case — as modelled',
      inputs: base,
      outputs: runFinancialModel(base),
    },
    bull: {
      label: 'Bull',
      description: '+20% rack rate, −15% capex (favourable market + efficient delivery)',
      inputs: bullInputs,
      outputs: runFinancialModel(bullInputs),
    },
    bear: {
      label: 'Bear',
      description: '−20% rack rate, +15% capex (pricing pressure + cost overruns)',
      inputs: bearInputs,
      outputs: runFinancialModel(bearInputs),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Legacy model (used by FinancialView.tsx sliders)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_INPUTS: FinancialInputs = {
  itLoadMW: 80,
  pue: 1.45,
  landAreaHa: 20,
  revenuePerKwPerMonthUSD: 120,
  occupancyRate: 0.75,
  rampUpYears: 3,
  capexUSDM: 320,
  equityRatio: 0.35,
  debtCostPct: 0.055,
  debtTenorYears: 12,
  opexCashUSDM: 28,
  energyCostUSDPerKwh: 0.085,
  energyEscalatorPct: 0.02,
  revenueEscalatorPct: 0.025,
  opexEscalatorPct: 0.03,
  corporateTaxRatePct: 0.24,
  depreciationYears: 15,
  investmentTaxCreditPct: 0,
  discountRate: 0.10,
  projectLifeYears: 15,
  terminalGrowthRatePct: 0.025,
};

/** @deprecated Use DEFAULT_INPUTS */
export const DEFAULT_ASSUMPTIONS = DEFAULT_INPUTS;

function legacyAnnuity(principal: number, rate: number, years: number): number {
  if (rate === 0) return principal / years;
  return principal * (rate * Math.pow(1 + rate, years)) / (Math.pow(1 + rate, years) - 1);
}

export function buildFinancialModel(a: FinancialInputs): FinancialOutputs {
  const debtUSDM  = a.capexUSDM * (1 - a.equityRatio);
  const equityUSDM = a.capexUSDM * a.equityRatio;
  const annualDebtServiceUSDM = a.debtTenorYears > 0
    ? legacyAnnuity(debtUSDM, a.debtCostPct, a.debtTenorYears)
    : 0;

  const installedKw = a.itLoadMW * 1_000;
  const cashFlows: YearlyCashFlow[] = [];
  let outstandingDebt = debtUSDM;
  let cumulativeFcfe = -equityUSDM;

  function yearOccupancy(y: number): number {
    if (a.rampUpYears <= 0) return a.occupancyRate;
    if (y >= a.rampUpYears) return a.occupancyRate;
    return a.occupancyRate * (y / a.rampUpYears);
  }

  const fcffFlows: number[] = [-a.capexUSDM];
  const fcfeFlows: number[] = [-equityUSDM];

  for (let y = 1; y <= a.projectLifeYears; y++) {
    const occ    = yearOccupancy(y);
    const revEsc = Math.pow(1 + a.revenueEscalatorPct, y - 1);
    const enEsc  = Math.pow(1 + a.energyEscalatorPct,  y - 1);
    const opEsc  = Math.pow(1 + a.opexEscalatorPct,    y - 1);

    const revenue    = r2((installedKw * occ * a.revenuePerKwPerMonthUSD * 12 * revEsc) / 1e6);
    const energyCost = r2((a.itLoadMW * occ * a.pue * 8_760 * 1_000 * a.energyCostUSDPerKwh * enEsc) / 1e6);
    const cashOpex   = r2(a.opexCashUSDM * opEsc);
    const totalOpex  = r2(energyCost + cashOpex);
    const ebitda     = r2(revenue - totalOpex);
    const ebitdaMarginPct = revenue > 0 ? r2((ebitda / revenue) * 100) : 0;

    const depreciation     = y <= a.depreciationYears ? r2(a.capexUSDM / a.depreciationYears) : 0;
    const ebit             = r2(ebitda - depreciation);
    const interestExpense  = r2(outstandingDebt * a.debtCostPct);
    const ebt              = r2(ebit - interestExpense);
    let   taxExpense       = r2(Math.max(0, ebt) * a.corporateTaxRatePct);
    if (y === 1 && a.investmentTaxCreditPct > 0) {
      taxExpense = r2(Math.max(0, taxExpense - a.capexUSDM * a.investmentTaxCreditPct));
    }
    const netIncome  = r2(ebt - taxExpense);
    const fcff       = r2(ebit * (1 - a.corporateTaxRatePct) + depreciation);
    const pvFcff     = r2(fcff / Math.pow(1 + a.discountRate, y));

    const debtRepayment = y <= a.debtTenorYears
      ? r2(annualDebtServiceUSDM - interestExpense)
      : 0;
    const capexOutflow = 0;
    const fcfe = r2(netIncome + depreciation - capexOutflow - debtRepayment);
    cumulativeFcfe = r2(cumulativeFcfe + fcfe);
    outstandingDebt = r2(Math.max(0, outstandingDebt - debtRepayment));

    cashFlows.push({
      year: y,
      itLoadMWActual: r2(a.itLoadMW * occ),
      occupancyRate: r2(occ),
      revenue, energyCost, cashOpex, totalOpex,
      ebitda, ebitdaMarginPct, depreciation, ebit,
      interestExpense, ebt, taxExpense, netIncome,
      fcfe, fcff, capexOutflow, debtRepayment,
      cumulativeFcfe, pvFcff,
    });
    fcffFlows.push(fcff);
    fcfeFlows.push(fcfe);
  }

  const lastFcff = fcffFlows[fcffFlows.length - 1];
  const terminalValueUSDM = a.discountRate > a.terminalGrowthRatePct
    ? r2((lastFcff * (1 + a.terminalGrowthRatePct)) / (a.discountRate - a.terminalGrowthRatePct))
    : 0;
  const pvTerminal   = r2(terminalValueUSDM / Math.pow(1 + a.discountRate, a.projectLifeYears));
  const npvUSDM      = r2(cashFlows.reduce((s, c) => s + c.pvFcff, 0) + pvTerminal - a.capexUSDM);
  const equityIrrPct = newtonRaphsonIRR(fcfeFlows);
  const projectIrrPct= newtonRaphsonIRR(fcffFlows);

  const paybackIdx   = cashFlows.findIndex((c) => c.cumulativeFcfe >= 0);
  const paybackYears = paybackIdx === -1 ? 99 : paybackIdx + 1;
  const totalFcfe    = cashFlows.reduce((s, c) => s + c.fcfe, 0);
  const equityMultiple = equityUSDM > 0 ? r2(totalFcfe / equityUSDM) : 0;

  const stableIdx    = Math.min(a.rampUpYears, cashFlows.length - 1);
  const stableCf     = cashFlows[stableIdx];
  const dscr = annualDebtServiceUSDM > 0
    ? r2((stableCf.ebitda - stableCf.taxExpense) / annualDebtServiceUSDM)
    : 99;

  return {
    annualRevenueUSDM: stableCf.revenue,
    annualTotalOpexUSDM: stableCf.totalOpex,
    ebitdaUSDM: stableCf.ebitda,
    ebitdaMarginPct: stableCf.ebitdaMarginPct,
    netIncomeUSDM: stableCf.netIncome,
    npvUSDM,
    equityIrrPct,
    projectIrrPct,
    paybackYears,
    equityMultiple,
    debtUSDM: r2(debtUSDM),
    equityUSDM: r2(equityUSDM),
    annualDebtServiceUSDM: r2(annualDebtServiceUSDM),
    dscr,
    terminalValueUSDM,
    cashFlows,
  };
}
