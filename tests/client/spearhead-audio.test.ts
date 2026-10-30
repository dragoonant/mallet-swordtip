// Spearhead audio: every aos- id plays a real file (its own once generated, else the mapped 42k file), the engine
// events map onto them, and the new black-powder and melee looks classify. Nothing here may point at a missing file.
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../src/data'
import { AOS_AVAILABLE, AOS_FALLBACK, AOS_MUSIC_IDS, AOS_SFX_IDS, soundFile, soundTrim } from '../../src/client/audio/aos'
import { PRELOAD_IDS, STREAMED_SOUNDS, channelFor, audioUrl } from '../../src/client/audio/manifest'
import { aosWeaponSound, soundsForEvent, type SoundLookup } from '../../src/client/audio/eventSounds'
import { classifyVfxFamily, vfxFamily } from '../../src/client/weaponFlavour'
import { FAMILY_FX } from '../../src/client/vfx/families'
import { meleeStyle } from '../../src/client/vfx/palette'
import type { GameEvent } from '../../src/engine/events'

const audioDir = fileURLToPath(new URL('../../public/audio/', import.meta.url))
const onDisk = new Set(readdirSync(audioDir).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)))
const bundle = await loadBundle()

const base = { seq: 1, round: 1, turn: 'A', phase: 'fight', player: 'A' } as const
const ev = (e: Record<string, unknown>): GameEvent => ({ ...base, ...e }) as unknown as GameEvent
const lookup: SoundLookup = {
  weapon: (id) => bundle.weapons[id],
  factionOfUnit: (unitId) => (unitId.startsWith('orc') ? 'ironjawz' : 'cities'),
}

describe('AUDIO-AOS Spearhead sound set', () => {
  it('AUDIO-AOS-001 every aos id resolves to a file that exists', () => {
    for (const id of [...AOS_SFX_IDS, ...AOS_MUSIC_IDS]) expect(onDisk.has(soundFile(id)), `${id} -> ${soundFile(id)}`).toBe(true)
  })

  it('AUDIO-AOS-002 AOS_AVAILABLE lists exactly the aos mp3s on disk', () => {
    const generated = [...onDisk].filter((f) => f.startsWith('aos-')).sort()
    // When this fails after generating the set: add the missing ids to AOS_AVAILABLE in src/client/audio/aos.ts.
    expect([...AOS_AVAILABLE].sort()).toEqual(generated)
  })

  it('AUDIO-AOS-003 a fallback borrows its trim, a generated file plays as made', () => {
    expect(soundTrim('aos-cannon-fire')).toBe(AOS_FALLBACK['aos-cannon-fire'].volume ?? 1)
    expect(soundTrim('wpn-choppa')).toBe(1)
    expect(soundFile('wpn-choppa')).toBe('wpn-choppa')
    expect(audioUrl('aos-victory')).toMatch(/audio\/(aos-victory|victory-fanfare)\.mp3$/)
  })

  it('AUDIO-AOS-004 music ids are streamed on the music channel, the rest are sfx', () => {
    for (const id of AOS_MUSIC_IDS) {
      expect(STREAMED_SOUNDS.has(id), id).toBe(true)
      expect(channelFor(id), id).toBe('music')
    }
    for (const id of AOS_SFX_IDS) expect(channelFor(id), id).toBe('sfx')
  })

  it('AUDIO-AOS-005 the preload set only names files that exist', () => {
    for (const id of PRELOAD_IDS) expect(onDisk.has(soundFile(id)), id).toBe(true)
  })

  it('AUDIO-AOS-006 no Spearhead fallback is a sci-fi gun, radio or power-field sound', () => {
    const banned = /bolter|bolt-|plasma|psychic|invuln|radio|las|gauss|melta|fusion|pulse|ion-|psycannon|psilencer|webber|flamer|nemesis|sentinel|castellan|guardian/
    for (const [id, fb] of Object.entries(AOS_FALLBACK)) expect(banned.test(fb.id), `${id} -> ${fb.id}`).toBe(false)
  })
})

