// Stormcast Eternals (Vigilant Brotherhood) code hooks: docs/spec/factions/stormcast-eternals.md (SCE-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/stormcast/abilities.json uses. What each hook
// needs from data:
//
//  stormcastShieldOfAzyr (BT-1)       command / your, oncePerTurnArmy; declare any friendly unit; descriptor `duration` + params.grant
//        (Effect[]) are granted to it. The effects sit in params, not `effect`, so no passive ever reads them.
//  stormcastStormCharge (BT-2)        charge / your with params.window 'phaseStart' (the 'chargeStart' window), oncePerBattle; declare a
//        friendly unit that is not in combat; grants params.grant (chargeAfterAdvance).
//  stormcastQuicksilverDraught (ENH)  fight / any, oncePerBattle, no declare (the bearer's unit); grants params.grant (fightsFirst).
//  stormcastStrikeWhereNeeded (RA-1)  aos-common freeRetreatHook: reaction to a declared Retreat, no retreat damage, may still charge.
//  stormcastBlazeOfGlory (RA-2)       fight / any, oncePerBattle; declare a friendly unit in combat. Leaves an empty marker effect on it
//        for the phase; `onOwnModelSlain` (attack.ts, dispatched for the regiment ability) rolls params.succeedOn for each slain model of
//        a marked unit and holds params.mortal mortal damage on an enemy unit in combat with it.
//  stormcastNullPendant (ENH)         endOfTurn / any, oncePerBattle. One D6 per enemy unit contesting an objective the bearer's unit
//        contests; every roll of params.succeedOn+ is kept in mission.custom.sceNull and `produce` at onObjectiveControl subtracts it from
//        that unit's control score for this turn's check (the caller keeps CORE-17.4's floor of 1). ensureEffects keeps the bearer's
//        battle-long marker effect, which is what `produce` answers on.
//  stormcastDeliverJudgement (AB-1)   fight / any, oncePerBattle; declare a friendly non-Hero unit wholly within params.range of the
//        Lord-Vigilant; grantExtraFight (phases/fight.ts) with Strike-last after the first fight.
//  stormcastPlanTheAttack (AB-2)      command / your; the mode is an objective the player does not control (best first). The pick is kept
//        in mission.custom.scePlan; ensureEffects puts an untilEndOfTurn marker on every friendly unit while it names the current turn and
//        `produce` at onHitRoll adds params.modifier to melee attacks on a unit contesting that objective.
//  stormcastCleansingFires (AB-3)     command / your, declared roll D6 3+ in data; declare a visible enemy unit within params.range; a
//        dice per model, params.successOn+ is 1 mortal damage.
//  stormcastSenseUnholySorcery (AB-4) passive. `adjustFeelNoPain` = Ward (params.ward) while the unit's params.token is on the table;
//        `afterWardRoll` removes the token when a ward roll for the unit shows an unmodified 1. The token comes from the patrol entry.
//  stormcastStalwartDefenders (AB-7)  passive marker (ensureEffects), `produce` at onObjectiveControl adds params.control to the holder's
//        control score on an objective wholly within its player's territory.
// Hallowed Scrolls, Morrda's Talon, Heralds of Righteousness (extraChargeDice) and Skirmishers (datasheet coherencyRange) are plain data.
import type { ActivatedAbilityHook, AbilityUse } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { Effect } from '../../data/types'
import type { EngineContext } from '../modules'
import type { GameState, Objective, PlayerId, UnitId } from '../types'
import { ENGAGEMENT_H, EPS, OBJECTIVE_MARKER_RADIUS, distance, whollyWithinPolygon, type Footprint } from '../geometry'
import { attackService, deferMortalAfterFight } from '../attack'
import { grantExtraFight } from '../phases/fight'
import { chargeDiceCount } from '../phases/charge'
import { effectService } from '../effects'
import { losService } from '../los'
import { objectiveService } from '../objectives'
import { rollSum } from '../dice'
import { keywordsOf, modelStats, territoryOf } from '../state'
import {
  announce, freeRetreatHook, inflictMortal, liveModels, liveObjectives, onBoard, paramsByCode, removeTokens, unitContestsObjective, unitGap,
  whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const friendlyBoard = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()
const enemyBoard = (state: GameState, player: PlayerId): UnitId[] => friendlyBoard(state, other(player))
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const playerOf = (state: GameState, use: Partial<AbilityUse>): PlayerId => use.player ?? state.activePlayer
const custom = <T>(state: GameState, key: string): Record<string, T> => (state.mission.custom[key] as Record<string, T> | undefined) ?? {}
const setCustom = (state: GameState, key: string, value: unknown): void => { state.mission.custom = { ...state.mission.custom, [key]: value } }

// puts one battle-long (empty) effect on every unit that carries an ability with this code (datasheet or enhancement) and has none yet
// (the passive producers below only answer on an active effect). Idempotent.
function ensureBattleEffect(ctx: EngineContext, code: string): void {
  const s = ctx.state
  for (const ab of Object.values(s.abilities)) {
    if (ab.code !== code) continue
    const holders: UnitId[] = ab.source === 'enhancement' && ab.bearerModelId
      ? [s.models[ab.bearerModelId]?.unitId].filter((x): x is UnitId => !!x)
      : Object.values(s.units).filter((u) => (s.datasheets[u.datasheetId]?.abilities ?? []).includes(ab.id)).map((u) => u.id)
    for (const id of holders) {
      const unit = s.units[id]
      if (!unit || unit.location === 'destroyed' || unit.effects.some((e) => e.sourceAbilityId === ab.id)) continue
      effectService.grant(ctx, unit.id, {}, { sourceAbilityId: ab.id, sourceUnitId: unit.id, scope: { who: 'self' }, duration: 'battle' })
    }
  }
}

// ---------- SCE-BT-1 Shield of Azyr / SCE-BT-2 Storm Charge / SCE-ENH Quicksilver Draught ----------
// One shape, three descriptors: grant params.grant for the descriptor's duration to a friendly unit (or to the bearer's own).
type GrantMode = 'friendly' | 'friendlyNotInCombat' | 'bearer'
type ExtActivated = ActivatedAbilityHook & { targets?(state: GameState, unitId: UnitId | null, player?: PlayerId): UnitId[] }

function grantHook(name: string, mode: GrantMode, said: (unitName: string) => string): EngineCodeHook {
  const targets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] =>
    friendlyBoard(state, player ?? state.activePlayer).filter((id) => mode !== 'friendlyNotInCombat' || !losService.unitInCombat(state, id))
  const activate: ExtActivated = {
    canUse(state, unitId, use) {
      if (mode === 'bearer') return !!onBoard(state, unitId)
      const list = targets(state, null, playerOf(state, use))
      const picked = use.targetUnitIds?.[0]
      return list.length > 0 && (!picked || list.includes(picked))
    },
    targets: mode === 'bearer' ? undefined : targets,
    resolve(ctx, use) {
      const s = ctx.state
      const ab = s.abilities[use.abilityId]
      const target = mode === 'bearer' ? use.unitId : use.targetUnitIds[0]
      if (!ab || !target || !onBoard(s, target)) return
      const effects = (ab.params?.grant ?? []) as Effect[]
      effectService.grant(ctx, target, effects, {
        sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: ab.duration ?? 'untilEndOfTurn',
      })
      announce(ctx, use, target, said(s.units[target].name))
    },
  }
  return { name, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate }
}

