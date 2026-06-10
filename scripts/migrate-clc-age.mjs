import fs from 'node:fs/promises';
import path from 'node:path';
import { createPool } from '@vercel/postgres';

import { loadEnvFile } from './lib/load-env.mjs';

function parseArgs(argv) {
  const args = { envFile: '', status: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--env-file') {
      args.envFile = argv[++i];
    } else if (argv[i] === '--status') {
      args.status = true;
    }
  }
  return args;
}

async function printStatus(pool) {
  const result = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(clc_code)::bigint AS with_clc_code,
      COUNT(age_min)::bigint AS with_age_min,
      COUNT(age_max)::bigint AS with_age_max
    FROM books
  `);
  const descCount = await pool.query(`
    SELECT COUNT(*)::bigint AS total_desc FROM book_descriptions
  `);
  console.log('Database Status:', {
    ...result.rows[0],
    ...descCount.rows[0]
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing POSTGRES_URL or DATABASE_URL');

  const pool = createPool({ connectionString });
  try {
    if (args.status) {
      await printStatus(pool);
      return;
    }

    const sqlPath = path.resolve(process.cwd(), 'scripts/sql/008_clc_age_fields.sql');
    console.log(`Reading migration from ${sqlPath}...`);
    const migrationSql = await fs.readFile(sqlPath, 'utf8');

    console.log('Running database schema updates...');
    await pool.query(migrationSql);
    console.log('✅ CLC code and age fields migration completed successfully!');
    await printStatus(pool);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
