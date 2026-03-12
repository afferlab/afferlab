import type { Database } from 'better-sqlite3'
import { DEFAULT_STRATEGY_KEY, DEFAULT_STRATEGY_VERSION } from '../../core/strategy/strategyScope'

export const TARGET_SCHEMA_VERSION = 1

const SCHEMA_SQL = ` 
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY, 
                name TEXT NOT NULL,
                description TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                 id TEXT PRIMARY KEY,
                 project_id TEXT,
                 title TEXT NOT NULL DEFAULT 'New conversation',
                 title_source TEXT NOT NULL DEFAULT 'default',
                 created_at INTEGER NOT NULL,
                 updated_at INTEGER NOT NULL,
                 model TEXT,
                 strategy_id TEXT,
                 strategy_key TEXT NOT NULL DEFAULT '${DEFAULT_STRATEGY_KEY}',
                 strategy_version TEXT NOT NULL DEFAULT '${DEFAULT_STRATEGY_VERSION}',
                 archived INTEGER NOT NULL DEFAULT 0,   -- 0/1
                 summary TEXT,
                 pinned INTEGER NOT NULL DEFAULT 0,   -- 0/1
                 FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS turns
            (
                id              TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                user_message_id TEXT NOT NULL,
                active_reply_id TEXT,
                tseq INTEGER, -- Auto-incrementing sequence number within the conversation
                status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'aborted', 'error')),
                stop_reason     TEXT, -- stop|length|safety|aborted|error|vendor_xxx
                idempotency_key TEXT, -- prevent duplication
                created_at      INTEGER NOT NULL,
                updated_at      INTEGER NOT NULL,
                started_at      INTEGER,
                ended_at        INTEGER,
                regen_count     INTEGER DEFAULT 0,
                version_count   INTEGER DEFAULT 0,
                FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
                FOREIGN KEY (user_message_id) REFERENCES messages (id) ON DELETE CASCADE,
                FOREIGN KEY (active_reply_id) REFERENCES messages (id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                turn_id TEXT,
                role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
                type TEXT NOT NULL DEFAULT 'text'
                    CHECK (type IN ('text','image','tool_call','tool_result','file','system_note','other')),
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','progress','completed','stopped','error')),
                model TEXT,
                content TEXT NOT NULL DEFAULT '',
                content_parts TEXT, -- JSON
                parent_id TEXT,
                finish_reason TEXT, -- stop|length|error...
                usage_tokens_prompt INTEGER,
                usage_tokens_completion INTEGER,
                latency_ms INTEGER,
                error_code TEXT,
                error_message TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                seq INTEGER,
                attempt_no INTEGER NOT NULL DEFAULT 1,  -- Generation attempt number
                reply_group_id TEXT,                    -- Group for one generation run (used for version switching)
                provider_message_id TEXT,               -- Raw id returned by the model provider
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE,
                FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE SET NULL
            );

            -- memory
            CREATE TABLE IF NOT EXISTS memory_items
            (
                id                     TEXT PRIMARY KEY,
                strategy_id            TEXT    NOT NULL,

                -- Retrieval / sharing boundary (who can see it and which pool it belongs to)
                scope_type             TEXT    NOT NULL CHECK (scope_type IN ('global', 'project', 'conversation')),
                scope_id               TEXT    NOT NULL,

                -- Optional lifecycle owner (falls back to scope-based management if omitted)
                owner_type             TEXT CHECK (owner_type IN ('global', 'project', 'conversation')),
                owner_id               TEXT,

                -- Provenance only (tracks origin but does not affect lifecycle)
                source_conversation_id TEXT,
                source_turn_id         TEXT,
                source_message_id      TEXT,

                -- Type and modality
                type                   TEXT    NOT NULL, -- For example "summary.L0", "pin.note", "pref.lang"
                modality               TEXT    NOT NULL CHECK (modality IN ('text', 'image', 'audio', 'video', 'file')),

                -- Searchable text representation (candidate for FTS/vector retrieval); long raw content goes into assets
                text_repr              TEXT,
                text_repr_model        TEXT,

                -- Used only for short plain-text cards; large objects should go through assets
                content                TEXT,
                size_tokens            INTEGER,

                tags                   TEXT,             -- JSON[]
                meta                   TEXT,             -- JSON
                content_hash           TEXT,             -- Dedupe / merge key

                priority               REAL,
                ttl_at                 INTEGER,

                pinned INTEGER NOT NULL DEFAULT 0,   -- Whether the item is pinned to memory cloud (0/1)

                -- Sync / device metadata (local-first)
                sync_version           INTEGER DEFAULT 1,
                device_id              TEXT,
                server_updated_at      INTEGER,

                created_at             INTEGER NOT NULL,
                updated_at             INTEGER NOT NULL,

                CHECK (meta IS NULL OR json_valid(meta)),
                CHECK (tags IS NULL OR json_valid(tags)),

                FOREIGN KEY (source_conversation_id) REFERENCES conversations (id) ON DELETE SET NULL,
                FOREIGN KEY (source_turn_id) REFERENCES turns (id) ON DELETE SET NULL,
                FOREIGN KEY (source_message_id) REFERENCES messages (id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_mem_pinned_scope
                ON memory_items(pinned, scope_type, scope_id, updated_at);

            -- Common indexes (retrieval, scheduling, cleanup)
            CREATE INDEX IF NOT EXISTS idx_mem_scope ON memory_items (scope_type, scope_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_mem_type ON memory_items (type, created_at);
            CREATE INDEX IF NOT EXISTS idx_mem_mod ON memory_items (modality, created_at);
            CREATE INDEX IF NOT EXISTS idx_mem_priority ON memory_items (priority DESC, created_at) WHERE priority IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_mem_ttl ON memory_items (ttl_at) WHERE ttl_at IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_mem_hash ON memory_items (content_hash) WHERE content_hash IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_mem_updated ON memory_items (updated_at DESC);


            CREATE TABLE IF NOT EXISTS asset_blobs
            (
                id         TEXT PRIMARY KEY,
                sha256     TEXT    NOT NULL UNIQUE,
                bytes      BLOB    NOT NULL,
                size       INTEGER NOT NULL,
                mime_type  TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_asset_blobs_created_at
                ON asset_blobs (created_at DESC);

            -- 2) Multimodal raw assets / slices
            CREATE TABLE IF NOT EXISTS memory_assets
            (
                id              TEXT PRIMARY KEY,
                memory_id       TEXT    NOT NULL REFERENCES memory_items (id) ON DELETE CASCADE,
                conversation_id TEXT    NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
                blob_id         TEXT REFERENCES asset_blobs (id) ON DELETE CASCADE,
                filename        TEXT,

                uri             TEXT    NOT NULL, -- Local relative path / S3 / GCS / blob, etc.
                storage_backend TEXT    NOT NULL CHECK (storage_backend IN ('local', 'file', 's3', 'gcs', 'blob')),
                mime_type       TEXT,
                sha256          TEXT,
                size_bytes      INTEGER,

                -- Structured positioning (page / time / spatial data)
                page_no         INTEGER,
                frame_ts_ms     INTEGER,
                time_start_ms   INTEGER,
                time_end_ms     INTEGER,
                width           INTEGER,
                height          INTEGER,
                duration_ms     INTEGER,

                -- Slice-level text representation (OCR / ASR / caption / excerpt)
                text_repr       TEXT,
                text_repr_model TEXT,

                meta            TEXT,
                created_at      INTEGER NOT NULL,

                CHECK (meta IS NULL OR json_valid(meta))
            );

            CREATE INDEX IF NOT EXISTS idx_asset_mem ON memory_assets (memory_id);
            CREATE INDEX IF NOT EXISTS idx_asset_page ON memory_assets (memory_id, page_no);
            CREATE INDEX IF NOT EXISTS idx_asset_blob_id ON memory_assets (blob_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_conv_blob
                ON memory_assets (conversation_id, blob_id)
                WHERE blob_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS provider_file_refs
            (
                id TEXT PRIMARY KEY,
                blob_id TEXT NOT NULL REFERENCES asset_blobs (id) ON DELETE CASCADE,
                provider_key TEXT NOT NULL,
                account_fingerprint TEXT NOT NULL,
                provider_file_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_file_unique
                ON provider_file_refs (provider_key, account_fingerprint, blob_id);

            CREATE TABLE IF NOT EXISTS local_provider_models
            (
                provider_id TEXT NOT NULL,
                model_id TEXT NOT NULL,
                model_json TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'remote' CHECK (source IN ('remote', 'custom')),
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (provider_id, model_id),
                CHECK (json_valid(model_json))
            );

            CREATE INDEX IF NOT EXISTS idx_local_provider_models_provider
                ON local_provider_models (provider_id, updated_at DESC);

            -- 2.5) Document chunks
            CREATE TABLE IF NOT EXISTS memory_chunks
            (
                id         TEXT PRIMARY KEY,
                asset_id   TEXT    NOT NULL REFERENCES memory_assets (id) ON DELETE CASCADE,
                conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
                strategy_key TEXT NOT NULL DEFAULT '${DEFAULT_STRATEGY_KEY}',
                strategy_version TEXT NOT NULL DEFAULT '${DEFAULT_STRATEGY_VERSION}',
                idx        INTEGER NOT NULL,
                text       TEXT    NOT NULL,
                hash       TEXT    NOT NULL,
                tokens     INTEGER,
                meta_json  TEXT,
                created_at INTEGER NOT NULL,

                CHECK (meta_json IS NULL OR json_valid(meta_json))
            );

            CREATE INDEX IF NOT EXISTS idx_mem_chunk_asset ON memory_chunks (asset_id, idx);
            CREATE INDEX IF NOT EXISTS idx_mem_chunk_hash  ON memory_chunks (hash);
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_mem_chunk_asset_hash ON memory_chunks (asset_id, hash, strategy_key, strategy_version);
            CREATE INDEX IF NOT EXISTS idx_mem_chunk_scope
                ON memory_chunks (conversation_id, strategy_key, strategy_version, asset_id);

            -- 2.6) Document chunk vectors
            CREATE TABLE IF NOT EXISTS memory_chunk_vectors
            (
                id                TEXT PRIMARY KEY,
                chunk_id          TEXT    NOT NULL REFERENCES memory_chunks (id) ON DELETE CASCADE,
                conversation_id   TEXT    NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
                strategy_key      TEXT    NOT NULL DEFAULT '${DEFAULT_STRATEGY_KEY}',
                strategy_version  TEXT    NOT NULL DEFAULT '${DEFAULT_STRATEGY_VERSION}',
                embedding_profile TEXT    NOT NULL,
                vector            BLOB    NOT NULL,
                dim               INTEGER NOT NULL,
                created_at        INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_mem_chunk_vec_chunk   ON memory_chunk_vectors (chunk_id);
            CREATE INDEX IF NOT EXISTS idx_mem_chunk_vec_profile ON memory_chunk_vectors (embedding_profile);
            CREATE INDEX IF NOT EXISTS idx_mem_chunk_vec_scope
                ON memory_chunk_vectors (conversation_id, strategy_key, strategy_version, chunk_id);


            -- 3) Multi-model, multi-granularity vectors (item-level coarse ranking + slice-level reranking)
            CREATE TABLE IF NOT EXISTS memory_vectors
            (
                id         TEXT PRIMARY KEY,
                memory_id  TEXT,             -- one of the two
                asset_id   TEXT,             -- one of the two
                conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
                strategy_key TEXT NOT NULL DEFAULT '${DEFAULT_STRATEGY_KEY}',
                strategy_version TEXT NOT NULL DEFAULT '${DEFAULT_STRATEGY_VERSION}',
                model      TEXT    NOT NULL, -- 'bge-base','e5-multi','clip-L/14',...
                modality   TEXT    NOT NULL CHECK (modality IN ('text', 'image', 'audio', 'video')),
                dim        INTEGER NOT NULL,
                vector     BLOB    NOT NULL,
                created_at INTEGER NOT NULL,

                CHECK (memory_id IS NOT NULL OR asset_id IS NOT NULL),
                FOREIGN KEY (memory_id) REFERENCES memory_items (id) ON DELETE CASCADE,
                FOREIGN KEY (asset_id) REFERENCES memory_assets (id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_vec_mem ON memory_vectors (memory_id);
            CREATE INDEX IF NOT EXISTS idx_vec_model ON memory_vectors (model, modality);
            CREATE INDEX IF NOT EXISTS idx_mem_vectors_scope
                ON memory_vectors (conversation_id, strategy_key, strategy_version, created_at);


            -- 4) Memory relationship graph (bookmark <-> source, summary <-> source, support/contradiction, ...)
            CREATE TABLE IF NOT EXISTS memory_links
            (
                id             TEXT PRIMARY KEY,
                from_memory_id TEXT    NOT NULL REFERENCES memory_items (id) ON DELETE CASCADE,
                to_memory_id   TEXT REFERENCES memory_items (id) ON DELETE CASCADE,
                to_asset_id    TEXT REFERENCES memory_assets (id) ON DELETE CASCADE,
                rel_type       TEXT    NOT NULL CHECK (rel_type IN
                                                       ('references', 'summarizes', 'expands', 'contradicts',
                                                        'supports')),
                weight         REAL DEFAULT 1.0,
                strategy_id    TEXT,
                ttl_at         INTEGER,
                created_at     INTEGER NOT NULL,

                CHECK (to_memory_id IS NOT NULL OR to_asset_id IS NOT NULL)
            );

            CREATE TABLE IF NOT EXISTS strategies (
                id         TEXT PRIMARY KEY,            -- unique ID (plugin package ID)
                key        TEXT NOT NULL,
                source     TEXT NOT NULL DEFAULT 'local',
                name       TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                entry_path TEXT NOT NULL DEFAULT '',
                version    TEXT NOT NULL DEFAULT '1',
                hash       TEXT NOT NULL,
                capabilities_json TEXT NOT NULL DEFAULT '{}',
                default_allowlist_json TEXT NOT NULL DEFAULT '[]',
                manifest_json TEXT NOT NULL DEFAULT '{}',
                enabled    INTEGER NOT NULL DEFAULT 1,  -- legacy
                config     TEXT,                        -- legacy JSON
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                
                CHECK (config IS NULL OR json_valid(config)),
                CHECK (manifest_json IS NULL OR json_valid(manifest_json)),
                CHECK (capabilities_json IS NULL OR json_valid(capabilities_json)),
                CHECK (default_allowlist_json IS NULL OR json_valid(default_allowlist_json)),
                UNIQUE(key, version, hash)
            );

            CREATE INDEX IF NOT EXISTS idx_strategies_enabled ON strategies(enabled);

            CREATE TABLE IF NOT EXISTS app_settings (
                id TEXT PRIMARY KEY CHECK (id = 'singleton'),
                active_model_id TEXT,
                active_strategy_id TEXT,
                last_used_model_id TEXT,
                theme_mode TEXT NOT NULL DEFAULT 'system',
                launch_behavior TEXT NOT NULL DEFAULT 'open_last',
                auto_scroll INTEGER NOT NULL DEFAULT 1,
                model_default_params TEXT NOT NULL DEFAULT '{}',
                strategy_prefs_json TEXT NOT NULL DEFAULT '{}',
                web_search_settings TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                CHECK (json_valid(model_default_params)),
                CHECK (json_valid(strategy_prefs_json)),
                CHECK (json_valid(web_search_settings))
            );

            CREATE TABLE IF NOT EXISTS model_overrides (
                model_id TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 1,
                params_json TEXT NOT NULL DEFAULT '{}',
                requirements_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                CHECK (json_valid(params_json)),
                CHECK (json_valid(requirements_json))
            );

            CREATE TABLE IF NOT EXISTS strategy_overrides (
                strategy_id TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 1,
                params_json TEXT NOT NULL DEFAULT '{}',
                allowlist_json TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                CHECK (json_valid(params_json)),
                CHECK (json_valid(allowlist_json))
            );

            CREATE TABLE IF NOT EXISTS tool_settings (
                tool_key TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 0,
                permissions_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                CHECK (json_valid(permissions_json))
            );

            CREATE TABLE IF NOT EXISTS tool_servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN ('stdio', 'http')),
                command TEXT,
                url TEXT,
                permissions_json TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                CHECK (permissions_json IS NULL OR json_valid(permissions_json))
            );

            CREATE INDEX IF NOT EXISTS idx_tool_servers_enabled ON tool_servers(enabled);

            CREATE TABLE IF NOT EXISTS conversation_strategy_sessions (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                strategy_key TEXT NOT NULL,
                strategy_version TEXT NOT NULL,
                started_at_ms INTEGER NOT NULL,
                ended_at_ms INTEGER,
                start_tseq INTEGER,
                end_tseq INTEGER,
                mode TEXT NOT NULL CHECK (mode IN ('no_replay', 'replay')),
                status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'cancelled', 'failed')),
                last_processed_tseq INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_conv_strategy_sessions_scope
                ON conversation_strategy_sessions (conversation_id, strategy_key, strategy_version, started_at_ms);

            CREATE TABLE IF NOT EXISTS strategy_sessions (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                strategy_id TEXT NOT NULL,
                started_tseq INTEGER NOT NULL,
                ended_tseq INTEGER,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_strategy_sessions_conv
                ON strategy_sessions (conversation_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_strategy_sessions_conv_strategy
                ON strategy_sessions (conversation_id, strategy_id);


            CREATE TABLE IF NOT EXISTS strategy_state (
                id         TEXT PRIMARY KEY,            -- suggested format: {strategy_id}:{scope_type}:{scope_id}:{key}
                strategy_id TEXT NOT NULL,
                scope_type TEXT NOT NULL CHECK (scope_type IN ('global','project','conversation','session')),
                scope_id   TEXT NOT NULL,
                key        TEXT NOT NULL,
                value      TEXT NOT NULL,               -- JSON
                data_type  TEXT DEFAULT 'json' CHECK (data_type IN ('json','string','number','boolean')),
                accessed_at INTEGER,
                access_count INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                
                FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE,
                UNIQUE(strategy_id, scope_type, scope_id, key),
                CHECK (json_valid(value) OR data_type <> 'json')
            );

            CREATE INDEX IF NOT EXISTS idx_strategy_state_scope
                ON strategy_state(strategy_id, scope_type, scope_id, updated_at);


            CREATE TABLE IF NOT EXISTS memory_events (
                id          TEXT PRIMARY KEY,
                event_type  TEXT NOT NULL,        -- 'memory.created','memory.updated','strategy.executed',...
                strategy_id TEXT,
                entity_type TEXT,                 -- 'memory_item','asset','conversation','project',...
                entity_id   TEXT,
                scope_type  TEXT,                 -- useful for filtering events at a specific scope
                scope_id    TEXT,
                result      TEXT,                 -- JSON: input/output summary, stats, decision rationale
                duration_ms INTEGER,
                status      TEXT DEFAULT 'success' CHECK (status IN ('success','error','timeout','skipped')),
                created_at  INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_me_by_strategy ON memory_events(strategy_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_me_by_scope    ON memory_events(scope_type, scope_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_me_by_entity   ON memory_events(entity_type, entity_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_me_by_type     ON memory_events(event_type, created_at);

            CREATE UNIQUE INDEX IF NOT EXISTS uniq_link_edge
                ON memory_links (from_memory_id, COALESCE(to_memory_id, '#'), COALESCE(to_asset_id, '#'), rel_type);
            CREATE INDEX IF NOT EXISTS idx_links_from ON memory_links (from_memory_id, rel_type);
            CREATE INDEX IF NOT EXISTS idx_links_to_m ON memory_links (to_memory_id, rel_type);

            -- Project deletion: remove owner-bound entries first; if no owner is set, clean up by scope=project
            CREATE TRIGGER IF NOT EXISTS trg_delete_project_mem
                AFTER DELETE ON projects
            BEGIN
                DELETE FROM memory_items
                WHERE (owner_type='project' AND owner_id = OLD.id)
                   OR (owner_type IS NULL AND scope_type='project' AND scope_id = OLD.id);
            END;

            -- Conversation deletion: same rule
            CREATE TRIGGER IF NOT EXISTS trg_delete_conversation_mem
                AFTER DELETE ON conversations
            BEGIN
                DELETE FROM memory_items
                WHERE (owner_type='conversation' AND owner_id = OLD.id)
                   OR (owner_type IS NULL AND scope_type='conversation' AND scope_id = OLD.id);
            END;

            -- Write validation trigger (prevents dangling owners)
            CREATE TRIGGER IF NOT EXISTS trg_items_owner_validate_insert
                BEFORE INSERT ON memory_items
                WHEN NEW.owner_type IS NOT NULL
            BEGIN
                SELECT CASE
                           WHEN NEW.owner_type='project' AND (SELECT COUNT(1) FROM projects WHERE id=NEW.owner_id)=0
                               THEN RAISE(ABORT, 'owner_id does not exist in projects')
                           WHEN NEW.owner_type='conversation' AND (SELECT COUNT(1) FROM conversations WHERE id=NEW.owner_id)=0
                               THEN RAISE(ABORT, 'owner_id does not exist in conversations')
                           WHEN NEW.owner_type='global' AND (NEW.owner_id IS NOT NULL AND NEW.owner_id<>'global')
                               THEN RAISE(ABORT, 'owner_id must be ''global'' when owner_type=global')
                           END;
            END;







            -- index
            CREATE INDEX IF NOT EXISTS idx_conversations_project   ON conversations(project_id);
            CREATE INDEX IF NOT EXISTS idx_turns_conv              ON turns(conversation_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_turns_conv_updated      ON turns(conversation_id, updated_at);
            CREATE INDEX IF NOT EXISTS idx_messages_conv_seq       ON messages(conversation_id, seq);
            CREATE INDEX IF NOT EXISTS idx_messages_conv_time      ON messages(conversation_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_messages_parent         ON messages(parent_id);
            CREATE INDEX IF NOT EXISTS idx_messages_group          ON messages(reply_group_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_messages_turn_role_time ON messages(turn_id, role, created_at);
            CREATE INDEX IF NOT EXISTS idx_messages_conv_role_time
                ON messages(conversation_id, role, created_at);
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_turn_attempt_asst
                ON messages(turn_id, attempt_no)
                WHERE role = 'assistant';
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_provider_msg_id
                ON messages(provider_message_id)
                WHERE provider_message_id IS NOT NULL;
            -- If turn-level idempotency is needed:
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_turns_idempotency
                ON turns(idempotency_key)
                WHERE idempotency_key IS NOT NULL;

            -- Helpful for ORDER BY tseq and truncation deletes by tseq
            CREATE INDEX IF NOT EXISTS idx_turns_conv_tseq ON turns(conversation_id, tseq);

            -- Ensure tseq is unique within each conversation
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_turns_conv_tseq ON turns(conversation_id, tseq);

            -- trigger
            -- Auto-assign seq on insert (increment within the same conversation)
            CREATE TRIGGER IF NOT EXISTS messages_seq_autoinc
                AFTER INSERT ON messages
                WHEN NEW.seq IS NULL
            BEGIN
                UPDATE messages
                SET seq = COALESCE((
                   SELECT MAX(m.seq) + 1 FROM messages m WHERE m.conversation_id = NEW.conversation_id
                ), 1)
                WHERE id = NEW.id;
            END;

            CREATE TRIGGER IF NOT EXISTS turns_tseq_autoinc
                AFTER INSERT ON turns
                WHEN NEW.tseq IS NULL
            BEGIN
                UPDATE turns
                SET tseq = COALESCE((
                    SELECT MAX(t.tseq) + 1
                    FROM turns t
                    WHERE t.conversation_id = NEW.conversation_id
                ), 1)
                WHERE id = NEW.id;
            END;

            -- Cascade updated_at after a new message is inserted
            CREATE TRIGGER IF NOT EXISTS messages_touch_turn
                AFTER INSERT ON messages
            BEGIN
                UPDATE turns SET updated_at = (strftime('%f','now')*1000) WHERE id = NEW.turn_id;
                UPDATE conversations SET updated_at = (strftime('%f','now')*1000) WHERE id = NEW.conversation_id;
            END;

            -- Cascade updated_at after message content/status changes
            CREATE TRIGGER IF NOT EXISTS messages_update_touch
                AFTER UPDATE OF content, status ON messages
            BEGIN
                UPDATE turns SET updated_at = (strftime('%f','now')*1000) WHERE id = NEW.turn_id;
                UPDATE conversations SET updated_at = (strftime('%f','now')*1000) WHERE id = NEW.conversation_id;
            END;

            -- A. turns.user_message_id must reference role='user'
            CREATE TRIGGER IF NOT EXISTS turns_user_message_must_be_userrole
                BEFORE INSERT ON turns
                FOR EACH ROW
            BEGIN
            SELECT CASE
                WHEN (SELECT role FROM messages WHERE id = NEW.user_message_id) <> 'user'
                   THEN RAISE(ABORT, 'turns.user_message_id must reference a user message')
                END;
            END;

            -- B. active_reply_id must belong to the same conversation
            CREATE TRIGGER IF NOT EXISTS turns_active_reply_same_conversation
                BEFORE UPDATE OF active_reply_id ON turns
                FOR EACH ROW
                WHEN NEW.active_reply_id IS NOT NULL
            BEGIN
            SELECT CASE
                WHEN (SELECT conversation_id FROM messages WHERE id = NEW.active_reply_id) <> NEW.conversation_id
                   THEN RAISE(ABORT, 'active_reply_id must belong to the same conversation')
                END;
            END;

            -- C. messages.turn_id must belong to the same conversation as message.conversation_id
            CREATE TRIGGER IF NOT EXISTS messages_turn_conversation_consistency
                BEFORE INSERT ON messages
                FOR EACH ROW
                WHEN NEW.turn_id IS NOT NULL
            BEGIN
            SELECT CASE
                WHEN (SELECT conversation_id FROM turns WHERE id = NEW.turn_id) <> NEW.conversation_id
                   THEN RAISE(ABORT, 'message.conversation_id must equal its turn.conversation_id')
                END;
            END;

            -- Validate turns.user_message_id on UPDATE as well
            CREATE TRIGGER IF NOT EXISTS turns_user_message_must_be_userrole_upd
                BEFORE UPDATE OF user_message_id ON turns
            BEGIN
            SELECT CASE
                WHEN (SELECT role FROM messages WHERE id = NEW.user_message_id) <> 'user'
                   THEN RAISE(ABORT, 'turns.user_message_id must reference a user message')
                END;
            END;

            -- Validate messages.turn_id on UPDATE as well
            CREATE TRIGGER IF NOT EXISTS messages_turn_conversation_consistency_upd
                BEFORE UPDATE OF turn_id, conversation_id ON messages
                WHEN NEW.turn_id IS NOT NULL
            BEGIN
            SELECT CASE
                WHEN (SELECT conversation_id FROM turns WHERE id = NEW.turn_id) <> NEW.conversation_id
                   THEN RAISE(ABORT, 'message.conversation_id must equal its turn.conversation_id')
                END;
            END;

            -- Fallback backfill for messages.turn_id
            CREATE TRIGGER IF NOT EXISTS turns_backfill_user_turn_id
                AFTER INSERT ON turns
            BEGIN
                UPDATE messages
                SET turn_id = NEW.id
                WHERE id = NEW.user_message_id
                  AND turn_id IS NULL;
            END;

            -- ========== UI view: primary chat stream ==========
            CREATE VIEW IF NOT EXISTS chat_items AS
            SELECT
                t.id                  AS turn_id,
                t.conversation_id     AS conversation_id,
                t.tseq                AS tseq,
                t.created_at          AS turn_created_at,
                t.updated_at          AS turn_updated_at,
                t.status              AS turn_status,
                t.stop_reason         AS stop_reason,

                um.id                 AS user_msg_id,
                um.content            AS user_text,
                um.content_parts      AS user_content_parts,
                um.created_at         AS user_time,

                am.id                 AS asst_msg_id,
                am.content            AS asst_text,
                am.content_parts      AS asst_content_parts,
                am.created_at         AS asst_time,
                am.model              AS asst_model
            FROM turns t
            JOIN messages AS um
                ON um.id = t.user_message_id
            LEFT JOIN messages AS am
                ON am.id = t.active_reply_id
            -- If soft-delete masking is introduced later, add: WHERE (am.deleted = 0 OR am.id IS NULL)
            ;

            -- ========== UI view: conversation list ==========
            CREATE VIEW IF NOT EXISTS convo_list AS
            SELECT
                c.id,
                c.project_id,
                c.title,
                c.updated_at,
                c.archived,
                c.pinned,
                c.model,
                -- Use the latest user message as the summary snippet (or NULL if none exists)
                (SELECT m.content FROM messages m
                WHERE m.conversation_id = c.id AND m.role = 'user'
                ORDER BY m.created_at DESC LIMIT 1) AS last_user_snippet
            FROM conversations c
            ;
        `

export function ensureSchema(instance: Database): void {
    const runInitSchema = instance.transaction(() => {
        instance.exec(SCHEMA_SQL)
    })
    runInitSchema()
}
