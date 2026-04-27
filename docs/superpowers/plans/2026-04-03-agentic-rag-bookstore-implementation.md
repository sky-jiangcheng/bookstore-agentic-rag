# Agentic RAG Bookstore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a complete Agentic RAG system for personalized book recommendations on Vercel/Next.js, incrementally migrating from existing Python microservices.

**Architecture:** Hybrid architecture with new Next.js 16 frontend and RAG API, existing Python microservices preserved for auth, catalog, and ops. Multi-agent system with requirement analysis, multi-path retrieval, recommendation generation, and self-reflection. Upstash Vector for embeddings, Upstash Redis for caching and long-term memory.

**Tech Stack:** Next.js 16, Vercel AI SDK v6, Google Gemini, Upstash Vector, Upstash Redis, React, AI Elements, TypeScript.

---

## File Structure

```
BookStore/
├── .env.local.example                      ← Environment variables template
├── package.json                            ← Next.js project dependencies
├── tsconfig.json                           ← TypeScript configuration
├── next.config.ts                          ← Next.js 16 configuration
├── app/
│   ├── layout.tsx                          ← Root layout
│   ├── page.tsx                            ← Main RAG chat page
│   ├── search/
│   │   └── page.tsx                        ← Traditional search page
│   └── api/
│       ├── rag/
│       │   ├── chat/
│       │   │   └── route.ts                 ← RAG chat streaming endpoint
│       │   └── search/
│       │       └── route.ts                 ← Traditional search endpoint
├── components/
│   ├── ai-elements/                        ← AI Elements installed components
│   │   ├── message.tsx                     ← AI message component
│   │   └── message-response.tsx           ← AI markdown renderer
│   ├── rag-chat.tsx                        ← Main RAG chat interface
│   ├── search-filter.tsx                   ← Traditional search filter
│   └── recommendation-card.tsx            ← Book recommendation card
├── lib/
│   ├── types/
│   │   └── rag.ts                          ← TypeScript type definitions
│   ├── config/
│   │   └── environment.ts                  ← Environment configuration
│   ├── clients/
│   │   ├── catalog-client.ts              ← Catalog service HTTP client
│   │   └── auth-client.ts                 ← Auth service HTTP client
│   ├── embeddings.ts                       ← Embedding generation using Gemini
│   ├── upstash.ts                           ← Upstash Vector and Redis clients
│   ├── agents/
│   │   ├── base-agent.ts                  ← Base agent class
│   │   ├── requirement-agent.ts           ← Requirement analysis agent
│   │   ├── retrieval-agent.ts             ← Multi-path retrieval agent
│   │   ├── recommendation-agent.ts        ← Recommendation generation agent
│   │   ├── reflection-agent.ts            ← Quality evaluation/reflection agent
│   │   └── orchestrator.ts                 ← Multi-agent orchestrator
│   └── tools/
│       ├── vector-search.ts                ← Vector search tool
│       ├── catalog-search.ts               ← Catalog search tool
│       └── book-details.ts                ← Get book details tool
└── public/
    └── ...                                 ← Static assets
```

---

## Phase 1: Project Setup & Foundation

### Task 1.1: Initialize Next.js 16 Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `.gitignore`
- Create: `.env.local.example`

- [ ] **Step 1: Initialize package.json with dependencies

```json
{
  "name": "bookstore-rag-nextjs",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "ai": "^6.3.1",
    "@ai-sdk/google": "^2.0.6",
    "@ai-sdk/react": "^2.0.6",
    "@upstash/vector": "^1.1.3",
    "@upstash/redis": "^1.28.4",
    "next": "16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "ai-elements": "^1.0.0",
    "typescript": "^5.5.4",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0"
  }
}
```

- [ ] **Step 2: Create TypeScript configuration**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create Next.js 16 configuration**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create .gitignore

```
# Dependencies
node_modules
.pnp
*.pnp.js

# Testing
coverage
*.lcov
.nyc_output

# Production
build
dist
.next
out

# Environment variables
*.env
*.env.local
*.env.development.local
*.env.test.local
*.env.production.local

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.vscode
.idea
*.swp
*.swo
*~
```

- [ ] **Step 5: Create .env.local.example template

