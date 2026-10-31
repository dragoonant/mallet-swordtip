// Charge phase module (Spearhead port, WP4: CORE-9.1 to 9.5, 13-engine-port-plan §1.2). Steps: 'roll' -> 'move',
// then 'abilities' (both players' Charge Phase abilities, active player first).
//
// Sequence per charger: chooseUnitToActivate (that is the declaration: no targets are declared, CORE-9.4, so ChargeDeclared carries
// targetUnitIds [] and no declareCharge decision is raised: the reducer envelope rejects an empty target list) -> 2D6 charge roll via rollOnce (raw dice in UnitTurnState.chargeRollUnmodified, modified total in chargeRoll) -> chargeMove
// (placements, or pass = stay). The move may pass through enemy combat ranges (not through models unless FLY); it must end with
// the unit coherent and some model within CHARGE_END (½") of a VISIBLE enemy model (CORE-9.2), or within ½" of a terrain
// feature that an enemy unit is wholly on while ending in combat with that unit (CORE-9.5). Otherwise the charge fails: the
// unit stays put, `chargedThisTurn` stays false, but its Core ability slot is spent (CORE-9.3). A roll too short to reach any
// enemy fails at once (the "stay" is automatic, no decision is raised).
// Charging grants no Strike-first (CORE-10.9). Overwatch, Heroic Intervention and Tank Shock are gone.
import { rollSum } from '../dice'
import { applyAbilityRerolls } from '../rerolls'
import {
  CHARGE_END, ENGAGEMENT_H, EPS, baseEdgePoints, basesOverlap, checkPlacements, distance, emptyMoveConstraints, horizontalGap, pathCrossesModels,
  pointInPolygon, pointToPolygonEdge, whollyOnBoard, whollyWithinPolygon, withinEngagementRange, samplePath,
  type Footprint, type ResolvedPlacement,
} from '../geometry'
import { hookService } from '../hooks-impl'
import { cardChargeDice } from '../cardFlags'
import { commandWindow } from '../cards'
import { leaderService } from '../leaders'
import { losService } from '../los'
import { settleY, terrainService } from '../terrain'
import { notImplementedHandle, type AdvanceResult, type EngineContext, type PhaseModule } from '../modules'
import { boardUnitsOf, datasheetOf, enemyModelsOnBoard, hasKeyword, setModelPos, unitModels, unitModelsForCoherency } from '../state'
import { optionActions, translatePlacements } from './legal'
import { reformChargeCandidates } from './reform'
import { pathBlockingEnemies, recordPassedAcross, unitsPassedAcrossPaths } from '../factions/aos-moves'
import type { Action, ModelPlacement } from '../actions'
import {
  EngineInvariantError,
  type ChargeState, type DiceRoll, type GameState, type Model, type PendingDecision, type PlayerId, type Rejection, type UnitId, type Vec3,
} from '../types'

// the charge-end gap tolerance: positions are rounded to 1/1000" when a move is resolved
const END_TOL = 1e-3

// same identity check the reducer's generic option-membership validation performs; duplicated because supplying a custom
// `validate` opts this module out of that default for every decision kind it handles
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

// ---------- eligibility (CORE-9.1) ----------

// F12 (SCE-AB-5 Heralds of Righteousness): how many dice the unit rolls to charge: 2 (1 while ensnared by Grasping Vines) plus
// Effect.extraChargeDice (hookService.chargeDiceBonus); all dice are summed. Exported for the AI's charge odds and the client.
export function chargeDiceCount(state: GameState, unitId: UnitId): number {
  return Math.max(1, cardChargeDice(state, unitId) + hookService.chargeDiceBonus(state, unitId))
}

// can the unit's nearest model reach ½" of some enemy model with the best roll its charge dice can make (6 per die)?
// F14 (BOK C3): with a chargeMustEndInCombatWith constraint, the reach is measured as neededChargeDistance does
function enemyWithinReach(state: GameState, unitId: UnitId): boolean {
  const needed = neededChargeDistance(state, unitId)
  return needed !== null && needed <= 6 * chargeDiceCount(state, unitId) + EPS
}

// F14 (BOK C3 Killing Pounce): the units this charge must end in combat with (hookService.chargeMustEndInCombatWithFor; [] = none)
export function chargeMustEndInCombatWith(state: GameState, unitId: UnitId): UnitId[] {
  return hookService.chargeMustEndInCombatWithFor(state, unitId)
}

export function canDeclareCharge(state: GameState, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u || u.location !== 'board') return false
  if (losService.unitInCombat(state, unitId)) return false
  if (leaderService.halves(state, unitId).some((id) => hookService.chargeForbidden(state, id))) return false
  // Run / Retreat block the Charge unless an ability says otherwise
  if ((u.turn.moveType === 'advance' || u.turn.moveType === 'fallBack') && !(hookService.eligibilityFor?.(state, unitId, 'charge') ?? false)) return false
  return enemyWithinReach(state, unitId)
}

function eligibleChargers(state: GameState, player: PlayerId): UnitId[] {
  const activated = new Set(state.phaseState.activated)
  const out: UnitId[] = []
  for (const u of boardUnitsOf(state, player)) {
    if (u.bodyguardUnitId || activated.has(u.id)) continue
    if (canDeclareCharge(state, u.id)) out.push(u.id)
  }
  return out
}

// ---------- geometry ----------
// pathEnemies (F12, SBG-AB-2): the enemy models that block the charge PATH (passAcrossKeyword units dropped); `enemies` still
// decides end overlap and the charge end
interface ChargeGeometry { models: Model[]; enemies: Model[]; otherFriendly: Model[]; fly: boolean; pathEnemies: Model[] }

