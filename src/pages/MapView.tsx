import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Polyline,
  Popup,
  useMapEvents,
} from 'react-leaflet';
import type { LatLngBounds } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plus, X, Layers, MapPin } from 'lucide-react';
import { Header } from '../components/Header';
import { DC_DATABASE } from '../data/dcDatabase';
import { SUBSTATIONS, FIBRE_NODES, WATER_TREATMENT_PLANTS } from '../data/infraLayers';
import {
  TRANSMISSION_LINES,
  voltageColor,
  lineDashArray,
  statusLabel as lineStatusLabel,
} from '../data/transmissionLines';
import type { TransmissionLine } from '../data/transmissionLines';
import { DCPlantPanel } from '../components/DCPlantPanel';
import { DCIntelPanel } from '../components/DCIntelPanel';
import { LocationWorkflowPanel } from '../components/LocationWorkflowPanel';
import { useAppContext } from '../context/AppContext';
import {
  fetchTransmissionLinesFromOSM, clearOSMCache,
  fetchSubstationsFromOSM, clearOSMSubCache,
} from '../utils/overpass';
import { getOsmStoreFetchedAt } from '../utils/osmDb';
import type { SubstationFeature } from '../data/infraLayers';
import type { DataCentre } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────

const SEA_CENTER: [number, number] = [4.0, 109.0];
const INITIAL_ZOOM = 6;

const STATUS_COLOR: Record<DataCentre['status'], string> = {
  operational: '#EF4444',
  construction: '#F97316',
  announced:    '#EAB308',
  rumoured:     '#9CA3AF',
};

const STATUS_LABEL: Record<DataCentre['status'], string> = {
  operational: 'Operational',
  construction: 'Under Construction',
  announced:    'Announced',
  rumoured:     'Rumoured',
};

const COUNTRY_PILLS = [
  { code: 'ALL', label: 'All' },
  { code: 'MY',  label: 'MY' },
  { code: 'SG',  label: 'SG' },
  { code: 'ID',  label: 'ID' },
  { code: 'TH',  label: 'TH' },
  { code: 'PH',  label: 'PH' },
  { code: 'VN',  label: 'VN' },
];

function dcRadius(mw: number): number {
  return Math.max(5, Math.min(30, Math.sqrt(mw) * 1.9));
}

function fmtMW(mw: number): string {
  return mw >= 1000
    ? `${(mw / 1000).toFixed(1)} GW`
    : `${mw.toLocaleString()} MW`;
}

function fmtAge(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

// ── DivIcon factories ────────────────────────────────────────────────────────

function makeSubstationIcon(kv: number): L.DivIcon {
  const color = kv >= 500 ? '#EF4444'
              : kv >= 275 ? '#F59E0B'
              : kv >= 132 ? '#3B82F6'
              : '#6B7280';
  const size = kv >= 500 ? 22 : kv >= 275 ? 18 : kv >= 132 ? 16 : 13;
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;text-align:center;
      filter:drop-shadow(0 1px 3px rgba(0,0,0,0.9));user-select:none;color:${color}">⚡</div>`,
    className: '',
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor:[0, -10],
  });
}

const FIBRE_ICON = L.divIcon({
  html: `<div style="width:12px;height:12px;background:#10B981;
    transform:rotate(45deg);
    box-shadow:0 0 6px rgba(16,185,129,0.5),0 0 2px rgba(0,0,0,0.8);
    border:1px solid rgba(255,255,255,0.25)"></div>`,
  className: '',
  iconSize:   [12, 12],
  iconAnchor: [6, 6],
  popupAnchor:[0, -8],
});

const WTP_ICON = L.divIcon({
  html: `<div style="font-size:16px;line-height:1;text-align:center;
    filter:drop-shadow(0 1px 3px rgba(0,0,0,0.9));user-select:none">💧</div>`,
  className: '',
  iconSize:   [18, 18],
  iconAnchor: [9, 9],
  popupAnchor:[0, -12],
});

const PIN_ICON = L.divIcon({
  html: `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none">
    <div style="width:20px;height:20px;background:#6366F1;border:2px solid #fff;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(99,102,241,0.7)"></div>
  </div>`,
  className: '',
  iconSize: [20, 24],
  iconAnchor: [10, 22],
  popupAnchor: [0, -24],
});

