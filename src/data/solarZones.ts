import type { LandUseClass, RiskLevel } from '../types';

// Bounding-box-based land use and flood risk zones for northern Peninsular Malaysia.
// Priority order within each state: specific protected → urban → specific agri → broad agri → broad protected.
// getZoneAt() returns the FIRST match, so more specific zones must appear before broad catch-alls.

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

  // ═══════════════════════════════════════════════════════════════════════════
  // PERLIS — protected → urban → agricultural
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'perlis-forest-wang-kelian',
    label: 'Wang Kelian Forest Reserve (Perlis)',
    landUse: 'forest',
    floodRisk: 'low',
    isProtected: true,
    bounds: { south: 6.30, north: 6.50, west: 100.05, east: 100.16 },
    notes: 'Gazetted permanent forest reserve — excluded from solar development. East edge trimmed to 100.16°E so Kangar town (100.19°E+) is not mis-classified as forest.',
  },
  {
    id: 'perlis-urban-kangar',
    label: 'Kangar / Arau Urban Area (Perlis capital)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 6.40, north: 6.52, west: 100.16, east: 100.32 },
    notes: 'Kangar (state capital) and Arau (royal town). South edge 6.40°N avoids overlap with Chuping idle agri. Only rooftop / BIPV solar viable at scale.',
  },
  {
    id: 'perlis-urban-padang-besar',
    label: 'Padang Besar Border Town (Perlis)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 6.68, north: 6.76, west: 100.27, east: 100.40 },
    notes: 'Thai-Malaysia border crossing town. Urban/commercial land use.',
  },
  {
    id: 'perlis-sugarcane-idle',
    label: 'Chuping Sugar Estate / Idle Agri (Perlis)',
    landUse: 'idle_agri',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 6.28, north: 6.50, west: 100.10, east: 100.35 },
    notes: 'Former MSM sugar cane estate; largely idle after closure. Flat, sunny — top solar prospect. Placed before paddy-coast so the Chuping area is not mis-labelled as paddy.',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // KEDAH — protected → urban → agricultural
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'kedah-forest-ulu-muda',
    label: 'Ulu Muda Forest Reserve (Kedah)',
    landUse: 'forest',
    floodRisk: 'low',
    isProtected: true,
    bounds: { south: 5.70, north: 6.10, west: 101.10, east: 101.55 },
    notes: 'Key water catchment forest — fully protected. No development permitted.',
  },
  // Urban towns — must appear before broad MADA paddy zones that overlap them
  {
    id: 'kedah-urban-jitra',
    label: 'Jitra / Changlun Urban Area (Kedah)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 6.22, north: 6.33, west: 100.37, east: 100.52 },
    notes: 'Jitra district capital and Changlun border town. Urban commercial centre within MADA region.',
  },
  {
    id: 'kedah-urban-alor-setar',
    label: 'Alor Setar Urban Area (Kedah capital)',
    landUse: 'urban',
    floodRisk: 'medium',
    isProtected: false,
    bounds: { south: 6.05, north: 6.22, west: 100.33, east: 100.48 },
    notes: 'Kedah state capital. Densely urbanised — not suitable for utility-scale solar.',
  },
  {
    id: 'kedah-urban-sp',
    label: 'Sungai Petani Urban Area (Kedah)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.60, north: 5.72, west: 100.44, east: 100.55 },
    notes: 'Sungai Petani city — second-largest Kedah urban centre. Industrial and commercial land.',
  },
  {
    id: 'kedah-urban-kulim',
    label: 'Kulim Hi-Tech Park / Kulim Urban Area (Kedah)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.32, north: 5.46, west: 100.50, east: 100.65 },
    notes: 'Major industrial corridor — Kulim Hi-Tech Park (semiconductor/electronics). Urban/industrial zone.',
  },
  // MADA paddy schemes
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
    id: 'kedah-rubber-gurun',
    label: 'Gurun / Jeniang Rubber Estates (Kedah)',
    landUse: 'rubber',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.62, north: 5.95, west: 100.46, east: 100.72 },
    notes: 'Ageing rubber plantations. Many parcels under replanting / conversion.',
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
    id: 'kedah-oil-palm-south',
    label: 'South Kedah Oil Palm (Kedah)',
    landUse: 'oil_palm',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.35, north: 5.62, west: 100.55, east: 100.95 },
    notes: 'Commercial oil palm. Conversion to solar possible under FELDA/FELCRA frameworks.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PENANG — urban → industrial/mixed → agricultural
  // ═══════════════════════════════════════════════════════════════════════════

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
    id: 'penang-urban-butterworth',
    label: 'Butterworth / Seberang Jaya / Perai Urban Area (Penang)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.35, north: 5.52, west: 100.30, east: 100.44 },
    notes: 'Butterworth port city and Seberang Jaya/Perai industrial corridor. Major urban-industrial zone; not suitable for utility-scale solar.',
  },
  {
    id: 'penang-urban-bukit-mertajam',
    label: 'Bukit Mertajam / Nibong Tebal Urban Area (Penang)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.28, north: 5.42, west: 100.43, east: 100.56 },
    notes: 'Bukit Mertajam commercial hub and Nibong Tebal. Dense residential and industrial land use.',
  },
  {
    id: 'penang-batu-kawan',
    label: 'Batu Kawan / Simpang Ampat Industrial (Penang)',
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
  {
    id: 'penang-seberang-prai-agri',
    label: 'South Seberang Prai Paddy / Agricultural Zone (Penang)',
    landUse: 'paddy',
    floodRisk: 'medium',
    isProtected: false,
    bounds: { south: 5.22, north: 5.52, west: 100.35, east: 100.50 },
    notes: 'Active paddy and vegetable growing in southern Seberang Prai. Some idle parcels near industrial fringe.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERAK — specific protected coast → specific reservoirs → urban → paddy
  //         → oil palm → rubber → broad protected catch-alls
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Coastal protected zones ──────────────────────────────────────────────
  {
    id: 'perak-kuala-gula-mangrove',
    label: 'Kuala Gula Mangrove & Bird Sanctuary (Ramsar, N Perak coast)',
    landUse: 'forest',
    floodRisk: 'medium',
    isProtected: true,
    bounds: { south: 4.85, north: 5.12, west: 100.38, east: 100.53 },
    notes: 'Ramsar-listed mangrove and Important Bird Area. Fully protected — no solar development.',
  },
  {
    id: 'perak-coastal-mangrove-mid',
    label: 'Perak Mid-Coast Mangrove Strip (Lumut–Beruas)',
    landUse: 'forest',
    floodRisk: 'medium',
    isProtected: true,
    bounds: { south: 4.35, north: 4.85, west: 100.46, east: 100.56 },
    notes: 'Fringing mangrove and coastal forest along central Perak coast. Protected under Forestry Act.',
  },
  {
    id: 'perak-segari-forest',
    label: 'Segari Melintang Forest Reserve (Perak)',
    landUse: 'forest',
    floodRisk: 'low',
    isProtected: true,
    bounds: { south: 4.08, north: 4.35, west: 100.56, east: 100.73 },
    notes: 'Permanent forest reserve with sea-turtle nesting beaches. Fully protected.',
  },
  // ── Specific reservoirs (before Titiwangsa catch-all) ────────────────────
  {
    id: 'perak-temengor-reservoir',
    label: 'Temengor / Banding Reservoir (FPV candidate)',
    landUse: 'water',
    floodRisk: 'low',
    isProtected: true,
    bounds: { south: 5.28, north: 5.72, west: 101.28, east: 101.65 },
    notes: 'TNB hydro reservoir inside Royal Belum catchment. Floating solar (FPV) theoretically possible but requires TNB/DOE/Jabatan PERHILITAN approval.',
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
  // ── Urban towns (before any broad agricultural zones) ────────────────────
  {
    id: 'perak-urban-ipoh',
    label: 'Ipoh Urban Area (Perak capital)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 4.55, north: 4.72, west: 101.03, east: 101.18 },
    notes: 'Ipoh city — state capital of Perak, population ~750k metro. Not suitable for utility-scale solar.',
  },
  {
    id: 'perak-urban-taiping',
    label: 'Taiping Urban Area (Perak)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 4.82, north: 4.92, west: 100.71, east: 100.80 },
  },
  {
    id: 'perak-urban-kuala-kangsar',
    label: 'Kuala Kangsar Urban Area (Perak royal town)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 4.74, north: 4.82, west: 100.88, east: 100.96 },
    notes: 'Royal town of Perak. Town centre and palace grounds. East capped at 100.96°E so oil palm estates east of town are not mis-classified.',
  },
  {
    id: 'perak-urban-sungai-siput',
    label: 'Sungai Siput Urban Area (Perak)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 4.78, north: 4.88, west: 101.03, east: 101.14 },
    notes: 'Sungai Siput (Utara) — small industrial town. Limited utility-scale solar potential.',
  },
  {
    id: 'perak-urban-gerik',
    label: 'Gerik Urban Area (Hulu Perak gateway)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.38, north: 5.48, west: 101.09, east: 101.20 },
    notes: 'Gerik town — gateway to Belum-Temenggor forest. Small commercial and administrative centre.',
  },
  {
    id: 'perak-urban-sitiawan',
    label: 'Sitiawan / Lumut Urban Area (Perak)',
    landUse: 'urban',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 4.17, north: 4.27, west: 100.62, east: 100.70 },
  },
  {
    id: 'perak-urban-teluk-intan',
    label: 'Teluk Intan Urban Area (Hilir Perak capital)',
    landUse: 'urban',
    floodRisk: 'medium',
    isProtected: false,
    bounds: { south: 3.92, north: 4.03, west: 100.98, east: 101.08 },
  },
  // ── Paddy schemes (before oil palm overlaps) ─────────────────────────────
  {
    id: 'perak-paddy-kerian',
    label: 'Kerian Irrigation Scheme Paddy (N Perak coast)',
    landUse: 'paddy',
    floodRisk: 'high',
    isProtected: false,
    bounds: { south: 5.00, north: 5.15, west: 100.47, east: 100.80 },
    notes: 'KADA-managed double-cropping paddy granary. Federal approval required for conversion.',
  },
  {
    id: 'perak-paddy-seberang',
    label: 'Seberang Perak / Sungai Manik Paddy Scheme (Hilir Perak)',
    landUse: 'paddy',
    floodRisk: 'high',
    isProtected: false,
    bounds: { south: 3.97, north: 4.12, west: 100.95, east: 101.12 },
    notes: '~13,356 ha confirmed paddy in Hilir Perak. Active irrigation double-crop.',
  },
  // ── Oil palm zones (DOA/MPOB verified) ───────────────────────────────────
  {
    id: 'perak-oil-palm-kerian-inland',
    label: 'Kerian Inland Oil Palm Estates (N Perak)',
    landUse: 'oil_palm',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 4.85, north: 5.10, west: 100.55, east: 101.05 },
    notes: 'Oil palm estates east of Kerian paddy coastal strip. Private and FELDA-linked estates.',
  },
  {
    id: 'perak-oil-palm-larut-matang',
    label: 'Larut Matang & Selama Oil Palm (Perak)',
    landUse: 'oil_palm',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 4.48, north: 4.90, west: 100.65, east: 101.10 },
    notes: 'Larut Matang and Selama districts confirmed oil palm dominant (MPOB). Kuala Kangsar mukim ~22,382 ha oil palm.',
  },
  {
    id: 'perak-oil-palm-hilir-perak',
    label: 'Hilir Perak & Manjung Oil Palm',
    landUse: 'oil_palm',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 3.90, north: 4.55, west: 100.75, east: 101.35 },
    notes: '"Almost two-thirds of agricultural land is oil palms" — DOA Hilir Perak. Covers Manjung inland.',
  },
  {
    id: 'perak-rubber-midvalley',
    label: 'Perak Mid-Valley Rubber Remnant',
    landUse: 'rubber',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 4.20, north: 4.55, west: 100.80, east: 101.20 },
    notes: 'Remnant rubber smallholdings in central Perak. Larut Matang, Kuala Kangsar, and Hilir Perak reclassified to oil_palm.',
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
  // ── Fringe idle agri ─────────────────────────────────────────────────────
  {
    id: 'perak-idle-agri-upper',
    label: 'Upper Perak Idle / Fringe Agri (west of Gerik)',
    landUse: 'idle_agri',
    floodRisk: 'low',
    isProtected: false,
    bounds: { south: 5.20, north: 5.60, west: 100.88, east: 101.08 },
    notes: 'Fringe idle agricultural land north of Ipoh, west of Gerik. Grid access via the 275 kV Gerik substation.',
  },
  // ── Broad protected catch-alls (after all specific zones) ─────────────────
  {
    id: 'perak-royal-belum',
    label: 'Royal Belum State Park (Hulu Perak)',
    landUse: 'forest',
    floodRisk: 'low',
    isProtected: true,
    bounds: { south: 5.20, north: 5.72, west: 101.08, east: 101.70 },
    notes: 'Gazetted Royal Belum State Park. Largest contiguous rainforest in Peninsular Malaysia. Fully protected.',
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
];

// Returns the first matching zone for a coordinate, or null
export function getZoneAt(lat: number, lng: number): LandZone | null {
  for (const zone of LAND_ZONES) {
    const { south, north, west, east } = zone.bounds;
    if (lat >= south && lat <= north && lng >= west && lng <= east) return zone;
  }
  return null;
}
