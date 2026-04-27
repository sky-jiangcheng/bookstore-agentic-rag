/**
 * Pre-compute Embeddings for Vercel Deployment
 *
 * Run this script during build/deployment to pre-compute embeddings.
 * This reduces runtime processing for serverless functions.
 *
 * Usage: npx tsx scripts/vercel/precompute-embeddings.ts
 */

import { sql } from '@vercel/postgres';
import { buildBookDocument, buildEmbeddingPair } from '../../lib/local-vector.js';

interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
}

async function getAllBooks(): Promise<Book[]> {
  try {
    const result = await sql<Book>`
      SELECT id, title, author, category
      FROM books
      ORDER BY id
      LIMIT 1000
    `;
    return result.rows;
  } catch (error) {
    console.error('Failed to fetch books:', error);
    return [];
  }
}

async function saveEmbedding(bookId: string, embedding: number[]): Promise<void> {
  // Store in Vercel KV
  const { kv } = await import('@vercel/kv');

  await kv.hset(`embeddings:${bookId}`, {
    vector: JSON.stringify(embedding),
    updatedAt: Date.now(),
  });

  await kv.expire(`embeddings:${bookId}`, 60 * 60 * 24 * 7); // 7 days
}

async function main() {
  console.log('🚀 Starting embedding pre-computation...');

  const books = await getAllBooks();
  console.log(`📚 Found ${books.length} books`);

  if (books.length === 0) {
    console.log('⚠️  No books found, exiting');
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];

    try {
      const document = buildBookDocument(book);
      const { vector } = buildEmbeddingPair(document);

      await saveEmbedding(book.id, vector);

      success++;

      if (i % 10 === 0) {
        console.log(`✅ Processed ${i + 1}/${books.length} books`);
      }
    } catch (error) {
      failed++;
      console.error(`❌ Failed to process book ${book.id}:`, error);
    }
  }

  console.log('\n📊 Results:');
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Success rate: ${((success / books.length) * 100).toFixed(1)}%`);
}

main().catch(console.error);
