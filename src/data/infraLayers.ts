import type { InfraLayer, MapLayer, MapLayerId } from '../types';

// ─── Property types for each layer ───────────────────────────────────────────

export interface SubstationProperties {
  name: string;
  /** Grid operator — free-form string; OSM data uses arbitrary operator names */
  operator: string;
  voltageKV: number;
  /** Installed transformer capacity */
  capacityMVA: number;
  /** Approximate available headroom for new large loads */
  availableHeadroomMVA: number;
  yearCommissioned?: number;
  /** Whether the substation offers dedicated DC feed capability */
  dedicatedFeedAvailable: boolean;
  notes?: string;
}

export interface FibreNodeProperties {
  name: string;
  type: 'cable_landing_station' | 'internet_exchange' | 'backbone_pop';
  /** Named cables / systems landing at or passing through this node */
  cables: string[];
  operator: string;
  /** Total design capacity, Tbps */
  designCapacityTbps?: number;
  notes?: string;
}

export interface WaterSourceProperties {
  name: string;
  type:
    | 'reservoir'
    | 'river_intake'
    | 'treatment_plant'
    | 'industrial_supply';
  operator: string;
  /** Daily design treatment / abstraction capacity, million litres per day */
  capacityMlpd?: number;
  /** Reservoir storage volume, million m³ */
  storageMCM?: number;
  /** Primary service area */
  serviceArea: string;
  notes?: string;
}

// ─── Typed feature wrappers ───────────────────────────────────────────────────

export interface SubstationFeature {
  id: string;
  lat: number;
  lng: number;
  properties: SubstationProperties;
}

export interface FibreNodeFeature {
  id: string;
  lat: number;
  lng: number;
  properties: FibreNodeProperties;
}

export interface WaterSourceFeature {
  id: string;
  lat: number;
  lng: number;
  properties: WaterSourceProperties;
}

// ─── 1. Substations — 15 sites (Johor + Selangor/KL) ────────────────────────
// All are TNB (Tenaga Nasional Berhad) facilities.
// Johor substations serve the JB / Iskandar Puteri DC corridor.
// Selangor/KL substations serve the Cyberjaya / Shah Alam DC corridor.

