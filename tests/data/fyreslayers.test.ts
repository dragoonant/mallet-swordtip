// Fyreslayers (Saga Axeband) shipped data against the Spearhead army rules (SPH-2, SPH-13.7) and the spec roster.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { codeHooks } from '../../src/engine/code-hooks'
import { buildDataIndex, checkSpearheadArmy } from '../../tools/validate-data'

const bundle = await loadBundle()
const army = bundle.patrols['fyreslayers.army.saga-axeband']

describe('Fyreslayers Saga Axeband data', () => {
  it('FYR-ARMY-1 ships the roster of the spec: Battlesmith general, 1 Hearthguard, 4 Vulkite units, 26 models', () => {
    expect(army).toBeDefined()
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.datasheet)).toEqual([
      'fyreslayers.unit.battlesmith', 'fyreslayers.unit.hearthguard-berzerkers', ...Array(4).fill('fyreslayers.unit.vulkite-berzerkers'),
    ])
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(26)
    expect(army.units.find((u) => u.ref === army.warlord)?.datasheet).toBe('fyreslayers.unit.battlesmith')
    expect(army.battleTraits).toEqual(['fyreslayers.ability.awaken-the-runes'])
  })

  it('FYR-ARMY-1 the army passes the Spearhead checks: 2 regiment abilities, 4 enhancements, spearhead warscrolls with Wound and Rend', () => {
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])
    expect(army.regimentAbilities).toHaveLength(2)
    expect(army.regimentAbilities!.filter((r) => r.default)).toHaveLength(1)
    expect(army.enhancements).toHaveLength(4)
    for (const e of army.enhancements) {
      const enh = bundle.enhancements[e.id]
      expect(enh, e.id).toBeDefined()
      expect(bundle.abilities[enh.effect as string], e.id).toBeDefined()
    }
    for (const r of army.regimentAbilities!) expect(bundle.abilities[r.id], r.id).toBeDefined()
  })

  it('FYR-ARMY-2 no warscroll prints Reinforcements, and every warscroll prints Ward (6+)', () => {
    for (const u of army.units) {
      const ds = bundle.datasheets[u.datasheet]
      expect(ds.keywords).not.toContain('REINFORCEMENTS')
      expect(ds.stats.ward).toBe(6)
    }
  })

  it('FYR-REG every ability code resolves to a registered hook; activated abilities carry an activate block', () => {
    for (const a of Object.values(bundle.abilities).filter((x) => x.id.startsWith('fyreslayers.'))) {
      if (!a.code) continue
      expect(codeHooks[a.code], `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(codeHooks[a.code].activate, a.code).toBeDefined()
    }
  })
})
