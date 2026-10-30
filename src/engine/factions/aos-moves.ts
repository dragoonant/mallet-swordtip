// Engine-chosen movement for abilities that move or set up a unit outside the movement phase: Mighty Destroyers (IJZ-2.2,
// a 3" move that may end in combat) and Call for Reinforcements (SPH-12.2, a replacement unit set up on the table).
// A human cannot drag here (the abilities loop only asks chooseOption decisions), so these helpers build a short list of legal
// destinations. Every option id encodes its own geometry (`mv:<dx>:<dz>` for a rigid slide, `at:<x>:<z>` for a formation centred
// on a point) so the answer can be recomputed and re-validated when it is applied; nothing here keeps state besides the queue mark.
import {
  EPS, anyWithinEngagementRange, basesOverlap, checkPlacements, dist2D, emptyMoveConstraints, whollyOnBoard, whollyWithinPolygon,
  type Footprint, type ResolvedPlacement,
} from '../geometry'
import type { ModelPlacement } from '../actions'
import type { EngineContext } from '../modules'
import { boardModelsOf, datasheetOf, enemyModelsOnBoard, setModelPos, territoryOf, unitModels } from '../state'
import { terrainService } from '../terrain'
import type { GameState, Model, PlayerId, UnitId, Vec2 } from '../types'
import { enemiesInCombat } from './aos-common'

export interface MoveOption { id: string; label: string }

const r3 = (n: number): number => Math.round(n * 1000) / 1000
const fmt = (n: number): string => String(r3(n))

const centroidOf = (models: Model[]): Vec2 => ({
  x: models.reduce((a, m) => a + m.pos.x, 0) / Math.max(1, models.length),
  z: models.reduce((a, m) => a + m.pos.z, 0) / Math.max(1, models.length),
})
const fp = (m: Model, pos = m.pos, facing = m.facing): Footprint => ({ pos, facing, base: m.base })
const reachOf = (m: Model): number => Math.max(m.base.radius, m.base.radius2 ?? 0)

function objectiveName(state: GameState, id: string): string {
  return state.mission.data.objectives.find((o) => o.id === id)?.name ?? 'an objective'
}

// ---------- rigid slides (Mighty Destroyers) ----------
export interface SlideResult { ok: boolean; reason?: string; resolved?: ResolvedPlacement[]; endsInCombat?: boolean }

// can the whole unit slide by (dx, dz) without any model moving more than maxDistance? `mustEndInCombat`: the unit started in
// combat and so has to finish in combat (IJZ-2.2)
export function checkSlide(state: GameState, unitId: UnitId, dx: number, dz: number, maxDistance: number, mustEndInCombat: boolean): SlideResult {
  const unit = state.units[unitId]
  if (!unit || unit.location !== 'board') return { ok: false, reason: 'not on the battlefield' }
  const models = unitModels(state, unitId)
  if (models.length === 0) return { ok: false, reason: 'no models' }
  if (Math.hypot(dx, dz) > maxDistance + 1e-3) return { ok: false, reason: `further than ${maxDistance}"` }
  const mine = new Set(models.map((m) => m.id))
  const result = checkPlacements({
    unitModels: models,
    placements: models.map((m) => ({ modelId: m.id, pos: { x: m.pos.x + dx, y: m.pos.y, z: m.pos.z + dz }, facing: m.facing })),
    constraints: emptyMoveConstraints(maxDistance, { coherency: true }),
    otherFriendly: boardModelsOf(state, unit.player).filter((m) => !mine.has(m.id)),
    enemies: enemyModelsOnBoard(state, unit.player),
    board: state.board,
    coherencyRange: datasheetOf(state, unitId).coherencyRange,
  })
  if (result.rejection) return { ok: false, reason: result.rejection.reason }
  for (const r of result.resolved) {
    const end = terrainService.canEndAt(state, r.model, r.to)
    if (!end.ok) return { ok: false, reason: end.reason ?? 'terrain blocks that spot' }
    if (r.distance > EPS && terrainService.crossesImpassable(state, r.model, r.path)) return { ok: false, reason: 'impassable terrain in the way' }
  }
  const enemies = enemyModelsOnBoard(state, unit.player)
  const endsInCombat = result.resolved.some((r) => anyWithinEngagementRange(fp(r.model, r.to, r.facing), enemies))
  if (mustEndInCombat && !endsInCombat) return { ok: false, reason: 'a unit that starts in combat must end in combat' }
  return { ok: true, resolved: result.resolved, endsInCombat }
}

