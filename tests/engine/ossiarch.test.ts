// Ossiarch Bonereapers (Mortisan Elite) code hooks: docs/spec/factions/ossiarch-bonereapers.md, test ids OBR-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/ossiarch files on top of the AoS fixture bundle
// (player A = Mortisan Elite, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, createGame, legalActions, removeModel, step, unitModels, view,
  type AbilityWindow, type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameState, type PendingDecision, type PlayerId, type UnitId,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { makeSimSetup } from '../../tools/sim-core'
import { DATA_VERSION, loadBundle } from '../../src/data'
import { attackService, feelNoPainFor } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { writeDeclaredMove } from '../../src/engine/declared'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { missionService } from '../../src/engine/missions'
import { canCast, castingRoll, wizardLevel } from '../../src/engine/magic'
import { chargeRollModifier } from '../../src/engine/phases/charge'
import { movementModule } from '../../src/engine/phases/movement'
import { weaponService } from '../../src/engine/weapons'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { disciplineBonus, ossiarchAbilityTiming, ossiarchModeBonus, ossiarchTargetBonus } from '../../src/engine/factions/ossiarch'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import type { ModelPlacement } from '../../src/engine/actions'
import type { ChargeState } from '../../src/engine/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/ossiarch/abilities.json'
import enhancementsJson from '../../src/data/factions/ossiarch/enhancements.json'
import weaponsJson from '../../src/data/factions/ossiarch/weapons.json'
import factionJson from '../../src/data/factions/ossiarch/faction.json'
import patrolJson from '../../src/data/factions/ossiarch/patrols/mortisan-elite.json'
import ossifectorJson from '../../src/data/factions/ossiarch/datasheets/mortisan-ossifector.json'
import guardJson from '../../src/data/factions/ossiarch/datasheets/immortis-guard.json'
import stalkersJson from '../../src/data/factions/ossiarch/datasheets/necropolis-stalkers.json'
import morghastJson from '../../src/data/factions/ossiarch/datasheets/morghast-archai.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [ossifectorJson, guardJson, stalkersJson, morghastJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.ossiarch = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const ARMY = 'ossiarch.army.mortisan-elite'
const HERALDS_BT = 'ossiarch.ability.heralds-of-nagash'
const DESCENT = 'ossiarch.ability.dread-descent'
const RD_MOVE = 'ossiarch.ability.relentless-discipline'
const RD_CHARGE = 'ossiarch.ability.relentless-discipline-charge'
const RD_COMBAT = 'ossiarch.ability.relentless-discipline-combat'
const PEERLESS = 'ossiarch.ability.peerless-cohesion'
const IMMACULATE = 'ossiarch.ability.immaculate-generalship'
const REFINED = 'ossiarch.ability.refined-creations'
const ASPECTS = 'ossiarch.ability.switch-aspects'
const MORGHAST_AB = 'ossiarch.ability.morghast-heralds'
const LODE = 'ossiarch.enh.lode-of-saturation'
const SHARD = 'ossiarch.enh.shard-storm'
const MEND = 'ossiarch.enh.mend-constructs'
const HELM = 'ossiarch.enh.helm-of-tyranny'
const SHARD_AB = 'ossiarch.ability.shard-storm'
const MEND_AB = 'ossiarch.ability.mend-constructs'
const HELM_AB = 'ossiarch.ability.helm-of-tyranny'

const GEN = 'A:mortisan-ossifector'
const IMM = 'A:immortis-guard'
const STK = 'A:necropolis-stalkers'
const MOR = 'A:morghast-archai'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'
const HAWK = 'B:hawk'

const W = (id: string) => `ossiarch.weapon.${id}`

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

const unitGap = (s: GameState, a: UnitId, b: UnitId): number =>
  Math.min(...unitModels(s, a).flatMap((m) => unitModels(s, b).map((o) => horizontalGap(m, o))))

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'ossiarch', patrolId: ARMY, enhancementId: opts.enh ?? LODE, regimentAbilityId: opts.reg ?? IMMACULATE }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  // bystanders go along the back edges, two rows each, clear of the middle where the tests work (the reserve unit stays in reserve)
  for (const p of ['A', 'B'] as const) {
    const sign = p === 'A' ? -1 : 1
    let x = -14.5, row = 0
    for (const u of Object.values(s.units).filter((u) => u.player === p && !u.reserveArrival)) {
      const width = u.models.length * (2 * Math.max(...unitModels(s, u.id).map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0))) + 0.3)
      if (x + width > 14.5) { x = -14.5; row = 1 }
      place(s, u.id, x, sign * (12.8 - 1.9 * row), 0.3)
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

interface Step { id: string; target?: string; mode?: string }

// the ability loop of a window, answered through abilities.ts as the reducer routes it. `plan` is the list of uses in order:
// each abilityUse offer picks the next step's ability (prefix match on the option id, which is `<abilityId>#<unitId>`) or passes
function runPlan(ctx: EngineContext, window: AbilityWindow, player: PlayerId, plan: Step[], key?: string): { uses: string[][]; targets: string[][] } {
  const uses: string[][] = []
  const targets: string[][] = []
  let i = 0
  let cur: Step | null = null
  for (let n = 0; n < 40; n++) {
    if (!abilityService.runWindow(ctx, window, player, key)) return { uses, targets }
    const p = ctx.state.pending as ChooseOptionDecision
    const ids = p.options.map((o) => o.id)
    let choice = 'pass'
    if (p.context.topic === 'abilityUse') {
      uses.push(ids)
      const next = plan[i]
      const hit = next ? ids.find((id) => id.startsWith(next.id + '#')) : undefined
      if (hit) { cur = next; i++; choice = hit }
    } else if (p.context.topic === 'abilityTarget') {
      targets.push(ids)
      choice = cur?.target ?? ids[0]
    } else {
      choice = cur?.mode ?? ids[0]
    }
    ctx.state.pending = null
    const action = choice === 'pass' ? { type: 'pass' as const, player, decisionId: p.id } : { type: 'chooseOption' as const, player, decisionId: p.id, optionId: choice }
    const rej = abilityService.handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}
const useOnce = (ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string; key?: string } = {}) =>
  runPlan(ctx, window, player, [{ id: abilityId, target: opts.target, mode: opts.mode }], opts.key)

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const slay = (s: GameState, unitId: UnitId, n: number): void => { for (const id of [...s.units[unitId].models].slice(-n)) removeModel(s, id) }
const wardOf = (s: GameState, id: UnitId): number | null | undefined => feelNoPainFor(ctxFor(s, []), s.units[id].models[0], {} as never)?.threshold
const hasEffect = (s: GameState, unitId: UnitId, abilityId: string): boolean => s.units[unitId].effects.some((e) => e.sourceAbilityId === abilityId)
const declare = (s: GameState, unitId: UnitId, moveType: 'normal' | 'advance' | 'fallBack'): void => {
  s.phase = 'movement'
  s.activePlayer = 'A'
  writeDeclaredMove(s, { unitId, moveType })
}
const meleeOf = (s: GameState, unitId: UnitId, weaponId: string, target: UnitId) => {
  const m = unitModels(s, unitId).find((x) => x.weapons.includes(weaponId))!
  const t = unitModels(s, target)[0]
  return weaponService.effectiveWeapon(s, m.id, weaponId, {
    kind: weaponId.includes('talons') && s.weapons[weaponId].kind === 'ranged' ? 'ranged' : 'melee', overwatch: false, attackerUnitId: unitId, attackerModelId: m.id, weapon: s.weapons[weaponId],
    targetUnitId: target, targetModelId: t.id, range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true,
  } as never)
}

