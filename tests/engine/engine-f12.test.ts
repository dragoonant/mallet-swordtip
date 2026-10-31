// F12 engine-core: the generic engine pieces the four new armies (Stormcast Eternals, Skaven, Seraphon, Soulblight Gravelords) need,
// tested on the AoS fixture bundle with synthetic descriptors and test-only code hooks (no faction data). Test names carry "F12-"
// plus the faction spec id whose mechanism they cover (docs/spec/factions/*.md §Test IDs); the army agents' own tests cover the
// abilities themselves.
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, SeededRng, abilityService, createContext, removeModel, unitModels,
  type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameState, type Model, type PendingDecision, type UnitId,
} from '../../src/engine'
import type { AbilityDescriptor, DataBundle, WeaponData } from '../../src/data/types'
import { attackService } from '../../src/engine/attack'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { readDeclaredAttack, writeDeclaredMove } from '../../src/engine/declared'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { weaponService } from '../../src/engine/weapons'
import { horizontalGap } from '../../src/engine/geometry'
import { spawnDestroyedUnitCopy } from '../../src/engine/state'
import { checkSlide, passedAcrossThisPhase, placeShapeOf, reinforcementFormation } from '../../src/engine/factions/aos-moves'
import { freeRetreatAvailable, freeRetreatHook, removeTokens } from '../../src/engine/factions/aos-common'
import { slavesFreeRetreatAvailable } from '../../src/engine/factions/slaves'
import { replacementOptions } from '../../src/engine/factions/spearhead-core'
import { canDeclareCharge, chargeDiceCount, chargeModule, chargeMoveRejection } from '../../src/engine/phases/charge'
import { fightModule, grantExtraFight } from '../../src/engine/phases/fight'
import { chargeProb } from '../../src/ai/utility'
import { aosState, withAosBundle, aosBundle } from '../fixtures'
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
const woundsLeft = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const setWeapon = (b: DataBundle, id: string, patch: Partial<WeaponData>): void => { b.weapons[id] = { ...b.weapons[id], ...patch } }

// one melee attack sequence of `unitId`'s first model with its first weapon at `target`, resolved on the spot
function melee(ctx: EngineContext, unitId: UnitId, target: UnitId): void {
  const m = first(ctx.state, unitId)
  attackService.begin(ctx, { kind: 'melee', attackerUnitId: unitId, overwatch: false, targets: [{ modelId: m.id, weaponId: m.weapons[0], targetUnitId: target, profileGroup: null, attacks: null }] })
  attackService.advance(ctx)
}

// drives the fight phase: phase decisions through fightModule, ability decisions (chooseOption) through the ability service
function driveFight(s: GameState, ctx: EngineContext, choose: (p: PendingDecision) => Action | undefined): string[] {
  const picks: string[] = []
  for (let i = 0; i < 400; i++) {
    if (fightModule.advance(ctx) === 'done') return picks
    const p = s.pending as PendingDecision
    s.pending = null
    const a = choose(p) ?? (p.kind === 'chooseOption' ? { type: 'pass', player: p.player, decisionId: p.id } as Action : (fightModule.legalActions?.(s, p) ?? [])[0])
    if (!a) throw new Error(`no action for ${p.kind}`)
    if (a.type === 'chooseFightUnit') picks.push(a.unitId)
    const rej = p.kind === 'chooseOption' ? abilityService.handler.handle(ctx, a, p) : fightModule.handle(ctx, a, p)
    if (rej) throw new Error(`rejected ${rej.code}: ${rej.reason}`)
  }
  throw new Error('fight phase did not finish')
}

