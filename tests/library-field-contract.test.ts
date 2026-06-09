import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';

const root = process.cwd();

async function readSources(paths: string[]): Promise<string> {
  return (await Promise.all(
    paths.map((path) => readFile(resolve(root, path), 'utf8')),
  )).join('\n');
}

test('library SQL uses the explicit future field contract', async () => {
  const sqlSources = await readSources([
    'app/api/admin/category-mapping/route.ts',
    'app/api/admin/category-quality/route.ts',
    'app/api/admin/library-categories/route.ts',
    'app/api/rag/exclusions/route.ts',
    'lib/server/catalog-repository.ts',
  ]);

  for (const requiredReference of [
    'fk.library_code',
    'cm.book_category',
    'cm.library_codes',
  ]) {
    assert.ok(
      sqlSources.includes(requiredReference),
      `expected SQL reference ${requiredReference}`,
    );
  }

  assert.match(sqlSources, /\b(?:books|b)\.book_category\b/);
  assert.match(sqlSources, /\b(?:books|b)\.library_codes\b/);

  for (const legacyReference of [
    'fk.category',
    'cm.category',
    'cm.library_types',
    'books.category',
    'books.library_types',
  ]) {
    assert.ok(
      !sqlSources.includes(legacyReference),
      `unexpected legacy SQL reference ${legacyReference}`,
    );
  }
});

test('admin and exclusions payloads expose the future library fields', async () => {
  const payloadSources = await readSources([
    'components/admin/CategoryMappingDialog.tsx',
    'app/api/rag/exclusions/route.ts',
  ]);

  for (const field of ['book_category', 'library_codes', 'library_code']) {
    assert.match(
      payloadSources,
      new RegExp(`\\b${field}\\b`),
      `expected JSON/type field ${field}`,
    );
  }
});
