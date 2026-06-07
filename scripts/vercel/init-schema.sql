-- BookStore schema: keyword retrieval with optional trigram acceleration.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

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

CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_popularity ON books(popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_books_category_price ON books(category, price);
CREATE INDEX IF NOT EXISTS idx_books_price ON books(price);
CREATE INDEX IF NOT EXISTS idx_books_search_trgm
  ON books
  USING gin (
    (coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(category, '') || ' ' || coalesce(description, '')) gin_trgm_ops
  );
