// Spearhead pre-battle sequence and deployment (SPH-4, SPH-5.2, SPH-7). Phase 'setup' raises, in this order, one decision
// each (a step is skipped when GameSetup / PlayerSetup pre-fills it, SPH-16.5): chooseAttacker (the roll-off winner),
// armyOptions (attacker, then defender), battlefieldSide (defender), deploymentMap (defender: which territory is theirs),
// placeTerrain (defender large + small, attacker large + small; only when the terrain layout has no pieces). Phase
// 'deployment' lets the attacker set up the whole army, then the defender (SPH-7.1); every model must be wholly in friendly
// territory and more than 6" from enemy territory (SPH-7.2). The round-1 first-turn choice is raised by the reducer.
import {
  baseEdgePoints, basesOverlap, checkPlacements, EPS, emptyMoveConstraints, horizontalGap, isOversizeForZone, isRound, oversizeEdgePlacementOk,
  pointInPolygon, pointToPolygonEdge, snapToBattlefieldEdge, whollyOnBoard, whollyWithinOfPolygon, whollyWithinPolygon,
  type Footprint, type ResolvedPlacement,
} from './geometry'
import type { EngineContext, PhaseModule } from './modules'
import { otherPlayer } from './modules'
import { getDataBundle } from './reducer'
import { deployTerrainBlock } from './terrain'
import { assignSides, boardModelsOf, deploymentZone, hasDeepStrike, setModelPos, territoryOf, unitModels } from './state'
import type { TerrainTrait } from '../data/types'
import type { Action, DeployUnitAction, ModelPlacement } from './actions'
import type {
  Board, DeployUnitDecision, GameState, Model, ModelId, MoveConstraints, PlayerId, Polygon, Rejection, RuntimeAbility,
  TerrainPiece, Unit, UnitId, Vec2, Vec3,
} from './types'

// R-1.4: each player rolls 1D6, higher wins, ties re-roll; never modified or re-rolled
export function rollOff(ctx: EngineContext, purpose: 'rollOff' | 'firstTurn' = 'rollOff'): PlayerId {
  for (let i = 0; i < 1000; i++) {
    const a = ctx.roll({ purpose, player: 'A', commandRerollable: false }).dice[0]
    const b = ctx.roll({ purpose, player: 'B', commandRerollable: false }).dice[0]
    if (a !== b) return a > b ? 'A' : 'B'
  }
  throw new Error('rollOff: no winner after 1000 rounds')
}

function sidesChosen(state: GameState): boolean { return state.players.A.side !== null }
function attackerOf(state: GameState): PlayerId { return state.players.A.side === 'attacker' ? 'A' : 'B' }

// kept for the 40k tests that still import it (Deep Strike no longer exists in Spearhead)
export function unitCanDeepStrike(state: GameState, unit: Unit): boolean { return hasDeepStrike(state, unit.id) || unit.deepStrikeWith !== null }

// ---------- polygon helpers (terrain placement, SPH-5.2; territory buffer, SPH-7.2) ----------
const segmentsCross = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
  const o = (p: Vec2, q: Vec2, r: Vec2): number => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

// smallest distance between two simple polygons, 0 when they touch, cross or one contains the other
export function polygonGap(a: Polygon, b: Polygon): number {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return 0
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return 0
  }
  let best = Infinity
  for (const p of a) best = Math.min(best, pointToPolygonEdge(p, b))
  for (const p of b) best = Math.min(best, pointToPolygonEdge(p, a))
  return best
}

// horizontal gap between a base and a polygon (0 when they overlap)
function baseGapToPolygon(fp: Footprint, poly: Polygon): number {
  if (pointInPolygon(fp.pos, poly)) return 0
  if (isRound(fp.base)) return Math.max(0, pointToPolygonEdge(fp.pos, poly) - fp.base.radius)
  const edge = baseEdgePoints(fp)
  if (edge.some((p) => pointInPolygon(p, poly))) return 0
  return Math.min(...edge.map((p) => pointToPolygonEdge(p, poly)))
}

// ---------- Patrol Squads (Tyranid Termagants) ----------
// Deals a unit's models into parts of the given sizes. Models with the same loadout (datasheet model + weapon list) form a
// group; each group is shared across the parts in proportion to the room they have left, in model order, so a unit with
// mixed wargear (Deathwatch Intercessors: 2 grenadiers + a sergeant) gets one of each special model per half instead of
// the second half taking both. A unit whose models are all alike is cut in plain model order.
function dealSquadModels(state: GameState, modelIds: ModelId[], sizes: number[]): ModelId[][] {
  const sig = (id: ModelId): string => `${state.models[id].datasheetModelId}|${state.models[id].weapons.join(',')}`
  const groups: ModelId[][] = []
  const bySig = new Map<string, ModelId[]>()
  for (const id of modelIds) {
    const k = sig(id)
    let g = bySig.get(k)
    if (!g) { g = []; bySig.set(k, g); groups.push(g) }
    g.push(id)
  }
  const room = [...sizes]
  const dealt: ModelId[][] = sizes.map(() => [])
  for (const g of groups) {
    const totalRoom = room.reduce((a, b) => a + b, 0)
    const quota = room.map((r) => (g.length * r) / totalRoom)
    const take = quota.map((q, i) => Math.min(room[i], Math.floor(q)))
    let left = g.length - take.reduce((a, b) => a + b, 0)
    const order = quota.map((q, i) => i).sort((a, b) => (quota[b] - Math.floor(quota[b])) - (quota[a] - Math.floor(quota[a])) || a - b)
    for (let pass = 0; left > 0 && pass < g.length * sizes.length; pass++) {
      const i = order[pass % order.length]
      if (take[i] < room[i]) { take[i]++; left-- }
    }
    let at = 0
    take.forEach((n, i) => { dealt[i].push(...g.slice(at, at + n)); at += n; room[i] -= n })
  }
  // keep each part in the unit's own model order
  const rank = new Map(modelIds.map((id, i) => [id, i]))
  return dealt.map((d) => d.sort((a, b) => rank.get(a)! - rank.get(b)!))
}

