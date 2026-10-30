// WP5 (13-engine-port-plan §5): combat phase — pick order (active player first, alternation, Strike-first / Strike-last),
// eligibility, pile-in (CORE-6.11/6.12), model targets, and one full activation. Drives fightModule directly.
import { describe, expect, it } from 'vitest'
import {
  createContext, DEFAULT_MODULES, SeededRng,
  type Action, type GameEvent, type GameState, type PendingDecision, type PlayerId,
} from '../../src/engine'
import { attackService } from '../../src/engine/attack'
import { fightModule, legalTargetsFor, pileInRejection } from '../../src/engine/phases/fight'
import { fightingModelIds } from '../../src/engine/phases/fightEligibility'
import { aosState } from '../fixtures'
import { placeUnit } from '../fixtures/state'

const world = (): GameState => { const s = aosState(); s.phase = 'fight'; s.activePlayer = 'A'; return s }
const put = (s: GameState, unitId: string, x: number, z: number, gap = 0.3): void => placeUnit(s, unitId, { x, z, gap })

interface Pick { player: PlayerId; kind: string; eligible?: string[]; chosen?: string }
interface Harness { s: GameState; ctx: ReturnType<typeof createContext>['ctx']; events: GameEvent[] }
function harness(s: GameState, seed = 'fight'): Harness {
  const { ctx, events } = createContext(s, new SeededRng(seed), DEFAULT_MODULES)
  fightModule.enter(ctx)
  return { s, ctx, events }
}

// answers every decision with `choose` (default: first legal action) until the phase is done; returns the picks in order
function drive(h: Harness, choose?: (p: PendingDecision) => Action | undefined, stop?: (picks: Pick[]) => boolean): Pick[] {
  const picks: Pick[] = []
  for (let i = 0; i < 400; i++) {
    if (fightModule.advance(h.ctx) === 'done') return picks
    const pending = h.s.pending as PendingDecision
    if (pending.kind === 'chooseFightUnit') picks.push({ player: pending.player, kind: pending.kind, eligible: pending.context.eligible })
    else picks.push({ player: pending.player, kind: pending.kind })
    if (stop?.(picks)) return picks
    const action = choose?.(pending) ?? (fightModule.legalActions?.(h.s, pending) ?? [])[0]
    if (!action) throw new Error(`no legal action for ${pending.kind}`)
    if (action.type === 'chooseFightUnit') picks[picks.length - 1].chosen = action.unitId
    h.s.pending = null
    expect(fightModule.validate?.(h.s, action, pending) ?? null).toBeNull()
    const rej = fightModule.handle(h.ctx, action, pending)
    if (rej) throw new Error(`rejected ${rej.code}: ${rej.reason}`)
  }
  throw new Error('fight phase did not finish')
}
const pickUnit = (unitId: string) => (p: PendingDecision): Action | undefined =>
  p.kind === 'chooseFightUnit' ? p.options.find((o) => o.id === unitId)?.action : undefined
const unitPicks = (picks: Pick[]) => picks.filter((p) => p.kind === 'chooseFightUnit')

