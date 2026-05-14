import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { Index } from '@upstash/vector';
import { createPool } from '@vercel/postgres';

import { loadEnvFile } from './lib/load-env.mjs';
import { buildBookDocument, buildEmbeddingPair, normalizeText } from '../lib/local-vector';

interface ImportVectorsArgs {
  input: string;
  envFile: string;
  batchSize: number;
  skipLines: number;
  limit?: number;
}

interface SourceBookRecord {
  id: string | number;
  title?: unknown;
  author?: unknown;
  category?: unknown;
  description?: unknown;
  [key: string]: unknown;
}

interface VectorMetadata {
  bookId: string;
  title: string;
  author: string;
  category: string;
  description: string;
  sourceId?: string;
  [key: string]: string | undefined;
}

type DatabasePool = ReturnType<typeof createPool>;

function parseArgs(argv: string[]): ImportVectorsArgs {
  const args: ImportVectorsArgs = {
    input: '',
    envFile: '',
    batchSize: 32,
    skipLines: 0,
    limit: undefined,
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
    } else if (value === '--limit') {
      args.limit = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.input) {
    throw new Error('Missing --input');
  }

  return args;
}

function resolveInputPath(rawPath: string): string {
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeJsonLine(line: string): string {
  return line.replace(/("id"\s*:\s*)(-?\d+(?:\.\d+)?)/, '$1"$2"');
}

async function loadOverflowIdMap(pool: DatabasePool): Promise<Map<string, string>> {
  const result = await pool.query(`
    select source_id, id::text as id
    from books
    where source_id is not null
  `);

  return new Map(result.rows.map((row) => [String(row.source_id), String(row.id)]));
}

function resolveBookId(record: SourceBookRecord, overflowMap: Map<string, string>): string {
  const rawId = String(record.id).trim();
  return overflowMap.get(rawId) || rawId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);

  const databaseConnectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
  if (!databaseConnectionString) {
    throw new Error('Missing DATABASE_URL or POSTGRES_URL');
  }

  const vectorUrl = getRequiredEnv('UPSTASH_VECTOR_REST_URL');
  const vectorToken = getRequiredEnv('UPSTASH_VECTOR_REST_TOKEN');

  const inputPath = resolveInputPath(args.input);
  const pool = createPool({ connectionString: databaseConnectionString });
  const overflowMap = await loadOverflowIdMap(pool);
  const index = new Index({ url: vectorUrl, token: vectorToken });

  const stream = fs.createReadStream(inputPath, 'utf8');
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let processed = 0;
  let skipped = 0;
  let buffer: SourceBookRecord[] = [];

  async function flushBuffer() {
    if (buffer.length === 0) {
      return;
    }

    const docs = buffer.map((record) => buildBookDocument(record));
    const embeddings = docs.map((document) => buildEmbeddingPair(document));

    await index.upsert(
      buffer.map((record, indexOffset) => {
        const bookId = resolveBookId(record, overflowMap);
        const metadata: VectorMetadata = {
          bookId,
          title: normalizeText(record.title),
          author: normalizeText(record.author) || 'Unknown Author',
          category: normalizeText(record.category) || 'general',
          description: normalizeText(record.description).slice(0, 500),
        };

        if (overflowMap.has(String(record.id))) {
          metadata.sourceId = String(record.id);
        }

        return {
          id: bookId,
          vector: embeddings[indexOffset].vector,
          sparseVector: embeddings[indexOffset].sparseVector,
          metadata,
        };
      })
    );

    processed += buffer.length;
    if (processed % 2000 === 0 || buffer.length < args.batchSize) {
      console.log(`Indexed ${processed} books...`);
    }

    buffer = [];
  }

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (skipped < args.skipLines) {
      skipped += 1;
      continue;
    }

    if (args.limit !== undefined && processed + buffer.length >= args.limit) {
      break;
    }

    buffer.push(JSON.parse(normalizeJsonLine(trimmed)) as SourceBookRecord);
    if (buffer.length >= args.batchSize) {
      await flushBuffer();
    }
  }

  await flushBuffer();
  await pool.end();

  console.log(`Skipped ${skipped} lines, indexed ${processed} books from ${inputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
