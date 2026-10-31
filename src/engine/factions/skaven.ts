// Skaven (Warpspark Clawpack) code hooks: docs/spec/factions/skaven.md (SKV-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/skaven/abilities.json uses. Activated abilities
// use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts); passive rules are declarative descriptors. What each hook
// needs from data:
//
//  skavenThreeClawsteps (BT-1)       army ability, movement phase / enemy, oncePerTurnArmy (= once in the enemy movement phase). Target = a
//        friendly unit that is not in combat and has a legal slide; resolve queues a Normal-Move slide (aos-moves writeMoveQueue,
//        SlideOpts.normalMove: up to the unit's Move, never through or into an enemy combat range).
//  skavenWarpstoneArmour (RA-1)      regiment reaction { opponentDeclaredAttack }, oncePerBattle. Offered when the declared attack targets a
//        friendly Stormfiends unit (readDeclaredAttack(state).targetUnitIds); grants it Ward (params.ward) until the end of the turn.
//  Endless Swarm of Rats (RA-2) is a plain descriptor read by skavenSeethingSwarm through the player's regimentAbilityId.
//  skavenWither (AB-2)               hero phase, a Spell (castingValue in data, abilities.ts rolls it); target = a visible enemy unit within
//        params.range; params.damage mortal damage.
//  skavenWillOfTheHornedRat (AB-1)   hero phase; target = a friendly unit wholly within params.range of the Grey Seer (itself included); the
//        hook rolls the D6: params.succeedOn+ adds the rolled number to the unit's control SCORE (not per model) until the start of
//        your next turn (ledger mission.custom.skvControl keyed by the granted effect's id, read by `produce` at onObjectiveControl).
//  skavenSeethingSwarm (AB-4)        end of any turn, oncePerTurn; returns params.returnModels slain models (D6 under Endless Swarm of Rats).
//  skavenSkitterleap (ENH-2)         a Spell on the general; redeploys it anywhere more than params.minEnemyDistance from every enemy unit
//        (redeploy.ts, markSetUp: no Move abilities in this turn's movement phase).
//  skavenScurryAway (ENH-3)          any combat phase; the descriptor's own D6 3+ gates it; the general's unit then Retreats at once with no
//        mortal damage (MoveQueue kind 'retreat'). Only offered while the general is in combat and a retreat spot exists.
//  skavenCageOfWarpLightning (ENH-4) any combat phase, oncePerBattle; the hook rolls the D6 (both results do something): 2+ the target has
//        Strike-last, 1 the general suffers 1 mortal damage.
//  Shock Gauntlets (AB-3, weapon CRIT_2_HITS 'D6'), Warp Lightning Blast (AB-5, weapon HIT_MORTAL) and Skilled Manipulator (ENH-1,
//  a Ward effect gated on friendlyKeywordWithin CLANRATS) are data only.
//
//  AI hints: skavenAbilityTiming / skavenTargetBonus below are read by src/ai/utility.ts (abilityTiming / abilityTargetBonus).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr } from '../../data/types'
import type { GameState, PlayerId, UnitId } from '../types'
import { diceExprMean } from '../dice'
import { effectService } from '../effects'
import { readDeclaredAttack } from '../declared'
import { losService } from '../los'
import { requestRedeploy } from '../redeploy'
import { boardUnitsOf, keywordsOf, modelStats, unitModels } from '../state'
import { weaponService } from '../weapons'
import { checkSlide, retreatOptions, writeMoveQueue, type SlideOpts } from './aos-moves'
import {
  announce, enemiesInCombat, inCombat, inflictMortal, isDatasheet, liveModels, liveObjectives, onBoard, paramOf, paramsByCode, returnSlainModels, returnableModels,
  unitContestsObjective, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const RA_SWARM = 'skaven.ability.endless-swarm-of-rats'
const CODE_CLAWSTEPS = 'skavenThreeClawsteps'
const CODE_ARMOUR = 'skavenWarpstoneArmour'
const CODE_WITHER = 'skavenWither'
const CODE_WILL = 'skavenWillOfTheHornedRat'
const CODE_SWARM = 'skavenSeethingSwarm'
const CODE_SKITTER = 'skavenSkitterleap'
const CODE_SCURRY = 'skavenScurryAway'
const CODE_CAGE = 'skavenCageOfWarpLightning'

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const unitsOf = (state: GameState, player: PlayerId): UnitId[] => boardUnitsOf(state, player).map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const isStormfiends = (state: GameState, id: UnitId): boolean => isDatasheet(state, id, null, 'stormfiends')

const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
const moveOf = (state: GameState, unitId: UnitId): number => Math.max(0, ...unitModels(state, unitId).map((m) => modelStats(state, m).M))

// ---------- a rough damage estimate for the AI hints (kept here so the engine does not import src/ai) ----------
const rollP = (target: number): number => Math.max(1 / 6, Math.min(5 / 6, (7 - target) / 6))

// expected damage `attackerId` deals to `targetId` with its ranged ('ranged') or melee ('melee') weapons, one full activation
function estimateDamage(state: GameState, attackerId: UnitId, targetId: UnitId, kind: 'ranged' | 'melee'): number {
  const defenders = liveModels(state, targetId)
  if (defenders.length === 0) return 0
  const dst = modelStats(state, defenders[0])
  let total = 0
  for (const m of liveModels(state, attackerId)) {
    for (const wid of m.weapons) {
      const w = weaponService.effectiveWeapon(state, m.id, wid)
      if (!w || w.kind !== kind) continue
      const hits = diceExprMean(w.A) * (w.skill === null ? 1 : rollP(w.skill))
      const mortal = w.abilities.find((a) => a.ability === 'HIT_MORTAL')
      if (mortal) { total += hits * (mortal.value === undefined ? 1 : diceExprMean(mortal.value)); continue }
      const crit = w.abilities.find((a) => a.ability === 'CRIT_2_HITS')
      const extra = crit ? (diceExprMean(w.A) / 6) * ((crit.value === undefined ? 2 : diceExprMean(crit.value)) - 1) : 0
      const need = dst.Sv + w.rend // rend worsens the save
      const unsaved = dst.noSave || need > 6 ? 1 : 1 - rollP(need)
      let dmg = (hits + extra) * rollP(w.wound) * unsaved * diceExprMean(w.D)
      if (dst.ward !== null) dmg *= 1 - rollP(dst.ward)
      total += dmg
    }
  }
  return total
}

// ---------- SKV-BT-1 Always Three Clawsteps Ahead ----------
const clawstepOpts: SlideOpts = { normalMove: true }
const PROBE = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2)

