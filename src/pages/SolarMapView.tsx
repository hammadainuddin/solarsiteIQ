import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Pane, Marker, useMapEvents, CircleMarker, Tooltip, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, MapPin, Zap, Loader2, Settings } from 'lucide-react';
import { NORTHERN_MY_LINES } from '../data/northernMyTransmissionLines';
import { NORTHERN_MY_SUBSTATIONS } from '../data/northernMySubstations';
import HexGridLayer from '../components/HexGridLayer';
import TileScoreLegend from '../components/TileScoreLegend';
import DimensionSelector from '../components/DimensionSelector';
import StateFilter from '../components/StateFilter';
import { SolarWorkflowPanel } from '../components/SolarWorkflowPanel';
import { AssistantPanel } from '../components/AssistantPanel';
import { SettingsModal } from '../components/SettingsModal';
import { useAppContext } from '../context/AppContext';
import type { HexTile } from '../types';
import { generateNorthernMyHexTiles } from '../utils/hexGrid';
import { prefetchPvgisGrid, ensurePvgisGrid } from '../utils/pvgis';
import { ensureWorldcoverLoaded } from '../utils/worldcover';
import { ensureOsmLanduseLoaded } from '../utils/osmLanduse';
import { ensureIplanLanduseLoaded } from '../utils/iplanLanduse';
import SiteAreaTool from '../components/SiteAreaTool';
import type { TransmissionLine } from '../data/transmissionLines';
import type { SubstationFeature } from '../data/infraLayers';
import { fetchNorthernMyLinesFromOSM, fetchNorthernMySubsFromOSM } from '../utils/overpass';
import { INDUSTRIAL_ZONES, ZONE_TYPE_COLORS, ZONE_TYPE_LABELS } from '../data/industrialZones';
import type { IndustrialZone } from '../data/industrialZones';
import StateBoundaries from '../components/StateBoundaries';

const NORTHERN_MY_CENTER: [number, number] = [5.2, 101.0];
const INITIAL_ZOOM = 7;

// ── OpenGridWorks-inspired voltage colour palette ────────────────────────────
function lineColor(voltKV: number, isPlanned: boolean): string {
  if (isPlanned) return '#64748b';
  if (voltKV >= 500) return '#ff6b35'; // vivid orange-red — 500 kV backbone
  if (voltKV >= 275) return '#fbbf24'; // bright amber — 275 kV main interconnect
  if (voltKV >= 132) return '#38bdf8'; // sky blue — 132 kV distribution
  return '#a3e635';
}

function lineWeight(voltKV: number): { glow: number; core: number } {
  if (voltKV >= 500) return { glow: 14, core: 3 };
  if (voltKV >= 275) return { glow: 10, core: 2.5 };
  return { glow: 7, core: 1.8 };
}

function subColor(voltKV: number): string {
  if (voltKV >= 275) return '#fbbf24';
  return '#38bdf8';
}

// ── Fix Leaflet default icon ─────────────────────────────────────────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


function PinDropHandler({ onDrop }: { onDrop: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onDrop(e.latlng.lat, e.latlng.lng); } });
  return null;
}

// ── Glow-effect transmission line ────────────────────────────────────────────
// Two-pass render: wide semi-transparent halo behind a thin bright core.
// The outer glow is non-interactive so it never blocks hex tile clicks.
function GlowPolyline({ line }: { line: TransmissionLine }) {
  const coords = line.coords as [number, number][];
  const isPlanned = line.status === 'planned';
  const color = lineColor(line.voltage_kV, isPlanned);
  const w = lineWeight(line.voltage_kV);

  return (
    <>
      {/* Outer halo — non-interactive, never blocks clicks on hex tiles */}
      <Polyline
        positions={coords}
        interactive={false}
        pathOptions={{
          color,
          weight: w.glow,
          opacity: isPlanned ? 0.08 : 0.18,
          stroke: true,
          fill: false,
        }}
      />
      {/* Inner bright core — carries tooltip */}
      <Polyline
        positions={coords}
        pathOptions={{
          color,
          weight: w.core,
          opacity: isPlanned ? 0.50 : 0.95,
          dashArray: isPlanned ? '10 7' : undefined,
          stroke: true,
          fill: false,
        }}
      >
        <Tooltip sticky>
          <div style={{ fontSize: 11, lineHeight: 1.5 }}>
            <strong style={{ color }}>{line.voltage_kV} kV</strong>
            {' · '}
            {line.name.replace(/^TNB \d+ kV — /, '')}
            <br />
            {line.status}
            {line.capacity_MW ? ` · ${line.capacity_MW.toLocaleString()} MW` : ''}
          </div>
        </Tooltip>
      </Polyline>
    </>
  );
}

