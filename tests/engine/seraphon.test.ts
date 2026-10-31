// Seraphon (Sunblooded Prowlers) code hooks and data: docs/spec/factions/seraphon.md, test ids SER-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/seraphon files on top of the AoS fixture bundle
// (player A = Sunblooded Prowlers, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data.
// Test ids follow the spec's §9 table (its AB numbers split the warscroll rules: AB-1/2/3 Scaled Protectors and allocation,
// AB-4 Savage Bellow, AB-5 Ordered Cohorts, AB-6 Star-Venom, AB-7 Screeches, AB-8/9 Sun Acolytes).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, createGame, legalActions, removeModel, step, unitModels, view,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { makeSimSetup } from '../../tools/sim-core'
import { DATA_VERSION, loadBundle } from '../../src/data'
import { attackService, feelNoPainFor } from '../../src/engine/attack'
import { cardWard } from '../../src/engine/cardFlags'
import { expireCardFlags } from '../../src/engine/cards'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { missionService } from '../../src/engine/missions'
import { objectiveService } from '../../src/engine/objectives'
import { weaponService } from '../../src/engine/weapons'
import { resolveSetUp } from '../../src/engine/phases/movement'
import { checkSlide } from '../../src/engine/factions/aos-moves'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { seraphonAbilityTiming, seraphonTargetBonus } from '../../src/engine/factions/seraphon'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, autoDeployAos, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/seraphon/abilities.json'
import enhancementsJson from '../../src/data/factions/seraphon/enhancements.json'
import weaponsJson from '../../src/data/factions/seraphon/weapons.json'
import factionJson from '../../src/data/factions/seraphon/faction.json'
import patrolJson from '../../src/data/factions/seraphon/patrols/sunblooded-prowlers.json'
import packJson from '../../src/data/factions/seraphon/datasheets/sunblood-pack.json'
import saurusJson from '../../src/data/factions/seraphon/datasheets/saurus-warriors.json'
import huntersJson from '../../src/data/factions/seraphon/datasheets/hunters-of-huanchi.json'
import terrawingsJson from '../../src/data/factions/seraphon/datasheets/terrawings.json'
import spawnJson from '../../src/data/factions/seraphon/datasheets/spawn-of-chotec.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [packJson, saurusJson, huntersJson, terrawingsJson, spawnJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.seraphon = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const AEGIS = 'seraphon.ability.scaled-aegis'
const FOLLOWERS = 'seraphon.ability.followers-of-huanchi'
const COMMANDER = 'seraphon.enh.instinctive-commander'
const MAULING = 'seraphon.enh.savage-mauling'
const VENOM = 'seraphon.enh.venomite-swarm'
const BLESSED = 'seraphon.enh.blessed-by-the-old-ones'
const COMMANDER_AB = 'seraphon.ability.instinctive-commander'
const MAULING_AB = 'seraphon.ability.savage-mauling'
const VENOM_AB = 'seraphon.ability.venomite-swarm'
const BLESSED_AB = 'seraphon.ability.blessed-by-the-old-ones'
const VENGEANCE = 'seraphon.ability.vengeance-of-azyr'
const BELLOW = 'seraphon.ability.savage-bellow'
const STAR = 'seraphon.ability.star-venom'
const SCREECH = 'seraphon.ability.nerve-shredding-screeches'

const PACK = 'A:sunblood-pack'
const SA = 'A:saurus-a'
const SB = 'A:saurus-b'
const HA = 'A:hunters-a'
const HB = 'A:hunters-b'
const TW = 'A:terrawings'
const SP = 'A:spawn'
const BOSS = 'B:boss'
const BRUTE = 'B:brute'
const HAWK = 'B:hawk'
const GUARD = 'B:guard'

const W = (id: string) => `seraphon.weapon.${id}`

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
function centreRow(s: GameState, unitId: UnitId, cx: number, cz: number): void {
  const ms = unitModels(s, unitId)
  const r = Math.max(...ms.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
  const stepX = 2 * r + 0.15
  s.units[unitId].location = 'board'
  ms.forEach((m, i) => { m.pos = { x: cx + (i - (ms.length - 1) / 2) * stepX, y: 0, z: cz } })
}

// two units facing off in a row pair about 1" apart (in combat) centred on (cx, cz)
function fight(s: GameState, a: UnitId, b: UnitId, cx: number, cz: number): void {
  centreRow(s, a, cx, cz)
  centreRow(s, b, cx, cz + 2.4)
}

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'seraphon', patrolId: 'seraphon.army.sunblooded-prowlers', enhancementId: opts.enh ?? VENOM, regimentAbilityId: opts.reg ?? AEGIS }),
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
const evs = new WeakMap<EngineContext, GameEvent[]>()
const ctxFor = (s: GameState, dice: number[]): EngineContext => {
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  rngs.set(ctx, rng)
  evs.set(ctx, events)
  return ctx
}
const leftOver = (ctx: EngineContext): number[] => rngs.get(ctx)?.remaining ?? []
const eventsOf = (ctx: EngineContext): GameEvent[] => evs.get(ctx) ?? []

type Pick = (topic: string, ids: string[], p: ChooseOptionDecision) => string

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: Pick): { topics: string[]; options: string[][]; canPass: boolean[] } {
  const topics: string[] = []
  const options: string[][] = []
  const canPass: boolean[] = []
  for (let i = 0; i < 30; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return { topics, options, canPass }
    const p = ctx.state.pending as ChooseOptionDecision
    topics.push(p.context.topic)
    const ids = p.options.map((o) => o.id)
    options.push(ids)
    canPass.push(p.canPass !== false)
    const choice = pick(p.context.topic, ids, p)
    ctx.state.pending = null
    const action = choice === 'pass' ? { type: 'pass' as const, player, decisionId: p.id } : { type: 'chooseOption' as const, player, decisionId: p.id, optionId: choice }
    const rej = abilityService.handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

// use one ability once; every other offer is declined. `mode` picks an abilityMode option by id (default: the first)
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string; unit?: string } = {}) {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId) && (!opts.unit || id.endsWith(`#${opts.unit}`)))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    return opts.mode ?? ids[0]
  })
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const weapon = (s: GameState, unitId: UnitId, weaponId: string, modelIndex?: number) => {
  const model = modelIndex !== undefined ? s.units[unitId].models[modelIndex] : s.units[unitId].models.find((id) => s.models[id].weapons.includes(weaponId))!
  return weaponService.effectiveWeapon(s, model, weaponId)
}
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const targetsOf = (code: string, s: GameState, unitId: UnitId | null, player: PlayerId = 'A'): string[] =>
  (codeHooks[code].activate!.targets as unknown as (st: GameState, u: UnitId | null, p: PlayerId) => string[])(s, unitId, player)

