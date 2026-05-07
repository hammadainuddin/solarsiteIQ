import type { SolarWorkflowType } from '../types';
import type { SolarLocationContext } from './solarContext';

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function jsonFirst(type: SolarWorkflowType, metrics: string[]): string {
  const metricsStr = metrics.map((k) => `    "${k}": "<concise value>"`).join(',\n');
  return `IMPORTANT — OUTPUT FORMAT: Start your response with the JSON object below (all fields required, no markdown fences). Fill every field from your analysis and web search. After the JSON, write a supporting analysis paragraph.

{
  "type": "${type}",
  "score": <integer 0-100>,
  "verdict": "<Go|Conditional Go|Avoid>",
  "metrics": {
${metricsStr}
  },
  "topFindings": ["<key finding 1>", "<key finding 2>", "<key finding 3>"],
  "keyRisk": "<single most critical risk>",
  "summary": "<3-4 sentence executive assessment for this solar/BESS site>"
}

---

`;
}

function buildSolarHeader(ctx: SolarLocationContext): string {
  const loc = ctx.geocoded
    ? [
        `Coordinates: ${ctx.lat.toFixed(5)}, ${ctx.lng.toFixed(5)}`,
        `Country: ${ctx.geocoded.country} (${ctx.geocoded.countryCode})`,
        ctx.geocoded.state ? `State/Region: ${ctx.geocoded.state}` : null,
        ctx.geocoded.city  ? `City/Area: ${ctx.geocoded.city}`    : null,
        `Place name: ${ctx.geocoded.displayName}`,
      ].filter(Boolean).join('\n')
    : `Coordinates: ${ctx.lat.toFixed(5)}, ${ctx.lng.toFixed(5)}${ctx.state ? ` — State: ${ctx.state}` : ''}`;

  const appData = [
    `- GHI estimate: ${ctx.ghiKwhM2Day} kWh/m²/day (${ctx.ghiLabel})`,
    `- Land classification: ${ctx.landUse.replace('_', ' ')} — ${ctx.zoneLabel}`,
    ctx.isProtected ? '- PROTECTED area — development not permitted' : '- Not a gazetted protected area',
    `- Flood risk: ${ctx.floodRisk}`,
    `- Nearest grid: ${fmtDist(ctx.distToGridKm)} to ${ctx.nearestGridVoltageKV} kV infrastructure`,
    `- Nearest substation: ${ctx.nearestSubstationName} (${ctx.nearestSubstationHeadroomMVA} MVA available headroom)`,
    `- Estimated road distance: ${fmtDist(ctx.distToRoadKm)}`,
  ].join('\n');

  return `${loc}
App data context (verify from real sources):
${appData}`;
}

