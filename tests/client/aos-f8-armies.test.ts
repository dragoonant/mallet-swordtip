// Client side of the F8 armies (Kruleboyz, Gloomspite Gitz, Lumineth Realm-lords, Kharadron Overlords): datasheet bases, original crests,
// start-screen blurbs, stand-in figures, weapon voices and looks, and the prompt titles for their ability decisions.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadBundle } from '../../src/data'
import { FactionCrest } from '../../src/client/ui/FactionCrest'
import { FACTION_BLURBS, OPTION_BLURBS } from '../../src/client/ui/StartScreen'
import { chooseOptionInfoFor } from '../../src/client/ui/DecisionPrompt'
import { regimentChoices, spearheadArmies } from '../../src/client/store/game'
import { resolveBase, resolveFigureKit } from '../../src/client/figures/data'
import { aosWeaponSound, soundsForEvent } from '../../src/client/audio/eventSounds'
import { factionColor, meleeStyle } from '../../src/client/vfx/palette'
import { classifyVfxFamily, weaponFlavour } from '../../src/client/weaponFlavour'
import type { GameEvent } from '../../src/engine/events'
import type { GameState } from '../../src/engine/types'

const bundle = await loadBundle()
const MM = 25.4
const NEW = ['kruleboyz', 'gloomspite', 'lumineth', 'kharadron'] as const
const NEW_ID = /^(kruleboyz|gloomspite|lumineth|kharadron)\./
const ALL = ['cities', 'ironjawz', 'slaves', 'fyreslayers', ...NEW]

