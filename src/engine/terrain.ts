// Terrain service (Spearhead port, WP4: CORE-6.7, CORE-6.10, CORE-16.7, SPH-5.6). Movement/charge/fight modules call this
// for climbs, walls, impassable areas and end-of-move legality; LoS uses the shared wall/footprint geometry below for rays
// (los.ts).
// AoS in short: terrain parts 1" tall or lower are ignored; taller parts are climbed (vertical distance counts, a wall crossed
// on the ground costs the climb up and down); any model may climb, FLY ignores terrain; an Unstable feature cannot be ended
// on, or set up on, anywhere taller than 1"; an Impassable feature cannot be crossed or ended on at all.
//
// [interp] heightAt/canEndAt: the data model lets a (x,z) point sit under more than one usable surface (a ruin's
// ground floor vs. an upper floor at the same footprint). heightAt(x,z) with no hint is "the highest surface directly
// reachable at this point" (crate/HILL top, or a ruin's topmost floor); heightAt(x,z,{near}) / settleY pick the surface
// nearest an intended height instead, which is what moves that keep their level (charge, pile-in, consolidate) use.
// The caller passes the exact `pos.y` it wants validated to canEndAt, which checks that specific height against every
// candidate surface. Craters/barricades never raise the standing height (R-5.7: ≤2" ignored;
// barricades may be crossed but never stood on top of).
import { partlyWithinPolygon, pointInPolygon, pointToSegment, signedDistanceToBase, whollyWithinPolygon, EPS, type Footprint } from './geometry'
import { hasKeyword } from './state'
import { hookService } from './hooks-impl'
import type { WallData } from '../data/types'
import type { GameState, Model, Path, TerrainPiece, TerrainPieceId, Vec2, Vec3 } from './types'

// CORE-6.7: terrain parts this tall or lower are ignored by movement
export const IGNORED_PART_HEIGHT = 1

// ---------- shared low-level geometry (also used by los.ts) ----------

// 2D segment intersection p1->p2 vs a->b; returns the parametric position on each segment (both in [0,1]) or null.
export function segmentIntersection2D(p1: Vec2, p2: Vec2, a: Vec2, b: Vec2): { t: number; u: number } | null {
  const rx = p2.x - p1.x, rz = p2.z - p1.z
  const sx = b.x - a.x, sz = b.z - a.z
  const denom = rx * sz - rz * sx
  if (Math.abs(denom) < 1e-9) return null
  const qpx = a.x - p1.x, qpz = a.z - p1.z
  const t = (qpx * sz - qpz * sx) / denom
  const u = (qpx * rz - qpz * rx) / denom
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null
  return { t: Math.min(1, Math.max(0, t)), u: Math.min(1, Math.max(0, u)) }
}

// does the 3D segment p1->p2 cross this wall (a solid vertical panel from y=0 to y=height, minus any gaps)?
// Movement (2D, ignores height) calls this with p1.y = p2.y = 0: a gap whose `bottom` > 0 (a window above head
// height) then correctly still blocks ground-level passage.
export function wallCrosses3D(wall: WallData, p1: Vec3, p2: Vec3): boolean {
  const hit = segmentIntersection2D(p1, p2, wall.a, wall.b)
  if (!hit) return false
  const y = p1.y + (p2.y - p1.y) * hit.t
  if (y > wall.height + EPS || y < -EPS) return false
  for (const g of wall.gaps ?? []) {
    if (hit.u < g.from - EPS || hit.u > g.to + EPS) continue
    const bottom = g.bottom ?? 0, top = g.top ?? wall.height
    if (y >= bottom - EPS && y <= top + EPS) return false
  }
  return true
}

// does the 2D segment cross the polygon boundary or start/end inside it?
export function segmentIntersectsPolygon2D(p1: Vec2, p2: Vec2, poly: Vec2[]): boolean {
  if (pointInPolygon(p1, poly) || pointInPolygon(p2, poly)) return true
  for (let i = 0; i < poly.length; i++) if (segmentIntersection2D(p1, p2, poly[i], poly[(i + 1) % poly.length])) return true
  return false
}

