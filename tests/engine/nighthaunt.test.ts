// Nighthaunt (Slasher Host) code hooks and rules: docs/spec/factions/nighthaunt.md, test ids NH-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/nighthaunt files on top of the AoS fixture bundle
// (player A = Slasher Host, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data
// except where a test says so (a Rend 2 enemy weapon, a ranged enemy weapon).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, createGame, legalActions, removeModel, step, unitModels, view,
  type AbilityWindow, type ChooseOptionDecision, type DeclaredTarget, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { makeSimSetup } from '../../tools/sim-core'
import { DATA_VERSION, loadBundle } from '../../src/data'
import { attackService, feelNoPainFor } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { movementModule } from '../../src/engine/phases/movement'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { nighthauntAbilityTiming, nighthauntTargetBonus } from '../../src/engine/factions/nighthaunt'
import type { Action, ModelPlacement } from '../../src/engine/actions'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/nighthaunt/abilities.json'
import enhancementsJson from '../../src/data/factions/nighthaunt/enhancements.json'
import weaponsJson from '../../src/data/factions/nighthaunt/weapons.json'
import factionJson from '../../src/data/factions/nighthaunt/faction.json'
import patrolJson from '../../src/data/factions/nighthaunt/patrols/slasher-host.json'
import knightJson from '../../src/data/factions/nighthaunt/datasheets/knight-of-shrouds.json'
import hostsJson from '../../src/data/factions/nighthaunt/datasheets/spirit-hosts.json'
import reapersJson from '../../src/data/factions/nighthaunt/datasheets/grimghast-reapers.json'
import chainraspsJson from '../../src/data/factions/nighthaunt/datasheets/chainrasps.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [knightJson, hostsJson, reapersJson, chainraspsJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.nighthaunt = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const ETHEREAL = 'nighthaunt.ability.ethereal'
const WAVE = 'nighthaunt.ability.wave-of-terror'
const STALKERS = 'nighthaunt.ability.death-stalkers'
const CHORUS = 'nighthaunt.ability.chorus-of-terror'
const DISC = 'nighthaunt.ability.discorporate'
const EDGE = 'nighthaunt.enh.shadows-edge'
const SOULFIRE = 'nighthaunt.enh.soulfire-ring'
const CLOAK = 'nighthaunt.enh.cloaked-in-shadow'
const BEACON = 'nighthaunt.enh.beacon-of-nagashizzar'
const SOULFIRE_AB = 'nighthaunt.ability.soulfire-ring'
const BEACON_AB = 'nighthaunt.ability.beacon-of-nagashizzar'

const KNIGHT = 'A:knight-of-shrouds'
const HOSTS = 'A:spirit-hosts'
const REAP1 = 'A:grimghast-reapers-1'
const REAP2 = 'A:grimghast-reapers-2'
const RASP1 = 'A:chainrasps-1'
const RASP2 = 'A:chainrasps-2'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'

const W = (id: string) => `nighthaunt.weapon.${id}`
const SWORD = W('sword-of-stolen-hours')

// the unit's models in a tight row centred on (cx, cz); 7+ models go in two rows so every model keeps two neighbours (coherency)
function centreRow(s: GameState, unitId: UnitId, cx: number, cz: number): void {
  const ms = unitModels(s, unitId)
  const r = Math.max(...ms.map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0)))
  const stepX = 2 * r + 0.15
  s.units[unitId].location = 'board'
  const rows = ms.length >= 7 ? 2 : 1
  const cols = Math.ceil(ms.length / rows)
  ms.forEach((m, i) => {
    const col = i % cols, row = Math.floor(i / cols)
    m.pos = { x: cx + (col - (cols - 1) / 2) * stepX, y: 0, z: cz + (rows === 1 ? 0 : (row - 0.5) * stepX) }
  })
}

// keep only the first `n` models of a unit (they are not "slain": no destroyedModels entry)
const trim = (s: GameState, unitId: UnitId, n: number): void => {
  for (const id of [...s.units[unitId].models].slice(n)) { delete s.models[id]; s.units[unitId].models = s.units[unitId].models.filter((m) => m !== id) }
}

// one model of the unit on the board at (x, z), the rest dropped (not slain)
function put(s: GameState, unitId: UnitId, x: number, z: number): void {
  trim(s, unitId, 1)
  s.units[unitId].location = 'board'
  unitModels(s, unitId)[0].pos = { x, y: 0, z }
}

// the smallest edge-to-edge gap between two units
const unitGap = (s: GameState, a: UnitId, b: UnitId): number =>
  Math.min(...unitModels(s, a).flatMap((m) => unitModels(s, b).map((o) => horizontalGap(m, o))))

function place(s: GameState, unitId: UnitId, x: number, z: number, gap = 0.15): void {
  s.units[unitId].location = 'board'
  let cx = x
  for (const m of unitModels(s, unitId)) {
    const r = Math.max(m.base.radius, m.base.radius2 ?? 0)
    m.pos = { x: cx + r, y: 0, z }
    cx += 2 * r + gap
  }
}

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'nighthaunt', patrolId: 'nighthaunt.army.slasher-host', enhancementId: opts.enh ?? SOULFIRE, regimentAbilityId: opts.reg ?? CHORUS }),
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