const CODE_SHIELD = 'stormcastShieldOfAzyr'
const CODE_STORM = 'stormcastStormCharge'
const CODE_QUICK = 'stormcastQuicksilverDraught'
const stormcastShieldOfAzyr = grantHook(CODE_SHIELD, 'friendly', (n) => `Shield of Azyr: ${n} has Ward (5+) until the start of your next turn`)
const stormcastStormCharge = grantHook(CODE_STORM, 'friendlyNotInCombat', (n) => `Storm Charge: ${n} can charge this turn even if it ran`)
const stormcastQuicksilverDraught = grantHook(CODE_QUICK, 'bearer', (n) => `Quicksilver Draught: ${n} has Strike-first for the rest of the phase`)

// ---------- SCE-RA-1 Strike Where Needed ----------
const stormcastStrikeWhereNeeded = freeRetreatHook('stormcastStrikeWhereNeeded', 'Strike Where Needed: a retreat this turn costs no mortal damage and the unit can still charge')

// ---------- SCE-RA-2 Blaze of Glory ----------
const CODE_BLAZE = 'stormcastBlazeOfGlory'

const blazeTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] =>
  friendlyBoard(state, player ?? state.activePlayer).filter((id) => losService.unitInCombat(state, id))

const blazeActivate: ExtActivated = {
  canUse(state, _unitId, use) {
    const list = blazeTargets(state, null, playerOf(state, use))
    const picked = use.targetUnitIds?.[0]
    return list.length > 0 && (!picked || list.includes(picked))
  },
  targets: blazeTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    effectService.grant(ctx, target, {}, { sourceAbilityId: use.abilityId, sourceUnitId: target, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    announce(ctx, use, target, `Blaze of Glory: models slain from ${ctx.state.units[target].name} this phase may strike back`)
  },
}

const stormcastBlazeOfGlory: EngineCodeHook = {
  name: CODE_BLAZE, kind: 'ability', hook: 'onModelDestroyed', run: noop, activate: blazeActivate,
  onOwnModelSlain(ctx, { ability, unitId, model }) {
    const s = ctx.state
    const unit = s.units[unitId]
    if (!unit || !unit.effects.some((e) => e.sourceAbilityId === ability.id)) return
    const owner = unit.player
    // "in combat with that unit": judged from where the slain model stood (it was the last when the unit is gone) and from the survivors
    const foes = enemyBoard(s, owner).filter((e) =>
      liveModels(s, e).some((m) => distance(model, m) <= ENGAGEMENT_H + EPS) || unitGap(s, unitId, e) <= ENGAGEMENT_H + EPS)
    const need = num(ability.params?.succeedOn, 4)
    const roll = ctx.rollExpr('D6', { purpose: 'ability', player: owner, unitId, commandRerollable: false }).total
    if (roll < need) {
      ctx.emit({ type: 'AbilityTriggered', abilityId: ability.id, sourceUnitId: unitId, targetUnitId: null, summary: `Blaze of Glory: rolled ${roll}, the vengeance fizzles`, player: owner })
      return
    }
    const slayer = ctx.state.phaseState.attack ? foes.find((id) => id === ctx.state.phaseState.attack?.attackerUnitId) : undefined
    const target = slayer ?? [...foes].sort((a, b) => woundsLeft(s, a) - woundsLeft(s, b) || (a < b ? -1 : 1))[0]
    if (!target) {
      ctx.emit({ type: 'AbilityTriggered', abilityId: ability.id, sourceUnitId: unitId, targetUnitId: null, summary: `Blaze of Glory: rolled ${roll}, but no enemy unit is in combat with it`, player: owner })
      return
    }
    const mortal = num(ability.params?.mortal, 1)
    const inSequence = !!s.phaseState.attack && (s.phase === 'fight' || s.phase === 'shooting')
    ctx.emit({
      type: 'AbilityTriggered', abilityId: ability.id, sourceUnitId: unitId, targetUnitId: target, player: owner,
      summary: `Blaze of Glory: rolled ${roll}, ${mortal} mortal damage${inSequence ? ' once the attack has finished' : ''}`,
    })
    if (inSequence) deferMortalAfterFight(s, { targetUnitId: target, count: mortal, source: ability.id, player: owner })
    else attackService.queueMortalWounds(ctx, target, mortal, ability.id, false)
  },
}

// ---------- SCE-ENH-4 Null Pendant ----------
interface NullRoll { roll: number; round: number; turn: PlayerId; by: PlayerId }
const nullLedger = (s: GameState): Record<UnitId, NullRoll> => custom<NullRoll>(s, 'sceNull')

// enemy units contesting any objective the bearer's unit contests
function pendantTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const objs = liveObjectives(state).filter((o) => unitContestsObjective(state, me.id, o))
  if (objs.length === 0) return []
  return enemyBoard(state, me.player).filter((e) => objs.some((o) => unitContestsObjective(state, e, o)))
}

const pendantActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => pendantTargets(state, unitId).length > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const me = onBoard(s, use.unitId)
    if (!me) return
    const need = num(s.abilities[use.abilityId]?.params?.succeedOn, 2)
    const ledger = { ...nullLedger(s) }
    const said: string[] = []
    for (const e of pendantTargets(s, me.id)) {
      const roll = rollSum(ctx.roll({ purpose: 'ability', player: use.player, unitId: me.id, targetUnitId: e, commandRerollable: false }))
      if (roll >= need) {
        ledger[e] = { roll, round: s.round, turn: s.activePlayer, by: me.player }
        said.push(`${s.units[e].name} -${roll}`)
      } else said.push(`${s.units[e].name} unaffected`)
    }
    setCustom(s, 'sceNull', ledger)
    announce(ctx, use, null, `Null Pendant: ${said.join(', ')}`)
  },
}

const stormcastNullPendant: EngineCodeHook = {
  name: 'stormcastNullPendant', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: pendantActivate,
  producesAt: ['onObjectiveControl'],
  produce(ctx, entry, data) {
    if (!entry.active) return null
    const s = ctx.state
    const holder = onBoard(s, entry.holderUnitId)
    const contesting = typeof data.contestingUnitId === 'string' ? data.contestingUnitId : null
    const rec = contesting ? nullLedger(s)[contesting] : undefined
    if (!holder || !rec || rec.by !== holder.player || rec.round !== s.round || rec.turn !== s.activePlayer) return null
    return { kind: 'stat', delta: -rec.roll }
  },
  ensureEffects(ctx) {
    ensureBattleEffect(ctx, 'stormcastNullPendant')
    // rolls from an earlier turn are dropped
    const s = ctx.state
    const all = nullLedger(s)
    const keep = Object.keys(all).filter((id) => all[id].round === s.round && all[id].turn === s.activePlayer)
    if (keep.length !== Object.keys(all).length) setCustom(s, 'sceNull', Object.fromEntries(keep.map((id) => [id, all[id]])))
  },
}

