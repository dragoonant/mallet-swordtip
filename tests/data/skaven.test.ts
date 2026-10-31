// Skaven (Warpspark Clawpack) shipped data: docs/spec/factions/skaven.md §1, §5, §9 (SKV-ARMY-*, SKV-WEAP-1).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'skaven.army.warpspark-clawpack'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Skaven', faction: 'skaven', patrolId: ARMY, enhancementId: 'skaven.enh.skitterleap', regimentAbilityId: 'skaven.ability.warpstone-laced-armour' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`skaven.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`skaven.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('SKV-ARMY roster', () => {
  it('SKV-ARMY-1 the Warpspark Clawpack builds: Grey Seer general, Stormfiends, Warp Lightning Cannon and 2 x 10 Clanrats, 25 models, stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['grey-seer', 'stormfiends', 'warp-lightning-cannon', 'clanrats-1', 'clanrats-2'])
    expect(army.warlord).toBe('grey-seer')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(25)
    expect(army.battleTraits).toEqual(['skaven.ability.always-three-clawsteps-ahead'])
    expect(army.regimentAbilities).toHaveLength(2)
    expect(army.enhancements).toHaveLength(4)
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('grey-seer').stats).toEqual({ M: 6, W: 5, Sv: 6, OC: 2 })
    expect(ds('stormfiends').stats).toEqual({ M: 6, W: 6, Sv: 4, OC: 2 })
    expect(ds('warp-lightning-cannon').stats).toEqual({ M: 3, W: 8, Sv: 4, OC: 2 })
    expect(ds('clanrats').stats).toEqual({ M: 6, W: 1, Sv: 5, OC: 1 })
    expect(ds('grey-seer').keywords).toEqual(['HERO', 'WIZARD', 'INFANTRY'])
    expect(ds('grey-seer').wizard).toBe(1)
    expect(ds('stormfiends').keywords).toEqual(['INFANTRY'])
    expect(ds('warp-lightning-cannon').keywords).toEqual(['WAR MACHINE'])
    expect(ds('clanrats').keywords).toEqual(['INFANTRY', 'REINFORCEMENTS', 'CLANRATS'])
    // nothing prints a Ward and nothing flies
    for (const id of ['grey-seer', 'stormfiends', 'warp-lightning-cannon', 'clanrats']) {
      expect((ds(id).stats as { ward?: number }).ward ?? null).toBeNull()
      expect(ds(id).keywords).not.toContain('FLY')
    }

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(25)
    expect(mine.find((u) => u.ref === 'grey-seer')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'grey-seer')!.enhancementId).toBe('skaven.enh.skitterleap')
    expect(s.players.A.regimentAbilityId).toBe('skaven.ability.warpstone-laced-armour')
    expect(s.players.A.battleTraitIds).toEqual(['skaven.ability.always-three-clawsteps-ahead'])
    // bases: 32 round Seer, 60 round Stormfiends, 120x92 oval Cannon, 25 round Clanrats
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(base('grey-seer').radius).toBeCloseTo(32 / 2 / 25.4, 2)
    expect(base('stormfiends').radius).toBeCloseTo(60 / 2 / 25.4, 2)
    expect(base('warp-lightning-cannon').radius).toBeCloseTo(120 / 2 / 25.4, 2)
    expect(base('warp-lightning-cannon').radius2).toBeCloseTo(92 / 2 / 25.4, 2)
    expect(base('clanrats-1').radius).toBeCloseTo(25 / 2 / 25.4, 2)
  })

  it('SKV-ARMY-2 the Stormfiends carry one Shock Gauntlets, one Windlaunchers + Clubbing Blows and one Ratling Cannons + Clubbing Blows model', () => {
    const s = realState()
    const u = Object.values(s.units).find((x) => x.player === 'A' && x.ref === 'stormfiends')!
    const kit = u.models.map((id) => ({ kind: s.models[id].datasheetModelId, weapons: s.models[id].weapons.map((w) => w.replace('skaven.weapon.', '')) }))
    expect(kit).toEqual([
      { kind: 'stormfiend-windlaunchers', weapons: ['windlaunchers', 'clubbing-blows'] },
      { kind: 'stormfiend-ratling', weapons: ['ratling-cannons', 'clubbing-blows'] },
      { kind: 'stormfiend-gauntlets', weapons: ['shock-gauntlets'] },
    ])
    // the Gauntlets come last, so they are the last model allocated damage
    expect(u.models.every((id) => s.models[id].woundsRemaining === 6)).toBe(true)
  })

  it('SKV-ARMY-3 Reinforcements only on both Clanrats units; the Grey Seer, Stormfiends and Cannon are never offered for replacement', () => {
    const reinforced = army.units.filter((u) => bundle.datasheets[u.datasheet].keywords.includes('REINFORCEMENTS')).map((u) => u.ref)
    expect(reinforced).toEqual(['clanrats-1', 'clanrats-2'])
    expect(army.units.filter((u) => u.datasheet === 'skaven.unit.clanrats').map((u) => u.size)).toEqual([10, 10])
  })
})

describe('SKV-WEAP weapon profiles', () => {
  it('SKV-WEAP-1 Range / Attacks / Hit / Wound / Rend / Damage / abilities match the warscrolls (Ratling 3D6, Windlaunchers D3, Crew D6)', () => {
    expect(row(wp('warpstone-staff'))).toEqual([0, 3, 4, 4, 1, 'D3', []])
    expect(row(wp('ratling-cannons'))).toEqual([15, '3D6', 4, 3, 1, 1, []])
    expect(row(wp('windlaunchers'))).toEqual([15, 3, 4, 3, 2, 'D3', []])
    expect(row(wp('shock-gauntlets'))).toEqual([0, 4, 4, 2, 1, 2, ['CRIT_2_HITS']])
    expect(wp('shock-gauntlets').abilities[0].value).toBe('D6')
    expect(row(wp('clubbing-blows'))).toEqual([0, 4, 4, 2, 0, 2, []])
    expect(wp('warp-lightning-blast')).toMatchObject({ range: 20, A: '2D6', skill: 4, abilities: [{ ability: 'HIT_MORTAL', value: 1 }] })
    expect(row(wp('crews-teeth-and-knives'))).toEqual([0, 'D6', 4, 5, 0, 1, []])
    expect(row(wp('rusty-blade'))).toEqual([0, 2, 4, 5, 0, 1, []])
  })

  it('SKV-DATA the army\'s abilities and enhancements are all in the bundle, and every shipped Skaven file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'skaven')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/skaven/') && !r.ok)).toEqual([])
  })
})
