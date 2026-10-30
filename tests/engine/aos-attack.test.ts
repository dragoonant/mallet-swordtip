// WP5 (13-engine-port-plan §5): the AoS attack sequence (hit / wound / save / damage pool / ward / spill-over), weapon
// abilities, Guarded Hero. Drives src/engine/attack.ts directly with a ScriptedRng on the checklist fixtures.
import { describe, expect, it } from 'vitest'
import {
  createContext, DEFAULT_MODULES, ScriptedRng,
  type DeclaredTarget, type GameEvent, type GameState,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { dieSucceeds, netSaveModifier, clampHitWoundModifier } from '../../src/engine/dice'
import type { DataBundle } from '../../src/data/types'
import { aosState, withAosBundle } from '../fixtures'
import { placeUnit } from '../fixtures/state'

// ---------- harness ----------
function world(patch?: (b: DataBundle) => void): GameState {
  const s = patch ? aosState({}, withAosBundle(patch)) : aosState()
  s.phase = 'combat' as GameState['phase']
  s.phase = 'fight'
  s.activePlayer = 'A'
  return s
}

function put(s: GameState, unitId: string, x: number, z: number, gap = 0.3): void { placeUnit(s, unitId, { x, z, gap }) }

type Kind = 'ranged' | 'melee'
function run(s: GameState, dice: number[], kind: Kind, attackerUnitId: string, targets: DeclaredTarget[]): { events: GameEvent[]; rng: ScriptedRng; ctx: ReturnType<typeof createContext>['ctx'] } {
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets })
  expect(attackService.advance(ctx)).toBe('done')
  return { events, rng, ctx }
}

const wid = (s: GameState, modelId: string, i = 0): string => s.models[modelId].weapons[i]
const tgt = (s: GameState, modelId: string, targetUnitId: string, attacks: number | null, weaponIndex = 0): DeclaredTarget =>
  ({ modelId, weaponId: wid(s, modelId, weaponIndex), targetUnitId, profileGroup: null, attacks })
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const alive = (s: GameState, unitId: string): number => s.units[unitId].models.length
// stat patches go into the data bundle before the state is built (runtime datasheets are frozen)
const wardPatch = (dsId: string, ward: number) => (b: DataBundle): void => { b.datasheets[dsId].stats.ward = ward }
const noSavePatch = (dsId: string) => (b: DataBundle): void => { b.datasheets[dsId].stats.noSave = true }

