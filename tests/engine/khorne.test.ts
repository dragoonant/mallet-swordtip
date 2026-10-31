// Blades of Khorne (Fangs of the Blood God) code hooks: docs/spec/factions/blades-of-khorne.md, test ids BOK-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/khorne files on top of the AoS fixture bundle
// (player A = Fangs of the Blood God, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data
// except where a test says so (a ranged weapon for the Shoot checks, a 6+ save for the crit-pick check).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, unitModels,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService, damagedThisTurn, slewInFightThisTurn } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { chargeDiceCount, chargeMoveRejection, chargeMustEndInCombatWith, neededChargeDistance } from '../../src/engine/phases/charge'
import { checkSlide, readMoveQueue } from '../../src/engine/factions/aos-moves'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { khorneAbilityTiming, khorneQuarryOf, khorneTargetBonus, quarryOnBoard } from '../../src/engine/factions/khorne'
import { spawnDestroyedUnitCopy } from '../../src/engine/state'
import { weaponService } from '../../src/engine/weapons'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/khorne/abilities.json'
import enhancementsJson from '../../src/data/factions/khorne/enhancements.json'
import weaponsJson from '../../src/data/factions/khorne/weapons.json'
import factionJson from '../../src/data/factions/khorne/faction.json'
import patrolJson from '../../src/data/factions/khorne/patrols/fangs-of-the-blood-god.json'
import karanakJson from '../../src/data/factions/khorne/datasheets/karanak.json'
import houndsJson from '../../src/data/factions/khorne/datasheets/flesh-hounds.json'
import clawsJson from '../../src/data/factions/khorne/datasheets/claws-of-karanak.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [karanakJson, houndsJson, clawsJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.khorne = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const QUARRY = 'khorne.ability.the-quarry'
const BLOOD = 'khorne.ability.blood-drenched'
const SCENT = 'khorne.ability.the-scent-of-blood'
const SAVAGERY = 'khorne.ability.savagery-upon-savagery'
const STALK = 'khorne.ability.stalk-the-prey'
const PACK = 'khorne.ability.pack-hunters'
const EVASIVE = 'khorne.enh.evasive-hunter'
const GORE = 'khorne.enh.sustained-by-gore'
const POUNCE = 'khorne.enh.killing-pounce'
const BITES = 'khorne.enh.furious-bites'
const GORE_AB = 'khorne.ability.sustained-by-gore'
const POUNCE_AB = 'khorne.ability.killing-pounce'
const BITES_AB = 'khorne.ability.furious-bites'

const KARANAK = 'A:karanak'
const HOUNDS1 = 'A:flesh-hounds-1'
const HOUNDS2 = 'A:flesh-hounds-2'
const CLAWS = 'A:claws-of-karanak'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'
const HAWK = 'B:hawk'

const W = (id: string) => `khorne.weapon.${id}`

// the smallest edge-to-edge gap between two units
const unitGap = (s: GameState, a: UnitId, b: UnitId): number =>
  Math.min(...unitModels(s, a).flatMap((m) => unitModels(s, b).map((o) => horizontalGap(m, o))))

// keep only the first `n` models of a unit (they are not "slain": no destroyedModels entry)
const trim = (s: GameState, unitId: UnitId, n: number): void => {
  for (const id of [...s.units[unitId].models].slice(n)) { delete s.models[id]; s.units[unitId].models = s.units[unitId].models.filter((m) => m !== id) }
}

// the unit's models in a row starting at (x, z), bases not touching
function row(s: GameState, unitId: UnitId, x: number, z: number, gap = 0.3): void {
  s.units[unitId].location = 'board'
  let cx = x
  for (const m of unitModels(s, unitId)) {
    const r = Math.max(m.base.radius, m.base.radius2 ?? 0)
    m.pos = { x: cx + r, y: 0, z }
    cx += 2 * r + gap
  }
}

// one model of the unit on the board at (x, z), the rest dropped (not slain)
function put(s: GameState, unitId: UnitId, x: number, z: number, keep = 1): void {
  trim(s, unitId, keep)
  s.units[unitId].location = 'board'
  unitModels(s, unitId).forEach((m, i) => { m.pos = { x: x + i * 1.6, y: 0, z } })
}

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'khorne', patrolId: 'khorne.army.fangs-of-the-blood-god', enhancementId: opts.enh ?? EVASIVE, regimentAbilityId: opts.reg ?? SCENT }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  // bystanders are parked along the back edges in as many rows as they need, clear of the middle where the tests work
  for (const p of ['A', 'B'] as const) {
    const sign = p === 'A' ? -1 : 1
    let x = -14.5, rowNo = 0
    for (const u of Object.values(s.units).filter((u) => u.player === p)) {
      const width = u.models.length * (2 * Math.max(...unitModels(s, u.id).map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0))) + 0.3)
      if (x + width > 14.5) { x = -14.5; rowNo++ }
      row(s, u.id, x, sign * (10.8 - 1.9 * rowNo), 0.3)
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
const evOf = (ctx: EngineContext): GameEvent[] => eventLogs.get(ctx) ?? []
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const summaries = (ctx: EngineContext): string[] => of(evOf(ctx), 'AbilityTriggered').map((e) => e.summary)

type Pick = (topic: string, ids: string[], p: ChooseOptionDecision) => string

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: Pick): { topics: string[]; options: string[][]; decisions: ChooseOptionDecision[] } {
  const topics: string[] = []
  const options: string[][] = []
  const decisions: ChooseOptionDecision[] = []
  for (let i = 0; i < 30; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return { topics, options, decisions }
    const p = ctx.state.pending as ChooseOptionDecision
    topics.push(p.context.topic)
    decisions.push(p)
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
const setQuarry = (s: GameState, unitId: UnitId): void => { s.units[unitId].tokens = { ...s.units[unitId].tokens, quarry: 1 } }
const firstModel = (s: GameState, unitId: UnitId) => unitModels(s, unitId)[0]

// ---------- attacks with scripted dice ----------
function attack(s: GameState, kind: 'ranged' | 'melee', dice: number[], attackerUnitId: UnitId, weaponId: string, targetUnitId: UnitId, attacks: number | null = null) {
  s.phase = kind === 'ranged' ? 'shooting' : 'fight'
  const modelId = s.units[attackerUnitId].models.find((id) => s.models[id].weapons.includes(weaponId))!
  const target: DeclaredTarget = { modelId, weaponId, targetUnitId, profileGroup: null, attacks }
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets: [target] })
  const result = attackService.advance(ctx)
  return { events, rng, ctx, result }
}