// the short list of slides offered for one unit: a few useful headings, each as far as it legally goes (up to maxDistance), + stay
export function slideOptions(state: GameState, unitId: UnitId, maxDistance: number): MoveOption[] {
  const unit = state.units[unitId]
  const models = unit ? unitModels(state, unitId) : []
  const out: MoveOption[] = []
  if (!unit || unit.location !== 'board' || models.length === 0) return out
  const mustEnd = enemiesInCombat(state, unitId).length > 0
  const c = centroidOf(models)
  const enemies = enemyModelsOnBoard(state, unit.player)
  const nearestEnemy = enemies.length ? enemies.reduce((a, b) => (dist2D(c, b.pos) < dist2D(c, a.pos) ? b : a)) : null
  const objectives = (Object.values(state.objectives)).filter((o) => !o.removed).sort((a, b) => dist2D(c, a.pos) - dist2D(c, b.pos))
  const heads: { dir: Vec2; label: string }[] = []
  const unit2 = (to: Vec2): Vec2 | null => { const d = dist2D(c, to); return d < 1e-6 ? null : { x: (to.x - c.x) / d, z: (to.z - c.z) / d } }
  if (nearestEnemy) {
    const v = unit2(nearestEnemy.pos)
    if (v) { heads.push({ dir: v, label: 'Toward the nearest enemy' }); heads.push({ dir: { x: -v.x, z: -v.z }, label: 'Back away from the nearest enemy' }) }
  }
  for (const o of objectives.slice(0, 2)) {
    const v = unit2(o.pos)
    if (v && dist2D(c, o.pos) > 0.5) heads.push({ dir: v, label: `Toward ${objectiveName(state, o.id)}` })
  }
  heads.push({ dir: { x: 1, z: 0 }, label: 'Slide right' }, { dir: { x: -1, z: 0 }, label: 'Slide left' }, { dir: { x: 0, z: 1 }, label: 'Slide down the table' }, { dir: { x: 0, z: -1 }, label: 'Slide up the table' })
  const seen = new Set<string>()
  for (const h of heads) {
    for (const dist of [maxDistance, maxDistance * 0.67, maxDistance * 0.34]) {
      const dx = r3(h.dir.x * dist), dz = r3(h.dir.z * dist)
      const key = `${Math.round(dx * 2)}:${Math.round(dz * 2)}`
      if (seen.has(key)) break
      const check = checkSlide(state, unitId, dx, dz, maxDistance, mustEnd)
      if (!check.ok) continue
      seen.add(key)
      out.push({ id: `mv:${fmt(dx)}:${fmt(dz)}`, label: `${h.label} (${r3(Math.hypot(dx, dz)).toFixed(1)}")${check.endsInCombat && !mustEnd ? ', into combat' : ''}` })
      break
    }
  }
  out.push({ id: 'mv:0:0', label: 'Stay where it is' })
  return out
}

export function parseSlide(optionId: string): { dx: number; dz: number } | null {
  const m = /^mv:(-?[\d.]+):(-?[\d.]+)$/.exec(optionId)
  return m ? { dx: Number(m[1]), dz: Number(m[2]) } : null
}

