import test from 'node:test';
import assert from 'node:assert/strict';

import { createGoogleModel } from '@/lib/ai/google-model';

test('creates a direct Google Generative AI model from the configured model name', () => {
  const model = createGoogleModel({
    apiKey: 'test-key',
    model: 'gemini-2.0-flash',
  });

  assert.equal(model.provider, 'google.generative-ai');
  assert.equal(model.modelId, 'gemini-2.0-flash');
});
