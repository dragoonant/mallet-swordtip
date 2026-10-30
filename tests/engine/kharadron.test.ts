// Kharadron Overlords (Skyhammer Task Force) code hooks and data: docs/spec/factions/kharadron-overlords.md, test ids KO-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/kharadron files on top of the AoS fixture bundle
// (player A = Skyhammer Task Force, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data.
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
import { writeDeclaredMove } from '../../src/engine/declared'
import { effectService } from '../../src/engine/effects'
import { basesOverlap, horizontalGap } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { losService } from '../../src/engine/los'
import { objectiveService } from '../../src/engine/objectives'
import { applyAbilityRerolls } from '../../src/engine/rerolls'
import { weaponService } from '../../src/engine/weapons'
import { buildShootingWeaponEntries } from '../../src/engine/phases/shooting'
import { movementModule, unitIgnoresRetreatDamage } from '../../src/engine/phases/movement'
import { enemiesInCombat, whollyWithinUnit } from '../../src/engine/factions/aos-common'
import { readMoveQueue, recordPassedAcross } from '../../src/engine/factions/aos-moves'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { kharadronAbilityTiming, kharadronModeBonus, kharadronTargetBonus } from '../../src/engine/factions/kharadron'
import type { Action, ModelPlacement } from '../../src/engine/actions'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/kharadron/abilities.json'
import enhancementsJson from '../../src/data/factions/kharadron/enhancements.json'
import weaponsJson from '../../src/data/factions/kharadron/weapons.json'
import factionJson from '../../src/data/factions/kharadron/faction.json'
import patrolJson from '../../src/data/factions/kharadron/patrols/skyhammer-task-force.json'
import admiralJson from '../../src/data/factions/kharadron/datasheets/arkanaut-admiral.json'
import companyJson from '../../src/data/factions/kharadron/datasheets/arkanaut-company.json'
import skywardensJson from '../../src/data/factions/kharadron/datasheets/skywardens.json'
import frigateJson from '../../src/data/factions/kharadron/datasheets/arkanaut-frigate.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [admiralJson, companyJson, skywardensJson, frigateJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.kharadron = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const PLY = 'kharadron.ability.ply-the-skies'
const BOAT = 'kharadron.ability.assault-boat'
const DISENGAGE = 'kharadron.ability.disengage'
const ARMOUR = 'kharadron.enh.masterwrought-armour'
const FLASK = 'kharadron.enh.flask-of-vintage-gorogna'
const NO_REWARD = 'kharadron.enh.no-reward-without-risk'
const LEAVE = 'kharadron.enh.leave-no-duardin-behind'
const FLASK_AB = 'kharadron.ability.flask-of-vintage-gorogna'
const LEAVE_AB = 'kharadron.ability.leave-no-duardin-behind'
const OWED = 'kharadron.ability.always-take-what-you-are-owed'
const TIMED = 'kharadron.ability.timed-charges'
const BOMBS = 'kharadron.ability.bomb-racks'

const ADMIRAL = 'A:admiral'
const SKYPIKE = 'A:arkanauts-skypike'
const GUNNERS = 'A:arkanauts-gunners'
const SKY = 'A:skywardens'
const FRIGATE = 'A:frigate'
const BRUTE = 'B:brute'

const W = (id: string) => `kharadron.weapon.${id}`

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
  const step = 2 * r + 0.15
  s.units[unitId].location = 'board'
  ms.forEach((m, i) => { m.pos = { x: cx + (i - (ms.length - 1) / 2) * step, y: 0, z: cz } })
}

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'kharadron', patrolId: 'kharadron.army.skyhammer-task-force', enhancementId: opts.enh ?? LEAVE, regimentAbilityId: opts.reg ?? BOAT }),
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
const ctxFor = (s: GameState, dice: number[]): EngineContext => {
  const rng = new ScriptedRng(dice)
  const { ctx } = createContext(s, rng, DEFAULT_MODULES)
  rngs.set(ctx, rng)
  return ctx
}
const leftOver = (ctx: EngineContext): number[] => rngs.get(ctx)?.remaining ?? []

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

// use one ability once; every other offer is declined. `mode` picks an abilityMode option by id (default: the first)
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string } = {}) {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    return opts.mode ?? ids[0]
  })
}

const offered = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const weapon = (s: GameState, unitId: UnitId, weaponId: string, modelIndex?: number) => {
  const model = modelIndex !== undefined ? s.units[unitId].models[modelIndex] : s.units[unitId].models.find((id) => s.models[id].weapons.includes(weaponId))!
  return weaponService.effectiveWeapon(s, model, weaponId)
}
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)

// ---------- a Frigate that has declared a move, with an Arkanaut Company riding beside it ----------
// puts `unitId` in a tight row (or a tight stack for big units) beside the Frigate, wholly within `range` and clear of its base
function parkBeside(s: GameState, unitId: UnitId, frigate: UnitId = FRIGATE, range = 3): void {
  const f = s.models[s.units[frigate].models[0]]
  for (let d = 1.5; d < 6; d += 0.1) {
    centreRow(s, unitId, f.pos.x, f.pos.z + d)
    const ms = unitModels(s, unitId)
    if (ms.some((m) => basesOverlap(m, f))) continue
    if (whollyWithinUnit(s, unitId, frigate, range)) return
  }
  throw new Error(`no spot for ${unitId} beside the Frigate`)
}

function plyGame(opts: Parameters<typeof game>[0] = {}): GameState {
  const s = game(opts)
  s.phase = 'movement'
  centreRow(s, FRIGATE, -4, -3)
  parkBeside(s, SKYPIKE)
  return s
}

function declare(s: GameState, unitId: UnitId, moveType: 'normal' | 'advance' | 'fallBack' | 'stationary'): void {
  s.phase = 'movement'
  s.activePlayer = 'A'
  writeDeclaredMove(s, { unitId, moveType })
}

