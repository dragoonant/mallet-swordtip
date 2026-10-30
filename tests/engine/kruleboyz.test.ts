// Kruleboyz (Swampskulka Gang) code hooks and data: docs/spec/factions/kruleboyz.md, test ids KRU-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/kruleboyz files on top of the AoS fixture bundle
// (player A = Swampskulka Gang, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data
// except the one synthetic Monster the Skewered test needs.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, unitModels,
  type AbilityWindow, type AttackContext, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService, feelNoPainFor } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { losService } from '../../src/engine/los'
import { weaponService } from '../../src/engine/weapons'
import { unitIgnoresRetreatDamage } from '../../src/engine/phases/movement'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/kruleboyz/abilities.json'
import enhancementsJson from '../../src/data/factions/kruleboyz/enhancements.json'
import weaponsJson from '../../src/data/factions/kruleboyz/weapons.json'
import factionJson from '../../src/data/factions/kruleboyz/faction.json'
import patrolJson from '../../src/data/factions/kruleboyz/patrols/swampskulka-gang.json'
import killabossJson from '../../src/data/factions/kruleboyz/datasheets/killaboss-on-great-gnashtoof.json'
import murknobJson from '../../src/data/factions/kruleboyz/datasheets/murknob-with-belcha-banna.json'
import boltboyzJson from '../../src/data/factions/kruleboyz/datasheets/man-skewer-boltboyz.json'
import gutrippazJson from '../../src/data/factions/kruleboyz/datasheets/gutrippaz.json'
import killbowJson from '../../src/data/factions/kruleboyz/datasheets/beast-skewer-killbow.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [killabossJson, murknobJson, boltboyzJson, gutrippazJson, killbowJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.kruleboyz = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const WAAAGH = 'kruleboyz.ability.kruleboyz-waaagh'
const MUD = 'kruleboyz.ability.covered-in-mud'
const RACKET = 'kruleboyz.ability.noisy-racket'
const KUNNIN = 'kruleboyz.enh.kunnin-plan'
const PEBBLE = 'kruleboyz.enh.morks-eye-pebble'
const EGO = 'kruleboyz.enh.egomaniak'
const EYE = 'kruleboyz.enh.eye-biter-ash'
const KUNNIN_AB = 'kruleboyz.ability.kunnin-plan'
const PEBBLE_AB = 'kruleboyz.ability.morks-eye-pebble'
const EYE_AB = 'kruleboyz.ability.eye-biter-ash'
const PLAN = 'kruleboyz.ability.all-part-of-da-plan'
const BREATH = 'kruleboyz.ability.breath-of-the-mire-drakes'
const SCARE = 'kruleboyz.ability.scare-taktikz'

const BOSS = 'A:killaboss'
const KNOB = 'A:murknob'
const BOLT = 'A:boltboyz'
const GUT1 = 'A:gutrippaz-a'
const GUT2 = 'A:gutrippaz-b'
const BOW = 'A:killbow'

const STIKKA = 'kruleboyz.weapon.jagged-boss-stikka'
const FANGS = 'kruleboyz.weapon.gnashtoof-fangs'
const CROSSBOW = 'kruleboyz.weapon.man-skewer-crossbow'
const BOLTS = 'kruleboyz.weapon.beast-skewer-bolts'

// lay a unit's models in a row along x starting at (x, z); bases never overlap
function place(s: GameState, unitId: UnitId, x: number, z: number, gap = 0.15): void {
  s.units[unitId].location = 'board'
  let cx = x
  for (const m of unitModels(s, unitId)) {
    const r = Math.max(m.base.radius, m.base.radius2 ?? 0)
    m.pos = { x: cx + r, y: 0, z }
    cx += 2 * r + gap
  }
}

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'kruleboyz', patrolId: 'kruleboyz.army.swampskulka-gang', enhancementId: opts.enh ?? KUNNIN, regimentAbilityId: opts.reg ?? MUD }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  // bystanders go along the back edges, two rows each, clear of the middle where the tests work
  for (const p of ['A', 'B'] as const) {
    const sign = p === 'A' ? -1 : 1
    let x = -14.5, row = 0
    for (const u of Object.values(s.units).filter((u) => u.player === p)) {
      const width = u.models.length * (2 * Math.max(...unitModels(s, u.id).map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0))) + 0.3)
      if (x + width > 14.5) { x = -14.5; row = 1 }
      place(s, u.id, x, sign * (10.8 - 1.9 * row), 0.3)
      x += width + 0.3
    }
  }
  s.round = 1
  s.phase = 'command'
  s.activePlayer = 'A'
  return s
}

const rngs = new WeakMap<EngineContext, ScriptedRng>()
const ctxFor = (s: GameState, dice: number[], services: Partial<typeof DEFAULT_MODULES.services> = {}): EngineContext => {
  const rng = new ScriptedRng(dice)
  const { ctx } = createContext(s, rng, { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, ...services } })
  rngs.set(ctx, rng)
  return ctx
}
const leftOver = (ctx: EngineContext): number[] => rngs.get(ctx)?.remaining ?? []

type Pick = (topic: string, ids: string[], p: ChooseOptionDecision) => string

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: Pick): { topics: string[] } {
  const topics: string[] = []
  for (let i = 0; i < 30; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return { topics }
    const p = ctx.state.pending as ChooseOptionDecision
    topics.push(p.context.topic)
    const choice = pick(p.context.topic, p.options.map((o) => o.id), p)
    ctx.state.pending = null
    const action = choice === 'pass' ? { type: 'pass' as const, player, decisionId: p.id } : { type: 'chooseOption' as const, player, decisionId: p.id, optionId: choice }
    const rej = abilityService.handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

// use one ability once (for the given unit when several units carry it); every other offer is declined
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; unit?: string } = {}) {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId) && (!opts.unit || id.endsWith(`#${opts.unit}`)))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    return ids[0]
  })
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const offeredFor = (s: GameState, player: PlayerId, window: AbilityWindow, abilityId: string): (UnitId | null)[] =>
  abilityService.usable(s, player, window).filter((u) => u.abilityId === abilityId).map((u) => u.unitId)
const targetsOf = (s: GameState, code: string, unitId: UnitId | null, player: PlayerId): UnitId[] =>
  (codeHooks[code].activate!.targets as (st: GameState, u: UnitId | null, p?: PlayerId) => UnitId[])(s, unitId, player)
