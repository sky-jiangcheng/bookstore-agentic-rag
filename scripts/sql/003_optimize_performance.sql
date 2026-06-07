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

-- 注意：GIN trigram 索引已覆盖 ILIKE '%term%' 搜索，无需额外生成列。
