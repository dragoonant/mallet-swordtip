// Helsmiths of Hashut (Helforge Host) shipped data: docs/spec/factions/helsmiths-of-hashut.md §1, §5, §9 (HOH-ARMY-1, HOH-ARMY-3).
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { createGameState, ENGINE_VERSION, type GameSetup } from '../../src/engine'
import type { DataBundle, WeaponData } from '../../src/data/types'
import { buildDataIndex, checkSpearheadArmy } from '../../tools/validate-data'

const bundle: DataBundle = await loadBundle()
const ARMY = 'helsmiths.army.helforge-host'
const army = bundle.patrols[ARMY]

function realState() {
  const mission = bundle.missions['sph-fire-and-jade-aqshy-horizontal']
  const layout = bundle.terrainLayouts['sph-fire-and-jade-standard']
  const setup: GameSetup = {
    mode: 'spearhead', missionId: mission.id, terrainLayoutId: layout.id,
    players: {
      A: { name: 'Helsmiths', faction: 'helsmiths', patrolId: ARMY, enhancementId: 'helsmiths.enh.talisman-of-obsidian', regimentAbilityId: 'helsmiths.ability.suppressive-bombardment' },
      B: { name: 'Cities', faction: 'cities', patrolId: 'cities.army.castelite-company', enhancementId: 'cities.enh.heirloom-blade' },
    },
    sides: { attacker: 'A' }, firstTurn: 'A', dataVersion: 'data-test',
  }
  return createGameState(setup, bundle, 'data-test', ENGINE_VERSION)
}

const ds = (id: string) => bundle.datasheets[`helsmiths.unit.${id}`]
const wp = (id: string): WeaponData => bundle.weapons[`helsmiths.weapon.${id}`]
const row = (w: WeaponData) => [w.range, w.A, w.skill, w.wound, w.rend, w.D, w.abilities.map((a) => a.ability)]
const mm = (inches: number): number => Math.round(inches * 25.4 * 100) / 100

