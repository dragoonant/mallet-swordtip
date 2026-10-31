// Combat phase module, AoS 4 / Spearhead (10-rules-core CORE-10, CORE-6.11/6.12, CORE-11.2/11.3). Owner: WP5.
//
//   1. Combat Phase abilities that are not Fight abilities: active player, then opponent (CORE-10.1, abilities service).
//   2. Players alternate picking one eligible unit, starting with the ACTIVE player (CORE-10.3); when a player has none left
//      the other picks theirs one after another (CORE-10.4). Eligible = in combat, or charged this turn; a unit fights once
//      (CORE-10.5). Strike-first (`step: 'fightsFirst'`): while a unit that was in combat when step 2 began and has
//      Strike-first is unfought, only such units may be picked; a player with none passes the pick [interp] and afterwards
//      the active player picks next (CORE-10.6). Strike-last units wait until every other unit in combat has fought
//      (CORE-10.7); a unit with both has neither (CORE-10.8).
//   3. One activation: pile in (up to 3", toward the closest enemy unit it is in combat with, no model ends farther from it
//      and the unit stays in combat with everything it was in combat with; a unit not in combat piles in any direction,
//      CORE-6.11/6.12) -> targets for every model in range (auto when only one enemy unit is possible) -> attacks
//      (attack.ts) -> done. There is no consolidation in AoS.
//
// The pile-in planner is deliberately simple (each model walks straight at the nearest target model, closest model first);
// anything cleverer is the player's own placement, validated by `pileInRejection`.
import { commandWindow } from '../cards'
import type { Action, ModelPlacement, WeaponTarget } from '../actions'
import { attackService, drainAfterFightMortal, enemyUnitsInCombat, isInCombat, ownFightResolved, rollAttackCount } from '../attack'
import {
  basesOverlap, checkPlacements, distance, emptyMoveConstraints, ENGAGEMENT_H, EPS, horizontalGap, isCoherent, pathCrossesModels,
  whollyOnBoard, type Footprint,
} from '../geometry'
import { hookService } from '../hooks-impl'
import { losService } from '../los'
import { notImplementedHandle, otherPlayer, type EngineContext, type PhaseModule } from '../modules'
import { boardUnitsOf, datasheetOf, enemyModelsOnBoard, unitModels } from '../state'
import { settleY, terrainService } from '../terrain'
import {
  EngineInvariantError,
  type DeclareTargetsDecision, type DeclaredTarget, type FightState, type GameState, type Model, type ModelId, type PendingDecision,
  type PlayerId, type Rejection, type UnitId, type Vec3, type WeaponId,
} from '../types'
import { weaponService } from '../weapons'
import { filterValid, optionActions, repairCoherency } from './legal'

// ---------- small helpers ----------
function actionKey(a: Action): string {
  const { seq: _s, decisionId: _d, player: _p, ...rest } = a as Action & { seq?: number }
  return JSON.stringify(rest, Object.keys(rest).sort())
}
function optionCheck(pending: PendingDecision, action: Action): Rejection | null {
  if (action.type === 'pass') return null
  if (!('options' in pending) || !Array.isArray(pending.options)) return null
  if (action.type === 'chooseOption') {
    return pending.options.some((o) => o.id === action.optionId) ? null : { code: 'E_NOT_AN_OPTION', reason: `option ${action.optionId} is not offered` }
  }
  const key = actionKey(action)
  return pending.options.some((o) => actionKey(o.action) === key) ? null : { code: 'E_NOT_AN_OPTION', reason: 'answer is not one of the offered options' }
}

function readMark(state: GameState, key: string): string | null {
  const prefix = `${key}=`
  const m = state.phaseState.marks.find((x) => x.startsWith(prefix))
  return m ? m.slice(prefix.length) : null
}
function writeMark(state: GameState, key: string, value: string): void {
  const prefix = `${key}=`
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(prefix))
  state.phaseState.marks.push(prefix + value)
}

// ---------- F12 (SCE-AB-1 Deliver Judgement): a second Fight for one unit ----------
// grantExtraFight writes the phase mark fi:extra:<unitId> = { left, strikeLast }. A unit that has fought stays pickable while
// `left > 0` (still CORE-10.2 eligible, still subject to Strike-last waiting; never in the Strike-first step). With strikeLast the
// unit gets Strike-last once its first activation is over (CORE-10.7; CORE-10.8 still cancels it against Strike-first). The second
// activation runs on fresh progress keys (activation counter fi:acts:<unitId>), so its windows, pile-in, targets and Attacks rolls
// are its own. Ability limits (CORE-3.3 / 3.4) are per ability use and are not re-checked here: a Fight is not an activated ability.
interface ExtraFight { left: number; strikeLast: boolean }
const EXTRA = 'fi:extra:'
const ACTS = 'fi:acts:'

