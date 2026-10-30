// Fyreslayers (Saga Axeband) code hooks and data: docs/spec/factions/fyreslayers.md, test ids FYR-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/fyreslayers files on top of the AoS fixture bundle
// (player A = Saga Axeband, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, unitModels,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService, feelNoPainFor } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { weaponService } from '../../src/engine/weapons'
import { returnableModels } from '../../src/engine/factions/aos-common'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/fyreslayers/abilities.json'
import enhancementsJson from '../../src/data/factions/fyreslayers/enhancements.json'
import weaponsJson from '../../src/data/factions/fyreslayers/weapons.json'
import factionJson from '../../src/data/factions/fyreslayers/faction.json'
import patrolJson from '../../src/data/factions/fyreslayers/patrols/saga-axeband.json'
import battlesmithJson from '../../src/data/factions/fyreslayers/datasheets/battlesmith.json'
import hearthguardJson from '../../src/data/factions/fyreslayers/datasheets/hearthguard-berzerkers.json'
import vulkiteJson from '../../src/data/factions/fyreslayers/datasheets/vulkite-berzerkers.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [battlesmithJson, hearthguardJson, vulkiteJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.fyreslayers = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const STUBBORN = 'fyreslayers.enh.too-stubborn-to-die'
const HORN = 'fyreslayers.enh.horn-of-grimnir'
const SPIRIT = 'fyreslayers.enh.spirit-of-grimnir'
const PRESENCE = 'fyreslayers.enh.powerful-presence'
const MAGMIC = 'fyreslayers.ability.magmic-tunnels'
const AXES = 'fyreslayers.ability.fyresteel-throwing-axes'
const AWAKEN = 'fyreslayers.ability.awaken-the-runes'
const PLANT = 'fyreslayers.ability.plant-the-icon'

const SMITH = 'A:battlesmith'
const HEARTH = 'A:hearthguard'
const V1 = 'A:vulkite-a'
const V2 = 'A:vulkite-b'
const V3 = 'A:vulkite-c'
const V4 = 'A:vulkite-d'

const HANDAXES = 'fyreslayers.weapon.fyresteel-handaxes'
const POLEAXE = 'fyreslayers.weapon.flamestrike-poleaxe'
const BATTLEAXE = 'fyreslayers.weapon.ancestral-battle-axe'

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
      A: makeAosPlayer('A', { faction: 'fyreslayers', patrolId: 'fyreslayers.army.saga-axeband', enhancementId: opts.enh ?? STUBBORN, regimentAbilityId: opts.reg ?? MAGMIC }),
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
const eventLogs = new WeakMap<EngineContext, GameEvent[]>()
const ctxFor = (s: GameState, dice: number[], services: Partial<typeof DEFAULT_MODULES.services> = {}): EngineContext => {
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, { ...DEFAULT_MODULES, services: { ...DEFAULT_MODULES.services, ...services } })
  rngs.set(ctx, rng)
  eventLogs.set(ctx, events)
  return ctx
}
const leftOver = (ctx: EngineContext): number[] => rngs.get(ctx)?.remaining ?? []

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
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string; redeploy?: (ids: string[]) => string } = {}) {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    if (ids[0]?.startsWith('at:')) return opts.redeploy ? opts.redeploy(ids) : ids[0]
    return opts.mode ?? ids[0]
  })
}