// ── Substation circle marker ─────────────────────────────────────────────────
function SubstationMarker({ sub }: { sub: SubstationFeature }) {
  const color = subColor(sub.properties.voltageKV);
  const radius = sub.properties.voltageKV >= 275 ? 8 : 5;
  return (
    <CircleMarker
      center={[sub.lat, sub.lng]}
      radius={radius}
      pathOptions={{
        color: '#0f172a',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.90,
        opacity: 1,
      }}
    >
      <Tooltip>
        <div style={{ fontSize: 11, lineHeight: 1.5 }}>
          <strong>{sub.properties.name}</strong>
          <br />{sub.properties.voltageKV} kV · {sub.properties.capacityMVA} MVA
          <br />Headroom: <strong>{sub.properties.availableHeadroomMVA} MVA</strong>
          {sub.properties.dedicatedFeedAvailable && <><br /><em>Dedicated feed available</em></>}
        </div>
      </Tooltip>
    </CircleMarker>
  );
}

// ── Industrial zone / tech park marker ───────────────────────────────────────
function IndustrialZoneMarker({ zone }: { zone: IndustrialZone }) {
  const color = ZONE_TYPE_COLORS[zone.type];
  const radius = zone.type === 'tech_park' || zone.type === 'special_economic_zone' ? 9 : 6;
  return (
    <CircleMarker
      center={[zone.lat, zone.lng]}
      radius={radius}
      pathOptions={{
        color: '#0f172a',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.88,
        opacity: 1,
      }}
    >
      <Tooltip>
        <div style={{ fontSize: 11, lineHeight: 1.6, minWidth: 180 }}>
          <strong style={{ color, display: 'block' }}>{zone.name}</strong>
          <span style={{ color: '#94a3b8' }}>{ZONE_TYPE_LABELS[zone.type]}</span>
          {' · '}{zone.state}
          {zone.areaHa && <div>Area: {zone.areaHa.toLocaleString()} ha</div>}
          {zone.keyTenants && <div>Tenants: {zone.keyTenants}</div>}
          {zone.notes && <div style={{ color: '#94a3b8', marginTop: 2 }}>{zone.notes}</div>}
        </div>
      </Tooltip>
    </CircleMarker>
  );
}

type Basemap = 'dark' | 'satellite';

