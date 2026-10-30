// Lumineth Realm-lords (Hurakan Vanguard) code hooks and data: docs/spec/factions/lumineth-realm-lords.md, test ids LRL-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/lumineth files on top of the AoS fixture bundle
// (player A = Hurakan Vanguard, player B = the fixture Chaos army, or a second Hurakan Vanguard in a mirror game). Dice are
// scripted; nothing here patches the shipped data except where a test says so.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, removeModel, unitModels,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService, feelNoPainFor } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { losService } from '../../src/engine/los'
import { weaponService } from '../../src/engine/weapons'
import { whollyWithinPolygon } from '../../src/engine/geometry'
import { checkSlide } from '../../src/engine/factions/aos-moves'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { targetLegality } from '../../src/engine/phases/shooting'
import {
  EDGES, afterRideTheHurricane, closerToEdge, defaultLeeward, edgeDistanceOfPiece, edgeDistanceOfUnit, edgeRef, leewardOf, nextClockwise, rthCount,
  setLeeward, storedLeeward, type EdgeId,
} from '../../src/engine/factions/lumineth'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/lumineth/abilities.json'
import enhancementsJson from '../../src/data/factions/lumineth/enhancements.json'
import weaponsJson from '../../src/data/factions/lumineth/weapons.json'
import factionJson from '../../src/data/factions/lumineth/faction.json'
import patrolJson from '../../src/data/factions/lumineth/patrols/hurakan-vanguard.json'
import windmageJson from '../../src/data/factions/lumineth/datasheets/hurakan-windmage.json'
import windchargersJson from '../../src/data/factions/lumineth/datasheets/hurakan-windchargers.json'
import wardensJson from '../../src/data/factions/lumineth/datasheets/vanari-auralan-wardens.json'
import spiritJson from '../../src/data/factions/lumineth/datasheets/hurakan-spirit-of-the-wind.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [windmageJson, windchargersJson, wardensJson, spiritJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.lumineth = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const ID = (s: string): string => `lumineth.ability.${s}`
const STORM = ID('storm-brewing'), PULLED = ID('pulled-by-the-winds'), GALE = ID('gale-force')
const DEBRIS = ID('lifted-debris'), HEADWIND = ID('roaring-headwind')
const SCATTERED = 'lumineth.enh.scattered-to-the-winds', WHISPERER = 'lumineth.enh.wind-whisperer'
const GUARDIANS = 'lumineth.enh.temple-guardians', CURVED = 'lumineth.enh.curved-shots'
const GUIDE = ID('guide-the-gusts'), HURRICANE = ID('hurricane-winds'), LEAP = ID('leap-into-the-storm'), WALL = ID('wall-of-blades')
const WHISPER_ABILITY = ID('wind-whisperer')

const MAGE = 'A:windmage', CHARGERS = 'A:windchargers', WARDENS = 'A:wardens', SPIRIT = 'A:spirit'
const BOW = 'lumineth.weapon.windcharger-bow'
const CLAWS = 'lumineth.weapon.treerunners-claws'
const PIKE = 'lumineth.weapon.warden-pike-and-blade'
const VORTEX = 'lumineth.weapon.windblast-vortex'
const SPIRIT_BOW = 'lumineth.weapon.bow-of-the-winds-vengeance'

interface Opts { enh?: string; reg?: string; mirror?: boolean; layout?: string; patch?: (b: DataBundle) => void }

