# Wayline upgrade — audit and plan (26 Oct 2026)

Baseline: commit `17bfea3`. React 19 + TS + Vite, Dexie (IndexedDB) v1 schema, FSRS-6, PWA, EN/BG interface, 4 content packs (Pre-A1 letters, A1 hello/numbers/people, 44 items), 60 unit + 77 Playwright tests.

## Audit

| Area | Verdict | Finding |
| --- | --- | --- |
| Brand, tokens, logo, type, light/dark, AA contrast tests | KEEP | Coherent; AA verified by test. |
| Local-first data (Dexie), backup/restore with Zod, in-page confirmations | KEEP | Works, tested; needs versioned migration for new tables. |
| FSRS scheduling + capped queue after breaks | KEEP | Tested. Extend to expressions and track New → Mastered states. |
| Lesson player (cloze/choice/build) with hint → retry → answer | KEEP / IMPROVE | Good feedback loop. Needs dialogue, listening, speaking, error-correction and nuance types. |
| Word Lens | KEEP / IMPROVE | Works in lessons. Needs related words and to feed a real vocabulary library. |
| Placement | REBUILD | "Can you read this?" only: everyone who can read starts at A1. Replace with an adaptive A1–C2 diagnostic. |
| Curriculum planner | IMPROVE | Deterministic and prerequisite-aware, but linear and band-only. Needs skill model, goals, weakness reinforcement. |
| Today screen | REBUILD as dashboard | Single card + route. Needs plan, XP, skills, revision, library shortcuts, weekly chart, insights. |
| Words page | REBUILD into Library | Flat list. Needs library home, states, search, expressions, grammar, alphabet, mistakes. |
| Mistakes | IMPROVE | Recorded in DB but not shown anywhere. Build Mistake Notebook. |
| Audio | IMPROVE | One TTS voice picker. Needs voice manager (verified male/female mapping, UK/US, slow/normal), dialogue speakers. |
| Speaking | ADD | None. Microphone, recording, playback, consented recognition, speaking exercises. |
| XP / levels / achievements | ADD | None. Idempotent ledger, separate from CEFR proficiency. |
| Content above A1 | ADD | Zero. Diagnostic bank A1–C2 plus representative lessons per band. |
| Onboarding reading check | REMOVE as placement | Keep only as the fast route for learners who cannot read English yet. |

## Technical risks

- **Data loss on upgrade** → Dexie `version(2)` adds tables only; existing rows untouched. A Playwright test seeds a v1 database and opens the new app.
- **Placement accuracy without calibration data** → Rasch/EAP with rule-based item difficulties; results shown as a range with uncertainty and an optional extended test. Not a certificate.
- **Voice gender metadata** → browsers don't expose gender. Use a curated list of known system voice names (Apple, Microsoft, Google, Android); unknown voices are offered as "Voice 1, 2…", never labelled with a gender.
- **Speech recognition privacy** → Chrome's default recognition is cloud-based. Use `processLocally` where available (Chrome 139+ desktop); otherwise ask for explicit consent before using cloud recognition. Record-and-compare works with no recognition at all.
- **Content quality at scale** → validator gates every pack; drafts marked for human review.

## Roadmap and acceptance criteria

1. **Diagnostic** — new learners who can read take an adaptive test (12–30 items) mixing grammar, vocabulary, reading, listening, functional language. Done when scripted test-takers at A1, B1 and C2 ability land within one band in ≥ 80% of simulated runs (unit test), results show overall band, range, per-skill estimates or "not enough evidence", and choosing a start level changes the route.
2. **Personalised plan** — curriculum starts at the placed band, weights goals and weak skills, schedules reinforcement for repeated mistakes. Done when two learners with different placement/goals get different daily plans (unit test) and every recommendation has a stated reason.
3. **Voices and dialogues** — voice manager with verified male/female voices, UK/US, normal/slow, repeat; dialogue lines spoken by consistent character voices. Done when dialogue playback assigns distinct voices (mocked synthesis test) and falls back cleanly with one or zero voices.
4. **Speaking** — microphone check, device choice, level meter, record/stop/retry/playback, recognition with consent; listen-and-repeat, read-aloud, answer-a-question, roleplay. Done when permission-granted, denied and unsupported paths pass with fake media streams in Chromium, and nothing claims recording when recording failed.
5. **XP and dashboard** — idempotent XP ledger, levels, achievements, dashboard sections A–I built from real data. Done when reloading or repeating a completion never double-awards XP (unit + e2e test).
6. **Library** — vocabulary states, expressions, grammar, alphabet, mistake notebook, reading/listening, universal search. Done when a word saved in a lesson appears in My Vocabulary, can be reviewed, and its state and next date update.
7. **Content** — representative lessons A2–C2; validator clean.
8. **Journeys** — the seven journeys in the brief pass in Playwright; artifact republished; GitHub/Vercel once the repo exists.

## Status (26 Oct 2026, evening)

| Roadmap step | State | Evidence |
| --- | --- | --- |
| 1 Diagnostic | Done | Rasch/EAP adaptive test, 108-item bank, results screen with range, skills and "not assessed". Simulation unit tests; Playwright journeys for beginner, B1, C2 (and C2 learners get C1/C2 lessons), resume, start lower. |
| 2 Personalised plan | Done | Learner model (skill accuracy, placement skills, goals, focus, mistake tags) drives a phased daily plan with stated reasons; reinforcement uses the learner's own mistaken items. Unit tests. |
| 3 Voices and dialogues | Done (device-dependent) | Voice manager with name-verified male/female voices only; unknown voices never get a gender. Character voices per dialogue speaker. |
| 4 Speaking | Done (device-dependent) | Record/stop/retry/playback, level meter, device choice, denied/unsupported paths, opt-in word check (on-device first, cloud only with consent). Playwright uses Chromium's fake audio device and a simulated recogniser — this proves the UI, not real hardware. |
| 5 XP and dashboard | Done | Idempotent XP ledger; dashboard A–I from real data; mobile order plan → revision → XP → skills → journey. Reload test shows no double XP. |
| 6 Library | Done | Search; My vocabulary (states, history, known, remove); 36 curated expressions with register, usage and related phrases; grammar by level with practice; alphabet with sounds and a check; mistake notebook; reading & listening; CEFR reference; practice any item from the library. |
| 7 Content | Done as drafts | 20 packs: Pre-A1–C2 lessons plus 6 speaking/listening/dialogue packs. All marked draft; need native-speaker review. |
| 8 Journeys | Passing locally | See Playwright results. GitHub/Vercel waiting for the repository. |

### Found and fixed during testing

- A profile missing an optional list field crashed the dashboard. The v2 migration now fills defaults; the upgrade journey seeds a real v1 IndexedDB.
- `SpeechRecognition.available()` crashes headless Chromium 156. The page no longer probes recognition until the learner ticks "Check my words" (off by default). **Verify on real desktop Chrome before release.**
- A missing interface string (`skill.pronunciation`) crashed the Pre-A1 dashboard; translation now falls back safely and logs.

### Remaining limitations

- Voices depend on what the device has installed; some devices offer only one voice.
- On-device recognition is Chrome desktop 139+ only. Elsewhere, recognition is cloud-based with consent, or off. Real-microphone validation has not been done in CI.
- Recognition checks words, not pronunciation; no fluency or accent score is given.
- Writing is not assessed. Speaking placement is not assessed.
- Content is a representative slice per band, not a full A1–C2 syllabus; all of it is draft.
- Headless WebKit on Linux has no recording APIs, so the denied-permission test is skipped there.
