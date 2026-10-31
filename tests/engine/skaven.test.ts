// Skaven (Warpspark Clawpack) code hooks: docs/spec/factions/skaven.md, test ids SKV-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/skaven files on top of the AoS fixture bundle
// (player A = Warpspark Clawpack, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data
// except where a test says so (an enemy Wizard).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, createGame, legalActions, removeModel, step, unitModels, view,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { makeSimSetup } from '../../tools/sim-core'
import { DATA_VERSION, loadBundle } from '../../src/data'
import { attackService, feelNoPainFor } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { writeDeclaredAttack } from '../../src/engine/declared'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { losService } from '../../src/engine/los'
import { canCast, castingRoll, unbinders, wizardLevel } from '../../src/engine/magic'
import { objectiveService } from '../../src/engine/objectives'
import { buildShootingWeaponEntries } from '../../src/engine/phases/shooting'
import { checkSlide, readMoveQueue } from '../../src/engine/factions/aos-moves'
import { enemiesInCombat } from '../../src/engine/factions/aos-common'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { skavenAbilityTiming, skavenTargetBonus } from '../../src/engine/factions/skaven'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/skaven/abilities.json'
import enhancementsJson from '../../src/data/factions/skaven/enhancements.json'
import weaponsJson from '../../src/data/factions/skaven/weapons.json'
import factionJson from '../../src/data/factions/skaven/faction.json'
import patrolJson from '../../src/data/factions/skaven/patrols/warpspark-clawpack.json'
import greySeerJson from '../../src/data/factions/skaven/datasheets/grey-seer.json'
import stormfiendsJson from '../../src/data/factions/skaven/datasheets/stormfiends.json'
import cannonJson from '../../src/data/factions/skaven/datasheets/warp-lightning-cannon.json'
import clanratsJson from '../../src/data/factions/skaven/datasheets/clanrats.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [greySeerJson, stormfiendsJson, cannonJson, clanratsJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.skaven = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const CLAW = 'skaven.ability.always-three-clawsteps-ahead'
const ARMOUR = 'skaven.ability.warpstone-laced-armour'
const SWARM_RA = 'skaven.ability.endless-swarm-of-rats'
const MANIPULATOR = 'skaven.enh.skilled-manipulator'
const SKITTER = 'skaven.enh.skitterleap'
const SCURRY = 'skaven.enh.scurry-away'
const CAGE = 'skaven.enh.cage-of-warp-lightning'
const SKITTER_AB = 'skaven.ability.skitterleap'
const SCURRY_AB = 'skaven.ability.scurry-away'
const CAGE_AB = 'skaven.ability.cage-of-warp-lightning'
const WILL = 'skaven.ability.will-of-the-horned-rat'
const WITHER = 'skaven.ability.wither'
const SWARM = 'skaven.ability.seething-swarm'

const SEER = 'A:grey-seer'
const STORM = 'A:stormfiends'
const CANNON = 'A:warp-lightning-cannon'
const RATS1 = 'A:clanrats-1'
const RATS2 = 'A:clanrats-2'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'

const W = (id: string) => `skaven.weapon.${id}`

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

