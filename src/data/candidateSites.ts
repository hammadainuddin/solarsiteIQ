import type { CandidateSite, SiteScores } from '../types';

export const EMPTY_SCORES: SiteScores = {
  power: 0, competition: 0, utilities: 0, landRegulatory: 0, marketAccess: 0, total: 0, rank: 0,
};

export const EXAMPLE_SITES: CandidateSite[] = [
  {
    id: 'CAND-JB-NTP7B',
    name: 'Nusajaya Tech Park — Plot NTP-7B',
    country: 'MY',
    city: 'Iskandar Puteri',
    coordinates: { lat: 1.4295, lng: 103.6235 },
    status: 'available',
    landAreaHa: 16.2,
    askingPriceUSD: 38_400_000,
    zoningStatus: 'approved_industrial',
    floodRisk: 'low',
    seismicRisk: 'low',
    politicalRisk: 'low',
    distanceToSubstationKm: 0.9,
    substationCapacityMVA: 180,
    gridVoltageKV: 275,
    dedicatedGridConnection: true,
    distanceToFibreKm: 1.0,
    fibreCarrierCount: 3,
    distanceToIXKm: 5.2,
    distanceToAirportKm: 22,
    distanceToWaterKm: 3.8,
    waterSourceType: 'municipal_piped',
    waterAvailability: 'adequate',
    estimatedCapexUSDM: 480,
    estimatedAnnualOpexUSDM: 42,
    scores: EMPTY_SCORES,
    tags: ['Digital Corridor', 'IRDA Zone', 'TNB 275kV'],
    notes:
      'Prime parcel inside the Iskandar Puteri digital corridor, 850m from Nusajaya 275kV ' +
      'substation. Surrounded by confirmed Equinix JH1 and AirTrunk JB1 campuses. TNB ' +
      'dedicated connection available with 6-month lead time. IRDA fast-track permitting eligible.',
    createdAt: '2025-11-15',
  },
  {
    id: 'CAND-JB-SED12',
    name: 'Sedenak Industrial Park — Plot S-12',
    country: 'MY',
    city: 'Sedenak',
    coordinates: { lat: 1.6198, lng: 103.5481 },
    status: 'under_review',
    landAreaHa: 24.5,
    askingPriceUSD: 28_900_000,
    zoningStatus: 'approved_industrial',
    floodRisk: 'low',
    seismicRisk: 'low',
    politicalRisk: 'low',
    distanceToSubstationKm: 2.2,
    substationCapacityMVA: 80,
    gridVoltageKV: 132,
    dedicatedGridConnection: false,
    distanceToFibreKm: 4.8,
    fibreCarrierCount: 2,
    distanceToIXKm: 38,
    distanceToAirportKm: 18,
    distanceToWaterKm: 5.2,
    waterSourceType: 'municipal_piped',
    waterAvailability: 'adequate',
    estimatedCapexUSDM: 620,
    estimatedAnnualOpexUSDM: 38,
    scores: EMPTY_SCORES,
    tags: ['Large Parcel', 'Cost Advantage', 'Senai Airport Proximity'],
    notes:
      'Large greenfield parcel in Sedenak Industrial Park, ~2km from Global Switch announced ' +
      'campus. 132kV feed from Senai substation available; upgrade to 275kV feasible with ' +
      '20-month lead time and shared infrastructure cost. Fibre extension from Kulai backbone ' +
      'node required — estimated 18-month delivery. Land cost ~25% below NTP corridor.',
    createdAt: '2025-12-03',
  },
];
