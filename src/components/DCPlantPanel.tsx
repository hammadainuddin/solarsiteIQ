import { X, Server } from 'lucide-react';
import type { DataCentre, DCBlock, DCBlockStatus } from '../types';

interface DCPlantPanelProps {
  dc: DataCentre;
  onClose: () => void;
}

const STATUS_FILL: Record<DCBlockStatus, string> = {
  live:                '#22c55e',
  commissioning:       '#eab308',
  under_construction:  '#f97316',
  planned:             '#6b7280',
};

const STATUS_LABEL: Record<DCBlockStatus, string> = {
  live:                'Live',
  commissioning:       'Commissioning',
  under_construction:  'Under construction',
  planned:             'Planned',
};

const CELL = 96;     // px per grid cell
const PADDING = 24;

export function DCPlantPanel({ dc, onClose }: DCPlantPanelProps) {
  const layout = dc.plantLayout;
  if (!layout) return null;

  const W = layout.gridSize.cols * CELL + PADDING * 2;
  const H = layout.gridSize.rows * CELL + PADDING * 2;

  const liveMW = layout.blocks
    .filter((b) => b.status === 'live')
    .reduce((s, b) => s + b.capacityMW, 0);
  const totalMW = layout.blocks.reduce((s, b) => s + b.capacityMW, 0);

  function cellCenter(col: number, row: number): { cx: number; cy: number } {
    return {
      cx: PADDING + col * CELL + CELL / 2,
      cy: PADDING + row * CELL + CELL / 2,
    };
  }

  function flowDuration(util?: number): string {
    // Higher utilisation → faster animation. 0 util → 8s, 100 util → 1.5s
    const u = Math.max(0, Math.min(100, util ?? 60));
    return `${(8 - (u / 100) * 6.5).toFixed(2)}s`;
  }

  return (
    <aside
      className="side-panel-enter dc-plant fixed right-0 top-11 bottom-0 w-[480px] bg-bg border-l border-border z-[1500] flex flex-col shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Server size={14} className="text-accent shrink-0" />
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">{dc.name}</p>
            <p className="text-muted text-[10px] truncate">{dc.operator} · {dc.city}, {dc.country}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-white p-1 rounded-lg hover:bg-surface-2 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-border shrink-0">
        <Stat label="Live" value={`${liveMW} MW`} accent="#22c55e" />
        <Stat label="Nameplate" value={`${totalMW} MW`} accent="#f8fafc" />
        <Stat label="Blocks" value={`${layout.blocks.length}`} accent="#a78bfa" />
      </div>

      {/* Plant SVG */}
      <div className="flex-1 overflow-auto p-4">
        <svg width={W} height={H} className="block max-w-full">
          {/* Grid background */}
          <defs>
            <pattern id="dc-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
              <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke="#1F2937" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x={PADDING} y={PADDING} width={W - PADDING * 2} height={H - PADDING * 2} fill="url(#dc-grid)" />

          {/* Power-flow paths from each substation to each block */}
          {layout.substations.map((sub) =>
            layout.blocks.map((block) => {
              if (block.status === 'planned') return null;
              const a = cellCenter(sub.gridCol, sub.gridRow);
              const b = cellCenter(block.gridCol, block.gridRow);
              const midX = (a.cx + b.cx) / 2;
              const path = `M ${a.cx} ${a.cy} C ${midX} ${a.cy}, ${midX} ${b.cy}, ${b.cx} ${b.cy}`;
              const isLive = block.status === 'live';
              return (
                <g key={`${sub.id}-${block.id}`}>
                  <path d={path} fill="none" stroke="#374151" strokeWidth={2.5} />
                  {isLive && (
                    <path
                      className="flow"
                      d={path}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth={2}
                      style={{ animationDuration: flowDuration(block.utilisationPct) }}
                    />
                  )}
                </g>
              );
            }),
          )}

          {/* Substations (chevron) */}
          {layout.substations.map((sub) => {
            const { cx, cy } = cellCenter(sub.gridCol, sub.gridRow);
            return (
              <g key={sub.id}>
                <polygon
                  points={`${cx},${cy - 18} ${cx + 18},${cy} ${cx},${cy + 18} ${cx - 18},${cy}`}
                  fill="#0f172a"
                  stroke="#fbbf24"
                  strokeWidth={2}
                />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fill="#fbbf24" fontWeight={600}>
                  ⚡
                </text>
                <text x={cx} y={cy + 32} textAnchor="middle" fontSize="9" fill="#9CA3AF">
                  {sub.name}
                </text>
                <text x={cx} y={cy + 44} textAnchor="middle" fontSize="9" fill="#6B7280" fontFamily="monospace">
                  {sub.mw} MW
                </text>
              </g>
            );
          })}

          {/* Blocks (rounded rectangles) */}
          {layout.blocks.map((block) => (
            <BlockShape key={block.id} block={block} cellCenter={cellCenter} />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="border-t border-border px-4 py-3 shrink-0">
        <p className="text-muted text-[10px] uppercase tracking-wider mb-2">Block status</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {(Object.keys(STATUS_FILL) as DCBlockStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-2 text-xs text-muted">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: STATUS_FILL[s] }} />
              <span>{STATUS_LABEL[s]}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted/60 mt-2 leading-relaxed">
          Animated flow lines indicate live power delivery. Speed scales with block utilisation.
        </p>
      </div>
    </aside>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <div className="text-muted text-[10px] uppercase tracking-wider">{label}</div>
      <div className="font-mono text-sm font-semibold" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function BlockShape({
  block,
  cellCenter,
}: {
  block: DCBlock;
  cellCenter: (col: number, row: number) => { cx: number; cy: number };
}) {
  const { cx, cy } = cellCenter(block.gridCol, block.gridRow);
  const w = 80;
  const h = 56;
  const fill = STATUS_FILL[block.status];
  const dashed = block.status === 'planned' || block.status === 'under_construction';
  return (
    <g>
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={8}
        fill={fill}
        fillOpacity={block.status === 'planned' ? 0.18 : 0.85}
        stroke={fill}
        strokeWidth={1.5}
        strokeDasharray={dashed ? '5 4' : undefined}
      />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="#fff" fontWeight={600}>
        {block.name}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="10" fill="#fff" fontFamily="monospace" opacity={0.85}>
        {block.capacityMW} MW
      </text>
      {block.status === 'live' && block.utilisationPct != null && (
        <text x={cx} y={cy + 22} textAnchor="middle" fontSize="9" fill="#fff" opacity={0.7}>
          {block.utilisationPct}% util
        </text>
      )}
    </g>
  );
}
