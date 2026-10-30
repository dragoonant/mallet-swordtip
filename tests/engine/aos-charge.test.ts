// WP4 (13-engine-port-plan §5): charge phase on the checklist fixtures. Drives `chargeModule` directly over a hand-built
// GameState. No target is declared (CORE-9.4); the charge roll is 2D6; the move ends with a model within ½" of a visible
// enemy model (CORE-9.2); a roll too short fails and the unit stays put (CORE-9.3).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, removeModel,
  type Action, type EngineContext, type GameState, type ModuleTable, type PendingDecision, type Rejection, type TerrainPiece, type UnitId,
} from '../../src/engine'
import type { ModelPlacement } from '../../src/engine/actions'
import { chargeModule, neededChargeDistance } from '../../src/engine/phases/charge'
import { aosBundle, aosState, placeUnit, recordingStratagems } from '../fixtures'

const DID = ''
const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]

function wallPiece(id: string, z: number, x0: number, x1: number, height = 4): TerrainPiece {
  return { id, kind: 'ruin', pos: { x: 0, z }, rot: 0, footprint: rect(x0, z - 0.1, x1, z + 0.1), height, traits: ['cover', 'obscuring', 'unstable'], walls: [{ a: { x: x0, z }, b: { x: x1, z }, height }], floors: [] }
}
function addPiece(state: GameState, piece: TerrainPiece): void {
  state.board = { ...state.board, pieces: { ...state.board.pieces, [piece.id]: piece } }
}

function harness(dice: number[] = []) {
  const state = aosState({}, aosBundle)
  state.phase = 'charge'
  state.round = 1
  state.activePlayer = 'A'
  const modules: ModuleTable = {
    ...DEFAULT_MODULES,
    services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems(), abilities: { ...abilityService, runWindow: () => false } },
  }
  const { ctx, events } = createContext(state, new ScriptedRng(dice), modules)
  return { state, ctx, events }
}

function trim(state: GameState, unitId: UnitId, n: number): void {
  for (const id of [...state.units[unitId].models].slice(n)) removeModel(state, id)
}

function pendingOf(ctx: EngineContext): PendingDecision {
  if (!ctx.state.pending) chargeModule.advance(ctx)
  return ctx.state.pending as PendingDecision
}

function act(ctx: EngineContext, action: Action): 'pending' | 'done' {
  const pending = pendingOf(ctx)
  const rej = chargeModule.validate?.(ctx.state, action, pending)
  if (rej) throw new Error(`validate rejected: ${rej.code} ${rej.reason}`)
  ctx.state.pending = null
  const handled = chargeModule.handle(ctx, action, pending)
  if (handled) throw new Error(`handle rejected: ${handled.code} ${handled.reason}`)
  return chargeModule.advance(ctx)
}

function reject(ctx: EngineContext, action: Action): Rejection | null {
  return chargeModule.validate?.(ctx.state, action, pendingOf(ctx)) ?? null
}

const GUARD_R = 16 / 25.4, BRUTE_R = 20 / 25.4

// A:guard (n models in a column behind the first) and a single B:brute at the origin
function setup(dice: number[], guardZ: number, guards = 1) {
  const h = harness(dice)
  trim(h.state, 'A:guard', guards)
  trim(h.state, 'B:brute', 1)
  placeUnit(h.state, 'A:guard', Array.from({ length: guards }, (_, i) => [0, guardZ - i * (2 * GUARD_R + 0.3)] as [number, number]))
  placeUnit(h.state, 'B:brute', [[0, 0]])
  chargeModule.enter(h.ctx)
  return h
}

// select the Guard (that is the declaration, no targets) and let the roll happen; returns the pending decision afterwards
function startCharge(h: ReturnType<typeof harness>): PendingDecision {
  act(h.ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: DID, unitId: 'A:guard' })
  return pendingOf(h.ctx)
}

const endGap = (gap: number) => -(GUARD_R + BRUTE_R + gap) // guard z for an edge gap to the brute at the origin
const chargeTo = (state: GameState, z: number, extra: ModelPlacement[] = []): Action => ({
  type: 'chargeMove', player: 'A', decisionId: DID, unitId: 'A:guard',
  placements: [{ modelId: state.units['A:guard'].models[0], pos: { x: 0, y: 0, z } }, ...extra],
})

