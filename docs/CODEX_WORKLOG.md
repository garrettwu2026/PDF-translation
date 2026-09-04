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

## 2026-09-02 — Translation integrity and provider resilience

- Required protected placeholders to appear exactly once and in original order before restoration.
- Replaced whitespace-dependent sentence splitting with `Intl.Segmenter` plus a CJK-safe fallback and Markdown-line handling.
- Added missing, empty, duplicate, unknown, and reordered sentence-marker validation with targeted repair for empty segments.
- Persisted resolved automatic document types and added a one-time legacy resume analysis path.
- Added provider-neutral authentication, invalid-request, rate-limit, transient, and unknown error categories with safe messages, Retry-After support, and bounded exponential backoff.
- Added deterministic excessive-expansion, repeated-paragraph, source-language-residue, missing-number, and invented-number checks with stricter technical, academic, and business/legal handling.
- Expanded the unit suite from 56 to 66 tests.
- Validation: strict TypeScript, all 66 unit tests, and production build passed.

## 2026-09-02 — Maintenance, cost, and UX optimization

- Extracted document exports into `useDocumentExports` and added reusable upload/dropzone and accessible-dialog components.
- Reduced translation-history writes by roughly two thirds during ordinary runs and avoided full retention/history reads on intermediate checkpoints.
- Added quota/blocked IndexedDB error classification with a single user-facing warning while preserving safe terminal saves.
- Made chapter proofreading risk-adaptive so quiet general-document boundaries skip an extra AI request while terminology, character, quality, novel, and business/legal risks still trigger review.
- Changed chapter risk accounting to use only genuinely new document-memory entries.
- Added native drag-and-drop, keyboard upload activation, focus trapping, Escape dismissal, semantic labels, and focus restoration.
- Expanded the unit suite from 66 to 69 tests and extended browser E2E coverage for drag-and-drop and modal accessibility.

## 2026-09-02 — Semantic fidelity and layout-aware extraction

- Added deterministic detection for lost negation, lost conditions, missing measurement units, and required glossary translations.
- Added per-sentence risk scoring and strict structured semantic review for only the highest-risk 25%, capped at eight sentences per chunk.
- Routed selective review to Gemini 3.1 Pro Preview or GPT-5.6 Sol within the chosen provider and restricted revisions to requested sentence IDs.
- Added mixed-model usage accounting so stronger-review tokens use their actual input/cache/output prices and remain protected by the run budget.
- Added coordinate-aware PDF two-column ordering, repeated header/footer and page-number removal, and line/hyphen repair across page boundaries.
- Expanded sanitized quality coverage to general, novel, technical, academic, and business/legal documents, plus PDF layout and review-pipeline integration.
- Validation: strict TypeScript, all 87 unit tests, the expanded quality gate, and production build passed.

## 2026-09-02 — Bounded semantic-review cost

- Prevented deterministic chunk retries from repeatedly purchasing semantic review for the same chunk.
- Made glossary drift non-blocking in novel and general modes while retaining it as a review signal and preserving strict enforcement for precision document modes.
- Routed non-premium OpenAI review to GPT-5.6 Terra and non-premium Gemini review to Gemini 3.7 Flash; explicitly selected Sol and Pro models remain unchanged.
- Added regression tests for economical reviewer selection, novel glossary behavior, and the one-review-per-chunk guarantee.

## 2026-09-03 — Transactional resume, persistent budgets, and novel canon

- Fixed the resume boundary so an interrupted or over-budget in-flight chunk is retried instead of being skipped.
- Persisted cumulative tokens and itemized provider costs in backward-compatible IndexedDB records and restored them with the document budget.
- Added request-level budget reservation and explicit output-token ceilings across extraction, analysis, translation, correction, repair, semantic review, and chapter review.
- Added versioned long-novel continuity memory with canonical name preservation, alias-conflict detection, facts, chapter anchors, and a bounded timeline.
- Fed novel canonical names into subsequent glossary enforcement and persisted continuity across history reloads.
- Extracted budgeted provider access, the workspace header, translation action/progress panel, and document result panel from `App.tsx`.
- Added budget-resume, request-reservation, transactional-progress, memory immutability, malformed history, output-sizing, and no-retry-on-budget-stop regression coverage, bringing the unit suite to 100 tests.
- Completed interruption recovery: text and memory roll back together, incurred charges stay recorded, completed runs restart with empty output, and partial PDF extraction cannot masquerade as complete input. Persist split mode and reject changed resume boundaries.
- Validation: TypeScript check, all 100 unit tests, and production Vite build pass using the bundled Node executable (npm is not on PATH). Browser smoke checks verified budget editing to USD 10, API settings dialog, converter switching, and no console errors; no paid provider requests were made. Standalone Playwright execution was unavailable because its Chromium binary is missing.
- Budget preflight is an estimate, not a hard billing guarantee. Legacy records cannot recover historical charges. Novel event summaries follow textual order and preserve explicit time/POV clues without inferring unknown chronology.

