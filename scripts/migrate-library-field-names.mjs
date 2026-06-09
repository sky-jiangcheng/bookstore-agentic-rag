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
  if (!connectionString) throw new Error('Missing POSTGRES_URL or DATABASE_URL');

  const migration = await fs.readFile(
    path.resolve(process.cwd(), 'scripts/sql/006_rename_library_fields.sql'),
    'utf8',
  );
  const pool = createPool({ connectionString });

  try {
    await pool.query(migration);
    const result = await pool.query(`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (table_name = 'filter_keywords' AND column_name = 'category')
              OR (table_name = 'category_library_mapping' AND column_name IN ('category', 'library_types'))
              OR (table_name = 'books' AND column_name IN ('category', 'library_types'))
            )
        ) AS old_columns,
        (
          SELECT COUNT(*)::int
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (table_name = 'filter_keywords' AND column_name = 'library_code')
              OR (table_name = 'category_library_mapping' AND column_name IN ('book_category', 'library_codes'))
              OR (table_name = 'books' AND column_name IN ('book_category', 'library_codes'))
            )
        ) AS new_columns,
        COUNT(*) FILTER (WHERE keyword = '男孩女孩·*-*岁')::int AS compound_keyword,
        COUNT(*) FILTER (WHERE keyword IN ('男孩', '女孩', '岁'))::int AS split_keywords
      FROM filter_keywords
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