// use one ability once; every other offer is declined
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string } = {}) {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
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
const ward = (s: GameState, id: UnitId): number | undefined => feelNoPainFor(ctxFor(s, []), s.units[id].models[0], {} as never)?.threshold

// ---------- attacks with scripted dice ----------
function attack(s: GameState, kind: 'ranged' | 'melee', dice: number[], attackerUnitId: UnitId, weaponId: string, targetUnitId: UnitId, attacks: number | null) {
  s.phase = kind === 'ranged' ? 'shooting' : 'fight'
  const modelId = s.units[attackerUnitId].models.find((id) => s.models[id].weapons.includes(weaponId))!
  const target: DeclaredTarget = { modelId, weaponId, targetUnitId, profileGroup: null, attacks }
  const rng = new ScriptedRng(dice)
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  attackService.begin(ctx, { kind, attackerUnitId, overwatch: false, targets: [target] })
  const result = attackService.advance(ctx)
  return { events, rng, ctx, result }
}

// battle-long marker effects (ensureEffects) are put on the units whenever an ability window opens; a test that attacks directly opens one first
const warm = (s: GameState): void => { runWindow(ctxFor(s), 'hero', 'A', () => 'pass') }

const BRUTE_AXE = 'fx.w.brute-axe'
const setWeapon = (b: DataBundle, id: string, patch: Partial<WeaponData>): void => { b.weapons[id] = { ...b.weapons[id], ...patch } }

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('NH-REG every code in the Nighthaunt data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('NH-ARMY-1 the army builds in the engine: Knight of Shrouds general, 6 units, 34 models, stats as printed', () => {
    const s = game({ enh: EDGE })
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(6)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(34)
    expect(s.players.A.warlordUnitId).toBe(KNIGHT)
    expect(s.players.A.battleTraitIds).toEqual([ETHEREAL, WAVE])
    expect(s.players.A.regimentAbilityId).toBe(CHORUS)
    expect(s.units[KNIGHT].enhancementId).toBe(EDGE)
    const st = (id: string) => s.datasheets[`nighthaunt.unit.${id}`].stats
    expect(st('knight-of-shrouds')).toMatchObject({ M: 8, W: 5, Sv: 4, OC: 2, ward: 6 })
    expect(st('spirit-hosts')).toMatchObject({ M: 8, W: 3, Sv: 4, OC: 1, ward: 6 })
    expect(st('grimghast-reapers')).toMatchObject({ M: 8, W: 1, Sv: 4, OC: 1, ward: 6 })
    expect(st('chainrasps')).toMatchObject({ M: 8, W: 1, Sv: 5, OC: 1, ward: 6 })
    expect(s.datasheets['nighthaunt.unit.knight-of-shrouds'].keywords).toEqual(['HERO', 'INFANTRY', 'FLY'])
    expect(unitModels(s, HOSTS)[0].base.radius).toBeCloseTo(50 / 2 / 25.4, 2)
    expect(unitModels(s, RASP1)[0].base.radius).toBeCloseTo(25 / 2 / 25.4, 2)
  })

  it('NH-ARMY-2 every unit has Ward (6+) in play; only the two Chainrasps units are offered for replacement once destroyed', () => {
    const s = game()
    put(s, KNIGHT, 0, -3) // away from the Spirit Hosts (Drawn to War)
    for (const id of [KNIGHT, HOSTS, REAP1, REAP2, RASP1, RASP2]) expect(ward(s, id), id).toBe(6)
    for (const id of [KNIGHT, HOSTS, REAP1, REAP2, RASP1, RASP2]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A').sort()).toEqual([RASP1, RASP2])
  })

  it('NH-WEAP-1 Crit (Auto-wound): an unmodified 6 to hit skips the wound roll on every Nighthaunt weapon; a 5 still has to wound', () => {
    const wpns: [UnitId, string][] = [[KNIGHT, SWORD], [HOSTS, W('spectral-claws-and-daggers')], [REAP1, W('slasher-scythe')], [RASP1, W('malignant-weapon')]]
    for (const [unit, weapon] of wpns) {
      expect(weaponsJson.find((w) => w.id === weapon)!.abilities).toEqual([{ ability: 'CRIT_AUTO_WOUND' }])
      const s = game()
      put(s, unit, 0, -1.2)
      put(s, GUARD, 0, 0)
      // 6 to hit: no wound roll; the Guard (Sv 4+) rolls a 1 and loses its model (every weapon here does at least 1 damage)
      const r = attack(s, 'melee', [6, 1], unit, weapon, GUARD, 1)
      expect(r.result, weapon).toBe('done')
      expect(r.rng.remaining, weapon).toEqual([])
      expect(s.units[GUARD].location, weapon).toBe('destroyed')
      // 5 to hit: the wound roll is made, a 1 fails it and nothing else is rolled
      const t = game()
      put(t, unit, 0, -1.2)
      put(t, GUARD, 0, 0)
      const r2 = attack(t, 'melee', [5, 1], unit, weapon, GUARD, 1)
      expect(r2.rng.remaining, weapon).toEqual([])
      expect(t.units[GUARD].location, weapon).toBe('board')
    }
  })

  it('NH-FLY-1 all four units carry Fly and cross a friendly model in the way; the same move is refused without Fly', () => {
    const kw = (st: GameState, id: UnitId): string[] => st.datasheets[st.units[id].datasheetId].keywords
    const noFly = (b: DataBundle): void => { b.datasheets['nighthaunt.unit.knight-of-shrouds'] = { ...b.datasheets['nighthaunt.unit.knight-of-shrouds'], keywords: ['HERO', 'INFANTRY'] } }
    const tryMove = (st: GameState, unit: UnitId, from: [number, number], to: [number, number]): string | null => {
      const ctx = ctxFor(st, [])
      st.phase = 'movement'
      put(st, unit, from[0], from[1])
      // a lone friendly blocker (a Reaper) stands midway
      put(st, REAP1, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2)
      st.units[unit].turn.moveType = null
      st.phaseState.marks = []
      st.phaseState.activated = []
      st.pending = null
      st.step = 'select'
      movementModule.enter(ctx)
      movementModule.advance(ctx)
      st.pending = null
      movementModule.handle(ctx, { type: 'chooseUnitToActivate', player: 'A', decisionId: '', unitId: unit }, { kind: 'chooseUnitToActivate' } as never)
      movementModule.advance(ctx)
      st.pending = null
      movementModule.handle(ctx, { type: 'declareMove', player: 'A', decisionId: '', unitId: unit, moveType: 'normal' }, { kind: 'declareMove' } as never)
      st.phaseState.marks.push('mv:declWin:' + unit)
      movementModule.advance(ctx)
      const pending = st.pending as never
      const placements: ModelPlacement[] = [{ modelId: st.units[unit].models[0], pos: { x: to[0], y: 0, z: to[1] } }]
      const rej = movementModule.validate?.(st, { type: 'moveUnit', player: 'A', decisionId: '', unitId: unit, placements } as Action, pending)
      return rej ? rej.code : null
    }
    const s = game()
    for (const id of [KNIGHT, HOSTS, REAP1, REAP2, RASP1, RASP2]) expect(kw(s, id), id).toContain('FLY')
    expect(tryMove(s, KNIGHT, [-4, -5], [3, -5])).toBeNull() // flies over the Reaper standing in the way
    const t = game({ patch: noFly })
    expect(kw(t, KNIGHT)).not.toContain('FLY')
    expect(tryMove(t, KNIGHT, [-4, -5], [3, -5])).not.toBeNull() // the same move on foot is blocked
  })
})

