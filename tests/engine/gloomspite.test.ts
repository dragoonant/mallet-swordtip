// Gloomspite Gitz (Snarlpack Huntaz) code hooks and rules: docs/spec/factions/gloomspite-gitz.md, test ids GLO-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/gloomspite files on top of the AoS fixture bundle (player A =
// Snarlpack Huntaz, player B = the fixture Chaos army, or the fixture Order army when a test needs an enemy that shoots). Dice are
// scripted; nothing here patches the shipped data.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, removeModel, unitModels,
  type AbilityWindow, type Action, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService, drainAfterFightMortal, feelNoPainFor, pendingAfterFightMortal } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { weaponService } from '../../src/engine/weapons'
import { canDeclareCharge } from '../../src/engine/phases/charge'
import { movementModule, unitIgnoresRetreatDamage } from '../../src/engine/phases/movement'
import { targetLegality } from '../../src/engine/phases/shooting'
import { checkSlide } from '../../src/engine/factions/aos-moves'
import { careeningModes, careeningWorthIt } from '../../src/engine/factions/gloomspite'
import { enemiesInCombat, whollyWithinUnit } from '../../src/engine/factions/aos-common'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/gloomspite/abilities.json'
import enhancementsJson from '../../src/data/factions/gloomspite/enhancements.json'
import weaponsJson from '../../src/data/factions/gloomspite/weapons.json'
import factionJson from '../../src/data/factions/gloomspite/faction.json'
import patrolJson from '../../src/data/factions/gloomspite/patrols/snarlpack-huntaz.json'
import snarlbossJson from '../../src/data/factions/gloomspite/datasheets/snarlboss.json'
import wolfgitJson from '../../src/data/factions/gloomspite/datasheets/wolfgit-retinue.json'
import cavalryJson from '../../src/data/factions/gloomspite/datasheets/snarlpack-cavalry.json'
import wheelasJson from '../../src/data/factions/gloomspite/datasheets/sunsteala-wheelas.json'

// ---------- fixtures ----------
const bundle = (): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [snarlbossJson, wolfgitJson, cavalryJson, wheelasJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.gloomspite = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
})

const KUNNIN = 'gloomspite.enh.kunnin-as-a-snarlfang'
const GLARE = 'gloomspite.enh.glare-of-frazzlegit'
const SHARD = 'gloomspite.enh.sunsteala-shard'
const STAB = 'gloomspite.enh.devious-backstabba'
const FLANK = 'gloomspite.ability.flankin-force'
const BOOM = 'gloomspite.ability.frazzleboom'
const KUNNIN_AB = 'gloomspite.ability.kunnin-as-a-snarlfang'
const GLARE_AB = 'gloomspite.ability.glare-of-frazzlegit'
const SHARD_AB = 'gloomspite.ability.sunsteala-shard'
const STAB_AB = 'gloomspite.ability.devious-backstabba'
const HOWL = 'gloomspite.ability.great-snarlin-howl'
const CAREEN = 'gloomspite.ability.careening-destruction'

const BOSS = 'A:snarlboss'
const WOLF = 'A:wolfgits'
const CAV1 = 'A:cavalry-a'
const CAV2 = 'A:cavalry-b'
const WHEEL1 = 'A:wheela-a'
const WHEEL2 = 'A:wheela-b'

const LOPPA = 'gloomspite.weapon.boss-loppa'
const JAWS = 'gloomspite.weapon.snarlfang-jaws'
const BOW = 'gloomspite.weapon.grot-bow'
const STIKKA = 'gloomspite.weapon.stabbin-stikka'
const SKEWAS = 'gloomspite.weapon.pointy-skewas'
const GIANT = 'gloomspite.weapon.giant-snarlfang-jaws'
const SLICERS = 'gloomspite.weapon.wheela-slicers'
const PAIR = 'gloomspite.weapon.snarlfangs-jaws-pair'

const radiusOf = (s: GameState, id: UnitId): number => Math.max(...unitModels(s, id).map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))

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

// two units face to face, a little over 1" apart edge to edge (in combat), mine on the low-z side
function engage(s: GameState, mine: UnitId, theirs: UnitId, x = -5, z = 0): void {
  const d = (radiusOf(s, mine) + radiusOf(s, theirs) + 1.2) / 2
  place(s, mine, x, z - d)
  place(s, theirs, x, z + d)
}