export function grantExtraFight(state: GameState, unitId: UnitId, opts: { strikeLastAfterFirst?: boolean } = {}): void {
  const strikeLast = opts.strikeLastAfterFirst === true
  writeMark(state, EXTRA + unitId, JSON.stringify({ left: 1, strikeLast } satisfies ExtraFight))
  // granted after the unit already fought: the Strike-last applies at once
  const fight = state.phaseState.fight as FightState | null
  if (strikeLast && fight?.fought.includes(unitId) && state.units[unitId]) state.units[unitId].turn.fightsLast = true
}
export function extraFightOf(state: GameState, unitId: UnitId): ExtraFight | null {
  const raw = readMark(state, EXTRA + unitId)
  return raw === null ? null : (JSON.parse(raw) as ExtraFight)
}
const extraLeft = (state: GameState, unitId: UnitId): boolean => (extraFightOf(state, unitId)?.left ?? 0) > 0
// how many activations the unit has started this phase; the progress-key suffix of the current one ('' for the first)
const activationsOf = (state: GameState, unitId: UnitId): number => Number(readMark(state, ACTS + unitId) ?? '0')
function actKey(state: GameState, unitId: UnitId): string {
  const n = activationsOf(state, unitId)
  return n > 1 ? `${unitId}~${n}` : unitId
}

// ---------- eligibility and order (CORE-10.2-10.8) ----------
function eligibleToFight(state: GameState, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u || u.location !== 'board' || !(u.turn.chargedThisTurn || isInCombat(state, unitId))) return false
  // F18 (HOH C4, Effect.noAbilities): the Fight ability is a Core ability the unit cannot use (it can still be attacked)
  return !hookService.unitHasEffectFlag(state, unitId, 'noAbilities')
}

function rawStrikeFirst(state: GameState, unitId: UnitId): boolean {
  const u = state.units[unitId]
  return !!u && (u.turn.fightsFirst || (hookService.eligibilityFor?.(state, unitId, 'strikeFirst') ?? false) || (hookService.eligibilityFor?.(state, unitId, 'fightFirst') ?? false)
    || (state.datasheets[u.datasheetId]?.coreAbilities.some((c) => c.ability === 'FIGHTS_FIRST') ?? false))
}
const rawStrikeLast = (state: GameState, unitId: UnitId): boolean => !!state.units[unitId]?.turn.fightsLast
// CORE-10.8: both cancel out
const hasStrikeFirst = (state: GameState, unitId: UnitId): boolean => rawStrikeFirst(state, unitId) && !rawStrikeLast(state, unitId)
const hasStrikeLast = (state: GameState, unitId: UnitId): boolean => rawStrikeLast(state, unitId) && !rawStrikeFirst(state, unitId)

// CORE-10.6: the Strike-first queue is fixed when step 2 begins (units in combat then); later arrivals get no priority
const SF_KEY = 'fi:sfSnapshot'
function sfSnapshot(state: GameState): Set<UnitId> {
  if (readMark(state, SF_KEY) === null) {
    const ids = Object.values(state.units).filter((u) => u.location === 'board' && isInCombat(state, u.id) && hasStrikeFirst(state, u.id)).map((u) => u.id)
    writeMark(state, SF_KEY, JSON.stringify(ids))
  }
  return new Set(JSON.parse(readMark(state, SF_KEY) as string) as UnitId[])
}

function eligibleFighters(state: GameState, player: PlayerId, step: FightState['step']): UnitId[] {
  const fight = state.phaseState.fight as FightState
  const fought = new Set(fight.fought)
  const snapshot = step === 'fightsFirst' ? sfSnapshot(state) : null
  // CORE-10.7: Strike-last units wait while some other unit in combat has not fought
  const othersWaiting = Object.values(state.units).some((u) => u.location === 'board' && !fought.has(u.id) && u.id !== fight.currentUnitId && isInCombat(state, u.id) && !hasStrikeLast(state, u.id) && eligibleToFight(state, u.id))
  const out: UnitId[] = []
  for (const u of boardUnitsOf(state, player)) {
    // F12: a unit with an extra Fight left may be picked again, but only after the Strike-first step
    if ((fought.has(u.id) && (step === 'fightsFirst' || !extraLeft(state, u.id))) || u.id === fight.currentUnitId || !eligibleToFight(state, u.id)) continue
    if (snapshot && !snapshot.has(u.id)) continue
    if (step === 'remaining' && hasStrikeLast(state, u.id) && othersWaiting) continue
    out.push(u.id)
  }
  return out
}

// ---------- melee weapons and who can attack whom (CORE-11.2 / 11.3) ----------
function meleeWeaponIdsOf(state: GameState, modelId: ModelId): WeaponId[] {
  const seen = new Set<string>()
  return state.models[modelId].weapons.filter((w) => {
    if (state.weapons[w]?.kind !== 'melee' || !weaponService.isAvailable(state, modelId, w)) return false
    const g = state.weapons[w].profileGroup
    if (g) { if (seen.has(g)) return false; seen.add(g) }
    return true
  })
}

// a model must attack with all its melee weapons (CORE-11.3): the list is simply every melee weapon it has
export function resolveModelWeapons(_ctx: EngineContext, modelId: ModelId): WeaponId[] | 'pending' { return meleeWeaponIdsOf(_ctx.state, modelId) }

