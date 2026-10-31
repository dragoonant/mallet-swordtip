// Helsmiths of Hashut (Helforge Host) code hooks: docs/spec/factions/helsmiths-of-hashut.md (HOH-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/helsmiths/abilities.json uses. Daemonic power points
// (DPP) live on units as the token `daemonic-power` (0-3, unit.tokens); `effectiveDpp` is what every reader uses (Black-Hearted Conqueror
// can lend a unit 1 point, so it is computed where it is read, never stored). What each hook needs from data:
//
//  helsmithsHarness (BT-1)            battle trait, hero phase / your, oncePerTurnArmy, params.mandatory (abilities.ts offers it alone and
//        first, no pass), params.max (3 per unit), params.bonus (+1 on the round number). Resolve clears every friendly unit's tokens, keeps
//        the pool in mission.custom.hohPool[player] and raises 'abilityChoice' picks (data.code = this hook, answered by `answer`): each pick
//        adds a point to one friendly unit below the cap, pass = stop (the rest are lost). `resourceReadout` shows the pool in the HUD.
//  helsmithsConqueror (AB-1)          passive marker; the range and gate live in `effectiveDpp`.
//  helsmithsDaemonicStrength (AB-2)   passive; statDelta: +params.move" Move and +params.attacks Attacks on every weapon per effective DPP.
//  helsmithsCalculatedTrajectory (AB-3) passive; the descriptor's effect is +1 to hit for ranged attacks beyond 12"; `gate` closes it unless the
//        target has params.minModels models. Its `afterAttackSequence` also records which units the Bombard's shooting targeted this turn
//        (mission.custom.hohShots) for Ruinous Bombardment (an activated descriptor is never a source entry, a passive one is).
//  helsmithsRuinousBombardment (AB-4) hero-style army-once-per-turn shooting ability; canUse = the record holds exactly one target. With more
//        enemy units within params.range of it than the Bombard has DPP, 'abilityChoice' picks choose the extra targets (pass = stop). One D6
//        per target: params.succeedOn+ leaves a marker effect whose `produce` at onObjectiveControl takes params.control off its control score.
//  helsmithsStrikeTheGongs (AB-5)     any hero phase, per unit oncePerBattle; canUse = the gong-carrier token is on the unit and a slain model
//        can return; resolve removes the token and returns D3 models.
//  helsmithsDaemonicResilience (AB-6) passive; adjustFeelNoPain (Ward 6+ at 1 DPP, 5+ from 2) and ignoresFirstDamagePerPhase (3 DPP).
//  helsmithsGrindingAdvance (RA-1)    deployment window, oncePerBattle; up to params.maxTargets Cohorts (maxTargets) get "no charge in round
//        1" for the battle and a Normal-Move slide of params.distance" (aos-moves MoveQueue, drained by the window).
//  helsmithsSuppressiveBombardment (RA-2) shooting phase / your, oncePerTurn; target = an enemy Infantry unit the friendly Bombard damaged with
//        shooting this phase; grants { extraChargeDice: -1 } until the start of the caster's next turn (EffectGrant.expiryOwner).
//  helsmithsTalisman (ENH-1)          passive; ignoresFirstDamagePerPhase for the bearer's unit.
//  helsmithsAmulet (ENH-4)            any combat phase, oncePerBattle; grants { lethalOn: params.critOn } to the bearer until the end of the turn.
//  helsmithsChalice (ENH-2)           shooting phase / your, oncePerBattle; D3 mortal damage on a visible enemy unit within params.range.
//  helsmithsScroll (ENH-3)            any hero phase, oncePerBattle; grants the bearer Ward (params.ward) and noAbilities until the end of the turn.
//
//  AI hints: helsmithsAbilityTiming / helsmithsTargetBonus below are read by src/ai/utility.ts (abilityTiming / abilityTargetBonus). The
//  Harness and Ruinous Bombardment picks carry `hint { value, unitId }` on each option.
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook, FactionResource } from '../code-hooks'
import type { AttackContext } from '../hooks'
import type { Effect } from '../../data/types'
import type { Action } from '../actions'
import type { GameState, PendingDecision, PlayerId, Rejection, RuntimeAbility, UnitId } from '../types'
import { EPS } from '../geometry'
import { damagedByShootingThisPhase } from '../attack'
import { readDeclaredAttack } from '../declared'
import { effectService } from '../effects'
import { losService } from '../los'
import type { EngineContext } from '../modules'
import { boardUnitsOf, keywordsOf } from '../state'
import { checkSlide, writeMoveQueue, type SlideOpts } from './aos-moves'
import {
  announce, inCombat, inflictMortal, isDatasheet, liveModels, liveObjectives, onBoard, paramOf, paramsByCode, removeTokens, returnSlainModels,
  returnableModels, unitContestsObjective, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const CODE_HARNESS = 'helsmithsHarness'
const CODE_CONQUEROR = 'helsmithsConqueror'
const CODE_STRENGTH = 'helsmithsDaemonicStrength'
const CODE_TRAJECTORY = 'helsmithsCalculatedTrajectory'
const CODE_RUINOUS = 'helsmithsRuinousBombardment'
const CODE_GONGS = 'helsmithsStrikeTheGongs'
const CODE_RESILIENCE = 'helsmithsDaemonicResilience'
const CODE_GRINDING = 'helsmithsGrindingAdvance'
const CODE_SUPPRESSIVE = 'helsmithsSuppressiveBombardment'
const CODE_TALISMAN = 'helsmithsTalisman'
const CODE_AMULET = 'helsmithsAmulet'
const CODE_CHALICE = 'helsmithsChalice'
const CODE_SCROLL = 'helsmithsScroll'

const AB_HARNESS = 'helsmiths.ability.harness-daemonic-power'
const AB_GRINDING = 'helsmiths.ability.grinding-advance'
const AB_RUINOUS = 'helsmiths.ability.ruinous-bombardment'
export const DPP_TOKEN = 'daemonic-power'
const MAX_DPP = 3

const POOL = 'hohPool'
const SHOTS = 'hohShots'
const RUIN = 'hohRuin'

const unitsOf = (state: GameState, player: PlayerId): UnitId[] => boardUnitsOf(state, player).map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}
const isDespot = (state: GameState, id: UnitId): boolean => isDatasheet(state, id, undefined, 'war-despot')
const isDominator = (state: GameState, id: UnitId): boolean => isDatasheet(state, id, undefined, 'dominator-engine')
const isBombard = (state: GameState, id: UnitId): boolean => isDatasheet(state, id, undefined, 'tormentor-bombard')
const isCohort = (state: GameState, id: UnitId): boolean => isDatasheet(state, id, undefined, 'infernal-cohort')

