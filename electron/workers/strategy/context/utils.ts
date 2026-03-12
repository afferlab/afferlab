import { estimateTokens } from '../../../core/tokens/tokenizer'

export function measureTokens(text: string): number {
    return estimateTokens(text)
}