export function enemyUnitIdsOnBoard(state: GameState, player: PlayerId): UnitId[] {
  return Object.values(state.units).filter((u) => u.player !== player && u.location === 'board').map((u) => u.id)
}

// CORE-11.3: `model` may target `enemyId` if one of its models is within the model's combat range and visible to it
export function legalTargetsFor(state: GameState, unitId: UnitId, model: Model, enemyIds: UnitId[], _friends?: Model[]): UnitId[] {
  const out: UnitId[] = []
  for (const enemyId of enemyIds) {
    // F14 (NH-ENH Cloaked in Shadow): an ability can forbid this target (EngineCodeHook.forbidsFightTarget)
    if (hookService.fightTargetForbidden(state, unitId, enemyId)) continue
    const em = state.units[enemyId]?.location === 'board' ? unitModels(state, enemyId) : []
    if (em.some((e) => horizontalGap(model, e) <= ENGAGEMENT_H + EPS && losService.visible(state, model.id, e.id))) out.push(enemyId)
  }
  return out
}

export function attacksFor(ctx: EngineContext, modelId: ModelId, weaponId: WeaponId, targetUnitId: UnitId | null = null): number {
  const owner = ctx.state.models[modelId]?.unitId
  const acts = owner ? activationsOf(ctx.state, owner) : 0
  const key = `fi:atk:${modelId}:${weaponId}${acts > 1 ? `~${acts}` : ''}`
  const cached = readMark(ctx.state, key)
  if (cached !== null) return Number(cached)
  const n = rollAttackCount(ctx, modelId, weaponId, targetUnitId)
  writeMark(ctx.state, key, String(n))
  return n
}

// ---------- pile in (CORE-6.11 / 6.12) ----------
interface Geo { models: Model[]; enemies: Model[]; otherFriendly: Model[] }
function fightGeo(state: GameState, unitId: UnitId): Geo {
  const player = state.units[unitId].player
  const otherFriendly: Model[] = []
  for (const u of boardUnitsOf(state, player)) if (u.id !== unitId) otherFriendly.push(...unitModels(state, u.id))
  return { models: unitModels(state, unitId), enemies: enemyModelsOnBoard(state, player), otherFriendly }
}

const fp = (m: Model, pos?: Vec3): Footprint => ({ pos: pos ?? m.pos, facing: m.facing, base: m.base })
const gapToUnit = (f: Footprint, targets: Model[]): number => Math.min(...targets.map((t) => distance(f, t)))

// travel (2D) for `m` to close its horizontal gap with `target` to `stopGap` (binary search; exact for oval bases)
function contactPoint(m: Model, target: Model, stopGap: number): { point: Vec3; travel: number } {
  const dx = target.pos.x - m.pos.x, dz = target.pos.z - m.pos.z
  const d = Math.hypot(dx, dz)
  if (d < EPS) return { point: { ...m.pos }, travel: 0 }
  const ux = dx / d, uz = dz / d
  const at = (t: number): Vec3 => ({ x: m.pos.x + ux * t, y: m.pos.y, z: m.pos.z + uz * t })
  const gapAt = (t: number): number => horizontalGap({ pos: at(t), facing: m.facing, base: m.base }, target)
  if (gapAt(0) <= stopGap + EPS) return { point: { ...m.pos }, travel: 0 }
  let lo = 0, hi = Math.max(d - 1e-4, 0)
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (gapAt(mid) > stopGap) lo = mid; else hi = mid }
  return { point: at(hi), travel: hi }
}

// the closest enemy unit this unit is in combat with (the pile-in target in the lean build)
function defaultPileInTarget(state: GameState, unitId: UnitId): UnitId | null {
  const mine = unitModels(state, unitId)
  let best: UnitId | null = null, bestD = Infinity
  for (const e of enemyUnitsInCombat(state, unitId)) {
    const d = Math.min(...unitModels(state, e).flatMap((em) => mine.map((m) => distance(m, em))))
    if (d < bestD) { bestD = d; best = e }
  }
  return best
}

function terrainOk(state: GameState, m: Model, to: Vec3, path: Vec3[]): boolean {
  return terrainService.canEndAt(state, m, to).ok && !terrainService.crossesImpassable(state, m, path)
}

