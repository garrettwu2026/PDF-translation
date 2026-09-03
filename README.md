# PDF Translation

A Traditional Chinese document translation web app for PDF and Markdown files. It supports Google Gemini and OpenAI models, background PDF parsing, resumable local history, and Markdown/PDF/EPUB export.

## Highlights

- Browser-side PDF text extraction with OCR fallback for scanned pages
- Translation pipeline with glossary, character, style, and continuity analysis
- Token-aware Markdown chunking with layered whole-book, chapter, and recent context
- Structured model outputs plus deterministic checks for omissions and damaged Markdown
- Protected placeholders for code, links, URLs, email, math, and HTML plus sentence-level omission repair
- Automatic or explicit novel, technical, academic, business/legal, and general document modes
- Optional bounded chapter-level consistency proofreading across translated chunks
- Provider-neutral translation-quality regression baseline
- Document-level provider-reported cost accounting that survives pause/resume, with a pre-request safety reserve
- Long-novel continuity memory for canonical character names, aliases, facts, chapters, and recent timeline events
- Model-price verification dates and upcoming review reminders linked to official pricing
- Progress saved in IndexedDB so long translations can be resumed
- API keys stay in the user's browser and are sent directly to the selected AI provider
- EPUB input validation, HTML sanitization, request limits, and production security headers
- No AI key is embedded in the Vite bundle or stored on the application server

## Local development

Requirements: Node.js 22.6 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`, choose **設定 API Key**, and enter the key for the provider you want to use. Environment-based AI keys are intentionally unsupported because this is a bring-your-own-key application.

Useful commands:

```bash
npm run lint
npm test
npm run test:quality
npm run build
npm run check
```

## Render deployment

Create a Node web service with these settings:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`
- Environment variable: `NODE_ENV=production`

Render supplies `PORT` automatically. Do not configure `GEMINI_API_KEY` or `OPENAI_API_KEY` on Render; users enter their own keys in the browser.

## Data and security model

Uploaded files, extracted text, translation history, and API keys remain in the browser. Translation requests go directly from the browser to Google or OpenAI. Only EPUB generation sends the finished Markdown and optional cover image to this server; that endpoint does not persist request content.

Browser storage is convenient, not a password vault. Avoid saving API keys on shared devices, restrict provider keys where supported, and clear them from **設定 API Key** when finished.

## Project structure

```text
server.ts             Express/Vite entry point
server/epub.ts        EPUB validation, sanitization, and generation
src/App.tsx           Page composition and high-level translation coordination
src/components/       Model, pricing, cost, action, header, dialog, and preview UI
src/hooks/            Budget-aware provider access, usage, exports, and workflow state hooks
src/pdf.worker.ts     Background PDF parsing and OCR chunk preparation
src/lib/models.ts     Model catalog, review schedule, and token pricing
src/lib/provider-usage.ts Provider usage normalization
src/lib/db.ts         IndexedDB translation history
src/lib/novel-continuity.ts  Structured long-novel canon and timeline memory
src/lib/text.ts       Markdown chunking and binary conversion utilities
src/lib/document-memory.ts Layered long-document translation memory
src/lib/translation-quality.ts Deterministic translation integrity checks
src/lib/translation-runner.ts Chunk translation, correction, sentence repair, and validation
src/lib/translation-state-machine.ts Translation lifecycle state machine
src/lib/protected-content.ts Protected-content placeholder round trips
src/lib/sentence-segments.ts Sentence IDs, omission localization, and repairs
src/lib/chapter-proofreading.ts Chapter consistency review contracts
tests/                Automated unit tests
```
