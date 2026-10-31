// F15 balance: the Khorne AI hint that plans Karanak's charge around Killing Pounce (khorne.ts khorneChargeFocus, read by
// src/ai/utility.ts chargeOutlook / scoreDeclareCharge). BOK-AI-1: with the enhancement unused and the quarry on the battlefield
// the general's planned charge is measured to the quarry with one more die; never for another unit, never once it is used.
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, view, type GameState, type PlayerId } from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { khorneChargeFocus, quarryOnBoard } from '../../src/engine/factions/khorne'
import { makeSimSetup } from '../../tools/sim-core'

describe('Khorne AI hints', () => {
  it('BOK-AI-1 Killing Pounce: the general plans its charge at the quarry with an extra die until the enhancement is used', async () => {
    const bundle = await loadBundle()
    const seed = 'sim-7-0'
    const setup = makeSimSetup(bundle, 0, DATA_VERSION, ['khorne', 'cities'])
    const kp: PlayerId = setup.players.A.faction === 'khorne' ? 'A' : 'B'
    setup.players[kp].enhancementId = 'khorne.enh.killing-pounce'
    const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
    let r = createGame(setup, seed, bundle)
    let seen: GameState | null = null
    for (let n = 0; r.pending && n < 3000 && !seen; n++) {
      const general = r.state.players[kp].warlordUnitId
      if (general && r.state.units[general]?.location === 'board' && quarryOnBoard(r.state, kp)) { seen = r.state; break }
      const a = await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legalActions(r.state, r.pending))
      r = step(r.state, a) as typeof r
    }
    expect(seen).not.toBeNull()
    const s = seen as GameState
    const general = s.players[kp].warlordUnitId as string
    expect(khorneChargeFocus(s, kp, general)).toEqual({ targetId: quarryOnBoard(s, kp), extraDice: 1 })
    const hounds = Object.values(s.units).find((u) => u.player === kp && u.datasheetId.endsWith('flesh-hounds'))
    expect(hounds && khorneChargeFocus(s, kp, hounds.id)).toBeNull()
    const pounce = Object.values(s.abilities).find((a) => a.code === 'khorneKillingPounce')!
    const used = { ...s, players: { ...s.players, [kp]: { ...s.players[kp], abilityUses: [...s.players[kp].abilityUses, { abilityId: pounce.id, unitId: general, round: s.round, turn: s.activePlayer, phase: 'charge' as const }] } } } as GameState
    expect(khorneChargeFocus(used, kp, general)).toBeNull()
  }, 120000)
})