// Player A starts with every unit in reserves (so only what a test places is on the table); B's bystanders go along the back edge
function game(opts: { enh?: string; reg?: string; enemy?: 'chaos' | 'order' } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'gloomspite', patrolId: 'gloomspite.army.snarlpack-huntaz', enhancementId: opts.enh ?? KUNNIN, regimentAbilityId: opts.reg ?? FLANK }),
      B: opts.enemy === 'order' ? makeAosPlayer('B', { faction: 'fx.order', patrolId: 'fx.order.army' }) : makeAosPlayer('B'),
    },
  }, bundle())
  let x = -14.5, row = 0
  for (const u of Object.values(s.units).filter((u) => u.player === 'B')) {
    const width = u.models.length * (2 * radiusOf(s, u.id) + 0.3)
    if (x + width > 14.5) { x = -14.5; row = 1 }
    place(s, u.id, x, 10.8 - 1.9 * row, 0.3)
    x += width + 0.3
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

type Pick = (topic: string, ids: string[], p: ChooseOptionDecision) => string

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: Pick): { topics: string[] } {
  const topics: string[] = []
  for (let i = 0; i < 30; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return { topics }
    const p = ctx.state.pending as ChooseOptionDecision
    topics.push(p.context.topic)
    const choice = pick(p.context.topic, p.options.map((o) => o.id), p)
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

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const weapon = (s: GameState, unitId: UnitId, weaponId: string) => weaponService.effectiveWeapon(s, s.units[unitId].models[0], weaponId)
const wardOf = (s: GameState, id: UnitId, modelIndex = 0): number | undefined => feelNoPainFor(ctxFor(s), s.units[id].models[modelIndex], {} as never)?.threshold
const woundsOf = (s: GameState, id: UnitId): number => unitModels(s, id).reduce((n, m) => n + m.woundsRemaining, 0)

// ---------- a melee attack with scripted dice ----------
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)
const tgt = (s: GameState, attackerUnitId: string, targetUnitId: string, attacks: number | null, weaponId?: string): DeclaredTarget => {
  const modelId = s.units[attackerUnitId].models[0]
  return { modelId, weaponId: weaponId ?? s.models[modelId].weapons[0], targetUnitId, profileGroup: null, attacks }
}

function melee(s: GameState, dice: number[], attackerUnitId: string, targets: DeclaredTarget[]) {
  s.phase = 'fight'
  const ctx = ctxFor(s, dice)
  attackService.begin(ctx, { kind: 'melee', attackerUnitId, overwatch: false, targets })
  expect(attackService.advance(ctx)).toBe('done')
  return { events: eventLogs.get(ctx) ?? [], ctx }
}

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('GLO-REG every code in the Gloomspite data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('GLO-ARMY-1 the Snarlpack Huntaz builds: Snarlboss general, Wolfgit Retinue (2), 2 Snarlpack Cavalry (3), 2 Sunsteala Wheelas (1), 11 models, stats as printed', () => {
    const s = game()
    for (const u of Object.values(s.units).filter((u) => u.player === 'A')) u.location = 'board'
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(6)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(11)
    expect(s.players.A.warlordUnitId).toBe(BOSS)
    expect(mine.filter((u) => u.datasheetId === 'gloomspite.unit.snarlpack-cavalry')).toHaveLength(2)
    expect(mine.filter((u) => u.datasheetId === 'gloomspite.unit.sunsteala-wheelas')).toHaveLength(2)
    expect([BOSS, WOLF, CAV1, CAV2, WHEEL1, WHEEL2].map((id) => s.units[id].models.length)).toEqual([1, 2, 3, 3, 1, 1])
    const st = (id: string) => s.datasheets[id].stats
    expect(st('gloomspite.unit.snarlboss')).toMatchObject({ M: 12, W: 5, Sv: 5, OC: 2 })
    expect(st('gloomspite.unit.wolfgit-retinue')).toMatchObject({ M: 12, W: 2, Sv: 5, OC: 1 })
    expect(st('gloomspite.unit.snarlpack-cavalry')).toMatchObject({ M: 12, W: 3, Sv: 4, OC: 1 })
    expect(st('gloomspite.unit.sunsteala-wheelas')).toMatchObject({ M: 12, W: 6, Sv: 4, OC: 2 })
    for (const id of Object.keys(s.datasheets).filter((d) => d.startsWith('gloomspite.'))) expect(st(id).ward, id).toBeFalsy()
    const kw = (id: string) => s.datasheets[`gloomspite.unit.${id}`].keywords
    expect(kw('snarlboss')).toEqual(['HERO', 'CAVALRY'])
    expect(kw('wolfgit-retinue')).toEqual(['CAVALRY'])
    expect(kw('snarlpack-cavalry')).toEqual(['CAVALRY'])
    expect(kw('sunsteala-wheelas')).toEqual(['WAR MACHINE'])
    const prof = (id: string) => { const w = s.weapons[id]; return [w.kind, w.range, w.A, w.skill, w.wound, w.rend, w.D] }
    expect(prof(LOPPA)).toEqual(['melee', 0, 5, 4, 4, 1, 2])
    expect(prof(JAWS)).toEqual(['melee', 0, 2, 4, 3, 0, 2])
    expect(prof(BOW)).toEqual(['ranged', 15, 2, 4, 5, 0, 1])
    expect(prof(STIKKA)).toEqual(['melee', 0, 2, 4, 5, 0, 1])
    expect(prof(SKEWAS)).toEqual(['melee', 0, 4, 4, 5, 0, 1])
    expect(prof(GIANT)).toEqual(['melee', 0, 3, 4, 3, 0, 2])
    expect(prof(SLICERS)).toEqual(['melee', 0, 4, 4, 4, 0, 1])
    expect(prof(PAIR)).toEqual(['melee', 0, 4, 4, 3, 0, 2])
    for (const id of [JAWS, GIANT, PAIR]) expect(weaponService.hasAbility(s.weapons[id], 'COMPANION'), id).toBe(true)
    expect(weaponService.hasAbility(s.weapons[SKEWAS], 'CHARGE_DAMAGE')).toBe(true)
    // oval bases: (long axis x short axis) in mm
    const base = (id: UnitId) => { const m = s.models[s.units[id].models[0]]; return [Math.max(m.base.radius, m.base.radius2 ?? 0) * 2 * 25.4, Math.min(m.base.radius, m.base.radius2 ?? m.base.radius) * 2 * 25.4].map(Math.round) }
    expect(base(BOSS)).toEqual([75, 42])
    expect(base(WOLF)).toEqual([60, 35])
    expect(base(CAV1)).toEqual([75, 42])
    expect(base(WHEEL1)).toEqual([120, 92])
  })

  it('GLO-ARMY-2 no unit has Reinforcements, so Call for Reinforcements is never offered', () => {
    const s = game()
    for (const u of Object.values(s.units).filter((u) => u.player === 'A')) expect(s.datasheets[u.datasheetId].keywords).not.toContain('REINFORCEMENTS')
    place(s, BOSS, -4, -4)
    s.units[WHEEL2].location = 'destroyed'
    s.phase = 'movement'
    expect(replaceableUnits(s, 'A')).toEqual([])
    expect(offered(s, 'A', 'movement').filter((id) => id.toLowerCase().includes('reinforcement'))).toEqual([])
  })

  it('GLO-ARMY-3 Wolfgit Retinue: one model has the Grot Bow + Jaws, the other the Stabbin\' Stikka + Jaws', () => {
    const s = game()
    const [a, b] = s.units[WOLF].models.map((id) => s.models[id])
    expect(a.weapons).toEqual([BOW, JAWS])
    expect(b.weapons).toEqual([STIKKA, JAWS])
    // the Wheela carries all three of its weapons on its one model
    expect(s.models[s.units[WHEEL1].models[0]].weapons).toEqual([BOW, SLICERS, PAIR])
  })
})

