import fs from 'node:fs/promises';
import path from 'node:path';

import { createPool } from '@vercel/postgres';

import { loadEnvFile } from './lib/load-env.mjs';

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

async function main() {
  const envFile = readArg('--env-file');
  if (envFile) loadEnvFile(envFile);

  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing POSTGRES_URL or DATABASE_URL');
  }

  const sqlPath = path.resolve(
    process.cwd(),
    readArg('--sql-file') || 'scripts/sql/004_library_categories.sql',
  );
  const migrationSql = await fs.readFile(sqlPath, 'utf8');
  const pool = createPool({ connectionString });

  try {
    await pool.query(migrationSql);
    const result = await pool.query(`
      SELECT
        to_regclass('public.library_categories') IS NOT NULL AS table_exists,
        COUNT(*)::int AS category_count
      FROM library_categories
    `);
    console.log(JSON.stringify(result.rows[0]));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
