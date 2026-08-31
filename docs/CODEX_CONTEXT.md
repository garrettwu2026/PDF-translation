# Codex project context

Last updated: 2026-08-31 (Asia/Taipei)

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

- `src/App.tsx`: main React UI and translation workflow
- `src/index.css`: Tailwind import, document rendering styles, and application visual system
- `src/pdf.worker.ts`: background PDF parsing and OCR preparation
- `src/lib/db.ts`: browser IndexedDB translation history
- `src/lib/text.ts`: safe Markdown chunking and binary conversion utilities
- `server.ts`: Express/Vite server and health endpoint
- `server/epub.ts`: EPUB request validation, sanitization, and generation
- `tests/`: Node test suite

Uploaded documents, API keys, and translation history stay in the browser. Translation requests go from the browser to the selected AI provider. The server only receives completed content when generating EPUB output.

## Supported AI models and displayed standard prices

Prices are USD per one million tokens and were verified on 2026-08-31.

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
npm start
```

`npm run check` performs TypeScript validation, unit tests, and a production build.

## Important constraints

- Do not add server-side provider keys; this is intentionally bring-your-own-key.
- OpenAI models operate on extracted text and do not directly process scanned PDF input in the current workflow.
- Preserve IndexedDB history compatibility.
- Do not weaken EPUB sanitization or server request limits.
- Avoid exposing raw API errors, secrets, or uploaded content in logs.
- Keep desktop and mobile layouts usable.

## Current UI direction

The 2026-08-31 redesign changes the previous dark, information-heavy interface into a bright document workspace:

- light neutral background with blue and teal accents
- compact header and segmented mode switch
- one grouped model selector instead of six large radio cards
- clear selected-model price summary
- collapsible optional EPUB settings
- left control rail and sticky right preview on desktop
- stacked responsive layout on smaller screens

The functional workflow remains unchanged.