describe('NH-BT battle traits', () => {
  it('NH-BT-1 Ethereal: a 4+ save succeeds on a 4 against Rend 2; a +1 save bonus does not turn a 3 into a success; an unmodified 1 still fails; enemy saves are unaffected', () => {
    const patch = (b: DataBundle): void => setWeapon(b, BRUTE_AXE, { rend: 2, A: 1, D: 1 })
    // Rend 2 against the Knight (Sv 4+): Ethereal keeps it 4+, so a 4 saves. Hit 4, wound 3, save 4
    const s = game({ patch })
    put(s, KNIGHT, 0, -1.4)
    put(s, BRUTE, 0, 0)
    const before = wounds(s, KNIGHT)
    const r = attack(s, 'melee', [4, 3, 4], BRUTE, BRUTE_AXE, KNIGHT, 1)
    expect(r.rng.remaining).toEqual([])
    expect(wounds(s, KNIGHT)).toBe(before)
    // a 3 fails the bare 4+; the +1 save bonus is ignored too
    const t = game({ patch })
    put(t, KNIGHT, 0, -1.4)
    put(t, BRUTE, 0, 0)
    effectService.grant(ctxFor(t), KNIGHT, { modifyRoll: { roll: 'save', value: 1 } }, { sourceAbilityId: 'test.bonus', sourceUnitId: KNIGHT, scope: { who: 'self' }, duration: 'battle' })
    const r2 = attack(t, 'melee', [4, 3, 3, 1], BRUTE, BRUTE_AXE, KNIGHT, 1) // the last die is the ward roll
    expect(r2.rng.remaining).toEqual([])
    expect(wounds(t, KNIGHT)).toBe(before - 1)
    // an unmodified 1 fails whatever else is going on
    const u = game({ patch })
    put(u, KNIGHT, 0, -1.4)
    put(u, BRUTE, 0, 0)
    attack(u, 'melee', [4, 3, 1, 1], BRUTE, BRUTE_AXE, KNIGHT, 1)
    expect(wounds(u, KNIGHT)).toBe(before - 1)
    // enemy saves keep their Rend: the Brute (Sv 3+) against the Knight's Rend 1 sword needs 4+, a 3 fails
    const v = game()
    put(v, KNIGHT, 0, -1.4)
    put(v, BRUTE, 0, 0)
    const bb = wounds(v, BRUTE)
    attack(v, 'melee', [4, 3, 3], KNIGHT, SWORD, BRUTE, 1)
    expect(wounds(v, BRUTE)).toBe(bb - 2)
    const w = game()
    put(w, KNIGHT, 0, -1.4)
    put(w, BRUTE, 0, 0)
    attack(w, 'melee', [4, 3, 4], KNIGHT, SWORD, BRUTE, 1)
    expect(wounds(w, BRUTE)).toBe(bb)
  })

  it('NH-BT-2 Wave of Terror: a charge roll of 10+ gives an enemy within 1" Strike-last this turn; a 9 offers nothing; enemies beyond 1" cannot be picked; each charging unit only once per phase', () => {
    const s = game()
    s.phase = 'charge'
    put(s, RASP1, 0, -1.2)
    put(s, GUARD, 0, 0) // within 1"
    put(s, REAP1, 6, -1.2)
    put(s, BRUTE, 6, 1.5) // 2.5" from the Reapers
    s.units[RASP1].turn.chargedThisTurn = true
    s.units[RASP1].turn.chargeRoll = 9
    expect(offered(s, 'A', 'charge')).not.toContain(WAVE)
    s.units[RASP1].turn.chargeRoll = 10
    expect(offered(s, 'A', 'charge')).toContain(WAVE)
    expect(offered(s, 'B', 'charge')).not.toContain(WAVE) // the other player has nothing that charged
    expect(targetsOf('nighthauntWaveOfTerror', s, null, 'A')).toEqual([GUARD])
    const ctx = ctxFor(s)
    const r = useOnce(ctx, 'charge', 'A', WAVE, { target: GUARD })
    expect(r.topics).toContain('abilityUse')
    expect(s.units[GUARD].turn.fightsLast).toBe(true)
    expect(s.units[BRUTE].turn.fightsLast).toBe(false)
    // the Chainrasps used it this phase; nobody else qualifies
    expect(offered(s, 'A', 'charge')).not.toContain(WAVE)
    // a second charging unit (11) within 1" of the Brute can use it too
    put(s, REAP2, 9, -1.2)
    put(s, BRUTE, 6, 0)
    s.units[REAP1].turn.chargedThisTurn = true
    s.units[REAP1].turn.chargeRoll = 11
    expect(targetsOf('nighthauntWaveOfTerror', s, null, 'A')).toEqual([BRUTE])
    expect(offered(s, 'A', 'charge')).toContain(WAVE)
    useOnce(ctx, 'charge', 'A', WAVE, { target: BRUTE })
    expect(s.units[BRUTE].turn.fightsLast).toBe(true)
    expect(offered(s, 'A', 'charge')).not.toContain(WAVE)
    // the next phase's marks are fresh: the same units may use it again in the next charge phase
    s.phaseState.marks = []
    expect(offered(s, 'A', 'charge')).toContain(WAVE)
    // in the enemy's charge phase a Counter-Charge counts as well
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'charge')).toContain(WAVE)
  })
})