## 2026-09-03 — 分階段預估、實測校正與成本明細

- 移除原文 4x 輸入／2.5x 輸出的全流程固定倍率，改用階段／模型規劃與實際提示詞、schema、文件記憶長度。
- 原生 PDF 與 Markdown 使用一致的文字 token 估算；掃描／稀疏頁保守標示未知，完成擷取後按實際 Markdown 重算。原生文字估算加入取消及清理處理。
- 記錄已提交段落費用，至少三段才啟用實測混合校正；設定不同的樣本不混用，歷史最多保留 12 段。
- 增加完成段落計數，區別正在處理的 UI 段數；進行中費用抵扣限於該段份額，失敗費用保留但不誤算成已完成。
- 持久化階段／模型帳本並維持舊紀錄費用；重試與一次性語意複審分開列帳，推理 token 不重複計價。
- 更新成本面板與開始前預算估算。新增估算、提示詞成長、五頁擷取批次、取樣分析、混合模型、校正、暫停、舊帳本回歸測試，並強化重試流程列帳檢查。
- 驗證：TypeScript、全部 111 項測試及正式 Vite build 通過。Browser 上傳合成 Markdown，確認原文 tokens 不隨模型改變、費用重新計算，並在 Luna 翻譯的明細列出 Terra 複審。本機正式伺服器 /api/health 回傳 ok；未呼叫付費翻譯 API。一般開發伺服器受 Windows 沙箱設定載入限制，改用正式建置驗證。

## 2026-09-03 — App 畫面與工作台流程解耦

- 將 App.tsx 從 1,575 行縮為 285 行，畫面組裝與約 984 行的 useTranslationWorkspace 協調邏輯分離。
- 新增金鑰設定、token 估算、成本預測、文件轉換 hook，以及 EPUB 作者／封面設定元件；沿用原本欄位、處理規則及介面。
- 抽出可獨立測試的 PDF 擷取與章節校稿服務，保留 request ID、用量先計入、ACK backpressure、輸出上限、重試及品質檢查順序。
- 擷取取消可立即結束等待，忽略過期回應；Worker 啟動／取消失敗仍移除監聽器並回報原始錯誤。
- 新增九項回歸測試，涵蓋 native／OCR 路由、過期任務、失敗批次、費用上限、取消、Worker 清理、章節保護內容與失敗仍計費。
- 驗證：使用 bundled Node 執行 npm run check 等效的 TypeScript、全部 120 項測試及正式 Vite build，全部通過。
- Browser 技能用於本機介面回歸：合成 Markdown 上傳、26-token 估算及模型切換重算、EPUB 作者設定、轉換器預覽、API／歷史視窗開關，無 console error；未讀取金鑰或呼叫付費翻譯 API。未執行整本書的真實模型端到端翻譯。

## 2026-09-04 — 優先可靠性項目 1–5