function makeCandidateIcon(name: string): L.DivIcon {
  const short = name.length > 14 ? name.slice(0, 13) + '…' : name;
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none">
      <span style="font-size:22px;line-height:1;
        filter:drop-shadow(0 1px 4px rgba(0,0,0,0.9));color:#A78BFA">★</span>
      <span style="background:rgba(31,41,55,0.92);color:#A78BFA;font-size:9px;font-weight:500;
        padding:1px 5px;border-radius:4px;border:1px solid #4B5563;
        white-space:nowrap;letter-spacing:0.02em">${short}</span>
    </div>`,
    className: '',
    iconSize:   [90, 42],
    iconAnchor: [45, 10],
    popupAnchor:[0, -12],
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

interface LocalSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  landAreaHa: number;
  notes: string;
}

interface LayerGroup {
  visible: boolean;
  opacity: number;
}

interface LayerState {
  operational:     LayerGroup;
  pipeline:        LayerGroup;
  substations:     LayerGroup;
  fibre:           LayerGroup;
  candidates:      LayerGroup;
  transmission:    LayerGroup;
  waterTreatment:  LayerGroup;
}

type VoltageFilter = 'all' | '500+' | '275+' | '132+';

// ── MapEventHandler — tracks viewport bounds ─────────────────────────────────

function MapEventHandler({
  onBoundsChange,
}: {
  onBoundsChange: (b: LatLngBounds) => void;
}) {
  const map = useMapEvents({
    moveend() { onBoundsChange(map.getBounds()); },
    zoomend() { onBoundsChange(map.getBounds()); },
  });

  // Fire once on mount after tile load
  useEffect(() => {
    const id = window.setTimeout(() => onBoundsChange(map.getBounds()), 50);
    return () => window.clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ── DCPopup ──────────────────────────────────────────────────────────────────

function DCPopup({ dc, onOpenPlant }: { dc: DataCentre; onOpenPlant?: (dc: DataCentre) => void }) {
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            marginTop: 3,
            width: 9,
            height: 9,
            borderRadius: '50%',
            flexShrink: 0,
            backgroundColor: STATUS_COLOR[dc.status],
            display: 'inline-block',
          }}
        />
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#fff', lineHeight: 1.3 }}>
            {dc.name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF' }}>
            {dc.operator} · {dc.city}, {dc.country}
          </p>
        </div>
      </div>

      <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          {([
            ['Status',       <span style={{ color: STATUS_COLOR[dc.status] }}>{STATUS_LABEL[dc.status]}</span>],
            ['Capacity',     `${dc.capacityMW} MW`],
            ['IT Load',      `${dc.itLoadMW} MW`],
            ['PUE',          dc.pue.toFixed(2)],
            ['Tier',         `Tier ${dc.tierRating}`],
            ['COD',          dc.expectedCOD],
            dc.occupancyRate != null && ['Occupancy', `${Math.round((dc.occupancyRate ?? 0) * 100)}%`],
            dc.hyperscalerTenants.length > 0 && ['Tenants', dc.hyperscalerTenants.join(', ')],
          ] as Array<false | [string, React.ReactNode]>)
            .filter(Boolean)
            .map(([label, value]) => (
              <tr key={label as string}>
                <td style={{ color: '#6B7280', paddingRight: 12, paddingBottom: 3 }}>{label}</td>
                <td style={{ color: '#fff', fontWeight: 500 }}>{value}</td>
              </tr>
            ))}
        </tbody>
      </table>

      {dc.notes && (
        <p style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid #1F2937',
          fontSize: 10,
          color: '#6B7280',
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {dc.notes}
        </p>
      )}

      {dc.plantLayout && onOpenPlant && (
        <button
          onClick={() => onOpenPlant(dc)}
          style={{
            marginTop: 10,
            width: '100%',
            background: '#6366F1',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          View Plant Layout →
        </button>
      )}
    </div>
  );
}

// ── LayerRow ─────────────────────────────────────────────────────────────────

interface LayerRowProps {
  label:     string;
  count:     number;
  dotColor?: string;
  group:     LayerGroup;
  icon?:     React.ReactNode;
  onChange:  (u: Partial<LayerGroup>) => void;
}

function LayerRow({ label, count, dotColor, group, icon, onChange }: LayerRowProps) {
  const toggle = () => onChange({ visible: !group.visible });
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {/* Icon / dot */}
        <div className={`shrink-0 transition-opacity ${group.visible ? 'opacity-100' : 'opacity-30'}`}>
          {icon ?? (
            <span
              className="w-2.5 h-2.5 rounded-full block"
              style={{ backgroundColor: dotColor ?? '#fff' }}
            />
          )}
        </div>

        {/* Label — clicking also toggles */}
        <span
          className={`text-xs flex-1 cursor-pointer select-none transition-colors ${
            group.visible ? 'text-white' : 'text-muted'
          }`}
          onClick={toggle}
        >
          {label}
        </span>

        {/* Count */}
        <span className="text-muted/60 text-[10px] font-mono shrink-0">{count}</span>

        {/* Toggle switch */}
        <button
          onClick={toggle}
          aria-label={group.visible ? 'Hide layer' : 'Show layer'}
          className={`relative w-9 h-5 rounded-full shrink-0 transition-colors focus:outline-none ${
            group.visible ? 'bg-accent' : 'bg-surface-2 border border-border'
          }`}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-150"
            style={{ left: group.visible ? 18 : 2 }}
          />
        </button>
      </div>

      {group.visible && (
        <div className="flex items-center gap-2 pl-5">
          <span className="text-muted/50 text-[10px] shrink-0 w-12">Opacity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={group.opacity}
            onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
            className="flex-1 accent-accent h-1"
          />
          <span className="text-muted text-[10px] font-mono w-7 text-right">
            {Math.round(group.opacity * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ── PinDropHandler — intercepts map clicks when pinMode is active ─────────────

function PinDropHandler() {
  const { pinMode, setPinMode, setPinLocation } = useAppContext();
  useMapEvents({
    click(e) {
      if (!pinMode) return;
      setPinLocation({ lat: e.latlng.lat, lng: e.latlng.lng, droppedAt: Date.now() });
      setPinMode(false);
    },
  });
  return null;
}

// ── AddSiteModal ─────────────────────────────────────────────────────────────

function AddSiteModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (s: LocalSite) => void;
}) {
  const [form, setForm] = useState({
    name: '', lat: '', lng: '', landAreaHa: '', notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function patch(key: keyof typeof form, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => ({ ...p, [key]: '' }));
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Required';
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    if (isNaN(lat) || lat < -11 || lat > 25) e.lat = 'Latitude must be in SEA range (−11 to 25)';
    if (isNaN(lng) || lng < 95  || lng > 141) e.lng = 'Longitude must be in SEA range (95 to 141)';
    const ha = parseFloat(form.landAreaHa);
    if (isNaN(ha) || ha <= 0) e.landAreaHa = 'Must be a positive number';
    return e;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onAdd({
      id: `SITE-${Date.now()}`,
      name: form.name.trim(),
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      landAreaHa: parseFloat(form.landAreaHa),
      notes: form.notes.trim(),
    });
    onClose();
  }

  const inputCls =
    'w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-white text-sm ' +
    'focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-muted/40 transition-shadow';

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-semibold text-base">Add Candidate Site</h2>
            <p className="text-muted text-xs mt-0.5">Appears as a ★ marker on the map</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-white hover:bg-surface-2 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">Site Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => patch('name', e.target.value)}
              placeholder="e.g. Johor Tech Park Plot B"
              className={inputCls}
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Latitude *</label>
              <input
                type="number"
                value={form.lat}
                onChange={(e) => patch('lat', e.target.value)}
                placeholder="e.g. 1.432"
                step="0.0001"
                className={inputCls}
              />
              {errors.lat && <p className="text-red-400 text-xs mt-1">{errors.lat}</p>}
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Longitude *</label>
              <input
                type="number"
                value={form.lng}
                onChange={(e) => patch('lng', e.target.value)}
                placeholder="e.g. 103.629"
                step="0.0001"
                className={inputCls}
              />
              {errors.lng && <p className="text-red-400 text-xs mt-1">{errors.lng}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">Land Area (ha) *</label>
            <input
              type="number"
              value={form.landAreaHa}
              onChange={(e) => patch('landAreaHa', e.target.value)}
              placeholder="e.g. 15.5"
              step="0.1"
              min="0"
              className={inputCls}
            />
            {errors.landAreaHa && (
              <p className="text-red-400 text-xs mt-1">{errors.landAreaHa}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => patch('notes', e.target.value)}
              placeholder="Zoning status, grid availability, key observations…"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

          <button
            type="submit"
            className="w-full mt-1 bg-accent hover:bg-accent-hover text-white rounded-lg py-2.5 text-sm font-semibold transition-colors"
          >
            Add to Map
          </button>
        </form>
      </div>
    </div>
  );
}

// ── MapView (main) ───────────────────────────────────────────────────────────

export function MapView() {
  const [layers, setLayers] = useState<LayerState>({
    operational:    { visible: true,  opacity: 0.85 },
    pipeline:       { visible: true,  opacity: 0.80 },
    substations:    { visible: true,  opacity: 0.85 },
    fibre:          { visible: true,  opacity: 0.85 },
    candidates:     { visible: true,  opacity: 1.00 },
    transmission:   { visible: true,  opacity: 0.75 },
    waterTreatment: { visible: false, opacity: 0.85 },
  });

  const [countryFilter, setCountryFilter] = useState('ALL');
  const [voltageFilter, setVoltageFilter] = useState<VoltageFilter>('all');
  const [bounds, setBounds]               = useState<LatLngBounds | null>(null);
  const [sites, setSites]                 = useState<LocalSite[]>([]);
  const [showModal, setShowModal]         = useState(false);
  const [plantDC, setPlantDC]             = useState<DataCentre | null>(null);
  const [hoveredDC, setHoveredDC]         = useState<DataCentre | null>(null);
  const [tab, setTab]                     = useState<'layers' | 'workflows'>('layers');
  const hoverCloseTimer                    = useRef<number | null>(null);

  const [osmLines,  setOsmLines]  = useState<TransmissionLine[] | null>(null);
  const [osmStatus, setOsmStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [osmFetchId, setOsmFetchId] = useState(0);
  const [osmProgress, setOsmProgress] = useState<{ done: number; total: number } | null>(null);
  const [osmLastFetched, setOsmLastFetched] = useState<number | null>(null);

  const [osmSubs,      setOsmSubs]      = useState<SubstationFeature[] | null>(null);
  const [osmSubStatus, setOsmSubStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [subFetchId, setSubFetchId]     = useState(0);
  const [subProgress, setSubProgress]  = useState<{ done: number; total: number } | null>(null);
  const [subLastFetched, setSubLastFetched] = useState<number | null>(null);
  const [subVoltageFilter, setSubVoltageFilter] = useState<VoltageFilter>('all');

  function refreshOSM() {
    clearOSMCache().then(() => {
      setOsmLines(null);
      setOsmLastFetched(null);
      setOsmFetchId((n) => n + 1);
    });
  }

  function refreshOSMSub() {
    clearOSMSubCache().then(() => {
      setOsmSubs(null);
      setSubLastFetched(null);
      setSubFetchId((n) => n + 1);
    });
  }

  const { pinLocation, pinMode, extraSubstations } = useAppContext();

  const allSubstations = useMemo(() => {
    // Only show OSM data — editorial coords are inaccurate; show nothing while loading/error
    const base = osmSubStatus === 'ok' && osmSubs ? osmSubs : [];
    const merged = [...base, ...extraSubstations];
    if (subVoltageFilter === '500+') return merged.filter((s) => s.properties.voltageKV >= 500);
    if (subVoltageFilter === '275+') return merged.filter((s) => s.properties.voltageKV >= 275);
    if (subVoltageFilter === '132+') return merged.filter((s) => s.properties.voltageKV >= 132);
    return merged;
  }, [osmSubStatus, osmSubs, extraSubstations, subVoltageFilter]);

  // Fetch OSM transmission lines when the layer is visible.
  // osmStatus is intentionally NOT in deps — putting it there causes React to run the
  // cleanup (ctrl.abort) when status transitions idle→loading, killing the in-flight fetch.
  // osmFetchId bumps on refresh to re-trigger without that race.
  useEffect(() => {
    if (!layers.transmission.visible) return;
    const ctrl = new AbortController();
    setOsmStatus('loading');
    setOsmProgress(null);
    fetchTransmissionLinesFromOSM(
      110_000,
      ctrl.signal,
      (done, total) => setOsmProgress({ done, total }),
    )
      .then((lines) => {
        setOsmLines(lines);
        setOsmStatus('ok');
        setOsmProgress(null);
        getOsmStoreFetchedAt('lines').then((t) => setOsmLastFetched(t));
      })
      .catch(() => { setOsmStatus('error'); setOsmProgress(null); });
    return () => ctrl.abort();
  }, [layers.transmission.visible, osmFetchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same pattern for substations.
  useEffect(() => {
    if (!layers.substations.visible) return;
    const ctrl = new AbortController();
    setOsmSubStatus('loading');
    setSubProgress(null);
    fetchSubstationsFromOSM(
      33,
      ctrl.signal,
      (done, total) => setSubProgress({ done, total }),
    )
      .then((subs) => {
        setOsmSubs(subs);
        setOsmSubStatus('ok');
        setSubProgress(null);
        getOsmStoreFetchedAt('substations').then((t) => setSubLastFetched(t));
      })
      .catch(() => { setOsmSubStatus('error'); setSubProgress(null); });
    return () => ctrl.abort();
  }, [layers.substations.visible, subFetchId]); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleHoverClose() {
    if (hoverCloseTimer.current) window.clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = window.setTimeout(() => setHoveredDC(null), 250);
  }
  function cancelHoverClose() {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }
  function showHover(dc: DataCentre) {
    if (!dc.intel) return;
    cancelHoverClose();
    setHoveredDC(dc);
  }

  const filteredLines = useMemo(() => {
    // Show OSM data only — editorial lines don't follow actual right-of-way
    const src: TransmissionLine[] = osmStatus === 'ok' && osmLines ? osmLines : [];
    if (voltageFilter === 'all')  return src;
    if (voltageFilter === '500+') return src.filter((l) => l.voltage_kV >= 500);
    if (voltageFilter === '275+') return src.filter((l) => l.voltage_kV >= 275);
    return src.filter((l) => l.voltage_kV >= 132);
  }, [voltageFilter, osmStatus, osmLines]);

  function patchLayer(key: keyof LayerState, update: Partial<LayerGroup>) {
    setLayers((prev) => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }

  // Filtered data
  const filteredDCs = useMemo(
    () =>
      countryFilter === 'ALL'
        ? DC_DATABASE
        : DC_DATABASE.filter((d) => d.country === countryFilter),
    [countryFilter],
  );

  const operationalDCs = useMemo(
    () => filteredDCs.filter((d) => d.status === 'operational'),
    [filteredDCs],
  );
  const pipelineDCs = useMemo(
    () => filteredDCs.filter((d) => d.status !== 'operational'),
    [filteredDCs],
  );

  // Stats — count only what's inside the current viewport
  const stats = useMemo(() => {
    const inView = bounds
      ? filteredDCs.filter((dc) =>
          bounds.contains([dc.coordinates.lat, dc.coordinates.lng]),
        )
      : filteredDCs;
    return {
      dcCount:  inView.length,
      mwInView: inView.reduce((sum, dc) => sum + dc.itLoadMW, 0),
    };
  }, [bounds, filteredDCs]);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Site Map"
        subtitle={`${DC_DATABASE.length} facilities · Southeast Asia`}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel ───────────────────────────────────────────── */}
        <aside className="w-[280px] shrink-0 bg-bg border-r border-border flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border shrink-0">
            <button
              onClick={() => setTab('layers')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                tab === 'layers' ? 'text-white border-b-2 border-accent' : 'text-muted hover:text-white'
              }`}
            >
              <Layers size={12} /> Layers
            </button>
            <button
              onClick={() => setTab('workflows')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                tab === 'workflows' ? 'text-white border-b-2 border-accent' : 'text-muted hover:text-white'
              }`}
            >
              <MapPin size={12} /> Workflows
            </button>
          </div>

          {/* Layer controls */}
          {tab === 'layers' && <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

            {/* Existing DCs — operational */}
            <LayerRow
              label="Operational DCs"
              count={operationalDCs.length}
              dotColor="#EF4444"
              group={layers.operational}
              onChange={(u) => patchLayer('operational', u)}
            />

            {/* Pipeline DCs */}
            <LayerRow
              label="Pipeline DCs"
              count={pipelineDCs.length}
              group={layers.pipeline}
              onChange={(u) => patchLayer('pipeline', u)}
              icon={
                <div
                  className={`flex gap-1 shrink-0 transition-opacity ${
                    layers.pipeline.visible ? 'opacity-100' : 'opacity-20'
                  }`}
                >
                  {(['#F97316', '#EAB308', '#9CA3AF'] as const).map((c) => (
                    <span
                      key={c}
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              }
            />

            <div className="h-px bg-border" />

            {/* Substations */}
            <LayerRow
              label="Substations (33–500 kV)"
              count={allSubstations.length}
              group={layers.substations}
              onChange={(u) => patchLayer('substations', u)}
              icon={
                <span
                  className={`text-base shrink-0 transition-opacity ${
                    layers.substations.visible ? 'opacity-100' : 'opacity-20'
                  }`}
                >
                  ⚡
                </span>
              }
            />

            {layers.substations.visible && (
              <div className="pl-5 space-y-2">
                <div className="flex items-center gap-1 flex-wrap">
                  {(['all', '500+', '275+', '132+'] as VoltageFilter[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setSubVoltageFilter(v)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        subVoltageFilter === v
                          ? 'bg-accent text-white'
                          : 'bg-surface-2 text-muted hover:text-white'
                      }`}
                    >
                      {v === 'all' ? 'All kV' : `${v} kV`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted/70">
                  <span className="flex items-center gap-1"><span style={{ color: '#EF4444' }}>⚡</span>500 kV</span>
                  <span className="flex items-center gap-1"><span style={{ color: '#F59E0B' }}>⚡</span>275 kV</span>
                  <span className="flex items-center gap-1"><span style={{ color: '#3B82F6' }}>⚡</span>132 kV</span>
                  <span className="flex items-center gap-1"><span style={{ color: '#6B7280' }}>⚡</span>33 kV</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    osmSubStatus === 'ok'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                      : osmSubStatus === 'loading'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                      : osmSubStatus === 'error'
                      ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                      : 'bg-surface-2 text-muted border border-border'
                  }`}>
                    {osmSubStatus === 'ok'
                      ? `OSM · ${allSubstations.length} substations${subLastFetched ? ` · ${fmtAge(subLastFetched)}` : ''}`
                      : osmSubStatus === 'loading'
                      ? subProgress
                        ? `Fetching OSM… ${subProgress.done}/${subProgress.total}`
                        : 'Fetching OSM…'
                      : osmSubStatus === 'error'
                      ? 'OSM error · click ↺ to retry'
                      : 'Pending'}
                  </span>
                  <button
                    onClick={refreshOSMSub}
                    disabled={osmSubStatus === 'loading'}
                    className="px-1.5 py-0.5 rounded text-muted hover:text-white border border-border hover:border-border/60 transition-colors disabled:opacity-40"
                    title="Clear cache and re-fetch from OSM"
                  >
                    ↺ Refresh
                  </button>
                </div>
              </div>
            )}

            {/* Fibre nodes */}
            <LayerRow
              label="Fibre / Cable Nodes"
              count={FIBRE_NODES.length}
              group={layers.fibre}
              onChange={(u) => patchLayer('fibre', u)}
              icon={
                <span
                  className={`inline-block w-3 h-3 shrink-0 transition-opacity ${
                    layers.fibre.visible ? 'opacity-100' : 'opacity-20'
                  }`}
                  style={{
                    background:  '#10B981',
                    transform:   'rotate(45deg)',
                    borderRadius: '2px',
                  }}
                />
              }
            />

            {/* Candidate sites */}
            <LayerRow
              label="Candidate Sites"
              count={sites.length}
              group={layers.candidates}
              onChange={(u) => patchLayer('candidates', u)}
              icon={
                <span
                  className={`text-base shrink-0 leading-none transition-opacity ${
                    layers.candidates.visible ? 'opacity-100' : 'opacity-20'
                  }`}
                  style={{ color: '#A78BFA' }}
                >
                  ★
                </span>
              }
            />

            <div className="h-px bg-border" />

            {/* Transmission lines */}
            <LayerRow
              label="Transmission Lines"
              count={filteredLines.length}
              group={layers.transmission}
              onChange={(u) => patchLayer('transmission', u)}
              icon={
                <div
                  className={`flex flex-col gap-0.5 shrink-0 transition-opacity ${
                    layers.transmission.visible ? 'opacity-100' : 'opacity-20'
                  }`}
                >
                  <span className="block w-3 h-0.5" style={{ backgroundColor: '#EF4444' }} />
                  <span className="block w-3 h-0.5" style={{ backgroundColor: '#F59E0B' }} />
                  <span className="block w-3 h-0.5" style={{ backgroundColor: '#3B82F6' }} />
                </div>
              }
            />

            {layers.transmission.visible && (
              <div className="pl-5 space-y-2">
                <div className="flex items-center gap-1 flex-wrap">
                  {(['all', '500+', '275+', '132+'] as VoltageFilter[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVoltageFilter(v)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        voltageFilter === v
                          ? 'bg-accent text-white'
                          : 'bg-surface-2 text-muted hover:text-white'
                      }`}
                    >
                      {v === 'all' ? 'All kV' : `${v} kV`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted/70">
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-red-500"/>500 kV</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-amber-500"/>275 kV</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-500"/>132 kV</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    osmStatus === 'ok'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                      : osmStatus === 'loading'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                      : osmStatus === 'error'
                      ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                      : 'bg-surface-2 text-muted border border-border'
                  }`}>
                    {osmStatus === 'ok'
                      ? `OSM · ${filteredLines.length} lines${osmLastFetched ? ` · ${fmtAge(osmLastFetched)}` : ''}`
                      : osmStatus === 'loading'
                      ? osmProgress
                        ? `Fetching OSM… ${osmProgress.done}/${osmProgress.total}`
                        : 'Fetching OSM…'
                      : osmStatus === 'error'
                      ? 'OSM error · click ↺ to retry'
                      : 'Pending'}
                  </span>
                  <button
                    onClick={refreshOSM}
                    disabled={osmStatus === 'loading'}
                    className="px-1.5 py-0.5 rounded text-muted hover:text-white border border-border hover:border-border/60 transition-colors disabled:opacity-40"
                    title="Clear cache and re-fetch from OSM"
                  >
                    ↺ Refresh
                  </button>
                </div>
                <p className="text-muted/40 text-[9px]">solid = existing · dashed = planned</p>
              </div>
            )}

            {/* Water treatment plants */}
            <LayerRow
              label="Water Treatment Plants"
              count={WATER_TREATMENT_PLANTS.length}
              group={layers.waterTreatment}
              onChange={(u) => patchLayer('waterTreatment', u)}
              icon={
                <span
                  className={`text-base shrink-0 leading-none transition-opacity ${
                    layers.waterTreatment.visible ? 'opacity-100' : 'opacity-20'
                  }`}
                >
                  💧
                </span>
              }
            />

            {/* Status legend */}
            <div className="border-t border-border pt-4">
              <p className="text-muted/70 text-xs font-semibold uppercase tracking-wider mb-3">
                Status Legend
              </p>
              <div className="space-y-2">
                {(Object.entries(STATUS_COLOR) as [DataCentre['status'], string][]).map(
                  ([status, color]) => (
                    <div key={status} className="flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-muted text-xs">{STATUS_LABEL[status]}</span>
                    </div>
                  ),
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-muted/50 text-xs">● size</span>
                  <span className="text-muted/40 text-xs">∝ capacity (MW)</span>
                </div>
              </div>
            </div>
          </div>}

          {/* Workflow controls — pin-drop location analysis */}
          {tab === 'workflows' && (
            <LocationWorkflowPanel
              linesToRender={filteredLines}
              osmSubs={osmSubStatus === 'ok' && osmSubs ? osmSubs : undefined}
            />
          )}

          {/* Add Site */}
          <div className="px-4 py-3 border-t border-border shrink-0">
            <button
              onClick={() => setShowModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 hover:border-accent/60 text-accent rounded-lg py-2.5 text-sm font-medium transition-all"
            >
              <Plus size={14} />
              Add Candidate Site
            </button>
          </div>
        </aside>

        {/* ── Map area ─────────────────────────────────────────────── */}
        <div className={`flex-1 relative overflow-hidden${pinMode ? ' [&_.leaflet-container]:!cursor-crosshair' : ''}`}>

          {/* Stats bar */}
          <div className="absolute top-3 right-3 z-[999] flex items-center gap-1.5 bg-bg/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
            <span className="text-white text-xs font-semibold font-mono">
              {stats.dcCount}
            </span>
            <span className="text-muted text-xs">DCs</span>
            <span className="text-border text-xs mx-0.5">|</span>
            <span className="text-white text-xs font-semibold font-mono">
              {fmtMW(stats.mwInView)}
            </span>
            <span className="text-muted text-xs">in view</span>
            <span className="text-border text-xs mx-0.5">|</span>
            <span className="text-white text-xs font-semibold font-mono">{sites.length}</span>
            <span className="text-muted text-xs">
              {sites.length === 1 ? 'candidate' : 'candidates'}
            </span>
          </div>

          {/* Country filter pills */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-1 bg-bg/90 backdrop-blur-sm border border-border rounded-full px-2 py-1.5">
            {COUNTRY_PILLS.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setCountryFilter(code)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  countryFilter === code
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-muted hover:text-white hover:bg-surface-2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Leaflet Map */}
          <MapContainer
            center={SEA_CENTER}
            zoom={INITIAL_ZOOM}
            className="h-full w-full"
            zoomControl
          >
            {/* OpenStreetMap Standard */}
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />

            <MapEventHandler onBoundsChange={setBounds} />
            <PinDropHandler />

            {/* ── Transmission lines (rendered first so DCs sit on top) ── */}
            {layers.transmission.visible &&
              filteredLines.map((line) => (
                <Polyline
                  key={line.id}
                  positions={line.coords}
                  pathOptions={{
                    color: voltageColor(line.voltage_kV),
                    weight: line.voltage_kV >= 500 ? 3 : line.voltage_kV >= 275 ? 2.2 : 1.6,
                    opacity: layers.transmission.opacity,
                    dashArray: lineDashArray(line.status),
                    lineCap: 'round',
                  }}
                >
                  <Popup maxWidth={300}>
                    <div style={{ minWidth: 220 }}>
                      <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13, color: '#fff' }}>
                        {line.name}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9CA3AF' }}>
                        {line.operator}
                      </p>
                      <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
                        <tbody>
                          <tr>
                            <td style={{ color: '#6B7280', paddingRight: 12, paddingBottom: 3 }}>Voltage</td>
                            <td style={{ color: voltageColor(line.voltage_kV), fontWeight: 600 }}>
                              {line.voltage_kV} kV
                            </td>
                          </tr>
                          <tr>
                            <td style={{ color: '#6B7280', paddingRight: 12, paddingBottom: 3 }}>Status</td>
                            <td style={{ color: '#fff', fontWeight: 500 }}>{lineStatusLabel(line.status)}</td>
                          </tr>
                          {line.capacity_MW != null && (
                            <tr>
                              <td style={{ color: '#6B7280', paddingRight: 12, paddingBottom: 3 }}>Capacity</td>
                              <td style={{ color: '#fff', fontWeight: 500 }}>{line.capacity_MW.toLocaleString()} MW</td>
                            </tr>
                          )}
                          {line.commissionYear != null && (
                            <tr>
                              <td style={{ color: '#6B7280', paddingRight: 12, paddingBottom: 3 }}>Commissioned</td>
                              <td style={{ color: '#fff', fontWeight: 500 }}>{line.commissionYear}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                      {line.notes && (
                        <p style={{
                          marginTop: 8, paddingTop: 8, borderTop: '1px solid #1F2937',
                          fontSize: 10, color: '#9CA3AF', lineHeight: 1.5,
                        }}>
                          {line.notes}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Polyline>
              ))}

            {/* ── Operational DCs (solid circles) ─────────────────── */}
            {layers.operational.visible &&
              operationalDCs.map((dc) => (
                <CircleMarker
                  key={dc.id}
                  center={[dc.coordinates.lat, dc.coordinates.lng]}
                  radius={dcRadius(dc.capacityMW)}
                  pathOptions={{
                    color:       STATUS_COLOR[dc.status],
                    fillColor:   STATUS_COLOR[dc.status],
                    fillOpacity: layers.operational.opacity * 0.55,
                    opacity:     layers.operational.opacity,
                    weight:      2,
                  }}
                >
                  <Popup maxWidth={280}>
                    <DCPopup dc={dc} onOpenPlant={setPlantDC} />
                  </Popup>
                </CircleMarker>
              ))}

            {/* ── Pipeline DCs (dashed circles) ───────────────────── */}
            {layers.pipeline.visible &&
              pipelineDCs.map((dc) => (
                <CircleMarker
                  key={dc.id}
                  center={[dc.coordinates.lat, dc.coordinates.lng]}
                  radius={dcRadius(dc.capacityMW)}
                  pathOptions={{
                    color:       STATUS_COLOR[dc.status],
                    fillColor:   STATUS_COLOR[dc.status],
                    fillOpacity: layers.pipeline.opacity * 0.35,
                    opacity:     layers.pipeline.opacity,
                    weight:      2,
                    dashArray:   '5 4',
                  }}
                >
                  <Popup maxWidth={280}>
                    <DCPopup dc={dc} onOpenPlant={setPlantDC} />
                  </Popup>
                </CircleMarker>
              ))}

            {/* Hover halos — drive the intel side panel for any DC with intel */}
            {filteredDCs.filter((dc) => dc.intel).map((dc) => (
              <CircleMarker
                key={`${dc.id}-hover`}
                center={[dc.coordinates.lat, dc.coordinates.lng]}
                radius={dcRadius(dc.capacityMW) + 6}
                pathOptions={{
                  color: 'transparent',
                  fillColor: 'transparent',
                  fillOpacity: 0,
                  opacity: 0,
                  weight: 0,
                }}
                eventHandlers={{
                  mouseover: () => showHover(dc),
                  mouseout: scheduleHoverClose,
                }}
              />
            ))}

            {/* ── Substations ─────────────────────────────────────── */}
            {layers.substations.visible &&
              allSubstations.map((s) => (
                <Marker
                  key={s.id}
                  position={[s.lat, s.lng]}
                  icon={makeSubstationIcon(s.properties.voltageKV)}
                  opacity={layers.substations.opacity}
                >
                  <Popup maxWidth={280}>
                    <div style={{ minWidth: 210 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#fff', flex: 1 }}>
                          ⚡ {s.properties.name}
                        </p>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                          background: s.properties.voltageKV >= 500 ? 'rgba(239,68,68,0.15)' :
                                      s.properties.voltageKV >= 275 ? 'rgba(245,158,11,0.15)' :
                                      s.properties.voltageKV >= 132 ? 'rgba(59,130,246,0.15)' :
                                      'rgba(107,114,128,0.15)',
                          color: s.properties.voltageKV >= 500 ? '#EF4444' :
                                 s.properties.voltageKV >= 275 ? '#F59E0B' :
                                 s.properties.voltageKV >= 132 ? '#3B82F6' : '#9CA3AF',
                          border: `1px solid ${s.properties.voltageKV >= 500 ? 'rgba(239,68,68,0.3)' :
                                               s.properties.voltageKV >= 275 ? 'rgba(245,158,11,0.3)' :
                                               s.properties.voltageKV >= 132 ? 'rgba(59,130,246,0.3)' :
                                               'rgba(107,114,128,0.3)'}`,
                        }}>
                          {s.properties.voltageKV} kV
                        </span>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9CA3AF' }}>
                        {s.properties.operator}
                      </p>
                      <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
                        <tbody>
                          {([
                            ['Capacity',       s.properties.capacityMVA > 0 ? `${s.properties.capacityMVA} MVA` : '—'],
                            ['Headroom',       s.properties.availableHeadroomMVA > 0 ? `${s.properties.availableHeadroomMVA} MVA` : '—'],
                            ['Dedicated feed', s.properties.dedicatedFeedAvailable ? '✓ Available' : '✗ Shared only'],
                          ] as [string, string][]).map(([k, v]) => (
                            <tr key={k}>
                              <td style={{ color: '#6B7280', paddingRight: 12, paddingBottom: 3 }}>{k}</td>
                              <td style={{
                                color: k === 'Headroom' && s.properties.availableHeadroomMVA > 0 ? '#34D399'
                                     : k === 'Dedicated feed' ? (s.properties.dedicatedFeedAvailable ? '#34D399' : '#F87171')
                                     : '#fff',
                                fontWeight: 500,
                              }}>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {s.properties.notes && (
                        <p style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1F2937', fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
                          {s.properties.notes}
                        </p>
                      )}
                      <p style={{ marginTop: 6, fontSize: 9, color: '#374151' }}>
                        {s.id.startsWith('osm-') ? 'Source: OpenStreetMap' : 'Source: editorial'}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}

            {/* ── Fibre / cable nodes ──────────────────────────────── */}
            {layers.fibre.visible &&
              FIBRE_NODES.map((n) => (
                <Marker
                  key={n.id}
                  position={[n.lat, n.lng]}
                  icon={FIBRE_ICON}
                  opacity={layers.fibre.opacity}
                >
                  <Popup maxWidth={300}>
                    <div style={{ minWidth: 230 }}>
                      <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13, color: '#fff' }}>
                        {n.properties.name}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9CA3AF' }}>
                        {n.properties.operator}
                      </p>
                      {n.properties.designCapacityTbps != null && (
                        <p style={{ margin: '0 0 8px', fontSize: 11, color: '#D1D5DB' }}>
                          Design capacity:{' '}
                          <span style={{ color: '#3B82F6', fontWeight: 600 }}>
                            {n.properties.designCapacityTbps} Tbps
                          </span>
                        </p>
                      )}
                      <p style={{ margin: '0 0 6px', fontSize: 10, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Cable Systems
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {n.properties.cables.map((c) => (
                          <span
                            key={c}
                            style={{
                              fontSize: 10,
                              background: '#1F2937',
                              border: '1px solid #374151',
                              borderRadius: 4,
                              padding: '2px 6px',
                              color: '#D1D5DB',
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

            {/* ── Water treatment plants ──────────────────────────── */}
            {layers.waterTreatment.visible &&
              WATER_TREATMENT_PLANTS.map((w) => (
                <Marker
                  key={w.id}
                  position={[w.lat, w.lng]}
                  icon={WTP_ICON}
                  opacity={layers.waterTreatment.opacity}
                >
                  <Popup maxWidth={280}>
                    <div style={{ minWidth: 210 }}>
                      <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13, color: '#38BDF8' }}>
                        💧 {w.properties.name}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: 11, color: '#9CA3AF' }}>
                        {w.properties.operator}
                      </p>
                      <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
                        <tbody>
                          {([
                            ['Type',        w.properties.type.replace(/_/g, ' ')],
                            ...(w.properties.capacityMlpd != null
                              ? [['Capacity', `${w.properties.capacityMlpd.toLocaleString()} MLD`] as [string, string]]
                              : []),
                            ['Service area', w.properties.serviceArea],
                          ] as [string, string][]).map(([k, v]) => (
                            <tr key={k}>
                              <td style={{ color: '#6B7280', paddingRight: 12, paddingBottom: 3, verticalAlign: 'top' }}>{k}</td>
                              <td style={{ color: '#fff', fontWeight: 500 }}>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {w.properties.notes && (
                        <p style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1F2937', fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
                          {w.properties.notes}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}

            {/* ── Dropped pin marker ──────────────────────────────── */}
            {pinLocation && (
              <Marker
                position={[pinLocation.lat, pinLocation.lng]}
                icon={PIN_ICON}
                zIndexOffset={1000}
              >
                <Popup maxWidth={200}>
                  <div style={{ minWidth: 160 }}>
                    <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 12, color: '#6366F1' }}>
                      <MapPin size={11} style={{ display: 'inline', marginRight: 4 }} />
                      Candidate pin
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>
                      {pinLocation.lat.toFixed(5)}, {pinLocation.lng.toFixed(5)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* ── Candidate sites ──────────────────────────────────── */}
            {layers.candidates.visible &&
              sites.map((site) => (
                <Marker
                  key={site.id}
                  position={[site.lat, site.lng]}
                  icon={makeCandidateIcon(site.name)}
                  opacity={layers.candidates.opacity}
                >
                  <Popup maxWidth={240}>
                    <div style={{ minWidth: 180 }}>
                      <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 13, color: '#A78BFA' }}>
                        ★ {site.name}
                      </p>
                      <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
                        <tbody>
                          {([
                            ['Latitude',   site.lat.toFixed(5)],
                            ['Longitude',  site.lng.toFixed(5)],
                            ['Land area',  `${site.landAreaHa} ha`],
                          ] as [string, string][]).map(([k, v]) => (
                            <tr key={k}>
                              <td style={{ color: '#6B7280', paddingRight: 12, paddingBottom: 3 }}>{k}</td>
                              <td style={{ color: '#fff', fontFamily: 'monospace' }}>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {site.notes && (
                        <p style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1F2937', fontSize: 10, color: '#9CA3AF', lineHeight: 1.5 }}>
                          {site.notes}
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        </div>
      </div>

      {/* ── Add Site Modal ───────────────────────────────────────────── */}
      {showModal && (
        <AddSiteModal
          onClose={() => setShowModal(false)}
          onAdd={(s) => setSites((prev) => [...prev, s])}
        />
      )}

      {/* ── DC Plant View ────────────────────────────────────────────── */}
      {plantDC && <DCPlantPanel dc={plantDC} onClose={() => setPlantDC(null)} />}

      {/* ── DC Intelligence (hover-triggered) ────────────────────────── */}
      {hoveredDC && hoveredDC.intel && (
        <DCIntelPanel
          dc={hoveredDC}
          onClose={() => setHoveredDC(null)}
          rightOffsetPx={plantDC ? 480 : 0}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
      )}
    </div>
  );
}