describe('NH-RA regiment abilities', () => {
  it('NH-RA-1 Death Stalkers: offered at the start of battle round 1 only; melee attacks on the picked unit get +1 Rend for the rest of the battle; other targets unaffected', () => {
    const s = game({ reg: STALKERS })
    expect(offered(s, 'A', 'startOfRound')).toContain(STALKERS)
    expect(offered(s, 'B', 'startOfRound')).not.toContain(STALKERS)
    const late = game({ reg: STALKERS })
    late.round = 2
    expect(offered(late, 'A', 'startOfRound')).not.toContain(STALKERS)
    const ctx = ctxFor(s)
    useOnce(ctx, 'startOfRound', 'A', STALKERS, { target: GUARD })
    expect(s.players.A.oathTargetUnitId).toBe(GUARD)
    // once per battle
    expect(offered(s, 'A', 'startOfRound')).not.toContain(STALKERS)
    // the Knight's Rend 1 sword against the Guard (Sv 4+) is Rend 2 now: a 5 fails (6+ needed); against the Brute (Sv 3+) it stays Rend 1: a 4 saves
    put(s, KNIGHT, 0, -1.4)
    put(s, GUARD, 0, 0)
    put(s, BRUTE, 4, 0)
    const g = attack(s, 'melee', [4, 3, 5], KNIGHT, SWORD, GUARD, 1)
    expect(g.rng.remaining).toEqual([])
    expect(s.units[GUARD].location).toBe('destroyed')
    put(s, KNIGHT, 4, -1.4)
    const bb = wounds(s, BRUTE)
    attack(s, 'melee', [4, 3, 4], KNIGHT, SWORD, BRUTE, 1)
    expect(wounds(s, BRUTE)).toBe(bb)
    // a unit that arrives later carries it as well (ensureEffects)
    s.round = 3
    abilityService.usable(s, 'A', 'hero')
    runWindow(ctxFor(s), 'hero', 'A', () => 'pass')
    expect(s.units[RASP2].effects.some((e) => e.sourceAbilityId === STALKERS)).toBe(true)
    // without the regiment ability the same Guard saves on a 5
    const t = game({ reg: CHORUS })
    put(t, KNIGHT, 0, -1.4)
    put(t, GUARD, 0, 0)
    attack(t, 'melee', [4, 3, 5], KNIGHT, SWORD, GUARD, 1)
    expect(t.units[GUARD].location).toBe('board')
  })

  it('NH-RA-2 Chorus of Terror: -1 to hit for melee attacks on a friendly unit that charged this turn; ranged attacks and non-charging units unaffected', () => {
    const s = game()
    put(s, RASP1, 0, -1.2)
    put(s, BRUTE, 0, 0)
    s.units[RASP1].turn.chargedThisTurn = true
    // the Brute (4+ to hit) rolls a 4: -1 makes it a miss
    const r = attack(s, 'melee', [4], BRUTE, BRUTE_AXE, RASP1, 1)
    expect(r.rng.remaining).toEqual([])
    expect(wounds(s, RASP1)).toBe(1)
    // a unit that did not charge is hit on a 4 (then wound 3 fails)
    const t = game()
    put(t, RASP1, 0, -1.2)
    put(t, BRUTE, 0, 0)
    const r2 = attack(t, 'melee', [4, 1], BRUTE, BRUTE_AXE, RASP1, 1)
    expect(r2.rng.remaining).toEqual([])
    // the Reapers did not charge: unaffected even though the Chainrasps did
    const u = game()
    put(u, RASP1, 4, -1.2)
    put(u, REAP1, 0, -1.2)
    put(u, BRUTE, 0, 0)
    u.units[RASP1].turn.chargedThisTurn = true
    const r3 = attack(u, 'melee', [4, 1], BRUTE, BRUTE_AXE, REAP1, 1)
    expect(r3.rng.remaining).toEqual([])
    // ranged attacks are not touched (give the Guard a ranged spear)
    const v = game({ patch: (b) => setWeapon(b, 'fx.w.guard-spear', { type: 'ranged', range: 12, A: 1 }) })
    put(v, RASP1, 0, -4)
    put(v, GUARD, 0, 0)
    v.units[RASP1].turn.chargedThisTurn = true
    const r4 = attack(v, 'ranged', [4, 1], GUARD, 'fx.w.guard-spear', RASP1, 1)
    expect(r4.rng.remaining).toEqual([])
    // the other regiment ability does not penalise
    const w = game({ reg: STALKERS })
    put(w, RASP1, 0, -1.2)
    put(w, BRUTE, 0, 0)
    w.units[RASP1].turn.chargedThisTurn = true
    const r5 = attack(w, 'melee', [4, 1], BRUTE, BRUTE_AXE, RASP1, 1)
    expect(r5.rng.remaining).toEqual([])
  })
})

