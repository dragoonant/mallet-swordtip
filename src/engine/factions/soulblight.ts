// Soulblight Gravelords (Bloodcrave Hunt) code hooks: docs/spec/factions/soulblight-gravelords.md (SBG-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/soulblight/abilities.json uses. What each hook
// needs from data:
//
//  soulblightTheHunger (BT-2)         battle trait, passive marker; `onOwnFightResolved` (fight.ts, F12 C1): once a unit that has
//        params.keyword (VAMPIRE) has fought, it heals as many damage points as its melee attacks allocated (after wards).
//  soulblightEndlessLegions (RA-1)    regiment ability, movement phase / your, oncePerBattle, keywords CORE; params.dice / minEnemyDistance /
//        datasheet (suffix of the Skeletons warscroll). Targets = destroyed, not replaced Skeletons units of the player with room for a
//        set-up. Resolve rolls the dice, spawns a replacement of that many models (state.spawnUnitCopy, startingStrength = the roll) and
//        queues the set-up: friendly territory, no edge band, every model more than minEnemyDistance from every enemy.
//  soulblightRuinousChargers (RA-2)   regiment ability, charge phase / any, oncePerBattle; params.mortal / datasheet. Offered at the end of the
//        charge phase once the Blood Knights have charged and passed across an enemy unit (aos-moves passedAcrossThisPhase).
//  soulblightVileTransference (AB-1)  Spell (castingValue 6, abilities.ts rolls it); target = a visible enemy unit within params.range of the
//        caster. params.successOn / mortalPerSuccess / healPerSuccess. One die per point of the target's Health characteristic.
//  soulblightSkeletonLegion (AB-4)    combat phase / your; one D6 per slain model (returnableModels), each params.successOn returns one. The
//        Grave-Sand Shard is offered as a second mode while it is unspent and the general is within the shard's range of the unit.
//  soulblightGraveSandShard (ENH-1)   marker only: the descriptor's reaction timing is never offered by the loop; Skeleton Legion's modes
//        offer it, and using it records one use of the enhancement's ability (limit oncePerBattle).
//  soulblightCloudOfBats (ENH-2)      movement phase / your, oncePerBattle, keywords CORE; the bearer is lifted and set up again anywhere
//        more than params.minEnemyDistance from every enemy (redeploy.ts, the Magmic Tunnels path).
//  soulblightSpiritGale (ENH-4)       Spell (castingValue 7) cast by the bearer; 1 mortal damage on every enemy unit on the battlefield.
//  soulblightScentOfGore (AB-3)       descriptor { modifyRoll wound +1 } scope self; the gate closes unless the attack's target is damaged.
//  Riders of Ruin (passAcrossKeyword INFANTRY) and Aura of Night (ignoreNegativeModifiers save vs ranged) are plain descriptors;
//  F14 RULING: Rend is a negative modifier to the save roll (core 17.0), so Aura of Night ignores Rend too (attack.ts runStage).
//
//  AI hints: soulblightAbilityTiming / soulblightTargetBonus / soulblightModeBonus / soulblightChargeBonus below are read by
//  src/ai/utility.ts (abilityTiming / abilityTargetBonus / abilityModeBonus / scoreAction).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { AttackContext } from '../hooks'
import type { DiceExpr } from '../../data/types'
import type { GameState, ModelId, PlayerId, UnitId, Vec3 } from '../types'
import type { ModelPlacement } from '../actions'
import { losService } from '../los'
import { requestRedeploy, redeployOptions } from '../redeploy'
import { modelStats, spawnUnitCopy } from '../state'
import {
  announce, enemiesInCombat, hasKeyword, healUnit, inflictMortal, isDamaged, isDatasheet, liveModels, liveObjectives, onBoard, paramOf, returnSlainModels,
  returnableModels, unitContestsObjective, unitsWithin,
} from './aos-common'
import { passedAcrossThisPhase, reinforcementOptions, unitsPassedAcrossPaths, writePlaceRequest } from './aos-moves'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const CODE_HUNGER = 'soulblightTheHunger'
const CODE_LEGIONS = 'soulblightEndlessLegions'
const CODE_CHARGERS = 'soulblightRuinousChargers'
const CODE_TRANSFERENCE = 'soulblightVileTransference'
const CODE_SKELETON = 'soulblightSkeletonLegion'
const CODE_SHARD = 'soulblightGraveSandShard'
const CODE_BATS = 'soulblightCloudOfBats'
const CODE_GALE = 'soulblightSpiritGale'
const CODE_SCENT = 'soulblightScentOfGore'

