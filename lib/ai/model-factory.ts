import 'server-only';

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LLMProviderConfig } from '@/lib/config/provider-config';
import type { LanguageModel } from 'ai';

function normalizeModelId(model: string): string {
  return model.replace(/^(google\/|openai\/)/, '');
}

export function createModel(config: LLMProviderConfig): LanguageModel {
  switch (config.type) {
    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey: config.apiKey || undefined,
      });
      return google(normalizeModelId(config.model));
    }
    case 'openai-compatible': {
      const openai = createOpenAI({
        apiKey: config.apiKey || undefined,
        baseURL: config.baseUrl || undefined,
      });
      return openai(normalizeModelId(config.model));
    }
    default: {
      const _exhaustive: never = config.type;
      throw new Error(`Unknown LLM provider: ${_exhaustive}`);
    }
  }
}
