// Maggotkin of Nurgle (Bleak Host) code hooks: docs/spec/factions/maggotkin-of-nurgle.md (MON-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/nurgle/abilities.json uses. Activated abilities
// use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts, which rolls the descriptor's declared roll first and only calls
// `resolve` on success); passive rules are declarative descriptors a code hook gates. What each hook needs from data:
//
//  nurgleDiseased (BT-2)            passive battle trait, params.max (7). `onOwnCriticalHits` (attack.ts, F14 C1) adds one disease point per
//        critical hit the army's attacks score, ledger mission.custom.mnDisease[player]. `resourceReadout` shows "Disease n/7" in the HUD.
//  nurgleEmbrace (BT-3)             army ability, endOfTurn / any, oncePerTurnArmy, no declare; params.succeedOn. canUse = a disease point and
//        some enemy unit in combat with a friendly unit. Resolve raises an 'abilityChoice' chooseOption (data.code = this hook, answered by
//        `answer`): one enemy unit per point spent (or pass = stop); each answer spends a point, rolls a D6 and re-raises while points and
//        targets remain. Each option carries hint { value, unitId } for the AI.
//  nurgleLocusOfFecundity (RA-1)    regiment ability, hero phase, oncePerTurnArmy, params.heal; any damaged friendly unit on the board.
//  nurgleInfestedWithWonders (RA-2) passive regiment ability, params.range / succeedOn / mortal. `onOwnModelSlain` (attack.ts) picks the enemy
//        unit with a model within range of the slain model's snapshot (fewest wounds left, then id) and rolls a D6; the mortal damage is
//        held until the attack sequence ends (deferMortalAfterFight) as Frazzleboom does.
//  nurgleKeepCounting (AB-1)        hero phase; modes tally-of-blows / recorded-stamina; params.range / keyword (PLAGUEBEARERS). Target =
//        a friendly unit with the keyword wholly within range of the caster; the effect lasts until the start of your next turn.
//  nurgleWrackAndRuin (AB-2)        any charge phase; declared roll D6 2+ in data; params.range (1) / damage (D3). canUse = the unit charged.
//  nurgleRelentlessAttackers (AB-3) endOfTurn / any, oncePerTurn; target = an enemy INFANTRY unit in combat with the caster whose printed
//        Health is below 6. One die per model of the caster within 3" of the target; each die above the target's Health = 1 mortal damage.
//  nurgleSummoner (ENH-1)           endOfTurn / any, oncePerTurn; params.range / keyword / returnModels. Returns slain models to a Plaguebearers
//        unit wholly within range of the bearer.
//  nurgleGardener (ENH-2)           movement phase / your, declared roll D6 3+ in data; params.ward. The bearer must contest an objective no
//        enemy contests. Marks it desecrated in mission.custom.mnDesecrated (objective id -> player) and gives every friendly unit a battle-long
//        Ward effect that `gateEffect` only lets through while the holder contests an objective desecrated for its player; `ensureEffects`
//        drops a desecration the opponent has taken control of (an uncontrolled objective stays desecrated).
//  nurglePestilentBreath (ENH-3)    shooting phase / your; params.range / succeedOn. One D6 per model of an enemy unit within range of the bearer.
//  nurgleFebrileFrenzy (ENH-4)      any combat phase, oncePerBattle; params.range / attacks. Phase-long aura on the bearer's unit: friendly units
//        wholly within range add attacks to their melee weapons' Attacks (Companion weapons excluded, CORE-12.4).
//  Cloud of Flies (AB-4), Daemonic Summoning (BT-1) and The Infectious Hosts are data only.
//
//  AI hints: nurgleAbilityTiming / nurgleTargetBonus / nurgleModeBonus below are read by src/ai/utility.ts.
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook, FactionResource } from '../code-hooks'
import type { DiceExpr, Effect } from '../../data/types'
import type { Action } from '../actions'
import type { GameState, Objective, PendingDecision, PlayerId, Rejection, UnitId } from '../types'
import { EPS, ENGAGEMENT_H, distance } from '../geometry'
import { attackService, deferMortalAfterFight } from '../attack'
import { rollSum } from '../dice'
import { effectService } from '../effects'
import { keywordsOf, modelStats } from '../state'
import type { EngineContext } from '../modules'
import {
  announce, enemiesInCombat, healUnit, inCombat, inflictMortal, isDamaged, liveModels, liveObjectives, onBoard, paramOf, playerContestsObjective,
  returnSlainModels, returnableModels, unitContestsObjective, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const CODE_DISEASED = 'nurgleDiseased'
const CODE_EMBRACE = 'nurgleEmbrace'
const CODE_LOCUS = 'nurgleLocusOfFecundity'
const CODE_INFESTED = 'nurgleInfestedWithWonders'
const CODE_COUNTING = 'nurgleKeepCounting'
const CODE_WRACK = 'nurgleWrackAndRuin'
const CODE_RELENTLESS = 'nurgleRelentlessAttackers'
const CODE_SUMMONER = 'nurgleSummoner'
const CODE_GARDENER = 'nurgleGardener'
const CODE_BREATH = 'nurglePestilentBreath'
const CODE_FRENZY = 'nurgleFebrileFrenzy'

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const boardUnits = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board').map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const byFewestWounds = (state: GameState) => (a: UnitId, b: UnitId): number => woundsLeft(state, a) - woundsLeft(state, b) || (a < b ? -1 : 1)
const damagePoints = (state: GameState, unitId: UnitId): number =>
  liveModels(state, unitId).reduce((a, m) => a + Math.max(0, modelStats(state, m).W - m.woundsRemaining), 0)

const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
// abilities.ts hands `targets` the player too (army abilities have no unit to read it from)
type TargetsFn = ActivatedAbilityHook['targets']

// ---------- MON-BT-2 Diseased: the disease ledger ----------
// mission.custom.mnDisease: Record<PlayerId, number>, kept in `mission.custom` so the frozen GameState type is unchanged
const MAX_DISEASE = 7
const diseaseLedger = (s: GameState): Record<string, number> => (s.mission.custom.mnDisease as Record<string, number> | undefined) ?? {}
export const diseasePoints = (state: GameState, player: PlayerId): number => diseaseLedger(state)[player] ?? 0
const setDisease = (s: GameState, player: PlayerId, value: number): void => {
  s.mission.custom = { ...s.mission.custom, mnDisease: { ...diseaseLedger(s), [player]: Math.max(0, value) } }
}

const nurgleDiseased: EngineCodeHook = {
  name: CODE_DISEASED, kind: 'ability', hook: 'onStatQuery', run: noop,
  onOwnCriticalHits(ctx, { ability, unitId, count }) {
    const s = ctx.state
    const owner = s.units[unitId]?.player
    if (!owner || count <= 0) return
    const max = num(ability.params?.max, MAX_DISEASE)
    const before = diseasePoints(s, owner)
    const after = Math.min(max, before + count)
    if (after === before) return
    setDisease(s, owner, after)
    ctx.emit({
      type: 'AbilityTriggered', abilityId: ability.id, sourceUnitId: unitId, targetUnitId: null, player: owner,
      summary: `Diseased: +${after - before} disease point${after - before === 1 ? '' : 's'} (now ${after}/${max})`,
    })
  },
  resourceReadout(state, ability, player): FactionResource {
    return {
      id: 'nurgle-disease', label: 'Disease', value: diseasePoints(state, player), max: num(ability.params?.max, MAX_DISEASE),
      help: "Each critical hit your army scores adds a disease point (up to 7). At the end of any turn, Nurgle's Embrace spends them: each point is a D6 against an enemy unit in combat with you, and a 5+ is 1 mortal damage.",
    }
  },
}

// ---------- MON-BT-3 Nurgle's Embrace ----------
// enemy units on the board that are in combat with a friendly unit
export const embraceTargets = (state: GameState, player: PlayerId): UnitId[] =>
  boardUnits(state, other(player)).filter((id) => inCombat(state, id))

// how much a point is worth on this target (the AI's hint): a likely kill first, then the enemy Hero, then the most dangerous crowd
function embraceValue(state: GameState, unitId: UnitId): number {
  const left = woundsLeft(state, unitId)
  const kill = left <= 1 ? 4 : left <= 3 ? 2 : 0
  const hero = keywordsOf(state, unitId).includes('HERO') ? 1.5 : 0
  const crowd = enemiesInCombat(state, unitId).reduce((n, id) => n + liveModels(state, id).length, 0) * 0.1
  return kill + hero + crowd + Math.max(0, 6 - left) * 0.05
}

function raiseEmbrace(ctx: EngineContext, abilityId: string, player: PlayerId): boolean {
  const s = ctx.state
  const points = diseasePoints(s, player)
  const targets = embraceTargets(s, player)
  if (points <= 0 || targets.length === 0) return false
  ctx.decide({
    kind: 'chooseOption', player, window: 'turn.end.abilities', canPass: true,
    context: { topic: 'abilityChoice', unitId: null, abilityId, data: { code: CODE_EMBRACE, points } },
    options: targets.map((id) => ({
      id,
      label: `Nurgle's Embrace (${points} point${points === 1 ? '' : 's'} left): ${s.units[id].name}`,
      action: { type: 'chooseOption' as const, player, decisionId: '', optionId: id },
      hint: { value: embraceValue(s, id), unitId: id },
    })),
  })
  return true
}

const embraceActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => {
    const player = use.player ?? state.activePlayer
    return diseasePoints(state, player) > 0 && embraceTargets(state, player).length > 0
  },
  resolve(ctx, use) {
    announce(ctx, use, null, `Nurgle's Embrace: ${diseasePoints(ctx.state, use.player)} disease point${diseasePoints(ctx.state, use.player) === 1 ? '' : 's'} to spend`)
    raiseEmbrace(ctx, use.abilityId, use.player)
  },
}

