// Movement phase module (Spearhead port, WP4: CORE-6.1 to 6.6, 6.10, 6.13, 13-engine-port-plan §1.2).
// Steps: 'select' -> 'declare' -> 'move' (per unit) -> 'reinforcements' (reserve arrival) -> 'abilities'.
//
// Per-unit sequence: chooseUnitToActivate -> declareMove (Normal Move / Run / Retreat / stay) -> [Run: D6 via rollOnce]
// [Retreat: D3 mortal damage to itself through the damage sequence first] -> moveUnit (placements, validated here) -> next unit.
//   Normal Move  = 'normal'   no point of any model's path may enter combat range of a VISIBLE enemy unit (CORE-6.4)
//   Run          = 'advance'  up to Move + D6 (CORE-6.2); the unit may not Shoot or Charge afterwards
//   Retreat      = 'fallBack' only when in combat; may cross enemy combat ranges, must end outside all (CORE-6.3)
// Units set up this turn (reserve arrival) cannot use Move abilities (CORE-6.13, UnitSetUp `setUpTurn`).
// Reserve arrival: a reserve unit with `reserveArrival` (data params { fromRound, minEnemyDistance, anywhere }, e.g. Ere We Go)
// is offered a deployUnit placement once the active player's units have moved. Then both players' movement-phase abilities
// (abilities.runWindow('movement')).
//
// The 40k reactive machinery (Overwatch, surge moves, transports, teleports, Desperate Escape) is gone. A few exports are
// kept as inert stubs so 40k-era importers (faction files, shooting.ts, fight.ts) keep compiling until WP8 deletes them.
import { commandWindow, rallyAfterRetreat, retreatDamageWaived } from '../cards'
import { centroid, filterValid, formationPlacements, optionActions, repairCoherency, translatePlacements, unitVector } from './legal'
import { reformMoveCandidates } from './reform'
import { rollSum } from '../dice'
import { RUN_REROLL_BELOW, applyAbilityRerolls } from '../rerolls'
import {
  EPS, checkPlacements, dist2D, emptyMoveConstraints, pathCrossesModels, pivotCost as pivotCostFor,
  samplePath, whollyOnBoard, withinEngagementRange, type Footprint, type ResolvedPlacement,
} from '../geometry'
import { hookService } from '../hooks-impl'
import { leaderService } from '../leaders'
import { attackService } from '../attack'
import { losService } from '../los'
import { terrainService } from '../terrain'
import { notImplementedHandle, type AdvanceResult, type EngineContext, type PhaseModule } from '../modules'
import { writeDeclaredMove } from '../declared'
import { nearBoardEdge, pathBlockingEnemies, recordPassedAcross, reinforcementOptions, reinforcementFormation, unitsPassedAcrossPaths } from '../factions/aos-moves'
import {
  boardModelsOf, boardUnitsOf, datasheetOf, deploymentZone, enemyModelsOnBoard, hasKeyword, keywordsOf, modelStats, setModelPos,
  territoryOf, unitModels, unitModelsForCoherency,
} from '../state'
import type { Action, ModelPlacement } from '../actions'
import {
  EngineInvariantError, type DeclaredTarget, type GameState, type Model, type ModelId, type MoveType, type PendingDecision,
  type PlayerId, type Polygon, type Rejection, type UnitId, type Vec3,
} from '../types'

// ---------- single-value progress markers (phaseState.marks; reset every time the phase is entered) ----------
function readMark(state: GameState, key: string): string | null {
  const prefix = `${key}=`
  const m = state.phaseState.marks.find((x) => x.startsWith(prefix))
  return m ? m.slice(prefix.length) : null
}
function writeMark(state: GameState, key: string, value: string | null): void {
  const prefix = `${key}=`
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(prefix))
  if (value !== null) state.phaseState.marks.push(prefix + value)
}

function setMoveType(state: GameState, unitId: UnitId, mt: MoveType): void {
  for (const id of leaderService.halves(state, unitId)) state.units[id].turn.moveType = mt
}

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

function boardPolygon(state: GameState): Polygon {
  const hw = state.board.w / 2, hh = state.board.h / 2
  return [{ x: -hw, z: -hh }, { x: hw, z: -hh }, { x: hw, z: hh }, { x: -hw, z: hh }]
}

// ---------- combat range with visibility (CORE-1.5, CORE-6.4) ----------

// enemy models grouped by unit
function enemyGroups(state: GameState, player: PlayerId): Map<UnitId, Model[]> {
  const out = new Map<UnitId, Model[]>()
  for (const m of enemyModelsOnBoard(state, player)) {
    const list = out.get(m.unitId) ?? []
    list.push(m)
    out.set(m.unitId, list)
  }
  return out
}

// the enemy unit a model standing as `probe` would be in combat with: one of its models within 3" and the unit visible
function probeCombatWith(state: GameState, probe: Footprint & Model, groups: Map<UnitId, Model[]>): UnitId | null {
  for (const [uid, ems] of groups) {
    if (!ems.some((e) => withinEngagementRange(probe, e))) continue
    if (ems.some((e) => losService.visibleFrom(state, probe, e.id))) return uid
  }
  return null
}

// does any sampled point of the path put the model in combat with a visible enemy unit? (CORE-6.4)
function pathEntersCombat(state: GameState, model: Model, path: Vec3[], groups: Map<UnitId, Model[]>): boolean {
  for (const p of samplePath(path)) {
    const probe: Model = { ...model, pos: p }
    if (probeCombatWith(state, probe, groups) !== null) return true
  }
  return false
}

