#!/usr/bin/env node

/**
 * Initialize BookStore database schema on Vercel Postgres
 * Usage: node scripts/vercel/init-db.mjs
 */

import { sql } from '@vercel/postgres';

console.log('🚀 Initializing BookStore database schema...\n');

// Check for --drop flag to allow table reset
const shouldDrop = process.argv.includes('--drop');

if (shouldDrop) {
  // WARNING: This will permanently delete all data in the books table!
  console.warn('⚠️  WARNING: --drop flag detected. This will DELETE all existing data!');
  console.warn('⚠️  Press Ctrl+C within 3 seconds to cancel...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
}

try {
  // Drop existing table only if --drop flag is provided
  if (shouldDrop) {
    await sql`DROP TABLE IF EXISTS books CASCADE`;
    console.log('🔄 Dropped existing table for schema update');
  }

  // Create books table with bigint id and a nullable source_id for oversized source identifiers
  await sql`
    CREATE TABLE IF NOT EXISTS books (
      id BIGINT PRIMARY KEY,
      source_id TEXT,
      title VARCHAR(255) NOT NULL,
      author VARCHAR(255),
      publisher VARCHAR(255),
      publication_year SMALLINT CHECK (publication_year BETWEEN 1900 AND 2100),
      description TEXT,
      cover_url VARCHAR(512),
      price DECIMAL(10, 2),
      stock INTEGER DEFAULT 0,
      book_category VARCHAR(100),
      library_codes TEXT[] NOT NULL DEFAULT '{}',
      popularity_score DECIMAL(5, 2) DEFAULT 0,
      clc_code VARCHAR(50),
      age_min SMALLINT,
      age_max SMALLINT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('✅ Created table: books (with BIGINT id and source_id)');

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_books_title ON books(title)`;
  console.log('✅ Created index: idx_books_title');

  await sql`CREATE INDEX IF NOT EXISTS idx_books_author ON books(author)`;
  console.log('✅ Created index: idx_books_author');

  await sql`CREATE INDEX IF NOT EXISTS idx_books_category ON books(book_category)`;
  console.log('✅ Created index: idx_books_category');

  await sql`CREATE INDEX IF NOT EXISTS idx_books_popularity ON books(popularity_score DESC)`;
  console.log('✅ Created index: idx_books_popularity');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_books_publication_year
    ON books(publication_year)
    WHERE publication_year IS NOT NULL
  `;
  console.log('✅ Created index: idx_books_publication_year');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_books_clc_code
    ON books(clc_code)
    WHERE clc_code IS NOT NULL
  `;
  console.log('✅ Created index: idx_books_clc_code');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_books_age_range
    ON books(age_min, age_max)
    WHERE age_min IS NOT NULL OR age_max IS NOT NULL
  `;
  console.log('✅ Created index: idx_books_age_range');

  // Optional trigram index for fast ILIKE and fuzzy text matching.
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_books_search_trgm
      ON books
      USING gin (
        (coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(book_category, '') || ' ' || coalesce(description, '')) gin_trgm_ops
      )
    `;
    console.log('✅ Created index: idx_books_search_trgm');
  } catch (e) {
    console.log('⚠️  Trigram index skipped; keyword search will still work without it. Error:', e.message || e);
  }

  console.log('\n✨ Schema initialization complete!\n');

} catch (error) {
  console.error('❌ Schema initialization failed:', error.message);
  process.exit(1);
}
