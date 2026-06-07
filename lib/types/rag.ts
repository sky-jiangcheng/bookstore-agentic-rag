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
  popularity_score?: number;
}

export interface RequirementAnalysis {
  analysis_strategy?: 'llm' | 'local-fallback';
  original_query: string;
  categories: string[];
  keywords: string[];
  expanded_search_terms: string[];
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
  sources: ('keyword' | 'popular' | 'popular-fallback')[];
  total_candidates: number;
  sql?: string;
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

export interface AgentProgress {
  type: 'phase_start' | 'phase_complete' | 'complete' | 'error';
  phase?: 'requirement_analysis' | 'retrieval' | 'generation';
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
  search_terms?: string[];
  limit?: number;
  page?: number;
  requirement?: any;
}

export interface UserInfo {
  userId: string;
  preferences: {
    favoriteCategories?: string[];
    priceRange?: { min: number; max: number };
  };
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
