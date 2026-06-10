-- =============================================================
-- Database Optimization Migration:
-- 1. Create table book_descriptions for vertical partitioning
-- 2. Migrate existing descriptions (optional, since they are empty)
-- 3. Drop description column from books
-- 4. Add clc_code, age_min, and age_max to books
-- 5. Create functional index idx_books_primary_category on books
-- =============================================================

-- 1. Create book_descriptions table
CREATE TABLE IF NOT EXISTS book_descriptions (
  book_id BIGINT PRIMARY KEY,
  description TEXT
);

-- 2. Add new columns
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS clc_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS age_min SMALLINT,
  ADD COLUMN IF NOT EXISTS age_max SMALLINT;

-- 3. Drop description column from books (after verifying/migrating)
-- Since description is currently 100% empty online (all rows are empty strings or NULL),
-- we can safely drop it.
ALTER TABLE books DROP COLUMN IF EXISTS description;

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_books_clc_code
  ON books(clc_code)
  WHERE clc_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_books_age_range
  ON books(age_min, age_max)
  WHERE age_min IS NOT NULL OR age_max IS NOT NULL;

-- 5. Functional Index for exact join mapping on the primary category (the second part of the slash-split string)
CREATE INDEX IF NOT EXISTS idx_books_primary_category
  ON books (split_part(book_category, '/', 2));
