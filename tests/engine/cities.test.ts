// WP7 (13-engine-port-plan §5): Cities of Sigmar Castelite Company code hooks, docs/spec/factions/cities-castelite-company.md.
// The descriptors, warscrolls and weapons are the real src/data/factions/cities files on top of the AoS fixture bundle; the only
// test-side patch is the declarative `effect` a gated passive needs when the data does not carry it yet (see PATCHES).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, isCoherent, basesOverlap, removeModel, unitModels,
  type AbilityWindow, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { objectiveService } from '../../src/engine/objectives'
import { weaponService } from '../../src/engine/weapons'
import type { AbilityDescriptor, DatasheetData, DataBundle, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/cities/abilities.json'
import enhancementsJson from '../../src/data/factions/cities/enhancements.json'
import weaponsJson from '../../src/data/factions/cities/weapons.json'
import factionJson from '../../src/data/factions/cities/faction.json'
import patrolJson from '../../src/data/factions/cities/patrols/castelite-company.json'
import marshalJson from '../../src/data/factions/cities/datasheets/freeguild-cavalier-marshal.json'
import cavaliersJson from '../../src/data/factions/cities/datasheets/freeguild-cavaliers.json'
import steelhelmsJson from '../../src/data/factions/cities/datasheets/freeguild-steelhelms.json'
import cannonJson from '../../src/data/factions/cities/datasheets/ironweld-great-cannon.json'

// ---------- fixtures ----------
// Descriptors a gated passive needs and the data does not carry: the code hook only gates the effect.
const PATCHES: Record<string, Partial<AbilityDescriptor>> = {
  'cities.ability.for-sigmar-charge': { effect: { fightsFirst: true } },
}

const bundle = (): DataBundle => withAosBundle((b) => {
  const abilities = abilitiesJson as unknown as AbilityDescriptor[]
  for (const a of abilities) b.abilities[a.id] = { ...a, ...(a.effect === undefined ? PATCHES[a.id] ?? {} : {}) }
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [marshalJson, cavaliersJson, steelhelmsJson, cannonJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.cities = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
})

const FLASK = 'cities.enh.flask-of-lethisian-darkwater'
const HEIRLOOM = 'cities.enh.heirloom-blade'

function game(enhancementId = HEIRLOOM, regimentAbilityId = 'cities.ability.for-sigmar-charge'): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId, regimentAbilityId }),
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
  const u = s.units[unitId]
  u.location = 'board'
  let cx = x
  for (const m of unitModels(s, unitId)) {
    const r = Math.max(m.base.radius, m.base.radius2 ?? 0)
    m.pos = { x: cx + r, y: 0, z }
    cx += 2 * r + 0.15
  }
}

const eventLog = new WeakMap<EngineContext, GameEvent[]>()
function ctxFor(s: GameState, dice: number[], services: Partial<typeof DEFAULT_MODULES.services> = {}): EngineContext {
  const { ctx, events } = createContext(s, new ScriptedRng(dice), { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, ...services } })
  eventLog.set(ctx, events)
  return ctx
}
const eventsOf = (ctx: EngineContext, type: GameEvent['type']): GameEvent[] => (eventLog.get(ctx) ?? []).filter((e) => e.type === type)

// drive abilityService.runWindow, answering each decision with `pick(topic, optionIds)` ('pass' passes); returns the decision topics seen
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

// use one ability once: pick the option containing `abilityId` (and `target` / `mode` when asked), then pass
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string } = {}): string[] {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    if (topic === 'abilityMode') return ids.find((id) => id.includes(opts.mode ?? '')) ?? ids[0]
    return 'pass'
  })
}

function mortalSpy() {
  const calls: { target: string; count: number; source: string }[] = []
  return { calls, attack: { ...attackService, queueMortalWounds: (_c: EngineContext, target: string, count: number, source: string) => { calls.push({ target, count, source }) } } }
}