// ---------- attacks with scripted dice ----------
const of = <T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type)

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

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('KO-REG every code in the Kharadron data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('KO-ARMY-1 the Skyhammer Task Force builds: an Admiral general, 2 Arkanaut Companies, Skywardens and a Frigate, 15 models, stats as printed', () => {
    const s = game()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(15)
    expect(s.players.A.warlordUnitId).toBe(ADMIRAL)
    expect(s.players.A.battleTraitIds).toEqual([PLY])
    expect(s.players.A.regimentAbilityId).toBe(BOAT)
    const st = (id: string) => s.datasheets[`kharadron.unit.${id}`].stats
    expect(st('arkanaut-admiral')).toMatchObject({ M: 4, W: 6, Sv: 3, OC: 2 })
    expect(st('arkanaut-company')).toMatchObject({ M: 4, W: 1, Sv: 4, OC: 1 })
    expect(st('arkanaut-company-gunners')).toMatchObject({ M: 4, W: 1, Sv: 4, OC: 1 })
    expect(st('skywardens')).toMatchObject({ M: 12, W: 2, Sv: 4, OC: 1 })
    expect(st('arkanaut-frigate')).toMatchObject({ M: 12, W: 15, Sv: 3, OC: 5 })
    // nothing prints a Ward
    for (const u of mine) expect(s.datasheets[u.datasheetId].stats.ward ?? null).toBeNull()
    // bases: 32 round Admiral / Skywardens, 25 round Arkanauts, 120x92 oval Frigate
    const radius = (id: UnitId) => s.models[s.units[id].models[0]].base
    expect(radius(ADMIRAL).radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(radius(SKYPIKE).radius).toBeCloseTo(25 / 2 / 25.4, 2)
    expect(radius(SKY).radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(radius(FRIGATE).radius).toBeCloseTo(120 / 2 / 25.4, 2)
    expect(radius(FRIGATE).radius2).toBeCloseTo(92 / 2 / 25.4, 2)
  })

  it('KO-ARMY-2 the two Arkanaut Companies carry the two printed loadouts; the Skywardens 2 pistol + skypike and 1 volley gun', () => {
    const s = game()
    const loadout = (id: UnitId): string[] => unitModels(s, id).map((m) => m.weapons.map((w) => w.replace('kharadron.weapon.', '')).join('+'))
    expect(loadout(SKYPIKE)).toEqual(Array(4).fill('privateer-pistol+arkanaut-cutter').concat('skypike'))
    expect(loadout(GUNNERS)).toEqual([...Array(3).fill('privateer-pistol+arkanaut-cutter'), 'aethermatic-volley-gun+gun-butt', 'light-skyhook+gun-butt'])
    expect(loadout(SKY)).toEqual(['vulcaniser-pistol+skypike', 'vulcaniser-pistol+skypike', 'aethermatic-volley-gun+gun-butt'])
    expect(loadout(ADMIRAL)).toEqual(['masterwork-volley-pistol+skalfhammer'])
    expect(loadout(FRIGATE)).toEqual(['heavy-skyhook+aethershot-carbines+crews-boarding-weapons'])
    // the special models come last, so they are the last to fall
    expect(unitModels(s, GUNNERS).map((m) => m.datasheetModelId).slice(-2)).toEqual(['arkanaut-volley', 'arkanaut-skyhook'])
  })

  it('KO-ARMY-3 Reinforcements only on both Companies and the Skywardens; the Admiral and the Frigate are never offered for replacement', () => {
    const s = game()
    for (const id of [SKYPIKE, GUNNERS, SKY]) expect(s.datasheets[s.units[id].datasheetId].keywords).toContain('REINFORCEMENTS')
    for (const id of [ADMIRAL, FRIGATE]) expect(s.datasheets[s.units[id].datasheetId].keywords).not.toContain('REINFORCEMENTS')
    for (const id of [ADMIRAL, SKYPIKE, GUNNERS, SKY, FRIGATE]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A').sort()).toEqual([GUNNERS, SKYPIKE, SKY].sort())
  })
})