describe('GLO-BT Fast as Frazzlegit', () => {
  it('GLO-BT-1 a unit that Retreated this turn may still declare a charge (a unit that Ran may not)', () => {
    const s = game()
    place(s, CAV1, -6, -2)
    place(s, 'B:brute', -6, 5)
    s.phase = 'charge'
    expect(canDeclareCharge(s, CAV1)).toBe(true)
    s.units[CAV1].turn.moveType = 'fallBack'
    expect(canDeclareCharge(s, CAV1)).toBe(true)
    s.units[CAV1].turn.moveType = 'advance'
    expect(canDeclareCharge(s, CAV1)).toBe(false)
    // every Gitz unit has it; the enemy does not
    for (const id of [BOSS, WOLF, CAV2, WHEEL1]) expect(hookService.eligibilityFor!(s, id, 'charge') || hookService.unitHasEffectFlag!(s, id, 'chargeAfterFallBack'), id).toBe(true)
    place(s, 'B:guard', -6, 0.5)
    s.units['B:guard'].turn.moveType = 'fallBack'
    expect(canDeclareCharge(s, 'B:guard')).toBe(false)
  })

  it('GLO-BT-2 Retreat inflicts no mortal damage on Gitz units, while the enemy still takes it', () => {
    const s = game()
    // the Cavalry is in combat with a Brute; B's retreat would cost D3
    engage(s, CAV1, 'B:brute', -6, 0)
    for (const id of [BOSS, WOLF, CAV1, CAV2, WHEEL1, WHEEL2]) expect(unitIgnoresRetreatDamage(s, id), id).toBe(true)
    expect(unitIgnoresRetreatDamage(s, 'B:brute')).toBe(false)
    s.phase = 'movement'
    const before = woundsOf(s, CAV1)
    const ctx = ctxFor(s, [5]) // the Retreat roll: a 3, which would have cost 3 wounds
    movementModule.enter(ctx)
    const respond = (action: Action) => { const p = s.pending!; s.pending = null; const r = movementModule.handle(ctx, action, p); if (r) throw new Error(r.reason); return movementModule.advance(ctx) }
    movementModule.advance(ctx)
    respond({ type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: CAV1 })
    respond({ type: 'declareMove', player: 'A', decisionId: '', unitId: CAV1, moveType: 'fallBack' })
    expect(s.pending?.kind).toBe('moveUnit')
    expect(eventLogs.get(ctx)!.some((e) => e.type === 'UnitFellBack')).toBe(true)
    expect(woundsOf(s, CAV1)).toBe(before)
    expect(leftOver(ctx)).toEqual([])
  })
})

describe('GLO-RA regiment abilities', () => {
  it('GLO-RA-1 Flankin\' Force: start of round 1 only, once per battle, up to 2 units re-set anywhere more than 6" from every enemy', () => {
    const s = game({ reg: FLANK })
    place(s, CAV1, -12, -3)
    place(s, CAV2, 6, -3)
    place(s, WOLF, -6, -8)
    expect(offered(s, 'A', 'startOfRound')).toContain(FLANK)
    // the AI's first picks are the Snarlpack Cavalry, not the small Wolfgits
    const order = (codeHooks.fyreslayersMagmicTunnels.activate!.targets as unknown as (st: GameState, u: UnitId | null, p: PlayerId) => UnitId[])(s, null, 'A')
    expect(order.slice(0, 2)).toEqual([CAV1, CAV2])
    const before = [CAV1, CAV2].map((id) => unitModels(s, id).map((m) => ({ ...m.pos })))
    const ctx = ctxFor(s)
    const r = useOnce(ctx, 'startOfRound', 'A', FLANK, { target: CAV1, mode: CAV2 })
    expect(r.topics.filter((t) => t === 'abilityTarget')).toHaveLength(1)
    expect(r.topics.filter((t) => t === 'abilityMode')).toHaveLength(3) // the second unit, then one spot per unit
    const enemies = Object.values(s.models).filter((m) => s.units[m.unitId].player === 'B' && s.units[m.unitId].location === 'board')
    for (const [i, id] of [CAV1, CAV2].entries()) {
      expect(unitModels(s, id).map((m) => m.pos), id).not.toEqual(before[i])
      for (const m of unitModels(s, id)) for (const e of enemies) expect(horizontalGap(m, e), id).toBeGreaterThan(6)
    }
    expect(eventLogs.get(ctx)!.some((e) => e.type === 'AbilityTriggered' && e.summary.startsWith("Flankin' Force"))).toBe(true)
    expect(offered(s, 'A', 'startOfRound')).not.toContain(FLANK)
    s.round = 2
    expect(offered(s, 'A', 'startOfRound')).not.toContain(FLANK)
    const t = game({ reg: FLANK })
    place(t, CAV1, -12, -3)
    t.round = 2
    expect(offered(t, 'A', 'startOfRound')).not.toContain(FLANK)
  })

  // a Wheela standing next to two enemy units
  function boomGame() {
    const s = game({ reg: BOOM })
    place(s, WHEEL1, -3, -2)
    place(s, CAV1, -12, -6)
    return s
  }
  const slay = (ctx: EngineContext, unitId: UnitId, by = 'B:brute') =>
    attackService.destroyModel(ctx, ctx.state.units[unitId].models[0], { player: 'B', unitId: by, modelId: ctx.state.units[by].models[0], kind: 'melee' })

  it('GLO-RA-2 Frazzleboom fires only when a War Machine is destroyed (not on a Cavalry unit\'s death)', () => {
    const s = boomGame()
    place(s, 'B:brute', -6, -2.5) // beside the Cavalry
    place(s, 'B:guard', -3, -2 + radiusOf(s, WHEEL1) + 1.5) // beside the Wheela
    const ctx = ctxFor(s, []) // any roll would throw
    slay(ctx, CAV1)
    expect(eventLogs.get(ctx)!.filter((e) => e.type === 'AbilityTriggered')).toEqual([])
    expect(leftOver(ctx)).toEqual([])
    // the same Wheela dying with the other regiment ability chosen does nothing either
    const t = game({ reg: FLANK })
    place(t, WHEEL1, -3, -2)
    place(t, 'B:guard', -3, -2 + radiusOf(t, WHEEL1) + 1.5)
    const ctx2 = ctxFor(t, [])
    slay(ctx2, WHEEL1)
    expect(leftOver(ctx2)).toEqual([])
    // with Frazzleboom, the Wheela's death rolls the D3
    const ctx3 = ctxFor(s, [1])
    slay(ctx3, WHEEL1)
    expect(leftOver(ctx3)).toEqual([])
    expect(eventLogs.get(ctx3)!.filter((e) => e.type === 'AbilityTriggered')).toHaveLength(1)
  })

  it('GLO-RA-3 Frazzleboom: a D3 of 1 does nothing; 2 or 3 is that much mortal damage to the enemy unit within 3" with the fewest wounds left', () => {
    const run = (die: number) => {
      const s = boomGame()
      place(s, 'B:hawk', 3, -2) // 4 wounds, within 3"
      place(s, 'B:brute', -3, -2 + radiusOf(s, WHEEL1) + 1.2) // 9 wounds, within 3"
      expect(enemiesInCombat(s, WHEEL1).sort()).toEqual(['B:brute', 'B:hawk'])
      const hawk = woundsOf(s, 'B:hawk'), brute = woundsOf(s, 'B:brute')
      const ctx = ctxFor(s, [die])
      slay(ctx, WHEEL1)
      expect(leftOver(ctx)).toEqual([])
      return { hawk: hawk - woundsOf(s, 'B:hawk'), brute: brute - woundsOf(s, 'B:brute') }
    }
    expect(run(1)).toEqual({ hawk: 0, brute: 0 }) // D3 = 1
    expect(run(2)).toEqual({ hawk: 0, brute: 0 }) // face 2 is still a 1
    expect(run(3)).toEqual({ hawk: 2, brute: 0 }) // D3 = 2
    expect(run(6)).toEqual({ hawk: 3, brute: 0 }) // D3 = 3
  })

  it('GLO-RA-4 Frazzleboom with no enemy within 3" does nothing; a Wheela slain mid-combat-sequence deals its damage after the sequence', () => {
    const s = boomGame()
    place(s, 'B:brute', -3, -2 + radiusOf(s, WHEEL1) + 6) // well beyond 3"
    const ctx = ctxFor(s, [])
    slay(ctx, WHEEL1)
    expect(leftOver(ctx)).toEqual([])
    expect(eventLogs.get(ctx)!.filter((e) => e.type === 'AbilityTriggered').map((e) => (e as { summary: string }).summary).join()).toContain('no enemy unit within 3"')
    // mid-sequence: a Brute with a good swing finishes a 1-wound Wheela; the D3 is rolled when it falls, the damage waits
    const t = boomGame()
    engage(t, WHEEL1, 'B:brute', -3, -2)
    t.models[t.units[WHEEL1].models[0]].woundsRemaining = 1
    const before = woundsOf(t, 'B:brute')
    // hit 4+, wound 3+, save fails, then the Frazzleboom D3 (a 3)
    const { ctx: c2 } = melee(t, [4, 3, 1, 5], 'B:brute', [tgt(t, 'B:brute', WHEEL1, 1)])
    expect(t.units[WHEEL1].location).toBe('destroyed')
    expect(pendingAfterFightMortal(t)).toMatchObject([{ targetUnitId: 'B:brute', count: 3, source: BOOM }])
    expect(woundsOf(t, 'B:brute')).toBe(before)
    drainAfterFightMortal(c2)
    expect(woundsOf(t, 'B:brute')).toBe(before - 3)
    expect(pendingAfterFightMortal(t)).toEqual([])
  })
})