// ---------- daemonic power points ----------
/** the unit's own daemonic power tokens (0-3) */
export const dppOf = (state: GameState, unitId: UnitId): number => state.units[unitId]?.tokens?.[DPP_TOKEN] ?? 0

/** HOH-AB-1: the unit's DPP as every rule reads it: its tokens, or 1 when it has none and a War Despot with DPP of its own is close enough
 * (wholly within 6" + 3" per Despot point) and can see it */
export function effectiveDpp(state: GameState, unitId: UnitId): number {
  const raw = dppOf(state, unitId)
  if (raw > 0) return raw
  const unit = onBoard(state, unitId)
  if (!unit) return 0
  for (const d of boardUnitsOf(state, unit.player)) {
    if (d.id === unitId || !isDespot(state, d.id)) continue
    const n = dppOf(state, d.id)
    if (n < 1) continue
    const p = paramsByCode(state, d.id, CODE_CONQUEROR)
    if (!whollyWithinUnit(state, unitId, d.id, num(p.range, 6) + num(p.perPoint, 3) * n)) continue
    const eye = liveModels(state, d.id)[0]
    if (eye && losService.unitVisible(state, eye.id, unitId)) return 1
  }
  return 0
}

const poolOf = (state: GameState, player: PlayerId): number => ((state.mission.custom[POOL] as Partial<Record<PlayerId, number>> | undefined) ?? {})[player] ?? 0
function setPool(state: GameState, player: PlayerId, n: number): void {
  const all = { ...((state.mission.custom[POOL] as Partial<Record<PlayerId, number>> | undefined) ?? {}) }
  all[player] = n
  state.mission.custom = { ...state.mission.custom, [POOL]: all }
}

