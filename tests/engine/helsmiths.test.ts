// Helsmiths of Hashut (Helforge Host) code hooks: docs/spec/factions/helsmiths-of-hashut.md, test ids HOH-*.
// The descriptors, warscrolls and weapons are the real src/data/factions/helsmiths files on top of the AoS fixture bundle
// (player A = Helforge Host, player B = the fixture Chaos army). Dice are scripted; nothing here patches the shipped data
// (the few `patch` hooks only change the fixture enemy's keywords).
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODULES, ScriptedRng, abilityService, createContext, legalActions, removeModel, unitModels, view,
  type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { attackService, feelNoPainFor } from '../../src/engine/attack'
import { codeHooks } from '../../src/engine/code-hooks'
import { writeDeclaredAttack } from '../../src/engine/declared'
import { effectService } from '../../src/engine/effects'
import { horizontalGap } from '../../src/engine/geometry'
import { hookService } from '../../src/engine/hooks-impl'
import { canDeclareCharge, chargeDiceCount } from '../../src/engine/phases/charge'
import { targetLegality } from '../../src/engine/phases/shooting'
import { weaponService } from '../../src/engine/weapons'
import { replaceableUnits } from '../../src/engine/factions/spearhead-core'
import { checkSlide } from '../../src/engine/factions/aos-moves'
import { dppOf, effectiveDpp, helsmithsAbilityTiming, helsmithsTargetBonus } from '../../src/engine/factions/helsmiths'
import { modelStats } from '../../src/engine/state'
import type { AbilityDescriptor, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/helsmiths/abilities.json'
import enhancementsJson from '../../src/data/factions/helsmiths/enhancements.json'
import weaponsJson from '../../src/data/factions/helsmiths/weapons.json'
import factionJson from '../../src/data/factions/helsmiths/faction.json'
import patrolJson from '../../src/data/factions/helsmiths/patrols/helforge-host.json'
import despotJson from '../../src/data/factions/helsmiths/datasheets/war-despot.json'
import dominatorJson from '../../src/data/factions/helsmiths/datasheets/dominator-engine.json'
import bombardJson from '../../src/data/factions/helsmiths/datasheets/tormentor-bombard.json'
import cohortJson from '../../src/data/factions/helsmiths/datasheets/infernal-cohort.json'

// ---------- fixtures ----------
const bundle = (patch?: (b: DataBundle) => void): DataBundle => withAosBundle((b) => {
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [despotJson, dominatorJson, bombardJson, cohortJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.helsmiths = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
  patch?.(b)
})

const ARMY = 'helsmiths.army.helforge-host'
const HARNESS = 'helsmiths.ability.harness-daemonic-power'
const GRINDING = 'helsmiths.ability.grinding-advance'
const SUPPRESSIVE = 'helsmiths.ability.suppressive-bombardment'
const CONQUEROR = 'helsmiths.ability.black-hearted-conqueror'
const RUINOUS = 'helsmiths.ability.ruinous-bombardment'
const GONGS = 'helsmiths.ability.strike-the-gongs'
const TALISMAN = 'helsmiths.enh.talisman-of-obsidian'
const AMULET = 'helsmiths.enh.amulet-of-burning-hate'
const CHALICE = 'helsmiths.enh.chalice-of-darkness'
const SCROLL = 'helsmiths.enh.scroll-of-petrification'
const AMULET_AB = 'helsmiths.ability.amulet-of-burning-hate'
const CHALICE_AB = 'helsmiths.ability.chalice-of-darkness'
const SCROLL_AB = 'helsmiths.ability.scroll-of-petrification'

const GEN = 'A:war-despot'
const DOM = 'A:dominator-engine'
const BOM = 'A:tormentor-bombard'
const GONG = 'A:infernal-cohort-gong'
const COH = 'A:infernal-cohort'
const BRUTE = 'B:brute'
const GUARD = 'B:guard'
const BOSS = 'B:boss'
const HAWK = 'B:hawk'

const W = (id: string) => `helsmiths.weapon.${id}`

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

// the unit's models in a column along z, the first at (x, z0)
function column(s: GameState, unitId: UnitId, x: number, z0: number, gap = 0.15): void {
  s.units[unitId].location = 'board'
  let cz = z0
  for (const m of unitModels(s, unitId)) {
    const r = Math.max(m.base.radius, m.base.radius2 ?? 0)
    m.pos = { x, y: 0, z: cz }
    cz += 2 * r + gap
  }
}

const unitGap = (s: GameState, a: UnitId, b: UnitId): number =>
  Math.min(...unitModels(s, a).flatMap((m) => unitModels(s, b).map((o) => horizontalGap(m, o))))

function game(opts: { enh?: string; reg?: string; patch?: (b: DataBundle) => void } = {}): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'helsmiths', patrolId: ARMY, enhancementId: opts.enh ?? TALISMAN, regimentAbilityId: opts.reg ?? SUPPRESSIVE }),
      B: makeAosPlayer('B'),
    },
  }, bundle(opts.patch))
  // bystanders go along the back edges, two rows each, clear of the middle where the tests work
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

type Window = Parameters<typeof abilityService.runWindow>[1]

