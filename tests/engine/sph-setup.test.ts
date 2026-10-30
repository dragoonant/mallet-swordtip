// WP3: Spearhead pre-battle sequence and deployment on the real setup module (SPH-002, SPH-010, SPH-011).
import { afterEach, describe, expect, it } from 'vitest'
import {
  createEngine, DEFAULT_MODULES, registerDataBundle, setupModule,
  type Action, type DeployUnitAction, type EngineApi, type GameState, type PendingDecision, type StepResult,
} from '../../src/engine'
import { suggestDeployment } from '../../src/engine/setup'
import { aosBundle, aosPingPhases, makeAosPlayer, makeAosSetup } from '../fixtures'

// real setup + deployment modules, ping phases for the battle
function realSetupEngine(): EngineApi {
  return createEngine({
    phases: { ...aosPingPhases(), setup: setupModule, deployment: setupModule },
    services: DEFAULT_MODULES.services,
    topics: DEFAULT_MODULES.topics,
  })
}

const first = (engine: EngineApi, r: StepResult): Action => {
  const legal = engine.legalActions(r.state, r.pending as PendingDecision)
  if (!legal || legal.length === 0) throw new Error(`no legal action for ${r.pending?.kind}`)
  return legal[0]
}

const answer = (engine: EngineApi, r: StepResult): StepResult => {
  const next = engine.step(r.state, first(engine, r))
  if (next.rejection) throw new Error(`rejected ${next.rejection.code}: ${next.rejection.reason}`)
  return next
}

const topicOf = (p: PendingDecision | null): string => (p?.kind === 'chooseOption' ? p.context.topic : (p?.kind ?? 'none'))

// everything pre-filled except the attacker and the deployment itself: A attacks (territory A), B defends (territory B)
function preFilled(overrides: Parameters<typeof makeAosSetup>[0] = {}): ReturnType<typeof makeAosSetup> {
  return makeAosSetup({
    terrainLayoutId: 'fx.terrain.standard', side: 'aqshy', defenderTerritory: 'B',
    players: {
      A: makeAosPlayer('A', { regimentAbilityId: 'fx.a.order-regiment-1' }),
      B: makeAosPlayer('B', { regimentAbilityId: 'fx.a.chaos-regiment-1' }),
    },
    ...overrides,
  })
}

describe('spearhead pre-battle (WP3)', () => {
  afterEach(() => registerDataBundle(null))

  it('SPH-002 createGame raises the pre-battle decisions in order, then deployment', () => {
    registerDataBundle(aosBundle)
    const engine = realSetupEngine()
    let r = engine.createGame(makeAosSetup({ sides: 'rollOff', firstTurn: 'rollOff', terrainLayoutId: 'fx.terrain.open' }), 'sph-002', aosBundle)
    const seen: { topic: string; player: string }[] = []
    let winner: string | null = null
    for (let i = 0; i < 40 && r.pending && r.pending.kind !== 'deployUnit'; i++) {
      const p = r.pending
      seen.push({ topic: topicOf(p), player: p.player })
      if (p.kind === 'chooseOption' && p.context.topic === 'chooseAttacker') winner = (p.context.data as { winner: string }).winner
      r = answer(engine, r)
    }
    expect(r.pending?.kind).toBe('deployUnit')
    expect(winner).not.toBeNull()
    const attacker = r.state.players.A.side === 'attacker' ? 'A' : 'B'
    const defender = attacker === 'A' ? 'B' : 'A'
    // the winner takes the first option: they are the attacker
    expect(attacker).toBe(winner)
    expect(seen).toEqual([
      { topic: 'chooseAttacker', player: winner },
      { topic: 'armyOptions', player: attacker },
      { topic: 'armyOptions', player: defender },
      { topic: 'battlefieldSide', player: defender },
      { topic: 'deploymentMap', player: defender },
      { topic: 'placeTerrain', player: defender },
      { topic: 'placeTerrain', player: defender },
      { topic: 'placeTerrain', player: attacker },
      { topic: 'placeTerrain', player: attacker },
    ])
    expect(Object.keys(r.state.board.pieces).sort()).toEqual([`tf.${attacker}-large`, `tf.${attacker}-small`, `tf.${defender}-large`, `tf.${defender}-small`].sort())
    // the attacker deploys first
    expect(r.pending?.player).toBe(attacker)
  })

  it('SPH-002 pre-filled steps are skipped: only the attacker choice and deployment remain', () => {
    const engine = realSetupEngine()
    let r = engine.createGame(preFilled({ sides: 'rollOff' }), 'sph-002b', aosBundle)
    expect(topicOf(r.pending)).toBe('chooseAttacker')
    r = answer(engine, r)
    expect(r.pending?.kind).toBe('deployUnit')
    const defender = r.state.players.A.side === 'defender' ? 'A' : 'B'
    expect(r.state.players[defender].territory).toBe('B')
  })

  it('SPH-010 the defender cannot deploy until the attacker has set up the whole army', () => {
    const engine = realSetupEngine()
    let r = engine.createGame(preFilled(), 'sph-010', aosBundle)
    const attackerUnits = Object.values(r.state.units).filter((u) => u.player === 'A').length
    expect(attackerUnits).toBe(4)
    let drops = 0
    while (r.pending?.kind === 'deployUnit' && r.pending.player === 'A') {
      // the defender tries to jump the queue
      const wrong: DeployUnitAction = { type: 'deployUnit', player: 'B', decisionId: r.pending.id, unitId: 'B:boss', placements: [] }
      expect(engine.validate(r.state, wrong)?.code).toBe('E_WRONG_PLAYER')
      r = answer(engine, r)
      drops++
    }
    expect(drops).toBe(attackerUnits)
    expect(Object.values(r.state.units).filter((u) => u.player === 'A' && u.location === 'board')).toHaveLength(attackerUnits)
    // now the defender deploys the whole army
    expect(r.pending?.kind).toBe('deployUnit')
    expect(r.pending?.player).toBe('B')
    while (r.pending?.kind === 'deployUnit') r = answer(engine, r)
    expect(Object.values(r.state.units).filter((u) => u.player === 'B' && u.location === 'board')).toHaveLength(4)
    // hands over to the reducer's round start: the first-turn choice was pre-filled, so the first hero phase is running
    expect(r.state.phase).toBe('command')
    expect(r.state.round).toBe(1)
  })

  it('SPH-011 deployment is wholly in friendly territory and more than 6" from enemy territory', () => {
    const engine = realSetupEngine()
    const r = engine.createGame(preFilled(), 'sph-011', aosBundle)
    const pending = r.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    const state: GameState = r.state
    const boss = state.units['A:boss']
    const radius = state.models[boss.models[0]].base.radius
    const place = (z: number, x = 0): DeployUnitAction => ({
      type: 'deployUnit', player: 'A', decisionId: pending.id, unitId: 'A:boss',
      placements: [{ modelId: boss.models[0], pos: { x, y: 0, z }, facing: 0 }],
    })
    // territory A is z < 0, so the enemy territory starts at z = 0 and the legal area ends 6" short of it
    expect(engine.validate(state, place(-6 - radius))).not.toBeNull()
    expect(engine.validate(state, place(-6.01 - radius))).toBeNull()
    // a base crossing the territory line
    expect(engine.validate(state, place(-0.2))?.code).toBeDefined()
    // a base reaching into enemy territory
    expect(engine.validate(state, place(2))).not.toBeNull()
  })
})

