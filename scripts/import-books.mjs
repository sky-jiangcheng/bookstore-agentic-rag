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
    publication_year: Number.isInteger(Number(book.publication_year))
      ? Number(book.publication_year)
      : null,
    price: Number(book.price || 0),
    stock: Number(book.stock || 0),
    category: book.category ? String(book.category).trim() : 'general',
    description: book.description ? String(book.description).trim() : '',
    cover_url: book.cover_url ? String(book.cover_url).trim() : null,
    popularity_score: Number(book.popularity_score || 0),
    clc_code: book.clc_code ? String(book.clc_code).trim() : null,
    age_min: Number.isInteger(Number(book.age_min)) ? Number(book.age_min) : null,
    age_max: Number.isInteger(Number(book.age_max)) ? Number(book.age_max) : null,
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
        publication_year,
        price,
        stock,
        book_category,
        cover_url,
        popularity_score,
        clc_code,
        age_min,
        age_max
      ) VALUES (
        ${book.id},
        ${book.title},
        ${book.author},
        ${book.publisher},
        ${book.publication_year},
        ${book.price},
        ${book.stock},
        ${book.category},
        ${book.cover_url},
        ${book.popularity_score},
        ${book.clc_code},
        ${book.age_min},
        ${book.age_max}
      )
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
    `;

    if (book.description) {
      await sql`
        INSERT INTO book_descriptions (
          book_id,
          description
        ) VALUES (
          ${book.id},
          ${book.description}
        )
        ON CONFLICT (book_id) DO UPDATE SET
          description = EXCLUDED.description
      `;
    }

    imported += 1;
  }

  console.log(`Imported ${imported} books from ${inputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
