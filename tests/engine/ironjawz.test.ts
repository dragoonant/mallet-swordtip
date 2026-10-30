// WP7 (13-engine-port-plan §5): Ironjawz Bigmob code hooks, docs/spec/factions/ironjawz-bigmob.md.
// The descriptors, warscrolls and weapons are the real src/data/factions/ironjawz files on top of the AoS fixture bundle; the only
// test-side patch is the declarative `effect` a gated passive needs when the data does not carry it yet (see PATCHES).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, isCoherent, unitModels,
  type AbilityWindow, type AttackContext, type ChooseOptionDecision, type EngineContext, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { objectiveService } from '../../src/engine/objectives'
import { weaponService } from '../../src/engine/weapons'
import { enemiesInCombat, unitsWithin, whollyWithinUnit } from '../../src/engine/factions/aos-common'
import { applySlide, checkSlide, parseSlide, slideOptions } from '../../src/engine/factions/aos-moves'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/ironjawz/abilities.json'
import enhancementsJson from '../../src/data/factions/ironjawz/enhancements.json'
import weaponsJson from '../../src/data/factions/ironjawz/weapons.json'
import factionJson from '../../src/data/factions/ironjawz/faction.json'
import patrolJson from '../../src/data/factions/ironjawz/patrols/bigmob.json'
import ardboyzJson from '../../src/data/factions/ironjawz/datasheets/ardboyz.json'
import bruteRagerzJson from '../../src/data/factions/ironjawz/datasheets/brute-ragerz.json'
import brutesJson from '../../src/data/factions/ironjawz/datasheets/brutes.json'
import megabossJson from '../../src/data/factions/ironjawz/datasheets/megaboss.json'

// ---------- fixtures ----------
// Declarative effects the gated passives need and the data does not carry: the code hook only gates them.
const PATCHES: Record<string, Partial<AbilityDescriptor>> = {
  'ironjawz.ability.natural-disaster': { effect: { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } } },
  'ironjawz.ability.mega-bossy': { effect: { modifyRoll: { roll: 'charge', value: 1 } } },
  // setStat cannot hold a negative AP (DiceExpr), so "Rend 2" is +1 on the Megaboss's only melee weapon (Boss-choppa, Rend 1)
  'ironjawz.ability.amberbone-whetstone': { effect: { when: { weaponType: 'melee' }, modifyStat: { stat: 'AP', value: -1 } } },
}

const bundle = (): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = { ...a, ...(a.effect === undefined ? PATCHES[a.id] ?? {} : {}) }
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [megabossJson, ardboyzJson, bruteRagerzJson, brutesJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.ironjawz = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  // an enemy warscroll with Health 2 (the fixture Guard has 1, Brute 3, Hawk 4)
  b.datasheets['fx.twohealth'] = { ...structuredClone(b.datasheets['fx.guard']), id: 'fx.twohealth', name: 'Two Health', stats: { M: 5, W: 2, Sv: 4, OC: 1 } }
  b.patrols['fx.chaos.army'].units.push({ ref: 'twohealth', datasheet: 'fx.twohealth', size: 10 })
})

const AMBERBONE = 'ironjawz.enhancement.amberbone-whetstone'
const TROPHY = 'ironjawz.enhancement.trophy-skulls'
const GORK = 'ironjawz.enhancement.armour-of-gork'
const BOSSY = 'ironjawz.enhancement.mega-bossy'
const NATURAL = 'ironjawz.ability.natural-disaster'

function game(enhancementId = GORK, regimentAbilityId = NATURAL): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'ironjawz', patrolId: 'ironjawz.army.bigmob', enhancementId, regimentAbilityId }),
      B: makeAosPlayer('B'),
    },
  }, bundle())
  // bystanders go along the back edges, two rows each, clear of the middle where the tests work
  for (const p of ['A', 'B'] as const) {
    const sign = p === 'A' ? -1 : 1
    let x = -14.5, row = 0
    for (const u of Object.values(s.units).filter((u) => u.player === p)) {
      const width = u.models.length * (2 * Math.max(...unitModels(s, u.id).map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0))) + 0.15)
      if (x + width > 14.5) { x = -14.5; row = 1 }
      place(s, u.id, x, sign * (10.8 - 1.9 * row))
      x += width + 0.3
    }
  }
  s.round = 1
  s.phase = 'command'
  s.activePlayer = 'A'
  return s
}

