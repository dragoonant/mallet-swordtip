// Lumineth Realm-lords (Hurakan Vanguard) shipped data against the Spearhead army rules (SPH-2, SPH-13.7) and the spec roster.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { codeHooks } from '../../src/engine/code-hooks'
import { buildDataIndex, checkSpearheadArmy } from '../../tools/validate-data'

const bundle = await loadBundle()
const army = bundle.patrols['lumineth.army.hurakan-vanguard']

describe('Lumineth Hurakan Vanguard data', () => {
  it('LRL-ARMY-1 ships the roster of the spec: Windmage general, Windchargers (5), Wardens (10), Spirit of the Wind (1), 17 models', () => {
    expect(army).toBeDefined()
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => [u.ref, u.datasheet, u.size])).toEqual([
      ['windmage', 'lumineth.unit.hurakan-windmage', 1],
      ['windchargers', 'lumineth.unit.hurakan-windchargers', 5],
      ['wardens', 'lumineth.unit.vanari-auralan-wardens', 10],
      ['spirit', 'lumineth.unit.hurakan-spirit-of-the-wind', 1],
    ])
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(17)
    expect(army.units.find((u) => u.ref === army.warlord)?.datasheet).toBe('lumineth.unit.hurakan-windmage')
    expect(army.battleTraits).toEqual(['lumineth.ability.storm-brewing', 'lumineth.ability.pulled-by-the-winds', 'lumineth.ability.gale-force'])
    expect(bundle.factions.lumineth.combatPatrols).toEqual([army.id])
  })

  it('LRL-ARMY-1 the army passes the Spearhead checks: 2 regiment abilities, 4 enhancements, spearhead warscrolls with Wound and Rend', () => {
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])
    expect(army.regimentAbilities!.map((r) => r.id).sort()).toEqual(['lumineth.ability.lifted-debris', 'lumineth.ability.roaring-headwind'])
    expect(army.enhancements.map((e) => e.id).sort()).toEqual([
      'lumineth.enh.curved-shots', 'lumineth.enh.scattered-to-the-winds', 'lumineth.enh.temple-guardians', 'lumineth.enh.wind-whisperer',
    ])
    for (const e of army.enhancements) {
      const enh = bundle.enhancements[e.id]
      expect(enh, e.id).toBeDefined()
      expect(bundle.abilities[enh.effect as string], e.id).toBeDefined()
    }
    for (const id of [...army.battleTraits!, ...army.regimentAbilities!.map((r) => r.id)]) expect(bundle.abilities[id], id).toBeDefined()
  })

  it('LRL-ARMY-2 only the Wardens print Reinforcements', () => {
    for (const u of army.units) {
      const ds = bundle.datasheets[u.datasheet]
      expect(ds.keywords.includes('REINFORCEMENTS'), u.datasheet).toBe(u.datasheet === 'lumineth.unit.vanari-auralan-wardens')
    }
  })

  it('LRL-ARMY-1 keywords, Wizard power level and printed Ward', () => {
    const ds = (id: string) => bundle.datasheets[`lumineth.unit.${id}`]
    expect(ds('hurakan-windmage').keywords).toEqual(['HERO', 'WIZARD', 'INFANTRY', 'FLY'])
    expect(ds('hurakan-windmage').wizard).toBe(1)
    expect(ds('hurakan-spirit-of-the-wind').keywords).toEqual(['MONSTER', 'FLY'])
    expect(ds('hurakan-spirit-of-the-wind').stats.ward).toBe(5)
    expect(ds('hurakan-windchargers').keywords).toEqual(['CAVALRY'])
    expect(ds('vanari-auralan-wardens').keywords).toEqual(['INFANTRY', 'REINFORCEMENTS'])
    for (const id of ['hurakan-windmage', 'hurakan-windchargers', 'vanari-auralan-wardens']) expect(ds(id).stats.ward ?? null).toBeNull()
  })

  it('LRL-WEAP-1 weapon abilities: Anti-charge and Crit (Mortal) on the Pike, Companion on the Claws, nothing else', () => {
    const w = (id: string) => bundle.weapons[`lumineth.weapon.${id}`]
    expect(w('warden-pike-and-blade').abilities).toEqual([{ ability: 'ANTI', keyword: '@charged', value: 1 }, { ability: 'CRIT_MORTAL' }])
    expect(w('treerunners-claws').abilities).toEqual([{ ability: 'COMPANION' }])
    for (const id of ['windblast-vortex', 'aspiragillum', 'bow-of-the-winds-vengeance', 'swirling-shards', 'windcharger-bow', 'windcharger-blade']) expect(w(id).abilities, id).toEqual([])
  })

  it('LRL-REG every ability code resolves to a registered hook; activated abilities carry an activate block, Spell has a casting value', () => {
    for (const a of Object.values(bundle.abilities).filter((x) => x.id.startsWith('lumineth.'))) {
      if (!a.code) continue
      expect(codeHooks[a.code], `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(codeHooks[a.code].activate, a.code).toBeDefined()
      if (a.keywords?.includes('SPELL')) expect(a.castingValue, a.id).toBe(6)
    }
  })
})