// keeps `unitId` for the first sizes[0] models and moves the rest into new units `${unitId}~a`, `~b`, … (sizes[i] models each);
// every unit gets startingStrength = its size. Only legal while the unit is still in Reserves-to-be-deployed (before setup).
// Returns the ids in order. A size list that does not add up to the unit's model count leaves the unit untouched ([unitId]).
export function splitPatrolSquad(state: GameState, unitId: UnitId, sizes: number[]): UnitId[] {
  const unit = state.units[unitId]
  if (!unit || sizes.length < 2 || sizes.some((n) => n < 1) || sizes.reduce((a, b) => a + b, 0) !== unit.models.length) return [unitId]
  const ids: UnitId[] = [unitId]
  const parts = dealSquadModels(state, unit.models, sizes)
  unit.models = parts[0]
  unit.startingStrength = sizes[0]
  for (let i = 1; i < sizes.length; i++) {
    const id: UnitId = `${unitId}~${String.fromCharCode(96 + i)}`
    const mine = parts[i]
    const copy: Unit = structuredClone(unit)
    copy.id = id
    copy.ref = `${unit.ref}~${String.fromCharCode(96 + i)}`
    copy.models = mine
    copy.startingStrength = sizes[i]
    copy.isWarlord = false
    copy.enhancementId = null
    copy.attachedLeaderId = null
    copy.bodyguardUnitId = null
    copy.destroyedModels = []
    copy.effects = []
    for (const mid of mine) state.models[mid].unitId = id
    state.units[id] = copy
    ids.push(id)
  }
  return ids
}

// a unit's deployment decision has been taken (placed on the board)
function dropMark(unitId: UnitId): string { return `deployDrop:${unitId}` }
function hasDropped(state: GameState, unitId: UnitId): boolean { return state.phaseState.marks.includes(dropMark(unitId)) }
function markDropped(state: GameState, unitId: UnitId): void {
  if (!hasDropped(state, unitId)) state.phaseState.marks.push(dropMark(unitId))
}

// units that still have to be set up: not placed yet and not arriving from reserve (SPH-7.3)
function remainingToDeploy(state: GameState, player: PlayerId): UnitId[] {
  const reservedRefs = new Set(state.setup.players[player].reserves ?? [])
  return Object.values(state.units)
    .filter((u) => u.player === player && u.location === 'reserves' && !u.reserveArrival && !reservedRefs.has(u.ref) && !hasDropped(state, u.id))
    .map((u) => u.id)
}

// SPH-7.1: the attacker sets up the whole army first, then the defender
function deploymentTurnPlayer(state: GameState): PlayerId | null {
  const attacker = attackerOf(state)
  if (remainingToDeploy(state, attacker).length > 0) return attacker
  const defender = otherPlayer(attacker)
  if (remainingToDeploy(state, defender).length > 0) return defender
  return null
}

// SPH-7.2: more than 6" from enemy territory (strictly), on top of the deploy polygon from the data
export const TERRITORY_BUFFER = 6

function territoryProblem(state: GameState, player: PlayerId, placed: Footprint[]): Rejection | null {
  if (!state.mission.data.territories) return null
  const own = territoryOf(state, player)
  const enemy = territoryOf(state, otherPlayer(player))
  for (const fp of placed) {
    if (!whollyWithinOfPolygon(fp, own, 1e-3)) return { code: 'E_TERRITORY', reason: 'every model must be set up wholly within friendly territory' }
    if (baseGapToPolygon(fp, enemy) <= TERRITORY_BUFFER + EPS) return { code: 'E_TERRITORY', reason: `every model must be set up more than ${TERRITORY_BUFFER}" from enemy territory` }
  }
  return null
}

// shared by validate() and handle(): resolves + checks a deployUnit answer without mutating state
function resolveDeploy(
  state: GameState, action: DeployUnitAction, pending: DeployUnitDecision,
): { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  if (!pending.context.unitIds.includes(action.unitId)) {
    return { rejection: { code: 'E_WRONG_PLAYER', reason: `it is not ${pending.player}'s turn to deploy ${action.unitId}`, details: { unitId: action.unitId } } }
  }
  const unit = state.units[action.unitId]
  if (!unit) return { rejection: { code: 'E_SCHEMA', reason: `unknown unit ${action.unitId}` } }
  if (action.toReserves) return { rejection: { code: 'E_NOT_AN_OPTION', reason: 'units cannot be put in reserve at deployment (only units that arrive by an ability start there)' } }
  return resolveDeployCore(state, pending.player, unit.id, action.placements, pending.constraints, [])
}

