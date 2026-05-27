import test from 'node:test';
import assert from 'node:assert/strict';

test('generateRecommendation returns empty result for no candidates', async () => {
  const { generateRecommendation } = await import('../lib/agents/recommendation-agent');
  const requirement = {
    original_query: 'test', categories: [], keywords: [],
    constraints: {}, preferences: [],
    needs_clarification: false, clarification_questions: [],
  };
  const result = await generateRecommendation(requirement, []);
  assert.equal(result.books.length, 0);
  assert.equal(result.total_price, 0);
});
