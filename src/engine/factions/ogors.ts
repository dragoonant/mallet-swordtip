// Ogor Mawtribes (Warglutt Marauders) code hooks: docs/spec/factions/ogor-mawtribes.md (OGM-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/ogors/abilities.json uses. What each hook needs:
//
//  ogorsScoffDown (BT-2)         army ability, endOfTurn / any, UNLIMITED (the once-per-unit rule is the phase mark `ogm:scoff:<unitId>`).
//        Offered only when an enemy unit was destroyed this turn (cards.ts turnLog); targets = own units on the board that fought this
//        turn and have not used it yet. Modes (data): raw | giblets | brains. Raw = a battle-long declarative effect (+1 to hit,
//        only in a turn the unit charged). Giblets and Brains are empty battle-long effects whose id keys the ledger
//        `mission.custom.ogmScoff`: `wardRollModifier` (-1 to ward rolls against that unit's melee damage) and `produce` at
//        onObjectiveControl (+params.brains to the unit's control score) read it, so a second upgrade stacks.
//  ogorsBrutishBarging (RA-1)    regiment ability, endOfTurn / your, oncePerBattle. Targets = own units that charged this turn and could
//        move. Resolve rolls 2D6 and queues a slide (aos-moves.ts) that may cross the combat ranges of the units the target was in
//        combat with when the move began (SlideOpts.combatPathExcept) and never ends in combat.
//  ogorsBlindingDust (RA-2)      passive descriptor (scope attacker: the target's side), -1 to hit; `gate` passes only for a unit set up
//        this turn (a reserve arrival).
//  ogorsRoaringWarlord (AB-1)    hero phase / your, roll D6 3+; target = a visible friendly unit within params.range of the Tyrant (it
//        counts); +params.bonus to its charge rolls for the rest of the turn.
//  ogorsStompingMarauders (AB-3) passive. ensureEffects puts a battle-long empty effect on the Ironguts so `produce` has an entry to
//        answer on: +params.control to the unit's control score in a turn it charged.
//  ogorsShockAndGore (AB-4)      combat phase / your, oncePerTurnArmy, roll D6 3+; only after this unit charged; the enemy unit in combat
//        with it gets -1 to wound rolls for the rest of the turn.
//  ogorsDeathcheater (ENH-3)     passive; adjustFeelNoPain gives the bearer Ward (params.ward) while it is more than params.range from every
//        other friendly unit on the battlefield.
//  ogorsGristlegobbler (ENH-4)   endOfTurn / any, oncePerBattle; D3 mortal damage to every enemy unit in combat with the bearer, then Heal (3).
//  Wall of Meat (AB-2), Wallwrecker (ENH-1), Lungburster (ENH-2) and the More Ogors, My Lord! arrival (BT-1) are plain data.
//
//  AI hints: ogorsAbilityTiming / ogorsTargetBonus / ogorsModeBonus below are read by src/ai/utility.ts.
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { EPS } from '../geometry'
import { effectService } from '../effects'
import { losService } from '../los'
import { slideOptions, writeMoveQueue, type SlideOpts } from './aos-moves'
import { modelStats } from '../state'
import {
  announce, enemiesInCombat, healUnit, inCombat, inflictMortal, liveModels, liveObjectives, onBoard, paramOf, paramsByCode, unitContestsObjective, unitGap,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const CODE_SCOFF = 'ogorsScoffDown'
const CODE_BARGING = 'ogorsBrutishBarging'
const CODE_DUST = 'ogorsBlindingDust'
const CODE_WARLORD = 'ogorsRoaringWarlord'
const CODE_STOMP = 'ogorsStompingMarauders'
const CODE_GORE = 'ogorsShockAndGore'
const CODE_DEATHCHEATER = 'ogorsDeathcheater'
const CODE_GRISTLE = 'ogorsGristlegobbler'

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const boardUnits = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()
// abilities.ts hands `targets` the player too (army abilities have no unit to read it from)
type TargetsFn = (state: GameState, unitId: UnitId | null, player?: PlayerId) => UnitId[]
const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
// ---------- OGM-BT-2 Scoff Down Fresh Flesh ----------
const scoffMark = (unitId: UnitId): string => `ogm:scoff:${unitId}`
type ScoffKind = 'giblets' | 'brains'
const scoffLedger = (s: GameState): Record<string, ScoffKind> => (s.mission.custom.ogmScoff as Record<string, ScoffKind> | undefined) ?? {}

/** An enemy unit (to `player`) was destroyed this turn. */
const enemyDestroyedThisTurn = (state: GameState, player: PlayerId): boolean =>
  (state.cards?.turnLog.destroyed ?? []).some((id) => !!state.units[id] && state.units[id].player !== player)

const scoffTargets: TargetsFn = (state, _unitId, player) => {
  const p = player ?? state.activePlayer
  if (!enemyDestroyedThisTurn(state, p)) return []
  const out = new Set<UnitId>()
  for (const id of state.cards?.turnLog.fought ?? []) {
    const u = onBoard(state, id)
    if (u && u.player === p && !state.phaseState.marks.includes(scoffMark(id))) out.add(id)
  }
  return [...out].sort()
}

const scoffActivate: ActivatedAbilityHook & { targets: TargetsFn } = {
  canUse: (state, _unitId, use) => pickedOk(scoffTargets(state, null, use.player), use),
  targets: scoffTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    const mode = use.modeId
    if (!target || !onBoard(s, target) || !mode) return
    s.phaseState.marks.push(scoffMark(target))
    const name = s.units[target].name
    const grant = (effect: Parameters<typeof effectService.grant>[2]) =>
      effectService.grant(ctx, target, effect, { sourceAbilityId: use.abilityId, sourceUnitId: null, scope: { who: 'self' }, duration: 'battle' })
    if (mode === 'raw') {
      grant({ when: { unitCharged: true, weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: 1 } })
      announce(ctx, use, target, `Scoff Down Fresh Flesh: ${name} gets Raw and Bloody Flesh (+1 to hit in a turn it charges)`)
    } else if (mode === 'giblets' || mode === 'brains') {
      const eff = grant({})
      s.mission.custom = { ...s.mission.custom, ogmScoff: { ...scoffLedger(s), [eff.id]: mode } }
      announce(ctx, use, target, mode === 'giblets'
        ? `Scoff Down Fresh Flesh: ${name} gets Exotic Giblets (-1 to ward rolls against its combat attacks)`
        : `Scoff Down Fresh Flesh: ${name} gets Steaming Brains (+${paramOf(s, use.abilityId, 'brains', 3)} to its control score)`)
    }
  },
}
const ogorsScoffDown: EngineCodeHook = {
  name: CODE_SCOFF, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: scoffActivate,
  producesAt: ['onObjectiveControl'],
  produce(ctx, entry, data) {
    const eff = entry.active
    if (!eff || data.contestingUnitId !== entry.holderUnitId || scoffLedger(ctx.state)[eff.id] !== 'brains') return null
    return { kind: 'stat', delta: num(entry.params.brains, 3) }
  },
  wardRollModifier(state, entry, info) {
    const eff = entry.active
    if (!eff || info.kind !== 'melee' || entry.holderUnitId !== info.attackerUnitId) return 0
    return scoffLedger(state)[eff.id] === 'giblets' ? -1 : 0
  },
}

