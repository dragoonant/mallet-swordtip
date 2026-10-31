// Sons of Behemat (Stone Lobbas) code hooks: docs/spec/factions/sons-of-behemat.md, test ids SOB-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/behemat files on top of the AoS fixture bundle
// (player A = Stone Lobbas: Boulder Basher general + 2 Rock-hurlers, player B = the fixture Chaos army: Boss, Brutes, Hawk, Guard).
// Dice are scripted; nothing here patches the shipped data. All units start in reserves; each test places the ones it needs.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, removeModel, unitModels,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { objectiveService } from '../../src/engine/objectives'
import { chargeRollModifier } from '../../src/engine/phases/charge'
import { buildShootingWeaponEntries, targetLegality } from '../../src/engine/phases/shooting'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { modelStats } from '../../src/engine/state'
import { behematAbilityTiming, behematModeBonus, behematOptionUnit, behematTargetBonus, dtrUsed } from '../../src/engine/factions/behemat'
import { weaponService } from '../../src/engine/weapons'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import type { ChargeState } from '../../src/engine/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/behemat/abilities.json'
import enhancementsJson from '../../src/data/factions/behemat/enhancements.json'
import weaponsJson from '../../src/data/factions/behemat/weapons.json'
import factionJson from '../../src/data/factions/behemat/faction.json'
import patrolJson from '../../src/data/factions/behemat/patrols/stone-lobbas.json'
import basherJson from '../../src/data/factions/behemat/datasheets/boulder-basher.json'
import hurlerJson from '../../src/data/factions/behemat/datasheets/rock-hurler.json'

