import { createPool } from '@vercel/postgres';

import { loadEnvFile } from './lib/load-env.mjs';

function parseArgs(argv) {
  const args = { envFile: '', index: false, status: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--env-file') {
      args.envFile = argv[++i];
    } else if (argv[i] === '--index') {
      args.index = true;
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
      COUNT(publication_year)::bigint AS with_publication_year,
      COUNT(*) FILTER (WHERE publication_year >= 2025)::bigint AS published_since_2025,
      MIN(publication_year) AS min_year,
      MAX(publication_year) AS max_year
    FROM books
  `);
  console.log(result.rows[0]);
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

    if (args.index) {
      await pool.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_books_publication_year
        ON books(publication_year)
        WHERE publication_year IS NOT NULL
      `);
      console.log('Publication year index is ready.');
      return;
    }

    await pool.query('ALTER TABLE books ADD COLUMN IF NOT EXISTS publication_year SMALLINT');
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'books_publication_year_check'
            AND conrelid = 'books'::regclass
        ) THEN
          ALTER TABLE books
            ADD CONSTRAINT books_publication_year_check
            CHECK (publication_year BETWEEN 1900 AND 2100)
            NOT VALID;
        END IF;
      END
      $$
    `);
    await pool.query(
      'ALTER TABLE books VALIDATE CONSTRAINT books_publication_year_check',
    );
    console.log('Publication year column and constraint are ready.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
