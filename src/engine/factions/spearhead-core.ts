// Core Spearhead abilities every army shares and no data file names. WP7/L1: Call for Reinforcements (SPH-12, CORE-6.16).
// The descriptor lives here (abilities.ts adds it to a player's candidates whenever one of their Reinforcements units is dead and
// not yet replaced), the behaviour is the `activate` block below, registered in code-hooks.ts as `spearheadCallForReinforcements`.
//
// Flow (abilities.ts runs the decisions): pick the dead unit (auto when there is only one) -> resolve builds a brand-new identical
// unit (state.spawnDestroyedUnitCopy: same warscroll and weapons, full strength, no effects, tokens or once-per-battle uses),
// links it (`replacementOf` / `replaced`) and queues a placement request. abilities.ts then asks where it goes (a handful of legal
// spots wholly in friendly territory, wholly within 6" of an edge, not in combat) and calls `placeReplacement` with the answer.
import type { RuntimeAbility } from '../types'
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { EngineContext } from '../modules'
import { keywordsOf, setModelPos, spawnDestroyedUnitCopy, unitModels, datasheetOf } from '../state'
import type { GameState, PlayerId, UnitId } from '../types'
import { announce } from './aos-common'
import { reinforcementFormation, reinforcementOptions, writePlaceRequest, type PlaceShape } from './aos-moves'

export const CFR_ID = 'core.ability.call-for-reinforcements'
export const CFR_CODE = 'spearheadCallForReinforcements'

export const CFR_ABILITY: RuntimeAbility = {
  id: CFR_ID,
  name: 'Call for Reinforcements',
  text: 'Once per turn in your movement phase, pick one of your destroyed Reinforcements units that has not been replaced. A fresh, identical unit is set up wholly in your territory, wholly within 6" of the battlefield edge and out of combat. A replacement cannot be replaced.',
  trigger: 'activated',
  timing: { kind: 'phase', phase: 'movement', whose: 'your' },
  limit: 'oncePerTurn',
  keywords: ['CORE'],
  code: CFR_CODE,
  source: 'core',
  bearerModelId: null,
}

// the descriptors abilities.ts knows without them being in state.abilities
export const SYNTHETIC_ABILITIES: Record<string, RuntimeAbility> = { [CFR_ID]: CFR_ABILITY }

// destroyed Reinforcements units of `player` that may still be called back (CORE-6.16: once each, replacements never)
export function replaceableUnits(state: GameState, player: PlayerId): UnitId[] {
  return Object.values(state.units)
    .filter((u) => u.player === player && u.location === 'destroyed' && !u.replaced && u.replacementOf === null && keywordsOf(state, u.id).includes('REINFORCEMENTS'))
    .map((u) => u.id)
}

// the snapshot models of a destroyed unit, one per original model in model order (positions are stale and irrelevant)
function snapshotModels(state: GameState, unitId: UnitId) {
  const byId = new Map<string, ReturnType<typeof unitModels>[number]>()
  for (const m of state.units[unitId]?.destroyedModels ?? []) byId.set(m.id, m)
  const idx = (id: string): number => Number(id.slice(id.lastIndexOf('#') + 1))
  return [...byId.values()].sort((a, b) => idx(a.id) - idx(b.id))
}

// is there room to set the replacement up somewhere right now?
export function replacementFits(state: GameState, player: PlayerId, unitId: UnitId): boolean {
  const models = snapshotModels(state, unitId)
  const range = datasheetOf(state, unitId).coherencyRange
  if (models.length === 0) return false
  const territoryCentres = reinforcementOptions(state, player, models, range, 1)
  return territoryCentres.length > 0
}

const hook: ActivatedAbilityHook = {
  canUse(state, _unitId, use) {
    const player = use.player ?? state.activePlayer
    if (state.phase !== 'movement' || state.activePlayer !== player) return false
    return replaceableUnits(state, player).some((id) => replacementFits(state, player, id))
  },
  // abilities.ts passes the player as a third argument (army abilities have no unit to read it from)
  targets: ((state: GameState, _unitId: UnitId | null, player?: PlayerId) =>
    replaceableUnits(state, player ?? state.activePlayer).filter((id) => replacementFits(state, player ?? state.activePlayer, id))) as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const s = ctx.state
    const orig = use.targetUnitIds[0]
    if (!orig || !s.units[orig] || s.units[orig].location !== 'destroyed') return
    const copy = spawnDestroyedUnitCopy(ctx, orig)
    copy.replacementOf = orig
    s.units[orig].replaced = true
    announce(ctx, use, copy.id, `Call for Reinforcements: a fresh ${copy.name} unit is on its way`)
    writePlaceRequest(s, { abilityId: use.abilityId, player: use.player, unitId: copy.id, replacementOf: orig })
  },
}

export const spearheadCallForReinforcements: EngineCodeHook = {
  name: CFR_CODE, kind: 'ability', hook: 'onAbilityDeclared', run: () => undefined, activate: hook,
}

// the replacement's placement options (called by abilities.ts when it raises the placement decision). `shape` (F12) comes from the
// pending PlaceRequest (aos-moves placeShapeOf): Endless Legions drops the edge band, Blessed by the Old Ones sets up anywhere
export function replacementOptions(state: GameState, unitId: UnitId, shape: PlaceShape = {}) {
  const u = state.units[unitId]
  if (!u) return []
  return reinforcementOptions(state, u.player, unitModels(state, unitId), datasheetOf(state, unitId).coherencyRange, 5, shape)
}

// set the replacement down at the spot an option id names; false when that spot is no longer legal
export function placeReplacement(ctx: EngineContext, unitId: UnitId, centre: { x: number; z: number }, shape: PlaceShape = {}): boolean {
  const s = ctx.state
  const u = s.units[unitId]
  if (!u) return false
  const placements = reinforcementFormation(s, u.player, unitModels(s, unitId), datasheetOf(s, unitId).coherencyRange, centre, shape)
  if (!placements) return false
  for (const p of placements) { const m = s.models[p.modelId]; if (m) setModelPos(m, p.pos, p.facing) }
  u.location = 'board'
  u.setUpTurn = { round: s.round, player: u.player }
  u.turn.arrivedThisTurn = true
  ctx.emit({ type: 'UnitDeployed', unitId, toReserves: false, player: u.player })
  ctx.emit({ type: 'UnitReplaced', unitId, replacementOf: u.replacementOf as UnitId, player: u.player })
  return true
}

// drop a replacement that found no room (nothing was spent but the ability use): the original may be called back again
export function discardReplacement(state: GameState, unitId: UnitId): void {
  const u = state.units[unitId]
  if (!u) return
  const orig = u.replacementOf
  for (const mid of u.models) delete state.models[mid]
  delete state.units[unitId]
  if (orig && state.units[orig]) state.units[orig].replaced = false
}
