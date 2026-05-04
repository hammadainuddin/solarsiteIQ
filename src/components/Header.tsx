import { Bell, Search } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-6 shrink-0">
      <div>
        <h1 className="text-white font-semibold text-sm">{title}</h1>
        {subtitle && <p className="text-muted text-xs">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button className="p-2 rounded-lg text-muted hover:text-white hover:bg-surface-2 transition-colors">
          <Search size={16} />
        </button>
        <button className="p-2 rounded-lg text-muted hover:text-white hover:bg-surface-2 transition-colors">
          <Bell size={16} />
        </button>
        <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center">
          <span className="text-white text-xs font-semibold">DC</span>
        </div>
      </div>
    </header>
  );
}