// make the marker effects the passive control producers answer on exist (abilities.ts does this at the top of every window)
function ensure(s: GameState): void {
  const ctx = ctxFor(s, [])
  for (const h of Object.values(codeHooks)) h.ensureEffects?.(ctx)
}
const levelAt = (s: GameState, obj = 'obj-c'): { A: number; B: number } => { ensure(s); return objectiveService.levelOfControl(s, obj) }

// ---------- attacks with scripted dice ----------
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

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
  it('SER-REG every code in the Seraphon data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('SER-ARMY-1 the Sunblooded Prowlers build: Sunblood Pack general, 2 Saurus Warriors, 2 Hunters, Terrawings and the Spawn, 27 models, stats as printed', () => {
    const s = game()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(7)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(27)
    expect(s.players.A.warlordUnitId).toBe(PACK)
    expect(s.players.A.battleTraitIds).toEqual(['seraphon.ability.hidden-hunters', VENGEANCE])
    expect(s.players.A.regimentAbilityId).toBe(AEGIS)
    const st = (id: string) => s.datasheets[`seraphon.unit.${id}`].stats
    expect(st('sunblood-pack')).toMatchObject({ M: 5, W: 3, Sv: 4, OC: 1 })
    expect(st('saurus-warriors')).toMatchObject({ M: 5, W: 2, Sv: 4, OC: 1 })
    expect(st('hunters-of-huanchi')).toMatchObject({ M: 8, W: 1, Sv: 6, OC: 1 })
    expect(st('terrawings')).toMatchObject({ M: 12, W: 2, Sv: 5, OC: 1 })
    expect(st('spawn-of-chotec')).toMatchObject({ M: 5, W: 8, Sv: 5, OC: 1 })
    for (const u of mine) expect(s.datasheets[u.datasheetId].stats.ward ?? null).toBeNull()
    // the loadouts: the whole Pack swings Celestite Weapons, the Hunters carry Dartpipe + Feeble Claws, the Spawn two Companion weapons
    const loadout = (id: UnitId): string[] => unitModels(s, id).map((m) => m.weapons.map((w) => w.replace('seraphon.weapon.', '')).join('+'))
    expect(loadout(PACK)).toEqual(Array(3).fill('celestite-weapons'))
    expect(loadout(SA)).toEqual(Array(5).fill('celestite-club'))
    expect(loadout(HA)).toEqual(Array(5).fill('dartpipe+feeble-claws'))
    expect(loadout(TW)).toEqual(Array(3).fill('snapping-beaks'))
    expect(loadout(SP)).toEqual(['glob-of-flame-acid+fiery-maw'])
    // bases: 40mm Sunblood, 32mm Bodyguards, 25mm Hunters, 90x52 oval Spawn
    const base = (id: UnitId, modelKind: string) => s.models[s.units[id].models.find((m) => s.models[m].datasheetModelId === modelKind)!].base
    expect(base(PACK, 'sunblood').radius).toBeCloseTo(40 / 2 / 25.4, 2)
    expect(base(PACK, 'bodyguard').radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(base(HA, 'hunter').radius).toBeCloseTo(25 / 2 / 25.4, 2)
    expect(base(SP, 'spawn').radius).toBeCloseTo(90 / 2 / 25.4, 2)
    expect(base(SP, 'spawn').radius2).toBeCloseTo(52 / 2 / 25.4, 2)
  })

  it('SER-ARMY-2 tokens: the Sunblood Pack starts with 1 Venomites token, the Spawn of Chotec with 3 Sun Acolyte tokens', () => {
    const s = game()
    expect(s.units[PACK].tokens).toEqual({ venomites: 1 })
    expect(s.units[SP].tokens).toEqual({ 'sun-acolyte': 3 })
    for (const id of [SA, SB, HA, HB, TW]) expect(s.units[id].tokens).toEqual({})
  })

  it('SER-ARMY-3 Reinforcements only on the Terrawings; no other unit is offered for replacement', () => {
    const s = game()
    for (const id of [PACK, SA, SB, HA, HB, SP]) expect(s.datasheets[s.units[id].datasheetId].keywords).not.toContain('REINFORCEMENTS')
    expect(s.datasheets[s.units[TW].datasheetId].keywords).toContain('REINFORCEMENTS')
    for (const id of [PACK, SA, SB, HA, HB, TW, SP]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A')).toEqual([TW])
  })
})

