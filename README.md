# PDF Translation

A Traditional Chinese document translation web app for PDF and Markdown files. It supports Google Gemini and OpenAI models, background PDF parsing, resumable local history, and Markdown/PDF/EPUB export.

## Highlights

- Browser-side PDF text extraction with OCR fallback for scanned pages
- Translation pipeline with glossary, character, style, and continuity analysis
- Token-aware Markdown chunking with layered whole-book, chapter, and recent context
- Structured model outputs plus deterministic checks for omissions and damaged Markdown
- Provider-neutral translation-quality regression baseline
- Live provider-reported cost accounting for cached input and reasoning tokens
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
src/App.tsx           Translation workflow orchestration and page composition
src/components/       Model, pricing, cost, dialog, and preview UI
src/pdf.worker.ts     Background PDF parsing and OCR chunk preparation
src/lib/models.ts     Model catalog, review schedule, and token pricing
src/lib/provider-usage.ts Provider usage normalization
src/lib/db.ts         IndexedDB translation history
src/lib/text.ts       Markdown chunking and binary conversion utilities
src/lib/document-memory.ts Layered long-document translation memory
src/lib/translation-quality.ts Deterministic translation integrity checks
tests/                Automated unit tests
```