// ---------- hit / wound / save ----------
describe('aos attack: hit, wound, save', () => {
  it('SHOOT-010 hit 4+: die 4 hits, die 3 misses, and a miss consumes no wound die', () => {
    const s = world()
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    // 3 attacks: hits [4,3,5] -> two hit; wounds (3+) [3,2] -> one wounds; save [4] fails (4 - 1 = 3 < 4)
    const { events, rng } = run(s, [4, 3, 5, 3, 2, 4], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 3)])
    expect(of(events, 'HitRolled').map((e) => [e.die, e.hit])).toEqual([[4, true], [3, false], [5, true]])
    expect(of(events, 'WoundRolled')).toHaveLength(2)
    expect(of(events, 'SaveRolled')).toHaveLength(1)
    expect(rng.remaining).toEqual([])
  })

  it('SHOOT-011 wound 3+: die 3 wounds, die 2 fails, and a failed wound consumes no save die', () => {
    const s = world()
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    const { events, rng } = run(s, [4, 4, 3, 2, 1], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 2)])
    expect(of(events, 'WoundRolled').map((e) => [e.die, e.wounded])).toEqual([[3, true], [2, false]])
    expect(of(events, 'SaveRolled')).toHaveLength(1)
    expect(rng.remaining).toEqual([])
  })

  it('SHOOT-016 save 4+ vs Rend 1: die 5 -> 4 is stopped, die 4 -> 3 is not', () => {
    const s = world()
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    const { events } = run(s, [4, 4, 3, 3, 5, 4], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 2)])
    const saves = of(events, 'SaveRolled')
    expect(saves.map((e) => [e.die, e.final, e.saved])).toEqual([[5, 4, true], [4, 3, false]])
    expect(of(events, 'DamagePoolResolved')[0].points).toBe(2) // one unsaved attack, Damage 2 (SHOOT-019)
  })

  it('SHOOT-017 a Save of "-" consumes no save die and every wound succeeds', () => {
    const s = world(noSavePatch('fx.guard'))
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    const { events, rng } = run(s, [4, 4, 3, 3], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 2)])
    expect(of(events, 'SaveRolled')).toHaveLength(0)
    expect(of(events, 'DamagePoolResolved')[0].points).toBe(4)
    expect(rng.remaining).toEqual([])
  })

  it('SHOOT-020 Cannon D3+2: damage dice [2,5] give 3 + 5 = 8, no damage die for failed attacks', () => {
    const s = world()
    put(s, 'A:cannon', 0, -6); put(s, 'B:hawk', 0, 4)
    // 2 attacks: hits [4,4], wounds (2+) [2,2], saves (4+, rend 2) [1,1] fail, damage [2,5]
    const { events, rng } = run(s, [4, 4, 2, 2, 1, 1, 2, 5], 'ranged', 'A:cannon', [tgt(s, 'A:cannon#0', 'B:hawk', 2)])
    expect(of(events, 'DamagePoolResolved')[0].points).toBe(8)
    expect(rng.remaining).toEqual([])
  })

  it('SHOOT-020b no damage die is rolled for a saved attack', () => {
    const s = world()
    put(s, 'A:cannon', 0, -6); put(s, 'B:hawk', 0, 4)
    const { rng } = run(s, [4, 2, 6], 'ranged', 'A:cannon', [tgt(s, 'A:cannon#0', 'B:hawk', 1)])
    expect(rng.remaining).toEqual([])
    expect(alive(s, 'B:hawk')).toBe(1)
  })

  it('CORE-010 / CORE-011 save modifiers cap at +1, never floor, and Rend sits outside the cap', () => {
    expect(netSaveModifier([1, 1])).toBe(1)
    expect(netSaveModifier([-1, -1, -1])).toBe(-3)
    expect(clampHitWoundModifier(2)).toBe(1)
    expect(clampHitWoundModifier(-3)).toBe(-1)
    expect(clampHitWoundModifier(0)).toBe(0)
    // die 5, Rend 2, save mods {+1,+1}: 5 - 2 + 1 = 4
    expect(5 - 2 + netSaveModifier([1, 1])).toBe(4)
  })

  it('CORE-015 an unmodified 1 always fails, a 6 is not an automatic success', () => {
    expect(dieSucceeds(1, 2, 2)).toBe(false)
    expect(dieSucceeds(6, 5, 6)).toBe(false)
    expect(dieSucceeds(3, 4, 4)).toBe(true)
  })
})

// ---------- ordering ----------
describe('aos attack: order of resolution', () => {
  it('SHOOT-008 all attacks on X resolve before Y, and no model is removed until the whole ability is done', () => {
    const s = world()
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -6, 2); put(s, 'A:boss', 6, 2)
    // Brute 0 splits 3 attacks: 2 at the guard, 1 at the boss. Everything hits, wounds and fails its save.
    const targets = [tgt(s, 'B:brute#0', 'A:guard', 2), tgt(s, 'B:brute#0', 'A:boss', 1)]
    const { events } = run(s, Array(30).fill(4).map((v, i) => (i < 6 ? 4 : i < 12 ? 3 : 1)), 'melee', 'B:brute', targets)
    const rolled = events.map((e, i) => ({ e, i }))
    const lastAttackRoll = Math.max(...rolled.filter(({ e }) => e.type === 'SaveRolled').map(({ i }) => i))
    const firstRemoval = Math.min(...rolled.filter(({ e }) => e.type === 'ModelDestroyed').map(({ i }) => i))
    expect(firstRemoval).toBeGreaterThan(lastAttackRoll)
    const hits = of(events, 'HitRolled')
    expect(hits.map((h) => h.attack.targetUnitId)).toEqual(['A:guard', 'A:guard', 'A:boss'])
  })

  it('DMG-001 six successful attacks make one damage sequence', () => {
    const s = world()
    put(s, 'A:guard', -8, -2); put(s, 'B:brute', -8, 0)
    const guards = ['A:guard#0', 'A:guard#1', 'A:guard#2']
    const { events } = run(s, [...Array(6).fill(4), ...Array(6).fill(4), ...Array(6).fill(1)], 'melee', 'A:guard', guards.map((m) => tgt(s, m, 'B:brute', 2)))
    const pools = of(events, 'DamagePoolResolved')
    expect(pools).toHaveLength(1)
    expect(pools[0].points).toBe(6)
  })
})

