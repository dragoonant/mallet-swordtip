// Generic activated-ability service (13-engine-port-plan PORT-0.7, CORE-3.13). WP1 ships the interface and a no-op body;
// WP3 fills it in. One loop serves every "Your / Enemy / Any <phase>", Start / End of Turn, Start / End of Round and
// deployment ability: phase modules and the reducer call `runWindow(ctx, window, player)` and return 'pending' while it
// says a decision is open.
//
// Intended flow (WP3): `usable` lists (abilityId, unitId) pairs whose descriptor `timing` (data AbilityTiming) matches the
// window and whose limits allow it (descriptor `limit`, Rule of One CORE-3.3/3.4 via UnitTurnState.abilitiesUsedThisPhase /
// usedCoreThisPhase, `fromRound`) and whose code hook `activate.canUse` passes. `runWindow` raises chooseOption topic
// 'abilityUse' (one option per usable pair + pass) until the player passes; then 'abilityTarget' / 'abilityMode' when the
// hook declares targets / modes, the declared roll via ctx.rollOnce, then `activate.resolve(ctx, use)`. Uses are recorded
// in Player.abilityUses and announced with AbilityTriggered.
import type { DecisionHandler, EngineContext } from './modules'
import type { AbilityId, GameState, PlayerId, UnitId } from './types'

// where an activated ability may be used. Phase windows use the AoS names ('hero' = Phase 'command', 'fight' = Combat).
export type AbilityWindow =
  | 'hero' | 'movement' | 'shooting' | 'charge' | 'fight'
  | 'startOfTurn' | 'endOfTurn' | 'startOfRound' | 'endOfRound' | 'deployment'

export interface UsableAbility {
  abilityId: AbilityId
  // the unit using it; null for player-wide abilities (regiment ability, battle trait)
  unitId: UnitId | null
  label: string
}

export interface AbilityService {
  // activated abilities `player` may use right now in `window` (pure)
  usable(state: GameState, player: PlayerId, window: AbilityWindow): UsableAbility[]
  // offer `player` their usable abilities for this window occurrence until they pass. Re-entrant: call again after every
  // answered decision with the same arguments; `key` distinguishes occurrences inside one phase (default: the window).
  // Returns true when a decision is now pending (the caller returns 'pending' / stops), false when the window is done.
  runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, key?: string): boolean
  // answers chooseOption topics 'abilityUse' / 'abilityTarget' / 'abilityMode' (routed by DEFAULT_MODULES.topics)
  readonly handler: DecisionHandler
}

// WP1 stub: nothing is ever usable, so every window is skipped
export const abilityService: AbilityService = {
  usable: () => [],
  runWindow: () => false,
  handler: {
    handle: () => ({ code: 'E_NOT_AN_OPTION', reason: 'abilities: not implemented yet (WP3)' }),
  },
}
