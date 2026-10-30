// F8 engine-core: the generic engine pieces the four new armies (Kruleboyz, Gloomspite Gitz, Lumineth, Kharadron) need,
// tested on the AoS fixture bundle with synthetic descriptors and test-only code hooks (no faction data). Test names carry
// "F8-" plus the faction spec id whose mechanism they cover (docs/spec/factions/*.md §Test IDs); the army agents' own tests
// cover the abilities themselves.
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, removeModel, unitModels,
  type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameState, type Model, type PendingDecision, type UnitId,
} from '../../src/engine'
import type { AbilityDescriptor, DataBundle } from '../../src/data/types'
import { attackService, damagedByShootingThisPhase, deferMortalAfterFight } from '../../src/engine/attack'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { readDeclaredAttack, readDeclaredMove } from '../../src/engine/declared'
import { effectService } from '../../src/engine/effects'
import { checkPlacements, emptyMoveConstraints, horizontalGap, whollyWithinOf, whollyWithinPolygon } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { hiddenBeyondFor, losService } from '../../src/engine/los'
import { canCast, castingRoll } from '../../src/engine/magic'
import { liftForRedeploy, redeployOptions, requestRedeploy, readRedeploy } from '../../src/engine/redeploy'
import { weaponService } from '../../src/engine/weapons'
import { applyRetreat, applySlide, checkSlide, passedAcrossThisPhase, retreatOptions, slideOptions, unitsPassedAcross } from '../../src/engine/factions/aos-moves'
import { legalChargeMoves, neededChargeDistance, chargeMoveRejection } from '../../src/engine/phases/charge'
import { movementModule, unitIgnoresRetreatDamage } from '../../src/engine/phases/movement'
import { shootingModule, targetLegality } from '../../src/engine/phases/shooting'
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

