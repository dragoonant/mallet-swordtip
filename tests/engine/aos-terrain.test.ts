// WP4 (13-engine-port-plan §5): terrain and visibility. LoS (CORE-7), Cover / Obscuring / behind / wholly on (CORE-16.3 to
// 16.6, SPH-5.3 to 5.7), Unstable and climbing (CORE-6.7, CORE-16.7, SPH-5.6).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ENGINE_VERSION, ScriptedRng, abilityService, createContext, removeModel, unitModels,
  type Action, type GameState, type ModuleTable, type PendingDecision, type TerrainPiece, type UnitId,
} from '../../src/engine'
import type { ModelPlacement } from '../../src/engine/actions'
import { movementModule } from '../../src/engine/phases/movement'
import { losService } from '../../src/engine/los'
import { deployTerrainBlock, terrainService } from '../../src/engine/terrain'
import { aosBundle, aosState, placeUnit, recordingStratagems } from '../fixtures'

void ENGINE_VERSION

const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]

// a thin wall along z = `z` from x0 to x1
function wallPiece(id: string, z: number, x0: number, x1: number, height = 4): TerrainPiece {
  return { id, kind: 'ruin', pos: { x: 0, z }, rot: 0, footprint: rect(x0, z - 0.1, x1, z + 0.1), height, traits: ['unstable'], walls: [{ a: { x: x0, z }, b: { x: x1, z }, height }], floors: [] }
}
// an area feature (no walls): a ruin footprint or a block
function feature(id: string, poly: ReturnType<typeof rect>, traits: TerrainPiece['traits'], kind: TerrainPiece['kind'] = 'ruin', height = 4): TerrainPiece {
  return { id, kind, pos: { x: 0, z: 0 }, rot: 0, footprint: poly, height, traits, walls: [], floors: [] }
}
function addPiece(state: GameState, piece: TerrainPiece): void {
  state.board = { ...state.board, pieces: { ...state.board.pieces, [piece.id]: piece } }
}
function trim(state: GameState, unitId: UnitId, n: number): void {
  for (const id of [...state.units[unitId].models].slice(n)) removeModel(state, id)
}

function fresh() {
  const state = aosState({}, aosBundle)
  state.phase = 'movement'
  state.round = 1
  state.activePlayer = 'A'
  return state
}

// attacker Guard of A and target Brute of B, one model each
function pair(attacker: [number, number], target: [number, number]) {
  const state = fresh()
  trim(state, 'A:guard', 1)
  trim(state, 'B:brute', 1)
  placeUnit(state, 'A:guard', [attacker])
  placeUnit(state, 'B:brute', [target])
  return state
}

