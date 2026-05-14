import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

test('health endpoint returns only minimal unauthenticated status data', () => {
  const healthRoute = source('app/api/health/route.ts');

  assert.doesNotMatch(healthRoute, /hasDatabaseConfig|hasVectorConfig|hasRedisConfig|hasCatalogServiceConfig/);
  assert.doesNotMatch(healthRoute, /dataSources/);
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
