// Engine-chosen movement for abilities that move or set up a unit outside the movement phase: Mighty Destroyers (IJZ-2.2,
// a 3" move that may end in combat) and Call for Reinforcements (SPH-12.2, a replacement unit set up on the table).
// A human cannot drag here (the abilities loop only asks chooseOption decisions), so these helpers build a short list of legal
// destinations. Every option id encodes its own geometry (`mv:<dx>:<dz>` for a rigid slide, `at:<x>:<z>` for a formation centred
// on a point) so the answer can be recomputed and re-validated when it is applied; nothing here keeps state besides the queue mark.
import {
  EPS, anyWithinEngagementRange, baseEdgePoints, basesOverlap, checkPlacements, dist2D, emptyMoveConstraints, horizontalGap, isRound, pathCrossesModels, samplePath, whollyOnBoard,
  whollyWithinPolygon, type Footprint, type ResolvedPlacement,
} from '../geometry'
import { hookService } from '../hooks-impl'
import type { ModelPlacement } from '../actions'
import type { EngineContext } from '../modules'
import type { AbilityWindow } from '../abilities'
import { boardModelsOf, datasheetOf, enemyModelsOnBoard, hasKeyword, setModelPos, territoryOf, unitModels } from '../state'
import { terrainService } from '../terrain'
import type { EdgeRef, GameState, Model, ModelBase, ModelId, PlayerId, UnitId, Vec2, Vec3 } from '../types'
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
//  combatPathExcept   F18 (OGM-RA-1 Brutish Barging): the noCombatPath path test, but the combat ranges of the listed units'
//                     models are ignored for the PATH (the units it is already in combat with); implies mayNotEndInCombat (the
//                     end test still counts every enemy). Unlike noCombatPath, a unit that starts in combat is offered slides
// A Move-ability edge constraint from a code hook (LRL-RA-2 Roaring Headwind, hookService.moveEdgeConstraintFor) is always
// applied the same way as towardEdge.
export interface SlideOpts {
  passThrough?: boolean; mustEndOutOfCombat?: boolean; mayNotEndInCombat?: boolean; towardEdge?: EdgeRef | null; normalMove?: boolean
  closerToUnit?: UnitId | null; endFree?: boolean; noCombatPath?: boolean; combatPathExcept?: UnitId[]
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
  const outOfCombat = opts.mustEndOutOfCombat === true || opts.mayNotEndInCombat === true || opts.normalMove === true || opts.noCombatPath === true || opts.combatPathExcept !== undefined
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
  // F18 combatPathExcept: the path may not enter the combat range of any OTHER enemy unit
  if (opts.combatPathExcept) {
    const skip = new Set(opts.combatPathExcept)
    const others = enemies.filter((e) => !skip.has(e.unitId))
    for (const r of result.resolved) {
      if (r.distance <= EPS || others.length === 0) continue
      if (samplePath(r.path).some((p) => anyWithinEngagementRange(fp(r.model, p, r.facing), others))) return { ok: false, reason: 'the move may not pass through the combat range of another enemy unit' }
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
  const mustEnd = inCombat && !opts.mustEndOutOfCombat && !opts.mayNotEndInCombat && !opts.normalMove && !opts.endFree && !opts.combatPathExcept
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
  if (opts.towardEdge || opts.mustEndOutOfCombat || opts.mayNotEndInCombat || opts.normalMove || opts.closerToUnit || opts.noCombatPath || opts.endFree || opts.combatPathExcept) {
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
// F16 (TZE C2, DOT-BT-1 Fated Arrival): edgeWithin = no 6" band; instead the finished unit must have a model whose base edge is
// within this many inches of a battlefield edge (nearBoardEdge).
// F18 (OGM C1, More Ogors, My Lord!): edgeAll = EVERY model's base edge within edgeWithin of a battlefield edge (not just one);
// formations are then a line of models parallel to the nearest battlefield edge (edgeLineFormation)
export interface PlaceShape { edgeBand?: boolean; minEnemyDistance?: number; anywhere?: boolean; edgeWithin?: number; edgeAll?: boolean }

const boardPolygon = (state: GameState): Vec2[] => {
  const hw = state.board.w / 2, hh = state.board.h / 2
  return [{ x: -hw, z: -hh }, { x: hw, z: -hh }, { x: hw, z: hh }, { x: -hw, z: hh }]
}

// F16 (TZE C2): true when the footprint's base edge is within `n` of some battlefield edge
export function nearBoardEdge(f: Footprint, board: GameState['board'], n: number): boolean {
  const hw = board.w / 2, hh = board.h / 2
  return baseEdgePoints(f).some((p) => hw - Math.abs(p.x) <= n + EPS || hh - Math.abs(p.z) <= n + EPS)
}

// ---- F16 (reinforcement fix): packing by the real base footprints ----
// Every model of a formation shares one facing, so the centre distance at which two bases leave a given edge gap depends only on
// the two bases and the direction in the shared local frame. contactDistance finds it by bisection on horizontalGap (the measure
// isCoherent uses) and memoises it per (base pair, direction, gap).
const CONTACT_DIRS = 16
const PACK_GAP = 0.15
const contactMemo = new Map<string, number>()
function contactDistance(a: ModelBase, b: ModelBase, k: number, gap: number): number {
  const key = `${a.shape},${a.radius},${a.radius2 ?? ''}|${b.shape},${b.radius},${b.radius2 ?? ''}|${k}|${gap}`
  const hit = contactMemo.get(key)
  if (hit !== undefined) return hit
  const ang = (2 * Math.PI * k) / CONTACT_DIRS
  const A: Footprint = { pos: { x: 0, y: 0, z: 0 }, facing: 0, base: a }
  const at = (d: number): Footprint => ({ pos: { x: Math.cos(ang) * d, y: 0, z: Math.sin(ang) * d }, facing: 0, base: b })
  let lo = 0
  let hi = Math.max(a.radius, a.radius2 ?? 0) + Math.max(b.radius, b.radius2 ?? 0) + gap + 0.2
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const f = at(mid)
    const g = basesOverlap(A, f) ? -1 : horizontalGap(A, f)
    if (g < gap) lo = mid
    else hi = mid
  }
  if (contactMemo.size > 20000) contactMemo.clear()
  contactMemo.set(key, hi)
  return hi
}

// a compact blob of the unit's models around `centre`. Each model goes on a spot that is wholly in friendly territory, in the 6"
// edge band (or per `shape`), not in combat, clear of everything and legal terrain-wise; null when some model finds no spot or the
// finished unit is not coherent. Units whose models all stand on the same round base use a hex lattice spaced by that base
// (points nearest the centre first); any other unit (oval or mixed bases, F16 fix) is packed by its real footprints.
export function reinforcementFormation(state: GameState, player: PlayerId, models: Model[], coherencyRange: number | undefined, centre: Vec2, shape: PlaceShape = {}): ModelPlacement[] | null {
  if (models.length === 0) return null
  if (shape.edgeAll && shape.edgeWithin !== undefined) return edgeLineFormation(state, player, models, coherencyRange, centre, shape)
  const b0 = models[0].base
  const uniformRound = models.every((m) => isRound(m.base) && m.base.radius === b0.radius)
  return uniformRound ? latticeFormation(state, player, models, coherencyRange, centre, shape) : packedFormation(state, player, models, coherencyRange, centre, shape)
}

// the territory / 6" band / enemy / terrain tests and the final check shared by both formation builders
function formationRules(state: GameState, player: PlayerId, models: Model[], shape: PlaceShape) {
  const territory = shape.anywhere ? boardPolygon(state) : territoryOf(state, player)
  const band = !shape.anywhere && shape.edgeBand !== false && shape.edgeWithin === undefined
  const minGap = shape.minEnemyDistance ?? 0
  const mine = new Set(models.map((m) => m.id))
  const others = boardModelsOf(state, player).filter((m) => !mine.has(m.id))
  const enemies = enemyModelsOnBoard(state, player)
  const facing = facingFor(state, player)
  const legal = (m: Model, cand: Footprint, placed: Footprint[]): boolean => {
    if (!whollyOnBoard(cand, state.board) || !whollyWithinPolygon(cand, territory) || (band && !inEdgeBand(cand, state.board))) return false
    if (placed.some((o) => basesOverlap(cand, o)) || others.some((o) => basesOverlap(cand, o)) || enemies.some((o) => basesOverlap(cand, o))) return false
    if (anyWithinEngagementRange(cand, enemies)) return false
    if (minGap > 0 && enemies.some((e) => horizontalGap(cand, e) <= minGap + EPS)) return false
    return terrainService.canEndAt(state, m, cand.pos).ok
  }
  const finish = (out: ModelPlacement[], fps: Footprint[], coherencyRange: number | undefined): ModelPlacement[] | null => {
    const near = (f: Footprint): boolean => nearBoardEdge(f, state.board, shape.edgeWithin as number)
    if (shape.edgeWithin !== undefined && !(shape.edgeAll ? fps.every(near) : fps.some(near))) return null
    const check = checkPlacements({
      unitModels: models, placements: out, constraints: emptyMoveConstraints(1e9, { region: territory, mustEndOutsideEngagement: true, coherency: true }),
      otherFriendly: others, enemies, board: state.board, coherencyRange,
    })
    return check.rejection ? null : out
  }
  return { band, facing, legal, finish }
}

// identical round bases: hex lattice spaced by the base (edge gap 0.12"), points nearest the centre first, each model on the first
// legal one
// F18 (OGM C1): the unit as a line along the battlefield edge nearest `centre`, every model facing inwards with its base edge
// just inside `edgeWithin` of that edge, neighbours PACK_GAP apart, the line centred on the projection of `centre`
function edgeLineFormation(state: GameState, player: PlayerId, models: Model[], coherencyRange: number | undefined, centre: Vec2, shape: PlaceShape): ModelPlacement[] | null {
  const { legal, finish } = formationRules(state, player, models, shape)
  const hw = state.board.w / 2, hh = state.board.h / 2
  const gaps = [{ e: 'W', d: centre.x + hw }, { e: 'E', d: hw - centre.x }, { e: 'S', d: centre.z + hh }, { e: 'N', d: hh - centre.z }]
  gaps.sort((a, b) => a.d - b.d)
  const edge = gaps[0].e
  // inward unit vector, along-edge unit vector, facing (direction (cos, sin) points inwards)
  const inward = edge === 'W' ? { x: 1, z: 0 } : edge === 'E' ? { x: -1, z: 0 } : edge === 'S' ? { x: 0, z: 1 } : { x: 0, z: -1 }
  const along = { x: -inward.z, z: inward.x }
  const facing = Math.atan2(inward.z, inward.x)
  const lim = shape.edgeWithin as number
  const edgePoint = edge === 'W' ? { x: -hw, z: centre.z } : edge === 'E' ? { x: hw, z: centre.z } : edge === 'S' ? { x: centre.x, z: -hh } : { x: centre.x, z: hh }
  // smallest inset (from the edge) at which the base is wholly on the board, plus a little (always inside `edgeWithin`)
  const insetFor = (m: Model): number => {
    for (let d = 0; d < 6; d += 0.05) {
      const f: Footprint = { pos: { x: edgePoint.x + inward.x * d, y: 0, z: edgePoint.z + inward.z * d }, facing, base: m.base }
      if (whollyOnBoard(f, state.board)) return d + Math.min(0.25, lim / 2)
    }
    return 0.5
  }
  const insets = models.map(insetFor)
  const fpAt = (i: number, o: number): Footprint => ({
    pos: { x: r3(edgePoint.x + inward.x * insets[i] + along.x * o), y: 0, z: r3(edgePoint.z + inward.z * insets[i] + along.z * o) }, facing, base: models[i].base,
  })
  // lay the line from offset 0, then shift it so it is centred on `centre`
  const offs: number[] = [0]
  let at = 0
  for (let i = 1; i < models.length; i++) {
    const prev = fpAt(i - 1, at)
    let o = at + 0.1
    for (; o < at + 12; o += 0.05) { const f = fpAt(i, o); if (!basesOverlap(prev, f) && horizontalGap(prev, f) >= PACK_GAP) break }
    offs.push(o)
    at = o
  }
  const shift = -at / 2
  const placed: Footprint[] = []
  const out: ModelPlacement[] = []
  for (let i = 0; i < models.length; i++) {
    const f = fpAt(i, offs[i] + shift)
    if (!legal(models[i], f, placed)) return null
    placed.push(f)
    out.push({ modelId: models[i].id, pos: f.pos, facing })
  }
  return finish(out, placed, coherencyRange)
}

function latticeFormation(state: GameState, player: PlayerId, models: Model[], coherencyRange: number | undefined, centre: Vec2, shape: PlaceShape): ModelPlacement[] | null {
  const { facing, legal, finish } = formationRules(state, player, models, shape)
  const step = 2 * reachOf(models[0]) + 0.12
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
      if (legal(m, cand, placed)) { chosen = cand; break }
    }
    if (!chosen) return null
    placed.push(chosen)
    out.push({ modelId: m.id, pos: chosen.pos, facing })
  }
  return finish(out, placed, coherencyRange)
}

// F16 (Call for Reinforcements fix): oval or mixed bases. A lattice spaced by the longest radius left such units more than ½"
// apart, so they never passed coherency and were never offered. Here the biggest base goes on the legal point nearest the centre
// (rings up to 2" out: the option scan steps centres 1.5" apart), then each other model (biggest first) on the legal spot nearest
// the centre that sits PACK_GAP from an already placed base (contactDistance, 16 directions in the shared facing frame),
// preferring spots in coherency with two placed models (7+ models, CORE-1.7).
function packedFormation(state: GameState, player: PlayerId, models: Model[], coherencyRange: number | undefined, centre: Vec2, shape: PlaceShape): ModelPlacement[] | null {
  const { band, facing, legal, finish } = formationRules(state, player, models, shape)
  const range = coherencyRange ?? 0.5
  const gap = Math.min(PACK_GAP, range / 3)
  const cos = Math.cos(facing), sin = Math.sin(facing)
  const need = models.length >= 7 ? 2 : 1
  const order = models.map((m, i) => ({ m, i })).sort((a, b) => reachOf(b.m) - reachOf(a.m) || a.i - b.i)
  const placed: { m: Model; f: Footprint }[] = []
  const fps = (): Footprint[] => placed.map((p) => p.f)
  const fpAt = (m: Model, p: Vec2): Footprint => ({ pos: { x: r3(p.x), y: 0, z: r3(p.z) }, facing, base: m.base })
  const maxR = 2
  // no point of the search area can be in the 6" edge band: nothing to look for
  if (band && Math.min(state.board.w / 2 - Math.abs(centre.x), state.board.h / 2 - Math.abs(centre.z)) > BAND + maxR) return null
  const first = order[0].m
  let start: Footprint | null = null
  for (let r = 0; r <= maxR + EPS && !start; r += 0.5) {
    const n = r === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * r) / 0.75))
    for (let k = 0; k < n && !start; k++) {
      const a = (2 * Math.PI * k) / n
      const cand = fpAt(first, { x: centre.x + Math.cos(a) * r, z: centre.z + Math.sin(a) * r })
      if (legal(first, cand, [])) start = cand
    }
  }
  if (!start) return null
  placed.push({ m: first, f: start })
  for (const { m } of order.slice(1)) {
    const cands: { f: Footprint; d: number }[] = []
    for (const o of placed) {
      for (let k = 0; k < CONTACT_DIRS; k++) {
        const d = contactDistance(o.m.base, m.base, k, gap)
        const a = (2 * Math.PI * k) / CONTACT_DIRS
        const lx = Math.cos(a) * d, lz = Math.sin(a) * d
        const p = { x: o.f.pos.x + lx * cos - lz * sin, z: o.f.pos.z + lx * sin + lz * cos }
        cands.push({ f: fpAt(m, p), d: dist2D(p, centre) })
      }
    }
    cands.sort((a, b) => a.d - b.d)
    const want = Math.min(need, placed.length)
    const now = fps()
    let chosen: Footprint | null = null
    let fallback: Footprint | null = null
    for (const c of cands) {
      if (!legal(m, c.f, now)) continue
      const links = now.filter((o) => horizontalGap(c.f, o) <= range - 0.05).length
      if (links >= want) { chosen = c.f; break }
      if (!fallback && links >= 1) fallback = c.f
    }
    const f = chosen ?? fallback
    if (!f) return null
    placed.push({ m, f })
  }
  const byId = new Map(placed.map((p) => [p.m.id, p.f]))
  const out: ModelPlacement[] = models.map((m) => ({ modelId: m.id, pos: (byId.get(m.id) as Footprint).pos, facing }))
  return finish(out, fps(), coherencyRange)
}

