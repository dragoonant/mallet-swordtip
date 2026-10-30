// Full seeded Spearhead games through the public engine API with the real data (Cities of Sigmar vs Ironjawz, Fire and
// Jade, Aqshy side), driven by the headless simulator's random-legal-move bots (tools/sim-core.ts).
// SIM-001 games reach GameEnded after 4 rounds; SIM-002 wounds within [0, W]; SIM-003 no NaN; SIM-009 replay of the
// action log reproduces the final hash; SIM-015 every pending decision has at least one legal action.
// (LEAN: a handful of games here; `npm run sim -- --games 100 --seed 1` covers the rest.)
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { replay } from '../../src/engine'
import { runGame } from '../../tools/sim-core'

describe('full seeded games (SIM-001/002/003/009/015)', () => {
  for (const game of [0, 1, 2, 3, 4, 5]) {
    it(`SIM-001 game ${game}: finishes with a GameResult after 4 rounds, no invariant violations, replay reproduces the hash`, async () => {
      const bundle = await loadBundle()
      const run = await runGame(bundle, 'fullgame', game, DATA_VERSION)
      expect(run.violations).toEqual([])
      expect(run.final.phase).toBe('ended')
      expect(run.final.result).not.toBeNull()
      expect(run.rounds).toBe(4)
      expect(new Set(Object.values(run.factions)).size).toBe(2)
      for (const f of Object.values(run.factions)) expect(['cities', 'ironjawz', 'slaves', 'fyreslayers', 'gloomspite', 'kharadron']).toContain(f)
      const replayed = replay(run.setup, run.seed, run.actions, bundle)
      expect(replayed.state.hash).toBe(run.finalHash)
    }, 180_000)
  }

  it('SIM-011 the utility AI plays both seats to a GameResult without breaking an invariant', async () => {
    const bundle = await loadBundle()
    for (const g of [0, 1]) {
      const run = await runGame(bundle, 'ai', g, DATA_VERSION, true)
      expect(run.violations).toEqual([])
      expect(run.final.phase).toBe('ended')
      expect(run.rounds).toBe(4)
    }
  }, 180_000)

  it('SIM-010 the bots actually fight: models die and VP is scored across a few games', async () => {
    const bundle = await loadBundle()
    let dead = 0, vp = 0
    for (const g of [0, 1, 2, 3]) {
      const run = await runGame(bundle, 'fight', g, DATA_VERSION)
      dead += Object.values(run.final.units).filter((u) => u.location === 'destroyed').length
      vp += run.vp.A + run.vp.B
    }
    expect(vp).toBeGreaterThan(0)
    expect(dead).toBeGreaterThan(0)
  }, 180_000)
})
