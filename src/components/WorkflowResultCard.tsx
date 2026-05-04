import {
  Zap, Leaf, BarChart2, Wifi, AlertTriangle, Star,
  MapPin, Clock, Shield, Wind, DollarSign, Sun,
  TrendingUp, Server, Globe, Droplets, Building2, Info,
} from 'lucide-react';
import type { WorkflowResult, WorkflowType } from '../types';

// ─── Score gauge ─────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  return s >= 70 ? '#10B981' : s >= 50 ? '#F59E0B' : '#EF4444';
}

function ScoreGauge({ score }: { score: number }) {
  const r = 26, cx = 34, cy = 34;
  const circ = 2 * Math.PI * r;
  const arc  = (Math.min(100, Math.max(0, score)) / 100) * circ;
  const color = scoreColor(score);
  return (
    <svg width={68} height={68} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1F2937" strokeWidth={7} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={7}
        strokeDasharray={`${arc} ${circ - arc}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={15} fontWeight="700" fontFamily="ui-monospace,monospace"
      >
        {score}
      </text>
    </svg>
  );
}

// ─── Metric value ─────────────────────────────────────────────────────────────

function MetricValue({ value }: { value: string }) {
  const m = value.match(/^(\d{1,3})\/100$/);
  if (m) {
    const n = parseInt(m[1]);
    const c = scoreColor(n);
    return (
      <div className="flex items-center gap-1.5 mt-0.5">
        <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${n}%`, background: c }} />
        </div>
        <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: c }}>{value}</span>
      </div>
    );
  }
  const isEmpty = !value || value === 'N/A';
  return (
    <span className={`text-[11px] leading-snug break-words ${isEmpty ? 'text-muted/50 italic' : 'text-white/95'}`}>
      {value || '—'}
    </span>
  );
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const METRIC_ICON: Record<string, React.ReactNode> = {
  'Grid Operator':        <Building2 size={11} />,
  'Nearest Substation':   <MapPin size={11} />,
  'Connection Voltage':   <Zap size={11} />,
  'Timeline':             <Clock size={11} />,
  'N-1 Redundancy':       <Shield size={11} />,
  'Grid Emission Factor': <Wind size={11} />,
  'Renewable Share':      <Leaf size={11} />,
  'PPA Availability':     <Sun size={11} />,
  'PPA Price Range':      <DollarSign size={11} />,
  'BYOP Feasibility':     <Sun size={11} />,
  'Market Zone':          <MapPin size={11} />,
  'Existing Supply':      <Server size={11} />,
  'Pipeline Supply':      <TrendingUp size={11} />,
  'Rack Rate':            <DollarSign size={11} />,
  'Hyperscaler Demand':   <TrendingUp size={11} />,
  'Absorption Outlook':   <BarChart2 size={11} />,
  'RTT to Singapore':     <Wifi size={11} />,
  'RTT to Hong Kong':     <Wifi size={11} />,
  'RTT to Tokyo':         <Wifi size={11} />,
  'Submarine Cables':     <Globe size={11} />,
  'IXP Presence':         <Wifi size={11} />,
  'Connectivity Grade':   <Wifi size={11} />,
  'Flood Risk':           <Droplets size={11} />,
  'Seismic Risk':         <AlertTriangle size={11} />,
  'Water Stress':         <Droplets size={11} />,
  'Cyclone Exposure':     <Wind size={11} />,
  'Overall Risk Rating':  <Shield size={11} />,
  'Power Score':          <Zap size={11} />,
  'Carbon & RE Score':    <Leaf size={11} />,
  'Market Score':         <BarChart2 size={11} />,
  'Connectivity Score':   <Wifi size={11} />,
  'Environment Score':    <AlertTriangle size={11} />,
  'Composite Score':      <Star size={11} />,
  'Swing Factor':         <TrendingUp size={11} />,
};

