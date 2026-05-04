import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { ChevronDown, ChevronUp, LayoutGrid, TrendingUp, Database, Upload } from 'lucide-react';
import { DC_DATABASE } from '../data/dcDatabase';
import type { DataCentre, DCStatus, OperatorType } from '../types';
import { Header } from './Header';
import { useAppContext } from '../context/AppContext';
import { DCUploadModal } from './DCUploadModal';

// ─── Market definitions ───────────────────────────────────────────────────────

interface MarketDef {
  id: string;
  label: string;
  country: string;
  cities?: string[];   // if undefined, all cities in that country
  color: string;
}

const MARKETS: MarketDef[] = [
  {
    id: 'JB',
    label: 'Johor Bahru',
    country: 'MY',
    cities: ['Iskandar Puteri', 'Tebrau', 'Johor Bahru', 'Kulai', 'Sedenak'],
    color: '#3B82F6',
  },
  {
    id: 'KL',
    label: 'Kuala Lumpur',
    country: 'MY',
    cities: ['Cyberjaya', 'Petaling Jaya', 'Kuala Lumpur'],
    color: '#8B5CF6',
  },
  { id: 'SG', label: 'Singapore',  country: 'SG', color: '#EF4444' },
  { id: 'JKT', label: 'Jakarta',    country: 'ID', color: '#F97316' },
  { id: 'BKK', label: 'Bangkok',    country: 'TH', color: '#10B981' },
  { id: 'MNL', label: 'Manila',     country: 'PH', color: '#EAB308' },
  { id: 'HCM', label: 'HCMC',       country: 'VN', color: '#EC4899' },
];

function getMarketId(dc: DataCentre): string {
  const m = MARKETS.find((mkt) => {
    if (mkt.country !== dc.country) return false;
    if (!mkt.cities) return true;
    return mkt.cities.includes(dc.city);
  });
  return m?.id ?? 'OTHER';
}

function marketColor(id: string): string {
  return MARKETS.find((m) => m.id === id)?.color ?? '#6B7280';
}

// ─── Colours for status / operator type ──────────────────────────────────────

const STATUS_COLOR: Record<DCStatus, string> = {
  operational: '#10B981',
  construction: '#F97316',
  announced: '#EAB308',
  rumoured: '#6B7280',
};

const STATUS_LABEL: Record<DCStatus, string> = {
  operational: 'Operational',
  construction: 'Under Construction',
  announced: 'Announced',
  rumoured: 'Rumoured',
};

const OP_TYPE_COLOR: Record<OperatorType, string> = {
  colo: '#3B82F6',
  hyperscale: '#8B5CF6',
  enterprise: '#10B981',
  government: '#EAB308',
  carrier_neutral: '#F97316',
};

const OP_TYPE_LABEL: Record<OperatorType, string> = {
  colo: 'Colocation',
  hyperscale: 'Hyperscale',
  enterprise: 'Enterprise',
  government: 'Government',
  carrier_neutral: 'Carrier Neutral',
};

// ─── Parse COD year from strings like "2025-Q4", "2026-Q1" ───────────────────

function parseCODYear(cod: string): number {
  const m = cod.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : 9999;
}

// ─── Shared tooltip style ─────────────────────────────────────────────────────

const TT = {
  contentStyle: { background: '#111827', border: '1px solid #1F2937', borderRadius: 8 },
  labelStyle: { color: '#fff', fontSize: 12 },
  itemStyle: { color: '#9CA3AF', fontSize: 11 },
};

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'pipeline' | 'database';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'overview',  label: 'Market Overview',   icon: LayoutGrid },
  { id: 'pipeline',  label: 'Supply Pipeline',   icon: TrendingUp },
  { id: 'database',  label: 'DC Database',       icon: Database },
];

// ─── Market Summary Table ─────────────────────────────────────────────────────