// ---------- HOH-BT-1 Harness Daemonic Power ----------
const harnessCap = (state: GameState): number => num(paramOf(state, AB_HARNESS, 'max', MAX_DPP), MAX_DPP)
const harnessTargets = (state: GameState, player: PlayerId): UnitId[] => unitsOf(state, player).filter((id) => dppOf(state, id) < harnessCap(state))

/** how much the next point is worth on this unit (the AI's hint), from the spec's order: the Despot first when it covers someone, then
 * the Dominator, then the Cohort nearest the enemy, the Bombard only when it has a cluster to shoot, leftovers on the Despot */
function harnessValue(state: GameState, player: PlayerId, unitId: UnitId): number {
  const have = dppOf(state, unitId)
  const foes = unitsOf(state, other(player))
  const nearest = foes.reduce((m, e) => Math.min(m, unitGap(state, unitId, e)), Infinity)
  if (isDespot(state, unitId)) {
    if (have > 0) return 1.5 - have * 0.3
    const range = num(paramsByCode(state, unitId, CODE_CONQUEROR).range, 6) + num(paramsByCode(state, unitId, CODE_CONQUEROR).perPoint, 3)
    const covers = unitsOf(state, player).some((id) => id !== unitId && whollyWithinUnit(state, id, unitId, range))
    return covers ? 10 : 2
  }
  if (isDominator(state, unitId)) {
    const reach = inCombat(state, unitId) || nearest <= 6 + 6 + 6 + have
    return reach ? 8 - have * 0.4 : 2 - have * 0.3
  }
  if (isCohort(state, unitId)) {
    const engaged = inCombat(state, unitId) || nearest <= 12
    const close = Math.max(0, 1 - nearest / 36)
    return engaged ? (have >= 2 ? 4 : 6 - have * 0.2) + close : 1.5 - have * 0.2 + close
  }
  if (isBombard(state, unitId)) {
    const cluster = foes.some((a) => unitGap(state, unitId, a) <= 30 && foes.some((b) => b !== a && unitGap(state, unitId, b) <= 30 && unitGap(state, a, b) <= 6))
    return cluster ? 3 - have * 0.5 : 0.6
  }
  return 0.5
}

function raiseHarness(ctx: EngineContext, abilityId: string, player: PlayerId): boolean {
  const s = ctx.state
  const left = poolOf(s, player)
  const targets = harnessTargets(s, player)
  if (left <= 0 || targets.length === 0) {
    if (left > 0) ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: null, targetUnitId: null, player, summary: `Harness Daemonic Power: ${left} unspent point${left === 1 ? '' : 's'} lost` })
    setPool(s, player, 0)
    return false
  }
  ctx.decide({
    kind: 'chooseOption', player, window: 'command.end', canPass: true,
    context: { topic: 'abilityChoice', unitId: null, abilityId, data: { code: CODE_HARNESS, points: left } },
    options: targets.map((id) => ({
      id,
      label: `Harness Daemonic Power (${left} point${left === 1 ? '' : 's'} left): ${s.units[id].name} (has ${dppOf(s, id)})`,
      action: { type: 'chooseOption' as const, player, decisionId: '', optionId: id },
      hint: { value: harnessValue(s, player, id), unitId: id },
    })),
  })
  return true
}

const harnessActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => unitsOf(state, use.player ?? state.activePlayer).length > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const token = String(paramOf(s, use.abilityId, 'token', DPP_TOKEN))
    // 1) every friendly unit loses its points
    for (const u of Object.values(s.units)) if (u.player === use.player) removeTokens(ctx, u.id, token)
    // 2) the pool is the battle round plus one
    const pool = s.round + num(paramOf(s, use.abilityId, 'bonus', 1), 1)
    setPool(s, use.player, pool)
    announce(ctx, use, null, `Harness Daemonic Power: ${pool} daemonic power point${pool === 1 ? '' : 's'} to hand out (up to ${harnessCap(s)} per unit)`)
    // 3) the hand-out
    raiseHarness(ctx, use.abilityId, use.player)
  },
}

