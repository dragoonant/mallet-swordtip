// Ogor Mawtribes (Warglutt Marauders) code hooks: docs/spec/factions/ogor-mawtribes.md, test ids OGM-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/ogors files on top of the AoS fixture bundle
// (player A = Warglutt Marauders, player B = the fixture Chaos army: Boss, Brutes, Hawk, Guard). Dice are scripted; nothing here patches
// the shipped data except where a test says so (a Ward on an enemy unit).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, removeModel, unitModels,
  type AbilityWindow, type Action, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PendingDecision, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { horizontalGap } from '../../src/engine/geometry'
import { objectiveService } from '../../src/engine/objectives'
import { movementModule } from '../../src/engine/phases/movement'
import { terrainService } from '../../src/engine/terrain'
import { checkSlide, readMoveQueue } from '../../src/engine/factions/aos-moves'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { ogorsAbilityTiming, ogorsModeBonus, ogorsTargetBonus } from '../../src/engine/factions/ogors'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/ogors/abilities.json'
import enhancementsJson from '../../src/data/factions/ogors/enhancements.json'
import weaponsJson from '../../src/data/factions/ogors/weapons.json'
import factionJson from '../../src/data/factions/ogors/faction.json'
import patrolJson from '../../src/data/factions/ogors/patrols/warglutt-marauders.json'
import tyrantJson from '../../src/data/factions/ogors/datasheets/tyrant.json'
import gluttonsJson from '../../src/data/factions/ogors/datasheets/gluttons.json'
import ironugtsJson from '../../src/data/factions/ogors/datasheets/ironguts.json'
import maulbeastJson from '../../src/data/factions/ogors/datasheets/maulbeast-cavalry.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  // cloned: a test that patches the data must not leak into the next one
  for (const a of structuredClone(abilitiesJson) as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of structuredClone(weaponsJson) as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of structuredClone([tyrantJson, gluttonsJson, ironugtsJson, maulbeastJson].flat()) as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of structuredClone(enhancementsJson) as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.ogors = structuredClone(factionJson) as unknown as FactionData
  b.patrols[patrolJson.id] = structuredClone(patrolJson) as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const ARMY = 'ogors.army.warglutt-marauders'
const NOMADIC = 'ogors.ability.nomadic-warriors'
const MORE = 'ogors.ability.more-ogors-my-lord'
const SCOFF = 'ogors.ability.scoff-down-fresh-flesh'
const BARGING = 'ogors.ability.brutish-barging'
const DUST = 'ogors.ability.blinding-dust-clouds'
const WARLORD = 'ogors.ability.roaring-warlord'
const MEAT = 'ogors.ability.wall-of-meat'
const STOMP = 'ogors.ability.stomping-marauders'
const GORE = 'ogors.ability.shock-and-gore'
const WALLWRECKER = 'ogors.enh.wallwrecker'
const LUNGBURSTER = 'ogors.enh.lungburster'
const DEATHCHEATER = 'ogors.enh.deathcheater'
const GRISTLE = 'ogors.enh.gristlegobbler'
const GRISTLE_AB = 'ogors.ability.gristlegobbler'

const TYRANT = 'A:tyrant'
const GLUT2 = 'A:gluttons-2'
const GLUT3 = 'A:gluttons-3'
const IRON = 'A:ironguts'
const MB1 = 'A:maulbeast-1'
const MB2 = 'A:maulbeast-2'
const BOSS = 'B:boss'
const BRUTE = 'B:brute'
const HAWK = 'B:hawk'
const GUARD = 'B:guard'

const W = (id: string) => `ogors.weapon.${id}`

// lay a unit's models in a tight row centred on (cx, cz); 7+ models go in two rows
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

const trim = (s: GameState, unitId: UnitId, n: number): void => {
  for (const id of [...s.units[unitId].models].slice(n)) { delete s.models[id]; s.units[unitId].models = s.units[unitId].models.filter((m) => m !== id) }
}

const gapBetween = (s: GameState, a: UnitId, b: UnitId): number =>
  Math.min(...unitModels(s, a).flatMap((m) => unitModels(s, b).map((o) => horizontalGap(m, o))))

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void; terrain?: string } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'ogors', patrolId: ARMY, enhancementId: opts.enh ?? GRISTLE, regimentAbilityId: opts.reg ?? DUST }),
      B: makeAosPlayer('B'),
    },
    ...(opts.terrain ? { terrainLayoutId: opts.terrain } : {}),
  }, bundle(opts.patch))
  // bystanders go along the back edges, two rows each, clear of the middle where the tests work (the reserves stay off the board)
  for (const p of ['A', 'B'] as const) {
    const sign = p === 'A' ? -1 : 1
    let x = -14.5, row = 0
    for (const u of Object.values(s.units).filter((u) => u.player === p && !u.reserveArrival)) {
      const width = u.models.length * (2 * Math.max(...unitModels(s, u.id).map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0))) + 0.3)
      if (x + width > 14.5) { x = -14.5; row = 1 }
      place(s, u.id, x, sign * (10.2 - 1.9 * row), 0.3)
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
    const rej = abilityService.handler.handle(ctx, action as Action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

// use one ability once; every other offer is declined. `mode` picks an abilityMode option by id (default: the first)
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

// Scoff Down used for a list of (unit, upgrade) pairs in one End of Turn window; everything else is declined
function scoffPlan(ctx: EngineContext, player: PlayerId, plan: [UnitId, string][]) {
  let next = 0
  return runWindow(ctx, 'endOfTurn', player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = next < plan.length ? ids.find((id) => id.startsWith(SCOFF)) : undefined
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return plan[next][0]
    if (topic === 'abilityMode') { const m = plan[next][1]; next += 1; return m }
    return ids[0]
  })
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const targetsOf = (code: string, s: GameState, unitId: UnitId | null, player: PlayerId): UnitId[] =>
  (codeHooks[code].activate!.targets as unknown as (state: GameState, unitId: UnitId | null, player: PlayerId) => UnitId[])(s, unitId, player)
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const farthest = (ids: string[]): string => {
  const far = (id: string): number => { const [, dx, dz] = id.split(':'); return Math.hypot(Number(dx), Number(dz)) }
  return [...ids].sort((a, b) => far(b) - far(a))[0]
}
const log = (s: GameState, destroyed: UnitId[], fought: UnitId[]): void => { s.cards!.turnLog = { destroyed, fought } }

// the sum of modifiers the roll hooks give an attack by `attackerUnitId` against `targetUnitId`
function rollModifier(s: GameState, hook: 'onHitRoll' | 'onWoundRoll', kind: 'melee' | 'ranged', attackerUnitId: UnitId, targetUnitId: UnitId, weaponId: string): number {
  const ctx = ctxFor(s, [3])
  const atk = {
    kind, overwatch: false, attackerUnitId, attackerModelId: s.units[attackerUnitId].models[0], weapon: { ...s.weapons[weaponId], kind }, targetUnitId, targetModelId: s.units[targetUnitId].models[0],
    range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: kind === 'melee',
  }
  const purpose = hook === 'onHitRoll' ? 'hit' : 'wound'
  const roll = ctx.roll({ purpose, player: s.units[attackerUnitId].player, unitId: attackerUnitId })
  return hookService.collect(ctx, hook, { attack: atk, roll: { purpose, roll, dieIndex: 0, unmodified: roll.dice[0], rerolled: false } } as never)
    .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
}

function attack(s: GameState, dice: number[], attackerUnitId: UnitId, weaponId: string, targetUnitId: UnitId, attacks: number | null) {
  s.phase = 'fight'
  const modelId = s.units[attackerUnitId].models.find((id) => s.models[id].weapons.includes(weaponId))!
  const target: DeclaredTarget = { modelId, weaponId, targetUnitId, profileGroup: null, attacks }
  const { ctx, events } = createContext(s, new ScriptedRng(dice), DEFAULT_MODULES)
  attackService.begin(ctx, { kind: 'melee', attackerUnitId, overwatch: false, targets: [target] })
  expect(attackService.advance(ctx)).toBe('done')
  return { events, ctx }
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

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('OGM-REG every code in the Ogors data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('OGM-ARMY-1 the army builds in the engine: Tyrant general, 2 + 3 Gluttons, 3 Ironguts, 2 Maulbeast Cavalry; 11 models, stats as printed', () => {
    const s = game({ enh: DEATHCHEATER, reg: BARGING })
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(6)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(11)
    expect(s.players.A.warlordUnitId).toBe(TYRANT)
    expect(s.players.A.battleTraitIds).toEqual([NOMADIC, SCOFF])
    expect(s.players.A.regimentAbilityId).toBe(BARGING)
    expect(s.units[TYRANT].enhancementId).toBe(DEATHCHEATER)
    const st = (id: string) => s.datasheets[`ogors.unit.${id}`].stats
    expect(st('tyrant')).toMatchObject({ M: 6, W: 8, Sv: 4, OC: 3 })
    expect(st('gluttons')).toMatchObject({ M: 6, W: 4, Sv: 5, OC: 2 })
    expect(st('ironguts')).toMatchObject({ M: 6, W: 4, Sv: 4, OC: 2 })
    expect(st('maulbeast-cavalry')).toMatchObject({ M: 10, W: 7, Sv: 3, OC: 3 })
    for (const id of ['tyrant', 'gluttons', 'ironguts', 'maulbeast-cavalry']) expect(s.datasheets[`ogors.unit.${id}`].stats.ward ?? null, id).toBeNull()
    expect(s.datasheets['ogors.unit.tyrant'].keywords).toEqual(['HERO', 'INFANTRY'])
    expect(s.datasheets['ogors.unit.maulbeast-cavalry'].keywords).toEqual(['CAVALRY'])
  })

  it('OGM-ARMY-2 no unit has Reinforcements: a destroyed unit is never offered for Call for Reinforcements', () => {
    const s = game()
    for (const u of Object.values(s.units).filter((x) => x.player === 'A')) expect(s.datasheets[u.datasheetId].keywords).not.toContain('REINFORCEMENTS')
    for (const id of [TYRANT, GLUT2, GLUT3, IRON, MB1, MB2]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A')).toEqual([])
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).not.toContain('core.ability.call-for-reinforcements')
  })

  it('OGM-WEAP-1 Maulbeast\'s Horns and Fangs is a Companion weapon (a friendly +1 to hit skips it); every weapon in the army is melee', () => {
    const s = game()
    for (const u of Object.values(s.units).filter((x) => x.player === 'A')) {
      for (const m of unitModels(s, u.id)) for (const w of m.weapons) expect(s.weapons[w].kind, w).toBe('melee')
    }
    expect(s.weapons[W('maulbeast-horns-and-fangs')].abilities.map((a) => a.ability)).toEqual(['COMPANION'])
    expect(s.weapons[W('gutbiter-weapons')].abilities).toEqual([])
    // +1 to hit without affectsCompanion: the Gutbiter Weapons hit on a 3, the Horns and Fangs do not
    s.units[MB1].effects.push({ id: 'e1', sourceAbilityId: 'x', sourceUnitId: MB1, effect: { modifyRoll: { roll: 'hit', value: 1 } }, scope: { who: 'self' }, expires: { kind: 'battle', round: 1, player: null }, when: null })
    place(s, MB1, -4, -4); place(s, BOSS, -4, -1)
    s.phase = 'fight'
    const modelId = s.units[MB1].models[0]
    const targets: DeclaredTarget[] = [W('gutbiter-weapons'), W('maulbeast-horns-and-fangs')].map((weaponId) => ({ modelId, weaponId, targetUnitId: BOSS, profileGroup: null, attacks: 1 }))
    const { ctx, events } = createContext(s, new ScriptedRng([3, 1, 3, 1, 1, 1]), DEFAULT_MODULES)
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: MB1, overwatch: false, targets })
    attackService.advance(ctx)
    expect(of(events, 'HitRolled').map((h) => h.hit)).toEqual([true, false])
  })
})