// the first die of the sequence is a hit roll of 3: it only hits with a +1, so "hit" is the proof of the modifier
const hits = (events: GameEvent[]): boolean[] => of(events, 'HitRolled').map((h) => h.hit)
const wounded = (events: GameEvent[]): boolean[] => of(events, 'WoundRolled').map((w) => w.wounded)

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('BOK-REG every code in the Khorne data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('BOK-ARMY-1 the army builds in the engine: Karanak general, 4 units, 19 models, the chosen regiment ability and enhancement', () => {
    const s = game({ enh: POUNCE, reg: SAVAGERY })
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(19)
    expect(s.players.A.warlordUnitId).toBe(KARANAK)
    expect(s.players.A.battleTraitIds).toEqual([QUARRY, BLOOD])
    expect(s.players.A.regimentAbilityId).toBe(SAVAGERY)
    expect(s.units[KARANAK].enhancementId).toBe(POUNCE)
    const st = (id: string) => s.datasheets[`khorne.unit.${id}`].stats
    expect(st('karanak')).toMatchObject({ M: 8, W: 7, Sv: 5, OC: 2, ward: 6 })
    expect(st('flesh-hounds')).toMatchObject({ M: 8, W: 2, Sv: 6, OC: 1, ward: 6 })
    expect(st('claws-of-karanak')).toMatchObject({ M: 6, W: 1, Sv: 5, OC: 1 })
  })

  it('BOK-ARMY-2 the Claws of Karanak hold the printed eight models, each with one Weapons of the Hunt, in the engine', () => {
    const s = game()
    const kinds = unitModels(s, CLAWS).map((m) => `${m.datasheetModelId}:${m.weapons.join('+').replace('khorne.weapon.', '')}:${m.woundsRemaining}`)
    expect(kinds).toEqual([
      'blood-whelp:weapons-of-the-hunt:1', 'blood-whelp:weapons-of-the-hunt:1', 'blood-whelp:weapons-of-the-hunt:1', 'blood-whelp:weapons-of-the-hunt:1',
      'brutaliser:weapons-of-the-hunt:1', 'brutaliser:weapons-of-the-hunt:1', 'hound-of-wrath:weapons-of-the-hunt:1', 'packlord:weapons-of-the-hunt:1',
    ])
    expect(unitModels(s, KARANAK)[0].weapons).toEqual([W('savage-maws-and-goreslick-claws')])
    expect(unitModels(s, HOUNDS1).every((m) => m.weapons.join() === W('blood-dark-claws') && m.woundsRemaining === 2)).toBe(true)
  })

  it('BOK-ARMY-3 once destroyed, both Flesh Hounds units and the Claws are offered for replacement; Karanak never is', () => {
    const s = game()
    for (const id of [KARANAK, HOUNDS1, HOUNDS2, CLAWS]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A').sort()).toEqual([CLAWS, HOUNDS1, HOUNDS2])
  })
})

describe('BOK-BT The Quarry and Blood-Drenched', () => {
  it('BOK-BT-1 at round start with no quarry the player must pick an enemy unit (reserve allowed); with a living quarry nothing is offered', () => {
    const s = game()
    s.units[HAWK].location = 'reserves'
    expect(offered(s, 'A', 'startOfRound')).toEqual([QUARRY])
    expect(offered(s, 'B', 'startOfRound')).toEqual([]) // the fixture army has no such battle trait
    const ctx = ctxFor(s)
    let mandatory: boolean | null = null
    let targetIds: string[] = []
    const r = runWindow(ctx, 'startOfRound', 'A', (topic, ids, p) => {
      if (topic === 'abilityUse') { mandatory = !p.canPass; return ids[0] }
      targetIds = ids
      return HAWK
    })
    expect(r.topics).toEqual(['abilityUse', 'abilityTarget'])
    expect(mandatory).toBe(true) // no pass while the pick is on offer
    expect(targetIds.sort()).toEqual([BOSS, BRUTE, GUARD, HAWK].sort()) // the unit in reserve is a legal pick
    expect(s.units[HAWK].tokens.quarry).toBe(1)
    expect(khorneQuarryOf(s, 'A')).toBe(HAWK)
    expect(quarryOnBoard(s, 'A')).toBeNull() // still in reserve: the rules that need it on the battlefield stay off
    expect(summaries(ctx).some((x) => x.includes('is the quarry'))).toBe(true)
    // a living quarry: nothing offered again, not even at the next round start
    expect(offered(s, 'A', 'startOfRound')).toEqual([])
    s.round = 2
    expect(offered(s, 'A', 'startOfRound')).toEqual([])
  })

  it('BOK-BT-1b the quarry is lost only when destroyed; a new one is picked at the next round start, never mid-round; a replacement unit is not the quarry', () => {
    const s = game()
    setQuarry(s, BRUTE)
    expect(khorneQuarryOf(s, 'A')).toBe(BRUTE)
    s.units[BRUTE].location = 'destroyed'
    expect(khorneQuarryOf(s, 'A')).toBeNull()
    // mid-round: no window but the round start offers it
    for (const w of ['hero', 'movement', 'shooting', 'charge', 'fight', 'startOfTurn', 'endOfTurn', 'endOfRound'] as const) expect(offered(s, 'A', w)).not.toContain(QUARRY)
    s.round = 2
    expect(offered(s, 'A', 'startOfRound')).toEqual([QUARRY])
    // Call for Reinforcements: the copy is a new unit and carries no token, the original stays destroyed
    const ctx = ctxFor(s)
    const copy = spawnDestroyedUnitCopy(ctx, BRUTE)
    expect(copy.tokens?.quarry ?? 0).toBe(0)
    expect(khorneQuarryOf(s, 'A')).toBeNull()
    expect(targetsOf('khorneTheQuarry', s, null, 'A')).not.toContain(BRUTE)
    // picking again works, and the new quarry is the only one
    s.units[GUARD].location = 'board'
    useOnce(ctx, 'startOfRound', 'A', QUARRY, { target: GUARD })
    expect(khorneQuarryOf(s, 'A')).toBe(GUARD)
    expect(offered(s, 'A', 'startOfRound')).toEqual([])
  })

  it('BOK-BT-2 Blood-Drenched: only a unit that slew a model with combat attacks this turn can be picked; its melee weapons have Crit (Mortal) for the rest of the battle; once per turn', () => {
    const s = game()
    put(s, CLAWS, 0, 0, 1); put(s, GUARD, 0, 2.2, 3)
    s.phase = 'fight'
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(BLOOD)
    // 3 attacks: one hit (4), it wounds (3+), the 4+ save fails (1): a Guard model is slain
    const hit = attack(s, 'melee', [4, 1, 1, 3, 1], CLAWS, W('weapons-of-the-hunt'), GUARD)
    expect(hit.result).toBe('done')
    expect(unitModels(s, GUARD)).toHaveLength(2)
    expect(slewInFightThisTurn(s, CLAWS)).toBe(true)
    expect(targetsOf('khorneBloodDrenched', s, null, 'A')).toEqual([CLAWS])
    expect(offered(s, 'A', 'endOfTurn')).toContain(BLOOD)
    const ctx = ctxFor(s)
    useOnce(ctx, 'endOfTurn', 'A', BLOOD)
    const w = weaponService.effectiveWeapon(s, firstModel(s, CLAWS).id, W('weapons-of-the-hunt'))!
    expect(w.abilities.map((a) => a.ability).sort()).toEqual(['CRIT_2_HITS', 'CRIT_MORTAL'])
    // the effect is for the rest of the battle, not the turn
    expect(s.units[CLAWS].effects.map((e) => e.expires.kind)).toEqual(['battle'])
    effectService.expire(ctx, 'turnEnd', null)
    expect(weaponService.effectiveWeapon(s, firstModel(s, CLAWS).id, W('weapons-of-the-hunt'))!.abilities.map((a) => a.ability)).toContain('CRIT_MORTAL')
    // once per turn, and a unit that holds it is not offered again
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(BLOOD)
    expect(targetsOf('khorneBloodDrenched', s, null, 'A')).toEqual([])
  })

  it('BOK-BT-2b a model slain by Furious Bites or other ability mortal damage does not qualify a unit for Blood-Drenched', () => {
    const s = game({ enh: BITES })
    put(s, KARANAK, 0, 0); put(s, GUARD, 0, 3.2, 4)
    setQuarry(s, GUARD)
    expect(unitGap(s, KARANAK, GUARD)).toBeLessThan(3)
    s.phase = 'fight'
    const ctx = ctxFor(s, [6]) // D3 = 3
    useOnce(ctx, 'endOfTurn', 'A', BITES_AB)
    expect(unitModels(s, GUARD)).toHaveLength(1) // 3 mortal damage slays 3 of the 4 Guard models
    expect(damagedThisTurn(s, GUARD)).toBe(true)
    expect(slewInFightThisTurn(s, KARANAK)).toBe(false)
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(BLOOD)
    expect(targetsOf('khorneBloodDrenched', s, null, 'A')).toEqual([])
  })
})

