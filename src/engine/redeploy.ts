// Out-of-phase redeploy (FYR-RA-1 Magmic Tunnels; generic, no army knowledge): an ability lifts some of its player's units off
// the battlefield and sets each of them up again anywhere, more than `minEnemyDistance` from every enemy model. A code hook's
// `resolve` calls `requestRedeploy`; abilities.ts (nextStep) then asks the player, one unit at a time, where it goes
// (chooseOption topic 'abilityMode', data.redeploy = true; options `at:<x>:<z>` = formation centres, pass = the unit stays where
// it is). Each spot is checked with the reserve-arrival validator (phases/movement.ts resolveSetUp: wholly on the board, clear of
// other models, coherent, legal terrain, more than minEnemyDistance from enemies).
//
// A redeployed unit keeps its effects, wounds and enhancement. `markSetUp` (default false) records it as set up this turn
// (CORE-6.13: Unit.setUpTurn, no Move abilities in that turn's movement phase) like a reserve arrival. RULING: a set-up at the
// start of a battle round happens outside any turn, so Magmic Tunnels leaves it false.
import { basesOverlap, dist2D, EPS, horizontalGap, whollyOnBoard, whollyWithinOf, whollyWithinPolygon, type Footprint } from './geometry'
import type { EngineContext } from './modules'
import { resolveSetUp } from './phases/movement'
import { boardModelsOf, enemyModelsOnBoard, setModelPos, unitModels } from './state'
import { terrainService } from './terrain'
import type { ModelPlacement } from './actions'
import type { GameState, Model, PlayerId, Polygon, UnitId, Vec2 } from './types'

export interface RedeployRequest {
  abilityId: string
  player: PlayerId
  // units still to be set up again, in order (the first is asked next)
  unitIds: UnitId[]
  minEnemyDistance: number
  markSetUp?: boolean
  // F8 (LRL-AB-4 Leap into the Storm): every model must also end wholly within this polygon
  region?: Polygon
  // F8 (KO-BT-1 Ply the Skies, C2): every model must end wholly within `whollyWithin` inches of some model of `unitId`; the
  // options are centres on rings around that unit
  anchor?: { unitId: UnitId; whollyWithin: number }
  // F8 C2: where the units' models stood before they were lifted (liftForRedeploy records it). When no legal spot exists the
  // unit goes back there if that is still legal, else to the legal spot nearest to it; a lifted unit is never left off the table
  origin?: ModelPlacement[]
  // F8 C2: the request waits for this ability window before it is asked (an anchored set-up waits for 'moveEnded', after the
  // anchor unit has moved). Absent = asked at the next window, as before.
  atWindow?: string
}

// F8 C2: take a unit off the battlefield for a later set-up (location 'reserves' until the request places it). Returns the
// placements it stood at (pass them as RedeployRequest.origin). No event besides UnitRemovedFromBattlefield is emitted.
export function liftForRedeploy(ctx: EngineContext, unitId: UnitId, source = 'redeploy'): ModelPlacement[] {
  const s = ctx.state
  const u = s.units[unitId]
  if (!u || u.location !== 'board') return []
  const origin = unitModels(s, unitId).map((m) => ({ modelId: m.id, pos: { ...m.pos }, facing: m.facing }))
  u.location = 'reserves'
  ctx.emit({ type: 'UnitRemovedFromBattlefield', unitId, source, player: u.player })
  return origin
}

export interface RedeployShape { region?: Polygon; anchor?: { unitId: UnitId; whollyWithin: number } }

const shapeOf = (r: RedeployRequest | RedeployShape | undefined): RedeployShape => ({ ...(r?.region ? { region: r.region } : {}), ...(r?.anchor ? { anchor: r.anchor } : {}) })

const PREFIX = 'abil:redeploy='

export function readRedeploy(state: GameState): RedeployRequest | null {
  const m = state.phaseState.marks.find((x) => x.startsWith(PREFIX))
  return m ? (JSON.parse(m.slice(PREFIX.length)) as RedeployRequest) : null
}

export function writeRedeploy(state: GameState, r: RedeployRequest | null): void {
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(PREFIX))
  if (r && r.unitIds.length > 0) state.phaseState.marks.push(PREFIX + JSON.stringify(r))
}

// queue a redeploy (only the player's own units on the board are kept, or lifted ones when `origin` is given); the ability
// loop asks for each spot next
export function requestRedeploy(state: GameState, r: RedeployRequest): void {
  const lifted = new Set((r.origin ?? []).map((p) => state.models[p.modelId]?.unitId))
  const unitIds = r.unitIds.filter((id) => state.units[id]?.player === r.player && (state.units[id]?.location === 'board' || (lifted.has(id) && state.units[id]?.location === 'reserves')) && unitModels(state, id).length > 0)
  writeRedeploy(state, { ...r, unitIds })
}

