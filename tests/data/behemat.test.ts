// Sons of Behemat (Stone Lobbas) shipped data: docs/spec/factions/sons-of-behemat.md §1, §5, §9 (SOB-ARMY-*, SOB-WEAP-1).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'behemat.army.stone-lobbas'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Sons', faction: 'behemat', patrolId: ARMY, enhancementId: 'behemat.enh.humongous-strides', regimentAbilityId: 'behemat.ability.greedy-and-grabby' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`behemat.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`behemat.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('SOB-ARMY roster', () => {
  it('SOB-ARMY-1 (data) Stone Lobbas builds: Boulder Basher general + 2 Rock-hurlers, 3 models, Move 8" / Health 12 / Save 5+ / Control 5, no Ward, 90mm bases', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['boulder-basher', 'rock-hurler-1', 'rock-hurler-2'])
    expect(army.warlord).toBe('boulder-basher')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(3)
    expect(army.units.filter((u) => u.reserve)).toHaveLength(0)
    expect(army.battleTraits).toEqual(['behemat.ability.boulder-basher', 'behemat.ability.bowled-over', 'behemat.ability.close-one-eye'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['behemat.ability.greedy-and-grabby', 'behemat.ability.surly-sorts'])
    expect(army.enhancements.map((e) => e.id)).toEqual(['behemat.enh.humongous-strides', 'behemat.enh.ard-ead', 'behemat.enh.lucky-rock', 'behemat.enh.hungry-gobbler'])
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    for (const id of ['boulder-basher', 'rock-hurler']) {
      expect(ds(id).stats, id).toEqual({ M: 8, W: 12, Sv: 5, OC: 5 })
      expect(ds(id).composition[0].base, id).toEqual({ shape: 'round', mm: 90 })
      expect(ds(id).factionKeywords, id).toEqual(['DESTRUCTION', 'SONS OF BEHEMAT'])
    }
    expect(ds('boulder-basher').keywords).toEqual(['HERO', 'MONSTER'])
    expect(ds('rock-hurler').keywords).toEqual(['MONSTER', 'REINFORCEMENTS'])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(3)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(3)
    expect(mine.find((u) => u.ref === 'boulder-basher')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'boulder-basher')!.enhancementId).toBe('behemat.enh.humongous-strides')
    expect(s.players.A.regimentAbilityId).toBe('behemat.ability.greedy-and-grabby')
    for (const u of mine) expect(s.models[u.models[0]].base.radius, u.ref).toBeCloseTo(90 / 2 / 25.4, 2)
  })

  it('SOB-ARMY-2 (data) every model carries Hurlin\' Rocks, Massive Club and Rocks and \'Eadbutt; Hurlin\' Rocks has no Shoot in Combat; the two datasheets differ in keywords only', () => {
    for (const id of ['boulder-basher', 'rock-hurler']) {
      expect(ds(id).composition).toHaveLength(1)
      expect(ds(id).composition[0].weapons.default).toEqual(['behemat.weapon.hurlin-rocks', 'behemat.weapon.massive-club-and-rocks', 'behemat.weapon.eadbutt'])
      expect(ds(id).abilities).toEqual(['behemat.ability.drop-toss-or-roll'])
    }
    expect(wp('hurlin-rocks').abilities).toEqual([])
    expect(wp('hurlin-rocks').type).toBe('ranged')
    expect(wp('massive-club-and-rocks').type).toBe('melee')
    expect(wp('eadbutt').type).toBe('melee')
  })
})

describe('SOB-WEAP weapon profiles', () => {
  it('SOB-WEAP-1 (data) Range / Attacks / Hit / Wound / Rend / Damage match the warscroll, and none has a weapon ability', () => {
    expect(row(wp('hurlin-rocks'))).toEqual([12, 3, 4, 2, 1, 'D3', []])
    expect(row(wp('massive-club-and-rocks'))).toEqual([0, 4, 4, 2, 1, 2, []])
    expect(row(wp('eadbutt'))).toEqual([0, 1, 4, 2, 2, 3, []])
  })

  it('SOB-DATA the army\'s abilities and enhancements are all in the bundle, and every shipped Behemat file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    expect(bundle.abilities[bundle.factions.behemat.armyRule], 'army rule').toBeDefined()
    for (const e of army.enhancements) {
      expect(bundle.enhancements[e.id], e.id).toBeDefined()
      expect(bundle.abilities[bundle.enhancements[e.id].effect as string], e.id).toBeDefined()
    }
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'behemat')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/behemat/') && !r.ok)).toEqual([])
  })
})