const stat = (s: GameState, unitId: UnitId, name: 'M' | 'OC'): number =>
  hookService.statFor(s, { unitId, modelId: s.units[unitId].models[0], weapon: null, stat: name }, s.datasheets[s.units[unitId].datasheetId].stats[name])
const woundsOf = (s: GameState, unitId: UnitId): number => s.units[unitId].models.reduce((n, id) => n + s.models[id].woundsRemaining, 0)

// ---------- attacks with scripted dice ----------
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const tgt = (s: GameState, unitId: UnitId, weaponId: string, targetUnitId: string, attacks: number | null): DeclaredTarget => {
  const model = s.units[unitId].models.find((id) => s.models[id].weapons.includes(weaponId))
  if (!model) throw new Error(`${unitId} carries no ${weaponId}`)
  return { modelId: model, weaponId, targetUnitId, profileGroup: null, attacks }
}

function attack(s: GameState, kind: 'melee' | 'ranged', dice: number[], attackerUnitId: UnitId, weaponId: string, targetUnitId: UnitId, attacks: number | null, services: Partial<typeof DEFAULT_MODULES.services> = {}) {
  s.phase = kind === 'melee' ? 'fight' : 'shooting'
  const rng = new ScriptedRng(dice)
  const events: GameEvent[] = []
  const made = createContext(s, rng, { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, ...services } })
  attackService.begin(made.ctx, { kind, overwatch: false, attackerUnitId, targets: [tgt(s, attackerUnitId, weaponId, targetUnitId, attacks)] })
  expect(attackService.advance(made.ctx)).toBe('done')
  events.push(...made.events)
  return { events, rng }
}

function attackOf(s: GameState, attackerUnitId: UnitId, targetUnitId: UnitId, kind: 'melee' | 'ranged', weaponId: string): AttackContext {
  const model = s.units[attackerUnitId].models.find((id) => s.models[id].weapons.includes(weaponId)) ?? s.units[attackerUnitId].models[0]
  return {
    kind, overwatch: false, attackerUnitId, attackerModelId: model, weapon: s.weapons[weaponId],
    targetUnitId, targetModelId: s.units[targetUnitId].models[0], range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true,
  }
}

// the sum of the roll modifiers the hooks give this attack's hit / wound roll (before the +-1 cap dice.ts applies)
function rollModifier(s: GameState, a: AttackContext, which: 'hit' | 'wound'): number {
  const ctx = ctxFor(s, [3])
  const roll = ctx.roll({ purpose: which, player: s.units[a.attackerUnitId].player, unitId: a.attackerUnitId })
  return hookService.collect(ctx, which === 'hit' ? 'onHitRoll' : 'onWoundRoll', { attack: a, roll: { purpose: which, roll, dieIndex: 0, unmodified: roll.dice[0], rerolled: false } })
    .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
}

// put the unit next to an enemy unit so the two are in combat
function engage(s: GameState, a: UnitId, b: UnitId, x = 0, z = 0): void {
  place(s, a, x, z)
  place(s, b, x, z + 2.8)
}

// take every Swampskulka unit but the listed ones off the table, so the bystanders at the back edge never count as neighbours
function only(s: GameState, keep: UnitId[]): void {
  for (const u of Object.values(s.units)) if (u.player === 'A' && !keep.includes(u.id)) u.location = 'reserves'
}

const ward = (s: GameState, id: UnitId): number | undefined => feelNoPainFor(ctxFor(s, []), s.units[id].models[0], {} as never)?.threshold

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('KRU-REG every code in the Kruleboyz data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('KRU-ARMY-1 the Swampskulka Gang builds: Killaboss general, Murknob, 3 Boltboyz, 2 x 5 Gutrippaz, Killbow; 6 units, 16 models; stats and weapons as printed', () => {
    const s = game()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(6)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(16)
    expect(s.players.A.warlordUnitId).toBe(BOSS)
    expect(mine.filter((u) => u.datasheetId === 'kruleboyz.unit.gutrippaz')).toHaveLength(2)
    const ds = (id: string) => s.datasheets[`kruleboyz.unit.${id}`]
    expect(ds('killaboss-on-great-gnashtoof').stats).toMatchObject({ M: 10, W: 10, Sv: 3, OC: 2 })
    expect(ds('murknob-with-belcha-banna').stats).toMatchObject({ M: 5, W: 6, Sv: 4, OC: 5 })
    expect(ds('man-skewer-boltboyz').stats).toMatchObject({ M: 5, W: 2, Sv: 5, OC: 1 })
    expect(ds('gutrippaz').stats).toMatchObject({ M: 5, W: 2, Sv: 5, OC: 1 })
    expect(ds('beast-skewer-killbow').stats).toMatchObject({ M: 5, W: 5, Sv: 5, OC: 2 })
    for (const id of ['killaboss-on-great-gnashtoof', 'murknob-with-belcha-banna', 'man-skewer-boltboyz', 'gutrippaz', 'beast-skewer-killbow']) {
      expect(ds(id).stats.ward ?? null, id).toBeNull()
      expect(ds(id).keywords, id).not.toContain('MONSTER')
    }
    expect(ds('killaboss-on-great-gnashtoof').keywords).toEqual(['HERO', 'CAVALRY'])
    expect(ds('murknob-with-belcha-banna').keywords).toEqual(['HERO', 'INFANTRY'])
    expect(ds('beast-skewer-killbow').keywords).toEqual(['WAR MACHINE'])
    const w = (id: string) => s.weapons[`kruleboyz.weapon.${id}`]
    const row = (id: string) => [w(id).kind, w(id).range, w(id).A, w(id).skill, w(id).wound, w(id).rend, w(id).D]
    expect(row('jagged-boss-stikka')).toEqual(['melee', 0, 4, 3, 3, 1, 2])
    expect(row('gnashtoof-fangs')).toEqual(['melee', 0, 5, 4, 3, 1, 2])
    expect(row('murknob-cleaver')).toEqual(['melee', 0, 4, 4, 3, 1, 2])
    expect(row('man-skewer-crossbow')).toEqual(['ranged', 18, 2, 4, 3, 1, 2])
    expect(row('jaggedy-blade')).toEqual(['melee', 0, 1, 4, 3, 0, 1])
    expect(row('wicked-hacka')).toEqual(['melee', 0, 2, 4, 3, 0, 1])
    expect(row('beast-skewer-bolts')).toEqual(['ranged', 24, 2, 4, 2, 2, 'D6'])
    expect(row('jaggedy-blades')).toEqual(['melee', 0, 2, 4, 3, 0, 1])
    const abilityOf = (id: string) => w(id).abilities.map((a) => a.ability)
    expect(abilityOf('jagged-boss-stikka')).toEqual(['CRIT_MORTAL'])
    expect(abilityOf('gnashtoof-fangs')).toEqual(['COMPANION'])
    expect(abilityOf('man-skewer-crossbow')).toEqual(['CRIT_AUTO_WOUND'])
    expect(abilityOf('beast-skewer-bolts')).toEqual(['CRIT_AUTO_WOUND'])
    expect(abilityOf('wicked-hacka')).toEqual(['CRIT_MORTAL'])
    // the Boltboyz blade and the Killbow blades are two separate weapons
    expect(s.models[s.units[BOLT].models[0]].weapons).toContain('kruleboyz.weapon.jaggedy-blade')
    expect(s.models[s.units[BOW].models[0]].weapons).toContain('kruleboyz.weapon.jaggedy-blades')
    // the stand-ins for the estimated base sizes
    const baseOf = (json: unknown[]) => (json[0] as DatasheetData).composition[0].base
    expect(baseOf(killabossJson)).toEqual({ shape: 'oval', mm: 90, mm2: 52 })
    expect(baseOf(killbowJson)).toEqual({ shape: 'oval', mm: 90, mm2: 52 })
    expect(baseOf(murknobJson)).toEqual({ shape: 'round', mm: 40 })
    expect(baseOf(boltboyzJson)).toEqual({ shape: 'round', mm: 32 })
    expect(baseOf(gutrippazJson)).toEqual({ shape: 'round', mm: 32 })
  })

  it('KRU-ARMY-2 no unit has Reinforcements, so Call for Reinforcements is never offered', () => {
    const s = game()
    for (const u of Object.values(s.units).filter((u) => u.player === 'A')) expect(s.datasheets[u.datasheetId].keywords).not.toContain('REINFORCEMENTS')
    s.units[GUT2].location = 'destroyed'
    s.phase = 'movement'
    expect(replaceableUnits(s, 'A')).toEqual([])
    expect(offered(s, 'A', 'movement').filter((id) => id.toLowerCase().includes('reinforcement'))).toEqual([])
  })
})