// ---------- attacks with scripted dice ----------
function attack(s: GameState, kind: 'ranged' | 'melee', dice: number[], attackerUnitId: UnitId, weaponId: string, targetUnitId: UnitId, attacks: number | null) {
  s.phase = kind === 'ranged' ? 'shooting' : 'fight'
  const modelId = s.units[attackerUnitId].models.find((id) => s.models[id].weapons.includes(weaponId))!
  const target = { modelId, weaponId, targetUnitId, profileGroup: null, attacks }
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets: [target] })
  expect(attackService.advance(ctx)).toBe('done')
  return { events, rng, ctx }
}

// a 2D6 charge roll, and the modifier the charge-roll hooks add to it
function chargeMod(s: GameState, unitId: UnitId, dice: [number, number] = [3, 3]): number {
  const ctx = ctxFor(s, dice)
  const roll = ctx.roll({ purpose: 'charge', player: s.units[unitId].player, sides: 6, count: 2, mode: 'sum', unitId })
  const charge: ChargeState = { unitId, targetUnitIds: [], roll: dice, rerolled: false, distance: null, heroic: false }
  return chargeRollModifier(ctx, charge, roll)
}

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('OBR-REG every code in the Ossiarch data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('OBR-ARMY-1 the Mortisan Elite builds in the engine: Ossifector general, 4 units, 9 models, stats and weapons as printed', () => {
    const s = game({ enh: SHARD, reg: PEERLESS })
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.startingStrength, 0)).toBe(9)
    expect(s.players.A.warlordUnitId).toBe(GEN)
    expect(s.players.A.battleTraitIds).toEqual([HERALDS_BT, RD_MOVE, RD_CHARGE, RD_COMBAT])
    expect(s.players.A.regimentAbilityId).toBe(PEERLESS)
    expect(s.units[GEN].enhancementId).toBe(SHARD)
    const st = (id: string) => s.datasheets[`ossiarch.unit.${id}`].stats
    expect(st('mortisan-ossifector')).toMatchObject({ M: 5, W: 5, Sv: 4, OC: 2, ward: 6 })
    expect(st('immortis-guard')).toMatchObject({ M: 5, W: 4, Sv: 3, OC: 1, ward: 6 })
    expect(st('necropolis-stalkers')).toMatchObject({ M: 6, W: 4, Sv: 4, OC: 1, ward: 6 })
    expect(st('morghast-archai')).toMatchObject({ M: 10, W: 6, Sv: 3, OC: 2, ward: 6 })
    expect(unitModels(s, GEN)[0].weapons).toEqual([W('ossified-talons')])
    expect(unitModels(s, IMM)[0].weapons).toEqual([W('dread-halberd')])
    expect(unitModels(s, STK)[0].weapons).toEqual([W('stalker-blades')])
    expect(s.units[MOR].models.map((id) => s.models[id].weapons)).toEqual([[W('spirit-weapons')], [W('spirit-weapons')]])
    expect(s.units[MOR].location).toBe('reserves')
    expect(wizardLevel(s, GEN)).toBe(1)
  })

  it('OBR-ARMY-2 every unit has Ward (6+) that reaches the dice; only the Morghast have Fly; nothing can be called back by Call for Reinforcements', () => {
    const s = game()
    for (const id of [GEN, IMM, STK, MOR]) {
      expect(s.datasheets[s.units[id].datasheetId].stats.ward, id).toBe(6)
      expect(s.datasheets[s.units[id].datasheetId].keywords, id).not.toContain('REINFORCEMENTS')
    }
    centreRow(s, GEN, 0, -6)
    centreRow(s, STK, -12, -6)
    for (const id of [GEN, STK]) expect(wardOf(s, id), id).toBe(6)
    expect(Object.values(s.units).filter((u) => u.player === 'A' && s.datasheets[u.datasheetId].keywords.includes('FLY')).map((u) => u.id)).toEqual([MOR])
    for (const u of Object.values(s.units).filter((x) => x.player === 'A')) u.location = 'destroyed'
    expect(replaceableUnits(s, 'A')).toEqual([])
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement').filter((id) => id.includes('einforce'))).toEqual([])
  })
})

