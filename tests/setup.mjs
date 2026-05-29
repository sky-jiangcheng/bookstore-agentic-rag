/**
 * Test setup: mock `server-only` for non-Next.js (tsx) environments.
 *
 * `server-only` throws on import outside Next.js. Several lib modules
 * transitively import it, causing tsx to fail with misleading
 * "does not provide an export" errors.
 *
 * We pre-populate the CJS require cache so the real (throwing) module
 * code never executes.  This is a well-known pattern for ESM-to-CJS
 * interop in the tsx/Node test runner ecosystem.
 */
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);

// Resolve the path without executing the module
const serverOnlyPath = req.resolve('server-only');

// Pre-populate the CJS require cache with an empty module.
// When ESM (via tsx) later tries to import 'server-only' from
// environment.ts, Node's CJS loader will find this cached entry
// and return {} instead of executing the throwing original.
req.cache[serverOnlyPath] = {
  exports: {},
  loaded: true,
  id: serverOnlyPath,
  filename: serverOnlyPath,
};

// Self-check: verify the mock took effect immediately.
// If it fails, surface a clear error before any test runs.
try {
  const mock = req('server-only');
  if (typeof mock !== 'object' || mock === null) {
    throw new Error('server-only mock returned unexpected value');
  }
} catch (cause) {
  console.error(
    '[setup.mjs] FAILED to mock server-only. Tests requiring "server-only" imports will break.\n' +
    '  Cause: %s\n' +
    '  Expected: require.cache hack with module at %s\n' +
    '  Tip: Check if the "server-only" package changed its exports entry point.',
    cause.message,
    serverOnlyPath,
  );
  // Re-throw to abort test run early with a clear trace
  throw cause;
}