describe('aos combat: pick order', () => {
  it('FIGHT-002 the first pick belongs to the active player, then picks alternate', () => {
    const s = world()
    put(s, 'A:guard', -4, 0); put(s, 'B:guard', -4, 2.5)
    put(s, 'A:boss', 6, 0); put(s, 'B:brute', 6, 2.5)
    const h = harness(s)
    const picks = unitPicks(drive(h))
    expect(picks.map((p) => p.player)).toEqual(['A', 'B', 'A', 'B'])
  })

  it('FIGHT-003 when one side has no eligible unit left, the other picks its remaining units one after another', () => {
    const s = world()
    put(s, 'A:boss', 0, 0)
    put(s, 'B:brute', -3, 2.5, 0.2); put(s, 'B:hawk', 3, 2.5); put(s, 'B:guard', 0, 3.2, 0.1)
    const h = harness(s)
    const picks = unitPicks(drive(h))
    expect(picks.map((p) => p.player)).toEqual(['A', 'B', 'B', 'B'])
  })

  it('FIGHT-006 a unit that has fought is not offered again', () => {
    const s = world()
    put(s, 'A:guard', -6, 0); put(s, 'B:brute', -6, 2.5); put(s, 'A:boss', 6, 0); put(s, 'B:boss', 6, 2.5)
    const h = harness(s)
    const picks = unitPicks(drive(h))
    picks.forEach((p, i) => {
      expect(p.chosen).toBeDefined()
      for (const later of picks.slice(i + 1)) expect(later.eligible).not.toContain(p.chosen)
    })
    expect(s.units['A:boss'].turn.foughtThisPhase).toBe(true)
  })

  it('FIGHT-018 a combat phase with no unit in combat and no charger ends with no decision', () => {
    const s = world()
    put(s, 'A:boss', -10, -8); put(s, 'B:hawk', 10, 8)
    const h = harness(s)
    expect(fightModule.advance(h.ctx)).toBe('done')
    expect(s.pending).toBeNull()
  })

  it('FIGHT-005 a unit that charged but is not in combat may fight', () => {
    const s = world()
    put(s, 'A:boss', -10, -8); put(s, 'B:hawk', 10, 8)
    s.units['A:boss'].turn.chargedThisTurn = true
    const h = harness(s)
    expect(fightModule.advance(h.ctx)).toBe('pending')
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseFightUnit' }>
    expect(p.context.eligible).toEqual(['A:boss'])
  })

  it('FIGHT-017 a unit whose enemies were all destroyed before its pick is no longer eligible', () => {
    const s = world()
    put(s, 'A:boss', 0, 0); put(s, 'B:hawk', 0, 2.5)
    const h = harness(s)
    attackService.queueMortalWounds(h.ctx, 'B:hawk', 50, 'test', false)
    expect(fightModule.advance(h.ctx)).toBe('done')
  })

  it('FIGHT-008 Strike-first: the active player\'s pick is skipped when only the opponent has a Strike-first unit, then the active player picks', () => {
    const s = world()
    put(s, 'A:boss', 0, 0); put(s, 'B:hawk', 0, 2.5); put(s, 'A:guard', 8, 0); put(s, 'B:brute', 8, 2.5)
    s.units['B:brute'].turn.fightsFirst = true
    const h = harness(s)
    const picks = unitPicks(drive(h))
    expect(picks[0]).toMatchObject({ player: 'B', eligible: ['B:brute'] })
    expect(picks[1].player).toBe('A')
  })

  it('FIGHT-009 both players hold Strike-first units: they alternate from the active player, then the active player picks next', () => {
    const s = world()
    put(s, 'A:boss', 0, 0); put(s, 'B:hawk', 0, 2.5); put(s, 'A:guard', 8, 0); put(s, 'B:brute', 8, 2.5)
    s.units['A:guard'].turn.fightsFirst = true
    s.units['B:brute'].turn.fightsFirst = true
    const h = harness(s)
    const picks = unitPicks(drive(h))
    expect(picks.slice(0, 2)).toMatchObject([{ player: 'A', eligible: ['A:guard'] }, { player: 'B', eligible: ['B:brute'] }])
    expect(picks[2].player).toBe('A')
  })

  it('FIGHT-011 a Strike-last unit waits until every other unit in combat has fought', () => {
    const s = world()
    put(s, 'A:boss', 0, 0); put(s, 'B:hawk', 0, 2.5)
    s.units['A:boss'].turn.fightsLast = true
    const h = harness(s)
    const picks = unitPicks(drive(h))
    expect(picks[0]).toMatchObject({ player: 'B', eligible: ['B:hawk'] })
    expect(picks[1]).toMatchObject({ player: 'A', eligible: ['A:boss'] })
  })

  it('FIGHT-012 a unit with both Strike-first and Strike-last is an ordinary unit', () => {
    const s = world()
    put(s, 'A:boss', 0, 0); put(s, 'B:hawk', 0, 2.5)
    s.units['A:boss'].turn.fightsFirst = true
    s.units['A:boss'].turn.fightsLast = true
    const h = harness(s)
    const picks = unitPicks(drive(h))
    expect(picks[0]).toMatchObject({ player: 'A', eligible: ['A:boss'] })
  })
})

