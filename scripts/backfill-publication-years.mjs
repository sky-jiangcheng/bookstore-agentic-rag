import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { createPool } from '@vercel/postgres';

import { loadEnvFile } from './lib/load-env.mjs';

function parseArgs(argv) {
  const args = { input: '', envFile: '', batchSize: 5000 };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') {
      args.input = argv[++i];
    } else if (argv[i] === '--env-file') {
      args.envFile = argv[++i];
    } else if (argv[i] === '--batch-size') {
      args.batchSize = Number(argv[++i]);
    }
  }

  if (!args.input) throw new Error('Missing --input');
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 10000) {
    throw new Error('--batch-size must be between 1 and 10000');
  }
  return args;
}

async function flushBatch(pool, batch) {
  const params = [];
  const values = batch.map((item, index) => {
    const offset = index * 2;
    params.push(String(item.id), Number(item.publication_year));
    return `($${offset + 1}::bigint, $${offset + 2}::smallint)`;
  });

  const result = await pool.query(
    `
      UPDATE books AS book
      SET publication_year = value.publication_year
      FROM (VALUES ${values.join(', ')}) AS value(id, publication_year)
      WHERE book.id = value.id
        AND book.publication_year IS DISTINCT FROM value.publication_year
    `,
    params,
  );
  return result.rowCount ?? 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing POSTGRES_URL or DATABASE_URL');

  const inputPath = path.resolve(args.input);
  const pool = createPool({ connectionString });
  const reader = readline.createInterface({
    input: fs.createReadStream(inputPath, 'utf8'),
    crlfDelay: Infinity,
  });

  let processed = 0;
  let updated = 0;
  let batch = [];

  try {
    for await (const line of reader) {
      if (!line.trim()) continue;
      batch.push(JSON.parse(line));

      if (batch.length >= args.batchSize) {
        updated += await flushBatch(pool, batch);
        processed += batch.length;
        console.log(`Processed ${processed}, updated ${updated}`);
        batch = [];
      }
    }

    if (batch.length > 0) {
      updated += await flushBatch(pool, batch);
      processed += batch.length;
    }
  } finally {
    await pool.end();
  }

  console.log(`Completed: processed ${processed}, updated ${updated}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
