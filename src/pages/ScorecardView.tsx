import { useState, useMemo } from 'react';
import { Plus, X, SlidersHorizontal, Award, Zap, Wifi, Droplets, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Header } from '../components/Header';
import { DC_DATABASE } from '../data/dcDatabase';
import { EXAMPLE_SITES, EMPTY_SCORES } from '../data/candidateSites';
import {
  calculateSiteScore,
  haversineDistance,
  DEFAULT_WEIGHTS,
  scoreBand,
  SCORE_BAND_COLOR,
} from '../utils/scoring';
import type { ScoringResult, ScoringWeights } from '../utils/scoring';
import type {
  CandidateSite,
  SiteScores,
  ScoringWeights as SWType,
  Country,
  CandidateSiteStatus,
  ZoningStatus,
  RiskLevel,
  WaterSourceType,
  WaterAvailability,
} from '../types';

// ─── Local types ──────────────────────────────────────────────────────────────

type LocalScoredSite = CandidateSite & { result: ScoringResult; rank: number };

type SortOrder = 'total' | 'power' | 'competition' | 'alpha';

// Form state (all strings for input binding; parsed on submit)
interface NewSiteForm {
  name: string;
  country: Country;
  city: string;
  lat: string;
  lng: string;
  status: CandidateSiteStatus;
  landAreaHa: string;
  askingPriceUSD: string;
  zoningStatus: ZoningStatus;
  floodRisk: RiskLevel;
  seismicRisk: RiskLevel;
  politicalRisk: RiskLevel;
  distanceToSubstationKm: string;
  substationCapacityMVA: string;
  distanceToFibreKm: string;
  fibreCarrierCount: string;
  distanceToWaterKm: string;
  waterSourceType: WaterSourceType;
  waterAvailability: WaterAvailability;
  notes: string;
}

