#!/usr/bin/env node

/**
 * Initialize BookStore database schema on Vercel Postgres
 * Usage: node scripts/vercel/init-db.mjs
 */

import { sql } from '@vercel/postgres';

console.log('🚀 Initializing BookStore database schema...\n');

try {
  // Drop existing table if needed (for schema migration)
  await sql`DROP TABLE IF EXISTS books CASCADE`;
  console.log('🔄 Dropped existing table for schema update');

  // Create books table with bigint id and a nullable source_id for oversized source identifiers
  await sql`
    CREATE TABLE books (
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
    await sql`CREATE INDEX idx_books_fulltext ON books USING gin(to_tsvector('english', title || ' ' || COALESCE(author, '') || ' ' || COALESCE(category, '')))`;
    console.log('✅ Created index: idx_books_fulltext (full-text search)');
  } catch (e) {
    console.log('⚠️  Full-text index skipped (not supported on all Postgres versions)');
  }

  console.log('\n✨ Schema initialization complete!\n');

} catch (error) {
  console.error('❌ Schema initialization failed:', error.message);
  process.exit(1);
}
