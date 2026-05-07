import type { LandUseClass, RiskLevel, NorthernMyState, HexTile } from '../types';
import type { GeocodedLocation } from './spatialContext';
import { getZoneAt } from '../data/solarZones';
import { estimateGHI, ghiLabel } from './ghi';
import { haversineKm } from './spatialContext';
import type { SubstationFeature } from '../data/infraLayers';
import type { TransmissionLine } from '../data/transmissionLines';
import { pointToPolylineKm } from './spatialContext';

export interface SolarLocationContext {
  lat: number;
  lng: number;
  geocoded: GeocodedLocation | null;
  state: NorthernMyState | null;
  // Solar resource
  ghiKwhM2Day: number;
  ghiLabel: string;
  // Grid
  distToGridKm: number;
  nearestGridVoltageKV: number;
  nearestSubstationName: string;
  nearestSubstationHeadroomMVA: number;
  // Land
  landUse: LandUseClass;
  isProtected: boolean;
  zoneLabel: string;
  // Climate
  floodRisk: RiskLevel;
  // Road
  distToRoadKm: number;
  // Scores (from hex tile if available)
  scores?: HexTile['scores'];
}

export function getSolarContext(
  lat: number,
  lng: number,
  geocoded: GeocodedLocation | null,
  lines: TransmissionLine[],
  subs: SubstationFeature[],
  tile?: HexTile,
): SolarLocationContext {
  const zone = getZoneAt(lat, lng);
  const ghi = tile?.attributes.ghiKwhM2Day ?? estimateGHI(lat, lng);

  // Nearest substation
  let subDist = Infinity;
  let bestSub: SubstationFeature | null = null;
  const p = { lat, lng };
  for (const sub of subs) {
    const d = haversineKm(p, { lat: sub.lat, lng: sub.lng });
    if (d < subDist) { subDist = d; bestSub = sub; }
  }

  // Nearest line (existing only)
  let lineDist = Infinity;
  let bestLineVoltage = 132;
  for (const line of lines) {
    if (line.status === 'planned') continue;
    const d = pointToPolylineKm(p, line.coords as [number, number][]);
    if (d < lineDist) { lineDist = d; bestLineVoltage = line.voltage_kV; }
  }

  // Pick whichever is closer — substation or line
  let distToGridKm: number;
  let nearestGridVoltageKV: number;
  if (subDist <= lineDist) {
    distToGridKm = +subDist.toFixed(1);
    nearestGridVoltageKV = bestSub?.properties.voltageKV ?? 132;
  } else {
    distToGridKm = +lineDist.toFixed(1);
    nearestGridVoltageKV = bestLineVoltage;
  }

  // Rough state assignment
  const stateMap: { state: NorthernMyState; south: number; north: number; west: number; east: number }[] = [
    { state: 'Perlis', south: 6.20, north: 6.75, west: 99.90, east: 100.50 },
    { state: 'Kedah',  south: 5.30, north: 6.40, west: 100.05, east: 101.20 },
    { state: 'Penang', south: 5.10, north: 5.55, west: 100.10, east: 100.55 },
    { state: 'Perak',  south: 3.80, north: 5.40, west: 100.30, east: 102.00 },
  ];
  let state: NorthernMyState | null = null;
  for (const b of stateMap) {
    if (lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east) { state = b.state; break; }
  }

  return {
    lat,
    lng,
    geocoded,
    state,
    ghiKwhM2Day: ghi,
    ghiLabel: ghiLabel(ghi),
    distToGridKm,
    nearestGridVoltageKV,
    nearestSubstationName: bestSub?.properties.name ?? 'Unknown',
    nearestSubstationHeadroomMVA: bestSub?.properties.availableHeadroomMVA ?? 0,
    landUse: zone?.landUse ?? tile?.attributes.landUse ?? 'unknown',
    isProtected: zone?.isProtected ?? tile?.attributes.isProtected ?? false,
    zoneLabel: zone?.label ?? 'Unknown zone',
    floodRisk: zone?.floodRisk ?? tile?.attributes.floodRisk ?? 'low',
    distToRoadKm: tile?.attributes.distToRoadKm ?? 5,
    scores: tile?.scores,
  };
}
