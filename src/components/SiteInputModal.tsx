import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, MapPin, ChevronRight, ChevronLeft, Check, AlertTriangle, Info, Zap } from 'lucide-react';
import { calculateSiteScore, scoreBand, SCORE_BAND_COLOR } from '../utils/scoring';
import type { ScoringResult } from '../utils/scoring';
import { DC_DATABASE } from '../data/dcDatabase';
import type {
  CandidateSite,
  Country,
  CandidateSiteStatus,
  ZoningStatus,
  WaterSourceType,
  WaterAvailability,
  RiskLevel,
  SiteScores,
  DataCentre,
} from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SiteInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (site: CandidateSite) => void;
  /** Provide to override the default DC_DATABASE for scoring. */
  allDCs?: DataCentre[];
  /**
   * Provide to enable the "Pick from map" button.
   * Call the supplied callback with the chosen lat/lng when ready.
   */
  onRequestMapPick?: (callback: (lat: number, lng: number) => void) => void;
}

// ─── Form draft state ─────────────────────────────────────────────────────────

type LandTenure = 'freehold' | 'leasehold' | 'concession';

interface Draft {
  name: string;
  country: Country;
  city: string;
  lat: string;
  lng: string;
  status: CandidateSiteStatus;
  landAreaHa: string;
  askingPriceUSD: string;
  // Power
  distanceToSubstationKm: string;
  substationCapacityMVA: string;
  dedicatedGridConnection: boolean;
  gridVoltageKV: string;
  // Utilities
  distanceToFibreKm: string;
  fibreCarrierCount: string;
  distanceToWaterKm: string;
  waterSourceType: WaterSourceType;
  waterAvailability: WaterAvailability;
  distanceToIXKm: string;
  distanceToAirportKm: string;
  // Land & regulatory
  zoningStatus: ZoningStatus;
  floodRisk: RiskLevel;
  seismicRisk: RiskLevel;
  politicalRisk: RiskLevel;
  landTenure: LandTenure;
  // Notes
  notes: string;
}

const BLANK: Draft = {
  name: '',
  country: 'MY',
  city: '',
  lat: '',
  lng: '',
  status: 'available',
  landAreaHa: '',
  askingPriceUSD: '',
  distanceToSubstationKm: '',
  substationCapacityMVA: '',
  dedicatedGridConnection: false,
  gridVoltageKV: '',
  distanceToFibreKm: '',
  fibreCarrierCount: '2',
  distanceToWaterKm: '',
  waterSourceType: 'municipal_piped',
  waterAvailability: 'adequate',
  distanceToIXKm: '',
  distanceToAirportKm: '',
  zoningStatus: 'approved_industrial',
  floodRisk: 'low',
  seismicRisk: 'low',
  politicalRisk: 'low',
  landTenure: 'freehold',
  notes: '',
};

const ZERO_SCORES: SiteScores = {
  power: 0, competition: 0, utilities: 0,
  landRegulatory: 0, marketAccess: 0, total: 0, rank: 0,
};

// ─── Steps metadata ───────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: 'Basic Info' },
  { n: 2, label: 'Power & Grid' },
  { n: 3, label: 'Utilities' },
  { n: 4, label: 'Land & Risk' },
  { n: 5, label: 'Score Preview' },
];

// ─── Validation ───────────────────────────────────────────────────────────────

type Errors = Partial<Record<string, string>>;

