import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('production code has no vector storage or embedding pipeline', () => {
  const removedPaths = [
    'lib/vector-service.ts',
    'lib/postgres-vector.ts',
    'lib/vector-initializer.ts',
    'lib/embeddings.ts',
    'lib/local-vector.ts',
    'lib/vercel/simplified-retrieval.ts',
    'app/api/admin/embeddings/precompute/route.ts',
    'scripts/index-books.ts',
  ];

  for (const path of removedPaths) {
    assert.equal(existsSync(resolve(root, path)), false, `${path} should be removed`);
  }

  const productionFiles = [
    'lib/agents/retrieval-agent.ts',
    'lib/agents/orchestrator.ts',
    'lib/types/rag.ts',
    'app/api/health/route.ts',
  ];

  for (const path of productionFiles) {
    const source = readFileSync(resolve(root, path), 'utf8');
    assert.doesNotMatch(source, /vector-service|postgres-vector|vector-initializer|generateEmbedding|precomputeEmbeddings/);
    assert.doesNotMatch(source, /['"]semantic['"]/);
  }
});
