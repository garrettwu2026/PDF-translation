# Codex project context

Last updated: 2026-09-04 (Asia/Taipei)

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
- `src/components/WorkspaceSettings.tsx`: upload-first settings and collapsible preferences
- `src/components/WorkspaceProgress.tsx`: committed progress, stage, saved-state telemetry, and actionable errors
- `src/components/WorkspaceRunBar.tsx`: fixed cost / budget / run controls
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
- History retention targets 25 records / 12 million characters including intermediate response text. Unfinished translations are exempt from automatic pruning; the newest record remains protected. Every completed chunk now checkpoints; request usage/results are persisted separately before further paid work.
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

## 2026-09-03 工作台職責拆分

- `src/App.tsx` 從 1,575 行縮為 285 行，只負責畫面組裝；`src/hooks/useTranslationWorkspace.ts` 協調文件狀態、歷史、翻譯提交／回滾與各子 hook。
- 金鑰設定、原文 token 估算、成本預測及文件轉換分別由 `useApiKeySettings`、`useSourceTokenEstimate`、`useDocumentCostForecast`、`useDocumentConverter` 管理；既有 `useTranslationMachine` 仍是執行狀態機。
- `src/lib/extract-translation-pdf.ts` 處理 request-scoped Worker／AI 擷取與 ACK、取消清理；`src/lib/review-translated-chapter.ts` 處理章節校稿的保護內容、用量回報及完整性驗證，兩者透過注入 callback 測試，不依賴 React。
- `EpubMetadataSettings` 負責 EPUB 作者／封面設定。既有 UI、模型、定價、品質規則、歷史 schema 及下載流程保持不變。
- 協調 hook 仍約 984 行；下一步若繼續重構，可拆歷史還原／快照與翻譯交易協調，不能僅因移出 App 就視為所有複雜度已消除。

## 2026-09-04 優先可靠性項目 1–5

- PDF Worker 改為一頁一單位；有足夠原生文字的頁面直接使用本機結果，稀疏頁才傳送該頁 PDF 至 Gemini OCR。OpenAI 遇到掃描頁仍會提示改用 Gemini，不暗中切換供應商。逐頁順序／覆蓋檢查與儲存完成後 ACK，最終合併再處理頁緣／斷行。
- Provider adapters 回傳 finishReason；空白、缺少正常結束原因、length／MAX_TOKENS／過濾回應均不當成成功結果。OCR 的明確空白頁標記不進入譯文；完全空白文件停止翻譯。
- IndexedDB 升至 v2，新增 requests store；以文件 ID、工作流程版本與精確請求雜湊快取完整階段輸出。分析、OCR、初稿、校正、補修、語意複審及章節校稿可重用；不儲存 API Key 或完整提示詞。
- 新增 durable-requests.ts：開始前先建立請求紀錄，已知用量與完整回應存檔後才前往下個階段；快取重播不再次計費，預算超額也先保存已付費結果。串流途中收到的用量增量立即落盤。
- 未收到最終用量的請求保留 pending／unknown；歷史顯示用量待確認。這不是供應商帳單對帳或 exactly-once 外部計費保證；中斷中的 API 可能仍已計費。
- sourceFingerprint 使用 SHA-256。Web Locks 防止同瀏覽器／同網站不同分頁同時翻譯相同來源，刪除亦受鎖保護；不支援 Web Locks 時停止付費流程，不採不安全的 localStorage 假鎖。不同裝置／瀏覽器不共用此鎖。
- 保存章節累積上下文、前段譯文尾段與自訂指示。已完成部分的續傳設定必須一致；未完成 PDF 重新上傳相同原檔後，可重用已完成 OCR 結果。
- 所有新瀏覽器回歸測試皆攔截供應商 HTTP 並使用假金鑰／合成文件。正式程式沒有測試後門。快取驗證規則改動時，需同步提升 durable-requests 的 workflow version。

## 2026-09-04 全面 UI 加強（取代前述配色／版面）

- 使用靛藍／薄荷綠與語意色彩變數，減少舊深色 utility 的強制覆寫；明確警告色、較深說明字、鍵盤 focus 與 reduced-motion 支援。已移除卡片懸浮位移。
- 桌面上傳優先、左側設定／進度與右側閱讀室；固定底部已花費／剩餘預估／預算調整與執行控制。手機提供設定／進度／結果切換，修正 sticky selector 優先權，保留窄螢幕操作。
- 模型單價、進階指示／分段與下載資訊按需展開；模型、文件類型、預算與既有功能均保留。執行時不允許更換文件或工作模式。
- 進度使用已提交段數，不把目前進行中的段落當完成；保存階段最高 99%，成功完成才 100%。saveStatus／lastSavedAt 為 UI telemetry，只在實際 saveHistory 成功後顯示保存；不改 schema 或費用計算。
- 預算／金鑰／儲存／供應商速率與一般錯誤分開提供下一步。調整預算不自動重送請求；儲存失敗明確提醒勿關閉頁面。
- 閱讀室提供原文／譯文／段落對照、ATX／Setext 章節跳轉、字級／行距／三種紙張與專注閱讀（Escape 退出）。對照依空白行與順序並列，每頁 20 組；不是精確語意對齊，也不能用空欄判定漏譯。
- PDF 始終使用完整 canonical `translation-result-content`，即使目前顯示原文／對照亦不混入它們；閱讀樣式置於祖先元素，不進入 PDF clone。Markdown／EPUB 仍以原本完整字串匯出。
- UI 沒有新增付費 AI 請求、模型／價格更新、背景翻譯或跨裝置同步。舊 TranslationActionPanel 已由新元件取代，Git 歷史可還原。
