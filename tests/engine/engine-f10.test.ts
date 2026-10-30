// F10 engine fixes: deployment never strands a unit (big ovals on the 30x5 strip), damage pools keep mortal and normal damage
// apart, re-formed move and charge candidates for boxed-in units come from the engine (so humans get them too), and the
// start-of-charge-phase ability window (Champion of Raids). Test names carry the checklist id of the rule they protect.
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, createGame, legalActions, step,
  type Action, type DeclaredTarget, type GameEvent, type GameState, type StepResult,
} from '../../src/engine'
import type { DataBundle } from '../../src/data/types'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { makeSimSetup } from '../../tools/sim-core'
import { attackService } from '../../src/engine/attack'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { suggestDeployment } from '../../src/engine/setup'
import { chargeModule, chargeMoveRejection } from '../../src/engine/phases/charge'
import { movementModule, moveUnitCandidatesFor } from '../../src/engine/phases/movement'
import { reformChargeCandidates } from '../../src/engine/phases/reform'
import { unitModels } from '../../src/engine/state'
import { aosState, withAosBundle } from '../fixtures'
import { placeUnit } from '../fixtures/state'

const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

// ---------- (1) deployment on the real data ----------
describe('F10 deployment never strands a unit', () => {
  let bundle: DataBundle
  // the random-bot sim game that used to stall: sim seed 3, game 5, Gloomspite (A, attacker) vs Cities on Aqshy
  const gloomspiteGame = async (): Promise<StepResult> => {
    bundle = bundle ?? await loadBundle()
    let r = createGame(makeSimSetup(bundle, 5, DATA_VERSION, [], 'aqshy', '3'), 'f10-deploy', bundle)
    // A attacks and deploys first, into the z 6..11 strip (the defender B keeps territory A)
    for (let i = 0; i < 40 && r.pending && r.pending.kind !== 'deployUnit'; i++) {
      const legal = legalActions(r.state, r.pending) as Action[]
      const topic = r.pending.kind === 'chooseOption' ? r.pending.context.topic : ''
      const want = topic === 'chooseAttacker' ? 'A' : topic === 'deploymentMap' ? (r.pending.player === 'B' ? 'A' : 'B') : null
      r = step(r.state, legal.find((a) => a.type === 'chooseOption' && a.optionId === want) ?? legal[0])
    }
    expect(r.pending?.kind).toBe('deployUnit')
    expect(r.pending?.player).toBe('A')
    return r
  }
  const deploy = (r: StepResult, unitId: string, spots: [number, number, number][]): StepResult => {
    const p = r.pending!
    const ids = r.state.units[unitId].models
    const next = step(r.state, { type: 'deployUnit', player: p.player, decisionId: p.id, unitId, placements: ids.map((modelId, i) => ({ modelId, pos: { x: spots[i][0], y: 0, z: spots[i][1] }, facing: spots[i][2] })) })
    expect(next.rejection ?? null).toBeNull()
    return next
  }
  const Q = -Math.PI / 2

  it('SPH-011 the Wolfgits still get a legal spot on the crowded strip that used to stall the sim (rotated, tightly packed)', async () => {
    let r = await gloomspiteGame()
    // exactly where the old search put everything else before it gave up on the Wolfgits
    r = deploy(r, 'A:wheela-a', [[-12.39, 7.86, 0]])
    r = deploy(r, 'A:wheela-b', [[-7.64, 7.86, 0]])
    r = deploy(r, 'A:cavalry-a', [[-4.37, 7.88, Q], [-2.62, 7.88, Q], [-0.87, 7.88, Q]])
    r = deploy(r, 'A:snarlboss', [[0.88, 7.88, Q]])
    r = deploy(r, 'A:cavalry-b', [[8.63, 7.88, Q], [10.38, 7.88, Q], [12.13, 7.88, Q]])
    expect(r.pending?.kind).toBe('deployUnit')
    const legal = legalActions(r.state, r.pending!) as Action[]
    expect(legal.length).toBeGreaterThan(0)
    expect(legal[0]).toMatchObject({ type: 'deployUnit', unitId: 'A:wolfgits' })
    const sug = suggestDeployment(r.state)
    expect(sug?.unitId).toBe('A:wolfgits')
    const next = step(r.state, legal[0])
    expect(next.rejection ?? null).toBeNull()
    expect(next.state.units['A:wolfgits'].location).toBe('board')
  }, 120_000)

  it('SPH-011 a human who leaves no room for a Wheela never hangs the game: the unit that cannot be set up is removed and deployment moves on', async () => {
    let r = await gloomspiteGame()
    // every gap along the 30" strip is narrower than a Wheela's short side (3.6"), and nothing fits above or below the row
    const z = 8.6, gap = 2.0
    let x = -15 + 0.05
    const next = (half: number): number => { const c = x + half; x = c + half + gap; return c }
    const wheela = next(1.811)
    const boss = next(0.827)
    const w0 = x + 0.689, w1 = w0 + 1.378 + 0.3; x = w1 + 0.689 + gap
    const cav = (): number[] => { const a = x + 0.827; const out = [a, a + 1.78, a + 3.56]; x = out[2] + 0.827 + gap; return out }
    const ca = cav(), cb = cav()
    expect(15 - x + gap).toBeLessThan(3.6)
    r = deploy(r, 'A:wheela-a', [[wheela, z, Q]])
    r = deploy(r, 'A:snarlboss', [[boss, z, Q]])
    r = deploy(r, 'A:wolfgits', [[w0, z, Q], [w1, z, Q]])
    r = deploy(r, 'A:cavalry-a', ca.map((cx) => [cx, z, Q] as [number, number, number]))
    r = deploy(r, 'A:cavalry-b', cb.map((cx) => [cx, z, Q] as [number, number, number]))
    // the stranded Wheela left play; the defender is now deploying (no decision with canPass:false and nothing legal)
    expect(r.state.units['A:wheela-b'].location).toBe('destroyed')
    expect(r.events.some((e) => e.type === 'UnitDestroyed' && e.unitId === 'A:wheela-b')).toBe(true)
    expect(r.pending?.kind).toBe('deployUnit')
    expect(r.pending?.player).toBe('B')
    expect((legalActions(r.state, r.pending!) as Action[]).length).toBeGreaterThan(0)
  }, 120_000)
})

