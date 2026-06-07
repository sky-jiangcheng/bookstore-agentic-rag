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
  assert.match(healthRoute, /hasRedisConfig/);
  assert.match(healthRoute, /^\s+database(?=,|:)/m);
  assert.match(healthRoute, /dependencies:/);
  assert.doesNotMatch(healthRoute, /getFilterStatus/);
  assert.match(healthRoute, /postgres-keyword/);
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
});

test('catalog search uses the shared OR text-search builder', () => {
  const catalogRepository = source('lib/server/catalog-repository.ts');

  assert.match(catalogRepository, /buildCatalogTextSearch/);
  assert.match(catalogRepository, /search_terms/);
  assert.doesNotMatch(catalogRepository, /textConditions\.join\(['"] AND ['"]\)/);
});
