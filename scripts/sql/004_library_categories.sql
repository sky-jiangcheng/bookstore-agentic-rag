-- =============================================================
-- 图书馆别体系迁移
-- 1. library_categories 表：馆别元数据
-- 2. books.library_types 列：每本书预分配的馆别列表
-- 3. filter_keywords 与 library_categories 关联
-- =============================================================

-- 馆别元数据
CREATE TABLE IF NOT EXISTS library_categories (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  icon            TEXT DEFAULT '',
  sort_order      INT DEFAULT 0,
  reclassified_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 初始馆别（匹配原有硬编码枚举）
INSERT INTO library_categories (code, name, sort_order, reclassified_at) VALUES
  ('公共馆',   '公共馆',   1, NOW()),
  ('成人目录', '成人目录', 2, NOW()),
  ('初高中',   '初高中',   3, NOW()),
  ('小学',     '小学',     4, NOW()),
  ('大学',     '大学',     5, NOW())
ON CONFLICT (code) DO NOTHING;

-- books 表加 library_types 数组列
ALTER TABLE books ADD COLUMN IF NOT EXISTS library_types TEXT[] NOT NULL DEFAULT '{}';

-- GIN 索引加速 @> / && 数组查询
CREATE INDEX IF NOT EXISTS idx_books_library_types ON books USING GIN (library_types);
