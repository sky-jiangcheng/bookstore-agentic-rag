import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

test('query helpers are TypeScript modules', () => {
  assert.equal(existsSync(resolve(root, 'lib/search/query-rerank.js')), false);
  assert.equal(existsSync(resolve(root, 'lib/search/query-rerank.ts')), true);
  assert.equal(existsSync(resolve(root, 'lib/search/catalog-query.ts')), true);
});

test('TypeScript source imports migrated helper modules without js suffixes', () => {
  for (const path of [
    'lib/upstash.ts',
    'lib/server/catalog-repository.ts',
  ]) {
    const contents = source(path);
    assert.doesNotMatch(contents, /catalog-query\.js|query-rerank\.js/);
  }
});
