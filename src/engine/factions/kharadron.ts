// Kharadron Overlords (Skyhammer Task Force) code hooks: docs/spec/factions/kharadron-overlords.md (KO-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/kharadron/abilities.json uses. What each hook
// needs from data:
//
//  kharadronPlyTheSkies (BT-1)       army ability, reaction { youDeclared, abilityId 'core.move' }, offered in the 'moveDeclared' window
//        when an Arkanaut Frigate declares a Normal Move, Run or Retreat. Target = a friendly Infantry unit wholly within params.range
//        (3") of the Frigate and not in combat. resolve lifts it (liftForRedeploy), forbids Charge for the turn and queues an
//        anchored set-up (atWindow 'moveEnded', markSetUp) wholly within the same range of the Frigate; redeploy.ts puts it back
//        where it stood when no legal spot is left. One use per Frigate and phase (phase mark `ko:ply:<frigate>`).
//  kharadronAssaultBoat (RA-1)       movement phase / your, oncePerBattle; targets = units carrying the Ply the Skies charge ban;
//        resolve removes that ban.
//  kharadronDisengage (RA-2)         movement phase / your, params.window 'moveDeclared', oncePerBattle; offered when the Frigate has
//        declared a Retreat; grants noRetreatDamage + shootAfterFallBack until the end of the turn.
//  kharadronFlask (ENH-2)            any hero phase, oncePerBattle; params.heal. Needs the bearer damaged.
//  kharadronNoRewardWithoutRisk (ENH-3) passive marker (params.range). ensureEffects puts a battle-long effect on the bearer's unit
//        so `produce` can answer the charge roll: one re-roll per battle for a unit wholly within range of the bearer, spent on the
//        first charge roll that falls short (mission.custom.koNoReward[player]).
//  kharadronLeaveNoDuardin (ENH-4)   hero phase / your, oncePerBattle; params.range / successOn / datasheets (the Arkanaut Companies).
//  kharadronTakeWhatYouAreOwed (AB-1) hero phase / your; params.range / dice / datasheets. Adds the roll to the target's control
//        SCORE (not to every model's Control): a battle-long ledger in mission.custom.koControl keyed by the granted effect's id,
//        read by `produce` at onObjectiveControl.
//  kharadronTimedCharges (AB-2)      end of any turn; declared roll D6 2+ (descriptor). 1 mortal damage on an enemy unit in combat, then an
//        optional Retreat (MoveQueue kind 'retreat') when the Skywardens are still in combat. No retreat damage.
//  kharadronBombRacks (AB-6)         movement phase / your, oncePerBattle; declared roll D6 2+; targets = passedAcrossThisPhase(frigate).
// Glory-Seekers, Masterwrought Armour and Battle Damaged (datasheet.damaged) are plain descriptors.
import type { ActivatedAbilityHook, AbilityUse } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { keywordsOf, modelStats, unitModels } from '../state'
import { whollyWithinOf, type Footprint } from '../geometry'
import { rollSum } from '../dice'
import { effectService } from '../effects'
import { losService } from '../los'
import { readDeclaredMove } from '../declared'
import { liftForRedeploy, requestRedeploy } from '../redeploy'
import { passedAcrossThisPhase, writeMoveQueue } from './aos-moves'
import {
  announce, enemiesInCombat, healUnit, inflictMortal, isDamaged, isDatasheet, liveModels, liveObjectives, onBoard, paramOf, paramsByCode, returnSlainModels, returnableModels,
  unitContestsObjective, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const isFrigate = (state: GameState, id: UnitId): boolean => isDatasheet(state, id, null, 'arkanaut-frigate')
const codeAbilityId = (state: GameState, code: string): string | null => Object.values(state.abilities).find((a) => a.code === code)?.id ?? null

// the Arkanaut Companies of the army: the data names their warscrolls (params.datasheets), else any id ending in 'arkanaut-company'
const isCompany = (state: GameState, unitId: UnitId, datasheets: unknown): boolean => {
  const id = state.units[unitId]?.datasheetId
  if (!id) return false
  return Array.isArray(datasheets) && datasheets.length > 0 ? datasheets.includes(id) : id.includes('arkanaut-company')
}

// ---------- KO-BT-1 Ply the Skies ----------
const CODE_PLY = 'kharadronPlyTheSkies'
const plyMark = (frigate: UnitId): string => `ko:ply:${frigate}`

// the Frigate that has just declared a Normal Move, Run or Retreat and has not carried anyone yet this phase
function plyFrigate(state: GameState, player: PlayerId): UnitId | null {
  const d = readDeclaredMove(state)
  if (!d || d.moveType === 'stationary') return null
  const f = onBoard(state, d.unitId)
  if (!f || f.player !== player || !isFrigate(state, f.id)) return null
  return state.phaseState.marks.includes(plyMark(f.id)) ? null : f.id
}

const plyRange = (state: GameState): number => {
  const id = codeAbilityId(state, CODE_PLY)
  return id ? num(paramOf(state, id, 'range', 3), 3) : 3
}

// friendly Infantry wholly within the Frigate's combat range and not in combat; the Arkanaut Companies are listed first
function passengers(state: GameState, frigate: UnitId): UnitId[] {
  const f = state.units[frigate]
  const range = plyRange(state)
  return Object.values(state.units)
    .filter((u) => u.player === f.player && u.id !== frigate && u.location === 'board' && keywordsOf(state, u.id).includes('INFANTRY')
      && whollyWithinUnit(state, u.id, frigate, range) && !losService.unitInCombat(state, u.id))
    .sort((a, b) => Number(isCompany(state, b.id, null)) - Number(isCompany(state, a.id, null)) || (a.id < b.id ? -1 : 1))
    .map((u) => u.id)
}

const plyActivate: ActivatedAbilityHook = {
  canUse(state, _unitId, use) {
    const f = plyFrigate(state, use.player ?? state.activePlayer)
    return !!f && passengers(state, f).length > 0
  },
  targets: ((state: GameState, _unitId: UnitId | null, player?: PlayerId) => {
    const f = plyFrigate(state, player ?? state.activePlayer)
    return f ? passengers(state, f) : []
  }) as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const s = ctx.state
    const frigate = plyFrigate(s, use.player)
    const pax = use.targetUnitIds[0]
    if (!frigate || !pax || !passengers(s, frigate).includes(pax)) return
    const range = plyRange(s)
    const origin = liftForRedeploy(ctx, pax, use.abilityId)
    // transported this turn: no Charge abilities (Assault Boat lifts this)
    effectService.grant(ctx, pax, { forbid: 'charge' }, { sourceAbilityId: use.abilityId, sourceUnitId: frigate, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    s.phaseState.marks.push(plyMark(frigate))
    requestRedeploy(s, {
      abilityId: use.abilityId, player: use.player, unitIds: [pax], minEnemyDistance: num(paramOf(s, use.abilityId, 'minEnemyDistance', 3), 3), markSetUp: true,
      anchor: { unitId: frigate, whollyWithin: range }, origin, atWindow: 'moveEnded',
    })
    announce(ctx, use, pax, `Ply the Skies: ${s.units[pax].name} climbs aboard ${s.units[frigate].name} and will be set up again when it has moved`)
  },
}
const kharadronPlyTheSkies: EngineCodeHook = { name: CODE_PLY, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: plyActivate }

// ---------- KO-RA-1 Assault Boat ----------
const transportedUnits = (state: GameState, player: PlayerId): UnitId[] => {
  const ply = codeAbilityId(state, CODE_PLY)
  if (!ply) return []
  return Object.values(state.units)
    .filter((u) => u.player === player && u.location === 'board' && u.effects.some((e) => e.sourceAbilityId === ply))
    .map((u) => u.id).sort()
}

const boatActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => transportedUnits(state, use.player ?? state.activePlayer).length > 0,
  targets: ((state: GameState, _unitId: UnitId | null, player?: PlayerId) => transportedUnits(state, player ?? state.activePlayer)) as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    const ply = codeAbilityId(ctx.state, CODE_PLY)
    const unit = target ? ctx.state.units[target] : undefined
    if (!unit || !ply) return
    unit.effects = unit.effects.filter((e) => e.sourceAbilityId !== ply)
    announce(ctx, use, target, `Assault Boat: ${unit.name} can still charge this turn`)
  },
}
const kharadronAssaultBoat: EngineCodeHook = { name: 'kharadronAssaultBoat', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: boatActivate }

