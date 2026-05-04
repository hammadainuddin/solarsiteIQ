import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import {
  ChevronDown, ChevronRight, ChevronLeft,
  Play, RotateCcw, Download, Info, AlertTriangle, X as XIcon,
} from 'lucide-react';
import {
  runFinancialModel,
  generateScenarios,
  calcBYOPCapex,
} from '../utils/financial';
import type { DCFInputs, DCFOutputs, DCFYearData, ScenarioSet } from '../utils/financial';
import { useAppContext } from '../context/AppContext';
import { BenchmarkSection, type UserMetrics } from '../components/BenchmarkSection';
import type { BenchmarkCategory, BenchmarkRegion } from '../data/benchmarks';

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────

type FormState = Omit<DCFInputs, 'utilisationYear' | 'wacc' | 'requiredEquityReturn'> & {
  utilisationYearPct: [number, number, number, number, number, number, number];
  wacc: number;               // e.g. 8 = 8%
  requiredEquityReturn: number; // e.g. 15 = 15%
};

const COUNTRY_TAX: Record<string, number> = {
  MY: 24, SG: 17, ID: 25, TH: 20, PH: 25, VN: 20,
};

const COUNTRY_LABELS: Record<string, string> = {
  MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia',
  TH: 'Thailand', PH: 'Philippines', VN: 'Vietnam',
};

const VIEW_DEFAULTS: FormState = {
  projectName: 'DC Campus — Johor Bahru',
  country: 'MY',
  totalCapacityMW: 100,
  phases: 2,
  phase1CapacityMW: 50,
  phase1COD: 2026,
  constructionPeriodMonths: 30,
  landCostUSDTotal: 15_000_000,
  civils_capex_per_kw: 400,
  mechanical_capex_per_kw: 600,
  electrical_capex_per_kw: 500,
  powerInfra_capex_per_MW: 800_000,
  contingencyPct: 10,
  rackRateUSD_kW_month: 120,
  utilisationYearPct: [20, 40, 60, 75, 85, 90, 90],
  contractEscalationPctPA: 2.0,
  avgContractYears: 5,
  pue: 1.40,
  powerCostUSD_kWh: 0.065,
  staffingUSD_MW_year: 55_000,
  maintenancePctCapex: 1.0,
  insurancePctCapex: 0.4,
  propertyTaxUSDYear: 180_000,
  equityPct: 30,
  debtInterestRatePct: 5.5,
  debtTenorYears: 15,
  debtGracePeriodYears: 2,
  taxRatePct: 24,
  depreciationYears: 20,
  wacc: 8,
  requiredEquityReturn: 15,

  // BYOP — disabled by default
  byopEnabled: false,
  solarCapacityMWdc: 0,
  solarCapacityFactorPct: 18,
  solarCapexUSD_Wdc: 0.85,
  solarOpexUSD_kWyr: 12,
  batteryStorageMWh: 0,
  batteryCapexUSD_kWh: 280,
  batteryRoundTripPct: 88,
  gridDisplacementPct: 0,
};

function toModelInputs(f: FormState): DCFInputs {
  return {
    ...f,
    utilisationYear: f.utilisationYearPct.map(v => v / 100) as [number, number, number, number, number, number, number],
    wacc: f.wacc / 100,
    requiredEquityReturn: f.requiredEquityReturn / 100,
  };
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#0D1117', border: '1px solid #1F2937', borderRadius: 8 },
  labelStyle: { color: '#E5E7EB', fontSize: 11 },
  itemStyle: { color: '#9CA3AF', fontSize: 11 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sensitivity analysis — pure computation (no React)
// ─────────────────────────────────────────────────────────────────────────────

interface TornadoRow {
  label: string;
  baseIRR: number;
  upIRR: number;   // IRR when variable moves in favorable direction (+20% rack, −20% capex, etc.)
  downIRR: number; // IRR when variable moves in unfavorable direction
  upLabel: string;
  downLabel: string;
  absSwing: number; // max(|upIRR−base|, |downIRR−base|) — used for sort order
}

interface HeatmapCell {
  rackRate: number;
  utilisation: number; // 0-1
  equityIRR: number;
}

interface SensitivityData {
  baseIRR: number;
  tornado: TornadoRow[];
  heatmap: HeatmapCell[];
}

interface BreakEvenData {
  minRackRateFor12pct: number | null;   // $/kW/month
  minUtilisationForDSCR: number | null; // % stabilised util for DSCR > 1.0
  maxCapexPerKwFor10pct: number | null; // $ total capex/kW (excl land)
}

function safeIRR(inp: DCFInputs): number {
  try { return runFinancialModel(inp).equityIRRPct; } catch { return NaN; }
}

/** Scale all utilisation values ±f, clamped to [0.05, 1]. */
function scaleUtil(inp: DCFInputs, f: number): DCFInputs {
  return {
    ...inp,
    utilisationYear: inp.utilisationYear.map(v =>
      Math.max(0.05, Math.min(1, v * f))
    ) as DCFInputs['utilisationYear'],
  };
}

/** Scale all construction capex lines (civils + mech + elec + powerInfra, not land) ±f. */
function scaleConstructionCapex(inp: DCFInputs, f: number): DCFInputs {
  return {
    ...inp,
    civils_capex_per_kw:      inp.civils_capex_per_kw      * f,
    mechanical_capex_per_kw:  inp.mechanical_capex_per_kw  * f,
    electrical_capex_per_kw:  inp.electrical_capex_per_kw  * f,
    powerInfra_capex_per_MW:  inp.powerInfra_capex_per_MW  * f,
  };
}

/** Scale all capex lines including land. */
function scaleAllCapex(inp: DCFInputs, f: number): DCFInputs {
  return {
    ...scaleConstructionCapex(inp, f),
    landCostUSDTotal: inp.landCostUSDTotal * f,
  };
}

function computeTornado(inp: DCFInputs): SensitivityData {
  const baseIRR = safeIRR(inp);

  const rows: Omit<TornadoRow, 'absSwing'>[] = [
    {
      label: 'Rack Rate',
      upIRR:   safeIRR({ ...inp, rackRateUSD_kW_month: inp.rackRateUSD_kW_month * 1.2 }),
      downIRR: safeIRR({ ...inp, rackRateUSD_kW_month: inp.rackRateUSD_kW_month * 0.8 }),
      baseIRR,
      upLabel: `+20% rack ($${(inp.rackRateUSD_kW_month * 1.2).toFixed(0)}/kW)`,
      downLabel: `−20% rack ($${(inp.rackRateUSD_kW_month * 0.8).toFixed(0)}/kW)`,
    },
    {
      label: 'Total Capex',
      upIRR:   safeIRR(scaleAllCapex(inp, 0.8)),
      downIRR: safeIRR(scaleAllCapex(inp, 1.2)),
      baseIRR,
      upLabel: '−20% capex',
      downLabel: '+20% capex',
    },
    {
      label: 'Utilisation Ramp',
      upIRR:   safeIRR(scaleUtil(inp, 1.2)),
      downIRR: safeIRR(scaleUtil(inp, 0.8)),
      baseIRR,
      upLabel: '+20% utilisation',
      downLabel: '−20% utilisation',
    },
    {
      label: 'Power Cost (PUE × tariff)',
      upIRR:   safeIRR({ ...inp, powerCostUSD_kWh: inp.powerCostUSD_kWh * 0.8 }),
      downIRR: safeIRR({ ...inp, powerCostUSD_kWh: inp.powerCostUSD_kWh * 1.2 }),
      baseIRR,
      upLabel: `−20% power cost ($${(inp.powerCostUSD_kWh * 0.8).toFixed(3)}/kWh)`,
      downLabel: `+20% power cost ($${(inp.powerCostUSD_kWh * 1.2).toFixed(3)}/kWh)`,
    },
    {
      label: 'Interest Rate',
      upIRR:   safeIRR({ ...inp, debtInterestRatePct: inp.debtInterestRatePct * 0.8 }),
      downIRR: safeIRR({ ...inp, debtInterestRatePct: inp.debtInterestRatePct * 1.2 }),
      baseIRR,
      upLabel: `−20% rate (${(inp.debtInterestRatePct * 0.8).toFixed(1)}%)`,
      downLabel: `+20% rate (${(inp.debtInterestRatePct * 1.2).toFixed(1)}%)`,
    },
    {
      label: 'Construction Overrun',
      upIRR:   safeIRR(scaleConstructionCapex(inp, 0.8)),
      downIRR: safeIRR(scaleConstructionCapex(inp, 1.2)),
      baseIRR,
      upLabel: '−20% build cost',
      downLabel: '+20% overrun',
    },
  ];

  const tornado: TornadoRow[] = rows
    .map(r => ({
      ...r,
      absSwing: Math.max(
        Math.abs(isNaN(r.upIRR) ? 0 : r.upIRR - baseIRR),
        Math.abs(isNaN(r.downIRR) ? 0 : r.downIRR - baseIRR),
      ),
    }))
    .sort((a, b) => b.absSwing - a.absSwing);

  const RACK_RATES = [80, 90, 100, 110, 120, 130, 140, 150, 160];
  const UTILS = [0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95];

  const heatmap: HeatmapCell[] = [];
  for (const rr of RACK_RATES) {
    for (const u of UTILS) {
      const scaledUtil = inp.utilisationYear.map((v, i) =>
        i >= 5 ? u : Math.min(u, v * (u / (inp.utilisationYear[6] || 0.9 || 1)))
      ) as DCFInputs['utilisationYear'];
      const irr = safeIRR({ ...inp, rackRateUSD_kW_month: rr, utilisationYear: scaledUtil });
      heatmap.push({ rackRate: rr, utilisation: u, equityIRR: irr });
    }
  }

  return { baseIRR, tornado, heatmap };
}

/** Bisect helper — finds x in [lo, hi] where f(x) = target. Returns null if no solution. */
function bisect(
  f: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  maxIter = 60,
): number | null {
  let flo = f(lo) - target;
  let fhi = f(hi) - target;
  if (flo * fhi > 0) return null; // no sign change
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid) - target;
    if (Math.abs(hi - lo) < 0.01) return mid;
    if (flo * fmid <= 0) { hi = mid; fhi = fmid; }
    else { lo = mid; flo = fmid; }
  }
  return (lo + hi) / 2;
}