// lay a unit's models in a row along x starting at (x, z); bases never overlap
function place(s: GameState, unitId: UnitId, x: number, z: number): void {
  s.units[unitId].location = 'board'
  let cx = x
  for (const m of unitModels(s, unitId)) {
    const r = Math.max(m.base.radius, m.base.radius2 ?? 0)
    m.pos = { x: cx + r, y: 0, z }
    cx += 2 * r + 0.15
  }
}

function ctxFor(s: GameState, dice: number[], services: Partial<typeof DEFAULT_MODULES.services> = {}): EngineContext {
  return createContext(s, new ScriptedRng(dice), { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, ...services } }).ctx
}

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: (topic: string, ids: string[]) => string): string[] {
  const topics: string[] = []
  for (let i = 0; i < 20; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return topics
    const p = ctx.state.pending as ChooseOptionDecision
    topics.push(p.context.topic)
    const choice = pick(p.context.topic, p.options.map((o) => o.id))
    ctx.state.pending = null
    const action = choice === 'pass' ? { type: 'pass' as const, player, decisionId: p.id } : { type: 'chooseOption' as const, player, decisionId: p.id, optionId: choice }
    const rej = abilityService.handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string } = {}): string[] {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    return ids[0]
  })
}

function mortalSpy() {
  const calls: { target: string; count: number; source: string }[] = []
  return { calls, attack: { ...attackService, queueMortalWounds: (_c: EngineContext, target: string, count: number, source: string) => { calls.push({ target, count, source }) } } }
}

const weapon = (s: GameState, unitId: UnitId, weaponId: string) => weaponService.effectiveWeapon(s, s.units[unitId].models[0], weaponId)
const CHOPPA = 'ironjawz.weapon.choppa-or-stikka'
const RAGER = 'ironjawz.weapon.rager-weapons'
const BOSS = 'ironjawz.weapon.boss-choppa'

// ---------- tests ----------
describe('registry', () => {
  it('IJZ-REG every code in the Ironjawz data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('IJZ-3.2 the Ruckus data timing is a reaction, so the loop never offers it on its own', () => {
    const s = game(GORK, 'ironjawz.ability.a-proper-ruckus')
    expect(abilityService.usable(s, 'A', 'hero').map((u) => u.abilityId)).not.toContain('ironjawz.ability.a-proper-ruckus')
    expect(codeHooks.ironjawzProperRuckus.activate!.canUse(s, null, {})).toBe(false)
  })
})

describe('IJZ-E shipped data', () => {
  it('IJZ-3.1 IJZ-4.1 IJZ-4.4 the gated passives carry their effect in the shipped data (the code hooks only gate it)', () => {
    const byId = (id: string) => (abilitiesJson as unknown as AbilityDescriptor[]).find((a) => a.id === id)
    expect(byId('ironjawz.ability.natural-disaster')?.effect).toEqual(PATCHES['ironjawz.ability.natural-disaster'].effect)
    expect(byId('ironjawz.ability.mega-bossy')?.effect).toEqual(PATCHES['ironjawz.ability.mega-bossy'].effect)
    expect(byId('ironjawz.ability.amberbone-whetstone')?.effect).toEqual(PATCHES['ironjawz.ability.amberbone-whetstone'].effect)
  })
})