// ---------- (2) damage pools ----------
describe('F10 damage pools keep mortal and normal damage apart', () => {
  it('WEAP-009 crit-mortal damage and normal damage from one attack land in separate pools with the right mortal flag', () => {
    const axe = 'fx.w.brute-axe'
    const s = aosState({}, withAosBundle((b) => { b.weapons[axe].abilities = [{ ability: 'CRIT_MORTAL' }] }))
    s.phase = 'fight'
    s.activePlayer = 'A'
    placeUnit(s, 'B:brute', { x: -4, z: 0, gap: 0.3 })
    placeUnit(s, 'A:guard', { x: -4, z: 2, gap: 0.3 })
    const target: DeclaredTarget = { modelId: 'B:brute#0', weaponId: s.models['B:brute#0'].weapons[0], targetUnitId: 'A:guard', profileGroup: null, attacks: 2 }
    // hits [6 crit, 4]; the 4 wounds on a 3; the save rolls 1 and fails
    const { ctx, events } = createContext(s, new ScriptedRng([6, 4, 3, 1]), DEFAULT_MODULES)
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'B:brute', overwatch: false, targets: [target] })
    expect(attackService.advance(ctx)).toBe('done')
    const applied = of(events, 'DamageApplied')
    expect(applied.some((e) => e.mortal)).toBe(true)
    expect(applied.some((e) => !e.mortal)).toBe(true)
    expect(of(events, 'DamagePoolResolved')).toHaveLength(2)
  })
})

// ---------- (3) re-formed moves and charges ----------
describe('F10 re-formed move and charge candidates come from the engine', () => {
  // three big oval cavalry bases (90 x 52 mm, broadside) in a walled pocket whose only way out is a 3.2" gap: no slide of the line
  // fits through it, but the same unit re-formed into a column (turned lengthways) does
  const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
  const wall = (id: string, x0: number, z0: number, x1: number, z1: number) => ({
    id, kind: 'ruin', pos: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 }, rot: 0, footprint: rect(-(x1 - x0) / 2, -(z1 - z0) / 2, (x1 - x0) / 2, (z1 - z0) / 2), height: 3, traits: ['impassable'],
  })
  const boxed = (): GameState => {
    const b = withAosBundle((bb) => {
      bb.terrainLayouts['fx.terrain.pocket'] = {
        id: 'fx.terrain.pocket', name: 'Pocket', board: { w: 30, h: 22 },
        pieces: [wall('w-west', -7, -11, -6, -5.5), wall('w-east', 6, -11, 7, -5.5), wall('n-west', -6, -6.5, -1.6, -5.5), wall('n-east', 1.6, -6.5, 6, -5.5)],
      } as never
      bb.missions['fx.mission'].terrainLayouts.push('fx.terrain.pocket')
      bb.datasheets['fx.brute'].composition[0].base = { shape: 'oval', mm: 90, mm2: 52 } as never
      bb.datasheets['fx.brute'].stats.M = 10
    })
    const s = aosState({ terrainLayoutId: 'fx.terrain.pocket' }, b)
    s.round = 1
    s.phase = 'movement'
    s.activePlayer = 'B'
    placeUnit(s, 'B:brute', { x: -3.6, z: -9.5, gap: 0.1 })
    placeUnit(s, 'A:guard', { x: -6, z: 8, gap: 0.3 })
    return s
  }
  const shift = (s: GameState, a: Action): number => (a.type === 'moveUnit' || a.type === 'chargeMove'
    ? Math.max(0, ...a.placements.map((p) => Math.hypot(p.pos.x - s.models[p.modelId].pos.x, p.pos.z - s.models[p.modelId].pos.z))) : 0)

  it('MOVE-008 a boxed-in unit gets re-formed Normal Moves in the legal list (the human sees them too), each one valid', () => {
    const s = boxed()
    const rigid = moveUnitCandidatesFor(s, 'B:brute', 'normal', 'B', 'd1', false)
    expect(Math.max(0, ...rigid.map((a) => shift(s, a)))).toBeLessThan(1)
    const all = moveUnitCandidatesFor(s, 'B:brute', 'normal', 'B', 'd1')
    const far = all.filter((a) => shift(s, a) >= 6)
    expect(far.length).toBeGreaterThan(0)
    // through the gap, turned lengthways, and accepted by the movement validator
    s.pending = { kind: 'moveUnit', id: 'd1', player: 'B', window: 'movement.unitMoved', canPass: false, context: { unitId: 'B:brute', moveType: 'normal' }, constraints: {} } as never
    for (const a of far) {
      expect(movementModule.validate!(s, a, s.pending!)).toBeNull()
      if (a.type === 'moveUnit') expect(a.placements.some((p) => Math.abs((p.facing ?? 0) - s.models[p.modelId].facing) > 0.1)).toBe(true)
    }
  })

  it('CHARGE-003 re-formed charge moves land the whole unit just inside 1/2" and pass the charge validator', () => {
    const s = aosState()
    s.round = 1
    s.phase = 'charge'
    s.activePlayer = 'A'
    placeUnit(s, 'A:guard', { x: -6, z: -4, gap: 0.3 })
    placeUnit(s, 'B:brute', { x: -2, z: 0, gap: 0.3 })
    const roll = 8
    const moves = reformChargeCandidates(s, 'A:guard', unitModels(s, 'A:guard'), unitModels(s, 'B:brute'), roll,
      (p) => chargeMoveRejection(s, 'A:guard', roll, p) === null, 2)
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) expect(chargeMoveRejection(s, 'A:guard', roll, m)).toBeNull()
  })
})

