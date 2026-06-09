BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'filter_keywords' AND column_name = 'category'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'filter_keywords' AND column_name = 'library_code'
  ) THEN
    ALTER TABLE filter_keywords RENAME COLUMN category TO library_code;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'category_library_mapping' AND column_name = 'category'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'category_library_mapping' AND column_name = 'book_category'
  ) THEN
    ALTER TABLE category_library_mapping RENAME COLUMN category TO book_category;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'category_library_mapping' AND column_name = 'library_types'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'category_library_mapping' AND column_name = 'library_codes'
  ) THEN
    ALTER TABLE category_library_mapping RENAME COLUMN library_types TO library_codes;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'category'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'book_category'
  ) THEN
    ALTER TABLE books RENAME COLUMN category TO book_category;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'library_types'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'library_codes'
  ) THEN
    ALTER TABLE books RENAME COLUMN library_types TO library_codes;
  END IF;
END
$$;

WITH source_rows AS (
  DELETE FROM filter_keywords
  WHERE keyword = '男孩女孩·*-*岁'
  RETURNING library_code, is_active
)
INSERT INTO filter_keywords (keyword, library_code, is_active)
SELECT DISTINCT words.keyword, source_rows.library_code, source_rows.is_active
FROM source_rows
CROSS JOIN (VALUES ('男孩'), ('女孩'), ('岁')) AS words(keyword)
WHERE NOT EXISTS (
  SELECT 1
  FROM filter_keywords existing
  WHERE existing.keyword = words.keyword
    AND existing.library_code = source_rows.library_code
);

COMMIT;
