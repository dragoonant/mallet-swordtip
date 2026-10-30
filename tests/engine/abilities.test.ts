// WP3: the generic activated-ability loop (abilities.ts) and the hero phase (CORE-3.2/3.3/3.4/3.10/3.13).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  abilityService, createEngine, DEFAULT_MODULES, ScriptedRng,
  type Action, type AbilityUse, type EngineApi, type GameEvent, type GameState, type PendingDecision, type StepResult,
} from '../../src/engine'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { commandModule } from '../../src/engine/phases/command'
import type { AbilityDescriptor, DataBundle } from '../../src/data/types'
import { aosPingPhases, aosState, autoDeployAos, makeAosSetup, withAosBundle } from '../fixtures'

const used: string[] = []
const noop = (): void => undefined

const hook = (name: string, extra: Partial<NonNullable<EngineCodeHook['activate']>> = {}): EngineCodeHook => ({
  name, kind: 'ability', hook: 'onPhaseStart', run: noop,
  activate: {
    canUse: () => true,
    resolve: (_ctx, use: AbilityUse) => { used.push(`${name}:${use.unitId}:${use.targetUnitIds.join('+')}:${use.modeId}:${use.roll ? use.roll.final.join('') : '-'}`) },
    ...extra,
  },
})

const act = (id: string, timing: AbilityDescriptor['timing'], extra: Partial<AbilityDescriptor> = {}): AbilityDescriptor =>
  ({ id, name: id, text: 'fixture', trigger: 'activated', timing, code: id, ...extra })

const ABILITIES: AbilityDescriptor[] = [
  act('t.your', { kind: 'phase', phase: 'command', whose: 'your' }),
  act('t.enemy', { kind: 'phase', phase: 'command', whose: 'enemy' }),
  act('t.any', { kind: 'phase', phase: 'command', whose: 'any' }),
  act('t.target', { kind: 'phase', phase: 'command', whose: 'your' }, { roll: { dice: 'D6', succeedOn: 2 }, modes: [{ id: 'x', name: 'Mode X', text: '' }, { id: 'y', name: 'Mode Y', text: '' }] }),
  act('t.sot', { kind: 'startOfTurn', whose: 'your' }),
  act('t.eot', { kind: 'endOfTurn', whose: 'your' }),
  act('t.once', { kind: 'phase', phase: 'command', whose: 'your' }, { limit: 'oncePerBattle' }),
  act('t.onceArmy', { kind: 'phase', phase: 'command', whose: 'your' }, { limit: 'oncePerBattle', params: { army: true } }),
  act('t.core1', { kind: 'phase', phase: 'movement', whose: 'your' }, { keywords: ['CORE'] }),
  act('t.core2', { kind: 'phase', phase: 'movement', whose: 'your' }, { keywords: ['CORE'] }),
  act('t.late', { kind: 'phase', phase: 'command', whose: 'your' }, { fromRound: 3 }),
]

function bundleWith(boss: string[], brute: string[] = [], knight: string[] = []): DataBundle {
  return withAosBundle((b) => {
    for (const a of ABILITIES) b.abilities[a.id] = a
    b.datasheets['fx.boss'].abilities.push(...boss)
    b.datasheets['fx.brute'].abilities.push(...brute)
    b.datasheets['fx.knight'].abilities.push(...knight)
    // two units with the same warscroll (CORE-020), in place of the 10-model guard unit so the army still fits the deploy area
    const units = b.patrols['fx.order.army'].units
    units.splice(units.findIndex((u) => u.ref === 'guard'), 1, { ref: 'brute1', datasheet: 'fx.brute', size: 3 }, { ref: 'brute2', datasheet: 'fx.brute', size: 3 })
  })
}

function engineFor(): EngineApi {
  return createEngine({ phases: { ...aosPingPhases(), command: commandModule }, services: DEFAULT_MODULES.services, topics: DEFAULT_MODULES.topics })
}