const myUnits = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()
const enemyUnits = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player !== player && u.location === 'board').map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const abilityByCode = (state: GameState, code: string, player?: PlayerId) =>
  Object.values(state.abilities).find((a) => a.code === code && (player === undefined || state.players[player]?.regimentAbilityId === a.id || state.players[player]?.battleTraitIds.includes(a.id)))

// ---------- SBG-BT-2 The Hunger ----------
const soulblightTheHunger: EngineCodeHook = {
  name: CODE_HUNGER, kind: 'ability', hook: 'onStatQuery', run: noop,
  onOwnFightResolved(ctx, { ability, unitId, damageAllocated }) {
    const s = ctx.state
    const unit = onBoard(s, unitId)
    // a unit destroyed during its own Fight gets nothing; Skeletons and other non-Vampires are not healed
    if (!unit || damageAllocated <= 0 || !hasKeyword(s, unitId, String(ability.params?.keyword ?? 'VAMPIRE'))) return
    const healed = healUnit(ctx, unitId, damageAllocated, ability.id)
    if (healed > 0) {
      ctx.emit({
        type: 'AbilityTriggered', abilityId: ability.id, sourceUnitId: unitId, targetUnitId: unitId, player: unit.player,
        summary: `The Hunger: ${unit.name} heals ${healed} damage`,
      })
    }
  },
}

// ---------- SBG-AB-3 The Scent of Gore ----------
// the descriptor's +1 wound only counts against a damaged target (some model below its Health; slain models alone do not count)
const soulblightScentOfGore: EngineCodeHook = {
  name: CODE_SCENT, kind: 'ability', hook: 'onWoundRoll', hooks: ['onWoundRoll'], run: noop,
  gate(state, _holder, _entry, data) {
    const attack = data?.attack as AttackContext | undefined
    return !attack || (!!onBoard(state, attack.targetUnitId) && isDamaged(state, attack.targetUnitId))
  },
}

// ---------- SBG-AB-1 Vile Transference ----------
// the target's printed per-model Health (the first live model's Health characteristic)
const healthOf = (state: GameState, unitId: UnitId): number => {
  const m = liveModels(state, unitId)[0]
  return m ? modelStats(state, m).W : 0
}

function transferenceTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(abilityByCode(state, CODE_TRANSFERENCE)?.params?.range, 6)
  const mine = liveModels(state, me.id)
  return enemyUnits(state, me.player).filter((id) => unitsWithin(state, me.id, id, range) && mine.some((m) => losService.unitVisible(state, m.id, id)))
}

const transferenceActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = transferenceTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: transferenceTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    const self = onBoard(s, use.unitId)
    if (!target || !self || !onBoard(s, target)) return
    const dice = healthOf(s, target)
    if (dice <= 0) return
    const successOn = num(paramOf(s, use.abilityId, 'successOn', 5), 5)
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: dice, mode: 'perDie', unitId: self.id, targetUnitId: target, commandRerollable: false })
    const hits = roll.final.filter((d) => d >= successOn).length
    const name = s.units[target].name
    announce(ctx, use, target, `Vile Transference: ${dice} dice, ${hits} success${hits === 1 ? '' : 'es'} against ${name}`)
    inflictMortal(ctx, use, target, hits * num(paramOf(s, use.abilityId, 'mortalPerSuccess', 1), 1))
    // the heal counts every 5+, whatever the target's wards saved
    if (hits > 0 && onBoard(s, self.id)) healUnit(ctx, self.id, hits * num(paramOf(s, use.abilityId, 'healPerSuccess', 1), 1), use.abilityId)
  },
}
const soulblightVileTransference: EngineCodeHook = { name: CODE_TRANSFERENCE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: transferenceActivate }

// ---------- SBG-ENH Spirit Gale ----------
const galeActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const caster = onBoard(s, use.unitId)
    if (!caster) return
    const targets = enemyUnits(s, caster.player)
    const each = num(paramOf(s, use.abilityId, 'mortal', 1), 1)
    announce(ctx, use, null, `Spirit Gale: ${targets.length} enemy unit${targets.length === 1 ? '' : 's'} on the battlefield suffer ${each} mortal damage`)
    for (const id of targets) if (onBoard(s, id)) inflictMortal(ctx, use, id, each)
  },
}
const soulblightSpiritGale: EngineCodeHook = { name: CODE_GALE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: galeActivate }