// the geometry half of resolveDeploy; `extraFriendly` are models treated as already standing there (suggestDeployment plans several units ahead)
function resolveDeployCore(
  state: GameState, player: PlayerId, unitId: UnitId, placements: ModelPlacement[], constraints: MoveConstraints, extraFriendly: Model[],
): { rejection: Rejection } | { rejection: null; resolved: ResolvedPlacement[] } {
  const unit = state.units[unitId]
  const result = checkPlacements({
    unitModels: unitModels(state, unit.id),
    placements,
    constraints,
    otherFriendly: [...boardModelsOf(state, player), ...extraFriendly],
    enemies: boardModelsOf(state, otherPlayer(player)),
    board: state.board,
    coherencyRange: state.datasheets[unit.datasheetId]?.coherencyRange,
  })
  if (result.rejection) return { rejection: result.rejection }
  const territory = territoryProblem(state, player, result.resolved.map((r) => ({ pos: r.to, facing: r.facing, base: r.model.base })))
  if (territory) return { rejection: territory }
  for (const r of result.resolved) {
    const blocked = deployTerrainBlock(state, r.model, r.to, r.facing)
    if (blocked) return { rejection: { code: 'E_OVERLAP', reason: `${r.model.id} ${blocked}`, details: { modelId: r.model.id } } }
  }
  return { rejection: null, resolved: result.resolved }
}

// facing for a freshly deployed model: from the zone's centre toward the board centre (the origin), snapped to an axis,
// so a deployed unit looks across the board at the enemy rather than keeping the default facing 0
export function deployFacing(zone: Polygon): number {
  const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cz = (Math.max(...zs) + Math.min(...zs)) / 2
  if (Math.abs(cx) >= Math.abs(cz)) return cx > 0 ? Math.PI : 0
  return cz > 0 ? -Math.PI / 2 : Math.PI / 2
}

// a simple, always-legal placement for `unitId`'s models wholly within `zone` and clear of everything already placed —
// used by legalActions() so a generic Decider (AI, autoplay tests) can drive deployUnit without solving placement
// itself; returns null only if the zone genuinely has no room left (raster scan of its bounding box)
export function autoDeployPlacements(
  models: Model[], zone: Polygon, otherFriendly: Model[], enemies: Model[],
  opts: { mustTouch?: MoveConstraints['mustTouch']; minDistanceFromEnemies?: number; canPlace?: (model: Model, pos: Vec3, facing?: number) => boolean; board?: Pick<Board, 'w' | 'h'> } = {},
): ModelPlacement[] | null {
  if (opts.mustTouch) return touchingPlacements(models, zone, otherFriendly, enemies, opts.mustTouch, opts.minDistanceFromEnemies ?? 0, opts.canPlace)
  const facing = deployFacing(zone)
  // a small inward safety pad keeps candidates well clear of the zone/board edge, avoiding floating-point boundary
  // ambiguity in pointInPolygon (exact edge points are not reliably "inside" under ray-casting)
  const pad = 0.05
  const minX = Math.min(...zone.map((p) => p.x)) + pad, maxX = Math.max(...zone.map((p) => p.x)) - pad
  const minZ = Math.min(...zone.map((p) => p.z)) + pad, maxZ = Math.max(...zone.map((p) => p.z)) - pad
  const placedHere: Footprint[] = []
  const out: ModelPlacement[] = []
  for (const m of models) {
    // an oval is much longer than it is wide: a fine x step keeps the next one within coherency of the last (the overlap test skips taken spots)
    const step = m.base.radius2 !== undefined ? 0.25 : Math.max(0.5, m.base.radius * 2 + 0.1)
    let found: { x: number; z: number; facing: number } | null = null
    // Rules Commentary "Deploying Units": a base too big for the zone goes touching the battlefield edge instead
    if (opts.board && isOversizeForZone(m.base, zone)) {
      const edge = edgeDeployPlacement(m, zone, opts.board, [...placedHere, ...otherFriendly, ...enemies], opts.canPlace)
      if (!edge) return null
      placedHere.push({ pos: edge.pos, facing: edge.facing, base: m.base })
      out.push({ modelId: m.id, pos: edge.pos, facing: edge.facing })
      continue
    }
    // an oval base is narrower than its long radius: scan with the short radius and also try it turned a quarter, whollyWithinPolygon
    // below decides the fit (a 150x90 mm Rockgrinder does not fit a 5" deep zone broadside but does lengthways)
    const rScan = Math.min(m.base.radius, m.base.radius2 ?? m.base.radius)
    const facings = m.base.radius2 !== undefined ? [facing, facing + Math.PI / 2] : [facing]
    const stepZ = m.base.radius2 !== undefined ? 0.5 : step // a coarse row step would skip the gap beside a packed row of smaller models
    for (const f of facings) {
      for (let z = minZ + rScan; z <= maxZ - rScan + 1e-9 && !found; z += stepZ) {
        for (let x = minX + rScan; x <= maxX - rScan + 1e-9 && !found; x += step) {
          const cand: Footprint = { pos: { x, y: 0, z }, facing: f, base: m.base }
          if (!whollyWithinPolygon(cand, zone)) continue
          if (placedHere.some((o) => basesOverlap(cand, o)) || otherFriendly.some((o) => basesOverlap(cand, o)) || enemies.some((o) => basesOverlap(cand, o))) continue
          if (opts.canPlace && !opts.canPlace(m, cand.pos, f)) continue
          found = { x, z, facing: f }
        }
      }
      if (found) break
    }
    if (!found) return null
    const footprint: Footprint = { pos: { x: found.x, y: 0, z: found.z }, facing: found.facing, base: m.base }
    placedHere.push(footprint)
    out.push({ modelId: m.id, pos: footprint.pos, facing: found.facing })
  }
  return out
}

