-- =============================================================
-- 10K+ 性能优化迁移
-- 1. 覆盖索引：减少 ORDER BY popularity_score 回表查询
-- 2. 高 popularity 预过滤：热门图书快速入口
-- 3. 搜索文档的 tsvector 列（可选，用于未来全文搜索）
-- =============================================================

-- 覆盖索引：让 ORDER BY popularity_score DESC, updated_at DESC 可以直接走索引
-- 避免 10K+ 行排序时的额外 Sort 节点
CREATE INDEX IF NOT EXISTS idx_books_pop_sort
  ON books(popularity_score DESC, updated_at DESC, id);

-- 部分索引：只对高流行度的图书做加速（当搜索无特定关键词时，只扫描高热度图书）
-- 适用于 "热门图书" 类查询
CREATE INDEX IF NOT EXISTS idx_books_popular_high
  ON books(popularity_score DESC, updated_at DESC, id)
  WHERE popularity_score >= 10;

-- 组合过滤索引：分类 + 价格的复合查询加速（常见于导出筛选场景）
CREATE INDEX IF NOT EXISTS idx_books_category_price
  ON books(category, price, popularity_score DESC);

-- 唯一搜索文档表达式索引：配合 pg_trgm 加速（替代原有 GIN 索引的表达式重复计算）
-- 这个索引让 WHERE 子句中的 `(coalesce(title,'')||' '||...) ILIKE '%x%'` 
-- 能利用到 pg_trgm 的相似度搜索
-- （原有 GIN 索引已覆盖此场景，此处仅作补充说明）
-- 
-- 注意：GIN 索引在 10K+ 匹配行时 bitmap scan 开销大，建议结合 LIMIT 使用

-- 添加 search_doc 生成列（可选，简化查询表达式）
ALTER TABLE books ADD COLUMN IF NOT EXISTS search_doc TEXT
  GENERATED ALWAYS AS (
    coalesce(title, '') || ' ' || coalesce(author, '') || ' ' ||
    coalesce(category, '') || ' ' || coalesce(description, '')
  ) STORED;