describe('OBR-BT battle traits', () => {
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

  it('OBR-BT-1 Heralds of Nagash / Dread Descent: the Morghast start in reserve; they arrive from round 2 (not round 1) in your movement phase, anywhere more than 6" from every enemy, and are destroyed if still in reserve at round 4', () => {
    const s = game()
    expect(s.units[MOR].location).toBe('reserves')
    expect(s.units[MOR].reserveArrival).toBe(DESCENT)
    for (const id of [GEN, IMM, STK]) expect(s.units[id].location, id).toBe('board')
    s.phase = 'movement'
    centreRow(s, BOSS, 0, 0)
    // round 1: no arrival
    expect(toArrival(ctxFor(s, []))).toBeNull()
    expect(s.units[MOR].location).toBe('reserves')
    // round 2 but the enemy's own movement phase: nothing for us
    const e = game()
    e.phase = 'movement'; e.round = 2; e.activePlayer = 'B'
    centreRow(e, BOSS, 0, 0)
    movementModule.enter(ctxFor(e, []))
    expect((e.pending as PendingDecision | null)?.kind === 'deployUnit' && e.pending?.player === 'A').toBe(false)
    // round 2: a deployUnit decision; within 6" of the Boss is refused, a far spot is fine
    const t = game()
    t.phase = 'movement'; t.round = 2
    centreRow(t, BOSS, 0, 0)
    const ctx = ctxFor(t, [])
    const p = toArrival(ctx) as PendingDecision & { context: { unitIds: UnitId[] } }
    expect(p.kind).toBe('deployUnit')
    expect(p.context.unitIds).toEqual([MOR])
    const models = t.units[MOR].models
    const at = (x: number, z: number): Action => ({
      type: 'deployUnit', player: 'A', decisionId: p.id, unitId: MOR,
      placements: models.map((id, i) => ({ modelId: id, pos: { x: x + i * 2.8, y: 0, z }, facing: 0 })),
    } as Action)
    expect(movementModule.validate?.(t, at(4, 0), p)?.code).toBe('E_ENGAGEMENT')
    expect(movementModule.validate?.(t, at(-13.5, 3), p)).toBeNull() // on the enemy's half of the table: anywhere
    t.pending = null
    expect(movementModule.handle(ctx, at(-13.5, 3), p)).toBeUndefined()
    expect(t.units[MOR].location).toBe('board')
    expect(t.units[MOR].setUpTurn).toEqual({ round: 2, player: 'A' }) // CORE-6.13: no Move abilities this phase
    for (const m of unitModels(t, MOR)) for (const x of unitModels(t, BOSS)) expect(horizontalGap(m, x)).toBeGreaterThan(6)
    // a unit still in reserve at the start of round 4 is destroyed
    const u = game()
    u.round = 4
    missionService.onWindow(ctxFor(u, []), 'round.start', '4')
    expect(u.units[MOR].location).toBe('destroyed')
    expect(u.units[GEN].location).toBe('board')
  })

  // a Relentless Discipline in the movement phase for `target` (declared a Normal Move) with the roll `die`
  const moveRun = (target: UnitId, die: number, reg: string, place?: (s: GameState) => void) => {
    const s = game({ reg })
    centreRow(s, GEN, 0, -6)
    centreRow(s, IMM, 0, -9) // wholly within 12" of the general
    centreRow(s, STK, -17, -9) // well beyond 12"
    place?.(s)
    declare(s, target, 'normal')
    const ctx = ctxFor(s, [die])
    const r = useOnce(ctx, 'moveDeclared', 'A', RD_MOVE)
    return { s, ctx, r, worked: hasEffect(s, target, RD_MOVE), used: s.phaseState.marks.filter((m) => m.startsWith('obr:rd:A:')) }
  }

  it('OBR-BT-2 Relentless Discipline: D6, +1 wholly within 12" of the general; 4+ applies the effect, a 3 does nothing but the use is spent; once per phase for the army', () => {
    // wholly within 12": 3 + 1 = 4 works, 2 + 1 = 3 does not
    expect(moveRun(IMM, 3, PEERLESS).worked).toBe(true)
    const miss = moveRun(IMM, 2, PEERLESS)
    expect(miss.worked).toBe(false)
    expect(miss.used).toEqual([`obr:rd:A:${IMM}`])
    expect(summaries(miss.ctx).some((t) => t.includes('is not driven on'))).toBe(true)
    // beyond 12": no bonus, a 3 fails and a 4 works
    expect(moveRun(STK, 3, PEERLESS).worked).toBe(false)
    expect(moveRun(STK, 4, PEERLESS).worked).toBe(true)
    // the general itself counts as within 12" of itself
    expect(moveRun(GEN, 3, PEERLESS).worked).toBe(true)
    // once per phase for the army: with Immaculate Generalship (no second use) the next unit's move offers nothing
    const a = moveRun(IMM, 4, IMMACULATE)
    expect(a.worked).toBe(true)
    declare(a.s, STK, 'normal')
    expect(offered(a.s, 'A', 'moveDeclared')).not.toContain(RD_MOVE)
    // a new phase starts fresh
    a.s.phaseState.marks = []
    declare(a.s, STK, 'normal')
    expect(offered(a.s, 'A', 'moveDeclared')).toContain(RD_MOVE)
    // it is offered in the movement phase only for the unit that declared a move (never stationary, never outside the window)
    declare(a.s, STK, 'normal')
    writeDeclaredMove(a.s, { unitId: STK, moveType: 'normal' })
    expect(offered(a.s, 'A', 'movement')).not.toContain(RD_MOVE)
    expect(offered(a.s, 'B', 'moveDeclared')).not.toContain(RD_MOVE)
  })

  it('OBR-BT-3 movement effect: +2" Move for that unit for the rest of the phase, the Run allowance included', () => {
    const { s, ctx, worked } = moveRun(GEN, 4, IMMACULATE)
    expect(worked).toBe(true)
    const model = unitModels(s, GEN)[0]
    expect(hookService.statFor(s, { unitId: GEN, modelId: model.id, weapon: null, stat: 'M' }, 5)).toBe(7)
    expect(hookService.statFor(s, { unitId: IMM, modelId: unitModels(s, IMM)[0].id, weapon: null, stat: 'M' }, 5)).toBe(5) // nobody else
    // a Run of 3 adds to the Move: 5 + 2 + 3 = 10" is a legal move, 10.5" is not; without the effect only 8"
    const trial = (state: GameState, to: number): string | null => {
      state.units[GEN].turn.moveType = null
      state.phaseState.marks = []
      state.phaseState.activated = []
      state.pending = null
      state.step = 'select'
      const c = ctxFor(state, [])
      movementModule.enter(c)
      movementModule.advance(c)
      state.pending = null
      movementModule.handle(c, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: GEN }, { kind: 'chooseUnitToActivate' } as never)
      movementModule.advance(c)
      state.pending = null
      movementModule.handle(c, { type: 'declareMove', player: 'A', decisionId: '', unitId: GEN, moveType: 'advance' }, { kind: 'declareMove' } as never)
      state.phaseState.marks.push('mv:declWin:' + GEN)
      state.units[GEN].turn.advanceRoll = 3
      movementModule.advance(c)
      const placements: ModelPlacement[] = [{ modelId: state.units[GEN].models[0], pos: { x: to, y: 0, z: -6 }, facing: 0 }]
      const rej = movementModule.validate?.(state, { type: 'moveUnit', player: 'A', decisionId: '', unitId: GEN, placements } as Action, state.pending as never)
      return rej ? rej.code : null
    }
    expect(trial(s, 9.8)).toBeNull()
    expect(trial(s, 10.6)).not.toBeNull()
    const plain = game()
    centreRow(plain, GEN, 0, -6)
    plain.phase = 'movement'
    expect(trial(plain, 7.8)).toBeNull()
    expect(trial(plain, 9.8)).not.toBeNull()
    // the effect ends with the phase
    effectService.expire(ctx, 'phaseEnd', null)
    expect(hasEffect(s, GEN, RD_MOVE)).toBe(false)
  })

  it('OBR-BT-4 charge effect: +1 to that unit\'s charge roll for the phase, offered at the start of your charge phase', () => {
    const s = game()
    s.phase = 'charge'
    centreRow(s, GEN, 0, -6)
    centreRow(s, IMM, 0, -9)
    expect(chargeMod(s, IMM)).toBe(0)
    expect(offered(s, 'A', 'chargeStart')).toContain(RD_CHARGE)
    expect(offered(s, 'A', 'charge')).not.toContain(RD_CHARGE) // only the start-of-phase window
    expect(offered(s, 'B', 'chargeStart')).not.toContain(RD_CHARGE) // your charge phase
    const ctx = ctxFor(s, [3])
    const r = useOnce(ctx, 'chargeStart', 'A', RD_CHARGE, { target: IMM })
    expect(r.targets[0]).toContain(IMM) // any friendly unit on the battlefield
    expect(r.targets[0]).not.toContain(MOR) // still in reserve
    expect(hasEffect(s, IMM, RD_CHARGE)).toBe(true)
    expect(chargeMod(s, IMM)).toBe(1)
    expect(chargeMod(s, STK)).toBe(0)
    expect(chargeMod(s, BRUTE)).toBe(0)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(chargeMod(s, IMM)).toBe(0)
  })

  // the stalkers (hit 3+, wound 3+, rend 2) swing 2 attacks at the Brute (3 wounds, save 3+): wound rolls of 2 only count with +1
  const stalkerSwing = (s: GameState): number => {
    centreRow(s, STK, 0, -4)
    centreRow(s, BRUTE, 0, -1.2)
    const before = wounds(s, BRUTE)
    const a = attack(s, 'melee', [3, 3, 2, 2, 1, 1], STK, W('stalker-blades'), BRUTE, 2)
    expect(a.rng.remaining.length === 0 || a.rng.remaining.length === 2).toBe(true)
    return before - wounds(s, BRUTE)
  }

  it('OBR-BT-5 combat effect (wound): +1 to the wound rolls of its melee attacks for the phase, in either player\'s combat phase', () => {
    const s = game()
    s.phase = 'fight'
    centreRow(s, GEN, 0, -8)
    centreRow(s, STK, 0, -4)
    expect(offered(s, 'A', 'fight')).toContain(RD_COMBAT)
    const theirs = game()
    theirs.phase = 'fight'; theirs.activePlayer = 'B'
    expect(offered(theirs, 'A', 'fight')).toContain(RD_COMBAT) // timing 'any': the opponent's combat phase offers it to us
    const none = game()
    none.phase = 'fight'
    expect(stalkerSwing(none)).toBe(0) // wound rolls of 2 fail
    const ctx = ctxFor(s, [4])
    const r = useOnce(ctx, 'fight', 'A', RD_COMBAT, { target: STK, mode: 'wound', key: 'fight:active' })
    expect(hasEffect(s, STK, RD_COMBAT)).toBe(true)
    expect(summaries(ctx).some((t) => t.includes('wound rolls'))).toBe(true)
    expect(r.uses[0].some((id) => id.startsWith(RD_COMBAT))).toBe(true)
    expect(stalkerSwing(s)).toBe(2) // the same 2s now wound
    // the opponent's combat phase: the effect works the same
    const e = game()
    e.phase = 'fight'
    e.activePlayer = 'B'
    centreRow(e, GEN, 0, -8)
    const c2 = ctxFor(e, [5])
    useOnce(c2, 'fight', 'A', RD_COMBAT, { target: STK, mode: 'wound', key: 'fight:enemy' })
    expect(hasEffect(e, STK, RD_COMBAT)).toBe(true)
    expect(stalkerSwing(e)).toBe(2)
    // melee only: it does not touch ranged attacks (checked on the effect itself)
    const eff = s.units[STK].effects.find((x) => x.sourceAbilityId === RD_COMBAT)!.effect
    expect(eff).toEqual({ when: { weaponType: 'melee' }, modifyRoll: { roll: 'wound', value: 1 } })
  })

  it('OBR-BT-6 combat effect (ward): Ward (5+) for the phase, replacing the printed 6+ (the best ward only, nothing stacks)', () => {
    const s = game()
    s.phase = 'fight'
    centreRow(s, GEN, 0, -6)
    centreRow(s, IMM, 8, -6)
    centreRow(s, STK, -12, -6)
    expect(wardOf(s, STK)).toBe(6)
    const ctx = ctxFor(s, [4])
    useOnce(ctx, 'fight', 'A', RD_COMBAT, { target: STK, mode: 'ward', key: 'fight:active' })
    expect(wardOf(s, STK)).toBe(5)
    expect(wardOf(s, IMM)).toBe(6)
    expect(wardOf(s, GEN)).toBe(6)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(wardOf(s, STK)).toBe(6)
    // the general beside the Guard already has 5+ (Soulbound Protectors): the effect on top of it is still 5+, not better
    const t = game()
    t.phase = 'fight'
    centreRow(t, GEN, 0, -6)
    centreRow(t, IMM, 0, -9)
    expect(wardOf(t, GEN)).toBe(5)
    useOnce(ctxFor(t, [4]), 'fight', 'A', RD_COMBAT, { target: GEN, mode: 'ward', key: 'fight:active' })
    expect(hasEffect(t, GEN, RD_COMBAT)).toBe(true)
    expect(wardOf(t, GEN)).toBe(5)
  })
})

