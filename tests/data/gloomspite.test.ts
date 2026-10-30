// Gloomspite Gitz (Snarlpack Huntaz) shipped data against the Spearhead army rules (SPH-2, SPH-13.7) and the spec roster.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { codeHooks } from '../../src/engine/code-hooks'
import { buildDataIndex, checkSpearheadArmy } from '../../tools/validate-data'

const bundle = await loadBundle()
const army = bundle.patrols['gloomspite.army.snarlpack-huntaz']

describe('Gloomspite Gitz Snarlpack Huntaz data', () => {
  it('GLO-DATA-1 ships the roster of the spec: Snarlboss general, Wolfgit Retinue, 2 Snarlpack Cavalry, 2 Sunsteala Wheelas, 11 models', () => {
    expect(army).toBeDefined()
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.datasheet)).toEqual([
      'gloomspite.unit.snarlboss', 'gloomspite.unit.wolfgit-retinue', 'gloomspite.unit.snarlpack-cavalry', 'gloomspite.unit.snarlpack-cavalry',
      'gloomspite.unit.sunsteala-wheelas', 'gloomspite.unit.sunsteala-wheelas',
    ])
    expect(army.units.map((u) => u.size)).toEqual([1, 2, 3, 3, 1, 1])
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(11)
    expect(army.units.find((u) => u.ref === army.warlord)?.datasheet).toBe('gloomspite.unit.snarlboss')
    expect(army.battleTraits).toEqual(['gloomspite.ability.fast-as-frazzlegit'])
    expect(bundle.factions.gloomspite.combatPatrols).toEqual([army.id])
  })

  it('GLO-DATA-2 passes the Spearhead checks: 2 regiment abilities, 4 enhancements, spearhead warscrolls with Wound and Rend', () => {
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])
    expect(army.regimentAbilities!.map((r) => r.id)).toEqual(['gloomspite.ability.flankin-force', 'gloomspite.ability.frazzleboom'])
    expect(army.regimentAbilities!.filter((r) => r.default)).toHaveLength(1)
    expect(army.enhancements.map((e) => e.id)).toEqual([
      'gloomspite.enh.kunnin-as-a-snarlfang', 'gloomspite.enh.glare-of-frazzlegit', 'gloomspite.enh.sunsteala-shard', 'gloomspite.enh.devious-backstabba',
    ])
    for (const e of army.enhancements) {
      const enh = bundle.enhancements[e.id]
      expect(enh, e.id).toBeDefined()
      expect(bundle.abilities[enh.effect as string], e.id).toBeDefined()
    }
    for (const r of army.regimentAbilities!) expect(bundle.abilities[r.id], r.id).toBeDefined()
  })

  it('GLO-DATA-3 every ability code resolves to a registered hook; activated abilities carry an activate block', () => {
    const mine = Object.values(bundle.abilities).filter((x) => x.id.startsWith('gloomspite.'))
    expect(mine.length).toBeGreaterThan(10)
    for (const a of mine) {
      if (!a.code) continue
      expect(codeHooks[a.code], `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(codeHooks[a.code].activate, a.code).toBeDefined()
    }
  })

  it('GLO-DATA-4 no warscroll carries a Ward, a Wizard or a Priest, and every weapon is on a warscroll', () => {
    const used = new Set<string>()
    for (const u of army.units) {
      const ds = bundle.datasheets[u.datasheet]
      expect(ds.stats.ward, ds.id).toBeUndefined()
      expect(ds.wizard, ds.id).toBeUndefined()
      expect(ds.priest, ds.id).toBeUndefined()
      expect(ds.factionKeywords).toEqual(['DESTRUCTION', 'GLOOMSPITE GITZ'])
      for (const c of ds.composition) for (const w of c.weapons?.default ?? []) used.add(w)
    }
    const shipped = Object.keys(bundle.weapons).filter((id) => id.startsWith('gloomspite.'))
    expect([...used].sort()).toEqual(shipped.sort())
  })
})