export const SUBSTATIONS: SubstationFeature[] = [
  // ── Johor ────────────────────────────────────────────────────────────────
  {
    id: 'SUB-MY-JB-NUSAJAYA',
    lat: 1.4330,
    lng: 103.6271,
    properties: {
      name: 'Nusajaya 275kV Main Intake Substation',
      operator: 'TNB',
      voltageKV: 275,
      capacityMVA: 500,
      availableHeadroomMVA: 180,
      yearCommissioned: 2015,
      dedicatedFeedAvailable: true,
      notes:
        'Primary power entry point for the Iskandar Puteri / Nusajaya Tech Park DC corridor. ' +
        'Multiple DCs (Equinix JH1, AirTrunk JB1, PDG JB1) draw dedicated 275kV feeds.',
    },
  },
  {
    id: 'SUB-MY-JB-PLENTONG',
    lat: 1.5124,
    lng: 103.8019,
    properties: {
      name: 'Plentong 275kV Main Intake Substation',
      operator: 'TNB',
      voltageKV: 275,
      capacityMVA: 350,
      availableHeadroomMVA: 90,
      yearCommissioned: 2012,
      dedicatedFeedAvailable: true,
      notes:
        'Serves the Tebrau / Plentong industrial corridor. Primary feed for NTT JB1 & JB2. ' +
        'Dual-feed configuration with Tampoi 132kV for redundancy.',
    },
  },
  {
    id: 'SUB-MY-JB-PASIR-GUDANG',
    lat: 1.4631,
    lng: 103.9063,
    properties: {
      name: 'Pasir Gudang 275kV Substation',
      operator: 'TNB',
      voltageKV: 275,
      capacityMVA: 400,
      availableHeadroomMVA: 150,
      yearCommissioned: 2010,
      dedicatedFeedAvailable: true,
      notes:
        'Serves Pasir Gudang Port Industrial Zone (petrochemical / heavy industrial). ' +
        'Significant available headroom; prospective feed for future eastern JB DC campus.',
    },
  },
  {
    id: 'SUB-MY-JB-TAMPOI',
    lat: 1.4898,
    lng: 103.7024,
    properties: {
      name: 'Tampoi 132kV Substation',
      operator: 'TNB',
      voltageKV: 132,
      capacityMVA: 160,
      availableHeadroomMVA: 45,
      yearCommissioned: 2005,
      dedicatedFeedAvailable: false,
      notes:
        'Distribution substation serving western Johor Bahru city. Limited headroom; ' +
        'not recommended as primary DC feed. Used for N-1 redundancy by Digital Edge JB1.',
    },
  },
  {
    id: 'SUB-MY-JB-LARKIN',
    lat: 1.4780,
    lng: 103.7334,
    properties: {
      name: 'Larkin 132kV Substation',
      operator: 'TNB',
      voltageKV: 132,
      capacityMVA: 180,
      availableHeadroomMVA: 52,
      yearCommissioned: 2003,
      dedicatedFeedAvailable: false,
      notes:
        'Central JB city distribution substation adjacent to Larkin Bus Terminal. ' +
        'Constrained by urban load. Primarily serves commercial and residential sectors.',
    },
  },
  {
    id: 'SUB-MY-JB-SKUDAI',
    lat: 1.5228,
    lng: 103.6570,
    properties: {
      name: 'Skudai 132kV Substation',
      operator: 'TNB',
      voltageKV: 132,
      capacityMVA: 160,
      availableHeadroomMVA: 60,
      yearCommissioned: 2006,
      dedicatedFeedAvailable: false,
      notes:
        'Serves Skudai industrial and university zone (UTM main campus). ' +
        'Moderate headroom. Prospective redundancy feed for mid-size DC campuses.',
    },
  },
  {
    id: 'SUB-MY-JB-KULAI',
    lat: 1.6630,
    lng: 103.5949,
    properties: {
      name: 'Kulai 132kV Substation',
      operator: 'TNB',
      voltageKV: 132,
      capacityMVA: 200,
      availableHeadroomMVA: 110,
      yearCommissioned: 2018,
      dedicatedFeedAvailable: true,
      notes:
        'Upgraded substation serving the Kulai industrial corridor and YTL DC campus. ' +
        'YTL Phase 1 and 2 draw dedicated 132kV feeds; upgrade to 275kV transmission planned.',
    },
  },
  {
    id: 'SUB-MY-JB-SENAI',
    lat: 1.6016,
    lng: 103.6679,
    properties: {
      name: 'Senai 132kV Substation',
      operator: 'TNB',
      voltageKV: 132,
      capacityMVA: 200,
      availableHeadroomMVA: 80,
      yearCommissioned: 2009,
      dedicatedFeedAvailable: true,
      notes:
        'Serves Senai International Airport, Senai Hi-Tech Park, and surrounding industrial zone. ' +
        'Candidate feed point for future campuses in the Sedenak/Kulai axis.',
    },
  },
  {
    id: 'SUB-MY-JB-KOTA-TINGGI',
    lat: 1.7322,
    lng: 103.8976,
    properties: {
      name: 'Kota Tinggi 275kV Substation',
      operator: 'TNB',
      voltageKV: 275,
      capacityMVA: 300,
      availableHeadroomMVA: 170,
      yearCommissioned: 2014,
      dedicatedFeedAvailable: true,
      notes:
        'Large-capacity substation serving eastern Johor. Significant available headroom ' +
        'suitable for future greenfield campuses in the Kota Tinggi / Desaru axis.',
    },
  },
  // ── Selangor / Cyberjaya / KL ─────────────────────────────────────────────
  {
    id: 'SUB-MY-SEL-CYBERJAYA',
    lat: 2.9219,
    lng: 101.6513,
    properties: {
      name: 'Cyberjaya 275kV Main Intake Substation',
      operator: 'TNB',
      voltageKV: 275,
      capacityMVA: 500,
      availableHeadroomMVA: 130,
      yearCommissioned: 2000,
      dedicatedFeedAvailable: true,
      notes:
        'Primary power entry for the Cyberjaya MSC Malaysia technology corridor. ' +
        'Feeds AIMS DC1, NTT Cyberjaya 1, and Vantage KL1. ' +
        'Upgrade to 500 MVA under TNB 2025 RP plan.',
    },
  },
  {
    id: 'SUB-MY-SEL-PUTRAJAYA',
    lat: 2.9390,
    lng: 101.6878,
    properties: {
      name: 'Putrajaya 275kV Substation',
      operator: 'TNB',
      voltageKV: 275,
      capacityMVA: 400,
      availableHeadroomMVA: 120,
      yearCommissioned: 2001,
      dedicatedFeedAvailable: true,
      notes:
        'Serves Malaysian federal government precinct in Putrajaya. ' +
        'Prospective redundancy feed for Cyberjaya DC campus. High reliability SLA.',
    },
  },
  {
    id: 'SUB-MY-SEL-PUCHONG',
    lat: 3.0402,
    lng: 101.6197,
    properties: {
      name: 'Puchong 132kV Substation',
      operator: 'TNB',
      voltageKV: 132,
      capacityMVA: 250,
      availableHeadroomMVA: 85,
      yearCommissioned: 2007,
      dedicatedFeedAvailable: false,
      notes:
        'Serves Puchong commercial and industrial corridor. ' +
        'Distribution-level feed for smaller enterprise DC facilities.',
    },
  },
  {
    id: 'SUB-MY-SEL-SHAH-ALAM',
    lat: 3.0731,
    lng: 101.5132,
    properties: {
      name: 'Shah Alam 275kV Substation',
      operator: 'TNB',
      voltageKV: 275,
      capacityMVA: 450,
      availableHeadroomMVA: 200,
      yearCommissioned: 2008,
      dedicatedFeedAvailable: true,
      notes:
        'Large capacity substation serving Shah Alam industrial zone (i-City, Section 23 Hi-Tech). ' +
        'Substantial headroom; under-utilised due to manufacturing sector slowdown.',
    },
  },
  {
    id: 'SUB-MY-SEL-RAWANG',
    lat: 3.3198,
    lng: 101.5714,
    properties: {
      name: 'Rawang 275kV Substation',
      operator: 'TNB',
      voltageKV: 275,
      capacityMVA: 300,
      availableHeadroomMVA: 160,
      yearCommissioned: 2011,
      dedicatedFeedAvailable: true,
      notes:
        'Northern Selangor transmission substation serving Rawang / Ulu Bernam industrial zones. ' +
        'Prospective feed for future DC campuses targeting lower land cost north of KL.',
    },
  },
  {
    id: 'SUB-MY-SEL-SERDANG',
    lat: 3.0138,
    lng: 101.7087,
    properties: {
      name: 'Serdang 132kV Substation',
      operator: 'TNB',
      voltageKV: 132,
      capacityMVA: 200,
      availableHeadroomMVA: 70,
      yearCommissioned: 2004,
      dedicatedFeedAvailable: false,
      notes:
        'Serves UPM (Universiti Putra Malaysia) campus and Serdang tech park. ' +
        'Redundancy feed role for Cyberjaya corridor; limited new capacity.',
    },
  },
];

