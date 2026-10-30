// Ironjawz (Bigmob) code hooks: docs/spec/factions/ironjawz-bigmob.md (IJZ-*). WP7.
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/ironjawz/abilities.json uses. Activated
// abilities use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts, which rolls the declared roll first and only
// calls `resolve` on success); passive rules are declarative descriptors that a code hook gates. What each hook needs from data:
//
//  ironjawzNaturalDisaster (IJZ-3.1)  descriptor effect { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } }, scope self;
//        the gate adds "the unit's unmodified charge roll this turn was params.minUnmodified (8)+" (UnitTurnState.chargeRollUnmodified,
//        so Mega-bossy's +1 never counts) and the effect lasts for the rest of the turn because that field is reset each turn.
//  ironjawzMegaBossy (IJZ-4.4)        descriptor effect { modifyRoll: { roll: 'charge', value: 1 } }, scope { who: 'friendly', within: 12 };
//        the gate adds "the general charged this turn" and "the charging unit is wholly within params.range of the general".
//  ironjawzAmberbone (IJZ-4.1)        descriptor effect { when: { weaponType: 'melee' }, setStat: { stat: 'AP', value: -2 } }, scope bearer
//        (rend uses the 40k sign: AP = -Rend, see weapons.ts effectiveWeapon). Bare hook name, nothing to gate.
//  ironjawzGetStuckIn (IJZ-5.1.1)     activated, roll D6 2+; grants { melee +params.extraAttacks Attacks } until your next turn.
//  ironjawzShieldBash (IJZ-5.2.1)     activated; params targetRange / modelRange / successOn / mortalPerSuccess.
//  ironjawzYouMessin (IJZ-5.4.1)      denyContest, params maxHealth.
//  Trophy Skulls (setStat OC 5), Armour of Gork (feelNoPain 6) and Unleashed Rage (when unitCharged, fightsFirst) are plain descriptors.
//
//  ironjawzMightyDestroyers (IJZ-2.2)  army-wide, any hero phase, once per turn: pick a friendly unit not set up this turn; it may slide
//        up to params.distance (3") and may end in combat (a unit that starts in combat must end in combat). The slide itself is a
//        short list of engine-built destinations (aos-moves.ts) that abilities.ts asks as 'abilityMode' decisions.
//  ironjawzProperRuckus (IJZ-3.2)      regiment ability, once per battle. The data timing is a reaction, which the loop never offers
//        by itself: instead Mighty Destroyers gains a second mode, "A Proper Ruckus", while the player has this ability unspent, and
//        in that mode every friendly unit not set up this turn is offered the move in turn (the target first).
// 'Ere We Go!'s arrival has no code: the movement module reads its params (13-port-plan §1.2).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { Effect } from '../../data/types'
import type { GameState, PlayerId, Unit, UnitId } from '../types'
import { distance, EPS } from '../geometry'
import { announce, declaredRoll, enemiesInCombat, hasKeyword, inflictMortal, liveModels, onBoard, paramOf, paramsByCode, whollyWithinUnit } from './aos-common'
import { slideOptions, writeMoveQueue } from './aos-moves'

const noop = () => undefined

const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)


// ---------- IJZ-3.1 Natural Disaster ----------
const ironjawzNaturalDisaster: EngineCodeHook = {
  name: 'ironjawzNaturalDisaster', kind: 'ability', hook: 'onStatQuery', run: noop,
  gate: (_state, holder, entry) => (holder.turn.chargeRollUnmodified ?? 0) >= num(entry.params.minUnmodified, 8),
}

// ---------- IJZ-4.1 Amberbone Whetstone ----------
// bare name: the descriptor's setStat does the work (see the header)
const ironjawzAmberbone: EngineCodeHook = { name: 'ironjawzAmberbone', kind: 'ability', hook: 'onStatQuery', run: noop }