describe('GLO-ENH enhancements', () => {
  // the Snarlboss fights a Brute; a Cavalry unit stands wholly within 12", the other only partly, a Wolfgit pair far off
  function kunninGame() {
    const s = game({ enh: KUNNIN })
    engage(s, BOSS, 'B:brute', -8, 0)
    place(s, CAV1, -10, -6.5)
    place(s, CAV2, 3, -6.5)
    place(s, WOLF, 9, -9)
    return s
  }

  it('GLO-ENH-1 Kunnin\' as a Snarlfang: once per battle in a combat phase; +1 melee Rend only for units wholly within 12" (bearer included), not Companion weapons, until end of turn', () => {
    const s = kunninGame()
    expect(whollyWithinUnit(s, CAV1, BOSS, 12)).toBe(true)
    expect(whollyWithinUnit(s, CAV2, BOSS, 12)).toBe(false)
    expect(horizontalGap(s.models[s.units[CAV2].models[0]], s.models[s.units[BOSS].models[0]])).toBeLessThan(12) // only partly within
    expect(offered(s, 'A', 'fight')).toContain(KUNNIN_AB)
    const ctx = ctxFor(s)
    useOnce(ctx, 'fight', 'A', KUNNIN_AB)
    expect(weapon(s, BOSS, LOPPA).rend).toBe(2)
    expect(weapon(s, CAV1, SKEWAS).rend).toBe(1)
    expect(weapon(s, CAV2, SKEWAS).rend).toBe(0) // partly within: nothing
    expect(weapon(s, WOLF, STIKKA).rend).toBe(0)
    // Companion jaws are left alone, the Boss's own included
    expect(weapon(s, BOSS, JAWS).rend).toBe(0)
    expect(weapon(s, CAV1, GIANT).rend).toBe(0)
    // the aura is read live: a unit stepping inside gets it, stepping out loses it
    place(s, CAV2, -10, -6.5)
    expect(weapon(s, CAV2, SKEWAS).rend).toBe(1)
    place(s, CAV2, 3, -6.5)
    expect(weapon(s, CAV2, SKEWAS).rend).toBe(0)
    // once per battle, and gone at the end of the turn
    expect(offered(s, 'A', 'fight')).not.toContain(KUNNIN_AB)
    effectService.expire(ctx, 'turnEnd', null)
    expect(weapon(s, BOSS, LOPPA).rend).toBe(1)
    expect(weapon(s, CAV1, SKEWAS).rend).toBe(0)
    s.round = 3
    expect(offered(s, 'A', 'fight')).not.toContain(KUNNIN_AB)
  })

  it('GLO-ENH-1 also works in the enemy combat phase, and is not offered when nobody in the aura is in combat', () => {
    const s = kunninGame()
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'fight')).toContain(KUNNIN_AB)
    useOnce(ctxFor(s), 'fight', 'A', KUNNIN_AB)
    expect(weapon(s, CAV1, SKEWAS).rend).toBe(1)
    const idle = game({ enh: KUNNIN })
    place(idle, BOSS, -4, -6)
    place(idle, CAV1, 2, -6)
    expect(offered(idle, 'A', 'fight')).not.toContain(KUNNIN_AB)
  })

  // the Snarlboss fights a Brute and a Boss; a far unit is not in combat with the general
  function glareGame() {
    const s = game({ enh: GLARE })
    engage(s, BOSS, 'B:brute', -8, 0)
    place(s, 'B:boss', 6, 5)
    return s
  }

  // the sum of hit-roll modifiers the hooks give an attack by `attackerUnitId` against `targetUnitId` with `weaponId`
  function hitModifier(s: GameState, attackerUnitId: UnitId, targetUnitId: UnitId, weaponId: string): number {
    const ctx = ctxFor(s, [3])
    const attackerModelId = s.units[attackerUnitId].models[0]
    const attack = {
      kind: 'melee' as const, overwatch: false, attackerUnitId, attackerModelId, weapon: s.weapons[weaponId], targetUnitId, targetModelId: s.units[targetUnitId].models[0],
      range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true,
    }
    const roll = ctx.roll({ purpose: 'hit', player: s.units[attackerUnitId].player, unitId: attackerUnitId })
    return hookService.collect(ctx, 'onHitRoll', { attack, roll: { purpose: 'hit', roll, dieIndex: 0, unmodified: roll.dice[0], rerolled: false } })
      .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
  }

  it('GLO-ENH-2 Glare of Frazzlegit: only an enemy in combat with the general; -1 to hit for its attacks until end of turn; once per battle', () => {
    const s = glareGame()
    expect(enemiesInCombat(s, BOSS)).toEqual(['B:brute'])
    expect(offered(s, 'A', 'fight')).toContain(GLARE_AB)
    // the only legal target is the Brute (so the pick is automatic)
    expect(codeHooks.gloomspiteGlare.activate!.targets!(s, BOSS)).toEqual(['B:brute'])
    const ctx = ctxFor(s)
    const r = useOnce(ctx, 'fight', 'A', GLARE_AB)
    expect(r.topics).not.toContain('abilityTarget')
    expect(hitModifier(s, 'B:brute', BOSS, 'fx.w.brute-axe')).toBe(-1)
    expect(hitModifier(s, 'B:hawk', BOSS, 'fx.w.hawk-talons')).toBe(0)
    // the roll modifier caps at -1 whatever else stacks (CORE-2.5); the Gitz are not affected
    expect(hitModifier(s, CAV1, 'B:brute', SKEWAS)).toBe(0)
    expect(offered(s, 'A', 'fight')).not.toContain(GLARE_AB)
    effectService.expire(ctx, 'turnEnd', null)
    expect(hitModifier(s, 'B:brute', BOSS, 'fx.w.brute-axe')).toBe(0)
    s.round = 2
    expect(offered(s, 'A', 'fight')).not.toContain(GLARE_AB)
    // not offered while no enemy is in combat with the general (units in combat with other Gitz do not count)
    const t = game({ enh: GLARE })
    place(t, BOSS, -4, -8)
    engage(t, CAV1, 'B:brute', 5, 0)
    expect(offered(t, 'A', 'fight')).not.toContain(GLARE_AB)
  })

  it('GLO-ENH-2 an enemy\'s -1 to hit also reaches Companion weapons of the unit it is on', () => {
    const s = glareGame()
    useOnce(ctxFor(s), 'fight', 'A', GLARE_AB)
    // the brute's attacks suffer it whatever the weapon; a Companion weapon of an affected unit is a negative, so it applies too
    expect(hitModifier(s, 'B:brute', BOSS, 'fx.w.knight-hooves')).toBe(-1)
  })

  // a Wolfgit pair wholly inside the 6" bubble, Cavalry outside it; the enemy brings a cannon and a pistol Knight
  function shardGame() {
    const s = game({ enh: SHARD, enemy: 'order' })
    place(s, BOSS, -3, -5)
    place(s, WOLF, -2, -9)
    place(s, CAV1, 2, -5)
    place(s, 'B:cannon', -12, 6)
    s.phase = 'shooting'
    s.activePlayer = 'B'
    return s
  }
  const shootable = (s: GameState, firing: UnitId, target: UnitId, weaponId = 'fx.w.cannon-shot'): string | null =>
    targetLegality(s, firing, s.units[firing].models[0], s.weapons[weaponId], target)?.code ?? null

  it('GLO-ENH-3 Sunsteala Shard: in the enemy shooting phase, units wholly within 6" cannot be shot except by a unit in combat with them; expires at end of turn; once per battle', () => {
    const s = shardGame()
    expect(whollyWithinUnit(s, WOLF, BOSS, 6)).toBe(true)
    expect(whollyWithinUnit(s, CAV1, BOSS, 6)).toBe(false)
    expect(offered(s, 'A', 'shooting')).toContain(SHARD_AB)
    expect(shootable(s, 'B:cannon', WOLF)).toBeNull()
    const ctx = ctxFor(s)
    useOnce(ctx, 'shooting', 'A', SHARD_AB)
    expect(shootable(s, 'B:cannon', BOSS)).toBe('E_INVALID_TARGET')
    expect(shootable(s, 'B:cannon', WOLF)).toBe('E_INVALID_TARGET')
    expect(targetLegality(s, 'B:cannon', s.units['B:cannon'].models[0], s.weapons['fx.w.cannon-shot'], WOLF)?.reason).toContain('Sunsteala Shard')
    expect(shootable(s, 'B:cannon', CAV1)).toBeNull() // outside the bubble
    // live aura: step out and the Wolfgits can be shot, step back and they cannot
    place(s, WOLF, 6, -9)
    expect(shootable(s, 'B:cannon', WOLF)).toBeNull()
    place(s, WOLF, -2, -9)
    expect(shootable(s, 'B:cannon', WOLF)).toBe('E_INVALID_TARGET')
    // an attacker in combat with the unit may still shoot it (a pistol Knight right beside the Wolfgits)
    engage(s, WOLF, 'B:knight', -8, -9)
    expect(enemiesInCombat(s, WOLF)).toEqual(['B:knight'])
    expect(shootable(s, 'B:knight', WOLF, 'fx.w.knight-pistol')).toBeNull()
    // once per battle; gone at the end of the turn
    expect(offered(s, 'A', 'shooting')).not.toContain(SHARD_AB)
    effectService.expire(ctx, 'turnEnd', null)
    place(s, WOLF, -2, -9)
    expect(shootable(s, 'B:cannon', WOLF)).toBeNull()
  })

  it('GLO-ENH-3 is only offered in the enemy shooting phase, and only while the enemy has something that shoots', () => {
    const s = shardGame()
    s.activePlayer = 'A'
    expect(offered(s, 'A', 'shooting')).not.toContain(SHARD_AB)
    s.activePlayer = 'B'
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).not.toContain(SHARD_AB)
    const chaos = game({ enh: SHARD })
    place(chaos, BOSS, -3, -5)
    chaos.phase = 'shooting'
    chaos.activePlayer = 'B'
    expect(offered(chaos, 'A', 'shooting')).not.toContain(SHARD_AB) // the Chaos fixture army has no ranged weapons
  })

  it('GLO-ENH-4 Devious Backstabba: end of any turn, an enemy Hero in combat with the bearer; D3 of 2+ deals that much mortal damage; usable every turn', () => {
    const s = game({ enh: STAB })
    engage(s, BOSS, 'B:boss', -8, 0)
    place(s, 'B:brute', -3, 0.2) // a non-Hero beside them is not a legal pick
    expect(enemiesInCombat(s, BOSS).sort()).toEqual(['B:boss', 'B:brute'])
    expect(codeHooks.gloomspiteBackstabba.activate!.targets!(s, BOSS)).toEqual(['B:boss'])
    expect(offered(s, 'A', 'endOfTurn')).toContain(STAB_AB)
    const boss = s.units['B:boss'].models[0]
    // a 1 on the D3 fails
    let ctx = ctxFor(s, [1])
    useOnce(ctx, 'endOfTurn', 'A', STAB_AB)
    expect(s.models[boss].woundsRemaining).toBe(8)
    expect(leftOver(ctx)).toEqual([])
    // next turn (the enemy's), a 2 deals 2
    s.activePlayer = 'B'
    s.units[BOSS].turn.abilitiesUsedThisPhase = []
    expect(offered(s, 'A', 'endOfTurn')).toContain(STAB_AB)
    ctx = ctxFor(s, [3])
    useOnce(ctx, 'endOfTurn', 'A', STAB_AB)
    expect(s.models[boss].woundsRemaining).toBe(6)
    // and a 3 deals 3, the turn after
    s.activePlayer = 'A'
    s.round = 2
    s.units[BOSS].turn.abilitiesUsedThisPhase = []
    ctx = ctxFor(s, [6])
    useOnce(ctx, 'endOfTurn', 'A', STAB_AB)
    expect(s.models[boss].woundsRemaining).toBe(3)
    // no Hero in combat with the bearer: not offered
    const t = game({ enh: STAB })
    engage(t, BOSS, 'B:brute', -8, 0)
    expect(offered(t, 'A', 'endOfTurn')).not.toContain(STAB_AB)
  })
})

