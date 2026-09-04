# Codex conversation summary

This file contains a concise, sanitized record of user intent and decisions so another Codex Desktop installation can continue the project. It is not a raw transcript and intentionally excludes hidden prompts, internal reasoning, tool output, credentials, and uploaded document contents.

## 2026-08-31

### Project optimization and GitHub delivery

User request:

> This was previously a Google AI Studio project. It is hosted on GitHub and deployed to Render. Perform substantial code optimization and commit it back to the project.

Decisions and outcome:

- Hardened and optimized the translation pipeline without changing the product's purpose.
- Added validation, safer EPUB generation, production security behavior, memory-conscious PDF processing, stricter TypeScript, and automated tests.
- Updated project documentation and deployment instructions.
- GitHub commit: `f90b4ec6ca01282983a794148c82975cc777022e`

### Render automatic deployment

User requests:

> Configure Render automatic deployment.

> Where is the deployment link?

Decisions and outcome:

- Confirmed the Render web service tracks the `main` branch with auto-deploy enabled.
- Production link: https://pdf-translation-me70.onrender.com
- Dashboard link: https://dashboard.render.com/web/srv-d76cepjuibrs73bik96g
- Connector-based GitHub ref updates may not trigger Render's webhook, so every future session must verify that a new deploy was created.

### Model and pricing update

User request:

> I do not see much difference. Switch to the new Gemini and OpenAI 5.6-series models and update prices.

Decisions and outcome:

- Replaced the older model menu with current Gemini and GPT-5.6 families.
- Added official input, cached-input, and output prices.
- Set Gemini 3.7 Flash as the default.
- Added compatibility fallback for history records that reference removed models.
- GitHub commit: `65093cf7b9c430d1a107e74ecd13df4ae65c55da`
- Render deploy: `dep-daagi98n74is73asl6vg` (live at completion)

### Full UI redesign

User request:

> I do not like the current UI. Redesign the whole UI so it is professional, friendly, and simple, but do not change functionality.

Design decisions:

- Preserve every existing workflow and change presentation only.
- Move from dark, dense cards to a bright, calm workspace.
- Simplify model selection to a grouped dropdown and a concise pricing summary.
- Collapse optional EPUB metadata to reduce initial cognitive load.
- Keep settings on the left and preview on the right for desktop; stack them on mobile.
- Use clearer, friendlier Traditional Chinese labels.

### Cross-computer project memory

User request:

> I may edit this project later from Codex Desktop on another computer. Upload the conversation and coding history into the GitHub project so the other Codex instance knows the previous context.

Decision:

- Store portable, sanitized project memory in `AGENTS.md` and the `docs/CODEX_*.md` files.
- Future Codex sessions should update these records after material work.
- Never store API keys, credentials, hidden prompts, internal reasoning, or unnecessary personal data.

### Priority source-code improvements

User requests:

> Scan the source code and list further optimization opportunities.

> Implement the recommended priority items first.

Decisions and outcome:

- Hardened PDF printing so filenames and translated content are inserted through DOM APIs rather than HTML string interpolation.
- Added a production Content Security Policy and related browser security headers.
- Added request IDs, cancellation, stale-result protection, and acknowledgement backpressure to PDF worker operations.
- Changed API key persistence to tab-session storage by default, with an explicit remember-on-device option.
- Persisted character maps and plot summaries in IndexedDB so resumed translations retain their working context.
- Added real 50 MB PDF, 12 MB Markdown, and 3,600-page PDF limits shared across upload, worker, and conversion paths.
- Added a stop-and-resume translation control that keeps completed progress.
- Validation: strict TypeScript, 10 unit tests, and production build passed.

### Maintenance and cost optimization

User request:

> Introduce maintenance and cost optimization.

Decisions and outcome:

- Combined glossary, character-map, and style analysis into one structured AI request, removing one request and up to roughly 30,000 characters of repeated source input for each newly translated document.
- Centralized model definitions, pricing, fallback behavior, and cost calculations in a tested module.
- Lazily loaded the Markdown renderer so users do not download it until a preview is needed.
- Moved server rate limiting into a tested module and added periodic stale-client pruning to prevent unbounded memory growth.
- Expanded automated coverage from 10 to 17 tests.
- Validation: strict TypeScript, 17 unit tests, and production build passed.

