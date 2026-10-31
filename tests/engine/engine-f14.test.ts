// F14 engine-core: the generic engine pieces the four new armies (Blades of Khorne, Maggotkin of Nurgle, Nighthaunt, Sylvaneth)
// need, tested on the AoS fixture bundle with synthetic descriptors and test-only code hooks (no faction data). Test names carry
// "F14-" plus the faction spec id whose mechanism they cover (docs/spec/factions/*.md §Test IDs / §7 C-items); the army agents'
// own tests cover the abilities themselves.
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, SeededRng, abilityService, createContext, removeModel, unitModels,
  type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameState, type Model, type PendingDecision, type UnitId,
} from '../../src/engine'
import type { AbilityDescriptor, DataBundle, WeaponData } from '../../src/data/types'
import { attackService, critExpectedDamage, damagedThisTurn, firstAttackerThisPhase, slewInFightThisTurn } from '../../src/engine/attack'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { readDeclaredAttack } from '../../src/engine/declared'
import { effectService } from '../../src/engine/effects'
import { factionResources } from '../../src/engine/hooks-impl'
import { weaponService } from '../../src/engine/weapons'
import { checkSlide, readMoveQueue, slideOptions, writeMoveQueue } from '../../src/engine/factions/aos-moves'
import { chargeMoveRejection, neededChargeDistance } from '../../src/engine/phases/charge'
import { fightModule, legalTargetsFor } from '../../src/engine/phases/fight'
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
const setWeapon = (b: DataBundle, id: string, patch: Partial<WeaponData>): void => { b.weapons[id] = { ...b.weapons[id], ...patch } }

// one melee attack sequence of `unitId`'s first model with its first weapon at `target`; returns what advance returned
function melee(ctx: EngineContext, unitId: UnitId, target: UnitId): 'pending' | 'done' {
  const m = first(ctx.state, unitId)
  attackService.begin(ctx, { kind: 'melee', attackerUnitId: unitId, overwatch: false, targets: [{ modelId: m.id, weaponId: m.weapons[0], targetUnitId: target, profileGroup: null, attacks: null }] })
  return attackService.advance(ctx)
}

// drives the fight phase: phase decisions through fightModule, ability decisions (chooseOption) through the ability service
function driveFight(s: GameState, ctx: EngineContext, choose: (p: PendingDecision) => Action | undefined): void {
  for (let i = 0; i < 400; i++) {
    if (fightModule.advance(ctx) === 'done') return
    const p = s.pending as PendingDecision
    s.pending = null
    const a = choose(p) ?? (p.kind === 'chooseOption' ? { type: 'pass', player: p.player, decisionId: p.id } as Action : (fightModule.legalActions?.(s, p) ?? [])[0])
    if (!a) throw new Error(`no action for ${p.kind}`)
    const rej = p.kind === 'chooseOption' ? abilityService.handler.handle(ctx, a, p) : fightModule.handle(ctx, a, p)
    if (rej) throw new Error(`rejected ${rej.code}: ${rej.reason}`)
  }
  throw new Error('fight phase did not finish')
}

