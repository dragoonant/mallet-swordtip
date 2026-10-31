// Maggotkin of Nurgle (Bleak Host) code hooks: docs/spec/factions/maggotkin-of-nurgle.md, test ids MON-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/nurgle files on top of the AoS fixture bundle
// (player A = Bleak Host, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, createGame, legalActions, removeModel, step, unitModels, view,
  type AbilityWindow, type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameState, type PendingDecision, type PlayerId, type UnitId,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { makeSimSetup } from '../../tools/sim-core'
import { DATA_VERSION, loadBundle } from '../../src/data'
import { attackService, feelNoPainFor, pendingAfterFightMortal } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { factionResources, hookService } from '../../src/engine/hooks-impl'
import { losService } from '../../src/engine/los'
import { missionService } from '../../src/engine/missions'
import { movementModule } from '../../src/engine/phases/movement'
import { buildShootingWeaponEntries, unitEligibleToShoot } from '../../src/engine/phases/shooting'
import { weaponService } from '../../src/engine/weapons'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { diseasePoints, embraceTargets, nurgleAbilityTiming, nurgleModeBonus, nurgleTargetBonus } from '../../src/engine/factions/nurgle'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/nurgle/abilities.json'
import enhancementsJson from '../../src/data/factions/nurgle/enhancements.json'
import weaponsJson from '../../src/data/factions/nurgle/weapons.json'
import factionJson from '../../src/data/factions/nurgle/faction.json'
import patrolJson from '../../src/data/factions/nurgle/patrols/bleak-host.json'
import scrivenerJson from '../../src/data/factions/nurgle/datasheets/spoilpox-scrivener.json'
import blightlordJson from '../../src/data/factions/nurgle/datasheets/pusgoyle-blightlord.json'
import blightkingsJson from '../../src/data/factions/nurgle/datasheets/putrid-blightkings.json'
import plaguebearersJson from '../../src/data/factions/nurgle/datasheets/plaguebearers.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [scrivenerJson, blightlordJson, blightkingsJson, plaguebearersJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.nurgle = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const ARMY = 'nurgle.army.bleak-host'
const HOSTS = 'nurgle.ability.the-infectious-hosts'
const SUMMONING = 'nurgle.ability.daemonic-summoning'
const DISEASED = 'nurgle.ability.diseased'
const EMBRACE = 'nurgle.ability.nurgles-embrace'
const INFESTED = 'nurgle.ability.infested-with-wonders'
const LOCUS = 'nurgle.ability.locus-of-fecundity'
const COUNTING = 'nurgle.ability.keep-counting'
const WRACK = 'nurgle.ability.wrack-and-ruin'
const RELENTLESS = 'nurgle.ability.relentless-attackers'
const BREATH = 'nurgle.enh.pestilent-breath'
const SUMMONER = 'nurgle.enh.summoner-of-plaguebearers'
const GARDENER = 'nurgle.enh.gardener-of-nurgle'
const FRENZY = 'nurgle.enh.gift-of-febrile-frenzy'
const BREATH_AB = 'nurgle.ability.pestilent-breath'
const SUMMONER_AB = 'nurgle.ability.summoner-of-plaguebearers'
const GARDENER_AB = 'nurgle.ability.gardener-of-nurgle'
const FRENZY_AB = 'nurgle.ability.gift-of-febrile-frenzy'

const SCR = 'A:spoilpox-scrivener'
const BL1 = 'A:pusgoyle-blightlord-1'
const BL2 = 'A:pusgoyle-blightlord-2'
const KINGS = 'A:putrid-blightkings'
const PB1 = 'A:plaguebearers-1'
const PB2 = 'A:plaguebearers-2'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'

const W = (id: string) => `nurgle.weapon.${id}`

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

// the unit's models in a tight row centred on (cx, cz); 7+ models go in two rows so every model keeps two neighbours (coherency)
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

// the smallest edge-to-edge gap between two units
const unitGap = (s: GameState, a: UnitId, b: UnitId): number =>
  Math.min(...unitModels(s, a).flatMap((m) => unitModels(s, b).map((o) => horizontalGap(m, o))))

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'nurgle', patrolId: ARMY, enhancementId: opts.enh ?? BREATH, regimentAbilityId: opts.reg ?? INFESTED }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  // bystanders go along the back edges, two rows each, clear of the middle where the tests work (the reserve units stay in reserve)
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

// the ability loop of a window, answering abilityUse / abilityTarget / abilityMode through abilities.ts and the shared
// 'abilityChoice' topic (Nurgle's Embrace) through the hook service, as the reducer routes them
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
    const handler = p.context.topic === 'abilityChoice' ? hookService.handler : abilityService.handler
    const rej = handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

