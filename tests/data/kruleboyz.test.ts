// Kruleboyz (Swampskulka Gang) shipped data against the Spearhead army rules (SPH-2, SPH-13.7) and the spec roster.
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { codeHooks } from '../../src/engine/code-hooks'
import { buildDataIndex, checkSpearheadArmy } from '../../tools/validate-data'

const bundle = await loadBundle()
const army = bundle.patrols['kruleboyz.army.swampskulka-gang']

describe('Kruleboyz Swampskulka Gang data', () => {
  it('KRU-ARMY-1 ships the roster of the spec: Killaboss general, Murknob, 3 Boltboyz, 2 x 5 Gutrippaz, Killbow; 16 models', () => {
    expect(army).toBeDefined()
    expect(army.mode).toBe('spearhead')
    expect(army.units.map((u) => u.datasheet)).toEqual([
      'kruleboyz.unit.killaboss-on-great-gnashtoof', 'kruleboyz.unit.murknob-with-belcha-banna', 'kruleboyz.unit.man-skewer-boltboyz',
      'kruleboyz.unit.gutrippaz', 'kruleboyz.unit.gutrippaz', 'kruleboyz.unit.beast-skewer-killbow',
    ])
    expect(army.units.reduce((n, u) => n + u.size, 0)).toBe(16)
    expect(army.units.find((u) => u.ref === army.warlord)?.datasheet).toBe('kruleboyz.unit.killaboss-on-great-gnashtoof')
    expect(army.battleTraits).toEqual(['kruleboyz.ability.kruleboyz-waaagh'])
    expect(bundle.factions.kruleboyz.armyRule).toBe('kruleboyz.ability.swampskulka-gang')
  })

  it('KRU-ARMY-1 the army passes the Spearhead checks: 2 regiment abilities, 4 enhancements, spearhead warscrolls with Wound and Rend', () => {
    expect(checkSpearheadArmy(army, buildDataIndex())).toEqual([])
    expect(army.regimentAbilities).toHaveLength(2)
    expect(army.regimentAbilities!.filter((r) => r.default)).toHaveLength(1)
    expect(army.regimentAbilities!.map((r) => r.id).sort()).toEqual(['kruleboyz.ability.covered-in-mud', 'kruleboyz.ability.noisy-racket'])
    expect(army.enhancements).toHaveLength(4)
    expect(army.enhancements.map((e) => e.id).sort()).toEqual(['kruleboyz.enh.egomaniak', 'kruleboyz.enh.eye-biter-ash', 'kruleboyz.enh.kunnin-plan', 'kruleboyz.enh.morks-eye-pebble'])
    for (const e of army.enhancements) {
      const enh = bundle.enhancements[e.id]
      expect(enh, e.id).toBeDefined()
      expect(bundle.abilities[enh.effect as string], e.id).toBeDefined()
    }
    for (const r of army.regimentAbilities!) expect(bundle.abilities[r.id], r.id).toBeDefined()
  })

  it('KRU-ARMY-2 no warscroll prints Reinforcements, a Ward or the Monster keyword', () => {
    for (const u of army.units) {
      const ds = bundle.datasheets[u.datasheet]
      expect(ds.keywords).not.toContain('REINFORCEMENTS')
      expect(ds.keywords).not.toContain('MONSTER')
      expect(ds.stats.ward ?? null).toBeNull()
    }
  })

  it('KRU-REG every ability code resolves to a registered hook; activated abilities carry an activate block', () => {
    for (const a of Object.values(bundle.abilities).filter((x) => x.id.startsWith('kruleboyz.'))) {
      if (!a.code) continue
      expect(codeHooks[a.code], `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(codeHooks[a.code].activate, a.code).toBeDefined()
    }
  })
})
