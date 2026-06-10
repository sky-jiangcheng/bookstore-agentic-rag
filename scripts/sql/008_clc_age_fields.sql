-- =============================================================
-- Add CLC code and Age Range target fields
-- 1. Add clc_code (中图分类号)
-- 2. Add age_min & age_max (适读年龄区间)
-- =============================================================

ALTER TABLE books
  ADD COLUMN IF NOT EXISTS clc_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS age_min SMALLINT,
  ADD COLUMN IF NOT EXISTS age_max SMALLINT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_books_clc_code
  ON books(clc_code)
  WHERE clc_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_books_age_range
  ON books(age_min, age_max)
  WHERE age_min IS NOT NULL OR age_max IS NOT NULL;