// use one ability once; every other offer is declined. `mode` picks an abilityMode option by id (default: the first)
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string; choice?: Pick } = {}) {
  let used = false
  return runWindow(ctx, window, player, (topic, ids, p) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    if (topic === 'abilityChoice') return opts.choice ? opts.choice(topic, ids, p) : 'pass'
    return opts.mode ?? ids[0]
  })
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
// models slain by mortal damage or a combat attack in a log (coherency culls are a different event)
const slainBy = (events: GameEvent[]): number => of(events, 'ModelDestroyed').filter((e) => e.kind === 'mortal' || e.kind === 'melee' || e.kind === 'ranged').length
const slay = (s: GameState, unitId: UnitId, n: number): void => { for (const id of [...s.units[unitId].models].slice(-n)) removeModel(s, id) }
const setDisease = (s: GameState, n: number, player: PlayerId = 'A'): void => { s.mission.custom = { ...s.mission.custom, mnDisease: { [player]: n } } }
const wardOf = (s: GameState, id: UnitId): number | undefined => feelNoPainFor(ctxFor(s, []), s.units[id].models[0], {} as never)?.threshold
const effA = (s: GameState, unitId: UnitId, weaponId: string): unknown => {
  const m = unitModels(s, unitId).find((x) => x.weapons.includes(weaponId))!
  return weaponService.effectiveWeapon(s, m.id, weaponId).A
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

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('MON-REG every code in the Nurgle data resolves to a hook, activated ones with an activate block', () => {
    for (const a of [...(abilitiesJson as unknown as AbilityDescriptor[])]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('MON-ARMY-1 the Bleak Host builds in the engine: Scrivener general, 6 units, 18 models, every unit Ward 5+, stats as printed', () => {
    const s = game({ enh: GARDENER, reg: LOCUS })
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(6)
    expect(mine.reduce((n, u) => n + u.startingStrength, 0)).toBe(18)
    expect(s.players.A.warlordUnitId).toBe(SCR)
    expect(s.players.A.battleTraitIds).toEqual([HOSTS, DISEASED, EMBRACE])
    expect(s.players.A.regimentAbilityId).toBe(LOCUS)
    expect(s.units[SCR].enhancementId).toBe(GARDENER)
    const st = (id: string) => s.datasheets[`nurgle.unit.${id}`].stats
    expect(st('spoilpox-scrivener')).toMatchObject({ M: 4, W: 5, Sv: 5, OC: 2, ward: 5 })
    expect(st('pusgoyle-blightlord')).toMatchObject({ M: 8, W: 8, Sv: 4, OC: 2, ward: 5 })
    expect(st('putrid-blightkings')).toMatchObject({ M: 4, W: 3, Sv: 3, OC: 1, ward: 5 })
    expect(st('plaguebearers')).toMatchObject({ M: 4, W: 2, Sv: 6, OC: 1, ward: 5 })
    // the printed Ward (5+) reaches the dice: every unit rolls on a 5+
    for (const id of [SCR, BL1, KINGS, PB1]) expect(wardOf(s, id), id).toBe(5)
    // the Blightlords are the only fliers
    expect(Object.values(s.units).filter((u) => u.player === 'A' && s.datasheets[u.datasheetId].keywords.includes('FLY')).map((u) => u.id).sort()).toEqual([BL1, BL2])
    expect(unitModels(s, SCR)[0].weapons).toEqual([W('disgusting-sneezes'), W('distended-maw')])
    expect(unitModels(s, BL1)[0].weapons).toEqual([W('blighted-scythe'), W('rot-fly-mouthparts')])
  })

  it('MON-ARMY-2 no unit has the Reinforcements keyword: Call for Reinforcements is never offered', () => {
    const s = game()
    for (const u of Object.values(s.units).filter((x) => x.player === 'A')) expect(s.datasheets[u.datasheetId].keywords).not.toContain('REINFORCEMENTS')
    for (const u of Object.values(s.units).filter((x) => x.player === 'A')) u.location = 'destroyed'
    expect(replaceableUnits(s, 'A')).toEqual([])
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement').filter((id) => id.includes('einforce'))).toEqual([])
  })
})

describe('MON-BT battle traits', () => {
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

  it('MON-BT-1 the second Blightlord and second Plaguebearers start in reserve; Daemonic Summoning is only from round 3 in your movement phase, sets them up more than 6" from every enemy, and they cannot move that phase', () => {
    const s = game()
    for (const id of [BL2, PB2]) {
      expect(s.units[id].location, id).toBe('reserves')
      expect(s.units[id].reserveArrival, id).toBe(SUMMONING)
    }
    for (const id of [SCR, BL1, KINGS, PB1]) expect(s.units[id].location, id).toBe('board')
    s.phase = 'movement'
    centreRow(s, BOSS, 0, 0)
    // round 2: no arrival
    s.round = 2
    expect(toArrival(ctxFor(s, []))).toBeNull()
    for (const id of [BL2, PB2]) expect(s.units[id].location).toBe('reserves')
    // round 3 but the enemy's own movement phase: nothing for us
    const e = game()
    e.phase = 'movement'; e.round = 3; e.activePlayer = 'B'
    centreRow(e, BOSS, 0, 0)
    const enemyCtx = ctxFor(e, [])
    movementModule.enter(enemyCtx)
    expect((e.pending as PendingDecision | null)?.kind === 'deployUnit' && e.pending?.player === 'A').toBe(false)
    // round 3: a deployUnit decision for each reserve unit; within 6" of the Boss is refused, a far corner is fine
    const t = game()
    t.phase = 'movement'; t.round = 3
    centreRow(t, BOSS, 0, 0)
    const ctx = ctxFor(t, [])
    const p = toArrival(ctx) as PendingDecision & { context: { unitIds: UnitId[] } }
    expect(p.kind).toBe('deployUnit')
    const arriving = p.context.unitIds[0]
    expect([BL2, PB2]).toContain(arriving)
    const models = t.units[arriving].models
    const at = (x: number, z: number): Action => ({
      type: 'deployUnit', player: 'A', decisionId: p.id, unitId: arriving,
      placements: models.map((id, i) => ({ modelId: id, pos: { x: x + i * 1.4, y: 0, z }, facing: 0 })),
    } as Action)
    expect(movementModule.validate?.(t, at(4, 0), p)?.code).toBe('E_ENGAGEMENT')
    expect(movementModule.validate?.(t, at(-13.5, -6), p)).toBeNull()
    t.pending = null
    expect(movementModule.handle(ctx, at(-13.5, -6), p)).toBeUndefined()
    expect(t.units[arriving].location).toBe('board')
    expect(t.units[arriving].setUpTurn).toEqual({ round: 3, player: 'A' })
    // anywhere (not tied to the deployment zone) and every model more than 6" from every enemy model
    for (const m of unitModels(t, arriving)) for (const x of unitModels(t, BOSS)) expect(horizontalGap(m, x)).toBeGreaterThan(6)
    expect(t.phaseState.activated).toContain(arriving)
    // a unit still in reserve at the start of round 4 is destroyed
    const u = game()
    u.round = 4
    missionService.onWindow(ctxFor(u, []), 'round.start', '4')
    for (const id of [BL2, PB2]) expect(u.units[id].location, id).toBe('destroyed')
    expect(u.units[BL1].location).toBe('board')
  })

  it('MON-BT-2 Diseased: every critical hit of a friendly attack adds a disease point (Crit (Mortal) and Companion included, either turn); the pool stops at 7; enemy crits add nothing', () => {
    const s = game()
    place(s, KINGS, -2, -4)
    centreRow(s, GUARD, 0, 0)
    centreRow(s, PB1, 0, -3)
    expect(diseasePoints(s, 'A')).toBe(0)
    // Plaguesword: 3 attacks, a 6 (critical, 1 mortal, no wound roll), a 4 (plain hit) and a miss
    const a = attack(s, 'melee', [6, 4, 1, 3, 1], PB1, W('plaguesword'), GUARD, 3)
    expect(of(a.events, 'HitRolled').filter((h) => h.critical)).toHaveLength(1)
    expect(a.rng.remaining).toEqual([])
    expect(diseasePoints(s, 'A')).toBe(1)
    expect(of(a.events, 'AbilityTriggered').some((e) => e.summary.startsWith('Diseased: +1'))).toBe(true)
    // Companion weapon: two critical hits from the Rot Fly's 6 attacks (the weapon has no critical effect, the crits still count)
    const t = game()
    centreRow(t, BL1, 0, -3)
    centreRow(t, GUARD, 0, 0)
    const c = attack(t, 'melee', [6, 6, 1, 1, 1, 1, 2, 2, 1, 1], BL1, W('rot-fly-mouthparts'), GUARD, 6)
    expect(diseasePoints(t, 'A')).toBe(2)
    expect(c.rng.remaining).toEqual([])
    // either player's turn: the enemy turn counts
    const u = game()
    u.activePlayer = 'B'
    centreRow(u, PB1, 0, -3)
    centreRow(u, GUARD, 0, 0)
    attack(u, 'melee', [6, 1, 1, 6], PB1, W('plaguesword'), GUARD, 1)
    expect(diseasePoints(u, 'A')).toBe(1)
    // the pool never exceeds 7
    const v = game()
    setDisease(v, 6)
    centreRow(v, BL1, 0, -3)
    centreRow(v, GUARD, 0, 0)
    attack(v, 'melee', [6, 6, 6, 1, 1, 1, 2, 2, 2, 1, 1, 1], BL1, W('rot-fly-mouthparts'), GUARD, 6)
    expect(diseasePoints(v, 'A')).toBe(7)
    // an enemy critical hit gives A nothing
    const w = game()
    centreRow(w, BOSS, 0, -3)
    centreRow(w, GUARD, 0, 0)
    w.phase = 'fight'
    const before = diseasePoints(w, 'A')
    attack(w, 'melee', [6, 1, 1], BOSS, 'fx.w.boss-blade', 'A:plaguebearers-1', 1)
    expect(diseasePoints(w, 'A')).toBe(before)
    // the HUD readout
    setDisease(w, 3)
    expect(factionResources(w, 'A')).toEqual([expect.objectContaining({ id: 'nurgle-disease', label: 'Disease', value: 3, max: 7 })])
    expect(factionResources(w, 'B')).toEqual([])
  })

  describe('MON-BT-3 Nurgle\'s Embrace', () => {
    // KINGS fight the Brutes, the Scrivener fights the Guard
    function fightGame(points: number) {
      const s = game()
      setDisease(s, points)
      centreRow(s, BRUTE, 0, 0)
      centreRow(s, KINGS, 0, -3.3)
      centreRow(s, GUARD, 9, 0)
      centreRow(s, SCR, 9, -3)
      s.phase = 'fight'
      return s
    }

    it('MON-BT-3 end of any turn: each point spent rolls a D6 against an enemy unit in combat with a friendly unit, 5+ = 1 mortal; points are deducted; the same unit may be picked again', () => {
      const s = fightGame(3)
      expect(embraceTargets(s, 'A').sort()).toEqual([BRUTE, GUARD].sort())
      s.activePlayer = 'B' // the end of the enemy's turn counts
      expect(offered(s, 'A', 'endOfTurn')).toContain(EMBRACE)
      expect(offered(s, 'B', 'endOfTurn')).not.toContain(EMBRACE)
      const ctx = ctxFor(s, [5, 4])
      const brute = wounds(s, BRUTE)
      const guard = s.units[GUARD].models.length
      let picks = 0
      const r = useOnce(ctx, 'endOfTurn', 'A', EMBRACE, {
        choice: (_t, ids) => (++picks === 1 ? BRUTE : picks === 2 ? GUARD : 'pass'), // the third question is answered "stop"
      })
      expect(r.topics).toEqual(['abilityUse', 'abilityChoice', 'abilityChoice', 'abilityChoice', 'abilityUse'])
      expect(diseasePoints(s, 'A')).toBe(1) // two spent, one kept
      expect(wounds(s, BRUTE)).toBe(brute - 1) // 5 hurt
      expect(s.units[GUARD].models).toHaveLength(guard) // 4 did not
      expect(leftOver(ctx)).toEqual([])
      expect(summaries(ctx).filter((x) => x.startsWith("Nurgle's Embrace: rolled"))).toEqual([
        "Nurgle's Embrace: rolled 5, 1 mortal damage on Brute", "Nurgle's Embrace: rolled 4, Guard shrugs it off",
      ])
      // once per turn for the army, even with points left
      expect(offered(s, 'A', 'endOfTurn')).not.toContain(EMBRACE)
      // the same unit may take several points
      const t = fightGame(2)
      const c2 = ctxFor(t, [6, 6])
      useOnce(c2, 'endOfTurn', 'A', EMBRACE, { choice: () => BRUTE })
      expect(diseasePoints(t, 'A')).toBe(0)
      expect(wounds(t, BRUTE)).toBe(9 - 2)
      expect(leftOver(c2)).toEqual([])
    })

    it('MON-BT-3 a unit wiped by an earlier point drops out of the next question; the loop ends when no target is left', () => {
      const s = fightGame(3)
      for (const id of [...s.units[GUARD].models].slice(1)) removeModel(s, id) // one Guard model left (Health 1)
      const ctx = ctxFor(s, [6])
      let asked = 0
      const r = useOnce(ctx, 'endOfTurn', 'A', EMBRACE, { choice: (_t, ids) => (++asked === 1 ? GUARD : (ids.length >= 0 ? 'pass' : ids[0])) })
      expect(s.units[GUARD].location).toBe('destroyed')
      expect(diseasePoints(s, 'A')).toBe(2) // one point spent; BRUTE is still a target, so a second question was asked and answered "stop"
      expect(r.options[2]).not.toContain(GUARD)
    })

    it('MON-BT-3 not offered with 0 points or when no enemy unit is in combat with a friendly unit', () => {
      const s = fightGame(0)
      expect(offered(s, 'A', 'endOfTurn')).not.toContain(EMBRACE)
      setDisease(s, 2)
      expect(offered(s, 'A', 'endOfTurn')).toContain(EMBRACE)
      centreRow(s, BRUTE, 0, 6)
      centreRow(s, GUARD, 9, 6)
      expect(embraceTargets(s, 'A')).toEqual([])
      expect(offered(s, 'A', 'endOfTurn')).not.toContain(EMBRACE)
    })
  })
})

describe('MON-RA regiment abilities', () => {
  it('MON-RA-1 Locus of Fecundity: your hero phase, Heal (D3) on any damaged friendly unit anywhere; never returns slain models; once per hero phase', () => {
    const s = game({ reg: LOCUS })
    expect(offered(s, 'A', 'hero')).not.toContain(LOCUS) // nothing damaged
    slay(s, PB1, 1) // a slain model alone is not damage
    expect(offered(s, 'A', 'hero')).not.toContain(LOCUS)
    unitModels(s, BL1)[0].woundsRemaining = 3 // 5 damage points, far from the Scrivener
    expect(offered(s, 'A', 'hero')).toContain(LOCUS)
    expect(offered(s, 'B', 'hero')).not.toContain(LOCUS)
    const ctx = ctxFor(s, [6]) // D3 face 6 = 3
    useOnce(ctx, 'hero', 'A', LOCUS, { target: BL1 })
    expect(unitModels(s, BL1)[0].woundsRemaining).toBe(6)
    expect(s.units[PB1].models).toHaveLength(4)
    expect(leftOver(ctx)).toEqual([])
    expect(offered(s, 'A', 'hero')).not.toContain(LOCUS)
    // the heal never goes past full Health
    const t = game({ reg: LOCUS })
    unitModels(t, BL1)[0].woundsRemaining = 7
    useOnce(ctxFor(t, [6]), 'hero', 'A', LOCUS, { target: BL1 })
    expect(unitModels(t, BL1)[0].woundsRemaining).toBe(8)
  })

  describe('MON-RA-2 Infested with Wonders', () => {
    // a Plaguebearers model with one Health left, an enemy Brute beside it
    function infestedGame() {
      const s = game()
      centreRow(s, PB1, 0, -2.3)
      centreRow(s, BRUTE, 1.1, 0) // its third model stands beside the Plaguebearers' last one
      unitModels(s, PB1)[4].woundsRemaining = 1
      s.phase = 'fight'
      s.activePlayer = 'B'
      return s
    }

    it('MON-RA-2 a slain friendly model rolls against an enemy unit within 1" of where it died: 4+ = 1 mortal, held until the attack sequence has ended', () => {
      const s = infestedGame()
      const victim = unitModels(s, PB1)[4].id
      // the Brute swings once: hit 4, wound 3, the save fails (1), ward 5+ fails twice (D2) -> the 1-Health model is slain; Infested rolls a 4
      const a = attack(s, 'melee', [4, 3, 1, 1, 1, 4], BRUTE, 'fx.w.brute-axe', PB1, 1)
      expect(s.models[victim]).toBeUndefined()
      expect(a.rng.remaining).toEqual([])
      expect(pendingAfterFightMortal(s)).toEqual([expect.objectContaining({ targetUnitId: BRUTE, count: 1, source: INFESTED })])
      // a 3 does nothing
      const t = infestedGame()
      const b = attack(t, 'melee', [4, 3, 1, 1, 1, 3], BRUTE, 'fx.w.brute-axe', PB1, 1)
      expect(pendingAfterFightMortal(t)).toEqual([])
      expect(of(b.events, 'AbilityTriggered').some((e) => e.summary.includes('fizzle'))).toBe(true)
    })

    it('MON-RA-2 outside an attack the mortal damage lands at once; no enemy within 1" = nothing; works for a unit\'s last model', () => {
      const s = infestedGame()
      const ctx = ctxFor(s, [1, 1, 5])
      const brute = wounds(s, BRUTE)
      attackService.queueMortalWounds(ctx, PB1, 2, 'test', false) // two wards fail, the 1-Health model dies, then the Infested die
      expect(wounds(s, BRUTE)).toBe(brute - 1)
      expect(leftOver(ctx)).toEqual([])
      // nobody within 1": the Brute is 2" away
      const t = infestedGame()
      centreRow(t, BRUTE, 1.1, 0.5)
      const c2 = ctxFor(t, [1, 1])
      attackService.queueMortalWounds(c2, PB1, 2, 'test', false)
      expect(wounds(t, BRUTE)).toBe(9)
      expect(leftOver(c2)).toEqual([])
      // the last model of a unit still rolls
      const u = infestedGame()
      slay(u, PB1, 4)
      const last = unitModels(u, PB1)[0]
      centreRow(u, BRUTE, last.pos.x, last.pos.z + 2.3)
      last.woundsRemaining = 1
      const c3 = ctxFor(u, [1, 6])
      const hp = wounds(u, BRUTE)
      attackService.queueMortalWounds(c3, PB1, 1, 'test', false)
      expect(u.units[PB1].location).toBe('destroyed')
      expect(wounds(u, BRUTE)).toBe(hp - 1)
    })
  })
})

describe('MON-ENH enhancements', () => {
  it('MON-ENH-1 Summoner of Plaguebearers: end of any turn returns 1 slain model to a Plaguebearers unit wholly within 14" of the general; not offered when none is missing or in range', () => {
    const s = game({ enh: SUMMONER })
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(SUMMONER_AB) // nothing slain
    centreRow(s, SCR, 0, -8)
    centreRow(s, PB1, 0, -5)
    slay(s, PB1, 2)
    slay(s, KINGS, 2) // Blightkings are not Plaguebearers
    expect(offered(s, 'A', 'endOfTurn')).toContain(SUMMONER_AB)
    s.activePlayer = 'B' // the enemy's end of turn counts
    expect(offered(s, 'A', 'endOfTurn')).toContain(SUMMONER_AB)
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'endOfTurn', 'A', SUMMONER_AB)
    expect(s.units[PB1].models).toHaveLength(4) // 3 left + 1
    expect(s.units[KINGS].models).toHaveLength(3)
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(SUMMONER_AB) // once per turn
    // out of range: the unit is more than 14" away
    const t = game({ enh: SUMMONER })
    centreRow(t, SCR, -12, -8)
    centreRow(t, PB1, 6, -8)
    slay(t, PB1, 1)
    expect(offered(t, 'A', 'endOfTurn')).not.toContain(SUMMONER_AB)
    centreRow(t, PB1, -6, -8)
    expect(offered(t, 'A', 'endOfTurn')).toContain(SUMMONER_AB)
  })

  describe('MON-ENH-2 Gardener of Nurgle', () => {
    // the Scrivener stands on the South marker (-6,-6); the Kings elsewhere
    function siteGame() {
      const s = game({ enh: GARDENER })
      place(s, SCR, -7, -6.4)
      place(s, KINGS, 5, -4)
      s.phase = 'movement'
      return s
    }

    it('MON-ENH-2 needs the general on an objective no enemy contests; 3+ desecrates it; friendly units contesting it have Ward 4+', () => {
      const s = siteGame()
      expect(offered(s, 'A', 'movement')).toContain(GARDENER_AB)
      const ctx = ctxFor(s, [3])
      useOnce(ctx, 'movement', 'A', GARDENER_AB)
      expect(s.mission.custom.mnDesecrated).toEqual({ 'obj-a': 'A' })
      expect(wardOf(s, SCR)).toBe(4)
      expect(wardOf(s, KINGS)).toBe(5) // not on it
      place(s, KINGS, -7.5, -4.5) // on the marker
      expect(wardOf(s, KINGS)).toBe(4)
      // the enemy does not get it
      place(s, BRUTE, -4.5, -6.3)
      expect(wardOf(s, SCR)).toBe(4)
      // an enemy on the objective stops a new try, a general off it too
      const t = siteGame()
      place(t, BRUTE, -4.8, -6.4)
      expect(offered(t, 'A', 'movement')).not.toContain(GARDENER_AB)
      const u = siteGame()
      place(u, SCR, 4, -4)
      expect(offered(u, 'A', 'movement')).not.toContain(GARDENER_AB)
      // a roll of 2 or less does nothing and the ability is spent
      const v = siteGame()
      useOnce(ctxFor(v, [2]), 'movement', 'A', GARDENER_AB)
      expect(v.mission.custom.mnDesecrated).toBeUndefined()
      expect(wardOf(v, SCR)).toBe(5)
      expect(offered(v, 'A', 'movement')).not.toContain(GARDENER_AB)
    })

    it('MON-ENH-2 the opponent gaining control ends it for good; an uncontrolled objective stays desecrated', () => {
      const s = siteGame()
      const ctx = ctxFor(s, [4])
      useOnce(ctx, 'movement', 'A', GARDENER_AB)
      expect(wardOf(s, SCR)).toBe(4)
      s.objectives['obj-a'].controller = 'A'
      expect(wardOf(s, SCR)).toBe(4)
      s.objectives['obj-a'].controller = null // nobody holds it: still desecrated
      expect(wardOf(s, SCR)).toBe(4)
      s.objectives['obj-a'].controller = 'B'
      expect(wardOf(s, SCR)).toBe(5)
      abilityService.runWindow(ctx, 'hero', 'A') // the next ability window tidies the ledger up
      expect(s.mission.custom.mnDesecrated).toEqual({})
      s.objectives['obj-a'].controller = 'A'
      expect(wardOf(s, SCR)).toBe(5) // not back when retaken
    })
  })

  it('MON-ENH-3 Pestilent Breath: your shooting phase, one D6 per model of an enemy unit within 7" of the general (no line of sight), each 5+ = 1 mortal; the general may still shoot', () => {
    const s = game({ enh: BREATH })
    s.phase = 'shooting'
    centreRow(s, SCR, 0, -8)
    centreRow(s, GUARD, 0, -3) // 10 models, a gap of about 4"
    centreRow(s, BRUTE, 0, 6)
    expect(offered(s, 'A', 'shooting')).toContain(BREATH_AB)
    expect(offered(s, 'B', 'shooting')).not.toContain(BREATH_AB)
    const ctx = ctxFor(s, [5, 6, 4, 1, 1, 1, 1, 1, 1, 1])
    useOnce(ctx, 'shooting', 'A', BREATH_AB)
    expect(slainBy(evOf(ctx))).toBe(2) // two 5+ dice
    expect(leftOver(ctx)).toEqual([])
    // not a Shoot ability: the general has not shot and still can, and the breath is spent for the phase
    expect(s.units[SCR].turn.shotThisPhase).toBe(false)
    expect(unitEligibleToShoot(ctx, SCR)).toBe(true)
    expect(buildShootingWeaponEntries(ctx, SCR).some((e) => e.weaponId === W('disgusting-sneezes') && e.legalTargets.includes(GUARD))).toBe(true)
    expect(offered(s, 'A', 'shooting')).not.toContain(BREATH_AB)
    // no visibility needed
    const t = game({ enh: BREATH })
    t.phase = 'shooting'
    centreRow(t, SCR, 0, -8)
    centreRow(t, GUARD, 0, -3)
    const seen = losService.unitVisible
    try {
      losService.unitVisible = () => false
      expect(offered(t, 'A', 'shooting')).toContain(BREATH_AB)
    } finally { losService.unitVisible = seen }
    // more than 7" away: nobody to breathe on
    centreRow(t, GUARD, 0, 2)
    expect(offered(t, 'A', 'shooting')).not.toContain(BREATH_AB)
    // other phases: not offered
    centreRow(t, GUARD, 0, -3)
    expect(offered(t, 'A', 'hero')).not.toContain(BREATH_AB)
  })

  it('MON-ENH-4 Gift of Febrile Frenzy: once per battle in a combat phase, melee weapons of friendly units wholly within 7" of the general get +1 Attacks until the phase ends; Companion weapons do not', () => {
    const s = game({ enh: FRENZY })
    s.phase = 'fight'
    centreRow(s, SCR, 0, -6)
    centreRow(s, KINGS, 0, -3.3)
    centreRow(s, BL1, -5.2, -3.3)
    centreRow(s, PB1, 11, -6)
    centreRow(s, BRUTE, 0, 0)
    expect(offered(s, 'A', 'fight')).toContain(FRENZY_AB)
    expect(offered(s, 'B', 'fight')).not.toContain(FRENZY_AB)
    expect(effA(s, KINGS, W('blighted-weapon'))).toBe(4)
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'fight', 'A', FRENZY_AB)
    expect(effA(s, KINGS, W('blighted-weapon'))).toBe(5)
    expect(effA(s, SCR, W('distended-maw'))).toBe(4) // the general counts itself
    expect(effA(s, BL1, W('blighted-scythe'))).toBe(4)
    expect(effA(s, BL1, W('rot-fly-mouthparts'))).toBe(6) // Companion
    expect(effA(s, PB1, W('plaguesword'))).toBe(1) // too far away
    expect(effA(s, SCR, W('disgusting-sneezes'))).toBe('D6') // ranged
    // the scope is read at each attack: a unit that leaves loses it, one that arrives gains it
    centreRow(s, KINGS, 0, 6)
    expect(effA(s, KINGS, W('blighted-weapon'))).toBe(4)
    centreRow(s, PB1, 0, -9)
    expect(effA(s, PB1, W('plaguesword'))).toBe(2)
    // once per battle, and the bonus ends with the phase
    expect(offered(s, 'A', 'fight')).not.toContain(FRENZY_AB)
    s.round = 3
    expect(offered(s, 'A', 'fight')).not.toContain(FRENZY_AB)
    effectService.expire(ctx, 'phaseEnd', null)
    expect(effA(s, PB1, W('plaguesword'))).toBe(1)
  })
})