const nurgleEmbrace: EngineCodeHook = {
  name: CODE_EMBRACE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: embraceActivate,
  answer(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
    if (pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: "Nurgle's Embrace: chooseOption expected" }
    const s = ctx.state
    const player = pending.player
    const abilityId = pending.context.abilityId ?? 'nurgle.ability.nurgles-embrace'
    if (action.type === 'pass') {
      ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: null, targetUnitId: null, player, summary: `Nurgle's Embrace: stops with ${diseasePoints(s, player)} disease point${diseasePoints(s, player) === 1 ? '' : 's'} unspent` })
      return
    }
    if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: "Nurgle's Embrace: pick a unit or stop" }
    const target = action.optionId
    if (diseasePoints(s, player) <= 0 || !embraceTargets(s, player).includes(target)) return { code: 'E_NOT_AN_OPTION', reason: `${target} is not a legal target for Nurgle's Embrace` }
    setDisease(s, player, diseasePoints(s, player) - 1)
    const need = num(paramOf(s, abilityId, 'succeedOn', 5), 5)
    const roll = ctx.roll({ purpose: 'ability', player, targetUnitId: target, commandRerollable: false })
    const total = rollSum(roll)
    const name = s.units[target].name
    const use = { abilityId, unitId: null, player, targetUnitIds: [target], modeId: null, roll: null }
    if (total >= need) {
      ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: null, targetUnitId: target, player, summary: `Nurgle's Embrace: rolled ${total}, 1 mortal damage on ${name}` })
      inflictMortal(ctx, use, target, 1)
    } else {
      ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: null, targetUnitId: target, player, summary: `Nurgle's Embrace: rolled ${total}, ${name} shrugs it off` })
    }
    raiseEmbrace(ctx, abilityId, player)
  },
}

