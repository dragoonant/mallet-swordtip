// Sylvaneth (Spitewing Flight) code hooks: docs/spec/factions/sylvaneth.md (SYL-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/sylvaneth/abilities.json uses. What each hook
// needs from data:
//
//  sylvanethTargetOfVengeance (BT-1)  army ability, startOfRound / any, oncePerRound. Offered while the player has no quarry on the
//        battlefield; target = any enemy unit on the battlefield. The pick goes into the ledger mission.custom.sylQuarry[player] =
//        { current, past[] } (past = every unit ever picked). Exported quarryOf() is `current` while it is on the battlefield;
//        chordsOf() counts the `past` units that are destroyed, so no unit-destroyed hook is needed.
//  sylvanethSongOfTheHunt (BT-3..6)   passive; the descriptor's four modifyRoll effects (advance, charge, hit, wound: +1 each) are
//        switched on by `gate`, which reads the roll the effect is being asked about from the hook data: the rolling unit must be
//        within params.range of its quarry and the chords (plus the Horn's extra one) must reach params.simple / tuneful / melodic.
//        `resourceReadout` shows the chord count in the HUD.
//  sylvanethLeavesOnTheWind (RA-1)    endOfTurn / any, oncePerBattle; target = a friendly unit in combat with a legal retreat spot.
//        Queues a Retreat (MoveQueue kind 'retreat': no mortal damage, may cross combat ranges, must end out of combat).
//  sylvanethLifebringers (RA-2)       endOfTurn / any, oncePerTurnArmy; Heal (params.heal) rolled separately for each damaged friendly
//        unit on the battlefield.
//  sylvanethHeartwoodHorn (AB-1)      command / your; target = a visible friendly unit wholly within params.range (itself included).
//        Leaves an empty marker effect (untilNextTurn) on it; hornBonus() reads the marker.
//  sylvanethZephyrspites (AB-2)       reaction youDeclared / ATTACK for a declared Shoot of this unit; rolls the D6 and queues a slide
//        bound to the next 'shooting' window (the shooting:after:<unit> one) with noCombatPath.
//  sylvanethSpiteriderCharge (AB-3)   charge / any; the unit charged this turn; target = a visible enemy unit within params.range.
//        D3 (+1 against the quarry), modified 2+ = that much mortal damage.
//  sylvanethDeafeningDrone (AB-4)     fight / any; the unit did not charge; target = an enemy unit in combat with it. D6 above the
//        target's Control gives its melee weapons -1 Attacks for the turn (affectsCompanion: an enemy ability).
//  sylvanethHeadOfTheHunt (ENH-1)     passive; `statDelta` (F14 C1): -1 on the AP of the bearer's melee weapons (= +1 Rend) while the
//        quarry is within params.range and visible to the bearer's unit.
//  sylvanethZephyrkin (ENH-2)         reaction youDeclared / ATTACK for a declared Fight of the bearer's unit that charged; rolls 2D6
//        and queues a slide bound to the 'fightAfter' window (F14 C3) with mayNotEndInCombat.
//  sylvanethBoldSpirit (ENH-3)        command / any, oncePerBattle; marks the bearer's unit until the end of the turn; `produce` at
//        onWoundRoll adds +1 to melee attacks of friendly units within params.range of it (the bearer's own unit included).
//  sylvanethCunningPursuer (ENH-4)    passive; ensureEffects keeps a battle-long marker on the bearer's unit, `produce` at onChargeRoll
//        adds +1 (+2 while it is in combat with the quarry) to friendly units wholly within params.range while the bearer is in combat.
//
//  AI hints: sylvanethAbilityTiming / sylvanethTargetBonus below are read by src/ai/utility.ts (abilityTiming / abilityTargetBonus).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook, FactionResource } from '../code-hooks'
import type { DiceExpr } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { EPS } from '../geometry'
import { diceExprMean } from '../dice'
import { effectService } from '../effects'
import { readDeclaredAttack } from '../declared'
import { losService } from '../los'
import { boardUnitsOf, modelStats, unitModels } from '../state'
import { weaponService } from '../weapons'
import { retreatOptions, writeMoveQueue } from './aos-moves'
import {
  announce, enemiesInCombat, healUnit, inCombat, inflictMortal, isDamaged, liveModels, onBoard, paramOf, paramsByCode, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const CODE_VENGEANCE = 'sylvanethTargetOfVengeance'
const CODE_SONG = 'sylvanethSongOfTheHunt'
const CODE_LEAVES = 'sylvanethLeavesOnTheWind'
const CODE_LIFE = 'sylvanethLifebringers'
const CODE_HORN = 'sylvanethHeartwoodHorn'
const CODE_SPITES = 'sylvanethZephyrspites'
const CODE_CHARGE = 'sylvanethSpiteriderCharge'
const CODE_DRONE = 'sylvanethDeafeningDrone'
const CODE_HEAD = 'sylvanethHeadOfTheHunt'
const CODE_KIN = 'sylvanethZephyrkin'
const CODE_BOLD = 'sylvanethBoldSpirit'
const CODE_CUNNING = 'sylvanethCunningPursuer'

const HORN_ID = 'sylvaneth.ability.heartwood-hunting-horn'
const LEDGER = 'sylQuarry'

const unitsOf = (state: GameState, player: PlayerId): UnitId[] => boardUnitsOf(state, player).map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const moveOf = (state: GameState, unitId: UnitId): number => Math.max(0, ...unitModels(state, unitId).map((m) => modelStats(state, m).M))
const controlOf = (state: GameState, unitId: UnitId): number => Math.max(0, ...liveModels(state, unitId).map((m) => modelStats(state, m).OC))
const playerOf = (state: GameState, use: { player?: PlayerId }): PlayerId => use.player ?? state.activePlayer
const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
const seesUnit = (state: GameState, fromUnit: UnitId, target: UnitId): boolean => liveModels(state, fromUnit).some((m) => losService.unitVisible(state, m.id, target))

// ---------- the quarry ledger (SYL-BT-1) and the chords (SYL-BT-3) ----------
interface QuarryLedger { current: UnitId | null; past: UnitId[] }
const EMPTY: QuarryLedger = { current: null, past: [] }

const ledgerOf = (state: GameState, player: PlayerId): QuarryLedger =>
  ((state.mission.custom[LEDGER] as Partial<Record<PlayerId, QuarryLedger>> | undefined) ?? {})[player] ?? EMPTY

function writeLedger(state: GameState, player: PlayerId, ledger: QuarryLedger): void {
  const all = (state.mission.custom[LEDGER] as Partial<Record<PlayerId, QuarryLedger>> | undefined) ?? {}
  state.mission.custom = { ...state.mission.custom, [LEDGER]: { ...all, [player]: ledger } }
}

/** the player's quarry while it is on the battlefield, else null (destroyed, or off the table) */
export function quarryOf(state: GameState, player: PlayerId): UnitId | null {
  const l = ledgerOf(state, player)
  return l.current && onBoard(state, l.current) ? l.current : null
}

/** chords the player has earned: every unit they ever picked as quarry that has been destroyed (replaced ones included) */
export function chordsOf(state: GameState, player: PlayerId): number {
  return [...new Set(ledgerOf(state, player).past)].filter((id) => state.units[id]?.location === 'destroyed').length
}

/** 1 while the Heartwood Hunting Horn marker is on the unit (one extra chord for Song of the Hunt, never a real one) */
export function hornBonus(state: GameState, unitId: UnitId): number {
  return state.units[unitId]?.effects.some((e) => e.sourceAbilityId === HORN_ID) ? 1 : 0
}

// the quarry is within `range` of the unit: Song of the Hunt only works there
const nearQuarry = (state: GameState, unitId: UnitId, range: number): boolean => {
  const u = state.units[unitId]
  const q = u ? quarryOf(state, u.player) : null
  return !!q && unitGap(state, unitId, q) <= range + EPS
}

const enemyBoard = (state: GameState, player: PlayerId): UnitId[] => unitsOf(state, other(player))

// ---------- SYL-BT-1 Target of Vengeance ----------
const vengeanceActivate: ActivatedAbilityHook & { targets(state: GameState, unitId: UnitId | null, player?: PlayerId): UnitId[] } = {
  canUse: (state, _unitId, use) => !quarryOf(state, playerOf(state, use)) && enemyBoard(state, playerOf(state, use)).length > 0,
  targets(state, _unitId, player?: PlayerId) { return quarryOf(state, player ?? state.activePlayer) ? [] : enemyBoard(state, player ?? state.activePlayer) },
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target || quarryOf(s, use.player)) return
    const l = ledgerOf(s, use.player)
    writeLedger(s, use.player, { current: target.id, past: [...l.past.filter((x) => x !== target.id), target.id] })
    announce(ctx, use, target.id, `Target of Vengeance: ${target.name} is now the quarry (${chordsOf(s, use.player)} chord${chordsOf(s, use.player) === 1 ? '' : 's'} so far)`)
  },
}
const sylvanethTargetOfVengeance: EngineCodeHook = { name: CODE_VENGEANCE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: vengeanceActivate }