describe('GLO-AB unit abilities', () => {
  // the Snarlboss with a Cavalry unit on one side and the Wolfgits on the other, all within 3"
  function howlGame() {
    const s = game()
    place(s, BOSS, -2, 0)
    place(s, CAV1, 2, 0)
    place(s, WOLF, -9, 0)
    place(s, CAV2, 6, -8)
    return s
  }

  it('GLO-AB-1 Great Snarlin\' Howl: on 3+, the Snarlboss and one friendly unit within 3" get +1 Attacks and +1 Rend on Companion melee weapons only, until end of turn', () => {
    const s = howlGame()
    expect(codeHooks.gloomspiteSnarlinHowl.activate!.targets!(s, BOSS).sort()).toEqual([CAV1, WOLF])
    expect(offered(s, 'A', 'hero')).toContain(HOWL)
    const ctx = ctxFor(s, [3])
    const r = useOnce(ctx, 'hero', 'A', HOWL, { target: CAV1 })
    expect(r.topics).toContain('abilityTarget')
    expect(leftOver(ctx)).toEqual([])
    expect(weapon(s, BOSS, JAWS)).toMatchObject({ A: 3, rend: 1 })
    expect(weapon(s, CAV1, GIANT)).toMatchObject({ A: 4, rend: 1 })
    // ordinary weapons of both are untouched, and nobody else is buffed (the other candidate, another Cavalry, a Wolfgit)
    expect(weapon(s, BOSS, LOPPA)).toMatchObject({ A: 5, rend: 1 })
    expect(weapon(s, CAV1, SKEWAS)).toMatchObject({ A: 4, rend: 0 })
    expect(weapon(s, WOLF, JAWS)).toMatchObject({ A: 2, rend: 0 })
    expect(weapon(s, CAV2, GIANT)).toMatchObject({ A: 3, rend: 0 })
    effectService.expire(ctx, 'turnEnd', null)
    expect(weapon(s, BOSS, JAWS)).toMatchObject({ A: 2, rend: 0 })
    expect(weapon(s, CAV1, GIANT)).toMatchObject({ A: 3, rend: 0 })
  })

  it('GLO-AB-1 a roll of 1 or 2 does nothing, but the ability is still used up', () => {
    const s = howlGame()
    const ctx = ctxFor(s, [2])
    useOnce(ctx, 'hero', 'A', HOWL, { target: CAV1 })
    expect(weapon(s, BOSS, JAWS)).toMatchObject({ A: 2, rend: 0 })
    expect(weapon(s, CAV1, GIANT)).toMatchObject({ A: 3, rend: 0 })
    expect(offered(s, 'A', 'hero')).not.toContain(HOWL)
  })

  it('GLO-AB-2 Great Snarlin\' Howl: once per turn for the army; not offered without another friendly unit within 3"', () => {
    const s = howlGame()
    useOnce(ctxFor(s, [4]), 'hero', 'A', HOWL, { target: WOLF })
    expect(offered(s, 'A', 'hero')).not.toContain(HOWL)
    s.round = 2
    s.units[BOSS].turn.abilitiesUsedThisPhase = [] // the turn state resets at the start of a turn
    expect(offered(s, 'A', 'hero')).toContain(HOWL)
    // only your own hero phase
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'hero')).not.toContain(HOWL)
    // nobody within 3": a unit at 4" does not count
    const t = game()
    place(t, BOSS, -2, 0)
    place(t, CAV1, 5, 0)
    place(t, 'B:brute', 5, 7)
    expect(offered(t, 'A', 'hero')).not.toContain(HOWL)
    place(t, CAV1, 2, 0)
    expect(offered(t, 'A', 'hero')).toContain(HOWL)
  })

  it('GLO-AB-3 I Got Dis, Boss: Wolfgits and Snarlboss have Ward (5+) only while within 3" of each other (closest models, not wholly)', () => {
    const s = game()
    place(s, BOSS, -2, 0)
    place(s, WOLF, -12, 0)
    expect(wardOf(s, BOSS)).toBeUndefined()
    expect(wardOf(s, WOLF)).toBeUndefined()
    // close: both Wolfgit models and the Boss have it
    place(s, WOLF, -7.5, 0)
    expect(horizontalGap(s.models[s.units[WOLF].models[1]], s.models[s.units[BOSS].models[0]])).toBeLessThan(3)
    expect(wardOf(s, BOSS)).toBe(5)
    expect(wardOf(s, WOLF, 0)).toBe(5)
    expect(wardOf(s, WOLF, 1)).toBe(5)
    // only the nearest Wolfgit within 3" (the other one further off) still counts: the check is closest models, not wholly
    place(s, WOLF, -12.12, 0, 3.4)
    expect(horizontalGap(s.models[s.units[WOLF].models[0]], s.models[s.units[BOSS].models[0]])).toBeGreaterThan(3)
    expect(horizontalGap(s.models[s.units[WOLF].models[1]], s.models[s.units[BOSS].models[0]])).toBeLessThan(3)
    expect(wardOf(s, BOSS)).toBe(5)
    expect(wardOf(s, WOLF, 0)).toBe(5)
    expect(wardOf(s, WOLF, 1)).toBe(5)
    // somebody else near the Boss gets nothing, and the Boss alone has none
    place(s, WOLF, -12, 0)
    place(s, CAV1, 2, 0)
    expect(wardOf(s, CAV1)).toBeUndefined()
    expect(wardOf(s, BOSS)).toBeUndefined()
    // a dead Boss gives nothing
    place(s, WOLF, -7.5, 0)
    expect(wardOf(s, WOLF)).toBe(5)
    s.units[BOSS].location = 'destroyed'
    expect(wardOf(s, WOLF)).toBeUndefined()
  })

  it('GLO-AB-4 Frazzleburned Scrap: Snarlpack Cavalry have Strike-first only on a turn they charged', () => {
    const s = game()
    const strikeFirst = (id: UnitId) => hookService.eligibilityFor!(s, id, 'fightFirst')
    expect(strikeFirst(CAV1)).toBe(false)
    s.units[CAV1].turn.chargedThisTurn = true
    expect(strikeFirst(CAV1)).toBe(true)
    expect(strikeFirst(CAV2)).toBe(false)
    for (const id of [BOSS, WOLF, WHEEL1]) { s.units[id].turn.chargedThisTurn = true; expect(strikeFirst(id), id).toBe(false) }
  })
})