describe('SER-BT Hidden Hunters and Vengeance of Azyr', () => {
  it('SER-BT-1 both Hunters units and the Spawn skip deployment; Chameleon Ambush only from round 3, anywhere, every model over 6" from enemies', () => {
    const s = aosState({
      players: { A: makeAosPlayer('A', { faction: 'seraphon', patrolId: 'seraphon.army.sunblooded-prowlers', enhancementId: VENOM, regimentAbilityId: AEGIS }), B: makeAosPlayer('B') },
    }, bundle())
    autoDeployAos(s, 'A')
    for (const id of [HA, HB, SP]) {
      expect(s.units[id].location, id).toBe('reserves')
      expect(s.units[id].reserveArrival).toBe('seraphon.ability.chameleon-ambush')
    }
    for (const id of [PACK, SA, SB, TW]) expect(s.units[id].location, id).toBe('board')
    const ambush = s.abilities['seraphon.ability.chameleon-ambush']
    expect(ambush.fromRound).toBe(3)
    expect(ambush.params).toMatchObject({ fromRound: 3, minEnemyDistance: 6, anywhere: true })
    // the set-up rule: anywhere on the table, but never within 6" of an enemy model
    place(s, BRUTE, -12, 0, 0.3)
    const row = (x: number, z: number) => unitModels(s, HA).map((m, i) => ({ modelId: m.id, pos: { x: x + i * 1.1, y: 0, z }, facing: 0 }))
    const params = { minEnemyDistance: 6, anywhere: true }
    expect(resolveSetUp(s, HA, row(-8, 5), params).rejection).not.toBeNull() // under 6" from the Brute
    expect(resolveSetUp(s, HA, row(-12, 3), params).rejection).not.toBeNull()
    // not just the own deployment zone: the middle of the board in B's half is fine when it is clear of enemies
    expect(resolveSetUp(s, HA, row(2, 4), params).rejection).toBeNull()
  })

  it('SER-BT-2 a Hunters / Spawn unit still in reserve at the start of round 4 is not destroyed (held back by a battle trait, core 24.1)', () => {
    const s = aosState({
      players: { A: makeAosPlayer('A', { faction: 'seraphon', patrolId: 'seraphon.army.sunblooded-prowlers', enhancementId: VENOM, regimentAbilityId: AEGIS }), B: makeAosPlayer('B') },
    }, bundle())
    autoDeployAos(s, 'A')
    autoDeployAos(s, 'B')
    s.round = 4
    const ctx = ctxFor(s, [])
    missionService.onWindow(ctx, 'round.start', '4')
    for (const id of [HA, HB, SP]) expect(s.units[id].location, id).toBe('reserves')
    expect(s.units[PACK].location).toBe('board')
    expect(of(eventsOf(ctx), 'UnitDestroyed')).toEqual([])
  })

  it('SER-BT-3 Vengeance of Azyr: end of each turn, one D6 per enemy unit in combat with a friendly Saurus unit, 4+ = 1 mortal; non-Saurus contacts do not count', () => {
    const s = game()
    // Saurus Warriors A and B both fight the Brute (one die for it), the Pack fights the Boss, the Terrawings fight the Hawk (no die)
    fight(s, SA, BRUTE, -10, -3)
    centreRow(s, SB, -10, -3 + 2.4 + 2.4) // the Brute's other flank
    fight(s, PACK, BOSS, 0, -3)
    fight(s, TW, HAWK, 9, -3)
    expect(offered(s, 'A', 'endOfTurn')).toContain(VENGEANCE)
    const before = { boss: wounds(s, BOSS), brute: wounds(s, BRUTE), hawk: wounds(s, HAWK) }
    // targets in unit id order: Boss, Brute (one die each, even though two Saurus units fight the Brute); the Guard and the Hawk fight only non-Saurus
    const ctx = ctxFor(s, [4, 3])
    s.phase = 'fight'
    useOnce(ctx, 'endOfTurn', 'A', VENGEANCE)
    expect(wounds(s, BOSS)).toBe(before.boss - 1)
    expect(wounds(s, BRUTE)).toBe(before.brute)
    expect(wounds(s, HAWK)).toBe(before.hawk)
    expect(leftOver(ctx)).toEqual([])
    // it is also offered at the end of the opponent's turn
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'endOfTurn')).toContain(VENGEANCE)
    // and not at all when no Saurus unit is in combat
    for (const id of [SA, SB, PACK]) s.units[id].location = 'reserves'
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(VENGEANCE)
  })
})

describe('SER-RA regiment abilities', () => {
  it('SER-RA-1 Scaled Aegis: once per turn, Saurus only, 3+ gives Ward (6+) until your next turn; a 1-2 gives nothing', () => {
    const s = game()
    expect(offered(s, 'A', 'hero')).toContain(AEGIS)
    expect(targetsOf('seraphonScaledAegis', s, null).sort()).toEqual([SA, SB, PACK].sort())
    const ctx = ctxFor(s, [3])
    const r = useOnce(ctx, 'hero', 'A', AEGIS, { target: SA })
    expect(r.topics).toContain('abilityTarget')
    const m = unitModels(s, SA)[0]
    expect(feelNoPainFor(ctx, m.id, {} as never)).toEqual({ threshold: 6, modifier: 0 })
    expect(feelNoPainFor(ctx, unitModels(s, SB)[0].id, {} as never)).toBeNull()
    expect(s.units[SA].effects.some((e) => e.expires.kind === 'nextOwnTurn')).toBe(true)
    // once per turn for the whole army
    expect(offered(s, 'A', 'hero')).not.toContain(AEGIS)
    // a failed roll gives nothing (and still uses the ability up)
    const s2 = game()
    const ctx2 = ctxFor(s2, [2])
    useOnce(ctx2, 'hero', 'A', AEGIS, { target: SB })
    expect(feelNoPainFor(ctx2, unitModels(s2, SB)[0].id, {} as never)).toBeNull()
    expect(offered(s2, 'A', 'hero')).not.toContain(AEGIS)
    // the ward ends when the effect does
    for (const id of [SA]) s.units[id].effects = []
    expect(feelNoPainFor(ctx, m.id, {} as never)).toBeNull()
    // the other regiment ability is not offered when Scaled Aegis is chosen
    expect(offered(s2, 'A', 'shooting')).not.toContain(FOLLOWERS)
  })

  it('SER-RA-2 Followers of Huanchi: once per turn, Skink only, 3+ gives ranged weapons Crit (Auto-wound) this turn, including the Glob of Flame Acid', () => {
    const s = game({ reg: FOLLOWERS })
    s.phase = 'shooting'
    expect(offered(s, 'A', 'shooting')).toContain(FOLLOWERS)
    expect(targetsOf('seraphonFollowersOfHuanchi', s, null).sort()).toEqual([HA, HB, SP])
    const ctx = ctxFor(s, [3])
    useOnce(ctx, 'shooting', 'A', FOLLOWERS, { target: SP })
    expect(weapon(s, SP, W('glob-of-flame-acid')).abilities.map((a) => a.ability)).toContain('CRIT_AUTO_WOUND')
    // melee weapons are untouched, and so are the other Skink units
    expect(weapon(s, SP, W('fiery-maw')).abilities.map((a) => a.ability)).not.toContain('CRIT_AUTO_WOUND')
    expect(weapon(s, HA, W('dartpipe')).abilities.map((a) => a.ability)).not.toContain('CRIT_AUTO_WOUND')
    expect(offered(s, 'A', 'shooting')).not.toContain(FOLLOWERS)
    // a failed roll gives nothing; the Hunters' Dartpipe takes the grant when it works
    const s2 = game({ reg: FOLLOWERS })
    s2.phase = 'shooting'
    useOnce(ctxFor(s2, [2]), 'shooting', 'A', FOLLOWERS, { target: HA })
    expect(weapon(s2, HA, W('dartpipe')).abilities.map((a) => a.ability)).not.toContain('CRIT_AUTO_WOUND')
    const s3 = game({ reg: FOLLOWERS })
    s3.phase = 'shooting'
    useOnce(ctxFor(s3, [6]), 'shooting', 'A', FOLLOWERS, { target: HA })
    expect(weapon(s3, HA, W('dartpipe')).abilities.map((a) => a.ability)).toContain('CRIT_AUTO_WOUND')
    // no Skink unit on the board: nothing to offer (before the ambush, a Hunters-less army cannot use it)
    for (const id of [HA, HB, SP]) s3.units[id].location = 'reserves'
    s3.activePlayer = 'B'
    s3.activePlayer = 'A'
    const s4 = game({ reg: FOLLOWERS })
    s4.phase = 'shooting'
    for (const id of [HA, HB, SP]) s4.units[id].location = 'reserves'
    expect(offered(s4, 'A', 'shooting')).not.toContain(FOLLOWERS)
  })
})

