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

export default function SolarDashboard({ tiles }: Props) {
  const stats = useMemo(() => {
    const go   = tiles.filter((t) => t.scores.composite >= GO_THRESHOLD);
    const cond = tiles.filter((t) => t.scores.composite >= CONDITIONAL_GO_THRESHOLD && t.scores.composite < GO_THRESHOLD);

    // Total estimated buildable capacity across all Go tiles
    const totalGoCapacityMW = go.reduce((sum, t) => sum + t.attributes.estimatedCapacityMW, 0);

    const byState: Record<string, { go: number; total: number; avgScore: number; capacityMW: number }> = {};
    for (const t of tiles) {
      const s = t.states[0] ?? 'Unknown';
      if (!byState[s]) byState[s] = { go: 0, total: 0, avgScore: 0, capacityMW: 0 };
      byState[s].total++;
      byState[s].avgScore += t.scores.composite;
      byState[s].capacityMW += t.attributes.estimatedCapacityMW;
      if (t.scores.composite >= GO_THRESHOLD) byState[s].go++;
    }
    for (const s of Object.values(byState)) s.avgScore = Math.round(s.avgScore / s.total);

    return { go, cond, totalGoCapacityMW, byState, total: tiles.length };
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Area Screened" value={`${stats.total.toLocaleString()} km²`} sub={`${stats.total.toLocaleString()} cells · 1 km² each`} />
          <StatCard label="Go Cells (≥70)" value={stats.go.length.toLocaleString()} sub={`${stats.go.length.toLocaleString()} km² viable`} color="text-green-400" />
          <StatCard label="Conditional (45–69)" value={stats.cond.length.toLocaleString()} sub={`${stats.cond.length.toLocaleString()} km²`} color="text-amber-400" />
          <StatCard
            label="Est. Buildable Capacity"
            value={stats.totalGoCapacityMW >= 1000
              ? `${(stats.totalGoCapacityMW / 1000).toFixed(1)} GW`
              : `${stats.totalGoCapacityMW.toLocaleString()} MW`}
            sub="Go tiles · excl. protected land"
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
                <p className="text-amber-400 text-[10px] font-semibold mt-1.5">
                  {s.capacityMW >= 1000
                    ? `${(s.capacityMW / 1000).toFixed(1)} GW`
                    : `${s.capacityMW.toLocaleString()} MW`} est.
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
