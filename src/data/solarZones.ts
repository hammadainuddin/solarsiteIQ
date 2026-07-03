import type { LandUseClass, RiskLevel } from '../types';

// Protected-area and flood-risk zone registry for northern Peninsular Malaysia.
// Non-protected land use zones have been removed — land use is now derived from
// ESA WorldCover 2021 (10 m, free, global) via /api/worldcover.
// This file retains ONLY zones where isProtected=true (gazetted forest reserves,
// Ramsar sites, national parks) so that grid1km.ts can honour them with priority.

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
  // PERLIS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'perlis-forest-wang-kelian',
    label: 'Wang Kelian Forest Reserve (Perlis)',
    landUse: 'forest', floodRisk: 'low', isProtected: true,
    bounds: { south: 6.30, north: 6.50, west: 100.05, east: 100.16 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KEDAH
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'kedah-forest-ulu-muda',
    label: 'Ulu Muda Forest Reserve (Kedah)',
    landUse: 'forest', floodRisk: 'low', isProtected: true,
    bounds: { south: 5.70, north: 6.10, west: 101.10, east: 101.55 },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERAK — coastal protected zones
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'perak-kuala-gula-mangrove',
    label: 'Kuala Gula Mangrove & Bird Sanctuary (Ramsar, N Perak coast)',
    landUse: 'forest', floodRisk: 'medium', isProtected: true,
    bounds: { south: 4.85, north: 5.12, west: 100.38, east: 100.53 },
  },
  {
    id: 'perak-coastal-mangrove-mid',
    label: 'Perak Mid-Coast Mangrove Strip (Lumut–Beruas)',
    landUse: 'forest', floodRisk: 'medium', isProtected: true,
    bounds: { south: 4.35, north: 4.85, west: 100.46, east: 100.56 },
  },
  {
    id: 'perak-segari-forest',
    label: 'Segari Melintang Forest Reserve (Perak)',
    landUse: 'forest', floodRisk: 'low', isProtected: true,
    bounds: { south: 4.08, north: 4.35, west: 100.56, east: 100.73 },
  },

  // ── Perak reservoirs ──────────────────────────────────────────────────────
  {
    id: 'perak-temengor-reservoir',
    label: 'Temengor / Banding Reservoir (FPV candidate)',
    landUse: 'water', floodRisk: 'low', isProtected: true,
    bounds: { south: 5.28, north: 5.72, west: 101.28, east: 101.65 },
  },
  {
    id: 'perak-bersia-lake',
    label: 'Temenggor / Bersia Reservoir Area',
    landUse: 'water', floodRisk: 'low', isProtected: true,
    bounds: { south: 5.10, north: 5.75, west: 101.25, east: 101.65 },
  },

  // ── Broad protected catch-alls ────────────────────────────────────────────
  {
    id: 'perak-royal-belum',
    label: 'Royal Belum State Park (Hulu Perak)',
    landUse: 'forest', floodRisk: 'low', isProtected: true,
    bounds: { south: 5.20, north: 5.72, west: 101.25, east: 101.70 },
    // west was 101.08 — narrowed to 101.25 to exclude Perak River valley agriculture near Gerik
  },
  {
    id: 'perak-titiwangsa-forest',
    label: 'Titiwangsa / Main Range Forest (Perak)',
    landUse: 'forest', floodRisk: 'low', isProtected: true,
    bounds: { south: 3.80, north: 6.00, west: 101.55, east: 102.00 },
  },
];

// Returns the first matching protected zone for a coordinate, or null.
// Non-protected zones are intentionally omitted — use WorldCover for those.
export function getZoneAt(lat: number, lng: number): LandZone | null {
  for (const zone of LAND_ZONES) {
    const { south, north, west, east } = zone.bounds;
    if (lat >= south && lat <= north && lng >= west && lng <= east) return zone;
  }
  return null;
}
