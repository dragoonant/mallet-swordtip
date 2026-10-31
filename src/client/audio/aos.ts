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
  // F8 armies: each has its own war cry, weapons, movement, beast or engine and death
  'aos-kruleboyz-war-cry', 'aos-kruleboyz-crossbow', 'aos-kruleboyz-killbow', 'aos-kruleboyz-hacka',
  'aos-kruleboyz-swamp-march', 'aos-kruleboyz-gnashtoof', 'aos-kruleboyz-death',
  'aos-gloomspite-cackle', 'aos-gloomspite-wolf-howl', 'aos-gloomspite-wolf-snarl', 'aos-gloomspite-grot-bow',
  'aos-gloomspite-wolf-run', 'aos-gloomspite-chariot', 'aos-gloomspite-death',
  'aos-lumineth-war-cry', 'aos-lumineth-arrow', 'aos-lumineth-wind-blast', 'aos-lumineth-pike',
  'aos-lumineth-wind-spirit', 'aos-lumineth-wind-rush', 'aos-lumineth-death',
  'aos-kharadron-war-cry', 'aos-kharadron-aether-pistol', 'aos-kharadron-volley-gun', 'aos-kharadron-harpoon',
  'aos-kharadron-broadside', 'aos-kharadron-propeller', 'aos-kharadron-airship-engine', 'aos-kharadron-death',
  // F12 armies
  'aos-stormcast-war-cry', 'aos-stormcast-hammer', 'aos-stormcast-javelin', 'aos-stormcast-gryph-shriek',
  'aos-stormcast-crow', 'aos-stormcast-wings', 'aos-stormcast-holy-flame', 'aos-stormcast-death',
  'aos-skaven-chitter', 'aos-skaven-warp-lightning', 'aos-skaven-cannon', 'aos-skaven-ratling-gun',
  'aos-skaven-gauntlet', 'aos-skaven-scurry', 'aos-skaven-death',
  'aos-seraphon-war-cry', 'aos-seraphon-club', 'aos-seraphon-spear', 'aos-seraphon-dartpipe',
  'aos-seraphon-terrawing', 'aos-seraphon-fire-breath', 'aos-seraphon-chimes', 'aos-seraphon-death',
  'aos-soulblight-hiss', 'aos-soulblight-lance', 'aos-soulblight-claws', 'aos-soulblight-gallop',
  'aos-soulblight-bone-march', 'aos-soulblight-vargheist', 'aos-soulblight-dark-spell', 'aos-soulblight-death',
  // F14 armies
  'aos-khorne-roar', 'aos-khorne-hound-bay', 'aos-khorne-hound-bite', 'aos-khorne-karanak',
  'aos-khorne-axe', 'aos-khorne-hound-run', 'aos-khorne-death',
  'aos-nurgle-hum', 'aos-nurgle-fly-buzz', 'aos-nurgle-plague-blade', 'aos-nurgle-sneeze',
  'aos-nurgle-gurgle', 'aos-nurgle-bell', 'aos-nurgle-death',
  'aos-nighthaunt-wail', 'aos-nighthaunt-shriek', 'aos-nighthaunt-chains', 'aos-nighthaunt-scythe',
  'aos-nighthaunt-blade', 'aos-nighthaunt-hooves', 'aos-nighthaunt-death',
  'aos-sylvaneth-call', 'aos-sylvaneth-wings', 'aos-sylvaneth-leaves', 'aos-sylvaneth-arrow',
  'aos-sylvaneth-lance', 'aos-sylvaneth-glaive', 'aos-sylvaneth-horn', 'aos-sylvaneth-death',
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
  // F8 armies (their own files are generated; these only cover a missing file)
  'aos-kruleboyz-war-cry': { id: 'ork-war-cry', volume: 0.85 },
  'aos-kruleboyz-crossbow': { id: 'stratagem-whoosh', volume: 0.3 },
  'aos-kruleboyz-killbow': { id: 'wpn-hunter-killer-missile', volume: 0.75 },
  'aos-kruleboyz-hacka': { id: 'wpn-choppa', volume: 0.85 },
  'aos-kruleboyz-swamp-march': { id: 'charge-rumble', volume: 0.5 },
  'aos-kruleboyz-gnashtoof': { id: 'power-klaw-crunch' },
  'aos-kruleboyz-death': { id: 'death-orks', volume: 0.5 },
  'aos-gloomspite-cackle': { id: 'ork-war-cry', volume: 0.7 },
  'aos-gloomspite-wolf-howl': { id: 'ork-war-cry', volume: 0.7 },
  'aos-gloomspite-wolf-snarl': { id: 'power-klaw-crunch', volume: 0.85 },
  'aos-gloomspite-grot-bow': { id: 'stratagem-whoosh', volume: 0.3 },
  'aos-gloomspite-wolf-run': { id: 'charge-rumble', volume: 0.6 },
  'aos-gloomspite-chariot': { id: 'charge-rumble', volume: 0.7 },
  'aos-gloomspite-death': { id: 'death-orks', volume: 0.45 },
  'aos-lumineth-war-cry': { id: 'marine-shout', volume: 0.8 },
  'aos-lumineth-arrow': { id: 'stratagem-whoosh', volume: 0.3 },
  'aos-lumineth-wind-blast': { id: 'stratagem-whoosh', volume: 0.5 },
  'aos-lumineth-pike': { id: 'wpn-big-choppa', volume: 0.7 },
  'aos-lumineth-wind-spirit': { id: 'stratagem-whoosh', volume: 0.6 },
  'aos-lumineth-wind-rush': { id: 'stratagem-whoosh', volume: 0.4 },
  'aos-lumineth-death': { id: 'model-death', volume: 0.85 },
  'aos-kharadron-war-cry': { id: 'marine-shout', volume: 0.85 },
  'aos-kharadron-aether-pistol': { id: 'wpn-slugga', volume: 0.7 },
  'aos-kharadron-volley-gun': { id: 'burst-cannon-whir', volume: 0.85 },
  'aos-kharadron-harpoon': { id: 'wpn-hunter-killer-missile', volume: 0.75 },
  'aos-kharadron-broadside': { id: 'wpn-bombast-field-gun', volume: 0.8 },
  'aos-kharadron-propeller': { id: 'charge-rumble', volume: 0.4 },
  'aos-kharadron-airship-engine': { id: 'charge-rumble', volume: 0.5 },
  'aos-kharadron-death': { id: 'death-astra-militarum', volume: 0.5 },
  // F12 armies (their own files are generated; these only cover a missing file)
  'aos-stormcast-war-cry': { id: 'marine-shout', volume: 0.8 },
  'aos-stormcast-hammer': { id: 'power-klaw-crunch' },
  'aos-stormcast-javelin': { id: 'stratagem-whoosh', volume: 0.4 },
  'aos-stormcast-gryph-shriek': { id: 'ork-war-cry', volume: 0.6 },
  'aos-stormcast-crow': { id: 'stratagem-whoosh', volume: 0.2 },
  'aos-stormcast-wings': { id: 'stratagem-whoosh', volume: 0.4 },
  'aos-stormcast-holy-flame': { id: 'stratagem-whoosh', volume: 0.5 },
  'aos-stormcast-death': { id: 'death-astra-militarum', volume: 0.5 },
  'aos-skaven-chitter': { id: 'ork-war-cry', volume: 0.6 },
  'aos-skaven-warp-lightning': { id: 'stratagem-whoosh', volume: 0.5 },
  'aos-skaven-cannon': { id: 'wpn-bombast-field-gun', volume: 0.8 },
  'aos-skaven-ratling-gun': { id: 'wpn-big-shoota', volume: 0.8 },
  'aos-skaven-gauntlet': { id: 'power-klaw-crunch' },
  'aos-skaven-scurry': { id: 'charge-rumble', volume: 0.4 },
  'aos-skaven-death': { id: 'death-tyranids', volume: 0.5 },
  'aos-seraphon-war-cry': { id: 'ork-war-cry', volume: 0.8 },
  'aos-seraphon-club': { id: 'wpn-brutal-assault-weapon', volume: 0.85 },
  'aos-seraphon-spear': { id: 'wpn-big-choppa', volume: 0.7 },
  'aos-seraphon-dartpipe': { id: 'stratagem-whoosh', volume: 0.3 },
  'aos-seraphon-terrawing': { id: 'wpn-claws-and-teeth', volume: 0.7 },
  'aos-seraphon-fire-breath': { id: 'stratagem-whoosh', volume: 0.6 },
  'aos-seraphon-chimes': { id: 'objective-captured-chime', volume: 0.6 },
  'aos-seraphon-death': { id: 'death-tyranids', volume: 0.5 },
  'aos-soulblight-hiss': { id: 'ork-war-cry', volume: 0.5 },
  'aos-soulblight-lance': { id: 'wpn-hallowed-mace', volume: 0.85 },
  'aos-soulblight-claws': { id: 'wpn-claws-and-teeth' },
  'aos-soulblight-gallop': { id: 'charge-rumble', volume: 0.6 },
  'aos-soulblight-bone-march': { id: 'charge-rumble', volume: 0.5 },
  'aos-soulblight-vargheist': { id: 'wpn-claws-and-teeth', volume: 0.7 },
  'aos-soulblight-dark-spell': { id: 'stratagem-whoosh', volume: 0.6 },
  'aos-soulblight-death': { id: 'model-death', volume: 0.85 },
  // F14 armies (their own files are generated; these only cover a missing file)
  'aos-khorne-roar': { id: 'ork-war-cry', volume: 0.85 },
  'aos-khorne-hound-bay': { id: 'ork-war-cry', volume: 0.6 },
  'aos-khorne-hound-bite': { id: 'wpn-claws-and-teeth' },
  'aos-khorne-karanak': { id: 'wpn-claws-and-teeth' },
  'aos-khorne-axe': { id: 'wpn-choppa', volume: 0.85 },
  'aos-khorne-hound-run': { id: 'charge-rumble', volume: 0.6 },
  'aos-khorne-death': { id: 'death-tyranids', volume: 0.5 },
  'aos-nurgle-hum': { id: 'ork-war-cry', volume: 0.5 },
  'aos-nurgle-fly-buzz': { id: 'charge-rumble', volume: 0.4 },
  'aos-nurgle-plague-blade': { id: 'wpn-choppa', volume: 0.85 },
  'aos-nurgle-sneeze': { id: 'stratagem-whoosh', volume: 0.3 },
  'aos-nurgle-gurgle': { id: 'stratagem-whoosh', volume: 0.4 },
  'aos-nurgle-bell': { id: 'objective-captured-chime', volume: 0.6 },
  'aos-nurgle-death': { id: 'death-orks', volume: 0.5 },
  'aos-nighthaunt-wail': { id: 'stratagem-whoosh', volume: 0.6 },
  'aos-nighthaunt-shriek': { id: 'stratagem-whoosh', volume: 0.6 },
  'aos-nighthaunt-chains': { id: 'charge-rumble', volume: 0.4 },
  'aos-nighthaunt-scythe': { id: 'wpn-big-choppa', volume: 0.7 },
  'aos-nighthaunt-blade': { id: 'wpn-choppa', volume: 0.8 },
  'aos-nighthaunt-hooves': { id: 'charge-rumble', volume: 0.5 },
  'aos-nighthaunt-death': { id: 'stratagem-whoosh', volume: 0.4 },
  'aos-sylvaneth-call': { id: 'stratagem-whoosh', volume: 0.5 },
  'aos-sylvaneth-wings': { id: 'stratagem-whoosh', volume: 0.4 },
  'aos-sylvaneth-leaves': { id: 'stratagem-whoosh', volume: 0.4 },
  'aos-sylvaneth-arrow': { id: 'stratagem-whoosh', volume: 0.3 },
  'aos-sylvaneth-lance': { id: 'wpn-hallowed-mace', volume: 0.85 },
  'aos-sylvaneth-glaive': { id: 'wpn-big-choppa', volume: 0.7 },
  'aos-sylvaneth-horn': { id: 'turn-start-horn', volume: 0.7 },
  'aos-sylvaneth-death': { id: 'model-death', volume: 0.85 },
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
export const AOS_AVAILABLE: ReadonlySet<AosSoundId> = new Set<AosSoundId>([
  'aos-ambient-bed',
  'aos-armour-hit',
  'aos-armoured-march',
  'aos-battle-tactic-scored',
  'aos-cannon-fire',
  'aos-cannonball-impact',
  'aos-choppa-hit',
  'aos-defeat',
  'aos-fist-smash',
  'aos-halberd-strike',
  'aos-horse-charge',
  'aos-horse-gallop',
  'aos-human-battle-cry',
  'aos-human-death-1',
  'aos-human-death-2',
  'aos-lance-charge-impact',
  'aos-marshal-command',
  'aos-miss-whoosh',
  'aos-objective-captured',
  'aos-orruk-death-1',
  'aos-orruk-death-2',
  'aos-orruk-roar',
  'aos-orruk-stomp',
  'aos-priority-drumroll',
  'aos-round-start-war-horn',
  'aos-shield-bash',
  'aos-stinger-banner-and-blade',
  'aos-stinger-cold-hearth',
  'aos-stinger-gate-of-ash',
  'aos-stinger-iron-vanguard',
  'aos-stinger-last-stand',
  'aos-stinger-the-long-march',
  'aos-sword-clash',
  'aos-victory',
  // F8 armies
  'aos-kruleboyz-war-cry', 'aos-kruleboyz-crossbow', 'aos-kruleboyz-killbow', 'aos-kruleboyz-hacka',
  'aos-kruleboyz-swamp-march', 'aos-kruleboyz-gnashtoof', 'aos-kruleboyz-death',
  'aos-gloomspite-cackle', 'aos-gloomspite-wolf-howl', 'aos-gloomspite-wolf-snarl', 'aos-gloomspite-grot-bow',
  'aos-gloomspite-wolf-run', 'aos-gloomspite-chariot', 'aos-gloomspite-death',
  'aos-lumineth-war-cry', 'aos-lumineth-arrow', 'aos-lumineth-wind-blast', 'aos-lumineth-pike',
  'aos-lumineth-wind-spirit', 'aos-lumineth-wind-rush', 'aos-lumineth-death',
  'aos-kharadron-war-cry', 'aos-kharadron-aether-pistol', 'aos-kharadron-volley-gun', 'aos-kharadron-harpoon',
  'aos-kharadron-broadside', 'aos-kharadron-propeller', 'aos-kharadron-airship-engine', 'aos-kharadron-death',
  // F12 armies
  'aos-stormcast-war-cry', 'aos-stormcast-hammer', 'aos-stormcast-javelin', 'aos-stormcast-gryph-shriek',
  'aos-stormcast-crow', 'aos-stormcast-wings', 'aos-stormcast-holy-flame', 'aos-stormcast-death',
  'aos-skaven-chitter', 'aos-skaven-warp-lightning', 'aos-skaven-cannon', 'aos-skaven-ratling-gun',
  'aos-skaven-gauntlet', 'aos-skaven-scurry', 'aos-skaven-death',
  'aos-seraphon-war-cry', 'aos-seraphon-club', 'aos-seraphon-spear', 'aos-seraphon-dartpipe',
  'aos-seraphon-terrawing', 'aos-seraphon-fire-breath', 'aos-seraphon-chimes', 'aos-seraphon-death',
  'aos-soulblight-hiss', 'aos-soulblight-lance', 'aos-soulblight-claws', 'aos-soulblight-gallop',
  'aos-soulblight-bone-march', 'aos-soulblight-vargheist', 'aos-soulblight-dark-spell', 'aos-soulblight-death',
  // F14 armies
  'aos-khorne-roar', 'aos-khorne-hound-bay', 'aos-khorne-hound-bite', 'aos-khorne-karanak',
  'aos-khorne-axe', 'aos-khorne-hound-run', 'aos-khorne-death',
  'aos-nurgle-hum', 'aos-nurgle-fly-buzz', 'aos-nurgle-plague-blade', 'aos-nurgle-sneeze',
  'aos-nurgle-gurgle', 'aos-nurgle-bell', 'aos-nurgle-death',
  'aos-nighthaunt-wail', 'aos-nighthaunt-shriek', 'aos-nighthaunt-chains', 'aos-nighthaunt-scythe',
  'aos-nighthaunt-blade', 'aos-nighthaunt-hooves', 'aos-nighthaunt-death',
  'aos-sylvaneth-call', 'aos-sylvaneth-wings', 'aos-sylvaneth-leaves', 'aos-sylvaneth-arrow',
  'aos-sylvaneth-lance', 'aos-sylvaneth-glaive', 'aos-sylvaneth-horn', 'aos-sylvaneth-death',
])

