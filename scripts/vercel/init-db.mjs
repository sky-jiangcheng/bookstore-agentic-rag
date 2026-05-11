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
      description TEXT,
      cover_url VARCHAR(512),
      price DECIMAL(10, 2),
      stock INTEGER DEFAULT 0,
      category VARCHAR(100),
      popularity_score DECIMAL(5, 2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('✅ Created table: books (with BIGINT id and source_id)');

  // Create indexes
  await sql`CREATE INDEX idx_books_title ON books(title)`;
  console.log('✅ Created index: idx_books_title');

  await sql`CREATE INDEX idx_books_author ON books(author)`;
  console.log('✅ Created index: idx_books_author');

  await sql`CREATE INDEX idx_books_category ON books(category)`;
  console.log('✅ Created index: idx_books_category');

  await sql`CREATE INDEX idx_books_popularity ON books(popularity_score DESC)`;
  console.log('✅ Created index: idx_books_popularity');

  // Full-text search index
  try {
    await sql`CREATE INDEX idx_books_fulltext ON books USING gin(to_tsvector('simple', title || ' ' || COALESCE(author, '') || ' ' || COALESCE(category, '')))`;
    console.log('✅ Created index: idx_books_fulltext (full-text search)');
  } catch (e) {
    console.log('⚠️  Full-text index skipped (not supported on all Postgres versions)');
  }

  console.log('\n✨ Schema initialization complete!\n');

} catch (error) {
  console.error('❌ Schema initialization failed:', error.message);
  process.exit(1);
}
