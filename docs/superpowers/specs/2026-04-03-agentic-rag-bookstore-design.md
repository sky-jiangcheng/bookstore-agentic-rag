# Agentic RAG Bookstore - Design Specification

**Date:** 2026-04-03
**Author:** Claude Code
**Status:** Approved

## Overview

Redesign and implement an Agentic RAG system for the BookStore project, migrated to Vercel/Next.js architecture with incremental migration.

### Goals

- Primary: Build a fully functional Agentic RAG system that provides:
  - Intelligent personalized book recommendations
  - Natural language question answering about books
  - Knowledge-enhanced conversational experience
- Secondary: Migrate to Vercel/Next.js full-stack incrementally while preserving working microservices
- Maintain microservices advantages but simplify unnecessary complexity

## Architecture

### High-Level Hybrid Architecture

Approach 2 (Hybrid) selected:
- New Next.js 16 project at root for frontend and redesigned RAG service
- Existing Python microservices preserved (auth, catalog, gateway, ops)
- Vercel Marketplace provides managed infrastructure (Upstash Vector, Upstash Redis)

```
┌─────────────────────────────────────────────────────────────┐
│                   User Browser                                │
└────────────────┬─────────────────────────────────────────────┘
                 │
         ┌───────▼──────────┐
         │  Next.js 16 App  │  ← New: React Frontend + RAG API
         │  (Vercel)        │
         └───┬──────────────┘
             │
    ┌────────┼────────┐
    │        │        │
┌───▼──┐┌──▼────┐┌──▼──────┐
│ RAG  ││ Auth  ││ Catalog │  ← Existing Python microservices
│ API  ││ API  ││ API     │
└───┬──┘└──┬────┘└───┬─────┘
    │      │         │
    │      └─────────┼───────────────────┐
    │                │                   │
┌──▼──────────┐ ┌────▼──────────┐  ┌────▼──────────────┐
│ Upstash     │ │ PostgreSQL   │  │ Upstash Redis     │
│ Vector      │ │ (Catalog)    │  │ (Cache/Memory)    │
│ Marketplace │ │ Existing     │  │ Marketplace       │
└──────────────┘ └──────────────┘  └──────────────────┘
```

### Project Structure

```
BookStore/
├── app/                      ← Next.js 16 App Router (new)
│   ├── api/
│   │   └── rag/
│   │       ├── chat/route.ts       ← RAG chat streaming endpoint
│   │       └── search/route.ts     ← Traditional search endpoint
│   ├── layout.tsx
│   ├── page.tsx                   ← Main RAG chat UI
│   └── search/page.tsx            ← Traditional search page
├── components/
│   ├── ai-elements/               ← AI Elements chat components
│   ├── rag-chat.tsx               ← Main RAG chat component
│   └── search-filter.tsx          ← Traditional search filter
├── lib/
│   ├── agents/
│   │   ├── requirement-agent.ts   ← Requirement analysis
│   │   ├── retrieval-agent.ts     ← Multi-path retrieval
│   │   ├── recommendation-agent.ts ← Generate book list
│   │   ├── reflection-agent.ts    ← Quality evaluation
│   │   └── orchestrator.ts         ← Multi-agent orchestration
│   ├── tools/
│   │   ├── vector-search.ts       ← Upstash Vector search tool
│   │   ├── catalog-client.ts      ← Existing catalog API client
│   │   └── auth-client.ts         ← Existing auth API client
│   ├── embeddings.ts              ← Embedding generation
│   └── upstash.ts                 ← Upstash Vector/Redis client
├── types/
│   └── rag.ts                     ← TypeScript type definitions
├── [existing microservices remain]
│   ├── bookstore-auth/
│   ├── bookstore-catalog/
│   ├── bookstore-frontend/
│   ├── bookstore-gateway/
│   ├── bookstore-ops/
│   └── bookstore-rag/
└── package.json
```

## Agentic RAG System Design

### Multi-Agent Architecture

Four specialized agents collaborate in a pipeline:

1. **Requirement Analysis Agent**
   - Parses natural language user query
   - Extracts: categories, keywords, budget constraints, number of books requested, preferences
   - Detects when clarification is needed
   - Output: Structured requirement analysis

2. **Retrieval Agent**
   - Performs multi-path parallel retrieval:
     - Semantic vector search in Upstash Vector (book descriptions/summaries)
     - Filtered keyword search via existing catalog API
     - Popularity-based retrieval (bestsellers, trending)
   - Merges results using Reciprocal Rank Fusion (RRF)
   - Output: Ranked list of candidate books

3. **Recommendation Agent**
   - Takes candidates and requirements as input
   - Ranks candidates according to user preferences
   - Generates personalized explanation for each book
   - Output: Final recommended book list

4. **Reflection Agent**
   - Evaluates recommendation against requirements:
     - Requirement matching score
     - Diversity of categories
     - Book quality (relevance + stock availability)
     - Budget compliance
   - Triggers refinement iteration if quality below threshold
   - Output: Evaluation result + improvement suggestions

### Memory System

- **Short-term memory**: Current conversation history stored in AI SDK agent memory
- **Long-term memory**: User preferences stored in Upstash Redis
- **Working memory**: Intermediate retrieval results kept in agent context during reasoning

### Tools Available to Agents

