// F18 engine-core for the last five armies (Slaanesh, Helsmiths, Flesh-eater Courts, Ogors, Sons of Behemat) plus two core-rule
// fixes. Test names carry ENG-F18-<n> (13-engine-port-plan §3.15):
//  1 RollModifierResult.affectsCompanion   2 Effect.rollFloor (run roll)      3 EngineCodeHook.pileInBonus
//  4 chainFight / fightPickable            5 deployment-phase ability window  6 ActivatedAbilityHook.maxTargets + modesFor(targets)
//  7 mandatory abilities offered alone     8 EffectGrant.expiryOwner          9 Effect.noAbilities
// 10 edgeAll arrivals                     11 Effect.passAcrossTerrain         12 EngineCodeHook.wardRollModifier
// 13 SlideOpts.combatPathExcept           14 core 22.0 returned models in combat  (core 24.1 reserves: sph-scoring SPH-014)
import { afterEach, describe, expect, it } from 'vitest'
import {
  createContext, createEngine, DEFAULT_MODULES, registerDataBundle, ScriptedRng, SeededRng, setupModule, removeModel, unitModels,
  type Action, type DeclaredTarget, type EngineApi, type GameEvent, type GameState, type PendingDecision, type StepResult, type UnitId,
} from '../../src/engine'
import type { DataBundle } from '../../src/data/types'
import { abilityService } from '../../src/engine/abilities'
import { attackService } from '../../src/engine/attack'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { ENGAGEMENT_H, distance, horizontalGap } from '../../src/engine/geometry'
import { terrainService } from '../../src/engine/terrain'
import { chainFight, fightModule, fightPickable, isChainedFight } from '../../src/engine/phases/fight'
import { canDeclareCharge } from '../../src/engine/phases/charge'
import { resolveSetUp } from '../../src/engine/phases/movement'
import { checkSlide, nearBoardEdge, reinforcementFormation, reinforcementOptions, slideOptions, writeMoveQueue } from '../../src/engine/factions/aos-moves'
import { returnSlainModels } from '../../src/engine/factions/aos-common'
import { aosPingPhases, aosState, makeAosPlayer, makeAosSetup, withAosBundle } from '../fixtures'
import { placeUnit } from '../fixtures/state'

const noop = (): void => {}
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const put = (s: GameState, unitId: string, x: number, z: number, gap = 0.3): void => placeUnit(s, unitId, { x, z, gap })
const trim = (s: GameState, unitId: UnitId, n: number): void => { for (const id of [...s.units[unitId].models].slice(n)) removeModel(s, id) }
const offBoard = (s: GameState): void => { for (const u of Object.values(s.units)) u.location = 'reserves' }
function hook(name: string, extra: Partial<EngineCodeHook>): void {
  codeHooks[name] = { name, kind: 'ability', hook: 'onStatQuery', run: noop as never, ...extra } as EngineCodeHook
}
// answer the pending ability decision with option `id` (or pass)
function answer(ctx: ReturnType<typeof createContext>['ctx'], s: GameState, id: string | 'pass'): void {
  const p = s.pending as PendingDecision & { kind: 'chooseOption' }
  s.pending = null
  const action = id === 'pass' ? { type: 'pass' as const, player: p.player, decisionId: '' } : p.options.find((o) => o.id === id)?.action
  if (!action) throw new Error(`option ${id} not offered: ${p.options.map((o) => o.id).join(', ')}`)
  expect(abilityService.handler.handle(ctx, action as Action, p)).toBeUndefined()
}
const optionIds = (s: GameState): string[] => (s.pending as PendingDecision & { kind: 'chooseOption' }).options.map((o) => o.id)