describe('KO-BT Ply the Skies', () => {
  it('KO-BT-1 is offered when the Frigate declares a Normal Move, Run or Retreat; not for a Charge, for another unit, or for a stationary Frigate', () => {
    const s = plyGame()
    expect(offered(s, 'A', 'moveDeclared')).not.toContain(PLY) // nothing declared yet
    for (const moveType of ['normal', 'advance', 'fallBack'] as const) {
      declare(s, FRIGATE, moveType)
      expect(offered(s, 'A', 'moveDeclared'), moveType).toContain(PLY)
    }
    declare(s, FRIGATE, 'stationary')
    expect(offered(s, 'A', 'moveDeclared')).not.toContain(PLY)
    // another unit declaring a move does not carry anyone
    declare(s, SKY, 'normal')
    expect(offered(s, 'A', 'moveDeclared')).not.toContain(PLY)
    // the charge phase has no move declaration, and the reaction is not an end-of-phase offer
    writeDeclaredMove(s, null)
    s.phase = 'charge'
    expect(offered(s, 'A', 'charge')).not.toContain(PLY)
    s.phase = 'movement'
    declare(s, FRIGATE, 'normal')
    expect(offered(s, 'A', 'movement')).not.toContain(PLY)
    // the opponent's Frigate would not be ours to carry with
    expect(offered(s, 'B', 'moveDeclared')).not.toContain(PLY)
  })

  it('KO-BT-2 only an Infantry unit wholly within 3" of the Frigate and not in combat can be picked', () => {
    const s = plyGame()
    parkBeside(s, GUNNERS) // both Companies ride along
    parkBeside(s, SKY)
    // the Admiral is Infantry too, but stays far away
    declare(s, FRIGATE, 'normal')
    const targets = (): string[] => (codeHooks.kharadronPlyTheSkies.activate!.targets as unknown as (st: GameState, u: null, p: PlayerId) => string[])(s, null, 'A')
    // three Infantry units are beside it; the Companies are listed first
    expect(targets().sort()).toEqual([GUNNERS, SKYPIKE, SKY].sort())
    // too far: one model out of range drops the unit
    const stray = unitModels(s, GUNNERS)[0]
    const before = { ...stray.pos }
    stray.pos = { ...before, z: before.z + 4 }
    expect(targets()).not.toContain(GUNNERS)
    stray.pos = before
    // in combat with an enemy: dropped
    place(s, BRUTE, s.models[s.units[SKY].models[0]].pos.x + 4.5, s.models[s.units[SKY].models[0]].pos.z)
    expect(losService.unitInCombat(s, SKY)).toBe(true)
    expect(targets()).not.toContain(SKY)
    // the Frigate itself is not a War Machine passenger: no Infantry keyword
    expect(targets()).not.toContain(FRIGATE)
    // nobody to carry: the reaction is not offered at all
    const lone = plyGame()
    for (const id of [SKYPIKE]) place(lone, id, 8, -8)
    declare(lone, FRIGATE, 'normal')
    expect(offered(lone, 'A', 'moveDeclared')).not.toContain(PLY)
  })

  it('KO-BT-3 the passenger is set up wholly within 3" of the Frigate\'s end position, not in combat, and cannot move itself that phase', () => {
    const s = plyGame()
    declare(s, FRIGATE, 'normal')
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'moveDeclared', 'A', PLY, { target: SKYPIKE })
    expect(s.units[SKYPIKE].location).toBe('reserves') // lifted while the Frigate moves
    // the Frigate moves 8" along the board
    for (const m of unitModels(s, FRIGATE)) m.pos = { ...m.pos, x: m.pos.x + 8 }
    place(s, BRUTE, 12, 2) // an enemy near the new position: the passenger must stay out of its combat range
    const r = useOnce(ctx, 'moveEnded', 'A', 'none')
    expect(r.topics).toEqual(['abilityMode'])
    expect(s.units[SKYPIKE].location).toBe('board')
    expect(whollyWithinUnit(s, SKYPIKE, FRIGATE, 3)).toBe(true)
    expect(losService.unitInCombat(s, SKYPIKE)).toBe(false)
    for (const m of unitModels(s, SKYPIKE)) for (const e of enemiesInCombat(s, SKYPIKE)) expect(horizontalGap(m, s.models[s.units[e].models[0]])).toBeGreaterThan(3)
    // CORE-6.13: set up this turn, so no Move ability this movement phase
    expect(s.units[SKYPIKE].setUpTurn).toEqual({ round: 1, player: 'A' })
    // one use per declared move: it is not offered again for the same Frigate
    declare(s, FRIGATE, 'normal')
    expect(offered(s, 'A', 'moveDeclared')).not.toContain(PLY)
  })

  it('KO-BT-3 end to end: in AI games the passenger always lands back on the table within 3" of the Frigate', async () => {
    const full = await loadBundle()
    let rides = 0
    for (const g of [0, 1, 2, 3]) {
      const seed = `trace-${g}`
      const setup = makeSimSetup(full, g, DATA_VERSION, ['kharadron', 'cities'])
      const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
      let r = createGame(setup, seed, full)
      let waiting: { pax: UnitId; frigate: UnitId } | null = null
      for (let n = 0; r.pending && n < 6000; n++) {
        const legal = legalActions(r.state, r.pending)!
        r = step(r.state, await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legal))
        expect(r.rejection).toBeUndefined()
        for (const e of r.events) {
          if (e.type === 'AbilityTriggered' && e.abilityId === PLY && e.targetUnitId) {
            const frigate = Object.values(r.state.units).find((u) => u.player === r.state.activePlayer && u.datasheetId.endsWith('arkanaut-frigate'))!.id
            waiting = { pax: e.targetUnitId, frigate }
            rides++
          }
        }
        if (waiting && r.state.units[waiting.pax].location === 'board') {
          // set down again: wholly within 3" of the Frigate, or put back where it was when the Frigate is gone
          if (r.state.units[waiting.frigate].location === 'board') expect(whollyWithinUnit(r.state, waiting.pax, waiting.frigate, 3), `game ${g}`).toBe(true)
          expect(losService.unitInCombat(r.state, waiting.pax)).toBe(false)
          waiting = null
        }
      }
      expect(r.state.phase).toBe('ended')
      expect(waiting).toBeNull()
    }
    expect(rides).toBeGreaterThan(0)
  }, 240_000)

  it('KO-BT-4 a transported unit cannot charge that turn (the ban lapses at the end of the turn)', () => {
    const s = plyGame()
    declare(s, FRIGATE, 'normal')
    const ctx = ctxFor(s, [])
    expect(hookService.chargeForbidden(s, SKYPIKE)).toBe(false)
    useOnce(ctx, 'moveDeclared', 'A', PLY, { target: SKYPIKE })
    useOnce(ctx, 'moveEnded', 'A', 'none')
    expect(hookService.chargeForbidden(s, SKYPIKE)).toBe(true)
    expect(hookService.chargeForbidden(s, GUNNERS)).toBe(false) // nobody else is affected
    expect(hookService.chargeForbidden(s, FRIGATE)).toBe(false) // the Frigate itself may still charge
    effectService.expire(ctx, 'turnEnd', null)
    expect(hookService.chargeForbidden(s, SKYPIKE)).toBe(false)
  })

  it('KO-BT-5 the passenger takes no damage from the Frigate\'s retreat, and goes back where it stood (or as near as is legal) when the Frigate cannot carry it', () => {
    // a Retreat: the passenger is off the table while the Frigate suffers its D3 mortal damage, so it takes none
    const s = plyGame()
    const home = unitModels(s, SKYPIKE).map((m) => ({ ...m.pos }))
    const before = wounds(s, SKYPIKE)
    declare(s, FRIGATE, 'fallBack')
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'moveDeclared', 'A', PLY, { target: SKYPIKE })
    expect(s.units[SKYPIKE].location).toBe('reserves')
    expect(wounds(s, SKYPIKE)).toBe(before)
    // the Frigate does not survive its own retreat: the passenger returns to its origin
    s.units[FRIGATE].location = 'destroyed'
    useOnce(ctx, 'moveEnded', 'A', 'none')
    expect(s.units[SKYPIKE].location).toBe('board')
    unitModels(s, SKYPIKE).forEach((m, i) => { expect(m.pos.x).toBeCloseTo(home[i].x, 2); expect(m.pos.z).toBeCloseTo(home[i].z, 2) })

    // origin taken by an enemy meanwhile: the nearest legal spot is used, never left off the table
    const t = plyGame()
    declare(t, FRIGATE, 'normal')
    const ctx2 = ctxFor(t, [])
    useOnce(ctx2, 'moveDeclared', 'A', PLY, { target: SKYPIKE })
    t.units[FRIGATE].location = 'destroyed'
    const first = home[0]
    place(t, BRUTE, first.x + 1.5, first.z)
    useOnce(ctx2, 'moveEnded', 'A', 'none')
    expect(t.units[SKYPIKE].location).toBe('board')
    expect(losService.unitInCombat(t, SKYPIKE)).toBe(false)
  })
})