describe('deployment suggestion', () => {
  afterEach(() => registerDataBundle(null))

  const asAction = (r: StepResult, sug: NonNullable<ReturnType<typeof suggestDeployment>>): DeployUnitAction => {
    const pending = r.pending as Extract<PendingDecision, { kind: 'deployUnit' }>
    return { type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId: sug.unitId, placements: sug.placements }
  }

  it('SPH-011 suggests the biggest waiting unit first, in a spot the engine accepts, with room left for the rest', () => {
    const engine = realSetupEngine()
    const r = engine.createGame(preFilled(), 'sph-suggest', aosBundle)
    const sug = suggestDeployment(r.state)!
    expect(sug.unitId).toBe('A:cannon') // the 120 x 92 mm oval has the biggest base
    expect(sug.fitsAll).toBe(true)
    expect(sug.order).toHaveLength(4)
    expect(sug.order[0]).toBe('A:cannon')
    expect(engine.validate(r.state, asAction(r, sug))).toBeNull()
  })

  it('SPH-011 following the suggestions deploys both whole armies with nobody boxed out, however the order starts', () => {
    const engine = realSetupEngine()
    let r = engine.createGame(preFilled(), 'sph-suggest-2', aosBundle)
    // start with a unit that is NOT the biggest: the plan still has to fit the rest
    const smallFirst = suggestDeployment(r.state, 'A:guard')!
    expect(smallFirst.unitId).toBe('A:guard')
    expect(smallFirst.fitsAll).toBe(true)
    let guard = 0
    let useSmall = true
    while (r.pending?.kind === 'deployUnit' && guard++ < 20) {
      const sug = (useSmall ? suggestDeployment(r.state, 'A:guard') : suggestDeployment(r.state))!
      useSmall = false
      expect(sug, `no suggestion for ${r.pending.player}`).not.toBeNull()
      expect(sug.fitsAll).toBe(true)
      r = engine.step(r.state, asAction(r, sug))
      expect(r.rejection ?? null).toBeNull()
    }
    expect(Object.values(r.state.units).filter((u) => u.location === 'board')).toHaveLength(8)
  })

  it('SPH-011 gives nothing outside deployment or for a unit that is not waiting', () => {
    const engine = realSetupEngine()
    const r = engine.createGame(preFilled(), 'sph-suggest-3', aosBundle)
    expect(suggestDeployment({ ...r.state, phase: 'movement' })).toBeNull()
    expect(suggestDeployment(r.state, 'nope')).toBeNull()
  })
})

