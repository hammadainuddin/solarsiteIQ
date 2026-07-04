// Grid rendering for Solar SiteIQ — 1 km × 1 km canvas overlay.
// At all zoom levels: a single L.ImageOverlay (289×378 px canvas) coloured by score.
// At zoom ≥ 11: L.Rectangle outlines for the ~200 visible cells in the viewport.

import { useEffect, useRef, useCallback } from 'react';
import { useMap, useMapEvents, Rectangle, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { HexTile, HexScoreDimension } from '../types';
import { scoreToVerdict } from '../utils/solarScoring';
import { GRID_BBOX, GRID_STEP, parseCellId, cellBounds } from '../utils/grid1km';

interface Props {
  tiles: HexTile[];
  activeDimension: HexScoreDimension;
  stateFilter: string;
  onTileClick: (tile: HexTile) => void;
  selectedTileIndex?: string;
  disableClicks?: boolean;
}

const GRID_W = Math.round((GRID_BBOX.east  - GRID_BBOX.west)  / GRID_STEP); // 289
const GRID_H = Math.round((GRID_BBOX.north - GRID_BBOX.south) / GRID_STEP); // 378

// The image overlay covers the exact extent of the grid
const OVERLAY_BOUNDS: [[number, number], [number, number]] = [
  [GRID_BBOX.south, GRID_BBOX.west],
  [+(GRID_BBOX.south + GRID_H * GRID_STEP).toFixed(3), +(GRID_BBOX.west + GRID_W * GRID_STEP).toFixed(3)],
];

// ── Continuous perceptual color scale ────────────────────────────────────────
// Smooth gradient: deep red (0) → orange (35) → amber (50) → yellow-green (65) → green (80+)
// No hard steps — blends across the full 0–100 range.

const COLOR_STOPS: [number, number, number, number][] = [
  //  score   R    G    B
  [    0, 153,  27,  27 ], // deep red
  [   25, 220,  38,  38 ], // red
  [   45, 249, 115,  22 ], // orange
  [   58, 250, 204,  21 ], // yellow
  [   70, 132, 204,  22 ], // yellow-green
  [   82,  34, 197,  94 ], // green
  [  100,  21, 128,  61 ], // deep green
];

function scoreToRGB(score: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(100, score));
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [s0, r0, g0, b0] = COLOR_STOPS[i - 1];
    const [s1, r1, g1, b1] = COLOR_STOPS[i];
    if (clamped <= s1) {
      const t = (clamped - s0) / (s1 - s0);
      return [
        Math.round(r0 + (r1 - r0) * t),
        Math.round(g0 + (g1 - g0) * t),
        Math.round(b0 + (b1 - b0) * t),
      ];
    }
  }
  const last = COLOR_STOPS[COLOR_STOPS.length - 1];
  return [last[1], last[2], last[3]];
}

// ── Gaussian spatial smoothing ────────────────────────────────────────────────
// Blends each cell's score with its neighbours (sigma=1.8 ≈ 2 km radius).
// Removes single-cell anomalies and produces gradual zone transitions while
// preserving large-scale patterns (forest, paddy, oil palm belts).

const BLUR_SIGMA   = 1.8;
const BLUR_RADIUS  = 3; // 7×7 kernel
const BLUR_WEIGHTS: number[] = [];
(function buildKernel() {
  for (let dy = -BLUR_RADIUS; dy <= BLUR_RADIUS; dy++)
    for (let dx = -BLUR_RADIUS; dx <= BLUR_RADIUS; dx++)
      BLUR_WEIGHTS.push(Math.exp(-(dx * dx + dy * dy) / (2 * BLUR_SIGMA * BLUR_SIGMA)));
})();

function blurScoreGrid(
  grid: Float32Array,
  mask: Uint8Array,
  w: number,
  h: number,
): Float32Array {
  const out = new Float32Array(grid.length).fill(-1);
  let ki = 0;
  for (let dy = -BLUR_RADIUS; dy <= BLUR_RADIUS; dy++) {
    for (let dx = -BLUR_RADIUS; dx <= BLUR_RADIUS; dx++) {
      const wt = BLUR_WEIGHTS[ki++];
      for (let y = 0; y < h; y++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          if (!mask[idx]) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const nidx = ny * w + nx;
          if (!mask[nidx]) continue;
          if (out[idx] < 0) out[idx] = 0;
          out[idx] += grid[nidx] * wt;
        }
      }
    }
  }
  // Normalise by summing weights that contributed
  const normGrid = new Float32Array(grid.length).fill(-1);
  ki = 0;
  for (let dy = -BLUR_RADIUS; dy <= BLUR_RADIUS; dy++) {
    for (let dx = -BLUR_RADIUS; dx <= BLUR_RADIUS; dx++) {
      const wt = BLUR_WEIGHTS[ki++];
      for (let y = 0; y < h; y++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          if (!mask[idx]) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const nidx = ny * w + nx;
          if (!mask[nidx]) continue;
          if (normGrid[idx] < 0) normGrid[idx] = 0;
          normGrid[idx] += wt;
        }
      }
    }
  }
  for (let i = 0; i < out.length; i++) {
    if (normGrid[i] > 0) out[i] = out[i] / normGrid[i];
  }
  return out;
}

