// Hedonites of Slaanesh (Epicurean Revellers) shipped data: docs/spec/factions/hedonites-of-slaanesh.md §1, §5, §9 (HOS-ARMY-*, HOS-WEAP-1).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import { codeHooks } from '../../src/engine/code-hooks'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'slaanesh.army.epicurean-revellers'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Slaanesh', faction: 'slaanesh', patrolId: ARMY, enhancementId: 'slaanesh.enh.high-courtiers', regimentAbilityId: 'slaanesh.ability.bringers-of-degradation' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`slaanesh.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`slaanesh.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('HOS-ARMY roster', () => {
  it('HOS-ARMY-1 (data) the Epicurean Revellers build: Thricefold Discord general (3 models), 3 Fiends, 2x10 Daemonettes, 5 Seekers, 31 models, stats as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['thricefold-discord', 'fiends', 'daemonettes-1', 'daemonettes-2', 'seekers'])
    expect(army.warlord).toBe('thricefold-discord')
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(31)
    expect(army.units.filter((u) => u.reserve)).toHaveLength(0)
    expect(army.battleTraits).toEqual(['slaanesh.ability.favour-most-fickle'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['slaanesh.ability.bringers-of-degradation', 'slaanesh.ability.daemonic-onslaught'])
    expect(army.enhancements.map((e) => e.id)).toEqual(['slaanesh.enh.high-courtiers', 'slaanesh.enh.twisted-grace', 'slaanesh.enh.excess-of-violence', 'slaanesh.enh.irresistible-soul-musk'])
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])

    expect(ds('thricefold-discord').stats).toEqual({ M: 6, W: 3, Sv: 5, OC: 2, ward: 5 })
    expect(ds('fiends').stats).toEqual({ M: 10, W: 4, Sv: 5, OC: 1, ward: 6 })
    expect(ds('daemonettes').stats).toEqual({ M: 6, W: 1, Sv: 6, OC: 1, ward: 6 })
    expect(ds('seekers').stats).toEqual({ M: 14, W: 3, Sv: 6, OC: 1, ward: 6 })
    expect(ds('thricefold-discord').keywords).toEqual(['HERO', 'WIZARD', 'INFANTRY'])
    expect(ds('thricefold-discord').wizard).toBe(1)
    expect(ds('fiends').keywords).toContain('BEAST')
    expect(ds('daemonettes').keywords).toContain('INFANTRY')
    expect(ds('seekers').keywords).toContain('CAVALRY')
    // the unit-type name keywords the hooks look for
    expect(ds('daemonettes').keywords).toContain('DAEMONETTES')
    expect(ds('seekers').keywords).toContain('SEEKERS')
    expect(ds('fiends').keywords).toContain('FIENDS')
    for (const id of ['thricefold-discord', 'fiends', 'daemonettes', 'seekers']) expect(ds(id).factionKeywords).toEqual(['CHAOS', 'HEDONITES OF SLAANESH'])

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(31)
    expect(mine.find((u) => u.ref === 'thricefold-discord')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'thricefold-discord')!.enhancementId).toBe('slaanesh.enh.high-courtiers')
    expect(s.players.A.regimentAbilityId).toBe('slaanesh.ability.bringers-of-degradation')
    // the general is three named models on two base sizes; Daemonettes 25 round; Fiends 75x42 oval; Seekers 60x35 oval
    const general = mine.find((u) => u.ref === 'thricefold-discord')!
    expect(general.models.map((id) => s.models[id].datasheetModelId)).toEqual(['vexmor', 'vashtiss', 'lascivyr'])
    expect(general.models.map((id) => s.models[id].base.radius)).toEqual([40 / 2 / 25.4, 28.5 / 2 / 25.4, 28.5 / 2 / 25.4].map((x) => expect.closeTo(x, 2)))
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(base('daemonettes-1').radius).toBeCloseTo(25 / 2 / 25.4, 2)
    expect(base('fiends').radius).toBeCloseTo(75 / 2 / 25.4, 2)
    expect(base('fiends').radius2).toBeCloseTo(42 / 2 / 25.4, 2)
    expect(base('seekers').radius).toBeCloseTo(60 / 2 / 25.4, 2)
    expect(base('seekers').radius2).toBeCloseTo(35 / 2 / 25.4, 2)
  })

  it('HOS-ARMY-2 (data) printed Wards: Thricefold 5+, Fiends 6+, Daemonettes 6+, Seekers 6+; nothing has Fly', () => {
    expect(ds('thricefold-discord').stats.ward).toBe(5)
    for (const id of ['fiends', 'daemonettes', 'seekers']) expect(ds(id).stats.ward, id).toBe(6)
    for (const u of army.units) expect(bundle.datasheets[u.datasheet].keywords, u.ref).not.toContain('FLY')
  })

  it('HOS-WEAP-1 (data) weapon rows; Agonising Claws carry Anti-Cavalry, the Steed\'s Poisoned Tongue is Companion, the Pincers deal D3', () => {
    expect(row(wp('thricefold-arsenal'))).toEqual([0, 3, 3, 3, 1, 2, []])
    expect(row(wp('deadly-pincers-and-barbed-stinger'))).toEqual([0, 4, 4, 3, 1, 'D3', []])
    expect(row(wp('piercing-claws'))).toEqual([0, 2, 3, 4, 1, 1, []])
    expect(row(wp('agonising-claws'))).toEqual([0, 3, 3, 4, 1, 1, ['ANTI']])
    expect(wp('agonising-claws').abilities[0]).toMatchObject({ ability: 'ANTI', keyword: 'CAVALRY' })
    expect(row(wp('steeds-poisoned-tongue'))).toEqual([0, 2, 3, 4, 0, 1, ['COMPANION']])
    expect(ds('thricefold-discord').composition.map((c) => c.weapons.default)).toEqual(Array(3).fill(['slaanesh.weapon.thricefold-arsenal']))
    expect(ds('seekers').composition[0].weapons.default).toEqual(['slaanesh.weapon.agonising-claws', 'slaanesh.weapon.steeds-poisoned-tongue'])
  })

  it('HOS-REG every code in the Slaanesh data resolves to a hook, activated ones with an activate block', () => {
    for (const a of Object.values(bundle.abilities).filter((x) => x.id.startsWith('slaanesh.'))) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })
})
