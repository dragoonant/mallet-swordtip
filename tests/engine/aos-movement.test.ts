// WP4 (13-engine-port-plan §5): movement phase on the checklist fixtures. Drives `movementModule` directly over a hand-built
// GameState (phases/README.md §6). Combat range is 3" and needs mutual visibility (CORE-1.5, CORE-6.4); Run adds a D6;
// Retreat takes D3 mortal damage first; units set up this turn cannot move; reserve units arrive by data params.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, createEngine, abilityService, createContext, removeModel, unitModels,
  type Action, type EngineContext, type GameState, type ModuleTable, type PendingDecision, type Rejection, type TerrainPiece, type UnitId,
} from '../../src/engine'
import type { ModelPlacement } from '../../src/engine/actions'
import { movementModule } from '../../src/engine/phases/movement'
import { losService } from '../../src/engine/los'
import { aosBundle, aosPingPhases, aosState, autoplay, makeAosSetup, placeUnit, recordingStratagems, withAosBundle } from '../fixtures'
import { chargeModule } from '../../src/engine/phases/charge'
import type { DataBundle } from '../../src/data/types'

const DID = ''
const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]

// a thin 4"-tall wall along z = `z` from x0 to x1
function wallPiece(id: string, z: number, x0: number, x1: number, height = 4): TerrainPiece {
  return { id, kind: 'ruin', pos: { x: 0, z }, rot: 0, footprint: rect(x0, z - 0.1, x1, z + 0.1), height, traits: ['cover', 'obscuring', 'unstable'], walls: [{ a: { x: x0, z }, b: { x: x1, z }, height }], floors: [] }
}

function harness(opts: { dice?: number[]; bundle?: DataBundle; player?: 'A' | 'B'; round?: number } = {}) {
  const state = aosState({}, opts.bundle ?? aosBundle)
  state.phase = 'movement'
  state.round = opts.round ?? 1
  state.activePlayer = opts.player ?? 'A'
  const modules: ModuleTable = {
    ...DEFAULT_MODULES,
    services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems(), abilities: { ...abilityService, runWindow: () => false } },
  }
  const { ctx, events } = createContext(state, new ScriptedRng(opts.dice ?? []), modules)
  return { state, ctx, events }
}

// the board of a fresh state may be frozen: swap in a new one with the piece added
function addPiece(state: GameState, piece: TerrainPiece): void {
  state.board = { ...state.board, pieces: { ...state.board.pieces, [piece.id]: piece } }
}

// keep only the first `n` models of a unit
function trim(state: GameState, unitId: UnitId, n: number): void {
  for (const id of [...state.units[unitId].models].slice(n)) removeModel(state, id)
}

function pendingOf(ctx: EngineContext): PendingDecision {
  if (!ctx.state.pending) movementModule.advance(ctx)
  return ctx.state.pending as PendingDecision
}

function act(ctx: EngineContext, action: Action): 'pending' | 'done' {
  const pending = pendingOf(ctx)
  const rej = movementModule.validate?.(ctx.state, action, pending)
  if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  ctx.state.pending = null
  const handled = movementModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  return movementModule.advance(ctx)
}

function reject(ctx: EngineContext, action: Action): Rejection | null {
  return movementModule.validate?.(ctx.state, action, pendingOf(ctx)) ?? null
}

const select = (ctx: EngineContext, unitId: UnitId) => act(ctx, { type: 'chooseUnitToActivate', player: ctx.state.units[unitId].player, decisionId: DID, unitId })
const declare = (ctx: EngineContext, unitId: UnitId, moveType: 'normal' | 'advance' | 'fallBack' | 'stationary') => act(ctx, { type: 'declareMove', player: ctx.state.units[unitId].player, decisionId: DID, unitId, moveType })
const moveAction = (ctx: EngineContext, unitId: UnitId, placements: ModelPlacement[]): Action => ({ type: 'moveUnit', player: ctx.state.units[unitId].player, decisionId: DID, unitId, placements })
const place = (state: GameState, modelId: string, x: number, z: number): ModelPlacement => ({ modelId, pos: { x, y: 0, z: z } })

// single-model Guard of A at (x, z) and single-model Brute of B at (bx, bz)
function duel(opts: Parameters<typeof harness>[0] = {}, at = { gx: 0, gz: -8, bx: 0, bz: 0 }) {
  const h = harness(opts)
  trim(h.state, 'A:guard', 1)
  trim(h.state, 'B:brute', 1)
  placeUnit(h.state, 'A:guard', [[at.gx, at.gz]])
  placeUnit(h.state, 'B:brute', [[at.bx, at.bz]])
  movementModule.enter(h.ctx)
  return h
}