// ---------- SYL-BT-3..6 Song of the Hunt ----------
type SongRoll = 'advance' | 'charge' | 'hit' | 'wound'

// which of the descriptor's four effects the engine is asking about, and for which unit (read from the hook data)
function songQuery(data: Record<string, unknown> | undefined): { kind: SongRoll; unitId: UnitId } | null {
  if (!data) return null
  const roll = data.roll as { purpose?: string } | null | undefined
  const attack = data.attack as { attackerUnitId?: UnitId } | null | undefined
  if (attack && roll) {
    if (roll.purpose === 'hit' && attack.attackerUnitId) return { kind: 'hit', unitId: attack.attackerUnitId }
    if (roll.purpose === 'wound' && attack.attackerUnitId) return { kind: 'wound', unitId: attack.attackerUnitId }
    return null
  }
  if (typeof data.chargingUnitId === 'string') return { kind: 'charge', unitId: data.chargingUnitId }
  if (typeof data.movingUnitId === 'string') return { kind: 'advance', unitId: data.movingUnitId }
  return null
}

/** chords that count for the unit's Song of the Hunt bonuses: the real ones plus the Horn's */
export const songChords = (state: GameState, unitId: UnitId): number => {
  const u = state.units[unitId]
  return u ? chordsOf(state, u.player) + hornBonus(state, unitId) : 0
}

