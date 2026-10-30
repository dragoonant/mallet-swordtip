// Spearhead has no stratagems, Command Points or Command Re-rolls (PORT-0.4): every stratagem / reaction /
// re-roll window the bot could still see is simply declined. Exports keep the 42k names so old callers compile.
import type { Action, GameState, PendingDecision, PlayerId } from '../engine'

export const HOLD_CP_SCORE = 0

export function cpThreshold(): number { return Infinity }

export function stratagemScore(): number { return -Infinity }

/** Pass/decline always wins; anything else scores below it. */
export function scoreStratagemOrReaction(_state: GameState, _player: PlayerId, _pending: PendingDecision, action: Action): number {
  return action.type === 'pass' ? 1 : -1
}

export function commandRerollScore(_state: GameState, _player: PlayerId, _pending: PendingDecision, action: Action): number {
  return action.type === 'pass' || (action.type === 'chooseOption' && action.optionId !== 'reroll') ? 1 : -1
}
