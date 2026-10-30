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
import {
  CHARGE_END, EPS, baseEdgePoints, checkPlacements, distance, emptyMoveConstraints, horizontalGap, pathCrossesModels,
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

// can the unit's nearest model reach ½" of some enemy model with a roll of at most 12 (2D6)?
function enemyWithinReach(state: GameState, unitId: UnitId): boolean {
  const mine = unitModelsForCoherency(state, unitId)
  const enemies = enemyModelsOnBoard(state, state.units[unitId].player)
  for (const m of mine) for (const e of enemies) if (horizontalGap(m, e) - CHARGE_END <= 12 + EPS) return true
  return false
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
interface ChargeGeometry { models: Model[]; enemies: Model[]; otherFriendly: Model[]; fly: boolean }

function chargeGeometry(state: GameState, unitId: UnitId): ChargeGeometry {
  const models = unitModelsForCoherency(state, unitId)
  const player = state.units[unitId].player
  const mine = new Set(leaderService.halves(state, unitId))
  const otherFriendly: Model[] = []
  for (const u of boardUnitsOf(state, player)) if (!mine.has(u.id)) otherFriendly.push(...unitModels(state, u.id))
  return { models, enemies: enemyModelsOnBoard(state, player), otherFriendly, fly: models.length > 0 && models.every((m) => hasKeyword(state, m.unitId, 'FLY')) }
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

function chargeMoveRejection(state: GameState, unitId: UnitId, roll: number, placements: ModelPlacement[]): Rejection | null {
  const geo = chargeGeometry(state, unitId)
  const constraints = emptyMoveConstraints(roll, { mustEndOutsideEngagement: false, coherency: true })
  const result = checkPlacements({
    unitModels: geo.models, placements, constraints, otherFriendly: geo.otherFriendly, enemies: geo.enemies, board: state.board,
    fly: geo.fly, coherencyRange: datasheetOf(state, unitId).coherencyRange,
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
    if (!geo.fly && pathCrossesModels(fp, r.path, [...geo.enemies, ...geo.otherFriendly])) return { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross another model`, details: { modelId: r.model.id } }
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

// rigid translations of the whole unit that bring its nearest model to ~½" of one of the nearest enemy models, approached
// from several angles; the first `limit` that pass the full validation are returned
function legalChargeMoves(state: GameState, unitId: UnitId, roll: number, limit = 1): ModelPlacement[][] {
  const geo = chargeGeometry(state, unitId)
  if (geo.models.length === 0 || geo.enemies.length === 0) return []
  const out: ModelPlacement[][] = []
  const tried = new Set<string>()
  const nearestEnemies = [...geo.enemies]
    .map((e) => ({ e, gap: Math.min(...geo.models.map((m) => horizontalGap(m, e))) }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 6)
  for (const { e } of nearestEnemies) {
    const m = [...geo.models].sort((a, b) => horizontalGap(a, e) - horizontalGap(b, e))[0]
    const base = Math.atan2(m.pos.z - e.pos.z, m.pos.x - e.pos.x)
    for (const phi of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.8, -1.8]) {
      for (const gap of [0.4, 0.2, 0.05]) {
        const p = ringPoint(e, m, base + phi, gap)
        const dx = p.x - m.pos.x, dz = p.z - m.pos.z
        if (Math.hypot(dx, dz) > roll - 0.02) continue
        const placements = translatePlacements(geo.models, dx, dz).map((pl) => {
          const model = geo.models.find((x) => x.id === pl.modelId) as Model
          return { ...pl, pos: { ...pl.pos, y: settleY(state, model, pl.pos.x, pl.pos.z, model.pos.y) } }
        })
        const key = JSON.stringify(placements)
        if (tried.has(key)) continue
        tried.add(key)
        if (chargeMoveRejection(state, unitId, roll, placements) === null) {
          out.push(placements)
          if (out.length >= limit) return out
        }
      }
    }
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
    const roll = ctx.rollOnce(`charge:${unitId}`, { purpose: 'charge', player: unit.player, sides: 6, count: cardChargeDice(s, unitId), mode: 'sum', unitId })
    if (roll === null) return 'pending'
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
    ctx.emit({ type: 'ChargeRolled', unitId, dice: charge.roll as [number, number], total, needed: neededChargeDistance(s, unitId) })
  }

  // a roll too short to reach any enemy fails at once; the unit stays put (CORE-9.3)
  const needed = neededChargeDistance(s, unitId)
  if (needed === null || needed > (charge.distance ?? 0) + EPS) { failCharge(ctx, unitId); return 'progress' }

  s.step = 'move'
  ctx.decide({
    kind: 'chargeMove', player: unit.player, window: 'charge.moveEnded', canPass: true,
    context: { unitId, targetUnitIds: [], roll: charge.distance ?? 0 },
    constraints: emptyMoveConstraints(charge.distance ?? 0, { mustEndOutsideEngagement: false, coherency: true }),
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
