// tests/pagination-and-streaming.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'stream';

import { nodeStreamToWeb } from '@/lib/book-list/excel-stream-export';

test('nodeStreamToWeb converts Node stream to Web ReadableStream', async () => {
  const nodeStream = new PassThrough();
  const webStream = nodeStreamToWeb(nodeStream);

  assert.ok(webStream instanceof ReadableStream);

  const reader = webStream.getReader();

  // Push some data
  nodeStream.write(Buffer.from('hello'));
  nodeStream.write(Buffer.from(' '));
  nodeStream.write(Buffer.from('world'));
  nodeStream.end();

  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value).toString());
  }

  assert.equal(chunks.join(''), 'hello world');
});
