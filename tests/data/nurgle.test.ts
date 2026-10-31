// Maggotkin of Nurgle (Bleak Host) shipped data: docs/spec/factions/maggotkin-of-nurgle.md §1, §5, §9 (MON-ARMY-*, MON-WEAP-*).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'nurgle.army.bleak-host'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Nurgle', faction: 'nurgle', patrolId: ARMY, enhancementId: 'nurgle.enh.gardener-of-nurgle', regimentAbilityId: 'nurgle.ability.locus-of-fecundity' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`nurgle.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`nurgle.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('MON-ARMY roster', () => {
  it('MON-ARMY-1 the Bleak Host builds: Spoilpox Scrivener general, 2 x 1 Pusgoyle Blightlord, Putrid Blightkings, 2 x 5 Plaguebearers, 18 models, every unit Ward 5+', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['spoilpox-scrivener', 'pusgoyle-blightlord-1', 'pusgoyle-blightlord-2', 'putrid-blightkings', 'plaguebearers-1', 'plaguebearers-2'])
    expect(army.warlord).toBe('spoilpox-scrivener')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(18)
    expect(army.battleTraits).toEqual(['nurgle.ability.the-infectious-hosts', 'nurgle.ability.diseased', 'nurgle.ability.nurgles-embrace'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['nurgle.ability.infested-with-wonders', 'nurgle.ability.locus-of-fecundity'])
    expect(army.enhancements.map((e) => e.id)).toEqual([
      'nurgle.enh.pestilent-breath', 'nurgle.enh.summoner-of-plaguebearers', 'nurgle.enh.gardener-of-nurgle', 'nurgle.enh.gift-of-febrile-frenzy',
    ])
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('spoilpox-scrivener').stats).toEqual({ M: 4, W: 5, Sv: 5, OC: 2, ward: 5 })
    expect(ds('pusgoyle-blightlord').stats).toEqual({ M: 8, W: 8, Sv: 4, OC: 2, ward: 5 })
    expect(ds('putrid-blightkings').stats).toEqual({ M: 4, W: 3, Sv: 3, OC: 1, ward: 5 })
    expect(ds('plaguebearers').stats).toEqual({ M: 4, W: 2, Sv: 6, OC: 1, ward: 5 })
    expect(ds('spoilpox-scrivener').keywords).toEqual(['HERO', 'INFANTRY'])
    expect(ds('pusgoyle-blightlord').keywords).toEqual(['CAVALRY', 'FLY'])
    expect(ds('putrid-blightkings').keywords).toEqual(['INFANTRY'])
    expect(ds('plaguebearers').keywords).toEqual(['INFANTRY', 'PLAGUEBEARERS'])
    // the two Blightlords share one warscroll, the two Plaguebearers units another; the second of each starts in reserve
    expect(army.units.filter((u) => u.datasheet === 'nurgle.unit.pusgoyle-blightlord').map((u) => [u.size, u.reserve?.ability ?? null]))
      .toEqual([[1, null], [1, 'nurgle.ability.daemonic-summoning']])
    expect(army.units.filter((u) => u.datasheet === 'nurgle.unit.plaguebearers').map((u) => [u.size, u.reserve?.ability ?? null]))
      .toEqual([[5, null], [5, 'nurgle.ability.daemonic-summoning']])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(6)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(18)
    expect(mine.find((u) => u.ref === 'spoilpox-scrivener')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'spoilpox-scrivener')!.enhancementId).toBe('nurgle.enh.gardener-of-nurgle')
    expect(s.players.A.regimentAbilityId).toBe('nurgle.ability.locus-of-fecundity')
    expect(mine.filter((u) => u.reserveArrival === 'nurgle.ability.daemonic-summoning').map((u) => u.ref).sort()).toEqual(['plaguebearers-2', 'pusgoyle-blightlord-2'])
    // bases: 40 round Scrivener and Blightkings, 60 round Blightlords, 32 round Plaguebearers
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(base('spoilpox-scrivener').radius).toBeCloseTo(40 / 2 / 25.4, 2)
    expect(base('pusgoyle-blightlord-1').radius).toBeCloseTo(60 / 2 / 25.4, 2)
    expect(base('putrid-blightkings').radius).toBeCloseTo(40 / 2 / 25.4, 2)
    expect(base('plaguebearers-1').radius).toBeCloseTo(32 / 2 / 25.4, 2)
  })

  it('MON-ARMY-2 no unit has the Reinforcements keyword, so Call for Reinforcements is never offered to the army', () => {
    expect(army.units.filter((u) => bundle.datasheets[u.datasheet].keywords.includes('REINFORCEMENTS'))).toEqual([])
    expect(bundle.factions.nurgle.combatPatrols).toEqual([ARMY])
  })
})

describe('MON-WEAP weapon profiles', () => {
  it('MON-WEAP-1 Range / Attacks / Hit / Wound / Rend / Damage / abilities match the warscrolls (Disgusting Sneezes D6 at 2+, Shoot in Combat)', () => {
    expect(row(wp('disgusting-sneezes'))).toEqual([7, 'D6', 2, 4, 0, 1, ['SHOOT_IN_COMBAT']])
    expect(row(wp('distended-maw'))).toEqual([0, 3, 4, 3, 1, 2, []])
    expect(row(wp('blighted-scythe'))).toEqual([0, 3, 3, 3, 2, 1, []])
    expect(row(wp('blighted-weapon'))).toEqual([0, 4, 3, 3, 1, 1, []])
  })

  it('MON-WEAP-2 Plaguesword (Atk 1, 4+/3+, Crit (Mortal))', () => {
    expect(row(wp('plaguesword'))).toEqual([0, 1, 4, 3, 0, 1, ['CRIT_MORTAL']])
  })

  it('MON-WEAP-3 Rot Fly\'s Mouthparts and Sting (Atk 6, 4+/2+, Companion)', () => {
    expect(row(wp('rot-fly-mouthparts'))).toEqual([0, 6, 4, 2, 0, 1, ['COMPANION']])
  })

  it('MON-DATA the army\'s abilities and enhancements are all in the bundle, and every shipped Nurgle file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'nurgle')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/nurgle/') && !r.ok)).toEqual([])
  })
})
