// F10 ai-balance: objective play for every army. AI-OBJ-001 the end-of-turn control model (src/ai/objectives.ts) pays for
// stepping onto a circle only when the unit's Control takes it; AI-OBJ-002 the last turn of the battle is known; AI-REDEPLOY-001 an ability set-up (Call for
// Reinforcements, Ply the Skies, Magmic Tunnels) is placed by where the unit would end, not on the first option offered.
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, unitModels, view, type Action, type GameState, type ModelPlacement, type PendingDecision, type PlayerId } from '../../src/engine'
import { finalTurnOf, UtilityDecider } from '../../src/ai/utility'
import { currentContribution, objectiveVp } from '../../src/ai/objectives'
import { makeSimSetup } from '../../tools/sim-core'

async function playUntil(armies: string[], game: number, visit: (s: GameState, p: PendingDecision) => boolean): Promise<void> {
  const bundle = await loadBundle()
  const seed = `sim-7-${game}`
  const setup = makeSimSetup(bundle, game, DATA_VERSION, armies)
  const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
  let r = createGame(setup, seed, bundle)
  for (let n = 0; r.pending && n < 6000; n++) {
    if (visit(r.state, r.pending)) return
    const a = await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legalActions(r.state, r.pending))
    r = step(r.state, a)
  }
}

const centred = (s: GameState, unitId: string, at: { x: number; z: number }): ModelPlacement[] => {
  const ms = unitModels(s, unitId)
  const cx = ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, cz = ms.reduce((a, m) => a + m.pos.z, 0) / ms.length
  return ms.map((m) => ({ modelId: m.id, pos: { x: m.pos.x - cx + at.x, y: m.pos.y, z: m.pos.z - cz + at.z }, facing: m.facing }))
}
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

describe('F10 objective play', () => {
  it('AI-OBJ-001 a unit stepping onto an empty enemy-held circle flips it and is worth more VP than staying off it; a contested circle it cannot out-number is worth nothing', async () => {
    let checked = 0
    await playUntil(['slaves', 'kruleboyz'], 0, (s, p) => {
      if (p.kind !== 'moveUnit' || s.round !== 1) return false
      const me = p.player
      const unitId = p.context.unitId
      if (currentContribution(s, unitId) !== null) return false
      // an empty circle: hand it to the enemy (control is sticky with nobody on it)
      for (const o of Object.values(s.objectives)) {
        if (o.removed || Object.values(s.models).some((m) => s.units[m.unitId]?.location === 'board' && Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z) < 6)) continue
        o.controller = other(me)
        const stay = objectiveVp(s, me)
        const onIt = objectiveVp(s, me, { unitId, placements: centred(s, unitId, o.pos) })
        expect(onIt).toBeGreaterThan(stay)
        checked++
        break
      }
      return checked > 0
    })
    expect(checked).toBe(1)
  }, 120_000)

  it('AI-OBJ-002 the second turn of the last round is the final turn, for the player taking it only', async () => {
    const bundle = await loadBundle()
    const s = createGame(makeSimSetup(bundle, 0, DATA_VERSION, ['cities', 'ironjawz']), 'sim-7-0', bundle).state
    s.round = 4; s.firstPlayer = 'B'; s.activePlayer = 'A'
    expect(finalTurnOf(s, 'A')).toBe(true)
    expect(finalTurnOf(s, 'B')).toBe(false)
    s.activePlayer = 'B'
    expect(finalTurnOf(s, 'B')).toBe(false) // the first turn of the round: the enemy still has one
    s.round = 3; s.firstPlayer = 'A'; s.activePlayer = 'B'
    expect(finalTurnOf(s, 'B')).toBe(false)
  })

  it('AI-REDEPLOY-001 a set-up offered as board positions goes to the spot that takes an empty enemy circle, not the first one listed', async () => {
    let asked: { s: GameState; me: PlayerId; pending: PendingDecision; legal: Action[]; want: string } | null = null
    await playUntil(['slaves', 'ironjawz'], 0, (s, p) => {
      if (p.kind !== 'moveUnit' || s.round !== 1) return false
      const me = p.player
      const unitId = p.context.unitId
      const target = Object.values(s.objectives).find((o) => !o.removed && !Object.values(s.models).some((m) => s.units[m.unitId]?.location === 'board' && Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z) < 6))
      if (!target) return false
      target.controller = other(me)
      const corner = { x: -s.board.w / 2 + 2, z: target.pos.z > 0 ? -s.board.h / 2 + 2 : s.board.h / 2 - 2 }
      const ids = [`at:${corner.x}:${corner.z}`, `at:${target.pos.x}:${target.pos.z}`]
      const pending = {
        id: 'test-redeploy', kind: 'chooseOption', player: me, window: 'movement', canPass: true,
        context: { topic: 'abilityMode', unitId, abilityId: 'core.ability.call-for-reinforcements', data: { redeploy: true } },
        options: ids.map((id) => ({ id, label: id, action: { type: 'chooseOption', player: me, decisionId: 'test-redeploy', optionId: id } as Action })),
      } as unknown as PendingDecision
      const legal = (pending as unknown as { options: { action: Action }[] }).options.map((o) => o.action)
      asked = { s, me, pending, legal, want: ids[1] }
      return true
    })
    expect(asked).not.toBeNull()
    const a = await new UtilityDecider('normal', 'redeploy').decide(view(asked!.s, asked!.me), asked!.pending, asked!.legal)
    expect((a as { optionId: string }).optionId).toBe(asked!.want)
  }, 120_000)
})