describe('OGM-BT battle traits', () => {
  it('OGM-BT-1 Nomadic Warriors: the 3-model Gluttons and one Maulbeast start in reserve; More Ogors is not offered before battle round 3', () => {
    const s = game()
    expect(s.units[GLUT3].location).toBe('reserves')
    expect(s.units[MB2].location).toBe('reserves')
    expect(s.units[GLUT3].reserveArrival).toBe(MORE)
    expect(s.units[MB2].reserveArrival).toBe(MORE)
    for (const id of [TYRANT, GLUT2, IRON, MB1]) expect(s.units[id].location, id).toBe('board')
    expect(Object.values(s.units).filter((u) => u.player === 'A' && u.reserveArrival).map((u) => u.id).sort()).toEqual([GLUT3, MB2])
    // reserves are not destroyed at round 4 either (core 24.1: a battle trait, not a Deploy ability)
    expect(s.units[GLUT3].reserveVia?.deploy ?? false).toBe(false)
    // rounds 1 and 2: nothing; round 3, the opponent's turn: nothing
    for (const round of [1, 2]) {
      const t = game()
      t.phase = 'movement'; t.round = round
      expect(toArrival(ctxFor(t))).toBeNull()
      expect(t.units[GLUT3].location).toBe('reserves')
    }
    const o = game()
    o.phase = 'movement'; o.round = 3; o.activePlayer = 'B'
    expect(toArrival(ctxFor(o))).toBeNull()
    // round 3, your turn: a set-up decision for one of the two reserve units
    const r = game()
    r.phase = 'movement'; r.round = 3
    const p = toArrival(ctxFor(r))
    expect(p?.kind).toBe('deployUnit')
    expect([GLUT3, MB2]).toContain((p as Extract<PendingDecision, { kind: 'deployUnit' }>).context.unitIds[0])
  })

  it('OGM-BT-2 More Ogors, My Lord!: every model within 1" of a battlefield edge (any edge, either territory) and more than 6" from every enemy', () => {
    const t = game()
    t.phase = 'movement'; t.round = 3
    // the enemy keeps to the far side of the board
    centreRow(t, BOSS, 8, 8); centreRow(t, BRUTE, 11, 7.5); centreRow(t, HAWK, 12, 9); centreRow(t, GUARD, 3, 9)
    // the rest of the army stands mid-board, off the edges
    ;[TYRANT, GLUT2, IRON, MB1].forEach((id, i) => centreRow(t, id, -9 + i * 5, -5))
    centreRow(t, MB2, 9, -8) // the Maulbeast is on the board already: the 3 Gluttons are the unit that arrives
    const ctx = ctxFor(t)
    const p = toArrival(ctx) as Extract<PendingDecision, { kind: 'deployUnit' }>
    const unitId = p.context.unitIds[0]
    const models = t.units[unitId].models
    const radius = Math.max(...unitModels(t, unitId).map((m) => m.base.radius))
    const step = 2 * radius + 0.15
    // a column of the unit's bases along an edge (x = -14.0 is 0.2" from the left edge once the base radius is counted)
    const column = (x: number, z0: number, skip?: (i: number) => { x?: number; z?: number }): Action => ({
      type: 'deployUnit', player: 'A', decisionId: p.id, unitId,
      placements: models.map((id, i) => ({ modelId: id, pos: { x: skip?.(i).x ?? x, y: 0, z: skip?.(i).z ?? z0 + i * step }, facing: 0 })),
    } as unknown as Action)
    const row = (z: number, x0: number): Action => ({
      type: 'deployUnit', player: 'A', decisionId: p.id, unitId,
      placements: models.map((id, i) => ({ modelId: id, pos: { x: x0 + i * step, y: 0, z }, facing: 0 })),
    } as unknown as Action)
    const edgeX = -15 + radius + 0.2
    expect(movementModule.validate?.(t, column(edgeX, -6), p)).toBeNull() // own territory, left edge
    expect(movementModule.validate?.(t, column(edgeX, 2), p)).toBeNull() // the enemy's territory is fine too
    expect(movementModule.validate?.(t, column(15 - radius - 0.2, -6), p)).toBeNull() // right edge
    expect(movementModule.validate?.(t, row(-11 + radius + 0.2, -4), p)).toBeNull() // top edge
    // the middle of the board touches no edge
    expect(movementModule.validate?.(t, column(-11.5, -6), p)?.code).toBe('E_OUT_OF_RANGE')
    // one model off the edge is too many (Tzeentch's Fated Arrival would allow it)
    if (models.length > 1) expect(movementModule.validate?.(t, column(edgeX, -6, (i) => (i === models.length - 1 ? { x: edgeX + 1, z: -6 + (i - 1) * step + Math.sqrt((step + 0.05) ** 2 - 1) } : {})), p)?.code).toBe('E_OUT_OF_RANGE')
    // within 6" of an enemy unit
    centreRow(t, HAWK, -14, -0.5)
    expect(movementModule.validate?.(t, column(edgeX, -6), p)).not.toBeNull()
    centreRow(t, HAWK, 12, 9)
    // a legal set-up is accepted and the unit is on the board, set up this turn
    t.pending = null
    expect(movementModule.handle(ctx, column(edgeX, -6), p)).toBeUndefined()
    expect(t.units[unitId].location).toBe('board')
    expect(t.units[unitId].setUpTurn).toEqual({ round: 3, player: 'A' })
    expect(t.units[unitId].turn.arrivedThisTurn).toBe(true)
    for (const m of unitModels(t, unitId)) for (const e of Object.values(t.models).filter((x) => t.units[x.unitId].player === 'B' && t.units[x.unitId].location === 'board')) expect(horizontalGap(m, e)).toBeGreaterThan(6)
  })

  it('OGM-BT-3 Scoff Down Fresh Flesh: not offered when no enemy unit was destroyed; only units that fought this turn are targets; each unit once per end of turn', () => {
    const s = game()
    place(s, TYRANT, -6, -4); place(s, IRON, 2, -4)
    // nothing destroyed: not offered, whoever fought
    log(s, [], [TYRANT, IRON])
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(SCOFF)
    // only a friendly unit destroyed: not offered either
    log(s, [GLUT2], [TYRANT, IRON])
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(SCOFF)
    // an enemy unit destroyed, nobody fought: no target
    log(s, [GUARD], [])
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(SCOFF)
    // an enemy unit destroyed; the Tyrant, the Ironguts and an enemy fought; the Gluttons did not; a destroyed fighter is no target
    log(s, [GUARD], [TYRANT, IRON, BOSS, MB1])
    s.units[MB1].location = 'destroyed'
    expect(offered(s, 'A', 'endOfTurn')).toContain(SCOFF)
    expect(targetsOf('ogorsScoffDown', s, null, 'A')).toEqual([IRON, TYRANT])
    // both take an upgrade in the same End of Turn step, then nobody is left; a repeat on the same unit is not offered
    const ctx = ctxFor(s)
    const r = scoffPlan(ctx, 'A', [[TYRANT, 'raw'], [IRON, 'brains']])
    expect(r.topics.filter((t) => t === 'abilityMode')).toHaveLength(2)
    expect(summaries(ctx).filter((x) => /Scoff Down Fresh Flesh: .* gets /.test(x))).toHaveLength(2)
    expect(targetsOf('ogorsScoffDown', s, null, 'A')).toEqual([])
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(SCOFF)
    // the next turn's step starts clean (phase marks are cleared with the phase)
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('ogm:'))
    log(s, [GUARD], [TYRANT])
    expect(targetsOf('ogorsScoffDown', s, null, 'A')).toEqual([TYRANT])
  })

  it('OGM-BT-4 Raw and Bloody Flesh: +1 to hit for that unit\'s combat attacks only in turns it charged; lasts the battle', () => {
    const s = game()
    place(s, IRON, 0, -4); place(s, TYRANT, -8, -4); place(s, BOSS, 0, -1)
    log(s, [GUARD], [IRON])
    const ctx = ctxFor(s)
    scoffPlan(ctx, 'A', [[IRON, 'raw']])
    const hit = (unit: UnitId, weapon: string): number => rollModifier(s, 'onHitRoll', 'melee', unit, BOSS, weapon)
    expect(hit(IRON, W('irongut-weapon'))).toBe(0) // did not charge
    s.units[IRON].turn.chargedThisTurn = true
    s.units[TYRANT].turn.chargedThisTurn = true
    expect(hit(IRON, W('irongut-weapon'))).toBe(1)
    expect(hit(TYRANT, W('tyrants-meatcleavers'))).toBe(0) // another unit took no upgrade
    // it lasts the battle: nothing expires it
    effectService.expire(ctx, 'phaseEnd', null)
    effectService.expire(ctx, 'turnEnd', null)
    effectService.expire(ctx, 'roundEnd', null)
    expect(hit(IRON, W('irongut-weapon'))).toBe(1)
  })

  it('OGM-BT-5 Exotic Giblets: enemy ward rolls against that unit\'s combat damage are -1; its other damage and other units\' damage are unchanged', () => {
    const wardBundle = (b: DataBundle): void => { b.datasheets['fx.brute'].stats.ward = 5 }
    const build = (giblets: boolean) => {
      const s = game({ patch: wardBundle })
      place(s, IRON, 0, -4); place(s, TYRANT, 8, -4); place(s, BRUTE, 0, -1.7)
      centreRow(s, BOSS, 12, 8); centreRow(s, HAWK, 12, 5); centreRow(s, GUARD, -10, 8)
      for (const id of [GLUT2, MB1]) centreRow(s, id, -12, -9)
      if (giblets) { log(s, [GUARD], [IRON]); scoffPlan(ctxFor(s), 'A', [[IRON, 'giblets']]) }
      return s
    }
    // the hook: -1 only for the unit that took the upgrade, only against its melee damage
    const g = build(true)
    const info = (attackerUnitId: UnitId, kind: 'melee' | 'ranged' | 'mortal') => hookService.wardRollModifierFor(g, { wardedUnitId: BRUTE, attackerUnitId, kind })
    expect(info(IRON, 'melee')).toBe(-1)
    expect(info(IRON, 'ranged')).toBe(0)
    expect(info(IRON, 'mortal')).toBe(0)
    expect(info(TYRANT, 'melee')).toBe(0)
    // a real attack: hit, wound, failed save, then three ward rolls of 5 (a Ward 5+ saves all three; one point fewer with Giblets)
    const dice = [6, 6, 1, 5, 5, 5]
    const plain = build(false)
    const before = wounds(plain, BRUTE)
    attack(plain, dice, IRON, W('irongut-weapon'), BRUTE, 1)
    expect(wounds(plain, BRUTE)).toBe(before)
    const hurt = build(true)
    const { events } = attack(hurt, dice, IRON, W('irongut-weapon'), BRUTE, 1)
    expect(wounds(hurt, BRUTE)).toBe(before - 3)
    expect(of(events, 'FeelNoPainRolled')[0]).toMatchObject({ die: 5, needed: 6, ignored: false })
    // another unit's damage keeps the plain Ward
    const other = build(true)
    attack(other, dice, TYRANT, W('tyrants-meatcleavers'), BRUTE, 1)
    expect(wounds(other, BRUTE)).toBe(before)
  })

  it('OGM-BT-6 Steaming Brains: +3 to that unit\'s control score on an objective; taken twice gives +6', () => {
    const s = game()
    place(s, IRON, -7.6, -6) // on the South objective (-6, -6)
    const ctx = ctxFor(s)
    const control = (): number => objectiveService.levelOfControl(s, 'obj-a', ctx).A
    expect(control()).toBe(6) // 3 models x Control 2
    log(s, [GUARD], [IRON])
    scoffPlan(ctx, 'A', [[IRON, 'brains']])
    expect(control()).toBe(9)
    // a later turn: the same upgrade again stacks
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('ogm:') && !m.startsWith('abil:'))
    log(s, [GUARD], [IRON])
    scoffPlan(ctx, 'A', [[IRON, 'brains']])
    expect(control()).toBe(12)
    // a unit that took nothing is unchanged
    place(s, GLUT2, -7.6, -6.5)
    expect(unitModels(s, IRON).length).toBe(3)
  })
})