// ---------- movement allowance ----------
function friendlyOthers(state: GameState, unitId: UnitId): Model[] {
  const mine = new Set(leaderService.halves(state, unitId))
  const out: Model[] = []
  for (const u of boardUnitsOf(state, state.units[unitId].player)) if (!mine.has(u.id)) out.push(...unitModels(state, u.id))
  return out
}

function moveAllowance(state: GameState, unitId: UnitId): { perModel: Record<ModelId, number>; pivot: number } {
  const models = unitModelsForCoherency(state, unitId)
  const unit = state.units[unitId]
  const bonus = unit.turn.moveType === 'advance' ? unit.turn.advanceRoll ?? 0 : 0
  const perModel: Record<ModelId, number> = {}
  for (const m of models) {
    const base = modelStats(state, m).M
    perModel[m.id] = hookService.statFor(state, { unitId: m.unitId, modelId: m.id, weapon: null, stat: 'M' }, base) + bonus
  }
  const pivot = models[0] ? pivotCostFor(models[0].base, keywordsOf(state, models[0].unitId)) : 0
  return { perModel, pivot }
}

function buildMoveConstraints(state: GameState, unitId: UnitId) {
  const { perModel } = moveAllowance(state, unitId)
  const max = Object.values(perModel).reduce((a, b) => Math.max(a, b), 0)
  // combat range is checked by this module with visibility (CORE-1.5), not by the plain range flag. F8 (LRL-RA-2 Roaring
  // Headwind): a code hook may make every model end closer to one battlefield edge
  return emptyMoveConstraints(max, { perModel, mustEndOutsideEngagement: false, coherency: true, mustEndCloserToEdge: hookService.moveEdgeConstraintFor(state, unitId) })
}

const flyOf = (state: GameState, m: Model): boolean => hasKeyword(state, m.unitId, 'FLY')

// shared by validate(), doMove() and the candidate generators: checkPlacements plus terrain, path and combat-range rules
function resolveMove(state: GameState, unitId: UnitId, moveType: MoveType, placements: ModelPlacement[]):
  { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  const models = unitModelsForCoherency(state, unitId)
  const { perModel, pivot } = moveAllowance(state, unitId)
  const player = state.units[unitId].player
  const enemies = enemyModelsOnBoard(state, player)
  const otherFriendly = friendlyOthers(state, unitId)
  const constraints = buildMoveConstraints(state, unitId)
  const allFly = models.length > 0 && models.every((m) => flyOf(state, m))
  const result = checkPlacements({
    unitModels: models, placements, constraints, otherFriendly, enemies, board: state.board, pivotCost: pivot, fly: allFly,
    coherencyRange: datasheetOf(state, unitId).coherencyRange,
  })
  if (result.rejection) return result
  const groups = enemyGroups(state, player)
  // F12 (SBG-AB-2): enemy models of units the mover may pass across do not block its path
  const pathEnemies = pathBlockingEnemies(state, unitId, enemies)
  for (const r of result.resolved) {
    const fp: Footprint = { pos: r.to, facing: r.facing, base: r.model.base }
    const fly = flyOf(state, r.model) || unitMovesThroughModels(state, r.model.unitId)
    if (r.distance > EPS) {
      // CORE-6.5: the whole path stays on the board
      for (const p of samplePath(r.path)) {
        const onBoard = whollyOnBoard({ pos: p, facing: r.facing, base: r.model.base }, state.board)
          || whollyOnBoard({ pos: p, facing: r.model.facing, base: r.model.base }, state.board)
        if (!onBoard) return { rejection: { code: 'E_OUT_OF_RANGE', reason: `${r.model.id}'s path would cross the board edge`, details: { modelId: r.model.id } } }
      }
      if (terrainService.crossesImpassable(state, r.model, r.path)) {
        return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path crosses impassable terrain`, details: { modelId: r.model.id } } }
      }
      const end = terrainService.canEndAt(state, r.model, r.to)
      if (!end.ok) return { rejection: { code: 'E_OVERLAP', reason: end.reason ?? `${r.model.id} cannot end there`, details: { modelId: r.model.id } } }
      // CORE-6.7: climbing over taller terrain costs vertical distance on top of the horizontal path
      const allowance = constraints.perModel[r.model.id] ?? constraints.maxDistance
      const extra = terrainService.extraMoveCost(state, r.model, r.path)
      if (extra > 0 && r.distance + extra > allowance + 1e-3) {
        return { rejection: { code: 'E_OUT_OF_RANGE', reason: `${r.model.id} would need ${(r.distance + extra).toFixed(2)}" including climbs > ${allowance}"`, details: { modelId: r.model.id } } }
      }
      if (!fly) {
        // CORE-6.5: models may not pass through other models, friendly or enemy
        if (pathCrossesModels(fp, r.path, [...pathEnemies, ...otherFriendly])) {
          return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id}'s path would cross another model`, details: { modelId: r.model.id } } }
        }
        // CORE-6.4: a Normal Move or Run may not enter combat at any point (Retreat may cross combat ranges)
        if (moveType !== 'fallBack' && pathEntersCombat(state, r.model, r.path, groups)) {
          return { rejection: { code: 'E_ENGAGEMENT', reason: `${r.model.id}'s path would move into combat`, details: { modelId: r.model.id } } }
        }
      }
    }
    // nobody ends a move in combat (Retreat must end outside all combat ranges; FLY only ignores the mid-path rule)
    if (probeCombatWith(state, { ...r.model, pos: r.to, facing: r.facing }, groups) !== null) {
      return { rejection: { code: 'E_ENGAGEMENT', reason: `${r.model.id} would end in combat`, details: { modelId: r.model.id } } }
    }
  }
  return result
}