function game(patch?: (b: DataBundle) => void): GameState {
  const s = aosState({}, patch ? withAosBundle(patch) : aosBundle)
  s.round = 1
  s.phase = 'movement'
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

function trim(s: GameState, unitId: UnitId, n: number): void {
  for (const id of [...s.units[unitId].models].slice(n)) removeModel(s, id)
}
const first = (s: GameState, unitId: UnitId): Model => unitModels(s, unitId)[0]
const weaponOf = (s: GameState, m: Model, suffix: string): string => m.weapons.find((w) => w.endsWith(suffix)) as string
const woundsLeft = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((a, m) => a + m.woundsRemaining, 0)

// ---------- Kruleboyz ----------
describe('F8 Kruleboyz engine pieces', () => {
  it('F8-KRU-RA-2 Effect.hiddenBeyond: enemy models further than N cannot see the unit, nearer ones and friends can', () => {
    const s = game()
    trim(s, 'A:guard', 1); trim(s, 'B:guard', 1); trim(s, 'B:brute', 1)
    placeUnit(s, 'A:guard', [[0, -9]])
    placeUnit(s, 'B:brute', [[0, 8]])
    placeUnit(s, 'B:guard', [[4, 9]])
    const ctx = ctxFor(s)
    effectService.grant(ctx, 'B:brute', { hiddenBeyond: 12 }, { sourceAbilityId: 'fx.a.chaos-trait', sourceUnitId: 'B:brute', scope: { who: 'self' }, duration: 'battle' })
    expect(hiddenBeyondFor(s, 'B:brute')).toBe(12)
    const watcher = first(s, 'A:guard')
    expect(losService.unitVisible(s, watcher.id, 'B:brute')).toBe(false)
    expect(losService.visible(s, watcher.id, first(s, 'B:brute').id)).toBe(false)
    expect(losService.unitVisible(s, first(s, 'B:guard').id, 'B:brute')).toBe(true) // friendly
    placeUnit(s, 'B:brute', [[0, 1]])
    expect(losService.unitVisible(s, watcher.id, 'B:brute')).toBe(true)
  })

  it('F8-KRU-ENH-3 redirectDamage: each point after the ward moves on the needed roll, to the candidate with most wounds', () => {
    hook('f8Redirect', { redirectDamage: (_s, _e, unitId) => (unitId === 'B:boss' ? { candidates: ['B:brute', 'B:guard'], succeedOn: 4 } : null) })
    const s = game((b) => {
      b.abilities['fx.a.f8-redirect'] = ab('fx.a.f8-redirect', { code: 'f8Redirect' })
      b.datasheets['fx.boss'].abilities = [...b.datasheets['fx.boss'].abilities, 'fx.a.f8-redirect']
    })
    trim(s, 'B:guard', 2)
    placeUnit(s, 'B:boss', [[0, 5]])
    placeUnit(s, 'B:brute', { x: 2, z: 5, gap: 0.3 })
    placeUnit(s, 'B:guard', { x: -6, z: 5, gap: 0.3 })
    const ctx = ctxFor(s, [4, 2, 6])
    const bossBefore = woundsLeft(s, 'B:boss'), bruteBefore = woundsLeft(s, 'B:brute')
    attackService.queueMortalWounds(ctx, 'B:boss', 3, 'test', false)
    expect(woundsLeft(s, 'B:boss')).toBe(bossBefore - 1)
    expect(woundsLeft(s, 'B:brute')).toBe(bruteBefore - 2) // brute (9 wounds) beats guard (2)
    expect(evOf(ctx).find((e) => e.type === 'DamageRedirected')).toMatchObject({ fromUnitId: 'B:boss', toUnitId: 'B:brute', points: 2 })
  })

  it('F8-KRU-ENH-2 an enemy movement phase window is offered to the non-active player', () => {
    hook('f8Pebble', { activate: { canUse: () => true, resolve: noop } as never })
    const s = game((b) => { b.abilities['fx.a.chaos-trait'] = ab('fx.a.chaos-trait', { trigger: 'activated', timing: { kind: 'phase', phase: 'movement', whose: 'enemy' }, code: 'f8Pebble' }) })
    placeUnit(s, 'B:boss', [[0, 8]])
    expect(abilityService.usable(s, 'B', 'movement').map((u) => u.abilityId)).toContain('fx.a.chaos-trait')
    expect(abilityService.usable(s, 'A', 'movement')).toHaveLength(0)
  })
})

// ---------- Gloomspite ----------
describe('F8 Gloomspite engine pieces', () => {
  it('F8-GLO-BT-2 a passive descriptor with noRetreatDamage waives the Retreat damage', () => {
    const s = game((b) => { b.abilities['fx.a.order-trait'] = ab('fx.a.order-trait', { effect: [{ noRetreatDamage: true }, { chargeAfterFallBack: true }], scope: { who: 'self' } }) })
    placeUnit(s, 'A:guard', { x: -10, z: -8 })
    placeUnit(s, 'B:guard', { x: -10, z: 8 })
    expect(unitIgnoresRetreatDamage(s, 'A:guard')).toBe(true)
    expect(unitIgnoresRetreatDamage(s, 'B:guard')).toBe(false)
  })

  it('F8-GLO-AB-1 affectsCompanion: only flagged stat modifiers reach a Companion weapon', () => {
    const s = game()
    placeUnit(s, 'A:knight', [[0, -5]])
    const knight = first(s, 'A:knight')
    const hooves = weaponOf(s, knight, 'knight-hooves'), lance = weaponOf(s, knight, 'knight-lance')
    const ctx = ctxFor(s)
    effectService.grant(ctx, 'A:knight', { modifyStat: { stat: 'A', value: 1 } }, { sourceAbilityId: 'fx.a.order-trait', sourceUnitId: 'A:knight', scope: { who: 'self' }, duration: 'battle' })
    expect(weaponService.effectiveWeapon(s, knight.id, hooves).A).toBe(2)
    expect(weaponService.effectiveWeapon(s, knight.id, lance).A).toBe(6)
    effectService.grant(ctx, 'A:knight', { modifyStat: { stat: 'A', value: 1 }, affectsCompanion: true }, { sourceAbilityId: 'fx.a.order-rule', sourceUnitId: 'A:knight', scope: { who: 'self' }, duration: 'battle' })
    expect(weaponService.effectiveWeapon(s, knight.id, hooves).A).toBe(3)
  })

  it('F8-GLO-ENH-3 forbidsShootingTarget makes a target illegal, naming the ability', () => {
    hook('f8Shard', { forbidsShootingTarget: (_s, _e, _f, target) => target === 'B:brute' })
    const s = game((b) => {
      b.abilities['fx.a.f8-shard'] = ab('fx.a.f8-shard', { name: 'Test Shard', code: 'f8Shard' })
      b.datasheets['fx.brute'].abilities = ['fx.a.f8-shard']
    })
    trim(s, 'B:brute', 1)
    placeUnit(s, 'A:cannon', [[0, -8]])
    placeUnit(s, 'B:brute', [[-3, 4]])
    placeUnit(s, 'B:boss', [[3, 4]])
    const gun = first(s, 'A:cannon')
    const w = weaponService.effectiveWeapon(s, gun.id, gun.weapons[0])
    expect(targetLegality(s, 'A:cannon', gun.id, w, 'B:brute')?.reason).toContain('Test Shard')
    expect(targetLegality(s, 'A:cannon', gun.id, w, 'B:boss')).toBeNull()
  })

  it('F8-GLO-ENH-3 the opponent gets a Shooting Phase window before the first shot', () => {
    hook('f8EnemyShoot', { activate: { canUse: () => true, resolve: noop } as never })
    const s = game((b) => { b.abilities['fx.a.chaos-trait'] = ab('fx.a.chaos-trait', { trigger: 'activated', timing: { kind: 'phase', phase: 'shooting', whose: 'enemy' }, code: 'f8EnemyShoot' }) })
    s.phase = 'shooting'
    placeUnit(s, 'A:cannon', [[0, -8]])
    placeUnit(s, 'B:boss', [[0, 6]])
    const ctx = ctxFor(s)
    shootingModule.enter(ctx)
    expect(shootingModule.advance(ctx)).toBe('pending')
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('B')
    expect(p.context.topic).toBe('abilityUse')
  })

  it('F8-GLO-RA-4 deferred mortal damage is drained once a shooting activation has resolved', () => {
    const s = game()
    s.phase = 'shooting'
    placeUnit(s, 'A:cannon', [[0, -8]])
    placeUnit(s, 'B:boss', [[0, 6]])
    const ctx = ctxFor(s, [])
    s.step = 'resolve'
    s.phaseState.marks.push('sh:ab:active', 'sh:resolveUnit=A:cannon')
    deferMortalAfterFight(s, { targetUnitId: 'B:boss', count: 2, source: 'test', player: 'A' })
    const before = woundsLeft(s, 'B:boss')
    shootingModule.advance(ctx)
    expect(woundsLeft(s, 'B:boss')).toBe(before - 2)
  })

  it('F8-GLO-AB-5 slides: mustEndOutOfCombat rejects an end in combat and lets a unit in combat leave', () => {
    const s = game()
    trim(s, 'A:guard', 1); trim(s, 'B:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]])
    placeUnit(s, 'B:guard', [[0, 2]]) // in combat
    expect(checkSlide(s, 'A:guard', 0, -6, 6, true).ok).toBe(false) // the default (Mighty Destroyers) keeps it in combat
    expect(checkSlide(s, 'A:guard', 0, -6, 6, true, { mustEndOutOfCombat: true }).ok).toBe(true)
    expect(checkSlide(s, 'A:guard', 0.5, 0, 6, true, { mustEndOutOfCombat: true }).ok).toBe(false)
    expect(slideOptions(s, 'A:guard', 6, { mustEndOutOfCombat: true }).filter((o) => o.id !== 'mv:0:0').length).toBeGreaterThan(0)
  })

  it('F8-GLO-AB-6 unitsPassedAcross and passedAcrossThisPhase record the enemy units a slide crossed', () => {
    const s = game()
    trim(s, 'A:guard', 1); trim(s, 'B:guard', 1); trim(s, 'B:brute', 1)
    placeUnit(s, 'A:guard', [[0, -6]])
    placeUnit(s, 'B:guard', [[0, -2]]) // straight ahead
    placeUnit(s, 'B:brute', [[8, -2]]) // off to the side
    expect(unitsPassedAcross(s, 'A:guard', 0, 10)).toEqual(['B:guard'])
    const ctx = ctxFor(s)
    expect(applySlide(ctx, 'A:guard', 0, 10, 12, { passThrough: true, mustEndOutOfCombat: true })).toBe(true)
    expect(passedAcrossThisPhase(s, 'A:guard')).toEqual(['B:guard'])
  })
})

// ---------- Lumineth ----------
describe('F8 Lumineth engine pieces', () => {
  it('F8-LRL-RA-2 MoveConstraints.mustEndCloserToEdge: every moving model must end nearer that edge', () => {
    const s = game()
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]])
    const m = first(s, 'A:guard')
    const c = emptyMoveConstraints(6, { mustEndCloserToEdge: { axis: 'x', sign: 1 } })
    const input = (x: number) => ({ unitModels: [m], placements: [{ modelId: m.id, pos: { x, y: 0, z: 0 } }], constraints: c, otherFriendly: [], enemies: [], board: s.board })
    expect(checkPlacements(input(3)).rejection).toBeNull()
    expect(checkPlacements(input(-3)).rejection?.code).toBe('E_OUT_OF_RANGE')
    expect(checkPlacements({ ...input(0), placements: [] }).rejection).toBeNull() // staying put is not a move
  })

  it('F8-LRL-RA-2 moveEdgeConstraint hooks reach ability slides; towardEdge does the same for one slide', () => {
    hook('f8Headwind', { moveEdgeConstraint: (_s, _e, unitId) => (unitId === 'A:guard' ? { axis: 'z', sign: 1 } : null) })
    const s = game((b) => {
      b.abilities['fx.a.f8-headwind'] = ab('fx.a.f8-headwind', { code: 'f8Headwind' })
      b.datasheets['fx.brute'].abilities = ['fx.a.f8-headwind']
    })
    trim(s, 'A:guard', 1); trim(s, 'B:brute', 1)
    placeUnit(s, 'A:guard', [[0, -5]])
    placeUnit(s, 'B:brute', [[10, 8]])
    expect(hookService.moveEdgeConstraintFor(s, 'A:guard')).toEqual({ axis: 'z', sign: 1 })
    expect(checkSlide(s, 'A:guard', 0, -2, 3, false).ok).toBe(false)
    expect(checkSlide(s, 'A:guard', 0, 2, 3, false).ok).toBe(true)
    hook('f8Headwind', {})
    expect(checkSlide(s, 'A:guard', 2, 0, 3, false, { towardEdge: { axis: 'x', sign: -1 } }).ok).toBe(false)
    expect(slideOptions(s, 'A:guard', 3, { towardEdge: { axis: 'x', sign: -1 } }).some((o) => o.label.startsWith('Toward the left edge'))).toBe(true)
  })

  it('F8-LRL-ENH-4 extraShootingOrigins: a target out of range from the model is legal from an extra origin', () => {
    hook('f8Curved', { extraShootingOrigins: (state, _e, modelId) => (state.models[modelId]?.unitId === 'A:knight' ? [{ x: 0, z: 4 }] : null) })
    const s = game((b) => {
      b.abilities['fx.a.f8-curved'] = ab('fx.a.f8-curved', { code: 'f8Curved' })
      b.datasheets['fx.knight'].abilities = ['fx.a.f8-curved']
    })
    trim(s, 'B:guard', 1)
    placeUnit(s, 'A:knight', [[0, -10]])
    placeUnit(s, 'B:guard', [[0, 8]])
    const k = first(s, 'A:knight')
    const pistol = weaponService.effectiveWeapon(s, k.id, weaponOf(s, k, 'knight-pistol'))
    expect(targetLegality(s, 'A:knight', k.id, pistol, 'B:guard')).toBeNull()
    hook('f8Curved', {})
    expect(targetLegality(s, 'A:knight', k.id, pistol, 'B:guard')?.code).toBe('E_NOT_IN_RANGE')
  })

  it('F8-LRL-AB-1 castingRoll: 2D6 against the casting value, unbinding, miscast and power level', () => {
    const wiz = (b: DataBundle): void => { b.datasheets['fx.boss'].keywords = ['HERO', 'INFANTRY', 'WIZARD']; b.datasheets['fx.boss'].wizard = 1 }
    const use = { abilityId: 'spell', unitId: 'A:boss', player: 'A' as const }
    // cast 7, the enemy Wizard rolls 6: the spell stands
    let s = game(wiz)
    placeUnit(s, 'A:boss', [[0, -5]]); placeUnit(s, 'B:boss', [[0, 5]])
    let ctx = ctxFor(s, [3, 4, 3, 3])
    expect(castingRoll(ctx, use, 'A:boss', 6)).toMatchObject({ cast: true, total: 7, unbound: false })
    expect(canCast(s, 'A:boss')).toBe(false) // power level 1 used
    // cast 6, unbind roll 8: unbound
    s = game(wiz)
    placeUnit(s, 'A:boss', [[0, -5]]); placeUnit(s, 'B:boss', [[0, 5]])
    ctx = ctxFor(s, [3, 3, 4, 4])
    expect(castingRoll(ctx, use, 'A:boss', 6)).toMatchObject({ cast: false, unbound: true, unboundBy: 'B:boss' })
    // below the value: not cast, no unbind roll
    s = game(wiz)
    placeUnit(s, 'A:boss', [[0, -5]]); placeUnit(s, 'B:boss', [[0, 5]])
    ctx = ctxFor(s, [2, 3])
    expect(castingRoll(ctx, use, 'A:boss', 6)).toMatchObject({ cast: false, unbound: false, miscast: false })
    // double 1: miscast, D3 mortal damage to the caster
    s = game(wiz)
    placeUnit(s, 'A:boss', [[0, -5]]); placeUnit(s, 'B:boss', [[0, 5]])
    ctx = ctxFor(s, [1, 1, 4])
    const before = woundsLeft(s, 'A:boss')
    expect(castingRoll(ctx, use, 'A:boss', 6)).toMatchObject({ miscast: true, cast: false })
    expect(woundsLeft(s, 'A:boss')).toBe(before - 2)
  })

  it('F8-LRL-AB-3 damagedByShootingThisPhase lists the units a shooting attack damaged', () => {
    const s = game()
    s.phase = 'shooting'
    trim(s, 'B:brute', 1)
    placeUnit(s, 'A:cannon', [[0, -8]])
    placeUnit(s, 'B:brute', [[0, 6]])
    const ctx = ctxFor(s, [6, 6, 6, 6, 1, 1, 3, 3, 3, 3, 3, 3])
    const gun = first(s, 'A:cannon')
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: 'A:cannon', overwatch: false, targets: [{ modelId: gun.id, weaponId: gun.weapons[0], targetUnitId: 'B:brute', profileGroup: null, attacks: null }] })
    attackService.advance(ctx)
    expect(damagedByShootingThisPhase(s, 'A:cannon')).toEqual(['B:brute'])
    expect(damagedByShootingThisPhase(s, 'B:brute')).toEqual([])
  })

  it('F8-LRL-AB-4 RedeployRequest.region: every option sets the unit up wholly inside the region', () => {
    const s = game()
    trim(s, 'A:guard', 3)
    placeUnit(s, 'A:guard', { x: 0, z: -2, gap: 0.3 })
    placeUnit(s, 'B:boss', [[0, 6]])
    const strip = [{ x: -15, z: -11 }, { x: 15, z: -11 }, { x: 15, z: -8 }, { x: -15, z: -8 }]
    const opts = redeployOptions(s, 'A:guard', 6, 6, { region: strip })
    expect(opts.length).toBeGreaterThan(0)
    const ctx = ctxFor(s)
    requestRedeploy(s, { abilityId: 'leap', player: 'A', unitIds: ['A:guard'], minEnemyDistance: 6, region: strip })
    expect(abilityService.runWindow(ctx, 'endOfTurn', 'A', 'leap')).toBe(true)
    const p = s.pending as ChooseOptionDecision
    s.pending = null
    expect(abilityService.handler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: p.id, optionId: p.options[0].id }, p)).toBeUndefined()
    for (const m of unitModels(s, 'A:guard')) expect(whollyWithinPolygon(m, strip)).toBe(true)
  })

  it('F8-LRL-BT-4 runReactionWindow offers youDeclared ATTACK reactions and records the declaration', () => {
    const resolved: string[] = []
    hook('f8Gale', { activate: { canUse: () => true, resolve: (_c: EngineContext, use: { abilityId: string }) => { resolved.push(use.abilityId) } } as never })
    const s = game((b) => { b.abilities['fx.a.order-trait'] = ab('fx.a.order-trait', { trigger: 'activated', timing: { kind: 'reaction', trigger: 'youDeclared', keyword: 'ATTACK' }, code: 'f8Gale' }) })
    s.phase = 'shooting'
    placeUnit(s, 'A:knight', [[0, -5]])
    expect(abilityService.usable(s, 'A', 'shooting')).toHaveLength(0)
    const ctx = ctxFor(s)
    expect(abilityService.runReactionWindow?.(ctx, 'A', { kind: 'youDeclaredAttack', unitId: 'A:knight', phase: 'shooting' }, 'k1')).toBe(true)
    expect(readDeclaredAttack(s)).toEqual({ unitId: 'A:knight', phase: 'shooting', seq: 1 })
    const p = s.pending as ChooseOptionDecision
    s.pending = null
    abilityService.handler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: p.id, optionId: p.options[0].id }, p)
    expect(abilityService.runReactionWindow?.(ctx, 'A', { kind: 'youDeclaredAttack', unitId: 'A:knight', phase: 'shooting' }, 'k1')).toBe(false)
    expect(resolved).toEqual(['fx.a.order-trait'])
  })
})

