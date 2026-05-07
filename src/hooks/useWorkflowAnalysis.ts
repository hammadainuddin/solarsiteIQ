import { useState, useCallback, useRef } from 'react';
import { buildSystemInstruction, buildContextBlock } from '../utils/assistantContext';
import { reverseGeocode } from '../utils/spatialContext';
import type { SolarLocationContext } from '../utils/solarContext';
import { buildSolarPrompt } from '../utils/solarPrompts';
import { streamLLMResponse } from '../utils/llmClient';
import { getLLMConfig } from '../utils/llmConfig';
import { useAppContext } from '../context/AppContext';
import type { WorkflowResult, SolarWorkflowType } from '../types';

export type AnalysisStatus = 'idle' | 'loading' | 'done' | 'error';

const ANALYSIS_TIMEOUT_MS = 90_000;

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

export function useWorkflowAnalysis() {
  const [text, setText]         = useState('');
  const [status, setStatus]     = useState<AnalysisStatus>('idle');
  const [result, setResult]     = useState<WorkflowResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { pinLocation, activeWorkflow } = useAppContext();

  const run = useCallback(async (ctx: SolarLocationContext, workflowType: SolarWorkflowType) => {
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

    let fullText = '';
    let jsonParsed = false;
    let jsonEndIdx = 0;

    try {
      // Enrich with reverse geocode if not already done
      let enrichedCtx = ctx;
      if (!ctx.geocoded) {
        const geo = await reverseGeocode(ctx.lat, ctx.lng);
        if (geo) enrichedCtx = { ...ctx, geocoded: geo };
      }

      const prompt = buildSolarPrompt(workflowType, enrichedCtx);

      const contextBlock = buildContextBlock({
        activeWorkflow: workflowType,
        pinLat: enrichedCtx.lat,
        pinLng: enrichedCtx.lng,
        pinState: enrichedCtx.state,
        pinGeocoded: enrichedCtx.geocoded,
      });

      for await (const piece of streamLLMResponse(
        config,
        { system: buildSystemInstruction(), message: `${contextBlock}\n\n---\n\n${prompt}`, useSearch: true },
        ctrl.signal,
      )) {
        if (ctrl.signal.aborted && !timedOut) {
          clearTimeout(timeoutId);
          return;
        }
        if (ctrl.signal.aborted && timedOut) break;

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
      if (ctrl.signal.aborted) {
        if (!timedOut) {
          clearTimeout(timeoutId);
          return;
        }
      } else {
        clearTimeout(timeoutId);
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStatus('error');
        return;
      }
    }

    clearTimeout(timeoutId);
    if (ctrl.signal.aborted && !timedOut) return;

    if (!jsonParsed && fullText) {
      const extracted = extractJson(fullText);
      if (extracted) {
        setResult(extracted.result);
        jsonEndIdx = extracted.endIdx;
        setText(fullText.slice(jsonEndIdx).trimStart());
      }
    }

    setStatus('done');
  }, [pinLocation, activeWorkflow]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setText('');
    setResult(null);
    setErrorMsg(null);
    setStatus('idle');
  }, []);

  return { text, status, result, errorMsg, run, clear };
}
