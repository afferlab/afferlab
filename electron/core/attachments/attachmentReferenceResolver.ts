import type { TurnAttachment } from '../../../contracts/index'

type StorageLookup = (args: { conversationId: string; assetId: string }) => string | null
type StagingLookup = (assetId: string) => string | null

export type ResolvedAttachmentReference = {
    canonicalId: string
    storageKey: string | null
    triedIds: string[]
    stagingResolved: boolean
}

function toId(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function uniqIds(ids: Array<string | null | undefined>): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    for (const raw of ids) {
        const id = toId(raw)
        if (!id || seen.has(id)) continue
        seen.add(id)
        out.push(id)
    }
    return out
}

function resolveStorageForId(args: {
    id: string
    conversationId: string
    findStorageKeyByAssetId: StorageLookup
    resolveAttachmentStagingStorageKey: StagingLookup
}): { storageKey: string | null; stagingResolved: boolean } {
    if (args.id.startsWith('stage_')) {
        const staged = args.resolveAttachmentStagingStorageKey(args.id)
        if (staged) return { storageKey: staged, stagingResolved: true }
    }
    const fromDb = args.findStorageKeyByAssetId({
        conversationId: args.conversationId,
        assetId: args.id,
    })
    if (fromDb) return { storageKey: fromDb, stagingResolved: false }
    if (!args.id.startsWith('stage_')) {
        const stagedFallback = args.resolveAttachmentStagingStorageKey(args.id)
        if (stagedFallback) return { storageKey: stagedFallback, stagingResolved: true }
    }
    return { storageKey: null, stagingResolved: false }
}

export function resolveAttachmentReference(args: {
    conversationId: string
    attachment: TurnAttachment
    findStorageKeyByAssetId: StorageLookup
    resolveAttachmentStagingStorageKey: StagingLookup
}): ResolvedAttachmentReference {
    const canonicalId = toId(args.attachment.assetId)
        ?? toId(args.attachment.id)
        ?? toId(args.attachment.readDiagnostics?.assetId)
        ?? ''
    const storageKey = toId(args.attachment.storageKey) ?? toId(args.attachment.readDiagnostics?.storageKey)
    if (storageKey && canonicalId) {
        return {
            canonicalId,
            storageKey,
            triedIds: [],
            stagingResolved: false,
        }
    }

    const fallbackIds = uniqIds([
        canonicalId,
        args.attachment.id,
        args.attachment.assetId,
        args.attachment.readDiagnostics?.assetId,
    ])
    for (const id of fallbackIds) {
        const resolved = resolveStorageForId({
            id,
            conversationId: args.conversationId,
            findStorageKeyByAssetId: args.findStorageKeyByAssetId,
            resolveAttachmentStagingStorageKey: args.resolveAttachmentStagingStorageKey,
        })
        if (resolved.storageKey) {
            return {
                canonicalId: id,
                storageKey: resolved.storageKey,
                triedIds: fallbackIds,
                stagingResolved: resolved.stagingResolved,
            }
        }
    }

    return {
        canonicalId,
        storageKey: null,
        triedIds: fallbackIds,
        stagingResolved: false,
    }
}
