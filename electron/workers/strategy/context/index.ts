import crypto from 'node:crypto'
import type {
    LLMModelConfig,
    LoomaContext,
    LoomaMessage,
    Message,
    StrategyDevEvent,
} from '../../../../contracts'
import { hostClient } from '../hostClient'
import { createSlotsApi } from './slots'
import { createHistoryHelper } from './history'
import { measureTokens } from './utils'
import { createToolsApi } from './tools'
import { parseMessageContentParts } from '../../../../shared/chat/contentParts'
import { estimateTokensForMessages } from '../../../core/tokens/tokenizer'

type BuildContextInput = {
    conversationId: string
    turnId?: string
    model?: LLMModelConfig
    strategyId?: string
    configValues?: Record<string, unknown>
    message?: LoomaMessage | null
    dev?: {
        emit?: (event: Omit<StrategyDevEvent, 'conversationId' | 'strategyId' | 'timestamp'>) => void
    }
}

type WorkerDevEvent = Omit<StrategyDevEvent, 'conversationId' | 'strategyId' | 'timestamp'>
type SlotsDevEvent = Extract<WorkerDevEvent, { type: 'slots' }>

export async function buildContext(input: BuildContextInput): Promise<LoomaContext> {
    const conversationId = input.conversationId
    const turnId = input.turnId ?? ''
    const model = input.model
    const config = input.configValues ?? {}
    const historyMessages = conversationId
        ? ((await hostClient.getHistory({ conversationId, turnId: input.turnId })) as Message[]).map((message) => {
            const withContentParts = message as Message & { contentParts?: unknown }
            const parts = parseMessageContentParts(
                withContentParts.contentParts,
                typeof message.content === 'string' ? message.content : '',
            )
            return {
                ...message,
                parts,
            }
        })
        : []
    const inputPayload = conversationId && turnId
        ? await hostClient.getTurnUserInput({ conversationId, turnId })
        : { text: '' }
    const inputText = inputPayload.text
    const attachments = Array.isArray(inputPayload.attachments)
        ? inputPayload.attachments
        : []
    const devEmit = input.dev?.emit
    const maxInputTokens = Number(
        model?.limits?.maxContextTokens
        ?? model?.params?.maxContextTokens
        ?? model?.defaults?.maxContextTokens
        ?? 128_000
    )
    const maxOutputTokens = Number(
        model?.limits?.maxOutputTokens
        ?? model?.params?.maxOutputTokens
        ?? model?.defaults?.maxOutputTokens
        ?? 4096
    )
    const reservedTokens = 1024
    const remainingInputTokens = Math.max(0, maxInputTokens - reservedTokens)
    const slots = createSlotsApi({
        tokenBudget: remainingInputTokens,
        estimateMessages: (messages) => estimateTokensForMessages(messages),
        onUpdate: devEmit
            ? (entries) => devEmit({
                type: 'slots',
                data: { entries },
            } as SlotsDevEvent)
            : undefined,
    })

    const tools = createToolsApi({
        conversationId,
        turnId: input.turnId,
        model,
        strategyId: input.strategyId,
        devEmit,
    })

    const historyHelper = createHistoryHelper(historyMessages)

    return {
        input: {
            text: inputText,
            attachments,
            parts: inputPayload.parts,
        },
        history: historyHelper,
        message: input.message ?? null,
        config,
        budget: {
            maxInputTokens,
            maxOutputTokens,
            reservedTokens,
            remainingInputTokens,
        },
        capabilities: {
            vision: model?.capabilities?.vision ?? false,
            tools: model?.capabilities?.tools ?? false,
            structuredOutput: model?.capabilities?.json ?? false,
            nativeFiles: model?.capabilities?.nativeFiles === true,
            attachmentTransport: model?.capabilities?.attachmentTransport ?? 'none',
            supportedMimeTypes: model?.capabilities?.supportedMimeTypes ?? [],
            maxFileSizeMB: model?.capabilities?.maxFileSizeMB,
            maxFilesPerTurn: model?.capabilities?.maxFilesPerTurn,
        },
        model: {
            id: model?.id ?? 'unknown',
            provider: model?.provider ?? 'unknown',
        },
        slots,
        tools,
        utils: {
            measure: (text: string) => measureTokens(text),
            now: () => Date.now(),
            uuid: () => crypto.randomUUID(),
        },
    }
}
