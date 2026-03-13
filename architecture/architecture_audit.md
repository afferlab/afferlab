# Backend Architecture Audit

Date: 2026-03-12

Scope:
- `electron/` only
- Static audit after the current backend restructuring round
- No renderer, `/types`, or DB schema changes included

Method:
- Inspected the live `electron/` directory layout
- Re-checked handler sizes, major orchestration files, and `engine/*` import directions
- Re-ran targeted validation on `electron/main.ts`, `electron/app/**`, `electron/engine/**`, `electron/workers/**`, `electron/ipc/**`, and `vite.config.ts`

## Executive Summary

Current verdict: the backend is now materially closer to a domain-first structure, but it is not fully collapsed into that model yet.

What is now true:
- `ipc/handlers/*` is the live IPC adapter layer
- `engine/*` is the main application/runtime layer for chat, settings, strategy, llm, and attachments
- `workers/strategy/*` now owns the strategy worker runtime
- `app/*` now exists and carries the Electron runtime bootstrap that used to live entirely in `main.ts`
- `infra/db/*` now owns the DB runtime files that were previously top-level under `electron/db`

What is still unfinished:
- `engine/*` still depends heavily on `core/*`, plus a few remaining legacy top-level runtime modules
- `StreamManager.ts` remains the primary orchestration hotspot
- `memoryCloud.ts` and `conversations.ts` are still not truly thin handlers
- Several old top-level directories still exist as real runtime homes or compatibility exits: `core/`, `llm/`, `strategies/`, `stream/`, `db/`
- Filtered `tsc --noEmit` still fails in the strategy worker/dev-worker typing surface

Assessment:
- Domain clarity: improved substantially
- Handler thinness: mostly there, not complete
- Dependency direction: improved, not clean yet
- OSS contributor readability: now workable
- Freeze readiness: acceptable for this round, but not final-platform clean

## Round Status

This restructuring round should be treated as complete.

Completed in this round:
- Introduced `app/*` and slimmed `electron/main.ts` down to a thin entrypoint
- Moved DB runtime files under `infra/db/*`
- Moved strategy worker runtime under `workers/strategy/*`
- Moved major runtime/application flows under `engine/*`
- Converted most IPC files into thin handlers
- Removed several `engine -> legacy` bridge imports that previously crossed into `ipc/`, `stream/`, and `strategies/*`

Not completed in this round:
- Full collapse of `core/*` into domain-owned `engine/*` modules
- Full elimination of compatibility re-export paths
- Worker protocol typing cleanup
- Thin-handler extraction for `memoryCloud.ts` and `conversations.ts`
- Further splitting of `StreamManager.ts` and other remaining hotspots

## Current Electron Hierarchy

Current backend directory layout:

```text
electron/
  app/
    bootstrap/
    main/
    theme/
  config/
  core/
    attachments/
    context/
    conversation/
    embeddings/
    flow/
    history/
    ingest/
    logging/
    memory/
    models/
    operations/
    settings/
    strategy/
    tokens/
    tools/
  db/
  engine/
    attachments/
    chat/
      application/
      streaming/
    llm/
    settings/
      application/
      importExport/
      services/
    strategy/
      application/
      dev/
      host/
    tools/
      services/
  infra/
    db/
  ipc/
    handlers/
  llm/
    adapters/
    providers/
  preload/
  strategies/
    builtin/
    dev/
    host/
    worker/
  stream/
  workers/
    strategy/
      context/
```

Important live entry points:
- `electron/main.ts`
- `electron/app/main/createMainWindow.ts`
- `electron/app/bootstrap/registerRuntime.ts`
- `electron/app/theme/nativeTheme.ts`
- `electron/ipc/index.ts`
- `electron/engine/chat/application/*`
- `electron/engine/chat/streaming/StreamManager.ts`
- `electron/engine/settings/application/settingsService.ts`
- `electron/engine/strategy/application/strategyService.ts`
- `electron/engine/strategy/dev/strategyDevService.ts`
- `electron/engine/strategy/host/createStrategyHost.ts`
- `electron/workers/strategy/strategyWorker.ts`

## 1. Current Backend Domain Split

The backend now has a usable primary structure:

`ipc handlers -> engine runtime/application layer -> core/infra/llm/workers`

Current domain ownership is:

