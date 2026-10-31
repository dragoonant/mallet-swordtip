// Hedonites of Slaanesh (Epicurean Revellers) code hooks: docs/spec/factions/hedonites-of-slaanesh.md, test ids HOS-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/slaanesh files on top of the AoS fixture bundle
// (player A = Epicurean Revellers, player B = the fixture Chaos army: Boss, Brutes, Hawk, Guard). Dice are scripted; nothing here
// patches the shipped data except where a test says so. Units start in reserves; each test places the ones it needs.
// (HOS-ARMY-1, HOS-ARMY-2 and HOS-WEAP-1 are in tests/data/slaanesh.test.ts.)
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, SeededRng, abilityService, createContext, removeModel, unitModels,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PendingDecision, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { canCast, castingRoll, unbinders, wizardLevel } from '../../src/engine/magic'
import { chargeRollModifier } from '../../src/engine/phases/charge'
import { fightModule, isChainedFight } from '../../src/engine/phases/fight'
import { checkSlide, parseSlide } from '../../src/engine/factions/aos-moves'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { favourBand, favourCount, slaaneshAbilityTiming, slaaneshTargetBonus } from '../../src/engine/factions/slaanesh'
import { readRedeploy } from '../../src/engine/redeploy'
import { modelStats } from '../../src/engine/state'
import { weaponService } from '../../src/engine/weapons'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import type { ChargeState } from '../../src/engine/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/slaanesh/abilities.json'
import enhancementsJson from '../../src/data/factions/slaanesh/enhancements.json'
import weaponsJson from '../../src/data/factions/slaanesh/weapons.json'
import factionJson from '../../src/data/factions/slaanesh/faction.json'
import patrolJson from '../../src/data/factions/slaanesh/patrols/epicurean-revellers.json'
import discordJson from '../../src/data/factions/slaanesh/datasheets/thricefold-discord.json'
import fiendsJson from '../../src/data/factions/slaanesh/datasheets/fiends.json'
import daemonettesJson from '../../src/data/factions/slaanesh/datasheets/daemonettes.json'
import seekersJson from '../../src/data/factions/slaanesh/datasheets/seekers.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  // cloned: a test that patches the data must not leak into the next one
  for (const a of structuredClone(abilitiesJson) as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of structuredClone(weaponsJson) as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of structuredClone([discordJson, fiendsJson, daemonettesJson, seekersJson].flat()) as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of structuredClone(enhancementsJson) as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.slaanesh = structuredClone(factionJson) as unknown as FactionData
  b.patrols[patrolJson.id] = structuredClone(patrolJson) as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const FAVOUR = 'slaanesh.ability.favour-most-fickle'
const BRINGERS = 'slaanesh.ability.bringers-of-degradation'
const ONSLAUGHT = 'slaanesh.ability.daemonic-onslaught'
const DISPENSERS = 'slaanesh.ability.dispensers-of-favour'
const SOPORIFIC = 'slaanesh.ability.soporific-musk'
const EXCESS_AB = 'slaanesh.ability.excess-of-violence'
const MUSK_AB = 'slaanesh.ability.irresistible-soul-musk'
const COURTIERS = 'slaanesh.enh.high-courtiers'
const GRACE = 'slaanesh.enh.twisted-grace'
const EXCESS = 'slaanesh.enh.excess-of-violence'
const MUSK = 'slaanesh.enh.irresistible-soul-musk'

const TD = 'A:thricefold-discord'
const FI = 'A:fiends'
const D1 = 'A:daemonettes-1'
const D2 = 'A:daemonettes-2'
const SK = 'A:seekers'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'

const W = (id: string) => `slaanesh.weapon.${id}`
const WIZARD = (b: DataBundle): void => { b.datasheets['fx.boss'].keywords = ['HERO', 'INFANTRY', 'WIZARD']; b.datasheets['fx.boss'].wizard = 1 }

// the unit's models in a tight row centred on (cx, cz); the unit goes onto the board
function centreRow(s: GameState, unitId: UnitId, cx: number, cz: number, gap = 0.15): void {
  const ms = unitModels(s, unitId)
  const r = Math.max(...ms.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
  const step = 2 * r + gap
  s.units[unitId].location = 'board'
  ms.forEach((m, i) => { m.pos = { x: cx + (i - (ms.length - 1) / 2) * step, y: 0, z: cz } })
}

const trim = (s: GameState, unitId: UnitId, n: number): void => {
  for (const id of [...s.units[unitId].models].slice(n)) { delete s.models[id]; s.units[unitId].models = s.units[unitId].models.filter((m) => m !== id) }
}

// every model of the unit slain
const kill = (s: GameState, unitId: UnitId): void => { for (const id of [...s.units[unitId].models]) removeModel(s, id) }

// a new turn: the per-unit "used this phase" marks of the previous one are gone
const newTurn = (s: GameState, player: PlayerId): void => {
  s.activePlayer = player
  for (const u of Object.values(s.units)) u.turn.abilitiesUsedThisPhase = []
}

// one model of the unit on the board at (x, z), the rest dropped (not slain)
function put(s: GameState, unitId: UnitId, x: number, z: number): void {
  trim(s, unitId, 1)
  s.units[unitId].location = 'board'
  unitModels(s, unitId)[0].pos = { x, y: 0, z }
}

function game(opts: { enh?: string; reg?: string; round?: number; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'slaanesh', patrolId: 'slaanesh.army.epicurean-revellers', enhancementId: opts.enh ?? COURTIERS, regimentAbilityId: opts.reg ?? BRINGERS }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  s.round = opts.round ?? 1
  s.phase = 'command'
  s.activePlayer = 'A'
  return s
}

// the army on the board in the given strength, spread so nothing overlaps (units left out stay in reserves and do not count for Favour)
interface Roster { td?: number; fi?: boolean; d1?: boolean; d2?: boolean; sk?: boolean }
function field(s: GameState, r: Roster): GameState {
  if (r.td) { trim(s, TD, r.td); centreRow(s, TD, 0, -9) }
  if (r.fi) centreRow(s, FI, -9, -9)
  if (r.d1) centreRow(s, D1, 9, -9)
  if (r.d2) centreRow(s, D2, 3, -4.5)
  if (r.sk) centreRow(s, SK, -9, -4.5, 0.1)
  return s
}
const FULL: Roster = { td: 3, fi: true, d1: true, d2: true, sk: true }

const rngs = new WeakMap<EngineContext, ScriptedRng>()
const eventLogs = new WeakMap<EngineContext, GameEvent[]>()
const ctxFor = (s: GameState, dice: number[] = []): EngineContext => {
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  rngs.set(ctx, rng)
  eventLogs.set(ctx, events)
  return ctx
}
const leftOver = (ctx: EngineContext): number[] => rngs.get(ctx)?.remaining ?? []
const evOf = (ctx: EngineContext): GameEvent[] => eventLogs.get(ctx) ?? []
const summaries = (ctx: EngineContext): string[] => evOf(ctx).filter((e): e is Extract<GameEvent, { type: 'AbilityTriggered' }> => e.type === 'AbilityTriggered').map((e) => e.summary)
const of = <T extends GameEvent['type']>(list: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  list.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

type Pick = (topic: string, ids: string[], p: ChooseOptionDecision) => string

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: Pick): string[] {
  const topics: string[] = []
  for (let i = 0; i < 40; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return topics
    const p = ctx.state.pending as ChooseOptionDecision
    const ids = p.options.map((o) => o.id)
    topics.push(p.context.topic)
    const choice = pick(p.context.topic, ids, p)
    ctx.state.pending = null
    const action = choice === 'pass' ? { type: 'pass' as const, player, decisionId: p.id } : { type: 'chooseOption' as const, player, decisionId: p.id, optionId: choice }
    const rej = abilityService.handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

// use one ability once; every other offer is declined. `targets` = the units to pick in order ('__done' ends a multi-pick)
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { targets?: string[]; move?: (ids: string[]) => string } = {}): string[] {
  let used = false
  const queue = [...(opts.targets ?? [])]
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') {
      const want = queue.shift()
      return want && ids.includes(want) ? want : ids.includes('__done') ? '__done' : ids[0]
    }
    if (topic === 'abilityMode' && opts.move) return opts.move(ids)
    return ids[0]
  })
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const targetsOf = (code: string, s: GameState, unitId: UnitId | null, player: PlayerId): UnitId[] =>
  (codeHooks[code].activate!.targets as unknown as (state: GameState, unitId: UnitId | null, player: PlayerId) => UnitId[])(s, unitId, player)
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const weaponOf = (s: GameState, unitId: UnitId, weaponId: string) => {
  const m = unitModels(s, unitId).find((x) => x.weapons.includes(weaponId))!
  return weaponService.effectiveWeapon(s, m.id, weaponId)!
}
const statOf = (s: GameState, unitId: UnitId, stat: 'OC' | 'M'): number => {
  const m = unitModels(s, unitId)[0]
  return hookService.statFor(s, { unitId, modelId: m.id, weapon: null, stat }, modelStats(s, m)[stat])
}
const oc = (s: GameState, unitId: UnitId): number => statOf(s, unitId, 'OC')
const move = (s: GameState, unitId: UnitId): number => statOf(s, unitId, 'M')

// ---------- attacks with scripted dice ----------
function attack(s: GameState, kind: 'ranged' | 'melee', dice: number[], attackerUnitId: UnitId, weaponId: string, targetUnitId: UnitId, attacks: number | null) {
  s.phase = kind === 'ranged' ? 'shooting' : 'fight'
  const modelId = s.units[attackerUnitId].models.find((id) => s.models[id].weapons.includes(weaponId))!
  const target: DeclaredTarget = { modelId, weaponId, targetUnitId, profileGroup: null, attacks }
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets: [target] })
  expect(attackService.advance(ctx)).toBe('done')
  return { events, rng, ctx }
}
const hitsOf = (events: GameEvent[]): number => of(events, 'HitRolled').filter((h) => h.hit).length
// hits counting the extra hits a critical hit scores (Crit (2 Hits))
const totalHits = (events: GameEvent[]): number => of(events, 'HitRolled').reduce((n, h) => n + (h.hit ? 1 + h.extraHits : 0), 0)
const woundsOf = (events: GameEvent[]): number => of(events, 'WoundRolled').filter((h) => h.wounded).length

