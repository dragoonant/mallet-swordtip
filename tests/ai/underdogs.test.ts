// F11 ai-underdogs: the Slaves to Darkness position hints (src/ai/underdogs.ts), on a real sim game (Fire and Jade). Each is
// gated on the deciding player's faction, so other armies' play is unchanged.
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { boardUnitsOf, createGame, legalActions, step, unitModels, view, type GameState, type ModelPlacement, type PendingDecision, type PlayerId, type UnitId } from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { isUnderdog, underdogCardChase, underdogExposure, underdogObjectiveScale } from '../../src/ai/underdogs'
import { makeSimSetup } from '../../tools/sim-core'

// plays an AI-vs-AI sim game until the first Slaves Normal Move placement decision; returns that state and decision
async function firstSlavesMove(): Promise<{ s: GameState; p: Extract<PendingDecision, { kind: 'moveUnit' }>; me: PlayerId }> {
  const bundle = await loadBundle()
  const seed = 'sim-21-1'
  const setup = makeSimSetup(bundle, 1, DATA_VERSION, ['slaves', 'ironjawz'])
  const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
  let r = createGame(setup, seed, bundle)
  for (let n = 0; r.pending && n < 6000; n++) {
    const p = r.pending
    if (p.kind === 'moveUnit' && p.context.moveType === 'normal' && r.state.players[p.player].faction === 'slaves') return { s: r.state, p, me: p.player }
    const a = await bots[p.player].decide(view(r.state, p.player), p, legalActions(r.state, p))
    r = step(r.state, a)
  }
  throw new Error('no Slaves move found')
}

const slid = (s: GameState, unitId: UnitId, dx: number, dz: number): ModelPlacement[] =>
  unitModels(s, unitId).map((m) => ({ modelId: m.id, pos: { x: m.pos.x + dx, y: m.pos.y, z: m.pos.z + dz }, facing: m.facing }))

describe('F11 AI hints for Slaves to Darkness', () => {
  it('STD-AI-2 ending a move inside the enemy\'s move + charge reach costs more than staying back; other armies see 0', async () => {
    const { s, p, me } = await firstSlavesMove()
    const unitId = p.context.unitId
    const foe = boardUnitsOf(s, me === 'A' ? 'B' : 'A')
    expect(isUnderdog(s, me)).toBe(true)
    expect(isUnderdog(s, me === 'A' ? 'B' : 'A')).toBe(false)
    // slid straight at an enemy unit to 4" short of it, and 60" straight away from it (out of every reach)
    const c = unitModels(s, unitId)[0].pos
    const e = unitModels(s, foe[0].id)[0].pos
    const d = Math.hypot(e.x - c.x, e.z - c.z) || 1
    const ux = (e.x - c.x) / d, uz = (e.z - c.z) / d
    const here = underdogExposure(s, me, unitId, slid(s, unitId, 0, 0), 0)
    const close = underdogExposure(s, me, unitId, slid(s, unitId, ux * (d - 4), uz * (d - 4)), 0)
    const far = underdogExposure(s, me, unitId, slid(s, unitId, -ux * 60, -uz * 60), 0)
    expect(far).toBe(0)
    expect(close).toBeGreaterThan(far)
    expect(here).toBeGreaterThanOrEqual(0)
    // a charge landing this turn (chargeNowP = 1) leaves no exposure to an enemy charge, only to shooting
    expect(underdogExposure(s, me, unitId, slid(s, unitId, 0, 0), 1)).toBeLessThanOrEqual(here)
    // the other player's units are never priced by it
    expect(underdogExposure(s, me === 'A' ? 'B' : 'A', foe[0].id, slid(s, foe[0].id, 0, 0), 0)).toBe(0)
  }, 120_000)

  it('STD-AI-3 battle tactics in hand count only in the army\'s own movement phase, as a whole number of cards times 5', async () => {
    const { s, p, me } = await firstSlavesMove()
    const unitId = p.context.unitId
    const v = underdogCardChase(s, me, unitId, slid(s, unitId, 0, 3))
    expect(Number.isInteger(v / 5)).toBe(true)
    // standing still never completes or loses a card
    expect(underdogCardChase(s, me, unitId, slid(s, unitId, 0, 0))).toBe(0)
    const notMovement = { ...s, phase: 'shooting' as const }
    expect(underdogCardChase(notMovement, me, unitId, slid(s, unitId, 0, 3))).toBe(0)
  }, 120_000)

  it('STD-AI-4 the objective picture weighs double for Slaves and is left alone for everyone else', async () => {
    const { s, me } = await firstSlavesMove()
    expect(underdogObjectiveScale(s, me)).toBe(2)
    expect(underdogObjectiveScale(s, me === 'A' ? 'B' : 'A')).toBeNull()
  }, 120_000)
})