const songNeeds = (params: Record<string, unknown>, kind: SongRoll): number =>
  kind === 'hit' ? num(params.tuneful, 2) : kind === 'wound' ? num(params.melodic, 3) : num(params.simple, 1)

const sylvanethSongOfTheHunt: EngineCodeHook = {
  name: CODE_SONG, kind: 'ability', hook: 'onStatQuery', run: noop,
  gate(state, holder, entry, data) {
    const q = songQuery(data)
    if (!q || q.unitId !== holder.id) return false
    if (!nearQuarry(state, holder.id, num(entry.params.range, 9))) return false
    return songChords(state, holder.id) >= songNeeds(entry.params, q.kind)
  },
  resourceReadout(state, _ability, player): FactionResource | null {
    const quarry = quarryOf(state, player)
    return {
      id: 'sylvaneth.chords', label: 'Chords', value: Math.min(3, chordsOf(state, player)), max: 3,
      help: `Quarry: ${quarry ? state.units[quarry].name : 'none yet'}. Each destroyed quarry is a chord: 1 run and charge, 2 hit, 3 wound (units within 9" of the quarry).`,
    }
  },
}

// ---------- SYL-RA-1 Leaves on the Wind ----------
// friendly units in combat that have a legal retreat spot (a move other than staying put)
function leavesTargets(state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] {
  return unitsOf(state, player ?? state.activePlayer).filter((id) => inCombat(state, id) && retreatOptions(state, id, moveOf(state, id)).some((o) => o.id !== 'mv:0:0'))
}

const leavesActivate: ActivatedAbilityHook & { targets: typeof leavesTargets } = {
  canUse: (state, unitId, use) => pickedOk(leavesTargets(state, unitId, playerOf(state, use)), use),
  targets: leavesTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const unit = onBoard(s, use.targetUnitIds[0])
    if (!unit || !inCombat(s, unit.id)) return
    // applyRetreat deals no retreat damage; the queue offers the legal slides and 'stay'
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: moveOf(s, unit.id), queue: [unit.id], kind: 'retreat' })
    unit.turn.moveType = 'fallBack'
    announce(ctx, use, unit.id, `Leaves on the Wind: ${unit.name} may Retreat at once and suffers no mortal damage`)
  },
}
const sylvanethLeavesOnTheWind: EngineCodeHook = { name: CODE_LEAVES, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: leavesActivate }

