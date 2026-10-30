// Re-formed move and charge candidates (F10). The phase modules' own candidates are rigid slides of the unit as it stands (plus
// coherency repairs and per-model charge fits). A unit set up shoulder to shoulder, or a line of big oval bases with terrain or
// friends in front, can find every slide blocked: a human then got no suggested move at all and the AI needed a private
// workaround. These generators lay the unit out again around an anchor (a line, a line turned side-on, a block, a wedge, an arc),
// give each slot to the nearest model, route every model there (straight, or one bend round whatever is in the way) and hand the
// result to the caller's validator, so nothing illegal comes out. Callers only ask when their own list is poor, to keep sims fast.
import type { ModelPlacement } from '../actions'
import { isCoherent, pathCrossesModels, pivotCost, type Footprint } from '../geometry'
import { boardUnitsOf, keywordsOf, unitModels } from '../state'
import { terrainService } from '../terrain'
import type { GameState, Model, ModelBase, Path, PlayerId, UnitId } from '../types'

export type ReformShape = 'line' | 'block' | 'wedge' | 'arc'

const SLOT_GAP = 0.15 // base-to-base clearance between neighbouring slots

const longRadius = (b: ModelBase): number => Math.max(b.radius, b.radius2 ?? 0)
// an oval's long radius lies along its facing, so across a rank it takes up its short radius
const sideRadius = (b: ModelBase): number => (b.radius2 !== undefined ? b.radius2 : b.radius)
// centre-to-rim distance of a base at `facing` along the world direction `angle`
function reach(b: ModelBase, facing: number, angle: number): number {
  if (b.radius2 === undefined) return b.radius
  const c = Math.cos(angle - facing) / b.radius, s = Math.sin(angle - facing) / b.radius2
  return 1 / Math.sqrt(c * c + s * s)
}

// rank widths (front first) for `n` models in ranks of at most `cols`
function ranks(n: number, cols: number): number[] {
  const out: number[] = []
  for (let left = n; left > 0; left -= cols) out.push(Math.min(cols, left))
  return out
}

// local slots: u across the front (left positive), v forward; rank 0 is the front
function layout(shape: ReformShape, n: number, side: number, depth: number): { u: number; v: number }[] {
  if (n <= 1) return [{ u: 0, v: 0 }]
  const pitch = 2 * side + SLOT_GAP
  const row = 2 * depth + SLOT_GAP
  const fromRanks = (widths: number[], rowPitch: number, stagger: boolean): { u: number; v: number }[] => {
    const out: { u: number; v: number }[] = []
    widths.forEach((w, r) => {
      const shift = stagger && r % 2 === 1 ? pitch / 2 : 0
      for (let i = 0; i < w; i++) out.push({ u: (i - (w - 1) / 2) * pitch + shift, v: -r * rowPitch })
    })
    return out
  }
  switch (shape) {
    case 'line': {
      const out: { u: number; v: number }[] = []
      if (n < 7) {
        // one rank, each model beside the next
        for (let i = 0; i < n; i++) out.push({ u: (i - (n - 1) / 2) * pitch, v: 0 })
        return out
      }
      // 7+ models need two neighbours each: a zig-zag half a pitch apart, so every model also reaches the one two along
      const half = pitch / 2
      const lean = Math.sqrt(Math.max(0, (2 * Math.max(side, depth) + 0.05) ** 2 - half * half))
      for (let i = 0; i < n; i++) out.push({ u: (i - (n - 1) / 2) * half, v: i % 2 === 0 ? 0 : -lean })
      return out
    }
    case 'block': return fromRanks(ranks(n, Math.ceil(n / (n >= 15 ? 3 : 2))), row, false)
    case 'wedge': {
      const widths: number[] = []
      for (let left = n, k = 1; left > 0; left -= k, k++) widths.push(Math.min(k, left))
      return fromRanks(widths, row * 0.87, false)
    }
    case 'arc': {
      const p = 2 * Math.max(side, depth) + SLOT_GAP
      const radius = Math.max(p * 1.5, ((n - 1) * p) / 1.4)
      const step = p / radius
      const out: { u: number; v: number }[] = []
      for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * step; out.push({ u: radius * Math.sin(a), v: radius * Math.cos(a) - radius }) }
      return out
    }
  }
}