// moves the unit (state mutation) and reports it; returns false (nothing changed) when the slide is not legal
export function applySlide(ctx: EngineContext, unitId: UnitId, dx: number, dz: number, maxDistance: number): boolean {
  const s = ctx.state
  const unit = s.units[unitId]
  if (!unit) return false
  if (Math.hypot(dx, dz) < 1e-6) return true
  const check = checkSlide(s, unitId, dx, dz, maxDistance, enemiesInCombat(s, unitId).length > 0)
  if (!check.ok || !check.resolved) return false
  const paths: Record<string, ResolvedPlacement['path']> = {}
  for (const r of check.resolved) {
    const m = s.models[r.model.id]
    if (!m) continue
    if (r.distance > EPS) paths[m.id] = r.path
    setModelPos(m, r.to, r.facing)
  }
  ctx.emit({ type: 'UnitMoved', unitId, moveType: 'abilityMove', paths, player: unit.player })
  return true
}

// ---------- queue of units still to be offered a move (A Proper Ruckus moves several in turn) ----------
export interface MoveQueue { abilityId: string; player: PlayerId; maxDistance: number; queue: UnitId[] }
const QUEUE_PREFIX = 'abil:mq='

export function readMoveQueue(state: GameState): MoveQueue | null {
  const m = state.phaseState.marks.find((x) => x.startsWith(QUEUE_PREFIX))
  return m ? (JSON.parse(m.slice(QUEUE_PREFIX.length)) as MoveQueue) : null
}
export function writeMoveQueue(state: GameState, q: MoveQueue | null): void {
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(QUEUE_PREFIX))
  if (q && q.queue.length > 0) state.phaseState.marks.push(QUEUE_PREFIX + JSON.stringify(q))
}

// ---------- formations (Call for Reinforcements) ----------
const BAND = 6

// wholly within 6" of some battlefield edge (SPH-12.2), measured with the longest base radius
function inEdgeBand(f: Footprint, board: GameState['board']): boolean {
  const R = Math.max(f.base.radius, f.base.radius2 ?? 0)
  const hw = board.w / 2, hh = board.h / 2
  return f.pos.x + R <= -hw + BAND + EPS || f.pos.x - R >= hw - BAND - EPS || f.pos.z + R <= -hh + BAND + EPS || f.pos.z - R >= hh - BAND - EPS
}

function facingFor(state: GameState, player: PlayerId): number {
  const poly = territoryOf(state, player)
  const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z)
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cz = (Math.max(...zs) + Math.min(...zs)) / 2
  if (Math.abs(cx) >= Math.abs(cz)) return cx > 0 ? Math.PI : 0
  return cz > 0 ? -Math.PI / 2 : Math.PI / 2
}

// a compact blob of the unit's models around `centre`: hex lattice points nearest the centre first, each model on the first
// point that is wholly in friendly territory, in the 6" edge band, not in combat, clear of everything and legal terrain-wise.
// null when some model finds no point or the finished unit is out of coherency.
export function reinforcementFormation(state: GameState, player: PlayerId, models: Model[], coherencyRange: number | undefined, centre: Vec2): ModelPlacement[] | null {
  if (models.length === 0) return null
  const territory = territoryOf(state, player)
  const mine = new Set(models.map((m) => m.id))
  const others = boardModelsOf(state, player).filter((m) => !mine.has(m.id))
  const enemies = enemyModelsOnBoard(state, player)
  const facing = facingFor(state, player)
  const rmax = Math.max(...models.map(reachOf))
  const step = 2 * rmax + 0.12
  const pts: Vec2[] = []
  const span = Math.ceil(Math.sqrt(models.length) + 2)
  for (let j = -span; j <= span; j++) for (let i = -span; i <= span; i++) pts.push({ x: centre.x + (i + (Math.abs(j) % 2) * 0.5) * step, z: centre.z + j * step * 0.88 })
  pts.sort((a, b) => dist2D(a, centre) - dist2D(b, centre))
  const placed: Footprint[] = []
  const out: ModelPlacement[] = []
  for (const m of models) {
    let chosen: Footprint | null = null
    for (const p of pts) {
      const cand: Footprint = { pos: { x: r3(p.x), y: 0, z: r3(p.z) }, facing, base: m.base }
      if (!whollyOnBoard(cand, state.board) || !whollyWithinPolygon(cand, territory) || !inEdgeBand(cand, state.board)) continue
      if (placed.some((o) => basesOverlap(cand, o)) || others.some((o) => basesOverlap(cand, o)) || enemies.some((o) => basesOverlap(cand, o))) continue
      if (anyWithinEngagementRange(cand, enemies)) continue
      if (!terrainService.canEndAt(state, m, cand.pos).ok) continue
      chosen = cand
      break
    }
    if (!chosen) return null
    placed.push(chosen)
    out.push({ modelId: m.id, pos: chosen.pos, facing })
  }
  const check = checkPlacements({
    unitModels: models, placements: out, constraints: emptyMoveConstraints(1e9, { region: territory, mustEndOutsideEngagement: true, coherency: true }),
    otherFriendly: others, enemies, board: state.board, coherencyRange,
  })
  return check.rejection ? null : out
}