// ---------- SBG-ENH Grave-Sand Shard / SBG-AB-4 Skeleton Legion ----------
// the army's Grave-Sand Shard (an enhancement ability borne by the general) while it is unspent and the general is on the table
function shardOf(state: GameState, player: PlayerId): { abilityId: string; general: UnitId; range: number; bonusRoll: number } | null {
  for (const a of Object.values(state.abilities)) {
    if (a.code !== CODE_SHARD || a.source !== 'enhancement' || !a.bearerModelId) continue
    const holder = state.models[a.bearerModelId]?.unitId
    if (!holder || state.units[holder]?.player !== player || !onBoard(state, holder)) continue
    if (state.players[player].abilityUses.some((u) => u.abilityId === a.id)) continue
    const base = num(abilityByCodeParams(state, 'soulblightSkeletonLegion').successOn, 6)
    const shardOn = num(abilityByCodeParams(state, 'soulblightSkeletonLegion').shardSuccessOn, base - num(a.params?.bonus, 1))
    return { abilityId: a.id, general: holder, range: num(a.params?.range, 9), bonusRoll: shardOn }
  }
  return null
}
const abilityByCodeParams = (state: GameState, code: string): Record<string, unknown> => abilityByCode(state, code)?.params ?? {}

const shardApplies = (state: GameState, player: PlayerId, unitId: UnitId | null): boolean => {
  const sh = shardOf(state, player)
  return !!sh && !!unitId && !!onBoard(state, unitId) && unitsWithin(state, unitId, sh.general, sh.range)
}

const legionActivate: ActivatedAbilityHook & { modesFor?(state: GameState, unitId: UnitId | null, player: PlayerId): { id: string; label: string }[] } = {
  canUse: (state, unitId) => !!unitId && returnableModels(state, unitId) > 0,
  modesFor: (state, unitId, player) => (shardApplies(state, player, unitId)
    ? [{ id: 'plain', label: 'Skeleton Legion: roll for each slain model' }, { id: 'shard', label: 'Use the Grave-Sand Shard: +1 to each roll (once per battle)' }]
    : []),
  resolve(ctx, use) {
    const s = ctx.state
    const unit = onBoard(s, use.unitId)
    if (!unit) return
    const slain = returnableModels(s, unit.id)
    if (slain <= 0) return
    let need = num(paramOf(s, use.abilityId, 'successOn', 6), 6)
    let shardNote = ''
    const shard = use.modeId === 'shard' ? shardOf(s, use.player) : null
    if (shard && shardApplies(s, use.player, unit.id)) {
      s.players[use.player].abilityUses.push({ abilityId: shard.abilityId, unitId: shard.general, round: s.round, turn: s.activePlayer, phase: s.phase })
      need = shard.bonusRoll
      shardNote = ' with the Grave-Sand Shard'
    }
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: slain, mode: 'perDie', unitId: unit.id, commandRerollable: false })
    const passes = roll.final.filter((d) => d >= need).length
    const back = returnSlainModels(ctx, unit.id, passes, use.abilityId)
    announce(ctx, use, unit.id, `Skeleton Legion${shardNote}: ${slain} dice, ${passes} success${passes === 1 ? '' : 'es'}, ${back} slain model${back === 1 ? '' : 's'} returned`)
  },
}
const soulblightSkeletonLegion: EngineCodeHook = { name: CODE_SKELETON, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: legionActivate }
// the reaction timing is never offered by the loop: this only has to exist so that the enhancement's ability resolves to a hook
const soulblightGraveSandShard: EngineCodeHook = {
  name: CODE_SHARD, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: { canUse: () => false, resolve: noop },
}

// ---------- SBG-ENH Cloud of Bats ----------
const batsDistance = (state: GameState): number => num(abilityByCodeParams(state, CODE_BATS).minEnemyDistance, 6)

const batsActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId) && redeployOptions(state, unitId as UnitId, batsDistance(state), 1).length > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const unitId = use.unitId
    if (!unitId || !onBoard(s, unitId)) return
    requestRedeploy(s, { abilityId: use.abilityId, player: use.player, unitIds: [unitId], minEnemyDistance: num(paramOf(s, use.abilityId, 'minEnemyDistance', 6), 6), markSetUp: true })
    announce(ctx, use, unitId, `Cloud of Bats: ${s.units[unitId].name} dissolves into a swarm of bats`)
  },
}
const soulblightCloudOfBats: EngineCodeHook = { name: CODE_BATS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: batsActivate }

