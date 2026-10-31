// Seraphon (Sunblooded Prowlers) shipped data: docs/spec/factions/seraphon.md §1, §3, §4, §5, §7. Test ids SER-*.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'seraphon.army.sunblooded-prowlers'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Seraphon', faction: 'seraphon', patrolId: ARMY, enhancementId: 'seraphon.enh.venomite-swarm', regimentAbilityId: 'seraphon.ability.scaled-aegis' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`seraphon.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`seraphon.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('SER-ARMY roster', () => {
  it('SER-ARMY-1 the army builds with 7 units and 27 models; the Sunblood Pack is the general', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['sunblood-pack', 'saurus-a', 'saurus-b', 'hunters-a', 'hunters-b', 'terrawings', 'spawn'])
    expect(army.warlord).toBe('sunblood-pack')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(27)
    expect(army.regimentAbilities).toHaveLength(2)
    expect(army.enhancements).toHaveLength(4)
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(7)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(27)
    const pack = mine.find((u) => u.ref === 'sunblood-pack')!
    expect(pack.isWarlord).toBe(true)
    expect(pack.enhancementId).toBe('seraphon.enh.venomite-swarm')
    expect(pack.models.map((id) => s.models[id].datasheetModelId).sort()).toEqual(['bodyguard', 'bodyguard', 'sunblood'])
    expect(s.players.A.regimentAbilityId).toBe('seraphon.ability.scaled-aegis')
    expect(s.players.A.battleTraitIds).toEqual(['seraphon.ability.hidden-hunters', 'seraphon.ability.vengeance-of-azyr'])
  })

  it('SER-ARMY-2 the Sunblood Pack carries 1 Venomites token, the Spawn of Chotec 3 Sun Acolyte tokens', () => {
    const s = realState()
    const unit = (ref: string) => Object.values(s.units).find((u) => u.player === 'A' && u.ref === ref)!
    expect(unit('sunblood-pack').tokens).toEqual({ venomites: 1 })
    expect(unit('spawn').tokens).toEqual({ 'sun-acolyte': 3 })
    for (const ref of ['saurus-a', 'saurus-b', 'hunters-a', 'hunters-b', 'terrawings']) expect(unit(ref).tokens).toEqual({})
  })

  it('SER-ARMY-3 Reinforcements only on the Terrawings', () => {
    const reinforced = army.units.filter((u) => bundle.datasheets[u.datasheet].keywords.includes('REINFORCEMENTS')).map((u) => u.ref)
    expect(reinforced).toEqual(['terrawings'])
  })

  it('SER-BT-1 both Hunters units and the Spawn start in reserve and arrive through Chameleon Ambush (round 3, anywhere, over 6" from enemies)', () => {
    const s = realState()
    const units = Object.values(s.units).filter((u) => u.player === 'A')
    const reserve = units.filter((u) => u.reserveArrival !== null).map((u) => u.ref).sort()
    expect(reserve).toEqual(['hunters-a', 'hunters-b', 'spawn'])
    const arrival = bundle.abilities['seraphon.ability.chameleon-ambush']
    expect(arrival.params).toEqual({ fromRound: 3, minEnemyDistance: 6, anywhere: true })
    expect(arrival.fromRound).toBe(3)
    for (const u of units.filter((x) => x.reserveArrival)) expect(u.reserveArrival).toBe('seraphon.ability.chameleon-ambush')
    expect(army.battleTraits).toContain('seraphon.ability.hidden-hunters')
  })
})

describe('SER-WS warscrolls and weapons', () => {
  it('SER-WS-1 stats and keywords match the Spearhead warscrolls (no printed Ward)', () => {
    expect(ds('sunblood-pack').stats).toEqual({ M: 5, W: 3, Sv: 4, OC: 1 })
    expect(ds('saurus-warriors').stats).toEqual({ M: 5, W: 2, Sv: 4, OC: 1 })
    expect(ds('hunters-of-huanchi').stats).toEqual({ M: 8, W: 1, Sv: 6, OC: 1 })
    expect(ds('terrawings').stats).toEqual({ M: 12, W: 2, Sv: 5, OC: 1 })
    expect(ds('spawn-of-chotec').stats).toEqual({ M: 5, W: 8, Sv: 5, OC: 1 })
    expect(ds('sunblood-pack').keywords).toEqual(['HERO', 'INFANTRY', 'SAURUS'])
    expect(ds('saurus-warriors').keywords).toEqual(['INFANTRY', 'SAURUS'])
    expect(ds('hunters-of-huanchi').keywords).toEqual(['INFANTRY', 'SKINK'])
    expect(ds('terrawings').keywords).toEqual(['BEAST', 'FLY', 'REINFORCEMENTS'])
    expect(ds('spawn-of-chotec').keywords).toEqual(['BEAST', 'SKINK'])
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'seraphon')) expect(d.stats.ward ?? null, d.id).toBeNull()
  })

  it('SER-WS-1 weapon profiles: Range / Attacks / Hit / Wound / Rend / Damage / abilities', () => {
    expect(row(wp('celestite-weapons'))).toEqual([0, 3, 3, 3, 1, 2, []])
    expect(row(wp('celestite-club'))).toEqual([0, 2, 3, 3, 1, 1, []])
    expect(row(wp('dartpipe'))).toEqual([10, 2, 3, 3, 0, 1, []])
    expect(row(wp('feeble-claws'))).toEqual([0, 1, 4, 5, 0, 1, []])
    expect(row(wp('snapping-beaks'))).toEqual([0, 3, 4, 4, 0, 1, ['COMPANION']])
    expect(row(wp('glob-of-flame-acid'))).toEqual([16, 1, 4, 2, 2, 'D3+3', ['COMPANION']])
    expect(row(wp('fiery-maw'))).toEqual([0, 3, 3, 3, 2, 3, ['COMPANION']])
  })

  it('SER-WS-1 bases: 40mm Sunblood, 32mm Bodyguards / Saurus / Terrawings, 25mm Hunters, 90x52 oval Spawn', () => {
    const base = (d: string, m: string) => ds(d).composition.find((c) => c.modelId === m)!.base
    expect(base('sunblood-pack', 'sunblood')).toEqual({ shape: 'round', mm: 40 })
    expect(base('sunblood-pack', 'bodyguard')).toEqual({ shape: 'round', mm: 32 })
    expect(base('saurus-warriors', 'warrior')).toEqual({ shape: 'round', mm: 32 })
    expect(base('hunters-of-huanchi', 'hunter')).toEqual({ shape: 'round', mm: 25 })
    expect(base('terrawings', 'terrawing')).toEqual({ shape: 'round', mm: 32 })
    expect(base('spawn-of-chotec', 'spawn')).toEqual({ shape: 'oval', mm: 90, mm2: 52 })
    expect(ds('sunblood-pack').composition.find((c) => c.modelId === 'sunblood')!.champion).toBe(true)
  })

  it('SER-WS-1 the army\'s abilities and enhancements are all in the bundle, and every shipped Seraphon file validates against the schemas', () => {
    for (const r of army.regimentAbilities ?? []) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const b of army.battleTraits ?? []) expect(bundle.abilities[b], b).toBeDefined()
    for (const e of army.enhancements) expect(bundle.enhancements[e.id], e.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'seraphon')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/seraphon/') && !r.ok)).toEqual([])
  })
})
