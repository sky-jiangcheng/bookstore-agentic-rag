import 'server-only';

import { createGoogleGenerativeAI } from '@ai-sdk/google';

import config from '@/lib/config/environment';

interface GoogleModelConfig {
  apiKey: string;
  model: string;
}

function normalizeModelId(model: string): string {
  return model.replace(/^google\//, '');
}

export function createGoogleModel(options: GoogleModelConfig) {
  const google = createGoogleGenerativeAI({
    apiKey: options.apiKey,
  });

  return google(normalizeModelId(options.model));
}

const configuredModel = createGoogleModel(config.google);

export function getGoogleModel() {
  return configuredModel;
}