function moveRejection(state: GameState, unitId: UnitId, moveType: MoveType, placements: ModelPlacement[]): Rejection | null {
  return resolveMove(state, unitId, moveType, placements).rejection
}

// ---------- 40k-era exports kept as inert stubs (WP8 deletes their importers) ----------
export function startReactiveMove(_ctx: EngineContext, _unitId: UnitId, _distance: number, _source: string, _window?: unknown, _then?: { unitId: UnitId; distance: number }[]): void { /* no reactive moves in Spearhead */ }
export function reactiveMoveLegalActions(_state: GameState, _pending: PendingDecision): Action[] | null { return null }
export function validateReactiveMove(_state: GameState, _action: Action, _pending: PendingDecision): Rejection | null | undefined { return undefined }
export function handleReactiveMove(_ctx: EngineContext, _action: Action, _pending: PendingDecision): Rejection | void | null { return null }
export function resolveSurgeMove(_ctx: EngineContext, _unitId: UnitId, _distance: number, _towardUnitId: UnitId | null): boolean { return false }
export function crossesBigFriendly(_state: GameState, _model: Model, _fp: Footprint, _path: Vec3[], _otherFriendly: Model[]): boolean { return false }
export function overwatchTargets(_state: GameState, _shooterUnitId: UnitId, _targetUnitId: UnitId): DeclaredTarget[] { return [] }
export function defaultOverwatchSelection(_state: GameState, all: DeclaredTarget[]): DeclaredTarget[] { return all }
// active effects and (F8) passive descriptors the unit holds itself (hookService.unitHasEffectFlag)
export function unitMovesThroughModels(state: GameState, unitId: UnitId): boolean {
  return hookService.unitHasEffectFlag(state, unitId, 'moveThroughModels')
}
// Effect.noRetreatDamage (STD-RA-2 Fearless Invaders; GLO-BT-1 Fast as Frazzlegit as a passive battle trait, F8): the Retreat
// costs no mortal damage
export function unitIgnoresRetreatDamage(state: GameState, unitId: UnitId): boolean {
  return hookService.unitHasEffectFlag(state, unitId, 'noRetreatDamage')
}

// ---------- move declaration ----------
function canRetreat(state: GameState, unitId: UnitId): boolean {
  return moveUnitCandidatesFor(state, unitId, 'fallBack', state.units[unitId].player, '__probe__').length > 0
}

function allowedMoveTypes(state: GameState, unitId: UnitId): MoveType[] {
  // CORE-6.1 / 6.3: a unit in combat can only Retreat (or stay); otherwise Normal Move or Run (or stay)
  if (losService.unitInCombat(state, unitId)) return canRetreat(state, unitId) ? ['fallBack', 'stationary'] : ['stationary']
  return ['normal', 'advance', 'stationary']
}

// CORE-6.13: a unit set up this turn cannot use Move abilities in the movement phase of that turn
function setUpThisTurn(state: GameState, unitId: UnitId): boolean {
  const t = state.units[unitId]?.setUpTurn
  return !!t && t.round === state.round && t.player === state.activePlayer
}

function finishUnit(state: GameState, unitId: UnitId, extraIds: UnitId[] = []): void {
  for (const id of [unitId, ...extraIds]) if (!state.phaseState.activated.includes(id)) state.phaseState.activated.push(id)
  // F8 C2: a unit whose 'moveDeclared' window ran gets its 'moveEnded' window before the next unit is picked
  if (state.phaseState.marks.includes(`mv:declWin:${unitId}`)) writeMark(state, 'mv:endWin', unitId)
  writeMark(state, 'mv:cur', null)
  writeMark(state, 'mv:placements', null)
}

function doSelect(ctx: EngineContext): 'pending' | 'declare' | 'reinforcements' {
  const s = ctx.state
  // F8 C2: the finished unit's 'moveEnded' window (asks queued anchored set-ups: KO-BT-1 Ply the Skies' passenger)
  const ended = readMark(s, 'mv:endWin')
  if (ended !== null) {
    if (ctx.services.abilities.runWindow(ctx, 'moveEnded', s.units[ended]?.player ?? s.activePlayer, `me:${ended}`)) return 'pending'
    writeMark(s, 'mv:endWin', null)
    writeDeclaredMove(s, null)
  }
  if (readMark(s, 'mv:cur') !== null) return 'declare'
  const active = s.activePlayer
  const activated = new Set(s.phaseState.activated)
  const eligible: UnitId[] = []
  for (const u of boardUnitsOf(s, active)) {
    if (u.bodyguardUnitId || activated.has(u.id) || setUpThisTurn(s, u.id)) continue
    eligible.push(u.id)
  }
  if (eligible.length === 0) return 'reinforcements'
  ctx.decide({
    kind: 'chooseUnitToActivate', player: active, window: 'movement.start', canPass: true,
    context: { phase: 'movement', eligible },
    options: eligible.map((id) => ({ id, label: id, action: { type: 'chooseUnitToActivate', player: active, decisionId: '', unitId: id } })),
  })
  return 'pending'
}