function chargeGeometry(state: GameState, unitId: UnitId): ChargeGeometry {
  const models = unitModelsForCoherency(state, unitId)
  const player = state.units[unitId].player
  const mine = new Set(leaderService.halves(state, unitId))
  const otherFriendly: Model[] = []
  for (const u of boardUnitsOf(state, player)) if (!mine.has(u.id)) otherFriendly.push(...unitModels(state, u.id))
  const enemies = enemyModelsOnBoard(state, player)
  return { models, enemies, otherFriendly, fly: models.length > 0 && models.every((m) => hasKeyword(state, m.unitId, 'FLY')), pathEnemies: pathBlockingEnemies(state, unitId, enemies) }
}

/** How far the charging unit's closest model has to travel to get within ½" of the closest enemy model — the number a 2D6
 *  charge roll has to make (CORE-9.2). `targetUnitIds` is ignored in Spearhead (no targets are declared; kept for callers
 *  that still pass one: when it names units only those are measured). Exported so the client can show the number before the
 *  dice are rolled; the charge roll itself calls the same function. */
export function neededChargeDistance(state: GameState, unitId: UnitId, targetUnitIds: UnitId[] = []): number | null {
  const mine = unitModelsForCoherency(state, unitId)
  const player = state.units[unitId]?.player
  if (!player) return null
  const only = new Set(targetUnitIds)
  const enemies = enemyModelsOnBoard(state, player).filter((e) => only.size === 0 || only.has(e.unitId))
  if (mine.length === 0 || enemies.length === 0) return null
  let best = Infinity
  for (const m of mine) for (const e of enemies) best = Math.min(best, horizontalGap(m, e) - CHARGE_END)
  // F14 (BOK C3): the charge must also end in combat (3") with each named unit: the roll has to cover that too (a lower bound:
  // the ½" end may be to another enemy model). A named unit with no models left makes the charge impossible.
  if (targetUnitIds.length === 0) {
    for (const uid of chargeMustEndInCombatWith(state, unitId)) {
      const ms = unitModels(state, uid)
      if (ms.length === 0) return null
      let gap = Infinity
      for (const m of mine) for (const e of ms) gap = Math.min(gap, horizontalGap(m, e) - ENGAGEMENT_H)
      best = Math.max(best, gap)
    }
  }
  return Math.max(0, best)
}

// ---------- end-position legality (CORE-9.2, CORE-9.5) ----------

function baseGapToPolygon(fp: Footprint, poly: { x: number; z: number }[]): number {
  if (pointInPolygon(fp.pos, poly)) return 0
  let best = pointToPolygonEdge(fp.pos, poly) - Math.max(fp.base.radius, fp.base.radius2 ?? 0)
  for (const e of baseEdgePoints(fp, 16)) best = Math.min(best, pointInPolygon(e, poly) ? 0 : pointToPolygonEdge(e, poly))
  return Math.max(0, best)
}

// some final model within ½" of a visible enemy model, or (CORE-9.5) within ½" of a feature an enemy unit is wholly on while
// the unit ends in combat with that enemy unit
function chargeEndsLegally(state: GameState, geo: ChargeGeometry, finals: Model[]): boolean {
  for (const f of finals) {
    for (const e of geo.enemies) {
      if (distance(f, e) <= CHARGE_END + END_TOL && losService.visibleFrom(state, f, e.id)) return true
    }
  }
  const enemyUnits = [...new Set(geo.enemies.map((e) => e.unitId))]
  for (const p of Object.values(state.board.pieces)) {
    const onIt = enemyUnits.filter((uid) => {
      const ms = geo.enemies.filter((e) => e.unitId === uid)
      return ms.length > 0 && ms.every((m) => whollyWithinPolygon(m, p.footprint))
    })
    if (onIt.length === 0) continue
    for (const f of finals) {
      if (baseGapToPolygon(f, p.footprint) > CHARGE_END + END_TOL) continue
      for (const uid of onIt) {
        const ms = geo.enemies.filter((e) => e.unitId === uid)
        if (ms.some((e) => withinEngagementRange(f, e)) && ms.some((e) => losService.visibleFrom(state, f, e.id))) return true
      }
    }
  }
  return false
}

