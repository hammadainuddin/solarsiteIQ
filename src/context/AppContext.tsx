import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { SolarWorkflowType, PinLocation, HexTile, HexScoreDimension, NorthernMyState } from '../types';
import type { SubstationFeature } from '../data/infraLayers';
import { fetchNorthernMyBoundariesFromOSM, type StateBoundaryGeo } from '../utils/overpass';
import type { LLMConfig } from '../utils/llmConfig';

export interface AppContextValue {
  // Claude assistant
  claudeOpen: boolean;
  setClaudeOpen: (open: boolean) => void;
  pendingClaudePrompt: string | null;
  setPendingClaudePrompt: (p: string | null) => void;
  openClaudeWithPrompt: (prompt: string) => void;

  // Workflows
  activeWorkflow: SolarWorkflowType | null;
  setActiveWorkflow: (w: SolarWorkflowType | null) => void;

  // Pin drop
  pinLocation: PinLocation | null;
  setPinLocation: (p: PinLocation | null) => void;
  pinMode: boolean;
  setPinMode: (m: boolean) => void;

  // Hex grid
  selectedTile: HexTile | null;
  setSelectedTile: (tile: HexTile | null) => void;
  activeDimension: HexScoreDimension;
  setActiveDimension: (d: HexScoreDimension) => void;
  stateFilter: NorthernMyState | 'All';
  setStateFilter: (s: NorthernMyState | 'All') => void;

  // Uploaded data
  extraSubstations: SubstationFeature[];
  addSubstations: (subs: SubstationFeature[]) => void;

  // OSM state boundary polygons — fetched once, used both for rendering borders
  // and as ground truth for offshore-tile exclusion in hex generation.
  boundaries: StateBoundaryGeo[] | null;

  // Shared LLM config — fetched from /api/config on mount.
  // Takes priority over per-user localStorage config. Null until resolved.
  sharedLLMConfig: LLMConfig | null;
  sharedLLMConfigLoaded: boolean;
  setSharedLLMConfig: (cfg: LLMConfig | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [pendingClaudePrompt, setPendingClaudePrompt] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<SolarWorkflowType | null>(null);
  const [pinLocation, setPinLocation] = useState<PinLocation | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [selectedTile, setSelectedTile] = useState<HexTile | null>(null);
  const [activeDimension, setActiveDimension] = useState<HexScoreDimension>('composite');
  const [stateFilter, setStateFilter] = useState<NorthernMyState | 'All'>('All');
  const [extraSubstations, setExtraSubstations] = useState<SubstationFeature[]>([]);
  const [boundaries, setBoundaries] = useState<StateBoundaryGeo[] | null>(null);
  const [sharedLLMConfig, setSharedLLMConfig] = useState<LLMConfig | null>(null);
  const [sharedLLMConfigLoaded, setSharedLLMConfigLoaded] = useState(false);

  useEffect(() => {
    // /api/config is a Vercel serverless function — not available during local dev.
    if (import.meta.env.DEV) {
      setSharedLLMConfigLoaded(true);
      return;
    }
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: { config: LLMConfig | null }) => {
        setSharedLLMConfig(data.config);
      })
      .catch(() => {})
      .finally(() => setSharedLLMConfigLoaded(true));
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetchNorthernMyBoundariesFromOSM(ac.signal)
      .then((b) => {
        // Only flip to polygon-based offshore filtering if OSM returned all four
        // northern states. With partial data, tiles in the missing state would be
        // wrongly excluded — better to stay on the rectangular fallback.
        const states = new Set(b.map((s) => s.state));
        const complete = ['Perlis', 'Kedah', 'Penang', 'Perak'].every((s) => states.has(s as never));
        if (complete) setBoundaries(b);
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const addSubstations = useCallback((subs: SubstationFeature[]) => setExtraSubstations((prev) => [...prev, ...subs]), []);

  const openClaudeWithPrompt = useCallback((prompt: string) => {
    setPendingClaudePrompt(prompt);
    setClaudeOpen(true);
  }, []);

  const value: AppContextValue = {
    claudeOpen,
    setClaudeOpen,
    pendingClaudePrompt,
    setPendingClaudePrompt,
    openClaudeWithPrompt,
    activeWorkflow,
    setActiveWorkflow,
    pinLocation,
    setPinLocation,
    pinMode,
    setPinMode,
    selectedTile,
    setSelectedTile,
    activeDimension,
    setActiveDimension,
    stateFilter,
    setStateFilter,
    extraSubstations,
    addSubstations,
    boundaries,
    sharedLLMConfig,
    sharedLLMConfigLoaded,
    setSharedLLMConfig,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