describe('OBR-RA regiment abilities', () => {
  it('OBR-RA-1 Peerless Cohesion: a second Relentless Discipline in the same phase on a different unit, once per turn; the first target cannot be picked again', () => {
    const s = game({ reg: PEERLESS })
    s.phase = 'charge'
    centreRow(s, GEN, 0, -6)
    centreRow(s, IMM, 0, -9)
    centreRow(s, STK, -6, -9)
    const ctx = ctxFor(s, [4, 4, 4])
    const r = runPlan(ctx, 'chargeStart', 'A', [{ id: RD_CHARGE, target: IMM }, { id: RD_CHARGE, target: STK }, { id: RD_CHARGE, target: GEN }])
    // the first offer, the second offer (Peerless Cohesion) and no third
    expect(r.uses).toHaveLength(2)
    expect(r.uses[0].some((id) => id.startsWith(RD_CHARGE))).toBe(true)
    expect(r.uses[1].some((id) => id.startsWith(RD_CHARGE))).toBe(true)
    expect(offered(s, 'A', 'chargeStart')).not.toContain(RD_CHARGE) // no third use
    expect(r.targets[1]).not.toContain(IMM) // a different unit
    expect(r.targets[1]).toContain(STK)
    expect(hasEffect(s, IMM, RD_CHARGE)).toBe(true)
    expect(hasEffect(s, STK, RD_CHARGE)).toBe(true)
    expect(hasEffect(s, GEN, RD_CHARGE)).toBe(false)
    expect(s.players.A.abilityUses.filter((u) => u.abilityId === PEERLESS)).toHaveLength(1)
    // the same turn's later phases: Peerless Cohesion is spent, so only one use per phase
    s.phaseState.marks = []
    s.phase = 'fight'
    expect(offered(s, 'A', 'fight')).toContain(RD_COMBAT)
    const c2 = ctxFor(s, [4])
    const r2 = runPlan(c2, 'fight', 'A', [{ id: RD_COMBAT, target: IMM, mode: 'ward' }], 'fight:active')
    expect(r2.uses[1].some((id) => id.startsWith(RD_COMBAT))).toBe(false)
    expect(hasEffect(s, IMM, RD_COMBAT)).toBe(true)
    // the opponent's turn is a new turn: Peerless Cohesion is available again (two uses in their combat phase)
    const t = game({ reg: PEERLESS })
    t.phase = 'fight'
    t.activePlayer = 'B'
    centreRow(t, GEN, 0, -6)
    t.players.A.abilityUses.push({ abilityId: PEERLESS, unitId: null, round: 1, turn: 'A', phase: 'charge' })
    const c3 = ctxFor(t, [4, 4])
    const r3 = runPlan(c3, 'fight', 'A', [{ id: RD_COMBAT, target: IMM, mode: 'ward' }, { id: RD_COMBAT, target: STK, mode: 'ward' }], 'fight:enemy')
    expect(r3.uses.length).toBeGreaterThanOrEqual(2)
    expect(hasEffect(t, IMM, RD_COMBAT) && hasEffect(t, STK, RD_COMBAT)).toBe(true)
    expect(offered(t, 'A', 'fight')).not.toContain(RD_COMBAT)
    // Immaculate Generalship does not give a second use
    const u = game({ reg: IMMACULATE })
    u.phase = 'charge'
    const r4 = runPlan(ctxFor(u, [6, 6]), 'chargeStart', 'A', [{ id: RD_CHARGE, target: IMM }, { id: RD_CHARGE, target: STK }])
    expect(r4.uses[1]?.some((id) => id.startsWith(RD_CHARGE)) ?? false).toBe(false)
    expect(hasEffect(u, STK, RD_CHARGE)).toBe(false)
  })

  it('OBR-RA-2 Immaculate Generalship: +1 to every discipline roll, stacking with the 12" bonus (a 2 succeeds wholly within 12")', () => {
    const roll = (reg: string, target: UnitId, die: number): boolean => {
      const s = game({ reg })
      s.phase = 'charge'
      centreRow(s, GEN, 0, -6)
      centreRow(s, IMM, 0, -9)
      centreRow(s, STK, -17, -9)
      useOnce(ctxFor(s, [die]), 'chargeStart', 'A', RD_CHARGE, { target })
      return hasEffect(s, target, RD_CHARGE)
    }
    expect(roll(IMMACULATE, IMM, 2)).toBe(true) // 2 + 1 + 1
    expect(roll(IMMACULATE, IMM, 1)).toBe(false) // 3: an unmodified 1 does not auto-fail, it simply is too low
    expect(roll(PEERLESS, IMM, 2)).toBe(false) // 2 + 1
    expect(roll(IMMACULATE, STK, 3)).toBe(true) // 3 + 1 beyond 12"
    expect(roll(IMMACULATE, STK, 2)).toBe(false)
    expect(roll(PEERLESS, STK, 3)).toBe(false)
    expect(disciplineBonus(game({ reg: IMMACULATE }), 'A', STK)).toBe(1)
    expect(disciplineBonus(game({ reg: PEERLESS }), 'A', STK)).toBe(0)
  })
})

