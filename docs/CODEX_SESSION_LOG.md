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

