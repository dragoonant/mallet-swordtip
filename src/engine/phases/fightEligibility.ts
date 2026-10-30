// CORE-11.3 over hypothetical positions: which models of a unit could attack in combat if each stood at the given spot.
// A model can attack when an enemy model is within its 3" combat range (horizontal, no vertical limit); there is no
// base-contact chain in AoS. Pure; the client uses it to preview the result of a pile-in drag before it is confirmed.
// (Visibility, the second half of "in combat", is checked by fight.ts when targets are listed.)
import { ENGAGEMENT_H, horizontalGap } from '../geometry'
import { enemyModelsOnBoard, unitModels } from '../state'
import type { GameState, ModelId, UnitId, Vec3 } from '../types'

const EPS = 1e-6

/** Ids of the unit's models that can fight when each model stands at `positions[modelId]` (models without an entry stay put). */
export function fightingModelIds(state: GameState, unitId: UnitId, positions: Readonly<Record<ModelId, Vec3>> = {}): Set<ModelId> {
  const unit = state.units[unitId]
  if (!unit) return new Set()
  const models = unitModels(state, unitId).map((m) => ({ ...m, pos: positions[m.id] ?? m.pos }))
  const enemies = enemyModelsOnBoard(state, unit.player)
  return new Set(models.filter((m) => enemies.some((e) => horizontalGap(m, e) <= ENGAGEMENT_H + EPS)).map((m) => m.id))
}