describe('F8 armies on the client', () => {
  it('CLIENT-F8-001 every datasheet model of the four new armies gets its datasheet base (round or oval, long axis along the facing)', () => {
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
    const frigate = resolveBase(bundle.datasheets['kharadron.unit.arkanaut-frigate'], 'vehicle', 'frigate')
    expect(frigate.radiusZ).toBeGreaterThan(frigate.radiusX)
    const wolfgit = resolveBase(bundle.datasheets['gloomspite.unit.wolfgit-retinue'], 'monster', 'wolfgit-bow')
    expect(wolfgit.radiusZ).toBeCloseTo(60 / 2 / MM, 5)
    expect(wolfgit.radiusX).toBeCloseTo(35 / 2 / MM, 5)
  })

  it('CLIENT-F8-002 all eight armies draw distinct original crests, none the fallback shield, and each has a start-screen blurb', () => {
    const svg = (f: string) => renderToStaticMarkup(createElement(FactionCrest, { faction: f, name: f }))
    const all = ALL.map(svg)
    expect(new Set(all).size).toBe(8)
    for (const m of all) expect(m).not.toContain('<text')
    for (const f of ALL) expect(FACTION_BLURBS[f]?.length, f).toBeGreaterThan(40)
    expect(svg('nobody')).toContain('<text')
  })

  it('CLIENT-F8-003 every regiment ability and enhancement of the four new armies has an own-words card blurb', () => {
    const armies = spearheadArmies(bundle).filter((a) => (NEW as readonly string[]).includes(a.faction))
    expect(armies).toHaveLength(4)
    for (const a of armies) {
      for (const r of regimentChoices(bundle, a)) expect(OPTION_BLURBS[r.id], r.id).toBeTruthy()
      for (const e of a.enhancements) expect(OPTION_BLURBS[e.id], e.id).toBeTruthy()
    }
  })

  it('CLIENT-F8-004 every datasheet of the four new armies has a stand-in figure kit until its GLB loads', () => {
    for (const ds of Object.values(bundle.datasheets).filter((d) => NEW_ID.test(d.id))) {
      const kit = resolveFigureKit(ds.id, ds, ds.composition[0].modelId).kit
      expect(kit, ds.id).not.toMatch(/^generic-/)
    }
    expect(resolveFigureKit('kharadron.unit.arkanaut-company-gunners', undefined, 'arkanaut-volley').kit).not.toBe(resolveFigureKit('kharadron.unit.arkanaut-company-gunners', undefined, 'arkanaut').kit)
  })

  it('CLIENT-F8-005 every weapon of the four new armies has a swing or shot sound from the existing palette', () => {
    const weapons = Object.entries(bundle.weapons).filter(([id]) => NEW_ID.test(id))
    expect(weapons.length).toBeGreaterThanOrEqual(30)
    for (const [id, w] of weapons) {
      const s = aosWeaponSound(id, w.name, w.type === 'melee')
      expect(s, id).toBeDefined()
      expect(s!.id, id).toBeTruthy()
    }
    const s = (id: string): string | undefined => aosWeaponSound(id, bundle.weapons[id]?.name, bundle.weapons[id]?.type === 'melee')?.id
    expect(s('kruleboyz.weapon.man-skewer-crossbow')).toBe('guardian-spear-shot')
    expect(s('gloomspite.weapon.grot-bow')).toBe('guardian-spear-shot')
    expect(s('lumineth.weapon.windcharger-bow')).toBe('guardian-spear-shot')
    expect(s('kharadron.weapon.aethermatic-volley-gun')).toBe('burst-cannon-whir')
    expect(s('kharadron.weapon.light-skyhook')).toBe('wpn-hunter-killer-missile')
    expect(s('kharadron.weapon.heavy-skyhook')).toBe('aos-cannon-fire')
    expect(s('kharadron.weapon.privateer-pistol')).toBe('wpn-slugga')
    expect(s('lumineth.weapon.windblast-vortex')).toBe('psychic-zap')
    expect(s('lumineth.weapon.warden-pike-and-blade')).toBe('aos-halberd-strike')
    expect(s('kruleboyz.weapon.wicked-hacka')).toBe('aos-choppa-hit')
    expect(s('kruleboyz.weapon.jaggedy-blade')).toBe('aos-sword-clash')
    expect(s('kharadron.weapon.skalfhammer')).toBe('aos-fist-smash')
    expect(s('gloomspite.weapon.snarlfang-jaws')).toBe('aos-fist-smash')
    expect(s('kharadron.weapon.skypike')).toBe('aos-halberd-strike')
  })

  it('CLIENT-F8-006 new ranged weapons draw their own tracer look: crossbow bolts, aether guns, wind magic', () => {
    const w = (id: string) => bundle.weapons[id]
    const fam = (id: string, f: string) => classifyVfxFamily(id, w(id), f).family
    expect(fam('kruleboyz.weapon.man-skewer-crossbow', 'kruleboyz')).toBe('bolt')
    expect(weaponFlavour('kruleboyz.weapon.man-skewer-crossbow', w('kruleboyz.weapon.man-skewer-crossbow'), 'kruleboyz')).toBe('shoota')
    expect(fam('kharadron.weapon.aethermatic-volley-gun', 'kharadron')).toBe('dakka')
    expect(fam('kharadron.weapon.privateer-pistol', 'kharadron')).toBe('flintlock')
    expect(fam('kharadron.weapon.light-skyhook', 'kharadron')).toBe('missile')
    expect(fam('kharadron.weapon.heavy-skyhook', 'kharadron')).toBe('missile')
    expect(fam('lumineth.weapon.windblast-vortex', 'lumineth')).toBe('psychic')
    expect(fam('lumineth.weapon.bow-of-the-winds-vengeance', 'lumineth')).toBe('pulse')
    expect(weaponFlavour('lumineth.weapon.windblast-vortex', w('lumineth.weapon.windblast-vortex'), 'lumineth')).toBe('psychic')
    // classifying with no faction falls back on the id prefix without error
    expect(classifyVfxFamily('gloomspite.weapon.grot-bow', w('gloomspite.weapon.grot-bow'), '').family).toBe('bolt')
  })

  it('CLIENT-F8-007 each army has its own melee impact colour and style', () => {
    const hex = NEW.map((f) => factionColor(f).getHexString())
    expect(new Set(hex).size).toBe(4)
    for (const f of NEW) expect(factionColor(f).getHexString(), f).not.toBe(factionColor('unknown').getHexString())
    expect(meleeStyle('kruleboyz')).toBe('rend')
    expect(meleeStyle('lumineth')).toBe('blade')
    expect(meleeStyle('kharadron')).toBe('spark')
  })

  it('CLIENT-F8-008 death cries and charge sounds exist for the four new armies', () => {
    const ev = (e: Partial<GameEvent> & { type: string }): GameEvent => ({ seq: 1, ...e }) as unknown as GameEvent
    const lookupFor = (faction: string, kw: string[]) => ({ weapon: () => undefined, factionOfUnit: () => faction, keywordsOfUnit: () => kw })
    for (const f of NEW) {
      const d = soundsForEvent(ev({ type: 'ModelDestroyed', unitId: 'u', modelId: 'm1' }), 'A', lookupFor(f, ['INFANTRY']))
      expect(d[0].id.startsWith('aos-'), f).toBe(true)
      const c = soundsForEvent(ev({ type: 'ChargeDeclared', unitId: 'u' }), 'A', lookupFor(f, ['INFANTRY']))
      expect(c.length, f).toBeGreaterThan(0)
      expect(c.every((x) => x.id.startsWith('aos-')), f).toBe(true)
    }
    expect(soundsForEvent(ev({ type: 'ChargeDeclared', unitId: 'u' }), 'A', lookupFor('gloomspite', ['CAVALRY'])).map((x) => x.id)).toContain('aos-horse-charge')
    expect(soundsForEvent(ev({ type: 'ChargeDeclared', unitId: 'u' }), 'A', lookupFor('kharadron', ['INFANTRY'])).map((x) => x.id)).toContain('aos-human-battle-cry')
    expect(soundsForEvent(ev({ type: 'ChargeDeclared', unitId: 'u' }), 'A', lookupFor('kruleboyz', ['INFANTRY'])).map((x) => x.id)).toContain('aos-orruk-stomp')
  })

  it('CLIENT-F8-009 ability prompts name their ability; slides and set-ups say what is being picked', () => {
    const state = { abilities: { 'lumineth.ability.wind-whisperer': { name: 'Wind Whisperer' } }, units: { u1: { id: 'u1', name: 'Wardens' } }, models: {} } as unknown as GameState
    const mode = chooseOptionInfoFor({ topic: 'abilityMode', abilityId: 'lumineth.ability.wind-whisperer', unitId: null, data: {} }, [], state, 'A')
    expect(mode?.title).toBe('Wind Whisperer: choose an effect')
    const target = chooseOptionInfoFor({ topic: 'abilityTarget', abilityId: 'lumineth.ability.wind-whisperer', unitId: null, data: {} }, [], state, 'A')
    expect(target?.title).toBe('Wind Whisperer: choose a target')
    const slide = chooseOptionInfoFor({ topic: 'abilityMode', abilityId: 'lumineth.ability.wind-whisperer', unitId: 'u1', data: { move: true } }, [], state, 'A')
    expect(slide?.title).toMatch(/^Move /)
    expect(slide?.hint).toMatch(/heading/)
    const place = chooseOptionInfoFor({ topic: 'abilityMode', abilityId: null, unitId: 'u1', data: { place: true } }, [], state, 'A')
    expect(place?.title).toMatch(/^Set up /)
    // an unknown ability id keeps the generic prompt
    expect(chooseOptionInfoFor({ topic: 'abilityMode', abilityId: 'nope', unitId: null, data: {} }, [], state, 'A')?.title).toBe('Choose an effect')
  })
})