```
# Google AI API Key for Gemini
GOOGLE_API_KEY=your_google_google_api_key_here

# Upstash Vector
UPSTASH_VECTOR_REST_URL=your_upstash_vector_url_here
UPSTASH_VECTOR_REST_TOKEN=your_upstash_vector_token_here

# Upstash Redis
UPSTASH_REDIS_REST_URL=your_upstash_redis_url_here
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token_here

# Existing microservices URLs
AUTH_SERVICE_URL=http://localhost:8000
CATALOG_SERVICE_URL=http://localhost:8001

# Next.js public
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 6: Commit

```bash
git add package.json tsconfig.json next.config.ts .gitignore .env.local.example
git commit -m "init: initialize Next.js 16 project structure"
```

### Task 1.2: Configure Basic Next.js Layout & Type Definitions

**Files:**
- Create: `lib/types/rag.ts`
- Create: `lib/config/environment.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`

- [ ] **Step 1: Create TypeScript type definitions for RAG**

```typescript
// lib/types/rag.ts
export interface Book {
  book_id: number;
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
  };
  preferences: string[];
  needs_clarification: boolean;
  clarification_questions: string[];
}

export interface RetrievalResult {
  books: Book[];
  sources: ('semantic' | 'keyword' | 'popular')[];
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
  type: 'phase_start' | 'phase_complete' | 'iteration_start' | 'clarification_needed' | 'optimization_needed' | 'complete';
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
```

- [ ] **Step 2: Create environment configuration**

```typescript
// lib/config/environment.ts
export const config = {
  google: {
    apiKey: process.env.GOOGLE_API_KEY || '',
  },
  upstash: {
    vectorUrl: process.env.UPSTASH_VECTOR_REST_URL || '',
    vectorToken: process.env.UPSTASH_VECTOR_REST_TOKEN || '',
    redisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  },
  services: {
    authUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:8000',
    catalogUrl: process.env.CATALOG_SERVICE_URL || 'http://localhost:8001',
  },
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },
  rag: {
    maxIterations: 3,
    defaultTargetCount: 15,
    qualityThreshold: 0.8,
  },
} as const;

export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.google.apiKey) missing.push('GOOGLE_API_KEY');
  if (!config.upstash.vectorUrl) missing.push('UPSTASH_VECTOR_REST_URL');
  if (!config.upstash.vectorToken) missing.push('UPSTASH_VECTOR_REST_TOKEN');
  if (!config.upstash.redisUrl) missing.push('UPSTASH_REDIS_REST_URL');
  if (!config.upstash.redisToken) missing.push('UPSTASH_REDIS_REST_TOKEN');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export default config;
```

- [ ] **Step 3: Create root layout**

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BookStore - Intelligent Book Recommendation',
  description: 'Agentic RAG-powered personalized book recommendations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Create basic globals.css with Tailwind**

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-rgb: 10, 10, 10;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-rgb));
}
```

- [ ] **Step 5: Create tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

- [ ] **Step 6: Create postcss.config.js

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: Create empty homepage placeholder**

```tsx
// app/page.tsx
export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Intelligent Book Recommendation</h1>
      <p className="text-gray-600 dark:text-gray-400">
        Ask me anything about books, and I'll give you personalized recommendations!
      </p>
  </main>
  )
}
```

- [ ] **Step 8: Commit

```bash
git add lib/types/rag.ts lib/config/environment.ts app/layout.tsx app/page.tsx app/globals.css tailwind.config.js postcss.config.js
git commit -m "feat: add basic types and layout"
```

### Task 1.3: Implement Upstash Clients

**Files:**
- Create: `lib/upstash.ts`

- [ ] **Step 1: Write Upstash Vector and Redis client code

```typescript
// lib/upstash.ts
import { Index } from '@upstash/vector';
import { Redis } from '@upstash/redis';
import { config } from '@/lib/config/environment';
import type { Book } from '@/lib/types/rag';

export const vectorIndex = new Index({
  url: config.upstash.vectorUrl,
  token: config.upstash.vectorToken,
});

export const redis = new Redis({
  url: config.upstash.redisUrl,
  token: config.upstash.redisToken,
});

export interface VectorBook = {
  id: string;
  vector: number[];
  bookId: number;
  title: string;
  author: string;
  category: string;
  description: string;
};

export async function upsertBookVector(
  bookId: number, vector: number[], metadata: Omit<VectorBook>): Promise<void> {
  await vectorIndex.upsert([
    {
      id: bookId.toString(),
      vector,
      metadata: {
        bookId,
        ...metadata,
      },
    },
  ]);
}

export async function searchVectorSearch(
  queryVector: number[],
  topK: number = 10,
): Promise<{ id: string; score: number; metadata: Record<string, unknown> }[]> {
  const results = await vectorIndex.query({
    vector: queryVector,
    topK,
  });
  return results;
}

export async function deleteBookVector(bookId: number): Promise<void> {
  await vectorIndex.delete([bookId.toString()]);
}
```

- [ ] **Step 2: Fix syntax error in code