const helsmithsHarness: EngineCodeHook = {
  name: CODE_HARNESS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: harnessActivate,
  answer(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
    if (pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Harness Daemonic Power: chooseOption expected' }
    const s = ctx.state
    const player = pending.player
    const abilityId = pending.context.abilityId ?? AB_HARNESS
    if (action.type === 'pass') {
      const left = poolOf(s, player)
      ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: null, targetUnitId: null, player, summary: `Harness Daemonic Power: stops, ${left} point${left === 1 ? '' : 's'} lost` })
      setPool(s, player, 0)
      return
    }
    if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Harness Daemonic Power: pick a unit or stop' }
    const target = action.optionId
    if (poolOf(s, player) <= 0 || !harnessTargets(s, player).includes(target)) return { code: 'E_NOT_AN_OPTION', reason: `${target} cannot take another daemonic power point` }
    const u = s.units[target]
    const now = dppOf(s, target) + 1
    u.tokens = { ...u.tokens, [DPP_TOKEN]: now }
    setPool(s, player, poolOf(s, player) - 1)
    ctx.emit({ type: 'AbilityTriggered', abilityId, sourceUnitId: null, targetUnitId: target, player, summary: `Harness Daemonic Power: ${u.name} now has ${now} daemonic power point${now === 1 ? '' : 's'}` })
    raiseHarness(ctx, abilityId, player)
  },
  resourceReadout(state, _ability: RuntimeAbility, player): FactionResource | null {
    const n = poolOf(state, player)
    return n > 0
      ? { id: 'helsmiths-pool', label: 'Daemonic power to hand out', value: n, help: 'Give each point to one of your units (3 at most per unit). Points left over are lost.' }
      : null
  },
}

// ---------- HOH-AB-1 Black-Hearted Conqueror ----------
const helsmithsConqueror: EngineCodeHook = { name: CODE_CONQUEROR, kind: 'ability', hook: 'onStatQuery', run: noop }

// ---------- HOH-AB-2 Daemonic Strength ----------
const helsmithsDaemonicStrength: EngineCodeHook = {
  name: CODE_STRENGTH, kind: 'ability', hook: 'onStatQuery', run: noop,
  statDelta(state, entry, q) {
    if (q.unitId !== entry.holderUnitId || entry.active) return 0
    if (q.stat === 'M') {
      const n = effectiveDpp(state, q.unitId)
      return n * num(entry.params.move, 1)
    }
    if (q.stat === 'A' && q.weapon) {
      const n = effectiveDpp(state, q.unitId)
      return n * num(entry.params.attacks, 1)
    }
    return 0
  },
}

// ---------- HOH-AB-3 Calculated Trajectory (+ the shot record Ruinous Bombardment reads) ----------
interface ShotRecord { key: string; targets: UnitId[] }
const turnKey = (state: GameState): string => `${state.round}:${state.activePlayer}`
const shotsOf = (state: GameState): Record<UnitId, ShotRecord> => (state.mission.custom[SHOTS] as Record<UnitId, ShotRecord> | undefined) ?? {}
/** the units the Bombard's shooting targeted this turn, or null without a record from this turn */
function shotTargets(state: GameState, bombardId: UnitId): UnitId[] | null {
  const r = shotsOf(state)[bombardId]
  return r && r.key === turnKey(state) ? r.targets : null
}

const helsmithsCalculatedTrajectory: EngineCodeHook = {
  name: CODE_TRAJECTORY, kind: 'ability', hook: 'onHitRoll', hooks: ['onHitRoll'], run: noop,
  gate(state, _holder, entry, data) {
    const attack = data?.attack as AttackContext | undefined
    return !attack || liveModels(state, attack.targetUnitId).length >= num(entry.params.minModels, 5)
  },
  afterAttackSequence(ctx, entry, info) {
    const s = ctx.state
    if (entry.active || info.combat || info.attackerUnitId !== entry.holderUnitId) return
    const d = readDeclaredAttack(s)
    const fresh = d && d.unitId === info.attackerUnitId && d.phase === 'shooting' ? (d.targetUnitIds ?? []) : []
    const old = shotTargets(s, info.attackerUnitId) ?? []
    const targets = [...new Set([...old, ...fresh])]
    s.mission.custom = { ...s.mission.custom, [SHOTS]: { ...shotsOf(s), [info.attackerUnitId]: { key: turnKey(s), targets } } }
  },
}

// ---------- HOH-AB-4 Ruinous Bombardment ----------
interface RuinState { abilityId: string; player: PlayerId; unitId: UnitId; targets: UnitId[]; candidates: UnitId[]; left: number }
const ruinState = (state: GameState): RuinState | null => (state.mission.custom[RUIN] as RuinState | null | undefined) ?? null
const setRuin = (state: GameState, r: RuinState | null): void => { state.mission.custom = { ...state.mission.custom, [RUIN]: r } }

