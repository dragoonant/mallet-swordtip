// F18 client wiring for Hedonites of Slaanesh, Helsmiths of Hashut, Flesh-eater Courts, Ogor Mawtribes and Sons of Behemat: crests, start-screen copy,
// prompt titles, weapon looks, big bases and the army counters in the HUD.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { loadBundle } from '../../src/data'
import { FactionCrest } from '../../src/client/ui/FactionCrest'
import { FACTION_ALLIANCE, FACTION_BLURBS, OPTION_BLURBS } from '../../src/client/ui/StartScreen'
import { chooseOptionInfoFor } from '../../src/client/ui/DecisionPrompt'
import { VFX_FAMILIES, classifyVfxFamily, weaponFlavour } from '../../src/client/weaponFlavour'
import { FAMILY_FX } from '../../src/client/vfx/families'
import { aosWeaponSound } from '../../src/client/audio/eventSounds'
import { factionColor, meleeStyle } from '../../src/client/vfx/palette'
import { resolveBase } from '../../src/client/figures/data'
import { SOURCE_HUES } from '../../src/client/figures/glbPaint'
import { GLB_SLUG_BY_MODEL } from '../../src/client/figures/glbModels'
import { useGameStore } from '../../src/client/store/game'
import { factionResources } from '../../src/engine/hooks-impl'

const NEW = ['slaanesh', 'helsmiths', 'fec', 'ogors', 'behemat'] as const
const MM = 25.4
const bundle = await loadBundle()