// ---------- SYL-RA-2 Lifebringers ----------
const lifeActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => unitsOf(state, playerOf(state, use)).some((id) => isDamaged(state, id)),
  resolve(ctx, use) {
    const s = ctx.state
    const dice = paramOf<DiceExpr>(s, use.abilityId, 'heal', 'D3')
    let total = 0
    for (const id of unitsOf(s, use.player)) {
      if (!isDamaged(s, id)) continue
      const n = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: id, commandRerollable: false }).total
      const healed = healUnit(ctx, id, n, use.abilityId)
      total += healed
      announce(ctx, use, id, `Lifebringers: Heal (${n}), ${healed} damage removed from ${s.units[id].name}`)
    }
    if (total === 0) announce(ctx, use, null, 'Lifebringers: nothing to heal')
  },
}
const sylvanethLifebringers: EngineCodeHook = { name: CODE_LIFE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: lifeActivate }

// ---------- SYL-AB-1 Heartwood Hunting Horn ----------
function hornTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsByCode(state, me.id, CODE_HORN).range, 12)
  return unitsOf(state, me.player).filter((id) => id === me.id || (whollyWithinUnit(state, id, me.id, range) && seesUnit(state, me.id, id)))
}

const hornActivate: ActivatedAbilityHook & { targets: typeof hornTargets } = {
  canUse: (state, unitId, use) => pickedOk(hornTargets(state, unitId), use),
  targets: hornTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    // a second Horn would not stack: the marker is simply renewed
    target.effects = target.effects.filter((e) => e.sourceAbilityId !== use.abilityId)
    effectService.grant(ctx, target.id, {}, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn' })
    announce(ctx, use, target.id, `Heartwood Hunting Horn: ${target.name} counts 1 extra chord until your next turn`)
  },
}
const sylvanethHeartwoodHorn: EngineCodeHook = { name: CODE_HORN, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: hornActivate }

// ---------- SYL-AB-2 Zephyrspites ----------
const spitesActivate: ActivatedAbilityHook = {
  canUse(state, unitId) {
    const d = readDeclaredAttack(state)
    return !!d && d.phase === 'shooting' && !!unitId && d.unitId === unitId && !!onBoard(state, unitId) && !inCombat(state, unitId)
  },
  resolve(ctx, use) {
    const s = ctx.state
    const unit = onBoard(s, use.unitId)
    if (!unit) return
    const roll = ctx.rollExpr('D6', { purpose: 'ability', player: use.player, unitId: unit.id, commandRerollable: false }).total
    // waits for the shooting:after:<unit> window; the unit may still choose to stay, and cannot move at all if it is in combat then
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: roll, queue: [unit.id], opts: { noCombatPath: true }, atWindow: 'shooting' })
    announce(ctx, use, unit.id, `Zephyrspites: ${unit.name} may move up to ${roll}" once it has shot`)
  },
}
const sylvanethZephyrspites: EngineCodeHook = { name: CODE_SPITES, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: spitesActivate }

// ---------- SYL-AB-3 Spiterider Charge ----------
function chargeTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsByCode(state, me.id, CODE_CHARGE).range, 1)
  return enemyBoard(state, me.player).filter((id) => unitGap(state, me.id, id) <= range + EPS && seesUnit(state, me.id, id))
}

const chargeActivate: ActivatedAbilityHook & { targets: typeof chargeTargets } = {
  canUse: (state, unitId, use) => !!onBoard(state, unitId) && state.units[unitId as UnitId].turn.chargedThisTurn && pickedOk(chargeTargets(state, unitId), use),
  targets: chargeTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const quarry = quarryOf(s, use.player) === target.id
    const rolled = ctx.rollExpr('D3', { purpose: 'ability', player: use.player, unitId: target.id, commandRerollable: false }).total
    const total = rolled + (quarry ? 1 : 0)
    if (total < 2) {
      announce(ctx, use, target.id, `Spiterider Charge: rolled ${rolled}, nothing happens`)
      return
    }
    announce(ctx, use, target.id, `Spiterider Charge: ${total} mortal damage on ${target.name}${quarry ? ' (the quarry)' : ''}`)
    inflictMortal(ctx, use, target.id, total)
  },
}
const sylvanethSpiteriderCharge: EngineCodeHook = { name: CODE_CHARGE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: chargeActivate }