// drives one ability window to its end the way the reducer does: `choose` names the option (or 'pass') for each decision the window
// raises; allocation decisions (topic abilityChoice) go to the code hook's `answer` through hookService.handler
function drive(ctx: EngineContext, window: Window, player: PlayerId, key: string, choose: (p: ChooseOptionDecision) => string): ChooseOptionDecision[] {
  const s = ctx.state
  const seen: ChooseOptionDecision[] = []
  for (let n = 0; n < 120; n++) {
    if (!s.pending && !abilityService.runWindow(ctx, window, player, key)) return seen
    const p = s.pending as ChooseOptionDecision
    seen.push(p)
    const pick = choose(p)
    s.pending = null
    const action: Action = pick === 'pass' ? { type: 'pass', player, decisionId: p.id } : { type: 'chooseOption', player, decisionId: p.id, optionId: pick }
    const handler = p.context.topic === 'abilityChoice' ? hookService.handler : abilityService.handler
    const rej = handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

// use the ability whose option id starts with `abilityId#` once, then pass everything else; `target` / `mode` answer the declare steps
function useOnce(ctx: EngineContext, window: Window, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string; key?: string; choice?: (p: ChooseOptionDecision) => string } = {}): ChooseOptionDecision[] {
  let used = false
  return drive(ctx, window, player, opts.key ?? `${window}:${abilityId}`, (p) => {
    const ids = p.options.map((o) => o.id)
    if (p.context.topic === 'abilityUse') {
      // Harness Daemonic Power is mandatory and offered alone and first in every hero window: use it and hand nothing out
      if (abilityId !== HARNESS && ids.some((id) => id.startsWith(`${HARNESS}#`))) return ids.find((id) => id.startsWith(`${HARNESS}#`))!
      const hit = used ? undefined : ids.find((id) => id.startsWith(`${abilityId}#`))
      if (hit) { used = true; return hit }
      return 'pass'
    }
    if (p.context.topic === 'abilityChoice' && (p.context.data as { code?: string }).code === 'helsmithsHarness') return 'pass'
    if (p.context.topic === 'abilityTarget') return opts.target ?? ids[0]
    if (p.context.topic === 'abilityMode') return opts.mode ?? ids[0]
    return opts.choice ? opts.choice(p) : ids[0]
  })
}

const offered = (s: GameState, player: PlayerId, window: Window): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const wounds = (s: GameState, unitId: UnitId): number => unitModels(s, unitId).reduce((n, m) => n + m.woundsRemaining, 0)
const slay = (s: GameState, unitId: UnitId, n: number): void => { if (n > 0) for (const id of [...s.units[unitId].models].slice(-n)) removeModel(s, id) }
const wardOf = (s: GameState, id: UnitId): number | undefined => feelNoPainFor(ctxFor(s, []), s.units[id].models[0], {} as never)?.threshold
const hasEffect = (s: GameState, unitId: UnitId, abilityId: string): boolean => s.units[unitId].effects.some((e) => e.sourceAbilityId === abilityId)
const giveDpp = (s: GameState, unitId: UnitId, n: number): void => { s.units[unitId].tokens = { ...s.units[unitId].tokens, 'daemonic-power': n } }
const modelsOf = (s: GameState, unitId: UnitId) => unitModels(s, unitId)
const moveOf = (s: GameState, unitId: UnitId): number => {
  const m = modelsOf(s, unitId)[0]
  return hookService.statFor(s, { unitId, modelId: m.id, weapon: null, stat: 'M' }, modelStats(s, m).M)
}
const attacksOf = (s: GameState, unitId: UnitId, weaponId: string): number => {
  const m = modelsOf(s, unitId).find((x) => x.weapons.includes(weaponId))!
  return Number(weaponService.effectiveWeapon(s, m.id, weaponId)!.A)
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

// the harness decision loop for a hero window: use Harness (first and alone), then answer each hand-out with the next pick
function harness(s: GameState, picks: string[]): { ctx: EngineContext; offers: ChooseOptionDecision[]; uses: string[][] } {
  const ctx = ctxFor(s, [])
  const queue = [...picks]
  const offers: ChooseOptionDecision[] = []
  const uses: string[][] = []
  drive(ctx, 'hero', 'A', 'h', (p) => {
    if (p.context.topic === 'abilityUse') {
      uses.push(p.options.map((o) => o.id))
      const id = p.options.find((o) => o.id.startsWith(`${HARNESS}#`))
      return id ? id.id : 'pass'
    }
    offers.push(p)
    return queue.shift() ?? 'pass'
  })
  return { ctx, offers, uses }
}

// ---------- tests ----------
describe('registry and shipped data', () => {
  it('HOH-REG every code in the Helsmiths data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })

  it('HOH-ARMY-2 Reinforcements: the Dominator and both Cohorts can be called back; the Despot and the Bombard never', () => {
    const s = game()
    for (const id of [GEN, DOM, BOM, GONG, COH]) s.units[id].location = 'destroyed'
    expect(replaceableUnits(s, 'A').sort()).toEqual([COH, DOM, GONG].sort())
    expect(s.datasheets['helsmiths.unit.war-despot'].keywords).not.toContain('REINFORCEMENTS')
    expect(s.datasheets['helsmiths.unit.tormentor-bombard'].keywords).not.toContain('REINFORCEMENTS')
  })
})

describe('battle trait: Harness Daemonic Power', () => {
  it('HOH-BT-1 Harness is offered first and alone at the start of your hero phase, cannot be passed, is not offered in the enemy hero phase, and clears every unit\'s DPP', () => {
    const s = game({ enh: SCROLL })
    centreRow(s, GEN, 0, -6); centreRow(s, GONG, -8, -6)
    slay(s, GONG, 2) // Strike the Gongs is usable too
    giveDpp(s, DOM, 2); giveDpp(s, GONG, 1); giveDpp(s, BOM, 3)
    expect(offered(s, 'A', 'hero').sort()).toEqual([GONGS, HARNESS, SCROLL_AB].sort())
    // the first offer is Harness alone and has no pass
    const ctx = ctxFor(s, [])
    expect(abilityService.runWindow(ctx, 'hero', 'A', 'h')).toBe(true)
    const first = s.pending as ChooseOptionDecision
    expect(first.canPass).toBe(false)
    expect(first.options.map((o) => o.id)).toEqual([`${HARNESS}#-`])
    s.pending = null
    // use it and hand nothing out: every point is gone, and the other abilities come back
    const h = harness(s, ['pass'])
    expect(h.uses[0]).toEqual([`${HARNESS}#-`])
    expect(h.uses[1].map((id) => id.split('#')[0]).sort()).toEqual([GONGS, SCROLL_AB].sort())
    for (const id of [GEN, DOM, BOM, GONG, COH]) expect(dppOf(s, id), id).toBe(0)
    // the opponent's hero phase: only the "any" abilities
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'hero')).not.toContain(HARNESS)
  })

  it('HOH-BT-2 Harness grants round + 1 points (2 / 3 / 4 / 5), at most 3 on a unit; stopping early loses the rest', () => {
    const total = (s: GameState): number => [GEN, DOM, BOM, GONG, COH].reduce((n, id) => n + dppOf(s, id), 0)
    // round 1: 2 points, handed out one at a time; after the last there is nothing more to ask
    const r1 = game()
    r1.round = 1
    const h1 = harness(r1, [GEN, DOM])
    expect(h1.offers).toHaveLength(2)
    expect(total(r1)).toBe(2)
    expect([dppOf(r1, GEN), dppOf(r1, DOM)]).toEqual([1, 1])
    // round 2: 3 points
    const r2 = game()
    r2.round = 2
    harness(r2, [DOM, DOM, DOM])
    expect(dppOf(r2, DOM)).toBe(3)
    expect(total(r2)).toBe(3)
    // round 3: 4 points, but the Dominator is full after 3 and drops out of the offer
    const r3 = game()
    r3.round = 3
    const h3 = harness(r3, [DOM, DOM, DOM, GEN])
    expect(h3.offers[3].options.map((o) => o.id)).not.toContain(DOM)
    expect(h3.offers[3].options.map((o) => o.id)).toContain(GEN)
    expect(dppOf(r3, DOM)).toBe(3)
    expect(dppOf(r3, GEN)).toBe(1)
    expect(total(r3)).toBe(4)
  })

  it('HOH-BT-2 (cont.) round 4 gives 5 points; passing early loses the rest and the pool is empty afterwards', () => {
    const total = (s: GameState): number => [GEN, DOM, BOM, GONG, COH].reduce((n, id) => n + dppOf(s, id), 0)
    const r4 = game()
    r4.round = 4
    const ctx = ctxFor(r4, [])
    const plan = [DOM, DOM, DOM, GONG, GONG]
    drive(ctx, 'hero', 'A', 'h', (p) => {
      if (p.context.topic === 'abilityUse') return p.options[0].id
      return plan.shift() ?? 'pass'
    })
    expect([dppOf(r4, DOM), dppOf(r4, GONG)]).toEqual([3, 2])
    expect(total(r4)).toBe(5)
    // stop after one point in round 3 (pool 4): 1 point on the unit, the other 3 are lost
    const early = game()
    early.round = 3
    const h = harness(early, [GEN, 'pass'])
    expect(h.offers).toHaveLength(2)
    expect(total(early)).toBe(1)
    expect(summaries(h.ctx).some((x) => /stops, 3 points lost/.test(x))).toBe(true)
    expect(((early.mission.custom.hohPool as Record<string, number>) ?? {}).A).toBe(0)
  })

  it('HOH-BT-3 DPP stay through the enemy turn and are cleared only at your next hero phase', () => {
    const s = game()
    s.round = 2
    harness(s, [DOM, DOM, GEN])
    expect([dppOf(s, DOM), dppOf(s, GEN)]).toEqual([2, 1])
    // the enemy's turn: no Harness for us, nothing clears
    s.activePlayer = 'B'
    s.phase = 'command'
    expect(offered(s, 'A', 'hero')).not.toContain(HARNESS)
    abilityService.runWindow(ctxFor(s, []), 'hero', 'B', 'h-enemy')
    expect([dppOf(s, DOM), dppOf(s, GEN)]).toEqual([2, 1])
    s.phase = 'fight'
    expect([dppOf(s, DOM), dppOf(s, GEN)]).toEqual([2, 1])
    // our next hero phase (round 3): a fresh Harness clears them and hands out 4
    s.round = 3
    s.activePlayer = 'A'
    s.phase = 'command'
    s.phaseState.marks = []
    harness(s, [BOM, 'pass'])
    expect([dppOf(s, DOM), dppOf(s, GEN), dppOf(s, BOM)]).toEqual([0, 0, 1])
  })
})

describe('regiment abilities', () => {
  // two Cohorts side by side in our deployment zone, an enemy unit a few inches off: the state the deployment window sees
  const deployState = (reg = GRINDING): GameState => {
    const s = game({ reg })
    s.phase = 'deployment'
    s.round = 0
    centreRow(s, GONG, -5, 0)
    centreRow(s, COH, 5, 0)
    centreRow(s, GUARD, 0, 5.4) // 4.2" of gap to the Cohorts
    return s
  }
  const slideMove = (opts: { id: string }[], s: GameState, unitId: UnitId): string => {
    // the legal slide that carries the unit furthest toward the enemy (positive z)
    let best = opts[0].id, bestZ = -Infinity
    for (const o of opts) {
      const m = /^mv:(-?[\d.]+):(-?[\d.]+)$/.exec(o.id)
      if (!m) continue
      if (Number(m[2]) > bestZ) { bestZ = Number(m[2]); best = o.id }
    }
    void s; void unitId
    return best
  }

  it('HOH-RA-1 Grinding Advance: offered once in the deployment window; up to 2 Cohorts slide <= 3" without entering enemy combat range', () => {
    const s = deployState()
    expect(offered(s, 'A', 'deployment')).toEqual([GRINDING])
    expect(offered(s, 'B', 'deployment')).toEqual([])
    // a straight 3" slide toward the enemy would end 1.2" from it, inside combat range: illegal; one away from it is fine
    expect(checkSlide(s, GONG, 0, 3, 3, false, { normalMove: true }).ok).toBe(false)
    expect(checkSlide(s, GONG, 0, -3, 3, false, { normalMove: true }).ok).toBe(true)
    const before = new Map([GONG, COH].map((id) => [id, modelsOf(s, id).map((m) => ({ ...m.pos }))]))
    const ctx = ctxFor(s, [])
    const seen: string[][] = []
    drive(ctx, 'deployment', 'A', 'deploy:abilities', (p) => {
      seen.push(p.options.map((o) => o.id))
      if (p.context.topic === 'abilityUse') return p.options[0].id
      if (p.context.topic === 'abilityTarget') {
        const picked = (p.context.data as { picked?: string[] }).picked ?? []
        return picked.length === 0 ? GONG : picked.length === 1 ? COH : '__done'
      }
      return slideMove(p.options, s, GONG)
    })
    // both Cohorts were offered, then Done, then the slides
    expect(seen[1]).toEqual([COH, GONG].sort())
    expect(seen[2]).toContain('__done')
    for (const id of [GONG, COH]) {
      const moved = Math.max(...modelsOf(s, id).map((m, i) => Math.hypot(m.pos.x - before.get(id)![i].x, m.pos.z - before.get(id)![i].z)))
      expect(moved, id).toBeLessThanOrEqual(3 + 1e-6)
      expect(unitGap(s, id, GUARD), id).toBeGreaterThanOrEqual(3 - 1e-6)
    }
    expect(Math.max(...modelsOf(s, GONG).map((m, i) => Math.hypot(m.pos.x - before.get(GONG)![i].x, m.pos.z - before.get(GONG)![i].z)))).toBeGreaterThan(0.1)
    expect(summaries(ctx).some((x) => x.startsWith('Grinding Advance:'))).toBe(true)
    // once per battle
    expect(offered(s, 'A', 'deployment')).toEqual([])
  })

  it('HOH-RA-2 Grinding Advance: the moved Cohorts cannot charge in round 1 and can in round 2; an unmoved unit is unaffected', () => {
    const s = deployState()
    // only the gong Cohort is picked
    const ctx = ctxFor(s, [])
    drive(ctx, 'deployment', 'A', 'deploy:abilities', (p) => {
      if (p.context.topic === 'abilityUse') return p.options[0].id
      if (p.context.topic === 'abilityTarget') {
        const picked = (p.context.data as { picked?: string[] }).picked ?? []
        return picked.length === 0 ? GONG : '__done'
      }
      return 'pass'
    })
    expect(hasEffect(s, GONG, GRINDING)).toBe(true)
    expect(hasEffect(s, COH, GRINDING)).toBe(false)
    // round 1, charge phase: two enemies in reach
    s.phase = 'charge'; s.round = 1; s.activePlayer = 'A'
    centreRow(s, GONG, -6, 0); centreRow(s, COH, 6, 0)
    centreRow(s, BRUTE, -6, 6); centreRow(s, BOSS, 6, 6)
    expect(canDeclareCharge(s, GONG)).toBe(false)
    expect(canDeclareCharge(s, COH)).toBe(true)
    // round 2: the bar is gone
    s.round = 2
    expect(canDeclareCharge(s, GONG)).toBe(true)
    // it can still Move and Run in round 1: only the Charge is forbidden
    expect(hookService.chargeForbidden(s, GONG)).toBe(false)
    s.round = 1
    expect(hookService.chargeForbidden(s, GONG)).toBe(true)
  })

  // the Bombard shoots the Guard (Infantry) and the Hawk (not Infantry); the Brute and the Boss are untouched
  const shotState = (): GameState => {
    const s = game({ reg: SUPPRESSIVE })
    s.round = 1
    centreRow(s, BOM, 0, -8)
    centreRow(s, GUARD, 0, 2)
    centreRow(s, HAWK, 8, 2)
    centreRow(s, BRUTE, -9, 2)
    centreRow(s, BOSS, 12, 6)
    return s
  }
  const shoot = (s: GameState, target: UnitId, n: number, dice: number[]) => attack(s, 'ranged', dice, BOM, W('torrent-of-ruinous-energy'), target, n)

  it('HOH-RA-3 Suppressive Bombardment: only an enemy Infantry unit the Bombard damaged this turn can be picked; once per turn', () => {
    const s = shotState()
    s.phase = 'shooting'
    expect(offered(s, 'A', 'shooting')).not.toContain(SUPPRESSIVE) // nothing damaged yet
    shoot(s, GUARD, 2, [3, 3, 3, 3, 1, 1, 2, 2, 2, 2])
    shoot(s, HAWK, 1, [3, 3, 1, 2, 2, 2])
    expect(wounds(s, GUARD)).toBeLessThan(10)
    expect(wounds(s, HAWK)).toBeLessThan(4)
    expect(offered(s, 'A', 'shooting')).toContain(SUPPRESSIVE)
    const ctx = ctxFor(s, [])
    const seen = useOnce(ctx, 'shooting', 'A', SUPPRESSIVE, { key: 'shooting:after:bom' })
    // the Guard is the only legal pick (the Hawk is not Infantry, the Brute and the Boss were never hit): a single target is taken at once
    expect(seen.some((p) => p.context.topic === 'abilityTarget')).toBe(false)
    expect(hasEffect(s, GUARD, SUPPRESSIVE)).toBe(true)
    expect(hasEffect(s, HAWK, SUPPRESSIVE)).toBe(false)
    expect(hasEffect(s, BRUTE, SUPPRESSIVE)).toBe(false)
    // once per turn
    expect(offered(s, 'A', 'shooting')).not.toContain(SUPPRESSIVE)
    // the enemy's shooting phase does not offer it to us
    const t = shotState()
    t.phase = 'shooting'
    shoot(t, GUARD, 2, [3, 3, 3, 3, 1, 1, 2, 2, 2, 2])
    t.activePlayer = 'B'
    expect(offered(t, 'A', 'shooting')).not.toContain(SUPPRESSIVE)
  })

  it('HOH-RA-4 Suppressive Bombardment: the target rolls 1 fewer charge die (never below 1) through the enemy\'s next turn; gone at the start of your next turn', () => {
    const s = shotState()
    s.phase = 'shooting'
    shoot(s, GUARD, 2, [3, 3, 3, 3, 1, 1, 2, 2, 2, 2])
    expect(chargeDiceCount(s, GUARD)).toBe(2)
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'shooting', 'A', SUPPRESSIVE, { key: 'shooting:after:bom' })
    expect(chargeDiceCount(s, GUARD)).toBe(1)
    expect(chargeDiceCount(s, BRUTE)).toBe(2) // an untouched unit rolls both dice
    // a second "one fewer die" cannot take it below 1
    effectService.grant(ctx, GUARD, { extraChargeDice: -1 }, { sourceAbilityId: 'x', sourceUnitId: GUARD, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    expect(chargeDiceCount(s, GUARD)).toBe(1)
    // the enemy's turn starts: still there; our next turn starts: gone
    effectService.expire(ctx, 'nextOwnTurn', 'B')
    expect(hasEffect(s, GUARD, SUPPRESSIVE)).toBe(true)
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(hasEffect(s, GUARD, SUPPRESSIVE)).toBe(false)
  })
})

describe('enhancements', () => {
  it('HOH-ENH-1 Scroll of Petrification: Ward 2+ for the rest of the turn; the general cannot charge or use abilities and friendly abilities cannot pick it; once per battle', () => {
    const s = game({ enh: SCROLL })
    centreRow(s, GEN, 0, -6)
    expect(wardOf(s, GEN)).toBeUndefined()
    expect(canDeclareCharge(s, GEN)).toBe(false) // nothing in reach yet
    centreRow(s, BOSS, 0, 2)
    expect(canDeclareCharge(s, GEN)).toBe(true)
    // usable in either hero phase
    expect(offered(s, 'A', 'hero')).toContain(SCROLL_AB)
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'hero')).toContain(SCROLL_AB)
    s.activePlayer = 'A'
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'hero', 'A', SCROLL_AB, { key: 'hero:scroll' })
    expect(wardOf(s, GEN)).toBe(2)
    expect(hookService.unitHasEffectFlag(s, GEN, 'noAbilities')).toBe(true)
    expect(canDeclareCharge(s, GEN)).toBe(false)
    expect(hasEffect(s, GEN, SCROLL_AB)).toBe(true)
    expect(s.units[GEN].effects[0].expires.kind).toBe('turnEnd')
    // the Ward is real: a point that would hurt is saved on a 2
    const swing = (dice: number[]): number => {
      const before = wounds(s, GEN)
      attack(s, 'melee', dice, BOSS, 'fx.w.boss-blade', GEN, 1)
      return before - wounds(s, GEN)
    }
    centreRow(s, BOSS, 0, -4.5)
    expect(swing([4, 2, 1, 2, 2])).toBe(0) // hit, wound, failed save, then the 2 on the ward saves both points
    // it is spent: not offered again, even next round
    expect(offered(s, 'A', 'hero')).not.toContain(SCROLL_AB)
    effectService.expire(ctx, 'turnEnd', null)
    expect(hookService.unitHasEffectFlag(s, GEN, 'noAbilities')).toBe(false)
    expect(wardOf(s, GEN)).toBeUndefined()
    s.round = 3
    expect(offered(s, 'A', 'hero')).not.toContain(SCROLL_AB)
  })

  it('HOH-ENH-2 Chalice of Darkness: D3 mortal damage on a visible enemy within 12" of the general; your shooting phase only; once per battle', () => {
    const s = game({ enh: CHALICE })
    s.phase = 'shooting'
    centreRow(s, GEN, 0, -6)
    centreRow(s, BRUTE, 0, 2) // about 7.5" away
    centreRow(s, BOSS, 0, 8) // beyond 12"
    expect(offered(s, 'A', 'shooting')).toContain(CHALICE_AB)
    s.phase = 'movement'
    expect(offered(s, 'A', 'shooting')).toContain(CHALICE_AB) // the window, not the phase field, decides; the hero window does not
    expect(offered(s, 'A', 'hero')).not.toContain(CHALICE_AB)
    s.phase = 'shooting'
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'shooting')).not.toContain(CHALICE_AB)
    s.activePlayer = 'A'
    const ctx = ctxFor(s, [4]) // D3: a 4 on the die is a 2
    const before = wounds(s, BRUTE)
    const seen = useOnce(ctx, 'shooting', 'A', CHALICE_AB, { key: 'shooting:active' })
    expect(seen.some((p) => p.context.topic === 'abilityTarget')).toBe(false) // the Boss is out of range: a single legal target
    expect(before - wounds(s, BRUTE)).toBe(2)
    expect(wounds(s, BOSS)).toBe(8)
    expect(leftOver(ctx)).toEqual([])
    expect(offered(s, 'A', 'shooting')).not.toContain(CHALICE_AB)
  })

  it('HOH-ENH-3 Talisman of Obsidian: the first damage point allocated to the general in each phase is ignored; the second is not', () => {
    const s = game({ enh: TALISMAN })
    centreRow(s, GEN, 0, -2)
    centreRow(s, BOSS, 0, 0.2)
    expect(hookService.ignoresFirstDamage(s, GEN)).toBe(true)
    expect(hookService.ignoresFirstDamage(s, DOM)).toBe(false)
    const lost = (): number => {
      const before = wounds(s, GEN)
      // one attack of 2 damage gets through: 2 points, the first ignored
      attack(s, 'melee', [4, 2, 1], BOSS, 'fx.w.boss-blade', GEN, 1)
      return before - wounds(s, GEN)
    }
    expect(lost()).toBe(1)
    expect(lost()).toBe(2) // same phase: the free point is already spent
    s.phaseState.marks = s.phaseState.marks.filter((m) => !m.startsWith('ignore1:')) // a new phase
    expect(lost()).toBe(1)
    // no Talisman, no free point
    const plain = game({ enh: SCROLL })
    expect(hookService.ignoresFirstDamage(plain, GEN)).toBe(false)
  })

  it('HOH-ENH-4 Amulet of Burning Hate: the general\'s unmodified 5s and 6s to hit are critical (Crit (Mortal) on the Glaive) until the end of the turn; once per battle', () => {
    const s = game({ enh: AMULET })
    centreRow(s, GEN, 0, -2)
    centreRow(s, BOSS, 0, 0.2)
    s.phase = 'fight'
    expect(offered(s, 'A', 'fight')).toContain(AMULET_AB)
    s.activePlayer = 'B'
    expect(offered(s, 'A', 'fight')).toContain(AMULET_AB) // any combat phase
    s.activePlayer = 'A'
    // before: a 5 to hit is an ordinary hit that still has to wound (here it fails) -> no damage
    const plain = attack(s, 'melee', [5, 1], GEN, W('daemonflame-glaive'), BOSS, 1)
    expect(plain.rng.remaining).toEqual([])
    expect(wounds(s, BOSS)).toBe(8)
    const ctx = ctxFor(s, [])
    useOnce(ctx, 'fight', 'A', AMULET_AB, { key: 'fight:active' })
    expect(hasEffect(s, GEN, AMULET_AB)).toBe(true)
    // after: the same 5 is critical, Crit (Mortal) deals the weapon's 2 damage with no wound or save roll
    const crit = attack(s, 'melee', [5], GEN, W('daemonflame-glaive'), BOSS, 1)
    expect(crit.rng.remaining).toEqual([])
    expect(wounds(s, BOSS)).toBe(6)
    // a 4 is still an ordinary hit
    const four = attack(s, 'melee', [4, 1], GEN, W('daemonflame-glaive'), BOSS, 1)
    expect(four.rng.remaining).toEqual([])
    expect(wounds(s, BOSS)).toBe(6)
    expect(offered(s, 'A', 'fight')).not.toContain(AMULET_AB)
    effectService.expire(ctx, 'turnEnd', null)
    expect(hasEffect(s, GEN, AMULET_AB)).toBe(false)
  })
})