// R-3.7: the ruin footprint prism (full height, open top) blocks a ray whose start AND end are both outside the
// footprint even when it would otherwise pass through a wall gap/window — closes the "peek through a corner or
// window with both models outside" loophole that plain wall raycasting leaves open. Height is linear along the
// segment, so it suffices to check the two endpoints of every inside-the-polygon interval.
// `fromWhollyWithin`: is the model whose sample point is `p1` (the observer) wholly within this piece? R-3.7 lets
// only a wholly-within model see out through the footprint at any point; a merely partly-within model (base centre
// in, base edge overhanging) gets no such exemption. The `p2` (target) end keeps the plain per-point exemption
// regardless — a model the observer sees *into* the ruin needs no wholly-within test of its own.
export function ruinFootprintBlocks(piece: Pick<TerrainPiece, 'footprint' | 'height'>, p1: Vec3, p2: Vec3, fromWhollyWithin = false): boolean {
  const p1In = pointInPolygon(p1, piece.footprint), p2In = pointInPolygon(p2, piece.footprint)
  if ((p1In && fromWhollyWithin) || p2In) return false
  const ts = new Set<number>([0, 1])
  const poly = piece.footprint
  for (let i = 0; i < poly.length; i++) {
    const hit = segmentIntersection2D(p1, p2, poly[i], poly[(i + 1) % poly.length])
    if (hit) ts.add(hit.t)
  }
  const sorted = [...ts].sort((a, b) => a - b)
  const heightAt = (t: number) => p1.y + (p2.y - p1.y) * t
  const midInside = (a: number, b: number) => pointInPolygon({ x: p1.x + (p2.x - p1.x) * ((a + b) / 2), z: p1.z + (p2.z - p1.z) * ((a + b) / 2) }, poly)
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1]
    if (b - a < EPS) continue
    if (!midInside(a, b)) continue
    if (Math.min(heightAt(a), heightAt(b)) <= piece.height + EPS) return true
  }
  return false
}

// a solid raised block (HILL/container, kind 'crate'): opaque across its whole footprint up to `height` — there is
// no interior to be "inside" of, so (unlike ruins) no both-ends-outside gate is needed.
export function crateBlocks(piece: Pick<TerrainPiece, 'footprint' | 'height'>, p1: Vec3, p2: Vec3): boolean {
  const poly = piece.footprint
  const ts = new Set<number>([0, 1])
  for (let i = 0; i < poly.length; i++) {
    const hit = segmentIntersection2D(p1, p2, poly[i], poly[(i + 1) % poly.length])
    if (hit) ts.add(hit.t)
  }
  const sorted = [...ts].sort((a, b) => a - b)
  const heightAt = (t: number) => p1.y + (p2.y - p1.y) * t
  const midInside = (a: number, b: number) => pointInPolygon({ x: p1.x + (p2.x - p1.x) * ((a + b) / 2), z: p1.z + (p2.z - p1.z) * ((a + b) / 2) }, poly)
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1]
    if (b - a < EPS || !midInside(a, b)) continue
    if (Math.min(heightAt(a), heightAt(b)) <= piece.height + EPS) return true
  }
  return false
}

export function isTerrainId(state: GameState, id: string): id is TerrainPieceId { return id in state.board.pieces }

// does a wall (a thin solid panel, thickness defaulting to 0.25" per the schema) occupy this point at this height,
// for a base of the given (worst-case round) radius? Mirrors wallCrosses3D's gap handling but for a single point
// rather than a crossing segment — used by canEndAt so a model may not end a move with its base inside a wall panel,
// even a wall its keywords let it move through (R-5.7: crossing ≠ stopping).
function wallOccupiesPoint(wall: WallData, pos: Vec3, radius: number): boolean {
  if (wall.height <= IGNORED_PART_HEIGHT + EPS) return false // CORE-6.7: parts of 1" or less are ignored
  if (pos.y > wall.height + EPS || pos.y < -EPS) return false
  const abx = wall.b.x - wall.a.x, abz = wall.b.z - wall.a.z
  const l2 = abx * abx + abz * abz
  let u = l2 < EPS ? 0 : ((pos.x - wall.a.x) * abx + (pos.z - wall.a.z) * abz) / l2
  u = Math.max(0, Math.min(1, u))
  const halfThickness = (wall.thickness ?? 0.25) / 2
  if (pointToSegment({ x: pos.x, z: pos.z }, wall.a, wall.b) > radius + halfThickness + EPS) return false
  for (const g of wall.gaps ?? []) {
    if (u < g.from - EPS || u > g.to + EPS) continue
    const bottom = g.bottom ?? 0, top = g.top ?? wall.height
    if (pos.y >= bottom - EPS && pos.y <= top + EPS) return false
  }
  return true
}

