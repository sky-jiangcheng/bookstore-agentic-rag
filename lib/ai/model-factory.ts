import 'server-only';

import { createOpenAI } from '@ai-sdk/openai';
import type { LLMProviderConfig } from '@/lib/config/provider-config';
import type { LanguageModel } from 'ai';

function normalizeModelId(model: string): string {
  return model.replace(/^(google\/|openai\/)/, '');
}

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
  const openai = createOpenAI({
    apiKey: config.apiKey || undefined,
    baseURL: config.baseUrl || undefined,
    fetch: createNormalizedFetch(),
  });
  return openai(normalizeModelId(config.model));
}
