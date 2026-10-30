// Line of sight, combat range visibility and terrain cover (Spearhead port, WP4: CORE-1.5, CORE-7, CORE-16.3 to 16.6,
// SPH-5.3 to SPH-5.7). Pure queries over state.
//
// [interp] True LoS (CORE-7.1): a straight line from any sample point of the observer to any sample point of the observed
// model (base centre at heights {0.2, h/2, h} plus 4 base-edge points at h/2) that passes through no terrain wall, no solid
// block and no model outside the observer's own unit. Any visible sliver suffices. Objective markers and tokens never block.
// Ruin footprints do NOT block sight by themselves any more (that was a 40k rule): only walls and solid blocks do.
// [interp] "Behind" (CORE-16.4): every straight line from any point of an attacking model's base to any point of a target
// model's base crosses the feature's footprint, ignoring the parts of the footprint within 3" of the attacker's base.
// [interp] Cover / Obscuring: a feature has them via the trait list on the piece ('cover', 'obscuring').
import { baseEdgePoints, dist2D, ENGAGEMENT_H, EPS, pointInPolygon, signedDistanceToBase, whollyWithinPolygon, withinEngagementRange } from './geometry'
import { crateBlocks, wallCrosses3D } from './terrain'
import { leaderService } from './leaders'
import { boardModelsOf, hasKeyword, unitModels } from './state'
import type { GameState, Model, ModelId, RuntimeWeapon, TerrainPiece, UnitId, Vec2, Vec3 } from './types'

// a model (any unit but the observer's own) as a vertical cylinder (elliptical footprint for oval bases) from its ground
// contact height to pos.y + height. The ray blocks whenever ANY point of the 3D segment falls inside that volume.
function modelBlocks(blocker: Model, p1: Vec3, p2: Vec3): boolean {
  const r1 = blocker.base.radius, r2 = blocker.base.radius2 ?? r1
  const c = Math.cos(-blocker.facing), s = Math.sin(-blocker.facing)
  const toLocal = (x: number, z: number) => {
    const dx = x - blocker.pos.x, dz = z - blocker.pos.z
    return { lx: dx * c - dz * s, lz: dx * s + dz * c }
  }
  const P1 = toLocal(p1.x, p1.z), P2 = toLocal(p2.x, p2.z)
  const dlx = P2.lx - P1.lx, dlz = P2.lz - P1.lz
  const r1sq = r1 * r1, r2sq = r2 * r2
  const a = (dlx * dlx) / r1sq + (dlz * dlz) / r2sq
  const b = 2 * ((P1.lx * dlx) / r1sq + (P1.lz * dlz) / r2sq)
  const c2 = (P1.lx * P1.lx) / r1sq + (P1.lz * P1.lz) / r2sq - 1
  let t0: number, t1: number
  if (a < 1e-12) {
    if (c2 > EPS) return false
    t0 = 0; t1 = 1
  } else {
    const disc = b * b - 4 * a * c2
    if (disc < 0) return false
    const sq = Math.sqrt(disc)
    t0 = (-b - sq) / (2 * a)
    t1 = (-b + sq) / (2 * a)
  }
  t0 = Math.max(0, t0); t1 = Math.min(1, t1)
  if (t0 > t1 + EPS) return false
  const y0 = p1.y + (p2.y - p1.y) * t0, y1 = p1.y + (p2.y - p1.y) * t1
  const yLo = Math.min(y0, y1), yHi = Math.max(y0, y1)
  return yHi >= blocker.pos.y - EPS && yLo <= blocker.pos.y + blocker.height + EPS
}

function allBoardModels(state: GameState): Model[] { return [...boardModelsOf(state, 'A'), ...boardModelsOf(state, 'B')] }

// is the 3D segment p1(observer)->p2(observed) blocked by terrain, or by a model whose unit is not in `excludeUnitIds`
// (and is not `toModelId` itself)?
function segmentBlocked(state: GameState, p1: Vec3, p2: Vec3, toModelId: ModelId, excludeUnitIds: ReadonlySet<UnitId>): boolean {
  for (const p of Object.values(state.board.pieces)) {
    for (const w of p.walls) if (wallCrosses3D(w, p1, p2)) return true
    if (p.kind === 'crate' && crateBlocks(p, p1, p2)) return true
  }
  for (const blocker of allBoardModels(state)) {
    if (excludeUnitIds.has(blocker.unitId) || blocker.id === toModelId) continue
    if (modelBlocks(blocker, p1, p2)) return true
  }
  return false
}

function anyClearPair(state: GameState, from: Model, to: Model): boolean {
  const exclude = new Set<UnitId>(leaderService.halves(state, from.unitId))
  const fromPts = losService.samplePoints(from), toPts = losService.samplePoints(to)
  return fromPts.some((fp) => toPts.some((tp) => !segmentBlocked(state, fp, tp, to.id, exclude)))
}

