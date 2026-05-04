import { Server, Download } from 'lucide-react';

interface GlobalHeaderProps {
  onExport: () => void;
}

export function GlobalHeader({ onExport }: GlobalHeaderProps) {
  return (
    <header className="h-11 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0 z-20">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <Server size={14} className="text-white" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">DC SiteIQ</span>
          <span className="hidden lg:block text-muted text-xs border-l border-border pl-2">
            Southeast Asia Data Centre Site Intelligence
          </span>
        </div>
      </div>

      <button
        onClick={onExport}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-white bg-surface-2 hover:bg-accent border border-border hover:border-accent px-3 py-1.5 rounded-lg transition-colors"
      >
        <Download size={12} />
        <span className="hidden sm:block">Export Report</span>
      </button>
    </header>
  );
}
