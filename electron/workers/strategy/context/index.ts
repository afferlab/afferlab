import type {
    LLMModelConfig,
    LoomaContext,
    LoomaMessage,
    Budget,
    Capabilities,
    Attachment,
    MessageContentPart,
    RuntimeMessage,
    StrategyDevEvent,
} from '../../../../contracts'
import { hostClient } from '../hostClient'
import { createSlotsApi } from './slots'
import { createHistoryHelper } from './history'
import { measure } from './utils'
import { createToolsApi } from './tools'
import { parseMessageContentParts } from '../../../../shared/chat/contentParts'
import { estimateTokensForMessages } from '../../../core/tokens/tokenizer'

function toAttachmentModality(args: { type: 'file' | 'image'; mimeType?: string }): Attachment['modality'] {
    if (args.type === 'image') return 'image'
    const mime = (args.mimeType || '').toLowerCase()
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.startsWith('video/')) return 'video'
    return 'document'
}

function isFilePart(part: MessageContentPart): part is Extract<MessageContentPart, { type: 'file' | 'image' }> {
    return part.type === 'file' || part.type === 'image'
}

type BuildContextInput = {
    conversationId: string
    turnId?: string
    model?: LLMModelConfig
    strategyId?: string
    configValues?: Record<string, unknown>
    budgetValues?: Budget
    capabilityValues?: Capabilities
    message?: LoomaMessage | null
    dev?: {
        emit?: (event: Omit<StrategyDevEvent, 'conversationId' | 'strategyId' | 'timestamp'>) => void
    }
}

type WorkerDevEvent = Omit<StrategyDevEvent, 'conversationId' | 'strategyId' | 'timestamp'>
type SlotsDevEvent = Extract<WorkerDevEvent, { type: 'slots' }>

function resolveBudget(input: BuildContextInput): Budget {
    const maxInputTokens = Number(
        input.model?.limits?.maxContextTokens
        ?? input.model?.params?.maxContextTokens
        ?? input.model?.defaults?.maxContextTokens
        ?? 128_000
    )
    const maxOutputTokens = Number(
        input.model?.params?.maxOutputTokens
        ?? input.model?.params?.maxTokens
        ?? input.model?.limits?.maxOutputTokens
        ?? input.model?.defaults?.maxOutputTokens
        ?? 4096
    )
    const fallbackReservedTokens = Math.min(
        maxInputTokens,
        Math.max(1024, maxOutputTokens + 1024),
    )
    const fallbackBudget: Budget = {
        maxInputTokens,
        maxOutputTokens,
        reservedTokens: fallbackReservedTokens,
        remainingInputTokens: Math.max(0, maxInputTokens - fallbackReservedTokens),
    }
    return input.budgetValues ?? fallbackBudget
}

function resolveCapabilities(input: BuildContextInput): Capabilities {
    return input.capabilityValues ?? {
        vision: input.model?.capabilities?.vision ?? false,
        structuredOutput: input.model?.capabilities?.json ?? false,
        tools: input.model?.capabilities?.tools ?? false,
    }
}

export async function buildContext(input: BuildContextInput): Promise<LoomaContext> {
    const conversationId = input.conversationId
    const turnId = input.turnId ?? ''
    const model = input.model
    const config = input.configValues ?? {}
    const historyMessages = conversationId
        ? ((await hostClient.getHistory({ conversationId, turnId: input.turnId })) as RuntimeMessage[]).map((message) => {
            const withContentParts = message as RuntimeMessage & { contentParts?: unknown }
            const parts = parseMessageContentParts(
                withContentParts.contentParts,
                typeof message.content === 'string' ? message.content : '',
            )
            const attachments = parts
                .filter(isFilePart)
                .map((part) => ({
                    id: part.assetId,
                    name: part.name,
                    size: part.size,
                    modality: toAttachmentModality({ type: part.type, mimeType: part.mimeType }),
                    mimeType: part.mimeType,
                }))
            return {
                ...message,
                attachments,
                parts,
            }
        })
        : []
    const inputPayload = conversationId && turnId
        ? await hostClient.getTurnUserInput({ conversationId, turnId })
        : { text: '', attachments: [] }
    const inputText = inputPayload.text
    const attachments = Array.isArray(inputPayload.attachments)
        ? inputPayload.attachments
        : []
    const devEmit = input.dev?.emit
    const budget = Object.freeze({ ...resolveBudget(input) }) as Budget
    const capabilities = Object.freeze({ ...resolveCapabilities(input) }) as Capabilities
    const slots = createSlotsApi({
        tokenBudget: budget.remainingInputTokens,
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
    const llm = tools.llm
    const state = tools.state
    const memory = tools.memory

    const historyHelper = createHistoryHelper(historyMessages)

    return {
        input: {
            text: inputText,
            attachments,
        },
        history: historyHelper,
        message: input.message ?? null,
        config,
        budget,
        capabilities,
        slots,
        llm,
        state,
        memory,
        tools,
        utils: {
            measure,
            now: () => Date.now(),
        },
    }
}