describe('NH-ENH enhancements', () => {
  it('NH-ENH-1 Soulfire Ring: at the end of a turn in which the general slew a model, Heal (D6) the general; no kill, no heal', () => {
    const s = game({ enh: SOULFIRE })
    put(s, KNIGHT, 0, -1.4)
    put(s, GUARD, 0, 0)
    s.models[s.units[KNIGHT].models[0]].woundsRemaining = 1
    expect(offered(s, 'A', 'endOfTurn')).not.toContain(SOULFIRE_AB) // no kill yet
    attack(s, 'melee', [4, 3, 1], KNIGHT, SWORD, GUARD, 1)
    expect(s.units[GUARD].location).toBe('destroyed')
    s.phase = 'fight'
    expect(offered(s, 'A', 'endOfTurn')).toContain(SOULFIRE_AB)
    const ctx = ctxFor(s, [3])
    useOnce(ctx, 'endOfTurn', 'A', SOULFIRE_AB)
    expect(wounds(s, KNIGHT)).toBe(4) // 1 + D6 3
    expect(leftOver(ctx)).toEqual([])
    // healing stops at full Health, and an undamaged general is not offered the ring
    const t = game({ enh: SOULFIRE })
    put(t, KNIGHT, 0, -1.4)
    put(t, GUARD, 0, 0)
    attack(t, 'melee', [4, 3, 1], KNIGHT, SWORD, GUARD, 1)
    expect(offered(t, 'A', 'endOfTurn')).not.toContain(SOULFIRE_AB)
    // damage taken without a kill of its own: nothing
    const u = game({ enh: SOULFIRE })
    put(u, KNIGHT, 0, -1.4)
    put(u, GUARD, 0, 0)
    u.models[u.units[KNIGHT].models[0]].woundsRemaining = 2
    expect(offered(u, 'A', 'endOfTurn')).not.toContain(SOULFIRE_AB)
    // a kill by another unit does not count
    put(u, RASP1, 2, -1.4)
    put(u, BRUTE, 2, 0)
    attack(u, 'melee', [4, 1], RASP1, W('malignant-weapon'), BRUTE, 1)
    expect(offered(u, 'A', 'endOfTurn')).not.toContain(SOULFIRE_AB)
    // a kill from the enemy's turn counts at the end of that turn
    const v = game({ enh: SOULFIRE })
    v.activePlayer = 'B'
    put(v, KNIGHT, 0, -1.4)
    put(v, GUARD, 0, 0)
    v.models[v.units[KNIGHT].models[0]].woundsRemaining = 2
    attack(v, 'melee', [4, 3, 1], KNIGHT, SWORD, GUARD, 1)
    expect(offered(v, 'A', 'endOfTurn')).toContain(SOULFIRE_AB)
  })

  it('NH-ENH-2 Cloaked in Shadow: once one enemy unit has targeted the general this phase, a second enemy unit cannot pick it (shooting and combat); the first unit still can; the claim resets next phase', () => {
    const s = game({ enh: CLOAK, patch: (b) => setWeapon(b, 'fx.w.guard-spear', { type: 'ranged', range: 12, A: 1 }) })
    put(s, KNIGHT, 0, 0)
    put(s, BRUTE, 0, 1.6)
    put(s, BOSS, 1.6, 0)
    s.phase = 'fight'
    expect(hookService.fightTargetForbidden!(s, BRUTE, KNIGHT)).toBe(false)
    expect(hookService.fightTargetForbidden!(s, BOSS, KNIGHT)).toBe(false)
    attack(s, 'melee', [1], BRUTE, BRUTE_AXE, KNIGHT, 1)
    s.phase = 'fight'
    expect(hookService.fightTargetForbidden!(s, BOSS, KNIGHT)).toBe(true) // a second unit may not
    expect(hookService.fightTargetForbidden!(s, BRUTE, KNIGHT)).toBe(false) // the first still can
    expect(hookService.fightTargetForbidden!(s, BOSS, RASP1)).toBe(false) // only the general is protected
    // shooting: the same claim logic in a shooting phase
    s.phaseState.marks = []
    s.phase = 'shooting'
    expect(hookService.shootingTargetForbidden!(s, GUARD, KNIGHT)).toBe(false)
    put(s, GUARD, 6, 0)
    s.units[GUARD].location = 'board'
    attack(s, 'ranged', [1], GUARD, 'fx.w.guard-spear', KNIGHT, 1)
    s.phase = 'shooting'
    expect(hookService.shootingTargetForbidden!(s, BOSS, KNIGHT)).toBe(true)
    expect(hookService.shootingTargetForbidden!(s, GUARD, KNIGHT)).toBe(false)
    // the next phase starts with no claim
    s.phaseState.marks = []
    expect(hookService.shootingTargetForbidden!(s, BOSS, KNIGHT)).toBe(false)
    // without the enhancement nothing is refused
    const t = game({ enh: SOULFIRE })
    put(t, KNIGHT, 0, 0)
    put(t, BRUTE, 0, 1.6)
    put(t, BOSS, 1.6, 0)
    attack(t, 'melee', [1], BRUTE, BRUTE_AXE, KNIGHT, 1)
    t.phase = 'fight'
    expect(hookService.fightTargetForbidden!(t, BOSS, KNIGHT)).toBe(false)
  })

  it('NH-ENH-3 Beacon of Nagashizzar: once per battle in your hero phase, every friendly unit with a slain model gets 1 model back', () => {
    const s = game({ enh: BEACON })
    s.phase = 'command'
    expect(offered(s, 'A', 'hero')).not.toContain(BEACON_AB) // nothing slain yet
    centreRow(s, RASP1, -6, -6)
    centreRow(s, REAP1, 0, -6)
    centreRow(s, HOSTS, 6, -6)
    for (const id of [...s.units[RASP1].models].slice(6)) removeModel(s, id) // 4 slain
    for (const id of [...s.units[REAP1].models].slice(3)) removeModel(s, id) // 2 slain
    removeModel(s, s.units[HOSTS].models[2]) // 1 slain Spirit Host
    expect(offered(s, 'A', 'hero')).toContain(BEACON_AB)
    expect(offered(s, 'B', 'hero')).not.toContain(BEACON_AB)
    const ctx = ctxFor(s)
    useOnce(ctx, 'hero', 'A', BEACON_AB)
    expect(s.units[RASP1].models).toHaveLength(7)
    expect(s.units[REAP1].models).toHaveLength(4)
    expect(s.units[HOSTS].models).toHaveLength(3)
    const host = unitModels(s, HOSTS)[2]
    expect(host.woundsRemaining).toBe(3) // back at full Health
    expect(unitModels(s, RASP2)).toHaveLength(10) // nothing to return, nothing changed
    // once per battle
    expect(offered(s, 'A', 'hero')).not.toContain(BEACON_AB)
    s.round = 3
    expect(offered(s, 'A', 'hero')).not.toContain(BEACON_AB)
  })

  it('NH-ENH-4 Shadow\'s Edge: the Sword then has Crit (Mortal) and Crit (Auto-wound); the attacking player picks one before the dice; Crit (Mortal) turns a critical hit into 2 mortal damage; the AI picks Crit (Mortal)', () => {
    const s = game({ enh: EDGE })
    put(s, KNIGHT, 0, -1.4)
    put(s, BRUTE, 0, 0)
    const s2 = game({ enh: SOULFIRE })
    put(s2, KNIGHT, 0, -1.4)
    put(s2, BRUTE, 0, 0)
    // another enhancement: only the printed ability, no pick is asked
    expect(attack(s2, 'melee', [6, 3, 1], KNIGHT, SWORD, BRUTE, 1).result).toBe('done')
    // with Shadow's Edge: a pick is asked before any die is rolled
    s.phase = 'fight'
    const modelId = s.units[KNIGHT].models[0]
    const rng = new ScriptedRng([6])
    const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: KNIGHT, overwatch: false, targets: [{ modelId, weaponId: SWORD, targetUnitId: BRUTE, profileGroup: null, attacks: 1 }] })
    expect(attackService.advance(ctx)).toBe('pending')
    expect(of(events, 'HitRolled')).toHaveLength(0)
    const p = s.pending as ChooseOptionDecision
    expect(p.context.topic).toBe('critChoice')
    expect(p.player).toBe('A')
    expect(p.options.map((o) => o.id).sort()).toEqual(['CRIT_AUTO_WOUND', 'CRIT_MORTAL'])
    // the Brute (Sv 3+, Rend 1: 4+) takes more from the mortal pick: 2 damage always vs 2 damage half the time
    const value = (id: string): number => (p.options.find((o) => o.id === id)!.hint as { value: number }).value
    expect(value('CRIT_MORTAL')).toBeGreaterThan(value('CRIT_AUTO_WOUND'))
    s.pending = null
    expect(DEFAULT_MODULES.topics.critChoice?.handle(ctx, { type: 'chooseOption', player: 'A', decisionId: p.id, optionId: 'CRIT_MORTAL' }, p)).toBeUndefined()
    expect(attackService.advance(ctx)).toBe('done')
    expect(rng.remaining).toEqual([])
    expect(of(events, 'SaveRolled')).toHaveLength(0) // mortal damage skips the save
    expect(wounds(s, BRUTE)).toBe(3 - 2)
    expect(of(events, 'DamageApplied').every((d) => d.mortal)).toBe(true)
  })
})