describe('AUDIO-AOS weapon sounds', () => {
  const melee = Object.entries(bundle.weapons).filter(([id, w]) => /^(cities|ironjawz)\./.test(id) && w.type === 'melee')
  const ranged = Object.entries(bundle.weapons).filter(([id, w]) => /^(cities|ironjawz)\./.test(id) && w.type === 'ranged')

  it('AUDIO-AOS-010 every Spearhead melee weapon swings with an aos sound', () => {
    expect(melee.length).toBeGreaterThan(0)
    for (const [id, w] of melee) {
      const s = aosWeaponSound(id, w.name, true)
      expect(s?.id.startsWith('aos-'), id).toBe(true)
    }
  })

  it('AUDIO-AOS-011 every Spearhead ranged weapon has a sound', () => {
    for (const [id, w] of ranged) expect(aosWeaponSound(id, w.name, false), id).toBeDefined()
  })

  it('AUDIO-AOS-012 headline weapons get their sounds', () => {
    const s = (id: string): string | undefined => aosWeaponSound(id, bundle.weapons[id]?.name, bundle.weapons[id]?.type !== 'ranged')?.id
    expect(s('cities.weapon.great-cannon-cannonball')).toBe('aos-cannon-fire')
    expect(s('cities.weapon.great-cannon-grapeshot')).toBe('aos-cannon-fire')
    expect(s('cities.weapon.master-forged-longsword')).toBe('aos-sword-clash')
    expect(s('cities.weapon.cavalier-weapon')).toBe('aos-lance-charge-impact')
    expect(s('cities.weapon.freeguild-weapon')).toBe('aos-halberd-strike')
    expect(s('ironjawz.weapon.boss-choppa')).toBe('aos-choppa-hit')
    expect(s('ironjawz.weapon.brute-weapons')).toBe('aos-fist-smash')
    expect(aosWeaponSound('sm.w.boltgun')).toBeUndefined()
  })

  it('AUDIO-AOS-013 firing the Great Cannon plays the cannon boom, a sword swing the clash', () => {
    const cannon = soundsForEvent(ev({ type: 'TargetsDeclared', unitId: 'cit1', targets: [{ weaponId: 'cities.weapon.great-cannon-cannonball', modelId: 'm1', targetUnitId: 'orc1' }] }), 'A', lookup)
    expect(cannon.map((s) => s.id)).toEqual(['aos-cannon-fire'])
    const sword = soundsForEvent(ev({ type: 'TargetsDeclared', unitId: 'cit1', targets: [{ weaponId: 'cities.weapon.master-forged-longsword', modelId: 'm1', targetUnitId: 'orc1' }] }), 'A', lookup)
    expect(sword.map((s) => s.id)).toEqual(['aos-sword-clash'])
  })
})

