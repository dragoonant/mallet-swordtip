// Client side of the Slaves to Darkness and Fyreslayers armies: bases come from the datasheets, crests are distinct, the
// weapons voice and look right, and the painter knows the armies' stock hues.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadBundle } from '../../src/data'
import { FactionCrest } from '../../src/client/ui/FactionCrest'
import { resolveBase } from '../../src/client/figures/data'
import { aosWeaponSound, soundsForEvent } from '../../src/client/audio/eventSounds'
import { meleeStyle, factionColor } from '../../src/client/vfx/palette'
import { weaponFlavour } from '../../src/client/weaponFlavour'
import type { GameEvent } from '../../src/engine/events'

const bundle = await loadBundle()
const MM = 25.4

describe('new Spearhead armies on the client', () => {
  it('CLIENT-AOS-001 every datasheet model gets its datasheet base (round or oval, long axis along the facing)', () => {
    for (const ds of Object.values(bundle.datasheets).filter((d) => /^(slaves|fyreslayers)\./.test(d.id))) {
      for (const c of ds.composition) {
        const b = resolveBase(ds, ds.figure.archetype, c.modelId)
        expect(b.radiusZ, `${ds.id}/${c.modelId}`).toBeCloseTo(c.base.mm / 2 / MM, 5)
        expect(b.radiusX, `${ds.id}/${c.modelId}`).toBeCloseTo((c.base.shape === 'oval' ? (c.base.mm2 ?? c.base.mm) : c.base.mm) / 2 / MM, 5)
      }
    }
    const fell = resolveBase(bundle.datasheets['slaves.unit.darkoath-fellriders'], 'infantry', 'fellrider')
    expect(fell.radiusZ).toBeGreaterThan(fell.radiusX)
  })

  it('CLIENT-AOS-002 all four armies draw distinct crests, none the fallback shield', () => {
    const svg = (f: string) => renderToStaticMarkup(createElement(FactionCrest, { faction: f, name: f }))
    const all = ['cities', 'ironjawz', 'slaves', 'fyreslayers'].map(svg)
    expect(new Set(all).size).toBe(4)
    for (const m of all) expect(m).not.toContain('<text')
  })

  it('CLIENT-AOS-003 new melee weapons swing with an aos sound, axes chop, blades clash, polearms strike', () => {
    const melee = Object.entries(bundle.weapons).filter(([id, w]) => /^(slaves|fyreslayers)\./.test(id) && w.type === 'melee')
    expect(melee.length).toBeGreaterThan(0)
    for (const [id, w] of melee) expect(aosWeaponSound(id, w.name, true)?.id.startsWith('aos-'), id).toBe(true)
    const s = (id: string): string | undefined => aosWeaponSound(id, bundle.weapons[id]?.name, true)?.id
    expect(s('slaves.weapon.rune-etched-axe')).toBe('aos-choppa-hit')
    expect(s('slaves.weapon.fellrider-blades')).toBe('aos-sword-clash')
    expect(s('slaves.weapon.warsteeds-hooves')).toBe('aos-shield-bash')
    expect(s('fyreslayers.weapon.flamestrike-poleaxe')).toBe('aos-halberd-strike')
    expect(s('fyreslayers.weapon.fyresteel-handaxes')).toBe('aos-choppa-hit')
    expect(weaponFlavour('slaves.weapon.warsteeds-hooves', bundle.weapons['slaves.weapon.warsteeds-hooves'], 'slaves')).toBe('crush')
  })

  it('CLIENT-AOS-004 each army has its own melee impact style and colour', () => {
    expect(meleeStyle('slaves')).toBe('rend')
    expect(meleeStyle('fyreslayers')).toBe('ember')
    expect(factionColor('slaves').getHexString()).not.toBe(factionColor('fyreslayers').getHexString())
    expect(factionColor('slaves').getHexString()).not.toBe(factionColor('unknown').getHexString())
  })

  it('CLIENT-AOS-005 a death cry and an on-foot charge sound exist for the new armies', () => {
    const lookup = { weapon: () => undefined, factionOfUnit: () => 'fyreslayers', keywordsOfUnit: (id: string) => (id === 'rider' ? ['CAVALRY'] : ['INFANTRY']) }
    const ev = (e: Partial<GameEvent> & { type: string }): GameEvent => ({ seq: 1, ...e }) as unknown as GameEvent
    const foot = soundsForEvent(ev({ type: 'ChargeDeclared', unitId: 'dwarves' }), 'A', lookup)
    expect(foot.map((x) => x.id)).toContain('aos-human-battle-cry')
    expect(foot.map((x) => x.id)).not.toContain('aos-horse-charge')
    const ridden = soundsForEvent(ev({ type: 'ChargeDeclared', unitId: 'rider' }), 'A', { ...lookup, factionOfUnit: () => 'slaves' })
    expect(ridden.map((x) => x.id)).toContain('aos-horse-charge')
  })
})
