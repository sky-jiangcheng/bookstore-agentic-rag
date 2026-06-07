export type LLMProviderType = 'google' | 'openai-compatible';

export interface LLMProviderConfig {
  type: LLMProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export const DEFAULT_PROVIDER_CONFIG: LLMProviderConfig = {
  type: 'google',
  apiKey: '',
  model: 'gemini-2.0-flash',
};

const STORAGE_KEY = 'rag-llm-provider';

export function loadProviderConfig(): LLMProviderConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as LLMProviderConfig;
  } catch {}
  return { ...DEFAULT_PROVIDER_CONFIG };
}

export function saveProviderConfig(config: LLMProviderConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}