// drains an attack sequence (mortal damage from a Retreat) opened by attackService
function drainAttack(ctx: EngineContext): AdvanceResult {
  while (ctx.state.phaseState.attack) {
    if (attackService.advance(ctx) === 'pending') return 'pending'
  }
  return 'done'
}

function doDeclare(ctx: EngineContext): 'pending' | 'move' | 'select' {
  const s = ctx.state
  const unitId = readMark(s, 'mv:cur')
  if (!unitId) throw new EngineInvariantError('movement: declare step with no current unit')
  const unit = s.units[unitId]
  if (unit.turn.moveType === null) {
    const allowed = allowedMoveTypes(s, unitId)
    ctx.decide({
      kind: 'declareMove', player: unit.player, window: 'movement.start', canPass: false,
      context: { unitId, allowed },
      options: allowed.map((mt) => ({ id: mt, label: mt, action: { type: 'declareMove', player: unit.player, decisionId: '', unitId, moveType: mt } })),
    })
    return 'pending'
  }
  if (unit.turn.moveType === 'stationary') {
    ctx.emit({ type: 'UnitRemainedStationary', unitId, player: unit.player })
    finishUnit(s, unitId)
    return 'select'
  }
  // F8 C1: abilities that react to the declared move (KO-BT-1 Ply the Skies, KO-RA-2 Disengage), before any roll or move
  if (!s.phaseState.marks.includes(`mv:declWin:${unitId}`)) {
    writeDeclaredMove(s, { unitId, moveType: unit.turn.moveType })
    if (ctx.services.abilities.runWindow(ctx, 'moveDeclared', unit.player, `md:${unitId}`)) return 'pending'
    s.phaseState.marks.push(`mv:declWin:${unitId}`)
  }
  unit.turn.usedCoreThisPhase = true // CORE-3.4: one Core ability per unit per phase
  // Run: D6 added to Move (CORE-6.2)
  if (unit.turn.moveType === 'advance' && unit.turn.advanceRoll === null) {
    let roll = ctx.rollOnce(`advance:${unitId}`, { purpose: 'advance', player: unit.player, sides: 6, count: 1, mode: 'sum', unitId })
    if (roll === null) return 'pending'
    // ability re-rolls of a low run roll (STD-AB-2 Visions of Glory; rerolls.ts)
    roll = applyAbilityRerolls(ctx, 'onAdvanceRoll', { movingUnitId: unitId }, roll, RUN_REROLL_BELOW)
    const run = hookService.advanceRollFor(s, unitId, rollSum(roll))
    for (const id of leaderService.halves(s, unitId)) s.units[id].turn.advanceRoll = run
    ctx.emit({ type: 'UnitAdvanced', unitId, roll: run, player: unit.player })
  }
  // Retreat: D3 mortal damage to itself first, through the damage sequence (CORE-6.3)
  if (unit.turn.moveType === 'fallBack') {
    if (!ctx.marked(`mv:retreatRolled:${unitId}`)) {
      const roll = ctx.rollOnce(`retreat:${unitId}`, { purpose: 'retreat', player: unit.player, sides: 3, count: 1, mode: 'sum', unitId })
      if (roll === null) return 'pending'
      ctx.once(`mv:retreatRolled:${unitId}`)
      ctx.emit({ type: 'UnitFellBack', unitId, player: unit.player })
      // Fall Back and Rally (battle tactic command) or an Effect.noRetreatDamage: the retreat costs no mortal damage
      const damage = retreatDamageWaived(s, unitId) || unitIgnoresRetreatDamage(s, unitId) ? 0 : rollSum(roll)
      if (damage > 0) attackService.queueMortalWounds(ctx, unitId, damage, 'retreat', false)
    }
    if (drainAttack(ctx) === 'pending') return 'pending'
    if (s.units[unitId].location !== 'board' || unitModelsForCoherency(s, unitId).length === 0) {
      finishUnit(s, unitId) // the retreat killed the unit
      return 'select'
    }
  }
  return 'move'
}

function doMove(ctx: EngineContext): 'pending' | 'select' {
  const s = ctx.state
  const unitId = readMark(s, 'mv:cur')
  if (!unitId) throw new EngineInvariantError('movement: move step with no current unit')
  const unit = s.units[unitId]
  const moveType = unit.turn.moveType as MoveType
  const placementsRaw = readMark(s, 'mv:placements')
  if (placementsRaw === null) {
    // a declared Retreat with no legal end (casualties) reverts to staying put
    if (moveType === 'fallBack' && moveUnitCandidatesFor(s, unitId, 'fallBack', unit.player, '__stuck__').length === 0) {
      setMoveType(s, unitId, 'stationary')
      ctx.emit({ type: 'UnitRemainedStationary', unitId, player: unit.player })
      finishUnit(s, unitId)
      return 'select'
    }
    ctx.decide({
      kind: 'moveUnit', player: unit.player, window: 'movement.unitMoved', canPass: false,
      context: { unitId, moveType, advanceRoll: unit.turn.advanceRoll },
      constraints: buildMoveConstraints(s, unitId),
    })
    return 'pending'
  }
  const placements = (JSON.parse(placementsRaw) as ModelPlacement[]).filter((p) => s.models[p.modelId])
  const result = resolveMove(s, unitId, moveType, placements)
  if (result.rejection) throw new EngineInvariantError('movement: stored placements failed re-validation', { rejection: result.rejection })
  // F8 C4: enemy units this move passed across (KO-AB-6 Bomb Racks; passedAcrossThisPhase)
  const moved = Object.fromEntries(result.resolved.filter((r) => r.distance > EPS).map((r) => [r.model.id, r.path]))
  recordPassedAcross(s, unitId, unitsPassedAcrossPaths(s, unitId, moved))
  for (const r of result.resolved) { const m = s.models[r.model.id]; if (m) setModelPos(m, r.to, r.facing) }
  ctx.emit({
    type: 'UnitMoved', unitId, moveType,
    paths: Object.fromEntries(result.resolved.filter((r) => r.distance > EPS && s.models[r.model.id]).map((r) => [r.model.id, r.path])),
    player: unit.player,
  })
  if (moveType === 'fallBack') rallyAfterRetreat(ctx, unitId)
  finishUnit(s, unitId, leaderService.halves(s, unitId))
  return 'select'
}

