import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCatalogTextSearch,
  normalizeSearchTerms,
} from '../lib/search/catalog-query';

test('catalog text search joins expanded terms with OR', () => {
  const search = buildCatalogTextSearch(
    ['人工智能', 'AI', '机器学习'],
    3,
  );

  assert.equal(
    search.condition,
    [
      '(',
      "(coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(book_category, '') || ' ' || coalesce(description, '')) ILIKE $3",
      'OR',
      "(coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(book_category, '') || ' ' || coalesce(description, '')) ILIKE $4",
      'OR',
      "(coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(book_category, '') || ' ' || coalesce(description, '')) ILIKE $5",
      ')',
    ].join(' '),
  );
  assert.deepEqual(search.params, ['%人工智能%', '%AI%', '%机器学习%']);
});

test('catalog text search preserves parameter offsets for other filters', () => {
  const search = buildCatalogTextSearch(['历史', '传记'], 2);

  assert.match(search.condition, /\$2/);
  assert.match(search.condition, /\$3/);
  assert.doesNotMatch(search.condition, /\$1/);
});

test('normalizeSearchTerms trims, deduplicates, and removes empty terms', () => {
  assert.deepEqual(
    normalizeSearchTerms([' 人工智能 ', '', 'AI', '人工智能', '  ']),
    ['人工智能', 'AI'],
  );
});

test('catalog text search returns no condition for empty terms', () => {
  assert.deepEqual(buildCatalogTextSearch([], 1), {
    condition: '',
    params: [],
  });
});