function MarketSummaryTable({ allDCs }: { allDCs: DataCentre[] }) {
  const rows = useMemo(() => {
    return MARKETS.map((mkt) => {
      const dcs = allDCs.filter((d) => getMarketId(d) === mkt.id);
      const op = dcs.filter((d) => d.status === 'operational');
      const pipeline = dcs.filter((d) => d.status !== 'operational');
      const opMW = op.reduce((s, d) => s + d.capacityMW, 0);
      const pipeMW = pipeline.reduce((s, d) => s + d.capacityMW, 0);
      const totalMW = opMW + pipeMW;
      const operators = new Set(dcs.map((d) => d.operator)).size;

      const utilOps = op.filter((d) => (d.occupancyRate ?? 0) > 0);
      const avgUtil = utilOps.length > 0
        ? Math.round(utilOps.reduce((s, d) => s + (d.occupancyRate ?? 0), 0) / utilOps.length * 100)
        : null;

      return { mkt, opMW, pipeMW, totalMW, operators, avgUtil, dcCount: dcs.length };
    });
  }, [allDCs]);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-white text-sm font-semibold">Market Summary</h3>
        <span className="text-muted text-xs">{allDCs.length} data centres tracked</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              {['Market', 'DCs', 'Operational MW', 'Pipeline MW', 'Total MW', 'Operators', 'Avg Util. (Op.)'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-muted font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ mkt, opMW, pipeMW, totalMW, operators, avgUtil, dcCount }) => (
              <tr key={mkt.id} className="hover:bg-surface-2 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: mkt.color }} />
                    <span className="text-white font-medium">{mkt.label}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{dcCount}</td>
                <td className="px-4 py-3">
                  <span className="text-emerald-400 font-mono font-semibold">{opMW.toLocaleString()} MW</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-orange-400 font-mono">{pipeMW.toLocaleString()} MW</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-white font-mono font-semibold">{totalMW.toLocaleString()} MW</span>
                </td>
                <td className="px-4 py-3 text-white">{operators}</td>
                <td className="px-4 py-3">
                  {avgUtil !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${avgUtil}%`,
                            backgroundColor: avgUtil >= 85 ? '#EF4444' : avgUtil >= 70 ? '#F97316' : '#10B981',
                          }}
                        />
                      </div>
                      <span className="text-white font-mono">{avgUtil}%</span>
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Operator Concentration Pie ───────────────────────────────────────────────

function OperatorConcentration({ allDCs }: { allDCs: DataCentre[] }) {
  const [selectedMarket, setSelectedMarket] = useState<string>('ALL');

  const slices = useMemo(() => {
    const dcs = selectedMarket === 'ALL'
      ? allDCs
      : allDCs.filter((d) => getMarketId(d) === selectedMarket);

    const totals = new Map<OperatorType, number>();
    for (const dc of dcs) {
      totals.set(dc.operatorType, (totals.get(dc.operatorType) ?? 0) + dc.capacityMW);
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, mw]) => ({ name: OP_TYPE_LABEL[type], value: mw, type }));
  }, [selectedMarket, allDCs]);

  const totalMW = slices.reduce((s, sl) => s + sl.value, 0);

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white text-sm font-semibold">Operator Type Mix</h3>
        <select
          value={selectedMarket}
          onChange={(e) => setSelectedMarket(e.target.value)}
          className="bg-surface-2 border border-border text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="ALL">All Markets</option>
          {MARKETS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-6 items-center">
        <div className="shrink-0">
          <PieChart width={180} height={180}>
            <Pie
              data={slices}
              cx={85}
              cy={85}
              innerRadius={50}
              outerRadius={82}
              dataKey="value"
              strokeWidth={1}
              stroke="#111827"
            >
              {slices.map((sl) => (
                <Cell key={sl.type} fill={OP_TYPE_COLOR[sl.type as OperatorType]} />
              ))}
            </Pie>
            <Tooltip
              {...TT}
              formatter={(v: number) => [`${v} MW (${Math.round(v / totalMW * 100)}%)`]}
            />
          </PieChart>
        </div>

        <div className="flex-1 space-y-2 min-w-0">
          {slices.map((sl) => {
            const pct = Math.round(sl.value / totalMW * 100);
            return (
              <div key={sl.type}>
                <div className="flex justify-between text-xs mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: OP_TYPE_COLOR[sl.type as OperatorType] }}
                    />
                    <span className="text-white truncate">{sl.name}</span>
                  </div>
                  <span className="text-muted font-mono ml-2 shrink-0">{sl.value} MW</span>
                </div>
                <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: OP_TYPE_COLOR[sl.type as OperatorType] }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-muted text-[10px] pt-1">Total: {totalMW.toLocaleString()} MW</p>
        </div>
      </div>
    </div>
  );
}

// ─── Top Operators Table ──────────────────────────────────────────────────────

function TopOperatorsTable({ allDCs }: { allDCs: DataCentre[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { mw: number; dcs: number; markets: Set<string> }>();
    for (const dc of allDCs) {
      const existing = map.get(dc.operator) ?? { mw: 0, dcs: 0, markets: new Set<string>() };
      existing.mw += dc.capacityMW;
      existing.dcs += 1;
      existing.markets.add(getMarketId(dc));
      map.set(dc.operator, existing);
    }
    return Array.from(map.entries())
      .map(([op, v]) => ({ op, mw: v.mw, dcs: v.dcs, markets: v.markets.size }))
      .sort((a, b) => b.mw - a.mw)
      .slice(0, 10);
  }, [allDCs]);

  const maxMW = rows[0]?.mw ?? 1;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="text-white text-sm font-semibold">Top Operators by Total MW</h3>
      </div>
      <div className="divide-y divide-border">
        {rows.map(({ op, mw, dcs, markets }, i) => (
          <div key={op} className="px-4 py-2.5 hover:bg-surface-2 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-muted text-xs w-4 shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-white text-xs font-medium truncate">{op}</span>
                  <span className="text-white font-mono text-xs ml-2 shrink-0">{mw} MW</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(mw / maxMW) * 100}%` }}
                    />
                  </div>
                  <span className="text-muted text-[10px] shrink-0">{dcs} DC · {markets} mkt</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Supply Pipeline Chart ────────────────────────────────────────────────────

function SupplyPipelineChart({ allDCs }: { allDCs: DataCentre[] }) {
  const [includeRumoured, setIncludeRumoured] = useState(false);

  const { chartData, activeMarkets } = useMemo(() => {
    const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];

    const eligible = allDCs.filter((d) => {
      if (d.status === 'operational') return false;
      if (d.status === 'rumoured' && !includeRumoured) return false;
      return true;
    });

    type YearRow = Record<string, number> & { year: number };
    const byYear = new Map<number, YearRow>();
    for (const y of YEARS) byYear.set(y, { year: y });

    const seen = new Set<string>();
    for (const dc of eligible) {
      const yr = parseCODYear(dc.expectedCOD);
      if (!YEARS.includes(yr)) continue;
      const mid = getMarketId(dc);
      const row = byYear.get(yr)!;
      row[mid] = (row[mid] ?? 0) + dc.capacityMW;
      seen.add(mid);
    }

    // Keep market order consistent
    const activeMarkets = MARKETS.filter((m) => seen.has(m.id));

    return { chartData: YEARS.map((y) => byYear.get(y)!), activeMarkets };
  }, [includeRumoured, allDCs]);

  const totalMW = chartData.reduce((s, row) => {
    return s + activeMarkets.reduce((ms, m) => ms + ((row[m.id] as number | undefined) ?? 0), 0);
  }, 0);

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-white text-sm font-semibold">New Supply Coming Online by Year</h3>
          <p className="text-muted text-xs mt-0.5">{totalMW.toLocaleString()} MW in pipeline (2024–2034)</p>
        </div>
        <button
          onClick={() => setIncludeRumoured((v) => !v)}
          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            includeRumoured
              ? 'bg-accent/20 border-accent text-accent'
              : 'bg-surface-2 border-border text-muted hover:text-white'
          }`}
        >
          <span className={`w-3 h-3 rounded border flex items-center justify-center ${includeRumoured ? 'bg-accent border-accent' : 'border-muted'}`}>
            {includeRumoured && <span className="text-white" style={{ fontSize: 8 }}>✓</span>}
          </span>
          Include Rumoured
        </button>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <XAxis dataKey="year" tick={{ fill: '#6B7280', fontSize: 11 }} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} tickFormatter={(v) => `${v} MW`} width={60} />
          <Tooltip
            {...TT}
            formatter={(v: number, name: string) => {
              const mkt = MARKETS.find((m) => m.id === name);
              return [`${v} MW`, mkt?.label ?? name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
            formatter={(value: string) => {
              const mkt = MARKETS.find((m) => m.id === value);
              return <span style={{ color: '#9CA3AF' }}>{mkt?.label ?? value}</span>;
            }}
          />
          {activeMarkets.map((m) => (
            <Bar key={m.id} dataKey={m.id} stackId="a" fill={m.color} name={m.id} radius={[0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── DC Card ─────────────────────────────────────────────────────────────────

function DCCard({ dc }: { dc: DataCentre }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden hover:border-border/80 transition-colors">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Status strip */}
        <div
          className="w-1 self-stretch rounded-full shrink-0 mt-0.5"
          style={{ backgroundColor: STATUS_COLOR[dc.status] }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <p className="text-white text-sm font-medium leading-snug truncate">{dc.name}</p>
              <p className="text-muted text-xs mt-0.5">{dc.operator}</p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <span className="text-white font-mono font-semibold text-sm leading-none">
                {dc.capacityMW} MW
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ backgroundColor: `${STATUS_COLOR[dc.status]}20`, color: STATUS_COLOR[dc.status] }}
              >
                {STATUS_LABEL[dc.status]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-muted mt-2">
            <span>{dc.city}, {dc.country}</span>
            <span>·</span>
            <span>COD: {dc.expectedCOD}</span>
            <span>·</span>
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${OP_TYPE_COLOR[dc.operatorType]}15`, color: OP_TYPE_COLOR[dc.operatorType] }}
            >
              {OP_TYPE_LABEL[dc.operatorType]}
            </span>
          </div>

          {dc.hyperscalerTenants.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {dc.hyperscalerTenants.map((t) => (
                <span key={t} className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <button className="text-muted hover:text-white transition-colors shrink-0 mt-0.5">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border bg-surface-2/30">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
            {[
              ['PUE', dc.pue.toFixed(2)],
              ['Tier', `Tier ${dc.tierRating}`],
              ['Land', `${dc.landAreaHa} ha`],
              ['Reliability', dc.sourceReliability],
              ...(dc.occupancyRate != null ? [['Occupancy', `${Math.round(dc.occupancyRate * 100)}%`]] : []),
              ...(dc.grossFloorAreaM2 != null ? [['GFA', `${(dc.grossFloorAreaM2 / 1000).toFixed(0)}k m²`]] : []),
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-muted text-[10px]">{k}</p>
                <p className="text-white font-mono">{v}</p>
              </div>
            ))}
          </div>
          {dc.notes && (
            <p className="text-muted text-[10px] leading-relaxed mt-3 border-t border-border pt-3">
              {dc.notes}
            </p>
          )}
          {dc.tags && dc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {dc.tags.map((t) => (
                <span key={t} className="text-[10px] bg-surface-2 text-muted px-1.5 py-0.5 rounded">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DC Database tab ──────────────────────────────────────────────────────────

type SortKey = 'mw' | 'cod' | 'alpha';

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {

  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs transition-colors whitespace-nowrap ${
        active ? 'bg-accent text-white font-medium' : 'bg-surface-2 text-muted hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function DCDatabase({ allDCs }: { allDCs: DataCentre[] }) {
  const [country, setCountry] = useState<string>('ALL');
  const [status, setStatus] = useState<string>('ALL');
  const [opType, setOpType] = useState<string>('ALL');
  const [minMW, setMinMW] = useState(0);
  const [maxMW, setMaxMW] = useState(300);
  const [sort, setSort] = useState<SortKey>('mw');

  const maxCapacity = useMemo(() => Math.max(...allDCs.map((d) => d.capacityMW)), [allDCs]);

  const filtered = useMemo(() => {
    return allDCs.filter((d) => {
      if (country !== 'ALL' && d.country !== country) return false;
      if (status !== 'ALL' && d.status !== status) return false;
      if (opType !== 'ALL' && d.operatorType !== opType) return false;
      if (d.capacityMW < minMW || d.capacityMW > maxMW) return false;
      return true;
    }).sort((a, b) => {
      if (sort === 'mw') return b.capacityMW - a.capacityMW;
      if (sort === 'cod') return parseCODYear(a.expectedCOD) - parseCODYear(b.expectedCOD);
      return a.name.localeCompare(b.name);
    });
  }, [country, status, opType, minMW, maxMW, sort, allDCs]);

  const totalFiltered = filtered.reduce((s, d) => s + d.capacityMW, 0);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-muted text-xs w-16 shrink-0">Country</span>
          <div className="flex flex-wrap gap-1.5">
            {['ALL', 'MY', 'SG', 'ID', 'TH', 'PH', 'VN'].map((c) => (
              <FilterPill key={c} label={c} active={country === c} onClick={() => setCountry(c)} />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-muted text-xs w-16 shrink-0">Status</span>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill label="All" active={status === 'ALL'} onClick={() => setStatus('ALL')} />
            {(['operational', 'construction', 'announced', 'rumoured'] as DCStatus[]).map((s) => (
              <FilterPill key={s} label={STATUS_LABEL[s]} active={status === s} onClick={() => setStatus(s)} />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-muted text-xs w-16 shrink-0">Type</span>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill label="All" active={opType === 'ALL'} onClick={() => setOpType('ALL')} />
            {(Object.keys(OP_TYPE_LABEL) as OperatorType[]).map((t) => (
              <FilterPill key={t} label={OP_TYPE_LABEL[t]} active={opType === t} onClick={() => setOpType(t)} />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <span className="text-muted text-xs w-16 shrink-0">MW Range</span>
          <div className="flex items-center gap-3 flex-1 min-w-[200px]">
            <input
              type="range" min={0} max={maxCapacity} step={10} value={minMW}
              onChange={(e) => setMinMW(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <input
              type="range" min={0} max={maxCapacity} step={10} value={maxMW}
              onChange={(e) => setMaxMW(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="text-white text-xs font-mono whitespace-nowrap">
              {minMW}–{maxMW} MW
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-muted text-xs">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-surface-2 border border-border text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="mw">MW ↓</option>
              <option value="cod">COD</option>
              <option value="alpha">A–Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results header */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">
          {filtered.length} facilities · {totalFiltered.toLocaleString()} MW
        </span>
        <button
          className="text-muted hover:text-white transition-colors"
          onClick={() => { setCountry('ALL'); setStatus('ALL'); setOpType('ALL'); setMinMW(0); setMaxMW(maxCapacity); }}
        >
          Reset filters
        </button>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {filtered.map((dc) => (
          <DCCard key={dc.id} dc={dc} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted text-sm">
          No data centres match the current filters.
        </div>
      )}
    </div>
  );
}

// ─── Main CompetitivePanel ────────────────────────────────────────────────────

export function CompetitivePanel() {
  const [tab, setTab] = useState<Tab>('overview');
  const [showDCUpload, setShowDCUpload] = useState(false);

  const { extraDCs, addDCs } = useAppContext();
  const allDCs = useMemo(() => [...DC_DATABASE, ...extraDCs], [extraDCs]);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Competitive Intelligence"
        subtitle="SEA data centre market — supply, operators & pipeline"
      />

      {/* Tab bar */}
      <div className="border-b border-border px-6 flex gap-1 shrink-0 bg-bg">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-accent text-white'
                : 'border-transparent text-muted hover:text-white'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {showDCUpload && (
        <DCUploadModal onClose={() => setShowDCUpload(false)} onImport={addDCs} />
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {tab === 'overview' && (
          <>
            <MarketSummaryTable allDCs={allDCs} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <OperatorConcentration allDCs={allDCs} />
              <TopOperatorsTable allDCs={allDCs} />
            </div>
          </>
        )}

        {tab === 'pipeline' && (
          <>
            <SupplyPipelineChart allDCs={allDCs} />

            {/* Year-by-year breakdown table */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-white text-sm font-semibold">Pipeline Detail by Market & Year</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-2">
                      <th className="px-4 py-2.5 text-left text-muted font-medium">Facility</th>
                      <th className="px-4 py-2.5 text-left text-muted font-medium">Market</th>
                      <th className="px-4 py-2.5 text-left text-muted font-medium">Operator</th>
                      <th className="px-4 py-2.5 text-left text-muted font-medium">MW</th>
                      <th className="px-4 py-2.5 text-left text-muted font-medium">Status</th>
                      <th className="px-4 py-2.5 text-left text-muted font-medium">COD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allDCs
                      .filter((d) => d.status !== 'operational')
                      .sort((a, b) => parseCODYear(a.expectedCOD) - parseCODYear(b.expectedCOD))
                      .map((dc) => {
                        const mid = getMarketId(dc);
                        const mkt = MARKETS.find((m) => m.id === mid);
                        return (
                          <tr key={dc.id} className="hover:bg-surface-2 transition-colors">
                            <td className="px-4 py-2.5 text-white font-medium">{dc.name}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: mkt?.color ?? '#6B7280' }} />
                                <span className="text-muted">{mkt?.label ?? mid}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-muted">{dc.operator}</td>
                            <td className="px-4 py-2.5 text-white font-mono">{dc.capacityMW} MW</td>
                            <td className="px-4 py-2.5">
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{ backgroundColor: `${STATUS_COLOR[dc.status]}20`, color: STATUS_COLOR[dc.status] }}
                              >
                                {STATUS_LABEL[dc.status]}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-white font-mono">{dc.expectedCOD}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === 'database' && (
          <>
            <div className="flex items-center justify-end gap-2 -mt-2 mb-1">
              <button
                onClick={() => setShowDCUpload(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/30 hover:bg-accent/20 text-accent rounded-lg text-xs font-medium transition-colors"
              >
                <Upload size={11} /> Import DCs
              </button>
            </div>
            <DCDatabase allDCs={allDCs} />
          </>
        )}
      </div>
    </div>
  );
}
