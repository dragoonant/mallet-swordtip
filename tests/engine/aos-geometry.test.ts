// WP1 (13-engine-port-plan §5): AoS measurement constants — combat range 3", coherency ½" (CORE-1.1–1.8).
import { describe, expect, it } from 'vitest'
import {
  CHARGE_END, COHERENCY_H, createEngine, DEFAULT_MODULES, distance, emptyMoveConstraints, ENGAGEMENT_H, checkPlacements,
  enemyModelsOnBoard, isCoherent, unitModels, withinEngagementRange, withinObjectiveRange,
  type PendingDecision, type PhaseModule,
} from '../../src/engine'
import { aosBundle, aosPingPhases, footprint, makeAosSetup, row } from '../fixtures'

describe('aos geometry (WP1)', () => {
  it('MEAS-001 two 32 mm bases 2.26" apart are 1.00" apart edge to edge', () => {
    expect(distance(footprint(0, 0, 32), footprint(2.26, 0, 32))).toBeCloseTo(1.0, 2)
  })

  it('MEAS-007 combat range is 3" horizontally (inclusive)', () => {
    const r = 32 / 25.4
    expect(ENGAGEMENT_H).toBe(3)
    expect(withinEngagementRange(footprint(0, 0), footprint(3 + r, 0))).toBe(true)
    expect(withinEngagementRange(footprint(0, 0), footprint(3.01 + r, 0))).toBe(false)
  })

  it('MEAS-008 combat range has no vertical limit', () => {
    const r = 32 / 25.4
    expect(withinEngagementRange(footprint(0, 0, 32, 0), footprint(2 + r, 0, 32, 8))).toBe(true)
  })

  it('MEAS-012 coherency is ½" horizontally, height ignored', () => {
    const d = 32 / 25.4
    expect(COHERENCY_H).toBe(0.5)
    expect(isCoherent([footprint(0, 0), footprint(d + 0.5, 0)])).toBe(true)
    expect(isCoherent([footprint(0, 0), footprint(d + 0.51, 0)])).toBe(false)
    expect(isCoherent([footprint(0, 0, 32, 0), footprint(d + 0.3, 0, 32, 4)])).toBe(true)
  })

  it('MEAS-013 a warscroll coherency range of 1" is honoured', () => {
    const d = 32 / 25.4
    expect(isCoherent([footprint(0, 0), footprint(d + 0.9, 0)], 1)).toBe(true)
    expect(isCoherent([footprint(0, 0), footprint(d + 0.9, 0)])).toBe(false)
  })

  it('MEAS-014 a straight chain: 6 models coherent, 7 models not', () => {
    expect(isCoherent(row('u', 6, 0, 0, 0.3))).toBe(true)
    expect(isCoherent(row('u', 7, 0, 0, 0.3))).toBe(false)
  })

  it('MEAS-015 two coherent clusters 2" apart are not one coherent unit', () => {
    const a = row('u', 3, 0, 0, 0.3)
    const b = row('u', 3, 10, 0, 0.3)
    expect(isCoherent(a)).toBe(true)
    expect(isCoherent([...a, ...b])).toBe(false)
  })

  it('MEAS-016 a 1-model unit is always coherent', () => {
    expect(isCoherent([footprint(5, 5)])).toBe(true)
  })

  it('CHARGE_END and objective defaults follow Spearhead (½", 3" circles contested by base overlap)', () => {
    expect(CHARGE_END).toBe(0.5)
    const obj = { pos: { x: 0, z: 0 } }
    const r = 32 / 25.4 / 2
    expect(withinObjectiveRange(footprint(3 + r, 0), obj)).toBe(true)
    expect(withinObjectiveRange(footprint(3 + r + 0.05, 0), obj)).toBe(false)
  })

  it('MEAS-017 a move ending out of coherency is rejected with E_COHERENCY and the state is unchanged', () => {
    // a movement module that asks for one Guard move and validates it with the shared placement checks
    const movement: PhaseModule = {
      name: 'coherency-move',
      enter(ctx) { ctx.state.step = 'move' },
      advance(ctx) {
        if (ctx.marked('moved')) return 'done'
        if (ctx.state.activePlayer !== 'A') return 'done'
        ctx.decide({
          kind: 'moveUnit', player: 'A', window: 'movement.unitMoved', canPass: false,
          context: { unitId: 'A:guard', moveType: 'normal', advanceRoll: null }, constraints: emptyMoveConstraints(5),
        })
        return 'pending'
      },
      validate(state, action, pending) {
        if (action.type !== 'moveUnit' || pending.kind !== 'moveUnit') return null
        const res = checkPlacements({
          unitModels: unitModels(state, action.unitId), placements: action.placements, constraints: pending.constraints,
          otherFriendly: [], enemies: enemyModelsOnBoard(state, 'A'), board: state.board,
        })
        return res.rejection
      },
      handle(ctx) { ctx.once('moved') },
    }
    const engine = createEngine({ ...DEFAULT_MODULES, phases: { ...aosPingPhases({ confirms: 0 }), movement } })
    const r0 = engine.createGame(makeAosSetup(), 'meas-017', aosBundle)
    const pending = r0.pending as PendingDecision
    expect(pending.kind).toBe('moveUnit')
    const guard = unitModels(r0.state, 'A:guard')
    // pull the first model 4" away from the block: it ends more than ½" from every other model
    const m = guard[0]
    const action = { type: 'moveUnit' as const, player: 'A' as const, decisionId: pending.id, unitId: 'A:guard', placements: [{ modelId: m.id, pos: { x: m.pos.x, y: 0, z: m.pos.z + 4 } }] }
    const before = structuredClone(r0.state)
    const rej = engine.step(r0.state, action)
    expect(rej.rejection?.code).toBe('E_COHERENCY')
    expect(rej.state).toBe(r0.state)
    expect(r0.state).toEqual(before)
    // a legal shuffle of the whole block 1" forward is accepted
    const ok = engine.step(r0.state, { ...action, placements: guard.map((g) => ({ modelId: g.id, pos: { x: g.pos.x, y: 0, z: g.pos.z + 1 } })) })
    expect(ok.rejection).toBeUndefined()
  })
})