// a cheap legality probe: some short Normal-Move slide exists
function canClawstep(state: GameState, unitId: UnitId): boolean {
  const move = moveOf(state, unitId)
  if (move <= 0) return false
  const d = Math.min(1, move)
  return PROBE.some((a) => checkSlide(state, unitId, Math.cos(a) * d, Math.sin(a) * d, move, false, clawstepOpts).ok)
}

const clawstepTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] =>
  unitsOf(state, player ?? state.activePlayer).filter((id) => !losService.unitInCombat(state, id) && canClawstep(state, id))

const clawstepActivate: ActivatedAbilityHook = {
  canUse: () => true, // the target list (a unit with a legal slide) is the real gate; abilities.ts drops the ability when it is empty
  targets: clawstepTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const move = moveOf(s, target)
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: move, queue: [target], opts: clawstepOpts })
    announce(ctx, use, target, `Always Three Clawsteps Ahead: ${s.units[target].name} may make a Normal Move of up to ${move}"`)
  },
}
const skavenThreeClawsteps: EngineCodeHook = { name: CODE_CLAWSTEPS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: clawstepActivate }

// ---------- SKV-RA-1 Warpstone-Laced Armour ----------
// friendly Stormfiends the opponent's declared attack is aimed at
function armourTargets(state: GameState, player: PlayerId): UnitId[] {
  const d = readDeclaredAttack(state)
  if (!d || !d.targetUnitIds) return []
  const attacker = state.units[d.unitId]
  if (!attacker || attacker.player === player) return []
  return d.targetUnitIds.filter((id) => !!onBoard(state, id) && state.units[id].player === player && isStormfiends(state, id))
}

const armourActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => pickedOk(armourTargets(state, use.player ?? state.activePlayer), use),
  targets: ((state: GameState, _unitId: UnitId | null, player?: PlayerId) => armourTargets(state, player ?? other(state.activePlayer))) as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const ward = num(paramOf(ctx.state, use.abilityId, 'ward', 5), 5)
    effectService.grant(ctx, target, { feelNoPain: ward as 2 | 3 | 4 | 5 | 6 }, { sourceAbilityId: use.abilityId, sourceUnitId: target, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Warpstone-Laced Armour: ${ctx.state.units[target].name} has Ward (${ward}+) until the end of the turn`)
  },
}
const skavenWarpstoneArmour: EngineCodeHook = { name: CODE_ARMOUR, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: armourActivate }

// ---------- SKV-AB-2 Wither ----------
const byFewestWounds = (state: GameState) => (a: UnitId, b: UnitId): number => woundsLeft(state, a) - woundsLeft(state, b) || (a < b ? -1 : 1)

// visible enemy units within range of the caster, the weakest first
function witherTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const mage = onBoard(state, unitId)
  if (!mage) return []
  const range = num(paramsByCode(state, mage.id, CODE_WITHER).range, 13)
  const mine = liveModels(state, mage.id)
  return unitsOf(state, other(mage.player))
    .filter((id) => unitGap(state, mage.id, id) <= range + 1e-6 && mine.some((m) => losService.unitVisible(state, m.id, id)))
    .sort(byFewestWounds(state))
}

const witherActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(witherTargets(state, unitId), use),
  targets: witherTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const dmg = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'damage', 'D3'), { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
    announce(ctx, use, target, `Wither: ${dmg} mortal damage on ${s.units[target].name}`)
    inflictMortal(ctx, use, target, dmg)
  },
}
const skavenWither: EngineCodeHook = { name: CODE_WITHER, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: witherActivate }

// ---------- SKV-AB-1 Will of the Horned Rat ----------
const controlLedger = (s: GameState): Record<string, number> => (s.mission.custom.skvControl as Record<string, number> | undefined) ?? {}

// friendly units wholly within range of the Grey Seer; the Seer itself counts ("a friendly unit")
function willTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const seer = onBoard(state, unitId)
  if (!seer) return []
  const range = num(paramsByCode(state, seer.id, CODE_WILL).range, 13)
  return unitsOf(state, seer.player).filter((id) => id === seer.id || whollyWithinUnit(state, id, seer.id, range))
}

const willActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(willTargets(state, unitId), use),
  targets: willTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const n = ctx.rollExpr('D6', { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
    if (n < num(paramOf(s, use.abilityId, 'succeedOn', 3), 3)) {
      announce(ctx, use, target, `Will of the Horned Rat: rolled ${n}, nothing happens`)
      return
    }
    // an empty effect carries the bonus: its id keys the ledger, so the bonus ends with the effect (start of your next turn)
    const eff = effectService.grant(ctx, target, {}, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn' })
    s.mission.custom = { ...s.mission.custom, skvControl: { ...controlLedger(s), [eff.id]: n } }
    announce(ctx, use, target, `Will of the Horned Rat: +${n} to ${s.units[target].name}'s control score until your next turn`)
  },
}

const skavenWillOfTheHornedRat: EngineCodeHook = {
  name: CODE_WILL, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: willActivate,
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
    s.mission.custom = { ...s.mission.custom, skvControl: Object.fromEntries(keep.map((id) => [id, all[id]])) }
  },
}

// ---------- SKV-AB-4 Seething Swarm (+ SKV-RA-2 Endless Swarm of Rats) ----------
const swarmActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!unitId && returnableModels(state, unitId) > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const self = onBoard(s, use.unitId)
    if (!self) return
    const dice = s.players[use.player]?.regimentAbilityId === RA_SWARM ? 'D6' : paramOf<DiceExpr>(s, use.abilityId, 'returnModels', 'D3')
    const n = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: self.id, commandRerollable: false }).total
    const back = returnSlainModels(ctx, self.id, n, use.abilityId)
    announce(ctx, use, self.id, `Seething Swarm: ${dice} rolled ${n}, ${back} slain model${back === 1 ? '' : 's'} returned to ${self.name}`)
  },
}
const skavenSeethingSwarm: EngineCodeHook = { name: CODE_SWARM, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: swarmActivate }