// ---------- tests ----------
describe('registry', () => {
  it('CITIES-REG every code in the Cities data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('CITIES-P1 parked abilities can never be used', () => {
    const s = game()
    for (const code of ['citiesConsecrateTheLand', 'citiesIronweldDiscipline', 'citiesBrazier', 'citiesOfficersOrder']) {
      expect(codeHooks[code].activate!.canUse(s, 'A:marshal', {})).toBe(false)
    }
    // the regiment ability Ironweld Discipline shows up for no one, even in the enemy shooting phase
    const t = game('cities.enh.glimmering', 'cities.ability.ironweld-discipline')
    t.activePlayer = 'B'
    t.phase = 'shooting'
    expect(abilityService.usable(t, 'A', 'shooting')).toEqual([])
  })
})

describe('CITIES-RA-1 For Sigmar, Charge!', () => {
  it('CITIES-RA-1 Cavalry that charged this turn have Strike-first; others and uncharged Cavalry do not', () => {
    const s = game()
    const strikeFirst = (id: UnitId) => hookService.eligibilityFor!(s, id, 'fightFirst')
    expect(strikeFirst('A:cavaliers')).toBe(false)
    s.units['A:cavaliers'].turn.chargedThisTurn = true
    s.units['A:marshal'].turn.chargedThisTurn = true
    s.units['A:steelhelms-a'].turn.chargedThisTurn = true
    expect(strikeFirst('A:cavaliers')).toBe(true)
    expect(strikeFirst('A:marshal')).toBe(true)
    expect(strikeFirst('A:steelhelms-a')).toBe(false)
    // the enemy gets nothing from our regiment ability
    s.units['B:brute'].turn.chargedThisTurn = true
    expect(strikeFirst('B:brute')).toBe(false)
  })
})

describe('CITIES-AB-1 Decisive Commander', () => {
  function commanderGame() {
    const s = game()
    place(s, 'A:marshal', -6, -6)
    place(s, 'A:steelhelms-a', -6, -3)
    place(s, 'A:steelhelms-b', 8, -6) // more than 12" from the marshal
    place(s, 'B:boss', 8, 8)
    return s
  }

  it('CITIES-AB-1 Yield No Quarter: +3 control score on every contested marker until the owner\'s next turn', () => {
    const s = commanderGame()
    const ctx = ctxFor(s, [4]) // the declared D6: 4 beats 2+
    const topics = useOnce(ctx, 'hero', 'A', 'cities.ability.decisive-commander', { mode: 'yield' })
    // only steelhelms-a is wholly within 12", so the target is auto-picked; the mode is asked
    expect(topics).toEqual(['abilityUse', 'abilityMode'])
    expect(s.units['A:steelhelms-a'].effects).toHaveLength(1)
    expect(s.units['A:steelhelms-b'].effects).toHaveLength(0)
    expect(hookService.unitControlScore!(ctx, 'A:steelhelms-a', 'obj-c', 5)).toBe(8)
    expect(hookService.unitControlScore!(ctx, 'A:steelhelms-b', 'obj-c', 5)).toBe(5)
    expect(hookService.unitControlScore!(ctx, 'B:boss', 'obj-c', 2)).toBe(2)
    // gone at the start of the owner's next turn
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(s.units['A:steelhelms-a'].effects).toHaveLength(0)
    expect(hookService.unitControlScore!(ctx, 'A:steelhelms-a', 'obj-c', 5)).toBe(5)
  })

  it('CITIES-AB-1 Yield No Quarter changes who controls a marker (army total, CORE-17.4)', () => {
    const s = commanderGame()
    place(s, 'A:steelhelms-a', -2.5, -1) // five Steelhelms on the Centre marker
    place(s, 'B:boss', 0, 1.2) // an enemy Boss on the same marker
    const ctx = ctxFor(s, [4])
    const before = objectiveService.levelOfControl(s, 'obj-c', ctx)
    expect(before.A).toBeGreaterThan(0)
    expect(before.B).toBeGreaterThan(0)
    useOnce(ctx, 'hero', 'A', 'cities.ability.decisive-commander', { mode: 'yield' })
    const after = objectiveService.levelOfControl(s, 'obj-c', ctx)
    expect(after.A).toBe(before.A + 3)
    expect(after.B).toBe(before.B)
  })

  it('CITIES-AB-1 a roll of 1 does nothing but still uses the ability up', () => {
    const s = commanderGame()
    const ctx = ctxFor(s, [1])
    useOnce(ctx, 'hero', 'A', 'cities.ability.decisive-commander', { mode: 'yield' })
    expect(s.units['A:steelhelms-a'].effects).toHaveLength(0)
    expect(abilityService.usable(s, 'A', 'hero').some((u) => u.abilityId === 'cities.ability.decisive-commander')).toBe(false)
  })

  it('CITIES-AB-1 On Your Feet!: D3 slain models come back, one at a time, coherent and not overlapping', () => {
    const s = commanderGame()
    const slain = [...s.units['A:steelhelms-a'].models].slice(2)
    for (const id of slain) removeModel(s, id)
    expect(s.units['A:steelhelms-a'].models).toHaveLength(2)
    // declared D6 = 5, then the D3 for models: face 6 -> 3
    const ctx = ctxFor(s, [5, 6])
    useOnce(ctx, 'hero', 'A', 'cities.ability.decisive-commander', { mode: 'feet' })
    const unit = s.units['A:steelhelms-a']
    expect(unit.models).toHaveLength(5)
    const models = unitModels(s, 'A:steelhelms-a')
    expect(isCoherent(models)).toBe(true)
    for (let i = 0; i < models.length; i++) for (let j = i + 1; j < models.length; j++) expect(basesOverlap(models[i], models[j])).toBe(false)
    for (const m of models) expect(m.woundsRemaining).toBe(1)
    expect(unit.destroyedModels).toHaveLength(0)
    expect(eventsOf(ctx, 'ModelReturned')).toHaveLength(3)
  })

  it('CITIES-AB-1 On Your Feet! cannot be chosen for a unit that is in combat or has nobody to return', () => {
    const s = commanderGame()
    const hook = codeHooks.citiesDecisiveCommander.activate!
    const use = { targetUnitIds: ['A:steelhelms-a'], modeId: 'on-your-feet' }
    // nobody slain
    expect(hook.canUse(s, 'A:marshal', use)).toBe(false)
    removeModel(s, s.units['A:steelhelms-a'].models[0])
    expect(hook.canUse(s, 'A:marshal', use)).toBe(true)
    // an enemy within 3" puts the target in combat
    place(s, 'B:hawk', -6, -1.6)
    expect(hook.canUse(s, 'A:marshal', use)).toBe(false)
    // Yield No Quarter has no such limit
    expect(hook.canUse(s, 'A:marshal', { targetUnitIds: ['A:steelhelms-a'], modeId: 'yield-no-quarter' })).toBe(true)
  })

  it('CITIES-AB-1 is not offered when no Steelhelms unit is wholly within 12"', () => {
    const s = commanderGame()
    place(s, 'A:steelhelms-a', 6, -9)
    expect(abilityService.usable(s, 'A', 'hero').some((u) => u.abilityId === 'cities.ability.decisive-commander')).toBe(false)
  })
})

