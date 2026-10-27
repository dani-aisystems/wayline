# Contributing

Wayline is a personal project, and its source code is proprietary (see [LICENSE](LICENSE)). Issue reports are welcome, especially about content. Code contributions only by prior arrangement with the owner.

## Reporting a content error

Content quality matters more than anything else here. If an answer key is wrong, more than one answer should be accepted, an explanation is misleading, or the Bulgarian reads badly, open an issue using the **Content error** template. Include the exercise id: it appears in the page as `data-item-id`, or ask in the issue and we'll find it.

## Working on the code

```bash
npm install
npm run dev
npm run check        # typecheck, lint, unit tests, build — must pass
npm run build && npm run test:e2e
```

Guidelines:

- **Never lose learner data.** A schema change needs a new Dexie `version(n)` that only adds data, plus a migration test that opens a database from the previous version.
- **No paid APIs and no network calls at runtime.** The app must work offline after the first load.
- **No invented progress.** Dashboard numbers, insights and recommendations come from stored learner activity, never from placeholders or randomness.
- **Be honest about speech.** Never label a voice male or female unless its name is on the verified list; never present recognised words as a pronunciation score; never use cloud recognition without consent.
- **Interface text** goes in `src/i18n/strings.ts` in both English and Bulgarian. Bulgarian should be gender-neutral where possible.
- **Accessibility:** keyboard reachable, visible focus, 44 px touch targets, WCAG 2.2 AA contrast (tested), reduced motion respected.

## Writing content

Packs live in `src/content/packs/*.json` and are validated by `npm run test:content`.

- One competence per pack, with prerequisites by id.
- Each item needs an objective, a difficulty inside its band, an explanation, and every acceptable answer in `accept`.
- Avoid items with more than one defensible answer unless every one is accepted.
- Mark items `"review": { "author": "…", "status": "draft" }` until a qualified reviewer approves them.
- Glossary words must be unique by word + part of speech across all packs.
