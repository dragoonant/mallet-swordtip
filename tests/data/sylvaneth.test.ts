// Sylvaneth (Spitewing Flight) shipped data: docs/spec/factions/sylvaneth.md §1, §5, §9 (SYL-ARMY-*, SYL-WEAP-*).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'sylvaneth.army.spitewing-flight'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Sylvaneth', faction: 'sylvaneth', patrolId: ARMY, enhancementId: 'sylvaneth.enh.zephyrkin', regimentAbilityId: 'sylvaneth.ability.leaves-on-the-wind' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`sylvaneth.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`sylvaneth.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('SYL-ARMY roster', () => {
  it('SYL-ARMY-1 the Spitewing Flight builds: Arch-Revenant general, 5 Gossamid Archers, 3 Spiterider Lancers and 3 Revenant Seekers, 12 models, stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['arch-revenant', 'gossamid-archers', 'spiterider-lancers', 'revenant-seekers'])
    expect(army.warlord).toBe('arch-revenant')
    expect(army.units.map((u) => u.size)).toEqual([1, 5, 3, 3])
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(12)
    expect(army.battleTraits).toEqual(['sylvaneth.ability.target-of-vengeance', 'sylvaneth.ability.airborne-cohesion', 'sylvaneth.ability.song-of-the-hunt'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['sylvaneth.ability.lifebringers', 'sylvaneth.ability.leaves-on-the-wind'])
    expect(army.regimentAbilities?.find((r) => r.default)?.id).toBe('sylvaneth.ability.lifebringers')
    expect(army.enhancements.map((e) => e.id)).toEqual(['sylvaneth.enh.head-of-the-hunt', 'sylvaneth.enh.bold-spirit', 'sylvaneth.enh.cunning-pursuer', 'sylvaneth.enh.zephyrkin'])
    expect(army.enhancements.find((e) => e.default)?.id).toBe('sylvaneth.enh.head-of-the-hunt')
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('arch-revenant').stats).toEqual({ M: 12, W: 6, Sv: 4, OC: 2 })
    expect(ds('gossamid-archers').stats).toEqual({ M: 12, W: 2, Sv: 5, OC: 1 })
    expect(ds('spiterider-lancers').stats).toEqual({ M: 12, W: 5, Sv: 4, OC: 2 })
    expect(ds('revenant-seekers').stats).toEqual({ M: 12, W: 5, Sv: 4, OC: 2 })
    expect(ds('arch-revenant').keywords).toEqual(['HERO', 'INFANTRY', 'FLY'])
    expect(ds('gossamid-archers').keywords).toEqual(['INFANTRY', 'FLY'])
    expect(ds('spiterider-lancers').keywords).toEqual(['CAVALRY', 'FLY'])
    expect(ds('revenant-seekers').keywords).toEqual(['CAVALRY', 'FLY'])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(12)
    expect(mine.find((u) => u.ref === 'arch-revenant')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'arch-revenant')!.enhancementId).toBe('sylvaneth.enh.zephyrkin')
    expect(s.players.A.regimentAbilityId).toBe('sylvaneth.ability.leaves-on-the-wind')
    // bases: 40 / 32 / 60 / 60 mm, all round
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(base('arch-revenant').radius).toBeCloseTo(40 / 2 / 25.4, 2)
    expect(base('gossamid-archers').radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(base('spiterider-lancers').radius).toBeCloseTo(60 / 2 / 25.4, 2)
    expect(base('revenant-seekers').radius).toBeCloseTo(60 / 2 / 25.4, 2)
    expect(base('revenant-seekers').radius2 ?? base('revenant-seekers').radius).toBeCloseTo(60 / 2 / 25.4, 2)
  })

  it('SYL-ARMY-2 no unit carries the Reinforcements keyword', () => {
    for (const u of army.units) expect(bundle.datasheets[u.datasheet].keywords, u.ref).not.toContain('REINFORCEMENTS')
  })

  it('SYL-ARMY-3 every unit has Fly, none has a Ward, and all four warscrolls use a 2" coherency range', () => {
    for (const u of army.units) {
      const d = bundle.datasheets[u.datasheet]
      expect(d.keywords, u.ref).toContain('FLY')
      expect((d.stats as { ward?: number }).ward ?? null, u.ref).toBeNull()
      expect(d.coherencyRange, u.ref).toBe(2)
    }
  })
})

describe('SYL-WEAP weapon profiles', () => {
  it('SYL-WEAP-1 Range / Attacks / Hit / Wound / Rend / Damage / abilities match the warscrolls', () => {
    expect(row(wp('arch-revenants-glaive'))).toEqual([0, 5, 3, 4, 1, 2, []])
    expect(row(wp('gossamid-bow'))).toEqual([12, 2, 3, 4, 1, 1, ['SHOOT_IN_COMBAT']])
    expect(row(wp('cruel-talons'))).toEqual([0, 1, 3, 4, 0, 1, []])
    expect(row(wp('spiterider-lance'))).toEqual([0, 3, 3, 4, 1, 1, ['CHARGE_DAMAGE']])
    expect(wp('spiterider-lance').abilities[0].value).toBe(1)
    expect(row(wp('dragonspite-mandibles'))).toEqual([0, 3, 4, 3, 1, 2, ['COMPANION']])
    expect(row(wp('seekers-sickle'))).toEqual([0, 3, 3, 4, 1, 1, ['CRIT_MORTAL']])
    // the Lancers and the Seekers share one Mandibles profile
    expect(Object.keys(bundle.weapons).filter((id) => id.startsWith('sylvaneth.weapon.dragonspite'))).toEqual(['sylvaneth.weapon.dragonspite-mandibles'])
  })

  it('SYL-DATA the army\'s abilities and enhancements are all in the bundle, and every shipped Sylvaneth file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'sylvaneth')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/sylvaneth/') && !r.ok)).toEqual([])
  })
})