describe('OBR-AB warscroll abilities', () => {
  it('OBR-AB-1 Refined Creations: casting 5+ gives a visible friendly unit wholly within 12" (or the Ossifector) Crit (2 Hits) on its melee weapons until your next turn', () => {
    const s = game()
    centreRow(s, GEN, 0, -6)
    centreRow(s, IMM, 0, -9)
    centreRow(s, STK, -17, -9) // beyond 12"
    const targets = (codeHooks.ossiarchRefinedCreations.activate!.targets as (st: GameState, u: UnitId, p: PlayerId) => UnitId[])(s, GEN, 'A')
    expect(targets.sort()).toEqual([GEN, IMM].sort())
    expect(offered(s, 'A', 'hero')).toContain(REFINED)
    const ctx = ctxFor(s, [2, 3])
    useOnce(ctx, 'hero', 'A', REFINED, { target: IMM })
    expect(summaries(ctx).some((t) => t.includes('casting roll 5, cast'))).toBe(true)
    expect(hasEffect(s, IMM, REFINED)).toBe(true)
    const crit = (unit: UnitId, weapon: string): string[] => {
      const m = unitModels(s, unit).find((x) => x.weapons.includes(weapon))!
      return weaponService.effectiveWeapon(s, m.id, weapon).abilities.map((a) => a.ability)
    }
    expect(crit(IMM, W('dread-halberd'))).toContain('CRIT_2_HITS')
    expect(crit(STK, W('stalker-blades'))).not.toContain('CRIT_2_HITS')
    expect(crit(GEN, W('ossified-talons'))).not.toContain('CRIT_2_HITS')
    // until the start of your next turn
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(hasEffect(s, IMM, REFINED)).toBe(false)
    // the Ossifector can pick itself
    const t = game()
    centreRow(t, GEN, 0, -6)
    useOnce(ctxFor(t, [3, 3]), 'hero', 'A', REFINED, { target: GEN })
    expect(hasEffect(t, GEN, REFINED)).toBe(true)
    // casting 4: nothing
    const u = game()
    centreRow(u, GEN, 0, -6)
    const c3 = ctxFor(u, [2, 2])
    useOnce(c3, 'hero', 'A', REFINED, { target: GEN })
    expect(summaries(c3).some((x) => x.includes('casting roll 4, not cast'))).toBe(true)
    expect(hasEffect(u, GEN, REFINED)).toBe(false)
  })

  it('OBR-AB-2 Soulbound Protectors: the general has Ward (5+) within 3" of the Immortis Guard and 6+ beyond', () => {
    const s = game()
    centreRow(s, GEN, 0, -6)
    centreRow(s, IMM, 0, -12)
    expect(unitGap(s, GEN, IMM)).toBeGreaterThan(3)
    expect(wardOf(s, GEN)).toBe(6)
    centreRow(s, IMM, 0, -9)
    expect(unitGap(s, GEN, IMM)).toBeLessThan(3)
    expect(wardOf(s, GEN)).toBe(5)
    // only the general benefits
    centreRow(s, STK, 0, -3.5)
    expect(wardOf(s, STK)).toBe(6)
    expect(wardOf(s, IMM)).toBe(6)
  })

  const wardedBrute = (b: DataBundle): void => { (b.datasheets['fx.brute'].stats as { ward?: number }).ward = 4 }

  it('OBR-AB-3 Switch Aspects (Blade-parry): -1 to hit for melee attacks on the Stalkers for the rest of the turn; ranged attacks unaffected', () => {
    const patch = (b: DataBundle): void => { const w = b.weapons['fx.w.hawk-talons'] as unknown as { type: string; range: number }; w.type = 'ranged'; w.range = 12 }
    const swing = (parry: boolean, weapon: string, kind: 'melee' | 'ranged', dice: number[]): number => {
      const s = game({ patch })
      s.phase = 'fight'
      centreRow(s, STK, 0, -4)
      centreRow(s, BRUTE, 0, -1.2)
      centreRow(s, HAWK, 6, -1.2)
      if (parry) useOnce(ctxFor(s, []), 'fight', 'A', ASPECTS, { mode: 'parry', key: 'fight:active' })
      const attacker = weapon === 'fx.w.brute-axe' ? BRUTE : HAWK
      const before = wounds(s, STK)
      attack(s, kind, dice, attacker, weapon, STK, 1)
      return before - wounds(s, STK)
    }
    // the Brute axe (hit 4+, wound 3+, rend 1) against 4+ save: a 4 hits normally, misses with -1; saves 1 fail
    expect(swing(false, 'fx.w.brute-axe', 'melee', [4, 3, 1, 1, 1])).toBeGreaterThan(0)
    expect(swing(true, 'fx.w.brute-axe', 'melee', [4, 3, 1, 1, 1])).toBe(0)
    expect(swing(true, 'fx.w.brute-axe', 'melee', [5, 3, 1, 1, 1])).toBeGreaterThan(0)
    // a ranged attack of the same profile is not affected
    expect(swing(true, 'fx.w.hawk-talons', 'ranged', [4, 3, 1, 1])).toBeGreaterThan(0)
    // the effect lasts the turn and sits on the Stalkers only
    const s = game()
    s.phase = 'fight'
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'fight', 'A', ASPECTS, { mode: 'parry', key: 'fight:active' })
    expect(hasEffect(s, STK, ASPECTS)).toBe(true)
    expect(s.units[STK].effects[0].expires.kind).toBe('turnEnd')
    expect(hasEffect(s, IMM, ASPECTS)).toBe(false)
    // once per phase
    expect(offered(s, 'A', 'fight')).not.toContain(ASPECTS)
    effectService.expire(ctx, 'turnEnd', null)
    expect(hasEffect(s, STK, ASPECTS)).toBe(false)
  })

  it('OBR-AB-4 Switch Aspects (Destroyer): no ward rolls against the Stalkers\' melee damage this turn; wards against other units\' attacks still roll', () => {
    const run = (destroyer: boolean, attacker: UnitId, weapon: string, dice: number[]) => {
      const s = game({ patch: wardedBrute })
      s.phase = 'fight'
      centreRow(s, STK, 0, -4)
      centreRow(s, GEN, 4, -4)
      centreRow(s, BRUTE, 0, -1.2)
      if (destroyer) useOnce(ctxFor(s, []), 'fight', 'A', ASPECTS, { mode: 'destroyer', key: 'fight:active' })
      const before = wounds(s, BRUTE)
      const a = attack(s, 'melee', dice, attacker, weapon, BRUTE, 1)
      return { lost: before - wounds(s, BRUTE), left: a.rng.remaining.length, s }
    }
    // hit 3, wound 3, a failed save of 1, then the Brute's ward of 4+ rolls a 6: the point is saved
    expect(run(false, STK, W('stalker-blades'), [3, 3, 1, 6])).toMatchObject({ lost: 0, left: 0 })
    const d = run(true, STK, W('stalker-blades'), [3, 3, 1, 6])
    expect(d.lost).toBe(1) // no ward roll at all
    expect(d.left).toBe(1)
    expect(hasEffect(d.s, STK, ASPECTS)).toBe(true)
    // another unit's attack against the same target still rolls its ward
    expect(run(true, GEN, W('ossified-talons'), [4, 4, 1, 6, 6])).toMatchObject({ lost: 0, left: 0 })
    // the Stalkers' own ward is not touched by the aspect
    const s = game()
    expect(wardOf(s, STK)).toBe(6)
  })

  it('OBR-AB-5 Morghast Heralds of Nagash: +1 to the Morghast\'s discipline roll while not wholly within 12" of the general; inside 12" only the trait\'s own +1', () => {
    const s = game({ reg: PEERLESS })
    centreRow(s, GEN, 0, -6)
    centreRow(s, MOR, 0, -12) // wholly within 12"
    centreRow(s, IMM, 0, -9)
    centreRow(s, STK, -17, -9)
    expect(disciplineBonus(s, 'A', MOR)).toBe(1) // the trait's +1 only
    expect(disciplineBonus(s, 'A', IMM)).toBe(1)
    centreRow(s, MOR, 17, -9)
    expect(disciplineBonus(s, 'A', MOR)).toBe(1) // far away: the warscroll's +1 instead
    expect(disciplineBonus(s, 'A', STK)).toBe(0) // an ordinary unit far away gets nothing
    // no general on the battlefield: the Morghast still roll with +1, others with none
    s.units[GEN].location = 'destroyed'
    expect(disciplineBonus(s, 'A', MOR)).toBe(1)
    expect(disciplineBonus(s, 'A', IMM)).toBe(0)
    // and the roll really uses it: a 3 works for the far Morghast (Peerless Cohesion adds no modifier), a 2 does not
    const roll = (die: number): boolean => {
      const t = game({ reg: PEERLESS })
      t.phase = 'charge'
      centreRow(t, GEN, 0, -6)
      centreRow(t, MOR, 17, -9)
      useOnce(ctxFor(t, [die]), 'chargeStart', 'A', RD_CHARGE, { target: MOR })
      return hasEffect(t, MOR, RD_CHARGE)
    }
    expect(roll(3)).toBe(true)
    expect(roll(2)).toBe(false)
    expect(s.datasheets[s.units[MOR].datasheetId].abilities).toContain(MORGHAST_AB)
  })
})