export function chargeMoveRejection(state: GameState, unitId: UnitId, roll: number, placements: ModelPlacement[]): Rejection | null {
  const geo = chargeGeometry(state, unitId)
  // F8 (LRL-RA-2 Roaring Headwind): a code hook may make every charging model end closer to one battlefield edge
  // F14 (BOK C3 Killing Pounce): the charge may have to end in combat with named units (MoveConstraints.mustEndInEngagementWith)
  const must = chargeMustEndInCombatWith(state, unitId)
  const constraints = emptyMoveConstraints(roll, { mustEndOutsideEngagement: false, coherency: true, mustEndCloserToEdge: hookService.moveEdgeConstraintFor(state, unitId), mustEndInEngagementWith: must })
  const result = checkPlacements({
    unitModels: geo.models, placements, constraints, otherFriendly: geo.otherFriendly, enemies: geo.enemies, board: state.board,
    fly: geo.fly, coherencyRange: datasheetOf(state, unitId).coherencyRange,
    ...(must.length > 0 ? { engagementTargets: Object.fromEntries(must.map((id) => [id, unitModels(state, id)])) } : {}),
  })
  if (result.rejection) return result.rejection
  const finals: Model[] = []
  for (const r of result.resolved) {
    finals.push({ ...r.model, pos: r.to, facing: r.facing })
    if (r.distance <= EPS) continue
    const fp: Footprint = { pos: r.to, facing: r.facing, base: r.model.base }
    for (const p of samplePath(r.path)) {
      if (!whollyOnBoard({ pos: p, facing: r.facing, base: r.model.base }, state.board)) {
        return { code: 'E_OUT_OF_RANGE', reason: `${r.model.id}'s path would cross the board edge`, details: { modelId: r.model.id } }
      }
    }
    if (terrainService.crossesImpassable(state, r.model, r.path)) return { code: 'E_OVERLAP', reason: `${r.model.id}'s path crosses impassable terrain`, details: { modelId: r.model.id } }
    const end = terrainService.canEndAt(state, r.model, r.to)
    if (!end.ok) return { code: 'E_OVERLAP', reason: end.reason ?? `${r.model.id} cannot end there`, details: { modelId: r.model.id } }
    const extra = terrainService.extraMoveCost(state, r.model, r.path)
    if (extra > 0 && r.distance + extra > roll + 1e-3) return { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} would need ${(r.distance + extra).toFixed(2)}" including climbs > ${roll}"`, details: { modelId: r.model.id } }
    // CORE-6.5: no passing through other models (FLY ignores them); passing through enemy combat ranges is fine (CORE-9.2)
    if (!geo.fly && pathCrossesModels(fp, r.path, [...geo.pathEnemies, ...geo.otherFriendly])) return { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross another model`, details: { modelId: r.model.id } }
  }
  if (!chargeEndsLegally(state, geo, finals)) return { code: 'E_ENGAGEMENT', reason: 'the charge must end with a model within ½" of a visible enemy model', details: {} }
  return null
}

// ---------- candidate charge moves (generic Deciders / AI / legal actions) ----------

// the point at horizontal gap `gap` from enemy model `e`, in direction `angle` from its centre, for model `m`'s base
function ringPoint(e: Model, m: Model, angle: number, gap: number): Vec3 {
  const ux = Math.cos(angle), uz = Math.sin(angle)
  const at = (t: number): Vec3 => ({ x: e.pos.x + ux * t, y: m.pos.y, z: e.pos.z + uz * t })
  const gapAt = (t: number): number => horizontalGap({ pos: at(t), facing: m.facing, base: m.base }, e)
  let hi = e.base.radius + m.base.radius + Math.max(gap, 0) + 2
  for (let guard = 0; gapAt(hi) <= gap && guard < 20; guard++) hi *= 1.5
  let lo = 0
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (gapAt(mid) <= gap) lo = mid; else hi = mid
  }
  return at(hi)
}