| Area | Current role | Status |
| --- | --- | --- |
| `app/*` | Electron runtime bootstrap, window lifecycle, native theme wiring | good new host boundary |
| `ipc/handlers/*` | thin adapter layer for main-process APIs | mostly good |
| `engine/chat/application` | send, regenerate, rewrite use cases | good |
| `engine/chat/streaming` | stream orchestration, task registry, event publishing, prepared messages | good direction, still hotspot-heavy |
| `engine/attachments` | attachment preparation and transport-facing coordination | good standalone domain |
| `engine/llm` | LLM runner and tool loop | good bounded runtime area |
| `engine/settings/*` | settings service, settings store, import/export, effective config | coherent, but still mixed with persistence concerns |
| `engine/strategy/application` | strategy switching, prefs, replay control | good |
| `engine/strategy/dev` | dev compile/save/reload/open/remove flows | coherent but large |
| `engine/strategy/host` | host-side strategy runtime assembly and bridge logic | coherent, still infra-heavy |
| `engine/tools/services` | tool server bootstrap helpers | small but correctly grouped |
| `infra/db/*` | DB connection, schema, migrations, vector helpers | correct move |
| `workers/strategy/*` | strategy worker runtime and worker context helpers | correct move |
| `core/*` | remaining lower-level helpers and legacy runtime homes | still central |
| `llm/providers/*` | provider implementations | still legacy top-level runtime home |

Conclusion:
- The backend is no longer shaped like one monolithic Electron app repo.
- It now has a readable primary spine.
- The remaining weakness is not missing domains; it is that several domains still lean on `core/*` instead of owning more of their lower-level logic.
- `app/`, `engine/`, `infra/`, and `workers/` are now real runtime homes, not placeholder directories.

## 2. Orchestration Hotspots

Current major files by size:

| File | LOC | Assessment |
| --- | ---: | --- |
| `electron/engine/chat/streaming/StreamManager.ts` | 953 | main orchestration hotspot |
| `electron/engine/settings/services/settingsStore.ts` | 703 | persistence-heavy service hotspot |
| `electron/engine/llm/llmRunner.ts` | 702 | still a large bounded executor |
| `electron/engine/strategy/dev/strategyDevService.ts` | 535 | large but domain-localized |
| `electron/engine/strategy/host/createStrategyHost.ts` | 469 | assembly hotspot |
| `electron/engine/attachments/attachmentPreparationService.ts` | 455 | large but correctly centralized |

Verdict:
- Yes, orchestration hotspots still exist.
- The key difference from the original architecture is that hotspots are now easier to locate and reason about.
- The worst remaining hotspot is clearly `engine/chat/streaming/StreamManager.ts`.

Priority order if continuing:
1. `engine/chat/streaming/StreamManager.ts`
2. `engine/llm/llmRunner.ts`
3. `engine/strategy/host/createStrategyHost.ts`
4. `engine/attachments/attachmentPreparationService.ts`
5. `engine/settings/services/settingsStore.ts`

## 3. Are IPC Handlers All Thin?

Current handler sizes:

| File | LOC | Thin? | Notes |
| --- | ---: | --- | --- |
| `ipc/handlers/turns.ts` | 48 | yes | thin adapter |
| `ipc/handlers/strategy.ts` | 64 | yes | thin adapter |
| `ipc/handlers/strategyDev.ts` | 65 | yes | thin adapter |
| `ipc/handlers/settings.ts` | 93 | yes | thin adapter |
| `ipc/handlers/messages.ts` | 101 | mostly | still has a little host-side shaping logic |
| `ipc/handlers/models.ts` | 78 | mostly | small adapter layer |
| `ipc/handlers/tools.ts` | 93 | mostly | small adapter layer |
| `ipc/handlers/privacy.ts` | 63 | mostly | straightforward host actions |
| `ipc/handlers/webSearch.ts` | 85 | mostly | acceptable Electron adapter |
| `ipc/handlers/conversations.ts` | 104 | partial | still owns DB transaction/reset logic |
| `ipc/handlers/memoryCloud.ts` | 229 | no | still owns meaningful orchestration/business logic |
| `ipc/handlers/debug.ts` | 13 | yes | trivial |

Verdict:
- No, IPC is not fully thin.
- Most IPC is now thin enough.
- The two handlers that still clearly violate the target are:
  - `electron/ipc/handlers/memoryCloud.ts`
  - `electron/ipc/handlers/conversations.ts`

## 4. Does `engine/` Still Have Cross-Domain Imports?

Yes.

### `engine -> engine` imports

These are common and mostly reasonable:
- `engine/chat/* -> engine/attachments/*`
- `engine/chat/streaming/* -> engine/llm/*`
- `engine/strategy/host/* -> engine/llm/*`

These do not currently indicate a structural problem by themselves.

### `engine -> legacy/runtime layer` imports

These are still widespread and remain the main architectural debt.

Representative examples:
- `engine/chat/application/* -> core/models`, `core/history`, `core/turnWriter`, `core/strategy`, `strategies/executeTurn`
- `engine/chat/streaming/* -> core/models`, `core/conversation`, `core/attachments`, `core/logging`
- `engine/attachments/* -> core/attachments`, `core/memory`, `core/logging`
- `engine/settings/* -> core/models`, `core/strategy`, `core/tools`
- `engine/strategy/* -> core/strategy`, `core/models`, `core/memory`, `core/tokens`
- `engine/llm/* -> core/models`, `core/logging`
- `engine/chat/streaming/preparedMessages.ts -> llm/adapters/messageParts`