describe('IJZ-3.1 Natural Disaster', () => {
  it('IJZ-3.1 an unmodified charge roll of 8+ gives the unit +1 Attacks on its melee weapons for the rest of the turn', () => {
    const s = game()
    const base = s.weapons[CHOPPA].A as number
    s.units['A:ardboyz-1'].turn.chargeRollUnmodified = 9
    expect(weapon(s, 'A:ardboyz-1', CHOPPA).A).toBe(base + 1)
    s.units['A:ardboyz-1'].turn.chargeRollUnmodified = 8
    expect(weapon(s, 'A:ardboyz-1', CHOPPA).A).toBe(base + 1)
    s.units['A:ardboyz-1'].turn.chargeRollUnmodified = 7
    expect(weapon(s, 'A:ardboyz-1', CHOPPA).A).toBe(base)
    s.units['A:ardboyz-1'].turn.chargeRollUnmodified = null
    expect(weapon(s, 'A:ardboyz-1', CHOPPA).A).toBe(base)
  })

  it('IJZ-3.1 only the unit that rolled gets it, and the enemy never does', () => {
    const s = game()
    s.units['A:ardboyz-1'].turn.chargeRollUnmodified = 11
    expect(weapon(s, 'A:ardboyz-2', CHOPPA).A).toBe(s.weapons[CHOPPA].A)
    s.units['B:brute'].turn.chargeRollUnmodified = 11
    expect(weaponService.effectiveWeapon(s, s.units['B:brute'].models[0], 'fx.w.brute-axe').A).toBe(3)
  })

  it('IJZ-3.1 is not applied when the other regiment ability was chosen', () => {
    const s = game(GORK, 'ironjawz.ability.a-proper-ruckus')
    s.units['A:ardboyz-1'].turn.chargeRollUnmodified = 12
    expect(weapon(s, 'A:ardboyz-1', CHOPPA).A).toBe(s.weapons[CHOPPA].A)
  })
})

describe('IJZ-4 enhancements', () => {
  it('IJZ-4.1 Amberbone Whetstone sets the general\'s melee Rend to 2 (not +2); other units keep theirs', () => {
    const s = game(AMBERBONE)
    expect(s.weapons[BOSS].rend).toBe(1)
    expect(weapon(s, 'A:megaboss', BOSS).rend).toBe(2)
    expect(weapon(s, 'A:ardboyz-1', CHOPPA).rend).toBe(s.weapons[CHOPPA].rend)
    expect(weapon(s, 'A:brute-ragerz', RAGER).rend).toBe(s.weapons[RAGER].rend)
  })

  it('IJZ-4.1 it is not applied when another enhancement was chosen', () => {
    const s = game(TROPHY)
    expect(weapon(s, 'A:megaboss', BOSS).rend).toBe(1)
  })

  it('IJZ-4.2 Trophy Skulls sets the general\'s Control to 5 (set, not added)', () => {
    const s = game(TROPHY)
    const q = (unitId: UnitId) => hookService.statFor(s, { unitId, modelId: s.units[unitId].models[0], weapon: null, stat: 'OC' }, s.datasheets[s.units[unitId].datasheetId].stats.OC)
    expect(s.datasheets['ironjawz.unit.megaboss'].stats.OC).toBe(2)
    expect(q('A:megaboss')).toBe(5)
    expect(q('A:ardboyz-1')).toBe(1)
    // without the enhancement the general keeps its printed Control
    const plain = game(GORK)
    expect(hookService.statFor(plain, { unitId: 'A:megaboss', modelId: plain.units['A:megaboss'].models[0], weapon: null, stat: 'OC' }, 2)).toBe(2)
  })

  it('IJZ-4.3 Armour of Gork gives the general Ward (6+) and nobody else', () => {
    const s = game(GORK)
    const ctx = ctxFor(s, [3, 3])
    const wardFor = (targetUnitId: UnitId): number[] => {
      const attacker = s.units['B:brute']
      const attack: AttackContext = {
        kind: 'melee', overwatch: false, attackerUnitId: attacker.id, attackerModelId: attacker.models[0], weapon: s.weapons['fx.w.brute-axe'],
        targetUnitId, targetModelId: s.units[targetUnitId].models[0], range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true,
      }
      const roll = ctx.roll({ purpose: 'fnp', player: 'A', unitId: targetUnitId })
      return hookService.collect(ctx, 'onFeelNoPainRoll', { attack, roll: { purpose: 'fnp', roll, dieIndex: 0, unmodified: roll.dice[0], rerolled: false }, mortal: false })
        .flatMap((r) => (r.result.kind === 'roll' && r.result.feelNoPain !== undefined ? [r.result.feelNoPain] : []))
    }
    expect(wardFor('A:megaboss')).toEqual([6])
    expect(wardFor('A:ardboyz-1')).toEqual([])
  })

  describe('IJZ-4.4 Mega-bossy', () => {
    const chargeBonus = (s: GameState, chargingUnitId: UnitId): number => {
      const ctx = ctxFor(s, [3, 4])
      const roll = ctx.roll({ purpose: 'charge', player: s.units[chargingUnitId].player, count: 2, mode: 'sum', unitId: chargingUnitId })
      return hookService.collect(ctx, 'onChargeRoll', { chargingUnitId, targetUnitIds: ['B:brute'], roll: { purpose: 'charge', roll, dieIndex: 0, unmodified: 7, rerolled: false } })
        .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
    }
    const setup = () => {
      const s = game(BOSSY)
      place(s, 'A:megaboss', -12, -4)
      place(s, 'A:ardboyz-1', -8, -4) // all five models wholly within 12" of the general
      place(s, 'A:brute-ragerz', 6, -4) // far away
      return s
    }

    it('IJZ-4.4 once the general has charged, friendly units wholly within 12" add 1 to their charge rolls', () => {
      const s = setup()
      s.units['A:megaboss'].turn.chargedThisTurn = true
      expect(chargeBonus(s, 'A:ardboyz-1')).toBe(1)
      expect(chargeBonus(s, 'A:brute-ragerz')).toBe(0)
    })

    it('IJZ-4.4 gives nothing before the general charged, to enemies, or to units only partly within 12"', () => {
      const s = setup()
      expect(chargeBonus(s, 'A:ardboyz-1')).toBe(0)
      s.units['A:megaboss'].turn.chargedThisTurn = true
      s.units['B:brute'].turn.chargedThisTurn = true
      place(s, 'B:brute', -6, 4)
      expect(chargeBonus(s, 'B:brute')).toBe(0)
      // first model well inside 12", last model beyond it
      place(s, 'A:ardboyz-1', -3, -4)
      expect(unitsWithin(s, 'A:ardboyz-1', 'A:megaboss', 12)).toBe(true)
      expect(whollyWithinUnit(s, 'A:ardboyz-1', 'A:megaboss', 12)).toBe(false)
      expect(chargeBonus(s, 'A:ardboyz-1')).toBe(0)
    })
  })
})

