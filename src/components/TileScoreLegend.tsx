import type { HexScoreDimension } from '../types';

const DIMENSION_LABELS: Record<HexScoreDimension, string> = {
  composite:    'Composite Score',
  solar:        'Solar Resource',
  grid:         'Grid Interconnection',
  land:         'Land Suitability',
  availability: 'Land Availability',
  climate:      'Climate Risk',
  road:         'Road Access',
  envSocial:    'Env & Social',
};

interface Props {
  activeDimension: HexScoreDimension;
}

export default function TileScoreLegend({ activeDimension }: Props) {
  return (
    <div className="absolute bottom-8 right-4 z-[1000] bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs shadow-xl min-w-[160px]">
      <div className="text-slate-300 font-semibold mb-2 text-center">
        {DIMENSION_LABELS[activeDimension]}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ background: 'rgba(34,197,94,0.75)' }} />
          <span className="text-slate-300">Go — ≥70</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ background: 'rgba(251,191,36,0.75)' }} />
          <span className="text-slate-300">Conditional — 45–69</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ background: 'rgba(239,68,68,0.75)' }} />
          <span className="text-slate-300">Avoid — &lt;45</span>
        </div>
      </div>
    </div>
  );
}
