// Daughters of Khaine (Heartflayer Troupe) code hooks: docs/spec/factions/daughters-of-khaine.md, test ids DOK-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/daughters files on top of the AoS fixture bundle
// (player A = Heartflayer Troupe, player B = the fixture Chaos army: Boss, Brutes, Hawk, Guard). Dice are scripted; nothing here
// patches the shipped data except where a test says so. Units start in reserves; each test places the ones it needs.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, removeModel, unitModels,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { canCast, castingLevel, castingRoll, unbinders, wizardLevel } from '../../src/engine/magic'
import { chargeRollModifier } from '../../src/engine/phases/charge'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import {
  bloodRiteLevel, daughtersAbilityTiming, daughtersTargetBonus, epiphanyRound,
} from '../../src/engine/factions/daughters'
import { weaponService } from '../../src/engine/weapons'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import type { ChargeState } from '../../src/engine/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/daughters/abilities.json'
import enhancementsJson from '../../src/data/factions/daughters/enhancements.json'
import weaponsJson from '../../src/data/factions/daughters/weapons.json'
import factionJson from '../../src/data/factions/daughters/faction.json'
import patrolJson from '../../src/data/factions/daughters/patrols/heartflayer-troupe.json'
import ironscaleJson from '../../src/data/factions/daughters/datasheets/melusai-ironscale.json'
import aelvesJson from '../../src/data/factions/daughters/datasheets/witch-aelves.json'
import warlocksJson from '../../src/data/factions/daughters/datasheets/doomfire-warlocks.json'
import stalkersJson from '../../src/data/factions/daughters/datasheets/blood-stalkers.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  // cloned: a test that patches the data must not leak into the next one
  for (const a of structuredClone(abilitiesJson) as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of structuredClone(weaponsJson) as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of structuredClone([ironscaleJson, aelvesJson, warlocksJson, stalkersJson].flat()) as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of structuredClone(enhancementsJson) as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.daughters = structuredClone(factionJson) as unknown as FactionData
  b.patrols[patrolJson.id] = structuredClone(patrolJson) as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const EPI = 'daughters.ability.murderous-epiphany'
const BLESSING = 'daughters.ability.blessing-of-khaine'
const SLAUGHTER = 'daughters.ability.all-out-slaughter'
const CRYSTAL = 'daughters.ability.turned-to-crystal'
const DOOMFIRE = 'daughters.ability.doomfire'
const FLASK_AB = 'daughters.ability.flask-of-shademist'
const ORATOR_AB = 'daughters.ability.zealous-orator'
const FUELLED = 'daughters.enh.fuelled-by-revenge'
const BLOOD = 'daughters.enh.bathed-in-blood'
const FLASK = 'daughters.enh.flask-of-shademist'
const ORATOR = 'daughters.enh.zealous-orator'
const RITES = 'daughters.ability.blood-rites'

const ISC = 'A:melusai-ironscale'
const WA1 = 'A:witch-aelves-1'
const WA2 = 'A:witch-aelves-2'
const LOCK = 'A:doomfire-warlocks'
const STALK = 'A:blood-stalkers'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'

const W = (id: string) => `daughters.weapon.${id}`
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

// a new turn: the per-unit "used this phase" marks of the previous one are gone
const newTurn = (s: GameState, player: PlayerId): void => {
  s.activePlayer = player
  for (const u of Object.values(s.units)) u.turn.abilitiesUsedThisPhase = []
}

// one model of the unit on the board at (x, z), the rest dropped (not slain)
function put(s: GameState, unitId: UnitId, x: number, z: number): void {
  trim(s, unitId, 1)
  s.units[unitId].location = 'board'
  unitModels(s, unitId)[0].pos = { x, y: 0, z }
}

function game(opts: { enh?: string; reg?: string; round?: number; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'daughters', patrolId: 'daughters.army.heartflayer-troupe', enhancementId: opts.enh ?? FUELLED, regimentAbilityId: opts.reg ?? BLESSING }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  s.round = opts.round ?? 1
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

// use one ability once; every other offer is declined
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string } = {}): void {
  let used = false
  runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    return ids[0]
  })
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
const hitsOf = (events: GameEvent[]): number => of(events, 'HitRolled').filter((h) => h.hit).length

// a 2D6 charge roll with the given dice, and the modifier the charge-roll hooks add to it
function chargeMod(s: GameState, unitId: UnitId, dice: [number, number] = [3, 3]): number {
  const ctx = ctxFor(s, dice)
  const roll = ctx.roll({ purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId })
  const charge: ChargeState = { unitId, targetUnitIds: [], roll: dice, rerolled: false, distance: null, heroic: false }
  return chargeRollModifier(ctx, charge, roll)
}

// a fight setup: Witch Aelves facing the Brute across a small gap
function aelvesVsBrute(round: number): GameState {
  const s = game({ round })
  centreRow(s, WA1, 0, -2)
  centreRow(s, BRUTE, 0, 1)
  return s
}