const optionIds = (p: PendingDecision | null): string[] => (p && 'options' in p ? p.options.map((o) => o.id) : [])
const topic = (p: PendingDecision | null): string => (p?.kind === 'chooseOption' ? p.context.topic : (p?.kind ?? 'none'))
const pick = (r: StepResult, id: string): Action => {
  const p = r.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
  const o = p.options.find((x) => x.id === id)
  if (!o) throw new Error(`option ${id} not offered (have ${optionIds(p).join(', ')})`)
  return o.action
}
const pass = (r: StepResult): Action => ({ type: 'pass', player: (r.pending as PendingDecision).player, decisionId: (r.pending as PendingDecision).id })
const go = (engine: EngineApi, r: StepResult, action: Action, dice?: number[]): StepResult => {
  const next = engine.step(r.state, action, dice ? new ScriptedRng(dice) : undefined)
  if (next.rejection) throw new Error(`rejected ${next.rejection.code}: ${next.rejection.reason}`)
  return next
}

beforeAll(() => {
  for (const a of ABILITIES) codeHooks[a.id] = hook(a.id)
  codeHooks['t.target'] = hook('t.target', { targets: () => ['B:boss', 'B:brute'] })
})
afterAll(() => { for (const a of ABILITIES) delete codeHooks[a.id] })
beforeEach(() => { used.length = 0 })

