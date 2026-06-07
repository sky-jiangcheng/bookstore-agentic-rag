# Query Preparation And Templates Design

## Goal

Replace the oversized decorative empty state with a compact three-column recommendation workspace. Users prepare and confirm structured query conditions before catalog retrieval, can understand whether LLM parsing or a saved template was used, and can reuse exact-match templates to skip repeated LLM parsing.

## Layout

- Left: compact session history and saved requirement templates.
- Center: current request, active strategy, editable pseudo SQL preview, confirmation state, and query actions.
- Right: suggested exclusion collisions, manual exclusion entry, target count, and ranking weights.
- Remove ambient glows, oversized icons, glass blur, excessive pills, and decorative title space.

## Query Flow

1. The user enters a requirement and selects Prepare.
2. The client normalizes the text and checks saved templates for an exact match.
3. On a template hit, the saved structured requirement and tuning values load without calling the LLM.
4. Otherwise, a parse-only API calls the requirement agent and returns a structured requirement plus exclusion suggestions.
5. Right-side changes remain a draft. The center pseudo SQL updates immediately.
6. Confirming copies the draft into the active query conditions.
7. Query is enabled only after confirmation and sends the confirmed structured requirement to the RAG endpoint.
8. The center shows which strategy was used and offers an explicit AI reparse action.

## Exclusion Semantics

- No default exclusions appear before a requirement is parsed.
- Suggested exclusions come from explicit parsed exclusions and keyword collisions with the database exclusion vocabulary.
- Users may add and remove custom exclusions.
- Suggested and manual exclusions are drafts until confirmed.

## Templates

- Session context menus include Save as requirement template.
- Users can edit the template name before saving.
- Templates store normalized source text, structured requirement, exclusions, target count, and ranking weights. They do not store recommendation results.
- Normalized exact text matches skip LLM parsing. Users can manually select a template or force AI reparsing.
- The strategy banner shows template name, match type, update time, and whether LLM parsing was skipped.

## Persistence

Sessions and templates are stored in browser local storage for this release. The data is user-local and does not require a database migration.

## Verification

- Unit tests cover normalization, exact template matching, pseudo SQL generation, and collision suggestions.
- Type checking, unit tests, production build, browser verification, and a production smoke check are required before completion.