function game(opts: Opts = {}): GameState {
  const army = (enh: string, reg: string) => ({ faction: 'lumineth', patrolId: 'lumineth.army.hurakan-vanguard', enhancementId: enh, regimentAbilityId: reg })
  const s = aosState({
    ...(opts.layout ? { terrainLayoutId: opts.layout } : {}),
    players: {
      A: makeAosPlayer('A', army(opts.enh ?? SCATTERED, opts.reg ?? DEBRIS)),
      B: opts.mirror ? makeAosPlayer('B', army(opts.enh ?? SCATTERED, opts.reg ?? DEBRIS)) : makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
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
const evOf = (ctx: EngineContext): GameEvent[] => eventLogs.get(ctx) ?? []
const leftOver = (ctx: EngineContext): number[] => rngs.get(ctx)?.remaining ?? []
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const summaries = (ctx: EngineContext): string[] => of(evOf(ctx), 'AbilityTriggered').map((e) => e.summary)

// ---------- placing units ----------
const trim = (s: GameState, unitId: UnitId, n: number): void => { for (const id of [...s.units[unitId].models].slice(n)) removeModel(s, id) }
// put `n` models of the unit (default one) on the board, side by side along x from (x, z), clear of each other
function at(s: GameState, unitId: UnitId, x: number, z: number, n = 1, gap = 0.3): void {
  trim(s, unitId, n)
  const u = s.units[unitId]
  u.location = 'board'
  let cx = x
  for (const m of unitModels(s, unitId)) {
    const r = Math.max(m.base.radius, m.base.radius2 ?? 0)
    m.pos = { x: cx, y: 0, z }
    cx += 2 * r + gap
  }
}
const firstModel = (s: GameState, unitId: UnitId) => unitModels(s, unitId)[0]
const woundsLeft = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const centreOf = (s: GameState, unitId: UnitId): { x: number; z: number } => {
  const ms = unitModels(s, unitId)
  return { x: ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, z: ms.reduce((a, m) => a + m.pos.z, 0) / ms.length }
}

// ---------- ability windows ----------
type Pick = (topic: string, ids: string[], p: ChooseOptionDecision) => string

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: Pick, key?: string): { topics: string[]; options: string[][] } {
  const topics: string[] = []
  const options: string[][] = []
  for (let i = 0; i < 30; i++) {
    if (!abilityService.runWindow(ctx, window, player, key)) return { topics, options }
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

interface UseOpts { target?: string; mode?: string; move?: (ids: string[]) => string; redeploy?: (ids: string[]) => string; key?: string }
// use one ability once (the first offer that starts with `abilityId`); every other offer is declined
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: UseOpts = {}) {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    if (ids[0]?.startsWith('at:')) return opts.redeploy ? opts.redeploy(ids) : ids[0]
    if (ids[0]?.startsWith('mv:')) return opts.move ? opts.move(ids) : ids[0]
    return opts.mode ?? ids[0]
  }, opts.key)
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const targetsOf = (code: string, s: GameState, unitId: UnitId | null, player: PlayerId): UnitId[] =>
  (codeHooks[code].activate!.targets as unknown as (state: GameState, unitId: UnitId | null, player: PlayerId) => UnitId[])(s, unitId, player)
const ensure = (s: GameState, code: string): void => { codeHooks[code].ensureEffects?.(ctxFor(s)) }

// ---------- attacks with scripted dice ----------
const tgt = (modelId: string, weaponId: string, targetUnitId: string, attacks: number | null): DeclaredTarget => ({ modelId, weaponId, targetUnitId, profileGroup: null, attacks })

function attack(s: GameState, ctx: EngineContext, kind: 'melee' | 'ranged', attackerUnitId: string, weaponId: string, targetUnitId: string, attacks: number | null): GameEvent[] {
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets: [tgt(firstModel(s, attackerUnitId).id, weaponId, targetUnitId, attacks)] })
  expect(attackService.advance(ctx)).toBe('done')
  return evOf(ctx)
}

// the reaction window of a Shoot / Fight declaration, answered until it settles: Gale Force is taken whenever it is offered (when
// `gale` is true), anything else is declined. Returns whether Gale Force was used.
function reactions(ctx: EngineContext, unitId: UnitId, phase: 'shooting' | 'fight', key: string, gale = true): boolean {
  const s = ctx.state
  const before = summaries(ctx).length
  for (let i = 0; i < 10; i++) {
    if (!abilityService.runReactionWindow?.(ctx, s.units[unitId].player, { kind: 'youDeclaredAttack', unitId, phase }, key)) break
    answerReaction(ctx, (ids) => (gale ? ids.find((id) => id.startsWith(GALE)) : undefined) ?? 'pass')
  }
  return summaries(ctx).slice(before).some((t) => t.startsWith('Gale Force'))
}
// declares a Shoot / Fight attack for `unitId` like the phase modules do: begin a ranged attack first (so the targets are known),
// then the reaction window
function declare(ctx: EngineContext, kind: 'melee' | 'ranged', unitId: UnitId, weaponId: string, targetUnitId: string, attacks: number | null, key = `t:${unitId}`, gale = true): boolean {
  const s = ctx.state
  s.phase = kind === 'ranged' ? 'shooting' : 'fight'
  if (kind === 'ranged') attackService.begin(ctx, { kind, attackerUnitId: unitId, overwatch: false, targets: [tgt(firstModel(s, unitId).id, weaponId, targetUnitId, attacks)] })
  return reactions(ctx, unitId, kind === 'ranged' ? 'shooting' : 'fight', key, gale)
}
function answerReaction(ctx: EngineContext, pick: (ids: string[]) => string): void {
  const p = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const choice = pick(p.options.map((o) => o.id))
  const action = choice === 'pass' ? { type: 'pass' as const, player: p.player, decisionId: p.id } : { type: 'chooseOption' as const, player: p.player, decisionId: p.id, optionId: choice }
  expect(abilityService.handler.handle(ctx, action, p)).toBeUndefined()
}

const dieHits = (events: GameEvent[]): boolean[] => of(events, 'HitRolled').map((e) => e.hit)

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('LRL-REG every code in the Lumineth data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('LRL-ARMY-1 the Hurakan Vanguard builds: Windmage general, 5 Windchargers, 10 Wardens, the Spirit; 17 models; stats and weapons as printed', () => {
    const s = game()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(17)
    expect(s.players.A.warlordUnitId).toBe(MAGE)
    const st = (id: string) => s.datasheets[`lumineth.unit.${id}`].stats
    expect(st('hurakan-windmage')).toMatchObject({ M: 12, W: 5, Sv: 5, OC: 2 })
    expect(st('hurakan-windchargers')).toMatchObject({ M: 14, W: 3, Sv: 4, OC: 1 })
    expect(st('vanari-auralan-wardens')).toMatchObject({ M: 6, W: 1, Sv: 4, OC: 1 })
    expect(st('hurakan-spirit-of-the-wind')).toMatchObject({ M: 18, W: 8, Sv: 4, OC: 5, ward: 5 })
    expect(s.datasheets['lumineth.unit.hurakan-windmage'].keywords).toEqual(['HERO', 'WIZARD', 'INFANTRY', 'FLY'])
    expect(s.datasheets['lumineth.unit.hurakan-spirit-of-the-wind'].keywords).toEqual(['MONSTER', 'FLY'])
    expect(s.datasheets['lumineth.unit.hurakan-windchargers'].keywords).toEqual(['CAVALRY'])
    const w = (id: string) => { const x = s.weapons[`lumineth.weapon.${id}`]; return [x.kind, x.range, x.A, x.skill, x.wound, x.rend, x.D] }
    expect(w('windblast-vortex')).toEqual(['ranged', 12, 1, 2, 3, 2, 'D3'])
    expect(w('aspiragillum')).toEqual(['melee', 0, 3, 3, 4, 1, 'D3'])
    expect(w('bow-of-the-winds-vengeance')).toEqual(['ranged', 15, 4, 2, 3, 2, 2])
    expect(w('swirling-shards')).toEqual(['melee', 0, 6, 2, 4, 0, 1])
    expect(w('windcharger-bow')).toEqual(['ranged', 12, 3, 3, 4, 1, 1])
    expect(w('windcharger-blade')).toEqual(['melee', 0, 1, 4, 4, 0, 1])
    expect(w('treerunners-claws')).toEqual(['melee', 0, 2, 5, 3, 0, 1])
    expect(w('warden-pike-and-blade')).toEqual(['melee', 0, 2, 3, 4, 0, 1])
    // bases: 60x35 ovals, 32 round, 60 round
    const base = (id: UnitId) => firstModel(s, id).base
    expect(base(MAGE).radius * 2 * 25.4).toBeCloseTo(60, 0)
    expect((base(MAGE).radius2 ?? 0) * 2 * 25.4).toBeCloseTo(35, 0)
    expect(base(WARDENS).radius * 2 * 25.4).toBeCloseTo(32, 0)
    expect(base(SPIRIT).radius * 2 * 25.4).toBeCloseTo(60, 0)
    expect(base(SPIRIT).radius2).toBeUndefined()
  })

  it('LRL-ARMY-2 only the Wardens can be replaced by Call for Reinforcements', () => {
    for (const unit of [MAGE, CHARGERS, WARDENS, SPIRIT]) {
      const s = game()
      for (const id of [MAGE, CHARGERS, WARDENS, SPIRIT]) at(s, id, -10 + [MAGE, CHARGERS, WARDENS, SPIRIT].indexOf(id) * 5, -8)
      s.units[unit].location = 'destroyed'
      expect(replaceableUnits(s, 'A'), unit).toEqual(unit === WARDENS ? [WARDENS] : [])
    }
  })
})

describe('the leeward edge', () => {
  it('LRL-EDGE-1 distance and "closer than" use the closest base points; clockwise is z- > x+ > z+ > x- > z-', () => {
    expect(EDGES).toEqual(['z-', 'x+', 'z+', 'x-'])
    expect(EDGES.map(nextClockwise)).toEqual(['x+', 'z+', 'x-', 'z-'])
    expect(edgeRef('z-')).toEqual({ axis: 'z', sign: -1 })
    expect(edgeRef('x+')).toEqual({ axis: 'x', sign: 1 })
    const s = game()
    at(s, CHARGERS, 0, -8) // 60x35 oval, facing 0: the 35 mm side (0.69") faces the z edges
    const m = firstModel(s, CHARGERS)
    expect(edgeDistanceOfUnit(s, CHARGERS, 'z-')).toBeCloseTo(3 - (m.base.radius2 as number), 1)
    expect(edgeDistanceOfUnit(s, CHARGERS, 'z+')).toBeCloseTo(19 - (m.base.radius2 as number), 1)
    expect(edgeDistanceOfUnit(s, CHARGERS, 'x-')).toBeCloseTo(15 - m.base.radius, 1) // the 60 mm side faces the x edges
    m.facing = Math.PI / 2 // turned a quarter: now the long side faces the z edges
    expect(edgeDistanceOfUnit(s, CHARGERS, 'z-')).toBeCloseTo(3 - m.base.radius, 1)
    m.facing = 0
    // two units: the Wardens' nearest model decides
    at(s, WARDENS, 0, -3, 3)
    expect(closerToEdge(s, WARDENS, CHARGERS, 'z+')).toBe(true)
    expect(closerToEdge(s, CHARGERS, WARDENS, 'z-')).toBe(true)
    // level with each other: neither is closer
    at(s, WARDENS, 0, -8, 1)
    firstModel(s, WARDENS).pos.z += firstModel(s, WARDENS).base.radius - (firstModel(s, CHARGERS).base.radius2 as number)
    expect(closerToEdge(s, WARDENS, CHARGERS, 'z-')).toBe(false)
    expect(closerToEdge(s, CHARGERS, WARDENS, 'z-')).toBe(false)
    // a terrain feature's footprint
    const piece = { id: 'tf-large', kind: 'ruin', pos: { x: 0, z: 0 }, rot: 0, footprint: [{ x: -2, z: -5 }, { x: 2, z: -5 }, { x: 2, z: -3 }, { x: -2, z: -3 }], height: 4, traits: ['obscuring'], walls: [], floors: [] } as never
    expect(edgeDistanceOfPiece(s, piece, 'z-')).toBe(6)
    expect(edgeDistanceOfPiece(s, piece, 'z+')).toBe(14)
    expect(edgeDistanceOfPiece(s, piece, 'x+')).toBe(13)
  })
})