// ── Canvas renderer ───────────────────────────────────────────────────────────

function renderToCanvas(
  tiles: HexTile[],
  dimension: HexScoreDimension,
  selectedId: string | undefined,
  stateFilter: string,
): string {
  // 1. Build score + mask grids
  const scoreGrid = new Float32Array(GRID_W * GRID_H).fill(-1);
  const maskGrid  = new Uint8Array(GRID_W * GRID_H);
  const isSelected = new Uint8Array(GRID_W * GRID_H);

  for (const tile of tiles) {
    if (stateFilter !== 'All' && !tile.states.includes(stateFilter as never)) continue;
    const [swLat, swLng] = parseCellId(tile.h3Index);
    const x = Math.round((swLng - GRID_BBOX.west)  / GRID_STEP);
    const y = GRID_H - 1 - Math.round((swLat - GRID_BBOX.south) / GRID_STEP);
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
    const idx = y * GRID_W + x;
    scoreGrid[idx] = tile.scores[dimension];
    maskGrid[idx]  = 1;
    if (tile.h3Index === selectedId) isSelected[idx] = 1;
  }

  // 2. Gaussian spatial smoothing
  const blurred = blurScoreGrid(scoreGrid, maskGrid, GRID_W, GRID_H);

  // 3. Render to canvas
  const canvas = document.createElement('canvas');
  canvas.width  = GRID_W;
  canvas.height = GRID_H;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(GRID_W, GRID_H);
  const d = imageData.data;

  for (let i = 0; i < GRID_W * GRID_H; i++) {
    if (!maskGrid[i]) continue;
    const score = blurred[i] >= 0 ? blurred[i] : scoreGrid[i];
    const [r, g, b] = scoreToRGB(score);
    const alpha = isSelected[i] ? 230 : 170;
    const pi = i * 4;
    d[pi] = r; d[pi + 1] = g; d[pi + 2] = b; d[pi + 3] = alpha;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ── Canvas overlay component ──────────────────────────────────────────────────

function CanvasOverlay({
  tiles,
  activeDimension,
  stateFilter,
  selectedTileIndex,
}: {
  tiles: HexTile[];
  activeDimension: HexScoreDimension;
  stateFilter: string;
  selectedTileIndex?: string;
}) {
  const map = useMap();
  const overlayRef = useRef<L.ImageOverlay | null>(null);

  // 1×1 transparent PNG so the overlay element exists but shows nothing before data arrives
  const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';

  // Create overlay once
  useEffect(() => {
    const overlay = L.imageOverlay(BLANK_PNG, OVERLAY_BOUNDS, {
      opacity: 0.75,
      zIndex: 410,
      interactive: false,
      className: 'grid-canvas-overlay',
    }).addTo(map);
    overlayRef.current = overlay;
    return () => { overlay.remove(); overlayRef.current = null; };
  }, [map]);

  // Update canvas whenever tile data or display settings change
  useEffect(() => {
    if (!overlayRef.current || tiles.length === 0) return;
    const url = renderToCanvas(tiles, activeDimension, selectedTileIndex, stateFilter);
    overlayRef.current.setUrl(url);
  }, [tiles, activeDimension, selectedTileIndex, stateFilter]);

  return null;
}

// ── Viewport detail rectangles at zoom ≥ 11 ──────────────────────────────────

function DetailRectangles({
  tileMap,
  activeDimension,
  stateFilter,
  selectedTileIndex,
  onTileClick,
}: {
  tileMap: Map<string, HexTile>;
  activeDimension: HexScoreDimension;
  stateFilter: string;
  selectedTileIndex?: string;
  onTileClick: (tile: HexTile) => void;
}) {
  const map = useMap();
  const zoomRef = useRef(map.getZoom());

  useMapEvents({ zoom() { zoomRef.current = map.getZoom(); } });

  const zoom = zoomRef.current;
  if (zoom < 11 || tileMap.size === 0) return null;

  // Get visible bounds (with a 0.1° buffer)
  const bounds = map.getBounds();
  const visLats = {
    min: bounds.getSouth() - 0.02,
    max: bounds.getNorth() + 0.02,
  };
  const visLngs = {
    min: bounds.getWest()  - 0.02,
    max: bounds.getEast()  + 0.02,
  };

  const visible: HexTile[] = [];
  for (const tile of tileMap.values()) {
    if (stateFilter !== 'All' && !tile.states.includes(stateFilter as never)) continue;
    const [swLat, swLng] = parseCellId(tile.h3Index);
    if (swLat < visLats.min || swLat > visLats.max) continue;
    if (swLng < visLngs.min || swLng > visLngs.max) continue;
    visible.push(tile);
    if (visible.length > 400) break; // cap for performance
  }

  return (
    <>
      {visible.map((tile) => {
        const score = tile.scores[activeDimension];
        const isSelected = tile.h3Index === selectedTileIndex;
        const [r, g, b] = scoreToRGB(score);
        const color = `rgb(${r},${g},${b})`;
        const bounds_rect = cellBounds(tile.h3Index) as [[number,number],[number,number],[number,number],[number,number]];
        const rectBounds: [[number,number],[number,number]] = [
          [bounds_rect[0][0], bounds_rect[0][1]],
          [bounds_rect[2][0], bounds_rect[2][1]],
        ];

        return (
          <Rectangle
            key={tile.h3Index}
            bounds={rectBounds}
            pathOptions={{
              fillColor: color,
              fillOpacity: isSelected ? 0.9 : 0.0, // fill only for selected; overlay handles colour
              color: isSelected ? '#ffffff' : color,
              weight: isSelected ? 2 : 0.5,
              opacity: isSelected ? 1 : 0.6,
            }}
            eventHandlers={{ click: () => onTileClick(tile) }}
          >
            <Tooltip sticky>
              <div style={{ fontSize: 12, lineHeight: 1.6, minWidth: 200 }}>
                <strong style={{ display: 'block' }}>
                  {tile.states.join(' / ') || 'Unknown'}
                </strong>
                <div>Land use: <strong>{tile.attributes.landUse.replace(/_/g, ' ')}</strong>{tile.attributes.isRiverbank && tile.attributes.landUse !== 'river' ? <span style={{ color: '#38bdf8' }}> (Riverbank)</span> : null}</div>
                <div>Composite: <strong>{tile.scores.composite}</strong> — {scoreToVerdict(tile.scores.composite)}</div>
                <div>Capacity: <strong>{tile.attributes.capacityKWp.toLocaleString()} kWp</strong></div>
                <div>Annual yield: <strong>{tile.attributes.annualYieldMWh.toLocaleString()} MWh/yr</strong></div>
                <div style={{ color: '#fbbf24' }}>PVGIS: {tile.attributes.pvgisEyKWhPerKWp} kWh/kWp/yr</div>
              </div>
            </Tooltip>
          </Rectangle>
        );
      })}
    </>
  );
}

// ── Click handler: canvas → cell lookup ──────────────────────────────────────

function ClickHandler({
  tileMap,
  onTileClick,
  disabled,
}: {
  tileMap: Map<string, HexTile>;
  onTileClick: (tile: HexTile) => void;
  disabled?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      const { lat, lng } = e.latlng;
      // Snap to SW corner of 0.009° cell
      const swLat = +(Math.floor((lat - GRID_BBOX.south) / GRID_STEP) * GRID_STEP + GRID_BBOX.south).toFixed(3);
      const swLng = +(Math.floor((lng - GRID_BBOX.west)  / GRID_STEP) * GRID_STEP + GRID_BBOX.west).toFixed(3);
      const cellId = `${swLat}_${swLng}`;
      const tile = tileMap.get(cellId);
      if (tile) onTileClick(tile);
    },
  });
  return null;
}

// ── Main exported component ───────────────────────────────────────────────────

export default function HexGridLayer({
  tiles,
  activeDimension,
  stateFilter,
  onTileClick,
  selectedTileIndex,
  disableClicks,
}: Props) {
  const tileMap = useRef<Map<string, HexTile>>(new Map());

  // Keep tileMap in sync
  useEffect(() => {
    tileMap.current = new Map(tiles.map((t) => [t.h3Index, t]));
  }, [tiles]);

  const handleTileClick = useCallback(
    (tile: HexTile) => onTileClick(tile),
    [onTileClick],
  );

  return (
    <>
      <CanvasOverlay
        tiles={tiles}
        activeDimension={activeDimension}
        stateFilter={stateFilter}
        selectedTileIndex={selectedTileIndex}
      />
      <DetailRectangles
        tileMap={tileMap.current}
        activeDimension={activeDimension}
        stateFilter={stateFilter}
        selectedTileIndex={selectedTileIndex}
        onTileClick={handleTileClick}
      />
      <ClickHandler tileMap={tileMap.current} onTileClick={handleTileClick} disabled={disableClicks} />
    </>
  );
}