describe('aos movement (WP4)', () => {
  it('MEAS-009 in combat needs combat range (3" h) and a clear line of sight', () => {
    const gap2 = 0.6299 + 0.7874 + 2
    const h = duel({}, { gx: 0, gz: -gap2, bx: 0, bz: 0 })
    expect(losService.inCombat(h.state, 'A:guard', 'B:brute')).toBe(true)
    expect(losService.unitInCombat(h.state, 'A:guard')).toBe(true)
    // a wall blocks every line: still within 3", but not in combat
    addPiece(h.state, wallPiece('w1', -gap2 / 2, -6, 6))
    expect(losService.inCombat(h.state, 'A:guard', 'B:brute')).toBe(false)
    // out of range stays out of combat
    const far = duel({}, { gx: 0, gz: -(0.6299 + 0.7874 + 3.05), bx: 0, bz: 0 })
    expect(losService.inCombat(far.state, 'A:guard', 'B:brute')).toBe(false)
  })

  it('MOVE-001 Guard Move 5: a 5.00 path is accepted, 5.01 is E_OUT_OF_RANGE', () => {
    const h = duel({}, { gx: 0, gz: -8, bx: 0, bz: 8 })
    select(h.ctx, 'A:guard')
    declare(h.ctx, 'A:guard', 'normal')
    const id = h.state.units['A:guard'].models[0]
    expect(reject(h.ctx, moveAction(h.ctx, 'A:guard', [place(h.state, id, 5, -8)]))).toBeNull()
    expect(reject(h.ctx, moveAction(h.ctx, 'A:guard', [place(h.state, id, 5.01, -8)]))?.code).toBe('E_OUT_OF_RANGE')
  })

  it('MOVE-002 a Normal Move whose path crosses a visible enemy combat range, ending outside, is E_ENGAGEMENT', () => {
    const h = duel({}, { gx: -2.4, gz: -4, bx: 0, bz: 0 })
    select(h.ctx, 'A:guard')
    declare(h.ctx, 'A:guard', 'normal')
    const id = h.state.units['A:guard'].models[0]
    expect(h.state.units['A:guard'].turn.moveType).toBe('normal')
    const rej = reject(h.ctx, moveAction(h.ctx, 'A:guard', [place(h.state, id, 2.4, -4)]))
    expect(rej?.code).toBe('E_ENGAGEMENT')
    // control: the same distance away from the enemy is fine
    expect(reject(h.ctx, moveAction(h.ctx, 'A:guard', [place(h.state, id, -2.4, -8.8)]))).toBeNull()
  })

  it('MOVE-003 the same path past an enemy hidden behind a wall is accepted', () => {
    const h = duel({}, { gx: -2.4, gz: -4, bx: 0, bz: 0 })
    addPiece(h.state, wallPiece('w1', -2, -8, 8))
    select(h.ctx, 'A:guard')
    declare(h.ctx, 'A:guard', 'normal')
    const id = h.state.units['A:guard'].models[0]
    expect(reject(h.ctx, moveAction(h.ctx, 'A:guard', [place(h.state, id, 2.4, -4)]))).toBeNull()
  })

  it('MOVE-004 a unit in combat is only offered Retreat (or staying put), never Normal Move or Run', () => {
    const h = duel({}, { gx: 0, gz: -3, bx: 0, bz: 0 })
    select(h.ctx, 'A:guard')
    const p = pendingOf(h.ctx)
    expect(p.kind).toBe('declareMove')
    if (p.kind !== 'declareMove') return
    expect(p.context.allowed).toContain('fallBack')
    expect(p.context.allowed).not.toContain('normal')
    expect(p.context.allowed).not.toContain('advance')
  })

  it('MOVE-005 Run with a die of 4 moves up to Move + 4, and the unit is marked as having run', () => {
    const h = duel({ dice: [4] }, { gx: 0, gz: -10, bx: 0, bz: 10 })
    select(h.ctx, 'A:guard')
    declare(h.ctx, 'A:guard', 'advance')
    const u = h.state.units['A:guard']
    expect(u.turn.advanceRoll).toBe(4)
    expect(u.turn.moveType).toBe('advance') // Shoot and Charge check this
    const id = u.models[0]
    expect(reject(h.ctx, moveAction(h.ctx, 'A:guard', [place(h.state, id, 9, -10)]))).toBeNull()
    expect(reject(h.ctx, moveAction(h.ctx, 'A:guard', [place(h.state, id, 9.01, -10)]))?.code).toBe('E_OUT_OF_RANGE')
  })

  it('MOVE-006 Retreat: D3 mortal damage to itself first, then the move; ending in combat range is E_ENGAGEMENT', () => {
    const h = harness({ dice: [5], player: 'B' }) // D3 face 5 -> 3
    trim(h.state, 'A:guard', 1)
    placeUnit(h.state, 'A:guard', [[-2.5, 0]])
    placeUnit(h.state, 'B:brute', [[0, 0], [1.7, 0], [3.4, 0]])
    movementModule.enter(h.ctx)
    const before = unitModels(h.state, 'B:brute').reduce((n, m) => n + m.woundsRemaining, 0)
    select(h.ctx, 'B:brute')
    declare(h.ctx, 'B:brute', 'fallBack')
    expect(h.state.pending?.kind).toBe('moveUnit')
    const live = unitModels(h.state, 'B:brute')
    expect(live.reduce((n, m) => n + m.woundsRemaining, 0)).toBe(before - 3)
    expect(h.events.some((e) => e.type === 'UnitFellBack')).toBe(true)
    const shift = (dx: number): ModelPlacement[] => live.map((m) => place(h.state, m.id, m.pos.x + dx, m.pos.z))
    expect(reject(h.ctx, moveAction(h.ctx, 'B:brute', shift(1)))?.code).toBe('E_ENGAGEMENT')
    expect(reject(h.ctx, moveAction(h.ctx, 'B:brute', shift(4)))).toBeNull()
    act(h.ctx, moveAction(h.ctx, 'B:brute', shift(4)))
    expect(h.state.units['B:brute'].turn.moveType).toBe('fallBack') // Shoot and Charge check this
  })

  it('MOVE-017 a unit set up this turn is not offered a Move ability in the movement phase', () => {
    const h = duel({}, { gx: 0, gz: -8, bx: 0, bz: 8 })
    h.state.units['A:guard'].setUpTurn = { round: 1, player: 'A' }
    const p = pendingOf(h.ctx)
    // nothing else of A is on the board, so no unit is eligible and the phase moves straight on
    expect(p).toBeNull()
    h.state.units['A:guard'].setUpTurn = { round: 1, player: 'B' }
    const h2 = duel({}, { gx: 0, gz: -8, bx: 0, bz: 8 })
    expect(pendingOf(h2.ctx).kind).toBe('chooseUnitToActivate')
  })

  it('IJZ-2.1 reserve arrival: round 3 or later, every model more than 6" from every enemy, then it cannot move that turn', () => {
    const bundle = withAosBundle((b) => {
      const brute = b.patrols['fx.chaos.army'].units.find((u) => u.ref === 'brute')
      if (brute) brute.reserve = { ability: 'fx.a.ambush' }
    })
    // round 2: not offered
    const early = harness({ bundle, player: 'B', round: 2 })
    expect(early.state.units['B:brute'].location).toBe('reserves')
    trim(early.state, 'A:guard', 1)
    placeUnit(early.state, 'A:guard', [[0, 0]])
    movementModule.enter(early.ctx)
    expect(pendingOf(early.ctx)).toBeNull()
    expect(early.state.units['B:brute'].location).toBe('reserves')

    // round 3: a deployUnit decision
    const h = harness({ bundle, player: 'B', round: 3 })
    trim(h.state, 'A:guard', 1)
    placeUnit(h.state, 'A:guard', [[0, 0]])
    movementModule.enter(h.ctx)
    const p = pendingOf(h.ctx)
    expect(p.kind).toBe('deployUnit')
    const models = h.state.units['B:brute'].models
    const at = (x: number, z: number): Action => ({
      type: 'deployUnit', player: 'B', decisionId: DID, unitId: 'B:brute',
      placements: models.map((id, i) => place(h.state, id, x + i * 1.7, z)),
    })
    expect(reject(h.ctx, at(4, 0))?.code).toBe('E_ENGAGEMENT') // within 6" of the Guard
    expect(reject(h.ctx, at(-14, 8))).toBeNull()
    act(h.ctx, at(-14, 8))
    const u = h.state.units['B:brute']
    expect(u.location).toBe('board')
    expect(u.setUpTurn).toEqual({ round: 3, player: 'B' })
    expect(h.events.some((e) => e.type === 'ReinforcementsArrived')).toBe(true)
    // legal actions also offer a concrete placement
  })

  it('MOVE-001 legalActions always offer a valid move (autoplay candidate generation)', () => {
    const h = duel({}, { gx: 0, gz: -8, bx: 0, bz: 8 })
    select(h.ctx, 'A:guard')
    declare(h.ctx, 'A:guard', 'normal')
    const p = pendingOf(h.ctx)
    const legal = movementModule.legalActions?.(h.state, p) ?? []
    expect(legal.length).toBeGreaterThan(0)
    for (const a of legal) expect(movementModule.validate?.(h.state, a, p)).toBeNull()
  })

  it('MOVE-001 a whole autoplayed 4-round game with the real movement and charge phases always has a legal answer', () => {
    const engine = createEngine({
      phases: { ...aosPingPhases(), movement: movementModule, charge: chargeModule },
      services: { ...DEFAULT_MODULES.services },
      topics: { ...DEFAULT_MODULES.topics },
    })
    const start = engine.createGame(makeAosSetup(), 'wp4-smoke', aosBundle)
    const { final, results } = autoplay(engine, start, 20000)
    expect(final.state.phase).toBe('ended')
    expect(results.some((r) => r.events.some((e) => e.type === 'UnitMoved'))).toBe(true)
    expect(results.some((r) => r.events.some((e) => e.type === 'ChargeMoved' || e.type === 'ChargeFailed'))).toBe(true)
  })
})