// the unit's models in a tight row centred on (cx, cz); 7+ models go in two rows so every model keeps two neighbours (coherency)
function centreRow(s: GameState, unitId: UnitId, cx: number, cz: number): void {
  const ms = unitModels(s, unitId)
  const r = Math.max(...ms.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
  const step = 2 * r + 0.15
  s.units[unitId].location = 'board'
  const rows = ms.length >= 7 ? 2 : 1
  const cols = Math.ceil(ms.length / rows)
  ms.forEach((m, i) => {
    const col = i % cols, row = Math.floor(i / cols)
    m.pos = { x: cx + (col - (cols - 1) / 2) * step, y: 0, z: cz + (rows === 1 ? 0 : (row - 0.5) * step) }
  })
}

// one model of the unit on the board at (x, z), the rest dropped (not slain)
function put(s: GameState, unitId: UnitId, x: number, z: number): void {
  trim(s, unitId, 1)
  s.units[unitId].location = 'board'
  unitModels(s, unitId)[0].pos = { x, y: 0, z }
}

// the smallest edge-to-edge gap between two units
const unitGap = (s: GameState, a: UnitId, b: UnitId): number =>
  Math.min(...unitModels(s, a).flatMap((m) => unitModels(s, b).map((o) => horizontalGap(m, o))))

// keep only the first `n` models of a unit (they are not "slain": no destroyedModels entry)
const trim = (s: GameState, unitId: UnitId, n: number): void => {
  for (const id of [...s.units[unitId].models].slice(n)) { delete s.models[id]; s.units[unitId].models = s.units[unitId].models.filter((m) => m !== id) }
}

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'skaven', patrolId: 'skaven.army.warpspark-clawpack', enhancementId: opts.enh ?? MANIPULATOR, regimentAbilityId: opts.reg ?? SWARM_RA }),
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
const ctxFor = (s: GameState, dice: number[] = []): EngineContext => {
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  rngs.set(ctx, rng)
  eventLogs.set(ctx, events)
  return ctx
}
const leftOver = (ctx: EngineContext): number[] => rngs.get(ctx)?.remaining ?? []
const evOf = (ctx: EngineContext): GameEvent[] => eventLogs.get(ctx) ?? []
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const summaries = (ctx: EngineContext): string[] => of(evOf(ctx), 'AbilityTriggered').map((e) => e.summary)

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

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('SKV-REG every code in the Skaven data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('SKV-ARMY-1 the army builds in the engine: Grey Seer general, 5 units, 25 models, the chosen regiment ability and enhancement', () => {
    const s = game({ enh: SKITTER, reg: ARMOUR })
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(25)
    expect(s.players.A.warlordUnitId).toBe(SEER)
    expect(s.players.A.battleTraitIds).toEqual([CLAW])
    expect(s.players.A.regimentAbilityId).toBe(ARMOUR)
    expect(s.units[SEER].enhancementId).toBe(SKITTER)
    const st = (id: string) => s.datasheets[`skaven.unit.${id}`].stats
    expect(st('grey-seer')).toMatchObject({ M: 6, W: 5, Sv: 6, OC: 2 })
    expect(st('stormfiends')).toMatchObject({ M: 6, W: 6, Sv: 4, OC: 2 })
    expect(st('warp-lightning-cannon')).toMatchObject({ M: 3, W: 8, Sv: 4, OC: 2 })
    expect(st('clanrats')).toMatchObject({ M: 6, W: 1, Sv: 5, OC: 1 })
  })

  it('SKV-ARMY-2 the Stormfiends models carry their printed weapons in the engine', () => {
    const s = game()
    const loadout = unitModels(s, STORM).map((m) => m.weapons.map((w) => w.replace('skaven.weapon.', '')).join('+'))
    expect(loadout).toEqual(['windlaunchers+clubbing-blows', 'ratling-cannons+clubbing-blows', 'shock-gauntlets'])
    expect(unitModels(s, CANNON).map((m) => m.weapons.map((w) => w.replace('skaven.weapon.', '')).join('+'))).toEqual(['warp-lightning-blast+crews-teeth-and-knives'])
  })

  it('SKV-ARMY-3 only the two Clanrats units are offered for replacement once destroyed', () => {
    const s = game()
    for (const id of [SEER, STORM, CANNON, RATS1, RATS2]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A').sort()).toEqual([RATS1, RATS2])
  })
})

describe('SKV-BT Always Three Clawsteps Ahead', () => {
  it('SKV-BT-1 is offered once in the enemy movement phase, never in your own; a unit in combat cannot be picked', () => {
    const s = game()
    s.phase = 'movement'
    s.activePlayer = 'A'
    expect(offered(s, 'A', 'movement')).not.toContain(CLAW) // your own movement phase
    s.activePlayer = 'B'
    centreRow(s, RATS1, -8, -4)
    centreRow(s, RATS2, 0, -2)
    centreRow(s, BRUTE, 0, 0.3) // in combat with the second Clanrats unit
    expect(losService.unitInCombat(s, RATS2)).toBe(true)
    expect(offered(s, 'A', 'movement')).toContain(CLAW)
    expect(offered(s, 'B', 'movement')).not.toContain(CLAW)
    const targets = targetsOf('skavenThreeClawsteps', s, null, 'A')
    expect(targets).toContain(RATS1)
    expect(targets).not.toContain(RATS2)
    // the move itself: a slide for the picked unit, not a Run
    const start = centreOf(s, RATS1)
    const ctx = ctxFor(s)
    const r = useOnce(ctx, 'movement', 'A', CLAW, { target: RATS1, pickMode: farthest })
    expect(r.topics).toContain('abilityMode')
    const end = centreOf(s, RATS1)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(1)
    // once in that movement phase (army wide) ...
    expect(offered(s, 'A', 'movement')).not.toContain(CLAW)
    // ... and again in the next enemy movement phase
    s.round = 2
    expect(offered(s, 'A', 'movement')).toContain(CLAW)
  })

  it('SKV-BT-2 the move is up to the unit\'s Move and never passes through or ends inside an enemy combat range', () => {
    const s = game()
    s.phase = 'movement'
    s.activePlayer = 'B'
    put(s, RATS2, 10, -10) // out of the way
    put(s, RATS1, 0, -9)
    put(s, GUARD, 3.5, -6) // its 3" bubble covers the straight path up the middle, but not the start or the end spot
    const opts = { normalMove: true }
    expect(losService.unitInCombat(s, RATS1)).toBe(false)
    expect(checkSlide(s, RATS1, 0, 6, 6, false, { mayNotEndInCombat: true, passThrough: true }).ok).toBe(true) // a plain "may cross" slide is fine
    expect(checkSlide(s, RATS1, 0, 6, 6, false, opts).ok).toBe(false) // crosses the bubble
    expect(checkSlide(s, RATS1, 0, 3, 6, false, opts).ok).toBe(false) // ends inside it
    expect(checkSlide(s, RATS1, -3, 3, 6, false, opts).ok).toBe(true) // away from it
    expect(checkSlide(s, RATS1, -7, 0, 6, false, opts).ok).toBe(false) // further than the Move
    // the queued move uses the unit's Move characteristic (the Cannon has 3")
    centreRow(s, CANNON, -8, -7)
    const ctx = ctxFor(s)
    codeHooks.skavenThreeClawsteps.activate!.resolve(ctx, { abilityId: CLAW, unitId: null, player: 'A', targetUnitIds: [CANNON], modeId: null, roll: null })
    const q = readMoveQueue(s)
    expect(q).toMatchObject({ queue: [CANNON], maxDistance: 3, opts: { normalMove: true } })
    expect(checkSlide(s, CANNON, 0, 3.5, 3, false, opts).ok).toBe(false)
    expect(checkSlide(s, CANNON, -3, 0, 3, false, opts).ok).toBe(true)
  })
})