// ---------- OGM-RA-1 Brutish Barging ----------
const bargingOpts = (state: GameState, unitId: UnitId): SlideOpts => ({ combatPathExcept: enemiesInCombat(state, unitId), mayNotEndInCombat: true })
// offered when the average roll (7) would let the unit move somewhere; the real 2D6 is rolled after the target is picked
const bargingTargets: TargetsFn = (state, _unitId, player) => {
  const p = player ?? state.activePlayer
  return boardUnits(state, p).filter((id) => state.units[id].turn.chargedThisTurn && slideOptions(state, id, 7, bargingOpts(state, id)).length > 1)
}
const bargingActivate: ActivatedAbilityHook & { targets: TargetsFn } = {
  canUse: (state, _unitId, use) => pickedOk(bargingTargets(state, null, use.player), use),
  targets: bargingTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const dice = paramOf<DiceExpr>(s, use.abilityId, 'dice', '2D6')
    const n = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
    announce(ctx, use, target, `Brutish Barging: ${s.units[target].name} may move up to ${n}"`)
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: n, queue: [target], opts: bargingOpts(s, target) })
  },
}
const ogorsBrutishBarging: EngineCodeHook = { name: CODE_BARGING, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: bargingActivate }

// ---------- OGM-RA-2 Blinding Dust Clouds ----------
// CORE-6.13: set up this turn (a reserve arrival). A deployment-phase set-up is not "this turn".
const setUpThisTurn = (state: GameState, u: { turn: { arrivedThisTurn: boolean }; setUpTurn: { round: number; player: PlayerId } | null }): boolean =>
  u.turn.arrivedThisTurn || (u.setUpTurn !== null && u.setUpTurn.round === state.round && u.setUpTurn.player === state.activePlayer)
