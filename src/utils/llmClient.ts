import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMConfig } from './llmConfig';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── OpenAI-compatible streaming ───────────────────────────────────────────────

async function* streamOpenAI(
  config: LLMConfig,
  system: string,
  history: ChatMessage[],
  userMessage: string,
  useSearch: boolean,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const messages = [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  // OpenRouter web search: plugins:[{id:"web"}]
  // Other OpenAI-compatible providers that support this param will also benefit;
  // those that don't will ignore or error — user controls this via the toggle.
  const extraParams = useSearch && config.webSearch
    ? { plugins: [{ id: 'web' }] }
    : {};

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages, stream: true, ...extraParams }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let chunksYielded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any;
        try { parsed = JSON.parse(data); } catch { continue; }
        // Some providers embed errors inside a 200 stream
        if (parsed?.error) throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));
        const choice = parsed?.choices?.[0];
        const piece = choice?.delta?.content;
        if (piece) { chunksYielded++; yield piece; continue; }
        // Log non-content events (tool calls, finish reasons) to aid debugging
        if (choice && !piece) {
          console.debug('[llmClient] non-content SSE chunk:', JSON.stringify(choice).slice(0, 200));
        }
      }
    }
    if (chunksYielded === 0) {
      console.warn('[llmClient] stream completed with 0 content chunks — check model/API key/web-search plugin support');
    }
  } catch (e) {
    // AbortSignal fired — reader throws "BodyStreamBuffer was aborted".
    // Treat as normal stop so callers can handle partial results cleanly.
    if (signal?.aborted) return;
    throw e;
  }
}

const EXTRACTION_SYSTEM =
  'You are a precise data extraction assistant. Output only valid JSON — no markdown fences, no explanation, no preamble.';

async function extractOpenAI(config: LLMConfig, message: string): Promise<string> {
  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM },
        { role: 'user', content: message },
      ],
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// ── Gemini streaming ──────────────────────────────────────────────────────────

async function* streamGemini(
  config: LLMConfig,
  system: string,
  history: ChatMessage[],
  userMessage: string,
  useSearch: boolean,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const genAI = new GoogleGenerativeAI(config.apiKey);

  // googleSearch grounding only works reliably with generateContentStream (single-turn
  // batch call), NOT with startChat/sendMessageStream. We replicate multi-turn by
  // building the contents array manually and calling generateContentStream each time.
  const tools = (useSearch && config.webSearch) ? [{ googleSearch: {} }] : undefined;

  const model = genAI.getGenerativeModel({
    model: config.model,
    systemInstruction: system,
    ...(tools ? { tools } : {}),
  } as Parameters<typeof genAI.getGenerativeModel>[0]);

  const contents = [
    ...history
      .filter((m) => m.content.length > 0)
      .map((m) => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: m.content }],
      })),
    { role: 'user' as const, parts: [{ text: userMessage }] },
  ];

  const result = await model.generateContentStream({ contents });

  try {
    for await (const chunk of result.stream) {
      if (signal?.aborted) return;
      const piece = chunk.text();
      if (piece) yield piece;
    }
  } catch (e) {
    if (signal?.aborted) return;
    throw e;
  }
}

async function extractGemini(config: LLMConfig, message: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(config.apiKey);
  const model = genAI.getGenerativeModel({
    model: config.model,
    systemInstruction: EXTRACTION_SYSTEM,
  });
  const result = await model.generateContent(message);
  return result.response.text();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Streams an LLM response, yielding text chunks.
 * Pass history for multi-turn chat; omit for single-turn.
 * useSearch enables grounded web search where supported (Gemini: googleSearch,
 * OpenAI-compatible: OpenRouter plugins:[{id:"web"}]).
 */
export async function* streamLLMResponse(
  config: LLMConfig,
  opts: {
    system: string;
    history?: ChatMessage[];
    message: string;
    useSearch?: boolean;
  },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const { system, history = [], message, useSearch = false } = opts;
  if (config.provider === 'gemini') {
    yield* streamGemini(config, system, history, message, useSearch, signal);
  } else {
    yield* streamOpenAI(config, system, history, message, useSearch, signal);
  }
}

/**
 * Returns a single (non-streamed) completion — used for structured JSON extraction.
 */
export async function extractLLMResponse(config: LLMConfig, message: string): Promise<string> {
  if (config.provider === 'gemini') {
    return extractGemini(config, message);
  }
  return extractOpenAI(config, message);
}
