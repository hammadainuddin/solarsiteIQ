import type { NorthernMyState } from '../types';

const STATES: (NorthernMyState | 'All')[] = ['All', 'Perak', 'Kedah', 'Penang', 'Perlis'];

interface Props {
  active: NorthernMyState | 'All';
  onChange: (s: NorthernMyState | 'All') => void;
}

export default function StateFilter({ active, onChange }: Props) {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex gap-1 bg-slate-900/90 border border-slate-700 rounded-full px-2 py-1 shadow-xl">
      {STATES.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            active === s
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-700'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
