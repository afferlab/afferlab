import type { StrategyDefinition } from './strategies'

export function defineStrategy<T extends StrategyDefinition>(strategy: T): T {
    return strategy
}
