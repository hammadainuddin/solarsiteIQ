import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { WorkflowResultCard } from './WorkflowResultCard';
import type { WorkflowResult, WorkflowType } from '../types';
import type { AnalysisStatus } from '../hooks/useWorkflowAnalysis';

const WORKFLOW_LABELS: Record<WorkflowType, string> = {
  power:        'Power Infrastructure',
  carbon:       'Carbon & Generation Mix',
  load:         'Load Competition',
  connectivity: 'Connectivity',
  environment:  'Environmental Risk',
  suitability:  'Site Suitability',
};

interface Props {
  workflowType: WorkflowType;
  text: string;
  status: AnalysisStatus;
  result: WorkflowResult | null;
  errorMsg: string | null;
  onBack: () => void;
  onRetry: () => void;
}

export function WorkflowAnalysisPanel({
  workflowType, text, status, result, errorMsg, onBack, onRetry,
}: Props) {
  const [showText, setShowText] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom while streaming
  useEffect(() => {
    if (status === 'loading' && showText) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [text, status, showText]);

  // Collapse text view when a new analysis starts
  useEffect(() => {
    if (status === 'loading') setShowText(false);
  }, [status]);

  const isActive = status === 'loading';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <button
          onClick={onBack}
          className="text-muted hover:text-white transition-colors p-0.5 rounded hover:bg-surface-2"
          title="Back to workflows"
        >
          <ArrowLeft size={13} />
        </button>
        <span className="text-white text-[11px] font-semibold flex-1 truncate">
          {WORKFLOW_LABELS[workflowType]}
        </span>
        {isActive && <Loader2 size={11} className="text-accent animate-spin shrink-0" />}
        {status === 'error' && (
          <button onClick={onRetry} className="text-muted hover:text-white" title="Retry">
            <RefreshCw size={11} />
          </button>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {/* Loading placeholder — only while card hasn't appeared yet */}
        {status === 'loading' && !result && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
              <div className="absolute inset-0 rounded-full border-2 border-t-accent animate-spin" />
            </div>
            <div>
              <p className="text-white text-xs font-medium mb-0.5">Analysing location</p>
              <p className="text-muted text-[10px]">Searching the web &amp; generating analysis…</p>
              <p className="text-muted/60 text-[10px]">This may take up to 60 s with web search enabled.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex items-start gap-2 text-red-400 text-[11px] p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <span className="break-words">
              {errorMsg ?? 'Analysis failed. Check your Gemini API key or try again.'}
            </span>
          </div>
        )}

        {/* Structured result card — primary output */}
        {result && <WorkflowResultCard result={result} />}

        {/* Fallback when analysis finished but no structured result */}
        {status === 'done' && !result && (
          <div className="flex items-start gap-2 text-amber-400/80 text-[11px] p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <span>
              {text
                ? 'The model did not return a structured card — see the full analysis below.'
                : 'No response received. Check your API key, model name, and network connection.'}
            </span>
          </div>
        )}

        {/* Full text toggle — only shown once there's text to read */}
        {text && !isActive && (
          <button
            onClick={() => setShowText((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-surface-2/60 hover:bg-surface-2 border border-border rounded-lg text-muted hover:text-white transition-colors text-[10px]"
          >
            <span>View full analysis</span>
            {showText ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        )}

        {/* Collapsible full text */}
        {showText && text && (
          <div className="text-[11px] text-white/75 leading-relaxed whitespace-pre-wrap bg-surface/50 border border-border/60 rounded-lg px-3 py-2.5">
            {text}
          </div>
        )}

        {/* Streaming indicator when text is visible */}
        {status === 'loading' && showText && text && (
          <span className="inline-block w-1.5 h-3.5 bg-accent/70 animate-pulse rounded-sm align-middle" />
        )}
      </div>
    </div>
  );
}
