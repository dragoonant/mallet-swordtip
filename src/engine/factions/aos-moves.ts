// Engine-chosen movement for abilities that move or set up a unit outside the movement phase: Mighty Destroyers (IJZ-2.2,
// a 3" move that may end in combat) and Call for Reinforcements (SPH-12.2, a replacement unit set up on the table).
// A human cannot drag here (the abilities loop only asks chooseOption decisions), so these helpers build a short list of legal
// destinations. Every option id encodes its own geometry (`mv:<dx>:<dz>` for a rigid slide, `at:<x>:<z>` for a formation centred
// on a point) so the answer can be recomputed and re-validated when it is applied; nothing here keeps state besides the queue mark.
import {
  EPS, anyWithinEngagementRange, basesOverlap, checkPlacements, dist2D, emptyMoveConstraints, horizontalGap, pathCrossesModels, samplePath, whollyOnBoard,
  whollyWithinPolygon, type Footprint, type ResolvedPlacement,
} from '../geometry'
import { hookService } from '../hooks-impl'
import type { ModelPlacement } from '../actions'
import type { EngineContext } from '../modules'
import type { AbilityWindow } from '../abilities'
import { boardModelsOf, datasheetOf, enemyModelsOnBoard, hasKeyword, setModelPos, territoryOf, unitModels } from '../state'
import { terrainService } from '../terrain'
import type { EdgeRef, GameState, Model, ModelId, PlayerId, UnitId, Vec2, Vec3 } from '../types'
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

// F8 slide options (all optional; the default is Mighty Destroyers' IJZ-2.2 move):
//  passThrough        the path may cross any models and combat ranges (GLO-AB-4 Careening Destruction). Rigid slides only ever
//                     check the END spot against other models, so every slide behaves this way; the flag documents intent.
//  mustEndOutOfCombat the slide may not end inside any enemy combat range, and a unit starting in combat is NOT made to end in
//                     combat (Careening Destruction; LRL-BT-2 Pulled by the Winds as `mayNotEndInCombat`; KO-AB-2 retreats)
//  towardEdge         the slide's component toward that battlefield edge must be > 0 (LRL-BT-2 Pulled by the Winds); also
//                     adds a "Toward the ... edge" heading to slideOptions
//  normalMove         F12 (SKV-BT-1 Always Three Clawsteps Ahead): the slide is a Normal Move: no model's straight path may come
//                     within an enemy model's combat range at any point (FLY units ignore that, as in the movement phase), and it
//                     implies mayNotEndInCombat. approximation: still a rigid slide from the short heading list
//  closerToUnit       F14 (BOK-AB-1 Stalk the Prey): the closest-model gap to that unit must strictly shrink ("end closer to it");
//                     ignored while that unit is not on the battlefield. slideOptions puts a "Toward <name>" heading first
//  endFree            F14 (BOK-AB-1): a unit that starts in combat need not end in combat (overrides the IJZ-2.2 default) and need
//                     not leave it either
//  noCombatPath       F14 (SYL-AB-2 Zephyrspites): the normalMove path test applied even when every model has FLY, plus
//                     mayNotEndInCombat; slideOptions offers nothing at all to a unit that starts in combat
// A Move-ability edge constraint from a code hook (LRL-RA-2 Roaring Headwind, hookService.moveEdgeConstraintFor) is always
// applied the same way as towardEdge.
export interface SlideOpts {
  passThrough?: boolean; mustEndOutOfCombat?: boolean; mayNotEndInCombat?: boolean; towardEdge?: EdgeRef | null; normalMove?: boolean
  closerToUnit?: UnitId | null; endFree?: boolean; noCombatPath?: boolean
}