// ---------- IJZ-4.4 Mega-bossy ----------
// the holder is the general's unit; the charging unit comes with the onChargeRoll data
const ironjawzMegaBossy: EngineCodeHook = {
  name: 'ironjawzMegaBossy', kind: 'ability', hook: 'onChargeRoll', run: noop,
  gate(state, holder, entry, data) {
    if (!holder.turn.chargedThisTurn) return false
    const charging = data?.chargingUnitId as UnitId | undefined
    return !!charging && whollyWithinUnit(state, charging, holder.id, num(entry.params.range, 12))
  },
}

// ---------- IJZ-5.1.1 Get Stuck In, Ladz! ----------
const CODE_STUCK_IN = 'ironjawzGetStuckIn'

const stuckInTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(paramsByCode(state, src.id, CODE_STUCK_IN).range, 12)
  const out: UnitId[] = [src.id]
  for (const u of Object.values(state.units)) {
    if (u.id === src.id || u.player !== src.player || u.location !== 'board' || !hasKeyword(state, u.id, 'BRUTE')) continue
    if (whollyWithinUnit(state, u.id, src.id, range)) out.push(u.id)
  }
  return out
}

const stuckInActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => {
    const targets = stuckInTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: stuckInTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0] ?? use.unitId
    if (!target || !onBoard(ctx.state, target)) return
    const { passed, total } = declaredRoll(ctx, use, 2)
    if (!passed) { announce(ctx, use, target, `Get Stuck In, Ladz!: rolled ${total}, no effect`); return }
    const extra = num(paramOf(ctx.state, use.abilityId, 'extraAttacks', 1), 1)
    const effect: Effect = { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: extra } }
    ctx.services.effects.grant(ctx, target, effect, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn' })
    announce(ctx, use, target, `Get Stuck In, Ladz!: +${extra} Attacks on melee weapons until your next turn`)
  },
}
const ironjawzGetStuckIn: EngineCodeHook = { name: CODE_STUCK_IN, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: stuckInActivate }

// ---------- IJZ-5.2.1 Shield Bash ----------
const CODE_BASH = 'ironjawzShieldBash'

const bashTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(paramsByCode(state, src.id, CODE_BASH).targetRange, 1)
  const mine = liveModels(state, src.id)
  return Object.values(state.units)
    .filter((o) => o.player !== src.player && o.location === 'board' && mine.some((m) => liveModels(state, o.id).some((t) => distance(m, t) <= range + EPS)))
    .map((o) => o.id)
}

const bashActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => bashTargets(state, unitId).length > 0,
  targets: bashTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    const src = use.unitId
    if (!target || !src || !onBoard(ctx.state, target) || !onBoard(ctx.state, src)) return
    const modelRange = num(paramOf(ctx.state, use.abilityId, 'modelRange', 3), 3)
    const successOn = num(paramOf(ctx.state, use.abilityId, 'successOn', 6), 6)
    const perSuccess = num(paramOf(ctx.state, use.abilityId, 'mortalPerSuccess', 1), 1)
    const near = liveModels(ctx.state, src).filter((m) => liveModels(ctx.state, target).some((t) => distance(m, t) <= modelRange + EPS))
    if (near.length === 0) return
    // IJZ-E11: one die per model of this unit within the model range of the target, rolled at the declaration moment
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: near.length, mode: 'perDie', unitId: src, targetUnitId: target, commandRerollable: false })
    const hits = roll.final.filter((d) => d >= successOn).length
    announce(ctx, use, target, `Shield Bash: ${near.length} dice, ${hits} hit${hits === 1 ? '' : 's'}`)
    inflictMortal(ctx, use, target, hits * perSuccess)
  },
}
const ironjawzShieldBash: EngineCodeHook = { name: CODE_BASH, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: bashActivate }

// ---------- IJZ-5.4.1 You Messin'? ----------
// enemy units with a printed Health of 1 or 2 cannot contest objectives while in combat with the Brutes
const ironjawzYouMessin: EngineCodeHook = {
  name: 'ironjawzYouMessin', kind: 'ability', hook: 'onObjectiveControl', run: noop,
  denyContest(state, entry, unitId) {
    const holder = onBoard(state, entry.holderUnitId)
    const unit = state.units[unitId]
    if (!holder || !unit || unit.player === holder.player) return false
    if (state.datasheets[unit.datasheetId].stats.W > num(entry.params.maxHealth, 2)) return false
    return enemiesInCombat(state, holder.id).includes(unitId)
  },
}

