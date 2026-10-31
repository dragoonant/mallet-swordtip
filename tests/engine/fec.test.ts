// Flesh-eater Courts (Carrion Retainers) code hooks: docs/spec/factions/flesh-eater-courts.md, test ids FEC-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/fec files on top of the AoS fixture bundle (player A = Carrion
// Retainers, player B = the fixture Chaos army: Boss, Brutes, Hawk, Guard). Dice are scripted; nothing here patches the shipped data except
// where a test says so. Units start in reserves; each test places the ones it needs.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, removeModel, unitModels,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService, ownFightResolved } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { hiddenFrom } from '../../src/engine/los'
import { canCast, castingLevel, castingRoll, unbinders, wizardLevel } from '../../src/engine/magic'
import { canDeclareCharge, chargeRollModifier } from '../../src/engine/phases/charge'
import { unitIgnoresRetreatDamage } from '../../src/engine/phases/movement'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { addDeeds, deedsOf, fecAbilityTiming, fecModeBonus, fecTargetBonus, spendDeeds, summonSplits } from '../../src/engine/factions/fec'
import { weaponService } from '../../src/engine/weapons'
import { losService } from '../../src/engine/los'
import { modelStats } from '../../src/engine/state'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import type { ChargeState } from '../../src/engine/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/fec/abilities.json'
import enhancementsJson from '../../src/data/factions/fec/enhancements.json'
import weaponsJson from '../../src/data/factions/fec/weapons.json'
import factionJson from '../../src/data/factions/fec/faction.json'
import patrolJson from '../../src/data/factions/fec/patrols/carrion-retainers.json'
import archregentJson from '../../src/data/factions/fec/datasheets/abhorrant-archregent.json'
import cryptguardJson from '../../src/data/factions/fec/datasheets/cryptguard.json'
import knightsJson from '../../src/data/factions/fec/datasheets/morbheg-knights.json'
import varghulfJson from '../../src/data/factions/fec/datasheets/varghulf-courtier.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  // cloned: a test that patches the data must not leak into the next one
  for (const a of structuredClone(abilitiesJson) as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of structuredClone(weaponsJson) as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of structuredClone([archregentJson, cryptguardJson, knightsJson, varghulfJson].flat()) as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of structuredClone(enhancementsJson) as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.fec = structuredClone(factionJson) as unknown as FactionData
  b.patrols[patrolJson.id] = structuredClone(patrolJson) as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const CRUSADING = 'fec.ability.crusading-army'
const DEFENDERS = 'fec.ability.defenders-of-the-realm'
const SUMMON = 'fec.ability.summon-loyal-subjects'
const DERANGED = 'fec.ability.deranged-transformation'
const FEAST = 'fec.ability.victory-feast'
const CHALICE_AB = 'fec.ability.blood-river-chalice'
const ORATION_AB = 'fec.ability.rousing-oration'
const CRIMSON_AB = 'fec.ability.crimson-victuals'
const CLOAK = 'fec.enh.ulguan-cloak'
const CHALICE = 'fec.enh.blood-river-chalice'
const ORATION = 'fec.enh.rousing-oration'
const CRIMSON = 'fec.enh.crimson-victuals'

const ARCH = 'A:abhorrant-archregent'
const CRYPT = 'A:cryptguard'
const KN = 'A:morbheg-knights'
const VARG = 'A:varghulf-courtier'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'

const W = (id: string) => `fec.weapon.${id}`
const WIZARD = (b: DataBundle): void => { b.datasheets['fx.boss'].keywords = ['HERO', 'INFANTRY', 'WIZARD']; b.datasheets['fx.boss'].wizard = 1 }

// the unit's models in a tight row centred on (cx, cz); the unit goes onto the board
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

// every model of the unit slain
const kill = (s: GameState, unitId: UnitId): void => { for (const id of [...s.units[unitId].models]) removeModel(s, id) }
// the first `n` models of the unit slain (they can come back)
const slay = (s: GameState, unitId: UnitId, n: number): void => { for (const id of [...s.units[unitId].models].slice(0, n)) removeModel(s, id) }

// one model of the unit on the board at (x, z), the rest dropped (not slain)
function put(s: GameState, unitId: UnitId, x: number, z: number): void {
  trim(s, unitId, 1)
  s.units[unitId].location = 'board'
  unitModels(s, unitId)[0].pos = { x, y: 0, z }
}

function game(opts: { enh?: string; reg?: string; round?: number; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'fec', patrolId: 'fec.army.carrion-retainers', enhancementId: opts.enh ?? CLOAK, regimentAbilityId: opts.reg ?? CRUSADING }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  s.round = opts.round ?? 1
  s.phase = 'command'
  s.activePlayer = 'A'
  return s
}

// a new phase: the used-this-phase marks and ability ledgers of the old one are gone
const freshPhase = (s: GameState): void => {
  s.phaseState.marks = []
  s.players.A.abilityUses = []
  s.players.B.abilityUses = []
  for (const u of Object.values(s.units)) u.turn.abilitiesUsedThisPhase = []
}

const setDeeds = (s: GameState, unitId: UnitId, n: number): void => {
  s.mission.custom = { ...s.mission.custom, fecDeeds: { ...((s.mission.custom.fecDeeds as Record<string, number> | undefined) ?? {}), [unitId]: n } }
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

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: Pick): void {
  for (let i = 0; i < 30; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return
    const p = ctx.state.pending as ChooseOptionDecision
    const ids = p.options.map((o) => o.id)
    const choice = pick(p.context.topic, ids, p)
    ctx.state.pending = null
    const action = choice === 'pass' ? { type: 'pass' as const, player, decisionId: p.id } : { type: 'chooseOption' as const, player, decisionId: p.id, optionId: choice }
    const rej = abilityService.handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

// use one ability once; every other offer is declined. `mode` picks the abilityMode option (a split id, or the first non-"stay" move)
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string } = {}): string[] {
  let used = false
  const topics: string[] = []
  runWindow(ctx, window, player, (topic, ids) => {
    topics.push(topic)
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    if (topic === 'abilityMode') {
      if (opts.mode && ids.includes(opts.mode)) return opts.mode
      return ids.find((id) => id.startsWith('mv:') && id !== 'mv:0:0') ?? ids[0]
    }
    return ids[0]
  })
  return topics
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const targetsOf = (code: string, s: GameState, unitId: UnitId | null, player: PlayerId): UnitId[] =>
  (codeHooks[code].activate!.targets as unknown as (state: GameState, unitId: UnitId | null, player: PlayerId) => UnitId[])(s, unitId, player)
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

// a 2D6 charge roll and the modifier the charge-roll hooks add to it
function chargeMod(s: GameState, unitId: UnitId, dice: [number, number] = [3, 3]): number {
  const ctx = ctxFor(s, dice)
  const roll = ctx.roll({ purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId })
  const charge: ChargeState = { unitId, targetUnitIds: [], roll: dice, rerolled: false, distance: null, heroic: false }
  return chargeRollModifier(ctx, charge, roll)
}

// the Archregent next to the Brute, a Cryptguard unit beside it, the Knights and the Varghulf somewhere in the middle
function skirmish(opts: { round?: number; enh?: string; reg?: string } = {}): GameState {
  const s = game(opts)
  put(s, ARCH, 0, -4)
  centreRow(s, CRYPT, 0, -6)
  centreRow(s, KN, -4, -5)
  put(s, VARG, 5, -5)
  centreRow(s, BRUTE, 0, 4)
  return s
}

// ---------- tests ----------
describe('registry', () => {
  it('FEC-REG every code in the Flesh-eater Courts data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('FEC-ARMY-2 only the Cryptguard can be replaced: Call for Reinforcements never names the Archregent, Knights or Varghulf', () => {
    const s = game()
    for (const id of [ARCH, CRYPT, KN, VARG]) {
      const kw = s.datasheets[s.units[id].datasheetId].keywords
      expect(kw.includes('REINFORCEMENTS'), id).toBe(id === CRYPT)
      kill(s, id)
    }
    expect(replaceableUnits(s, 'A')).toEqual([CRYPT])
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).toContain('core.ability.call-for-reinforcements')
    expect(targetsOf('spearheadCallForReinforcements', s, null, 'A')).toEqual([CRYPT])
    // with only the other three destroyed nothing is on offer
    const t = game()
    for (const id of [ARCH, KN, VARG]) kill(t, id)
    expect(replaceableUnits(t, 'A')).toEqual([])
    t.phase = 'movement'
    expect(offered(t, 'A', 'movement')).not.toContain('core.ability.call-for-reinforcements')
  })

  it('FEC-ARMY-3 the Archregent has casting level 1 and no Wizard keyword: one spell per hero phase, and it never unbinds', () => {
    const s = game({ patch: WIZARD })
    put(s, ARCH, 0, -6)
    centreRow(s, BRUTE, 0, 4)
    put(s, BOSS, 8, 8)
    expect(wizardLevel(s, ARCH)).toBe(0)
    expect(castingLevel(s, ARCH)).toBe(1)
    expect(s.datasheets[s.units[ARCH].datasheetId].keywords).not.toContain('WIZARD')
    expect(canCast(s, ARCH)).toBe(true)
    // one attempt (a failed 2+3) uses up the phase's cast, so Deranged Transformation is gone too
    useOnce(ctxFor(s, [2, 3]), 'hero', 'A', DERANGED, { target: ARCH })
    expect(canCast(s, ARCH)).toBe(false)
    expect(offered(s, 'A', 'hero')).not.toContain(DERANGED)
    // a new phase starts with a fresh cast
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('magic:'))
    expect(canCast(s, ARCH)).toBe(true)
    // the enemy Boss casts with the Archregent 14" away: it is no unbinder, so only the casting dice are rolled
    s.activePlayer = 'B'
    expect(unbinders(s, BOSS)).not.toContain(ARCH)
    const ctx = ctxFor(s, [3, 3])
    const cast = castingRoll(ctx, { abilityId: 'test.spell', unitId: BOSS, player: 'B' }, BOSS, 6)
    expect(cast).toMatchObject({ cast: true, unbound: false })
    expect(leftOver(ctx)).toEqual([])
  })
})