// the full legality of a pile-in arrangement (CORE-6.11/6.12, CORE-6.5, CORE-1.8); `null` = legal. Exported for tests.
export function pileInRejection(state: GameState, unitId: UnitId, distanceAllowed: number, placements: ModelPlacement[]): Rejection | null {
  const geo = fightGeo(state, unitId)
  const checked = checkPlacements({
    unitModels: geo.models, placements, constraints: emptyMoveConstraints(distanceAllowed, { coherency: true }),
    otherFriendly: geo.otherFriendly, enemies: geo.enemies, board: state.board, coherencyRange: datasheetOf(state, unitId).coherencyRange,
  })
  if (checked.rejection) return checked.rejection
  const moved = checked.resolved.filter((r) => r.distance > EPS)
  for (const r of moved) {
    const f = fp(r.model, r.to)
    if (pathCrossesModels(f, r.path, [...geo.enemies, ...geo.otherFriendly])) return { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross another model`, details: { modelId: r.model.id } }
    if (!terrainOk(state, r.model, r.to, r.path)) return { code: 'E_OVERLAP', reason: `${r.model.id} cannot move there (terrain)`, details: { modelId: r.model.id } }
  }
  const before = enemyUnitsInCombat(state, unitId)
  if (before.length === 0) return null // CORE-6.12: any direction
  // CORE-6.11: some enemy unit it was in combat with is the pile-in target: no moved model ends farther from it
  const finals = checked.resolved.map((r) => ({ r, f: fp(r.model, r.to) }))
  const okTarget = before.some((t) => {
    const tm = unitModels(state, t)
    return moved.every((r) => gapToUnit(fp(r.model, r.to), tm) <= gapToUnit(fp(r.model), tm) + EPS)
  })
  if (!okTarget) return { code: 'E_OUT_OF_RANGE', reason: 'every model must end no farther from the pile-in target than it started', details: {} }
  // ... and the unit is still in combat with every unit it was in combat with
  for (const t of before) {
    const tm = unitModels(state, t)
    if (!finals.some(({ f }) => tm.some((e) => horizontalGap(f, e) <= ENGAGEMENT_H + EPS))) {
      return { code: 'E_ENGAGEMENT', reason: `the unit must stay in combat with ${t}`, details: { targetUnitId: t } }
    }
  }
  return null
}

// heuristic arrangement: closest model first, each walking straight at its nearest target model; coherency repaired after
function planPileIn(state: GameState, unitId: UnitId, dist: number): ModelPlacement[] {
  const geo = fightGeo(state, unitId)
  const targetId = defaultPileInTarget(state, unitId)
  const targets = targetId ? unitModels(state, targetId) : geo.enemies
  if (targets.length === 0 || geo.models.length === 0) return []
  const order = [...geo.models].sort((a, b) => gapToUnit(fp(a), targets) - gapToUnit(fp(b), targets))
  const finalPos = new Map<ModelId, Vec3>()
  const blockers = (self: Model): Footprint[] => [
    ...geo.enemies.map((e) => fp(e)), ...geo.otherFriendly.map((o) => fp(o)),
    ...geo.models.filter((o) => o.id !== self.id).map((o) => fp(o, finalPos.get(o.id) ?? o.pos)),
  ]
  for (const m of order) {
    if (gapToUnit(fp(m), targets) <= 0.05) continue
    const nearest = targets.reduce((a, b) => (distance(fp(m), a) <= distance(fp(m), b) ? a : b))
    const c = contactPoint(m, nearest, 0.05)
    for (const factor of [1, 0.75, 0.5, 0.3, 0.15]) {
      const travel = Math.min(dist, c.travel) * factor
      if (travel < 0.05) break
      const dx = c.point.x - m.pos.x, dz = c.point.z - m.pos.z
      const d = Math.hypot(dx, dz) || 1
      const to: Vec3 = { x: m.pos.x + (dx / d) * travel, y: m.pos.y, z: m.pos.z + (dz / d) * travel }
      to.y = settleY(state, m, to.x, to.z, m.pos.y)
      const f = fp(m, to)
      if (!whollyOnBoard(f, state.board) || blockers(m).some((b) => basesOverlap(f, b))) continue
      const path = [m.pos, to]
      if (pathCrossesModels(f, path, [...geo.enemies, ...geo.otherFriendly]) || !terrainOk(state, m, to, path)) continue
      if (gapToUnit(f, targets) > gapToUnit(fp(m), targets) + EPS) continue
      finalPos.set(m.id, to)
      break
    }
  }
  const toPlacements = (pos: Map<ModelId, Vec3>): ModelPlacement[] => geo.models.filter((m) => pos.has(m.id)).map((m) => ({ modelId: m.id, pos: pos.get(m.id) as Vec3, facing: m.facing, path: [m.pos, pos.get(m.id) as Vec3] }))
  const planned = toPlacements(finalPos)
  const coherent = (pl: ModelPlacement[]): boolean => isCoherent(geo.models.map((m) => fp(m, pl.find((p) => p.modelId === m.id)?.pos)), datasheetOf(state, unitId).coherencyRange)
  if (coherent(planned)) return planned
  const repaired = repairCoherency(geo.models, planned, { allowance: () => dist - 0.02, blockers: [...geo.otherFriendly, ...geo.enemies], ok: (m, to) => terrainOk(state, m, to, [m.pos, to]) })
  return coherent(repaired) ? repaired : []
}

function legalPileIns(state: GameState, unitId: UnitId, dist: number, limit = 3): ModelPlacement[][] {
  const out: ModelPlacement[][] = []
  const seen = new Set<string>()
  const add = (pl: ModelPlacement[]): void => {
    const k = JSON.stringify(pl)
    if (seen.has(k) || out.length >= limit) return
    seen.add(k)
    if (pileInRejection(state, unitId, dist, pl) === null) out.push(pl)
  }
  add(planPileIn(state, unitId, dist))
  add([])
  return out
}

// F18 (HOS C3, EngineCodeHook.pileInBonus): extra pile-in inches for this activation, rolled once and kept in the marks
function pileInBonus(ctx: EngineContext, unitId: UnitId, act: string): number {
  const s = ctx.state
  const key = `fi:pileBonus:${act}`
  const kept = readMark(s, key)
  if (kept !== null) return Number(kept)
  let total = 0
  const player = s.units[unitId]?.player ?? s.activePlayer
  for (const b of hookService.pileInBonusFor?.(s, unitId) ?? []) {
    const r = ctx.rollExpr(b.expr, { purpose: 'ability', player, unitId })
    total += r.total
    const name = s.abilities[b.sourceId]?.name ?? b.sourceId
    ctx.emit({ type: 'AbilityTriggered', abilityId: b.sourceId, sourceUnitId: unitId, targetUnitId: unitId, summary: `${name}: +${r.total}" pile-in`, player })
  }
  writeMark(s, key, String(total))
  return total
}

// ---------- F18 (HOS C4, HOS-RA-1 Bringers of Degradation): a chained Fight ----------
// chainFight(state, unitId) writes fi:chain:<player> = unitId. Right after the current activation of that player resolves (its
// fightAfter window included), the named unit is picked at once if fightPickable still allows it (same Strike-first / Strike-last
// checks), with no chooseFightUnit decision. The alternation then continues as if the player had made one pick. A chained
// activation never offers another chain (isChainedFight).
const CHAIN = 'fi:chain:'
const CHAINED = 'fi:chained:'
export function chainFight(state: GameState, unitId: UnitId): void {
  const u = state.units[unitId]
  if (u) writeMark(state, CHAIN + u.player, unitId)
}
// what the pick step would offer now: the unit's player could pick it in the current step (the unit fighting right now excluded)
export function fightPickable(state: GameState, unitId: UnitId): boolean {
  const fight = state.phaseState.fight as FightState | null
  const u = state.units[unitId]
  if (!fight || state.phase !== 'fight' || !u) return false
  return eligibleFighters(state, u.player, fight.step).includes(unitId)
}
// the unit's current activation was started by chainFight
export function isChainedFight(state: GameState, unitId: UnitId): boolean {
  return readMark(state, CHAINED + unitId) === String(activationsOf(state, unitId))
}
function startChain(ctx: EngineContext, player: PlayerId): void {
  const s = ctx.state
  const id = readMark(s, CHAIN + player)
  if (id === null || id === '') return
  writeMark(s, CHAIN + player, '')
  if (!fightPickable(s, id)) return
  const fight = s.phaseState.fight as FightState
  fight.currentUnitId = id
  fight.subStep = 'pileIn'
  // the chained activation counts as part of `player`'s pick: the other player picks once it is over
  fight.nextToSelect = otherPlayer(player)
  writeMark(s, ACTS + id, String(activationsOf(s, id) + 1))
  writeMark(s, CHAINED + id, String(activationsOf(s, id)))
  ctx.emit({ type: 'FightUnitSelected', unitId: id, step: fight.step })
}

function doPileIn(ctx: EngineContext, unitId: UnitId): 'pending' | 'progress' {
  const s = ctx.state
  const act = actKey(s, unitId)
  if (ctx.marked(`fi:piledIn:${act}`)) return 'progress'
  const dist = (hookService.pileInDistance?.(s, unitId, 3) ?? 3) + pileInBonus(ctx, unitId, act)
  // offered only when some model can actually move (otherwise there is nothing to decide)
  const planned = unitModels(s, unitId).length === 0 ? [] : planPileIn(s, unitId, dist)
  if (planned.length === 0 || pileInRejection(s, unitId, dist, planned) !== null) { ctx.once(`fi:piledIn:${act}`); return 'progress' }
  ctx.decide({
    kind: 'pileIn', player: s.units[unitId].player, window: 'fight.unitSelected', canPass: false,
    context: { unitId, distance: dist }, constraints: emptyMoveConstraints(dist, { coherency: true }),
  })
  return 'pending'
}

function applyPileIn(ctx: EngineContext, unitId: UnitId, action: Extract<Action, { type: 'pileIn' }>, pending: Extract<PendingDecision, { kind: 'pileIn' }>): Rejection | void {
  const s = ctx.state
  const geo = fightGeo(s, unitId)
  const checked = checkPlacements({
    unitModels: geo.models, placements: action.placements, constraints: emptyMoveConstraints(pending.context.distance, { coherency: true }),
    otherFriendly: geo.otherFriendly, enemies: geo.enemies, board: s.board, coherencyRange: datasheetOf(s, unitId).coherencyRange,
  })
  if (checked.rejection) throw new EngineInvariantError('fight: stored pile-in placements failed re-validation', { rejection: checked.rejection })
  for (const r of checked.resolved) if (r.distance > EPS) { r.model.pos = r.to; r.model.facing = r.facing }
  ctx.emit({ type: 'PiledIn', unitId, paths: Object.fromEntries(checked.resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path])) })
  ctx.once(`fi:piledIn:${actKey(s, unitId)}`)
}

