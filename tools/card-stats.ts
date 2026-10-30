// Spearhead card statistics over simulated games (both seats the utility AI unless --random):
//   npx tsx tools/card-stats.ts [--random] [--games N]
// Prints tactics scored / discarded, VP by source and how often each command and twist came up. A quick check that the
// AI plays the cards sensibly and that every card path runs without breaking the engine.
import { DATA_VERSION, loadBundle } from '../src/data/index'
import { UtilityDecider } from '../src/ai/utility'
import { createGame, legalActions, step, view, type GameEvent, type PlayerId } from '../src/engine'
import { makeSimSetup } from './sim-core'

async function main(): Promise<void> {
  const random = process.argv.includes('--random')
  const gi = process.argv.indexOf('--games')
  const games = gi >= 0 ? Number(process.argv[gi + 1]) : 10
  const bundle = await loadBundle()
  const count: Record<string, number> = {}
  const bump = (k: string, n = 1) => { count[k] = (count[k] ?? 0) + n }
  let failures = 0
  for (let g = 0; g < games; g++) {
    const seed = `cards-${g}`
    const setup = makeSimSetup(bundle, g, DATA_VERSION)
    const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
    let r = createGame(setup, seed, bundle)
    const events: GameEvent[] = [...r.events]
    let n = 0
    while (r.pending && n++ < 6000) {
      const legal = legalActions(r.state, r.pending) ?? []
      const p: PlayerId = r.pending.player
      const a = random ? legal[Math.floor(Math.random() * legal.length)] : await bots[p].decide(view(r.state, p), r.pending, legal)
      const next = step(r.state, a)
      if (next.rejection) { failures++; console.log(`game ${g}: rejected ${next.rejection.reason}`); break }
      r = next
      events.push(...r.events)
    }
    if (r.state.phase !== 'ended') { failures++; console.log(`game ${g}: did not finish`) }
    for (const e of events) {
      if (e.type === 'TacticCommandUsed') bump(`cmd ${e.cardId.replace('card.tactic.', '')}`)
      if (e.type === 'TacticScored') bump(`scored ${e.cardId.replace('card.tactic.', '')}`)
      if (e.type === 'TacticDiscarded') bump('discarded')
      if (e.type === 'TwistDrawn') bump(`twist ${e.cardId.replace('card.twist.', '')}`)
      if (e.type === 'VpScored') bump(e.source.startsWith('card.tactic') ? 'vp:tactics' : e.source.startsWith('card.twist') ? 'vp:twists' : 'vp:objectives', e.amount)
    }
  }
  console.log(`${games} games (${random ? 'random' : 'AI'}), ${failures} failure(s)`)
  for (const [k, v] of Object.entries(count).sort()) console.log(`  ${k}: ${(v / games).toFixed(2)} per game`)
}
main().catch((e) => { console.error(e); process.exit(1) })