describe('IJZ-5.1.1 Get Stuck In, Ladz!', () => {
  function bossGame() {
    const s = game()
    place(s, 'A:megaboss', -6, -6)
    place(s, 'A:brute-ragerz', -6, -3) // a BRUTE wholly within 12"
    place(s, 'A:brutes', 6, -6) // a BRUTE, too far
    place(s, 'A:ardboyz-1', -6, 0) // not a BRUTE
    return s
  }

  it('IJZ-5.1.1 on a 2+ the picked Brute unit gets +1 Attacks on melee weapons until the owner\'s next turn', () => {
    const s = bossGame()
    const base = s.weapons[RAGER].A as number
    const ctx = ctxFor(s, [2])
    const topics = useOnce(ctx, 'hero', 'A', 'ironjawz.ability.get-stuck-in-ladz', { target: 'A:brute-ragerz' })
    // this unit and the near Brutes are the only targets
    // (the loop then offers Mighty Destroyers, which this test passes on)
    expect(topics).toEqual(['abilityUse', 'abilityTarget', 'abilityUse'])
    expect(weapon(s, 'A:brute-ragerz', RAGER).A).toBe(base + 1)
    expect(weapon(s, 'A:megaboss', BOSS).A).toBe(s.weapons[BOSS].A)
    expect(weapon(s, 'A:ardboyz-1', CHOPPA).A).toBe(s.weapons[CHOPPA].A)
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(weapon(s, 'A:brute-ragerz', RAGER).A).toBe(base)
  })

  it('IJZ-5.1.1 may pick the general itself; a roll of 1 does nothing', () => {
    const s = bossGame()
    const ctx = ctxFor(s, [5])
    useOnce(ctx, 'hero', 'A', 'ironjawz.ability.get-stuck-in-ladz', { target: 'A:megaboss' })
    expect(weapon(s, 'A:megaboss', BOSS).A).toBe((s.weapons[BOSS].A as number) + 1)
    const t = bossGame()
    useOnce(ctxFor(t, [1]), 'hero', 'A', 'ironjawz.ability.get-stuck-in-ladz', { target: 'A:megaboss' })
    expect(weapon(t, 'A:megaboss', BOSS).A).toBe(t.weapons[BOSS].A)
  })

  it('IJZ-5.1.1 stacks with Natural Disaster for up to +2 Attacks (IJZ-E8)', () => {
    const s = bossGame()
    const base = s.weapons[RAGER].A as number
    useOnce(ctxFor(s, [4]), 'hero', 'A', 'ironjawz.ability.get-stuck-in-ladz', { target: 'A:brute-ragerz' })
    s.units['A:brute-ragerz'].turn.chargeRollUnmodified = 10
    expect(weapon(s, 'A:brute-ragerz', RAGER).A).toBe(base + 2)
  })

  it('IJZ-5.1.1 targets no Brute that is not wholly within 12"', () => {
    const s = bossGame()
    place(s, 'A:brute-ragerz', 4, -6)
    expect(codeHooks.ironjawzGetStuckIn.activate!.targets!(s, 'A:megaboss')).toEqual(['A:megaboss'])
  })
})