describe('aos combat: attacks', () => {
  it('FIGHT-016 combat attacks reach only models in combat range: a unit 4" away is not a legal target', () => {
    const s = world()
    put(s, 'A:boss', 0, 0); put(s, 'B:hawk', 0, 2.5); put(s, 'B:guard', 6, 0)
    const boss = s.models['A:boss#0']
    expect(legalTargetsFor(s, 'A:boss', boss, ['B:hawk', 'B:guard'])).toEqual(['B:hawk'])
  })

  it('a full activation: pile in, attack the only enemy in range, damage is dealt', () => {
    const s = world()
    put(s, 'A:boss', 0, 0); put(s, 'B:brute', -1, 2.7, 0.3)
    const h = harness(s, 'activation')
    drive(h)
    const hits = h.events.filter((e) => e.type === 'HitRolled')
    expect(hits.length).toBeGreaterThanOrEqual(8) // the Boss alone makes 8 attacks (+ the Brutes' answer)
    expect(h.events.some((e) => e.type === 'DamagePoolResolved')).toBe(true)
    expect(s.units['A:boss'].turn.foughtThisPhase).toBe(true)
  })
})

describe('aos combat: pile in', () => {
  const place = () => {
    const s = world()
    put(s, 'A:boss', 0, 0); put(s, 'B:hawk', 0, 3.6)
    return s
  }
  const move = (s: GameState, dx: number, dz: number) => {
    const m = s.models['A:boss#0']
    return [{ modelId: m.id, pos: { x: m.pos.x + dx, y: 0, z: m.pos.z + dz }, facing: m.facing, path: [m.pos, { x: m.pos.x + dx, y: 0, z: m.pos.z + dz }] }]
  }

  it('MOVE-018 a pile-in is rejected when a model ends farther from the target than it started', () => {
    const s = place()
    expect(pileInRejection(s, 'A:boss', 3, move(s, 0, -1))?.code).toBe('E_OUT_OF_RANGE')
    expect(pileInRejection(s, 'A:boss', 3, move(s, 2.5, 0))?.code).toBe('E_OUT_OF_RANGE') // sideways ends farther
  })

  it('MOVE-018 up to 3" and not farther from the target is accepted; more than 3" is not', () => {
    const s = place()
    expect(pileInRejection(s, 'A:boss', 3, move(s, 0, 0.8))).toBeNull()
    expect(pileInRejection(s, 'A:boss', 3, [])).toBeNull()
    expect(pileInRejection(s, 'A:boss', 3, move(s, 0, 3.5))?.code).toBe('E_OUT_OF_RANGE')
  })

  it('CORE-6.12 a unit that is not in combat may pile in in any direction', () => {
    const s = world()
    put(s, 'A:boss', 0, 0); put(s, 'B:hawk', 10, 10)
    const m = s.models['A:boss#0']
    const away = [{ modelId: m.id, pos: { x: 0, y: 0, z: -2 }, facing: m.facing, path: [m.pos, { x: 0, y: 0, z: -2 }] }]
    expect(pileInRejection(s, 'A:boss', 3, away)).toBeNull()
  })

  it('a combat model needs an enemy within 3" to attack (no base-contact chain)', () => {
    const s = world()
    put(s, 'A:guard', 0, 0, 0.3); put(s, 'B:brute', -1, 2.4, 0.3)
    const ids = fightingModelIds(s, 'A:guard')
    expect(ids.size).toBeGreaterThan(0)
    expect(ids.size).toBeLessThanOrEqual(10)
  })
})
