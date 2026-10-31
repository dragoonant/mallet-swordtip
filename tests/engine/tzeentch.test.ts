// Disciples of Tzeentch (Tzaangor Warflock) code hooks: docs/spec/factions/disciples-of-tzeentch.md, test ids DOT-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/tzeentch files on top of the AoS fixture bundle
// (player A = Tzaangor Warflock, player B = the fixture Chaos army: Boss, Brutes, Hawk, Guard). Dice are scripted; nothing here patches
// the shipped data except where a test says so (an enemy Wizard, a Companion weapon, a ranged Guard).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, removeModel, unitModels,
  type AbilityWindow, type Action, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PendingDecision, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService, damagedByShootingThisPhase, drainAfterFightMortal, pendingAfterFightMortal } from '../../src/engine/attack'
import { cardsOf, commandWindow, cardHandler } from '../../src/engine/cards'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { losService } from '../../src/engine/los'
import { canCast, castingRoll, unbinders } from '../../src/engine/magic'
import { missionService } from '../../src/engine/missions'
import { weaponService } from '../../src/engine/weapons'
import { movementModule } from '../../src/engine/phases/movement'
import { checkSlide, readMoveQueue } from '../../src/engine/factions/aos-moves'
import { enemiesInCombat, returnableModels, whollyWithinUnit } from '../../src/engine/factions/aos-common'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { tzeentchAbilityTiming, tzeentchTargetBonus } from '../../src/engine/factions/tzeentch'
import type { AbilityDescriptor, CardDeckData, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, autoDeployAos, makeAosPlayer, withAosBundle } from '../fixtures'
import deckJson from '../../src/data/cards/fire-and-jade.json'
import abilitiesJson from '../../src/data/factions/tzeentch/abilities.json'
import enhancementsJson from '../../src/data/factions/tzeentch/enhancements.json'
import weaponsJson from '../../src/data/factions/tzeentch/weapons.json'
import factionJson from '../../src/data/factions/tzeentch/faction.json'
import patrolJson from '../../src/data/factions/tzeentch/patrols/tzaangor-warflock.json'
import shamanJson from '../../src/data/factions/tzeentch/datasheets/tzaangor-shaman.json'
import tzaangorsJson from '../../src/data/factions/tzeentch/datasheets/tzaangors.json'
import enlightenedJson from '../../src/data/factions/tzeentch/datasheets/tzaangor-enlightened.json'
import skyfiresJson from '../../src/data/factions/tzeentch/datasheets/tzaangor-skyfires.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  // cloned: a test that patches the data must not leak into the next one
  for (const a of structuredClone(abilitiesJson) as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of structuredClone(weaponsJson) as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of structuredClone([shamanJson, tzaangorsJson, enlightenedJson, skyfiresJson].flat()) as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of structuredClone(enhancementsJson) as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.tzeentch = structuredClone(factionJson) as unknown as FactionData
  b.patrols[patrolJson.id] = structuredClone(patrolJson) as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const ARMY = 'tzeentch.army.tzaangor-warflock'
const FATED = 'tzeentch.ability.fated-arrival'
const PREDICT = 'tzeentch.ability.predict-the-future'
const CHEAT = 'tzeentch.ability.cheat-destiny'
const FLUX = 'tzeentch.ability.constant-flux'
const RITUAL = 'tzeentch.ability.arcane-ritualists'
const MUTAGENIC = 'tzeentch.enh.mutagenic-sorcery'
const STRIKE = 'tzeentch.enh.predicted-strike'
const FOLD = 'tzeentch.enh.fold-reality'
const GATEWAY = 'tzeentch.enh.infernal-gateway'
const MUTAGENIC_AB = 'tzeentch.ability.mutagenic-sorcery'
const STRIKE_AB = 'tzeentch.ability.predicted-strike'
const FOLD_AB = 'tzeentch.ability.fold-reality'
const GATEWAY_AB = 'tzeentch.ability.infernal-gateway'
const AURA = 'tzeentch.ability.mutative-aura'
const QUARRY = 'tzeentch.ability.destined-quarry'

const SHAMAN = 'A:tzaangor-shaman'
const TZ = 'A:tzaangors'
const ENL = 'A:tzaangor-enlightened'
const SKY = 'A:tzaangor-skyfires'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'

const W = (id: string) => `tzeentch.weapon.${id}`

// card ids that exist in the shipped Fire and Jade deck
const C1 = 'card.tactic.war-of-attrition'
const C2 = 'card.tactic.raid'
const C3 = 'card.tactic.hold-ground'
const C4 = 'card.tactic.take-the-flanks'

// lay a unit's models in a tight row centred on (cx, cz); 7+ models go in two rows so every model keeps two neighbours (coherency)
function centreRow(s: GameState, unitId: UnitId, cx: number, cz: number): void {
  const ms = unitModels(s, unitId)
  const r = Math.max(...ms.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
  const step = 2 * r + 0.15
  s.units[unitId].location = 'board'
  const rows = ms.length >= 7 ? 2 : 1
  const cols = Math.ceil(ms.length / rows)
  ms.forEach((m, i) => {
    const col = i % cols, row = Math.floor(i / cols)
    m.pos = { x: cx + (col - (cols - 1) / 2) * step, y: 0, z: cz + (rows === 1 ? 0 : (row - 0.5) * step) }
  })
}

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

// keep only the first `n` models of a unit (they are not "slain": no destroyedModels entry)
const trim = (s: GameState, unitId: UnitId, n: number): void => {
  for (const id of [...s.units[unitId].models].slice(n)) { delete s.models[id]; s.units[unitId].models = s.units[unitId].models.filter((m) => m !== id) }
}
const slay = (s: GameState, unitId: UnitId, n: number): void => { for (const id of [...s.units[unitId].models].slice(-n)) removeModel(s, id) }

// one model of the unit on the board at (x, z), the rest dropped (not slain)
function put(s: GameState, unitId: UnitId, x: number, z: number): void {
  trim(s, unitId, 1)
  s.units[unitId].location = 'board'
  unitModels(s, unitId)[0].pos = { x, y: 0, z }
}

const gapBetween = (s: GameState, a: UnitId, b: UnitId): number =>
  Math.min(...unitModels(s, a).flatMap((m) => unitModels(s, b).map((o) => horizontalGap(m, o))))

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'tzeentch', patrolId: ARMY, enhancementId: opts.enh ?? MUTAGENIC, regimentAbilityId: opts.reg ?? FLUX }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  // bystanders go along the back edges, two rows each, clear of the middle where the tests work (the Enlightened stay in reserve)
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

type Pick = (topic: string, ids: string[], p: ChooseOptionDecision) => string

// decisions the ability loop does not answer itself (the code hooks' own 'abilityChoice') go to the hook service
function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: Pick): { topics: string[]; options: string[][] } {
  const topics: string[] = []
  const options: string[][] = []
  for (let i = 0; i < 40; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return { topics, options }
    const p = ctx.state.pending as ChooseOptionDecision
    topics.push(p.context.topic)
    const ids = p.options.map((o) => o.id)
    options.push(ids)
    const choice = pick(p.context.topic, ids, p)
    ctx.state.pending = null
    const action = choice === 'pass' ? { type: 'pass' as const, player, decisionId: p.id } : { type: 'chooseOption' as const, player, decisionId: p.id, optionId: choice }
    const handler = p.context.topic === 'abilityChoice' ? hookService.handler! : abilityService.handler
    const rej = handler.handle(ctx, action as Action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

// use one ability once; every other offer is declined. `mode` picks an abilityMode option by id (default: the first)
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string; pickMode?: (ids: string[]) => string; choice?: Pick } = {}) {
  let used = false
  return runWindow(ctx, window, player, (topic, ids, p) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    if (topic === 'abilityChoice' && opts.choice) return opts.choice(topic, ids, p)
    return opts.mode ?? opts.pickMode?.(ids) ?? ids[0]
  })
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const targetsOf = (code: string, s: GameState, unitId: UnitId | null, player: PlayerId): UnitId[] =>
  (codeHooks[code].activate!.targets as unknown as (state: GameState, unitId: UnitId | null, player: PlayerId) => UnitId[])(s, unitId, player)
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const centreOf = (s: GameState, unitId: UnitId): { x: number; z: number } => {
  const ms = unitModels(s, unitId)
  return { x: ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, z: ms.reduce((a, m) => a + m.pos.z, 0) / ms.length }
}
const farthest = (ids: string[]): string => {
  const far = (id: string): number => { const [, dx, dz] = id.split(':'); return Math.hypot(Number(dx), Number(dz)) }
  return [...ids].sort((a, b) => far(b) - far(a))[0]
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

// the sum of modifiers the roll hooks give an attack by `attackerUnitId` against `targetUnitId` with `weaponId`
function rollModifier(s: GameState, hook: 'onHitRoll' | 'onWoundRoll', kind: 'melee' | 'ranged', attackerUnitId: UnitId, targetUnitId: UnitId, weaponId: string): number {
  const ctx = ctxFor(s, [3])
  const atk = {
    kind, overwatch: false, attackerUnitId, attackerModelId: s.units[attackerUnitId].models[0], weapon: s.weapons[weaponId], targetUnitId, targetModelId: s.units[targetUnitId].models[0],
    range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: kind === 'melee',
  }
  const purpose = hook === 'onHitRoll' ? 'hit' : 'wound'
  const roll = ctx.roll({ purpose, player: s.units[attackerUnitId].player, unitId: attackerUnitId })
  return hookService.collect(ctx, hook, { attack: atk, roll: { purpose, roll, dieIndex: 0, unmodified: roll.dice[0], rerolled: false } } as never)
    .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
}

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

function cardGame(): { s: GameState; ctx: EngineContext } {
  const s = aosState({
    players: { A: makeAosPlayer('A', { faction: 'tzeentch', patrolId: ARMY, enhancementId: MUTAGENIC, regimentAbilityId: FLUX }), B: makeAosPlayer('B') },
  }, bundle((b) => { b.cardDecks = { 'rbf.fire-and-jade': deckJson as unknown as CardDeckData } }))
  autoDeployAos(s, 'A'); autoDeployAos(s, 'B')
  // War of Attrition's command is an enemy-turn one: the opponent's hero phase
  s.round = 1; s.phase = 'command'; s.activePlayer = 'B'; s.firstPlayer = 'B'
  s.cards!.tactics.A.hand = [C1]
  s.cards!.tactics.A.deck = [C2]
  return { s, ctx: ctxFor(s) }
}
// the hero-phase command window: uses the first offered command of `card`
function useCommand(ctx: EngineContext, card: string): PendingDecision {
  expect(commandWindow(ctx, 'hero', 'A')).toBe(true)
  const pending = ctx.state.pending as ChooseOptionDecision
  const opt = pending.options.find((o) => o.id.startsWith(card))!
  ctx.state.pending = null
  expect(cardHandler.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: pending.id, optionId: opt.id } as Action, pending)).toBeUndefined()
  return pending
}


