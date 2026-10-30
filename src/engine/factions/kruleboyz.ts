// Kruleboyz (Swampskulka Gang) code hooks: docs/spec/factions/kruleboyz.md (KRU-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/kruleboyz/abilities.json uses. Activated
// abilities use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts); passive rules are declarative descriptors that a
// code hook gates or answers. What each hook needs from data:
//
//  kruleboyzWaaagh (BT-1)          army ability, any combat phase, oncePerBattle, params.army / params.range. Needs the general on the
//        table; the target is another friendly unit wholly within params.range of it. Grants { fightsFirst } to both until the end
//        of the phase (fight.ts reads it as Strike-first). Offered at the start of either player's combat phase.
//  kruleboyzCoveredInMud (RA-1)    regiment ability, startOfRound, oncePerBattle, params.round / params.hiddenBeyond. Any friendly unit;
//        grants { hiddenBeyond } for the battle (los.ts: enemy models further away than that cannot see the unit).
//  Noisy Racket (RA-2), Skewered (AB-2) are plain descriptors (a round gate and a weapon / target-keyword condition).
//  kruleboyzKunninPlan (ENH-1)     hero phase, oncePerTurn; target = a friendly unit wholly within params.range of the bearer (the bearer
//        counts). Grants { noRetreatDamage, shootAfterFallBack, chargeAfterFallBack } until the end of the turn.
//  kruleboyzMorksEyePebble (ENH-2) enemy movement phase, oncePerBattle; grants Ward (params.ward) on the bearer as an aura (friendly, within
//        params.range, wholly) that only counts in the shooting phase and lasts until the end of the turn: the range is read at every ward roll.
//  kruleboyzEgomaniak (ENH-3)      passive; redirectDamage answers for the bearer's unit with the other friendly units within params.range
//        and params.succeedOn (attack.ts resolvePool rolls the dice and moves the points).
//  kruleboyzEyeBiterAsh (ENH-4)    any combat phase, oncePerBattle; target = an enemy unit in combat with the bearer. The hook rolls the D6:
//        below params.battleOn the -1 to hit ends with the phase, otherwise it lasts the battle.
//  kruleboyzAllPartOfDaPlan (AB-1) hero phase; target = another friendly unit wholly within params.range; { modifyStat OC +params.control }
//        until the start of the owner's next turn.
//  kruleboyzBreathOfTheMireDrakes (AB-3)  any combat phase, only while in combat; one D6 per enemy unit in combat (1 nothing, 2-5 one mortal
//        damage, 6 D3).
//  kruleboyzScareTaktikz (AB-4)    any combat phase; abilities.ts rolls the descriptor's D6 3+ and calls resolve on success; grants the holder a
//        'against non-Hero attackers' -1 to hit (scope attacker flips the side) until the end of the phase. Only offered while in combat.
//  kruleboyzPickEmOff (AB-5)       descriptor { ranged, hit +1 }; the gate closes once the unit has used a Move ability this turn.
//
//  AI hints: kruleboyzAbilityTiming / kruleboyzTargetBonus below are read by src/ai/utility.ts (abilityTiming / abilityTargetBonus).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { Effect } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { EPS } from '../geometry'
import { rollSum } from '../dice'
import {
  announce, enemiesInCombat, inCombat, inflictMortal, liveModels, liveObjectives, onBoard, paramOf, paramsByCode, unitContestsObjective, unitGap, unitsWithin, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}
const unitsOf = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()

const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}

// ---------- KRU-BT-1 Kruleboyz Waaagh! ----------
const CODE_WAAAGH = 'kruleboyzWaaagh'

const waaaghRange = (state: GameState, player: PlayerId): number => {
  const id = Object.values(state.abilities).find((a) => a.code === CODE_WAAAGH && state.players[player]?.battleTraitIds.includes(a.id))?.id
  return id ? num(paramOf(state, id, 'range', 12), 12) : 12
}

// other friendly units wholly within range of the general
const waaaghTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] => {
  const p = player ?? state.activePlayer
  const general = generalOf(state, p)
  if (!general) return []
  const range = waaaghRange(state, p)
  return unitsOf(state, p).filter((id) => id !== general && whollyWithinUnit(state, id, general, range))
}

const waaaghActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => pickedOk(waaaghTargets(state, null, use.player), use),
  targets: waaaghTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    const general = generalOf(ctx.state, use.player)
    if (!target || !general || !onBoard(ctx.state, target)) return
    for (const id of [general, target]) {
      ctx.services.effects.grant(ctx, id, { fightsFirst: true }, { sourceAbilityId: use.abilityId, sourceUnitId: general, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    }
    announce(ctx, use, target, `Kruleboyz Waaagh!: ${ctx.state.units[general].name} and ${ctx.state.units[target].name} have Strike-first this phase`)
  },
}
const kruleboyzWaaagh: EngineCodeHook = { name: CODE_WAAAGH, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: waaaghActivate }

// ---------- KRU-RA-1 Covered in Mud ----------
const mudTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] => unitsOf(state, player ?? state.activePlayer)

const mudActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => state.round === num(paramOf(state, use.abilityId ?? '', 'round', 1), 1) && pickedOk(mudTargets(state, null, use.player), use),
  targets: mudTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const range = num(paramOf(ctx.state, use.abilityId, 'hiddenBeyond', 12), 12)
    ctx.services.effects.grant(ctx, target, { hiddenBeyond: range }, { sourceAbilityId: use.abilityId, sourceUnitId: null, scope: { who: 'self' }, duration: 'battle' })
    announce(ctx, use, target, `Covered in Mud: enemy models more than ${range}" away can no longer see ${ctx.state.units[target].name}`)
  },
}
const kruleboyzCoveredInMud: EngineCodeHook = { name: 'kruleboyzCoveredInMud', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: mudActivate }

// ---------- KRU-ENH-1 Kunnin' Plan ----------
const CODE_KUNNIN = 'kruleboyzKunninPlan'

// friendly units wholly within range of the bearer; the bearer itself counts ("a friendly unit wholly within 12" of the general")
const kunninTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(paramsByCode(state, src.id, CODE_KUNNIN).range, 12)
  return unitsOf(state, src.player).filter((id) => id === src.id || whollyWithinUnit(state, id, src.id, range))
}

const kunninActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(kunninTargets(state, unitId), use),
  targets: kunninTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    // all three only matter if the unit really retreats this turn
    const effects: Effect[] = [{ noRetreatDamage: true }, { shootAfterFallBack: true }, { chargeAfterFallBack: true }]
    ctx.services.effects.grant(ctx, target, effects, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, "Kunnin' Plan: a retreat this turn costs no mortal damage, and the unit can still shoot and charge")
  },
}
const kruleboyzKunninPlan: EngineCodeHook = { name: CODE_KUNNIN, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: kunninActivate }

// ---------- KRU-ENH-2 Mork's Eye Pebble ----------
const pebbleActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId),
  resolve(ctx, use) {
    const src = onBoard(ctx.state, use.unitId)
    if (!src) return
    const ward = num(paramOf(ctx.state, use.abilityId, 'ward', 5), 5)
    const range = num(paramOf(ctx.state, use.abilityId, 'range', 12), 12)
    // an aura on the bearer's unit: it travels with the general and is checked at every ward roll, but only in the shooting phase
    ctx.services.effects.grant(ctx, src.id, { when: { phase: 'shooting' }, feelNoPain: ward }, { sourceAbilityId: use.abilityId, sourceUnitId: src.id, scope: { who: 'friendly', within: range, wholly: true }, duration: 'untilEndOfTurn' })
    announce(ctx, use, null, `Mork's Eye Pebble: in the coming shooting phase friendly units wholly within ${range}" of the general have Ward (${ward}+)`)
  },
}
const kruleboyzMorksEyePebble: EngineCodeHook = { name: 'kruleboyzMorksEyePebble', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: pebbleActivate }

// ---------- KRU-ENH-3 Egomaniak ----------
// attack.ts resolvePool asks this after the ward rolls; only the bearer's own unit is protected
const kruleboyzEgomaniak: EngineCodeHook = {
  name: 'kruleboyzEgomaniak', kind: 'ability', hook: 'onStatQuery', run: noop,
  redirectDamage(state, entry, unitId) {
    if (entry.holderUnitId !== unitId || !onBoard(state, unitId)) return null
    const range = num(entry.params.range, 3)
    const player = state.units[unitId].player
    const candidates = unitsOf(state, player).filter((id) => id !== unitId && unitsWithin(state, unitId, id, range))
    return candidates.length > 0 ? { candidates, succeedOn: num(entry.params.succeedOn, 4) } : null
  },
}

// ---------- KRU-ENH-4 Eye-biter Ash ----------
const eyeTargets = (state: GameState, unitId: UnitId | null): UnitId[] => (onBoard(state, unitId) ? enemiesInCombat(state, unitId as UnitId).sort() : [])

const eyeActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(eyeTargets(state, unitId), use),
  targets: eyeTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const need = num(paramOf(ctx.state, use.abilityId, 'battleOn', 5), 5)
    const roll = rollSum(ctx.roll({ purpose: 'ability', player: use.player, unitId: use.unitId, targetUnitId: target, commandRerollable: false }))
    const forBattle = roll >= need
    // the effect sits on the enemy unit, so it outlives the general
    ctx.services.effects.grant(ctx, target, { modifyRoll: { roll: 'hit', value: -1 } }, {
      sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: forBattle ? 'battle' : 'untilEndOfPhase',
    })
    announce(ctx, use, target, `Eye-biter Ash: rolled ${roll}, ${ctx.state.units[target].name} gets -1 to hit ${forBattle ? 'for the rest of the battle' : 'for the rest of the phase'}`)
  },
}
const kruleboyzEyeBiterAsh: EngineCodeHook = { name: 'kruleboyzEyeBiterAsh', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: eyeActivate }

// ---------- KRU-AB-1 All Part of Da Plan ----------
const CODE_PLAN = 'kruleboyzAllPartOfDaPlan'

const planTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(paramsByCode(state, src.id, CODE_PLAN).range, 9)
  // "another friendly unit": the Killaboss cannot pick itself
  return unitsOf(state, src.player).filter((id) => id !== src.id && whollyWithinUnit(state, id, src.id, range))
}

const planActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(planTargets(state, unitId), use),
  targets: planTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const control = num(paramOf(ctx.state, use.abilityId, 'control', 3), 3)
    ctx.services.effects.grant(ctx, target, { modifyStat: { stat: 'OC', value: control } }, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn' })
    announce(ctx, use, target, `All Part of Da Plan: +${control} Control until the start of your next turn`)
  },
}
const kruleboyzAllPartOfDaPlan: EngineCodeHook = { name: CODE_PLAN, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: planActivate }

// ---------- KRU-AB-3 Breath of the Mire-drakes ----------
const breathActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId) && inCombat(state, unitId as UnitId),
  resolve(ctx, use) {
    const src = onBoard(ctx.state, use.unitId)
    if (!src) return
    // one die per enemy unit in combat, in unit id order; a unit wiped out by an earlier die does not change the others
    for (const enemy of enemiesInCombat(ctx.state, src.id).sort()) {
      const roll = rollSum(ctx.roll({ purpose: 'ability', player: use.player, unitId: src.id, targetUnitId: enemy, commandRerollable: false }))
      if (roll <= 1) { announce(ctx, use, enemy, `Breath of the Mire-drakes: rolled ${roll}, the fumes do nothing to ${ctx.state.units[enemy].name}`); continue }
      const dmg = roll >= 6 ? ctx.rollExpr('D3', { purpose: 'ability', player: use.player, unitId: src.id, targetUnitId: enemy, commandRerollable: false }).total : 1
      announce(ctx, use, enemy, `Breath of the Mire-drakes: rolled ${roll}, ${ctx.state.units[enemy].name} suffers ${dmg} mortal damage`)
      inflictMortal(ctx, use, enemy, dmg)
    }
  },
}
const kruleboyzBreathOfTheMireDrakes: EngineCodeHook = { name: 'kruleboyzBreathOfTheMireDrakes', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: breathActivate }

// ---------- KRU-AB-4 Scare Taktikz ----------
const scareActivate: ActivatedAbilityHook = {
  // attacks can only come from units in combat with this one, so a unit out of combat has nothing to scare
  canUse: (state, unitId) => !!onBoard(state, unitId) && inCombat(state, unitId as UnitId),
  resolve(ctx, use) {
    const src = onBoard(ctx.state, use.unitId)
    if (!src) return
    // scope 'attacker' flips the side: the holder is the unit being attacked, the modified roll is the attacker's
    const effect: Effect = { modifyRoll: { roll: 'hit', value: -1 }, when: { attackerNotKeyword: 'HERO' } }
    ctx.services.effects.grant(ctx, src.id, effect, { sourceAbilityId: use.abilityId, sourceUnitId: src.id, scope: { who: 'attacker' }, duration: 'untilEndOfPhase' })
    announce(ctx, use, null, `Scare Taktikz: attacks by non-Heroes against ${src.name} get -1 to hit this phase`)
  },
}
const kruleboyzScareTaktikz: EngineCodeHook = { name: 'kruleboyzScareTaktikz', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: scareActivate }

