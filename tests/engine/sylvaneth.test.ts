// Sylvaneth (Spitewing Flight) code hooks: docs/spec/factions/sylvaneth.md, test ids SYL-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/sylvaneth files on top of the AoS fixture bundle
// (player A = Spitewing Flight, player B = the fixture Chaos army: Boss, Brutes, Hawk, Guard). Dice are scripted; nothing here patches
// the shipped data except where a test says so.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, unitModels,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { writeDeclaredAttack } from '../../src/engine/declared'
import { effectService } from '../../src/engine/effects'
import { horizontalGap, isCoherent } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { losService } from '../../src/engine/los'
import { buildShootingWeaponEntries } from '../../src/engine/phases/shooting'
import { chargeRollModifier } from '../../src/engine/phases/charge'
import { checkSlide, readMoveQueue } from '../../src/engine/factions/aos-moves'
import { enemiesInCombat } from '../../src/engine/factions/aos-common'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import {
  chordsOf, hornBonus, quarryOf, sylvanethAbilityTiming, sylvanethTargetBonus,
} from '../../src/engine/factions/sylvaneth'
import { weaponService } from '../../src/engine/weapons'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import type { ChargeState } from '../../src/engine/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/sylvaneth/abilities.json'
import enhancementsJson from '../../src/data/factions/sylvaneth/enhancements.json'
import weaponsJson from '../../src/data/factions/sylvaneth/weapons.json'
import factionJson from '../../src/data/factions/sylvaneth/faction.json'
import patrolJson from '../../src/data/factions/sylvaneth/patrols/spitewing-flight.json'
import archJson from '../../src/data/factions/sylvaneth/datasheets/arch-revenant.json'
import archersJson from '../../src/data/factions/sylvaneth/datasheets/gossamid-archers.json'
import lancersJson from '../../src/data/factions/sylvaneth/datasheets/spiterider-lancers.json'
import seekersJson from '../../src/data/factions/sylvaneth/datasheets/revenant-seekers.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  // cloned: a test that patches the data must not leak into the next one
  for (const a of structuredClone(abilitiesJson) as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of structuredClone(weaponsJson) as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of structuredClone([archJson, archersJson, lancersJson, seekersJson].flat()) as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of structuredClone(enhancementsJson) as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.sylvaneth = structuredClone(factionJson) as unknown as FactionData
  b.patrols[patrolJson.id] = structuredClone(patrolJson) as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const TOV = 'sylvaneth.ability.target-of-vengeance'
const SONG = 'sylvaneth.ability.song-of-the-hunt'
const LEAVES = 'sylvaneth.ability.leaves-on-the-wind'
const LIFE = 'sylvaneth.ability.lifebringers'
const HORN = 'sylvaneth.ability.heartwood-hunting-horn'
const SPITES = 'sylvaneth.ability.zephyrspites'
const CHARGE = 'sylvaneth.ability.spiterider-charge'
const DRONE = 'sylvaneth.ability.deafening-drone'
const HEAD = 'sylvaneth.enh.head-of-the-hunt'
const BOLD = 'sylvaneth.enh.bold-spirit'
const CUNNING = 'sylvaneth.enh.cunning-pursuer'
const KIN = 'sylvaneth.enh.zephyrkin'
const BOLD_AB = 'sylvaneth.ability.bold-spirit'
const KIN_AB = 'sylvaneth.ability.zephyrkin'

const ARCH = 'A:arch-revenant'
const ARCHERS = 'A:gossamid-archers'
const LANCERS = 'A:spiterider-lancers'
const SEEKERS = 'A:revenant-seekers'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'
const HAWK = 'B:hawk'

const W = (id: string) => `sylvaneth.weapon.${id}`

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

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void; terrain?: string } = {}): GameState {
  const s = aosState({
    ...(opts.terrain ? { terrainLayoutId: opts.terrain } : {}),
    players: {
      A: makeAosPlayer('A', { faction: 'sylvaneth', patrolId: 'sylvaneth.army.spitewing-flight', enhancementId: opts.enh ?? HEAD, regimentAbilityId: opts.reg ?? LIFE }),
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
  s.round = 1
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

// use one ability once; every other offer is declined. `mode` picks an abilityMode option by id (default: the first)
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string; pickMode?: (ids: string[]) => string } = {}) {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    return opts.mode ?? opts.pickMode?.(ids) ?? ids[0]
  })
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const targetsOf = (code: string, s: GameState, unitId: UnitId | null, player: PlayerId): UnitId[] =>
  (codeHooks[code].activate!.targets as unknown as (state: GameState, unitId: UnitId | null, player: PlayerId) => UnitId[])(s, unitId, player)
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const centreOf = (s: GameState, unitId: UnitId): { x: number; z: number } => {
  const ms = unitModels(s, unitId)
  return { x: ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, z: ms.reduce((a, m) => a + m.pos.z, 0) / ms.length }
}
// the option with the longest slide (ids look like mv:<dx>:<dz>)
const farthest = (ids: string[]): string => {
  const far = (id: string): number => { const [, dx, dz] = id.split(':'); return Math.hypot(Number(dx), Number(dz)) }
  return [...ids].sort((a, b) => far(b) - far(a))[0]
}

// the quarry ledger (mission.custom.sylQuarry) and chords: `destroyed` units are marked destroyed and listed as past quarries
function setQuarry(s: GameState, player: PlayerId, current: UnitId | null, destroyed: UnitId[] = []): void {
  for (const id of destroyed) s.units[id].location = 'destroyed'
  const all = (s.mission.custom.sylQuarry as Record<string, unknown> | undefined) ?? {}
  s.mission.custom = { ...s.mission.custom, sylQuarry: { ...all, [player]: { current, past: [...destroyed, ...(current ? [current] : [])] } } }
}
const CHORD_UNITS: UnitId[] = [HAWK, GUARD, BOSS]
const withChords = (s: GameState, quarry: UnitId | null, chords: number): void => setQuarry(s, 'A', quarry, CHORD_UNITS.slice(0, chords))

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

// a 2D6 charge roll with the given dice, and the modifier the charge-roll hooks add to it
function chargeMod(s: GameState, unitId: UnitId, dice: [number, number] = [3, 3]): number {
  const ctx = ctxFor(s, dice)
  const roll = ctx.roll({ purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId })
  const charge: ChargeState = { unitId, targetUnitIds: [], roll: dice, rerolled: false, distance: null, heroic: false }
  return chargeRollModifier(ctx, charge, roll)
}

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('SYL-REG every code in the Sylvaneth data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('SYL-ARMY-1 the army builds in the engine: Arch-Revenant general, Gossamid Archers, Lancers and Seekers, 12 models, stats as printed', () => {
    const s = game({ enh: BOLD, reg: LEAVES })
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine.map((u) => u.ref).sort()).toEqual(['arch-revenant', 'gossamid-archers', 'revenant-seekers', 'spiterider-lancers'])
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(12)
    expect(s.players.A.warlordUnitId).toBe(ARCH)
    expect(s.units[ARCH].enhancementId).toBe(BOLD)
    expect(s.players.A.regimentAbilityId).toBe(LEAVES)
    expect(s.players.A.battleTraitIds).toEqual([TOV, 'sylvaneth.ability.airborne-cohesion', SONG])
    const st = (id: string) => s.datasheets[`sylvaneth.unit.${id}`].stats
    expect(st('arch-revenant')).toMatchObject({ M: 12, W: 6, Sv: 4, OC: 2 })
    expect(st('gossamid-archers')).toMatchObject({ M: 12, W: 2, Sv: 5, OC: 1 })
    expect(st('spiterider-lancers')).toMatchObject({ M: 12, W: 5, Sv: 4, OC: 2 })
    expect(st('revenant-seekers')).toMatchObject({ M: 12, W: 5, Sv: 4, OC: 2 })
    // every Lancer and Seeker carries the lance / sickle and the Dragonspite's mandibles
    expect(unitModels(s, LANCERS).map((m) => m.weapons.map((w) => w.replace('sylvaneth.weapon.', '')))).toEqual(Array(3).fill(['spiterider-lance', 'dragonspite-mandibles']))
    expect(unitModels(s, SEEKERS).map((m) => m.weapons.map((w) => w.replace('sylvaneth.weapon.', '')))).toEqual(Array(3).fill(['seekers-sickle', 'dragonspite-mandibles']))
    // bases: 40 / 32 / 60 / 60 mm round
    const base = (id: UnitId) => s.models[s.units[id].models[0]].base.radius
    expect(base(ARCH)).toBeCloseTo(40 / 2 / 25.4, 2)
    expect(base(ARCHERS)).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(base(LANCERS)).toBeCloseTo(60 / 2 / 25.4, 2)
    expect(base(SEEKERS)).toBeCloseTo(60 / 2 / 25.4, 2)
  })

  it('SYL-ARMY-2 no unit has Reinforcements: nothing is ever offered for replacement or Call for Reinforcements', () => {
    const s = game()
    for (const id of [ARCH, ARCHERS, LANCERS, SEEKERS]) {
      expect(s.datasheets[s.units[id].datasheetId].keywords).not.toContain('REINFORCEMENTS')
      s.units[id].location = 'destroyed'
    }
    expect(replaceableUnits(s, 'A')).toEqual([])
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).not.toContain('spearhead.ability.call-for-reinforcements')
    expect(offered(s, 'A', 'movement')).toEqual([])
  })

  it('SYL-ARMY-3 every unit has Fly and moves over models; none has a Ward', () => {
    const s = game()
    for (const id of [ARCH, ARCHERS, LANCERS, SEEKERS]) {
      const ds = s.datasheets[s.units[id].datasheetId]
      expect(ds.keywords, id).toContain('FLY')
      expect((ds.stats as { ward?: number }).ward ?? null, id).toBeNull()
    }
    // a slide that passes over an enemy unit's models is fine for a flyer
    centreRow(s, LANCERS, 0, -6)
    put(s, BRUTE, 0, -3)
    s.units[BRUTE].location = 'board'
    expect(checkSlide(s, LANCERS, 0, 12, 12, false, { passThrough: true }).ok || checkSlide(s, LANCERS, 0, 12, 12, false, { mayNotEndInCombat: true }).ok).toBe(true)
  })
})