describe('BOK-RA regiment abilities', () => {
  const withRanged = (b: DataBundle) => { b.datasheets['khorne.unit.claws-of-karanak'].composition[0].weapons.default.push('fx.w.cannon-shot') }

  it('BOK-RA-1 The Scent of Blood: melee attacks get +1 hit and +1 wound only against a unit that had damage allocated this turn; never for shooting; resets next turn', () => {
    const s = game({ patch: withRanged })
    put(s, HOUNDS1, 0, 0, 1); put(s, BRUTE, 0, 2.5, 1)
    s.phase = 'fight'
    // undamaged target: a 3 to hit misses (4+)
    const cold = attack(s, 'melee', [3, 3, 3, 3], HOUNDS1, W('blood-dark-claws'), BRUTE)
    expect(hits(cold.events)).toEqual([false, false, false, false])
    expect(damagedThisTurn(s, BRUTE)).toBe(false)
    // any damage counts, mortal damage included
    attackService.queueMortalWounds(ctxFor(s), BRUTE, 1, 'fx.a.test', false, { player: 'A', unitId: BOSS, modelId: firstModel(s, BOSS).id })
    expect(damagedThisTurn(s, BRUTE)).toBe(true)
    // now a 3 hits (4+ with +1) and a 2 wounds (3+ with +1)
    const hot = attack(s, 'melee', [3, 3, 3, 3, 2, 2, 2, 2, 6, 6, 6, 6], HOUNDS1, W('blood-dark-claws'), BRUTE)
    expect(hits(hot.events)).toEqual([true, true, true, true])
    expect(wounded(hot.events)).toEqual([true, true, true, true])
    // shooting attacks get nothing
    s.units[BRUTE].location = 'board'
    put(s, CLAWS, 0, -2.5, 1)
    const shot = attack(s, 'ranged', [3, 3, 6, 6], CLAWS, 'fx.w.cannon-shot', BRUTE)
    expect(hits(shot.events)).toEqual([false, false])
    // the next turn starts with a clean ledger
    s.activePlayer = 'B'
    expect(damagedThisTurn(s, BRUTE)).toBe(false)
    const next = attack(s, 'melee', [3, 3, 3, 3], HOUNDS1, W('blood-dark-claws'), BRUTE)
    expect(hits(next.events)).toEqual([false, false, false, false])
  })

  it('BOK-RA-2 Savagery Upon Savagery: +1 Attacks to the melee weapons of a unit in combat until end of turn, +D3 for a Hero; once per battle', () => {
    const s = game({ reg: SAVAGERY })
    put(s, KARANAK, 0, 0); put(s, GUARD, 0, 3.4, 3)
    put(s, CLAWS, 8, 0, 2); put(s, BRUTE, 8, 3.2, 1)
    s.phase = 'fight'
    // nobody is in combat yet
    s.units[GUARD].location = 'board'
    expect(unitGap(s, KARANAK, GUARD)).toBeLessThan(3)
    expect(targetsOf('khorneSavagery', s, null, 'A').sort()).toEqual([CLAWS, KARANAK])
    const aOf = (id: UnitId, weapon: string) => weaponService.effectiveWeapon(s, firstModel(s, id).id, W(weapon))!.A
    expect(aOf(KARANAK, 'savage-maws-and-goreslick-claws')).toBe(6)
    expect(aOf(CLAWS, 'weapons-of-the-hunt')).toBe(3)
    const ctx = ctxFor(s, [5]) // D3 = 3 for the Hero
    useOnce(ctx, 'fight', 'A', SAVAGERY, { target: KARANAK })
    expect(aOf(KARANAK, 'savage-maws-and-goreslick-claws')).toBe(9)
    expect(aOf(CLAWS, 'weapons-of-the-hunt')).toBe(3) // only the picked unit
    expect(summaries(ctx).some((x) => x.includes('+3 Attacks'))).toBe(true)
    // once per battle: not offered again, whoever is in combat
    expect(offered(s, 'A', 'fight')).not.toContain(SAVAGERY)
    // a non-Hero gets exactly +1 (fresh game so the battle limit is unspent)
    const t = game({ reg: SAVAGERY })
    put(t, CLAWS, 8, 0, 2); put(t, BRUTE, 8, 3.2, 1)
    t.phase = 'fight'
    const ctx2 = ctxFor(t)
    useOnce(ctx2, 'fight', 'A', SAVAGERY, { target: CLAWS })
    expect(weaponService.effectiveWeapon(t, firstModel(t, CLAWS).id, W('weapons-of-the-hunt'))!.A).toBe(4)
    // it lasts to the end of the turn only
    effectService.expire(ctx2, 'turnEnd', null)
    expect(weaponService.effectiveWeapon(t, firstModel(t, CLAWS).id, W('weapons-of-the-hunt'))!.A).toBe(3)
    // never offered when no friendly unit is in combat
    const u = game({ reg: SAVAGERY })
    u.phase = 'fight'
    expect(offered(u, 'A', 'fight')).not.toContain(SAVAGERY)
  })
})

