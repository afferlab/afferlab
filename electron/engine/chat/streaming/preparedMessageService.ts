import { getDB } from '../../../db'
import { resolveModelConfig } from '../../../core/models/modelRegistry'
import { hydrateMessagePartsWithAssetData } from '../../../core/attachments/hydrateMessageParts'
import {
    attachProviderFileIdsToMessages,
    invalidateProviderFileRefsForMessages,
} from '../../../core/attachments/providerFileStore'
import { estimateMessageTokens } from '../../../core/attachments/attachmentTokenEstimator'
import { extractFileAttachmentsFromHistory, getMessageParts, hasFilePartsInHistory } from '../../../llm/adapters/messageParts'
import { buildPreparedMessagesForStream } from './preparedMessages'
import { validateAttachmentsByModelCapabilities } from '../../../core/attachments/validateAttachmentsBeforeSend'
import { log } from '../../../core/logging/runtimeLogger'

import type {
    LLMModelConfig,
    TurnAttachment,
    UIMessage,
} from '../../../../contracts/index'

type DB = ReturnType<typeof getDB>

export type PayloadSummary = {
    partsCount: number
    attachmentsCount: number
    estimatedTokens: number
    safetyMargin: number
}

export type HistoryScanSummary = {
    scannedCount: number
    retainedCount: number
    droppedCount: number
    droppedByReason: Record<string, number>
    droppedAssetIds: string[]
}

export type PreparedFileSummary = {
    totalFileParts: number
    bytesOkCount: number
    missingBytesCount: number
    assetIdsMissingBytes: string[]
}

export type PreparedMessageResult = {
    callMessages: UIMessage[]
    payloadSummary: PayloadSummary
    historyScan: HistoryScanSummary
    hasMessageFileParts: boolean
    requestAttachments: TurnAttachment[] | undefined
    requestInputText: string | undefined
    resolvedModelForFiles: ReturnType<typeof resolveModelConfig> | null
    preparedFileSummary?: PreparedFileSummary
}

function collectPayloadSummary(messages: UIMessage[]): PayloadSummary {
    let partsCount = 0
    let attachmentsCount = 0
    let estimatedTokens = 0
    let safetyMargin = 0
    for (const message of messages) {
        const parts = getMessageParts(message)
        partsCount += parts.length
        attachmentsCount += parts.filter((part) => part.type === 'file' || part.type === 'image').length
        const estimate = estimateMessageTokens(message)
        estimatedTokens += estimate.totalTokens
        safetyMargin += estimate.safetyMarginTokens
    }
    return { partsCount, attachmentsCount, estimatedTokens, safetyMargin }
}

function collectHistoryScanSummary(messages: UIMessage[]): HistoryScanSummary {
    let scannedCount = 0
    let retainedCount = 0
    let droppedCount = 0
    const droppedByReason: Record<string, number> = {}
    const droppedAssetIds: string[] = []
    for (const message of messages) {
        const parts = getMessageParts(message)
        for (const part of parts) {
            if (part.type !== 'file' && part.type !== 'image') continue
            scannedCount += 1
            const bytesLength = part.data?.byteLength ?? 0
            if (bytesLength > 0) {
                retainedCount += 1
                continue
            }
            droppedCount += 1
            const reason = part.storageKey
                ? 'missing_bytes_with_storage_key'
                : 'missing_bytes_and_storage_key'
            droppedByReason[reason] = (droppedByReason[reason] ?? 0) + 1
            if (typeof part.assetId === 'string' && part.assetId.trim().length > 0) {
                droppedAssetIds.push(part.assetId)
            }
        }
    }
    return {
        scannedCount,
        retainedCount,
        droppedCount,
        droppedByReason,
        droppedAssetIds,
    }
}

function logPreparedHistoryAttachmentParts(messages: UIMessage[], traceId?: string): void {
    if (process.env.DEBUG_ATTACHMENTS !== '1') return
    for (const message of messages) {
        const parts = getMessageParts(message)
        for (const part of parts) {
            if (part.type !== 'file' && part.type !== 'image') continue
            const bytesLength = part.data?.byteLength ?? 0
            log('debug', '[ATTACH][prepared_history_part]', {
                traceId: traceId ?? null,
                messageId: message.id,
                assetId: part.assetId ?? null,
                storageKey: part.storageKey ?? null,
                bytesLength,
            }, { debugFlag: 'DEBUG_ATTACHMENTS' })
        }
    }
}