// Awaken the Runes at the start of A's turn with the given rune and activation dice
function awaken(s: GameState, rune: string, dice: number[]): EngineContext {
  const ctx = ctxFor(s, dice)
  useOnce(ctx, 'startOfTurn', 'A', AWAKEN, { mode: rune })
  return ctx
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const weapon = (s: GameState, unitId: UnitId, weaponId: string) => weaponService.effectiveWeapon(s, s.units[unitId].models[0], weaponId)
const stat = (s: GameState, unitId: UnitId, name: 'M' | 'OC'): number =>
  hookService.statFor(s, { unitId, modelId: s.units[unitId].models[0], weapon: null, stat: name }, s.datasheets[s.units[unitId].datasheetId].stats[name])

// ---------- a melee attack with scripted dice ----------
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const tgt = (s: GameState, modelId: string, targetUnitId: string, attacks: number | null): DeclaredTarget =>
  ({ modelId, weaponId: s.models[modelId].weapons[0], targetUnitId, profileGroup: null, attacks })

function melee(s: GameState, dice: number[], attackerUnitId: string, targetUnitId: string, attacks: number | null) {
  s.phase = 'fight'
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  attackService.begin(ctx, { kind: 'melee', attackerUnitId, overwatch: false, targets: [tgt(s, s.units[attackerUnitId].models[0], targetUnitId, attacks)] })
  expect(attackService.advance(ctx)).toBe('done')
  return { events, rng, ctx }
}

// the enemy Brute swings at one of our models: returns the single save roll it provoked
function bruteSave(s: GameState, targetUnitId: string, die = 4) {
  place(s, 'B:brute', -4, 0.5)
  place(s, targetUnitId, -4, -1.5)
  const { events } = melee(s, [4, 3, die, 1, 1], 'B:brute', targetUnitId, 1) // hit, wound, save, then two ward dice if it fails
  const roll = of(events, 'SaveRolled')[0]
  expect(roll).toBeDefined()
  return roll
}

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('FYR-REG every code in the Fyreslayers data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('FYR-ARMY-1 the Saga Axeband builds: a Battlesmith general, 1 Hearthguard, 4 Vulkite units, 26 models, stats as printed', () => {
    const s = game()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(6)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(26)
    expect(s.players.A.warlordUnitId).toBe(SMITH)
    expect(mine.filter((u) => u.datasheetId === 'fyreslayers.unit.vulkite-berzerkers')).toHaveLength(4)
    expect(mine.filter((u) => u.datasheetId === 'fyreslayers.unit.hearthguard-berzerkers')).toHaveLength(1)
    const st = (id: string) => s.datasheets[id].stats
    expect(st('fyreslayers.unit.battlesmith')).toMatchObject({ M: 4, W: 5, Sv: 5, OC: 5, ward: 6 })
    expect(st('fyreslayers.unit.hearthguard-berzerkers')).toMatchObject({ M: 4, W: 2, Sv: 6, OC: 1, ward: 6 })
    expect(st('fyreslayers.unit.vulkite-berzerkers')).toMatchObject({ M: 4, W: 2, Sv: 6, OC: 1, ward: 6 })
    const w = (id: string) => s.weapons[id]
    expect([w(BATTLEAXE).A, w(BATTLEAXE).skill, w(BATTLEAXE).wound, w(BATTLEAXE).rend, w(BATTLEAXE).D]).toEqual([5, 3, 3, 1, 2])
    expect([w(POLEAXE).A, w(POLEAXE).skill, w(POLEAXE).wound, w(POLEAXE).rend, w(POLEAXE).D]).toEqual([2, 3, 3, 1, 2])
    expect([w(HANDAXES).A, w(HANDAXES).skill, w(HANDAXES).wound, w(HANDAXES).rend, w(HANDAXES).D]).toEqual([2, 4, 3, 1, 1])
    // 32 mm round bases
    for (const m of mine.flatMap((u) => unitModels(s, u.id))) expect(m.base.radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(Object.values(s.weapons).filter((x) => x.id.startsWith('fyreslayers.')).every((x) => x.kind === 'melee')).toBe(true)
  })

  it('FYR-ARMY-2 no unit has Reinforcements, so Call for Reinforcements is never offered', () => {
    const s = game()
    for (const u of Object.values(s.units).filter((u) => u.player === 'A')) expect(s.datasheets[u.datasheetId].keywords).not.toContain('REINFORCEMENTS')
    // even with a destroyed unit nothing is replaceable and the ability stays out of every movement-phase offer
    s.units[V4].location = 'destroyed'
    s.phase = 'movement'
    expect(replaceableUnits(s, 'A')).toEqual([])
    expect(offered(s, 'A', 'movement')).not.toContain('spearhead.ability.call-for-reinforcements')
    expect(offered(s, 'A', 'movement').filter((id) => id.toLowerCase().includes('reinforcement'))).toEqual([])
  })
})

