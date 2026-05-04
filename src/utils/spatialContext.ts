import type { TransmissionLine } from '../data/transmissionLines';
import type { SubstationFeature, FibreNodeFeature } from '../data/infraLayers';
import { SUBSTATIONS, FIBRE_NODES } from '../data/infraLayers';
import { DC_DATABASE } from '../data/dcDatabase';
import type { DataCentre } from '../types';

export interface NearestAsset<T> {
  asset: T;
  distanceKm: number;
}

export interface GeocodedLocation {
  country: string;
  countryCode: string;
  state?: string;
  city?: string;
  displayName: string;
}

export interface LocationContext {
  lat: number;
  lng: number;
  country: string | null;         // fast bbox fallback — may be wrong near borders
  geocoded: GeocodedLocation | null; // accurate reverse-geocode result
  nearestSubstations: NearestAsset<SubstationFeature>[];
  nearestLines: NearestAsset<TransmissionLine>[];
  nearestFibreNodes: NearestAsset<FibreNodeFeature>[];
  nearbyDCs: { dc: DataCentre; distanceKm: number }[];
  totalNearbyMW: number;
  totalNearbyITLoad: number;
}

interface LatLng { lat: number; lng: number }

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLng = (b.lng - a.lng) * (Math.PI / 180);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * (Math.PI / 180)) * Math.cos(b.lat * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

export function pointToPolylineKm(p: LatLng, coords: [number, number][]): number {
  let minDist = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = { lat: coords[i][0], lng: coords[i][1] };
    const b = { lat: coords[i + 1][0], lng: coords[i + 1][1] };
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      minDist = Math.min(minDist, haversineKm(p, a));
      continue;
    }
    const t = Math.max(0, Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / lenSq));
    minDist = Math.min(minDist, haversineKm(p, { lat: a.lat + t * dy, lng: a.lng + t * dx }));
  }
  return minDist;
}

// Fast UI-badge hint only — NOT used for LLM prompts (reverseGeocode() is authoritative).
// Bboxes are tightened to the unambiguous core of each country to reduce cross-border
// false positives.  Border areas, islands, and disputed zones may return null here;
// that is acceptable because geocoding fills in the accurate value before analysis.
const COUNTRY_BBOXES = [
  // Tiny / island states first — they always win when the point is clearly inside
  { code: 'SG', south: 1.15,  north: 1.47,  west: 103.60, east: 104.10 }, // north 1.47 excludes JB (1.48+)
  { code: 'BN', south: 3.90,  north: 5.05,  west: 114.15, east: 115.35 },
  // Continental mainland — tightened to avoid overlapping neighbours
  { code: 'KH', south: 10.40, north: 14.70, west: 102.40, east: 106.00 }, // east 106.0 excludes VN Mekong Delta
  { code: 'MM', south: 15.00, north: 28.50, west: 92.20,  east: 101.20 }, // exclude southern TH overlap
  { code: 'LA', south: 14.00, north: 22.50, west: 100.10, east: 104.50 }, // tight core, avoid VN east
  { code: 'TH', south:  7.00, north: 20.50, west: 98.00,  east: 104.80 }, // south 7.0 captures Hat Yai; gap to MY (north 6.72) handled by geocode
  { code: 'VN', south:  8.50, north: 23.50, west: 104.00, east: 109.50 }, // push west edge east to avoid LA
  // Peninsula Malaysia — south 1.45 includes JB (1.49°N) but excludes Riau Islands (~0.8–1.2°N)
  { code: 'MY', south:  1.45, north:  6.72, west:  99.60, east: 104.60 }, // peninsular only
  // East Malaysia (Sabah + Sarawak) — eastern half of Borneo, clear of Kalimantan core
  { code: 'MY', south:  0.85, north:  7.40, west: 109.50, east: 119.30 },
  // Philippines — tight island group
  { code: 'PH', south:  5.00, north: 21.00, west: 117.00, east: 126.50 },
  // Indonesia — last resort; will only match points not claimed by tighter boxes above
  { code: 'ID', south: -11.0, north:  5.80, west:  95.00, east: 141.00 },
];

export function inferCountry(lat: number, lng: number): string | null {
  for (const c of COUNTRY_BBOXES) {
    if (lat >= c.south && lat <= c.north && lng >= c.west && lng <= c.east) return c.code;
  }
  return null;
}

export function getLocationContext(
  lat: number,
  lng: number,
  lines: TransmissionLine[],
  substations?: SubstationFeature[],
): LocationContext {
  const p = { lat, lng };
  const country = inferCountry(lat, lng);

  const subList = substations && substations.length > 0 ? substations : SUBSTATIONS;
  const nearestSubstations = subList
    .map((s) => ({ asset: s, distanceKm: haversineKm(p, { lat: s.lat, lng: s.lng }) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);

  const nearestLines = lines
    .map((l) => ({ asset: l, distanceKm: pointToPolylineKm(p, l.coords) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);

  const nearestFibreNodes = FIBRE_NODES
    .map((n) => ({ asset: n, distanceKm: haversineKm(p, { lat: n.lat, lng: n.lng }) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);

  const nearbyDCs = DC_DATABASE
    .map((dc) => ({ dc, distanceKm: haversineKm(p, dc.coordinates) }))
    .filter(({ distanceKm }) => distanceKm <= 25)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    lat,
    lng,
    country,
    geocoded: null,
    nearestSubstations,
    nearestLines,
    nearestFibreNodes,
    nearbyDCs,
    totalNearbyMW:     nearbyDCs.reduce((s, { dc }) => s + dc.capacityMW, 0),
    totalNearbyITLoad: nearbyDCs.reduce((s, { dc }) => s + dc.itLoadMW, 0),
  };
}

// ── Reverse geocoding via Nominatim ───────────────────────────────────────────

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedLocation | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'dc-siteiq/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address ?? {};
    return {
      country:     addr.country     ?? data.display_name ?? 'Unknown',
      countryCode: (addr.country_code ?? '').toUpperCase(),
      state:       addr.state       ?? addr.region ?? undefined,
      city:        addr.city        ?? addr.town ?? addr.village ?? addr.county ?? undefined,
      displayName: data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    };
  } catch {
    return null;
  }
}
