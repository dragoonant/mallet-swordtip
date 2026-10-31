// Client side of the F12 armies (Stormcast Eternals, Skaven, Seraphon, Soulblight Gravelords): datasheet bases, original crests, start-screen
// grouping and blurbs, stand-in figures, weapon looks and the prompt titles. Named by client check id (CLIENT-F12-*).
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadBundle } from '../../src/data'
import { FactionCrest } from '../../src/client/ui/FactionCrest'
import { FACTION_ALLIANCE, FACTION_BLURBS, OPTION_BLURBS } from '../../src/client/ui/StartScreen'
import { regimentChoices, spearheadArmies } from '../../src/client/store/game'
import { resolveBase, resolveFigureKit } from '../../src/client/figures/data'
import { glbSlugFor } from '../../src/client/figures/glbModels'
import { aosWeaponSound } from '../../src/client/audio/eventSounds'
import { factionColor, meleeStyle } from '../../src/client/vfx/palette'
import { classifyVfxFamily, weaponFlavour } from '../../src/client/weaponFlavour'
import { SOURCE_HUES } from '../../src/client/figures/glbPaint'

const bundle = await loadBundle()
const MM = 25.4
const NEW = ['stormcast', 'skaven', 'seraphon', 'soulblight'] as const
const NEW_ID = /^(stormcast|skaven|seraphon|soulblight)\./
const ALL12 = ['cities', 'ironjawz', 'slaves', 'fyreslayers', 'kruleboyz', 'gloomspite', 'lumineth', 'kharadron', ...NEW]

