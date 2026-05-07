import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import SolarDashboard from './pages/SolarDashboard';
import SolarMapView from './pages/SolarMapView';
import { AssistantPanel } from './components/AssistantPanel';
import { AppProvider } from './context/AppContext';
import { AlertTriangle, X } from 'lucide-react';
import { NORTHERN_MY_LINES } from './data/northernMyTransmissionLines';
import { NORTHERN_MY_SUBSTATIONS } from './data/northernMySubstations';
import { generateNorthernMyHexTiles } from './utils/hexGrid';
import type { HexTile } from './types';

const LOAD_STEPS = [
  'Initializing Solar SiteIQ...',
  'Loading TNB grid data...',
  'Scoring hex grid tiles...',
  'Ready.',
];

function LoadingScreen({ step, progress }: { step: number; progress: number }) {
  return (
    <div className="fixed inset-0 bg-bg flex flex-col items-center justify-center z-50 gap-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </div>
        <span className="text-white font-bold text-xl tracking-tight">Solar SiteIQ</span>
      </div>
      <div className="w-72">
        <div className="h-1 bg-surface-2 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted text-center">{LOAD_STEPS[step] ?? LOAD_STEPS[0]}</p>
      </div>
      <p className="text-xs text-muted opacity-50">Malaysia Large-Scale Solar · REZ Screening</p>
    </div>
  );
}

// Shared tiles computed once — passed as props to avoid re-generating per route
const SHARED_TILES: HexTile[] = generateNorthernMyHexTiles(NORTHERN_MY_LINES, NORTHERN_MY_SUBSTATIONS);

function AppInner() {
  const [mobileDismissed, setMobileDismissed] = useState(false);

  return (
    <>
      {!mobileDismissed && (
        <div className="md:hidden fixed top-0 inset-x-0 z-50 bg-amber-500/95 text-white text-xs px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>Solar SiteIQ is optimized for desktop use (1280px+).</span>
          </div>
          <button onClick={() => setMobileDismissed(true)} className="ml-3 shrink-0 hover:opacity-70 transition-opacity">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex h-screen bg-bg text-white overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<SolarDashboard tiles={SHARED_TILES} />} />
            <Route path="/map" element={<SolarMapView />} />
          </Routes>
        </main>
      </div>

      <AssistantPanel />
    </>
  );
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => { setProgress(25); setLoadStep(0); }, 100),
      setTimeout(() => { setProgress(55); setLoadStep(1); }, 400),
      setTimeout(() => { setProgress(82); setLoadStep(2); }, 800),
      setTimeout(() => { setProgress(100); setLoadStep(3); }, 1100),
      setTimeout(() => setLoaded(true), 1400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  if (!loaded) return <LoadingScreen step={loadStep} progress={progress} />;

  return (
    <BrowserRouter>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </BrowserRouter>
  );
}