describe('GLO-AB Careening Destruction', () => {
  // The Wheela starts in combat with a lone Brute directly in its way (so a 12" move crosses it); `enemy` swaps the Brute for another unit
  function careenGame(enemy = 'B:brute') {
    const s = game()
    for (const id of ['B:brute', 'B:guard', 'B:hawk', 'B:boss']) if (id !== enemy) s.units[id].location = 'reserves'
    while (s.units[enemy].models.length > 1) removeModel(s, s.units[enemy].models[s.units[enemy].models.length - 1])
    place(s, enemy as UnitId, 0, 0)
    const m0 = s.models[s.units[enemy].models[0]]
    m0.pos = { x: 0, y: 0, z: 0 }
    const w = s.models[s.units[WHEEL1].models[0]]
    s.units[WHEEL1].location = 'board'
    w.pos = { x: -(m0.base.radius + radiusOf(s, WHEEL1) + 1.2), y: 0, z: 0 }
    s.phase = 'movement'
    return s
  }

  // drives the movement module: pick the Wheela, declare a move, then answer the ability decisions with `pick`
  function drive(s: GameState, dice: number[], moveType: 'normal' | 'fallBack', pick: (topic: string, ids: string[]) => string) {
    const ctx = ctxFor(s, dice)
    movementModule.enter(ctx)
    const answer = (action: Action) => {
      const p = s.pending!
      s.pending = null
      const rej = p.kind === 'chooseOption' ? abilityService.handler.handle(ctx, action, p) : movementModule.handle(ctx, action, p)
      if (rej) throw new Error(`rejected: ${rej.reason}`)
      return movementModule.advance(ctx)
    }
    const topics: string[] = []
    movementModule.advance(ctx)
    answer({ type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: WHEEL1 })
    answer({ type: 'declareMove', player: 'A', decisionId: '', unitId: WHEEL1, moveType })
    for (let i = 0; i < 12 && s.pending?.kind === 'chooseOption'; i++) {
      const p = s.pending as ChooseOptionDecision
      topics.push(p.context.topic)
      answer({ type: 'chooseOption', player: 'A', decisionId: p.id, optionId: pick(p.context.topic, p.options.map((o) => o.id)) })
    }
    return { ctx, topics }
  }
  const useCareening = (topic: string, ids: string[]): string => (topic === 'abilityUse' ? ids.find((id) => id.startsWith(CAREEN)) ?? 'pass' : ids[0])

  it('GLO-AB-5 Careening Destruction: moves up to 12" through models and enemy combat ranges, may start in combat, may not end in combat', () => {
    const s = careenGame()
    expect(enemiesInCombat(s, WHEEL1)).toEqual(['B:brute']) // starts in combat
    const modes = careeningModes(s, WHEEL1)
    expect(modes.length).toBeGreaterThan(2)
    for (const m of modes) {
      const [id] = m.id.split('|')
      const [, dx, dz] = id.split(':')
      expect(Math.hypot(Number(dx), Number(dz))).toBeLessThanOrEqual(12 + 1e-6)
      const check = checkSlide(s, WHEEL1, Number(dx), Number(dz), 12, false, { passThrough: true, mustEndOutOfCombat: true })
      expect(check.ok, m.label).toBe(true)
      expect(check.endsInCombat, m.label).toBe(false)
    }
    // a short hop that stays in combat is refused
    expect(checkSlide(s, WHEEL1, -0.5, 0, 12, false, { passThrough: true, mustEndOutOfCombat: true }).ok).toBe(false)
    // at least one heading carries the Wheela clean across the Brute
    expect(modes.some((m) => m.hit === 'B:brute')).toBe(true)
    // in the movement phase it is offered when the unit declares its move (here a Retreat, the only move it has), not at other times
    expect(offered(s, 'A', 'moveDeclared')).toEqual([])
    const x0 = s.models[s.units[WHEEL1].models[0]].pos.x
    const { topics } = drive(s, [5], 'fallBack', useCareening)
    expect(topics).toEqual(['abilityUse', 'abilityMode'])
    expect(s.models[s.units[WHEEL1].models[0]].pos.x).toBeGreaterThan(x0 + 10) // crossed the Brute
    expect(enemiesInCombat(s, WHEEL1)).toEqual([])
  })

  it('GLO-AB-6 Careening Destruction: D3 mortal damage to one enemy Infantry unit passed across; a non-Infantry unit passed across is not a legal pick', () => {
    const s = careenGame()
    const brute = woundsOf(s, 'B:brute')
    const { ctx } = drive(s, [3], 'fallBack', useCareening) // the D3: a 2
    expect(woundsOf(s, 'B:brute')).toBe(brute - 2)
    expect(leftOver(ctx)).toEqual([])
    expect(eventLogs.get(ctx)!.some((e) => e.type === 'AbilityTriggered' && e.summary.includes('run down for 2 mortal damage'))).toBe(true)
    // the Hawk is not Infantry: heading straight across it is allowed but never a pick
    const t = careenGame('B:hawk')
    const modes = careeningModes(t, WHEEL1)
    expect(modes.length).toBeGreaterThan(0)
    expect(modes.every((m) => m.hit === null && !m.id.includes('|'))).toBe(true)
    const hawk = woundsOf(t, 'B:hawk')
    const x0 = t.models[t.units[WHEEL1].models[0]].pos.x
    const { ctx: c2 } = drive(t, [], 'fallBack', useCareening)
    expect(t.models[t.units[WHEEL1].models[0]].pos.x).not.toBe(x0)
    expect(woundsOf(t, 'B:hawk')).toBe(hawk)
    expect(leftOver(c2)).toEqual([])
    // AI helper: heading across an Infantry unit is worth using even with nothing else going on
    expect(careeningWorthIt(careenGame(), WHEEL1)).toBe(true)
  })

  it('GLO-AB-7 Careening Destruction counts as the unit\'s move: no Normal Move/Run/Retreat after it, no Retreat roll, and the unit may still shoot and charge', () => {
    const s = careenGame()
    const { ctx } = drive(s, [3], 'fallBack', useCareening)
    expect(leftOver(ctx)).toEqual([]) // the Retreat roll was never made: only the Careening D3 was rolled
    expect(eventLogs.get(ctx)!.some((e) => e.type === 'UnitFellBack')).toBe(false)
    const u = s.units[WHEEL1]
    expect(u.turn.moveType).toBe('normal')
    expect(s.phaseState.activated).toContain(WHEEL1)
    // the phase carries on without offering the Wheela a move: nothing else is on the table, so it is over
    expect(s.pending).toBeNull()
    expect(movementModule.advance(ctx)).toBe('done')
    expect(eventLogs.get(ctx)!.filter((e) => e.type === 'UnitMoved')).toHaveLength(2) // the slide, then the zero-length move that closes the unit
    // not a Run or Retreat: it may charge (the Brute is within reach again after crossing) and its Grot Bow is not blocked
    s.phase = 'charge'
    expect(canDeclareCharge(s, WHEEL1)).toBe(true)
    expect(u.turn.moveType === 'normal').toBe(true)
    // a unit that has not declared a move this phase is not offered it
    const t = careenGame()
    expect(offered(t, 'A', 'moveDeclared')).toEqual([])
  })

  it('GLO-AI-1 the AI helpers: modes with a victim sort first, and an open-field Wheela with nobody to run down is not "worth" the rigid slide', () => {
    const s = careenGame()
    const modes = careeningModes(s, WHEEL1)
    expect(modes[0].hit).toBe('B:brute')
    const lastHit = Math.max(...modes.map((m, i) => (m.hit !== null ? i : -1)))
    expect(modes.findIndex((m) => m.hit === null)).toBeGreaterThan(lastHit)
    const open = game()
    place(open, WHEEL1, -6, -4)
    place(open, 'B:brute', 8, 8)
    expect(careeningWorthIt(open, WHEEL1)).toBe(false)
  })
})

