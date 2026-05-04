import type { WorkflowType } from '../types';
import type { LocationContext } from './spatialContext';

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// JSON-first output block prepended to every workflow prompt.
// The model must emit the JSON object BEFORE any prose — this lets us parse
// and show the result card as soon as the closing } arrives during streaming.
function jsonFirst(type: WorkflowType, metrics: string[]): string {
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
  "summary": "<3-4 sentence executive assessment of this location>"
}

---

`;
}

function buildLocationHeader(ctx: LocationContext): string {
  const { lat, lng, country, geocoded, nearestSubstations, nearestLines, nearestFibreNodes, nearbyDCs, totalNearbyMW } = ctx;
  const sub1   = nearestSubstations[0];
  const line1  = nearestLines[0];
  const fibre1 = nearestFibreNodes[0];

  // Prefer accurate geocoded location; fall back to bbox country code
  const locationLine = geocoded
    ? [
        `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        `Country: ${geocoded.country} (${geocoded.countryCode})`,
        geocoded.state ? `State/Region: ${geocoded.state}` : null,
        geocoded.city  ? `City/Area: ${geocoded.city}`    : null,
        `Place name: ${geocoded.displayName}`,
      ].filter(Boolean).join('\n')
    : `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}${country ? ` — inferred country: ${country}` : ''}`;

  const appData = [
    sub1
      ? `- Nearest substation (app data): ${sub1.asset.properties.name} (${sub1.asset.properties.voltageKV} kV) at ${fmtDist(sub1.distanceKm)}`
      : '- No substation in app dataset near this location',
    line1
      ? `- Nearest transmission line (app data): ${line1.asset.voltage_kV} kV at ${fmtDist(line1.distanceKm)}`
      : '- No transmission line in app dataset near this location',
    fibre1
      ? `- Nearest fibre node (app data): ${fibre1.asset.properties.name} at ${fmtDist(fibre1.distanceKm)}`
      : '- No fibre node in app dataset near this location',
    nearbyDCs.length > 0
      ? `- DCs within 25 km (app data): ${nearbyDCs.length} facilities, ${totalNearbyMW.toLocaleString()} MW total`
      : '- No data centres recorded within 25 km',
  ].join('\n');

  return `${locationLine}
App data context (may be incomplete — verify from real sources):
${appData}`;
}

export function buildLocationPrompt(workflow: WorkflowType, ctx: LocationContext): string {
  const header = buildLocationHeader(ctx);
  const { lat, lng } = ctx;

  switch (workflow) {
    case 'power':
      return `${jsonFirst('power', ['Grid Operator', 'Nearest Substation', 'Connection Voltage', 'Timeline', 'N-1 Redundancy'])}${header}

Task: Power infrastructure assessment for a 50-100 MW data centre at ${lat.toFixed(5)}, ${lng.toFixed(5)}.

Identify the exact location, the grid operator (TSO/DSO), nearest substations (name, voltage, headroom), realistic grid connection timeline and cost, N-1 redundancy options, and key risks. Use web search to verify current data.`;

    case 'carbon':
      return `${jsonFirst('carbon', ['Grid Emission Factor', 'Renewable Share', 'PPA Availability', 'PPA Price Range', 'BYOP Feasibility'])}${header}

Task: Carbon & renewable energy assessment for a data centre at ${lat.toFixed(5)}, ${lng.toFixed(5)}.

Identify the grid emission factor (kg CO₂e/kWh), current generation mix, RE PPA options and pricing (USD/MWh), BYOP solar viability, and green tariff availability. Use web search to find latest data.`;

    case 'load':
      return `${jsonFirst('load', ['Market Zone', 'Existing Supply', 'Pipeline Supply', 'Rack Rate', 'Hyperscaler Demand', 'Absorption Outlook'])}${header}

Task: Market absorption assessment for a new data centre at ${lat.toFixed(5)}, ${lng.toFixed(5)}.

Identify the micro-market zone, existing colo supply (MW), announced pipeline (MW), current rack rates (USD/kW/month), hyperscaler activity, and absorption outlook. Use web search for current figures.`;

    case 'connectivity':
      return `${jsonFirst('connectivity', ['RTT to Singapore', 'RTT to Hong Kong', 'RTT to Tokyo', 'Submarine Cables', 'IXP Presence', 'Connectivity Grade'])}${header}

Task: Connectivity assessment for a data centre at ${lat.toFixed(5)}, ${lng.toFixed(5)}.

Identify RTT latency to Singapore / Hong Kong / Tokyo, nearby submarine cable landing stations, active IXPs, dark fibre providers, and how this location compares to Tier-1 SEA hubs. Use web search for current data.`;

    case 'environment':
      return `${jsonFirst('environment', ['Flood Risk', 'Seismic Risk', 'Water Stress', 'Cyclone Exposure', 'Overall Risk Rating'])}${header}

Task: Environmental risk assessment for a data centre at ${lat.toFixed(5)}, ${lng.toFixed(5)}.

Assess flood risk (1-in-100yr), seismic hazard zone, water stress index, cyclone/typhoon exposure, and overall physical risk rating. Use web search and hazard maps to verify.`;

    case 'suitability':
      return `${jsonFirst('suitability', ['Power Score', 'Carbon & RE Score', 'Market Score', 'Connectivity Score', 'Environment Score', 'Composite Score', 'Swing Factor'])}${header}

Task: Composite site suitability assessment for a 50-100 MW data centre at ${lat.toFixed(5)}, ${lng.toFixed(5)}.

Score each dimension 0-100: Power (weight 30%), Carbon/RE (15%), Market (20%), Connectivity (20%), Environment (15%). Calculate weighted composite score. Identify the single swing factor that most affects the investment verdict. Use web search across all dimensions.`;

    default:
      return `${jsonFirst('suitability', ['Composite Score', 'Swing Factor'])}${header}

Assess suitability of ${lat.toFixed(5)}, ${lng.toFixed(5)} for a new data centre across power, carbon, market, connectivity, and environmental dimensions.`;
  }
}
