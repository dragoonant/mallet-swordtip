// F16 client wiring for Daughters of Khaine, Idoneth Deepkin, Disciples of Tzeentch and Ossiarch Bonereapers: crests, start-screen copy, prompt
// titles, weapon looks and sounds, bases and the faction counters in the HUD.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { loadBundle } from '../../src/data'
import { FactionCrest } from '../../src/client/ui/FactionCrest'
import { FACTION_ALLIANCE, FACTION_BLURBS, OPTION_BLURBS } from '../../src/client/ui/StartScreen'
import { chooseOptionInfoFor } from '../../src/client/ui/DecisionPrompt'
import { classifyVfxFamily, weaponFlavour } from '../../src/client/weaponFlavour'
import { aosWeaponSound } from '../../src/client/audio/eventSounds'
import { factionColor, meleeStyle } from '../../src/client/vfx/palette'
import { resolveBase } from '../../src/client/figures/data'
import { SOURCE_HUES } from '../../src/client/figures/glbPaint'
import { GLB_SLUG_BY_MODEL } from '../../src/client/figures/glbModels'
import { useGameStore } from '../../src/client/store/game'
import { factionResources } from '../../src/engine/hooks-impl'

const NEW = ['daughters', 'idoneth', 'tzeentch', 'ossiarch'] as const
const MM = 25.4
const bundle = await loadBundle()