describe('KO-RA regiment abilities', () => {
  it('KO-RA-1 Assault Boat: once per battle, only on a unit transported this turn, which can then charge', () => {
    const s = plyGame()
    s.phase = 'movement'
    expect(offered(s, 'A', 'movement')).not.toContain(BOAT) // nobody transported
    declare(s, FRIGATE, 'normal')
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'moveDeclared', 'A', PLY, { target: SKYPIKE })
    useOnce(ctx, 'moveEnded', 'A', 'none')
    writeDeclaredMove(s, null)
    expect(hookService.chargeForbidden(s, SKYPIKE)).toBe(true)
    expect(offered(s, 'A', 'movement')).toContain(BOAT)
    expect(offered(s, 'B', 'movement')).not.toContain(BOAT)
    const r = useOnce(ctx, 'movement', 'A', BOAT)
    expect(r.topics).toEqual(['abilityUse']) // the single transported unit is picked for you
    expect(hookService.chargeForbidden(s, SKYPIKE)).toBe(false)
    // once per battle: a second ride later does not bring it back
    expect(offered(s, 'A', 'movement')).not.toContain(BOAT)
    s.round = 2
    expect(offered(s, 'A', 'movement')).not.toContain(BOAT)
  })

  it('KO-RA-2 Disengage: the Frigate\'s retreat costs no mortal damage and it can still shoot; once per battle, only for a declared Retreat', () => {
    const s = plyGame({ reg: DISENGAGE })
    declare(s, FRIGATE, 'normal')
    expect(offered(s, 'A', 'moveDeclared')).not.toContain(DISENGAGE) // only about a Retreat
    declare(s, SKY, 'fallBack')
    expect(offered(s, 'A', 'moveDeclared')).not.toContain(DISENGAGE) // and only about the Frigate
    declare(s, FRIGATE, 'fallBack')
    expect(offered(s, 'A', 'moveDeclared')).toContain(DISENGAGE)
    expect(offered(s, 'A', 'movement')).not.toContain(DISENGAGE) // not an end-of-phase offer
    s.units[FRIGATE].turn.moveType = 'fallBack'
    expect(unitIgnoresRetreatDamage(s, FRIGATE)).toBe(false)
    expect(hookService.eligibilityFor?.(s, FRIGATE, 'shoot')).toBeFalsy()
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'moveDeclared', 'A', DISENGAGE)
    expect(unitIgnoresRetreatDamage(s, FRIGATE)).toBe(true)
    expect(hookService.eligibilityFor?.(s, FRIGATE, 'shoot')).toBe(true)
    // once per battle
    effectService.expire(ctx, 'turnEnd', null)
    s.round = 2
    declare(s, FRIGATE, 'fallBack')
    expect(offered(s, 'A', 'moveDeclared')).not.toContain(DISENGAGE)
    expect(unitIgnoresRetreatDamage(s, FRIGATE)).toBe(false)
  })
})