// ---------- fixtures ----------
const bundle = (): DataBundle => withAosBundle((b) => {
  // cloned: a test that patches the data must not leak into the next one
  for (const a of structuredClone(abilitiesJson) as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of structuredClone(weaponsJson) as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of structuredClone([basherJson, hurlerJson].flat()) as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of structuredClone(enhancementsJson) as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.behemat = structuredClone(factionJson) as unknown as FactionData
  b.patrols[patrolJson.id] = structuredClone(patrolJson) as unknown as DataBundle['patrols'][string]
})

const A = (id: string) => `behemat.ability.${id}`
const BOWLED = A('bowled-over')
const COE = A('close-one-eye')
const SURLY = A('surly-sorts')
const GREEDY = A('greedy-and-grabby')
const DTR = A('drop-toss-or-roll')
const ARD = A('ard-ead')
const LUCKY = A('lucky-rock')
const GOBBLER = A('hungry-gobbler')
const ENH = { ard: 'behemat.enh.ard-ead', strides: 'behemat.enh.humongous-strides', lucky: 'behemat.enh.lucky-rock', gobbler: 'behemat.enh.hungry-gobbler' }
const ROCKS = 'behemat.weapon.hurlin-rocks'
const CLUB = 'behemat.weapon.massive-club-and-rocks'
const BUTT = 'behemat.weapon.eadbutt'

const BASH = 'A:boulder-basher'
const HU1 = 'A:rock-hurler-1'
const HU2 = 'A:rock-hurler-2'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'
const HAWK = 'B:hawk'

// one model of the unit on the board at (x, z)
function put(s: GameState, unitId: UnitId, x: number, z: number): void {
  s.units[unitId].location = 'board'
  const ms = unitModels(s, unitId)
  const r = Math.max(...ms.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
  const step = 2 * r + 0.15
  ms.forEach((m, i) => { m.pos = { x: x + (i - (ms.length - 1) / 2) * step, y: 0, z } })
}

const kill = (s: GameState, unitId: UnitId): void => { for (const id of [...s.units[unitId].models]) removeModel(s, id) }

function game(opts: { enh?: string; reg?: string; round?: number; phase?: GameState['phase']; active?: PlayerId } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'behemat', patrolId: 'behemat.army.stone-lobbas', enhancementId: opts.enh ?? ENH.strides, regimentAbilityId: opts.reg ?? GREEDY }),
      B: makeAosPlayer('B'),
    },
  }, bundle())
  s.round = opts.round ?? 1
  s.phase = opts.phase ?? 'command'
  s.activePlayer = opts.active ?? 'A'
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
const of = <T extends GameEvent['type']>(list: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  list.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

type Pick = (topic: string, ids: string[], p: ChooseOptionDecision) => string

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: Pick): string[] {
  const topics: string[] = []
  for (let i = 0; i < 30; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return topics
    const p = ctx.state.pending as ChooseOptionDecision
    const ids = p.options.map((o) => o.id)
    const choice = pick(p.context.topic, ids, p)
    topics.push(p.context.topic)
    ctx.state.pending = null
    const action = choice === 'pass' ? { type: 'pass' as const, player, decisionId: p.id } : { type: 'chooseOption' as const, player, decisionId: p.id, optionId: choice }
    const rej = abilityService.handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

interface Use { id: string; unit?: string; target?: string; mode?: string }
// use the listed abilities in order (by ability id, optionally by the unit behind the option), then pass; every other offer is declined
function useSeq(ctx: EngineContext, window: AbilityWindow, player: PlayerId, uses: Use[]): void {
  const queue = [...uses]
  let current: Use | undefined
  runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      current = queue.shift()
      if (!current) return 'pass'
      const cur = current
      return ids.find((id) => id.startsWith(`${cur.id}#`) && (!cur.unit || id.endsWith(`#${cur.unit}`))) ?? 'pass'
    }
    if (topic === 'abilityTarget') return current?.target ?? ids[0]
    if (topic === 'abilityMode') return current?.mode ?? ids[0]
    return ids[0]
  })
}
// use one ability once
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { unit?: string; target?: string; mode?: string } = {}): void {
  useSeq(ctx, window, player, [{ id: abilityId, ...opts }])
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const offeredFor = (s: GameState, player: PlayerId, window: AbilityWindow, abilityId: string): (string | null)[] =>
  abilityService.usable(s, player, window).filter((u) => u.abilityId === abilityId).map((u) => u.unitId)
const targetsOf = (code: string, s: GameState, unitId: UnitId | null, player: PlayerId): UnitId[] =>
  (codeHooks[code].activate!.targets as unknown as (state: GameState, unitId: UnitId | null, player: PlayerId) => UnitId[])(s, unitId, player)
const modesOf = (s: GameState, unitId: UnitId, player: PlayerId): string[] =>
  (codeHooks.behematDropTossRoll.activate!.modesFor!(s, unitId, player) ?? []).map((m) => m.id)
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const weaponOf = (s: GameState, unitId: UnitId, weaponId: string) => {
  const m = unitModels(s, unitId).find((x) => x.weapons.includes(weaponId))!
  return weaponService.effectiveWeapon(s, m.id, weaponId)!
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
const hitsOf = (events: GameEvent[]): number => of(events, 'HitRolled').filter((h) => h.hit).length

// a charge roll with the given dice, and the modifier the charge-roll hooks add to it
function chargeMod(s: GameState, unitId: UnitId, dice: number[] = [3, 3]): number {
  const ctx = ctxFor(s, dice)
  const roll = ctx.roll({ purpose: 'charge', player: s.units[unitId].player, sides: 6, count: dice.length, mode: 'sum', unitId })
  const charge: ChargeState = { unitId, targetUnitIds: [], roll: [dice[0], dice[1]], rerolled: false, distance: null, heroic: false }
  return chargeRollModifier(ctx, charge, roll)
}

// "damage allocated to the unit by this unit's shooting attack this phase": the ledger mark attack.ts writes
const markShot = (s: GameState, from: UnitId, to: UnitId): void => { s.phaseState.marks.push(`shotDmg:${from}>${to}`) }

// the three gargants in a row in the southern half, the enemy far away to the north
function spread(s: GameState): void {
  put(s, BASH, -6, -8)
  put(s, HU1, 0, -8)
  put(s, HU2, 6, -8)
}

// ---------- tests ----------
describe('registry', () => {
  it('SOB-REG every code in the Behemat data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })
})

describe('SOB-ARMY roster', () => {
  it('SOB-ARMY-1 Stone Lobbas builds: Boulder Basher general + 2 Rock-hurlers, 3 models, each Move 8" / Health 12 / Save 5+ / Control 5, no Ward', () => {
    const s = game()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine.map((u) => u.id).sort()).toEqual([BASH, HU1, HU2])
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(3)
    expect(s.players.A.warlordUnitId).toBe(BASH)
    for (const u of mine) {
      const st = modelStats(s, unitModels(s, u.id)[0])
      expect([st.M, st.W, st.Sv, st.OC], u.id).toEqual([8, 12, 5, 5])
      expect(st.ward, u.id).toBeNull()
    }
    // the regiment ability and the enhancement the setup picked are on the army
    expect(s.players.A.regimentAbilityId).toBe(GREEDY)
    expect(s.players.A.battleTraitIds).toEqual(['behemat.ability.boulder-basher', BOWLED, COE])
  })

  it('SOB-ARMY-2 every model carries Hurlin\' Rocks, Massive Club and Rocks and \'Eadbutt; Hurlin\' Rocks has no Shoot in Combat by default', () => {
    const s = game()
    for (const id of [BASH, HU1, HU2]) {
      const m = unitModels(s, id)[0]
      expect([...m.weapons].sort()).toEqual([BUTT, CLUB, ROCKS].sort())
      const rocks = weaponService.effectiveWeapon(s, m.id, ROCKS)!
      expect(rocks.abilities.map((a) => a.ability)).not.toContain('SHOOT_IN_COMBAT')
    }
    // in combat the Rocks cannot be used
    spread(s)
    put(s, BRUTE, 0, -4)
    s.phase = 'shooting'
    const m = unitModels(s, HU1)[0]
    expect(targetLegality(s, HU1, m.id, weaponService.effectiveWeapon(s, m.id, ROCKS)!, BRUTE)?.code).toBe('E_IN_COMBAT')
  })
})

describe('SOB-BT battle traits', () => {
  it('SOB-BT-1 Boulder Basher: the general has HERO and no REINFORCEMENTS; only the two other Rock-hurlers are ever offered to Call for Reinforcements', () => {
    const s = game()
    const kw = (id: UnitId) => s.datasheets[s.units[id].datasheetId].keywords
    expect(kw(BASH)).toContain('HERO')
    expect(kw(BASH)).not.toContain('REINFORCEMENTS')
    for (const id of [HU1, HU2]) { expect(kw(id)).toContain('REINFORCEMENTS'); expect(kw(id)).not.toContain('HERO') }
    for (const id of [BASH, HU1, HU2]) expect(kw(id)).toContain('MONSTER')
    for (const id of [BASH, HU1, HU2]) kill(s, id)
    expect(replaceableUnits(s, 'A').sort()).toEqual([HU1, HU2])
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).toContain('core.ability.call-for-reinforcements')
    expect(targetsOf('spearheadCallForReinforcements', s, null, 'A').sort()).toEqual([HU1, HU2])
    // with only the general down nothing is on offer
    const t = game()
    kill(t, BASH)
    expect(replaceableUnits(t, 'A')).toEqual([])
    t.phase = 'movement'
    expect(offered(t, 'A', 'movement')).not.toContain('core.ability.call-for-reinforcements')
  })

  it('SOB-BT-2 Bowled Over: only enemy units that friendly shooting damaged this phase can be picked; 3+ marks the unit, 1-2 does nothing; once per phase', () => {
    const s = game({ phase: 'shooting' })
    spread(s)
    put(s, GUARD, 0, 2)
    put(s, BRUTE, 8, 2)
    // nothing was shot yet: not offered (the Drop, Toss or Roll options are)
    expect(offered(s, 'A', 'shooting')).not.toContain(BOWLED)
    // a real Hurlin' Rocks attack from the first Rock-hurler wounds the Guard (hit 6, wound 6, save 1, damage D3 from a 6 = 3)
    const r = attack(s, 'ranged', [6, 6, 1, 6], HU1, ROCKS, GUARD, 1)
    expect(of(r.events, 'DamageApplied').length).toBeGreaterThan(0)
    s.phase = 'shooting'
    expect(offered(s, 'A', 'shooting')).toContain(BOWLED)
    expect(targetsOf('behematBowledOver', s, null, 'A')).toEqual([GUARD])
    // a 2 on the declared roll: the ability is used up and nothing is marked
    const f = JSON.parse(JSON.stringify(s)) as GameState
    const fail = ctxFor(f, [2])
    useOnce(fail, 'shooting', 'A', BOWLED)
    expect(f.units[GUARD].effects.filter((e) => e.sourceAbilityId === BOWLED)).toHaveLength(0)
    expect(offered(f, 'A', 'shooting')).not.toContain(BOWLED)
    expect(leftOver(fail)).toEqual([])
    // a 3: marked, until the start of the user's next turn
    const ctx = ctxFor(s, [3])
    useOnce(ctx, 'shooting', 'A', BOWLED)
    const mark = s.units[GUARD].effects.filter((e) => e.sourceAbilityId === BOWLED)
    expect(mark).toHaveLength(1)
    expect(mark[0].expires).toMatchObject({ kind: 'nextOwnTurn', player: 'A' })
    expect(s.units[BRUTE].effects.filter((e) => e.sourceAbilityId === BOWLED)).toHaveLength(0)
    expect(leftOver(ctx)).toEqual([])
    expect(summaries(ctx).join('|')).toMatch(/Bowled Over/)
    // once per phase: not offered again, even with another damaged unit
    markShot(s, HU2, BRUTE)
    expect(offered(s, 'A', 'shooting')).not.toContain(BOWLED)
    // the next shooting phase has no marks: nothing to pick
    s.phaseState.marks = []
    expect(targetsOf('behematBowledOver', s, null, 'A')).toEqual([])
  })

  it('SOB-BT-3 Bowled Over mark: the marked unit charges with the lowest die twice (2D6), or only its highest die replaced (3+ dice), after re-rolls; it ends at the start of the Sons player\'s next turn', () => {
    const s = game({ phase: 'shooting' })
    spread(s)
    put(s, BRUTE, 0, 2)
    put(s, GUARD, 8, 2)
    markShot(s, HU1, BRUTE)
    useOnce(ctxFor(s, [4]), 'shooting', 'A', BOWLED)
    expect(s.units[BRUTE].effects.some((e) => e.sourceAbilityId === BOWLED)).toBe(true)
    s.phase = 'charge'
    s.activePlayer = 'B'
    // 2D6: 3 + 5 = 8 becomes 3 + 3 = 6, a modifier of -2; equal dice change nothing
    expect(chargeMod(s, BRUTE, [3, 5])).toBe(-2)
    expect(chargeMod(s, BRUTE, [5, 3])).toBe(-2)
    expect(chargeMod(s, BRUTE, [6, 1])).toBe(-5)
    expect(chargeMod(s, BRUTE, [4, 4])).toBe(0)
    // an unmarked enemy unit rolls normally
    expect(chargeMod(s, GUARD, [3, 5])).toBe(0)
    // extra charge dice: only the single highest die becomes the lowest (2 + 5 + 6 = 13 -> 2 + 5 + 2 = 9)
    effectService.grant(ctxFor(s), BRUTE, { extraChargeDice: 1 }, { sourceAbilityId: 'test', sourceUnitId: BRUTE, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    expect(chargeMod(s, BRUTE, [2, 5, 6])).toBe(-4)
    // it reads the dice as they stand after a re-roll: 6 and 3, the 6 re-rolled to a 1, becomes 1 and 3 -> 2
    const ctx = ctxFor(s, [6, 3, 1])
    const roll = ctx.roll({ purpose: 'charge', player: 'B', sides: 6, count: 2, mode: 'sum', unitId: BRUTE })
    const again = ctx.reroll(roll, [0], 'test')
    expect(again.dice).toEqual([1, 3])
    const charge: ChargeState = { unitId: BRUTE, targetUnitIds: [], roll: [1, 3], rerolled: true, distance: null, heroic: false }
    expect(chargeRollModifier(ctx, charge, again)).toBe(-2)
    // the mark outlasts the enemy's own next turn start and ends when the Sons player's turn begins
    effectService.expire(ctxFor(s), 'nextOwnTurn', 'B')
    expect(s.units[BRUTE].effects.some((e) => e.sourceAbilityId === BOWLED)).toBe(true)
    effectService.expire(ctxFor(s), 'nextOwnTurn', 'A')
    expect(s.units[BRUTE].effects.some((e) => e.sourceAbilityId === BOWLED)).toBe(false)
    expect(chargeMod(s, BRUTE, [3, 5])).toBe(0)
  })

  it('SOB-BT-4 Close One Eye!: needs the general on the board; targets another friendly unit wholly within 12"; +1 to its shooting hit rolls for the turn; never the general itself', () => {
    const s = game({ phase: 'command' })
    // HU1 close to the general, HU2 too far to be wholly within 12"
    put(s, BASH, -6, -8)
    put(s, HU1, 0, -8)
    put(s, HU2, 12, -8)
    put(s, GUARD, 0, 3)
    expect(offered(s, 'A', 'hero')).toContain(COE)
    expect(targetsOf('behematCloseOneEye', s, null, 'A')).toEqual([HU1])
    const ctx = ctxFor(s)
    useOnce(ctx, 'hero', 'A', COE)
    expect(summaries(ctx).join('|')).toMatch(/Close One Eye!/)
    // +1 to hit for HU1's shooting only: a 3 hits (4+ without the bonus); HU2 and the general still need 4+
    expect(hitsOf(attack(s, 'ranged', [3, 1, 1], HU1, ROCKS, GUARD, 1).events)).toBe(1)
    expect(hitsOf(attack(s, 'ranged', [3], HU2, ROCKS, GUARD, 1).events)).toBe(0)
    expect(hitsOf(attack(s, 'ranged', [3], BASH, ROCKS, GUARD, 1).events)).toBe(0)
    // melee is not helped
    put(s, BRUTE, 0, -5)
    expect(hitsOf(attack(s, 'melee', [3], HU1, BUTT, BRUTE, 1).events)).toBe(0)
    // once per phase (the army-wide Rule of One), and not at all without the general
    s.phase = 'command'
    expect(offered(s, 'A', 'hero')).not.toContain(COE)
    const t = game({ phase: 'command' })
    put(t, HU1, 0, -8)
    put(t, BASH, -6, -8)
    kill(t, BASH)
    expect(offered(t, 'A', 'hero')).not.toContain(COE)
  })
})

describe('SOB-RA regiment abilities', () => {
  it('SOB-RA-1 Surly Sorts: once per battle, a friendly unit in combat gets +1 Attacks on both melee weapons until end of turn; ranged weapons unchanged', () => {
    const s = game({ reg: SURLY, phase: 'fight' })
    put(s, HU1, 0, -2)
    put(s, BRUTE, 0, 3)
    put(s, HU2, 8, -8)
    put(s, BASH, -8, -8)
    expect(targetsOf('behematSurlySorts', s, null, 'A')).toEqual([HU1])
    expect([weaponOf(s, HU1, CLUB).A, weaponOf(s, HU1, BUTT).A, weaponOf(s, HU1, ROCKS).A]).toEqual([4, 1, 3])
    const ctx = ctxFor(s)
    useOnce(ctx, 'fight', 'A', SURLY)
    expect([weaponOf(s, HU1, CLUB).A, weaponOf(s, HU1, BUTT).A, weaponOf(s, HU1, ROCKS).A]).toEqual([5, 2, 3])
    expect(weaponOf(s, HU2, CLUB).A).toBe(4)
    expect(summaries(ctx).join('|')).toMatch(/Surly Sorts/)
    // gone at the end of the turn, and spent for the battle
    effectService.expire(ctxFor(s), 'turnEnd', null)
    expect(weaponOf(s, HU1, CLUB).A).toBe(4)
    s.round = 3
    s.players.A.abilityUses.forEach((u) => { u.round = 1 })
    for (const u of Object.values(s.units)) u.turn.abilitiesUsedThisPhase = []
    expect(offered(s, 'A', 'fight')).not.toContain(SURLY)
    // never offered without a unit in combat
    const t = game({ reg: SURLY, phase: 'fight' })
    put(t, HU1, 0, -8)
    put(t, BRUTE, 0, 3)
    expect(offered(t, 'A', 'fight')).not.toContain(SURLY)
  })

  it('SOB-RA-2 Greedy and Grabby: each friendly unit\'s control score on an objective is 10 (5 + 5); a reinforcement replacement too', () => {
    const s = game({ reg: GREEDY })
    // obj-a sits at (-6, -6)
    put(s, HU1, -6, -6)
    put(s, HU2, 6, 6)
    expect(objectiveService.levelOfControl(s, 'obj-a').A).toBe(10)
    expect(objectiveService.levelOfControl(s, 'obj-b').A).toBe(10)
    // without the regiment ability each is 5
    const t = game({ reg: SURLY })
    put(t, HU1, -6, -6)
    expect(objectiveService.levelOfControl(t, 'obj-a').A).toBe(5)
    // the replacement of a destroyed Rock-hurler has it as well
    s.phase = 'movement'
    put(s, GUARD, 10, 8)
    kill(s, HU1)
    const ctx = ctxFor(s)
    runWindow(ctx, 'movement', 'A', (topic, ids) => (topic === 'abilityUse' ? (ids.find((i) => i.startsWith('core.ability.call-for-reinforcements')) ?? 'pass') : ids[0]))
    const copy = Object.values(s.units).find((u) => u.replacementOf === HU1)!
    expect(copy.location).toBe('board')
    unitModels(s, copy.id)[0].pos = { x: -6, y: 0, z: -6 }
    expect(objectiveService.levelOfControl(s, 'obj-a').A).toBe(10)
  })
})

describe('SOB-ENH enhancements', () => {
  it('SOB-ENH-1 \'Ard \'Ead: once per battle, the general\'s \'Eadbutt hits on 3+ for the rest of the turn; Massive Club and Rocks unchanged', () => {
    const s = game({ enh: ENH.ard, phase: 'fight' })
    put(s, BASH, 0, -2)
    put(s, BRUTE, 0, 3)
    put(s, HU1, 8, -8)
    put(s, HU2, -8, -8)
    expect(offered(s, 'A', 'fight')).toContain(ARD)
    // before: a 3 misses with the \'Eadbutt (4+)
    expect(hitsOf(attack(s, 'melee', [3], BASH, BUTT, BRUTE, 1).events)).toBe(0)
    s.phase = 'fight'
    const ctx = ctxFor(s)
    useOnce(ctx, 'fight', 'A', ARD)
    expect(summaries(ctx).join('|')).toMatch(/'Ard 'Ead/)
    expect(hitsOf(attack(s, 'melee', [3, 1], BASH, BUTT, BRUTE, 1).events)).toBe(1)
    expect(hitsOf(attack(s, 'melee', [3, 3, 3, 3], BASH, CLUB, BRUTE, 4).events)).toBe(0)
    // once per battle, even in a later round
    s.round = 3
    s.phase = 'fight'
    for (const u of Object.values(s.units)) u.turn.abilitiesUsedThisPhase = []
    expect(offered(s, 'A', 'fight')).not.toContain(ARD)
  })

  it('SOB-ENH-2 Humongous Strides: +1 to the general\'s charge rolls only', () => {
    const s = game({ enh: ENH.strides, phase: 'charge' })
    for (const id of [BASH, HU1, HU2]) put(s, id, 0, -8)
    expect(chargeMod(s, BASH)).toBe(1)
    expect(chargeMod(s, HU1)).toBe(0)
    expect(chargeMod(s, HU2)).toBe(0)
    // another enhancement gives no bonus
    const t = game({ enh: ENH.ard, phase: 'charge' })
    put(t, BASH, 0, -8)
    expect(chargeMod(t, BASH)).toBe(0)
  })

  it('SOB-ENH-3 Lucky Rock: once per battle, the general\'s Hurlin\' Rocks makes 4 attacks for the rest of the turn', () => {
    const s = game({ enh: ENH.lucky, phase: 'shooting' })
    spread(s)
    put(s, GUARD, -6, 2)
    expect(weaponOf(s, BASH, ROCKS).A).toBe(3)
    expect(offered(s, 'A', 'shooting')).toContain(LUCKY)
    const ctx = ctxFor(s)
    useOnce(ctx, 'shooting', 'A', LUCKY)
    expect(summaries(ctx).join('|')).toMatch(/Lucky Rock/)
    expect(weaponOf(s, BASH, ROCKS).A).toBe(4)
    expect(weaponOf(s, BASH, CLUB).A).toBe(4)
    expect(weaponOf(s, HU1, ROCKS).A).toBe(3)
    // four attacks are rolled: the A characteristic drives the number of hit dice
    const r = attack(s, 'ranged', [1, 1, 1, 1], BASH, ROCKS, GUARD, null)
    expect(of(r.events, 'HitRolled')).toHaveLength(4)
    // spent for the battle
    s.round = 3
    s.phase = 'shooting'
    for (const u of Object.values(s.units)) u.turn.abilitiesUsedThisPhase = []
    expect(offered(s, 'A', 'shooting')).not.toContain(LUCKY)
  })

  it('SOB-ENH-4 Hungry Gobbler: at the end of a turn in which the general\'s melee attacks slew an enemy model, Heal (D3) the general; not offered after kills by mortal damage only', () => {
    const s = game({ enh: ENH.gobbler, phase: 'fight' })
    put(s, BASH, 0, -2)
    put(s, BRUTE, 0, 3)
    unitModels(s, BASH)[0].woundsRemaining = 7
    // nothing slain yet: not offered
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(GOBBLER)
    // the 'Eadbutt: hit 6, wound 6, save 1 (Brute Sv 3, rend 2), damage 3 slays one Brute (Health 3)
    const brutes = unitModels(s, BRUTE).length
    const r = attack(s, 'melee', [6, 6, 1, 6], BASH, BUTT, BRUTE, 1)
    expect(unitModels(s, BRUTE)).toHaveLength(brutes - 1)
    expect(of(r.events, 'DamageApplied').length).toBeGreaterThan(0)
    expect(offered(s, 'A', 'endOfTurn')).toContain(GOBBLER)
    // a D3 roll of 5 is a 3
    const ctx = ctxFor(s, [5])
    useOnce(ctx, 'endOfTurn', 'A', GOBBLER)
    expect(unitModels(s, BASH)[0].woundsRemaining).toBe(10)
    expect(summaries(ctx).join('|')).toMatch(/Hungry Gobbler/)
    expect(leftOver(ctx)).toEqual([])
    // an undamaged general gains nothing, and the heal never goes past Health 12
    const t = game({ enh: ENH.gobbler, phase: 'fight' })
    put(t, BASH, 0, -2)
    put(t, BRUTE, 0, 3)
    attack(t, 'melee', [6, 6, 1, 6], BASH, BUTT, BRUTE, 1)
    expect(offered(t, 'A', 'endOfTurn')).not.toContain(GOBBLER)
    unitModels(t, BASH)[0].woundsRemaining = 11
    useOnce(ctxFor(t, [6]), 'endOfTurn', 'A', GOBBLER)
    expect(unitModels(t, BASH)[0].woundsRemaining).toBe(12)
    // mortal damage is not a combat attack: a model removed that way does not count
    const u = game({ enh: ENH.gobbler, phase: 'fight' })
    put(u, BASH, 0, -2)
    put(u, BRUTE, 0, 3)
    unitModels(u, BASH)[0].woundsRemaining = 7
    removeModel(u, u.units[BRUTE].models[0])
    expect(offered(u, 'A', 'endOfTurn')).not.toContain(GOBBLER)
  })
})

describe('SOB-AB Drop, Toss or Roll', () => {
  it('SOB-AB-1 Drop: a Rock-hurler in combat can shoot Hurlin\' Rocks this turn', () => {
    const s = game({ phase: 'shooting' })
    put(s, HU1, 0, -2)
    put(s, BRUTE, 0, 3)
    put(s, BASH, -8, -8)
    put(s, HU2, 8, -8)
    const m = unitModels(s, HU1)[0]
    const legal = () => buildShootingWeaponEntries(ctxFor(s), HU1).flatMap((e) => e.legalTargets)
    expect(legal()).toEqual([])
    const ctx = ctxFor(s)
    useOnce(ctx, 'shooting', 'A', DTR, { unit: HU1, mode: 'drop' })
    expect(summaries(ctx).join('|')).toMatch(/Drop/)
    expect(weaponService.effectiveWeapon(s, m.id, ROCKS)!.abilities.map((a) => a.ability)).toContain('SHOOT_IN_COMBAT')
    expect(legal()).toEqual([BRUTE])
    // only the unit it is fighting
    put(s, GUARD, 4, 9)
    expect(legal()).toEqual([BRUTE])
    // it lasts the turn only
    effectService.expire(ctxFor(s), 'turnEnd', null)
    expect(legal()).toEqual([])
  })

  it('SOB-AB-2 Toss: Hurlin\' Rocks reaches an 18" target that is out of range without it', () => {
    const s = game({ phase: 'shooting' })
    put(s, HU1, 0, -9)
    put(s, BASH, -8, -9)
    put(s, HU2, 8, -9)
    // the Boss' nearest edge is 15" from the Rock-hurler's
    put(s, BOSS, 0, 0)
    const m = unitModels(s, HU1)[0]
    unitModels(s, BOSS)[0].pos = { x: 0, y: 0, z: -9 + 15 + m.base.radius + unitModels(s, BOSS)[0].base.radius }
    const rocks = () => weaponService.effectiveWeapon(s, m.id, ROCKS)!
    const clubRange = weaponOf(s, HU1, CLUB).range
    expect(rocks().range).toBe(12)
    expect(targetLegality(s, HU1, m.id, rocks(), BOSS)?.code).toBe('E_NOT_IN_RANGE')
    const ctx = ctxFor(s)
    useOnce(ctx, 'shooting', 'A', DTR, { unit: HU1, mode: 'toss' })
    expect(rocks().range).toBe(18)
    expect(targetLegality(s, HU1, m.id, rocks(), BOSS)).toBeNull()
    // the other weapons are not ranged: the club keeps range 0
    expect(weaponOf(s, HU1, CLUB).range).toBe(clubRange)
    // beyond 18" it still fails
    unitModels(s, BOSS)[0].pos = { x: 0, y: 0, z: -9 + 19 + m.base.radius + unitModels(s, BOSS)[0].base.radius }
    expect(targetLegality(s, HU1, m.id, rocks(), BOSS)?.code).toBe('E_NOT_IN_RANGE')
  })

  it('SOB-AB-3 Roll: +1 to hit for the unit\'s shooting attacks; with Close One Eye! as well it is still +1 (cap)', () => {
    const s = game({ phase: 'command' })
    put(s, BASH, -6, -8)
    put(s, HU1, 0, -8)
    put(s, HU2, 6, -8)
    put(s, GUARD, 0, 3)
    // Close One Eye! on the first Rock-hurler, then Roll on it in the shooting phase
    useOnce(ctxFor(s), 'hero', 'A', COE)
    s.phase = 'shooting'
    for (const u of Object.values(s.units)) u.turn.abilitiesUsedThisPhase = []
    const ctx = ctxFor(s)
    useOnce(ctx, 'shooting', 'A', DTR, { unit: HU1, mode: 'roll' })
    expect(summaries(ctx).join('|')).toMatch(/Roll/)
    expect(hitsOf(attack(s, 'ranged', [3, 1, 1], HU1, ROCKS, GUARD, 1).events)).toBe(1)
    // +1 + 1 is still +1: a 2 misses (needs 3+)
    expect(hitsOf(attack(s, 'ranged', [2], HU1, ROCKS, GUARD, 1).events)).toBe(0)
    // Roll alone on the second Rock-hurler of another game: +1
    const t = game({ phase: 'shooting' })
    put(t, BASH, -6, -8)
    put(t, HU1, 0, -8)
    put(t, HU2, 6, -8)
    put(t, GUARD, 0, 3)
    useOnce(ctxFor(t), 'shooting', 'A', DTR, { unit: HU2, mode: 'roll' })
    expect(dtrUsed(t, 'A')).toEqual(['roll'])
    expect(hitsOf(attack(t, 'ranged', [3, 1, 1], HU2, ROCKS, GUARD, 1).events)).toBe(1)
    expect(hitsOf(attack(t, 'ranged', [3], HU1, ROCKS, GUARD, 1).events)).toBe(0)
  })

  it('SOB-AB-4 exclusivity: an option used by one friendly unit is not offered to another the same turn, and all three are offered again next turn', () => {
    const s = game({ phase: 'shooting' })
    spread(s)
    put(s, GUARD, 0, 3)
    expect(modesOf(s, HU1, 'A')).toEqual(['drop', 'toss', 'roll'])
    expect(offeredFor(s, 'A', 'shooting', DTR).sort()).toEqual([BASH, HU1, HU2])
    useOnce(ctxFor(s), 'shooting', 'A', DTR, { unit: HU1, mode: 'roll' })
    expect(modesOf(s, HU2, 'A')).toEqual(['drop', 'toss'])
    // the unit that took one is done with the ability for the phase
    expect(offeredFor(s, 'A', 'shooting', DTR).sort()).toEqual([BASH, HU2])
    // the same window, further uses: the options are handed out one by one
    const t = game({ phase: 'shooting' })
    spread(t)
    put(t, GUARD, 0, 3)
    useSeq(ctxFor(t), 'shooting', 'A', [
      { id: DTR, unit: HU1, mode: 'roll' }, { id: DTR, unit: HU2, mode: 'toss' }, { id: DTR, unit: BASH, mode: 'drop' },
    ])
    expect(dtrUsed(t, 'A')).toEqual(['roll', 'toss', 'drop'])
    expect(offeredFor(t, 'A', 'shooting', DTR)).toEqual([])
    // the first game goes on from the state it was left in
    expect(modesOf(s, BASH, 'A')).toEqual(['drop', 'toss'])
    expect(dtrUsed(s, 'A')).toEqual(['roll'])
    // the next turn of the army (the next round): all three again, for every unit
    s.round = 2
    for (const u of Object.values(s.units)) u.turn.abilitiesUsedThisPhase = []
    expect(dtrUsed(s, 'A')).toEqual([])
    expect(modesOf(s, HU1, 'A')).toEqual(['drop', 'toss', 'roll'])
    expect(offeredFor(s, 'A', 'shooting', DTR).sort()).toEqual([BASH, HU1, HU2])
    // a unit that already shot this phase cannot take an option any more
    s.units[HU1].turn.shotThisPhase = true
    expect(offeredFor(s, 'A', 'shooting', DTR).sort()).toEqual([BASH, HU2])
    // and it is a shooting-phase ability of the owner only
    expect(offeredFor(s, 'B', 'shooting', DTR)).toEqual([])
  })
})

describe('SOB-WEAP weapons', () => {
  it('SOB-WEAP-1 Hurlin\' Rocks deals D3 damage, Rend 1; \'Eadbutt Rend 2, Damage 3', () => {
    const s = game({ phase: 'shooting' })
    spread(s)
    put(s, BOSS, 0, 0)
    const rocks = weaponOf(s, HU1, ROCKS)
    const butt = weaponOf(s, HU1, BUTT)
    expect([rocks.range, rocks.A, rocks.skill, rocks.wound, rocks.rend, rocks.D]).toEqual([12, 3, 4, 2, 1, 'D3'])
    expect([butt.A, butt.skill, butt.wound, butt.rend, butt.D]).toEqual([1, 4, 2, 2, 3])
    // damage dice: a 3 on the D3 (face 3 or 4) is 2 damage; hit 6, wound 6, save 1
    const before = wounds(s, BOSS)
    attack(s, 'ranged', [6, 6, 1, 3], HU1, ROCKS, BOSS, 1)
    expect(before - wounds(s, BOSS)).toBe(2)
    // the 'Eadbutt: 3 damage without a roll
    put(s, BASH, 0, -2)
    put(s, BOSS, 0, 3)
    const hp = wounds(s, BOSS)
    attack(s, 'melee', [6, 6, 1], BASH, BUTT, BOSS, 1)
    expect(hp - wounds(s, BOSS)).toBe(3)
  })
})

describe('SOB-AI hints', () => {
  it('SOB-AI-1 the bot takes the right option and timing: Drop in combat, Toss for a far target, Roll otherwise; Bowled Over after the last shot', () => {
    const s = game({ phase: 'shooting' })
    put(s, BASH, -8, -9)
    put(s, HU2, 8, -9)
    put(s, HU1, 0, -2)
    put(s, BRUTE, 0, 3)
    expect(behematModeBonus(s, 'behematDropTossRoll', HU1, 'drop')).toBeGreaterThan(behematModeBonus(s, 'behematDropTossRoll', HU1, 'roll') as number)
    // a unit with a target in 12": Roll; only the extra range reaches: Toss
    const t = game({ phase: 'shooting' })
    put(t, HU1, 0, -9)
    put(t, BASH, -8, -9)
    put(t, HU2, 8, -9)
    put(t, GUARD, 0, -1)
    expect(behematModeBonus(t, 'behematDropTossRoll', HU1, 'roll')).toBe(4)
    put(t, GUARD, 0, 7)
    expect(behematModeBonus(t, 'behematDropTossRoll', HU1, 'toss')).toBe(4)
    expect(behematAbilityTiming(t, 'A', 'behematDropTossRoll', HU1)).toBeGreaterThan(0)
    // nothing in reach: the option is kept for another unit
    put(t, GUARD, 0, 20)
    expect(behematAbilityTiming(t, 'A', 'behematDropTossRoll', HU1)).toBeLessThan(-2)
    // Bowled Over waits while a gargant can still shoot, and goes after the last shot
    put(t, GUARD, 0, -1)
    markShot(t, HU1, GUARD)
    expect(behematAbilityTiming(t, 'A', 'behematCloseOneEye', null)).toBeGreaterThan(0)
    expect(behematAbilityTiming(t, 'A', 'behematBowledOver', null)).toBeLessThan(-2)
    for (const id of [BASH, HU1, HU2]) t.units[id].turn.shotThisPhase = true
    expect(behematAbilityTiming(t, 'A', 'behematBowledOver', null)).toBeGreaterThan(0)
    expect(behematTargetBonus(t, 'A', 'behematBowledOver', GUARD)).not.toBeNull()
    expect(behematOptionUnit(t, `${DTR}#${HU1}`)).toBe(HU1)
    expect(behematOptionUnit(t, `core.ability.call-for-reinforcements#-`)).toBeNull()
  })
  it("SOB-AI-2 the once-per-battle buffs wait for their moment: 'Ard 'Ead and Surly Sorts for a fight, Lucky Rock for a target, Hungry Gobbler always", () => {
    const s = game({ phase: 'fight' })
    put(s, BASH, 0, -2)
    put(s, BRUTE, 0, 3)
    put(s, HU1, 8, -9)
    put(s, HU2, -8, -9)
    expect(behematAbilityTiming(s, 'A', 'behematArdEad', null)).toBeGreaterThan(0)
    expect(behematAbilityTiming(s, 'A', 'behematSurlySorts', null)).toBeGreaterThan(0)
    expect(behematTargetBonus(s, 'A', 'behematSurlySorts', BASH)).toBeGreaterThan(behematTargetBonus(s, 'A', 'behematSurlySorts', HU1) as number)
    expect(behematAbilityTiming(s, 'A', 'behematHungryGobbler', BASH)).toBeGreaterThan(0)
    // the general has already fought: neither is worth it
    s.units[BASH].turn.foughtThisPhase = true
    expect(behematAbilityTiming(s, 'A', 'behematArdEad', null)).toBeLessThan(-2)
    expect(behematAbilityTiming(s, 'A', 'behematSurlySorts', null)).toBeLessThan(-2)
    // Lucky Rock: an enemy within reach of the general, the general not shot yet
    expect(behematAbilityTiming(s, 'A', 'behematLuckyRock', null)).toBeGreaterThan(0)
    put(s, BRUTE, 12, 9)
    put(s, BASH, -12, -9)
    expect(behematAbilityTiming(s, 'A', 'behematLuckyRock', null)).toBeLessThan(-2)
    // Close One Eye! prefers the gargant closer to the enemy
    put(s, HU1, 0, -2)
    put(s, HU2, -12, -9)
    expect(behematTargetBonus(s, 'A', 'behematCloseOneEye', HU1)).toBeGreaterThan(behematTargetBonus(s, 'A', 'behematCloseOneEye', HU2) as number)
  })
})