describe('IJZ-5.2.1 Shield Bash', () => {
  // five Ardboyz around one enemy Hawk; edge gaps to the Hawk: 0.1, 1.2, 2.9, 3.5, 5.0 -> three models within 3", one within 1"
  function bashGame(firstGap = 0.1) {
    const s = game()
    place(s, 'B:hawk', 0, 0)
    const hawk = s.models[s.units['B:hawk'].models[0]]
    const reach = hawk.base.radius + s.models[s.units['A:ardboyz-1'].models[0]].base.radius
    s.units['A:ardboyz-1'].location = 'board'
    ;[firstGap, 1.2, 2.9, 3.5, 5.0].forEach((gap, k) => {
      const m = s.models[s.units['A:ardboyz-1'].models[k]]
      const d = reach + gap
      m.pos = { x: hawk.pos.x + d * Math.cos(k * 0.9), y: 0, z: hawk.pos.z + d * Math.sin(k * 0.9) }
    })
    s.phase = 'fight'
    return s
  }

  it('IJZ-5.2.1 rolls a die per model within 3" of the target and each 6 is 1 mortal damage', () => {
    const s = bashGame()
    const spy = mortalSpy()
    const ctx = ctxFor(s, [6, 3, 6], { attack: spy.attack as never }) // exactly three dice
    useOnce(ctx, 'fight', 'A', 'ironjawz.ability.shield-bash')
    expect(spy.calls).toEqual([{ target: 'B:hawk', count: 2, source: 'ironjawz.ability.shield-bash' }])
    expect(ctx.rng).toBeInstanceOf(ScriptedRng)
    expect((ctx.rng as ScriptedRng).remaining).toEqual([])
  })

  it('IJZ-5.2.1 with no 6s nothing happens', () => {
    const s = bashGame()
    const spy = mortalSpy()
    useOnce(ctxFor(s, [5, 1, 2], { attack: spy.attack as never }), 'fight', 'A', 'ironjawz.ability.shield-bash')
    expect(spy.calls).toEqual([])
  })

  it('IJZ-5.2.1 may be used by the enemy in the same combat phase (any combat phase) and needs an enemy within 1"', () => {
    const s = bashGame(1.5) // nearest gap is 1.2", beyond the 1" the ability needs
    expect(abilityService.usable(s, 'A', 'fight')).toEqual([])
    const t = bashGame()
    expect(abilityService.usable(t, 'A', 'fight').map((u) => u.unitId)).toEqual(['A:ardboyz-1'])
    t.activePlayer = 'B'
    expect(abilityService.usable(t, 'A', 'fight').map((u) => u.unitId)).toEqual(['A:ardboyz-1'])
  })
})