// ---------- Blades of Khorne ----------
describe('F14 Khorne engine pieces', () => {
  it('F14-BOK-ENG-C1 turn ledger: damaged / slew-in-fight are true this turn and false next turn; ability mortals never count as a fight kill', () => {
    const s = game(undefined, 'fight')
    trim(s, 'A:guard', 1); trim(s, 'B:guard', 3)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:guard', { x: -1, z: 1.6, gap: 0.3 })
    placeUnit(s, 'A:boss', [[8, 6]]); placeUnit(s, 'B:brute', { x: 8, z: 8, gap: 0.3 })
    const ctx = ctxFor(s, [6, 6, 6, 6, 1, 1])
    expect(damagedThisTurn(s, 'B:guard')).toBe(false)
    melee(ctx, 'A:guard', 'B:guard')
    expect(unitModels(s, 'B:guard')).toHaveLength(1)
    expect(damagedThisTurn(s, 'B:guard')).toBe(true)
    expect(slewInFightThisTurn(s, 'A:guard')).toBe(true)
    expect(damagedThisTurn(s, 'A:guard')).toBe(false)
    // mortal damage from an ability (kind 'mortal') damages and slays, but is no combat-attack kill
    attackService.queueMortalWounds(ctx, 'B:brute', 3, 'fx.a.test', false, { player: 'A', unitId: 'A:boss', modelId: first(s, 'A:boss').id })
    expect(damagedThisTurn(s, 'B:brute')).toBe(true)
    expect(slewInFightThisTurn(s, 'A:boss')).toBe(false)
    // the next turn starts empty
    s.activePlayer = 'B'
    expect(damagedThisTurn(s, 'B:guard')).toBe(false)
    expect(slewInFightThisTurn(s, 'A:guard')).toBe(false)
  })

  it('F14-BOK-ENG-C2 SlideOpts.closerToUnit rejects a slide that does not reduce the gap; endFree lets an in-combat unit end in or out of combat', () => {
    const s = game()
    trim(s, 'A:guard', 1); trim(s, 'B:brute', 1)
    placeUnit(s, 'A:guard', [[0, -6]]); placeUnit(s, 'B:brute', [[8, -6]])
    expect(checkSlide(s, 'A:guard', 3, 0, 6, false, { closerToUnit: 'B:brute' }).ok).toBe(true)
    expect(checkSlide(s, 'A:guard', 0, 3, 6, false, { closerToUnit: 'B:brute' }).ok).toBe(false)
    expect(checkSlide(s, 'A:guard', -3, 0, 6, false, { closerToUnit: 'B:brute' }).ok).toBe(false)
    expect(slideOptions(s, 'A:guard', 6, { closerToUnit: 'B:brute', mayNotEndInCombat: true })[0].label).toMatch(/^Toward Brute/)
    // a target that is not on the battlefield sets no closer rule
    s.units['B:brute'].location = 'reserves'
    expect(checkSlide(s, 'A:guard', 0, 3, 6, false, { closerToUnit: 'B:brute' }).ok).toBe(true)
    // endFree: starting in combat, the unit may leave combat or stay in it
    s.units['B:brute'].location = 'board'
    placeUnit(s, 'B:brute', [[0, -4.2]])
    expect(checkSlide(s, 'A:guard', 0, -4, 6, true).ok).toBe(false)
    expect(checkSlide(s, 'A:guard', 0, -4, 6, true, { endFree: true }).ok).toBe(true)
    expect(checkSlide(s, 'A:guard', 1, 0, 6, true, { endFree: true }).ok).toBe(true)
  })

  it('F14-BOK-ENG-C3 chargeMustEndInCombatWith: a charge ending ½" from another enemy but not in combat with the named unit is rejected', () => {
    hook('f14Pounce', { chargeMustEndInCombatWith: (_s, entry, unitId) => (entry.holderUnitId === unitId && unitId === 'A:boss' ? ['B:boss'] : null) })
    const run = (pounce: boolean): { near: unknown; far: unknown; needed: number | null } => {
      const s = game((b) => {
        b.abilities['fx.a.f14-pounce'] = ab('fx.a.f14-pounce', { code: pounce ? 'f14Pounce' : undefined })
        b.datasheets['fx.boss'].abilities = ['fx.a.f14-pounce']
      }, 'charge')
      trim(s, 'B:guard', 1)
      placeUnit(s, 'A:boss', [[0, -8]]); placeUnit(s, 'B:guard', [[3, -4]]); placeUnit(s, 'B:boss', [[0, 4]])
      const id = first(s, 'A:boss').id
      const gNear = first(s, 'B:guard')
      // ends 0.3" from the guard, ~9" from the enemy boss
      const near = chargeMoveRejection(s, 'A:boss', 12, [{ modelId: id, pos: { x: gNear.pos.x - 0.787 - 0.63 - 0.3, y: 0, z: -4 } }])
      // ends 0.4" from the enemy boss
      const far = chargeMoveRejection(s, 'A:boss', 12.5, [{ modelId: id, pos: { x: 0, y: 0, z: 4 - 1.575 - 0.4 } }])
      return { near, far, needed: neededChargeDistance(s, 'A:boss') }
    }
    const off = run(false)
    expect(off.near).toBeNull()
    expect(off.far).toBeNull()
    const on = run(true)
    expect(on.near).toMatchObject({ code: 'E_ENGAGEMENT' })
    expect(on.far).toBeNull()
    // the roll must also cover the 3" to the named unit
    expect(on.needed as number).toBeGreaterThan(off.needed as number)
    expect(on.needed as number).toBeCloseTo(12 - 1.575 - 3, 1)
  })
})