describe('FEC-BT battle traits', () => {
  it('FEC-BT-1 Noble Deeds: a Hero\'s Fight gives points equal to the damage allocated (ward-saved points excluded), capped at 6; non-Heroes gain nothing; each Hero has its own tally', () => {
    const s = game()
    put(s, ARCH, 0, 0)
    centreRow(s, BRUTE, 0, 2.2)
    // 5 attacks: two hit, wound and fail their saves = 4 damage points allocated
    const r = attack(s, 'melee', [3, 3, 1, 1, 1, 3, 3, 1, 1], ARCH, W('gory-talons-and-fangs'), BRUTE, 5)
    expect(r.rng.remaining).toEqual([])
    const fight = ownFightResolved
    const ctx = ctxFor(s)
    fight(ctx, ARCH)
    expect(deedsOf(s, ARCH)).toBe(4)
    expect(summaries(ctx).some((x) => x.includes('4/6'))).toBe(true)
    // the Varghulf has its own tally
    expect(deedsOf(s, VARG)).toBe(0)
    // the points are added to (capped at 6; the excess is lost)
    const ctx2 = ctxFor(s)
    expect(addDeeds(ctx2, ARCH, 5)).toBe(2)
    expect(deedsOf(s, ARCH)).toBe(6)
    expect(addDeeds(ctx2, ARCH, 1)).toBe(0)
    spendDeeds(s, ARCH, 2)
    expect(deedsOf(s, ARCH)).toBe(4)

    // a unit that is not a Hero gains nothing from its Fight
    const t = game()
    centreRow(t, CRYPT, 0, 0)
    centreRow(t, BRUTE, 0, 1.6)
    attack(t, 'melee', [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1], CRYPT, W('cursed-weapon'), BRUTE, 6)
    ownFightResolved(ctxFor(t), CRYPT)
    expect(deedsOf(t, CRYPT)).toBe(0)
    expect((t.mission.custom.fecDeeds as Record<string, number> | undefined)?.[CRYPT]).toBeUndefined()

    // ward-saved damage points are not allocated: the Brute has Ward 6+ here; of 4 points one is saved
    const w = game({ patch: (b) => { b.datasheets['fx.brute'].stats.ward = 6 } })
    put(w, ARCH, 0, 0)
    centreRow(w, BRUTE, 0, 2.2)
    const rw = attack(w, 'melee', [3, 3, 1, 1, 1, 3, 3, 1, 1, 6, 1, 1, 1], ARCH, W('gory-talons-and-fangs'), BRUTE, 5)
    expect(rw.rng.remaining).toEqual([])
    ownFightResolved(ctxFor(w), ARCH)
    expect(deedsOf(w, ARCH)).toBe(3)

    // a destroyed Hero loses its tally
    setDeeds(s, VARG, 5)
    put(s, VARG, 5, -5)
    expect(deedsOf(s, VARG)).toBe(5)
    kill(s, VARG)
    expect(deedsOf(s, VARG)).toBe(0)
  })

  it('FEC-BT-2 Summon Loyal Subjects: 1 point returns a Cryptguard, 2 points a Knight, both within 9" of the Hero; never above starting strength; spends only for models returned; movement phase only', () => {
    const s = skirmish()
    s.phase = 'movement'
    slay(s, CRYPT, 4)
    slay(s, KN, 2)
    setDeeds(s, ARCH, 5)
    setDeeds(s, VARG, 3)
    expect(summonSplits(s, ARCH)[0]).toMatchObject({ k: 2, c: 1, points: 5 })
    // the battle trait is on the whole army; the declared target is the spending Hero
    expect(s.players.A.battleTraitIds).toContain(SUMMON)
    expect(offered(s, 'A', 'movement')).toContain(SUMMON)
    expect(targetsOf('fecSummonLoyalSubjects', s, null, 'A').sort()).toEqual([ARCH, VARG])
    // only the movement phase, only on your turn
    expect(offered(s, 'A', 'hero')).not.toContain(SUMMON)
    expect(offered(s, 'A', 'shooting')).not.toContain(SUMMON)
    expect(offered(s, 'B', 'movement')).not.toContain(SUMMON)

    // the Archregent spends 5: 1 Knight (2) and 3 Cryptguard (3); then the Varghulf (3 points) uses it too in the same window
    const ctx = ctxFor(s)
    const uses = [{ target: ARCH, mode: 'k1c3' }, { target: VARG, mode: 'k1c1' }]
    const kn: number[] = [], cg: number[] = []
    runWindow(ctx, 'movement', 'A', (topic, ids) => {
      if (topic === 'abilityUse') {
        if (uses.length === 0) return 'pass'
        return ids.find((id) => id.startsWith(SUMMON)) ?? 'pass'
      }
      if (topic === 'abilityTarget') return uses[0].target
      if (topic === 'abilityMode') {
        const pickMode = uses.shift()!.mode
        expect(ids).toContain(pickMode)
        return pickMode
      }
      return ids[0]
    })
    kn.push(s.units[KN].models.length); cg.push(s.units[CRYPT].models.length)
    expect(kn).toEqual([3]) // never above starting strength: 1 + 1 back
    expect(cg).toEqual([10]) // 6 + 3 + 1
    expect(deedsOf(s, ARCH)).toBe(0)
    expect(deedsOf(s, VARG)).toBe(0)
    expect(of(evOf(ctx), 'ModelReturned')).toHaveLength(6)
    // once a phase for every Hero: nothing left to offer
    expect(offered(s, 'A', 'movement')).not.toContain(SUMMON)
  })

  it('FEC-BT-2b Summon Loyal Subjects: a unit more than 9" from the Hero is not eligible, points left over stay, and a Hero can use it once per phase', () => {
    const s = skirmish()
    s.phase = 'movement'
    slay(s, CRYPT, 3)
    slay(s, KN, 1)
    setDeeds(s, ARCH, 6)
    // the Knights 12" away cannot come back; with 6 points the Archregent can still get the 3 Cryptguard
    put(s, ARCH, 6, -4)
    centreRow(s, KN, -11, -5)
    expect(summonSplits(s, ARCH).every((sp) => sp.k === 0)).toBe(true)
    useOnce(ctxFor(s), 'movement', 'A', SUMMON, { target: ARCH, mode: 'k0c3' })
    expect(s.units[CRYPT].models).toHaveLength(10)
    expect(s.units[KN].models).toHaveLength(2)
    expect(deedsOf(s, ARCH)).toBe(3) // unspent points stay
    // nothing left to return within range: not offered again, and not a second time in the phase either
    slay(s, CRYPT, 1)
    expect(offered(s, 'A', 'movement')).not.toContain(SUMMON)
    // the next movement phase: offered again
    freshPhase(s)
    expect(offered(s, 'A', 'movement')).toContain(SUMMON)
    // no points, no ability
    setDeeds(s, ARCH, 0)
    expect(offered(s, 'A', 'movement')).not.toContain(SUMMON)
  })

  it('FEC-BT-3 Feeding Frenzy: +1 Attacks to melee weapons wholly within 12" of a 6-point Hero; none at 5 points; Companion weapons unchanged; two 6-point Heroes still +1', () => {
    const s = skirmish()
    const cursed = W('cursed-weapon'), lance = W('grisly-lance'), claws = W('nightshrieker-claws'), talons = W('gory-talons-and-fangs'), fangs = W('dagger-like-fangs')
    setDeeds(s, ARCH, 5)
    expect(weaponOf(s, CRYPT, cursed).A).toBe(3)
    setDeeds(s, ARCH, 6)
    expect(weaponOf(s, CRYPT, cursed).A).toBe(4)
    expect(weaponOf(s, KN, lance).A).toBe(3)
    expect(weaponOf(s, KN, claws).A).toBe(3) // Companion: not affected
    expect(weaponOf(s, ARCH, talons).A).toBe(6) // the Hero itself
    expect(weaponOf(s, VARG, fangs).A).toBe(2)
    // wholly within: a Cryptguard unit with one model past 12" gets nothing
    centreRow(s, CRYPT, 0, -6)
    unitModels(s, CRYPT)[0].pos = { x: -9, y: 0, z: -4 }
    unitModels(s, CRYPT)[1].pos = { x: -13.5, y: 0, z: -4 }
    expect(weaponOf(s, CRYPT, cursed).A).toBe(3)
    centreRow(s, CRYPT, 0, -6)
    expect(weaponOf(s, CRYPT, cursed).A).toBe(4)
    // two 6-point Heroes do not stack
    setDeeds(s, VARG, 6)
    expect(weaponOf(s, CRYPT, cursed).A).toBe(4)
    // the Varghulf alone at 6 covers the units wholly within 12" of it (the Cryptguard are 5" away)
    setDeeds(s, ARCH, 0)
    expect(weaponOf(s, CRYPT, cursed).A).toBe(4)
    // an enemy unit never gets it
    expect(weaponOf(s, BRUTE, 'fx.w.brute-axe').A).toBe(3)
    // a Hero off the board counts for nothing
    kill(s, VARG)
    expect(weaponOf(s, CRYPT, cursed).A).toBe(3)
  })
})

