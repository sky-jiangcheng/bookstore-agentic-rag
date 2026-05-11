CREATE TABLE IF NOT EXISTS books (
  id BIGINT PRIMARY KEY,
  source_id TEXT,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  publisher VARCHAR(255),
  description TEXT,
  cover_url VARCHAR(512),
  price DECIMAL(10, 2) DEFAULT 0,
  stock INTEGER DEFAULT 0,
  category VARCHAR(100) DEFAULT 'general',
  popularity_score DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_popularity_score ON books(popularity_score DESC);

CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  query TEXT NOT NULL,
  book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
  signal TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_user_id
  ON recommendation_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_book_id
  ON recommendation_feedback(book_id);
