import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaPositive?: boolean;
  icon?: LucideIcon;
  accent?: boolean;
}

export function KPICard({
  label,
  value,
  unit,
  delta,
  deltaPositive,
  icon: Icon,
  accent = false,
}: KPICardProps) {
  return (
    <div
      className={`bg-surface rounded-xl border p-4 flex flex-col gap-2 ${
        accent ? 'border-accent/40' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted text-xs font-medium uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className={`p-1.5 rounded-lg ${accent ? 'bg-accent/15' : 'bg-surface-2'}`}>
            <Icon size={14} className={accent ? 'text-accent' : 'text-muted'} />
          </div>
        )}
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-white text-2xl font-semibold font-mono leading-none">{value}</span>
        {unit && <span className="text-muted text-sm pb-0.5">{unit}</span>}
      </div>
      {delta && (
        <span
          className={`text-xs font-medium ${
            deltaPositive ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {deltaPositive ? '▲' : '▼'} {delta}
        </span>
      )}
    </div>
  );
}
