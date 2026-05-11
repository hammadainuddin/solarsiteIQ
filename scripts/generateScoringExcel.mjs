/**
 * Generates Solar_SiteIQ_Scoring.xlsx in the project root.
 * Run with: node scripts/generateScoringExcel.mjs
 */

import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'Solar_SiteIQ_Scoring.xlsx');

function aoaToSheet(data) {
  return XLSX.utils.aoa_to_sheet(data);
}

// ── Sheet 1: Scoring Framework Overview ──────────────────────────────────────

const s1 = aoaToSheet([
  ['Solar SiteIQ — Scoring Framework', '', '', '', ''],
  ['Northern Peninsular Malaysia  ·  Large-Scale Solar & REZ Site Screening', '', '', '', ''],
  ['H3 Resolution 6  ·  ~36.13 km² per tile  ·  ~6 km edge-to-edge', '', '', '', ''],
  [],
  ['#', 'Dimension', 'Weight (%)', 'Key Sub-factors', 'Primary Data Source'],
  ['1', 'Solar Resource Potential',  25, 'GHI kWh/m²/day, regional cloud cover, monsoon seasonality', 'SEDA Malaysia / NASA POWER reanalysis'],
  ['2', 'Grid Interconnection',      20, 'Distance to 132 kV+ line or substation, voltage level, available headroom (MVA)', 'TNB grid maps, OSM Overpass API'],
  ['3', 'Land Suitability',          20, 'Land use class, soil type, slope, drainage, protected status', 'NLC / DOA / state land use data'],
  ['4', 'Land Availability',         10, 'Tenure, fragmentation risk, acquisition pathway (NLC, FELDA, MADA)', 'State land office, FELDA, MADA records'],
  ['5', 'Climatic Conditions',       10, 'DID flood zone, annual rainfall, river proximity, drainage basin', 'DID flood maps, JMG'],
  ['6', 'Road Access',                8, 'Distance to federal/state road, heavy vehicle suitability, bridge constraints', 'JKR road network'],
  ['7', 'Environmental & Social',     7, 'PRF buffer, Orang Asli settlements, water catchment, DOE EIA category', 'PERHILITAN, DOE Malaysia'],
  [],
  ['', 'Composite Score', '100%', 'Weighted sum of all 7 dimensions (0–100)', ''],
  [],
  ['Verdict Thresholds', '', '', '', ''],
  ['Go',             '≥ 70',    'Site suitable for 50 MW+ development with manageable constraints', '', ''],
  ['Conditional Go', '45 – 69', 'Development possible but requires mitigation, upgrade, or approval', '', ''],
  ['Avoid',          '< 45',    'Significant constraints — development unviable or very high risk', '', ''],
  [],
  ['REZ Candidate Selection', '', '', '', ''],
  ['Method', 'Top-25 individual hex tiles ranked by composite score', '', '', ''],
  ['Tier 1 (Rank 1–5)', 'Green outline (2.5 px) — highest-priority REZ candidates', '', '', ''],
  ['Tier 2 (Rank 6–15)', 'Cyan outline (1.5 px)', '', '', ''],
  ['Tier 3 (Rank 16–25)', 'Amber outline (1.5 px)', '', '', ''],
]);
s1['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 14 }, { wch: 62 }, { wch: 38 }];
s1['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
  { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
];

// ── Sheet 2: Dimension Scoring Tables ────────────────────────────────────────

const s2 = aoaToSheet([
  ['Dimension Scoring Breakpoints  (matching src/utils/solarScoring.ts)', '', '', ''],
  [],
  // ── Solar
  ['1. Solar Resource  →  scoreGHI(ghi)'],
  ['GHI (kWh/m²/day)', 'Score', 'Interpolation', 'Comment'],
  ['≥ 5.4',       100,   'Fixed',                  'Best-in-class for Malaysia (Perlis / NW Kedah)'],
  ['5.2 – 5.4',   '85 → 100', 'Linear over 0.2°', 'Excellent — Central Kedah plains'],
  ['5.0 – 5.2',   '65 → 85',  'Linear over 0.2°', 'Good — Perak valley / Penang mainland'],
  ['4.8 – 5.0',   '45 → 65',  'Linear over 0.2°', 'Moderate — Penang island, lower Perak coast'],
  ['4.5 – 4.8',   '20 → 45',  'Linear over 0.3°', 'Low — highland fringe / Titiwangsa edge'],
  ['< 4.5',       10,    'Fixed',                  'Poor — Highland Perak; avoid'],
  [],
  // ── Grid
  ['2. Grid Interconnection  →  scoreGridProximity(distKm, voltageKV)'],
  ['Distance (km)', 'Base Score Range', 'Interpolation', 'Notes'],
  ['≤ 2',       100,         'Fixed',                  'Direct connection viable'],
  ['2 – 5',     '70 → 90',   'Linear, −6.7/km',        'Short spur acceptable'],
  ['5 – 15',    '45 → 70',   'Linear, −2.5/km',        'Moderate connection cost'],
  ['15 – 30',   '25 → 45',   'Linear, −1.3/km',        'Long connection, costly'],
  ['30 – 60',   '5 → 25',    'Linear, −0.67/km',       'Very long — viability marginal'],
  ['> 60',      5,           'Fixed',                  'Avoid unless strategic'],
  [],
  ['Voltage Bonus (added to distance score, capped at 100)'],
  ['≥ 275 kV substation / line', '+15 pts', 'High injection capacity — 500 kV backbone also qualifies', ''],
  ['132 kV substation / line',   '+5 pts',  'Distribution voltage — adequate for LSS up to ~50 MW',   ''],
  [],
  // ── Land suitability
  ['3. Land Suitability  →  scoreLandUse(landUse, isProtected)'],
  ['Land Use Class', 'Score', '', 'Rationale'],
  ['idle_agri',  95, '', 'Former rubber/sugarcane; minimal conversion barrier'],
  ['rubber',     75, '', 'Ageing estates; conversion via state land office'],
  ['mixed_agri', 65, '', 'Smallholder; fragmented but accessible'],
  ['oil_palm',   55, '', 'Active crop; FELDA/FELCRA conversion required'],
  ['water',      40, '', 'FPV possible; TNB/DOE permitting required'],
  ['paddy',      35, '', 'MADA food-security constraint; federal approval needed'],
  ['unknown',    50, '', 'Default for unclassified tiles'],
  ['urban',      10, '', 'Not suitable for utility-scale solar'],
  ['forest',      0, '', 'PRF — fully protected; no development'],
  ['Protected area (any class)', 0, '', 'isProtected override → score forced to 0'],
  [],
  // ── Land availability
  ['4. Land Availability  →  scoreAvailability(landUse, isProtected)  [proxy]'],
  ['Land Use Class', 'Score', '', 'Notes'],
  ['idle_agri',  90, '', 'High availability; state or idle private land'],
  ['rubber',     70, '', 'Many parcels under conversion'],
  ['mixed_agri', 60, '', 'Fragmented smallholdings'],
  ['oil_palm',   50, '', 'Active operations; long lead time'],
  ['water',      35, '', 'FPV site; complex ownership'],
  ['paddy',      25, '', 'MADA-managed; very restricted conversion'],
  ['urban',       5, '', 'Minimal land availability'],
  ['forest',      0, '', 'Not available'],
  ['Protected',   0, '', 'Protected → 0'],
  [],
  // ── Climate
  ['5. Climatic Conditions  →  scoreFloodRisk(risk)'],
  ['Flood Risk Level', 'Score', '', 'Typical Scenario'],
  ['low',     95, '', 'No significant flood history; well-drained terrain'],
  ['medium',  65, '', 'Occasional inundation; bunding / drainage works may be required'],
  ['high',    30, '', 'Frequent flooding; elevated foundations likely needed'],
  ['extreme',  5, '', 'Regularly inundated; not suitable for ground-mount solar'],
  [],
  // ── Road access
  ['6. Road Access  →  scoreRoadAccess(distKm)'],
  ['Distance to Road (km)', 'Score Range', 'Interpolation', 'Notes'],
  ['≤ 1',     100,       'Fixed',              'Direct access'],
  ['1 – 3',   '75 → 90', 'Linear, −7.5/km',   'Short access road upgrade'],
  ['3 – 8',   '50 → 75', 'Linear, −5/km',     'Moderate access works'],
  ['8 – 20',  '25 → 50', 'Linear, −2.1/km',   'Significant access road required'],
  ['20 – 40', '10 → 25', 'Linear, −0.75/km',  'Very costly access works'],
  ['> 40',    10,        'Fixed',              'Not viable without major infrastructure investment'],
  [],
  // ── Env & social
  ['7. Environmental & Social  →  scoreEnvSocial(isProtected, landUse, floodRisk)'],
  ['Condition', 'Effect on Score', '', ''],
  ['Base score (no constraints)', 80, '', ''],
  ['isProtected = true', '→ 0 (hard override)', '', ''],
  ['landUse = forest',   '→ 0 (hard override)', '', ''],
  ['landUse = water',    '− 15 pts',            '', 'FPV permitting and ecological sensitivity'],
  ['landUse = paddy',    '− 20 pts',            '', 'Community food-security and social sensitivity'],
  ['floodRisk = high',   '− 10 pts',            '', ''],
  ['floodRisk = extreme','− 25 pts',            '', ''],
  ['Minimum',            0,                     '', 'Clamped to 0'],
]);
s2['!cols'] = [{ wch: 38 }, { wch: 16 }, { wch: 22 }, { wch: 54 }];

// ── Sheet 3: Capacity Estimation ─────────────────────────────────────────────

const s3 = aoaToSheet([
  ['Solar Capacity Estimation Methodology', '', '', ''],
  [],
  ['Formula', '', '', ''],
  ['Estimated MW  =  Tile Area (km²)  ×  Usable Land Fraction  ×  Solar Density (MW/km²)', '', '', ''],
  [],
  ['Parameter', 'Value', 'Basis', ''],
  ['H3 Resolution-6 tile area', '36.13 km²', 'H3 spec average area at res 6', ''],
  ['Solar density', '4.5 MW/km²', 'Industry standard for utility-scale ground-mount (accounts for panel row spacing, access tracks, inverter buildings, buffer zones)', ''],
  ['Protected land usable fraction', '0%', 'Gazetted protected areas — no development permitted', ''],
  [],
  ['Usable Land Fraction by Land Use Class', '', '', ''],
  ['Land Use Class', 'Usable Fraction', 'Typical Est. Capacity (MW)', 'Rationale'],
  ['idle_agri',  '70%', Math.round(36.13 * 0.70 * 4.5), 'Fallow / unused farmland — minimal competing use'],
  ['rubber',     '50%', Math.round(36.13 * 0.50 * 4.5), 'Ageing rubber estates; some processing facilities present'],
  ['mixed_agri', '40%', Math.round(36.13 * 0.40 * 4.5), 'Mix of crops, farm buildings and access tracks'],
  ['oil_palm',   '25%', Math.round(36.13 * 0.25 * 4.5), 'Active plantation with mills — significant committed use'],
  ['water (FPV)','15%', Math.round(36.13 * 0.15 * 4.5), 'Floating solar potential on reservoir or ex-mining pond'],
  ['paddy',      '10%', Math.round(36.13 * 0.10 * 4.5), 'MADA irrigated paddy — actively farmed with flood infrastructure'],
  ['urban',       '3%', Math.round(36.13 * 0.03 * 4.5), 'Rooftop / car-park solar only within urban tiles'],
  ['forest',      '0%', 0,                               'Protected / gazetted forest — not developable'],
  ['unknown',    '30%', Math.round(36.13 * 0.30 * 4.5), 'Conservative default for unclassified tiles'],
  [],
  ['Offshore Exclusion', '', '', ''],
  ['Method', 'Eight bounding boxes cover the Strait of Malacca coastal waters within the screening extent', '', ''],
  ['', 'Tile centres inside any box are discarded before scoring', '', ''],
  ['', 'Inland water bodies (Temenggor reservoir, ex-mining ponds east of lng 101°E) are unaffected', '', ''],
  [],
  ['Offshore Exclusion Boxes', '', '', ''],
  ['Description', 'South', 'North', 'West', 'East'],
  ['Open sea west of 100°E (all latitudes)', 3.70, 7.10, 99.50, 100.00],
  ['Sea off Perlis coast', 6.20, 7.10, 100.00, 100.15],
  ['Sea off north Kedah coast', 5.80, 6.20, 100.00, 100.12],
  ['Sea off south Kedah / Penang area', 5.20, 5.80, 100.00, 100.15],
  ['Sea south-west of Penang island', 4.85, 5.20, 100.00, 100.25],
  ['Sea off north Perak coast', 4.40, 4.85, 100.00, 100.32],
  ['Sea off mid-Perak coast', 4.00, 4.40, 100.00, 100.40],
  ['Sea off south Perak coast', 3.70, 4.00, 100.00, 100.48],
]);
s3['!cols'] = [{ wch: 46 }, { wch: 18 }, { wch: 26 }, { wch: 10 }, { wch: 10 }];

// ── Sheet 4: GHI Regional Data ────────────────────────────────────────────────

const s4 = aoaToSheet([
  ['GHI Regional Estimates — Northern Peninsular Malaysia', '', '', '', '', ''],
  [],
  ['Region', 'States', 'GHI Min\n(kWh/m²/d)', 'GHI Max\n(kWh/m²/d)', 'GHI Mid\n(kWh/m²/d)', 'Notes'],
  ['Perlis / NW Kedah',            'Perlis, N. Kedah',  5.3, 5.6, 5.45, 'Flattest terrain, driest, highest GHI in Malaysia'],
  ['Central Kedah — MADA plains',  'Kedah',             5.1, 5.4, 5.25, 'Double-cropping paddy plains; slightly higher humidity'],
  ['East Kedah — Baling / Sik',    'Kedah',             5.0, 5.3, 5.15, 'More inland cloud cover; surrounded by idle agri land'],
  ['Penang',                        'Penang',            4.8, 5.1, 4.95, 'Island/coastal; higher humidity, urban heat island on island'],
  ['Perak Valley — Ipoh corridor', 'Perak',             4.9, 5.3, 5.10, 'Valley; some topographic shading N–S'],
  ['Lower Perak coast',            'Perak',             4.8, 5.1, 4.95, 'Coastal delta; cloud and humidity impact'],
  ['Titiwangsa / Highland Perak',  'Perak (E)',         4.4, 4.8, 4.60, 'High elevation, persistent cloud, not viable for utility solar'],
  [],
  ['Source: SEDA Malaysia solar resource atlas; NASA POWER reanalysis (2000–2023 average)'],
  ['Units: kWh/m²/day (Global Horizontal Irradiance — GHI)'],
]);
s4['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 58 }];

// ── Sheet 5: TNB Substation Reference ────────────────────────────────────────

const substations = [
  // Perlis
  ['Bukit Keteri 275/132 kV PMU',        'Perlis',  6.384, 100.196, 275, 630, 280, true,  'Main bulk supply for Perlis. Strategic for large LSS injection.'],
  ['Kangar 132/33 kV',                   'Perlis',  6.444, 100.195, 132, 120,  55, false, 'Perlis state capital distribution. Limited headroom.'],
  ['Arau 132/33 kV',                     'Perlis',  6.426, 100.275, 132,  90,  40, false, 'Feeds Arau industrial and UniMAP zone.'],
  // Kedah
  ['Alor Setar 275/132 kV PMU',          'Kedah',   6.104, 100.370, 275, 500, 180, true,  'Kedah state capital bulk supply. Serves MADA zone.'],
  ['Gurun 132/33 kV',                    'Kedah',   5.817, 100.457, 132, 160,  70, false, 'Mid-Kedah industrial distribution.'],
  ['Sungai Petani 132/33 kV PMU',        'Kedah',   5.652, 100.487, 132, 250,  85, false, 'Largest load centre in Kedah after Alor Setar.'],
  ['Kulim 275/132 kV PMU (KHTP)',        'Kedah',   5.378, 100.553, 275, 450, 140, true,  'Primary supply for Kulim Hi-Tech Park. LSS-dedicated spur planned.'],
  ['Baling 132/33 kV',                   'Kedah',   5.677, 100.921, 132,  80,  45, false, 'East Kedah rural. Surrounded by large idle agri land.'],
  ['Sik 132/33 kV',                      'Kedah',   5.800, 100.740, 132,  60,  30, false, 'Rural Kedah near significant idle/scrubland.'],
  ['Jitra 132/33 kV',                    'Kedah',   6.263, 100.419, 132, 110,  50, false, 'North Kedah paddy zone substation.'],
  ['Pendang 132/33 kV',                  'Kedah',   5.995, 100.521, 132,  80,  35, false, 'MADA paddy heartland. Constrained headroom.'],
  // Penang
  ['Bukit Minyak 275/132 kV PMU',        'Penang',  5.352, 100.468, 275, 630,  90, true,  'Main bulk supply Penang mainland industrial. High utilisation.'],
  ['Pauh 132/33 kV',                     'Penang',  5.396, 100.418, 132, 200,  55, false, 'South Seberang Prai (Batu Kawan adjacent).'],
  ['Prai 132/33 kV',                     'Penang',  5.512, 100.393, 132, 180,  40, false, 'Prai industrial. High utilisation due to port demand.'],
  // Perak
  ['Ipoh North 275/132 kV PMU',          'Perak',   4.647, 101.080, 275, 500, 160, true,  'Main bulk supply for Ipoh. Good headroom for RE.'],
  ['Gerik 275/132 kV (Bersia Hydro)',    'Perak',   5.418, 101.134, 275, 320, 200, true,  'Near Bersia/Temenggor hydro. Significant headroom.'],
  ['Sungai Siput 132/33 kV',             'Perak',   4.844, 101.051, 132, 120,  65, false, 'Upper Perak valley. Near flat agri land.'],
  ['Bidor 132/33 kV',                    'Perak',   4.118, 101.281, 132, 100,  55, false, 'South Perak. Oil palm and rubber surroundings.'],
  ['Parit Buntar 132/33 kV',             'Perak',   5.122, 100.492, 132,  90,  48, false, 'Lower Perak / Kedah border. Paddy surroundings.'],
  ['Taiping 132/33 kV PMU',              'Perak',   4.852, 100.737, 132, 180,  75, false, 'Perak NW distribution. Near Bukit Larut fringe.'],
  ['Teluk Intan 132/33 kV',             'Perak',   3.977, 101.020, 132, 110,  42, false, 'Lower Perak coast. Flood-prone; limited solar suitability.'],
];

const s5 = aoaToSheet([
  ['TNB Substation Reference — Northern Peninsular Malaysia', '', '', '', '', '', '', '', ''],
  [],
  ['Substation Name', 'State', 'Lat', 'Lng', 'Voltage (kV)', 'Capacity (MVA)', 'Est. Headroom (MVA)', 'Dedicated Feed', 'Notes'],
  ...substations,
]);
s5['!cols'] = [{ wch: 36 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 60 }];

// ── Sheet 6: Land Zones ───────────────────────────────────────────────────────

const landZones = [
  ['perlis-sugarcane-idle',   'Chuping Sugar Estate / Idle Agri (Perlis)',         'idle_agri',  'low',    false, 6.28, 6.50, 100.10, 100.35, 'Former MSM sugar cane estate. Top solar prospect.'],
  ['perlis-paddy-coast',      'Perlis Paddy Zone (coastal)',                        'paddy',      'medium', false, 6.30, 6.45, 100.25, 100.48, 'Active MADA-managed paddy. Conversion requires approval.'],
  ['perlis-forest-wang-kelian','Wang Kelian Forest Reserve (Perlis)',               'forest',     'low',    true,  6.30, 6.50, 100.05, 100.20, 'Gazetted PRF — excluded.'],
  ['kedah-mada-north',        'MADA Paddy Scheme — North Zone',                    'paddy',      'medium', false, 5.80, 6.32, 100.22, 100.60, 'Core MADA double-cropping. Politically sensitive.'],
  ['kedah-mada-south',        'MADA Paddy Scheme — South Zone',                    'paddy',      'high',   false, 5.55, 5.82, 100.28, 100.62, 'High flood frequency — Sungai Muda drainage.'],
  ['kedah-idle-agri-baling',  'Baling / Sik Idle Agricultural Land',               'idle_agri',  'low',    false, 5.60, 5.90, 100.62, 101.05, 'Abandoned rubber/mixed scrub. Good solar, moderate grid.'],
  ['kedah-rubber-gurun',      'Gurun / Jeniang Rubber Estates',                    'rubber',     'low',    false, 5.62, 5.95, 100.46, 100.72, 'Ageing rubber. Many parcels under replanting/conversion.'],
  ['kedah-oil-palm-south',    'South Kedah Oil Palm',                              'oil_palm',   'low',    false, 5.35, 5.62, 100.55, 100.95, 'Commercial oil palm. FELDA/FELCRA conversion possible.'],
  ['kedah-forest-ulu-muda',   'Ulu Muda Forest Reserve',                           'forest',     'low',    true,  5.70, 6.10, 101.10, 101.55, 'Key water catchment — fully protected.'],
  ['penang-seberang-prai-agri','Seberang Prai Agricultural / Paddy Zone',          'paddy',      'medium', false, 5.22, 5.52, 100.35, 100.50, 'Active paddy and vegetables. Some idle parcels.'],
  ['penang-batu-kawan',       'Batu Kawan / Simpang Ampat Industrial',             'mixed_agri', 'low',    false, 5.22, 5.32, 100.40, 100.52, 'Mixed industrial/agri fringe. Some idle parcels.'],
  ['penang-kulim-kedah-border','Kulim–Penang Border Idle Land',                    'idle_agri',  'low',    false, 5.28, 5.40, 100.52, 100.68, 'Idle/transitional land. Near Kulim 275 kV grid.'],
  ['perak-lower-paddy-coast', 'Lower Perak Coastal Paddy',                         'paddy',      'high',   false, 3.90, 5.15, 100.35, 100.75, 'Coastal paddy delta. High flood risk.'],
  ['perak-rubber-midvalley',  'Perak Valley Rubber / Mixed Agri',                  'rubber',     'low',    false, 4.20, 5.00, 100.75, 101.35, 'Widespread rubber and mixed smallholder.'],
  ['perak-oil-palm-south',    'South Perak Oil Palm (Bidor–Tapah)',                'oil_palm',   'low',    false, 3.80, 4.35, 100.92, 101.45, 'Active oil palm. FELDA conversion with long lead.'],
  ['perak-titiwangsa-forest', 'Titiwangsa / Main Range Forest',                    'forest',     'low',    true,  3.80, 6.00, 101.30, 102.00, 'Permanent reserved forest. No development.'],
  ['perak-bersia-lake',       'Temenggor / Bersia Reservoir (FPV candidate)',       'water',      'low',    true,  5.10, 5.75, 101.25, 101.65, 'TNB hydro reservoir. FPV possible subject to TNB/DOE approval.'],
  ['perak-idle-agri-upper',   'Upper Perak Idle / Fringe Agri (Grik Area)',        'idle_agri',  'low',    false, 5.20, 5.60, 100.88, 101.30, 'Good solar. Grid access requires long connection to Gerik.'],
];

const s6 = aoaToSheet([
  ['Land Use Zone Reference — Northern Peninsular Malaysia', '', '', '', '', '', '', '', '', ''],
  [],
  ['Zone ID', 'Label', 'Land Use', 'Flood Risk', 'Protected', 'Bounds S', 'Bounds N', 'Bounds W', 'Bounds E', 'Notes'],
  ...landZones,
]);
s6['!cols'] = [{ wch: 28 }, { wch: 44 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 60 }];

// ── Sheet 7: Industrial Zones & Technology Parks ──────────────────────────────

const industrialZones = [
  // Penang
  ['pen-bayan-lepas-fiz',   'Bayan Lepas Free Industrial Zone',              'free_industrial_zone',  'Penang',  5.293, 100.268,  470, 'Intel, Bosch, Dell, Motorola Solutions, Agilent',          'Penang flagship electronics hub since 1972.'],
  ['pen-penang-science-park','Penang Science Park',                          'tech_park',             'Penang',  5.290, 100.283,   81, 'R&D and advanced manufacturing SMEs',                      'Phase 1 & 2 fully developed. Hi-tech industries.'],
  ['pen-batu-kawan',         'Batu Kawan Industrial Park',                   'industrial_estate',     'Penang',  5.271, 100.451, 1100, 'Michelin, Lam Research, Corning',                          'Major growth corridor near Penang Second Bridge.'],
  ['pen-prai',               'Prai Industrial Estate',                       'industrial_estate',     'Penang',  5.393, 100.390,  380, 'Nestle, Carlsberg, General Cable',                         'Established mixed manufacturing in Seberang Perai Tengah.'],
  ['pen-bukit-minyak',       'Bukit Minyak Industrial Park',                 'industrial_estate',     'Penang',  5.373, 100.434,  460, 'Electronics, precision engineering, E&E',                  'Electronics hub adjacent to Kulim Hi-Tech Park corridor.'],
  ['pen-seberang-jaya',      'Seberang Jaya Industrial Area',                'industrial_estate',     'Penang',  5.402, 100.399,  290, '',                                                         'Mature manufacturing zone near Prai River.'],
  // Kedah
  ['kdh-kulim-hitech',       'Kulim Hi-Tech Park (KHTP)',                    'tech_park',             'Kedah',   5.388, 100.568, 1481, 'Siltronic, Osram, First Solar, X-Fab, Globetronics',       "Malaysia's premier hi-tech park; wafer fab & solar modules."],
  ['kdh-sungai-petani',      'Sungai Petani Industrial Estate',              'industrial_estate',     'Kedah',   5.648, 100.492,  350, 'E&E, plastics, food processing',                           'Main industrial zone in Kedah second city.'],
  ['kdh-mergong',            'Mergong Industrial Area',                      'industrial_estate',     'Kedah',   6.124, 100.368,  200, '',                                                         'Industrial precinct near Alor Setar.'],
  ['kdh-gurun',              'Gurun Industrial Park',                        'industrial_estate',     'Kedah',   5.819, 100.459,  180, '',                                                         'Light and medium industry along north-south corridor.'],
  ['kdh-sik',                'Sik Industrial Area',                          'industrial_estate',     'Kedah',   5.831, 100.744,  120, '',                                                         'Small industrial zone in interior Kedah.'],
  ['kdh-kuala-ketil',        'Kuala Ketil Industrial Estate',                'industrial_estate',     'Kedah',   5.629, 100.620,  150, '',                                                         'Industrial zone near Baling road corridor.'],
  ['kdh-rubber-city',        'Kedah Rubber City (KRC)',                      'industrial_estate',     'Kedah',   6.268, 100.660,  503, 'Latex, tyres, automotive rubber, medical devices',         'NCER rubber eco-industrial park in Padang Terap district.'],
  ['kdh-kstp',               'Kedah Science and Technology Park (KSTP)',     'tech_park',             'Kedah',   6.492, 100.420,  840, 'High-tech mfg, ICT, advanced materials, R&D',              'NCER tech park at Bukit Kayu Hitam, Kubang Pasu; ~1,938 acres.'],
  // Perlis
  ['pls-chuping-valley',     'Chuping Valley Industrial Area (CVIA)',        'special_economic_zone', 'Perlis',  6.504, 100.338, 1005, 'Green industries, halal mfg, EV components, RE',           'NCER premium border-town park at Felda Chuping; ~2,482 acres.'],
  ['pls-chuping',            'Chuping Industrial Area',                      'industrial_estate',     'Perlis',  6.486, 100.218,  320, 'MSM Sugar (refinery), industrial chemicals',               'Agro-industrial complex on Chuping sugar estate.'],
  ['pls-kangar',             'Kangar Industrial Estate',                     'industrial_estate',     'Perlis',  6.436, 100.196,   90, '',                                                         'Main industrial zone in Perlis state capital.'],
  ['pls-padang-besar',       'Padang Besar Industrial & Trade Zone',         'special_economic_zone', 'Perlis',  6.652, 100.313,  200, '',                                                         'Border trade and logistics at Malaysia–Thailand checkpoint.'],
  // Perak
  ['prk-chemor',             'Chemor Industrial Estate',                     'industrial_estate',     'Perak',   4.696, 101.063,  260, 'Ceramics, building materials, light manufacturing',        'Industrial zone north of Ipoh along Kinta Valley.'],
  ['prk-meru',               'Meru Industrial Park',                         'industrial_estate',     'Perak',   4.615, 101.026,  310, 'Metal fabrication, plastics, logistics',                   'Major Ipoh peripheral industrial zone.'],
  ['prk-jelapang',           'Jelapang Industrial Area',                     'industrial_estate',     'Perak',   4.598, 101.073,  190, '',                                                         'Mature industrial precinct on western fringe of Ipoh.'],
  ['prk-taiping',            'Taiping Industrial Estate',                    'industrial_estate',     'Perak',   4.857, 100.735,  220, '',                                                         'Mixed manufacturing in northern Perak.'],
  ['prk-teluk-intan',        'Teluk Intan Industrial Area',                  'industrial_estate',     'Perak',   3.971, 101.017,  170, '',                                                         'Industrial zone in southern Perak, Hilir Perak district.'],
  ['prk-proton-city',        'Proton City (Tanjung Malim Automotive SEZ)',   'special_economic_zone', 'Perak',   3.688, 101.519, 2300, 'Proton, automotive vendors, logistics',                    "Dedicated automotive township; Malaysia's national car assembly hub."],
  ['prk-lumut',              'Lumut Maritime Industrial Park',               'industrial_estate',     'Perak',   4.224, 100.638,  400, 'Petronas gas plant, maritime services, MISC',              'Port-based heavy industrial zone; deepwater jetties at Manjung.'],
  ['prk-kampar',             'Kampar Industrial Park',                       'industrial_estate',     'Perak',   4.304, 101.149,  140, '',                                                         'SME industry near UTAR Kampar campus.'],
  ['prk-sungai-siput',       'Sungai Siput Industrial Estate',              'industrial_estate',     'Perak',   4.831, 101.052,  130, '',                                                         'Mixed light industry in northern Kinta Valley.'],
  ['prk-bidor',              'Bidor Industrial Area',                        'industrial_estate',     'Perak',   4.080, 101.285,  110, '',                                                         'Small industrial zone serving southern Perak.'],
  ['prk-ulu-kinta',          'Ulu Kinta Industrial Area',                    'industrial_estate',     'Perak',   4.565, 101.115,  200, '',                                                         'Eastern Kinta Valley zone, formerly tin-mining land.'],
  ['prk-silver-valley',      'Silver Valley Technology Park (SVTP)',         'tech_park',             'Perak',   4.670, 101.074, 1093, 'Advanced mfg, digital economy, pharma, mineral processing', 'NCER hi-tech park at Kanthan, Kinta District; ~2,700 acres.'],
];

const s7 = aoaToSheet([
  ['Industrial Zones & Technology Parks — Northern Peninsular Malaysia', '', '', '', '', '', '', '', '', ''],
  [],
  ['Zone ID', 'Name', 'Type', 'State', 'Lat', 'Lng', 'Area (ha)', 'Key Tenants / Industries', 'Notes'],
  ...industrialZones.map(r => r.slice(0, 9)),
]);
s7['!cols'] = [{ wch: 22 }, { wch: 46 }, { wch: 26 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 50 }, { wch: 60 }];

// ── Sheet 8: Scoring Formula Summary ─────────────────────────────────────────

const s8 = aoaToSheet([
  ['Composite Score Formula', '', ''],
  [],
  ['Composite = (Solar × 0.25) + (Grid × 0.20) + (Land × 0.20) + (Availability × 0.10) + (Climate × 0.10) + (Road × 0.08) + (EnvSocial × 0.07)', '', ''],
  [],
  ['Dimension', 'Weight', 'Implementation (src/utils/solarScoring.ts)'],
  ['Solar Resource',         '25%', 'scoreGHI(ghi) — linear interpolation from GHI breakpoints; max at GHI ≥ 5.4'],
  ['Grid Interconnection',   '20%', 'scoreGridProximity(distKm, voltKV) — distance-decay + 15 pt bonus for 275/500 kV'],
  ['Land Suitability',       '20%', 'scoreLandUse(class, isProtected) — lookup table; protected areas → 0'],
  ['Land Availability',      '10%', 'scoreAvailability(class, isProtected) — proxy from land use class'],
  ['Climatic Conditions',    '10%', 'scoreFloodRisk(risk) — Low→95, Medium→65, High→30, Extreme→5'],
  ['Road Access',             '8%', 'scoreRoadAccess(distKm) — ≤1 km→100, 1–3→75–90, 3–8→50–75, 8–20→25–50, 20–40→10–25, >40→10'],
  ['Environmental & Social',  '7%', 'scoreEnvSocial(isProtected, landUse, floodRisk) — base 80; deductions for protected/paddy/water/flood'],
  [],
  ['AI Workflow Prompts', '', ''],
  ['Workflow', 'Type Key', 'Key Metrics Requested'],
  ['Solar Resource',          'solar_resource',        'GHI, DNI, Performance Ratio, Dust Factor, Annual Yield (kWh/kWp), Recommended Technology'],
  ['Grid Interconnection',    'grid_interconnection',  'Grid Operator, Nearest Substation, Connection Voltage, Headroom, Cost Estimate, Energisation Timeline'],
  ['Land Suitability',        'land_suitability',      'Land Classification, Soil Type, Slope Grade, Drainage Class, Conversion Requirement, Tenure Type'],
  ['Land Availability',       'land_availability',     'Contiguous Area (ha), Ownership Status, Fragmentation Risk, Acquisition Pathway, Market Price (RM/acre), Timeline'],
  ['Climate & Flood Risk',    'climate_risk',          'Flood Zone, 100-yr Flood Level, Annual Rainfall (mm), Cyclone Exposure, Drought Risk, Climate Score'],
  ['Road Access',             'road_access',           'Nearest A-Road, Route Length, Bridge/Culvert Limit, Heavy Vehicle Access, Upgrade Cost Estimate'],
  ['Environmental & Social',  'env_social',            'Protected Area Buffer, Water Catchment Zone, Community Sensitivity, DEIA Requirement, EIA Category, Approval Timeline'],
  ['Site Suitability',        'site_suitability',      'All 7 dimension scores + weighted composite + verdict (Go/Conditional/Avoid) + swing factor'],
]);
s8['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 88 }];

// ── Workbook ──────────────────────────────────────────────────────────────────

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, s1, '1. Framework Overview');
XLSX.utils.book_append_sheet(wb, s2, '2. Dimension Scoring');
XLSX.utils.book_append_sheet(wb, s3, '3. Capacity Estimation');
XLSX.utils.book_append_sheet(wb, s4, '4. GHI Regional Data');
XLSX.utils.book_append_sheet(wb, s5, '5. TNB Substations');
XLSX.utils.book_append_sheet(wb, s6, '6. Land Zones');
XLSX.utils.book_append_sheet(wb, s7, '7. Industrial Zones');
XLSX.utils.book_append_sheet(wb, s8, '8. Scoring Formulas');

XLSX.writeFile(wb, outPath);
console.log(`✓ Written: ${outPath}`);
