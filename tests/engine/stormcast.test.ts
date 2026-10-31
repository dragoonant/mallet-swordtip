// Stormcast Eternals (Vigilant Brotherhood) code hooks and data: docs/spec/factions/stormcast-eternals.md, test ids SCE-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/stormcast files on top of the AoS fixture bundle
// (player A = Vigilant Brotherhood, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, unitModels,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService, feelNoPainFor, pendingAfterFightMortal } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { writeDeclaredMove } from '../../src/engine/declared'
import { effectService } from '../../src/engine/effects'
import { isCoherent } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { objectiveService } from '../../src/engine/objectives'
import { weaponService } from '../../src/engine/weapons'
import { chargeDiceCount } from '../../src/engine/phases/charge'
import { extraFightOf } from '../../src/engine/phases/fight'
import { unitIgnoresRetreatDamage } from '../../src/engine/phases/movement'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { stormcastAbilityTiming, stormcastModeBonus, stormcastTargetBonus, objectiveWhollyInTerritory } from '../../src/engine/factions/stormcast'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/stormcast/abilities.json'
import enhancementsJson from '../../src/data/factions/stormcast/enhancements.json'
import weaponsJson from '../../src/data/factions/stormcast/weapons.json'
import factionJson from '../../src/data/factions/stormcast/faction.json'
import patrolJson from '../../src/data/factions/stormcast/patrols/vigilant-brotherhood.json'
import vigilantJson from '../../src/data/factions/stormcast/datasheets/lord-vigilant.json'
import veritantJson from '../../src/data/factions/stormcast/datasheets/lord-veritant.json'
import prosecutorsJson from '../../src/data/factions/stormcast/datasheets/prosecutors.json'
import liberatorsJson from '../../src/data/factions/stormcast/datasheets/liberators.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [vigilantJson, veritantJson, prosecutorsJson, liberatorsJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.stormcast = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const SHIELD = 'stormcast.ability.shield-of-azyr'
const STORM = 'stormcast.ability.storm-charge'
const STRIKE = 'stormcast.ability.strike-where-needed'
const BLAZE = 'stormcast.ability.blaze-of-glory'
const SCROLLS = 'stormcast.enh.hallowed-scrolls'
const TALON = 'stormcast.enh.morrdas-talon'
const QUICK = 'stormcast.enh.quicksilver-draught'
const PENDANT = 'stormcast.enh.null-pendant'
const QUICK_AB = 'stormcast.ability.quicksilver-draught'
const PENDANT_AB = 'stormcast.ability.null-pendant'
const JUDGEMENT = 'stormcast.ability.deliver-judgement'
const PLAN = 'stormcast.ability.plan-the-attack'
const FIRES = 'stormcast.ability.cleansing-fires'

const GEN = 'A:lord-vigilant'
const VERI = 'A:lord-veritant'
const PROS = 'A:prosecutors'
const LIB = 'A:liberators'
const BRUTE = 'B:brute'
const BOSS = 'B:boss'

const W = (id: string) => `stormcast.weapon.${id}`
const CROW = 'gryph-crow'

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
  const stepX = 2 * r + gap
  s.units[unitId].location = 'board'
  ms.forEach((m, i) => { m.pos = { x: cx + (i - (ms.length - 1) / 2) * stepX, y: 0, z: cz } })
}

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'stormcast', patrolId: 'stormcast.army.vigilant-brotherhood', enhancementId: opts.enh ?? SCROLLS, regimentAbilityId: opts.reg ?? BLAZE }),
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
const ctxFor = (s: GameState, dice: number[] = []): EngineContext => {
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  rngs.set(ctx, rng)
  evs.set(ctx, events)
  return ctx
}
const leftOver = (ctx: EngineContext): number[] => rngs.get(ctx)?.remaining ?? []
const eventsOf = (ctx: EngineContext): GameEvent[] => evs.get(ctx) ?? []
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

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
const weapon = (s: GameState, unitId: UnitId, weaponId: string) => {
  const model = s.units[unitId].models.find((id) => s.models[id].weapons.includes(weaponId))!
  return weaponService.effectiveWeapon(s, model, weaponId)
}
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const ward = (s: GameState, id: UnitId, dice: number[] = []) => feelNoPainFor(ctxFor(s, dice), s.units[id].models[0], {} as never)?.threshold
const ensure = (s: GameState, code: string): void => { codeHooks[code].ensureEffects?.(ctxFor(s)) }

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