describe('LRL-BT battle traits', () => {
  it('LRL-BT-1 Storm Brewing sets the leeward edge at the start of the battle; an unset edge defaults to the long edge behind the enemy', () => {
    const s = game()
    s.phase = 'deployment'
    expect(storedLeeward(s, 'A')).toBeNull()
    expect(offered(s, 'A', 'startOfRound')).toContain(STORM)
    expect(offered(s, 'B', 'startOfRound')).not.toContain(STORM)
    expect(defaultLeeward(s, 'A')).toBe('z+') // B's territory is the z+ half
    const ctx = ctxFor(s)
    const r = useOnce(ctx, 'startOfRound', 'A', STORM, { mode: 'x+' })
    const modes = r.options.find((o) => o.includes('x+')) ?? []
    expect(modes).toEqual(['z+', 'x-', 'z-', 'x+']) // the default first, then clockwise
    expect(storedLeeward(s, 'A')).toBe('x+')
    expect(rthCount(s, 'A')).toBe(0) // picking is not a Ride the Hurricane
    expect(offered(s, 'A', 'startOfRound')).not.toContain(STORM) // once per battle
    // never picked: the first window of the battle proper fills in the default
    const t = game()
    t.phase = 'command'
    const c2 = ctxFor(t)
    expect(abilityService.runWindow(c2, 'hero', 'A')).toBe(false)
    expect(storedLeeward(t, 'A')).toBe('z+')
    expect(summaries(c2).some((x) => x.startsWith('Storm Brewing'))).toBe(true)
    // the defaulting window itself leaves a picked edge alone
    setLeeward(t, 'A', 'x-')
    abilityService.runWindow(ctxFor(t), 'hero', 'A')
    expect(storedLeeward(t, 'A')).toBe('x-')
  })

  it('LRL-BT-2 each Ride the Hurricane use turns the edge one step clockwise after it resolves; Wind Whisperer and Roaring Headwind do not', () => {
    const s = game({ enh: WHISPERER, reg: HEADWIND })
    setLeeward(s, 'A', 'z-')
    const ctx = ctxFor(s)
    const use = { abilityId: PULLED, unitId: null, player: 'A' as const }
    const seen: EdgeId[] = []
    for (let i = 0; i < 5; i++) { afterRideTheHurricane(ctx, use); seen.push(leewardOf(s, 'A')) }
    expect(seen).toEqual(['x+', 'z+', 'x-', 'z-', 'x+'])
    expect(rthCount(s, 'A')).toBe(5)
    s.round = 2
    expect(rthCount(s, 'A')).toBe(0) // the count is per battle round
    afterRideTheHurricane(ctx, use)
    expect(rthCount(s, 'A')).toBe(1)
    // Wind Whisperer (any hero phase) and Roaring Headwind (enemy hero phase) leave the edge and the count alone
    setLeeward(s, 'A', 'x-')
    at(s, MAGE, 0, -8); at(s, 'B:brute', 0, 8)
    const before = rthCount(s, 'A')
    useOnce(ctxFor(s), 'hero', 'A', WHISPER_ABILITY, { mode: 'z-' })
    expect(leewardOf(s, 'A')).toBe('z-')
    s.activePlayer = 'B'
    useOnce(ctxFor(s), 'hero', 'A', HEADWIND, { target: 'B:brute' })
    expect(leewardOf(s, 'A')).toBe('z-')
    expect(rthCount(s, 'A')).toBe(before)
    // Lifted Debris, Gale Force, Pulled by the Winds and Leap into the Storm carry the Ride the Hurricane marker in their data
    for (const id of [PULLED, GALE, DEBRIS, LEAP]) expect((abilitiesJson as unknown as AbilityDescriptor[]).find((a) => a.id === id)?.params?.rideTheHurricane, id).toBe(true)
  })

  it('LRL-BT-3 Pulled by the Winds: once per turn (army) in either movement phase, a unit not in combat, up to D6", closer to leeward, may cross but not end in combat', () => {
    const s = game()
    s.phase = 'movement'
    setLeeward(s, 'A', 'z+')
    at(s, WARDENS, 0, -6, 1)
    at(s, MAGE, -10, -8)
    at(s, 'B:guard', 4, -3, 1) // its 3" bubble reaches the path of the Wardens but neither their start nor their end spot
    expect(offered(s, 'A', 'movement')).toContain(PULLED)
    expect(offered(s, 'B', 'movement')).not.toContain(PULLED)
    // either player's movement phase
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'movement')).toContain(PULLED)
    s.activePlayer = 'A'
    // not in combat: a unit with an enemy inside 3" is not a target
    at(s, CHARGERS, 8, -3.5)
    expect(losService.unitInCombat(s, CHARGERS)).toBe(true)
    expect(targetsOf('luminethPulledByTheWinds', s, null, 'A')).not.toContain(CHARGERS)
    expect(targetsOf('luminethPulledByTheWinds', s, null, 'A')).toContain(WARDENS)
    // the slide checks: closer to the edge only, never ending in combat
    const opts = { towardEdge: edgeRef('z+'), mayNotEndInCombat: true, passThrough: true }
    expect(checkSlide(s, WARDENS, 0, 6, 6, false, opts).ok).toBe(true) // crosses the guard's bubble, ends clear of it
    expect(checkSlide(s, WARDENS, 0, -3, 6, false, opts).ok).toBe(false)
    expect(checkSlide(s, WARDENS, 4, 0, 6, false, opts).ok).toBe(false) // sideways is not closer
    at(s, 'B:guard', 1, 1.5, 1)
    expect(checkSlide(s, WARDENS, 0, 5, 6, false, opts).ok).toBe(false) // would end in combat
    at(s, 'B:guard', 4, -3, 1)
    // the real use: a 6 allows a 6" move, the first option runs toward the leeward edge; the edge then turns
    const ctx = ctxFor(s, [6])
    const start = centreOf(s, WARDENS)
    const r = useOnce(ctx, 'movement', 'A', PULLED, { target: WARDENS })
    expect(r.topics).toContain('abilityMode')
    const end = centreOf(s, WARDENS)
    expect(end.z - start.z).toBeGreaterThan(5)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThanOrEqual(6 + 1e-6)
    expect(losService.unitInCombat(s, WARDENS)).toBe(false)
    expect(leewardOf(s, 'A')).toBe('x-')
    expect(rthCount(s, 'A')).toBe(1)
    // it is not a Normal Move, Run or Retreat
    expect(s.units[WARDENS].turn.moveType).not.toBe('normal')
    expect(s.units[WARDENS].turn.moveType).not.toBe('advance')
    expect(s.units[WARDENS].turn.moveType).not.toBe('fallBack')
    // once per turn for the army
    expect(offered(s, 'A', 'movement')).not.toContain(PULLED)
    s.activePlayer = 'B' // the opponent's turn is a new turn: the army may use it again
    expect(offered(s, 'A', 'movement')).toContain(PULLED)
    s.activePlayer = 'A'
    s.round = 2
    expect(offered(s, 'A', 'movement')).toContain(PULLED)
  })

  it('LRL-BT-4 Gale Force: +1 to hit only against targets closer to the snapshotted leeward edge; once per turn; offered on Shoot and Fight', () => {
    // --- a Shoot: the Windcharger (z -5) shoots a Brute (z 3); leeward z+ makes the Brute the closer one ---
    const s = game()
    setLeeward(s, 'A', 'z+')
    at(s, CHARGERS, 0, -5)
    at(s, 'B:brute', 0, 3)
    const ctx = ctxFor(s, [2, 2, 2, 1, 1, 1])
    expect(declare(ctx, 'ranged', CHARGERS, BOW, 'B:brute', null)).toBe(true)
    // the edge turned right away (z+ -> x-), but the comparison keeps the snapshot: still +1 against the Brute
    expect(leewardOf(s, 'A')).toBe('x-')
    expect(rthCount(s, 'A')).toBe(1)
    expect(offered(s, 'A', 'attackDeclared')).not.toContain(GALE) // once per turn (army)
    expect(attackService.advance(ctx)).toBe('done')
    expect(of(evOf(ctx), 'HitRolled').map((e) => [e.die, e.final, e.hit])).toEqual([[2, 3, true], [2, 3, true], [2, 3, true]]) // 2s hit on 3+ thanks to the +1
    // --- the same shot without Gale Force: 2s miss ---
    const plain = game()
    setLeeward(plain, 'A', 'z+')
    at(plain, CHARGERS, 0, -5); at(plain, 'B:brute', 0, 3)
    plain.phase = 'shooting'
    expect(dieHits(attack(plain, ctxFor(plain, [2, 2, 2]), 'ranged', CHARGERS, BOW, 'B:brute', null))).toEqual([false, false, false])
    // --- a target that is NOT closer to the leeward edge: not offered ---
    const away = game()
    setLeeward(away, 'A', 'z-')
    at(away, CHARGERS, 0, -5); at(away, 'B:brute', 0, 3)
    const ac = ctxFor(away)
    expect(declare(ac, 'ranged', CHARGERS, BOW, 'B:brute', null)).toBe(false)
    expect(away.pending).toBeNull()
    expect(rthCount(away, 'A')).toBe(0)
    expect(leewardOf(away, 'A')).toBe('z-')
    // --- a Fight: the Wardens (z -5) against a Brute 2" away on the leeward side ---
    const f = game()
    setLeeward(f, 'A', 'z+')
    at(f, WARDENS, 0, -5, 1)
    at(f, 'B:brute', 0, -2, 1)
    const fc = ctxFor(f, [2, 2, 1, 1])
    expect(declare(fc, 'melee', WARDENS, PIKE, 'B:brute', 2)).toBe(true)
    expect(of(attack(f, fc, 'melee', WARDENS, PIKE, 'B:brute', 2), 'HitRolled').map((e) => [e.die, e.final, e.hit])).toEqual([[2, 3, true], [2, 3, true]])
    // --- a Brute behind the Wardens is further from z+: not offered ---
    const g = game()
    setLeeward(g, 'A', 'z+')
    at(g, WARDENS, 0, -5, 1); at(g, 'B:brute', 0, -8, 1)
    expect(declare(ctxFor(g), 'melee', WARDENS, PIKE, 'B:brute', 2)).toBe(false)
    // --- a second declaration (another activation) does not inherit the bonus ---
    const t = game()
    setLeeward(t, 'A', 'z+')
    at(t, CHARGERS, 0, -5); at(t, 'B:brute', 0, 3)
    const tc = ctxFor(t, [2, 2, 2, 1, 1, 1])
    expect(declare(tc, 'ranged', CHARGERS, BOW, 'B:brute', null, 'first')).toBe(true)
    abilityService.runReactionWindow?.(tc, 'A', { kind: 'youDeclaredAttack', unitId: WARDENS, phase: 'shooting' }, 'second') // seq 2: another activation
    expect(attackService.advance(tc)).toBe('done')
    expect(of(evOf(tc), 'HitRolled').map((e) => e.final)).toEqual([2, 2, 2]) // no bonus: the grant belonged to activation 1
    // --- Shoot and Fight alike: the reaction timing is the attack-declared keyword ---
    expect(s.abilities[GALE].timing).toEqual({ kind: 'reaction', trigger: 'youDeclared', keyword: 'ATTACK' })
  })
})

