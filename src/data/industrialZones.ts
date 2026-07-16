import type { NorthernMyState } from '../types';

export type IndustrialZoneType =
  | 'tech_park'
  | 'free_industrial_zone'
  | 'industrial_estate'
  | 'special_economic_zone';

export interface IndustrialZone {
  id: string;
  name: string;
  type: IndustrialZoneType;
  state: NorthernMyState;
  lat: number;
  lng: number;
  areaHa?: number;
  keyTenants?: string;
  notes?: string;
}

export const INDUSTRIAL_ZONES: IndustrialZone[] = [
  // ── Penang ──────────────────────────────────────────────────────────────────
  {
    id: 'pen-bayan-lepas-fiz',
    name: 'Bayan Lepas Free Industrial Zone',
    type: 'free_industrial_zone',
    state: 'Penang',
    lat: 5.293, lng: 100.268,
    areaHa: 470,
    keyTenants: 'Intel, Bosch, Dell, Motorola Solutions, Agilent',
    notes: 'Penang\'s flagship electronics and semiconductor manufacturing hub since 1972.',
  },
  {
    id: 'pen-penang-science-park',
    name: 'Penang Science Park',
    type: 'tech_park',
    state: 'Penang',
    lat: 5.2928, lng: 100.4401,  // coord corrected (OSM Nominatim) — real PSP is mainland (Seberang Perai), was on the island in the Bayan Lepas FIZ area
    areaHa: 81,
    keyTenants: 'R&D and advanced manufacturing SMEs',
    notes: 'Phase 1 & 2 fully developed; hi-tech and knowledge-based industries.',
  },
  {
    id: 'pen-batu-kawan',
    name: 'Batu Kawan Industrial Park',
    type: 'industrial_estate',
    state: 'Penang',
    lat: 5.271, lng: 100.451,
    areaHa: 1100,
    keyTenants: 'Michelin, Lam Research, Corning',
    notes: 'Major growth corridor on Penang mainland near Penang Second Bridge.',
  },
  {
    id: 'pen-prai',
    name: 'Prai Industrial Estate',
    type: 'industrial_estate',
    state: 'Penang',
    lat: 5.393, lng: 100.390,
    areaHa: 380,
    keyTenants: 'Nestle, Carlsberg, General Cable',
    notes: 'Established mixed manufacturing estate in Seberang Perai Tengah.',
  },
  {
    id: 'pen-bukit-minyak',
    name: 'Bukit Minyak Industrial Park',
    type: 'industrial_estate',
    state: 'Penang',
    lat: 5.373, lng: 100.434,
    areaHa: 460,
    keyTenants: 'Electronics, precision engineering, E&E',
    notes: 'Electronics and E&E hub adjacent to Kulim Hi-Tech Park corridor.',
  },
  {
    id: 'pen-seberang-jaya',
    name: 'Seberang Jaya Industrial Area',
    type: 'industrial_estate',
    state: 'Penang',
    lat: 5.402, lng: 100.399,
    areaHa: 290,
    notes: 'Mature manufacturing zone near Prai River, mixed industries.',
  },

  // ── Kedah ────────────────────────────────────────────────────────────────────
  {
    id: 'kdh-kulim-hitech',
    name: 'Kulim Hi-Tech Park (KHTP)',
    type: 'tech_park',
    state: 'Kedah',
    lat: 5.4313, lng: 100.5709,  // coord corrected (OSM Nominatim) — was in plantation/forest
    areaHa: 1481,
    keyTenants: 'Siltronic, Osram, First Solar, X-Fab, Globetronics',
    notes: 'Malaysia\'s premier high-tech industrial park; wafer fab and solar module manufacturing.',
  },
  {
    id: 'kdh-sungai-petani',
    name: 'Sungai Petani Industrial Estate',
    type: 'industrial_estate',
    state: 'Kedah',
    lat: 5.648, lng: 100.492,
    areaHa: 350,
    keyTenants: 'E&E, plastics, food processing',
    notes: 'Main industrial zone in Kedah\'s second city.',
  },
  {
    id: 'kdh-mergong',
    name: 'Mergong Industrial Area',
    type: 'industrial_estate',
    state: 'Kedah',
    lat: 6.124, lng: 100.368,
    areaHa: 200,
    notes: 'Industrial precinct near Alor Setar, mixed light manufacturing.',
  },
  {
    id: 'kdh-gurun',
    name: 'Gurun Industrial Park',
    type: 'industrial_estate',
    state: 'Kedah',
    lat: 5.8280, lng: 100.4939,  // coord corrected (OSM Nominatim) — was in plantation/forest
    areaHa: 180,
    notes: 'Light and medium industry along the north-south corridor.',
  },
  {
    id: 'kdh-sik',
    name: 'Sik Industrial Area',
    type: 'industrial_estate',
    state: 'Kedah',
    lat: 5.831, lng: 100.744,
    areaHa: 120,
    notes: 'Small industrial zone in interior Kedah.',
  },
  {
    id: 'kdh-kuala-ketil',
    name: 'Kuala Ketil Industrial Estate',
    type: 'industrial_estate',
    state: 'Kedah',
    lat: 5.6058, lng: 100.6412,  // coord corrected (OSM Nominatim) — was in plantation/forest
    areaHa: 150,
    notes: 'Industrial zone near Baling road corridor.',
  },

  // ── Kedah (additional) ───────────────────────────────────────────────────────
  {
    id: 'kdh-rubber-city',
    name: 'Kedah Rubber City (KRC)',
    type: 'industrial_estate',
    state: 'Kedah',
    lat: 6.3330, lng: 100.6692,  // coord corrected (OSM Nominatim) — was in plantation/forest
    areaHa: 503,
    keyTenants: 'Latex processing, tyres, automotive rubber products, biotechnology',
    notes: 'NCER-designated rubber eco-industrial park in Padang Terap district; ~1,244 acres for rubber downstream and biotech industries.',
  },
  {
    id: 'kdh-kstp',
    name: 'Kedah Science and Technology Park (KSTP)',
    type: 'tech_park',
    state: 'Kedah',
    lat: 6.492, lng: 100.420,
    areaHa: 840,
    keyTenants: 'High-tech manufacturing, ICT, advanced materials, R&D',
    notes: 'NCER-designated science and technology park at Bukit Kayu Hitam, Kubang Pasu; ~1,938 acres for high-value technology industries near the Thai border corridor.',
  },

  // ── Perlis ───────────────────────────────────────────────────────────────────
  {
    id: 'pls-chuping-valley',
    name: 'Chuping Valley Industrial Area (CVIA)',
    type: 'special_economic_zone',
    state: 'Perlis',
    lat: 6.6035, lng: 100.2867,  // coord corrected (OSM Nominatim) — was in plantation/forest
    areaHa: 1005,
    keyTenants: 'Green industries, halal manufacturing, EV components, renewable energy',
    notes: 'NCER-designated premium border-town technology park at Felda Chuping; ~2,482 acres focused on green, halal and high-tech industries near the Thai border.',
  },
  {
    id: 'pls-chuping',
    name: 'Chuping Industrial Area',
    type: 'industrial_estate',
    state: 'Perlis',
    lat: 6.486, lng: 100.218,
    areaHa: 320,
    keyTenants: 'MSM Sugar (sugar refinery), industrial chemicals',
    notes: 'Agro-industrial complex centred on the Chuping sugar estate.',
  },
  {
    id: 'pls-kangar',
    name: 'Kangar Industrial Estate',
    type: 'industrial_estate',
    state: 'Perlis',
    lat: 6.436, lng: 100.196,
    areaHa: 90,
    notes: 'Main industrial zone in the Perlis state capital.',
  },
  {
    id: 'pls-padang-besar',
    name: 'Padang Besar Industrial & Trade Zone',
    type: 'special_economic_zone',
    state: 'Perlis',
    lat: 6.652, lng: 100.313,
    areaHa: 200,
    notes: 'Border trade and logistics zone at the Malaysia–Thailand checkpoint.',
  },

  // ── Perak ────────────────────────────────────────────────────────────────────
  {
    id: 'prk-chemor',
    name: 'Chemor Industrial Estate',
    type: 'industrial_estate',
    state: 'Perak',
    lat: 4.7195, lng: 101.1210,  // coord corrected (OSM Nominatim) — was in plantation/forest
    areaHa: 260,
    keyTenants: 'Ceramics, building materials, light manufacturing',
    notes: 'Industrial zone north of Ipoh along Kinta Valley.',
  },
  {
    id: 'prk-meru',
    name: 'Meru Industrial Park',
    type: 'industrial_estate',
    state: 'Perak',
    lat: 4.6688, lng: 101.0794,  // coord corrected (OSM Nominatim) — was in plantation/forest
    areaHa: 310,
    keyTenants: 'Metal fabrication, plastics, logistics',
    notes: 'Major Ipoh peripheral industrial zone; well-connected via PLUS highway.',
  },
  {
    id: 'prk-jelapang',
    name: 'Jelapang Industrial Area',
    type: 'industrial_estate',
    state: 'Perak',
    lat: 4.598, lng: 101.073,
    areaHa: 190,
    notes: 'Mature industrial precinct on the western fringe of Ipoh city.',
  },
  {
    id: 'prk-taiping',
    name: 'Taiping Industrial Estate',
    type: 'industrial_estate',
    state: 'Perak',
    lat: 4.857, lng: 100.735,
    areaHa: 220,
    notes: 'Mixed manufacturing in northern Perak near Taiping town.',
  },
  {
    id: 'prk-teluk-intan',
    name: 'Teluk Intan Industrial Area',
    type: 'industrial_estate',
    state: 'Perak',
    lat: 4.0232, lng: 101.0262,  // coord corrected (OSM Nominatim) — was in plantation/forest
    areaHa: 170,
    notes: 'Industrial zone in southern Perak serving the Hilir Perak district.',
  },
  {
    id: 'prk-proton-city',
    name: 'Proton City (Tanjung Malim Automotive SEZ)',
    type: 'special_economic_zone',
    state: 'Perak',
    lat: 3.688, lng: 101.519,
    areaHa: 2300,
    keyTenants: 'Proton, automotive vendors, logistics',
    notes: 'Dedicated automotive township and SEZ; Malaysia\'s national car assembly hub.',
  },
  {
    id: 'prk-lumut',
    name: 'Lumut Maritime Industrial Park',
    type: 'industrial_estate',
    state: 'Perak',
    lat: 4.224, lng: 100.638,
    areaHa: 400,
    keyTenants: 'Petronas gas plant, maritime services, MISC',
    notes: 'Port-based heavy industrial zone; deepwater jetties at Manjung.',
  },
  {
    id: 'prk-kampar',
    name: 'Kampar Industrial Park',
    type: 'industrial_estate',
    state: 'Perak',
    lat: 4.304, lng: 101.149,
    areaHa: 140,
    notes: 'Small-to-medium industry near UTAR Kampar campus corridor.',
  },
  {
    id: 'prk-sungai-siput',
    name: 'Sungai Siput Industrial Estate',
    type: 'industrial_estate',
    state: 'Perak',
    lat: 4.831, lng: 101.052,
    areaHa: 130,
    notes: 'Mixed light industry in northern Kinta Valley.',
  },
  {
    id: 'prk-bidor',
    name: 'Bidor Industrial Area',
    type: 'industrial_estate',
    state: 'Perak',
    lat: 4.1139, lng: 101.2884,  // coord corrected (OSM Nominatim) — was in plantation/forest
    areaHa: 110,
    notes: 'Small industrial zone serving southern Perak agriculture/logistics.',
  },
  {
    id: 'prk-ulu-kinta',
    name: 'Ulu Kinta Industrial Area',
    type: 'industrial_estate',
    state: 'Perak',
    lat: 4.565, lng: 101.115,
    areaHa: 200,
    notes: 'Eastern Kinta Valley industrial zone, formerly tin-mining land.',
  },
  {
    id: 'prk-silver-valley',
    name: 'Silver Valley Technology Park (SVTP)',
    type: 'tech_park',
    state: 'Perak',
    lat: 4.7475, lng: 101.1037,  // coord corrected (OSM) — beside Hevea KB in the Kanthan industrial zone; OSM's SVTP centroid falls on the adjacent mining pond
    areaHa: 1093,
    keyTenants: 'Advanced manufacturing, digital economy, pharmaceuticals, mineral processing',
    notes: 'NCER-designated technology park at Kanthan, Kinta District; ~2,700 acres (Phase 1: 816 acres) for advanced manufacturing and digital economy industries near Bandar Meru Raya.',
  },
];

export const ZONE_TYPE_COLORS: Record<IndustrialZoneType, string> = {
  tech_park:             '#06b6d4', // cyan
  free_industrial_zone:  '#f97316', // orange
  industrial_estate:     '#a855f7', // purple
  special_economic_zone: '#22c55e', // green
};

export const ZONE_TYPE_LABELS: Record<IndustrialZoneType, string> = {
  tech_park:             'Technology Park',
  free_industrial_zone:  'Free Industrial Zone',
  industrial_estate:     'Industrial Estate',
  special_economic_zone: 'Special Economic Zone',
};
