import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { createPool } from '@vercel/postgres';

import { loadEnvFile } from './lib/load-env.mjs';

function parseArgs(argv) {
  const args = {
    input: '',
    envFile: '',
    batchSize: 200,
    skipLines: 0,
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
    } else if (value === '--skip-lines') {
      args.skipLines = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.input) {
    throw new Error('Missing --input');
  }

  return args;
}

function resolveInputPath(rawPath) {
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  const escaped = String(value).replace(/'/g, "''");
  return `'${escaped}'`;
}

function normalizePopularityScore(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(value, 999.99));
}

function normalizeJsonLine(line) {
  return line.replace(/("id"\s*:\s*)(-?\d+(?:\.\d+)?)/, '$1"$2"');
}

const BIGINT_MAX = 9223372036854775807n;

function assignBookIdentity(rawId, overflowIndex) {
  const idString = String(rawId).trim();

  try {
    const numericId = BigInt(idString);
    if (numericId >= 0n && numericId <= BIGINT_MAX) {
      return {
        id: idString,
        sourceId: null,
      };
    }
  } catch {
    // Fall through to surrogate assignment.
  }

  return {
    id: `-${overflowIndex + 1}`,
    sourceId: idString,
  };
}

async function flushBatch(pool, batch) {
  if (batch.length === 0) {
    return;
  }

  const columns = [
    'id',
    'source_id',
    'title',
    'author',
    'publisher',
    'publication_year',
    'price',
    'stock',
    'book_category',
    'cover_url',
    'popularity_score',
    'clc_code',
    'age_min',
    'age_max',
  ];
  const valuesSql = batch
    .map((item, rowIndex) => {
      void rowIndex;
      return `(${[
        String(item.id),
        item.source_id,
        item.title,
        item.author,
        item.publisher,
        item.publication_year ?? null,
        item.price,
        item.stock,
        item.category,
        item.cover_url ?? null,
        normalizePopularityScore(item.popularity_score),
        item.clc_code ?? null,
        item.age_min ?? null,
        item.age_max ?? null,
      ]
        .map(toSqlLiteral)
        .join(', ')})`;
    })
    .join(', ');

  await pool.query(
    `
      INSERT INTO books (${columns.join(', ')})
      VALUES ${valuesSql}
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        publisher = EXCLUDED.publisher,
        publication_year = EXCLUDED.publication_year,
        price = EXCLUDED.price,
        stock = EXCLUDED.stock,
        book_category = EXCLUDED.book_category,
        cover_url = EXCLUDED.cover_url,
        popularity_score = EXCLUDED.popularity_score,
        clc_code = EXCLUDED.clc_code,
        age_min = EXCLUDED.age_min,
        age_max = EXCLUDED.age_max,
        updated_at = NOW()
    `,
  );

  const descColumns = ['book_id', 'description'];
  const descValuesSql = batch
    .filter((item) => item.description)
    .map((item) => `(${String(item.id)}, ${toSqlLiteral(item.description)})`)
    .join(', ');

  if (descValuesSql) {
    await pool.query(
      `
        INSERT INTO book_descriptions (${descColumns.join(', ')})
        VALUES ${descValuesSql}
        ON CONFLICT (book_id) DO UPDATE SET
          description = EXCLUDED.description
      `,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);

  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    throw new Error('Missing POSTGRES_URL or DATABASE_URL');
  }

  const inputPath = resolveInputPath(args.input);
  const pool = createPool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  });
  const stream = fs.createReadStream(inputPath, 'utf8');
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let processed = 0;
  let skipped = 0;
  let overflowCount = 0;
  let batch = [];

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (skipped < args.skipLines) {
      skipped += 1;
      continue;
    }

    const parsed = JSON.parse(normalizeJsonLine(trimmed));
    const identity = assignBookIdentity(parsed.id, overflowCount);
    if (identity.sourceId) {
      overflowCount += 1;
    }
    batch.push({
      ...parsed,
      id: identity.id,
      source_id: identity.sourceId,
    });
    if (batch.length >= args.batchSize) {
      await flushBatch(pool, batch);
      processed += batch.length;
      if (processed % 2000 === 0) {
        console.log(`Imported ${processed} books...`);
      }
      batch = [];
    }
  }

  if (batch.length > 0) {
    await flushBatch(pool, batch);
    processed += batch.length;
  }

  await pool.end();
  console.log(`Skipped ${skipped} lines, imported ${processed} books from ${inputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
