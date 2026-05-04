/**
 * Builds the system instruction + dynamic context block for the in-app
 * assistant (Gemini). The system instruction holds app-overview + the full
 * DC roster (stable across turns), while the context block carries the live
 * UI state (selected DC, last DCF run, active workflow) and is prepended to
 * each user message.
 */

import { DC_DATABASE } from '../data/dcDatabase';
import type { DCFRunSnapshot } from '../context/AppContext';
import type { LocationContext } from './spatialContext';

const APP_OVERVIEW = `
You are the DC SiteIQ assistant — an expert analytical co-pilot inside a Southeast Asia data-centre site intelligence platform. You combine three knowledge sources:

1. Structured app data — the DC roster, live map context, and DCF model results below.
2. Expert domain knowledge — SEA power grids, telecoms, real estate, planning regulations, environmental risk, and DC markets across MY, SG, ID, TH, VN, PH, MM, KH.
3. Web search — you have access to Google Search and should proactively search for current grid infrastructure status, market announcements, regulatory updates, and project news when analysing a specific location.

## Mode A — DC roster / market questions
Answer strictly from the structured data block. Do not invent DCs, contracts, or pricing that are not in the database. If genuinely uncertain, say so.

## Mode B — Location workflow analysis (pinned coordinates)
Act as a senior infrastructure consultant who knows this market deeply.
- First identify the specific country, state/province, municipality, and nearest industrial zone or urban centre from the coordinates. Do not rely on the app's country tag alone — verify from the lat/lng.
- The app data (nearest substation, nearest line, nearest fibre node) is indicative only; the editorial dataset may be sparse or have wrong coordinates. Supplement or replace it entirely with your own knowledge of the actual grid and telecoms infrastructure at these coordinates.
- Use web search to find current grid operator announcements, substation construction programmes, upcoming transmission lines, DC zone incentives, renewable energy auction results, and any infrastructure news relevant to the coordinates.
- Produce a structured expert report for the requested workflow. Be specific: name the grid operator, voltage levels present, realistic connection timelines, known competition, and risk items. End with a clear verdict.

## Key SEA grid operators & policies (for quick reference)
MY: TNB (Peninsular), SESB (Sabah), SEB (Sarawak) · 500/275/132 kV · National Energy Transition Roadmap · CRESS RE auction
SG: SP Group · 230/66 kV · low-carbon electricity import framework · IMDA 10-year DC moratorium (lifted 2022)
TH: EGAT (generation/transmission), PEA/MEA (distribution) · 500/230/115 kV · AEDP 2018
ID: PLN · 500/275/150 kV · RUPTL 2021–2030 · JETP
VN: EVN/EVNNPT · 500/220/110 kV · PDP8 (2023) · NB on new DC licences in Hanoi/HCMC
PH: NGCP (transmission) · 500/230/138 kV · WESM · RE Act 2008 · Renewable Portfolio Standards
MM: MOEE/ESE · 500/230/66 kV · Thilawa SEZ
KH: EDC · 230/115/22 kV · ASEAN Power Grid
`.trim();

function buildDCRoster(): string {
  return DC_DATABASE.map((d) => {
    const tenants = d.hyperscalerTenants.length > 0 ? ` | tenants: ${d.hyperscalerTenants.join(', ')}` : '';
    return `- ${d.id} ${d.name} (${d.operator}) — ${d.city}, ${d.country} | ${d.status} | ${d.capacityMW} MW (${d.itLoadMW} MW IT) | PUE ${d.pue} | Tier ${d.tierRating} | COD ${d.expectedCOD}${tenants}`;
  }).join('\n');
}

export function buildSystemInstruction(): string {
  return `${APP_OVERVIEW}

# DC Roster (${DC_DATABASE.length} facilities)
${buildDCRoster()}
`.trim();
}