describe('BOK-ENH enhancements', () => {
  it('BOK-ENH-1 Sustained by Gore: Heal (D3) the general at the end of any turn; not offered while undamaged', () => {
    const s = game({ enh: GORE })
    s.phase = 'fight'
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(GORE_AB)
    firstModel(s, KARANAK).woundsRemaining = 2
    expect(offered(s, 'A', 'endOfTurn')).toContain(GORE_AB)
    s.activePlayer = 'B' // the opponent's turn too
    expect(offered(s, 'A', 'endOfTurn')).toContain(GORE_AB)
    const ctx = ctxFor(s, [4]) // D3 = 2
    useOnce(ctx, 'endOfTurn', 'A', GORE_AB)
    expect(firstModel(s, KARANAK).woundsRemaining).toBe(4)
    expect(summaries(ctx).some((x) => x.includes('Heal (2)'))).toBe(true)
    // healing stops at full Health
    firstModel(s, KARANAK).woundsRemaining = 6
    s.phase = 'movement' // another phase of the same turn so CORE-3.4 allows it again
    s.units[KARANAK].turn.abilitiesUsedThisPhase = []
    const ctx2 = ctxFor(s, [6])
    useOnce(ctx2, 'endOfTurn', 'A', GORE_AB)
    expect(firstModel(s, KARANAK).woundsRemaining).toBe(7)
  })

  it('BOK-ENH-2 Evasive Hunter: -1 hit and -1 wound for shooting attacks targeting the general; melee unaffected; the hit penalty stays -1 beside Guarded Hero', () => {
    const shooter = (b: DataBundle) => { b.datasheets['fx.guard'].composition[0].weapons.default.push('fx.w.cannon-shot') }
    const run = (enh: string, hasGuard: boolean, hitDie: number, woundDie: number) => {
      const s = game({ enh, patch: shooter })
      put(s, KARANAK, 0, 0); put(s, GUARD, 0, 12, 1)
      if (hasGuard) put(s, HOUNDS1, 2.8, 0, 1) // a friendly non-Hero in combat range: Guarded Hero is on
      // hit 4+, wound 2+; save dice are 6s
      return attack(s, 'ranged', [hitDie, 1, woundDie, 1, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6], GUARD, 'fx.w.cannon-shot', KARANAK)
    }
    // the cannon has 2 attacks (hit 4+, wound 2+): a 4 hits and a 2 wounds without the enhancement
    const plain = run(GORE, false, 4, 2)
    expect(hits(plain.events)[0]).toBe(true)
    expect(wounded(plain.events)[0]).toBe(true)
    const evasive = run(EVASIVE, false, 4, 2)
    expect(hits(evasive.events)[0]).toBe(false) // 4 - 1 = 3
    const evasive2 = run(EVASIVE, false, 5, 2)
    expect(hits(evasive2.events)[0]).toBe(true) // 5 - 1 = 4
    expect(wounded(evasive2.events)[0]).toBe(false) // 2 - 1 = 1, wound needs 2+
    const evasive3 = run(EVASIVE, false, 5, 3)
    expect(wounded(evasive3.events)[0]).toBe(true) // 3 - 1 = 2
    // Guarded Hero (-1 to hit) and Evasive Hunter (-1 to hit) share the +-1 cap: still -1, so a 5 still hits
    const guarded = run(GORE, true, 5, 2)
    expect(hits(guarded.events)[0]).toBe(true)
    const both = run(EVASIVE, true, 5, 3)
    expect(hits(both.events)[0]).toBe(true)
    expect(wounded(both.events)[0]).toBe(true)
    const bothLow = run(EVASIVE, true, 4, 3)
    expect(hits(bothLow.events)[0]).toBe(false)
    // melee attacks on the general are not touched: the Brute needs 4+ and a 4 still hits
    const s = game({ enh: EVASIVE })
    put(s, KARANAK, 0, 0); put(s, BRUTE, 0, 3.2, 1)
    const melee = attack(s, 'melee', [4, 4, 4, 3, 3, 3, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6], BRUTE, 'fx.w.brute-axe', KARANAK)
    expect(hits(melee.events)[0]).toBe(true)
    expect(wounded(melee.events)[0]).toBe(true) // Brute axe wounds on 3+; the 3 would fail with a -1
  })

  it('BOK-ENH-3 Killing Pounce: the general charges with 3 dice for the rest of the turn and the charge must end in combat with the quarry; not without a quarry on the board; once per battle', () => {
    const s = game({ enh: POUNCE })
    s.phase = 'charge'
    put(s, KARANAK, 0, -8); put(s, BRUTE, 3, -4, 1); put(s, BOSS, 0, 4, 1)
    // no quarry: not offered; a quarry in reserve is no quarry on the battlefield
    expect(offered(s, 'A', 'chargeStart')).toEqual([])
    setQuarry(s, BOSS)
    s.units[BOSS].location = 'reserves'
    expect(offered(s, 'A', 'chargeStart')).toEqual([])
    s.units[BOSS].location = 'board'
    expect(offered(s, 'A', 'chargeStart')).toEqual([POUNCE_AB])
    // the card says any charge phase: the enemy's one offers it too (Karanak can charge there through a Counter-charge)
    expect((abilitiesJson as unknown as AbilityDescriptor[]).find((a) => a.id === POUNCE_AB)?.timing).toMatchObject({ kind: 'phase', phase: 'charge', whose: 'any' })
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'chargeStart')).toEqual([POUNCE_AB])
    expect(khorneAbilityTiming(s, 'A', 'khorneKillingPounce', KARANAK)).toBe(-3) // the bot plans no Counter-charge
    s.activePlayer = 'A'
    expect(chargeDiceCount(s, KARANAK)).toBe(2)
    const before = neededChargeDistance(s, KARANAK) as number
    const ctx = ctxFor(s)
    useOnce(ctx, 'chargeStart', 'A', POUNCE_AB)
    expect(chargeDiceCount(s, KARANAK)).toBe(3)
    expect(chargeMustEndInCombatWith(s, KARANAK)).toEqual([BOSS])
    expect(hookService.chargeMustEndInCombatWithFor(s, KARANAK)).toEqual([BOSS])
    // the roll has to cover the 3" to the quarry too
    expect(neededChargeDistance(s, KARANAK) as number).toBeGreaterThanOrEqual(before)
    // a charge that ends 0.3" from the Brute but not in combat with the quarry is rejected; one that ends in combat with it is fine
    const m = firstModel(s, KARANAK)
    const brute = firstModel(s, BRUTE)
    let x = m.pos.x
    const probe = { ...m, pos: { ...m.pos } }
    for (let i = 0; i < 400; i++) { probe.pos = { x: brute.pos.x - i * 0.02, y: 0, z: brute.pos.z + 0 }; if (horizontalGap(probe, brute) >= 0.3) break }
    x = probe.pos.x
    expect(horizontalGap(probe, brute)).toBeGreaterThanOrEqual(0.3)
    expect(chargeMoveRejection(s, KARANAK, 12, [{ modelId: m.id, pos: { x, y: 0, z: brute.pos.z } }])).toMatchObject({ code: 'E_ENGAGEMENT' })
    // once per battle, and the extra die ends with the turn
    expect(offered(s, 'A', 'chargeStart')).toEqual([])
    effectService.expire(ctx, 'turnEnd', null)
    expect(chargeDiceCount(s, KARANAK)).toBe(2)
    expect(chargeMustEndInCombatWith(s, KARANAK)).toEqual([])
    s.round = 2
    expect(offered(s, 'A', 'chargeStart')).toEqual([])
  })

  it('BOK-ENH-4 Furious Bites: D3 mortal damage to the quarry at the end of any turn, only while the general is in combat with it', () => {
    const s = game({ enh: BITES })
    s.phase = 'fight'
    put(s, KARANAK, 0, 0); put(s, GUARD, 0, 3.2, 1); put(s, BRUTE, 8, 0, 3)
    setQuarry(s, BRUTE)
    // in combat with the Guard, not the quarry
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(BITES_AB)
    s.units[BRUTE].tokens = {}
    setQuarry(s, GUARD)
    expect(offered(s, 'A', 'endOfTurn')).toContain(BITES_AB)
    s.activePlayer = 'B' // either player's turn
    expect(offered(s, 'A', 'endOfTurn')).toContain(BITES_AB)
    // put the quarry out of reach
    put(s, GUARD, 0, 9, 1)
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(BITES_AB)
    // D3 = 2 mortal damage on the Brute (W3 models, 3 of them)
    put(s, GUARD, 0, 3.2, 1)
    s.units[GUARD].tokens = {}
    setQuarry(s, BRUTE)
    put(s, BRUTE, 0, 3.2, 3)
    s.units[GUARD].location = 'destroyed'
    const ctx = ctxFor(s, [4])
    useOnce(ctx, 'endOfTurn', 'A', BITES_AB)
    expect(wounds(s, BRUTE)).toBe(9 - 2)
    expect(summaries(ctx).some((x) => x.includes('Furious Bites: 2 mortal damage'))).toBe(true)
  })
})

