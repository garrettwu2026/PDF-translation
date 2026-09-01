# Codex worklog

All dates use Asia/Taipei unless noted otherwise.

## 2026-08-31 — Pipeline hardening and optimization

- Removed unused and unsafe dependencies and stopped bundling provider keys.
- Improved Markdown chunking so content is not silently dropped.
- Reduced large-PDF memory overhead and moved parsing work to the PDF worker.
- Hardened EPUB validation, sanitization, filenames, request limits, and server behavior.
- Improved IndexedDB connection and transaction handling.
- Added strict TypeScript coverage and seven unit tests.
- Added `/api/health` and Render production guidance.
- Validation: TypeScript, 7 tests, and production build passed.
- Remote commit: `f90b4ec6ca01282983a794148c82975cc777022e`.

## 2026-08-31 — Gemini and GPT-5.6 model refresh

- Added Gemini 3.7 Flash, Gemini 3.5 Flash-Lite, and Gemini 3.1 Pro Preview.
- Added GPT-5.6 Luna, Terra, and Sol.
- Updated displayed standard token prices and promotional notes.
- Added selected-model badges and cached-input prices.
- Added fallback for historical records using removed model IDs.
- Validation: TypeScript, 7 tests, production build, Render health endpoint, and production page returned successfully.
- Remote commit: `65093cf7b9c430d1a107e74ecd13df4ae65c55da`.

## 2026-08-31 — Professional friendly UI redesign

- Replaced the dark visual system with a light, calm workspace theme.
- Rebuilt the header, introductory hierarchy, segmented mode switch, cards, form controls, buttons, and result panel styling.
- Replaced six large model radio cards with one grouped selector and selected-model price card.
- Collapsed optional EPUB settings while preserving all form controls.
- Improved responsive behavior and made the preview sticky on desktop.
- Kept translation, conversion, API key, history, pricing calculations, progress, and download logic unchanged.
- Added portable Codex project memory through `AGENTS.md` and `docs/CODEX_*.md`.
- Validation: strict TypeScript, all 7 unit tests, and the production build passed.
- Browser visual testing was unavailable during the session because the local Codex browser-control quota was exhausted.

## 2026-08-31 — Priority reliability and security improvements

- Removed HTML interpolation from PDF print export and added production CSP, COOP, HSTS, and related security headers.
- Added request-scoped PDF worker messages, cancellation, stale-response guards, and per-chunk acknowledgement backpressure to prevent unbounded provider requests.
- Made tab-session API key storage the default and retained persistent storage only behind an explicit remember-on-device setting.
- Extended history records with character-map and plot-summary context so interrupted translations resume accurately.
- Added stop-and-resume behavior that preserves translated chunks and cancels active extraction work.
- Enforced shared upload limits: 50 MB PDF, 12 MB Markdown, and 3,600 PDF pages.
- Added file-limit unit coverage, increasing the test suite from 7 to 10 tests.
- Validation: strict TypeScript, all 10 unit tests, and production build passed.

## 2026-08-31 — Maintenance and cost optimization

- Replaced two overlapping document-analysis calls with one JSON-mode request covering terminology, characters, and translation style.
- Removed up to approximately 30,000 characters of repeated analysis input per new document while preserving all three analysis outputs.
- Extracted the model catalog and cost math from the main UI into `src/lib/models.ts`.
- Extracted and lazily loaded Markdown rendering, reducing the initial main bundle from 135.58 KB to 87.39 KB gzip.
- Extracted the EPUB rate limiter and added expired-client pruning plus reset headers.
- Added analysis, model-cost, and rate-limit tests, bringing the suite to 17 tests.
- Validation: strict TypeScript, all 17 unit tests, and production build passed.

## 2026-08-31 — Repository cleanup and main-program decomposition

- Removed 30 obsolete root and `src/test-*` experiments, including six generated EPUB fixtures; all remain recoverable from Git history.
- Added `.gitignore` rules for root test EPUB artifacts and removed obsolete TypeScript exclusion patterns.
- Replaced document-bearing console output with development-only, content-safe diagnostic event codes.
- Updated the React error boundary and PDF worker so they do not print raw error objects in the client.
- Extracted Gemini/OpenAI adapters, session-first API-key storage, full extraction/translation/correction prompts, toast UI, history dialogs, information modal, and API-key modal.
- Reduced `src/App.tsx` from 2,369 to 1,917 lines while retaining the complete prompt rules.
- Added API-key storage and prompt-builder tests, increasing the suite from 17 to 21 tests.
- Validation: strict TypeScript, all 21 unit tests, and production build passed.

## 2026-09-01 — High-priority reliability and browser E2E

- Added real provider-request abort propagation for Gemini and OpenAI, cancellable retry waits, and cancellable token counting.
- Added a USD translation-run ceiling, configurable retry limit, live usage enforcement, and resumable budget stops.
- Added bounded IndexedDB history retention: newest 25 records within an approximate 12-million-character capacity.
- Extracted translation usage state, budget rules, export helpers, and converter PDF extraction from `App.tsx`.
- Added Playwright E2E coverage for limits, API-key/history dialogs, mode switching, Markdown upload, and preview rendering.
- Added a dedicated GitHub Actions browser-E2E workflow.
- Validation: strict TypeScript, all 26 unit tests, production build, E2E test discovery, and local interactive browser smoke test passed.

## 2026-09-01 — Precise provider costs and pricing reminders

- Normalized Gemini and OpenAI usage metadata into cached input, cache-write, billed output, and reasoning token totals.
- Counted Gemini thinking tokens as billable output while avoiding double-counting OpenAI reasoning tokens already included in completion totals.
- Applied cached-input discounts to actual run costs and prevented cumulative Gemini stream metadata from being counted repeatedly.
- Added official pricing links, a 45-day catalog review schedule, and advance reminders for promotional price reviews.
- Extracted model selection, catalog notice, and cost summary UI from `App.tsx`, reducing it from 1,850 to 1,744 lines.
- Added provider-usage and pricing-reminder coverage, increasing the suite from 26 to 32 tests.
- Validation: strict TypeScript, all 32 unit tests, and production build passed.