// F14: the closest-model gap between the unit (optionally slid by dx, dz) and another unit; Infinity when either has no models
export function unitGapAfter(state: GameState, unitId: UnitId, otherUnitId: UnitId, dx = 0, dz = 0): number {
  const theirs = state.units[otherUnitId]?.location === 'board' ? unitModels(state, otherUnitId) : []
  let best = Infinity
  for (const m of unitModels(state, unitId)) {
    const at = fp(m, { x: m.pos.x + dx, y: m.pos.y, z: m.pos.z + dz })
    for (const t of theirs) best = Math.min(best, horizontalGap(at, t))
  }
  return best
}

const edgeVector = (e: EdgeRef): Vec2 => (e.axis === 'x' ? { x: e.sign, z: 0 } : { x: 0, z: e.sign })
const EDGE_NAMES: Record<string, string> = { 'z:-1': 'the top edge', 'z:1': 'the bottom edge', 'x:-1': 'the left edge', 'x:1': 'the right edge' }
export const edgeName = (e: EdgeRef): string => EDGE_NAMES[`${e.axis}:${e.sign}`] ?? 'the edge'

// can the whole unit slide by (dx, dz) without any model moving more than maxDistance? `mustEndInCombat`: the unit started in
// combat and so has to finish in combat (IJZ-2.2); ignored when opts.mustEndOutOfCombat / mayNotEndInCombat is set
export function checkSlide(state: GameState, unitId: UnitId, dx: number, dz: number, maxDistance: number, mustEndInCombat: boolean, opts: SlideOpts = {}): SlideResult {
  const unit = state.units[unitId]
  if (!unit || unit.location !== 'board') return { ok: false, reason: 'not on the battlefield' }
  const models = unitModels(state, unitId)
  if (models.length === 0) return { ok: false, reason: 'no models' }
  if (Math.hypot(dx, dz) > maxDistance + 1e-3) return { ok: false, reason: `further than ${maxDistance}"` }
  const outOfCombat = opts.mustEndOutOfCombat === true || opts.mayNotEndInCombat === true || opts.normalMove === true || opts.noCombatPath === true
  if (outOfCombat || opts.endFree) mustEndInCombat = false
  const closer = opts.closerToUnit && state.units[opts.closerToUnit]?.location === 'board' ? opts.closerToUnit : null
  if (closer && !(unitGapAfter(state, unitId, closer, dx, dz) < unitGapAfter(state, unitId, closer) - EPS)) {
    return { ok: false, reason: `the move must end closer to ${state.units[closer].name}` }
  }
  for (const edge of [opts.towardEdge ?? null, hookService.moveEdgeConstraintFor(state, unitId)]) {
    if (!edge) continue
    const v = edgeVector(edge)
    if (dx * v.x + dz * v.z <= EPS) return { ok: false, reason: `the move must end closer to ${edgeName(edge)}` }
  }
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
  // F12 normalMove: the path may not enter any enemy combat range (CORE-6.4), unless every model can fly; F14 noCombatPath: not
  // even then
  if (opts.noCombatPath || (opts.normalMove && !models.every((m) => hasKeyword(state, m.unitId, 'FLY')))) {
    for (const r of result.resolved) {
      if (r.distance <= EPS) continue
      if (samplePath(r.path).some((p) => anyWithinEngagementRange(fp(r.model, p, r.facing), enemies))) return { ok: false, reason: 'a Normal Move may not pass through combat range' }
    }
  }
  const endsInCombat = result.resolved.some((r) => anyWithinEngagementRange(fp(r.model, r.to, r.facing), enemies))
  if (mustEndInCombat && !endsInCombat) return { ok: false, reason: 'a unit that starts in combat must end in combat' }
  if (outOfCombat && endsInCombat) return { ok: false, reason: 'the move may not end in combat' }
  return { ok: true, resolved: result.resolved, endsInCombat }
}

