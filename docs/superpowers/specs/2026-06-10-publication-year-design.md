# Publication Year Design

## Goal

Persist source publication years and enforce user recency requirements such as `近二年` during catalog retrieval.

## Data Model

Add a nullable `publication_year SMALLINT` column to `books`.

- Year-only precision matches the source data.
- Valid values are 1900 through 2100.
- Missing or malformed source values remain `NULL`.
- A partial B-tree index covers non-null years.

## Source Processing

The main and supplement Excel files expose a `出版时间` column. Normalize a four-digit year from Excel dates, year strings, and date strings. Main-file values win; supplement values only fill missing years.

Create a compact NDJSON export containing only:

```json
{"id":"9787533688035","publication_year":2019}
```

Use a dedicated Node backfill script to update only `books.publication_year` in batches.

## Requirement Flow

Add `publication_year_min` to requirement constraints and catalog filters.

At runtime in 2026:

- `近一年` means `publication_year >= 2026`
- `近二年` means `publication_year >= 2025`
- `近三年` means `publication_year >= 2024`

The formula is `current year - requested years + 1`.

The local fallback parser and LLM schema both produce the same constraint. Retrieval passes it to parameterized SQL. Rows with unknown publication years do not satisfy a recency filter.

## Migration Safety

1. Add the nullable column and check constraint without rewriting existing rows.
2. Backfill in batches of 5,000 using parameterized updates.
3. Verify row counts and year distribution.
4. Create the partial index concurrently after backfill.

No existing book fields are updated by the backfill process.

## Verification

- Unit-test source year normalization and merge precedence.
- Unit-test `近二年` conversion using an injected reference year.
- Regression-test SQL contains a parameterized publication-year predicate.
- Run the full test suite, typecheck, and production build.
- Verify production row coverage and an indexed recent-year query plan.