function validateStep(step: number, d: Draft): Errors {
  const err: Errors = {};
  const num = (s: string) => s.trim() !== '' && !isNaN(parseFloat(s));

  if (step === 1) {
    if (!d.name.trim()) err.name = 'Site name is required.';
    if (!d.city.trim()) err.city = 'City is required.';
    if (!num(d.lat) || parseFloat(d.lat) < -12 || parseFloat(d.lat) > 25)
      err.lat = 'Latitude must be between −12 and 25.';
    if (!num(d.lng) || parseFloat(d.lng) < 94 || parseFloat(d.lng) > 142)
      err.lng = 'Longitude must be between 94 and 142.';
    if (!num(d.landAreaHa) || parseFloat(d.landAreaHa) <= 0)
      err.landAreaHa = 'Land area must be greater than 0.';
  }
  if (step === 2) {
    if (!num(d.distanceToSubstationKm) || parseFloat(d.distanceToSubstationKm) < 0)
      err.distanceToSubstationKm = 'Enter a distance ≥ 0 km.';
    if (!num(d.substationCapacityMVA) || parseFloat(d.substationCapacityMVA) <= 0)
      err.substationCapacityMVA = 'Enter available capacity in MVA.';
  }
  if (step === 3) {
    if (!num(d.distanceToFibreKm) || parseFloat(d.distanceToFibreKm) < 0)
      err.distanceToFibreKm = 'Enter a distance ≥ 0 km.';
    if (!num(d.distanceToWaterKm) || parseFloat(d.distanceToWaterKm) < 0)
      err.distanceToWaterKm = 'Enter a distance ≥ 0 km.';
  }
  return err;
}

// ─── Build CandidateSite from draft ──────────────────────────────────────────

function buildSite(d: Draft): CandidateSite {
  const n = (s: string, fallback = 0) => s.trim() ? parseFloat(s) : fallback;
  const noteParts = [
    `Land tenure: ${d.landTenure}`,
    d.notes.trim(),
  ].filter(Boolean);

  return {
    id: `site-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: d.name.trim() || 'Unnamed Site',
    country: d.country,
    city: d.city.trim(),
    coordinates: { lat: n(d.lat), lng: n(d.lng) },
    status: d.status,
    landAreaHa: n(d.landAreaHa),
    askingPriceUSD: n(d.askingPriceUSD),
    zoningStatus: d.zoningStatus,
    floodRisk: d.floodRisk,
    seismicRisk: d.seismicRisk,
    politicalRisk: d.politicalRisk,
    distanceToSubstationKm: n(d.distanceToSubstationKm),
    substationCapacityMVA: n(d.substationCapacityMVA),
    dedicatedGridConnection: d.dedicatedGridConnection,
    ...(d.gridVoltageKV.trim() ? { gridVoltageKV: parseFloat(d.gridVoltageKV) } : {}),
    distanceToFibreKm: n(d.distanceToFibreKm),
    fibreCarrierCount: parseInt(d.fibreCarrierCount, 10) || 2,
    distanceToWaterKm: n(d.distanceToWaterKm),
    waterSourceType: d.waterSourceType,
    waterAvailability: d.waterAvailability,
    ...(d.distanceToIXKm.trim() ? { distanceToIXKm: parseFloat(d.distanceToIXKm) } : {}),
    ...(d.distanceToAirportKm.trim() ? { distanceToAirportKm: parseFloat(d.distanceToAirportKm) } : {}),
    scores: ZERO_SCORES,
    notes: noteParts.join('\n\n'),
    createdAt: new Date().toISOString(),
  };
}

// ─── Small reusable form widgets ──────────────────────────────────────────────

function FieldLabel({ children, required, hint }: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <label className="text-xs text-muted font-medium">
        {children}
        {required && <span className="text-accent ml-0.5">*</span>}
      </label>
      {hint && (
        <span className="group relative cursor-default">
          <Info size={11} className="text-muted/60 hover:text-muted" />
          <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 w-48 bg-surface-2 border border-border text-white text-[10px] rounded-lg px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-normal leading-relaxed shadow-xl">
            {hint}
          </span>
        </span>
      )}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, error }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-surface-2 border text-white text-sm rounded-lg px-3 py-2 placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent transition-colors ${
          error ? 'border-red-500/70' : 'border-border focus:border-accent/50'
        }`}
      />
      {error && <p className="text-red-400 text-[10px] mt-1">{error}</p>}
    </div>
  );
}