describe('BOK-AB datasheet abilities', () => {
  // the stay option plus every slide the queue offers, with where the slide ends
  const slides = (ids: string[]) => ids.filter((id) => id !== 'mv:0:0').map((id) => { const [, dx, dz] = id.split(':'); return { id, dx: Number(dx), dz: Number(dz) } })
  const endsInCombat = (s: GameState, unitId: UnitId, dx: number, dz: number): boolean => {
    const enemies = Object.values(s.units).filter((u) => u.player !== s.units[unitId].player && u.location === 'board').flatMap((u) => unitModels(s, u.id))
    return unitModels(s, unitId).some((m) => enemies.some((e) => horizontalGap({ ...m, pos: { x: m.pos.x + dx, y: m.pos.y, z: m.pos.z + dz } }, e) <= 3 + 1e-6))
  }

  it('BOK-AB-1 Stalk the Prey: in any hero phase Karanak moves up to D6"; out of combat it cannot end in combat; in combat it may end in or out', () => {
    // out of combat: an enemy 6.5" away, a roll of 5 lets it close in but never into combat range
    // the card prints no ability keywords (no Move keyword)
    expect((abilitiesJson as unknown as AbilityDescriptor[]).find((a) => a.id === STALK)?.keywords ?? []).toEqual([])
    const s = game()
    put(s, KARANAK, 0, 0); put(s, GUARD, 0, 6.2, 1)
    s.phase = 'command'
    expect(offered(s, 'A', 'hero')).toEqual([STALK])
    s.activePlayer = 'B' // the opponent's hero phase too
    expect(offered(s, 'A', 'hero')).toEqual([STALK])
    s.activePlayer = 'A'
    const ctx = ctxFor(s, [5])
    const r = useOnce(ctx, 'hero', 'A', STALK, { pickMode: (ids) => ids[ids.length - 1] })
    expect(r.topics).toContain('abilityMode')
    const opts = slides(r.options[r.options.length - 1])
    expect(opts.length).toBeGreaterThan(0)
    for (const o of opts) {
      expect(Math.hypot(o.dx, o.dz)).toBeLessThanOrEqual(5 + 1e-2)
      expect(endsInCombat(s, KARANAK, o.dx, o.dz)).toBe(false)
      expect(checkSlide(s, KARANAK, o.dx, o.dz, 5, false, { mayNotEndInCombat: true }).ok).toBe(true)
    }
    expect(summaries(ctx).some((x) => x.includes('rolled 5'))).toBe(true)
    // in combat: the move may end in combat or out of it
    const t = game()
    put(t, KARANAK, 0, 0); put(t, GUARD, 0, 3.2, 1)
    t.phase = 'command'
    const ctx2 = ctxFor(t, [6])
    const r2 = useOnce(ctx2, 'hero', 'A', STALK, { pickMode: (ids) => ids[ids.length - 1] })
    const opts2 = slides(r2.options[r2.options.length - 1])
    const ends = opts2.map((o) => endsInCombat(t, KARANAK, o.dx, o.dz))
    expect(ends).toContain(true)
    expect(ends).toContain(false)
    // the move is applied: Karanak actually moved (at most 6")
    const start = { x: 0, z: 0 }
    const m = firstModel(t, KARANAK)
    expect(Math.hypot(m.pos.x - start.x, m.pos.z - start.z)).toBeLessThanOrEqual(6 + 1e-6)
  })

  it('BOK-AB-1b Stalk the Prey: with the quarry on the board every accepted move ends closer to it; with the quarry in reserve or none, no closer rule', () => {
    const setup = (quarry: 'board' | 'reserve' | 'none') => {
      const s = game()
      put(s, KARANAK, 0, 0); put(s, BOSS, 12, 0, 1); put(s, GUARD, -8, 0, 1)
      s.phase = 'command'
      if (quarry !== 'none') setQuarry(s, BOSS)
      if (quarry === 'reserve') s.units[BOSS].location = 'reserves'
      const ctx = ctxFor(s, [4])
      const r = useOnce(ctx, 'hero', 'A', STALK, { pickMode: (ids) => ids[0] })
      return { s, opts: slides(r.options[r.options.length - 1]), r }
    }
    const on = setup('board')
    expect(on.opts.length).toBeGreaterThan(0)
    // every offered slide shrinks the gap to the quarry: the first option is the "Toward" heading
    const startGapBoss = (() => { const s = game(); put(s, KARANAK, 0, 0); put(s, BOSS, 12, 0, 1); return unitGap(s, KARANAK, BOSS) })()
    for (const o of on.opts) {
      const s2 = game(); put(s2, KARANAK, 0, 0); put(s2, BOSS, 12, 0, 1)
      const m = firstModel(s2, KARANAK)
      m.pos = { ...m.pos, x: m.pos.x + o.dx, z: m.pos.z + o.dz }
      expect(unitGap(s2, KARANAK, BOSS)).toBeLessThan(startGapBoss - 1e-6)
    }
    // quarry in reserve or none: slides away from the enemy are offered as well
    for (const q of ['reserve', 'none'] as const) {
      const off = setup(q)
      const away = off.opts.filter((o) => {
        const s2 = game(); put(s2, KARANAK, 0, 0); put(s2, BOSS, 12, 0, 1)
        const m = firstModel(s2, KARANAK)
        m.pos = { ...m.pos, x: m.pos.x + o.dx, z: m.pos.z + o.dz }
        return unitGap(s2, KARANAK, BOSS) > startGapBoss + 1e-6
      })
      expect(away.length, q).toBeGreaterThan(0)
    }
    expect(readMoveQueue(on.s)).toBeNull() // the queue is spent once the move is made
  })

  it('BOK-AB-2 Unflagging Hunters: Flesh Hounds add 1 to charge rolls; Karanak and the Claws do not', () => {
    const s = game()
    const bonus = (unitId: UnitId): number => {
      const ctx = ctxFor(s, [3, 4])
      const roll = ctx.roll({ purpose: 'charge', player: 'A', count: 2, mode: 'sum', unitId })
      return hookService.collect(ctx, 'onChargeRoll', { chargingUnitId: unitId, targetUnitIds: [BRUTE], roll: { purpose: 'charge', roll, dieIndex: 0, unmodified: 7, rerolled: false } })
        .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
    }
    expect(bonus(HOUNDS1)).toBe(1)
    expect(bonus(HOUNDS2)).toBe(1)
    expect(bonus(KARANAK)).toBe(0)
    expect(bonus(CLAWS)).toBe(0)
  })

  it('BOK-AB-3 Pack Hunters: only an enemy in combat with both the Claws and a Flesh Hounds unit can be picked; the Claws crit on unmodified 5+ against it until end of turn; other targets crit on 6 only', () => {
    const s = game()
    s.phase = 'fight'
    // Brute: in combat with the Claws and Hounds 1. Guard: in combat with the Claws only.
    put(s, BRUTE, 0, 0, 1); put(s, HOUNDS1, 0, 2.6, 1)
    put(s, CLAWS, -2, -2.6, 1); trim(s, CLAWS, 2)
    s.units[CLAWS].models.forEach((id, i) => { s.models[id].pos = { x: i === 0 ? -1 : 9, y: 0, z: i === 0 ? -2.6 : 0 } })
    put(s, GUARD, 9, 2.6, 1)
    expect(targetsOf('khornePackHunters', s, CLAWS, 'A')).toEqual([BRUTE])
    // without a Flesh Hounds unit beside it nothing is on offer
    const lone = game()
    lone.phase = 'fight'
    put(lone, BRUTE, 0, 0, 1); put(lone, CLAWS, -1, -2.6, 1)
    expect(targetsOf('khornePackHunters', lone, CLAWS, 'A')).toEqual([])
    expect(offered(lone, 'A', 'fight')).not.toContain(PACK)
    expect(offered(s, 'A', 'fight')).toContain(PACK)
    const ctx = ctxFor(s)
    useOnce(ctx, 'fight', 'A', PACK, { target: BRUTE })
    // 3 attacks, all 5s: critical hits (Crit (2 Hits)) against the picked unit
    const picked = attack(s, 'melee', [5, 5, 5, 1, 1, 1, 1, 1, 1], CLAWS, W('weapons-of-the-hunt'), BRUTE)
    expect(of(picked.events, 'HitRolled').map((h) => h.critical)).toEqual([true, true, true])
    expect(of(picked.events, 'HitRolled').map((h) => h.extraHits)).toEqual([1, 1, 1])
    // against any other unit a 5 is a plain hit
    const other = attack(s, 'melee', [5, 5, 5, 1, 1, 1], CLAWS, W('weapons-of-the-hunt'), GUARD)
    expect(of(other.events, 'HitRolled').map((h) => h.critical)).toEqual([false, false, false])
    expect(of(other.events, 'HitRolled').map((h) => h.hit)).toEqual([true, true, true])
    // a 6 is critical anywhere
    const six = attack(s, 'melee', [6, 1, 1, 1, 1], CLAWS, W('weapons-of-the-hunt'), GUARD)
    expect(of(six.events, 'HitRolled')[0].critical).toBe(true)
    // the effect ends with the turn
    effectService.expire(ctx, 'turnEnd', null)
    const later = attack(s, 'melee', [5, 5, 5, 1, 1, 1], CLAWS, W('weapons-of-the-hunt'), BRUTE)
    expect(of(later.events, 'HitRolled').map((h) => h.critical)).toEqual([false, false, false])
    // the condition is only checked at the Declare: it lasts although the Hounds are gone
    const t = game()
    t.phase = 'fight'
    put(t, BRUTE, 0, 0, 1); put(t, HOUNDS1, 0, 2.6, 1); put(t, CLAWS, -1, -2.6, 1)
    useOnce(ctxFor(t), 'fight', 'A', PACK, { target: BRUTE })
    t.units[HOUNDS1].location = 'destroyed'
    const stay = attack(t, 'melee', [5, 1, 1, 1, 1], CLAWS, W('weapons-of-the-hunt'), BRUTE)
    expect(of(stay.events, 'HitRolled')[0].critical).toBe(true)
  })
})