export async function prepareMessagesForStream(args: {
    db: DB
    model: LLMModelConfig
    strategyMessages: UIMessage[]
    parentUserId: string
    conversationId: string
    inputText?: string
    attachments?: TurnAttachment[]
    traceId?: string
    signal?: AbortSignal
}): Promise<PreparedMessageResult> {
    const preparedMessages = buildPreparedMessagesForStream({
        strategyMessages: args.strategyMessages,
        parentUserId: args.parentUserId,
        conversationId: args.conversationId,
        inputText: args.inputText,
        attachments: args.attachments,
    })
    let callMessages = hydrateMessagePartsWithAssetData({
        db: args.db,
        conversationId: args.conversationId,
        messages: preparedMessages,
    })
    logPreparedHistoryAttachmentParts(callMessages, args.traceId)
    const payloadSummary = collectPayloadSummary(callMessages)
    const hasMessageFileParts = hasFilePartsInHistory(callMessages)
    let resolvedModelForFiles: ReturnType<typeof resolveModelConfig> | null = null
    const attachmentTransport = args.model.capabilities?.attachmentTransport ?? 'none'
    const shouldAttachProviderFileIds = hasMessageFileParts && attachmentTransport === 'remote_file_id'

    if (hasMessageFileParts) {
        validateAttachmentsByModelCapabilities({
            model: args.model,
            attachments: extractFileAttachmentsFromHistory(callMessages),
            origin: 'history',
            selectedModelId: args.model.id,
            selectedProviderId: args.model.provider,
        })
        if (shouldAttachProviderFileIds) {
            const resolvedModel = resolveModelConfig({ modelId: args.model.id })
            resolvedModelForFiles = resolvedModel
            callMessages = await attachProviderFileIdsToMessages({
                db: args.db,
                providerId: resolvedModel.providerId ?? args.model.provider,
                modelId: args.model.id,
                selectedModelId: args.model.id,
                selectedProviderId: args.model.provider,
                apiKey: resolvedModel.ctx.apiKey,
                baseUrl: resolvedModel.ctx.baseUrl ?? args.model.apiBase,
                messages: callMessages,
                signal: args.signal,
            })
            logPreparedHistoryAttachmentParts(callMessages, args.traceId)
        }
    }

    const requestAttachments = hasMessageFileParts ? undefined : args.attachments
    const requestInputText = hasMessageFileParts ? undefined : args.inputText
    const historyScan = collectHistoryScanSummary(callMessages)
    const preparedFileParts = hasMessageFileParts ? extractFileAttachmentsFromHistory(callMessages) : []

    return {
        callMessages,
        payloadSummary,
        historyScan,
        hasMessageFileParts,
        requestAttachments,
        requestInputText,
        resolvedModelForFiles,
        preparedFileSummary: hasMessageFileParts ? {
            totalFileParts: preparedFileParts.length,
            bytesOkCount: preparedFileParts.filter((part) => (part.data?.byteLength ?? 0) > 0).length,
            missingBytesCount: preparedFileParts.filter((part) => (part.data?.byteLength ?? 0) <= 0).length,
            assetIdsMissingBytes: preparedFileParts
                .filter((part) => (part.data?.byteLength ?? 0) <= 0)
                .map((part) => (typeof part.assetId === 'string' ? part.assetId : ''))
                .filter(Boolean),
        } : undefined,
    }
}

export async function refreshProviderFileRefs(args: {
    db: DB
    model: LLMModelConfig
    resolvedModelForFiles: NonNullable<PreparedMessageResult['resolvedModelForFiles']>
    messages: UIMessage[]
    signal?: AbortSignal
    traceId?: string
}): Promise<{
    callMessages: UIMessage[]
    invalidatedCount: number
    invalidatedShaCount: number
}> {
    const invalidated = await invalidateProviderFileRefsForMessages({
        db: args.db,
        providerId: args.resolvedModelForFiles.providerId ?? args.model.provider,
        apiKey: args.resolvedModelForFiles.ctx.apiKey,
        baseUrl: args.resolvedModelForFiles.ctx.baseUrl ?? args.model.apiBase,
        messages: args.messages,
        signal: args.signal,
    })
    const callMessages = await attachProviderFileIdsToMessages({
        db: args.db,
        providerId: args.resolvedModelForFiles.providerId ?? args.model.provider,
        modelId: args.model.id,
        selectedModelId: args.model.id,
        selectedProviderId: args.model.provider,
        apiKey: args.resolvedModelForFiles.ctx.apiKey,
        baseUrl: args.resolvedModelForFiles.ctx.baseUrl ?? args.model.apiBase,
        messages: args.messages,
        signal: args.signal,
    })
    logPreparedHistoryAttachmentParts(callMessages, args.traceId)
    return {
        callMessages,
        invalidatedCount: invalidated.invalidatedCount,
        invalidatedShaCount: invalidated.shaCount,
    }
}
