import { useState, useMemo, useEffect } from 'react';
import { MapPin, Zap, Leaf, BarChart2, Wifi, AlertTriangle, Star, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { getLocationContext, reverseGeocode } from '../utils/spatialContext';
import type { GeocodedLocation } from '../utils/spatialContext';
import { WorkflowAnalysisPanel } from './WorkflowAnalysisPanel';
import { useWorkflowAnalysis } from '../hooks/useWorkflowAnalysis';
import type { TransmissionLine } from '../data/transmissionLines';
import type { SubstationFeature } from '../data/infraLayers';
import type { WorkflowType } from '../types';

interface WorkflowDef {
  type: WorkflowType;
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const WORKFLOWS: WorkflowDef[] = [
  { type: 'power',        icon: <Zap size={13} />,           title: 'Power infrastructure',   desc: 'Grid connection strategy, headroom, redundancy and energisation timeline.' },
  { type: 'carbon',       icon: <Leaf size={13} />,          title: 'Carbon & generation mix', desc: 'Grid carbon intensity and RE PPA options available in this market.' },
  { type: 'load',         icon: <BarChart2 size={13} />,     title: 'Load competition',        desc: 'Micro-market supply/demand balance and absorption outlook.' },
  { type: 'connectivity', icon: <Wifi size={13} />,          title: 'Connectivity',            desc: 'Latency profile, fibre diversity and last-mile carrier options.' },
  { type: 'environment',  icon: <AlertTriangle size={13} />, title: 'Environmental risk',      desc: 'Flood, seismic, water stress and climate risk at this coordinate.' },
  { type: 'suitability',  icon: <Star size={13} />,          title: 'Site suitability',        desc: 'Composite 0–100 score across all dimensions with an investment verdict.' },
];

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

interface Props {
  linesToRender: TransmissionLine[];
  osmSubs?: SubstationFeature[];
}

export function LocationWorkflowPanel({ linesToRender, osmSubs }: Props) {
  const { pinLocation, setPinLocation, pinMode, setPinMode, setActiveWorkflow } = useAppContext();
  const { text, status, result, errorMsg, run, clear } = useWorkflowAnalysis();

  const [activeType, setActiveType] = useState<WorkflowType | null>(null);
  const [geocoded, setGeocoded] = useState<GeocodedLocation | null>(null);

  const ctx = useMemo(
    () => pinLocation
      ? getLocationContext(pinLocation.lat, pinLocation.lng, linesToRender, osmSubs)
      : null,
    [pinLocation, linesToRender, osmSubs],
  );

  // Reverse-geocode the pin whenever it changes
  useEffect(() => {
    if (!pinLocation) { setGeocoded(null); return; }
    let cancelled = false;
    reverseGeocode(pinLocation.lat, pinLocation.lng).then((result) => {
      if (!cancelled) setGeocoded(result);
    });
    return () => { cancelled = true; };
  }, [pinLocation]);

  function runWorkflow(type: WorkflowType) {
    if (!ctx) return;
    setActiveWorkflow(type);
    setActiveType(type);
    run(ctx, type);
  }

  function handleBack() {
    clear();
    setActiveType(null);
    setActiveWorkflow(null);
  }

  function handleClearPin() {
    setPinLocation(null);
    handleBack();
  }

  // ── Show analysis panel when a workflow is running or done ───────────────────
  if (activeType && (status === 'loading' || status === 'done' || status === 'error')) {
    return (
      <WorkflowAnalysisPanel
        workflowType={activeType}
        text={text}
        status={status}
        result={result}
        errorMsg={errorMsg}
        onBack={handleBack}
        onRetry={() => ctx && run(ctx, activeType)}
      />
    );
  }

  // ── No pin: empty state ──────────────────────────────────────────────────────
  if (!pinLocation || !ctx) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
            <MapPin size={18} className="text-accent" />
          </div>
          <div>
            <p className="text-white text-xs font-semibold mb-1">Drop a pin to start</p>
            <p className="text-muted text-[10px] leading-relaxed max-w-[180px] mx-auto">
              Click anywhere on the map to select a candidate location. The assistant will analyse that exact coordinate.
            </p>
          </div>
          <button
            onClick={() => setPinMode(true)}
            className={`mt-1 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              pinMode
                ? 'bg-accent text-white ring-2 ring-accent/40'
                : 'bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent'
            }`}
          >
            {pinMode ? '🎯 Click the map…' : 'Enter pin-drop mode'}
          </button>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-muted/50 text-[10px] uppercase tracking-wider mb-2">Available analyses</p>
          <div className="space-y-1.5">
            {WORKFLOWS.map((w) => (
              <div key={w.type} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface/40 opacity-40">
                <span className="text-muted">{w.icon}</span>
                <span className="text-muted text-[11px]">{w.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Pin set: location summary + workflow selector ────────────────────────────
  const sub1   = ctx.nearestSubstations[0];
  const line1  = ctx.nearestLines[0];
  const fibre1 = ctx.nearestFibreNodes[0];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
      {/* Location summary card */}
      <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <MapPin size={12} className="text-accent shrink-0 mt-0.5" />
              <span className="text-white text-[11px] font-semibold font-mono leading-snug">
                {ctx.lat.toFixed(4)}, {ctx.lng.toFixed(4)}
              </span>
            </div>
            {geocoded ? (
              <span className="text-muted text-[10px] leading-snug truncate pl-[18px]">
                {[geocoded.city, geocoded.state, geocoded.country].filter(Boolean).join(', ')}
              </span>
            ) : ctx.country && (
              <span className="text-muted/60 text-[10px] pl-[18px]">{ctx.country}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {geocoded && (
              <span className="text-[10px] bg-accent/15 text-accent border border-accent/25 rounded px-1.5 py-0.5 font-semibold">
                {geocoded.countryCode}
              </span>
            )}
            <button
              onClick={handleClearPin}
              className="text-muted hover:text-white p-0.5 rounded hover:bg-surface-2 transition-colors"
              title="Clear pin"
            >
              <X size={11} />
            </button>
          </div>
        </div>

        <div className="space-y-1 text-[10px] text-muted">
          {sub1 && (
            <div className="flex items-start gap-1.5">
              <span className="text-amber-400 shrink-0 mt-px">⚡</span>
              <span>
                <span className="text-white/70">{sub1.asset.properties.name}</span>
                {' '}— {fmtDist(sub1.distanceKm)}, {sub1.asset.properties.voltageKV} kV
              </span>
            </div>
          )}
          {line1 && (
            <div className="flex items-start gap-1.5">
              <span className="text-blue-400 shrink-0 mt-px">⟆</span>
              <span>
                <span className="text-white/70">{line1.asset.voltage_kV} kV line</span>
                {' '}at {fmtDist(line1.distanceKm)} ({line1.asset.operator})
              </span>
            </div>
          )}
          {fibre1 && (
            <div className="flex items-start gap-1.5">
              <span className="text-emerald-400 shrink-0 mt-px">◇</span>
              <span>
                <span className="text-white/70">{fibre1.asset.properties.name}</span>
                {' '}at {fmtDist(fibre1.distanceKm)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-purple-400 shrink-0">●</span>
            <span>
              {ctx.nearbyDCs.length > 0
                ? <><span className="text-white/70">{ctx.nearbyDCs.length} DCs</span> within 25 km — {ctx.totalNearbyMW.toLocaleString()} MW</>
                : 'No DCs within 25 km'}
            </span>
          </div>
        </div>
      </div>

      {/* Workflow selector cards */}
      <div className="space-y-2">
        {WORKFLOWS.map((w) => (
          <div
            key={w.type}
            className="bg-surface border border-border hover:border-accent/40 rounded-lg p-2.5 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-accent">{w.icon}</span>
              <span className="text-white text-[11px] font-semibold">{w.title}</span>
            </div>
            <p className="text-[10px] text-muted leading-relaxed mb-2">{w.desc}</p>
            <button
              onClick={() => runWorkflow(w.type)}
              className="w-full bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent rounded px-2 py-1 text-[10px] font-medium transition-colors"
            >
              Analyse this site →
            </button>
          </div>
        ))}
      </div>

      {/* Clear pin */}
      <button
        onClick={handleClearPin}
        className="w-full mt-1 text-muted hover:text-white text-[10px] py-1.5 border border-border hover:border-border/60 rounded-lg transition-colors"
      >
        Clear pin
      </button>
    </div>
  );
}
