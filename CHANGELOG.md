# Changelog

All notable changes to Wayline. Dates are in YYYY-MM-DD.

## 0.2.0 — 2026-10-27

### Added
- Adaptive A1–C2 level test (Rasch/EAP, 108-item bank) with a results screen: level, range, confidence, per-skill estimates, weak topics, and an optional extended test.
- Onboarding with goals, focus skills, interests, daily time and self-rating; learners who can't read English yet start at Pre-A1.
- Learner model and a phased daily plan (warm-up, learn, practise, reinforce, apply) with stated reasons.
- Voice manager with verified male/female voices, UK/US accents, slow/normal speed, and per-character dialogue voices.
- Speaking exercises (repeat, read aloud, answer), listening comprehension, branching dialogues, and correct-the-mistake items.
- Microphone recording with level meter, device choice, playback, and denied/unsupported handling; opt-in word check using on-device recognition where available and cloud recognition only with consent.
- XP ledger, levels and achievements, kept separate from CEFR level.
- Dashboard with plan, revision, XP, skills, journey, weekly chart, insights and library shortcuts.
- Library: search, My vocabulary (states, history, "I already know this"), curated expressions, grammar, interactive alphabet, mistake notebook, reading and listening, CEFR reference, and practice of any item.
- Content: A2–C2 lessons (two per band) and a speaking/listening/dialogue lesson per band. All draft.
- Database v2 migration (placements, XP, achievements) that preserves all v1 data; backups accept v1 and v2.

### Changed
- "Words" became the Library; "Today" became the dashboard.
- Planner starts at the accepted level instead of A1 and skips prerequisites below it.

### Fixed
- Older profiles missing optional list fields no longer crash the dashboard.
- The speech-recognition capability check runs only after the learner opts in (the check crashes headless Chromium 156).

## 0.1.0 — 2026-10-25

- Foundation: React + TypeScript + Vite PWA, Dexie storage, FSRS-6 reviews, English/Bulgarian interface, light/dark themes with tested contrast.
- Onboarding with a reading check, A1 lessons, Word Lens, review sessions, backup and restore.
