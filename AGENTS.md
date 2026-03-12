# Repository Guidelines

## Project Structure & Module Organization
- `electron/`: Electron main process (IPC handlers, streaming, strategy host/worker, DB access).
- `src/`: React renderer (components, Zustand stores, UI utilities).
- `types/`: shared TypeScript types used by both main and renderer.
- `docs/`: architecture notes and design references.
- `public/`: static assets; `dist-electron/` is build output (do not edit).

## Build, Test, and Development Commands
- `npm run dev`: cleans `dist-electron/`, copies config, then starts Vite + Electron for local dev.
- `npm run build`: type-checks (`tsc`), builds renderer, and packages Electron via `electron-builder`.
- `npm run lint`: runs ESLint on the codebase; keep this clean before PRs.
- `npm run clean`: removes `dist-electron/` build artifacts.
- `npm run copy-config`: copies `electron/config/` into `dist-electron/config`.
- `npm run preview`: Vite preview for renderer-only checks (no Electron).

## Coding Style & Naming Conventions
- TypeScript throughout; follow existing patterns in each folder.
- Indentation is 4 spaces in TS/TSX files.
- React components use `PascalCase` filenames (e.g., `ChatArea.tsx`); functions/vars use `camelCase`.
- Prefer explicit, readable logic; avoid new abstractions unless required.
- Lint with `npm run lint` before sharing changes.

## Testing Guidelines
- No automated test runner is configured yet.
- Manual checks to run after changes: send/stop/regenerate/rewrite flows, stream updates, and multi-version switching.
- If you add tests later, place them under `test/` and document the command here.

## Commit & Pull Request Guidelines
- History uses short, task-scoped messages (e.g., `step5`, `fix rewrite UI`); keep commits concise and descriptive.
- PRs should include: summary, manual test notes, and screenshots for UI changes.
- Do not change DB schema or IPC event contracts without explicit approval.

## Configuration Tips
- Provider keys are read from env (e.g., `GEMINI_API_KEY` or `GOOGLE_API_KEY`).
- `electron/config/` is copied into build output; keep environment-specific values out of source.