// ---------- Kharadron ----------
describe('F8 Kharadron engine pieces', () => {
  it('F8-KO-BT-1 the moveDeclared window: core.move reactions and params.window moveDeclared, not the end-of-phase window', () => {
    hook('f8Ply', { activate: { canUse: () => true, resolve: noop } as never })
    const s = game((b) => {
      b.abilities['fx.a.order-trait'] = ab('fx.a.order-trait', { trigger: 'activated', timing: { kind: 'reaction', trigger: 'youDeclared', abilityId: 'core.move' }, code: 'f8Ply' })
      b.abilities['fx.a.f8-disengage'] = ab('fx.a.f8-disengage', { trigger: 'activated', timing: { kind: 'phase', phase: 'movement', whose: 'your' }, params: { window: 'moveDeclared' }, code: 'f8Ply' })
      b.datasheets['fx.cannon'].abilities = ['fx.a.f8-disengage']
    })
    placeUnit(s, 'A:cannon', [[0, -8]])
    expect(abilityService.usable(s, 'A', 'moveDeclared').map((u) => u.abilityId).sort()).toEqual(['fx.a.f8-disengage', 'fx.a.order-trait'])
    expect(abilityService.usable(s, 'A', 'movement')).toHaveLength(0)
  })

  it('F8-KO-BT-1 movement opens the moveDeclared window after the declaration, with the declared move readable', () => {
    hook('f8Ply', { activate: { canUse: (state: GameState) => readDeclaredMove(state)?.unitId === 'A:cannon', resolve: noop } as never })
    const s = game((b) => { b.abilities['fx.a.order-trait'] = ab('fx.a.order-trait', { trigger: 'activated', timing: { kind: 'reaction', trigger: 'youDeclared', abilityId: 'core.move' }, code: 'f8Ply' }) })
    placeUnit(s, 'A:cannon', [[0, -8]])
    placeUnit(s, 'B:boss', [[0, 8]])
    const ctx = ctxFor(s)
    movementModule.enter(ctx)
    const step = (a: Action): void => {
      const p = s.pending as PendingDecision
      s.pending = null
      const rej = p.kind === 'chooseOption' ? abilityService.handler.handle(ctx, a, p) : movementModule.handle(ctx, a, p)
      if (rej) throw new Error(rej.reason)
      movementModule.advance(ctx)
    }
    movementModule.advance(ctx)
    step({ type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:cannon' })
    step({ type: 'declareMove', player: 'A', decisionId: '', unitId: 'A:cannon', moveType: 'normal' })
    const p = s.pending as ChooseOptionDecision
    expect(p.kind).toBe('chooseOption')
    expect(p.context.topic).toBe('abilityUse')
    expect(readDeclaredMove(s)).toEqual({ unitId: 'A:cannon', moveType: 'normal' })
    step({ type: 'pass', player: 'A', decisionId: p.id })
    expect(s.pending?.kind).toBe('moveUnit')
  })

  it('F8-KO-BT-3 an anchored set-up waits for moveEnded, then sets the lifted unit up wholly within N" of the anchor', () => {
    const s = game()
    trim(s, 'A:guard', 3)
    placeUnit(s, 'A:knight', [[0, -2]])
    placeUnit(s, 'A:guard', { x: -2, z: -5, gap: 0.3 })
    placeUnit(s, 'B:boss', [[0, 9]])
    const ctx = ctxFor(s)
    const origin = liftForRedeploy(ctx, 'A:guard', 'test')
    expect(s.units['A:guard'].location).toBe('reserves')
    requestRedeploy(s, { abilityId: 'ply', player: 'A', unitIds: ['A:guard'], minEnemyDistance: 3, anchor: { unitId: 'A:knight', whollyWithin: 3 }, origin, atWindow: 'moveEnded', markSetUp: true })
    expect(readRedeploy(s)?.unitIds).toEqual(['A:guard'])
    expect(abilityService.runWindow(ctx, 'movement', 'A', 'x')).toBe(false) // not yet
    placeUnit(s, 'A:knight', [[4, -1]]) // the anchor moves
    expect(abilityService.runWindow(ctx, 'moveEnded', 'A', 'me:x')).toBe(true)
    const p = s.pending as ChooseOptionDecision
    s.pending = null
    expect(abilityService.handler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: p.id, optionId: p.options[0].id }, p)).toBeUndefined()
    expect(s.units['A:guard'].location).toBe('board')
    expect(s.units['A:guard'].setUpTurn).toEqual({ round: 1, player: 'A' })
    const knight = first(s, 'A:knight')
    for (const m of unitModels(s, 'A:guard')) expect(whollyWithinOf(m, knight, 3)).toBe(true)
  })

  it('F8-KO-BT-5 a lifted unit with no legal anchored spot goes back to where it stood', () => {
    const s = game()
    trim(s, 'A:guard', 3)
    placeUnit(s, 'A:knight', [[0, -2]])
    placeUnit(s, 'A:guard', { x: -2, z: -6, gap: 0.3 })
    const before = unitModels(s, 'A:guard').map((m) => ({ ...m.pos }))
    const ctx = ctxFor(s)
    const origin = liftForRedeploy(ctx, 'A:guard', 'test')
    s.units['A:knight'].location = 'destroyed' // the anchor is gone
    requestRedeploy(s, { abilityId: 'ply', player: 'A', unitIds: ['A:guard'], minEnemyDistance: 3, anchor: { unitId: 'A:knight', whollyWithin: 3 }, origin, atWindow: 'moveEnded' })
    expect(abilityService.runWindow(ctx, 'moveEnded', 'A', 'me:y')).toBe(false)
    expect(s.units['A:guard'].location).toBe('board')
    expect(unitModels(s, 'A:guard').map((m) => ({ ...m.pos }))).toEqual(before)
  })

  it('F8-KO-AB-3 retreatOptions / applyRetreat: an ability retreat ends out of combat, with no damage', () => {
    const s = game()
    trim(s, 'A:guard', 2); trim(s, 'B:brute', 1)
    placeUnit(s, 'A:guard', { x: 0, z: -1, gap: 0.3 })
    placeUnit(s, 'B:brute', [[0.6, 1]])
    const ctx = ctxFor(s)
    const opts = retreatOptions(s, 'A:guard', 6).filter((o) => o.id !== 'mv:0:0')
    expect(opts.length).toBeGreaterThan(0)
    const before = woundsLeft(s, 'A:guard')
    expect(applyRetreat(ctx, 'A:guard', opts[0].id, 6)).toBe(true)
    expect(losService.unitInCombat(s, 'A:guard')).toBe(false)
    expect(woundsLeft(s, 'A:guard')).toBe(before)
  })

  it('F8-KO-AB-5 a datasheet `damaged` effect reaches the weapon profile (Attacks)', () => {
    const s = game((b) => { b.datasheets['fx.cannon'].damaged = { threshold: 4, effect: { when: { weaponId: 'fx.w.cannon-shot' }, setStat: { stat: 'A', value: 1 } } } })
    placeUnit(s, 'A:cannon', [[0, -8]])
    const gun = first(s, 'A:cannon')
    expect(weaponService.effectiveWeapon(s, gun.id, gun.weapons[0]).A).toBe(2)
    gun.woundsRemaining = 4
    expect(weaponService.effectiveWeapon(s, gun.id, gun.weapons[0]).A).toBe(1)
  })
})