const BLANK_FORM: NewSiteForm = {
  name: '', country: 'MY', city: '', lat: '', lng: '',
  status: 'available', landAreaHa: '', askingPriceUSD: '',
  zoningStatus: 'approved_industrial',
  floodRisk: 'low', seismicRisk: 'low', politicalRisk: 'low',
  distanceToSubstationKm: '', substationCapacityMVA: '',
  distanceToFibreKm: '', fibreCarrierCount: '',
  distanceToWaterKm: '', waterSourceType: 'municipal_piped',
  waterAvailability: 'adequate', notes: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

function scoreBgClass(score: number): string {
  if (score >= 70) return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400';
  if (score >= 50) return 'bg-amber-500/15 border-amber-500/30 text-amber-400';
  return 'bg-red-500/15 border-red-500/30 text-red-400';
}

function fmtUSD(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtMW(mw: number): string {
  return mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : `${mw.toLocaleString()} MW`;
}

const ZONING_LABELS: Record<ZoningStatus, string> = {
  approved_industrial:     'Approved — Industrial',
  approved_tech_park:      'Approved — Tech Park',
  approved_sez:            'Approved — SEZ',
  pending_rezoning:        'Pending Rezoning',
  residential_conversion:  'Residential Conversion',
  agricultural_conversion: 'Agricultural Conversion',
  unzoned:                 'Unzoned',
  restricted:              'Restricted',
};

const WATER_SOURCE_LABELS: Record<WaterSourceType, string> = {
  municipal_piped:      'Municipal Piped',
  river_abstraction:    'River Abstraction',
  reservoir:            'Reservoir',
  groundwater_bore:     'Groundwater Bore',
  recycled_industrial:  'Recycled Industrial',
  rainwater_harvesting: 'Rainwater Harvesting',
  desalination:         'Desalination',
};

// ─── ScoreGauge ───────────────────────────────────────────────────────────────

function ScoreGauge({ score, size = 156 }: { score: number; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = (size / 2) - 14;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);
  const color = scoreColor(score);
  const band  = scoreBand(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1F2937" strokeWidth={strokeWidth} />
        {/* Arc */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
        {/* Score number */}
        <text
          x={cx} y={cy - 6}
          textAnchor="middle"
          fill={color}
          fontSize={34}
          fontWeight={700}
          fontFamily="JetBrains Mono, monospace"
          style={{ transition: 'fill 0.3s ease' }}
        >
          {score}
        </text>
        {/* /100 label */}
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#6B7280" fontSize={11}>
          / 100
        </text>
      </svg>
      {/* Band label */}
      <span
        className="text-xs font-semibold px-2.5 py-0.5 rounded-full border"
        style={{ color, borderColor: color + '50', backgroundColor: color + '18' }}
      >
        {band}
      </span>
    </div>
  );
}

// ─── DimensionBar ─────────────────────────────────────────────────────────────

const DIM_CONFIG: Array<{ key: keyof Omit<SiteScores, 'total' | 'rank'>; label: string; weight: number }> = [
  { key: 'power',          label: 'Power',            weight: 30 },
  { key: 'competition',    label: 'Competition',       weight: 20 },
  { key: 'utilities',      label: 'Utilities',         weight: 20 },
  { key: 'landRegulatory', label: 'Land & Regulatory', weight: 15 },
  { key: 'marketAccess',   label: 'Market Access',     weight: 15 },
];

function DimensionBars({ result, weights }: { result: ScoringResult; weights: ScoringWeights }) {
  const weightMap: Record<string, number> = {
    power:          weights.power * 100,
    competition:    weights.competition * 100,
    utilities:      weights.utilities * 100,
    landRegulatory: weights.landRegulatory * 100,
    marketAccess:   weights.marketAccess * 100,
  };

  return (
    <div className="space-y-3">
      {DIM_CONFIG.map(({ key, label }) => {
        const score = result[key];
        const color = scoreColor(score);
        const w     = weightMap[key];

        // Build a sub-score hint from the breakdown
        let hint = '';
        if (key === 'power') {
          const b = result.breakdown.power;
          hint = `${b.distanceKm}km to substation · ${b.capacityMVA} MVA`;
        } else if (key === 'competition') {
          const b = result.breakdown.competition;
          hint = `${b.operationalCountIn10km} op. DCs within 10km · ${b.pipelineCountIn30km} pipeline within 30km`;
        } else if (key === 'utilities') {
          const b = result.breakdown.utilities;
          hint = `Fibre ${b.fibreKm}km · ${b.carrierCount} carriers · Water ${b.waterKm}km`;
        } else if (key === 'landRegulatory') {
          const b = result.breakdown.landRegulatory;
          hint = `${ZONING_LABELS[b.zoningStatus]} · Flood: ${b.floodRisk} · Seismic: ${b.seismicRisk}`;
        } else if (key === 'marketAccess') {
          const b = result.breakdown.marketAccess;
          hint = `Matched: ${b.matchedEntry}`;
        }

        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-white">{label}</span>
                <span className="text-muted/50 text-xs">({w.toFixed(0)}%)</span>
              </div>
              <span className="text-xs font-mono font-semibold tabular-nums" style={{ color }}>
                {score}
              </span>
            </div>
            <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-600"
                style={{ width: `${score}%`, backgroundColor: color }}
              />
            </div>
            {hint && <p className="text-muted/50 text-xs mt-0.5 truncate">{hint}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ─── RecommendationBadge ──────────────────────────────────────────────────────

function RecommendationBadge({ score }: { score: number }) {
  if (score >= 75) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
        <CheckCircle size={18} className="text-emerald-400 shrink-0" />
        <div>
          <p className="text-emerald-400 text-sm font-semibold">Recommend for Detailed Study</p>
          <p className="text-emerald-400/60 text-xs mt-0.5">Site meets threshold across all key dimensions</p>
        </div>
      </div>
    );
  }
  if (score >= 60) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <AlertTriangle size={18} className="text-amber-400 shrink-0" />
        <div>
          <p className="text-amber-400 text-sm font-semibold">Conditional — Address Power Gap</p>
          <p className="text-amber-400/60 text-xs mt-0.5">Proceed subject to grid capacity confirmation and fibre extension plan</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30">
      <XCircle size={18} className="text-red-400 shrink-0" />
      <div>
        <p className="text-red-400 text-sm font-semibold">Significant Constraints Identified</p>
        <p className="text-red-400/60 text-xs mt-0.5">Material risks require resolution before committing to further diligence</p>
      </div>
    </div>
  );
}

// ─── InfraCard ────────────────────────────────────────────────────────────────

function InfraCard({
  icon, label, primary, secondary, accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  accent?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${accent ? 'bg-accent/5 border-accent/20' : 'bg-surface-2 border-border'}`}>
      <div className={`p-1.5 rounded-lg shrink-0 ${accent ? 'bg-accent/20' : 'bg-surface'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-muted text-xs">{label}</p>
        <p className="text-white text-sm font-medium mt-0.5">{primary}</p>
        {secondary && <p className="text-muted text-xs mt-0.5">{secondary}</p>}
      </div>
    </div>
  );
}

// ─── SiteCard ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<CandidateSiteStatus, string> = {
  available:    'Available',
  under_review: 'Under Review',
  shortlisted:  'Shortlisted',
  loi_signed:   'LOI Signed',
  rejected:     'Rejected',
};

function SiteCard({
  site, result, isSelected, onClick,
}: {
  site: CandidateSite;
  result: ScoringResult;
  isSelected: boolean;
  onClick: () => void;
}) {
  const color  = scoreColor(result.total);
  const band   = scoreBand(result.total);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 border-b border-border transition-colors ${
        isSelected
          ? 'bg-accent/8 border-l-2 border-l-accent'
          : 'hover:bg-surface/60'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
          style={{
            backgroundColor: result.rank === 1 ? '#F59E0B20' : '#1F2937',
            color: result.rank === 1 ? '#F59E0B' : '#6B7280',
            border: `1px solid ${result.rank === 1 ? '#F59E0B40' : '#374151'}`,
          }}
        >
          {result.rank}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold truncate leading-tight">{site.name}</p>
          <p className="text-muted text-xs mt-0.5">{site.city} · {site.country}</p>
          <p className="text-muted/60 text-xs mt-1">{site.landAreaHa} ha · {fmtUSD(site.askingPriceUSD)}</p>
        </div>

        {/* Score */}
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold font-mono leading-none" style={{ color }}>
            {result.total}
          </p>
          <p className="text-muted text-xs">{band}</p>
        </div>
      </div>

      {/* Mini dimension bars */}
      {isSelected && (
        <div className="mt-3 grid grid-cols-5 gap-1">
          {DIM_CONFIG.map(({ key, label }) => (
            <div key={key} title={`${label}: ${result[key]}`}>
              <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${result[key]}%`, backgroundColor: scoreColor(result[key]) }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {result.dataGaps.length > 0 && (
        <div className="mt-2 flex items-center gap-1">
          <AlertTriangle size={10} className="text-amber-500 shrink-0" />
          <span className="text-amber-500/80 text-xs">{result.dataGaps.length} data gap{result.dataGaps.length > 1 ? 's' : ''}</span>
        </div>
      )}
    </button>
  );
}

// ─── AddSiteModal ─────────────────────────────────────────────────────────────

function AddSiteModal({ onClose, onAdd }: { onClose: () => void; onAdd: (s: CandidateSite) => void }) {
  const [form, setForm] = useState<NewSiteForm>(BLANK_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof NewSiteForm, string>>>({});

  function patch<K extends keyof NewSiteForm>(key: K, val: NewSiteForm[K]) {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof NewSiteForm, string>> = {};
    if (!form.name.trim()) e.name = 'Required';
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    if (isNaN(lat) || lat < -12 || lat > 25) e.lat = 'Lat must be −12 to 25';
    if (isNaN(lng) || lng < 94 || lng > 142) e.lng = 'Lng must be 94 to 142';
    if (!form.city.trim()) e.city = 'Required';
    if (isNaN(parseFloat(form.landAreaHa)) || parseFloat(form.landAreaHa) <= 0)      e.landAreaHa = 'Must be > 0';
    if (isNaN(parseFloat(form.askingPriceUSD)) || parseFloat(form.askingPriceUSD) < 0)
      e.askingPriceUSD = 'Must be ≥ 0';
    if (isNaN(parseFloat(form.distanceToSubstationKm)) || parseFloat(form.distanceToSubstationKm) < 0)
      e.distanceToSubstationKm = 'Must be ≥ 0';
    if (isNaN(parseFloat(form.substationCapacityMVA)) || parseFloat(form.substationCapacityMVA) <= 0)
      e.substationCapacityMVA = 'Must be > 0';
    if (isNaN(parseFloat(form.distanceToFibreKm)) || parseFloat(form.distanceToFibreKm) < 0)
      e.distanceToFibreKm = 'Must be ≥ 0';
    if (isNaN(parseInt(form.fibreCarrierCount)) || parseInt(form.fibreCarrierCount) < 0)
      e.fibreCarrierCount = 'Must be ≥ 0';
    if (isNaN(parseFloat(form.distanceToWaterKm)) || parseFloat(form.distanceToWaterKm) < 0)
      e.distanceToWaterKm = 'Must be ≥ 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    const site: CandidateSite = {
      id: `CAND-${Date.now()}`,
      name: form.name.trim(),
      country: form.country,
      city: form.city.trim(),
      coordinates: { lat: parseFloat(form.lat), lng: parseFloat(form.lng) },
      status: form.status,
      landAreaHa: parseFloat(form.landAreaHa),
      askingPriceUSD: parseFloat(form.askingPriceUSD),
      zoningStatus: form.zoningStatus,
      floodRisk: form.floodRisk,
      seismicRisk: form.seismicRisk,
      politicalRisk: form.politicalRisk,
      distanceToSubstationKm: parseFloat(form.distanceToSubstationKm),
      substationCapacityMVA: parseFloat(form.substationCapacityMVA),
      distanceToFibreKm: parseFloat(form.distanceToFibreKm),
      fibreCarrierCount: parseInt(form.fibreCarrierCount),
      distanceToWaterKm: parseFloat(form.distanceToWaterKm),
      waterSourceType: form.waterSourceType,
      waterAvailability: form.waterAvailability,
      scores: EMPTY_SCORES,
      notes: form.notes.trim(),
      createdAt: new Date().toISOString().split('T')[0],
    };
    onAdd(site);
    onClose();
  }

  const inputCls = 'w-full bg-[#0A0E1A] border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-muted/40';
  const selectCls = inputCls + ' cursor-pointer';
  const errCls = 'text-red-400 text-xs mt-0.5';

  function Err({ field }: { field: keyof NewSiteForm }) {
    return errors[field] ? <p className={errCls}>{errors[field]}</p> : null;
  }

  function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
      <div className="flex items-center gap-2 mb-3 mt-5 first:mt-0">
        <div className="h-px flex-1 bg-border" />
        <span className="text-muted/70 text-xs font-semibold uppercase tracking-wider px-2">{children}</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-2xl w-full max-w-xl flex flex-col max-h-[90vh] shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-white font-semibold">Add Candidate Site</h2>
            <p className="text-muted text-xs mt-0.5">Scores are calculated automatically from inputs</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-white hover:bg-surface-2 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-4 space-y-3 flex-1">
          <SectionTitle>Site Identity</SectionTitle>

          <div>
            <label className="block text-xs text-muted mb-1">Site Name *</label>
            <input type="text" value={form.name} onChange={e => patch('name', e.target.value)}
              placeholder="e.g. Nusajaya Plot NTP-8" className={inputCls} />
            <Err field="name" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Country *</label>
              <select value={form.country} onChange={e => patch('country', e.target.value as Country)} className={selectCls}>
                {(['MY','SG','ID','TH','PH','VN'] as Country[]).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">City *</label>
              <input type="text" value={form.city} onChange={e => patch('city', e.target.value)}
                placeholder="e.g. Iskandar Puteri" className={inputCls} />
              <Err field="city" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Latitude *</label>
              <input type="number" step="0.0001" value={form.lat} onChange={e => patch('lat', e.target.value)}
                placeholder="e.g. 1.4295" className={inputCls} />
              <Err field="lat" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Longitude *</label>
              <input type="number" step="0.0001" value={form.lng} onChange={e => patch('lng', e.target.value)}
                placeholder="e.g. 103.624" className={inputCls} />
              <Err field="lng" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Status</label>
              <select value={form.status} onChange={e => patch('status', e.target.value as CandidateSiteStatus)} className={selectCls}>
                {(['available','under_review','shortlisted','loi_signed'] as CandidateSiteStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Zoning Status</label>
              <select value={form.zoningStatus} onChange={e => patch('zoningStatus', e.target.value as ZoningStatus)} className={selectCls}>
                {(Object.entries(ZONING_LABELS) as [ZoningStatus, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Land Area (ha) *</label>
              <input type="number" step="0.1" min="0" value={form.landAreaHa} onChange={e => patch('landAreaHa', e.target.value)}
                placeholder="e.g. 16.5" className={inputCls} />
              <Err field="landAreaHa" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Asking Price (USD total) *</label>
              <input type="number" step="100000" min="0" value={form.askingPriceUSD} onChange={e => patch('askingPriceUSD', e.target.value)}
                placeholder="e.g. 38400000" className={inputCls} />
              <Err field="askingPriceUSD" />
            </div>
          </div>

          <SectionTitle>Power & Grid</SectionTitle>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Dist to Substation (km) *</label>
              <input type="number" step="0.1" min="0" value={form.distanceToSubstationKm} onChange={e => patch('distanceToSubstationKm', e.target.value)}
                placeholder="e.g. 1.2" className={inputCls} />
              <Err field="distanceToSubstationKm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Substation Capacity (MVA) *</label>
              <input type="number" step="10" min="0" value={form.substationCapacityMVA} onChange={e => patch('substationCapacityMVA', e.target.value)}
                placeholder="e.g. 150" className={inputCls} />
              <Err field="substationCapacityMVA" />
            </div>
          </div>

          <SectionTitle>Connectivity & Water</SectionTitle>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Dist to Fibre (km) *</label>
              <input type="number" step="0.1" min="0" value={form.distanceToFibreKm} onChange={e => patch('distanceToFibreKm', e.target.value)}
                placeholder="e.g. 1.5" className={inputCls} />
              <Err field="distanceToFibreKm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Fibre Carrier Count *</label>
              <input type="number" step="1" min="0" value={form.fibreCarrierCount} onChange={e => patch('fibreCarrierCount', e.target.value)}
                placeholder="e.g. 3" className={inputCls} />
              <Err field="fibreCarrierCount" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Dist to Water (km) *</label>
              <input type="number" step="0.1" min="0" value={form.distanceToWaterKm} onChange={e => patch('distanceToWaterKm', e.target.value)}
                placeholder="e.g. 4.0" className={inputCls} />
              <Err field="distanceToWaterKm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Water Source Type</label>
              <select value={form.waterSourceType} onChange={e => patch('waterSourceType', e.target.value as WaterSourceType)} className={selectCls}>
                {(Object.entries(WATER_SOURCE_LABELS) as [WaterSourceType, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <SectionTitle>Risk & Regulatory</SectionTitle>

          <div className="grid grid-cols-3 gap-3">
            {(['floodRisk', 'seismicRisk', 'politicalRisk'] as const).map(f => (
              <div key={f}>
                <label className="block text-xs text-muted mb-1 capitalize">
                  {f.replace('Risk', ' Risk')}
                </label>
                <select value={form[f]} onChange={e => patch(f, e.target.value as RiskLevel)} className={selectCls}>
                  {(['low','medium','high','extreme'] as RiskLevel[]).map(r => (
                    <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <SectionTitle>Notes</SectionTitle>

          <textarea
            value={form.notes}
            onChange={e => patch('notes', e.target.value)}
            rows={3}
            placeholder="Key observations, grid status, permitting notes…"
            className={`${inputCls} resize-none`}
          />
        </form>

        {/* Submit footer */}
        <div className="px-6 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            className="w-full bg-accent hover:bg-accent-hover text-white rounded-lg py-2.5 text-sm font-semibold transition-colors"
          >
            Calculate Scores & Add to List
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WeightsPanel ─────────────────────────────────────────────────────────────

function WeightsPanel({
  weights,
  onChange,
}: {
  weights: ScoringWeights;
  onChange: (w: ScoringWeights) => void;
}) {
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  const valid = Math.abs(total - 1) < 0.005;

  function setW(key: keyof ScoringWeights, val: number) {
    onChange({ ...weights, [key]: val });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-white text-xs font-semibold">Scoring Weights</span>
        <span className={`text-xs font-mono ${valid ? 'text-emerald-400' : 'text-red-400'}`}>
          Σ {(total * 100).toFixed(0)}%
        </span>
      </div>
      {DIM_CONFIG.map(({ key, label, weight: defaultW }) => (
        <div key={key}>
          <div className="flex justify-between mb-0.5">
            <span className="text-muted text-xs">{label}</span>
            <span className="text-white text-xs font-mono">
              {(weights[key as keyof ScoringWeights] * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range" min={0} max={0.60} step={0.05}
            value={weights[key as keyof ScoringWeights]}
            onChange={e => setW(key as keyof ScoringWeights, parseFloat(e.target.value))}
            className="w-full accent-accent h-1"
          />
        </div>
      ))}
    </div>
  );
}

// ─── ScorecardView (main) ─────────────────────────────────────────────────────

export function ScorecardView() {
  const [sites, setSites]           = useState<CandidateSite[]>(EXAMPLE_SITES);
  const [selectedId, setSelectedId] = useState<string>(EXAMPLE_SITES[0].id);
  const [sortOrder, setSortOrder]   = useState<SortOrder>('total');
  const [showModal, setShowModal]   = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [weights, setWeights]       = useState<ScoringWeights>(DEFAULT_WEIGHTS);

  // Compute scored sites (memoised; recalculates when sites or weights change)
  const scoredSites = useMemo((): LocalScoredSite[] => {
    const withScores = sites.map(s => ({
      ...s,
      result: calculateSiteScore(s, DC_DATABASE, weights),
    }));
    // Assign rank by total score
    const ranked = [...withScores].sort((a, b) => b.result.total - a.result.total);
    return ranked.map((s, i) => ({ ...s, rank: i + 1, result: { ...s.result, rank: i + 1 } }));
  }, [sites, weights]);

  // Apply display sort order (independent of score rank)
  const displaySites = useMemo((): LocalScoredSite[] => {
    const copy = [...scoredSites];
    switch (sortOrder) {
      case 'alpha':       return copy.sort((a, b) => a.name.localeCompare(b.name));
      case 'power':       return copy.sort((a, b) => b.result.power - a.result.power);
      case 'competition': return copy.sort((a, b) => b.result.competition - a.result.competition);
      default:            return copy; // 'total' — already sorted by score
    }
  }, [scoredSites, sortOrder]);

  const selected = scoredSites.find(s => s.id === selectedId) ?? scoredSites[0];

  // Competitive context (30km radius from selected site)
  const context = useMemo(() => {
    if (!selected) return null;
    const { lat, lng } = selected.coordinates;
    const opIn30 = DC_DATABASE.filter(dc =>
      dc.status === 'operational' &&
      haversineDistance(lat, lng, dc.coordinates.lat, dc.coordinates.lng) <= 30,
    );
    const pipeIn30 = DC_DATABASE.filter(dc =>
      dc.status !== 'operational' &&
      haversineDistance(lat, lng, dc.coordinates.lat, dc.coordinates.lng) <= 30,
    );
    const latestCOD = pipeIn30
      .map(d => d.expectedCOD)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? 'TBD';
    return {
      opCount: opIn30.length,
      opMW:    opIn30.reduce((s, d) => s + d.capacityMW, 0),
      pipeCount: pipeIn30.length,
      pipeMW:    pipeIn30.reduce((s, d) => s + d.capacityMW, 0),
      latestCOD,
    };
  }, [selected]);

  function addSite(site: CandidateSite) {
    setSites(prev => [...prev, site]);
    setSelectedId(site.id);
  }

  const SORT_OPTS: Array<{ key: SortOrder; label: string }> = [
    { key: 'total',       label: 'Score' },
    { key: 'power',       label: 'Power' },
    { key: 'competition', label: 'Comp.' },
    { key: 'alpha',       label: 'A–Z' },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Site Scorecard"
        subtitle={`${sites.length} candidate site${sites.length !== 1 ? 's' : ''} · weighted multi-criteria analysis`}
      />

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT PANEL (40%) ─────────────────────────────────────── */}
        <aside className="w-[40%] shrink-0 border-r border-border flex flex-col overflow-hidden bg-bg">

          {/* Sort controls */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
            <span className="text-muted text-xs shrink-0">Sort:</span>
            <div className="flex gap-1 flex-1">
              {SORT_OPTS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortOrder(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    sortOrder === key
                      ? 'bg-accent text-white'
                      : 'text-muted hover:text-white hover:bg-surface-2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-muted text-xs shrink-0">{sites.length}</span>
          </div>

          {/* Site cards */}
          <div className="flex-1 overflow-y-auto">
            {displaySites.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                <Award size={28} className="text-muted mb-3" />
                <p className="text-muted text-sm">No candidate sites yet</p>
                <p className="text-muted/60 text-xs mt-1">Click "Add Site" to get started</p>
              </div>
            ) : (
              displaySites.map(s => (
                <SiteCard
                  key={s.id}
                  site={s}
                  result={s.result}
                  isSelected={s.id === selectedId}
                  onClick={() => setSelectedId(s.id)}
                />
              ))
            )}
          </div>

          {/* Weights toggle + Add button */}
          <div className="border-t border-border shrink-0">
            {/* Weight sliders (collapsible) */}
            <div>
              <button
                onClick={() => setShowWeights(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-muted hover:text-white hover:bg-surface/40 transition-colors"
              >
                <SlidersHorizontal size={13} />
                <span className="text-xs flex-1 text-left">Scoring Weights</span>
                {showWeights ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showWeights && (
                <div className="px-4 pb-4 bg-surface/30">
                  <WeightsPanel weights={weights} onChange={setWeights} />
                </div>
              )}
            </div>

            {/* Add site button */}
            <div className="px-4 py-3">
              <button
                onClick={() => setShowModal(true)}
                className="w-full flex items-center justify-center gap-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 hover:border-accent/60 text-accent rounded-lg py-2.5 text-sm font-medium transition-all"
              >
                <Plus size={14} />
                Add New Site
              </button>
            </div>
          </div>
        </aside>

        {/* ── RIGHT PANEL (60%) ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <Award size={36} className="text-muted mb-4" />
              <p className="text-white text-base font-medium">Select a site to view analysis</p>
              <p className="text-muted text-sm mt-2">Click any card on the left to see the full scorecard</p>
            </div>
          ) : (
            <div className="p-6 space-y-5">

              {/* ── Site header ────────────────────────────────────── */}
              <div>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h2 className="text-white text-lg font-bold leading-tight">{selected.name}</h2>
                    <p className="text-muted text-sm mt-1">
                      {selected.city}, {selected.country} · {selected.landAreaHa} ha · {fmtUSD(selected.askingPriceUSD)}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full border ${scoreBgClass(selected.result.total)}`}>
                    #{selected.result.rank} of {sites.length}
                  </span>
                </div>

                {/* Recommendation banner */}
                <RecommendationBadge score={selected.result.total} />
              </div>

              {/* ── Score gauge + dimension bars ───────────────────── */}
              <div className="bg-surface border border-border rounded-xl p-5">
                <h3 className="text-white text-sm font-semibold mb-4">Score Breakdown</h3>
                <div className="flex gap-6 items-start">
                  {/* Gauge */}
                  <div className="shrink-0">
                    <ScoreGauge score={selected.result.total} />
                    {selected.result.confidence !== 'high' && (
                      <div className="mt-2 flex items-center gap-1 justify-center">
                        <AlertTriangle size={11} className="text-amber-500" />
                        <span className="text-amber-500/80 text-xs capitalize">
                          {selected.result.confidence} confidence
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Dimension bars */}
                  <div className="flex-1">
                    <DimensionBars result={selected.result} weights={weights} />
                  </div>
                </div>
              </div>

              {/* ── Competitive context ────────────────────────────── */}
              {context && (
                <div className="bg-surface border border-border rounded-xl p-5">
                  <h3 className="text-white text-sm font-semibold mb-3">Competitive Context (30 km radius)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface-2 rounded-xl p-4 border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        <span className="text-muted text-xs font-medium uppercase tracking-wider">Operational</span>
                      </div>
                      <p className="text-white text-2xl font-bold font-mono">{context.opCount}</p>
                      <p className="text-muted text-xs mt-1">data centres</p>
                      <p className="text-red-400 text-sm font-semibold mt-2">{fmtMW(context.opMW)}</p>
                      <p className="text-muted text-xs">total competing capacity</p>
                    </div>
                    <div className="bg-surface-2 rounded-xl p-4 border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span className="text-muted text-xs font-medium uppercase tracking-wider">Pipeline</span>
                      </div>
                      <p className="text-white text-2xl font-bold font-mono">{context.pipeCount}</p>
                      <p className="text-muted text-xs mt-1">announced / under construction</p>
                      <p className="text-amber-400 text-sm font-semibold mt-2">{fmtMW(context.pipeMW)}</p>
                      <p className="text-muted text-xs">
                        expected capacity through {context.latestCOD}
                      </p>
                    </div>
                  </div>
                  {context.opCount === 0 && context.pipeCount === 0 && (
                    <p className="text-muted/60 text-xs mt-3 text-center italic">
                      No tracked facilities within 30 km — first-mover advantage
                    </p>
                  )}
                </div>
              )}

              {/* ── Infrastructure proximity ───────────────────────── */}
              <div className="bg-surface border border-border rounded-xl p-5">
                <h3 className="text-white text-sm font-semibold mb-3">Nearest Infrastructure</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <InfraCard
                    icon={<Zap size={14} className="text-amber-400" />}
                    label="Nearest Substation"
                    primary={`${selected.distanceToSubstationKm} km`}
                    secondary={`${selected.substationCapacityMVA} MVA available${selected.gridVoltageKV ? ` · ${selected.gridVoltageKV} kV` : ''}`}
                    accent={selected.distanceToSubstationKm < 2}
                  />
                  <InfraCard
                    icon={<Wifi size={14} className="text-emerald-400" />}
                    label="Nearest Fibre Node"
                    primary={`${selected.distanceToFibreKm} km`}
                    secondary={`${selected.fibreCarrierCount} carrier${selected.fibreCarrierCount !== 1 ? 's' : ''}`}
                    accent={selected.distanceToFibreKm < 1}
                  />
                  <InfraCard
                    icon={<Droplets size={14} className="text-blue-400" />}
                    label="Nearest Water Source"
                    primary={`${selected.distanceToWaterKm} km`}
                    secondary={`${WATER_SOURCE_LABELS[selected.waterSourceType]} · ${selected.waterAvailability}`}
                    accent={selected.distanceToWaterKm < 2}
                  />
                </div>
              </div>

              {/* ── Site details table ─────────────────────────────── */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <h3 className="text-white text-sm font-semibold">Site Details</h3>
                </div>
                <div className="grid grid-cols-2 divide-x divide-border text-xs">
                  {([
                    ['Status',         STATUS_LABEL[selected.status]],
                    ['Land Area',      `${selected.landAreaHa} ha`],
                    ['Asking Price',   fmtUSD(selected.askingPriceUSD)],
                    ['Zoning',         ZONING_LABELS[selected.zoningStatus]],
                    ['Flood Risk',     selected.floodRisk],
                    ['Seismic Risk',   selected.seismicRisk],
                    ['Political Risk', selected.politicalRisk],
                    ['Substation',     `${selected.distanceToSubstationKm} km · ${selected.substationCapacityMVA} MVA`],
                    ['Dedicated Feed', selected.dedicatedGridConnection ? 'Yes' : 'No / Unknown'],
                    ['Fibre',          `${selected.distanceToFibreKm} km · ${selected.fibreCarrierCount} carriers`],
                    ['Water',          `${selected.distanceToWaterKm} km · ${WATER_SOURCE_LABELS[selected.waterSourceType]}`],
                    ['Water Avail.',   selected.waterAvailability],
                    selected.estimatedCapexUSDM != null &&
                      ['Est. Capex',   `${fmtUSD(selected.estimatedCapexUSDM * 1_000_000)}`],
                    selected.estimatedAnnualOpexUSDM != null &&
                      ['Est. Annual Opex', `${fmtUSD(selected.estimatedAnnualOpexUSDM * 1_000_000)}/yr`],
                  ] as Array<[string, string] | false>)
                    .filter(Boolean)
                    .map(([k, v]) => (
                      <div key={k} className="px-5 py-3 flex justify-between items-center border-b border-border last:border-b-0">
                        <span className="text-muted">{k}</span>
                        <span className={`font-medium capitalize ${
                          v === 'high' || v === 'extreme' ? 'text-red-400' :
                          v === 'medium' ? 'text-amber-400' :
                          v === 'low' ? 'text-emerald-400' : 'text-white'
                        }`}>{v}</span>
                      </div>
                    ))}
                </div>

                {/* Notes */}
                {selected.notes && (
                  <div className="px-5 py-4 border-t border-border bg-surface-2/50">
                    <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">Notes</p>
                    <p className="text-muted/80 text-xs leading-relaxed">{selected.notes}</p>
                  </div>
                )}

                {/* Tags */}
                {selected.tags && selected.tags.length > 0 && (
                  <div className="px-5 py-3 border-t border-border flex flex-wrap gap-2">
                    {selected.tags.map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Data gaps warning ──────────────────────────────── */}
              {selected.result.dataGaps.length > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/25">
                  <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-400 text-xs font-semibold mb-1">
                      {selected.result.dataGaps.length} data gap{selected.result.dataGaps.length > 1 ? 's' : ''} detected — scores may be understated
                    </p>
                    <ul className="space-y-0.5">
                      {selected.result.dataGaps.map(g => (
                        <li key={g} className="text-amber-400/70 text-xs">· {g}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* Add Site Modal */}
      {showModal && (
        <AddSiteModal
          onClose={() => setShowModal(false)}
          onAdd={addSite}
        />
      )}
    </div>
  );
}