describe('OBR-ENH enhancements', () => {
  it('OBR-ENH-1 Shard Storm: casting 7+ rolls one D6 per model of a visible enemy unit within 12" of the general; each 5+ is 1 mortal damage; below 7 nothing', () => {
    const s = game({ enh: SHARD })
    centreRow(s, GEN, 0, -6)
    centreRow(s, BRUTE, 0, 4) // 3 models, 9-10" away
    expect(unitGap(s, GEN, BRUTE)).toBeLessThan(12)
    const targets = (codeHooks.ossiarchShardStorm.activate!.targets as (st: GameState, u: UnitId, p: PlayerId) => UnitId[])(s, GEN, 'A')
    expect(targets).toEqual([BRUTE]) // the Guard and the Boss stand beyond 12"
    expect(offered(s, 'A', 'hero')).toContain(SHARD_AB)
    const before = wounds(s, BRUTE)
    const ctx = ctxFor(s, [4, 3, 5, 6, 2])
    useOnce(ctx, 'hero', 'A', SHARD_AB)
    expect(summaries(ctx).some((t) => t.includes('casting roll 7, cast'))).toBe(true)
    expect(summaries(ctx).some((t) => t.includes('3 dice') && t.includes('2 mortal damage'))).toBe(true)
    expect(before - wounds(s, BRUTE)).toBe(2)
    expect(leftOver(ctx)).toEqual([])
    // casting 6: nothing, and the dice for the models are never rolled
    const t = game({ enh: SHARD })
    centreRow(t, GEN, 0, -6)
    centreRow(t, BRUTE, 0, 4)
    const c2 = ctxFor(t, [3, 3, 6, 6, 6])
    useOnce(c2, 'hero', 'A', SHARD_AB)
    expect(wounds(t, BRUTE)).toBe(before)
    expect(leftOver(c2)).toEqual([6, 6, 6])
    // not offered with a different enhancement
    expect(offered(game({ enh: LODE }), 'A', 'hero')).not.toContain(SHARD_AB)
  })

  it('OBR-ENH-2 Mend Constructs: casting 6+ heals D3 on a visible friendly unit wholly within 12" of the general; slain models do not return', () => {
    const s = game({ enh: MEND })
    centreRow(s, GEN, 0, -6)
    centreRow(s, IMM, 0, -9)
    centreRow(s, STK, -17, -9)
    // nothing is damaged: not offered
    expect(offered(s, 'A', 'hero')).not.toContain(MEND_AB)
    slay(s, IMM, 1)
    s.models[s.units[IMM].models[0]].woundsRemaining = 1 // 3 damage points on one model
    s.models[s.units[STK].models[0]].woundsRemaining = 1 // damaged but beyond 12"
    const targets = (codeHooks.ossiarchMendConstructs.activate!.targets as (st: GameState, u: UnitId, p: PlayerId) => UnitId[])(s, GEN, 'A')
    expect(targets).toEqual([IMM])
    const models = s.units[IMM].models.length
    const before = wounds(s, IMM)
    const ctx = ctxFor(s, [3, 3, 4])
    useOnce(ctx, 'hero', 'A', MEND_AB, { target: IMM })
    expect(summaries(ctx).some((t) => t.includes('casting roll 6, cast'))).toBe(true)
    expect(wounds(s, IMM) - before).toBe(2) // Heal (2)
    expect(s.units[IMM].models.length).toBe(models) // no model returned
    expect(leftOver(ctx)).toEqual([])
    // casting 5: no healing
    const t = game({ enh: MEND })
    centreRow(t, GEN, 0, -6)
    t.models[t.units[GEN].models[0]].woundsRemaining = 2
    const c2 = ctxFor(t, [2, 3, 3])
    useOnce(c2, 'hero', 'A', MEND_AB, { target: GEN })
    expect(t.models[t.units[GEN].models[0]].woundsRemaining).toBe(2)
    // the general can mend itself (a unit wholly within 12" of itself)
    const u = game({ enh: MEND })
    centreRow(u, GEN, 0, -6)
    u.models[u.units[GEN].models[0]].woundsRemaining = 2
    useOnce(ctxFor(u, [3, 4, 6]), 'hero', 'A', MEND_AB, { target: GEN })
    expect(u.models[u.units[GEN].models[0]].woundsRemaining).toBe(5) // Heal (3) is capped at the Health
  })

  it('OBR-ENH-3 Lode of Saturation: a Rend 2 melee attack on the general resolves at Rend 1, Rend 1 at 0, Rend 0 stays 0; ranged attacks unaffected; Companion weapons affected', () => {
    const patch = (b: DataBundle): void => {
      const w = (id: string) => b.weapons[id] as unknown as { rend: number; type: string; range: number; abilities: unknown[] }
      w('fx.w.brute-axe').rend = 2
      w('fx.w.boss-blade').rend = 1
      w('fx.w.guard-spear').rend = 0
      const talons = w('fx.w.hawk-talons')
      talons.rend = 2; talons.abilities = [{ ability: 'COMPANION' }]
    }
    const s = game({ patch })
    centreRow(s, GEN, 0, -6)
    centreRow(s, BRUTE, 0, -2.7)
    centreRow(s, BOSS, 5, -2.7)
    centreRow(s, GUARD, -5, -2.7)
    centreRow(s, HAWK, 9, -2.7)
    expect(meleeOf(s, BRUTE, 'fx.w.brute-axe', GEN).rend).toBe(1)
    expect(meleeOf(s, BOSS, 'fx.w.boss-blade', GEN).rend).toBe(0)
    expect(meleeOf(s, GUARD, 'fx.w.guard-spear', GEN).rend).toBe(0)
    expect(meleeOf(s, HAWK, 'fx.w.hawk-talons', GEN).rend).toBe(1) // Companion: an enemy ability still reaches it
    // only attacks that target the general: the same Brute against the Guard keeps Rend 2
    expect(meleeOf(s, BRUTE, 'fx.w.brute-axe', IMM).rend).toBe(2)
    expect(meleeOf(s, BRUTE, 'fx.w.brute-axe', STK).rend).toBe(2)
    // a ranged weapon is not touched
    const r = game({ patch: (b) => { const w = b.weapons['fx.w.hawk-talons'] as unknown as { rend: number; type: string; range: number }; w.rend = 2; w.type = 'ranged'; w.range = 12 } })
    centreRow(r, GEN, 0, -6)
    centreRow(r, HAWK, 9, -2.7)
    expect(meleeOf(r, HAWK, 'fx.w.hawk-talons', GEN).rend).toBe(2)
    // another enhancement: no effect
    const o = game({ patch, enh: HELM })
    expect(meleeOf(o, BRUTE, 'fx.w.brute-axe', GEN).rend).toBe(2)
    // through the real save: Rend 2 against a 4+ save fails on a 5 (5 - 2 = 3), Rend 1 passes (5 - 1 = 4)
    const dice = [4, 4, 5, 1, 1]
    const withLode = game({ patch })
    centreRow(withLode, GEN, 0, -6); centreRow(withLode, BRUTE, 0, -2.7)
    const a = attack(withLode, 'melee', dice, BRUTE, 'fx.w.brute-axe', GEN, 1)
    expect(wounds(withLode, GEN)).toBe(5)
    expect(a.rng.remaining.length).toBe(2) // the save held, no ward roll
    const without = game({ patch, enh: HELM })
    centreRow(without, GEN, 0, -6); centreRow(without, BRUTE, 0, -2.7)
    attack(without, 'melee', dice, BRUTE, 'fx.w.brute-axe', GEN, 1)
    expect(wounds(without, GEN)).toBe(3) // Rend 2: the save fails, the ward roll of 1 fails, 2 damage
  })

  it('OBR-ENH-4 Helm of Tyranny: once per battle at the end of your turn, on 3+ an enemy unit within 12" has -3 control score for that turn\'s control check; gone next turn', () => {
    const s = game({ enh: HELM })
    centreRow(s, GEN, 0, -6)
    centreRow(s, BRUTE, 0, 4)
    centreRow(s, BOSS, 0, -2)
    const objective = Object.keys(s.objectives)[0]
    const score = (st: GameState, unit: UnitId): number => hookService.unitControlScore(ctxFor(st, []), unit, objective, 5)
    expect(score(s, BRUTE)).toBe(5)
    expect(offered(s, 'A', 'endOfTurn')).toContain(HELM_AB)
    expect(offered(s, 'B', 'endOfTurn')).not.toContain(HELM_AB) // your turn only
    // a 2 fails: the use is spent for nothing
    const miss = game({ enh: HELM })
    centreRow(miss, GEN, 0, -6); centreRow(miss, BRUTE, 0, 4)
    useOnce(ctxFor(miss, [2]), 'endOfTurn', 'A', HELM_AB, { target: BRUTE })
    expect(hasEffect(miss, BRUTE, HELM_AB)).toBe(false)
    expect(offered(miss, 'A', 'endOfTurn')).not.toContain(HELM_AB)
    // a 3 works on the picked unit only
    const ctx = ctxFor(s, [3])
    const r = useOnce(ctx, 'endOfTurn', 'A', HELM_AB, { target: BRUTE })
    expect(r.targets[0].sort()).toEqual([BOSS, BRUTE].sort()) // enemy units within 12"
    expect(hasEffect(s, BRUTE, HELM_AB)).toBe(true)
    expect(score(s, BRUTE)).toBe(2)
    expect(score(s, BOSS)).toBe(5)
    expect(score(s, GEN)).toBe(5)
    // once per battle, even in a later turn
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(HELM_AB)
    s.round = 3
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(HELM_AB)
    // it ends with the turn
    effectService.expire(ctx, 'turnEnd', s.activePlayer)
    expect(score(s, BRUTE)).toBe(5)
    // the floor of 1 still applies
    const f = game({ enh: HELM })
    centreRow(f, GEN, 0, -6); centreRow(f, BRUTE, 0, 4)
    useOnce(ctxFor(f, [6]), 'endOfTurn', 'A', HELM_AB, { target: BRUTE })
    expect(hookService.unitControlScore(ctxFor(f, []), BRUTE, objective, 2)).toBe(1)
  })
})

