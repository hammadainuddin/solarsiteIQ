import { useMemo } from 'react';
import type { HexTile } from '../types';
import { GO_THRESHOLD, CONDITIONAL_GO_THRESHOLD } from '../utils/solarScoring';

interface Props {
  tiles: HexTile[];
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <p className="text-muted text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-muted text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

function formatCapacity(mw: number): string {
  return mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : `${mw.toLocaleString()} MW`;
}

export default function SolarDashboard({ tiles }: Props) {
  const stats = useMemo(() => {
    const go   = tiles.filter((t) => t.scores.composite >= GO_THRESHOLD);
    const cond = tiles.filter((t) => t.scores.composite >= CONDITIONAL_GO_THRESHOLD && t.scores.composite < GO_THRESHOLD);

    // Capacity totals, kept separate by verdict tier — summing across ALL
    // tiles regardless of verdict (including 'Avoid') would badly overstate
    // buildable capacity, since even Avoid-tier cells (e.g. paddy, protected
    // land) can carry non-zero theoretical capacityKWp.
    const totalGoCapacityMW   = go.reduce((sum, t) => sum + t.attributes.estimatedCapacityMW, 0);
    const totalCondCapacityMW = cond.reduce((sum, t) => sum + t.attributes.estimatedCapacityMW, 0);

    const byState: Record<string, { go: number; total: number; avgScore: number; goCapacityMW: number; condCapacityMW: number }> = {};
    for (const t of tiles) {
      const s = t.states[0] ?? 'Unknown';
      if (!byState[s]) byState[s] = { go: 0, total: 0, avgScore: 0, goCapacityMW: 0, condCapacityMW: 0 };
      byState[s].total++;
      byState[s].avgScore += t.scores.composite;
      if (t.scores.composite >= GO_THRESHOLD) {
        byState[s].go++;
        byState[s].goCapacityMW += t.attributes.estimatedCapacityMW;
      } else if (t.scores.composite >= CONDITIONAL_GO_THRESHOLD) {
        byState[s].condCapacityMW += t.attributes.estimatedCapacityMW;
      }
    }
    for (const s of Object.values(byState)) s.avgScore = Math.round(s.avgScore / s.total);

    return { go, cond, totalGoCapacityMW, totalCondCapacityMW, byState, total: tiles.length };
  }, [tiles]);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-bg">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-white text-xl font-bold">Solar SiteIQ — Northern Malaysia Screening</h1>
          <p className="text-muted text-sm mt-1">
            {stats.total.toLocaleString()} 1 km² cells screened across Perak, Kedah, Penang and Perlis
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total Area Screened" value={`${stats.total.toLocaleString()} km²`} sub={`${stats.total.toLocaleString()} cells · 1 km² each`} />
          <StatCard label={`Go Cells (≥${GO_THRESHOLD})`} value={stats.go.length.toLocaleString()} sub={`${stats.go.length.toLocaleString()} km² viable`} color="text-green-400" />
          <StatCard label={`Conditional (${CONDITIONAL_GO_THRESHOLD}–${GO_THRESHOLD - 1})`} value={stats.cond.length.toLocaleString()} sub={`${stats.cond.length.toLocaleString()} km²`} color="text-amber-400" />
        </div>

        {/* Capacity cards — Go and Conditional Go shown separately, never combined,
            since blending them would obscure how much of the total sits in the
            lower-confidence Conditional tier. */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Go Capacity"
            value={formatCapacity(stats.totalGoCapacityMW)}
            sub="Go tiles · excl. protected land"
            color="text-green-400"
          />
          <StatCard
            label="Conditional Go Capacity"
            value={formatCapacity(stats.totalCondCapacityMW)}
            sub="Conditional tiles · needs further review"
            color="text-amber-400"
          />
        </div>

        {/* State breakdown */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-white text-sm font-semibold mb-3">State Summary</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(stats.byState).sort(([a], [b]) => a.localeCompare(b)).map(([state, s]) => (
              <div key={state} className="bg-surface-1 rounded-lg p-3">
                <p className="text-white text-xs font-semibold">{state}</p>
                <p className="text-muted text-[10px] mt-0.5">{s.total} tiles · {s.go} Go</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.avgScore >= GO_THRESHOLD ? 'bg-green-500' : s.avgScore >= CONDITIONAL_GO_THRESHOLD ? 'bg-amber-400' : 'bg-red-500'}`}
                      style={{ width: `${s.avgScore}%` }}
                    />
                  </div>
                  <span className="text-white text-[10px] font-medium w-6">{s.avgScore}</span>
                </div>
                <p className="text-green-400 text-[10px] font-semibold mt-1.5">
                  Go: {formatCapacity(s.goCapacityMW)}
                </p>
                <p className="text-amber-400 text-[10px] font-semibold">
                  Cond: {formatCapacity(s.condCapacityMW)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Info note */}
        <p className="text-muted text-[10px] leading-relaxed">
          Scores are estimated from static datasets (TNB grid data, land use zones, DID flood risk, GHI models).
          Use the Screening Map to drill down and run AI-powered workflow analysis on specific tiles.
        </p>
      </div>
    </div>
  );
}
