import test from 'node:test';
import assert from 'node:assert/strict';

import { CohereReranker } from '../lib/reranking/reranker.ts';

test('CohereReranker returns an empty result list when the API payload is malformed', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const reranker = new CohereReranker('test-key');
    const output = await reranker.rerank({
      query: '健康',
      documents: [
        {
          id: 'book-1',
          text: '健康养生',
        },
      ],
    });

    assert.deepEqual(output.results, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
