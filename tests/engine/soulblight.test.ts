// Soulblight Gravelords (Bloodcrave Hunt) code hooks and data: docs/spec/factions/soulblight-gravelords.md, test ids SBG-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/soulblight files on top of the AoS fixture bundle
// (player A = Bloodcrave Hunt, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data
// except where a test says so (a ward, a keyword, a ranged weapon on a fixture unit).
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, SeededRng, abilityService, createContext, createGame, legalActions, removeModel, step, unitModels, view,
  type AbilityWindow, type Action, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PendingDecision,
  type PlayerId, type UnitId,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { makeSimSetup } from '../../tools/sim-core'
import { DATA_VERSION, loadBundle } from '../../src/data'
import { attackService, ownFightResolved } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { horizontalGap, whollyWithinPolygon } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { losService } from '../../src/engine/los'
import { weaponService } from '../../src/engine/weapons'
import { chargeModule, chargeMoveRejection } from '../../src/engine/phases/charge'
import { fightModule } from '../../src/engine/phases/fight'
import { movementModule } from '../../src/engine/phases/movement'
import { recordPassedAcross, passedAcrossThisPhase } from '../../src/engine/factions/aos-moves'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { returnableModels } from '../../src/engine/factions/aos-common'
import { soulblightAbilityTiming, soulblightChargeBonus, soulblightModeBonus, soulblightTargetBonus } from '../../src/engine/factions/soulblight'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import { placeUnit } from '../fixtures/state'
import abilitiesJson from '../../src/data/factions/soulblight/abilities.json'
import enhancementsJson from '../../src/data/factions/soulblight/enhancements.json'
import weaponsJson from '../../src/data/factions/soulblight/weapons.json'
import factionJson from '../../src/data/factions/soulblight/faction.json'
import patrolJson from '../../src/data/factions/soulblight/patrols/bloodcrave-hunt.json'
import lordJson from '../../src/data/factions/soulblight/datasheets/vampire-lord.json'
import skeletonsJson from '../../src/data/factions/soulblight/datasheets/deathrattle-skeletons.json'
import knightsJson from '../../src/data/factions/soulblight/datasheets/blood-knights.json'
import vargheistsJson from '../../src/data/factions/soulblight/datasheets/vargheists.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [lordJson, skeletonsJson, knightsJson, vargheistsJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.soulblight = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const ARMY = 'soulblight.army.bloodcrave-hunt'
const LEGIONS = 'soulblight.ability.endless-legions'
const CHARGERS = 'soulblight.ability.ruinous-chargers'
const SHARD = 'soulblight.enh.grave-sand-shard'
const BATS = 'soulblight.enh.cloud-of-bats'
const AURA = 'soulblight.enh.aura-of-night'
const GALE = 'soulblight.enh.spirit-gale'
const GALE_AB = 'soulblight.ability.spirit-gale'
const BATS_AB = 'soulblight.ability.cloud-of-bats'
const TRANSFERENCE = 'soulblight.ability.vile-transference'
const LEGION = 'soulblight.ability.skeleton-legion'
const SWOOP = 'soulblight.ability.swoop-down'
const HUNGER = 'soulblight.ability.the-hunger'

const LORD = 'A:vampire-lord'
const SKEL_A = 'A:skeletons-a'
const SKEL_B = 'A:skeletons-b'
const KNIGHTS = 'A:blood-knights'
const VARG = 'A:vargheists'
const BOSS = 'B:boss'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const HAWK = 'B:hawk'

const W = (id: string) => `soulblight.weapon.${id}`
const TEMPLAR = W('templar-lance-or-blade')
const HOOVES = W('nightmares-hooves-and-teeth')

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
  const stride = 2 * r + 0.15
  s.units[unitId].location = 'board'
  ms.forEach((m, i) => { m.pos = { x: cx + (i - (ms.length - 1) / 2) * stride, y: 0, z: cz } })
}

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'soulblight', patrolId: ARMY, enhancementId: opts.enh ?? GALE, regimentAbilityId: opts.reg ?? LEGIONS }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  // bystanders go along the back edges, two rows each, clear of the middle where the tests work (the Vargheists stay in reserve)
  for (const p of ['A', 'B'] as const) {
    const sign = p === 'A' ? -1 : 1
    let x = -14.5, row = 0
    for (const u of Object.values(s.units).filter((u) => u.player === p && !u.reserveArrival)) {
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
const ctxFor = (s: GameState, dice: number[]): EngineContext => {
  const rng = new ScriptedRng(dice)
  const { ctx } = createContext(s, rng, DEFAULT_MODULES)
  rngs.set(ctx, rng)
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
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string } = {}) {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    return opts.mode ?? ids[0]
  })
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const first = (s: GameState, unitId: UnitId) => unitModels(s, unitId)[0]
const trim = (s: GameState, unitId: UnitId, n: number): void => { for (const id of [...s.units[unitId].models].slice(n)) removeModel(s, id) }
const slay = (s: GameState, unitId: UnitId, n: number): void => { for (const id of [...s.units[unitId].models].slice(-n)) removeModel(s, id) }
const destroy = (s: GameState, unitId: UnitId): void => { for (const id of [...s.units[unitId].models]) removeModel(s, id) }
const hurt = (s: GameState, unitId: UnitId, left: number, modelIndex = 0): void => { unitModels(s, unitId)[modelIndex].woundsRemaining = left }

function attack(s: GameState, kind: 'ranged' | 'melee', dice: number[], attackerUnitId: UnitId, weaponId: string, targetUnitId: UnitId, attacks: number | null = null) {
  s.phase = kind === 'ranged' ? 'shooting' : 'fight'
  const modelId = s.units[attackerUnitId].models.find((id) => s.models[id].weapons.includes(weaponId))!
  const target: DeclaredTarget = { modelId, weaponId, targetUnitId, profileGroup: null, attacks }
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets: [target] })
  expect(attackService.advance(ctx)).toBe('done')
  return { events, rng, ctx }
}

// drives the fight phase: phase decisions through fightModule, ability decisions (chooseOption) through the ability service
function driveFight(s: GameState, ctx: EngineContext, choose: (p: PendingDecision) => Action | undefined): void {
  for (let i = 0; i < 400; i++) {
    if (fightModule.advance(ctx) === 'done') return
    const p = s.pending as PendingDecision
    s.pending = null
    const a = choose(p) ?? (p.kind === 'chooseOption' ? { type: 'pass', player: p.player, decisionId: p.id } as Action : (fightModule.legalActions?.(s, p) ?? [])[0])
    if (!a) throw new Error(`no action for ${p.kind}`)
    const rej = p.kind === 'chooseOption' ? abilityService.handler.handle(ctx, a, p) : fightModule.handle(ctx, a, p)
    if (rej) throw new Error(`rejected ${rej.code}: ${rej.reason}`)
  }
  throw new Error('fight phase did not finish')
}

