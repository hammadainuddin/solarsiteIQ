import type { LandUseClass, RiskLevel } from '../types';

// Bounding-box-based land use and flood risk zones for northern Peninsular Malaysia.
// Used to estimate tile attributes for hex grid scoring.
// Coordinates are [south, north, west, east].

export interface LandZone {
  id: string;
  label: string;
  landUse: LandUseClass;
  floodRisk: RiskLevel;
  isProtected: boolean;
  bounds: { south: number; north: number; west: number; east: number };
  notes?: string;
}

export const LAND_ZONES: LandZone[] = [
  // ── Perlis ─────────────────────────────────────────────────────────────
  {
    id: 'perlis-sugarcane-idle',
    label: 'Chuping Sugar Estate / Idle Agri (Perlis)',
    landUse: 'idle_agri',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 6.28, north: 6.50, west: 100.10, east: 100.35 },
    notes: 'Former MSM sugar cane estate; largely idle after closure. Flat, sunny — top solar prospect.',
  },
  {
    id: 'perlis-paddy-coast',
    label: 'Perlis Paddy Zone (coastal)',
    landUse: 'paddy',
    floodRisk: 'medium',
    isProtected: false,
    bounds: { south: 6.30, north: 6.45, west: 100.25, east: 100.48 },
    notes: 'Active MADA-managed paddy. Conversion requires state/federal approval.',
  },
  {
    id: 'perlis-forest-wang-kelian',
    label: 'Wang Kelian Forest Reserve (Perlis)',
    landUse: 'forest',
    floodRisk: 'low',
    isProtected: true,
    bounds: { south: 6.30, north: 6.50, west: 100.05, east: 100.20 },
    notes: 'Gazetted permanent forest reserve — excluded from solar development.',
  },

  // ── Kedah — MADA (Muda Agricultural Development Authority) ────────────
  {
    id: 'kedah-mada-north',
    label: 'MADA Paddy Scheme — North Zone (Kedah/Perlis)',
    landUse: 'paddy',
    floodRisk: 'medium',
    isProtected: false,
    bounds: { south: 5.80, north: 6.32, west: 100.22, east: 100.60 },
    notes: 'Core MADA double-cropping paddy zone. Flat terrain ideal for solar but conversion politically sensitive (food security).',
  },
  {
    id: 'kedah-mada-south',
    label: 'MADA Paddy Scheme — South Zone (Kedah)',
    landUse: 'paddy',
    floodRisk: 'high',
    isProtected: false,
    bounds: { south: 5.55, north: 5.82, west: 100.28, east: 100.62 },
    notes: 'South MADA zone. Higher flood frequency due to Sungai Muda drainage.',
  },
  {
    id: 'kedah-idle-agri-baling',
    label: 'Baling / Sik Idle Agricultural Land (Kedah)',
    landUse: 'idle_agri',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.60, north: 5.90, west: 100.62, east: 101.05 },
    notes: 'Significant area of abandoned rubber / mixed scrub. Good solar, moderate grid access.',
  },
  {
    id: 'kedah-rubber-gurun',
    label: 'Gurun / Jeniang Rubber Estates (Kedah)',
    landUse: 'rubber',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.62, north: 5.95, west: 100.46, east: 100.72 },
    notes: 'Ageing rubber plantations. Many parcels under replanting / conversion.',
  },
  {
    id: 'kedah-oil-palm-south',
    label: 'South Kedah Oil Palm (Kedah)',
    landUse: 'oil_palm',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.35, north: 5.62, west: 100.55, east: 100.95 },
    notes: 'Commercial oil palm. Conversion to solar possible under FELDA/FELCRA frameworks.',
  },
  {
    id: 'kedah-urban-alor-setar',
    label: 'Alor Setar Urban Area',
    landUse: 'urban',
    floodRisk: 'medium',
    isProtected: false,
    bounds: { south: 6.05, north: 6.22, west: 100.33, east: 100.45 },
    notes: 'State capital urban zone — not suitable for utility-scale solar.',
  },
  {
    id: 'kedah-urban-sp',
    label: 'Sungai Petani Urban Area',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.60, north: 5.70, west: 100.45, east: 100.52 },
    notes: 'SP urban industrial fringe. Limited large parcels.',
  },
  {
    id: 'kedah-forest-ulu-muda',
    label: 'Ulu Muda Forest Reserve (Kedah)',
    landUse: 'forest',
    floodRisk: 'low',
    isProtected: true,
    bounds: { south: 5.70, north: 6.10, west: 101.10, east: 101.55 },
    notes: 'Key water catchment forest — fully protected. No development permitted.',
  },

  // ── Penang ────────────────────────────────────────────────────────────────
  {
    id: 'penang-seberang-prai-agri',
    label: 'Seberang Prai Agricultural / Padi Zone',
    landUse: 'paddy',
    floodRisk: 'medium',
    isProtected: false,
    bounds: { south: 5.22, north: 5.52, west: 100.35, east: 100.50 },
    notes: 'Active paddy and vegetable growing in Seberang Prai. Some idle parcels near industrial fringe.',
  },
  {
    id: 'penang-urban-island',
    label: 'Penang Island (Urban)',
    landUse: 'urban',
    floodRisk: 'medium',
    isProtected: false,
    bounds: { south: 5.18, north: 5.48, west: 100.15, east: 100.45 },
    notes: 'Penang island — densely urbanised. Only BIPV / rooftop solar viable.',
  },
  {
    id: 'penang-batu-kawan',
    label: 'Batu Kawan / Simpang Ampat Industrial',
    landUse: 'mixed_agri',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.22, north: 5.32, west: 100.40, east: 100.52 },
    notes: 'Mixed industrial/agri fringe near Penang third link. Some idle parcels with solar potential.',
  },
  {
    id: 'penang-kulim-kedah-border',
    label: 'Kulim–Penang Border Agri/Idle Land',
    landUse: 'idle_agri',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.28, north: 5.40, west: 100.52, east: 100.68 },
    notes: 'Idle/transitional agricultural land on Kedah–Penang border. Near Kulim 275kV grid.',
  },

  // ── Perak ──────────────────────────────────────────────────────────────────
  {
    id: 'perak-lower-paddy-coast',
    label: 'Lower Perak Coastal Paddy (Parit Buntar–Hutan Melintang)',
    landUse: 'paddy',
    floodRisk: 'high',
    isProtected: false,
    bounds: { south: 3.90, north: 5.15, west: 100.35, east: 100.75 },
    notes: 'Coastal paddy delta. High flood risk along Perak river delta. Limited solar suitability near coast.',
  },
  {
    id: 'perak-rubber-midvalley',
    label: 'Perak Valley Rubber / Mixed Agri',
    landUse: 'rubber',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 4.20, north: 5.00, west: 100.75, east: 101.35 },
    notes: 'Widespread rubber and mixed smallholder agriculture. Many parcels idle or under replanting — moderate solar potential.',
  },
  {
    id: 'perak-oil-palm-south',
    label: 'South Perak Oil Palm (Bidor–Tapah)',
    landUse: 'oil_palm',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 3.80, north: 4.35, west: 100.92, east: 101.45 },
    notes: 'Active oil palm. Land conversion under state land office or FELDA possible with long lead time.',
  },
  {
    id: 'perak-titiwangsa-forest',
    label: 'Titiwangsa / Main Range Forest (Perak)',
    landUse: 'forest',
    floodRisk: 'low',
    isProtected: true,
    bounds: { south: 3.80, north: 6.00, west: 101.30, east: 102.00 },
    notes: 'Titiwangsa permanent reserved forest. Steep terrain, high rainfall, fully protected. No solar development.',
  },
  {
    id: 'perak-bersia-lake',
    label: 'Temenggor / Bersia Reservoir Area',
    landUse: 'water',
    floodRisk: 'low',
    isProtected: true,
    bounds: { south: 5.10, north: 5.75, west: 101.25, east: 101.65 },
    notes: 'TNB hydro reservoir. Water body — floating solar on reservoir (FPV) is possible subject to TNB/DOE approval.',
  },
  {
    id: 'perak-idle-agri-upper',
    label: 'Upper Perak Idle / Fringe Agri (Grik Area)',
    landUse: 'idle_agri',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.20, north: 5.60, west: 100.88, east: 101.30 },
    notes: 'Fringe idle agricultural land north of Ipoh. Good solar, but grid access requires long connection to Gerik 275kV.',
  },
  {
    id: 'perak-urban-ipoh',
    label: 'Ipoh Urban Area',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 4.55, north: 4.70, west: 101.02, east: 101.17 },
    notes: 'Ipoh city — not suitable for utility-scale solar.',
  },
];

// Returns the first matching zone for a coordinate, or null
export function getZoneAt(lat: number, lng: number): LandZone | null {
  for (const zone of LAND_ZONES) {
    const { south, north, west, east } = zone.bounds;
    if (lat >= south && lat <= north && lng >= west && lng <= east) return zone;
  }
  return null;
}