// ---------- KO-RA-2 Disengage ----------
// offered in the move-declared window, so it is only ever about the Frigate that has just declared a Retreat
const retreatingFrigate = (state: GameState, player: PlayerId): UnitId | null => {
  const d = readDeclaredMove(state)
  const f = d && d.moveType === 'fallBack' ? onBoard(state, d.unitId) : null
  return f && f.player === player && isFrigate(state, f.id) ? f.id : null
}

const disengageActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => retreatingFrigate(state, use.player ?? state.activePlayer) !== null,
  targets: ((state: GameState, _unitId: UnitId | null, player?: PlayerId) => {
    const f = retreatingFrigate(state, player ?? state.activePlayer)
    return f ? [f] : []
  }) as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    effectService.grant(ctx, target, [{ noRetreatDamage: true }, { shootAfterFallBack: true }], { sourceAbilityId: use.abilityId, sourceUnitId: target, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Disengage: ${ctx.state.units[target].name} takes no damage for retreating and can still shoot this turn`)
  },
}
const kharadronDisengage: EngineCodeHook = { name: 'kharadronDisengage', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: disengageActivate }

// ---------- KO-ENH-2 Flask of Vintage Gorogna ----------
const flaskUnit = (state: GameState, unitId: UnitId | null, player: AbilityUse['player'] | undefined): UnitId | null =>
  unitId ?? state.players[player ?? state.activePlayer]?.warlordUnitId ?? null

const flaskActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => {
    const id = flaskUnit(state, unitId, use.player)
    return !!id && !!onBoard(state, id) && isDamaged(state, id)
  },
  resolve(ctx, use) {
    const id = flaskUnit(ctx.state, use.unitId, use.player)
    if (!id || !onBoard(ctx.state, id)) return
    const dice = paramOf<DiceExpr>(ctx.state, use.abilityId, 'heal', 'D6')
    const amount = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: id, commandRerollable: false }).total
    const healed = healUnit(ctx, id, amount, use.abilityId)
    announce(ctx, use, id, `Flask of Vintage Gorogna: Heal (${amount}), ${healed} damage removed`)
  },
}
const kharadronFlask: EngineCodeHook = { name: 'kharadronFlask', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: flaskActivate }

// ---------- KO-ENH-3 There's No Reward Without Risk ----------
const CODE_NO_REWARD = 'kharadronNoRewardWithoutRisk'
const noRewardSpent = (state: GameState, player: PlayerId): boolean =>
  ((state.mission.custom.koNoReward as Partial<Record<PlayerId, boolean>> | undefined) ?? {})[player] === true

const kharadronNoRewardWithoutRisk: EngineCodeHook = {
  name: CODE_NO_REWARD, kind: 'ability', hook: 'onStatQuery', run: noop,
  producesAt: ['onChargeRoll'],
  // answered on the active effect ensureEffects put on the bearer's unit. rerolls.ts only asks for a charge roll that fell short
  // (the roll it passes carries `needed`), so the once-per-battle re-roll is never wasted on a charge that works
  produce(ctx, entry, data) {
    const s = ctx.state
    const charger = data.chargingUnitId as UnitId | undefined
    const rc = data.roll as { roll?: { needed?: number }; rerolled?: boolean } | undefined
    if (!entry.active || !charger || !rc || rc.roll?.needed === undefined || rc.rerolled) return null
    const general = entry.holderUnitId
    const owner = s.units[general]?.player
    const unit = s.units[charger]
    if (!owner || !unit || unit.player !== owner || !onBoard(s, general) || noRewardSpent(s, owner)) return null
    if (!whollyWithinUnit(s, charger, general, num(entry.params.range, 12))) return null
    const mine = (s.mission.custom.koNoReward as Partial<Record<PlayerId, boolean>> | undefined) ?? {}
    s.mission.custom = { ...s.mission.custom, koNoReward: { ...mine, [owner]: true } }
    ctx.emit({ type: 'AbilityTriggered', abilityId: entry.source.id, sourceUnitId: general, targetUnitId: charger, summary: "There's No Reward Without Risk: the charge roll is re-rolled", player: owner })
    return { kind: 'roll', reroll: 'all' }
  },
  // the bearer's unit carries a battle-long effect so `produce` has an active entry to answer on
  ensureEffects(ctx) {
    for (const ab of Object.values(ctx.state.abilities)) {
      if (ab.code !== CODE_NO_REWARD || ab.source !== 'enhancement' || !ab.bearerModelId) continue
      const unitId = ctx.state.models[ab.bearerModelId]?.unitId
      const unit = unitId ? ctx.state.units[unitId] : undefined
      if (!unit || unit.effects.some((e) => e.sourceAbilityId === ab.id)) continue
      effectService.grant(ctx, unit.id, {}, { sourceAbilityId: ab.id, sourceUnitId: unit.id, scope: { who: 'self' }, duration: 'battle' })
    }
  },
}

// ---------- KO-ENH-4 Leave No Duardin Behind ----------
const CODE_LEAVE = 'kharadronLeaveNoDuardin'

const leaveTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const p = paramsByCode(state, src.id, CODE_LEAVE)
  const range = num(p.range, 12)
  return Object.values(state.units)
    .filter((u) => u.player === src.player && u.location === 'board' && isCompany(state, u.id, p.datasheets) && returnableModels(state, u.id) > 0 && whollyWithinUnit(state, u.id, src.id, range))
    .map((u) => u.id).sort()
}

const leaveActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = leaveTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: leaveTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const need = num(paramOf(s, use.abilityId, 'successOn', 4), 4)
    const slain = returnableModels(s, target)
    let passes = 0
    for (let i = 0; i < slain; i++) {
      if (rollSum(ctx.roll({ purpose: 'ability', player: use.player, unitId: target, commandRerollable: false })) >= need) passes++
    }
    const back = returnSlainModels(ctx, target, passes, use.abilityId)
    announce(ctx, use, target, `Leave No Duardin Behind: ${slain} dice, ${passes} success${passes === 1 ? '' : 'es'}, ${back} slain model${back === 1 ? '' : 's'} returned`)
  },
}
const kharadronLeaveNoDuardin: EngineCodeHook = { name: CODE_LEAVE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: leaveActivate }

// ---------- KO-AB-1 Always Take What You Are Owed ----------
const CODE_OWED = 'kharadronTakeWhatYouAreOwed'
const controlLedger = (s: GameState): Record<string, number> => (s.mission.custom.koControl as Record<string, number> | undefined) ?? {}

const owedTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const p = paramsByCode(state, src.id, CODE_OWED)
  const range = num(p.range, 12)
  return Object.values(state.units)
    .filter((u) => u.player === src.player && u.location === 'board' && isCompany(state, u.id, p.datasheets) && whollyWithinUnit(state, u.id, src.id, range))
    .map((u) => u.id).sort()
}

const owedActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = owedTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: owedTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const dice = paramOf<DiceExpr>(s, use.abilityId, 'dice', 'D6')
    const amount = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
    // an empty effect carries the bonus: its id keys the ledger, so the bonus ends with the effect (start of your next turn)
    const eff = effectService.grant(ctx, target, {}, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn' })
    s.mission.custom = { ...s.mission.custom, koControl: { ...controlLedger(s), [eff.id]: amount } }
    announce(ctx, use, target, `Always Take What You Are Owed: +${amount} to ${s.units[target].name}'s control score until your next turn`)
  },
}

