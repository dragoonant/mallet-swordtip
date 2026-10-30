// WP7 (13-engine-port-plan §5): Cities of Sigmar Castelite Company code hooks, docs/spec/factions/cities-castelite-company.md.
// The descriptors, warscrolls and weapons are the real src/data/factions/cities files on top of the AoS fixture bundle; the only
// test-side patch is the declarative `effect` a gated passive needs when the data does not carry it yet (see PATCHES).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, isCoherent, basesOverlap, removeModel, unitModels,
  type AbilityWindow, type AttackContext, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { distance, whollyWithinPolygon } from '../../src/engine/geometry'
import { reinforcementFormation } from '../../src/engine/factions/aos-moves'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { objectiveService } from '../../src/engine/objectives'
import { weaponService } from '../../src/engine/weapons'
import { officersOrderCard } from '../../src/engine/cards'
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

})

describe("CITIES-BT-1 The Officer's Order", () => {
  const withHand = (s: GameState, ids: string[]): void => {
    const piles = (hand: string[]) => ({ deck: [], hand, discard: [], scored: [] })
    s.cards = { tactics: { A: piles(ids), B: piles([]) } } as unknown as GameState['cards']
  }

  it("CITIES-BT-1 needs a battle tactic card in hand and is offered once at the start of the battle round", () => {
    const s = game()
    expect(codeHooks.citiesOfficersOrder.activate!.canUse(s, null, { player: 'A' })).toBe(false)
    withHand(s, ['card.tactic.raid', 'card.tactic.hold-ground'])
    expect(codeHooks.citiesOfficersOrder.activate!.canUse(s, null, { player: 'A' })).toBe(true)
    const ctx = ctxFor(s, [])
    const topics = useOnce(ctx, 'startOfRound', 'A', 'cities.ability.the-officers-order', { mode: 'hold-ground' })
    expect(topics).toContain('abilityMode')
    expect(officersOrderCard(s, 'A')).toBe('card.tactic.hold-ground')
    // the announcement does not name the card
    const ann = eventsOf(ctx, 'AbilityTriggered').map((e) => (e as { summary: string }).summary).join(' ')
    expect(ann).not.toContain('Hold')
    // once per battle round, and never while a card is already set aside
    expect(abilityService.usable(s, 'A', 'startOfRound').some((u) => u.abilityId === 'cities.ability.the-officers-order')).toBe(false)
  })
})