describe('HOH-ARMY roster', () => {
  it('HOH-ARMY-1 the Helforge Host builds: War Despot general + Dominator Engine + Tormentor Bombard + 2x5 Infernal Cohort, 13 models, stats, weapons and bases as printed', () => {
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.ref)).toEqual(['war-despot', 'dominator-engine', 'tormentor-bombard', 'infernal-cohort-gong', 'infernal-cohort'])
    expect(army.warlord).toBe('war-despot')
    expect(army.units.map((u) => u.size)).toEqual([1, 1, 1, 5, 5])
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(13)
    expect(army.battleTraits).toEqual(['helsmiths.ability.harness-daemonic-power'])
    expect(army.regimentAbilities?.map((r) => r.id)).toEqual(['helsmiths.ability.suppressive-bombardment', 'helsmiths.ability.grinding-advance'])
    expect(army.regimentAbilities?.find((r) => r.default)?.id).toBe('helsmiths.ability.suppressive-bombardment')
    expect(army.enhancements.map((e) => e.id)).toEqual([
      'helsmiths.enh.talisman-of-obsidian', 'helsmiths.enh.amulet-of-burning-hate', 'helsmiths.enh.chalice-of-darkness', 'helsmiths.enh.scroll-of-petrification',
    ])
    expect(army.enhancements.find((e) => e.default)?.id).toBe('helsmiths.enh.talisman-of-obsidian')
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])
    expect(bundle.factions.helsmiths.combatPatrols).toEqual([ARMY])

    expect(ds('war-despot').stats).toEqual({ M: 4, W: 6, Sv: 3, OC: 2 })
    expect(ds('dominator-engine').stats).toEqual({ M: 6, W: 10, Sv: 2, OC: 2 })
    expect(ds('tormentor-bombard').stats).toEqual({ M: 4, W: 8, Sv: 3, OC: 2 })
    expect(ds('infernal-cohort').stats).toEqual({ M: 4, W: 1, Sv: 3, OC: 1 })
    expect(ds('war-despot').keywords).toEqual(['HERO', 'INFANTRY'])
    expect(ds('dominator-engine').keywords).toEqual(['WAR MACHINE', 'REINFORCEMENTS'])
    expect(ds('tormentor-bombard').keywords).toEqual(['WAR MACHINE'])
    expect(ds('infernal-cohort').keywords).toEqual(['INFANTRY', 'REINFORCEMENTS'])
    // no Ward on any warscroll, nothing flies, no Wizard or Priest
    for (const u of army.units) {
      const d = bundle.datasheets[u.datasheet]
      expect((d.stats as { ward?: number }).ward, u.ref).toBeUndefined()
      expect(d.keywords, u.ref).not.toContain('FLY')
      expect(d.wizard, u.ref).toBeUndefined()
      expect(d.priest, u.ref).toBeUndefined()
    }

    expect(row(wp('daemonflame-glaive'))).toEqual([0, 5, 3, 3, 1, 2, ['CRIT_MORTAL']])
    expect(row(wp('immolation-cannons'))).toEqual([8, 5, 2, 4, 1, 'D3', ['SHOOT_IN_COMBAT']])
    expect(row(wp('horns-and-pummelling-strikes'))).toEqual([0, 3, 4, 3, 1, 'D3', []])
    expect(row(wp('torrent-of-ruinous-energy'))).toEqual([30, 4, 3, 3, 1, 'D3', ['ANTI', 'ANTI']])
    expect(wp('torrent-of-ruinous-energy').abilities.map((a) => a.keyword)).toEqual(['CAVALRY', 'INFANTRY'])
    expect(row(wp('artillerist-weapons'))).toEqual([0, 3, 4, 4, 0, 1, []])
    expect(row(wp('hashutite-spear'))).toEqual([0, 2, 3, 4, 0, 1, ['ANTI']])
    expect(wp('hashutite-spear').abilities[0].keyword).toBe('@charged')

    const s = realState()
    const mine = Object.values(s.units).filter((u) => u.player === 'A')
    expect(mine).toHaveLength(5)
    expect(mine.reduce((n, u) => n + u.models.length, 0)).toBe(13)
    expect(mine.find((u) => u.ref === 'war-despot')!.isWarlord).toBe(true)
    expect(mine.find((u) => u.ref === 'war-despot')!.enhancementId).toBe('helsmiths.enh.talisman-of-obsidian')
    expect(s.players.A.regimentAbilityId).toBe('helsmiths.ability.suppressive-bombardment')
    const base = (ref: string) => s.models[mine.find((u) => u.ref === ref)!.models[0]].base
    expect(mm(base('war-despot').radius * 2)).toBeCloseTo(32, 0)
    expect(mm(base('dominator-engine').radius * 2)).toBeCloseTo(80, 0)
    expect(mm(base('tormentor-bombard').radius * 2)).toBeCloseTo(100, 0)
    expect(mm(base('infernal-cohort').radius * 2)).toBeCloseTo(28.5, 0)
    // the two Cohorts share one warscroll
    expect(mine.filter((u) => u.datasheetId === 'helsmiths.unit.infernal-cohort')).toHaveLength(2)
    expect(s.models[mine.find((u) => u.ref === 'infernal-cohort')!.models[0]].weapons).toEqual(['helsmiths.weapon.hashutite-spear'])
  })

  it('HOH-ARMY-3 exactly one Cohort starts with one gong-carrier token; the other has none, and nothing else carries a token', () => {
    expect(army.units.filter((u) => u.tokens).map((u) => [u.ref, u.tokens])).toEqual([['infernal-cohort-gong', { 'gong-carrier': 1 }]])
    const s = realState()
    const tokens = (ref: string) => Object.values(s.units).find((u) => u.player === 'A' && u.ref === ref)!.tokens ?? {}
    expect(tokens('infernal-cohort-gong')).toEqual({ 'gong-carrier': 1 })
    expect(tokens('infernal-cohort')['gong-carrier'] ?? 0).toBe(0)
    for (const ref of ['war-despot', 'dominator-engine', 'tormentor-bombard']) expect(tokens(ref)['gong-carrier'] ?? 0, ref).toBe(0)
    // daemonic power starts at nothing
    for (const u of Object.values(s.units).filter((x) => x.player === 'A')) expect(u.tokens?.['daemonic-power'] ?? 0, u.ref).toBe(0)
  })
})