describe('F16 armies on the client', () => {
  it('FIG-F16-001 every new army has its own crest, blurb and alliance, and an own-words blurb for each regiment ability and enhancement', () => {
    for (const f of NEW) {
      const svg = renderToStaticMarkup(createElement(FactionCrest, { faction: f, name: f }))
      expect(svg, f).toContain(`faction-crest-${f}`)
      expect(svg, `${f} falls back to the plain shield`).not.toContain('<text')
      expect(FACTION_BLURBS[f], f).toBeTruthy()
      expect(FACTION_ALLIANCE[f], f).toBeTruthy()
      const patrol = Object.values(bundle.patrols).find((p) => p.mode === 'spearhead' && p.faction === f)!
      for (const r of patrol.regimentAbilities ?? []) expect(OPTION_BLURBS[r.id], r.id).toBeTruthy()
      for (const e of patrol.enhancements) expect(OPTION_BLURBS[e.id], e.id).toBeTruthy()
    }
    expect([FACTION_ALLIANCE.daughters, FACTION_ALLIANCE.idoneth, FACTION_ALLIANCE.tzeentch, FACTION_ALLIANCE.ossiarch]).toEqual(['Order', 'Order', 'Chaos', 'Death'])
  })

  it('FIG-F16-002 all twenty armies have a distinct crest and a blurb, so the start screen shows twenty real tiles', () => {
    const armies = Object.values(bundle.patrols).filter((p) => p.mode === 'spearhead').map((p) => p.faction)
    expect(new Set(armies).size).toBe(20)
    const crests = new Set<string>()
    for (const f of armies) {
      expect(FACTION_BLURBS[f], f).toBeTruthy()
      expect(FACTION_ALLIANCE[f], f).toBeTruthy()
      const svg = renderToStaticMarkup(createElement(FactionCrest, { faction: f, name: f }))
      expect(svg, f).not.toContain('<text')
      crests.add(svg.replace(/data-testid="[^"]*"|aria-label="[^"]*"/g, ''))
    }
    expect(crests.size).toBe(20)
  })

  it('FIG-F16-003 Predict the Future, Cheat Destiny and the Ossiarch picks get their own prompt titles and hints', () => {
    const sort = chooseOptionInfoFor({ topic: 'abilityChoice', abilityId: 'tzeentch.ability.predict-the-future', data: { stage: 'sort', i: 1, cards: ['a', 'b', 'c'], tops: ['a'], bottoms: [] } })
    expect(sort?.title).toBe('Predict the Future: card 2 of 3')
    expect(sort?.hint).toMatch(/top of your deck|bottom/)
    const order = chooseOptionInfoFor({ topic: 'abilityChoice', abilityId: 'tzeentch.ability.predict-the-future', data: { stage: 'order', i: 3, cards: ['a', 'b', 'c'], tops: ['a', 'c'], bottoms: ['b'] } })
    expect(order?.title).toMatch(/choose the top card/)
    expect(order?.hint).toMatch(/2 cards/)
    const cheat = chooseOptionInfoFor({ topic: 'abilityChoice', abilityId: 'tzeentch.ability.cheat-destiny', data: { cardId: 'x' } })
    expect(cheat?.title).toMatch(/Cheat Destiny/)
    // Ossiarch's effect pick names the ability and explains what each aspect does
    const state = { abilities: { 'ossiarch.ability.switch-aspects': { id: 'ossiarch.ability.switch-aspects', name: 'Switch Aspects' } }, units: {} } as never
    const aspects = chooseOptionInfoFor({ topic: 'abilityMode', abilityId: 'ossiarch.ability.switch-aspects', unitId: null }, [{ id: 'parry', label: 'Blade-parry Aspect' }, { id: 'destroyer', label: 'Destroyer Aspect' }], state, 'A')
    expect(aspects?.title).toBe('Switch Aspects: choose an effect')
    expect(aspects?.hint).toMatch(/Blade-parry/)
    expect(aspects?.hint).toMatch(/Destroyer/)
  })

  it('FIG-F16-004 the new weapons look and sound like themselves', () => {
    const w = (id: string) => bundle.weapons[id]
    const ids = Object.keys(bundle.weapons).filter((i) => NEW.some((f) => i.startsWith(`${f}.`)))
    expect(ids.length).toBeGreaterThanOrEqual(24)
    for (const id of ids) {
      const wp = w(id)
      expect(aosWeaponSound(id, wp.name, wp.type === 'melee'), id).toBeDefined()
      if (wp.type === 'ranged') expect(classifyVfxFamily(id, wp, '').via, id).toBe('keyword')
    }
    expect(classifyVfxFamily('daughters.weapon.heartseeker-bow', w('daughters.weapon.heartseeker-bow'), 'daughters').family).toBe('bolt')
    expect(classifyVfxFamily('daughters.weapon.keldrisaith-ranged', w('daughters.weapon.keldrisaith-ranged'), 'daughters').family).toBe('bolt')
    expect(classifyVfxFamily('idoneth.weapon.scryfish-shoal', w('idoneth.weapon.scryfish-shoal'), 'idoneth').family).toBe('pulse')
    expect(classifyVfxFamily('idoneth.weapon.razorshell-harpoon-launcher', w('idoneth.weapon.razorshell-harpoon-launcher'), 'idoneth').family).toBe('missile')
    expect(classifyVfxFamily('tzeentch.weapon.arrow-of-fate', w('tzeentch.weapon.arrow-of-fate'), 'tzeentch').family).toBe('pulse')
    // blades, bites and halberds cut; the shaman's staff and the bow stave crackle as force weapons
    for (const id of ['daughters.weapon.cursed-scimitar', 'daughters.weapon.dark-steeds-vicious-bite', 'idoneth.weapon.voltspear', 'idoneth.weapon.lanmari', 'tzeentch.weapon.savage-blades', 'ossiarch.weapon.dread-halberd', 'ossiarch.weapon.stalker-blades']) {
      expect(weaponFlavour(id, w(id), id.split('.')[0]), id).toBe('chain')
    }
    expect(weaponFlavour('tzeentch.weapon.staff-of-change', w('tzeentch.weapon.staff-of-change'), 'tzeentch')).toBe('force')
    expect(weaponFlavour('tzeentch.weapon.arrow-of-fate', w('tzeentch.weapon.arrow-of-fate'), 'tzeentch')).toBe('psychic')
    expect(meleeStyle('daughters')).toBe('rend')
    expect(meleeStyle('ossiarch')).toBe('chop')
    for (const f of NEW) expect(factionColor(f).getHexString(), f).not.toBe('e8e8f0') // not the neutral fallback
  })

  it('FIG-F16-005 bases come from the datasheets: round or oval as the spec tables say, long axis along the facing', () => {
    const want: Record<string, [number, number?]> = {
      'daughters.unit.melusai-ironscale': [40], 'daughters.unit.witch-aelves': [25], 'daughters.unit.doomfire-warlocks': [60, 35], 'daughters.unit.blood-stalkers': [40],
      'idoneth.unit.isharann-soulscryer': [32], 'idoneth.unit.akhelian-morrsarr-guard': [60, 35], 'idoneth.unit.akhelian-allopex': [90, 52], 'idoneth.unit.namarti-thralls': [32],
      'tzeentch.unit.tzaangor-shaman': [40], 'tzeentch.unit.tzaangors': [32], 'tzeentch.unit.tzaangor-enlightened': [40], 'tzeentch.unit.tzaangor-skyfires': [40],
      'ossiarch.unit.mortisan-ossifector': [32], 'ossiarch.unit.immortis-guard': [50], 'ossiarch.unit.necropolis-stalkers': [50], 'ossiarch.unit.morghast-archai': [60],
    }
    for (const [id, [long, short]] of Object.entries(want)) {
      const ds = bundle.datasheets[id]
      expect(ds, id).toBeDefined()
      const c = ds.composition[0]
      const b = resolveBase(ds, ds.figure.archetype, c.modelId)
      expect(b.radiusZ, id).toBeCloseTo(long / 2 / MM, 5)
      expect(b.radiusX, id).toBeCloseTo((short ?? long) / 2 / MM, 5)
    }
  })

  it('FIG-F16-006 every model of the four armies maps to its spec slug and the painter has stock hues for the armies', () => {
    for (const ds of Object.values(bundle.datasheets).filter((d) => NEW.some((f) => d.id.startsWith(`${f}.unit.`)))) {
      for (const c of ds.composition) expect(GLB_SLUG_BY_MODEL[`${ds.id}/${c.modelId}`], `${ds.id}/${c.modelId}`).toMatch(/^(dok|idk|dot|obr)-/)
    }
    for (const f of NEW) expect(SOURCE_HUES[f]?.major ?? SOURCE_HUES[f]?.minor, f).toBeTruthy()
  })

  it('FIG-F16-007 the army counters (Blood Rites, the tide of the round) reach the HUD through factionResources', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'daughters', opponentFaction: 'idoneth', opponent: 'hotseat', seed: 'f16-hud' })
    const state = useGameStore.getState().state!
    const a = factionResources(state, 'A')
    const b = factionResources(state, 'B')
    expect(a.map((r) => r.id)).toContain('daughters.rites')
    const tide = b.find((r) => r.id === 'idoneth.tide')
    expect(tide?.label).toMatch(/^Tide: /)
    expect(tide?.max).toBe(4)
    expect(tide?.help).toBeTruthy()
  })
})