export function buildContextBlock(state: {
  lastDCFRun: DCFRunSnapshot | null;
  selectedDCId: string | null;
  hoveredDCId: string | null;
  activeWorkflow: string | null;
  pinContext?: LocationContext | null;
}): string {
  const parts: string[] = [];
  parts.push(`# Live App Context`);

  if (state.pinContext) {
    const c = state.pinContext;
    parts.push(`## Pinned Location`);
    if (c.geocoded) {
      const g = c.geocoded;
      parts.push(`Coordinates: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
      parts.push(`Country: ${g.country} (${g.countryCode})`);
      if (g.state) parts.push(`State/Region: ${g.state}`);
      if (g.city)  parts.push(`City/District: ${g.city}`);
      parts.push(`Place: ${g.displayName}`);
    } else {
      parts.push(`Coordinates: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} — country: ${c.country ?? 'unknown (verify from coordinates)'}`);
    }
    if (c.nearestSubstations[0]) {
      const s = c.nearestSubstations[0];
      parts.push(`Nearest substation: ${s.asset.properties.name} (${s.asset.properties.voltageKV} kV, ${s.asset.properties.availableHeadroomMVA} MVA headroom) at ${s.distanceKm.toFixed(1)} km`);
    }
    if (c.nearestLines[0]) {
      const l = c.nearestLines[0];
      parts.push(`Nearest transmission line: ${l.asset.name} (${l.asset.voltage_kV} kV) at ${l.distanceKm.toFixed(1)} km`);
    }
    if (c.nearestFibreNodes[0]) {
      const f = c.nearestFibreNodes[0];
      parts.push(`Nearest fibre node: ${f.asset.properties.name} at ${f.distanceKm.toFixed(1)} km`);
    }
    parts.push(`DCs within 25 km: ${c.nearbyDCs.length} (${c.totalNearbyMW.toLocaleString()} MW total, ${c.totalNearbyITLoad.toLocaleString()} MW IT load)`);
  }

  if (state.activeWorkflow) {
    parts.push(`Active workflow: ${state.activeWorkflow}`);
  }

  const focusDCId = state.selectedDCId ?? state.hoveredDCId;
  if (focusDCId) {
    const dc = DC_DATABASE.find((d) => d.id === focusDCId);
    if (dc) {
      parts.push(`Focus DC: ${dc.name} (${dc.id}) — ${dc.city}, ${dc.country}, ${dc.capacityMW} MW, ${dc.status}.`);
    }
  }

  if (state.lastDCFRun) {
    const { inputs: i, outputs: o } = state.lastDCFRun;
    parts.push(`Last DCF run (${i.projectName}, ${i.country}, ${i.totalCapacityMW} MW):`);
    parts.push(`  Capex: $${o.totalCapexUSDM.toFixed(0)}M (equity $${o.equityContributionUSDM.toFixed(0)}M, debt $${o.debtContributionUSDM.toFixed(0)}M)`);
    parts.push(`  Equity IRR: ${isNaN(o.equityIRRPct) ? 'N/A' : o.equityIRRPct.toFixed(1) + '%'} | Project IRR: ${isNaN(o.projectIRRPct) ? 'N/A' : o.projectIRRPct.toFixed(1) + '%'}`);
    parts.push(`  Equity NPV: $${o.equityNPVUSDM.toFixed(0)}M | Payback: ${o.paybackPeriodYears != null ? 'Y' + o.paybackPeriodYears : 'N/A'} | Multiple: ${o.equityMultiple.toFixed(1)}x`);
    parts.push(`  Min DSCR: ${o.minDSCR.toFixed(2)}x | Stabilised EBITDA: $${o.stabilisedEbitdaUSDM.toFixed(0)}M (${o.stabilisedEbitdaMarginPct.toFixed(0)}%)`);
    parts.push(`  Inputs: rack $${i.rackRateUSD_kW_month}/kW/mo, PUE ${i.pue}, power $${i.powerCostUSD_kWh}/kWh, equity ${i.equityPct}%, WACC ${(i.wacc * 100).toFixed(1)}%`);
    if (i.byopEnabled) {
      parts.push(`  BYOP: ${i.solarCapacityMWdc} MW solar + ${i.batteryStorageMWh} MWh battery, target displacement ${i.gridDisplacementPct}%`);
    }
  } else {
    parts.push(`No DCF run has been computed yet — the user can run the model from the Financial view.`);
  }

  return parts.join('\n');
}