describe('warscroll abilities', () => {
  it('HOH-AB-1 Black-Hearted Conqueror: a 0-DPP unit wholly within 6" + 3"/DPP of a Despot with DPP and visible to it counts as 1; nothing when the Despot has 0; never adds to real tokens', () => {
    const s = game()
    centreRow(s, GEN, 0, -6)
    centreRow(s, DOM, 5, -6) // wholly within 9"
    expect(effectiveDpp(s, DOM)).toBe(0) // the Despot has no points
    giveDpp(s, GEN, 1)
    expect(effectiveDpp(s, DOM)).toBe(1)
    expect(dppOf(s, DOM)).toBe(0) // computed, not stored
    expect(effectiveDpp(s, GEN)).toBe(1)
    // farther away (the engine's 80 mm base reaches 1.57" further out): out of the 9" of one point, inside the 12" of two
    centreRow(s, DOM, 9.5, -6)
    expect(effectiveDpp(s, DOM)).toBe(0)
    giveDpp(s, GEN, 2)
    expect(effectiveDpp(s, DOM)).toBe(1)
    centreRow(s, DOM, 13, -6)
    expect(effectiveDpp(s, DOM)).toBe(0)
    giveDpp(s, GEN, 3)
    expect(effectiveDpp(s, DOM)).toBe(1) // 15" for three points
    centreRow(s, DOM, 14.8, -6)
    expect(effectiveDpp(s, DOM)).toBe(0)
    // it never lifts a unit above 1 and never stacks with real tokens
    giveDpp(s, DOM, 2)
    expect(effectiveDpp(s, DOM)).toBe(2)
    giveDpp(s, DOM, 0)
    // a unit that is not wholly within range (one model sticks out) gets nothing
    giveDpp(s, GEN, 1)
    centreRow(s, COH, 5.5, -9)
    expect(effectiveDpp(s, COH)).toBe(1)
    modelsOf(s, COH)[4].pos = { ...modelsOf(s, COH)[4].pos, x: 12, z: -9 }
    expect(effectiveDpp(s, COH)).toBe(0)
    // slain Despot: nothing
    centreRow(s, COH, 5.5, -9)
    expect(effectiveDpp(s, COH)).toBe(1)
    s.units[GEN].location = 'destroyed'
    expect(effectiveDpp(s, COH)).toBe(0)
    expect(s.abilities[CONQUEROR]).toBeDefined()
  })

  it('HOH-AB-1 (cont.) the Despot must see the unit: a ruin between them closes the aura', () => {
    const s = game()
    giveDpp(s, GEN, 1)
    centreRow(s, GEN, -6, -1)
    centreRow(s, DOM, -6, 7)
    const clear = effectiveDpp(s, DOM)
    // the same pair with an obscuring ruin on the line (fixture terrain: the ruin stands at (-6, 2))
    const withRuin = aosStateWithRuin()
    giveDpp(withRuin, GEN, 1)
    centreRow(withRuin, GEN, -6, -1)
    centreRow(withRuin, DOM, -6, 7)
    expect(clear).toBe(1)
    expect(effectiveDpp(withRuin, DOM)).toBe(0)
  })

  it('HOH-AB-2 Daemonic Strength: +1" Move and +1 Attacks on each weapon per DPP (3 DPP: Move 9", Cannons 8, Horns 6)', () => {
    const s = game()
    expect([moveOf(s, DOM), attacksOf(s, DOM, W('immolation-cannons')), attacksOf(s, DOM, W('horns-and-pummelling-strikes'))]).toEqual([6, 5, 3])
    for (const n of [1, 2, 3]) {
      giveDpp(s, DOM, n)
      expect([moveOf(s, DOM), attacksOf(s, DOM, W('immolation-cannons')), attacksOf(s, DOM, W('horns-and-pummelling-strikes'))]).toEqual([6 + n, 5 + n, 3 + n])
    }
    // other units are untouched by the Dominator's rule
    giveDpp(s, BOM, 3)
    expect(moveOf(s, BOM)).toBe(4)
    expect(attacksOf(s, BOM, W('torrent-of-ruinous-energy'))).toBe(4)
    // a Dominator within a Despot's aura counts as 1
    giveDpp(s, DOM, 0)
    centreRow(s, GEN, 0, -6); centreRow(s, DOM, 5, -6)
    giveDpp(s, GEN, 1)
    expect(moveOf(s, DOM)).toBe(7)
  })

  // the closest model of the target is exactly `gap` inches from the Bombard (a column of Guards pointing at it)
  const trajectory = (gap: number, models: number): { final: number; hit: boolean } => {
    const s = game()
    centreRow(s, BOM, 0, -8)
    const b = modelsOf(s, BOM)[0]
    const g0 = modelsOf(s, GUARD)[0]
    column(s, GUARD, 0, -8 + b.base.radius + gap + g0.base.radius)
    slay(s, GUARD, 10 - models)
    expect(unitGap(s, BOM, GUARD)).toBeCloseTo(gap, 3)
    const a = attack(s, 'ranged', [2, 6, 1, 1, 1, 1, 1], BOM, W('torrent-of-ruinous-energy'), GUARD, 1)
    const h = of(a.events, 'HitRolled')[0]
    return { final: h.final, hit: h.hit }
  }

  it('HOH-AB-3 Calculated Trajectory: +1 to hit only against a target with 5+ models more than 12" away; no bonus at 12" or against 4 models', () => {
    expect(trajectory(15, 10)).toEqual({ final: 3, hit: true }) // a 2 becomes a 3: the Torrent hits on 3+
    expect(trajectory(12.5, 5)).toEqual({ final: 3, hit: true })
    expect(trajectory(12, 10)).toEqual({ final: 2, hit: false })
    expect(trajectory(15, 4)).toEqual({ final: 2, hit: false })
    expect(trajectory(8, 10)).toEqual({ final: 2, hit: false })
  })

  // the Bombard has shot the Guard and nothing else: the shot record Ruinous Bombardment reads
  const bombarded = (dpp: number): GameState => {
    const s = game()
    s.round = 1
    centreRow(s, BOM, 0, -9)
    centreRow(s, GUARD, 0, 0)
    centreRow(s, BRUTE, -4, 3.5) // within 6" of the Guard
    centreRow(s, BOSS, 4, 3.5) // within 6" of the Guard
    centreRow(s, HAWK, 12, 8) // beyond 6" of it
    giveDpp(s, BOM, dpp)
    s.phase = 'shooting'
    writeDeclaredAttack(s, { unitId: BOM, phase: 'shooting', seq: 1, targetUnitIds: [GUARD] })
    attack(s, 'ranged', [1, 1, 1, 1], BOM, W('torrent-of-ruinous-energy'), GUARD, 1)
    return s
  }

  it('HOH-AB-4 Ruinous Bombardment: needs a Shoot this turn at one single unit; extra targets = DPP among enemies within 6" of it; 3+ gives -3 control score until end of turn (floor 1)', () => {
    // no shot yet: not offered
    const none = game()
    centreRow(none, BOM, 0, -9); centreRow(none, GUARD, 0, 0)
    none.phase = 'shooting'
    expect(offered(none, 'A', 'shooting')).not.toContain(RUINOUS)
    // two different targets in one turn: not "every attack at the same unit"
    const two = bombarded(1)
    writeDeclaredAttack(two, { unitId: BOM, phase: 'shooting', seq: 2, targetUnitIds: [BRUTE] })
    attack(two, 'ranged', [1, 1, 1, 1], BOM, W('torrent-of-ruinous-energy'), BRUTE, 1)
    expect(offered(two, 'A', 'shooting')).not.toContain(RUINOUS)
    // another turn's record is stale
    const stale = bombarded(1)
    stale.round = 2
    expect(offered(stale, 'A', 'shooting')).not.toContain(RUINOUS)

    // 1 DPP, two candidates within 6" (Brute and Boss; the Hawk is too far): one extra pick
    const s = bombarded(1)
    expect(offered(s, 'A', 'shooting')).toContain(RUINOUS)
    expect(offered(s, 'B', 'shooting')).not.toContain(RUINOUS)
    const objective = Object.keys(s.objectives)[0]
    const score = (st: GameState, unit: UnitId): number => hookService.unitControlScore(ctxFor(st, []), unit, objective, 5)
    const ctx = ctxFor(s, [3, 2])
    const seen = useOnce(ctx, 'shooting', 'A', RUINOUS, { key: 'shooting:after:bom', choice: () => BOSS })
    const picks = seen.filter((p) => p.context.topic === 'abilityChoice')
    expect(picks).toHaveLength(1)
    expect(picks[0].options.map((o) => o.id).sort()).toEqual([BOSS, BRUTE].sort())
    // the Guard (first target) rolled 3 and works; the Boss rolled 2 and does not
    expect(hasEffect(s, GUARD, RUINOUS)).toBe(true)
    expect(hasEffect(s, BOSS, RUINOUS)).toBe(false)
    expect(hasEffect(s, BRUTE, RUINOUS)).toBe(false)
    expect(leftOver(ctx)).toEqual([])
    expect(score(s, GUARD)).toBe(2)
    expect(score(s, BOSS)).toBe(5)
    // once per turn
    expect(offered(s, 'A', 'shooting')).not.toContain(RUINOUS)
    // the floor of 1 holds, and the cut ends with the turn
    expect(hookService.unitControlScore(ctxFor(s, []), GUARD, objective, 2)).toBe(1)
    effectService.expire(ctx, 'turnEnd', null)
    expect(score(s, GUARD)).toBe(5)

    // 0 DPP: exactly one target, no pick
    const zero = bombarded(0)
    const c0 = ctxFor(zero, [6])
    const seen0 = useOnce(c0, 'shooting', 'A', RUINOUS, { key: 'shooting:after:bom' })
    expect(seen0.some((p) => p.context.topic === 'abilityChoice')).toBe(false)
    expect(hasEffect(zero, GUARD, RUINOUS)).toBe(true)
    // 3 DPP and only two candidates: both are taken without a question
    const all = bombarded(3)
    const c3 = ctxFor(all, [3, 3, 3])
    const seen3 = useOnce(c3, 'shooting', 'A', RUINOUS, { key: 'shooting:after:bom' })
    expect(seen3.some((p) => p.context.topic === 'abilityChoice')).toBe(false)
    for (const id of [GUARD, BRUTE, BOSS]) expect(hasEffect(all, id, RUINOUS), id).toBe(true)
    expect(hasEffect(all, HAWK, RUINOUS)).toBe(false)
  })

  it('HOH-AB-5 Strike the Gongs: removes the token and returns up to D3 slain models; not offered without the token or with no slain models; once per battle', () => {
    const s = game()
    centreRow(s, GONG, -4, -6); centreRow(s, COH, 4, -6)
    s.phase = 'command'
    expect(offered(s, 'A', 'hero')).not.toContain(GONGS) // nobody is hurt
    slay(s, GONG, 3); slay(s, COH, 3)
    expect(offered(s, 'A', 'hero').filter((id) => id === GONGS)).toHaveLength(1) // only the unit with the token
    expect(s.units[GONG].tokens['gong-carrier']).toBe(1)
    const ctx = ctxFor(s, [4]) // D3: a 4 on the die is a 2
    useOnce(ctx, 'hero', 'A', GONGS, { key: 'hero:gongs' })
    expect(s.units[GONG].models).toHaveLength(4) // 2 of 3 slain models came back
    expect(s.units[GONG].tokens['gong-carrier']).toBe(0)
    expect(s.units[COH].models).toHaveLength(2)
    expect(summaries(ctx).some((x) => x.includes('Gong Carrier is gone'))).toBe(true)
    expect(leftOver(ctx)).toEqual([])
    // the token is gone and the use is spent
    expect(offered(s, 'A', 'hero')).not.toContain(GONGS)
    // never above 5: a D3 of 3 with one model slain returns one
    const t = game()
    centreRow(t, GONG, 0, -6)
    slay(t, GONG, 1)
    useOnce(ctxFor(t, [6]), 'hero', 'A', GONGS, { key: 'hero:gongs' })
    expect(t.units[GONG].models).toHaveLength(5)
    // any hero phase: the opponent's too
    const u = game()
    centreRow(u, GONG, 0, -6); slay(u, GONG, 2)
    u.activePlayer = 'B'
    expect(offered(u, 'A', 'hero')).toContain(GONGS)
  })

  it('HOH-AB-6 Daemonic Resilience: 1 DPP Ward 6+, 2 DPP Ward 5+, 3 DPP Ward 5+ and the first damage point each phase ignored', () => {
    const s = game()
    centreRow(s, COH, 0, -6)
    expect(wardOf(s, COH)).toBeUndefined()
    expect(hookService.ignoresFirstDamage(s, COH)).toBe(false)
    giveDpp(s, COH, 1)
    expect(wardOf(s, COH)).toBe(6)
    expect(hookService.ignoresFirstDamage(s, COH)).toBe(false)
    giveDpp(s, COH, 2)
    expect(wardOf(s, COH)).toBe(5)
    expect(hookService.ignoresFirstDamage(s, COH)).toBe(false)
    giveDpp(s, COH, 3)
    expect(wardOf(s, COH)).toBe(5)
    expect(hookService.ignoresFirstDamage(s, COH)).toBe(true)
    // the Gong Cohort is the same warscroll; the Dominator has no Ward from this rule
    giveDpp(s, DOM, 3)
    centreRow(s, DOM, 8, -6)
    expect(wardOf(s, DOM)).toBeUndefined()
    // a Cohort inside the Despot's aura counts as having 1 point: Ward 6+
    const t = game()
    centreRow(t, GEN, 0, -6); giveDpp(t, GEN, 1); centreRow(t, COH, 4, -9)
    expect(wardOf(t, COH)).toBe(6)
    // the free point is real: 1 damage point from a 1-damage attack is ignored once in a phase
    const u = game()
    centreRow(u, COH, 0, -2); centreRow(u, GUARD, 0, 0.1)
    giveDpp(u, COH, 3)
    // damage points that reach the unit (a slain model in the middle of the row also costs coherency culls, so count the events)
    const applied = (events: GameEvent[]): number => of(events, 'DamageApplied').reduce((n, e) => n + e.amount, 0)
    // two Guard attacks wound and fail their saves: 2 damage points; at 3 DPP the wards (5+) roll 1s and the first point is ignored
    const three = attack(u, 'melee', [4, 4, 4, 4, 1, 1, 1, 1], GUARD, 'fx.w.guard-spear', COH, 2)
    expect(of(three.events, 'FeelNoPainRolled')).toHaveLength(2)
    expect(of(three.events, 'DamageIgnored')).toHaveLength(1)
    expect(applied(three.events)).toBe(1)
    const v = game()
    centreRow(v, COH, 0, -2); centreRow(v, GUARD, 0, 0.1)
    const none = attack(v, 'melee', [4, 4, 4, 4, 1, 1], GUARD, 'fx.w.guard-spear', COH, 2)
    expect(of(none.events, 'DamageIgnored')).toHaveLength(0)
    expect(applied(none.events)).toBe(2) // nothing ignored and no ward without the points
  })
})