// ─── 2. Fibre backbone nodes & cable landing stations — 8 sites ──────────────

export const FIBRE_NODES: FibreNodeFeature[] = [
  {
    id: 'FIBRE-SG-TUAS-CLS',
    lat: 1.3302,
    lng: 103.6293,
    properties: {
      name: 'Tuas Cable Landing Station, Singapore',
      type: 'cable_landing_station',
      operator: 'Multiple (SingTel, RETN, others)',
      cables: [
        'SEA-ME-WE 3',
        'SEA-ME-WE 4',
        'SEA-ME-WE 5',
        'SEA-ME-WE 6',
        'FLAG (FNAL)',
        'AAG',
        'Asia Pacific Gateway (APG)',
        'Bay of Bengal Gateway (BBG)',
      ],
      designCapacityTbps: 280,
      notes:
        'Largest cable landing station in Southeast Asia by cable count. ' +
        'Provides onward connectivity to Europe, Middle East, India, and North Asia. ' +
        'GDS SG1 and Microsoft Azure Singapore maintain dedicated dark fibre to this CLS.',
    },
  },
  {
    id: 'FIBRE-SG-CHANGI-CLS',
    lat: 1.3872,
    lng: 104.0086,
    properties: {
      name: 'Changi North Cable Landing Station, Singapore',
      type: 'cable_landing_station',
      operator: 'SingTel / NetLink Trust',
      cables: [
        'FASTER',
        'Jupiter',
        'SJC (South-East Asia Japan Cable)',
        'PIPE Pacific Cable 1 (PPC-1)',
        'Indigo Central',
        'Indigo West',
        'ADC (Australia-Japan Cable)',
      ],
      designCapacityTbps: 220,
      notes:
        'Primary Singapore CLS for transpacific and Australia-facing cables. ' +
        'Digital Realty SIN10 and Equinix SG3 maintain fibre runs to Changi.',
    },
  },
  {
    id: 'FIBRE-MY-PENANG-CLS',
    lat: 5.3922,
    lng: 100.3128,
    properties: {
      name: 'Penang Cable Landing Station, Malaysia',
      type: 'cable_landing_station',
      operator: 'TM (Telekom Malaysia)',
      cables: [
        'FASTER',
        'Asia Pacific Gateway (APG)',
        'Bay of Bengal Gateway (BBG)',
        'SEA-ME-WE 3',
        'i2i',
        'STS-1',
      ],
      designCapacityTbps: 120,
      notes:
        'Key northwest Malaysia CLS. TM ONE national backbone aggregates traffic to/from Penang ' +
        'and transits south to Singapore and Cyberjaya via the HSBB2 network.',
    },
  },
  {
    id: 'FIBRE-MY-TG-PIAI-CLS',
    lat: 1.3631,
    lng: 103.5038,
    properties: {
      name: 'Tanjung Piai Cable Landing Station, Malaysia',
      type: 'cable_landing_station',
      operator: 'TM (Telekom Malaysia)',
      cables: [
        'SEA-ME-WE 4',
        'APX (Asia Pacific Express)',
        'JuTro (Jurong–Tronoh)',
      ],
      designCapacityTbps: 60,
      notes:
        'Southern-most peninsular Malaysia CLS at Tanjung Piai, Johor. ' +
        'Provides short-haul fibre path to Singapore Tuas CLS (≈45 km). ' +
        'Critical for JB DC campus onward international connectivity.',
    },
  },
  {
    id: 'FIBRE-ID-BATAM-CLS',
    lat: 1.0653,
    lng: 104.0347,
    properties: {
      name: 'Batam Cable Landing Station, Indonesia',
      type: 'cable_landing_station',
      operator: 'Telkom Indonesia / Indosat',
      cables: [
        'SEA-ME-WE 3',
        'FLAG',
        'Batam-Dumai-Medan (BDM)',
        'JAKABARE (Java-Kalimantan-Batam-Riau)',
        'BtoBNet',
      ],
      designCapacityTbps: 80,
      notes:
        'Batam Free Trade Zone CLS providing Indonesian national backbone connectivity ' +
        'and cross-strait fibre to Singapore via Riau Strait. Key overflow path for ' +
        'Jakarta-Singapore routes.',
    },
  },
  {
    id: 'FIBRE-ID-JAKARTA-CLS',
    lat: -6.1022,
    lng: 106.8292,
    properties: {
      name: 'Jakarta Cable Landing Station (Cilincing)',
      type: 'cable_landing_station',
      operator: 'Telkom Indonesia / Indosat / XL Axiata',
      cables: [
        'SEA-ME-WE 3',
        'SEA-ME-WE 5',
        'JASUKA',
        'BDM',
        'JAKABARE',
        'Asia-Africa-Europe 1 (AAE-1)',
      ],
      designCapacityTbps: 150,
      notes:
        'Primary Jakarta CLS at Cilincing, North Jakarta port area. ' +
        'Aggregates traffic from Java corridor and provides international onward connectivity. ' +
        'DCI JK01 and Equinix JK1 maintain dedicated terrestrial fibre to this node.',
    },
  },
  {
    id: 'FIBRE-SG-SGIX',
    lat: 1.2800,
    lng: 103.8480,
    properties: {
      name: 'SGIX — Singapore Internet Exchange',
      type: 'internet_exchange',
      operator: 'SGIX Ltd (industry-neutral)',
      cables: ['IXP peering fabric — 100GE / 400GE'],
      designCapacityTbps: 8,
      notes:
        'Singapore Internet Exchange located in Equinix SG1 (Ayer Rajah). ' +
        'Free peering for members; over 120 networks. Critical routing fabric ' +
        'for sub-millisecond latency across SGP-centric CDN and cloud footprints.',
    },
  },
  {
    id: 'FIBRE-PH-MANILA-CLS',
    lat: 14.6062,
    lng: 121.0523,
    properties: {
      name: 'Manila Cable Landing Station (La Union / Nasugbu)',
      type: 'cable_landing_station',
      operator: 'PLDT / Globe Telecom',
      cables: [
        'SEA-US (Southeast Asia–United States)',
        'Asia Pacific Gateway (APG)',
        'FASTER',
        'Jupiter',
        'SJC2',
        'JUPITER',
        'AAG (Asia-America Gateway)',
      ],
      designCapacityTbps: 100,
      notes:
        'Aggregated coordinates representing Manila-area cable landings ' +
        '(physical landings at La Union and Nasugbu; aggregated Manila PoP shown here). ' +
        'Equinix MN1 and ePLDT VITRO connect to these systems via PLDT / Globe national fibre.',
    },
  },
];

