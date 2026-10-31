// Blades of Khorne (Fangs of the Blood God) shipped data: docs/spec/factions/blades-of-khorne.md §1, §5, §9
// (BOK-ARMY-1, BOK-ARMY-2, BOK-ARMY-3, BOK-WEAP-1, BOK-WEAP-2).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'khorne.army.fangs-of-the-blood-god'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Khorne', faction: 'khorne', patrolId: ARMY, enhancementId: 'khorne.enh.killing-pounce', regimentAbilityId: 'khorne.ability.savagery-upon-savagery' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`khorne.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`khorne.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]
const mm = (r: number) => r / 2 / 25.4

describe('BOK-ARMY roster', () => {
  it('BOK-ARMY-1 the Fangs of the Blood God build: Karanak general, 2 x 5 Flesh Hounds and 8 Claws of Karanak, 19 models, stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['karanak', 'flesh-hounds-1', 'flesh-hounds-2', 'claws-of-karanak'])
    expect(army.warlord).toBe('karanak')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(19)
    expect(army.battleTraits).toEqual(['khorne.ability.the-quarry', 'khorne.ability.blood-drenched'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['khorne.ability.the-scent-of-blood', 'khorne.ability.savagery-upon-savagery'])
    expect(army.enhancements.map((e) => e.id)).toEqual(['khorne.enh.evasive-hunter', 'khorne.enh.sustained-by-gore', 'khorne.enh.killing-pounce', 'khorne.enh.furious-bites'])
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('karanak').stats).toEqual({ M: 8, W: 7, Sv: 5, OC: 2, ward: 6 })
    expect(ds('flesh-hounds').stats).toEqual({ M: 8, W: 2, Sv: 6, OC: 1, ward: 6 })
    expect(ds('claws-of-karanak').stats).toEqual({ M: 6, W: 1, Sv: 5, OC: 1 })
    expect(ds('karanak').keywords).toEqual(['HERO', 'BEAST'])
    expect(ds('flesh-hounds').keywords).toEqual(['BEAST', 'REINFORCEMENTS'])
    expect(ds('claws-of-karanak').keywords).toEqual(['INFANTRY', 'REINFORCEMENTS'])
    // nothing flies, casts or prays
    for (const id of ['karanak', 'flesh-hounds', 'claws-of-karanak']) {
      expect(ds(id).keywords).not.toContain('FLY')
      expect(ds(id).keywords).not.toContain('WIZARD')
      expect(ds(id).wizard).toBeUndefined()
    }
    expect(ds('claws-of-karanak').stats).not.toHaveProperty('ward')

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(19)
    expect(mine.find((u) => u.ref === 'karanak')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'karanak')!.enhancementId).toBe('khorne.enh.killing-pounce')
    expect(s.players.A.regimentAbilityId).toBe('khorne.ability.savagery-upon-savagery')
    expect(s.players.A.battleTraitIds).toEqual(['khorne.ability.the-quarry', 'khorne.ability.blood-drenched'])
    // bases: 75x42 oval Karanak, 60x35 oval Flesh Hounds
    const first = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(first('karanak').radius).toBeCloseTo(mm(75), 2)
    expect(first('karanak').radius2).toBeCloseTo(mm(42), 2)
    expect(first('flesh-hounds-1').radius).toBeCloseTo(mm(60), 2)
    expect(first('flesh-hounds-1').radius2).toBeCloseTo(mm(35), 2)
    expect(mine.find((u) => u.ref === 'flesh-hounds-2')!.models).toHaveLength(5)
  })

  it('BOK-ARMY-2 the Claws of Karanak hold 1 Packlord, 1 Hound of Wrath, 2 Brutalisers and 4 Blood Whelps with their own bases; all Health 1 with Weapons of the Hunt', () => {
    const s = realState()
    const u = Object.values(s.units).find((x) => x.player === 'A' && x.ref === 'claws-of-karanak')!
    expect(u.models).toHaveLength(8)
    const kinds = u.models.map((id) => s.models[id].datasheetModelId)
    expect(kinds).toEqual(['blood-whelp', 'blood-whelp', 'blood-whelp', 'blood-whelp', 'brutaliser', 'brutaliser', 'hound-of-wrath', 'packlord'])
    const baseOf = (kind: string) => s.models[u.models[kinds.indexOf(kind)]].base
    expect(baseOf('blood-whelp').radius).toBeCloseTo(mm(28.5), 3)
    expect(baseOf('brutaliser').radius).toBeCloseTo(mm(32), 3)
    expect(baseOf('packlord').radius).toBeCloseTo(mm(40), 3)
    expect(baseOf('hound-of-wrath').radius).toBeCloseTo(mm(60), 3)
    expect(baseOf('hound-of-wrath').radius2).toBeCloseTo(mm(35), 3)
    for (const id of u.models) {
      expect(s.models[id].woundsRemaining).toBe(1)
      expect(s.models[id].weapons).toEqual(['khorne.weapon.weapons-of-the-hunt'])
    }
  })

  it('BOK-ARMY-3 Reinforcements on both Flesh Hounds units and the Claws; Karanak never carries the keyword', () => {
    const reinforced = army.units.filter((u) => bundle.datasheets[u.datasheet].keywords.includes('REINFORCEMENTS')).map((u) => u.ref)
    expect(reinforced).toEqual(['flesh-hounds-1', 'flesh-hounds-2', 'claws-of-karanak'])
    expect(army.units.filter((u) => u.datasheet === 'khorne.unit.flesh-hounds').map((u) => u.size)).toEqual([5, 5])
    expect(army.units.find((u) => u.ref === 'claws-of-karanak')!.size).toBe(8)
    expect(ds('karanak').keywords).not.toContain('REINFORCEMENTS')
  })
})

describe('BOK-WEAP weapon profiles', () => {
  it('BOK-WEAP-1 Savage Maws and Goreslick Claws: 6 attacks, 4+/3+, Rend 1, Damage 2, Anti-Hero (+1 Rend)', () => {
    const w = wp('savage-maws-and-goreslick-claws')
    expect(row(w)).toEqual([0, 6, 4, 3, 1, 2, ['ANTI']])
    expect(w.abilities[0]).toMatchObject({ ability: 'ANTI', keyword: 'HERO', value: 1 })
    expect(row(wp('blood-dark-claws'))).toEqual([0, 4, 4, 3, 0, 1, []])
  })

  it('BOK-WEAP-2 Weapons of the Hunt: 3 attacks, 4+/3+, no Rend, Damage 1, Crit (2 Hits)', () => {
    const w = wp('weapons-of-the-hunt')
    expect(row(w)).toEqual([0, 3, 4, 3, 0, 1, ['CRIT_2_HITS']])
    expect(w.abilities[0].value).toBeUndefined()
  })

  it('BOK-DATA the army\'s abilities and enhancements are all in the bundle, and every shipped Khorne file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'khorne')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(bundle.factions.khorne.armyRule).toBe('khorne.ability.fangs-of-the-blood-god')
    expect(validateAllData().filter((r) => r.file.startsWith('factions/khorne/') && !r.ok)).toEqual([])
  })
})