// candidate charge moves (F8 rework). A roll that reaches should be a charge that lands, also for a line of wide oval bases:
//  1. rigid slides of the whole unit that bring its nearest model to just inside ½" of one of the nearest enemy models along
//     the shortest approach (approachPoint), cheap and shape-keeping;
//  2. a per-model fit (fitChargeAround): a lead model's end spot is picked from its shortest approaches and from rings all the
//     way round the nearest enemy models (24 angles, three facings for an oval: as it stands, long axis toward the enemy,
//     side-on), cheapest reachable first; every other model then takes its own spot (rings round the models already placed and
//     the enemy models nearby, also rotated) with its own path: straight, a one-bend detour, else the shortest way round on a
//     ½" grid (pathField) pulled tight. The first `limit` that pass the full validation (chargeMoveRejection) are returned;
//     caps on validations and fits keep a hopeless case cheap.
// Tolerances: the validator allows 1/1000" on distances and on the ½" end gap, and positions are rounded to 1/1000", so an
// exact approach aims at a 0.4996" gap with at most roll + 0.0002" of travel.
const TRAVEL_SLACK = 0.0002
const EXACT_GAP = 0.4996
export function legalChargeMoves(state: GameState, unitId: UnitId, roll: number, limit = 1): ModelPlacement[][] {
  const geo = chargeGeometry(state, unitId)
  if (geo.models.length === 0 || geo.enemies.length === 0) return []
  const out: ModelPlacement[][] = []
  const tried = new Set<string>()
  const coherency = datasheetOf(state, unitId).coherencyRange ?? 0.5
  const blockers: Footprint[] = [...geo.enemies, ...geo.otherFriendly]
  const pathBlockers: Footprint[] = [...geo.pathEnemies, ...geo.otherFriendly]
  const fields = new Map<string, PathField | null>()
  const env: FitEnv = { state, geo, roll, blockers, pathBlockers, fields, coherency }
  let checks = 0
  const MAX_CHECKS = 60
  const offer = (placements: ModelPlacement[] | null): boolean => {
    if (!placements || checks >= MAX_CHECKS) return false
    const key = JSON.stringify(placements)
    if (tried.has(key)) return false
    tried.add(key)
    checks++
    if (chargeMoveRejection(state, unitId, roll, placements) !== null) return false
    out.push(placements)
    return out.length >= limit
  }
  // F14 (BOK C3): with a must-end-in-combat-with constraint the candidates aim at those units' models
  const must = new Set(chargeMustEndInCombatWith(state, unitId))
  const nearestEnemies = [...geo.enemies]
    .filter((e) => must.size === 0 || must.has(e.unitId))
    .map((e) => ({ e, gap: Math.min(...geo.models.map((m) => horizontalGap(m, e))) }))
    .filter((x) => x.gap - CHARGE_END <= roll + EPS)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 6)
  const settled = (pl: ModelPlacement): ModelPlacement => {
    const model = geo.models.find((x) => x.id === pl.modelId) as Model
    return { ...pl, pos: { ...pl.pos, y: settleY(state, model, pl.pos.x, pl.pos.z, model.pos.y) } }
  }
  const freeSpot = (m: Model, pos: Vec3, facing: number): boolean => {
    const fp: Footprint = { pos, facing, base: m.base }
    return whollyOnBoard(fp, state.board) && !blockers.some((b) => basesOverlap(fp, b)) && terrainService.canEndAt(state, { ...m, facing }, pos).ok
  }
  // 1. rigid slides along the shortest approach
  for (const { e } of nearestEnemies.slice(0, 3)) {
    const leads = [...geo.models].sort((a, b) => horizontalGap(a, e) - horizontalGap(b, e)).slice(0, 2)
    for (const m of leads) {
      for (const gap of [0.45, EXACT_GAP]) {
        const ap = approachPoint(m, m.facing, e, gap)
        if (!ap || ap.travel > roll + TRAVEL_SLACK) continue
        const dx = ap.to.x - m.pos.x, dz = ap.to.z - m.pos.z
        const rigid = translatePlacements(geo.models, dx, dz).map(settled)
        if (rigid.every((pl) => { const mm = geo.models.find((x) => x.id === pl.modelId) as Model; return freeSpot(mm, pl.pos, mm.facing) }) && offer(rigid)) return out
      }
    }
  }
  // 2. per-model fits around lead spots, cheapest lead travel first
  interface LeadSpot { m: Model; to: Vec3; facing: number; travel: number }
  const spots: LeadSpot[] = []
  for (const { e } of nearestEnemies) {
    const leads = [...geo.models].sort((a, b) => horizontalGap(a, e) - horizontalGap(b, e)).slice(0, 3)
    for (const m of leads) {
      const toward = Math.atan2(e.pos.z - m.pos.z, e.pos.x - m.pos.x)
      const facings = oval(m) ? [m.facing, toward, toward + Math.PI / 2] : [m.facing]
      for (const facing of facings) {
        const mf: Model = { ...m, facing }
        for (const gap of [0.45, EXACT_GAP]) {
          const ap = approachPoint(m, facing, e, gap)
          if (ap && ap.travel <= roll + TRAVEL_SLACK && freeSpot(m, ap.to, facing)) spots.push({ m, to: ap.to, facing, travel: ap.travel })
        }
        for (let i = 0; i < 24; i++) {
          const p = ringPoint(e, mf, (i / 24) * Math.PI * 2, 0.4)
          const travel = Math.hypot(p.x - m.pos.x, p.z - m.pos.z)
          if (travel > roll + TRAVEL_SLACK || !freeSpot(m, p, facing)) continue
          spots.push({ m, to: { x: p.x, y: m.pos.y, z: p.z }, facing, travel })
        }
      }
    }
  }
  spots.sort((a, b) => a.travel - b.travel)
  let fits = 0
  for (const sp of spots) {
    if (checks >= MAX_CHECKS || fits >= 60) break
    fits++
    if (offer(fitChargeAround(env, sp.m, sp.to, sp.facing))) return out
  }
  // 3. (F10) nothing landed: re-form the whole unit facing one of the nearest enemy models, its front just inside ½" (phases/reform.ts),
  // so a line of big ovals hemmed in by terrain or friends still gets a charge the human can take, not only the AI
  if (out.length === 0) {
    const reachable = nearestEnemies.map((x) => x.e)
    out.push(...reformChargeCandidates(state, unitId, geo.models, reachable, roll,
      (p) => chargeMoveRejection(state, unitId, roll, p.map(settled)) === null, limit, coherency).map((p) => p.map(settled)))
  }
  return out
}

const oval = (m: Model): boolean => m.base.radius2 !== undefined && Math.abs(m.base.radius2 - m.base.radius) > 0.05

// the shortest straight move of `m` (facing `facing`) that brings it to `gap` of enemy model `e`: directions within ±0.6 rad of
// the centre line are searched (a convex base's gap along a line is convex, so a bisection finds the first point at `gap`)
function approachPoint(m: Model, facing: number, e: Model, gap: number): { to: Vec3; travel: number } | null {
  const base = Math.atan2(e.pos.z - m.pos.z, e.pos.x - m.pos.x)
  const d = Math.hypot(e.pos.x - m.pos.x, e.pos.z - m.pos.z)
  const travelAt = (a: number): number | null => {
    const ux = Math.cos(a), uz = Math.sin(a)
    const g = (t: number): number => horizontalGap({ pos: { x: m.pos.x + ux * t, y: m.pos.y, z: m.pos.z + uz * t }, facing, base: m.base }, e)
    if (g(0) <= gap) return 0
    if (g(d) > gap) return null
    let lo = 0, hi = d
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (g(mid) <= gap) hi = mid; else lo = mid }
    return hi
  }
  let best: { a: number; t: number } | null = null
  const tryA = (a: number): void => { const t = travelAt(a); if (t !== null && (!best || t < best.t)) best = { a, t } }
  for (const da of [0, 0.15, -0.15, 0.3, -0.3, 0.6, -0.6]) tryA(base + da)
  if (!best) return null
  // refine around the best direction
  for (const step of [0.08, 0.04, 0.02, 0.01]) {
    const b0: { a: number; t: number } = best
    tryA(b0.a + step); tryA(b0.a - step)
  }
  const b: { a: number; t: number } = best
  return { to: { x: m.pos.x + Math.cos(b.a) * b.t, y: m.pos.y, z: m.pos.z + Math.sin(b.a) * b.t }, travel: b.t }
}

