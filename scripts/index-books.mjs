import process from 'node:process';

import { Index } from '@upstash/vector';
import { createPool } from '@vercel/postgres';

import { loadEnvFile } from './lib/load-env.mjs';
import { buildBookDocument, buildEmbeddingPair } from '../lib/local-vector.js';

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getDatabaseConnectionString() {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
}

function parseArgs(argv) {
  const args = {
    limit: undefined,
    offset: 0,
    bookId: undefined,
    afterId: undefined,
    envFile: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];

    if (value === '--limit') {
      args.limit = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--offset') {
      args.offset = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--book-id') {
      args.bookId = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--after-id') {
      args.afterId = Number(argv[i + 1]);
      i += 1;
    } else if (value === '--env-file') {
      args.envFile = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

async function fetchBooks(pool, { limit, offset, bookId, afterId }) {
  if (bookId) {
    const result = await pool.sql`
      SELECT
        id,
        title,
        author,
        publisher,
        category
      FROM books
      WHERE id = ${bookId}
      LIMIT 1
    `;

    return result.rows;
  }

  if (afterId) {
    const result = await pool.sql`
      SELECT
        id,
        title,
        author,
        publisher,
        category
      FROM books
      WHERE id > ${afterId}
      ORDER BY id
      LIMIT ${limit || 1000}
    `;

    return result.rows;
  }

  if (limit) {
    const result = await pool.sql`
      SELECT
        id,
        title,
        author,
        publisher,
        category
      FROM books
      ORDER BY id
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return result.rows;
  }

  const result = await pool.sql`
    SELECT
      id,
      title,
      author,
      publisher,
      category
    FROM books
    ORDER BY id
  `;

  return result.rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);

  const databaseConnectionString = getDatabaseConnectionString();
  if (!databaseConnectionString) {
    throw new Error('Missing DATABASE_URL or POSTGRES_URL');
  }

  const vectorUrl = getRequiredEnv('UPSTASH_VECTOR_REST_URL');
  const vectorToken = getRequiredEnv('UPSTASH_VECTOR_REST_TOKEN');

  const pool = createPool({
    connectionString: databaseConnectionString,
  });

  const index = new Index({
    url: vectorUrl,
    token: vectorToken,
  });

  const books = await fetchBooks(pool, args);
  if (books.length === 0) {
    console.log('No books found for indexing.');
    await pool.end();
    return;
  }

  let indexed = 0;

  for (const book of books) {
    const document = buildBookDocument(book);
    const { vector, sparseVector } = buildEmbeddingPair(document);

    await index.upsert([
      {
        id: String(book.id),
        vector,
        sparseVector,
        metadata: {
          bookId: String(book.id),
          title: book.title,
          author: book.author || 'Unknown Author',
          category: book.category || 'general',
        },
      },
    ]);

    indexed += 1;
    console.log(`Indexed book ${book.id}: ${book.title}`);
  }

  await pool.end();
  console.log(`Completed vector indexing for ${indexed} books.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