/** the one enemy unit all of the Bombard's shooting this turn was aimed at (null otherwise) */
function ruinousFirstTarget(state: GameState, bombardId: UnitId | null): UnitId | null {
  const b = onBoard(state, bombardId)
  if (!b) return null
  const t = shotTargets(state, b.id)
  if (!t || t.length !== 1) return null
  const target = onBoard(state, t[0])
  return target && target.player !== b.player ? target.id : null
}

function ruinousCandidates(state: GameState, bombardId: UnitId, first: UnitId): UnitId[] {
  const b = state.units[bombardId]
  const range = num(paramsByCode(state, bombardId, CODE_RUINOUS).range, 6)
  return unitsOf(state, other(b.player)).filter((id) => id !== first && unitGap(state, first, id) <= range + EPS)
}

function ruinousValue(state: GameState, unitId: UnitId): number {
  const objective = liveObjectives(state).some((o) => unitContestsObjective(state, unitId, o))
  return 1 + (objective ? 2 : 0) + liveModels(state, unitId).length * 0.05
}

function raiseRuinous(ctx: EngineContext, r: RuinState): boolean {
  const s = ctx.state
  const left = r.candidates.filter((id) => !r.targets.includes(id) && !!onBoard(s, id))
  if (r.left <= 0 || left.length === 0) return false
  ctx.decide({
    kind: 'chooseOption', player: r.player, window: 'shooting.attacksResolved', canPass: true,
    context: { topic: 'abilityChoice', unitId: r.unitId, abilityId: r.abilityId, data: { code: CODE_RUINOUS, left: r.left } },
    options: left.map((id) => ({
      id,
      label: `Ruinous Bombardment (${r.left} more target${r.left === 1 ? '' : 's'}): ${s.units[id].name}`,
      action: { type: 'chooseOption' as const, player: r.player, decisionId: '', optionId: id },
      hint: { value: ruinousValue(s, id), unitId: id },
    })),
  })
  return true
}