// ---------- 1 ----------
describe('ENG-F18-1 Companion roll modifiers', () => {
  it('ENG-F18-1 a friendly +1 to hit with affectsCompanion reaches the Companion hooves (WEAP-005 without the flag does not)', () => {
    const s = aosState()
    s.phase = 'fight'; s.activePlayer = 'A'
    s.units['A:knight'].effects.push({ id: 'e1', sourceAbilityId: 'x', sourceUnitId: 'A:knight', effect: { modifyRoll: { roll: 'hit', value: 1 }, affectsCompanion: true }, scope: { who: 'self' }, expires: { kind: 'battle', round: 1, player: null }, when: null })
    put(s, 'A:knight', -4, 0); put(s, 'B:hawk', -4, 2)
    const w = (i: number): string => s.models['A:knight#0'].weapons[i]
    const targets: DeclaredTarget[] = [1, 2].map((i) => ({ modelId: 'A:knight#0', weaponId: w(i), targetUnitId: 'B:hawk', profileGroup: null, attacks: 1 }))
    const { ctx, events } = createContext(s, new ScriptedRng([2, 1, 4, 1, 1, 1]), DEFAULT_MODULES)
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:knight', overwatch: false, targets })
    attackService.advance(ctx)
    const hits = of(events, 'HitRolled')
    expect(hits).toHaveLength(2)
    expect(hits[1]).toMatchObject({ die: 4, hit: true }) // hooves hit 5+: 4 + 1
  })
})

// ---------- 2 ----------
describe('ENG-F18-2 run-roll floor (Effect.rollFloor)', () => {
  it('ENG-F18-2 a rolled 1-3 counts as 4 before modifiers; the highest floor wins; higher rolls are untouched', () => {
    const s = aosState()
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    expect(hookService.advanceRollFor(s, 'A:guard', 2)).toBe(2)
    effectService.grant(ctx, 'A:guard', { rollFloor: { roll: 'advance', value: 3 } }, { sourceAbilityId: 'x1', sourceUnitId: null, scope: { who: 'self' }, duration: 'battle' })
    effectService.grant(ctx, 'A:guard', { rollFloor: { roll: 'advance', value: 4 } }, { sourceAbilityId: 'x2', sourceUnitId: null, scope: { who: 'self' }, duration: 'battle' })
    expect(hookService.advanceRollFor(s, 'A:guard', 2)).toBe(4)
    expect(hookService.advanceRollFor(s, 'A:guard', 5)).toBe(5)
    effectService.grant(ctx, 'A:guard', { modifyRoll: { roll: 'advance', value: 1 } }, { sourceAbilityId: 'x3', sourceUnitId: null, scope: { who: 'self' }, duration: 'battle' })
    expect(hookService.advanceRollFor(s, 'A:guard', 1)).toBe(5) // floor first, then +1
    expect(hookService.advanceRollFor(s, 'A:boss', 1)).toBe(1)
  })
})

// ---------- 3 / 12 ----------
const traitCode = (code: string) => (b: DataBundle): void => { b.abilities['fx.a.order-trait'] = { ...b.abilities['fx.a.order-trait'], code } }