describe('SER-ENH enhancements', () => {
  it('SER-ENH-1 Instinctive Commander: 3+ lets a friendly unit wholly within 12" and not in combat make a Normal Move in the hero phase; it can still move in the movement phase', () => {
    const s = game({ enh: COMMANDER })
    centreRow(s, PACK, 0, -6)
    centreRow(s, SA, -6, -6) // beside the general: eligible
    place(s, SB, -14, -10.8) // too far
    fight(s, TW, BOSS, 7, -6) // in combat, wholly within 12" but not eligible
    expect(offered(s, 'A', 'hero')).toContain(COMMANDER_AB)
    const targets = targetsOf('seraphonInstinctiveCommander', s, PACK)
    expect(targets).toContain(SA)
    expect(targets).toContain(PACK) // the general may pick its own unit
    expect(targets).not.toContain(SB)
    expect(targets).not.toContain(TW) // in combat with the Boss
    const ctx = ctxFor(s, [3])
    const from = unitModels(s, SA).map((m) => ({ ...m.pos }))
    const r = useOnce(ctx, 'hero', 'A', COMMANDER_AB, { target: SA, mode: undefined })
    expect(r.topics).toContain('abilityMode')
    const to = unitModels(s, SA).map((m) => m.pos)
    const moved = Math.hypot(to[0].x - from[0].x, to[0].z - from[0].z)
    expect(moved).toBeGreaterThan(0)
    expect(moved).toBeLessThanOrEqual(5 + 1e-3)
    // it was not the movement phase: the unit has not made its Normal Move for the turn
    expect(s.units[SA].turn.moveType ?? null).toBeNull()
    // a failed roll moves nothing
    const s2 = game({ enh: COMMANDER })
    centreRow(s2, PACK, 0, -6); centreRow(s2, SA, -6, -6)
    const still = unitModels(s2, SA).map((m) => ({ ...m.pos }))
    const ctx2 = ctxFor(s2, [2])
    const r2 = useOnce(ctx2, 'hero', 'A', COMMANDER_AB, { target: SA })
    expect(r2.topics).not.toContain('abilityMode')
    expect(unitModels(s2, SA).map((m) => m.pos)).toEqual(still)
  })

  it('SER-ENH-2 Savage Mauling: the target makes no Ward rolls until the end of the turn', () => {
    const s = game({ enh: MAULING })
    fight(s, PACK, BOSS, 0, -3)
    s.phase = 'fight'
    const ctxW = ctxFor(s, [])
    effectService.grant(ctxW, BOSS, { feelNoPain: 5 }, { sourceAbilityId: 'test.ward', sourceUnitId: BOSS, scope: { who: 'self' }, duration: 'battle' })
    const boss = unitModels(s, BOSS)[0]
    expect(feelNoPainFor(ctxW, boss.id, {} as never)).toEqual({ threshold: 5, modifier: 0 })
    expect(offered(s, 'A', 'fight')).toContain(MAULING_AB)
    const ctx = ctxFor(s, [])
    const r = useOnce(ctx, 'fight', 'A', MAULING_AB)
    expect(r.topics[0]).toBe('abilityUse')
    expect(feelNoPainFor(ctx, boss.id, {} as never)).toBeNull()
    expect(cardWard(s, BOSS, { needed: 5, modifier: 0 })).toBeNull()
    // in a real attack no Ward dice are rolled: the 6 spare dice stay unused and all 6 damage lands
    const before = wounds(s, BOSS)
    const res = attack(s, 'melee', [6, 6, 6, 6, 6, 6, 1, 1, 1, 6, 6, 6, 6, 6, 6], PACK, W('celestite-weapons'), BOSS, 3)
    expect(wounds(s, BOSS)).toBe(before - 6)
    expect(res.rng.remaining).toEqual([6, 6, 6, 6, 6, 6])
    // it lapses at the end of the turn
    expireCardFlags(s, 'turn')
    expect(feelNoPainFor(ctx, boss.id, {} as never)).toEqual({ threshold: 5, modifier: 0 })
  })

  it('SER-ENH-3 Venomite Swarm: a D3 of 2-3 deals that much mortal damage; a 1 removes the token and later uses are not offered', () => {
    const s = game({ enh: VENOM })
    expect(offered(s, 'A', 'fight')).not.toContain(VENOM_AB) // nobody in combat
    fight(s, PACK, BRUTE, 0, -3)
    s.phase = 'fight'
    expect(offered(s, 'A', 'fight')).toContain(VENOM_AB)
    const before = wounds(s, BRUTE)
    const ctx = ctxFor(s, [5]) // D3 face 5 = 3
    useOnce(ctx, 'fight', 'A', VENOM_AB)
    expect(wounds(s, BRUTE)).toBe(before - 3)
    expect(s.units[PACK].tokens.venomites).toBe(1) // 2-3 keeps the token
    // next combat phase: roll a 1 (faces 1-2): the token goes and nothing else happens
    s.activePlayer = 'B'
    s.phaseState.marks = []
    s.units[PACK].turn.abilitiesUsedThisPhase = []
    const ctx2 = ctxFor(s, [1])
    useOnce(ctx2, 'fight', 'A', VENOM_AB)
    expect(wounds(s, BRUTE)).toBe(before - 3)
    expect(s.units[PACK].tokens.venomites).toBe(0)
    expect(of(eventsOf(ctx2), 'TokenRemoved')).toEqual([expect.objectContaining({ unitId: PACK, token: 'venomites', count: 1, remaining: 0 })])
    // with the token gone it is no longer offered
    s.activePlayer = 'A'
    s.phaseState.marks = []
    s.units[PACK].turn.abilitiesUsedThisPhase = []
    expect(offered(s, 'A', 'fight')).not.toContain(VENOM_AB)
  })

  it('SER-ENH-4 Blessed by the Old Ones: when the general is destroyed, at the end of the turn a 2+ sets up a 1-model Sunblood anywhere > 6" from enemies as the general; a 1 retries next turn end', () => {
    const s = game({ enh: BLESSED })
    place(s, BOSS, 12, 3); place(s, BRUTE, -12, 4, 0.3)
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(BLESSED_AB) // the general lives
    for (const m of unitModels(s, PACK)) removeModel(s, m.id)
    expect(s.units[PACK].location).toBe('destroyed')
    expect(offered(s, 'A', 'endOfTurn')).toContain(BLESSED_AB)
    // a 1 does nothing and the roll is used up for this turn
    s.phase = 'fight'
    const ctx1 = ctxFor(s, [1])
    const r1 = runWindow(ctx1, 'endOfTurn', 'A', (topic, ids) => (topic === 'abilityUse' ? ids.find((id) => id.startsWith(BLESSED_AB)) ?? 'pass' : ids[0]))
    expect(r1.canPass[0]).toBe(false) // mandatory
    expect(s.units[PACK].replaced).toBe(false)
    expect(s.players.A.warlordUnitId).toBe(PACK)
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(BLESSED_AB)
    // next turn end: retry; a 2+ brings the Sunblood back
    s.activePlayer = 'B'
    s.units[PACK].turn.abilitiesUsedThisPhase = []
    expect(offered(s, 'A', 'endOfTurn')).toContain(BLESSED_AB)
    const ctx2 = ctxFor(s, [2])
    runWindow(ctx2, 'endOfTurn', 'A', (topic, ids) => (topic === 'abilityUse' ? ids.find((id) => id.startsWith(BLESSED_AB)) ?? 'pass' : ids[0]))
    const copy = Object.values(s.units).find((u) => u.replacementOf === PACK)!
    expect(copy).toBeDefined()
    expect(copy.location).toBe('board')
    expect(copy.models).toHaveLength(1)
    expect(s.models[copy.models[0]].datasheetModelId).toBe('sunblood')
    expect(s.models[copy.models[0]].woundsRemaining).toBe(3)
    expect(copy.datasheetId).toBe('seraphon.unit.sunblood-pack')
    // every model more than 6" from every enemy model, wherever on the table
    for (const m of unitModels(s, copy.id)) for (const e of Object.values(s.models).filter((x) => s.units[x.unitId].player === 'B' && s.units[x.unitId].location === 'board')) {
      expect(horizontalGap(m, e), `${m.id} vs ${e.id}`).toBeGreaterThan(6)
    }
    // it is the general now
    expect(copy.isWarlord).toBe(true)
    expect(s.players.A.warlordUnitId).toBe(copy.id)
    expect(s.units[PACK].replaced).toBe(true)
    expect(s.units[PACK].isWarlord).toBe(false)
  })

  it('SER-ENH-5 the Blessed replacement cannot return again and has no enhancement', () => {
    const s = game({ enh: BLESSED })
    place(s, BOSS, 12, 3); place(s, BRUTE, -12, 4, 0.3)
    for (const m of unitModels(s, PACK)) removeModel(s, m.id)
    s.phase = 'fight'
    const ctx = ctxFor(s, [6])
    runWindow(ctx, 'endOfTurn', 'A', (topic, ids) => (topic === 'abilityUse' ? ids.find((id) => id.startsWith(BLESSED_AB)) ?? 'pass' : ids[0]))
    const copy = Object.values(s.units).find((u) => u.replacementOf === PACK)!
    expect(copy.enhancementId).toBeNull()
    expect(copy.tokens).toEqual({})
    // the new general falls too
    s.activePlayer = 'B'
    for (const m of unitModels(s, copy.id)) removeModel(s, m.id)
    expect(s.units[copy.id].location).toBe('destroyed')
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(BLESSED_AB)
    expect(codeHooks.seraphonBlessedByTheOldOnes.activate!.canUse(s, copy.id, {})).toBe(false)
    expect(codeHooks.seraphonBlessedByTheOldOnes.activate!.canUse(s, PACK, {})).toBe(false) // already replaced
    expect(Object.values(s.units).filter((u) => u.replacementOf !== null && u.player === 'A')).toHaveLength(1)
  })
})

