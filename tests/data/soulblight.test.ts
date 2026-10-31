// Soulblight Gravelords (Bloodcrave Hunt) shipped data: docs/spec/factions/soulblight-gravelords.md §1, §2, §3, §4, §5, §7.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { codeHooks } from '../../src/engine/code-hooks'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy, validateAllData } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'soulblight.army.bloodcrave-hunt'
const army = bundle.patrols[ARMY]

function realState(enhancementId: string, regimentAbilityId: string) {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Soulblight', faction: 'soulblight', patrolId: ARMY, enhancementId, regimentAbilityId },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`soulblight.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`soulblight.weapon.${id}`]
const row = (w: WeaponData) => [w.type, w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]

describe('SBG-DATA shipped data', () => {
  it('SBG-DATA-1 the army passes the Spearhead checks: 2 regiment abilities, 4 enhancements, a reserve entry for the Vargheists, every id resolves, every file validates', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['vampire-lord', 'skeletons-a', 'skeletons-b', 'blood-knights', 'vargheists'])
    expect(army.units.map((u) => u.size)).toEqual([1, 10, 10, 5, 3])
    expect(army.warlord).toBe('vampire-lord')
    expect(army.battleTraits).toEqual(['soulblight.ability.deaths-descent', 'soulblight.ability.the-hunger'])
    expect(bundle.factions.soulblight.armyRule).toBe('soulblight.ability.bloodcrave-hunt')
    expect(bundle.factions.soulblight.combatPatrols).toEqual([ARMY])
    expect(army.units.find((u) => u.ref === 'vargheists')?.reserve).toEqual({ ability: 'soulblight.ability.swoop-down' })
    expect(army.units.filter((u) => u.reserve)).toHaveLength(1)
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])
    expect(army.regimentAbilities!.map((r) => r.id).sort()).toEqual(['soulblight.ability.endless-legions', 'soulblight.ability.ruinous-chargers'])
    expect(army.regimentAbilities!.filter((r) => r.default)).toHaveLength(1)
    expect(army.enhancements.map((e) => e.id).sort()).toEqual(['soulblight.enh.aura-of-night', 'soulblight.enh.cloud-of-bats', 'soulblight.enh.grave-sand-shard', 'soulblight.enh.spirit-gale'])
    for (const e of army.enhancements) expect(bundle.abilities[bundle.enhancements[e.id].effect as string], e.id).toBeDefined()
    for (const r of army.regimentAbilities!) expect(bundle.abilities[r.id], r.id).toBeDefined()
    for (const d of Object.values(bundle.datasheets).filter((x) => x.faction === 'soulblight')) for (const a of d.abilities) expect(bundle.abilities[a as string], String(a)).toBeDefined()
    expect(validateAllData().filter((r) => r.file.startsWith('factions/soulblight/') && !r.ok)).toEqual([])
    // every ability code resolves to a hook; activated ones carry an activate block
    for (const a of Object.values(bundle.abilities).filter((x) => x.id.startsWith('soulblight.'))) {
      if (!a.code) continue
      expect(codeHooks[a.code], `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(codeHooks[a.code].activate, a.code).toBeDefined()
    }
  })

  it('SBG-DATA-2 warscrolls: stats, keywords, Ward (6+) on all four, Wizard only on the Lord, Fly only on the Vargheists, no Reinforcements', () => {
    expect(ds('vampire-lord').stats).toEqual({ M: 6, W: 5, Sv: 3, OC: 2, ward: 6 })
    expect(ds('deathrattle-skeletons').stats).toEqual({ M: 4, W: 1, Sv: 5, OC: 1, ward: 6 })
    expect(ds('blood-knights').stats).toEqual({ M: 10, W: 3, Sv: 3, OC: 1, ward: 6 })
    expect(ds('vargheists').stats).toEqual({ M: 12, W: 4, Sv: 5, OC: 1, ward: 6 })
    expect(ds('vampire-lord').keywords).toEqual(['HERO', 'WIZARD', 'INFANTRY', 'VAMPIRE'])
    expect(ds('deathrattle-skeletons').keywords).toEqual(['INFANTRY'])
    expect(ds('blood-knights').keywords).toEqual(['CAVALRY', 'VAMPIRE'])
    expect(ds('vargheists').keywords).toEqual(['INFANTRY', 'VAMPIRE', 'FLY'])
    for (const u of army.units) expect(bundle.datasheets[u.datasheet].keywords).not.toContain('REINFORCEMENTS')
    expect(ds('vampire-lord').abilities).toEqual(['soulblight.ability.vile-transference'])
    expect(ds('deathrattle-skeletons').abilities).toEqual(['soulblight.ability.skeleton-legion'])
    expect(ds('blood-knights').abilities).toEqual(['soulblight.ability.riders-of-ruin'])
    expect(ds('vargheists').abilities).toEqual(['soulblight.ability.the-scent-of-gore'])
    // the two Skeleton units share one warscroll
    expect(army.units.filter((u) => u.datasheet === 'soulblight.unit.deathrattle-skeletons')).toHaveLength(2)
  })

  it('SBG-DATA-3 weapon profiles: Type / Range / Attacks / Hit / Wound / Rend / Damage / abilities', () => {
    expect(row(wp('dynastic-war-relic'))).toEqual(['melee', 0, 5, 3, 3, 1, 2, []])
    expect(row(wp('ancient-weapon'))).toEqual(['melee', 0, 2, 4, 4, 0, 1, []])
    expect(row(wp('templar-lance-or-blade'))).toEqual(['melee', 0, 3, 3, 3, 1, 1, ['CHARGE_DAMAGE']])
    expect(wp('templar-lance-or-blade').abilities[0]).toMatchObject({ ability: 'CHARGE_DAMAGE', value: 1 })
    expect(row(wp('nightmares-hooves-and-teeth'))).toEqual(['melee', 0, 3, 5, 3, 0, 1, ['COMPANION']])
    expect(row(wp('murderous-fangs-and-talons'))).toEqual(['melee', 0, 3, 4, 3, 1, 2, ['CRIT_2_HITS']])
  })

  it('SBG-DATA-4 the real game builds with every regiment ability and enhancement: the Vargheists in reserve, 29 models, the general bears the enhancement', () => {
    for (const reg of ['soulblight.ability.endless-legions', 'soulblight.ability.ruinous-chargers']) {
      for (const enh of army.enhancements.map((e) => e.id)) {
        const s = realState(enh, reg)
        const mine = Object.values(s.units).filter((u) => u.player === 'A')
        expect(mine).toHaveLength(5)
        expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(29)
        expect(mine.find((u) => u.ref === 'vampire-lord')!.isWarlord).toBe(true)
        expect(mine.find((u) => u.ref === 'vampire-lord')!.enhancementId).toBe(enh)
        expect(s.players.A.regimentAbilityId).toBe(reg)
        expect(s.units['A:vargheists'].location).toBe('reserves')
        expect(s.units['A:vargheists'].reserveArrival).toBe('soulblight.ability.swoop-down')
      }
    }
  })
})
