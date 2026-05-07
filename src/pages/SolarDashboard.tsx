import { useMemo } from 'react';
import type { HexTile } from '../types';
import { scoreToVerdict } from '../utils/solarScoring';

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

const AREA_PER_TILE_KM2 = 36; // H3 res-6 ~ 36 km²

export default function SolarDashboard({ tiles }: Props) {
  const stats = useMemo(() => {
    const go         = tiles.filter((t) => t.scores.composite >= 70);
    const cond       = tiles.filter((t) => t.scores.composite >= 45 && t.scores.composite < 70);
    const avoid      = tiles.filter((t) => t.scores.composite < 45);
    const avgComposite = tiles.length ? Math.round(tiles.reduce((s, t) => s + t.scores.composite, 0) / tiles.length) : 0;

    // Total estimated buildable capacity across all Go tiles
    const totalGoCapacityMW = go.reduce((sum, t) => sum + t.attributes.estimatedCapacityMW, 0);

    const byState: Record<string, { go: number; total: number; avgScore: number; capacityMW: number }> = {};
    for (const t of tiles) {
      const s = t.state ?? 'Unknown';
      if (!byState[s]) byState[s] = { go: 0, total: 0, avgScore: 0, capacityMW: 0 };
      byState[s].total++;
      byState[s].avgScore += t.scores.composite;
      byState[s].capacityMW += t.attributes.estimatedCapacityMW;
      if (t.scores.composite >= 70) byState[s].go++;
    }
    for (const s of Object.values(byState)) s.avgScore = Math.round(s.avgScore / s.total);

    // Top 10 tiles by composite score
    const top10 = [...tiles].sort((a, b) => b.scores.composite - a.scores.composite).slice(0, 10);

    return { go, cond, avoid, avgComposite, totalGoCapacityMW, byState, top10, total: tiles.length };
  }, [tiles]);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-bg">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-white text-xl font-bold">Solar SiteIQ — Northern Malaysia Screening</h1>
          <p className="text-muted text-sm mt-1">
            {stats.total} H3 tiles screened across Perak, Kedah, Penang and Perlis · H3 resolution 6 (~{AREA_PER_TILE_KM2} km² per tile)
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Area Screened" value={`${(stats.total * AREA_PER_TILE_KM2).toLocaleString()} km²`} sub={`${stats.total} tiles`} />
          <StatCard label="Go Tiles (≥70)" value={stats.go.length} sub={`${(stats.go.length * AREA_PER_TILE_KM2).toLocaleString()} km² viable`} color="text-green-400" />
          <StatCard label="Conditional (45–69)" value={stats.cond.length} sub={`${(stats.cond.length * AREA_PER_TILE_KM2).toLocaleString()} km²`} color="text-amber-400" />
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
                      className={`h-full rounded-full ${s.avgScore >= 70 ? 'bg-green-500' : s.avgScore >= 45 ? 'bg-amber-400' : 'bg-red-500'}`}
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

        {/* Top 10 tiles */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-white text-sm font-semibold mb-3">Top 10 Highest-Scoring Tiles</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left pb-2 pr-3">Rank</th>
                  <th className="text-left pb-2 pr-3">State</th>
                  <th className="text-left pb-2 pr-3">Location</th>
                  <th className="text-right pb-2 pr-3">Composite</th>
                  <th className="text-right pb-2 pr-3">Solar</th>
                  <th className="text-right pb-2 pr-3">Grid</th>
                  <th className="text-right pb-2 pr-3">Land</th>
                  <th className="text-right pb-2 pr-3">Est. MW</th>
                  <th className="text-left pb-2">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {stats.top10.map((tile, i) => (
                  <tr key={tile.h3Index} className="border-b border-border/50 hover:bg-surface-1">
                    <td className="py-1.5 pr-3 text-muted">#{i + 1}</td>
                    <td className="py-1.5 pr-3 text-white">{tile.state ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-muted font-mono">{tile.centerLat.toFixed(3)}, {tile.centerLng.toFixed(3)}</td>
                    <td className="py-1.5 pr-3 text-right font-bold text-white">{tile.scores.composite}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-300">{tile.scores.solar}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-300">{tile.scores.grid}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-300">{tile.scores.land}</td>
                    <td className="py-1.5 pr-3 text-right text-amber-400 font-semibold">{tile.attributes.estimatedCapacityMW}</td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        tile.scores.composite >= 70 ? 'bg-green-500/20 text-green-400' :
                        tile.scores.composite >= 45 ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {scoreToVerdict(tile.scores.composite)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