describe('LRL-RA regiment abilities', () => {
  const featureGame = (opts: Opts = {}): GameState => {
    const s = game(opts)
    s.board = { ...s.board, pieces: { ...s.board.pieces, 'tf-a-large': { id: 'tf-a-large', kind: 'ruin', pos: { x: -5, z: -5.5 }, rot: 0, footprint: [{ x: -7.5, z: -7 }, { x: -2.5, z: -7 }, { x: -2.5, z: -4 }, { x: -7.5, z: -4 }], height: 4, traits: ['cover', 'obscuring'], walls: [], floors: [] } as never } }
    setLeeward(s, 'A', 'z+')
    return s
  }

  it('LRL-RA-1 Lifted Debris: only enemies closer to leeward than your large feature; dice = battle round; each 3+ is 1 mortal damage; ward applies', () => {
    const s = featureGame({ patch: (b) => { b.datasheets['fx.brute'].stats.ward = 4 } })
    s.round = 3
    at(s, MAGE, -10, -8)
    at(s, 'B:brute', 0, 3, 1) // distance to z+ is about 8, the feature is 15 away
    at(s, 'B:guard', 10, -9.5, 1) // 20 away: behind the feature
    expect(targetsOf('luminethLiftedDebris', s, null, 'A')).toEqual(['B:brute'])
    expect(offered(s, 'A', 'hero')).toContain(DEBRIS)
    const before = woundsLeft(s, 'B:brute')
    // 3 dice (round 3): 3, 2, 6 -> two 3+; the ward (4+) rolls 5 and 1 -> one point is saved
    const ctx = ctxFor(s, [3, 2, 6, 5, 1])
    useOnce(ctx, 'hero', 'A', DEBRIS)
    expect(before - woundsLeft(s, 'B:brute')).toBe(1)
    expect(leftOver(ctx)).toEqual([])
    expect(summaries(ctx).some((t) => t.startsWith('Lifted Debris: 3 dice, 2 at 3+'))).toBe(true)
    expect(leewardOf(s, 'A')).toBe('x-') // Ride the Hurricane: turned
    // the round number is the dice count
    const r1 = featureGame()
    r1.round = 1
    at(r1, MAGE, -10, -8); at(r1, 'B:brute', 0, 3, 1)
    const c1 = ctxFor(r1, [6])
    useOnce(c1, 'hero', 'A', DEBRIS)
    expect(leftOver(c1)).toEqual([])
    expect(3 - woundsLeft(r1, 'B:brute')).toBe(1)
    // once per turn (army), only in your own hero phase, and not at all without a large feature in your territory
    expect(offered(r1, 'A', 'hero')).not.toContain(DEBRIS)
    r1.activePlayer = 'B'
    r1.round = 2
    expect(offered(r1, 'A', 'hero')).not.toContain(DEBRIS)
    const bare = game()
    setLeeward(bare, 'A', 'z+')
    at(bare, MAGE, -10, -8); at(bare, 'B:brute', 0, 3, 1)
    expect(offered(bare, 'A', 'hero')).not.toContain(DEBRIS)
    // and no enemy closer to leeward than the feature: no target
    const far = featureGame()
    at(far, MAGE, -10, -8); at(far, 'B:brute', 0, -9, 1)
    expect(offered(far, 'A', 'hero')).not.toContain(DEBRIS)
  })

  it('LRL-RA-2 Roaring Headwind: once per battle in the enemy hero phase; every move of the target must end closer to your current leeward edge; pile-in is unaffected', () => {
    const s = game({ reg: HEADWIND })
    setLeeward(s, 'A', 'z+')
    at(s, MAGE, -10, -8); at(s, 'B:brute', 0, 0, 1)
    expect(offered(s, 'A', 'hero')).not.toContain(HEADWIND) // my own hero phase
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'hero')).toContain(HEADWIND)
    expect(offered(s, 'B', 'hero')).not.toContain(HEADWIND)
    expect(hookService.moveEdgeConstraintFor(s, 'B:brute')).toBeNull()
    useOnce(ctxFor(s), 'hero', 'A', HEADWIND, { target: 'B:brute' })
    expect(hookService.moveEdgeConstraintFor(s, 'B:brute')).toEqual({ axis: 'z', sign: 1 })
    // moves: toward the z+ edge is fine, away from it is not (slides, charge and movement share the one constraint)
    expect(checkSlide(s, 'B:brute', 0, 2, 3, false).ok).toBe(true)
    expect(checkSlide(s, 'B:brute', 0, -2, 3, false).ok).toBe(false)
    expect(checkSlide(s, 'B:brute', 2, 0, 3, false).ok).toBe(false)
    // read live: when the caster's edge turns, so does the constraint
    setLeeward(s, 'A', 'z-')
    expect(hookService.moveEdgeConstraintFor(s, 'B:brute')).toEqual({ axis: 'z', sign: -1 })
    expect(checkSlide(s, 'B:brute', 0, -2, 3, false).ok).toBe(true)
    // only the target, only this turn
    expect(hookService.moveEdgeConstraintFor(s, 'B:guard')).toBeNull()
    expect(hookService.moveEdgeConstraintFor(s, MAGE)).toBeNull()
    // once per battle
    s.round = 2
    expect(offered(s, 'A', 'hero')).not.toContain(HEADWIND)
    effectService.expire(ctxFor(s), 'turnEnd', null)
    expect(hookService.moveEdgeConstraintFor(s, 'B:brute')).toBeNull()
    // the constraint is a move rule only: pile-in has no such constraint (a rule of the data, not of the engine, so read the descriptor)
    expect(s.abilities[HEADWIND].text).toMatch(/Pile-in is not a Move/)
  })
})