const kharadronTakeWhatYouAreOwed: EngineCodeHook = {
  name: CODE_OWED, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: owedActivate,
  producesAt: ['onObjectiveControl'],
  produce(ctx, entry, data) {
    const eff = entry.active
    if (!eff || data.contestingUnitId !== entry.holderUnitId) return null
    const amount = controlLedger(ctx.state)[eff.id]
    return amount ? { kind: 'stat', delta: amount } : null
  },
  // ledgers of effects that have expired are dropped
  ensureEffects(ctx) {
    const s = ctx.state
    const all = controlLedger(s)
    const ids = Object.keys(all)
    if (ids.length === 0) return
    const live = new Set<string>()
    for (const u of Object.values(s.units)) for (const e of u.effects) live.add(e.id)
    const keep = ids.filter((id) => live.has(id))
    if (keep.length === ids.length) return
    s.mission.custom = { ...s.mission.custom, koControl: Object.fromEntries(keep.map((id) => [id, all[id]])) }
  },
}

// ---------- KO-AB-2 Timed Charges ----------
const timedActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId) && enemiesInCombat(state, unitId as UnitId).length > 0,
  targets: (state, unitId) => (onBoard(state, unitId) ? enemiesInCombat(state, unitId as UnitId) : []),
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    const self = onBoard(s, use.unitId)
    if (!self || !target) return
    inflictMortal(ctx, use, target, num(paramOf(s, use.abilityId, 'mortal', 1), 1))
    // RULING: the Retreat ability needs the unit to still be in combat (a Retreat is how a unit in combat leaves it)
    if (!onBoard(s, self.id) || enemiesInCombat(s, self.id).length === 0) return
    const move = Math.max(...unitModels(s, self.id).map((m) => modelStats(s, m).M))
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: move, queue: [self.id], kind: 'retreat' })
  },
}
const kharadronTimedCharges: EngineCodeHook = { name: 'kharadronTimedCharges', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: timedActivate }

