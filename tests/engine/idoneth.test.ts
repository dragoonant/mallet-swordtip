// Idoneth Deepkin (Soulraid Hunt) engine tests: docs/spec/factions/idoneth-deepkin.md, test ids IDK-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/idoneth files on top of the AoS fixture bundle (player A =
// Soulraid Hunt, player B = the fixture Chaos army: Boss, Brutes, Hawk, Guard). Dice are scripted; nothing here patches the shipped
// data except where a test says so (a ranged weapon for the fixture Guard, a Monster keyword for the Hawk).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, createGame, legalActions, step, unitModels, view,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { makeSimSetup } from '../../tools/sim-core'
import { DATA_VERSION, loadBundle } from '../../src/data'
import { attackService, lostModelThisTurn, ownFightResolved } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { factionResources, hookService } from '../../src/engine/hooks-impl'
import { unitIgnoresRetreatDamage } from '../../src/engine/phases/movement'
import { canDeclareCharge } from '../../src/engine/phases/charge'
import { buildShootingWeaponEntries, unitEligibleToShoot } from '../../src/engine/phases/shooting'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { idonethAbilityTiming, idonethMoveThenCharge, idonethTargetBonus, tideIndex } from '../../src/engine/factions/idoneth'
import { weaponService } from '../../src/engine/weapons'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/idoneth/abilities.json'
import enhancementsJson from '../../src/data/factions/idoneth/enhancements.json'
import weaponsJson from '../../src/data/factions/idoneth/weapons.json'
import factionJson from '../../src/data/factions/idoneth/faction.json'
import patrolJson from '../../src/data/factions/idoneth/patrols/soulraid-hunt.json'
import scryerJson from '../../src/data/factions/idoneth/datasheets/isharann-soulscryer.json'
import morrsarrJson from '../../src/data/factions/idoneth/datasheets/akhelian-morrsarr-guard.json'
import allopexJson from '../../src/data/factions/idoneth/datasheets/akhelian-allopex.json'
import thrallsJson from '../../src/data/factions/idoneth/datasheets/namarti-thralls.json'

// ---------- fixtures ----------
const TEST_BOW = 'fx.w.test-bow'

const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  // cloned: a test that patches the data must not leak into the next one
  for (const a of structuredClone(abilitiesJson) as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of structuredClone(weaponsJson) as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of structuredClone([scryerJson, morrsarrJson, allopexJson, thrallsJson].flat()) as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of structuredClone(enhancementsJson) as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.idoneth = structuredClone(factionJson) as unknown as FactionData
  b.patrols[patrolJson.id] = structuredClone(patrolJson) as unknown as DataBundle['patrols'][string]
  // the fixture Guard gets a bow, so the enemy has a shooting attack to aim at Low Tide
  b.weapons[TEST_BOW] = { id: TEST_BOW, name: 'Test bow', type: 'ranged', range: 24, A: 6, skill: 4, wound: 4, rend: 0, D: 1, abilities: [] }
  b.datasheets['fx.guard'].composition[0].weapons.default.push(TEST_BOW)
  patch?.(b)
})

const WCW = 'idoneth.ability.way-of-the-cresting-wave'
const EP = 'idoneth.ability.ethersea-predators'
const STEEL = 'idoneth.enh.steelshell-armour'
const ARCH_ENH = 'idoneth.enh.arch-ritualist'
const MIND_ENH = 'idoneth.enh.mind-flare'
const MORSEL_ENH = 'idoneth.enh.delicious-morsels'
const MIND = 'idoneth.ability.mind-flare'
const MORSEL = 'idoneth.ability.delicious-morsels'
const MIST = 'idoneth.ability.ritual-of-the-creeping-mist'
const BLAST = 'idoneth.ability.biovoltaic-blast'
const TIDES = 'idoneth.ability.tides-of-death'
const TIDES_LOW = 'idoneth.ability.tides-of-death-low'

const SCRYER = 'A:isharann-soulscryer'
const GUARD = 'A:akhelian-morrsarr-guard'
const ALLO = 'A:akhelian-allopex'
const TH1 = 'A:thralls-1'
const TH2 = 'A:thralls-2'
const BRUTE = 'B:brute'
const BG = 'B:guard'
const BOSS = 'B:boss'
const HAWK = 'B:hawk'

const W = (id: string) => `idoneth.weapon.${id}`

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

// the unit's models in a tight row centred on (cx, cz)
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

// one model of the unit on the board at (x, z), the rest dropped (not slain)
function put(s: GameState, unitId: UnitId, x: number, z: number): void {
  trim(s, unitId, 1)
  s.units[unitId].location = 'board'
  unitModels(s, unitId)[0].pos = { x, y: 0, z }
}