describe('KRU-BT Kruleboyz Waaagh!', () => {
  // the general with two Gutrippaz units: one wholly within 12", one far away
  function waaaghGame() {
    const s = game()
    s.phase = 'fight'
    only(s, [BOSS, GUT1, GUT2])
    place(s, BOSS, 0, -8)
    place(s, GUT1, -4, -5, 0.3)
    place(s, GUT2, 12, -5, 0.3)
    return s
  }

  it('KRU-BT-1 once per battle, in either player\'s combat phase, and only while the general is on the table', () => {
    const s = waaaghGame()
    expect(offered(s, 'A', 'fight')).toContain(WAAAGH)
    // the opponent's combat phase too
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'fight')).toContain(WAAAGH)
    expect(offered(s, 'B', 'fight')).not.toContain(WAAAGH)
    // other phases: no
    s.phase = 'shooting'
    expect(offered(s, 'A', 'shooting')).not.toContain(WAAAGH)
    s.phase = 'fight'
    // used once in the opponent's phase: spent for the battle
    useOnce(ctxFor(s, []), 'fight', 'A', WAAAGH, { target: GUT1 })
    expect(offered(s, 'A', 'fight')).not.toContain(WAAAGH)
    s.activePlayer = 'A'
    s.round = 3
    expect(offered(s, 'A', 'fight')).not.toContain(WAAAGH)
    // no general, no Waaagh!
    const dead = waaaghGame()
    dead.units[BOSS].location = 'destroyed'
    expect(offered(dead, 'A', 'fight')).not.toContain(WAAAGH)
  })

  it('KRU-BT-2 the target is another friendly unit wholly within 12" of the general (partly within is refused)', () => {
    const s = waaaghGame()
    expect(targetsOf(s, 'kruleboyzWaaagh', null, 'A')).toEqual([GUT1])
    // pull the far unit so that its first models are inside 12" but the last ones are not
    place(s, GUT2, 9, -5, 0.3)
    expect(targetsOf(s, 'kruleboyzWaaagh', null, 'A')).toEqual([GUT1])
    // wholly within: everyone in
    place(s, GUT2, -9, -4, 0.3)
    expect(targetsOf(s, 'kruleboyzWaaagh', null, 'A')).toEqual([GUT1, GUT2])
    // the general never picks itself, the enemy is never a target
    expect(targetsOf(s, 'kruleboyzWaaagh', null, 'A')).not.toContain(BOSS)
    expect(targetsOf(s, 'kruleboyzWaaagh', null, 'A').some((id) => id.startsWith('B:'))).toBe(false)
  })

  it('KRU-BT-3 the general and the target fight in the Strike-first step this phase only', () => {
    const s = waaaghGame()
    const ctx = ctxFor(s, [])
    for (const id of [BOSS, GUT1, GUT2]) expect(hookService.eligibilityFor(s, id, 'fightFirst'), id).toBe(false)
    useOnce(ctx, 'fight', 'A', WAAAGH, { target: GUT1 })
    expect(hookService.eligibilityFor(s, BOSS, 'fightFirst')).toBe(true)
    expect(hookService.eligibilityFor(s, GUT1, 'fightFirst')).toBe(true)
    expect(hookService.eligibilityFor(s, GUT2, 'fightFirst')).toBe(false)
    expect(hookService.eligibilityFor(s, 'B:brute', 'fightFirst')).toBe(false)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(hookService.eligibilityFor(s, BOSS, 'fightFirst')).toBe(false)
    expect(hookService.eligibilityFor(s, GUT1, 'fightFirst')).toBe(false)
  })
})