describe('FYR-BT Awaken the Runes', () => {
  it('FYR-BT-1 is offered at the start of your turn, once per battle round, and only on your turn', () => {
    const s = game()
    expect(offered(s, 'A', 'startOfTurn')).toContain(AWAKEN)
    expect(offered(s, 'B', 'startOfTurn')).not.toContain(AWAKEN)
    awaken(s, 'fury', [3])
    expect(offered(s, 'A', 'startOfTurn')).not.toContain(AWAKEN)
    s.round = 2
    expect(offered(s, 'A', 'startOfTurn')).toContain(AWAKEN)
    // not offered on the opponent's turn
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'startOfTurn')).not.toContain(AWAKEN)
  })

  it('FYR-BT-2 a rune already activated this battle is not offered again; after all four the trait is spent', () => {
    const s = game()
    const modes: string[][] = []
    for (const [round, rune] of [[1, 'fury'], [2, 'searing-heat']] as const) {
      s.round = round
      const ctx = ctxFor(s, [2])
      const r = useOnce(ctx, 'startOfTurn', 'A', AWAKEN, { mode: rune })
      modes.push(r.options.find((o) => o.includes('fury') || o.includes('relentless-zeal')) ?? [])
    }
    expect(modes[0].sort()).toEqual(['fiery-determination', 'fury', 'relentless-zeal', 'searing-heat'])
    expect(modes[1].sort()).toEqual(['fiery-determination', 'relentless-zeal', 'searing-heat'])
    for (const [round, rune] of [[3, 'fiery-determination'], [4, 'relentless-zeal']] as const) {
      s.round = round
      useOnce(ctxFor(s, [2]), 'startOfTurn', 'A', AWAKEN, { mode: rune })
    }
    s.round = 5
    expect(offered(s, 'A', 'startOfTurn')).not.toContain(AWAKEN)
  })

  it('FYR-BT-3 an activation roll of 1-5 applies the standard effect only; a 6 adds the enhanced one', () => {
    const base = weapon(game(), V1, HANDAXES).A as number
    for (const roll of [1, 3, 5]) {
      const s = game()
      awaken(s, 'fury', [roll])
      expect(weapon(s, V1, HANDAXES).A, `roll ${roll}`).toBe(base)
    }
    const s = game()
    awaken(s, 'fury', [6])
    expect(weapon(s, V1, HANDAXES).A).toBe(base + 1)
    // every friendly unit gets it, the enemy does not
    expect(weapon(s, HEARTH, POLEAXE).A).toBe((s.weapons[POLEAXE].A as number) + 1)
    expect(weapon(s, SMITH, BATTLEAXE).A).toBe((s.weapons[BATTLEAXE].A as number) + 1)
    expect(weaponService.effectiveWeapon(s, s.units['B:brute'].models[0], 'fx.w.brute-axe').A).toBe(3)
  })

  it('FYR-BT-4 rune effects last through the opponent\'s turn and expire at the start of your next turn', () => {
    const s = game()
    const ctx = awaken(s, 'searing-heat', [2])
    const rend = () => weapon(s, V1, HANDAXES).rend
    expect(rend()).toBe(2)
    effectService.expire(ctx, 'turnEnd', null)
    effectService.expire(ctx, 'phaseEnd', null)
    effectService.expire(ctx, 'nextOwnTurn', 'B') // the opponent's turn starts
    expect(rend()).toBe(2)
    effectService.expire(ctx, 'nextOwnTurn', 'A') // my next turn starts
    expect(rend()).toBe(1)
  })
})