const ogorsBlindingDust: EngineCodeHook = {
  name: CODE_DUST, kind: 'ability', hook: 'onHitRoll', run: noop,
  // every unit of the army holds the regiment ability; the scope (attacker) names the holder as the target, so the holder is the unit
  // that must have been set up this turn
  gate: (state, holder) => setUpThisTurn(state, holder),
}

// ---------- OGM-AB-1 Roaring Warlord ----------
const warlordTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(paramsByCode(state, src.id, CODE_WARLORD).range, 12)
  const mine = liveModels(state, src.id)
  return boardUnits(state, src.player).filter((id) =>
    id === src.id || (unitGap(state, src.id, id) <= range + EPS && mine.some((m) => losService.unitVisible(state, m.id, id))))
}
const warlordActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(warlordTargets(state, unitId), use),
  targets: warlordTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const bonus = paramOf<number>(s, use.abilityId, 'bonus', 1)
    effectService.grant(ctx, target, { modifyRoll: { roll: 'charge', value: bonus } }, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Roaring Warlord: +${bonus} to ${s.units[target].name}'s charge rolls this turn`)
  },
}
const ogorsRoaringWarlord: EngineCodeHook = { name: CODE_WARLORD, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: warlordActivate }

// ---------- OGM-AB-3 Stomping Marauders ----------
const ogorsStompingMarauders: EngineCodeHook = {
  name: CODE_STOMP, kind: 'ability', hook: 'onObjectiveControl', run: noop,
  producesAt: ['onObjectiveControl'],
  produce(ctx, entry, data) {
    const holder = ctx.state.units[entry.holderUnitId]
    if (!entry.active || !holder || data.contestingUnitId !== holder.id || !holder.turn.chargedThisTurn) return null
    return { kind: 'stat', delta: num(entry.params.control, 2) }
  },
  // the passive ability sits on the datasheet, which has no active entry; a battle-long empty effect on each such unit gives `produce` one
  ensureEffects(ctx) {
    const s = ctx.state
    for (const u of Object.values(s.units)) {
      if (u.location === 'destroyed') continue
      for (const id of s.datasheets[u.datasheetId]?.abilities ?? []) {
        const ab = s.abilities[id as string]
        if (!ab || ab.code !== CODE_STOMP || u.effects.some((e) => e.sourceAbilityId === ab.id)) continue
        effectService.grant(ctx, u.id, {}, { sourceAbilityId: ab.id, sourceUnitId: u.id, scope: { who: 'self' }, duration: 'battle' })
      }
    }
  },
}

