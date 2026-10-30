// The Age of Sigmar sound set (tools/audio-manifest.json "aos-*" entries) and how it maps onto the files that
// actually exist today.
//
// Game code asks for an `aos-<name>` id. Where the generated file public/audio/aos-<name>.mp3 exists (the id is
// listed in AOS_AVAILABLE) that file plays untouched; until then the id plays the closest existing 42k file from
// AOS_FALLBACK, trimmed by that entry's volume. Nothing ever points at a file that is not on disk
// (tests/client/spearhead-audio.test.ts checks both directions), so generating the set later is: drop the mp3s
// into public/audio and add their ids to AOS_AVAILABLE (the test names exactly which ones are missing from it).
//
// Fallback choices avoid the 42k sci-fi sounds (bolters, radio, power-field hums): swords and halberds borrow the
// cleaver/axe swings, cannon fire borrows the field gun, hits and saves borrow the plain armour clank and thud.
import type { SfxId, VoiceId, StingerId, MusicId } from './manifest'

export const AOS_SFX_IDS = [
  'aos-halberd-strike', 'aos-sword-clash', 'aos-lance-charge-impact', 'aos-cannon-fire', 'aos-cannonball-impact',
  'aos-choppa-hit', 'aos-fist-smash', 'aos-shield-bash', 'aos-armour-hit', 'aos-miss-whoosh',
  'aos-horse-gallop', 'aos-horse-charge', 'aos-armoured-march', 'aos-orruk-stomp',
  'aos-human-battle-cry', 'aos-human-death-1', 'aos-human-death-2', 'aos-orruk-roar', 'aos-orruk-death-1', 'aos-orruk-death-2',
  'aos-marshal-command', 'aos-priority-drumroll', 'aos-round-start-war-horn', 'aos-objective-captured',
  'aos-battle-tactic-scored', 'aos-victory', 'aos-defeat',
] as const

export const AOS_STINGER_IDS = [
  'aos-stinger-iron-vanguard', 'aos-stinger-the-long-march', 'aos-stinger-gate-of-ash',
  'aos-stinger-banner-and-blade', 'aos-stinger-last-stand', 'aos-stinger-cold-hearth',
] as const

export const AOS_MUSIC_IDS = ['aos-ambient-bed', ...AOS_STINGER_IDS] as const

export type AosSfxId = (typeof AOS_SFX_IDS)[number]
export type AosStingerId = (typeof AOS_STINGER_IDS)[number]
export type AosMusicId = (typeof AOS_MUSIC_IDS)[number]
export type AosSoundId = AosSfxId | AosMusicId

/** What an `aos-` id plays while its own file does not exist: an existing file and a playback trim. */
export interface AosFallback {
  id: SfxId | VoiceId | MusicId | StingerId
  volume?: number
}

export const AOS_FALLBACK: Record<AosSoundId, AosFallback> = {
  // melee: cleaver and axe swings for blades and polearms, a blunt armour-denting clang for the lance, a dull thud for shields
  'aos-halberd-strike': { id: 'wpn-big-choppa', volume: 0.7 },
  'aos-sword-clash': { id: 'wpn-choppa', volume: 0.85 },
  'aos-lance-charge-impact': { id: 'wpn-hallowed-mace', volume: 0.85 },
  'aos-choppa-hit': { id: 'wpn-brutal-assault-weapon', volume: 0.85 },
  'aos-fist-smash': { id: 'power-klaw-crunch' },
  'aos-shield-bash': { id: 'wpn-close-combat-weapon', volume: 0.75 },
  'aos-armour-hit': { id: 'armour-save-clank', volume: 0.9 },
  // the airy swing with nothing behind it: the only whoosh in the old set is the big stratagem swell, pulled right down
  'aos-miss-whoosh': { id: 'stratagem-whoosh', volume: 0.3 },
  // artillery: the field gun is the heaviest shot in the old set; the ball landing is the vehicle explosion's boom and debris
  'aos-cannon-fire': { id: 'wpn-bombast-field-gun', volume: 0.8 },
  'aos-cannonball-impact': { id: 'vehicle-explosion', volume: 0.6 },
  // movement: the stampede rumble stands in for hooves, march and stomps at different weights
  'aos-horse-gallop': { id: 'charge-rumble', volume: 0.6 },
  'aos-horse-charge': { id: 'charge-rumble', volume: 0.85 },
  'aos-armoured-march': { id: 'charge-rumble', volume: 0.5 },
  'aos-orruk-stomp': { id: 'charge-rumble', volume: 0.7 },
  // voices: a soldier's shout and the human soldier deaths for Cities, the brute roar and bellowing deaths for Orruks
  'aos-human-battle-cry': { id: 'marine-shout', volume: 0.85 },
  'aos-human-death-1': { id: 'death-astra-militarum', volume: 0.5 },
  'aos-human-death-2': { id: 'model-death', volume: 0.85 },
  'aos-orruk-roar': { id: 'ork-war-cry', volume: 0.85 },
  'aos-orruk-death-1': { id: 'death-orks', volume: 0.5 },
  'aos-orruk-death-2': { id: 'death-orks', volume: 0.45 },
  'aos-marshal-command': { id: 'marine-shout', volume: 0.75 },
  // game flow
  'aos-priority-drumroll': { id: 'charge-rumble', volume: 0.45 },
  'aos-round-start-war-horn': { id: 'turn-start-horn' },
  'aos-objective-captured': { id: 'objective-captured-chime' },
  'aos-battle-tactic-scored': { id: 'vp-scored-sting' },
  'aos-victory': { id: 'victory-fanfare' },
  'aos-defeat': { id: 'defeat-sting' },
  // music: the existing bed, and the war-like stingers (the machine, warp and xenos ones stay out of this set)
  'aos-ambient-bed': { id: 'ambient-battlefield-loop' },
  'aos-stinger-iron-vanguard': { id: 'stinger-crusade-drums' },
  'aos-stinger-the-long-march': { id: 'stinger-glory-ascendant' },
  'aos-stinger-gate-of-ash': { id: 'stinger-requiem' },
  'aos-stinger-banner-and-blade': { id: 'stinger-cathedral-hymn' },
  'aos-stinger-last-stand': { id: 'stinger-bell-of-the-fallen' },
  'aos-stinger-cold-hearth': { id: 'stinger-requiem' },
}

/** The `aos-` ids whose own mp3 is in public/audio. Add an id here once its file is generated. */
export const AOS_AVAILABLE: ReadonlySet<AosSoundId> = new Set<AosSoundId>([])

export function isAosId(id: string): id is AosSoundId {
  return id in AOS_FALLBACK
}

/** The file (no extension) that actually plays for `id`: its own aos file when generated, else the mapped 42k file. */
export function soundFile(id: string): string {
  if (!isAosId(id)) return id
  return AOS_AVAILABLE.has(id) ? id : AOS_FALLBACK[id].id
}

/** Playback trim for `id`: only a fallback borrows a trim; a generated aos file plays as made. */
export function soundTrim(id: string): number {
  if (!isAosId(id) || AOS_AVAILABLE.has(id)) return 1
  return AOS_FALLBACK[id].volume ?? 1
}