describe('SKV-RA regiment abilities', () => {
  const declare = (s: GameState, attacker: UnitId, targets: UnitId[], phase: 'shooting' | 'fight' = 'shooting'): void => {
    s.phase = phase
    s.activePlayer = 'B'
    writeDeclaredAttack(s, { unitId: attacker, phase, seq: 1, targetUnitIds: targets })
  }
  const ward = (s: GameState, id: UnitId) => feelNoPainFor(ctxFor(s, []), s.units[id].models[0], {} as never)?.threshold

  it('SKV-RA-1 Warpstone-Laced Armour: offered only when an enemy attack targets the Stormfiends; Ward 5+ until the end of the turn; once per battle', () => {
    const s = game({ reg: ARMOUR })
    declare(s, BRUTE, [RATS1])
    expect(offered(s, 'A', 'attackTargeted')).not.toContain(ARMOUR) // not aimed at the Stormfiends
    declare(s, BRUTE, [RATS1, STORM])
    expect(offered(s, 'A', 'attackTargeted')).toContain(ARMOUR)
    expect(offered(s, 'B', 'attackTargeted')).not.toContain(ARMOUR)
    expect(offered(s, 'A', 'attackDeclared')).not.toContain(ARMOUR) // only the targeted window
    // an attack by our own side never offers it
    declare(s, CANNON, [STORM])
    s.activePlayer = 'A'
    expect(offered(s, 'A', 'attackTargeted')).not.toContain(ARMOUR)
    declare(s, BRUTE, [STORM])
    expect(ward(s, STORM)).toBeUndefined()
    const ctx = ctxFor(s)
    useOnce(ctx, 'attackTargeted', 'A', ARMOUR)
    expect(ward(s, STORM)).toBe(5)
    expect(ward(s, RATS1)).toBeUndefined()
    // gone with the turn
    effectService.expire(ctx, 'turnEnd', null)
    expect(ward(s, STORM)).toBeUndefined()
    // once per battle
    s.round = 3
    declare(s, BRUTE, [STORM])
    expect(offered(s, 'A', 'attackTargeted')).not.toContain(ARMOUR)
    // the other regiment ability does not offer it
    const t = game({ reg: SWARM_RA })
    declare(t, BRUTE, [STORM])
    expect(offered(t, 'A', 'attackTargeted')).not.toContain(ARMOUR)
  })

  it('SKV-RA-2 Endless Swarm of Rats: Seething Swarm returns D6 instead of D3', () => {
    const slay = (s: GameState): void => { for (const id of [...s.units[RATS1].models].slice(6)) removeModel(s, id) } // 6 left, 4 slain
    const s = game({ reg: SWARM_RA })
    centreRow(s, RATS1, 0, -6)
    slay(s)
    const ctx = ctxFor(s, [4])
    useOnce(ctx, 'endOfTurn', 'A', SWARM)
    expect(s.units[RATS1].models).toHaveLength(10) // D6 = 4: all four slain models are back (a D3 could not)
    expect(leftOver(ctx)).toEqual([])
    // without it the roll is a D3
    const t = game({ reg: ARMOUR })
    centreRow(t, RATS1, 0, -6)
    slay(t)
    const c2 = ctxFor(t, [5]) // face 5 = 3 on a D3
    useOnce(c2, 'endOfTurn', 'A', SWARM)
    expect(t.units[RATS1].models).toHaveLength(9) // D3 = 3
    expect(leftOver(c2)).toEqual([])
  })
})

