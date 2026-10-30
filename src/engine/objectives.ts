// Objective control for Spearhead (SPH-6, CORE-17). A model contests an objective when any part of its base overlaps the
// printed circle (objectiveRange 0, circle radius from data, SPH-6.2). A unit's control score on an objective is the sum
// of the Control of its contesting models, adjusted by onObjectiveControl hooks and never below 1 (CORE-17.4). The army
// with the higher total gains control; control is sticky (CORE-17.5): ties and empty circles change nothing. A unit that
// touches 2+ circles counts on one only: the one its centroid is nearest to (the CORE-17.3 player choice is P1).
// The core calls evaluateControl('turnStart') once at the start of round 1 and ('turnEnd') once per turn (SPH-6.4).
import { OBJECTIVE_MARKER_RADIUS, OBJECTIVE_RANGE, dist2D, withinObjectiveRange } from './geometry'
import { hookService } from './hooks-impl'
import { objectiveDisabled } from './cardFlags'
import type { EngineContext } from './modules'
import { boardUnitsOf, modelStats, unitModels } from './state'
import type { GameState, Model, ModelId, Objective, ObjectiveId, PlayerId, UnitId } from './types'

export type ControlMoment = 'turnStart' | 'phaseEnd' | 'turnEnd' | 'rule'

export interface ObjectiveService {
  // every model of `player` whose base overlaps the objective circle (a unit may contest several circles for other rules)
  modelsInRange(state: GameState, objectiveId: ObjectiveId, player: PlayerId): ModelId[]
  // army control score per player on this objective (CORE-17.4); `ctx` is optional, hooks then see a state-only context
  levelOfControl(state: GameState, objectiveId: ObjectiveId, ctx?: EngineContext): Record<PlayerId, number>
  // CORE-17.4 + sticky control: updates Objective.controller, emits ObjectiveControlChanged on change
  evaluateControl(ctx: EngineContext, moment: ControlMoment): void
  controller(state: GameState, objectiveId: ObjectiveId): PlayerId | null
}

function radiusOf(state: GameState, obj: Objective): number {
  return obj.radius ?? state.mission.data.objectiveMarkerRadius ?? OBJECTIVE_MARKER_RADIUS
}

function contestingModels(state: GameState, unitId: UnitId, obj: Objective): Model[] {
  const range = state.mission.data.objectiveRange ?? OBJECTIVE_RANGE
  const radius = radiusOf(state, obj)
  return unitModels(state, unitId).filter((m) => !m.pendingRemoval && withinObjectiveRange(m, obj, 0, range, radius))
}

// Ring of Fire (14-cards §2): a disabled objective is out of play for the round — nobody contests, gains or holds it
function liveObjectives(state: GameState): Objective[] {
  return (Object.values(state.objectives) as Objective[]).filter((o) => !o.removed && !objectiveDisabled(state, o.id))
}

interface Contest { unitId: UnitId; player: PlayerId; models: Model[] }

// per objective: the units that count on it (each unit on exactly one circle, SPH-6.3)
function contestPlan(state: GameState): Map<ObjectiveId, Contest[]> {
  const plan = new Map<ObjectiveId, Contest[]>()
  const objectives = liveObjectives(state)
  for (const o of objectives) plan.set(o.id, [])
  for (const player of ['A', 'B'] as PlayerId[]) {
    for (const unit of boardUnitsOf(state, player)) {
      if (!hookService.contestAllowed(state, unit.id)) continue
      const hits = objectives.map((o) => ({ o, models: contestingModels(state, unit.id, o) })).filter((h) => h.models.length > 0)
      if (hits.length === 0) continue
      let pick = hits[0]
      if (hits.length > 1) {
        const all = unitModels(state, unit.id)
        const cx = all.reduce((a, m) => a + m.pos.x, 0) / all.length
        const cz = all.reduce((a, m) => a + m.pos.z, 0) / all.length
        let best = Infinity
        for (const h of hits) {
          const d = dist2D({ x: cx, z: cz }, h.o.pos)
          if (d < best - 1e-9) { best = d; pick = h }
        }
      }
      plan.get(pick.o.id)!.push({ unitId: unit.id, player, models: pick.models })
    }
  }
  return plan
}

function levelsFor(state: GameState, ctx: EngineContext, obj: Objective, contests: Contest[]): Record<PlayerId, number> {
  const levels: Record<PlayerId, number> = { A: 0, B: 0 }
  for (const c of contests) {
    let base = 0
    for (const m of c.models) base += hookService.statFor(state, { unitId: c.unitId, modelId: m.id, weapon: null, stat: 'OC' }, modelStats(state, m).OC)
    levels[c.player] += hookService.unitControlScore(ctx, c.unitId, obj.id, base)
  }
  return levels
}

const stateOnlyCtx = (state: GameState): EngineContext => ({ state } as unknown as EngineContext)

export const objectiveService: ObjectiveService = {
  modelsInRange(state, objectiveId, player) {
    const obj = state.objectives[objectiveId]
    if (!obj || obj.removed || objectiveDisabled(state, objectiveId)) return []
    const out: ModelId[] = []
    for (const unit of boardUnitsOf(state, player)) {
      if (!hookService.contestAllowed(state, unit.id)) continue
      for (const m of contestingModels(state, unit.id, obj)) out.push(m.id)
    }
    return out
  },
  levelOfControl(state, objectiveId, ctx) {
    const obj = state.objectives[objectiveId]
    if (!obj || obj.removed || objectiveDisabled(state, objectiveId)) return { A: 0, B: 0 }
    const contests = contestPlan(state).get(objectiveId) ?? []
    return levelsFor(state, ctx ?? stateOnlyCtx(state), obj, contests)
  },
  evaluateControl(ctx, moment) {
    const s = ctx.state
    const plan = contestPlan(s)
    for (const obj of liveObjectives(s)) {
      const levels = levelsFor(s, ctx, obj, plan.get(obj.id) ?? [])
      // CORE-17.4/17.5: higher score gains control; a tie (including 0-0) changes nothing
      const to: PlayerId | null = levels.A > levels.B ? 'A' : levels.B > levels.A ? 'B' : obj.controller
      if (obj.controller !== to) {
        const from = obj.controller
        obj.controller = to
        ctx.emit({ type: 'ObjectiveControlChanged', objectiveId: obj.id, from, to, levels, player: to ?? s.activePlayer })
      }
      if (moment === 'turnStart') obj.controllerAtTurnStart = obj.controller
    }
  },
  controller: (state, objectiveId) => {
    const obj = state.objectives[objectiveId]
    return obj && !obj.removed ? obj.controller : null
  },
}