describe('weapons', () => {
  it('HOH-WEAP-1 Daemonflame Glaive critical hits deal mortal damage; the Dominator\'s and the Bombard\'s big weapons deal D3', () => {
    const s = game()
    centreRow(s, GEN, 0, -2); centreRow(s, BOSS, 0, 0.2)
    s.phase = 'fight'
    const a = attack(s, 'melee', [6], GEN, W('daemonflame-glaive'), BOSS, 1)
    expect(a.rng.remaining).toEqual([]) // no wound roll, no save: the crit is mortal damage
    expect(wounds(s, BOSS)).toBe(6)
    for (const id of ['immolation-cannons', 'horns-and-pummelling-strikes', 'torrent-of-ruinous-energy']) expect(s.weapons[W(id)].D, id).toBe('D3')
  })

  it('HOH-WEAP-2 Immolation Cannons can shoot while the Dominator is in combat; the Torrent cannot', () => {
    const s = game()
    centreRow(s, DOM, 0, -2); centreRow(s, BOSS, 0, 1.2)
    centreRow(s, BOM, 8, -2); centreRow(s, GUARD, 8, 1.2)
    expect(unitGap(s, DOM, BOSS)).toBeLessThan(3)
    expect(unitGap(s, BOM, GUARD)).toBeLessThan(3)
    const cannon = s.weapons[W('immolation-cannons')]
    const torrent = s.weapons[W('torrent-of-ruinous-energy')]
    s.phase = 'shooting'
    expect(targetLegality(s, DOM, modelsOf(s, DOM)[0].id, cannon, BOSS)).toBeNull()
    expect(targetLegality(s, BOM, modelsOf(s, BOM)[0].id, torrent, GUARD)?.code).toBe('E_IN_COMBAT')
  })

  it('HOH-WEAP-3 Torrent of Ruinous Energy gets +1 Rend against Infantry and +1 against Cavalry (cumulative)', () => {
    // the Rend the save roll carries: the save die minus the final result
    const rendAgainst = (patch: (b: DataBundle) => void): number => {
      const s = game({ patch })
      centreRow(s, BOM, 0, -8)
      centreRow(s, BRUTE, 0, 0)
      const a = attack(s, 'ranged', [3, 3, 4, 2, 2, 2], BOM, W('torrent-of-ruinous-energy'), BRUTE, 1)
      const e = of(a.events, 'SaveRolled')[0]
      return e.die - e.final
    }
    const plain = rendAgainst((b) => { b.datasheets['fx.brute'].keywords = [] })
    const infantry = rendAgainst((b) => { b.datasheets['fx.brute'].keywords = ['INFANTRY'] })
    const cavalry = rendAgainst((b) => { b.datasheets['fx.brute'].keywords = ['CAVALRY'] })
    const both = rendAgainst((b) => { b.datasheets['fx.brute'].keywords = ['INFANTRY', 'CAVALRY'] })
    expect([plain, infantry, cavalry, both]).toEqual([1, 2, 2, 3])
  })

  it('HOH-WEAP-4 Hashutite Spear gets +1 Rend against a unit that charged this turn', () => {
    const rend = (charged: boolean): number => {
      const s = game()
      centreRow(s, COH, 0, -2); centreRow(s, BRUTE, 0, 0.1)
      s.units[BRUTE].turn.chargedThisTurn = charged
      const a = attack(s, 'melee', [3, 4, 4, 2, 2], COH, W('hashutite-spear'), BRUTE, 1)
      const e = of(a.events, 'SaveRolled')[0]
      return e.die - e.final
    }
    expect(rend(false)).toBe(0)
    expect(rend(true)).toBe(1)
  })
})