// may the queued unit be asked now? (lifted units waiting in reserves count)
export function redeployable(state: GameState, r: RedeployRequest, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u) return false
  if (u.location === 'board') return true
  return u.location === 'reserves' && (r.origin ?? []).some((p) => state.models[p.modelId]?.unitId === unitId)
}

// F8 C2 fall-back for a lifted unit with no legal spot: its origin if still legal, else the legal spot nearest to it
export function fallbackRedeploy(ctx: EngineContext, r: RedeployRequest, unitId: UnitId): boolean {
  const s = ctx.state
  const u = s.units[unitId]
  if (!u) return false
  const origin = (r.origin ?? []).filter((p) => s.models[p.modelId]?.unitId === unitId && unitModels(s, unitId).some((m) => m.id === p.modelId))
  if (origin.length > 0 && resolveSetUp(s, unitId, origin, { minEnemyDistance: 0, anywhere: true }).rejection === null && !originInCombat(s, unitId, origin)) {
    placeAt(ctx, unitId, origin, r.markSetUp === true)
    return true
  }
  const c = origin.length > 0 ? { x: origin.reduce((a, p) => a + p.pos.x, 0) / origin.length, z: origin.reduce((a, p) => a + p.pos.z, 0) / origin.length } : null
  const opts = redeployOptions(s, unitId, Math.max(3, r.minEnemyDistance), 40)
  if (c) opts.sort((a, b) => dist2D(a.centre, c) - dist2D(b.centre, c))
  return opts.length > 0 && applyRedeploy(ctx, unitId, opts[0].centre, Math.max(3, r.minEnemyDistance), r.markSetUp === true)
}

function originInCombat(state: GameState, unitId: UnitId, placements: ModelPlacement[]): boolean {
  const enemies = enemyModelsOnBoard(state, state.units[unitId].player)
  return placements.some((p) => { const m = state.models[p.modelId]; return !!m && enemies.some((e) => horizontalGap({ pos: p.pos, facing: p.facing ?? m.facing, base: m.base }, e) <= 3 + EPS) })
}

function placeAt(ctx: EngineContext, unitId: UnitId, placements: ModelPlacement[], markSetUp: boolean): void {
  const s = ctx.state
  const u = s.units[unitId]
  for (const p of placements) { const m = s.models[p.modelId]; if (m) setModelPos(m, p.pos, p.facing ?? m.facing) }
  u.location = 'board'
  if (markSetUp) u.setUpTurn = { round: s.round, player: u.player }
  ctx.emit({ type: 'UnitDeployed', unitId, toReserves: false, player: u.player })
}

const reach = (m: Model): number => Math.max(m.base.radius, m.base.radius2 ?? m.base.radius)
const r3 = (v: number): number => Math.round(v * 1000) / 1000

// a compact blob of the unit's models around `centre`, or null when it does not fit there legally. `shape` (F8): the region
// every model must be wholly within, and/or the unit every model must be wholly within N" of
export function redeployFormation(state: GameState, unitId: UnitId, centre: Vec2, minEnemyDistance: number, shape: RedeployShape = {}): ModelPlacement[] | null {
  const unit = state.units[unitId]
  const models = unit ? unitModels(state, unitId) : []
  if (!unit || models.length === 0) return null
  const others = boardModelsOf(state, unit.player).filter((m) => m.unitId !== unitId)
  const enemies = enemyModelsOnBoard(state, unit.player)
  const anchorModels = shape.anchor ? (state.units[shape.anchor.unitId]?.location === 'board' ? unitModels(state, shape.anchor.unitId) : []) : null
  if (anchorModels && anchorModels.length === 0) return null
  const step = 2 * Math.max(...models.map(reach)) + 0.12
  const span = Math.ceil(Math.sqrt(models.length) + 2)
  const pts: Vec2[] = []
  // rows are 0.88 steps apart; an oval base (cavalry, 60x35) is only as deep as its short side, and a row that far away leaves a 5-model
  // unit out of coherency (HOS-ENH-4 Soul-Musk on the Seekers), so the rows close up to the short side + 0.12"
  const rowStep = Math.min(step * 0.88, 2 * Math.min(...models.map((m) => Math.min(m.base.radius, m.base.radius2 ?? m.base.radius))) + 0.12)
  for (let j = -span; j <= span; j++) for (let i = -span; i <= span; i++) pts.push({ x: centre.x + (i + (Math.abs(j) % 2) * 0.5) * step, z: centre.z + j * rowStep })
  pts.sort((a, b) => dist2D(a, centre) - dist2D(b, centre))
  const facing = models[0].facing
  const placed: Footprint[] = []
  const out: ModelPlacement[] = []
  for (const m of models) {
    let chosen: Footprint | null = null
    for (const p of pts) {
      const cand: Footprint = { pos: { x: r3(p.x), y: 0, z: r3(p.z) }, facing, base: m.base }
      if (!whollyOnBoard(cand, state.board)) continue
      if (shape.region && !whollyWithinPolygon(cand, shape.region)) continue
      if (anchorModels && shape.anchor && !anchorModels.some((a) => whollyWithinOf(cand, a, shape.anchor!.whollyWithin))) continue
      if (placed.some((o) => basesOverlap(cand, o)) || others.some((o) => basesOverlap(cand, o))) continue
      if (enemies.some((e) => horizontalGap(cand, e) <= minEnemyDistance + EPS)) continue
      if (!terrainService.canEndAt(state, m, cand.pos).ok) continue
      chosen = cand
      break
    }
    if (!chosen) return null
    placed.push(chosen)
    out.push({ modelId: m.id, pos: chosen.pos, facing })
  }
  return resolveSetUp(state, unitId, out, { minEnemyDistance, anywhere: true }).rejection ? null : out
}

