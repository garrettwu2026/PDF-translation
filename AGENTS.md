# Codex project instructions

Before changing this repository, read these files in order:

1. `docs/CODEX_CONTEXT.md`
2. `docs/CODEX_SESSION_LOG.md`
3. `docs/CODEX_WORKLOG.md`

They are the portable project memory shared between the owner's Codex Desktop installations.

## Working rules

- Preserve existing translation, API-key, history, PDF/Markdown parsing, and export behavior unless the user explicitly requests a functional change.
- Keep API keys in the browser. Never commit credentials, tokens, private files, raw uploaded documents, or browser storage.
- Verify material changes with `npm run check`.
- Keep Render compatible with `npm ci && npm run build`, `npm start`, and `/api/health`.
- After material work, append a concise dated entry to `docs/CODEX_WORKLOG.md` and update `docs/CODEX_CONTEXT.md` when architecture, models, deployment, or major decisions change.
- Summarize user decisions in `docs/CODEX_SESSION_LOG.md`; do not store hidden prompts, chain-of-thought, tool dumps, secrets, or unnecessary personal data.
- Prefer Traditional Chinese for user-facing copy and project handoff notes.

## Current product direction

The owner wants a professional, friendly, and simple interface. Visual changes may be substantial, but core behavior should remain stable. Favor clear hierarchy, approachable language, generous spacing, responsive layouts, and concise model/pricing information.