// ---------- damage pool, ward, allocation ----------
describe('aos attack: damage pool', () => {
  const mortal = (s: GameState, dice: number[], unitId: string, n: number) => {
    const rng = new ScriptedRng(dice)
    const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
    attackService.queueMortalWounds(ctx, unitId, n, 'test', false)
    if (s.phaseState.attack) attackService.advance(ctx)
    return { events, rng }
  }

  it('DMG-006 3 Brutes (Health 3), pool 7: two are slain and the counter sits at 1', () => {
    const s = world()
    put(s, 'B:brute', 0, 0); put(s, 'A:guard', 8, 8)
    mortal(s, [], 'B:brute', 7)
    expect(alive(s, 'B:brute')).toBe(1)
    expect(s.models[s.units['B:brute'].models[0]].woundsRemaining).toBe(2)
  })

  it('DMG-007 the counter persists: a further 2 points slay the third Brute', () => {
    const s = world()
    put(s, 'B:brute', 0, 0)
    mortal(s, [], 'B:brute', 7)
    mortal(s, [], 'B:brute', 2)
    expect(s.units['B:brute'].location).toBe('destroyed')
  })

  it('DMG-010 the last model slain destroys the unit once and the rest of the pool is discarded', () => {
    const s = world()
    put(s, 'B:brute', 0, 0)
    const { events } = mortal(s, [], 'B:brute', 20)
    expect(of(events, 'UnitDestroyed')).toHaveLength(1)
    expect(of(events, 'ModelDestroyed')).toHaveLength(3)
    expect(s.units['B:brute'].location).toBe('destroyed')
  })

  it('DMG-011 mortal damage rolls no hit, wound or save dice', () => {
    const s = world()
    put(s, 'B:brute', 0, 0)
    const { events, rng } = mortal(s, [], 'B:brute', 3)
    expect(rng.remaining).toEqual([])
    expect(of(events, 'DamagePoolResolved')[0].points).toBe(3)
  })

  it('DMG-003 Ward 5+, pool 4, dice [5,4,6,1]: two points are removed, two allocated', () => {
    const s = world(wardPatch('fx.brute', 5))
    put(s, 'B:brute', 0, 0)
    const { events } = mortal(s, [5, 4, 6, 1], 'B:brute', 4)
    const pool = of(events, 'DamagePoolResolved')[0]
    expect(pool.warded).toBe(2)
    expect(s.units['B:brute'].models.map((m) => s.models[m].woundsRemaining).sort()).toEqual([1, 3, 3])
  })

  it('DMG-004 Ward 6+ against 3 mortal damage rolls one ward die per point', () => {
    const s = world(wardPatch('fx.brute', 6))
    put(s, 'B:brute', 0, 0)
    const { events } = mortal(s, [1, 2, 3], 'B:brute', 3)
    expect(of(events, 'FeelNoPainRolled')).toHaveLength(3)
  })

  it('DMG-009 models removed to keep the unit coherent are slain too', () => {
    const s = world()
    put(s, 'B:guard', 0, 0, 0.3)
    // pull one guard far away: the unit is split, the culled lone model counts as slain
    const far = s.units['B:guard'].models[9]
    s.models[far].pos = { x: 10, y: 0, z: 9 }
    const { events } = mortal(s, [], 'B:guard', 1)
    expect(of(events, 'CoherencyCulled')).toHaveLength(1)
    expect(of(events, 'DamagePoolResolved')[0].slain).toBeGreaterThanOrEqual(2)
  })

  it('DMG-002 the active player\'s units resolve their pools first', () => {
    const s = world()
    put(s, 'B:brute', 0, 0); put(s, 'A:guard', 4, 4)
    const rng = new ScriptedRng([])
    const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:guard', overwatch: false, targets: [] })
    attackService.queueMortalWounds(ctx, 'B:brute', 1, 'x', false)
    attackService.queueMortalWounds(ctx, 'A:guard', 1, 'y', false)
    attackService.advance(ctx)
    expect(of(events, 'DamagePoolResolved').map((e) => e.unitId)).toEqual(['A:guard', 'B:brute'])
  })
})