// ---------- shortest ways round (½" grid Dijkstra per model and facing, cached per legalChargeMoves call) ----------
// blockers: models no base may end on; pathBlockers (F12): models no path may cross (passAcrossKeyword units dropped)
interface FitEnv { state: GameState; geo: ChargeGeometry; roll: number; blockers: Footprint[]; pathBlockers: Footprint[]; fields: Map<string, PathField | null>; coherency: number }
interface PathField { x0: number; z0: number; h: number; nx: number; nz: number; dist: Float64Array; prev: Int32Array }
const FIELD_H = 0.5

function buildField(env: FitEnv, m: Model, facing: number): PathField | null {
  const { state, roll, pathBlockers: blockers } = env
  const h = FIELD_H
  const hw = state.board.w / 2, hh = state.board.h / 2
  const x0 = Math.max(-hw, m.pos.x - roll), x1 = Math.min(hw, m.pos.x + roll)
  const z0 = Math.max(-hh, m.pos.z - roll), z1 = Math.min(hh, m.pos.z + roll)
  const nx = Math.max(1, Math.floor((x1 - x0) / h) + 1), nz = Math.max(1, Math.floor((z1 - z0) / h) + 1)
  const n = nx * nz
  const free = new Uint8Array(n)
  const near = blockers.filter((b) => Math.hypot(b.pos.x - m.pos.x, b.pos.z - m.pos.z) <= roll + 6)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const pos: Vec3 = { x: x0 + i * h, y: m.pos.y, z: z0 + j * h }
    const fp: Footprint = { pos, facing, base: m.base }
    // a cell is free when the base fits there and stands clear of walls and solid blocks (the grid never climbs: a path over a
    // wall would pay the climb, CORE-6.7, so it is left to the straight / one-bend tries)
    free[j * nx + i] = whollyOnBoard(fp, state.board) && !near.some((b) => basesOverlap(fp, b)) && terrainService.canEndAt(state, { ...m, facing }, pos).ok ? 1 : 0
  }
  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  // seeds: the free cells round the model it can step to in a clear straight line (exact check), so the first leg is legal
  const si = Math.round((m.pos.x - x0) / h), sj = Math.round((m.pos.z - z0) / h)
  const seeds: number[] = []
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const i = si + di, j = sj + dj
    if (i < 0 || j < 0 || i >= nx || j >= nz || !free[j * nx + i]) continue
    const c: Vec3 = { x: x0 + i * h, y: m.pos.y, z: z0 + j * h }
    if (pathCrossesModels({ pos: c, facing, base: m.base }, [m.pos, c], near)) continue
    dist[j * nx + i] = Math.hypot(c.x - m.pos.x, c.z - m.pos.z)
    seeds.push(j * nx + i)
  }
  if (seeds.length === 0) return null
  // simple Dijkstra with a binary heap
  const heap: number[] = []
  const less = (a: number, b: number): boolean => dist[a] < dist[b]
  const push = (v: number): void => { heap.push(v); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (!less(heap[c], heap[p])) break; [heap[c], heap[p]] = [heap[p], heap[c]]; c = p } }
  const pop = (): number => { const top = heap[0]; const last = heap.pop() as number; if (heap.length > 0) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let mi = c; if (l < heap.length && less(heap[l], heap[mi])) mi = l; if (r < heap.length && less(heap[r], heap[mi])) mi = r; if (mi === c) break; [heap[c], heap[mi]] = [heap[mi], heap[c]]; c = mi } } return top }
  for (const v of seeds) push(v)
  const done = new Uint8Array(n)
  const steps: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]
  while (heap.length > 0) {
    const v = pop()
    if (done[v]) continue
    done[v] = 1
    if (dist[v] > roll) continue
    const vi = v % nx, vj = (v - vi) / nx
    for (const [di, dj, c] of steps) {
      const i = vi + di, j = vj + dj
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue
      const w = j * nx + i
      if (!free[w] || done[w]) continue
      if (di !== 0 && dj !== 0 && (!free[vj * nx + i] || !free[j * nx + vi])) continue // no corner cutting
      const nd = dist[v] + c * h
      if (nd < dist[w]) { dist[w] = nd; prev[w] = v; push(w) }
    }
  }
  return { x0, z0, h, nx, nz, dist, prev }
}

function fieldFor(env: FitEnv, m: Model, facing: number): PathField | null {
  const key = `${m.id}|${facing.toFixed(3)}`
  if (!env.fields.has(key)) env.fields.set(key, buildField(env, m, facing))
  return env.fields.get(key) ?? null
}

