import { useState, useMemo, useEffect } from 'react';
import { Sun, Zap, Leaf, Package, CloudRain, Truck, TreePine, BarChart2, MapPin, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { reverseGeocode } from '../utils/spatialContext';
import type { GeocodedLocation } from '../utils/spatialContext';
import { getSolarContext } from '../utils/solarContext';
import { WorkflowAnalysisPanel } from './WorkflowAnalysisPanel';
import { useWorkflowAnalysis } from '../hooks/useWorkflowAnalysis';
import type { TransmissionLine } from '../data/transmissionLines';
import type { SubstationFeature } from '../data/infraLayers';
import type { SolarWorkflowType } from '../types';
import { scoreToVerdict, getGoThreshold, getSuitableThreshold, CONDITIONAL_GO_THRESHOLD } from '../utils/solarScoring';

interface WorkflowDef {
  type: SolarWorkflowType;
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const WORKFLOWS: WorkflowDef[] = [
  { type: 'solar_resource',      icon: <Sun size={13} />,         title: 'Solar Resource',         desc: 'GHI, DNI, yield estimate, recommended technology for this location.' },
  { type: 'grid_interconnection',icon: <Zap size={13} />,         title: 'Grid Interconnection',   desc: 'TNB substation, connection voltage, headroom and energisation timeline.' },
  { type: 'land_suitability',    icon: <Leaf size={13} />,        title: 'Land Suitability',       desc: 'Land category, soil, slope, drainage and conversion requirements.' },
  { type: 'land_availability',   icon: <Package size={13} />,     title: 'Land Availability',      desc: 'Parcel size, ownership, acquisition pathway and pricing.' },
  { type: 'climate_risk',        icon: <CloudRain size={13} />,   title: 'Climate & Flood Risk',   desc: 'DID flood zone, rainfall, drainage and climate change outlook.' },
  { type: 'road_access',         icon: <Truck size={13} />,       title: 'Road Access',            desc: 'Nearest road, route condition, heavy transport logistics.' },
  { type: 'env_social',          icon: <TreePine size={13} />,    title: 'Env & Social',           desc: 'Protected areas, DEIA requirement and community sensitivity.' },
  { type: 'site_suitability',    icon: <BarChart2 size={13} />,   title: 'Site Suitability',       desc: 'Composite verdict across all seven dimensions with weighted score.' },
];

const SCORE_LABELS: Record<string, string> = {
  solar: 'Solar', grid: 'Grid', land: 'Land',
  availability: 'Avail.', climate: 'Climate', road: 'Road', envSocial: 'Env',
};

function fmtDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

interface Props {
  lines: TransmissionLine[];
  subs: SubstationFeature[];
}

export function SolarWorkflowPanel({ lines, subs }: Props) {
  const { pinLocation, setPinLocation, setPinMode, setActiveWorkflow, selectedTile } = useAppContext();
  const { text, status, result, errorMsg, run, clear } = useWorkflowAnalysis();
  const [activeType, setActiveType] = useState<SolarWorkflowType | null>(null);
  const [geocoded, setGeocoded] = useState<GeocodedLocation | null>(null);

  // Use pin location if available; otherwise use selected tile centre
  const effectiveLat = pinLocation?.lat ?? selectedTile?.centerLat ?? null;
  const effectiveLng = pinLocation?.lng ?? selectedTile?.centerLng ?? null;

  useEffect(() => {
    if (effectiveLat == null || effectiveLng == null) { setGeocoded(null); return; }
    let cancelled = false;
    reverseGeocode(effectiveLat, effectiveLng).then((g) => { if (!cancelled) setGeocoded(g); });
    return () => { cancelled = true; };
  }, [effectiveLat, effectiveLng]);

  const ctx = useMemo(() => {
    if (effectiveLat == null || effectiveLng == null) return null;
    return getSolarContext(effectiveLat, effectiveLng, geocoded, lines, subs, selectedTile ?? undefined);
  }, [effectiveLat, effectiveLng, geocoded, lines, subs, selectedTile]);

  if (!ctx) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
        <MapPin size={28} className="text-muted" />
        <p className="text-muted text-[11px] leading-relaxed max-w-[200px]">
          Drop a pin on the map or click a hex tile to begin site analysis.
        </p>
      </div>
    );
  }

  const tile = selectedTile;

  const locationLabel = geocoded
    ? [geocoded.city, geocoded.state, geocoded.country].filter(Boolean).join(', ')
    : ctx.state
    ? `${ctx.state}, Malaysia`
    : `${effectiveLat!.toFixed(4)}, ${effectiveLng!.toFixed(4)}`;

  const runWorkflow = (type: SolarWorkflowType) => {
    setActiveType(type);
    setActiveWorkflow(type);
    clear();
    run(ctx, type);
  };

  if (activeType) {
    return (
      <WorkflowAnalysisPanel
        workflowType={activeType as unknown as import('../types').WorkflowType}
        text={text}
        status={status}
        result={result}
        errorMsg={errorMsg}
        onBack={() => { setActiveType(null); setActiveWorkflow(null); clear(); }}
        onRetry={() => run(ctx, activeType)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Location header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <MapPin size={12} className="text-accent mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-white text-[11px] font-medium truncate">{locationLabel}</p>
              <p className="text-muted text-[10px]">
                {effectiveLat!.toFixed(5)}, {effectiveLng!.toFixed(5)}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setPinLocation(null); setPinMode(false); clear(); setActiveType(null); }}
            className="text-muted hover:text-white transition-colors shrink-0"
            title="Clear pin"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Tile attribute summary */}
      <div className="px-4 py-3 border-b border-border shrink-0 space-y-1.5">
        <p className="text-muted text-[10px] font-semibold uppercase tracking-wide">Site Attributes</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
          <span className="text-muted">GHI</span>
          <span className="text-white font-medium">{ctx.ghiKwhM2Day} kWh/m²/day</span>
          <span className="text-muted">Land use</span>
          <span className="text-white font-medium capitalize">{ctx.landUse.replace('_', ' ')}</span>
          <span className="text-muted">Flood risk</span>
          <span className={`font-medium capitalize ${ctx.floodRisk === 'high' || ctx.floodRisk === 'extreme' ? 'text-red-400' : ctx.floodRisk === 'medium' ? 'text-amber-400' : 'text-green-400'}`}>
            {ctx.floodRisk}
          </span>
          <span className="text-muted">Nearest grid</span>
          <span className="text-white font-medium">{fmtDist(ctx.distToGridKm)} · {ctx.nearestGridVoltageKV} kV</span>
          <span className="text-muted">Nearest road</span>
          <span className="text-white font-medium">{fmtDist(ctx.distToRoadKm)}</span>
          {tile && (
            <>
              <span className="text-muted">Est. capacity</span>
              <span className="text-amber-400 font-semibold">{tile.attributes.estimatedCapacityMW} MW</span>
            </>
          )}
          {ctx.isProtected && (
            <>
              <span className="text-muted">Protected</span>
              <span className="text-red-400 font-medium">Yes — no development</span>
            </>
          )}
        </div>

        {/* Score bars if tile selected */}
        {tile && (
          <div className="mt-2 space-y-1">
            <p className="text-muted text-[10px] font-semibold uppercase tracking-wide">Dimension Scores</p>
            {(Object.entries(SCORE_LABELS) as [keyof typeof tile.scores, string][]).map(([key, label]) => {
              const score = tile.scores[key as keyof typeof tile.scores];
              const color = score >= 70 ? 'bg-green-500' : score >= 45 ? 'bg-amber-400' : 'bg-red-500';
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-muted text-[10px] w-12 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
                  </div>
                  <span className="text-white text-[10px] w-6 text-right">{score}</span>
                </div>
              );
            })}
            <div className="flex items-center justify-between mt-1">
              <span className="text-muted text-[10px]">Composite</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                tile.scores.composite >= getGoThreshold() ? 'bg-green-500/20 text-green-400' :
                tile.scores.composite >= getSuitableThreshold() ? 'bg-lime-500/20 text-lime-400' :
                tile.scores.composite >= CONDITIONAL_GO_THRESHOLD ? 'bg-amber-500/20 text-amber-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {tile.scores.composite} — {scoreToVerdict(tile.scores.composite)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Workflow cards */}
      <div className="px-4 py-3 space-y-1.5">
        <p className="text-muted text-[10px] font-semibold uppercase tracking-wide mb-2">Analysis Workflows</p>
        {WORKFLOWS.map((w) => (
          <button
            key={w.type}
            onClick={() => runWorkflow(w.type)}
            className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-md bg-surface-1 hover:bg-surface-2 border border-border hover:border-accent/40 transition-all group"
          >
            <span className="text-accent mt-0.5 shrink-0 group-hover:text-blue-300 transition-colors">
              {w.icon}
            </span>
            <div className="min-w-0">
              <p className="text-white text-[11px] font-medium">{w.title}</p>
              <p className="text-muted text-[10px] leading-relaxed mt-0.5">{w.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
