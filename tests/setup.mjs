/**
 * Test setup: mock `server-only` for non-Next.js (tsx) environments.
 *
 * `server-only` throws on import outside Next.js. Several lib modules
 * transitively import it, causing tsx to fail with misleading
 * "does not provide an export" errors.
 *
 * We pre-populate the CJS require cache so the real (throwing) module
 * code never executes.
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