// a spot for an oversize model: its base touching the player's battlefield edge, centre inside the zone, clear of `blockers` and
// terrain; scans along the edge from one end of the zone's span to the other (the bounding box is used, the edge helper decides)
function edgeDeployPlacement(
  m: Model, zone: Polygon, board: Pick<Board, 'w' | 'h'>, blockers: Footprint[], canPlace?: (model: Model, pos: Vec3, facing?: number) => boolean,
): { pos: Vec3; facing: number } | null {
  const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const base = deployFacing(zone)
  const facings = m.base.radius2 !== undefined ? [base, base + Math.PI / 2] : [base]
  for (const f of facings) {
    for (let z = minZ; z <= maxZ + 1e-9; z += 0.5) {
      for (let x = minX; x <= maxX + 1e-9; x += 0.5) {
        const snapped = snapToBattlefieldEdge({ pos: { x, y: 0, z }, facing: f, base: m.base }, zone, board)
        const cand: Footprint = { pos: { x: snapped.x, y: 0, z: snapped.z }, facing: f, base: m.base }
        if (!oversizeEdgePlacementOk(cand, zone, board) || !whollyOnBoard(cand, board)) continue
        if (blockers.some((o) => basesOverlap(cand, o))) continue
        if (canPlace && !canPlace(m, cand.pos, f)) continue
        return { pos: cand.pos, facing: f }
      }
    }
  }
  return null
}

// Cult Ambush (GEN-2.3) placement: the first model sits tangent to the marker (tried at 24 angles), the rest grow into a
// compact blob around it, nearest the marker first (so coherency holds); every spot is wholly in `zone`, clear of everything
// placed and more than `minEnemy`" from enemy models. null = no angle works.
function touchingPlacements(
  models: Model[], zone: Polygon, otherFriendly: Model[], enemies: Model[], marker: NonNullable<MoveConstraints['mustTouch']>, minEnemy: number,
  canPlace?: (model: Model, pos: Vec3) => boolean,
): ModelPlacement[] | null {
  if (models.length === 0) return null
  const facing = deployFacing(zone)
  const blockers: Footprint[] = [...otherFriendly, ...enemies]
  const rOf = (m: Model): number => Math.max(m.base.radius, m.base.radius2 ?? 0)
  const free = (c: Footprint, mine: Footprint[], m: Model): boolean =>
    whollyWithinPolygon(c, zone) && !mine.some((o) => basesOverlap(c, o)) && !blockers.some((o) => basesOverlap(c, o))
    && (!canPlace || canPlace(m, c.pos)) && (minEnemy <= 0 || !enemies.some((e) => horizontalGap(c, e) <= minEnemy + 1e-3))
  const dist2 = (a: { x: number; z: number }): number => Math.hypot(a.x - marker.pos.x, a.z - marker.pos.z)
  for (let k = 0; k < 24; k++) {
    const a0 = (k * 2 * Math.PI) / 24
    const d0 = marker.radius + rOf(models[0]) + 0.02
    const first: Footprint = { pos: { x: marker.pos.x + Math.cos(a0) * d0, y: 0, z: marker.pos.z + Math.sin(a0) * d0 }, facing, base: models[0].base }
    if (!free(first, [], models[0])) continue
    const mine: Footprint[] = [first]
    let ok = true
    for (let i = 1; i < models.length && ok; i++) {
      let best: Footprint | null = null
      let bestD = Infinity
      for (const anchor of mine) {
        const ar = Math.max(anchor.base.radius, anchor.base.radius2 ?? 0)
        const dd = ar + rOf(models[i]) + 0.05
        for (let a = 0; a < 24; a++) {
          const ang = (a * 2 * Math.PI) / 24
          const cand: Footprint = { pos: { x: anchor.pos.x + Math.cos(ang) * dd, y: 0, z: anchor.pos.z + Math.sin(ang) * dd }, facing, base: models[i].base }
          const d = dist2(cand.pos)
          if (d < bestD && free(cand, mine, models[i])) { best = cand; bestD = d }
        }
      }
      if (!best) ok = false
      else mine.push(best)
    }
    if (ok) return models.map((m, i) => ({ modelId: m.id, pos: mine[i].pos, facing }))
  }
  return null
}