```typescript
export interface VectorBook {
  id: string;
  vector: number[];
  bookId: number;
  title: string;
  author: string;
  category: string;
  description: string;
}
```

- [ ] **Step 3: Fix function signature**

```typescript
export async function upsertBookVector(
  bookId: number, vector: number[], metadata: Omit<VectorBook, 'id' | 'vector'>): Promise<void> {
```

- [ ] **Step 4: Commit**

```bash
git add lib/upstash.ts
git commit -m "feat: add upstash vector and redis clients"
```

### Task 1.4: Implement Embedding Generation

**Files:**
- Create: `lib/embeddings.ts`

- [ ] **Step 1: Implement embedding generation with Google Gemini**

```typescript
// lib/embeddings.ts
import { google } from '@ai-sdk/google';
import { embed } from 'ai';
import { config } from '@/lib/config/environment';

const embeddingModel = google.textEmbeddingModel('text-embedding-004');

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
  });
  return embedding;
}

export async function generateBookEmbedding(
  title: string,
  description: string,
  author: string,
  category: string,
): Promise<number[]> {
  const combinedText = `Title: ${title}\nAuthor: ${author}\nCategory: ${category}\nDescription: ${description}`;
  return generateEmbedding(combinedText);
}
```

- [ ] **Step 2: Test embedding generation (manual test in node)

```bash
npx ts-node -e "import { generateEmbedding } from './lib/embeddings'; generateEmbedding('test').then(e => console.log('Generated embedding of length', e.length))"
```

Expected: Output shows embedding dimension (should be 768 for text-embedding-004)

- [ ] **Step 3: Commit**

```bash
git add lib/embeddings.ts
git commit -m "feat: add embedding generation with Google Gemini"
```

### Task 1.5: Implement Service Clients for Existing Microservices

**Files:**
- Create: `lib/clients/catalog-client.ts`
- Create: `lib/clients/auth-client.ts`

- [ ] **Step 1: Implement catalog service client

```typescript
// lib/clients/catalog-client.ts
import { config } from '@/lib/config/environment';
import type { Book, CatalogSearchFilters } from '@/lib/types/rag';

export async function searchCatalog(
  filters: CatalogSearchFilters,
): Promise<Book[]> {
  const params = new URLSearchParams();
  if (filters.categories) params.append('categories', filters.categories.join(','));
  if (filters.author) params.append('author', filters.author);
  if (filters.price_min) params.append('price_min', filters.price_min.toString());
  if (filters.price_max) params.append('price_max', filters.price_max.toString());
  if (filters.query) params.append('query', filters.query);

  const url = `${config.services.catalogUrl}/api/search?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Catalog search failed: ${response.statusText}`);
  }

  return response.json();
}

export async function getBookDetails(bookId: number): Promise<Book> {
  const url = `${config.services.catalogUrl}/api/books/${bookId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Get book details failed: ${response.statusText}`);
  }
  return response.json();
}

export async function checkInventory(bookId: number): Promise<{ stock: number }> {
  const url = `${config.services.catalogUrl}/api/books/${bookId}/stock`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Check inventory failed: ${response.statusText}`);
  }
  return response.json();
}

export async function getPopularBooks(count: number = 20): Promise<Book[]> {
  const url = `${config.services.catalogUrl}/api/popular?count=${count}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Get popular books failed: ${response.statusText}`);
  }
  return response.json();
}
```

- [ ] **Step 2: Implement auth service client**

```typescript
// lib/clients/auth-client.ts
import { config } from '@/lib/config/environment';

export interface UserInfo {
  userId: string;
  preferences: {
    favoriteCategories?: string[];
    priceRange?: { min: number; max: number };
  };
}

export async function validateToken(token: string): Promise<{ valid: boolean; user?: UserInfo }> {
  try {
    const url = `${config.services.authUrl}/api/validate';
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return { valid: false };
    }

    const data = await response.json();
    return { valid: true, user: data.user };
  } catch (error) {
    console.error('Token validation failed', error);
    return { valid: false };
  }
}

export async function getUserPreferences(userId: string): Promise<UserInfo['preferences']> {
  const url = `${config.services.authUrl}/api/users/${userId}/preferences`;
  const response = await fetch(url);
  if (!response.ok) {
    return {};
  }
  return response.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/clients/catalog-client.ts lib/clients/auth-client.ts
git commit -m "feat: add service clients for catalog and auth"
```

---

## Phase 2: Multi-Agent Implementation

*(continues in plan... but this is enough for getting started)

## Summary of Remaining Phases:

**Phase 2** continues with implementing each agent, the orchestrator, the API endpoint, and basic UI.

**Phase 3** adds long-term memory, A/B testing, monitoring, and polish.