describe('SYL-BT battle traits', () => {
  it('SYL-BT-1 Target of Vengeance: offered at round start only while no quarry is on the battlefield; marks any enemy unit; offered again after it is destroyed', () => {
    const s = game()
    s.phase = 'command'
    expect(offered(s, 'A', 'startOfRound')).toContain(TOV)
    expect(offered(s, 'B', 'startOfRound')).not.toContain(TOV)
    // any enemy unit on the battlefield, no range or visibility needed; one in reserve is not on the battlefield
    s.units[HAWK].location = 'reserves'
    expect(targetsOf('sylvanethTargetOfVengeance', s, null, 'A').sort()).toEqual([BOSS, BRUTE, GUARD])
    s.units[HAWK].location = 'board'
    const ctx = ctxFor(s)
    useOnce(ctx, 'startOfRound', 'A', TOV, { target: BRUTE })
    expect(quarryOf(s, 'A')).toBe(BRUTE)
    expect(quarryOf(s, 'B')).toBeNull()
    expect(chordsOf(s, 'A')).toBe(0)
    expect(summaries(ctx).some((x) => x.includes('quarry'))).toBe(true)
    // not again in the same round, nor in the next while it lives
    expect(offered(s, 'A', 'startOfRound')).not.toContain(TOV)
    s.round = 2
    expect(offered(s, 'A', 'startOfRound')).not.toContain(TOV)
    // destroyed: no quarry any more, so the next round start offers a new pick
    s.units[BRUTE].location = 'destroyed'
    expect(quarryOf(s, 'A')).toBeNull()
    expect(offered(s, 'A', 'startOfRound')).toContain(TOV)
    useOnce(ctxFor(s), 'startOfRound', 'A', TOV, { target: BOSS })
    expect(quarryOf(s, 'A')).toBe(BOSS)
    expect(chordsOf(s, 'A')).toBe(1)
    // nobody left to pick: not offered
    for (const id of [BOSS, GUARD, HAWK]) s.units[id].location = 'destroyed'
    s.round = 3
    expect(offered(s, 'A', 'startOfRound')).not.toContain(TOV)
  })

  it('SYL-BT-2 Airborne Cohesion: friendly units stay coherent with models up to 2" apart (5 Gossamids spread 2" apart are legal)', () => {
    const s = game()
    const range = (id: UnitId): number | undefined => s.datasheets[s.units[id].datasheetId].coherencyRange
    for (const id of [ARCH, ARCHERS, LANCERS, SEEKERS]) expect(range(id), id).toBe(2)
    expect(range(BRUTE)).toBeUndefined()
    const spread = (id: UnitId, gap: number): void => {
      const ms = unitModels(s, id)
      const d = 2 * Math.max(ms[0].base.radius, ms[0].base.radius2 ?? 0) + gap
      ms.forEach((m, i) => { m.pos = { x: i * d, y: 0, z: 0 } })
    }
    spread(ARCHERS, 1.95)
    expect(isCoherent(unitModels(s, ARCHERS), range(ARCHERS))).toBe(true)
    expect(isCoherent(unitModels(s, ARCHERS))).toBe(false) // the usual ½" would not do
    spread(ARCHERS, 2.4)
    expect(isCoherent(unitModels(s, ARCHERS), range(ARCHERS))).toBe(false)
    spread(LANCERS, 1.9)
    expect(isCoherent(unitModels(s, LANCERS), range(LANCERS))).toBe(true)
  })

  it('SYL-BT-3 Song chords: +1 chord per destroyed quarry; a quarry that leaves the battlefield without being destroyed gives none; a replaced quarry gives one', () => {
    const s = game()
    expect(chordsOf(s, 'A')).toBe(0)
    setQuarry(s, 'A', BRUTE)
    expect(chordsOf(s, 'A')).toBe(0)
    // off the battlefield but not destroyed: no quarry for now, no chord
    s.units[BRUTE].location = 'reserves'
    expect(quarryOf(s, 'A')).toBeNull()
    expect(chordsOf(s, 'A')).toBe(0)
    s.units[BRUTE].location = 'board'
    expect(quarryOf(s, 'A')).toBe(BRUTE) // set up again: still the quarry
    // destroyed: one chord
    s.units[BRUTE].location = 'destroyed'
    expect(chordsOf(s, 'A')).toBe(1)
    // the enemy calls it back: the original still counts, the copy is a different unit and not the quarry
    s.units[BRUTE].replaced = true
    expect(chordsOf(s, 'A')).toBe(1)
    expect(quarryOf(s, 'A')).toBeNull()
    // a second quarry destroyed too
    setQuarry(s, 'A', null, [BRUTE, BOSS])
    expect(chordsOf(s, 'A')).toBe(2)
    // chords belong to the player who picked: the opponent has none
    expect(chordsOf(s, 'B')).toBe(0)
  })

  it('SYL-BT-4 Simple (1+ chord): +1 to run and charge rolls only for units within 9" of the quarry; nothing with 0 chords', () => {
    const s = game()
    centreRow(s, LANCERS, -4, -2)
    put(s, BRUTE, 0, 2) // 4-5" from the Lancers
    const run = (id: UnitId): number => hookService.advanceRollFor(s, id, 3)
    withChords(s, BRUTE, 0)
    expect(run(LANCERS)).toBe(3)
    expect(chargeMod(s, LANCERS)).toBe(0)
    withChords(s, BRUTE, 1)
    s.units[BRUTE].location = 'board'
    expect(quarryOf(s, 'A')).toBe(BRUTE)
    expect(run(LANCERS)).toBe(4)
    expect(chargeMod(s, LANCERS)).toBe(1)
    // a unit more than 9" from the quarry gets nothing (the back-edge Archers)
    expect(gapBetween(s, ARCHERS, BRUTE)).toBeGreaterThan(9)
    expect(run(ARCHERS)).toBe(3)
    expect(chargeMod(s, ARCHERS)).toBe(0)
    // the enemy's units never benefit, whoever they stand next to
    expect(hookService.advanceRollFor(s, BOSS, 3)).toBe(3)
    // no quarry on the battlefield: nobody is within 9" of it
    s.units[BRUTE].location = 'reserves'
    expect(run(LANCERS)).toBe(3)
  })

  it('SYL-BT-5 Tuneful (2+ chords): +1 to hit for units within 9" of the quarry, against any target; capped at +1 overall', () => {
    const slow = (b: DataBundle): void => { b.weapons[W('spiterider-lance')].skill = 5 } // needs 5+: a die of 3 only hits with +2
    // plain case: the Lance (3+) with a die of 2 hits only with +1
    const run = (chords: number, target: UnitId): number => {
      const s = game()
      centreRow(s, LANCERS, -4, -2)
      centreRow(s, BRUTE, 0, 2)
      put(s, BOSS, -4, 1)
      withChords(s, BRUTE, chords)
      s.units[BRUTE].location = 'board'
      const before = wounds(s, target)
      attack(s, 'melee', [2, 2, 2, 6, 6, 6, 1, 1, 1], LANCERS, W('spiterider-lance'), target, 3)
      return before - wounds(s, target)
    }
    expect(run(1, BRUTE)).toBe(0) // Simple alone gives no hit bonus
    expect(run(2, BRUTE)).toBe(3) // Tuneful: 3 hits, 3 wounds, 3 failed saves, 1 damage each
    expect(run(2, BOSS)).toBe(3) // any target, not only the quarry
    // beyond 9" nothing
    const far = game()
    centreRow(far, LANCERS, 8, 9)
    put(far, BRUTE, -9, -3)
    withChords(far, BRUTE, 2)
    far.units[BRUTE].location = 'board'
    const b0 = wounds(far, BOSS)
    attack(far, 'melee', [2, 2, 2], LANCERS, W('spiterider-lance'), BOSS, 3)
    expect(wounds(far, BOSS)).toBe(b0)
    // the +1 cap: a Lance needing 5+ with Tuneful and another +1 to hit still hits on a 4 only, not on a 3
    const capped = (die: number): number => {
      const s = game({ patch: slow })
      centreRow(s, LANCERS, -4, -2)
      centreRow(s, BRUTE, 0, 2)
      withChords(s, BRUTE, 2)
      s.units[BRUTE].location = 'board'
      effectService.grant(ctxFor(s), LANCERS, { modifyRoll: { roll: 'hit', value: 1 } }, { sourceAbilityId: 'test', sourceUnitId: LANCERS, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
      const before = wounds(s, BRUTE)
      attack(s, 'melee', [die, die, die, 6, 6, 6, 1, 1, 1], LANCERS, W('spiterider-lance'), BRUTE, 3)
      return before - wounds(s, BRUTE)
    }
    expect(capped(4)).toBe(3)
    expect(capped(3)).toBe(0)
  })

  it('SYL-BT-6 Melodic (3+ chords): +1 to wound for units within 9" of the quarry; with 3 chords Simple and Tuneful apply too', () => {
    const s = game()
    centreRow(s, LANCERS, -4, -2)
    centreRow(s, BRUTE, 0, 2)
    withChords(s, BRUTE, 3)
    s.units[BRUTE].location = 'board'
    // Lance 3+ to hit, 4+ to wound: dice 2 / 3 only work with +1 and +1
    const before = wounds(s, BRUTE)
    const r = attack(s, 'melee', [2, 2, 2, 3, 3, 3, 1, 1, 1], LANCERS, W('spiterider-lance'), BRUTE, 3)
    expect(before - wounds(s, BRUTE)).toBe(3)
    expect(r.rng.remaining).toEqual([])
    expect(hookService.advanceRollFor(s, LANCERS, 3)).toBe(4)
    expect(chargeMod(s, LANCERS)).toBe(1)
    // with only 2 chords the wound dice of 3 fail
    const t = game()
    centreRow(t, LANCERS, -4, -2)
    centreRow(t, BRUTE, 0, 2)
    withChords(t, BRUTE, 2)
    t.units[BRUTE].location = 'board'
    const b2 = wounds(t, BRUTE)
    const r2 = attack(t, 'melee', [2, 2, 2, 3, 3, 3], LANCERS, W('spiterider-lance'), BRUTE, 3)
    expect(wounds(t, BRUTE)).toBe(b2)
    expect(r2.rng.remaining).toEqual([])
    // out of range of the quarry: not even with 3 chords
    const u = game()
    centreRow(u, LANCERS, 8, 9)
    put(u, BRUTE, -9, -3)
    withChords(u, BRUTE, 3)
    u.units[BRUTE].location = 'board'
    const b3 = wounds(u, BOSS)
    attack(u, 'melee', [3, 3, 3], LANCERS, W('spiterider-lance'), BOSS, 3)
    expect(wounds(u, BOSS)).toBe(b3)
  })
})

describe('SYL-RA regiment abilities', () => {
  it('SYL-RA-1 Leaves on the Wind: end of any turn, a friendly unit in combat retreats up to its Move with no mortal damage and ends out of combat; once per battle', () => {
    const s = game({ reg: LEAVES })
    s.phase = 'fight'
    // nobody in combat: not offered
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(LEAVES)
    centreRow(s, SEEKERS, 0, -2)
    centreRow(s, BRUTE, 0, 0.6)
    expect(enemiesInCombat(s, SEEKERS)).toEqual([BRUTE])
    expect(offered(s, 'A', 'endOfTurn')).toContain(LEAVES)
    expect(offered(s, 'B', 'endOfTurn')).not.toContain(LEAVES)
    expect(targetsOf('sylvanethLeavesOnTheWind', s, null, 'A')).toEqual([SEEKERS])
    const hp = wounds(s, SEEKERS)
    const ctx = ctxFor(s) // no dice at all: no retreat roll
    const r = useOnce(ctx, 'endOfTurn', 'A', LEAVES, { target: SEEKERS, pickMode: farthest })
    expect(r.topics).toContain('abilityMode')
    expect(wounds(s, SEEKERS)).toBe(hp)
    expect(leftOver(ctx)).toEqual([])
    expect(enemiesInCombat(s, SEEKERS)).toEqual([])
    expect(losService.unitInCombat(s, SEEKERS)).toBe(false)
    expect(s.units[SEEKERS].turn.moveType).toBe('fallBack')
    const c = centreOf(s, SEEKERS)
    expect(Math.hypot(c.x - 0, c.z - -2)).toBeLessThanOrEqual(12 + 1e-2)
    // once per battle, even next turn
    centreRow(s, SEEKERS, 0, -2)
    s.round = 2
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(LEAVES)
  })

  it('SYL-RA-2 Lifebringers: end of any turn, every damaged friendly unit heals its own D3; once per turn; never returns slain models', () => {
    const s = game()
    s.phase = 'fight'
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(LIFE) // nothing damaged
    const seeker = s.units[SEEKERS].models[0]
    s.models[seeker].woundsRemaining = 1 // 4 missing
    const lancer = s.units[LANCERS].models[0]
    s.models[lancer].woundsRemaining = 4 // 1 missing
    const slain = s.units[ARCHERS].models.length
    delete s.models[s.units[ARCHERS].models[4]]
    s.units[ARCHERS].models = s.units[ARCHERS].models.slice(0, 4)
    expect(offered(s, 'A', 'endOfTurn')).toContain(LIFE)
    // one D3 per damaged unit, in unit-id order: Seekers (face 4 = 2), then Lancers (face 6 = 3, heals the 1 missing)
    const ctx = ctxFor(s, [4, 6])
    useOnce(ctx, 'endOfTurn', 'A', LIFE)
    expect(s.models[lancer].woundsRemaining).toBe(5)
    expect(s.models[seeker].woundsRemaining).toBe(3)
    expect(leftOver(ctx)).toEqual([])
    expect(s.units[ARCHERS].models.length).toBe(slain - 1) // the slain Archer stays slain
    // once per turn (army-wide) ...
    s.models[seeker].woundsRemaining = 1
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(LIFE)
    // ... but again at the end of the opponent's turn
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'endOfTurn')).toContain(LIFE)
  })
})

