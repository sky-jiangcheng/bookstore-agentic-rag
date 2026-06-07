# Compact Cards and Theme Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver compact recommendation results and a coherent persisted light/dark/system theme switch inside the existing settings dialog.

**Architecture:** Add a small pure theme utility plus client controller for persistence and DOM updates. Keep the settings dialog responsible for separate model and appearance drafts, while CSS variables and scoped light-mode compatibility overrides theme the existing interface without scattering theme state through every component.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Radix Dialog, Node test runner.

---

### Task 1: Lock Result and Theme Behavior

**Files:**
- Create: `tests/theme.test.ts`
- Modify: `tests/minor-issues-regression.test.mjs`
- Modify: `tests/rag-chat-utils.test.ts`

- [ ] Add tests proving invalid theme values fall back to dark, system mode resolves from OS preference, recommendation summaries contain no per-book transcript, and cards contain no synthetic `90` fallback.
- [ ] Run the focused tests and confirm they fail for the missing theme module and current verbose summary.

### Task 2: Add Theme Runtime

**Files:**
- Create: `lib/theme.ts`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] Implement `ThemeMode`, storage parsing, resolution, DOM application, and a pre-hydration initialization script.
- [ ] Add light and dark CSS variables plus scoped compatibility overrides for the existing slate and fixed-color utilities.
- [ ] Run theme tests and typecheck.

### Task 3: Separate Settings Concerns

**Files:**
- Modify: `components/RAGChat/LLMSettingsDialog.tsx`
- Modify: `components/rag-chat.tsx`

- [ ] Rename the trigger and add `模型配置` / `外观` tabs.
- [ ] Add three appearance choices with immediate preview, save persistence, cancel restoration, and system preference listening.
- [ ] Refresh both drafts each time the dialog opens.
- [ ] Run regression tests and typecheck.

### Task 4: Compact Recommendation Presentation

**Files:**
- Modify: `lib/utils/recommendation-summary.ts`
- Modify: `components/RAGChat/MessageList.tsx`
- Modify: `components/RAGChat/BookCard.tsx`

- [ ] Replace the verbose API summary with one concise overview.
- [ ] Hide the successful assistant bubble when recommendation cards are present.
- [ ] Implement the approved three-column card with responsive fallback and conditional metadata.
- [ ] Show match percentage only for real scores.
- [ ] Run focused tests and typecheck.

### Task 5: Verify and Publish

**Files:**
- Modify only files required by verification findings.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Start the app and verify settings, themes, cards, and responsive behavior in the browser.
- [ ] Review `git diff`, commit the scoped changes, and push `main`.
- [ ] Track the GitHub/Vercel deployment until it reaches a terminal state and smoke-test the production URL.