### Repository cleanup, safe diagnostics, and App decomposition

User request:

> Clean up experimental files, remove console logs that might contain document content, and split the main program.

Decisions and outcome:

- Removed 30 tracked experimental scripts and generated EPUB fixtures while preserving the maintained `tests/` suite.
- Added ignore rules for root test EPUB outputs so generated artifacts are not recommitted.
- Removed direct logging of source and translated text. Client diagnostics now emit only development-time event codes and non-content metadata.
- Moved provider calls, API-key storage, complete prompt templates, notifications, and modal UI out of `App.tsx`.
- Reduced `App.tsx` from 2,369 to 1,917 lines without changing the complete translation and correction prompt rules.
- Expanded the automated suite from 17 to 21 tests.
- Validation: strict TypeScript, 21 unit tests, and production build passed.

### High-priority reliability and further App decomposition

User request:

> Implement every remaining high-priority item and split `App.tsx` further.

Decisions and outcome:

- Connected the stop control to provider-level abort signals, retry waits, token counting, and PDF worker cancellation.
- Added a configurable USD run budget and 1–6 retry limit; preflight over-budget jobs are blocked and runtime limit stops preserve resumable history.
- Added history retention capped at 25 newest records and approximately 12 million stored characters.
- Extracted usage tracking, budget logic, browser exports, and converter PDF extraction from `App.tsx`.
- Added Playwright browser integration coverage and a GitHub Actions E2E workflow.
- Validation: strict TypeScript, 26 unit tests, production build, E2E discovery, and an interactive browser smoke test passed.

### Precise actual costs, model-price reminders, and further App decomposition

User request:

> Continue splitting `App.tsx`, make actual costs more precise, and add price/model update reminders.

Decisions and outcome:

- Normalize provider usage in one module so Gemini thinking tokens and OpenAI reasoning tokens follow their different billing semantics.
- Discount cached input using the selected model's cached-input rate and expose cached, cache-write, billed-output, and reasoning totals in the live summary.
- Treat streaming usage metadata as cumulative and add only its delta to avoid duplicate costs.
- Keep the catalog review reminder deterministic and privacy-preserving; it shows official links and becomes a warning on the scheduled review date or before known promotional changes.
- Extract model selection, catalog status, run limits, and cost-summary presentation into focused components.
- Validation: strict TypeScript, 32 unit tests, and production build passed.

### GPT-5.6 temperature compatibility hotfix

User report:

> Translation failed because GPT-5.6 rejected `temperature: 0.1` and only accepts its default value.

Decisions and outcome:

- Added an explicit per-model custom-temperature capability to the centralized model catalog.
- Omitted `temperature` from both regular and streaming GPT-5.6 requests while preserving Gemini's existing sampling settings.
- Added regression coverage to prevent unsupported OpenAI parameters from being reintroduced.

### Translation-quality foundation

User request:

> Implement a translation-quality evaluation baseline, structured outputs, deterministic omission checks, token/Markdown-aware chunking, and layered document memory.

Decisions and outcome:

- Added a sanitized, provider-neutral quality regression dataset and a dedicated quality-test command.
- Added strict JSON Schema outputs for document analysis and correction across Gemini and OpenAI.
- Added deterministic pre/post-correction checks for protected content and Markdown structure; blocking failures retry the affected chunk.
- Replaced raw-character translation chunks with estimated-token chunks that preserve Markdown blocks and fenced code.
- Distributed the 50,000-character analysis budget across the full document and added global, chapter, recent, and immediate-context memory layers.

### Protected content, sentence repair, document modes, and workflow state machine

User request:

> Add protected-content placeholders, sentence-level omission localization, document-type modes, chapter-level consistency proofreading, and move the translation flow out of the still-large App component into a state machine.

Decisions and outcome:

- Protect non-translatable code, links, URLs, email, math, and markup with reversible placeholders, and reject changed or missing placeholders.
- Tag source sentences with stable IDs; ask the structured correction pass for missing IDs and issue a separate targeted repair request only for those sentences.
- Offer automatic, novel, technical, academic, business/legal, and general modes, with automatic classification included in the existing document-analysis request.
- Add optional chapter-level consistency proofreading at chapter boundaries or every six chunks, guarded by deterministic completeness validation.
- Move the per-chunk draft, correction, repair, retry, and validation sequence into a dedicated runner and represent workflow progress with an explicit state machine.