describe('SER-AB warscroll abilities', () => {
  it('SER-AB-1 Scaled Protectors: the first damage point each phase is ignored (mortal damage too), only while the Sunblood lives', () => {
    const s = game()
    const ctx = ctxFor(s, [])
    const full = wounds(s, PACK)
    attackService.queueMortalWounds(ctx, PACK, 3, 'test', false)
    expect(wounds(s, PACK)).toBe(full - 2)
    expect(of(eventsOf(ctx), 'DamageIgnored')).toEqual([expect.objectContaining({ unitId: PACK, points: 1 })])
    // once per phase: a second pool in the same phase is not reduced
    attackService.queueMortalWounds(ctx, PACK, 2, 'test', false)
    expect(wounds(s, PACK)).toBe(full - 4)
    expect(of(eventsOf(ctx), 'DamageIgnored')).toHaveLength(1)
    // a new phase: the mark is gone, the next point is ignored again
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('ignore1:'))
    attackService.queueMortalWounds(ctx, PACK, 1, 'test', false)
    expect(wounds(s, PACK)).toBe(full - 4)
    expect(of(eventsOf(ctx), 'DamageIgnored')).toHaveLength(2)
    // the Saurus Warriors have no such rule
    attackService.queueMortalWounds(ctx, SA, 1, 'test', false)
    expect(wounds(s, SA)).toBe(9)
    // without the Sunblood the Bodyguards are plain
    const s2 = game()
    removeModel(s2, s2.units[PACK].models.find((id) => s2.models[id].datasheetModelId === 'sunblood')!)
    const ctx2 = ctxFor(s2, [])
    attackService.queueMortalWounds(ctx2, PACK, 2, 'test', false)
    expect(wounds(s2, PACK)).toBe(4)
    expect(of(eventsOf(ctx2), 'DamageIgnored')).toHaveLength(0)
  })

  it('SER-AB-2 Scaled Protectors: +1 to the unit\'s control score (once, not per model), only while the Sunblood lives', () => {
    const s = game()
    centreRow(s, PACK, 0, 0)
    expect(levelAt(s).A).toBe(4) // three models at 1 + 1
    // not per model: a lone Bodyguard beside a lone Sunblood still adds exactly 1
    const bodyguard = s.units[PACK].models.find((id) => s.models[id].datasheetModelId === 'bodyguard')!
    removeModel(s, bodyguard)
    expect(levelAt(s).A).toBe(3)
    // without the Sunblood no bonus: a Bodyguard alone is worth 1
    const s2 = game()
    centreRow(s2, PACK, 0, 0)
    for (const id of s2.units[PACK].models.filter((m) => s2.models[m].datasheetModelId === 'sunblood')) removeModel(s2, id)
    expect(levelAt(s2).A).toBe(2)
    // a Saurus Warriors unit gets nothing extra
    const s3 = game()
    centreRow(s3, SA, 0, 0)
    expect(levelAt(s3).A).toBe(5)
  })

  it('SER-AB-3 damage allocation removes both Bodyguards before the Sunblood', () => {
    const s = game()
    const sunblood = s.units[PACK].models.find((id) => s.models[id].datasheetModelId === 'sunblood')!
    const ctx = ctxFor(s, [])
    // 1 point is ignored, the other 6 are exactly the two Bodyguards (Health 3 each)
    attackService.queueMortalWounds(ctx, PACK, 7, 'test', false)
    expect(unitModels(s, PACK).map((m) => m.id)).toEqual([sunblood])
    expect(s.models[sunblood].woundsRemaining).toBe(3)
    // then the Sunblood takes it
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('ignore1:'))
    attackService.queueMortalWounds(ctx, PACK, 4, 'test', false)
    expect(s.units[PACK].location).toBe('destroyed')
  })

  it('SER-AB-4 Savage Bellow: 3+ gives a friendly unit wholly within 12" Crit (2 Hits) this turn, Companion weapons included', () => {
    const s = game()
    centreRow(s, PACK, 0, -6)
    centreRow(s, SP, 5, -6) // wholly within 12", visible
    place(s, SB, -14, -10.8) // too far from the Pack
    const targets = targetsOf('seraphonSavageBellow', s, PACK)
    expect(targets).toContain(SP)
    expect(targets).toContain(PACK) // may pick itself
    expect(targets).not.toContain(SB)
    expect(offered(s, 'A', 'hero')).toContain(BELLOW)
    const ctx = ctxFor(s, [3])
    useOnce(ctx, 'hero', 'A', BELLOW, { target: SP, unit: PACK })
    expect(weapon(s, SP, W('glob-of-flame-acid')).abilities.map((a) => a.ability)).toContain('CRIT_2_HITS')
    expect(weapon(s, SP, W('fiery-maw')).abilities.map((a) => a.ability)).toContain('CRIT_2_HITS')
    // the Pack itself is not buffed by buffing the Spawn
    expect(weapon(s, PACK, W('celestite-weapons')).abilities.map((a) => a.ability)).not.toContain('CRIT_2_HITS')
    // once per phase for this unit
    expect(offered(s, 'A', 'hero')).not.toContain(BELLOW)
    // a failed roll gives nothing; the Pack may pick itself
    const s2 = game()
    centreRow(s2, PACK, 0, -6)
    useOnce(ctxFor(s2, [2]), 'hero', 'A', BELLOW, { target: SP, unit: PACK })
    expect(weapon(s2, SP, W('fiery-maw')).abilities.map((a) => a.ability)).not.toContain('CRIT_2_HITS')
    const s3 = game()
    centreRow(s3, PACK, 0, -6)
    useOnce(ctxFor(s3, [4]), 'hero', 'A', BELLOW, { target: PACK, unit: PACK })
    expect(weapon(s3, PACK, W('celestite-weapons')).abilities.map((a) => a.ability)).toContain('CRIT_2_HITS')
  })

  it('SER-AB-5 Ordered Cohorts: +1 save only while contesting an objective you control', () => {
    // Brutes' axes: 3 attacks, 4+ to hit, 3+ to wound, Rend 1 vs the Warriors' 4+ save (5+ with the Rend, 4+ with Ordered Cohorts)
    const dice = [4, 4, 4, 3, 3, 3, 4, 4, 4]
    const run = (setup: (s: GameState) => void): number => {
      const s = game()
      centreRow(s, SA, 0, 0) // on the Centre marker
      centreRow(s, BRUTE, 0, 2.2)
      setup(s)
      const before = wounds(s, SA)
      attack(s, 'melee', dice, BRUTE, 'fx.w.brute-axe', SA, 3)
      return before - wounds(s, SA)
    }
    expect(run((s) => { s.objectives['obj-c'].controller = 'A' })).toBe(0) // saves on 4s with the +1
    expect(run((s) => { s.objectives['obj-c'].controller = 'B' })).toBe(6)
    expect(run((s) => { s.objectives['obj-c'].controller = null })).toBe(6)
    // controlling a marker the unit is not on gives nothing
    expect(run((s) => { s.objectives['obj-c'].controller = null; s.objectives['obj-w'].controller = 'A' })).toBe(6)
    // off the marker altogether, even with the marker held
    const s = game()
    centreRow(s, SA, -2, -6)
    centreRow(s, BRUTE, -2, -3.8)
    s.objectives['obj-c'].controller = 'A'
    const before = wounds(s, SA)
    attack(s, 'melee', dice, BRUTE, 'fx.w.brute-axe', SA, 3)
    expect(before - wounds(s, SA)).toBe(6)
  })

  it('SER-AB-6 Star-Venom: only an enemy damaged by this unit\'s Dartpipes this turn; 2+ = -1 to wound for its melee attacks this turn', () => {
    const s = game()
    centreRow(s, HA, 0, -4)
    centreRow(s, BRUTE, 0, 3) // 7" away, in Dartpipe range, out of combat
    s.phase = 'shooting'
    expect(offered(s, 'A', 'shooting')).not.toContain(STAR) // nobody damaged yet
    // two Dartpipe attacks: hit 3+ (3,3), wound 3+ (3,3), the Brute saves on 3+ (1,1 fails): 2 damage
    const shot = attack(s, 'ranged', [3, 3, 3, 3, 1, 1], HA, W('dartpipe'), BRUTE, 2)
    expect(shot.rng.remaining).toEqual([])
    expect(offered(s, 'A', 'shooting')).toContain(STAR)
    expect(targetsOf('seraphonStarVenom', s, HA)).toEqual([BRUTE])
    // 2+ works
    const ctx = ctxFor(s, [2])
    useOnce(ctx, 'shooting', 'A', STAR, { unit: HA })
    // the Brute now swings at a Warrior: it needs 4+ to wound instead of 3+ (the 3s fail, so no save dice are used)
    centreRow(s, BRUTE, 0, -1.6)
    centreRow(s, SB, 0, -4)
    const melee = attack(s, 'melee', [4, 4, 3, 3, 1, 1], BRUTE, 'fx.w.brute-axe', SB, 2)
    expect(melee.rng.remaining).toEqual([1, 1])
    // the debuff lapses with the turn
    effectService.expire(ctx, 'turnEnd', null)
    const again = attack(s, 'melee', [4, 4, 3, 3, 1, 1], BRUTE, 'fx.w.brute-axe', SB, 2)
    expect(again.rng.remaining).toEqual([])
    // a 1 gives nothing
    const s2 = game()
    centreRow(s2, HA, 0, -4); centreRow(s2, BRUTE, 0, 3)
    attack(s2, 'ranged', [3, 3, 3, 3, 1, 1], HA, W('dartpipe'), BRUTE, 2)
    useOnce(ctxFor(s2, [1]), 'shooting', 'A', STAR, { unit: HA })
    centreRow(s2, BRUTE, 0, -1.6); centreRow(s2, SB, 0, -4)
    expect(attack(s2, 'melee', [4, 4, 3, 3, 1, 1], BRUTE, 'fx.w.brute-axe', SB, 2).rng.remaining).toEqual([])
  })

  it('SER-AB-7 Nerve-Shredding Screeches: an enemy in combat with the Terrawings; 4+ = -1 to hit for its melee attacks this turn', () => {
    const s = game()
    fight(s, TW, GUARD, 0, -3)
    centreRow(s, SA, 9, -3) // a Warrior unit for the Guard to hit later
    s.phase = 'fight'
    expect(offered(s, 'A', 'fight')).toContain(SCREECH)
    expect(targetsOf('seraphonScreeches', s, TW)).toEqual([GUARD])
    const ctx = ctxFor(s, [4])
    useOnce(ctx, 'fight', 'A', SCREECH, { unit: TW })
    // the Guard hits on 4+ normally; with -1 it needs 5+, so the two 4s miss and no wound dice are used
    centreRow(s, GUARD, 9, -0.8)
    const hit = attack(s, 'melee', [4, 4, 4, 4, 6, 6], GUARD, 'fx.w.guard-spear', SA, 2)
    expect(hit.rng.remaining).toEqual([4, 4, 6, 6])
    // a roll of 3 fails and gives nothing
    const s2 = game()
    fight(s2, TW, GUARD, 0, -3)
    centreRow(s2, SA, 9, -3)
    s2.phase = 'fight'
    useOnce(ctxFor(s2, [3]), 'fight', 'A', SCREECH, { unit: TW })
    centreRow(s2, GUARD, 9, -0.8)
    expect(attack(s2, 'melee', [4, 4, 4, 4, 6, 6], GUARD, 'fx.w.guard-spear', SA, 2).rng.remaining).toEqual([])
    // not offered when nothing is in combat with the Terrawings
    const s3 = game()
    s3.phase = 'fight'
    expect(offered(s3, 'A', 'fight')).not.toContain(SCREECH)
  })

  it('SER-AB-8 Sun Acolytes: control score 1 + tokens (4 at full crew); 0 tokens = at most 1', () => {
    const s = game()
    centreRow(s, SP, 0, 0)
    expect(levelAt(s).A).toBe(4)
    s.units[SP].tokens['sun-acolyte'] = 1
    expect(levelAt(s).A).toBe(2)
    s.units[SP].tokens['sun-acolyte'] = 0
    expect(levelAt(s).A).toBe(1)
    // stacking with a control bonus from elsewhere cannot lift it past 1: the cap holds
    expect(hookService.unitControlScore(ctxFor(s, []), SP, 'obj-c', 5)).toBe(1)
    // tokens stay with the unit while it waits in reserve
    const s2 = game()
    s2.units[SP].location = 'reserves'
    expect(s2.units[SP].tokens['sun-acolyte']).toBe(3)
  })

  it('SER-AB-9 Sun Acolytes: each unmodified save of 1 removes a token after the Attack ability; the damage still lands; mortal damage removes none', () => {
    const s = game()
    centreRow(s, SP, 0, -2)
    centreRow(s, BRUTE, 0, 1)
    const before = wounds(s, SP)
    // 3 axe attacks hit and wound; the Spawn (Save 5+, Rend 1: 6+) rolls 1, 1 and 6: four damage lands, two tokens go
    const res = attack(s, 'melee', [4, 4, 4, 3, 3, 3, 1, 1, 6], BRUTE, 'fx.w.brute-axe', SP, 3)
    expect(before - wounds(s, SP)).toBe(4)
    expect(s.units[SP].tokens['sun-acolyte']).toBe(1)
    const removed = of(res.events, 'TokenRemoved')
    expect(removed).toEqual([expect.objectContaining({ unitId: SP, token: 'sun-acolyte', count: 2, remaining: 1 })])
    // the tokens go only once the whole Attack ability has resolved
    const idx = (type: string) => res.events.findIndex((e) => e.type === type)
    expect(idx('TokenRemoved')).toBeGreaterThan(idx('AttackSequenceEnded'))
    expect(idx('DamageApplied')).toBeLessThan(idx('AttackSequenceEnded'))
    // mortal damage has no save, so it never costs a token
    const ctx = ctxFor(s, [])
    attackService.queueMortalWounds(ctx, SP, 2, 'test', false)
    expect(s.units[SP].tokens['sun-acolyte']).toBe(1)
    // a modified 1 is not a 1: nothing here rolls an unmodified 1 above 2+ saves; an unmodified 2+ save keeps the crew
    const s2 = game()
    centreRow(s2, SP, 0, -2); centreRow(s2, BRUTE, 0, 1)
    attack(s2, 'melee', [4, 4, 4, 3, 3, 3, 2, 3, 6], BRUTE, 'fx.w.brute-axe', SP, 3)
    expect(s2.units[SP].tokens['sun-acolyte']).toBe(3)
  })
})