/** Inherited 42k narrator ids that now play the Spearhead narrator (public/audio/aos-narr-*.mp3, one voice). */
export const NARR_ALIAS: Readonly<Record<string, string>> = {
  'narr-battle-round-one': 'aos-narr-battle-round-one',
  'narr-movement-phase': 'aos-narr-movement-phase',
  'narr-shooting-phase': 'aos-narr-shooting-phase',
  'narr-charge': 'aos-narr-charge-phase',
  'narr-fight-phase': 'aos-narr-combat-phase',
  'narr-command-phase': 'aos-narr-hero-phase',
  'narr-victory': 'aos-narr-victory',
  'narr-defeat': 'aos-narr-defeat',
  'narr-objective-taken': 'aos-narr-objective-taken',
  'narr-unit-destroyed': 'aos-narr-unit-destroyed',
  'narr-your-turn': 'aos-narr-your-turn',
  'narr-battle-round-two': 'aos-narr-battle-round-two',
  'narr-battle-round-three': 'aos-narr-battle-round-three',
  'narr-battle-round-four': 'aos-narr-battle-round-four',
  'narr-roll-for-priority': 'aos-narr-roll-for-priority',
  'narr-end-of-turn': 'aos-narr-end-of-turn',
  'narr-battle-tactic-complete': 'aos-narr-battle-tactic-complete',
  'narr-twist-revealed': 'aos-narr-twist-revealed',
}

export function isAosId(id: string): id is AosSoundId {
  return id in AOS_FALLBACK
}

/** The file (no extension) that actually plays for `id`: its own aos file when generated, else the mapped 42k file. */
export function soundFile(id: string): string {
  if (!isAosId(id)) return NARR_ALIAS[id] ?? id
  return AOS_AVAILABLE.has(id) ? id : AOS_FALLBACK[id].id
}

/** Playback trim for `id`: only a fallback borrows a trim; a generated aos file plays as made. */
export function soundTrim(id: string): number {
  if (!isAosId(id) || AOS_AVAILABLE.has(id)) return 1
  return AOS_FALLBACK[id].volume ?? 1
}
