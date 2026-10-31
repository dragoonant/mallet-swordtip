// F17 balance: DOK-AI-1 Heartseekers (daughters.ts daughtersStayBonus, read by src/ai/utility.ts scoreDeclareMove): the Blood Stalkers'
// bows crit on 5+ only while the unit uses no Move ability, so the bot keeps them still when an enemy is already in bow range; the bonus
// is the extra expected bow damage, nothing for a unit without Heartseekers or with nothing in range.
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, unitModels, view, type GameState, type PlayerId } from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { daughtersStayBonus } from '../../src/engine/factions/daughters'
import { makeSimSetup } from '../../tools/sim-core'

async function boardState(): Promise<{ s: GameState; dp: PlayerId }> {
  const bundle = await loadBundle()
  const seed = 'sim-7-0'
  const setup = makeSimSetup(bundle, 0, DATA_VERSION, ['daughters', 'cities'])
  const dp: PlayerId = setup.players.A.faction === 'daughters' ? 'A' : 'B'
  const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
  let r = createGame(setup, seed, bundle)
  for (let n = 0; r.pending && n < 3000; n++) {
    if (r.state.phase === 'movement' && Object.values(r.state.units).every((u) => u.location === 'board' || u.location === 'destroyed')) break
    const a = await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legalActions(r.state, r.pending))
    r = step(r.state, a) as typeof r
  }
  return { s: r.state, dp }
}

// every enemy model moved `dx` inches along x from the first Blood Stalker (positions only: enough for the range check)
function enemiesAt(s: GameState, dp: PlayerId, from: { x: number; z: number }, dx: number): GameState {
  const models = { ...s.models }
  Object.values(s.units).filter((u) => u.player !== dp && u.location === 'board').forEach((u, i) => {
    unitModels(s, u.id).forEach((m, j) => { models[m.id] = { ...m, pos: { ...m.pos, x: from.x + dx + j * 1.5, z: from.z + i * 3 } } })
  })
  return { ...s, models }
}

describe('Daughters AI hints, F17', () => {
  it('DOK-AI-1 Heartseekers: Blood Stalkers with an enemy in bow range are worth keeping still; out of range, or another unit, no opinion', async () => {
    const { s, dp } = await boardState()
    const stalkers = Object.values(s.units).find((u) => u.player === dp && u.datasheetId.endsWith('blood-stalkers') && u.location === 'board')!.id
    const aelves = Object.values(s.units).find((u) => u.player === dp && u.datasheetId.endsWith('witch-aelves') && u.location === 'board')!.id
    const at = unitModels(s, stalkers)[0].pos
    // 10" off along the board: in range of the 18" bows
    const near = enemiesAt(s, dp, at, at.x > 0 ? -10 : 10)
    const bonus = daughtersStayBonus(near, dp, stalkers)
    expect(bonus).not.toBeNull()
    expect(bonus as number).toBeGreaterThan(0)
    // the Witch Aelves have no Heartseekers
    expect(daughtersStayBonus(near, dp, aelves)).toBeNull()
    // every enemy beyond 18": nothing to shoot, no reason to stand still
    const far = enemiesAt(s, dp, at, at.x > 0 ? -30 : 30)
    expect(daughtersStayBonus(far, dp, stalkers)).toBeNull()
  }, 120000)
})