// ---------- charge placement and movement candidates ----------
describe('F8 charge placement and move candidates', () => {
  const fiveKnights = (b: DataBundle): void => {
    const c = b.datasheets['fx.knight'].composition[0]
    b.datasheets['fx.knight'].composition = [{ ...c, min: 5, max: 5, default: 5 }]
    b.patrols['fx.order.army'].units = b.patrols['fx.order.army'].units.map((u) => (u.ref === 'knight' ? { ...u, size: 5 } : u))
  }

  it('F8-CHARGE-1 a roll that reaches is a charge that lands: a line of five ovals, open table, many angles', () => {
    let misses = 0, tries = 0
    for (let k = 0; k < 10; k++) {
      const s = game(fiveKnights)
      s.phase = 'charge'
      trim(s, 'B:brute', 1)
      const facing = (k % 4) * (Math.PI / 4)
      const knights = unitModels(s, 'A:knight')
      knights.forEach((m, i) => { m.facing = facing; m.pos = { x: -5 + i * 3.8, y: 0, z: -7 } })
      s.units['A:knight'].location = 'board'
      placeUnit(s, 'B:brute', [[-6 + k * 1.3, -7 + 6 + (k % 3)]])
      const needed = neededChargeDistance(s, 'A:knight') as number
      const roll = Math.ceil(needed + 1e-9)
      if (roll > 12) continue
      tries++
      const moves = legalChargeMoves(s, 'A:knight', roll, 1)
      if (moves.length === 0) misses++
      else expect(chargeMoveRejection(s, 'A:knight', roll, moves[0])).toBeNull()
    }
    expect(tries).toBeGreaterThan(5)
    expect(misses).toBe(0)
  })

  it('F8-CHARGE-2 a roll that only just reaches still lands (exact approach)', () => {
    const s = game()
    s.phase = 'charge'
    trim(s, 'A:guard', 1); trim(s, 'B:brute', 1)
    placeUnit(s, 'B:brute', [[0, 0]])
    const g = first(s, 'A:guard'), b = first(s, 'B:brute')
    // edge gap 7.49": needs 6.99" to end within ½"
    placeUnit(s, 'A:guard', [[0, -(g.base.radius + b.base.radius + 7.49)]])
    expect(neededChargeDistance(s, 'A:guard')).toBeCloseTo(6.99, 3)
    const moves = legalChargeMoves(s, 'A:guard', 7, 1)
    expect(moves).toHaveLength(1)
    expect(horizontalGap({ ...g, pos: moves[0][0].pos }, b)).toBeLessThanOrEqual(0.501)
  })

  it('F8-CHARGE-3 a lead model boxed in by friends finds a way round', () => {
    const s = game()
    s.phase = 'charge'
    trim(s, 'A:guard', 5); trim(s, 'B:brute', 1)
    placeUnit(s, 'B:brute', [[0, 0]])
    placeUnit(s, 'A:knight', [[0, -7]])
    // a wall of guards straight between the knight and the brute
    placeUnit(s, 'A:guard', [[-2.6, -4.5], [-1.3, -4.5], [0, -4.5], [1.3, -4.5], [2.6, -4.5]])
    const needed = neededChargeDistance(s, 'A:knight') as number
    const moves = legalChargeMoves(s, 'A:knight', 12, 1)
    expect(needed).toBeLessThan(12)
    expect(moves).toHaveLength(1)
  })

  it('F8-MOVE-1 move candidates stay few but varied (several objectives, both sides)', () => {
    const s = game()
    trim(s, 'A:guard', 5)
    placeUnit(s, 'A:guard', { x: -4, z: -7, gap: 0.3 })
    placeUnit(s, 'B:boss', [[8, 9]])
    const ctx = ctxFor(s)
    movementModule.enter(ctx)
    movementModule.advance(ctx)
    const act = (a: Action): void => { const p = s.pending as PendingDecision; s.pending = null; movementModule.handle(ctx, a, p); movementModule.advance(ctx) }
    act({ type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: 'A:guard' })
    act({ type: 'declareMove', player: 'A', decisionId: '', unitId: 'A:guard', moveType: 'normal' })
    const pending = s.pending as PendingDecision
    expect(pending.kind).toBe('moveUnit')
    const cands = movementModule.legalActions!(s, pending) as Action[]
    expect(cands.length).toBeGreaterThanOrEqual(5)
    expect(cands.length).toBeLessThanOrEqual(10)
    const centroids = cands.filter((a) => a.type === 'moveUnit' && a.placements.length > 0).map((a) => {
      const pl = (a as Extract<Action, { type: 'moveUnit' }>).placements
      return { x: pl.reduce((t, p) => t + p.pos.x, 0) / pl.length, z: pl.reduce((t, p) => t + p.pos.z, 0) / pl.length }
    })
    const objs = Object.values(s.objectives)
    const nearestObj = new Set(centroids.map((c) => objs.reduce((a, o) => (Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < Math.hypot(a.pos.x - c.x, a.pos.z - c.z) ? o : a)).id))
    expect(nearestObj.size).toBeGreaterThanOrEqual(2)
  })
})