// a model's way to `to`: the straight line, a one-bend detour, else the grid's shortest way round pulled tight; null when nothing
// fits the roll
function chargePath(env: FitEnv, m: Model, to: Vec3, facing = m.facing): Vec3[] | null {
  const { state, geo, roll, pathBlockers: blockers } = env
  const fp: Footprint = { pos: to, facing, base: m.base }
  const lenOf = (path: Vec3[]): number => { let len = 0; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z); return len }
  const clear = (path: Vec3[]): boolean => {
    if (!geo.fly && pathCrossesModels(fp, path, blockers)) return false
    for (let i = 1; i < path.length - 1; i++) if (!whollyOnBoard({ pos: path[i], facing, base: m.base }, state.board)) return false
    return !terrainService.crossesImpassable(state, m, path)
  }
  // CORE-6.7: climbing over terrain taller than 1" costs the climb on top of the path length
  const ok = (path: Vec3[]): boolean => lenOf(path) <= roll + TRAVEL_SLACK && clear(path) && lenOf(path) + terrainService.extraMoveCost(state, m, path) <= roll + TRAVEL_SLACK
  const straight = [m.pos, to]
  if (ok(straight)) return straight
  const dx = to.x - m.pos.x, dz = to.z - m.pos.z
  const len = Math.hypot(dx, dz)
  if (len < 0.05 || roll - len <= 0.05) return null
  const px = -dz / len, pz = dx / len
  for (const along of [0.5, 0.3, 0.7]) {
    for (const side of [1, -1, 2, -2]) {
      if (Math.abs(side) > roll - len + 1) continue
      const w: Vec3 = { x: m.pos.x + dx * along + px * side, y: m.pos.y, z: m.pos.z + dz * along + pz * side }
      const path = [m.pos, w, to]
      if (ok(path)) return path
    }
  }
  if (geo.fly) return null
  // the grid: shortest way round to the free cell nearest `to`, then string-pulled
  const f = fieldFor(env, m, facing)
  if (!f) return null
  const ti = Math.round((to.x - f.x0) / f.h), tj = Math.round((to.z - f.z0) / f.h)
  let bestCell = -1, bestCost = Infinity
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = ti + di, j = tj + dj
    if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) continue
    const c = j * f.nx + i
    if (!Number.isFinite(f.dist[c])) continue
    const cost = f.dist[c] + Math.hypot(f.x0 + i * f.h - to.x, f.z0 + j * f.h - to.z)
    if (cost < bestCost) { bestCost = cost; bestCell = c }
  }
  if (bestCell < 0 || bestCost > roll * 1.08 + 0.5) return null
  const cells: Vec3[] = []
  for (let c = bestCell; c >= 0; c = f.prev[c]) { const i = c % f.nx, j = (c - i) / f.nx; cells.push({ x: f.x0 + i * f.h, y: m.pos.y, z: f.z0 + j * f.h }) }
  cells.reverse()
  const pts = [m.pos, ...cells, to]
  // string pulling: from each kept point jump to the farthest point still reachable in a clear straight line
  const pulled: Vec3[] = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    let j = pts.length - 1
    while (j > i + 1 && !clear([pts[i], pts[j]])) j--
    pulled.push(pts[j])
    i = j
  }
  return ok(pulled) ? pulled : null
}

// per-model charge fit (CORE-6.6: each model moves its own path, the unit ends coherent). The lead model goes to `leadTo` facing
// `leadFacing`; the others, nearest first, take the first spot that is within the roll, overlaps nothing, has a path (chargePath)
// and sits within coherency of a model already placed. Spots tried: the lead's slide (scaled down), then slots touching an
// already placed model or an enemy model nearby (closest to the enemy first), each with the model's own facing, the lead's
// facing and (ovals) the facing toward the enemy. Null when some model has no spot.
function fitChargeAround(env: FitEnv, lead: Model, leadTo: Vec3, leadFacing: number): ModelPlacement[] | null {
  const { state, geo, roll, blockers, coherency } = env
  const fits = (m: Model, c: Vec3, facing: number, placed: Model[]): ModelPlacement | null => {
    if (Math.hypot(c.x - m.pos.x, c.z - m.pos.z) > roll + TRAVEL_SLACK) return null
    const fp: Footprint = { pos: c, facing, base: m.base }
    if (!whollyOnBoard(fp, state.board)) return null
    if (blockers.some((b) => basesOverlap(fp, b)) || placed.some((q) => basesOverlap(fp, q))) return null
    if (placed.length > 0 && !placed.some((q) => horizontalGap(fp, q) <= coherency - 0.02)) return null
    const to: Vec3 = { x: c.x, y: settleY(state, m, c.x, c.z, m.pos.y), z: c.z }
    if (!terrainService.canEndAt(state, { ...m, facing }, to).ok) return null
    const path = chargePath(env, m, to, facing)
    return path ? { modelId: m.id, pos: to, facing, path } : null
  }
  const first = fits(lead, leadTo, leadFacing, [])
  if (!first) return null
  const placed: Model[] = [{ ...lead, pos: first.pos, facing: leadFacing }]
  const out: ModelPlacement[] = [first]
  if (geo.models.length === 1) return out
  const dx = leadTo.x - lead.pos.x, dz = leadTo.z - lead.pos.z
  const enemyGap = (f: Footprint): number => { let g = Infinity; for (const e of geo.enemies) g = Math.min(g, horizontalGap(f, e)); return g }
  const others = geo.models.filter((x) => x.id !== lead.id).sort((a, b) => horizontalGap(a, lead) - horizontalGap(b, lead))
  const near = geo.enemies.filter((e) => horizontalGap({ pos: leadTo, facing: leadFacing, base: lead.base }, e) <= 6)
  for (const m of others) {
    const facings = [...new Set([m.facing, leadFacing])]
    if (oval(m) && near.length > 0) facings.push(Math.atan2(near[0].pos.z - m.pos.z, near[0].pos.x - m.pos.x))
    const cands: { pos: Vec3; facing: number }[] = []
    for (const t of [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0]) cands.push({ pos: { x: m.pos.x + dx * t, y: m.pos.y, z: m.pos.z + dz * t }, facing: m.facing })
    const slots: { pos: Vec3; facing: number; gap: number }[] = []
    for (const facing of facings) {
      const mf: Model = { ...m, facing }
      const ring = (anchor: Model, gap: number, n: number): void => {
        for (let i = 0; i < n; i++) {
          const pos = ringPoint(anchor, mf, (i / n) * Math.PI * 2, gap)
          if (Math.hypot(pos.x - m.pos.x, pos.z - m.pos.z) > roll + TRAVEL_SLACK) continue
          const sfp: Footprint = { pos, facing, base: m.base }
          if (!whollyOnBoard(sfp, state.board) || blockers.some((b) => basesOverlap(sfp, b)) || placed.some((q) => basesOverlap(sfp, q))) continue
          slots.push({ pos, facing, gap: enemyGap(sfp) })
        }
      }
      for (const q of placed) { ring(q, Math.min(0.3, coherency * 0.6), 24); ring(q, Math.min(0.05, coherency * 0.1), 24) }
      for (const e of near) ring(e, 0.3, 16)
    }
    slots.sort((a, b) => a.gap - b.gap)
    cands.push(...slots.slice(0, 48))
    let got: ModelPlacement | null = null
    for (const c of cands) if ((got = fits(m, c.pos, c.facing, placed))) break
    if (!got) return null
    placed.push({ ...m, pos: got.pos, facing: got.facing ?? m.facing })
    out.push(got)
  }
  return out
}