function computeBreakEven(inp: DCFInputs): BreakEvenData {
  // 1. Min rack rate for 12% equity IRR
  const minRackRateFor12pct = bisect(
    rr => safeIRR({ ...inp, rackRateUSD_kW_month: rr }),
    12,
    30,
    350,
  );

  // 2. Min stabilised utilisation (year 6+) for min DSCR > 1.0
  // Scale all utilisation proportionally from the year-6+ anchors
  const baseStabUtil = inp.utilisationYear[6];
  const minUtilisationForDSCR = bisect(
    u => {
      const scale = u / (baseStabUtil || 0.9);
      const scaledUtil = inp.utilisationYear.map((v, i) =>
        Math.max(0.05, Math.min(1, i >= 5 ? u : v * scale))
      ) as DCFInputs['utilisationYear'];
      try {
        return runFinancialModel({ ...inp, utilisationYear: scaledUtil }).minDSCR;
      } catch { return 0; }
    },
    1.0,
    0.2,
    1.0,
  );

  // 3. Max total capex/kW (construction only, excl land/contingency) for 10% equity IRR
  //    Search on a multiplier, then back-calculate effective $/kW
  const baseConstCapexKw = inp.civils_capex_per_kw + inp.mechanical_capex_per_kw + inp.electrical_capex_per_kw;
  const maxCapexMultiplier = bisect(
    mult => safeIRR(scaleConstructionCapex(inp, mult)),
    10,
    0.3,
    6.0,
  );
  const maxCapexPerKwFor10pct = maxCapexMultiplier != null
    ? Math.round(baseConstCapexKw * maxCapexMultiplier)
    : null;

  return {
    minRackRateFor12pct: minRackRateFor12pct != null ? Math.round(minRackRateFor12pct) : null,
    minUtilisationForDSCR: minUtilisationForDSCR != null ? Math.round(minUtilisationForDSCR * 100) : null,
    maxCapexPerKwFor10pct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components — all hoisted to module level
// ─────────────────────────────────────────────────────────────────────────────

interface InputRowProps {
  label: string;
  unit?: string;
  tooltip?: string;
  children: React.ReactNode;
}

function InputRow({ label, unit, tooltip, children }: InputRowProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">{label}</span>
          {tooltip && (
            <button
              onClick={() => setShow(s => !s)}
              className="text-muted hover:text-white transition-colors"
            >
              <Info size={11} />
            </button>
          )}
        </div>
        {unit && <span className="text-xs text-muted font-mono">{unit}</span>}
      </div>
      {show && tooltip && (
        <p className="text-xs text-muted bg-surface rounded p-2 mb-1 leading-relaxed">{tooltip}</p>
      )}
      {children}
    </div>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}

function NumberInput({ value, onChange, step = 1, min, max, className = '' }: NumberInputProps) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={`w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-accent ${className}`}
    />
  );
}

interface AccordionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Accordion({ title, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-white uppercase tracking-wider hover:bg-surface-2 transition-colors"
      >
        {title}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="px-4 pb-3 space-y-0.5">{children}</div>}
    </div>
  );
}

interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  status?: 'green' | 'amber' | 'red' | 'neutral';
}

