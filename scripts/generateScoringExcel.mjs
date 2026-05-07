/**
 * Generates Solar_SiteIQ_Scoring.xlsx in the project root.
 * Run with: node scripts/generateScoringExcel.mjs
 */

import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'Solar_SiteIQ_Scoring.xlsx');

// ── Helpers ───────────────────────────────────────────────────────────────────

const hdr = (v) => ({ v, t: 's', s: { font: { bold: true }, fill: { fgColor: { rgb: '1E3A5F' } }, alignment: { horizontal: 'center' } } });
const cell = (v, bold = false) => ({ v, t: typeof v === 'number' ? 'n' : 's', s: bold ? { font: { bold: true } } : {} });

function aoaToSheet(data) {
  return XLSX.utils.aoa_to_sheet(data);
}

// ── Sheet 1: Scoring Framework Overview ──────────────────────────────────────

const s1 = aoaToSheet([
  ['Solar SiteIQ — Scoring Framework', '', '', '', ''],
  ['Northern Peninsular Malaysia Large-Scale Solar & REZ Site Screening', '', '', '', ''],
  ['H3 Resolution 6 · ~36 km² per tile · ~6 km edge-to-edge', '', '', '', ''],
  [],
  ['#', 'Dimension', 'Weight (%)', 'Key Sub-factors', 'Data Source'],
  ['1', 'Solar Resource Potential', 25, 'GHI kWh/m²/day, regional cloud cover, monsoon seasonality', 'SEDA/NASA POWER regional model'],
  ['2', 'Grid Interconnection', 20, 'Distance to 132 kV+ line/substation, voltage level, available headroom (MVA)', 'TNB grid maps, annual reports'],
  ['3', 'Land Suitability', 20, 'Land use classification, soil type, slope, drainage, protected status', 'NLC / DOA / state land use data'],
  ['4', 'Land Availability', 10, 'Tenure, fragmentation risk, acquisition pathway (NLC, FELDA, MADA)', 'State land office / FELDA records'],
  ['5', 'Climatic Conditions', 10, 'DID flood zone, annual rainfall, river proximity, drainage basin', 'DID flood maps, JMG'],
  ['6', 'Road Access', 8, 'Distance to federal/state road, heavy vehicle suitability, bridge constraints', 'JKR road network'],
  ['7', 'Environmental & Social', 7, 'PRF buffer, Orang Asli settlements, water catchment, DOE EIA category', 'PERHILITAN, DOE Malaysia'],
  [],
  ['Composite Score', '', '100%', '', ''],
  [],
  ['Verdict Thresholds', '', '', '', ''],
  ['Go', '≥ 70', 'Site suitable for 50 MW+ solar development with manageable constraints', '', ''],
  ['Conditional Go', '45 – 69', 'Development possible but requires mitigation, upgrade, or approval', '', ''],
  ['Avoid', '< 45', 'Significant constraints make development unviable or very high risk', '', ''],
]);
s1['!cols'] = [{ wch: 4 }, { wch: 26 }, { wch: 14 }, { wch: 60 }, { wch: 32 }];
s1['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
  { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
];

// ── Sheet 2: Dimension Scoring Tables ────────────────────────────────────────

const s2 = aoaToSheet([
  ['Dimension Scoring Breakpoints', '', '', ''],
  [],
  ['1. Solar Resource (GHI → Score)'],
  ['GHI (kWh/m²/day)', 'Score', 'Comment'],
  ['≥ 5.4', 100, 'Best-in-class for Malaysia (Perlis / NW Kedah)'],
  ['5.2 – 5.4', '85–100', 'Excellent — Central Kedah plains'],
  ['5.0 – 5.2', '65–85', 'Good — Perak valley / Penang mainland'],
  ['4.8 – 5.0', '45–65', 'Moderate — Penang island, lower Perak coast'],
  ['4.5 – 4.8', '20–45', 'Low — Highland fringe / Titiwangsa edge'],
  ['< 4.5', 10, 'Poor — Highland Perak, avoid'],
  [],
  ['2. Grid Interconnection (Distance + Voltage → Score)'],
  ['Distance to Grid', 'Base Score', 'Voltage Bonus', 'Notes'],
  ['≤ 2 km', 100, '', 'Direct connection viable'],
  ['2 – 5 km', '70–90', '', 'Short spur acceptable'],
  ['5 – 15 km', '45–70', '', 'Moderate connection cost'],
  ['15 – 30 km', '25–45', '', 'Long connection, costly'],
  ['30 – 60 km', '5–25', '', 'Very long — viability marginal'],
  ['> 60 km', 5, '', 'Avoid unless strategic'],
  ['275/500 kV substation nearby', '', '+15 pts', 'High injection capacity'],
  ['132 kV substation nearby', '', '+5 pts', 'Distribution voltage'],
  [],
  ['3. Land Suitability (Land Use Class → Score)'],
  ['Land Use Class', 'Score', 'Rationale'],
  ['Idle Agricultural (idle_agri)', 95, 'Former rubber/sugarcane; minimal conversion barrier'],
  ['Rubber (rubber)', 75, 'Ageing estates; conversion via state land office'],
  ['Mixed Agricultural (mixed_agri)', 65, 'Smallholder; fragmented but accessible'],
  ['Oil Palm (oil_palm)', 55, 'Active crop; FELDA/FELCRA conversion required'],
  ['Paddy (paddy)', 35, 'MADA food-security constraint; federal approval needed'],
  ['Water body (water)', 40, 'FPV possible; TNB/DOE permitting required'],
  ['Urban (urban)', 10, 'Not suitable for utility-scale'],
  ['Forest (forest)', 0, 'PRF — fully protected; no development'],
  ['Protected area override', 0, 'Any gazetted protected area scores 0'],
  [],
  ['4. Land Availability (Proxy from Land Use)'],
  ['Land Use Class', 'Availability Score', 'Notes'],
  ['Idle Agricultural', 90, 'High availability; state land or idle private'],
  ['Rubber', 70, 'Moderate; many parcels under conversion'],
  ['Mixed Agricultural', 60, 'Fragmented smallholdings'],
  ['Oil Palm', 50, 'Active operations; long lead time'],
  ['Water', 35, 'FPV site; complex ownership'],
  ['Paddy', 25, 'MADA-managed; very restricted conversion'],
  ['Urban', 5, 'Minimal land availability'],
  ['Forest / Protected', 0, 'Not available'],
  [],
  ['5. Climate / Flood Risk (DID Flood Zone → Score)'],
  ['Flood Risk Level', 'Score', 'Typical Scenario'],
  ['Low', 95, 'No significant flood history; well-drained terrain'],
  ['Medium', 65, 'Occasional inundation; bunding may be required'],
  ['High', 30, 'Frequent flooding; elevated foundations likely needed'],
  ['Extreme', 5, 'Regularly inundated; not suitable for ground-mount'],
  [],
  ['6. Road Access (Distance to Nearest Road → Score)'],
  ['Distance to Road', 'Score', 'Notes'],
  ['≤ 1 km', 100, 'Direct access'],
  ['1 – 3 km', '75–90', 'Short access road upgrade'],
  ['3 – 8 km', '50–75', 'Moderate access works'],
  ['8 – 20 km', '25–50', 'Significant access road required'],
  ['20 – 40 km', '10–25', 'Very costly access works'],
  ['> 40 km', 10, 'Not viable without major infrastructure'],
  [],
  ['7. Environmental & Social (Composite Rule)'],
  ['Condition', 'Score Adjustment'],
  ['Protected area (forest/PRF/sanctuary)', '→ 0 (override)'],
  ['Forest land use', '→ 0'],
  ['Water body land use', '−15 pts (FPV permitting)'],
  ['Paddy land use (community sensitivity)', '−20 pts'],
  ['High flood risk', '−10 pts'],
  ['Extreme flood risk', '−25 pts'],
  ['Base score (no constraints)', '80 pts'],
]);
s2['!cols'] = [{ wch: 36 }, { wch: 16 }, { wch: 18 }, { wch: 48 }];

// ── Sheet 3: GHI Regional Data ────────────────────────────────────────────────

const s3 = aoaToSheet([
  ['GHI Regional Estimates — Northern Peninsular Malaysia'],
  [],
  ['Region', 'States', 'GHI Min', 'GHI Max', 'GHI Mid', 'Notes'],
  ['Perlis / NW Kedah', 'Perlis, N. Kedah', 5.3, 5.6, 5.45, 'Flattest terrain, driest, highest GHI in Malaysia'],
  ['Central Kedah (MADA)', 'Kedah', 5.1, 5.4, 5.25, 'Double-cropping paddy plains; slightly higher humidity'],
  ['East Kedah (Baling/Sik)', 'Kedah', 5.0, 5.3, 5.15, 'More inland cloud cover; idle agri land'],
  ['Penang', 'Penang', 4.8, 5.1, 4.95, 'Island/coastal zone; higher humidity, urban heat island'],
  ['Perak Valley (Ipoh corridor)', 'Perak', 4.9, 5.3, 5.1, 'Valley location; some topographic shading north–south'],
  ['Lower Perak Coast', 'Perak', 4.8, 5.1, 4.95, 'Coastal delta; cloud and humidity impact'],
  ['Titiwangsa Highland', 'Perak (E)', 4.4, 4.8, 4.6, 'High elevation, persistent cloud cover, not viable'],
  [],
  ['Source: SEDA Malaysia solar resource atlas; NASA POWER reanalysis data (2000–2023 average)'],
  ['Units: kWh/m²/day (Global Horizontal Irradiance)'],
]);
s3['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 55 }];

// ── Sheet 4: TNB Substation Reference ────────────────────────────────────────

const substations = [
  // Perlis
  ['Bukit Keteri 275/132 kV PMU', 'Perlis', 6.384, 100.196, 275, 630, 280, true, 'Main bulk supply for Perlis. Strategic for large LSS injection.'],
  ['Kangar 132/33 kV', 'Perlis', 6.444, 100.195, 132, 120, 55, false, 'Perlis state capital distribution. Limited headroom.'],
  ['Arau 132/33 kV', 'Perlis', 6.426, 100.275, 132, 90, 40, false, 'Feeds Arau industrial and UniMAP zone.'],
  // Kedah
  ['Alor Setar 275/132 kV PMU', 'Kedah', 6.104, 100.370, 275, 500, 180, true, 'Kedah state capital bulk supply. Serves MADA zone.'],
  ['Gurun 132/33 kV', 'Kedah', 5.817, 100.457, 132, 160, 70, false, 'Mid-Kedah industrial distribution.'],
  ['Sungai Petani 132/33 kV PMU', 'Kedah', 5.652, 100.487, 132, 250, 85, false, 'Largest load centre in Kedah after Alor Setar.'],
  ['Kulim 275/132 kV PMU (Hi-Tech Park)', 'Kedah', 5.378, 100.553, 275, 450, 140, true, 'Primary supply for Kulim Hi-Tech Park. LSS-dedicated spur planned.'],
  ['Baling 132/33 kV', 'Kedah', 5.677, 100.921, 132, 80, 45, false, 'East Kedah rural. Surrounded by large idle agri land.'],
  ['Sik 132/33 kV', 'Kedah', 5.800, 100.740, 132, 60, 30, false, 'Rural Kedah near significant idle/scrubland.'],
  ['Jitra 132/33 kV', 'Kedah', 6.263, 100.419, 132, 110, 50, false, 'North Kedah paddy zone substation.'],
  ['Pendang 132/33 kV', 'Kedah', 5.995, 100.521, 132, 80, 35, false, 'MADA paddy heartland. Constrained headroom.'],
  // Penang
  ['Bukit Minyak 275/132 kV PMU', 'Penang', 5.352, 100.468, 275, 630, 90, true, 'Main bulk supply Penang mainland industrial. High utilisation.'],
  ['Pauh 132/33 kV', 'Penang', 5.396, 100.418, 132, 200, 55, false, 'South Seberang Prai (Batu Kawan adjacent).'],
  ['Prai 132/33 kV', 'Penang', 5.512, 100.393, 132, 180, 40, false, 'Prai industrial. High utilisation due to port demand.'],
  // Perak
  ['Ipoh North 275/132 kV PMU', 'Perak', 4.647, 101.080, 275, 500, 160, true, 'Main bulk supply for Ipoh. Good headroom for RE.'],
  ['Gerik 275/132 kV (Bersia Hydro)', 'Perak', 5.418, 101.134, 275, 320, 200, true, 'Near Bersia/Temenggor hydro. Significant headroom.'],
  ['Sungai Siput 132/33 kV', 'Perak', 4.844, 101.051, 132, 120, 65, false, 'Upper Perak valley. Near flat agri land.'],
  ['Bidor 132/33 kV', 'Perak', 4.118, 101.281, 132, 100, 55, false, 'South Perak. Oil palm and rubber surroundings.'],
  ['Parit Buntar 132/33 kV', 'Perak', 5.122, 100.492, 132, 90, 48, false, 'Lower Perak / Kedah border. Paddy surroundings.'],
  ['Taiping 132/33 kV PMU', 'Perak', 4.852, 100.737, 132, 180, 75, false, 'Perak NW distribution. Near Bukit Larut fringe.'],
  ['Teluk Intan 132/33 kV', 'Perak', 3.977, 101.020, 132, 110, 42, false, 'Lower Perak coast. Flood-prone; limited solar suitability.'],
];

const s4 = aoaToSheet([
  ['TNB Substation Reference — Northern Peninsular Malaysia'],
  [],
  ['Substation Name', 'State', 'Lat', 'Lng', 'Voltage (kV)', 'Capacity (MVA)', 'Headroom (MVA)', 'Dedicated Feed', 'Notes'],
  ...substations,
]);
s4['!cols'] = [{ wch: 36 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 60 }];

// ── Sheet 5: Land Zone Reference ─────────────────────────────────────────────

const landZones = [
  // Perlis
  ['perlis-sugarcane-idle', 'Chuping Sugar Estate / Idle Agri (Perlis)', 'idle_agri', 'low', false, 6.28, 6.50, 100.10, 100.35, 'Former MSM sugar cane estate. Top solar prospect.'],
  ['perlis-paddy-coast', 'Perlis Paddy Zone (coastal)', 'paddy', 'medium', false, 6.30, 6.45, 100.25, 100.48, 'Active MADA-managed paddy. Conversion requires approval.'],
  ['perlis-forest-wang-kelian', 'Wang Kelian Forest Reserve (Perlis)', 'forest', 'low', true, 6.30, 6.50, 100.05, 100.20, 'Gazetted PRF — excluded from solar.'],
  // Kedah
  ['kedah-mada-north', 'MADA Paddy Scheme — North Zone', 'paddy', 'medium', false, 5.80, 6.32, 100.22, 100.60, 'Core MADA double-cropping. Flat but politically sensitive.'],
  ['kedah-mada-south', 'MADA Paddy Scheme — South Zone', 'paddy', 'high', false, 5.55, 5.82, 100.28, 100.62, 'High flood frequency due to Sungai Muda drainage.'],
  ['kedah-idle-agri-baling', 'Baling / Sik Idle Agricultural Land', 'idle_agri', 'low', false, 5.60, 5.90, 100.62, 101.05, 'Abandoned rubber/mixed scrub. Good solar, moderate grid.'],
  ['kedah-rubber-gurun', 'Gurun / Jeniang Rubber Estates', 'rubber', 'low', false, 5.62, 5.95, 100.46, 100.72, 'Ageing rubber. Many parcels under replanting/conversion.'],
  ['kedah-oil-palm-south', 'South Kedah Oil Palm', 'oil_palm', 'low', false, 5.35, 5.62, 100.55, 100.95, 'Commercial oil palm. FELDA/FELCRA conversion possible.'],
  ['kedah-forest-ulu-muda', 'Ulu Muda Forest Reserve', 'forest', 'low', true, 5.70, 6.10, 101.10, 101.55, 'Key water catchment — fully protected.'],
  // Penang
  ['penang-seberang-prai-agri', 'Seberang Prai Agricultural / Padi Zone', 'paddy', 'medium', false, 5.22, 5.52, 100.35, 100.50, 'Active paddy and vegetables. Some idle parcels.'],
  ['penang-batu-kawan', 'Batu Kawan / Simpang Ampat Industrial', 'mixed_agri', 'low', false, 5.22, 5.32, 100.40, 100.52, 'Mixed industrial/agri fringe. Some idle parcels.'],
  ['penang-kulim-kedah-border', 'Kulim–Penang Border Idle Land', 'idle_agri', 'low', false, 5.28, 5.40, 100.52, 100.68, 'Idle/transitional land. Near Kulim 275 kV grid.'],
  // Perak
  ['perak-lower-paddy-coast', 'Lower Perak Coastal Paddy', 'paddy', 'high', false, 3.90, 5.15, 100.35, 100.75, 'Coastal paddy delta. High flood risk.'],
  ['perak-rubber-midvalley', 'Perak Valley Rubber / Mixed Agri', 'rubber', 'low', false, 4.20, 5.00, 100.75, 101.35, 'Widespread rubber and mixed smallholder.'],
  ['perak-oil-palm-south', 'South Perak Oil Palm (Bidor–Tapah)', 'oil_palm', 'low', false, 3.80, 4.35, 100.92, 101.45, 'Active oil palm. FELDA conversion with long lead.'],
  ['perak-titiwangsa-forest', 'Titiwangsa / Main Range Forest', 'forest', 'low', true, 3.80, 6.00, 101.30, 102.00, 'Permanent reserved forest. No development.'],
  ['perak-bersia-lake', 'Temenggor / Bersia Reservoir', 'water', 'low', true, 5.10, 5.75, 101.25, 101.65, 'TNB hydro reservoir. FPV possible subject to approval.'],
  ['perak-idle-agri-upper', 'Upper Perak Idle / Fringe Agri (Grik)', 'idle_agri', 'low', false, 5.20, 5.60, 100.88, 101.30, 'Good solar. Grid access requires long connection to Gerik.'],
];

const s5 = aoaToSheet([
  ['Land Use Zone Reference — Northern Peninsular Malaysia'],
  [],
  ['Zone ID', 'Label', 'Land Use', 'Flood Risk', 'Protected', 'Bounds S', 'Bounds N', 'Bounds W', 'Bounds E', 'Notes'],
  ...landZones,
]);
s5['!cols'] = [{ wch: 28 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 60 }];

// ── Sheet 6: Scoring Formula Summary ─────────────────────────────────────────

const s6 = aoaToSheet([
  ['Composite Score Formula'],
  [],
  ['Composite = (Solar × 0.25) + (Grid × 0.20) + (Land Suit. × 0.20) + (Land Avail. × 0.10) + (Climate × 0.10) + (Road × 0.08) + (Env/Social × 0.07)'],
  [],
  ['Dimension', 'Weight', 'Formula Notes'],
  ['Solar Resource', '25%', 'scoreGHI(ghi): linear interpolation from GHI breakpoints. Max at GHI ≥ 5.4.'],
  ['Grid Interconnection', '20%', 'scoreGridProximity(distKm, voltKV): distance-decaying score + 15pt bonus for 275/500 kV.'],
  ['Land Suitability', '20%', 'scoreLandUse(class, isProtected): lookup table. Protected areas → 0.'],
  ['Land Availability', '10%', 'scoreAvailability(class, isProtected): proxy from land use class.'],
  ['Climate / Flood Risk', '10%', 'scoreFloodRisk(risk): Low→95, Medium→65, High→30, Extreme→5.'],
  ['Road Access', '8%', 'scoreRoadAccess(distKm): distance-decaying. ≤1 km → 100, >40 km → 10.'],
  ['Environmental & Social', '7%', 'scoreEnvSocial(isProtected, landUse, floodRisk): base 80, deductions for constraints.'],
  [],
  ['AI Workflow Prompts'],
  ['Workflow', 'Type Key', 'Key Metrics Requested'],
  ['Solar Resource', 'solar_resource', 'GHI, DNI, Performance Ratio, Dust Factor, Annual Yield, Technology'],
  ['Grid Interconnection', 'grid_interconnection', 'Grid Operator, Substation, Connection Voltage, Headroom, Cost, Timeline'],
  ['Land Suitability', 'land_suitability', 'Land Classification, Soil Type, Slope, Drainage, Conversion Req., Tenure'],
  ['Land Availability', 'land_availability', 'Contiguous Area, Ownership, Fragmentation, Acquisition Pathway, Price, Timeline'],
  ['Climate & Flood Risk', 'climate_risk', 'Flood Zone, 100-yr Level, Annual Rainfall, Cyclone Risk, Drought Risk, Score'],
  ['Road Access', 'road_access', 'Nearest Road, Route Length, Bridge Limit, Heavy Vehicle Access, Upgrade Cost'],
  ['Environmental & Social', 'env_social', 'Protected Buffer, Water Catchment, Community Sensitivity, DEIA, EIA Category, Timeline'],
  ['Site Suitability', 'site_suitability', 'All 7 dimension scores + weighted composite + verdict + swing factor'],
]);
s6['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 80 }];

// ── Workbook ──────────────────────────────────────────────────────────────────

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, s1, '1. Framework Overview');
XLSX.utils.book_append_sheet(wb, s2, '2. Dimension Scoring');
XLSX.utils.book_append_sheet(wb, s3, '3. GHI Regional Data');
XLSX.utils.book_append_sheet(wb, s4, '4. TNB Substations');
XLSX.utils.book_append_sheet(wb, s5, '5. Land Zones');
XLSX.utils.book_append_sheet(wb, s6, '6. Scoring Formulas');

XLSX.writeFile(wb, outPath);
console.log(`✓ Written: ${outPath}`);