// F8: the same test against the real outline of an oval base (the round worst case above keeps a cavalry oval side-on to a
// wall 1.8" away from it). Round bases use wallOccupiesPoint unchanged.
function wallOccupiesBase(wall: WallData, fp: Footprint): boolean {
  const r1 = fp.base.radius, r2 = fp.base.radius2 ?? r1
  if (Math.abs(r1 - r2) < 1e-6) return wallOccupiesPoint(wall, fp.pos, r1)
  if (!wallOccupiesPoint(wall, fp.pos, Math.max(r1, r2))) return false
  const halfThickness = (wall.thickness ?? 0.25) / 2
  const abx = wall.b.x - wall.a.x, abz = wall.b.z - wall.a.z
  const len = Math.hypot(abx, abz)
  const n = Math.max(1, Math.ceil(len / 0.1))
  for (let k = 0; k <= n; k++) {
    const u = k / n
    const p = { x: wall.a.x + abx * u, z: wall.a.z + abz * u }
    if (signedDistanceToBase(p, fp) > halfThickness + EPS) continue
    const inGap = (wall.gaps ?? []).some((g) => u >= g.from - EPS && u <= g.to + EPS && fp.pos.y >= (g.bottom ?? 0) - EPS && fp.pos.y <= (g.top ?? wall.height) + EPS)
    if (!inGap) return true
  }
  return false
}

// R-3.9: units/models within 2" of each other across a barricade count as in Engagement Range (charging into one,
// and for Fight-phase eligibility/attacks). `a`/`b` are plain positions (base centres) — callers pass horizontalGap
// separately since that already accounts for base shape.
export function acrossBarricade(state: GameState, a: Vec2, b: Vec2): boolean {
  for (const p of Object.values(state.board.pieces)) {
    if (p.kind !== 'barricade') continue
    if (segmentIntersectsPolygon2D(a, b, p.footprint)) return true
  }
  return false
}

// Snap a requested standing height to a legal surface: if pos.y equals a crate top or ruin floor height whose polygon
// contains (x,z) keep it (canEndAt stays the judge of keyword/overhang legality); anything else (0, a stale height from
// the model's previous spot, garbage) becomes ground level 0.
export function surfaceY(board: { pieces?: Record<string, TerrainPiece> }, _model: Pick<Model, 'base'> | undefined, pos: Vec3): number {
  if (!Number.isFinite(pos.y) || Math.abs(pos.y) <= EPS) return 0
  for (const p of Object.values(board.pieces ?? {})) {
    if (p.kind === 'crate' && p.height > IGNORED_PART_HEIGHT && Math.abs(pos.y - p.height) <= EPS && pointInPolygon(pos, p.footprint)) return p.height
    if (p.kind === 'ruin') for (const f of p.floors) if (f.height > IGNORED_PART_HEIGHT && Math.abs(pos.y - f.height) <= EPS && pointInPolygon(pos, f.polygon)) return f.height
  }
  return 0
}

// every standing height at (x, z), ascending: always ground (0), plus each crate top and ruin floor whose polygon
// contains the point (a ruin's ground and upper floors share the footprint, so a point can have several).
function surfaceHeightsAt(state: GameState, x: number, z: number): number[] {
  const hs = new Set<number>([0])
  for (const p of Object.values(state.board.pieces)) {
    if (p.kind === 'crate' && p.height > IGNORED_PART_HEIGHT && pointInPolygon({ x, z }, p.footprint)) hs.add(p.height)
    if (p.kind === 'ruin') for (const f of p.floors) if (f.height > IGNORED_PART_HEIGHT && pointInPolygon({ x, z }, f.polygon)) hs.add(f.height)
  }
  return [...hs].sort((a, b) => a - b)
}

// the surface a move that wants to stay near `near` should use: the highest surface at or below it (so ground under an
// upper floor stays ground, and a model on a floor stays on it), else the lowest one above it
function pickSurface(heights: number[], near: number): number {
  let best: number | undefined
  for (const h of heights) if (h <= near + EPS) best = h
  return best ?? heights[0]
}