// ---------- declare targets and attacks ----------
interface WeaponEntry { modelId: ModelId; weaponId: WeaponId; profileGroup: string | null; legalTargets: UnitId[]; attacks: number }

function weaponEntries(ctx: EngineContext, unitId: UnitId): WeaponEntry[] {
  const s = ctx.state
  const enemyIds = enemyUnitIdsOnBoard(s, s.units[unitId].player)
  const out: WeaponEntry[] = []
  for (const m of unitModels(s, unitId)) {
    const legal = legalTargetsFor(s, unitId, m, enemyIds)
    if (legal.length === 0) continue
    for (const wid of meleeWeaponIdsOf(s, m.id)) {
      out.push({ modelId: m.id, weaponId: wid, profileGroup: s.weapons[wid].profileGroup, legalTargets: legal, attacks: attacksFor(ctx, m.id, wid, legal[0]) })
    }
  }
  return out
}

function doDeclareTargets(ctx: EngineContext, unitId: UnitId): 'pending' | 'progress' {
  const s = ctx.state
  const act = actKey(s, unitId)
  if (ctx.marked(`fi:declared:${act}`)) return 'progress'
  const weapons = weaponEntries(ctx, unitId)
  if (!weapons.some((w) => w.legalTargets.length > 0 && w.attacks > 0)) { ctx.once(`fi:declared:${act}`); return 'progress' }
  const engagedWith = [...new Set(weapons.flatMap((w) => w.legalTargets))]
  // one possible enemy unit: nothing to choose, declare everything at it
  if (engagedWith.length === 1) {
    const targets: DeclaredTarget[] = weapons.map((w) => ({ modelId: w.modelId, weaponId: w.weaponId, targetUnitId: engagedWith[0], profileGroup: w.profileGroup, attacks: w.attacks }))
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: unitId, overwatch: false, targets })
    ctx.once(`fi:declared:${act}`)
    return 'progress'
  }
  ctx.decide({
    kind: 'declareTargets', player: s.units[unitId].player, window: 'fight.unitSelected', canPass: false,
    context: { unitId, attackKind: 'melee', overwatch: false, weapons, engagedWith },
  })
  return 'pending'
}