// ---------- SYL-AB-4 Deafening Drone ----------
const droneTargets = (state: GameState, unitId: UnitId | null): UnitId[] => (unitId ? enemiesInCombat(state, unitId) : [])

const droneActivate: ActivatedAbilityHook & { targets: typeof droneTargets } = {
  canUse: (state, unitId, use) => !!onBoard(state, unitId) && !state.units[unitId as UnitId].turn.chargedThisTurn && pickedOk(droneTargets(state, unitId), use),
  targets: droneTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const n = ctx.rollExpr('D6', { purpose: 'ability', player: use.player, unitId: target.id, commandRerollable: false }).total
    const control = controlOf(s, target.id)
    if (n <= control) {
      announce(ctx, use, target.id, `Deafening Drone: rolled ${n} against Control ${control}, ${target.name} shrugs it off`)
      return
    }
    // an enemy ability, so it reaches Companion weapons as well (affectsCompanion)
    effectService.grant(ctx, target.id, { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: -1 }, affectsCompanion: true }, {
      sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn',
    })
    announce(ctx, use, target.id, `Deafening Drone: rolled ${n} against Control ${control}, the melee weapons of ${target.name} have -1 Attacks this turn`)
  },
}
const sylvanethDeafeningDrone: EngineCodeHook = { name: CODE_DRONE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: droneActivate }

// ---------- SYL-ENH-1 Head of the Hunt ----------
const sylvanethHeadOfTheHunt: EngineCodeHook = {
  name: CODE_HEAD, kind: 'ability', hook: 'onStatQuery', run: noop,
  // Rend +1 is AP -1 on the bearer's melee weapons (hooks-impl.ts statFor, F14 C1)
  statDelta(state, entry, q) {
    if (q.stat !== 'AP' || q.weapon?.kind !== 'melee' || q.unitId !== entry.holderUnitId) return 0
    const bearer = onBoard(state, entry.holderUnitId)
    if (!bearer) return 0
    const quarry = quarryOf(state, bearer.player)
    if (!quarry || unitGap(state, bearer.id, quarry) > num(entry.params.range, 9) + EPS || !seesUnit(state, bearer.id, quarry)) return 0
    return -num(entry.params.rend, 1)
  },
}

// ---------- SYL-ENH-2 Zephyrkin ----------
const kinActivate: ActivatedAbilityHook = {
  canUse(state, unitId) {
    const d = readDeclaredAttack(state)
    const unit = onBoard(state, unitId)
    return !!d && !!unit && d.phase === 'fight' && d.unitId === unit.id && unit.turn.chargedThisTurn
  },
  resolve(ctx, use) {
    const s = ctx.state
    const unit = onBoard(s, use.unitId)
    if (!unit) return
    const roll = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'dice', '2D6'), { purpose: 'ability', player: use.player, unitId: unit.id, commandRerollable: false }).total
    // waits for the 'fightAfter' window (right after this unit's Fight ability has been resolved); Fly keeps the path free
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: roll, queue: [unit.id], opts: { mayNotEndInCombat: true }, atWindow: 'fightAfter' })
    announce(ctx, use, unit.id, `Zephyrkin: ${unit.name} may move up to ${roll}" once it has fought, ending out of combat`)
  },
}
const sylvanethZephyrkin: EngineCodeHook = { name: CODE_KIN, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: kinActivate }

// puts one battle-long (empty) effect on the bearer's unit for every enhancement ability with this code (the producers below only
// answer on an active effect). Idempotent.
function ensureBearerMarker(ctx: Parameters<NonNullable<EngineCodeHook['ensureEffects']>>[0], code: string): void {
  const s = ctx.state
  for (const ab of Object.values(s.abilities)) {
    if (ab.code !== code || ab.source !== 'enhancement' || !ab.bearerModelId) continue
    const unit = s.units[s.models[ab.bearerModelId]?.unitId]
    if (!unit || unit.location === 'destroyed' || unit.effects.some((e) => e.sourceAbilityId === ab.id)) continue
    effectService.grant(ctx, unit.id, {}, { sourceAbilityId: ab.id, sourceUnitId: unit.id, scope: { who: 'self' }, duration: 'battle' })
  }
}