describe('KRU-RA regiment abilities', () => {
  it('KRU-RA-1 Covered in Mud is offered at the start of round 1 only, picks one unit, once per battle', () => {
    const s = game({ reg: MUD })
    expect(offered(s, 'A', 'startOfRound')).toContain(MUD)
    expect(offered(s, 'B', 'startOfRound')).not.toContain(MUD)
    expect(targetsOf(s, 'kruleboyzCoveredInMud', null, 'A')).toHaveLength(6)
    s.round = 2
    expect(offered(s, 'A', 'startOfRound')).not.toContain(MUD)
    s.round = 1
    const r = useOnce(ctxFor(s, []), 'startOfRound', 'A', MUD, { target: BOW })
    expect(r.topics.filter((t) => t === 'abilityTarget')).toHaveLength(1)
    expect(s.units[BOW].effects).toHaveLength(1)
    expect(Object.values(s.units).filter((u) => u.id !== BOW && u.effects.length > 0)).toEqual([])
    expect(offered(s, 'A', 'startOfRound')).not.toContain(MUD)
    // the other regiment ability does not bring it
    expect(offered(game({ reg: RACKET }), 'A', 'startOfRound')).not.toContain(MUD)
  })

  it('KRU-RA-2 enemy models more than 12" away cannot see the unit; within 12" they can; friendly sight is unchanged; it lasts the battle', () => {
    const s = game({ reg: MUD })
    place(s, BOW, 0, -5)
    place(s, BOLT, 8, -5)
    place(s, 'B:hawk', 0, 9) // about 13" from the Killbow's edge
    place(s, 'B:brute', 0, 3) // 8" from the Killbow's edge
    const seen = (observer: UnitId, target: UnitId): boolean => unitModels(s, observer).some((m) => losService.unitVisible(s, m.id, target))
    expect(seen('B:hawk', BOW)).toBe(true)
    useOnce(ctxFor(s, []), 'startOfRound', 'A', MUD, { target: BOW })
    expect(seen('B:hawk', BOW)).toBe(false)
    expect(seen('B:brute', BOW)).toBe(true)
    // other Kruleboyz units are not hidden, and our own models still see the Killbow
    expect(seen('B:hawk', BOLT)).toBe(true)
    expect(seen(BOLT, BOW)).toBe(true)
    // the enemy steps in to 12" or less and sees it
    place(s, 'B:hawk', 0, 5)
    expect(seen('B:hawk', BOW)).toBe(true)
    place(s, 'B:hawk', 0, 9)
    expect(seen('B:hawk', BOW)).toBe(false)
    // whole battle: turns, rounds and the death of the general change nothing
    const ctx = ctxFor(s, [])
    effectService.expire(ctx, 'turnEnd', null)
    effectService.expire(ctx, 'roundEnd', null)
    s.round = 4
    s.units[BOSS].location = 'destroyed'
    expect(seen('B:hawk', BOW)).toBe(false)
  })

  it('KRU-RA-3 Noisy Racket: enemy attacks get -1 to wound in round 1 (shooting and combat, both turns), not in round 2', () => {
    const s = game({ reg: RACKET })
    const melee = attackOf(s, 'B:brute', GUT1, 'melee', 'fx.w.brute-axe')
    const shot = attackOf(s, 'B:hawk', GUT1, 'ranged', 'fx.w.hawk-talons')
    const mine = attackOf(s, GUT1, 'B:brute', 'melee', 'kruleboyz.weapon.wicked-hacka')
    const mod = (a: AttackContext) => rollModifier(s, a, 'wound')
    for (const turn of ['A', 'B'] as const) {
      s.activePlayer = turn
      expect(mod(melee), `melee on ${turn}'s turn`).toBe(-1)
      expect(mod(shot), `shot on ${turn}'s turn`).toBe(-1)
      expect(mod(mine), `our own attack on ${turn}'s turn`).toBe(0)
    }
    // against any unit of the army, not only the ones with the ability on their warscroll
    expect(mod(attackOf(s, 'B:brute', BOW, 'melee', 'fx.w.brute-axe'))).toBe(-1)
    s.round = 2
    expect(mod(melee)).toBe(0)
    expect(mod(shot)).toBe(0)
    // the other regiment ability does not bring it
    const plain = game({ reg: MUD })
    expect(rollModifier(plain, attackOf(plain, 'B:brute', GUT1, 'melee', 'fx.w.brute-axe'), 'wound')).toBe(0)
  })
})

