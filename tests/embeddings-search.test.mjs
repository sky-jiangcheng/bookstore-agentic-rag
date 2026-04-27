import test from 'node:test';
import assert from 'node:assert/strict';

import { searchRelevantChunks } from '../lib/embeddings.ts';

test('searchRelevantChunks returns mapped chunks from vector search results', async () => {
  const chunks = await searchRelevantChunks(
    '健康养生',
    3,
    {
      generateQueryEmbedding: async () => [1, 0, 0],
      vectorSearch: async () => [
        {
          id: 'chunk-1',
          score: 0.98,
          metadata: {
            bookId: 'bk-1',
            text: '中老年健康内容',
            title: '健康书',
            author: '张三',
            category: '健康',
            chunkIndex: 3,
          },
        },
      ],
    }
  );

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].score, 0.98);
  assert.equal(chunks[0].chunk.id, 'chunk-1');
  assert.equal(chunks[0].chunk.bookId, 'bk-1');
  assert.equal(chunks[0].chunk.text, '中老年健康内容');
  assert.equal(chunks[0].chunk.index, 3);
  assert.equal(chunks[0].chunk.metadata.title, '健康书');
});
