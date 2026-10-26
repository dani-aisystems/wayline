# Wayline

A free, local-first English course from Pre-A1 to C2. Learners pick the language they learn from (English or Bulgarian for now), get placed, and follow a personal route across a map of competences. Everything runs in the browser: no accounts, no paid APIs, progress stored on the device.

Status: **Milestone 1 (foundation)**. Strategy and milestones: see the Phase 1 strategy doc.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run check` | Typecheck, lint, unit tests, production build |
| `npm test` | Unit tests: spaced repetition, backup/restore, content validation, colour contrast |
| `npm run test:content` | Validate every content pack in `src/content/packs` |
| `npm run test:e2e` | Playwright on Chromium, Firefox, WebKit, Pixel 7, iPhone 15 (builds must exist: `npm run build`) |
| `npm run brand` | Regenerate logo, icons and favicon from `src/components/Logo.tsx` |

Run e2e against a deployed site with `BASE_URL=https://… npm run test:e2e`.

## Structure

```
src/
  components/   Logo, chart illustration
  content/      Zod content schema, validator, content packs (JSON)
  db/           Dexie (IndexedDB) schema, backup export/import
  i18n/         Interface strings (en, bg)
  lib/          Spaced repetition (FSRS-6 via ts-fsrs)
  pages/        Screens
  state/        Profile context (explanation language, theme)
  styles/       Design tokens (light/dark), global CSS, contrast test
e2e/            Playwright tests
scripts/        Brand asset generator
public/brand/   Generated logo, icons
```

## Content

Each pack is a JSON file validated against `src/content/schema.ts`. Exercises and texts are English. Explanations, hints, objectives and titles are `{ "en": "…", "bg": "…" }`; English is required, other languages fall back to English. The validator fails the build on schema errors, duplicate ids or prompts, unknown competences, prerequisite cycles and out-of-range answers, and warns on missing translations or unreviewed items.

Adding a language: add it to `SUPPORTED_LANGUAGES` and `DICTIONARIES` in `src/i18n/strings.ts`, then add that key to content packs.

## Data and privacy

- Progress lives in IndexedDB in the learner's browser. Backups are versioned JSON, validated with Zod on import and never rendered as HTML.
- Safari may delete site data after 7 days without a visit unless the app is installed to the home screen. The app reminds learners to back up.
- No analytics, no third-party requests (checked by an e2e test).

## Deployment

Static build (`dist/`) on Vercel. Vercel's Hobby plan is non-commercial only; move to Vercel Pro or Cloudflare Pages before any monetization.

## Licences

Source code: proprietary, all rights reserved (see `LICENSE`). Third-party fonts and data: see `ATTRIBUTIONS.md`.