// ---------- tests ----------
describe('registry and shipped data', () => {
  it('DOT-REG every code in the Tzeentch data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('DOT-ARMY-1 the army builds in the engine: Shaman general, 10 Tzaangors, 3 Enlightened in reserve, 3 Skyfires; 17 models, the chosen regiment ability and enhancement', () => {
    const s = game({ enh: FOLD, reg: RITUAL })
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(17)
    expect(s.players.A.warlordUnitId).toBe(SHAMAN)
    expect(s.players.A.battleTraitIds).toEqual(['tzeentch.ability.warflock-ambush', PREDICT, CHEAT])
    expect(s.players.A.regimentAbilityId).toBe(RITUAL)
    expect(s.units[SHAMAN].enhancementId).toBe(FOLD)
    expect(s.units[ENL].reserveArrival).toBe(FATED)
    expect(mine.filter((u) => u.reserveArrival).map((u) => u.id)).toEqual([ENL])
    const st = (id: string) => s.datasheets[`tzeentch.unit.${id}`].stats
    expect(st('tzaangor-shaman')).toMatchObject({ M: 14, W: 6, Sv: 5, OC: 2 })
    expect(st('tzaangors')).toMatchObject({ M: 6, W: 2, Sv: 5, OC: 1 })
    expect(st('tzaangor-enlightened')).toMatchObject({ M: 14, W: 4, Sv: 4, OC: 1 })
    expect(st('tzaangor-skyfires')).toMatchObject({ M: 14, W: 4, Sv: 4, OC: 1 })
    expect(s.datasheets['tzeentch.unit.tzaangor-shaman'].wizard).toBe(1)
  })

  it('DOT-ARMY-2 no unit has Reinforcements: a destroyed unit is never offered for Call for Reinforcements', () => {
    const s = game()
    for (const u of Object.values(s.units).filter((x) => x.player === 'A')) expect(s.datasheets[u.datasheetId].keywords).not.toContain('REINFORCEMENTS')
    for (const id of [SHAMAN, TZ, ENL, SKY]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A')).toEqual([])
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).not.toContain('core.ability.call-for-reinforcements')
  })
})

