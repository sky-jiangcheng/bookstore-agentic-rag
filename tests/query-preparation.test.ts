import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPseudoSql,
  findExactTemplate,
  normalizeRequirementText,
  suggestExclusionCollisions,
  type RequirementTemplate,
} from '../components/query-preparation';

const template: RequirementTemplate = {
  id: 'template-1',
  name: '高中生 AI 入门书单',
  sourceText: '推荐 10 本适合高中生的人工智能入门书',
  normalizedText: '推荐10本适合高中生的人工智能入门书',
  requirement: {
    original_query: '推荐 10 本适合高中生的人工智能入门书',
    categories: ['人工智能'],
    keywords: ['入门', '高中生'],
    expanded_search_terms: ['人工智能', 'AI 入门'],
    constraints: { target_count: 10, budget: 500, exclude_keywords: ['教辅'] },
    preferences: ['受众:高中生'],
    needs_clarification: false,
    clarification_questions: [],
  },
  categoryWeight: 1.2,
  keywordWeight: 0.6,
  updatedAt: '2026-06-07T00:00:00.000Z',
};

test('normalizeRequirementText supports deterministic exact template matching', () => {
  assert.equal(normalizeRequirementText(' 推荐 10 本，适合高中生的人工智能入门书。 '), '推荐10本适合高中生的人工智能入门书');
  assert.equal(findExactTemplate('推荐 10 本适合高中生的人工智能入门书', [template])?.id, 'template-1');
});

test('suggestExclusionCollisions only returns vocabulary related to the request', () => {
  assert.deepEqual(
    suggestExclusionCollisions('不要应试、考试类内容', ['教材', '教辅', '题库', '考试', '漫画']),
    ['教辅', '题库', '考试'],
  );
  assert.deepEqual(suggestExclusionCollisions('推荐人工智能入门书', ['教材', '教辅']), []);
});

test('buildPseudoSql reflects confirmed requirement and tuning values', () => {
  const sql = buildPseudoSql(template.requirement, 1.2, 0.6);
  assert.match(sql, /人工智能/);
  assert.match(sql, /教辅/);
  assert.match(sql, /LIMIT 10/);
  assert.match(sql, /category_weight = 1\.2/);
});
