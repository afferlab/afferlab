import type {
    StrategyConfigValues,
    StrategyHooks,
    StrategyMeta,
} from './strategies'

type HookName = keyof StrategyHooks<Record<string, unknown>>

type NestedOnlyInput = {
    [K in HookName]?: never
}

type FlatOnlyInput = {
    hooks?: never
}

type StrategyFlatInput<TSchema extends ReadonlyArray<unknown>> = {
    meta: StrategyMeta
    configSchema?: TSchema
} & StrategyHooks<StrategyConfigValues<TSchema>> & FlatOnlyInput

type StrategyNestedInput<TSchema extends ReadonlyArray<unknown>> = {
    meta: StrategyMeta
    configSchema?: TSchema
    hooks: StrategyHooks<StrategyConfigValues<TSchema>>
} & NestedOnlyInput

export function defineStrategy<
    const TSchema extends ReadonlyArray<unknown>,
    T extends StrategyFlatInput<TSchema> = StrategyFlatInput<TSchema>,
>(strategy: T & { configSchema: TSchema; hooks?: never }): T
export function defineStrategy<
    T extends StrategyFlatInput<[]> = StrategyFlatInput<[]>,
>(strategy: T & { hooks?: never }): T
export function defineStrategy<
    const TSchema extends ReadonlyArray<unknown>,
    T extends StrategyNestedInput<TSchema> = StrategyNestedInput<TSchema>,
>(strategy: T & { configSchema: TSchema; hooks: StrategyHooks<StrategyConfigValues<TSchema>> }): T
export function defineStrategy<
    T extends StrategyNestedInput<[]> = StrategyNestedInput<[]>,
>(strategy: T & { hooks: StrategyHooks<StrategyConfigValues<[]>> }): T
export function defineStrategy<T>(strategy: T): T {
    return strategy
}