describe('DOT-BT battle traits', () => {
  it('DOT-BT-1 Fated Arrival: the Enlightened start in reserve; the arrival is offered from round 2 only, wholly in friendly territory, within 1" of an edge, more than 6" from every enemy', () => {
    const s = game()
    expect(s.units[ENL].location).toBe('reserves')
    s.phase = 'movement'
    // round 1: no arrival
    expect(toArrival(ctxFor(s))).toBeNull()
    expect(s.units[ENL].location).toBe('reserves')
    // round 2, the opponent's turn: nothing either
    const o = game()
    o.phase = 'movement'; o.round = 2; o.activePlayer = 'B'
    centreRow(o, BOSS, 8, 8)
    expect(toArrival(ctxFor(o))).toBeNull()
    // round 2: a deployUnit decision
    const t = game()
    t.phase = 'movement'; t.round = 2
    centreRow(t, BOSS, 4, -4) // inside A's territory, far from the short edge
    const ctx = ctxFor(t)
    const p = toArrival(ctx)
    expect(p?.kind).toBe('deployUnit')
    const models = t.units[ENL].models
    const at = (cols: (i: number) => { x: number; z: number }): Action => ({
      type: 'deployUnit', player: 'A', decisionId: (p as PendingDecision).id, unitId: ENL,
      placements: models.map((id, i) => ({ modelId: id, pos: { ...cols(i), y: 0 } as never, facing: 0 })),
    } as unknown as Action)
    const column = (x: number) => at((i) => ({ x, z: -2 - i * 1.8 })) // a column along the short edge x = -15
    // fixture territory A: z in [-11, 0], x in [-15, 15]. 1.2" from the edge (base edge 0.4" away): fine; the Boss is more than 6" away
    expect(movementModule.validate?.(t, column(-14.2), p as PendingDecision)).toBeNull()
    // a row in the middle of the territory touches no edge
    expect(movementModule.validate?.(t, at((i) => ({ x: -9 + i * 1.8, z: -5 })), p as PendingDecision)?.code).toBe('E_OUT_OF_RANGE')
    // across the halfway line: not friendly territory
    expect(movementModule.validate?.(t, at((i) => ({ x: -14.2, z: 2 + i * 1.8 })), p as PendingDecision)).not.toBeNull()
    // within 6" of an enemy
    centreRow(t, GUARD, -14, 0.2)
    expect(gapBetween(t, GUARD, ENL)).toBeLessThan(10)
    const near = column(-14.2)
    expect(movementModule.validate?.(t, near, p as PendingDecision)).not.toBeNull()
    centreRow(t, GUARD, 8, 8)
    t.pending = null
    expect(movementModule.handle(ctx, column(-14.2), p as PendingDecision)).toBeUndefined()
    expect(t.units[ENL].location).toBe('board')
    expect(t.units[ENL].setUpTurn).toEqual({ round: 2, player: 'A' })
    for (const m of unitModels(t, ENL)) for (const e of Object.values(t.models).filter((x) => t.units[x.unitId].player === 'B' && t.units[x.unitId].location === 'board')) expect(horizontalGap(m, e)).toBeGreaterThan(6)
  })

  it('DOT-BT-2 an Enlightened unit still in reserve at the start of round 4 is destroyed; an arrived unit cannot Move that phase', () => {
    const s = aosState({
      players: { A: makeAosPlayer('A', { faction: 'tzeentch', patrolId: ARMY, enhancementId: MUTAGENIC, regimentAbilityId: FLUX }), B: makeAosPlayer('B') },
    }, bundle())
    autoDeployAos(s, 'A')
    autoDeployAos(s, 'B')
    s.round = 4
    const ctx = ctxFor(s)
    missionService.onWindow(ctx, 'round.start', '4')
    expect(s.units[ENL].location).toBe('destroyed')
    expect(of(evOf(ctx), 'UnitDestroyed').map((e) => e.unitId)).toEqual([ENL])
    expect(s.units[TZ].location).toBe('board')
    // arrival: set up this turn, so it counts as activated and cannot use Move abilities
    const t = game()
    t.phase = 'movement'; t.round = 2
    centreRow(t, BOSS, 8, 8)
    const c2 = ctxFor(t)
    const p = toArrival(c2) as PendingDecision
    const models = t.units[ENL].models
    t.pending = null
    movementModule.handle(c2, { type: 'deployUnit', player: 'A', decisionId: p.id, unitId: ENL, placements: models.map((id, i) => ({ modelId: id, pos: { x: -14.2, y: 0, z: -2 - i * 1.8 }, facing: 0 })) } as unknown as Action, p)
    expect(t.phaseState.activated).toContain(ENL)
    expect(t.units[ENL].turn.arrivedThisTurn).toBe(true)
  })

  it('DOT-BT-3 Predict the Future: looks at up to 3 top cards, each goes to the top or the bottom as chosen; hand and discard unchanged; not offered with an empty deck; once per phase', () => {
    const s = game()
    const piles = cardsOf(s).tactics.A
    piles.hand = ['card.tactic.take-without-warning']
    piles.discard = ['card.tactic.do-not-waver']
    piles.deck = [C1, C2, C3, C4]
    expect(offered(s, 'A', 'hero')).toContain(PREDICT)
    // not in the enemy's hero phase
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'hero')).not.toContain(PREDICT)
    s.activePlayer = 'A'
    const ctx = ctxFor(s)
    // C1 stays on top, C2 goes to the bottom, C3 stays on top; then C3 goes on the very top
    const seen: string[][] = []
    const r = useOnce(ctx, 'hero', 'A', PREDICT, {
      choice: (_t, ids, p) => {
        seen.push(ids)
        const d = p.context.data as { stage: string; cards: string[]; i: number; tops: string[] }
        if (d.stage === 'order') return `first:${d.tops.indexOf(C3)}`
        return d.cards[d.i] === C2 ? `bottom:${d.i}` : `top:${d.i}`
      },
    })
    expect(r.topics.filter((t) => t === 'abilityChoice')).toHaveLength(4) // three cards + the order of the two kept on top
    expect(seen[0]).toEqual(['top:0', 'bottom:0']) // the first card is the top card; the public action log names no card
    expect(seen.flat().join()).not.toContain('card.tactic')
    expect(piles.deck).toEqual([C3, C1, C4, C2])
    expect(piles.hand).toEqual(['card.tactic.take-without-warning'])
    expect(piles.discard).toEqual(['card.tactic.do-not-waver'])
    // nothing public names a card
    expect(summaries(ctx).join(' ')).not.toMatch(/card\.tactic/)
    expect(summaries(ctx).some((x) => /looked at 3 cards, 2 stay on top and 1 go/.test(x))).toBe(true)
    // once per phase
    expect(offered(s, 'A', 'hero')).not.toContain(PREDICT)
    // a deck of two: two cards, both to the bottom, no order question
    const t = game()
    cardsOf(t).tactics.A.deck = [C1, C2]
    const r2 = useOnce(ctxFor(t), 'hero', 'A', PREDICT, { choice: (_t, ids) => ids[1] })
    expect(r2.topics.filter((x) => x === 'abilityChoice')).toHaveLength(2)
    expect(cardsOf(t).tactics.A.deck).toEqual([C1, C2])
    // an empty deck: not offered
    const u = game()
    cardsOf(u).tactics.A.deck = []
    expect(offered(u, 'A', 'hero')).not.toContain(PREDICT)
  })

  it('DOT-BT-4 Cheat Destiny: after a tactic command resolves the card can go to the bottom of the deck instead of the discard pile; once per phase; declining leaves it discarded', () => {
    const { s, ctx } = cardGame()
    useCommand(ctx, C1)
    // the player is asked before anything else; the card is already in the discard pile
    const q = s.pending as ChooseOptionDecision
    expect(q.context.topic).toBe('abilityChoice')
    expect(q.options.map((o) => o.id)).toEqual([`bottom:${C1}`])
    expect(q.canPass).toBe(true)
    expect(s.cards!.tactics.A.discard).toEqual([C1])
    s.pending = null
    expect(hookService.handler!.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: q.id, optionId: `bottom:${C1}` } as Action, q)).toBeUndefined()
    expect(s.cards!.tactics.A.discard).toEqual([])
    expect(s.cards!.tactics.A.deck).toEqual([C2, C1])
    expect(summaries(ctx).some((x) => /Cheat Destiny/.test(x))).toBe(true)
    // the second command of the same phase is not offered the trick again
    const hook = codeHooks.tzeentchCheatDestiny
    const entry = { ability: s.abilities[CHEAT], source: { id: CHEAT } } as never
    s.cards!.tactics.A.discard = [C3]
    hook.onTacticCommandUsed!(ctx, entry, { player: 'A', cardId: C3 })
    expect(s.pending).toBeNull()
    // a new phase: offered again, and declining leaves the card discarded
    s.phaseState.marks = []
    hook.onTacticCommandUsed!(ctx, entry, { player: 'A', cardId: C3 })
    const q2 = ctx.state.pending as unknown as ChooseOptionDecision
    expect(q2.context.data.cardId).toBe(C3)
    s.pending = null
    expect(hookService.handler!.handle(ctx, { type: 'pass', player: 'A', decisionId: q2.id } as Action, q2)).toBeUndefined()
    expect(s.cards!.tactics.A.discard).toEqual([C3])
    expect(s.cards!.tactics.A.deck).toEqual([C2, C1])
    // a card that is not in the discard pile (it was scored) is not offered
    s.cards!.tactics.A.discard = []
    hook.onTacticCommandUsed!(ctx, entry, { player: 'A', cardId: C4 })
    expect(s.pending).toBeNull()
  })
})