describe('SKV-ENH enhancements', () => {
  const ward = (s: GameState, id: UnitId) => feelNoPainFor(ctxFor(s, []), s.units[id].models[0], {} as never)?.threshold

  it('SKV-ENH-1 Skilled Manipulator: the general has Ward (4+) only within 1" of a friendly Clanrats unit', () => {
    const s = game({ enh: MANIPULATOR })
    centreRow(s, SEER, 0, -6)
    centreRow(s, RATS1, 8, -6)
    expect(ward(s, SEER)).toBeUndefined() // Clanrats too far away
    centreRow(s, RATS1, 0, -8.1) // closest bases 0.4" apart
    expect(unitGap(s, SEER, RATS1)).toBeLessThan(1)
    expect(ward(s, SEER)).toBe(4)
    expect(ward(s, RATS1)).toBeUndefined() // nobody else
    // other units do not count as Clanrats
    centreRow(s, RATS1, 8, -6)
    centreRow(s, STORM, 0, -8.2)
    expect(unitGap(s, SEER, STORM)).toBeLessThan(1)
    expect(ward(s, SEER)).toBeUndefined()
    // a different enhancement does not carry it
    const t = game({ enh: CAGE })
    centreRow(t, SEER, 0, -6)
    centreRow(t, RATS1, 0, -8.1)
    expect(ward(t, SEER)).toBeUndefined()
  })

  it('SKV-ENH-2 Skitterleap: casting 6+ sets the general up more than 6" from all enemies and bars Move abilities this movement phase; the cast is shared with Wither', () => {
    const base = (): GameState => {
      const s = game({ enh: SKITTER })
      centreRow(s, SEER, 0, -6)
      centreRow(s, BRUTE, 0, -3.2) // in combat with the Grey Seer
      expect(losService.unitInCombat(s, SEER)).toBe(true)
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'hero')).toContain(SKITTER_AB)
    const ctx = ctxFor(s, [3, 3])
    const r = useOnce(ctx, 'hero', 'A', SKITTER_AB)
    expect(summaries(ctx).some((t) => t.includes('casting roll 6, cast'))).toBe(true)
    expect(r.topics).toContain('abilityMode') // where to set up
    expect(s.units[SEER].location).toBe('board')
    for (const m of unitModels(s, SEER)) for (const e of unitModels(s, BRUTE).concat(unitModels(s, GUARD), unitModels(s, BOSS))) expect(horizontalGap(m, e)).toBeGreaterThan(6)
    expect(losService.unitInCombat(s, SEER)).toBe(false)
    expect(s.units[SEER].setUpTurn).toEqual({ round: 1, player: 'A' }) // CORE-6.13: no Move ability this turn's movement phase
    // one cast per hero phase for a Wizard (1): Wither is gone too
    expect(wizardLevel(s, SEER)).toBe(1)
    expect(offered(s, 'A', 'hero')).not.toContain(WITHER)
    expect(offered(s, 'A', 'hero')).not.toContain(SKITTER_AB)
    // casting roll of 5: nothing happens and the attempt is spent
    const t = base()
    const before = unitModels(t, SEER).map((m) => ({ ...m.pos }))
    const c2 = ctxFor(t, [2, 3])
    useOnce(c2, 'hero', 'A', SKITTER_AB)
    expect(summaries(c2).some((x) => x.includes('casting roll 5, not cast'))).toBe(true)
    expect(unitModels(t, SEER).map((m) => ({ ...m.pos }))).toEqual(before)
    expect(t.units[SEER].setUpTurn).toBeNull()
    expect(offered(t, 'A', 'hero')).not.toContain(WITHER)
    // and the other way round: Wither first uses up Skitterleap
    const u = base()
    useOnce(ctxFor(u, [2, 2, 1]), 'hero', 'A', WITHER)
    expect(offered(u, 'A', 'hero')).not.toContain(SKITTER_AB)
    // a bearer that is not the general's enhancement choice never has it
    expect(offered(game({ enh: MANIPULATOR }), 'A', 'hero')).not.toContain(SKITTER_AB)
  })

  it('SKV-ENH-3 Scurry Away: 3+ lets the general Retreat in a combat phase with no mortal damage; 1-2 nothing; needs the general in combat', () => {
    const base = (): GameState => {
      const s = game({ enh: SCURRY })
      s.phase = 'fight'
      centreRow(s, SEER, 0, -6)
      centreRow(s, BRUTE, 0, -3.2)
      expect(enemiesInCombat(s, SEER)).toEqual([BRUTE])
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'fight')).toContain(SCURRY_AB)
    s.activePlayer = 'B' // any combat phase
    expect(offered(s, 'A', 'fight')).toContain(SCURRY_AB)
    s.activePlayer = 'A'
    const start = centreOf(s, SEER)
    const hp = wounds(s, SEER)
    const ctx = ctxFor(s, [3])
    const r = useOnce(ctx, 'fight', 'A', SCURRY_AB, { pickMode: farthest })
    expect(r.topics).toContain('abilityMode')
    const end = centreOf(s, SEER)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(1)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThanOrEqual(6 + 1e-6) // the Grey Seer's Move
    expect(enemiesInCombat(s, SEER)).toEqual([])
    expect(wounds(s, SEER)).toBe(hp) // no retreat damage
    expect(leftOver(ctx)).toEqual([])
    // a 2: nothing
    const t = base()
    const c2 = ctxFor(t, [2])
    const r2 = useOnce(c2, 'fight', 'A', SCURRY_AB)
    expect(r2.topics).toEqual(['abilityUse'])
    expect(readMoveQueue(t)).toBeNull()
    expect(centreOf(t, SEER)).toEqual(start)
    // not in combat: not offered
    const u = base()
    centreRow(u, BRUTE, 0, 6)
    expect(offered(u, 'A', 'fight')).not.toContain(SCURRY_AB)
  })

  it('SKV-ENH-4 Cage of Warp Lightning: 2+ gives a visible enemy within 6" Strike-last; a 1 deals 1 mortal damage to the general; once per battle', () => {
    const base = (): GameState => {
      const s = game({ enh: CAGE })
      s.phase = 'fight'
      centreRow(s, SEER, 0, -6)
      centreRow(s, BRUTE, 0, -3.2)
      put(s, GUARD, 9, -3) // 9.5" away: out of reach
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'fight')).toContain(CAGE_AB)
    expect(targetsOf('skavenCageOfWarpLightning', s, SEER, 'A')).toEqual([BRUTE])
    const ctx = ctxFor(s, [2])
    useOnce(ctx, 'fight', 'A', CAGE_AB, { target: BRUTE })
    expect(s.units[BRUTE].turn.fightsLast).toBe(true)
    expect(s.units[GUARD].turn.fightsLast).toBeFalsy()
    expect(wounds(s, SEER)).toBe(5)
    expect(leftOver(ctx)).toEqual([])
    // once per battle, in either player's later combat phase
    s.round = 2
    expect(offered(s, 'A', 'fight')).not.toContain(CAGE_AB)
    // a 1: 1 mortal damage to the general and nothing else
    const t = base()
    const c2 = ctxFor(t, [1, 4])
    useOnce(c2, 'fight', 'A', CAGE_AB, { target: BRUTE })
    expect(t.units[BRUTE].turn.fightsLast).toBeFalsy()
    expect(wounds(t, SEER)).toBe(4)
    expect(offered(t, 'A', 'fight')).not.toContain(CAGE_AB)
    // nothing within 6": not offered
    const u = base()
    centreRow(u, BRUTE, 0, 8)
    expect(offered(u, 'A', 'fight')).not.toContain(CAGE_AB)
  })
})