// ---------- MON-RA-1 Locus of Fecundity ----------
const locusTargets: TargetsFn = ((state: GameState, _unitId: UnitId | null, player?: PlayerId) =>
  boardUnits(state, player ?? state.activePlayer).filter((id) => isDamaged(state, id))) as TargetsFn

const locusActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk((locusTargets as (s: GameState, u: UnitId | null, p?: PlayerId) => UnitId[])(state, unitId, use.player), use),
  targets: locusTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const dice = paramOf<DiceExpr>(ctx.state, use.abilityId, 'heal', 'D3')
    const amount = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
    const healed = healUnit(ctx, target, amount, use.abilityId)
    announce(ctx, use, target, `Locus of Fecundity: Heal (${amount}), ${healed} damage removed from ${ctx.state.units[target].name}`)
  },
}
const nurgleLocusOfFecundity: EngineCodeHook = { name: CODE_LOCUS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: locusActivate }

// ---------- MON-RA-2 Infested with Wonders ----------
const nurgleInfestedWithWonders: EngineCodeHook = {
  name: CODE_INFESTED, kind: 'ability', hook: 'onModelDestroyed', run: noop,
  onOwnModelSlain(ctx, { ability, unitId, model }) {
    const s = ctx.state
    const owner = s.units[unitId]?.player
    if (!owner) return
    const range = num(ability.params?.range, 1)
    // measured from where the model stood when it was slain (the snapshot), base to base
    const near = boardUnits(s, other(owner))
      .filter((e) => liveModels(s, e).some((m) => distance(model, m) <= range + EPS))
      .sort(byFewestWounds(s))
    if (near.length === 0) return
    const target = near[0]
    const need = num(ability.params?.succeedOn, 4)
    const roll = ctx.rollExpr('D6', { purpose: 'ability', player: owner, unitId, targetUnitId: target, commandRerollable: false }).total
    const hit = roll >= need
    const inSequence = !!s.phaseState.attack && (s.phase === 'fight' || s.phase === 'shooting')
    const mortal = num(ability.params?.mortal, 1)
    ctx.emit({
      type: 'AbilityTriggered', abilityId: ability.id, sourceUnitId: unitId, targetUnitId: target, player: owner,
      summary: hit ? `Infested with Wonders: rolled ${roll}, ${mortal} mortal damage on ${s.units[target].name}${inSequence ? ' once the attack has finished' : ''}` : `Infested with Wonders: rolled ${roll}, the wonders fizzle`,
    })
    if (!hit) return
    if (inSequence) deferMortalAfterFight(s, { targetUnitId: target, count: mortal, source: ability.id, player: owner })
    else attackService.queueMortalWounds(ctx, target, mortal, ability.id, false)
  },
}