// up to `max` legal, well-separated spots for the replacement: scans the territory on a 1.5" grid (the whole board on a 2" grid
// for an `anywhere` shape)
export function reinforcementOptions(state: GameState, player: PlayerId, models: Model[], coherencyRange: number | undefined, max = 5, shape: PlaceShape = {}): { id: string; label: string; centre: Vec2 }[] {
  const poly = shape.anywhere ? boardPolygon(state) : territoryOf(state, player)
  const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z)
  const found: Vec2[] = []
  const stepIn = shape.anywhere ? 2 : 1.5
  // F16 (edgeWithin): only centres close enough to a battlefield edge for the packed unit to reach it
  const hw = state.board.w / 2, hh = state.board.h / 2
  const span = shape.edgeWithin === undefined ? Infinity : shape.edgeWithin + 2 * Math.max(0, ...models.map(reachOf)) * Math.ceil(Math.sqrt(models.length))
  for (let z = Math.min(...zs); z <= Math.max(...zs) + EPS; z += stepIn) {
    for (let x = Math.min(...xs); x <= Math.max(...xs) + EPS; x += stepIn) {
      const centre = { x: r3(x), z: r3(z) }
      if (Math.min(hw - Math.abs(centre.x), hh - Math.abs(centre.z)) > span) continue
      if (reinforcementFormation(state, player, models, coherencyRange, centre, shape)) found.push(centre)
      // a yes / no question (max 1: replacementFits, the AI's fits test) needs only one spot
      if (max === 1 && found.length > 0) break
    }
    if (max === 1 && found.length > 0) break
  }
  if (found.length === 0) return []
  // spread: take the ones furthest apart along the table's long axis (F18 edgeAll: around the whole perimeter)
  const long = state.board.w >= state.board.h ? 'x' : 'z'
  if (shape.edgeAll) found.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x))
  else found.sort((a, b) => a[long] - b[long] || a.x - b.x)
  const picks: Vec2[] = []
  const want = Math.min(max, found.length)
  for (let k = 0; k < want; k++) {
    const cand = found[Math.round((k * (found.length - 1)) / Math.max(1, want - 1))]
    if (!picks.some((p) => dist2D(p, cand) < 3)) picks.push(cand)
  }
  const pos = (v: Vec2): string => {
    const lo = long === 'x' ? (v.x < -state.board.w / 6 ? 'left' : v.x > state.board.w / 6 ? 'right' : 'centre') : (v.z < -state.board.h / 6 ? 'top' : v.z > state.board.h / 6 ? 'bottom' : 'centre')
    if (shape.edgeWithin !== undefined) return `${lo} of the territory edge`
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