// ---------- the charge roll (CORE-9.1) ----------

// modifyRoll effects on the Charge roll adjust the 2D6 total, never the dice themselves
export function chargeRollModifier(ctx: EngineContext, charge: ChargeState, roll: DiceRoll): number {
  const results = ctx.services.hooks.collect(ctx, 'onChargeRoll', {
    chargingUnitId: charge.unitId, targetUnitIds: charge.targetUnitIds,
    roll: { purpose: 'charge', roll, dieIndex: 0, unmodified: rollSum(roll), rerolled: (roll.rerolled ?? []).length > 0 },
  })
  let total = 0
  for (const r of results) if (r.result.kind === 'roll' && typeof r.result.modifier === 'number') total += r.result.modifier
  return total
}

// 40k leftover (dark-angels.ts): who charged into a unit this turn. No target log is kept any more.
export function chargersIntoThisTurn(_state: GameState, _unitId: UnitId): UnitId[] { return [] }

function doSelect(ctx: EngineContext): 'pending' | 'done' {
  const s = ctx.state
  if (ctx.marked('ch:donePhase')) return 'done'
  const active = s.activePlayer
  const eligible = eligibleChargers(s, active)
  if (eligible.length === 0) return 'done'
  ctx.decide({
    kind: 'chooseUnitToActivate', player: active, window: 'charge.start', canPass: true,
    context: { phase: 'charge', eligible },
    options: eligible.map((id) => ({ id, label: id, action: { type: 'chooseUnitToActivate', player: active, decisionId: '', unitId: id } })),
  })
  return 'pending'
}

function failCharge(ctx: EngineContext, unitId: UnitId): void {
  ctx.emit({ type: 'ChargeFailed', unitId })
  ctx.state.phaseState.charge = null
}

// drives one selected charge through declare -> roll -> move. Returns 'pending' while a decision is open, 'progress' once the
// charge is over (phaseState.charge cleared).
function driveCharge(ctx: EngineContext): 'pending' | 'progress' {
  const s = ctx.state
  const charge = s.phaseState.charge as ChargeState
  const unitId = charge.unitId
  const unit = s.units[unitId]
  if (!unit || unit.location !== 'board') { s.phaseState.charge = null; return 'progress' }

  s.step = 'roll'
  if (charge.roll === null) {
    // Grasping Vines (cards): an ensnared unit rolls one fewer dice
    // F12 (SCE-AB-5): Effect.extraChargeDice adds dice, all summed
    let roll = ctx.rollOnce(`charge:${unitId}`, { purpose: 'charge', player: unit.player, sides: 6, count: chargeDiceCount(s, unitId), mode: 'sum', unitId })
    if (roll === null) return 'pending'
    // ability re-rolls of a charge roll that falls short (STD-ENH-3 Champion of Raids; rerolls.ts)
    const short = neededChargeDistance(s, unitId)
    if (short !== null) roll = applyAbilityRerolls(ctx, 'onChargeRoll', { chargingUnitId: unitId, targetUnitIds: charge.targetUnitIds }, roll, Math.ceil(short - chargeRollModifier(ctx, charge, roll) - EPS))
    const raw = rollSum(roll)
    const total = Math.max(0, raw + chargeRollModifier(ctx, charge, roll))
    charge.roll = [roll.dice[0] ?? 0, roll.dice[1] ?? 0]
    charge.distance = total
    for (const id of leaderService.halves(s, unitId)) {
      const u = s.units[id]
      if (!u) continue
      u.turn.chargeRoll = total
      u.turn.chargeRollUnmodified = raw
      u.turn.usedCoreThisPhase = true // CORE-3.4: the Core slot is spent even when the charge fails (CORE-9.3)
    }
    ctx.emit({ type: 'ChargeRolled', unitId, dice: charge.roll as [number, number], total, needed: neededChargeDistance(s, unitId), ...(roll.dice.length > 2 ? { allDice: [...roll.dice] } : {}) })
  }

  // a roll too short to reach any enemy fails at once; the unit stays put (CORE-9.3)
  const needed = neededChargeDistance(s, unitId)
  if (needed === null || needed > (charge.distance ?? 0) + EPS) { failCharge(ctx, unitId); return 'progress' }

  s.step = 'move'
  ctx.decide({
    kind: 'chargeMove', player: unit.player, window: 'charge.moveEnded', canPass: true,
    context: { unitId, targetUnitIds: [], roll: charge.distance ?? 0 },
    constraints: emptyMoveConstraints(charge.distance ?? 0, { mustEndOutsideEngagement: false, coherency: true, mustEndCloserToEdge: hookService.moveEdgeConstraintFor(s, unitId), mustEndInEngagementWith: chargeMustEndInCombatWith(s, unitId) }),
  })
  return 'pending'
}