describe('SYL-ENH enhancements', () => {
  it('SYL-ENH-1 Head of the Hunt: general\'s melee Rend +1 while the quarry is within 9" and visible; not beyond 9", not when hidden, not with no quarry', () => {
    const glaive = (s: GameState): number => weaponService.effectiveWeapon(s, s.units[ARCH].models[0], W('arch-revenants-glaive')).rend
    const s = game()
    centreRow(s, ARCH, 0, -2)
    put(s, BRUTE, 0, 4)
    expect(glaive(s)).toBe(1) // no quarry yet
    setQuarry(s, 'A', BRUTE)
    expect(gapBetween(s, ARCH, BRUTE)).toBeLessThan(9)
    expect(glaive(s)).toBe(2)
    // ranged weapons and other units are untouched
    const bow = weaponService.effectiveWeapon(s, s.units[ARCHERS].models[0], W('gossamid-bow')).rend
    expect(bow).toBe(1)
    // more than 9" away
    put(s, BRUTE, 0, 9)
    expect(gapBetween(s, ARCH, BRUTE)).toBeGreaterThan(9)
    expect(glaive(s)).toBe(1)
    // hidden behind the obscuring ruin (a wall between them)
    const h = game({ terrain: 'fx.terrain.standard' })
    centreRow(h, ARCH, -6, -1)
    put(h, BRUTE, -6, 5.2)
    setQuarry(h, 'A', BRUTE)
    expect(gapBetween(h, ARCH, BRUTE)).toBeLessThan(9)
    expect(losService.unitVisible(h, h.units[ARCH].models[0], BRUTE)).toBe(false)
    expect(glaive(h)).toBe(1)
    // the quarry destroyed: back to Rend 1
    s.units[BRUTE].location = 'destroyed'
    expect(glaive(s)).toBe(1)
    // the real damage sequence sees it: against a 3+ save a die of 4 is saved by Rend 1 but not by Rend 2
    const fight = (quarry: boolean): number => {
      const g = game()
      centreRow(g, ARCH, 0, -2)
      centreRow(g, BRUTE, 0, 1.2)
      if (quarry) setQuarry(g, 'A', BRUTE)
      const w0 = wounds(g, BRUTE)
      attack(g, 'melee', [6, 6, 6, 6, 4, 4], ARCH, W('arch-revenants-glaive'), BRUTE, 2)
      return w0 - wounds(g, BRUTE)
    }
    expect(fight(false)).toBe(0)
    expect(fight(true)).toBe(4) // two unsaved attacks of 2 damage
  })

  it('SYL-ENH-2 Zephyrkin: offered when the general is picked to fight after charging; after its attacks it may move up to 2D6" and must end out of combat; not offered if it did not charge', () => {
    // the card prints no ability keywords (unlike Zephyrspites, which prints Move)
    const descriptors = abilitiesJson as unknown as AbilityDescriptor[]
    expect(descriptors.find((a) => a.id === 'sylvaneth.ability.zephyrkin')?.keywords ?? []).toEqual([])
    expect(descriptors.find((a) => a.id === 'sylvaneth.ability.zephyrspites')?.keywords).toEqual(['MOVE'])
    const s = game({ enh: KIN })
    s.phase = 'fight'
    centreRow(s, ARCH, 0, -2)
    centreRow(s, BRUTE, 0, 0.7)
    expect(enemiesInCombat(s, ARCH)).toEqual([BRUTE])
    writeDeclaredAttack(s, { unitId: ARCH, phase: 'fight', seq: 1 })
    // did not charge: not offered
    expect(offered(s, 'A', 'attackDeclared')).not.toContain(KIN_AB)
    s.units[ARCH].turn.chargedThisTurn = true
    expect(offered(s, 'A', 'attackDeclared')).toContain(KIN_AB)
    // another unit's declaration does not count
    writeDeclaredAttack(s, { unitId: SEEKERS, phase: 'fight', seq: 2 })
    expect(offered(s, 'A', 'attackDeclared')).not.toContain(KIN_AB)
    writeDeclaredAttack(s, { unitId: ARCH, phase: 'fight', seq: 3 })
    // 3 + 4 = 7": the move waits for the 'fightAfter' window
    const ctx = ctxFor(s, [3, 4])
    useOnce(ctx, 'attackDeclared', 'A', KIN_AB)
    const q = readMoveQueue(s)
    expect(q).toMatchObject({ queue: [ARCH], maxDistance: 7, atWindow: 'fightAfter', opts: { mayNotEndInCombat: true } })
    const start = centreOf(s, ARCH)
    runWindow(ctx, 'fight', 'A', (_t, ids) => ids[0])
    expect(centreOf(s, ARCH)).toEqual(start) // not before the fight is over
    expect(readMoveQueue(s)).not.toBeNull()
    const r = runWindow(ctx, 'fightAfter', 'A', (topic, ids) => (topic === 'abilityMode' ? farthest(ids) : ids[0]))
    expect(r.topics).toContain('abilityMode')
    const end = centreOf(s, ARCH)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(1)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThanOrEqual(7 + 1e-2)
    expect(losService.unitInCombat(s, ARCH)).toBe(false)
    expect(readMoveQueue(s)).toBeNull()
    // every offered slide ends out of combat (staying put is the only alternative)
    const t = game({ enh: KIN })
    centreRow(t, ARCH, 0, -2)
    centreRow(t, BRUTE, 0, 0.7)
    expect(checkSlide(t, ARCH, 0, -4, 12, false, { mayNotEndInCombat: true }).ok).toBe(true)
    expect(checkSlide(t, ARCH, 0, 1, 12, false, { mayNotEndInCombat: true }).ok).toBe(false)
  })

  it('SYL-ENH-3 Bold Spirit: once per battle, any hero phase; rest of turn +1 to wound for melee attacks by friendly units within 3" of the general (general included); ranged attacks unaffected', () => {
    const s = game({ enh: BOLD })
    s.phase = 'command'
    centreRow(s, ARCH, 0, -6)
    centreRow(s, LANCERS, 0, -3.2) // within 3" of the general
    place(s, ARCHERS, -3, -9.5) // the Archers: 3.5" or more away
    centreRow(s, BRUTE, 0, -0.4)
    expect(offered(s, 'A', 'hero')).toContain(BOLD_AB)
    expect(offered(s, 'B', 'hero')).not.toContain(BOLD_AB) // the bearer's player only
    // before it is used, a wound die of 3 fails (Lance wounds on 4+)
    const wound = (unit: UnitId, weapon: string, kind: 'melee' | 'ranged', target: UnitId): number => {
      const before = wounds(s, target)
      attack(s, kind, [6, 6, 6, 3, 3, 3], unit, weapon, target, 3)
      return before - wounds(s, target)
    }
    expect(wound(LANCERS, W('spiterider-lance'), 'melee', BRUTE)).toBe(0)
    const ctx = ctxFor(s)
    useOnce(ctx, 'hero', 'A', BOLD_AB)
    expect(offered(s, 'A', 'hero')).not.toContain(BOLD_AB) // once per battle
    // within 3" of the general: the wound dice of 3 now work (3 + 1)
    const before = wounds(s, BRUTE)
    attack(s, 'melee', [6, 6, 6, 3, 3, 3, 1, 1, 1], LANCERS, W('spiterider-lance'), BRUTE, 3)
    expect(before - wounds(s, BRUTE)).toBe(3)
    // the general's own unit counts
    const b2 = wounds(s, BRUTE)
    attack(s, 'melee', [6, 6, 3, 3, 1, 1], ARCH, W('arch-revenants-glaive'), BRUTE, 2)
    expect(b2 - wounds(s, BRUTE)).toBeGreaterThan(0)
    // a unit more than 3" away gets nothing
    centreRow(s, SEEKERS, 8, -3.2)
    expect(gapBetween(s, SEEKERS, ARCH)).toBeGreaterThan(3)
    const far = ((): number => { const b = wounds(s, BRUTE); attack(s, 'melee', [5, 5, 5, 3, 3, 3], SEEKERS, W('seekers-sickle'), BRUTE, 3); return b - wounds(s, BRUTE) })()
    expect(far).toBe(0)
    // ranged attacks are not combat attacks
    centreRow(s, ARCHERS, 0, -4)
    const b3 = wounds(s, BRUTE)
    attack(s, 'ranged', [6, 6, 3, 3], ARCHERS, W('gossamid-bow'), BRUTE, 2)
    expect(wounds(s, BRUTE)).toBe(b3)
    // it ends with the turn
    effectService.expire(ctx, 'turnEnd', null)
    const b4 = wounds(s, BRUTE)
    attack(s, 'melee', [6, 6, 6, 3, 3, 3], LANCERS, W('spiterider-lance'), BRUTE, 3)
    expect(wounds(s, BRUTE)).toBe(b4)
  })

  it('SYL-ENH-4 Cunning Pursuer: while the general is in combat, +1 to charge rolls for friendly units wholly within 12"; +2 when it is in combat with the quarry; nothing when it is not in combat', () => {
    const s = game({ enh: CUNNING })
    const ensure = (): void => codeHooks.sylvanethCunningPursuer.ensureEffects!(ctxFor(s))
    ensure()
    expect(s.units[ARCH].effects.some((e) => e.sourceAbilityId === 'sylvaneth.ability.cunning-pursuer' && e.expires.kind === 'battle')).toBe(true)
    ensure()
    expect(s.units[ARCH].effects.filter((e) => e.sourceAbilityId === 'sylvaneth.ability.cunning-pursuer')).toHaveLength(1)
    centreRow(s, LANCERS, 0, -7)
    put(s, GUARD, 9, 8)
    // the general is not in combat
    centreRow(s, ARCH, 0, -4)
    centreRow(s, BOSS, 6, 6)
    expect(losService.unitInCombat(s, ARCH)).toBe(false)
    expect(chargeMod(s, LANCERS)).toBe(0)
    // in combat with a unit that is not the quarry
    centreRow(s, BOSS, 0, -1.2)
    expect(enemiesInCombat(s, ARCH)).toEqual([BOSS])
    expect(chargeMod(s, LANCERS)).toBe(1)
    // with the quarry
    setQuarry(s, 'A', BOSS)
    expect(chargeMod(s, LANCERS)).toBe(2)
    // units not wholly within 12" get nothing
    centreRow(s, SEEKERS, 11, -4)
    expect(chargeMod(s, SEEKERS)).toBe(0)
    // it stacks with Simple (the quarry is within 9" of the Lancers and one chord is earned)
    withChords(s, BOSS, 1)
    s.units[BOSS].location = 'board'
    expect(chargeMod(s, LANCERS)).toBe(3)
    // the enemy's units get nothing
    expect(chargeMod(s, BRUTE)).toBe(0)
  })
})

