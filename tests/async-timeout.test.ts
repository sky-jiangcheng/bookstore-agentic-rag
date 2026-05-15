import test from 'node:test';
import assert from 'node:assert/strict';

import { AsyncTimeoutError, withTimeout } from '../lib/utils/async-timeout';

test('withTimeout rejects slow optional operations with a typed timeout error', async () => {
  await assert.rejects(
    withTimeout(new Promise((resolve) => setTimeout(resolve, 25)), 1, 'vector search'),
    (error) => {
      assert.ok(error instanceof AsyncTimeoutError);
      assert.match(error.message, /vector search/);
      assert.equal(error.timeoutMs, 1);
      return true;
    }
  );
});

test('withTimeout returns the underlying value when it finishes inside the budget', async () => {
  const result = await withTimeout(Promise.resolve('sql fallback still enriched'), 100, 'vector search');

  assert.equal(result, 'sql fallback still enriched');
});
