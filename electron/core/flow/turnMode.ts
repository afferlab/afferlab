import type { TurnRunMode } from '../../../contracts/index'

export function shouldRunTurnEndForMode(mode?: TurnRunMode): boolean {
    return mode !== 'rewrite'
}