describe('SYL-AB warscroll abilities', () => {
  it('SYL-AB-1 Heartwood Hunting Horn: target counts 1 extra chord until your next turn (0 chords + horn = Simple only); needs a quarry within 9" to matter; target visible and wholly within 12"', () => {
    const s = game()
    s.phase = 'command'
    centreRow(s, ARCH, 0, -6)
    centreRow(s, ARCHERS, -4, -5)
    centreRow(s, SEEKERS, 3, -4)
    centreRow(s, LANCERS, 12, -8) // not wholly within 12"
    put(s, BRUTE, -4, 1)
    // a self-pick is allowed; units too far are not offered
    const targets = targetsOf('sylvanethHeartwoodHorn', s, ARCH, 'A')
    expect(targets).toContain(ARCH)
    expect(targets).toContain(ARCHERS)
    expect(targets).toContain(SEEKERS)
    expect(targets).not.toContain(LANCERS)
    expect(offered(s, 'A', 'hero')).toContain(HORN)
    const ctx = ctxFor(s)
    useOnce(ctx, 'hero', 'A', HORN, { target: ARCHERS })
    expect(hornBonus(s, ARCHERS)).toBe(1)
    expect(hornBonus(s, SEEKERS)).toBe(0)
    expect(s.units[ARCHERS].effects.find((e) => e.sourceAbilityId === HORN)?.expires.kind).toBe('nextOwnTurn')
    // no quarry: the extra chord means nothing
    expect(hookService.advanceRollFor(s, ARCHERS, 3)).toBe(3)
    // a quarry within 9": 0 chords + horn = Simple (run, charge) but not Tuneful
    setQuarry(s, 'A', BRUTE)
    expect(chordsOf(s, 'A')).toBe(0)
    expect(gapBetween(s, ARCHERS, BRUTE)).toBeLessThan(9)
    expect(hookService.advanceRollFor(s, ARCHERS, 3)).toBe(4)
    expect(hookService.advanceRollFor(s, SEEKERS, 3)).toBe(3) // no horn
    const hitDice = (unit: UnitId): number => {
      const before = wounds(s, BRUTE)
      attack(s, 'ranged', [2, 2, 6, 6, 1, 1], unit, W('gossamid-bow'), BRUTE, 2)
      return before - wounds(s, BRUTE)
    }
    expect(hitDice(ARCHERS)).toBe(0) // no hit bonus yet
    // one real chord + horn = Tuneful
    withChords(s, BRUTE, 1)
    s.units[BRUTE].location = 'board'
    expect(hitDice(ARCHERS)).toBe(2)
    // a quarry more than 9" away: the horn does nothing
    put(s, BRUTE, -4, 8)
    expect(gapBetween(s, ARCHERS, BRUTE)).toBeGreaterThan(9)
    expect(hookService.advanceRollFor(s, ARCHERS, 3)).toBe(3)
    // visibility: a unit hidden from the Arch-Revenant is not offered
    const h = game({ terrain: 'fx.terrain.standard' })
    centreRow(h, ARCH, -6, -1)
    centreRow(h, ARCHERS, -6, 5.2)
    expect(losService.unitVisible(h, h.units[ARCH].models[0], ARCHERS)).toBe(false)
    expect(targetsOf('sylvanethHeartwoodHorn', h, ARCH, 'A')).not.toContain(ARCHERS)
    expect(targetsOf('sylvanethHeartwoodHorn', h, ARCH, 'A')).toContain(ARCH)
    // it ends at the start of the next own turn
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(hornBonus(s, ARCHERS)).toBe(0)
  })

  it('SYL-AB-2 Zephyrspites: after the Gossamids shoot they may move up to D6"; the path may not enter any enemy combat range even with Fly; not offered while in combat', () => {
    const s = game()
    s.phase = 'shooting'
    centreRow(s, ARCHERS, 0, -8)
    centreRow(s, BRUTE, 0, 2)
    writeDeclaredAttack(s, { unitId: ARCHERS, phase: 'shooting', seq: 1, targetUnitIds: [BRUTE] })
    expect(offered(s, 'A', 'attackDeclared')).toContain(SPITES)
    // another unit's declaration, or a Fight declaration, does not offer it
    writeDeclaredAttack(s, { unitId: LANCERS, phase: 'shooting', seq: 2 })
    expect(offered(s, 'A', 'attackDeclared')).not.toContain(SPITES)
    writeDeclaredAttack(s, { unitId: ARCHERS, phase: 'fight', seq: 3 })
    expect(offered(s, 'A', 'attackDeclared')).not.toContain(SPITES)
    writeDeclaredAttack(s, { unitId: ARCHERS, phase: 'shooting', seq: 4, targetUnitIds: [BRUTE] })
    const ctx = ctxFor(s, [4]) // D6 = 4
    useOnce(ctx, 'attackDeclared', 'A', SPITES)
    expect(readMoveQueue(s)).toMatchObject({ queue: [ARCHERS], maxDistance: 4, atWindow: 'shooting', opts: { noCombatPath: true } })
    // it waits for the shooting window; the movement-phase and fight windows leave it alone
    const start = centreOf(s, ARCHERS)
    runWindow(ctx, 'fight', 'A', (_t, ids) => ids[0])
    expect(readMoveQueue(s)).not.toBeNull()
    const r = runWindow(ctx, 'shooting', 'A', (topic, ids) => (topic === 'abilityMode' ? farthest(ids) : ids[0]))
    expect(r.topics).toContain('abilityMode')
    const end = centreOf(s, ARCHERS)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThanOrEqual(4 + 1e-2)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(1)
    expect(readMoveQueue(s)).toBeNull()
    // the path never enters an enemy combat range, although the Archers fly: a plain Fly slide would cross the bubble
    const t = game()
    centreRow(t, ARCHERS, -7, -4)
    put(t, GUARD, 0, -1.3) // its 3" bubble covers the middle of a sideways slide, not the start or the end
    centreRow(t, BRUTE, -9, 8)
    const plain = { mayNotEndInCombat: true }
    const noPath = { noCombatPath: true }
    expect(losService.unitInCombat(t, ARCHERS)).toBe(false)
    expect(checkSlide(t, ARCHERS, 14, 0, 14, false, plain).ok).toBe(true) // a flyer passes through the bubble and ends clear of it
    expect(checkSlide(t, ARCHERS, 14, 0, 14, false, noPath).ok).toBe(false)
    expect(checkSlide(t, ARCHERS, -3, 0, 12, false, noPath).ok).toBe(true) // away from it
    // in combat: not offered, and no slide at all
    const u = game()
    u.phase = 'shooting'
    centreRow(u, ARCHERS, 0, -2)
    centreRow(u, BRUTE, 0, 0.8)
    expect(losService.unitInCombat(u, ARCHERS)).toBe(true)
    writeDeclaredAttack(u, { unitId: ARCHERS, phase: 'shooting', seq: 1, targetUnitIds: [BRUTE] })
    expect(offered(u, 'A', 'attackDeclared')).not.toContain(SPITES)
    // a unit that ended up in combat by the time the window comes is skipped without a decision
    const v = game()
    v.phase = 'shooting'
    centreRow(v, ARCHERS, 0, -2)
    centreRow(v, BRUTE, 0, 0.8)
    codeHooks.sylvanethZephyrspites.activate!.resolve(ctxFor(v, [5]), { abilityId: SPITES, unitId: ARCHERS, player: 'A', targetUnitIds: [], modeId: null, roll: null })
    const rv = runWindow(ctxFor(v), 'shooting', 'A', (_t, ids) => ids[0])
    expect(rv.topics).toEqual([])
    expect(readMoveQueue(v)).toBeNull()
  })

  it('SYL-AB-3 Spiterider Charge: only for Lancers that charged this phase; visible enemy within 1"; D3 (+1 vs quarry), 2+ deals that much mortal damage; a 1 does nothing', () => {
    const base = (): GameState => {
      const s = game()
      s.phase = 'charge'
      centreRow(s, LANCERS, 0, -2)
      centreRow(s, BRUTE, 0, 0.3)
      put(s, BOSS, 12, 5)
      return s
    }
    const s = base()
    // did not charge: not offered
    expect(offered(s, 'A', 'charge')).not.toContain(CHARGE)
    s.units[LANCERS].turn.chargedThisTurn = true
    expect(gapBetween(s, LANCERS, BRUTE)).toBeLessThanOrEqual(1)
    expect(offered(s, 'A', 'charge')).toContain(CHARGE)
    expect(targetsOf('sylvanethSpiteriderCharge', s, LANCERS, 'A')).toEqual([BRUTE]) // the Boss is far away
    // D3 = 2 (face 3): 2 mortal damage
    const hp = wounds(s, BRUTE)
    const ctx = ctxFor(s, [3])
    useOnce(ctx, 'charge', 'A', CHARGE, { target: BRUTE })
    expect(hp - wounds(s, BRUTE)).toBe(2)
    expect(leftOver(ctx)).toEqual([])
    // against the quarry the roll gets +1: 2 + 1 = 3
    const q = base()
    q.units[LANCERS].turn.chargedThisTurn = true
    setQuarry(q, 'A', BRUTE)
    const hq = wounds(q, BRUTE)
    useOnce(ctxFor(q, [3]), 'charge', 'A', CHARGE, { target: BRUTE })
    expect(hq - wounds(q, BRUTE)).toBe(3)
    // a 1 on a non-quarry does nothing; a 1 on the quarry becomes a 2
    const one = base()
    one.units[LANCERS].turn.chargedThisTurn = true
    const h1 = wounds(one, BRUTE)
    useOnce(ctxFor(one, [1]), 'charge', 'A', CHARGE, { target: BRUTE })
    expect(wounds(one, BRUTE)).toBe(h1)
    const oneQ = base()
    oneQ.units[LANCERS].turn.chargedThisTurn = true
    setQuarry(oneQ, 'A', BRUTE)
    const h2 = wounds(oneQ, BRUTE)
    useOnce(ctxFor(oneQ, [1]), 'charge', 'A', CHARGE, { target: BRUTE })
    expect(h2 - wounds(oneQ, BRUTE)).toBe(2)
    // an enemy more than 1" away is not a target
    const far = base()
    far.units[LANCERS].turn.chargedThisTurn = true
    centreRow(far, BRUTE, 0, 1.2)
    expect(gapBetween(far, LANCERS, BRUTE)).toBeGreaterThan(1)
    expect(offered(far, 'A', 'charge')).not.toContain(CHARGE)
    // the opponent's units never get it, and it is once per phase
    expect(offered(s, 'A', 'charge')).not.toContain(CHARGE)
  })

  it('SYL-AB-4 Deafening Drone: only if the Seekers did not charge; D6 > target Control gives -1 Attacks to the target\'s melee weapons (Companion included) for the turn, floor 1; equal or lower does nothing', () => {
    const base = (patch?: (b: DataBundle) => void): GameState => {
      const s = game({ patch })
      s.phase = 'fight'
      centreRow(s, SEEKERS, 0, -2)
      centreRow(s, BRUTE, 0, 0.7)
      return s
    }
    const axe = (s: GameState): number => Number(weaponService.effectiveWeapon(s, s.units[BRUTE].models[0], 'fx.w.brute-axe').A)
    const s = base()
    expect(enemiesInCombat(s, SEEKERS)).toEqual([BRUTE])
    expect(offered(s, 'A', 'fight')).toContain(DRONE)
    expect(offered(s, 'B', 'fight')).not.toContain(DRONE)
    s.units[SEEKERS].turn.chargedThisTurn = true
    expect(offered(s, 'A', 'fight')).not.toContain(DRONE) // it charged
    s.units[SEEKERS].turn.chargedThisTurn = false
    expect(axe(s)).toBe(3)
    // 2 against Control 1: -1 Attacks
    const ctx = ctxFor(s, [2])
    useOnce(ctx, 'fight', 'A', DRONE, { target: BRUTE })
    expect(axe(s)).toBe(2)
    expect(leftOver(ctx)).toEqual([])
    // it ends with the turn
    effectService.expire(ctx, 'turnEnd', null)
    expect(axe(s)).toBe(3)
    // a roll equal to the Control (1) does nothing; so does a roll below a higher Control
    const e = base()
    useOnce(ctxFor(e, [1]), 'fight', 'A', DRONE, { target: BRUTE })
    expect(axe(e)).toBe(3)
    const boss = base()
    centreRow(boss, BOSS, 6, -2)
    centreRow(boss, BRUTE, 0, 8)
    centreRow(boss, SEEKERS, 6, -4.8)
    expect(enemiesInCombat(boss, SEEKERS)).toEqual([BOSS])
    useOnce(ctxFor(boss, [2]), 'fight', 'A', DRONE, { target: BOSS }) // Control 2: needs 3+
    expect(weaponService.effectiveWeapon(boss, boss.units[BOSS].models[0], 'fx.w.boss-blade').A).toBe(8)
    const boss3 = base()
    centreRow(boss3, BOSS, 6, -2)
    centreRow(boss3, BRUTE, 0, 8)
    centreRow(boss3, SEEKERS, 6, -4.8)
    useOnce(ctxFor(boss3, [3]), 'fight', 'A', DRONE, { target: BOSS })
    expect(weaponService.effectiveWeapon(boss3, boss3.units[BOSS].models[0], 'fx.w.boss-blade').A).toBe(7)
    // Companion weapons are reduced too (an enemy ability); ranged weapons are not; the floor is 1
    const comp = base((b) => {
      b.weapons['fx.w.brute-axe'].abilities = [{ ability: 'COMPANION' }]
      b.weapons['fx.w.guard-spear'].A = 1
    })
    expect(axe(comp)).toBe(3)
    useOnce(ctxFor(comp, [5]), 'fight', 'A', DRONE, { target: BRUTE })
    expect(axe(comp)).toBe(2)
    effectService.grant(ctxFor(comp), BRUTE, { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: -5 }, affectsCompanion: true }, { sourceAbilityId: 'test', sourceUnitId: SEEKERS, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    expect(axe(comp)).toBe(1)
  })
})

describe('SYL-WEAP weapons', () => {
  it('SYL-WEAP-1 Spiterider Lance deals 2 damage per unsaved attack on the turn the Lancers charged, 1 otherwise', () => {
    const run = (charged: boolean): number => {
      const s = game()
      centreRow(s, LANCERS, 0, -2)
      centreRow(s, BRUTE, 0, 0.3)
      s.units[LANCERS].turn.chargedThisTurn = charged
      const before = wounds(s, BRUTE)
      attack(s, 'melee', [6, 6, 6, 6, 6, 6, 1, 1, 1], LANCERS, W('spiterider-lance'), BRUTE, 3)
      return before - wounds(s, BRUTE)
    }
    expect(run(false)).toBe(3)
    expect(run(true)).toBe(6)
    expect(weaponService.effectiveWeapon(game(), game().units[LANCERS].models[0], W('spiterider-lance')).abilities).toEqual([{ ability: 'CHARGE_DAMAGE', value: 1 }])
  })

  it('SYL-WEAP-2 Seeker\'s Sickle unmodified 6 to hit deals 1 mortal damage and skips wound and save', () => {
    const s = game()
    centreRow(s, SEEKERS, 0, -2)
    centreRow(s, BRUTE, 0, 0.3)
    const before = wounds(s, BRUTE)
    const r = attack(s, 'melee', [6, 1, 2], SEEKERS, W('seekers-sickle'), BRUTE, 3)
    expect(before - wounds(s, BRUTE)).toBe(1)
    expect(r.rng.remaining).toEqual([]) // no wound or save dice were rolled
  })

  it('SYL-WEAP-3 Dragonspite\'s Mandibles (Companion) ignore friendly weapon-characteristic modifiers and friendly roll bonuses', () => {
    const s = game()
    const lance = (): number => Number(weaponService.effectiveWeapon(s, s.units[LANCERS].models[0], W('spiterider-lance')).A)
    const mand = (): number => Number(weaponService.effectiveWeapon(s, s.units[LANCERS].models[0], W('dragonspite-mandibles')).A)
    expect(lance()).toBe(3)
    expect(mand()).toBe(3)
    effectService.grant(ctxFor(s), LANCERS, { modifyStat: { stat: 'A', value: 1 } }, { sourceAbilityId: 'test', sourceUnitId: LANCERS, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    expect(lance()).toBe(4)
    expect(mand()).toBe(3)
    // Head of the Hunt and Song of the Hunt are friendly bonuses too: the Mandibles' 4+ to hit is not helped by Tuneful
    const t = game()
    centreRow(t, LANCERS, -4, -2)
    centreRow(t, BRUTE, 0, 2)
    withChords(t, BRUTE, 2)
    t.units[BRUTE].location = 'board'
    const b0 = wounds(t, BRUTE)
    const r = attack(t, 'melee', [3, 3, 3], LANCERS, W('dragonspite-mandibles'), BRUTE, 3)
    expect(wounds(t, BRUTE)).toBe(b0)
    expect(r.rng.remaining).toEqual([])
    // the Lance (3+) with the same dice is helped by the +1 (a 2 hits)
    const b1 = wounds(t, BRUTE)
    attack(t, 'melee', [2, 2, 2, 6, 6, 6, 1, 1, 1], LANCERS, W('spiterider-lance'), BRUTE, 3)
    expect(b1 - wounds(t, BRUTE)).toBe(3)
  })

  it('SYL-WEAP-4 Gossamid Bow may shoot while the unit is in combat (Shoot in Combat)', () => {
    const s = game()
    s.phase = 'shooting'
    s.activePlayer = 'A'
    centreRow(s, ARCHERS, 0, -2)
    centreRow(s, BRUTE, 0, 0.8)
    expect(enemiesInCombat(s, ARCHERS)).toEqual([BRUTE])
    const entries = buildShootingWeaponEntries(ctxFor(s), ARCHERS).filter((e) => e.weaponId === W('gossamid-bow'))
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.some((e) => e.legalTargets.includes(BRUTE))).toBe(true)
    // the other units' melee weapons are not ranged
    expect(s.weapons[W('gossamid-bow')].abilities.some((a) => a.ability === 'SHOOT_IN_COMBAT')).toBe(true)
  })
})

describe('Sylvaneth AI hints', () => {
  it('SYL-AI hints: the timing and target hooks pass on a pointless use and favour the right unit', () => {
    const s = game({ enh: BOLD, reg: LEAVES })
    // nothing damaged, nobody in combat, no quarry
    expect(sylvanethAbilityTiming(s, 'A', 'sylvanethLifebringers', null)).toBe(-3)
    expect(sylvanethAbilityTiming(s, 'A', 'sylvanethLeavesOnTheWind', null)).toBe(-3)
    expect(sylvanethAbilityTiming(s, 'A', 'sylvanethHeartwoodHorn', ARCH)).toBe(-3)
    expect(sylvanethAbilityTiming(s, 'A', 'sylvanethBoldSpirit', ARCH)).toBe(-3)
    expect(sylvanethAbilityTiming(s, 'A', 'sylvanethZephyrspites', ARCHERS)).toBeNull()
    // damage makes Lifebringers worth using
    s.models[s.units[SEEKERS].models[0]].woundsRemaining = 2
    expect(sylvanethAbilityTiming(s, 'A', 'sylvanethLifebringers', null)).toBe(0)
    // a quarry with friends near it: the Horn is worth it, unless every chord is already earned
    centreRow(s, ARCH, 0, -4)
    centreRow(s, LANCERS, 3, -3)
    put(s, BRUTE, 0, 1)
    setQuarry(s, 'A', BRUTE)
    expect(sylvanethAbilityTiming(s, 'A', 'sylvanethHeartwoodHorn', ARCH)).toBe(0)
    withChords(s, BRUTE, 3)
    s.units[BRUTE].location = 'board'
    expect(sylvanethAbilityTiming(s, 'A', 'sylvanethHeartwoodHorn', ARCH)).toBe(-3)
    // Bold Spirit: two friendly units fighting beside the general
    const b = game({ enh: BOLD })
    centreRow(b, ARCH, 0, -2)
    centreRow(b, LANCERS, 3, -2)
    centreRow(b, BRUTE, 1, 0.6)
    expect(sylvanethAbilityTiming(b, 'A', 'sylvanethBoldSpirit', ARCH)).toBe(0)
    // Leaves on the Wind: a unit that would lose the fight, at the end of our own turn
    const l = game({ reg: LEAVES })
    l.activePlayer = 'A'
    centreRow(l, ARCHERS, 0, -2)
    centreRow(l, BRUTE, 0, 0.6)
    for (const id of l.units[ARCHERS].models.slice(1)) delete l.models[id]
    l.units[ARCHERS].models = l.units[ARCHERS].models.slice(0, 1)
    l.models[l.units[ARCHERS].models[0]].woundsRemaining = 1
    expect(sylvanethAbilityTiming(l, 'A', 'sylvanethLeavesOnTheWind', null)).toBe(1)
    l.activePlayer = 'B'
    expect(sylvanethAbilityTiming(l, 'A', 'sylvanethLeavesOnTheWind', null)).toBe(-3)
    // targets: Target of Vengeance prefers the unit the army can kill soonest; Spiterider Charge the quarry
    const t = game()
    centreRow(t, LANCERS, 0, -2)
    centreRow(t, BRUTE, 0, 0.3)
    put(t, HAWK, 8, 3)
    const hawk = sylvanethTargetBonus(t, 'A', 'sylvanethTargetOfVengeance', HAWK) as number
    const boss = sylvanethTargetBonus(t, 'A', 'sylvanethTargetOfVengeance', BOSS) as number
    expect(typeof hawk).toBe('number')
    expect(hawk).toBeGreaterThan(boss)
    setQuarry(t, 'A', BRUTE)
    expect(sylvanethTargetBonus(t, 'A', 'sylvanethSpiteriderCharge', BRUTE) as number).toBeGreaterThan(sylvanethTargetBonus(t, 'A', 'sylvanethSpiteriderCharge', BOSS) as number)
    expect(sylvanethTargetBonus(t, 'A', 'unknownCode', BRUTE)).toBeNull()
  })
})