export function buildSolarPrompt(workflow: SolarWorkflowType, ctx: SolarLocationContext): string {
  const header = buildSolarHeader(ctx);
  const { lat, lng, state } = ctx;
  const stateStr = state ? `${state}, ` : '';

  switch (workflow) {
    case 'solar_resource':
      return `${jsonFirst('solar_resource', [
        'GHI (kWh/m²/day)', 'DNI (kWh/m²/day)', 'Performance Ratio Estimate',
        'Dust/Soiling Factor', 'Annual Yield (kWh/kWp)', 'Recommended Technology',
      ])}${header}

Task: Solar resource assessment for a 50 MW+ ground-mounted solar or BESS site at ${lat.toFixed(5)}, ${lng.toFixed(5)} (${stateStr}Malaysia).

Analyse the solar irradiance, cloud cover patterns, monsoon seasonality, soiling/dust risk, estimated annual specific yield, and recommended PV technology (monofacial/bifacial, tracking). Use web search to verify with SEDA Malaysia or NASA POWER data. Score 0–100 where 100 = best-in-class solar resource for Malaysia.`;

    case 'grid_interconnection':
      return `${jsonFirst('grid_interconnection', [
        'Grid Operator', 'Nearest Substation', 'Connection Voltage (kV)',
        'Available Headroom (MVA)', 'Connection Cost Estimate (RM M)', 'Energisation Timeline',
      ])}${header}

Task: Grid interconnection assessment for a ${stateStr}Malaysia solar/BESS project at ${lat.toFixed(5)}, ${lng.toFixed(5)}.

Identify the TNB substation for grid injection, connection voltage (132 kV vs 275 kV), available headroom, any planned CRESS/NESR reinforcements that affect this area, grid connection cost range, and realistic energisation timeline under the LSS or NEM framework. Use web search for current TNB headroom and SEDA LSS-6/7 registration data.`;

    case 'land_suitability':
      return `${jsonFirst('land_suitability', [
        'Land Classification', 'Soil Type', 'Slope Grade',
        'Drainage Class', 'Conversion Requirement', 'Tenure Type',
      ])}${header}

Task: Land suitability assessment for a solar farm at ${lat.toFixed(5)}, ${lng.toFixed(5)} in ${stateStr}Malaysia.

Assess land classification under the National Land Code (NLC), soil bearing capacity, topographic slope (flat <3° is ideal), drainage and waterlogging risk, land use conversion requirements (state land office, DOA, MADA if paddy), and likely tenure type (state land, private freehold, FELDA/FELCRA). Score 0–100 based on suitability for utility-scale solar construction.`;

    case 'land_availability':
      return `${jsonFirst('land_availability', [
        'Estimated Contiguous Area (ha)', 'Ownership Status', 'Fragmentation Risk',
        'Acquisition Pathway', 'Market Price Estimate (RM/acre)', 'Acquisition Timeline',
      ])}${header}

Task: Land availability and acquisition assessment for ${lat.toFixed(5)}, ${lng.toFixed(5)} in ${stateStr}Malaysia.

Estimate the contiguous land parcel size achievable, ownership structure (private, state, FELDA, FELCRA, smallholder), fragmentation risk, realistic acquisition pathway, indicative land price (RM/acre), and expected timeline from LOI to executed lease/sale. Reference the state land rules, idle land act (Act 428), and FELDA land conversion procedures for Malaysia.`;

    case 'climate_risk':
      return `${jsonFirst('climate_risk', [
        'Flood Zone Classification', '100-yr Flood Level (m AGL)', 'Annual Rainfall (mm)',
        'Cyclone / Wind Risk', 'Drought Risk', 'Composite Climate Score',
      ])}${header}

Task: Climate and flood risk assessment for a solar plant at ${lat.toFixed(5)}, ${lng.toFixed(5)} in ${stateStr}Malaysia.

Assess DID (Department of Irrigation and Drainage) flood zone classification, 100-year ARI flood level, annual rainfall, river proximity and drainage basin, cyclone/wind exposure (Malaysia has low tropical cyclone risk but occasional sumatras), and long-term climate change projections. Determine if elevated panel foundations or bunds are required. Use web search for DID flood maps and JMG (Jabatan Mineral dan Geosains) geohazard data.`;

    case 'road_access':
      return `${jsonFirst('road_access', [
        'Nearest Federal/State Road', 'Access Route Length (km)', 'Road Width / Bridge Limit',
        'Heavy Vehicle Suitability', 'Access Upgrade Cost Estimate (RM M)', 'Construction Logistics Rating',
      ])}${header}

Task: Road access and construction logistics assessment for ${lat.toFixed(5)}, ${lng.toFixed(5)} in ${stateStr}Malaysia.

Identify the nearest federal or state road, access route length, any narrow roads or bridges with load/width constraints, suitability for abnormal loads (transformer, long piles), estimated access upgrade cost, and overall construction logistics rating. Consider SPT (heavy transport permit) requirements from JKR Malaysia.`;

    case 'env_social':
      return `${jsonFirst('env_social', [
        'Protected Area Buffer (km)', 'Water Catchment Zone', 'Community Sensitivity',
        'DEIA Requirement', 'EIA Category (A/B)', 'Estimated Approval Timeline',
      ])}${header}

Task: Environmental and social impact assessment screening for a solar project at ${lat.toFixed(5)}, ${lng.toFixed(5)} in ${stateStr}Malaysia.

Assess proximity to Permanent Reserved Forest (PRF), Wildlife Sanctuary, Ramsar wetlands, Orang Asli settlements, and water catchment zones. Determine whether a Detailed Environmental Impact Assessment (DEIA) is required under the Environmental Quality Act 1974 (EQA) and PERHILITAN protected species guidelines. Estimate DOE/PERHILITAN approval timeline. Score 0–100 where 100 = minimal environmental constraint.`;

    case 'site_suitability':
      return `${jsonFirst('site_suitability', [
        'Solar Resource Score', 'Grid Interconnection Score', 'Land Suitability Score',
        'Land Availability Score', 'Climate Risk Score', 'Road Access Score',
        'Env & Social Score', 'Composite Score',
      ])}${header}

Task: Composite site suitability verdict for a 50 MW+ solar/BESS project at ${lat.toFixed(5)}, ${lng.toFixed(5)} in ${stateStr}Malaysia.

Synthesise all seven dimensions: solar resource, grid interconnection, land suitability, land availability, climate/flood risk, road access, and environmental & social impact. Apply Malaysian regulatory context (SEDA LSS programme, TNB grid access, NLC land conversion, DOE EIA). Provide scores for each dimension (0–100), a weighted composite (weights: solar 25%, grid 20%, land suit. 20%, land avail. 10%, climate 10%, road 8%, env/social 7%), and a Go / Conditional Go / Avoid verdict with the single most important swing factor.`;

    default:
      return `${header}\n\nAnalyse this solar development site in Malaysia and provide a structured assessment.`;
  }
}