describe('SER-WEAP and SER-FLY', () => {
  it('SER-WEAP-1 Companion weapons ignore friendly buffs that do not name Companion (a plain +1 Attacks does not, one that names them does)', () => {
    const s = game()
    const ctx = ctxFor(s, [])
    const maw = () => weapon(s, SP, W('fiery-maw')).A
    const beaks = () => weapon(s, TW, W('snapping-beaks')).A
    expect(maw()).toBe(3)
    expect(beaks()).toBe(3)
    effectService.grant(ctx, SP, { modifyStat: { stat: 'A', value: 1 } }, { sourceAbilityId: 'test.plain', sourceUnitId: PACK, scope: { who: 'self' }, duration: 'battle' })
    effectService.grant(ctx, TW, { modifyStat: { stat: 'A', value: 1 } }, { sourceAbilityId: 'test.plain', sourceUnitId: PACK, scope: { who: 'self' }, duration: 'battle' })
    expect(maw()).toBe(3)
    expect(beaks()).toBe(3)
    effectService.grant(ctx, SP, { modifyStat: { stat: 'A', value: 1 }, affectsCompanion: true }, { sourceAbilityId: 'test.all-out', sourceUnitId: PACK, scope: { who: 'self' }, duration: 'battle' })
    expect(maw()).toBe(4)
    // a non-Companion weapon takes the plain buff
    const s2 = game()
    effectService.grant(ctxFor(s2, []), PACK, { modifyStat: { stat: 'A', value: 1 } }, { sourceAbilityId: 'test.plain', sourceUnitId: PACK, scope: { who: 'self' }, duration: 'battle' })
    expect(weapon(s2, PACK, W('celestite-weapons')).A).toBe(4)
  })

  it('SER-WEAP-2 Glob of Flame Acid deals D3+3 damage at Rend 2, range 16"', () => {
    const s = game()
    const glob = weapon(s, SP, W('glob-of-flame-acid'))
    expect([glob.range, glob.A, glob.skill, glob.wound, glob.rend, glob.D]).toEqual([16, 1, 4, 2, 2, 'D3+3'])
    // 15" away: in range. One hit (4), wounds on 2+ (2), the Brute (Save 3+, Rend 2: 5+) rolls 1, damage D3 face 4 = 2, +3 = 5
    centreRow(s, SP, 0, -9)
    centreRow(s, BRUTE, 0, 6)
    const before = wounds(s, BRUTE)
    const res = attack(s, 'ranged', [4, 2, 1, 4], SP, W('glob-of-flame-acid'), BRUTE, 1)
    expect(res.rng.remaining).toEqual([])
    expect(before - wounds(s, BRUTE)).toBe(5)
    // the Rend 2 turns the Brute's 3+ into 5+: a 4 fails
    const s2 = game()
    centreRow(s2, SP, 0, -9); centreRow(s2, BRUTE, 0, 6)
    const b2 = wounds(s2, BRUTE)
    attack(s2, 'ranged', [4, 2, 4, 6], SP, W('glob-of-flame-acid'), BRUTE, 1)
    expect(b2 - wounds(s2, BRUTE)).toBe(6)
  })

  it('SER-FLY-1 the Terrawings move over models (Fly); no other unit does', () => {
    const s = game()
    for (const [id, fly] of [[TW, true], [PACK, false], [SA, false], [HA, false], [SP, false]] as [UnitId, boolean][]) {
      expect(hookService.keywordsFor(s, id).includes('FLY'), id).toBe(fly)
    }
    // a Normal Move may not pass through an enemy combat range unless the unit can fly
    centreRow(s, GUARD, 0, -2.2)
    centreRow(s, SA, 0, -6)
    centreRow(s, TW, 0, -6)
    const walk = checkSlide(s, SA, 0, 9.5, 12, false, { normalMove: true })
    expect(walk.ok).toBe(false)
    const fly = checkSlide(s, TW, 0, 9.5, 12, false, { normalMove: true })
    expect(fly.reason ?? '').toBe('')
    expect(fly.ok).toBe(true)
  })
})