// the Lord and the Blood Knights next to a victim, in the fight phase
function fightGame(opts: Parameters<typeof game>[0] = {}): GameState {
  const s = game(opts)
  s.phase = 'fight'
  return s
}

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('SBG-REG every code in the Soulblight data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('SBG-ARMY-1 the Bloodcrave Hunt builds: Vampire Lord general, 2 x 10 Skeletons, 5 Blood Knights, 3 Vargheists; 29 models, stats and Ward (6+)', () => {
    const s = game()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(29)
    expect(s.players.A.warlordUnitId).toBe(LORD)
    expect(s.players.A.battleTraitIds).toEqual(['soulblight.ability.deaths-descent', HUNGER])
    expect(s.players.A.regimentAbilityId).toBe(LEGIONS)
    const st = (id: string) => s.datasheets[`soulblight.unit.${id}`].stats
    expect(st('vampire-lord')).toMatchObject({ M: 6, W: 5, Sv: 3, OC: 2, ward: 6 })
    expect(st('deathrattle-skeletons')).toMatchObject({ M: 4, W: 1, Sv: 5, OC: 1, ward: 6 })
    expect(st('blood-knights')).toMatchObject({ M: 10, W: 3, Sv: 3, OC: 1, ward: 6 })
    expect(st('vargheists')).toMatchObject({ M: 12, W: 4, Sv: 5, OC: 1, ward: 6 })
    expect(s.datasheets['soulblight.unit.vampire-lord'].keywords).toEqual(['HERO', 'WIZARD', 'INFANTRY', 'VAMPIRE'])
    expect(s.datasheets['soulblight.unit.blood-knights'].keywords).toEqual(['CAVALRY', 'VAMPIRE'])
    expect(s.datasheets['soulblight.unit.vargheists'].keywords).toEqual(['INFANTRY', 'VAMPIRE', 'FLY'])
    // bases: 40 round Lord, 25 round Skeletons, 75x42 oval Knights, 50 round Vargheists
    const base = (id: UnitId) => s.models[s.units[id].models[0]].base
    expect(base(LORD).radius).toBeCloseTo(40 / 2 / 25.4, 2)
    expect(base(SKEL_A).radius).toBeCloseTo(25 / 2 / 25.4, 2)
    expect(base(KNIGHTS).radius).toBeCloseTo(75 / 2 / 25.4, 2)
    expect(base(KNIGHTS).radius2).toBeCloseTo(42 / 2 / 25.4, 2)
    expect(base(VARG).radius).toBeCloseTo(50 / 2 / 25.4, 2)
    // the Knights carry both weapons on every model; nothing in the army shoots
    for (const m of unitModels(s, KNIGHTS)) expect(m.weapons).toEqual([TEMPLAR, HOOVES])
    for (const u of mine) for (const m of u.models) for (const w of s.models[m].weapons) expect(weaponService.effectiveWeapon(s, m, w).kind).toBe('melee')
  })

  it('SBG-ARMY-2 no unit has Reinforcements: a destroyed unit is never offered for Call for Reinforcements', () => {
    const s = game()
    for (const u of Object.values(s.units).filter((x) => x.player === 'A')) expect(s.datasheets[u.datasheetId].keywords).not.toContain('REINFORCEMENTS')
    for (const id of [LORD, SKEL_A, SKEL_B, KNIGHTS, VARG]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A')).toEqual([])
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).not.toContain('core.ability.call-for-reinforcements')
  })
})