describe('KRU-ENH enhancements', () => {
  it('KRU-ENH-1 Kunnin\' Plan: targets wholly within 12" of the general (itself included); the target retreats without mortal damage, then can shoot and charge', () => {
    const s = game({ enh: KUNNIN })
    only(s, [BOSS, GUT1, GUT2])
    place(s, BOSS, 0, -8)
    place(s, GUT1, -4, -5, 0.3)
    place(s, GUT2, 9, -5, 0.3) // partly within
    expect(offeredFor(s, 'A', 'hero', KUNNIN_AB)).toEqual([BOSS])
    expect(targetsOf(s, 'kruleboyzKunninPlan', BOSS, 'A').sort()).toEqual([BOSS, GUT1].sort())
    const ctx = ctxFor(s, [])
    expect(unitIgnoresRetreatDamage(s, GUT1)).toBe(false)
    useOnce(ctx, 'hero', 'A', KUNNIN_AB, { target: GUT1 })
    expect(unitIgnoresRetreatDamage(s, GUT1)).toBe(true)
    expect(unitIgnoresRetreatDamage(s, GUT2)).toBe(false)
    // once per turn
    expect(offered(s, 'A', 'hero')).not.toContain(KUNNIN_AB)
    // after the retreat the unit still shoots and charges; others do not
    s.units[GUT1].turn.moveType = 'fallBack'
    s.units[GUT2].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor(s, GUT1, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, GUT1, 'charge')).toBe(true)
    expect(hookService.eligibilityFor(s, GUT2, 'shoot')).toBe(false)
    expect(hookService.eligibilityFor(s, GUT2, 'charge')).toBe(false)
    // it ends with the turn, and the ability is back next turn
    effectService.expire(ctx, 'turnEnd', null)
    expect(unitIgnoresRetreatDamage(s, GUT1)).toBe(false)
    expect(hookService.eligibilityFor(s, GUT1, 'charge')).toBe(false)
    s.round = 2
    s.units[BOSS].turn.abilitiesUsedThisPhase = []
    expect(offered(s, 'A', 'hero')).toContain(KUNNIN_AB)
    // the general can pick itself
    s.phaseState.marks = [] // a new phase: the pass marks of the last one are gone
    useOnce(ctxFor(s, []), 'hero', 'A', KUNNIN_AB, { target: BOSS })
    expect(unitIgnoresRetreatDamage(s, BOSS)).toBe(true)
    // not offered with the other enhancement
    expect(offered(game({ enh: EGO }), 'A', 'hero')).not.toContain(KUNNIN_AB)
  })

  it('KRU-ENH-2 Mork\'s Eye Pebble: once per battle in the enemy movement phase; Ward (5+) wholly within 12" of the general in the shooting phase, not the combat phase', () => {
    const s = game({ enh: PEBBLE })
    s.phase = 'movement'
    only(s, [BOSS, GUT1, GUT2])
    place(s, BOSS, 0, -8)
    place(s, GUT1, -4, -5, 0.3)
    place(s, GUT2, 9, -5, 0.3) // partly within
    // not in our own movement phase
    expect(offered(s, 'A', 'movement')).not.toContain(PEBBLE_AB)
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'movement')).toContain(PEBBLE_AB)
    expect(offered(s, 'B', 'movement')).not.toContain(PEBBLE_AB)
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'movement', 'A', PEBBLE_AB)
    expect(offered(s, 'A', 'movement')).not.toContain(PEBBLE_AB)
    // shooting phase: the general and the unit wholly within 12" have Ward (5+), the partly-within unit and the enemy do not
    s.phase = 'shooting'
    expect(ward(s, BOSS)).toBe(5)
    expect(ward(s, GUT1)).toBe(5)
    expect(ward(s, GUT2)).toBeUndefined()
    expect(ward(s, 'B:brute')).toBeUndefined()
    // the range is read live
    place(s, GUT1, 10, -5, 0.3)
    expect(ward(s, GUT1)).toBeUndefined()
    place(s, GUT1, -4, -5, 0.3)
    expect(ward(s, GUT1)).toBe(5)
    // the combat phase: nothing
    s.phase = 'fight'
    expect(ward(s, BOSS)).toBeUndefined()
    expect(ward(s, GUT1)).toBeUndefined()
    // gone at the end of the turn, never offered again
    s.phase = 'shooting'
    effectService.expire(ctx, 'turnEnd', null)
    expect(ward(s, GUT1)).toBeUndefined()
    s.round = 3
    expect(offered(s, 'A', 'movement')).not.toContain(PEBBLE_AB)
  })

  // the Brute faces the Killaboss, Gutrippaz close by (1.1" off the general's edge) and far away
  function egoGame(near = true) {
    const s = game({ enh: EGO })
    only(s, [BOSS, GUT1, GUT2])
    s.phase = 'fight'
    place(s, 'B:brute', 0, -6)
    place(s, BOSS, 0, -8.5)
    if (near) {
      place(s, GUT1, 1.5, -11.2, 0.3)
      place(s, GUT2, 8, -8.5, 0.3)
    } else {
      place(s, GUT1, -12, -8.5, 0.3)
      place(s, GUT2, 8, -8.5, 0.3)
    }
    return s
  }
  // hit 4, wound 3, failed save 1: the Brute axe then deals 2 damage, so two points; the dice after that are the Egomaniak rolls
  const bruteHitsBoss = (s: GameState, after: number[]) => attack(s, 'melee', [4, 3, 1, ...after], 'B:brute', 'fx.w.brute-axe', BOSS, 1)

  it('KRU-ENH-3 Egomaniak: with a friendly unit within 3", each point bound for the general moves on 4+; redirected points go to a unit within 3"', () => {
    // dice 4 and 3: one point moves, one stays
    const s = egoGame()
    expect(hookService.damageRedirectFor(s, BOSS)).toMatchObject({ candidates: [GUT1], succeedOn: 4 })
    const before = woundsOf(s, BOSS)
    const gutBefore = woundsOf(s, GUT1)
    const farBefore = woundsOf(s, GUT2)
    const one = bruteHitsBoss(s, [4, 3])
    expect(one.rng.remaining).toEqual([])
    expect(before - woundsOf(s, BOSS)).toBe(1)
    expect(gutBefore - woundsOf(s, GUT1)).toBe(1)
    expect(farBefore - woundsOf(s, GUT2)).toBe(0)
    expect(of(one.events, 'DamageRedirected')).toMatchObject([{ fromUnitId: BOSS, toUnitId: GUT1, points: 1 }])
    // both points move on 6 and 4: the general takes nothing, the recipient takes both (a model with 2 Health dies)
    const t = egoGame()
    const both = bruteHitsBoss(t, [6, 4])
    expect(woundsOf(t, BOSS)).toBe(before)
    expect(t.units[GUT1].models).toHaveLength(4)
    expect(of(both.events, 'DamageRedirected')).toMatchObject([{ fromUnitId: BOSS, toUnitId: GUT1, points: 2 }])
    // neither point moves on 3 and 1
    const u = egoGame()
    const none = bruteHitsBoss(u, [3, 1])
    expect(woundsOf(u, BOSS)).toBe(before - 2)
    expect(u.units[GUT1].models).toHaveLength(5)
    expect(of(none.events, 'DamageRedirected')).toEqual([])
  })

  it('KRU-ENH-3 Egomaniak: with no friendly unit within 3" nothing moves and no dice are rolled; only the general is protected; other enhancements never redirect', () => {
    const s = egoGame(false)
    expect(hookService.damageRedirectFor(s, BOSS)).toBeNull()
    const before = woundsOf(s, BOSS)
    const r = bruteHitsBoss(s, [6, 6])
    expect(r.rng.remaining).toEqual([6, 6]) // no redirect dice were rolled
    expect(woundsOf(s, BOSS)).toBe(before - 2)
    // somebody else standing next to a friend is not protected
    const t = egoGame()
    place(t, GUT2, 1.5, -13.5, 0.3)
    expect(hookService.damageRedirectFor(t, GUT1)).toBeNull()
    expect(hookService.damageRedirectFor(t, 'B:brute')).toBeNull()
    // without the enhancement: nothing, even with friends in range
    const plain = game({ enh: KUNNIN })
    only(plain, [BOSS, GUT1])
    place(plain, BOSS, 0, -8.5)
    place(plain, GUT1, 1.5, -11.2, 0.3)
    expect(hookService.damageRedirectFor(plain, BOSS)).toBeNull()
  })

  it('KRU-ENH-3 Egomaniak: the whole batch goes to the unit within 3" with the most wounds left; units beyond 3" never receive it', () => {
    const s = game({ enh: EGO })
    only(s, [BOSS, GUT1, BOLT, GUT2])
    s.phase = 'fight'
    place(s, 'B:brute', 0, -6)
    place(s, BOSS, 0, -8.5)
    place(s, GUT1, 1.5, -11.2, 0.3) // 5 models, within 3"
    place(s, BOLT, -6, -8.5, 0.3) // 3 models, within 3" too but fewer wounds
    place(s, GUT2, 8, -8.5, 0.3) // far
    expect(hookService.damageRedirectFor(s, BOSS)!.candidates.sort()).toEqual([BOLT, GUT1].sort())
    const boltBefore = woundsOf(s, BOLT)
    const gutBefore = woundsOf(s, GUT1)
    const farBefore = woundsOf(s, GUT2)
    bruteHitsBoss(s, [5, 5])
    expect(boltBefore - woundsOf(s, BOLT)).toBe(0)
    expect(gutBefore - woundsOf(s, GUT1)).toBe(2)
    expect(farBefore - woundsOf(s, GUT2)).toBe(0)
  })

  // Killaboss in combat with the Brute (and the Boss as a second foe far away)
  function eyeGame() {
    const s = game({ enh: EYE })
    s.phase = 'fight'
    engage(s, BOSS, 'B:brute', 0, -3)
    place(s, 'B:hawk', 8, 3)
    return s
  }

  it('KRU-ENH-4 Eye-biter Ash: the target must be in combat with the general; on 1-4 the -1 to hit ends with the phase', () => {
    const s = eyeGame()
    expect(offered(s, 'A', 'fight')).toContain(EYE_AB)
    expect(targetsOf(s, 'kruleboyzEyeBiterAsh', BOSS, 'A')).toEqual(['B:brute'])
    const swing = () => rollModifier(s, attackOf(s, 'B:brute', BOSS, 'melee', 'fx.w.brute-axe'), 'hit')
    expect(swing()).toBe(0)
    const ctx = ctxFor(s, [4])
    useOnce(ctx, 'fight', 'A', EYE_AB, { target: 'B:brute' })
    expect(leftOver(ctx)).toEqual([])
    expect(swing()).toBe(-1)
    // other enemy units are unaffected
    expect(rollModifier(s, attackOf(s, 'B:hawk', BOSS, 'melee', 'fx.w.hawk-talons'), 'hit')).toBe(0)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(swing()).toBe(0)
    // once per battle
    expect(offered(s, 'A', 'fight')).not.toContain(EYE_AB)
    // nobody in combat with the general: not offered
    const apart = eyeGame()
    place(apart, 'B:brute', 8, 3)
    expect(offered(apart, 'A', 'fight')).not.toContain(EYE_AB)
    // the opponent's combat phase works as well
    const theirs = eyeGame()
    theirs.activePlayer = 'B'
    expect(offered(theirs, 'A', 'fight')).toContain(EYE_AB)
  })

  it('KRU-ENH-4 Eye-biter Ash: on 5+ the -1 to hit lasts the battle, even in a later round and after the general is slain', () => {
    const s = eyeGame()
    const ctx = ctxFor(s, [5])
    useOnce(ctx, 'fight', 'A', EYE_AB, { target: 'B:brute' })
    const swing = () => rollModifier(s, attackOf(s, 'B:brute', BOSS, 'melee', 'fx.w.brute-axe'), 'hit')
    expect(swing()).toBe(-1)
    effectService.expire(ctx, 'phaseEnd', null)
    effectService.expire(ctx, 'turnEnd', null)
    effectService.expire(ctx, 'roundEnd', null)
    s.round = 3
    expect(swing()).toBe(-1)
    s.units[BOSS].location = 'destroyed'
    expect(swing()).toBe(-1)
    // a 6 does the same
    const t = eyeGame()
    useOnce(ctxFor(t, [6]), 'fight', 'A', EYE_AB, { target: 'B:brute' })
    effectService.expire(ctxFor(t, []), 'phaseEnd', null)
    expect(rollModifier(t, attackOf(t, 'B:brute', BOSS, 'melee', 'fx.w.brute-axe'), 'hit')).toBe(-1)
  })
})