describe('FEC-RA regiment abilities', () => {
  it('FEC-RA-1 Crusading Army: +1 to run rolls and charge rolls for every friendly unit', () => {
    const s = skirmish()
    for (const id of [ARCH, CRYPT, KN, VARG]) {
      expect(hookService.advanceRollFor(s, id, 3), id).toBe(4)
      expect(chargeMod(s, id), id).toBe(1)
    }
    // the enemy gets neither
    expect(hookService.advanceRollFor(s, BRUTE, 3)).toBe(3)
    expect(chargeMod(s, BRUTE)).toBe(0)
    // the other regiment ability gives neither
    const t = game({ reg: DEFENDERS })
    centreRow(t, CRYPT, 0, -6)
    expect(hookService.advanceRollFor(t, CRYPT, 3)).toBe(3)
    expect(chargeMod(t, CRYPT)).toBe(0)
  })

  it('FEC-RA-2 Defenders of the Realm: +1 to save rolls only while contesting an objective you control; none on a contested or enemy-held marker', () => {
    const run = (patch: (s: GameState) => void): number => {
      const s = game({ reg: DEFENDERS })
      put(s, KN, 0, 0)
      centreRow(s, BRUTE, 0, 2.4)
      patch(s)
      // one Brute swing: hit 4, wound 3, save die 3 against the Knights' 4+ (Rend 1 makes it 5+, the +1 makes it 4+)
      const r = attack(s, 'melee', [4, 3, 3, 1, 1], BRUTE, 'fx.w.brute-axe', KN, 1)
      return of(r.events, 'SaveRolled')[0].final
    }
    expect(run((s) => { s.objectives['obj-c'].controller = 'A' })).toBe(3)
    expect(run((s) => { s.objectives['obj-c'].controller = 'B' })).toBe(2)
    expect(run((s) => { s.objectives['obj-c'].controller = null })).toBe(2)
    // controlling a different marker does not help a unit standing elsewhere
    expect(run((s) => { s.objectives['obj-c'].controller = null; s.objectives['obj-w'].controller = 'A' })).toBe(2)
    // Crusading Army gives no save bonus
    const s = game({ reg: CRUSADING })
    put(s, KN, 0, 0)
    centreRow(s, BRUTE, 0, 2.4)
    s.objectives['obj-c'].controller = 'A'
    expect(of(attack(s, 'melee', [4, 3, 3, 1, 1], BRUTE, 'fx.w.brute-axe', KN, 1).events, 'SaveRolled')[0].final).toBe(2)
  })
})

