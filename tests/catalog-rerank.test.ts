import test from 'node:test';
import assert from 'node:assert/strict';

import { rerankCatalogBooks } from '../lib/search/query-rerank';

test('reranks health books above unrelated popular books', () => {
  const books = [
    {
      book_id: '1',
      title: '推荐系统',
      author: '张三',
      publisher: '某出版社',
      price: 50,
      stock: 10,
      category: '计算机',
      description: '',
      cover_url: undefined,
      relevance_score: 100,
    },
    {
      book_id: '2',
      title: '中老年健康养生指南',
      author: '李四',
      publisher: '健康出版社',
      price: 60,
      stock: 8,
      category: '健康',
      description: '',
      cover_url: undefined,
      relevance_score: 1,
    },
  ];

  const ranked = rerankCatalogBooks(books, '推荐一些适合家里长辈看的健康养生和免疫力科普书。');

  assert.equal(ranked[0].book_id, '2');
});

test('prioritizes explicitly named people in history queries', () => {
  const books = [
    {
      book_id: '1',
      title: '历史人物纵横谈:清代人物',
      author: '张三',
      publisher: '某出版社',
      price: 50,
      stock: 10,
      category: '历史',
      description: '',
      cover_url: undefined,
      relevance_score: 99,
    },
    {
      book_id: '2',
      title: '鲁迅散文诗歌集',
      author: '鲁迅',
      publisher: '文学出版社',
      price: 45,
      stock: 12,
      category: '文学',
      description: '',
      cover_url: undefined,
      relevance_score: 1,
    },
  ];

  const ranked = rerankCatalogBooks(books, '有没有适合普通读者看的历史人物传记，最好是鲁迅相关的。');

  assert.equal(ranked[0].book_id, '2');
});