describe('AUDIO-AOS event mapping', () => {
  const attack = { attackerUnitId: 'cit1', attackerModelId: 'm1', weaponId: 'cities.weapon.freeguild-weapon', targetUnitId: 'orc1' }
  const ids = (e: GameEvent, seat: 'A' | 'B' = 'A'): string[] => soundsForEvent(e, seat, lookup).map((s) => s.id)

  it('AUDIO-AOS-020 deaths are per faction voice', () => {
    expect(ids(ev({ type: 'ModelDestroyed', unitId: 'cit1', modelId: 'a' }))[0]).toMatch(/^aos-human-death-[12]$/)
    expect(ids(ev({ type: 'ModelDestroyed', unitId: 'orc1', modelId: 'a' }))[0]).toMatch(/^aos-orruk-death-[12]$/)
    const takes = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((m) => ids(ev({ type: 'ModelDestroyed', unitId: 'orc1', modelId: m }))[0]))
    expect(takes.size).toBe(2)
  })

  it('AUDIO-AOS-021 saves and wounds sound like plate and flesh, a cannonball lands with its own boom', () => {
    expect(ids(ev({ type: 'SaveRolled', attack, saved: true, kind: 'armour' }))).toEqual(['aos-armour-hit'])
    expect(ids(ev({ type: 'SaveRolled', attack, saved: true, kind: 'invuln' }))).toEqual(['aos-armour-hit'])
    expect(ids(ev({ type: 'SaveRolled', attack, saved: false, kind: 'none' }))).toEqual(['hit-impact'])
    const ball = { ...attack, weaponId: 'cities.weapon.great-cannon-cannonball' }
    expect(ids(ev({ type: 'SaveRolled', attack: ball, saved: false, kind: 'none' }))).toEqual(['aos-cannonball-impact'])
  })

  it('AUDIO-AOS-022 charge, round start, priority, objectives, victory points and the end of the game', () => {
    expect(ids(ev({ type: 'ChargeDeclared', unitId: 'cit1', targetUnitIds: [] }))).toEqual(['aos-horse-charge', 'aos-human-battle-cry'])
    expect(ids(ev({ type: 'ChargeDeclared', unitId: 'orc1', targetUnitIds: [] }))).toEqual(['aos-orruk-stomp', 'aos-orruk-roar'])
    expect(ids(ev({ type: 'RoundStarted', round: 2 }))).toEqual(['aos-round-start-war-horn'])
    expect(ids(ev({ type: 'RoundStarted', round: 1 }))).toContain('aos-round-start-war-horn')
    expect(ids(ev({ type: 'PriorityRolled' }))).toEqual(['aos-priority-drumroll'])
    expect(ids(ev({ type: 'ObjectiveControlChanged', objectiveId: 'o1', from: null, to: 'A' }))).toContain('aos-objective-captured')
    expect(ids(ev({ type: 'ObjectiveControlChanged', objectiveId: 'o1', from: 'A', to: null }))).toEqual([])
    expect(ids(ev({ type: 'VpScored', amount: 2, total: 2, source: 'tactic' }))).toEqual(['aos-battle-tactic-scored'])
    expect(ids(ev({ type: 'GameEnded', result: { winner: 'A' } }))).toEqual(['aos-victory'])
    expect(ids(ev({ type: 'GameEnded', result: { winner: 'A' } }), 'B')).toEqual(['aos-defeat'])
  })

  it('AUDIO-AOS-023 every sound any of these events can play exists on disk', () => {
    const samples: GameEvent[] = [
      ev({ type: 'RoundStarted', round: 1 }), ev({ type: 'PriorityRolled' }), ev({ type: 'InitiativeSeized' }), ev({ type: 'WaaaghCalled' }),
      ev({ type: 'PhaseStarted', phase: 'fight' }), ev({ type: 'PhaseStarted', phase: 'charge' }), ev({ type: 'PhaseStarted', phase: 'movement' }),
      ev({ type: 'ObjectiveSecured', by: 'A' }), ev({ type: 'StratagemUsed' }), ev({ type: 'UnitDestroyed' }), ev({ type: 'BattleShocked' }),
      ev({ type: 'CpChanged', delta: 1 }), ev({ type: 'DiceRolled' }), ev({ type: 'DeadlyDemiseRolled', exploded: true }), ev({ type: 'ActionRejected' }),
    ]
    for (const e of samples) for (const s of soundsForEvent(e, 'A', lookup)) expect(onDisk.has(soundFile(s.id)), `${e.type} -> ${s.id}`).toBe(true)
  })
})

describe('AUDIO-AOS vfx', () => {
  it('AUDIO-AOS-030 the Great Cannon and the Dragoon pistol have black-powder looks, not an autocannon or laser look', () => {
    const f = (id: string): string => vfxFamily(id, bundle.weapons[id], '')
    expect(f('cities.weapon.great-cannon-cannonball')).toBe('cannonball')
    expect(f('cities.weapon.great-cannon-grapeshot')).toBe('grapeshot')
    expect(f('cities.weapon.dragoon-pistol')).toBe('flintlock')
    for (const fam of ['cannonball', 'grapeshot', 'flintlock'] as const) {
      expect(FAMILY_FX[fam].family).toBe(fam)
      expect(['beam', 'arc', 'orb']).not.toContain(FAMILY_FX[fam].projectile.type)
    }
    expect(FAMILY_FX.cannonball.muzzle.smoke).toBe(true)
    expect(FAMILY_FX.cannonball.impact).toBe('iron')
    expect(classifyVfxFamily('cities.weapon.great-cannon-cannonball', undefined, '').via).toBe('keyword')
  })

  it('AUDIO-AOS-031 Cities cut with blade arcs, Ironjawz chop, everyone else keeps the spark clash', () => {
    expect(meleeStyle('cities')).toBe('blade')
    expect(meleeStyle('ironjawz')).toBe('chop')
    expect(meleeStyle('space-marines')).toBe('spark')
  })
})
