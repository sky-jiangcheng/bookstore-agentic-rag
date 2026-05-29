import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

// Proxy support for environments behind firewall (e.g. mainland China)
const PROXY_URL = process.env.http_proxy || process.env.https_proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';
let customFetch = globalThis.fetch;
if (PROXY_URL) {
  const { request, ProxyAgent } = await import('undici');
  const proxyAgent = new ProxyAgent(PROXY_URL);
  customFetch = async (url, opts = {}) => {
    const headers = opts.headers || {};
    const method = opts.method || 'GET';
    const body = opts.body;
    const undiciOpts = { method, headers, dispatcher: proxyAgent };
    if (body) undiciOpts.body = body;
    const res = await request(url, undiciOpts);
    // Wrap undici response into fetch-like interface
    const text = await res.body.text();
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      headers: { get: (name) => res.headers[name.toLowerCase()] },
      text: () => text,
      json: () => JSON.parse(text),
      get contentType() { return (res.headers['content-type'] || ''); },
    };
  };
}

function resolveBaseUrl() {
  return (process.env.RAG_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function bodyPreview(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function buildNonJsonMessage(label, response, text) {
  const contentType = response.headers.get('content-type') || 'unknown content-type';
  const preview = bodyPreview(text);
  const protectionHint = /Authentication Required|vercel authentication|sso-api/i.test(text)
    ? ' This looks like Vercel deployment protection; use `vercel curl` or configure a protection bypass token for automation.'
    : '';

  return `[${label}] Expected JSON but received ${contentType} with HTTP ${response.status}.${protectionHint} Body preview: ${preview}`;
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    throw new Error(buildNonJsonMessage(label, response, text));
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`[${label}] Invalid JSON response: ${error.message}. Body preview: ${bodyPreview(text)}`);
  }
}

async function readQueries() {
  const filePath = path.resolve(process.cwd(), 'data/huqifeng-test-queries.json');
  const content = await fs.readFile(filePath, 'utf8');
  const payload = JSON.parse(content);
  return payload.queries || [];
}

async function callHealth(baseUrl) {
  const response = await customFetch(`${baseUrl}/api/health`);
  const body = await readJsonResponse(response, 'health');
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function callCatalogSearch(baseUrl, query) {
  const response = await customFetch(`${baseUrl}/api/catalog/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const body = await readJsonResponse(response, `catalog/search:${query}`);
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const queries = await readQueries();

  console.log(`Smoke testing against ${baseUrl}`);

  const health = await callHealth(baseUrl);
  console.log('\n[health]');
  console.log(JSON.stringify(health, null, 2));

  for (const item of queries.slice(0, 5)) {
    const result = await callCatalogSearch(baseUrl, item.query);
    const titles = (result.body.books || []).slice(0, 3).map((book) => book.title);

    console.log(`\n[query:${item.id}] ${item.query}`);
    console.log(JSON.stringify({
      ok: result.ok,
      status: result.status,
      topTitles: titles,
      expectedCategories: item.expected_categories,
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
