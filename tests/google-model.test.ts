import test from 'node:test';
import assert from 'node:assert/strict';

import { createGoogleModel } from '@/lib/ai/google-model';

test('creates a Google Gemini model via OpenAI-compatible endpoint', () => {
  const model = createGoogleModel({
    apiKey: 'test-key',
    model: 'gemini-2.0-flash',
  });

  assert.equal(model.modelId, 'gemini-2.0-flash');
  assert.ok(model.provider.startsWith('openai'));
});
