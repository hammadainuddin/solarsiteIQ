// Floating results panel shown when the site area drawing tool completes.
// Anchored to the bottom-left of the map, above the zoom controls.

import type { SiteAreaResult } from '../utils/siteAreaAnalysis';

interface Props {
  result: SiteAreaResult;
  onClose: () => void;
}

const LAND_USE_LABELS: Record<string, string> = {
  idle_agri:  'Idle / Vacant',
  rubber:     'Rubber',
  mixed_agri: 'Mixed Agri',
  oil_palm:   'Oil Palm',
  paddy:      'Paddy',
  industrial: 'Industrial',
  commercial: 'Commercial',
  urban:      'Urban / Residential',
  kampung:    'Kampung / Rural Village',
  infrastructure: 'Infrastructure',
  water:      'Water (FPV)',
  forest:     'Forest',
  river:      'River',
  unknown:    'Unknown',
};

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-slate-400 text-[11px] shrink-0">{label}</span>
      <span className={`text-[11px] font-semibold text-right ${accent ? 'text-amber-400' : 'text-white'}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-slate-500 text-[9px] font-bold uppercase tracking-wider mb-1">{title}</p>
      {children}
    </div>
  );
}

function downloadCsv(result: SiteAreaResult) {
  const headers = [
    'cell_id', 'lat', 'lng', 'state', 'composite_score', 'land_use',
    'capacity_kwp', 'annual_yield_mwh', 'pvgis_ey_kwh_per_kwp',
    'ghi_kwh_m2_day', 'dist_to_grid_km', 'flood_risk', 'is_protected',
  ];

  const rows = result.cellsInside.map((t) => [
    t.h3Index,
    t.centerLat.toFixed(4),
    t.centerLng.toFixed(4),
    t.states.join(' / '),
    t.scores.composite,
    t.attributes.landUse,
    t.attributes.capacityKWp,
    t.attributes.annualYieldMWh,
    t.attributes.pvgisEyKWhPerKWp,
    t.attributes.ghiKwhM2Day,
    t.attributes.distToGridKm,
    t.attributes.floodRisk,
    t.attributes.isProtected,
  ]);

  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'solar_siteiq_area_analysis.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function SiteAreaInfoBox({ result, onClose }: Props) {
  const { drawnAreaKm2, cellsInside, suitableCells, goCells } = result;
  const total = cellsInside.length || 1;

  const suitablePct = Math.round((suitableCells.length / total) * 100);
  const goPct       = Math.round((goCells.length       / total) * 100);

  return (
    <div className="absolute bottom-8 left-3 z-[2000] w-64 bg-slate-950 border border-slate-600 rounded-xl shadow-2xl ring-1 ring-black/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-900">
        <span className="text-white text-xs font-semibold">Site Analysis</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-slate-700 transition-colors"
        >
          ×
        </button>
      </div>

      <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
        {/* Area summary */}
        <Section title="Coverage">
          <Row label="Drawn area"     value={`${drawnAreaKm2} km²`} />
          <Row label="Cells inside"   value={`${cellsInside.length} km²`} />
          <Row label="Suitable (≥45)" value={`${suitableCells.length} km² · ${suitablePct}%`} accent />
          <Row label="Go (≥70)"       value={`${goCells.length} km² · ${goPct}%`} accent />
        </Section>

        <div className="border-t border-slate-700/60" />

        {/* Capacity breakdown */}
        <Section title="Installed Capacity">
          {result.groundMountMWp > 0 && (
            <Row label="Ground-mount" value={`${result.groundMountMWp.toLocaleString()} MWp`} />
          )}
          {result.fpvMWp > 0 && (
            <Row label="FPV (reservoirs)" value={`${result.fpvMWp.toLocaleString()} MWp`} />
          )}
          {result.rooftopMWp > 0 && (
            <Row label="Rooftop (ind+com)" value={`${result.rooftopMWp.toLocaleString()} MWp`} />
          )}
          <div className="border-t border-slate-700/40 my-0.5" />
          <Row label="Total" value={`${result.totalCapacityMWp.toLocaleString()} MWp`} accent />
        </Section>

        <div className="border-t border-slate-700/60" />

        {/* Yield & CF */}
        <Section title="Generation">
          <Row label="Annual yield"    value={`${result.totalYieldGWhPerYear.toLocaleString()} GWh/yr`} accent />
          <Row label="Capacity factor" value={`${result.avgCapacityFactor}%`} />
          <Row label="Irradiation"     value={`${result.avgPvgisEyKWhPerKWp.toLocaleString()} kWh/kWp/yr`} />
          <Row label="Composite score" value={`${result.avgScore} / 100`} />
          <Row label="Grid distance"   value={`avg ${result.avgGridDistKm} km`} />
        </Section>

        {/* Land use breakdown */}
        {result.landUseBreakdown.length > 0 && (
          <>
            <div className="border-t border-slate-700/60" />
            <Section title="Land Use Breakdown">
              {result.landUseBreakdown.map(({ landUse, count, capacityMWp }) => {
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={landUse} className="py-0.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-slate-300 text-[11px]">{LAND_USE_LABELS[landUse] ?? landUse}</span>
                      <span className="text-slate-400 text-[10px]">{pct}%</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-slate-500 text-[9px] w-16 text-right">{capacityMWp} MWp</span>
                    </div>
                  </div>
                );
              })}
            </Section>
          </>
        )}

        <div className="border-t border-slate-700/60" />

        {/* Top constraint */}
        <div>
          <p className="text-slate-500 text-[9px] font-bold uppercase tracking-wider mb-1">Top Constraint</p>
          <p className="text-amber-300 text-[11px] leading-snug">{result.topConstraint}</p>
        </div>

        {/* Export */}
        <button
          onClick={() => downloadCsv(result)}
          className="w-full mt-1 text-[11px] py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
