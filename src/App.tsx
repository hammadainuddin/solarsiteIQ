import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { GlobalHeader } from './components/GlobalHeader';
import { Dashboard } from './pages/Dashboard';
import { MapView } from './pages/MapView';
import { ScorecardView } from './pages/ScorecardView';
import { FinancialView } from './pages/FinancialView';
import { CompetitivePanel } from './components/CompetitivePanel';
import { AssistantPanel } from './components/AssistantPanel';
import { AppProvider } from './context/AppContext';
import { generateAndPrintReport } from './utils/exportReport';
import { AlertTriangle, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Loading screen
// ─────────────────────────────────────────────────────────────────────────────

const LOAD_STEPS = [
  'Initializing DC SiteIQ...',
  'Loading SEA Infrastructure Data...',
  'Calibrating scoring engine...',
  'Ready.',
];

function LoadingScreen({ step, progress }: { step: number; progress: number }) {
  return (
    <div className="fixed inset-0 bg-bg flex flex-col items-center justify-center z-50 gap-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
          </svg>
        </div>
        <span className="text-white font-bold text-xl tracking-tight">DC SiteIQ</span>
      </div>
      <div className="w-72">
        <div className="h-1 bg-surface-2 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted text-center">{LOAD_STEPS[step] ?? LOAD_STEPS[0]}</p>
      </div>
      <p className="text-xs text-muted opacity-50">Southeast Asia Data Centre Site Intelligence</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [mobileDismissed, setMobileDismissed] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => { setProgress(25); setLoadStep(0); }, 100),
      setTimeout(() => { setProgress(55); setLoadStep(1); }, 450),
      setTimeout(() => { setProgress(82); setLoadStep(2); }, 900),
      setTimeout(() => { setProgress(100); setLoadStep(3); }, 1200),
      setTimeout(() => setLoaded(true), 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  if (!loaded) {
    return <LoadingScreen step={loadStep} progress={progress} />;
  }

  return (
    <BrowserRouter>
      <AppProvider>
        {/* Mobile warning banner — only shown on small screens */}
        {!mobileDismissed && (
          <div className="md:hidden fixed top-0 inset-x-0 z-50 bg-amber-500/95 text-white text-xs px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} />
              <span>DC SiteIQ is optimized for desktop use (1280px+). Some features may not display correctly.</span>
            </div>
            <button onClick={() => setMobileDismissed(true)} className="ml-3 shrink-0 hover:opacity-70 transition-opacity">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex flex-col h-screen bg-bg text-white overflow-hidden">
          <GlobalHeader onExport={generateAndPrintReport} />

          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/map" element={<MapView />} />
                <Route path="/scorecard" element={<ScorecardView />} />
                <Route path="/financial" element={<FinancialView />} />
                <Route path="/intel" element={<CompetitivePanel />} />
              </Routes>
            </main>
          </div>
        </div>

        <AssistantPanel />
      </AppProvider>
    </BrowserRouter>
  );
}