export interface TerrainService {
  // surface height under (x, z). Without `near`: the TOPMOST surface (0 on open ground, a ruin's highest floor, the top
  // of a raised block). With `near` (an intended/starting height): the surface nearest that level — the highest one at
  // or below it, else the lowest one above — so an end point under a ruin upper floor stays on the ground.
  heightAt(state: GameState, x: number, z: number, opts?: { near?: number }): number
  // may a model end its move (or be set up) with its base centred at pos? Not inside a wall or solid block taller than 1",
  // not on Impassable terrain, not on any part taller than 1" of an Unstable feature (CORE-16.7, SPH-5.6)
  canEndAt(state: GameState, model: Model, pos: Vec3): { ok: boolean; reason?: string }
  // does the path cross Impassable terrain this model cannot pass (CORE-16.7)? FLY ignores terrain (CORE-6.10)
  crossesImpassable(state: GameState, model: Model, path: Path): boolean
  // extra movement cost beyond geometry.pathLength (which already charges |Δy|): crossing a wall or block taller than 1" on
  // the ground costs the climb up and the climb down (CORE-6.7); 0 for FLY
  extraMoveCost(state: GameState, model: Model, path: Path): number
  // AREA TERRAIN pieces the model is wholly within (ruins, craters, woods)
  piecesWhollyWithin(state: GameState, model: Model): TerrainPieceId[]
}

// F18 (OGM C2, Effect.passAcrossTerrain): terrain-only flight. Used only for crossing impassable terrain and the climb cost, so a
// unit with the effect still cannot cross models or combat ranges (movement.ts / charge.ts read the FLY keyword for those)
const terrainFlightCache = new WeakMap<object, boolean>()
function gameHasTerrainFlight(state: GameState): boolean {
  const key = state.abilities as object
  let v = terrainFlightCache.get(key)
  if (v === undefined) {
    v = Object.values(state.abilities).some((a) => JSON.stringify(a).includes('passAcrossTerrain'))
    terrainFlightCache.set(key, v)
  }
  return v
}
function isFlyer(state: GameState, model: Model): boolean {
  if (hasKeyword(state, model.unitId, 'FLY')) return true
  const unit = state.units[model.unitId]
  if (!unit) return false
  if (!gameHasTerrainFlight(state) && !unit.effects.some((e) => JSON.stringify(e.effect).includes('passAcrossTerrain'))) return false
  return hookService.unitHasEffectFlag(state, model.unitId, 'passAcrossTerrain')
}

const isUnstable = (p: TerrainPiece): boolean => p.traits.includes('unstable')
const isImpassable = (p: TerrainPiece): boolean => p.traits.includes('impassable')