// every one of `to`'s sample points is visible from at least one of `from`'s; the observed unit's own models never block
function everyPointFullyVisible(state: GameState, from: Model, to: Model): boolean {
  const exclude = new Set<UnitId>([...leaderService.halves(state, from.unitId), ...leaderService.halves(state, to.unitId)])
  const fromPts = losService.samplePoints(from), toPts = losService.samplePoints(to)
  return toPts.every((tp) => fromPts.some((fp) => !segmentBlocked(state, fp, tp, to.id, exclude)))
}

// every on-board model of a unit (both halves when attached; no attachments in Spearhead)
function boardModelsOfUnit(state: GameState, unitId: UnitId): Model[] {
  return leaderService.halves(state, unitId).flatMap((id) => (state.units[id]?.location === 'board' ? unitModels(state, id) : []))
}

// ---------- terrain: behind / wholly on (CORE-16.3, CORE-16.4) ----------

// the points of a base used as line end points: centre plus 4 edge points
function basePoints(m: Model): Vec2[] {
  return [{ x: m.pos.x, z: m.pos.z }, ...baseEdgePoints(m, 4)]
}

// does the straight line a->t pass through the feature footprint somewhere farther than combat range from the attacker's base?
function lineCrossesFeature(attacker: Model, a: Vec2, t: Vec2, poly: Vec2[]): boolean {
  const len = dist2D(a, t)
  const n = Math.max(1, Math.ceil(len / 0.2))
  for (let k = 0; k <= n; k++) {
    const p = { x: a.x + ((t.x - a.x) * k) / n, z: a.z + ((t.z - a.z) * k) / n }
    if (!pointInPolygon(p, poly)) continue
    if (signedDistanceToBase(p, attacker) > ENGAGEMENT_H + EPS) return true // parts inside the attacker's combat range are ignored
  }
  return false
}

// CORE-16.4: every straight line from any attacking model to any target model crosses the feature
function targetBehind(attackers: Model[], targets: Model[], poly: Vec2[]): boolean {
  if (attackers.length === 0 || targets.length === 0) return false
  for (const a of attackers) {
    const aPts = basePoints(a)
    for (const t of targets) {
      const tPts = basePoints(t)
      for (const ap of aPts) for (const tp of tPts) if (!lineCrossesFeature(a, ap, tp, poly)) return false
    }
  }
  return true
}

function targetWhollyOn(targets: Model[], poly: Vec2[]): boolean {
  return targets.length > 0 && targets.every((m) => whollyWithinPolygon(m, poly))
}

function featuresWithTrait(state: GameState, trait: 'cover' | 'obscuring'): TerrainPiece[] {
  return Object.values(state.board.pieces).filter((p) => p.traits.includes(trait))
}

function behindOrOn(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId, p: TerrainPiece): boolean {
  const targets = boardModelsOfUnit(state, targetUnitId)
  return targetWhollyOn(targets, p.footprint) || targetBehind(boardModelsOfUnit(state, attackerUnitId), targets, p.footprint)
}

export interface LosService {
  // base centre at heights {0.2, height/2, height} plus 4 base-edge points at height/2
  samplePoints(model: Model): Vec3[]
  // CORE-7.1: any sample point of `to` visible from any sample point of `from`
  visible(state: GameState, fromModelId: ModelId, toModelId: ModelId): boolean
  // same, for a model standing at a hypothetical position (movement path sampling): `probe` is a copy of the mover with
  // its pos changed; its own unit never blocks
  visibleFrom(state: GameState, probe: Model, toModelId: ModelId): boolean
  fullyVisible(state: GameState, fromModelId: ModelId, toModelId: ModelId): boolean
  // CORE-7.3: a unit is visible to an observing model if any of its models is
  unitVisible(state: GameState, fromModelId: ModelId, targetUnitId: UnitId): boolean
  unitFullyVisible(state: GameState, fromModelId: ModelId, targetUnitId: UnitId): boolean
  // CORE-1.5: two units of opposing armies are in combat while either is within the other's combat range (3" horizontal)
  // AND they are visible to each other (some model of one sees some model of the other)
  inCombat(state: GameState, unitA: UnitId, unitB: UnitId): boolean
  // the enemy units `unitId` is in combat with
  unitsInCombatWith(state: GameState, unitId: UnitId): UnitId[]
  // is the unit in combat with any enemy unit
  unitInCombat(state: GameState, unitId: UnitId): boolean
  // CORE-16.4 behind / CORE-16.3 wholly on, for one feature (terrain piece id)
  behind(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId, pieceId: string): boolean
  whollyOn(state: GameState, unitId: UnitId, pieceId: string): boolean
  // CORE-16.5 / SPH-5.4 Cover: 1 when attacks (shooting AND combat) by `attackerUnitId` against `targetUnitId` suffer -1 to
  // hit because the target is behind or wholly on a feature with Cover, 0 otherwise. Never applies when the target charged
  // this turn or has FLY. WP5 subtracts the returned number from the hit roll (the generic +/-1 clamp applies).
  coverPenalty(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId): number
  // CORE-16.6 / SPH-5.5 Obscuring: true when the target is behind or wholly on a feature with Obscuring and has no FLY, so it
  // cannot be targeted by SHOOTING attacks (combat attacks are unaffected)
  obscured(state: GameState, attackerUnitId: UnitId, targetUnitId: UnitId): boolean
  // kept for the 40k call sites: Cover is a hit modifier now (coverPenalty), never a save bonus
  benefitOfCover(state: GameState, targetModelId: ModelId, attackerUnitId: UnitId, weapon: RuntimeWeapon): boolean
  plungingFire(state: GameState, attackerModelId: ModelId, targetUnitId: UnitId): boolean
}

