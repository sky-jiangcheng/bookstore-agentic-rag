export interface Book {
  book_id: string;
  title: string;
  author: string;
  publisher: string;
  price: number;
  stock: number;
  category: string;
  description: string;
  cover_url?: string;
  relevance_score: number;
}

export interface RequirementAnalysis {
  original_query: string;
  categories: string[];
  keywords: string[];
  constraints: {
    budget?: number;
    target_count?: number;
    author?: string;
    price_min?: number;
    price_max?: number;
    exclude_keywords?: string[];
  };
  preferences: string[];
  needs_clarification: boolean;
  clarification_questions: string[];
}

export interface RetrievalResult {
  books: Book[];
  sources: ('semantic' | 'keyword' | 'popular' | 'reranker')[];
  total_candidates: number;
}

export interface RecommendedBook extends Book {
  explanation: string;
}

export interface RecommendationResult {
  books: RecommendedBook[];
  total_price: number;
  quality_score: number;
  confidence: number;
  category_distribution: Record<string, number>;
}

export interface EvaluationResult {
  overall_score: number;
  scores: {
    requirement_match: number;
    diversity: number;
    book_quality: number;
    budget: number;
  };
  issues: string[];
  needs_improvement: boolean;
  suggestions: {
    type: string;
    action: string;
    target: string;
    description: string;
  }[];
}

export interface AgentProgress {
  type: 'phase_start' | 'phase_complete' | 'iteration_start' | 'clarification_needed' | 'optimization_needed' | 'complete' | 'error';
  phase?: 'requirement_analysis' | 'retrieval' | 'generation' | 'evaluation';
  content: string;
  data?: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface CatalogSearchFilters {
  categories?: string[];
  author?: string;
  price_min?: number;
  price_max?: number;
  query?: string;
}

export interface UserInfo {
  userId: string;
  preferences: {
    favoriteCategories?: string[];
    priceRange?: { min: number; max: number };
  };
}

// ============================================================================
// Classic RAG Components - New Types
// ============================================================================

/**
 * Text Chunk types for document processing
 */
export interface TextChunk {
  id: string;
  text: string;
  index: number;
  bookId: string;
  metadata: {
    title?: string;
    author?: string;
    category?: string;
    chunk_type?: 'metadata' | 'description';
    chunk_size?: number;
    strategy?: string;
  };
  embedding?: number[];
}

/**
 * Reranking result type
 */
export interface RerankedResult {
  book_id: string;
  score: number;
  rerank_score?: number;
  original_rank: number;
  new_rank: number;
}

/**
 * User feedback types
 */
export interface UserFeedback {
  id: string;
  sessionId: string;
  query: string;
  bookId: string;
  feedbackType: 'thumbs_up' | 'thumbs_down' | 'not_relevant' | 'click';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface FeedbackStats {
  bookId: string;
  positiveCount: number;
  negativeCount: number;
  averageScore: number;
  totalFeedback: number;
}

/**
 * Conversation memory for multi-turn dialogue
 */
export interface ConversationTurn {
  id: string;
  sessionId: string;
  timestamp: number;
  role: 'user' | 'assistant';
  content: string;
  requirement?: RequirementAnalysis;
  recommendations?: RecommendedBook[];
}

export interface ConversationSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  turns: ConversationTurn[];
  metadata: {
    userId?: string;
    startTime: number;
    turnCount: number;
  };
}

/**
 * Enhanced retrieval options with RAG features
 */
export interface EnhancedRetrievalOptions {
  enableReranking?: boolean;
  enableFeedbackBoost?: boolean;
  enableGraphRetrieval?: boolean;
  sessionId?: string;
  topK?: number;
  rerankerTopK?: number;
}