describe('FEC-ENH enhancements', () => {
  it('FEC-ENH-1 Ulguan Cloak: enemy models more than 12" away cannot see (or shoot) the general; within 12" they can', () => {
    const s = game({ enh: CLOAK })
    put(s, ARCH, 0, 0)
    put(s, CRYPT, 3, 0)
    put(s, BRUTE, 0, 10)
    // the cloak is put in place the first time an ability window runs
    abilityService.runWindow(ctxFor(s), 'startOfRound', 'A')
    const brute = unitModels(s, BRUTE)[0]
    expect(hiddenFrom(s, brute, ARCH)).toBe(false) // 10": within 12"
    expect(losService.unitVisible(s, brute.id, ARCH)).toBe(true)
    brute.pos = { x: 0, y: 0, z: 14 }
    expect(hiddenFrom(s, brute, ARCH)).toBe(true) // 14"
    expect(losService.unitVisible(s, brute.id, ARCH)).toBe(false)
    // only the general: the unit beside it is not hidden
    expect(hiddenFrom(s, brute, CRYPT)).toBe(false)
    // idempotent: another window does not stack a second copy
    abilityService.runWindow(ctxFor(s), 'hero', 'A')
    expect(s.units[ARCH].effects.filter((e) => e.sourceAbilityId === 'fec.ability.ulguan-cloak')).toHaveLength(1)
    // without the enhancement nobody is hidden
    const t = game({ enh: CHALICE })
    put(t, ARCH, 0, 0)
    put(t, BRUTE, 0, 14)
    abilityService.runWindow(ctxFor(t), 'startOfRound', 'A')
    expect(hiddenFrom(t, unitModels(t, BRUTE)[0], ARCH)).toBe(false)
    // and the enemy's own units are not cloaked by it
    expect(hiddenFrom(s, unitModels(s, ARCH)[0], BRUTE)).toBe(false)
  })

  it('FEC-ENH-2 Blood-River Chalice: heals 2D3 on the general, once per battle, in your hero phase', () => {
    const s = game({ enh: CHALICE })
    put(s, ARCH, 0, -4)
    // undamaged: not offered
    expect(offered(s, 'A', 'hero')).not.toContain(CHALICE_AB)
    unitModels(s, ARCH)[0].woundsRemaining = 1
    expect(offered(s, 'A', 'hero')).toContain(CHALICE_AB)
    expect(offered(s, 'B', 'hero')).not.toContain(CHALICE_AB)
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'hero')).not.toContain(CHALICE_AB) // not the enemy's hero phase
    s.activePlayer = 'A'
    const ctx = ctxFor(s, [5, 6]) // 2D3: 3 + 3
    useOnce(ctx, 'hero', 'A', CHALICE_AB)
    expect(unitModels(s, ARCH)[0].woundsRemaining).toBe(6)
    expect(leftOver(ctx)).toEqual([])
    expect(summaries(ctx).some((x) => x.includes('Blood-River Chalice'))).toBe(true)
    // once per battle, even in a later round
    unitModels(s, ARCH)[0].woundsRemaining = 1
    s.round = 3
    expect(offered(s, 'A', 'hero')).not.toContain(CHALICE_AB)
    // the roll heals no more than the damage
    const t = game({ enh: CHALICE })
    put(t, ARCH, 0, -4)
    unitModels(t, ARCH)[0].woundsRemaining = 4
    useOnce(ctxFor(t, [5, 6]), 'hero', 'A', CHALICE_AB)
    expect(unitModels(t, ARCH)[0].woundsRemaining).toBe(6)
  })

  it('FEC-ENH-3 Rousing Oration: one D6 per friendly unit wholly within 12" except the general, each 5+ gives the general 1 point, cap 6', () => {
    const s = game({ enh: ORATION })
    put(s, ARCH, 0, -4)
    centreRow(s, CRYPT, 0, -6)
    centreRow(s, KN, -4, -5)
    put(s, VARG, 5, -5)
    centreRow(s, BRUTE, 0, 5) // an enemy: never counted
    expect(offered(s, 'A', 'hero')).toContain(ORATION_AB)
    // three friendly units besides the general: three dice (5, 2, 6 = two successes)
    const ctx = ctxFor(s, [5, 2, 6])
    useOnce(ctx, 'hero', 'A', ORATION_AB)
    expect(leftOver(ctx)).toEqual([])
    expect(deedsOf(s, ARCH)).toBe(2)
    // a unit not wholly within 12" gets no die: move the Varghulf away
    freshPhase(s)
    put(s, VARG, 14, 5)
    const ctx2 = ctxFor(s, [6, 6])
    useOnce(ctx2, 'hero', 'A', ORATION_AB)
    expect(leftOver(ctx2)).toEqual([])
    expect(deedsOf(s, ARCH)).toBe(4)
    // capped at 6
    freshPhase(s)
    setDeeds(s, ARCH, 5)
    put(s, VARG, 5, -5)
    useOnce(ctxFor(s, [6, 6, 6]), 'hero', 'A', ORATION_AB)
    expect(deedsOf(s, ARCH)).toBe(6)
    // nothing to gain at 6: not offered
    freshPhase(s)
    expect(offered(s, 'A', 'hero')).not.toContain(ORATION_AB)
    // and not without another unit near
    const t = game({ enh: ORATION })
    put(t, ARCH, 0, -4)
    expect(offered(t, 'A', 'hero')).not.toContain(ORATION_AB)
  })

  it('FEC-ENH-4 Crimson Victuals: casting 6+ deals D3 mortal damage to a visible enemy within 18"; the Cryptguard within 6" of it get a model back per damage point allocated; shares the one cast with Deranged Transformation; can be unbound', () => {
    const scene = (patch?: (b: DataBundle) => void): GameState => {
      const s = game({ enh: CRIMSON, patch })
      put(s, ARCH, 0, -8)
      centreRow(s, CRYPT, 0, 1.2) // 4" or so from the Brutes
      slay(s, CRYPT, 4)
      centreRow(s, BRUTE, 0, 5)
      return s
    }
    const s = scene()
    expect(targetsOf('fecCrimsonVictuals', s, ARCH, 'A')).toEqual([BRUTE])
    expect(offered(s, 'A', 'hero')).toContain(CRIMSON_AB)
    const hp = wounds(s, BRUTE)
    const ctx = ctxFor(s, [3, 3, 6]) // casting 6, the D3 is a 3
    useOnce(ctx, 'hero', 'A', CRIMSON_AB, { target: BRUTE })
    expect(leftOver(ctx)).toEqual([])
    expect(hp - wounds(s, BRUTE)).toBe(3)
    expect(s.units[CRYPT].models).toHaveLength(9) // 3 points allocated = 3 models back
    expect(of(evOf(ctx), 'ModelReturned')).toHaveLength(3)
    expect(summaries(ctx).some((x) => x.includes('Crimson Victuals') && x.includes('3 allocated'))).toBe(true)
    // the one cast of the phase is spent: no Deranged Transformation after it
    expect(offered(s, 'A', 'hero')).not.toContain(DERANGED)
    expect(offered(s, 'A', 'hero')).not.toContain(CRIMSON_AB)

    // a failed cast (2 + 3) does nothing
    const f = scene()
    const fc = ctxFor(f, [2, 3])
    const hpF = wounds(f, BRUTE)
    useOnce(fc, 'hero', 'A', CRIMSON_AB, { target: BRUTE })
    expect(wounds(f, BRUTE)).toBe(hpF)
    expect(f.units[CRYPT].models).toHaveLength(6)

    // too far from the Cryptguard: damage, but nobody returns
    const far = scene()
    centreRow(far, CRYPT, 0, -6.5)
    const farCtx = ctxFor(far, [3, 3, 4])
    useOnce(farCtx, 'hero', 'A', CRIMSON_AB, { target: BRUTE })
    expect(far.units[CRYPT].models).toHaveLength(6)
    expect(wounds(far, BRUTE)).toBeLessThan(9)

    // more than 18" away: not a target
    const out = scene()
    put(out, ARCH, -14, -10)
    centreRow(out, BRUTE, 14, 9)
    expect(targetsOf('fecCrimsonVictuals', out, ARCH, 'A')).toEqual([])

    // an enemy Wizard unbinds it (12 against the 6)
    const u = scene(WIZARD)
    put(u, BOSS, 9, 8)
    const hpU = wounds(u, BRUTE)
    const uc = ctxFor(u, [3, 3, 6, 6])
    useOnce(uc, 'hero', 'A', CRIMSON_AB, { target: BRUTE })
    expect(leftOver(uc)).toEqual([])
    expect(wounds(u, BRUTE)).toBe(hpU)
    expect(u.units[CRYPT].models).toHaveLength(6)
    expect(summaries(uc).some((x) => x.includes('unbound'))).toBe(true)
  })
})

