import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../../db';
import { IPC } from '../channels';
import { getAvailableModel } from '../../core/models/modelRegistry';
import { getAppSettings } from '../../engine/settings/services/settingsStore';
import { getStrategyOrFallback } from '../../core/strategy/strategyRegistry';
import { startStrategySession } from '../../core/strategy/strategySessionLedger';

export function registerConversationIPC() {
    ipcMain.handle(IPC.CREATE_CONVERSATION, async (_e, { model } = {}) => {
        const db = await getDB();
        const id = uuidv4();
        const now = Date.now();
        const title = 'New conversation';
        const appSettings = getAppSettings(db)
        const candidateId = model ?? appSettings.last_used_model_id ?? null
        const available = getAvailableModel(candidateId)
        const modelToUse = available?.id ?? null
        const resolvedStrategy = getStrategyOrFallback(db, {
            requestedStrategyId: appSettings.active_strategy_id,
        })
        const strategyId = resolvedStrategy.strategy.id
        const strategyKey = resolvedStrategy.strategy.key
        const strategyVersion = resolvedStrategy.strategy.version

        db.prepare(`
      INSERT INTO conversations (
        id, title, title_source, created_at, updated_at, model, strategy_id, strategy_key, strategy_version, archived, summary, pinned
      )
      VALUES (?, ?, 'default', ?, ?, ?, ?, ?, ?, 0, '', 0)
    `).run(id, title, now, now, modelToUse, strategyId, strategyKey, strategyVersion);

        startStrategySession(db, {
            conversationId: id,
            strategyId,
            startedTseq: 1,
        })

        return { id, title, created_at: now, title_source: 'default' };
    });

    ipcMain.handle(IPC.GET_ALL_CONVERSATIONS, async () => {
        const db = await getDB();
        return db.prepare(`
      SELECT id, title, title_source, created_at, updated_at, model, strategy_id, archived, summary, pinned
      FROM conversations
      ORDER BY updated_at DESC
    `).all();
    });

    ipcMain.handle(IPC.DELETE_CONVERSATION, async (_e, id: string) => {
        const db = await getDB();
        db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
    });

    ipcMain.handle(IPC.RESET_CONVERSATION_HISTORY, async (_e, conversationId: string) => {
        const db = await getDB();
        const now = Date.now();
        const resetTxn = db.transaction((convId: string, ts: number) => {
            db.prepare(`DELETE FROM messages WHERE conversation_id = ?`).run(convId);
            db.prepare(`DELETE FROM turns WHERE conversation_id = ?`).run(convId);

            db.prepare(`
                DELETE FROM strategy_state
                WHERE scope_type = 'session'
                  AND scope_id IN (SELECT id FROM strategy_sessions WHERE conversation_id = ?)
            `).run(convId);
            db.prepare(`DELETE FROM strategy_state WHERE scope_type = 'conversation' AND scope_id = ?`).run(convId);
            db.prepare(`DELETE FROM conversation_strategy_sessions WHERE conversation_id = ?`).run(convId);
            db.prepare(`DELETE FROM strategy_sessions WHERE conversation_id = ?`).run(convId);

            db.prepare(`DELETE FROM memory_chunk_vectors WHERE conversation_id = ?`).run(convId);
            db.prepare(`DELETE FROM memory_chunks WHERE conversation_id = ?`).run(convId);
            db.prepare(`DELETE FROM memory_vectors WHERE conversation_id = ?`).run(convId);
            db.prepare(`DELETE FROM memory_assets WHERE conversation_id = ?`).run(convId);
            db.prepare(`
                DELETE FROM memory_items
                WHERE (owner_type = 'conversation' AND owner_id = ?)
                   OR (owner_type IS NULL AND scope_type = 'conversation' AND scope_id = ?)
                   OR (scope_type = 'conversation' AND scope_id = ?)
            `).run(convId, convId, convId);
            db.prepare(`DELETE FROM memory_events WHERE scope_id = ? OR entity_id = ?`).run(convId, convId);

            db.prepare(`UPDATE conversations SET summary = '', updated_at = ? WHERE id = ?`).run(ts, convId);
        });
        resetTxn(conversationId, now);
        return { ok: true, updatedAt: now };
    });

    ipcMain.handle(IPC.RENAME_CONVERSATION, async (_e, id: string, title: string) => {
        const db = await getDB();
        db.prepare(`UPDATE conversations SET title = ?, title_source = 'user', updated_at = ? WHERE id = ?`)
            .run(title, Date.now(), id);
    });

    ipcMain.handle(IPC.UPDATE_CONVERSATION_MODEL, async (_e, id: string, model: string) => {
        const db = await getDB();
        db.prepare(`UPDATE conversations SET model = ? WHERE id = ?`)
            .run(model, id);
        db.prepare(`UPDATE app_settings SET last_used_model_id = ?, updated_at = ? WHERE id = 'singleton'`)
            .run(model, Date.now());
    });
}