- 改為逐頁原生文字／OCR 路由：原生文字在本機擷取，僅稀疏頁發送單頁 PDF。固定 OCR PDF metadata 保持重試雜湊穩定；取消亦清理 PDF document。
- 新增正常 finishReason／非空結果驗證，拒絕截斷及過濾結果；檢查 Worker 頁面順序／完整覆蓋，保留明確空白頁標記處理與完整原文落盤。
- IndexedDB v2 新增 requests store；以精確請求雜湊保存各階段回應，已完成階段可跨重新整理重用而不再次計費。品質重試隔離不同嘗試；暫時性失敗可重用已成功階段。
- 每次已知用量立即存檔，完整結果與費用在同一 transaction 保存後才檢查超額；未完成／缺用量請求保留待確認。所有儲存失敗會停止後續付費工作。
- 每段提交都存檔，額外保存章節累積上下文、自訂指示及前段譯文尾段。重新上傳同一 PDF 可恢復 OCR；設定與來源雜湊防止誤用舊結果。
- 引入 Web Locks：阻止同網站／同瀏覽器分頁重複翻譯同來源，刪除亦取鎖；不支援原子鎖的瀏覽器停止付費流程。未完成歷史免於自動清理；刪除歷史連帶清理中間結果。
- 修正原生文字 PDF 的預估擷取成本為零，OCR 改為逐頁規劃。費用預估仍保守計入未提交段落，未逐階段扣除本機快取。
- OpenAI 官方 API 文件用於核對 finish_reason；實作只沿用既有 API，沒有改模型定價或請求新權限。參考：https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- 驗證：bundled Node 執行 TypeScript、134 項單元測試、正式 Vite build 全通過；使用獨立測試 Chrome profile 執行 6 項 Playwright E2E 全通過。覆蓋預算停止／重新整理／續傳／匯出、校對途中重新整理、雙分頁互斥與停止釋鎖、混合 PDF 單頁 OCR／截斷重試，以及已付費章節校稿重用。
- E2E 使用合成 PDF／Markdown、假金鑰與攔截的供應商 HTTP；沒有發出真實付費翻譯。未驗證真實掃描書 OCR 準確率；具文字層但同頁含其他圖片文字的混合頁仍可能需要更細緻的版面分析。
- 限制：瀏覽器關閉後不會繼續執行；跨裝置不共用鎖；失聯請求可能已被供應商計費，待確認紀錄不是精確帳單或遠端 exactly-once 保證。

## 2026-09-04 — 全面 UI 與閱讀工作台加強

- 重整上傳→設定→執行的資訊層級；抽出 WorkspaceSettings、WorkspaceProgress、WorkspaceRunBar，替換舊 TranslationActionPanel（Git 可恢復），App 專注組裝／UI 導覽。
- 固定費用與執行列，直接聚焦預算設定；手機設定／進度／結果切換，390px 與 320px 無橫向溢出。錯誤提示提供預算、金鑰、原檔與儲存的對應入口，不自動重跑。
- 區分提交完成的段數、當前處理步驟與最近成功保存時間；保存失敗不顯示已保存。載入歷史與新文件時同步重設顯示狀態。
- 新增閱讀設定、暖色／白色／薄荷紙張、專注模式、原文檢視、按順序分頁段落對照與章節跳轉；對照不是語意對齊，不當作品質判定。
- 匯出選單保留複製／MD／PDF／EPUB。完整 canonical DOM 與閱讀設定隔離，原文與對照模式仍只匯出譯文。統一語意配色、提高通知對比、修正手機 sticky 與無障礙按鈕名稱。
- 驗證：138 項單元測試、TypeScript 與正式 Vite build 通過；10 項 Playwright E2E 通過，涵蓋既有恢復／計費／鎖與新章節、分頁、紙張、專注、手機、直接錯誤入口、儲存失敗、PDF／EPUB 輸出隔離。桌面與手機截圖已人工檢視。
- 未修改 provider 請求、模型價格、翻譯品質規則或歷史 schema；不產生真實 AI 費用。移除的舊元件可從 Git 歷史恢復。

## 2026-09-04 — 優先項目 1–5 實作

- 依使用者「先做 1～5」完成長文件分頁與預覽節流、按需全文 PDF DOM、專案匯出／匯入、歷史搜尋／容量／明確清理、已驗證快取成本扣抵與完整 CI。
- 匯入使用白名單與完整性／進度驗證，原子建立副本並重編請求 ID；不傳出金鑰、不覆寫舊專案、不自動發起模型請求。清理確認會說明不可復原與重跑費用，未執行任何真實使用者資料清理。
- 新增工作區用量未確認警示、重試／複審費用占比、已存中間結果與當前設定驗證命中數。
- 驗證：TypeScript、146 項單元測試、正式 Vite build、12 項 Playwright E2E 全通過；測試皆使用合成文件／假金鑰／攔截供應商，不產生真實翻譯費用。以 bundled Node 執行 npm run check 的三個等價步驟。
- E2E 涵蓋備份移至隔離瀏覽器後分析／初稿零重送、匯入確認／Escape、搜尋／清理、320px 歷史操作、800 章長文件 DOM 邊界與跨頁全文 PDF 匯出；既有續傳／預算／雙分頁鎖／OCR 測試保留。桌面與手機截圖已檢視。
- 未新增背景翻譯、郵件、雲端同步、模型或價格變更。備份含未加密文件但不含金鑰設定及原 PDF，請自行妥善保管。
