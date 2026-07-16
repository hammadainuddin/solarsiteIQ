// Polygon drawing overlay for Solar SiteIQ.
// User clicks to drop vertices; clicking near the first vertex (or pressing
// "Close & Analyse") seals the polygon and runs site area analysis.
// Integrates with react-leaflet via useMapEvents — no new npm packages.

import { useState, useCallback } from 'react';
import { useMap, useMapEvents, CircleMarker, Polyline, Polygon } from 'react-leaflet';
import type { HexTile } from '../types';
import { analyzeArea, shoelaceAreaKm2 } from '../utils/siteAreaAnalysis';
import SiteAreaInfoBox from './SiteAreaInfoBox';
import type { SiteAreaResult } from '../utils/siteAreaAnalysis';

interface Props {
  tiles: HexTile[];
  drawMode: boolean;
  onDrawModeChange: (active: boolean) => void;
}

// Snap radius to close the polygon, measured in SCREEN PIXELS (not geographic
// distance) so it behaves the same at every zoom level. A fixed geographic
// threshold auto-closed prematurely when zoomed in — a whole small polygon can
// sit within ~1 km of its first vertex, so the 3rd click always landed "near"
// the first and sealed the shape by itself.
const CLOSE_THRESHOLD_PX = 16;

// ── Map event consumer ────────────────────────────────────────────────────────

function DrawEventHandler({
  drawMode,
  vertices,
  onAddVertex,
  onClose,
}: {
  drawMode: boolean;
  vertices: [number, number][];
  onAddVertex: (v: [number, number]) => void;
  onClose: () => void;
}) {
  const map = useMap();
  useMapEvents({
    click(e) {
      if (!drawMode) return;
      const v: [number, number] = [e.latlng.lat, e.latlng.lng];
      // Close only when the click lands within CLOSE_THRESHOLD_PX screen pixels
      // of the first vertex (and there are already ≥3 vertices).
      if (vertices.length >= 3) {
        const clickPt = map.latLngToContainerPoint(e.latlng);
        const firstPt = map.latLngToContainerPoint(vertices[0]);
        if (clickPt.distanceTo(firstPt) < CLOSE_THRESHOLD_PX) {
          onClose();
          e.originalEvent.stopPropagation();
          return;
        }
      }
      onAddVertex(v);
      e.originalEvent.stopPropagation();
    },
  });
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SiteAreaTool({ tiles, drawMode, onDrawModeChange }: Props) {
  const [vertices, setVertices]   = useState<[number, number][]>([]);
  const [closed,   setClosed]     = useState(false);
  const [result,   setResult]     = useState<SiteAreaResult | null>(null);

  const addVertex = useCallback((v: [number, number]) => {
    setVertices((prev) => [...prev, v]);
  }, []);

  const closePoly = useCallback(() => {
    if (vertices.length < 3) return;
    setClosed(true);
    onDrawModeChange(false);
    const ring = [...vertices];
    setResult(analyzeArea(ring, tiles));
  }, [vertices, tiles, onDrawModeChange]);

  const clear = useCallback(() => {
    setVertices([]);
    setClosed(false);
    setResult(null);
    onDrawModeChange(false);
  }, [onDrawModeChange]);

  // Derived
  const drawnAreaKm2 = vertices.length >= 3 ? shoelaceAreaKm2(vertices) : 0;

  return (
    <>
      <DrawEventHandler
        drawMode={drawMode && !closed}
        vertices={vertices}
        onAddVertex={addVertex}
        onClose={closePoly}
      />

      {/* Vertex dots */}
      {vertices.map((v, i) => (
        <CircleMarker
          key={i}
          center={v}
          radius={i === 0 ? 6 : 4}
          pathOptions={{
            color:       i === 0 ? '#f59e0b' : '#fbbf24',
            fillColor:   i === 0 ? '#f59e0b' : '#fbbf24',
            fillOpacity: 1,
            weight:      1.5,
          }}
        />
      ))}

      {/* Edges */}
      {vertices.length >= 2 && !closed && (
        <Polyline
          positions={vertices}
          pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '6 4', opacity: 0.85 }}
        />
      )}

      {/* Closed polygon fill */}
      {closed && vertices.length >= 3 && (
        <Polygon
          positions={vertices}
          pathOptions={{
            color:       '#f59e0b',
            weight:      2,
            fillColor:   '#f59e0b',
            fillOpacity: 0.12,
            opacity:     0.85,
          }}
        />
      )}

      {/* While drawing: area preview + close button */}
      {drawMode && !closed && vertices.length >= 2 && (
        <div className="absolute bottom-8 left-3 z-[2000] bg-slate-900/95 border border-slate-700 rounded-xl px-3 py-2 shadow-xl">
          <p className="text-slate-400 text-[10px] mb-1">
            {vertices.length} vertices · {drawnAreaKm2 > 0 ? `~${drawnAreaKm2.toFixed(1)} km²` : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={closePoly}
              className="text-[11px] px-3 py-1 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 transition-colors"
            >
              Close & Analyse
            </button>
            <button
              onClick={clear}
              className="text-[11px] px-2 py-1 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Results panel */}
      {result && (
        <SiteAreaInfoBox result={result} onClose={clear} />
      )}
    </>
  );
}
