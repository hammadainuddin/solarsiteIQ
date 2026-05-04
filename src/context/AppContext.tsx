import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { DCFInputs, DCFOutputs } from '../utils/financial';
import type { WorkflowType, PinLocation, DataCentre } from '../types';
import type { SubstationFeature } from '../data/infraLayers';

export interface DCFRunSnapshot {
  inputs: DCFInputs;
  outputs: DCFOutputs;
  timestamp: number;
}

export interface AppContextValue {
  // DCF state
  lastDCFRun: DCFRunSnapshot | null;
  setLastDCFRun: (snap: DCFRunSnapshot) => void;

  // Selection
  selectedDCId: string | null;
  setSelectedDCId: (id: string | null) => void;
  hoveredDCId: string | null;
  setHoveredDCId: (id: string | null) => void;

  // Claude assistant
  claudeOpen: boolean;
  setClaudeOpen: (open: boolean) => void;
  pendingClaudePrompt: string | null;
  setPendingClaudePrompt: (p: string | null) => void;
  openClaudeWithPrompt: (prompt: string) => void;

  // Workflows
  activeWorkflow: WorkflowType | null;
  setActiveWorkflow: (w: WorkflowType | null) => void;

  // Pin drop
  pinLocation: PinLocation | null;
  setPinLocation: (p: PinLocation | null) => void;
  pinMode: boolean;
  setPinMode: (m: boolean) => void;

  // Uploaded data
  extraDCs: DataCentre[];
  addDCs: (dcs: DataCentre[]) => void;
  extraSubstations: SubstationFeature[];
  addSubstations: (subs: SubstationFeature[]) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lastDCFRun, setLastDCFRun] = useState<DCFRunSnapshot | null>(null);
  const [selectedDCId, setSelectedDCId] = useState<string | null>(null);
  const [hoveredDCId, setHoveredDCId] = useState<string | null>(null);
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [pendingClaudePrompt, setPendingClaudePrompt] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowType | null>(null);
  const [pinLocation, setPinLocation] = useState<PinLocation | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [extraDCs, setExtraDCs] = useState<DataCentre[]>([]);
  const [extraSubstations, setExtraSubstations] = useState<SubstationFeature[]>([]);

  const addDCs = useCallback((dcs: DataCentre[]) => setExtraDCs((prev) => [...prev, ...dcs]), []);
  const addSubstations = useCallback((subs: SubstationFeature[]) => setExtraSubstations((prev) => [...prev, ...subs]), []);

  const openClaudeWithPrompt = useCallback((prompt: string) => {
    setPendingClaudePrompt(prompt);
    setClaudeOpen(true);
  }, []);

  const value: AppContextValue = {
    lastDCFRun,
    setLastDCFRun,
    selectedDCId,
    setSelectedDCId,
    hoveredDCId,
    setHoveredDCId,
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
    extraDCs,
    addDCs,
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
