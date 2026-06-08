-- =============================================================
-- 重分类：根据 filter_keywords 规则回填 books.library_types
-- 在 Neon SQL 编辑器或 psql 中执行，全程数据库内完成
-- =============================================================

DO $$
DECLARE
  rec RECORD;
  kw RECORD;
  conds TEXT;
  sql_ TEXT;
  matched INT;
BEGIN
  -- 每个馆别一条批量 UPDATE
  FOR rec IN (
    SELECT DISTINCT fk.category
    FROM filter_keywords fk
    INNER JOIN library_categories lc ON lc.code = fk.category
    WHERE fk.is_active = TRUE
    ORDER BY fk.category
  ) LOOP
    conds := '';
    FOR kw IN (
      SELECT keyword FROM filter_keywords
      WHERE category = rec.category AND is_active = TRUE
    ) LOOP
      IF conds != '' THEN conds := conds || ' OR '; END IF;
      conds := conds || format(
        'CONCAT(COALESCE(title,''''), '' '', COALESCE(category,''''), '' '', COALESCE(description,'''')) ILIKE %L',
        '%' || kw.keyword || '%'
      );
    END LOOP;

    IF conds != '' THEN
      sql_ := format(
        'UPDATE books SET library_types = array_append(library_types, %L)
         WHERE (%s) AND NOT (library_types @> ARRAY[%L])',
        rec.category, conds, rec.category
      );
      EXECUTE sql_;
      GET DIAGNOSTICS matched = ROW_COUNT;
      RAISE NOTICE '[%] matched % books', rec.category, matched;
    END IF;
  END LOOP;

  -- 默认未匹配的书归入 公共馆
  UPDATE books SET library_types = array_append(library_types, '公共馆')
  WHERE library_types = '{}' AND NOT (library_types @> ARRAY['公共馆']);
  GET DIAGNOSTICS matched = ROW_COUNT;
  RAISE NOTICE '[公共馆] default % books', matched;

  -- 更新重分类时间戳
  UPDATE library_categories SET reclassified_at = NOW(), updated_at = NOW()
  WHERE code IN (
    SELECT DISTINCT fk.category FROM filter_keywords fk
    INNER JOIN library_categories lc ON lc.code = fk.category WHERE fk.is_active = TRUE
    UNION SELECT '公共馆'
  );

  RAISE NOTICE 'Reclassification complete';
END;
$$;

-- =============================================================
-- 重建索引
-- =============================================================

-- GIN 索引：加速 library_types 数组查询
CREATE INDEX IF NOT EXISTS idx_books_library_types
  ON books USING GIN (library_types);

-- 性能优化索引（可选，按需恢复）
CREATE INDEX IF NOT EXISTS idx_books_category_price
  ON books(category, price, popularity_score DESC);

CREATE INDEX IF NOT EXISTS idx_books_popular_high
  ON books(popularity_score DESC, updated_at DESC, id)
  WHERE popularity_score >= 10;

CREATE INDEX IF NOT EXISTS idx_books_pop_sort
  ON books(popularity_score DESC, updated_at DESC, id);