// ---------- KRU-AB-5 Pick 'Em Off ----------
// +1 to hit for shooting unless the unit has used a Move ability this turn (normal move, run, retreat, charge). UnitTurnState.moveType is
// null when never asked (the opponent's turn), which counts as standing still.
const kruleboyzPickEmOff: EngineCodeHook = {
  name: 'kruleboyzPickEmOff', kind: 'ability', hook: 'onStatQuery', run: noop,
  gate(_state, holder) {
    const t = holder.turn
    return !(t.moveType === 'normal' || t.moveType === 'advance' || t.moveType === 'fallBack' || t.chargedThisTurn)
  },
}

export const kruleboyzHooks: Record<string, EngineCodeHook> = {
  kruleboyzWaaagh, kruleboyzCoveredInMud, kruleboyzKunninPlan, kruleboyzMorksEyePebble, kruleboyzEgomaniak, kruleboyzEyeBiterAsh,
  kruleboyzAllPartOfDaPlan, kruleboyzBreathOfTheMireDrakes, kruleboyzScareTaktikz, kruleboyzPickEmOff,
}

// ---------------------------------------------------------------------------------------------------------------------------
// AI hints (src/ai/utility.ts calls these; null = no opinion). abilityTiming: added to the "use it" score of an offered ability, a
// value of -3 or less makes the bot pass. targetBonus: added to the score of one candidate target.
// ---------------------------------------------------------------------------------------------------------------------------
const meleeAttacks = (state: GameState, unitId: UnitId): number => {
  let total = 0
  for (const m of liveModels(state, unitId)) {
    for (const wid of m.weapons) {
      const w = state.weapons[wid]
      if (w && w.kind === 'melee') total += typeof w.A === 'number' ? w.A : 3.5
    }
  }
  return total
}

// the longest ranged weapon a unit carries (0 = none)
const longestRange = (state: GameState, unitId: UnitId): number => {
  let best = 0
  for (const m of liveModels(state, unitId)) for (const wid of m.weapons) {
    const w = state.weapons[wid]
    if (w && w.kind === 'ranged') best = Math.max(best, w.range ?? 0)
  }
  return best
}

export function kruleboyzAbilityTiming(state: GameState, player: PlayerId, code: string, unitIdIn: UnitId | null): number | null {
  // the option the bot scores carries no unit hint, and all three enhancements belong to the general
  const unitId = unitIdIn ?? generalOf(state, player)
  switch (code) {
    case CODE_WAAAGH: {
      // wait for a combat phase where the general and a neighbour are both about to fight
      const general = generalOf(state, player)
      if (!general || !inCombat(state, general)) return -3
      return waaaghTargets(state, null, player).some((id) => inCombat(state, id)) ? 0.5 : -3
    }
    case CODE_KUNNIN:
      // free every turn, but only worth a prompt when a unit in range is stuck in combat and might want to leave
      return kunninTargets(state, unitId).some((id) => inCombat(state, id)) ? 0 : -3
    case 'kruleboyzMorksEyePebble': {
      // once per battle: spend it when an enemy gun has one of the units around the general in range
      const general = generalOf(state, player)
      if (!general) return -3
      const range = num(paramsByCode(state, general, 'kruleboyzMorksEyePebble').range, 12)
      const covered = unitsOf(state, player).filter((id) => id === general || whollyWithinUnit(state, id, general, range))
      const threatened = Object.values(state.units).some((e) => e.player !== player && e.location === 'board' && covered.some((id) => {
        const reach = longestRange(state, e.id)
        return reach > 0 && unitGap(state, e.id, id) <= reach + EPS
      }))
      return threatened ? 1 : -3
    }
    case 'kruleboyzEyeBiterAsh': {
      // once per battle: a unit that swings hard, or any target once the game is well along
      const foes = eyeTargets(state, unitId)
      const best = foes.reduce((a, id) => Math.max(a, meleeAttacks(state, id)), 0)
      return best >= 6 || state.round >= 3 ? 0 : -3
    }
    default:
      return null
  }
}

export function kruleboyzTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case 'kruleboyzCoveredInMud': {
      // hide the gun first (nothing can shoot a unit it cannot see), then the Boltboyz
      const id = unit.datasheetId
      return id.endsWith('beast-skewer-killbow') ? 4 : id.endsWith('man-skewer-boltboyz') ? 2 : 0
    }
    case 'kruleboyzEyeBiterAsh':
      return unit.player !== player ? meleeAttacks(state, unitId) * 0.5 : null
    case CODE_PLAN: {
      // the unit that is holding an objective gets the extra Control
      return liveObjectives(state).some((o) => unitContestsObjective(state, unitId, o)) ? 3 : 0
    }
    default:
      return null
  }
}