// ---------- OGM-AB-4 Shock and Gore ----------
const goreTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const u = onBoard(state, unitId)
  return u && u.turn.chargedThisTurn ? enemiesInCombat(state, u.id).sort() : []
}
const goreActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(goreTargets(state, unitId), use),
  targets: goreTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    // the enemy unit's own attacks carry the penalty (attacker side of its wound rolls)
    effectService.grant(ctx, target, { modifyRoll: { roll: 'wound', value: -1 } }, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Shock and Gore: ${s.units[target].name} subtracts 1 from its wound rolls this turn`)
  },
}
const ogorsShockAndGore: EngineCodeHook = { name: CODE_GORE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: goreActivate }

// ---------- OGM-ENH Deathcheater ----------
const ogorsDeathcheater: EngineCodeHook = {
  name: CODE_DEATHCHEATER, kind: 'ability', hook: 'onStatQuery', run: noop,
  adjustFeelNoPain(state, entry, modelId, current) {
    const model = state.models[modelId]
    const holder = onBoard(state, entry.holderUnitId)
    if (!model || !holder || model.unitId !== holder.id) return null
    // the ability sits on the bearer's unit only (an enhancement entry); a model of it is warded while no other friendly unit is near
    const range = num(entry.params.range, 3)
    for (const id of boardUnits(state, holder.player)) {
      if (id !== holder.id && unitGap(state, holder.id, id) <= range + EPS) return null
    }
    return { threshold: Math.min(current ?? 7, num(entry.params.ward, 6)), modifier: 0 }
  },
}

// ---------- OGM-ENH Gristlegobbler ----------
const gristleActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId) && enemiesInCombat(state, unitId as UnitId).length > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const bearer = onBoard(s, use.unitId)
    if (!bearer) return
    const dice = paramOf<DiceExpr>(s, use.abilityId, 'mortal', 'D3')
    for (const id of enemiesInCombat(s, bearer.id).sort()) {
      const n = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: bearer.id, targetUnitId: id, commandRerollable: false }).total
      announce(ctx, use, id, `Gristlegobbler: ${n} mortal damage to ${s.units[id].name}`)
      inflictMortal(ctx, use, id, n)
    }
    if (onBoard(s, bearer.id)) {
      const healed = healUnit(ctx, bearer.id, paramOf<number>(s, use.abilityId, 'heal', 3), use.abilityId)
      announce(ctx, use, bearer.id, `Gristlegobbler: ${bearer.name} heals ${healed}`)
    }
  },
}
const ogorsGristlegobbler: EngineCodeHook = { name: CODE_GRISTLE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: gristleActivate }

// ---------- AI hints ----------
const meleeAttacks = (state: GameState, unitId: UnitId): number => {
  let n = 0
  for (const m of liveModels(state, unitId)) {
    for (const w of m.weapons) {
      const wp = state.weapons[w]
      if (wp && wp.kind === 'melee') n += typeof wp.A === 'number' ? wp.A : 3
    }
  }
  return n
}
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const damagePoints = (state: GameState, unitId: UnitId): number =>
  liveModels(state, unitId).reduce((a, m) => a + Math.max(0, modelStats(state, m).W - m.woundsRemaining), 0)
const centre = (state: GameState, unitId: UnitId): { x: number; z: number } | null => {
  const ms = liveModels(state, unitId)
  if (ms.length === 0) return null
  return { x: ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, z: ms.reduce((a, m) => a + m.pos.z, 0) / ms.length }
}
const contestsAny = (state: GameState, unitId: UnitId): boolean => liveObjectives(state).some((o) => unitContestsObjective(state, unitId, o))
// the nearest objective this player does not already control, from the unit's centre
const nearestUnheldObjective = (state: GameState, unitId: UnitId): number => {
  const me = state.units[unitId]
  const c = centre(state, unitId)
  if (!me || !c) return Infinity
  let best = Infinity
  for (const o of liveObjectives(state)) {
    if (o.controller === me.player || unitContestsObjective(state, unitId, o)) continue
    best = Math.min(best, Math.hypot(o.pos.x - c.x, o.pos.z - c.z))
  }
  return best
}
// P(2D6 >= n)
const twoDiceAtLeast = (n: number): number => {
  if (n <= 2) return 1
  if (n > 12) return 0
  let ways = 0
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= n) ways++
  return ways / 36
}
// how much +1 to the charge roll adds to the unit's best charge: the chance gain times a rough size of the blow
function chargeGain(state: GameState, unitId: UnitId): number {
  const me = state.units[unitId]
  if (!me || me.location !== 'board' || inCombat(state, unitId) || meleeAttacks(state, unitId) <= 0) return 0
  let best = 0
  // the hero phase comes before the Move: the unit gets to close up first
  const reach = state.phase === 'command' ? Math.max(0, ...liveModels(state, unitId).map((m) => modelStats(state, m).M)) : 0
  for (const e of boardUnits(state, other(me.player))) {
    const need = Math.ceil(Math.max(0, unitGap(state, unitId, e) - reach - 0.5))
    if (need < 2 || need > 12) continue
    best = Math.max(best, (twoDiceAtLeast(need - 1) - twoDiceAtLeast(need)) * (2 + meleeAttacks(state, unitId) * 0.4))
  }
  return best
}
const incomingAttacks = (state: GameState, unitId: UnitId): number => enemiesInCombat(state, unitId).reduce((a, e) => a + meleeAttacks(state, e), 0)

// what Scoff Down upgrades a unit already has: raw (the declarative effect), giblets and brains (the ledger)
function upgradesOf(state: GameState, unitId: UnitId): Record<'raw' | 'giblets' | 'brains', number> {
  const out = { raw: 0, giblets: 0, brains: 0 }
  const ledger = scoffLedger(state)
  for (const e of state.units[unitId]?.effects ?? []) {
    if (state.abilities[e.sourceAbilityId]?.code !== CODE_SCOFF) continue
    const kind = ledger[e.id]
    if (kind) out[kind] += 1
    else out.raw += 1
  }
  return out
}
const enemyHasWards = (state: GameState, player: PlayerId): boolean =>
  boardUnits(state, other(player)).some((id) => typeof state.datasheets[state.units[id].datasheetId]?.stats.ward === 'number')

// the unit behind an abilityUse option id `<abilityId>#<unitId>` of an Ogors ability (the options carry no unit hint); null for anything else
export function ogorsOptionUnit(state: GameState, optionId: string): UnitId | null {
  const [abilityId, unitId] = optionId.split('#')
  if (!state.abilities[abilityId]?.code?.startsWith('ogors') || !unitId || !state.units[unitId]) return null
  return unitId
}

// below -2 the bot passes instead of using the ability
export function ogorsAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  switch (code) {
    case CODE_SCOFF:
      return 0
    case CODE_WARLORD: {
      // worth it when some friendly unit has a charge to make that +1 helps
      const best = Math.max(0, ...warlordTargets(state, unitId).map((id) => chargeGain(state, id)))
      return best >= 0.15 ? 0 : -3
    }
    case CODE_GORE:
      return 0
    case CODE_BARGING: {
      // once per battle: leave a fight the unit is losing, or reach an objective within the expected 7"
      for (const id of bargingTargets(state, null, player)) {
        if (inCombat(state, id) ? woundsLeft(state, id) <= incomingAttacks(state, id) * 1.2 : nearestUnheldObjective(state, id) <= 9) return 0
      }
      return state.round >= 4 ? -2 : -3
    }
    case CODE_GRISTLE: {
      const g = unitId ? onBoard(state, unitId) : null
      if (!g) return -3
      const foes = enemiesInCombat(state, g.id)
      if (foes.length === 0) return -3
      // the heal is worth it with damage on the bearer; the D3 can finish a hurt unit; two or more targets are a good trade
      if (damagePoints(state, g.id) >= 3 || foes.length >= 2 || foes.some((e) => woundsLeft(state, e) <= 3)) return 0
      return state.round >= 3 ? 0 : -3
    }
    default:
      return null
  }
}

