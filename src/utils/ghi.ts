// GHI estimation for northern Peninsular Malaysia
// Based on SEDA/MGTC solar resource atlas data and NASA POWER regional averages

interface GHIRegion {
  south: number;
  north: number;
  west: number;
  east: number;
  ghiMin: number;
  ghiMax: number;
  label: string;
}

const GHI_REGIONS: GHIRegion[] = [
  // Titiwangsa highlands — cloud/rain shadow, lowest GHI
  { south: 3.80, north: 6.00, west: 101.35, east: 102.00, ghiMin: 4.4, ghiMax: 4.8, label: 'Titiwangsa Highland' },
  // Perlis + NW Kedah — flattest, driest, highest GHI in Malaysia
  { south: 6.20, north: 6.75, west: 99.80, east: 100.50, ghiMin: 5.3, ghiMax: 5.6, label: 'Perlis / NW Kedah' },
  // Central Kedah MADA zone
  { south: 5.50, north: 6.20, west: 100.10, east: 100.70, ghiMin: 5.1, ghiMax: 5.4, label: 'Central Kedah (MADA)' },
  // Penang island + coastal — higher humidity/cloud
  { south: 5.18, north: 5.55, west: 100.10, east: 100.55, ghiMin: 4.8, ghiMax: 5.1, label: 'Penang' },
  // Perak valley (Ipoh corridor)
  { south: 4.20, north: 5.20, west: 100.70, east: 101.35, ghiMin: 4.9, ghiMax: 5.3, label: 'Perak Valley' },
  // Lower Perak coastal
  { south: 3.80, north: 4.20, west: 100.35, east: 101.00, ghiMin: 4.8, ghiMax: 5.1, label: 'Lower Perak Coast' },
  // East Kedah (Baling / Sik) — slightly more inland cloud
  { south: 5.50, north: 6.00, west: 100.60, east: 101.20, ghiMin: 5.0, ghiMax: 5.3, label: 'East Kedah' },
];

const DEFAULT_GHI = 5.1; // fallback for any unclassified tile in the bounding box

export function estimateGHI(lat: number, lng: number): number {
  for (const r of GHI_REGIONS) {
    if (lat >= r.south && lat <= r.north && lng >= r.west && lng <= r.east) {
      // Interpolate within the region based on rough latitude gradient
      const t = (lat - r.south) / (r.north - r.south);
      return +(r.ghiMin + t * (r.ghiMax - r.ghiMin)).toFixed(2);
    }
  }
  return DEFAULT_GHI;
}

export function ghiLabel(ghi: number): string {
  if (ghi >= 5.3) return 'Excellent (≥5.3 kWh/m²/day)';
  if (ghi >= 5.0) return 'Good (5.0–5.3 kWh/m²/day)';
  if (ghi >= 4.7) return 'Moderate (4.7–5.0 kWh/m²/day)';
  return 'Low (<4.7 kWh/m²/day)';
}