// a combat: Liberators beside the Brutes
function skirmish(s: GameState): void {
  centreRow(s, LIB, 0, -2)
  centreRow(s, BRUTE, 0, 0.8)
}

// ---------- tests ----------
describe('registry', () => {
  it('SCE-REG every code in the Stormcast data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('SCE-ARMY-3 only the Prosecutors and the Liberators are Reinforcements: the two Heroes are never offered for replacement', () => {
    const s = game()
    for (const id of [PROS, LIB]) expect(s.datasheets[s.units[id].datasheetId].keywords).toContain('REINFORCEMENTS')
    for (const id of [GEN, VERI]) expect(s.datasheets[s.units[id].datasheetId].keywords).not.toContain('REINFORCEMENTS')
    for (const id of [GEN, VERI, PROS, LIB]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A').sort()).toEqual([LIB, PROS])
  })
})

describe('SCE-BT battle traits', () => {
  it('SCE-BT-1 Shield of Azyr: any friendly unit gets Ward (5+) until your next turn; once per turn for the army, your hero phase only', () => {
    const s = game()
    skirmish(s)
    expect(offered(s, 'A', 'hero')).toContain(SHIELD)
    expect(ward(s, LIB)).toBeUndefined()
    const ctx = ctxFor(s)
    const r = useOnce(ctx, 'hero', 'A', SHIELD, { target: LIB })
    expect(r.options.find((o) => o.includes(LIB))).toEqual(expect.arrayContaining([GEN, VERI, PROS, LIB])) // any friendly unit, in combat or not
    expect(ward(s, LIB)).toBe(5)
    expect(ward(s, PROS)).toBeUndefined() // only the unit picked
    expect(offered(s, 'A', 'hero')).not.toContain(SHIELD) // once per turn for the army
    // until the start of your next turn
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(ward(s, LIB)).toBeUndefined()
    expect(offered(s, 'A', 'hero')).not.toContain(SHIELD) // same turn: still used
    s.round = 2
    expect(offered(s, 'A', 'hero')).toContain(SHIELD)
    // the enemy's hero phase and the other phases do not offer it
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'hero')).not.toContain(SHIELD)
    s.activePlayer = 'A'
    for (const w of ['movement', 'shooting', 'charge', 'fight'] as const) expect(offered(s, 'A', w)).not.toContain(SHIELD)
  })

  it('SCE-BT-2 Storm Charge: offered at the start of your charge phase, once per battle; a unit that ran may then charge; not a unit in combat', () => {
    const s = game()
    s.phase = 'charge'
    centreRow(s, PROS, -8, -3)
    skirmish(s) // the Liberators are in combat
    expect(offered(s, 'A', 'chargeStart')).toContain(STORM)
    expect(offered(s, 'A', 'charge')).not.toContain(STORM) // only the start of the phase
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'chargeStart')).not.toContain(STORM) // your charge phase
    s.activePlayer = 'A'
    s.units[PROS].turn.moveType = 'advance'
    expect(hookService.eligibilityFor?.(s, PROS, 'charge')).toBe(false)
    const ctx = ctxFor(s)
    const r = useOnce(ctx, 'chargeStart', 'A', STORM, { target: PROS })
    expect(r.options.find((o) => o.includes(PROS))).toContain(PROS)
    expect(r.options.find((o) => o.includes(PROS))).not.toContain(LIB) // a unit in combat is no target
    expect(hookService.eligibilityFor?.(s, PROS, 'charge')).toBe(true)
    expect(hookService.eligibilityFor?.(s, GEN, 'charge')).toBe(false) // nobody else
    // once per battle
    effectService.expire(ctx, 'turnEnd', null)
    s.round = 2
    expect(offered(s, 'A', 'chargeStart')).not.toContain(STORM)
  })
})