// ---------- several crit abilities on one weapon (core 20.0) ----------
describe('F14 crit choice (BOK-WEAP-3, NH-ENH-4)', () => {
  it('F14-BOK-WEAP-3 the attacking player picks one crit ability before the dice; hint.value = expected damage; the pick applies', () => {
    const run = (pick: string): { p: ChooseOptionDecision; ctx: EngineContext; s: GameState } => {
      const s = game((b) => setWeapon(b, 'fx.w.guard-spear', { abilities: [{ ability: 'CRIT_AUTO_WOUND' }, { ability: 'CRIT_MORTAL' }] }), 'fight')
      trim(s, 'A:guard', 1)
      placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:brute', { x: 0, z: 1.6, gap: 0.3 })
      const ctx = ctxFor(s, [6, 1, 1])
      expect(melee(ctx, 'A:guard', 'B:brute')).toBe('pending')
      expect(of(evOf(ctx), 'HitRolled')).toHaveLength(0) // nothing rolled before the pick
      const p = s.pending as ChooseOptionDecision
      expect(p.kind).toBe('chooseOption')
      expect(p.context.topic).toBe('critChoice')
      expect(p.player).toBe('A')
      s.pending = null
      expect(DEFAULT_MODULES.topics.critChoice?.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: p.id, optionId: pick }, p)).toBeUndefined()
      expect(attackService.advance(ctx)).toBe('done')
      return { p, ctx, s }
    }
    const auto = run('CRIT_AUTO_WOUND')
    expect(auto.p.options.map((o) => o.id)).toEqual(['CRIT_AUTO_WOUND', 'CRIT_MORTAL'])
    // brute Sv 3+, Rend 0, Damage 1: auto-wound = P(unsaved) 1/3; mortal = 1
    expect(auto.p.options.map((o) => (o.hint as { value: number }).value)).toEqual([0.333, 1])
    expect(of(evOf(auto.ctx), 'WoundRolled')).toHaveLength(0)
    expect(of(evOf(auto.ctx), 'SaveRolled')).toHaveLength(1)
    expect(auto.s.phaseState.marks.some((m) => m.startsWith('critPick:'))).toBe(false)
    const mortal = run('CRIT_MORTAL')
    expect(of(evOf(mortal.ctx), 'SaveRolled')).toHaveLength(0)
    expect(of(evOf(mortal.ctx), 'DamageApplied').every((d) => d.mortal)).toBe(true)
  })

  it('F14-BOK-WEAP-3 expected damage per crit: Weapons of the Hunt prefer Crit (Mortal) against 5+ and Crit (2 Hits) against 6+', () => {
    const at = (sv: number): { mortal: number; twoHits: number } => {
      const s = game((b) => {
        setWeapon(b, 'fx.w.guard-spear', { A: 3, skill: 4, wound: 3, rend: 0, D: 1, abilities: [{ ability: 'CRIT_2_HITS' }, { ability: 'CRIT_MORTAL' }] })
        b.datasheets['fx.brute'].stats = { ...b.datasheets['fx.brute'].stats, Sv: sv }
      }, 'fight')
      placeUnit(s, 'A:guard', { x: 0, z: 0 }); placeUnit(s, 'B:brute', { x: 0, z: 2 })
      const w = weaponService.effectiveWeapon(s, first(s, 'A:guard').id, 'fx.w.guard-spear')
      const rep = first(s, 'B:brute')
      return { mortal: critExpectedDamage(s, w, rep, 0, { ability: 'CRIT_MORTAL' }), twoHits: critExpectedDamage(s, w, rep, 0, { ability: 'CRIT_2_HITS' }) }
    }
    expect(at(4).mortal).toBeGreaterThan(at(4).twoHits)
    expect(at(5).mortal).toBeGreaterThan(at(5).twoHits)
    expect(at(6).twoHits).toBeGreaterThan(at(6).mortal)
  })

  it('F14-NH-ENH-4 a granted Crit (Mortal) next to a printed Crit (Auto-wound) is offered as a pick; a single crit ability asks nothing', () => {
    const s = game((b) => {
      setWeapon(b, 'fx.w.guard-spear', { abilities: [{ ability: 'CRIT_AUTO_WOUND' }] })
      b.abilities['fx.a.f14-edge'] = ab('fx.a.f14-edge', { effect: { grantWeaponAbility: { ability: 'CRIT_MORTAL' } }, scope: { who: 'self' } })
    }, 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:brute', { x: 0, z: 1.6, gap: 0.3 })
    const ctx = ctxFor(s, [5, 1, 1, 1])
    expect(melee(ctx, 'A:guard', 'B:brute')).toBe('done') // printed only: no pick
    effectService.grant(ctx, 'A:guard', { grantWeaponAbility: { ability: 'CRIT_MORTAL' } }, { sourceAbilityId: 'fx.a.f14-edge', sourceUnitId: 'A:guard', scope: { who: 'self' }, duration: 'battle' })
    expect(melee(ctx, 'A:guard', 'B:brute')).toBe('pending')
    expect((s.pending as ChooseOptionDecision).options.map((o) => o.id).sort()).toEqual(['CRIT_AUTO_WOUND', 'CRIT_MORTAL'])
  })
})