// ---------- tests ----------
describe('registry', () => {
  it('DOK-REG every code in the Daughters data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('DOK-ARMY-3 only the two Witch Aelves units can be replaced: Call for Reinforcements never names the Ironscale, Warlocks or Blood Stalkers', () => {
    const s = game()
    for (const id of [ISC, WA1, WA2, LOCK, STALK]) {
      const kw = s.datasheets[s.units[id].datasheetId].keywords
      expect(kw.includes('REINFORCEMENTS'), id).toBe(id === WA1 || id === WA2)
      kill(s, id)
    }
    expect(replaceableUnits(s, 'A').sort()).toEqual([WA1, WA2])
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).toContain('core.ability.call-for-reinforcements')
    expect(targetsOf('spearheadCallForReinforcements', s, null, 'A').sort()).toEqual([WA1, WA2])
    // with only the other three destroyed nothing is on offer
    const t = game()
    for (const id of [ISC, LOCK, STALK]) kill(t, id)
    expect(replaceableUnits(t, 'A')).toEqual([])
    t.phase = 'movement'
    expect(offered(t, 'A', 'movement')).not.toContain('core.ability.call-for-reinforcements')
  })
})

describe('DOK-BT Blood Rites', () => {
  it('DOK-BT-1 the rites add up by battle round: round 3 has run +1, charge +1 and melee hit +1, but not wound +1', () => {
    const s = aelvesVsBrute(3)
    expect(bloodRiteLevel(s, 'A')).toBe(3)
    expect(hookService.advanceRollFor(s, WA1, 3)).toBe(4)
    expect(chargeMod(s, WA1)).toBe(1)
    // melee hit dice of 2 hit (3+ with +1); wound dice of 3 fail (4+, no wound bonus yet)
    const r = attack(s, 'melee', [2, 2, 2, 3, 3, 3], WA1, W('paired-sciansa'), BRUTE, 3)
    expect(hitsOf(r.events)).toBe(3)
    expect(of(r.events, 'WoundRolled').filter((x) => x.wounded)).toHaveLength(0)
    expect(r.rng.remaining).toEqual([])
    // the battle trait is on the whole army and the readout names the rites held
    expect(s.players.A.battleTraitIds).toEqual([RITES])
    const readout = codeHooks.daughtersBloodRites.resourceReadout!(s, s.abilities[RITES], 'A')!
    expect(readout).toMatchObject({ value: 3, max: 4 })
    expect(readout.help).toMatch(/Zealot/)
  })

  it('DOK-BT-2 Quickening Bloodlust: +1 to run rolls from round 1, for the army only, and not before the battle', () => {
    const s = game({ round: 1 })
    centreRow(s, WA1, 0, -5)
    centreRow(s, BRUTE, 0, 5)
    expect(hookService.advanceRollFor(s, WA1, 3)).toBe(4)
    expect(hookService.advanceRollFor(s, BRUTE, 3)).toBe(3)
    // round 1 gives nothing else
    expect(chargeMod(s, WA1)).toBe(0)
    const r = attack(s, 'melee', [2, 2, 2], WA1, W('paired-sciansa'), BRUTE, 3)
    expect(hitsOf(r.events)).toBe(0)
    // round 0 (before round 1 starts): no rite
    s.round = 0
    expect(bloodRiteLevel(s, 'A')).toBe(0)
    expect(hookService.advanceRollFor(s, WA1, 3)).toBe(3)
  })

  it('DOK-BT-3 Headlong Fury: +1 to charge rolls from round 2, not in round 1 (without the Epiphany)', () => {
    const s = game({ round: 1 })
    centreRow(s, WA1, 0, -5)
    expect(chargeMod(s, WA1)).toBe(0)
    s.round = 2
    expect(chargeMod(s, WA1)).toBe(1)
    s.round = 4
    expect(chargeMod(s, WA1)).toBe(1) // the same +1, not stacked
    centreRow(s, BRUTE, 0, 5)
    expect(chargeMod(s, BRUTE)).toBe(0)
  })

  it('DOK-BT-4 Zealot\'s Rage: +1 to hit for melee attacks only from round 3; shooting and the Companion bite do not gain it', () => {
    const run = (round: number): number => {
      const s = aelvesVsBrute(round)
      return hitsOf(attack(s, 'melee', [2, 2, 2, 1, 1, 1], WA1, W('paired-sciansa'), BRUTE, 3).events)
    }
    expect(run(2)).toBe(0)
    expect(run(3)).toBe(3)
    expect(run(4)).toBe(3)
    // shooting: the Heartseeker Bow (3+) misses a 2 even in round 4
    const s = game({ round: 4 })
    centreRow(s, STALK, 0, -4)
    centreRow(s, BRUTE, 0, 2)
    expect(hitsOf(attack(s, 'ranged', [2, 2, 2], STALK, W('heartseeker-bow'), BRUTE, 3).events)).toBe(0)
    // the Companion bite (5+) misses a 4 in round 4; the scimitar (3+) of the same unit hits a 2
    const t = game({ round: 4 })
    trim(t, LOCK, 2)
    centreRow(t, LOCK, 0, -1)
    centreRow(t, BRUTE, 0, 2)
    expect(hitsOf(attack(t, 'melee', [4, 4], LOCK, W('dark-steeds-vicious-bite'), BRUTE, 2).events)).toBe(0)
    expect(hitsOf(attack(t, 'melee', [2, 2, 1, 1], LOCK, W('cursed-scimitar'), BRUTE, 2).events)).toBe(2)
    // and round 2 does not give the scimitar the bonus
    t.round = 2
    expect(hitsOf(attack(t, 'melee', [2, 2], LOCK, W('cursed-scimitar'), BRUTE, 2).events)).toBe(0)
  })

  it('DOK-BT-5 Slaughterer\'s Strength: +1 to wound for melee attacks only in round 4; shooting never gets it', () => {
    const dmg = (round: number): number => {
      const s = aelvesVsBrute(round)
      const before = wounds(s, BRUTE)
      attack(s, 'melee', [3, 3, 3, 3, 3, 3, 1, 1, 1], WA1, W('paired-sciansa'), BRUTE, 3)
      return before - wounds(s, BRUTE)
    }
    expect(dmg(3)).toBe(0) // wounds on 4+: a 3 fails
    expect(dmg(4)).toBe(3) // 3 wounds on a 3, 3 failed saves (Sv 3+ with a die of 1)
    // shooting in round 4: the bow still wounds on 4+
    const s = game({ round: 4 })
    centreRow(s, STALK, 0, -4)
    centreRow(s, BRUTE, 0, 2)
    const before = wounds(s, BRUTE)
    attack(s, 'ranged', [3, 3, 3, 3, 3, 3, 1, 1, 1], STALK, W('heartseeker-bow'), BRUTE, 3)
    expect(wounds(s, BRUTE)).toBe(before)
  })
})