// a 2D6 charge roll with the given dice, and the modifier the charge-roll hooks add to it
function chargeMod(s: GameState, unitId: UnitId, dice: [number, number] = [3, 3]): number {
  const ctx = ctxFor(s, dice)
  const roll = ctx.roll({ purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId })
  const charge: ChargeState = { unitId, targetUnitIds: [], roll: dice, rerolled: false, distance: null, heroic: false }
  return chargeRollModifier(ctx, charge, roll)
}

// the needed value of the ward roll when B's Guard hits one Daemonette of `unitId` (hit 4, wound 4, save 1 fails, ward 5)
function wardNeeded(s: GameState, unitId: UnitId, place = true): number | undefined {
  if (place) { centreRow(s, unitId, 0, -2); centreRow(s, GUARD, 0, 1) } else { const z = unitModels(s, unitId)[0].pos.z; centreRow(s, GUARD, 0, z - 2.6) }
  return of(attack(s, 'melee', [4, 4, 1, 5], GUARD, 'fx.w.guard-spear', unitId, 1).events, 'FeelNoPainRolled')[0]?.needed
}

// ---------- tests ----------
describe('HOS-ARMY', () => {
  it('HOS-ARMY-3 only the two Daemonettes units can be replaced: Call for Reinforcements never names the Thricefold Discord, Fiends or Seekers', () => {
    const s = game()
    for (const id of [TD, FI, D1, D2, SK]) {
      const kw = s.datasheets[s.units[id].datasheetId].keywords
      expect(kw.includes('REINFORCEMENTS'), id).toBe(id === D1 || id === D2)
      kill(s, id)
    }
    expect(replaceableUnits(s, 'A').sort()).toEqual([D1, D2])
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).toContain('core.ability.call-for-reinforcements')
    expect(targetsOf('spearheadCallForReinforcements', s, null, 'A').sort()).toEqual([D1, D2])
    // with only the other three destroyed nothing is on offer
    const t = game()
    for (const id of [TD, FI, SK]) kill(t, id)
    expect(replaceableUnits(t, 'A')).toEqual([])
    t.phase = 'movement'
    expect(offered(t, 'A', 'movement')).not.toContain('core.ability.call-for-reinforcements')
  })
})