// ─── 3a. Water Treatment Plants & Pumping Stations — SEA-wide ────────────────

export interface WaterTreatmentProperties {
  name: string;
  type: 'treatment_plant' | 'pumping_station' | 'newater' | 'desalination';
  operator: string;
  /** Daily treatment/pumping capacity, million litres per day */
  capacityMlpd?: number;
  serviceArea: string;
  notes?: string;
}

export interface WaterTreatmentFeature {
  id: string;
  lat: number;
  lng: number;
  properties: WaterTreatmentProperties;
}

export const WATER_TREATMENT_PLANTS: WaterTreatmentFeature[] = [
  // ── Malaysia — Air Selangor ───────────────────────────────────────────────
  {
    id: 'WTP-MY-SGS-PHASE1',
    lat: 3.4720, lng: 101.5490,
    properties: {
      name: 'Sungai Selangor WTP Phase 1 & 2',
      type: 'treatment_plant', operator: 'Air Selangor',
      capacityMlpd: 1135,
      serviceArea: 'Klang Valley — Selangor, KL, Putrajaya',
      notes: 'Largest WTP in Malaysia. Draws from Sungai Selangor via Sg Bernam transfer. Primary supply to Cyberjaya DC corridor.',
    },
  },
  {
    id: 'WTP-MY-SGS-PHASE3',
    lat: 3.5012, lng: 101.5219,
    properties: {
      name: 'Sungai Selangor WTP Phase 3',
      type: 'treatment_plant', operator: 'Air Selangor',
      capacityMlpd: 945,
      serviceArea: 'Klang Valley — northern Selangor, Petaling Jaya',
      notes: 'Completed 2004; feeds Shah Alam and Petaling Jaya distribution zones. Critical for JB-KL DC corridor.',
    },
  },
  {
    id: 'WTP-MY-WANGSA-MAJU',
    lat: 3.2005, lng: 101.7482,
    properties: {
      name: 'Wangsa Maju / Bukit Nanas WTP',
      type: 'treatment_plant', operator: 'Air Selangor',
      capacityMlpd: 545,
      serviceArea: 'Kuala Lumpur city centre, Ampang',
    },
  },
  {
    id: 'WTP-MY-SG-LANGAT',
    lat: 2.9702, lng: 101.8551,
    properties: {
      name: 'Sungai Langat WTP',
      type: 'treatment_plant', operator: 'Air Selangor',
      capacityMlpd: 682,
      serviceArea: 'Klang, Subang, southern KL',
      notes: 'Draws from Sungai Langat reservoir. Serves Cyberjaya / Sepang DC belt via secondary mains.',
    },
  },
  {
    id: 'WTP-MY-JB-KOTA-TINGGI-WTP',
    lat: 1.5798, lng: 103.9882,
    properties: {
      name: 'Sungai Johor WTP (Kota Tinggi)',
      type: 'treatment_plant', operator: 'Air Johor',
      capacityMlpd: 910,
      serviceArea: 'Eastern Johor Bahru, JB city',
      notes: 'Largest WTP in Johor — 910 MLD. Key supply for eastern JB DC campus corridor.',
    },
  },
  {
    id: 'WTP-MY-JB-SKUDAI-WTP',
    lat: 1.5661, lng: 103.6904,
    properties: {
      name: 'Sungai Skudai WTP',
      type: 'treatment_plant', operator: 'Air Johor',
      capacityMlpd: 755,
      serviceArea: 'Skudai, Nusajaya, Iskandar Puteri',
      notes: 'Primary supply to Iskandar Puteri DC campuses. Expansion to 900 MLD planned.',
    },
  },
  // ── Singapore — PUB ──────────────────────────────────────────────────────
  {
    id: 'WTP-SG-BEDOK-NEWATER',
    lat: 1.3230, lng: 103.9420,
    properties: {
      name: 'Bedok NEWater Factory',
      type: 'newater', operator: 'PUB Singapore',
      capacityMlpd: 82,
      serviceArea: 'Eastern Singapore industrial / fab cluster',
      notes: 'Advanced membrane reclamation. Supplies NEWater to Changi Business Park and fab plants. Reclaimed effluent from Bedok WRP.',
    },
  },
  {
    id: 'WTP-SG-KRANJI-NEWATER',
    lat: 1.4278, lng: 103.7530,
    properties: {
      name: 'Kranji NEWater Factory',
      type: 'newater', operator: 'PUB Singapore',
      capacityMlpd: 180,
      serviceArea: 'Jurong Island, western Singapore industrial',
      notes: 'Largest NEWater plant by capacity. Co-located with Kranji Water Reclamation Plant.',
    },
  },
  {
    id: 'WTP-SG-CHANGI-WRP',
    lat: 1.3310, lng: 103.9800,
    properties: {
      name: 'Changi Water Reclamation Plant',
      type: 'treatment_plant', operator: 'PUB Singapore',
      capacityMlpd: 800,
      serviceArea: 'Singapore island-wide via DTSS',
      notes: "World's largest underground WRP at Changi East. Receives sewage via Deep Tunnel Sewerage System (DTSS).",
    },
  },
  {
    id: 'WTP-SG-JURONG-DESAL',
    lat: 1.2628, lng: 103.6918,
    properties: {
      name: 'Jurong Island Desalination Plant',
      type: 'desalination', operator: 'PUB Singapore',
      capacityMlpd: 227,
      serviceArea: 'Jurong Island, Tuas, western Singapore',
      notes: 'Reverse osmosis seawater desalination. Provides supply resilience for industrial western Singapore.',
    },
  },
  // ── Indonesia — PDAM / Jakarta ────────────────────────────────────────────
  {
    id: 'WTP-ID-JAKARTA-PDAM-CILINCING',
    lat: -6.1100, lng: 106.9200,
    properties: {
      name: 'PDAM Jaya Pulogadung WTP',
      type: 'treatment_plant', operator: 'PAM Jaya',
      capacityMlpd: 3700,
      serviceArea: 'East and Central Jakarta',
      notes: 'Largest WTP complex in Indonesia. Draws from Kali Sunter. Serves eastern Jakarta DC corridor (Cakung, MM2100).',
    },
  },
  {
    id: 'WTP-ID-JAKARTA-CILANDAK',
    lat: -6.2900, lng: 106.7900,
    properties: {
      name: 'PDAM Jaya Cilandak WTP',
      type: 'treatment_plant', operator: 'PAM Jaya',
      capacityMlpd: 1200,
      serviceArea: 'South Jakarta, Depok',
      notes: 'Feeds south Jakarta distribution zone. Relevant for Depok and Cilandak DC sites.',
    },
  },
  {
    id: 'WTP-ID-SURABAYA-NGAGEL',
    lat: -7.2891, lng: 112.7500,
    properties: {
      name: 'PDAM Surya Ngagel WTP I–III',
      type: 'treatment_plant', operator: 'PDAM Surya Surabaya',
      capacityMlpd: 2000,
      serviceArea: 'Surabaya city, Sidoarjo',
      notes: 'Primary water supply for Surabaya metro. Draws from Kali Surabaya river. Serves Surabaya DC hub.',
    },
  },
  {
    id: 'WTP-ID-BEKASI-PTAM',
    lat: -6.2348, lng: 107.0000,
    properties: {
      name: 'PTAM Tirta Patriot WTP, Bekasi',
      type: 'treatment_plant', operator: 'PTAM Tirta Patriot',
      capacityMlpd: 600,
      serviceArea: 'Bekasi industrial corridor, MM2100',
      notes: 'Supplies Bekasi / MM2100 industrial estates. Critical for DC campuses in eastern Jakarta belt.',
    },
  },
  // ── Thailand — MWA Bangkok ────────────────────────────────────────────────
  {
    id: 'WTP-TH-MWA-BANGKHEN',
    lat: 13.8850, lng: 100.5630,
    properties: {
      name: 'MWA Bang Khen Water Treatment Plant',
      type: 'treatment_plant', operator: 'Metropolitan Waterworks Authority (MWA)',
      capacityMlpd: 2400,
      serviceArea: 'Northern Bangkok, Nonthaburi, Pathum Thani',
      notes: 'Largest WTP in Thailand. Draws from Chao Phraya River. Key supply for northern Bangkok DC corridor (NIPA / TRUE IDC).',
    },
  },
  {
    id: 'WTP-TH-MWA-MAHASAWAT',
    lat: 13.7860, lng: 100.3820,
    properties: {
      name: 'MWA Mahasawat WTP',
      type: 'treatment_plant', operator: 'Metropolitan Waterworks Authority (MWA)',
      capacityMlpd: 1200,
      serviceArea: 'Western Bangkok, Nonthaburi, Samut Prakan',
      notes: 'Draws from Mae Klong River via West Bangkhen Canal. Complementary supply to Bang Khen.',
    },
  },
  {
    id: 'WTP-TH-MWA-BANGLEN',
    lat: 13.7120, lng: 100.5700,
    properties: {
      name: 'MWA Bang Len WTP',
      type: 'treatment_plant', operator: 'Metropolitan Waterworks Authority (MWA)',
      capacityMlpd: 800,
      serviceArea: 'Central Bangkok, Samut Prakan',
    },
  },
  // ── Vietnam — southern / Hanoi WTPs ──────────────────────────────────────
  {
    id: 'WTP-VN-HCMC-THU-DUC',
    lat: 10.8340, lng: 106.7540,
    properties: {
      name: 'Thu Duc WTP',
      type: 'treatment_plant', operator: 'SAWACO (Saigon Water)',
      capacityMlpd: 750,
      serviceArea: 'East HCMC — Thu Duc City, Binh Duong border',
      notes: 'Primary supply to eastern HCMC DC belt (Viettel IDC, CMC Tan Thuan). Draws from Dong Nai river.',
    },
  },
  {
    id: 'WTP-VN-HCMC-BINH-AN',
    lat: 10.9200, lng: 106.8500,
    properties: {
      name: 'Binh An WTP',
      type: 'treatment_plant', operator: 'SAWACO (Saigon Water)',
      capacityMlpd: 860,
      serviceArea: 'Northwest HCMC, Binh Duong, Long An',
      notes: 'Second largest WTP in southern Vietnam. Expansion phase to 1,100 MLD under construction.',
    },
  },
  {
    id: 'WTP-VN-HANOI-YEN-PHU',
    lat: 21.0500, lng: 105.8640,
    properties: {
      name: 'Yen Phu WTP',
      type: 'treatment_plant', operator: 'Hanoi Water One Member Company',
      capacityMlpd: 120,
      serviceArea: 'Central Hanoi — Hoan Kiem, Ba Dinh, Tay Ho',
      notes: 'Historical central Hanoi WTP on Red River bank. Limited expansion capacity.',
    },
  },
  {
    id: 'WTP-VN-HANOI-BAVI',
    lat: 21.0100, lng: 105.7900,
    properties: {
      name: 'Ba Vi / Song Da WTP',
      type: 'treatment_plant', operator: 'Hanoi Water Songda JSC',
      capacityMlpd: 300,
      serviceArea: 'Western Hanoi metro, Ha Dong',
      notes: 'Draws from Song Da reservoir. Feeds western Hanoi expansion zone including Ha Dong DC corridor.',
    },
  },
  // ── Philippines — MWSS / Maynilad / Manila Water ──────────────────────────
  {
    id: 'WTP-PH-MNL-LA-MESA',
    lat: 14.7120, lng: 121.0790,
    properties: {
      name: 'La Mesa WTP (Manila Water)',
      type: 'treatment_plant', operator: 'Manila Water Company',
      capacityMlpd: 900,
      serviceArea: 'East Metro Manila — Marikina, Quezon City, Pasig',
      notes: 'Draws from La Mesa Reservoir (Angat–Ipo–La Mesa system). Primary supply for eastern Metro Manila DC cluster.',
    },
  },
  {
    id: 'WTP-PH-MNL-BALARA',
    lat: 14.6820, lng: 121.0580,
    properties: {
      name: 'Balara WTP (Manila Water)',
      type: 'treatment_plant', operator: 'Manila Water Company',
      capacityMlpd: 1200,
      serviceArea: 'Quezon City, Marikina, parts of Manila',
      notes: 'Largest WTP in the Philippines by capacity. Fed from Angat Dam via Ipo Dam.',
    },
  },
  {
    id: 'WTP-PH-MNL-NOVALICHES',
    lat: 14.7640, lng: 121.0530,
    properties: {
      name: 'Novaliches WTP (Maynilad)',
      type: 'treatment_plant', operator: 'Maynilad Water Services',
      capacityMlpd: 1480,
      serviceArea: 'West Metro Manila — Caloocan, Valenzuela, Malabon',
      notes: 'Maynilad western zone primary WTP. Serves Caloocan and Valenzuela DC sites.',
    },
  },
  {
    id: 'WTP-PH-MNL-PUTATAN',
    lat: 14.3920, lng: 121.0350,
    properties: {
      name: 'Putatan WTP (Maynilad)',
      type: 'treatment_plant', operator: 'Maynilad Water Services',
      capacityMlpd: 150,
      serviceArea: 'South Metro Manila — Muntinlupa, Las Piñas',
      notes: 'Southern Metro Manila supply. Relevant for Laguna and Muntinlupa DC industrial parks.',
    },
  },
];

