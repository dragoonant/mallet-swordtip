// F16 engine-core: the generic engine pieces the four new armies (Daughters of Khaine, Idoneth Deepkin, Disciples of Tzeentch,
// Ossiarch Bonereapers) need, plus the Call for Reinforcements formation fix. Tested on the AoS fixture bundle with synthetic
// descriptors and test-only code hooks (no faction data), except the reinforcement checks, which use the shipped warscrolls of
// the units that could never be reinforced before. Test names carry "F16-" plus the faction spec id of the mechanism.
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, SeededRng, createContext, removeModel, unitModels,
  type Action, type EngineContext, type GameEvent, type GameState, type Model, type PendingDecision, type UnitId,
} from '../../src/engine'
import deckJson from '../../src/data/cards/fire-and-jade.json'
import type { AbilityDescriptor, CardDeckData, DataBundle, DatasheetData } from '../../src/data/types'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { attackService, lostModelThisTurn } from '../../src/engine/attack'
import { cardHandler, commandWindow, returnTacticToDeckBottom } from '../../src/engine/cards'
import { codeHooks, type AttackSequenceInfo, type EngineCodeHook } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { isCoherent } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { canCast, castingLevel, castingRoll, unbinders, wizardLevel } from '../../src/engine/magic'
import { nearBoardEdge, reinforcementFormation, reinforcementOptions } from '../../src/engine/factions/aos-moves'
import { resolveSetUp } from '../../src/engine/phases/movement'
import { assignSides, createGameState, datasheetOf } from '../../src/engine/state'
import { ENGINE_VERSION } from '../../src/engine/version'
import { makeSimSetup } from '../../tools/sim-core'
import { aosState, autoDeployAos, withAosBundle, aosBundle } from '../fixtures'
import { placeUnit } from '../fixtures/state'

// ---------- helpers ----------
const noop = (): void => {}
const added: string[] = []
function hook(name: string, h: Partial<EngineCodeHook>): void {
  codeHooks[name] = { name, kind: 'ability', hook: 'onAbilityDeclared', run: noop, ...h } as EngineCodeHook
  added.push(name)
}
afterEach(() => { for (const n of added.splice(0)) delete codeHooks[n] })

const ab = (id: string, extra: Partial<AbilityDescriptor>): AbilityDescriptor => ({ id, name: id.split('.').pop() as string, text: 'Test ability.', trigger: 'always', ...extra })

