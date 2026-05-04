import { useState } from 'react';
import {
  X, ExternalLink, ChevronDown, ChevronRight,
  Briefcase, History, FileText, Users, Clock,
} from 'lucide-react';
import type {
  DataCentre, DevelopmentMilestone, EvidenceItem, OwnershipChain,
} from '../types';

interface DCIntelPanelProps {
  dc: DataCentre;
  onClose: () => void;
  /** Right-edge offset, lets the intel panel sit alongside the plant panel */
  rightOffsetPx?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function DCIntelPanel({
  dc, onClose, rightOffsetPx = 0, onMouseEnter, onMouseLeave,
}: DCIntelPanelProps) {
  const intel = dc.intel;
  if (!intel) return null;

  return (
    <aside
      className="side-panel-enter fixed top-11 bottom-0 w-[380px] bg-bg border-l border-border z-[1400] flex flex-col shadow-2xl"
      style={{ right: rightOffsetPx }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate">{dc.name}</p>
          <p className="text-muted text-[10px] truncate">{dc.operator} · {dc.city}, {dc.country}</p>
        </div>
        <button onClick={onClose} className="text-muted hover:text-white p-1 rounded-lg hover:bg-surface-2 transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section icon={<History size={12} />} title="History" defaultOpen={false}>
          <p className="text-xs text-muted leading-relaxed whitespace-pre-line">{intel.history}</p>
        </Section>

        <Section icon={<Clock size={12} />} title="Development Timeline" defaultOpen>
          <Timeline milestones={intel.timeline} />
        </Section>

        <Section icon={<Briefcase size={12} />} title="Ownership" defaultOpen={false}>
          <OwnershipBlock chain={intel.ownership} />
        </Section>

        <Section icon={<FileText size={12} />} title={`Evidence (${intel.evidence.length})`} defaultOpen>
          <div className="space-y-2">
            {intel.evidence.map((ev, i) => (
              <EvidenceCard key={i} item={ev} />
            ))}
          </div>
        </Section>

        {intel.keyContacts && intel.keyContacts.length > 0 && (
          <Section icon={<Users size={12} />} title="Key Contacts" defaultOpen={false}>
            <ul className="space-y-1.5">
              {intel.keyContacts.map((c, i) => (
                <li key={i} className="text-xs">
                  <span className="text-white">{c.name}</span>
                  <span className="text-muted"> · {c.role}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({
  icon, title, defaultOpen = false, children,
}: {
  icon: React.ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-white uppercase tracking-wider">
          <span className="text-accent">{icon}</span>
          {title}
        </span>
        {open ? <ChevronDown size={12} className="text-muted" /> : <ChevronRight size={12} className="text-muted" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function Timeline({ milestones }: { milestones: DevelopmentMilestone[] }) {
  const color: Record<DevelopmentMilestone['status'], string> = {
    completed:    '#22c55e',
    in_progress:  '#eab308',
    planned:      '#6b7280',
  };
  return (
    <ol className="relative pl-4 space-y-2.5">
      <span className="absolute left-1 top-1 bottom-1 w-px bg-border" />
      {milestones.map((m, i) => (
        <li key={i} className="relative">
          <span
            className="absolute -left-3 top-1.5 w-2 h-2 rounded-full ring-2 ring-bg"
            style={{ backgroundColor: color[m.status] }}
          />
          <p className="text-[10px] text-muted font-mono">{m.date}</p>
          <p className="text-xs text-white font-medium">{m.title}</p>
          {m.detail && <p className="text-[11px] text-muted leading-relaxed mt-0.5">{m.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

function OwnershipBlock({ chain }: { chain: OwnershipChain }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Current</p>
        <div className="space-y-1.5">
          {chain.current.map((o, i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white truncate pr-2">{o.entity}</span>
                <span className="text-muted font-mono shrink-0">
                  {o.stake != null ? `${o.stake}%` : '—'} · since {o.sinceYear}
                </span>
              </div>
              {o.stake != null && (
                <div className="mt-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${o.stake}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {chain.history && chain.history.length > 0 && (
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">History</p>
          <ul className="space-y-1">
            {chain.history.map((h, i) => (
              <li key={i} className="text-[11px] text-muted leading-relaxed">
                <span className="text-white">{h.entity}</span> ({h.from}–{h.to}): {h.event}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EvidenceCard({ item }: { item: EvidenceItem }) {
  const conf: Record<EvidenceItem['confidence'], string> = {
    high:   'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    medium: 'bg-amber-500/20  text-amber-400  border-amber-500/30',
    low:    'bg-red-500/20    text-red-400    border-red-500/30',
  };
  return (
    <div className="bg-surface-2/50 border border-border rounded-lg p-2.5">
      <p className="text-xs text-white leading-snug">{item.claim}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted truncate">
          {item.source} · {item.date}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase border ${conf[item.confidence]}`}>
            {item.confidence}
          </span>
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-white">
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