// ─── 3. Industrial water sources — 5 sites, Johor ────────────────────────────

export const WATER_SOURCES: WaterSourceFeature[] = [
  {
    id: 'WATER-MY-JB-LINGGIU',
    lat: 2.0618,
    lng: 103.8362,
    properties: {
      name: 'Linggiu Reservoir',
      type: 'reservoir',
      operator: 'Johor Water (Air Johor Holdings) / PUB Singapore',
      capacityMlpd: undefined,
      storageMCM: 250,
      serviceArea: 'Eastern Johor; PUB Singapore Treaty supply',
      notes:
        'Malaysia largest reservoir, shared under 1962 Water Agreement with Singapore. ' +
        '250 million m³ storage capacity on Sungai Johor. Critical raw water source ' +
        'for Water Treatment Plants serving Iskandar Puteri and eastern JB industrial zones. ' +
        'Climate variability and political sensitivity make this a watched supply constraint.',
    },
  },
  {
    id: 'WATER-MY-JB-SUNGAI-JOHOR-WTP',
    lat: 1.5798,
    lng: 103.9882,
    properties: {
      name: 'Sungai Johor Water Treatment Plant (Kota Tinggi)',
      type: 'treatment_plant',
      operator: 'Air Johor (Johor Water)',
      capacityMlpd: 910,
      storageMCM: undefined,
      serviceArea: 'Eastern Johor; central Johor Bahru',
      notes:
        'Largest water treatment plant in Johor, drawing raw water from Sungai Johor via ' +
        'Linggiu Reservoir release. 910 MLD treated output supplies JB city and industrial zones. ' +
        'Key industrial supply source for eastern JB DC campus developments.',
    },
  },
  {
    id: 'WATER-MY-JB-SKUDAI-WTP',
    lat: 1.5661,
    lng: 103.6904,
    properties: {
      name: 'Sungai Skudai Water Treatment Plant',
      type: 'treatment_plant',
      operator: 'Air Johor (Johor Water)',
      capacityMlpd: 755,
      storageMCM: undefined,
      serviceArea: 'Western Johor Bahru; Skudai; Nusajaya',
      notes:
        '755 MLD treatment plant on Sungai Skudai serving the western JB corridor. ' +
        'Primary treated water source for Iskandar Puteri / Nusajaya Tech Park DC campuses. ' +
        'Expansion to 900 MLD under the IRDA infrastructure plan.',
    },
  },
  {
    id: 'WATER-MY-JB-SUNGAI-PULAI-WTP',
    lat: 1.4478,
    lng: 103.5579,
    properties: {
      name: 'Sungai Pulai Water Treatment Plant',
      type: 'treatment_plant',
      operator: 'Air Johor (Johor Water)',
      capacityMlpd: 680,
      storageMCM: undefined,
      serviceArea: 'Southwest Johor; Tanjung Pelepas; Gelang Patah',
      notes:
        '680 MLD plant drawing from Sungai Pulai, the key water source for southwest Johor. ' +
        'Serves Port of Tanjung Pelepas and the adjacent industrial corridor. ' +
        'Closest treatment plant to Equinix JH1 and AirTrunk JB1 campuses (~12 km).',
    },
  },
  {
    id: 'WATER-MY-JB-LAYANG-RESERVOIR',
    lat: 1.7329,
    lng: 103.8217,
    properties: {
      name: 'Sungai Layang Reservoir',
      type: 'reservoir',
      operator: 'Air Johor (Johor Water)',
      capacityMlpd: undefined,
      storageMCM: 48,
      serviceArea: 'Northern Johor; Kota Tinggi; Ulu Tiram',
      notes:
        '48 million m³ reservoir on Sungai Layang in northern Johor. ' +
        'Secondary catchment supplementing Linggiu during dry periods. ' +
        'Feeds smaller treatment works serving the Ulu Tiram and Senai industrial zones.',
    },
  },
];