describe('KO-ENH enhancements', () => {
  const ward = (s: GameState, id: UnitId) => feelNoPainFor(ctxFor(s, []), s.units[id].models[0], {} as never)?.threshold

  it('KO-ENH-1 Masterwrought Armour gives the general Ward (6+) and nobody else', () => {
    const s = game({ enh: ARMOUR })
    expect(ward(s, ADMIRAL)).toBe(6)
    expect(ward(s, FRIGATE)).toBeUndefined()
    expect(ward(s, SKYPIKE)).toBeUndefined()
    expect(ward(game({ enh: LEAVE }), ADMIRAL)).toBeUndefined()
  })

  it('KO-ENH-2 Flask of Vintage Gorogna heals D6 once per battle, in either player\'s hero phase, and only a damaged general', () => {
    const s = game({ enh: FLASK })
    s.phase = 'command'
    expect(offered(s, 'A', 'hero')).not.toContain(FLASK_AB) // undamaged
    s.models[s.units[ADMIRAL].models[0]].woundsRemaining = 2
    expect(offered(s, 'A', 'hero')).toContain(FLASK_AB)
    // the enemy's hero phase
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'hero')).toContain(FLASK_AB)
    const ctx = ctxFor(s, [3])
    useOnce(ctx, 'hero', 'A', FLASK_AB)
    expect(s.models[s.units[ADMIRAL].models[0]].woundsRemaining).toBe(5)
    expect(leftOver(ctx)).toEqual([])
    // once per battle
    s.models[s.units[ADMIRAL].models[0]].woundsRemaining = 1
    s.activePlayer = 'A'
    s.round = 2
    expect(offered(s, 'A', 'hero')).not.toContain(FLASK_AB)
    // the healing stops at full Health
    const t = game({ enh: FLASK })
    t.models[t.units[ADMIRAL].models[0]].woundsRemaining = 5
    useOnce(ctxFor(t, [6]), 'hero', 'A', FLASK_AB)
    expect(t.models[t.units[ADMIRAL].models[0]].woundsRemaining).toBe(6)
  })

  it('KO-ENH-3 There\'s No Reward Without Risk: one charge re-roll per battle, only for a unit wholly within 12" of the general', () => {
    const s = game({ enh: NO_REWARD })
    s.phase = 'charge'
    place(s, ADMIRAL, 0, -6)
    centreRow(s, SKYPIKE, 0, -4) // within 12"
    centreRow(s, GUNNERS, 0, 8) // way out of range (and next to the enemy)
    const data = (unit: UnitId) => ({ chargingUnitId: unit, targetUnitIds: [BRUTE] })
    const short = (ctx: EngineContext, unit: UnitId, dice: number[]) => {
      const roll = ctx.roll({ purpose: 'charge', player: 'A', count: 2, mode: 'sum', unitId: unit })
      expect(dice).toHaveLength(2)
      return applyAbilityRerolls(ctx, 'onChargeRoll', data(unit), roll, 9)
    }
    // out of range: no re-roll, and the use is not spent
    const far = ctxFor(s, [1, 2])
    abilityService.runWindow(far, 'startOfTurn', 'A') // puts the bearer's battle-long effect in place
    expect(short(far, GUNNERS, [1, 2]).dice).toEqual([1, 2])
    // in range: the short roll is re-rolled (both dice) and the use is spent
    const near = ctxFor(s, [1, 2, 5, 6])
    expect(short(near, SKYPIKE, [1, 2]).dice).toEqual([5, 6])
    expect(leftOver(near)).toEqual([])
    // once per battle
    const again = ctxFor(s, [1, 2])
    expect(short(again, SKYPIKE, [1, 2]).dice).toEqual([1, 2])
    // a roll that already reaches is never re-rolled (the use is kept)
    const t = game({ enh: NO_REWARD })
    place(t, ADMIRAL, 0, -6)
    centreRow(t, SKYPIKE, 0, -4)
    const ok = ctxFor(t, [5, 6])
    abilityService.runWindow(ok, 'startOfTurn', 'A')
    const roll = ok.roll({ purpose: 'charge', player: 'A', count: 2, mode: 'sum', unitId: SKYPIKE })
    expect(applyAbilityRerolls(ok, 'onChargeRoll', data(SKYPIKE), roll, 9).dice).toEqual([5, 6])
    const later = ctxFor(t, [1, 2, 4, 4])
    const low = later.roll({ purpose: 'charge', player: 'A', count: 2, mode: 'sum', unitId: SKYPIKE })
    expect(applyAbilityRerolls(later, 'onChargeRoll', data(SKYPIKE), low, 9).dice).toEqual([4, 4])
    // the enemy's chargers are not helped
    const u = game({ enh: NO_REWARD })
    const theirs = ctxFor(u, [1, 2, 6, 6])
    abilityService.runWindow(theirs, 'startOfTurn', 'A')
    const bad = theirs.roll({ purpose: 'charge', player: 'B', count: 2, mode: 'sum', unitId: BRUTE })
    expect(applyAbilityRerolls(theirs, 'onChargeRoll', { chargingUnitId: BRUTE, targetUnitIds: [SKYPIKE] }, bad, 9).dice).toEqual([1, 2])
  })

  it('KO-ENH-4 Leave No Duardin Behind: a die per slain model, each 4+ returns one; the Company must be wholly within 12" of the general; once per battle', () => {
    const s = game({ enh: LEAVE })
    s.phase = 'command'
    place(s, ADMIRAL, 0, -6)
    centreRow(s, SKYPIKE, 0, -4)
    expect(offered(s, 'A', 'hero')).not.toContain(LEAVE_AB) // nothing slain yet
    for (const id of s.units[SKYPIKE].models.slice(0, 3)) removeModel(s, id)
    expect(s.units[SKYPIKE].models).toHaveLength(2)
    expect(offered(s, 'A', 'hero')).toContain(LEAVE_AB)
    // out of range: not offered
    const far = game({ enh: LEAVE })
    place(far, ADMIRAL, -14, -6)
    centreRow(far, SKYPIKE, 14, -4)
    for (const id of far.units[SKYPIKE].models.slice(0, 3)) removeModel(far, id)
    expect(offered(far, 'A', 'hero')).not.toContain(LEAVE_AB)
    // three slain: dice 4, 3, 6 -> two come back
    const ctx = ctxFor(s, [4, 3, 6])
    useOnce(ctx, 'hero', 'A', LEAVE_AB)
    expect(s.units[SKYPIKE].models).toHaveLength(4)
    expect(leftOver(ctx)).toEqual([])
    expect(unitModels(s, SKYPIKE).every((m) => m.woundsRemaining === 1)).toBe(true)
    // once per battle
    s.round = 2
    expect(offered(s, 'A', 'hero')).not.toContain(LEAVE_AB)
    // only Arkanaut Companies: a depleted Skywardens unit is not a target
    const t = game({ enh: LEAVE })
    place(t, ADMIRAL, 0, -6)
    centreRow(t, SKY, 0, -4)
    removeModel(t, t.units[SKY].models[0])
    expect(offered(t, 'A', 'hero')).not.toContain(LEAVE_AB)
  })
})