function game(patch?: (b: DataBundle) => void, phase: GameState['phase'] = 'movement'): GameState {
  const s = aosState({}, patch ? withAosBundle(patch) : aosBundle)
  s.round = 1
  s.phase = phase
  s.activePlayer = 'A'
  return s
}
const events = new WeakMap<EngineContext, GameEvent[]>()
function ctxFor(s: GameState, dice: number[] = []): EngineContext {
  const { ctx, events: ev } = createContext(s, new ScriptedRng(dice), DEFAULT_MODULES)
  events.set(ctx, ev)
  return ctx
}
const evOf = (ctx: EngineContext): GameEvent[] => events.get(ctx) ?? []
const of = <T extends GameEvent['type']>(list: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  list.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
function trim(s: GameState, unitId: UnitId, n: number): void {
  for (const id of [...s.units[unitId].models].slice(n)) removeModel(s, id)
}
const first = (s: GameState, unitId: UnitId): Model => unitModels(s, unitId)[0]
function melee(ctx: EngineContext, unitId: UnitId, target: UnitId): void {
  const m = first(ctx.state, unitId)
  attackService.begin(ctx, { kind: 'melee', attackerUnitId: unitId, overwatch: false, targets: [{ modelId: m.id, weaponId: m.weapons[0], targetUnitId: target, profileGroup: null, attacks: null }] })
  attackService.advance(ctx)
}

// ---------- Daughters of Khaine ----------
describe('F16 Daughters of Khaine engine pieces', () => {
  it('F16-DOK-AB-4 castingLevel: a non-Wizard with datasheet castingLevel casts once per phase and never unbinds', () => {
    const s = game((b) => { (b.datasheets['fx.brute'] as DatasheetData).castingLevel = 1 }, 'command')
    placeUnit(s, 'B:brute', { x: 0, z: 4, gap: 0.3 }); placeUnit(s, 'A:boss', [[0, -4]])
    expect(wizardLevel(s, 'B:brute')).toBe(0)
    expect(castingLevel(s, 'B:brute')).toBe(1)
    expect(castingLevel(s, 'A:boss')).toBe(0)
    expect(canCast(s, 'B:brute')).toBe(true)
    expect(canCast(s, 'A:boss')).toBe(false)
    // the brute is near enemy casters but is never an unbinder
    expect(unbinders(s, 'A:boss')).not.toContain('B:brute')
    const ctx = ctxFor(s, [4, 4])
    const r = castingRoll(ctx, { abilityId: 'x', unitId: 'B:brute', player: 'B' }, 'B:brute', 6)
    expect(r.cast).toBe(true)
    expect(canCast(s, 'B:brute')).toBe(false)
  })
})

// ---------- Disciples of Tzeentch ----------
describe('F16 Tzeentch engine pieces', () => {
  const ritual = (b: DataBundle): void => {
    b.abilities['fx.a.f16-ritual'] = ab('fx.a.f16-ritual', { code: 'f16Ritual' })
    b.datasheets['fx.boss'].abilities = ['fx.a.f16-ritual']
    ;(b.datasheets['fx.boss'] as DatasheetData).wizard = 1
  }

  it('F16-DOT-RA-2 castingRollBonus adds to the casting total (value and unbind), the miscast still reads the dice', () => {
    hook('f16Ritual', { castingRollBonus: (_s, entry, caster) => (entry.holderUnitId === caster ? 1 : 0) })
    const s = game(ritual, 'command')
    placeUnit(s, 'A:boss', [[0, -4]]); placeUnit(s, 'B:boss', [[0, 20]])
    expect(hookService.castingRollBonusFor(s, 'A:boss')).toBe(1)
    expect(hookService.castingRollBonusFor(s, 'B:boss')).toBe(1) // B's boss holds the same descriptor (shared datasheet)
    // 3 + 3 = 6, +1 = 7 against casting value 7; B's Wizard rolls 7 to unbind, which does not beat the modified 7
    const ctx = ctxFor(s, [3, 3, 3, 4])
    const r = castingRoll(ctx, { abilityId: 'x', unitId: 'A:boss', player: 'A' }, 'A:boss', 7)
    expect(r.total).toBe(7)
    expect(r.cast).toBe(true)
    expect(r.unbound).toBe(false)
    expect(of(evOf(ctx), 'AbilityTriggered').some((e) => /rolled 6\+1 = 7/.test(e.summary))).toBe(true)
    // a double 1 is a miscast whatever the bonus
    const s2 = game(ritual, 'command')
    placeUnit(s2, 'A:boss', [[0, -4]])
    const ctx2 = ctxFor(s2, [1, 1, 2])
    const r2 = castingRoll(ctx2, { abilityId: 'x', unitId: 'A:boss', player: 'A' }, 'A:boss', 2)
    expect(r2.miscast).toBe(true)
    expect(r2.cast).toBe(false)
  })

  it('F16-DOT-AB-1 afterAttackSequence info carries hitOnes (final hit dice) and combat', () => {
    const calls: AttackSequenceInfo[] = []
    hook('f16Aura', { afterAttackSequence: (_c, entry, info) => { if (entry.holderUnitId === 'A:guard') calls.push(info) } })
    const s = game((b) => {
      b.abilities['fx.a.f16-aura'] = ab('fx.a.f16-aura', { code: 'f16Aura' })
      b.datasheets['fx.guard'].abilities = ['fx.a.f16-aura']
    }, 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:brute', { x: 0, z: 1.6, gap: 0.3 })
    // Guard spear: 2 attacks, hit 4+: a 1 and a 1
    const ctx = ctxFor(s, [1, 1])
    melee(ctx, 'A:guard', 'B:brute')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ attackerUnitId: 'A:guard', hitOnes: 2, combat: true })
  })

  it('F16-DOT-BT-1 territory + edgeWithin set-up: wholly in friendly territory and a model within 1" of a battlefield edge', () => {
    const s = game()
    trim(s, 'A:guard', 3)
    placeUnit(s, 'B:boss', [[10, 8]])
    const ids = unitModels(s, 'A:guard').map((m) => m.id)
    const p = { minEnemyDistance: 6, anywhere: false, territory: true, edgeWithin: 1 }
    // fixture territory A: z in [-11, 0]; deployment zone z in [-11, -6]. Mid-territory row, far from any edge: rejected
    const mid = ids.map((id, i) => ({ modelId: id, pos: { x: -4 + i * 1.5, y: 0, z: -3 }, facing: 0 }))
    const r1 = resolveSetUp(s, 'A:guard', mid, p)
    expect(r1.rejection?.code).toBe('E_OUT_OF_RANGE')
    // the same row touching the long edge (z = -11): accepted
    const edge = ids.map((id, i) => ({ modelId: id, pos: { x: -4 + i * 1.5, y: 0, z: -10.2 }, facing: 0 }))
    expect(resolveSetUp(s, 'A:guard', edge, p).rejection).toBeNull()
    // outside the deployment zone but inside the territory, near the short edge (x = -15): accepted only with territory
    const side = ids.map((id, i) => ({ modelId: id, pos: { x: -14.2, y: 0, z: -2 - i * 1.5 }, facing: 0 }))
    expect(resolveSetUp(s, 'A:guard', side, p).rejection).toBeNull()
    expect(resolveSetUp(s, 'A:guard', side, { ...p, territory: false }).rejection).not.toBeNull()
    // the packed formation helper honours the same rule
    const models = unitModels(s, 'A:guard')
    const f = reinforcementFormation(s, 'A', models, undefined, { x: -14, z: -3 }, { edgeBand: false, edgeWithin: 1, minEnemyDistance: 6 })
    expect(f).not.toBeNull()
    expect(f!.some((pl, i) => nearBoardEdge({ pos: pl.pos, facing: pl.facing ?? 0, base: models[i].base }, s.board, 1))).toBe(true)
    expect(reinforcementFormation(s, 'A', models, undefined, { x: 0, z: -3 }, { edgeBand: false, edgeWithin: 1, minEnemyDistance: 6 })).toBeNull()
  })

  it('F16-DOT-BT-4 onTacticCommandUsed hears a used card once the command resolved; returnTacticToDeckBottom moves it', () => {
    const seen: { player: string; cardId: string }[] = []
    hook('f16Cheat', { onTacticCommandUsed: (_c, _e, info) => { seen.push(info) } })
    const s = aosState({}, withAosBundle((b) => {
      b.cardDecks = { 'rbf.fire-and-jade': deckJson as CardDeckData }
      b.abilities['fx.a.chaos-trait'] = { ...b.abilities['fx.a.chaos-trait'], code: 'f16Cheat' }
    }))
    autoDeployAos(s, 'A'); autoDeployAos(s, 'B')
    s.round = 1; s.phase = 'command'; s.activePlayer = 'A'; s.firstPlayer = 'A'
    s.cards!.tactics.B.hand = ['card.tactic.war-of-attrition']
    s.cards!.tactics.B.deck = ['card.tactic.raid']
    const { ctx } = createContext(s, new SeededRng('f16-cheat'), DEFAULT_MODULES)
    expect(commandWindow(ctx, 'hero', 'B')).toBe(true)
    const pending = s.pending as PendingDecision
    s.pending = null
    const rej = cardHandler.handle(ctx, { type: 'chooseOption', player: 'B', decisionId: pending.id, optionId: 'card.tactic.war-of-attrition|B:brute' } as Action, pending)
    expect(rej).toBeUndefined()
    expect(seen).toEqual([{ player: 'B', cardId: 'card.tactic.war-of-attrition' }])
    expect(s.cards!.tactics.B.discard).toEqual(['card.tactic.war-of-attrition'])
    expect(returnTacticToDeckBottom(s, 'B', 'card.tactic.war-of-attrition')).toBe(true)
    expect(s.cards!.tactics.B.discard).toEqual([])
    expect(s.cards!.tactics.B.deck).toEqual(['card.tactic.raid', 'card.tactic.war-of-attrition'])
    expect(returnTacticToDeckBottom(s, 'B', 'card.tactic.war-of-attrition')).toBe(false)
    // the window does not call it again
    expect(commandWindow(ctx, 'hero', 'B')).toBe(false)
    expect(seen).toHaveLength(1)
  })
})