// ---------- SBG-RA-1 Endless Legions ----------
const legionsParams = (state: GameState): Record<string, unknown> => abilityByCodeParams(state, CODE_LEGIONS)

function legionsTargets(state: GameState, player: PlayerId): UnitId[] {
  const suffix = String(legionsParams(state).datasheet ?? 'deathrattle-skeletons')
  const dead = Object.values(state.units)
    .filter((u) => u.player === player && u.location === 'destroyed' && !u.replaced && isDatasheet(state, u.id, null, suffix) && (u.destroyedModels?.length ?? 0) > 0)
    .map((u) => u.id).sort()
  if (dead.length === 0) return []
  // room for at least one model wholly in friendly territory, more than the set distance from every enemy (the roll is made afterwards)
  const shape = { edgeBand: false, minEnemyDistance: num(legionsParams(state).minEnemyDistance, 6) }
  const snap = state.units[dead[0]].destroyedModels[0]
  return reinforcementOptions(state, player, [snap], state.datasheets[state.units[dead[0]].datasheetId]?.coherencyRange, 1, shape).length > 0 ? dead : []
}

const legionsActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => legionsTargets(state, use.player ?? state.activePlayer).length > 0,
  targets: ((state: GameState, _unitId: UnitId | null, player?: PlayerId) => legionsTargets(state, player ?? state.activePlayer)) as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const s = ctx.state
    const orig = use.targetUnitIds[0]
    if (!orig || !s.units[orig] || s.units[orig].location !== 'destroyed' || s.units[orig].replaced) return
    const dice = paramOf<DiceExpr>(s, use.abilityId, 'dice', 'D6')
    const n = Math.max(1, ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: orig, commandRerollable: false }).total)
    const copy = spawnUnitCopy(s, orig, n)
    copy.replacementOf = orig
    s.units[orig].replaced = true
    announce(ctx, use, copy.id, `Endless Legions: a new ${copy.name} unit of ${n} model${n === 1 ? '' : 's'} claws its way out of the ground`)
    writePlaceRequest(s, { abilityId: use.abilityId, player: use.player, unitId: copy.id, replacementOf: orig, edgeBand: false, minEnemyDistance: num(paramOf(s, use.abilityId, 'minEnemyDistance', 6), 6) })
  },
}
const soulblightEndlessLegions: EngineCodeHook = { name: CODE_LEGIONS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: legionsActivate }

// ---------- SBG-RA-2 Ruinous Chargers ----------
const knightsOf = (state: GameState, player: PlayerId): UnitId | null => {
  const suffix = String(abilityByCodeParams(state, CODE_CHARGERS).datasheet ?? 'blood-knights')
  return myUnits(state, player).find((id) => isDatasheet(state, id, null, suffix)) ?? null
}
// the enemy units the Blood Knights' charge passed across that are still on the battlefield (empty unless they charged this turn)
function chargersTargets(state: GameState, player: PlayerId): UnitId[] {
  const k = knightsOf(state, player)
  if (!k || !state.units[k].turn.chargedThisTurn) return []
  return passedAcrossThisPhase(state, k).filter((id) => !!onBoard(state, id) && state.units[id].player !== player)
}

const chargersActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => chargersTargets(state, use.player ?? state.activePlayer).length > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const knights = knightsOf(s, use.player)
    if (!knights) return
    const dice = paramOf<DiceExpr>(s, use.abilityId, 'mortal', 'D3')
    for (const target of chargersTargets(s, use.player)) {
      // a separate roll for each unit; the mortal damage is credited to the Blood Knights
      const dmg = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
      announce(ctx, use, target, `Ruinous Chargers: ${dmg} mortal damage on ${s.units[target].name}`)
      ctx.services.hooks.apply(ctx, { kind: 'ability', id: use.abilityId, unitId: knights, modelId: null }, { kind: 'request', mortalWounds: [{ targetUnitId: target, count: dmg }] })
    }
  },
}
const soulblightRuinousChargers: EngineCodeHook = { name: CODE_CHARGERS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: chargersActivate }

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus / abilityModeBonus / scoreAction; null = no opinion) ----------
const P_CAST6 = 26 / 36
const P_CAST7 = 21 / 36