// ---------- reserve arrival (13-port-plan §1.2: Ere We Go style, data params) ----------
// F16 (TZE C2, DOT-BT-1 Fated Arrival): territory = set up wholly within friendly territory (not the deployment zone);
// edgeWithin = some model's base edge must be within that many inches of a battlefield edge
interface ArrivalParams { fromRound: number; minEnemyDistance: number; anywhere: boolean; territory?: boolean; edgeWithin?: number }

function arrivalParams(state: GameState, unitId: UnitId): ArrivalParams | null {
  const u = state.units[unitId]
  if (!u || !u.reserveArrival) return null
  const a = state.abilities[u.reserveArrival]
  const p = (a?.params ?? {}) as Record<string, unknown>
  return {
    fromRound: Number(p.fromRound ?? a?.fromRound ?? 1),
    minEnemyDistance: Number(p.minEnemyDistance ?? 0),
    anywhere: p.anywhere !== false,
    ...(p.territory === true ? { territory: true } : {}),
    ...(typeof p.edgeWithin === 'number' ? { edgeWithin: p.edgeWithin } : {}),
  }
}

function eligibleArrivals(state: GameState, player: PlayerId): UnitId[] {
  const out: UnitId[] = []
  for (const u of Object.values(state.units)) {
    if (u.player !== player || u.location !== 'reserves' || !u.reserveArrival) continue
    const p = arrivalParams(state, u.id)
    if (!p || state.round < p.fromRound) continue
    out.push(u.id)
  }
  return out.sort()
}

// the set-up rules a reserve arrival (and an out-of-phase redeploy, FYR-RA-1 Magmic Tunnels via src/engine/redeploy.ts) follows
// F16 (TZE C2): territory (region = friendly territory, wins over anywhere) and edgeWithin (checked in resolveSetUp, not a
// MoveConstraints field: types.ts stays as it is)
export interface SetUpParams { minEnemyDistance: number; anywhere: boolean; territory?: boolean; edgeWithin?: number }

// the area a set-up must be wholly within (null = anywhere on the battlefield)
export function setUpRegion(state: GameState, player: PlayerId, p: SetUpParams): Polygon | null {
  if (p.territory) return territoryOf(state, player)
  return p.anywhere ? null : deploymentZone(state, player)
}

export function setUpConstraints(state: GameState, unitId: UnitId, p: SetUpParams) {
  const player = state.units[unitId].player
  return emptyMoveConstraints(9999, {
    region: setUpRegion(state, player, p),
    minDistanceFromEnemies: p.minEnemyDistance, mustEndOutsideEngagement: false, coherency: true,
  })
}

function arrivalConstraints(state: GameState, unitId: UnitId) {
  return setUpConstraints(state, unitId, arrivalParams(state, unitId) as ArrivalParams)
}

function resolveArrival(state: GameState, unitId: UnitId, placements: ModelPlacement[]):
  { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  return resolveSetUp(state, unitId, placements, arrivalParams(state, unitId) as ArrivalParams)
}

// validates a whole-unit set-up: every model placed, on the board, clear of every other model (the unit's own current
// positions do not count, so a unit on the board can be lifted and set up again), more than minEnemyDistance from enemies,
// coherent, legal terrain-wise. Reserve arrival and redeploys share it.
export function resolveSetUp(state: GameState, unitId: UnitId, placements: ModelPlacement[], p: SetUpParams):
  { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  const models = unitModels(state, unitId)
  const player = state.units[unitId].player
  const needed = new Set(models.map((m) => m.id))
  const provided = new Set(placements.map((p) => p.modelId))
  for (const id of needed) if (!provided.has(id)) return { rejection: { code: 'E_OUT_OF_RANGE', reason: `arrival must place every model of ${unitId}`, details: { missing: id } } }
  const result = checkPlacements({
    unitModels: models, placements, constraints: setUpConstraints(state, unitId, p),
    otherFriendly: boardModelsOf(state, player).filter((m) => m.unitId !== unitId), enemies: enemyModelsOnBoard(state, player), board: state.board,
    coherencyRange: datasheetOf(state, unitId).coherencyRange,
  })
  if (result.rejection) return result
  for (const r of result.resolved) {
    const end = terrainService.canEndAt(state, r.model, r.to)
    if (!end.ok) return { rejection: { code: 'E_OVERLAP', reason: end.reason ?? `${r.model.id} cannot be set up there`, details: { modelId: r.model.id } } }
  }
  // F16 (TZE C2): at least one model's base edge within edgeWithin of a battlefield edge
  if (p.edgeWithin !== undefined && !result.resolved.some((r) => nearBoardEdge({ pos: r.to, facing: r.facing, base: r.model.base }, state.board, p.edgeWithin as number))) {
    return { rejection: { code: 'E_OUT_OF_RANGE', reason: `must be set up within ${p.edgeWithin}" of a battlefield edge` } }
  }
  return result
}