// ---------- SCE-AB-1 Deliver Judgement ----------
const CODE_JUDGEMENT = 'stormcastDeliverJudgement'

function judgementTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsByCode(state, me.id, CODE_JUDGEMENT).range, 12)
  return friendlyBoard(state, me.player)
    .filter((id) => id !== me.id && !keywordsOf(state, id).includes('HERO') && whollyWithinUnit(state, id, me.id, range))
}

const judgementActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const list = judgementTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return list.length > 0 && (!picked || list.includes(picked))
  },
  targets: judgementTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    grantExtraFight(ctx.state, target, { strikeLastAfterFirst: true })
    announce(ctx, use, target, `Deliver Judgement: ${ctx.state.units[target].name} fights twice this phase, and last after the first`)
  },
}
const stormcastDeliverJudgement: EngineCodeHook = { name: CODE_JUDGEMENT, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: judgementActivate }

// ---------- SCE-AB-2 Plan the Attack ----------
const CODE_PLAN = 'stormcastPlanTheAttack'
interface PlanPick { objectiveId: string; abilityId: string; round: number; turn: PlayerId }
const planLedger = (s: GameState): Record<PlayerId, PlanPick> => custom<PlanPick>(s, 'scePlan') as Record<PlayerId, PlanPick>
// the pick that is in force this turn
const activePlan = (s: GameState, player: PlayerId): PlanPick | null => {
  const p = planLedger(s)[player]
  return p && p.round === s.round && p.turn === s.activePlayer ? p : null
}

const objectiveLabel = (o: Objective): string => o.name ?? o.id

// how many of the player's units are within 12" of the marker, then how much enemy Control sits on it (the AI takes the first mode)
function planWeight(state: GameState, player: PlayerId, o: Objective): number {
  const near = friendlyBoard(state, player).filter((id) => liveModels(state, id).some((m) => Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z) <= 12 + o.radius)).length
  const control = enemyBoard(state, player).filter((id) => unitContestsObjective(state, id, o)).reduce((a, id) => a + liveModels(state, id).reduce((n, m) => n + modelStats(state, m).OC, 0), 0)
  return near * 100 + control
}

