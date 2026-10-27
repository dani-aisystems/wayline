# Wayline — notes for Claude

Free, local-first English course (Pre-A1 → C2). React 19 + TypeScript (strict) + Vite 8 PWA. All learner data in IndexedDB via Dexie. No backend, no paid APIs, no runtime network calls.

## Commands

- `npm run dev` — dev server on :5173
- `npm run check` — typecheck + lint + unit tests + build. Run before every commit.
- `npm run build && npm run test:e2e` — Playwright (5 browser projects). Use `--project=chromium` while iterating.
- `npm run test:content` — validate lesson packs after editing JSON.
- `npm run build:artifact` — single-file build for a Claude artifact.

## Where things are

- `src/engine/` — the learning logic: `placement.ts` (adaptive test), `progress.ts` (`planSession`, `recordItem`), `learner.ts` (skill model), `xp.ts` (ledger), `dashboard.ts`, `check.ts` (answer checking).
- `src/db/db.ts` — Dexie schema and migrations. `src/db/backup.ts` — export/import (Zod).
- `src/content/packs/*.json` — lessons; schema in `src/content/schema.ts`, validator in `validate.ts`. `expressions.ts`, `alphabet.ts`, `cefr.ts` — library reference data.
- `src/lib/` — FSRS (`srs.ts`), speech synthesis (`speech.ts`), microphone (`mic.ts`), recognition (`recognition.ts`).
- `src/pages/` — screens. `Today.tsx` is the dashboard; `library/Library.tsx` holds all library pages; `session/` has lesson and practice players.
- `src/i18n/strings.ts` — every interface string, English and Bulgarian.
- `e2e/helpers.ts` — onboarding, level test and exercise-answering helpers for Playwright.

## Rules that must not break

1. **Never lose learner data.** Schema changes = new `this.version(n)` that only adds. Add a migration unit test and keep `e2e/upgrade.spec.ts` passing.
2. **XP is not proficiency.** Award XP only through `award()` with a unique idempotency id. CEFR level comes from placement and mastery only.
3. **No fake data.** Dashboard numbers and insights must come from stored activity.
4. **Speech honesty.** Gender labels only for voices on the verified list in `speech.ts`. Recognition is opt-in; cloud recognition needs `profile.recognitionConsent`. Never describe recognised words as a pronunciation score. Don't call `SpeechRecognition.available()` before the learner opts in (it crashes headless Chromium).
5. **Strings in both languages.** Add every new key to `en` and `bg` in `strings.ts`.
6. **Accessibility.** Keyboard reachable, visible focus, ≥44 px targets, tokens from `src/styles/tokens.css` (contrast is unit-tested).
7. **Deploy headers** in `vercel.json` must keep `microphone=(self)` and `media-src … blob:` (tested in `src/deploy.test.ts`).

## Commits

Small, tested increments. Run `npm run check` (and the relevant Playwright specs) before committing.