describe('AI hints', () => {
  it('HOH-AI-1 the AI\'s Harness allocation follows the spec: the Despot first when it covers a unit, then the Dominator; Scroll only as a shield in the enemy hero phase', async () => {
    const s = game()
    s.round = 2
    centreRow(s, GEN, 0, -6)
    centreRow(s, DOM, 5, -6) // wholly within the Despot's 9"
    centreRow(s, COH, -5, -6)
    centreRow(s, GONG, -12, -6)
    centreRow(s, BOM, 10, -10)
    centreRow(s, BOSS, 0, 4); centreRow(s, GUARD, 8, 6); centreRow(s, BRUTE, -8, 6); centreRow(s, HAWK, 12, 2)
    const ctx = ctxFor(s, [])
    let ai: UnitId[] = []
    const bot = new UtilityDecider('normal', 'hoh-ai')
    const picks: Action[] = []
    // the bot answers every decision of the window itself
    for (let n = 0; n < 12; n++) {
      if (!s.pending && !abilityService.runWindow(ctx, 'hero', 'A', 'h')) break
      const p = s.pending as ChooseOptionDecision
      const legal = legalActions(s, p) as Action[]
      const action = await bot.decide(view(s, 'A'), p, legal)
      picks.push(action)
      s.pending = null
      const handler = p.context.topic === 'abilityChoice' ? hookService.handler : abilityService.handler
      expect(handler.handle(ctx, action, p)).toBeUndefined()
      if (p.context.topic === 'abilityChoice') ai = [...ai, (action as { optionId: UnitId }).optionId]
    }
    // round 2: 3 points -> the Despot (it covers the Dominator and the Cohort), then the Dominator twice
    expect(ai).toEqual([GEN, DOM, DOM])
    expect(dppOf(s, GEN)).toBe(1)
    expect(dppOf(s, DOM)).toBe(2)

    // Scroll: never in our own turn, in the enemy hero phase only when the hurt general has an enemy within 12"
    const t = game({ enh: SCROLL })
    centreRow(t, GEN, 0, -6); centreRow(t, BOSS, 0, 2)
    expect(helsmithsAbilityTiming(t, 'A', 'helsmithsScroll', null)).toBeLessThan(-2)
    t.activePlayer = 'B'
    expect(helsmithsAbilityTiming(t, 'A', 'helsmithsScroll', null)).toBeLessThan(-2) // healthy
    for (const m of modelsOf(t, GEN)) m.woundsRemaining = 3
    expect(helsmithsAbilityTiming(t, 'A', 'helsmithsScroll', null)).toBe(0)
    // Chalice: aims at the weakest unit in reach
    expect(helsmithsTargetBonus(t, 'A', 'helsmithsChalice', BOSS)).not.toBeNull()
  })
})

// a fixture state whose terrain has the ruin at (-6, 2): the layout the visibility check uses
function aosStateWithRuin(): GameState {
  const s = aosState({
    terrainLayoutId: 'fx.terrain.standard',
    players: { A: makeAosPlayer('A', { faction: 'helsmiths', patrolId: ARMY, enhancementId: TALISMAN, regimentAbilityId: SUPPRESSIVE }), B: makeAosPlayer('B') },
  }, bundle())
  for (const p of ['A', 'B'] as const) {
    const sign = p === 'A' ? -1 : 1
    let x = -14.5
    for (const u of Object.values(s.units).filter((u) => u.player === p)) {
      place(s, u.id, x, sign * 12.8, 0.3)
      x = -14.5 + (x > 10 ? 0 : 6)
    }
  }
  s.round = 1; s.phase = 'command'; s.activePlayer = 'A'
  return s
}
