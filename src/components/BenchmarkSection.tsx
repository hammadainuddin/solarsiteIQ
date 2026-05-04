import { useMemo, useState } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import {
  BENCHMARKS, findBenchmark,
  type BenchmarkCategory, type BenchmarkRegion, type BenchmarkProfile,
} from '../data/benchmarks';

export interface UserMetrics {
  capexUSD_kW: number;
  opexUSD_kWyr: number;
  rackRateUSD_kWmo: number;
  utilisationY3Pct: number;
  plf: number;
  irr: number;
}

interface Props {
  userResult: UserMetrics;
  defaultCategory?: BenchmarkCategory;
  defaultRegion?: BenchmarkRegion;
}

const AVAILABLE_CATEGORIES: BenchmarkCategory[] = ['hyperscale', 'colocation', 'edge'];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Maps a value into a 0..100 score against a percentile band.
 * `lowerIsBetter` flips the scale so that lower-than-P25 → 100.
 */
function bandRank(value: number, band: { p25: number; p50: number; p75: number }, lowerIsBetter = false): number {
  // Linear interp between p25 (=0 if higher better) and p75 (=100 if higher better)
  const span = Math.max(1, band.p75 - band.p25);
  const t = clamp01((value - band.p25) / span);
  return Math.round((lowerIsBetter ? 1 - t : t) * 100);
}

export function BenchmarkSection({ userResult, defaultCategory = 'hyperscale', defaultRegion = 'JB' }: Props) {
  const [category, setCategory] = useState<BenchmarkCategory>(defaultCategory);
  const [region, setRegion] = useState<BenchmarkRegion>(defaultRegion);

  const availableRegions = useMemo<BenchmarkRegion[]>(() =>
    BENCHMARKS.filter((b) => b.category === category).map((b) => b.region),
    [category],
  );

  // If region isn't available for the new category, snap to the first available
  useMemo(() => {
    if (!availableRegions.includes(region) && availableRegions[0]) {
      setRegion(availableRegions[0]);
    }
  }, [availableRegions, region]);

  const profile = findBenchmark(category, region);
  if (!profile) {
    return (
      <div className="px-6 py-4 text-xs text-muted">
        No benchmark profile available for {category} × {region}.
      </div>
    );
  }

  const rows = buildRows(userResult, profile);

  // Radar data — one row per axis with You vs P75 best-in-class
  const radarData = rows.map((r) => ({
    metric: r.label,
    You: r.userScore,
    'Best in class': 100,
    'Median (P50)': 50,
  }));

  return (
    <section className="px-6 py-6 border-t border-border">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Market Benchmarking</h2>
          <p className="text-[11px] text-muted mt-0.5">
            {profile.source}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as BenchmarkCategory)}
            className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-white"
          >
            {AVAILABLE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as BenchmarkRegion)}
            className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-white"
          >
            {availableRegions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Comparison table */}
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-surface-2">
              <tr>
                <th className="text-left px-3 py-2 text-muted font-medium">Metric</th>
                <th className="text-right px-3 py-2 text-muted font-medium">You</th>
                <th className="text-right px-3 py-2 text-muted font-medium">P25</th>
                <th className="text-right px-3 py-2 text-muted font-medium">P50</th>
                <th className="text-right px-3 py-2 text-muted font-medium">P75</th>
                <th className="text-center px-3 py-2 text-muted font-medium">vs P50</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-border">
                  <td className="px-3 py-2 text-white">{r.label}</td>
                  <td className="px-3 py-2 text-right font-mono text-white">{r.format(r.userValue)}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted">{r.format(r.band.p25)}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted">{r.format(r.band.p50)}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted">{r.format(r.band.p75)}</td>
                  <td className="px-3 py-2 text-center">
                    <ArrowIndicator delta={r.userValue - r.band.p50} lowerIsBetter={r.lowerIsBetter} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Radar */}
        <div className="bg-surface border border-border rounded-lg p-3" style={{ minHeight: 320 }}>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData} outerRadius="75%">
              <PolarGrid stroke="#1F2937" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fill: '#4B5563', fontSize: 9 }} domain={[0, 100]} />
              <Radar name="Best in class" dataKey="Best in class" stroke="#22c55e" fill="#22c55e" fillOpacity={0.05} />
              <Radar name="Median (P50)" dataKey="Median (P50)" stroke="#6B7280" fill="#6B7280" fillOpacity={0.08} />
              <Radar name="You" dataKey="You" stroke="#6366F1" fill="#6366F1" fillOpacity={0.45} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0D1117', border: '1px solid #1F2937', borderRadius: 8 }}
                labelStyle={{ color: '#E5E7EB', fontSize: 11 }}
                itemStyle={{ fontSize: 11 }}
              />
            </RadarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted text-center mt-1">
            Each axis is scaled 0–100 within the published P25–P75 band. Higher = better
            (capex/opex axes are inverted so lower cost reads higher).
          </p>
        </div>
      </div>
    </section>
  );
}

interface BenchRow {
  label: string;
  userValue: number;
  userScore: number;
  band: { p25: number; p50: number; p75: number };
  lowerIsBetter: boolean;
  format: (v: number) => string;
}

function buildRows(u: UserMetrics, p: BenchmarkProfile): BenchRow[] {
  const fmt$ = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtPct = (v: number) => `${v.toFixed(0)}%`;
  const fmtRack = (v: number) => `$${v.toFixed(0)}/kW/mo`;
  return [
    {
      label: 'Capex / kW',
      userValue: u.capexUSD_kW,
      band: p.capexUSD_kW,
      lowerIsBetter: true,
      userScore: bandRank(u.capexUSD_kW, p.capexUSD_kW, true),
      format: fmt$,
    },
    {
      label: 'Opex / kW / yr',
      userValue: u.opexUSD_kWyr,
      band: p.opexUSD_kWyr,
      lowerIsBetter: true,
      userScore: bandRank(u.opexUSD_kWyr, p.opexUSD_kWyr, true),
      format: fmt$,
    },
    {
      label: 'Rack Rate',
      userValue: u.rackRateUSD_kWmo,
      band: p.rackRateUSD_kWmo,
      lowerIsBetter: false,
      userScore: bandRank(u.rackRateUSD_kWmo, p.rackRateUSD_kWmo),
      format: fmtRack,
    },
    {
      label: 'Util Y3',
      userValue: u.utilisationY3Pct,
      band: p.utilisationY3Pct,
      lowerIsBetter: false,
      userScore: bandRank(u.utilisationY3Pct, p.utilisationY3Pct),
      format: fmtPct,
    },
    {
      label: 'PLF',
      userValue: u.plf,
      band: p.plf,
      lowerIsBetter: false,
      userScore: bandRank(u.plf, p.plf),
      format: fmtPct,
    },
    {
      label: 'Equity IRR',
      userValue: u.irr,
      band: p.irr,
      lowerIsBetter: false,
      userScore: bandRank(u.irr, p.irr),
      format: fmtPct,
    },
  ];
}

function ArrowIndicator({ delta, lowerIsBetter }: { delta: number; lowerIsBetter: boolean }) {
  if (Math.abs(delta) < 1e-3) {
    return <Minus size={12} className="text-muted inline" />;
  }
  const positive = lowerIsBetter ? delta < 0 : delta > 0;
  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  return <Icon size={12} className={`inline ${positive ? 'text-emerald-400' : 'text-red-400'}`} />;
}