describe('aos terrain and visibility (WP4)', () => {
  it('TERR-001 a sliver of the target base visible past a wall is visible; fully occluded is not', () => {
    const state = pair([0, -6], [0, 0])
    const g = state.units['A:guard'].models[0], b = state.units['B:brute'].models[0]
    addPiece(state, wallPiece('w', -3, -10, 0.65))
    expect(losService.visible(state, g, b)).toBe(true)
    addPiece(state, wallPiece('w', -3, -10, 0.75))
    expect(losService.visible(state, g, b)).toBe(false)
  })

  it('TERR-002 a friendly unit fully occluding the target blocks sight; the observer\'s own unit never does', () => {
    const state = fresh()
    trim(state, 'A:guard', 2)
    trim(state, 'B:guard', 1)
    const [g1, g2] = state.units['A:guard'].models
    placeUnit(state, 'A:guard', [[0, -10], [0, -8]]) // g2 stands right in front of g1
    placeUnit(state, 'B:guard', [[0, 0]])
    const target = state.units['B:guard'].models[0]
    expect(losService.visible(state, g1, target)).toBe(true) // own models never block
    // a wide, tall model of another unit in the way does
    trim(state, 'A:cannon', 1)
    placeUnit(state, 'A:cannon', [[0, -5]])
    state.models[state.units['A:cannon'].models[0]].height = 6
    expect(losService.visible(state, g1, target)).toBe(false)
    expect(g2).toBeDefined()
  })

  it('TERR-004 behind: every line crosses the feature; one clear line means not behind', () => {
    const state = pair([0, -8], [0, 0])
    addPiece(state, feature('f', rect(-3.5, -4.5, 3.5, -2.5), ['cover'], 'crate', 2))
    expect(losService.behind(state, 'A:guard', 'B:brute', 'f')).toBe(true)
    addPiece(state, feature('f', rect(-0.3, -4.5, 0.3, -2.5), ['cover'], 'crate', 2))
    expect(losService.behind(state, 'A:guard', 'B:brute', 'f')).toBe(false)
  })

  it('TERR-005 the only crossing part lies within the attacker\'s 3" combat range: not behind', () => {
    const state = pair([0, -8], [0, 0])
    addPiece(state, feature('f', rect(-3.5, -6, 3.5, -5), ['cover'], 'crate', 2))
    expect(losService.behind(state, 'A:guard', 'B:brute', 'f')).toBe(false)
    expect(losService.coverPenalty(state, 'A:guard', 'B:brute')).toBe(0)
  })

  it('TERR-006 a target behind a small feature suffers Cover (-1 to hit), and is still a shooting target (no Obscuring)', () => {
    const state = pair([0, -8], [0, 0])
    addPiece(state, feature('f', rect(-3.5, -4.5, 3.5, -2.5), ['cover', 'unstable'], 'crate', 2))
    expect(losService.coverPenalty(state, 'A:guard', 'B:brute')).toBe(1)
    expect(losService.obscured(state, 'A:guard', 'B:brute')).toBe(false) // TERR-012
  })

  it('TERR-007 a target wholly on a feature has Cover against combat attacks from close range too', () => {
    const state = pair([0, -2.5], [0, 0])
    addPiece(state, feature('f', rect(-3, -1.5, 3, 1.5), ['cover']))
    expect(losService.whollyOn(state, 'B:brute', 'f')).toBe(true)
    expect(losService.coverPenalty(state, 'A:guard', 'B:brute')).toBe(1)
  })

  it('TERR-008 no Cover when the target charged this turn or can fly', () => {
    const state = pair([0, -8], [0, 0])
    addPiece(state, feature('f', rect(-3.5, -4.5, 3.5, -2.5), ['cover'], 'crate', 2))
    expect(losService.coverPenalty(state, 'A:guard', 'B:brute')).toBe(1)
    state.units['B:brute'].turn.chargedThisTurn = true
    expect(losService.coverPenalty(state, 'A:guard', 'B:brute')).toBe(0)
    const hawk = pair([0, -8], [0, 0])
    trim(hawk, 'B:hawk', 1)
    placeUnit(hawk, 'B:hawk', [[0, 0]])
    addPiece(hawk, feature('f', rect(-3.5, -4.5, 3.5, -2.5), ['cover'], 'crate', 2))
    expect(losService.coverPenalty(hawk, 'A:guard', 'B:hawk')).toBe(0)
  })

  it('TERR-009 a base overhanging the feature edge is not wholly on, and gets no Cover unless behind', () => {
    const state = fresh()
    trim(state, 'A:guard', 1)
    trim(state, 'B:brute', 2)
    placeUnit(state, 'A:guard', [[-10, 6]])
    placeUnit(state, 'B:brute', [[0, 0], [0, 1.5]])
    addPiece(state, feature('f', rect(-3, -1, 3, 1), ['cover']))
    expect(losService.whollyOn(state, 'B:brute', 'f')).toBe(false)
    expect(losService.coverPenalty(state, 'A:guard', 'B:brute')).toBe(0)
  })

  it('TERR-011 a unit wholly on a large (Obscuring) feature cannot be shot, unless it can fly; Cover still applies', () => {
    const state = pair([0, -9], [0, 0])
    addPiece(state, feature('f', rect(-3, -2, 3, 2), ['cover', 'obscuring', 'unstable']))
    expect(losService.obscured(state, 'A:guard', 'B:brute')).toBe(true)
    expect(losService.coverPenalty(state, 'A:guard', 'B:brute')).toBe(1) // combat attacks still suffer -1 to hit
    const hawk = fresh()
    trim(hawk, 'A:guard', 1)
    trim(hawk, 'B:hawk', 1)
    placeUnit(hawk, 'A:guard', [[0, -9]])
    placeUnit(hawk, 'B:hawk', [[0, 0]])
    addPiece(hawk, feature('f', rect(-3, -2, 3, 2), ['cover', 'obscuring', 'unstable']))
    expect(losService.obscured(hawk, 'A:guard', 'B:hawk')).toBe(false)
  })

  it('TERR-013 Unstable: a move may cross a tall part but not end on it; parts of 1" or less are ignored; climbing counts', () => {
    const state = fresh()
    state.activePlayer = 'A'
    trim(state, 'A:guard', 1)
    trim(state, 'B:hawk', 1)
    placeUnit(state, 'A:guard', [[0, -9]])
    placeUnit(state, 'B:hawk', [[10, 9]])
    addPiece(state, wallPiece('tall', 0.5, -3, 3, 4))
    addPiece(state, wallPiece('low', -4, -3, 3, 1))
    addPiece(state, wallPiece('mid', -8, -3, 3, 1.5))
    const modules: ModuleTable = { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, stratagems: recordingStratagems(), abilities: { ...abilityService, runWindow: () => false } } }
    const { ctx } = createContext(state, new ScriptedRng([]), modules)
    movementModule.enter(ctx)
    const run = (unit: UnitId, from: [number, number], to: [number, number]): string | null => {
      placeUnit(state, unit, [from])
      state.units[unit].turn.moveType = null
      state.phaseState.marks = []
      state.phaseState.activated = []
      state.pending = null
      state.step = 'select'
      movementModule.advance(ctx)
      const player = state.units[unit].player
      state.pending = null
      movementModule.handle(ctx, { type: 'chooseUnitToActivate', player, decisionId: '', unitId: unit }, { kind: 'chooseUnitToActivate' } as PendingDecision)
      movementModule.advance(ctx)
      state.pending = null
      movementModule.handle(ctx, { type: 'declareMove', player, decisionId: '', unitId: unit, moveType: 'normal' }, { kind: 'declareMove' } as PendingDecision)
      movementModule.advance(ctx)
      const pending = state.pending as unknown as PendingDecision
      const placements: ModelPlacement[] = [{ modelId: state.units[unit].models[0], pos: { x: to[0], y: 0, z: to[1] } }]
      const rej = movementModule.validate?.(state, { type: 'moveUnit', player, decisionId: '', unitId: unit, placements } as Action, pending)
      return rej ? rej.code : null
    }
    // ending on the 4" wall: rejected
    expect(run('A:guard', [0, -3], [0, 0.5])).toBe('E_OVERLAP')
    // a ground model cannot afford to climb a 4" wall (up and down = 8")
    expect(run('A:guard', [0, -1], [0, 3])).toBe('E_OUT_OF_RANGE')
    // a 1" wall is ignored entirely, even ending on it
    expect(run('A:guard', [0, -6], [0, -4])).toBeNull()
    expect(run('A:guard', [0, -6], [0, -2.5])).toBeNull()
    // a 1.5" wall costs 3" extra: 2" + 3" = 5" is exactly Move 5, a hair more is not
    expect(run('A:guard', [0, -9], [0, -7])).toBeNull()
    expect(run('A:guard', [0, -9], [0, -6.9])).toBe('E_OUT_OF_RANGE')
    // FLY ignores terrain: the Hawk crosses the tall wall at its full Move
    state.activePlayer = 'B'
    expect(run('B:hawk', [0, -1], [0, 4])).toBeNull()
  })

  it('TERR-014 nothing is set up on a part taller than 1" of an Unstable feature', () => {
    const state = fresh()
    const model = state.models[state.units['A:guard'].models[0]]
    addPiece(state, wallPiece('tall', 0.5, -3, 3, 4))
    addPiece(state, wallPiece('low', -5, -3, 3, 1))
    addPiece(state, feature('shrine', rect(5, -3, 8, -1), ['cover', 'unstable'], 'crate', 2))
    expect(deployTerrainBlock(state, model, { x: 0, y: 0, z: 0.5 })).not.toBeNull() // on the 4" wall
    expect(deployTerrainBlock(state, model, { x: 0, y: 0, z: 2 })).toBeNull() // open ground inside the footprint
    expect(deployTerrainBlock(state, model, { x: 0, y: 0, z: -5 })).toBeNull() // a 1" wall is ignored
    expect(deployTerrainBlock(state, model, { x: 6.5, y: 0, z: -2 })).not.toBeNull() // inside the 2" shrine
    expect(deployTerrainBlock(state, model, { x: 6.5, y: 2, z: -2 })).toContain('unstable') // on top of it
    expect(terrainService.canEndAt(state, model, { x: 6.5, y: 2, z: -2 }).ok).toBe(false)
    // the same block without the Unstable trait is a fine place to stand
    addPiece(state, feature('shrine', rect(5, -3, 8, -1), ['cover'], 'crate', 2))
    expect(deployTerrainBlock(state, model, { x: 6.5, y: 2, z: -2 })).toBeNull()
    void unitModels
  })
})