describe('CITIES-AB-3 Devastating Charge', () => {
  function chargeGame() {
    const s = game()
    place(s, 'A:cavaliers', -4, -2)
    place(s, 'B:brute', -4, -0.4)
    s.phase = 'charge'
    return s
  }

  it('CITIES-AB-3 on a 2+ the target in combat suffers D3 mortal damage', () => {
    const s = chargeGame()
    s.units['A:cavaliers'].turn.chargedThisTurn = true
    const spy = mortalSpy()
    const ctx = ctxFor(s, [2, 5], { attack: spy.attack as never }) // declared D6 2 (just enough), then D3 face 5 -> 3
    useOnce(ctx, 'charge', 'A', 'cities.ability.devastating-charge')
    expect(spy.calls).toEqual([{ target: 'B:brute', count: 3, source: 'cities.ability.devastating-charge' }])
  })

  it('CITIES-AB-3 a roll of 1 does nothing', () => {
    const s = chargeGame()
    s.units['A:cavaliers'].turn.chargedThisTurn = true
    const spy = mortalSpy()
    const ctx = ctxFor(s, [1], { attack: spy.attack as never })
    useOnce(ctx, 'charge', 'A', 'cities.ability.devastating-charge')
    expect(spy.calls).toEqual([])
  })

  it('CITIES-AB-3 needs a unit that charged and an enemy in combat with it', () => {
    const s = chargeGame()
    expect(abilityService.usable(s, 'A', 'charge')).toEqual([])
    s.units['A:cavaliers'].turn.chargedThisTurn = true
    expect(abilityService.usable(s, 'A', 'charge').map((u) => u.unitId)).toEqual(['A:cavaliers'])
    place(s, 'B:brute', 8, 8)
    expect(abilityService.usable(s, 'A', 'charge')).toEqual([])
  })
})

