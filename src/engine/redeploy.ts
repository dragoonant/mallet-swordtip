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
import { basesOverlap, dist2D, EPS, horizontalGap, whollyOnBoard, type Footprint } from './geometry'
import type { EngineContext } from './modules'
import { resolveSetUp } from './phases/movement'
import { boardModelsOf, enemyModelsOnBoard, setModelPos, unitModels } from './state'
import { terrainService } from './terrain'
import type { ModelPlacement } from './actions'
import type { GameState, Model, PlayerId, UnitId, Vec2 } from './types'

export interface RedeployRequest {
  abilityId: string
  player: PlayerId
  // units still to be set up again, in order (the first is asked next)
  unitIds: UnitId[]
  minEnemyDistance: number
  markSetUp?: boolean
}

const PREFIX = 'abil:redeploy='

export function readRedeploy(state: GameState): RedeployRequest | null {
  const m = state.phaseState.marks.find((x) => x.startsWith(PREFIX))
  return m ? (JSON.parse(m.slice(PREFIX.length)) as RedeployRequest) : null
}

export function writeRedeploy(state: GameState, r: RedeployRequest | null): void {
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(PREFIX))
  if (r && r.unitIds.length > 0) state.phaseState.marks.push(PREFIX + JSON.stringify(r))
}

// queue a redeploy (only the player's own units on the board are kept); the ability loop asks for each spot next
export function requestRedeploy(state: GameState, r: RedeployRequest): void {
  const unitIds = r.unitIds.filter((id) => state.units[id]?.player === r.player && state.units[id]?.location === 'board' && unitModels(state, id).length > 0)
  writeRedeploy(state, { ...r, unitIds })
}

const reach = (m: Model): number => Math.max(m.base.radius, m.base.radius2 ?? m.base.radius)
const r3 = (v: number): number => Math.round(v * 1000) / 1000

// a compact blob of the unit's models around `centre`, or null when it does not fit there legally
export function redeployFormation(state: GameState, unitId: UnitId, centre: Vec2, minEnemyDistance: number): ModelPlacement[] | null {
  const unit = state.units[unitId]
  const models = unit ? unitModels(state, unitId) : []
  if (!unit || models.length === 0) return null
  const others = boardModelsOf(state, unit.player).filter((m) => m.unitId !== unitId)
  const enemies = enemyModelsOnBoard(state, unit.player)
  const step = 2 * Math.max(...models.map(reach)) + 0.12
  const span = Math.ceil(Math.sqrt(models.length) + 2)
  const pts: Vec2[] = []
  for (let j = -span; j <= span; j++) for (let i = -span; i <= span; i++) pts.push({ x: centre.x + (i + (Math.abs(j) % 2) * 0.5) * step, z: centre.z + j * step * 0.88 })
  pts.sort((a, b) => dist2D(a, centre) - dist2D(b, centre))
  const facing = models[0].facing
  const placed: Footprint[] = []
  const out: ModelPlacement[] = []
  for (const m of models) {
    let chosen: Footprint | null = null
    for (const p of pts) {
      const cand: Footprint = { pos: { x: r3(p.x), y: 0, z: r3(p.z) }, facing, base: m.base }
      if (!whollyOnBoard(cand, state.board)) continue
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

// up to `max` legal, well-separated spots (2" grid over the whole board), closest to the enemy first
export function redeployOptions(state: GameState, unitId: UnitId, minEnemyDistance: number, max = 6): { id: string; label: string; centre: Vec2; value: number }[] {
  const unit = state.units[unitId]
  if (!unit) return []
  const hw = state.board.w / 2, hh = state.board.h / 2
  const found: Vec2[] = []
  for (let z = -hh + 1.5; z <= hh - 1.5 + EPS; z += 2) {
    for (let x = -hw + 1.5; x <= hw - 1.5 + EPS; x += 2) {
      const centre = { x: r3(x), z: r3(z) }
      if (redeployFormation(state, unitId, centre, minEnemyDistance)) found.push(centre)
    }
  }
  found.sort((a, b) => enemyGap(state, unit.player, a) - enemyGap(state, unit.player, b) || a.x - b.x || a.z - b.z)
  const picks: Vec2[] = []
  for (const f of found) { if (picks.length >= max) break; if (!picks.some((p) => dist2D(p, f) < 4)) picks.push(f) }
  return picks.map((c, i) => ({ id: `at:${c.x}:${c.z}`, label: `Set up at (${c.x.toFixed(0)}, ${c.z.toFixed(0)})`, centre: c, value: 1 - i * 0.05 }))
}

// lifts the unit and sets it up around `centre`; false (nothing changed) when that spot is not legal now
export function applyRedeploy(ctx: EngineContext, unitId: UnitId, centre: Vec2, minEnemyDistance: number, markSetUp = false): boolean {
  const s = ctx.state
  const u = s.units[unitId]
  if (!u || u.location !== 'board') return false
  const placements = redeployFormation(s, unitId, centre, minEnemyDistance)
  if (!placements) return false
  for (const p of placements) { const m = s.models[p.modelId]; if (m) setModelPos(m, p.pos, p.facing) }
  if (markSetUp) u.setUpTurn = { round: s.round, player: u.player }
  ctx.emit({ type: 'UnitDeployed', unitId, toReserves: false, player: u.player })
  return true
}
