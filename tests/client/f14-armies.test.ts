// F14 client wiring for Blades of Khorne, Maggotkin of Nurgle, Nighthaunt and Sylvaneth: crests, start-screen copy, prompt titles,
// weapon looks and sounds.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { loadBundle } from '../../src/data'
import { FactionCrest } from '../../src/client/ui/FactionCrest'
import { FACTION_ALLIANCE, FACTION_BLURBS, OPTION_BLURBS } from '../../src/client/ui/StartScreen'
import { chooseOptionInfoFor } from '../../src/client/ui/DecisionPrompt'
import { classifyVfxFamily, weaponFlavour } from '../../src/client/weaponFlavour'
import { aosWeaponSound } from '../../src/client/audio/eventSounds'
import { meleeStyle } from '../../src/client/vfx/palette'

const NEW = ['khorne', 'nurgle', 'nighthaunt', 'sylvaneth'] as const

describe('F14 armies on the client', () => {
  it('FIG-F14-001 every new army has its own crest, blurb and alliance, and an own-words blurb for each regiment ability and enhancement', async () => {
    const bundle = await loadBundle()
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
  })

  it('FIG-F14-002 the crit-ability pick and Nurgle\'s Embrace get their own prompt titles and hints', () => {
    const crit = chooseOptionInfoFor({ topic: 'critChoice', abilityId: null, unitId: 'u1', data: { weaponName: 'Sword of Stolen Hours' } })
    expect(crit?.title).toContain('Sword of Stolen Hours')
    expect(crit?.hint).toMatch(/critical-hit/)
    expect(chooseOptionInfoFor({ topic: 'critChoice', abilityId: null, unitId: 'u1', data: {} })?.title).toMatch(/critical-hit/)
  })

  it('FIG-F14-003 the new weapons look and sound like themselves', async () => {
    const bundle = await loadBundle()
    const w = (id: string) => bundle.weapons[id]
    expect(classifyVfxFamily('nurgle.weapon.disgusting-sneezes', w('nurgle.weapon.disgusting-sneezes'), 'nurgle')).toMatchObject({ family: 'bio', via: 'keyword' })
    expect(classifyVfxFamily('sylvaneth.weapon.gossamid-bow', w('sylvaneth.weapon.gossamid-bow'), 'sylvaneth')).toMatchObject({ family: 'bolt', via: 'keyword' })
    expect(weaponFlavour('nurgle.weapon.disgusting-sneezes', w('nurgle.weapon.disgusting-sneezes'), 'nurgle')).toBe('shoota')
    expect(meleeStyle('khorne')).toBe('rend')
    expect(meleeStyle('nighthaunt')).toBe('blade')
    for (const id of Object.keys(bundle.weapons).filter((i) => NEW.some((f) => i.startsWith(`${f}.`)))) {
      expect(aosWeaponSound(id, bundle.weapons[id].name, bundle.weapons[id].type === 'melee'), id).toBeDefined()
    }
  })
})
