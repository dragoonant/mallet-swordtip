// F11 polish: a human setting up a unit cannot stack it on a model already deployed, however the request is phrased
// (same spot, a nudge inside the footprint, or a made-up height that would put the two on "different floors").
import { afterEach, describe, expect, it } from 'vitest'
import {
  createEngine, DEFAULT_MODULES, registerDataBundle, setupModule,
  type DeployUnitAction, type EngineApi, type PendingDecision,
} from '../../src/engine'
import { suggestDeployment } from '../../src/engine/setup'
import { aosBundle, aosPingPhases, makeAosPlayer, makeAosSetup } from '../fixtures'

function realSetupEngine(): EngineApi {
  return createEngine({
    phases: { ...aosPingPhases(), setup: setupModule, deployment: setupModule },
    services: DEFAULT_MODULES.services,
    topics: DEFAULT_MODULES.topics,
  })
}

describe('human deployment overlap (F11)', () => {
  afterEach(() => registerDataBundle(null))

  function setup() {
    const engine = realSetupEngine()
    const r = engine.createGame(makeAosSetup({
      terrainLayoutId: 'fx.terrain.standard', side: 'aqshy', defenderTerritory: 'B',
      players: {
        A: makeAosPlayer('A', { regimentAbilityId: 'fx.a.order-regiment-1' }),
        B: makeAosPlayer('B', { regimentAbilityId: 'fx.a.chaos-regiment-1' }),
      },
    }), 'f11-overlap', aosBundle)
    const pending = r.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    return { engine, state: r.state, pending }
  }

  it('SPH-011 a unit placed on top of an already-deployed unit is rejected', () => {
    const { engine, state, pending } = setup()
    const sug = suggestDeployment(state, 'A:guard')!
    const guard: DeployUnitAction = { type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: 'A:guard', placements: sug.placements }
    expect(engine.validate(state, guard)).toBeNull()
    const placed = engine.step(state, guard)
    expect(placed.rejection ?? null).toBeNull()
    const after = placed.state
    const pend2 = placed.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    const spot = sug.placements[5].pos
    const put = (unitId: string, x: number, z: number, y: number): DeployUnitAction => ({
      type: 'deployUnit', player: 'A', decisionId: pend2.id, unitId,
      placements: state.units[unitId].models.map((id) => ({ modelId: id, pos: { x, y, z }, facing: 0 })),
    })
    const onTop = (y: number, dx = 0): DeployUnitAction => put('A:boss', spot.x + dx, spot.z, y)
    expect(engine.validate(after, onTop(0))?.code).toBe('E_OVERLAP')
    expect(engine.validate(after, onTop(0, 0.4))?.code).toBe('E_OVERLAP')
    // a made-up height is not a floor: deployment is on the ground only
    expect(engine.validate(after, onTop(1))).not.toBeNull()
    expect(engine.validate(after, onTop(0.3))).not.toBeNull()
  })

  it('SPH-011 setting up never stacks a base over one standing at another height', () => {
    const { engine, state, pending } = setup()
    const sug = suggestDeployment(state, 'A:guard')!
    const spot = sug.placements[5].pos
    // a guard model already set up on a raised surface at the spot (as if left there by an earlier answer)
    const guardUnit = state.units['A:guard']
    guardUnit.location = 'board'
    guardUnit.models.forEach((id, i) => { state.models[id].pos = { x: sug.placements[i].pos.x, y: 2, z: sug.placements[i].pos.z } })
    const over: DeployUnitAction = {
      type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: 'A:boss',
      placements: state.units['A:boss'].models.map((id) => ({ modelId: id, pos: { x: spot.x, y: 0, z: spot.z }, facing: 0 })),
    }
    expect(engine.validate(state, over)?.code).toBe('E_OVERLAP')
  })
})
