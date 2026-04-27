import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { createPool } from '@vercel/postgres';

import { loadEnvFile } from './lib/load-env.mjs';

function parseArgs(argv) {
  const args = {
    input: '',
    envFile: '',
    batchSize: 500,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];

    if (value === '--input') {
      args.input = argv[i + 1];
      i += 1;
    } else if (value === '--env-file') {
      args.envFile = argv[i + 1];
      i += 1;
    } else if (value === '--batch-size') {
      args.batchSize = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.input) {
    throw new Error('Missing --input');
  }

  return args;
}

function resolvePath(rawPath) {
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  const escaped = String(value).replace(/'/g, "''");
  return `'${escaped}'`;
}

async function flushBatch(pool, batch) {
  if (batch.length === 0) {
    return;
  }

  const valuesSql = batch
    .map((item) => {
      return `(${[item.keyword, item.category, item.is_active].map(toSqlLiteral).join(', ')})`;
    })
    .join(', ');

  await pool.query(
    `
      INSERT INTO filter_keywords (keyword, category, is_active)
      VALUES ${valuesSql}
      ON CONFLICT (keyword) DO UPDATE SET
        category = EXCLUDED.category,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);

  const inputPath = resolvePath(args.input);
  const pool = createPool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  });
  const stream = fs.createReadStream(inputPath, 'utf8');
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  await pool.sql`UPDATE filter_keywords SET is_active = FALSE, updated_at = NOW()`;

  let batch = [];
  let processed = 0;

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    batch.push(JSON.parse(trimmed));
    if (batch.length >= args.batchSize) {
      await flushBatch(pool, batch);
      processed += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await flushBatch(pool, batch);
    processed += batch.length;
  }

  await pool.end();
  console.log(`Synced ${processed} filter keywords from ${inputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