describe('KO-AB warscroll abilities', () => {
  it('KO-AB-1 Always Take What You Are Owed: adds a D6 to the control score of an Arkanaut Company wholly within 12", until your next turn', () => {
    const s = game()
    s.phase = 'command'
    place(s, ADMIRAL, 0, -6)
    centreRow(s, SKYPIKE, 0, 0) // on the centre objective
    centreRow(s, SKY, 0, -4) // in range but not a Company
    const control = (ctx: EngineContext): number => objectiveService.levelOfControl(s, 'obj-c', ctx).A
    const ctx = ctxFor(s, [4])
    expect(control(ctx)).toBe(5)
    useOnce(ctx, 'hero', 'A', OWED, { target: SKYPIKE })
    expect(control(ctx)).toBe(9) // +4, the whole unit's score and not each model's Control
    expect(leftOver(ctx)).toEqual([])
    // the Skywardens are no Company: the only target offered is a Company
    const t = game()
    t.phase = 'command'
    place(t, ADMIRAL, 0, -6)
    centreRow(t, SKY, 0, -4)
    t.units[SKYPIKE].location = 'reserves'
    t.units[GUNNERS].location = 'reserves'
    expect(offered(t, 'A', 'hero')).not.toContain(OWED)
    centreRow(t, GUNNERS, 0, -2)
    expect(offered(t, 'A', 'hero')).toContain(OWED)
    // too far from the Admiral
    place(t, ADMIRAL, -14, -9)
    centreRow(t, GUNNERS, 14, 0)
    expect(offered(t, 'A', 'hero')).not.toContain(OWED)
    // the bonus ends at the start of the owner's next turn
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(control(ctx)).toBe(5)
    // once per phase for the Admiral
    expect(offered(s, 'A', 'hero')).not.toContain(OWED)
  })

  it('KO-AB-2 Timed Charges: at the end of any turn, 2+ inflicts 1 mortal damage on an enemy in combat with the Skywardens; a 1 does nothing', () => {
    const fight = (): GameState => {
      const s = game()
      s.phase = 'fight'
      centreRow(s, SKY, 0, 0)
      centreRow(s, BRUTE, 0, 2.5)
      expect(enemiesInCombat(s, SKY)).toEqual([BRUTE])
      return s
    }
    const s = fight()
    expect(offered(s, 'A', 'endOfTurn')).toContain(TIMED)
    s.activePlayer = 'B' // the end of the enemy's turn counts too
    expect(offered(s, 'A', 'endOfTurn')).toContain(TIMED)
    s.activePlayer = 'A'
    const hurt = wounds(s, BRUTE)
    const ctx = ctxFor(s, [2])
    // decline the retreat that follows
    runWindow(ctx, 'endOfTurn', 'A', (topic, ids) => (topic === 'abilityUse' ? ids.find((i) => i.startsWith(TIMED)) ?? 'pass' : 'pass'))
    expect(wounds(s, BRUTE)).toBe(hurt - 1)
    expect(leftOver(ctx)).toEqual([])
    // a 1 does nothing
    const t = fight()
    const ctx1 = ctxFor(t, [1])
    const r = useOnce(ctx1, 'endOfTurn', 'A', TIMED)
    expect(wounds(t, BRUTE)).toBe(wounds(fight(), BRUTE))
    expect(r.topics).toEqual(['abilityUse'])
    expect(readMoveQueue(t)).toBeNull()
    // once per turn: not offered again in the same window
    expect(offered(t, 'A', 'endOfTurn')).not.toContain(TIMED)
    // nothing in combat, nothing to do
    const u = game()
    centreRow(u, SKY, 0, 0)
    expect(offered(u, 'A', 'endOfTurn')).not.toContain(TIMED)
  })

  it('KO-AB-3 Timed Charges retreat: optional, up to the Move of 12", ends outside every combat range, no retreat mortal damage', () => {
    const s = game()
    s.phase = 'fight'
    centreRow(s, SKY, 0, 0)
    centreRow(s, BRUTE, 0, 2.5)
    const start = unitModels(s, SKY).map((m) => ({ ...m.pos }))
    const hp = wounds(s, SKY)
    const ctx = ctxFor(s, [5])
    let options: string[] = []
    runWindow(ctx, 'endOfTurn', 'A', (topic, ids) => {
      if (topic === 'abilityUse') return ids.find((i) => i.startsWith(TIMED)) ?? 'pass'
      options = ids
      const far = (id: string): number => { const [, dx, dz] = id.split(':'); return Math.hypot(Number(dx), Number(dz)) }
      return [...ids].sort((a, b) => far(b) - far(a))[0]
    })
    expect(options.length).toBeGreaterThan(1)
    expect(wounds(s, SKY)).toBe(hp) // no retreat damage
    expect(enemiesInCombat(s, SKY)).toEqual([])
    for (const [i, m] of unitModels(s, SKY).entries()) expect(Math.hypot(m.pos.x - start[i].x, m.pos.z - start[i].z)).toBeLessThanOrEqual(12 + 0.01)
    expect(unitModels(s, SKY).some((m, i) => m.pos.x !== start[i].x || m.pos.z !== start[i].z)).toBe(true)
    // optional: passing keeps the Skywardens where they are
    const t = game()
    t.phase = 'fight'
    centreRow(t, SKY, 0, 0)
    centreRow(t, BRUTE, 0, 2.5)
    const stay = unitModels(t, SKY).map((m) => ({ ...m.pos }))
    runWindow(ctxFor(t, [5]), 'endOfTurn', 'A', (topic, ids) => (topic === 'abilityUse' ? ids.find((i) => i.startsWith(TIMED)) ?? 'pass' : 'pass'))
    expect(unitModels(t, SKY).map((m) => ({ ...m.pos }))).toEqual(stay)
    // the target died of the mortal damage: nothing left to retreat from, no retreat is offered
    const u = game()
    u.phase = 'fight'
    centreRow(u, SKY, 0, 0)
    centreRow(u, BRUTE, 0, 2.5)
    for (const id of u.units[BRUTE].models.slice(1)) removeModel(u, id)
    u.models[u.units[BRUTE].models[0]].woundsRemaining = 1
    const r = useOnce(ctxFor(u, [4]), 'endOfTurn', 'A', TIMED)
    expect(r.topics).toEqual(['abilityUse'])
    expect(u.units[BRUTE].location).toBe('destroyed')
  })

  it('KO-AB-4 Glory-Seekers: +1 to hit only against a unit contesting an objective, capped at +1', () => {
    const hitMod = (targetAt: [number, number], extra = false): number => {
      const s = game()
      centreRow(s, GUNNERS, -8, -8) // far from everything: only the target's position changes
      for (const id of s.units[BRUTE].models.slice(1)) removeModel(s, id)
      s.models[s.units[BRUTE].models[0]].pos = { x: targetAt[0], y: 0, z: targetAt[1] }
      const gunner = s.units[GUNNERS].models[0]
      s.models[gunner].pos = { x: targetAt[0], y: 0, z: targetAt[1] - 2 }
      if (extra) s.units[GUNNERS].effects.push({ id: 'e1', sourceAbilityId: 'x', sourceUnitId: GUNNERS, effect: { modifyRoll: { roll: 'hit', value: 1 } }, scope: { who: 'self' }, expires: { kind: 'battle', round: 1, player: null }, when: null })
      const { events } = attack(s, 'melee', [3, 1], GUNNERS, W('arkanaut-cutter'), BRUTE, 1)
      const hit = of(events, 'HitRolled')[0]
      return hit.final - hit.die
    }
    expect(hitMod([0, 0])).toBe(1) // standing on the centre objective
    expect(hitMod([0, 4])).toBe(0) // open ground
    expect(hitMod([0, 0], true)).toBe(1) // another +1 does not stack past +1
    // not every Kharadron unit has it
    const s = game()
    expect(s.datasheets[s.units[SKY].datasheetId].abilities).not.toContain('kharadron.ability.glory-seekers')
    expect(s.datasheets[s.units[SKYPIKE].datasheetId].abilities).toContain('kharadron.ability.glory-seekers')
    expect(s.datasheets[s.units[GUNNERS].datasheetId].abilities).toContain('kharadron.ability.glory-seekers')
  })

  it('KO-AB-5 Battle Damaged: the Heavy Skyhook has Attacks 1 at 10 or more damage points, 2 below that', () => {
    const s = game()
    const m = s.models[s.units[FRIGATE].models[0]]
    const skyhook = (): number => weaponService.effectiveWeapon(s, m.id, W('heavy-skyhook')).A as number
    const carbines = (): number => weaponService.effectiveWeapon(s, m.id, W('aethershot-carbines')).A as number
    for (const [left, expected] of [[15, 2], [6, 2], [5, 1], [1, 1]] as const) {
      m.woundsRemaining = left
      expect(skyhook(), `${left} Health left`).toBe(expected)
      expect(carbines()).toBe(4)
    }
    // healed back above the line
    m.woundsRemaining = 6
    expect(skyhook()).toBe(2)
  })

  it('KO-AB-6 Bomb Racks: only a unit the Frigate passed across this phase; 2+ inflicts D3 mortal damage; once per battle', () => {
    const s = game()
    s.phase = 'movement'
    centreRow(s, FRIGATE, 0, -2)
    centreRow(s, BRUTE, 0, 4)
    expect(offered(s, 'A', 'movement')).not.toContain(BOMBS) // passed across nobody
    recordPassedAcross(s, FRIGATE, [BRUTE])
    expect(offered(s, 'A', 'movement')).toContain(BOMBS)
    const hurt = wounds(s, BRUTE)
    // D6 2 passes, then the D3 (face 5 -> 3)
    const ctx = ctxFor(s, [2, 5])
    useOnce(ctx, 'movement', 'A', BOMBS)
    expect(wounds(s, BRUTE)).toBe(hurt - 3)
    expect(leftOver(ctx)).toEqual([])
    // once per battle
    expect(offered(s, 'A', 'movement')).not.toContain(BOMBS)
    // a 1 inflicts nothing but still uses the ability up
    const t = game()
    t.phase = 'movement'
    centreRow(t, BRUTE, 0, 4)
    recordPassedAcross(t, FRIGATE, [BRUTE])
    const before = wounds(t, BRUTE)
    useOnce(ctxFor(t, [1]), 'movement', 'A', BOMBS)
    expect(wounds(t, BRUTE)).toBe(before)
    expect(offered(t, 'A', 'movement')).not.toContain(BOMBS)
    // the enemy does not drop bombs for us
    expect(offered(t, 'B', 'movement')).not.toContain(BOMBS)
  })
})

