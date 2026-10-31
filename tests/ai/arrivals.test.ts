// F13 balance: a unit arriving from reserve (Seraphon Chameleon Ambush, Soulblight Swoop Down) is set up where it can hit
// something this turn (src/ai/utility.ts arrivalStrike): a shooter within its range of an enemy unit, a melee unit within charge
// reach, and never inside the 6" set-up exclusion the engine checks.
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, unitModels, validate, view, type Action, type GameState, type PendingDecision } from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { bestRangedRangeOfUnit, hasAnyRangedWeapon } from '../../src/ai/expected'
import { makeSimSetup } from '../../tools/sim-core'

type Seen = { s: GameState; pending: Extract<PendingDecision, { kind: 'deployUnit' }>; action: Action }

// plays AI-vs-AI games until the first reserve arrival of `datasheet` and returns the state, the decision and the bot's answer
async function firstArrival(armies: string[], datasheet: string): Promise<Seen | null> {
  const bundle = await loadBundle()
  for (let game = 0; game < 4; game++) {
    const seed = `sim-21-${game}`
    const setup = makeSimSetup(bundle, game, DATA_VERSION, armies)
    const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
    let r = createGame(setup, seed, bundle)
    for (let n = 0; r.pending && n < 6000; n++) {
      const p = r.pending
      const a = await bots[p.player].decide(view(r.state, p.player), p, legalActions(r.state, p))
      if (p.kind === 'deployUnit' && r.state.phase !== 'setup' && r.state.phase !== 'deployment') {
        const u = r.state.units[p.context.unitIds[0]]
        if (u?.location === 'reserves' && u.datasheetId.endsWith(datasheet)) return { s: r.state, pending: p, action: a }
      }
      r = step(r.state, a)
    }
  }
  return null
}

// the smallest edge-to-edge gap from the placed models to any enemy model
function gapToEnemy(s: GameState, seen: Seen): number {
  const placements = (seen.action as { placements: { modelId: string; pos: { x: number; z: number } }[] }).placements
  const me = seen.pending.player
  let best = Infinity
  for (const p of placements) {
    const r = s.models[p.modelId].base.radius
    for (const m of Object.values(s.models)) {
      const u = s.units[m.unitId]
      if (!u || u.player === me || u.location !== 'board' || m.woundsRemaining <= 0) continue
      best = Math.min(best, Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) - r - m.base.radius)
    }
  }
  return best
}

describe('reserve arrivals (F13)', () => {
  it('AI-ARRIVE-001 Hunters of Huanchi arrive within their dartpipe range of an enemy unit, outside the 6" exclusion', async () => {
    const seen = await firstArrival(['seraphon', 'cities'], 'hunters-of-huanchi')
    expect(seen).not.toBeNull()
    expect(validate(seen!.s, seen!.action)).toBeNull()
    const unitId = seen!.pending.context.unitIds[0]
    expect(hasAnyRangedWeapon(seen!.s, unitId)).toBe(true)
    const range = bestRangedRangeOfUnit(seen!.s, unitId) ?? 0
    const gap = gapToEnemy(seen!.s, seen!)
    expect(gap).toBeGreaterThan(6)
    expect(gap).toBeLessThanOrEqual(range + 0.5)
  }, 180_000)

  it('AI-ARRIVE-002 the Vargheists swoop down within charge reach (12") of an enemy unit', async () => {
    const seen = await firstArrival(['soulblight', 'cities'], 'vargheists')
    expect(seen).not.toBeNull()
    expect(validate(seen!.s, seen!.action)).toBeNull()
    expect(unitModels(seen!.s, seen!.pending.context.unitIds[0]).length).toBeGreaterThan(0)
    const gap = gapToEnemy(seen!.s, seen!)
    expect(gap).toBeGreaterThan(6)
    expect(gap).toBeLessThanOrEqual(12)
  }, 180_000)
})
