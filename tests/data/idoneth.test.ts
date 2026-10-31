// Idoneth Deepkin (Soulraid Hunt) shipped data: docs/spec/factions/idoneth-deepkin.md §1, §5, §9 (IDK-ARMY-*, IDK-WEAP-*).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'idoneth.army.soulraid-hunt'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Idoneth', faction: 'idoneth', patrolId: ARMY, enhancementId: 'idoneth.enh.mind-flare', regimentAbilityId: 'idoneth.ability.ethersea-predators' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`idoneth.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`idoneth.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('IDK-ARMY roster', () => {
  it('IDK-ARMY-1 the Soulraid Hunt builds: Soulscryer general, 3 Morrsarr Guard, Allopex and two units of 5 Thralls, 15 models, stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['isharann-soulscryer', 'akhelian-morrsarr-guard', 'akhelian-allopex', 'thralls-1', 'thralls-2'])
    expect(army.warlord).toBe('isharann-soulscryer')
    expect(army.units.map((u) => u.size)).toEqual([1, 3, 1, 5, 5])
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(15)
    // both Thralls units share one warscroll
    expect(army.units[3].datasheet).toBe(army.units[4].datasheet)
    expect(army.battleTraits).toEqual(['idoneth.ability.tides-of-death', 'idoneth.ability.tides-of-death-low'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['idoneth.ability.way-of-the-cresting-wave', 'idoneth.ability.ethersea-predators'])
    expect(army.regimentAbilities?.find((r) => r.default)?.id).toBe('idoneth.ability.way-of-the-cresting-wave')
    expect(army.enhancements.map((e) => e.id)).toEqual(['idoneth.enh.steelshell-armour', 'idoneth.enh.arch-ritualist', 'idoneth.enh.mind-flare', 'idoneth.enh.delicious-morsels'])
    expect(army.enhancements.find((e) => e.default)?.id).toBe('idoneth.enh.steelshell-armour')
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('isharann-soulscryer').stats).toEqual({ M: 6, W: 5, Sv: 5, OC: 2 })
    expect(ds('akhelian-morrsarr-guard').stats).toEqual({ M: 14, W: 4, Sv: 4, OC: 1 })
    expect(ds('akhelian-allopex').stats).toEqual({ M: 12, W: 8, Sv: 4, OC: 2 })
    expect(ds('namarti-thralls').stats).toEqual({ M: 6, W: 1, Sv: 5, OC: 1 })
    expect(ds('isharann-soulscryer').keywords).toEqual(['HERO', 'INFANTRY'])
    expect(ds('akhelian-morrsarr-guard').keywords).toEqual(['CAVALRY', 'FLY'])
    expect(ds('akhelian-allopex').keywords).toEqual(['CAVALRY', 'FLY', 'REINFORCEMENTS'])
    expect(ds('namarti-thralls').keywords).toEqual(['INFANTRY', 'REINFORCEMENTS'])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(15)
    expect(mine.find((u) => u.ref === 'isharann-soulscryer')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'isharann-soulscryer')!.enhancementId).toBe('idoneth.enh.mind-flare')
    expect(s.players.A.regimentAbilityId).toBe('idoneth.ability.ethersea-predators')
    // bases: 32 round / 60x35 oval / 90x52 oval / 32 round
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(base('isharann-soulscryer').radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(base('akhelian-morrsarr-guard').radius).toBeCloseTo(60 / 2 / 25.4, 2)
    expect(base('akhelian-morrsarr-guard').radius2).toBeCloseTo(35 / 2 / 25.4, 2)
    expect(base('akhelian-allopex').radius).toBeCloseTo(90 / 2 / 25.4, 2)
    expect(base('akhelian-allopex').radius2).toBeCloseTo(52 / 2 / 25.4, 2)
    expect(base('thralls-1').radius).toBeCloseTo(32 / 2 / 25.4, 2)
  })

  it('IDK-ARMY-2 only the Allopex and the Thralls carry the Reinforcements keyword; none has a Ward', () => {
    const withKw = army.units.filter((u) => bundle.datasheets[u.datasheet].keywords.includes('REINFORCEMENTS')).map((u) => u.ref)
    expect(withKw).toEqual(['akhelian-allopex', 'thralls-1', 'thralls-2'])
    for (const u of army.units) expect((bundle.datasheets[u.datasheet].stats as { ward?: number }).ward ?? null, u.ref).toBeNull()
  })
})

describe('IDK-WEAP weapon profiles', () => {
  it('IDK-WEAP-1 Range / Attacks / Hit / Wound / Rend / Damage / abilities match the warscrolls', () => {
    expect(row(wp('scryfish-shoal'))).toEqual([10, 8, 5, 5, 0, 1, ['SHOOT_IN_COMBAT', 'COMPANION']])
    expect(row(wp('abyssal-touch'))).toEqual([0, 3, 3, 4, 0, 'D3', []])
    expect(row(wp('voltspear'))).toEqual([0, 2, 3, 4, 1, 1, ['CHARGE_DAMAGE']])
    expect(wp('voltspear').abilities[0].value).toBe(1)
    expect(row(wp('fangmora-fangs'))).toEqual([0, 3, 4, 3, 1, 'D3', ['COMPANION']])
    expect(row(wp('razorshell-harpoon-launcher'))).toEqual([18, 2, 3, 2, 1, 3, ['ANTI']])
    expect(wp('razorshell-harpoon-launcher').abilities[0]).toMatchObject({ keyword: 'MONSTER', value: 1 })
    expect(row(wp('barbed-hooks-and-blades'))).toEqual([0, 4, 3, 4, 1, 1, []])
    expect(row(wp('allopex-bite'))).toEqual([0, 3, 4, 2, 2, 2, ['COMPANION']])
    expect(row(wp('lanmari'))).toEqual([0, 2, 3, 4, 1, 1, ['ANTI']])
    expect(wp('lanmari').abilities[0]).toMatchObject({ keyword: 'INFANTRY', value: 1 })
  })

  it('IDK-DATA the army\'s abilities and enhancements are all in the bundle, and every shipped Idoneth file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'idoneth')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/idoneth/') && !r.ok)).toEqual([])
  })
})