// ─── MapLayer objects (typed) ─────────────────────────────────────────────────

export const SUBSTATIONS_LAYER: MapLayer<SubstationProperties> = {
  id: 'power_substations',
  name: 'Power Substations (132kV+)',
  type: 'point',
  visible: true,
  color: '#F59E0B',
  opacity: 0.9,
  minZoom: 6,
  zIndex: 30,
  description: '132kV and 275kV TNB transmission substations in Johor and Selangor',
  data: SUBSTATIONS.map((s) => ({
    id: s.id,
    coordinates: { lat: s.lat, lng: s.lng },
    properties: s.properties,
  })),
};

export const FIBRE_NODES_LAYER: MapLayer<FibreNodeProperties> = {
  id: 'fibre_routes',
  name: 'Fibre Nodes & Cable Landing Stations',
  type: 'point',
  visible: true,
  color: '#10B981',
  opacity: 0.9,
  minZoom: 4,
  zIndex: 25,
  description: 'Major submarine cable landing stations and internet exchanges in SEA',
  data: FIBRE_NODES.map((n) => ({
    id: n.id,
    coordinates: { lat: n.lat, lng: n.lng },
    properties: n.properties,
  })),
};

export const WATER_SOURCES_LAYER: MapLayer<WaterSourceProperties> = {
  id: 'water_sources',
  name: 'Industrial Water Sources (Johor)',
  type: 'point',
  visible: false,
  color: '#38BDF8',
  opacity: 0.85,
  minZoom: 7,
  zIndex: 20,
  description: 'Major reservoirs and water treatment plants serving Johor industrial zones',
  data: WATER_SOURCES.map((w) => ({
    id: w.id,
    coordinates: { lat: w.lat, lng: w.lng },
    properties: w.properties,
  })),
};