describe('DOT-RA regiment abilities', () => {
  it('DOT-RA-1 Constant Flux: while underdog an attack on a friendly unit loses 1 Rend (never below 0, Companion weapons too); no change when not underdog or in round 1', () => {
    const base = () => game({ patch: (b) => { b.weapons['fx.w.brute-axe'].abilities = [{ ability: 'COMPANION' }] } })
    const s = base()
    const axe = (st: GameState, target: UnitId): number => {
      const atk = { kind: 'melee', overwatch: false, attackerUnitId: BRUTE, attackerModelId: st.units[BRUTE].models[0], weapon: st.weapons['fx.w.brute-axe'], targetUnitId: target, targetModelId: st.units[target].models[0], range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true }
      return weaponService.effectiveWeapon(st, st.units[BRUTE].models[0], 'fx.w.brute-axe', atk as never).rend
    }
    expect(s.underdog).toBeNull() // round 1: nobody is the underdog
    expect(axe(s, TZ)).toBe(1)
    s.underdog = 'B'
    expect(axe(s, TZ)).toBe(1) // we lead
    s.underdog = 'A'
    expect(axe(s, TZ)).toBe(0) // Companion weapon too
    expect(axe(s, 'B:guard')).toBe(1) // an attack on one of their own units is untouched
    // Rend 0 stays 0; the other regiment ability does nothing here
    const t = game({ reg: RITUAL })
    t.underdog = 'A'
    expect(axe(t, TZ)).toBe(1)
    // through the whole attack sequence: a save of 5 against Rend 1 is a 4 and fails; with the Rend gone it is a 5 and holds
    const u = game()
    u.underdog = 'A'
    centreRow(u, TZ, 0, -4); centreRow(u, BRUTE, 0, -1.2)
    expect(of(attack(u, 'melee', [4, 3, 5], BRUTE, 'fx.w.brute-axe', TZ, 1).events, 'SaveRolled').map((e) => e.saved)).toEqual([true])
    const v = game()
    centreRow(v, TZ, 0, -4); centreRow(v, BRUTE, 0, -1.2)
    expect(of(attack(v, 'melee', [4, 3, 5], BRUTE, 'fx.w.brute-axe', TZ, 1).events, 'SaveRolled').map((e) => e.saved)).toEqual([false])
  })

  it('DOT-RA-2 Arcane Ritualists: +1 to the general\'s casting roll only while it is wholly within 6" of another friendly unit; a double 1 still miscasts; unbind compares to the modified total', () => {
    const s = game({ reg: RITUAL, patch: (b) => { b.datasheets['fx.boss'].keywords = ['HERO', 'INFANTRY', 'WIZARD']; b.datasheets['fx.boss'].wizard = 1 } })
    centreRow(s, SHAMAN, 0, -6)
    centreRow(s, TZ, 12, -9) // more than 6" from the Shaman
    centreRow(s, SKY, 20, -8)
    centreRow(s, BOSS, 6, 4)
    expect(hookService.castingRollBonusFor!(s, SHAMAN)).toBe(0)
    // any other friendly unit will do
    centreRow(s, SKY, 0, -8.6)
    expect(whollyWithinUnit(s, SHAMAN, SKY, 6)).toBe(true)
    expect(hookService.castingRollBonusFor!(s, SHAMAN)).toBe(1)
    expect(hookService.castingRollBonusFor!(s, SKY)).toBe(0) // only the general
    // the general is the one that must be wholly within 6" (F16 reversal): beside the end of a long Tzaangors block it qualifies,
    // although the far Tzaangors are well over 6" from it
    centreRow(s, SKY, 20, -8)
    centreRow(s, TZ, 7, -6)
    expect(whollyWithinUnit(s, SHAMAN, TZ, 6)).toBe(true)
    expect(whollyWithinUnit(s, TZ, SHAMAN, 6)).toBe(false)
    expect(hookService.castingRollBonusFor!(s, SHAMAN)).toBe(1)
    centreRow(s, TZ, 12, -9)
    centreRow(s, SKY, 0, -8.6)
    // 3 + 3 = 6, +1 = 7 against the casting value 7: cast; the enemy Boss rolls 7 to unbind, which does not beat the modified 7
    const ctx = ctxFor(s, [3, 3, 3, 4])
    const r = castingRoll(ctx, { abilityId: AURA, unitId: SHAMAN, player: 'A' }, SHAMAN, 7)
    expect(r.total).toBe(7)
    expect(r.cast).toBe(true)
    expect(r.unbound).toBe(false)
    // an 8 does beat it
    const t = game({ reg: RITUAL, patch: (b) => { b.datasheets['fx.boss'].keywords = ['HERO', 'INFANTRY', 'WIZARD']; b.datasheets['fx.boss'].wizard = 1 } })
    centreRow(t, SHAMAN, 0, -6); centreRow(t, SKY, 0, -8.6); centreRow(t, BOSS, 6, 4)
    expect(unbinders(t, SHAMAN)).toEqual([BOSS])
    const c2 = ctxFor(t, [3, 3, 4, 4])
    expect(castingRoll(c2, { abilityId: AURA, unitId: SHAMAN, player: 'A' }, SHAMAN, 7).unbound).toBe(true)
    // without the regiment ability the same 6 is not enough
    const u = game({ reg: FLUX })
    centreRow(u, SHAMAN, 0, -6); centreRow(u, SKY, 0, -8.6)
    expect(castingRoll(ctxFor(u, [3, 3]), { abilityId: AURA, unitId: SHAMAN, player: 'A' }, SHAMAN, 7).cast).toBe(false)
    // a double 1 is a miscast whatever the bonus
    const v = game({ reg: RITUAL })
    centreRow(v, SHAMAN, 0, -6); centreRow(v, SKY, 0, -8.6)
    const m = castingRoll(ctxFor(v, [1, 1, 2]), { abilityId: AURA, unitId: SHAMAN, player: 'A' }, SHAMAN, 2)
    expect(m.miscast).toBe(true)
    expect(m.cast).toBe(false)
  })
})