describe('HOS-BT Favour Most Fickle', () => {
  it('HOS-BT-1 the count: the full army counts 7 (each Herald one), a slain Herald, a destroyed unit or a unit in reserve lowers it, and the bands run 5+ / 4 / 3 / 2 / 1', () => {
    const s = field(game(), FULL)
    expect(favourCount(s, 'A')).toBe(7)
    expect(s.players.A.battleTraitIds).toEqual([FAVOUR])
    expect(favourCount(s, 'B')).toBe(0)
    removeModel(s, s.units[TD].models[2])
    expect(favourCount(s, 'A')).toBe(6)
    kill(s, FI)
    expect(favourCount(s, 'A')).toBe(5)
    s.units[SK].location = 'reserves'
    expect(favourCount(s, 'A')).toBe(4)
    // a Call for Reinforcements replacement counts once it is back on the board (a unit that is on the board counts once)
    s.units[SK].location = 'board'
    expect(favourCount(s, 'A')).toBe(5)
    expect([7, 5, 4, 3, 2, 1, 0].map(favourBand)).toEqual(['control', 'control', 'combat', 'move', 'ward', 'attacks', null])
    // the HUD readout names the count and the band
    const readout = codeHooks.slaaneshFavourMostFickle.resourceReadout!(s, s.abilities[FAVOUR], 'A')!
    expect(readout).toMatchObject({ value: 5, max: 7 })
    expect(readout.help).toMatch(/\+2 Control/)
    // the band is read live: one more loss changes what the army gets in the very next query
    expect(oc(s, D1)).toBe(3)
    kill(s, D2)
    expect(favourCount(s, 'A')).toBe(4)
    expect(oc(s, D1)).toBe(1)
  })

  it('HOS-BT-2 band 5+: +2 Control on every model of every friendly unit, nothing else', () => {
    const s = field(game(), FULL)
    expect(oc(s, D1)).toBe(3)
    expect(oc(s, TD)).toBe(4) // 2 + 2
    expect(oc(s, SK)).toBe(3)
    expect(oc(s, FI)).toBe(3)
    // nothing else: no run or charge bonus, no melee bonus, no extra Attacks, no better Ward
    expect(hookService.advanceRollFor(s, D1, 3)).toBe(3)
    expect(chargeMod(s, D1)).toBe(0)
    expect(weaponOf(s, D1, W('piercing-claws')).A).toBe(2)
    expect(weaponOf(s, SK, W('steeds-poisoned-tongue')).A).toBe(2)
    centreRow(s, SK, 0, -2)
    centreRow(s, BRUTE, 0, 1)
    expect(hitsOf(attack(s, 'melee', [2, 2], SK, W('steeds-poisoned-tongue'), BRUTE, 2).events)).toBe(0)
    expect(wardNeeded(s, D1)).toBe(6)
    // the enemy gets nothing
    expect(oc(s, BRUTE)).toBe(1)
    // 6 units still counts as 5+
    removeModel(s, s.units[TD].models[0])
    expect(oc(s, D1)).toBe(3)
  })

  it('HOS-BT-3 band 4: +1 to hit and +1 to wound on melee attacks, the Steed\'s Poisoned Tongue included; capped at +1 with Dispensers of Favour', () => {
    const s = field(game(), { td: 1, fi: true, d1: true, sk: true })
    expect(favourCount(s, 'A')).toBe(4)
    // no Control, run, charge or Ward bonus in this band
    expect(oc(s, D1)).toBe(1)
    expect(hookService.advanceRollFor(s, D1, 3)).toBe(3)
    expect(chargeMod(s, D1)).toBe(0)
    centreRow(s, SK, 0, -2)
    centreRow(s, BRUTE, 0, 1)
    // the Tongue hits on 3+ and wounds on 4+: with the band a 2 hits and a 3 wounds (saves of 1 fail against Sv 3+)
    const r = attack(s, 'melee', [2, 2, 3, 3, 1, 1], SK, W('steeds-poisoned-tongue'), BRUTE, 2)
    expect(hitsOf(r.events)).toBe(2)
    expect(woundsOf(r.events)).toBe(2)
    // the Agonising Claws (a non-Companion weapon) get it too
    const c = attack(s, 'melee', [2, 2, 2, 3, 3, 3, 1, 1, 1], SK, W('agonising-claws'), BRUTE, 3)
    expect(hitsOf(c.events)).toBe(3)
    expect(woundsOf(c.events)).toBe(3)
    // shooting is not combat: no ranged weapon in this army, but a ranged attack of the enemy at the army is untouched
    expect(weaponOf(s, SK, W('agonising-claws')).A).toBe(3)
    // the Fiends hit on 4+: the band makes it 3+, Dispensers of Favour' +1 on top is capped at +1 in total
    const f = field(game(), { td: 1, fi: true, d1: true, sk: true })
    centreRow(f, FI, 0, -2)
    centreRow(f, BRUTE, 0, 1)
    const base = hitsOf(attack(f, 'melee', [2, 3, 3, 1, 1], FI, W('deadly-pincers-and-barbed-stinger'), BRUTE, 3).events)
    expect(base).toBe(2) // 2 misses, 3 and 3 hit
    const { ctx } = createContext(f, new ScriptedRng([]), DEFAULT_MODULES)
    effectService.grant(ctx, FI, { when: { weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: 1 } }, { sourceAbilityId: DISPENSERS, sourceUnitId: TD, scope: { who: 'self' }, duration: 'untilNextTurn' })
    expect(hitsOf(attack(f, 'melee', [2, 3, 3, 1, 1], FI, W('deadly-pincers-and-barbed-stinger'), BRUTE, 3).events)).toBe(2) // still no 2
    // and the enemy attacking the army gets nothing from it
    expect(hitsOf(attack(f, 'melee', [2, 2], BRUTE, 'fx.w.brute-axe', FI, 2).events)).toBe(0)
  })

  it('HOS-BT-4 band 3: +1 to run rolls and +1 to charge rolls only', () => {
    const s = field(game(), { td: 1, fi: true, d1: true })
    expect(favourCount(s, 'A')).toBe(3)
    expect(hookService.advanceRollFor(s, D1, 3)).toBe(4)
    expect(hookService.advanceRollFor(s, BRUTE, 3)).toBe(3)
    expect(chargeMod(s, D1)).toBe(1)
    expect(chargeMod(s, FI)).toBe(1)
    expect(chargeMod(s, TD)).toBe(1)
    // nothing else
    expect(oc(s, D1)).toBe(1)
    expect(weaponOf(s, D1, W('piercing-claws')).A).toBe(2)
    centreRow(s, FI, 0, -2)
    centreRow(s, BRUTE, 0, 1)
    expect(hitsOf(attack(s, 'melee', [3, 3, 3], FI, W('deadly-pincers-and-barbed-stinger'), BRUTE, 3).events)).toBe(0) // still 4+
    expect(wardNeeded(s, D1)).toBe(6)
  })

  it('HOS-BT-5 band 2: every friendly unit has Ward (5+), the enemy does not', () => {
    const s = field(game(), { td: 1, d1: true })
    expect(favourCount(s, 'A')).toBe(2)
    // the Daemonettes print Ward 6+: a 5 now saves
    expect(wardNeeded(s, D1)).toBe(5)
    const t = field(game(), { td: 1, d1: true, fi: true })
    expect(wardNeeded(t, D1)).toBe(6) // three units: no Ward bonus
    // the Thricefold Discord prints Ward 5+, so the band changes nothing for it
    expect(wardNeeded(s, TD)).toBe(5)
    // the enemy keeps its own Ward (none here)
    centreRow(s, BRUTE, 0, 1)
    centreRow(s, D1, 0, -2)
    expect(of(attack(s, 'melee', [4, 4, 1, 5], D1, W('piercing-claws'), BRUTE, 1).events, 'FeelNoPainRolled')).toHaveLength(0)
  })

  it('HOS-BT-6 band 1: +2 Attacks on every melee weapon, the Companion weapon included', () => {
    const s = field(game(), { sk: true })
    expect(favourCount(s, 'A')).toBe(1)
    expect(weaponOf(s, SK, W('agonising-claws')).A).toBe(5)
    expect(weaponOf(s, SK, W('steeds-poisoned-tongue')).A).toBe(4)
    expect(oc(s, SK)).toBe(1)
    // the lone Thricefold model counts as one unit too
    const t = field(game(), { td: 1 })
    expect(favourCount(t, 'A')).toBe(1)
    expect(weaponOf(t, TD, W('thricefold-arsenal')).A).toBe(5)
    // two units: no Attacks bonus
    const u = field(game(), { sk: true, d1: true })
    expect(weaponOf(u, SK, W('agonising-claws')).A).toBe(3)
    expect(weaponOf(u, SK, W('steeds-poisoned-tongue')).A).toBe(2)
  })

  it('HOS-AB-1 Thricefold Court: each live Herald counts as a unit; 2 live Heralds add 2, none adds 0', () => {
    const s = field(game(), { td: 3 })
    expect(favourCount(s, 'A')).toBe(3)
    removeModel(s, s.units[TD].models[1])
    expect(favourCount(s, 'A')).toBe(2)
    const t = field(game(), { td: 3, fi: true })
    expect(favourCount(t, 'A')).toBe(4)
    removeModel(t, t.units[TD].models[0])
    removeModel(t, t.units[TD].models[0])
    expect(favourCount(t, 'A')).toBe(2) // 1 Herald + the Fiends
    kill(t, TD)
    expect(favourCount(t, 'A')).toBe(1)
    // the datasheet carries the marker
    expect(t.datasheets[t.units[TD].datasheetId].abilities).toContain('slaanesh.ability.thricefold-court')
  })
})