function validateDeclareTargets(pending: Extract<PendingDecision, { kind: 'declareTargets' }>, action: Extract<Action, { type: 'declareTargets' }>): Rejection | null {
  const totals = new Map<string, number>()
  for (const w of pending.context.weapons) totals.set(`${w.modelId}|${w.weaponId}`, w.attacks ?? 0)
  const sums = new Map<string, number>()
  for (const t of action.targets) {
    const key = `${t.modelId}|${t.weaponId}`
    const w = pending.context.weapons.find((x) => x.modelId === t.modelId && x.weaponId === t.weaponId)
    if (!w) return { code: 'E_SCHEMA', reason: `${t.modelId} is not attacking with ${t.weaponId}` }
    if (!w.legalTargets.includes(t.targetUnitId)) return { code: 'E_INVALID_TARGET', reason: `${t.modelId} may not target ${t.targetUnitId} with ${t.weaponId}`, details: { modelId: t.modelId, targetUnitId: t.targetUnitId } }
    sums.set(key, (sums.get(key) ?? 0) + (t.attacks ?? (totals.get(key) as number)))
  }
  for (const [key, total] of totals) {
    if (total <= 0) continue
    if ((sums.get(key) ?? 0) !== total) return { code: 'E_SCHEMA', reason: `attacks for ${key} must sum to ${total}`, details: { key, total } }
  }
  return null
}

function applyDeclareTargets(ctx: EngineContext, action: Extract<Action, { type: 'declareTargets' }>): void {
  const declared: DeclaredTarget[] = action.targets.map((t: WeaponTarget) => ({ modelId: t.modelId, weaponId: t.weaponId, targetUnitId: t.targetUnitId, profileGroup: t.profileGroup ?? null, attacks: t.attacks ?? null }))
  attackService.begin(ctx, { kind: 'melee', attackerUnitId: action.unitId, overwatch: false, targets: declared })
  ctx.once(`fi:declared:${actKey(ctx.state, action.unitId)}`)
}

function doAttacks(ctx: EngineContext, unitId: UnitId): 'pending' | 'progress' {
  const s = ctx.state
  if (!s.phaseState.attack) return 'progress'
  const act = actKey(s, unitId)
  if (!ctx.marked(`fi:tdWindow:${act}`)) {
    if (ctx.window('fight.targetsDeclared', act, ctx.order.active(), { unitId })) return 'pending'
    ctx.once(`fi:tdWindow:${act}`)
  }
  if (attackService.advance(ctx) === 'pending') return 'pending'
  return 'progress'
}

// ---------- select / drive one unit's activation ----------
function doFightSelect(ctx: EngineContext): 'pending' | 'nextStep' | 'done' {
  const s = ctx.state
  const fight = s.phaseState.fight as FightState
  const primary = fight.nextToSelect
  const secondary = otherPlayer(primary)
  let player = primary
  let eligible = eligibleFighters(s, primary, fight.step)
  if (eligible.length === 0) { eligible = eligibleFighters(s, secondary, fight.step); player = secondary }
  if (eligible.length === 0) return fight.step === 'fightsFirst' ? 'nextStep' : 'done'
  ctx.decide({
    kind: 'chooseFightUnit', player, window: 'fight.start', canPass: false,
    context: { step: fight.step, eligible },
    options: eligible.map((id) => ({ id, label: id, action: { type: 'chooseFightUnit', player, decisionId: '', unitId: id } })),
  })
  return 'pending'
}