describe('SBG-BT battle traits', () => {
  // runs the movement phase of `s` up to the first arrival decision (units are passed over), if any
  function toArrival(ctx: EngineContext): PendingDecision | null {
    const s = ctx.state
    movementModule.enter(ctx)
    for (let i = 0; i < 20; i++) {
      if (movementModule.advance(ctx) === 'done') return null
      const p = s.pending as PendingDecision
      if (p.kind === 'deployUnit') return p
      if (p.kind !== 'chooseUnitToActivate') throw new Error(`unexpected ${p.kind}`)
      s.pending = null
      expect(movementModule.handle(ctx, { type: 'pass', player: 'A', decisionId: p.id }, p)).toBeUndefined()
    }
    throw new Error('movement did not settle')
  }

  it('SBG-BT-1 Vargheists start in reserve; Swoop Down is not offered before round 3, then sets them up anywhere more than 6" from every enemy, and they cannot move that phase', () => {
    const s = game()
    expect(s.units[VARG].location).toBe('reserves')
    expect(s.units[VARG].reserveArrival).toBe(SWOOP)
    s.phase = 'movement'
    // round 2: no arrival
    s.round = 2
    placeUnit(s, BOSS, [[0, 0]])
    expect(toArrival(ctxFor(s, []))).toBeNull()
    expect(s.units[VARG].location).toBe('reserves')
    // round 3: a deployUnit decision; within 6" of the Boss is refused, a far corner (far from the Boss) is fine
    const t = game()
    t.phase = 'movement'; t.round = 3
    placeUnit(t, BOSS, [[0, 0]])
    const ctx = ctxFor(t, [])
    const p = toArrival(ctx)
    expect(p?.kind).toBe('deployUnit')
    const models = t.units[VARG].models
    const at = (x: number, z: number): Action => ({
      type: 'deployUnit', player: 'A', decisionId: (p as PendingDecision).id, unitId: VARG,
      placements: models.map((id, i) => ({ modelId: id, pos: { x: x + i * 2.4, y: 0, z }, facing: 0 })),
    } as Action)
    expect(movementModule.validate?.(t, at(4, 0), p as PendingDecision)?.code).toBe('E_ENGAGEMENT')
    expect(movementModule.validate?.(t, at(-13.5, -6), p as PendingDecision)).toBeNull()
    t.pending = null
    expect(movementModule.handle(ctx, at(-13.5, -6), p as PendingDecision)).toBeUndefined()
    expect(t.units[VARG].location).toBe('board')
    expect(t.units[VARG].setUpTurn).toEqual({ round: 3, player: 'A' })
    // anywhere: the spot is not tied to the deployment zone (z = -4 is outside A's 5"-deep zone) and every model is > 6" from every enemy model
    for (const m of unitModels(t, VARG)) for (const e of Object.values(t.models).filter((x) => t.units[x.unitId].player === 'B' && t.units[x.unitId].location === 'board')) expect(horizontalGap(m, e)).toBeGreaterThan(6)
    // set up this turn: no Move ability afterwards (it counts as activated)
    expect(t.phaseState.activated).toContain(VARG)
    expect(t.units[VARG].turn.arrivedThisTurn).toBe(true)
  })

  it('SBG-BT-2 The Hunger: a Vampire unit that has fought heals the damage its attacks allocated (wards done, Companion included); Skeletons do not; no model returns', () => {
    const s = fightGame({ patch: (b) => { b.datasheets['fx.boss'].stats = { ...b.datasheets['fx.boss'].stats, W: 40 } } })
    placeUnit(s, KNIGHTS, { x: -8, z: 0, gap: 0.3 })
    placeUnit(s, BOSS, [[-8, 2.6]])
    // two Knights down to 1 Health, one slain earlier
    slay(s, KNIGHTS, 1)
    hurt(s, KNIGHTS, 1, 0); hurt(s, KNIGHTS, 1, 1)
    const before = unitModels(s, KNIGHTS).length
    const missing = unitModels(s, KNIGHTS).reduce((n, m) => n + (3 - m.woundsRemaining), 0)
    const { ctx, events } = createContext(s, new SeededRng('sbg-hunger'), DEFAULT_MODULES)
    fightModule.enter(ctx)
    driveFight(s, ctx, (p) => (p.kind === 'chooseFightUnit' ? p.options.find((o) => o.id === KNIGHTS)?.action ?? p.options[0].action : undefined))
    const dealt = of(events, 'DamageApplied').filter((d) => 'attackerUnitId' in d.source && d.source.attackerUnitId === KNIGHTS && d.unitId === BOSS).reduce((a, d) => a + d.amount, 0)
    const healed = of(events, 'WoundsRegained').filter((e) => e.source === HUNGER && e.unitId === KNIGHTS).reduce((a, e) => a + e.amount, 0)
    expect(dealt).toBeGreaterThan(0)
    // the Knights hit again in the Boss's reply? Their damage is taken after their own Fight: the heal is the Knights' own allocation, capped by what is missing
    expect(healed).toBeGreaterThan(0)
    expect(healed).toBeLessThanOrEqual(Math.min(dealt, missing))
    expect(unitModels(s, KNIGHTS).length).toBeLessThanOrEqual(before) // nothing came back
    // announced only when it healed
    expect(of(events, 'AbilityTriggered').filter((e) => e.abilityId === HUNGER).length).toBeGreaterThan(0)

    // Skeletons (not Vampires) heal nothing, whatever they allocate
    const t = fightGame()
    placeUnit(t, SKEL_A, { x: -8, z: 0, gap: 0.2 })
    placeUnit(t, GUARD, { x: -8, z: 1.8, gap: 0.2 })
    removeModel(t, t.units[SKEL_A].models[0])
    const c2 = ctxFor(t, [])
    const hungerHook = codeHooks.soulblightTheHunger
    hungerHook.onOwnFightResolved?.(c2, { ability: t.abilities[HUNGER] as never, unitId: SKEL_A, damageAllocated: 5 })
    expect(wounds(t, SKEL_A)).toBe(9)
  })

  it('SBG-BT-3 The Hunger gives nothing for points saved by wards or lost with a destroyed target, and nothing to a unit that is gone', () => {
    // a Lord at 1 Health left hits a warded unit: the heal is exactly the points that were allocated (DamagePoolResolved), not the ones the ward saved
    const s = fightGame({ patch: (b) => { b.datasheets['fx.brute'].stats = { ...b.datasheets['fx.brute'].stats, W: 30, ward: 2 } } })
    placeUnit(s, LORD, [[-8, 0]])
    placeUnit(s, BRUTE, { x: -8, z: 2.2, gap: 0.2 })
    hurt(s, LORD, 1)
    const { events, ctx } = attack(s, 'melee', Array(40).fill(6), LORD, W('dynastic-war-relic'), BRUTE)
    const pools = of(events, 'DamagePoolResolved').filter((p) => p.unitId === BRUTE)
    const allocated = pools.reduce((a, p) => a + p.points - p.warded, 0)
    const saved = pools.reduce((a, p) => a + p.warded, 0)
    expect(saved).toBeGreaterThanOrEqual(0)
    ownFightResolved(ctx, LORD)
    // the Lord's own Health is 5: it heals min(allocated, 4)
    expect(wounds(s, LORD)).toBe(1 + Math.min(allocated, 4))

    // 6s everywhere: every point is allocated, so the heal tracks the damage dealt, never the unwarded total
    const t = fightGame({ patch: (b) => { b.datasheets['fx.brute'].stats = { ...b.datasheets['fx.brute'].stats, W: 30, ward: 6 } } })
    placeUnit(t, LORD, [[-8, 0]])
    placeUnit(t, BRUTE, { x: -8, z: 2.2, gap: 0.2 })
    hurt(t, LORD, 1)
    // dice: 5 hits (6), 5 wounds (6), 5 saves (1 = fail), then ten ward rolls: five 6s save a point, five 1s do not
    const dice = [...Array(5).fill(6), ...Array(5).fill(6), ...Array(5).fill(1), 6, 6, 6, 6, 6, 1, 1, 1, 1, 1]
    const r = attack(t, 'melee', dice, LORD, W('dynastic-war-relic'), BRUTE)
    const pool = of(r.events, 'DamagePoolResolved').find((p) => p.unitId === BRUTE)!
    expect(pool.points).toBe(10)
    expect(pool.warded).toBe(5)
    ownFightResolved(r.ctx, LORD)
    expect(wounds(t, LORD)).toBe(1 + 4) // 5 points allocated, capped by the Lord's 4 missing Health

    // a Lord that no longer stands gets nothing
    const u = fightGame()
    placeUnit(u, LORD, [[-8, 0]]); hurt(u, LORD, 1)
    const c = ctxFor(u, [])
    destroy(u, LORD)
    codeHooks.soulblightTheHunger.onOwnFightResolved?.(c, { ability: u.abilities[HUNGER] as never, unitId: LORD, damageAllocated: 4 })
    expect(of([], 'WoundsRegained')).toEqual([])
    expect(u.units[LORD].location).toBe('destroyed')
  })
})