### More lively UI color system

User request:

> The current UI is too white and clean; add some color and make it livelier.

Decisions and outcome:

- Preserve the existing simple layout and functionality while increasing color through low-saturation ambient gradients.
- Color-code workflow cards with violet, teal, warm coral, and blue/teal accents so sections are easier to distinguish.
- Add a more expressive brand mark, intro panel, mode switch, result toolbar, and preview surface without reducing text contrast.

## 2026-09-02

### Translation integrity and retry hardening

User request:

> Implement review recommendations 1 through 5.

Decisions and outcome:

- Enforce exact protected-placeholder count and order, rejecting duplication as well as missing or unknown placeholders.
- Use sentence-aware CJK segmentation and validate marker content, uniqueness, order, and identity before accepting a chunk.
- Persist the effective automatic document type across history and reanalyze legacy automatic-mode resumes once.
- Normalize provider errors into permanent and retryable categories, honor Retry-After, and use exponential backoff with jitter for transient failures.
- Add expansion, duplicate-paragraph, source-language-residue, and bidirectional numeric checks; numeric discrepancies block precision-sensitive document modes.

### Maintenance, cost, and UX optimization

User request:

> Introduce maintenance, cost, and UX optimizations.

Decisions and outcome:

- Extract document export coordination from `App.tsx` and introduce reusable upload and accessible-dialog components.
- Reduce IndexedDB write amplification by checkpointing the first chunk, every third chunk, and terminal states; skip repeated retention scans and history reloads on intermediate checkpoints.
- Spend chapter-proofreading requests only at a valid boundary with terminology, character, quality, or document-mode risk signals.
- Count genuinely new terminology and character memory entries instead of repeated model reports.
- Add click, keyboard, and real drag-and-drop upload behavior plus modal focus trapping, Escape dismissal, semantic labels, and focus restoration.
- Add regression coverage for checkpoint scheduling, adaptive proofreading, new-memory detection, drag-and-drop upload, and dialog accessibility.

### Meaning fidelity, selective review, and PDF reading order

User request:

> Implement the five recommended translation-quality improvements.

Decisions and outcome:

- Add deterministic negation, condition, measurement-unit, and locked-glossary checks to the existing completeness gate.
- Score sentence risk from deterministic findings, complex relations, precision content, length anomalies, and correction uncertainty.
- Send only the highest-risk quarter, capped at eight sentences per chunk, to the strongest model from the same provider; accept only requested sentence IDs and replace only confirmed errors.
- Account mixed translation/review usage using each model's real catalog price under the same user-defined budget.
- Share coordinate-aware PDF ordering, repeated header/footer removal, page-number cleanup, and cross-page line repair across translation and converter extraction.
- Expand the sanitized benchmark across general, novel, technical, academic, and business/legal cases plus PDF layout and selective-review tests.

### Repeated novel review and review-model cost

User report:

> A novel appears to keep reviewing the first chunk, and GPT-5.6 Sol is too expensive for review.

Decisions and outcome:

- Limit semantic review to one paid request per chunk, even when deterministic quality checks retry that chunk.
- Treat novel and general glossary drift as a non-blocking warning that can trigger review, while retaining blocking glossary enforcement for technical, academic, and business/legal modes.
- Use GPT-5.6 Terra for OpenAI review unless the user explicitly selected Sol; use Gemini 3.7 Flash unless the user explicitly selected Gemini 3.1 Pro Preview.
- Add regression coverage for both model routing and a quality retry after an unsuccessful semantic review.

## 2026-09-03

### Reliable long-document resume, document budgets, and novel continuity

User request:

> Implement all P0 recommendations, long-novel consistency, and continue splitting App.tsx.

Decisions and outcome:

- Treat history progress as committed chunks only; a chunk becomes resumable only after translation, correction, selective review, chapter review, and result assembly succeed.
- Persist normalized provider usage and itemized USD cost with each document so raising a limit and resuming no longer resets the document's displayed or enforced spend.
- Check estimated input/output cost before every provider request and set explicit output-token ceilings; stop when this estimate exceeds remaining budget. This reduces overshoot but cannot guarantee an exact provider billing cap.
- Add structured novel canon memory for canonical names, conflicting aliases, character facts, chapter anchors, and recent timeline events; feed canonical names back into the locked glossary.
- Extract budget-aware provider coordination, the workspace header, translation action/progress UI, and result preview/export UI from `App.tsx`.

