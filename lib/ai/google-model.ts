import 'server-only';

import { createOpenAI } from '@ai-sdk/openai';

import config from '@/lib/config/environment';
import { GEMINI_BASE_URL } from '@/lib/config/provider-config';

interface GoogleModelConfig {
  apiKey: string;
  model: string;
}

function normalizeModelId(model: string): string {
  return model.replace(/^google\//, '');
}

export function createGoogleModel(options: GoogleModelConfig) {
  const openai = createOpenAI({
    apiKey: options.apiKey,
    baseURL: GEMINI_BASE_URL,
  });

  return openai(normalizeModelId(options.model));
}

const configuredModel = createGoogleModel(config.google);

export function getGoogleModel() {
  return configuredModel;
}