function finishRuinous(ctx: EngineContext, r: RuinState): void {
  const s = ctx.state
  const use = { abilityId: r.abilityId, unitId: r.unitId, player: r.player, targetUnitIds: r.targets, modeId: null, roll: null }
  const need = num(paramOf(s, r.abilityId, 'succeedOn', 3), 3)
  const cut = num(paramOf(s, r.abilityId, 'control', 3), 3)
  for (const t of r.targets) {
    if (!onBoard(s, t)) continue
    const n = ctx.rollExpr('D6', { purpose: 'ability', player: r.player, unitId: r.unitId, targetUnitId: t, commandRerollable: false }).total
    if (n >= need) {
      effectService.grant(ctx, t, {}, { sourceAbilityId: r.abilityId, sourceUnitId: r.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
      announce(ctx, use, t, `Ruinous Bombardment: rolled ${n}, ${s.units[t].name} has -${cut} to its control score for the rest of the turn`)
    } else {
      announce(ctx, use, t, `Ruinous Bombardment: rolled ${n}, ${s.units[t].name} holds its ground`)
    }
  }
  setRuin(s, null)
}

const ruinousActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => ruinousFirstTarget(state, unitId) !== null,
  resolve(ctx, use) {
    const s = ctx.state
    const bombard = onBoard(s, use.unitId)
    const first = ruinousFirstTarget(s, use.unitId)
    if (!bombard || !first) return
    const k = effectiveDpp(s, bombard.id)
    const candidates = ruinousCandidates(s, bombard.id, first)
    // RULING: with no more candidates than points, taking them all can only hurt the enemy, so no pick is asked
    const r: RuinState = { abilityId: use.abilityId, player: use.player, unitId: bombard.id, targets: [first], candidates, left: k }
    if (candidates.length <= k) r.targets = [first, ...candidates]
    announce(ctx, use, first, `Ruinous Bombardment: ${s.units[first].name} is the first target${k > 0 ? `, up to ${Math.min(k, candidates.length)} more within ${num(paramOf(s, use.abilityId, 'range', 6), 6)}"` : ''}`)
    if (candidates.length > k && raiseRuinous(ctx, r)) { setRuin(s, r); return }
    finishRuinous(ctx, r)
  },
}

const helsmithsRuinousBombardment: EngineCodeHook = {
  name: CODE_RUINOUS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: ruinousActivate,
  answer(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
    if (pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Ruinous Bombardment: chooseOption expected' }
    const s = ctx.state
    const r = ruinState(s)
    if (!r) return { code: 'E_NOT_AN_OPTION', reason: 'Ruinous Bombardment: nothing is waiting' }
    if (action.type === 'pass') { finishRuinous(ctx, r); return }
    if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Ruinous Bombardment: pick a unit or stop' }
    const pick = action.optionId
    if (!r.candidates.includes(pick) || r.targets.includes(pick) || r.left <= 0) return { code: 'E_NOT_AN_OPTION', reason: `${pick} is not a legal extra target` }
    const next: RuinState = { ...r, targets: [...r.targets, pick], left: r.left - 1 }
    setRuin(s, next)
    if (!raiseRuinous(ctx, next)) finishRuinous(ctx, next)
  },
  producesAt: ['onObjectiveControl'],
  produce(_ctx, entry, data) {
    if (!entry.active || data.contestingUnitId !== entry.holderUnitId) return null
    return { kind: 'stat', delta: -num(entry.params.control, 3) }
  },
}

// ---------- HOH-AB-5 Strike the Gongs ----------
const gongToken = (state: GameState, unitId: UnitId | null): string => String(paramsByCode(state, unitId, CODE_GONGS).token ?? 'gong-carrier')
const gongsActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!unitId && (state.units[unitId]?.tokens?.[gongToken(state, unitId)] ?? 0) > 0 && returnableModels(state, unitId) > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const self = onBoard(s, use.unitId)
    if (!self) return
    removeTokens(ctx, self.id, gongToken(s, self.id))
    const dice = paramOf<string>(s, use.abilityId, 'returnModels', 'D3')
    const n = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: self.id, commandRerollable: false }).total
    const back = returnSlainModels(ctx, self.id, n, use.abilityId)
    announce(ctx, use, self.id, `Strike the Gongs: the Gong Carrier is gone, ${dice} rolled ${n}, ${back} slain model${back === 1 ? '' : 's'} returned to ${self.name}`)
  },
}
const helsmithsStrikeTheGongs: EngineCodeHook = { name: CODE_GONGS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: gongsActivate }

// ---------- HOH-AB-6 Daemonic Resilience ----------
const helsmithsDaemonicResilience: EngineCodeHook = {
  name: CODE_RESILIENCE, kind: 'ability', hook: 'onStatQuery', run: noop,
  adjustFeelNoPain(state, entry, modelId, current) {
    const model = state.models[modelId]
    if (entry.active || !model || model.unitId !== entry.holderUnitId) return null
    const n = effectiveDpp(state, entry.holderUnitId)
    if (n < 1) return null
    const ward = n === 1 ? num(entry.params.ward1, 6) : num(entry.params.ward2, 5)
    return { threshold: Math.min(current ?? 7, ward), modifier: 0 }
  },
  ignoresFirstDamagePerPhase(state, entry, unitId) {
    return !entry.active && entry.holderUnitId === unitId && !!onBoard(state, unitId) && effectiveDpp(state, unitId) >= MAX_DPP
  },
}

// ---------- HOH-RA-1 Grinding Advance ----------
const slideOpts: SlideOpts = { normalMove: true }
const PROBE = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2)
const canSlide = (state: GameState, unitId: UnitId, dist: number): boolean =>
  PROBE.some((a) => checkSlide(state, unitId, Math.cos(a) * 1, Math.sin(a) * 1, dist, false, slideOpts).ok)

const grindingTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] => {
  const dist = num(paramOf(state, AB_GRINDING, 'distance', 3), 3)
  return unitsOf(state, player ?? state.activePlayer).filter((id) => isCohort(state, id) && !inCombat(state, id) && canSlide(state, id, dist))
}
const grindingActivate: ActivatedAbilityHook = {
  canUse: () => true, // the target list (a Cohort with a legal slide) is the real gate
  targets: grindingTargets as ActivatedAbilityHook['targets'],
  maxTargets: (state) => num(paramOf(state, AB_GRINDING, 'maxTargets', 2), 2),
  resolve(ctx, use) {
    const s = ctx.state
    const picked = use.targetUnitIds.filter((id) => !!onBoard(s, id))
    if (picked.length === 0) return
    const dist = num(paramOf(s, use.abilityId, 'distance', 3), 3)
    // RULING: the Cohorts may still Move and Run in round 1; only the Charge is barred
    for (const id of picked) {
      effectService.grant(ctx, id, { forbid: 'charge', when: { round: { lte: 1 } } }, { sourceAbilityId: use.abilityId, sourceUnitId: id, scope: { who: 'self' }, duration: 'battle' })
    }
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: dist, queue: picked, opts: slideOpts })
    announce(ctx, use, picked[0], `Grinding Advance: ${picked.map((id) => s.units[id].name).join(' and ')} may move up to ${dist}" and cannot charge in round 1`)
  },
}
const helsmithsGrindingAdvance: EngineCodeHook = { name: CODE_GRINDING, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: grindingActivate }

// ---------- HOH-RA-2 Suppressive Bombardment ----------
const suppressiveTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] => {
  const me = player ?? state.activePlayer
  const hit = new Set<UnitId>()
  for (const b of unitsOf(state, me)) if (isBombard(state, b)) for (const t of damagedByShootingThisPhase(state, b)) hit.add(t)
  return [...hit].filter((id) => !!onBoard(state, id) && state.units[id].player !== me && keywordsOf(state, id).includes('INFANTRY')).sort()
}
const suppressiveActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk((suppressiveTargets as (s: GameState, u: UnitId | null, p?: PlayerId) => UnitId[])(state, unitId, use.player), use),
  targets: suppressiveTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const fewer = num(paramOf(s, use.abilityId, 'fewerDice', 1), 1)
    // `expiryOwner`: the effect sits on an enemy unit but ends at the start of the caster's next turn
    effectService.grant(ctx, target, { extraChargeDice: -fewer }, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn', expiryOwner: use.player })
    announce(ctx, use, target, `Suppressive Bombardment: ${s.units[target].name} rolls ${fewer} fewer ${fewer === 1 ? 'die' : 'dice'} for its charge rolls until the start of your next turn`)
  },
}
const helsmithsSuppressiveBombardment: EngineCodeHook = { name: CODE_SUPPRESSIVE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: suppressiveActivate }

// ---------- HOH-ENH Talisman of Obsidian ----------
const helsmithsTalisman: EngineCodeHook = {
  name: CODE_TALISMAN, kind: 'ability', hook: 'onStatQuery', run: noop,
  ignoresFirstDamagePerPhase: (_state, entry, unitId) => !entry.active && unitId === entry.holderUnitId,
}

// ---------- HOH-ENH Amulet of Burning Hate ----------
const amuletActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const bearer = onBoard(s, use.unitId)
    if (!bearer) return
    const on = num(paramOf(s, use.abilityId, 'critOn', 5), 5)
    effectService.grant(ctx, bearer.id, { lethalOn: on }, { sourceAbilityId: use.abilityId, sourceUnitId: bearer.id, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, bearer.id, `Amulet of Burning Hate: ${bearer.name} scores critical hits on unmodified hit rolls of ${on}+ until the end of the turn`)
  },
}
const helsmithsAmulet: EngineCodeHook = { name: CODE_AMULET, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: amuletActivate }

// ---------- HOH-ENH Chalice of Darkness ----------
const byFewestWounds = (state: GameState) => (a: UnitId, b: UnitId): number => woundsLeft(state, a) - woundsLeft(state, b) || (a < b ? -1 : 1)
function chaliceTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  if (!me) return []
  const range = num(paramsByCode(state, me.id, CODE_CHALICE).range, 12)
  const mine = liveModels(state, me.id)
  return unitsOf(state, other(me.player))
    .filter((id) => unitGap(state, me.id, id) <= range + EPS && mine.some((m) => losService.unitVisible(state, m.id, id)))
    .sort(byFewestWounds(state))
}
const chaliceActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(chaliceTargets(state, unitId), use),
  targets: chaliceTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(s, target)) return
    const dmg = ctx.rollExpr(paramOf<string>(s, use.abilityId, 'damage', 'D3'), { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
    announce(ctx, use, target, `Chalice of Darkness: ${dmg} mortal damage on ${s.units[target].name}`)
    inflictMortal(ctx, use, target, dmg)
  },
}
const helsmithsChalice: EngineCodeHook = { name: CODE_CHALICE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: chaliceActivate }