export const terrainService: TerrainService = {
  heightAt(state, x, z, opts) {
    const hs = surfaceHeightsAt(state, x, z)
    if (opts?.near === undefined || !Number.isFinite(opts.near)) return hs[hs.length - 1]
    return pickSurface(hs, opts.near)
  },
  canEndAt(state, model, pos) {
    const fp: Footprint = { pos, facing: model.facing, base: model.base }
    const groundLevel = Math.abs(pos.y) <= EPS
    for (const p of Object.values(state.board.pieces)) {
      // Impassable (CORE-16.7): no model may end any move on any part
      if (isImpassable(p) && partlyWithinPolygon(fp, p.footprint)) {
        return { ok: false, reason: 'may not end a move on impassable terrain' }
      }
      // barricades are never a standing surface — a base overlapping the footprint at all, at any height, is "on top of it"
      if (p.kind === 'barricade' && p.height > IGNORED_PART_HEIGHT && partlyWithinPolygon(fp, p.footprint)) {
        return { ok: false, reason: 'may not end a move on top of a barricade' }
      }
      if (p.kind === 'ruin' || p.kind === 'wall') {
        for (const w of p.walls) if (wallOccupiesBase(w, fp)) {
          return { ok: false, reason: 'may not end a move inside a wall' }
        }
      }
    }
    if (groundLevel) {
      // a solid block taller than 1" is not a standing surface at ground level (it would be inside it); a base that merely
      // overhangs its footprint is rejected too
      for (const p of Object.values(state.board.pieces)) {
        if (p.kind === 'crate' && p.height > IGNORED_PART_HEIGHT + EPS && partlyWithinPolygon(fp, p.footprint)) {
          return { ok: false, reason: 'may not end a move inside a solid terrain piece' }
        }
      }
      return { ok: true }
    }
    // elevated end point: several surfaces may share a height; only surfaces under the base centre are candidates and
    // the move is legal if ANY candidate wholly contains the base. Unstable features (SPH-5.6) refuse anything above 1".
    let reason: string | undefined
    for (const p of Object.values(state.board.pieces)) {
      if (p.kind === 'crate' && Math.abs(pos.y - p.height) <= EPS && pointInPolygon(pos, p.footprint)) {
        if (isUnstable(p) && pos.y > IGNORED_PART_HEIGHT + EPS) { reason ??= 'unstable terrain: cannot end a move on a part taller than 1"'; continue }
        if (whollyWithinPolygon(fp, p.footprint)) return { ok: true }
        reason ??= 'base would overhang the terrain'
      }
      if (p.kind === 'ruin') {
        for (const f of p.floors) {
          if (Math.abs(pos.y - f.height) > EPS || !pointInPolygon(pos, f.polygon)) continue
          if (isUnstable(p) && pos.y > IGNORED_PART_HEIGHT + EPS) { reason ??= 'unstable terrain: cannot end a move on a part taller than 1"'; continue }
          if (whollyWithinPolygon(fp, f.polygon)) return { ok: true }
          reason ??= 'base would overhang the floor'
        }
      }
    }
    return { ok: false, reason: reason ?? 'no terrain surface at that height' }
  },
  crossesImpassable(state, model, path) {
    if (isFlyer(state, model)) return false
    for (let i = 1; i < path.length; i++) {
      for (const p of Object.values(state.board.pieces)) {
        if (isImpassable(p) && segmentIntersectsPolygon2D(path[i - 1], path[i], p.footprint)) return true
      }
    }
    return false
  },
  extraMoveCost(state, model, path) {
    if (isFlyer(state, model)) return 0
    let extra = 0
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i]
      for (const p of Object.values(state.board.pieces)) {
        for (const w of p.walls) {
          if (w.height <= IGNORED_PART_HEIGHT + EPS) continue
          // a wall crossed on the ground: up and over (the path's own |Δy| is charged by pathLength, so only flat crossings count)
          if (Math.max(a.y, b.y) < w.height - EPS && wallCrosses3D(w, { ...a, y: 0 }, { ...b, y: 0 })) extra += 2 * w.height
        }
        if (p.kind === 'crate' && p.height > IGNORED_PART_HEIGHT + EPS && Math.max(a.y, b.y) < p.height - EPS
          && !pointInPolygon(a, p.footprint) && !pointInPolygon(b, p.footprint) && segmentIntersectsPolygon2D(a, b, p.footprint)) extra += 2 * p.height
      }
    }
    return extra
  },
  piecesWhollyWithin(state, model) {
    return Object.values(state.board.pieces)
      .filter((p) => (p.kind === 'ruin' || p.kind === 'crater' || p.kind === 'forest') && whollyWithinPolygon(model, p.footprint))
      .map((p) => p.id)
  },
}

// Standing height for an engine-computed end point of a move that should keep its level (charge, pile-in,
// approach): the surface nearest `near` (normally the model's starting y) at which the model may legally
// end (canEndAt); when none is legal, the nearest surface anyway so the caller's own canEndAt check rejects it. Falling
// to a different surface than the nearest is how a model still climbs a crate/floor when the lower spot is blocked; the
// caller charges |Δy| in its move distance.
export function settleY(state: GameState, model: Model, x: number, z: number, near: number): number {
  const hs = surfaceHeightsAt(state, x, z)
  const first = pickSurface(hs, near)
  const order = [first, ...hs.filter((h) => h !== first).sort((a, b) => Math.abs(a - near) - Math.abs(b - near) || a - b)]
  for (const y of order) if (terrainService.canEndAt(state, model, { x, y, z }).ok) return y
  return first
}

// Set-up check (SPH-5.6, SPH-7): a model may only be set up where it could legally end a move (no wall, tall solid block,
// impassable part, or part of an Unstable feature taller than 1")
export function deployTerrainBlock(state: GameState, model: Model, pos: Vec3, facing: number = model.facing): string | null {
  const m: Model = { ...model, facing }
  const end = terrainService.canEndAt(state, m, pos)
  return end.ok ? null : (end.reason ?? 'blocked by terrain')
}