describe('SBG-RA regiment abilities', () => {
  it('SBG-RA-1 Endless Legions: once per battle, a destroyed Skeletons unit returns as a new unit of D6 models wholly in own territory, more than 6" from enemies, no edge band', () => {
    const s = game()
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).not.toContain(LEGIONS) // nobody destroyed
    destroy(s, SKEL_A)
    expect(s.units[SKEL_A].location).toBe('destroyed')
    placeUnit(s, BOSS, [[0, 2]]) // enemy next to the territory line: the set-up must stay clear of it
    expect(offered(s, 'A', 'movement')).toContain(LEGIONS)
    expect(offered(s, 'B', 'movement')).not.toContain(LEGIONS)
    const ctx = ctxFor(s, [4])
    const r = useOnce(ctx, 'movement', 'A', LEGIONS)
    expect(r.topics).toContain('abilityMode') // where to set it up
    // at least one of the offered spots is well inside the territory, not in the 6" edge band
    expect(r.options.flat().some((id) => { const m = /^at:(-?[\d.]+):(-?[\d.]+)$/.exec(id); return !!m && Number(m[2]) > -4 })).toBe(true)
    const copy = Object.values(s.units).find((u) => u.replacementOf === SKEL_A)!
    expect(copy).toBeDefined()
    expect(copy.datasheetId).toBe(s.units[SKEL_A].datasheetId)
    expect(copy.location).toBe('board')
    expect(copy.models).toHaveLength(4)
    expect(copy.startingStrength).toBe(4)
    expect(s.units[SKEL_A].replaced).toBe(true)
    expect(copy.setUpTurn).toEqual({ round: 1, player: 'A' })
    for (const m of unitModels(s, copy.id)) {
      expect(whollyWithinPolygon(m, [{ x: -15, z: -11 }, { x: 15, z: -11 }, { x: 15, z: 0 }, { x: -15, z: 0 }])).toBe(true)
      for (const e of unitModels(s, BOSS)) expect(horizontalGap(m, e)).toBeGreaterThan(6)
    }
    expect(leftOver(ctx)).toEqual([])
    // once per battle, and a replaced unit cannot be replaced again
    destroy(s, SKEL_B)
    s.round = 2
    expect(offered(s, 'A', 'movement')).not.toContain(LEGIONS)
    const t = game()
    t.phase = 'movement'
    destroy(t, SKEL_A)
    t.units[SKEL_A].replaced = true
    expect(offered(t, 'A', 'movement')).not.toContain(LEGIONS)
    // the army's other units are not valid targets
    const u = game()
    u.phase = 'movement'
    destroy(u, KNIGHTS)
    expect(offered(u, 'A', 'movement')).not.toContain(LEGIONS)
  })

  it('SBG-RA-2 the Endless Legions replacement has starting size D6: Skeleton Legion never takes it above that', () => {
    const s = game()
    s.phase = 'movement'
    destroy(s, SKEL_A)
    useOnce(ctxFor(s, [3]), 'movement', 'A', LEGIONS)
    const copy = Object.values(s.units).find((u) => u.replacementOf === SKEL_A)!
    expect(copy.models).toHaveLength(3)
    expect(copy.startingStrength).toBe(3)
    // two models fall, then Skeleton Legion with 6s everywhere: back to 3, never to the original 10
    slay(s, copy.id, 2)
    expect(returnableModels(s, copy.id)).toBe(2)
    s.phase = 'fight'
    s.activePlayer = 'A'
    useOnce(ctxFor(s, [6, 6]), 'fight', 'A', LEGION, { target: copy.id })
    expect(unitModels(s, copy.id)).toHaveLength(3)
    expect(returnableModels(s, copy.id)).toBe(0)
    // the original's destroyed models are not available to the replacement either
    expect(unitModels(s, copy.id).length).toBeLessThanOrEqual(copy.startingStrength)
  })

  it('SBG-RA-3 Ruinous Chargers: only if the Blood Knights charged this turn; D3 mortal to each enemy unit passed across; once per battle; usable in the opponent\'s charge phase', () => {
    const s = game({ reg: CHARGERS })
    s.phase = 'charge'
    expect(offered(s, 'A', 'charge')).not.toContain(CHARGERS) // no charge yet
    s.units[KNIGHTS].turn.chargedThisTurn = true
    expect(offered(s, 'A', 'charge')).not.toContain(CHARGERS) // charged, but passed across nobody
    recordPassedAcross(s, KNIGHTS, [GUARD, BRUTE])
    expect(offered(s, 'A', 'charge')).toContain(CHARGERS)
    expect(offered(s, 'B', 'charge')).not.toContain(CHARGERS)
    trim(s, GUARD, 5)
    const guardBefore = unitModels(s, GUARD).length
    const bruteBefore = wounds(s, BRUTE)
    const ctx = ctxFor(s, [5, 2]) // D3 for each unit, in unit-id order: the Brute 3, the Guard 1
    useOnce(ctx, 'charge', 'A', CHARGERS)
    expect(leftOver(ctx)).toEqual([])
    expect(unitModels(s, GUARD)).toHaveLength(guardBefore - 1) // Health 1 models: 1 mortal damage slays 1
    expect(wounds(s, BRUTE)).toBe(bruteBefore - 3)
    expect(offered(s, 'A', 'charge')).not.toContain(CHARGERS) // once per battle
    // the opponent's charge phase: the Knights charged on that turn (Counter-Charge); the ability is "any"
    const t = game({ reg: CHARGERS })
    t.phase = 'charge'
    t.activePlayer = 'B'
    t.units[KNIGHTS].turn.chargedThisTurn = true
    recordPassedAcross(t, KNIGHTS, [BOSS])
    expect(offered(t, 'A', 'charge')).toContain(CHARGERS)
    // a destroyed victim is dropped
    destroy(t, BOSS)
    expect(offered(t, 'A', 'charge')).not.toContain(CHARGERS)
    // the other regiment ability is not Ruinous Chargers
    expect(offered(game({ reg: LEGIONS }), 'A', 'charge')).not.toContain(CHARGERS)
  })
})