describe('OBR-MAG and OBR-FLY', () => {
  it('OBR-MAG-1 the Ossifector casts one spell per hero phase (Refined Creations or the enhancement spell); a double 1 miscasts; an enemy Wizard may unbind', () => {
    const s = game({ enh: MEND, patch: (b) => { b.datasheets['fx.boss'].keywords = ['HERO', 'INFANTRY', 'WIZARD']; b.datasheets['fx.boss'].wizard = 1 } })
    centreRow(s, GEN, 0, -6)
    centreRow(s, IMM, 0, -9)
    centreRow(s, BOSS, 8, 8)
    s.models[s.units[IMM].models[0]].woundsRemaining = 1
    expect(wizardLevel(s, GEN)).toBe(1)
    expect(canCast(s, GEN)).toBe(true)
    expect(offered(s, 'A', 'hero')).toEqual(expect.arrayContaining([REFINED, MEND_AB]))
    // one attempt (it fails: a 4) uses up the phase's cast for both spells
    useOnce(ctxFor(s, [2, 2]), 'hero', 'A', REFINED, { target: GEN })
    expect(canCast(s, GEN)).toBe(false)
    expect(offered(s, 'A', 'hero')).not.toContain(REFINED)
    expect(offered(s, 'A', 'hero')).not.toContain(MEND_AB)
    // a new phase starts with a fresh cast
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('magic:'))
    expect(canCast(s, GEN)).toBe(true)
    // a double 1 miscasts
    const miscast = castingRoll(ctxFor(s, [1, 1, 2, 1, 1]), { abilityId: REFINED, unitId: GEN, player: 'A' }, GEN, 5)
    expect(miscast).toMatchObject({ cast: false, miscast: true })
    expect(canCast(s, GEN)).toBe(false)
    // unbinding: the enemy Boss (Wizard) rolls 2D6 against the cast and unbinds with a higher total
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('magic:'))
    const ctx = ctxFor(s, [2, 3, 6, 5])
    const cast = castingRoll(ctx, { abilityId: REFINED, unitId: GEN, player: 'A' }, GEN, 5)
    expect(cast).toMatchObject({ cast: false, unbound: true, unboundBy: BOSS })
    expect(leftOver(ctx)).toEqual([])
  })

  it('OBR-FLY-1 the Morghast move over other models (Fly); the Immortis Guard cannot', () => {
    const s = game()
    const kw = (id: UnitId): string[] => s.datasheets[s.units[id].datasheetId].keywords
    expect(kw(MOR)).toContain('FLY')
    expect(kw(IMM)).not.toContain('FLY')
    s.phase = 'movement'
    const ctx = ctxFor(s, [])
    for (const id of [IMM, MOR]) for (const m of s.units[id].models.slice(1)) removeModel(s, m)
    s.units[MOR].location = 'board'
    const tryMove = (unit: UnitId): string | null => {
      centreRow(s, unit, -2.25, -5)
      centreRow(s, GEN, 0, -5) // the blocker stands in the way
      s.units[unit].turn.moveType = null
      s.phaseState.marks = []
      s.phaseState.activated = []
      s.pending = null
      s.step = 'select'
      movementModule.enter(ctx)
      movementModule.advance(ctx)
      s.pending = null
      movementModule.handle(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: unit }, { kind: 'chooseUnitToActivate' } as never)
      movementModule.advance(ctx)
      s.pending = null
      movementModule.handle(ctx, { type: 'declareMove', player: 'A', decisionId: '', unitId: unit, moveType: 'normal' }, { kind: 'declareMove' } as never)
      s.phaseState.marks.push('mv:declWin:' + unit)
      movementModule.advance(ctx)
      const placements: ModelPlacement[] = [{ modelId: s.units[unit].models[0], pos: { x: 2.25, y: 0, z: -5 }, facing: 0 }]
      const rej = movementModule.validate?.(s, { type: 'moveUnit', player: 'A', decisionId: '', unitId: unit, placements } as Action, s.pending as never)
      return rej ? rej.code : null
    }
    expect(tryMove(IMM)).not.toBeNull()
    expect(tryMove(MOR)).toBeNull()
  })
})