describe('IJZ-5.3.1 Unleashed Rage', () => {
  it('IJZ-5.3.1 a Brute Ragerz unit that charged this turn has Strike-first; otherwise not', () => {
    const s = game()
    const strikeFirst = (id: UnitId) => hookService.eligibilityFor!(s, id, 'fightFirst')
    expect(strikeFirst('A:brute-ragerz')).toBe(false)
    s.units['A:brute-ragerz'].turn.chargedThisTurn = true
    expect(strikeFirst('A:brute-ragerz')).toBe(true)
    // the rule is on the Ragerz warscroll only
    s.units['A:ardboyz-1'].turn.chargedThisTurn = true
    s.units['A:brutes'].turn.chargedThisTurn = true
    expect(strikeFirst('A:ardboyz-1')).toBe(false)
    expect(strikeFirst('A:brutes')).toBe(false)
  })
})

describe('IJZ-5.4.1 You Messin', () => {
  // the Brutes stand next to the Centre marker; the enemy under test is laid next to them
  function messinGame() {
    const s = game()
    place(s, 'A:brutes', -2.5, 1.8)
    return s
  }
  const contest = (s: GameState, u: UnitId) => hookService.contestAllowed!(s, u)

  it('IJZ-5.4.1 an enemy unit with Health 1 or 2 in combat with the Brutes cannot contest objectives', () => {
    const s = messinGame()
    place(s, 'B:guard', -4, -0.4) // Health 1
    place(s, 'B:twohealth', 3, -0.4) // Health 2
    expect(contest(s, 'B:guard')).toBe(false)
    expect(contest(s, 'B:twohealth')).toBe(false)
  })

  it('IJZ-5.4.1 stronger enemies, enemies out of combat, enemies fighting someone else and our own units are unaffected', () => {
    const s = messinGame()
    place(s, 'B:brute', -4, -0.4) // Health 3
    place(s, 'B:hawk', 4, 0) // Health 4
    expect(contest(s, 'B:brute')).toBe(true)
    expect(contest(s, 'B:hawk')).toBe(true)
    place(s, 'B:guard', -4, -8) // Health 1 but far away
    expect(contest(s, 'B:guard')).toBe(true)
    expect(contest(s, 'A:brutes')).toBe(true)
    expect(contest(s, 'A:ardboyz-1')).toBe(true)
    // a Health 1 enemy fighting the Ardboyz instead of the Brutes
    const t = game()
    place(t, 'A:brutes', 8, 8)
    place(t, 'A:ardboyz-1', -4, -2.4)
    place(t, 'B:guard', -4, -0.4)
    expect(contest(t, 'B:guard')).toBe(true)
  })

  it('IJZ-5.4.1 the objective count drops the stopped unit; a stronger unit in the same spot still contests', () => {
    const s = messinGame()
    place(s, 'B:guard', -4, -0.4) // on the Centre marker, in combat with the Brutes
    const stopped = objectiveService.levelOfControl(s, 'obj-c', ctxFor(s, []))
    expect(stopped.B).toBe(0)
    expect(stopped.A).toBeGreaterThan(0)
    place(s, 'B:guard', -4, -8)
    place(s, 'B:brute', -4, -0.4)
    expect(objectiveService.levelOfControl(s, 'obj-c', ctxFor(s, [])).B).toBeGreaterThan(0)
  })

  it('IJZ-5.4.1 only counts while the Brutes are on the battlefield', () => {
    const s = messinGame()
    place(s, 'B:guard', -4, -0.4)
    s.units['A:brutes'].location = 'reserves'
    expect(contest(s, 'B:guard')).toBe(true)
  })
})

