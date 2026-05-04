export type LLMProvider = 'gemini' | 'openai' | 'openai-compatible';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Pass web-search plugin/tool when available for this provider */
  webSearch: boolean;
}

const LS_KEY = 'dc-siteiq-llm-config';

export interface ProviderMeta {
  label: string;
  defaultModel: string;
  defaultBaseUrl: string;
  keyPlaceholder: string;
  modelPlaceholder: string;
  showBaseUrl: boolean;
  hint: string;
  webSearchHint: string;
}

export const PROVIDER_META: Record<LLMProvider, ProviderMeta> = {
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    defaultBaseUrl: '',
    keyPlaceholder: 'AIza…',
    modelPlaceholder: 'gemini-2.5-flash',
    showBaseUrl: false,
    hint: 'Get a free key at aistudio.google.com.',
    webSearchHint: 'Uses Google Search grounding — real-time web results injected into every response.',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-…',
    modelPlaceholder: 'gpt-4o',
    showBaseUrl: false,
    hint: 'Uses the OpenAI Chat Completions API.',
    webSearchHint: 'OpenAI does not support web search via the Completions API. Disable this or switch to a search-capable provider.',
  },
  'openai-compatible': {
    label: 'OpenAI-compatible (OpenRouter, Groq, Mistral, Ollama…)',
    defaultModel: '',
    defaultBaseUrl: '',
    keyPlaceholder: 'API key for your provider',
    modelPlaceholder: 'e.g. openai/gpt-4o  or  meta-llama/llama-3.1-70b',
    showBaseUrl: true,
    hint: 'Any provider supporting the OpenAI Chat Completions format. Set the base URL and the exact model ID your provider expects.',
    webSearchHint: 'For OpenRouter: adds plugins:[{id:"web"}] to every request, giving any model live web search. For other providers, enable only if they support this parameter.',
  },
};

export function getLLMConfig(): LLMConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as LLMConfig;
    if (!cfg.provider || !cfg.apiKey || !cfg.model) return null;
    // Back-fill webSearch for configs saved before this field existed
    if (typeof cfg.webSearch !== 'boolean') cfg.webSearch = true;
    return cfg;
  } catch {
    return null;
  }
}

export function saveLLMConfig(config: LLMConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch {}
}

export function clearLLMConfig(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}