// last-resort placement search for crowded or shallow zones: start each model chain at a fine grid spot, then grow the unit
// outward from already-placed models (rings of candidate spots a hair apart), so lines, zig-zags and diagonals are all reachable.
// Returns the first chain the caller's check accepts (the caller runs the real validation: coherency, overlaps, region).
export function chainDeployPlacements(
  models: Model[], zone: Polygon, otherFriendly: Model[], enemies: Model[], accept: (p: ModelPlacement[]) => boolean,
  canPlace?: (model: Model, pos: Vec3, facing?: number) => boolean,
): ModelPlacement[] | null {
  if (models.length === 0) return null
  const facing = deployFacing(zone)
  const xs = zone.map((p) => p.x), zs = zone.map((p) => p.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const blockers: Footprint[] = [...otherFriendly, ...enemies]
  const free = (c: Footprint, mine: Footprint[], m: Model): boolean =>
    whollyWithinPolygon(c, zone) && !mine.some((o) => basesOverlap(c, o)) && !blockers.some((o) => basesOverlap(c, o))
    && (!canPlace || canPlace(m, c.pos, c.facing))
  const rOf = (m: Model): number => Math.max(m.base.radius, m.base.radius2 ?? 0)
  const angles: number[] = []
  for (let a = 0; a < 360; a += 10) angles.push((a * Math.PI) / 180)
  for (let z = minZ; z <= maxZ + 1e-9; z += 0.5) {
    for (let x = minX; x <= maxX + 1e-9; x += 0.5) {
      const first: Footprint = { pos: { x, y: 0, z }, facing, base: models[0].base }
      if (!free(first, [], models[0])) continue
      const mine: Footprint[] = [first]
      let ok = true
      for (let i = 1; i < models.length && ok; i++) {
        let placed: Footprint | null = null
        // prefer the latest-placed models as anchors so the unit snakes along the zone
        for (let k = mine.length - 1; k >= 0 && !placed; k--) {
          const anchor = mine[k]
          const anchorR = Math.max(anchor.base.radius, anchor.base.radius2 ?? 0)
          for (const extra of [0.05, 0.5, 1.2]) {
            const dist = anchorR + rOf(models[i]) + extra
            for (const a of angles) {
              const cand: Footprint = { pos: { x: anchor.pos.x + Math.cos(a) * dist, y: 0, z: anchor.pos.z + Math.sin(a) * dist }, facing, base: models[i].base }
              if (free(cand, mine, models[i])) { placed = cand; break }
            }
            if (placed) break
          }
        }
        if (!placed) ok = false
        else mine.push(placed)
      }
      if (!ok) continue
      const out = mine.map((f, i) => ({ modelId: models[i].id, pos: f.pos, facing }))
      if (accept(out)) return out
    }
  }
  return null
}

// ---------- terrain (SPH-5) ----------
export type TerrainSize = 'large' | 'small'

// SPH-5.3 and the default footprints of SPH-5 (not in the sources; data-free defaults)
const TERRAIN_SPEC: Record<TerrainSize, { w: number; d: number; height: number; kind: TerrainPiece['kind']; traits: TerrainTrait[] }> = {
  large: { w: 5, d: 3, height: 4, kind: 'ruin', traits: ['cover', 'obscuring', 'unstable'] },
  small: { w: 3, d: 2, height: 2, kind: 'crate', traits: ['cover', 'unstable'] },
}
export const TERRAIN_GRID = 0.5
const TERRAIN_FEATURE_GAP = 6
const TERRAIN_EDGE_GAP = 3

// who sets up what, in order (SPH-4.5, SPH-5.1): the defender's large and small, then the attacker's
const TERRAIN_ORDER: { who: 'defender' | 'attacker'; size: TerrainSize }[] = [
  { who: 'defender', size: 'large' }, { who: 'defender', size: 'small' }, { who: 'attacker', size: 'large' }, { who: 'attacker', size: 'small' },
]

export function terrainPieceAt(owner: PlayerId, size: TerrainSize, x: number, z: number): TerrainPiece {
  const spec = TERRAIN_SPEC[size]
  const hw = spec.w / 2, hd = spec.d / 2
  const walls = size === 'large'
    ? [
      { a: { x: x - hw, z: z - hd }, b: { x: x + hw, z: z - hd }, height: spec.height },
      { a: { x: x - hw, z: z - hd }, b: { x: x - hw, z: z + hd }, height: spec.height },
    ]
    : []
  return {
    id: `tf.${owner}-${size}`, kind: spec.kind, pos: { x, z }, rot: 0,
    footprint: [{ x: x - hw, z: z - hd }, { x: x + hw, z: z - hd }, { x: x + hw, z: z + hd }, { x: x - hw, z: z + hd }],
    height: spec.height, traits: spec.traits, walls, floors: [],
  }
}

// SPH-5.2: why `piece` may not be set up by `owner` (null = legal)
export function terrainPlacementProblem(state: GameState, owner: PlayerId, piece: TerrainPiece): string | null {
  const own = territoryOf(state, owner)
  const enemy = territoryOf(state, otherPlayer(owner))
  const inOrOn = (p: Vec2): boolean => pointInPolygon(p, own) || pointToPolygonEdge(p, own) <= 1e-6
  if (!piece.footprint.every(inOrOn)) return 'it must be wholly within your own territory'
  const { w, h } = state.board
  const xs = piece.footprint.map((p) => p.x), zs = piece.footprint.map((p) => p.z)
  if (w >= h) {
    if (Math.min(...zs) <= -h / 2 + TERRAIN_EDGE_GAP + EPS || Math.max(...zs) >= h / 2 - TERRAIN_EDGE_GAP - EPS) return 'it must be more than 3" from both long edges'
  } else if (Math.min(...xs) <= -w / 2 + TERRAIN_EDGE_GAP + EPS || Math.max(...xs) >= w / 2 - TERRAIN_EDGE_GAP - EPS) return 'it must be more than 3" from both long edges'
  if (polygonGap(piece.footprint, enemy) <= TERRAIN_EDGE_GAP + EPS) return 'it must be more than 3" from enemy territory'
  for (const other of Object.values(state.board.pieces)) {
    if (other.id !== piece.id && polygonGap(piece.footprint, other.footprint) <= TERRAIN_FEATURE_GAP + EPS) return 'it must be more than 6" from every other terrain feature'
  }
  for (const obj of Object.values(state.objectives)) {
    const d = pointInPolygon(obj.pos, piece.footprint) ? 0 : pointToPolygonEdge(obj.pos, piece.footprint)
    if (d < obj.radius - EPS) return 'it may not overlap an objective circle'
  }
  return null
}

// legal centres on a 0.5" grid (SPH-5.2)
export function terrainOptions(state: GameState, owner: PlayerId, size: TerrainSize): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  const { w, h } = state.board
  for (let z = -h / 2; z <= h / 2 + EPS; z += TERRAIN_GRID) {
    for (let x = -w / 2; x <= w / 2 + EPS; x += TERRAIN_GRID) {
      if (terrainPlacementProblem(state, owner, terrainPieceAt(owner, size, x, z)) === null) out.push({ x, z })
    }
  }
  return out
}