describe('SER-AI hints', () => {
  it('SER-AI-1 hints answer only seraphon codes and pick sensible targets', () => {
    const s = game({ enh: MAULING })
    centreRow(s, PACK, 0, -6); centreRow(s, SP, 3, -6)
    expect(seraphonAbilityTiming(s, 'A', 'kruleboyzWaaagh', null)).toBeNull()
    expect(seraphonTargetBonus(s, 'A', 'kruleboyzWaaagh', PACK)).toBeNull()
    // Savage Mauling only against a unit with a Ward
    fight(s, PACK, BOSS, -9, -3)
    expect(seraphonAbilityTiming(s, 'A', 'seraphonSavageMauling', null)).toBeLessThanOrEqual(-3)
    effectService.grant(ctxFor(s, []), BOSS, { feelNoPain: 5 }, { sourceAbilityId: 'test.ward', sourceUnitId: BOSS, scope: { who: 'self' }, duration: 'battle' })
    expect(seraphonAbilityTiming(s, 'A', 'seraphonSavageMauling', null)).toBeGreaterThan(-3)
    // Venomite Swarm is always worth it while the token remains
    expect(seraphonAbilityTiming(s, 'A', 'seraphonVenomiteSwarm', PACK)).toBeGreaterThan(-3)
    s.units[PACK].tokens.venomites = 0
    expect(seraphonAbilityTiming(s, 'A', 'seraphonVenomiteSwarm', PACK)).toBeLessThanOrEqual(-3)
    // Followers of Huanchi prefers the Spawn when it has a target in gun range
    centreRow(s, BRUTE, 3, -1)
    expect(seraphonTargetBonus(s, 'A', 'seraphonFollowersOfHuanchi', SP)).toBeGreaterThan(seraphonTargetBonus(s, 'A', 'seraphonFollowersOfHuanchi', HA) ?? 0)
  })
})

