import process from 'node:process';

import { sql } from '@vercel/postgres';

import { loadEnvFile } from './lib/load-env.mjs';
import { buildBookDocument, buildEmbeddingPair } from '../lib/local-vector';

interface IndexBooksArgs {
  limit?: number;
  offset: number;
  bookId?: number;
  afterId?: number;
  envFile?: string;
}

interface BookIndexRow {
  id: string | number;
  title: string | null;
  author: string | null;
  publisher: string | null;
  category: string | null;
}

function getDatabaseConnectionString(): string {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
}

function parseArgs(argv: string[]): IndexBooksArgs {
  const args: IndexBooksArgs = {
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

function formatVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

async function fetchBooks(
  { limit, offset, bookId, afterId }: IndexBooksArgs
): Promise<BookIndexRow[]> {
  if (bookId) {
    const result = await sql`
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

    return result.rows as BookIndexRow[];
  }

  if (afterId) {
    const result = await sql`
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

    return result.rows as BookIndexRow[];
  }

  if (limit) {
    const result = await sql`
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

    return result.rows as BookIndexRow[];
  }

  const result = await sql`
    SELECT
      id,
      title,
      author,
      publisher,
      category
    FROM books
    ORDER BY id
  `;

  return result.rows as BookIndexRow[];
}

async function upsertBookEmbedding(
  bookId: string,
  vector: number[],
  title: string,
  author: string,
  category: string,
): Promise<void> {
  const vectorString = formatVector(vector);
  const textContent = [title, author, category].filter(Boolean).join('\n');

  await sql`
    INSERT INTO book_embeddings (book_id, chunk_index, text_content, embedding)
    VALUES (
      ${bookId}::bigint,
      0,
      ${textContent},
      ${vectorString}::vector
    )
    ON CONFLICT (book_id, chunk_index)
    DO UPDATE SET
      text_content = EXCLUDED.text_content,
      embedding = EXCLUDED.embedding,
      updated_at = NOW()
  `;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);

  const databaseConnectionString = getDatabaseConnectionString();
  if (!databaseConnectionString) {
    throw new Error('Missing DATABASE_URL or POSTGRES_URL');
  }

  const books = await fetchBooks(args);
  if (books.length === 0) {
    console.log('No books found for indexing.');
    return;
  }

  let indexed = 0;

  for (const book of books) {
    const document = buildBookDocument(book);
    const { vector } = buildEmbeddingPair(document);

    await upsertBookEmbedding(
      String(book.id),
      vector,
      book.title || '',
      book.author || 'Unknown Author',
      book.category || 'general',
    );

    indexed += 1;
    console.log(`Indexed book ${book.id}: ${book.title}`);
  }

  console.log(`Completed vector indexing for ${indexed} books.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
