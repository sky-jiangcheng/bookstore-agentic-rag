# Query Preparation And Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact three-column query preparation workspace with explicit confirmation, editable exclusions, pseudo SQL, and exact-match reusable templates.

**Architecture:** Put deterministic template, collision, and SQL preview logic in `components/query-preparation.ts` with unit coverage. Add a parse-only API and allow the chat API to receive a confirmed structured requirement. Keep session and template persistence client-side, while the existing RAG pipeline remains responsible for retrieval and recommendation.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node test runner, Tailwind CSS, Vercel.

---

### Task 1: Deterministic query preparation utilities

**Files:**
- Create: `components/query-preparation.ts`
- Create: `tests/query-preparation.test.ts`

- [ ] Write failing tests for normalized exact matching, collision suggestions, and pseudo SQL generation.
- [ ] Run `npm run test:unit -- tests/query-preparation.test.ts` and confirm the missing module failure.
- [ ] Implement the smallest typed utility module that satisfies those tests.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Parse-only and confirmed-requirement APIs

**Files:**
- Create: `app/api/rag/parse/route.ts`
- Modify: `app/api/rag/chat/route.ts`

- [ ] Add source regression assertions for the parse route and confirmed requirement schema.
- [ ] Run the focused regression test and confirm failure.
- [ ] Implement parse-only requirement analysis and pass confirmed requirements into `runRAGPipeline`.
- [ ] Re-run focused tests and type checking.

### Task 3: Three-column preparation UI

**Files:**
- Modify: `components/rag-chat.tsx`
- Modify: `components/RAGChat/ChatInput.tsx`
- Modify: `components/RAGChat/TuningPanel.tsx`
- Modify: `components/RAGChat/RAGChatHeader.tsx`
- Modify: `components/RAGChat/StarterPrompts.tsx`
- Modify: `app/globals.css`

- [ ] Add regression assertions for visible strategy, pseudo SQL, confirm/query controls, manual exclusions, and template actions.
- [ ] Run the regression test and confirm failure.
- [ ] Implement draft versus confirmed state, template persistence, context menu, manual exclusions, and compact styling.
- [ ] Run unit tests and type checking.

### Task 4: Verification and release

**Files:**
- Modify: `.gitignore`

- [ ] Ignore `.superpowers/` visual companion artifacts.
- [ ] Run `npm run test:unit`, `npm run typecheck`, and `npm run build`.
- [ ] Start the app and verify the preparation flow in the in-app browser.
- [ ] Commit the scoped changes, push `main`, deploy with `vercel --prod`, and run the production smoke check.