describe('DOT-ENH enhancements', () => {
  it('DOT-ENH-1 Predicted Strike: once per battle in the enemy movement phase, a visible friendly unit wholly within 12" and not in combat moves up to D6" without crossing or ending in combat range (FLY too)', () => {
    const base = (): GameState => {
      const s = game({ enh: STRIKE })
      s.phase = 'movement'
      s.activePlayer = 'B'
      centreRow(s, SHAMAN, 0, -6)
      centreRow(s, SKY, -4, -6)
      centreRow(s, TZ, 4, -9) // wholly within 12"
      centreRow(s, GUARD, 12, 8)
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'movement')).toContain(STRIKE_AB)
    s.activePlayer = 'A' // not in your own movement phase
    expect(offered(s, 'A', 'movement')).not.toContain(STRIKE_AB)
    s.activePlayer = 'B'
    // targets: the general's own unit counts; a unit in combat or beyond 12" does not
    expect(targetsOf('tzeentchPredictedStrike', s, SHAMAN, 'A').sort()).toEqual([SHAMAN, SKY, TZ].sort())
    centreRow(s, SKY, 20, -4) // beyond 12"
    centreRow(s, BRUTE, 4, -6.3) // in combat with the Tzaangors (and near the Shaman)
    expect(enemiesInCombat(s, TZ)).toEqual([BRUTE])
    expect(targetsOf('tzeentchPredictedStrike', s, SHAMAN, 'A')).not.toContain(TZ)
    expect(targetsOf('tzeentchPredictedStrike', s, SHAMAN, 'A')).not.toContain(SKY)
    // use: D6 = 4, the Shaman's own unit moves up to 4" and never ends in combat
    const t = base()
    const start = centreOf(t, SKY)
    const ctx = ctxFor(t, [4])
    const r = useOnce(ctx, 'movement', 'A', STRIKE_AB, { target: SKY, pickMode: farthest })
    expect(r.topics).toContain('abilityMode')
    const end = centreOf(t, SKY)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(1)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThanOrEqual(4 + 1e-2)
    expect(losService.unitInCombat(t, SKY)).toBe(false)
    expect(leftOver(ctx)).toEqual([])
    // once per battle
    expect(offered(t, 'A', 'movement')).not.toContain(STRIKE_AB)
    t.round = 3
    expect(offered(t, 'A', 'movement')).not.toContain(STRIKE_AB)
    // a flyer's path still may not cross an enemy combat range (a plain Fly slide would)
    const u = base()
    centreRow(u, SKY, -7, -4)
    put(u, GUARD, 0, -1.3)
    expect(checkSlide(u, SKY, 14, 0, 14, false, { mayNotEndInCombat: true }).ok).toBe(true)
    expect(checkSlide(u, SKY, 14, 0, 14, false, { noCombatPath: true }).ok).toBe(false)
    expect(checkSlide(u, SKY, -3, 0, 12, false, { noCombatPath: true }).ok).toBe(true)
    useOnce(ctxFor(u, [6]), 'movement', 'A', STRIKE_AB, { target: SKY, pickMode: farthest })
    expect(readMoveQueue(u)).toBeNull()
    expect(losService.unitInCombat(u, SKY)).toBe(false)
    // a different enhancement never has it
    const v = game({ enh: MUTAGENIC })
    v.phase = 'movement'; v.activePlayer = 'B'
    expect(offered(v, 'A', 'movement')).not.toContain(STRIKE_AB)
  })

  it('DOT-ENH-2 Fold Reality: casting 6+ sets a friendly unit (not the general) up wholly within 12" of the general and more than 6" from enemies; it counts as set up this turn', () => {
    const base = (): GameState => {
      const s = game({ enh: FOLD })
      centreRow(s, SHAMAN, 0, -6)
      centreRow(s, SKY, -3, -8.5)
      centreRow(s, TZ, 20, -2) // out of range
      centreRow(s, BRUTE, -3, -5.2) // in combat with the Skyfires
      expect(enemiesInCombat(s, SKY)).toEqual([BRUTE])
      centreRow(s, GUARD, 9, 8)
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'hero')).toContain(FOLD_AB)
    // the general cannot pick itself, a unit beyond 12" cannot be picked; a unit in combat can
    expect(targetsOf('tzeentchFoldReality', s, SHAMAN, 'A')).toEqual([SKY])
    const ctx = ctxFor(s, [3, 3])
    const r = useOnce(ctx, 'hero', 'A', FOLD_AB, { target: SKY })
    expect(summaries(ctx).some((t) => t.includes('casting roll 6, cast'))).toBe(true)
    expect(r.topics).toContain('abilityMode') // where it goes
    expect(s.units[SKY].location).toBe('board')
    expect(whollyWithinUnit(s, SKY, SHAMAN, 12)).toBe(true)
    for (const m of unitModels(s, SKY)) for (const e of Object.values(s.models).filter((x) => s.units[x.unitId].player === 'B' && s.units[x.unitId].location === 'board')) expect(horizontalGap(m, e)).toBeGreaterThan(6)
    expect(losService.unitInCombat(s, SKY)).toBe(false)
    expect(s.units[SKY].setUpTurn).toEqual({ round: 1, player: 'A' }) // CORE-6.13
    // a casting roll of 5: nothing happens and the attempt is spent
    const t = base()
    const before = unitModels(t, SKY).map((m) => ({ ...m.pos }))
    const c2 = ctxFor(t, [2, 3])
    useOnce(c2, 'hero', 'A', FOLD_AB, { target: SKY })
    expect(summaries(c2).some((x) => x.includes('casting roll 5, not cast'))).toBe(true)
    expect(unitModels(t, SKY).map((m) => ({ ...m.pos }))).toEqual(before)
    expect(t.units[SKY].setUpTurn).toBeNull()
    expect(canCast(t, SHAMAN)).toBe(false)
  })

  it('DOT-ENH-3 Infernal Gateway: casting 5+ rolls max(3, discard pile size) dice, 1 mortal per 4+ on a visible enemy within 18"', () => {
    const base = (): GameState => {
      const s = game({ enh: GATEWAY })
      centreRow(s, SHAMAN, 0, -6)
      centreRow(s, BRUTE, 0, 8) // 14" away
      put(s, GUARD, 0, 10.6) // 16.6" away: also in range
      return s
    }
    const s = base()
    expect(targetsOf('tzeentchInfernalGateway', s, SHAMAN, 'A')).toContain(BRUTE)
    const hp = wounds(s, BRUTE)
    // casting 2 + 3 = 5; three dice: 4, 3, 6 -> two mortal damage
    const ctx = ctxFor(s, [2, 3, 4, 3, 6])
    useOnce(ctx, 'hero', 'A', GATEWAY_AB, { target: BRUTE })
    expect(wounds(s, BRUTE)).toBe(hp - 2)
    expect(leftOver(ctx)).toEqual([])
    // casting 4: nothing
    const t = base()
    const c2 = ctxFor(t, [2, 2])
    useOnce(c2, 'hero', 'A', GATEWAY_AB, { target: BRUTE })
    expect(wounds(t, BRUTE)).toBe(hp)
    // five cards in the discard pile: five dice
    const u = base()
    cardsOf(u).tactics.A.discard = [C1, C2, C3, C4, 'card.tactic.do-not-waver']
    const c3 = ctxFor(u, [3, 3, 4, 4, 4, 4, 1])
    useOnce(c3, 'hero', 'A', GATEWAY_AB, { target: BRUTE })
    expect(wounds(u, BRUTE)).toBe(hp - 4)
    expect(leftOver(c3)).toEqual([])
    // more than 18" away or hidden: not a target
    put(u, GUARD, 6, 14)
    expect(targetsOf('tzeentchInfernalGateway', u, SHAMAN, 'A')).not.toContain(GUARD)
  })

  it('DOT-ENH-4 Mutagenic Sorcery: end of any turn, D3; on 2+ that much mortal damage to the enemy and 1 Tzaangor returned; needs the Tzaangors in combat with a visible enemy within 12" of the general', () => {
    const base = (): GameState => {
      const s = game({ enh: MUTAGENIC })
      centreRow(s, TZ, 0, -9.5)
      slay(s, TZ, 2)
      put(s, BRUTE, -5.24, -9.5) // 1" off the left end of the block, so the Tzaangors are in combat with it
      centreRow(s, SHAMAN, 4, -6)
      return s
    }
    const s = base()
    expect(enemiesInCombat(s, TZ)).toEqual([BRUTE])
    expect(unitModels(s, TZ)).toHaveLength(8)
    expect(returnableModels(s, TZ)).toBe(2)
    expect(offered(s, 'A', 'endOfTurn')).toContain(MUTAGENIC_AB)
    s.activePlayer = 'B' // any turn
    expect(offered(s, 'A', 'endOfTurn')).toContain(MUTAGENIC_AB)
    s.activePlayer = 'A'
    const hp = wounds(s, BRUTE)
    const ctx = ctxFor(s, [4]) // face 4 = 2 on a D3
    useOnce(ctx, 'endOfTurn', 'A', MUTAGENIC_AB)
    expect(wounds(s, BRUTE)).toBe(hp - 2)
    expect(unitModels(s, TZ)).toHaveLength(9) // one slain Tzaangor came back
    expect(returnableModels(s, TZ)).toBe(1)
    expect(leftOver(ctx)).toEqual([])
    // once per turn
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(MUTAGENIC_AB)
    // a 1 on the D3: nothing
    const t = base()
    const c2 = ctxFor(t, [2])
    useOnce(c2, 'endOfTurn', 'A', MUTAGENIC_AB)
    expect(wounds(t, BRUTE)).toBe(hp)
    expect(unitModels(t, TZ)).toHaveLength(8)
    // the Tzaangors not in combat with it: not a target
    const u = base()
    put(u, BRUTE, 0, -2)
    expect(targetsOf('tzeentchMutagenicSorcery', u, SHAMAN, 'A')).toEqual([])
    // the target beyond 12" of the general: not a target
    const v = base()
    centreRow(v, SHAMAN, 20, -6)
    expect(targetsOf('tzeentchMutagenicSorcery', v, SHAMAN, 'A')).toEqual([])
    // no slain model: the mortal damage lands, nothing returns
    const w = base()
    w.units[TZ].destroyedModels = []
    expect(returnableModels(w, TZ)).toBe(0)
    useOnce(ctxFor(w, [4]), 'endOfTurn', 'A', MUTAGENIC_AB)
    expect(wounds(w, BRUTE)).toBe(hp - 2)
    expect(unitModels(w, TZ)).toHaveLength(8)
  })
})