// ---------- MON-AB-1 Keep Counting, I'm Watching You ----------
const countingTargets: TargetsFn = ((state: GameState, unitId: UnitId | null) => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(Object.values(state.abilities).find((a) => a.code === CODE_COUNTING)?.params?.range, 14)
  const kw = String(Object.values(state.abilities).find((a) => a.code === CODE_COUNTING)?.params?.keyword ?? 'PLAGUEBEARERS')
  return boardUnits(state, src.player).filter((id) => keywordsOf(state, id).includes(kw) && whollyWithinUnit(state, id, src.id, range))
}) as TargetsFn

const countingActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk((countingTargets as (s: GameState, u: UnitId | null) => UnitId[])(state, unitId), use),
  targets: countingTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const mode = use.modeId ?? 'tally-of-blows'
    const effect: Effect = mode === 'recorded-stamina'
      ? { modifyRoll: { roll: 'save', value: 1 } }
      : { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } }
    effectService.grant(ctx, target, effect, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn' })
    announce(ctx, use, target, mode === 'recorded-stamina'
      ? `Recorded Stamina: ${ctx.state.units[target].name} adds 1 to its save rolls until your next turn`
      : `Tally of Blows: ${ctx.state.units[target].name} adds 1 to the Attacks of its melee weapons until your next turn`)
  },
}
const nurgleKeepCounting: EngineCodeHook = { name: CODE_COUNTING, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: countingActivate }

// ---------- MON-AB-2 Wrack and Ruin ----------
const wrackTargets: TargetsFn = ((state: GameState, unitId: UnitId | null) => {
  const src = onBoard(state, unitId)
  if (!src || !src.turn.chargedThisTurn) return []
  const range = num(Object.values(state.abilities).find((a) => a.code === CODE_WRACK)?.params?.range, 1)
  return boardUnits(state, other(src.player)).filter((id) => unitGap(state, src.id, id) <= range + EPS)
}) as TargetsFn

const wrackActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk((wrackTargets as (s: GameState, u: UnitId | null) => UnitId[])(state, unitId), use),
  targets: wrackTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const dice = paramOf<DiceExpr>(ctx.state, use.abilityId, 'damage', 'D3')
    const dmg = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: use.unitId, targetUnitId: target, commandRerollable: false }).total
    announce(ctx, use, target, `Wrack and Ruin: ${dmg} mortal damage on ${ctx.state.units[target].name}`)
    inflictMortal(ctx, use, target, dmg)
  },
}
const nurgleWrackAndRuin: EngineCodeHook = { name: CODE_WRACK, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: wrackActivate }

