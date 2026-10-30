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
- `src/lib/` — FSRS (`srs.ts`), speech (`speech.ts`), natural voice clips (`clips.ts`), microphone (`mic.ts`), recognition (`recognition.ts`).
- `public/voice/` — natural voice clips (Kokoro-82M, Apache-2.0), bundled per lesson pack, one manifest per voice. Generated; don't edit.
- `src/pages/` — screens. `Today.tsx` is the dashboard; `library/Library.tsx` holds all library pages; `session/` has lesson and practice players.
- `src/i18n/strings.ts` — every interface string, English and Bulgarian.
- `e2e/helpers.ts` — onboarding, level test and exercise-answering helpers for Playwright.

## Exam preparation (B2 First, C1 Advanced)

- Official structure, timings, marks, grade boundaries and the practice-test conversion table live in `src/content/exams/spec.ts`, with sources. Change them only from Cambridge's own documents.
- Tasks are original JSON in `src/content/exams/packs/` (schema `src/content/exams/schema.ts`, closed tag list `tags.ts`). Check a pack with `node scripts/check-exam-pack.mjs <file>`; `npx vitest run src/content/exams` also checks that each mock set is complete and that multiple-choice keys aren't predictable by length or position.
- Engine: `src/engine/exam/` — `scoring.ts` (incl. two-mark key word transformations), `record.ts` (attempts, evidence rows, XP once per attempt), `readiness.ts` (scale estimates with ranges), `plan.ts` (weakness → lesson → fresh task; five-phase roadmap; diagnostic), `writing.ts` (rule-based indicators only — learners confirm marks).
- Every score shown is an estimate. Never present it as an official result; never present writing/speaking indicators as examiner marks.
- Adding another exam: add its spec to `EXAMS`, its id to `ExamId`/`CertExam`, and packs.

## Natural voices

Every English line the app speaks is pre-rendered, so learners hear the same natural voices on any device. After changing lesson text, expressions, alphabet or anything passed to `speak()`:

1. `node scripts/voice-lines.mjs` — lists every spoken line and its voice (`voice/lines.json`).
2. `python3 scripts/render-voices.py --model DIR` — renders missing clips into `voice-cache/` (resumable; needs `pip install kokoro-onnx soundfile` and `kokoro-v1.0.onnx` + `voices-v1.0.bin` from github.com/thewh1teagle/kokoro-onnx releases, tag model-files-v1.0).
3. `node scripts/pack-voices.mjs` — writes `public/voice/`.

Lines without a clip fall back to device speech automatically. Dialogue casting must stay identical in `castNatural` callers and the build script.

## Rules that must not break

1. **Never lose learner data.** Schema changes = new `this.version(n)` that only adds. Add a migration unit test and keep `e2e/upgrade.spec.ts` passing.
2. **XP is not proficiency.** Award XP only through `award()` with a unique idempotency id. CEFR level comes from placement and mastery only.
3. **No fake data.** Dashboard numbers and insights must come from stored activity.
4. **Speech honesty.** Gender labels only for natural voices (from the model's own voice list) or device voices on the verified list in `speech.ts`. Recognition is opt-in; cloud recognition needs `profile.recognitionConsent`. Never describe recognised words as a pronunciation score. Don't call `SpeechRecognition.available()` before the learner opts in (it crashes headless Chromium).
5. **Strings in both languages.** Add every new key to `en` and `bg` in `strings.ts`.
6. **Accessibility.** Keyboard reachable, visible focus, ≥44 px targets, tokens from `src/styles/tokens.css` (contrast is unit-tested).
7. **Deploy headers** in `vercel.json` must keep `microphone=(self)` and `media-src … blob:` (tested in `src/deploy.test.ts`).

## Commits

Small, tested increments. Run `npm run check` (and the relevant Playwright specs) before committing.