describe('F18 armies on the client', () => {
  it('CLIENT-F18-001 every new army has its own crest, blurb and alliance, and an own-words blurb for each regiment ability and enhancement', () => {
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
    expect(NEW.map((f) => FACTION_ALLIANCE[f])).toEqual(['Chaos', 'Chaos', 'Death', 'Destruction', 'Destruction'])
  })

  it('CLIENT-F18-002 the crests are all different from each other and from the other twenty armies', () => {
    const crests = new Map<string, string>()
    for (const p of Object.values(bundle.patrols).filter((q) => q.mode === 'spearhead')) {
      const svg = renderToStaticMarkup(createElement(FactionCrest, { faction: p.faction, name: p.faction })).replace(/data-testid="[^"]*"|aria-label="[^"]*"/g, '')
      expect(crests.has(svg), `${p.faction} repeats ${crests.get(svg)}`).toBe(false)
      crests.set(svg, p.faction)
    }
    expect(crests.size).toBe(25)
  })

  it('CLIENT-F18-003 the Harness hand-out, Ruinous extra targets, multi-target picks and the deployment offer get their own titles and hints', () => {
    const state = {
      abilities: {
        'helsmiths.ability.harness-daemonic-power': { id: 'helsmiths.ability.harness-daemonic-power', name: 'Harness Daemonic Power' },
        'helsmiths.ability.grinding-advance': { id: 'helsmiths.ability.grinding-advance', name: 'Grinding Advance' },
        'nurgle.ability.nurgles-embrace': { id: 'nurgle.ability.nurgles-embrace', name: "Nurgle's Embrace" },
      },
      units: {},
    } as never
    const harness = chooseOptionInfoFor({ topic: 'abilityChoice', abilityId: 'helsmiths.ability.harness-daemonic-power', unitId: null, data: { code: 'helsmithsHarness', points: 3 } }, undefined, state, 'A')
    expect(harness?.title).toBe('Harness Daemonic Power: 3 points to hand out')
    expect(harness?.title).not.toMatch(/disease/)
    expect(harness?.hint).toMatch(/3 at most/)
    const one = chooseOptionInfoFor({ topic: 'abilityChoice', abilityId: 'helsmiths.ability.harness-daemonic-power', unitId: null, data: { code: 'helsmithsHarness', points: 1 } }, undefined, state, 'A')
    expect(one?.title).toBe('Harness Daemonic Power: 1 point to hand out')
    const ruinous = chooseOptionInfoFor({ topic: 'abilityChoice', abilityId: 'helsmiths.ability.ruinous-bombardment', unitId: 'u1', data: { code: 'helsmithsRuinousBombardment', left: 2 } }, undefined, state, 'A')
    expect(ruinous?.title).toBe('Ruinous Bombardment: 2 more targets')
    // Nurgle keeps its own disease wording
    const embrace = chooseOptionInfoFor({ topic: 'abilityChoice', abilityId: 'nurgle.ability.nurgles-embrace', unitId: null, data: { code: 'nurgleEmbrace', points: 2 } }, undefined, state, 'A')
    expect(embrace?.title).toMatch(/disease point/)
    // a multi-target declare reads which pick it is, from the option labels, and says what Done and Cancel do
    const multi = chooseOptionInfoFor(
      { topic: 'abilityTarget', abilityId: 'helsmiths.ability.grinding-advance', unitId: null, data: { multi: true, picked: ['c1'] } },
      [{ id: 'c2', label: 'Infernal Cohort B (2 of up to 2)' }, { id: '__done', label: 'Done (1 picked)' }], state, 'A',
    )
    expect(multi?.title).toBe('Grinding Advance: pick target 2 of up to 2')
    expect(multi?.hint).toMatch(/Done/)
    expect(multi?.hint).toMatch(/Cancel/)
    const first = chooseOptionInfoFor({ topic: 'abilityTarget', abilityId: 'helsmiths.ability.grinding-advance', unitId: null, data: { multi: true, picked: [] } }, [{ id: 'c1', label: 'Infernal Cohort A (1 of up to 2)' }], state, 'A')
    expect(first?.title).toBe('Grinding Advance: pick target 1 of up to 2')
    // abilities offered after both armies are set up say so
    const dep = chooseOptionInfoFor({ topic: 'abilityUse', abilityId: null, unitId: null, data: { window: 'deployment' } })
    expect(dep?.title).toMatch(/set up/)
    const normal = chooseOptionInfoFor({ topic: 'abilityUse', abilityId: null, unitId: null, data: { window: 'hero' } })
    expect(normal?.title).toBe('Use an ability?')
  })

  it('CLIENT-F18-004 the Summon Loyal Subjects split and the Drop, Toss or Roll pick explain themselves', () => {
    const state = {
      abilities: {
        'fec.ability.summon-loyal-subjects': { id: 'fec.ability.summon-loyal-subjects', name: 'Summon Loyal Subjects' },
        'behemat.ability.drop-toss-or-roll': { id: 'behemat.ability.drop-toss-or-roll', name: 'Drop, Toss or Roll' },
      },
      units: {},
    } as never
    const summon = chooseOptionInfoFor({ topic: 'abilityMode', abilityId: 'fec.ability.summon-loyal-subjects', unitId: 'u1' }, [{ id: '1-1', label: '1 Morbheg Knight and 1 Cryptguard back (3 points)' }], state, 'A')
    expect(summon?.title).toBe('Summon Loyal Subjects: choose an effect')
    expect(summon?.hint).toMatch(/noble deeds/)
    const dtr = chooseOptionInfoFor({ topic: 'abilityMode', abilityId: 'behemat.ability.drop-toss-or-roll', unitId: 'u2' }, [{ id: 'drop', label: 'Drop: ranged weapons have Shoot in Combat' }, { id: 'toss', label: 'Toss: +6" to the Range of ranged weapons' }], state, 'A')
    expect(dtr?.hint).toMatch(/Drop/)
    expect(dtr?.hint).toMatch(/Toss/)
    expect(dtr?.hint).toMatch(/Roll/)
  })

  it('CLIENT-F18-005 the new weapons look and sound like themselves, ranged ones by keyword rather than the faction default', () => {
    const w = (id: string) => bundle.weapons[id]
    const ids = Object.keys(bundle.weapons).filter((i) => NEW.some((f) => i.startsWith(`${f}.`)))
    expect(ids.length).toBeGreaterThanOrEqual(24)
    for (const id of ids) {
      const wp = w(id)
      expect(aosWeaponSound(id, wp.name, wp.type === 'melee'), id).toBeDefined()
      if (wp.type === 'ranged') expect(classifyVfxFamily(id, wp, '').via, id).toBe('keyword')
    }
    expect(classifyVfxFamily('behemat.weapon.hurlin-rocks', w('behemat.weapon.hurlin-rocks'), 'behemat').family).toBe('boulder')
    expect(classifyVfxFamily('helsmiths.weapon.torrent-of-ruinous-energy', w('helsmiths.weapon.torrent-of-ruinous-energy'), 'helsmiths').family).toBe('hellfire')
    expect(classifyVfxFamily('helsmiths.weapon.immolation-cannons', w('helsmiths.weapon.immolation-cannons'), 'helsmiths').family).toBe('hellflame')
    for (const fam of ['boulder', 'hellfire', 'hellflame'] as const) {
      expect(VFX_FAMILIES).toContain(fam)
      expect(FAMILY_FX[fam].family).toBe(fam)
    }
    // a boulder is solid matter, drawn normally; the green fire glows
    expect(FAMILY_FX.boulder.projectile.solid).toBe(true)
    expect(FAMILY_FX.hellfire.projectile.solid).toBeUndefined()
    // flavour for the sound and tracer palette: ruinous shells and rocks are heavy, the cannons burn; clubs and headbutts crush, claws and cleavers cut
    expect(weaponFlavour('behemat.weapon.hurlin-rocks', w('behemat.weapon.hurlin-rocks'), 'behemat')).toBe('heavy')
    expect(weaponFlavour('helsmiths.weapon.torrent-of-ruinous-energy', w('helsmiths.weapon.torrent-of-ruinous-energy'), 'helsmiths')).toBe('heavy')
    expect(weaponFlavour('helsmiths.weapon.immolation-cannons', w('helsmiths.weapon.immolation-cannons'), 'helsmiths')).toBe('flame')
    for (const id of ['behemat.weapon.massive-club-and-rocks', 'behemat.weapon.eadbutt', 'ogors.weapon.gutbiter-weapons', 'helsmiths.weapon.horns-and-pummelling-strikes']) {
      expect(weaponFlavour(id, w(id), id.split('.')[0]), id).toBe('crush')
    }
    for (const id of ['slaanesh.weapon.piercing-claws', 'slaanesh.weapon.deadly-pincers-and-barbed-stinger', 'fec.weapon.gory-talons-and-fangs', 'ogors.weapon.tyrants-meatcleavers', 'helsmiths.weapon.daemonflame-glaive']) {
      expect(weaponFlavour(id, w(id), id.split('.')[0]), id).toBe('chain')
    }
    expect(meleeStyle('slaanesh')).toBe('rend')
    expect(meleeStyle('helsmiths')).toBe('ember')
    expect(meleeStyle('behemat')).toBe('chop')
    for (const f of NEW) expect(factionColor(f).getHexString(), f).not.toBe('e8e8f0') // not the neutral fallback
  })

  it('CLIENT-F18-006 bases come from the datasheets: the gargants fill 90mm discs, the Maulbeast and Varghulf 90x52mm ovals, long axis along the facing', () => {
    const want: Record<string, [number, number?]> = {
      'slaanesh.unit.thricefold-discord': [40], 'slaanesh.unit.fiends': [75, 42], 'slaanesh.unit.daemonettes': [25], 'slaanesh.unit.seekers': [60, 35],
      'helsmiths.unit.war-despot': [32], 'helsmiths.unit.dominator-engine': [80], 'helsmiths.unit.tormentor-bombard': [100], 'helsmiths.unit.infernal-cohort': [28.5],
      'fec.unit.abhorrant-archregent': [40], 'fec.unit.cryptguard': [25], 'fec.unit.morbheg-knights': [75, 42], 'fec.unit.varghulf-courtier': [90, 52],
      'ogors.unit.tyrant': [50], 'ogors.unit.gluttons': [40], 'ogors.unit.ironguts': [40], 'ogors.unit.maulbeast-cavalry': [90, 52],
      'behemat.unit.boulder-basher': [90], 'behemat.unit.rock-hurler': [90],
    }
    for (const [id, [long, short]] of Object.entries(want)) {
      const ds = bundle.datasheets[id]
      expect(ds, id).toBeDefined()
      const c = ds.composition[0]
      const b = resolveBase(ds, ds.figure.archetype, c.modelId)
      expect(b.radiusZ, id).toBeCloseTo(long / 2 / MM, 5)
      expect(b.radiusX, id).toBeCloseTo((short ?? long) / 2 / MM, 5)
    }
    // a gargant stands taller than the biggest stand-in monster of the other armies, but not absurdly so
    for (const id of ['behemat.unit.boulder-basher', 'behemat.unit.rock-hurler']) {
      const ds = bundle.datasheets[id]
      const b = resolveBase(ds, ds.figure.archetype, ds.composition[0].modelId)
      expect(b.height).toBeGreaterThan(3)
      expect(b.height).toBeLessThan(4.5)
    }
  })

  it('CLIENT-F18-007 every model of the five armies maps to its spec slug and the painter has stock hues for the armies', () => {
    for (const ds of Object.values(bundle.datasheets).filter((d) => NEW.some((f) => d.id.startsWith(`${f}.unit.`)))) {
      for (const c of ds.composition) expect(GLB_SLUG_BY_MODEL[`${ds.id}/${c.modelId}`], `${ds.id}/${c.modelId}`).toMatch(/^(hos|hoh|fec|ogm|sob)-/)
    }
    for (const f of NEW) expect(SOURCE_HUES[f]?.major ?? SOURCE_HUES[f]?.minor, f).toBeTruthy()
  })

  it('CLIENT-F18-008 the army counters (Favour, Noble Deeds) reach the HUD through factionResources', async () => {
    await useGameStore.getState().newGame({ playerFaction: 'slaanesh', opponentFaction: 'fec', opponent: 'hotseat', seed: 'f18-hud' })
    const state = useGameStore.getState().state!
    const a = factionResources(state, 'A')
    // the Heroes' tallies only show once they are on the board (the engine reads board units), so stand the Flesh-eater army up first
    const standing = structuredClone(state)
    for (const u of Object.values(standing.units)) if (u.player === 'B') u.location = 'board'
    const b = factionResources(standing, 'B')
    const favour = a.find((r) => r.id === 'slaanesh.favour')
    expect(favour?.label).toBe('Favour')
    expect(favour?.help).toBeTruthy()
    const deeds = b.filter((r) => r.id.startsWith('fec.deeds.'))
    expect(deeds.map((r) => r.label).sort()).toEqual(['Archregent deeds', 'Varghulf deeds'])
    for (const r of deeds) {
      expect(r.max).toBe(6)
      expect(r.help).toBeTruthy()
    }
  })
})