| Tool | Purpose |
|------|---------|
| `search_books_vector` | Semantic vector search in Upstash Vector |
| `search_books_catalog` | Filtered search via existing catalog API |
| `get_book_details` | Get detailed information for specific books |
| `check_inventory` | Check real-time stock availability |
| `evaluate_recommendation` | Self-evaluation of recommendation quality |

### Recommendation Modes

Three modes supported:
1. **Agentic RAG** (default): Full multi-agent AI-powered recommendation
2. **Traditional Filter Search**: Direct keyword/category filtering
3. **Hybrid**: Traditional search base + RAG ranking and personalization

## Technology Stack

| Layer | Technology | Reasoning |
|-------|------------|-----------|
| Frontend | Next.js 16 React | Vercel platform native, App Router, Server Components |
| AI Framework | Vercel AI SDK v6 | Standardized agent architecture, streaming, provider agnostic |
| LLM | Google Gemini | Chosen by user, latest model via Google AI API |
| Embeddings | Google Gemini Embeddings | Consistent with LLM provider, good quality |
| Vector DB | Upstash Vector | Serverless, Vercel Marketplace integration, pay-as-you-go |
| Cache/Memory | Upstash Redis | Same provider, serverless, integrated billing |
| UI Components | AI Elements + shadcn/ui | Pre-built AI chat components, follows Vercel best practices |
| Existing Backend | Python FastAPI microservices | Preserve working code, incremental migration |

## Integration with Existing Microservices

### Catalog Service Integration

- Next.js RAG API makes HTTP requests to catalog service for:
  - Filtered searches by category, price, author
  - Detailed book information
  - Real-time inventory checks
- Base URL configured via environment variable `CATALOG_SERVICE_URL`

### Auth Integration

- Frontend passes auth token in Authorization header
- RAG API validates token by calling existing auth service
- User ID extracted from token for personalized recommendations
- Base URL configured via environment variable `AUTH_SERVICE_URL`

## Key Features

### Core Functionality

- ✅ Conversational multi-turn recommendation - refine queries gradually
- ✅ Multi-path retrieval (vector + keyword + popular) for better coverage
- ✅ Iterative refinement with self-reflection - improves quality automatically
- ✅ Personalized explanation for each recommended book
- ✅ Three recommendation modes (Agentic RAG / Traditional / Hybrid)
- ✅ Real-time stock checking via existing catalog
- ✅ Streaming response - users see progress immediately
- ✅ Fallback to traditional search if RAG fails

### Observability & Testing

- ✅ A/B testing capability for different recommendation strategies
- ✅ User feedback collection (thumbs up/down on recommendations)
- ✅ Key metrics tracking:
  - Response time by agent phase
  - Token consumption / cost
  - Error rate
  - User satisfaction
  - Conversion rate (recommendation → purchase)

## Performance Optimization

1. **Streaming**: Incremental streaming of agent progress to user
2. **Parallel Retrieval**: Multiple retrieval strategies run in parallel
3. **Caching**:
   - Frequent query embeddings cached in Redis (24h TTL)
   - Book details cached to reduce catalog API calls
4. **Edge Runtime**: RAG API routes run on Vercel Edge Network
5. **Iteration Limit**: Maximum 3 refinement iterations to control cost/latency

Expected: First streaming update < 1s, complete response in 10-20s.

## Fallback & Error Handling

- If LLM API fails → fall back to traditional search
- If Vector search fails → use catalog search only
- If any agent step fails → return partial results with user-friendly message
- All external HTTP calls have timeouts and retries

## Cost Considerations

- Upstash Vector/Redis: Generous free tier for development, pay-as-you-go for production
  - Free: 10k vectors, 10k commands/day → enough for starting
  - Production: ~$0.10-$0.50 per month per 1k books → very affordable
- Google Gemini API: Pay-as-you-go pricing based on tokens
  - Embeddings are very low cost
  - Multi-agent reasoning uses more tokens but still affordable for most use cases

## Implementation Phases

### Phase 1: Foundation (2-3 weeks)
- [ ] Create Next.js 16 project structure
- [ ] Set up Upstash Vector and Redis integration
- [ ] Implement embedding generation
- [ ] Basic vector search endpoint
- [ ] Simple recommendation generation
- [ ] Connect to existing catalog/auth services
- [ ] Basic UI for chat

### Phase 2: Complete Multi-Agent (2-3 weeks)
- [ ] Implement all four agents (requirement, retrieval, recommendation, reflection)
- [ ] Multi-agent orchestrator with iterative refinement
- [ ] Streaming response to UI
- [ ] Three recommendation modes (RAG/search/hybrid)
- [ ] Full conversational multi-turn support
- [ ] Complete chat UI with AI Elements

### Phase 3: Polish & Advanced Features (1-2 weeks)
- [ ] Long-term user preference memory (Redis)
- [ ] A/B testing infrastructure
- [ ] User feedback collection (thumbs up/down)
- [ ] Analytics and monitoring
- [ ] Performance tuning and caching
- [ ] Error handling improvements
- [ ] Testing and bug fixes

## Dependencies for User

Before we start implementation, you need:
1. Google AI API key for Gemini
2. Vercel account (for deployment)
3. Upstash Vector and Redis created via Vercel Marketplace
4. Existing catalog and auth services accessible from Vercel network
5. Book data available for initial embedding batch processing

## Next Steps

After approval of this spec, we'll create a detailed implementation plan using the `writing-plans` skill, then start implementation phase by phase.