describe('DOK-RA regiment abilities', () => {
  it('DOK-RA-1 Murderous Epiphany: once per battle in your hero phase it pulls next round\'s rite forward, keeps it, does not double up, and is not offered in round 4', () => {
    const s = game({ reg: EPI, round: 2 })
    centreRow(s, WA1, 0, -5)
    expect(offered(s, 'A', 'hero')).toContain(EPI)
    expect(offered(s, 'B', 'hero')).not.toContain(EPI)
    expect(bloodRiteLevel(s, 'A')).toBe(2)
    expect(chargeMod(s, WA1)).toBe(1)
    const ctx = ctxFor(s)
    useOnce(ctx, 'hero', 'A', EPI)
    expect(epiphanyRound(s, 'A')).toBe(2)
    expect(bloodRiteLevel(s, 'A')).toBe(3)
    expect(summaries(ctx).some((x) => x.includes('Zealot'))).toBe(true)
    // Zealot's Rage right now, in round 2
    centreRow(s, BRUTE, 0, -2)
    expect(hitsOf(attack(s, 'melee', [2, 2, 2, 1, 1, 1], WA1, W('paired-sciansa'), BRUTE, 3).events)).toBe(3)
    // once per battle
    expect(offered(s, 'A', 'hero')).not.toContain(EPI)
    s.round = 3
    s.phase = 'command'
    expect(offered(s, 'A', 'hero')).not.toContain(EPI)
    // round 3 is still rite 3 (no second gain), Slaughterer's Strength waits for round 4
    expect(bloodRiteLevel(s, 'A')).toBe(3)
    const dmg = (): number => {
      const before = wounds(s, BRUTE)
      attack(s, 'melee', [3, 3, 3, 3, 3, 3, 1, 1, 1], WA1, W('paired-sciansa'), BRUTE, 3)
      return before - wounds(s, BRUTE)
    }
    expect(dmg()).toBe(0)
    s.round = 4
    expect(bloodRiteLevel(s, 'A')).toBe(4)
    expect(dmg()).toBeGreaterThan(0)
    // round 1 use: Headlong Fury at once, and round 2 is back in step with the round number
    const t = game({ reg: EPI, round: 1 })
    useOnce(ctxFor(t), 'hero', 'A', EPI)
    expect(bloodRiteLevel(t, 'A')).toBe(2)
    t.round = 2
    expect(bloodRiteLevel(t, 'A')).toBe(2)
    // a fresh game in round 4 never offers it (no fifth rite), nor in the opponent's hero phase
    const u = game({ reg: EPI, round: 4 })
    expect(offered(u, 'A', 'hero')).not.toContain(EPI)
    const v = game({ reg: EPI, round: 3 })
    expect(offered(v, 'A', 'hero')).toContain(EPI)
    v.activePlayer = 'B'
    expect(offered(v, 'A', 'hero')).not.toContain(EPI)
  })

  it('DOK-RA-2 Blessing of Khaine: +1 to ward rolls for a unit wholly within 12" of the general (never the general) for this phase; once per turn; usable in the enemy combat phase', () => {
    const s = game({ reg: BLESSING })
    s.phase = 'fight'
    put(s, ISC, 0, -5)
    trim(s, WA1, 2) // two models: losing one cannot break coherency and cull more
    centreRow(s, WA1, -2, -5)
    centreRow(s, STALK, 2, -8)
    centreRow(s, LOCK, 14, 5) // far outside 12"
    expect(offered(s, 'A', 'fight')).toContain(BLESSING)
    expect(targetsOf('daughtersBlessingOfKhaine', s, null, 'A').sort()).toEqual([STALK, WA1])
    expect(offered(s, 'B', 'fight')).not.toContain(BLESSING)
    // without it a ward die of 5 fails (6+) and the Aelf dies; with it the 5 holds
    centreRow(s, GUARD, -2, -2)
    const base = structuredClone(s)
    const w0 = wounds(base, WA1)
    attack(base, 'melee', [4, 4, 1, 5], GUARD, 'fx.w.guard-spear', WA1, 1)
    expect(wounds(base, WA1)).toBe(w0 - 1)
    useOnce(ctxFor(s), 'fight', 'A', BLESSING, { target: WA1 })
    expect(s.units[WA1].effects.some((e) => e.sourceAbilityId === BLESSING)).toBe(true)
    const r = attack(s, 'melee', [4, 4, 1, 5], GUARD, 'fx.w.guard-spear', WA1, 1)
    expect(wounds(s, WA1)).toBe(w0)
    expect(r.rng.remaining).toEqual([])
    // ends with the phase
    effectService.expire(ctxFor(s), 'phaseEnd', null)
    expect(s.units[WA1].effects.some((e) => e.sourceAbilityId === BLESSING)).toBe(false)
    // once per turn for the army; the enemy's combat phase is a new turn
    expect(offered(s, 'A', 'fight')).not.toContain(BLESSING)
    newTurn(s, 'B')
    expect(offered(s, 'A', 'fight')).toContain(BLESSING)
    // no general on the battlefield: nobody to bless
    s.units[ISC].location = 'destroyed'
    expect(targetsOf('daughtersBlessingOfKhaine', s, null, 'A')).toEqual([])
  })
})

