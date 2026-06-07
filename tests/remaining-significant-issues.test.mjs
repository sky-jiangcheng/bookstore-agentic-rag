import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

test('orchestrator uses a single keyword retrieval path', () => {
  const orchestrator = source('lib/agents/orchestrator.ts');

  assert.match(orchestrator, /retrieveCandidates/);
  assert.doesNotMatch(orchestrator, /runVercelRAGPipeline|evaluateRecommendation/);
});

test('requirement agent sanitizes prompt injection patterns in all prompt inputs', () => {
  const requirementAgent = source('lib/agents/requirement-agent.ts');

  assert.match(requirementAgent, /sanitizePromptInput/);
  assert.match(requirementAgent, /UNTRUSTED_USER_QUERY/);
  assert.match(requirementAgent, /UNTRUSTED_CONVERSATION_CONTEXT/);
  assert.match(requirementAgent, /JSON\.stringify\(sanitizePromptInput\(userQuery\)\)/);
  assert.match(requirementAgent, /JSON\.stringify\(sanitizePromptInput\(conversationContext\)\)/);
  assert.match(requirementAgent, /ROLE_TAG_PATTERN = .*system/);
  assert.match(requirementAgent, /忽略|无视|忘记|覆盖|系统提示/);
});