// ---------- Maggotkin of Nurgle ----------
describe('F14 Nurgle engine pieces', () => {
  it('F14-MON-BT-2 onOwnCriticalHits: the attacking unit\'s own codes hear the critical hits per weapon group', () => {
    const calls: { unitId: string; weaponId: string; count: number }[] = []
    hook('f14Disease', { onOwnCriticalHits: (_c, info) => { calls.push({ unitId: info.unitId, weaponId: info.weaponId, count: info.count }) } })
    const s = game((b) => {
      b.abilities['fx.a.f14-disease'] = ab('fx.a.f14-disease', { code: 'f14Disease' })
      b.datasheets['fx.guard'].abilities = ['fx.a.f14-disease']
    }, 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:brute', { x: 0, z: 1.6, gap: 0.3 })
    const ctx = ctxFor(s, [6, 6, 1, 1, /* second sequence */ 5, 1, 1])
    melee(ctx, 'A:guard', 'B:brute')
    melee(ctx, 'A:guard', 'B:brute')
    expect(calls).toEqual([{ unitId: 'A:guard', weaponId: 'fx.w.guard-spear', count: 2 }])
  })

  it('F14-MON-C2 factionResources: the readout of a code on one of the player\'s abilities; nothing for the other player', () => {
    hook('f14Pool', { resourceReadout: (_s, ability, player) => ({ id: 'disease', label: 'Disease', value: player === 'A' ? 3 : 0, max: 7, help: ability.name }) })
    const s = game((b) => {
      b.abilities['fx.a.f14-pool'] = ab('fx.a.f14-pool', { code: 'f14Pool' })
      b.datasheets['fx.knight'].abilities = ['fx.a.f14-pool'] // player A's army only
    })
    expect(factionResources(s, 'A')).toEqual([{ id: 'disease', label: 'Disease', value: 3, max: 7, help: 'f14-pool' }])
    expect(factionResources(s, 'B')).toEqual([])
  })
})

// ---------- Nighthaunt ----------
describe('F14 Nighthaunt engine pieces', () => {
  const saves = (opts: { ethereal: boolean; holder?: 'fx.boss' | 'fx.guard'; rend: number; bonus: number; dice: number[] }): { final: number; saved: boolean }[] => {
    const s = game((b) => {
      setWeapon(b, 'fx.w.guard-spear', { rend: opts.rend })
      b.abilities['fx.a.f14-ethereal'] = ab('fx.a.f14-ethereal', { effect: opts.ethereal ? { ignoreModifiers: 'save' } : {}, scope: { who: 'self' } })
      b.datasheets[opts.holder ?? 'fx.boss'].abilities = ['fx.a.f14-ethereal']
    }, 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:boss', [[0, 1.8]])
    const ctx = ctxFor(s, [6, 6, 6, 6, ...opts.dice, 6, 6])
    if (opts.bonus) effectService.grant(ctx, 'B:boss', { modifyRoll: { roll: 'save', value: opts.bonus } }, { sourceAbilityId: 'fx.a.chaos-rule', sourceUnitId: 'B:boss', scope: { who: 'self' }, duration: 'battle' })
    melee(ctx, 'A:guard', 'B:boss')
    return of(evOf(ctx), 'SaveRolled').map((e) => ({ final: e.final, saved: e.saved }))
  }

  it('F14-NH-BT-1 Effect.ignoreModifiers save: Rend 2 is ignored (a 3+ save holds on a 3); unmodified 1 still fails', () => {
    expect(saves({ ethereal: false, rend: 2, bonus: 0, dice: [3, 1] })).toEqual([{ final: 1, saved: false }, { final: -1, saved: false }])
    expect(saves({ ethereal: true, rend: 2, bonus: 0, dice: [3, 1] })).toEqual([{ final: 3, saved: true }, { final: 1, saved: false }])
  })

  it('F14-NH-BT-1 a +1 save bonus is ignored too; the attacker\'s own Ethereal does nothing for the defender', () => {
    expect(saves({ ethereal: false, rend: 0, bonus: 1, dice: [2, 2] }).map((r) => r.saved)).toEqual([true, true])
    expect(saves({ ethereal: true, rend: 0, bonus: 1, dice: [2, 2] }).map((r) => r.saved)).toEqual([false, false])
    expect(saves({ ethereal: true, holder: 'fx.guard', rend: 2, bonus: 0, dice: [3, 3] }).map((r) => r.final)).toEqual([1, 1])
  })

  it('F14-SBG-ENH-3 ignoreNegativeModifiers save drops Rend as well (core 17.0), keeps a positive modifier', () => {
    const s = game((b) => {
      setWeapon(b, 'fx.w.guard-spear', { rend: 2 })
      b.abilities['fx.a.f14-aura'] = ab('fx.a.f14-aura', { effect: { ignoreNegativeModifiers: 'save' }, scope: { who: 'self' } })
      b.datasheets['fx.boss'].abilities = ['fx.a.f14-aura']
    }, 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:boss', [[0, 1.8]])
    const ctx = ctxFor(s, [6, 6, 6, 6, 2, 2, 6, 6])
    effectService.grant(ctx, 'B:boss', { modifyRoll: { roll: 'save', value: 1 } }, { sourceAbilityId: 'fx.a.chaos-rule', sourceUnitId: 'B:boss', scope: { who: 'self' }, duration: 'battle' })
    melee(ctx, 'A:guard', 'B:boss')
    expect(of(evOf(ctx), 'SaveRolled').map((e) => e.final)).toEqual([3, 3])
  })

  it('F14-NH-ENH-1 onEnemyModelSlain: the slaying unit\'s own sources hear each enemy model it slew (Crit (Mortal) pools included); not the victims', () => {
    const calls: { holder: string; slain: string; kind: string }[] = []
    hook('f14Soulfire', { onEnemyModelSlain: (_c, entry, info) => { calls.push({ holder: entry.holderUnitId, slain: info.slainUnitId, kind: info.by.kind }) } })
    const s = game((b) => {
      setWeapon(b, 'fx.w.guard-spear', { abilities: [{ ability: 'CRIT_MORTAL' }] })
      b.abilities['fx.a.f14-soulfire'] = ab('fx.a.f14-soulfire', { code: 'f14Soulfire' })
      b.datasheets['fx.guard'].abilities = ['fx.a.f14-soulfire']
    }, 'fight')
    trim(s, 'A:guard', 1); trim(s, 'B:guard', 3)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:guard', { x: -1, z: 1.6, gap: 0.3 })
    const ctx = ctxFor(s, [6, 4, 6, 1])
    melee(ctx, 'A:guard', 'B:guard')
    expect(calls).toEqual([{ holder: 'A:guard', slain: 'B:guard', kind: 'melee' }, { holder: 'A:guard', slain: 'B:guard', kind: 'melee' }])
  })

  it('F14-NH-ENH-2 forbidsFightTarget removes a combat target; firstAttackerThisPhase names the first unit to declare on each target', () => {
    hook('f14Cloak', { forbidsFightTarget: (_s, entry, fighting, target) => target === entry.holderUnitId && fighting === 'A:guard' })
    const s = game((b) => {
      b.abilities['fx.a.f14-cloak'] = ab('fx.a.f14-cloak', { code: 'f14Cloak' })
      b.datasheets['fx.boss'].abilities = ['fx.a.f14-cloak']
    }, 'fight')
    trim(s, 'A:guard', 1); trim(s, 'B:guard', 1)
    placeUnit(s, 'A:guard', [[0, 0]]); placeUnit(s, 'B:boss', [[0, 1.8]]); placeUnit(s, 'B:guard', [[1.6, 0]])
    placeUnit(s, 'A:boss', [[-1.8, 1.4]])
    expect(legalTargetsFor(s, 'A:guard', first(s, 'A:guard'), ['B:boss', 'B:guard'])).toEqual(['B:guard'])
    expect(legalTargetsFor(s, 'A:boss', first(s, 'A:boss'), ['B:boss', 'B:guard'])).toContain('B:boss')
    const ctx = ctxFor(s, [])
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:guard', overwatch: false, targets: [{ modelId: first(s, 'A:guard').id, weaponId: 'fx.w.guard-spear', targetUnitId: 'B:guard', profileGroup: null, attacks: 0 }] })
    s.phaseState.attack = null
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:boss', overwatch: false, targets: [{ modelId: first(s, 'A:boss').id, weaponId: 'fx.w.boss-blade', targetUnitId: 'B:guard', profileGroup: null, attacks: 0 }] })
    expect(firstAttackerThisPhase(s, 'B:guard')).toBe('A:guard')
    expect(firstAttackerThisPhase(s, 'B:boss')).toBeNull()
  })
})

// ---------- Sylvaneth ----------
describe('F14 Sylvaneth engine pieces', () => {
  it('F14-SYL-ENH-1 statDelta: a code hook adds to a weapon stat through statFor (Rend +1 via AP -1); companion weapons only with affectsCompanion', () => {
    let on = true
    hook('f14Head', { statDelta: (_s, entry, q) => (on && q.stat === 'AP' && q.weapon?.kind === 'melee' && q.unitId === entry.holderUnitId ? -1 : 0) })
    const s = game((b) => {
      b.abilities['fx.a.f14-head'] = ab('fx.a.f14-head', { code: 'f14Head' })
      b.datasheets['fx.knight'].abilities = ['fx.a.f14-head']
    })
    placeUnit(s, 'A:knight', [[0, 0]])
    const k = first(s, 'A:knight')
    expect(weaponService.effectiveWeapon(s, k.id, 'fx.w.knight-lance').rend).toBe(2)
    expect(weaponService.effectiveWeapon(s, k.id, 'fx.w.knight-pistol').rend).toBe(1)
    expect(weaponService.effectiveWeapon(s, k.id, 'fx.w.knight-hooves').rend).toBe(0) // Companion
    codeHooks.f14Head.affectsCompanion = true
    expect(weaponService.effectiveWeapon(s, k.id, 'fx.w.knight-hooves').rend).toBe(1)
    on = false
    expect(weaponService.effectiveWeapon(s, k.id, 'fx.w.knight-lance').rend).toBe(1)
  })

  it('F14-SYL-C2 MoveQueue.atWindow: the queue waits through other windows and is offered in its own', () => {
    const s = game(undefined, 'fight')
    trim(s, 'A:guard', 1)
    placeUnit(s, 'A:guard', [[0, -6]])
    const ctx = ctxFor(s)
    writeMoveQueue(s, { abilityId: 'fx.a.test', player: 'A', maxDistance: 4, queue: ['A:guard'], opts: { mayNotEndInCombat: true }, atWindow: 'fightAfter' })
    expect(abilityService.runWindow(ctx, 'fight', 'A', 'x')).toBe(false)
    expect(readMoveQueue(s)?.queue).toEqual(['A:guard'])
    expect(abilityService.runWindow(ctx, 'fightAfter', 'A', 'fight:after:x')).toBe(true)
    const p = s.pending as ChooseOptionDecision
    expect(p.context.unitId).toBe('A:guard')
    expect(p.options.length).toBeGreaterThan(1)
  })

  it('F14-SYL-ENH-2 the fightAfter window runs once a unit\'s Fight has resolved: a move queued at the attack declaration comes after its dice', () => {
    const resolved: string[] = []
    hook('f14Zephyr', {
      activate: {
        canUse: (state: GameState, unitId: UnitId | null) => { const d = readDeclaredAttack(state); return !!d && d.phase === 'fight' && d.unitId === 'A:boss' && unitId === null },
        resolve: (c: EngineContext, use: { abilityId: string; player: 'A' | 'B' }) => {
          resolved.push(use.abilityId)
          writeMoveQueue(c.state, { abilityId: use.abilityId, player: use.player, maxDistance: 8, queue: ['A:boss'], opts: { mayNotEndInCombat: true }, atWindow: 'fightAfter' })
        },
      } as never,
    })
    const hunger: string[] = []
    hook('f14Hunger', { onOwnFightResolved: (_c, info) => { hunger.push(info.unitId) } })
    const s = game((b) => {
      b.abilities['fx.a.order-trait'] = ab('fx.a.order-trait', { trigger: 'activated', timing: { kind: 'reaction', trigger: 'youDeclared', keyword: 'ATTACK' }, limit: 'oncePerBattle', code: 'f14Zephyr' })
      b.abilities['fx.a.f14-hunger'] = ab('fx.a.f14-hunger', { code: 'f14Hunger' })
      b.datasheets['fx.boss'].abilities = ['fx.a.f14-hunger']
      b.datasheets['fx.brute'].stats = { ...b.datasheets['fx.brute'].stats, W: 30 }
    }, 'fight')
    trim(s, 'B:brute', 1)
    placeUnit(s, 'A:boss', [[0, -4]]); placeUnit(s, 'B:brute', [[0, -2]])
    const { ctx, events: ev } = createContext(s, new SeededRng('f14-zephyr'), DEFAULT_MODULES)
    fightModule.enter(ctx)
    let movedAt = -1
    driveFight(s, ctx, (p) => {
      if (p.kind !== 'chooseOption') return undefined
      const use = p.options.find((o) => o.id.startsWith('fx.a.order-trait'))
      if (p.context.topic === 'abilityUse' && use) return use.action.type === 'chooseOption' ? { ...use.action, decisionId: p.id } : undefined
      const mv = p.options.find((o) => o.id.startsWith('mv:') && o.id !== 'mv:0:0')
      if (p.context.topic === 'abilityMode' && mv) { movedAt = ev.length; return { type: 'chooseOption', player: p.player, decisionId: p.id, optionId: mv.id } }
      return undefined
    })
    expect(resolved).toEqual(['fx.a.order-trait'])
    const lastBossHit = ev.reduce((a, e, i) => (e.type === 'HitRolled' && e.attack.attackerUnitId === 'A:boss' ? i : a), -1)
    expect(lastBossHit).toBeGreaterThan(0)
    expect(movedAt).toBeGreaterThan(lastBossHit)
    expect(of(ev, 'UnitMoved').some((e) => e.unitId === 'A:boss')).toBe(true)
    expect(hunger.filter((u) => u === 'A:boss')).toHaveLength(1)
    expect(readMoveQueue(s)).toBeNull()
  })

  it('F14-SYL-AB-2 SlideOpts.noCombatPath: even a FLY unit may not pass through combat range; a unit in combat is offered nothing', () => {
    const s = game()
    trim(s, 'A:guard', 1)
    placeUnit(s, 'B:hawk', [[-6, -8]]); placeUnit(s, 'A:guard', [[0, -4.5]])
    expect(checkSlide(s, 'B:hawk', 12, 0, 12, false, { normalMove: true }).ok).toBe(true) // Fly ignores it
    expect(checkSlide(s, 'B:hawk', 12, 0, 12, false, { noCombatPath: true }).ok).toBe(false)
    expect(checkSlide(s, 'B:hawk', 0, 2, 12, false, { noCombatPath: true }).ok).toBe(true)
    expect(slideOptions(s, 'B:hawk', 6, { noCombatPath: true }).length).toBeGreaterThan(1)
    placeUnit(s, 'A:guard', [[-6, -6.5]])
    expect(slideOptions(s, 'B:hawk', 6, { noCombatPath: true })).toEqual([])
  })
})
