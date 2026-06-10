# Publication Year Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store publication years from the original Excel files and apply recent-year constraints to production catalog searches.

**Architecture:** Normalize year-only source values in Python, export compact ID/year NDJSON, and backfill through a dedicated Node script. Extend the shared requirement and catalog filter contracts so both LLM and local fallback parsing produce a parameterized PostgreSQL year predicate.

**Tech Stack:** PostgreSQL/Neon, TypeScript, Node.js, Python, openpyxl/pandas, Node test runner.

---

### Task 1: Red Tests

**Files:**
- Modify: `tests/test_huqifeng_prepare.py`
- Modify: `tests/agents.test.ts`
- Modify: `tests/current-outages.test.ts`

- [ ] Test Excel date, year string, date string, blank, and invalid publication values.
- [ ] Test supplement records fill a missing main publication year without replacing a valid main year.
- [ ] Test `近二年` produces `publication_year_min = referenceYear - 1`.
- [ ] Test catalog SQL uses `publication_year >= $N`.
- [ ] Run focused tests and confirm they fail before implementation.

### Task 2: Source and Import Pipeline

**Files:**
- Modify: `scripts/huqifeng_prepare.py`
- Create: `scripts/export-publication-years.py`
- Modify: `scripts/import-books.mjs`
- Modify: `scripts/import-books-bulk.mjs`
- Create: `scripts/backfill-publication-years.mjs`

- [ ] Normalize `出版时间` to `publication_year`.
- [ ] Preserve main-source precedence while filling missing years from supplements.
- [ ] Export compact ID/year NDJSON.
- [ ] Include the field in normal imports.
- [ ] Backfill only `publication_year` in configurable batches.

### Task 3: Schema and Query Contract

**Files:**
- Create: `scripts/sql/007_publication_year.sql`
- Modify: `scripts/sql/001_init_books.sql`
- Modify: `scripts/vercel/init-schema.sql`
- Modify: `scripts/vercel/init-db.mjs`
- Modify: `lib/types/rag.ts`
- Modify: `lib/agents/requirement-agent.ts`
- Modify: `app/api/rag/chat/route.ts`
- Modify: `lib/agents/retrieval-agent.ts`
- Modify: `lib/server/catalog-repository.ts`
- Modify: `components/query-preparation.ts`

- [ ] Add nullable `SMALLINT` with a valid-year check.
- [ ] Add the partial year index.
- [ ] Add `publication_year_min` to API and internal contracts.
- [ ] Convert recency phrases into an inclusive minimum year.
- [ ] Apply the filter to normal search and export streaming queries.

### Task 4: Local Verification

- [ ] Run Python unit tests.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Generate compact year NDJSON and validate count and coverage.

### Task 5: Production Migration

- [ ] Apply the idempotent column/check migration.
- [ ] Backfill publication years in 5,000-row batches.
- [ ] Create the partial index concurrently.
- [ ] Verify non-null coverage, distribution, table size, and query plan.
- [ ] Deploy application code and verify a production `近二年` request.
