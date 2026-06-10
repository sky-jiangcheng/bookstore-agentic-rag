import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('category mapping rounds REAL confidence through numeric', async () => {
  const source = await readSource('app/api/admin/category-mapping/route.ts');

  assert.doesNotMatch(source, /ROUND\(cm\.confidence,\s*4\)/);
  assert.match(source, /ROUND\(cm\.confidence::numeric,\s*4\)/);
});

test('category quality uses valid grouped aggregation queries', async () => {
  const source = await readSource('app/api/admin/category-quality/route.ts');

  assert.doesNotMatch(source, /ARRAY_AGG\(DISTINCT lt ORDER BY COUNT\(\*\) DESC\)/);
  assert.match(source, /GROUP BY b\.book_category,\s*lt/);
  assert.match(source, /GROUP BY books\.book_category,\s*books\.library_codes/);
});

test('chat keeps local and remote session identifiers separate', async () => {
  const source = await readSource('components/rag-chat.tsx');

  assert.match(source, /remoteSessionId\?: string/);
  assert.doesNotMatch(source, /return \{ \.\.\.s, id: data\.sessionId \}/);
  assert.doesNotMatch(source, /setActiveSessionId\(data\.sessionId\)/);
});

test('catalog search applies publication year as a parameterized filter', async () => {
  const source = await readSource('lib/server/catalog-repository.ts');

  assert.match(source, /publication_year >= \$\$\{params\.length\}/);
  assert.match(source, /publication_year >= \$\$\{paramIdx\+\+\}/);
});
