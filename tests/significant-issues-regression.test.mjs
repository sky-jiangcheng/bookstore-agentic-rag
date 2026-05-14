import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

test('server-only modules guard environment secrets from client bundles', () => {
  const environment = source('lib/config/environment.ts');

  assert.match(environment, /^import ['"]server-only['"];?\n/);
});

test('conversation memory does not start background timers in serverless runtime', () => {
  const conversationMemory = source('lib/conversation/conversation-memory.ts');

  assert.doesNotMatch(conversationMemory, /\bsetInterval\s*\(/);
  assert.doesNotMatch(conversationMemory, /\bsetTimeout\s*\(/);
  assert.doesNotMatch(conversationMemory, /\bstartAutoCleanup\s*\(/);
});

test('feedback store reads Redis sets as string IDs and performs real cleanup', () => {
  const feedbackStore = source('lib/feedback/feedback-store.ts');

  assert.doesNotMatch(feedbackStore, /smembers<string\[\]>/);
  assert.match(feedbackStore, /smembers<unknown\[\]>/);
  assert.match(feedbackStore, /redis\.scan/);
  assert.match(feedbackStore, /redis\.del/);
  assert.match(feedbackStore, /redis\.srem/);
});

test('vercel retrieval batch-fetches vector search books instead of sequential N+1 calls', () => {
  const simplifiedRetrieval = source('lib/vercel/simplified-retrieval.ts');

  assert.match(simplifiedRetrieval, /getBookDetailsBatch/);
  assert.doesNotMatch(simplifiedRetrieval, /for\s*\([^)]*vectorResults[^)]*\)\s*{[\s\S]*?await\s+getBookDetails/);
});