describe('HOS-RA regiment abilities', () => {
  // a fight: both Daemonettes units in combat, A picks first
  function daemonetteFight(opts: { d2InCombat?: boolean } = {}): GameState {
    const s = game({ reg: BRINGERS })
    s.phase = 'fight'
    centreRow(s, D1, -8, -1.2)
    centreRow(s, BOSS, -8, 1.8)
    if (opts.d2InCombat ?? true) { centreRow(s, D2, 8, -1.2); centreRow(s, BRUTE, 8, 1.8) } else { centreRow(s, D2, 8, -9) }
    centreRow(s, TD, 0, -9)
    return s
  }
  // drive the whole combat phase; A takes the Daemonettes first, `useBringers` decides the fightAfter offer
  function runFight(s: GameState, useBringers: boolean) {
    const { ctx, events } = createContext(s, new SeededRng('hos-bringers'), DEFAULT_MODULES)
    fightModule.enter(ctx)
    const picks: { player: string; unit: string }[] = []
    const offers: string[][] = []
    const chainedSeen: string[] = []
    for (let i = 0; i < 800 && fightModule.advance(ctx) !== 'done'; i++) {
      const p = s.pending as PendingDecision
      s.pending = null
      if (p.kind === 'chooseOption') {
        const ids = p.options.map((o) => o.id)
        if (p.context.topic === 'abilityUse') offers.push(ids)
        const want = p.context.topic === 'abilityUse' && useBringers ? ids.find((id) => id.startsWith(BRINGERS)) : undefined
        const action = want ? p.options.find((o) => o.id === want)!.action : { type: 'pass' as const, player: p.player, decisionId: p.id }
        expect(abilityService.handler.handle(ctx, action, p)).toBeUndefined()
        continue
      }
      let action = (fightModule.legalActions?.(s, p) ?? [])[0]
      if (p.kind === 'chooseFightUnit') {
        const first = p.player === 'A' && picks.every((x) => x.player !== 'A') ? p.options.find((o) => o.id === D1) : undefined
        if (first) action = first.action
        picks.push({ player: p.player, unit: (action as { unitId: string }).unitId })
      }
      if (p.kind === 'pileIn') {
        const u = (p as PendingDecision & { kind: 'pileIn' }).context.unitId
        if (isChainedFight(s, u)) chainedSeen.push(u)
      }
      fightModule.handle(ctx, action, p)
    }
    return { picks, offers, chainedSeen, selected: of(events, 'FightUnitSelected').map((e) => e.unitId) }
  }

  it('HOS-RA-1 Bringers of Degradation: after one Daemonettes unit fights the other fights next before the opponent picks; never chains a third; not offered when the second cannot be picked', () => {
    const s = daemonetteFight()
    const r = runFight(s, true)
    expect(r.selected.slice(0, 2)).toEqual([D1, D2])
    expect(r.picks.filter((p) => p.player === 'A')).toHaveLength(1) // A picked once; the chained unit had no pick decision
    expect(r.selected.slice(2).sort()).toEqual([BOSS, BRUTE])
    expect(r.chainedSeen).toEqual([D2])
    expect(r.offers[0].some((id) => id.startsWith(BRINGERS))).toBe(true)
    // the chained activation offers nothing further (exactly one offer, after D1)
    expect(r.offers.filter((o) => o.some((id) => id.startsWith(BRINGERS)))).toHaveLength(1)
    // without the ability the opponent picks in between: D1, B, D2, B
    const t = daemonetteFight()
    const plain = runFight(t, false)
    expect(plain.picks.map((p) => p.player).slice(0, 3)).toEqual(['A', 'B', 'A'])
    expect(plain.selected[1]).not.toBe(D2)
    // the second unit is not in combat: it cannot be picked, so nothing is offered
    const u = daemonetteFight({ d2InCombat: false })
    const out = runFight(u, true)
    expect(out.offers.flat().some((id) => id.startsWith(BRINGERS))).toBe(false)
    expect(out.selected).not.toContain(D2)
    // other units never qualify: the Fiends in combat are not a Daemonettes unit
    const v = daemonetteFight({ d2InCombat: false })
    centreRow(v, FI, 0, -1.2)
    centreRow(v, BOSS, 0, 1.8)
    expect(runFight(v, true).offers.flat().some((id) => id.startsWith(BRINGERS))).toBe(false)
  })

  it('HOS-RA-2 Daemonic Onslaught: offered once, in the deployment window; only Seekers / Fiends wholly within 12" of the general; the Normal Move never ends in or passes through enemy combat range', () => {
    const s = game({ reg: ONSLAUGHT })
    s.phase = 'deployment'
    centreRow(s, TD, 11, -9)
    centreRow(s, SK, 5, -5.5, 0.1) // 5 models, within 12" of the general
    centreRow(s, FI, -9, -9) // 20"+ from the general
    centreRow(s, D1, 9, -2) // a Daemonettes unit near the general is never a target
    centreRow(s, BRUTE, -2, 3)
    expect(offered(s, 'A', 'deployment')).toContain(ONSLAUGHT)
    expect(offered(s, 'B', 'deployment')).not.toContain(ONSLAUGHT)
    expect(offered(s, 'A', 'hero')).not.toContain(ONSLAUGHT)
    expect(offered(s, 'A', 'movement')).not.toContain(ONSLAUGHT)
    expect(targetsOf('slaaneshDaemonicOnslaught', s, null, 'A')).toEqual([SK])
    // the Fiends move into range of the general and become a target as well
    centreRow(s, FI, 3, -9)
    expect(targetsOf('slaaneshDaemonicOnslaught', s, null, 'A').sort()).toEqual([FI, SK])
    centreRow(s, FI, -9, -9)
    const ctx = ctxFor(s)
    const before = unitModels(s, SK).map((m) => ({ ...m.pos }))
    let optionsSeen: string[] = []
    const topics = useOnce(ctx, 'deployment', 'A', ONSLAUGHT, {
      move: (ids) => {
        optionsSeen = ids
        return ids.find((id) => id !== 'mv:0:0') ?? ids[0]
      },
    })
    expect(topics).toContain('abilityMode')
    expect(optionsSeen.length).toBeGreaterThan(1)
    // every option on offer was a legal Normal Move of at most 14" that ends out of combat
    const moves = optionsSeen.map((id) => parseSlide(id)!).filter((m) => Math.hypot(m.dx, m.dz) > 0)
    expect(moves.length).toBeGreaterThan(0)
    const after = unitModels(s, SK).map((m) => ({ ...m.pos }))
    const moved = Math.hypot(after[0].x - before[0].x, after[0].z - before[0].z)
    expect(moved).toBeGreaterThan(1)
    expect(moved).toBeLessThanOrEqual(14 + 1e-6)
    for (const m of unitModels(s, SK)) for (const e of unitModels(s, BRUTE)) expect(horizontalGap(m, e)).toBeGreaterThan(3)
    // once per battle: not offered again
    expect(offered(s, 'A', 'deployment')).not.toContain(ONSLAUGHT)
    expect(summaries(ctx).some((x) => x.includes('Normal Move'))).toBe(true)
    // a path through the enemy's combat range is refused: with the Brute right in front, the straight slide through it is not legal
    const t = game({ reg: ONSLAUGHT })
    centreRow(t, TD, 11, -9)
    centreRow(t, SK, 5, -5.5, 0.1)
    centreRow(t, BRUTE, 5, 0)
    expect(checkSlide(t, SK, 0, 2, 14, false, { normalMove: true }).ok).toBe(false)
    expect(checkSlide(t, SK, -8, 0, 14, false, { normalMove: true }).ok).toBe(true)
  })
})