// ---------- (4) the start-of-charge-phase window ----------
describe('F10 start-of-charge-phase ability window', () => {
  const added: string[] = []
  afterEach(() => { for (const n of added.splice(0)) delete codeHooks[n] })

  it('STD-ENH-3 the charge phase opens with an ability window before any unit is picked to charge (data timing overridden by startOfPhase)', () => {
    codeHooks.f10Start = {
      name: 'f10Start', kind: 'ability', hook: 'onAbilityDeclared', run: () => {}, startOfPhase: 'charge',
      activate: { canUse: () => true, resolve: () => {} },
    } as unknown as EngineCodeHook
    added.push('f10Start')
    const s = aosState({}, withAosBundle((b) => {
      b.abilities['fx.a.f10-start'] = { id: 'fx.a.f10-start', name: 'F10 start', text: 'Test ability.', trigger: 'activated', timing: { kind: 'phase', phase: 'movement', whose: 'your' }, code: 'f10Start' }
      b.datasheets['fx.boss'].abilities = [...(b.datasheets['fx.boss'].abilities ?? []), 'fx.a.f10-start']
    }))
    s.round = 1
    s.phase = 'charge'
    s.activePlayer = 'A'
    placeUnit(s, 'A:boss', [[0, -6]])
    placeUnit(s, 'B:guard', { x: -3, z: 2, gap: 0.3 })
    expect(abilityService.usable(s, 'A', 'movement').map((u) => u.abilityId)).not.toContain('fx.a.f10-start')
    expect(abilityService.usable(s, 'A', 'chargeStart').map((u) => u.abilityId)).toContain('fx.a.f10-start')
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    chargeModule.enter!(ctx)
    expect(chargeModule.advance(ctx)).toBe('pending')
    const p = s.pending!
    expect(p.window).toBe('charge.start')
    expect(p.kind).toBe('chooseOption')
  })

  it('STD-ENH-3 params.window phaseStart puts a charge-phase descriptor in the start window, not the end-of-phase one', () => {
    codeHooks.f10Data = { name: 'f10Data', kind: 'ability', hook: 'onAbilityDeclared', run: () => {}, activate: { canUse: () => true, resolve: () => {} } } as unknown as EngineCodeHook
    added.push('f10Data')
    const s = aosState({}, withAosBundle((b) => {
      b.abilities['fx.a.f10-data'] = { id: 'fx.a.f10-data', name: 'F10 data', text: 'Test ability.', trigger: 'activated', timing: { kind: 'phase', phase: 'charge', whose: 'your' }, params: { window: 'phaseStart' }, code: 'f10Data' }
      b.datasheets['fx.boss'].abilities = [...(b.datasheets['fx.boss'].abilities ?? []), 'fx.a.f10-data']
    }))
    s.round = 1
    s.phase = 'charge'
    s.activePlayer = 'A'
    placeUnit(s, 'A:boss', [[0, -6]])
    expect(abilityService.usable(s, 'A', 'chargeStart').map((u) => u.abilityId)).toContain('fx.a.f10-data')
    expect(abilityService.usable(s, 'A', 'charge').map((u) => u.abilityId)).not.toContain('fx.a.f10-data')
  })
})