describe('MON-AB warscroll abilities', () => {
  it('MON-AB-1 Keep Counting: a Plaguebearers unit wholly within 14" gets +1 melee Attacks or +1 to save rolls until the start of your next turn; other units cannot be picked', () => {
    const s = game()
    centreRow(s, SCR, 0, -8)
    centreRow(s, PB1, 0, -5)
    centreRow(s, KINGS, 5, -8)
    centreRow(s, BL1, -6, -8)
    const targets = (codeHooks.nurgleKeepCounting.activate!.targets as unknown as (st: GameState, u: UnitId | null) => UnitId[])(s, SCR)
    expect(targets).toEqual([PB1]) // the reserve Plaguebearers are not on the board
    expect(offered(s, 'A', 'hero')).toContain(COUNTING)
    // Tally of Blows
    const ctx = ctxFor(s, [])
    const r = useOnce(ctx, 'hero', 'A', COUNTING, { mode: 'tally-of-blows' })
    expect(r.topics).toContain('abilityMode')
    expect(effA(s, PB1, W('plaguesword'))).toBe(2)
    expect(effA(s, KINGS, W('blighted-weapon'))).toBe(4)
    effectService.expire(ctx, 'nextOwnTurn', 'B') // the opponent's turn start does not end it
    expect(effA(s, PB1, W('plaguesword'))).toBe(2)
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(effA(s, PB1, W('plaguesword'))).toBe(1)
    // once per phase for the unit
    expect(offered(s, 'A', 'hero')).not.toContain(COUNTING)
    // Recorded Stamina: +1 to the save: a 5 saves a Guard spear (Rend 0) against Sv 6+
    const t = game()
    centreRow(t, SCR, 0, -8)
    centreRow(t, PB1, 0, -3)
    centreRow(t, GUARD, 0, 0)
    useOnce(ctxFor(t, []), 'hero', 'A', COUNTING, { mode: 'recorded-stamina' })
    const saved = attack(t, 'melee', [4, 4, 5], GUARD, 'fx.w.guard-spear', PB1, 1)
    expect(of(saved.events, 'SaveRolled').map((e) => e.saved)).toEqual([true])
    expect(saved.rng.remaining).toEqual([])
    const u = game()
    centreRow(u, PB1, 0, -3)
    centreRow(u, GUARD, 0, 0)
    const lost = attack(u, 'melee', [4, 4, 5, 1], GUARD, 'fx.w.guard-spear', PB1, 1)
    expect(of(lost.events, 'SaveRolled').map((e) => e.saved)).toEqual([false])
    expect(lost.rng.remaining).toEqual([])
    // more than 14" away: not a target
    const v = game()
    centreRow(v, SCR, -12, -8)
    centreRow(v, PB1, 8, -8)
    expect(offered(v, 'A', 'hero')).not.toContain(COUNTING)
  })

  it('MON-AB-2 Wrack and Ruin: only in a charge phase after the Blightlord charged, against an enemy within 1"; 2+ = D3 mortal', () => {
    const s = game()
    s.phase = 'charge'
    centreRow(s, BL1, 0, -2.8)
    centreRow(s, BRUTE, 0, 0)
    expect(unitGap(s, BL1, BRUTE)).toBeLessThanOrEqual(1)
    expect(offered(s, 'A', 'charge')).not.toContain(WRACK) // it has not charged
    s.units[BL1].turn.chargedThisTurn = true
    expect(offered(s, 'A', 'charge')).toContain(WRACK)
    expect(offered(s, 'A', 'fight')).not.toContain(WRACK)
    expect(offered(s, 'B', 'charge')).not.toContain(WRACK)
    const hp = wounds(s, BRUTE)
    const ctx = ctxFor(s, [2, 6]) // 2 passes, D3 face 6 = 3
    useOnce(ctx, 'charge', 'A', WRACK)
    expect(wounds(s, BRUTE)).toBe(hp - 3)
    expect(leftOver(ctx)).toEqual([])
    expect(offered(s, 'A', 'charge')).not.toContain(WRACK) // once per phase
    // a roll of 1 does nothing
    const t = game()
    t.phase = 'charge'
    centreRow(t, BL1, 0, -2.8)
    centreRow(t, BRUTE, 0, 0)
    t.units[BL1].turn.chargedThisTurn = true
    useOnce(ctxFor(t, [1]), 'charge', 'A', WRACK)
    expect(wounds(t, BRUTE)).toBe(hp)
    // an enemy at 2" (in combat range but not within 1") cannot be picked
    const u = game()
    u.phase = 'charge'
    centreRow(u, BL1, 0, -4.8)
    centreRow(u, BRUTE, 0, 0)
    u.units[BL1].turn.chargedThisTurn = true
    expect(unitGap(u, BL1, BRUTE)).toBeGreaterThan(1)
    expect(offered(u, 'A', 'charge')).not.toContain(WRACK)
  })

  describe('MON-AB-3 Relentless Attackers', () => {
    // the Blightkings in a row beside the target; returns how many Kings are within 3" of any target model
    function relentlessGame(target: UnitId, kx = 0) {
      const s = game()
      centreRow(s, target, 0, 0)
      centreRow(s, KINGS, kx, -3.3)
      const n = unitModels(s, KINGS).filter((k) => unitModels(s, target).some((t) => horizontalGap(k, t) <= 3 + 1e-6)).length
      return { s, n }
    }

    it('MON-AB-3 end of any turn: one die per Blightking within 3" of the Infantry target; each die above its printed Health = 1 mortal', () => {
      const { s, n } = relentlessGame(BRUTE, 7) // only the nearest Kings reach
      expect(n).toBeGreaterThan(0)
      expect(n).toBeLessThan(5)
      s.activePlayer = 'B'
      expect(offered(s, 'A', 'endOfTurn')).toContain(RELENTLESS)
      const hp = wounds(s, BRUTE)
      const dice = [4, 6, 3, 5, 5].slice(0, n) // Health 3: 4, 6 and 5 count
      const ctx = ctxFor(s, dice)
      useOnce(ctx, 'endOfTurn', 'A', RELENTLESS, { target: BRUTE })
      const expected = dice.filter((d) => d > 3).length
      expect(wounds(s, BRUTE)).toBe(hp - expected)
      expect(leftOver(ctx)).toEqual([])
      expect(offered(s, 'A', 'endOfTurn')).not.toContain(RELENTLESS) // once per turn
      // Health 1: a 2+ scores
      const { s: t, n: m } = relentlessGame(GUARD)
      const dice2 = [1, 2, 3, 1, 6].slice(0, m)
      const ctx2 = ctxFor(t, dice2)
      useOnce(ctx2, 'endOfTurn', 'A', RELENTLESS, { target: GUARD })
      expect(slainBy(evOf(ctx2))).toBe(dice2.filter((d) => d > 1).length)
      expect(leftOver(ctx2)).toEqual([])
    })

    it('MON-AB-3 non-Infantry targets are refused, and so is any unit with a printed Health of 6 or more', () => {
      const s = game()
      centreRow(s, KINGS, 0, -3.3)
      centreRow(s, BOSS, 0, 0) // Infantry but Health 8: the dice can never beat it
      expect(offered(s, 'A', 'endOfTurn')).not.toContain(RELENTLESS)
      const hawkGame = game()
      centreRow(hawkGame, KINGS, 0, -3.3)
      centreRow(hawkGame, 'B:hawk', 0, 0) // FLY, not Infantry
      expect(unitGap(hawkGame, KINGS, 'B:hawk')).toBeLessThan(3)
      expect(offered(hawkGame, 'A', 'endOfTurn')).not.toContain(RELENTLESS)
      // the same hawk with the INFANTRY keyword would be a target (Health 4), so the keyword is what refuses it
      const infantryHawk = game({ patch: (b) => { b.datasheets['fx.hawk'].keywords = ['INFANTRY'] } })
      centreRow(infantryHawk, KINGS, 0, -3.3)
      centreRow(infantryHawk, 'B:hawk', 0, 0)
      expect(offered(infantryHawk, 'A', 'endOfTurn')).toContain(RELENTLESS)
      // and it needs to be in combat with the Kings
      const far = game()
      centreRow(far, GUARD, 0, 0)
      centreRow(far, KINGS, 0, -9)
      expect(offered(far, 'A', 'endOfTurn')).not.toContain(RELENTLESS)
    })
  })

  it('MON-AB-4 Cloud of Flies: -1 to hit for shooting attacks against Plaguebearers; melee attacks and other units are unchanged', () => {
    const BOW = 'fx.w.test-bow'
    const s = game({ patch: (b) => {
      b.weapons[BOW] = { id: BOW, name: 'Test bow', type: 'ranged', range: 24, A: 2, skill: 4, wound: 4, rend: 0, D: 1, abilities: [] }
      b.datasheets['fx.guard'].composition[0].weapons.default.push(BOW)
    } })
    centreRow(s, PB1, 0, 0)
    centreRow(s, KINGS, 0, 6)
    centreRow(s, GUARD, 0, -10)
    // the bow hits on 4+, so a 4 misses the Plaguebearers (5+) and nothing else is rolled
    const miss = attack(s, 'ranged', [4], GUARD, BOW, PB1, 1)
    expect(of(miss.events, 'HitRolled').map((h) => h.hit)).toEqual([false])
    expect(miss.rng.remaining).toEqual([])
    // a 5 still hits (wound 4+ fails with a 1)
    const hit = attack(s, 'ranged', [5, 1], GUARD, BOW, PB1, 1)
    expect(of(hit.events, 'HitRolled').map((h) => h.hit)).toEqual([true])
    expect(hit.rng.remaining).toEqual([])
    // the Blightkings have no cloud: a 4 hits
    const kings = attack(s, 'ranged', [4, 1], GUARD, BOW, KINGS, 1)
    expect(of(kings.events, 'HitRolled').map((h) => h.hit)).toEqual([true])
    // melee: the Guard's spear hits on 4+ whatever the target
    centreRow(s, GUARD, 0, -3)
    const melee = attack(s, 'melee', [4, 1], GUARD, 'fx.w.guard-spear', PB1, 1)
    expect(of(melee.events, 'HitRolled').map((h) => h.hit)).toEqual([true])
  })
})