describe('end to end', () => {
  it('SER-E2E AI games: Chameleon Ambush arrives only from round 3, over 6" from enemies; Vengeance and the tokens behave', async () => {
    const full = await loadBundle()
    let arrivals = 0
    for (const g of [0, 1, 2, 3]) {
      const seed = `ser-${g}`
      const setup = makeSimSetup(full, g, DATA_VERSION, ['seraphon', 'cities'])
      const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
      let r = createGame(setup, seed, full)
      for (let n = 0; r.pending && n < 6000; n++) {
        const legal = legalActions(r.state, r.pending)!
        r = step(r.state, await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal))
        expect(r.rejection).toBeUndefined()
        for (const e of r.events) {
          if (e.type !== 'ReinforcementsArrived') continue
          const u = r.state.units[e.unitId]
          if (!u.reserveArrival?.startsWith('seraphon')) continue
          arrivals++
          expect(r.state.round, `game ${g}`).toBeGreaterThanOrEqual(3)
          const enemies = Object.values(r.state.models).filter((m) => r.state.units[m.unitId].player !== u.player && r.state.units[m.unitId].location === 'board')
          for (const m of unitModels(r.state, u.id)) for (const en of enemies) expect(horizontalGap(m, en), `game ${g}`).toBeGreaterThan(6 - 1e-6)
        }
      }
      expect(r.state.phase).toBe('ended')
      for (const u of Object.values(r.state.units).filter((x) => x.datasheetId === 'seraphon.unit.spawn-of-chotec')) {
        expect(u.tokens['sun-acolyte'] ?? 0).toBeGreaterThanOrEqual(0)
        expect(u.tokens['sun-acolyte'] ?? 0).toBeLessThanOrEqual(3)
      }
    }
    expect(arrivals).toBeGreaterThan(0)
  }, 240_000)
})