function raiseArrival(ctx: EngineContext, unitId: UnitId): void {
  const s = ctx.state
  const player = s.units[unitId].player
  const p = arrivalParams(s, unitId) as ArrivalParams
  writeMark(s, 'mv:arriveUnit', unitId)
  ctx.decide({
    kind: 'deployUnit', player, window: 'movement.reinforcements', canPass: true,
    context: { unitIds: [unitId], zone: setUpRegion(s, player, p) ?? boardPolygon(s), infiltrators: [], reservesAllowed: [unitId] },
    constraints: arrivalConstraints(s, unitId),
  })
}

function doReinforcements(ctx: EngineContext): 'pending' | 'abilities' {
  const s = ctx.state
  if (readMark(s, 'mv:arriveUnit') !== null) return 'pending'
  let queue: UnitId[]
  const raw = readMark(s, 'mv:arriveQueue')
  if (raw === null) queue = eligibleArrivals(s, s.activePlayer)
  else queue = JSON.parse(raw) as UnitId[]
  const head = queue.find((id) => s.units[id]?.location === 'reserves')
  if (head === undefined) { writeMark(s, 'mv:arriveQueue', JSON.stringify([])); return 'abilities' }
  writeMark(s, 'mv:arriveQueue', JSON.stringify(queue.slice(queue.indexOf(head) + 1)))
  raiseArrival(ctx, head)
  return 'pending'
}

function doAbilities(ctx: EngineContext): 'pending' | 'done' {
  for (const p of ctx.order.active()) {
    if (ctx.services.abilities.runWindow(ctx, 'movement', p)) return 'pending'
    // battle tactic commands (Redeploy, Call Reinforcements)
    if (commandWindow(ctx, 'movement', p)) return 'pending'
  }
  return 'done'
}

