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

## 2026-09-01 — GPT-5.6 temperature compatibility hotfix

- Added a model capability flag for custom-temperature support.
- Omitted unsupported `temperature` values from GPT-5.6 analysis and streaming translation requests.
- Preserved the existing low-temperature configuration for Gemini models.
- Added regression tests for both provider families.
- Validation: strict TypeScript, all 33 unit tests, and production build passed.

## 2026-09-01 — Translation-quality foundation

- Added a provider-neutral translation-quality fixture set, rubric, and `npm run test:quality` release gate.
- Added deterministic completeness checks for severe truncation, Markdown headings/fences, URLs, link targets, inline code, footnotes, and numbers.
- Added strict JSON Schema Structured Outputs shared by Gemini and OpenAI document analysis and correction requests.
- Replaced 3,500-character chunks with Markdown-aware, estimated-token chunks while keeping fenced code blocks intact.
- Changed initial analysis from the first 50,000 characters to evenly distributed whole-document samples within the same budget.
- Added layered global, chapter, recent, and immediate-context memory, with stable de-duplication of terminology and character entries.
- Validation: strict TypeScript, all 47 unit tests, the five-case dedicated quality gate, and production build passed.

## 2026-09-01 — Protected content and staged quality pipeline

- Added reversible placeholders for fenced/inline code, Markdown link targets, URLs, email addresses, math, and HTML tags.
- Added stable sentence IDs, deterministic missing-ID localization, strict structured repair output, and exact reinsertion before final validation.
- Added automatic and explicit document modes for novels, technical content, academic writing, business/legal documents, and general text.
- Added optional chapter consistency proofreading at headings, document completion, or a bounded six-chunk interval.
- Added an explicit extracting/analyzing/translating/correcting/repairing/chapter-review/saving lifecycle state machine.
- Extracted per-chunk translation orchestration into `src/lib/translation-runner.ts`; `src/App.tsx` is approximately 1,645 lines after adding the new capabilities.
- Added protected-content, sentence-repair, document-mode, chapter-review, runner, and state-machine coverage, bringing the suite to 56 tests.

## 2026-09-01 — Livelier workspace color refinement

- Replaced the nearly white page canvas with soft blue, violet, teal, and coral ambient gradients.
- Added distinct low-saturation card colors and accent rails for model selection, upload, preferences, conversion, and primary actions.
- Refined the brand mark, introductory banner, mode switch, selected-model card, result toolbar, and preview panel.
- Preserved responsive behavior, print/PDF colors, layout, controls, and workflow behavior.
- Verified the desktop and mobile presentation in the in-app browser with no console errors.