const WORKFLOW_ICON: Record<WorkflowType, React.ReactNode> = {
  power:        <Zap size={13} />,
  carbon:       <Leaf size={13} />,
  load:         <BarChart2 size={13} />,
  connectivity: <Wifi size={13} />,
  environment:  <AlertTriangle size={13} />,
  suitability:  <Star size={13} />,
};

const WORKFLOW_LABEL: Record<WorkflowType, string> = {
  power:        'Power Infrastructure',
  carbon:       'Carbon & RE',
  load:         'Market Absorption',
  connectivity: 'Connectivity',
  environment:  'Environmental Risk',
  suitability:  'Site Suitability',
};

const VERDICT_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  'Go':             { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'Conditional Go': { bg: 'bg-amber-500/20',  text: 'text-amber-400',  border: 'border-amber-500/30'  },
  'Avoid':          { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/30'    },
};

// ─── Metric row ───────────────────────────────────────────────────────────────

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-muted/70 mt-0.5 shrink-0">
        {METRIC_ICON[label] ?? <Star size={11} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted/70 uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <MetricValue value={value} />
      </div>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface Props {
  result: WorkflowResult;
}

export function WorkflowResultCard({ result }: Props) {
  const vs = VERDICT_STYLE[result.verdict] ?? VERDICT_STYLE['Conditional Go'];
  const entries = Object.entries(result.metrics);

  // Detect low-data state: fewer than 2 metrics have real values
  const realValueCount = entries.filter(([, v]) => v && v !== 'N/A').length;
  const isLowData = realValueCount < 2;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden text-[11px]">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-surface-2/40">
        <span className="text-accent">{WORKFLOW_ICON[result.type]}</span>
        <span className="text-white font-semibold flex-1 text-xs">{WORKFLOW_LABEL[result.type]}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${vs.bg} ${vs.text} ${vs.border}`}>
          {result.verdict}
        </span>
      </div>

      {/* ── Low-data notice ── */}
      {isLowData && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/5 border-b border-amber-500/20 text-[10px] text-amber-400/80">
          <Info size={11} className="shrink-0" />
          <span>Limited data extracted — enable web search in Settings for richer results.</span>
        </div>
      )}

      {/* ── Score + top metrics ── */}
      <div className="flex items-start gap-3 px-3 py-3 border-b border-border/40">
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <ScoreGauge score={result.score} />
          <span className="text-[9px] text-muted/60 uppercase tracking-wide">Score</span>
        </div>

        <div className="flex-1 flex flex-col gap-2.5 min-w-0">
          {entries.slice(0, 4).map(([key, val]) => (
            <MetricRow key={key} label={key} value={val} />
          ))}
        </div>
      </div>

      {/* ── Remaining metrics ── */}
      {entries.length > 4 && (
        <div className="px-3 py-3 border-b border-border/40 flex flex-col gap-2.5">
          {entries.slice(4).map(([key, val]) => (
            <MetricRow key={key} label={key} value={val} />
          ))}
        </div>
      )}

      {/* ── Key findings ── */}
      {result.topFindings.length > 0 && (
        <div className="px-3 py-3 border-b border-border/40 space-y-2">
          <p className="text-[10px] text-muted/70 uppercase tracking-wide">Key Findings</p>
          {result.topFindings.map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-accent/80 shrink-0 mt-0.5 text-[10px] font-bold leading-none">▸</span>
              <span className="text-white/90 leading-relaxed">{f}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Summary paragraph ── */}
      {result.summary && (
        <div className="px-3 py-3 border-b border-border/40">
          <p className="text-[10px] text-muted/70 uppercase tracking-wide mb-1.5">Summary</p>
          <p className="text-white/85 leading-relaxed">{result.summary}</p>
        </div>
      )}

      {/* ── Key risk ── */}
      {result.keyRisk && result.keyRisk !== 'No data provided' && (
        <div className="px-3 py-2.5 flex items-start gap-2 bg-red-500/5">
          <AlertTriangle size={11} className="text-red-400/80 shrink-0 mt-0.5" />
          <span className="text-red-300/90 leading-relaxed">{result.keyRisk}</span>
        </div>
      )}
    </div>
  );
}