// ---------- MON-AB-3 Relentless Attackers ----------
// the target's printed Health characteristic (not wounds left, not modified)
function printedHealth(state: GameState, unitId: UnitId): number {
  const m = liveModels(state, unitId)[0]
  if (!m) return 99
  const ds = state.datasheets[state.units[unitId].datasheetId]
  return ds?.models.find((p) => p.modelId === m.datasheetModelId)?.stats.W ?? modelStats(state, m).W
}

const relentlessTargets: TargetsFn = ((state: GameState, unitId: UnitId | null) => {
  const src = onBoard(state, unitId)
  if (!src) return []
  return enemiesInCombat(state, src.id).filter((id) => keywordsOf(state, id).includes('INFANTRY') && printedHealth(state, id) < 6)
}) as TargetsFn

// models of `self` within the target's combat range (3" of any target model)
const modelsInRange = (state: GameState, self: UnitId, target: UnitId): number => {
  const theirs = liveModels(state, target)
  return liveModels(state, self).filter((m) => theirs.some((t) => distance(m, t) <= ENGAGEMENT_H + EPS)).length
}

const relentlessActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk((relentlessTargets as (s: GameState, u: UnitId | null) => UnitId[])(state, unitId), use),
  targets: relentlessTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    const self = onBoard(s, use.unitId)
    if (!target || !self || !onBoard(s, target)) return
    if (!keywordsOf(s, target).includes('INFANTRY')) return
    const n = modelsInRange(s, self.id, target)
    if (n <= 0) return
    const health = printedHealth(s, target)
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: n, mode: 'perDie', unitId: self.id, targetUnitId: target, commandRerollable: false })
    const hits = roll.final.filter((d) => d > health).length
    announce(ctx, use, target, `Relentless Attackers: ${n} dice against Health ${health}, ${hits} mortal damage on ${s.units[target].name}`)
    inflictMortal(ctx, use, target, hits)
  },
}
const nurgleRelentlessAttackers: EngineCodeHook = { name: CODE_RELENTLESS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: relentlessActivate }

// ---------- MON-ENH-1 Summoner of Plaguebearers ----------
const summonerTargets: TargetsFn = ((state: GameState, unitId: UnitId | null) => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const ab = Object.values(state.abilities).find((a) => a.code === CODE_SUMMONER)
  const range = num(ab?.params?.range, 14)
  const kw = String(ab?.params?.keyword ?? 'PLAGUEBEARERS')
  return boardUnits(state, src.player).filter((id) => keywordsOf(state, id).includes(kw) && returnableModels(state, id) > 0 && whollyWithinUnit(state, id, src.id, range))
}) as TargetsFn

const summonerActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk((summonerTargets as (s: GameState, u: UnitId | null) => UnitId[])(state, unitId), use),
  targets: summonerTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const back = returnSlainModels(ctx, target, num(paramOf(ctx.state, use.abilityId, 'returnModels', 1), 1), use.abilityId)
    announce(ctx, use, target, `Summoner of Plaguebearers: ${back} slain model${back === 1 ? '' : 's'} returned to ${ctx.state.units[target].name}`)
  },
}
const nurgleSummoner: EngineCodeHook = { name: CODE_SUMMONER, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: summonerActivate }

// ---------- MON-ENH-2 Gardener of Nurgle ----------
// mission.custom.mnDesecrated: objective id -> the player it is desecrated for
const desecratedMap = (s: GameState): Record<string, PlayerId> => (s.mission.custom.mnDesecrated as Record<string, PlayerId> | undefined) ?? {}
// objectives desecrated for `player` that the opponent has not taken (an uncontrolled objective stays desecrated)
function desecratedFor(state: GameState, player: PlayerId): Objective[] {
  const map = desecratedMap(state)
  return liveObjectives(state).filter((o) => map[o.id] === player && o.controller !== other(player))
}

// objectives the bearer could desecrate now: it contests them, no enemy model does, not already desecrated for the player
function gardenerSites(state: GameState, unitId: UnitId | null): Objective[] {
  const unit = onBoard(state, unitId)
  if (!unit) return []
  const done = desecratedFor(state, unit.player).map((o) => o.id)
  return liveObjectives(state).filter((o) => !done.includes(o.id) && unitContestsObjective(state, unit.id, o) && !playerContestsObjective(state, other(unit.player), o))
}
const fromCentre = (o: Objective): number => Math.hypot(o.pos.x, o.pos.z)