export function ogorsTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_SCOFF:
      // Steaming Brains is worth the most on a unit that holds an objective; the biggest hitters carry Raw and Bloody Flesh
      return (contestsAny(state, unitId) ? 1.5 : 0) + meleeAttacks(state, unitId) * 0.05 - (upgradesOf(state, unitId).brains + upgradesOf(state, unitId).giblets + upgradesOf(state, unitId).raw) * 0.3
    case CODE_WARLORD:
      return chargeGain(state, unitId) * 8
    case CODE_GORE:
      // the enemy unit that hits hardest in this fight
      return meleeAttacks(state, unitId) * 0.3
    case CODE_BARGING: {
      const near = nearestUnheldObjective(state, unitId)
      return (inCombat(state, unitId) ? (woundsLeft(state, unitId) <= incomingAttacks(state, unitId) ? 3 : 0) : 0) + (near <= 9 ? 9 - near : 0) * 0.3
    }
    default:
      return null
  }
}

export function ogorsModeBonus(state: GameState, player: PlayerId, code: string, optionId: string, target: UnitId | null): number | null {
  if (code !== CODE_SCOFF) return null
  if (!target || !state.units[target]) return optionId === 'brains' ? 0.2 : 0
  const have = upgradesOf(state, target)
  const ds = state.datasheets[state.units[target].datasheetId]
  const charger = ds?.keywords.includes('CAVALRY') || ds?.id.endsWith('ironguts') || false
  switch (optionId) {
    // never repeat Raw or Giblets on one unit; Raw suits the units that charge most
    case 'raw': return have.raw > 0 ? -2 : charger ? 1 : 0.4
    case 'giblets': return have.giblets > 0 ? -2 : enemyHasWards(state, player) ? 0.9 : -0.5
    case 'brains': return contestsAny(state, target) ? 1.6 : nearestUnheldObjective(state, target) <= 8 ? 0.7 : 0.2
    default: return 0
  }
}

export const ogorsHooks: Record<string, EngineCodeHook> = {
  ogorsScoffDown, ogorsBrutishBarging, ogorsBlindingDust, ogorsRoaringWarlord, ogorsStompingMarauders, ogorsShockAndGore, ogorsDeathcheater,
  ogorsGristlegobbler,
}