describe('HOS-ENH enhancements', () => {
  it('HOS-ENH-1 Twisted Grace: the general\'s pile-in reaches 3" + D6" only in a turn it charged', () => {
    const s = game({ enh: GRACE })
    s.phase = 'fight'
    centreRow(s, TD, 0, -1.4)
    trim(s, GUARD, 1)
    put(s, GUARD, 0, 1.9)
    // not charged: nothing
    expect(hookService.pileInBonusFor(s, TD)).toEqual([])
    s.units[TD].turn.chargedThisTurn = true
    expect(hookService.pileInBonusFor(s, TD)).toEqual([{ expr: 'D6', sourceId: 'slaanesh.ability.twisted-grace' }])
    // other units of the army do not get it
    s.units[FI].turn.chargedThisTurn = true
    centreRow(s, FI, 8, -9)
    expect(hookService.pileInBonusFor(s, FI)).toEqual([])
    // the pile-in decision of the charging general: 3 + the D6 (a 5)
    const { ctx, events } = createContext(s, new ScriptedRng([5, 1, 1, 1, 1, 1, 1, 1]), DEFAULT_MODULES)
    fightModule.enter(ctx)
    expect(fightModule.advance(ctx)).toBe('pending')
    const pick = s.pending as PendingDecision & { kind: 'chooseFightUnit' }
    s.pending = null
    fightModule.handle(ctx, pick.options.find((o) => o.id === TD)!.action, pick)
    expect(fightModule.advance(ctx)).toBe('pending')
    const pile = s.pending as unknown as PendingDecision & { kind: 'pileIn' }
    expect(pile.kind).toBe('pileIn')
    expect(pile.context.distance).toBe(8)
    expect(of(events, 'AbilityTriggered').some((e) => e.abilityId === 'slaanesh.ability.twisted-grace' && /\+5"/.test(e.summary))).toBe(true)
    // the same fight in a turn it did not charge: the plain 3"
    const t = game({ enh: GRACE })
    t.phase = 'fight'
    centreRow(t, TD, 0, -1.4)
    trim(t, GUARD, 1)
    put(t, GUARD, 0, 1.9)
    const c2 = createContext(t, new ScriptedRng([5, 1, 1, 1, 1, 1, 1, 1]), DEFAULT_MODULES)
    fightModule.enter(c2.ctx)
    fightModule.advance(c2.ctx)
    const pick2 = t.pending as PendingDecision & { kind: 'chooseFightUnit' }
    t.pending = null
    fightModule.handle(c2.ctx, pick2.options.find((o) => o.id === TD)!.action, pick2)
    fightModule.advance(c2.ctx)
    expect((t.pending as unknown as PendingDecision & { kind: 'pileIn' }).context.distance).toBe(3)
    // a different enhancement does not carry it
    const u = game({ enh: COURTIERS })
    u.units[TD].turn.chargedThisTurn = true
    centreRow(u, TD, 0, -5)
    expect(hookService.pileInBonusFor(u, TD)).toEqual([])
  })

  it('HOS-ENH-2 High Courtiers: Ward 5+ for a Daemonettes unit while every Herald is within 3" of it; none when one Herald is outside', () => {
    const s = game({ enh: COURTIERS })
    centreRow(s, TD, 0, -5)
    centreRow(s, D1, 0, -7)
    centreRow(s, D2, 12, 4)
    const dm = unitModels(s, D1)[0].id
    const d2m = unitModels(s, D2)[0].id
    expect(hookService.feelNoPainAdjust(s, dm, 6)).toMatchObject({ threshold: 5 })
    expect(hookService.feelNoPainAdjust(s, d2m, 6)).toBeNull() // another Daemonettes unit, far from the general
    // the general itself has Ward 5+ already and keeps it
    expect(hookService.feelNoPainAdjust(s, unitModels(s, TD)[0].id, 5)).toMatchObject({ threshold: 5 })
    // through a real attack
    expect(wardNeeded(s, D1, false)).toBe(5)
    // one Herald steps away: the general is no longer wholly within combat range of the unit, the unit loses it
    centreRow(s, TD, 0, -5)
    centreRow(s, D1, 0, -7)
    unitModels(s, TD)[2].pos = { x: 9, y: 0, z: 2 }
    expect(hookService.feelNoPainAdjust(s, dm, 6)).toBeNull()
    // other enhancements do not give it
    const t = game({ enh: GRACE })
    centreRow(t, TD, 0, -5)
    centreRow(t, D1, 0, -7)
    expect(hookService.feelNoPainAdjust(t, unitModels(t, D1)[0].id, 6)).toBeNull()
    // the enemy gets nothing
    centreRow(s, TD, 0, -5)
    centreRow(s, D1, 0, -7)
    centreRow(s, BRUTE, 12, 6)
    expect(hookService.feelNoPainAdjust(s, unitModels(s, BRUTE)[0].id, 6)).toBeNull()
  })

  it('HOS-ENH-3b the enhancement follows the general: when its first model is slain it passes to a surviving Herald, and is gone with the last', () => {
    const s = game({ enh: EXCESS })
    s.phase = 'fight'
    centreRow(s, TD, 0, -5)
    centreRow(s, SK, -2, -8.5, 0.1)
    const bearer = (): string | null => (Object.values(s.abilities).find((a) => a.id === EXCESS_AB)?.bearerModelId as string | undefined) ?? null
    const first = s.units[TD].models[0]
    expect(bearer()).toBe(first)
    const ctx = ctxFor(s)
    const snap = structuredClone(s.models[first])
    removeModel(s, first)
    s.units[TD].destroyedModels = [snap]
    codeHooks.slaaneshFavourMostFickle.onOwnModelSlain!(ctx, { ability: s.abilities[FAVOUR], unitId: TD, model: snap, by: { kind: 'melee', unitId: BRUTE } as never })
    expect(bearer()).toBe(s.units[TD].models[0])
    expect(offered(s, 'A', 'fight')).toContain(EXCESS_AB)
    expect(hookService.pileInBonusFor(s, TD)).toEqual([]) // not the Twisted Grace enhancement
  })

  it('HOS-ENH-3 Excess of Violence: Crit (2 Hits) on the target\'s melee and Companion weapons until the start of your next turn; once per battle; target visible and wholly within 12"', () => {
    const base = (): GameState => {
      const s = game({ enh: EXCESS })
      s.phase = 'fight'
      centreRow(s, TD, 0, -5)
      centreRow(s, SK, -2, -8.5, 0.1) // inside 12"
      centreRow(s, D1, 9, -2) // the far end of the row is outside 12"
      centreRow(s, FI, -9, 2) // wholly outside
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'fight')).toContain(EXCESS_AB)
    expect(offered(s, 'B', 'fight')).not.toContain(EXCESS_AB)
    const targets = targetsOf('slaaneshExcessOfViolence', s, TD, 'A')
    expect(targets).toContain(TD) // the general itself is allowed
    expect(targets).toContain(SK)
    expect(targets).not.toContain(FI)
    const ctx = ctxFor(s)
    expect(weaponOf(s, SK, W('agonising-claws')).abilities.some((a) => a.ability === 'CRIT_2_HITS')).toBe(false)
    useOnce(ctx, 'fight', 'A', EXCESS_AB, { targets: [SK] })
    for (const w of ['agonising-claws', 'steeds-poisoned-tongue']) expect(weaponOf(s, SK, W(w)).abilities.some((a) => a.ability === 'CRIT_2_HITS'), w).toBe(true)
    expect(weaponOf(s, D1, W('piercing-claws')).abilities.some((a) => a.ability === 'CRIT_2_HITS')).toBe(false)
    expect(summaries(ctx).some((x) => x.includes('Crit (2 Hits)'))).toBe(true)
    // it works: a 6 to hit scores two hits
    centreRow(s, BRUTE, -2, -5.3)
    const r = attack(s, 'melee', [6, 1, 1, 1], SK, W('agonising-claws'), BRUTE, 2)
    expect(totalHits(r.events)).toBe(2)
    // once per battle, even in the next round's combat phase
    newTurn(s, 'A')
    s.round = 2
    expect(offered(s, 'A', 'fight')).not.toContain(EXCESS_AB)
    // until the start of your next turn: the opponent's turn start keeps it, yours ends it
    const c2 = ctxFor(s)
    effectService.expire(c2, 'nextOwnTurn', 'B')
    expect(weaponOf(s, SK, W('agonising-claws')).abilities.some((a) => a.ability === 'CRIT_2_HITS')).toBe(true)
    effectService.expire(c2, 'nextOwnTurn', 'A')
    expect(weaponOf(s, SK, W('agonising-claws')).abilities.some((a) => a.ability === 'CRIT_2_HITS')).toBe(false)
    // the general can pick itself
    const t = base()
    useOnce(ctxFor(t), 'fight', 'A', EXCESS_AB, { targets: [TD] })
    expect(weaponOf(t, TD, W('thricefold-arsenal')).abilities.some((a) => a.ability === 'CRIT_2_HITS')).toBe(true)
    // other enhancements never offer it
    expect(offered(game({ enh: COURTIERS }), 'A', 'fight')).not.toContain(EXCESS_AB)
  })

  it('HOS-ENH-4 Irresistible Soul-Musk: Seekers / Fiends are set up more than 6" from every enemy; no Move abilities after it that movement phase; once per battle', () => {
    const base = (): GameState => {
      const s = game({ enh: MUSK })
      s.phase = 'movement'
      centreRow(s, TD, 0, -9)
      centreRow(s, SK, 2, -4.5, 0.1) // within 12" of the general, 3" from the Brute
      centreRow(s, FI, -11, -5) // too far from the general
      centreRow(s, D1, 8, -9) // a Daemonettes unit is never a target
      centreRow(s, BRUTE, 2, -1.5)
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'movement')).toContain(MUSK_AB)
    expect(offered(s, 'B', 'movement')).not.toContain(MUSK_AB)
    expect(targetsOf('slaaneshSoulMusk', s, TD, 'A')).toEqual([SK])
    expect(unitModels(s, SK).some((m) => unitModels(s, BRUTE).some((b) => horizontalGap(m, b) <= 3))).toBe(true)
    const ctx = ctxFor(s)
    const topics = useOnce(ctx, 'movement', 'A', MUSK_AB, { targets: [SK] })
    expect(topics).toContain('abilityMode') // where it is set up
    expect(readRedeploy(s)).toBeNull() // fully resolved
    expect(s.units[SK].location).toBe('board')
    for (const m of unitModels(s, SK)) for (const e of unitModels(s, BRUTE)) expect(horizontalGap(m, e)).toBeGreaterThan(6)
    expect(s.units[SK].setUpTurn).toEqual({ round: 1, player: 'A' }) // CORE-6.13: no Move ability this movement phase
    expect(summaries(ctx).some((x) => x.includes('more than 6"'))).toBe(true)
    // once per battle
    expect(offered(s, 'A', 'movement')).not.toContain(MUSK_AB)
    newTurn(s, 'A')
    s.round = 2
    expect(offered(s, 'A', 'movement')).not.toContain(MUSK_AB)
    // the Fiends are a target when they are near the general
    const t = base()
    centreRow(t, FI, 9, -5)
    expect(targetsOf('slaaneshSoulMusk', t, TD, 'A').sort()).toEqual([FI, SK])
    // other enhancements never offer it
    expect(offered(game({ enh: COURTIERS }), 'A', 'movement')).not.toContain(MUSK_AB)
  })
})