describe('KRU-AB warscroll abilities', () => {
  it('KRU-AB-1 All Part of Da Plan: +3 Control on another unit wholly within 9" until your next turn; the Killaboss cannot target itself', () => {
    const s = game()
    only(s, [BOSS, GUT1, GUT2, BOW])
    place(s, BOSS, 0, -8)
    place(s, GUT1, -4, -5, 0.3) // wholly within 9"
    place(s, GUT2, 6, -5, 0.3) // partly within
    place(s, BOW, 12, -8) // beyond
    expect(offeredFor(s, 'A', 'hero', PLAN)).toEqual([BOSS])
    expect(targetsOf(s, 'kruleboyzAllPartOfDaPlan', BOSS, 'A')).toEqual([GUT1])
    expect(targetsOf(s, 'kruleboyzAllPartOfDaPlan', BOSS, 'A')).not.toContain(BOSS)
    expect(stat(s, GUT1, 'OC')).toBe(1)
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'hero', 'A', PLAN, { target: GUT1 })
    expect(stat(s, GUT1, 'OC')).toBe(4)
    expect(stat(s, GUT2, 'OC')).toBe(1)
    expect(stat(s, BOSS, 'OC')).toBe(2)
    // survives the end of the turn and the opponent's turn; gone at the start of our next turn
    effectService.expire(ctx, 'turnEnd', null)
    effectService.expire(ctx, 'nextOwnTurn', 'B')
    expect(stat(s, GUT1, 'OC')).toBe(4)
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(stat(s, GUT1, 'OC')).toBe(1)
    // with nobody in range it is not offered
    place(s, GUT1, -12, -8)
    place(s, GUT2, 12, -5)
    expect(offered(s, 'A', 'hero')).not.toContain(PLAN)
  })

  it('KRU-AB-2 Skewered: Beast-skewer Bolts deal 6 damage per unsaved hit against a Monster, D6 otherwise', () => {
    const s = game({ patch: (b) => { b.datasheets['fx.brute'].keywords = [...b.datasheets['fx.brute'].keywords, 'MONSTER'] } })
    const damage = (target: UnitId) => weaponService.effectiveWeapon(s, s.units[BOW].models[0], BOLTS, attackOf(s, BOW, target, 'ranged', BOLTS)).D
    expect(String(damage('B:brute'))).toBe('6')
    expect(String(damage('B:guard'))).toBe('D6')
    expect(String(damage('B:boss'))).toBe('D6')
    // other weapons, and other units' weapons, are not touched
    expect(String(weaponService.effectiveWeapon(s, s.units[BOW].models[0], 'kruleboyz.weapon.jaggedy-blades', attackOf(s, BOW, 'B:brute', 'melee', 'kruleboyz.weapon.jaggedy-blades')).D)).toBe('1')
    expect(String(weaponService.effectiveWeapon(s, s.units[BOLT].models[0], CROSSBOW, attackOf(s, BOLT, 'B:brute', 'ranged', CROSSBOW)).D)).toBe('2')
    // a real shot: hit, wound, failed save against the Monster costs 6 Health (the Brute has 3)
    s.phase = 'shooting'
    place(s, BOW, 0, -8)
    place(s, 'B:brute', 0, 4)
    const before = woundsOf(s, 'B:brute')
    attack(s, 'ranged', [4, 2, 1], BOW, BOLTS, 'B:brute', 1)
    expect(before - woundsOf(s, 'B:brute')).toBe(6) // 6 points of damage: two 3 Health models die
    expect(s.units['B:brute'].models).toHaveLength(1)
  })

  it('KRU-AB-3 Breath of the Mire-drakes: one roll per enemy unit in combat; 1 = nothing, 2-5 = 1, 6 = D3 mortal damage; unavailable out of combat', () => {
    const s = game()
    s.phase = 'fight'
    only(s, [KNOB])
    place(s, KNOB, 0, -4)
    place(s, 'B:boss', -1.5, -1.2)
    place(s, 'B:brute', 1.5, -1.2)
    place(s, 'B:hawk', 9, 3)
    expect(offeredFor(s, 'A', 'fight', BREATH)).toEqual([KNOB])
    const calls: { target: string; count: number }[] = []
    const spy = { ...attackService, queueMortalWounds: (_c: EngineContext, target: string, count: number) => { calls.push({ target, count }) } }
    // 'B:boss' rolls a 4 (1 mortal damage), 'B:brute' rolls a 6 then the D3 face 6 (3 mortal damage); the Hawk is not in combat and gets no die
    const ctx = ctxFor(s, [4, 6, 6], { attack: spy })
    useOnce(ctx, 'fight', 'A', BREATH)
    expect(calls).toEqual([{ target: 'B:boss', count: 1 }, { target: 'B:brute', count: 3 }])
    expect(leftOver(ctx)).toEqual([])
    // a 1 does nothing, a 2 does 1
    const t = game()
    t.phase = 'fight'
    only(t, [KNOB])
    place(t, KNOB, 0, -4)
    place(t, 'B:boss', -1.5, -1.2)
    place(t, 'B:brute', 1.5, -1.2)
    const more: { target: string; count: number }[] = []
    const spy2 = { ...attackService, queueMortalWounds: (_c: EngineContext, target: string, count: number) => { more.push({ target, count }) } }
    useOnce(ctxFor(t, [1, 2], { attack: spy2 }), 'fight', 'A', BREATH)
    expect(more).toEqual([{ target: 'B:brute', count: 1 }])
    // out of combat: not offered
    const apart = game()
    apart.phase = 'fight'
    place(apart, KNOB, 0, -4)
    place(apart, 'B:boss', 0, 4)
    expect(offered(apart, 'A', 'fight')).not.toContain(BREATH)
    // the opponent's combat phase too
    const theirs = game()
    theirs.phase = 'fight'
    theirs.activePlayer = 'B'
    place(theirs, KNOB, 0, -4)
    place(theirs, 'B:boss', 0, -1.2)
    expect(offeredFor(theirs, 'A', 'fight', BREATH)).toEqual([KNOB])
  })

  // a Gutrippaz unit in combat with the Brute
  function scareGame() {
    const s = game()
    s.phase = 'fight'
    only(s, [GUT1, GUT2])
    engage(s, GUT1, 'B:brute', 0, -3)
    place(s, GUT2, -9, -6, 0.3)
    return s
  }

  it('KRU-AB-4 Scare Taktikz: on 3+, non-Hero attacks against the Gutrippaz get -1 to hit this phase; Hero attacks are unaffected; a failed roll does nothing', () => {
    const s = scareGame()
    expect(offeredFor(s, 'A', 'fight', SCARE)).toEqual([GUT1]) // only the unit in combat
    const bruteHit = () => rollModifier(s, attackOf(s, 'B:brute', GUT1, 'melee', 'fx.w.brute-axe'), 'hit')
    // the fixture general carries a +1 to hit enhancement: the Hero's number must stay exactly where it is
    const bossBase = rollModifier(s, attackOf(s, 'B:boss', GUT1, 'melee', 'fx.w.boss-blade'), 'hit')
    // a failed roll (2): nothing happens
    const miss = ctxFor(s, [2])
    useOnce(miss, 'fight', 'A', SCARE, { unit: GUT1 })
    expect(bruteHit()).toBe(0)
    // used up for this phase either way
    expect(offeredFor(s, 'A', 'fight', SCARE)).toEqual([])
    // a 3 works
    const t = scareGame()
    const ctx = ctxFor(t, [3])
    useOnce(ctx, 'fight', 'A', SCARE, { unit: GUT1 })
    const tBrute = () => rollModifier(t, attackOf(t, 'B:brute', GUT1, 'melee', 'fx.w.brute-axe'), 'hit')
    expect(tBrute()).toBe(-1)
    // the Hero attacker is exempt; the other Gutrippaz unit was not protected; our own attacks are normal
    expect(rollModifier(t, attackOf(t, 'B:boss', GUT1, 'melee', 'fx.w.boss-blade'), 'hit')).toBe(bossBase)
    expect(rollModifier(t, attackOf(t, 'B:brute', GUT2, 'melee', 'fx.w.brute-axe'), 'hit')).toBe(0)
    expect(rollModifier(t, attackOf(t, GUT1, 'B:brute', 'melee', 'kruleboyz.weapon.wicked-hacka'), 'hit')).toBe(0)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(tBrute()).toBe(0)
    // out of combat: not offered
    const apart = scareGame()
    place(apart, 'B:brute', 9, 3)
    expect(offered(apart, 'A', 'fight')).not.toContain(SCARE)
  })

  it('KRU-AB-5 Pick \'Em Off: +1 to hit for the crossbows after standing still or when never moved this turn; no bonus after a normal move, run, retreat or charge', () => {
    const s = game()
    const shot = attackOf(s, BOLT, 'B:brute', 'ranged', CROSSBOW)
    const hit = () => rollModifier(s, shot, 'hit')
    // never asked (the opponent's turn) and stationary both count as standing still
    s.units[BOLT].turn.moveType = null
    expect(hit()).toBe(1)
    s.units[BOLT].turn.moveType = 'stationary'
    expect(hit()).toBe(1)
    for (const moved of ['normal', 'advance', 'fallBack'] as const) {
      s.units[BOLT].turn.moveType = moved
      expect(hit(), moved).toBe(0)
    }
    s.units[BOLT].turn.moveType = 'stationary'
    s.units[BOLT].turn.chargedThisTurn = true
    expect(hit()).toBe(0)
    s.units[BOLT].turn.chargedThisTurn = false
    // melee attacks of the same unit never get it, and other units never do
    expect(rollModifier(s, attackOf(s, BOLT, 'B:brute', 'melee', 'kruleboyz.weapon.jaggedy-blade'), 'hit')).toBe(0)
    expect(rollModifier(s, attackOf(s, BOW, 'B:brute', 'ranged', BOLTS), 'hit')).toBe(0)
  })
})