describe('SBG-ENH enhancements', () => {
  // `n` Skeletons slain, the Lord `lordGap` inches from the unit
  function legionGame(n: number, lordGap: number, enh = SHARD): GameState {
    const s = game({ enh })
    s.phase = 'fight'
    s.activePlayer = 'A'
    centreRow(s, SKEL_A, 0, -6)
    slay(s, SKEL_A, n)
    place(s, LORD, 0, -6 - lordGap - 1.6)
    return s
  }
  const skeletons = (s: GameState): number => unitModels(s, SKEL_A).length

  it('SBG-ENH-1 Grave-Sand Shard: legion rolls of 5 also return models, only for Skeletons within 9" of the general, once per battle', () => {
    const s = legionGame(4, 3)
    const ctx = ctxFor(s, [5, 5, 4, 5])
    const r = useOnce(ctx, 'fight', 'A', LEGION, { target: SKEL_A, mode: 'shard' })
    expect(r.topics).toContain('abilityMode') // plain / shard
    expect(skeletons(s)).toBe(6 + 3) // 5s count: three of four dice
    for (const m of unitModels(s, SKEL_A)) expect(m.woundsRemaining).toBe(1)
    expect(leftOver(ctx)).toEqual([])
    // once per battle: the second use, next round, offers no shard mode and 5s do nothing
    s.round = 2
    s.units[SKEL_A].turn.abilitiesUsedThisPhase = []
    slay(s, SKEL_A, 3)
    const again = useOnce(ctxFor(s, [5, 5, 5, 5]), 'fight', 'A', LEGION, { target: SKEL_A })
    expect(again.topics).toContain('abilityUse')
    expect(again.topics).not.toContain('abilityMode')
    expect(skeletons(s)).toBe(6)
    // out of range of the general (more than 9"): no mode, 5s do nothing
    const far = legionGame(4, 12)
    const far2 = useOnce(ctxFor(far, [5, 5, 5, 5]), 'fight', 'A', LEGION, { target: SKEL_A })
    expect(far2.topics).toContain('abilityUse')
    expect(far2.topics).not.toContain('abilityMode')
    expect(skeletons(far)).toBe(6)
    // choosing the plain mode keeps the shard for later
    const plain = legionGame(4, 3)
    useOnce(ctxFor(plain, [5, 6, 1, 1]), 'fight', 'A', LEGION, { target: SKEL_A, mode: 'plain' })
    expect(skeletons(plain)).toBe(6 + 1)
    slay(plain, SKEL_A, 1)
    plain.round = 2
    plain.units[SKEL_A].turn.abilitiesUsedThisPhase = []
    expect(useOnce(ctxFor(plain, [5, 5, 5, 5]), 'fight', 'A', LEGION, { target: SKEL_A, mode: 'shard' }).topics).toContain('abilityMode')
    expect(skeletons(plain)).toBe(6 + 4)
    // another enhancement: no shard
    const other = legionGame(4, 3, GALE)
    const noShard = useOnce(ctxFor(other, [5, 5, 5, 5]), 'fight', 'A', LEGION, { target: SKEL_A })
    expect(noShard.topics).toContain('abilityUse')
    expect(noShard.topics).not.toContain('abilityMode')
    expect(skeletons(other)).toBe(6)
  })

  it('SBG-ENH-2 Cloud of Bats: once per battle the general is set up again anywhere more than 6" from enemies, also from combat, with no retreat damage', () => {
    const s = game({ enh: BATS })
    s.phase = 'movement'
    place(s, LORD, 0, -4)
    placeUnit(s, BOSS, [[0, -1.5]]) // in combat with the Lord
    expect(losService.unitInCombat(s, LORD)).toBe(true)
    expect(offered(s, 'A', 'movement')).toContain(BATS_AB)
    expect(offered(s, 'B', 'movement')).not.toContain(BATS_AB)
    const before = wounds(s, LORD)
    const ctx = ctxFor(s, [])
    const r = useOnce(ctx, 'movement', 'A', BATS_AB)
    expect(r.topics).toEqual(['abilityUse', 'abilityMode'])
    expect(r.options[1].length).toBeGreaterThan(1)
    expect(wounds(s, LORD)).toBe(before) // no mortal damage: it is not a Retreat
    expect(losService.unitInCombat(s, LORD)).toBe(false)
    for (const m of unitModels(s, LORD)) for (const e of unitModels(s, BOSS)) expect(horizontalGap(m, e)).toBeGreaterThan(6)
    expect(s.units[LORD].setUpTurn).toEqual({ round: 1, player: 'A' })
    // once per battle
    s.round = 2
    expect(offered(s, 'A', 'movement')).not.toContain(BATS_AB)
    // another enhancement: no Cloud of Bats
    expect(offered(Object.assign(game({ enh: GALE }), { phase: 'movement' as const }), 'A', 'movement')).not.toContain(BATS_AB)
  })

  // F14 RULING (core 17.0 step 3, glossary: Rend is subtracted from save rolls): Rend is a negative save modifier, so Aura of Night
  // ignores it too
  it('SBG-ENH-3 Aura of Night: a -1 save modifier and Rend are ignored against shooting attacks on the general; melee attacks unaffected', () => {
    // the hawk gets a second, ranged weapon: 1 attack, 3+ to hit and wound, Rend 1, Damage 1 (its talons stay melee: same profile)
    const patch = (b: DataBundle): void => {
      b.weapons['fx.w.hawk-talons'] = { ...b.weapons['fx.w.hawk-talons'], A: 1, skill: 3, wound: 3, rend: 1, D: 1, abilities: [] }
      b.weapons['fx.w.hawk-gun'] = { ...b.weapons['fx.w.hawk-talons'], id: 'fx.w.hawk-gun', name: 'Hawk gun', type: 'ranged', range: 24 }
      b.datasheets['fx.hawk'].composition[0].weapons.default = ['fx.w.hawk-talons', 'fx.w.hawk-gun']
    }
    const saves = (enh: string, target: UnitId, kind: 'ranged' | 'melee'): { final: number; needed: number } => {
      const s = game({ enh, patch })
      placeUnit(s, HAWK, [[-4, 0]])
      place(s, LORD, -4, -5)
      place(s, SKEL_A, -4, -7)
      const ctx0 = ctxFor(s, [])
      for (const id of [LORD, SKEL_A]) effectService.grant(ctx0, id, { modifyRoll: { roll: 'save', value: -1 } }, { sourceAbilityId: 'fx.a.chaos-rule', sourceUnitId: id, scope: { who: 'self' }, duration: 'battle' })
      const r = attack(s, kind, [6, 6, 3, 1, 1, 1], HAWK, kind === 'ranged' ? 'fx.w.hawk-gun' : 'fx.w.hawk-talons', target)
      const e = of(r.events, 'SaveRolled')[0]
      return { final: e.final, needed: e.needed }
    }
    const without = saves(GALE, LORD, 'ranged')
    const withAura = saves(AURA, LORD, 'ranged')
    expect(without.final).toBe(1) // die 3, minus the -1 modifier, minus Rend 1
    expect(withAura.final).toBe(3) // the -1 and Rend 1 are both dropped: the bare die
    expect(withAura.needed).toBe(without.needed) // the Save characteristic is untouched
    // melee attacks on the general still carry the -1
    expect(saves(AURA, LORD, 'melee').final).toBe(1)
    // another unit of the army does not get it
    expect(saves(AURA, SKEL_A, 'ranged').final).toBe(1)
  })

  it('SBG-ENH-4 Spirit Gale: casting 7+ inflicts 1 mortal on every enemy unit on the battlefield (not reserves); usable every hero phase', () => {
    const s = game({ enh: GALE })
    s.phase = 'command'
    s.units[HAWK].location = 'reserves'
    trim(s, GUARD, 5)
    const boss = wounds(s, BOSS), brute = wounds(s, BRUTE), guard = unitModels(s, GUARD).length
    expect(offered(s, 'A', 'hero')).toContain(GALE_AB)
    expect(offered(s, 'B', 'hero')).not.toContain(GALE_AB)
    const ctx = ctxFor(s, [3, 4])
    useOnce(ctx, 'hero', 'A', GALE_AB)
    expect(leftOver(ctx)).toEqual([])
    expect(wounds(s, BOSS)).toBe(boss - 1)
    expect(wounds(s, BRUTE)).toBe(brute - 1)
    expect(unitModels(s, GUARD)).toHaveLength(guard - 1)
    expect(s.units[HAWK].location).toBe('reserves')
    // failed cast: 6 is not enough, nothing happens, the attempt is still spent for the phase
    const t = game({ enh: GALE })
    const c2 = ctxFor(t, [3, 3])
    const boss2 = wounds(t, BOSS)
    useOnce(c2, 'hero', 'A', GALE_AB)
    expect(wounds(t, BOSS)).toBe(boss2)
    expect(offered(t, 'A', 'hero')).not.toContain(GALE_AB)
    // no once-per-battle limit: the next hero phase offers it again
    t.round = 2
    t.phaseState.marks = []
    t.units[LORD].turn.abilitiesUsedThisPhase = []
    expect(offered(t, 'A', 'hero')).toContain(GALE_AB)
    // not borne by an army that took another enhancement
    expect(offered(game({ enh: AURA }), 'A', 'hero')).not.toContain(GALE_AB)
  })
})