describe('SCE-RA regiment abilities', () => {
  const declare = (s: GameState, unitId: UnitId, moveType: 'normal' | 'advance' | 'fallBack' | 'stationary'): void => {
    s.phase = 'movement'
    s.activePlayer = 'A'
    writeDeclaredMove(s, { unitId, moveType })
  }

  it('SCE-RA-1 Strike Where Needed: offered when a friendly unit in combat declares a Retreat; no retreat mortal damage; it may charge; once per battle', () => {
    const s = game({ reg: STRIKE })
    skirmish(s)
    declare(s, LIB, 'normal')
    expect(offered(s, 'A', 'moveDeclared')).not.toContain(STRIKE) // only about a Retreat
    declare(s, PROS, 'fallBack')
    expect(offered(s, 'A', 'moveDeclared')).not.toContain(STRIKE) // and only a unit in combat
    declare(s, LIB, 'fallBack')
    expect(offered(s, 'A', 'moveDeclared')).toContain(STRIKE)
    expect(offered(s, 'A', 'movement')).not.toContain(STRIKE) // not an end-of-phase offer
    s.units[LIB].turn.moveType = 'fallBack'
    expect(unitIgnoresRetreatDamage(s, LIB)).toBe(false)
    expect(hookService.eligibilityFor?.(s, LIB, 'charge')).toBe(false)
    const ctx = ctxFor(s)
    useOnce(ctx, 'moveDeclared', 'A', STRIKE)
    expect(unitIgnoresRetreatDamage(s, LIB)).toBe(true)
    expect(hookService.eligibilityFor?.(s, LIB, 'charge')).toBe(true)
    // once per battle
    effectService.expire(ctx, 'turnEnd', null)
    s.round = 2
    declare(s, LIB, 'fallBack')
    expect(offered(s, 'A', 'moveDeclared')).not.toContain(STRIKE)
    expect(unitIgnoresRetreatDamage(s, LIB)).toBe(false)
  })

  it('SCE-RA-2 Blaze of Glory: each slain model rolls a D6 until the end of the phase; 4+ deals 1 mortal damage to an enemy in combat with the unit; once per battle', () => {
    const s = game()
    s.phase = 'fight'
    skirmish(s)
    expect(offered(s, 'A', 'fight')).toContain(BLAZE)
    const ctx = ctxFor(s)
    useOnce(ctx, 'fight', 'A', BLAZE, { target: LIB })
    // a Brute kills a Liberator: hit 4+, wound 3+, save 4+ (Sv 3+, Rend 1) fails on a 1, Damage 2 slays a 2-Health model
    const hit = attack(s, 'melee', [4, 3, 1, 4], BRUTE, 'fx.w.brute-axe', LIB, 1)
    expect(unitModels(s, LIB)).toHaveLength(4)
    expect(hit.rng.remaining).toEqual([])
    expect(pendingAfterFightMortal(s)).toEqual([expect.objectContaining({ targetUnitId: BRUTE, count: 1 })])
    expect(of(hit.events, 'AbilityTriggered').some((e) => e.summary.startsWith('Blaze of Glory: rolled 4'))).toBe(true)
    // a 3 fizzles
    const miss = attack(s, 'melee', [4, 3, 1, 3], BRUTE, 'fx.w.brute-axe', LIB, 1)
    expect(unitModels(s, LIB)).toHaveLength(3)
    expect(miss.rng.remaining).toEqual([])
    expect(pendingAfterFightMortal(s)).toHaveLength(1)
    // a unit that was not picked rolls nothing
    centreRow(s, PROS, 4, 0.8)
    const other = attack(s, 'melee', [4, 3, 1], BRUTE, 'fx.w.brute-axe', PROS, 1)
    expect(other.rng.remaining).toEqual([])
    // the mortal damage lands on the Brutes once the Fight is over
    effectService.expire(ctx, 'phaseEnd', null)
    const done = attack(s, 'melee', [4, 3, 1], BRUTE, 'fx.w.brute-axe', LIB, 1)
    expect(done.rng.remaining).toEqual([]) // the marker ended with the phase: no more rolls
    // once per battle
    s.round = 2
    expect(offered(s, 'A', 'fight')).not.toContain(BLAZE)
  })

  it('SCE-RA-2b Blaze of Glory outside an attack sequence strikes at once, for every slain model including the last one', () => {
    const s = game()
    s.phase = 'fight'
    skirmish(s)
    const ctx = ctxFor(s, [5, 5, 5, 5, 5])
    useOnce(ctx, 'fight', 'A', BLAZE, { target: LIB })
    const before = wounds(s, BRUTE)
    // four mortal damage slay two of the five Liberators, each rolls: 5 is 1 mortal damage on the Brutes
    attackService.queueMortalWounds(ctx, LIB, 4, 'test', false)
    expect(unitModels(s, LIB)).toHaveLength(3)
    expect(wounds(s, BRUTE)).toBe(before - 2)
    // the rest fall too, the last one as well
    attackService.queueMortalWounds(ctx, LIB, 6, 'test', false)
    expect(s.units[LIB].location).toBe('destroyed')
    expect(leftOver(ctx)).toEqual([])
    expect(wounds(s, BRUTE)).toBe(before - 5)
  })
})