function NumberInput({ value, onChange, placeholder, unit, error, min }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
  error?: string;
  min?: number;
}) {
  return (
    <div>
      <div className={`flex items-center bg-surface-2 border rounded-lg overflow-hidden transition-colors focus-within:ring-1 focus-within:ring-accent ${
        error ? 'border-red-500/70' : 'border-border focus-within:border-accent/50'
      }`}>
        <input
          type="number"
          value={value}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '0'}
          className="flex-1 bg-transparent text-white text-sm px-3 py-2 placeholder:text-muted/50 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && <span className="pr-3 text-muted text-xs shrink-0">{unit}</span>}
      </div>
      {error && <p className="text-red-400 text-[10px] mt-1">{error}</p>}
    </div>
  );
}

function SelectInput<T extends string>({ value, onChange, options, error }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  error?: string;
}) {
  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`w-full bg-surface-2 border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent transition-colors ${
          error ? 'border-red-500/70' : 'border-border focus:border-accent/50'
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="text-red-400 text-[10px] mt-1">{error}</p>}
    </div>
  );
}

function OptionPicker<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; color?: string }[];
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            value === o.value
              ? 'text-white border-transparent'
              : 'bg-surface-2 text-muted border-border hover:text-white'
          }`}
          style={value === o.value ? { backgroundColor: o.color ?? '#3B82F6', borderColor: o.color ?? '#3B82F6' } : {}}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange, labelOn, labelOff }: {
  value: boolean;
  onChange: (v: boolean) => void;
  labelOn?: string;
  labelOff?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-surface-2 border border-border'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${value ? 'left-4' : 'left-0.5'}`}
        />
      </button>
      <span className="text-xs text-white">{value ? (labelOn ?? 'Yes') : (labelOff ?? 'No')}</span>
    </div>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">{children}</div>;
}

