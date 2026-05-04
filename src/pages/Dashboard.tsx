import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Map, BarChart3, TrendingUp, Radar,
  Server, Zap, Activity, ArrowRight,
  Award, Globe,
} from 'lucide-react';
import { DC_DATABASE } from '../data/dcDatabase';
import { EXAMPLE_SITES } from '../data/candidateSites';
import { calculateSiteScore, DEFAULT_WEIGHTS } from '../utils/scoring';

// ─── Stats derived from data ──────────────────────────────────────────────────

function getDashboardStats() {
  const totalCapacityMW = DC_DATABASE.reduce((s, d) => s + d.capacityMW, 0);
  const pipelineMW = DC_DATABASE
    .filter(d => d.status === 'construction' || d.status === 'announced')
    .reduce((s, d) => s + d.capacityMW, 0);

  const scoredSites = EXAMPLE_SITES.map(site => ({
    site,
    score: calculateSiteScore(site, DC_DATABASE, DEFAULT_WEIGHTS).total,
  })).sort((a, b) => b.score - a.score);

  const topSite = scoredSites[0] ?? null;

  return {
    siteCount: EXAMPLE_SITES.length,
    topSite,
    totalCapacityMW,
    pipelineMW,
    operationalCount: DC_DATABASE.filter(d => d.status === 'operational').length,
    marketCount: new Set(DC_DATABASE.map(d => d.city)).size,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: boolean;
}

function StatCard({ label, value, sub, icon, accent = false }: StatCardProps) {
  return (
    <div className={`bg-surface border ${accent ? 'border-accent/40' : 'border-border'} rounded-xl p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted uppercase tracking-wider">{label}</span>
        <div className={`p-2 rounded-lg ${accent ? 'bg-accent/15' : 'bg-surface-2'}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold font-mono text-white">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

interface ModuleLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}

function ModuleLink({ to, icon, label, description }: ModuleLinkProps) {
  return (
    <Link
      to={to}
      className="group bg-surface border border-border hover:border-accent rounded-xl p-5 flex items-start gap-4 transition-colors"
    >
      <div className="p-2.5 rounded-lg bg-surface-2 group-hover:bg-accent/15 transition-colors shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white mb-1">{label}</p>
        <p className="text-xs text-muted leading-relaxed">{description}</p>
      </div>
      <ArrowRight size={16} className="text-muted group-hover:text-accent transition-colors shrink-0 mt-0.5" />
    </Link>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const stats = useMemo(() => getDashboardStats(), []);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Page header */}
      <div className="px-8 py-6 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold text-white">Dashboard</h1>
        <p className="text-xs text-muted mt-0.5">Southeast Asia data centre site intelligence overview</p>
      </div>

      <div className="flex-1 px-8 py-6 space-y-8">

        {/* Summary stats */}
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Summary</h2>
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              label="Sites Under Evaluation"
              value={String(stats.siteCount)}
              sub="Active candidate pipeline"
              icon={<Activity size={16} className="text-accent" />}
              accent
            />
            <StatCard
              label="Highest Scoring Site"
              value={stats.topSite ? `${Math.round(stats.topSite.score)}/100` : '—'}
              sub={stats.topSite ? stats.topSite.site.name : 'No sites scored yet'}
              icon={<Award size={16} className="text-amber-400" />}
            />
            <StatCard
              label="SEA Capacity Tracked"
              value={`${(stats.totalCapacityMW / 1000).toFixed(1)} GW`}
              sub={`Across ${stats.operationalCount} operational facilities`}
              icon={<Server size={16} className="text-muted" />}
            />
            <StatCard
              label="Pipeline (Constr. + Ann.)"
              value={`${stats.pipelineMW.toLocaleString()} MW`}
              sub={`${stats.marketCount} city markets covered`}
              icon={<Globe size={16} className="text-muted" />}
            />
          </div>
        </div>

        {/* Module quick links */}
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Modules</h2>
          <div className="grid grid-cols-2 gap-4">
            <ModuleLink
              to="/map"
              icon={<Map size={18} className="text-accent" />}
              label="Map View"
              description="Interactive SEA infrastructure map. Overlay substations, fibre routes, candidate sites and existing DC campuses."
            />
            <ModuleLink
              to="/scorecard"
              icon={<BarChart3 size={18} className="text-accent" />}
              label="Site Scorecard"
              description="Multi-criteria scoring engine for candidate sites. Power, competition, utilities, land risk and market access."
            />
            <ModuleLink
              to="/financial"
              icon={<TrendingUp size={18} className="text-accent" />}
              label="Financial Model"
              description="Full 20-year project-finance DCF. Equity IRR, DSCR waterfall, sensitivity tornado and scenario analysis."
            />
            <ModuleLink
              to="/intel"
              icon={<Radar size={18} className="text-accent" />}
              label="Market Intelligence"
              description="Competitive landscape: supply pipeline, operator concentration, DC database with filterable cards."
            />
          </div>
        </div>

        {/* DC status breakdown */}
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">SEA DC Status Breakdown</h2>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-4 divide-x divide-border">
              {([ 'operational', 'construction', 'announced', 'rumoured' ] as const).map(status => {
                const dcs = DC_DATABASE.filter(d => d.status === status);
                const mw = dcs.reduce((s, d) => s + d.capacityMW, 0);
                const color = {
                  operational: 'text-red-400',
                  construction: 'text-orange-400',
                  announced: 'text-yellow-400',
                  rumoured: 'text-muted',
                }[status];
                return (
                  <div key={status} className="px-6 py-4">
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${color}`}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </p>
                    <p className="text-2xl font-bold font-mono text-white">{dcs.length}</p>
                    <p className="text-xs text-muted mt-1">{mw.toLocaleString()} MW</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent sites */}
        {EXAMPLE_SITES.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">Candidate Sites</h2>
              <Link to="/scorecard" className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
                View Scorecard <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-2">
              {EXAMPLE_SITES.map(site => (
                <div key={site.id} className="bg-surface border border-border rounded-lg px-4 py-3 flex items-center gap-4">
                  <div className="p-1.5 rounded-md bg-surface-2 shrink-0">
                    <Zap size={14} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{site.name}</p>
                    <p className="text-xs text-muted">{site.country} · {site.city} · {site.landAreaHa} ha</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    site.status === 'available'
                      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                      : site.status === 'under_review'
                      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                      : 'text-muted border-border'
                  }`}>
                    {site.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
