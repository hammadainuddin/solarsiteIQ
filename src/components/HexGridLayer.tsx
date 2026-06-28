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
}

const GRID_W = Math.round((GRID_BBOX.east  - GRID_BBOX.west)  / GRID_STEP); // 289
const GRID_H = Math.round((GRID_BBOX.north - GRID_BBOX.south) / GRID_STEP); // 378

// The image overlay covers the exact extent of the grid
const OVERLAY_BOUNDS: [[number, number], [number, number]] = [
  [GRID_BBOX.south, GRID_BBOX.west],
  [+(GRID_BBOX.south + GRID_H * GRID_STEP).toFixed(3), +(GRID_BBOX.west + GRID_W * GRID_STEP).toFixed(3)],
];

function scoreToRGB(score: number): [number, number, number] {
  if (score >= 70) return [34, 197, 94];  // green-500
  if (score >= 45) return [251, 191, 36]; // amber-400
  return [239, 68, 68];                   // red-500
}

function renderToCanvas(
  tiles: HexTile[],
  dimension: HexScoreDimension,
  selectedId: string | undefined,
  stateFilter: string,
): string {
  const canvas = document.createElement('canvas');
  canvas.width  = GRID_W;
  canvas.height = GRID_H;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(GRID_W, GRID_H);
  const d = imageData.data;

  for (const tile of tiles) {
    if (stateFilter !== 'All' && !tile.states.includes(stateFilter as never)) continue;

    const [swLat, swLng] = parseCellId(tile.h3Index);
    const x = Math.round((swLng - GRID_BBOX.west)  / GRID_STEP);
    const y = GRID_H - 1 - Math.round((swLat - GRID_BBOX.south) / GRID_STEP);

    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;

    const score = tile.scores[dimension];
    const isSelected = tile.h3Index === selectedId;
    const [r, g, b] = scoreToRGB(score);
    const alpha = isSelected ? 230 : 160;

    const idx = (y * GRID_W + x) * 4;
    d[idx]     = r;
    d[idx + 1] = g;
    d[idx + 2] = b;
    d[idx + 3] = alpha;
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
                <div>Land use: <strong>{tile.attributes.landUse.replace(/_/g, ' ')}</strong></div>
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
}: {
  tileMap: Map<string, HexTile>;
  onTileClick: (tile: HexTile) => void;
}) {
  useMapEvents({
    click(e) {
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
      <ClickHandler tileMap={tileMap.current} onTileClick={handleTileClick} />
    </>
  );
}