describe('BOK-WEAP weapons in combat', () => {
  it('BOK-WEAP-1 Savage Maws and Goreslick Claws: Rend 2 against a Hero, Rend 1 otherwise', () => {
    const run = (target: UnitId) => {
      const s = game()
      put(s, KARANAK, 0, 0); put(s, target, 0, 3.2, 1)
      // 6 attacks hit (4), wound (6), the saves are 4s: a 3+ save with Rend 1 makes 4+ and passes, Rend 2 makes 5+ and fails
      return attack(s, 'melee', [4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 4, 4, 4, 4, 4, 4], KARANAK, W('savage-maws-and-goreslick-claws'), target)
    }
    const brute = run(BRUTE)
    // Rend is subtracted from the save roll: a 4 becomes a 3 (saves on 3+) against Rend 1 and a 2 against Rend 2
    expect(of(brute.events, 'SaveRolled').map((x) => x.final)).toEqual([3, 3, 3, 3, 3, 3])
    expect(of(brute.events, 'SaveRolled').every((x) => x.saved)).toBe(true)
    const boss = run(BOSS)
    expect(of(boss.events, 'SaveRolled').map((x) => x.final)).toEqual([2, 2, 2, 2, 2, 2])
    expect(of(boss.events, 'SaveRolled').every((x) => !x.saved)).toBe(true)
  })

  it('BOK-WEAP-2 Weapons of the Hunt: each critical hit scores 2 hits', () => {
    const s = game()
    put(s, CLAWS, 0, 0, 1); put(s, GUARD, 0, 2.5, 5)
    // 3 attacks: 6, 6, 4. The two criticals count double, so 5 hits go to the wound roll
    const r = attack(s, 'melee', [6, 6, 4, 1, 1, 1, 1, 1], CLAWS, W('weapons-of-the-hunt'), GUARD)
    const rolled = of(r.events, 'HitRolled')
    expect(rolled.map((h) => h.critical)).toEqual([true, true, false])
    expect(rolled.map((h) => h.extraHits)).toEqual([1, 1, 0])
    expect(of(r.events, 'WoundRolled')).toHaveLength(5)
  })

  it('BOK-WEAP-3 Weapons of the Hunt with Blood-Drenched: the attacking player picks Crit (Mortal) or Crit (2 Hits) before the dice; the AI picks Crit (Mortal) against a 5+ or better save and Crit (2 Hits) against a 6+ save', () => {
    const build = (sv: number) => {
      const s = game({ patch: (b) => { b.datasheets['fx.guard'].stats = { ...b.datasheets['fx.guard'].stats, Sv: sv } } })
      put(s, CLAWS, 0, 0, 1); put(s, GUARD, 0, 2.5, 5)
      // Blood-Drenched has been used on the Claws
      effectService.grant(ctxFor(s), CLAWS, { when: { weaponType: 'melee' }, grantWeaponAbility: { ability: 'CRIT_MORTAL' } }, { sourceAbilityId: BLOOD, sourceUnitId: CLAWS, scope: { who: 'self' }, duration: 'battle' })
      s.phase = 'fight'
      const modelId = firstModel(s, CLAWS).id
      const rng = new ScriptedRng([6, 1, 1, 1, 1, 1, 1, 1])
      const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
      attackService.begin(ctx, { kind: 'melee', attackerUnitId: CLAWS, overwatch: false, targets: [{ modelId, weaponId: W('weapons-of-the-hunt'), targetUnitId: GUARD, profileGroup: null, attacks: null }] })
      return { s, ctx, events, pending: attackService.advance(ctx) }
    }
    const vs4 = build(4)
    expect(vs4.pending).toBe('pending')
    const p = vs4.s.pending as ChooseOptionDecision
    expect(p.context.topic).toBe('critChoice')
    expect(p.player).toBe('A')
    expect(of(vs4.events, 'HitRolled')).toHaveLength(0) // asked before any dice
    expect(p.options.map((o) => o.id).sort()).toEqual(['CRIT_2_HITS', 'CRIT_MORTAL'])
    const value = (d: ChooseOptionDecision, id: string) => (d.options.find((o) => o.id === id)!.hint as { value: number }).value
    // Guard Sv 4+: Crit (Mortal) 1 damage beats 2 hits x 2/3 to wound x 1/2 unsaved = 0.667
    expect(value(p, 'CRIT_MORTAL')).toBeGreaterThan(value(p, 'CRIT_2_HITS'))
    // a human may choose either: take Crit (2 Hits) and the sequence goes through the wound roll
    vs4.s.pending = null
    expect(DEFAULT_MODULES.topics.critChoice?.handle(vs4.ctx, { type: 'chooseOption', player: 'A', decisionId: p.id, optionId: 'CRIT_2_HITS' }, p)).toBeUndefined()
    expect(attackService.advance(vs4.ctx)).toBe('done')
    expect(of(vs4.events, 'WoundRolled').length).toBe(2)
    // Guard Sv 6+: 2 hits x 2/3 x 5/6 unsaved = 1.11 beats the 1 damage of Crit (Mortal)
    const vs6 = build(6)
    const p6 = vs6.s.pending as ChooseOptionDecision
    expect(value(p6, 'CRIT_2_HITS')).toBeGreaterThan(value(p6, 'CRIT_MORTAL'))
    // Sv 5+: 2 x 2/3 x 2/3 = 0.889 < 1
    const p5 = build(5).s.pending as ChooseOptionDecision
    expect(value(p5, 'CRIT_MORTAL')).toBeGreaterThan(value(p5, 'CRIT_2_HITS'))
    // the utility AI takes the highest hint
    const pick = (d: ChooseOptionDecision): string => d.options.reduce((a, o) => ((o.hint as { value: number }).value > (a.hint as { value: number }).value ? o : a)).id
    expect(pick(p)).toBe('CRIT_MORTAL')
    expect(pick(p6)).toBe('CRIT_2_HITS')
  })
})

