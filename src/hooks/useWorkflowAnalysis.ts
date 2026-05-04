import { useState, useCallback, useRef } from 'react';
import { buildSystemInstruction, buildContextBlock } from '../utils/assistantContext';
import { reverseGeocode } from '../utils/spatialContext';
import type { LocationContext } from '../utils/spatialContext';
import { buildLocationPrompt } from '../utils/locationPrompts';
import { streamLLMResponse } from '../utils/llmClient';
import { getLLMConfig } from '../utils/llmConfig';
import { useAppContext } from '../context/AppContext';
import type { WorkflowResult, WorkflowType } from '../types';

export type AnalysisStatus = 'idle' | 'loading' | 'done' | 'error';

const ANALYSIS_TIMEOUT_MS = 90_000; // web-search-backed responses can take 40–60 s

// ── JSON scanner ──────────────────────────────────────────────────────────────

function scanJsonEnd(text: string, startIdx: number): number {
  let depth = 0, inStr = false, escape = false;
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (escape)              { escape = false; continue; }
    if (c === '\\' && inStr) { escape = true;  continue; }
    if (c === '"')           { inStr = !inStr;  continue; }
    if (inStr)               { continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function extractJson(text: string): { result: WorkflowResult; endIdx: number } | null {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf('{', searchFrom);
    if (start === -1) break;
    const end = scanJsonEnd(text, start);
    if (end !== -1) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = JSON.parse(text.slice(start, end + 1)) as any;
        if (raw && raw.type) {
          const score = typeof raw.score === 'number' ? raw.score : (parseInt(raw.score, 10) || 0);
          const validVerdicts = ['Go', 'Conditional Go', 'Avoid'];
          const verdict = validVerdicts.includes(raw.verdict) ? raw.verdict : 'Conditional Go';
          const result: WorkflowResult = {
            type: raw.type,
            score,
            verdict,
            metrics: raw.metrics && typeof raw.metrics === 'object' ? raw.metrics : {},
            topFindings: Array.isArray(raw.topFindings) ? raw.topFindings : [],
            keyRisk: raw.keyRisk,
            summary: raw.summary,
          };
          return { result, endIdx: end + 1 };
        }
      } catch { /* keep searching */ }
    }
    searchFrom = start + 1;
  }
  return null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWorkflowAnalysis() {
  const [text, setText]         = useState('');
  const [status, setStatus]     = useState<AnalysisStatus>('idle');
  const [result, setResult]     = useState<WorkflowResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { lastDCFRun, selectedDCId, hoveredDCId, pinLocation } = useAppContext();

  const run = useCallback(async (ctx: LocationContext, workflowType: WorkflowType) => {
    const config = getLLMConfig();
    if (!config) {
      setErrorMsg('No LLM configured. Add your API key and model via Settings (gear icon in the sidebar).');
      setStatus('error');
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setText('');
    setResult(null);
    setErrorMsg(null);
    setStatus('loading');

    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, ANALYSIS_TIMEOUT_MS);

    // Declared outside try so post-loop code can access them
    let fullText = '';
    let jsonParsed = false;
    let jsonEndIdx = 0;

    try {
      // Reverse-geocode to get accurate country / state / city before building the prompt
      const geo = await reverseGeocode(ctx.lat, ctx.lng);
      const enrichedCtx: LocationContext = geo ? { ...ctx, geocoded: geo } : ctx;

      const prompt = buildLocationPrompt(workflowType, enrichedCtx);

      const contextBlock = buildContextBlock({
        lastDCFRun, selectedDCId, hoveredDCId,
        activeWorkflow: workflowType, pinContext: enrichedCtx,
      });

      for await (const piece of streamLLMResponse(
        config,
        { system: buildSystemInstruction(), message: `${contextBlock}\n\n---\n\n${prompt}`, useSearch: true },
        ctrl.signal,
      )) {
        if (ctrl.signal.aborted && !timedOut) {
          // User-initiated abort (back button / clear) — exit immediately
          clearTimeout(timeoutId);
          return;
        }
        if (ctrl.signal.aborted && timedOut) break; // timeout — keep partial results

        fullText += piece;

        if (!jsonParsed) {
          const extracted = extractJson(fullText);
          if (extracted) {
            setResult(extracted.result);
            jsonParsed = true;
            jsonEndIdx = extracted.endIdx;
          }
        }

        setText(jsonParsed ? fullText.slice(jsonEndIdx).trimStart() : fullText);
      }
    } catch (e) {
      // The stream reader throws when the AbortSignal fires (e.g. "BodyStreamBuffer
      // was aborted"). llmClient already swallows abort errors, but as a safety net:
      if (ctrl.signal.aborted) {
        if (!timedOut) {
          clearTimeout(timeoutId);
          return; // user abort — exit clean
        }
        // timeout threw before llmClient could swallow it — fall through to show results
      } else {
        clearTimeout(timeoutId);
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStatus('error');
        return;
      }
    }

    clearTimeout(timeoutId);

    // User abort reached via loop break rather than thrown error
    if (ctrl.signal.aborted && !timedOut) return;

    // Final parse: catches models that output JSON at the end of the response
    if (!jsonParsed && fullText) {
      const extracted = extractJson(fullText);
      if (extracted) {
        setResult(extracted.result);
        jsonEndIdx = extracted.endIdx;
        setText(fullText.slice(jsonEndIdx).trimStart());
      }
    }

    setStatus('done');
  }, [lastDCFRun, selectedDCId, hoveredDCId]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setText('');
    setResult(null);
    setErrorMsg(null);
    setStatus('idle');
  }, []);

  return { text, status, result, errorMsg, run, clear };
}