function finishUnit(ctx: EngineContext, unitId: UnitId, player: PlayerId): void {
  const s = ctx.state
  const fight = s.phaseState.fight as FightState
  // F12: the extra Fight is spent by the second activation; after the first, a strikeLast grant gives the unit Strike-last
  const extra = extraFightOf(s, unitId)
  if (extra) {
    if (fight.fought.includes(unitId)) writeMark(s, EXTRA + unitId, JSON.stringify({ ...extra, left: 0 }))
    else if (extra.strikeLast && s.units[unitId]) s.units[unitId].turn.fightsLast = true
  }
  if (s.units[unitId]) s.units[unitId].turn.foughtThisPhase = true
  if (!fight.fought.includes(unitId)) fight.fought.push(unitId)
  fight.nextToSelect = otherPlayer(player)
  fight.currentUnitId = null
  fight.subStep = 'select'
}

function driveFightUnit(ctx: EngineContext): 'pending' | 'progress' {
  const s = ctx.state
  const fight = s.phaseState.fight as FightState
  const unitId = fight.currentUnitId as UnitId
  const unit = s.units[unitId]
  const act = actKey(s, unitId)
  if (!unit || unit.location !== 'board') {
    if (fightResolvedOnce(ctx, unitId, act)) return 'pending'
    const who = unit?.player ?? s.activePlayer
    finishUnit(ctx, unitId, who)
    startChain(ctx, who)
    return 'progress'
  }

  if (!ctx.marked(`fi:selWindow:${act}`)) {
    if (ctx.window('fight.unitSelected', act, ctx.order.active(), { unitId })) return 'pending'
    ctx.once(`fi:selWindow:${act}`)
  }
  // LRL-BT-3 Gale Force (F8): reactions to declaring a Fight attack, the fighting unit's player only, before the pile-in
  if (ctx.services.abilities.runReactionWindow?.(ctx, unit.player, { kind: 'youDeclaredAttack', unitId, phase: 'fight' }, `fi:${act}`)) return 'pending'
  if (fight.subStep === 'pileIn') {
    if (doPileIn(ctx, unitId) === 'pending') return 'pending'
    fight.subStep = 'declareTargets'
  }
  if (fight.subStep === 'declareTargets') {
    if (doDeclareTargets(ctx, unitId) === 'pending') return 'pending'
    fight.subStep = 'attacks'
  }
  if (fight.subStep === 'attacks') {
    // SKV-RA-1 (F12): the opponent's reactions to this declared Fight attack, targets known, before any dice
    const atk = s.phaseState.attack
    if (atk && atk.attackerUnitId === unitId && ctx.services.abilities.runReactionWindow?.(ctx, otherPlayer(unit.player), { kind: 'opponentDeclaredAttack', unitId, phase: 'fight', targetUnitIds: [...atk.targetUnitIds] }, `fit:${act}`)) return 'pending'
    if (doAttacks(ctx, unitId) === 'pending') return 'pending'
    if (!ctx.marked(`fi:arWindow:${act}`)) {
      if (ctx.window('fight.attacksResolved', act, ctx.order.active(), { unitId })) return 'pending'
      ctx.once(`fi:arWindow:${act}`)
    }
    if (s.phaseState.attack && attackService.advance(ctx) === 'pending') return 'pending'
  }
  if (fightResolvedOnce(ctx, unitId, act)) return 'pending'
  finishUnit(ctx, unitId, unit.player)
  startChain(ctx, unit.player)
  return 'progress'
}

// the end of one Fight activation, once (re-entered after a decision in the fightAfter window): deferred mortals (STD-AB-4 Glorious
// Death), the fighting unit's own after-the-Fight hooks (SBG-BT-2 The Hunger, F12), then F14 (SYL C3) the fighting player's
// 'fightAfter' ability window (moves queued for it, SYL-ENH-2 Zephyrkin). true = a decision is pending
function fightResolvedOnce(ctx: EngineContext, unitId: UnitId, act: string): boolean {
  const s = ctx.state
  if (!ctx.marked(`fi:resolved:${act}`)) {
    drainAfterFightMortal(ctx)
    ownFightResolved(ctx, unitId)
    ctx.once(`fi:resolved:${act}`)
  }
  const player = s.units[unitId]?.player ?? s.activePlayer
  return ctx.services.abilities.runWindow(ctx, 'fightAfter', player, `fight:after:${act}`)
}