// ---------- SYL-ENH-3 Bold Spirit ----------
const boldActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const bearer = onBoard(s, use.unitId)
    if (!bearer) return
    effectService.grant(ctx, bearer.id, {}, { sourceAbilityId: use.abilityId, sourceUnitId: bearer.id, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, bearer.id, `Bold Spirit: friendly units within ${num(paramOf(s, use.abilityId, 'range', 3), 3)}" of ${bearer.name} add 1 to their combat wound rolls this turn`)
  },
}

const sylvanethBoldSpirit: EngineCodeHook = {
  name: CODE_BOLD, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: boldActivate,
  producesAt: ['onWoundRoll'],
  produce(ctx, entry, data) {
    const s = ctx.state
    const atk = data.attack as { kind?: string; attackerUnitId?: UnitId } | undefined
    if (!entry.active || !atk || atk.kind !== 'melee' || !atk.attackerUnitId) return null
    const bearer = onBoard(s, entry.holderUnitId)
    const attacker = onBoard(s, atk.attackerUnitId)
    if (!bearer || !attacker || attacker.player !== bearer.player) return null
    if (attacker.id !== bearer.id && unitGap(s, attacker.id, bearer.id) > num(entry.params.range, 3) + EPS) return null
    return { kind: 'roll', modifier: 1 }
  },
}

// ---------- SYL-ENH-4 Cunning Pursuer ----------
const sylvanethCunningPursuer: EngineCodeHook = {
  name: CODE_CUNNING, kind: 'ability', hook: 'onStatQuery', run: noop,
  producesAt: ['onChargeRoll'],
  produce(ctx, entry, data) {
    const s = ctx.state
    const charger = onBoard(s, data.chargingUnitId as UnitId | undefined)
    const bearer = onBoard(s, entry.holderUnitId)
    if (!entry.active || !charger || !bearer || charger.player !== bearer.player || !inCombat(s, bearer.id)) return null
    if (!whollyWithinUnit(s, charger.id, bearer.id, num(entry.params.range, 12))) return null
    const quarry = quarryOf(s, bearer.player)
    return { kind: 'roll', modifier: quarry && enemiesInCombat(s, bearer.id).includes(quarry) ? 2 : 1 }
  },
  ensureEffects: (ctx) => ensureBearerMarker(ctx, CODE_CUNNING),
}

// ---------- a rough damage estimate for the AI hints (kept here so the engine does not import src/ai) ----------
const rollP = (target: number): number => Math.max(1 / 6, Math.min(5 / 6, (7 - target) / 6))

// expected damage `attackerId` deals to `targetId` with its ranged and melee weapons together (one full turn of attacks)
function estimateDamage(state: GameState, attackerId: UnitId, targetId: UnitId, kinds: ('ranged' | 'melee')[]): number {
  const defenders = liveModels(state, targetId)
  if (defenders.length === 0) return 0
  const dst = modelStats(state, defenders[0])
  let total = 0
  for (const m of liveModels(state, attackerId)) {
    for (const wid of m.weapons) {
      const w = weaponService.effectiveWeapon(state, m.id, wid)
      if (!w || !kinds.includes(w.kind)) continue
      const hits = diceExprMean(w.A) * (w.skill === null ? 1 : rollP(w.skill))
      const mortal = w.abilities.find((a) => a.ability === 'HIT_MORTAL')
      if (mortal) { total += hits * (mortal.value === undefined ? 1 : diceExprMean(mortal.value)); continue }
      const need = dst.Sv + w.rend
      const unsaved = dst.noSave || need > 6 ? 1 : 1 - rollP(need)
      let dmg = hits * rollP(w.wound) * unsaved * diceExprMean(w.D)
      if (dst.ward !== null) dmg *= 1 - rollP(dst.ward)
      total += dmg
    }
  }
  return total
}

const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}

const attacksOf = (state: GameState, unitId: UnitId): number =>
  liveModels(state, unitId).reduce((n, m) => n + m.weapons.reduce((a, w) => a + (state.weapons[w] ? diceExprMean(state.weapons[w].A) : 0), 0), 0)