// ---------- pre-battle decisions ----------
const optionAction = (player: PlayerId, optionId: string) => ({ type: 'chooseOption' as const, player, decisionId: '', optionId })

// SPH-4.2: the regiment abilities `player` can still pick (needs the registered data bundle; pre-filled = none)
function regimentOptions(state: GameState, player: PlayerId): { id: string; name: string }[] {
  if (state.setup.players[player].regimentAbilityId !== undefined) return []
  const bundle = getDataBundle()
  const regs = bundle?.patrols[state.players[player].patrolId]?.regimentAbilities ?? []
  if (!bundle || regs.length < 2) return []
  return regs.map((r) => ({ id: r.id, name: bundle.abilities[r.id]?.name ?? r.id }))
}

// SPH-4.3: only sides the loaded battleplan can play (named in its id); both when it names neither
function sideOptions(state: GameState): string[] {
  const named = ['aqshy', 'ghyran'].filter((side) => state.mission.data.id.includes(side))
  return named.length > 0 ? named : ['aqshy', 'ghyran']
}

function preBattle(ctx: EngineContext): 'pending' | 'done' {
  const s = ctx.state
  const attacker = attackerOf(s)
  const defender = otherPlayer(attacker)
  const window = 'deployment.unit' as const

  // SPH-4.2 army options, attacker first
  for (const p of [attacker, defender]) {
    if (!ctx.once(`pre:army:${p}`)) continue
    const opts = regimentOptions(s, p)
    if (opts.length < 2) continue
    ctx.decide({
      kind: 'chooseOption', player: p, window, canPass: false,
      context: { topic: 'armyOptions', unitId: null, abilityId: null, data: { player: p, regiments: opts.map((o) => o.id) } },
      options: opts.map((o) => ({ id: o.id, label: o.name, action: optionAction(p, o.id) })),
    })
    return 'pending'
  }

  // SPH-4.3 battlefield side
  if (ctx.once('pre:side')) {
    if (s.setup.side !== undefined) s.mission.custom.side = s.setup.side
    else {
      ctx.decide({
        kind: 'chooseOption', player: defender, window, canPass: false,
        context: { topic: 'battlefieldSide', unitId: null, abilityId: null, data: {} },
        options: sideOptions(s).map((side) => ({ id: side, label: side === 'aqshy' ? 'Aqshy (Realm of Fire)' : 'Ghyran (Realm of Life)', action: optionAction(defender, side) })),
      })
      return 'pending'
    }
  }

  // SPH-4.4 deployment map: the defender picks which territory is theirs (the loaded battleplan fixes the map itself)
  if (ctx.once('pre:map') && s.setup.defenderTerritory === undefined) {
    ctx.decide({
      kind: 'chooseOption', player: defender, window, canPass: false,
      context: { topic: 'deploymentMap', unitId: null, abilityId: null, data: {} },
      options: (['A', 'B'] as const).map((t) => ({ id: t, label: `Territory ${t}`, action: optionAction(defender, t) })),
    })
    return 'pending'
  }

  // SPH-4.5 terrain: only when the layout is empty (a layout with pieces is a pre-filled one)
  if (ctx.once('pre:terrain') && Object.keys(s.board.pieces).length === 0) s.phaseState.marks.push('pre:terrain:on')
  if (ctx.marked('pre:terrain:on')) {
    for (let i = 0; i < TERRAIN_ORDER.length; i++) {
      if (ctx.marked(`pre:terrain:${i}`)) continue
      const spec = TERRAIN_ORDER[i]
      const owner = spec.who === 'defender' ? defender : attacker
      const options = terrainOptions(s, owner, spec.size)
      if (options.length === 0) { ctx.once(`pre:terrain:${i}`); continue }
      ctx.decide({
        kind: 'chooseOption', player: owner, window, canPass: false,
        context: { topic: 'placeTerrain', unitId: null, abilityId: null, data: { index: i, size: spec.size, owner } },
        options: options.map((o) => ({ id: `${o.x},${o.z}`, label: `${spec.size} terrain at (${o.x}, ${o.z})`, action: optionAction(owner, `${o.x},${o.z}`) })),
      })
      return 'pending'
    }
  }
  return 'done'
}

