// Disciples of Tzeentch (Tzaangor Warflock) shipped data: docs/spec/factions/disciples-of-tzeentch.md §1, §5, §9 (DOT-DATA-*, DOT-WEAP-*).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'tzeentch.army.tzaangor-warflock'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Tzeentch', faction: 'tzeentch', patrolId: ARMY, enhancementId: 'tzeentch.enh.fold-reality', regimentAbilityId: 'tzeentch.ability.arcane-ritualists' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`tzeentch.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`tzeentch.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('DOT-DATA roster', () => {
  it('DOT-DATA-1 the Tzaangor Warflock builds: Shaman general, 10 Tzaangors, 3 Enlightened in reserve, 3 Skyfires, 17 models, stats and bases as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['tzaangor-shaman', 'tzaangors', 'tzaangor-enlightened', 'tzaangor-skyfires'])
    expect(army.warlord).toBe('tzaangor-shaman')
    expect(army.units.map((u) => u.size)).toEqual([1, 10, 3, 3])
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(17)
    expect(army.units.map((u) => u.reserve?.ability ?? null)).toEqual([null, null, 'tzeentch.ability.fated-arrival', null])
    expect(army.battleTraits).toEqual(['tzeentch.ability.warflock-ambush', 'tzeentch.ability.predict-the-future', 'tzeentch.ability.cheat-destiny'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['tzeentch.ability.constant-flux', 'tzeentch.ability.arcane-ritualists'])
    expect(army.regimentAbilities?.find((r) => r.default)?.id).toBe('tzeentch.ability.constant-flux')
    expect(army.enhancements.map((e) => e.id)).toEqual(['tzeentch.enh.mutagenic-sorcery', 'tzeentch.enh.predicted-strike', 'tzeentch.enh.fold-reality', 'tzeentch.enh.infernal-gateway'])
    expect(army.enhancements.find((e) => e.default)?.id).toBe('tzeentch.enh.mutagenic-sorcery')
    expect(bundle.factions.tzeentch.combatPatrols).toEqual([ARMY])
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('tzaangor-shaman').stats).toEqual({ M: 14, W: 6, Sv: 5, OC: 2 })
    expect(ds('tzaangors').stats).toEqual({ M: 6, W: 2, Sv: 5, OC: 1 })
    expect(ds('tzaangor-enlightened').stats).toEqual({ M: 14, W: 4, Sv: 4, OC: 1 })
    expect(ds('tzaangor-skyfires').stats).toEqual({ M: 14, W: 4, Sv: 4, OC: 1 })
    expect(ds('tzaangor-shaman').keywords).toEqual(['HERO', 'WIZARD', 'CAVALRY', 'FLY'])
    expect(ds('tzaangors').keywords).toEqual(['INFANTRY'])
    expect(ds('tzaangor-enlightened').keywords).toEqual(['CAVALRY', 'FLY'])
    expect(ds('tzaangor-skyfires').keywords).toEqual(['CAVALRY', 'FLY'])
    expect(ds('tzaangor-shaman').wizard).toBe(1)

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(17)
    expect(mine.find((u) => u.ref === 'tzaangor-shaman')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'tzaangor-shaman')!.enhancementId).toBe('tzeentch.enh.fold-reality')
    expect(s.players.A.regimentAbilityId).toBe('tzeentch.ability.arcane-ritualists')
    expect(mine.filter((u) => u.reserveArrival).map((u) => [u.ref, u.reserveArrival, u.location])).toEqual([['tzaangor-enlightened', 'tzeentch.ability.fated-arrival', 'reserves']])
    // bases: 40 round Shaman, Enlightened and Skyfires; 32 round Tzaangors
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(base('tzaangor-shaman').radius).toBeCloseTo(40 / 2 / 25.4, 2)
    expect(base('tzaangors').radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(base('tzaangor-enlightened').radius).toBeCloseTo(40 / 2 / 25.4, 2)
    expect(base('tzaangor-skyfires').radius).toBeCloseTo(40 / 2 / 25.4, 2)
    // no warscroll prints a Ward
    for (const u of army.units) expect((bundle.datasheets[u.datasheet].stats as { ward?: number }).ward ?? null, u.ref).toBeNull()
  })

  it('DOT-DATA-2 the Fated Arrival descriptor carries the territory + edge arrival shape (round 2, 6", friendly territory, within 1" of an edge)', () => {
    const a = bundle.abilities['tzeentch.ability.fated-arrival']
    expect(a.fromRound).toBe(2)
    expect(a.params).toMatchObject({ fromRound: 2, minEnemyDistance: 6, anywhere: false, territory: true, edgeWithin: 1 })
    expect(a.timing).toEqual({ kind: 'phase', phase: 'movement', whose: 'your' })
  })
})

describe('DOT-WEAP weapon profiles', () => {
  it('DOT-WEAP-1 Range / Attacks / Hit / Wound / Rend / Damage / abilities match the warscrolls; Disc\'s Teeth and Horns is one shared Companion weapon on all three disc warscrolls', () => {
    expect(row(wp('staff-of-change'))).toEqual([0, 3, 4, 3, 1, 'D3', []])
    expect(row(wp('discs-teeth-and-horns'))).toEqual([0, 2, 4, 3, 1, 'D3', ['COMPANION']])
    expect(row(wp('savage-blades'))).toEqual([0, 3, 4, 3, 1, 1, []])
    expect(row(wp('tzeentchian-spear'))).toEqual([0, 3, 4, 3, 1, 2, []])
    expect(row(wp('arrow-of-fate'))).toEqual([18, 2, 4, 3, 1, 2, []])
    expect(row(wp('bow-stave'))).toEqual([0, 1, 4, 3, 0, 1, []])
    expect(Object.keys(bundle.weapons).filter((id) => id.startsWith('tzeentch.weapon.disc'))).toEqual(['tzeentch.weapon.discs-teeth-and-horns'])
    for (const unit of ['tzaangor-shaman', 'tzaangor-enlightened', 'tzaangor-skyfires']) {
      expect(ds(unit).composition[0].weapons.default, unit).toContain('tzeentch.weapon.discs-teeth-and-horns')
    }
    expect(ds('tzaangors').composition[0].weapons.default).toEqual(['tzeentch.weapon.savage-blades'])
    // no ranged weapon has Shoot in Combat
    for (const w of Object.values(bundle.weapons).filter((x) => x.id.startsWith('tzeentch.') && x.type === 'ranged')) expect(w.abilities.map((a) => a.ability)).not.toContain('SHOOT_IN_COMBAT')
  })

  it('DOT-DATA the army\'s abilities and enhancements are all in the bundle, and every shipped Tzeentch file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'tzeentch')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/tzeentch/') && !r.ok)).toEqual([])
  })
})
