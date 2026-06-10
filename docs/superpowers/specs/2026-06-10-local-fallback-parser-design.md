# Local Fallback Parser Design

## Goal

When the configured LLM is unavailable, turn natural Chinese bookstore requests into useful structured requirements instead of treating long clauses as keywords.

## Parsing Order

1. Extract repeated negative clauses introduced by `不要`, `排除`, `不含`, `去掉`, or `剔除`.
2. Normalize particles and book suffixes so phrases such as `大学的` and `儿童书` become `大学` and `儿童`.
3. Remove negative clauses from the positive query before category and keyword extraction.
4. Extract known domain phrases such as `中学`, `小学`, and `课外读物`.
5. Recognize recency wording such as `近二年` as preference `近2年出版`.
6. Use generic keyword extraction only for remaining positive text.

## Data Boundary

The `books` table has no publication date or publication year column. Recency is therefore preserved as a structured preference but is not enforced as a database filter. The parser must not claim that recent-year filtering occurred.

## Expected Example

Input:

`做一个中学小学课外读物图书目录要近二年的，不要大学的，不要中专的不要儿童书`

Expected fallback intent:

- positive keywords include `中学`, `小学`, `课外读物`
- exclusions are `大学`, `中专`, `儿童`
- inferred library type is `初高中`
- preferences include `近2年出版`
- no keyword contains `不要`

## Verification

Add focused regression tests for repeated exclusions, positive domain terms, recency preference, and negative-term removal. Run the full unit suite, TypeScript check, and production build.