// ---------- compact placement and the deployment suggestion ----------
// hardest-to-fit first: biggest base, then most models
function biggestFirst(state: GameState, ids: UnitId[]): UnitId[] {
  const size = (id: UnitId): [number, number] => {
    const ms = unitModels(state, id)
    return [Math.max(0, ...ms.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0))), ms.length]
  }
  return [...ids].sort((a, b) => { const [ra, na] = size(a), [rb, nb] = size(b); return rb - ra || nb - na })
}

// A placement for one unit wholly inside `zone` and clear of everything on the table plus `extra` (models planned earlier), or
// null when it has no room: a raster scan first, then a compact block slid across the zone (the raster can wrap a unit across a row
// gap, out of coherency), then a model-by-model chain from fine-grid starts for shallow or crowded zones. `accept` is the real
// validation (coherency, territory, terrain), so what comes back is always a legal answer.
function compactPlacement(
  state: GameState, player: PlayerId, unitId: UnitId, zone: Polygon, extra: Model[], accept: (p: ModelPlacement[]) => boolean,
): ModelPlacement[] | null {
  const models = unitModels(state, unitId)
  if (models.length === 0) return null
  const friendly = [...boardModelsOf(state, player), ...extra]
  const enemies = boardModelsOf(state, otherPlayer(player))
  const canPlace = (m: Model, pos: Vec3, f?: number): boolean => deployTerrainBlock(state, m, pos, f ?? m.facing) === null
  const raster = autoDeployPlacements(models, zone, friendly, enemies, { canPlace, board: state.board })
  if (raster && accept(raster)) return raster
  const rad = Math.max(...models.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
  const spacing = 2 * rad + 0.2
  const minX = Math.min(...zone.map((p) => p.x)), maxX = Math.max(...zone.map((p) => p.x))
  const minZ = Math.min(...zone.map((p) => p.z)), maxZ = Math.max(...zone.map((p) => p.z))
  const facing = deployFacing(zone)
  for (let cols = Math.ceil(Math.sqrt(models.length)); cols <= models.length; cols++) {
    for (let z0 = minZ + rad + 0.1; z0 < maxZ; z0 += 1) {
      for (let x0 = minX + rad + 0.1; x0 < maxX; x0 += 1) {
        const block = models.map((m, i) => ({ modelId: m.id, pos: { x: x0 + (i % cols) * spacing, y: 0, z: z0 + Math.floor(i / cols) * spacing }, facing }))
        if (accept(block)) return block
      }
    }
  }
  return chainDeployPlacements(models, zone, friendly, enemies, accept, canPlace)
}

export interface DeploySuggestion {
  unitId: UnitId
  placements: ModelPlacement[]
  // true when every unit still to deploy was also given a spot after this one (nobody is boxed out)
  fitsAll: boolean
  // the plan the suggestion comes from: this unit first, then the rest biggest-first
  order: UnitId[]
}

// Where to put `unitId` (default: the biggest unit still to deploy) so the units after it still fit. It plans the whole remaining
// army in order, the asked-for unit first and the others biggest-first, each into the first legal spot left by the ones before, and
// reports whether all of them found one. A human who drops small units in the middle of a 5" deep strip can strand a big base;
// following this suggestion cannot. Null when it is nobody's turn to deploy, the unit is not waiting, or it has no legal spot at all.
export function suggestDeployment(state: GameState, unitId?: UnitId): DeploySuggestion | null {
  if (state.phase !== 'deployment') return null
  const player = unitId ? state.units[unitId]?.player ?? null : deploymentTurnPlayer(state)
  if (!player) return null
  const waiting = remainingToDeploy(state, player)
  const first = unitId ?? biggestFirst(state, waiting)[0]
  if (!first || !waiting.includes(first)) return null
  const zone = deploymentZone(state, player)
  const constraints = emptyMoveConstraints(1e9, { region: zone, mustEndOutsideEngagement: false })
  const order = [first, ...biggestFirst(state, waiting.filter((id) => id !== first))]
  const extra: Model[] = []
  let firstPlacement: ModelPlacement[] | null = null
  let fitsAll = true
  for (const id of order) {
    const found = compactPlacement(state, player, id, zone, extra, (p) => resolveDeployCore(state, player, id, p, constraints, extra).rejection === null)
    if (!found) { if (id === first) return null; fitsAll = false; continue }
    if (id === first) firstPlacement = found
    for (const p of found) {
      const m = state.models[p.modelId]
      extra.push({ ...m, pos: p.pos, facing: p.facing ?? m.facing })
    }
  }
  return firstPlacement ? { unitId: first, placements: firstPlacement, fitsAll, order } : null
}

// ---------- the module ----------
export const setupModule: PhaseModule = {
  name: 'setup',

  enter(ctx) {
    ctx.state.step = ctx.state.phase === 'setup' ? 'rollOffSides' : 'deploy'
  },

  advance(ctx) {
    const s = ctx.state
    for (;;) {
      switch (s.step) {
        // ---- phase 'setup' ----
        case 'rollOffSides': {
          if (sidesChosen(s)) { s.step = 'chooseSides'; continue }
          // SPH-4.1: roll-off; the winner decides who is the attacker
          const winner = rollOff(ctx)
          ctx.decide({
            kind: 'chooseOption', player: winner, window: 'deployment.unit', canPass: false,
            context: { topic: 'chooseAttacker', unitId: null, abilityId: null, data: { winner } },
            options: [
              { id: winner, label: 'I will be the attacker', action: optionAction(winner, winner) },
              { id: otherPlayer(winner), label: 'My opponent will be the attacker', action: optionAction(winner, otherPlayer(winner)) },
            ],
          })
          return 'pending'
        }
        case 'chooseSides':
          return preBattle(ctx)
        // ---- phase 'deployment' ----
        case 'deploy': {
          const pid = deploymentTurnPlayer(s)
          if (pid === null) return 'done'
          const unitIds = remainingToDeploy(s, pid)
          ctx.decide({
            kind: 'deployUnit', player: pid, window: 'deployment.unit', canPass: false,
            context: { unitIds, zone: deploymentZone(s, pid), infiltrators: [], reservesAllowed: [] },
            constraints: emptyMoveConstraints(1e9, { region: deploymentZone(s, pid), mustEndOutsideEngagement: false }),
          })
          return 'pending'
        }
        default:
          return 'done'
      }
    }
  },

  validate(state, action, pending) {
    if (pending.kind === 'deployUnit' && action.type === 'deployUnit') return resolveDeploy(state, action, pending).rejection
    return null
  },

  legalActions(state, pending) {
    if (pending.kind === 'deployUnit') {
      // a placement for one unit, or [] if it has no room left anywhere in the zone
      const tryUnit = (unitId: UnitId): Action[] => {
        const zone = pending.context.zone ?? deploymentZone(state, pending.player)
        const found = compactPlacement(state, pending.player, unitId, pending.constraints.region ?? zone, [], (p) => resolveDeploy(state, { type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId, placements: p }, pending).rejection === null)
        return found ? [{ type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId, placements: found }] : []
      }
      // hardest-to-fit first (biggest base, then most models); offer the first unit that actually fits
      const ids = biggestFirst(state, [...pending.context.unitIds])
      for (const id of ids) {
        const found = tryUnit(id)
        if (found.length > 0) return found
      }
      return []
    }
    // every other setup decision is finite: its options (and pass when allowed)
    if ('options' in pending && Array.isArray(pending.options)) {
      const out: Action[] = pending.options.map((o) => o.action)
      if (pending.canPass) out.push({ type: 'pass', player: pending.player, decisionId: pending.id })
      return out
    }
    return null
  },

  handle(ctx, action, pending) {
    const s = ctx.state
    if (pending.kind === 'chooseOption' && action.type === 'chooseOption') {
      const topic = pending.context.topic
      const choice = action.optionId
      if (topic === 'chooseAttacker') {
        if (choice !== 'A' && choice !== 'B') return { code: 'E_NOT_AN_OPTION', reason: 'answer with the player who will be the attacker' }
        assignSides(s, choice)
        ctx.emit({ type: 'SidesChosen', attacker: choice, defender: otherPlayer(choice), player: pending.player })
        return
      }
      if (topic === 'armyOptions') {
        const bundle = getDataBundle()
        const desc = bundle?.abilities[choice]
        if (!desc) return { code: 'E_NOT_AN_OPTION', reason: `regiment ability ${choice} is not available` }
        if (!s.abilities[choice]) s.abilities = { ...s.abilities, [choice]: { ...desc, source: 'regiment', bearerModelId: null } as RuntimeAbility } // shared static table: replace
        s.players[pending.player].regimentAbilityId = choice
        return
      }
      if (topic === 'battlefieldSide') {
        s.mission.custom.side = choice
        return
      }
      if (topic === 'deploymentMap') {
        if (choice !== 'A' && choice !== 'B') return { code: 'E_NOT_AN_OPTION', reason: 'choose territory A or B' }
        s.players[pending.player].territory = choice
        s.players[otherPlayer(pending.player)].territory = choice === 'A' ? 'B' : 'A'
        return
      }
      if (topic === 'placeTerrain') {
        const data = pending.context.data as { index: number; size: TerrainSize; owner: PlayerId }
        const [x, z] = choice.split(',').map(Number)
        if (!Number.isFinite(x) || !Number.isFinite(z)) return { code: 'E_NOT_AN_OPTION', reason: `bad terrain position ${choice}` }
        const piece = terrainPieceAt(data.owner, data.size, x, z)
        const problem = terrainPlacementProblem(s, data.owner, piece)
        if (problem) return { code: 'E_TERRITORY', reason: problem }
        s.board = { ...s.board, pieces: { ...s.board.pieces, [piece.id]: piece } } // the board is a shared static table: replace, never mutate
        ctx.once(`pre:terrain:${data.index}`)
        return
      }
    }
    if (pending.kind === 'deployUnit' && action.type === 'deployUnit') {
      const r = resolveDeploy(s, action, pending)
      if (r.rejection) return r.rejection
      const unit = s.units[action.unitId]
      markDropped(s, unit.id)
      for (const p of r.resolved) setModelPos(p.model, p.to, p.facing)
      unit.location = 'board'
      ctx.emit({ type: 'UnitDeployed', unitId: unit.id, toReserves: false, player: pending.player })
      return
    }
    return { code: 'E_NOT_AN_OPTION', reason: `setup: no handler for ${action.type} at step ${s.step}` }
  },
}