// the shape's slots centred on `anchor`, facing `facing` (forward = (cos, sin)); null when the layout itself is not coherent
export function reformSlots(shape: ReformShape, models: Model[], anchor: { x: number; z: number }, facing: number, coherency = 0.5): ModelPlacement[] | null {
  if (models.length === 0) return []
  const side = Math.max(...models.map((m) => sideRadius(m.base)))
  const depth = Math.max(...models.map((m) => longRadius(m.base)))
  const local = layout(shape, models.length, side, depth)
  const uMid = (Math.max(...local.map((p) => p.u)) + Math.min(...local.map((p) => p.u))) / 2
  const vMid = (Math.max(...local.map((p) => p.v)) + Math.min(...local.map((p) => p.v))) / 2
  const c = Math.cos(facing), s = Math.sin(facing)
  const out: ModelPlacement[] = models.map((m, i) => {
    const u = local[i].u - uMid, v = local[i].v - vMid
    return { modelId: m.id, pos: { x: anchor.x + v * c - u * s, y: m.pos.y, z: anchor.z + v * s + u * c }, facing }
  })
  if (models.length > 1 && !isCoherent(out.map((p, i) => ({ pos: p.pos, facing, base: models[i].base })), coherency)) return null
  return out
}

// each slot to the nearest model still free (closest pairs first), so nobody walks across the unit; returns placements in model order
function assignSlots(models: Model[], slots: ModelPlacement[]): ModelPlacement[] {
  const pairs: { m: number; s: number; d: number }[] = []
  models.forEach((m, i) => slots.forEach((sl, j) => pairs.push({ m: i, s: j, d: Math.hypot(m.pos.x - sl.pos.x, m.pos.z - sl.pos.z) })))
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

// a way there for every model within `allow(m)`, counting climbs and the pivot a turned oval pays; writes the paths, false if any
// model has none. The straight line first, then a one-bend detour either side of the midpoint.
function routeAll(state: GameState, unitId: UnitId, models: Model[], placements: ModelPlacement[], allow: (m: Model) => number): boolean {
  const kws = keywordsOf(state, unitId)
  const blockers: Footprint[] = Object.values(state.models).filter((o) => o.unitId !== unitId && state.units[o.unitId]?.location === 'board')
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    const m = models[i]
    const facing = p.facing ?? m.facing
    const turned = Math.abs(Math.atan2(Math.sin(facing - m.facing), Math.cos(facing - m.facing))) > 0.01
    const budget = allow(m) - (turned ? pivotCost(m.base, kws) : 0)
    const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z
    const len = Math.hypot(dx, dz)
    if (len <= 0.01) { p.path = [m.pos, p.pos]; continue }
    if (len > budget) return false
    const nx = -dz / len, nz = dx / len
    const paths: Path[] = [[m.pos, p.pos]]
    for (const k of [2, -2, 4, -4]) paths.push([m.pos, { x: m.pos.x + dx / 2 + nx * k, y: m.pos.y, z: m.pos.z + dz / 2 + nz * k }, p.pos])
    let found = false
    for (const path of paths) {
      let cost = 0
      for (let j = 1; j < path.length; j++) cost += Math.hypot(path[j].x - path[j - 1].x, path[j].z - path[j - 1].z)
      if (cost > budget) continue
      if (terrainService.crossesImpassable(state, m, path)) continue
      if (cost + terrainService.extraMoveCost(state, m, path) > budget) continue
      if (pathCrossesModels({ pos: m.pos, facing, base: m.base }, path, blockers)) continue
      p.path = path
      found = true
      break
    }
    if (!found) return false
  }
  return true
}

const centreOf = (ms: { pos: { x: number; z: number } }[]): { x: number; z: number } => ({
  x: ms.reduce((a, m) => a + m.pos.x, 0) / ms.length,
  z: ms.reduce((a, m) => a + m.pos.z, 0) / ms.length,
})

const MOVE_SHAPES: [ReformShape, number][] = [['line', 0], ['line', Math.PI / 2], ['block', 0], ['wedge', 0]]

