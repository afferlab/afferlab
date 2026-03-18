import type {
    StrategyConfigValues,
    StrategyHooks,
    StrategyMeta,
} from './strategies'

type StrategyFlatInput<TSchema extends ReadonlyArray<unknown>> = {
    meta: StrategyMeta
    configSchema?: TSchema
} & StrategyHooks<StrategyConfigValues<TSchema>>

type StrategyNestedInput<TSchema extends ReadonlyArray<unknown>> = {
    meta: StrategyMeta
    configSchema?: TSchema
    hooks: StrategyHooks<StrategyConfigValues<TSchema>>
}

export function defineStrategy<
    const TSchema extends ReadonlyArray<unknown>,
    T extends StrategyFlatInput<TSchema> = StrategyFlatInput<TSchema>,
>(strategy: T & { configSchema: TSchema }): T
export function defineStrategy<
    const TSchema extends ReadonlyArray<unknown>,
    T extends StrategyNestedInput<TSchema> = StrategyNestedInput<TSchema>,
>(strategy: T & { configSchema: TSchema }): T
export function defineStrategy<
    T extends StrategyFlatInput<[]> = StrategyFlatInput<[]>,
>(strategy: T): T
export function defineStrategy<
    T extends StrategyNestedInput<[]> = StrategyNestedInput<[]>,
>(strategy: T): T
export function defineStrategy<T>(strategy: T): T {
    return strategy
}