describe('SCE-ENH enhancements', () => {
  it('SCE-ENH-1 Hallowed Scrolls gives the general Ward (5+) and nobody else', () => {
    const s = game({ enh: SCROLLS })
    expect(ward(s, GEN)).toBe(5)
    expect(ward(s, LIB)).toBeUndefined()
    expect(ward(s, PROS)).toBeUndefined()
    expect(ward(game({ enh: QUICK }), GEN)).toBeUndefined()
  })

  it('SCE-ENH-2 Morrda\'s Talon: Hallowed Greataxe critical hits deal 2 mortal damage and skip wound and save; the Beak and Talons do not', () => {
    const s = game({ enh: TALON })
    expect(weapon(s, GEN, W('hallowed-greataxe')).abilities.map((a) => a.ability)).toContain('CRIT_MORTAL')
    expect(weapon(s, GEN, W('gryph-stalker-beak-and-talons')).abilities.map((a) => a.ability)).not.toContain('CRIT_MORTAL')
    expect(weapon(game({ enh: SCROLLS }), GEN, W('hallowed-greataxe')).abilities.map((a) => a.ability)).not.toContain('CRIT_MORTAL')
    centreRow(s, GEN, 0, -2)
    centreRow(s, BRUTE, 0, 1)
    const before = wounds(s, BRUTE)
    const crit = attack(s, 'melee', [6], GEN, W('hallowed-greataxe'), BRUTE, 1)
    expect(crit.rng.remaining).toEqual([])
    expect(wounds(s, BRUTE)).toBe(before - 2)
    // the Beak and Talons have no Crit: the 6 goes through the ordinary wound roll (3+) and save (Sv 3+ with Rend 1)
    const beak = attack(s, 'melee', [6, 3, 1], GEN, W('gryph-stalker-beak-and-talons'), BRUTE, 1)
    expect(beak.rng.remaining).toEqual([])
    expect(wounds(s, BRUTE)).toBe(before - 4)
  })

  it('SCE-ENH-3 Quicksilver Draught: the general has Strike-first this combat phase only; once per battle', () => {
    const s = game({ enh: QUICK })
    s.phase = 'fight'
    expect(offered(s, 'A', 'hero')).not.toContain(QUICK_AB)
    expect(offered(s, 'A', 'fight')).toContain(QUICK_AB)
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'fight')).toContain(QUICK_AB) // any combat phase
    s.activePlayer = 'A'
    expect(hookService.eligibilityFor?.(s, GEN, 'fightFirst')).toBe(false)
    const ctx = ctxFor(s)
    useOnce(ctx, 'fight', 'A', QUICK_AB)
    expect(hookService.eligibilityFor?.(s, GEN, 'fightFirst')).toBe(true)
    expect(hookService.eligibilityFor?.(s, LIB, 'fightFirst')).toBe(false) // the general only
    effectService.expire(ctx, 'phaseEnd', null)
    expect(hookService.eligibilityFor?.(s, GEN, 'fightFirst')).toBe(false)
    s.round = 2
    expect(offered(s, 'A', 'fight')).not.toContain(QUICK_AB)
  })

  it('SCE-ENH-4 Null Pendant: one D6 per enemy unit contesting the general\'s objective; 2+ subtracts the roll from its control score this turn (floor 1); a 1 does nothing', () => {
    const s = game({ enh: PENDANT })
    s.phase = 'fight'
    centreRow(s, GEN, 0, 0)
    centreRow(s, BOSS, 0, -2.6) // OC 2
    centreRow(s, BRUTE, 0, 2.6) // 3 models, OC 3
    ensure(s, 'stormcastNullPendant')
    const control = (ctx: EngineContext): number => objectiveService.levelOfControl(s, 'obj-c', ctx).B
    const ctx = ctxFor(s, [1, 2])
    expect(control(ctx)).toBe(5)
    expect(offered(s, 'A', 'endOfTurn')).toContain(PENDANT_AB)
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'endOfTurn')).toContain(PENDANT_AB) // the end of any turn
    s.activePlayer = 'A'
    useOnce(ctx, 'endOfTurn', 'A', PENDANT_AB)
    expect(leftOver(ctx)).toEqual([]) // one die each, Boss then Brute (unit id order)
    expect(control(ctx)).toBe(3) // Boss unaffected by its 1, Brutes 3 - 2 = 1
    // the cut lasts for this turn's check only
    s.round = 2
    expect(control(ctx)).toBe(5)
    s.round = 1
    // a big roll never takes a unit below 1
    const t = game({ enh: PENDANT })
    centreRow(t, GEN, 0, 0)
    centreRow(t, BRUTE, 0, 2.6)
    ensure(t, 'stormcastNullPendant')
    const ctx2 = ctxFor(t, [6])
    useOnce(ctx2, 'endOfTurn', 'A', PENDANT_AB)
    expect(objectiveService.levelOfControl(t, 'obj-c', ctx2).B).toBe(1)
    // once per battle
    t.round = 2
    expect(offered(t, 'A', 'endOfTurn')).not.toContain(PENDANT_AB)
    // not offered when no enemy shares the objective
    const u = game({ enh: PENDANT })
    centreRow(u, GEN, 0, 0)
    expect(offered(u, 'A', 'endOfTurn')).not.toContain(PENDANT_AB)
    centreRow(u, BRUTE, 0, 8)
    expect(offered(u, 'A', 'endOfTurn')).not.toContain(PENDANT_AB)
  })
})

