# Security

Wayline has no server, accounts or database of its own: all learner data stays in the learner's browser. The main risks are in the client: backup import, content rendering, and the deployment's security headers.

## Reporting a vulnerability

Please don't open a public issue. Email **daniel.aisystems@gmail.com** with a description, steps to reproduce and the affected URL or commit. You'll get a reply within 7 days.

## What's in place

- Backup files are validated with Zod and size limits before anything is written; restore replaces data in a single transaction, so a bad file changes nothing.
- Content is rendered as text, never as HTML.
- `vercel.json` sets a strict Content-Security-Policy (`default-src 'self'`), `X-Content-Type-Options`, `Referrer-Policy` and a `Permissions-Policy` that allows the microphone only for the app itself.
- Microphone access is requested only after a user action; recordings are in-memory blob URLs revoked when the exercise closes.