function KPICard({ label, value, sub, status = 'neutral' }: KPICardProps) {
  const statusColor = {
    green: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    neutral: 'text-white',
  }[status];
  const borderColor = {
    green: 'border-emerald-500/30',
    amber: 'border-amber-500/30',
    red: 'border-red-500/30',
    neutral: 'border-border',
  }[status];
  return (
    <div className={`bg-surface border ${borderColor} rounded-xl p-4 flex flex-col gap-1`}>
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold font-mono ${statusColor}`}>{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function irrStatus(pct: number): 'green' | 'amber' | 'red' {
  if (pct >= 15) return 'green';
  if (pct >= 10) return 'amber';
  return 'red';
}

function dscrStatus(dscr: number): 'green' | 'amber' | 'red' {
  if (dscr >= 1.3) return 'green';
  if (dscr >= 1.1) return 'amber';
  return 'red';
}

function dscrBarColor(dscr: number): string {
  if (dscr >= 1.3) return '#10B981';
  if (dscr >= 1.1) return '#F59E0B';
  return '#EF4444';
}

// ─────────────────────────────────────────────────────────────────────────────
// TornadoChart — SVG horizontal bar chart centered on baseIRR
// ─────────────────────────────────────────────────────────────────────────────

const TORNADO_ROW_H = 28;
const TORNADO_LABEL_W = 160;
const TORNADO_CHART_W = 480;
const TORNADO_PADDING = 12;

interface TornadoChartProps {
  data: TornadoRow[];
  baseIRR: number;
}

function TornadoChart({ data, baseIRR }: TornadoChartProps) {
  const [hovered, setHovered] = useState<{ row: TornadoRow; side: 'up' | 'down'; x: number; y: number } | null>(null);

  // Determine scale: min/max IRR across all up/down values + base
  const allVals = [baseIRR, ...data.flatMap(r => [r.upIRR, r.downIRR].filter(v => !isNaN(v)))];
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = Math.max(maxVal - minVal, 2);
  const padded = range * 1.1;

  function toX(irr: number): number {
    return TORNADO_PADDING + ((irr - (baseIRR - padded / 2)) / padded) * TORNADO_CHART_W;
  }
  const baseX = toX(baseIRR);

  const svgH = data.length * TORNADO_ROW_H + 28;

  // Axis tick values
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    baseIRR - padded / 2 + (padded / (tickCount - 1)) * i
  );

  return (
    <div className="relative" onMouseLeave={() => setHovered(null)}>
      <div className="flex">
        {/* Labels */}
        <div style={{ width: TORNADO_LABEL_W, flexShrink: 0 }} className="flex flex-col justify-start pt-6">
          {data.map((row, i) => (
            <div
              key={row.label}
              style={{ height: TORNADO_ROW_H, lineHeight: `${TORNADO_ROW_H}px` }}
              className="text-xs text-muted text-right pr-3 truncate"
            >
              {row.label}
            </div>
          ))}
        </div>

        {/* SVG chart area */}
        <svg
          width={TORNADO_CHART_W + TORNADO_PADDING * 2}
          height={svgH}
          className="overflow-visible"
        >
          {/* Axis ticks + labels */}
          {ticks.map((t, i) => {
            const x = toX(t);
            return (
              <g key={i}>
                <line x1={x} y1={20} x2={x} y2={svgH - 4} stroke="#1F2937" strokeWidth={1} />
                <text x={x} y={14} textAnchor="middle" fontSize={9} fill="#6B7280">
                  {t.toFixed(1)}%
                </text>
              </g>
            );
          })}

          {/* Rows */}
          {data.map((row, i) => {
            const y = 20 + i * TORNADO_ROW_H + TORNADO_ROW_H / 2 - 8;
            const barH = 16;

            const upX1 = Math.min(baseX, toX(isNaN(row.upIRR) ? baseIRR : row.upIRR));
            const upX2 = Math.max(baseX, toX(isNaN(row.upIRR) ? baseIRR : row.upIRR));
            const downX1 = Math.min(baseX, toX(isNaN(row.downIRR) ? baseIRR : row.downIRR));
            const downX2 = Math.max(baseX, toX(isNaN(row.downIRR) ? baseIRR : row.downIRR));

            const upColor = row.upIRR >= baseIRR ? '#3B82F6' : '#EF4444';
            const downColor = row.downIRR <= baseIRR ? '#EF4444' : '#3B82F6';

            return (
              <g key={row.label}>
                {/* Upside bar */}
                <rect
                  x={upX1} y={y} width={Math.max(upX2 - upX1, 2)} height={barH}
                  fill={upColor} opacity={0.85} rx={2}
                  className="cursor-pointer"
                  onMouseEnter={e => setHovered({ row, side: 'up', x: e.clientX, y: e.clientY })}
                />
                {/* Downside bar */}
                <rect
                  x={downX1} y={y} width={Math.max(downX2 - downX1, 2)} height={barH}
                  fill={downColor} opacity={0.55} rx={2}
                  className="cursor-pointer"
                  onMouseEnter={e => setHovered({ row, side: 'down', x: e.clientX, y: e.clientY })}
                />
                {/* IRR labels on bars */}
                {upX2 - upX1 > 28 && (
                  <text
                    x={(upX1 + upX2) / 2} y={y + barH / 2 + 3.5}
                    textAnchor="middle" fontSize={9} fill="#fff" fontWeight={600}
                  >
                    {isNaN(row.upIRR) ? '–' : row.upIRR.toFixed(1) + '%'}
                  </text>
                )}
                {downX2 - downX1 > 28 && (
                  <text
                    x={(downX1 + downX2) / 2} y={y + barH / 2 + 3.5}
                    textAnchor="middle" fontSize={9} fill="#fff" fontWeight={500} opacity={0.9}
                  >
                    {isNaN(row.downIRR) ? '–' : row.downIRR.toFixed(1) + '%'}
                  </text>
                )}
              </g>
            );
          })}

          {/* Base IRR line */}
          <line x1={baseX} y1={18} x2={baseX} y2={svgH - 4} stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={baseX} y={14} textAnchor="middle" fontSize={9} fill="#F59E0B" fontWeight={600}>
            Base {baseIRR.toFixed(1)}%
          </text>
        </svg>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="fixed z-50 bg-surface border border-border rounded-lg px-3 py-2 text-xs pointer-events-none shadow-lg"
          style={{ left: hovered.x + 12, top: hovered.y - 40 }}
        >
          <p className="text-white font-semibold mb-0.5">{hovered.row.label}</p>
          {hovered.side === 'up' ? (
            <>
              <p className="text-muted">{hovered.row.upLabel}</p>
              <p className="text-blue-400 font-mono">IRR: {isNaN(hovered.row.upIRR) ? 'N/A' : hovered.row.upIRR.toFixed(1) + '%'}</p>
              <p className="text-muted">Δ {isNaN(hovered.row.upIRR) ? '–' : (hovered.row.upIRR - hovered.row.baseIRR > 0 ? '+' : '') + (hovered.row.upIRR - hovered.row.baseIRR).toFixed(1) + 'pp'}</p>
            </>
          ) : (
            <>
              <p className="text-muted">{hovered.row.downLabel}</p>
              <p className="text-red-400 font-mono">IRR: {isNaN(hovered.row.downIRR) ? 'N/A' : hovered.row.downIRR.toFixed(1) + '%'}</p>
              <p className="text-muted">Δ {isNaN(hovered.row.downIRR) ? '–' : (hovered.row.downIRR - hovered.row.baseIRR > 0 ? '+' : '') + (hovered.row.downIRR - hovered.row.baseIRR).toFixed(1) + 'pp'}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeatmapChart — rack rate × stabilised utilisation → Equity IRR
// ─────────────────────────────────────────────────────────────────────────────

const RACK_RATES_HM = [80, 90, 100, 110, 120, 130, 140, 150, 160];
const UTILS_HM = [0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60]; // top-to-bottom (highest first)

function irrToColor(irr: number): string {
  if (isNaN(irr)) return '#1F2937';
  if (irr >= 12) {
    // amber→green interpolation 12→20%
    const t = Math.min((irr - 12) / 8, 1);
    const r = Math.round(245 + (16 - 245) * t);
    const g = Math.round(158 + (185 - 158) * t);
    const b = Math.round(11 + (129 - 11) * t);
    return `rgb(${r},${g},${b})`;
  }
  if (irr >= 8) {
    // red→amber interpolation 8→12%
    const t = (irr - 8) / 4;
    const r = Math.round(239 + (245 - 239) * t);
    const g = Math.round(68 + (158 - 68) * t);
    const b = Math.round(68 + (11 - 68) * t);
    return `rgb(${r},${g},${b})`;
  }
  return '#EF4444';
}

interface HeatmapChartProps {
  cells: HeatmapCell[];
}

function HeatmapChart({ cells }: HeatmapChartProps) {
  const [tooltip, setTooltip] = useState<{ cell: HeatmapCell; x: number; y: number } | null>(null);

  const cellMap = new Map(
    cells.map(c => [`${c.rackRate}_${c.utilisation.toFixed(2)}`, c])
  );

  return (
    <div className="relative" onMouseLeave={() => setTooltip(null)}>
      <div className="flex gap-2">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-around py-5" style={{ width: 52 }}>
          {UTILS_HM.map(u => (
            <div key={u} className="text-xs text-muted text-right font-mono" style={{ fontSize: 10 }}>
              {(u * 100).toFixed(0)}%
            </div>
          ))}
        </div>

        {/* Grid */}
        <div>
          {/* X-axis labels */}
          <div className="flex mb-1">
            {RACK_RATES_HM.map(rr => (
              <div
                key={rr}
                className="text-center font-mono text-muted"
                style={{ width: 46, fontSize: 9 }}
              >
                ${rr}
              </div>
            ))}
          </div>

          {/* Cells */}
          {UTILS_HM.map(u => (
            <div key={u} className="flex">
              {RACK_RATES_HM.map(rr => {
                const cell = cellMap.get(`${rr}_${u.toFixed(2)}`);
                const irr = cell?.equityIRR ?? NaN;
                return (
                  <div
                    key={rr}
                    style={{
                      width: 46, height: 32,
                      background: irrToColor(irr),
                      cursor: 'pointer',
                    }}
                    className="flex items-center justify-center border border-bg/30 transition-opacity hover:opacity-80"
                    onMouseEnter={e => cell && setTooltip({ cell, x: e.clientX, y: e.clientY })}
                    onMouseMove={e => cell && setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                  >
                    <span className="text-white font-mono font-semibold drop-shadow" style={{ fontSize: 9 }}>
                      {isNaN(irr) ? '–' : irr.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* X-axis title */}
          <p className="text-xs text-muted text-center mt-2">Rack Rate ($/kW/month)</p>
        </div>

        {/* Y-axis title (rotated) */}
        <div className="flex items-center ml-1">
          <span
            className="text-xs text-muted"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}
          >
            Stabilised Utilisation
          </span>
        </div>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-3 mt-3 ml-14">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span className="text-xs text-muted">&lt; 8%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-amber-500" />
          <span className="text-xs text-muted">8–12%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          <span className="text-xs text-muted">&gt; 12%</span>
        </div>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-surface border border-border rounded-lg px-3 py-2 text-xs pointer-events-none shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 56 }}
        >
          <p className="text-white font-semibold">
            At ${tooltip.cell.rackRate}/kW, {(tooltip.cell.utilisation * 100).toFixed(0)}% utilisation
          </p>
          <p className="text-muted mt-0.5">
            Equity IRR ={' '}
            <span className="font-mono" style={{ color: irrToColor(tooltip.cell.equityIRR) }}>
              {isNaN(tooltip.cell.equityIRR) ? 'N/A' : tooltip.cell.equityIRR.toFixed(1) + '%'}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV export helper
// ─────────────────────────────────────────────────────────────────────────────

function exportCSV(yearlyData: DCFYearData[]) {
  const headers = [
    'Year', 'Calendar Year', 'Capacity MW', 'Utilisation %',
    'Revenue $M', 'EBITDA $M', 'EBITDA %', 'Project FCF $M',
    'Debt Service $M', 'DSCR', 'Cum Equity CF $M',
  ];
  const rows = yearlyData
    .filter(r => r.year > 0)
    .map(r => [
      r.year, r.calendarYear, r.capacityMW, (r.utilisationPct * 100).toFixed(1),
      r.revenueUSDM.toFixed(2), r.ebitdaUSDM.toFixed(2),
      r.ebitdaMarginPct.toFixed(1), r.projectFcfUSDM.toFixed(2),
      r.totalDebtServiceUSDM.toFixed(2),
      r.dscrRatio != null ? r.dscrRatio.toFixed(2) : 'N/A',
      r.cumulativeEquityCfUSDM.toFixed(2),
    ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dc_financial_model.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function FinancialView() {
  const [form, setForm] = useState<FormState>(VIEW_DEFAULTS);
  const [outputs, setOutputs] = useState<DCFOutputs | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioSet | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chartMode, setChartMode] = useState<'absolute' | 'margin'>('absolute');
  const [tableOpen, setTableOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [sensitivity, setSensitivity] = useState<SensitivityData | null>(null);
  const [modelWarning, setModelWarning] = useState<string | null>(null);
  const runRef = useRef(0);

  // Break-even recomputes live from form state (3 bisections ≈ ~90 model runs, fast)
  const breakEven = useMemo<BreakEvenData>(() => {
    try { return computeBreakEven(toModelInputs(form)); }
    catch { return { minRackRateFor12pct: null, minUtilisationForDSCR: null, maxCapexPerKwFor10pct: null }; }
  }, [form]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const setUtil = useCallback((i: number, v: number) => {
    setForm(prev => {
      const u = [...prev.utilisationYearPct] as [number, number, number, number, number, number, number];
      u[i] = v;
      return { ...prev, utilisationYearPct: u };
    });
  }, []);

  const handleCountryChange = useCallback((country: string) => {
    setForm(prev => ({
      ...prev,
      country,
      taxRatePct: COUNTRY_TAX[country] ?? prev.taxRatePct,
    }));
  }, []);

  const { setLastDCFRun } = useAppContext();

  const handleRun = useCallback(() => {
    setRunning(true);
    const token = ++runRef.current;
    setTimeout(() => {
      if (token !== runRef.current) return;
      try {
        const inp = toModelInputs(form);
        const out = runFinancialModel(inp);
        const scen = generateScenarios(inp);
        const sens = computeTornado(inp);
        setOutputs(out);
        setScenarios(scen);
        setSensitivity(sens);
        setLastDCFRun({ inputs: inp, outputs: out, timestamp: Date.now() });

        // Post-run warnings
        if (out.equityIRRPct > 50) {
          setModelWarning('Equity IRR > 50% — unusually high. Verify capex, rack rate, and utilisation inputs.');
        } else if (isNaN(out.equityIRRPct)) {
          const allFCFNeg = out.yearlyData.filter(r => r.year > 0).every(r => r.equityCfUSDM < 0);
          if (allFCFNeg) {
            setModelWarning('Project cashflow is negative in all years — revenue assumptions may be too low or capex too high. Check rack rate and utilisation ramp.');
          } else {
            setModelWarning('Equity IRR did not converge — the model may have multiple IRR solutions. Try adjusting the financing structure or utilisation ramp.');
          }
        } else {
          setModelWarning(null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setModelWarning(`Model computation error: ${msg}. Check that all inputs are positive and valid.`);
        console.error('Financial model error:', e);
      }
      setRunning(false);
    }, 50);
  }, [form]);

  const handleReset = useCallback(() => {
    setForm(VIEW_DEFAULTS);
    setOutputs(null);
    setScenarios(null);
    setSensitivity(null);
    setModelWarning(null);
  }, []);

  // ── Sidebar ────────────────────────────────────────────────────────────────

  const sidebar = (
    <aside
      className={`${sidebarOpen ? 'w-80' : 'w-0'} shrink-0 bg-surface border-r border-border flex flex-col overflow-hidden transition-all duration-200`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-white uppercase tracking-wider">Model Inputs</span>
        <button onClick={() => setSidebarOpen(false)} className="text-muted hover:text-white">
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Project */}
        <Accordion title="Project" defaultOpen>
          <InputRow label="Project Name">
            <input
              type="text"
              value={form.projectName}
              onChange={e => set('projectName', e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-accent"
            />
          </InputRow>
          <InputRow label="Country">
            <select
              value={form.country}
              onChange={e => handleCountryChange(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-accent"
            >
              {Object.entries(COUNTRY_LABELS).map(([code, name]) => (
                <option key={code} value={code}>{name} ({code})</option>
              ))}
            </select>
          </InputRow>
          <InputRow label="Total Capacity" unit="MW">
            <NumberInput value={form.totalCapacityMW} onChange={v => set('totalCapacityMW', v)} step={5} min={10} max={500} />
          </InputRow>
          <InputRow label="Phase 1 Capacity" unit="MW">
            <NumberInput value={form.phase1CapacityMW} onChange={v => set('phase1CapacityMW', v)} step={5} min={10} />
          </InputRow>
          <InputRow label="Phase 1 COD" unit="year">
            <NumberInput value={form.phase1COD} onChange={v => set('phase1COD', v)} step={1} min={2024} max={2035} />
          </InputRow>
          <InputRow label="Construction Period" unit="months">
            <NumberInput value={form.constructionPeriodMonths} onChange={v => set('constructionPeriodMonths', v)} step={3} min={12} max={60} />
          </InputRow>
        </Accordion>

        {/* Capex */}
        <Accordion title="Capex" defaultOpen>
          <InputRow
            label="Land Cost"
            unit="USD total"
            tooltip="Total land acquisition cost. For Johor Bahru industrial land, ~$1M/ha at 15ha is typical."
          >
            <NumberInput value={form.landCostUSDTotal} onChange={v => set('landCostUSDTotal', v)} step={500_000} min={0} />
          </InputRow>
          <InputRow label="Civils" unit="$/kW" tooltip="Site prep, structural works, shell. JB: $350–450/kW.">
            <NumberInput value={form.civils_capex_per_kw} onChange={v => set('civils_capex_per_kw', v)} step={10} min={100} />
          </InputRow>
          <InputRow label="Mechanical" unit="$/kW" tooltip="Cooling plant, CRAC/CRAH, piping. JB: $550–650/kW.">
            <NumberInput value={form.mechanical_capex_per_kw} onChange={v => set('mechanical_capex_per_kw', v)} step={10} min={100} />
          </InputRow>
          <InputRow label="Electrical" unit="$/kW" tooltip="UPS, PDU, gensets, LV switchgear. JB: $450–550/kW.">
            <NumberInput value={form.electrical_capex_per_kw} onChange={v => set('electrical_capex_per_kw', v)} step={10} min={100} />
          </InputRow>
          <InputRow label="Power Infra" unit="$/MW" tooltip="132/275kV grid connection, transformers, cable. JB: $700k–$1M/MW.">
            <NumberInput value={form.powerInfra_capex_per_MW} onChange={v => set('powerInfra_capex_per_MW', v)} step={50_000} min={0} />
          </InputRow>
          <InputRow label="Contingency" unit="%" tooltip="Applied to all cost lines above.">
            <NumberInput value={form.contingencyPct} onChange={v => set('contingencyPct', v)} step={1} min={0} max={30} />
          </InputRow>
        </Accordion>

        {/* Revenue */}
        <Accordion title="Revenue" defaultOpen>
          <InputRow label="Rack Rate" unit="$/kW/mo" tooltip="Colocation power pricing at COD. JB hyperscale: $110–130/kW/mo.">
            <NumberInput value={form.rackRateUSD_kW_month} onChange={v => set('rackRateUSD_kW_month', v)} step={5} min={50} max={300} />
          </InputRow>
          <InputRow label="Contract Escalation" unit="%/yr" tooltip="Annual price escalation built into customer contracts.">
            <NumberInput value={form.contractEscalationPctPA} onChange={v => set('contractEscalationPctPA', v)} step={0.5} min={0} max={10} />
          </InputRow>
          <InputRow label="Avg Contract Length" unit="years">
            <NumberInput value={form.avgContractYears} onChange={v => set('avgContractYears', v)} step={1} min={1} max={15} />
          </InputRow>
          <div className="py-1">
            <p className="text-xs text-muted mb-2">Utilisation Ramp (%)</p>
            <div className="grid grid-cols-7 gap-0.5">
              {form.utilisationYearPct.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span className="text-xs text-muted font-mono">{v}</span>
                  <input
                    type="number"
                    value={v}
                    min={0}
                    max={100}
                    step={5}
                    onChange={e => setUtil(i, parseFloat(e.target.value) || 0)}
                    className="w-full bg-surface-2 border border-border rounded px-1 py-0.5 text-xs text-white font-mono text-center focus:outline-none focus:border-accent"
                  />
                  <span className="text-xs text-muted">Y{i + 1}{i === 6 ? '+' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </Accordion>

        {/* Opex */}
        <Accordion title="Operating Costs">
          <InputRow label="PUE" tooltip="Power Usage Effectiveness. JB modern facility: 1.3–1.45.">
            <NumberInput value={form.pue} onChange={v => set('pue', v)} step={0.05} min={1.1} max={2.5} />
          </InputRow>
          <InputRow label="Power Cost" unit="$/kWh" tooltip="TNB industrial tariff. JB: ~$0.065–0.085/kWh.">
            <NumberInput value={form.powerCostUSD_kWh} onChange={v => set('powerCostUSD_kWh', v)} step={0.005} min={0.01} max={0.3} />
          </InputRow>
          <InputRow label="Staffing" unit="$/MW/yr" tooltip="Fully-loaded staff cost per MW facility capacity.">
            <NumberInput value={form.staffingUSD_MW_year} onChange={v => set('staffingUSD_MW_year', v)} step={5_000} min={0} />
          </InputRow>
          <InputRow label="Maintenance" unit="% capex" tooltip="Annual maintenance as % of total capex.">
            <NumberInput value={form.maintenancePctCapex} onChange={v => set('maintenancePctCapex', v)} step={0.1} min={0} max={5} />
          </InputRow>
          <InputRow label="Insurance" unit="% capex">
            <NumberInput value={form.insurancePctCapex} onChange={v => set('insurancePctCapex', v)} step={0.1} min={0} max={3} />
          </InputRow>
          <InputRow label="Property Tax" unit="$/yr">
            <NumberInput value={form.propertyTaxUSDYear} onChange={v => set('propertyTaxUSDYear', v)} step={10_000} min={0} />
          </InputRow>
        </Accordion>

        {/* Financing */}
        <Accordion title="Financing">
          <InputRow label="Equity Share" unit="%" tooltip="Equity as % of total capex. Project finance: 25–40%.">
            <NumberInput value={form.equityPct} onChange={v => set('equityPct', v)} step={5} min={10} max={100} />
          </InputRow>
          <InputRow label="Debt Rate" unit="%" tooltip="Annual interest on senior debt. SEA project finance: 4.5–6.5%.">
            <NumberInput value={form.debtInterestRatePct} onChange={v => set('debtInterestRatePct', v)} step={0.25} min={1} max={15} />
          </InputRow>
          <InputRow label="Debt Tenor" unit="years">
            <NumberInput value={form.debtTenorYears} onChange={v => set('debtTenorYears', v)} step={1} min={5} max={20} />
          </InputRow>
          <InputRow label="Grace Period" unit="years" tooltip="Interest-only period before principal repayment begins.">
            <NumberInput value={form.debtGracePeriodYears} onChange={v => set('debtGracePeriodYears', v)} step={1} min={0} max={5} />
          </InputRow>
          <InputRow label="Corporate Tax" unit="%" tooltip={`${COUNTRY_LABELS[form.country] || form.country}: ${COUNTRY_TAX[form.country] ?? '–'}%. Auto-filled from country selection.`}>
            <NumberInput value={form.taxRatePct} onChange={v => set('taxRatePct', v)} step={1} min={0} max={40} />
          </InputRow>
          <InputRow label="Depreciation" unit="years">
            <NumberInput value={form.depreciationYears} onChange={v => set('depreciationYears', v)} step={5} min={5} max={40} />
          </InputRow>
          <InputRow label="WACC" unit="%" tooltip="Weighted average cost of capital for project NPV.">
            <NumberInput value={form.wacc} onChange={v => set('wacc', v)} step={0.5} min={1} max={25} />
          </InputRow>
          <InputRow label="Required Equity Return" unit="%" tooltip="Hurdle rate for equity NPV calculation.">
            <NumberInput value={form.requiredEquityReturn} onChange={v => set('requiredEquityReturn', v)} step={1} min={5} max={35} />
          </InputRow>
        </Accordion>

        {/* Power Strategy — Bring Your Own Power */}
        <Accordion title="Power Strategy (BYOP)">
          <div className="py-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.byopEnabled}
                onChange={(e) => set('byopEnabled', e.target.checked)}
                className="w-3.5 h-3.5 accent-accent"
              />
              <span className="text-xs text-white">Enable on-site solar + battery</span>
            </label>
            <p className="text-[10px] text-muted mt-1 leading-relaxed">
              Adds capex for solar PV and battery storage; reduces grid energy purchases by the configured displacement target.
            </p>
          </div>

          {form.byopEnabled && (
            <>
              <InputRow label="Solar Capacity" unit="MW DC" tooltip="Installed PV nameplate. SEA hyperscalers: 20–100 MW typical.">
                <NumberInput value={form.solarCapacityMWdc} onChange={v => set('solarCapacityMWdc', v)} step={5} min={0} max={500} />
              </InputRow>
              <InputRow label="Solar Capacity Factor" unit="%" tooltip="Annual yield. Malaysia/Indonesia: 17–19%; Vietnam: 18–20%.">
                <NumberInput value={form.solarCapacityFactorPct} onChange={v => set('solarCapacityFactorPct', v)} step={0.5} min={10} max={25} />
              </InputRow>
              <InputRow label="Solar Capex" unit="$/W DC" tooltip="All-in EPC + interconnection. SEA utility-scale: $0.75–1.00/W DC.">
                <NumberInput value={form.solarCapexUSD_Wdc} onChange={v => set('solarCapexUSD_Wdc', v)} step={0.05} min={0.3} max={2} />
              </InputRow>
              <InputRow label="Solar O&M" unit="$/kW/yr" tooltip="Annual operations & maintenance per kW DC.">
                <NumberInput value={form.solarOpexUSD_kWyr} onChange={v => set('solarOpexUSD_kWyr', v)} step={1} min={0} max={50} />
              </InputRow>
              <InputRow label="Battery Storage" unit="MWh" tooltip="Energy capacity for time-shifting solar to night load.">
                <NumberInput value={form.batteryStorageMWh} onChange={v => set('batteryStorageMWh', v)} step={10} min={0} max={2000} />
              </InputRow>
              <InputRow label="Battery Capex" unit="$/kWh" tooltip="All-in BESS install. 2025 SEA: $250–320/kWh.">
                <NumberInput value={form.batteryCapexUSD_kWh} onChange={v => set('batteryCapexUSD_kWh', v)} step={10} min={100} max={600} />
              </InputRow>
              <InputRow label="Battery Round-Trip" unit="%" tooltip="Charge/discharge efficiency. Li-ion: 86–92%.">
                <NumberInput value={form.batteryRoundTripPct} onChange={v => set('batteryRoundTripPct', v)} step={1} min={70} max={95} />
              </InputRow>
              <InputRow label="Grid Displacement" unit="%" tooltip="Target share of DC load supplied by BYOP after firming. 30–60% typical.">
                <NumberInput value={form.gridDisplacementPct} onChange={v => set('gridDisplacementPct', v)} step={5} min={0} max={100} />
              </InputRow>
            </>
          )}
        </Accordion>
      </div>

      {/* Run / Reset */}
      <div className="px-4 py-4 border-t border-border space-y-2 shrink-0">
        <button
          onClick={handleRun}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          <Play size={15} />
          {running ? 'Running…' : 'Run Model'}
        </button>
        <button
          onClick={handleReset}
          className="w-full flex items-center justify-center gap-2 text-muted hover:text-white text-xs py-1.5 transition-colors"
        >
          <RotateCcw size={12} />
          Reset to Defaults
        </button>
      </div>
    </aside>
  );

  // ── KPI cards ──────────────────────────────────────────────────────────────

  const kpiRow = outputs ? (
    <div className="grid grid-cols-5 gap-3 px-6 py-4 shrink-0">
      <KPICard
        label="Total Capex"
        value={`$${outputs.totalCapexUSDM.toFixed(0)}M`}
        sub={`Equity $${outputs.equityContributionUSDM.toFixed(0)}M · Debt $${outputs.debtContributionUSDM.toFixed(0)}M`}
        status="neutral"
      />
      <KPICard
        label="Equity IRR"
        value={isNaN(outputs.equityIRRPct) ? 'N/A' : `${outputs.equityIRRPct.toFixed(1)}%`}
        sub={`NPV $${outputs.equityNPVUSDM.toFixed(0)}M · ${outputs.equityMultiple.toFixed(1)}×`}
        status={isNaN(outputs.equityIRRPct) ? 'red' : irrStatus(outputs.equityIRRPct)}
      />
      <KPICard
        label="Project IRR"
        value={isNaN(outputs.projectIRRPct) ? 'N/A' : `${outputs.projectIRRPct.toFixed(1)}%`}
        sub={`NPV $${outputs.projectNPVUSDM.toFixed(0)}M`}
        status={isNaN(outputs.projectIRRPct) ? 'red' : irrStatus(outputs.projectIRRPct)}
      />
      <KPICard
        label="Min DSCR"
        value={`${outputs.minDSCR.toFixed(2)}×`}
        sub={`Avg ${outputs.avgDSCR.toFixed(2)}× · Repaid Y${outputs.debtRepaidByYear ?? '–'}`}
        status={dscrStatus(outputs.minDSCR)}
      />
      <KPICard
        label="Payback"
        value={outputs.paybackPeriodYears != null ? `Y${outputs.paybackPeriodYears}` : 'N/A'}
        sub={`Stabilised EBITDA $${outputs.stabilisedEbitdaUSDM.toFixed(0)}M (${outputs.stabilisedEbitdaMarginPct.toFixed(0)}%)`}
        status={outputs.paybackPeriodYears != null && outputs.paybackPeriodYears <= 10 ? 'green' : outputs.paybackPeriodYears != null && outputs.paybackPeriodYears <= 14 ? 'amber' : 'red'}
      />
    </div>
  ) : (
    <div className="px-6 py-4 shrink-0">
      <div className="grid grid-cols-5 gap-3">
        {['Total Capex', 'Equity IRR', 'Project IRR', 'Min DSCR', 'Payback'].map(l => (
          <div key={l} className="bg-surface border border-border rounded-xl p-4 h-20 flex flex-col justify-center">
            <p className="text-xs text-muted uppercase tracking-wider mb-2">{l}</p>
            <div className="h-5 w-20 bg-surface-2 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );

  // ── Charts ─────────────────────────────────────────────────────────────────

  const yearlyOp = outputs?.yearlyData.filter(r => r.year > 0) ?? [];

  const chart1Data = yearlyOp.map(r => ({
    year: `Y${r.year}`,
    Revenue: chartMode === 'absolute' ? +r.revenueUSDM.toFixed(1) : 100,
    EBITDA: chartMode === 'absolute' ? +r.ebitdaUSDM.toFixed(1) : +r.ebitdaMarginPct.toFixed(1),
    FCF: chartMode === 'absolute' ? +r.projectFcfUSDM.toFixed(1) : +(r.projectFcfUSDM / r.revenueUSDM * 100).toFixed(1),
  }));

  const chart2Data = yearlyOp.map(r => ({
    year: `Y${r.year}`,
    CumEquityCF: +r.cumulativeEquityCfUSDM.toFixed(1),
  }));

  const chart3Data = yearlyOp
    .filter(r => r.dscrRatio != null)
    .map(r => ({
      year: `Y${r.year}`,
      DSCR: +(r.dscrRatio as number).toFixed(2),
    }));

  const scenChart = scenarios ? [
    {
      name: 'Equity IRR %',
      Base: +scenarios.base.outputs.equityIRRPct.toFixed(1),
      Bull: +scenarios.bull.outputs.equityIRRPct.toFixed(1),
      Bear: +scenarios.bear.outputs.equityIRRPct.toFixed(1),
    },
    {
      name: 'Project IRR %',
      Base: +scenarios.base.outputs.projectIRRPct.toFixed(1),
      Bull: +scenarios.bull.outputs.projectIRRPct.toFixed(1),
      Bear: +scenarios.bear.outputs.projectIRRPct.toFixed(1),
    },
    {
      name: 'Min DSCR ×10',
      Base: +(scenarios.base.outputs.minDSCR * 10).toFixed(1),
      Bull: +(scenarios.bull.outputs.minDSCR * 10).toFixed(1),
      Bear: +(scenarios.bear.outputs.minDSCR * 10).toFixed(1),
    },
  ] : [];

  const paybackYear = outputs?.paybackPeriodYears;

  const chartsSection = outputs ? (
    <div className="grid grid-cols-2 gap-4 px-6 pb-4 shrink-0">

      {/* Chart 1 — Revenue / EBITDA / FCF */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-white">Revenue · EBITDA · FCF</h3>
          <div className="flex rounded overflow-hidden border border-border text-xs">
            <button
              onClick={() => setChartMode('absolute')}
              className={`px-2 py-1 transition-colors ${chartMode === 'absolute' ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
            >
              $M
            </button>
            <button
              onClick={() => setChartMode('margin')}
              className={`px-2 py-1 transition-colors ${chartMode === 'margin' ? 'bg-accent text-white' : 'text-muted hover:text-white'}`}
            >
              %
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chart1Data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gEbt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gFcf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#6B7280' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {chartMode === 'absolute' && (
              <Area type="monotone" dataKey="Revenue" stroke="#3B82F6" fill="url(#gRev)" strokeWidth={2} dot={false} />
            )}
            <Area type="monotone" dataKey="EBITDA" stroke="#10B981" fill="url(#gEbt)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="FCF" stroke="#8B5CF6" fill="url(#gFcf)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2 — Cumulative Equity CF */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-white mb-3">Cumulative Equity Cash Flow ($M)</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chart2Data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#6B7280' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
            <Tooltip {...TOOLTIP_STYLE} />
            <ReferenceLine y={0} stroke="#4B5563" strokeDasharray="3 3" />
            {paybackYear != null && (
              <ReferenceLine
                x={`Y${paybackYear}`}
                stroke="#F59E0B"
                strokeDasharray="4 4"
                label={{ value: 'Payback', fill: '#F59E0B', fontSize: 10 }}
              />
            )}
            <Line type="monotone" dataKey="CumEquityCF" stroke="#3B82F6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 3 — DSCR */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-white mb-3">DSCR by Year</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chart3Data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#6B7280' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} domain={[0, 'auto']} />
            <Tooltip {...TOOLTIP_STYLE} />
            <ReferenceLine y={1.0} stroke="#EF4444" strokeDasharray="3 3" label={{ value: '1.0×', fill: '#EF4444', fontSize: 9 }} />
            <ReferenceLine y={1.3} stroke="#10B981" strokeDasharray="3 3" label={{ value: '1.3×', fill: '#10B981', fontSize: 9 }} />
            <Bar dataKey="DSCR" radius={[2, 2, 0, 0]}>
              {chart3Data.map((entry, i) => (
                <Cell key={i} fill={dscrBarColor(entry.DSCR)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 4 — Scenario Comparison */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-white mb-1">Scenario Comparison</h3>
        <p className="text-xs text-muted mb-3">Bull: +20% rack, −15% capex · Bear: −20% rack, +15% capex · DSCR ×10</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={scenChart} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Base" fill="#3B82F6" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Bull" fill="#10B981" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Bear" fill="#EF4444" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  ) : (
    <div className="px-6 pb-4 shrink-0">
      <div className="bg-surface border border-border rounded-xl h-64 flex flex-col items-center justify-center gap-3 text-muted">
        <Play size={32} className="opacity-30" />
        <p className="text-sm">Configure inputs and click <span className="text-accent font-semibold">Run Model</span> to see results</p>
      </div>
    </div>
  );

  // ── Data table ─────────────────────────────────────────────────────────────

  const dataTable = outputs ? (
    <div className="px-6 pb-6 shrink-0">
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setTableOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
        >
          <span className="text-xs font-semibold text-white uppercase tracking-wider">
            20-Year Cash Flow Table
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={e => { e.stopPropagation(); exportCSV(outputs.yearlyData); }}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-white border border-border rounded px-2 py-1 transition-colors"
            >
              <Download size={12} />
              CSV
            </button>
            {tableOpen ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
          </div>
        </button>

        {tableOpen && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-t border-border bg-surface-2 text-muted">
                  {['Yr', 'Cal Yr', 'MW', 'Util%', 'Rev $M', 'EBITDA $M', 'EBITDA%', 'ProjFCF $M', 'Debt Svc $M', 'DSCR', 'Cum Eq CF $M'].map(h => (
                    <th key={h} className="text-right px-3 py-2 font-medium whitespace-nowrap first:text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outputs.yearlyData.filter(r => r.year > 0).map(r => (
                  <tr key={r.year} className="border-t border-border hover:bg-surface-2 transition-colors">
                    <td className="px-3 py-1.5 text-white font-mono">{r.year}</td>
                    <td className="px-3 py-1.5 text-muted font-mono text-right">{r.calendarYear}</td>
                    <td className="px-3 py-1.5 text-muted font-mono text-right">{r.capacityMW}</td>
                    <td className="px-3 py-1.5 text-muted font-mono text-right">{(r.utilisationPct * 100).toFixed(0)}</td>
                    <td className="px-3 py-1.5 text-white font-mono text-right">{r.revenueUSDM.toFixed(1)}</td>
                    <td className="px-3 py-1.5 font-mono text-right" style={{ color: r.ebitdaUSDM >= 0 ? '#10B981' : '#EF4444' }}>
                      {r.ebitdaUSDM.toFixed(1)}
                    </td>
                    <td className="px-3 py-1.5 text-muted font-mono text-right">{r.ebitdaMarginPct.toFixed(0)}%</td>
                    <td className="px-3 py-1.5 font-mono text-right" style={{ color: r.projectFcfUSDM >= 0 ? '#8B5CF6' : '#EF4444' }}>
                      {r.projectFcfUSDM.toFixed(1)}
                    </td>
                    <td className="px-3 py-1.5 text-muted font-mono text-right">{r.totalDebtServiceUSDM.toFixed(1)}</td>
                    <td className="px-3 py-1.5 font-mono text-right" style={{ color: r.dscrRatio != null ? dscrBarColor(r.dscrRatio) : '#6B7280' }}>
                      {r.dscrRatio != null ? r.dscrRatio.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-right" style={{ color: r.cumulativeEquityCfUSDM >= 0 ? '#3B82F6' : '#EF4444' }}>
                      {r.cumulativeEquityCfUSDM.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  ) : null;

  // ── Sensitivity section ────────────────────────────────────────────────────

  const baseConstCapexKw = form.civils_capex_per_kw + form.mechanical_capex_per_kw + form.electrical_capex_per_kw;

  const sensitivitySection = (
    <div className="px-6 pb-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold text-white">Sensitivity Analysis</h2>
        {!sensitivity && (
          <span className="text-xs text-muted">Run the model to compute tornado & heatmap</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">

        {/* Tornado chart */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-white">Tornado — Equity IRR Impact (±20% per variable)</h3>
            <p className="text-xs text-muted mt-0.5">Sorted by absolute impact. Bright = upside, muted = downside.</p>
          </div>
          {sensitivity ? (
            <TornadoChart data={sensitivity.tornado} baseIRR={sensitivity.baseIRR} />
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-xs text-muted">No data — click Run Model</p>
            </div>
          )}
        </div>

        {/* Heatmap */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="mb-3">
            <h3 className="text-xs font-semibold text-white">Heatmap — Equity IRR % by Rack Rate & Utilisation</h3>
            <p className="text-xs text-muted mt-0.5">Other inputs held at current model values.</p>
          </div>
          {sensitivity ? (
            <HeatmapChart cells={sensitivity.heatmap} />
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-xs text-muted">No data — click Run Model</p>
            </div>
          )}
        </div>
      </div>

      {/* Break-even cards — live */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-muted uppercase tracking-wider mb-2">Min Rack Rate → 12% Equity IRR</p>
          {breakEven.minRackRateFor12pct != null ? (
            <>
              <p className="text-xl font-bold font-mono text-white">
                ${breakEven.minRackRateFor12pct}/kW/mo
              </p>
              <p className="text-xs text-muted mt-1">
                {breakEven.minRackRateFor12pct <= form.rackRateUSD_kW_month
                  ? <span className="text-emerald-400">Current ${form.rackRateUSD_kW_month} is above threshold</span>
                  : <span className="text-red-400">Current ${form.rackRateUSD_kW_month} is below threshold</span>
                }
              </p>
            </>
          ) : (
            <p className="text-xl font-bold font-mono text-muted">N/A</p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-muted uppercase tracking-wider mb-2">Min Utilisation → DSCR &gt; 1.0×</p>
          {breakEven.minUtilisationForDSCR != null ? (
            <>
              <p className="text-xl font-bold font-mono text-white">
                {breakEven.minUtilisationForDSCR}% stabilised
              </p>
              <p className="text-xs text-muted mt-1">
                {breakEven.minUtilisationForDSCR <= form.utilisationYearPct[6]
                  ? <span className="text-emerald-400">Current {form.utilisationYearPct[6]}% is above threshold</span>
                  : <span className="text-red-400">Current {form.utilisationYearPct[6]}% is below threshold</span>
                }
              </p>
            </>
          ) : (
            <p className="text-xl font-bold font-mono text-muted">N/A</p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-xs text-muted uppercase tracking-wider mb-2">Max Build Cost/kW → 10% IRR</p>
          {breakEven.maxCapexPerKwFor10pct != null ? (
            <>
              <p className="text-xl font-bold font-mono text-white">
                ${breakEven.maxCapexPerKwFor10pct.toLocaleString()}/kW
              </p>
              <p className="text-xs text-muted mt-1">
                {breakEven.maxCapexPerKwFor10pct >= baseConstCapexKw
                  ? <span className="text-emerald-400">Headroom: +${(breakEven.maxCapexPerKwFor10pct - baseConstCapexKw).toLocaleString()}/kW</span>
                  : <span className="text-red-400">Over by ${(baseConstCapexKw - breakEven.maxCapexPerKwFor10pct).toLocaleString()}/kW</span>
                }
              </p>
            </>
          ) : (
            <p className="text-xl font-bold font-mono text-muted">N/A</p>
          )}
        </div>
      </div>
    </div>
  );

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {sidebar}

      {/* Collapsed sidebar toggle */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute left-16 lg:left-56 top-1/2 -translate-y-1/2 z-10 bg-surface border border-border rounded-r-lg p-1.5 text-muted hover:text-white transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 sticky top-0 bg-bg z-10">
          <div>
            <h1 className="text-base font-semibold text-white">
              {form.projectName || 'Financial Model'}
            </h1>
            <p className="text-xs text-muted mt-0.5">
              {form.totalCapacityMW} MW IT load · {COUNTRY_LABELS[form.country] || form.country} · 20-Year DCF
            </p>
          </div>
          {outputs && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Model results current
            </div>
          )}
        </div>

        {kpiRow}

        {/* BYOP summary — only when enabled and a result has been computed */}
        {outputs && form.byopEnabled && (() => {
          const inp = toModelInputs(form);
          const byop = calcBYOPCapex(inp);
          // Annual gross grid-cost saving at stabilised utilisation (Year 7)
          const stabRow = outputs.yearlyData.find((r) => r.year === 7) ?? outputs.yearlyData[outputs.yearlyData.length - 1];
          const stabUtil = stabRow.utilisationPct;
          const totalLoadMWh = inp.totalCapacityMW * stabUtil * inp.pue * 8_760;
          const targetMWh = totalLoadMWh * (inp.gridDisplacementPct / 100);
          const deliveredMWh = Math.min(byop.netDeliveredMWh, targetMWh);
          const grossSavingUSDM = (deliveredMWh * 1_000 * inp.powerCostUSD_kWh) / 1e6;
          const netSavingUSDM = grossSavingUSDM - byop.solarOpexUSDM;
          const paybackYears = netSavingUSDM > 0.01 ? byop.totalUSDM / netSavingUSDM : null;
          return (
            <div className="mx-6 mb-2 grid grid-cols-4 gap-3 border border-emerald-500/20 bg-emerald-500/5 rounded-lg px-4 py-3 text-xs">
              <div>
                <div className="text-muted text-[10px] uppercase tracking-wider mb-0.5">BYOP Capex</div>
                <div className="text-white font-mono font-semibold">${byop.totalUSDM.toFixed(1)}M</div>
                <div className="text-muted text-[10px]">Solar ${byop.solarUSDM.toFixed(1)}M · Battery ${byop.batteryUSDM.toFixed(1)}M</div>
              </div>
              <div>
                <div className="text-muted text-[10px] uppercase tracking-wider mb-0.5">Delivered Energy</div>
                <div className="text-white font-mono font-semibold">{(deliveredMWh / 1000).toFixed(1)} GWh/yr</div>
                <div className="text-muted text-[10px]">Raw {(byop.rawGenMWh / 1000).toFixed(1)} GWh · Y7 stabilised</div>
              </div>
              <div>
                <div className="text-muted text-[10px] uppercase tracking-wider mb-0.5">Net Saving</div>
                <div className="text-emerald-400 font-mono font-semibold">${netSavingUSDM.toFixed(1)}M/yr</div>
                <div className="text-muted text-[10px]">Gross ${grossSavingUSDM.toFixed(1)}M − O&M ${byop.solarOpexUSDM.toFixed(1)}M</div>
              </div>
              <div>
                <div className="text-muted text-[10px] uppercase tracking-wider mb-0.5">Simple Payback</div>
                <div className="text-emerald-400 font-mono font-semibold">{paybackYears != null ? `${paybackYears.toFixed(1)} yrs` : 'N/A'}</div>
                <div className="text-muted text-[10px]">vs grid @ ${inp.powerCostUSD_kWh.toFixed(3)}/kWh</div>
              </div>
            </div>
          );
        })()}

        {/* IRR / model warning banner */}
        {modelWarning && (
          <div className="mx-6 mb-2 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-xs text-amber-400">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1">{modelWarning}</span>
            <button onClick={() => setModelWarning(null)} className="shrink-0 hover:text-white transition-colors">
              <XIcon size={13} />
            </button>
          </div>
        )}

        {chartsSection}
        {dataTable}
        {sensitivitySection}

        {outputs && (() => {
          const stab = outputs.yearlyData.find((r) => r.year === 7) ?? outputs.yearlyData[outputs.yearlyData.length - 1];
          const totalKW = form.totalCapacityMW * 1000;
          const userMetrics: UserMetrics = {
            capexUSD_kW:      outputs.totalCapexUSDM * 1e6 / totalKW,
            opexUSD_kWyr:     stab.totalOpexUSDM * 1e6 / totalKW,
            rackRateUSD_kWmo: form.rackRateUSD_kW_month,
            utilisationY3Pct: form.utilisationYearPct[2],
            plf:              stab.ebitdaMarginPct,
            irr:              isNaN(outputs.equityIRRPct) ? 0 : outputs.equityIRRPct,
          };
          // Map country → benchmark region (default JB if MY, else SEA pattern)
          const bregion: BenchmarkRegion =
            form.country === 'SG' ? 'SG' :
            form.country === 'TH' ? 'BKK' :
            form.country === 'ID' ? 'JKT' :
            'JB';
          const bcategory: BenchmarkCategory =
            form.totalCapacityMW >= 50 ? 'hyperscale' :
            form.totalCapacityMW >= 10 ? 'colocation' : 'edge';
          return (
            <BenchmarkSection
              userResult={userMetrics}
              defaultCategory={bcategory}
              defaultRegion={bregion}
            />
          );
        })()}
      </div>
    </div>
  );
}