describe('FYR-RUNE the four ur-gold runes', () => {
  it('FYR-RUNE-1 Rune of Fury: +1 to melee hit rolls (capped at +1 total); enhanced +1 melee Attacks', () => {
    const s = game()
    awaken(s, 'fury', [4])
    expect(weapon(s, V1, HANDAXES).A).toBe(s.weapons[HANDAXES].A) // standard only: no extra Attacks
    // Vulkite hit on 4+: a 3 now hits, a 2 does not
    place(s, V1, -4, -1.5)
    place(s, 'B:brute', -4, 0.5)
    const { events } = melee(s, [3, 2, 1, 1], 'A:vulkite-a', 'B:brute', 2)
    expect(of(events, 'HitRolled').map((e) => [e.die, e.final, e.hit])).toEqual([[3, 4, true], [2, 3, false]])
    // a second +1 from elsewhere does not stack past +1
    const ctx = ctxFor(s, [])
    effectService.grant(ctx, V1, { modifyRoll: { roll: 'hit', value: 1 } }, { sourceAbilityId: 'test', sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    const capped = melee(s, [3, 2, 1, 1], 'A:vulkite-a', 'B:brute', 2)
    expect(of(capped.events, 'HitRolled').map((e) => [e.die, e.final, e.hit])).toEqual([[3, 4, true], [2, 3, false]])
    // a 6 enhances: +1 Attacks on melee weapons only
    const t = game()
    awaken(t, 'fury', [6])
    expect(weapon(t, V1, HANDAXES).A).toBe((t.weapons[HANDAXES].A as number) + 1)
  })

  it('FYR-RUNE-2 Rune of Searing Heat: +1 melee Rend; enhanced +1 melee Damage', () => {
    const s = game()
    awaken(s, 'searing-heat', [5])
    expect(weapon(s, V1, HANDAXES).rend).toBe(2)
    expect(weapon(s, HEARTH, POLEAXE).rend).toBe(2)
    expect(weapon(s, V1, HANDAXES).D).toBe(s.weapons[HANDAXES].D)
    const t = game()
    awaken(t, 'searing-heat', [6])
    expect(weapon(t, V1, HANDAXES).rend).toBe(2)
    expect(weapon(t, V1, HANDAXES).D).toBe(2)
    expect(weapon(t, SMITH, BATTLEAXE).D).toBe(3)
    // and the enemy keeps its own numbers
    expect(weaponService.effectiveWeapon(t, t.units['B:brute'].models[0], 'fx.w.brute-axe').rend).toBe(1)
  })

  it('FYR-RUNE-3 Rune of Fiery Determination: Ward (5+) replaces Ward (6+); enhanced +1 to saves (capped)', () => {
    const s = game()
    const before = feelNoPainFor(ctxFor(s, []), s.units[V1].models[0], {} as never)
    expect(before?.threshold).toBe(6)
    awaken(s, 'fiery-determination', [4])
    expect(feelNoPainFor(ctxFor(s, []), s.units[V1].models[0], {} as never)?.threshold).toBe(5)
    expect(feelNoPainFor(ctxFor(s, []), s.units[SMITH].models[0], {} as never)?.threshold).toBe(5)
    expect(feelNoPainFor(ctxFor(s, []), s.units['B:brute'].models[0], {} as never)).toBeNull()
    const standard = bruteSave(s, V1)
    // enhanced: +1 on top
    const t = game()
    awaken(t, 'fiery-determination', [6])
    const enhanced = bruteSave(t, V1)
    expect(enhanced.final - standard.final).toBe(1)
    // another +1 save source (Icon of Grimnir: the Battlesmith is within 12") does not stack past +1
    place(t, SMITH, -4, -4.5)
    place(t, V1, -4, -1.5)
    const withIcon = bruteSave(t, V1)
    expect(withIcon.final).toBe(enhanced.final)
  })

  it('FYR-RUNE-4 Rune of Relentless Zeal: +2" Move; enhanced +2 to charge rolls', () => {
    const chargeBonus = (s: GameState): number => {
      const ctx = ctxFor(s, [3, 4])
      const roll = ctx.roll({ purpose: 'charge', player: 'A', count: 2, mode: 'sum', unitId: V1 })
      return hookService.collect(ctx, 'onChargeRoll', { chargingUnitId: V1, targetUnitIds: ['B:brute'], roll: { purpose: 'charge', roll, dieIndex: 0, unmodified: 7, rerolled: false } })
        .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
    }
    const s = game()
    expect(stat(s, V1, 'M')).toBe(4)
    awaken(s, 'relentless-zeal', [2])
    expect(stat(s, V1, 'M')).toBe(6)
    expect(stat(s, SMITH, 'M')).toBe(6)
    expect(stat(s, 'B:brute' as UnitId, 'M')).toBe(4)
    expect(chargeBonus(s)).toBe(0)
    const t = game()
    awaken(t, 'relentless-zeal', [6])
    expect(stat(t, V1, 'M')).toBe(6)
    expect(chargeBonus(t)).toBe(2)
  })
})

describe('FYR-RA regiment abilities', () => {
  // two enemy-free corners for the tunnels, the rest as in game()
  it('FYR-RA-1 Magmic Tunnels: start of round 1, once per battle, up to 2 units set up again more than 6" from every enemy', () => {
    const s = game({ reg: MAGMIC })
    place(s, V1, -12, -3)
    place(s, V2, 6, -3)
    expect(offered(s, 'A', 'startOfRound')).toContain(MAGMIC)
    const before = [V1, V2].map((id) => unitModels(s, id).map((m) => ({ ...m.pos })))
    const ctx = ctxFor(s, [])
    const r = useOnce(ctx, 'startOfRound', 'A', MAGMIC, { target: V1, mode: V2 })
    // target, second unit, then one set-up spot per unit
    expect(r.topics.filter((t) => t === 'abilityTarget')).toHaveLength(1)
    expect(r.topics.filter((t) => t === 'abilityMode')).toHaveLength(3)
    const enemies = Object.values(s.models).filter((m) => s.units[m.unitId].player === 'B' && s.units[m.unitId].location === 'board')
    for (const [i, id] of [V1, V2].entries()) {
      expect(unitModels(s, id).map((m) => m.pos), id).not.toEqual(before[i])
      for (const m of unitModels(s, id)) for (const e of enemies) expect(horizontalGap(m, e), id).toBeGreaterThan(6)
    }
    // a third unit stays where it was
    expect(unitModels(s, V3)[0].pos.z).toBeLessThan(-8)
    // once per battle: spent
    expect(offered(s, 'A', 'startOfRound')).not.toContain(MAGMIC)
    s.round = 2
    expect(offered(s, 'A', 'startOfRound')).not.toContain(MAGMIC)
  })

  it('FYR-RA-1 is only for the first battle round and may take just one unit', () => {
    const s = game({ reg: MAGMIC })
    s.round = 2
    expect(offered(s, 'A', 'startOfRound')).not.toContain(MAGMIC)
    s.round = 1
    const moved = unitModels(s, V4).map((m) => ({ ...m.pos }))
    const r = useOnce(ctxFor(s, []), 'startOfRound', 'A', MAGMIC, { target: V1, mode: 'none' })
    expect(r.topics.filter((t) => t === 'abilityMode')).toHaveLength(2) // the second-unit pick and one set-up spot
    expect(unitModels(s, V4).map((m) => m.pos)).toEqual(moved)
  })

  // one Vulkite unit that can throw at the Hawk, everyone else far from the enemy
  function axeGame(patch?: (b: DataBundle) => void) {
    const s = game({ reg: AXES, patch })
    s.phase = 'shooting'
    place(s, 'B:hawk', -10, 7)
    place(s, V1, -10, 0.5) // 6.5" short of the Hawk's edge
    return s
  }

  it('FYR-RA-2 only units that are not in combat and see an enemy within 10" may throw', () => {
    const s = axeGame()
    expect(offered(s, 'A', 'shooting')).toContain(AXES)
    // out of range: the Hawk moves away
    const far = axeGame()
    place(far, 'B:hawk', -10, 10.8)
    place(far, V1, -10, -4)
    expect(offered(far, 'A', 'shooting')).not.toContain(AXES)
    // in combat: the Vulkites are within 3" of the Hawk, so nobody may throw
    const fight = axeGame()
    place(fight, V1, -10, 5)
    expect(offered(fight, 'A', 'shooting')).not.toContain(AXES)
    // not visible: a tall wall sits between thrower and Hawk
    const wall = axeGame()
    const rect = (x0: number, z0: number, x1: number, z1: number) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
    wall.board = {
      ...wall.board,
      pieces: { w: { id: 'w', kind: 'ruin', pos: { x: 0, z: 3.5 }, rot: 0, footprint: rect(-16, 3.4, 4, 3.6), height: 6, traits: ['unstable'], walls: [{ a: { x: -16, z: 3.5 }, b: { x: 4, z: 3.5 }, height: 6 }], floors: [] } },
    }
    expect(offered(wall, 'A', 'shooting')).not.toContain(AXES)
    // not the other regiment ability
    expect(offered(axeGame(), 'B', 'shooting')).not.toContain(AXES)
    expect(offered(game({ reg: MAGMIC }), 'A', 'shooting')).not.toContain(AXES)
  })

  it('FYR-RA-3 each thrower rolls a dice: 4+ inflicts D3 mortal damage, a miss does nothing, and the target\'s ward still rolls', () => {
    const calls: { target: string; count: number }[] = []
    const spy = { ...attackService, queueMortalWounds: (_c: EngineContext, target: string, count: number) => { calls.push({ target, count }) } }
    const t = axeGame()
    useOnce(ctxFor(t, [4, 5], { attack: spy }), 'shooting', 'A', AXES)
    expect(calls).toEqual([{ target: 'B:hawk', count: 3 }])
    calls.length = 0
    useOnce(ctxFor(axeGame(), [3], { attack: spy }), 'shooting', 'A', AXES) // a 3 misses: no D3 die is rolled
    expect(calls).toEqual([])
    // a real resolution: Hawk with Ward (5+); 3 mortal damage, ward dice [5, 1, 1] save one
    const w = axeGame((b) => { b.datasheets['fx.hawk'].stats.ward = 5 })
    const real = ctxFor(w, [4, 6, 5, 1, 1])
    useOnce(real, 'shooting', 'A', AXES)
    expect(w.units['B:hawk'].models.map((id) => w.models[id].woundsRemaining)).toEqual([4 - 2])
  })

  it('FYR-RA-3 one use covers every eligible unit, each throwing at the enemy with the fewest wounds left', () => {
    const s = axeGame()
    place(s, V2, -4, 0.5)
    place(s, 'B:guard', -4, 7)
    const calls: { target: string; count: number }[] = []
    const spy = { ...attackService, queueMortalWounds: (_c: EngineContext, target: string, count: number) => { calls.push({ target, count }) } }
    // V1 sees only the Hawk; V2 sees the Guard (10 wounds left) and the Hawk (4): both pick the Hawk. Dice: V1 4 then D3 face 2 (1),
    // V2 6 then D3 face 6 (3)
    useOnce(ctxFor(s, [4, 2, 6, 6], { attack: spy }), 'shooting', 'A', AXES)
    expect(calls.map((c) => c.target)).toEqual(['B:hawk', 'B:hawk'])
    expect(calls.map((c) => c.count)).toEqual([1, 3])
  })

  it('FYR-RA-4 Throwing Axes is once per turn for the whole army', () => {
    const s = axeGame()
    place(s, V2, -4, 0.5)
    place(s, 'B:guard', -4, 7)
    const r = useOnce(ctxFor(s, [1, 1]), 'shooting', 'A', AXES)
    expect(r.topics.filter((t) => t === 'abilityUse').length).toBeGreaterThanOrEqual(1)
    expect(offered(s, 'A', 'shooting')).not.toContain(AXES)
    s.round = 2
    expect(offered(s, 'A', 'shooting')).toContain(AXES)
  })
})

describe('FYR-ENH enhancements', () => {
  const hurt = (s: GameState, unitId: UnitId, points: number): void => {
    const m = s.models[s.units[unitId].models[0]]
    m.woundsRemaining -= points
  }

  it('FYR-ENH-1 Too Stubborn to Die heals D3 at the start of every turn, yours and the opponent\'s, while the general is hurt', () => {
    const s = game({ enh: STUBBORN })
    expect(offered(s, 'A', 'startOfTurn')).not.toContain('fyreslayers.ability.too-stubborn-to-die') // unhurt
    hurt(s, SMITH, 4)
    const wounds = () => s.models[s.units[SMITH].models[0]].woundsRemaining
    expect(wounds()).toBe(1)
    useOnce(ctxFor(s, [4]), 'startOfTurn', 'A', 'fyreslayers.ability.too-stubborn-to-die') // D3 face 4 -> 2
    expect(wounds()).toBe(3)
    // the opponent's turn: the same player can use it again, there is no use limit
    s.activePlayer = 'B'
    s.round = 1
    for (const u of Object.values(s.units)) u.turn.abilitiesUsedThisPhase = [] // a new turn resets the per-turn bookkeeping
    s.phaseState.marks = []
    expect(offered(s, 'A', 'startOfTurn')).toContain('fyreslayers.ability.too-stubborn-to-die')
    useOnce(ctxFor(s, [6]), 'startOfTurn', 'A', 'fyreslayers.ability.too-stubborn-to-die') // 3
    expect(wounds()).toBe(5) // never past full Health
    s.activePlayer = 'A'
    s.round = 2
    expect(offered(s, 'A', 'startOfTurn')).not.toContain('fyreslayers.ability.too-stubborn-to-die')
    // only the general: other units cannot use it, and the other enhancements do not carry it
    expect(offered(game({ enh: HORN }), 'A', 'startOfTurn')).not.toContain('fyreslayers.ability.too-stubborn-to-die')
  })

  it('FYR-ENH-2 Horn of Grimnir is blocked while the general is in combat; each unit with slain models returns 1 model on 3+', () => {
    const horn = 'fyreslayers.ability.horn-of-grimnir'
    const s = game({ enh: HORN })
    // nothing to return yet
    expect(offered(s, 'A', 'hero')).not.toContain(horn)
    // V1 lost 2 models, V2 lost 1, V3 lost 1
    for (const [id, n] of [[V1, 2], [V2, 1], [V3, 1]] as const) {
      const unit = s.units[id]
      for (let i = 0; i < n; i++) {
        const mid = unit.models.pop() as string
        unit.destroyedModels.push(structuredClone(s.models[mid]))
        delete s.models[mid]
      }
    }
    place(s, V1, -4, -3)
    place(s, V2, 4, -3)
    place(s, V3, 4, -6)
    expect(returnableModels(s, V1)).toBe(2)
    expect(offered(s, 'A', 'hero')).toContain(horn)
    // combat blocks it: an enemy within 3" of the general
    const blocked = structuredClone(s)
    place(blocked, SMITH, -8, -1)
    place(blocked, 'B:brute', -8, 1.5)
    expect(offered(blocked, 'A', 'hero')).not.toContain(horn)
    // dice per damaged unit in unit id order: V1 5 (returns), V2 2 (fails), V3 3 (returns)
    place(s, SMITH, -8, -1)
    useOnce(ctxFor(s, [5, 2, 3]), 'hero', 'A', horn)
    expect(s.units[V1].models).toHaveLength(4)
    expect(s.units[V2].models).toHaveLength(4)
    expect(s.units[V3].models).toHaveLength(5)
    expect(returnableModels(s, V2)).toBe(1)
  })

  it('FYR-ENH-3 Spirit of Grimnir re-rolls a non-6 activation roll, and only that', () => {
    const base = weapon(game(), V1, HANDAXES).A as number
    // without it a 2 is final
    const plain = game({ enh: STUBBORN })
    awaken(plain, 'fury', [2])
    expect(weapon(plain, V1, HANDAXES).A).toBe(base)
    // with it the 2 is re-rolled into a 6
    const spirit = game({ enh: SPIRIT })
    const ctx = ctxFor(spirit, [2, 6])
    useOnce(ctx, 'startOfTurn', 'A', AWAKEN, { mode: 'fury' })
    expect(weapon(spirit, V1, HANDAXES).A).toBe(base + 1)
    expect(leftOver(ctx)).toEqual([])
    // a 6 is kept: the second die is never rolled
    const six = game({ enh: SPIRIT })
    const sixCtx = ctxFor(six, [6, 1])
    useOnce(sixCtx, 'startOfTurn', 'A', AWAKEN, { mode: 'fury' })
    expect(weapon(six, V1, HANDAXES).A).toBe(base + 1)
    expect(leftOver(sixCtx)).toEqual([1])
    // the re-roll is final even when it is worse
    const worse = game({ enh: SPIRIT })
    awaken(worse, 'fury', [3, 1])
    expect(weapon(worse, V1, HANDAXES).A).toBe(base)
  })

  it('FYR-ENH-4 Powerful Presence adds 3 to the general\'s Control (5 to 8) and nobody else\'s', () => {
    const s = game({ enh: PRESENCE })
    expect(stat(s, SMITH, 'OC')).toBe(8)
    expect(stat(s, V1, 'OC')).toBe(1)
    expect(stat(s, HEARTH, 'OC')).toBe(1)
    expect(stat(game({ enh: STUBBORN }), SMITH, 'OC')).toBe(5)
  })
})

describe('FYR-AB unit abilities', () => {
  it('FYR-AB-1 Icon of Grimnir: +1 save only for units wholly within 12" (partly within gets nothing); includes the Battlesmith', () => {
    const s = game()
    const ctx = ctxFor(s, [1, 1, 1, 1, 1, 1, 1, 1])
    const saveMod = (unitId: UnitId): number => {
      const roll = ctx.roll({ purpose: 'save', player: 'A', unitId })
      return hookService.collect(ctx, 'onSaveRoll', {
        attack: { kind: 'melee', overwatch: false, attackerUnitId: 'B:brute', attackerModelId: s.units['B:brute'].models[0], weapon: s.weapons['fx.w.brute-axe'], targetUnitId: unitId, targetModelId: s.units[unitId].models[0], range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true },
        roll: { purpose: 'save', roll, dieIndex: 0, unmodified: 4, rerolled: false },
      }).reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
    }
    place(s, SMITH, -4, -9)
    place(s, V1, -8, -6) // every model well inside 12"
    expect(saveMod(V1)).toBe(1)
    expect(saveMod(SMITH)).toBe(1) // the holder counts itself
    // partly within: the last model sits beyond 12" although the others are close
    s.models[s.units[V1].models[4]].pos = { x: -4, y: 0, z: -9 + 12.5 }
    expect(saveMod(V1)).toBe(0)
    // a unit nowhere near gets nothing, and neither does the enemy
    place(s, V2, 10, -2)
    expect(saveMod(V2)).toBe(0)
    place(s, 'B:brute', -4, -8)
    expect(saveMod('B:brute')).toBe(0)
    // and it shows in a real save roll
    const t = game()
    place(t, SMITH, -4, -9)
    const roll = bruteSave(t, V1)
    place(t, SMITH, 10, -9)
    const without = bruteSave(t, V1)
    expect(roll.final - without.final).toBe(1)
  })

  it('FYR-AB-2 Plant the Icon: once per battle, either hero phase; Ward (5+) wholly within 12" until the end of the turn', () => {
    const s = game()
    place(s, SMITH, -4, -9)
    place(s, V1, -8, -5)
    place(s, V2, 10, -3) // beyond 12"
    expect(offered(s, 'A', 'hero')).toContain(PLANT)
    // used in the OPPONENT's hero phase
    s.activePlayer = 'B'
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'hero', 'A', PLANT)
    const ward = (id: UnitId) => feelNoPainFor(ctxFor(s, []), s.units[id].models[0], {} as never)?.threshold
    expect(ward(V1)).toBe(5)
    expect(ward(SMITH)).toBe(5)
    expect(ward(V2)).toBe(6) // out of range: keeps its printed Ward (6+)
    expect(ward('B:brute' as UnitId)).toBeUndefined()
    // the range is read live: step out and the ward is gone, step back in and it returns
    place(s, V1, 6, -5)
    expect(ward(V1)).toBe(6)
    place(s, V1, -8, -5)
    expect(ward(V1)).toBe(5)
    // gone at the end of the turn, and never offered again this battle
    effectService.expire(ctx, 'turnEnd', null)
    expect(ward(V1)).toBe(6)
    expect(offered(s, 'A', 'hero')).not.toContain(PLANT)
    s.activePlayer = 'A'
    s.round = 3
    expect(offered(s, 'A', 'hero')).not.toContain(PLANT)
  })

  it('FYR-AB-2 can also be used in your own hero phase', () => {
    const s = game()
    expect(offered(s, 'A', 'hero')).toContain(PLANT)
    useOnce(ctxFor(s, []), 'hero', 'A', PLANT)
    expect(offered(s, 'A', 'hero')).not.toContain(PLANT)
  })

  it('FYR-AB-3 Duty Unto Death: the Hearthguard and the general have Ward (5+) only while the general is wholly within 3" of the Hearthguard', () => {
    const s = game()
    const ward = (id: UnitId) => feelNoPainFor(ctxFor(s, []), s.units[id].models[0], {} as never)?.threshold
    place(s, HEARTH, -4, -4)
    place(s, SMITH, -4, -6)
    expect(ward(HEARTH)).toBe(5)
    expect(ward(SMITH)).toBe(5)
    expect(ward(V1)).toBe(6)
    // partly within 3": the general is close but part of his base sticks out past 3"
    place(s, SMITH, -4 + 0.2, -4 - 3)
    expect(ward(HEARTH)).toBe(6)
    expect(ward(SMITH)).toBe(6)
    // far away: printed Ward (6+) only
    place(s, SMITH, 8, -6)
    expect(ward(HEARTH)).toBe(6)
    expect(ward(SMITH)).toBe(6)
    // a dead general gives nobody anything
    place(s, SMITH, -4, -6)
    s.units[SMITH].location = 'destroyed'
    expect(ward(HEARTH)).toBe(6)
  })

  it('FYR-AB-4 Whirlwind of Destruction: +1 melee Attacks only on a turn the Vulkites charged', () => {
    const s = game()
    const base = s.weapons[HANDAXES].A as number
    expect(weapon(s, V1, HANDAXES).A).toBe(base)
    s.units[V1].turn.chargedThisTurn = true
    expect(weapon(s, V1, HANDAXES).A).toBe(base + 1)
    expect(weapon(s, V2, HANDAXES).A).toBe(base) // only the unit that charged
    // the Hearthguard have no such ability
    s.units[HEARTH].turn.chargedThisTurn = true
    expect(weapon(s, HEARTH, POLEAXE).A).toBe(s.weapons[POLEAXE].A)
  })
})

describe('FYR-WEAP weapons and FYR-WARD wards', () => {
  it('FYR-WEAP-1 Fyresteel Handaxes get +1 Rend against a unit that charged this turn', () => {
    const save = (charged: boolean) => {
      const s = game()
      place(s, V1, -4, -1.5)
      place(s, 'B:brute', -4, 0.5)
      s.units['B:brute'].turn.chargedThisTurn = charged
      const { events } = melee(s, [4, 3, 5], 'A:vulkite-a', 'B:brute', 1) // hit 4+, wound 3+, save die 5
      return of(events, 'SaveRolled')[0]
    }
    const plain = save(false)
    const anti = save(true)
    expect(plain.final).toBe(5 - 1) // Rend 1
    expect(anti.final).toBe(5 - 2) // +1 Rend
  })

  it('FYR-WEAP-2 Flamestrike Poleaxe: a critical hit deals its Damage as mortal damage and skips the wound and save rolls', () => {
    const s = game()
    place(s, HEARTH, -4, -1.5)
    place(s, 'B:brute', -4, 0.5)
    const { events, rng } = melee(s, [6], 'A:hearthguard', 'B:brute', 1)
    expect(of(events, 'HitRolled')[0].critical).toBe(true)
    expect(of(events, 'WoundRolled')).toHaveLength(0)
    expect(of(events, 'SaveRolled')).toHaveLength(0)
    expect(of(events, 'DamagePoolResolved')[0].points).toBe(2)
    expect(rng.remaining).toEqual([])
    expect(s.units['B:brute'].models.reduce((n, id) => n + s.models[id].woundsRemaining, 0)).toBe(3 * 3 - 2)
    // a plain hit is not a crit: it still wounds and saves
    const t = game()
    place(t, HEARTH, -4, -1.5)
    place(t, 'B:brute', -4, 0.5)
    const normal = melee(t, [5, 3, 6], 'A:hearthguard', 'B:brute', 1)
    expect(of(normal.events, 'WoundRolled')).toHaveLength(1)
    expect(of(normal.events, 'SaveRolled')).toHaveLength(1)
  })

  it('FYR-WARD-1 with several ward sources only the best applies, and each point is warded once', () => {
    const s = game()
    place(s, SMITH, -4, -6)
    place(s, HEARTH, -4, -4) // Duty Unto Death: Ward (5+) on the Hearthguard
    awaken(s, 'fiery-determination', [3]) // Ward (5+) on every unit
    const ctx0 = ctxFor(s, [])
    effectService.grant(ctx0, HEARTH, { feelNoPain: 4 }, { sourceAbilityId: 'test', sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    const w = feelNoPainFor(ctxFor(s, []), s.units[HEARTH].models[0], {} as never)
    expect(w?.threshold).toBe(4) // the best of 6 (printed), 5 (rune), 5 (Duty), 4 (test)
    // one ward die per point of mortal damage, not one per source
    const ctx = ctxFor(s, [6, 1])
    attackService.queueMortalWounds(ctx, HEARTH, 2, 'test', false)
    const rolls = of(eventLogs.get(ctx) ?? [], 'FeelNoPainRolled')
    expect(rolls.map((r) => [r.die, r.needed, r.ignored])).toEqual([[6, 4, true], [1, 4, false]])
    expect(s.units[HEARTH].models.map((id) => s.models[id].woundsRemaining).reduce((a, b) => a + b, 0)).toBe(10 - 1)
  })
})