// ---------- SKV-ENH-2 Skitterleap ----------
const skitterActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const bearer = onBoard(s, use.unitId)
    if (!bearer) return
    const minEnemyDistance = num(paramOf(s, use.abilityId, 'minEnemyDistance', 6), 6)
    // markSetUp: CORE-6.13, no Move abilities in this turn's movement phase (the hero phase comes first)
    requestRedeploy(s, { abilityId: use.abilityId, player: use.player, unitIds: [bearer.id], minEnemyDistance, markSetUp: true })
    announce(ctx, use, bearer.id, `Skitterleap: ${bearer.name} vanishes and will be set up again more than ${minEnemyDistance}" from every enemy unit`)
  },
}
const skavenSkitterleap: EngineCodeHook = { name: CODE_SKITTER, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: skitterActivate }

// ---------- SKV-ENH-3 Scurry Away ----------
const canScurry = (state: GameState, unitId: UnitId | null): boolean => {
  const u = onBoard(state, unitId)
  if (!u || !inCombat(state, u.id)) return false
  return retreatOptions(state, u.id, moveOf(state, u.id)).some((o) => o.id !== 'mv:0:0')
}

const scurryActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => canScurry(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const self = onBoard(s, use.unitId)
    if (!self || !inCombat(s, self.id)) return
    // applyRetreat deals no retreat damage; the queue offers the legal slides and 'stay'
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: moveOf(s, self.id), queue: [self.id], kind: 'retreat' })
    announce(ctx, use, self.id, `Scurry Away: ${self.name} may Retreat at once and suffers no mortal damage`)
  },
}
const skavenScurryAway: EngineCodeHook = { name: CODE_SCURRY, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: scurryActivate }

// ---------- SKV-ENH-4 Cage of Warp Lightning ----------
function cageTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(paramsByCode(state, src.id, CODE_CAGE).range, 6)
  const mine = liveModels(state, src.id)
  return unitsOf(state, other(src.player))
    .filter((id) => unitGap(state, src.id, id) <= range + 1e-6 && mine.some((m) => losService.unitVisible(state, m.id, id)))
}

const cageActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(cageTargets(state, unitId), use),
  targets: cageTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    const general = onBoard(s, use.unitId)
    if (!target || !general) return
    const n = ctx.rollExpr('D6', { purpose: 'ability', player: use.player, unitId: target.id, commandRerollable: false }).total
    if (n >= 2) {
      target.turn.fightsLast = true
      announce(ctx, use, target.id, `Cage of Warp Lightning: rolled ${n}, ${target.name} has Strike-last this phase`)
    } else {
      announce(ctx, use, general.id, `Cage of Warp Lightning: rolled 1, the lightning turns on ${general.name}`)
      inflictMortal(ctx, use, general.id, 1)
    }
  },
}
const skavenCageOfWarpLightning: EngineCodeHook = { name: CODE_CAGE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: cageActivate }

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus; null = no opinion) ----------
const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}

// enemy melee damage the unit stands to take from the enemy units it is in combat with that have not fought yet
const meleeThreat = (state: GameState, unitId: UnitId): number =>
  enemiesInCombat(state, unitId).filter((e) => !state.units[e]?.turn.foughtThisPhase).reduce((n, e) => n + estimateDamage(state, e, unitId, 'melee'), 0)

// a kill with Wither: some enemy within reach has few enough wounds left that D3 mortal damage finishes it (or a model of it)
const witherKill = (state: GameState, caster: UnitId): boolean =>
  witherTargets(state, caster).some((id) => woundsLeft(state, id) <= 3 || liveModels(state, id).some((m) => m.woundsRemaining <= 2))