// ---------- HOH-ENH Scroll of Petrification ----------
const scrollActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId),
  resolve(ctx, use) {
    const s = ctx.state
    const bearer = onBoard(s, use.unitId)
    if (!bearer) return
    const ward = num(paramOf(s, use.abilityId, 'ward', 2), 2)
    // the Ward is only worth its price together with the silence: noAbilities stops every Move, Shoot, Charge, Fight and activated ability
    const effects: Effect[] = [{ feelNoPain: ward }, { noAbilities: true }]
    effectService.grant(ctx, bearer.id, effects, { sourceAbilityId: use.abilityId, sourceUnitId: bearer.id, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, bearer.id, `Scroll of Petrification: ${bearer.name} has Ward (${ward}+) until the end of the turn but cannot use abilities`)
  },
}
const helsmithsScroll: EngineCodeHook = { name: CODE_SCROLL, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: scrollActivate }

export const helsmithsHooks: Record<string, EngineCodeHook> = {
  helsmithsHarness, helsmithsConqueror, helsmithsDaemonicStrength, helsmithsCalculatedTrajectory, helsmithsRuinousBombardment, helsmithsStrikeTheGongs,
  helsmithsDaemonicResilience, helsmithsGrindingAdvance, helsmithsSuppressiveBombardment, helsmithsTalisman, helsmithsAmulet, helsmithsChalice, helsmithsScroll,
}

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus; null = no opinion) ----------
// below -2 the bot passes instead of using the ability. Ability-use options carry no unit hint, so the unit is found from the army.
const nearestEnemyGap = (state: GameState, player: PlayerId, unitId: UnitId): number =>
  unitsOf(state, other(player)).reduce((m, e) => Math.min(m, unitGap(state, unitId, e)), Infinity)

export function helsmithsAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  switch (code) {
    case CODE_SCROLL: {
      // Ward 2+ costs the general its whole turn: only as a shield in the enemy's hero phase, when it is hurt and in reach
      const g = unitId ?? generalOf(state, player)
      if (!g || state.activePlayer === player) return -3
      return woundsLeft(state, g) <= 3 && nearestEnemyGap(state, player, g) <= 12 ? 0 : -3
    }
    case CODE_CHALICE: {
      const g = unitId ?? generalOf(state, player)
      const targets = g ? chaliceTargets(state, g) : []
      if (targets.length === 0) return -3
      const killable = targets.some((t) => woundsLeft(state, t) <= 2 || liveModels(state, t).every((m) => m.woundsRemaining <= 1))
      return killable || state.round >= 3 ? 0 : -3
    }
    case CODE_AMULET: {
      const g = unitId ?? generalOf(state, player)
      return g && inCombat(state, g) ? 0 : -3
    }
    case CODE_GONGS: {
      const gong = unitsOf(state, player).find((id) => (state.units[id].tokens?.[gongToken(state, id)] ?? 0) > 0)
      if (!gong) return -3
      const lost = returnableModels(state, gong)
      return lost >= 2 || (lost >= 1 && state.round >= 5) ? 0 : -3
    }
    case CODE_RUINOUS:
    case CODE_HARNESS:
    case CODE_GRINDING:
    case CODE_SUPPRESSIVE:
      return 0
    default:
      return null
  }
}

export function helsmithsTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  switch (code) {
    case CODE_CHALICE: {
      const left = woundsLeft(state, unitId)
      const hero = keywordsOf(state, unitId).includes('HERO') ? 2 : 0
      return (left <= 2 ? 5 : left <= 4 ? 2 : 0) + hero + Math.max(0, 1 - left * 0.05)
    }
    case CODE_SUPPRESSIVE: {
      // the damaged enemy Infantry unit closest to our army is the one about to charge
      const near = unitsOf(state, player).reduce((m, f) => Math.min(m, unitGap(state, unitId, f)), Infinity)
      return Math.max(0, 6 - near / 3)
    }
    case CODE_GRINDING:
      return 1
    default:
      return null
  }
}