// ---------- KO-AB-6 Bomb Racks ----------
const bombTargets = (state: GameState, unitId: UnitId | null): UnitId[] =>
  onBoard(state, unitId) ? passedAcrossThisPhase(state, unitId as UnitId).filter((id) => !!onBoard(state, id) && state.units[id].player !== state.units[unitId as UnitId].player) : []

const bombActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = bombTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: bombTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const dice = paramOf<DiceExpr>(s, use.abilityId, 'mortal', 'D3')
    const dmg = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
    announce(ctx, use, target, `Bomb Racks: ${dmg} mortal damage on ${s.units[target].name}`)
    inflictMortal(ctx, use, target, dmg)
  },
}
const kharadronBombRacks: EngineCodeHook = { name: 'kharadronBombRacks', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: bombActivate }

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus / abilityModeBonus; null = no opinion) ----------
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)

// below -2 the bot passes instead of using the ability
export function kharadronAbilityTiming(state: GameState, player: PlayerId, code: string, _unitId: UnitId | null): number | null {
  if (code !== 'kharadronAssaultBoat') return null
  // the single use goes to a ride that ended within 12" of an enemy, where the charge is a real one
  const worth = transportedUnits(state, player).some((id) =>
    Object.values(state.units).some((e) => e.player !== player && e.location === 'board' && unitGap(state, id, e.id) <= 12.5))
  return worth ? 0 : -3
}