function planModes(state: GameState, player: PlayerId): { id: string; label: string }[] {
  return liveObjectives(state)
    .filter((o) => o.controller !== player)
    .sort((a, b) => planWeight(state, player, b) - planWeight(state, player, a) || (a.id < b.id ? -1 : 1))
    .map((o) => ({ id: o.id, label: `Plan the Attack on ${objectiveLabel(o)}` }))
}

const planActivate: ActivatedAbilityHook & { modesFor?(state: GameState, unitId: UnitId | null, player: PlayerId): { id: string; label: string }[] } = {
  canUse: (state, unitId, use) => !!onBoard(state, unitId) && planModes(state, playerOf(state, use)).length > 0,
  modesFor: (state, _unitId, player) => planModes(state, player),
  resolve(ctx, use) {
    const s = ctx.state
    const obj = use.modeId ? s.objectives[use.modeId] : undefined
    if (!obj) return
    setCustom(s, 'scePlan', { ...planLedger(s), [use.player]: { objectiveId: obj.id, abilityId: use.abilityId, round: s.round, turn: s.activePlayer } })
    markPlan(ctx)
    announce(ctx, use, null, `Plan the Attack: +1 to hit for combat attacks on units contesting ${objectiveLabel(obj)} for the rest of the turn`)
  },
}

// an untilEndOfTurn marker on every friendly unit on the table while the pick names the current turn (a unit set up later is covered)
function markPlan(ctx: EngineContext): void {
  const s = ctx.state
  for (const player of ['A', 'B'] as PlayerId[]) {
    const plan = activePlan(s, player)
    if (!plan) continue
    for (const id of friendlyBoard(s, player)) {
      if (s.units[id].effects.some((e) => e.sourceAbilityId === plan.abilityId)) continue
      effectService.grant(ctx, id, {}, { sourceAbilityId: plan.abilityId, sourceUnitId: id, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    }
  }
}

const stormcastPlanTheAttack: EngineCodeHook = {
  name: CODE_PLAN, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: planActivate,
  producesAt: ['onHitRoll'],
  produce(ctx, entry, data) {
    if (!entry.active) return null
    const s = ctx.state
    const attack = data.attack as { kind?: string; attackerUnitId?: UnitId; targetUnitId?: UnitId } | undefined
    if (!attack || attack.kind !== 'melee' || attack.attackerUnitId !== entry.holderUnitId || !attack.targetUnitId) return null
    const holder = onBoard(s, entry.holderUnitId)
    const plan = holder ? activePlan(s, holder.player) : null
    const obj = plan ? s.objectives[plan.objectiveId] : undefined
    if (!obj || !onBoard(s, attack.targetUnitId) || !unitContestsObjective(s, attack.targetUnitId, obj)) return null
    return { kind: 'roll', modifier: num(entry.params.modifier, 1) }
  },
  ensureEffects: markPlan,
}

// ---------- SCE-AB-3 Cleansing Fires ----------
const CODE_FIRES = 'stormcastCleansingFires'

// the visible enemy units within range, the biggest unit first (more dice) and the most hurt next
function firesTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsByCode(state, me.id, CODE_FIRES).range, 12)
  const mine = liveModels(state, me.id)
  return enemyBoard(state, me.player)
    .filter((e) => unitGap(state, me.id, e) <= range + EPS && mine.some((m) => losService.unitVisible(state, m.id, e)))
    .sort((a, b) => liveModels(state, b).length - liveModels(state, a).length || woundsLeft(state, a) - woundsLeft(state, b) || (a < b ? -1 : 1))
}

const firesActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const list = firesTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return list.length > 0 && (!picked || list.includes(picked))
  },
  targets: firesTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const need = num(s.abilities[use.abilityId]?.params?.successOn, 5)
    const dice = liveModels(s, target).length
    if (dice === 0) return
    const roll = ctx.roll({ purpose: 'ability', player: use.player, sides: 6, count: dice, mode: 'perDie', unitId: use.unitId, targetUnitId: target, commandRerollable: false })
    const hits = roll.dice.filter((d) => d >= need).length
    announce(ctx, use, target, `Cleansing Fires: ${dice} dice, ${hits} at ${need}+ (${hits} mortal damage)`)
    inflictMortal(ctx, use, target, hits)
  },
}
const stormcastCleansingFires: EngineCodeHook = { name: CODE_FIRES, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: firesActivate }