describe('CITIES-RA-1 For Sigmar, Charge!', () => {
  it('CITIES-RA-1 the shipped data carries the Strike-first effect the code hook gates', () => {
    const a = (abilitiesJson as unknown as AbilityDescriptor[]).find((x) => x.id === 'cities.ability.for-sigmar-charge')
    expect(a?.effect).toEqual({ fightsFirst: true })
  })

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


// ---------- L1: the P1 abilities ----------
describe('Brazier of Holy Flame', () => {
  const BRAZIER = 'cities.enh.brazier-of-holy-flame'
  function brazierGame() {
    const s = game(BRAZIER)
    place(s, 'A:marshal', -6, -6)
    place(s, 'A:steelhelms-a', -6, -3.2) // within the general's combat range (3")
    place(s, 'A:steelhelms-b', 8, -6) // too far
    for (const id of [...s.units['A:steelhelms-a'].models].slice(2)) removeModel(s, id)
    for (const id of [...s.units['A:steelhelms-b'].models].slice(2)) removeModel(s, id)
    return s
  }

  it('CITIES-BRAZIER at the end of any turn up to D3 slain models return to the Steelhelms within 3" of the general', () => {
    const s = brazierGame()
    const ctx = ctxFor(s, [6]) // D3 face 6 -> 3
    const topics = useOnce(ctx, 'endOfTurn', 'A', 'cities.ability.brazier-of-holy-flame')
    expect(topics).toEqual(['abilityUse']) // the only target is picked for us
    expect(s.units['A:steelhelms-a'].models).toHaveLength(5)
    expect(s.units['A:steelhelms-b'].models).toHaveLength(2)
    expect(isCoherent(unitModels(s, 'A:steelhelms-a'))).toBe(true)
    expect(eventsOf(ctx, 'ModelReturned')).toHaveLength(3)
  })

  it('CITIES-BRAZIER works in the enemy turn as well, and not when nothing is slain or nobody is near', () => {
    const s = brazierGame()
    s.activePlayer = 'B'
    expect(abilityService.usable(s, 'A', 'endOfTurn').map((u) => u.abilityId)).toContain('cities.ability.brazier-of-holy-flame')
    place(s, 'A:steelhelms-a', -6, 4) // far from the general
    expect(abilityService.usable(s, 'A', 'endOfTurn')).toEqual([])
    const t = game(BRAZIER)
    place(t, 'A:marshal', -6, -6)
    place(t, 'A:steelhelms-a', -6, -3.2)
    expect(abilityService.usable(t, 'A', 'endOfTurn')).toEqual([]) // no slain models
  })
})

describe('CITIES-AB-2 Consecrate the Land', () => {
  const CONSECRATE = 'cities.ability.consecrate-the-land'
  function siteGame() {
    const s = game()
    place(s, 'A:steelhelms-a', -7.4, -6.9) // on the South marker (-6,-6)
    place(s, 'A:cavaliers', 9, -9) // the bystanders' back rows would otherwise touch the marker
    s.objectives['obj-a'].controller = 'A'
    s.phase = 'movement'
    return s
  }
  const wardOf = (ctx: EngineContext, unitId: UnitId): number[] => {
    const s = ctx.state
    const attacker = s.units['B:brute']
    const attack: AttackContext = {
      kind: 'melee', overwatch: false, attackerUnitId: attacker.id, attackerModelId: attacker.models[0], weapon: s.weapons['fx.w.brute-axe'],
      targetUnitId: unitId, targetModelId: s.units[unitId].models[0], range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true,
    }
    const roll = ctx.roll({ purpose: 'fnp', player: 'A', unitId })
    return hookService.collect(ctx, 'onFeelNoPainRoll', { attack, roll: { purpose: 'fnp', roll, dieIndex: 0, unmodified: roll.dice[0], rerolled: false }, mortal: false })
      .flatMap((r) => (r.result.kind === 'roll' && r.result.feelNoPain !== undefined ? [r.result.feelNoPain] : []))
  }

  it('CITIES-AB-2 on a 3+ the held, uncontested objective is consecrated: friendly units on it get Ward (6+)', () => {
    const s = siteGame()
    const ctx = ctxFor(s, [3, ...Array(20).fill(1)])
    expect(abilityService.usable(s, 'A', 'movement').map((u) => u.abilityId)).toContain(CONSECRATE)
    useOnce(ctx, 'movement', 'A', CONSECRATE)
    expect(s.mission.custom.consecrated).toEqual({ 'obj-a': 'A' })
    expect(wardOf(ctx, 'A:steelhelms-a')).toEqual([6])
    // a friendly unit that does not contest it has none; neither does the enemy
    expect(wardOf(ctx, 'A:cavaliers')).toEqual([])
    place(s, 'A:cavaliers', 6, -4) // a different spot, still off the marker
    expect(wardOf(ctx, 'A:cavaliers')).toEqual([])
  })

  it('CITIES-AB-2 any friendly unit on the consecrated objective has the Ward, not just the one that consecrated it', () => {
    const s = siteGame()
    const ctx = ctxFor(s, [4, ...Array(20).fill(1)])
    useOnce(ctx, 'movement', 'A', CONSECRATE)
    place(s, 'A:cavaliers', -7, -6)
    expect(wardOf(ctx, 'A:cavaliers')).toEqual([6])
  })

  it('CITIES-AB-2 a roll of 2 or less does nothing; the ability is still used up', () => {
    const s = siteGame()
    const ctx = ctxFor(s, [2, ...Array(20).fill(1)])
    useOnce(ctx, 'movement', 'A', CONSECRATE)
    expect(s.mission.custom.consecrated).toBeUndefined()
    expect(wardOf(ctx, 'A:steelhelms-a')).toEqual([])
    expect(abilityService.usable(s, 'A', 'movement').map((u) => u.unitId)).not.toContain('A:steelhelms-a')
  })

  it('CITIES-AB-2 needs an objective the army holds and no enemy contests', () => {
    const s = siteGame()
    s.objectives['obj-a'].controller = null
    expect(abilityService.usable(s, 'A', 'movement').map((u) => u.abilityId)).not.toContain(CONSECRATE)
    s.objectives['obj-a'].controller = 'A'
    place(s, 'B:brute', -6, -6)
    expect(abilityService.usable(s, 'A', 'movement').map((u) => u.abilityId)).not.toContain(CONSECRATE)
  })

  it('CITIES-AB-2 the Ward ends the moment the enemy gains control, and does not come back if it is retaken', () => {
    const s = siteGame()
    const ctx = ctxFor(s, [5, ...Array(20).fill(1)])
    useOnce(ctx, 'movement', 'A', CONSECRATE)
    expect(wardOf(ctx, 'A:steelhelms-a')).toEqual([6])
    s.objectives['obj-a'].controller = 'B'
    expect(wardOf(ctx, 'A:steelhelms-a')).toEqual([])
    abilityService.runWindow(ctx, 'hero', 'A') // the next ability window tidies the flag up
    s.objectives['obj-a'].controller = 'A'
    expect(wardOf(ctx, 'A:steelhelms-a')).toEqual([])
  })
})

describe('CITIES-RA-2 Ironweld Discipline', () => {
  const DISCIPLINE = 'cities.ability.ironweld-discipline'
  function cannonGame() {
    const s = game('cities.enh.glimmering', DISCIPLINE)
    s.activePlayer = 'B'
    s.phase = 'shooting'
    place(s, 'A:cannon', 4, -8)
    place(s, 'B:brute', 4, -2) // 6" away, clear of the terrain
    return s
  }

  it('CITIES-RA-2 in the enemy shooting phase, on a 3+ the Cannon fires at the enemy unit it could shoot', () => {
    const s = cannonGame()
    expect(abilityService.usable(s, 'A', 'shooting').map((u) => u.abilityId)).toEqual([DISCIPLINE])
    const before = s.units['B:brute'].models.map((m) => s.models[m].woundsRemaining).reduce((a, b) => a + b, 0)
    // declared D6 = 4, then 5 Grapeshot hits (6s), 5 wounds (6s), 5 failed saves (1s); the Cannon prefers Grapeshot at this range
    const ctx = ctxFor(s, [4, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 1, 1, 1, 1, 1])
    useOnce(ctx, 'shooting', 'A', DISCIPLINE)
    const after = s.units['B:brute'].location === 'board' ? s.units['B:brute'].models.map((m) => s.models[m].woundsRemaining).reduce((a, b) => a + b, 0) : 0
    expect(after).toBeLessThan(before)
    expect(eventsOf(ctx, 'AttackSequenceStarted')).toHaveLength(1)
    expect(s.units['A:cannon'].turn.shotThisPhase).toBe(true)
    // once per turn
    expect(abilityService.usable(s, 'A', 'shooting')).toEqual([])
  })

  it('CITIES-RA-2 a roll of 2 or less means the Cannon holds fire', () => {
    const s = cannonGame()
    const ctx = ctxFor(s, [2])
    useOnce(ctx, 'shooting', 'A', DISCIPLINE)
    expect(eventsOf(ctx, 'AttackSequenceStarted')).toHaveLength(0)
  })

  it('CITIES-RA-2 not in your own shooting phase, and not when the Cannon has nothing to shoot', () => {
    const s = cannonGame()
    s.activePlayer = 'A'
    expect(abilityService.usable(s, 'A', 'shooting')).toEqual([])
    const t = cannonGame()
    for (const u of Object.values(t.units)) if (u.player === 'B') u.location = 'reserves' // nothing on the table to shoot at
    expect(abilityService.usable(t, 'A', 'shooting')).toEqual([])
  })

  it('CITIES-RA-2 is not offered when the other regiment ability was picked', () => {
    const s = cannonGame()
    s.players.A.regimentAbilityId = 'cities.ability.for-sigmar-charge'
    expect(abilityService.usable(s, 'A', 'shooting')).toEqual([])
  })
})

describe('Glimmering', () => {
  const GLIM = 'cities.enh.glimmering'
  const rollData = (s: GameState, purpose: 'hit' | 'wound' | 'save', unmodified: number, who: 'attacker' | 'defender' = 'attacker') => {
    const marshal = s.units['A:marshal']
    const brute = s.units['B:brute']
    const attack: AttackContext = {
      kind: 'melee', overwatch: false, attackerUnitId: who === 'attacker' ? marshal.id : brute.id, attackerModelId: (who === 'attacker' ? marshal : brute).models[0],
      weapon: s.weapons['cities.weapon.master-forged-longsword'], targetUnitId: who === 'attacker' ? brute.id : marshal.id, targetModelId: (who === 'attacker' ? brute : marshal).models[0],
      range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true,
    }
    const roll = { id: 'r', purpose, sides: 6 as const, dice: [unmodified], rerolled: null, modifiers: [], final: [unmodified], player: 'A' as const, unitId: null, modelId: null, weaponId: null, targetUnitId: null, commandRerollable: false, needed: 3 }
    return { attack, roll: { purpose, roll, dieIndex: 0, unmodified, rerolled: false } }
  }
  const rerolls = (ctx: EngineContext, hook: 'onHitRoll' | 'onWoundRoll' | 'onSaveRoll', data: ReturnType<typeof rollData>) =>
    hookService.collect(ctx, hook, data as never).filter((r) => r.result.kind === 'roll' && (r.result as { reroll?: string }).reroll === 'oneDie')

  it('Glimmering: the first failed hit, wound or save roll for the general in a phase may be re-rolled, once per phase', () => {
    const s = game(GLIM)
    place(s, 'A:marshal', -4, -2)
    place(s, 'B:brute', -4, -0.4)
    const ctx = ctxFor(s, [])
    abilityService.runWindow(ctx, 'hero', 'A') // puts the battle-long holder effect on the general
    expect(s.units['A:marshal'].effects).toHaveLength(1)
    abilityService.runWindow(ctx, 'hero', 'A')
    expect(s.units['A:marshal'].effects).toHaveLength(1) // idempotent
    expect(rerolls(ctx, 'onHitRoll', rollData(s, 'hit', 5))).toHaveLength(0) // a success is not re-rolled
    expect(rerolls(ctx, 'onHitRoll', rollData(s, 'hit', 2))).toHaveLength(1)
    // used up for the rest of the phase, whichever roll type comes next
    expect(rerolls(ctx, 'onWoundRoll', rollData(s, 'wound', 1))).toHaveLength(0)
    expect(rerolls(ctx, 'onSaveRoll', rollData(s, 'save', 1, 'defender'))).toHaveLength(0)
    // a new phase (marks reset) offers it again, here for a save
    s.phaseState.marks = []
    expect(rerolls(ctx, 'onSaveRoll', rollData(s, 'save', 1, 'defender'))).toHaveLength(1)
  })

  it('Glimmering: in a real attack the first failed hit die is re-rolled and the wound roll that follows is not', () => {
    const s = game(GLIM)
    place(s, 'A:marshal', -4, -2)
    place(s, 'B:boss', -4, -0.4)
    const sword = 'cities.weapon.master-forged-longsword'
    const model = s.units['A:marshal'].models[0]
    // 5 hit dice: all 2s fail on 3+; Glimmering re-rolls the first one (a 6 hits); the one wound die is a 1 and stays failed
    const ctx = ctxFor(s, [2, 2, 2, 2, 2, 6, 1, 1, 1, 1, 1, 1])
    abilityService.runWindow(ctx, 'hero', 'A')
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:marshal', overwatch: false, targets: [{ modelId: model, weaponId: sword, targetUnitId: 'B:boss', profileGroup: null, attacks: null }] })
    attackService.advance(ctx)
    const rerolls = eventsOf(ctx, 'DiceRerolled') as { source: string }[]
    expect(rerolls).toHaveLength(1)
    expect(rerolls[0].source).toBe('cities.ability.glimmering')
  })

  it('Glimmering: only rolls made for the general count', () => {
    const s = game(GLIM)
    const ctx = ctxFor(s, [])
    abilityService.runWindow(ctx, 'hero', 'A')
    // the enemy's own attack against someone else, and the enemy's hit roll against the general
    expect(rerolls(ctx, 'onHitRoll', rollData(s, 'hit', 1, 'defender'))).toHaveLength(0)
    expect(rerolls(ctx, 'onSaveRoll', rollData(s, 'save', 1, 'attacker'))).toHaveLength(0)
  })

  it('Glimmering: another enhancement leaves the general without it', () => {
    const s = game(HEIRLOOM)
    const ctx = ctxFor(s, [])
    abilityService.runWindow(ctx, 'hero', 'A')
    expect(s.units['A:marshal'].effects).toHaveLength(0)
  })
})

describe('SPH-12 Call for Reinforcements', () => {
  const CFR = 'core.ability.call-for-reinforcements'
  function reinforceGame() {
    const s = game()
    s.phase = 'movement'
    place(s, 'B:brute', 6, 5)
    // the first Steelhelms unit is wiped out
    for (const id of [...s.units['A:steelhelms-a'].models]) removeModel(s, id)
    return s
  }
  const callIt = (ctx: EngineContext, choose: (ids: string[]) => string = (ids) => ids[0]) =>
    runWindow(ctx, 'movement', 'A', (topic, ids) => (topic === 'abilityUse' ? (ids.find((i) => i.startsWith(CFR)) ?? 'pass') : topic === 'abilityMode' ? choose(ids) : ids[0]))

  it('SPH-015 own movement phase, a destroyed Reinforcements unit: offered once this turn; never in the enemy\'s turn', () => {
    const s = reinforceGame()
    expect(s.units['A:steelhelms-a'].location).toBe('destroyed')
    expect(abilityService.usable(s, 'A', 'movement').map((u) => u.abilityId)).toContain(CFR)
    const ctx = ctxFor(s, [])
    callIt(ctx)
    expect(abilityService.usable(s, 'A', 'movement').map((u) => u.abilityId)).not.toContain(CFR)
    const t = reinforceGame()
    t.activePlayer = 'B'
    expect(abilityService.usable(t, 'A', 'movement')).toEqual([])
  })

  it('SPH-016 the replacement is set up wholly in friendly territory, wholly within 6" of an edge and out of combat', () => {
    const s = reinforceGame()
    const ctx = ctxFor(s, [])
    const topics = callIt(ctx)
    expect(topics).toContain('abilityMode') // where it goes is a choice
    const copy = Object.values(s.units).find((u) => u.replacementOf === 'A:steelhelms-a')!
    expect(copy.location).toBe('board')
    expect(copy.models).toHaveLength(5)
    const models = unitModels(s, copy.id)
    const territory = s.mission.data.territories!.A
    for (const m of models) {
      expect(whollyWithinPolygon(m, territory), m.id).toBe(true)
      const R = m.base.radius
      const hw = s.board.w / 2, hh = s.board.h / 2
      expect(m.pos.x + R <= -hw + 6 + 1e-6 || m.pos.x - R >= hw - 6 - 1e-6 || m.pos.z + R <= -hh + 6 + 1e-6 || m.pos.z - R >= hh - 6 - 1e-6, m.id).toBe(true)
      for (const e of Object.values(s.models).filter((x) => s.units[x.unitId].player === 'B' && s.units[x.unitId].location === 'board')) expect(distance(m, e)).toBeGreaterThan(3)
    }
    expect(isCoherent(models)).toBe(true)
    for (let i = 0; i < models.length; i++) for (let j = i + 1; j < models.length; j++) expect(basesOverlap(models[i], models[j])).toBe(false)
    expect(eventsOf(ctx, 'UnitReplaced')).toHaveLength(1)
  })

  it('SPH-016 whatever centre is asked for, a returned formation is legal: territory, edge band, out of combat, clear and coherent', () => {
    const s = reinforceGame()
    place(s, 'B:brute', -9.5, -5) // an enemy sitting in the left-hand band
    const models = snapshot(s)
    const territory = s.mission.data.territories!.A
    const enemies = Object.values(s.models).filter((x) => s.units[x.unitId].player === 'B' && s.units[x.unitId].location === 'board')
    let found = 0
    for (let x = -14; x <= 14; x += 4) {
      for (let z = -10; z <= 3; z += 3) {
        const placements = reinforcementFormation(s, 'A', models, 0.5, { x, z })
        if (!placements) continue
        found++
        const fps = placements.map((p, i) => ({ pos: p.pos, facing: p.facing ?? 0, base: models[i].base }))
        for (const f of fps) {
          expect(whollyWithinPolygon(f, territory)).toBe(true)
          const R = f.base.radius
          expect(f.pos.x + R <= -15 + 6 + 1e-6 || f.pos.x - R >= 15 - 6 - 1e-6 || f.pos.z + R <= -11 + 6 + 1e-6 || f.pos.z - R >= 11 - 6 - 1e-6).toBe(true)
          for (const e of enemies) expect(distance(f, e)).toBeGreaterThan(3)
        }
        expect(isCoherent(fps)).toBe(true)
      }
    }
    expect(found).toBeGreaterThan(5)
  })

  it('SPH-017 the replacement is a brand-new unit: full strength, no effects or tokens, once-per-battle uses available again', () => {
    const s = reinforceGame()
    const orig = s.units['A:steelhelms-a']
    orig.effects.push({ id: 'e', sourceAbilityId: 'x', sourceUnitId: null, effect: {}, scope: { who: 'self' }, expires: { kind: 'battle', round: 1, player: null }, when: null })
    orig.tokens = { marker: 1 }
    s.players.A.abilityUses.push({ abilityId: 'cities.ability.consecrate-the-land', unitId: 'A:steelhelms-a', round: 1, turn: 'A', phase: 'movement' })
    callIt(ctxFor(s, []))
    const copy = Object.values(s.units).find((u) => u.replacementOf === 'A:steelhelms-a')!
    expect(copy.id).not.toBe(orig.id)
    expect(copy.effects).toEqual([])
    expect(copy.tokens).toEqual({})
    expect(copy.models.map((m) => s.models[m].woundsRemaining)).toEqual([1, 1, 1, 1, 1])
    expect(s.players.A.abilityUses.some((u) => u.unitId === copy.id)).toBe(false)
    expect(orig.replaced).toBe(true)
  })

  it('SPH-018 a replacement that is destroyed cannot be replaced; a unit without Reinforcements is never offered', () => {
    const s = reinforceGame()
    callIt(ctxFor(s, []))
    const copy = Object.values(s.units).find((u) => u.replacementOf === 'A:steelhelms-a')!
    for (const id of [...copy.models]) removeModel(s, id)
    expect(copy.location).toBe('destroyed')
    s.round = 2
    expect(abilityService.usable(s, 'A', 'movement').map((u) => u.abilityId)).not.toContain(CFR)
    // the Marshal has no Reinforcements keyword
    const t = game()
    t.phase = 'movement'
    for (const id of [...t.units['A:marshal'].models]) removeModel(t, id)
    expect(abilityService.usable(t, 'A', 'movement').map((u) => u.abilityId)).not.toContain(CFR)
  })

  it('SPH-015 the other Steelhelms unit can still be called back later, one replacement per turn', () => {
    const s = reinforceGame()
    for (const id of [...s.units['A:steelhelms-b'].models]) removeModel(s, id)
    const ctx = ctxFor(s, [])
    callIt(ctx)
    expect(Object.values(s.units).filter((u) => u.replacementOf !== null)).toHaveLength(1)
    s.round = 2
    callIt(ctxFor(s, []))
    expect(Object.values(s.units).filter((u) => u.replacementOf !== null)).toHaveLength(2)
  })
})

// the original models of a destroyed unit, as Call for Reinforcements sees them
function snapshot(s: GameState) {
  return s.units['A:steelhelms-a'].destroyedModels
}