// ---------- legal-action candidates ----------
function fightLegalActions(state: GameState, pending: PendingDecision): Action[] | null {
  if (pending.kind === 'pileIn') {
    const unitId = pending.context.unitId
    if (!state.units[unitId]) return []
    return legalPileIns(state, unitId, pending.context.distance, 3).map((placements) => ({ type: 'pileIn', player: pending.player, decisionId: pending.id, unitId, placements }) as Action)
  }
  if (pending.kind === 'declareTargets') {
    const { unitId, weapons, engagedWith } = pending.context
    const prefs = engagedWith.length > 0 ? engagedWith : [...new Set(weapons.flatMap((w) => w.legalTargets))]
    const candidates: Action[] = []
    for (const pref of prefs) {
      const targets: WeaponTarget[] = []
      for (const w of weapons) {
        if ((w.attacks ?? 0) <= 0 || w.legalTargets.length === 0) continue
        const t = w.legalTargets.includes(pref) ? pref : w.legalTargets[0]
        targets.push({ modelId: w.modelId, weaponId: w.weaponId, targetUnitId: t, ...(w.profileGroup ? { profileGroup: w.profileGroup } : {}), attacks: w.attacks as number })
      }
      candidates.push({ type: 'declareTargets', player: pending.player, decisionId: pending.id, unitId, targets })
    }
    return filterValid(candidates, (a) => fightModule.validate?.(state, a, pending) ?? null, 4)
  }
  return optionActions(pending)
}

export const fightModule: PhaseModule = {
  name: 'fight',
  legalActions(state, pending) { return fightLegalActions(state, pending) },
  enter(ctx) {
    const s = ctx.state
    s.step = 'fightsFirst'
    // CORE-10.3: the ACTIVE player makes the first pick
    s.phaseState.fight = { step: 'fightsFirst', subStep: 'select', currentUnitId: null, fought: [], nextToSelect: s.activePlayer, counterOffensive: false }
    s.phaseState.attack = null
  },
  advance(ctx) {
    const s = ctx.state
    for (;;) {
      const fight = s.phaseState.fight as FightState
      // CORE-10.1: Combat Phase abilities that are not Fight abilities, active player then opponent, before the first pick
      if (!ctx.marked('fi:ab:active')) {
        if (ctx.services.abilities.runWindow(ctx, 'fight', s.activePlayer, 'fight:active')) return 'pending'
        if (commandWindow(ctx, 'fight', s.activePlayer, 'fight:active')) return 'pending'
        ctx.once('fi:ab:active')
      }
      if (!ctx.marked('fi:ab:enemy')) {
        if (ctx.services.abilities.runWindow(ctx, 'fight', otherPlayer(s.activePlayer), 'fight:enemy')) return 'pending'
        if (commandWindow(ctx, 'fight', otherPlayer(s.activePlayer), 'fight:enemy')) return 'pending'
        ctx.once('fi:ab:enemy')
      }
      if (fight.currentUnitId) {
        if (driveFightUnit(ctx) === 'pending') return 'pending'
        continue
      }
      const r = doFightSelect(ctx)
      if (r === 'pending') return 'pending'
      if (r === 'nextStep') {
        fight.step = 'remaining'
        s.step = 'remaining'
        fight.nextToSelect = s.activePlayer // CORE-10.6: the active player picks next
        continue
      }
      return 'done'
    }
  },
  validate(state, action, pending) {
    if (pending.kind === 'pileIn') {
      if (action.type !== 'pileIn') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'pileIn is for the wrong unit', details: { expected: pending.context.unitId } }
      return pileInRejection(state, action.unitId, pending.context.distance, action.placements)
    }
    if (pending.kind === 'declareTargets') {
      if (action.type !== 'declareTargets') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'declareTargets is for the wrong unit', details: { expected: pending.context.unitId } }
      return validateDeclareTargets(pending, action)
    }
    return optionCheck(pending, action)
  },
  handle(ctx, action, pending): Rejection | void {
    const s = ctx.state
    if (action.type === 'pass') return { code: 'E_PASS_NOT_ALLOWED', reason: `fight: pass is not valid for ${pending.kind}` }
    if (pending.kind === 'chooseFightUnit' && action.type === 'chooseFightUnit') {
      const fight = s.phaseState.fight as FightState
      fight.currentUnitId = action.unitId
      fight.subStep = 'pileIn'
      writeMark(s, ACTS + action.unitId, String(activationsOf(s, action.unitId) + 1)) // F12: fresh progress keys per activation
      ctx.emit({ type: 'FightUnitSelected', unitId: action.unitId, step: fight.step })
      return
    }
    if (pending.kind === 'pileIn' && action.type === 'pileIn') return applyPileIn(ctx, action.unitId, action, pending)
    if (pending.kind === 'declareTargets' && action.type === 'declareTargets') return applyDeclareTargets(ctx, action)
    return notImplementedHandle('fight')(ctx, action, pending)
  },
}

// ---------- stubs kept for importers outside this package (WP8 removes them) ----------
export function deferredPileInStep(_ctx: EngineContext, _key: string, _unitId: UnitId, _modelIds: string[]): 'pending' | 'done' { return 'done' }
export function deferredWeapons(_ctx: EngineContext, _unitId: UnitId, _models: Model[]): DeclareTargetsDecision['context']['weapons'] | 'pending' { return [] }
export function deferredFightStep(_ctx: EngineContext, _entry: { unitId: UnitId; modelIds: UnitId[] }): 'pending' | 'done' { return 'done' }