function FormField({ children, span }: { children: React.ReactNode; span?: 'full' }) {
  return <div className={span === 'full' ? 'sm:col-span-2' : ''}>{children}</div>;
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="sm:col-span-2 flex items-center gap-3 pt-2">
      <span className="text-[10px] text-muted uppercase tracking-widest font-semibold whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── Score Preview component ──────────────────────────────────────────────────

const DIM_CONFIG = [
  { key: 'power'         as const, label: 'Power & Grid',     weight: '30%', color: '#3B82F6' },
  { key: 'competition'   as const, label: 'Competition',      weight: '20%', color: '#8B5CF6' },
  { key: 'utilities'     as const, label: 'Utilities',        weight: '20%', color: '#10B981' },
  { key: 'landRegulatory'as const, label: 'Land & Regulatory',weight: '15%', color: '#F97316' },
  { key: 'marketAccess'  as const, label: 'Market Access',    weight: '15%', color: '#EAB308' },
];

function ScoreGaugeMini({ total, color }: { total: number; color: string }) {
  const size = 104;
  const r = 40;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - total / 100);

  return (
    <svg width={size} height={size} style={{ overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1F2937" strokeWidth={8} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={22} fontWeight={700} fontFamily="monospace">
        {Math.round(total)}
      </text>
    </svg>
  );
}

function ScorePreview({ site, allDCs }: { site: CandidateSite; allDCs: DataCentre[] }) {
  const result = useMemo<ScoringResult>(
    () => calculateSiteScore(site, allDCs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [animated, setAnimated] = useState(false);
  const [displayTotal, setDisplayTotal] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setAnimated(true), 120);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (!animated) return;
    const target = result.total;
    const duration = 900;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayTotal(Math.round(target * ease));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animated, result.total]);

  const band = scoreBand(result.total);
  const bandColor = SCORE_BAND_COLOR[band];

  const recommendation =
    result.total >= 75
      ? { icon: '✅', text: 'Recommend for Detailed Study', color: '#10B981' }
      : result.total >= 60
      ? { icon: '⚠️', text: 'Conditional — Address Key Gaps', color: '#F59E0B' }
      : { icon: '❌', text: 'Significant Constraints', color: '#EF4444' };

  return (
    <div className="space-y-5">
      {/* Headline score */}
      <div className="flex items-center gap-6 bg-surface-2 rounded-xl p-5 border border-border">
        <ScoreGaugeMini total={animated ? result.total : 0} color={bandColor} />
        <div className="flex-1 min-w-0">
          <p className="text-muted text-xs mb-1">Composite Score</p>
          <p className="text-white text-3xl font-bold font-mono leading-none">
            {displayTotal}
            <span className="text-muted text-lg font-normal"> / 100</span>
          </p>
          <span
            className="inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${bandColor}20`, color: bandColor }}
          >
            {band}
          </span>
          <p
            className="text-xs mt-2 font-medium"
            style={{ color: recommendation.color }}
          >
            {recommendation.icon} {recommendation.text}
          </p>
        </div>
      </div>

      {/* Dimension bars */}
      <div className="space-y-3">
        {DIM_CONFIG.map((dim, i) => {
          const score = result[dim.key];
          return (
            <div key={dim.key} style={{ transitionDelay: animated ? `${i * 80}ms` : '0ms' }}>
              <div className="flex justify-between items-baseline mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dim.color }} />
                  <span className="text-xs text-white">{dim.label}</span>
                  <span className="text-[10px] text-muted">{dim.weight}</span>
                </div>
                <span className="text-xs font-mono text-white">{score}</span>
              </div>
              <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: animated ? `${score}%` : '0%',
                    backgroundColor: dim.color,
                    transition: `width 0.7s cubic-bezier(0.34, 1.1, 0.64, 1) ${i * 80}ms`,
                    opacity: 0.85,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Confidence + data gaps */}
      <div className="flex items-start gap-3 flex-wrap">
        <span
          className={`text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wide ${
            result.confidence === 'high'
              ? 'bg-emerald-500/15 text-emerald-400'
              : result.confidence === 'medium'
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-red-500/15 text-red-400'
          }`}
        >
          {result.confidence} confidence
        </span>
        {result.dataGaps.length > 0 && (
          <div className="flex items-start gap-1.5">
            <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-400">
              Missing data may affect score: {result.dataGaps.join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function SaveToast({ name, onDone }: { name: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 bg-emerald-900/90 border border-emerald-700 text-emerald-100 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-sm animate-in">
      <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
        <Check size={13} className="text-white" />
      </div>
      <div>
        <p className="text-sm font-semibold">Site saved</p>
        <p className="text-[11px] text-emerald-300">{name} has been scored and added.</p>
      </div>
    </div>
  );
}

// ─── Step progress bar ────────────────────────────────────────────────────────

function StepProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 px-1">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                s.n < current
                  ? 'bg-accent text-white'
                  : s.n === current
                  ? 'bg-accent text-white ring-2 ring-accent/30 ring-offset-1 ring-offset-surface'
                  : 'bg-surface-2 text-muted border border-border'
              }`}
            >
              {s.n < current ? <Check size={12} /> : s.n}
            </div>
            <span
              className={`text-[9px] font-medium whitespace-nowrap transition-colors ${
                s.n === current ? 'text-white' : 'text-muted'
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-1 mb-4 transition-colors ${s.n < current ? 'bg-accent' : 'bg-border'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Step content ─────────────────────────────────────────────────────────────

function Step1({ draft: d, set, errors }: {
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  errors: Errors;
}) {
  return (
    <FormGrid>
      <FormField span="full">
        <FieldLabel required>Site Name</FieldLabel>
        <TextInput
          value={d.name}
          onChange={(v) => set('name', v)}
          placeholder="e.g. NTP-7B Industrial Site"
          error={errors.name}
        />
      </FormField>

      <FormField>
        <FieldLabel required>Country</FieldLabel>
        <SelectInput<Country>
          value={d.country}
          onChange={(v) => set('country', v)}
          options={[
            { value: 'MY', label: '🇲🇾 Malaysia' },
            { value: 'SG', label: '🇸🇬 Singapore' },
            { value: 'ID', label: '🇮🇩 Indonesia' },
            { value: 'TH', label: '🇹🇭 Thailand' },
            { value: 'VN', label: '🇻🇳 Vietnam' },
            { value: 'PH', label: '🇵🇭 Philippines' },
            { value: 'MM', label: '🇲🇲 Myanmar' },
            { value: 'KH', label: '🇰🇭 Cambodia' },
            { value: 'LA', label: '🇱🇦 Laos' },
            { value: 'BN', label: '🇧🇳 Brunei' },
          ]}
        />
      </FormField>

      <FormField>
        <FieldLabel required>City / Zone</FieldLabel>
        <TextInput
          value={d.city}
          onChange={(v) => set('city', v)}
          placeholder="e.g. Iskandar Puteri"
          error={errors.city}
        />
      </FormField>

      <SectionDivider label="Location" />

      <FormField>
        <FieldLabel required hint="WGS84 decimal degrees. SEA range: −12 to 25.">Latitude</FieldLabel>
        <NumberInput
          value={d.lat}
          onChange={(v) => set('lat', v)}
          placeholder="e.g. 1.4318"
          unit="°N"
          error={errors.lat}
        />
      </FormField>

      <FormField>
        <FieldLabel required hint="WGS84 decimal degrees. SEA range: 94 to 142.">Longitude</FieldLabel>
        <NumberInput
          value={d.lng}
          onChange={(v) => set('lng', v)}
          placeholder="e.g. 103.6291"
          unit="°E"
          error={errors.lng}
        />
      </FormField>

      <SectionDivider label="Land" />

      <FormField>
        <FieldLabel required hint="Gross developable area of the parcel.">Land Area</FieldLabel>
        <NumberInput
          value={d.landAreaHa}
          onChange={(v) => set('landAreaHa', v)}
          placeholder="e.g. 16.2"
          unit="ha"
          min={0}
          error={errors.landAreaHa}
        />
      </FormField>

      <FormField>
        <FieldLabel hint="Optional — leave blank if not yet quoted.">Asking Price</FieldLabel>
        <NumberInput
          value={d.askingPriceUSD}
          onChange={(v) => set('askingPriceUSD', v)}
          placeholder="e.g. 38400000"
          unit="USD"
          min={0}
        />
      </FormField>

      <FormField>
        <FieldLabel>Site Status</FieldLabel>
        <SelectInput<CandidateSiteStatus>
          value={d.status}
          onChange={(v) => set('status', v)}
          options={[
            { value: 'available',     label: 'Available' },
            { value: 'under_review',  label: 'Under Review' },
            { value: 'shortlisted',   label: 'Shortlisted' },
            { value: 'loi_signed',    label: 'LOI Signed' },
            { value: 'rejected',      label: 'Rejected' },
          ]}
        />
      </FormField>
    </FormGrid>
  );
}

function Step2({ draft: d, set, errors }: {
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  errors: Errors;
}) {
  return (
    <FormGrid>
      <FormField>
        <FieldLabel required hint="Straight-line distance to the nearest HV substation.">
          Distance to Substation
        </FieldLabel>
        <NumberInput
          value={d.distanceToSubstationKm}
          onChange={(v) => set('distanceToSubstationKm', v)}
          placeholder="e.g. 0.9"
          unit="km"
          min={0}
          error={errors.distanceToSubstationKm}
        />
      </FormField>

      <FormField>
        <FieldLabel required hint="Available headroom or committed capacity at the nearest substation.">
          Substation Capacity
        </FieldLabel>
        <NumberInput
          value={d.substationCapacityMVA}
          onChange={(v) => set('substationCapacityMVA', v)}
          placeholder="e.g. 180"
          unit="MVA"
          min={0}
          error={errors.substationCapacityMVA}
        />
      </FormField>

      <FormField>
        <FieldLabel hint="132kV, 275kV, etc.">Grid Voltage</FieldLabel>
        <NumberInput
          value={d.gridVoltageKV}
          onChange={(v) => set('gridVoltageKV', v)}
          placeholder="e.g. 275"
          unit="kV"
          min={0}
        />
      </FormField>

      <FormField>
        <FieldLabel hint="Dedicated feed or N+1 redundancy confirmed by the utility.">
          Dedicated / N+1 Feed Available
        </FieldLabel>
        <div className="py-2">
          <Toggle
            value={d.dedicatedGridConnection}
            onChange={(v) => set('dedicatedGridConnection', v)}
            labelOn="Yes — dedicated or N+1 confirmed"
            labelOff="No — shared or unconfirmed"
          />
        </div>
      </FormField>

      <SectionDivider label="Scoring guidance" />

      <FormField span="full">
        <div className="bg-surface-2/60 rounded-xl border border-border p-4 space-y-2">
          <p className="text-[10px] text-muted font-semibold uppercase tracking-wide">Power Score Thresholds</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[10px] text-muted">
            <span>Distance &lt; 1 km → 100 pts</span>
            <span>Capacity &gt; 100 MVA → 100 pts</span>
            <span>Distance 1–3 km → 85 pts</span>
            <span>Capacity 50–100 MVA → 80 pts</span>
            <span>Distance 3–5 km → 70 pts</span>
            <span>Capacity 20–50 MVA → 60 pts</span>
            <span>Distance 5–10 km → 50 pts</span>
            <span>Capacity &lt; 20 MVA → 30 pts</span>
          </div>
        </div>
      </FormField>
    </FormGrid>
  );
}

function Step3({ draft: d, set, errors }: {
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  errors: Errors;
}) {
  return (
    <FormGrid>
      <SectionDivider label="Connectivity" />

      <FormField>
        <FieldLabel required hint="Straight-line distance to the nearest lit fibre backbone route.">
          Distance to Fibre
        </FieldLabel>
        <NumberInput
          value={d.distanceToFibreKm}
          onChange={(v) => set('distanceToFibreKm', v)}
          placeholder="e.g. 0.4"
          unit="km"
          min={0}
          error={errors.distanceToFibreKm}
        />
      </FormField>

      <FormField>
        <FieldLabel required hint="Count of independent fibre carriers with PoPs within 5 km.">
          Fibre Carriers Available
        </FieldLabel>
        <div className="pt-0.5">
          <OptionPicker<string>
            value={d.fibreCarrierCount}
            onChange={(v) => set('fibreCarrierCount', v)}
            options={[
              { value: '1', label: '1', color: '#EF4444' },
              { value: '2', label: '2', color: '#F97316' },
              { value: '3', label: '3', color: '#10B981' },
              { value: '4', label: '4+', color: '#3B82F6' },
            ]}
          />
        </div>
      </FormField>

      <FormField>
        <FieldLabel hint="Distance to nearest internet exchange point.">
          Distance to IX
        </FieldLabel>
        <NumberInput
          value={d.distanceToIXKm}
          onChange={(v) => set('distanceToIXKm', v)}
          placeholder="optional"
          unit="km"
          min={0}
        />
      </FormField>

      <FormField>
        <FieldLabel hint="Distance to nearest international airport.">
          Distance to Airport
        </FieldLabel>
        <NumberInput
          value={d.distanceToAirportKm}
          onChange={(v) => set('distanceToAirportKm', v)}
          placeholder="optional"
          unit="km"
          min={0}
        />
      </FormField>

      <SectionDivider label="Water & Cooling" />

      <FormField>
        <FieldLabel required>Distance to Water Source</FieldLabel>
        <NumberInput
          value={d.distanceToWaterKm}
          onChange={(v) => set('distanceToWaterKm', v)}
          placeholder="e.g. 3.8"
          unit="km"
          min={0}
          error={errors.distanceToWaterKm}
        />
      </FormField>

      <FormField>
        <FieldLabel>Water Source Type</FieldLabel>
        <SelectInput<WaterSourceType>
          value={d.waterSourceType}
          onChange={(v) => set('waterSourceType', v)}
          options={[
            { value: 'municipal_piped',    label: 'Municipal Piped' },
            { value: 'river_abstraction',  label: 'River Abstraction' },
            { value: 'reservoir',          label: 'Reservoir' },
            { value: 'groundwater_bore',   label: 'Groundwater / Bore' },
            { value: 'recycled_industrial',label: 'Recycled Industrial' },
            { value: 'rainwater_harvesting',label: 'Rainwater Harvesting' },
            { value: 'desalination',       label: 'Desalination' },
          ]}
        />
      </FormField>

      <FormField span="full">
        <FieldLabel hint="Sustained supply reliability under peak dry-season conditions.">
          Water Availability
        </FieldLabel>
        <div className="pt-0.5">
          <OptionPicker<WaterAvailability>
            value={d.waterAvailability}
            onChange={(v) => set('waterAvailability', v)}
            options={[
              { value: 'abundant',    label: 'Abundant',    color: '#10B981' },
              { value: 'adequate',    label: 'Adequate',    color: '#3B82F6' },
              { value: 'constrained', label: 'Constrained', color: '#F97316' },
              { value: 'critical',    label: 'Critical',    color: '#EF4444' },
            ]}
          />
        </div>
      </FormField>
    </FormGrid>
  );
}

function Step4({ draft: d, set }: {
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
}) {
  const riskOpts: { value: RiskLevel; label: string; color: string }[] = [
    { value: 'low',     label: 'Low',     color: '#10B981' },
    { value: 'medium',  label: 'Medium',  color: '#F59E0B' },
    { value: 'high',    label: 'High',    color: '#F97316' },
    { value: 'extreme', label: 'Extreme', color: '#EF4444' },
  ];

  return (
    <FormGrid>
      <FormField span="full">
        <FieldLabel hint="Planning consent / zoning classification for the parcel.">
          Zoning Status
        </FieldLabel>
        <SelectInput<ZoningStatus>
          value={d.zoningStatus}
          onChange={(v) => set('zoningStatus', v)}
          options={[
            { value: 'approved_industrial',      label: 'Approved — Industrial' },
            { value: 'approved_tech_park',        label: 'Approved — Tech Park / MSC' },
            { value: 'approved_sez',              label: 'Approved — Special Economic Zone' },
            { value: 'pending_rezoning',          label: 'Pending Rezoning' },
            { value: 'residential_conversion',    label: 'Residential Conversion' },
            { value: 'agricultural_conversion',   label: 'Agricultural Conversion' },
            { value: 'unzoned',                   label: 'Unzoned' },
            { value: 'restricted',                label: 'Restricted / Protected' },
          ]}
        />
      </FormField>

      <FormField>
        <FieldLabel hint="1-in-100 year floodplain exposure.">Flood Risk</FieldLabel>
        <div className="pt-0.5">
          <OptionPicker<RiskLevel>
            value={d.floodRisk}
            onChange={(v) => set('floodRisk', v)}
            options={riskOpts}
          />
        </div>
      </FormField>

      <FormField>
        <FieldLabel hint="Seismic hazard zone per regional geological survey.">Seismic Risk</FieldLabel>
        <div className="pt-0.5">
          <OptionPicker<RiskLevel>
            value={d.seismicRisk}
            onChange={(v) => set('seismicRisk', v)}
            options={riskOpts}
          />
        </div>
      </FormField>

      <FormField>
        <FieldLabel hint="Country-level political stability (Economist EIU / World Bank).">
          Political Risk
        </FieldLabel>
        <div className="pt-0.5">
          <OptionPicker<RiskLevel>
            value={d.politicalRisk}
            onChange={(v) => set('politicalRisk', v)}
            options={riskOpts.slice(0, 3)}
          />
        </div>
      </FormField>

      <FormField>
        <FieldLabel hint="Land ownership / tenure classification.">Land Tenure</FieldLabel>
        <div className="pt-0.5">
          <OptionPicker<LandTenure>
            value={d.landTenure}
            onChange={(v) => set('landTenure', v)}
            options={[
              { value: 'freehold',   label: 'Freehold',   color: '#10B981' },
              { value: 'leasehold',  label: 'Leasehold',  color: '#3B82F6' },
              { value: 'concession', label: 'Concession', color: '#8B5CF6' },
            ]}
          />
        </div>
      </FormField>
    </FormGrid>
  );
}

function Step5({
  draft: d,
  set,
  site,
  allDCs,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  site: CandidateSite;
  allDCs: DataCentre[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel hint="Any additional context: site visit notes, broker details, access constraints, etc.">
          Notes
        </FieldLabel>
        <textarea
          value={d.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Free-form notes about the site — access conditions, broker contacts, competing bids, etc."
          rows={3}
          className="w-full bg-surface-2 border border-border text-white text-sm rounded-lg px-3 py-2.5 placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent transition-colors resize-none"
        />
      </div>

      <div className="h-px bg-border" />

      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Predicted Score</p>
        <ScorePreview site={site} allDCs={allDCs} />
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function SiteInputModal({
  isOpen,
  onClose,
  onSave,
  allDCs = DC_DATABASE,
  onRequestMapPick,
}: SiteInputModalProps) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [errors, setErrors] = useState<Errors>({});
  const [showToast, setShowToast] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }, []);

  // Pre-build the site for scoring in step 5
  const builtSite = useMemo(() => buildSite(draft), [draft]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setDraft(BLANK);
      setErrors({});
      setShowToast(false);
    }
  }, [isOpen]);

  // Scroll content to top on step change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  function handleNext() {
    const errs = validateStep(step, draft);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length));
  }

  function handleBack() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1));
  }

  function handleMapPick() {
    if (!onRequestMapPick) return;
    onRequestMapPick((lat, lng) => {
      set('lat', lat.toFixed(6));
      set('lng', lng.toFixed(6));
    });
  }

  function handleSave() {
    const scored = calculateSiteScore(builtSite, allDCs);
    const finalSite: CandidateSite = {
      ...builtSite,
      scores: scored,
    };
    onSave(finalSite);
    setShowToast(true);
  }

  if (!isOpen) return null;

  const isLastStep = step === STEPS.length;
  const canPickMap = !!onRequestMapPick;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                  <Zap size={16} className="text-accent" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-sm">Add Candidate Site</h2>
                  <p className="text-muted text-[11px]">
                    {draft.name.trim() ? `"${draft.name}"` : 'New site'}
                    {draft.city.trim() ? ` · ${draft.city}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-muted hover:text-white p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <StepProgress current={step} />
          </div>

          {/* Map pick banner (step 1 only) */}
          {step === 1 && (
            <div className="px-6 pt-4 shrink-0">
              <div className="flex items-center gap-2 bg-accent/5 border border-accent/20 rounded-xl px-4 py-2.5">
                <MapPin size={13} className="text-accent shrink-0" />
                <p className="text-xs text-accent/90 flex-1">
                  Tip: open the Map View and click a location to get precise coordinates.
                </p>
                {canPickMap && (
                  <button
                    type="button"
                    onClick={handleMapPick}
                    className="text-xs text-white bg-accent hover:bg-accent-hover px-2.5 py-1 rounded-lg transition-colors shrink-0"
                  >
                    Pick from map
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Scrollable step content */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
            {step === 1 && <Step1 draft={draft} set={set} errors={errors} />}
            {step === 2 && <Step2 draft={draft} set={set} errors={errors} />}
            {step === 3 && <Step3 draft={draft} set={set} errors={errors} />}
            {step === 4 && <Step4 draft={draft} set={set} />}
            {step === 5 && (
              <Step5 draft={draft} set={set} site={builtSite} allDCs={allDCs} />
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3 bg-bg/50">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-muted hover:text-white hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft size={15} /> Back
            </button>

            <span className="text-[10px] text-muted">Step {step} of {STEPS.length}</span>

            {isLastStep ? (
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-white transition-colors"
              >
                <Check size={14} /> Save Site
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-white transition-colors"
              >
                Next <ChevronRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {showToast && (
        <SaveToast
          name={draft.name.trim() || 'Unnamed Site'}
          onDone={() => { setShowToast(false); onClose(); }}
        />
      )}
    </>
  );
}