describe('KO-WEAP weapons', () => {
  it('KO-WEAP-1 Shoot in Combat: pistols and carbines fire while in combat; volley guns and skyhooks do not', () => {
    const s = game()
    s.phase = 'shooting'
    centreRow(s, BRUTE, 0, 4)
    const canShoot = (unit: UnitId, weaponId: string): boolean => {
      const ctx = ctxFor(s, [])
      return buildShootingWeaponEntries(ctx, unit).filter((e) => e.weaponId === weaponId).some((e) => e.legalTargets.includes(BRUTE))
    }
    centreRow(s, FRIGATE, 0, 0)
    expect(enemiesInCombat(s, FRIGATE)).toEqual([BRUTE])
    expect(canShoot(FRIGATE, W('aethershot-carbines'))).toBe(true)
    expect(canShoot(FRIGATE, W('heavy-skyhook'))).toBe(false)
    centreRow(s, GUNNERS, 0, 2)
    expect(enemiesInCombat(s, GUNNERS)).toEqual([BRUTE])
    expect(canShoot(GUNNERS, W('privateer-pistol'))).toBe(true)
    expect(canShoot(GUNNERS, W('aethermatic-volley-gun'))).toBe(false)
    expect(canShoot(GUNNERS, W('light-skyhook'))).toBe(false)
    centreRow(s, SKY, 0, 1)
    expect(canShoot(SKY, W('vulcaniser-pistol'))).toBe(true)
    expect(canShoot(SKY, W('aethermatic-volley-gun'))).toBe(false)
    centreRow(s, ADMIRAL, 0, 2)
    expect(canShoot(ADMIRAL, W('masterwork-volley-pistol'))).toBe(true)
    // out of combat the big guns fire again
    const t = game()
    t.phase = 'shooting'
    centreRow(t, BRUTE, 0, 4)
    centreRow(t, GUNNERS, 0, -4)
    centreRow(t, FRIGATE, 8, -4)
    const canShootT = (unit: UnitId, weaponId: string): boolean =>
      buildShootingWeaponEntries(ctxFor(t, []), unit).filter((e) => e.weaponId === weaponId).some((e) => e.legalTargets.includes(BRUTE))
    expect(canShootT(GUNNERS, W('aethermatic-volley-gun'))).toBe(true)
    expect(canShootT(GUNNERS, W('light-skyhook'))).toBe(true)
    expect(canShootT(FRIGATE, W('heavy-skyhook'))).toBe(true)
  })

  it('KO-WEAP-2 a Skypike critical hit deals 2 mortal damage and skips the wound roll and the save', () => {
    const s = game()
    centreRow(s, SKYPIKE, 0, 0)
    centreRow(s, BRUTE, 0, 1.6)
    const hurt = wounds(s, BRUTE)
    const crit = attack(s, 'melee', [6], SKYPIKE, W('skypike'), BRUTE, 1)
    expect(of(crit.events, 'WoundRolled')).toHaveLength(0)
    expect(of(crit.events, 'SaveRolled')).toHaveLength(0)
    expect(wounds(s, BRUTE)).toBe(hurt - 2)
    expect(crit.rng.remaining).toEqual([])
    // a plain hit (5) rolls to wound and is saved normally
    const t = game()
    centreRow(t, SKYPIKE, 0, 0)
    centreRow(t, BRUTE, 0, 1.6)
    const plain = attack(t, 'melee', [5, 2], SKYPIKE, W('skypike'), BRUTE, 1)
    expect(of(plain.events, 'WoundRolled')).toHaveLength(1)
    expect(of(plain.events, 'HitRolled')[0].critical).toBe(false)
  })

  it('KO-WEAP-3 the Aethermatic Volley Gun rolls 2D6 attacks', () => {
    const s = game()
    expect(weapon(s, GUNNERS, W('aethermatic-volley-gun')).A).toBe('2D6')
    expect(weapon(s, SKY, W('aethermatic-volley-gun')).A).toBe('2D6')
    centreRow(s, GUNNERS, 0, -4)
    centreRow(s, BRUTE, 0, 4)
    // 3 + 4 = 7 attacks, each missing on a 1
    const { events, rng } = attack(s, 'ranged', [3, 4, 1, 1, 1, 1, 1, 1, 1], GUNNERS, W('aethermatic-volley-gun'), BRUTE, null)
    expect(of(events, 'HitRolled')).toHaveLength(7)
    expect(rng.remaining).toEqual([])
  })
})