export const losService: LosService = {
  samplePoints(model) {
    const { x, y, z } = model.pos
    const h = model.height
    const pts: Vec3[] = [{ x, y: y + 0.2, z }, { x, y: y + h / 2, z }, { x, y: y + h, z }]
    for (const e of baseEdgePoints(model, 4)) pts.push({ x: e.x, y: y + h / 2, z: e.z })
    return pts
  },
  visible(state, fromModelId, toModelId) {
    const from = state.models[fromModelId], to = state.models[toModelId]
    if (!from || !to) return false
    return anyClearPair(state, from, to)
  },
  visibleFrom(state, probe, toModelId) {
    const to = state.models[toModelId]
    if (!to) return false
    return anyClearPair(state, probe, to)
  },
  fullyVisible(state, fromModelId, toModelId) {
    const from = state.models[fromModelId], to = state.models[toModelId]
    if (!from || !to) return false
    return anyClearPair(state, from, to) && everyPointFullyVisible(state, from, to)
  },
  unitVisible(state, fromModelId, targetUnitId) {
    return boardModelsOfUnit(state, targetUnitId).some((m) => losService.visible(state, fromModelId, m.id))
  },
  unitFullyVisible(state, fromModelId, targetUnitId) {
    const models = boardModelsOfUnit(state, targetUnitId)
    return models.length > 0 && models.every((m) => losService.fullyVisible(state, fromModelId, m.id))
  },
  inCombat(state, unitA, unitB) {
    const ua = state.units[unitA], ub = state.units[unitB]
    if (!ua || !ub || ua.player === ub.player || ua.location !== 'board' || ub.location !== 'board') return false
    const ma = boardModelsOfUnit(state, unitA), mb = boardModelsOfUnit(state, unitB)
    let inRange = false
    for (const a of ma) {
      for (const b of mb) {
        if (!withinEngagementRange(a, b)) continue
        inRange = true
        if (anyClearPair(state, a, b)) return true // the closest pairs are the likeliest to see each other
      }
    }
    if (!inRange) return false
    // in range but those pairs cannot see each other: the units are still visible to each other if any other pair does
    for (const a of ma) for (const b of mb) if (anyClearPair(state, a, b)) return true
    return false
  },
  unitsInCombatWith(state, unitId) {
    const u = state.units[unitId]
    if (!u || u.location !== 'board') return []
    const out: UnitId[] = []
    for (const e of Object.values(state.units)) {
      if (e.player === u.player || e.location !== 'board') continue
      if (losService.inCombat(state, unitId, e.id)) out.push(e.id)
    }
    return out
  },
  unitInCombat(state, unitId) {
    const u = state.units[unitId]
    if (!u || u.location !== 'board') return false
    for (const e of Object.values(state.units)) {
      if (e.player === u.player || e.location !== 'board') continue
      if (losService.inCombat(state, unitId, e.id)) return true
    }
    return false
  },
  behind(state, attackerUnitId, targetUnitId, pieceId) {
    const p = state.board.pieces[pieceId]
    if (!p) return false
    return targetBehind(boardModelsOfUnit(state, attackerUnitId), boardModelsOfUnit(state, targetUnitId), p.footprint)
  },
  whollyOn(state, unitId, pieceId) {
    const p = state.board.pieces[pieceId]
    return !!p && targetWhollyOn(boardModelsOfUnit(state, unitId), p.footprint)
  },
  coverPenalty(state, attackerUnitId, targetUnitId) {
    const target = state.units[targetUnitId]
    if (!target || target.turn.chargedThisTurn || hasKeyword(state, targetUnitId, 'FLY')) return 0
    return featuresWithTrait(state, 'cover').some((p) => behindOrOn(state, attackerUnitId, targetUnitId, p)) ? 1 : 0
  },
  obscured(state, attackerUnitId, targetUnitId) {
    if (!state.units[targetUnitId] || hasKeyword(state, targetUnitId, 'FLY')) return false
    return featuresWithTrait(state, 'obscuring').some((p) => behindOrOn(state, attackerUnitId, targetUnitId, p))
  },
  benefitOfCover: () => false,
  plungingFire: () => false,
}