// ---------- legal-action candidates (generic Deciders need >=1 concrete answer for continuous decisions) ----------
// Shared by moveUnitCandidates and canRetreat (declareMove must not offer a Retreat no placement can answer).
// F8: up to MOVE_CANDIDATES varied moves, one per intent (each objective, stopping on it; toward / away from the nearest enemy;
// toward the nearest friendly unit; both sides at right angles to the nearest objective; then the compass), each as far as it
// legally goes (full, 60%, 30%); then staying put and the coherency repairs / formations fill any room left.
const MOVE_CANDIDATES = 9
// `reform` false leaves out the re-formed moves (tests compare the two lists)
export function moveUnitCandidatesFor(state: GameState, unitId: UnitId, moveType: MoveType, player: PlayerId, decisionId: string, reform = true): Action[] {
  const unit = state.units[unitId]
  if (!unit) return []
  const models = unitModelsForCoherency(state, unitId)
  if (models.length === 0) return []
  const { perModel } = moveAllowance(state, unitId)
  const allow = Math.max(0, Math.min(...models.map((m) => perModel[m.id] ?? 0)) - 0.02)
  const c = centroid(models)
  const enemies = enemyModelsOnBoard(state, unit.player)
  const dirs: { x: number; z: number }[] = []
  const intents: { v: { x: number; z: number }; len: number }[] = []
  const intent = (to: { x: number; z: number } | null, stopAt?: number): void => {
    if (!to) return
    const v = unitVector(c, to)
    if (!v || intents.some((i) => Math.abs(i.v.x - v.x) < 0.05 && Math.abs(i.v.z - v.z) < 0.05 && (stopAt === undefined || i.len >= allow))) return
    intents.push({ v, len: stopAt === undefined ? allow : Math.max(0.5, Math.min(allow, stopAt)) })
  }
  const objs = Object.values(state.objectives).filter((o) => !o.removed).sort((a, b) => dist2D(c, a.pos) - dist2D(c, b.pos))
  for (const o of objs.slice(0, 3)) intent(o.pos, dist2D(c, o.pos))
  if (objs[0]) { const v = unitVector(c, objs[0].pos); if (v) dirs.push(v) }
  if (enemies.length > 0) {
    const e = [...enemies].sort((a, b) => dist2D(c, a.pos) - dist2D(c, b.pos))[0]
    const v = unitVector(c, e.pos)
    if (v) { dirs.push(v); dirs.push({ x: -v.x, z: -v.z }); intent(e.pos); intent({ x: c.x - v.x, z: c.z - v.z }) }
  }
  const friends = boardUnitsOf(state, unit.player).filter((u) => !leaderService.halves(state, unitId).includes(u.id)).map((u) => centroid(unitModels(state, u.id))).filter((p) => Number.isFinite(p.x))
  if (friends.length > 0) {
    const f = friends.reduce((a, b) => (dist2D(c, b) < dist2D(c, a) ? b : a))
    intent(f, dist2D(c, f) - 3)
  }
  if (objs[0]) {
    const v = unitVector(c, objs[0].pos)
    if (v) { intent({ x: c.x - v.z, z: c.z + v.x }); intent({ x: c.x + v.z, z: c.z - v.x }) }
  }
  for (let i = 0; i < 8; i++) intent({ x: c.x + Math.cos((2 * Math.PI * i) / 8), z: c.z + Math.sin((2 * Math.PI * i) / 8) })
  for (let i = 0; i < 16; i++) dirs.push({ x: Math.cos((2 * Math.PI * i) / 16), z: Math.sin((2 * Math.PI * i) / 16) })
  const mk = (placements: ModelPlacement[]): Action => ({ type: 'moveUnit', player, decisionId, unitId, placements })
  const valid = (a: Action): boolean => a.type === 'moveUnit' && moveRejection(state, unitId, moveType, a.placements) === null
  const picked: Action[] = []
  for (const it of intents) {
    if (picked.length >= MOVE_CANDIDATES - 1) break
    for (const frac of [1, 0.6, 0.3]) {
      const a = mk(translatePlacements(models, it.v.x * it.len * frac, it.v.z * it.len * frac))
      if (valid(a)) { picked.push(a); break }
    }
  }
  const candidates: Action[] = []
  candidates.push(mk([]))
  // regroup candidates for a unit that starts out of coherency (rigid translations can never end coherent)
  const allowOf = (m: Model): number => Math.max(0, (perModel[m.id] ?? 0) - 0.05)
  const groups = enemyGroups(state, unit.player)
  const repairOpts = {
    allowance: allowOf,
    blockers: [...friendlyOthers(state, unitId), ...enemies],
    ok: (m: Model, to: Vec3): boolean => probeCombatWith(state, { ...m, pos: to }, groups) === null
      && terrainService.canEndAt(state, m, to).ok && !terrainService.crossesImpassable(state, m, [m.pos, to]),
  }
  candidates.push(mk(repairCoherency(models, [], repairOpts)))
  for (const d of dirs.slice(0, 11)) candidates.push(mk(repairCoherency(models, translatePlacements(models, d.x * allow * 0.3, d.z * allow * 0.3), repairOpts)))
  for (const frac of [0.5, 0.25, 0]) {
    for (const d of dirs.slice(0, 11)) {
      const f = formationPlacements(models, { x: c.x + d.x * allow * frac, z: c.z + d.z * allow * frac }, allowOf)
      if (f) candidates.push(mk(f))
      if (frac === 0) break
    }
  }
  const list = [...picked, ...filterValid(candidates, (a) => (a.type === 'moveUnit' ? moveRejection(state, unitId, moveType, a.placements) : null), Math.max(1, MOVE_CANDIDATES + 1 - picked.length))]
  // F10: a boxed-in unit (shoulder to shoulder, big ovals against terrain or friends) gets re-formed moves when no slide takes it
  // at least 60% of its allowance, so a human sees the same options the AI used to build for itself (phases/reform.ts)
  const shift = (a: Action): number => (a.type === 'moveUnit' ? Math.max(0, ...a.placements.map((p) => { const m = state.models[p.modelId]; return m ? Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) : 0 })) : 0)
  if (reform && allow >= 1 && !list.some((a) => shift(a) >= allow * 0.6)) {
    const reformed = reformMoveCandidates(state, unitId, models, allowOf, moveType === 'fallBack',
      (p) => moveRejection(state, unitId, moveType, p) === null, 4, datasheetOf(state, unitId).coherencyRange ?? 0.5)
    list.push(...reformed.map(mk))
  }
  return list
}

