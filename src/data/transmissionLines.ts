/**
 * Southeast Asian transmission lines — improved reference dataset.
 *
 * Routes follow published national grid topology and geographic corridors.
 * ALL cross-border interconnections are excluded — each entry is domestic only.
 * Coverage: MY (Peninsular + Sabah + Sarawak), SG, ID (Java, Sumatera,
 *   Kalimantan, Sulawesi), TH, VN, PH (Luzon, Visayas), MM, KH.
 * Voltage range: 132 kV – 500 kV.
 *
 * Sources: TNB Grid System, SP PowerAssets, EGAT network map, PLN RUPTL,
 *   EVNNPT annual reports, NGCP system map, ESE/MOEE Myanmar, EdC Cambodia.
 */

export type LineVoltage = 500 | 400 | 275 | 230 | 132;
export type LineStatus = 'existing' | 'under_construction' | 'planned';

export interface TransmissionLine {
  id: string;
  name: string;
  voltage_kV: LineVoltage;
  status: LineStatus;
  operator: string;
  /** Polyline vertices: [lat, lng] */
  coords: [number, number][];
  commissionYear?: number;
  length_km?: number;
  capacity_MW?: number;
  notes?: string;
}

export const TRANSMISSION_LINES: TransmissionLine[] = [

  // ══════════════════════════════════════════════════════════════════
  // PENINSULAR MALAYSIA — TNB
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'tnb-500-west-backbone-n',
    name: 'TNB 500 kV — Kerian → Kapar (North-Central backbone)',
    voltage_kV: 500, status: 'existing', operator: 'TNB',
    coords: [
      [4.72, 101.13], // Kerian / Bersia
      [4.52, 101.05], // Sungai Siput corridor
      [4.22, 101.07], // Temoh
      [3.92, 101.18], // Slim River area
      [3.62, 101.28], // Tanjung Malim
      [3.40, 101.30], // Batang Kali
      [3.12, 101.35], // Kapar generation hub
    ],
    commissionYear: 1994, capacity_MW: 3000,
    notes: 'Main north-south 500 kV spine feeding Klang Valley from Perak generation.',
  },
  {
    id: 'tnb-500-west-backbone-s',
    name: 'TNB 500 kV — Kapar → Yong Peng (Central-South backbone)',
    voltage_kV: 500, status: 'existing', operator: 'TNB',
    coords: [
      [3.12, 101.35], // Kapar
      [3.00, 101.50], // Shah Alam
      [2.92, 101.65], // Cyberjaya / Putrajaya
      [2.78, 101.87], // Nilai
      [2.55, 102.10], // Pedas Lukut
      [2.32, 102.45], // Rompin
      [2.10, 102.75], // Simpang Renggam
      [2.03, 102.93], // Yong Peng
    ],
    commissionYear: 1997, capacity_MW: 3000,
  },
  {
    id: 'tnb-500-south-johor',
    name: 'TNB 500 kV — Yong Peng → Pasir Gudang',
    voltage_kV: 500, status: 'existing', operator: 'TNB',
    coords: [
      [2.03, 102.93], // Yong Peng
      [2.00, 103.12], // Ayer Hitam
      [1.92, 103.32], // Kluang
      [1.78, 103.52], // Paloh
      [1.63, 103.68], // Senai
      [1.52, 103.78], // Johor Bahru (Tampoi)
      [1.47, 103.90], // Pasir Gudang
    ],
    commissionYear: 2000, capacity_MW: 3000,
  },
  {
    id: 'tnb-500-east-kl',
    name: 'TNB 500 kV — Kapar → Cheras → Temerloh',
    voltage_kV: 500, status: 'existing', operator: 'TNB',
    coords: [
      [3.12, 101.35], // Kapar
      [3.08, 101.55], // PJ / KL West
      [3.10, 101.72], // Cheras / KL East
      [3.22, 101.92], // Ampang
      [3.35, 102.18], // Gombak / Rawang turn
      [3.45, 102.50], // Bentong
      [3.50, 102.82], // Raub
      [3.48, 103.05], // Maran
      [3.45, 103.35], // Temerloh
    ],
    commissionYear: 1998, capacity_MW: 2500,
    notes: 'East-west spur connecting Klang Valley to Pahang generation.',
  },
  {
    id: 'tnb-500-paka-coast',
    name: 'TNB 275 kV — Temerloh → Paka (East Coast)',
    voltage_kV: 275, status: 'existing', operator: 'TNB',
    coords: [
      [3.45, 103.35], // Temerloh
      [3.82, 103.52], // Kuantan approach
      [3.78, 103.33], // Kuantan area
      [4.20, 103.43], // Kemaman
      [4.62, 103.44], // Paka / Kertih (gas gen)
      [5.12, 103.10], // Kelantan corridor
      [5.52, 102.55], // Kuala Krai
      [6.10, 102.23], // Gua Musang area
      [5.95, 102.58], // Kuala Krai south
    ],
    commissionYear: 2002, capacity_MW: 1500,
  },
  {
    id: 'tnb-275-jb-ring-north',
    name: 'TNB 275 kV — Johor Bahru northern arc',
    voltage_kV: 275, status: 'existing', operator: 'TNB',
    coords: [
      [1.63, 103.68], // Senai
      [1.60, 103.61], // Kulai
      [1.55, 103.54], // Nusajaya approach
      [1.43, 103.63], // Iskandar Puteri
      [1.47, 103.78], // Tampoi
      [1.52, 103.90], // Plentong
      [1.47, 103.90], // Pasir Gudang
    ],
    capacity_MW: 1500,
    notes: 'JB ring feeding the Iskandar Puteri / Nusajaya DC hyperscale corridor.',
  },
  {
    id: 'tnb-275-kl-cyberjaya',
    name: 'TNB 275 kV — KL ring (Cyberjaya / Shah Alam)',
    voltage_kV: 275, status: 'existing', operator: 'TNB',
    coords: [
      [3.18, 101.42], // Shah Alam
      [3.12, 101.60], // PJ / Petaling
      [3.05, 101.72], // Bangsar / Cheras
      [2.98, 101.65], // Serdang / Putrajaya approach
      [2.92, 101.65], // Cyberjaya
      [2.92, 101.52], // Puchong
      [3.00, 101.40], // Shah Alam west
      [3.18, 101.42], // close ring
    ],
    capacity_MW: 1200,
  },
  {
    id: 'tnb-132-jb-corridor',
    name: 'TNB 132 kV — Iskandar Puteri to Kulai corridor',
    voltage_kV: 132, status: 'existing', operator: 'TNB',
    coords: [
      [1.43, 103.63], // Iskandar Puteri / Nusajaya
      [1.49, 103.67], // Skudai
      [1.52, 103.58], // Pulai
      [1.58, 103.57], // Kempas
      [1.63, 103.59], // Kulai
      [1.66, 103.53], // Senai Airport area
    ],
    notes: 'Sub-transmission ring serving DC campuses in Iskandar Puteri corridor.',
  },
  {
    id: 'tnb-132-cyberjaya-serdang',
    name: 'TNB 132 kV — Cyberjaya / Serdang sub-transmission',
    voltage_kV: 132, status: 'existing', operator: 'TNB',
    coords: [
      [2.92, 101.65], // Cyberjaya substation
      [3.00, 101.70], // Putrajaya
      [3.01, 101.71], // Serdang
      [3.05, 101.63], // Puchong
      [2.98, 101.62], // Cyberjaya south
    ],
  },

  // Sabah
  {
    id: 'sesb-132-sabah-backbone',
    name: 'SESB 132 kV — Kota Kinabalu → Lahad Datu',
    voltage_kV: 132, status: 'existing', operator: 'SESB',
    coords: [
      [5.98, 116.07], // Kota Kinabalu
      [5.85, 116.12], // Penampang
      [5.75, 116.18], // Papar
      [5.55, 116.05], // Beaufort
      [5.02, 115.85], // Sipitang
      [4.75, 115.95], // Keningau
      [5.35, 117.00], // Ranau corridor
      [5.55, 117.60], // Beluran
      [5.50, 118.32], // Sandakan
      [5.02, 118.32], // Kinabatangan
      [5.03, 118.34], // Lahad Datu approach
    ],
    notes: 'SESB grid backbone East Sabah. Isolated from Peninsular.',
  },

  // Sarawak
  {
    id: 'sesb-275-sarawak-central',
    name: 'SEB 275 kV — Bakun → Miri / Kuching',
    voltage_kV: 275, status: 'existing', operator: 'Sarawak Energy',
    coords: [
      [2.90, 114.22], // Bakun Dam
      [2.60, 113.92], // Bintulu
      [3.32, 113.05], // Miri
      [3.43, 113.98], // Bintulu north
    ],
    notes: 'Sarawak energy grid, Bakun hydropower transmission.',
  },
  {
    id: 'sesb-275-kuching-corridor',
    name: 'SEB 275 kV — Batang Ai → Kuching',
    voltage_kV: 275, status: 'existing', operator: 'Sarawak Energy',
    coords: [
      [1.18, 111.55], // Batang Ai Dam
      [1.32, 111.78], // Sri Aman
      [1.55, 110.32], // Serian
      [1.55, 110.35], // Kuching approach
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // SINGAPORE — SP PowerAssets (400 kV / 230 kV ring)
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'sp-400-ring-west',
    name: 'SP 400 kV — Tuas → Jurong → Ayer Rajah',
    voltage_kV: 400, status: 'existing', operator: 'SP PowerAssets',
    coords: [
      [1.30, 103.63], // Tuas GS
      [1.31, 103.68], // Jurong
      [1.31, 103.73], // West Coast / Pasir Panjang
      [1.29, 103.82], // Ayer Rajah
      [1.31, 103.85], // Queensway
    ],
    capacity_MW: 3000,
    notes: 'Western leg of Singapore 400 kV backbone.',
  },
  {
    id: 'sp-400-ring-north',
    name: 'SP 400 kV — Woodlands → Yio Chu Kang',
    voltage_kV: 400, status: 'existing', operator: 'SP PowerAssets',
    coords: [
      [1.44, 103.72], // Woodlands
      [1.38, 103.78], // Bukit Timah
      [1.35, 103.83], // Ang Mo Kio
      [1.38, 103.88], // Yio Chu Kang
      [1.38, 103.97], // Paya Lebar
    ],
    capacity_MW: 3000,
  },
  {
    id: 'sp-400-ring-east',
    name: 'SP 400 kV — Changi → Paya Lebar → Senoko',
    voltage_kV: 400, status: 'existing', operator: 'SP PowerAssets',
    coords: [
      [1.36, 104.00], // Changi
      [1.38, 103.97], // Paya Lebar
      [1.35, 103.83], // Hougang
      [1.42, 103.82], // Mandai
      [1.44, 103.82], // Senoko GS
    ],
    capacity_MW: 3000,
  },
  {
    id: 'sp-230-south',
    name: 'SP 230 kV — Keppel → Tengah → Sembawang',
    voltage_kV: 230, status: 'existing', operator: 'SP PowerAssets',
    coords: [
      [1.27, 103.84], // Keppel
      [1.30, 103.76], // Tengah
      [1.35, 103.75], // Bukit Panjang
      [1.42, 103.77], // Sembawang
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // INDONESIA — JAVA BALI — PLN
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'pln-500-java-west',
    name: 'PLN 500 kV — Cilegon → Cibinong (West Java)',
    voltage_kV: 500, status: 'existing', operator: 'PLN',
    coords: [
      [-6.00, 106.05], // Cilegon / Suralaya
      [-6.10, 106.15], // Serang
      [-6.18, 106.42], // Balaraja
      [-6.22, 106.68], // Cikupa / Tangerang
      [-6.25, 106.82], // Gandul / Cinere
      [-6.35, 106.85], // Cibinong
    ],
    capacity_MW: 5000,
    notes: 'Carries Suralaya coal generation into Jakarta load centre.',
  },
  {
    id: 'pln-500-java-jakarta',
    name: 'PLN 500 kV — Cibinong → Cawang → Bekasi',
    voltage_kV: 500, status: 'existing', operator: 'PLN',
    coords: [
      [-6.35, 106.85], // Cibinong
      [-6.28, 106.93], // Cibinong North
      [-6.22, 106.92], // Cawang Jakarta
      [-6.25, 107.02], // Bekasi West
      [-6.28, 107.18], // Bekasi DC corridor
      [-6.33, 107.35], // Deltamas / Karawang
    ],
    capacity_MW: 5000,
  },
  {
    id: 'pln-500-java-central',
    name: 'PLN 500 kV — Karawang → Cirebon → Semarang',
    voltage_kV: 500, status: 'existing', operator: 'PLN',
    coords: [
      [-6.33, 107.35], // Karawang
      [-6.40, 107.52], // Purwakarta
      [-6.50, 107.78], // Subang
      [-6.62, 108.08], // Majalengka
      [-6.75, 108.55], // Cirebon
      [-6.88, 109.07], // Tegal
      [-6.98, 109.68], // Batang
      [-7.02, 110.35], // Semarang West
      [-7.00, 110.48], // Semarang
    ],
    capacity_MW: 4500,
  },
  {
    id: 'pln-500-java-east',
    name: 'PLN 500 kV — Semarang → Solo → Surabaya',
    voltage_kV: 500, status: 'existing', operator: 'PLN',
    coords: [
      [-7.00, 110.48], // Semarang
      [-7.08, 110.85], // Demak
      [-7.15, 111.18], // Kudus
      [-7.20, 111.52], // Rembang
      [-7.25, 112.05], // Tuban
      [-7.20, 112.42], // Gresik
      [-7.25, 112.75], // Surabaya
    ],
    capacity_MW: 4500,
  },
  {
    id: 'pln-150-jakarta-ring',
    name: 'PLN 150 kV — Jakarta ring (DC corridor)',
    voltage_kV: 132, status: 'existing', operator: 'PLN',
    coords: [
      [-6.22, 106.82], // Tangerang West
      [-6.18, 106.92], // Jakarta North
      [-6.22, 107.02], // Jakarta East
      [-6.30, 107.02], // Ciracas
      [-6.32, 106.92], // Pondok Indah
      [-6.28, 106.82], // Jakarta South
      [-6.22, 106.82], // close ring
    ],
    notes: '150 kV sub-transmission ring around Jakarta serving DC clusters.',
  },
  {
    id: 'pln-150-bekasi-dc',
    name: 'PLN 150 kV — Bekasi / Cikarang sub-transmission',
    voltage_kV: 132, status: 'existing', operator: 'PLN',
    coords: [
      [-6.28, 107.18], // Bekasi DC area
      [-6.35, 107.25], // Cikarang
      [-6.32, 107.35], // Deltamas
      [-6.28, 107.42], // Jababeka
    ],
  },
  {
    id: 'pln-500-bali',
    name: 'PLN 150 kV — Bali backbone',
    voltage_kV: 132, status: 'existing', operator: 'PLN',
    coords: [
      [-8.18, 114.52], // Gilimanuk
      [-8.28, 114.92], // Tabanan
      [-8.65, 115.18], // Denpasar
      [-8.55, 115.42], // Gianyar
      [-8.32, 115.48], // Singaraja area
    ],
    notes: 'Bali grid separate from Java — connected via HVDC submarine cable.',
  },

  // ══════════════════════════════════════════════════════════════════
  // INDONESIA — SUMATERA — PLN
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'pln-275-sumatera-north',
    name: 'PLN 275 kV — Medan → Pematangsiantar → Padangsidempuan',
    voltage_kV: 275, status: 'existing', operator: 'PLN',
    coords: [
      [3.60, 98.68],  // Medan
      [3.38, 98.85],  // Binjai
      [3.12, 99.03],  // Lubuk Pakam
      [2.95, 99.05],  // Tebing Tinggi
      [2.68, 99.07],  // Pematangsiantar
      [1.92, 99.05],  // Rantau Prapat
      [1.38, 99.27],  // Padangsidempuan
    ],
    notes: 'North Sumatera 275 kV backbone.',
  },
  {
    id: 'pln-275-sumatera-central',
    name: 'PLN 275 kV — Padangsidempuan → Padang → Palembang',
    voltage_kV: 275, status: 'existing', operator: 'PLN',
    coords: [
      [1.38, 99.27],  // Padangsidempuan
      [0.92, 99.57],  // Panyabungan
      [0.48, 100.37], // Padang
      [0.00, 101.45], // Pekanbaru
      [-0.95, 101.45],// Duri
      [-1.12, 101.30], // Dumai
      [-1.65, 103.62], // Batam area
      [-2.02, 102.75], // Muaro Jambi
      [-2.98, 104.75], // Palembang
      [-3.78, 105.40], // Lampung
      [-5.45, 105.25], // Bandar Lampung
    ],
    capacity_MW: 2000,
    notes: 'Sumatera HVAC backbone running north-south through Riau.',
  },
  {
    id: 'pln-150-batam',
    name: 'PLN 150 kV — Batam industrial grid',
    voltage_kV: 132, status: 'existing', operator: 'PLN / Batam Intertek',
    coords: [
      [1.12, 104.03], // Batam Centre
      [1.05, 104.12], // Batu Aji
      [1.02, 104.02], // Nagoya
      [1.08, 103.97], // Sekupang
      [1.17, 104.05], // Batamindo
    ],
    notes: 'Batam FTZ grid powering data centre and tech industrial zones.',
  },
  {
    id: 'pln-150-kalimantan-west',
    name: 'PLN 150 kV — Kalimantan Barat (Pontianak)',
    voltage_kV: 132, status: 'existing', operator: 'PLN',
    coords: [
      [0.02, 109.33], // Pontianak
      [0.12, 109.25], // Sungai Raya
      [-0.08, 109.42], // Kubu Raya
      [0.45, 109.18], // Mempawah
      [1.05, 109.95], // Singkawang
    ],
    notes: 'Kalimantan Barat isolated grid — not connected to Java.',
  },
  {
    id: 'pln-150-kalimantan-south',
    name: 'PLN 150 kV — Kalimantan Selatan (Banjarmasin)',
    voltage_kV: 132, status: 'existing', operator: 'PLN',
    coords: [
      [-3.32, 114.58], // Banjarmasin
      [-3.45, 114.82], // Banjarbaru
      [-3.10, 114.88], // Martapura
      [-2.58, 115.38], // Pelaihari
    ],
  },
  {
    id: 'pln-150-sulawesi-south',
    name: 'PLN 150 kV — Sulawesi Selatan (Makassar)',
    voltage_kV: 132, status: 'existing', operator: 'PLN',
    coords: [
      [-5.15, 119.42], // Makassar
      [-5.10, 119.58], // Maros
      [-5.02, 119.80], // Pangkep
      [-4.82, 119.88], // Barru
      [-4.02, 119.65], // Pare-Pare
      [-3.58, 119.90], // Pinrang
      [-3.35, 119.75], // Polman
    ],
    notes: 'Sulawesi grid — isolated from Java, interconnected within island.',
  },

  // ══════════════════════════════════════════════════════════════════
  // THAILAND — EGAT
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'egat-500-north-backbone',
    name: 'EGAT 500 kV — Mae Moh → Hang Chat → Bang Ban',
    voltage_kV: 500, status: 'existing', operator: 'EGAT',
    coords: [
      [18.30, 99.72],  // Mae Moh lignite
      [18.22, 99.85],  // Li
      [17.78, 98.98],  // Hot / Hang Chat
      [17.40, 99.12],  // Mae Klong
      [17.08, 99.45],  // Phitsanulok
      [16.85, 100.25], // Pichit
      [16.40, 100.75], // Nakhon Sawan
      [15.70, 100.55], // Uthai Thani
      [15.10, 100.52], // Chainat / Sing Buri
      [14.55, 100.55], // Ang Thong
      [14.12, 100.52], // Ayutthaya
      [13.85, 100.58], // Bang Ban
    ],
    commissionYear: 1985, capacity_MW: 4000,
    notes: 'Main EGAT 500 kV backbone from north generation to Bangkok.',
  },
  {
    id: 'egat-500-bangkok-metro',
    name: 'EGAT 500 kV — Bang Ban → Bangkok ring',
    voltage_kV: 500, status: 'existing', operator: 'EGAT',
    coords: [
      [13.85, 100.58], // Bang Ban
      [13.72, 100.50], // Don Mueang
      [13.68, 100.38], // Nonthaburi
      [13.72, 100.55], // Bangkok North
      [13.65, 100.62], // Lat Krabang / EGAT East
      [13.55, 100.78], // Samut Prakan
    ],
    capacity_MW: 4000,
  },
  {
    id: 'egat-500-east-seaboard',
    name: 'EGAT 500 kV — Bangkok East → Map Ta Phut',
    voltage_kV: 500, status: 'existing', operator: 'EGAT',
    coords: [
      [13.65, 100.62], // Lat Krabang
      [13.55, 100.88], // Bang Bo
      [13.42, 101.00], // Chon Buri
      [13.22, 101.15], // Si Racha
      [13.10, 101.25], // Rayong
      [12.95, 101.08], // Map Ta Phut industrial
    ],
    capacity_MW: 4000,
    notes: 'Feeds Eastern Economic Corridor industrial belt.',
  },
  {
    id: 'egat-500-south-thailand',
    name: 'EGAT 500 kV — Bangkok South → Surat Thani',
    voltage_kV: 500, status: 'existing', operator: 'EGAT',
    coords: [
      [13.55, 100.78], // Samut Prakan / Bang Bo
      [13.40, 100.60], // Samut Sakhon
      [13.25, 100.08], // Ratchaburi
      [12.72, 99.75],  // Hua Hin
      [11.55, 99.55],  // Chumphon
      [10.72, 99.32],  // Ranong approach
      [9.13, 99.33],   // Surat Thani
    ],
    capacity_MW: 3000,
    notes: 'South Thailand backbone. Line follows Malay Peninsula western flank.',
  },
  {
    id: 'egat-500-south-songkhla',
    name: 'EGAT 230 kV — Surat Thani → Hat Yai',
    voltage_kV: 230, status: 'existing', operator: 'EGAT',
    coords: [
      [9.13, 99.33],   // Surat Thani
      [8.28, 100.05],  // Nakhon Si Thammarat
      [7.72, 100.52],  // Phattalung
      [7.00, 100.48],  // Songkhla
      [6.82, 100.45],  // Hat Yai
    ],
    capacity_MW: 1500,
  },
  {
    id: 'egat-230-northeast',
    name: 'EGAT 230 kV — Northeast backbone (Saraburi → Udon Thani)',
    voltage_kV: 230, status: 'existing', operator: 'EGAT',
    coords: [
      [14.53, 100.92], // Saraburi
      [14.98, 101.32], // Nakhon Ratchasima approach
      [14.98, 102.10], // Nakhon Ratchasima
      [15.68, 102.88], // Roi Et
      [17.10, 102.78], // Udon Thani
      [17.42, 102.82], // Nong Khai approach
    ],
    capacity_MW: 2000,
  },

  // ══════════════════════════════════════════════════════════════════
  // VIETNAM — EVNNPT
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'evn-500-north-central',
    name: 'EVN 500 kV — Hanoi → Nghe An (North-Central)',
    voltage_kV: 500, status: 'existing', operator: 'EVNNPT',
    coords: [
      [21.03, 105.85], // Hanoi / Thuong Tin
      [20.52, 105.78], // Nam Dinh approach
      [20.40, 106.15], // Ha Nam
      [20.28, 105.72], // Ninh Binh
      [19.80, 105.78], // Thanh Hoa
      [19.33, 105.48], // Sam Son
      [18.68, 105.68], // Nghe An / Vinh
    ],
    commissionYear: 1994, capacity_MW: 3000,
    notes: 'First circuit of the 3-circuit N-S 500 kV backbone.',
  },
  {
    id: 'evn-500-central',
    name: 'EVN 500 kV — Nghe An → Da Nang (Central)',
    voltage_kV: 500, status: 'existing', operator: 'EVNNPT',
    coords: [
      [18.68, 105.68], // Nghe An
      [17.75, 106.42], // Quang Binh
      [17.00, 106.62], // Quang Tri / Dong Ha
      [16.47, 107.60], // Hue
      [16.07, 108.20], // Da Nang
    ],
    capacity_MW: 3000,
  },
  {
    id: 'evn-500-central-south',
    name: 'EVN 500 kV — Da Nang → Phan Rang → Ho Chi Minh',
    voltage_kV: 500, status: 'existing', operator: 'EVNNPT',
    coords: [
      [16.07, 108.20], // Da Nang
      [15.12, 108.80], // Quang Ngai
      [14.18, 109.22], // Quy Nhon / Binh Dinh
      [13.10, 109.32], // Tuy Hoa
      [12.25, 109.18], // Nha Trang
      [11.58, 108.98], // Phan Rang
      [10.98, 107.92], // Binh Duong approach
      [10.88, 106.80], // Ho Chi Minh
    ],
    capacity_MW: 3000,
  },
  {
    id: 'evn-220-hanoi-ring',
    name: 'EVN 220 kV — Hanoi ring',
    voltage_kV: 230, status: 'existing', operator: 'EVNNPT',
    coords: [
      [21.12, 105.72], // Ha Dong
      [21.05, 105.88], // Thuong Tin
      [21.00, 106.00], // Gia Lam
      [21.05, 106.05], // Vinh Tuy
      [21.08, 105.95], // Dong Anh
      [21.12, 105.78], // Thang Long
      [21.12, 105.72], // close ring
    ],
    capacity_MW: 2000,
    notes: 'Hanoi metropolitan 220 kV ring.',
  },
  {
    id: 'evn-220-hcm-ring',
    name: 'EVN 220 kV — Ho Chi Minh metro ring',
    voltage_kV: 230, status: 'existing', operator: 'EVNNPT',
    coords: [
      [10.88, 106.72], // Thu Duc / HCM North
      [10.92, 106.82], // Binh Duong
      [10.88, 106.88], // Long Binh
      [10.78, 106.70], // Can Gio approach
      [10.72, 106.62], // District 7
      [10.80, 106.65], // Nha Be
    ],
    capacity_MW: 1500,
  },

  // ══════════════════════════════════════════════════════════════════
  // PHILIPPINES — NGCP (Luzon & Visayas)
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'ngcp-500-luzon-north',
    name: 'NGCP 500 kV — Bauang → San Jose → Munoz',
    voltage_kV: 500, status: 'existing', operator: 'NGCP',
    coords: [
      [16.52, 120.45], // Bauang (La Union)
      [15.82, 120.38], // Pangasinan
      [15.52, 120.72], // San Jose / Nueva Ecija
      [15.22, 120.95], // Munoz / Cabanatuan
      [14.82, 120.98], // Malolos
      [14.72, 121.00], // Marilao
      [14.55, 121.02], // Quezon City North
    ],
    commissionYear: 1985, capacity_MW: 2000,
  },
  {
    id: 'ngcp-500-luzon-south',
    name: 'NGCP 500 kV — Quezon City → Sucat → Calamba',
    voltage_kV: 500, status: 'existing', operator: 'NGCP',
    coords: [
      [14.55, 121.02], // Quezon City North
      [14.58, 121.06], // Balintawak
      [14.52, 121.02], // Manila South Port
      [14.45, 121.03], // Pasay / Sucat
      [14.28, 121.15], // Binan
      [14.18, 121.22], // Calamba / Laguna
      [13.92, 121.48], // Batangas
    ],
    capacity_MW: 2000,
  },
  {
    id: 'ngcp-230-visayas',
    name: 'NGCP 230 kV — Visayas backbone (Cebu)',
    voltage_kV: 230, status: 'existing', operator: 'NGCP',
    coords: [
      [10.72, 124.65], // Cebu City
      [10.85, 124.02], // Toledo / Cebu West
      [11.22, 124.00], // Danao
      [11.48, 123.85], // Carmen
      [9.98, 124.22],  // Naga Cebu
    ],
    notes: 'Cebu island sub-grid.',
  },
  {
    id: 'ngcp-230-mindanao',
    name: 'NGCP 230 kV — Mindanao backbone',
    voltage_kV: 230, status: 'existing', operator: 'NGCP',
    coords: [
      [7.08, 125.62], // Davao
      [7.62, 125.05], // Tagum / Panabo
      [8.15, 124.28], // Cagayan de Oro
      [8.52, 124.62], // Iligan
      [8.05, 123.88], // Ozamiz
    ],
    notes: 'Mindanao grid, isolated from Luzon.',
  },

  // ══════════════════════════════════════════════════════════════════
  // MYANMAR — MOEE / ESE
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'moee-230-mandalay-yangon',
    name: 'MOEE 230 kV — Mandalay → Pyinmana → Yangon',
    voltage_kV: 230, status: 'existing', operator: 'MOEE',
    coords: [
      [21.97, 96.08], // Mandalay
      [21.45, 95.98], // Kyaukpadaung
      [20.52, 95.62], // Pyinmana / Naypyidaw
      [19.72, 96.15], // Toungoo
      [18.88, 96.45], // Pegu / Bago
      [17.03, 96.32], // Letpadan
      [16.88, 96.18], // Hlegu
      [16.85, 96.17], // Yangon
    ],
    commissionYear: 1995,
    notes: 'Myanmar national backbone grid.',
  },
  {
    id: 'moee-230-shan-north',
    name: 'MOEE 230 kV — Lawpita → Mandalay (hydro)',
    voltage_kV: 230, status: 'existing', operator: 'MOEE',
    coords: [
      [19.68, 97.02], // Lawpita Dam
      [20.42, 96.72], // Taunggyi
      [20.62, 96.35], // Meiktila
      [21.97, 96.08], // Mandalay
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // CAMBODIA — EdC
  // ══════════════════════════════════════════════════════════════════

  {
    id: 'edc-230-cambodia-backbone',
    name: 'EdC 230 kV — Phnom Penh → Siem Reap',
    voltage_kV: 230, status: 'existing', operator: 'Électricité du Cambodge',
    coords: [
      [11.57, 104.92], // Phnom Penh
      [12.00, 104.82], // Kampong Cham area
      [12.52, 104.72], // Kampong Thom
      [13.38, 103.85], // Siem Reap
    ],
    notes: 'Cambodia national 230 kV backbone (upgraded from imported power).',
  },
  {
    id: 'edc-115-phnom-penh',
    name: 'EdC 115 kV — Phnom Penh metro ring',
    voltage_kV: 132, status: 'existing', operator: 'Électricité du Cambodge',
    coords: [
      [11.55, 104.90], // PP South
      [11.62, 104.92], // PP North
      [11.58, 104.98], // PP East
      [11.52, 104.95], // Chrouy Changvar
    ],
  },

];

export function voltageColor(v: LineVoltage): string {
  if (v >= 500) return '#EF4444';
  if (v >= 400) return '#F87171';
  if (v >= 275) return '#F59E0B';
  if (v >= 230) return '#A78BFA';
  return '#3B82F6';
}

export function lineDashArray(s: LineStatus): string | undefined {
  if (s === 'planned') return '6 6';
  if (s === 'under_construction') return '2 4';
  return undefined;
}

export function statusLabel(s: LineStatus): string {
  if (s === 'planned') return 'Planned';
  if (s === 'under_construction') return 'Under construction';
  return 'Existing';
}