Continuation after interruption:

- Roll back in-flight text and memory together, while keeping incurred usage; fix completed-document restart appending old text.
- Mark partial PDF extraction explicitly and require the original file to retry; do not silently drop a failed final OCR chunk.
- Preserve split mode, reject mismatched resume boundaries, normalize legacy memory, and warn when old records lack cost data.
- Scale output ceilings with source size and reject oversized unsplit chunks before paid requests. Novel memory remains a model-assisted consistency aid, not a proof of factual or chronological correctness.

### 2026-09-03 — 修正長文件預估與實際費用落差

使用者要求依先前診斷建議實作修正。

- 以實際擷取文字更新原文 token 估算；未知掃描 PDF 不顯示誤導性的零成本。
- 依各翻譯階段、實際 reviewer 模型、提示詞與文件記憶估算成本。
- 使用成功提交段落的成本動態校正剩餘預估，避免提前扣掉進行中段落或重算既有費用。
- 顯示已花費／剩餘預估／預計完成總額及階段明細，保留既有品質與費用上限機制。
- 同步維護跨電腦紀錄；不保存測試以外的上傳內容、不使用付費翻譯 API 驗證。

### 2026-09-03 — 繼續拆分 App.tsx

使用者本次要求繼續拆分主畫面程式。

- 限定為職責拆分與回歸驗證，保留翻譯、API 金鑰、歷史、費用、預覽與匯出操作。
- 分離工作台協調、PDF 擷取、章節校稿、成本、token 估算、文件轉換、金鑰設定及 EPUB 設定元件。
- 此次未導入逐頁 OCR、額外中間階段持久化、背景翻譯、跨分頁鎖或新的品質／成本策略。
- 維護紀錄隨程式碼同步，方便另一台電腦接續；測試只用合成文件與 mock provider。

### 2026-09-04 — 導入優先項目 1–5

使用者要求導入逐頁 OCR、擷取完整性檢查、階段級存檔續傳、即時費用紀錄／同文件執行鎖，以及完整中斷回歸測試。

- 原生文字頁不再付費進行模型排版；掃描頁逐頁 OCR，保留既有供應商選擇與所有翻譯品質檢查。
- 相同文件與精確請求的已完成階段可以重用；設定變更不能誤用舊輸出，已回報費用不得因回滾或續傳消失。
- 未知用量明確警告，不以零元或自動推算金額代替供應商帳單。
- 儲存失敗時停止後續付費請求；關閉分頁只提供之後續傳，不等於背景持續翻譯。
- 本輪不包含角色正典編輯器、跨裝置同步、背景翻譯或寄送郵件。

### 2026-09-04 — 導入所有建議的 UI 加強

使用者要求將上一輪 UI 建議全部導入，包含 1–5 優先項目、配色／可讀性／手機版，以及原譯文段落對照與章節導覽。

- 保留翻譯與計費流程，重整操作順序、固定費用與控制列、透明進度／儲存狀態、可處理的錯誤提示及匯出選單。
- 閱讀字級、行距、紙張與專注模式只影響畫面，不改輸出；段落對照明確標示為順序參考，不承諾逐句精準對齊。
- 所有測試使用合成文件與模擬供應商；不使用真實文件／金鑰或付費翻譯驗證。

### 2026-09-04 — 優先實作建議 1–5

使用者要求先導入上一輪優先項目：長文件預覽效能、專案備份還原、歷史與儲存管理、更準確續傳成本與完整 CI。

- 保持翻譯品質流程／provider 行為，透過只讀快取驗證改善預估；不以快取筆數直接推算折扣。
- 備份採手動匯出／匯入獨立副本，排除金鑰設定。提醒未加密、不是雲端同步或背景執行；未完成 PDF 擷取需原檔。
- UI 清理功能必須確認並保留譯文與費用證據；未操作真實使用者存檔。
- 本輪不包含額外品質編輯器、局部重譯或真正原譯文語意對齊。
