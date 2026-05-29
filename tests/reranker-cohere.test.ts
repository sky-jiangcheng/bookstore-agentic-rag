import test from 'node:test';
import assert from 'node:assert/strict';
import * as reranker from '../lib/reranking/reranker';

const { CohereReranker } = reranker;

test('CohereReranker returns an empty result list when the API payload is malformed', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const rerankerInstance = new CohereReranker('test-key');
    const output = await rerankerInstance.rerank({
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
