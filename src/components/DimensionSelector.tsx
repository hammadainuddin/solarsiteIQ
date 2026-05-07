import type { HexScoreDimension } from '../types';

const DIMENSIONS: { key: HexScoreDimension; label: string; short: string }[] = [
  { key: 'composite',    label: 'Composite',         short: 'All' },
  { key: 'solar',        label: 'Solar Resource',     short: 'Solar' },
  { key: 'grid',         label: 'Grid',               short: 'Grid' },
  { key: 'land',         label: 'Land Suitability',   short: 'Land' },
  { key: 'availability', label: 'Land Availability',  short: 'Avail.' },
  { key: 'climate',      label: 'Climate Risk',        short: 'Climate' },
  { key: 'road',         label: 'Road Access',         short: 'Road' },
  { key: 'envSocial',    label: 'Env & Social',        short: 'Env' },
];

interface Props {
  active: HexScoreDimension;
  onChange: (d: HexScoreDimension) => void;
}

export default function DimensionSelector({ active, onChange }: Props) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex gap-1 bg-slate-900/90 border border-slate-700 rounded-lg p-1 shadow-xl">
      {DIMENSIONS.map((d) => (
        <button
          key={d.key}
          onClick={() => onChange(d.key)}
          title={d.label}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            active === d.key
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-700'
          }`}
        >
          {d.short}
        </button>
      ))}
    </div>
  );
}
