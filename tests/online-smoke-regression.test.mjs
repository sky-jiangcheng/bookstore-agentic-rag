import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function runSmoke(baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/smoke-rag.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RAG_BASE_URL: baseUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('smoke script reports protected deployments instead of leaking JSON parse errors', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>Authentication Required</title>');
  });

  const address = await listen(server);
  try {
    const result = await runSmoke(`http://127.0.0.1:${address.port}`);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Authentication Required|deployment protection|non-JSON/i);
    assert.doesNotMatch(result.stderr, /Unexpected token/);
  } finally {
    await close(server);
  }
});