describe('FEC-AB warscroll abilities', () => {
  it('FEC-AB-1 Deranged Transformation: casting 6+ gives a friendly unit wholly within 18" +2" Move and +1 to wound until your next turn', () => {
    const s = skirmish()
    centreRow(s, KN, 14, 6) // its far models are more than 18" off: not wholly within
    expect(targetsOf('fecDerangedTransformation', s, ARCH, 'A').sort()).toEqual([ARCH, CRYPT, VARG].sort())
    const ctx = ctxFor(s, [3, 3]) // casting 6
    useOnce(ctx, 'hero', 'A', DERANGED, { target: CRYPT })
    expect(leftOver(ctx)).toEqual([])
    const move = (st: GameState, id: UnitId): number => {
      const m = unitModels(st, id)[0]
      return hookService.statFor(st, { unitId: id, modelId: m.id, weapon: null, stat: 'M' }, modelStats(st, m).M)
    }
    expect(move(s, CRYPT)).toBe(8)
    expect(move(s, VARG)).toBe(10) // only the target
    // +1 to wound: a 3 wounds (4+ becomes 3+)
    centreRow(s, BRUTE, 0, -4.6)
    const r = attack(s, 'melee', [4, 3, 1], CRYPT, W('cursed-weapon'), BRUTE, 1)
    expect(of(r.events, 'WoundRolled')[0].wounded).toBe(true)
    // it lasts until the start of your next turn, then it is gone
    effectService.expire(ctxFor(s), 'nextOwnTurn', 'A')
    expect(move(s, CRYPT)).toBe(6)
    const r2 = attack(s, 'melee', [4, 3], CRYPT, W('cursed-weapon'), BRUTE, 1)
    expect(of(r2.events, 'WoundRolled')[0].wounded).toBe(false)
    // a failed cast gives nothing
    const f = skirmish()
    useOnce(ctxFor(f, [1, 2]), 'hero', 'A', DERANGED, { target: CRYPT })
    expect(move(f, CRYPT)).toBe(6)
    // a unit with a model past 18" is not a target (wholly within)
    const g = skirmish()
    unitModels(g, CRYPT)[0].pos = { x: -20, y: 0, z: -6 }
    expect(targetsOf('fecDerangedTransformation', g, ARCH, 'A')).not.toContain(CRYPT)
  })

  it('FEC-AB-2 Royal Bodyguard: +1 to ward rolls for a Hero wholly within 3" of the Cryptguard; none when only partly within', () => {
    const run = (cryptX: number | null): number => {
      const s = game()
      put(s, ARCH, 0, 0)
      if (cryptX !== null) { put(s, CRYPT, cryptX, 0) }
      centreRow(s, BRUTE, 0, 2.4)
      // one Brute swing: hit 4, wound 3, failed save 1; the ward die is a 5
      const before = wounds(s, ARCH)
      attack(s, 'melee', [4, 3, 1, 5, 5], BRUTE, 'fx.w.brute-axe', ARCH, 1)
      return before - wounds(s, ARCH)
    }
    expect(run(null)).toBe(2) // Ward 6+ fails a 5
    expect(run(1.5)).toBe(0) // wholly within 3": Ward 5+ holds
    expect(run(3.5)).toBe(2) // within the combat range, but not wholly
    // a natural 1 still fails the modified ward
    const s = game()
    put(s, ARCH, 0, 0)
    put(s, CRYPT, 1.5, 0)
    centreRow(s, BRUTE, 0, 2.4)
    attack(s, 'melee', [4, 3, 1, 1, 1], BRUTE, 'fx.w.brute-axe', ARCH, 1)
    expect(wounds(s, ARCH)).toBe(4)
    // the Cryptguard's own ward is 5+ and a non-Hero is not helped by a neighbour
    expect(s.datasheets[s.units[CRYPT].datasheetId].stats).toMatchObject({ ward: 5 })
  })

  it('FEC-AB-3 Predator\'s Pounce: the Knights can charge after Retreating and take no Retreat mortal damage', () => {
    const s = game()
    put(s, KN, -6, -2)
    put(s, BRUTE, -6, 5)
    s.phase = 'charge'
    s.units[KN].turn.moveType = 'fallBack'
    expect(canDeclareCharge(s, KN)).toBe(true)
    expect(unitIgnoresRetreatDamage(s, KN)).toBe(true)
    // nobody else in the army has it
    for (const id of [ARCH, CRYPT, VARG]) {
      centreRow(s, id, 5, 5)
      s.units[id].turn.moveType = 'fallBack'
      expect(unitIgnoresRetreatDamage(s, id), id).toBe(false)
      expect(canDeclareCharge(s, id), id).toBe(false)
    }
    s.units[KN].turn.moveType = 'advance'
    expect(canDeclareCharge(s, KN)).toBe(false)
  })

  it('FEC-AB-4 Victory Feast: at the end of a turn in which the Varghulf slew a model it heals D6 and may Retreat with no mortal damage; nothing if it slew nothing', () => {
    const scene = (): GameState => {
      const s = game()
      put(s, VARG, 0, 0)
      centreRow(s, BRUTE, 0, 2.6)
      unitModels(s, VARG)[0].woundsRemaining = 3
      return s
    }
    // it slew nothing: not offered
    const n = scene()
    expect(offered(n, 'A', 'endOfTurn')).not.toContain(FEAST)

    // a Brute dies to the Varghulf's claws this turn (the 7 attacks: 3 hits, wound, no save, 2 damage each; the Brutes have 3 Health)
    const s = scene()
    unitModels(s, BRUTE).slice(1).forEach((m) => { m.woundsRemaining = 3 })
    unitModels(s, BRUTE)[0].woundsRemaining = 1
    const r = attack(s, 'melee', [4, 4, 4, 4, 1, 1, 1, 1, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1], VARG, W('immense-claws'), BRUTE, 7)
    expect(of(r.events, 'ModelDestroyed').length).toBeGreaterThan(0)
    expect(offered(s, 'A', 'endOfTurn')).toContain(FEAST)
    // the enemy's end of turn does not offer it to the other side, nor does another turn
    const hp = wounds(s, VARG)
    const ctx = ctxFor(s, [5]) // Heal (D6): 5 (a 3-damage Hero heals 3 of it)
    const topics = useOnce(ctx, 'endOfTurn', 'A', FEAST)
    expect(leftOver(ctx)).toEqual([]) // no retreat damage die
    expect(wounds(s, VARG)).toBe(Math.min(8, hp + 5))
    expect(topics).toContain('abilityMode') // the free Retreat was offered
    // it retreated out of combat
    expect(enemiesInCombatOf(s, VARG)).toEqual([])
    expect(summaries(ctx).some((x) => x.includes('Victory Feast'))).toBe(true)
    // spent: not offered again this turn
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(FEAST)
    // a different turn: the old kill does not count
    const t = scene()
    attack(t, 'melee', [4, 4, 4, 4, 1, 1, 1, 1, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1], VARG, W('immense-claws'), BRUTE, 7)
    t.activePlayer = 'B'
    t.round = 2
    expect(offered(t, 'A', 'endOfTurn')).not.toContain(FEAST)

    // out of combat the Heal still happens, no Retreat is offered
    const u = scene()
    unitModels(u, BRUTE).forEach((m) => { m.pos = { x: m.pos.x, y: 0, z: 12 } })
    u.mission.custom = { ...u.mission.custom, fecFeast: { [VARG]: `${u.round}:${u.activePlayer}` } }
    const uc = ctxFor(u, [2])
    const ut = useOnce(uc, 'endOfTurn', 'A', FEAST)
    expect(ut).not.toContain('abilityMode')
    expect(wounds(u, VARG)).toBe(5)
  })

  it('FEC-WEAP-1 Grisly Lance deals 2 damage on a turn the Knights charged, 1 otherwise; the Nightshrieker\'s Claws and Teeth are Companion', () => {
    for (const charged of [true, false]) {
      const s = game()
      put(s, KN, 0, 0)
      centreRow(s, BRUTE, 0, 2.4)
      s.units[KN].turn.chargedThisTurn = charged
      // hit 3, wound 4, save die 1
      const r = attack(s, 'melee', [3, 4, 1], KN, W('grisly-lance'), BRUTE, 1)
      expect(of(r.events, 'DamagePoolResolved')[0].points).toBe(charged ? 2 : 1)
    }
    const s = game()
    put(s, KN, 0, 0)
    expect(weaponOf(s, KN, W('nightshrieker-claws')).abilities.some((a) => a.ability === 'COMPANION')).toBe(true)
    expect(weaponOf(s, KN, W('grisly-lance')).abilities.some((a) => a.ability === 'COMPANION')).toBe(false)
    // every Knight carries both weapons
    expect(s.models[s.units[KN].models[0]].weapons).toEqual([W('grisly-lance'), W('nightshrieker-claws')])
  })
})

