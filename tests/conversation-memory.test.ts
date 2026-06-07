import test from 'node:test';
import assert from 'node:assert/strict';

import { parseStoredSession } from '../lib/conversation/conversation-memory';

const session = {
  id: 'sess-test',
  createdAt: 1,
  updatedAt: 2,
  turns: [],
  metadata: {
    startTime: 1,
    turnCount: 0,
  },
};

test('parseStoredSession accepts serialized Redis values', () => {
  assert.deepEqual(parseStoredSession(JSON.stringify(session)), session);
});

test('parseStoredSession accepts Upstash auto-deserialized values', () => {
  assert.deepEqual(parseStoredSession(session), session);
});

test('parseStoredSession rejects invalid values', () => {
  assert.equal(parseStoredSession(null), null);
  assert.equal(parseStoredSession({ id: 'broken' }), null);
  assert.equal(parseStoredSession('not-json'), null);
});
