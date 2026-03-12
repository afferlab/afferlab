# Smoke Tests

## Memory Cloud + Strategy (IPC end-to-end)

Command:
```bash
npm run memory-cloud:smoke
```

What it does:
- Creates a fresh conversation via `window.chatAPI.createConversation()`.
- Switches strategies (`builtin:minimal` → `builtin:memory-first`).
- Verifies Memory Cloud gating for each strategy.
- Runs ingest with `wait: 'load'` and `wait: 'full'`, plus MD and PDF fixtures.
- Deletes an asset and confirms it is gone.
- Non-text modalities (image/audio/video) default to rawOnly (asset only) unless `process` options are enabled later.

Supported formats + default indexing:
- text/plain (.txt) → `full`
- text/markdown (.md/.markdown) → `full`
- application/pdf (.pdf) → `full`
- image/*, audio/*, video/* → `rawOnly`

Acceptance checklist:
- Strategy gating: `builtin:minimal` disables memory cloud and ops reject with `MEMORY_CLOUD_DISABLED`.
- wait semantics: `wait: 'load'` returns `loaded` and list shows the asset; `wait: 'full'` returns `completed` and readAsset returns text.
- Non-text modalities route to rawOnly (asset persisted, no indexing).

Expected output (example):
```text
[smoke][memory] conversation:create { conversationId: "...", elapsedMs: 42 }
[smoke][memory] strategy:switch { conversationId: "...", strategyId: "builtin:minimal", elapsedMs: 95 }
[smoke][memory] memoryCloud:isEnabled { conversationId: "...", strategyId: "builtin:minimal", enabled: false, elapsedMs: 110 }
[smoke][memory] disabled { op: "listAssets", error: "MEMORY_CLOUD_DISABLED", ... }
[smoke][memory] strategy:switch { conversationId: "...", strategyId: "builtin:memory-first", elapsedMs: 340 }
[smoke][memory] ingest:load { assetId: "asset_...", status: "loaded", ... }
[smoke][memory] ingest:full { assetId: "asset_...", status: "completed", ... }
[smoke][memory] ingest:md { assetId: "asset_...", status: "completed", ... }
[smoke][memory] ingest:pdf { assetId: "asset_...", status: "completed", ... }
[smoke][memory] delete:asset { assetId: "asset_...", ... }
PASS
```

If the PDF ingest fails, the test accepts it as long as:
- the error contains `[ingest/pdf]`, the filename, and the mime string, and
- the logs include a stack trace (from `[ingest/pdf]`).

## When reporting failures

Please copy:
- All `[smoke][memory]` lines
- All `[memory-cloud/*]` logs
- Any `[ingest/*]` logs (especially `[ingest/pdf]`)

These logs include conversationId/strategyId/assetId/phase and are enough to diagnose.