describe('aos charge (WP4)', () => {
  it('CHARGE-001 a unit in combat, or one that ran or retreated this turn, is not offered Charge', () => {
    const clear = setup([], -6)
    expect(pendingOf(clear.ctx).kind).toBe('chooseUnitToActivate') // control: free to charge
    const inCombat = setup([], -2.5)
    expect(pendingOf(inCombat.ctx)).toBeNull()
    for (const mt of ['advance', 'fallBack'] as const) {
      const h = setup([], -6)
      h.state.units['A:guard'].turn.moveType = mt
      expect(pendingOf(h.ctx)).toBeNull()
    }
  })

  it('CHARGE-002 a roll of [3,4] moves up to 7": a 7.00 path is accepted, 7.01 is E_OUT_OF_RANGE', () => {
    const h = setup([3, 4], endGap(0.5) - 7)
    const p = startCharge(h)
    expect(p.kind).toBe('chargeMove')
    expect(h.state.units['A:guard'].turn.chargeRoll).toBe(7)
    expect(h.state.units['A:guard'].turn.chargeRollUnmodified).toBe(7)
    expect(reject(h.ctx, chargeTo(h.state, endGap(0.5)))).toBeNull()
    expect(reject(h.ctx, chargeTo(h.state, endGap(0.5) + 0.01))?.code).toBe('E_OUT_OF_RANGE')
  })

  it('CHARGE-003 ending at 0.50" from a visible enemy sets charged; a best gap of 0.51" is not a legal end', () => {
    const h = setup([4, 4], -9)
    startCharge(h)
    expect(reject(h.ctx, chargeTo(h.state, endGap(0.51)))?.code).toBe('E_ENGAGEMENT')
    act(h.ctx, chargeTo(h.state, endGap(0.5)))
    expect(h.state.units['A:guard'].turn.chargedThisTurn).toBe(true)
    expect(h.events.some((e) => e.type === 'ChargeMoved')).toBe(true)
    expect(h.state.units['A:guard'].turn.fightsFirst).toBe(false) // charging grants no Strike-first
  })

  it('CHARGE-004 the charge path may cross another enemy unit combat range', () => {
    const h = setup([5, 5], -9)
    trim(h.state, 'B:guard', 1)
    placeUnit(h.state, 'B:guard', [[4, -5]]) // the path along x = 0 passes within 3" of it
    startCharge(h)
    expect(reject(h.ctx, chargeTo(h.state, endGap(0.5)))).toBeNull()
  })

  it('CHARGE-005 ending within ½" of an enemy that is not visible (a wall between) is not a legal end', () => {
    const h = setup([5, 5], -9)
    addPiece(h.state, wallPiece('w1', -0.9, -4, 4))
    startCharge(h)
    expect(reject(h.ctx, chargeTo(h.state, endGap(0.5)))?.code).toBe('E_ENGAGEMENT')
  })

  it('CHARGE-006 a roll too short for any legal end fails: the unit stays put, charged stays false, its Core slot is used', () => {
    const h = setup([1, 1], -9)
    expect(startCharge(h)).toBeNull() // no chargeMove decision: the stay is automatic
    const u = h.state.units['A:guard']
    expect(u.turn.chargedThisTurn).toBe(false)
    expect(u.turn.usedCoreThisPhase).toBe(true)
    expect(h.events.some((e) => e.type === 'ChargeFailed')).toBe(true)
    expect(u.location).toBe('board')
  })

  it('CHARGE-007 no charge target is declared up front: ChargeDeclared carries none, a declareCharge with targets is refused', () => {
    const h = setup([4, 4], -9)
    const p = startCharge(h)
    expect(p.kind).toBe('chargeMove')
    const declared = h.events.find((e) => e.type === 'ChargeDeclared')
    expect(declared && 'targetUnitIds' in declared ? declared.targetUnitIds : null).toEqual([])
    expect(reject(h.ctx, { type: 'declareCharge', player: 'A', decisionId: DID, unitId: 'A:guard', targetUnitIds: ['B:brute'] })?.code).toBe('E_INVALID_TARGET')
  })

  it('CHARGE-008 only 1 of 4 models ending within ½" is legal if the unit is coherent', () => {
    const h = setup([5, 5], -5.5, 4)
    startCharge(h)
    const ids = h.state.units['A:guard'].models
    const step = 2 * GUARD_R + 0.3
    const placements: ModelPlacement[] = ids.map((id, i) => ({ modelId: id, pos: { x: 0, y: 0, z: endGap(0.5) - i * step } }))
    expect(reject(h.ctx, { type: 'chargeMove', player: 'A', decisionId: DID, unitId: 'A:guard', placements })).toBeNull()
    // breaking coherency is not
    const split = placements.map((p, i) => (i === 3 ? { ...p, pos: { ...p.pos, z: p.pos.z - 1 } } : p))
    expect(reject(h.ctx, { type: 'chargeMove', player: 'A', decisionId: DID, unitId: 'A:guard', placements: split })?.code).toBe('E_COHERENCY')
  })

  it('CHARGE-001 legalActions offer a concrete charge move and the stay-put pass', () => {
    const h = setup([5, 5], -7)
    const p = startCharge(h)
    const legal = chargeModule.legalActions?.(h.state, p) ?? []
    expect(legal.some((a) => a.type === 'chargeMove')).toBe(true)
    expect(legal.some((a) => a.type === 'pass')).toBe(true)
    for (const a of legal) expect(chargeModule.validate?.(h.state, a, p)).toBeNull()
    expect(neededChargeDistance(h.state, 'A:guard', [])).toBeCloseTo(7 - GUARD_R - BRUTE_R - 0.5, 2)
  })
})