describe('OGM-RA regiment abilities', () => {
  // the Ironguts charged and fight the Brutes; the Hawk sits to the west, 3.5" off the line a slide west would take
  function bargeState() {
    const s = game({ reg: BARGING })
    s.phase = 'fight'
    place(s, IRON, 0, -4)
    place(s, BRUTE, 0, -1.6)
    centreRow(s, BOSS, 12, 8); centreRow(s, GUARD, -8, 8); centreRow(s, HAWK, 13, 3)
    for (const id of [TYRANT, GLUT2, MB1]) centreRow(s, id, id === TYRANT ? 11 : -12, -8)
    s.units[IRON].turn.chargedThisTurn = true
    return s
  }

  it('OGM-RA-1 Brutish Barging: once per battle at the end of your turn, a unit that charged moves up to 2D6"; it may cross the combat range of the unit it fights, not others; it never ends in combat', () => {
    const s = bargeState()
    expect(enemyIds(s, IRON)).toEqual([BRUTE])
    // offered at the end of your turn for a unit that charged; not to a unit that did not, not in the opponent's step
    expect(offered(s, 'A', 'endOfTurn')).toContain(BARGING)
    expect(targetsOf('ogorsBrutishBarging', s, null, 'A')).toEqual([IRON])
    expect(offered(s, 'B', 'endOfTurn')).not.toContain(BARGING)
    const idle = bargeState()
    idle.units[IRON].turn.chargedThisTurn = false
    expect(offered(idle, 'A', 'endOfTurn')).not.toContain(BARGING)
    // the slide rules: sideways out of the fight is legal, staying in combat or crossing a second combat range is not
    const opts = { combatPathExcept: [BRUTE], mayNotEndInCombat: true }
    expect(checkSlide(s, IRON, -7, -3, 7.7, false, opts).ok).toBe(true)
    expect(checkSlide(s, IRON, -7, -3, 7.7, false, { noCombatPath: true }).ok).toBe(false) // a plain move out of combat range may not start in one
    expect(checkSlide(s, IRON, 0, -0.5, 7, false, opts).ok).toBe(false) // still in combat at the end
    s.units[HAWK].location = 'board'
    centreRow(s, HAWK, -4.5, -8.4) // beside the line a slide west takes: crossed, though the end is clear of it
    expect(checkSlide(s, IRON, -9, -1.5, 9.5, false, opts).ok).toBe(false)
    centreRow(s, HAWK, 13, 3)
    // the full flow: 2D6 = 3 + 4, then a slide of at most 7" that leaves combat
    const ctx = ctxFor(s, [3, 4])
    useOnce(ctx, 'endOfTurn', 'A', BARGING, { pickMode: farthest })
    expect(leftOver(ctx)).toEqual([])
    expect(summaries(ctx).some((x) => /may move up to 7"/.test(x))).toBe(true)
    expect(readMoveQueue(s)).toBeNull()
    expect(enemyIds(s, IRON)).toEqual([])
    const moved = Math.hypot(unitModels(s, IRON)[0].pos.x - (0 + unitModels(s, IRON)[0].base.radius), unitModels(s, IRON)[0].pos.z + 4)
    expect(moved).toBeGreaterThan(1)
    expect(moved).toBeLessThanOrEqual(7.001)
    // once per battle
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(BARGING)
  })

  it('OGM-RA-2 Blinding Dust Clouds: -1 to hit against a friendly unit set up this turn; no penalty the turn after, or for units deployed normally', () => {
    const s = game({ reg: DUST })
    s.round = 3
    centreRow(s, BRUTE, 0, -1); centreRow(s, BOSS, 6, -1); place(s, GLUT3, -3, -4); place(s, IRON, 4, -4)
    s.units[GLUT3].location = 'board'
    const hit = (target: UnitId, kind: 'melee' | 'ranged' = 'melee'): number => rollModifier(s, 'onHitRoll', kind, BRUTE, target, 'fx.w.brute-axe')
    // arrived this turn (a reserve arrival): -1 to melee and to ranged attacks alike
    s.units[GLUT3].setUpTurn = { round: 3, player: 'A' }
    s.units[GLUT3].turn.arrivedThisTurn = true
    expect(hit(GLUT3)).toBe(-1)
    expect(hit(GLUT3, 'ranged')).toBe(-1)
    // a unit deployed normally is not affected
    expect(hit(IRON)).toBe(0)
    // the turn after (the opponent's turn of the same round, then your next turn): no penalty
    s.units[GLUT3].turn.arrivedThisTurn = false
    s.activePlayer = 'B'
    expect(hit(GLUT3)).toBe(0)
    s.activePlayer = 'A'; s.round = 4
    expect(hit(GLUT3)).toBe(0)
    // the enemy's own units are not covered
    s.round = 3
    s.units[GLUT3].setUpTurn = { round: 3, player: 'A' }
    expect(rollModifier(s, 'onHitRoll', 'melee', IRON, BRUTE, W('irongut-weapon'))).toBe(0)
    // the other regiment ability does not carry it
    const t = game({ reg: BARGING })
    t.round = 3
    place(t, GLUT3, -3, -4); centreRow(t, BRUTE, 0, -1)
    t.units[GLUT3].setUpTurn = { round: 3, player: 'A' }
    expect(rollModifier(t, 'onHitRoll', 'melee', BRUTE, GLUT3, 'fx.w.brute-axe')).toBe(0)
  })
})

describe('OGM-ENH enhancements', () => {
  it('OGM-ENH-1 Wallwrecker: the general crosses a wall a foot model cannot, with no climb cost; it does not gain Fly', () => {
    const s = game({ enh: WALLWRECKER, terrain: 'fx.terrain.standard' })
    place(s, TYRANT, -6, -1.5); place(s, IRON, -6, -3.5)
    const path = [{ x: -5.5, y: 0, z: -1 }, { x: -5.5, y: 0, z: 1.5 }]
    const tyrant = unitModels(s, TYRANT)[0]
    const foot = unitModels(s, IRON)[0]
    expect(hookService.unitHasEffectFlag(s, TYRANT, 'passAcrossTerrain')).toBe(true)
    expect(hookService.unitHasEffectFlag(s, IRON, 'passAcrossTerrain')).toBe(false)
    expect(terrainService.extraMoveCost(s, tyrant, path)).toBe(0)
    expect(terrainService.extraMoveCost(s, foot, path.map((p) => ({ ...p, x: -6 })))).toBeGreaterThan(0)
    // not the Fly keyword: a flyer's moves also ignore models and combat ranges
    expect(hookService.keywordsFor(s, TYRANT)).not.toContain('FLY')
    // without the enhancement the general pays the climb
    const plain = game({ enh: GRISTLE, terrain: 'fx.terrain.standard' })
    place(plain, TYRANT, -6, -1.5)
    expect(hookService.unitHasEffectFlag(plain, TYRANT, 'passAcrossTerrain')).toBe(false)
    expect(terrainService.extraMoveCost(plain, unitModels(plain, TYRANT)[0], path)).toBeGreaterThan(0)
  })

  it('OGM-ENH-2 Lungburster: a run roll of 1-3 becomes 4 for units wholly within 9" of the general; 5-6 unchanged; units outside unaffected', () => {
    const s = game({ enh: LUNGBURSTER })
    place(s, TYRANT, 0, -6); place(s, GLUT2, 3, -6); place(s, IRON, 11, -6)
    const run = (id: UnitId, roll: number): number => hookService.advanceRollFor(s, id, roll)
    for (const roll of [1, 2, 3]) {
      expect(run(TYRANT, roll), 'the general counts itself').toBe(4)
      expect(run(GLUT2, roll)).toBe(4)
      expect(run(IRON, roll), 'outside 9"').toBe(roll)
    }
    for (const roll of [4, 5, 6]) {
      expect(run(TYRANT, roll)).toBe(roll)
      expect(run(GLUT2, roll)).toBe(roll)
    }
    // not wholly within: one Glutton edging past 9" loses it
    unitModels(s, GLUT2)[1].pos = { x: 10.5, y: 0, z: -6 }
    expect(run(GLUT2, 2)).toBe(2)
    // without the enhancement nothing changes
    const plain = game({ enh: GRISTLE })
    place(plain, TYRANT, 0, -6)
    expect(hookService.advanceRollFor(plain, TYRANT, 2)).toBe(2)
  })

  it('OGM-ENH-3 Deathcheater: Ward 6+ only while no other friendly unit is within 3" of the general', () => {
    const wardOf = (s: GameState): number | null | undefined => hookService.feelNoPainAdjust(s, unitModels(s, TYRANT)[0].id, null)?.threshold
    const s = game({ enh: DEATHCHEATER })
    place(s, TYRANT, 0, -4); place(s, IRON, 10, -4)
    centreRow(s, BRUTE, 0, -1.4) // an enemy next to it does not matter
    for (const id of [GLUT2, MB1]) centreRow(s, id, -12, -9)
    expect(wardOf(s)).toBe(6)
    // reserves do not count
    expect(s.units[GLUT3].location).toBe('reserves')
    // a friendly unit within 3"
    place(s, GLUT2, 2.2, -4)
    expect(wardOf(s)).toBeUndefined()
    place(s, GLUT2, -12, -9)
    expect(wardOf(s)).toBe(6)
    // only the bearer: the Ironguts alone have no Ward
    expect(hookService.feelNoPainAdjust(s, unitModels(s, IRON)[0].id, null)).toBeNull()
    // a real attack on the isolated general: two ward rolls of 6 cancel the Brute's 2 damage; with a friend close there are no ward rolls
    const hit = (st: GameState) => attack(st, [6, 6, 1, 6, 6], BRUTE, 'fx.w.brute-axe', TYRANT, 1)
    const before = wounds(s, TYRANT)
    const r = hit(s)
    expect(of(r.events, 'FeelNoPainRolled')).toHaveLength(2)
    expect(wounds(s, TYRANT)).toBe(before)
    const t = game({ enh: DEATHCHEATER })
    place(t, TYRANT, 0, -4); place(t, IRON, 2.2, -4); centreRow(t, BRUTE, 0, -1.4)
    const r2 = hit(t)
    expect(of(r2.events, 'FeelNoPainRolled')).toHaveLength(0)
    expect(wounds(t, TYRANT)).toBe(8 - 2)
  })

  it('OGM-ENH-4 Gristlegobbler: once per battle, D3 mortal damage to each enemy unit in combat with the general, then Heal (3); not offered with no enemy in combat', () => {
    const s = game({ enh: GRISTLE })
    place(s, TYRANT, 0, -4)
    centreRow(s, BOSS, 12, 8); centreRow(s, HAWK, 12, 5); centreRow(s, GUARD, -10, 8)
    unitModels(s, TYRANT)[0].woundsRemaining = 3
    // nobody in combat: not offered
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(GRISTLE_AB)
    // the Brute and the Boss are both in combat with the general
    centreRow(s, BRUTE, -2, -1.5)
    place(s, BOSS, 2.2, -1.5)
    expect(new Set(Object.values(s.units).filter((u) => u.player === 'B' && gapBetween(s, TYRANT, u.id) <= 3).map((u) => u.id))).toEqual(new Set([BRUTE, BOSS]))
    expect(offered(s, 'A', 'endOfTurn')).toContain(GRISTLE_AB)
    const brute = wounds(s, BRUTE), boss = wounds(s, BOSS)
    const ctx = ctxFor(s, [4, 6]) // one D3 per target, in unit-id order (a D3 is half a D6, rounded up): the Boss rolls 2, the Brute 3
    useOnce(ctx, 'endOfTurn', 'A', GRISTLE_AB)
    expect(leftOver(ctx)).toEqual([])
    expect(wounds(s, BOSS)).toBe(boss - 2)
    expect(wounds(s, BRUTE)).toBe(brute - 3)
    expect(wounds(s, TYRANT)).toBe(6) // Heal (3): 3 -> 6
    expect(summaries(ctx).filter((x) => /Gristlegobbler/.test(x)).length).toBeGreaterThanOrEqual(3)
    // once per battle
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(GRISTLE_AB)
  })
})

describe('OGM-AB warscroll abilities', () => {
  it('OGM-AB-1 Roaring Warlord: 3+ gives a visible friendly unit within 12" +1 to its charge rolls this turn; 1-2 nothing', () => {
    const s = game()
    place(s, TYRANT, 0, -6); place(s, GLUT2, 5, -6); place(s, IRON, 14, -9)
    const near = targetsOf('ogorsRoaringWarlord', s, TYRANT, 'A')
    expect(near).toEqual(expect.arrayContaining([GLUT2, TYRANT])) // the Tyrant counts
    expect(near).not.toContain(IRON) // out of range
    const chargeBonus = (st: GameState, id: UnitId): number => {
      const ctx = ctxFor(st, [3, 4])
      const roll = ctx.roll({ purpose: 'charge', player: 'A', count: 2, mode: 'sum', unitId: id })
      return hookService.collect(ctx, 'onChargeRoll', { chargingUnitId: id, targetUnitIds: [BRUTE], roll: { purpose: 'charge', roll, dieIndex: 0, unmodified: 7, rerolled: false } })
        .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
    }
    expect(chargeBonus(s, GLUT2)).toBe(0)
    const ctx = ctxFor(s, [3])
    useOnce(ctx, 'hero', 'A', WARLORD, { target: GLUT2 })
    expect(leftOver(ctx)).toEqual([])
    expect(chargeBonus(s, GLUT2)).toBe(1)
    expect(chargeBonus(s, TYRANT)).toBe(0)
    // it ends with the turn
    effectService.expire(ctx, 'turnEnd', null)
    expect(chargeBonus(s, GLUT2)).toBe(0)
    // 2: nothing happens
    const t = game()
    place(t, TYRANT, 0, -6); place(t, GLUT2, 5, -6)
    const c2 = ctxFor(t, [2])
    useOnce(c2, 'hero', 'A', WARLORD, { target: GLUT2 })
    expect(chargeBonus(t, GLUT2)).toBe(0)
    expect(t.units[GLUT2].effects).toHaveLength(0)
    // once per phase; not in the opponent's hero phase
    expect(offered(t, 'A', 'hero')).not.toContain(WARLORD)
    const u = game()
    u.activePlayer = 'B'
    expect(offered(u, 'A', 'hero')).not.toContain(WARLORD)
  })

  it('OGM-AB-1 (visibility) a unit hidden behind an obscuring ruin is no target', () => {
    const s = game({ terrain: 'fx.terrain.standard' })
    place(s, TYRANT, -8, -3.5); place(s, GLUT2, -8, 5.5) // the ruin (x -8.5..-3.5, z 0.5..3.5) lies between them
    place(s, IRON, -2, -3.5)
    const targets = targetsOf('ogorsRoaringWarlord', s, TYRANT, 'A')
    expect(targets).toContain(IRON)
    expect(targets).toContain(TYRANT)
    expect(targets).not.toContain(GLUT2)
  })

  it('OGM-AB-2 Wall of Meat: Gluttons save +1 except in a turn they charged', () => {
    const s = game()
    place(s, GLUT2, 0, -4); place(s, IRON, 6, -4); centreRow(s, BRUTE, 0, -1.6)
    const save = (target: UnitId): number => {
      const ctx = ctxFor(s, [3])
      const atk = {
        kind: 'melee' as const, overwatch: false, attackerUnitId: BRUTE, attackerModelId: s.units[BRUTE].models[0], weapon: s.weapons['fx.w.brute-axe'], targetUnitId: target,
        targetModelId: s.units[target].models[0], range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true,
      }
      const roll = ctx.roll({ purpose: 'save', player: 'A', unitId: target })
      return hookService.collect(ctx, 'onSaveRoll', { attack: atk, roll: { purpose: 'save', roll, dieIndex: 0, unmodified: roll.dice[0], rerolled: false } } as never)
        .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
    }
    expect(save(GLUT2)).toBe(1) // the enemy's turn: it did not charge
    expect(save(IRON)).toBe(0) // the Ironguts have no such rule
    s.units[GLUT2].turn.chargedThisTurn = true
    expect(save(GLUT2)).toBe(0)
    s.units[GLUT2].turn.chargedThisTurn = false
    s.activePlayer = 'B'
    expect(save(GLUT2)).toBe(1) // every unit's charge flag is false in the opponent's turn
  })

  it('OGM-AB-3 Stomping Marauders: Ironguts control score +2 at the end of a turn they charged; not otherwise', () => {
    const s = game()
    place(s, IRON, -7.6, -6) // on the South objective
    const ctx = ctxFor(s)
    abilityService.runWindow(ctx, 'hero', 'A') // the ability window puts the bookkeeping in place (ensureEffects)
    const control = (): number => objectiveService.levelOfControl(s, 'obj-a', ctx).A
    expect(control()).toBe(6)
    s.units[IRON].turn.chargedThisTurn = true
    expect(control()).toBe(8) // the unit's total, not each model's
    s.units[IRON].turn.chargedThisTurn = false
    expect(control()).toBe(6)
    // other units do not get it
    place(s, GLUT2, -7.6, -6.2)
    s.units[GLUT2].turn.chargedThisTurn = true
    expect(unitModels(s, GLUT2).length).toBe(2)
    // one effect per unit, not one per window
    abilityService.runWindow(ctx, 'hero', 'A')
    expect(s.units[IRON].effects.filter((e) => e.sourceAbilityId === STOMP)).toHaveLength(1)
  })

  it('OGM-AB-4 Shock and Gore: only after this unit charged; 3+ gives the target -1 to wound this turn; once per turn across both Maulbeast units', () => {
    const s = game()
    s.phase = 'fight'
    place(s, MB1, -6, -4); centreRow(s, BRUTE, -5, -1.5)
    s.units[MB2].location = 'board'
    place(s, MB2, 6, -4); place(s, BOSS, 6, -1.4)
    // not charged: not offered
    expect(offered(s, 'A', 'fight')).not.toContain(GORE)
    s.units[MB1].turn.chargedThisTurn = true
    expect(offered(s, 'A', 'fight')).toContain(GORE)
    expect(targetsOf('ogorsShockAndGore', s, MB1, 'A')).toEqual([BRUTE])
    // not in the opponent's step
    expect(offered(s, 'B', 'fight')).not.toContain(GORE)
    const wound = (attacker: UnitId, weapon: string, target: UnitId): number => rollModifier(s, 'onWoundRoll', 'melee', attacker, target, weapon)
    expect(wound(BRUTE, 'fx.w.brute-axe', MB1)).toBe(0)
    const ctx = ctxFor(s, [3])
    useOnce(ctx, 'fight', 'A', GORE)
    expect(leftOver(ctx)).toEqual([])
    expect(wound(BRUTE, 'fx.w.brute-axe', MB1)).toBe(-1)
    expect(wound(BOSS, 'fx.w.boss-blade', MB2)).toBe(0) // another enemy unit is untouched
    // once per turn for the army: the second Maulbeast cannot use it even after charging
    s.units[MB2].turn.chargedThisTurn = true
    expect(offered(s, 'A', 'fight')).not.toContain(GORE)
    // it ends with the turn
    effectService.expire(ctx, 'turnEnd', null)
    expect(wound(BRUTE, 'fx.w.brute-axe', MB1)).toBe(0)
    // a failed roll (1-2) does nothing and still spends the use
    const t = game()
    t.phase = 'fight'
    place(t, MB1, -6, -4); centreRow(t, BRUTE, -5, -1.5)
    t.units[MB1].turn.chargedThisTurn = true
    const c2 = ctxFor(t, [2])
    useOnce(c2, 'fight', 'A', GORE)
    expect(rollModifier(t, 'onWoundRoll', 'melee', BRUTE, MB1, 'fx.w.brute-axe')).toBe(0)
    expect(offered(t, 'A', 'fight')).not.toContain(GORE)
  })
})

describe('OGM AI hints', () => {
  it('the hints answer for the Ogors codes only and pass on a wasted ability', () => {
    const s = game({ reg: BARGING })
    expect(ogorsAbilityTiming(s, 'A', 'someOtherCode', null)).toBeNull()
    expect(ogorsTargetBonus(s, 'A', 'someOtherCode', TYRANT)).toBeNull()
    expect(ogorsModeBonus(s, 'A', 'someOtherCode', 'raw', null)).toBeNull()
    place(s, TYRANT, 0, -6)
    // Gristlegobbler: nobody in combat -> wait; Brutish Barging with nothing charged -> wait
    expect(ogorsAbilityTiming(s, 'A', 'ogorsGristlegobbler', TYRANT)).toBeLessThan(-2)
    expect(ogorsAbilityTiming(s, 'A', 'ogorsBrutishBarging', null)).toBeLessThan(-2)
    // Scoff Down: never repeat Raw on the same unit
    log(s, [GUARD], [IRON])
    scoffPlan(ctxFor(s), 'A', [[IRON, 'raw']])
    expect(ogorsModeBonus(s, 'A', 'ogorsScoffDown', 'raw', IRON)).toBeLessThan(0)
    expect(ogorsModeBonus(s, 'A', 'ogorsScoffDown', 'raw', TYRANT)).toBeGreaterThan(0)
  })
})

function enemyIds(s: GameState, unitId: UnitId): UnitId[] {
  return Object.values(s.units).filter((u) => u.player !== s.units[unitId].player && u.location === 'board' && gapBetween(s, unitId, u.id) <= 3).map((u) => u.id)
}
// the Pick helper is used by some scenarios above
void (null as unknown as Pick)
void removeModel
void trim
