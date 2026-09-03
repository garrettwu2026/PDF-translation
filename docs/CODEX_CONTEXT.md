# Codex project context

Last updated: 2026-09-03 (Asia/Taipei)

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
- `src/lib/provider-errors.ts`: provider-neutral error classification, safe messages, Retry-After parsing, and retry backoff
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
- `src/lib/novel-continuity.ts`: structured canonical names, aliases, facts, chapter anchors, and novel timeline
- `src/lib/translation-quality.ts`: deterministic protected-content and Markdown integrity checks
- `src/lib/translation-risk.ts`: sentence risk scoring and selective stronger-model semantic review
- `src/lib/protected-content.ts`: reversible placeholders for code, URLs, email, math, link targets, and HTML
- `src/lib/sentence-segments.ts`: stable sentence IDs, omission localization, and targeted repair application
- `src/lib/translation-runner.ts`: per-chunk draft, correction, sentence repair, protected-content restore, and validation pipeline
- `src/lib/chapter-proofreading.ts`: bounded chapter-level consistency review schema and boundaries
- `src/lib/document-types.ts`: automatic and explicit document-type translation rules
- `src/lib/translation-state-machine.ts`: explicit translation lifecycle states
- `src/lib/structured-output.ts`: shared Gemini/OpenAI JSON Schema request configuration
- `src/lib/translation-budget.ts`: token usage accounting, cost ceilings, and retry bounds
- `src/lib/translation-progress.ts`: transactional in-flight versus committed chunk progress
- `src/hooks/useTranslationUsage.ts`: translation-run usage state
- `src/hooks/useBudgetedAiProviders.ts`: budget-reserved provider calls and document-level usage coordination
- `src/hooks/useDocumentExports.ts`: copy, Markdown, PDF, and EPUB export coordination
- `src/lib/browser-exports.ts`: Markdown, EPUB, and safe print export helpers
- `src/lib/pdf-text-extraction.ts`: converter-mode PDF text extraction
- `src/lib/pdf-layout.ts`: coordinate-aware PDF reading order, repeated edge removal, and line repair
- `src/components/MarkdownPreview.tsx`: lazily loaded Markdown renderer
- `src/components/ModelSelectionPanel.tsx`: model selector, price card, and run limits
- `src/components/ModelCatalogNotice.tsx`: official pricing links and scheduled review warning
- `src/components/TranslationCostSummary.tsx`: estimated and provider-reported actual cost UI
- `src/components/AccessibleDialog.tsx`: shared modal semantics, focus trap, Escape handling, and focus restoration
- `src/components/DocumentUploadDropzone.tsx`: click, keyboard, and drag-and-drop document selection
- `src/components/WorkspaceHeader.tsx`: application header and provider-key status
- `src/components/TranslationActionPanel.tsx`: run controls, progress, status, and recoverable errors
- `src/components/DocumentResultPanel.tsx`: preview and export toolbar
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
- The default whole-document budget is USD 5 and the retry ceiling is user-adjustable from 1–6. Provider-reported usage and itemized cost persist in history across pause/resume. Every request checks estimated input plus an explicit output ceiling before starting; this is an approximate safeguard, not a guaranteed provider billing cap (especially for PDF input or usage missing after cancellation). Old history without usage snapshots cannot reconstruct earlier charges and shows a warning.
- Browser history is automatically retained to the newest 25 records within an approximate 12-million-character capacity. In-progress translations checkpoint after the first chunk, every third chunk, and at completion/stop; retention scans are reserved for pruning checkpoints.
- Keep model IDs, provider mapping, and displayed prices centralized in `src/lib/models.ts`; do not duplicate the catalog in UI components.
- Respect model capability flags in `src/lib/models.ts`. GPT-5.6 currently requires the provider-default temperature, so OpenAI requests must omit custom `temperature` values.
- Actual cost must use normalized provider usage: cached input is discounted; Gemini thinking tokens are added to billable output; OpenAI completion tokens already include reasoning and must not be added twice.
- Initial document analysis intentionally combines glossary, character map, and style guide into one structured AI request to avoid paying for repeated source input.
- Document analysis samples across the whole file within a 50,000-character budget instead of reading only the beginning.
- Translation chunks use a provider-independent 1,800-token estimate and preserve Markdown blocks; fenced code is indivisible.
- Analysis and correction requests use strict JSON Schema Structured Outputs for both Gemini and OpenAI.
- Translation source is tagged with stable sentence IDs; missing or empty segments trigger targeted repair, while duplicate, unknown, or reordered IDs fail validation.
- Code blocks, inline code, link targets, URLs, email addresses, math, and HTML tags are replaced by reversible placeholders during model calls. Every placeholder must occur exactly once and remain in source order.
- Users can choose automatic, novel, technical, academic, business/legal, or general translation rules.
- Optional chapter consistency proofreading evaluates headings, document completion, or a six-chunk boundary, but only spends an AI request when terminology, character, quality, or document-mode signals indicate risk. It keeps the chunk-level result if review validation fails.
- A corrected chunk must pass deterministic checks for headings, URLs, link targets, code, footnotes, fences, severe truncation/expansion, repeated paragraphs, source-language residue, numeric fidelity, measurement units, negation, conditions, and locked glossary terms. Missing or invented numbers and locked-glossary violations block technical, academic, and business/legal documents; glossary drift in novel and general modes remains a review signal without forcing a full-chunk retry.
- Sentence risk scoring selects at most the highest-risk 25% (maximum eight) for an independent semantic review. Review stays with the chosen provider: non-premium Gemini models use Gemini 3.7 Flash, non-premium OpenAI models use GPT-5.6 Terra, while a user-selected Pro or Sol model remains unchanged. It revises only confirmed errors, runs at most once per chunk retry cycle, and is charged against the same run budget using the review model's actual price.
- Automatic document classification persists the resolved mode in history. Legacy automatic-mode records are reanalyzed once when resumed.
- Provider failures are classified as authentication, invalid request, rate limit, transient, or unknown. Only quality, rate-limit, and transient failures retry; Retry-After is honored when supplied.
- Layered translation memory separates a global summary, up to 24 chapter summaries, the latest six developments, and the immediate prior source/translation context.
- Novel mode additionally keeps a versioned structured canon of up to 200 entities and 80 timeline entries. The first accepted name remains canonical; later conflicts are retained as non-canonical aliases, reported diagnostically, and converted into locked glossary entries for subsequent chunks.
- `currentChunk` in history is the number of fully committed translation chunks. An in-flight chunk must never be persisted as completed; pause, provider failure, or budget stop resumes from that same unfinished chunk.
- Text, glossary, character facts, and novel memory roll back together to the last committed chunk on failure; already-incurred cost does not roll back. Store layered summary separately from novel context to avoid duplicated memory on resume. Persist extraction completion and split mode; incomplete PDF extraction requires the original file and must never be translated as a complete source.
- Upload limits are 50 MB for PDF, 12 MB for Markdown, and 3,600 pages per PDF. Keep UI, worker, and conversion validation aligned through `src/lib/file-limits.ts`.
- Native PDF extraction uses item coordinates to order two-column pages, removes repeated page edges/page numbers when enough pages are available, and repairs soft/hyphenated line breaks across page boundaries before AI formatting or converter output.
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

## 2026-09-03 成本估算架構更新

- 全流程固定倍率已移除。請使用 `src/lib/cost-forecast.ts` 與 `cost-prompts.ts`，不要再以 PDF 檔案 bytes 推算翻譯原文 tokens。
- 費用 UI 區分累積已花費、剩餘預估及預計完成總額，提供階段／模型明細與非保證的規劃範圍。
- PDF 原生文字估算不呼叫模型；稀疏／掃描頁標示未知。完成擷取後按實際 Markdown 重算來源、分段與分析取樣。
- `completedCostChunks` 只在整段提交後增加；進行中段落的已計費抵扣不得消耗其他段落預算。
- 歷史可選欄位 `costSamples` 保存最多 12 個合格樣本；`usageSnapshot.breakdown` 保存階段／模型成本。舊紀錄金額保持原值並列為未分類。
- 估算假設、校正權重及限制詳見 `docs/COST_ESTIMATION.md`。未更改模型定價、品質檢查或推理設定。