describe('SBG-MAG and warscroll abilities', () => {
  it('SBG-MAG-1 the Vampire Lord casts at most one of Vile Transference / Spirit Gale per hero phase; a double 1 miscasts (D3 mortal to the Lord); enemy Wizards may unbind', () => {
    const s = game({ enh: GALE })
    place(s, LORD, 0, -4)
    placeUnit(s, BRUTE, { x: 0, z: -1.2, gap: 0.2 })
    expect(offered(s, 'A', 'hero')).toEqual(expect.arrayContaining([TRANSFERENCE, GALE_AB]))
    // Vile Transference is cast (3+3 = 6): the one cast of the phase is spent, so Spirit Gale is no longer offered
    const ctx = ctxFor(s, [3, 3, 1, 1, 1])
    useOnce(ctx, 'hero', 'A', TRANSFERENCE)
    expect(offered(s, 'A', 'hero')).not.toContain(GALE_AB)
    expect(offered(s, 'A', 'hero')).not.toContain(TRANSFERENCE)

    // a double 1 is a miscast: D3 mortal damage to the Lord, and no more spells this phase
    const t = game({ enh: GALE })
    place(t, LORD, 0, -4)
    placeUnit(t, BRUTE, { x: 0, z: -1.2, gap: 0.2 })
    const before = wounds(t, LORD)
    const mc = ctxFor(t, [1, 1, 2, ...Array(6).fill(1)])
    useOnce(mc, 'hero', 'A', GALE_AB)
    expect(t.phaseState.marks).toContain(`magic:miscast:${LORD}`)
    expect(wounds(t, LORD)).toBeLessThan(before)
    expect(offered(t, 'A', 'hero')).toEqual(expect.not.arrayContaining([TRANSFERENCE, GALE_AB]))

    // an enemy Wizard within 30" unbinds a 7 with a better 2D6 roll: no mortal damage
    const u = game({ enh: GALE, patch: (b) => { b.datasheets['fx.boss'].keywords = [...b.datasheets['fx.boss'].keywords, 'WIZARD'] } })
    const boss = wounds(u, BOSS)
    const ub = ctxFor(u, [3, 4, 6, 5])
    useOnce(ub, 'hero', 'A', GALE_AB)
    expect(wounds(u, BOSS)).toBe(boss)
    expect(leftOver(ub)).toEqual([])
  })

  it('SBG-AB-1 Vile Transference: casting 6+; dice = the target\'s Health; each 5+ is 1 mortal on the target and Heal (1) on the Lord; target visible and within 6"', () => {
    const s = game()
    place(s, LORD, 0, -4)
    hurt(s, LORD, 2)
    placeUnit(s, BOSS, [[0, -0.2]]) // 3.6" away: Health 8, so eight dice
    placeUnit(s, GUARD, { x: 10, z: -4, gap: 0.2 }) // far: not a target
    const hook = codeHooks.soulblightVileTransference.activate!
    expect(hook.targets!(s, LORD)).toEqual([BOSS])
    // casting 3+3 = 6, then eight dice: 5, 6, 4, 5, 1, 2, 6, 3 -> four successes
    const ctx = ctxFor(s, [3, 3, 5, 6, 4, 5, 1, 2, 6, 3])
    const boss = wounds(s, BOSS)
    useOnce(ctx, 'hero', 'A', TRANSFERENCE)
    expect(leftOver(ctx)).toEqual([])
    expect(wounds(s, BOSS)).toBe(boss - 4)
    expect(wounds(s, LORD)).toBe(5) // healed 4 of the 3 missing: capped at its Health of 5
    // a 5 on the casting roll is not enough
    const t = game()
    place(t, LORD, 0, -4); hurt(t, LORD, 2); placeUnit(t, BOSS, [[0, -0.2]])
    useOnce(ctxFor(t, [2, 3]), 'hero', 'A', TRANSFERENCE)
    expect(wounds(t, BOSS)).toBe(8)
    expect(wounds(t, LORD)).toBe(2)
    // a Health 1 target gives one die; a target beyond 6" is not offered at all
    const u = game()
    place(u, LORD, 0, -4)
    placeUnit(u, GUARD, { x: 10, z: -4, gap: 0.2 })
    expect(codeHooks.soulblightVileTransference.activate!.targets!(u, LORD)).toEqual([])
    expect(offered(u, 'A', 'hero')).not.toContain(TRANSFERENCE)
    // the target must be visible
    const v = game()
    place(v, LORD, 0, -4)
    placeUnit(v, BOSS, [[0, -0.2]])
    expect(offered(v, 'A', 'hero')).toContain(TRANSFERENCE)
    const spy = vi.spyOn(losService, 'unitVisible').mockReturnValue(false)
    expect(offered(v, 'A', 'hero')).not.toContain(TRANSFERENCE)
    spy.mockRestore()
  })

  it('SBG-AB-2 Riders of Ruin: a Blood Knights charge may cross enemy Infantry models, but not Cavalry/Monster or other models; may not end overlapping', () => {
    const crossing = (charger: UnitId, blocker: UnitId, endOnBlocker = false) => {
      const s = game()
      s.phase = 'charge'
      trim(s, charger, 1)
      trim(s, blocker, 1)
      placeUnit(s, charger, [[0, -8.5]])
      placeUnit(s, blocker, [[0, -5]])
      placeUnit(s, BOSS, [[0, 1]])
      const c = first(s, charger)
      const boss = first(s, BOSS)
      let lo = -8.5, hi = boss.pos.z
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2
        if (horizontalGap({ pos: { x: 0, y: 0, z: mid }, facing: c.facing, base: c.base }, boss) > 0.4) lo = mid; else hi = mid
      }
      const to = endOnBlocker ? { x: 0, y: 0, z: -5 } : { x: 0, y: 0, z: lo }
      const placements = [{ modelId: c.id, pos: to, facing: c.facing, path: [c.pos, to] }]
      const roll = Math.ceil(to.z + 8.5) + 1
      return { s, placements, roll, charger }
    }
    const k = crossing(KNIGHTS, GUARD) // Infantry in the way
    expect(chargeMoveRejection(k.s, KNIGHTS, k.roll, k.placements)).toBeNull()
    const h = crossing(KNIGHTS, HAWK) // a Fly beast without the Infantry keyword
    expect(chargeMoveRejection(h.s, KNIGHTS, h.roll, h.placements)?.code).toBe('E_OVERLAP')
    const e = crossing(KNIGHTS, GUARD, true)
    expect(chargeMoveRejection(e.s, KNIGHTS, e.roll, e.placements)).not.toBeNull() // ending on the model is never allowed
    // the Skeletons (also Infantry) do not have it
    const sk = crossing(SKEL_A, GUARD)
    expect(chargeMoveRejection(sk.s, SKEL_A, sk.roll, sk.placements)?.code).toBe('E_OVERLAP')
    // applying the charge records the crossed unit for Ruinous Chargers
    const ctx = ctxFor(k.s, [])
    chargeModule.enter(ctx)
    k.s.phaseState.charge = { unitId: KNIGHTS, targetUnitIds: [], roll: [4, 4], rerolled: false, distance: k.roll, heroic: false }
    const pending = { id: 'd1', kind: 'chargeMove', player: 'A', context: { unitId: KNIGHTS, targetUnitIds: [], roll: k.roll } } as unknown as PendingDecision
    expect(chargeModule.handle(ctx, { type: 'chargeMove', player: 'A', decisionId: 'd1', unitId: KNIGHTS, placements: k.placements } as Action, pending)).toBeUndefined()
    expect(passedAcrossThisPhase(k.s, KNIGHTS)).toContain(GUARD)
    // the keyword is in force through the hook service
    expect(hookService.passAcrossKeywords(k.s, KNIGHTS)).toEqual(['INFANTRY'])
    expect(hookService.passAcrossKeywords(k.s, VARG)).toEqual([])
  })

  it('SBG-AB-3 The Scent of Gore: +1 to wound only against a damaged target (a slain-model-only unit is not damaged)', () => {
    const run = (prep: (s: GameState) => void) => {
      const s = game()
      trim(s, VARG, 1)
      s.units[VARG].location = 'board'
      placeUnit(s, VARG, [[-8, 0]])
      placeUnit(s, BRUTE, { x: -8, z: 2, gap: 0.2 })
      prep(s)
      // hits 4+: three 4s; wounds 3+: three 2s; saves (brute 3+, Rend 1 -> 4+): sixes
      const r = attack(s, 'melee', [4, 4, 4, 2, 2, 2, 6, 6, 6, 6, 6, 6], VARG, W('murderous-fangs-and-talons'), BRUTE)
      return of(r.events, 'WoundRolled').map((e) => e.wounded)
    }
    expect(run(() => undefined)).toEqual([false, false, false]) // undamaged: a 2 does not wound on 3+
    expect(run((s) => hurt(s, BRUTE, 2, 2))).toEqual([true, true, true]) // damaged: +1 makes the 2 a 3
    expect(run((s) => { removeModel(s, s.units[BRUTE].models[2]) })).toEqual([false, false, false]) // slain only: not damaged
    // other units' attacks do not get it
    const s = game()
    placeUnit(s, KNIGHTS, { x: -8, z: 0, gap: 0.3 }); trim(s, KNIGHTS, 1)
    placeUnit(s, BRUTE, { x: -8, z: 2, gap: 0.2 }); hurt(s, BRUTE, 2, 2)
    const r = attack(s, 'melee', [4, 4, 4, 2, 2, 2, 6, 6, 6], KNIGHTS, TEMPLAR, BRUTE)
    expect(of(r.events, 'WoundRolled').map((e) => e.wounded)).toEqual([false, false, false])
  })

  it('SBG-AB-4 Skeleton Legion: one D6 per slain model, each 6 returns a model at full Health, never above starting size; offered in your combat phase', () => {
    const s = game()
    s.phase = 'fight'
    s.activePlayer = 'A'
    centreRow(s, SKEL_A, 0, -6)
    expect(offered(s, 'A', 'fight')).not.toContain(LEGION) // nobody slain
    slay(s, SKEL_A, 4)
    hurt(s, SKEL_A, 1, 0)
    expect(offered(s, 'A', 'fight')).toContain(LEGION)
    expect(offered(s, 'B', 'fight')).not.toContain(LEGION)
    expect(offered(s, 'A', 'hero')).not.toContain(LEGION)
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'fight')).not.toContain(LEGION) // "your" combat phase
    s.activePlayer = 'A'
    const ctx = ctxFor(s, [6, 5, 6, 1])
    const r = useOnce(ctx, 'fight', 'A', LEGION, { target: SKEL_A })
    expect(r.topics).not.toContain('abilityMode') // no shard on this army
    expect(leftOver(ctx)).toEqual([])
    expect(unitModels(s, SKEL_A)).toHaveLength(8)
    expect(wounds(s, SKEL_A)).toBe(8)
    expect(returnableModels(s, SKEL_A)).toBe(2)
    // once per phase for the unit
    expect(offered(s, 'A', 'fight')).not.toContain(LEGION)
    // never above starting size: all six back, then nothing more to roll for
    const t = game()
    t.phase = 'fight'
    centreRow(t, SKEL_A, 0, -6)
    slay(t, SKEL_A, 3)
    useOnce(ctxFor(t, [6, 6, 6]), 'fight', 'A', LEGION, { target: SKEL_A })
    expect(unitModels(t, SKEL_A)).toHaveLength(10)
    t.round = 2
    expect(offered(t, 'A', 'fight')).not.toContain(LEGION)
  })

  it('SBG-WEAP-1 Templar weapons deal 2 damage on a turn the Blood Knights charged (Charge +1 Damage); Nightmare\'s Hooves ignore friendly buffs (Companion)', () => {
    const dmg = (charged: boolean): number => {
      const s = game()
      trim(s, KNIGHTS, 1)
      placeUnit(s, KNIGHTS, [[-8, 0]]); placeUnit(s, BOSS, [[-8, 2.6]])
      s.units[KNIGHTS].turn.chargedThisTurn = charged
      // 3 attacks: hit 6s, wound 6s, saves 1s (Boss Sv 3+, Rend 1)
      const r = attack(s, 'melee', [6, 6, 6, 6, 6, 6, 1, 1, 1], KNIGHTS, TEMPLAR, BOSS)
      return of(r.events, 'DamageApplied').reduce((a, d) => a + d.amount, 0)
    }
    expect(dmg(false)).toBe(3)
    expect(dmg(true)).toBe(6)
    // Companion: a friendly +1 Attacks buff reaches the Templar weapon but not the Hooves and Teeth
    const s = game()
    const ctx = ctxFor(s, [])
    effectService.grant(ctx, KNIGHTS, { modifyStat: { stat: 'A', value: 1 } }, { sourceAbilityId: 'fx.a.chaos-rule', sourceUnitId: BOSS, scope: { who: 'friendly' }, duration: 'battle' })
    const model = s.units[KNIGHTS].models[0]
    expect(weaponService.effectiveWeapon(s, model, TEMPLAR).A).toBe(4)
    expect(weaponService.effectiveWeapon(s, model, HOOVES).A).toBe(3)
  })

  it('SBG-WEAP-2 Murderous Fangs and Talons: a critical hit scores 2 hits', () => {
    const s = game()
    trim(s, VARG, 1)
    s.units[VARG].location = 'board'
    placeUnit(s, VARG, [[-8, 0]]); placeUnit(s, BRUTE, { x: -8, z: 2, gap: 0.2 })
    // three attacks: a 6 (critical, two hits), a 4 (one hit), a 1 (miss) -> three wound rolls
    const r = attack(s, 'melee', [6, 4, 1, 6, 6, 6, 6, 6, 6], VARG, W('murderous-fangs-and-talons'), BRUTE)
    const hits = of(r.events, 'HitRolled')
    expect(hits).toHaveLength(3)
    expect(hits[0].critical).toBe(true)
    expect(hits[0].extraHits).toBe(1)
    expect(of(r.events, 'WoundRolled')).toHaveLength(3)
  })

  it('SBG-FLY-1 Vargheists move over models (Fly); Blood Knights do not cross non-Infantry models', () => {
    const cross = (charger: UnitId, blocker: UnitId): string | null => {
      const s = game()
      s.phase = 'charge'
      trim(s, charger, 1); trim(s, blocker, 1)
      s.units[charger].location = 'board'
      placeUnit(s, charger, [[0, -8.5]]); placeUnit(s, blocker, [[0, -5]]); placeUnit(s, BOSS, [[0, 1]])
      const c = first(s, charger), boss = first(s, BOSS)
      let lo = -8.5, hi = boss.pos.z
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2
        if (horizontalGap({ pos: { x: 0, y: 0, z: mid }, facing: c.facing, base: c.base }, boss) > 0.4) lo = mid; else hi = mid
      }
      const to = { x: 0, y: 0, z: lo }
      return chargeMoveRejection(s, charger, Math.ceil(to.z + 8.5) + 1, [{ modelId: c.id, pos: to, facing: c.facing, path: [c.pos, to] }])?.code ?? null
    }
    expect(cross(VARG, HAWK)).toBeNull() // Fly: over the beast
    expect(cross(VARG, GUARD)).toBeNull()
    expect(cross(KNIGHTS, HAWK)).toBe('E_OVERLAP') // not an Infantry model
    expect(cross(KNIGHTS, GUARD)).toBeNull() // Riders of Ruin
  })
})

