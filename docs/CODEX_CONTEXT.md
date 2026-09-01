# Codex project context

Last updated: 2026-09-01 (Asia/Taipei)

## Product

PDF Translation is a browser-first Traditional Chinese document translation workspace. Users upload PDF or Markdown files, provide their own Google Gemini or OpenAI API key, translate the document, resume local history, and export Markdown, PDF, or EPUB.

The product direction is **professional, friendly, and simple**. The interface should feel calm and trustworthy rather than highly technical or visually dense.

## Repository and deployment

- GitHub: https://github.com/garrettwu2026/PDF-translation
- Production: https://pdf-translation-me70.onrender.com
- Render service: `srv-d76cepjuibrs73bik96g`
- Render dashboard: https://dashboard.render.com/web/srv-d76cepjuibrs73bik96g
- Branch: `main`
- Health check: `/api/health`
- Auto-deploy is enabled. GitHub connector ref updates might not emit the webhook, so verify that a deploy actually starts after every remote update.

## Architecture

- `src/App.tsx`: primary page layout and high-level workflow coordination
- `src/index.css`: Tailwind import, document rendering styles, and application visual system
- `src/pdf.worker.ts`: background PDF parsing and OCR preparation
- `src/components/`: reusable preview, notification, history, information, and API-key UI
- `src/lib/ai-providers.ts`: Gemini/OpenAI request adapters
- `src/lib/provider-usage.ts`: provider-specific cached/reasoning token normalization
- `src/lib/api-key-storage.ts`: session-first browser key persistence
- `src/lib/diagnostics.ts`: content-safe development-only diagnostic events
- `src/lib/translation-prompts.ts`: extraction, translation, and correction prompt builders
- `src/lib/db.ts`: browser IndexedDB translation history
- `src/lib/text.ts`: safe Markdown chunking and binary conversion utilities
- `src/lib/file-limits.ts`: shared PDF/Markdown upload and PDF page limits
- `src/lib/models.ts`: centralized provider model catalog, prices, and cost calculations
- `src/lib/document-analysis.ts`: one-request glossary, character, and style analysis
- `src/lib/document-memory.ts`: whole-document, chapter, and recent-summary memory plus stable term merging
- `src/lib/translation-quality.ts`: deterministic protected-content and Markdown integrity checks
- `src/lib/protected-content.ts`: reversible placeholders for code, URLs, email, math, link targets, and HTML
- `src/lib/sentence-segments.ts`: stable sentence IDs, omission localization, and targeted repair application
- `src/lib/translation-runner.ts`: per-chunk draft, correction, sentence repair, protected-content restore, and validation pipeline
- `src/lib/chapter-proofreading.ts`: bounded chapter-level consistency review schema and boundaries
- `src/lib/document-types.ts`: automatic and explicit document-type translation rules
- `src/lib/translation-state-machine.ts`: explicit translation lifecycle states
- `src/lib/structured-output.ts`: shared Gemini/OpenAI JSON Schema request configuration
- `src/lib/translation-budget.ts`: token usage accounting, cost ceilings, and retry bounds
- `src/hooks/useTranslationUsage.ts`: translation-run usage state
- `src/lib/browser-exports.ts`: Markdown, EPUB, and safe print export helpers
- `src/lib/pdf-text-extraction.ts`: converter-mode PDF text extraction
- `src/components/MarkdownPreview.tsx`: lazily loaded Markdown renderer
- `src/components/ModelSelectionPanel.tsx`: model selector, price card, and run limits
- `src/components/ModelCatalogNotice.tsx`: official pricing links and scheduled review warning
- `src/components/TranslationCostSummary.tsx`: estimated and provider-reported actual cost UI
- `server.ts`: Express/Vite server and health endpoint
- `server/epub.ts`: EPUB request validation, sanitization, and generation
- `server/rate-limit.ts`: bounded fixed-window request limiter with stale-client pruning
- `tests/`: Node test suite

Uploaded documents, API keys, and translation history stay in the browser. Translation requests go from the browser to the selected AI provider. The server only receives completed content when generating EPUB output.

## Supported AI models and displayed standard prices

Prices are USD per one million tokens and were verified on 2026-09-01. The UI schedules a routine recheck every 45 days and raises an earlier warning before known promotional pricing reviews.

