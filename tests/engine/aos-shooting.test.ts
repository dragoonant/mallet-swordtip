// WP5 (13-engine-port-plan §5): shooting phase — target legality (range, Shoot in Combat, Guarded Hero), eligibility, and a
// full Shoot activation through the reducer on the checklist fixtures.
import { describe, expect, it } from 'vitest'
import {
  createContext, createEngine, DEFAULT_MODULES, distance, ScriptedRng,
  type Action, type GameEvent, type GameState, type PendingDecision, type StepResult,
} from '../../src/engine'
import { guardedHero } from '../../src/engine/attack'
import { shootingModule, targetLegality, unitEligibleToShoot } from '../../src/engine/phases/shooting'
import { aosBundle, aosPingPhases, aosState, makeAosSetup } from '../fixtures'
import { placeUnit } from '../fixtures/state'

const world = (): GameState => { const s = aosState(); s.phase = 'shooting'; s.activePlayer = 'A'; return s }
const put = (s: GameState, unitId: string, x: number, z: number, gap = 0.3): void => placeUnit(s, unitId, { x, z, gap })
const weapon = (s: GameState, modelId: string, i = 0) => s.weapons[s.models[modelId].weapons[i]]

// moves `target` along +z until its closest base is `d` from `from` (bisection on the engine's own distance)
function placeAt(s: GameState, fromModel: string, targetModel: string, d: number): void {
  const a = s.models[fromModel], t = s.models[targetModel]
  let lo = 0, hi = 60
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    t.pos = { x: a.pos.x, y: 0, z: a.pos.z + mid }
    if (distance(a, t) < d) lo = mid; else hi = mid
  }
  t.pos = { x: a.pos.x, y: 0, z: a.pos.z + hi }
}

describe('aos shooting: target legality', () => {
  it('SHOOT-002 a 10" pistol reaches a target at 10.00" and not at 10.01"', () => {
    const s = world()
    put(s, 'A:knight', 0, -4); put(s, 'B:hawk', 0, 4)
    const pistol = weapon(s, 'A:knight#0', 0)
    placeAt(s, 'A:knight#0', 'B:hawk#0', 10)
    expect(targetLegality(s, 'A:knight', 'A:knight#0', pistol, 'B:hawk')).toBeNull()
    placeAt(s, 'A:knight#0', 'B:hawk#0', 10.01)
    expect(targetLegality(s, 'A:knight', 'A:knight#0', pistol, 'B:hawk')?.code).toBe('E_NOT_IN_RANGE')
  })

  it('SHOOT-004 / WEAP-010 a unit in combat fires only Shoot in Combat weapons, only at units it is in combat with', () => {
    const s = world()
    put(s, 'A:knight', 0, 0); put(s, 'B:brute', 0, 3, 0.3); put(s, 'B:hawk', 6, -4); put(s, 'A:cannon', 8, 8); put(s, 'B:guard', 8, 10.5, 0.3)
    const pistol = weapon(s, 'A:knight#0', 0)
    expect(targetLegality(s, 'A:knight', 'A:knight#0', pistol, 'B:brute')).toBeNull()
    expect(targetLegality(s, 'A:knight', 'A:knight#0', pistol, 'B:hawk')?.code).toBe('E_INVALID_TARGET')
    // the cannon has no Shoot in Combat weapon: it may not fire while in combat
    expect(targetLegality(s, 'A:cannon', 'A:cannon#0', weapon(s, 'A:cannon#0'), 'B:guard')?.code).toBe('E_IN_COMBAT')
  })

  it('SHOOT-005 an enemy that is in combat with a friendly unit can still be shot', () => {
    const s = world()
    put(s, 'A:cannon', 0, -8); put(s, 'B:brute', 0, 2); put(s, 'A:guard', 0, 4.5, 0.3)
    expect(targetLegality(s, 'A:cannon', 'A:cannon#0', weapon(s, 'A:cannon#0'), 'B:brute')).toBeNull()
  })

  it('SHOOT-022 an INFANTRY Hero beside friendlies cannot be shot from more than 12" away', () => {
    const s = world()
    put(s, 'A:cannon', 0, -8); put(s, 'B:boss', 0, 4); put(s, 'B:guard', 1.4, 4, 0.1)
    const cannon = weapon(s, 'A:cannon#0')
    placeAt(s, 'A:cannon#0', 'B:boss#0', 12)
    put(s, 'B:guard', s.models['B:boss#0'].pos.x + 1.4, s.models['B:boss#0'].pos.z, 0.1)
    expect(targetLegality(s, 'A:cannon', 'A:cannon#0', cannon, 'B:boss')).toBeNull()
    placeAt(s, 'A:cannon#0', 'B:boss#0', 12.01)
    put(s, 'B:guard', s.models['B:boss#0'].pos.x + 1.4, s.models['B:boss#0'].pos.z, 0.1)
    expect(targetLegality(s, 'A:cannon', 'A:cannon#0', cannon, 'B:boss')?.code).toBe('E_INVALID_TARGET')
  })

  it('SHOOT-023 a CAVALRY Hero ignores the 12" clause and a WAR MACHINE is never a Guarded Hero', () => {
    const s = world()
    // Knight (HERO, CAVALRY) with an escort, shot from 13": still targetable
    put(s, 'A:cannon', 0, -8); put(s, 'B:hawk', 20, 20)
    put(s, 'B:boss', 0, 4); put(s, 'B:guard', 1.4, 4, 0.1)
    const knight = s.models['B:boss#0']
    knight.pos = { x: 0, y: 0, z: 40 }
    s.units['B:boss'].location = 'destroyed'
    put(s, 'A:knight', 0, 5); put(s, 'A:guard', 1.9, 5, 0.1)
    s.units['A:cannon'].player = 'B'
    s.activePlayer = 'B'
    const cannon = s.models['A:cannon#0']
    cannon.pos = { x: 0, y: 0, z: 5 - 13 - 2.6 }
    expect(guardedHero(s, 'A:knight')).toBe(true)
    expect(targetLegality(s, 'A:cannon', 'A:cannon#0', weapon(s, 'A:cannon#0'), 'A:knight')).toBeNull()
    expect(guardedHero(s, 'B:hawk')).toBe(false)
  })

  it('SHOOT-001 a unit that ran or retreated this turn is not offered Shoot', () => {
    const s = world()
    put(s, 'A:cannon', 0, -4); put(s, 'B:hawk', 0, 4)
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    expect(unitEligibleToShoot(ctx, 'A:cannon')).toBe(true)
    s.units['A:cannon'].turn.moveType = 'advance'
    expect(unitEligibleToShoot(ctx, 'A:cannon')).toBe(false)
    s.units['A:cannon'].turn.moveType = 'fallBack'
    expect(unitEligibleToShoot(ctx, 'A:cannon')).toBe(false)
  })
})

