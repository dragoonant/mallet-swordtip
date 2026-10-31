// Stormcast Eternals (Vigilant Brotherhood) shipped data: docs/spec/factions/stormcast-eternals.md §1, §4, §5, §7. Test ids SCE-*.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'stormcast.army.vigilant-brotherhood'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Stormcast', faction: 'stormcast', patrolId: ARMY, enhancementId: 'stormcast.enh.hallowed-scrolls', regimentAbilityId: 'stormcast.ability.blaze-of-glory' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`stormcast.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`stormcast.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('SCE-ARMY roster', () => {
  it('SCE-ARMY-1 the Vigilant Brotherhood builds with 4 units and 10 models; the Lord-Vigilant is the general; stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['lord-vigilant', 'lord-veritant', 'prosecutors', 'liberators'])
    expect(army.warlord).toBe('lord-vigilant')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(10)
    expect(army.regimentAbilities).toHaveLength(2)
    expect(army.enhancements).toHaveLength(4)
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('lord-vigilant').stats).toEqual({ M: 12, W: 8, Sv: 3, OC: 2 })
    expect(ds('lord-veritant').stats).toEqual({ M: 5, W: 6, Sv: 3, OC: 2 })
    expect(ds('prosecutors').stats).toEqual({ M: 12, W: 2, Sv: 3, OC: 1 })
    expect(ds('liberators').stats).toEqual({ M: 5, W: 2, Sv: 3, OC: 1 })
    expect(ds('lord-vigilant').keywords).toEqual(['HERO', 'CAVALRY'])
    expect(ds('lord-veritant').keywords).toEqual(['HERO', 'PRIEST', 'INFANTRY'])
    expect(ds('prosecutors').keywords).toEqual(['INFANTRY', 'FLY', 'REINFORCEMENTS'])
    expect(ds('liberators').keywords).toEqual(['INFANTRY', 'REINFORCEMENTS'])
    expect(ds('lord-vigilant').composition[0].base).toEqual({ shape: 'oval', mm: 90, mm2: 52 })
    for (const id of ['lord-veritant', 'prosecutors', 'liberators']) expect(ds(id).composition[0].base).toEqual({ shape: 'round', mm: 40 })

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(4)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(10)
    expect(mine.find((u) => u.ref === 'lord-vigilant')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'lord-vigilant')!.enhancementId).toBe('stormcast.enh.hallowed-scrolls')
    expect(s.players.A.regimentAbilityId).toBe('stormcast.ability.blaze-of-glory')
    expect(s.players.A.battleTraitIds).toEqual(['stormcast.ability.shield-of-azyr', 'stormcast.ability.storm-charge'])
  })

  it('SCE-ARMY-2 Liberators carry 4 Warhammers and 1 Grandhammer (Grandhammer model allocated last); Prosecutors carry both javelin profiles', () => {
    const s = realState()
    const unit = (ref: string) => Object.values(s.units).find((x) => x.player === 'A' && x.ref === ref)!
    expect(unit('liberators').models.map((id) => s.models[id].datasheetModelId)).toEqual(['liberator', 'liberator', 'liberator', 'liberator', 'liberator-grandhammer'])
    expect(unit('liberators').models.map((id) => s.models[id].weapons)).toEqual([
      ['stormcast.weapon.warhammer'], ['stormcast.weapon.warhammer'], ['stormcast.weapon.warhammer'], ['stormcast.weapon.warhammer'], ['stormcast.weapon.grandhammer'],
    ])
    for (const id of unit('prosecutors').models) expect(s.models[id].weapons).toEqual(['stormcast.weapon.stormcall-javelin-ranged', 'stormcast.weapon.stormcall-javelin'])
    expect(s.models[unit('lord-veritant').models[0]].weapons).toEqual(['stormcast.weapon.staff-of-abjuration', 'stormcast.weapon.judgement-blade'])
    expect(s.models[unit('lord-vigilant').models[0]].weapons).toEqual(['stormcast.weapon.hallowed-greataxe', 'stormcast.weapon.gryph-stalker-beak-and-talons'])
  })

  it('SCE-ARMY-4 the Lord-Veritant starts with 1 Gryph-crow token; the token is not a model (no base, no Control, not targetable)', () => {
    const s = realState()
    const veritant = Object.values(s.units).find((x) => x.player === 'A' && x.ref === 'lord-veritant')!
    expect(veritant.tokens).toEqual({ 'gryph-crow': 1 })
    expect(veritant.models).toHaveLength(1)
    expect(Object.values(s.models).filter((m) => m.unitId === veritant.id)).toHaveLength(1)
    for (const u of Object.values(s.units).filter((x) => x.player === 'A' && x.id !== veritant.id)) expect(u.tokens['gryph-crow'] ?? 0).toBe(0)
    // the Control a unit adds comes from its models alone
    expect(ds('lord-veritant').stats.OC).toBe(2)
  })
})

describe('SCE-WS warscrolls and weapons', () => {
  it('SCE-WS-1 weapon profiles: Range / Attacks / Hit / Wound / Rend / Damage / abilities', () => {
    expect(row(wp('hallowed-greataxe'))).toEqual([0, 5, 3, 3, 2, 2, []])
    expect(row(wp('gryph-stalker-beak-and-talons'))).toEqual([0, 3, 4, 3, 1, 2, ['COMPANION']])
    expect(row(wp('staff-of-abjuration'))).toEqual([0, 1, 3, 3, 1, 3, []])
    expect(row(wp('judgement-blade'))).toEqual([0, 3, 3, 3, 1, 'D3', ['ANTI', 'ANTI']])
    expect(wp('judgement-blade').abilities.map((a) => a.keyword)).toEqual(['WIZARD', 'PRIEST'])
    expect(row(wp('stormcall-javelin-ranged'))).toEqual([10, 1, 3, 3, 1, 'D3', []])
    expect(row(wp('stormcall-javelin'))).toEqual([0, 3, 3, 3, 1, 1, []])
    expect(row(wp('warhammer'))).toEqual([0, 2, 3, 3, 1, 1, ['CRIT_MORTAL']])
    expect(row(wp('grandhammer'))).toEqual([0, 2, 3, 3, 1, 2, ['CRIT_MORTAL']])
  })

  it('SCE-WS-1 the Prosecutors coherency range is 2 inches and the other warscrolls keep the default', () => {
    expect(ds('prosecutors').coherencyRange).toBe(2)
    for (const id of ['lord-vigilant', 'lord-veritant', 'liberators']) expect(ds(id).coherencyRange).toBeUndefined()
  })

  it('SCE-WS-1 the army abilities and enhancements are all in the bundle, and every shipped Stormcast file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'stormcast')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/stormcast/') && !r.ok)).toEqual([])
  })

  it('SCE-WS-2 the sim defaults are Blaze of Glory and Hallowed Scrolls; the variant games take the last entries (Strike Where Needed, Morrda Talon)', () => {
    expect(army.regimentAbilities!.find((r) => r.default)!.id).toBe('stormcast.ability.blaze-of-glory')
    expect(army.enhancements.find((e) => e.default)!.id).toBe('stormcast.enh.hallowed-scrolls')
    expect(army.regimentAbilities!.at(-1)!.id).toBe('stormcast.ability.strike-where-needed')
    expect(army.enhancements.at(-1)!.id).toBe('stormcast.enh.morrdas-talon')
  })
})
