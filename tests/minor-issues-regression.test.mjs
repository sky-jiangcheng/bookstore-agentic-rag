import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

test('health endpoint exposes self-test dependency flags', () => {
  const healthRoute = source('app/api/health/route.ts');

  assert.match(healthRoute, /hasDatabaseConfig/);
  assert.match(healthRoute, /hasVectorConfig/);
  assert.match(healthRoute, /hasRedisConfig/);
  assert.match(healthRoute, /hasCatalogServiceConfig/);
  assert.match(healthRoute, /database:/);
  assert.match(healthRoute, /vector:/);
  assert.match(healthRoute, /dependencies:/);
  assert.doesNotMatch(healthRoute, /getFilterStatus/);
  assert.match(healthRoute, /status:\s*'ok'/);
});

test('service fetches use bounded timeout helpers', () => {
  const authClient = source('lib/clients/auth-client.ts');
  const catalogRepository = source('lib/server/catalog-repository.ts');
  const fetchTimeout = source('lib/utils/fetch-timeout.ts');

  assert.match(fetchTimeout, /fetchWithTimeout/);
  assert.match(fetchTimeout, /AbortController/);
  assert.doesNotMatch(authClient, /\bfetch\(/);
  assert.doesNotMatch(catalogRepository, /\bfetch\(/);
  assert.match(authClient, /fetchWithTimeout/);
  assert.match(catalogRepository, /fetchWithTimeout/);
});

test('catalog vector enrichment is bounded and optional for online smoke tests', () => {
  const catalogRepository = source('lib/server/catalog-repository.ts');

  assert.match(catalogRepository, /search_rank/);
  assert.match(catalogRepository, /THEN search_rank/);
  assert.match(catalogRepository, /VECTOR_SEARCH_TIMEOUT_MS/);
  assert.match(catalogRepository, /!config\.vercel\.enabled/);
  assert.match(catalogRepository, /withTimeout\(\s*vectorSearch/);
  assert.match(catalogRepository, /AsyncTimeoutError/);
  assert.match(catalogRepository, /return sqlBooks/);
});

test('catalog repository uses shared catalog service config helper', () => {
  const catalogRepository = source('lib/server/catalog-repository.ts');

  assert.doesNotMatch(catalogRepository, /function isCatalogServiceConfigured/);
  assert.match(catalogRepository, /hasCatalogServiceConfig/);
});

test('embedding taskType changes local embedding input instead of being ignored', () => {
  const embeddings = source('lib/embeddings.ts');

  assert.doesNotMatch(embeddings, /void taskType/);
  assert.match(embeddings, /buildTaskAwareEmbeddingText/);
  assert.match(embeddings, /RETRIEVAL_DOCUMENT/);
  assert.match(embeddings, /SEMANTIC_SIMILARITY/);
});