describe('LRL-ENH enhancements', () => {
  it('LRL-ENH-1 Scattered to the Winds: -1 control per Ride the Hurricane use this round for enemies within 6" of the general, floor 1, resets next round', () => {
    const s = game({ enh: SCATTERED })
    at(s, MAGE, 0, -5)
    at(s, 'B:brute', 0, -1, 1)
    at(s, 'B:boss', 8, 6, 1)
    ensure(s, 'luminethScatteredToTheWinds')
    const ctx = ctxFor(s)
    const score = (unit: UnitId, base: number) => hookService.unitControlScore(ctx, unit, Object.keys(s.objectives)[0], base)
    expect(score('B:brute', 3)).toBe(3)
    const use = { abilityId: PULLED, unitId: null, player: 'A' as const }
    afterRideTheHurricane(ctx, use)
    expect(score('B:brute', 3)).toBe(2)
    afterRideTheHurricane(ctx, use)
    expect(score('B:brute', 3)).toBe(1)
    expect(score('B:boss', 3)).toBe(3) // further than 6"
    for (let i = 0; i < 3; i++) afterRideTheHurricane(ctx, use)
    expect(score('B:brute', 3)).toBe(1) // the floor
    expect(score(MAGE, 2)).toBe(2) // friends are never reduced
    s.round = 2
    expect(score('B:brute', 3)).toBe(3) // a new round: the count starts again
    afterRideTheHurricane(ctx, use)
    expect(score('B:brute', 3)).toBe(2)
    // the opponent's uses do not count for me
    expect(rthCount(s, 'B')).toBe(0)
  })

  it('LRL-ENH-2 Wind Whisperer: once per battle, any hero phase, sets any other edge, no rotation', () => {
    const s = game({ enh: WHISPERER })
    at(s, MAGE, 0, -8)
    setLeeward(s, 'A', 'z+') // the default: nothing to correct
    expect(offered(s, 'A', 'hero')).not.toContain(WHISPER_ABILITY)
    setLeeward(s, 'A', 'x+')
    expect(offered(s, 'A', 'hero')).toContain(WHISPER_ABILITY)
    s.activePlayer = 'B' // the enemy's hero phase counts too
    expect(offered(s, 'A', 'hero')).toContain(WHISPER_ABILITY)
    s.activePlayer = 'A'
    const r = useOnce(ctxFor(s), 'hero', 'A', WHISPER_ABILITY)
    const modes = r.options.find((o) => o.includes('z+')) ?? []
    expect(modes).toEqual(['z+', 'x-', 'z-']) // the current edge is not offered; the default comes first
    expect(leewardOf(s, 'A')).toBe('z+')
    expect(rthCount(s, 'A')).toBe(0)
    setLeeward(s, 'A', 'x+')
    expect(offered(s, 'A', 'hero')).not.toContain(WHISPER_ABILITY) // once per battle
    // any edge can be picked
    const t = game({ enh: WHISPERER })
    at(t, MAGE, 0, -8)
    setLeeward(t, 'A', 'x-')
    useOnce(ctxFor(t), 'hero', 'A', WHISPER_ABILITY, { mode: 'z-' })
    expect(leewardOf(t, 'A')).toBe('z-')
  })

  it('LRL-ENH-3 Temple Guardians: Ward (5+) for the general and Infantry within 3" only while another friendly Infantry unit is within 3"', () => {
    const s = game({ enh: GUARDIANS })
    const ward = (id: UnitId): number | null => feelNoPainFor(ctxFor(s), firstModel(s, id).id, {} as never)?.threshold ?? null
    at(s, MAGE, 0, -5)
    at(s, WARDENS, 3.5, -5, 2) // 3.5" centre to centre: well inside 3" edge to edge
    at(s, CHARGERS, -3.5, -5) // Cavalry within 3": not Infantry
    expect(ward(MAGE)).toBe(5)
    expect(ward(WARDENS)).toBe(5)
    expect(ward(CHARGERS)).toBeNull()
    expect(ward('B:brute')).toBeNull()
    // the general does not count itself: with no other Infantry unit near, nobody has it
    at(s, WARDENS, 9, -5, 2)
    expect(ward(MAGE)).toBeNull()
    expect(ward(WARDENS)).toBeNull()
    // an Infantry unit that is within 3" of the general only through one of its models still gets it
    at(s, WARDENS, 3.2, -5, 2)
    at(s, 'B:brute', 20, 5)
    expect(ward(WARDENS)).toBe(5)
    // the other enhancements do not give it
    const t = game({ enh: SCATTERED })
    at(t, MAGE, 0, -5); at(t, WARDENS, 3.5, -5, 2)
    expect(feelNoPainFor(ctxFor(t), firstModel(t, MAGE).id, {} as never)).toBeNull()
  })

  it('LRL-ENH-4 Curved Shots: the general may target an enemy in range and visible from the leeward edge but not from itself', () => {
    const s = game({ enh: CURVED })
    setLeeward(s, 'A', 'z+')
    at(s, MAGE, 0, -5)
    at(s, 'B:guard', 0, 9, 1) // 14" from the Windmage (range 12), 2" from the z+ edge
    const m = firstModel(s, MAGE)
    const vortex = weaponService.effectiveWeapon(s, m.id, VORTEX)
    expect(targetLegality(s, MAGE, m.id, vortex, 'B:guard')).toBeNull()
    // the edge turns away: the Guard is no longer within 12" of the x- edge
    setLeeward(s, 'A', 'x-')
    expect(targetLegality(s, MAGE, m.id, vortex, 'B:guard')?.code).toBe('E_NOT_IN_RANGE')
    // other units do not get the extra origins
    setLeeward(s, 'A', 'z+')
    at(s, CHARGERS, 0, -5)
    const bow = weaponService.effectiveWeapon(s, firstModel(s, CHARGERS).id, BOW)
    expect(targetLegality(s, CHARGERS, firstModel(s, CHARGERS).id, bow, 'B:guard')?.code).toBe('E_NOT_IN_RANGE')
    // and without the enhancement even the general does not
    const t = game({ enh: SCATTERED })
    setLeeward(t, 'A', 'z+')
    at(t, MAGE, 0, -5); at(t, 'B:guard', 0, 9, 1)
    expect(targetLegality(t, MAGE, firstModel(t, MAGE).id, weaponService.effectiveWeapon(t, firstModel(t, MAGE).id, VORTEX), 'B:guard')?.code).toBe('E_NOT_IN_RANGE')
  })
})