describe('MON-WEAP weapons', () => {
  it('MON-WEAP-1 Disgusting Sneezes: D6 attacks hitting on 2+ at 7", and it can shoot while the Scrivener is in combat', () => {
    const w = (weaponsJson as unknown as WeaponData[]).find((x) => x.id === W('disgusting-sneezes'))!
    expect(w).toMatchObject({ type: 'ranged', range: 7, A: 'D6', skill: 2, wound: 4, rend: 0, D: 1, abilities: [{ ability: 'SHOOT_IN_COMBAT' }] })
    const s = game()
    centreRow(s, SCR, 0, -3.3)
    centreRow(s, BRUTE, 0, 0)
    expect(losService.unitInCombat(s, SCR)).toBe(true)
    const ctx = ctxFor(s, [])
    expect(unitEligibleToShoot(ctx, SCR)).toBe(true)
    expect(buildShootingWeaponEntries(ctx, SCR).some((e) => e.weaponId === W('disgusting-sneezes') && e.legalTargets.includes(BRUTE))).toBe(true)
    // A rolls 3, the hits roll 2 / 1 / 6 (2+ hits twice), two wound rolls 4 and 3 (one wounds), the Brute fails its 3+ save with a 1
    const a = attack(s, 'ranged', [3, 2, 1, 6, 4, 3, 1], SCR, W('disgusting-sneezes'), BRUTE, null)
    expect(of(a.events, 'HitRolled').map((h) => h.hit)).toEqual([true, false, true])
    expect(a.rng.remaining).toEqual([])
    expect(wounds(s, BRUTE)).toBe(8)
  })

  it('MON-WEAP-2 Plaguesword: a critical hit becomes 1 mortal damage (no wound or save roll) and still feeds Diseased', () => {
    const s = game()
    centreRow(s, PB1, 0, -3.3)
    centreRow(s, GUARD, 0, 0)
    // three attacks: 6 (critical -> mortal), 4 (plain hit, wounds on 3+, the Guard's save 4+ fails), 1 (miss)
    const a = attack(s, 'melee', [6, 4, 1, 3, 1], PB1, W('plaguesword'), GUARD, 3)
    expect(of(a.events, 'WoundRolled')).toHaveLength(1)
    expect(of(a.events, 'SaveRolled')).toHaveLength(1)
    expect(slainBy(a.events)).toBe(2) // the mortal and the unsaved wound
    expect(a.rng.remaining).toEqual([])
    expect(diseasePoints(s, 'A')).toBe(1)
  })

  it('MON-WEAP-3 Rot Fly\'s Mouthparts and Sting is a Companion weapon: unaffected by friendly characteristic boosts', () => {
    const s = game({ enh: FRENZY })
    const flyW = (weaponsJson as unknown as WeaponData[]).find((x) => x.id === W('rot-fly-mouthparts'))!
    expect(flyW.abilities).toEqual([{ ability: 'COMPANION' }])
    expect(flyW).toMatchObject({ A: 6, skill: 4, wound: 2, rend: 0, D: 1 })
    centreRow(s, SCR, 0, -6)
    centreRow(s, BL1, -4, -6)
    // a plain friendly +1 Attacks (any source) skips the Companion weapon, the Scythe takes it
    effectService.grant(ctxFor(s, []), BL1, { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } }, { sourceAbilityId: 'test', sourceUnitId: BL1, scope: { who: 'self' }, duration: 'untilEndOfPhase' })
    expect(effA(s, BL1, W('blighted-scythe'))).toBe(4)
    expect(effA(s, BL1, W('rot-fly-mouthparts'))).toBe(6)
    // and the Gift of Febrile Frenzy does not name Companions either
    s.phase = 'fight'
    useOnce(ctxFor(s, []), 'fight', 'A', FRENZY_AB)
    expect(effA(s, BL1, W('rot-fly-mouthparts'))).toBe(6)
  })
})