describe('SCE-AB warscroll abilities', () => {
  it('SCE-AB-1 Deliver Judgement: a non-Hero unit wholly within 12" fights twice and has Strike-last after its first fight; Heroes and units beyond 12" cannot be picked; once per battle', () => {
    const s = game()
    s.phase = 'fight'
    place(s, GEN, -2, -4)
    centreRow(s, LIB, 0, -4)
    centreRow(s, VERI, 4, -4) // a Hero within 12"
    centreRow(s, PROS, 13, -4) // beyond 12"
    centreRow(s, BRUTE, 0, -1)
    expect(offered(s, 'A', 'fight')).toContain(JUDGEMENT)
    const ctx = ctxFor(s)
    expect(codeHooks.stormcastDeliverJudgement.activate!.targets!(s, GEN)).toEqual([LIB]) // the Veritant is a Hero, the Prosecutors too far
    useOnce(ctx, 'fight', 'A', JUDGEMENT)
    expect(extraFightOf(s, LIB)).toEqual({ left: 1, strikeLast: true })
    expect(extraFightOf(s, PROS)).toBeNull()
    // once per battle
    s.round = 2
    expect(offered(s, 'A', 'fight')).not.toContain(JUDGEMENT)
    // nobody non-Hero within 12": not offered
    const t = game()
    t.phase = 'fight'
    place(t, GEN, -2, -4)
    centreRow(t, LIB, 14, 9)
    t.units[PROS].location = 'reserves'
    expect(offered(t, 'A', 'fight')).not.toContain(JUDGEMENT)
  })

  it('SCE-AB-2 Plan the Attack: only an objective you do not control; +1 to hit for friendly melee attacks on units contesting it, for the rest of the turn; ranged attacks unaffected', () => {
    const play = (usePlan: boolean) => {
      const s = game()
      s.objectives['obj-c'].controller = 'B'
      s.objectives['obj-a'].controller = 'A' // yours: not offered
      place(s, GEN, -2, -8)
      centreRow(s, LIB, 0, -3.2)
      centreRow(s, BRUTE, 0, 0)
      centreRow(s, PROS, 5, -3)
      const ctx = ctxFor(s)
      if (usePlan) {
        const r = runWindow(ctx, 'hero', 'A', (topic, ids) => (topic === 'abilityUse' ? ids.find((id) => id.startsWith(PLAN)) ?? 'pass' : topic === 'abilityMode' ? 'obj-c' : ids[0]))
        const modes = r.options[r.topics.indexOf('abilityMode')]
        expect(modes).toContain('obj-c')
        expect(modes).not.toContain('obj-a') // yours already
        expect(modes).toHaveLength(4)
      }
      return s
    }
    // 2 on the hit die: a miss without the plan, a hit (3) with it
    const without = play(false)
    const before = wounds(without, BRUTE)
    attack(without, 'melee', [2, 3, 1], LIB, W('warhammer'), BRUTE, 1)
    expect(wounds(without, BRUTE)).toBe(before)
    const planned = play(true)
    const hit = attack(planned, 'melee', [2, 3, 1], LIB, W('warhammer'), BRUTE, 1)
    expect(hit.rng.remaining).toEqual([])
    expect(wounds(planned, BRUTE)).toBe(before - 1)
    // a ranged attack from the same turn gets nothing (a 2 still misses)
    const ranged = attack(planned, 'ranged', [2], PROS, W('stormcall-javelin-ranged'), BRUTE, 1)
    expect(ranged.rng.remaining).toEqual([])
    expect(wounds(planned, BRUTE)).toBe(before - 1)
    // a target that does not contest the picked objective is not helped
    centreRow(planned, BRUTE, 0, 6)
    attack(planned, 'melee', [2, 3, 1], LIB, W('warhammer'), BRUTE, 1)
    expect(wounds(planned, BRUTE)).toBe(before - 1)
    // a Hero's help carries to a unit set up later in the turn; the next turn it is over
    expect(wounds(without, BRUTE)).toBe(before)
    // every objective yours: nothing to pick
    const all = game()
    for (const o of Object.values(all.objectives)) o.controller = 'A'
    place(all, GEN, -2, -8)
    expect(offered(all, 'A', 'hero')).not.toContain(PLAN)
  })

  it('SCE-AB-3 Cleansing Fires: chanting roll 3+ then one D6 per target model, each 5+ is 1 mortal damage; 1-2 does nothing; target visible and within 12"', () => {
    const s = game()
    place(s, VERI, -1, -6)
    centreRow(s, BRUTE, 0, 4) // 10" away
    expect(offered(s, 'A', 'hero')).toContain(FIRES)
    const ctx = ctxFor(s, [3, 5, 6, 4])
    const before = wounds(s, BRUTE)
    useOnce(ctx, 'hero', 'A', FIRES)
    expect(leftOver(ctx)).toEqual([])
    expect(wounds(s, BRUTE)).toBe(before - 2) // three dice (the 5 and the 6 count)
    // once per phase for the unit
    expect(offered(s, 'A', 'hero')).not.toContain(FIRES)
    // a failed chanting roll does nothing and uses the ability up
    const t = game()
    place(t, VERI, -1, -6)
    centreRow(t, BRUTE, 0, 4)
    const ctx2 = ctxFor(t, [2])
    useOnce(ctx2, 'hero', 'A', FIRES)
    expect(wounds(t, BRUTE)).toBe(9)
    expect(leftOver(ctx2)).toEqual([])
    expect(offered(t, 'A', 'hero')).not.toContain(FIRES)
    // beyond 12" nobody is a target
    const far = game()
    place(far, VERI, -1, -9)
    centreRow(far, BRUTE, 0, 5) // more than 12" away
    expect(offered(far, 'A', 'hero')).not.toContain(FIRES)
    // other phases and the enemy's hero phase do not offer it
    const phases = game()
    place(phases, VERI, -1, -6)
    centreRow(phases, BRUTE, 0, 4)
    phases.activePlayer = 'B'
    expect(offered(phases, 'A', 'hero')).not.toContain(FIRES)
  })

  it('SCE-AB-4 Sense Unholy Sorcery: Ward (5+) while the crow is present; an unmodified 1 on a ward roll removes the crow and the ward with it', () => {
    const s = game({ enh: QUICK })
    expect(s.units[VERI].tokens[CROW]).toBe(1)
    expect(ward(s, VERI)).toBe(5)
    expect(ward(s, GEN)).toBeUndefined()
    centreRow(s, VERI, 0, -1)
    centreRow(s, BRUTE, 0, 1.2)
    // a ward roll without a 1 keeps the crow: hit 4+, wound 3+, save fails, Damage 2 -> two ward dice
    const keep = attack(s, 'melee', [4, 3, 1, 2, 6], BRUTE, 'fx.w.brute-axe', VERI, 1)
    expect(keep.rng.remaining).toEqual([])
    expect(s.units[VERI].tokens[CROW]).toBe(1)
    expect(ward(s, VERI)).toBe(5)
    // an unmodified 1 removes it (and a 6 still ignores a point in the same roll)
    const lose = attack(s, 'melee', [4, 3, 1, 1, 6], BRUTE, 'fx.w.brute-axe', VERI, 1)
    expect(lose.rng.remaining).toEqual([])
    expect(s.units[VERI].tokens[CROW]).toBe(0)
    expect(of(lose.events, 'TokenRemoved')).toHaveLength(1)
    expect(ward(s, VERI)).toBeUndefined()
    // the crow is a token: it is not a model
    expect(unitModels(s, VERI)).toHaveLength(1)
  })

  it('SCE-AB-5 Heralds of Righteousness: Prosecutors roll 3D6 (summed) for charges; other units roll 2D6', () => {
    const s = game()
    expect(chargeDiceCount(s, PROS)).toBe(3)
    expect(hookService.chargeDiceBonus(s, PROS)).toBe(1)
    for (const id of [GEN, VERI, LIB, BRUTE]) expect(chargeDiceCount(s, id)).toBe(2)
  })

  it('SCE-AB-6 Skirmishers: Prosecutors stay coherent at up to 2" apart; other units need 1/2"', () => {
    const s = game()
    const range = (id: UnitId): number | undefined => s.datasheets[s.units[id].datasheetId].coherencyRange
    expect(range(PROS)).toBe(2)
    expect(range(LIB)).toBeUndefined()
    const spread = (id: UnitId, gap: number): void => {
      const ms = unitModels(s, id)
      const d = 2 * Math.max(ms[0].base.radius, ms[0].base.radius2 ?? 0) + gap
      ms.forEach((m, i) => { m.pos = { x: i * d, y: 0, z: 0 } })
    }
    spread(PROS, 1.9)
    expect(isCoherent(unitModels(s, PROS), range(PROS))).toBe(true)
    expect(isCoherent(unitModels(s, PROS))).toBe(false)
    spread(PROS, 2.5)
    expect(isCoherent(unitModels(s, PROS), range(PROS))).toBe(false)
    spread(LIB, 1.5)
    expect(isCoherent(unitModels(s, LIB), range(LIB))).toBe(false)
    spread(LIB, 0.4)
    expect(isCoherent(unitModels(s, LIB), range(LIB))).toBe(true)
  })

  it('SCE-AB-7 Stalwart Defenders: +3 control score on an objective wholly within friendly territory; nothing on the centre or enemy objectives', () => {
    const control = (s: GameState, obj: string): number => objectiveService.levelOfControl(s, obj, ctxFor(s)).A
    const s = game()
    ensure(s, 'stormcastStalwartDefenders')
    centreRow(s, LIB, -6, -6, 0.15) // obj-a, wholly in territory A
    expect(objectiveWhollyInTerritory(s, s.objectives['obj-a'], 'A')).toBe(true)
    expect(control(s, 'obj-a')).toBe(5 + 3) // one bonus for the unit, not one per model
    centreRow(s, LIB, 0, 0) // the centre objective straddles the line
    expect(objectiveWhollyInTerritory(s, s.objectives['obj-c'], 'A')).toBe(false)
    expect(control(s, 'obj-c')).toBe(5)
    centreRow(s, LIB, 6, 6) // the enemy's objective
    expect(control(s, 'obj-b')).toBe(5)
    expect(objectiveWhollyInTerritory(s, s.objectives['obj-b'], 'B')).toBe(true)
    // other units get nothing
    centreRow(s, LIB, 14, 9)
    centreRow(s, PROS, -6, -6)
    expect(control(s, 'obj-a')).toBe(3)
  })

  it('SCE-WEAP-1 Warhammer / Grandhammer Crit (Mortal) deals Damage as mortal damage on an unmodified 6 to hit', () => {
    const s = game()
    centreRow(s, LIB, 0, -2)
    centreRow(s, BRUTE, 0, 1)
    const before = wounds(s, BRUTE)
    const hammer = attack(s, 'melee', [6], LIB, W('warhammer'), BRUTE, 1)
    expect(hammer.rng.remaining).toEqual([]) // no wound roll, no save
    expect(wounds(s, BRUTE)).toBe(before - 1)
    const grand = attack(s, 'melee', [6], LIB, W('grandhammer'), BRUTE, 1)
    expect(grand.rng.remaining).toEqual([])
    expect(wounds(s, BRUTE)).toBe(before - 3)
    // a 5 is an ordinary hit
    const plain = attack(s, 'melee', [5, 3, 1], LIB, W('warhammer'), BRUTE, 1)
    expect(plain.rng.remaining).toEqual([])
    expect(wounds(s, BRUTE)).toBe(before - 4)
  })

  it('SCE-WEAP-2 Judgement Blade gets +1 Rend against a Wizard, +1 against a Priest, +2 against a unit that is both', () => {
    // a save die of 5 shows the Rend it was rolled against: final = 5 - Rend (the Brutes' Sv 3+ is `needed`)
    const final = (keywords: string[], weaponId = 'judgement-blade'): number => {
      const s = game({ patch: (b) => { b.datasheets['fx.brute'].keywords.push(...keywords) } })
      centreRow(s, VERI, 0, -1)
      centreRow(s, BRUTE, 0, 1.2)
      const r = attack(s, 'melee', [4, 3, 5, 1, 1, 1], VERI, W(weaponId), BRUTE, 1)
      return of(r.events, 'SaveRolled')[0].final
    }
    expect(final([])).toBe(4) // Rend 1
    expect(final(['WIZARD'])).toBe(3)
    expect(final(['PRIEST'])).toBe(3)
    expect(final(['WIZARD', 'PRIEST'])).toBe(2)
    // the Staff of Abjuration has no Anti
    expect(final(['WIZARD', 'PRIEST'], 'staff-of-abjuration')).toBe(4)
  })

  it('SCE-WEAP-3 Companion Beak and Talons ignore friendly weapon-characteristic modifiers', () => {
    const s = game()
    expect(weapon(s, GEN, W('hallowed-greataxe')).A).toBe(5)
    expect(weapon(s, GEN, W('gryph-stalker-beak-and-talons')).A).toBe(3)
    const ctx = ctxFor(s)
    effectService.grant(ctx, GEN, { modifyStat: { stat: 'A', value: 1 } }, { sourceAbilityId: 'test', sourceUnitId: GEN, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    expect(weapon(s, GEN, W('hallowed-greataxe')).A).toBe(6)
    expect(weapon(s, GEN, W('gryph-stalker-beak-and-talons')).A).toBe(3)
  })

  it('SCE-FLY-1 Prosecutors move over models (Fly); the Lord-Vigilant, Lord-Veritant and Liberators do not', () => {
    const s = game()
    const kw = (id: UnitId): string[] => s.datasheets[s.units[id].datasheetId].keywords
    expect(kw(PROS)).toContain('FLY')
    for (const id of [GEN, VERI, LIB]) expect(kw(id)).not.toContain('FLY')
  })
})

describe('Stormcast AI hints', () => {
  it('SCE-AI hints: the timing and target hooks pass on a pointless once-per-battle use and favour the right unit', () => {
    const s = game({ enh: QUICK, reg: BLAZE })
    s.phase = 'charge'
    // nobody ran, nobody in combat: Storm Charge and Quicksilver are better saved
    expect(stormcastAbilityTiming(s, 'A', 'stormcastStormCharge', null)).toBe(-3)
    expect(stormcastAbilityTiming(s, 'A', 'stormcastQuicksilverDraught', GEN)).toBe(-3)
    expect(stormcastAbilityTiming(s, 'A', 'stormcastBlazeOfGlory', null)).toBe(-3)
    expect(stormcastAbilityTiming(s, 'A', 'stormcastDeliverJudgement', GEN)).toBe(-3)
    expect(stormcastAbilityTiming(s, 'A', 'stormcastNullPendant', GEN)).toBe(-3)
    // Prosecutors that ran with an enemy in reach: Storm Charge is on
    centreRow(s, PROS, 0, -5)
    centreRow(s, BRUTE, 0, 4)
    s.units[PROS].turn.moveType = 'advance'
    expect(stormcastAbilityTiming(s, 'A', 'stormcastStormCharge', null)).toBe(0)
    expect(stormcastTargetBonus(s, 'A', 'stormcastStormCharge', PROS)).toBeGreaterThan(stormcastTargetBonus(s, 'A', 'stormcastStormCharge', LIB)!)
    // a crowd in combat: Blaze of Glory and Deliver Judgement go to the Liberators
    s.phase = 'fight'
    place(s, GEN, -2, -4)
    skirmish(s)
    expect(stormcastAbilityTiming(s, 'A', 'stormcastBlazeOfGlory', null)).toBe(0)
    expect(stormcastAbilityTiming(s, 'A', 'stormcastDeliverJudgement', GEN)).toBe(0)
    expect(stormcastTargetBonus(s, 'A', 'stormcastDeliverJudgement', LIB)).toBeGreaterThan(stormcastTargetBonus(s, 'A', 'stormcastDeliverJudgement', PROS)!)
    // Shield of Azyr skips a unit that already has a ward
    expect(stormcastTargetBonus(s, 'A', 'stormcastShieldOfAzyr', LIB)).toBeGreaterThan(stormcastTargetBonus(s, 'A', 'stormcastShieldOfAzyr', VERI)!)
    // Plan the Attack ranks an objective the army is near over a far one
    centreRow(s, LIB, -6, -3)
    expect(stormcastModeBonus(s, 'stormcastPlanTheAttack', GEN, 'obj-a')).toBeGreaterThan(stormcastModeBonus(s, 'stormcastPlanTheAttack', GEN, 'obj-b')!)
    expect(stormcastModeBonus(s, 'someOtherCode', GEN, 'obj-a')).toBeNull()
  })
})