// expected value (in mortal damage) of the Lord's best Vile Transference target, and of the army's Spirit Gale
function transferenceValue(state: GameState, lord: UnitId): number {
  let best = 0
  for (const t of transferenceTargets(state, lord)) best = Math.max(best, healthOf(state, t) / 3)
  return best <= 0 ? 0 : P_CAST6 * best * (isDamaged(state, lord) ? 1.5 : 1)
}
function galeValue(state: GameState, caster: UnitId): number {
  const me = state.units[caster]
  return me ? P_CAST7 * enemyUnits(state, me.player).length : 0
}

// a general in combat with more Health than it has left wants the Cloud of Bats; otherwise (from round 2) it jumps to an objective it
// does not already stand on, that is not ours yet and that no enemy unit can reach quickly (nothing within 9" of the objective's centre)
function batsWorthIt(state: GameState, player: PlayerId, general: UnitId): boolean {
  const mine = woundsLeft(state, general)
  const foes = enemiesInCombat(state, general)
  if (foes.length > 0) return foes.reduce((a, id) => a + woundsLeft(state, id), 0) > mine
  if (state.round < 2) return false
  if (liveObjectives(state).some((o) => unitContestsObjective(state, general, o))) return false
  const foeModels = enemyUnits(state, player).flatMap((id) => liveModels(state, id))
  return liveObjectives(state).some((o) => o.controller !== player && foeModels.every((m) => Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z) > 9))
}

// below -2 the bot passes instead. The ability-use options carry no unit, so the casters (the Vampire Lord and the bearer of the
// enhancements, which is always the general) are looked up as the player's general
export function soulblightAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  const general = unitId ?? state.players[player]?.warlordUnitId ?? null
  switch (code) {
    case CODE_TRANSFERENCE:
      // both spells share the Lord's single cast: the better of the two wins
      return general && galeAvailable(state, player) && galeValue(state, general) > transferenceValue(state, general) ? -3 : 0.5
    case CODE_GALE:
      return general && transferenceValue(state, general) >= galeValue(state, general) && transferenceTargets(state, general).length > 0 ? -3 : 0
    case CODE_BATS:
      return general && onBoard(state, general) && batsWorthIt(state, player, general) ? 0 : -3
    default:
      return null
  }
}

// does the player's general bear Spirit Gale (so it competes with Vile Transference for the cast)?
const galeAvailable = (state: GameState, player: PlayerId): boolean => {
  const g = state.players[player]?.warlordUnitId
  return !!g && Object.values(state.abilities).some((a) => a.code === CODE_GALE && a.source === 'enhancement' && !!a.bearerModelId && state.models[a.bearerModelId]?.unitId === g)
}

export function soulblightTargetBonus(state: GameState, _player: PlayerId, code: string, unitId: UnitId): number | null {
  if (code !== CODE_TRANSFERENCE || !state.units[unitId]) return null
  // one die per point of Health: the beefiest unit in reach
  return healthOf(state, unitId)
}

export function soulblightModeBonus(state: GameState, code: string, unitId: UnitId | null, optionId: string): number | null {
  if (code !== CODE_SKELETON || !unitId || !state.units[unitId]) return null
  // the once-per-battle shard is worth it for a unit that has lost a good few models
  if (optionId === 'shard') return returnableModels(state, unitId) >= 4 ? 2 : -1
  return 0
}

// a Blood Knights charge path that crosses enemy units earns Ruinous Chargers a victim: a bonus per unit crossed while it is unspent
export function soulblightChargeBonus(state: GameState, player: PlayerId, unitId: UnitId, placements: ModelPlacement[]): number | null {
  const reg = state.abilities[state.players[player]?.regimentAbilityId ?? '']
  if (!reg || reg.code !== CODE_CHARGERS || state.players[player].abilityUses.some((u) => u.abilityId === reg.id)) return null
  if (!isDatasheet(state, unitId, null, 'blood-knights')) return null
  const paths: Record<ModelId, Vec3[]> = {}
  for (const p of placements) {
    const m = state.models[p.modelId]
    if (m) paths[m.id] = p.path && p.path.length >= 2 ? p.path : [m.pos, p.pos]
  }
  const crossed = unitsPassedAcrossPaths(state, unitId, paths).filter((id) => state.units[id]?.player !== player)
  return Math.min(2, crossed.length) * 4
}

export const soulblightHooks: Record<string, EngineCodeHook> = {
  soulblightTheHunger, soulblightScentOfGore, soulblightVileTransference, soulblightSpiritGale, soulblightSkeletonLegion,
  soulblightGraveSandShard, soulblightCloudOfBats, soulblightEndlessLegions, soulblightRuinousChargers,
}