export function kharadronTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_PLY: {
      // carry the Skypike Company (it wants the charge), then the gunners; the general is better left to fight on foot
      const id = unit.datasheetId
      return id.endsWith('arkanaut-company') ? 8 : id.endsWith('arkanaut-company-gunners') ? 5 : id.endsWith('arkanaut-admiral') ? -6 : 0
    }
    case CODE_OWED:
      // the Company that is standing on an objective gains the most from a bigger control score
      return liveObjectives(state).some((o) => unitContestsObjective(state, unitId, o)) ? 4 : 0
    case 'kharadronBombRacks':
      // the weakest unit it flew over dies first
      return unit.player !== player ? Math.max(0, 6 - woundsLeft(state, unitId)) * 0.5 : null
    default:
      return null
  }
}

// the Timed Charges retreat: only run when the enemy it is stuck with has more Health left than the Skywardens (spec §8.3)
export function kharadronModeBonus(state: GameState, code: string, unitId: UnitId | null, optionId: string): number | null {
  if (code !== 'kharadronTimedCharges' || !unitId || !state.units[unitId]) return null
  const stay = optionId === 'mv:0:0'
  const theirs = enemiesInCombat(state, unitId).reduce((n, id) => n + woundsLeft(state, id), 0)
  const leave = theirs > woundsLeft(state, unitId)
  return stay ? (leave ? -1 : 1) : (leave ? 0.5 : -1)
}