describe('OBR-AI', () => {
  it('OBR-AI hints: Relentless Discipline is kept for a move, charge or fight that gains from it; Switch Aspects picks Destroyer against a ward; Helm waits for a contested objective', () => {
    const s = game({ enh: HELM })
    centreRow(s, GEN, 0, -6)
    centreRow(s, IMM, 0, -8.5)
    centreRow(s, STK, -14, -9)
    // movement: a Retreat gains nothing, a unit with enemies far away does
    s.phase = 'movement'
    declare(s, STK, 'fallBack')
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchRelentlessDiscipline', null)).toBeLessThan(-2)
    declare(s, STK, 'normal')
    centreRow(s, BRUTE, 14, 8)
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchRelentlessDiscipline', null)).toBeGreaterThanOrEqual(0)
    // charge: nothing within reach = pass; an enemy 8" away makes the +1 worth it, on the unit that has the charge
    s.phase = 'charge'
    for (const id of [BOSS, GUARD, HAWK, BRUTE]) s.units[id].location = 'reserves'
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchRelentlessDiscipline', null)).toBeLessThan(-2)
    centreRow(s, BRUTE, 0, 3)
    expect(unitGap(s, GEN, BRUTE)).toBeLessThan(12)
    centreRow(s, STK, 0, -4)
    centreRow(s, BRUTE, 0, 4.5)
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchRelentlessDiscipline', null)).toBeGreaterThanOrEqual(0)
    expect(ossiarchTargetBonus(s, 'A', 'ossiarchRelentlessDiscipline', STK)!).toBeGreaterThan(ossiarchTargetBonus(s, 'A', 'ossiarchRelentlessDiscipline', GEN)!)
    // combat: not in combat = pass; in combat the Stalkers gain from Switch Aspects, Destroyer against a warded enemy
    s.phase = 'fight'
    centreRow(s, STK, 0, -4)
    centreRow(s, BRUTE, 0, 12)
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchRelentlessDiscipline', null)).toBeLessThan(-2)
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchSwitchAspects', STK)).toBeLessThan(-2)
    centreRow(s, BRUTE, 0, -1.2)
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchRelentlessDiscipline', null)).toBeGreaterThanOrEqual(0)
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchSwitchAspects', STK)).toBeGreaterThanOrEqual(0)
    expect(ossiarchModeBonus(s, 'ossiarchSwitchAspects', STK, 'parry', null)).toBeGreaterThan(ossiarchModeBonus(s, 'ossiarchSwitchAspects', STK, 'destroyer', null) as number)
    const w = game({ patch: (b) => { (b.datasheets['fx.brute'].stats as { ward?: number }).ward = 5 } })
    centreRow(w, STK, 0, -4)
    centreRow(w, BRUTE, 0, -1.2)
    expect(ossiarchModeBonus(w, 'ossiarchSwitchAspects', STK, 'destroyer', null)).toBeGreaterThan(ossiarchModeBonus(w, 'ossiarchSwitchAspects', STK, 'parry', null) as number)
    // Relentless Discipline in combat: Ward for the unit taking the beating, +1 to wound for the one dishing it out
    expect(ossiarchModeBonus(s, 'ossiarchRelentlessDiscipline', null, 'wound', STK)).toBeGreaterThanOrEqual(0)
    // Helm of Tyranny: no objective contest, no use
    s.phase = 'command'
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchHelmOfTyranny', GEN)).toBeLessThan(-2)
    // Shard Storm and Mend Constructs wait for a crowd / real damage
    centreRow(s, BRUTE, 15, 8) // out of the way (models block the line of sight)
    centreRow(s, GUARD, 0, 4)
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchShardStorm', GEN)).toBeGreaterThanOrEqual(1)
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchMendConstructs', GEN)).toBeLessThan(-2)
    s.models[s.units[IMM].models[0]].woundsRemaining = 1
    expect(ossiarchAbilityTiming(s, 'A', 'ossiarchMendConstructs', GEN)).toBeGreaterThanOrEqual(1)
    expect(ossiarchTargetBonus(s, 'A', 'ossiarchMendConstructs', IMM)!).toBeGreaterThan(ossiarchTargetBonus(s, 'A', 'ossiarchMendConstructs', STK)!)
  })

  it('OBR-AI-1 whole games: the Ossiarch AI plays full games against Cities with every regiment ability and enhancement, arrives with the Morghast in round 2 or 3 and uses Relentless Discipline', async () => {
    const full = await loadBundle()
    const picks = [
      { reg: 'ossiarch.ability.immaculate-generalship', enh: 'ossiarch.enh.lode-of-saturation' },
      { reg: 'ossiarch.ability.peerless-cohesion', enh: 'ossiarch.enh.shard-storm' },
      { reg: 'ossiarch.ability.immaculate-generalship', enh: 'ossiarch.enh.mend-constructs' },
      { reg: 'ossiarch.ability.peerless-cohesion', enh: 'ossiarch.enh.helm-of-tyranny' },
    ]
    let discipline = 0
    for (const [g, pick] of picks.entries()) {
      const seed = `obr-${g}`
      const setup = makeSimSetup(full, g, DATA_VERSION, ['ossiarch', 'cities'])
      for (const p of ['A', 'B'] as const) if (setup.players[p].faction === 'ossiarch') { setup.players[p].regimentAbilityId = pick.reg; setup.players[p].enhancementId = pick.enh }
      const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
      let r = createGame(setup, seed, full)
      const arrived: Record<string, number> = {}
      for (let n = 0; r.pending && n < 8000; n++) {
        const legal = legalActions(r.state, r.pending)!
        r = step(r.state, await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal))
        expect(r.rejection).toBeUndefined()
        discipline += of(r.events, 'AbilityTriggered').filter((e) => e.summary.startsWith('Relentless Discipline')).length
        for (const u of Object.values(r.state.units)) if (u.reserveArrival === DESCENT && u.location !== 'reserves' && arrived[u.id] === undefined) arrived[u.id] = r.state.round
      }
      expect(r.state.phase).toBe('ended')
      for (const id of Object.keys(arrived)) expect([2, 3], `${id} arrives in round 2 or 3`).toContain(arrived[id])
    }
    expect(discipline).toBeGreaterThan(0)
  }, 900000)
})
