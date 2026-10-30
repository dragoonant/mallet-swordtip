// Slaves to Darkness (Darkoath Raiders) shipped data: docs/spec/factions/slaves-to-darkness.md §1, §5 (STD-ROSTER-1, STD-WS-1).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'slaves.army.darkoath-raiders'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Slaves', faction: 'slaves', patrolId: ARMY, enhancementId: 'slaves.enh.godshadow-talisman', regimentAbilityId: 'slaves.ability.fearless-invaders' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

describe('STD-ROSTER-1 Darkoath Raiders roster', () => {
  it('STD-ROSTER-1 the army builds with 4 units and 26 models; the Warqueen is the general; Reinforcements only on Fellriders and Marauders', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['warqueen', 'savagers', 'fellriders', 'marauders'])
    expect(army.warlord).toBe('warqueen')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(26)
    const reinforced = army.units.filter((u) => bundle.datasheets[u.datasheet].keywords.includes('REINFORCEMENTS')).map((u) => u.ref)
    expect(reinforced).toEqual(['fellriders', 'marauders'])
    expect(army.regimentAbilities).toHaveLength(2)
    expect(army.enhancements).toHaveLength(4)
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(26)
    const queen = mine.find((u) => u.ref === 'warqueen')!
    expect(queen.isWarlord).toBe(true)
    expect(queen.enhancementId).toBe('slaves.enh.godshadow-talisman')
    expect(s.players.A.regimentAbilityId).toBe('slaves.ability.fearless-invaders')
    expect(s.players.A.battleTraitIds).toEqual(['slaves.ability.oaths-of-darkness'])
  })

  it('STD-ROSTER-1 the Savagers include exactly 1 Godspeaker (and the other 9 are plain Savagers)', () => {
    const s = realState()
    const savagers = Object.values(s.units).find((u) => u.player === 'A' && u.ref === 'savagers')!
    const kinds = savagers.models.map((id) => s.models[id].datasheetModelId)
    expect(kinds.filter((k) => k === 'godspeaker')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'savager')).toHaveLength(9)
    // the Godspeaker is listed last, so melee damage allocation reaches it last
    expect(kinds[kinds.length - 1]).toBe('godspeaker')
  })
})

describe('STD-WS-1 warscrolls and weapons', () => {
  const ds = (id: string) => bundle.datasheets[`slaves.unit.${id}`]
  const wp = (id: string): WeaponData => bundle.weapons[`slaves.weapon.${id}`]
  const row = (w: WeaponData) => [w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

  it('STD-WS-1 stats: Move / Health / Save / Control / Ward match the Spearhead warscrolls', () => {
    expect(ds('darkoath-warqueen').stats).toEqual({ M: 5, W: 5, Sv: 5, OC: 2, ward: 5 })
    expect(ds('darkoath-savagers').stats).toEqual({ M: 5, W: 1, Sv: 5, OC: 1 })
    expect(ds('darkoath-fellriders').stats).toEqual({ M: 12, W: 3, Sv: 5, OC: 1 })
    expect(ds('darkoath-marauders').stats).toEqual({ M: 5, W: 1, Sv: 5, OC: 1 })
    expect(ds('darkoath-warqueen').keywords).toEqual(['HERO', 'INFANTRY'])
    expect(ds('darkoath-fellriders').keywords).toEqual(['CAVALRY', 'REINFORCEMENTS'])
  })

  it('STD-WS-1 weapon profiles: Attacks / Hit / Wound / Rend / Damage / abilities, and no unit has a ranged weapon', () => {
    expect(row(wp('rune-etched-axe'))).toEqual([5, 4, 3, 1, 2, ['CRIT_MORTAL']])
    expect(row(wp('darkoath-weapons'))).toEqual([2, 4, 3, 0, 1, ['CRIT_MORTAL']])
    expect(row(wp('fellrider-blades'))).toEqual([2, 4, 3, 0, 1, ['CHARGE_DAMAGE']])
    expect(row(wp('warsteeds-hooves'))).toEqual([2, 5, 3, 0, 1, ['COMPANION']])
    expect(row(wp('raider-weapons'))).toEqual([2, 4, 3, 0, 1, []])
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'slaves')) {
      for (const c of d.composition) for (const w of c.weapons.default) expect(bundle.weapons[w].type, w).toBe('melee')
    }
  })

  it('STD-WS-1 every shipped data file still validates against the schemas', () => {
    expect(validateAllData().filter((r) => !r.ok)).toEqual([])
  })
})
