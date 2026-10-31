// Ossiarch Bonereapers (Mortisan Elite) shipped data: docs/spec/factions/ossiarch-bonereapers.md §1, §5, §9 (OBR-ARMY-*).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'ossiarch.army.mortisan-elite'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Ossiarch', faction: 'ossiarch', patrolId: ARMY, enhancementId: 'ossiarch.enh.lode-of-saturation', regimentAbilityId: 'ossiarch.ability.immaculate-generalship' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`ossiarch.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`ossiarch.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('OBR-ARMY roster', () => {
  it('OBR-ARMY-1 (data) the Mortisan Elite builds: Ossifector general, 3 Immortis Guard, 3 Necropolis Stalkers, 2 Morghast Archai in reserve, 9 models, stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['mortisan-ossifector', 'immortis-guard', 'necropolis-stalkers', 'morghast-archai'])
    expect(army.warlord).toBe('mortisan-ossifector')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(9)
    expect(army.units.find((u) => u.ref === 'morghast-archai')!.reserve).toEqual({ ability: 'ossiarch.ability.dread-descent' })
    expect(army.units.filter((u) => u.reserve)).toHaveLength(1)
    expect(army.battleTraits).toEqual([
      'ossiarch.ability.heralds-of-nagash', 'ossiarch.ability.relentless-discipline',
      'ossiarch.ability.relentless-discipline-charge', 'ossiarch.ability.relentless-discipline-combat',
    ])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['ossiarch.ability.immaculate-generalship', 'ossiarch.ability.peerless-cohesion'])
    expect(army.enhancements.map((e) => e.id)).toEqual(['ossiarch.enh.lode-of-saturation', 'ossiarch.enh.shard-storm', 'ossiarch.enh.mend-constructs', 'ossiarch.enh.helm-of-tyranny'])
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('mortisan-ossifector').stats).toEqual({ M: 5, W: 5, Sv: 4, OC: 2, ward: 6 })
    expect(ds('immortis-guard').stats).toEqual({ M: 5, W: 4, Sv: 3, OC: 1, ward: 6 })
    expect(ds('necropolis-stalkers').stats).toEqual({ M: 6, W: 4, Sv: 4, OC: 1, ward: 6 })
    expect(ds('morghast-archai').stats).toEqual({ M: 10, W: 6, Sv: 3, OC: 2, ward: 6 })
    expect(ds('mortisan-ossifector').keywords).toEqual(['HERO', 'WIZARD', 'INFANTRY'])
    expect(ds('mortisan-ossifector').wizard).toBe(1)
    expect(ds('immortis-guard').keywords).toEqual(['INFANTRY'])
    expect(ds('necropolis-stalkers').keywords).toEqual(['INFANTRY'])
    expect(ds('morghast-archai').keywords).toEqual(['INFANTRY', 'FLY'])
    for (const id of ['mortisan-ossifector', 'immortis-guard', 'necropolis-stalkers', 'morghast-archai']) expect(ds(id).factionKeywords).toEqual(['DEATH', 'OSSIARCH BONEREAPERS'])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(9)
    expect(mine.find((u) => u.ref === 'mortisan-ossifector')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'mortisan-ossifector')!.enhancementId).toBe('ossiarch.enh.lode-of-saturation')
    expect(mine.find((u) => u.ref === 'morghast-archai')!.location).toBe('reserves')
    expect(s.players.A.regimentAbilityId).toBe('ossiarch.ability.immaculate-generalship')
    // bases: 32 round Ossifector, 50 round Guard and Stalkers, 60 round Morghast
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(base('mortisan-ossifector').radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(base('immortis-guard').radius).toBeCloseTo(50 / 2 / 25.4, 2)
    expect(base('necropolis-stalkers').radius).toBeCloseTo(50 / 2 / 25.4, 2)
    expect(base('morghast-archai').radius).toBeCloseTo(60 / 2 / 25.4, 2)
  })

  it('OBR-ARMY-2 (data) every unit has a printed Ward (6+); only the Morghast carry Fly; no unit has Reinforcements', () => {
    for (const u of army.units) {
      expect(bundle.datasheets[u.datasheet].stats.ward, u.ref).toBe(6)
      expect(bundle.datasheets[u.datasheet].keywords, u.ref).not.toContain('REINFORCEMENTS')
    }
    expect(army.units.filter((u) => bundle.datasheets[u.datasheet].keywords.includes('FLY')).map((u) => u.ref)).toEqual(['morghast-archai'])
  })
})

describe('OBR-WEAP weapon profiles', () => {
  it('OBR-WEAP-1 (data) Range / Attacks / Hit / Wound / Rend / Damage match the warscrolls, and none has a weapon ability', () => {
    expect(row(wp('ossified-talons'))).toEqual([0, 3, 4, 4, 0, 2, []])
    expect(row(wp('dread-halberd'))).toEqual([0, 3, 3, 3, 1, 2, []])
    expect(row(wp('stalker-blades'))).toEqual([0, 4, 3, 3, 2, 1, []])
    expect(row(wp('spirit-weapons'))).toEqual([0, 3, 3, 2, 2, 3, []])
    for (const id of ['ossified-talons', 'dread-halberd', 'stalker-blades', 'spirit-weapons']) expect(wp(id).type).toBe('melee')
  })

  it('OBR-DATA the army\'s abilities and enhancements are all in the bundle, and every shipped Ossiarch file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) {
      expect(bundle.enhancements[e.id], e.id).toBeDefined()
      expect(bundle.abilities[bundle.enhancements[e.id].effect as string], e.id).toBeDefined()
    }
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'ossiarch')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(bundle.abilities['ossiarch.ability.dread-descent'].params).toMatchObject({ fromRound: 2, minEnemyDistance: 6, anywhere: true })
    expect(validateAllData().filter((r) => r.file.startsWith('factions/ossiarch/') && !r.ok)).toEqual([])
  })
})