describe('LRL-AB warscroll abilities', () => {
  it('LRL-AB-1 Guide the Gusts: casting 6+ lets the target Retreat then Shoot/Charge with no retreat damage; fails below 6; miscast on double 1', () => {
    const base = (): GameState => {
      const s = game()
      at(s, MAGE, 0, -7)
      at(s, WARDENS, 3, -7, 3)
      at(s, 'B:brute', 7, -4, 1) // in combat with the Wardens (the third model), well clear of the Windmage
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'hero')).toContain(GUIDE)
    expect(targetsOf('luminethGuideTheGusts', s, MAGE, 'A')).toEqual([WARDENS])
    const ctx = ctxFor(s, [3, 3])
    useOnce(ctx, 'hero', 'A', GUIDE, { target: WARDENS })
    expect(summaries(ctx).some((t) => t.startsWith('Guide the Gusts:') && !t.includes('casting roll'))).toBe(true)
    expect(hookService.unitHasEffectFlag(s, WARDENS, 'noRetreatDamage')).toBe(true)
    s.units[WARDENS].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor(s, WARDENS, 'shoot')).toBe(true)
    expect(hookService.eligibilityFor(s, WARDENS, 'charge')).toBe(true)
    expect(hookService.unitHasEffectFlag(s, 'B:brute', 'noRetreatDamage')).toBe(false)
    // one spell per phase for a Wizard (1): not offered again
    expect(offered(s, 'A', 'hero')).not.toContain(GUIDE)
    // casting roll of 5: the spell fails, nothing changes, the attempt is spent
    const t = base()
    const c2 = ctxFor(t, [2, 3])
    useOnce(c2, 'hero', 'A', GUIDE, { target: WARDENS })
    expect(summaries(c2).some((x) => x.includes('casting roll 5, not cast'))).toBe(true)
    expect(hookService.unitHasEffectFlag(t, WARDENS, 'noRetreatDamage')).toBe(false)
    expect(offered(t, 'A', 'hero')).not.toContain(GUIDE)
    // double 1: miscast, D3 mortal damage to the Windmage
    const u = base()
    const c3 = ctxFor(u, [1, 1, 4])
    useOnce(c3, 'hero', 'A', GUIDE, { target: WARDENS })
    expect(woundsLeft(u, MAGE)).toBe(3)
    expect(hookService.unitHasEffectFlag(u, WARDENS, 'noRetreatDamage')).toBe(false)
    // the target must be a visible friendly unit wholly within 12" of the Windmage that is in combat; the Windmage may pick itself
    at(u, WARDENS, 12, -7, 3) // in combat, but only partly within 12" of the Windmage
    at(u, 'B:brute', 13, -4, 1)
    u.phase = 'command'
    expect(targetsOf('luminethGuideTheGusts', u, MAGE, 'A')).toEqual([])
    at(u, WARDENS, 3, -7, 3)
    at(u, 'B:brute', 0, -4, 1) // in combat with both the Windmage and the Wardens
    expect(targetsOf('luminethGuideTheGusts', u, MAGE, 'A').sort()).toEqual([MAGE, WARDENS].sort())
    // an enemy Wizard within 30" can unbind it
    const v = game({ patch: (b) => { b.datasheets['fx.boss'].keywords = ['HERO', 'INFANTRY', 'WIZARD']; b.datasheets['fx.boss'].wizard = 1 } })
    at(v, MAGE, 0, -7); at(v, WARDENS, 3, -7, 3); at(v, 'B:brute', 3, -4, 1); at(v, 'B:boss', 0, 8)
    const c4 = ctxFor(v, [3, 3, 6, 6])
    useOnce(c4, 'hero', 'A', GUIDE, { target: WARDENS })
    expect(hookService.unitHasEffectFlag(v, WARDENS, 'noRetreatDamage')).toBe(false)
    expect(summaries(c4).some((x) => x.includes('unbound'))).toBe(true)
  })

  it('LRL-AB-2 Eye of the Storm: -1 to hit for attacks on friendly units wholly within 6" of the Spirit (itself included), not for units only partly within', () => {
    const swing = (s: GameState, tgt: UnitId, die: number): { final: number; hit: boolean } => {
      s.phase = 'fight'
      const hit = of(attack(s, ctxFor(s, [die, 1, 1]), 'melee', 'B:brute', 'fx.w.brute-axe', tgt, 1), 'HitRolled')[0]
      return { final: hit.final, hit: hit.hit }
    }
    const s = game()
    at(s, SPIRIT, 0, -6)
    at(s, WARDENS, 3, -9, 2) // both Wardens wholly within 6" of the Spirit
    at(s, 'B:brute', 3, -6.2, 1)
    ensure(s, 'luminethEyeOfTheStorm')
    // the Brute hits on 4+: a 4 becomes a 3 against a protected unit, the Spirit itself included
    expect(swing(s, WARDENS, 4)).toEqual({ final: 3, hit: false })
    expect(swing(s, SPIRIT, 4)).toEqual({ final: 3, hit: false })
    expect(swing(s, WARDENS, 5)).toEqual({ final: 4, hit: true })
    // one Warden beyond 6": the unit is only partly within, no penalty
    const t = game()
    at(t, SPIRIT, 0, -6)
    at(t, WARDENS, 3, -9, 2)
    unitModels(t, WARDENS)[1].pos = { x: 10.5, y: 0, z: -6 }
    at(t, 'B:brute', 10.5, -3.1, 1)
    ensure(t, 'luminethEyeOfTheStorm')
    expect(swing(t, WARDENS, 4)).toEqual({ final: 4, hit: true })
    // it protects the Spirit's side only: the Wardens' own attacks on a Brute beside the Spirit are not penalised
    const u = game()
    at(u, SPIRIT, 0, -6); at(u, 'B:brute', 3, -6, 1); at(u, WARDENS, 6, -6, 1)
    ensure(u, 'luminethEyeOfTheStorm')
    u.phase = 'fight'
    expect(of(attack(u, ctxFor(u, [3, 1, 1]), 'melee', WARDENS, PIKE, 'B:brute', 1), 'HitRolled')[0].final).toBe(3)
    // a slain Spirit protects nobody
    const v = game()
    at(v, SPIRIT, 0, -6); at(v, WARDENS, 3, -9, 2); at(v, 'B:brute', 3, -6.2, 1)
    ensure(v, 'luminethEyeOfTheStorm')
    v.units[SPIRIT].location = 'destroyed'
    expect(swing(v, WARDENS, 4)).toEqual({ final: 4, hit: true })
    // a Gale Force +1 and an Eye of the Storm -1 cancel, and the cap keeps any total at +-1 (mirror: B's Spirit guards B's Wardens)
    const m = game({ mirror: true })
    setLeeward(m, 'A', 'z+')
    at(m, 'B:spirit', 0, 3); at(m, 'B:wardens', 3, 1.5, 1); at(m, WARDENS, 3, -1.5, 1)
    ensure(m, 'luminethEyeOfTheStorm')
    const mc = ctxFor(m, [3, 1, 1])
    expect(declare(mc, 'melee', WARDENS, PIKE, 'B:wardens', 1)).toBe(true)
    expect(of(attack(m, mc, 'melee', WARDENS, PIKE, 'B:wardens', 1), 'HitRolled')[0].final).toBe(3) // 3 + 1 - 1
  })

  it('LRL-AB-3 Hurricane Winds: only a unit this Spirit damaged by shooting this turn; 3+ gives Strike-last until end of turn', () => {
    const shoot = (dice: number[]): { s: GameState; ctx: EngineContext } => {
      const s = game()
      at(s, SPIRIT, 0, -8)
      at(s, 'B:brute', 0, 0, 3) // 9 Health in three models: it survives the volley
      at(s, 'B:guard', 8, 0, 1)
      s.phase = 'shooting'
      const ctx = ctxFor(s, dice)
      return { s, ctx }
    }
    // nothing shot yet: not offered
    const a = shoot([])
    expect(offered(a.s, 'A', 'shooting')).not.toContain(HURRICANE)
    // 4 attacks: all hit, all wound, all failed saves -> damage; then the ability's own D6
    const { s, ctx } = shoot([6, 6, 6, 6, 6, 6, 6, 6, 1, 1, 1, 1, 4])
    attack(s, ctx, 'ranged', SPIRIT, SPIRIT_BOW, 'B:brute', null)
    expect(woundsLeft(s, 'B:brute')).toBeLessThan(9)
    expect(offered(s, 'A', 'shooting')).toContain(HURRICANE)
    expect(targetsOf('luminethHurricaneWinds', s, SPIRIT, 'A')).toEqual(['B:brute']) // the Guard was not shot at
    useOnce(ctx, 'shooting', 'A', HURRICANE)
    expect(s.units['B:brute'].turn.fightsLast).toBe(true)
    expect(s.units['B:guard'].turn.fightsLast).toBe(false)
    // a roll of 2 does nothing
    const b = shoot([6, 6, 6, 6, 6, 6, 6, 6, 1, 1, 1, 1, 2])
    attack(b.s, b.ctx, 'ranged', SPIRIT, SPIRIT_BOW, 'B:brute', null)
    useOnce(b.ctx, 'shooting', 'A', HURRICANE)
    expect(b.s.units['B:brute'].turn.fightsLast).toBe(false)
    // every attack saved: no damage was allocated, so the unit is not a target
    const saved = shoot([6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6])
    attack(saved.s, saved.ctx, 'ranged', SPIRIT, SPIRIT_BOW, 'B:brute', null)
    expect(woundsLeft(saved.s, 'B:brute')).toBe(9)
    expect(offered(saved.s, 'A', 'shooting')).not.toContain(HURRICANE)
    // either player's shooting phase (data)
    expect(s.abilities[HURRICANE].timing).toEqual({ kind: 'phase', phase: 'shooting', whose: 'any' })
  })

  it('LRL-AB-4 Leap into the Storm: end of your turn, not in combat, set up wholly within 3" of the leeward edge and more than 6" from enemies; turns the edge', () => {
    const s = game()
    setLeeward(s, 'A', 'z-')
    at(s, CHARGERS, -6, 4, 5, 0.12)
    at(s, 'B:boss', -13, 9)
    expect(offered(s, 'A', 'endOfTurn')).toContain(LEAP)
    expect(offered(s, 'B', 'endOfTurn')).not.toContain(LEAP)
    const ctx = ctxFor(s)
    useOnce(ctx, 'endOfTurn', 'A', LEAP)
    expect(leewardOf(s, 'A')).toBe('x+') // Ride the Hurricane: z- turns to x+
    expect(rthCount(s, 'A')).toBe(1)
    expect(s.units[CHARGERS].location).toBe('board')
    const strip = [{ x: -15, z: -11 }, { x: 15, z: -11 }, { x: 15, z: -8 }, { x: -15, z: -8 }]
    for (const m of unitModels(s, CHARGERS)) expect(whollyWithinPolygon(m, strip)).toBe(true)
    expect(unitModels(s, CHARGERS)).toHaveLength(5)
    expect(s.units[CHARGERS].setUpTurn).toBeFalsy() // the turn is ending: not "set up this turn"
    expect(summaries(ctx).some((t) => t.startsWith('Leap into the Storm'))).toBe(true)
    // the same on a short edge, here with a single rider (five ovals do not fit a 3" strip along a short edge in coherency)
    const side = game()
    setLeeward(side, 'A', 'x+')
    at(side, CHARGERS, -6, 4, 1)
    at(side, 'B:boss', -13, 9)
    expect(offered(side, 'A', 'endOfTurn')).toContain(LEAP)
    useOnce(ctxFor(side), 'endOfTurn', 'A', LEAP)
    const rim = [{ x: 12, z: -11 }, { x: 15, z: -11 }, { x: 15, z: 11 }, { x: 12, z: 11 }]
    for (const m of unitModels(side, CHARGERS)) expect(whollyWithinPolygon(m, rim)).toBe(true)
    expect(leewardOf(side, 'A')).toBe('z+')
    // more than 6" from every enemy model
    const enemyModels = unitModels(side, 'B:boss')
    for (const m of unitModels(side, CHARGERS)) for (const e of enemyModels) expect(Math.hypot(m.pos.x - e.pos.x, m.pos.z - e.pos.z)).toBeGreaterThan(6)
    // not offered: in combat
    const t = game()
    setLeeward(t, 'A', 'z-')
    at(t, CHARGERS, 0, 3, 5, 0.12); at(t, 'B:guard', 0, 6, 1)
    expect(losService.unitInCombat(t, CHARGERS)).toBe(true)
    expect(offered(t, 'A', 'endOfTurn')).not.toContain(LEAP)
    // not offered: nowhere legal (every spot in the strip is within 6" of an enemy)
    const u = game()
    setLeeward(u, 'A', 'z-')
    at(u, CHARGERS, -6, 4, 5, 0.12)
    for (const [id, x] of [['B:boss', -10.5], ['B:brute', -3.5], ['B:hawk', 3.5], ['B:guard', 10.5]] as const) at(u, id, x, -6, 1)
    expect(offered(u, 'A', 'endOfTurn')).not.toContain(LEAP)
    // a unit holding an objective its side controls stays put (AI hint)
    const v = game()
    setLeeward(v, 'A', 'z-')
    at(v, 'B:boss', -13, 9)
    const obj = Object.values(v.objectives)[0]
    obj.controller = 'A'
    at(v, CHARGERS, obj.pos.x - 2, obj.pos.z, 5, 0.12)
    expect(offered(v, 'A', 'endOfTurn')).not.toContain(LEAP)
  })

  it('LRL-AB-5 Wall of Blades: only when not charged and in combat with a charger; +1 against Cavalry; 3+ gives Strike-first', () => {
    const base = (opts: Opts = {}): GameState => {
      const s = game(opts)
      s.phase = 'fight'
      s.activePlayer = 'B'
      at(s, WARDENS, 0, -5, 3)
      at(s, 'B:brute', 0, -2, 1)
      s.units['B:brute'].turn.chargedThisTurn = true
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'fight')).toContain(WALL)
    const ctx = ctxFor(s, [3])
    useOnce(ctx, 'fight', 'A', WALL)
    expect(s.units[WARDENS].turn.fightsFirst).toBe(true)
    expect(offered(s, 'A', 'fight')).not.toContain(WALL) // Rule of One
    // a roll of 2 fails against Infantry, succeeds against Cavalry (+1)
    const t = base()
    const c2 = ctxFor(t, [2])
    useOnce(c2, 'fight', 'A', WALL)
    expect(t.units[WARDENS].turn.fightsFirst).toBeFalsy()
    const cav = base({ patch: (b) => { b.datasheets['fx.brute'].keywords = ['INFANTRY', 'CAVALRY'] } })
    const c3 = ctxFor(cav, [2])
    useOnce(c3, 'fight', 'A', WALL)
    expect(cav.units[WARDENS].turn.fightsFirst).toBe(true)
    // not when the Wardens charged themselves, or when no enemy in combat charged
    const u = base()
    u.units[WARDENS].turn.chargedThisTurn = true
    expect(offered(u, 'A', 'fight')).not.toContain(WALL)
    const v = base()
    v.units['B:brute'].turn.chargedThisTurn = false
    expect(offered(v, 'A', 'fight')).not.toContain(WALL)
    // a charger that is not in combat with the Wardens does not count
    const w = base()
    w.units['B:brute'].turn.chargedThisTurn = false
    at(w, 'B:guard', 12, 5, 1)
    w.units['B:guard'].turn.chargedThisTurn = true
    expect(offered(w, 'A', 'fight')).not.toContain(WALL)
    // either player's combat phase (data)
    expect(s.abilities[WALL].timing).toEqual({ kind: 'phase', phase: 'fight', whose: 'any' })
  })
})