describe('NH-AB warscroll abilities', () => {
  it('NH-AB-1 Discorporate: a friendly unit wholly within 9" of the Knight (or the Knight) gets Ward (5+) until your next turn; a unit partly outside 9" cannot be picked', () => {
    const s = game()
    s.phase = 'command'
    put(s, KNIGHT, 0, -6)
    put(s, RASP1, 8, -6) // wholly within 9"
    put(s, REAP1, 9.4, -6) // 8.3" gap but its far edge is past 9"
    put(s, REAP2, -14, -6)
    const targets = targetsOf('nighthauntDiscorporate', s, KNIGHT, 'A')
    expect(targets).toContain(KNIGHT)
    expect(targets).toContain(RASP1)
    expect(targets).not.toContain(REAP1)
    expect(targets).not.toContain(REAP2)
    expect(targets).not.toContain(GUARD)
    expect(offered(s, 'A', 'hero')).toContain(DISC)
    expect(ward(s, RASP1)).toBe(6)
    const ctx = ctxFor(s)
    useOnce(ctx, 'hero', 'A', DISC, { target: RASP1 })
    expect(ward(s, RASP1)).toBe(5)
    expect(ward(s, REAP1)).toBe(6)
    // once per phase for the Knight; gone at the start of the player's next turn
    expect(offered(s, 'A', 'hero')).not.toContain(DISC)
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(ward(s, RASP1)).toBe(6)
    // the Knight itself
    s.phaseState.marks = []
    s.units[KNIGHT].turn.abilitiesUsedThisPhase = []
    s.players.A.abilityUses = []
    useOnce(ctxFor(s), 'hero', 'A', DISC, { target: KNIGHT })
    expect(ward(s, KNIGHT)).toBe(5)
  })

  it('NH-AB-2 Drawn to War: the general has Ward (4+) within 1" of the Spirit Hosts and drops back to 6+ (or Discorporate\'s 5+) beyond it', () => {
    const s = game()
    put(s, KNIGHT, 0, -6)
    centreRow(s, HOSTS, 8, -6)
    expect(ward(s, KNIGHT)).toBe(6)
    // the Hosts' closest base 0.8" from the Knight's
    centreRow(s, HOSTS, 0, -6 + 0.63 + 0.8 + 0.98)
    expect(unitGap(s, KNIGHT, HOSTS)).toBeLessThan(1)
    expect(ward(s, KNIGHT)).toBe(4)
    expect(ward(s, HOSTS)).toBe(6) // only the general is helped
    expect(ward(s, RASP1)).toBe(6)
    // just outside 1"
    centreRow(s, HOSTS, 0, -6 + 0.63 + 1.2 + 0.98)
    expect(ward(s, KNIGHT)).toBe(6)
    // Discorporate's 5+ is the better ward beyond 1", the Hosts' 4+ wins within it (only the best ward counts)
    effectService.grant(ctxFor(s), KNIGHT, [{ feelNoPain: 5 }], { sourceAbilityId: DISC, sourceUnitId: KNIGHT, scope: { who: 'self' }, duration: 'untilNextTurn' })
    expect(ward(s, KNIGHT)).toBe(5)
    centreRow(s, HOSTS, 0, -6 + 0.63 + 0.8 + 0.98)
    expect(ward(s, KNIGHT)).toBe(4)
    // the Hosts' ward helps the general of their own player only: the enemy Boss next to them is not warded
    put(s, BOSS, 4, 0)
    centreRow(s, HOSTS, 4, -1.5)
    expect(ward(s, BOSS)).toBeUndefined()
  })

  it('NH-AB-3 Reaped Like Corn: Grimghast melee attacks crit on 5+ against a unit of 5+ models, only on 6 against a smaller unit', () => {
    // a 5 to hit with the scythe: a critical hit (Crit (Auto-wound)) skips the wound roll against 5+ models; the 1 is the save roll
    const swing = (unit: UnitId, weapon: string, models: number, dice: number[]) => {
      const s = game()
      warm(s)
      put(s, unit, 0, -1.2)
      centreRow(s, GUARD, 0, 0.5)
      trim(s, GUARD, models)
      const r = attack(s, 'melee', dice, unit, weapon, GUARD, 1)
      expect(r.rng.remaining).toEqual([])
      return { crit: of(r.events, 'HitRolled')[0].critical, woundRolls: of(r.events, 'WoundRolled').length, saves: of(r.events, 'SaveRolled').length }
    }
    expect(swing(REAP1, W('slasher-scythe'), 10, [5, 1])).toEqual({ crit: true, woundRolls: 0, saves: 1 })
    expect(swing(REAP1, W('slasher-scythe'), 5, [5, 1])).toEqual({ crit: true, woundRolls: 0, saves: 1 }) // exactly 5 models
    expect(swing(REAP1, W('slasher-scythe'), 4, [5, 1])).toEqual({ crit: false, woundRolls: 1, saves: 0 }) // a smaller unit: only a 6 is a crit
    expect(swing(REAP1, W('slasher-scythe'), 4, [6, 1])).toEqual({ crit: true, woundRolls: 0, saves: 1 })
    // the second Reapers unit has it too; the Chainrasps and the Hosts do not
    expect(swing(REAP2, W('slasher-scythe'), 10, [5, 1])).toEqual({ crit: true, woundRolls: 0, saves: 1 })
    expect(swing(RASP1, W('malignant-weapon'), 10, [5, 1])).toEqual({ crit: false, woundRolls: 1, saves: 0 })
    expect(swing(HOSTS, W('spectral-claws-and-daggers'), 10, [5, 1])).toEqual({ crit: false, woundRolls: 1, saves: 0 })
  })

  it('NH-AB-4 Chilling Horde: Chainrasps get +1 to wound in melee in a turn they charged, not otherwise', () => {
    // Chainrasps wound on 5+; charged: 4+. Hit 4, wound 4, save 1
    const s = game()
    put(s, RASP1, 0, -1.2)
    put(s, GUARD, 0, 0)
    s.units[RASP1].turn.chargedThisTurn = true
    const r = attack(s, 'melee', [4, 4, 1], RASP1, W('malignant-weapon'), GUARD, 1)
    expect(r.rng.remaining).toEqual([])
    expect(s.units[GUARD].location).toBe('destroyed')
    const t = game()
    put(t, RASP1, 0, -1.2)
    put(t, GUARD, 0, 0)
    const r2 = attack(t, 'melee', [4, 4], RASP1, W('malignant-weapon'), GUARD, 1) // a 4 does not wound on 5+
    expect(r2.rng.remaining).toEqual([])
    expect(t.units[GUARD].location).toBe('board')
    // the Reapers have no such rule: a charge changes nothing for their 3+ wound
    const u = game()
    put(u, REAP1, 0, -1.2)
    put(u, GUARD, 0, 0)
    u.units[REAP1].turn.chargedThisTurn = true
    const r3 = attack(u, 'melee', [4, 2], REAP1, W('slasher-scythe'), GUARD, 1)
    expect(r3.rng.remaining).toEqual([])
    expect(u.units[GUARD].location).toBe('board')
  })
})