// ---------- L1: Mighty Destroyers and A Proper Ruckus ----------
describe('IJZ-2.2 Mighty Destroyers', () => {
  const MD = 'ironjawz.ability.mighty-destroyers'
  const RUCKUS = 'ironjawz.ability.a-proper-ruckus'

  function mdGame(regiment = NATURAL) {
    const s = game(GORK, regiment)
    place(s, 'A:ardboyz-1', -6, -4)
    place(s, 'B:brute', 8, 8)
    return s
  }

  // answer the loop: use Mighty Destroyers on `target`, pick `mode` when asked, answer each move with `move(optionIds, unitId)`
  function useMd(ctx: EngineContext, opts: { target?: string; mode?: string; move?: (ids: string[], unit: string | null) => string }) {
    const log: { topic: string; ids: string[]; unit: string | null }[] = []
    let used = false
    const pick = (topic: string, ids: string[]): string => {
      const unit = (ctx.state.pending as ChooseOptionDecision).context.unitId
      log.push({ topic, ids, unit })
      if (topic === 'abilityUse') { const hit = used ? undefined : ids.find((id) => id.startsWith(MD)); used = true; return hit ?? 'pass' }
      if (topic === 'abilityTarget') return opts.target ?? ids[0]
      if (ids.some((id) => id.startsWith('mv:'))) return opts.move ? opts.move(ids, unit) : ids[0]
      return opts.mode ? ids.find((id) => id === opts.mode) ?? ids[0] : ids[0]
    }
    runWindow(ctx, 'hero', 'A', pick)
    return log
  }

  it('IJZ-2.2 the picked unit may slide up to 3" and the move is reported as an ability move', () => {
    const s = mdGame()
    const ctx = ctxFor(s, [])
    const before = unitModels(s, 'A:ardboyz-1').map((m) => ({ ...m.pos }))
    const log = useMd(ctx, { target: 'A:ardboyz-1', move: (ids) => ids.find((id) => id.startsWith('mv:') && id !== 'mv:0:0') as string })
    expect(log.map((l) => l.topic)).toEqual(['abilityUse', 'abilityTarget', 'abilityMode', 'abilityUse'])
    const after = unitModels(s, 'A:ardboyz-1').map((m) => m.pos)
    const d = Math.hypot(after[0].x - before[0].x, after[0].z - before[0].z)
    expect(d).toBeGreaterThan(0.5)
    expect(d).toBeLessThanOrEqual(3 + 1e-3)
    for (let i = 0; i < after.length; i++) expect(Math.hypot(after[i].x - before[i].x, after[i].z - before[i].z)).toBeCloseTo(d, 2)
    expect(isCoherent(unitModels(s, 'A:ardboyz-1'))).toBe(true)
  })

  it('IJZ-2.2 once per turn: the army cannot use it twice, and it is offered again next turn', () => {
    const s = mdGame()
    const ctx = ctxFor(s, [])
    useMd(ctx, { target: 'A:ardboyz-1' })
    expect(abilityService.usable(s, 'A', 'hero').some((u) => u.abilityId === MD)).toBe(false)
    s.round = 2
    expect(abilityService.usable(s, 'A', 'hero').some((u) => u.abilityId === MD)).toBe(true)
  })

  it('IJZ-2.2 a unit set up this turn is not a legal target', () => {
    const s = mdGame()
    s.units['A:ardboyz-1'].setUpTurn = { round: s.round, player: s.activePlayer }
    s.units['A:ardboyz-2'].turn.arrivedThisTurn = true
    const targets = (codeHooks.ironjawzMightyDestroyers.activate!.targets as (st: GameState, u: null, p: PlayerId) => UnitId[])(s, null, 'A')
    expect(targets).not.toContain('A:ardboyz-1')
    expect(targets).not.toContain('A:ardboyz-2')
    expect(targets).toContain('A:brutes')
  })

  it('IJZ-2.2 the move may end in combat; a unit that starts in combat must end in combat', () => {
    const s = mdGame()
    // an enemy 6" away: one slide of 3" cannot reach combat range (3"), two would; right at 4" it can
    place(s, 'B:brute', -6, -4 + 1.2 + 4.5)
    const opts = (id: string) => slideOptions(s, id, 3)
    const free = opts('A:ardboyz-1')
    expect(free.some((o) => o.label.includes('into combat'))).toBe(true)
    // now start in combat: every offered slide (except staying put) keeps the unit in combat
    place(s, 'B:brute', -6, -4 + 1.2 + 1.5)
    expect(enemiesInCombat(s, 'A:ardboyz-1').length).toBeGreaterThan(0)
    const ctx = ctxFor(s, [])
    for (const o of opts('A:ardboyz-1').filter((x) => x.id !== 'mv:0:0')) {
      const t = structuredClone(s)
      const slide = parseSlide(o.id)!
      expect(applySlide(createContext(t, new ScriptedRng([]), DEFAULT_MODULES).ctx, 'A:ardboyz-1', slide.dx, slide.dz, 3), o.label).toBe(true)
      expect(enemiesInCombat(t, 'A:ardboyz-1').length, o.label).toBeGreaterThan(0)
    }
    // and a retreat out of combat is refused
    const away = checkSlide(s, 'A:ardboyz-1', 0, -3, 3, true)
    expect(away.ok).toBe(false)
    void ctx
  })

  it('IJZ-2.2 a slide never leaves coherency, overlaps a model or exceeds 3"', () => {
    const s = mdGame()
    expect(checkSlide(s, 'A:ardboyz-1', 3.5, 0, 3, false).ok).toBe(false)
    place(s, 'A:ardboyz-2', -6, -2.4) // a unit right in the way
    const blocked = checkSlide(s, 'A:ardboyz-1', 0, 1.2, 3, false)
    expect(blocked.ok).toBe(false)
    expect(checkSlide(s, 'A:ardboyz-1', 1, 0, 3, false).ok).toBe(true)
  })

  it('IJZ-2.2 is usable in the opponent\'s hero phase too (Any Hero Phase)', () => {
    const s = mdGame()
    s.activePlayer = 'B'
    expect(abilityService.usable(s, 'A', 'hero').some((u) => u.abilityId === MD)).toBe(true)
  })

  describe('IJZ-3.2 A Proper Ruckus', () => {
    it('IJZ-3.2 only offered as a mode while the regiment ability is picked and unspent', () => {
      const plain = mdGame(NATURAL)
      const log = useMd(ctxFor(plain, []), { target: 'A:ardboyz-1' })
      expect(log.some((l) => l.ids.includes('ruckus'))).toBe(false)
      const s = mdGame(RUCKUS)
      const log2 = useMd(ctxFor(s, []), { target: 'A:ardboyz-1', mode: 'single' })
      expect(log2.some((l) => l.ids.includes('ruckus'))).toBe(true)
    })

    it('IJZ-3.2 every friendly unit not set up this turn gets its own move, once per battle', () => {
      const s = mdGame(RUCKUS)
      s.units['A:brutes'].setUpTurn = { round: s.round, player: s.activePlayer } // just arrived: left out
      const ctx = ctxFor(s, [])
      const moved: string[] = []
      const log = useMd(ctx, { target: 'A:ardboyz-1', mode: 'ruckus', move: (ids, unit) => { moved.push(unit as string); return ids[0] } })
      const eligible = Object.values(s.units).filter((u) => u.player === 'A' && u.location === 'board' && u.id !== 'A:brutes').map((u) => u.id)
      expect(moved[0]).toBe('A:ardboyz-1')
      expect(new Set(moved).size).toBe(moved.length)
      expect(moved).not.toContain('A:brutes')
      for (const id of moved) expect(eligible).toContain(id)
      expect(moved.length).toBeGreaterThan(1)
      expect(log.filter((l) => l.topic === 'abilityMode').length).toBe(moved.length + 1) // the mode question + one per unit
      // spent for the battle
      s.round = 2
      const again = useMd(ctxFor(s, []), { target: 'A:ardboyz-1' })
      expect(again.some((l) => l.ids.includes('ruckus'))).toBe(false)
    })

    it('IJZ-3.2 passing on a unit leaves it where it is', () => {
      const s = mdGame(RUCKUS)
      const where = unitModels(s, 'A:ardboyz-1').map((m) => ({ ...m.pos }))
      useMd(ctxFor(s, []), { target: 'A:ardboyz-1', mode: 'ruckus', move: () => 'mv:0:0' })
      expect(unitModels(s, 'A:ardboyz-1').map((m) => ({ ...m.pos }))).toEqual(where)
    })
  })
})
