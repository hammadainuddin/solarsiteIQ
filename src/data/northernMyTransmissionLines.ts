import type { TransmissionLine } from './transmissionLines';

// TNB transmission lines in Perak, Kedah, Penang, Perlis
// Sources: TNB grid maps, SEDA Malaysia, public planning documents
export const NORTHERN_MY_LINES: TransmissionLine[] = [
  // ── 500 kV backbone ───────────────────────────────────────────────────────
  {
    id: 'tnb-500-kerian-kapar-n',
    name: 'TNB 500 kV — Kerian → Bukit Keteri (North Perak/Perlis backbone)',
    voltage_kV: 500,
    status: 'existing',
    operator: 'TNB',
    coords: [
      [5.01, 100.93], [5.18, 100.78], [5.35, 100.62], [5.52, 100.55],
      [5.68, 100.48], [5.82, 100.40], [6.02, 100.35], [6.18, 100.28],
      [6.38, 100.20],
    ],
    commissionYear: 1994,
    capacity_MW: 3000,
    notes: 'Northern segment of west-coast 500 kV spine; feeds Kedah and Perlis load centres.',
  },

  // ── 275 kV main interconnects ─────────────────────────────────────────────
  {
    id: 'tnb-275-bukit-keteri-bukit-minyak',
    name: 'TNB 275 kV — Bukit Keteri (Perlis) → Alor Setar → Gurun → Bukit Minyak (Penang)',
    voltage_kV: 275,
    status: 'existing',
    operator: 'TNB',
    coords: [
      [6.38, 100.20], [6.22, 100.37], [6.10, 100.37],
      [5.92, 100.48], [5.78, 100.53], [5.55, 100.60],
      [5.42, 100.40], [5.35, 100.35],
    ],
    commissionYear: 2002,
    capacity_MW: 1200,
    notes: 'Primary 275 kV corridor linking Perlis generation → Kedah → Penang industrial zone.',
  },
  {
    id: 'tnb-275-baling-sik-kulim',
    name: 'TNB 275 kV — Baling → Sik → Kulim Hi-Tech Park',
    voltage_kV: 275,
    status: 'existing',
    operator: 'TNB',
    coords: [
      [5.68, 100.93], [5.75, 100.75], [5.80, 100.58], [5.76, 100.55],
    ],
    commissionYear: 2005,
    capacity_MW: 800,
    notes: 'Feeds Kulim Hi-Tech Park and Sungai Petani industrial demand.',
  },
  {
    id: 'tnb-275-gerik-kroh-perak',
    name: 'TNB 275 kV — Gerik → Kroh (East Perak)',
    voltage_kV: 275,
    status: 'existing',
    operator: 'TNB',
    coords: [
      [5.42, 101.14], [5.30, 101.22], [5.17, 101.28],
    ],
    commissionYear: 1999,
    capacity_MW: 600,
    notes: 'East Perak 275 kV supply from Bersia hydro complex.',
  },
  {
    id: 'tnb-275-ipoh-north',
    name: 'TNB 275 kV — Manjung → Taiping → Ipoh North',
    voltage_kV: 275,
    status: 'existing',
    operator: 'TNB',
    coords: [
      [4.22, 100.65], [4.52, 100.74], [4.72, 100.87],
      [4.82, 100.96], [4.93, 101.08],
    ],
    commissionYear: 1996,
    capacity_MW: 1000,
    notes: 'Links Manjung gas power complex (TNB Janamanjung) to Ipoh load centre.',
  },

  // ── 132 kV distribution ───────────────────────────────────────────────────
  {
    id: 'tnb-132-alor-setar-jitra',
    name: 'TNB 132 kV — Alor Setar → Jitra (Kedah plains)',
    voltage_kV: 132,
    status: 'existing',
    operator: 'TNB',
    coords: [
      [6.10, 100.37], [6.18, 100.42], [6.28, 100.42],
    ],
    commissionYear: 1988,
    notes: 'Kedah paddy heartland distribution line.',
  },
  {
    id: 'tnb-132-kangar-arau-perlis',
    name: 'TNB 132 kV — Kangar → Arau (Perlis)',
    voltage_kV: 132,
    status: 'existing',
    operator: 'TNB',
    coords: [
      [6.45, 100.19], [6.43, 100.28],
    ],
    commissionYear: 1985,
    notes: 'Perlis state distribution backbone.',
  },
  {
    id: 'tnb-132-sungai-siput-chemor-perak',
    name: 'TNB 132 kV — Sungai Siput → Chemor → Ipoh (Perak valley)',
    voltage_kV: 132,
    status: 'existing',
    operator: 'TNB',
    coords: [
      [4.84, 101.05], [4.76, 101.07], [4.58, 101.08],
    ],
    commissionYear: 1990,
    notes: 'Perak valley 132 kV distribution serving mid-Perak industrials.',
  },
  {
    id: 'tnb-132-bidor-tg-malim',
    name: 'TNB 132 kV — Bidor → Tanjung Malim (South Perak)',
    voltage_kV: 132,
    status: 'existing',
    operator: 'TNB',
    coords: [
      [4.12, 101.28], [3.97, 101.32], [3.68, 101.52],
    ],
    commissionYear: 1989,
    notes: 'South Perak to KL border distribution corridor.',
  },
  {
    id: 'tnb-132-parit-buntar-bagan-serai',
    name: 'TNB 132 kV — Parit Buntar → Bagan Serai (Lower Perak)',
    voltage_kV: 132,
    status: 'existing',
    operator: 'TNB',
    coords: [
      [5.12, 100.49], [5.02, 100.55], [4.98, 100.78],
    ],
    commissionYear: 1992,
    notes: 'Feeds lower Perak paddy and agro-industrial zone.',
  },

  // ── Planned / under construction ──────────────────────────────────────────
  {
    id: 'tnb-275-nesr-planned',
    name: 'TNB 275 kV — NESR Reinforcement (Perlis → Kedah, planned)',
    voltage_kV: 275,
    status: 'planned',
    operator: 'TNB',
    coords: [
      [6.38, 100.20], [6.25, 100.35], [6.05, 100.48],
    ],
    commissionYear: 2028,
    capacity_MW: 1500,
    notes: 'Part of Malaysia NESR/CRESS grid reinforcement programme to support RE injection from northern MY LSS projects.',
  },
  {
    id: 'tnb-132-kulim-solar-spur',
    name: 'TNB 132 kV — Kulim Hi-Tech Spur (planned, LSS-dedicated)',
    voltage_kV: 132,
    status: 'planned',
    operator: 'TNB',
    coords: [
      [5.38, 100.56], [5.42, 100.45], [5.48, 100.38],
    ],
    commissionYear: 2027,
    notes: 'Dedicated 132 kV spur planned for LSS-5/6 solar injection in Kedah agricultural zone.',
  },
];
