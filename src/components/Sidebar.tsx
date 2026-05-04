import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Map, BarChart3, TrendingUp, Zap, Radar, Settings } from 'lucide-react';
import { SettingsModal } from './SettingsModal';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/map', label: 'Map View', icon: Map },
  { to: '/scorecard', label: 'Scorecard', icon: BarChart3 },
  { to: '/financial', label: 'Financial Model', icon: TrendingUp },
  { to: '/intel', label: 'Market Intel', icon: Radar },
];

export function Sidebar() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <aside className="w-16 lg:w-56 h-full bg-surface border-r border-border flex flex-col shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <Zap size={14} className="text-white" />
          </div>
          <span className="hidden lg:block font-semibold text-white text-sm tracking-wide">
            DC SiteIQ
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-accent text-white font-medium'
                    : 'text-muted hover:text-white hover:bg-surface-2'
                }`
              }
            >
              <Icon size={17} className="shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-border flex items-center justify-between">
          <p className="hidden lg:block text-xs text-muted px-2">Southeast Asia · 2025</p>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted hover:text-white hover:bg-surface-2 transition-colors w-full lg:w-auto"
            title="Settings"
          >
            <Settings size={16} className="shrink-0" />
            <span className="hidden lg:block text-xs">Settings</span>
          </button>
        </div>
      </aside>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
