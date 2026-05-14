/**
 * Types aligned with bookstore-local-platform
 * `app/api/v1/book_list/schemas.py` for Gateway / frontend contract.
 */

export interface CategoryRequirement {
  category: string;
  percentage: number;
  count: number;
}

export interface ParsedRequirements {
  target_audience: string | null;
  cognitive_level: string | null;
  categories: CategoryRequirement[];
  keywords: string[];
  constraints: string[];
  exclude_textbooks: boolean;
  min_cognitive_level: string | null;
}

export interface ParseRequirementsRequest {
  user_input: string;
  use_history?: boolean;
}

export interface ParseRequirementsResponse {
  request_id: string;
  session_id: number;
  original_input: string;
  parsed_requirements: ParsedRequirements;
  confidence_score: number;
  suggestions: string[];
  needs_confirmation: boolean;
  message: string;
}

export interface GenerateBookListRequest {
  request_id?: string | null;
  requirements?: ParsedRequirements | null;
  limit?: number;
  save_to_history?: boolean;
  auto_complete?: boolean;
}

export interface BookRecommendation {
  book_id: number;
  barcode: string;
  title: string;
  author: string | null;
  publisher: string | null;
  price: number | null;
  stock: number;
  category: string | null;
  cognitive_level: string | null;
  difficulty_level: number | null;
  match_score: number;
  remark: string | null;
}

export interface GenerateBookListResponse {
  request_id: string | null;
  session_id: number | null;
  book_list_id: number | null;
  requirements: ParsedRequirements;
  recommendations: BookRecommendation[];
  total_count: number;
  category_distribution: Record<string, number>;
  generation_time_ms: number;
  success: boolean;
  message: string;
}

export interface BookListParseSession {
  original_input: string;
  parsed_requirements: ParsedRequirements;
  created_at: number;
}