// nearest enemy gap of a spot (smaller = more aggressive; the AI takes the first option, so options are sorted by it)
function enemyGap(state: GameState, player: PlayerId, c: Vec2): number {
  const enemies = enemyModelsOnBoard(state, player)
  return enemies.length === 0 ? 0 : Math.min(...enemies.map((e) => dist2D(c, e.pos)))
}

// up to `max` legal, well-separated spots (2" grid over the whole board, or 1" rings around the anchor unit), closest to the
// enemy first
export function redeployOptions(state: GameState, unitId: UnitId, minEnemyDistance: number, max = 6, shape: RedeployShape = {}): { id: string; label: string; centre: Vec2; value: number }[] {
  const unit = state.units[unitId]
  if (!unit) return []
  const hw = state.board.w / 2, hh = state.board.h / 2
  const found: Vec2[] = []
  const centres: Vec2[] = []
  if (shape.anchor) {
    const am = state.units[shape.anchor.unitId]?.location === 'board' ? unitModels(state, shape.anchor.unitId) : []
    if (am.length === 0) return []
    const c = { x: am.reduce((a, m) => a + m.pos.x, 0) / am.length, z: am.reduce((a, m) => a + m.pos.z, 0) / am.length }
    const R = Math.max(...am.map(reach)) + shape.anchor.whollyWithin + 2
    for (let rad = 0; rad <= R + EPS; rad += 1) {
      const n = rad === 0 ? 1 : Math.max(8, Math.round(rad * 6))
      for (let i = 0; i < n; i++) centres.push({ x: r3(c.x + rad * Math.cos((2 * Math.PI * i) / n)), z: r3(c.z + rad * Math.sin((2 * Math.PI * i) / n)) })
    }
  } else {
    for (let z = -hh + 1.5; z <= hh - 1.5 + EPS; z += 2) for (let x = -hw + 1.5; x <= hw - 1.5 + EPS; x += 2) centres.push({ x: r3(x), z: r3(z) })
  }
  for (const centre of centres) if (redeployFormation(state, unitId, centre, minEnemyDistance, shape)) found.push(centre)
  found.sort((a, b) => enemyGap(state, unit.player, a) - enemyGap(state, unit.player, b) || a.x - b.x || a.z - b.z)
  const picks: Vec2[] = []
  const sep = shape.anchor ? 1.5 : 4
  for (const f of found) { if (picks.length >= max) break; if (!picks.some((p) => dist2D(p, f) < sep)) picks.push(f) }
  return picks.map((c, i) => ({ id: `at:${c.x}:${c.z}`, label: `Set up at (${c.x.toFixed(0)}, ${c.z.toFixed(0)})`, centre: c, value: 1 - i * 0.05 }))
}

// lifts the unit and sets it up around `centre`; false (nothing changed) when that spot is not legal now. A unit lifted with
// liftForRedeploy (location 'reserves') is put back on the battlefield.
export function applyRedeploy(ctx: EngineContext, unitId: UnitId, centre: Vec2, minEnemyDistance: number, markSetUp = false, shape: RedeployShape = {}): boolean {
  const s = ctx.state
  const u = s.units[unitId]
  if (!u || (u.location !== 'board' && u.location !== 'reserves')) return false
  const placements = redeployFormation(s, unitId, centre, minEnemyDistance, shape)
  if (!placements) return false
  placeAt(ctx, unitId, placements, markSetUp)
  return true
}

export { shapeOf as redeployShapeOf }