describe('DOK-ENH enhancements', () => {
  it('DOK-ENH-1 Bathed in Blood: each enemy model the general slays (attack or Turned to Crystal) heals it 1, never above full Health', () => {
    const s = game({ enh: BLOOD })
    put(s, ISC, 0, 0)
    centreRow(s, GUARD, 0, 1.8)
    const general = unitModels(s, ISC)[0]
    general.woundsRemaining = 1
    const r = attack(s, 'melee', [3, 3, 4, 4, 1, 1, 1, 1], ISC, W('keldrisaith'), GUARD, 2)
    const slain = of(r.events, 'ModelDestroyed').filter((e) => e.unitId === GUARD).length
    expect(slain).toBeGreaterThanOrEqual(2)
    expect(general.woundsRemaining).toBe(Math.min(6, 1 + slain))
    expect(of(r.events, 'WoundsRegained').filter((e) => e.unitId === ISC)).toHaveLength(Math.min(5, slain))
    // at full Health nothing is healed
    general.woundsRemaining = 6
    const t = attack(s, 'melee', [3, 3, 4, 4, 1, 1, 1, 1], ISC, W('keldrisaith'), GUARD, 2)
    expect(general.woundsRemaining).toBe(6)
    expect(of(t.events, 'WoundsRegained')).toHaveLength(0)
    // a mortal-damage kill by Turned to Crystal counts too
    const u = game({ enh: BLOOD })
    put(u, ISC, 0, 0)
    put(u, GUARD, 1.92, 0)
    unitModels(u, ISC)[0].woundsRemaining = 4
    useOnce(ctxFor(u, [3]), 'endOfTurn', 'A', CRYSTAL)
    expect(u.units[GUARD].location).toBe('destroyed')
    expect(unitModels(u, ISC)[0].woundsRemaining).toBe(5)
    // another unit's kills do not heal the general
    const v = game({ enh: BLOOD })
    put(v, ISC, 12, -8)
    unitModels(v, ISC)[0].woundsRemaining = 3
    centreRow(v, WA1, 0, 0)
    centreRow(v, GUARD, 0, 1.8)
    attack(v, 'melee', [3, 3, 3, 4, 4, 4, 1, 1, 1], WA1, W('paired-sciansa'), GUARD, 3)
    expect(unitModels(v, ISC)[0].woundsRemaining).toBe(3)
  })

  it('DOK-ENH-2 Fuelled by Revenge: Blood Stalkers melee Rend +1 only while wholly within 12" of the general; the bow and other units are unchanged', () => {
    const s = game({ enh: FUELLED })
    put(s, ISC, 0, -5)
    centreRow(s, STALK, 3, -5)
    centreRow(s, WA1, -3, -5)
    expect(weaponOf(s, STALK, W('scianlar')).rend).toBe(1)
    expect(weaponOf(s, STALK, W('heartseeker-bow')).rend).toBe(1) // printed Rend 1, no bonus
    expect(weaponOf(s, WA1, W('paired-sciansa')).rend).toBe(0)
    // one model sticking out past 12" of the general: the unit is no longer wholly within
    centreRow(s, STALK, 10, -5)
    expect(weaponOf(s, STALK, W('scianlar')).rend).toBe(0)
    // all out of range
    centreRow(s, STALK, 0, 8)
    expect(weaponOf(s, STALK, W('scianlar')).rend).toBe(0)
    // another enhancement does not give it
    const t = game({ enh: BLOOD })
    put(t, ISC, 0, -5)
    centreRow(t, STALK, 3, -5)
    expect(weaponOf(t, STALK, W('scianlar')).rend).toBe(0)
  })

  it('DOK-ENH-3 Flask of Shademist: -1 to hit against friendly units wholly within 12" of the general for that phase only; others unaffected; once per battle', () => {
    const s = game({ enh: FLASK })
    s.phase = 'fight'
    put(s, ISC, 0, -5)
    centreRow(s, WA1, 3, -5)
    centreRow(s, LOCK, 13, 4) // outside 12"
    trim(s, LOCK, 2)
    centreRow(s, BRUTE, 3, -2)
    // hits scored by the Brute's axe (4+) on the target; the wound dice are 1s, so nothing is ever slain
    const dmgOn = (target: UnitId): number => hitsOf(attack(s, 'melee', [4, 4, 4, 1, 1, 1], BRUTE, 'fx.w.brute-axe', target, 3).events)
    expect(dmgOn(WA1)).toBeGreaterThan(0) // before the Flask: 4s hit
    expect(offered(s, 'A', 'fight')).toContain(FLASK_AB)
    const ctx = ctxFor(s)
    useOnce(ctx, 'fight', 'A', FLASK_AB)
    expect(summaries(ctx).some((x) => x.includes('Flask'))).toBe(true)
    expect(dmgOn(WA1)).toBe(0) // 4+ to hit becomes 5+
    expect(dmgOn(LOCK)).toBeGreaterThan(0) // outside 12": unaffected
    // the general's own unit counts, and a unit that walks out of the 12" loses it
    put(s, ISC, 0, 5)
    s.units[ISC].location = 'board'
    centreRow(s, BRUTE, 0, 7)
    expect(dmgOn(ISC)).toBe(0)
    centreRow(s, WA1, 14, -5)
    centreRow(s, BRUTE, 14, -2)
    expect(dmgOn(WA1)).toBeGreaterThan(0)
    centreRow(s, WA1, 3, 5)
    centreRow(s, BRUTE, 3, 8)
    expect(dmgOn(WA1)).toBe(0) // back inside it
    // gone with the phase, and only once per battle
    effectService.expire(ctxFor(s), 'phaseEnd', null)
    expect(dmgOn(WA1)).toBeGreaterThan(0)
    s.round = 2
    expect(offered(s, 'A', 'fight')).not.toContain(FLASK_AB)
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'fight')).not.toContain(FLASK_AB)
  })

  it('DOK-ENH-4 Zealous Orator: one D6 per slain model, each 5+ returns one; the unit must be wholly within 9" of the general and out of combat', () => {
    const s = game({ enh: ORATOR })
    put(s, ISC, 0, -6)
    centreRow(s, WA1, -2, -6)
    centreRow(s, WA2, 8, -6) // too far to be wholly within 9"
    for (const id of unitModels(s, WA1).slice(0, 3).map((m) => m.id)) removeModel(s, id)
    for (const id of unitModels(s, WA2).slice(0, 2).map((m) => m.id)) removeModel(s, id)
    expect(targetsOf('daughtersZealousOrator', s, ISC, 'A')).toEqual([WA1])
    expect(offered(s, 'A', 'hero')).toContain(ORATOR_AB)
    expect(offered(s, 'B', 'hero')).not.toContain(ORATOR_AB)
    const ctx = ctxFor(s, [5, 4, 6])
    useOnce(ctx, 'hero', 'A', ORATOR_AB, { target: WA1 })
    expect(s.units[WA1].models).toHaveLength(4)
    expect(leftOver(ctx)).toEqual([])
    expect(summaries(ctx).some((x) => x.includes('2 models returned'))).toBe(true)
    // nothing slain, nothing to bring back; in combat, not allowed
    const t = game({ enh: ORATOR })
    put(t, ISC, 0, -6)
    centreRow(t, WA1, -2, -6)
    expect(targetsOf('daughtersZealousOrator', t, ISC, 'A')).toEqual([])
    removeModel(t, unitModels(t, WA1)[0].id)
    expect(targetsOf('daughtersZealousOrator', t, ISC, 'A')).toEqual([WA1])
    centreRow(t, BRUTE, -2, -3)
    expect(targetsOf('daughtersZealousOrator', t, ISC, 'A')).toEqual([])
    // the general may be picked too, but a one-model unit has nothing slain while it stands
    expect(targetsOf('daughtersZealousOrator', t, ISC, 'A')).not.toContain(ISC)
  })
})