function applyChargeMove(ctx: EngineContext, charge: ChargeState, action: Extract<Action, { type: 'chargeMove' }>): Rejection | void {
  const s = ctx.state
  const rej = chargeMoveRejection(s, charge.unitId, charge.distance ?? 0, action.placements)
  if (rej) return rej
  const geo = chargeGeometry(s, charge.unitId)
  const result = checkPlacements({
    unitModels: geo.models, placements: action.placements, constraints: emptyMoveConstraints(charge.distance ?? 0, { coherency: true }),
    otherFriendly: geo.otherFriendly, enemies: geo.enemies, board: s.board, fly: geo.fly, coherencyRange: datasheetOf(s, charge.unitId).coherencyRange,
  })
  if (result.rejection) throw new EngineInvariantError('charge: stored placements failed re-validation', { rejection: result.rejection })
  const resolved: ResolvedPlacement[] = result.resolved
  // F12 (SBG C3): enemy units the charge paths passed across (passedAcrossThisPhase; SBG-RA-2 Ruinous Chargers)
  const paths = Object.fromEntries(resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path]))
  recordPassedAcross(s, charge.unitId, unitsPassedAcrossPaths(s, charge.unitId, paths))
  for (const r of resolved) if (r.distance > EPS) setModelPos(r.model, r.to, r.facing)
  for (const id of leaderService.halves(s, charge.unitId)) {
    const u = s.units[id]
    if (u) u.turn.chargedThisTurn = true // CORE-9.7; no Strike-first (CORE-10.9)
  }
  ctx.emit({
    type: 'ChargeMoved', unitId: charge.unitId,
    paths: Object.fromEntries(resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path])),
  })
  s.phaseState.charge = null
}

// ---------- legal-action candidates ----------
function chargeLegalActions(state: GameState, pending: PendingDecision): Action[] | null {
  if (pending.kind === 'chargeMove') {
    const { unitId, roll } = pending.context
    if (!state.units[unitId]) return [{ type: 'pass', player: pending.player, decisionId: pending.id }]
    const moves = legalChargeMoves(state, unitId, roll, 2)
      .map((placements) => ({ type: 'chargeMove', player: pending.player, decisionId: pending.id, unitId, placements }) as Action)
    return [...moves, { type: 'pass', player: pending.player, decisionId: pending.id }] // pass = stay put, the charge fails
  }
  return optionActions(pending)
}

export const chargeModule: PhaseModule = {
  name: 'charge',
  legalActions(state, pending) { return chargeLegalActions(state, pending) },
  enter(ctx) {
    ctx.state.step = 'roll'
    ctx.state.phaseState.activated = []
    ctx.state.phaseState.charge = null
  },
  advance(ctx): AdvanceResult {
    const s = ctx.state
    // F10: the start-of-charge-phase ability window (Champion of Raids), before any unit is picked; runWindow remembers a passed window
    if (!s.phaseState.charge && !ctx.marked('ch:startDone')) {
      for (const p of ctx.order.active()) if (ctx.services.abilities.runWindow(ctx, 'chargeStart', p)) return 'pending'
      ctx.once('ch:startDone')
    }
    for (;;) {
      if (s.phaseState.charge) {
        if (driveCharge(ctx) === 'pending') return 'pending'
        continue
      }
      const r = doSelect(ctx)
      if (r === 'pending') return 'pending'
      // Counter-Charge (battle tactic command, Enemy Charge phase): the opponent may start a charge of their own
      if (commandWindow(ctx, 'charge', ctx.opponentOf(s.activePlayer), 'charge:counter')) return 'pending'
      if (s.phaseState.charge) continue
      break
    }
    s.step = 'abilities'
    for (const p of ctx.order.active()) if (ctx.services.abilities.runWindow(ctx, 'charge', p)) return 'pending'
    return 'done'
  },
  validate(state, action, pending) {
    if (action.type === 'declareCharge') return { code: 'E_INVALID_TARGET', reason: 'a charge declares no targets (CORE-9.4); choosing the unit is the declaration' }
    if (pending.kind === 'chargeMove') {
      if (action.type !== 'chargeMove') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'chargeMove is for the wrong unit', details: { expected: pending.context.unitId } }
      return chargeMoveRejection(state, action.unitId, pending.context.roll, action.placements)
    }
    return optionCheck(pending, action)
  },
  handle(ctx, action, pending): Rejection | void {
    const s = ctx.state
    if (action.type === 'pass') {
      if (pending.kind === 'chooseUnitToActivate') { ctx.once('ch:donePhase'); return }
      if (pending.kind === 'chargeMove') {
        const charge = s.phaseState.charge
        if (charge) failCharge(ctx, charge.unitId) // CORE-9.3: decline to move; the charge fails
        return
      }
      return { code: 'E_NOT_AN_OPTION', reason: `charge: pass is not valid for ${pending.kind}` }
    }
    if (pending.kind === 'chooseUnitToActivate' && action.type === 'chooseUnitToActivate') {
      s.phaseState.charge = { unitId: action.unitId, targetUnitIds: [], roll: null, rerolled: false, distance: null, heroic: false }
      for (const id of leaderService.halves(s, action.unitId)) if (!s.phaseState.activated.includes(id)) s.phaseState.activated.push(id)
      ctx.emit({ type: 'ChargeDeclared', unitId: action.unitId, targetUnitIds: [], heroic: false })
      return
    }
    if (pending.kind === 'chargeMove' && action.type === 'chargeMove') {
      const charge = s.phaseState.charge
      if (!charge || charge.unitId !== action.unitId) return { code: 'E_INVALID_TARGET', reason: 'chargeMove is for the wrong unit' }
      return applyChargeMove(ctx, charge, action)
    }
    return notImplementedHandle('charge')(ctx, action, pending)
  },
}
