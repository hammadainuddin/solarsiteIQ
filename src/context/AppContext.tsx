import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { SolarWorkflowType, PinLocation, HexTile, HexScoreDimension, NorthernMyState } from '../types';
import type { SubstationFeature } from '../data/infraLayers';

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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