const gapBetween = (s: GameState, a: UnitId, b: UnitId): number =>
  Math.min(...unitModels(s, a).flatMap((m) => unitModels(s, b).map((o) => horizontalGap(m, o))))

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void; terrain?: string; round?: number } = {}): GameState {
  const s = aosState({
    ...(opts.terrain ? { terrainLayoutId: opts.terrain } : {}),
    players: {
      A: makeAosPlayer('A', { faction: 'idoneth', patrolId: 'idoneth.army.soulraid-hunt', enhancementId: opts.enh ?? STEEL, regimentAbilityId: opts.reg ?? WCW }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  // bystanders go along the back edges, clear of the middle where the tests work
  for (const p of ['A', 'B'] as const) {
    const sign = p === 'A' ? -1 : 1
    let x = -14.5, row = 0
    for (const u of Object.values(s.units).filter((u) => u.player === p)) {
      const r = Math.max(...unitModels(s, u.id).map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
      const width = u.models.length * (2 * r + 0.3)
      if (x + width > 14.5) { x = -14.5; row = 1 }
      place(s, u.id, x, sign * (9.8 - 2.6 * row), 0.3)
      x += width + 0.3
    }
  }
  s.round = opts.round ?? 1
  s.phase = 'command'
  s.activePlayer = 'A'
  return s
}

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

type Pick = (topic: string, ids: string[], p: ChooseOptionDecision) => string

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: Pick): { topics: string[]; options: string[][] } {
  const topics: string[] = []
  const options: string[][] = []
  for (let i = 0; i < 30; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return { topics, options }
    const p = ctx.state.pending as ChooseOptionDecision
    topics.push(p.context.topic)
    const ids = p.options.map((o) => o.id)
    options.push(ids)
    const choice = pick(p.context.topic, ids, p)
    ctx.state.pending = null
    const action = choice === 'pass' ? { type: 'pass' as const, player, decisionId: p.id } : { type: 'chooseOption' as const, player, decisionId: p.id, optionId: choice }
    const rej = abilityService.handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

// use one ability once; every other offer is declined
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string } = {}) {
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

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const targetsOf = (code: string, s: GameState, unitId: UnitId | null, player: PlayerId): UnitId[] =>
  (codeHooks[code].activate!.targets as unknown as (state: GameState, unitId: UnitId | null, player: PlayerId) => UnitId[])(s, unitId, player)
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const hurt = (s: GameState, unitId: UnitId, models: number[]): void => { unitModels(s, unitId).forEach((m, i) => { if (models[i] !== undefined) m.woundsRemaining = models[i] }) }

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
const hitsOf = (events: GameEvent[]): [number, boolean][] => events.filter((e): e is Extract<GameEvent, { type: 'HitRolled' }> => e.type === 'HitRolled').map((e) => [e.die, e.hit])
const lots = (n: number, v: number): number[] => Array(n).fill(v)

const effectiveWeapon = (s: GameState, unitId: UnitId, weaponId: string) => {
  const m = unitModels(s, unitId).find((x) => x.weapons.includes(weaponId))!
  return weaponService.effectiveWeapon(s, m.id, weaponId)!
}

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('IDK-REG every code in the Idoneth data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('IDK-ARMY-1 the army builds in the engine: Soulscryer general, 3 Morrsarr Guard, Allopex and two Thralls units, 15 models, stats as printed', () => {
    const s = game({ enh: MIND_ENH, reg: EP })
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine.map((u) => u.ref).sort()).toEqual(['akhelian-allopex', 'akhelian-morrsarr-guard', 'isharann-soulscryer', 'thralls-1', 'thralls-2'])
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(15)
    expect(s.players.A.warlordUnitId).toBe(SCRYER)
    expect(s.units[SCRYER].enhancementId).toBe(MIND_ENH)
    expect(s.players.A.regimentAbilityId).toBe(EP)
    expect(s.players.A.battleTraitIds).toEqual([TIDES, TIDES_LOW])
    const st = (id: string) => s.datasheets[`idoneth.unit.${id}`].stats
    expect(st('isharann-soulscryer')).toMatchObject({ M: 6, W: 5, Sv: 5, OC: 2 })
    expect(st('akhelian-morrsarr-guard')).toMatchObject({ M: 14, W: 4, Sv: 4, OC: 1 })
    expect(st('akhelian-allopex')).toMatchObject({ M: 12, W: 8, Sv: 4, OC: 2 })
    expect(st('namarti-thralls')).toMatchObject({ M: 6, W: 1, Sv: 5, OC: 1 })
    for (const id of [SCRYER, GUARD, ALLO, TH1]) expect((s.datasheets[s.units[id].datasheetId].stats as { ward?: number }).ward ?? null, id).toBeNull()
    const ws = (id: UnitId) => unitModels(s, id).map((m) => m.weapons.map((w) => w.replace('idoneth.weapon.', '')))
    expect(ws(SCRYER)).toEqual([['scryfish-shoal', 'abyssal-touch']])
    expect(ws(GUARD)).toEqual(Array(3).fill(['voltspear', 'fangmora-fangs']))
    expect(ws(ALLO)).toEqual([['razorshell-harpoon-launcher', 'barbed-hooks-and-blades', 'allopex-bite']])
    expect(ws(TH1)).toEqual(Array(5).fill(['lanmari']))
    // bases: 32 round, 60x35 oval, 90x52 oval, 32 round
    const base = (id: UnitId) => s.models[s.units[id].models[0]].base
    expect(base(SCRYER).radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(base(GUARD).radius).toBeCloseTo(60 / 2 / 25.4, 2)
    expect(base(GUARD).radius2).toBeCloseTo(35 / 2 / 25.4, 2)
    expect(base(ALLO).radius).toBeCloseTo(90 / 2 / 25.4, 2)
    expect(base(ALLO).radius2).toBeCloseTo(52 / 2 / 25.4, 2)
    expect(base(TH2).radius).toBeCloseTo(32 / 2 / 25.4, 2)
  })

  it('IDK-ARMY-2 only the Allopex and the two Thralls units are offered for replacement once destroyed; keywords as printed', () => {
    const s = game()
    const kw = (id: UnitId) => s.datasheets[s.units[id].datasheetId].keywords
    expect(kw(SCRYER)).toEqual(['HERO', 'INFANTRY'])
    expect(kw(GUARD)).toEqual(['CAVALRY', 'FLY'])
    expect(kw(ALLO)).toEqual(['CAVALRY', 'FLY', 'REINFORCEMENTS'])
    expect(kw(TH1)).toEqual(['INFANTRY', 'REINFORCEMENTS'])
    for (const id of [SCRYER, GUARD, ALLO, TH1, TH2]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A').sort()).toEqual([ALLO, TH1, TH2])
  })
})

describe('IDK-BT Tides of Death', () => {
  it('IDK-BT-1 Low Tide: -1 to hit for shooting attacks against a friendly unit in round 1 only; melee is untouched', () => {
    const shoot = (round: number) => {
      const s = game({ round })
      put(s, TH1, 0, -4)
      put(s, BG, 0, 2)
      return attack(s, 'ranged', lots(30, 4), BG, TEST_BOW, TH1, 3)
    }
    // a 4 hits on 4+; in round 1 it is a 3, in round 2 it is a 4 again
    expect(hitsOf(shoot(1).events)).toEqual([[4, false], [4, false], [4, false]])
    expect(hitsOf(shoot(2).events)).toEqual([[4, true], [4, true], [4, true]])
    expect(hitsOf(shoot(4).events)).toEqual([[4, true], [4, true], [4, true]])
    // a melee attack in round 1 is unaffected
    const s = game({ round: 1 })
    put(s, TH1, 0, -1)
    put(s, BG, 0, 1.2)
    expect(gapBetween(s, TH1, BG)).toBeLessThan(3)
    expect(hitsOf(attack(s, 'melee', lots(30, 4), BG, 'fx.w.guard-spear', TH1, 2).events)).toEqual([[4, true], [4, true]])
    // Low Tide protects Idoneth units only: the Soulscryer's shoal hits the enemy Guard on a plain 5
    const t = game({ round: 1 })
    put(t, SCRYER, 0, -4)
    put(t, BG, 0, 2)
    expect(hitsOf(attack(t, 'ranged', lots(30, 5), SCRYER, W('scryfish-shoal'), BG, 2).events)).toEqual([[5, true], [5, true]])
  })

  it('IDK-BT-2 Flood Tide: in round 2 a unit that Ran may still shoot and charge; in round 1 and 3 it may not', () => {
    const check = (round: number) => {
      const s = game({ round })
      s.activePlayer = 'A'
      centreRow(s, SCRYER, -6, -4)
      centreRow(s, TH1, 0, -4)
      centreRow(s, BG, -6, 3)
      centreRow(s, BRUTE, 2, 2.6)
      s.units[SCRYER].turn.moveType = 'advance'
      s.units[TH1].turn.moveType = 'advance'
      s.phase = 'shooting'
      const shoot = unitEligibleToShoot(ctxFor(s), SCRYER)
      s.phase = 'charge'
      const charge = canDeclareCharge(s, TH1)
      const elig = [hookService.eligibilityFor?.(s, TH1, 'shoot'), hookService.eligibilityFor?.(s, TH1, 'charge')]
      return { shoot, charge, elig }
    }
    expect(check(1)).toEqual({ shoot: false, charge: false, elig: [false, false] })
    expect(check(2)).toEqual({ shoot: true, charge: true, elig: [true, true] })
    expect(check(3).charge).toBe(false)
    expect(check(4).charge).toBe(false)
    // the enemy has no tide
    const s = game({ round: 2 })
    s.units[BRUTE].turn.moveType = 'advance'
    expect(hookService.eligibilityFor?.(s, BRUTE, 'charge')).toBe(false)
    // a Retreat still blocks them in round 2
    const t = game({ round: 2 })
    t.units[TH1].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor?.(t, TH1, 'charge')).toBe(false)
  })

  it('IDK-BT-3 High Tide: every friendly unit has Strike-first in round 3 only', () => {
    for (const round of [1, 2, 3, 4]) {
      const s = game({ round })
      for (const id of [SCRYER, GUARD, ALLO, TH1, TH2]) expect(hookService.eligibilityFor?.(s, id, 'fightFirst'), `${id} round ${round}`).toBe(round === 3)
      expect(hookService.eligibilityFor?.(s, BRUTE, 'fightFirst'), `enemy round ${round}`).toBe(false)
    }
  })

  it('IDK-BT-4 Ebb Tide: in round 4 a unit that Retreated may still shoot and charge, and still takes the Retreat damage', () => {
    const check = (round: number) => {
      const s = game({ round })
      centreRow(s, SCRYER, -6, -4)
      centreRow(s, TH1, 0, -4)
      centreRow(s, BG, -6, 3)
      centreRow(s, BRUTE, 2, 2.6)
      s.units[SCRYER].turn.moveType = 'fallBack'
      s.units[TH1].turn.moveType = 'fallBack'
      s.phase = 'shooting'
      const shoot = unitEligibleToShoot(ctxFor(s), SCRYER)
      s.phase = 'charge'
      const charge = canDeclareCharge(s, TH1)
      return { shoot, charge, noDamageWaiver: !unitIgnoresRetreatDamage(s, TH1) }
    }
    expect(check(4)).toEqual({ shoot: true, charge: true, noDamageWaiver: true })
    expect(check(3)).toMatchObject({ shoot: false, charge: false })
    expect(check(2)).toMatchObject({ shoot: false, charge: false })
    // the HUD names the tide
    const s = game({ round: 4 })
    expect(tideIndex(s)).toBe(3)
    const res = factionResources(s, 'A')
    expect(res.map((r) => r.label)).toEqual(['Tide: Ebb Tide'])
    expect(factionResources(game({ round: 1 }), 'A')[0].help).toContain('-1 to hit')
    expect(idonethMoveThenCharge(s, TH1, 'fallBack')).toBe(true)
    expect(idonethMoveThenCharge(s, TH1, 'advance')).toBe(false)
    expect(idonethMoveThenCharge(game({ round: 2 }), TH1, 'advance')).toBe(true)
    expect(idonethMoveThenCharge(game({ round: 2 }), BRUTE, 'advance')).toBe(false)
  })
})

describe('IDK-RA regiment abilities', () => {
  it('IDK-RA-1 Way of the Cresting Wave: Thralls that charged this turn get +1 Rend on the Lanmari; not without a charge; no other unit', () => {
    const s = game({ reg: WCW })
    const rend = (id: UnitId, weapon: string) => effectiveWeapon(s, id, W(weapon)).rend
    expect(rend(TH1, 'lanmari')).toBe(1)
    s.units[TH1].turn.chargedThisTurn = true
    expect(rend(TH1, 'lanmari')).toBe(2)
    // the other Thralls unit did not charge; the Guard and the Soulscryer charged do not benefit
    expect(rend(TH2, 'lanmari')).toBe(1)
    s.units[GUARD].turn.chargedThisTurn = true
    s.units[SCRYER].turn.chargedThisTurn = true
    expect(rend(GUARD, 'voltspear')).toBe(1)
    expect(rend(GUARD, 'fangmora-fangs')).toBe(1)
    expect(rend(SCRYER, 'abyssal-touch')).toBe(0)
    // Ethersea Predators chosen instead: no bonus
    const t = game({ reg: EP })
    t.units[TH1].turn.chargedThisTurn = true
    expect(effectiveWeapon(t, TH1, W('lanmari')).rend).toBe(1)
    // with Anti-Infantry the charging Thralls cut an Infantry target at Rend 3: a save of 6 on a Save 4+ model fails, a 5 passes at Rend 2
    const swing = (charged: boolean): number => {
      const u = game({ reg: WCW })
      u.units[TH1].turn.chargedThisTurn = charged
      put(u, TH1, 0, -1)
      centreRow(u, BG, 0, 1.2)
      attack(u, 'melee', [6, 6, 6], TH1, W('lanmari'), BG, 1)
      return u.units[BG].models.length
    }
    // Save 4+, a save die of 6: Rend 1 + Anti-Infantry 1 = 2 needs 6 and holds; the charge makes it Rend 3, needs 7, and the model dies
    expect(swing(false)).toBe(10)
    expect(swing(true)).toBeLessThan(10) // the model is slain (the cull for coherency may take a few more)
  })

  it('IDK-RA-2 Ethersea Predators: end of turn, heals D3 on a Cavalry unit that fought this turn; one that did not fight is not offered; once per turn', () => {
    const s = game({ reg: EP })
    s.phase = 'fight'
    hurt(s, GUARD, [1, 3, 4])
    hurt(s, ALLO, [3])
    // nothing has fought yet: not offered
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(EP)
    // the Guard fights (the real end-of-activation hook), the Allopex does not
    ownFightResolved(ctxFor(s), GUARD)
    expect(targetsOf('idonethEtherseaPredators', s, null, 'A')).toEqual([GUARD])
    expect(offered(s, 'A', 'endOfTurn')).toContain(EP)
    const ctx = ctxFor(s, [5])
    useOnce(ctx, 'endOfTurn', 'A', EP, { target: GUARD })
    // D3 on a 5 = 3: the first damaged model (3 missing) is made whole, the other damaged model is untouched
    expect(wounds(s, GUARD)).toBe(8 + 3)
    expect(wounds(s, ALLO)).toBe(3)
    expect(summaries(ctx).some((x) => x.includes('Heal (3)'))).toBe(true)
    expect(leftOver(ctx)).toEqual([])
    // once per turn for the army: the Allopex fights too, but nothing more is offered
    ownFightResolved(ctxFor(s), ALLO)
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(EP)
    // next turn: the ledger is stale, and a healthy unit is never offered
    s.activePlayer = 'B'
    expect(targetsOf('idonethEtherseaPredators', s, null, 'A')).toEqual([])
    // a Thralls unit that fought is not Cavalry
    const t = game({ reg: EP })
    ownFightResolved(ctxFor(t), TH1)
    expect(targetsOf('idonethEtherseaPredators', t, null, 'A')).toEqual([])
    // the Soulscryer is damaged, fights, and is a Hero Infantry: not Cavalry either
    hurt(t, SCRYER, [2])
    ownFightResolved(ctxFor(t), SCRYER)
    expect(targetsOf('idonethEtherseaPredators', t, null, 'A')).toEqual([])
    // the enemy turn: a Cavalry unit that fought in the enemy's combat phase qualifies at the end of that turn
    const u = game({ reg: EP })
    u.activePlayer = 'B'
    hurt(u, ALLO, [2])
    ownFightResolved(ctxFor(u), ALLO)
    expect(targetsOf('idonethEtherseaPredators', u, null, 'A')).toEqual([ALLO])
  })
})

describe('IDK-ENH enhancements', () => {
  const caster = (enh: string, dice: number[], target: UnitId = TH1) => {
    const s = game({ enh })
    centreRow(s, SCRYER, 0, -6)
    centreRow(s, TH1, 3, -6)
    const ctx = ctxFor(s, dice)
    useOnce(ctx, 'hero', 'A', MIST, { target })
    const mist = s.units[target].effects.some((e) => e.sourceAbilityId === MIST)
    return { s, ctx, mist }
  }

  it('IDK-ENH-1 Arch-Ritualist: Ritual of the Creeping Mist succeeds on a rolled 2 (a 1 still fails); without it a 2 fails', () => {
    expect(caster(ARCH_ENH, [2]).mist).toBe(true)
    expect(caster(ARCH_ENH, [1]).mist).toBe(false)
    expect(caster(STEEL, [2]).mist).toBe(false)
    expect(caster(STEEL, [3]).mist).toBe(true)
    expect(caster(MIND_ENH, [2]).mist).toBe(false)
  })

  it('IDK-ENH-2 Steelshell Armour: the general\'s save ignores Rend and positive modifiers; an unmodified 1 still fails', () => {
    const save = (enh: string, die: number, bonus = 0, by: 'boss' | 'guard' = 'boss') => {
      const s = game({ enh })
      put(s, SCRYER, 0, -1)
      put(s, by === 'boss' ? BOSS : BG, 0, 1.2)
      if (bonus) effectService.grant(ctxFor(s), SCRYER, { modifyRoll: { roll: 'save', value: bonus } }, { sourceAbilityId: 'test', sourceUnitId: SCRYER, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
      attack(s, 'melee', [6, 6, die, 6, 6, 6, 6], by === 'boss' ? BOSS : BG, by === 'boss' ? 'fx.w.boss-blade' : 'fx.w.guard-spear', SCRYER, 1)
      return wounds(s, SCRYER)
    }
    // the Boss cuts at Rend 1 (Damage 2) against Save 5+: a 5 counts as a 4 and fails, but is the bare 5 with Steelshell Armour
    expect(save(STEEL, 5)).toBe(5)
    expect(save(ARCH_ENH, 5)).toBe(3)
    expect(save(STEEL, 4)).toBe(3)
    // a Guard spear has no Rend (Damage 1): a +1 save bonus turns a 4 into a 5 and saves, unless the armour ignores it
    expect(save(ARCH_ENH, 4, 1, 'guard')).toBe(5)
    expect(save(STEEL, 4, 1, 'guard')).toBe(4)
    // an unmodified 1 fails whatever the bonus
    expect(save(STEEL, 1, 1, 'guard')).toBe(4)
    expect(save(ARCH_ENH, 1, 1, 'guard')).toBe(4)
  })

  it('IDK-ENH-3 Mind Flare: the picked enemy unit in combat with the general hits only on unmodified 6s for the phase; once per battle', () => {
    const base = (): GameState => {
      const s = game({ enh: MIND_ENH })
      s.phase = 'fight'
      put(s, SCRYER, 0, -1)
      put(s, BOSS, 0, 1.2)
      put(s, BRUTE, 9, 5)
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'fight')).toContain(MIND)
    expect(targetsOf('idonethMindFlare', s, SCRYER, 'A')).toEqual([BOSS])
    const ctx = ctxFor(s)
    useOnce(ctx, 'fight', 'A', MIND, { target: BOSS })
    expect(s.units[BOSS].effects.some((e) => e.sourceAbilityId === MIND)).toBe(true)
    expect(s.units[BRUTE].effects.some((e) => e.sourceAbilityId === MIND)).toBe(false)
    expect(summaries(ctx).some((x) => x.includes('unmodified 6'))).toBe(true)
    // the Boss hits only on the 6 (a +1 to hit would not change that)
    effectService.grant(ctxFor(s), BOSS, { modifyRoll: { roll: 'hit', value: 1 } }, { sourceAbilityId: 'test', sourceUnitId: BOSS, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    expect(hitsOf(attack(s, 'melee', [5, 6, ...lots(12, 6)], BOSS, 'fx.w.boss-blade', SCRYER, 2).events)).toEqual([[5, false], [6, true]])
    // once per battle: not offered again, in this phase, next round, or by the other player's window
    expect(offered(s, 'A', 'fight')).not.toContain(MIND)
    s.round = 3
    expect(offered(s, 'A', 'fight')).not.toContain(MIND)
    // nobody in combat with the general: not offered at all
    const t = base()
    put(t, BOSS, 9, 5)
    expect(offered(t, 'A', 'fight')).not.toContain(MIND)
    // ... and the effect ends with the phase
    const u = base()
    useOnce(ctxFor(u), 'fight', 'A', MIND, { target: BOSS })
    expect(u.units[BOSS].effects.find((e) => e.sourceAbilityId === MIND)?.expires.kind).toBe('phaseEnd')
  })

  it('IDK-ENH-4 Delicious Morsels: heals 1 on each friendly Cavalry unit within 3" of the general; none beyond 3"', () => {
    const s = game({ enh: MORSEL_ENH })
    centreRow(s, SCRYER, -8, -6)
    centreRow(s, GUARD, -8, -2.8, 0.1)
    centreRow(s, ALLO, 6, -6)
    hurt(s, GUARD, [2, 4, 1])
    hurt(s, ALLO, [3])
    expect(gapBetween(s, GUARD, SCRYER)).toBeLessThanOrEqual(3)
    expect(gapBetween(s, ALLO, SCRYER)).toBeGreaterThan(3)
    expect(offered(s, 'A', 'hero')).toContain(MORSEL)
    const ctx = ctxFor(s)
    useOnce(ctx, 'hero', 'A', MORSEL)
    // one point on the Guard (the first damaged model), nothing on the Allopex beyond 3"
    expect(wounds(s, GUARD)).toBe(7 + 1)
    expect(wounds(s, ALLO)).toBe(3)
    // once per phase (CORE-3.4), and nothing damaged within 3": not offered
    expect(offered(s, 'A', 'hero')).not.toContain(MORSEL)
    const t = game({ enh: MORSEL_ENH })
    centreRow(t, SCRYER, -8, -6)
    centreRow(t, GUARD, -8, -2.8, 0.1)
    expect(offered(t, 'A', 'hero')).not.toContain(MORSEL)
  })
})

describe('IDK-AB warscroll abilities', () => {
  it('IDK-AB-1 Ritual of the Creeping Mist: 3+ gives -1 to wound for attacks on a visible friendly unit wholly within 12" until your next turn; 1-2 nothing', () => {
    const mk = () => {
      const s = game({ terrain: 'fx.terrain.standard' })
      centreRow(s, SCRYER, 6, -4)
      centreRow(s, TH1, 10, -4)
      return s
    }
    const s = mk()
    // every friendly unit wholly within 12" (the caster itself too); one a hair beyond is not
    expect(targetsOf('idonethCreepingMist', s, SCRYER, 'A').sort()).toContain(SCRYER)
    expect(targetsOf('idonethCreepingMist', s, SCRYER, 'A')).toContain(TH1)
    s.models[s.units[TH1].models[0]].pos = { x: 6 + 12.5, y: 0, z: -4 }
    expect(targetsOf('idonethCreepingMist', s, SCRYER, 'A')).not.toContain(TH1)
    // an obscuring ruin in the way: not visible, so not a target (the ruin stands at x -8.5..-3.5, z 0.5..3.5)
    const t = mk()
    centreRow(t, SCRYER, -6, -2)
    centreRow(t, TH1, -6, 6)
    expect(gapBetween(t, SCRYER, TH1)).toBeLessThan(12)
    expect(targetsOf('idonethCreepingMist', t, SCRYER, 'A')).not.toContain(TH1)
    // a 3: -1 to wound for attacks against the target, ending at the start of the owner's next turn
    const u = mk()
    const ctx = ctxFor(u, [3])
    useOnce(ctx, 'hero', 'A', MIST, { target: TH1 })
    const eff = u.units[TH1].effects.find((e) => e.sourceAbilityId === MIST)!
    expect(eff.expires.kind).toBe('nextOwnTurn')
    expect(summaries(ctx).some((x) => x.includes('-1 to wound'))).toBe(true)
    // a Boss wound roll of 2 beats its 2+ without the Mist and fails with it
    put(u, TH1, 0, -1)
    put(u, BOSS, 0, 1.2)
    attack(u, 'melee', [6, 2, 1, 1, 1, 1, 1, 1], BOSS, 'fx.w.boss-blade', TH1, 1)
    expect(u.units[TH1].location).toBe('board')
    const v = mk()
    put(v, TH1, 0, -1)
    put(v, BOSS, 0, 1.2)
    attack(v, 'melee', [6, 2, 1, 1, 1, 1, 1, 1], BOSS, 'fx.w.boss-blade', TH1, 1)
    expect(v.units[TH1].location).toBe('destroyed')
    // a 2 (or a 1): nothing happens, and the roll is spent
    const w = mk()
    const c2 = ctxFor(w, [2])
    useOnce(c2, 'hero', 'A', MIST, { target: TH1 })
    expect(w.units[TH1].effects.some((e) => e.sourceAbilityId === MIST)).toBe(false)
    expect(leftOver(c2)).toEqual([])
    expect(offered(w, 'A', 'hero')).not.toContain(MIST)
  })

  it('IDK-AB-2 Biovoltaic Blast: only after a charge, target within 1"; one die per model, 4-5 = 1 mortal, 6+ = D3; +1 per die when the target has more models; once per battle', () => {
    const mk = () => {
      const s = game()
      s.phase = 'charge'
      centreRow(s, GUARD, 0, -1.8, 0.1)
      centreRow(s, BG, 0, 0.2, 0.1)
      centreRow(s, BOSS, 12, 5)
      return s
    }
    // not charged: not offered
    const s = mk()
    expect(gapBetween(s, GUARD, BG)).toBeLessThanOrEqual(1)
    expect(offered(s, 'A', 'charge')).not.toContain(BLAST)
    s.units[GUARD].turn.chargedThisTurn = true
    expect(offered(s, 'A', 'charge')).toContain(BLAST)
    expect(targetsOf('idonethBiovoltaicBlast', s, GUARD, 'A')).toEqual([BG])
    // 10 Guard models against 3: +1 to every die. 3,5,6 -> 4,6,7: 1 mortal, then D3 (a 3 -> 2) and D3 (a 6 -> 3) = 6 mortal damage
    const ctx = ctxFor(s, [3, 5, 6, 3, 6])
    useOnce(ctx, 'charge', 'A', BLAST, { target: BG })
    // (the Guard row is then culled for coherency, so count the mortal damage the ability dealt, not the survivors)
    expect(summaries(ctx).some((x) => x.endsWith('6 mortal damage'))).toBe(true)
    expect(leftOver(ctx)).toEqual([])
    expect(summaries(ctx).some((x) => x.includes('3 dice') && x.includes('+1'))).toBe(true)
    // once per battle
    expect(offered(s, 'A', 'charge')).not.toContain(BLAST)
    s.round = 3
    expect(offered(s, 'A', 'charge')).not.toContain(BLAST)
    // a one-model target has fewer models: no bonus. 3,4,5 -> 0, 1, 1 = 2 mortal on the Boss (the 5 stays below 6)
    const t = mk()
    t.units[GUARD].turn.chargedThisTurn = true
    centreRow(t, BOSS, 0, 0.2)
    centreRow(t, BG, 12, 5)
    const c2 = ctxFor(t, [3, 4, 5])
    useOnce(c2, 'charge', 'A', BLAST, { target: BOSS })
    expect(wounds(t, BOSS)).toBe(8 - 2)
    expect(leftOver(c2)).toEqual([])
    // a roll of 6 with no bonus is D3
    const u = mk()
    u.units[GUARD].turn.chargedThisTurn = true
    centreRow(u, BOSS, 0, 0.2)
    centreRow(u, BG, 12, 5)
    const c3 = ctxFor(u, [6, 1, 1, 6])
    useOnce(c3, 'charge', 'A', BLAST, { target: BOSS })
    expect(wounds(u, BOSS)).toBe(8 - 3)
    // nothing within 1": not offered
    const v = mk()
    v.units[GUARD].turn.chargedThisTurn = true
    centreRow(v, BG, 0, 4)
    expect(offered(v, 'A', 'charge')).not.toContain(BLAST)
  })

  it('IDK-AB-3 Bloodthirsty Predators: the Bite has 4 Attacks within 6" of a damaged enemy unit or one that lost a model this turn; 3 otherwise', () => {
    const s = game()
    const bite = () => effectiveWeapon(s, ALLO, W('allopex-bite')).A
    centreRow(s, ALLO, 0, -4)
    centreRow(s, BG, 0, 3)
    centreRow(s, HAWK, 12, 6)
    expect(gapBetween(s, ALLO, BG)).toBeLessThan(6)
    // a healthy enemy that lost nobody: 3
    expect(bite()).toBe(3)
    // a damaged enemy unit within 6" (Hawk, far away, does not count; the Guard is a unit of 1-Health models, so use the Boss)
    centreRow(s, BOSS, 0, 1)
    s.models[s.units[BOSS].models[0]].woundsRemaining = 7
    expect(bite()).toBe(4)
    // the other weapons never change, and the Companion Bite gets only this one bonus
    expect(effectiveWeapon(s, ALLO, W('barbed-hooks-and-blades')).A).toBe(4)
    expect(effectiveWeapon(s, ALLO, W('razorshell-harpoon-launcher')).A).toBe(2)
    // a damaged enemy beyond 6": 3
    s.models[s.units[BOSS].models[0]].pos = { x: 0, y: 0, z: 9 }
    centreRow(s, ALLO, 0, -9)
    expect(gapBetween(s, ALLO, BOSS)).toBeGreaterThan(6)
    expect(bite()).toBe(3)
    // a unit of 1-Health models never stays damaged: the second clause, a model slain this turn
    centreRow(s, ALLO, 0, -4)
    centreRow(s, BG, 0, 0)
    expect(bite()).toBe(3)
    attackService.queueMortalWounds(ctxFor(s), BG, 1, 'test', false)
    expect(lostModelThisTurn(s, BG)).toBe(true)
    expect(bite()).toBe(4)
    // ... and only for this turn
    s.activePlayer = 'B'
    expect(bite()).toBe(3)
  })

  it('IDK-AB-4 Sweeping Blows: the Lanmari has Damage 2 against a Monster, 1 otherwise', () => {
    const hit = (target: UnitId) => {
      const s = game({ patch: (b) => { b.datasheets['fx.hawk'].keywords = ['FLY', 'MONSTER'] } })
      put(s, TH1, 0, -1)
      put(s, target, 0, 1.2)
      // hit 6, wound 6, save 1: one unsaved attack
      attack(s, 'melee', [6, 6, 1, 1, 1, 1], TH1, W('lanmari'), target, 1)
      return s
    }
    const mon = hit(HAWK)
    expect(wounds(mon, HAWK)).toBe(4 - 2)
    const boss = hit(BOSS)
    expect(wounds(boss, BOSS)).toBe(8 - 1)
  })
})

describe('IDK-WEAP weapons', () => {
  it('IDK-WEAP-1 Harpoon +1 Rend vs a Monster; Lanmari +1 Rend vs Infantry; Voltspear +1 Damage on the charge; Scryfish Shoal shoots in combat', () => {
    const mk = () => game({ reg: EP, patch: (b) => { b.datasheets['fx.hawk'].keywords = ['FLY', 'MONSTER'] } })
    // Harpoon: Save 4+; Rend 1 + Anti-Monster 1 = 2 vs the Hawk, a 4 saves at Rend 1 and fails at Rend 2; the Boss is not a Monster
    const shot = (target: UnitId) => {
      const s = mk()
      put(s, ALLO, 0, -6)
      put(s, target, 0, 2)
      attack(s, 'ranged', [6, 6, 5, 6, 6], ALLO, W('razorshell-harpoon-launcher'), target, 1)
      return s
    }
    expect(wounds(shot(HAWK), HAWK)).toBe(4 - 3) // Save 4+, Rend 2: a 5 is a 3, fails
    expect(wounds(shot(BOSS), BOSS)).toBe(8) // Save 3+, Rend 1: a 5 is a 4, passes
    // Lanmari: Save 4+ Guard (Infantry), Rend 1 + Anti-Infantry 1 = 2: a 5 is a 3 and fails; the Hawk (not Infantry): a 5 is a 4 and passes
    const slash = (target: UnitId) => {
      const s = mk()
      put(s, TH1, 0, -1)
      if (target === BG) centreRow(s, target, 0, 1.2); else put(s, target, 0, 1.2)
      attack(s, 'melee', [6, 6, 5, 6], TH1, W('lanmari'), target, 1)
      return s
    }
    expect(slash(BG).units[BG].models.length).toBeLessThan(10) // slain (coherency may cull more)
    expect(wounds(slash(HAWK), HAWK)).toBe(4)
    // Voltspear: Damage 1, +1 when the unit charged
    const stab = (charged: boolean) => {
      const s = mk()
      put(s, GUARD, 0, -1)
      put(s, BOSS, 0, 1.2)
      s.units[GUARD].turn.chargedThisTurn = charged
      attack(s, 'melee', [6, 6, 1, 6, 6], GUARD, W('voltspear'), BOSS, 1)
      return wounds(s, BOSS)
    }
    expect(stab(false)).toBe(7)
    expect(stab(true)).toBe(6)
    // Scryfish Shoal: the Soulscryer shoots while an enemy is in combat with it; the Harpoon cannot
    const s = mk()
    put(s, SCRYER, 0, -1)
    put(s, BOSS, 0, 1.2)
    put(s, ALLO, 0, -2.5)
    s.phase = 'shooting'
    const entries = (id: UnitId) => buildShootingWeaponEntries(ctxFor(s), id).filter((e) => e.legalTargets.length > 0).map((e) => e.weaponId)
    expect(entries(SCRYER)).toEqual([W('scryfish-shoal')])
    // the Allopex is in combat too, so its Harpoon cannot fire; with the Boss moved away it can
    expect(entries(ALLO)).not.toContain(W('razorshell-harpoon-launcher'))
    put(s, BOSS, 0, 9)
    put(s, SCRYER, -10, -4)
    expect(entries(ALLO)).toContain(W('razorshell-harpoon-launcher'))
  })

  it('IDK-WEAP-2 Companion weapons (Scryfish Shoal, Fangmora\'s Fangs, the Bite) ignore friendly buffs other than Bloodthirsty Predators', () => {
    const s = game()
    const buff = (id: UnitId) => effectService.grant(ctxFor(s), id, { modifyStat: { stat: 'A', value: 1 } }, { sourceAbilityId: 'test', sourceUnitId: id, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    buff(SCRYER); buff(GUARD); buff(ALLO)
    expect(effectiveWeapon(s, SCRYER, W('scryfish-shoal')).A).toBe(8)
    expect(effectiveWeapon(s, SCRYER, W('abyssal-touch')).A).toBe(4)
    expect(effectiveWeapon(s, GUARD, W('fangmora-fangs')).A).toBe(3)
    expect(effectiveWeapon(s, GUARD, W('voltspear')).A).toBe(3)
    expect(effectiveWeapon(s, ALLO, W('allopex-bite')).A).toBe(3)
    expect(effectiveWeapon(s, ALLO, W('barbed-hooks-and-blades')).A).toBe(5)
    // but Bloodthirsty Predators reaches the Bite (it names it), on top of the untouched printed number
    centreRow(s, ALLO, 0, -4)
    centreRow(s, BOSS, 0, 1)
    s.models[s.units[BOSS].models[0]].woundsRemaining = 7
    expect(effectiveWeapon(s, ALLO, W('allopex-bite')).A).toBe(4)
  })

  it('IDK-ENG-1 lostModelThisTurn is true after a slain model this turn and resets on the next turn', () => {
    const s = game()
    place(s, BG, -10, 0)
    expect(lostModelThisTurn(s, BG)).toBe(false)
    attackService.queueMortalWounds(ctxFor(s), BG, 2, 'test', false)
    expect(lostModelThisTurn(s, BG)).toBe(true)
    expect(lostModelThisTurn(s, BOSS)).toBe(false)
    s.activePlayer = 'B'
    expect(lostModelThisTurn(s, BG)).toBe(false)
    s.activePlayer = 'A'
    s.round = 2
    expect(lostModelThisTurn(s, BG)).toBe(false)
  })
})

describe('IDK-AI', () => {
  it('IDK-AI hints: Mind Flare only when the general faces a fresh attacker, Morsels only with damaged Cavalry near the general, Predators on the most hurt', () => {
    // Mind Flare: nothing in combat -> pass; a Boss in combat that has not fought -> use it; once it has fought -> pass
    const s = game({ enh: MIND_ENH })
    s.phase = 'fight'
    expect(idonethAbilityTiming(s, 'A', 'idonethMindFlare', SCRYER)).toBeLessThan(-2)
    put(s, SCRYER, 0, -1)
    put(s, BOSS, 0, 1.2)
    expect(idonethAbilityTiming(s, 'A', 'idonethMindFlare', SCRYER)).toBeGreaterThanOrEqual(0)
    s.units[BOSS].turn.foughtThisPhase = true
    expect(idonethAbilityTiming(s, 'A', 'idonethMindFlare', SCRYER)).toBeLessThan(-2)
    s.units[BOSS].turn.foughtThisPhase = false
    s.units[BRUTE].turn.foughtThisPhase = true
    expect(idonethTargetBonus(s, 'A', 'idonethMindFlare', BOSS)!).toBeGreaterThan(idonethTargetBonus(s, 'A', 'idonethMindFlare', BRUTE)!)
    // Morsels
    const t = game({ enh: MORSEL_ENH })
    centreRow(t, SCRYER, 0, -6)
    centreRow(t, GUARD, 0, -2.5, 0.1)
    expect(idonethAbilityTiming(t, 'A', 'idonethDeliciousMorsels', SCRYER)).toBeLessThan(-2)
    hurt(t, GUARD, [1])
    expect(idonethAbilityTiming(t, 'A', 'idonethDeliciousMorsels', SCRYER)).toBeGreaterThanOrEqual(0)
    // Predators: the more hurt Cavalry unit scores higher
    const u = game({ reg: EP })
    hurt(u, GUARD, [1, 4, 4])
    hurt(u, ALLO, [7])
    expect(idonethTargetBonus(u, 'A', 'idonethEtherseaPredators', GUARD)!).toBeGreaterThan(idonethTargetBonus(u, 'A', 'idonethEtherseaPredators', ALLO)!)
    ownFightResolved(ctxFor(u), GUARD)
    expect(idonethAbilityTiming(u, 'A', 'idonethEtherseaPredators', null)).toBeGreaterThanOrEqual(0)
    // Mist: the unit with the enemy in its face is preferred over one in the back
    const v = game()
    centreRow(v, TH1, 0, -1)
    centreRow(v, BOSS, 0, 1.4)
    centreRow(v, TH2, -10, -9)
    expect(idonethTargetBonus(v, 'A', 'idonethCreepingMist', TH1)!).toBeGreaterThan(idonethTargetBonus(v, 'A', 'idonethCreepingMist', TH2)!)
  })

  it('IDK-AI whole games: the Idoneth AI plays full games against Cities with every regiment ability and enhancement, without a rejected action', async () => {
    const full = await loadBundle()
    const picks = [
      { reg: 'idoneth.ability.way-of-the-cresting-wave', enh: 'idoneth.enh.steelshell-armour' },
      { reg: 'idoneth.ability.ethersea-predators', enh: 'idoneth.enh.mind-flare' },
      { reg: 'idoneth.ability.way-of-the-cresting-wave', enh: 'idoneth.enh.arch-ritualist' },
      { reg: 'idoneth.ability.ethersea-predators', enh: 'idoneth.enh.delicious-morsels' },
    ]
    for (const [g, pick] of picks.entries()) {
      const seed = `idk-${g}`
      const setup = makeSimSetup(full, g, DATA_VERSION, ['idoneth', 'cities'])
      for (const p of ['A', 'B'] as const) if (setup.players[p].faction === 'idoneth') { setup.players[p].regimentAbilityId = pick.reg; setup.players[p].enhancementId = pick.enh }
      const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
      let r = createGame(setup, seed, full)
      for (let n = 0; r.pending && n < 8000; n++) {
        const legal = legalActions(r.state, r.pending)!
        r = step(r.state, await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal))
        expect(r.rejection).toBeUndefined()
      }
      expect(r.state.phase).toBe('ended')
    }
  }, 400000)
})