Important improvement since the previous audit:
- `engine/settings/application/settingsService.ts -> ipc/channels.ts` is gone
- `engine/chat/streaming/StreamManager.ts -> strategies/strategyHost` is gone
- `engine/strategy/host/* -> strategies/worker/*` is gone in favor of `workers/strategy/*`
- `engine/strategy/dev/* -> strategies/dev/*` is gone in favor of local `engine/strategy/dev/*`
- `engine/chat/streaming/preparedMessageService.ts -> stream/preparedMessages.ts` is gone

Verdict:
- `engine` is now the primary runtime layer.
- It is not yet a clean inward-only domain layer.
- The remaining debt is mostly `engine -> core/*`, plus a smaller amount of `engine -> llm/*`.

## 5. Are There Still Legacy Paths?

Yes.

There are two different categories left:

### Active legacy runtime homes

These still hold real runtime logic:
- `electron/core/*`
- `electron/llm/*`
- `electron/strategies/builtin/*`
- `electron/preload/*`

### Compatibility exits / transitional paths

These now mostly re-export or bridge to newer homes:
- `electron/db/* -> electron/infra/db/*`
- `electron/stream/preparedMessages.ts -> electron/engine/chat/streaming/preparedMessages.ts`
- `electron/strategies/dev/* -> engine/strategy/dev/*` or `workers/strategy/*`
- `electron/strategies/host/* -> engine/strategy/host/*`
- `electron/strategies/worker/* -> workers/strategy/*`
- `electron/core/settings/* -> engine/settings/*`
- `electron/core/tools/toolServers.ts -> engine/tools/services/toolServers.ts`

Verdict:
- File-level shims are still present in several places.
- That is acceptable for this round because they protect import stability while the new structure settles.
- The remaining legacy issue is no longer “missing new structure”; it is “old structure still owns too much real logic”.
- The next cleanup should be selective, not another broad move-only pass.

## Validation Snapshot

Validation run for this round:
- `npx eslint electron/main.ts electron/app/**/*.ts electron/engine/**/*.ts electron/workers/**/*.ts electron/ipc/**/*.ts vite.config.ts`

Result:
- Passed

Filtered type check:
- `npx tsc --noEmit | rg "electron/(main\\.ts|app/|engine/|workers/|ipc/)"`

Result:
- Still failing in the strategy worker/dev-worker type surface

Main failure clusters:
- `electron/engine/strategy/dev/devSandboxManager.ts`
- `electron/workers/strategy/WorkerManager.ts`
- `electron/workers/strategy/strategyWorker.ts`
- `electron/workers/strategy/strategyLoader.ts`
- `electron/workers/strategy/context/tools.ts`

Interpretation:
- This round did not introduce new lint failures in the restructured backend surface.
- The remaining type debt is concentrated in worker protocol/event typings, not in the app/engine directory reshuffle itself.

## Current Backend Verdict

Status as of 2026-03-12:

1. The backend now has a real `app + ipc + engine + infra + workers` spine.
2. `workers/strategy/*` and `infra/db/*` are now correctly visible as first-class runtime areas.
3. IPC is mostly thin, but not fully thin.
4. `engine` is the main runtime layer, but it still depends heavily on `core/*`.

## Blueprint Gaps Observed During Documentation Verification

The following points from `architecture/architecture.md` are not fully implemented in the current codebase and should be treated as future-looking rather than live behavior.

1. Worker ownership is not "one long-lived worker per enabled strategy".
   Current behavior is one worker runtime per active `conversationId`.

2. `onInit` is not triggered simply because a strategy is opened in the settings UI.
   It runs when the worker loads a strategy for runtime requests.

3. `ctx.budget` is not currently a user-configurable strategy budget surface.
   The host computes it from model limits/defaults and a fixed reserved-token value.

4. `ctx.slots` does not currently enforce `maxRatio` or `minRatio` even though those fields exist in the public types.
   The live implementation uses ordering, priority, trim behavior, and token-budget enforcement instead.

5. Strategy switch semantics do not currently present a `Rebuild / Hide / Later` decision UI.
   The host switches the strategy and schedules background reindexing directly.

6. The repository is not yet split into a separate stable strategy SDK package plus a separate strategies repository.
   Strategy types currently live inside this main repository.
5. The largest remaining structural hotspot is `engine/chat/streaming/StreamManager.ts`.
6. The largest remaining residual tech debt outside architecture shape is worker protocol typing.

Practical conclusion:
- This refactor round succeeded.
- The backend is now understandable for external contributors.
- The next refactor, if done, should focus on two narrow targets:
  1. Finish `memoryCloud` and `conversations` thin-handler extraction
  2. Split the remaining orchestration hotspots instead of doing another broad directory migration