// ---------- a whole Shoot activation through the reducer ----------
const shootEngine = () => createEngine({ phases: { ...aosPingPhases(), shooting: shootingModule }, services: DEFAULT_MODULES.services, topics: DEFAULT_MODULES.topics })

function firstLegal(engine: ReturnType<typeof shootEngine>, r: StepResult): Action {
  const legal = engine.legalActions(r.state, r.pending as PendingDecision)
  if (!legal || legal.length === 0) throw new Error(`no legal action for ${r.pending?.kind}`)
  return legal[0]
}

describe('aos shooting: Shoot through the reducer', () => {
  it('SHOOT-008 / DMG-001 one Shoot: attacks resolve, one damage sequence per target, the unit cannot shoot twice', () => {
    const engine = shootEngine()
    let r = engine.createGame(makeAosSetup(), 'shoot-flow', aosBundle)
    const events: GameEvent[] = [...r.events]
    for (let i = 0; i < 100 && r.pending?.kind !== 'chooseUnitToActivate'; i++) {
      r = engine.step(r.state, firstLegal(engine, r))
      expect(r.rejection).toBeUndefined()
      events.push(...r.events)
    }
    expect(r.pending?.kind).toBe('chooseUnitToActivate')
    const pend = r.pending as Extract<PendingDecision, { kind: 'chooseUnitToActivate' }>
    expect(r.state.phase).toBe('shooting')
    // bring the cannon into the game's reach: put an enemy 10" in front of it
    expect(pend.context.eligible.length).toBeGreaterThan(0)
    const pick = pend.options.find((o) => o.id === 'A:cannon') ?? pend.options[0]
    r = engine.step(r.state, pick.action)
    expect(r.pending?.kind).toBe('declareTargets')
    r = engine.step(r.state, firstLegal(engine, r))
    expect(r.rejection).toBeUndefined()
    const ev = r.events
    expect(ev.some((e) => e.type === 'AttackSequenceStarted')).toBe(true)
    expect(ev.some((e) => e.type === 'AttackSequenceEnded')).toBe(true)
    if (r.pending?.kind === 'chooseUnitToActivate') expect(r.pending.context.eligible).not.toContain(pick.id)
  })
})
