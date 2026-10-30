// Kharadron Overlords (Skyhammer Task Force) shipped data: docs/spec/factions/kharadron-overlords.md §1, §4, §5, §7.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'kharadron.army.skyhammer-task-force'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Kharadron', faction: 'kharadron', patrolId: ARMY, enhancementId: 'kharadron.enh.masterwrought-armour', regimentAbilityId: 'kharadron.ability.disengage' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`kharadron.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`kharadron.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('KO-ARMY roster', () => {
  it('KO-ARMY-1 the army builds with 5 units and 15 models; the Admiral is the general', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['admiral', 'arkanauts-skypike', 'arkanauts-gunners', 'skywardens', 'frigate'])
    expect(army.warlord).toBe('admiral')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(15)
    expect(army.regimentAbilities).toHaveLength(2)
    expect(army.enhancements).toHaveLength(4)
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(15)
    expect(mine.find((u) => u.ref === 'admiral')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'admiral')!.enhancementId).toBe('kharadron.enh.masterwrought-armour')
    expect(s.players.A.regimentAbilityId).toBe('kharadron.ability.disengage')
    expect(s.players.A.battleTraitIds).toEqual(['kharadron.ability.ply-the-skies'])
  })

  it('KO-ARMY-2 the Companies carry the two printed loadouts; the Skywardens 2 pistol + skypike and 1 volley gun', () => {
    const s = realState()
    const kinds = (ref: string): string[] => {
      const u = Object.values(s.units).find((x) => x.player === 'A' && x.ref === ref)!
      return u.models.map((id) => s.models[id].datasheetModelId)
    }
    expect(kinds('arkanauts-skypike')).toEqual(['arkanaut', 'arkanaut', 'arkanaut', 'arkanaut', 'arkanaut-skypike'])
    expect(kinds('arkanauts-gunners')).toEqual(['arkanaut', 'arkanaut', 'arkanaut', 'arkanaut-volley', 'arkanaut-skyhook'])
    expect(kinds('skywardens')).toEqual(['skywarden', 'skywarden', 'skywarden-volley'])
  })

  it('KO-ARMY-3 Reinforcements only on both Companies and the Skywardens', () => {
    const reinforced = army.units.filter((u) => bundle.datasheets[u.datasheet].keywords.includes('REINFORCEMENTS')).map((u) => u.ref)
    expect(reinforced).toEqual(['arkanauts-skypike', 'arkanauts-gunners', 'skywardens'])
  })
})

describe('KO-WS warscrolls and weapons', () => {
  it('KO-WS-1 stats and keywords match the Spearhead warscrolls (no printed Ward)', () => {
    expect(ds('arkanaut-admiral').stats).toEqual({ M: 4, W: 6, Sv: 3, OC: 2 })
    expect(ds('arkanaut-company').stats).toEqual({ M: 4, W: 1, Sv: 4, OC: 1 })
    expect(ds('arkanaut-company-gunners').stats).toEqual({ M: 4, W: 1, Sv: 4, OC: 1 })
    expect(ds('skywardens').stats).toEqual({ M: 12, W: 2, Sv: 4, OC: 1 })
    expect(ds('arkanaut-frigate').stats).toEqual({ M: 12, W: 15, Sv: 3, OC: 5 })
    expect(ds('arkanaut-admiral').keywords).toEqual(['HERO', 'INFANTRY'])
    expect(ds('arkanaut-company').keywords).toEqual(['INFANTRY', 'REINFORCEMENTS'])
    expect(ds('skywardens').keywords).toEqual(['INFANTRY', 'FLY', 'REINFORCEMENTS'])
    expect(ds('arkanaut-frigate').keywords).toEqual(['WAR MACHINE', 'FLY'])
  })

  it('KO-WS-1 weapon profiles: Range / Attacks / Hit / Wound / Rend / Damage / abilities', () => {
    expect(row(wp('masterwork-volley-pistol'))).toEqual([10, 3, 3, 3, 1, 2, ['SHOOT_IN_COMBAT']])
    expect(row(wp('skalfhammer'))).toEqual([0, 3, 3, 2, 1, 3, []])
    expect(row(wp('privateer-pistol'))).toEqual([10, 2, 4, 4, 0, 1, ['SHOOT_IN_COMBAT']])
    expect(row(wp('aethermatic-volley-gun'))).toEqual([15, '2D6', 4, 4, 0, 1, []])
    expect(row(wp('light-skyhook'))).toEqual([15, 1, 4, 3, 2, 'D3', []])
    expect(row(wp('arkanaut-cutter'))).toEqual([0, 2, 4, 4, 0, 1, []])
    expect(row(wp('gun-butt'))).toEqual([0, 1, 4, 5, 0, 1, []])
    expect(row(wp('skypike'))).toEqual([0, 2, 3, 3, 1, 2, ['CRIT_MORTAL']])
    expect(row(wp('vulcaniser-pistol'))).toEqual([10, 3, 3, 3, 1, 1, ['SHOOT_IN_COMBAT']])
    expect(row(wp('heavy-skyhook'))).toEqual([24, 2, 4, 3, 2, 'D6', []])
    expect(row(wp('aethershot-carbines'))).toEqual([12, 4, 3, 3, 1, 2, ['SHOOT_IN_COMBAT']])
    expect(row(wp('crews-boarding-weapons'))).toEqual([0, 8, 4, 4, 0, 1, []])
  })

  it('KO-WS-1 the Frigate\'s Battle Damaged line is Attacks 1 on the Heavy Skyhook from 5 Health left', () => {
    const damaged = ds('arkanaut-frigate').damaged!
    expect(damaged.threshold).toBe(5)
    expect(damaged.effect).toEqual({ when: { weaponId: 'kharadron.weapon.heavy-skyhook' }, setStat: { stat: 'A', value: 1 } })
  })

  it('KO-WS-1 the army\'s abilities and enhancements are all in the bundle, and every shipped Kharadron file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'kharadron')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/kharadron/') && !r.ok)).toEqual([])
  })
})