describe('HOS-AB abilities', () => {
  // the Thricefold Discord with Daemonettes, Seekers and Fiends around it, the second Daemonettes unit well outside 12"
  const dispensersScene = (patch?: (b: DataBundle) => void): GameState => {
    const s = game({ patch })
    centreRow(s, TD, 0, -5)
    centreRow(s, D1, 3, -9)
    centreRow(s, SK, -5, -1, 0.1)
    centreRow(s, FI, -8, -9)
    centreRow(s, D2, 10, 8)
    return s
  }

  it('HOS-AB-2 Dispensers of Favour: cast 6+; up to X targets where X = live Heralds; Daemonettes Anti-charge (+1 Rend), Seekers +2" Move, Fiends +1 hit, until your next turn; can be unbound', () => {
    const s = dispensersScene()
    expect(offered(s, 'A', 'hero')).toContain(DISPENSERS)
    const picks = targetsOf('slaaneshDispensersOfFavour', s, TD, 'A').sort()
    expect(picks).toEqual([D1, FI, SK]) // D2 is outside 12"; the Heralds themselves are not Daemonettes, Seekers or Fiends
    expect(codeHooks.slaaneshDispensersOfFavour.activate!.maxTargets!(s, TD)).toBe(3)
    const ctx = ctxFor(s, [3, 3]) // 6 to cast
    expect(weaponOf(s, D1, W('piercing-claws')).rend).toBe(1)
    const m0 = move(s, SK)
    const topics = useOnce(ctx, 'hero', 'A', DISPENSERS, { targets: [D1, SK, FI] })
    expect(topics.filter((t) => t === 'abilityTarget')).toHaveLength(3)
    expect(leftOver(ctx)).toEqual([])
    // Daemonettes: +1 Rend against a unit that charged this turn
    expect(weaponOf(s, D1, W('piercing-claws')).abilities.some((a) => a.ability === 'ANTI' && a.keyword === '@charged')).toBe(true)
    // Seekers: +2" Move
    expect(move(s, SK)).toBe(m0 + 2)
    // Fiends: +1 to hit in combat (4+ -> 3+)
    centreRow(s, FI, 0, -2)
    centreRow(s, BRUTE, 0, 1)
    expect(hitsOf(attack(s, 'melee', [3, 3, 3, 1, 1, 1], FI, W('deadly-pincers-and-barbed-stinger'), BRUTE, 3).events)).toBe(3)
    // all of it lasts until the start of the caster's next turn
    const c2 = ctxFor(s)
    effectService.expire(c2, 'nextOwnTurn', 'B')
    expect(move(s, SK)).toBe(m0 + 2)
    effectService.expire(c2, 'nextOwnTurn', 'A')
    expect(move(s, SK)).toBe(m0)
    expect(weaponOf(s, D1, W('piercing-claws')).abilities.some((a) => a.ability === 'ANTI')).toBe(false)
    // X is the number of live models: with one Herald slain only two units can be picked, and Done ends the pick early
    const t = dispensersScene()
    removeModel(t, t.units[TD].models[2])
    expect(codeHooks.slaaneshDispensersOfFavour.activate!.maxTargets!(t, TD)).toBe(2)
    const c3 = ctxFor(t, [3, 3])
    const topics3 = useOnce(c3, 'hero', 'A', DISPENSERS, { targets: [SK, FI, D1] })
    expect(topics3.filter((x) => x === 'abilityTarget')).toHaveLength(2)
    expect(t.units[SK].effects).toHaveLength(1)
    expect(t.units[FI].effects).toHaveLength(1)
    expect(t.units[D1].effects).toHaveLength(0)
    const u = dispensersScene()
    useOnce(ctxFor(u, [3, 3]), 'hero', 'A', DISPENSERS, { targets: [D1, '__done'] })
    expect(u.units[D1].effects).toHaveLength(1)
    expect(u.units[SK].effects).toHaveLength(0)
    // a casting roll of 5 fails: nothing is granted, and the attempt is spent
    const v = dispensersScene()
    const c4 = ctxFor(v, [2, 3])
    useOnce(c4, 'hero', 'A', DISPENSERS, { targets: [D1, SK, FI] })
    expect(v.units[D1].effects).toHaveLength(0)
    expect(v.units[SK].effects).toHaveLength(0)
    expect(canCast(v, TD)).toBe(false)
    // an enemy Wizard within 30" unbinds it with a higher roll
    const w = dispensersScene(WIZARD)
    centreRow(w, BOSS, 8, 8)
    const c5 = ctxFor(w, [3, 3, 6, 6])
    useOnce(c5, 'hero', 'A', DISPENSERS, { targets: [D1, SK, FI] })
    expect(summaries(c5).some((x) => x.includes('unbound'))).toBe(true)
    expect(w.units[D1].effects).toHaveLength(0)
    // a double 1 miscasts: D3 mortal damage on the Thricefold Discord
    const x = dispensersScene()
    const hp = wounds(x, TD)
    useOnce(ctxFor(x, [1, 1, 4, 1, 1]), 'hero', 'A', DISPENSERS, { targets: [D1, SK, FI] })
    expect(wounds(x, TD)).toBe(hp - 2)
    expect(x.units[D1].effects).toHaveLength(0)
  })

  it('HOS-MAG-1 the Thricefold Discord is a Wizard (1): one cast attempt per hero phase, and it may unbind one enemy spell per phase', () => {
    const s = dispensersScene(WIZARD)
    expect(wizardLevel(s, TD)).toBe(1)
    expect(canCast(s, TD)).toBe(true)
    useOnce(ctxFor(s, [2, 3]), 'hero', 'A', DISPENSERS, { targets: [D1] }) // a 5: fails, but the attempt is spent
    expect(canCast(s, TD)).toBe(false)
    expect(offered(s, 'A', 'hero')).not.toContain(DISPENSERS)
    // a new phase starts with a fresh cast
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('magic:'))
    expect(canCast(s, TD)).toBe(true)
    // the enemy Boss casts with the Discord 12" away: it can unbind, once
    centreRow(s, BOSS, 6, 6)
    s.activePlayer = 'B'
    expect(unbinders(s, BOSS)).toContain(TD)
    const ctx = ctxFor(s, [3, 3, 6, 6])
    const cast = castingRoll(ctx, { abilityId: 'test.spell', unitId: BOSS, player: 'B' }, BOSS, 6)
    expect(cast).toMatchObject({ cast: false, unbound: true, unboundBy: TD })
    expect(leftOver(ctx)).toEqual([])
    expect(unbinders(s, BOSS)).not.toContain(TD) // its one attempt this phase is used
  })

  it('HOS-AB-3 Soporific Musk: 4+ gives Strike-last for the rest of the turn; target visible within 9" when out of combat, an enemy in combat with the Fiends when in combat; once per turn for the army, either charge phase', () => {
    const outOfCombat = (): GameState => {
      const s = game()
      s.phase = 'charge'
      centreRow(s, FI, 0, -6)
      centreRow(s, BRUTE, 0, 2) // about 6" away
      centreRow(s, GUARD, 12, 9) // out of range
      return s
    }
    const s = outOfCombat()
    expect(offered(s, 'A', 'charge')).toContain(SOPORIFIC)
    expect(offered(s, 'B', 'charge')).not.toContain(SOPORIFIC)
    expect(targetsOf('slaaneshSoporificMusk', s, FI, 'A')).toEqual([BRUTE])
    const ctx = ctxFor(s, [4])
    useOnce(ctx, 'charge', 'A', SOPORIFIC)
    expect(s.units[BRUTE].turn.fightsLast).toBe(true)
    expect(s.units[GUARD].turn.fightsLast).toBeFalsy()
    expect(leftOver(ctx)).toEqual([])
    // once per turn for the army: not again in this charge phase, but in the opponent's next charge phase it is
    expect(offered(s, 'A', 'charge')).not.toContain(SOPORIFIC)
    newTurn(s, 'B')
    expect(offered(s, 'A', 'charge')).toContain(SOPORIFIC)
    // a 3 does nothing
    const t = outOfCombat()
    useOnce(ctxFor(t, [3]), 'charge', 'A', SOPORIFIC)
    expect(t.units[BRUTE].turn.fightsLast).toBeFalsy()
    // too far: not a target
    centreRow(t, BRUTE, 0, 9)
    expect(targetsOf('slaaneshSoporificMusk', t, FI, 'A')).toEqual([])
    // in combat: only an enemy unit in combat with the Fiends, wherever the others stand
    const u = game()
    u.phase = 'charge'
    centreRow(u, FI, 0, -2)
    centreRow(u, BRUTE, 0, 1.2)
    centreRow(u, GUARD, 0, 6)
    expect(targetsOf('slaaneshSoporificMusk', u, FI, 'A')).toEqual([BRUTE])
    // it works from the opponent's charge phase too (the Fiends are the army's, the turn is B's)
    newTurn(u, 'B')
    useOnce(ctxFor(u, [5]), 'charge', 'A', SOPORIFIC)
    expect(u.units[BRUTE].turn.fightsLast).toBe(true)
  })

  it('HOS-AB-4 Lithe and Swift: Piercing Claws make 3 Attacks after a charge, 2 otherwise', () => {
    const s = game()
    centreRow(s, D1, 0, -3)
    centreRow(s, D2, 6, -3)
    expect(weaponOf(s, D1, W('piercing-claws')).A).toBe(2)
    s.units[D1].turn.chargedThisTurn = true
    expect(weaponOf(s, D1, W('piercing-claws')).A).toBe(3)
    expect(weaponOf(s, D2, W('piercing-claws')).A).toBe(2) // the other unit did not charge
    // other units never get it
    centreRow(s, SK, -8, -3)
    s.units[SK].turn.chargedThisTurn = true
    expect(weaponOf(s, SK, W('agonising-claws')).A).toBe(3)
  })

  it('HOS-AB-5 Quicksilver Speed: a run roll of 1-3 counts as 4, 5-6 are unchanged, and Favour\'s +1 applies after', () => {
    const s = game()
    centreRow(s, SK, 0, -5)
    centreRow(s, D1, 0, -9)
    expect([1, 2, 3, 4, 5, 6].map((d) => hookService.advanceRollFor(s, SK, d))).toEqual([4, 4, 4, 4, 5, 6])
    expect([1, 2, 3].map((d) => hookService.advanceRollFor(s, D1, d))).toEqual([1, 2, 3]) // Daemonettes have no floor
    expect(hookService.advanceRollFor(s, BRUTE, 2)).toBe(2)
    // three units: +1 to run rolls, added after the floor
    const t = field(game(), { sk: true, td: 1, fi: true })
    expect(favourCount(t, 'A')).toBe(3)
    expect([1, 2, 3, 4, 5].map((d) => hookService.advanceRollFor(t, SK, d))).toEqual([5, 5, 5, 5, 6])
  })
})

