// F15 balance: the Khorne AI hint that plans Karanak's charge around Killing Pounce (khorne.ts khorneChargeFocus, read by
// src/ai/utility.ts chargeOutlook / scoreDeclareCharge). BOK-AI-1: with the enhancement unused and the quarry on the battlefield
// the general's planned charge is measured to the quarry with one more die; never for another unit, never once it is used.
// F17 balance: BOK-AI-2 The Scent of Blood edge the bot counts on (khorne.ts khorneMeleeEdge); BOK-AI-3 the charge lane check
// (src/ai/underdogs.ts chargeLaneClear) that keeps Karanak from parking behind its own pack.
import { describe, expect, it } from 'vitest'
import { DATA_VERSION, loadBundle } from '../../src/data/index'
import { createGame, legalActions, step, unitModels, view, type GameState, type ModelPlacement, type PlayerId } from '../../src/engine'
import { UtilityDecider } from '../../src/ai/utility'
import { khorneChargeFocus, khorneMeleeEdge, quarryOnBoard } from '../../src/engine/factions/khorne'
import { chargeLaneClear } from '../../src/ai/underdogs'
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


// a Khorne vs Cities sim game played by the bots up to the first battle round with every unit on the battlefield
async function boardState(regiment: string): Promise<{ s: GameState; kp: PlayerId }> {
  const bundle = await loadBundle()
  const seed = 'sim-7-0'
  const setup = makeSimSetup(bundle, 0, DATA_VERSION, ['khorne', 'cities'])
  const kp: PlayerId = setup.players.A.faction === 'khorne' ? 'A' : 'B'
  setup.players[kp].regimentAbilityId = regiment
  const bots = { A: new UtilityDecider('normal', `${seed}:A`), B: new UtilityDecider('normal', `${seed}:B`) }
  let r = createGame(setup, seed, bundle)
  for (let n = 0; r.pending && n < 3000; n++) {
    if (r.state.phase === 'movement' && Object.values(r.state.units).every((u) => u.player !== kp || u.location === 'board')) break
    const a = await bots[r.pending.player].decide(view(r.state, r.pending.player), r.pending, legalActions(r.state, r.pending))
    r = step(r.state, a) as typeof r
  }
  return { s: r.state, kp }
}

// `unitId`'s models moved to stand in a row 1" from `at` (positions only: enough for the range checks under test)
function moveNextTo(s: GameState, unitId: string, at: { x: number; z: number }, dz: number): GameState {
  const models = { ...s.models }
  unitModels(s, unitId).forEach((m, i) => { models[m.id] = { ...m, pos: { ...m.pos, x: at.x + i * 1.6, z: at.z + dz } } })
  return { ...s, models }
}

describe('Khorne AI hints, F17', () => {
  it('BOK-AI-2 The Scent of Blood: +1 hit / +1 wound for a unit ganging up on a target a friend is fighting, only with that regiment', async () => {
    const { s: s0, kp } = await boardState('khorne.ability.the-scent-of-blood')
    const mine = Object.values(s0.units).filter((u) => u.player === kp && u.location === 'board')
    const hounds = mine.find((u) => u.datasheetId.endsWith('flesh-hounds'))!.id
    const claws = mine.find((u) => u.datasheetId.endsWith('claws-of-karanak'))!.id
    const enemy = Object.values(s0.units).find((u) => u.player !== kp && u.location === 'board')!.id
    const e = unitModels(s0, enemy)[0].pos
    const r = (unitModels(s0, enemy)[0].base.radius ?? 0.5) + 1.5
    const nearHounds = moveNextTo(s0, hounds, e, r)
    // the Flesh Hounds are in combat with the target and have not fought: the Claws charging in strike a damaged target
    expect(khorneMeleeEdge(nearHounds, kp, claws, enemy)).toEqual({ hitMod: 1, woundMod: 1 })
    // the fight-order view only counts damage already allocated this turn
    expect(khorneMeleeEdge(nearHounds, kp, claws, enemy, false)).toBeNull()
    // nobody fighting it yet: no edge
    expect(khorneMeleeEdge(s0, kp, claws, enemy)).toBeNull()
    // the other regiment ability gives nothing
    const { s: sav, kp: kp2 } = await boardState('khorne.ability.savagery-upon-savagery')
    const h2 = Object.values(sav.units).find((u) => u.player === kp2 && u.datasheetId.endsWith('flesh-hounds') && u.location === 'board')!.id
    const c2 = Object.values(sav.units).find((u) => u.player === kp2 && u.datasheetId.endsWith('claws-of-karanak'))!.id
    const e2 = Object.values(sav.units).find((u) => u.player !== kp2 && u.location === 'board')!.id
    expect(khorneMeleeEdge(moveNextTo(sav, h2, unitModels(sav, e2)[0].pos, r), kp2, c2, e2)).toBeNull()
  }, 120000)

  it('BOK-AI-3 charge lane: Karanak standing behind a friendly unit has no lane to the enemy, one step aside it does', async () => {
    const { s: s0, kp } = await boardState('khorne.ability.the-scent-of-blood')
    const karanak = s0.players[kp].warlordUnitId as string
    const hounds = Object.values(s0.units).find((u) => u.player === kp && u.datasheetId.endsWith('flesh-hounds') && u.location === 'board')!.id
    const enemy = Object.values(s0.units).find((u) => u.player !== kp && u.location === 'board')!.id
    const e = unitModels(s0, enemy)[0].pos
    const k = unitModels(s0, karanak)[0]
    const from = { x: e.x - 10, z: e.z }
    const at: ModelPlacement[] = [{ modelId: k.id, pos: { ...k.pos, x: from.x, z: from.z }, facing: k.facing }]
    // move the enemy's other models out of the way so its nearest model is the one at `e`
    const clear = { ...s0, models: { ...s0.models } }
    unitModels(s0, enemy).slice(1).forEach((m, i) => { clear.models[m.id] = { ...m, pos: { ...m.pos, x: e.x + 3 + i * 1.5, z: e.z } } })
    // a hound on the straight line between Karanak and the target blocks it
    const blocked = moveNextTo(clear, hounds, { x: e.x - 5, z: e.z }, 0)
    expect(chargeLaneClear(blocked, kp, karanak, at, enemy)).toBe(false)
    // the same hounds 6" to the side leave the lane open
    const open = moveNextTo(clear, hounds, { x: e.x - 5, z: e.z }, 6)
    expect(chargeLaneClear(open, kp, karanak, at, enemy)).toBe(true)
  }, 120000)
})