function grantDesecratedWard(ctx: EngineContext, player: PlayerId, abilityId: string, sourceUnitId: UnitId | null): void {
  for (const u of Object.values(ctx.state.units)) {
    if (u.player !== player || u.location === 'destroyed') continue
    if (u.effects.some((e) => e.sourceAbilityId === abilityId)) continue
    effectService.grant(ctx, u.id, { feelNoPain: num(paramOf(ctx.state, abilityId, 'ward', 4), 4) as 2 | 3 | 4 | 5 | 6 }, { sourceAbilityId: abilityId, sourceUnitId, scope: { who: 'self' }, duration: 'battle' })
  }
}

const gardenerActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => gardenerSites(state, unitId).length > 0,
  resolve(ctx, use) {
    const unit = onBoard(ctx.state, use.unitId)
    if (!unit) return
    const sites = gardenerSites(ctx.state, unit.id).sort((a, b) => fromCentre(a) - fromCentre(b) || (a.id < b.id ? -1 : 1))
    if (sites.length === 0) return
    const obj = sites[0]
    ctx.state.mission.custom = { ...ctx.state.mission.custom, mnDesecrated: { ...desecratedMap(ctx.state), [obj.id]: unit.player } }
    grantDesecratedWard(ctx, unit.player, use.abilityId, unit.id)
    announce(ctx, use, null, `Gardener of Nurgle: the objective is desecrated, friendly units on it have Ward (${num(paramOf(ctx.state, use.abilityId, 'ward', 4), 4)}+)`)
  },
}

const nurgleGardener: EngineCodeHook = {
  name: CODE_GARDENER, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: gardenerActivate,
  // the granted Ward only counts while the holder contests an objective desecrated for its owner that the opponent has not taken
  gateEffect(state, holder) {
    if (!holder || holder.location !== 'board') return false
    return desecratedFor(state, holder.player).some((o) => unitContestsObjective(state, holder.id, o))
  },
  // called at the top of every ability window: a desecration lapses when the opponent takes the objective; replacement units inherit the Ward
  ensureEffects(ctx) {
    const map = desecratedMap(ctx.state)
    const keep: Record<string, PlayerId> = {}
    let changed = false
    for (const [id, owner] of Object.entries(map)) {
      const o = ctx.state.objectives[id]
      if (o && !o.removed && o.controller !== other(owner)) keep[id] = owner
      else changed = true
    }
    if (changed) ctx.state.mission.custom = { ...ctx.state.mission.custom, mnDesecrated: keep }
    const ab = Object.values(ctx.state.abilities).find((a) => a.code === CODE_GARDENER)
    if (!ab) return
    for (const owner of new Set(Object.values(keep))) grantDesecratedWard(ctx, owner, ab.id, null)
  },
}

// ---------- MON-ENH-3 Pestilent Breath ----------
const breathTargets: TargetsFn = ((state: GameState, unitId: UnitId | null) => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(Object.values(state.abilities).find((a) => a.code === CODE_BREATH)?.params?.range, 7)
  return boardUnits(state, other(src.player)).filter((id) => unitGap(state, src.id, id) <= range + EPS)
}) as TargetsFn

const breathActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk((breathTargets as (s: GameState, u: UnitId | null) => UnitId[])(state, unitId), use),
  targets: breathTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const models = liveModels(s, target).length
    if (models <= 0) return
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 5), 5)
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: models, mode: 'perDie', unitId: use.unitId, targetUnitId: target, commandRerollable: false })
    const hits = roll.final.filter((d) => d >= need).length
    announce(ctx, use, target, `Pestilent Breath: ${models} dice against ${s.units[target].name}, ${hits} mortal damage`)
    inflictMortal(ctx, use, target, hits)
  },
}
const nurglePestilentBreath: EngineCodeHook = { name: CODE_BREATH, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: breathActivate }