describe('KO-FLY flight', () => {
  it('KO-FLY-1 the Frigate and the Skywardens carry Fly and move over models; the Arkanauts and the Admiral do not', () => {
    const s = game()
    const kw = (id: UnitId): string[] => s.datasheets[s.units[id].datasheetId].keywords
    expect(kw(FRIGATE)).toContain('FLY')
    expect(kw(SKY)).toContain('FLY')
    for (const id of [ADMIRAL, SKYPIKE, GUNNERS]) expect(kw(id)).not.toContain('FLY')
    // a friendly model in the way blocks the Admiral but not the Frigate
    const ctx = ctxFor(s, [])
    s.phase = 'movement'
    for (const id of s.units[SKYPIKE].models.slice(1)) removeModel(s, id)
    const tryMove = (unit: UnitId, from: [number, number], to: [number, number]): string | null => {
      centreRow(s, unit, from[0], from[1])
      centreRow(s, SKYPIKE, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2)
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
      const pending = s.pending as never
      const placements: ModelPlacement[] = [{ modelId: s.units[unit].models[0], pos: { x: to[0], y: 0, z: to[1] } }]
      const rej = movementModule.validate?.(s, { type: 'moveUnit', player: 'A', decisionId: '', unitId: unit, placements } as Action, pending)
      return rej ? rej.code : null
    }
    expect(tryMove(ADMIRAL, [-1.5, -5], [1.5, -5])).not.toBeNull()
    expect(tryMove(FRIGATE, [-4, -5], [4, -5])).toBeNull()
  })
})

describe('KO-AI utility hints', () => {
  it('KO-AI-1 the bot keeps Assault Boat for a ride that ended near an enemy, carries a Company before the Admiral, and retreats the Skywardens only from a stronger foe', () => {
    const s = plyGame()
    declare(s, FRIGATE, 'normal')
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'moveDeclared', 'A', PLY, { target: SKYPIKE })
    useOnce(ctx, 'moveEnded', 'A', 'none')
    for (const u of Object.values(s.units).filter((x) => x.player === 'B')) u.location = 'reserves' // clear the enemy bystanders off the table
    centreRow(s, BRUTE, 12, 8)
    expect(kharadronAbilityTiming(s, 'A', 'kharadronAssaultBoat', null)).toBe(-3) // no enemy within 12"
    centreRow(s, BRUTE, s.models[s.units[SKYPIKE].models[0]].pos.x, s.models[s.units[SKYPIKE].models[0]].pos.z + 9)
    expect(kharadronAbilityTiming(s, 'A', 'kharadronAssaultBoat', null)).toBe(0)
    expect(kharadronTargetBonus(s, 'A', 'kharadronPlyTheSkies', SKYPIKE)).toBeGreaterThan(kharadronTargetBonus(s, 'A', 'kharadronPlyTheSkies', GUNNERS)!)
    expect(kharadronTargetBonus(s, 'A', 'kharadronPlyTheSkies', ADMIRAL)).toBeLessThan(0)
    // a weak enemy in combat: stay; a strong one (more Health left than the Skywardens): leave
    const t = game()
    centreRow(t, SKY, 0, 0)
    centreRow(t, BRUTE, 0, 2.5)
    for (const id of t.units[BRUTE].models.slice(1)) removeModel(t, id)
    t.models[t.units[BRUTE].models[0]].woundsRemaining = 1
    expect(kharadronModeBonus(t, 'kharadronTimedCharges', SKY, 'mv:0:0')).toBeGreaterThan(0)
    expect(kharadronModeBonus(t, 'kharadronTimedCharges', SKY, 'mv:5:5')).toBeLessThan(0)
    const u = game()
    centreRow(u, SKY, 0, 0)
    centreRow(u, BRUTE, 0, 2.5)
    expect(kharadronModeBonus(u, 'kharadronTimedCharges', SKY, 'mv:0:0')).toBeLessThan(0)
    expect(kharadronModeBonus(u, 'kharadronTimedCharges', SKY, 'mv:5:5')).toBeGreaterThan(0)
  })
})
