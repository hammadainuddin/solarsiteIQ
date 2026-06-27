// Thin adapter shim — delegates tile generation to grid1km.ts.
// Exports are kept so SolarMapView.tsx and other consumers don't need changes.

import type { HexTile } from '../types';
import type { SubstationFeature } from '../data/infraLayers';
import type { TransmissionLine } from '../data/transmissionLines';
import type { StateBoundaryGeo } from './overpass';
import { generate1KmTiles, cellBounds } from './grid1km';

export const H3_RESOLUTION = 6; // kept for backward compat; value unused in 1km grid

/** Return the four corner lat/lng tuples of a 1 km cell (used by HexGridLayer and REZClusters). */
export function hexBoundary(cellId: string): [number, number][] {
  return cellBounds(cellId);
}

/**
 * Generate all 1 km × 1 km tiles for northern Malaysia.
 * Returns empty array when boundaries haven't loaded yet (fast-fail prevents
 * useless work on initial render before async OSM fetch completes).
 */
export async function generateNorthernMyHexTiles(
  lines: TransmissionLine[],
  subs: SubstationFeature[],
  boundaries?: StateBoundaryGeo[] | null,
  onProgress?: (done: number, total: number) => void,
): Promise<HexTile[]> {
  if (!boundaries || boundaries.length === 0) return [];
  return generate1KmTiles(lines, subs, boundaries, onProgress);
}