describe('LRL-WEAP weapons and wards', () => {
  it('LRL-WEAP-1 Warden Pike and Blade: +1 Rend against a unit that charged this turn; a critical hit is mortal damage', () => {
    const swing = (charged: boolean, dice: number[]): { events: GameEvent[]; s: GameState } => {
      const s = game()
      at(s, WARDENS, 0, -5, 1); at(s, 'B:brute', 0, -2, 1)
      s.units['B:brute'].turn.chargedThisTurn = charged
      s.phase = 'fight'
      return { events: attack(s, ctxFor(s, dice), 'melee', WARDENS, PIKE, 'B:brute', 1), s }
    }
    // the Brute saves on 3+; the Pike has Rend 0, so a 3 saves; against a unit that charged Rend 1 makes the 3 fail
    const calm = of(swing(false, [4, 6, 3, 1, 1]).events, 'SaveRolled')[0]
    const charged = of(swing(true, [4, 6, 3, 1, 1]).events, 'SaveRolled')[0]
    expect([calm.die, calm.saved]).toEqual([3, true])
    expect([charged.die, charged.saved]).toEqual([3, false])
    // a 4 still saves against the +1 Rend (needs 4+)
    expect(of(swing(true, [4, 6, 4, 1, 1]).events, 'SaveRolled')[0].saved).toBe(true)
    // a critical hit (unmodified 6): mortal damage instead of the wound roll and save
    const crit = swing(false, [6, 1, 1, 1])
    expect(of(crit.events, 'DamageApplied').some((e) => e.mortal)).toBe(true)
    expect(of(crit.events, 'WoundRolled')).toHaveLength(0)
    const plain = swing(false, [5, 6, 3, 1, 1])
    expect(of(plain.events, 'DamageApplied').some((e) => e.mortal)).toBe(false)
  })

  it('LRL-WEAP-2 Treerunner\'s Claws (Companion) get no friendly buffs - Gale Force\'s +1 skips them - but enemy penalties still apply', () => {
    const s = game()
    setLeeward(s, 'A', 'z+')
    at(s, CHARGERS, 0, -5, 1); at(s, 'B:brute', 0, -2, 1)
    s.phase = 'fight'
    const ctx = ctxFor(s, [4, 4, 4, 1, 1, 1, 1, 1])
    expect(declare(ctx, 'melee', CHARGERS, CLAWS, 'B:brute', 2)).toBe(true)
    const claws = of(attack(s, ctx, 'melee', CHARGERS, CLAWS, 'B:brute', 2), 'HitRolled')
    expect(claws.map((e) => [e.die, e.final, e.hit])).toEqual([[4, 4, false], [4, 4, false]]) // Claws hit on 5+: a 4 stays a 4
    // the Blade is not a Companion weapon: the same +1 turns a 3 into a hit on 4+
    const t = game()
    setLeeward(t, 'A', 'z+')
    at(t, CHARGERS, 0, -5, 1); at(t, 'B:brute', 0, -2, 1)
    const c2 = ctxFor(t, [3, 1, 1, 1])
    expect(declare(c2, 'melee', CHARGERS, 'lumineth.weapon.windcharger-blade', 'B:brute', 1)).toBe(true)
    const blade = of(attack(t, c2, 'melee', CHARGERS, 'lumineth.weapon.windcharger-blade', 'B:brute', 1), 'HitRolled')
    expect(blade.map((e) => [e.die, e.final, e.hit])).toEqual([[3, 4, true]])
    // an enemy Eye of the Storm still penalises the Claws (mirror match: B's Spirit protects B's Wardens)
    const m = game({ mirror: true })
    at(m, CHARGERS, 0, -2, 1)
    at(m, 'B:spirit', 0, 3)
    at(m, 'B:wardens', 3, 1.5, 1)
    ensure(m, 'luminethEyeOfTheStorm')
    m.phase = 'fight'
    const eye = of(attack(m, ctxFor(m, [5, 1, 1, 1, 1]), 'melee', CHARGERS, CLAWS, 'B:wardens', 1), 'HitRolled')
    expect(eye.map((e) => [e.die, e.final, e.hit])).toEqual([[5, 4, false]])
  })

  it('LRL-WARD-1 the Spirit\'s printed Ward (5+) and Temple Guardians\' Ward (5+) do not stack: the best ward wins, never better than 5+', () => {
    // the Spirit prints Ward (5+)
    const s = game({ enh: GUARDIANS, patch: (b) => { b.datasheets['lumineth.unit.vanari-auralan-wardens'].stats.ward = 6 } })
    const ward = (id: UnitId): number | null => feelNoPainFor(ctxFor(s), firstModel(s, id).id, {} as never)?.threshold ?? null
    at(s, SPIRIT, 8, -8)
    at(s, MAGE, 0, -5); at(s, WARDENS, 3.5, -5, 2)
    expect(ward(SPIRIT)).toBe(5)
    // a printed 6+ is improved to 5+ by the enhancement, not to 4+
    expect(ward(WARDENS)).toBe(5)
    // a printed 4+ stays 4+ (best ward only)
    const t = game({ enh: GUARDIANS, patch: (b) => { b.datasheets['lumineth.unit.vanari-auralan-wardens'].stats.ward = 4 } })
    at(t, MAGE, 0, -5); at(t, WARDENS, 3.5, -5, 2)
    expect(feelNoPainFor(ctxFor(t), firstModel(t, WARDENS).id, {} as never)?.threshold).toBe(4)
    // the general without a printed ward gets the enhancement's 5+
    expect(feelNoPainFor(ctxFor(t), firstModel(t, MAGE).id, {} as never)?.threshold).toBe(5)
  })
})

describe('mirror match', () => {
  it('LRL-EDGE-2 each Lumineth army has its own leeward edge and its own Ride the Hurricane count', () => {
    const s = game({ mirror: true })
    expect(defaultLeeward(s, 'A')).toBe('z+')
    expect(defaultLeeward(s, 'B')).toBe('z-')
    setLeeward(s, 'A', 'x+')
    expect(storedLeeward(s, 'B')).toBeNull()
    const ctx = ctxFor(s)
    afterRideTheHurricane(ctx, { abilityId: PULLED, unitId: null, player: 'A' })
    afterRideTheHurricane(ctx, { abilityId: PULLED, unitId: null, player: 'B' })
    expect(leewardOf(s, 'A')).toBe('z+')
    expect(leewardOf(s, 'B')).toBe('x+') // the default z- turned once
    expect([rthCount(s, 'A'), rthCount(s, 'B')]).toEqual([1, 1])
  })
})