// the short list of slides offered for one unit: a few useful headings, each as far as it legally goes (up to maxDistance), + stay
export function slideOptions(state: GameState, unitId: UnitId, maxDistance: number, opts: SlideOpts = {}): MoveOption[] {
  const unit = state.units[unitId]
  const models = unit ? unitModels(state, unitId) : []
  const out: MoveOption[] = []
  if (!unit || unit.location !== 'board' || models.length === 0) return out
  const inCombat = enemiesInCombat(state, unitId).length > 0
  // F14 noCombatPath: every path would start inside a combat range, so a unit in combat cannot make the move at all
  if (opts.noCombatPath && inCombat) return out
  const mustEnd = inCombat && !opts.mustEndOutOfCombat && !opts.mayNotEndInCombat && !opts.normalMove && !opts.endFree
  const c = centroidOf(models)
  const enemies = enemyModelsOnBoard(state, unit.player)
  const nearestEnemy = enemies.length ? enemies.reduce((a, b) => (dist2D(c, b.pos) < dist2D(c, a.pos) ? b : a)) : null
  const objectives = (Object.values(state.objectives)).filter((o) => !o.removed).sort((a, b) => dist2D(c, a.pos) - dist2D(c, b.pos))
  const heads: { dir: Vec2; label: string }[] = []
  if (opts.towardEdge) heads.push({ dir: edgeVector(opts.towardEdge), label: `Toward ${edgeName(opts.towardEdge)}` })
  const unit2 = (to: Vec2): Vec2 | null => { const d = dist2D(c, to); return d < 1e-6 ? null : { x: (to.x - c.x) / d, z: (to.z - c.z) / d } }
  // F14 closerToUnit: head for that unit's model nearest the centroid first
  const closerUnit = opts.closerToUnit && state.units[opts.closerToUnit]?.location === 'board' ? state.units[opts.closerToUnit] : null
  if (closerUnit) {
    const near = unitModels(state, closerUnit.id).reduce<Model | null>((a, b) => (!a || dist2D(c, b.pos) < dist2D(c, a.pos) ? b : a), null)
    const v = near ? unit2(near.pos) : null
    if (v) heads.push({ dir: v, label: `Toward ${closerUnit.name}` })
  }
  if (nearestEnemy) {
    const v = unit2(nearestEnemy.pos)
    if (v) { heads.push({ dir: v, label: 'Toward the nearest enemy' }); heads.push({ dir: { x: -v.x, z: -v.z }, label: 'Back away from the nearest enemy' }) }
  }
  for (const o of objectives.slice(0, 2)) {
    const v = unit2(o.pos)
    if (v && dist2D(c, o.pos) > 0.5) heads.push({ dir: v, label: `Toward ${objectiveName(state, o.id)}` })
  }
  heads.push({ dir: { x: 1, z: 0 }, label: 'Slide right' }, { dir: { x: -1, z: 0 }, label: 'Slide left' }, { dir: { x: 0, z: 1 }, label: 'Slide down the table' }, { dir: { x: 0, z: -1 }, label: 'Slide up the table' })
  // diagonals: a unit boxed in on all four sides often still has a diagonal way out (retreats, edge moves)
  if (opts.towardEdge || opts.mustEndOutOfCombat || opts.mayNotEndInCombat || opts.normalMove || opts.closerToUnit || opts.noCombatPath || opts.endFree) {
    const D = Math.SQRT1_2
    heads.push({ dir: { x: D, z: D }, label: 'Slide down and right' }, { dir: { x: -D, z: D }, label: 'Slide down and left' }, { dir: { x: D, z: -D }, label: 'Slide up and right' }, { dir: { x: -D, z: -D }, label: 'Slide up and left' })
  }
  const seen = new Set<string>()
  for (const h of heads) {
    for (const dist of [maxDistance, maxDistance * 0.67, maxDistance * 0.34]) {
      const dx = r3(h.dir.x * dist), dz = r3(h.dir.z * dist)
      const key = `${Math.round(dx * 2)}:${Math.round(dz * 2)}`
      if (seen.has(key)) break
      const check = checkSlide(state, unitId, dx, dz, maxDistance, mustEnd, opts)
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

// moves the unit (state mutation) and reports it; returns false (nothing changed) when the slide is not legal. The enemy units
// the slide passed across are recorded for passedAcrossThisPhase (KO-AB-6 / GLO-AB-4, F8)
export function applySlide(ctx: EngineContext, unitId: UnitId, dx: number, dz: number, maxDistance: number, opts: SlideOpts = {}): boolean {
  const s = ctx.state
  const unit = s.units[unitId]
  if (!unit) return false
  if (Math.hypot(dx, dz) < 1e-6) return true
  const check = checkSlide(s, unitId, dx, dz, maxDistance, enemiesInCombat(s, unitId).length > 0, opts)
  if (!check.ok || !check.resolved) return false
  const across = unitsPassedAcross(s, unitId, dx, dz)
  const paths: Record<string, ResolvedPlacement['path']> = {}
  for (const r of check.resolved) {
    const m = s.models[r.model.id]
    if (!m) continue
    if (r.distance > EPS) paths[m.id] = r.path
    setModelPos(m, r.to, r.facing)
  }
  recordPassedAcross(s, unitId, across)
  ctx.emit({ type: 'UnitMoved', unitId, moveType: 'abilityMove', paths, player: unit.player })
  return true
}

// ---------- F12 (SBG-AB-2 Riders of Ruin): enemy models a unit's paths may cross ----------
// the enemy models that still block `unitId`'s move / charge PATH: those of units with a keyword the unit may pass across
// (hookService.passAcrossKeywords, Effect.passAcrossKeyword) are dropped. End-position overlap and combat-range rules are unchanged.
export function pathBlockingEnemies(state: GameState, unitId: UnitId, enemies: Model[]): Model[] {
  const kws = hookService.passAcrossKeywords(state, unitId)
  if (kws.length === 0) return enemies
  const passable = new Map<UnitId, boolean>()
  const ok = (uid: UnitId): boolean => {
    if (!passable.has(uid)) { const k = hookService.keywordsFor(state, uid); passable.set(uid, kws.some((x) => k.includes(x))) }
    return passable.get(uid) as boolean
  }
  return enemies.filter((e) => !ok(e.unitId))
}

// ---------- "passed across" (GLO-AB-4 Careening Destruction, KO-AB-6 Bomb Racks; F8) ----------
// enemy units with a model whose base the moving base touches somewhere along the path (the moving footprint sampled every
// quarter inch along the straight segment), for a rigid slide of the unit by (dx, dz) from where it stands now
export function unitsPassedAcross(state: GameState, unitId: UnitId, dx: number, dz: number): UnitId[] {
  const unit = state.units[unitId]
  if (!unit || unit.location !== 'board') return []
  const paths: Record<ModelId, Vec3[]> = {}
  for (const m of unitModels(state, unitId)) paths[m.id] = [m.pos, { x: m.pos.x + dx, y: m.pos.y, z: m.pos.z + dz }]
  return unitsPassedAcrossPaths(state, unitId, paths)
}

// the same for explicit per-model paths (phases/movement.ts records ordinary moves with it)
export function unitsPassedAcrossPaths(state: GameState, unitId: UnitId, paths: Record<ModelId, Vec3[]>): UnitId[] {
  const unit = state.units[unitId]
  if (!unit) return []
  const byUnit = new Map<UnitId, Model[]>()
  for (const e of enemyModelsOnBoard(state, unit.player)) byUnit.set(e.unitId, [...(byUnit.get(e.unitId) ?? []), e])
  const out: UnitId[] = []
  for (const [uid, ems] of byUnit) {
    for (const [mid, path] of Object.entries(paths)) {
      const m = state.models[mid]
      if (!m || path.length < 2) continue
      if (pathCrossesModels({ pos: path[0], facing: m.facing, base: m.base }, path, ems)) { out.push(uid); break }
    }
  }
  return out.sort()
}

const ACROSS = 'mv:across:'
export function recordPassedAcross(state: GameState, unitId: UnitId, ids: UnitId[]): void {
  if (ids.length === 0) return
  const key = `${ACROSS}${unitId}=`
  const prev = state.phaseState.marks.find((m) => m.startsWith(key))
  const all = new Set<UnitId>([...(prev ? (JSON.parse(prev.slice(key.length)) as UnitId[]) : []), ...ids])
  state.phaseState.marks = state.phaseState.marks.filter((m) => !m.startsWith(key))
  state.phaseState.marks.push(key + JSON.stringify([...all].sort()))
}

// every enemy unit `unitId` passed across with any move this phase (movement-phase moves and ability slides; union)
export function passedAcrossThisPhase(state: GameState, unitId: UnitId): UnitId[] {
  const key = `${ACROSS}${unitId}=`
  const m = state.phaseState.marks.find((x) => x.startsWith(key))
  return m ? (JSON.parse(m.slice(key.length)) as UnitId[]) : []
}

// ---------- ability retreats (KO-AB-2 Timed Charges, F8 C3) ----------
// rigid slides up to `max` that may cross enemy combat ranges (and, like every slide, models) and must end outside every enemy
// combat range; plus "Stay where it is". No mortal damage is taken.
export function retreatOptions(state: GameState, unitId: UnitId, max = 6): MoveOption[] {
  return slideOptions(state, unitId, max, { mustEndOutOfCombat: true })
}

// applies a retreat option id from retreatOptions; 'mv:0:0' (stay) is a legal no-op. False when the option is not legal now
export function applyRetreat(ctx: EngineContext, unitId: UnitId, optionId: string, max = 6): boolean {
  const slide = parseSlide(optionId)
  if (!slide) return false
  return applySlide(ctx, unitId, slide.dx, slide.dz, max, { mustEndOutOfCombat: true })
}

// ---------- queue of units still to be offered a move (A Proper Ruckus moves several in turn) ----------
// kind 'slide' (default) offers slideOptions(..., opts); 'retreat' offers retreatOptions (F8). The abilities loop
// (abilities.ts nextStep) asks one unit at a time; pass = the unit stays.
// F14 (SYL C2) atWindow: the queue waits, untouched, until an ability window of that name runs (e.g. 'shooting' = the
// shooting:after:<unitId> window after the activation, 'fightAfter' = right after a unit's Fight; abilities.ts AbilityWindow).
// A queue still waiting when the phase ends is dropped with the phase marks.
export interface MoveQueue { abilityId: string; player: PlayerId; maxDistance: number; queue: UnitId[]; kind?: 'slide' | 'retreat'; opts?: SlideOpts; atWindow?: AbilityWindow }
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

// F12 placement shapes (PlaceRequest): edgeBand false = anywhere in friendly territory (SBG-RA-1 Endless Legions); minEnemyDistance =
// every model more than that far (horizontal gap) from every enemy model; anywhere = the whole battlefield, no edge band (SER-ENH
// Blessed by the Old Ones). No shape = Call for Reinforcements (territory, 6" edge band, not in combat).
export interface PlaceShape { edgeBand?: boolean; minEnemyDistance?: number; anywhere?: boolean }

const boardPolygon = (state: GameState): Vec2[] => {
  const hw = state.board.w / 2, hh = state.board.h / 2
  return [{ x: -hw, z: -hh }, { x: hw, z: -hh }, { x: hw, z: hh }, { x: -hw, z: hh }]
}

// a compact blob of the unit's models around `centre`: hex lattice points nearest the centre first, each model on the first
// point that is wholly in friendly territory, in the 6" edge band, not in combat, clear of everything and legal terrain-wise.
// null when some model finds no point or the finished unit is out of coherency. `shape` (F12) relaxes / tightens the area.
export function reinforcementFormation(state: GameState, player: PlayerId, models: Model[], coherencyRange: number | undefined, centre: Vec2, shape: PlaceShape = {}): ModelPlacement[] | null {
  if (models.length === 0) return null
  const territory = shape.anywhere ? boardPolygon(state) : territoryOf(state, player)
  const band = !shape.anywhere && shape.edgeBand !== false
  const minGap = shape.minEnemyDistance ?? 0
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
      if (!whollyOnBoard(cand, state.board) || !whollyWithinPolygon(cand, territory) || (band && !inEdgeBand(cand, state.board))) continue
      if (placed.some((o) => basesOverlap(cand, o)) || others.some((o) => basesOverlap(cand, o)) || enemies.some((o) => basesOverlap(cand, o))) continue
      if (anyWithinEngagementRange(cand, enemies)) continue
      if (minGap > 0 && enemies.some((e) => horizontalGap(cand, e) <= minGap + EPS)) continue
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

// up to `max` legal, well-separated spots for the replacement: scans the territory on a 1.5" grid (the whole board on a 2" grid
// for an `anywhere` shape)
export function reinforcementOptions(state: GameState, player: PlayerId, models: Model[], coherencyRange: number | undefined, max = 5, shape: PlaceShape = {}): { id: string; label: string; centre: Vec2 }[] {
  const poly = shape.anywhere ? boardPolygon(state) : territoryOf(state, player)
  const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z)
  const found: Vec2[] = []
  const stepIn = shape.anywhere ? 2 : 1.5
  for (let z = Math.min(...zs); z <= Math.max(...zs) + EPS; z += stepIn) {
    for (let x = Math.min(...xs); x <= Math.max(...xs) + EPS; x += stepIn) {
      const centre = { x: r3(x), z: r3(z) }
      if (reinforcementFormation(state, player, models, coherencyRange, centre, shape)) found.push(centre)
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
    return shape.anywhere || shape.edgeBand === false ? `${lo} of the ${shape.anywhere ? 'battlefield' : 'territory'}` : `${lo} of your edge`
  }
  return picks.map((c) => ({ id: `at:${fmt(c.x)}:${fmt(c.z)}`, label: `Set up at the ${pos(c)} (${c.x.toFixed(0)}, ${c.z.toFixed(0)})`, centre: c }))
}

export function parseAt(optionId: string): Vec2 | null {
  const m = /^at:(-?[\d.]+):(-?[\d.]+)$/.exec(optionId)
  return m ? { x: Number(m[1]), z: Number(m[2]) } : null
}


// ---------- a replacement unit waiting for its spot ----------
// F12: edgeBand (default true) / minEnemyDistance (default: only "not in combat") reshape a territory set-up (SBG-RA-1);
// anywhere sets the unit up anywhere on the battlefield more than minEnemyDistance from every enemy model (SER-ENH)
export interface PlaceRequest {
  abilityId: string; player: PlayerId; unitId: UnitId; replacementOf: UnitId
  edgeBand?: boolean; minEnemyDistance?: number; anywhere?: { minEnemyDistance: number }
}
export function placeShapeOf(r: PlaceRequest): PlaceShape {
  if (r.anywhere) return { anywhere: true, edgeBand: false, minEnemyDistance: r.anywhere.minEnemyDistance }
  return { ...(r.edgeBand === false ? { edgeBand: false } : {}), ...(r.minEnemyDistance !== undefined ? { minEnemyDistance: r.minEnemyDistance } : {}) }
}
const PLACE_PREFIX = 'abil:place='
export function readPlaceRequest(state: GameState): PlaceRequest | null {
  const m = state.phaseState.marks.find((x) => x.startsWith(PLACE_PREFIX))
  return m ? (JSON.parse(m.slice(PLACE_PREFIX.length)) as PlaceRequest) : null
}
export function writePlaceRequest(state: GameState, r: PlaceRequest | null): void {
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(PLACE_PREFIX))
  if (r) state.phaseState.marks.push(PLACE_PREFIX + JSON.stringify(r))
}