describe('ENG-F18-3 pile-in bonus', () => {
  it('ENG-F18-3 pileInBonus dice are rolled once per activation and added to the pile-in distance', () => {
    hook('f18Pile', { pileInBonus: (_s, _e, unitId) => (unitId === 'A:guard' ? 'D6' : null) })
    const s = aosState({}, withAosBundle(traitCode('f18Pile')))
    expect(hookService.pileInBonusFor(s, 'A:guard')).toEqual([{ expr: 'D6', sourceId: 'fx.a.order-trait' }])
    expect(hookService.pileInBonusFor(s, 'A:boss')).toEqual([])
    s.phase = 'fight'; s.activePlayer = 'A'
    trim(s, 'A:guard', 1); trim(s, 'B:guard', 1)
    put(s, 'A:guard', 0, 0); put(s, 'B:guard', 0, 2.6)
    const { ctx, events } = createContext(s, new ScriptedRng([5, 1, 1, 1, 1, 1, 1, 1]), DEFAULT_MODULES)
    fightModule.enter(ctx)
    expect(fightModule.advance(ctx)).toBe('pending')
    const pick = s.pending as PendingDecision & { kind: 'chooseFightUnit' }
    s.pending = null
    fightModule.handle(ctx, pick.options.find((o) => o.id === 'A:guard')!.action, pick)
    expect(fightModule.advance(ctx)).toBe('pending')
    const pile = s.pending as unknown as PendingDecision
    expect(pile.kind).toBe('pileIn')
    expect((pile as PendingDecision & { kind: 'pileIn' }).context.distance).toBe(8) // 3 + D6 (5)
    expect(of(events, 'AbilityTriggered').some((e) => e.abilityId === 'fx.a.order-trait' && /\+5"/.test(e.summary))).toBe(true)
  })
})

describe('ENG-F18-12 attacker-side ward modifier', () => {
  it('ENG-F18-12 wardRollModifier answers make the ward roll harder against that attacker', () => {
    hook('f18Ward', { wardRollModifier: (_s, _e, info) => (info.attackerUnitId === 'A:guard' && info.kind === 'melee' ? -1 : 0) })
    const s = aosState({}, withAosBundle((b) => { traitCode('f18Ward')(b); b.datasheets['fx.brute'].stats.ward = 5 }))
    expect(hookService.wardRollModifierFor(s, { wardedUnitId: 'B:brute', attackerUnitId: 'A:guard', kind: 'melee' })).toBe(-1)
    expect(hookService.wardRollModifierFor(s, { wardedUnitId: 'B:brute', attackerUnitId: 'A:guard', kind: 'ranged' })).toBe(0)
    s.phase = 'fight'; s.activePlayer = 'A'
    put(s, 'A:guard', -4, 0); put(s, 'B:brute', -4, 2)
    const target: DeclaredTarget = { modelId: 'A:guard#0', weaponId: s.models['A:guard#0'].weapons[0], targetUnitId: 'B:brute', profileGroup: null, attacks: 1 }
    const { ctx, events } = createContext(s, new ScriptedRng([4, 4, 1, 5]), DEFAULT_MODULES)
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:guard', overwatch: false, targets: [target] })
    attackService.advance(ctx)
    const ward = of(events, 'FeelNoPainRolled')
    expect(ward).toHaveLength(1)
    expect(ward[0]).toMatchObject({ die: 5, needed: 6, ignored: false })
  })
})

// ---------- 4 / 9 (fight) ----------
describe('ENG-F18-4 chained fight', () => {
  it('ENG-F18-4 a chained unit fights right after the first, with no pick decision, and the opponent then picks', () => {
    const s = aosState()
    s.phase = 'fight'; s.activePlayer = 'A'
    put(s, 'A:guard', -8, 0); put(s, 'B:guard', -8, 2.5)
    put(s, 'A:boss', 6, 0); put(s, 'B:brute', 6, 2.5)
    const { ctx, events } = createContext(s, new SeededRng('f18-chain'), DEFAULT_MODULES)
    fightModule.enter(ctx)
    const picks: { player: string; unit: string }[] = []
    let chained = false
    for (let i = 0; i < 400 && fightModule.advance(ctx) !== 'done'; i++) {
      const p = s.pending as PendingDecision
      let action = (fightModule.legalActions?.(s, p) ?? [])[0]
      if (p.kind === 'chooseFightUnit') {
        if (p.player === 'A' && !chained) {
          expect(fightPickable(s, 'A:boss')).toBe(true)
          action = p.options.find((o) => o.id === 'A:guard')!.action
          chainFight(s, 'A:boss')
          chained = true
        }
        picks.push({ player: p.player, unit: (action as { unitId: string }).unitId })
      }
      if (p.kind === 'pileIn' && (p as PendingDecision & { kind: 'pileIn' }).context.unitId === 'A:boss') expect(isChainedFight(s, 'A:boss')).toBe(true)
      s.pending = null
      fightModule.handle(ctx, action, p)
    }
    // A picked once (Guard), the Boss followed by itself, then B picked both its units
    expect(picks.map((p) => p.player)).toEqual(['A', 'B', 'B'])
    expect(of(events, 'FightUnitSelected').map((e) => e.unitId).slice(0, 2)).toEqual(['A:guard', 'A:boss'])
    expect(fightPickable(s, 'A:boss')).toBe(false)
  })
})

describe('ENG-F18-9 noAbilities', () => {
  it('ENG-F18-9 a unit under noAbilities cannot charge, is never picked to fight (and does not hold up Strike-last), and friendly abilities cannot target it', () => {
    const s = aosState()
    s.phase = 'fight'; s.activePlayer = 'A'
    put(s, 'A:guard', -8, 0); put(s, 'B:guard', -8, 2.5)
    const { ctx } = createContext(s, new SeededRng('f18-noab'), DEFAULT_MODULES)
    effectService.grant(ctx, 'A:guard', { noAbilities: true }, { sourceAbilityId: 'scroll', sourceUnitId: 'A:guard', scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    expect(hookService.unitHasEffectFlag(s, 'A:guard', 'noAbilities')).toBe(true)
    fightModule.enter(ctx)
    const eligible: string[][] = []
    for (let i = 0; i < 200 && fightModule.advance(ctx) !== 'done'; i++) {
      const p = s.pending as PendingDecision
      if (p.kind === 'chooseFightUnit') eligible.push(p.context.eligible)
      s.pending = null
      fightModule.handle(ctx, (fightModule.legalActions?.(s, p) ?? [])[0], p)
    }
    expect(eligible.flat()).not.toContain('A:guard')
    expect(eligible.flat()).toContain('B:guard')
    // charge: an otherwise eligible charger is not
    const t = aosState()
    put(t, 'A:boss', 0, -4); put(t, 'B:brute', 0, 4)
    expect(canDeclareCharge(t, 'A:boss')).toBe(true)
    const c2 = createContext(t, new SeededRng('x'), DEFAULT_MODULES)
    effectService.grant(c2.ctx, 'A:boss', { noAbilities: true }, { sourceAbilityId: 'scroll', sourceUnitId: 'A:boss', scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    expect(canDeclareCharge(t, 'A:boss')).toBe(false)
  })
})

// ---------- 6 / 7 / 9 (abilities) ----------
describe('ENG-F18-6/7 declare step', () => {
  const regimentCode = (code: string, params: Record<string, unknown> = {}) => (b: DataBundle): void => {
    b.abilities['fx.a.order-regiment-1'] = { ...b.abilities['fx.a.order-regiment-1'], code, params }
  }

  it('ENG-F18-6 maxTargets repeats the target pick (no repeats, Done after the first); modesFor sees the picked targets', () => {
    const resolved: { targets: UnitId[]; mode: string | null }[] = []
    let seen: UnitId[] | undefined
    hook('f18Multi', {
      activate: {
        canUse: () => true,
        targets: (st) => ['A:guard', 'A:knight', 'A:cannon'].filter((id) => st.units[id].location === 'board'),
        maxTargets: () => 2,
        modesFor: (_st, _u, _p, targetUnitIds) => { seen = targetUnitIds; return targetUnitIds && targetUnitIds.length === 2 ? [{ id: 'two-a', label: 'A' }, { id: 'two-b', label: 'B' }] : [] },
        resolve: (_ctx, use) => { resolved.push({ targets: use.targetUnitIds, mode: use.modeId }) },
      },
    })
    const s = aosState({}, withAosBundle(regimentCode('f18Multi')))
    s.phase = 'command'; s.activePlayer = 'A'
    for (const [id, x] of [['A:guard', -10], ['A:knight', 0], ['A:cannon', 8]] as const) put(s, id, x, -8)
    const { ctx } = createContext(s, new SeededRng('f18-multi'), DEFAULT_MODULES)
    const window = (): boolean => abilityService.runWindow(ctx, 'hero', 'A', 'h')
    expect(window()).toBe(true)
    answer(ctx, s, optionIds(s)[0])
    expect(window()).toBe(true)
    expect(optionIds(s)).toEqual(['A:guard', 'A:knight', 'A:cannon']) // no Done before the first pick
    answer(ctx, s, 'A:knight')
    expect(window()).toBe(true)
    expect(optionIds(s)).toEqual(['A:guard', 'A:cannon', '__done'])
    answer(ctx, s, 'A:cannon')
    expect(window()).toBe(true) // the two-target modes
    expect(seen).toEqual(['A:knight', 'A:cannon'])
    answer(ctx, s, 'two-b')
    window()
    expect(resolved).toEqual([{ targets: ['A:knight', 'A:cannon'], mode: 'two-b' }])

    // Done after one pick; a friendly unit under noAbilities (ENG-F18-9) is not offered
    const t = aosState({}, withAosBundle(regimentCode('f18Multi')))
    t.phase = 'command'; t.activePlayer = 'A'
    for (const [id, x] of [['A:guard', -10], ['A:knight', 0], ['A:cannon', 8]] as const) put(t, id, x, -8)
    const c2 = createContext(t, new SeededRng('f18-multi2'), DEFAULT_MODULES)
    effectService.grant(c2.ctx, 'A:guard', { noAbilities: true }, { sourceAbilityId: 'scroll', sourceUnitId: 'A:guard', scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    abilityService.runWindow(c2.ctx, 'hero', 'A', 'h')
    answer(c2.ctx, t, optionIds(t)[0])
    abilityService.runWindow(c2.ctx, 'hero', 'A', 'h')
    expect(optionIds(t)).toEqual(['A:knight', 'A:cannon'])
    answer(c2.ctx, t, 'A:cannon')
    abilityService.runWindow(c2.ctx, 'hero', 'A', 'h')
    answer(c2.ctx, t, '__done')
    abilityService.runWindow(c2.ctx, 'hero', 'A', 'h')
    expect(resolved[1]).toEqual({ targets: ['A:cannon'], mode: null })
  })

  it('ENG-F18-7 a mandatory ability is offered alone (no pass) before the others', () => {
    const used: string[] = []
    hook('f18Must', { activate: { canUse: () => true, resolve: (_c, use) => { used.push(use.abilityId) } } })
    hook('f18May', { activate: { canUse: () => true, resolve: (_c, use) => { used.push(use.abilityId) } } })
    const s = aosState({}, withAosBundle((b) => {
      regimentCode('f18Must', { mandatory: true })(b)
      b.abilities['fx.a.order-trait'] = { ...b.abilities['fx.a.order-trait'], trigger: 'activated', timing: { kind: 'phase', phase: 'command', whose: 'your' }, code: 'f18May' }
    }))
    s.phase = 'command'; s.activePlayer = 'A'
    put(s, 'A:boss', 0, -8)
    const { ctx } = createContext(s, new SeededRng('f18-must'), DEFAULT_MODULES)
    expect(abilityService.usable(s, 'A', 'hero').map((u) => u.abilityId).sort()).toEqual(['fx.a.order-regiment-1', 'fx.a.order-trait'])
    expect(abilityService.runWindow(ctx, 'hero', 'A', 'h')).toBe(true)
    const first = s.pending as PendingDecision & { kind: 'chooseOption' }
    expect(first.canPass).toBe(false)
    expect(first.options.map((o) => o.id)).toEqual(['fx.a.order-regiment-1#-'])
    answer(ctx, s, 'fx.a.order-regiment-1#-')
    expect(abilityService.runWindow(ctx, 'hero', 'A', 'h')).toBe(true)
    expect(optionIds(s)).toEqual(['fx.a.order-trait#-'])
    expect((s.pending as PendingDecision).canPass).toBe(true)
    expect(used).toEqual(['fx.a.order-regiment-1'])
  })
})

// ---------- 5 ----------
describe('ENG-F18-5 deployment-phase abilities (CORE-4.5 step 3)', () => {
  afterEach(() => registerDataBundle(null))
  it('ENG-F18-5 once both armies are set up, the attacker\'s deployment abilities run (and drain their move queue) before the first round', () => {
    hook('f18Deploy', {
      activate: {
        canUse: () => true,
        resolve: (ctx, use) => { writeMoveQueue(ctx.state, { abilityId: use.abilityId, player: use.player, maxDistance: 3, queue: ['A:guard'], opts: { normalMove: true } }) },
      },
    })
    const bundle = withAosBundle((b) => {
      b.abilities['fx.a.order-regiment-1'] = { ...b.abilities['fx.a.order-regiment-1'], timing: { kind: 'deployment', whose: 'your' }, limit: 'oncePerBattle', code: 'f18Deploy' }
    })
    registerDataBundle(bundle)
    const engine: EngineApi = createEngine({ phases: { ...aosPingPhases(), setup: setupModule, deployment: setupModule }, services: DEFAULT_MODULES.services, topics: DEFAULT_MODULES.topics })
    let r: StepResult = engine.createGame(makeAosSetup({
      terrainLayoutId: 'fx.terrain.open', side: 'aqshy', defenderTerritory: 'B',
      players: { A: makeAosPlayer('A', { regimentAbilityId: 'fx.a.order-regiment-1' }), B: makeAosPlayer('B', { regimentAbilityId: 'fx.a.chaos-regiment-1' }) },
    }), 'f18-deploy', bundle)
    let offered: PendingDecision | null = null
    let moved = false
    for (let i = 0; i < 200 && r.pending && r.state.round === 0; i++) {
      const p = r.pending
      if (p.kind === 'chooseOption' && p.context.topic === 'abilityUse' && !offered) {
        offered = p
        expect(r.state.phase).toBe('deployment')
        expect(Object.values(r.state.units).filter((u) => u.location === 'reserves')).toEqual([])
      }
      if (p.kind === 'chooseOption' && p.context.topic === 'abilityMode' && (p.context.data as { move?: boolean }).move) moved = true
      const legal = engine.legalActions(r.state, p) ?? []
      const pick = p.kind === 'chooseOption' && (p.context.topic === 'abilityUse' || (p.context.topic === 'abilityMode' && moved)) ? legal.find((a) => a.type === 'chooseOption' && a.optionId !== 'mv:0:0') ?? legal[0] : legal[0]
      const next = engine.step(r.state, pick)
      if (next.rejection) throw new Error(`${next.rejection.code}: ${next.rejection.reason}`)
      r = next
    }
    expect(offered?.player).toBe('A')
    expect(moved).toBe(true)
    expect(r.state.players.A.abilityUses.some((u) => u.abilityId === 'fx.a.order-regiment-1')).toBe(true)
  })
})

// ---------- 8 ----------
describe('ENG-F18-8 expiry owner', () => {
  it('ENG-F18-8 an untilNextTurn effect on an enemy unit with expiryOwner lasts until the user\'s next turn', () => {
    const s = aosState()
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    const mine = effectService.grant(ctx, 'B:brute', {}, { sourceAbilityId: 'x', sourceUnitId: 'A:boss', scope: { who: 'self' }, duration: 'untilNextTurn', expiryOwner: 'A' })
    const theirs = effectService.grant(ctx, 'B:guard', {}, { sourceAbilityId: 'y', sourceUnitId: 'A:boss', scope: { who: 'self' }, duration: 'untilNextTurn' })
    expect(mine.expires.player).toBe('A')
    expect(theirs.expires.player).toBe('B')
    effectService.expire(ctx, 'nextOwnTurn', 'B') // the enemy's turn starts: only the default-owner effect ends
    expect(s.units['B:brute'].effects.map((e) => e.id)).toEqual([mine.id])
    expect(s.units['B:guard'].effects).toEqual([])
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(s.units['B:brute'].effects).toEqual([])
  })
})

// ---------- 10 ----------
describe('ENG-F18-10 every-model edge arrival', () => {
  it('ENG-F18-10 with edgeAll every model must be within 1" of a battlefield edge; formations are lines along an edge', () => {
    const s = aosState()
    offBoard(s)
    trim(s, 'A:guard', 3) // the Ogors units are 1-3 models (a 7+ model unit cannot keep coherency in one line)
    put(s, 'B:boss', 0, 8)
    const shape = { anywhere: true, edgeWithin: 1, edgeAll: true, minEnemyDistance: 6 }
    const models = unitModels(s, 'A:guard')
    const opts = reinforcementOptions(s, 'A', models, 0.5, 8, shape)
    expect(opts.length).toBeGreaterThan(1)
    for (const o of opts) {
      const pl = reinforcementFormation(s, 'A', models, 0.5, o.centre, shape)
      expect(pl).not.toBeNull()
      for (const p of pl!) expect(nearBoardEdge({ pos: p.pos, facing: p.facing ?? 0, base: s.models[p.modelId].base }, s.board, 1)).toBe(true)
      expect(resolveSetUp(s, 'A:guard', pl!, { minEnemyDistance: 6, anywhere: true, edgeWithin: 1, edgeAll: true }).rejection).toBeNull()
    }
    // a 2-row block on the west edge: one model near the edge is enough without edgeAll, not with it
    const block = models.map((m, i) => ({ modelId: m.id, pos: { x: -14.3 + (i === 2 ? 1.4 : 0), y: 0, z: -4 + (i === 2 ? 0.7 : i * 1.4) }, facing: 0 }))
    expect(resolveSetUp(s, 'A:guard', block, { minEnemyDistance: 6, anywhere: true, edgeWithin: 1 }).rejection).toBeNull()
    expect(resolveSetUp(s, 'A:guard', block, { minEnemyDistance: 6, anywhere: true, edgeWithin: 1, edgeAll: true }).rejection?.code).toBe('E_OUT_OF_RANGE')
  })
})

// ---------- 11 ----------
describe('ENG-F18-11 terrain-only flight', () => {
  it('ENG-F18-11 passAcrossTerrain drops the climb cost over a tall wall', () => {
    const s = aosState({ terrainLayoutId: 'fx.terrain.standard' })
    put(s, 'A:boss', -6, -1)
    const m = unitModels(s, 'A:boss')[0]
    const path = [{ x: -6, y: 0, z: -1 }, { x: -6, y: 0, z: 1.5 }]
    expect(terrainService.extraMoveCost(s, m, path)).toBeGreaterThan(0)
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    effectService.grant(ctx, 'A:boss', { passAcrossTerrain: true }, { sourceAbilityId: 'x', sourceUnitId: 'A:boss', scope: { who: 'self' }, duration: 'battle' })
    expect(terrainService.extraMoveCost(s, m, path)).toBe(0)
  })
})

// ---------- 13 ----------
describe('ENG-F18-13 selective combat-range path', () => {
  it('ENG-F18-13 combatPathExcept lets a unit in combat leave through its own fight, never ending in or crossing another combat range', () => {
    const s = aosState()
    offBoard(s)
    trim(s, 'A:boss', 1); trim(s, 'B:brute', 1); trim(s, 'B:guard', 1)
    put(s, 'A:boss', 0, 0); put(s, 'B:brute', 0, 2.2)
    put(s, 'B:guard', 8, 0)
    expect(slideOptions(s, 'A:boss', 8, { noCombatPath: true })).toEqual([])
    const opts = slideOptions(s, 'A:boss', 8, { combatPathExcept: ['B:brute'] })
    expect(opts.length).toBeGreaterThan(1)
    for (const o of opts) {
      if (o.id === 'mv:0:0') continue // staying put stays in combat
      const [dx, dz] = o.id.split(':').slice(1).map(Number)
      const r = checkSlide(s, 'A:boss', dx, dz, 8, false, { combatPathExcept: ['B:brute'] })
      expect(r.ok).toBe(true)
      expect(r.endsInCombat ?? false).toBe(false)
    }
    // straight through the Guard's combat range: refused
    expect(checkSlide(s, 'A:boss', 12, 0, 12, false, { combatPathExcept: ['B:brute'] }).ok).toBe(false)
    // across its own combat (the Brute) and out the far side: allowed
    expect(checkSlide(s, 'A:boss', 0, -6, 8, false, { combatPathExcept: ['B:brute'] }).ok).toBe(true)
  })
})

// ---------- 14 ----------
describe('ENG-F18-14 returned models in combat (core 22.0)', () => {
  it('ENG-F18-14 returned models may be set up in combat range of the enemy units the unit is already in combat with, never of others', () => {
    const s = aosState()
    offBoard(s)
    trim(s, 'A:guard', 1)
    put(s, 'A:guard', 0, 0)
    trim(s, 'B:brute', 1); trim(s, 'B:guard', 1)
    put(s, 'B:brute', 0, 1.6) // in combat with the Guard, north
    put(s, 'B:guard', 0, -4.3) // 3.6" south, not in combat
    const { ctx } = createContext(s, new ScriptedRng([]), DEFAULT_MODULES)
    // before core 22.0 was applied every spot next to the Guard was within 3" of the Brute, so nothing came back
    expect(returnSlainModels(ctx, 'A:guard', 5, 'test')).toBeGreaterThanOrEqual(2)
    const brute = unitModels(s, 'B:brute')[0]
    const southGuard = unitModels(s, 'B:guard')[0]
    const back = unitModels(s, 'A:guard').slice(1)
    for (const m of back) expect(distance(m, southGuard)).toBeGreaterThan(ENGAGEMENT_H)
    expect(back.some((m) => horizontalGap(m, brute) <= ENGAGEMENT_H)).toBe(true)
  })
})