describe('FEC-AI hints', () => {
  it('FEC-AI the bot saves 6 points for Feeding Frenzy unless a Knight can return, casts Crimson Victuals over Deranged Transformation when it brings Cryptguard back, and heals with the Chalice when hurt', () => {
    const s = skirmish({ enh: CRIMSON })
    s.phase = 'movement'
    slay(s, CRYPT, 3)
    setDeeds(s, ARCH, 6)
    // 6 points, only Cryptguard missing, the Archregent about to fight: keep them
    expect(fecAbilityTiming(s, 'A', 'fecSummonLoyalSubjects', null)!).toBeLessThanOrEqual(-3)
    // a Knight can return: spend
    slay(s, KN, 1)
    expect(fecAbilityTiming(s, 'A', 'fecSummonLoyalSubjects', null)!).toBeGreaterThan(-3)
    // the best split brings the Knight back first
    expect(summonSplits(s, ARCH)[0].k).toBe(1)
    expect(fecTargetBonus(s, 'A', 'fecSummonLoyalSubjects', ARCH)!).toBeGreaterThan(2)
    expect(fecModeBonus(s, 'fecSummonLoyalSubjects', null, 'k1c3', ARCH)!).toBeGreaterThan(fecModeBonus(s, 'fecSummonLoyalSubjects', null, 'k0c1', ARCH)!)

    // Deranged Transformation wants a unit about to charge; Crimson Victuals beats it when Cryptguard stand near a wounded target
    s.phase = 'command'
    centreRow(s, BRUTE, 0, 4)
    const crimson = fecAbilityTiming(s, 'A', 'fecCrimsonVictuals', ARCH)!
    expect(crimson).toBeGreaterThan(-3)
    // far from every enemy and nothing missing, no Crimson target: both pass
    const idle = game({ enh: CRIMSON })
    put(idle, ARCH, 0, -9)
    centreRow(idle, CRYPT, 0, -8)
    centreRow(idle, BRUTE, 0, 30)
    for (const o of Object.values(idle.objectives)) o.controller = 'A'
    expect(fecAbilityTiming(idle, 'A', 'fecCrimsonVictuals', ARCH)!).toBeLessThanOrEqual(-3)
    expect(fecAbilityTiming(idle, 'A', 'fecDerangedTransformation', ARCH)!).toBeLessThanOrEqual(-3)
    // the Chalice only when hurt
    const c = game({ enh: CHALICE })
    put(c, ARCH, 0, -4)
    expect(fecAbilityTiming(c, 'A', 'fecBloodRiverChalice', ARCH)!).toBeLessThanOrEqual(-3)
    unitModels(c, ARCH)[0].woundsRemaining = 2
    expect(fecAbilityTiming(c, 'A', 'fecBloodRiverChalice', ARCH)!).toBeGreaterThan(-3)
    // not our code: no opinion
    expect(fecAbilityTiming(c, 'A', 'daughtersDoomfire', ARCH)).toBeNull()
  })
})

// the enemies a unit is in combat with (3" combat range)
function enemiesInCombatOf(s: GameState, unitId: UnitId): UnitId[] {
  return losService.unitsInCombatWith(s, unitId)
}