// ---------- IJZ-2.2 Mighty Destroyers / IJZ-3.2 A Proper Ruckus ----------
const CODE_MD = 'ironjawzMightyDestroyers'
const CODE_RUCKUS = 'ironjawzProperRuckus'

// CORE-6.13: set up this turn (a reserve arrival, a replacement)
const setUpThisTurn = (state: GameState, u: Unit): boolean =>
  u.turn.arrivedThisTurn || (u.setUpTurn !== null && u.setUpTurn.round === state.round && u.setUpTurn.player === state.activePlayer)

const mdDistance = (state: GameState): number => num(Object.values(state.abilities).find((a) => a.code === CODE_MD)?.params?.distance, 3)

// friendly units on the table that were not set up this turn and have somewhere to go
const mdTargets = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units)
    .filter((u) => u.player === player && u.location === 'board' && !setUpThisTurn(state, u) && slideOptions(state, u.id, mdDistance(state)).length > 1)
    .map((u) => u.id)

const ruckusAbility = (state: GameState, player: PlayerId) => {
  const id = state.players[player].regimentAbilityId
  const ab = id ? state.abilities[id] : undefined
  return ab && ab.code === CODE_RUCKUS ? ab : null
}
// once per battle
const ruckusAvailable = (state: GameState, player: PlayerId): boolean => {
  const ab = ruckusAbility(state, player)
  return !!ab && !state.players[player].abilityUses.some((u) => u.abilityId === ab.id)
}

const mightyDestroyersActivate: ActivatedAbilityHook & { modesFor?(state: GameState, unitId: UnitId | null, player: PlayerId): { id: string; label: string }[] } = {
  canUse: (state, _unitId, use) => mdTargets(state, use.player ?? state.activePlayer).length > 0,
  targets: ((state: GameState, _unitId: UnitId | null, player?: PlayerId) => mdTargets(state, player ?? state.activePlayer)) as ActivatedAbilityHook['targets'],
  modesFor: (state, _unitId, player) => (ruckusAvailable(state, player)
    ? [{ id: 'single', label: 'Move just that unit' }, { id: 'ruckus', label: 'A Proper Ruckus: every unit may move (once per battle)' }]
    : []),
  resolve(ctx, use) {
    const s = ctx.state
    const first = use.targetUnitIds[0]
    if (!first || !onBoard(s, first)) return
    const queue: UnitId[] = [first]
    if (use.modeId === 'ruckus' && ruckusAvailable(s, use.player)) {
      const ab = ruckusAbility(s, use.player)!
      s.players[use.player].abilityUses.push({ abilityId: ab.id, unitId: null, round: s.round, turn: s.activePlayer, phase: s.phase })
      for (const u of Object.values(s.units)) if (u.player === use.player && u.location === 'board' && u.id !== first && !setUpThisTurn(s, u)) queue.push(u.id)
      announce(ctx, use, null, 'A Proper Ruckus: the whole warband gets to move')
    } else announce(ctx, use, first, 'Mighty Destroyers: the unit lurches forward')
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: mdDistance(s), queue })
  },
}
const ironjawzMightyDestroyers: EngineCodeHook = { name: CODE_MD, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: mightyDestroyersActivate }
// the data timing of A Proper Ruckus is a reaction to Mighty Destroyers; the loop never offers reactions, so this is only the marker
// Mighty Destroyers looks for (see ruckusAbility)
const ironjawzProperRuckus: EngineCodeHook = { name: CODE_RUCKUS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: { canUse: () => false, resolve: noop } }

export const ironjawzHooks: Record<string, EngineCodeHook> = {
  ironjawzNaturalDisaster, ironjawzAmberbone, ironjawzMegaBossy, ironjawzGetStuckIn, ironjawzShieldBash, ironjawzYouMessin,
  ironjawzMightyDestroyers, ironjawzProperRuckus,
}