// ---------- SCE-AB-4 Sense Unholy Sorcery ----------
const crowToken = (params: Record<string, unknown>): string => (typeof params.token === 'string' ? params.token : 'gryph-crow')

const stormcastSenseUnholySorcery: EngineCodeHook = {
  name: 'stormcastSenseUnholySorcery', kind: 'ability', hook: 'onStatQuery', run: noop,
  adjustFeelNoPain(state, entry, modelId, current) {
    const model = state.models[modelId]
    const holder = onBoard(state, entry.holderUnitId)
    if (!model || !holder || model.unitId !== holder.id || (holder.tokens?.[crowToken(entry.params)] ?? 0) <= 0) return null
    return { threshold: Math.min(current ?? 7, num(entry.params.ward, 5)), modifier: 0 }
  },
  afterWardRoll(ctx, entry, info) {
    if (info.unitId !== entry.holderUnitId || !info.dice.includes(1)) return
    // RULING: any unmodified 1 on any ward roll for the unit, whatever the source of the ward
    const gone = removeTokens(ctx, info.unitId, crowToken(entry.params))
    if (gone > 0) {
      ctx.emit({
        type: 'AbilityTriggered', abilityId: entry.ability?.id ?? 'stormcast.ability.sense-unholy-sorcery', sourceUnitId: info.unitId, targetUnitId: null,
        summary: 'Sense Unholy Sorcery: a 1 on the ward roll, the Gryph-crow is gone', player: ctx.state.units[info.unitId]?.player,
      })
    }
  },
}

// ---------- SCE-AB-7 Stalwart Defenders ----------
// the objective's marker disc lies wholly inside the player's territory
export function objectiveWhollyInTerritory(state: GameState, obj: Objective, player: PlayerId): boolean {
  const radius = obj.radius ?? state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
  const disc: Footprint = { pos: { x: obj.pos.x, y: 0, z: obj.pos.z }, facing: 0, base: { shape: 'round', radius } }
  return whollyWithinPolygon(disc, territoryOf(state, player))
}

const stormcastStalwartDefenders: EngineCodeHook = {
  name: 'stormcastStalwartDefenders', kind: 'ability', hook: 'onStatQuery', run: noop,
  producesAt: ['onObjectiveControl'],
  produce(ctx, entry, data) {
    if (!entry.active || data.contestingUnitId !== entry.holderUnitId) return null
    const s = ctx.state
    const holder = onBoard(s, entry.holderUnitId)
    const obj = typeof data.objectiveId === 'string' ? s.objectives[data.objectiveId] : undefined
    if (!holder || !obj || !objectiveWhollyInTerritory(s, obj, holder.player)) return null
    return { kind: 'stat', delta: num(entry.params.control, 3) }
  },
  ensureEffects: (ctx) => ensureBattleEffect(ctx, 'stormcastStalwartDefenders'),
}

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus / abilityModeBonus; null = no opinion) ----------
const inFight = (state: GameState, id: UnitId): boolean => losService.unitInCombat(state, id)
const GENERAL_CODES = new Set([CODE_QUICK, 'stormcastNullPendant'])

// Storm Charge: a unit that ran this turn and has an enemy within the reach of its charge dice
const reachAfterRun = (state: GameState, id: UnitId): boolean => {
  const u = state.units[id]
  if (!u || u.turn.moveType !== 'advance' || inFight(state, id)) return false
  const reach = 6 * chargeDiceCount(state, id) + 0.5
  return enemyBoard(state, u.player).some((e) => unitGap(state, id, e) <= reach)
}

// Null Pendant: does the expected cut turn an objective the bearer's unit contests (this turn's check) toward us?
function pendantWorth(state: GameState, unitId: UnitId | null): boolean {
  const me = onBoard(state, unitId)
  if (!me) return false
  const enemy = other(me.player)
  for (const o of liveObjectives(state)) {
    if (!unitContestsObjective(state, me.id, o)) continue
    const lv = objectiveService.levelOfControl(state, o.id)
    const behind = lv[enemy] > lv[me.player] || (lv[enemy] === lv[me.player] && o.controller !== me.player)
    if (!behind) continue
    let cut = 0
    for (const e of enemyBoard(state, me.player)) {
      if (!unitContestsObjective(state, e, o)) continue
      const oc = liveModels(state, e).reduce((a, m) => a + modelStats(state, m).OC, 0)
      cut += Math.min(10 / 3, Math.max(0, oc - 1))
    }
    if (lv[enemy] - cut < lv[me.player]) return true
  }
  return false
}