// ---------- Stormcast Eternals ----------
describe('F12 Stormcast engine pieces', () => {
  it('F12-SCE-AB-1 grantExtraFight: the unit fights a second time, after every other unit in combat (Strike-last)', () => {
    const s = game((b) => { b.datasheets['fx.boss'].stats = { ...b.datasheets['fx.boss'].stats, W: 40 } }, 'fight')
    placeUnit(s, 'A:boss', [[-8, 0]]); placeUnit(s, 'B:boss', [[-8, 2]])
    trim(s, 'A:guard', 2); trim(s, 'B:guard', 2)
    placeUnit(s, 'A:guard', { x: 6, z: 0, gap: 0.2 }); placeUnit(s, 'B:guard', { x: 6, z: 1.6, gap: 0.2 })
    const { ctx } = createContext(s, new SeededRng('f12-extra'), DEFAULT_MODULES)
    fightModule.enter(ctx)
    grantExtraFight(s, 'A:boss', { strikeLastAfterFirst: true })
    const picks = driveFight(s, ctx, (p) => {
      if (p.kind === 'chooseFightUnit') return p.options.find((o) => o.id === 'A:boss')?.action ?? p.options[0].action
      return undefined
    })
    expect(picks.filter((u) => u === 'A:boss')).toHaveLength(2)
    expect(picks[0]).toBe('A:boss')
    // the second pick waits until every other unit still in combat has fought
    const second = picks.lastIndexOf('A:boss')
    const others = ['B:boss', 'A:guard', 'B:guard'].filter((u) => s.units[u].location === 'board')
    for (const u of others) expect(picks.indexOf(u)).toBeLessThan(second)
    expect(s.units['A:boss'].turn.fightsLast).toBe(true)
  })

  it('F12-SCE-AB-1 without a grant a unit that has fought is never offered again', () => {
    const s = game(undefined, 'fight')
    placeUnit(s, 'A:boss', [[-8, 0]]); placeUnit(s, 'B:boss', [[-8, 2]])
    const { ctx } = createContext(s, new SeededRng('f12-noextra'), DEFAULT_MODULES)
    fightModule.enter(ctx)
    const picks = driveFight(s, ctx, () => undefined)
    expect(picks.filter((u) => u === 'A:boss').length).toBeLessThanOrEqual(1)
  })

  it('F12-SCE-AB-5 Effect.extraChargeDice: three dice summed, all dice reported, reach counts 6 per die', () => {
    const s = game((b) => {
      b.abilities['fx.a.f12-heralds'] = ab('fx.a.f12-heralds', { effect: { extraChargeDice: 1 }, scope: { who: 'self' } })
      b.datasheets['fx.knight'].abilities = ['fx.a.f12-heralds']
    }, 'charge')
    placeUnit(s, 'A:knight', [[0, -9]])
    placeUnit(s, 'A:boss', [[10, -9]])
    placeUnit(s, 'B:boss', [[0, 7]]) // ~14" away: out of a 2D6 reach, inside 3D6
    placeUnit(s, 'B:brute', [[10, 7]])
    expect(hookService.chargeDiceBonus(s, 'A:knight')).toBe(1)
    expect(chargeDiceCount(s, 'A:knight')).toBe(3)
    expect(chargeDiceCount(s, 'A:boss')).toBe(2)
    expect(canDeclareCharge(s, 'A:knight')).toBe(true)
    expect(canDeclareCharge(s, 'A:boss')).toBe(false)
    const ctx = ctxFor(s, [2, 3, 4])
    chargeModule.enter(ctx)
    s.phaseState.marks.push('ch:startDone')
    expect(chargeModule.advance(ctx)).toBe('pending')
    const p = s.pending as PendingDecision
    s.pending = null
    chargeModule.handle(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: p.id, unitId: 'A:knight' }, p)
    chargeModule.advance(ctx)
    const rolled = of(evOf(ctx), 'ChargeRolled')[0]
    expect(rolled.total).toBe(9)
    expect(rolled.dice).toEqual([2, 3])
    expect(rolled.allDice).toEqual([2, 3, 4])
    expect(s.units['A:knight'].turn.chargeRollUnmodified).toBe(9)
    // the AI's odds use the dice count
    expect(chargeProb(9, 3)).toBeGreaterThan(chargeProb(9, 2))
    expect(chargeProb(3, 3)).toBe(1)
  })

  it('F12-SCE-AB-4 afterWardRoll sees each ward roll of the holder; removeTokens emits TokenRemoved', () => {
    const seen: { unitId: string; dice: number[]; needed: number }[] = []
    hook('f12Crow', { afterWardRoll: (ctx, entry, info) => { seen.push(info); if (info.dice.includes(1)) removeTokens(ctx, entry.holderUnitId, 'crow') } })
    const s = game((b) => {
      b.abilities['fx.a.f12-crow'] = ab('fx.a.f12-crow', { code: 'f12Crow', effect: { feelNoPain: 5 }, scope: { who: 'self' } })
      b.datasheets['fx.boss'].abilities = ['fx.a.f12-crow']
    })
    placeUnit(s, 'A:boss', [[0, -8]]); placeUnit(s, 'B:boss', [[0, 8]])
    s.units['B:boss'].tokens = { crow: 1 }
    const ctx = ctxFor(s, [1, 6])
    const before = woundsLeft(s, 'B:boss')
    attackService.queueMortalWounds(ctx, 'B:boss', 2, 'test', false)
    expect(woundsLeft(s, 'B:boss')).toBe(before - 1)
    expect(seen.filter((x) => x.unitId === 'B:boss')).toEqual([{ unitId: 'B:boss', dice: [1, 6], needed: 5 }])
    expect(s.units['B:boss'].tokens.crow).toBe(0)
    expect(of(evOf(ctx), 'TokenRemoved')[0]).toMatchObject({ unitId: 'B:boss', token: 'crow', count: 1, remaining: 0 })
    expect(removeTokens(ctx, 'B:boss', 'crow')).toBe(0)
  })

  it('F12-SCE-RA-1 freeRetreatHook: a second army registers the Fearless Invaders shape under its own name; the AI helper honours its limit', () => {
    codeHooks.f12Strike = freeRetreatHook('f12Strike', 'Test strike: free retreat')
    added.push('f12Strike')
    const s = game((b) => {
      b.abilities['fx.a.order-regiment-1'] = ab('fx.a.order-regiment-1', { trigger: 'activated', timing: { kind: 'reaction', trigger: 'youDeclared', abilityId: 'core.move' }, limit: 'oncePerBattle', code: 'f12Strike' })
    })
    s.players.A.regimentAbilityId = 'fx.a.order-regiment-1'
    trim(s, 'A:guard', 1); trim(s, 'B:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:guard', [[0, 1.8]])
    expect(freeRetreatAvailable(s, 'A')).toBe(true)
    expect(slavesFreeRetreatAvailable(s, 'A')).toBe(true)
    writeDeclaredMove(s, { unitId: 'A:guard', moveType: 'fallBack' })
    expect(abilityService.usable(s, 'A', 'moveDeclared').map((u) => u.abilityId)).toEqual(['fx.a.order-regiment-1'])
    const ctx = ctxFor(s)
    codeHooks.f12Strike.activate?.resolve(ctx, { abilityId: 'fx.a.order-regiment-1', unitId: null, player: 'A', targetUnitIds: ['A:guard'], modeId: null, roll: null } as never)
    expect(hookService.unitHasEffectFlag(s, 'A:guard', 'noRetreatDamage')).toBe(true)
    expect(hookService.unitHasEffectFlag(s, 'A:guard', 'chargeAfterFallBack')).toBe(true)
    // once per battle: a use in an earlier round still counts
    s.players.A.abilityUses.push({ abilityId: 'fx.a.order-regiment-1', unitId: null, round: 1, turn: 'B', phase: 'movement' } as never)
    s.round = 3
    expect(freeRetreatAvailable(s, 'A')).toBe(false)
  })
})