describe('DOK-AB warscroll abilities', () => {
  it('DOK-AB-1 All-Out Slaughter: +1 Attacks to a friendly unit\'s melee weapons (not Companion) for the turn; cannot target the Ironscale; wholly within 12"', () => {
    const s = game()
    put(s, ISC, 0, -6)
    centreRow(s, WA1, 0, -4)
    trim(s, LOCK, 2)
    centreRow(s, LOCK, 5, -6)
    centreRow(s, STALK, 0, 9) // too far
    expect(targetsOf('daughtersAllOutSlaughter', s, ISC, 'A').sort()).toEqual([LOCK, WA1])
    expect(offered(s, 'A', 'hero')).toContain(SLAUGHTER)
    expect(weaponOf(s, WA1, W('paired-sciansa')).A).toBe(3)
    const ctx = ctxFor(s)
    useOnce(ctx, 'hero', 'A', SLAUGHTER, { target: LOCK })
    expect(weaponOf(s, LOCK, W('cursed-scimitar')).A).toBe(3)
    expect(weaponOf(s, LOCK, W('dark-steeds-vicious-bite')).A).toBe(2) // Companion: not affected
    expect(weaponOf(s, LOCK, W('doomfire-crossbow')).A).toBe(2) // ranged: not affected
    expect(weaponOf(s, WA1, W('paired-sciansa')).A).toBe(3) // only the picked unit
    // once per phase for the unit
    expect(offered(s, 'A', 'hero')).not.toContain(SLAUGHTER)
    // the effect lasts to the end of the turn, then it is gone
    effectService.expire(ctxFor(s), 'phaseEnd', null)
    expect(weaponOf(s, LOCK, W('cursed-scimitar')).A).toBe(3)
    effectService.expire(ctxFor(s), 'turnEnd', null)
    expect(weaponOf(s, LOCK, W('cursed-scimitar')).A).toBe(2)
  })

  it('DOK-AB-2 Turned to Crystal: end of any turn, an enemy within 1" takes 1 mortal damage on a 2+; nothing on a 1; once per turn', () => {
    const s = game()
    put(s, ISC, 0, 0)
    put(s, BRUTE, 1.9, 0) // about 1/3" between the bases
    put(s, BOSS, 5, 0) // well beyond 1"
    expect(targetsOf('daughtersTurnedToCrystal', s, ISC, 'A')).toEqual([BRUTE])
    expect(offered(s, 'A', 'endOfTurn')).toContain(CRYSTAL)
    const hp = wounds(s, BRUTE)
    const miss = ctxFor(s, [1])
    useOnce(miss, 'endOfTurn', 'A', CRYSTAL)
    expect(wounds(s, BRUTE)).toBe(hp)
    expect(leftOver(miss)).toEqual([])
    // the roll was made: once per turn
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(CRYSTAL)
    // the enemy's turn is another turn, and the unit counts as the user whoever's turn it is
    newTurn(s, 'B')
    expect(offered(s, 'A', 'endOfTurn')).toContain(CRYSTAL)
    const hit = ctxFor(s, [2])
    useOnce(hit, 'endOfTurn', 'A', CRYSTAL)
    expect(wounds(s, BRUTE)).toBe(hp - 1)
    expect(summaries(hit).some((x) => x.includes('1 mortal damage'))).toBe(true)
    // nothing within 1": not offered
    put(s, BRUTE, 6, 0)
    s.round = 2
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(CRYSTAL)
  })

  it('DOK-AB-3 Heartseekers: the bow crits (and auto-wounds) on 5+ if the unit used no Move ability this turn; 6 only after a move, run, retreat or charge', () => {
    const run = (prep: (s: GameState) => void, dice: number[]) => {
      const s = game()
      centreRow(s, STALK, 0, -6)
      centreRow(s, BRUTE, 0, 2)
      prep(s)
      const hp = wounds(s, BRUTE)
      const r = attack(s, 'ranged', dice, STALK, W('heartseeker-bow'), BRUTE, 1)
      return { lost: hp - wounds(s, BRUTE), left: r.rng.remaining, events: r.events }
    }
    // standing still: a 5 is a critical hit and auto-wounds (no wound die), the save die of 1 fails
    const still = run(() => undefined, [5, 1])
    expect(still.lost).toBe(1)
    expect(still.left).toEqual([])
    expect(of(still.events, 'HitRolled').some((h) => h.critical)).toBe(true)
    // after any Move ability the 5 is an ordinary hit that still has to wound
    for (const prep of [
      (s: GameState) => { s.units[STALK].turn.moveType = 'normal' },
      (s: GameState) => { s.units[STALK].turn.moveType = 'advance' },
      (s: GameState) => { s.units[STALK].turn.moveType = 'fallBack' },
      (s: GameState) => { s.units[STALK].turn.chargedThisTurn = true },
    ]) {
      const moved = run(prep, [5, 4, 1])
      expect(moved.lost).toBe(1)
      expect(moved.left).toEqual([])
      expect(of(moved.events, 'HitRolled').some((h) => h.critical)).toBe(false)
      expect(of(moved.events, 'WoundRolled')).toHaveLength(1)
    }
    // a natural 6 still crits after moving
    const six = run((s) => { s.units[STALK].turn.moveType = 'advance' }, [6, 1])
    expect(six.lost).toBe(1)
    expect(six.left).toEqual([])
    // a die of 4 is no critical hit either way
    const four = run(() => undefined, [4, 3, 1])
    expect(of(four.events, 'WoundRolled')).toHaveLength(1)
  })

  it('DOK-AB-4 Doomfire: casting 6+ deals D3 mortal damage to a visible enemy within 12"; it can be unbound; a double 1 miscasts on the Warlocks', () => {
    const base = (patch?: (b: DataBundle) => void): GameState => {
      const s = game({ patch })
      centreRow(s, LOCK, 0, -6)
      centreRow(s, BRUTE, 0, 4) // 10" away
      put(s, GUARD, 0, 9) // 15" away: out of range
      return s
    }
    const s = base()
    expect(targetsOf('daughtersDoomfire', s, LOCK, 'A')).toEqual([BRUTE])
    expect(offered(s, 'A', 'hero')).toContain(DOOMFIRE)
    const hp = wounds(s, BRUTE)
    const ctx = ctxFor(s, [3, 3, 3]) // 6 to cast; face 3 = 2 on a D3
    useOnce(ctx, 'hero', 'A', DOOMFIRE, { target: BRUTE })
    expect(wounds(s, BRUTE)).toBe(hp - 2)
    expect(leftOver(ctx)).toEqual([])
    // a casting roll of 5 fails
    const t = base()
    const c2 = ctxFor(t, [2, 3])
    useOnce(c2, 'hero', 'A', DOOMFIRE, { target: BRUTE })
    expect(wounds(t, BRUTE)).toBe(hp)
    expect(leftOver(c2)).toEqual([])
    // too far: not a target
    centreRow(t, BRUTE, 0, 9)
    expect(targetsOf('daughtersDoomfire', t, LOCK, 'A')).toEqual([])
    // an enemy Wizard within 30" unbinds it with a higher roll
    const u = base(WIZARD)
    centreRow(u, BOSS, 8, 8)
    const c3 = ctxFor(u, [3, 3, 6, 6])
    useOnce(c3, 'hero', 'A', DOOMFIRE, { target: BRUTE })
    expect(wounds(u, BRUTE)).toBe(hp)
    expect(summaries(c3).some((x) => x.includes('unbound'))).toBe(true)
    // a double 1 miscasts: D3 mortal damage to the Warlocks, and no more casting this phase
    const v = base()
    const lockHp = wounds(v, LOCK)
    const c4 = ctxFor(v, [1, 1, 4, 1, 1]) // the miscast D3 rolls face 4 = 2: two mortal damage, two failed ward dice
    useOnce(c4, 'hero', 'A', DOOMFIRE, { target: BRUTE })
    expect(wounds(v, BRUTE)).toBe(hp)
    expect(wounds(v, LOCK)).toBe(lockHp - 2)
    expect(canCast(v, LOCK)).toBe(false)
    expect(offered(v, 'A', 'hero')).not.toContain(DOOMFIRE)
  })

  it('DOK-AB-5 Frenzied Fervour: Witch Aelves melee Rend +1 only in a turn they charged', () => {
    const s = game()
    centreRow(s, WA1, 0, -3)
    centreRow(s, WA2, 6, -3)
    expect(weaponOf(s, WA1, W('paired-sciansa')).rend).toBe(0)
    s.units[WA1].turn.chargedThisTurn = true
    expect(weaponOf(s, WA1, W('paired-sciansa')).rend).toBe(1)
    expect(weaponOf(s, WA2, W('paired-sciansa')).rend).toBe(0) // the other unit did not charge
    // other units that charged get nothing from it
    centreRow(s, STALK, 0, -8)
    s.units[STALK].turn.chargedThisTurn = true
    expect(weaponOf(s, STALK, W('scianlar')).rend).toBe(0)
    s.units[WA1].turn.chargedThisTurn = false
    expect(weaponOf(s, WA1, W('paired-sciansa')).rend).toBe(0)
  })
})

