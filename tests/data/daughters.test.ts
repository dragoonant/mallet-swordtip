// Daughters of Khaine (Heartflayer Troupe) shipped data: docs/spec/factions/daughters-of-khaine.md §1, §5, §9 (DOK-ARMY-*, DOK-WEAP-*).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'daughters.army.heartflayer-troupe'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Daughters', faction: 'daughters', patrolId: ARMY, enhancementId: 'daughters.enh.bathed-in-blood', regimentAbilityId: 'daughters.ability.murderous-epiphany' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`daughters.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`daughters.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]
const mm = (inches: number): number => Math.round(inches * 25.4 * 100) / 100

describe('DOK-ARMY roster', () => {
  it('DOK-ARMY-1 the Heartflayer Troupe builds: Melusai Ironscale general + 2x5 Witch Aelves + 5 Doomfire Warlocks + 5 Blood Stalkers, 21 models, stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['melusai-ironscale', 'witch-aelves-1', 'witch-aelves-2', 'doomfire-warlocks', 'blood-stalkers'])
    expect(army.warlord).toBe('melusai-ironscale')
    expect(army.units.map((u) => u.size)).toEqual([1, 5, 5, 5, 5])
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(21)
    expect(army.battleTraits).toEqual(['daughters.ability.blood-rites'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['daughters.ability.blessing-of-khaine', 'daughters.ability.murderous-epiphany'])
    expect(army.regimentAbilities?.find((r) => r.default)?.id).toBe('daughters.ability.blessing-of-khaine')
    expect(army.enhancements.map((e) => e.id)).toEqual(['daughters.enh.fuelled-by-revenge', 'daughters.enh.bathed-in-blood', 'daughters.enh.flask-of-shademist', 'daughters.enh.zealous-orator'])
    expect(army.enhancements.find((e) => e.default)?.id).toBe('daughters.enh.fuelled-by-revenge')
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])
    expect(bundle.factions.daughters.combatPatrols).toEqual([ARMY])

    expect(ds('melusai-ironscale').stats).toEqual({ M: 8, W: 6, Sv: 5, OC: 2, ward: 6 })
    expect(ds('witch-aelves').stats).toEqual({ M: 6, W: 1, Sv: 6, OC: 1, ward: 6 })
    expect(ds('doomfire-warlocks').stats).toEqual({ M: 14, W: 3, Sv: 5, OC: 1, ward: 6 })
    expect(ds('blood-stalkers').stats).toEqual({ M: 8, W: 2, Sv: 5, OC: 1, ward: 6 })
    expect(ds('melusai-ironscale').keywords).toEqual(['HERO', 'INFANTRY'])
    expect(ds('witch-aelves').keywords).toEqual(['INFANTRY', 'REINFORCEMENTS'])
    expect(ds('doomfire-warlocks').keywords).toEqual(['CAVALRY'])
    expect(ds('blood-stalkers').keywords).toEqual(['INFANTRY', 'BLOOD STALKERS'])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(21)
    expect(mine.find((u) => u.ref === 'melusai-ironscale')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'melusai-ironscale')!.enhancementId).toBe('daughters.enh.bathed-in-blood')
    expect(s.players.A.regimentAbilityId).toBe('daughters.ability.murderous-epiphany')
    // the two Witch Aelves units share one warscroll
    expect(mine.filter((u) => u.datasheetId === 'daughters.unit.witch-aelves')).toHaveLength(2)
  })

  it('DOK-ARMY-2 every unit has Ward 6+; the Warlocks are Cavalry on 60x35 ovals, no unit is a Wizard or Priest, the Ironscale has both Keldrisaith profiles', () => {
    for (const u of army.units) {
      const d = bundle.datasheets[u.datasheet]
      expect((d.stats as { ward?: number }).ward, u.ref).toBe(6)
      expect(d.keywords, u.ref).not.toContain('WIZARD')
      expect(d.keywords, u.ref).not.toContain('FLY')
      expect(d.wizard, u.ref).toBeUndefined()
      expect(d.priest, u.ref).toBeUndefined()
    }
    expect(ds('doomfire-warlocks').keywords).toContain('CAVALRY')
    expect(ds('doomfire-warlocks').castingLevel).toBe(1)
    expect(ds('doomfire-warlocks').composition[0].base).toEqual({ shape: 'oval', mm: 60, mm2: 35 })
    expect(ds('melusai-ironscale').composition[0].weapons.default).toEqual(['daughters.weapon.keldrisaith-ranged', 'daughters.weapon.keldrisaith'])
    expect(wp('keldrisaith-ranged').name).toBe('Keldrisaíth')
    expect(wp('keldrisaith').name).toBe('Keldrisaíth')
    expect(row(wp('keldrisaith-ranged'))).toEqual([12, 2, 3, 3, 1, 'D3', []])
    expect(row(wp('keldrisaith'))).toEqual([0, 6, 3, 4, 1, 2, []])
    expect(row(wp('paired-sciansa'))).toEqual([0, 3, 3, 4, 0, 1, ['CRIT_AUTO_WOUND']])
    expect(row(wp('doomfire-crossbow'))).toEqual([10, 2, 3, 4, 0, 1, []])
    expect(row(wp('cursed-scimitar'))).toEqual([0, 2, 3, 4, 1, 1, []])
    expect(row(wp('dark-steeds-vicious-bite'))).toEqual([0, 2, 5, 3, 0, 1, ['COMPANION']])
    expect(row(wp('heartseeker-bow'))).toEqual([18, 3, 3, 4, 1, 1, ['CRIT_AUTO_WOUND']])
    expect(row(wp('scianlar'))).toEqual([0, 2, 3, 4, 0, 1, []])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(mm(base('melusai-ironscale').radius * 2)).toBeCloseTo(40, 0)
    expect(mm(base('witch-aelves-1').radius * 2)).toBeCloseTo(25, 0)
    expect(mm(base('blood-stalkers').radius * 2)).toBeCloseTo(40, 0)
    const lock = base('doomfire-warlocks')
    expect([mm(lock.radius * 2), mm((lock.radius2 ?? lock.radius) * 2)].sort((a, b) => a - b)).toEqual([35, 60].map((x) => expect.closeTo(x, 0)))
    // every Warlock carries the crossbow, the scimitar and the bite; every Ironscale weapon is on the one model
    expect(s.models[mine.find((u) => u.ref === 'doomfire-warlocks')!.models[0]].weapons.map((w) => w.replace('daughters.weapon.', ''))).toEqual(['doomfire-crossbow', 'cursed-scimitar', 'dark-steeds-vicious-bite'])
  })

  it('DOK-WEAP-1 Paired Sciansa and Heartseeker Bow crits auto-wound; the Vicious Bite is a Companion weapon; no ranged weapon shoots in combat', () => {
    expect(wp('paired-sciansa').abilities.map((a) => a.ability)).toEqual(['CRIT_AUTO_WOUND'])
    expect(wp('heartseeker-bow').abilities.map((a) => a.ability)).toEqual(['CRIT_AUTO_WOUND'])
    expect(wp('dark-steeds-vicious-bite').abilities.map((a) => a.ability)).toEqual(['COMPANION'])
    for (const id of Object.keys(bundle.weapons).filter((w) => w.startsWith('daughters.weapon.'))) {
      expect(bundle.weapons[id].abilities.map((a) => a.ability), id).not.toContain('SHOOT_IN_COMBAT')
    }
  })
})