describe('HOS-AI hints', () => {
  it('HOS-AI the bot saves Excess of Violence and Soul-Musk for a worthwhile moment, chains Bringers whenever offered and casts Dispensers with a fight in reach', () => {
    const s = game({ enh: EXCESS })
    s.phase = 'fight'
    centreRow(s, TD, 0, -5)
    centreRow(s, D1, 0, -9)
    expect(slaaneshAbilityTiming(s, 'A', 'slaaneshExcessOfViolence', TD)!).toBeLessThanOrEqual(-3) // nothing in combat
    centreRow(s, D1, -3, -2)
    centreRow(s, BRUTE, -3, 1.2)
    expect(slaaneshAbilityTiming(s, 'A', 'slaaneshExcessOfViolence', TD)!).toBeGreaterThan(-3) // 20 melee attacks in combat
    expect(slaaneshAbilityTiming(s, 'A', 'slaaneshBringersOfDegradation', null)!).toBeGreaterThan(-3)
    expect(slaaneshAbilityTiming(s, 'A', 'slaaneshDaemonicOnslaught', null)!).toBeGreaterThan(-3)
    expect(slaaneshAbilityTiming(s, 'A', 'unknown', null)).toBeNull()
    // Dispensers: worth it with a target in reach of the enemy, not with everyone far away
    const t = game()
    centreRow(t, TD, 0, -5)
    centreRow(t, D1, 3, -9)
    centreRow(t, BRUTE, 25, 8)
    expect(slaaneshAbilityTiming(t, 'A', 'slaaneshDispensersOfFavour', TD)!).toBeLessThanOrEqual(-3)
    centreRow(t, BRUTE, 3, -2)
    expect(slaaneshAbilityTiming(t, 'A', 'slaaneshDispensersOfFavour', TD)!).toBeGreaterThan(-3)
    // target bonuses: the Fiends near the enemy beat the Seekers
    centreRow(t, FI, 3, -6)
    centreRow(t, SK, -8, -6)
    expect(slaaneshTargetBonus(t, 'A', 'slaaneshDispensersOfFavour', FI)!).toBeGreaterThan(slaaneshTargetBonus(t, 'A', 'slaaneshDispensersOfFavour', SK)!)
    expect(slaaneshTargetBonus(t, 'A', 'unknown', FI)).toBeNull()
    // the lone-Herald case never throws on an empty army
    kill(t, TD)
    expect(slaaneshAbilityTiming(t, 'A', 'slaaneshExcessOfViolence', null)!).toBeLessThanOrEqual(-3)
  })
})