describe('F12 armies on the client', () => {
  it('CLIENT-F12-001 every datasheet model of the four new armies gets its datasheet base, round or oval, long axis along the facing', () => {
    let seen = 0
    for (const ds of Object.values(bundle.datasheets).filter((d) => NEW_ID.test(d.id))) {
      for (const c of ds.composition) {
        const b = resolveBase(ds, ds.figure.archetype, c.modelId)
        expect(b.radiusZ, `${ds.id}/${c.modelId}`).toBeCloseTo(c.base.mm / 2 / MM, 5)
        expect(b.radiusX, `${ds.id}/${c.modelId}`).toBeCloseTo((c.base.shape === 'oval' ? (c.base.mm2 ?? c.base.mm) : c.base.mm) / 2 / MM, 5)
        expect(b.height, `${ds.id}/${c.modelId}`).toBeGreaterThan(0.8)
        seen++
      }
    }
    expect(seen).toBeGreaterThanOrEqual(19)
    const cannon = resolveBase(bundle.datasheets['skaven.unit.warp-lightning-cannon'], 'vehicle', 'warp-lightning-cannon')
    expect(cannon.radiusZ).toBeCloseTo(120 / 2 / MM, 5)
    expect(cannon.radiusX).toBeCloseTo(92 / 2 / MM, 5)
    const stalker = resolveBase(bundle.datasheets['stormcast.unit.lord-vigilant'], 'monster', 'lord-vigilant')
    expect(stalker.radiusZ).toBeGreaterThan(stalker.radiusX)
    const sunblood = bundle.datasheets['seraphon.unit.sunblood-pack']
    expect(resolveBase(sunblood, 'infantry', 'sunblood').radiusZ).toBeCloseTo(40 / 2 / MM, 5)
    expect(resolveBase(sunblood, 'infantry', 'bodyguard').radiusZ).toBeCloseTo(32 / 2 / MM, 5)
  })

  it('CLIENT-F12-002 all twelve armies draw distinct original crests, none the fallback shield, and each has a blurb and a Grand Alliance', () => {
    const svg = (f: string) => renderToStaticMarkup(createElement(FactionCrest, { faction: f, name: f }))
    const all = ALL12.map(svg)
    expect(new Set(all).size).toBe(12)
    for (const m of all) expect(m).not.toContain('<text')
    for (const f of ALL12) {
      expect(FACTION_BLURBS[f]?.length, f).toBeGreaterThan(40)
      expect(FACTION_ALLIANCE[f], f).toBeDefined()
    }
    expect(FACTION_ALLIANCE.stormcast).toBe('Order')
    expect(FACTION_ALLIANCE.skaven).toBe('Chaos')
    expect(FACTION_ALLIANCE.seraphon).toBe('Order')
    expect(FACTION_ALLIANCE.soulblight).toBe('Death')
    expect(svg('nobody')).toContain('<text')
  })

  it('CLIENT-F12-003 every regiment ability and enhancement of the four new armies has an own-words card blurb', () => {
    const armies = spearheadArmies(bundle).filter((a) => (NEW as readonly string[]).includes(a.faction))
    expect(armies).toHaveLength(4)
    for (const a of armies) {
      expect(regimentChoices(bundle, a)).toHaveLength(2)
      expect(a.enhancements).toHaveLength(4)
      for (const r of regimentChoices(bundle, a)) expect(OPTION_BLURBS[r.id], r.id).toBeTruthy()
      for (const e of a.enhancements) expect(OPTION_BLURBS[e.id], e.id).toBeTruthy()
    }
  })

  it('CLIENT-F12-004 every model of the four new armies has a stand-in kit and a GLB slug', () => {
    for (const ds of Object.values(bundle.datasheets).filter((d) => NEW_ID.test(d.id))) {
      expect(resolveFigureKit(ds.id, ds, ds.composition[0].modelId).kit, ds.id).not.toMatch(/^generic-/)
      for (const c of ds.composition) expect(glbSlugFor(ds.id, c.modelId), `${ds.id}/${c.modelId}`).toBeDefined()
    }
  })

  it('CLIENT-F12-005 every weapon of the four new armies has a swing or shot sound', () => {
    const weapons = Object.entries(bundle.weapons).filter(([id]) => NEW_ID.test(id))
    expect(weapons.length).toBeGreaterThanOrEqual(25)
    for (const [id, w] of weapons) expect(aosWeaponSound(id, w.name, w.type === 'melee'), id).toBeDefined()
  })

  it('CLIENT-F12-006 lightning, warp lightning, ratling fire, windlaunchers and dartpipes each draw their own tracer look', () => {
    const w = (id: string) => bundle.weapons[id]
    const fam = (id: string, f: string) => classifyVfxFamily(id, w(id), f)
    expect(fam('stormcast.weapon.stormcall-javelin-ranged', 'stormcast')).toEqual({ family: 'pulse', via: 'keyword' })
    expect(fam('skaven.weapon.warp-lightning-blast', 'skaven')).toEqual({ family: 'psychic', via: 'keyword' })
    expect(fam('skaven.weapon.ratling-cannons', 'skaven')).toEqual({ family: 'dakka', via: 'keyword' })
    expect(fam('skaven.weapon.windlaunchers', 'skaven')).toEqual({ family: 'grenade', via: 'keyword' })
    expect(fam('seraphon.weapon.dartpipe', 'seraphon')).toEqual({ family: 'bio', via: 'keyword' })
    expect(fam('seraphon.weapon.glob-of-flame-acid', 'seraphon').via).toBe('keyword')
    expect(weaponFlavour('stormcast.weapon.stormcall-javelin-ranged', w('stormcast.weapon.stormcall-javelin-ranged'), 'stormcast')).toBe('psychic')
    expect(weaponFlavour('skaven.weapon.ratling-cannons', w('skaven.weapon.ratling-cannons'), 'skaven')).toBe('shoota')
    expect(weaponFlavour('seraphon.weapon.dartpipe', w('seraphon.weapon.dartpipe'), 'seraphon')).toBe('shoota')
    expect(weaponFlavour('stormcast.weapon.warhammer', w('stormcast.weapon.warhammer'), 'stormcast')).toBe('crush')
    expect(weaponFlavour('skaven.weapon.shock-gauntlets', w('skaven.weapon.shock-gauntlets'), 'skaven')).toBe('crush')
    // with no faction given the id prefix still finds the army
    expect(classifyVfxFamily('skaven.weapon.windlaunchers', w('skaven.weapon.windlaunchers'), '').family).toBe('grenade')
    // every ranged weapon of the four armies is classified by a keyword, never the default bolt
    for (const [id, wd] of Object.entries(bundle.weapons).filter(([id]) => NEW_ID.test(id))) {
      if (wd.type === 'ranged') expect(classifyVfxFamily(id, wd, id.split('.')[0]).via, id).toBe('keyword')
    }
  })

  it('CLIENT-F12-007 each army has its own melee impact colour and style, and the painter has measured hues for it', () => {
    const hex = [...ALL12].map((f) => factionColor(f).getHexString())
    expect(new Set(hex).size).toBe(12)
    for (const f of NEW) {
      expect(factionColor(f).getHexString(), f).not.toBe(factionColor('unknown').getHexString())
      expect(SOURCE_HUES[f].major, f).toMatch(/^#[0-9a-f]{6}$/)
      expect(SOURCE_HUES[f].minor, f).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(meleeStyle('stormcast')).toBe('spark')
    expect(meleeStyle('skaven')).toBe('rend')
    expect(meleeStyle('seraphon')).toBe('chop')
    expect(meleeStyle('soulblight')).toBe('blade')
  })
})