| Provider | Model | Input | Cached input | Output |
| --- | --- | ---: | ---: | ---: |
| Google | Gemini 3.7 Flash | $0.75 | $0.075 | $3.75 |
| Google | Gemini 3.5 Flash-Lite | $0.30 | $0.03 | $2.50 |
| Google | Gemini 3.1 Pro Preview | $2.00 | $0.20 | $12.00 |
| OpenAI | GPT-5.6 Luna | $0.20 | $0.02 | $1.20 |
| OpenAI | GPT-5.6 Terra | $2.00 | $0.20 | $12.00 |
| OpenAI | GPT-5.6 Sol | $4.00 | $0.40 | $20.00 |

The default is `gemini-3.7-flash`. Historical records that reference removed models fall back to the default model.

Official references:

- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/pricing
- https://developers.openai.com/api/docs/models/compare
- https://developers.openai.com/api/docs/models/gpt-5.6-sol

## Commands

```bash
npm ci
npm run dev
npm run check
npm run test:e2e
npm run test:quality
npm start
```

`npm run check` performs TypeScript validation, unit tests, and a production build.

## Important constraints

- Do not add server-side provider keys; this is intentionally bring-your-own-key.
- OpenAI models operate on extracted text and do not directly process scanned PDF input in the current workflow.
- Preserve IndexedDB history compatibility.
- API keys default to `sessionStorage`; persistent `localStorage` is only used when the user explicitly enables “remember on this device”. The stored value is encoded, not encrypted.
- PDF worker messages are request-scoped and use acknowledgement backpressure. Preserve cancellation and stale-response guards when changing extraction or token counting.
- Translation requests receive an `AbortSignal`; keep provider calls, retry delays, and worker cancellation connected to the same stop action.
- The default run budget is USD 5 and the retry ceiling is user-adjustable from 1–6. A budget stop must preserve resumable history.
- Browser history is automatically retained to the newest 25 records within an approximate 12-million-character capacity.
- Keep model IDs, provider mapping, and displayed prices centralized in `src/lib/models.ts`; do not duplicate the catalog in UI components.
- Respect model capability flags in `src/lib/models.ts`. GPT-5.6 currently requires the provider-default temperature, so OpenAI requests must omit custom `temperature` values.
- Actual cost must use normalized provider usage: cached input is discounted; Gemini thinking tokens are added to billable output; OpenAI completion tokens already include reasoning and must not be added twice.
- Initial document analysis intentionally combines glossary, character map, and style guide into one structured AI request to avoid paying for repeated source input.
- Document analysis samples across the whole file within a 50,000-character budget instead of reading only the beginning.
- Translation chunks use a provider-independent 1,800-token estimate and preserve Markdown blocks; fenced code is indivisible.
- Analysis and correction requests use strict JSON Schema Structured Outputs for both Gemini and OpenAI.
- Translation source is tagged with stable sentence IDs; missing IDs trigger targeted sentence repair before a full chunk retry.
- Code blocks, inline code, link targets, URLs, email addresses, math, and HTML tags are replaced by reversible placeholders during model calls.
- Users can choose automatic, novel, technical, academic, business/legal, or general translation rules.
- Optional chapter consistency proofreading runs at headings, the document end, or after six chunks, and keeps the chunk-level result if review validation fails.
- A corrected chunk must pass deterministic checks for headings, URLs, link targets, code, footnotes, fences, and severe truncation before it is accepted. Numbers are reported as non-blocking warnings.
- Layered translation memory separates a global summary, up to 24 chapter summaries, the latest six developments, and the immediate prior source/translation context.
- Upload limits are 50 MB for PDF, 12 MB for Markdown, and 3,600 pages per PDF. Keep UI, worker, and conversion validation aligned through `src/lib/file-limits.ts`.
- Do not weaken EPUB sanitization or server request limits.
- Avoid exposing raw API errors, secrets, or uploaded content in logs.
- Client diagnostics must use `src/lib/diagnostics.ts`. Never log source text, translated text, prompts, provider bodies, or API keys.
- Keep experiments outside the tracked source tree. Root `test-*` scripts and generated EPUB fixtures were removed; durable tests belong in `tests/`.
- Keep desktop and mobile layouts usable.

## Current UI direction

The 2026-08-31 redesign, refined on 2026-09-01, changes the previous dark, information-heavy interface into a bright but more colorful document workspace:

- soft blue/violet/teal/coral ambient gradients instead of a nearly white canvas
- color-coded cards: violet for models, teal for uploads, warm coral for preferences, and blue/teal for actions
- compact header and segmented mode switch
- one grouped model selector instead of six large radio cards
- clear selected-model price summary
- collapsible optional EPUB settings
- left control rail and sticky right preview on desktop
- stacked responsive layout on smaller screens

The functional workflow remains unchanged.