// below -2 the bot passes instead of using the ability
export function skavenAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  switch (code) {
    case CODE_ARMOUR: {
      // once per battle: spend it on the first attack that really hurts the Stormfiends (expected damage 6 or more)
      const d = readDeclaredAttack(state)
      const targets = armourTargets(state, player)
      if (!d || targets.length === 0) return -3
      const dmg = estimateDamage(state, d.unitId, targets[0], d.phase === 'shooting' ? 'ranged' : 'melee')
      return dmg >= 6 ? 1 : -3
    }
    case CODE_SKITTER: {
      // only to get out of trouble: in combat, or an enemy close enough to charge; never while Wither has a kill on offer
      if (!unitId || !onBoard(state, unitId)) return -3
      const inFight = inCombat(state, unitId)
      const near = unitsOf(state, other(player)).some((id) => unitGap(state, unitId, id) <= 9)
      if (!inFight && !near) return -3
      if (!inFight && witherKill(state, unitId)) return -3
      return inFight ? 1 : 0
    }
    case CODE_SCURRY: {
      // keep it for the fight the general would lose: the enemy melee estimate reaches its remaining Health
      if (!unitId || !onBoard(state, unitId)) return -3
      return meleeThreat(state, unitId) >= woundsLeft(state, unitId) * 0.8 ? 1 : -3
    }
    case CODE_CAGE: {
      // the first combat phase where an enemy beside the general is in combat with a friendly unit and has not fought yet
      if (!unitId) return -3
      const worth = cageTargets(state, unitId).some((id) => !state.units[id].turn.foughtThisPhase && enemiesInCombat(state, id).length > 0)
      return worth ? 0 : -3
    }
    case CODE_WITHER:
      return witherTargets(state, unitId).length > 0 ? 0 : -3
    default:
      return null
  }
}

export function skavenTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_WITHER: {
      // a kill first (the fewest wounds left), else the Hero
      const left = woundsLeft(state, unitId)
      const kill = left <= 3 ? 6 - left : liveModels(state, unitId).some((m) => m.woundsRemaining <= 2) ? 2 : 0
      return kill + (keywordsOf(state, unitId).includes('HERO') ? 2 : 0)
    }
    case CODE_WILL: {
      // the unit holding the most closely contested objective gains the most; the Seer itself is the last resort
      const objs = liveObjectives(state).filter((o) => unitContestsObjective(state, unitId, o))
      if (objs.length === 0) return unitId === generalOf(state, player) ? -2 : 0
      const contested = objs.some((o) => boardUnitsOf(state, other(player)).some((e) => unitContestsObjective(state, e.id, o)))
      return 3 + (contested ? 3 : 0)
    }
    case CODE_CAGE: {
      // the enemy unit in combat with us that would hurt the most, and has not fought yet
      if (unit.turn.foughtThisPhase) return -4
      const mine = enemiesInCombat(state, unitId)
      return mine.reduce((n, id) => n + estimateDamage(state, unitId, id, 'melee'), 0) * 0.4 + (mine.length > 0 ? 2 : -2)
    }
    case CODE_CLAWSTEPS: {
      // Clanrats march for an objective they do not hold; the Cannon creeps toward a target; the Grey Seer stays home
      const ds = unit.datasheetId
      const objs = liveObjectives(state)
      const holding = objs.some((o) => unitContestsObjective(state, unitId, o))
      if (ds.endsWith('clanrats')) return objs.length > 0 && !holding ? 3 : 0
      if (ds.endsWith('warp-lightning-cannon')) {
        const gap = Math.min(99, ...unitsOf(state, other(player)).map((e) => unitGap(state, unitId, e)))
        return gap > 18 ? 2 : -1
      }
      if (ds.endsWith('grey-seer')) return -3
      return holding ? 0 : 1
    }
    default:
      return null
  }
}

export const skavenHooks: Record<string, EngineCodeHook> = {
  skavenThreeClawsteps, skavenWarpstoneArmour, skavenWither, skavenWillOfTheHornedRat, skavenSeethingSwarm, skavenSkitterleap, skavenScurryAway,
  skavenCageOfWarpLightning,
}