describe('DOT-AB warscroll abilities', () => {
  const wizardEnemy = (b: DataBundle): void => { b.datasheets['fx.boss'].keywords = ['HERO', 'INFANTRY', 'WIZARD']; b.datasheets['fx.boss'].wizard = 1 }

  it('DOT-AB-1 Mutative Aura: casting 7+; until your next turn each unmodified hit 1 on the target\'s combat attacks deals it 1 mortal damage after its Fight; shooting 1s do not count', () => {
    const base = (): GameState => {
      const s = game({
        patch: (b) => {
          b.weapons['fx.w.test-bow'] = { id: 'fx.w.test-bow', name: 'Bow', type: 'ranged', range: 24, A: 3, skill: 4, wound: 4, rend: 0, D: 1, abilities: [] }
          b.datasheets['fx.guard'].composition[0].weapons.default = ['fx.w.guard-spear', 'fx.w.test-bow']
        },
      })
      centreRow(s, SHAMAN, 0, -6)
      centreRow(s, TZ, 0, -4)
      centreRow(s, BRUTE, 0, -1.4) // in combat with the Tzaangors, 4.6" from the Shaman
      centreRow(s, GUARD, 8, 6)
      return s
    }
    const s = base()
    expect(targetsOf('tzeentchMutativeAura', s, SHAMAN, 'A')).toContain(BRUTE)
    const ctx = ctxFor(s, [4, 3]) // casting 7
    useOnce(ctx, 'hero', 'A', AURA, { target: BRUTE })
    expect(summaries(ctx).some((t) => t.includes('casting roll 7, cast'))).toBe(true)
    expect(s.units[BRUTE].effects.some((e) => e.sourceAbilityId === AURA)).toBe(true)
    // the Brutes swing: two attacks hit-roll a 1 -> two mortal damage once the Fight is over, not before
    const hp = wounds(s, BRUTE)
    const sw = attack(s, 'melee', [1, 1, 4, 3, 3], BRUTE, 'fx.w.brute-axe', TZ, 3)
    expect(wounds(s, BRUTE)).toBe(hp)
    expect(pendingAfterFightMortal(s)).toEqual([{ targetUnitId: BRUTE, count: 2, source: AURA, player: 'A' }])
    drainAfterFightMortal(sw.ctx)
    expect(wounds(s, BRUTE)).toBe(hp - 2)
    expect(pendingAfterFightMortal(s)).toEqual([])
    // no 1s: nothing is held
    const t = base()
    useOnce(ctxFor(t, [4, 3]), 'hero', 'A', AURA, { target: BRUTE })
    attack(t, 'melee', [2, 4, 4, 3, 3], BRUTE, 'fx.w.brute-axe', TZ, 2)
    expect(pendingAfterFightMortal(t)).toEqual([])
    // a shooting attack with a 1 does not count
    const u = base()
    useOnce(ctxFor(u, [4, 3]), 'hero', 'A', AURA, { target: GUARD })
    attack(u, 'ranged', [1, 1, 1, 4], GUARD, 'fx.w.test-bow', TZ, 3)
    expect(pendingAfterFightMortal(u)).toEqual([])
    // the aura sits on the target only: another unit's 1s do nothing
    const v = base()
    useOnce(ctxFor(v, [4, 3]), 'hero', 'A', AURA, { target: GUARD })
    attack(v, 'melee', [1, 4, 3, 3], BRUTE, 'fx.w.brute-axe', TZ, 1)
    expect(pendingAfterFightMortal(v)).toEqual([])
    // a casting roll of 6 is not enough; nothing is placed
    const w = base()
    useOnce(ctxFor(w, [3, 3]), 'hero', 'A', AURA, { target: BRUTE })
    expect(w.units[BRUTE].effects.some((e) => e.sourceAbilityId === AURA)).toBe(false)
    // it lasts until the start of the CASTER's next turn: the enemy's own turn start does not remove it
    const x = base()
    const c = ctxFor(x, [4, 3])
    useOnce(c, 'hero', 'A', AURA, { target: BRUTE })
    effectService.expire(c, 'nextOwnTurn', 'B')
    expect(x.units[BRUTE].effects.some((e) => e.sourceAbilityId === AURA)).toBe(true)
    effectService.expire(c, 'nextOwnTurn', 'A')
    expect(x.units[BRUTE].effects.some((e) => e.sourceAbilityId === AURA)).toBe(false)
    // the target can be unbound
    const y = game({ patch: wizardEnemy })
    centreRow(y, SHAMAN, 0, -6); centreRow(y, BRUTE, 0, 4); centreRow(y, BOSS, 8, 8)
    const c3 = ctxFor(y, [4, 3, 6, 6])
    useOnce(c3, 'hero', 'A', AURA, { target: BRUTE })
    expect(summaries(c3).some((t) => t.includes('unbound'))).toBe(true)
    expect(y.units[BRUTE].effects.some((e) => e.sourceAbilityId === AURA)).toBe(false)
  })

  it('DOT-AB-2 Deliver on Fate: +1 to the Enlightened\'s charge roll only while underdog', () => {
    const s = game()
    s.units[ENL].location = 'board'
    const chargeMod = (st: GameState, unitId: UnitId): number => {
      const ctx = ctxFor(st, [3, 3])
      const roll = ctx.roll({ purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId })
      return hookService.collect(ctx, 'onChargeRoll', { chargingUnitId: unitId, targetUnitIds: [], roll: { purpose: 'charge', roll, dieIndex: 0, unmodified: 6, rerolled: false } } as never)
        .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
    }
    expect(chargeMod(s, ENL)).toBe(0) // round 1: no underdog
    s.underdog = 'B'
    expect(chargeMod(s, ENL)).toBe(0)
    s.underdog = 'A'
    expect(chargeMod(s, ENL)).toBe(1)
    expect(chargeMod(s, SKY)).toBe(0) // only the Enlightened
    expect(chargeMod(s, TZ)).toBe(0)
  })

  it('DOT-AB-3 Destined Quarry: only an enemy the Skyfires damaged this phase may be picked; friendly combat attacks on it get +1 to hit for the rest of the turn; shooting attacks do not', () => {
    const base = (): GameState => {
      const s = game()
      s.phase = 'shooting'
      centreRow(s, SKY, 0, -6)
      centreRow(s, BRUTE, 0, 6)
      centreRow(s, GUARD, 8, 6)
      centreRow(s, TZ, 0, 1)
      return s
    }
    const s = base()
    expect(offered(s, 'A', 'shooting')).not.toContain(QUARRY) // nothing shot yet
    // one Skyfire shoots the Brutes: 2 attacks, the hit and wound rolls succeed, the saves fail
    attack(s, 'ranged', [4, 4, 4, 4, 1, 1], SKY, W('arrow-of-fate'), BRUTE, null)
    expect(damagedByShootingThisPhase(s, SKY)).toEqual([BRUTE])
    expect(targetsOf('tzeentchDestinedQuarry', s, SKY, 'A')).toEqual([BRUTE])
    expect(offered(s, 'A', 'shooting')).toContain(QUARRY)
    const ctx = ctxFor(s)
    useOnce(ctx, 'shooting', 'A', QUARRY)
    expect(rollModifier(s, 'onHitRoll', 'melee', TZ, BRUTE, W('savage-blades'))).toBe(1)
    expect(rollModifier(s, 'onHitRoll', 'melee', SKY, BRUTE, W('bow-stave'))).toBe(1)
    expect(rollModifier(s, 'onHitRoll', 'melee', TZ, GUARD, W('savage-blades'))).toBe(0) // another target
    expect(rollModifier(s, 'onHitRoll', 'ranged', SKY, BRUTE, W('arrow-of-fate'))).toBe(0) // shooting does not
    expect(rollModifier(s, 'onHitRoll', 'melee', BRUTE, TZ, 'fx.w.brute-axe')).toBe(0) // their attacks do not
    // the Companion weapon is a hit-roll modifier, which Companion weapons do take
    expect(rollModifier(s, 'onHitRoll', 'melee', SKY, BRUTE, W('discs-teeth-and-horns'))).toBe(1)
    // until the end of the turn
    effectService.expire(ctx, 'turnEnd', null)
    expect(rollModifier(s, 'onHitRoll', 'melee', TZ, BRUTE, W('savage-blades'))).toBe(0)
    // a unit the Skyfires did not damage cannot be picked
    expect(targetsOf('tzeentchDestinedQuarry', base(), SKY, 'A')).toEqual([])
  })

  it('DOT-AB-4 Eldritch Raiders: +1 to wound only while every Tzaangor is wholly within enemy territory', () => {
    const s = game()
    const wound = (st: GameState): number => rollModifier(st, 'onWoundRoll', 'melee', TZ, BRUTE, W('savage-blades'))
    centreRow(s, TZ, 0, -6)
    centreRow(s, BRUTE, 0, -2)
    expect(wound(s)).toBe(0) // own territory
    // fixture territory B: z in [0, 11]. Every model wholly across the line
    centreRow(s, TZ, 0, 4)
    centreRow(s, BRUTE, 0, 8)
    expect(wound(s)).toBe(1)
    // one model astride the dividing line is not wholly within
    unitModels(s, TZ)[0].pos = { x: -9, y: 0, z: 0.2 }
    expect(wound(s)).toBe(0)
    // other units do not have it
    centreRow(s, SKY, 0, 4)
    expect(rollModifier(s, 'onWoundRoll', 'melee', SKY, BRUTE, W('bow-stave'))).toBe(0)
  })
})