describe('DOK-WEAP and DOK-MAG', () => {
  it('DOK-WEAP-1 Paired Sciansá: a critical hit (6) auto-wounds, so no wound die is rolled for it', () => {
    const s = aelvesVsBrute(1)
    const r = attack(s, 'melee', [6, 3, 1, 1], WA1, W('paired-sciansa'), BRUTE, 2)
    // the 6 auto-wounds; the 3 hits and has to wound (4+): one wound die, then one save die for the auto-wound
    expect(of(r.events, 'HitRolled').filter((h) => h.critical)).toHaveLength(1)
    expect(of(r.events, 'WoundRolled')).toHaveLength(1)
  })

  it('DOK-MAG-1 the Doomfire Warlocks cast at most once per hero phase and never unbind (castingLevel, no Wizard)', () => {
    const s = game({ patch: WIZARD })
    centreRow(s, LOCK, 0, -6)
    centreRow(s, BRUTE, 0, 4)
    centreRow(s, BOSS, 8, 8)
    expect(wizardLevel(s, LOCK)).toBe(0)
    expect(castingLevel(s, LOCK)).toBe(1)
    expect(s.datasheets[s.units[LOCK].datasheetId].keywords).not.toContain('WIZARD')
    expect(canCast(s, LOCK)).toBe(true)
    // one attempt (it fails: a 5) uses up the phase's cast
    useOnce(ctxFor(s, [2, 3]), 'hero', 'A', DOOMFIRE, { target: BRUTE })
    expect(canCast(s, LOCK)).toBe(false)
    expect(offered(s, 'A', 'hero')).not.toContain(DOOMFIRE)
    // a new phase starts with a fresh cast
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('magic:'))
    expect(canCast(s, LOCK)).toBe(true)
    // the enemy Boss casts a spell with the Warlocks 14" away: they are no unbinders, so only the casting dice are rolled
    s.activePlayer = 'B'
    expect(unbinders(s, BOSS)).not.toContain(LOCK)
    const ctx = ctxFor(s, [3, 3])
    const cast = castingRoll(ctx, { abilityId: 'test.spell', unitId: BOSS, player: 'B' }, BOSS, 6)
    expect(cast).toMatchObject({ cast: true, unbound: false })
    expect(leftOver(ctx)).toEqual([])
  })
})

