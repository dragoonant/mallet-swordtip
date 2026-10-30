// F9 audit-weak: the AI fixes that matter most to Cities of Sigmar and Slaves to Darkness, on real sim games (Fire and Jade).
// AI-MOVE-001 re-formed moves (src/ai/moves.ts) are always ones the engine accepts; AI-CHARGE-001 the same for charge moves;
// CITIES-AI-1 the Castelite hold weight (cities.ts citiesHoldWeight); STD-AI-1 Fearless Invaders is only "available" for the AI
// in its own movement phase until it is used.
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, validate, view, type GameState, type PendingDecision } from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { extraMoveCandidates } from '../../src/ai/moves'
import { citiesHoldWeight } from '../../src/engine/factions/cities'
import { slavesFreeRetreatAvailable } from '../../src/engine/factions/slaves'
import { makeSimSetup } from '../../tools/sim-core'

// plays an AI-vs-AI sim game and hands every pending decision to `visit` until it returns true (or the game ends)
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

describe('F9 AI for the weaker armies', () => {
  it('AI-MOVE-001 with no usable engine candidate the unit is re-formed, and every such move passes the engine\'s validate()', async () => {
    let checked = 0
    await playUntil(['cities', 'ironjawz'], 0, (s, p) => {
      if (p.kind !== 'moveUnit' || p.context.moveType === 'stationary') return false
      const extras = extraMoveCandidates(s, p, [])
      for (const a of extras) expect(validate(s, a)).toBeNull()
      if (extras.length > 0) checked++
      return checked >= 4
    })
    expect(checked).toBeGreaterThanOrEqual(4)
  }, 120_000)

  it('AI-CHARGE-001 re-formed charge moves (offered only when the engine found none) all pass validate() and end the charge', async () => {
    let seen = 0
    await playUntil(['slaves', 'kharadron'], 1, (s, p) => {
      if (p.kind !== 'chargeMove') return false
      seen++
      const pass = { type: 'pass' as const, player: p.player, decisionId: p.id }
      for (const a of extraMoveCandidates(s, p, [pass])) {
        expect(a.type).toBe('chargeMove')
        expect(validate(s, a)).toBeNull()
      }
      return seen >= 3
    })
    expect(seen).toBeGreaterThan(0)
  }, 120_000)

  it('CITIES-AI-1 the Cavaliers and the Marshal feel 0.4 of a held marker\'s pull while a Steelhelms unit or the Cannon stands; others have no opinion', async () => {
    await playUntil(['cities', 'ironjawz'], 0, (s, p) => {
      if (p.kind !== 'moveUnit') return false
      const units = Object.values(s.units).filter((u) => u.location === 'board')
      for (const u of units) {
        const w = citiesHoldWeight(s, u.id)
        if (u.datasheetId.startsWith('cities.unit.freeguild-cavalier')) expect(w).toBe(0.4)
        else expect(w).toBeNull()
      }
      // with every line holder gone the cavalry guard markers again
      for (const u of units) if (u.datasheetId.endsWith('steelhelms') || u.datasheetId.endsWith('great-cannon')) u.location = 'destroyed'
      for (const u of units) if (u.datasheetId.startsWith('cities.unit.freeguild-cavalier')) expect(citiesHoldWeight(s, u.id)).toBeNull()
      return true
    })
  }, 120_000)

  it('STD-AI-1 a free Retreat is only expected in your own movement phase, with Fearless Invaders picked and not yet used this turn', async () => {
    const bundle = await loadBundle()
    const setup = makeSimSetup(bundle, 2, DATA_VERSION, ['slaves', 'ironjawz']) // games 2-3 of a block take the other regiment ability
    const p = setup.players.A.faction === 'slaves' ? 'A' : 'B'
    const r = createGame(setup, 'sim-7-2', bundle)
    const s = r.state
    expect(s.abilities[s.players[p].regimentAbilityId ?? '']?.code).toBe('slavesFearlessInvaders')
    s.activePlayer = p
    s.phase = 'movement'
    expect(slavesFreeRetreatAvailable(s, p)).toBe(true)
    s.phase = 'charge'
    expect(slavesFreeRetreatAvailable(s, p)).toBe(false)
    s.phase = 'movement'
    s.players[p].abilityUses.push({ abilityId: s.players[p].regimentAbilityId as string, unitId: null, round: s.round, turn: p, phase: 'movement' } as never)
    expect(slavesFreeRetreatAvailable(s, p)).toBe(false)
  })
})