// below -2 the bot passes instead of using the ability
export function stormcastAbilityTiming(state: GameState, player: PlayerId, code: string, unitIdOrNull: UnitId | null): number | null {
  // the ability-use options carry no unit hint, so the AI passes null: Quicksilver Draught, Null Pendant and Deliver Judgement all belong to the general
  const unitId = unitIdOrNull ?? state.players[player]?.warlordUnitId ?? null
  switch (code) {
    case CODE_STORM:
      return friendlyBoard(state, player).some((id) => reachAfterRun(state, id)) ? 0 : -3
    case CODE_QUICK: {
      const g = onBoard(state, unitId)
      return g && inFight(state, g.id) && !g.turn.chargedThisTurn ? 0 : -3
    }
    case 'stormcastNullPendant':
      return pendantWorth(state, unitId) ? 0 : -3
    case CODE_BLAZE: {
      // a crowd in combat with an enemy that has yet to strike
      const worth = blazeTargets(state, null, player).some((id) =>
        liveModels(state, id).length >= 3 && enemyBoard(state, player).some((e) => !state.units[e].turn.foughtThisPhase && unitGap(state, id, e) <= ENGAGEMENT_H + EPS))
      return worth ? 0 : -3
    }
    case CODE_JUDGEMENT:
      return judgementTargets(state, unitId).some((id) => inFight(state, id)) ? 0 : -3
    default:
      return GENERAL_CODES.has(code) ? 0 : null
  }
}

export function stormcastTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  const models = liveModels(state, unitId).length
  switch (code) {
    case CODE_SHIELD: {
      // the unit with the most enemy muscle around it, else the one holding ground; a ward it already has does not stack
      if (unit.player !== player) return null
      let threat = 0
      for (const e of enemyBoard(state, player)) {
        const gap = unitGap(state, unitId, e)
        threat += (gap <= ENGAGEMENT_H ? 3 : gap <= 8 ? 1.5 : gap <= 12 ? 0.5 : 0) * liveModels(state, e).length
      }
      const warded = (unit.tokens?.['gryph-crow'] ?? 0) > 0 || (unit.isWarlord && unit.enhancementId === 'stormcast.enh.hallowed-scrolls')
      return threat * 0.4 + (liveObjectives(state).some((o) => unitContestsObjective(state, unitId, o)) ? 2 : 0) + woundsLeft(state, unitId) * 0.05 - (warded ? 6 : 0)
    }
    case CODE_STORM:
      return reachAfterRun(state, unitId) ? 8 + models : -8
    case CODE_BLAZE:
      return models * 2 + (inFight(state, unitId) ? 0 : -10)
    case CODE_JUDGEMENT:
      return inFight(state, unitId) ? 4 + models * 1.5 + woundsLeft(state, unitId) * 0.1 : -10
    case CODE_FIRES:
      return unit.player !== player ? models * 1.5 : null
    default:
      return null
  }
}

// Plan the Attack: the objective with the most friends near it
export function stormcastModeBonus(state: GameState, code: string, unitId: UnitId | null, optionId: string): number | null {
  if (code !== CODE_PLAN) return null
  const obj = state.objectives[optionId]
  const player = unitId ? state.units[unitId]?.player : undefined
  return obj && player ? Math.min(3, Math.floor(planWeight(state, player, obj) / 100) * 0.6) : null
}

export const stormcastHooks: Record<string, EngineCodeHook> = {
  stormcastShieldOfAzyr, stormcastStormCharge, stormcastQuicksilverDraught, stormcastStrikeWhereNeeded, stormcastBlazeOfGlory, stormcastNullPendant,
  stormcastDeliverJudgement, stormcastPlanTheAttack, stormcastCleansingFires, stormcastSenseUnholySorcery, stormcastStalwartDefenders,
}