// ---------- weapon abilities ----------
describe('aos attack: weapon abilities', () => {
  const axe = 'fx.w.brute-axe'
  const withAbilities = (id: string, abilities: DataBundle['weapons'][string]['abilities']) => (b: DataBundle) => { b.weapons[id].abilities = abilities }

  it('WEAP-002 Anti-charge adds 1 Rend only when the target charged this turn', () => {
    for (const charged of [true, false]) {
      const s = world(withAbilities(axe, [{ ability: 'ANTI', keyword: '@charged' }]))
      s.units['A:guard'].turn.chargedThisTurn = charged
      put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
      const { events } = run(s, [4, 3, 5], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 1)])
      expect(of(events, 'SaveRolled')[0].final).toBe(charged ? 3 : 4)
    }
  })

  it('WEAP-003 Anti-Hero and Anti-Infantry are cumulative against a Boss', () => {
    const s = world(withAbilities(axe, [{ ability: 'ANTI', keyword: 'HERO' }, { ability: 'ANTI', keyword: 'INFANTRY' }]))
    put(s, 'B:brute', -4, 0); put(s, 'A:boss', -4, 2)
    const { events } = run(s, [4, 3, 6], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:boss', 1)])
    expect(of(events, 'SaveRolled')[0].final).toBe(3) // 6 - (1 + 2)
  })

  it('WEAP-004 Charge (+1 Damage) applies only on the turn the attacker charged', () => {
    for (const charged of [true, false]) {
      const s = world(withAbilities('fx.w.knight-lance', [{ ability: 'CHARGE_DAMAGE' }]))
      s.units['A:knight'].turn.chargedThisTurn = charged
      put(s, 'A:knight', -4, 0); put(s, 'B:hawk', -4, 2)
      const { events } = run(s, [3, 4, 1], 'melee', 'A:knight', [tgt(s, 'A:knight#0', 'B:hawk', 1, 1)])
      expect(of(events, 'DamagePoolResolved')[0].points).toBe(charged ? 3 : 2)
    }
  })

  it('WEAP-007 Crit (2 Hits): a critical hit makes two wound rolls', () => {
    const s = world(withAbilities(axe, [{ ability: 'CRIT_2_HITS' }]))
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    const { events } = run(s, [6, 1, 1, 1, 1], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 1)])
    expect(of(events, 'WoundRolled')).toHaveLength(2)
  })

  it('WEAP-008 Crit (Auto-wound): a critical hit skips the wound roll but is saved normally', () => {
    const s = world(withAbilities(axe, [{ ability: 'CRIT_AUTO_WOUND' }]))
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    const { events, rng } = run(s, [6, 1], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 1)])
    expect(of(events, 'WoundRolled')).toHaveLength(0)
    expect(of(events, 'SaveRolled')).toHaveLength(1)
    expect(rng.remaining).toEqual([])
  })

  it('WEAP-009 Crit (Mortal): damage equal to the weapon\'s Damage, no wound or save, ward still rolled', () => {
    const s = world((b) => { withAbilities(axe, [{ ability: 'CRIT_MORTAL' }])(b); wardPatch('fx.guard', 5)(b) })
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    const { events, rng } = run(s, [6, 6, 1], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 1)])
    expect(of(events, 'WoundRolled')).toHaveLength(0)
    expect(of(events, 'SaveRolled')).toHaveLength(0)
    expect(of(events, 'FeelNoPainRolled')).toHaveLength(2)
    expect(of(events, 'DamagePoolResolved')[0]).toMatchObject({ points: 2, warded: 1 })
    expect(rng.remaining).toEqual([])
  })

  it('SHOOT-012 a critical hit survives a -1 modifier (unmodified 6 still crits)', () => {
    const s = world(withAbilities(axe, [{ ability: 'CRIT_AUTO_WOUND' }]))
    s.units['B:brute'].effects.push({ id: 'e1', sourceAbilityId: 'x', sourceUnitId: 'B:brute', effect: { modifyRoll: { roll: 'hit', value: -1 } }, scope: { who: 'self' }, expires: { kind: 'battle', round: 1, player: null }, when: null })
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    const { events } = run(s, [6, 1], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 1)])
    const hit = of(events, 'HitRolled')[0]
    expect(hit).toMatchObject({ die: 6, final: 5, hit: true, critical: true })
  })

  it('SHOOT-013 a 6 that fails after a -1 is not a critical hit', () => {
    const s = world((b) => { b.weapons[axe].skill = 6 })
    s.units['B:brute'].effects.push({ id: 'e1', sourceAbilityId: 'x', sourceUnitId: 'B:brute', effect: { modifyRoll: { roll: 'hit', value: -1 } }, scope: { who: 'self' }, expires: { kind: 'battle', round: 1, player: null }, when: null })
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    const { events } = run(s, [6], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 1)])
    expect(of(events, 'HitRolled')[0]).toMatchObject({ final: 5, hit: false, critical: false })
  })

  it('SHOOT-014 a +1 that lifts a 5 to 6 hits but is not critical', () => {
    const s = world(withAbilities(axe, [{ ability: 'CRIT_AUTO_WOUND' }]))
    s.units['B:brute'].effects.push({ id: 'e1', sourceAbilityId: 'x', sourceUnitId: 'B:brute', effect: { modifyRoll: { roll: 'hit', value: 1 } }, scope: { who: 'self' }, expires: { kind: 'battle', round: 1, player: null }, when: null })
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    const { events } = run(s, [5, 1, 1], 'melee', 'B:brute', [tgt(s, 'B:brute#0', 'A:guard', 1)])
    expect(of(events, 'HitRolled')[0]).toMatchObject({ die: 5, final: 6, hit: true, critical: false })
    expect(of(events, 'WoundRolled')).toHaveLength(1)
  })

  it('WEAP-005 Companion hooves ignore a friendly +1 to hit that the Knight\'s lance enjoys', () => {
    const s = world()
    s.units['A:knight'].effects.push({ id: 'e1', sourceAbilityId: 'x', sourceUnitId: 'A:knight', effect: { modifyRoll: { roll: 'hit', value: 1 } }, scope: { who: 'self' }, expires: { kind: 'battle', round: 1, player: null }, when: null })
    put(s, 'A:knight', -4, 0); put(s, 'B:hawk', -4, 2)
    // lance (hit 3+): die 2 + 1 = 3 hits, its wound die 1 fails; hooves (hit 5+): die 4 + 1 would hit, but Companion ignores the buff
    const { events } = run(s, [2, 1, 4], 'melee', 'A:knight', [tgt(s, 'A:knight#0', 'B:hawk', 1, 1), tgt(s, 'A:knight#0', 'B:hawk', 1, 2)])
    const hits = of(events, 'HitRolled')
    expect(hits).toHaveLength(2)
    expect(hits[0].hit).toBe(true)
    expect(hits[1].hit).toBe(false)
  })

  it('WEAP-012 random Attacks are rolled once per model: D3 on 3 models rolls 3 dice', () => {
    const s = world((b) => { b.weapons[axe].A = 'D3' })
    put(s, 'B:brute', -4, 0); put(s, 'A:guard', -4, 2)
    const targets = ['B:brute#0', 'B:brute#1', 'B:brute#2'].map((m) => tgt(s, m, 'A:guard', null))
    // attack dice 2,4,6 -> D3 = 1,2,3 (6 attacks), then 6 hit dice that all miss
    const { events, rng } = run(s, [2, 4, 6, 1, 1, 1, 1, 1, 1], 'melee', 'B:brute', targets)
    expect(of(events, 'DiceRolled').filter((e) => e.roll.purpose === 'attacks')).toHaveLength(3)
    expect(of(events, 'HitRolled')).toHaveLength(6)
    expect(rng.remaining).toEqual([])
  })
})

