// WP6 smoke: the client store builds a real Spearhead game from the data bundle (Castelite Company vs Bigmob, Fire and
// Jade; the twelve armies are Cities of Sigmar, Ironjawz, Slaves to Darkness, Fyreslayers, Kruleboyz, Gloomspite Gitz, Lumineth Realm-lords, Kharadron Overlords, Stormcast Eternals, Skaven, Seraphon and Soulblight Gravelords) and the bot can drive both seats for a while through the real engine.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { buildPlayerSetup, regimentChoices, spearheadArmies, useGameStore, DEFAULT_SPEARHEAD_FACTIONS } from '../../src/client/store/game'
import { UtilityDecider } from '../../src/ai/utility'

describe('spearhead client setup', () => {
  it('offers exactly the twelve Spearhead armies with two regiment abilities and four enhancements each', async () => {
    const bundle = await loadBundle()
    const armies = spearheadArmies(bundle)
    expect(armies.map((a) => a.faction).sort()).toEqual(['cities', 'fyreslayers', 'gloomspite', 'ironjawz', 'kharadron', 'kruleboyz', 'lumineth', 'seraphon', 'skaven', 'slaves', 'soulblight', 'stormcast'])
    for (const a of armies) {
      expect(regimentChoices(bundle, a)).toHaveLength(2)
      expect(a.enhancements).toHaveLength(4)
    }
    expect(DEFAULT_SPEARHEAD_FACTIONS).toEqual({ player: 'cities', opponent: 'ironjawz' })
  })

  it('a chosen regiment ability and enhancement reach PlayerSetup; omitted ones fall back to the army defaults', async () => {
    const bundle = await loadBundle()
    const army = spearheadArmies(bundle).find((a) => a.faction === 'cities')!
    const second = army.regimentAbilities!.find((r) => !r.default)!.id
    const enh = army.enhancements.find((e) => !e.default)!.id
    expect(buildPlayerSetup(bundle, 'cities', army.id, second, enh)).toMatchObject({ regimentAbilityId: second, enhancementId: enh })
    const dflt = buildPlayerSetup(bundle, 'cities')
    expect(dflt.regimentAbilityId).toBe(army.regimentAbilities!.find((r) => r.default)!.id)
    expect(dflt.enhancementId).toBe(army.enhancements.find((e) => e.default)!.id)
  })

  it('newGame starts the fixed battleplan on a 30x22 board and the bot plays the first decisions', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'cities', opponentFaction: 'ironjawz', opponent: 'hotseat', seed: 'wp6-smoke' })
    const first = useGameStore.getState()
    expect(first.state).not.toBeNull()
    expect(first.state!.board).toMatchObject({ w: 30, h: 22 })
    expect(first.state!.mission.data.format).toBe('spearhead')
    expect(first.state!.players.A.faction).toBe('cities')
    expect(first.state!.players.B.faction).toBe('ironjawz')
    expect(first.pending).not.toBeNull()

    let steps = 0
    const bot = { A: new UtilityDecider('normal', 'wp6:A'), B: new UtilityDecider('normal', 'wp6:B') }
    for (let i = 0; i < 1500; i++) {
      const { state, pending, legal } = useGameStore.getState()
      if (!state || !pending) break
      const view = { player: pending.player, state, hidden: { opponentReserveCount: 0 }, lastRejection: null }
      const action = await bot[pending.player].decide(view, pending, legal)
      const toastBefore = useGameStore.getState().toast
      useGameStore.getState().dispatch(action)
      const toast = useGameStore.getState().toast
      expect(toast === toastBefore ? null : toast, `${action.type} rejected`).toBeNull()
      steps++
    }
    expect(useGameStore.getState().events.length).toBeGreaterThan(0)
    // the bot got past deployment and the first turns (round 2 or later, or the battle already ended)
    const end = useGameStore.getState().state!
    expect(steps).toBeGreaterThan(100)
    expect(end.round >= 2 || end.phase === 'ended').toBe(true)
  }, 120000)
})