describe('MON-AI', () => {
  it('MON-AI-1 hints: the bot spends every disease point at the end of a turn while a target exists, and picks a kill first', async () => {
    const s = game()
    setDisease(s, 4)
    centreRow(s, BRUTE, 0, 0)
    centreRow(s, KINGS, 0, -3.3)
    centreRow(s, GUARD, 9, 0)
    centreRow(s, SCR, 9, -3)
    for (const id of [...s.units[GUARD].models].slice(2)) removeModel(s, id) // two Guard models: the likely kill
    s.phase = 'fight'
    const ai = new UtilityDecider('normal', 'mon-ai')
    const ctx = ctxFor(s, [1, 1, 1, 1, 1, 1])
    const firstPick: string[] = []
    let guard = 0
    while (guard++ < 20 && abilityService.runWindow(ctx, 'endOfTurn', 'A')) {
      const p = s.pending as ChooseOptionDecision
      const legal = legalActions(s, p)!
      const action = await ai.decide(view(s, 'A'), p, legal)
      if (p.context.topic === 'abilityChoice' && firstPick.length === 0 && action.type === 'chooseOption') firstPick.push(action.optionId)
      s.pending = null
      const handler = p.context.topic === 'abilityChoice' ? hookService.handler : abilityService.handler
      expect(handler.handle(ctx, action, p)).toBeUndefined()
    }
    expect(diseasePoints(s, 'A')).toBe(0)
    expect(firstPick).toEqual([GUARD])
    // hints: Frenzy waits for a real brawl, Keep Counting prefers the Plaguebearers that are fighting
    const t = game({ enh: FRENZY })
    t.phase = 'fight'
    centreRow(t, SCR, 0, -8)
    expect(nurgleAbilityTiming(t, 'A', 'nurgleFebrileFrenzy', SCR)).toBeLessThan(-2)
    centreRow(t, BRUTE, 0, -5)
    centreRow(t, BL1, 4.5, -5) // both the Scrivener and the Blightlord are in combat, wholly within 7"
    expect(nurgleAbilityTiming(t, 'A', 'nurgleFebrileFrenzy', SCR)).toBeGreaterThanOrEqual(0)
    centreRow(t, PB1, -5.5, -8)
    centreRow(t, GUARD, -5.5, -5)
    expect(nurgleTargetBonus(t, 'A', 'nurgleKeepCounting', PB1)).toBeGreaterThanOrEqual(0)
    expect(nurgleModeBonus(t, 'nurgleKeepCounting', SCR, 'tally-of-blows', PB1)).toBeGreaterThan(nurgleModeBonus(t, 'nurgleKeepCounting', SCR, 'recorded-stamina', PB1) as number)
  })

  it('MON-AI-1 whole games: the Nurgle AI plays full games against Cities, arrives with both reserve units in round 3, and has spent its disease points at every turn end, with every regiment ability and enhancement', async () => {
    const full = await loadBundle()
    const picks = [
      { reg: 'nurgle.ability.infested-with-wonders', enh: 'nurgle.enh.pestilent-breath' },
      { reg: 'nurgle.ability.locus-of-fecundity', enh: 'nurgle.enh.summoner-of-plaguebearers' },
      { reg: 'nurgle.ability.infested-with-wonders', enh: 'nurgle.enh.gardener-of-nurgle' },
      { reg: 'nurgle.ability.locus-of-fecundity', enh: 'nurgle.enh.gift-of-febrile-frenzy' },
    ]
    for (const [g, pick] of picks.entries()) {
      const seed = `mon-${g}`
      const setup = makeSimSetup(full, g, DATA_VERSION, ['nurgle', 'cities'])
      let me: PlayerId = 'A'
      for (const p of ['A', 'B'] as const) if (setup.players[p].faction === 'nurgle') { me = p; setup.players[p].regimentAbilityId = pick.reg; setup.players[p].enhancementId = pick.enh }
      const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
      let r = createGame(setup, seed, full)
      const arrived: Record<string, number> = {}
      let prev = r.state
      for (let n = 0; r.pending && n < 8000; n++) {
        const legal = legalActions(r.state, r.pending)!
        r = step(r.state, await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal))
        expect(r.rejection).toBeUndefined()
        // the turn changed hands: every point had been spent, or no enemy unit was in combat with a friendly unit
        if (r.state.activePlayer !== prev.activePlayer || r.state.round !== prev.round) {
          expect(diseasePoints(r.state, me) === 0 || embraceTargets(r.state, me).length === 0, `game ${g} round ${prev.round}: unspent disease points`).toBe(true)
        }
        for (const u of Object.values(r.state.units)) if (u.player === me && u.reserveArrival && u.location !== 'reserves' && arrived[u.id] === undefined) arrived[u.id] = r.state.round
        prev = r.state
      }
      expect(r.state.phase).toBe('ended')
      for (const id of Object.keys(arrived)) expect(arrived[id], `${id} arrives in round 3`).toBe(3)
    }
  }, 600000)
})