describe('DOK-AI hints', () => {
  it('DOK-AI the bot saves Murderous Epiphany for round 2-3 with a fight in reach, keeps Blessing for a unit in combat and the Flask for two fighting units', () => {
    const s = game({ reg: EPI, round: 1 })
    put(s, ISC, 0, -5)
    centreRow(s, WA1, 0, -3)
    centreRow(s, BRUTE, 0, 4)
    expect(daughtersAbilityTiming(s, 'A', 'daughtersMurderousEpiphany', null)!).toBeLessThanOrEqual(-3)
    s.round = 2
    expect(daughtersAbilityTiming(s, 'A', 'daughtersMurderousEpiphany', null)!).toBeGreaterThan(-3)
    centreRow(s, BRUTE, 0, 30)
    centreRow(s, WA1, 0, -9)
    expect(daughtersAbilityTiming(s, 'A', 'daughtersMurderousEpiphany', null)!).toBeLessThanOrEqual(-3)
    s.round = 4
    expect(daughtersAbilityTiming(s, 'A', 'daughtersMurderousEpiphany', null)!).toBeLessThanOrEqual(-3)
    // Blessing and Flask need units in combat
    centreRow(s, WA1, 0, -3)
    centreRow(s, BRUTE, 0, 0)
    expect(daughtersAbilityTiming(s, 'A', 'daughtersBlessingOfKhaine', null)!).toBeGreaterThan(-3)
    expect(daughtersAbilityTiming(s, 'A', 'daughtersFlaskOfShademist', ISC)!).toBeGreaterThan(-3) // round 4, one unit in combat
    s.round = 2
    expect(daughtersAbilityTiming(s, 'A', 'daughtersFlaskOfShademist', ISC)!).toBeLessThanOrEqual(-3)
    // target bonuses: the unit in combat beats the one that is not; the weakest Doomfire target wins
    centreRow(s, STALK, 10, -9)
    expect(daughtersTargetBonus(s, 'A', 'daughtersBlessingOfKhaine', WA1)!).toBeGreaterThan(daughtersTargetBonus(s, 'A', 'daughtersBlessingOfKhaine', STALK)!)
    expect(daughtersTargetBonus(s, 'A', 'daughtersAllOutSlaughter', WA1)!).toBeGreaterThan(daughtersTargetBonus(s, 'A', 'daughtersAllOutSlaughter', STALK)!)
    put(s, GUARD, 6, 0)
    expect(daughtersTargetBonus(s, 'A', 'daughtersDoomfire', GUARD)!).toBeGreaterThan(daughtersTargetBonus(s, 'A', 'daughtersDoomfire', BRUTE)!)
    expect(daughtersAbilityTiming(s, 'A', 'daughtersDoomfire', LOCK)).toBeNull()
  })
})