describe('BOK-ENG engine pieces the army uses', () => {
  it('BOK-ENG-C1 turn ledger: damaged / slew-in-fight are true after the event this turn and false the next; Khorne units record both', () => {
    const s = game()
    put(s, CLAWS, 0, 0, 1); put(s, GUARD, 0, 2.2, 3)
    s.phase = 'fight'
    expect(damagedThisTurn(s, GUARD)).toBe(false)
    attack(s, 'melee', [4, 1, 1, 3, 1], CLAWS, W('weapons-of-the-hunt'), GUARD)
    expect(damagedThisTurn(s, GUARD)).toBe(true)
    expect(slewInFightThisTurn(s, CLAWS)).toBe(true)
    expect(damagedThisTurn(s, CLAWS)).toBe(false)
    s.activePlayer = 'B'
    expect(damagedThisTurn(s, GUARD)).toBe(false)
    expect(slewInFightThisTurn(s, CLAWS)).toBe(false)
  })

  it('BOK-ENG-C2 the slide rules Stalk the Prey uses: closerToUnit rejects a slide that does not reduce the gap; endFree lets an in-combat unit end out of combat', () => {
    const s = game()
    put(s, KARANAK, 0, 0); put(s, BOSS, 10, 0, 1)
    expect(checkSlide(s, KARANAK, 3, 0, 6, false, { mayNotEndInCombat: true, closerToUnit: BOSS }).ok).toBe(true)
    expect(checkSlide(s, KARANAK, 0, 3, 6, false, { mayNotEndInCombat: true, closerToUnit: BOSS }).ok).toBe(false)
    expect(checkSlide(s, KARANAK, -3, 0, 6, false, { mayNotEndInCombat: true, closerToUnit: BOSS }).ok).toBe(false)
    put(s, GUARD, 0, 3.2, 1)
    expect(checkSlide(s, KARANAK, 0, -4, 6, true).ok).toBe(false) // the default: a unit that starts in combat must end in it
    expect(checkSlide(s, KARANAK, 0, -4, 6, true, { endFree: true }).ok).toBe(true)
  })

  it('BOK-ENG-C3 chargeMustEndInCombatWith: Killing Pounce\'s hook names the quarry only while its effect is on the general', () => {
    const s = game({ enh: POUNCE })
    put(s, KARANAK, 0, -8); put(s, BOSS, 0, 4, 1)
    setQuarry(s, BOSS)
    s.phase = 'charge'
    expect(chargeMustEndInCombatWith(s, KARANAK)).toEqual([])
    useOnce(ctxFor(s), 'chargeStart', 'A', POUNCE_AB)
    expect(chargeMustEndInCombatWith(s, KARANAK)).toEqual([BOSS])
    // the quarry off the battlefield: no constraint left
    s.units[BOSS].location = 'reserves'
    expect(chargeMustEndInCombatWith(s, KARANAK)).toEqual([])
  })
})