// ── Layer panel ───────────────────────────────────────────────────────────────
interface LayerPanelProps {
  showHex: boolean;      onToggleHex: () => void;
  showLines: boolean;    onToggleLines: () => void;
  showSubs: boolean;     onToggleSubs: () => void;
  showZones: boolean;    onToggleZones: () => void;
  showBorders: boolean;  onToggleBorders: () => void;
  basemap: Basemap;      onBasemapChange: (b: Basemap) => void;
}
function LayerPanel({ showHex, onToggleHex, showLines, onToggleLines, showSubs, onToggleSubs, showZones, onToggleZones, showBorders, onToggleBorders, basemap, onBasemapChange }: LayerPanelProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute top-14 right-3 z-[1000]">
      <button
        onClick={() => setOpen(!open)}
        title="Layers"
        className={`w-9 h-9 rounded-lg shadow-lg flex items-center justify-center transition-colors ${open ? 'bg-blue-600 text-white' : 'bg-slate-900/95 text-slate-300 border border-slate-700 hover:bg-slate-800'}`}
      >
        <Layers size={15} />
      </button>

      {open && (
        <div className="mt-1 bg-slate-900/95 border border-slate-700 rounded-lg p-2.5 shadow-xl min-w-[180px]">
          {/* Basemap switcher */}
          <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mb-2 px-1">Basemap</p>
          <div className="flex gap-1 mb-3 px-1">
            {(['dark', 'satellite'] as Basemap[]).map((b) => (
              <button key={b} onClick={() => onBasemapChange(b)}
                className={`flex-1 text-[10px] py-1 rounded transition-colors ${basemap === b ? 'bg-amber-500 text-white font-semibold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                {b === 'dark' ? '🌑 Dark' : '🛰 Satellite'}
              </button>
            ))}
          </div>

          <div className="border-t border-slate-700 pt-2">
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mb-2 px-1">Layers</p>
            {[
              { label: 'Hex scoring grid',        active: showHex,     toggle: onToggleHex,     dot: '#22d3ee' },
              { label: 'State borders',           active: showBorders, toggle: onToggleBorders, dot: '#a78bfa' },
              { label: 'Transmission lines',      active: showLines,   toggle: onToggleLines,   dot: '#fbbf24' },
              { label: 'Substations',             active: showSubs,    toggle: onToggleSubs,    dot: '#38bdf8' },
              { label: 'Industrial zones & parks',active: showZones,   toggle: onToggleZones,   dot: '#a855f7' },
            ].map(({ label, active, toggle, dot }) => (
              <button key={label} onClick={toggle}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 transition-colors">
                <div className="w-3 h-3 rounded-sm border flex items-center justify-center"
                     style={active ? { backgroundColor: dot, borderColor: dot } : { borderColor: '#64748b' }}>
                  {active && <span className="text-slate-900 text-[8px] font-bold">✓</span>}
                </div>
                <span className="text-slate-200 text-xs">{label}</span>
              </button>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-700 space-y-1.5 px-1">
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mb-1">Voltage</p>
            {[
              { label: '500 kV backbone',     color: '#ff6b35' },
              { label: '275 kV interconnect',  color: '#fbbf24' },
              { label: '132 kV distribution',  color: '#38bdf8' },
              { label: 'Planned',              color: '#64748b', dashed: true },
            ].map(({ label, color, dashed }) => (
              <div key={label} className="flex items-center gap-2">
                <svg width="20" height="8">
                  <line x1="0" y1="4" x2="20" y2="4"
                    stroke={color} strokeWidth="2.5"
                    strokeDasharray={dashed ? '4 3' : undefined}
                    style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
                </svg>
                <span className="text-slate-300 text-[10px]">{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-700 space-y-1.5 px-1">
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mb-1">Substations</p>
            {[
              { label: '275 kV bulk supply', color: '#fbbf24', r: 8 },
              { label: '132 kV main intake', color: '#38bdf8', r: 5 },
            ].map(({ label, color, r }) => (
              <div key={label} className="flex items-center gap-2">
                <svg width="20" height="18">
                  <circle cx="10" cy="9" r={r} fill={color} stroke="#0f172a" strokeWidth="1.5"
                    style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                </svg>
                <span className="text-slate-300 text-[10px]">{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-slate-700 space-y-1.5 px-1">
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mb-1">Industrial Zones</p>
            {(Object.entries(ZONE_TYPE_COLORS) as [import('../data/industrialZones').IndustrialZoneType, string][]).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2">
                <svg width="20" height="18">
                  <circle cx="10" cy="9" r={5} fill={color} stroke="#0f172a" strokeWidth="1.5"
                    style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                </svg>
                <span className="text-slate-300 text-[10px]">{ZONE_TYPE_LABELS[type]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SolarMapView() {
  const {
    pinLocation, setPinLocation, pinMode, setPinMode,
    selectedTile, setSelectedTile,
    activeDimension, setActiveDimension,
    stateFilter, setStateFilter,
    extraSubstations,
    boundaries,
  } = useAppContext();

  // Infra layers default OFF — enables on-demand to keep initial load fast
  const [showHex,     setShowHex]     = useState(true);
  const [showBorders, setShowBorders] = useState(false);
  const [showLines,   setShowLines]   = useState(false);
  const [showSubs,    setShowSubs]    = useState(false);
  const [showZones,   setShowZones]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>('dark');
  const [drawMode, setDrawMode] = useState(false);

  // OSM-fetched infra (falls back to static on error)
  const [osmLines, setOsmLines] = useState<TransmissionLine[]>(NORTHERN_MY_LINES);
  const [osmSubs,  setOsmSubs]  = useState<SubstationFeature[]>(NORTHERN_MY_SUBSTATIONS);
  const [loadingLines, setLoadingLines] = useState(false);
  const [loadingSubs,  setLoadingSubs]  = useState(false);
  const linesFetchedRef = useRef(false);
  const subsFetchedRef  = useRef(false);

  // Fetch OSM lines the first time the lines layer is turned on
  useEffect(() => {
    if (!showLines || linesFetchedRef.current) return;
    linesFetchedRef.current = true;
    const ctrl = new AbortController();
    setLoadingLines(true);
    fetchNorthernMyLinesFromOSM(132_000, ctrl.signal)
      .then((lines) => { if (lines.length > 0) setOsmLines(lines); })
      .catch(() => {})
      .finally(() => setLoadingLines(false));
    return () => ctrl.abort();
  }, [showLines]);

  // Fetch OSM substations the first time the subs layer is turned on
  useEffect(() => {
    if (!showSubs || subsFetchedRef.current) return;
    subsFetchedRef.current = true;
    const ctrl = new AbortController();
    setLoadingSubs(true);
    fetchNorthernMySubsFromOSM(132, ctrl.signal)
      .then((subs) => { if (subs.length > 0) setOsmSubs(subs); })
      .catch(() => {})
      .finally(() => setLoadingSubs(false));
    return () => ctrl.abort();
  }, [showSubs]);

  const subs: SubstationFeature[] = useMemo(
    () => [...osmSubs, ...extraSubstations],
    [osmSubs, extraSubstations],
  );

  // Async tile generation: WorldCover → iPlan → OSM → PVGIS → 1 km grid
  const [tiles, setTiles] = useState<HexTile[]>([]);
  const [precomputeProgress, setPrecomputeProgress] = useState(0);
  const [precomputePhase, setPrecomputePhase] = useState('');
  const [totalCells, setTotalCells] = useState(0);

  useEffect(() => {
    if (!boundaries || boundaries.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        setTiles([]);
        setPrecomputeProgress(0);

        // Step 1: WorldCover (instant in DEV; one API call in prod)
        setPrecomputePhase('Loading land cover…');
        await ensureWorldcoverLoaded();
        if (cancelled) return;

        // Step 2: iPlan official land use — non-blocking.
        // 500 ms is enough for an IndexedDB cache hit to resolve synchronously.
        // If the remote server is unreachable the grid falls back to OSM/WorldCover;
        // a successful background load is cached in IndexedDB for the next session.
        setPrecomputePhase('Loading official land use data…');
        await Promise.race([
          ensureIplanLanduseLoaded().catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 500)),
        ]);
        if (cancelled) return;

        // Step 3: OSM landuse polygons (secondary — fills iPlan gaps, cached 7 days)
        setPrecomputePhase('Loading OSM land use data…');
        await ensureOsmLanduseLoaded();
        if (cancelled) return;

        // Step 4: Load any cached PVGIS data from DuckDB into memory (fast — empty is fine)
        setPrecomputePhase('Loading PVGIS cache…');
        await ensurePvgisGrid();
        if (cancelled) return;

        // Step 5: Generate all 1km tiles — O(1) distance lookups, so fast
        setPrecomputePhase('Building 1 km grid…');
        const result = await generateNorthernMyHexTiles(
          osmLines, subs, boundaries,
          (done, total) => {
            if (!cancelled) {
              setTotalCells(total);
              setPrecomputeProgress(Math.round((done / total) * 100));
            }
          },
        );
        if (cancelled) return;

        setTiles(result);
        setPrecomputeProgress(100);
        setPrecomputePhase('');

        // Step 6: Background PVGIS fetch — refines yield estimates without blocking the UI
        prefetchPvgisGrid().catch(console.error);
      } catch (err) {
        console.error('Tile precompute error:', err);
        setPrecomputePhase('');
      }
    })();
    return () => { cancelled = true; };
  }, [boundaries]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTileClick = useCallback((tile: HexTile) => {
    setSelectedTile(tile);
    setPinLocation(null);
  }, [setSelectedTile, setPinLocation]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (pinMode) {
      setPinLocation({ lat, lng, droppedAt: Date.now() });
      setSelectedTile(null);
    }
  }, [pinMode, setPinLocation, setSelectedTile]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left sidebar ───────────────────────────────────────────────────── */}
      <aside className="w-80 shrink-0 flex flex-col bg-surface border-r border-border overflow-hidden">
        <div className="h-12 px-4 border-b border-border flex items-center gap-3 shrink-0">
          <Zap size={14} className="text-amber-400" />
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">Screening Map</p>
            <p className="text-muted text-[10px]">Northern Peninsular Malaysia</p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="p-1.5 rounded-lg text-muted hover:text-white hover:bg-surface-2 transition-colors"
          >
            <Settings size={15} />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-border shrink-0 space-y-1.5">
          <button
            onClick={() => setPinMode(!pinMode)}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md w-full transition-colors ${
              pinMode ? 'bg-amber-500 text-white' : 'bg-surface-1 text-muted hover:text-white hover:bg-surface-2'
            }`}
          >
            <MapPin size={12} />
            {pinMode ? 'Click map to drop a pin — click again to cancel' : 'Drop pin for custom location analysis'}
          </button>
          <button
            onClick={() => { setDrawMode((v) => !v); setPinMode(false); }}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md w-full transition-colors ${
              drawMode ? 'bg-teal-500 text-white' : 'bg-surface-1 text-muted hover:text-white hover:bg-surface-2'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="3,21 12,3 21,21 3,21" />
            </svg>
            {drawMode ? 'Click to add vertices — click near first to close' : 'Draw site area & analyse'}
          </button>
        </div>

        <SolarWorkflowPanel lines={NORTHERN_MY_LINES} subs={subs} />
      </aside>

      {/* ── Map ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <MapContainer
          center={NORTHERN_MY_CENTER}
          zoom={INITIAL_ZOOM}
          style={{ height: '100%', width: '100%', background: '#0f172a' }}
          zoomControl={false}
        >
          {/* Base tiles */}
          {basemap === 'satellite' ? (
            <TileLayer
              key="esri-satellite"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
              maxZoom={19}
            />
          ) : (
            <TileLayer
              key="dark"
              url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              maxZoom={19}
            />
          )}

          {/* Labels pane at z-index 650 — above overlayPane (400) + markerPane (600), no pointer events */}
          <Pane name="labelsPane" style={{ zIndex: 650, pointerEvents: 'none' }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
              pane="labelsPane"
              attribution=""
            />
          </Pane>

          <PinDropHandler onDrop={handleMapClick} />

          {/* Hex scoring grid */}
          {showHex && (
            <HexGridLayer
              tiles={tiles}
              activeDimension={activeDimension}
              stateFilter={stateFilter}
              onTileClick={handleTileClick}
              selectedTileIndex={selectedTile?.h3Index}
              disableClicks={drawMode}
            />
          )}

          {/* Site area drawing tool */}
          <SiteAreaTool
            tiles={tiles}
            drawMode={drawMode}
            onDrawModeChange={setDrawMode}
          />

          {/* Transmission lines — OSM-fetched, falls back to static */}
          {showLines && osmLines.map((line) => (
            <GlowPolyline key={line.id} line={line} />
          ))}

          {/* Substation markers — OSM-fetched, falls back to static */}
          {showSubs && subs.map((sub) => (
            <SubstationMarker key={sub.id} sub={sub} />
          ))}

          {/* State boundary outlines */}
          {showBorders && <StateBoundaries />}

          {/* Industrial zones and technology parks */}
          {showZones && INDUSTRIAL_ZONES.map((zone) => (
            <IndustrialZoneMarker key={zone.id} zone={zone} />
          ))}

          {/* Manual pin */}
          {pinLocation && <Marker position={[pinLocation.lat, pinLocation.lng]} />}
        </MapContainer>

        <DimensionSelector active={activeDimension} onChange={setActiveDimension} />
        <StateFilter active={stateFilter} onChange={setStateFilter} />
        <TileScoreLegend activeDimension={activeDimension} />
        <LayerPanel
          showHex={showHex}         onToggleHex={() => setShowHex((v) => !v)}
          showBorders={showBorders} onToggleBorders={() => setShowBorders((v) => !v)}
          showLines={showLines}     onToggleLines={() => setShowLines((v) => !v)}
          showSubs={showSubs}       onToggleSubs={() => setShowSubs((v) => !v)}
          showZones={showZones}     onToggleZones={() => setShowZones((v) => !v)}
          basemap={basemap}         onBasemapChange={setBasemap}
        />

        {/* OSM fetch progress indicator */}
        {(loadingLines || loadingSubs) && (
          <div className="absolute top-14 right-14 z-[1000] flex items-center gap-2 bg-slate-900/95 border border-slate-700 rounded-lg px-3 py-2 shadow-lg">
            <Loader2 size={13} className="text-amber-400 animate-spin" />
            <span className="text-slate-300 text-xs">
              {loadingLines && loadingSubs
                ? 'Loading grid data…'
                : loadingLines
                  ? 'Loading transmission lines…'
                  : 'Loading substations…'}
            </span>
          </div>
        )}

        {/* Grid precompute progress bar */}
        {precomputePhase && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[2100] bg-slate-900/95 border border-slate-700 rounded-xl px-4 py-2.5 shadow-xl min-w-[280px]">
            <div className="flex items-center gap-2 mb-1.5">
              <Loader2 size={12} className="text-amber-400 animate-spin shrink-0" />
              <span className="text-slate-300 text-xs">{precomputePhase}</span>
              <span className="ml-auto text-slate-500 text-[10px]">{precomputeProgress}%</span>
            </div>
            <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${precomputeProgress}%` }}
              />
            </div>
            {totalCells > 0 && precomputeProgress >= 40 && (
              <p className="text-slate-500 text-[10px] mt-1 text-right">
                {Math.min(Math.round((precomputeProgress - 40) / 60 * totalCells), totalCells).toLocaleString()} / {totalCells.toLocaleString()} cells
              </p>
            )}
          </div>
        )}

        <button
          onClick={() => setShowSettings(true)}
          className="absolute top-3 right-3 z-[1000] w-9 h-9 rounded-lg bg-slate-900/95 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center shadow-lg transition-colors"
          title="Settings"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      <AssistantPanel />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