// up to `max` legal, well-separated spots for the replacement: scans the territory on a 1.5" grid
export function reinforcementOptions(state: GameState, player: PlayerId, models: Model[], coherencyRange: number | undefined, max = 5): { id: string; label: string; centre: Vec2 }[] {
  const poly = territoryOf(state, player)
  const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z)
  const found: Vec2[] = []
  for (let z = Math.min(...zs); z <= Math.max(...zs) + EPS; z += 1.5) {
    for (let x = Math.min(...xs); x <= Math.max(...xs) + EPS; x += 1.5) {
      const centre = { x: r3(x), z: r3(z) }
      if (reinforcementFormation(state, player, models, coherencyRange, centre)) found.push(centre)
    }
  }
  if (found.length === 0) return []
  // spread: take the ones furthest apart along the table's long axis
  const long = state.board.w >= state.board.h ? 'x' : 'z'
  found.sort((a, b) => a[long] - b[long] || a.x - b.x)
  const picks: Vec2[] = []
  const want = Math.min(max, found.length)
  for (let k = 0; k < want; k++) {
    const cand = found[Math.round((k * (found.length - 1)) / Math.max(1, want - 1))]
    if (!picks.some((p) => dist2D(p, cand) < 3)) picks.push(cand)
  }
  const pos = (v: Vec2): string => {
    const lo = long === 'x' ? (v.x < -state.board.w / 6 ? 'left' : v.x > state.board.w / 6 ? 'right' : 'centre') : (v.z < -state.board.h / 6 ? 'top' : v.z > state.board.h / 6 ? 'bottom' : 'centre')
    return `${lo} of your edge`
  }
  return picks.map((c) => ({ id: `at:${fmt(c.x)}:${fmt(c.z)}`, label: `Set up at the ${pos(c)} (${c.x.toFixed(0)}, ${c.z.toFixed(0)})`, centre: c }))
}

export function parseAt(optionId: string): Vec2 | null {
  const m = /^at:(-?[\d.]+):(-?[\d.]+)$/.exec(optionId)
  return m ? { x: Number(m[1]), z: Number(m[2]) } : null
}


// ---------- a replacement unit waiting for its spot ----------
export interface PlaceRequest { abilityId: string; player: PlayerId; unitId: UnitId; replacementOf: UnitId }
const PLACE_PREFIX = 'abil:place='
export function readPlaceRequest(state: GameState): PlaceRequest | null {
  const m = state.phaseState.marks.find((x) => x.startsWith(PLACE_PREFIX))
  return m ? (JSON.parse(m.slice(PLACE_PREFIX.length)) as PlaceRequest) : null
}
export function writePlaceRequest(state: GameState, r: PlaceRequest | null): void {
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(PLACE_PREFIX))
  if (r) state.phaseState.marks.push(PLACE_PREFIX + JSON.stringify(r))
}
