import 'server-only';

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LLMProviderConfig } from '@/lib/config/provider-config';
import type { LanguageModel } from 'ai';

function normalizeModelId(model: string): string {
  return model.replace(/^(google\/|openai\/)/, '');
}

/**
 * Some OpenAI-compatible proxies (e.g. api.apifree.ai) return usage fields
 * as `completion_tokens`/`prompt_tokens` instead of the standard
 * `input_tokens`/`output_tokens` that @ai-sdk/openai expects.
 * This fetch wrapper normalizes the response body before returning.
 */
function createNormalizedFetch(): typeof fetch {
  return async (input, init) => {
    const res = await fetch(input, init);
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
      return res;
    }
    const cloned = res.clone();
    const body = await cloned.json().catch(() => null);
    if (!body || !body.usage) return res;

    const usage = body.usage as Record<string, unknown>;
    if (usage.input_tokens !== undefined && usage.output_tokens !== undefined) {
      return res;
    }
    if (usage.prompt_tokens !== undefined) {
      usage.input_tokens = usage.prompt_tokens;
    }
    if (usage.completion_tokens !== undefined) {
      usage.output_tokens = usage.completion_tokens;
    }
    const patched = JSON.stringify(body);
    return new Response(patched, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };
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
        fetch: createNormalizedFetch(),
      });
      return openai(normalizeModelId(config.model));
    }
    default: {
      const _exhaustive: never = config.type;
      throw new Error(`Unknown LLM provider: ${_exhaustive}`);
    }
  }
}
