// AI-side move and charge-move candidates (owner: src/ai). The engine's legalActions only offers rigid slides of the unit as it
// stands (plus a few coherency repairs). A unit deployed shoulder to shoulder, or a big-based cavalry line with terrain in front,
// can find every slide blocked and stay where it is all game, and a charge that rolled high enough can find no placement to land.
// These generators re-form the unit around an anchor (formations.ts shapes, models assigned to the nearest slot) and keep only
// what the engine's own validate() accepts, so nothing illegal can come out of here. They run only when the engine's list is
// poor (no move that uses a good share of the allowance, or no charge move at all), which keeps the sims fast.
import {
  boardUnitsOf, hasKeyword, unitModels, validate,
  type Action, type GameState, type Model, type ModelPlacement, type PendingDecision, type PlayerId, type UnitId,
} from '../engine'
import { terrainService } from '../engine/terrain'
import { pathCrossesModels, type Footprint } from '../engine/geometry'
import type { Path } from '../engine/types'
import { buildFormation, type FormationShape } from './formations'

const MOVE_SHAPES: [FormationShape, number][] = [['line', 0], ['line', Math.PI / 2], ['block', 0], ['wedge', 0]]
const CHARGE_SHAPES: FormationShape[] = ['line', 'block', 'arc']
const MAX_EXTRA = 6

const centreOf = (ms: { pos: { x: number; z: number } }[]): { x: number; z: number } => ({
  x: ms.reduce((a, m) => a + m.pos.x, 0) / ms.length,
  z: ms.reduce((a, m) => a + m.pos.z, 0) / ms.length,
})

// the formation's slots, each taken by the nearest model still free (closest pairs first), so nobody walks across the unit
function assign(models: Model[], slots: ModelPlacement[]): ModelPlacement[] {
  const pairs: { m: number; s: number; d: number }[] = []
  models.forEach((m, i) => slots.forEach((s, j) => pairs.push({ m: i, s: j, d: Math.hypot(m.pos.x - s.pos.x, m.pos.z - s.pos.z) })))
  pairs.sort((a, b) => a.d - b.d)
  const usedM = new Set<number>(), usedS = new Set<number>()
  const out: ModelPlacement[] = new Array(models.length)
  for (const p of pairs) {
    if (usedM.has(p.m) || usedS.has(p.s)) continue
    usedM.add(p.m); usedS.add(p.s)
    const m = models[p.m]
    const to = { x: slots[p.s].pos.x, y: m.pos.y, z: slots[p.s].pos.z }
    out[p.m] = { modelId: m.id, pos: to, facing: slots[p.s].facing, path: [m.pos, to] }
  }
  return out
}

function formed(models: Model[], shape: FormationShape, anchor: { x: number; z: number }, facing: number): ModelPlacement[] | null {
  const slots = buildFormation(shape, models.map((m) => ({ id: m.id, base: m.base })), anchor, facing)
  return slots ? assign(models, slots) : null
}

// each model's way there: the straight line, or a dog-leg around whatever is in the way (one waypoint beside the midpoint), the
// cheapest that fits its allowance counting climbs (terrain.ts extraMoveCost) and the pivot an oval base pays to turn
// (geometry.ts pivotCost: 1", 2" for a Monster or Vehicle). Writes the chosen path into the placement; false when a model has none.
function route(state: GameState, unitId: UnitId, models: Model[], placements: ModelPlacement[], allow: (m: Model) => number): boolean {
  const big = hasKeyword(state, unitId, 'MONSTER') || hasKeyword(state, unitId, 'VEHICLE')
  const blockers: Footprint[] = Object.values(state.models).filter((o) => o.unitId !== unitId && o.woundsRemaining > 0 && state.units[o.unitId]?.location === 'board')
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    const m = models[i]
    const facing = p.facing ?? m.facing
    const turned = m.base.shape === 'oval' && Math.abs(Math.atan2(Math.sin(facing - m.facing), Math.cos(facing - m.facing))) > 0.01
    const budget = allow(m) - (turned ? (big ? 2 : 1) : 0)
    const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z
    const len = Math.hypot(dx, dz)
    if (len <= 0.01) { p.path = [m.pos, p.pos]; continue }
    if (len > budget) return false
    const nx = -dz / len, nz = dx / len
    const paths: Path[] = [[m.pos, p.pos]]
    for (const k of [2, -2, 4, -4]) paths.push([m.pos, { x: m.pos.x + dx / 2 + nx * k, y: m.pos.y, z: m.pos.z + dz / 2 + nz * k }, p.pos])
    let ok = false
    for (const path of paths) {
      let cost = 0
      for (let j = 1; j < path.length; j++) cost += Math.hypot(path[j].x - path[j - 1].x, path[j].z - path[j - 1].z)
      if (cost > budget) continue
      if (terrainService.crossesImpassable(state, m, path)) continue
      if (cost + terrainService.extraMoveCost(state, m, path) > budget) continue
      if (pathCrossesModels({ pos: m.pos, facing, base: m.base }, path, blockers)) continue
      p.path = path
      ok = true
      break
    }
    if (!ok) return false
  }
  return true
}

const maxShift = (state: GameState, a: Action): number => {
  if (a.type !== 'moveUnit' && a.type !== 'chargeMove') return 0
  let best = 0
  for (const p of a.placements) { const m = state.models[p.modelId]; if (m) best = Math.max(best, Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z)) }
  return best
}

function enemyUnitCentres(state: GameState, player: PlayerId): { id: UnitId; c: { x: number; z: number } }[] {
  const out: { id: UnitId; c: { x: number; z: number } }[] = []
  for (const u of boardUnitsOf(state, player === 'A' ? 'B' : 'A')) {
    const ms = unitModels(state, u.id)
    if (ms.length > 0) out.push({ id: u.id, c: centreOf(ms) })
  }
  return out
}

