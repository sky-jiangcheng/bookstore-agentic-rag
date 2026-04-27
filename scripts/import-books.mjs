import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { sql } from '@vercel/postgres';

function resolveInputPath(rawPath) {
  if (!rawPath) {
    throw new Error('Missing input path. Usage: npm run import:books -- ./data/books.json');
  }

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

function normalizeBook(book) {
  return {
    id: Number(book.id),
    title: String(book.title || '').trim(),
    author: book.author ? String(book.author).trim() : null,
    publisher: book.publisher ? String(book.publisher).trim() : null,
    price: Number(book.price || 0),
    stock: Number(book.stock || 0),
    category: book.category ? String(book.category).trim() : 'general',
    description: book.description ? String(book.description).trim() : '',
    popularity_score: Number(book.popularity_score || 0),
  };
}

async function main() {
  const rawPath = process.argv[2];
  const inputPath = resolveInputPath(rawPath);

  const fileContent = await fs.readFile(inputPath, 'utf8');
  const payload = JSON.parse(fileContent);
  const books = Array.isArray(payload) ? payload : payload.books;

  if (!Array.isArray(books) || books.length === 0) {
    throw new Error('Input file does not contain any books');
  }

  let imported = 0;

  for (const item of books) {
    const book = normalizeBook(item);

    if (!book.id || !book.title) {
      continue;
    }

    await sql`
      INSERT INTO books (
        id,
        title,
        author,
        publisher,
        price,
        stock,
        category,
        popularity_score
      ) VALUES (
        ${book.id},
        ${book.title},
        ${book.author},
        ${book.publisher},
        ${book.price},
        ${book.stock},
        ${book.category},
        ${book.popularity_score}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        publisher = EXCLUDED.publisher,
        price = EXCLUDED.price,
        stock = EXCLUDED.stock,
        category = EXCLUDED.category,
        popularity_score = EXCLUDED.popularity_score,
        updated_at = NOW()
    `;

    imported += 1;
  }

  console.log(`Imported ${imported} books from ${inputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