// enemy melee damage the unit stands to take from the enemy units it is in combat with
const meleeThreat = (state: GameState, unitId: UnitId): number =>
  enemiesInCombat(state, unitId).reduce((n, e) => n + estimateDamage(state, e, unitId, ['melee']), 0)

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus; null = no opinion) ----------
// below -2 the bot passes instead of using the ability. Ability-use options carry no unit hint, so general-bound abilities fall back to
// the army's general.
export function sylvanethAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  switch (code) {
    case CODE_HORN: {
      // only worth it while a chord is still missing and a unit could be near the quarry this turn
      const quarry = quarryOf(state, player)
      const general = unitId ?? generalOf(state, player)
      if (!quarry || !general || chordsOf(state, player) >= 3) return -3
      return hornTargets(state, general).some((id) => unitGap(state, id, quarry) <= 9 + 12) ? 0 : -3
    }
    case CODE_LEAVES: {
      // once per battle: the unit that would lose its fight, at the end of our own turn (before the enemy swings)
      if (state.activePlayer !== player) return -3
      const worst = leavesTargets(state, null, player).filter((id) => meleeThreat(state, id) >= woundsLeft(state, id) * 0.8)
      return worst.length > 0 ? 1 : -3
    }
    case CODE_BOLD: {
      // once per battle: the turn two or more friendly units fight beside the general
      const general = unitId ?? generalOf(state, player)
      if (!general || !onBoard(state, general)) return -3
      const near = unitsOf(state, player).filter((id) => id === general || unitGap(state, id, general) <= 3 + EPS)
      const busy = near.filter((id) => inCombat(state, id) || (state.activePlayer === player && enemyBoard(state, player).some((e) => unitGap(state, id, e) <= 12))).length
      return busy >= 2 ? 0 : -3
    }
    case CODE_LIFE: {
      const missing = unitsOf(state, player).reduce((n, id) => n + liveModels(state, id).reduce((a, m) => a + Math.max(0, modelStats(state, m).W - m.woundsRemaining), 0), 0)
      return missing >= 1 ? 0 : -3
    }
    default:
      return null
  }
}

export function sylvanethTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_VENGEANCE: {
      // the enemy unit this army can kill soonest (damage in one turn against its Health), the nearest on a tie
      const mine = unitsOf(state, player)
      const dmg = mine.reduce((n, id) => n + estimateDamage(state, id, unitId, ['ranged', 'melee']), 0)
      const left = Math.max(1, woundsLeft(state, unitId))
      const gap = mine.length > 0 ? Math.min(...mine.map((id) => unitGap(state, id, unitId))) : 30
      return Math.min(4, dmg / left * 3) - Math.min(30, gap) * 0.05
    }
    case CODE_HORN: {
      // the friendly unit that swings hardest near the quarry (Lancers on a charge turn)
      const quarry = quarryOf(state, player)
      const gap = quarry ? unitGap(state, unitId, quarry) : 30
      return Math.min(3, attacksOf(state, unitId) * 0.2) - Math.min(30, gap) * 0.1 + (unit.turn.chargedThisTurn ? 1 : 0)
    }
    case CODE_LEAVES:
      // the unit in the worst fight
      return meleeThreat(state, unitId) / Math.max(1, woundsLeft(state, unitId)) * 3
    case CODE_CHARGE: {
      // the quarry first, then whatever is closest to dying
      const quarry = quarryOf(state, player) === unitId
      return (quarry ? 3 : 0) + Math.max(0, 6 - woundsLeft(state, unitId)) * 0.3
    }
    case CODE_DRONE: {
      // the weakest Control (the roll beats it more often) with the most melee Attacks to cut
      return (6 - Math.min(6, controlOf(state, unitId))) * 0.5 + Math.min(4, attacksOf(state, unitId) * 0.15)
    }
    default:
      return null
  }
}

export const sylvanethHooks: Record<string, EngineCodeHook> = {
  sylvanethTargetOfVengeance, sylvanethSongOfTheHunt, sylvanethLeavesOnTheWind, sylvanethLifebringers, sylvanethHeartwoodHorn,
  sylvanethZephyrspites, sylvanethSpiteriderCharge, sylvanethDeafeningDrone, sylvanethHeadOfTheHunt, sylvanethZephyrkin,
  sylvanethBoldSpirit, sylvanethCunningPursuer,
}
