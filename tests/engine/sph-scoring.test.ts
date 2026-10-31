// WP3: objective control (SPH-6, CORE-17) and end-of-turn scoring (SPH-11) on the checklist fixtures.
import { describe, expect, it } from 'vitest'
import {
  createContext, DEFAULT_MODULES, SeededRng, setModelPos, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { missionService, setUpInReserve } from '../../src/engine/missions'
import { objectiveService } from '../../src/engine/objectives'
import { aosBundle, aosPingEngine, aosState, autoDeployAos, makeAosSetup } from '../fixtures'

const FAR: [number, number] = [14, 10]

// put `unitId` on the board: the first models at `at`, every other model far from all objectives
function put(state: GameState, unitId: UnitId, at: [number, number][], facing = 0): void {
  const unit = state.units[unitId]
  unit.location = 'board'
  unit.models.forEach((id, i) => {
    const p = at[i] ?? FAR
    setModelPos(state.models[id], { x: p[0] + (at[i] ? 0 : (i % 5) * 1.5), y: 0, z: p[1] - (at[i] ? 0 : Math.floor(i / 5) * 1.5) }, facing)
  })
}

function ctxFor(state: GameState): { ctx: EngineContext; events: GameEvent[] } {
  const { ctx, events } = createContext(state, new SeededRng('scoring'), DEFAULT_MODULES)
  return { ctx, events }
}

// centre distance that puts a base `overlap` inches over the circle edge (negative = clear of it)
const reach = (state: GameState, unitId: UnitId, radius: number, overlap: number): number => radius + state.models[state.units[unitId].models[0]].base.radius - overlap

describe('objective control (WP3)', () => {
  it('OBJ-001 a base overlapping the circle by 0.01" contests; 0.01" clear or 2" away does not', () => {
    const state = aosState()
    const obj = state.objectives['obj-c']
    expect(obj.radius).toBe(3)
    const levelAt = (dx: number): number => {
      put(state, 'A:guard', [[dx, 0]])
      return objectiveService.levelOfControl(state, 'obj-c').A
    }
    expect(levelAt(reach(state, 'A:guard', 3, 0.01))).toBe(1)
    expect(levelAt(reach(state, 'A:guard', 3, -0.01))).toBe(0)
    expect(levelAt(reach(state, 'A:guard', 3, -2))).toBe(0)
  })

  it('OBJ-002 3 Guards (Control 1) outscore a Boss (Control 2): the Guards\' player gains control', () => {
    const state = aosState()
    put(state, 'A:guard', [[-1, 0], [0, 0], [1, 0]])
    put(state, 'B:boss', [[0, 2]])
    const { ctx, events } = ctxFor(state)
    expect(objectiveService.levelOfControl(state, 'obj-c')).toEqual({ A: 3, B: 2 })
    objectiveService.evaluateControl(ctx, 'turnEnd')
    expect(state.objectives['obj-c'].controller).toBe('A')
    const change = events.find((e) => e.type === 'ObjectiveControlChanged')
    expect(change).toMatchObject({ objectiveId: 'obj-c', from: null, to: 'A' })
  })

  it('OBJ-003 a unit with a -5 Control modifier still counts as 1', () => {
    const state = aosState()
    put(state, 'B:boss', [[0, 0]])
    // base Control 2, modified by -5 -> the unit score is floored at 1 (CORE-17.4)
    state.abilities = { ...state.abilities, 'fx.a.drained': { id: 'fx.a.drained', name: 'Drained', text: 'fixture', trigger: 'always', source: 'datasheet', bearerModelId: null, effect: { modifyStat: { stat: 'OC', value: -5 } }, scope: { who: 'self' } } }
    state.units['B:boss'].effects.push({
      id: 'drain', sourceAbilityId: 'fx.a.drained', sourceUnitId: 'B:boss', effect: { modifyStat: { stat: 'OC', value: -5 } }, scope: { who: 'self' },
      expires: { kind: 'battle', round: 1, player: null }, when: null,
    })
    expect(objectiveService.levelOfControl(state, 'obj-c').B).toBe(1)
  })

  it('OBJ-005 a tie keeps the current controller, also 0-0', () => {
    const state = aosState()
    state.objectives['obj-c'].controller = 'A'
    put(state, 'A:guard', [[-1, 0], [1, 0]])
    put(state, 'B:guard', [[0, 1], [0, -1]])
    const { ctx } = ctxFor(state)
    objectiveService.evaluateControl(ctx, 'turnEnd')
    expect(objectiveService.levelOfControl(state, 'obj-c')).toEqual({ A: 2, B: 2 })
    expect(state.objectives['obj-c'].controller).toBe('A')
    // nobody on it
    put(state, 'A:guard', [])
    put(state, 'B:guard', [])
    objectiveService.evaluateControl(ctx, 'turnEnd')
    expect(state.objectives['obj-c'].controller).toBe('A')
  })

  it('OBJ-006 control is sticky: a unit that leaves keeps the objective for its player', () => {
    const state = aosState()
    put(state, 'A:guard', [[0, 0]])
    const { ctx } = ctxFor(state)
    objectiveService.evaluateControl(ctx, 'turnEnd')
    expect(state.objectives['obj-c'].controller).toBe('A')
    put(state, 'A:guard', [])
    objectiveService.evaluateControl(ctx, 'turnEnd')
    expect(state.objectives['obj-c'].controller).toBe('A')
    // and only an opponent with a higher score takes it
    put(state, 'B:guard', [[0, 0]])
    objectiveService.evaluateControl(ctx, 'turnEnd')
    expect(state.objectives['obj-c'].controller).toBe('B')
  })

  it('OBJ-007 a unit on two circles counts on the nearer one only', () => {
    const state = aosState()
    // obj-c at (0,0) and obj-a at (-6,-6) are 8.5" apart: stand between them, nearer to obj-c
    put(state, 'A:boss', [[-2.2, -2.2]])
    const c = objectiveService.levelOfControl(state, 'obj-c').A
    const a = objectiveService.levelOfControl(state, 'obj-a').A
    expect(c + a).toBe(2)
    expect([c, a]).toEqual([2, 0])
  })
})

describe('scoring (WP3)', () => {
  const scoreFor = (setControl: Partial<Record<string, PlayerId>>, active: PlayerId = 'A'): GameState => {
    const state = aosState()
    state.activePlayer = active
    state.round = 1
    for (const [id, who] of Object.entries(setControl)) state.objectives[id].controller = who as PlayerId
    const { ctx } = ctxFor(state)
    missionService.onWindow(ctx, 'turn.end.scoring', 'turn')
    return state
  }

  it('SPH-020 controlling 1 objective while the opponent controls 2 scores 1 VP', () => {
    const state = scoreFor({ 'obj-c': 'A', 'obj-w': 'B', 'obj-e': 'B' })
    expect(state.players.A.vp).toBe(1)
    expect(state.players.B.vp).toBe(0)
  })

  it('SPH-021 controlling 2 vs 2 scores 2 VP, 3 vs 1 scores 3 VP, 0 scores nothing', () => {
    expect(scoreFor({ 'obj-c': 'A', 'obj-w': 'A', 'obj-e': 'B', 'obj-a': 'B' }).players.A.vp).toBe(2)
    expect(scoreFor({ 'obj-c': 'A', 'obj-w': 'A', 'obj-a': 'A', 'obj-e': 'B' }).players.A.vp).toBe(3)
    expect(scoreFor({ 'obj-e': 'B' }).players.A.vp).toBe(0)
  })

  it('SPH-023 only the active player scores at the end of a turn', () => {
    const state = scoreFor({ 'obj-c': 'B', 'obj-w': 'B', 'obj-e': 'B' }, 'A')
    expect(state.players.B.vp).toBe(0)
    expect(state.players.A.vp).toBe(0)
    const own = scoreFor({ 'obj-c': 'B', 'obj-w': 'B', 'obj-e': 'B' }, 'B')
    expect(own.players.B.vp).toBe(3)
  })

  it('SPH-021 end to end: holding 2 of 3 held objectives at the end of turn 1 scores 3 VP for the first player', () => {
    const engine = aosPingEngine()
    const start = engine.createGame(makeAosSetup(), 'sph-scoring-e2e', aosBundle)
    const state = structuredClone(start.state)
    put(state, 'A:guard', [[0, 0]])
    let r = { ...start, state }
    const events: GameEvent[] = []
    for (let i = 0; i < 200 && r.state.activePlayer === 'A'; i++) {
      const legal = engine.legalActions(r.state, r.pending!)!
      r = engine.step(r.state, legal[0])
      events.push(...r.events)
    }
    expect(r.state.activePlayer).toBe('B')
    expect(r.state.objectives['obj-c'].controller).toBe('A')
    // A deployed on obj-a and moved onto obj-c: 2 objectives to 1 -> hold one, hold two, hold more
    expect(r.state.players.A.vp).toBe(3)
    expect(events.filter((e) => e.type === 'VpScored').map((e) => (e as { source: string }).source)).toEqual(['sph.vp.holdOne', 'sph.vp.holdTwo', 'sph.vp.holdMore'])
    expect(r.state.players.B.vp).toBe(0)
  })

  it('SPH-014 / ROUND-019 a unit set up in reserve by a Deploy ability and still there at the start of round 4 is destroyed; one held back by a battle trait is not (core 24.1)', () => {
    const state = aosState()
    autoDeployAos(state, 'A')
    state.abilities = { ...state.abilities, 'fx.a.deploy': { ...state.abilities[Object.keys(state.abilities)[0]], id: 'fx.a.deploy', name: 'Lurk', keywords: ['DEPLOY'] } }
    state.units['A:guard'].location = 'reserves'
    state.units['A:guard'].reserveArrival = 'fx.a.ambush'
    setUpInReserve(state, 'A:guard', 'fx.a.deploy')
    expect(state.units['A:guard'].reserveVia).toEqual({ abilityId: 'fx.a.deploy', deploy: true })
    // held back by a battle trait: arrives later, never destroyed for being in reserve
    state.units['A:knight'].location = 'reserves'
    state.units['A:knight'].reserveArrival = 'fx.a.ambush'
    state.units['A:knight'].reserveVia = { abilityId: null, deploy: false }
    state.round = 4
    const { ctx, events } = ctxFor(state)
    missionService.onWindow(ctx, 'round.start', '4')
    expect(state.units['A:guard'].location).toBe('destroyed')
    expect(events.filter((e) => e.type === 'UnitDestroyed' && e.unitId === 'A:guard')).toHaveLength(1)
    expect(state.units['A:knight'].location).toBe('reserves')
    // units on the table are untouched
    expect(state.units['A:boss'].location).toBe('board')
  })

  it('SPH-021 the winner is the player with more VP, equal VP is a draw', () => {
    const state = aosState()
    state.players.A.vp = 5
    state.players.B.vp = 4
    expect(missionService.finalResult(state, 'vp').winner).toBe('A')
    state.players.B.vp = 5
    expect(missionService.finalResult(state, 'vp').winner).toBe('draw')
  })
})