// Re-formed Normal Move / Run / Retreat candidates for `unitId`: toward each objective, toward (or, retreating, away from) each enemy
// unit (stopping 6" short), and the eight compass points, at full reach then shorter. `allow(m)` is a model's allowance; `accept`
// is the phase's validator. At most `limit` come back, one per aim.
export function reformMoveCandidates(
  state: GameState, unitId: UnitId, models: Model[], allow: (m: Model) => number, retreat: boolean, accept: (p: ModelPlacement[]) => boolean,
  limit = 6, coherency = 0.5,
): ModelPlacement[][] {
  if (models.length === 0) return []
  const reachAll = Math.min(...models.map(allow))
  if (reachAll < 1) return []
  const player = state.units[unitId]?.player as PlayerId
  const c = centreOf(models)
  const aims: { x: number; z: number; stop: number }[] = []
  for (const o of Object.values(state.objectives)) if (!o.removed) aims.push({ x: o.pos.x, z: o.pos.z, stop: 0 })
  for (const u of boardUnitsOf(state, player === 'A' ? 'B' : 'A')) {
    const ms = unitModels(state, u.id)
    if (ms.length > 0) { const e = centreOf(ms); aims.push({ x: e.x, z: e.z, stop: retreat ? -1 : 6 }) }
  }
  for (let i = 0; i < 8; i++) aims.push({ x: c.x + Math.cos((i * Math.PI) / 4) * 40, z: c.z + Math.sin((i * Math.PI) / 4) * 40, stop: 0 })
  const out: ModelPlacement[][] = []
  for (const aim of aims) {
    if (out.length >= limit) break
    const d = Math.hypot(aim.x - c.x, aim.z - c.z)
    if (d < 0.5) continue
    const sign = aim.stop < 0 ? -1 : 1
    const ux = ((aim.x - c.x) / d) * sign, uz = ((aim.z - c.z) / d) * sign
    const reach = aim.stop < 0 ? reachAll : Math.min(reachAll, Math.max(0, d - aim.stop))
    if (reach < 1) continue
    let found = false
    for (const frac of [1, 0.75, 0.5, 0.3]) {
      const anchor = { x: c.x + ux * reach * frac, z: c.z + uz * reach * frac }
      for (const [shape, turn] of MOVE_SHAPES) {
        const slots = reformSlots(shape, models, anchor, Math.atan2(uz, ux) + turn, coherency)
        if (!slots) continue
        const placements = assignSlots(models, slots)
        if (!routeAll(state, unitId, models, placements, allow) || !accept(placements)) continue
        out.push(placements)
        found = true
        break
      }
      if (found) break
    }
  }
  return out
}

const CHARGE_SHAPES: [ReformShape, number][] = [['line', 0], ['block', 0], ['arc', 0], ['line', Math.PI / 2]]

// Re-formed charge moves: for each of the nearest enemy models the unit lines up facing it (a line, a block, an arc, a column
// side-on) with its front just inside ½" of that model, every model within the roll. `accept` is the charge validator.
export function reformChargeCandidates(
  state: GameState, unitId: UnitId, models: Model[], enemies: Model[], roll: number, accept: (p: ModelPlacement[]) => boolean,
  limit = 2, coherency = 0.5,
): ModelPlacement[][] {
  if (models.length === 0 || enemies.length === 0) return []
  const allow = (): number => Math.max(0, roll - 0.05)
  const c = centreOf(models)
  const foes = enemies.map((m) => ({ m, d: Math.hypot(m.pos.x - c.x, m.pos.z - c.z) })).sort((a, b) => a.d - b.d).slice(0, 6)
  const out: ModelPlacement[][] = []
  for (const { m: foe, d } of foes) {
    if (d < 0.1) continue
    const ux = (foe.pos.x - c.x) / d, uz = (foe.pos.z - c.z) / d
    const facing = Math.atan2(uz, ux)
    for (const [shape, turn] of CHARGE_SHAPES) {
      const f = facing + turn
      // lay it out on the foe once to measure how far the front reaches ahead of the anchor, then pull it back that far
      const probe = reformSlots(shape, models, { x: foe.pos.x, z: foe.pos.z }, f, coherency)
      if (!probe) continue
      let front = -Infinity
      probe.forEach((p, i) => { front = Math.max(front, (p.pos.x - foe.pos.x) * ux + (p.pos.z - foe.pos.z) * uz + reach(models[i].base, f, facing)) })
      for (const gap of [0.3, 0.15]) {
        const back = front + reach(foe.base, foe.facing, facing + Math.PI) + gap
        const slots = reformSlots(shape, models, { x: foe.pos.x - ux * back, z: foe.pos.z - uz * back }, f, coherency)
        if (!slots) continue
        const placements = assignSlots(models, slots)
        if (!routeAll(state, unitId, models, placements, allow) || !accept(placements)) continue
        out.push(placements)
        if (out.length >= limit) return out
        break
      }
    }
  }
  return out
}