// ---------- Skaven ----------
describe('F12 Skaven engine pieces', () => {
  it('F12-SKV-BT-1 SlideOpts.normalMove: the path may not pass through an enemy combat range and may not end in combat', () => {
    const s = game()
    trim(s, 'A:guard', 1); trim(s, 'B:guard', 1)
    placeUnit(s, 'A:guard', [[-6, -8]])
    placeUnit(s, 'B:guard', [[0, -4.5]]) // the straight path passes within 3" of it
    expect(checkSlide(s, 'A:guard', 12, 0, 12, false, { mayNotEndInCombat: true }).ok).toBe(true)
    expect(checkSlide(s, 'A:guard', 12, 0, 12, false, { normalMove: true }).ok).toBe(false)
    expect(checkSlide(s, 'A:guard', 0, -2, 12, false, { normalMove: true }).ok).toBe(true)
    // ending in combat is out too
    expect(checkSlide(s, 'A:guard', 6, 1.5, 12, false, { normalMove: true }).ok).toBe(false)
  })

  it('F12-SKV-RA-1 opponentDeclaredAttack: the other player is offered the reaction with the declared targets readable', () => {
    const resolved: string[] = []
    hook('f12Armour', {
      activate: {
        canUse: (state: GameState) => (readDeclaredAttack(state)?.targetUnitIds ?? []).includes('B:brute'),
        resolve: (_c: EngineContext, use: { abilityId: string }) => { resolved.push(use.abilityId) },
      } as never,
    })
    const s = game((b) => { b.abilities['fx.a.chaos-regiment-1'] = ab('fx.a.chaos-regiment-1', { trigger: 'activated', timing: { kind: 'reaction', trigger: 'opponentDeclaredAttack' }, limit: 'oncePerBattle', code: 'f12Armour' }) }, 'shooting')
    s.players.B.regimentAbilityId = 'fx.a.chaos-regiment-1'
    placeUnit(s, 'A:cannon', [[0, -8]]); placeUnit(s, 'B:brute', { x: 0, z: 6, gap: 0.3 })
    expect(abilityService.usable(s, 'B', 'attackDeclared')).toHaveLength(0)
    expect(abilityService.usable(s, 'B', 'shooting')).toHaveLength(0)
    const ctx = ctxFor(s)
    expect(abilityService.runReactionWindow?.(ctx, 'A', { kind: 'youDeclaredAttack', unitId: 'A:cannon', phase: 'shooting', targetUnitIds: ['B:brute'] }, 'sh:x')).toBe(false)
    expect(abilityService.runReactionWindow?.(ctx, 'B', { kind: 'opponentDeclaredAttack', unitId: 'A:cannon', phase: 'shooting', targetUnitIds: ['B:brute'] }, 'sht:x')).toBe(true)
    expect(readDeclaredAttack(s)).toEqual({ unitId: 'A:cannon', phase: 'shooting', seq: 1, targetUnitIds: ['B:brute'] })
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('B')
    s.pending = null
    abilityService.handler.handle(ctx, { type: 'chooseOption', player: 'B', decisionId: p.id, optionId: p.options[0].id }, p)
    expect(abilityService.runReactionWindow?.(ctx, 'B', { kind: 'opponentDeclaredAttack', unitId: 'A:cannon', phase: 'shooting', targetUnitIds: ['B:brute'] }, 'sht:x')).toBe(false)
    expect(resolved).toEqual(['fx.a.chaos-regiment-1'])
  })

  it('F12-SKV-RA-1 the fight phase opens the opponent window after targets are declared, before the dice', () => {
    const asked: { player: string; targets: string[] }[] = []
    hook('f12Armour', {
      activate: {
        canUse: (state: GameState) => { asked.push({ player: 'B', targets: readDeclaredAttack(state)?.targetUnitIds ?? [] }); return true },
        resolve: noop,
      } as never,
    })
    const s = game((b) => { b.abilities['fx.a.chaos-regiment-1'] = ab('fx.a.chaos-regiment-1', { trigger: 'activated', timing: { kind: 'reaction', trigger: 'opponentDeclaredAttack' }, code: 'f12Armour' }) }, 'fight')
    s.players.B.regimentAbilityId = 'fx.a.chaos-regiment-1'
    placeUnit(s, 'A:boss', [[0, 0]]); placeUnit(s, 'B:boss', [[0, 2]])
    const { ctx, events: ev } = createContext(s, new SeededRng('f12-react'), DEFAULT_MODULES)
    fightModule.enter(ctx)
    let windowAt = -1
    driveFight(s, ctx, (p) => {
      if (p.kind === 'chooseOption' && p.context.topic === 'abilityUse' && windowAt < 0) windowAt = ev.length
      return undefined
    })
    expect(windowAt).toBeGreaterThan(0)
    expect(asked.some((a) => a.targets.includes('A:boss') || a.targets.includes('B:boss'))).toBe(true)
    // the window came after the targets were declared and before the first hit roll
    const declaredAt = ev.findIndex((e) => e.type === 'TargetsDeclared')
    const firstHit = ev.findIndex((e) => e.type === 'HitRolled')
    expect(declaredAt).toBeLessThan(windowAt)
    expect(windowAt).toBeLessThanOrEqual(firstHit)
  })

  it('F12-SKV-AB-3 CRIT_2_HITS with a value: each critical hit rolls its hit count', () => {
    const s = game((b) => setWeapon(b, 'fx.w.guard-spear', { abilities: [{ ability: 'CRIT_2_HITS', value: 'D6' }] }), 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:brute', { x: 0, z: 1.6, gap: 0.3 })
    const ctx = ctxFor(s, [6, 1, /* crit hits */ 4, /* wounds */ 1, 1, 1, 1])
    melee(ctx, 'A:guard', 'B:brute')
    const hits = of(evOf(ctx), 'HitRolled')
    expect(hits[0]).toMatchObject({ critical: true, extraHits: 3 })
    expect(hits[1].extraHits).toBe(0)
    expect(of(evOf(ctx), 'WoundRolled')).toHaveLength(4)
  })

  it('F12-SKV-AB-3 CRIT_2_HITS without a value still scores two hits', () => {
    const s = game((b) => setWeapon(b, 'fx.w.guard-spear', { abilities: [{ ability: 'CRIT_2_HITS' }] }), 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:brute', { x: 0, z: 1.6, gap: 0.3 })
    const ctx = ctxFor(s, [6, 1, 1, 1])
    melee(ctx, 'A:guard', 'B:brute')
    expect(of(evOf(ctx), 'HitRolled')[0].extraHits).toBe(1)
    expect(of(evOf(ctx), 'WoundRolled')).toHaveLength(2)
  })

  it('F12-SKV-AB-5 HIT_MORTAL: every hit is mortal damage, no wound or save roll', () => {
    const s = game((b) => setWeapon(b, 'fx.w.cannon-shot', { A: 3, abilities: [{ ability: 'HIT_MORTAL', value: 1 }] }), 'shooting')
    placeUnit(s, 'A:cannon', [[0, -8]]); placeUnit(s, 'B:boss', [[0, 6]])
    const ctx = ctxFor(s, [4, 6, 2])
    const before = woundsLeft(s, 'B:boss')
    const m = first(s, 'A:cannon')
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:cannon', overwatch: false, targets: [{ modelId: m.id, weaponId: m.weapons[0], targetUnitId: 'B:boss', profileGroup: null, attacks: null }] })
    attackService.advance(ctx)
    expect(woundsLeft(s, 'B:boss')).toBe(before - 2)
    expect(of(evOf(ctx), 'WoundRolled')).toHaveLength(0)
    expect(of(evOf(ctx), 'SaveRolled')).toHaveLength(0)
    expect(of(evOf(ctx), 'DamageApplied').every((d) => d.mortal)).toBe(true)
  })
})

// ---------- Seraphon ----------
describe('F12 Seraphon engine pieces', () => {
  it('F12-SER-RA-2 grantWeaponAbility reaches a Companion weapon only with affectsCompanion', () => {
    const s = game()
    placeUnit(s, 'A:knight', [[0, -5]])
    const knight = first(s, 'A:knight')
    const hooves = knight.weapons.find((w) => w.endsWith('knight-hooves')) as string
    const lance = knight.weapons.find((w) => w.endsWith('knight-lance')) as string
    const ctx = ctxFor(s)
    const has = (w: string): boolean => weaponService.effectiveWeapon(s, knight.id, w).abilities.some((a) => a.ability === 'CRIT_AUTO_WOUND')
    effectService.grant(ctx, 'A:knight', { grantWeaponAbility: { ability: 'CRIT_AUTO_WOUND' } }, { sourceAbilityId: 'fx.a.order-trait', sourceUnitId: 'A:knight', scope: { who: 'self' }, duration: 'battle' })
    expect(has(lance)).toBe(true)
    expect(has(hooves)).toBe(false)
    effectService.grant(ctx, 'A:knight', { grantWeaponAbility: { ability: 'CRIT_AUTO_WOUND' }, affectsCompanion: true }, { sourceAbilityId: 'fx.a.order-rule', sourceUnitId: 'A:knight', scope: { who: 'self' }, duration: 'battle' })
    expect(has(hooves)).toBe(true)
  })

  it('F12-SER-AB-1 ignoresFirstDamagePerPhase: one point is ignored the first time the unit takes damage this phase', () => {
    hook('f12Scaled', { ignoresFirstDamagePerPhase: (_s, entry, unitId) => unitId === entry.holderUnitId })
    const s = game((b) => {
      b.abilities['fx.a.f12-scaled'] = ab('fx.a.f12-scaled', { code: 'f12Scaled' })
      b.datasheets['fx.boss'].abilities = ['fx.a.f12-scaled']
    })
    placeUnit(s, 'A:boss', [[0, -8]]); placeUnit(s, 'B:boss', [[0, 8]])
    const ctx = ctxFor(s)
    const before = woundsLeft(s, 'B:boss')
    attackService.queueMortalWounds(ctx, 'B:boss', 3, 'test', false)
    expect(woundsLeft(s, 'B:boss')).toBe(before - 2)
    expect(of(evOf(ctx), 'DamageIgnored')).toEqual([expect.objectContaining({ unitId: 'B:boss', points: 1, source: 'fx.a.f12-scaled' })])
    attackService.queueMortalWounds(ctx, 'B:boss', 2, 'test', false)
    expect(woundsLeft(s, 'B:boss')).toBe(before - 4)
    expect(of(evOf(ctx), 'DamageIgnored')).toHaveLength(1)
  })

  it('F12-SER-C3 a champion model takes damage last', () => {
    const s = game((b) => {
      const c = b.datasheets['fx.guard'].composition[0]
      b.datasheets['fx.guard'].composition = [{ ...c, min: 9, max: 9, default: 9 }, { ...c, modelId: 'champ', name: 'Champ', champion: true, min: 1, max: 1, default: 1 }]
    })
    const champ = unitModels(s, 'A:guard').find((m) => m.datasheetModelId === 'champ') as Model
    expect(champ).toBeDefined()
    // four models left: three plain ones and the champion, which the old order (last model first) would have slain first
    for (const m of unitModels(s, 'A:guard').filter((x) => x.id !== champ.id).slice(0, 6)) removeModel(s, m.id)
    const ids = unitModels(s, 'A:guard').map((m) => m.id)
    expect(ids[ids.length - 1]).toBe(champ.id)
    const rest = ids.filter((id) => id !== champ.id)
    placeUnit(s, 'A:guard', [[-8, -8]])
    const xs: Record<string, number> = { [rest[0]]: -8, [champ.id]: -6.6, [rest[1]]: -5.2, [rest[2]]: -3.8 }
    for (const m of unitModels(s, 'A:guard')) m.pos = { x: xs[m.id], y: 0, z: -8 }
    const ctx = ctxFor(s)
    attackService.queueMortalWounds(ctx, 'A:guard', 3, 'test', false)
    expect(unitModels(s, 'A:guard').map((m) => m.id)).toEqual([champ.id])
  })

  it('F12-SER-AB-6 afterAttackSequence gets the unmodified save 1s per target unit', () => {
    const calls: { attackerUnitId: string; saveOnes: Record<string, number> }[] = []
    hook('f12Acolytes', { afterAttackSequence: (_c, entry, info) => { if (entry.holderUnitId === 'B:brute') calls.push(info) } })
    const s = game((b) => {
      b.abilities['fx.a.f12-acolytes'] = ab('fx.a.f12-acolytes', { code: 'f12Acolytes' })
      b.datasheets['fx.brute'].abilities = ['fx.a.f12-acolytes']
    }, 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:brute', { x: 0, z: 1.6, gap: 0.3 })
    const ctx = ctxFor(s, [4, 4, 4, 4, 1, 1])
    melee(ctx, 'A:guard', 'B:brute')
    expect(calls).toEqual([{ attackerUnitId: 'A:guard', saveOnes: { 'B:brute': 2 } }])
  })

  it('F12-SER-ENH whileDestroyed + mandatory: a destroyed holder\'s ability is offered with no pass; copies keep only the listed models', () => {
    hook('f12Blessed', { whileDestroyed: true, activate: { canUse: (state: GameState, unitId: UnitId | null) => state.units[unitId ?? '']?.location === 'destroyed', resolve: noop } as never })
    const s = game((b) => {
      b.abilities['fx.a.f12-blessed'] = ab('fx.a.f12-blessed', { trigger: 'activated', timing: { kind: 'endOfTurn', whose: 'your' }, limit: 'oncePerBattle', code: 'f12Blessed', params: { mandatory: true } })
      b.datasheets['fx.boss'].abilities = ['fx.a.f12-blessed']
      const c = b.datasheets['fx.guard'].composition[0]
      b.datasheets['fx.guard'].composition = [{ ...c, min: 9, max: 9, default: 9 }, { ...c, modelId: 'champ', name: 'Champ', champion: true, min: 1, max: 1, default: 1 }]
    })
    placeUnit(s, 'A:boss', [[0, -8]]); placeUnit(s, 'B:boss', [[0, 8]]); placeUnit(s, 'A:guard', { x: -8, z: -8, gap: 0.1 })
    expect(abilityService.usable(s, 'A', 'endOfTurn')).toHaveLength(0) // alive: not offered
    removeModel(s, first(s, 'A:boss').id)
    expect(s.units['A:boss'].location).toBe('destroyed')
    expect(abilityService.usable(s, 'A', 'endOfTurn').map((u) => [u.abilityId, u.unitId])).toEqual([['fx.a.f12-blessed', 'A:boss']])
    const ctx = ctxFor(s)
    expect(abilityService.runWindow(ctx, 'endOfTurn', 'A')).toBe(true)
    expect((s.pending as ChooseOptionDecision).canPass).toBe(false)
    s.pending = null
    // spawnDestroyedUnitCopy(onlyModels)
    for (const m of unitModels(s, 'A:guard')) removeModel(s, m.id)
    const copy = spawnDestroyedUnitCopy(ctx, 'A:guard', { onlyModels: ['champ'] })
    expect(unitModels(s, copy.id).map((m) => m.datasheetModelId)).toEqual(['champ'])
  })

  it('F12-SER-ENH PlaceRequest.anywhere: the replacement may go outside its territory, more than N" from every enemy', () => {
    const s = game()
    placeUnit(s, 'B:boss', [[12, 8]])
    trim(s, 'A:guard', 2)
    placeUnit(s, 'A:guard', { x: -10, z: -9, gap: 0.3 })
    const models = unitModels(s, 'A:guard')
    // z = 5 is in B's territory
    expect(reinforcementFormation(s, 'A', models, undefined, { x: -8, z: 5 })).toBeNull()
    expect(reinforcementFormation(s, 'A', models, undefined, { x: -8, z: 5 }, { anywhere: true, minEnemyDistance: 6 })).not.toBeNull()
    expect(reinforcementFormation(s, 'A', models, undefined, { x: 9, z: 6 }, { anywhere: true, minEnemyDistance: 6 })).toBeNull()
    expect(placeShapeOf({ abilityId: 'x', player: 'A', unitId: 'A:guard', replacementOf: 'A:guard', anywhere: { minEnemyDistance: 6 } })).toEqual({ anywhere: true, edgeBand: false, minEnemyDistance: 6 })
    const opts = replacementOptions(s, 'A:guard', { anywhere: true, minEnemyDistance: 6 })
    expect(opts.length).toBeGreaterThan(0)
  })
})

// ---------- Soulblight Gravelords ----------
describe('F12 Soulblight engine pieces', () => {
  it('F12-SBG-BT-2 onOwnFightResolved: after its Fight the unit\'s own hook gets the damage its melee attacks allocated', () => {
    const calls: { unitId: string; damageAllocated: number }[] = []
    hook('f12Hunger', { onOwnFightResolved: (_c, info) => { calls.push({ unitId: info.unitId, damageAllocated: info.damageAllocated }) } })
    const s = game((b) => {
      b.abilities['fx.a.f12-hunger'] = ab('fx.a.f12-hunger', { code: 'f12Hunger' })
      b.datasheets['fx.boss'].abilities = ['fx.a.f12-hunger']
      b.datasheets['fx.brute'].stats = { ...b.datasheets['fx.brute'].stats, W: 20 }
    }, 'fight')
    placeUnit(s, 'A:boss', [[0, 0]]); placeUnit(s, 'B:brute', { x: -1, z: 1.9, gap: 0.2 })
    const { ctx, events: ev } = createContext(s, new SeededRng('f12-hunger'), DEFAULT_MODULES)
    fightModule.enter(ctx)
    driveFight(s, ctx, () => undefined)
    const dealt = of(ev, 'DamageApplied').filter((d) => 'attackerUnitId' in d.source && d.source.attackerUnitId === 'A:boss').reduce((a, d) => a + d.amount, 0)
    const mine = calls.filter((c) => c.unitId === 'A:boss')
    expect(mine).toHaveLength(1)
    expect(mine[0].damageAllocated).toBe(dealt)
    expect(s.phaseState.marks.some((m) => m.startsWith('fightDmg:A:boss'))).toBe(false)
  })

  it('F12-SBG-AB-2 passAcrossKeyword: a charge path may cross enemy models of that keyword; the crossed unit is recorded', () => {
    const s = game((b) => {
      b.abilities['fx.a.f12-riders'] = ab('fx.a.f12-riders', { effect: { passAcrossKeyword: 'INFANTRY' }, scope: { who: 'self' } })
    }, 'charge')
    trim(s, 'B:guard', 1)
    placeUnit(s, 'A:knight', [[0, -8.5]])
    placeUnit(s, 'B:guard', [[0, -5]])
    placeUnit(s, 'B:boss', [[0, 1]])
    const knight = first(s, 'A:knight')
    const boss = first(s, 'B:boss')
    // the end spot 0.4" short of the Boss, straight up the table through the Guard
    let lo = -8.5, hi = boss.pos.z
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (horizontalGap({ pos: { x: 0, y: 0, z: mid }, facing: knight.facing, base: knight.base }, boss) > 0.4) lo = mid; else hi = mid }
    const to = { x: 0, y: 0, z: lo }
    const placements = [{ modelId: knight.id, pos: to, facing: knight.facing, path: [knight.pos, to] }]
    const roll = Math.ceil(to.z + 8.5) + 1
    expect(chargeMoveRejection(s, 'A:knight', roll, placements)?.code).toBe('E_OVERLAP')
    // as a granted effect here; a passive descriptor (scope self) answers the same way (hookService.passAcrossKeywords)
    const ctx = ctxFor(s)
    effectService.grant(ctx, 'A:knight', { passAcrossKeyword: 'INFANTRY' }, { sourceAbilityId: 'fx.a.f12-riders', sourceUnitId: 'A:knight', scope: { who: 'self' }, duration: 'battle' })
    expect(hookService.passAcrossKeywords(s, 'A:knight')).toEqual(['INFANTRY'])
    expect(hookService.passAcrossKeywords(s, 'B:boss')).toEqual([])
    expect(chargeMoveRejection(s, 'A:knight', roll, placements)).toBeNull()
    // applying the charge records the crossed unit (SBG C3)
    chargeModule.enter(ctx)
    s.phaseState.charge = { unitId: 'A:knight', targetUnitIds: [], roll: [4, 4], rerolled: false, distance: roll, heroic: false }
    const pending = { id: 'd1', kind: 'chargeMove', player: 'A', context: { unitId: 'A:knight', targetUnitIds: [], roll } } as unknown as PendingDecision
    expect(chargeModule.handle(ctx, { type: 'chargeMove', player: 'A', decisionId: 'd1', unitId: 'A:knight', placements }, pending)).toBeUndefined()
    expect(passedAcrossThisPhase(s, 'A:knight')).toContain('B:guard')
  })

  it('F12-SBG-RA-1 PlaceRequest edgeBand false / minEnemyDistance reshape a territory set-up', () => {
    const s = game()
    trim(s, 'A:guard', 2)
    placeUnit(s, 'A:guard', { x: -10, z: -9, gap: 0.3 })
    placeUnit(s, 'B:boss', [[0, 2]])
    const models = unitModels(s, 'A:guard')
    const centre = { x: 8, z: -3 } // in A's territory, outside the 6" edge band
    expect(reinforcementFormation(s, 'A', models, undefined, centre)).toBeNull()
    expect(reinforcementFormation(s, 'A', models, undefined, centre, { edgeBand: false })).not.toBeNull()
    expect(reinforcementFormation(s, 'A', models, undefined, { x: 0, z: -3 }, { edgeBand: false })).not.toBeNull()
    expect(reinforcementFormation(s, 'A', models, undefined, { x: 0, z: -3 }, { edgeBand: false, minEnemyDistance: 9 })).toBeNull()
    const far = reinforcementFormation(s, 'A', models, undefined, { x: 0, z: -3 }, { edgeBand: false, minEnemyDistance: 6 })
    for (const p of far ?? []) expect(horizontalGap({ pos: p.pos, facing: 0, base: s.models[p.modelId].base }, first(s, 'B:boss'))).toBeGreaterThan(6)
    expect(placeShapeOf({ abilityId: 'x', player: 'A', unitId: 'A:guard', replacementOf: 'A:guard', edgeBand: false, minEnemyDistance: 6 })).toEqual({ edgeBand: false, minEnemyDistance: 6 })
  })

  it('F12-SBG-ENH Effect.ignoreNegativeModifiers (save): a -1 to the save is ignored (Rend too, F14 ruling: see engine-f14)', () => {
    const run = (aura: boolean): number[] => {
      const s = game((b) => {
        b.abilities['fx.a.f12-aura'] = ab('fx.a.f12-aura', { effect: aura ? { ignoreNegativeModifiers: 'save' } : {}, scope: { who: 'self' } })
        b.datasheets['fx.boss'].abilities = ['fx.a.f12-aura']
      }, 'fight')
      trim(s, 'A:guard', 1)
      placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:boss', [[0, 1.8]])
      const ctx = ctxFor(s, [6, 6, 6, 6, 3, 3, 6, 6])
      effectService.grant(ctx, 'B:boss', { modifyRoll: { roll: 'save', value: -1 } }, { sourceAbilityId: 'fx.a.chaos-rule', sourceUnitId: 'B:boss', scope: { who: 'self' }, duration: 'battle' })
      melee(ctx, 'A:guard', 'B:boss')
      return of(evOf(ctx), 'SaveRolled').map((e) => e.final)
    }
    expect(run(false)).toEqual([2, 2])
    expect(run(true)).toEqual([3, 3])
  })
})