// Ply the Skies, AI side (src/ai/utility.ts): the ride is only offered while a Company stands wholly within 3" of a Frigate that
// declares a move, so the bot sets the Companies up beside the Frigate, moves the Frigate first and moves it whenever it carries one.
const frigateOf = (state: GameState, player: PlayerId): UnitId | null =>
  Object.values(state.units).find((u) => u.player === player && u.location === 'board' && isFrigate(state, u.id))?.id ?? null

// riders the Frigate could take if it declared a move now (none once it has carried someone this phase)
function plyRiders(state: GameState, player: PlayerId): UnitId[] {
  const f = frigateOf(state, player)
  if (!f || !codeAbilityId(state, CODE_PLY) || state.phaseState.marks.includes(plyMark(f))) return []
  return passengers(state, f).filter((id) => isCompany(state, id, null))
}

// deployment: a Company wholly within the ride range of the Frigate (models as they would be placed) gains this much; null = no opinion
export function kharadronDeployBonus(state: GameState, player: PlayerId, unitId: UnitId, feet: Footprint[]): number | null {
  if (!isCompany(state, unitId, null) || !codeAbilityId(state, CODE_PLY)) return null
  const f = frigateOf(state, player)
  if (!f || feet.length === 0) return null
  const frig = liveModels(state, f)
  const range = plyRange(state)
  const inside = feet.filter((m) => frig.some((r) => whollyWithinOf(m, r, range))).length
  // every model counts toward the pull, the whole unit inside is what makes the ride legal
  return inside === feet.length ? 20 : (inside / feet.length) * 6
}

// movement: a Frigate with a rider beside it moves (Normal Move or Run) rather than standing still, and goes first
export function kharadronMoveBonus(state: GameState, player: PlayerId, unitId: UnitId, moveType: string): number | null {
  if (!isFrigate(state, unitId) || plyRiders(state, player).length === 0) return null
  return moveType === 'normal' ? 5 : moveType === 'advance' ? 3 : 0
}

export function kharadronActivationBonus(state: GameState, player: PlayerId, unitId: UnitId): number | null {
  if (!isFrigate(state, unitId) || state.phase !== 'movement' || plyRiders(state, player).length === 0) return null
  return 1000
}

export const kharadronHooks: Record<string, EngineCodeHook> = {
  kharadronPlyTheSkies, kharadronAssaultBoat, kharadronDisengage, kharadronFlask, kharadronNoRewardWithoutRisk,
  kharadronLeaveNoDuardin, kharadronTakeWhatYouAreOwed, kharadronTimedCharges, kharadronBombRacks,
}

