// Ogor Mawtribes (Warglutt Marauders) shipped data: docs/spec/factions/ogor-mawtribes.md §1, §5, §9 (OGM-ARMY-*, OGM-WEAP-1).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'ogors.army.warglutt-marauders'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Ogors', faction: 'ogors', patrolId: ARMY, enhancementId: 'ogors.enh.gristlegobbler', regimentAbilityId: 'ogors.ability.blinding-dust-clouds' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`ogors.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`ogors.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('OGM-ARMY roster', () => {
  it('OGM-ARMY-1 (data) the Warglutt Marauders build: Tyrant general, 2 + 3 Gluttons (3 in reserve), 3 Ironguts, 2 Maulbeast Cavalry (1 in reserve), 11 models, stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['tyrant', 'gluttons-2', 'gluttons-3', 'ironguts', 'maulbeast-1', 'maulbeast-2'])
    expect(army.warlord).toBe('tyrant')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(11)
    expect(army.units.filter((u) => u.reserve).map((u) => u.ref)).toEqual(['gluttons-3', 'maulbeast-2'])
    for (const u of army.units.filter((x) => x.reserve)) expect(u.reserve).toEqual({ ability: 'ogors.ability.more-ogors-my-lord' })
    expect(army.battleTraits).toEqual(['ogors.ability.nomadic-warriors', 'ogors.ability.scoff-down-fresh-flesh'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['ogors.ability.blinding-dust-clouds', 'ogors.ability.brutish-barging'])
    expect(army.enhancements.map((e) => e.id)).toEqual(['ogors.enh.gristlegobbler', 'ogors.enh.wallwrecker', 'ogors.enh.lungburster', 'ogors.enh.deathcheater'])
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('tyrant').stats).toEqual({ M: 6, W: 8, Sv: 4, OC: 3 })
    expect(ds('gluttons').stats).toEqual({ M: 6, W: 4, Sv: 5, OC: 2 })
    expect(ds('ironguts').stats).toEqual({ M: 6, W: 4, Sv: 4, OC: 2 })
    expect(ds('maulbeast-cavalry').stats).toEqual({ M: 10, W: 7, Sv: 3, OC: 3 })
    expect(ds('tyrant').keywords).toEqual(['HERO', 'INFANTRY'])
    expect(ds('gluttons').keywords).toEqual(['INFANTRY'])
    expect(ds('ironguts').keywords).toEqual(['INFANTRY'])
    expect(ds('maulbeast-cavalry').keywords).toEqual(['CAVALRY'])
    for (const id of ['tyrant', 'gluttons', 'ironguts', 'maulbeast-cavalry']) expect(ds(id).factionKeywords).toEqual(['DESTRUCTION', 'OGOR MAWTRIBES'])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(6)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(11)
    expect(mine.find((u) => u.ref === 'tyrant')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'tyrant')!.enhancementId).toBe('ogors.enh.gristlegobbler')
    expect(mine.filter((u) => u.reserveArrival === 'ogors.ability.more-ogors-my-lord').map((u) => u.ref).sort()).toEqual(['gluttons-3', 'maulbeast-2'])
    expect(s.players.A.regimentAbilityId).toBe('ogors.ability.blinding-dust-clouds')
    // bases: 50 round Tyrant, 40 round Gluttons and Ironguts, 90 x 52 oval Maulbeast
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(base('tyrant').radius).toBeCloseTo(50 / 2 / 25.4, 2)
    expect(base('gluttons-2').radius).toBeCloseTo(40 / 2 / 25.4, 2)
    expect(base('ironguts').radius).toBeCloseTo(40 / 2 / 25.4, 2)
    expect(base('maulbeast-1').radius).toBeCloseTo(90 / 2 / 25.4, 2)
    expect(base('maulbeast-1').radius2).toBeCloseTo(52 / 2 / 25.4, 2)
  })

  it('OGM-ARMY-2 (data) no unit has Reinforcements and none prints a Ward; only the Tyrant is a Hero; nothing flies', () => {
    for (const u of army.units) {
      const d = bundle.datasheets[u.datasheet]
      expect(d.keywords, u.ref).not.toContain('REINFORCEMENTS')
      expect(d.keywords, u.ref).not.toContain('FLY')
      expect(d.stats.ward ?? null, u.ref).toBeNull()
    }
    expect(army.units.filter((u) => bundle.datasheets[u.datasheet].keywords.includes('HERO')).map((u) => u.ref)).toEqual(['tyrant'])
  })
})

describe('OGM-WEAP weapon profiles', () => {
  it('OGM-WEAP-1 (data) Range / Attacks / Hit / Wound / Rend / Damage match the warscrolls; only the Horns and Fangs carry Companion; every weapon is melee', () => {
    expect(row(wp('tyrants-meatcleavers'))).toEqual([0, 4, 4, 2, 2, 3, []])
    expect(row(wp('glutton-weapons'))).toEqual([0, 4, 4, 2, 1, 2, []])
    expect(row(wp('irongut-weapon'))).toEqual([0, 3, 4, 2, 2, 3, []])
    expect(row(wp('gutbiter-weapons'))).toEqual([0, 3, 4, 2, 2, 3, []])
    expect(row(wp('maulbeast-horns-and-fangs'))).toEqual([0, 4, 4, 2, 1, 2, ['COMPANION']])
    for (const id of ['tyrants-meatcleavers', 'glutton-weapons', 'irongut-weapon', 'gutbiter-weapons', 'maulbeast-horns-and-fangs']) expect(wp(id).type).toBe('melee')
    expect(ds('maulbeast-cavalry').composition[0].weapons.default).toEqual(['ogors.weapon.gutbiter-weapons', 'ogors.weapon.maulbeast-horns-and-fangs'])
  })

  it('OGM-DATA every ability and enhancement of the army is in the bundle, and every shipped Ogors file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) {
      expect(bundle.enhancements[e.id], e.id).toBeDefined()
      expect(bundle.abilities[bundle.enhancements[e.id].effect as string], e.id).toBeDefined()
    }
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'ogors')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(bundle.abilities['ogors.ability.more-ogors-my-lord'].params).toMatchObject({ fromRound: 3, minEnemyDistance: 6, anywhere: true, edgeWithin: 1, edgeAll: true })
    expect(validateAllData().filter((r) => r.file.startsWith('factions/ogors/') && !r.ok)).toEqual([])
  })
})