describe('GLO-WEAP weapons', () => {
  it('GLO-WEAP-1 Pointy Skewas get +1 Damage on a turn the Snarlpack Cavalry charged', () => {
    const wounds = (charged: boolean): number => {
      const s = game()
      engage(s, CAV1, 'B:brute', -5, 0)
      s.units[CAV1].turn.chargedThisTurn = charged
      const before = woundsOf(s, 'B:brute')
      // hit 4+, wound 5+, the Brute's save (3+) fails on a 1
      melee(s, [4, 5, 1], CAV1, [tgt(s, CAV1, 'B:brute', 1, SKEWAS)])
      return before - woundsOf(s, 'B:brute')
    }
    expect(wounds(false)).toBe(1)
    expect(wounds(true)).toBe(2)
  })

  it('GLO-WEAP-2 Companion jaws ignore friendly positive buffs other than Great Snarlin\' Howl (e.g. Kunnin\' Rend, +1 to hit) but take enemy negatives', () => {
    const s = game({ enh: KUNNIN })
    engage(s, CAV1, 'B:brute', -8, 0)
    place(s, BOSS, -12, -6)
    // Kunnin' Rend: the Skewas get it, the Giant Snarlfang's Jaws do not
    useOnce(ctxFor(s), 'fight', 'A', KUNNIN_AB)
    expect(weapon(s, CAV1, SKEWAS).rend).toBe(1)
    expect(weapon(s, CAV1, GIANT).rend).toBe(0)
    // Howl is the exception
    const ctx = ctxFor(s, [4])
    place(s, BOSS, -12, -2.2)
    s.phase = 'command'
    useOnce(ctx, 'hero', 'A', HOWL, { target: CAV1 })
    expect(weapon(s, CAV1, GIANT)).toMatchObject({ A: 4, rend: 1 })
    // a friendly +1 to hit helps the Skewas (hit 4+, die 3) but not the jaws; an enemy -1 hurts both
    const t = game()
    engage(t, CAV1, 'B:brute', -8, 0)
    t.units[CAV1].effects.push({ id: 'e1', sourceAbilityId: 'x', sourceUnitId: CAV1, effect: { modifyRoll: { roll: 'hit', value: 1 } }, scope: { who: 'self' }, expires: { kind: 'battle', round: 1, player: null }, when: null })
    const hits = of(melee(t, [3, 1, 3, 1], CAV1, [tgt(t, CAV1, 'B:brute', 1, SKEWAS), tgt(t, CAV1, 'B:brute', 1, GIANT)]).events, 'HitRolled')
    expect(hits.map((h) => h.hit)).toEqual([true, false])
    const u = game()
    engage(u, CAV1, 'B:brute', -8, 0)
    u.units[CAV1].effects.push({ id: 'e2', sourceAbilityId: 'x', sourceUnitId: 'B:brute', effect: { modifyRoll: { roll: 'hit', value: -1 } }, scope: { who: 'self' }, expires: { kind: 'battle', round: 1, player: null }, when: null })
    const down = of(melee(u, [5, 1, 4, 1], CAV1, [tgt(u, CAV1, 'B:brute', 1, SKEWAS), tgt(u, CAV1, 'B:brute', 1, GIANT)]).events, 'HitRolled')
    expect(down.map((h) => h.final)).toEqual([4, 3])
    expect(down.map((h) => h.hit)).toEqual([true, false])
  })
})
