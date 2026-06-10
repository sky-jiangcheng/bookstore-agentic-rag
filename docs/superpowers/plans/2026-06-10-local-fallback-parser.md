# Local Fallback Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Chinese local fallback parsing for repeated exclusions, bookstore domain phrases, and recent-year preferences.

**Architecture:** Keep deterministic parsing in `requirement-agent.ts`. Parse and remove negative clauses before positive intent extraction, then merge known domain phrases and recency preferences into the existing fallback result.

**Tech Stack:** TypeScript, Node test runner, Zod-compatible requirement types.

---

### Task 1: Regression Tests

**Files:**
- Modify: `tests/agents.test.ts`

- [ ] Add a test proving repeated `不要` clauses become separate normalized exclusions.
- [ ] Add a test proving the production query yields positive domain keywords without negative clauses.
- [ ] Run `npm run test:unit -- --test-name-pattern="fallback|parseExcludedKeywords"` and confirm the new assertions fail for the existing parser.

### Task 2: Deterministic Parser

**Files:**
- Modify: `lib/agents/requirement-agent.ts`
- Modify: `lib/agents/book-taxonomy.ts`

- [ ] Add Chinese numeral normalization for recent-year phrases.
- [ ] Extract and normalize repeated negative clauses before keyword/category analysis.
- [ ] Add known bookstore phrases for school audiences and extracurricular reading.
- [ ] Ensure inferred library type ignores negated audience words.
- [ ] Preserve recency as a preference because the database has no publication-year field.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Verification

**Files:**
- Verify: `tests/agents.test.ts`
- Verify: `lib/agents/requirement-agent.ts`

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Reproduce the production sentence and inspect the resulting fallback structure.