describe('DOT-MAG spells', () => {
  it('DOT-MAG-1 the Shaman attempts at most one spell per hero phase (Mutative Aura or the enhancement spell) and may unbind one enemy spell', () => {
    const s = game({ enh: GATEWAY })
    centreRow(s, SHAMAN, 0, -6)
    centreRow(s, BRUTE, 0, 4)
    expect(offered(s, 'A', 'hero')).toEqual(expect.arrayContaining([AURA, GATEWAY_AB]))
    useOnce(ctxFor(s, [2, 2]), 'hero', 'A', AURA, { target: BRUTE }) // a failed attempt still spends the cast
    expect(offered(s, 'A', 'hero')).not.toContain(AURA)
    expect(offered(s, 'A', 'hero')).not.toContain(GATEWAY_AB)
    // and the other way round
    const t = game({ enh: GATEWAY })
    centreRow(t, SHAMAN, 0, -6); centreRow(t, BRUTE, 0, 4)
    useOnce(ctxFor(t, [2, 2]), 'hero', 'A', GATEWAY_AB, { target: BRUTE })
    expect(offered(t, 'A', 'hero')).not.toContain(AURA)
    // the Shaman unbinds an enemy spell: one per enemy hero phase
    const u = game()
    centreRow(u, SHAMAN, 0, -6); centreRow(u, BOSS, 8, 4)
    expect(unbinders(u, BOSS)).toEqual([SHAMAN])
    u.phaseState.marks.push(`magic:unbind:${SHAMAN}`)
    expect(unbinders(u, BOSS)).toEqual([])
  })
})