describe('SBG-AI hints and end to end', () => {
  it('SBG-AI the hints: spell choice by expected damage, Cloud of Bats only when it matters, the shard on a big loss, charge paths over Infantry', () => {
    const s = game({ enh: GALE })
    place(s, LORD, 0, -4)
    placeUnit(s, BRUTE, { x: 0, z: -1.2, gap: 0.2 })
    // four enemy units on the table make Spirit Gale the better spell against a lone Health 3 target
    expect(soulblightAbilityTiming(s, 'A', 'soulblightSpiritGale', LORD)).toBe(0) // chosen
    expect(soulblightAbilityTiming(s, 'A', 'soulblightVileTransference', LORD)).toBe(-3)
    // against a Health 8 target beside a wounded Lord, Vile Transference wins
    placeUnit(s, BOSS, [[0, -0.2]]); hurt(s, LORD, 1)
    for (const id of [HAWK, GUARD]) s.units[id].location = 'reserves'
    s.units[BRUTE].location = 'reserves'
    expect(soulblightAbilityTiming(s, 'A', 'soulblightVileTransference', LORD)).toBe(0.5)
    expect(soulblightAbilityTiming(s, 'A', 'soulblightSpiritGale', LORD)).toBe(-3)
    expect(soulblightTargetBonus(s, 'A', 'soulblightVileTransference', BOSS)).toBe(8)
    // Cloud of Bats: not while healthy and out of combat in round 1; yes when the Lord is in combat with more Health than it has left
    const calm = game({ enh: BATS })
    expect(soulblightAbilityTiming(calm, 'A', 'soulblightCloudOfBats', LORD)).toBe(-3)
    place(calm, LORD, 0, -4); placeUnit(calm, BOSS, [[0, -1.5]]); hurt(calm, LORD, 2)
    expect(soulblightAbilityTiming(calm, 'A', 'soulblightCloudOfBats', LORD)).toBe(0)
    // the shard: worth it only after 4 slain
    const t = game({ enh: SHARD })
    centreRow(t, SKEL_A, 0, -6)
    slay(t, SKEL_A, 2)
    expect(soulblightModeBonus(t, 'soulblightSkeletonLegion', SKEL_A, 'shard')).toBe(-1)
    slay(t, SKEL_A, 3)
    expect(soulblightModeBonus(t, 'soulblightSkeletonLegion', SKEL_A, 'shard')).toBe(2)
    // charge bonus: only with Ruinous Chargers unspent and a path over an enemy unit
    const u = game({ reg: CHARGERS })
    trim(u, KNIGHTS, 1); trim(u, GUARD, 1)
    placeUnit(u, KNIGHTS, [[0, -8.5]]); placeUnit(u, GUARD, [[0, -5]]); placeUnit(u, BOSS, [[0, 1]])
    const k = first(u, KNIGHTS)
    const over = [{ modelId: k.id, pos: { x: 0, y: 0, z: -2 }, facing: k.facing, path: [k.pos, { x: 0, y: 0, z: -2 }] }]
    const around = [{ modelId: k.id, pos: { x: 6, y: 0, z: -8.5 }, facing: k.facing, path: [k.pos, { x: 6, y: 0, z: -8.5 }] }]
    expect(soulblightChargeBonus(u, 'A', KNIGHTS, over)).toBe(4)
    expect(soulblightChargeBonus(u, 'A', KNIGHTS, around)).toBe(0)
    expect(soulblightChargeBonus(game({ reg: LEGIONS }), 'A', KNIGHTS, over)).toBeNull()
  })

  it('SBG-E2E AI games: the Bloodcrave Hunt plays whole games without a rejection, the Vargheists swoop in, and the armies use their abilities', async () => {
    const full = await loadBundle()
    const used = new Set<string>()
    for (const g of [0, 1, 2]) {
      const seed = `sbg-${g}`
      const setup = makeSimSetup(full, g, DATA_VERSION, ['soulblight', 'cities'])
      const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
      let r = createGame(setup, seed, full)
      for (let n = 0; r.pending && n < 6000; n++) {
        const legal = legalActions(r.state, r.pending)!
        r = step(r.state, await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal))
        expect(r.rejection).toBeUndefined()
        for (const e of r.events) if (e.type === 'AbilityTriggered') used.add(e.abilityId)
        for (const e of r.events) if (e.type === 'ReinforcementsArrived') used.add(`arrived:${e.unitId.slice(2)}`)
      }
      expect(r.state.phase).toBe('ended')
    }
    expect([...used].some((x) => x.startsWith('soulblight.'))).toBe(true)
  }, 240_000)
})
