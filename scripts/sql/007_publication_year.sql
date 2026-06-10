ALTER TABLE books
  ADD COLUMN IF NOT EXISTS publication_year SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'books_publication_year_check'
      AND conrelid = 'books'::regclass
  ) THEN
    ALTER TABLE books
      ADD CONSTRAINT books_publication_year_check
      CHECK (publication_year BETWEEN 1900 AND 2100)
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE books
  VALIDATE CONSTRAINT books_publication_year_check;

-- Run this statement separately from any transaction after the backfill:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_books_publication_year
--   ON books(publication_year)
--   WHERE publication_year IS NOT NULL;
