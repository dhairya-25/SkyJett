# Changelog

All notable changes to the SkyJet Flight Recovery MVP are recorded here.

## 2026-07-03

- Added `docs/user-journey.md` — a customer-perspective walkthrough of the full app: entry (proactive alert / QR deep-link / PNR lookup), flight-details screen, the rebook / refund / wait fork with per-choice features, agent handoff, and the grounded assistant. Documents the KISS + mobile-first + boarding-pass design principles and the mobile/desktop view toggle.
- Added `docs/user-journey.docx` — a styled Word version of the customer journey (title page, table of contents, headings, tables, callouts, page footer) for sharing/printing.
- Added root `.gitignore` — ignores `node_modules/` at any depth, Next.js/build output, env files, logs, and OS/editor junk across the whole repo (the app keeps its own `skyjet-recovery/.gitignore`).