describe('DOT-ENG engine mechanisms as the Warflock uses them', () => {
  it('DOT-ENG-C1 the casting roll bonus raises the casting total, not the miscast check', () => {
    const s = game({ reg: RITUAL })
    centreRow(s, SHAMAN, 0, -6); centreRow(s, SKY, 0, -8.6)
    const ctx = ctxFor(s, [3, 3])
    const r = castingRoll(ctx, { abilityId: AURA, unitId: SHAMAN, player: 'A' }, SHAMAN, 7)
    expect(r.cast).toBe(true)
    expect(summaries(ctx).some((x) => /6\+1 = 7/.test(x))).toBe(true)
  })

  it('DOT-ENG-C2 territory / edgeWithin arrival params come from the shipped Fated Arrival descriptor', () => {
    const s = game()
    expect(s.abilities[FATED].params).toMatchObject({ fromRound: 2, minEnemyDistance: 6, anywhere: false, territory: true, edgeWithin: 1 })
    s.phase = 'movement'; s.round = 2
    centreRow(s, BOSS, 8, 8)
    const ctx = ctxFor(s)
    const p = toArrival(ctx) as PendingDecision
    expect(p.kind).toBe('deployUnit')
    // the AI-facing candidates: legal packed formations along the edges of the territory
    const legal = movementModule.legalActions?.(s, p) ?? []
    expect(legal.length).toBeGreaterThan(0)
    for (const a of legal) expect(movementModule.validate?.(s, a, p)).toBeNull()
  })

  it('DOT-ENG-C3 afterAttackSequence reports the hit-roll 1s of a combat attack to Mutative Aura (see DOT-AB-1)', () => {
    const s = game()
    centreRow(s, SHAMAN, 0, -6); centreRow(s, TZ, 0, -4); centreRow(s, BRUTE, 0, -1.4)
    useOnce(ctxFor(s, [4, 3]), 'hero', 'A', AURA, { target: BRUTE })
    attack(s, 'melee', [1, 4, 3, 3], BRUTE, 'fx.w.brute-axe', TZ, 1)
    expect(pendingAfterFightMortal(s).map((d) => d.count)).toEqual([1])
  })

  it('DOT-ENG-C4 onTacticCommandUsed fires once after the command resolves and returnTacticToDeckBottom moves the card (see DOT-BT-4)', () => {
    const { s, ctx } = cardGame()
    useCommand(ctx, C1)
    expect((s.pending as ChooseOptionDecision).context.data.code).toBe('tzeentchCheatDestiny')
    // the window does not ask again for the same command
    const q = s.pending as ChooseOptionDecision
    s.pending = null
    hookService.handler!.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: q.id, optionId: `bottom:${C1}` } as Action, q)
    expect(s.cards!.tactics.A.deck).toEqual([C2, C1])
    expect(commandWindow(ctx, 'hero', 'A')).toBe(false)
    expect(s.pending).toBeNull()
  })
})

describe('DOT-AI hints', () => {
  it('DOT-AI-1 timing and target hints: the enhancement spell beats Mutative Aura only when it kills or rescues; Predicted Strike is saved for an objective grab; Predict the Future needs a deck', () => {
    const s = game({ enh: GATEWAY })
    for (const id of [GUARD, BOSS, 'B:hawk']) s.units[id].location = 'reserves' // only the Brutes are on the table
    centreRow(s, SHAMAN, 0, -6)
    centreRow(s, BRUTE, 0, 4)
    cardsOf(s).tactics.A.deck = [C1]
    expect(tzeentchAbilityTiming(s, 'A', 'tzeentchPredictTheFuture', null)).toBe(0)
    cardsOf(s).tactics.A.deck = []
    expect(tzeentchAbilityTiming(s, 'A', 'tzeentchPredictTheFuture', null)).toBeLessThan(-2)
    // Gateway 0.9 baseline, +1 against a unit it can finish; Aura 0.3
    const base = tzeentchAbilityTiming(s, 'A', 'tzeentchInfernalGateway', SHAMAN)!
    expect(base).toBeGreaterThan(tzeentchAbilityTiming(s, 'A', 'tzeentchMutativeAura', SHAMAN)!)
    unitModels(s, BRUTE).slice(1).forEach((m) => { m.woundsRemaining = 1 })
    expect(tzeentchAbilityTiming(s, 'A', 'tzeentchInfernalGateway', SHAMAN)!).toBeGreaterThan(base)
    // Fold Reality only to rescue a unit that is losing its fight
    expect(tzeentchAbilityTiming(s, 'A', 'tzeentchFoldReality', SHAMAN)!).toBeLessThan(-2)
    // unknown codes and units: no opinion
    expect(tzeentchAbilityTiming(s, 'A', 'nope', null)).toBeNull()
    expect(tzeentchTargetBonus(s, 'A', 'nope', BRUTE)).toBeNull()
    expect(tzeentchTargetBonus(s, 'A', 'tzeentchInfernalGateway', BRUTE)).toBeGreaterThan(0)
  })
})
