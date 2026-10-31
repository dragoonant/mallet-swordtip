// Nighthaunt (Slasher Host) shipped data: docs/spec/factions/nighthaunt.md §1, §5, §9 (NH-ARMY-*, NH-WEAP-1).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'nighthaunt.army.slasher-host'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Nighthaunt', faction: 'nighthaunt', patrolId: ARMY, enhancementId: 'nighthaunt.enh.shadows-edge', regimentAbilityId: 'nighthaunt.ability.chorus-of-terror' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`nighthaunt.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`nighthaunt.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('NH-ARMY roster', () => {
  it('NH-ARMY-1 (data) the Slasher Host builds: Knight of Shrouds general, 3 Spirit Hosts, 2 x 5 Grimghast Reapers, 2 x 10 Chainrasps, 34 models, stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['knight-of-shrouds', 'spirit-hosts', 'grimghast-reapers-1', 'grimghast-reapers-2', 'chainrasps-1', 'chainrasps-2'])
    expect(army.warlord).toBe('knight-of-shrouds')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(34)
    expect(army.battleTraits).toEqual(['nighthaunt.ability.ethereal', 'nighthaunt.ability.wave-of-terror'])
    expect(army.regimentAbilities).toHaveLength(2)
    expect(army.enhancements).toHaveLength(4)
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('knight-of-shrouds').stats).toEqual({ M: 8, W: 5, Sv: 4, OC: 2, ward: 6 })
    expect(ds('spirit-hosts').stats).toEqual({ M: 8, W: 3, Sv: 4, OC: 1, ward: 6 })
    expect(ds('grimghast-reapers').stats).toEqual({ M: 8, W: 1, Sv: 4, OC: 1, ward: 6 })
    expect(ds('chainrasps').stats).toEqual({ M: 8, W: 1, Sv: 5, OC: 1, ward: 6 })
    expect(ds('knight-of-shrouds').keywords).toEqual(['HERO', 'INFANTRY', 'FLY'])
    expect(ds('spirit-hosts').keywords).toEqual(['INFANTRY', 'FLY'])
    expect(ds('grimghast-reapers').keywords).toEqual(['INFANTRY', 'FLY'])
    expect(ds('chainrasps').keywords).toEqual(['INFANTRY', 'FLY', 'REINFORCEMENTS'])
    for (const id of ['knight-of-shrouds', 'spirit-hosts', 'grimghast-reapers', 'chainrasps']) expect(ds(id).factionKeywords).toEqual(['DEATH', 'NIGHTHAUNT'])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(6)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(34)
    expect(mine.find((u) => u.ref === 'knight-of-shrouds')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'knight-of-shrouds')!.enhancementId).toBe('nighthaunt.enh.shadows-edge')
    expect(s.players.A.regimentAbilityId).toBe('nighthaunt.ability.chorus-of-terror')
    expect(s.players.A.battleTraitIds).toEqual(['nighthaunt.ability.ethereal', 'nighthaunt.ability.wave-of-terror'])
    // bases: 32 round Knight, 50 round Hosts, 32 round Reapers, 25 round Chainrasps
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(base('knight-of-shrouds').radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(base('spirit-hosts').radius).toBeCloseTo(50 / 2 / 25.4, 2)
    expect(base('grimghast-reapers-1').radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(base('chainrasps-2').radius).toBeCloseTo(25 / 2 / 25.4, 2)
  })

  it('NH-ARMY-2 (data) every unit has Fly and a printed Ward (6+); only both Chainrasps units carry Reinforcements', () => {
    for (const u of army.units) {
      expect(bundle.datasheets[u.datasheet].keywords, u.ref).toContain('FLY')
      expect(bundle.datasheets[u.datasheet].stats.ward, u.ref).toBe(6)
    }
    const reinforced = army.units.filter((u) => bundle.datasheets[u.datasheet].keywords.includes('REINFORCEMENTS')).map((u) => u.ref)
    expect(reinforced).toEqual(['chainrasps-1', 'chainrasps-2'])
    expect(army.units.filter((u) => u.datasheet === 'nighthaunt.unit.chainrasps').map((u) => u.size)).toEqual([10, 10])
  })
})

describe('NH-WEAP weapon profiles', () => {
  it('NH-WEAP-1 (data) Range / Attacks / Hit / Wound / Rend / Damage match the warscrolls, and all four weapons are Crit (Auto-wound) melee weapons', () => {
    expect(row(wp('sword-of-stolen-hours'))).toEqual([0, 5, 4, 3, 1, 2, ['CRIT_AUTO_WOUND']])
    expect(row(wp('spectral-claws-and-daggers'))).toEqual([0, 6, 4, 4, 0, 1, ['CRIT_AUTO_WOUND']])
    expect(row(wp('slasher-scythe'))).toEqual([0, 2, 4, 3, 1, 1, ['CRIT_AUTO_WOUND']])
    expect(row(wp('malignant-weapon'))).toEqual([0, 2, 4, 5, 0, 1, ['CRIT_AUTO_WOUND']])
    for (const id of ['sword-of-stolen-hours', 'spectral-claws-and-daggers', 'slasher-scythe', 'malignant-weapon']) expect(wp(id).type).toBe('melee')
  })

  it('NH-DATA the army\'s abilities and enhancements are all in the bundle, and every shipped Nighthaunt file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'nighthaunt')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/nighthaunt/') && !r.ok)).toEqual([])
  })
})