// ---------- Guarded Hero ----------
describe('aos attack: Guarded Hero', () => {
  it('SHOOT-021 a Hero within combat range of a friendly non-Hero is -1 to hit for shooting', () => {
    const s = world()
    put(s, 'A:cannon', 0, -6); put(s, 'B:boss', 0, 4); put(s, 'B:guard', 1, 4, 0.1)
    // cannon hits on 4+: die 4 - 1 = 3 misses
    const { events } = run(s, [4], 'ranged', 'A:cannon', [tgt(s, 'A:cannon#0', 'B:boss', 1)])
    expect(of(events, 'HitRolled')[0]).toMatchObject({ die: 4, final: 3, hit: false })
  })

  it('SHOOT-023 combat attacks and non-guarded Heroes are not affected', () => {
    const s = world()
    put(s, 'A:cannon', 0, -6); put(s, 'B:boss', 0, 4); put(s, 'B:guard', 8, 8)
    const { events } = run(s, [4, 1, 1], 'ranged', 'A:cannon', [tgt(s, 'A:cannon#0', 'B:boss', 1)])
    expect(of(events, 'HitRolled')[0]).toMatchObject({ final: 4, hit: true })
    const s2 = world()
    put(s2, 'A:guard', 0, 0); put(s2, 'B:boss', 0, 2); put(s2, 'B:guard', 1, 2, 0.1)
    const r2 = run(s2, [4, 1, 1], 'melee', 'A:guard', [tgt(s2, 'A:guard#0', 'B:boss', 1)])
    expect(of(r2.events, 'HitRolled')[0]).toMatchObject({ final: 4, hit: true })
  })
})