describe('CITIES-AB-4 Shot and Shell', () => {
  it('CITIES-AB-4 Cannonball is blocked after a Move ability this turn; Grapeshot never is', () => {
    const s = game()
    const cannon = s.units['A:cannon']
    const model = cannon.models[0]
    const ball = 'cities.weapon.great-cannon-cannonball'
    const grape = 'cities.weapon.great-cannon-grapeshot'
    expect(weaponService.isAvailable(s, model, ball)).toBe(true)
    for (const mt of ['normal', 'advance', 'fallBack'] as const) {
      cannon.turn.moveType = mt
      expect(weaponService.isAvailable(s, model, ball), mt).toBe(false)
      expect(weaponService.isAvailable(s, model, grape), mt).toBe(true)
    }
    cannon.turn.moveType = 'stationary'
    expect(weaponService.isAvailable(s, model, ball)).toBe(true)
    cannon.turn.chargedThisTurn = true // a charge is a Move ability too
    expect(weaponService.isAvailable(s, model, ball)).toBe(false)
  })

  it('CITIES-AB-4 both profiles share a profile group, so one is picked per activation', () => {
    const s = game()
    const groups = weaponService.profileGroups(s, s.models[s.units['A:cannon'].models[0]].weapons).map((g) => g.weaponIds)
    expect(groups.some((ids) => ids.includes('cities.weapon.great-cannon-cannonball') && ids.includes('cities.weapon.great-cannon-grapeshot'))).toBe(true)
  })
})

describe('Heirloom Blade', () => {
  it('Heirloom Blade: the general\'s Master-forged Longsword gets +1 Rend (1 -> 2); nothing else changes', () => {
    const s = game(HEIRLOOM)
    const model = s.units['A:marshal'].models[0]
    const sword = weaponService.effectiveWeapon(s, model, 'cities.weapon.master-forged-longsword')
    expect(s.weapons['cities.weapon.master-forged-longsword'].rend).toBe(1)
    expect(sword.rend).toBe(2)
    expect(sword.A).toBe(s.weapons['cities.weapon.master-forged-longsword'].A)
    // the Companion hooves and another unit's weapons are untouched
    expect(weaponService.effectiveWeapon(s, model, 'cities.weapon.warhorse-hooves').rend).toBe(0)
    expect(weaponService.effectiveWeapon(s, s.units['A:cavaliers'].models[0], 'cities.weapon.cavalier-weapon').rend).toBe(1)
  })

  it('Heirloom Blade is not applied when another enhancement was chosen', () => {
    const s = game(FLASK)
    expect(weaponService.effectiveWeapon(s, s.units['A:marshal'].models[0], 'cities.weapon.master-forged-longsword').rend).toBe(1)
  })
})

describe('Flask of Lethisian Darkwater', () => {
  it('Flask of Lethisian Darkwater: Heal (D6) the general at the start of any turn, once per battle', () => {
    const s = game(FLASK)
    const general = s.units['A:marshal']
    const model = s.models[general.models[0]]
    model.woundsRemaining = 2 // 7 Health, 5 damage
    s.phase = 'command'
    const ctx = ctxFor(s, [3]) // D6 = 3 heals 3
    useOnce(ctx, 'startOfTurn', 'A', 'cities.ability.flask-of-lethisian-darkwater')
    expect(model.woundsRemaining).toBe(5)
    // once per battle: not offered again, even on a later turn
    s.round = 2
    expect(abilityService.usable(s, 'A', 'startOfTurn')).toEqual([])
  })

  it('Flask of Lethisian Darkwater never heals above the general\'s Health and is not offered when undamaged', () => {
    const s = game(FLASK)
    expect(abilityService.usable(s, 'A', 'startOfTurn')).toEqual([])
    const model = s.models[s.units['A:marshal'].models[0]]
    model.woundsRemaining = 6
    const ctx = ctxFor(s, [6])
    useOnce(ctx, 'startOfTurn', 'A', 'cities.ability.flask-of-lethisian-darkwater')
    expect(model.woundsRemaining).toBe(7)
  })
})