describe('SKV-AB warscroll abilities', () => {
  it('SKV-AB-1 Will of the Horned Rat: 3+ adds the rolled number once to the target\'s control score until your next turn; 1-2 nothing; wholly within 13"', () => {
    const base = (): GameState => {
      const s = game()
      s.phase = 'command'
      centreRow(s, SEER, 0, -6)
      centreRow(s, RATS1, 0, 0) // on the centre objective
      centreRow(s, STORM, 13, -9) // not wholly within 13"
      return s
    }
    const s = base()
    const control = (ctx: EngineContext): number => objectiveService.levelOfControl(s, 'obj-c', ctx).A
    const ctx = ctxFor(s, [4])
    const c0 = control(ctx) // the Clanrats on the objective, 1 Control per model
    expect(c0).toBeGreaterThanOrEqual(4)
    expect(targetsOf('skavenWillOfTheHornedRat', s, SEER, 'A')).toContain(RATS1)
    expect(targetsOf('skavenWillOfTheHornedRat', s, SEER, 'A')).toContain(SEER) // the Seer may pick itself
    expect(targetsOf('skavenWillOfTheHornedRat', s, SEER, 'A')).not.toContain(STORM)
    useOnce(ctx, 'hero', 'A', WILL, { target: RATS1 })
    expect(control(ctx)).toBe(c0 + 4) // +4 to the unit's score, not to each model
    expect(leftOver(ctx)).toEqual([])
    // once per phase
    expect(offered(s, 'A', 'hero')).not.toContain(WILL)
    // a 6 adds 6; a 2 nothing
    const six = base()
    const c6 = ctxFor(six, [6])
    useOnce(c6, 'hero', 'A', WILL, { target: RATS1 })
    expect(objectiveService.levelOfControl(six, 'obj-c', c6).A).toBe(c0 + 6)
    const two = base()
    const c2 = ctxFor(two, [2])
    useOnce(c2, 'hero', 'A', WILL, { target: RATS1 })
    expect(objectiveService.levelOfControl(two, 'obj-c', c2).A).toBe(c0)
    expect(summaries(c2).some((x) => x.includes('nothing happens'))).toBe(true)
    // the bonus ends at the start of your next turn
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(control(ctx)).toBe(c0)
  })

  it('SKV-AB-2 Wither: casting 6+ deals D3 mortal damage to a visible enemy within 13"; it can be unbound', () => {
    const base = (patch?: (b: DataBundle) => void): GameState => {
      const s = game({ patch })
      centreRow(s, SEER, 0, -6)
      centreRow(s, BRUTE, 0, 4) // 10" away
      put(s, GUARD, 0, 9) // 15" away: out of range
      return s
    }
    const s = base()
    expect(targetsOf('skavenWither', s, SEER, 'A')).toEqual([BRUTE])
    expect(offered(s, 'A', 'hero')).toContain(WITHER)
    const hp = wounds(s, BRUTE)
    const ctx = ctxFor(s, [3, 3, 4]) // 6 to cast; face 4 = 2 on a D3
    useOnce(ctx, 'hero', 'A', WITHER, { target: BRUTE })
    expect(wounds(s, BRUTE)).toBe(hp - 2)
    expect(leftOver(ctx)).toEqual([])
    // a casting roll of 5 fails
    const t = base()
    const c2 = ctxFor(t, [2, 3])
    useOnce(c2, 'hero', 'A', WITHER, { target: BRUTE })
    expect(wounds(t, BRUTE)).toBe(hp)
    // too far: not a target
    centreRow(t, BRUTE, 0, 9)
    expect(targetsOf('skavenWither', t, SEER, 'A')).toEqual([])
    // an enemy Wizard within 30" unbinds it with a higher roll
    const u = base((b) => { b.datasheets['fx.boss'].keywords = ['HERO', 'INFANTRY', 'WIZARD']; b.datasheets['fx.boss'].wizard = 1 })
    centreRow(u, BOSS, 8, 8)
    const c3 = ctxFor(u, [3, 3, 6, 6])
    useOnce(c3, 'hero', 'A', WITHER, { target: BRUTE })
    expect(wounds(u, BRUTE)).toBe(hp)
    expect(summaries(c3).some((x) => x.includes('unbound'))).toBe(true)
  })

  it('SKV-AB-3 Shock Gauntlets: each critical hit becomes D6 hits, each rolling to wound', () => {
    const s = game()
    centreRow(s, STORM, 0, -3)
    centreRow(s, GUARD, 0, 0)
    // 4 attacks: a 6 (critical), three 1s; the crit rolls a 3 -> 3 hits; 3 wound rolls (2+), 3 failed saves
    const { events, rng } = attack(s, 'melee', [6, 1, 1, 1, 3, 4, 4, 4, 1, 1, 1], STORM, W('shock-gauntlets'), GUARD, 4)
    const hit = of(events, 'HitRolled')
    expect(hit.filter((h) => h.hit)).toHaveLength(1)
    expect(hit.find((h) => h.critical)!.extraHits).toBe(2)
    expect(of(events, 'WoundRolled')).toHaveLength(3)
    expect(rng.remaining).toEqual([])
    // the dice is rolled per critical hit and a 1 still scores one hit
    const t = game()
    centreRow(t, STORM, 0, -3)
    centreRow(t, GUARD, 0, 0)
    const r2 = attack(t, 'melee', [6, 6, 1, 1, 1, 6, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1], STORM, W('shock-gauntlets'), GUARD, 4)
    expect(of(r2.events, 'HitRolled').filter((h) => h.critical).map((h) => h.extraHits)).toEqual([0, 5])
    expect(of(r2.events, 'WoundRolled')).toHaveLength(7)
    expect(r2.rng.remaining).toEqual([])
    // Clubbing Blows have no such ability: a critical hit is one hit
    const u = game()
    centreRow(u, STORM, 0, -3)
    centreRow(u, GUARD, 0, 0)
    const r3 = attack(u, 'melee', [6, 1, 1, 1, 4, 1], STORM, W('clubbing-blows'), GUARD, 4)
    expect(of(r3.events, 'WoundRolled')).toHaveLength(1)
    expect(r3.rng.remaining).toEqual([])
  })

  it('SKV-AB-4 Seething Swarm: end of any turn returns up to D3 slain models, never above starting strength; works in combat', () => {
    const s = game({ reg: ARMOUR })
    centreRow(s, RATS1, 0, -6)
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(SWARM) // nobody slain
    for (const id of [...s.units[RATS1].models].slice(6)) removeModel(s, id) // 4 slain
    s.activePlayer = 'B' // the end of the enemy's turn counts too
    expect(offered(s, 'A', 'endOfTurn')).toContain(SWARM)
    centreRow(s, BRUTE, 0, -3.3) // and it works in combat
    expect(losService.unitInCombat(s, RATS1)).toBe(true)
    const ctx = ctxFor(s, [4]) // face 4 = 2 on a D3
    useOnce(ctx, 'endOfTurn', 'A', SWARM)
    expect(s.units[RATS1].models).toHaveLength(8)
    expect(leftOver(ctx)).toEqual([])
    // once per turn for the unit
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(SWARM)
    // never above starting strength: one slain model, a roll of 3
    const t = game({ reg: ARMOUR })
    centreRow(t, RATS1, 0, -6)
    removeModel(t, t.units[RATS1].models[9])
    useOnce(ctxFor(t, [6]), 'endOfTurn', 'A', SWARM)
    expect(t.units[RATS1].models).toHaveLength(10)
    expect(t.units[RATS1].destroyedModels).toHaveLength(0)
  })

  it('SKV-AB-5 Warp Lightning Blast: each hit deals 1 mortal damage with no wound or save roll; the target\'s ward still rolls', () => {
    const s = game()
    centreRow(s, CANNON, 0, -8)
    centreRow(s, BRUTE, 0, 4)
    const hp = wounds(s, BRUTE)
    // 3 attacks: 4, 4, 1 -> 2 hits -> 2 mortal damage; nothing else is rolled
    const { events, rng } = attack(s, 'ranged', [4, 4, 1], CANNON, W('warp-lightning-blast'), BRUTE, 3)
    expect(wounds(s, BRUTE)).toBe(hp - 2)
    expect(of(events, 'WoundRolled')).toHaveLength(0)
    expect(of(events, 'SaveRolled')).toHaveLength(0)
    expect(rng.remaining).toEqual([])
    // a critical hit has no extra effect: still 1 mortal damage per hit
    const t = game()
    centreRow(t, CANNON, 0, -8)
    centreRow(t, BRUTE, 0, 4)
    attack(t, 'ranged', [6, 4], CANNON, W('warp-lightning-blast'), BRUTE, 2)
    expect(wounds(t, BRUTE)).toBe(hp - 2)
    // ward still applies: Ward 5+, one die passes the other fails
    const u = game()
    centreRow(u, CANNON, 0, -8)
    centreRow(u, BRUTE, 0, 4)
    effectService.grant(ctxFor(u), BRUTE, { feelNoPain: 5 }, { sourceAbilityId: 'test', sourceUnitId: BRUTE, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    const r3 = attack(u, 'ranged', [4, 4, 5, 1], CANNON, W('warp-lightning-blast'), BRUTE, 2)
    expect(wounds(u, BRUTE)).toBe(hp - 1)
    expect(r3.rng.remaining).toEqual([])
  })
})

describe('SKV-WEAP and SKV-MAG', () => {
  it('SKV-WEAP-2 no Skaven ranged weapon in this army can shoot while its unit is in combat', () => {
    for (const w of weaponsJson as unknown as WeaponData[]) {
      expect(w.abilities.some((a) => a.ability === 'SHOOT_IN_COMBAT'), w.id).toBe(false)
    }
    const s = game()
    s.phase = 'shooting'
    s.activePlayer = 'A'
    const canShoot = (st: GameState, unit: UnitId, weaponId: string): boolean =>
      buildShootingWeaponEntries(ctxFor(st, []), unit).filter((e) => e.weaponId === weaponId).some((e) => e.legalTargets.length > 0)
    centreRow(s, STORM, 0, -9)
    centreRow(s, CANNON, 8, -9)
    centreRow(s, BRUTE, 0, 0)
    expect(canShoot(s, STORM, W('ratling-cannons'))).toBe(true)
    expect(canShoot(s, STORM, W('windlaunchers'))).toBe(true)
    expect(canShoot(s, CANNON, W('warp-lightning-blast'))).toBe(true)
    // in combat: none of them can fire, not even at the unit they are fighting
    centreRow(s, STORM, 0, -3.5)
    centreRow(s, CANNON, 8, -3.5)
    put(s, GUARD, 8, 0)
    expect(enemiesInCombat(s, STORM)).toEqual([BRUTE])
    expect(enemiesInCombat(s, CANNON)).toEqual([GUARD])
    expect(canShoot(s, STORM, W('ratling-cannons'))).toBe(false)
    expect(canShoot(s, STORM, W('windlaunchers'))).toBe(false)
    expect(canShoot(s, CANNON, W('warp-lightning-blast'))).toBe(false)
  })

  it('SKV-MAG-1 the Grey Seer attempts at most one spell per hero phase and may unbind one enemy spell', () => {
    const s = game({ enh: SKITTER, patch: (b) => { b.datasheets['fx.boss'].keywords = ['HERO', 'INFANTRY', 'WIZARD']; b.datasheets['fx.boss'].wizard = 1 } })
    centreRow(s, SEER, 0, -6)
    centreRow(s, BRUTE, 0, 4)
    centreRow(s, BOSS, 8, 8)
    expect(wizardLevel(s, SEER)).toBe(1)
    expect(canCast(s, SEER)).toBe(true)
    // one attempt (it fails: a 5) uses up the phase's cast for both Wither and Skitterleap
    useOnce(ctxFor(s, [2, 3]), 'hero', 'A', WITHER, { target: BRUTE })
    expect(canCast(s, SEER)).toBe(false)
    expect(offered(s, 'A', 'hero')).not.toContain(WITHER)
    expect(offered(s, 'A', 'hero')).not.toContain(SKITTER_AB)
    // a new phase starts with a fresh cast
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('magic:'))
    expect(canCast(s, SEER)).toBe(true)
    // unbinding: the enemy Boss casts (a 6), the Grey Seer rolls 2D6 against it and unbinds with a higher total
    s.activePlayer = 'B'
    const ctx = ctxFor(s, [3, 3, 6, 5])
    const cast = castingRoll(ctx, { abilityId: 'test.spell', unitId: BOSS, player: 'B' }, BOSS, 6)
    expect(cast).toMatchObject({ cast: false, unbound: true, unboundBy: SEER })
    // one unbind attempt per phase: the Seer cannot unbind a second spell
    expect(unbinders(s, BOSS)).toEqual([])
    expect(leftOver(ctx)).toEqual([])
  })
})

describe('SKV-AI', () => {
  it('SKV-AI hints: the bot spends Warpstone-Laced Armour on a heavy hitter only, Scurry Away only when the fight is lost, Skitterleap only in trouble', () => {
    // Warpstone-Laced Armour: a Guard unit's spears are not worth it, a Brute is not either at range 1 - judged by expected damage
    const s = game({ reg: ARMOUR, patch: (b) => { (b.weapons['fx.w.boss-blade'] as { A: number }).A = 16 } })
    s.phase = 'fight'
    s.activePlayer = 'B'
    writeDeclaredAttack(s, { unitId: BOSS, phase: 'fight', seq: 1, targetUnitIds: [STORM] })
    centreRow(s, STORM, 0, -3)
    centreRow(s, BOSS, 0, 0)
    expect(skavenAbilityTiming(s, 'A', 'skavenWarpstoneArmour', null)).toBe(1) // a Boss swinging 16 attacks
    writeDeclaredAttack(s, { unitId: GUARD, phase: 'fight', seq: 2, targetUnitIds: [STORM] })
    for (const id of s.units[GUARD].models.slice(1)) removeModel(s, id)
    centreRow(s, GUARD, 0, 0)
    expect(skavenAbilityTiming(s, 'A', 'skavenWarpstoneArmour', null)).toBeLessThan(-2)
    // Skitterleap: nothing within 9" and no fight -> pass
    const t = game({ enh: SKITTER })
    centreRow(t, SEER, 0, -9)
    expect(skavenAbilityTiming(t, 'A', 'skavenSkitterleap', SEER)).toBeLessThan(-2)
    centreRow(t, BOSS, 0, -2)
    expect(skavenAbilityTiming(t, 'A', 'skavenSkitterleap', SEER)).toBeGreaterThanOrEqual(0)
    // Scurry Away: the Boss would kill the Grey Seer
    const u = game({ enh: SCURRY })
    u.phase = 'fight'
    centreRow(u, SEER, 0, -3)
    centreRow(u, BOSS, 0, 0)
    expect(skavenAbilityTiming(u, 'A', 'skavenScurryAway', SEER)).toBeGreaterThan(0)
    u.models[u.units[BOSS].models[0]].pos = { x: 0, y: 0, z: 9 }
    expect(skavenAbilityTiming(u, 'A', 'skavenScurryAway', SEER)).toBeLessThan(-2)
    // target hints: the Grey Seer is the last unit to march with Always Three Clawsteps Ahead
    expect(skavenTargetBonus(u, 'A', 'skavenThreeClawsteps', SEER)).toBeLessThan(0)
  })

  it('SKV-AI whole games: the Skaven AI plays full games against Cities, with every regiment ability and enhancement, without a rejected action', async () => {
    const full = await loadBundle()
    const picks = [
      { reg: 'skaven.ability.endless-swarm-of-rats', enh: 'skaven.enh.skilled-manipulator' },
      { reg: 'skaven.ability.warpstone-laced-armour', enh: 'skaven.enh.skitterleap' },
      { reg: 'skaven.ability.endless-swarm-of-rats', enh: 'skaven.enh.scurry-away' },
      { reg: 'skaven.ability.warpstone-laced-armour', enh: 'skaven.enh.cage-of-warp-lightning' },
    ]
    for (const [g, pick] of picks.entries()) {
      const seed = `skv-${g}`
      const setup = makeSimSetup(full, g, DATA_VERSION, ['skaven', 'cities'])
      for (const p of ['A', 'B'] as const) if (setup.players[p].faction === 'skaven') { setup.players[p].regimentAbilityId = pick.reg; setup.players[p].enhancementId = pick.enh }
      const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
      let r = createGame(setup, seed, full)
      for (let n = 0; r.pending && n < 8000; n++) {
        const legal = legalActions(r.state, r.pending)!
        r = step(r.state, await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal))
        expect(r.rejection).toBeUndefined()
      }
      expect(r.state.phase).toBe('ended')
    }
  }, 240000)
})
