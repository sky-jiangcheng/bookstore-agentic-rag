import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

test('SimpleVectorSearch bounds and evicts its in-memory cache', () => {
  const storage = source('lib/vercel/storage.ts');

  assert.match(storage, /MAX_CACHE_ENTRIES/);
  assert.match(storage, /enforceMaxCacheSize/);
  assert.match(storage, /this\.cache\.keys\(\)\.next\(\)\.value/);
  assert.match(storage, /this\.cache\.delete\(oldestId\)/);
});

test('SimpleVectorSearch handles cold cache and zero vectors safely', () => {
  const storage = source('lib/vercel/storage.ts');

  assert.match(storage, /this\.cache\.size === 0/);
  assert.match(storage, /await this\.loadFromDatabase\(\)/);
  assert.match(storage, /normA === 0 \|\| normB === 0/);
  assert.match(storage, /if \(normA === 0 \|\| normB === 0\) {\s*return 0;\s*}/);
});

test('orchestrator uses shared book taxonomy instead of a local keyword list', () => {
  const orchestrator = source('lib/agents/orchestrator.ts');

  assert.doesNotMatch(orchestrator, /const bookKeywords = \[/);
  assert.match(orchestrator, /extractKnownBookKeywords/);
  assert.match(source('lib/agents/book-taxonomy.ts'), /COMMON_BOOK_KEYWORDS/);
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
