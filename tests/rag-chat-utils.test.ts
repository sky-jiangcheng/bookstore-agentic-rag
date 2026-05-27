import test from 'node:test';
import assert from 'node:assert/strict';
import * as ragChatUtils from '../components/rag-chat-utils';

test('buildFollowUpPrompts keeps the most useful follow-ups and respects assistant context', () => {
  const { buildFollowUpPrompts } = ragChatUtils;
  const prompts = buildFollowUpPrompts('推荐健康书', {
    recommendations: [
      { title: '健康管理', author: '张三', price: 88, explanation: '推荐理由', book_id: '1' },
    ],
    requirement: {
      categories: ['健康'],
      keywords: ['健康'],
      constraints: {
        budget: 100,
        target_count: 5,
        exclude_keywords: ['教材'],
      },
    },
    totalPrice: 80, // within budget, so '严格把总价压到' prompt is NOT added
  });

  assert.equal(prompts.length, 3);
  assert.ok(prompts.some((prompt) => prompt.includes('保持预算 ¥100')));
  assert.ok(prompts.some((prompt) => prompt.includes('数量固定 5 本')));
});

test('normalizeBookRecommendations coerces mixed payloads into usable recommendations', () => {
  const { normalizeBookRecommendations } = ragChatUtils;
  const recommendations = normalizeBookRecommendations([
    {
      title: '  健康书  ',
      author: '  张三 ',
      price: '88.5',
      explanation: '  推荐理由 ',
      book_id: 123,
    },
    {
      title: '',
      author: '李四',
      price: null,
      explanation: null,
      book_id: undefined,
    },
  ]);

  assert.equal(recommendations.length, 2);
  assert.equal(recommendations[0].title, '健康书');
  assert.equal(recommendations[0].author, '张三');
  assert.equal(recommendations[0].price, 88.5);
  assert.equal(recommendations[0].book_id, '123');
  assert.equal(recommendations[1].title, '未命名图书');
  assert.equal(recommendations[1].author, '李四');
});

test('normalizeRequirementSnapshot returns normalized snapshot values', () => {
  const { normalizeRequirementSnapshot } = ragChatUtils;
  const snapshot = normalizeRequirementSnapshot({
    categories: ['健康'],
    keywords: ['养生'],
    constraints: {
      budget: '200',
      target_count: 4,
      exclude_keywords: ['教材'],
    },
  });

  assert.deepEqual(snapshot, {
    categories: ['健康'],
    keywords: ['养生'],
    constraints: {
      budget: 200,
      target_count: 4,
      exclude_keywords: ['教材'],
    },
  });
});
