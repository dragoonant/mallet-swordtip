// Objective-count model for the utility AI (owner: src/ai). Spearhead scores at the end of each of your own turns: +1 for holding
// one objective, +1 for two, +1 for holding more than the opponent (SPH-11.1), and control is decided at the end of every turn by
// summed Control on the circle, sticky on a tie (SPH-6.3/6.4). objectivePull (utility.ts) only knows "near a marker is good"; this
// file answers the sharper question "if this unit ends here (or that enemy unit loses models), who controls what at the end of the
// turn, and what is that worth in VP for both sides?". It is the term that makes a unit step onto a circle only when its Control
// actually flips or keeps it, steal an enemy marker it can out-number, and value the hold-more point.
import { DEFAULT_SERVICES, boardUnitsOf, modelStats, unitModels, withinObjectiveRange, type Footprint, type GameState, type ModelPlacement, type ObjectiveId, type PlayerId, type UnitId } from '../engine'
import { objectiveDisabled } from '../engine/cardFlags'

interface Contribution { obj: ObjectiveId; oc: number }
interface ObjBoard {
  ids: ObjectiveId[]
  pos: Record<ObjectiveId, { x: number; z: number }>
  ctl: Record<ObjectiveId, PlayerId | null>
  levels: Record<ObjectiveId, Record<PlayerId, number>>
  contrib: Map<UnitId, Contribution>
}

type OcFoot = Footprint & { oc: number }
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')
const cache = new WeakMap<GameState, ObjBoard>()

// the objective a set of footprints counts on (each unit counts on one circle only: the one nearest its centre, SPH-6.3) and the
// Control it brings there (never below 1, CORE-17.4)
function contributionOf(state: GameState, ids: ObjectiveId[], pos: Record<ObjectiveId, { x: number; z: number }>, feet: OcFoot[]): Contribution | null {
  if (feet.length === 0) return null
  let best: Contribution | null = null
  let bestD = Infinity
  const cx = feet.reduce((a, f) => a + f.pos.x, 0) / feet.length
  const cz = feet.reduce((a, f) => a + f.pos.z, 0) / feet.length
  for (const id of ids) {
    const obj = state.objectives[id]
    let oc = 0, any = false
    for (const f of feet) {
      if (withinObjectiveRange(f, obj)) { oc += f.oc; any = true }
    }
    if (!any) continue
    const d = Math.hypot(pos[id].x - cx, pos[id].z - cz)
    if (d < bestD) { bestD = d; best = { obj: id, oc: Math.max(1, oc) } }
  }
  return best
}

function boardOf(state: GameState): ObjBoard {
  const hit = cache.get(state)
  if (hit) return hit
  const ids = Object.values(state.objectives).filter((o) => !o.removed && !objectiveDisabled(state, o.id)).map((o) => o.id)
  const pos: ObjBoard['pos'] = {}, ctl: ObjBoard['ctl'] = {}, levels: ObjBoard['levels'] = {}
  for (const id of ids) {
    pos[id] = state.objectives[id].pos
    ctl[id] = DEFAULT_SERVICES.objectives.controller(state, id)
    levels[id] = { ...DEFAULT_SERVICES.objectives.levelOfControl(state, id) }
  }
  const contrib = new Map<UnitId, Contribution>()
  for (const p of ['A', 'B'] as PlayerId[]) {
    for (const u of boardUnitsOf(state, p)) {
      const feet: OcFoot[] = unitModels(state, u.id).map((m) => ({ pos: m.pos, facing: m.facing, base: m.base, oc: modelStats(state, m).OC }))
      const c = contributionOf(state, ids, pos, feet)
      if (c) contrib.set(u.id, c)
    }
  }
  const out = { ids, pos, ctl, levels, contrib }
  cache.set(state, out)
  return out
}

const vpFor = (mine: number, theirs: number): number => (mine >= 1 ? 1 : 0) + (mine >= 2 ? 1 : 0) + (mine > theirs ? 1 : 0)

export interface ObjectiveChange {
  // the unit that moves and where its models end ([] = off every circle); omit to leave everyone where they stand
  unitId?: UnitId
  placements?: ModelPlacement[]
  // an enemy unit that loses this share of its Control (shooting / combat that kills part of it)
  removed?: { unitId: UnitId; share: number }
}

// VP-ish worth of the end-of-turn control picture after `change`, from `player`'s side: what the turn's scorer collects counts in
// full and the other side's tally at half (it gets a turn to answer before it scores). Compare two calls, never read one alone.
const winnerOf = (l: Record<PlayerId, number>, sticky: PlayerId | null): PlayerId | null => (l.A > l.B ? 'A' : l.B > l.A ? 'B' : sticky)

function levelsAfter(state: GameState, b: ObjBoard, change: ObjectiveChange): Record<ObjectiveId, Record<PlayerId, number>> {
  const levels: Record<ObjectiveId, Record<PlayerId, number>> = {}
  for (const id of b.ids) levels[id] = { ...b.levels[id] }
  if (change.unitId && change.placements) {
    const u = state.units[change.unitId]
    if (u) {
      const cur = b.contrib.get(change.unitId)
      if (cur) levels[cur.obj][u.player] = Math.max(0, levels[cur.obj][u.player] - cur.oc)
      const feet: OcFoot[] = []
      for (const p of change.placements) {
        const m = state.models[p.modelId]
        if (m) feet.push({ pos: p.pos, facing: p.facing ?? m.facing, base: m.base, oc: modelStats(state, m).OC })
      }
      const next = contributionOf(state, b.ids, b.pos, feet)
      if (next) levels[next.obj][u.player] += next.oc
    }
  }
  return levels
}

// who controls each live objective at the end of the turn if `change` happens (same model as objectiveVp; army hints use it for
// the cards that name one objective)
export function controlAfter(state: GameState, change: ObjectiveChange = {}): Record<ObjectiveId, PlayerId | null> {
  const b = boardOf(state)
  const levels = levelsAfter(state, b, change)
  const out: Record<ObjectiveId, PlayerId | null> = {}
  for (const id of b.ids) out[id] = winnerOf(levels[id], b.ctl[id])
  return out
}

export function objectiveVp(state: GameState, player: PlayerId, change: ObjectiveChange = {}): number {
  const b = boardOf(state)
  if (b.ids.length === 0) return 0
  const levels = levelsAfter(state, b, change)
  if (change.removed) {
    const u = state.units[change.removed.unitId]
    const cur = b.contrib.get(change.removed.unitId)
    if (u && cur) levels[cur.obj][u.player] = Math.max(0, levels[cur.obj][u.player] - cur.oc * Math.min(1, change.removed.share))
  }
  let mine = 0, theirs = 0
  const foe = other(player)
  for (const id of b.ids) {
    const to = winnerOf(levels[id], b.ctl[id])
    if (to === player) mine++
    else if (to === foe) theirs++
  }
  const myTurn = state.activePlayer === player
  return (myTurn ? 1 : 0.5) * vpFor(mine, theirs) - (myTurn ? 0.5 : 1) * vpFor(theirs, mine)
}

// the Control the unit adds where it stands now, or null when it is on no circle
export function currentContribution(state: GameState, unitId: UnitId): { obj: ObjectiveId; oc: number } | null {
  return boardOf(state).contrib.get(unitId) ?? null
}
