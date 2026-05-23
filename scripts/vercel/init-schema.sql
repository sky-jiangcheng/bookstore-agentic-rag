-- BookStore RAG Database Schema for Neon/Vercel Postgres
-- 支持 pgvector 单库架构

-- 启用 pgvector 扩展（必须先执行）
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing table if needed (uncomment to reset)
-- DROP TABLE IF EXISTS books CASCADE;
-- DROP TABLE IF EXISTS book_embeddings CASCADE;

-- 书籍主表（保留原有字段）
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
  popularity_score DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 书籍向量嵌入表（pgvector 单库架构）
CREATE TABLE IF NOT EXISTS book_embeddings (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chunk_index INTEGER DEFAULT 0,
  text_content TEXT,
  embedding vector(768),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_book_chunk UNIQUE (book_id, chunk_index)
);

-- 为 books 创建索引
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_popularity ON books(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_books_fulltext ON books USING gin(to_tsvector('simple', title || ' ' || COALESCE(author, '') || ' ' || COALESCE(category, '')));

-- 为 book_embeddings 创建向量索引（HNSW）
-- vector_cosine_ops 支持余弦相似度搜索
CREATE INDEX IF NOT EXISTS idx_book_embeddings_vector ON book_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_book_embeddings_book_id ON book_embeddings(book_id);