describe('NH-AI utility hints and whole games', () => {
  it('NH-AI-1 Beacon waits for a crowd, Death Stalkers prefers the best save with the most Health, Wave of Terror prefers the harder-hitting unit, Discorporate prefers a unit in combat', () => {
    const s = game({ enh: BEACON })
    s.round = 2
    centreRow(s, RASP1, -6, -6)
    expect(nighthauntAbilityTiming(s, 'A', 'nighthauntBeaconOfNagashizzar', KNIGHT)).toBeLessThan(-2)
    for (const id of [...s.units[RASP1].models].slice(7)) removeModel(s, id)
    centreRow(s, REAP1, 0, -6)
    for (const id of [...s.units[REAP1].models].slice(3)) removeModel(s, id)
    centreRow(s, REAP2, 3, -6)
    for (const id of [...s.units[REAP2].models].slice(3)) removeModel(s, id)
    expect(nighthauntAbilityTiming(s, 'A', 'nighthauntBeaconOfNagashizzar', KNIGHT)).toBe(0)
    // targets
    centreRow(s, BRUTE, 0, 2)
    centreRow(s, GUARD, 6, 2)
    expect(nighthauntTargetBonus(s, 'A', 'nighthauntDeathStalkers', BRUTE)!).toBeGreaterThan(nighthauntTargetBonus(s, 'A', 'nighthauntDeathStalkers', GUARD)!)
    put(s, BOSS, -6, 2)
    expect(nighthauntTargetBonus(s, 'A', 'nighthauntWaveOfTerror', GUARD)!).toBeGreaterThan(nighthauntTargetBonus(s, 'A', 'nighthauntWaveOfTerror', BOSS)!)
    centreRow(s, REAP1, 0, 0.5)
    expect(nighthauntTargetBonus(s, 'A', 'nighthauntDiscorporate', REAP1)!).toBeGreaterThan(nighthauntTargetBonus(s, 'A', 'nighthauntDiscorporate', RASP1)!)
    expect(nighthauntTargetBonus(s, 'A', 'nighthauntDiscorporate', GUARD)).toBeNull()
  })

  it('NH-AI whole games: the Nighthaunt AI plays full games against Cities with every regiment ability and enhancement, without a rejected action', async () => {
    const full = await loadBundle()
    const picks = [
      { reg: 'nighthaunt.ability.chorus-of-terror', enh: EDGE },
      { reg: 'nighthaunt.ability.death-stalkers', enh: SOULFIRE },
      { reg: 'nighthaunt.ability.chorus-of-terror', enh: CLOAK },
      { reg: 'nighthaunt.ability.death-stalkers', enh: BEACON },
    ]
    for (const [g, pick] of picks.entries()) {
      const seed = `nh-${g}`
      const setup = makeSimSetup(full, g, DATA_VERSION, ['nighthaunt', 'cities'])
      for (const p of ['A', 'B'] as const) if (setup.players[p].faction === 'nighthaunt') { setup.players[p].regimentAbilityId = pick.reg; setup.players[p].enhancementId = pick.enh }
      const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
      let r = createGame(setup, seed, full)
      for (let n = 0; r.pending && n < 8000; n++) {
        const legal = legalActions(r.state, r.pending)!
        r = step(r.state, await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal))
        expect(r.rejection).toBeUndefined()
      }
      expect(r.state.phase).toBe('ended')
    }
  }, 240000)
})