describe('hero phase and ability windows (WP3)', () => {
  it('CORE-023 the active player uses their Your / Any hero phase abilities first; the opponent only after they pass', () => {
    const bundle = bundleWith(['t.your', 't.enemy', 't.any'])
    const engine = engineFor()
    let r = engine.createGame(makeAosSetup(), 'abil-023', bundle)
    expect(topic(r.pending)).toBe('abilityUse')
    expect(r.pending?.player).toBe('A')
    expect(optionIds(r.pending).sort()).toEqual(['t.any#A:boss', 't.your#A:boss'])
    r = go(engine, r, pass(r))
    expect(topic(r.pending)).toBe('abilityUse')
    expect(r.pending?.player).toBe('B')
    expect(optionIds(r.pending).sort()).toEqual(['t.any#B:boss', 't.enemy#B:boss'])
    r = go(engine, r, pass(r))
    // the hero phase is over: the movement ping starts
    expect(r.state.phase).toBe('movement')
    expect(used).toEqual([])
  })

  it('CORE-017 an ability used this phase is not offered again in the same phase; it is offered again later', () => {
    const bundle = bundleWith(['t.your', 't.any'])
    const engine = engineFor()
    let r = engine.createGame(makeAosSetup(), 'abil-017', bundle)
    r = go(engine, r, pick(r, 't.your#A:boss'))
    expect(used).toEqual(['t.your:A:boss::null:-'])
    expect(r.events.some((e) => e.type === 'AbilityTriggered' && e.abilityId === 't.your')).toBe(true)
    expect(r.state.players.A.abilityUses).toHaveLength(1)
    // offered the remaining one only
    expect(topic(r.pending)).toBe('abilityUse')
    expect(r.pending?.player).toBe('A')
    expect(optionIds(r.pending)).toEqual(['t.any#A:boss'])
    // a later turn: the one-use-per-phase flags are fresh again
    const later = structuredClone(r.state) as GameState
    later.round = 2
    later.units['A:boss'].turn.abilitiesUsedThisPhase = []
    expect(abilityService.usable(later, 'A', 'hero').map((u) => u.abilityId).sort()).toEqual(['t.any', 't.your'])
  })

  it('CORE-3.2 declare: target, declared roll, then mode; the hook resolves with all of it', () => {
    const bundle = bundleWith(['t.target'])
    const engine = engineFor()
    let r = engine.createGame(makeAosSetup(), 'abil-declare', bundle)
    r = go(engine, r, pick(r, 't.target#A:boss'))
    expect(topic(r.pending)).toBe('abilityTarget')
    expect(optionIds(r.pending)).toEqual(['B:boss', 'B:brute'])
    r = go(engine, r, pick(r, 'B:brute'), [4])
    expect(r.events.some((e) => e.type === 'DiceRolled')).toBe(true)
    expect(topic(r.pending)).toBe('abilityMode')
    expect(optionIds(r.pending)).toEqual(['x', 'y'])
    r = go(engine, r, pick(r, 'y'))
    expect(used).toEqual(['t.target:A:boss:B:brute:y:4'])
    // no longer offered this phase: A has nothing else, so B's window is next (B has the same boss ability but it is not their turn)
    expect(r.pending?.player === 'B' ? optionIds(r.pending) : []).toEqual([])
  })

  it('CORE-3.7 a failed declared roll uses the ability up but has no effect and asks for no mode', () => {
    const bundle = bundleWith(['t.target'])
    const engine = engineFor()
    let r = engine.createGame(makeAosSetup(), 'abil-fail', bundle)
    r = go(engine, r, pick(r, 't.target#A:boss'))
    r = go(engine, r, pick(r, 'B:boss'), [1])
    expect(used).toEqual([])
    expect(r.state.players.A.abilityUses).toHaveLength(1)
    expect(r.events.find((e) => e.type === 'AbilityTriggered')).toMatchObject({ abilityId: 't.target', targetUnitId: 'B:boss' })
    expect(topic(r.pending)).not.toBe('abilityMode')
  })

  it('CORE-020 a Once Per Battle unit ability stays available to another unit with the same warscroll; the Army variant does not', () => {
    const state = aosState({}, bundleWith([], ['t.once', 't.onceArmy']))
    autoDeployAos(state, 'A')
    state.phase = 'command'
    state.activePlayer = 'A'
    const ids = (): string[] => abilityService.usable(state, 'A', 'hero').map((u) => `${u.abilityId}#${u.unitId}`).sort()
    expect(ids()).toEqual(['t.once#A:brute1', 't.once#A:brute2', 't.onceArmy#A:brute1', 't.onceArmy#A:brute2'])
    state.players.A.abilityUses.push({ abilityId: 't.once', unitId: 'A:brute1', round: 1, turn: 'A', phase: 'command' })
    state.players.A.abilityUses.push({ abilityId: 't.onceArmy', unitId: 'A:brute1', round: 1, turn: 'A', phase: 'command' })
    state.round = 2
    expect(ids()).toEqual(['t.once#A:brute2'])
  })

  it('CORE-016 a unit uses at most one CORE ability per phase', () => {
    const state = aosState({}, bundleWith([], [], ['t.core1', 't.core2']))
    autoDeployAos(state, 'A')
    state.phase = 'movement'
    state.activePlayer = 'A'
    const ids = (): string[] => abilityService.usable(state, 'A', 'movement').map((u) => u.abilityId).sort()
    expect(ids()).toEqual(['t.core1', 't.core2'])
    state.units['A:knight'].turn.usedCoreThisPhase = true
    expect(ids()).toEqual([])
  })

  it('CORE-3.13 fromRound gates an ability until that battle round', () => {
    const state = aosState({}, bundleWith(['t.late']))
    autoDeployAos(state, 'A')
    state.phase = 'command'
    state.activePlayer = 'A'
    state.round = 2
    expect(abilityService.usable(state, 'A', 'hero')).toEqual([])
    state.round = 3
    expect(abilityService.usable(state, 'A', 'hero').map((u) => u.abilityId)).toEqual(['t.late'])
  })

  it('CORE-3.13 Start of Turn and End of Turn abilities are offered by the reducer in their windows', () => {
    const bundle = bundleWith(['t.sot', 't.eot'])
    const engine = engineFor()
    let r = engine.createGame(makeAosSetup(), 'abil-turn', bundle)
    // the Start of Turn window comes before the hero phase
    expect(topic(r.pending)).toBe('abilityUse')
    expect(r.pending?.window).toBe('turn.start')
    expect(r.state.phase).not.toBe('command')
    r = go(engine, r, pick(r, 't.sot#A:boss'))
    expect(used).toEqual(['t.sot:A:boss::null:-'])
    const events: GameEvent[] = []
    // answer everything with its first legal action, using the End of Turn ability when it is offered
    for (let i = 0; i < 100 && r.state.activePlayer === 'A'; i++) {
      const legal = engine.legalActions(r.state, r.pending as PendingDecision) as Action[]
      const eot = r.pending && 'options' in r.pending ? r.pending.options.find((o) => o.id.startsWith('t.eot#')) : undefined
      r = go(engine, r, eot ? eot.action : legal.find((a) => a.type === 'pass') ?? legal[0])
      events.push(...r.events)
    }
    expect(used).toEqual(['t.sot:A:boss::null:-', 't.eot:A:boss::null:-'])
    const fought = events.findIndex((e) => e.type === 'PhaseStarted' && e.phase === 'fight')
    const eot = events.findIndex((e) => e.type === 'AbilityTriggered' && e.abilityId === 't.eot')
    const next = events.findIndex((e) => e.type === 'TurnStarted')
    expect(fought).toBeGreaterThanOrEqual(0)
    expect(eot).toBeGreaterThan(fought)
    expect(next).toBeGreaterThan(eot)
  })
})