function arrivalCandidates(state: GameState, pending: Extract<PendingDecision, { kind: 'deployUnit' }>): Action[] {
  const unitId = pending.context.unitIds[0]
  const models = unitModels(state, unitId)
  const out: Action[] = []
  const ap = arrivalParams(state, unitId)
  // F16 (TZE C2): an edge arrival in friendly territory: packed formations centred along the territory's battlefield edges
  if (models.length > 0 && ap?.territory && ap.edgeWithin !== undefined) {
    const shape = { edgeBand: false, edgeWithin: ap.edgeWithin, minEnemyDistance: ap.minEnemyDistance }
    const range = datasheetOf(state, unitId).coherencyRange
    for (const o of reinforcementOptions(state, pending.player, models, range, 5, shape)) {
      const placements = reinforcementFormation(state, pending.player, models, range, o.centre, shape)
      if (placements && resolveArrival(state, unitId, placements).rejection === null) out.push({ type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId, placements })
    }
  }
  if (models.length > 0 && out.length === 0) {
    const rad = Math.max(...models.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
    const spacing = 2 * rad + 0.2
    const cols = Math.ceil(Math.sqrt(models.length))
    const rows = Math.ceil(models.length / cols)
    const poly = pending.context.zone
    const minX = Math.min(...poly.map((p) => p.x)), maxX = Math.max(...poly.map((p) => p.x))
    const minZ = Math.min(...poly.map((p) => p.z)), maxZ = Math.max(...poly.map((p) => p.z))
    for (let z0 = minZ + rad + 0.1; z0 + (rows - 1) * spacing + rad < maxZ && out.length < 3; z0 += 3) {
      for (let x0 = minX + rad + 0.1; x0 + (cols - 1) * spacing + rad < maxX && out.length < 3; x0 += 3) {
        const placements: ModelPlacement[] = models.map((m, i) => ({ modelId: m.id, pos: { x: x0 + (i % cols) * spacing, y: 0, z: z0 + Math.floor(i / cols) * spacing }, facing: m.facing }))
        const action: Action = { type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId, placements }
        if (resolveArrival(state, unitId, placements).rejection === null) out.push(action)
      }
    }
  }
  out.push({ type: 'pass', player: pending.player, decisionId: pending.id })
  return out
}

function movementLegalActions(state: GameState, pending: PendingDecision): Action[] | null {
  if (pending.kind === 'moveUnit') return moveUnitCandidatesFor(state, pending.context.unitId, pending.context.moveType, pending.player, pending.id)
  if (pending.kind === 'deployUnit') return arrivalCandidates(state, pending)
  if (state.phaseState.attack) return attackService.handler.legalActions?.(state, pending) ?? optionActions(pending)
  return optionActions(pending)
}

const MINE = new Set<string>(['chooseUnitToActivate', 'declareMove', 'moveUnit', 'deployUnit'])

export const movementModule: PhaseModule = {
  name: 'movement',
  legalActions(state, pending) { return movementLegalActions(state, pending) },
  enter(ctx) {
    ctx.state.step = 'select'
    ctx.state.phaseState.activated = []
  },
  advance(ctx) {
    const s = ctx.state
    for (;;) {
      if (s.phaseState.attack && drainAttack(ctx) === 'pending') return 'pending'
      if (s.step === 'select') {
        const r = doSelect(ctx)
        if (r === 'pending') return 'pending'
        s.step = r
        continue
      }
      if (s.step === 'declare') {
        const r = doDeclare(ctx)
        if (r === 'pending') return 'pending'
        s.step = r
        continue
      }
      if (s.step === 'move') {
        const r = doMove(ctx)
        if (r === 'pending') return 'pending'
        s.step = r
        continue
      }
      if (s.step === 'reinforcements') {
        const r = doReinforcements(ctx)
        if (r === 'pending') return 'pending'
        s.step = r
        continue
      }
      if (s.step === 'abilities') return doAbilities(ctx)
      throw new EngineInvariantError(`movement: unexpected step ${s.step}`)
    }
  },
  validate(state, action, pending) {
    if (pending.kind === 'moveUnit') {
      if (action.type !== 'moveUnit') return optionCheck(pending, action)
      if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'placements are for the wrong unit', details: { expected: pending.context.unitId } }
      return moveRejection(state, action.unitId, pending.context.moveType, action.placements)
    }
    if (pending.kind === 'deployUnit') {
      if (action.type !== 'deployUnit') return optionCheck(pending, action)
      if (action.toReserves) return null
      return resolveArrival(state, pending.context.unitIds[0], action.placements).rejection
    }
    if (state.phaseState.attack) return attackService.handler.validate?.(state, action, pending) ?? null
    return optionCheck(pending, action)
  },
  handle(ctx, action, pending): Rejection | void {
    const s = ctx.state
    if (s.phaseState.attack && !MINE.has(pending.kind)) return attackService.handler.handle(ctx, action, pending)
    if (action.type === 'pass') {
      if (pending.kind === 'chooseUnitToActivate') { s.step = 'reinforcements'; return }
      if (pending.kind === 'deployUnit') { writeMark(s, 'mv:arriveUnit', null); return } // stays in reserve
      return { code: 'E_NOT_AN_OPTION', reason: `movement: pass is not valid for ${pending.kind}` }
    }
    if (pending.kind === 'chooseUnitToActivate' && action.type === 'chooseUnitToActivate') {
      if (!s.phaseState.activated.includes(action.unitId)) s.phaseState.activated.push(action.unitId)
      writeMark(s, 'mv:cur', action.unitId)
      return
    }
    if (pending.kind === 'declareMove' && action.type === 'declareMove') {
      setMoveType(s, action.unitId, action.moveType)
      ctx.emit({ type: 'MoveDeclared', unitId: action.unitId, moveType: action.moveType, player: action.player })
      return
    }
    if (pending.kind === 'moveUnit' && action.type === 'moveUnit') {
      writeMark(s, 'mv:placements', JSON.stringify(action.placements))
      return
    }
    if (pending.kind === 'deployUnit' && action.type === 'deployUnit') {
      const unitId = pending.context.unitIds[0]
      writeMark(s, 'mv:arriveUnit', null)
      if (action.toReserves) return
      const result = resolveArrival(s, unitId, action.placements)
      if (result.rejection) throw new EngineInvariantError('movement: stored arrival placements failed re-validation', { rejection: result.rejection })
      for (const r of result.resolved) setModelPos(s.models[r.model.id], r.to, r.facing)
      const u = s.units[unitId]
      u.location = 'board'
      u.setUpTurn = { round: s.round, player: u.player } // CORE-6.13
      u.turn.arrivedThisTurn = true
      u.turn.usedCoreThisPhase = true
      if (!s.phaseState.activated.includes(unitId)) s.phaseState.activated.push(unitId)
      if (u.reserveArrival) s.players[u.player].abilityUses.push({ abilityId: u.reserveArrival, unitId, round: s.round, turn: s.activePlayer, phase: 'movement' })
      ctx.emit({ type: 'ReinforcementsArrived', unitId, via: 'deepStrike', player: u.player })
      return
    }
    return notImplementedHandle('movement')(ctx, action, pending)
  },
}

