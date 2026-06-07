# Compact Recommendation Cards and Theme Settings Design

## Goal

Remove the duplicated recommendation transcript, make recommendation cards denser without losing hierarchy, and add light/dark/system appearance controls to the existing settings dialog.

## Recommendation Results

- Successful recommendation messages do not render the assistant text bubble because the result overview already shows count and price.
- Errors, progress, clarification, and assistant messages without recommendations continue to render normally.
- The API summary becomes a concise result sentence and no longer repeats every title and explanation.
- Cards use the approved three-column layout:
  - small synthetic cover
  - title, author, publisher/category, and a two-line explanation
  - price and real match score
- Missing metadata is omitted without leaving separators or blank rows.
- A match percentage is shown only when `match_score` exists. No synthetic percentage is allowed.
- On narrow screens, price and match state move into the content area so the card remains readable.

## Settings Structure

- Rename the trigger from `LLM 设置` to `设置`.
- Split the dialog into `模型配置` and `外观` tabs.
- Model settings retain the existing provider, model, API key, base URL, and connection-test behavior.
- Appearance offers `明亮`, `暗色`, and `跟随系统`.
- Theme choices preview immediately while the dialog is open.
- Saving persists both model and theme drafts.
- Closing without saving restores the previously saved theme.
- Opening the dialog always refreshes drafts from saved values.

## Theme Architecture

- A focused client-side theme module owns storage, system preference resolution, DOM application, and system-change subscription.
- The selected mode is stored in `localStorage`; the resolved theme is represented by one class on `<html>`.
- A small pre-hydration script applies the saved or system theme before first paint.
- Theme colors are centralized in CSS variables and light-mode overrides cover existing shared utility colors so the complete workspace changes coherently.
- The default remains dark when no preference exists.

## Verification

- Unit tests cover theme parsing/resolution and concise summaries.
- Regression tests verify there is no synthetic 90% score and that the settings UI exposes separated model/appearance tabs.
- Typecheck and production build must pass.
- Browser checks cover dark, light, system selection, cancel restoration, settings persistence, compact cards, and responsive layout.