describe('KRU-WEAP weapons', () => {
  it('KRU-WEAP-1 Crit (Auto-wound) on the crossbow and the bolts skips the wound roll on an unmodified 6 to hit', () => {
    const s = game()
    place(s, BOLT, 0, -8)
    place(s, BOW, 6, -8)
    place(s, 'B:brute', 0, 2)
    // a 6 to hit wounds automatically: no wound die is rolled, only the save (two dice in all)
    const six = attack(s, 'ranged', [6, 6], BOLT, CROSSBOW, 'B:brute', 1)
    expect(of(six.events, 'HitRolled')[0]).toMatchObject({ hit: true, critical: true })
    expect(of(six.events, 'WoundRolled')).toEqual([])
    expect(of(six.events, 'SaveRolled')).toHaveLength(1)
    expect(six.rng.remaining).toEqual([])
    // a 5 hits but must roll to wound: a 2 fails against 3+, and then nothing is saved
    const five = attack(s, 'ranged', [5, 2], BOLT, CROSSBOW, 'B:brute', 1)
    expect(of(five.events, 'HitRolled')[0]).toMatchObject({ hit: true, critical: false })
    expect(of(five.events, 'WoundRolled')[0]).toMatchObject({ wounded: false })
    expect(of(five.events, 'SaveRolled')).toEqual([])
    // the Killbow bolts too, even though they wound on 2+ already
    const bolts = attack(s, 'ranged', [6, 6], BOW, BOLTS, 'B:brute', 1)
    expect(of(bolts.events, 'WoundRolled')).toEqual([])
    expect(bolts.rng.remaining).toEqual([])
    // without the 6 the wound roll happens: 5 to hit, wound die 2 passes against 2+
    const plain = attack(s, 'ranged', [5, 2, 6], BOW, BOLTS, 'B:brute', 1)
    expect(of(plain.events, 'WoundRolled')[0]).toMatchObject({ wounded: true })
  })

  it('KRU-WEAP-2 Gnashtoof\'s Fangs (Companion) ignore friendly characteristic buffs, while the Boss-stikka takes them', () => {
    const s = game()
    const ctx = ctxFor(s, [])
    const a = (id: string) => weaponService.effectiveWeapon(s, s.units[BOSS].models[0], id, attackOf(s, BOSS, 'B:brute', 'melee', id))
    expect(a(STIKKA).A).toBe(4)
    expect(a(FANGS).A).toBe(5)
    effectService.grant(ctx, BOSS, { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } }, { sourceAbilityId: 'test.buff', sourceUnitId: BOSS, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    expect(a(STIKKA).A).toBe(5)
    expect(a(FANGS).A).toBe(5)
  })
})

describe('KRU-CAP modifier caps', () => {
  it('KRU-CAP-1 Scare Taktikz + Eye-biter Ash + a third -1 to hit against the same attack total -1 (CORE-2.5)', () => {
    const s = game({ enh: EYE })
    s.phase = 'fight'
    engage(s, GUT1, 'B:brute', 0, -3)
    place(s, BOSS, 3.2, -3.4) // in combat with the Brute as well
    expect(targetsOf(s, 'kruleboyzEyeBiterAsh', BOSS, 'A')).toEqual(['B:brute'])
    // untouched: a 4 hits on 4+
    const baseline = attack(game({ enh: EYE }), 'melee', [4, 1], 'B:brute', 'fx.w.brute-axe', GUT1, 1)
    void baseline
    const ctx = ctxFor(s, [3, 2])
    useOnce(ctx, 'fight', 'A', SCARE, { unit: GUT1 })
    useOnce(ctx, 'fight', 'A', EYE_AB, { target: 'B:brute' })
    // a third source of -1 to hit on the same attacker (stands in for cover)
    effectService.grant(ctx, 'B:brute', { modifyRoll: { roll: 'hit', value: -1 } }, { sourceAbilityId: 'test.cover', sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    const a = attackOf(s, 'B:brute', GUT1, 'melee', 'fx.w.brute-axe')
    expect(rollModifier(s, a, 'hit')).toBeLessThanOrEqual(-2) // the raw sum is -3 ...
    const r = attack(s, 'melee', [4, 1], 'B:brute', 'fx.w.brute-axe', GUT1, 1)
    const hit = of(r.events, 'HitRolled')[0]
    expect(hit.die).toBe(4)
    expect(hit.final).toBe(3) // ... but the roll is only ever -1: a 4 becomes a 3 and misses
    expect(hit.hit).toBe(false)
  })
})