// ─── InfraLayer index — backward-compatible with LayerToggle component ────────

export const INFRA_LAYERS: InfraLayer[] = [
  {
    id: 'existing_datacentres' as MapLayerId,
    label: 'Existing Data Centres',
    color: '#8B5CF6',
    defaultVisible: true,
    description: 'Operational, under construction and announced DC facilities',
  },
  {
    id: 'power_substations',
    label: 'Power Substations (132kV+)',
    color: '#F59E0B',
    defaultVisible: true,
    description: 'TNB 132kV and 275kV transmission substations (Johor + Selangor)',
  },
  {
    id: 'fibre_routes',
    label: 'Fibre & Cable Landing Stations',
    color: '#10B981',
    defaultVisible: true,
    description: 'Submarine cable landing stations and major IXPs across SEA',
  },
  {
    id: 'water_sources',
    label: 'Industrial Water Sources',
    color: '#38BDF8',
    defaultVisible: false,
    description: 'Reservoirs and water treatment plants serving Johor DC corridors',
  },
  {
    id: 'flood_zones',
    label: 'Flood Risk Zones',
    color: '#3B82F6',
    defaultVisible: false,
    description: '100-year flood inundation areas (DID Malaysia / BNPB Indonesia)',
  },
  {
    id: 'seismic_zones',
    label: 'Seismic Zones',
    color: '#EF4444',
    defaultVisible: false,
    description: 'Peak ground acceleration zones — critical for Indonesia / Philippines',
  },
  {
    id: 'special_economic_zones',
    label: 'Special Economic Zones',
    color: '#EC4899',
    defaultVisible: false,
    description: 'SEZs and digital economy zones with tax / regulatory incentives',
  },
  {
    id: 'water_treatment',
    label: 'Water Treatment Plants',
    color: '#38BDF8',
    defaultVisible: false,
    description: 'Water treatment plants and pumping stations across SEA',
  },
];

export const COUNTRY_LABELS: Record<string, string> = {
  MY: 'Malaysia',
  SG: 'Singapore',
  ID: 'Indonesia',
  TH: 'Thailand',
  VN: 'Vietnam',
  PH: 'Philippines',
  MM: 'Myanmar',
  KH: 'Cambodia',
  LA: 'Laos',
  BN: 'Brunei',
};