// extra Normal Move / Run / Retreat candidates, only when the engine's own list cannot take the unit anywhere much
function moveExtras(state: GameState, pending: Extract<PendingDecision, { kind: 'moveUnit' }>, legal: Action[]): Action[] {
  const unitId = pending.context.unitId
  const models = unitModels(state, unitId)
  if (models.length === 0) return []
  const per = pending.constraints.perModel
  const allowOf = (m: Model): number => Math.max(0, (per[m.id] ?? pending.constraints.maxDistance) - 0.05)
  const allow = Math.min(...models.map(allowOf))
  if (allow < 1) return []
  if (legal.some((a) => maxShift(state, a) >= allow * 0.6)) return []
  const c = centreOf(models)
  const aims: { x: number; z: number; stop: number }[] = []
  for (const o of Object.values(state.objectives)) if (!o.removed) aims.push({ x: o.pos.x, z: o.pos.z, stop: 0 })
  for (const e of enemyUnitCentres(state, pending.player)) aims.push({ x: e.c.x, z: e.c.z, stop: pending.context.moveType === 'fallBack' ? -1 : 6 })
  for (let i = 0; i < 8; i++) aims.push({ x: c.x + Math.cos((i * Math.PI) / 4) * 40, z: c.z + Math.sin((i * Math.PI) / 4) * 40, stop: 0 })
  const out: Action[] = []
  for (const aim of aims) {
    const d = Math.hypot(aim.x - c.x, aim.z - c.z)
    if (d < 0.5) continue
    // a Retreat runs away from the enemy it aims at
    const sign = aim.stop < 0 ? -1 : 1
    const ux = ((aim.x - c.x) / d) * sign, uz = ((aim.z - c.z) / d) * sign
    const reach = aim.stop < 0 ? allow : Math.min(allow, Math.max(0, d - aim.stop))
    if (reach < 1) continue
    let found = false
    for (const frac of [1, 0.75, 0.5, 0.3]) {
      const anchor = { x: c.x + ux * reach * frac, z: c.z + uz * reach * frac }
      // facing the aim (a front), or turned side-on (a column that threads between terrain and friends)
      for (const [shape, turn] of MOVE_SHAPES) {
        const placements = formed(models, shape, anchor, Math.atan2(uz, ux) + turn)
        if (!placements || !route(state, unitId, models, placements, allowOf)) continue
        const action: Action = { type: 'moveUnit', player: pending.player, decisionId: pending.id, unitId, placements }
        if (validate(state, action) !== null) continue
        out.push(action)
        found = true
        break
      }
      if (found) break
    }
    if (out.length >= MAX_EXTRA) break
  }
  return out
}

// charge moves for a charge whose roll reaches an enemy but the engine found no placement for: the unit re-forms facing the
// nearest enemy models, its front rank pushed up to just inside 1/2" of them
function chargeExtras(state: GameState, pending: Extract<PendingDecision, { kind: 'chargeMove' }>, legal: Action[]): Action[] {
  if (legal.some((a) => a.type === 'chargeMove')) return []
  const unitId = pending.context.unitId
  const models = unitModels(state, unitId)
  if (models.length === 0) return []
  const roll = pending.context.roll
  const allowOf = (): number => Math.max(0, roll - 0.05)
  const c = centreOf(models)
  const out: Action[] = []
  const foes: { m: Model; d: number }[] = []
  for (const u of boardUnitsOf(state, pending.player === 'A' ? 'B' : 'A')) for (const m of unitModels(state, u.id)) foes.push({ m, d: Math.hypot(m.pos.x - c.x, m.pos.z - c.z) })
  foes.sort((a, b) => a.d - b.d)
  for (const { m: foe } of foes.slice(0, 6)) {
    const d = Math.hypot(foe.pos.x - c.x, foe.pos.z - c.z)
    if (d < 0.1) continue
    const ux = (foe.pos.x - c.x) / d, uz = (foe.pos.z - c.z) / d
    const facing = Math.atan2(uz, ux)
    for (const shape of CHARGE_SHAPES) {
      // build once at the foe, then slide back so the nearest of our bases ends 0.3" from the foe's base
      const probe = formed(models, shape, { x: foe.pos.x, z: foe.pos.z }, facing)
      if (!probe) continue
      const foeR = Math.max(foe.base.radius, foe.base.radius2 ?? 0)
      let front = -Infinity
      probe.forEach((p, i) => { front = Math.max(front, (p.pos.x - foe.pos.x) * ux + (p.pos.z - foe.pos.z) * uz + Math.max(models[i].base.radius, models[i].base.radius2 ?? 0)) })
      for (const extra of [0.3, 0.15]) {
        const back = front + foeR + extra
        const placements = formed(models, shape, { x: foe.pos.x - ux * back, z: foe.pos.z - uz * back }, facing)
        if (!placements || !route(state, unitId, models, placements, allowOf)) continue
        const action: Action = { type: 'chargeMove', player: pending.player, decisionId: pending.id, unitId, placements }
        if (validate(state, action) !== null) continue
        out.push(action)
        break
      }
      if (out.length > 0 && out.length >= 3) return out
    }
  }
  return out
}

export function extraMoveCandidates(state: GameState, pending: PendingDecision, legal: Action[]): Action[] {
  if (pending.kind === 'moveUnit') return moveExtras(state, pending, legal)
  if (pending.kind === 'chargeMove') return chargeExtras(state, pending, legal)
  return []
}