describe('Khorne AI hints', () => {
  it('BOK-AI the bot picks the enemy general as the quarry when Karanak can reach it, Blood-Drenched goes to Karanak first, and the end-of-turn order is Bites, Blood-Drenched, Gore', () => {
    const s = game()
    put(s, KARANAK, 0, 0); put(s, BOSS, 12, 0, 1); put(s, GUARD, 6, 6, 3)
    s.units[HAWK].location = 'reserves'
    const bonus = (id: UnitId) => khorneTargetBonus(s, 'A', 'khorneTheQuarry', id) as number
    expect(bonus(BOSS)).toBeGreaterThan(bonus(GUARD))
    expect(bonus(GUARD)).toBeGreaterThan(bonus(HAWK))
    const bd = (id: UnitId) => khorneTargetBonus(s, 'A', 'khorneBloodDrenched', id) as number
    expect(bd(KARANAK)).toBeGreaterThan(bd(CLAWS))
    expect(bd(CLAWS)).toBeGreaterThan(bd(HOUNDS1))
    const t = (code: string) => khorneAbilityTiming(s, 'A', code, KARANAK) as number
    expect(t('khorneFuriousBites')).toBeGreaterThan(t('khorneBloodDrenched'))
    expect(t('khorneBloodDrenched')).toBeGreaterThan(t('khorneSustainedByGore'))
    // Stalk the Prey is worth it when the quarry is far, not when Karanak is already in its face
    setQuarry(s, BOSS)
    expect(khorneAbilityTiming(s, 'A', 'khorneStalkThePrey', KARANAK)).toBeGreaterThan(0)
    // the abilityUse option carries no unit, so the hint finds the general itself
    expect(khorneAbilityTiming(s, 'A', 'khorneStalkThePrey', null)).toBeGreaterThan(0)
    // Savagery is kept until a fight is worth it
    expect(khorneAbilityTiming(s, 'A', 'khorneSavagery', null)).toBeLessThan(-2)
    put(s, BOSS, 0, 3.2, 1)
    expect(khorneAbilityTiming(s, 'A', 'khorneSavagery', null)).toBeGreaterThanOrEqual(-2)
  })
})
