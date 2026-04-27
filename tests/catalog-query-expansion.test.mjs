import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCatalogSearchTerms, buildCatalogSearchQuery } from '../lib/search/query-rerank.js';

test('expands health queries into useful search terms', () => {
  const terms = buildCatalogSearchTerms('推荐一些适合家里长辈看的健康养生和免疫力科普书。');
  assert.ok(terms.includes('健康'));
  assert.ok(terms.includes('养生'));
  assert.ok(terms.includes('免疫力'));
  assert.ok(terms.includes('科普'));
  assert.ok(terms.includes('长辈'));

  const searchQuery = buildCatalogSearchQuery('推荐一些适合家里长辈看的健康养生和免疫力科普书。');
  assert.ok(searchQuery.includes('健康'));
  assert.ok(searchQuery.includes('免疫力'));
});

test('keeps chess queries focused on chinese chess terms', () => {
  const terms = buildCatalogSearchTerms('我想提升象棋残局和布局能力，有没有偏实战一点的书？');
  assert.ok(terms.includes('象棋'));
  assert.ok(terms.includes('残局'));
  assert.ok(terms.includes('布局'));
  assert.ok(terms.includes('实战'));
  assert.ok(!terms.includes('围棋'));
  assert.ok(!terms.includes('国际象棋'));
});

test('keeps history biography queries focused on biography terms', () => {
  const terms = buildCatalogSearchTerms('有没有适合普通读者看的历史人物传记，最好是鲁迅相关的。');
  assert.ok(terms.includes('历史'));
  assert.ok(terms.includes('传记'));
  assert.ok(terms.includes('人物'));
  assert.ok(terms.includes('鲁迅'));
  assert.ok(!terms.includes('围棋'));
});
