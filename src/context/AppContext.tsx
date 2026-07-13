import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { SolarWorkflowType, PinLocation, HexTile, HexScoreDimension, NorthernMyState } from '../types';
import type { SubstationFeature } from '../data/infraLayers';
import type { TransmissionLine } from '../data/transmissionLines';
import { fetchNorthernMyBoundariesFromOSM, type StateBoundaryGeo } from '../utils/overpass';
import { runTilePipeline } from '../utils/tilePipeline';
import { NORTHERN_MY_LINES } from '../data/northernMyTransmissionLines';
import { NORTHERN_MY_SUBSTATIONS } from '../data/northernMySubstations';
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

  // Shared tile pipeline — runs ONCE app-wide (results cached in IndexedDB);
  // both the dashboard and the screening map read the same scored tiles.
  tiles: HexTile[];
  tilePhase: string;          // '' when idle/done — non-empty while pipeline is working
  tileProgress: number;       // 0-100 within the "Building 1 km grid" step
  tileTotalCells: number;
  osmLines: TransmissionLine[];
  osmSubs: SubstationFeature[];

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

  // ── Shared tile pipeline ────────────────────────────────────────────────────
  const [tiles, setTiles] = useState<HexTile[]>([]);
  const [tilePhase, setTilePhase] = useState('');
  const [tileProgress, setTileProgress] = useState(0);
  const [tileTotalCells, setTileTotalCells] = useState(0);
  const [osmLines, setOsmLines] = useState<TransmissionLine[]>(NORTHERN_MY_LINES);
  const [osmSubs, setOsmSubs] = useState<SubstationFeature[]>(NORTHERN_MY_SUBSTATIONS);
  const pipelineStartedRef = useRef(false);

  useEffect(() => {
    if (!boundaries || boundaries.length === 0) return;
    if (pipelineStartedRef.current) return; // run once per app session — cache handles reloads
    pipelineStartedRef.current = true;

    let cancelled = false;
    runTilePipeline(boundaries, extraSubstations, {
      onPhase: (p) => { if (!cancelled) setTilePhase(p); },
      onProgress: (pct, total) => {
        if (!cancelled) { setTileProgress(pct); setTileTotalCells(total); }
      },
      onLines: (ls) => { if (!cancelled) setOsmLines(ls); },
      onSubs: (ss) => { if (!cancelled) setOsmSubs(ss); },
      isCancelled: () => cancelled,
    })
      .then((result) => {
        if (!cancelled && result.length > 0) {
          setTiles(result);
          setTileProgress(100);
        }
      })
      .catch((err) => {
        console.error('Tile pipeline error:', err);
        if (!cancelled) setTilePhase('');
      });
    return () => { cancelled = true; };
    // extraSubstations intentionally omitted: matches previous behaviour where
    // uploads after the pipeline started did not retroactively rescore tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaries]);

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
    tiles,
    tilePhase,
    tileProgress,
    tileTotalCells,
    osmLines,
    osmSubs,
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