// ---------- Idoneth Deepkin ----------
describe('F16 Idoneth engine pieces', () => {
  it('F16-IDK-AB-3 lostModelThisTurn: set when a model of the unit is slain this turn, stale next turn', () => {
    const s = game(undefined, 'shooting')
    placeUnit(s, 'A:guard', { x: 0, z: -4, gap: 0.3 }); placeUnit(s, 'B:brute', { x: 0, z: 4, gap: 0.3 })
    const ctx = ctxFor(s)
    expect(lostModelThisTurn(s, 'A:guard')).toBe(false)
    attackService.queueMortalWounds(ctx, 'A:guard', 1, 'test', false)
    expect(lostModelThisTurn(s, 'A:guard')).toBe(true)
    // damaged but nothing slain: no
    attackService.queueMortalWounds(ctx, 'B:brute', 1, 'test', false)
    expect(lostModelThisTurn(s, 'B:brute')).toBe(false)
    s.activePlayer = 'B'
    expect(lostModelThisTurn(s, 'A:guard')).toBe(false)
  })

  it('F16-IDK-ENH Mind Flare (Effect.onlySixes hit): only unmodified 6s hit, whatever the modifiers', () => {
    const s = game(undefined, 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:brute', { x: 0, z: 1.6, gap: 0.3 })
    // +1 to hit for the guard, then Mind Flare on it: a 5 would hit on 4+ (and 3+), but only the 6 does
    effectService.grant(ctxFor(s), 'A:guard', [{ modifyRoll: { roll: 'hit', value: 1 } }, { onlySixes: 'hit' }], { sourceAbilityId: 'test', sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    const ctx = ctxFor(s, [5, 6, 6, 6, 6])
    melee(ctx, 'A:guard', 'B:brute')
    const hits = of(evOf(ctx), 'HitRolled')
    expect(hits.map((h) => [h.die, h.hit])).toEqual([[5, false], [6, true]])
  })

  it('F16-IDK-ENH onlySixes on one unit does not touch another unit\'s hit rolls', () => {
    const s = game(undefined, 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:brute', { x: 0, z: 1.6, gap: 0.3 })
    effectService.grant(ctxFor(s), 'B:brute', { onlySixes: 'hit' }, { sourceAbilityId: 'test', sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    const ctx = ctxFor(s, [5, 4, 6, 6, 6, 6])
    melee(ctx, 'A:guard', 'B:brute')
    expect(of(evOf(ctx), 'HitRolled').map((h) => h.hit)).toEqual([true, true])
  })
})

// ---------- Ossiarch Bonereapers ----------
describe('F16 Ossiarch engine pieces', () => {
  const warded = (b: DataBundle): void => {
    b.datasheets['fx.brute'].stats = { ...b.datasheets['fx.brute'].stats, ward: 5 }
    b.abilities['fx.a.f16-destroyer'] = ab('fx.a.f16-destroyer', { code: 'f16Destroyer' })
    b.datasheets['fx.guard'].abilities = ['fx.a.f16-destroyer']
  }

  it('F16-OBR-AB-4 forbidsWard: no ward roll against the holder\'s combat attacks; other kinds and attackers keep it', () => {
    hook('f16Destroyer', { forbidsWard: (_s, entry, info) => entry.holderUnitId === info.attackerUnitId && info.kind === 'melee' })
    const s = game(warded, 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:brute', { x: 0, z: 1.6, gap: 0.3 })
    expect(hookService.wardForbidden(s, { wardedUnitId: 'B:brute', attackerUnitId: 'A:guard', kind: 'melee' })).toBe(true)
    expect(hookService.wardForbidden(s, { wardedUnitId: 'B:brute', attackerUnitId: 'A:guard', kind: 'mortal' })).toBe(false)
    // 2 hits (4, 4), 2 wounds (4, 4), saves fail (1, 1), D 1 each: no ward dice
    const ctx = ctxFor(s, [4, 4, 4, 4, 1, 1, 6, 6])
    melee(ctx, 'A:guard', 'B:brute')
    expect(of(evOf(ctx), 'FeelNoPainRolled')).toHaveLength(0)
    // mortal damage from the same unit still allows the ward
    const ctx2 = ctxFor(s, [6])
    attackService.queueMortalWounds(ctx2, 'B:brute', 1, 'test', false, { player: 'A', unitId: 'A:guard', modelId: first(s, 'A:guard').id })
    expect(of(evOf(ctx2), 'FeelNoPainRolled')).toHaveLength(1)
  })
})

// ---------- Call for Reinforcements: formations packed by base footprint ----------
describe('F16 reinforcement formations (oval and mixed bases)', () => {
  const cases: [string, string, string][] = [
    ['khorne', 'cities', 'flesh-hounds-1'],
    ['khorne', 'cities', 'claws-of-karanak'],
    ['khorne', 'cities', 'cavaliers'],
    ['slaves', 'nurgle', 'fellriders'],
  ]
  for (const [a, b, ref] of cases) {
    it(`F16-SPH-12 ${ref}: reinforcementOptions finds spots on an open board and each formation is coherent`, async () => {
      const bundle = await loadBundle()
      const s = createGameState(makeSimSetup(bundle, 0, DATA_VERSION, [a, b], 'aqshy', 'f16'), bundle, 'f16', ENGINE_VERSION)
      if (!s.players.A.side) assignSides(s, 'A')
      const unit = Object.values(s.units).find((u) => u.id.endsWith(`:${ref}`))
      expect(unit, ref).toBeDefined()
      const models = unitModels(s, unit!.id)
      const range = datasheetOf(s, unit!.id).coherencyRange
      const opts = reinforcementOptions(s, unit!.player, models, range, 5)
      expect(opts.length).toBeGreaterThan(0)
      for (const o of opts) {
        const f = reinforcementFormation(s, unit!.player, models, range, o.centre)
        expect(f).not.toBeNull()
        const fps = f!.map((pl, i) => ({ pos: pl.pos, facing: pl.facing ?? 0, base: models[i].base }))
        expect(isCoherent(fps, range)).toBe(true)
      }
    }, 60_000)
  }
})

