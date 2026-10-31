// Flesh-eater Courts (Carrion Retainers) shipped data: docs/spec/factions/flesh-eater-courts.md §1, §4, §5, §9 (FEC-ARMY-1, FEC-WEAP-1).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'fec.army.carrion-retainers'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Courts', faction: 'fec', patrolId: ARMY, enhancementId: 'fec.enh.rousing-oration', regimentAbilityId: 'fec.ability.defenders-of-the-realm' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`fec.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`fec.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]
const mm = (inches: number): number => Math.round(inches * 25.4 * 100) / 100

describe('FEC-ARMY roster', () => {
  it('FEC-ARMY-1 the Carrion Retainers build: Abhorrant Archregent general + 10 Cryptguard + 3 Morbheg Knights + Varghulf Courtier, 15 models, stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['abhorrant-archregent', 'cryptguard', 'morbheg-knights', 'varghulf-courtier'])
    expect(army.warlord).toBe('abhorrant-archregent')
    expect(army.units.map((u) => u.size)).toEqual([1, 10, 3, 1])
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(15)
    expect(army.battleTraits).toEqual(['fec.ability.noble-deeds', 'fec.ability.summon-loyal-subjects', 'fec.ability.feeding-frenzy'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['fec.ability.crusading-army', 'fec.ability.defenders-of-the-realm'])
    expect(army.regimentAbilities?.find((r) => r.default)?.id).toBe('fec.ability.crusading-army')
    expect(army.enhancements.map((e) => e.id)).toEqual(['fec.enh.ulguan-cloak', 'fec.enh.blood-river-chalice', 'fec.enh.rousing-oration', 'fec.enh.crimson-victuals'])
    expect(army.enhancements.find((e) => e.default)?.id).toBe('fec.enh.ulguan-cloak')
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])
    expect(bundle.factions.fec.combatPatrols).toEqual([ARMY])
    expect(bundle.factions.fec.armyRule).toBe('fec.ability.carrion-retainers')

    expect(ds('abhorrant-archregent').stats).toEqual({ M: 6, W: 6, Sv: 5, OC: 2, ward: 6 })
    expect(ds('cryptguard').stats).toEqual({ M: 6, W: 1, Sv: 6, OC: 1, ward: 5 })
    expect(ds('morbheg-knights').stats).toEqual({ M: 12, W: 4, Sv: 4, OC: 1, ward: 6 })
    expect(ds('varghulf-courtier').stats).toEqual({ M: 10, W: 8, Sv: 5, OC: 2, ward: 6 })
    expect(ds('abhorrant-archregent').keywords).toEqual(['HERO', 'INFANTRY'])
    expect(ds('cryptguard').keywords).toEqual(['INFANTRY', 'REINFORCEMENTS'])
    expect(ds('morbheg-knights').keywords).toEqual(['CAVALRY', 'FLY'])
    expect(ds('varghulf-courtier').keywords).toEqual(['HERO', 'INFANTRY'])
    // the Archregent casts without being a Wizard; nobody is a Wizard or a Priest
    expect(ds('abhorrant-archregent').castingLevel).toBe(1)
    for (const u of army.units) {
      const d = bundle.datasheets[u.datasheet]
      expect(d.keywords, u.ref).not.toContain('WIZARD')
      expect(d.wizard, u.ref).toBeUndefined()
      expect(d.priest, u.ref).toBeUndefined()
    }
    // only the Knights fly
    expect(Object.values(bundle.datasheets).filter((d) => d.id.startsWith('fec.unit.') && d.keywords.includes('FLY')).map((d) => d.id)).toEqual(['fec.unit.morbheg-knights'])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(15)
    expect(mine.find((u) => u.ref === 'abhorrant-archregent')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'abhorrant-archregent')!.enhancementId).toBe('fec.enh.rousing-oration')
    expect(s.players.A.regimentAbilityId).toBe('fec.ability.defenders-of-the-realm')
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(mm(base('abhorrant-archregent').radius * 2)).toBeCloseTo(40, 0)
    expect(mm(base('cryptguard').radius * 2)).toBeCloseTo(25, 0)
    const knight = base('morbheg-knights')
    expect([mm(knight.radius * 2), mm((knight.radius2 ?? knight.radius) * 2)].sort((a, b) => a - b)).toEqual([42, 75].map((x) => expect.closeTo(x, 0)))
    const varghulf = base('varghulf-courtier')
    expect([mm(varghulf.radius * 2), mm((varghulf.radius2 ?? varghulf.radius) * 2)].sort((a, b) => a - b)).toEqual([52, 90].map((x) => expect.closeTo(x, 0)))
    // every Knight carries both weapons; the Varghulf both of its own
    expect(s.models[mine.find((u) => u.ref === 'morbheg-knights')!.models[0]].weapons.map((w) => w.replace('fec.weapon.', ''))).toEqual(['grisly-lance', 'nightshrieker-claws'])
    expect(s.models[mine.find((u) => u.ref === 'varghulf-courtier')!.models[0]].weapons.map((w) => w.replace('fec.weapon.', ''))).toEqual(['immense-claws', 'dagger-like-fangs'])
  })

  it('FEC-WEAP-1 (data) weapon rows as printed: Grisly Lance has Charge (+1 Damage), the Nightshrieker\'s Claws and Teeth are Companion, nothing shoots', () => {
    expect(row(wp('gory-talons-and-fangs'))).toEqual([0, 5, 3, 3, 1, 2, []])
    expect(row(wp('cursed-weapon'))).toEqual([0, 3, 4, 4, 1, 1, []])
    expect(row(wp('grisly-lance'))).toEqual([0, 2, 3, 4, 1, 1, ['CHARGE_DAMAGE']])
    expect(wp('grisly-lance').abilities[0]).toMatchObject({ ability: 'CHARGE_DAMAGE', value: 1 })
    expect(row(wp('nightshrieker-claws'))).toEqual([0, 3, 4, 3, 1, 2, ['COMPANION']])
    expect(row(wp('immense-claws'))).toEqual([0, 7, 4, 3, 1, 2, []])
    expect(row(wp('dagger-like-fangs'))).toEqual([0, 1, 3, 2, 2, 3, []])
    for (const id of Object.keys(bundle.weapons).filter((w) => w.startsWith('fec.weapon.'))) expect(bundle.weapons[id].type, id).toBe('melee')
  })
})