// ---------- MON-ENH-4 Gift of Febrile Frenzy ----------
const frenzyActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId),
  resolve(ctx, use) {
    const src = onBoard(ctx.state, use.unitId)
    if (!src) return
    const range = num(paramOf(ctx.state, use.abilityId, 'range', 7), 7)
    const attacks = num(paramOf(ctx.state, use.abilityId, 'attacks', 1), 1)
    // the scope is read at each attack, so units that move into or out of range during the phase gain or lose it; no
    // affectsCompanion, so Companion weapons are excluded (CORE-12.4)
    const effect: Effect = { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: attacks } }
    effectService.grant(ctx, src.id, effect, { sourceAbilityId: use.abilityId, sourceUnitId: src.id, scope: { who: 'friendly', within: range, wholly: true }, duration: 'untilEndOfPhase' })
    announce(ctx, use, null, `Gift of Febrile Frenzy: friendly units wholly within ${range}" add ${attacks} to the Attacks of their melee weapons for the phase`)
  },
}
const nurgleFebrileFrenzy: EngineCodeHook = { name: CODE_FRENZY, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: frenzyActivate }

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus / abilityModeBonus; null = no opinion) ----------
// friendly units wholly within `range` of the general (the general's own unit included) that are in combat right now
function frenzyBeneficiaries(state: GameState, general: UnitId): number {
  const range = num(Object.values(state.abilities).find((a) => a.code === CODE_FRENZY)?.params?.range, 7)
  const p = state.units[general]?.player
  if (!p) return 0
  return boardUnits(state, p).filter((id) => (id === general || whollyWithinUnit(state, id, general, range)) && inCombat(state, id)).length
}

// below -2 the bot passes instead of using the ability
export function nurgleAbilityTiming(state: GameState, _player: PlayerId, code: string, unitId: UnitId | null): number | null {
  switch (code) {
    case CODE_FRENZY:
      // the first combat phase in which at least two friendly units around the general are in combat
      return unitId && frenzyBeneficiaries(state, unitId) >= 2 ? 0 : -3
    case CODE_BREATH:
      return unitId && (breathTargets as (s: GameState, u: UnitId | null) => UnitId[])(state, unitId).length > 0 ? 0 : -3
    default:
      return null
  }
}

export function nurgleTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  if (!state.units[unitId]) return null
  switch (code) {
    case CODE_LOCUS: {
      // the damaged unit with the most damage points; Blightlords first when tied
      const fly = keywordsOf(state, unitId).includes('FLY') ? 0.5 : 0
      return damagePoints(state, unitId) * 0.5 + fly
    }
    case CODE_BREATH:
      // the in-range enemy unit with the most models
      return liveModels(state, unitId).length * 0.6
    case CODE_WRACK:
      // the fewest wounds left (a kill)
      return Math.max(0, 10 - woundsLeft(state, unitId)) * 0.4
    case CODE_RELENTLESS:
      // the lowest Health first
      return Math.max(0, 6 - printedHealth(state, unitId)) * 1.2
    case CODE_COUNTING: {
      // the Plaguebearers unit that is fighting or about to
      const near = boardUnits(state, other(player)).some((e) => unitGap(state, unitId, e) <= 12)
      return (inCombat(state, unitId) ? 3 : 0) + (near ? 1 : 0)
    }
    default:
      return null
  }
}

// Keep Counting: Tally of Blows when the target is in combat or within 12" of an enemy unit, else Recorded Stamina
export function nurgleModeBonus(state: GameState, code: string, _unitId: UnitId | null, optionId: string, target: UnitId | null): number | null {
  if (code !== CODE_COUNTING) return null
  const t = target ? state.units[target] : undefined
  if (!t) return optionId === 'tally-of-blows' ? 0.1 : 0
  const hot = inCombat(state, t.id) || boardUnits(state, other(t.player)).some((e) => unitGap(state, t.id, e) <= 12)
  return (optionId === 'tally-of-blows') === hot ? 1 : 0
}

export const nurgleHooks: Record<string, EngineCodeHook> = {
  nurgleDiseased, nurgleEmbrace, nurgleLocusOfFecundity, nurgleInfestedWithWonders, nurgleKeepCounting, nurgleWrackAndRuin,
  nurgleRelentlessAttackers, nurgleSummoner, nurgleGardener, nurglePestilentBreath, nurgleFebrileFrenzy,
}
