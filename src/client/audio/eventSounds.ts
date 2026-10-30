// Maps engine GameEvents (src/engine/events.ts) to sounds from the manifest. Pure/no side effects —
// playEventSounds is the only function that actually calls the AudioManager, so this stays easy to
// unit-test and easy for whoever wires the store (src/client/store/game.ts, not owned by this task)
// to drop into their event-handling: something like
//   useEffect(() => { for (const e of newEvents) playEventSounds(audio, e, humanSeat) }, [events])
//
// Firing sounds are per weapon, not per attack kind: TargetsDeclared is the event that names the
// weapons (AttackSequenceStarted only says ranged/melee), so that is where the shot SFX come from —
// one per distinct weapon flavour in the declaration, so a ten-model squad firing one gun is one
// sound, and a squad firing a bolter and a flamer at once is two. The classification is shared with
// the tracer look; see src/client/weaponFlavour.ts. Callers that have the data bundle pass a
// `SoundLookup`; without one the firing sounds fall back to the attacker's faction alone.

import type { GameEvent } from '../../engine/events'
import type { PlayerId, Phase } from '../../engine/types'
import type { WeaponData } from '../../data/types'
import { weaponFlavour, type WeaponFlavour } from '../weaponFlavour'
import type { AudioManager, PlayOptions } from './manager'
import { SFX_IDS, type SfxId, type SoundId, type VoiceId } from './manifest'
import type { AosSfxId } from './aos'

export interface EventSound {
  id: SoundId
  opts?: PlayOptions
}

// Spearhead calls them the Hero, Movement, Shooting, Charge and Combat phases (the HUD banner says so), so the narrator
// only speaks the two lines that match; the Combat phase is opened by the army's marshal instead of a "Fight phase" line.
const PHASE_VOICE_LINE: Partial<Record<Phase, VoiceId>> = {
  movement: 'narr-movement-phase',
  charge: 'narr-charge',
}

/** The per-weapon SFX for each flavour, with a playback trim where the asset itself is much louder
 *  than the rest of the palette. 'force' shares the psychic zap: a force weapon reads as a crackle in
 *  melee the same way Smite does at range.
 *
 *  The trims are measured, not guessed: decoded RMS across these seven assets runs from 0.09
 *  (power-klaw-crunch) to 0.31 (shoota-spray), so an ork mob firing shootas came out roughly three
 *  times louder than marines firing bolters at the same master volume — very audible now that each
 *  weapon has its own sound rather than everything sharing one. These pull the loud ones back to the
 *  ~0.15-0.18 RMS the others already sit at. Re-measure if an asset is regenerated. */
const FLAVOUR_SOUND: Record<WeaponFlavour, { id: SfxId; volume?: number }> = {
  bolter: { id: 'bolter-burst' },
  shoota: { id: 'shoota-spray', volume: 0.55 },
  heavy: { id: 'heavy-gun' },
  flame: { id: 'flamer', volume: 0.58 },
  psychic: { id: 'psychic-zap', volume: 0.9 },
  chain: { id: 'melee-chainsword' },
  crush: { id: 'power-klaw-crunch' },
  force: { id: 'psychic-zap', volume: 0.9 },
}

/** Spearhead weapons (Cities of Sigmar, Ironjawz, Slaves to Darkness, Fyreslayers) by what their id or name says. Blades and polearms swing, the
 *  lance crashes, hooves and sidearms thud, choppas chop, brute gear smashes, the Great Cannon booms. These are `aos-`
 *  ids: each plays its own generated file when there is one, else the mapped 42k file (aos.ts). */
const AOS_FACTION_ID = /^(cities|ironjawz|slaves|fyreslayers)\./
const AOS_WEAPON_RULES: readonly (readonly [RegExp, SoundId, number?])[] = [
  [/grapeshot/, 'aos-cannon-fire', 0.85],
  [/cannon/, 'aos-cannon-fire'],
  [/pistol|handgun|flintlock|musket|blunderbuss/, 'wpn-slugga', 0.7],
  [/lance|cavalier/, 'aos-lance-charge-impact'],
  [/longsword|sword|rapier|sabre/, 'aos-sword-clash'],
  [/halberd|spear|pike|freeguild|steelhelm|poleaxe|javelin/, 'aos-halberd-strike'],
  // Darkoath fellrider blades are curved cavalry sabres; the Warqueen's rune-etched axe and Fyreslayer axes fall to the chop below.
  [/fellrider|blades?/, 'aos-sword-clash'],
  [/hoove?s|crew|sidearm|shield/, 'aos-shield-bash'],
  [/choppa|stikka|rager|cleaver|axe/, 'aos-choppa-hit'],
  [/brute|fist|klaw|club|gore/, 'aos-fist-smash'],
]

/** The swing or shot for a Spearhead weapon, or undefined for any other game's weapon id. Melee that nothing above
 *  names falls to a generic blow for the faction. */
export function aosWeaponSound(weaponId: string, weaponName = '', melee = true): { id: SoundId; volume?: number } | undefined {
  if (!AOS_FACTION_ID.test(weaponId)) return undefined
  const text = `${weaponId.slice(weaponId.indexOf('.') + 1)} ${weaponName}`.toLowerCase()
  const hit = AOS_WEAPON_RULES.find(([re]) => re.test(text))
  if (hit) return hit[2] === undefined ? { id: hit[1] } : { id: hit[1], volume: hit[2] }
  if (!melee) return undefined
  // Orruk, Darkoath and duardin gear is all axes and crude iron: the chop; only the Cities' drilled steel is the halberd.
  return { id: weaponId.startsWith('cities.') ? 'aos-halberd-strike' : 'aos-choppa-hit' }
}

/** What a caller with the data bundle and game state can offer for weapon-accurate firing sounds
 *  (src/client/presentation/director.ts builds one per event batch). Both members are optional-safe:
 *  an unknown weapon or unit just classifies on what's left. */
export interface SoundLookup {
  weapon(weaponId: string): WeaponData | undefined
  factionOfUnit(unitId: string): string
  /** Datasheet keywords of a unit (CAVALRY, INFANTRY ...); optional so older callers and tests need not supply it. */
  keywordsOfUnit?(unitId: string): readonly string[]
}

/** Every weapon in the bundle has its own sound (public/audio/wpn-<slug>.mp3). A weapon id matches the
 *  longest slug it contains, so 'am.w.plasma-gun-supercharge' is the plasma gun and 'tyr.w.leapers-talons'
 *  is the talons; profile variants share their weapon's sound. Chainswords and the power klaw keep the
 *  original assets (the owner likes them). An id that matches nothing falls back to its flavour sound.
 *  Trims pull the loudest generated assets back toward the rest of the palette (decoded RMS, see
 *  WEAPON_TRIM); re-measure if an asset is regenerated. */
const WEAPON_SLUGS: readonly (readonly [string, SfxId])[] = [
  ...SFX_IDS.filter((id) => id.startsWith('wpn-')).map((id) => [id.slice(4), id] as const),
  ['chainsword', 'melee-chainsword'] as const,
  // Thoryk's Void Hunters: bolt rifles and master-crafted bolters crack like boltguns, the combat knife is a plain close-combat strike,
  // the power weapon rings, the Invictor's fist crunches, its autocannon borrows the assault cannon and its stubber the heavy bolter.
  ['bolt-rifle', 'wpn-boltgun'] as const,
  // Deathwatch: the reductor pistol cracks like a bolt pistol, flamestorm gauntlets roar like a flamer, twin power fists crunch like a power fist.
  ['reductor-pistol', 'wpn-bolt-pistol'] as const,
  ['flamestorm-gauntlets', 'wpn-flamer'] as const,
  ['twin-power-fists', 'wpn-power-fist'] as const,
  ['master-crafted-bolter', 'wpn-boltgun'] as const,
  ['combat-knife', 'wpn-close-combat-weapon'] as const,
  ['invictor-fist', 'wpn-power-fist'] as const,
  ['twin-ironhail-autocannon', 'wpn-assault-cannon'] as const,
  ['twin-ironhail-heavy-stubber', 'wpn-heavy-bolter'] as const,
  // Strike Team Solarien: carbines crack like boltguns, the autocannon borrows the assault cannon, paired blades ring like power weapons.
  ['bolt-carbine', 'wpn-boltgun'] as const,
  ['accelerator-autocannon', 'wpn-assault-cannon'] as const,
  ['paired-combat-blades', 'wpn-power-weapon'] as const,
  ['power-klaw', 'power-klaw-crunch'] as const,
  // Strike Force Marcellos: the bolt rifle barks like a boltgun, the flamestorm gauntlets roar like a heavy flamer, the Impulsor's missile
  // array lobs frags like a grenade launcher, hits armour with a krak like a rocket launcher and sends an Icarus rocket like a hunter-killer.
  ['bolt-rifle', 'wpn-boltgun'] as const,
  ['flamestorm-gauntlets', 'wpn-heavy-flamer'] as const,
  ['bellicatus-frag', 'wpn-grenade-launcher'] as const,
  ['bellicatus-krak', 'wpn-malleus-rocket-launcher'] as const,
  ['bellicatus-icarus', 'wpn-hunter-killer-missile'] as const,
  // Morgrim's Butchas: the beast klaw crunches like a power klaw, snappa and jaws bite, the thump gun lobs a shell.
  ['beast-snagga-klaw', 'power-klaw-crunch'] as const,
  ['power-snappa', 'wpn-claws-and-teeth'] as const,
  ['squighog-jaws', 'wpn-claws-and-teeth'] as const,
  ['thump-gun', 'wpn-grenade-launcher'] as const,
  ['saddlegit-weapons', 'wpn-shoota'] as const,
  ['stikka-ranged', 'wpn-shoota'] as const,
  ['stikka', 'wpn-close-combat-weapon'] as const,
  // Grey Knights have their own generated sounds (public/audio: purge-soul, psilencer-burst, psycannon-burst, nemesis-force-swing).
  ['purge-soul', 'purge-soul'] as const,
  ['psilencer', 'psilencer-burst'] as const,
  ['heavy-psycannon', 'psycannon-burst'] as const,
  ['psycannon', 'psycannon-burst'] as const,
  ['greatsword', 'nemesis-force-swing'] as const,
  // T'au have their own generated sounds; the missile, stave and fists still borrow.
  // Custodes: the spear's bolt-gun, spear/lance sweeps, sentinel blades and the executioner greatblade.
  ['guardian-spear-ranged', 'guardian-spear-shot'] as const,
  ['guardian-spear-melee', 'guardian-spear-swing'] as const,
  ['interceptor-lance', 'guardian-spear-swing'] as const,
  ['sentinel-blade', 'sentinel-blade-strike'] as const,
  ['executioner-greatblade', 'castellan-axe-cleave'] as const,
  ['castellan-axe-ranged', 'guardian-spear-shot'] as const,
  ['castellan-axe-melee', 'castellan-axe-cleave'] as const,
  ['vaultswords', 'sentinel-blade-strike'] as const,
  ['pulse-rifle', 'pulse-rifle-shot'] as const,
  ['pulse-carbine', 'pulse-carbine-burst'] as const,
  ['pulse-pistol', 'pulse-rifle-shot'] as const,
  ['burst-cannon', 'burst-cannon-whir'] as const,
  ['fusion-blaster', 'fusion-blast'] as const,
  ['cyclic-ion-raker', 'ion-raker'] as const,
  ['support-turret-missile', 'wpn-hunter-killer-missile'] as const,
  ['honour-stave', 'wpn-force-weapon'] as const,
  ['battlesuit-fists', 'wpn-power-fist'] as const,
  ['ghostkeel-fists', 'wpn-power-fist'] as const,
  // Sudden Dawn Cadre: frag projector pops like a launcher, plasma rifle thumps, rail rifle borrows the ion raker, blaster and hull borrow.
  ['airbursting-fragmentation-projector', 'wpn-grenade-launcher'] as const,
  ['plasma-rifle', 'wpn-plasma-gun'] as const,
  ['rail-rifle', 'ion-raker'] as const,
  ['pulse-blaster', 'pulse-carbine-burst'] as const,
  ['armoured-hull', 'wpn-power-fist'] as const,
  // Genestealer Cults borrow too: mining gear and improvised bludgeons crunch like fists, cult claws rend like talons.
  ['hybrid-firearm', 'cult-autogun-burst'] as const,
  ['leader-pistol', 'wpn-laspistol'] as const,
  ['heavy-stubber', 'wpn-big-shoota'] as const,
  ['seismic-cannon', 'seismic-cannon'] as const,
  ['webber', 'webber-spray'] as const,
  ['demolition-charge', 'wpn-grenade-launcher'] as const,
  ['clearance-incinerator', 'wpn-heavy-flamer'] as const,
  // World Eaters: chain blades whir like chainswords, the eviscerator and Juggernaut horn are brutal bludgeons, the skullsmasher crunches
  // like a fist, Karagar's exalted blade rings like a relic weapon (his plasma pistols match the plasma-pistol sound by name).
  ['berzerker-chainblade', 'melee-chainsword'] as const,
  ['jakhal-chainblades', 'melee-chainsword'] as const,
  ['mauler-chainblade', 'melee-chainsword'] as const,
  ['khornate-eviscerator', 'wpn-brutal-assault-weapon'] as const,
  ['juggernauts-bladed-horn', 'wpn-brutal-assault-weapon'] as const,
  ['exalted-chainblade', 'wpn-relic-weapon'] as const,
  ['skullsmasher', 'wpn-power-fist'] as const,
  // Chaos Space Marines (Dark Zealots / Havocs / Helbrute): crozius rings like a power weapon, the rest borrow.
  ['accursed-crozius', 'wpn-power-weapon'] as const,
  ['dark-disciple-ccw', 'wpn-close-combat-weapon'] as const,
  ['havoc-lascannon', 'wpn-plasma-cannon'] as const,
  ['missile-launcher', 'wpn-malleus-rocket-launcher'] as const,
  ['reaper-chaincannon', 'wpn-assault-cannon'] as const,
  ['helbrute-hammer', 'wpn-power-fist'] as const,
  ['magus-stave', 'wpn-staff-of-possession'] as const,
  ['cult-claws-and-knife', 'wpn-claws-and-teeth'] as const,
  ['heavy-mining-tool', 'rock-drill-grind'] as const,
  ['leaders-cult-weapons', 'wpn-power-weapon'] as const,
  ['heavy-improvised-weapon', 'wpn-brutal-assault-weapon'] as const,
  ['hypermorph-tail', 'wpn-talons'] as const,
  ['drilldozer-blade', 'rock-drill-grind'] as const,
  // Claw of Ascension: sniper and Atalan small arms crack like cult autoguns, the mining laser melts, the Ridgerunner's launcher borrows the missile.
  ['cult-sniper-rifle', 'wpn-lasgun'] as const,
  ['atalan-small-arms', 'cult-autogun-burst'] as const,
  ['mining-laser', 'wpn-meltagun'] as const,
  ['achilles-missile-launcher', 'wpn-hunter-killer-missile'] as const,
  ['ccw-', 'wpn-close-combat-weapon'] as const,
  ['leaders-bio-weapons', 'wpn-claws-and-teeth'] as const,
  ['metamorph-mutations', 'wpn-brutal-assault-weapon'] as const,
  ['armoured-hull', 'wpn-brutal-assault-weapon'] as const,
  // Adeptus Custodes borrow too: the guardian's storm-bolter-in-a-blade barks like a storm bolter, spear and blades ring like power weapons.
  ['sentinel-blade-ranged', 'wpn-storm-bolter'] as const,
  ['guardian-spear-ranged', 'wpn-boltgun'] as const,
  ['hurricane-bolter', 'wpn-storm-bolter'] as const,
  ['sentinel-blade', 'wpn-power-weapon'] as const,
  ['guardian-spear-melee', 'wpn-power-weapon'] as const,
  ['misericordia', 'wpn-close-combat-weapon'] as const,
  ['interceptor-lance', 'wpn-relic-weapon'] as const,
  ['executioner-greatblade', 'wpn-relic-weapon'] as const,
  ['balistus-grenade-launcher', 'wpn-grenade-launcher'] as const,
  // The Penitent Host: Seraphim blades and whips ring like power weapons, the eviscerator and buzz-blades rev and bite, tracks crunch.
  ['seraphim-ccw', 'wpn-close-combat-weapon'] as const,
  ['neural-whips', 'wpn-power-weapon'] as const,
  ['penitent-eviscerator', 'wpn-brutal-assault-weapon'] as const,
  ['penitent-buzz-blades', 'wpn-spinnin-blades'] as const,
  ['armoured-tracks', 'wpn-brutal-assault-weapon'] as const,
  // Leagues of Votann borrow: ion blasters crack like pulse rifles, rail rifles like the ion raker, the disintegrator thumps like a plasma cannon,
  // HYLas and magna-coil guns chatter like an autogun / assault cannon, gauntlets crunch like fists, plasma axes ring like relic blades.
  ['volkanite-disintegrator', 'wpn-plasma-cannon'] as const,
  ['ion-blaster', 'pulse-rifle-shot'] as const,
  ['autoch-pattern-bolter', 'wpn-boltgun'] as const,
  ['hylas-auto-rifle', 'wpn-autogun'] as const,
  ['hylas-rotary-cannon', 'wpn-assault-cannon'] as const,
  ['magna-rail-rifle', 'ion-raker'] as const,
  ['magna-coil-autocannon', 'wpn-assault-cannon'] as const,
  ['bolt-revolver', 'wpn-bolt-pistol'] as const,
  ['bolt-shotgun', 'wpn-boltgun'] as const,
  ['mass-gauntlet', 'wpn-power-fist'] as const,
  ['concussion-gauntlet', 'wpn-power-fist'] as const,
  ['kin-melee-weapon', 'wpn-close-combat-weapon'] as const,
  ['plasma-knife', 'wpn-power-weapon'] as const,
  ['heavy-plasma-axe', 'wpn-relic-weapon'] as const,
  // Drukhari: splinter weapons patter like autoguns (the cannon like a big shoota), the shredder sprays shards, blades ring
  // like power weapons (klaives hum like hyperphase), disintegrators thump like plasma, dark lances fire a tachyon-style beam.
  ['splinter-pistol', 'wpn-autopistol'] as const,
  ['splinter-rifle', 'wpn-autogun'] as const,
  ['splinter-cannon', 'wpn-big-shoota'] as const,
  ['shredder', 'webber-spray'] as const,
  ['huskblade', 'wpn-power-weapon'] as const,
  ['sybarite-weapon', 'wpn-power-weapon'] as const,
  ['demiklaives', 'wpn-hyperphase-weapons'] as const,
  ['klaive', 'wpn-hyperphase-weapons'] as const,
  ['disintegrator-cannon', 'wpn-plasma-cannon'] as const,
  ['dark-lance', 'wpn-tachyon-arrow'] as const,
  ['bladevanes', 'wpn-spinnin-blades'] as const,
  // The Fatebreakers (Aeldari): shuriken weapons spray like autoguns, psychic weapons crackle like Smite, the spear and glaive ring like power blades, the heavy guns borrow plasma and laser sounds.
  ['eldritch-storm', 'wpn-smite'] as const,
  ['singing-spear-ranged', 'wpn-smite'] as const,
  ['singing-spear', 'wpn-power-weapon'] as const,
  ['shuriken-pistol', 'wpn-autopistol'] as const,
  ['shuriken-catapult', 'wpn-autogun'] as const,
  ['starcannon', 'wpn-plasma-cannon'] as const,
  ['scatter-laser', 'wpn-lasgun'] as const,
  ['bright-lance', 'wpn-plasma-cannon'] as const,
  ['ghostglaive', 'wpn-relic-weapon'] as const,
  // Adeptus Mechanicus: arc and radium weapons crackle like gauss, plasma and phosphor borrow the plasma and flame guns,
  // the transonic cannon borrows the psychoclastic torrent, staffs and goads ring like force weapons, the arc maul crunches.
  ['transonic-cannon', 'wpn-psychoclastic-torrent'] as const,
  ['omnissian-staff', 'wpn-force-weapon'] as const,
  ['mechanicus-pistol', 'wpn-laspistol'] as const,
  ['arc-rifle', 'wpn-gauss-flayer'] as const,
  ['plasma-caliver', 'wpn-plasma-gun'] as const,
  ['radium-carbine', 'wpn-lasgun'] as const,
  ['alpha-combat-weapon', 'wpn-power-weapon'] as const,
  ['phosphor-blast-carbine', 'wpn-pyreblaster'] as const,
  ['phosphor-pistol', 'wpn-flamer'] as const,
  ['sulphur-breath', 'wpn-flamer'] as const,
  ['phosphor-torch', 'wpn-heavy-flamer'] as const,
  ['cavalry-arc-maul', 'wpn-power-fist'] as const,
  ['clawed-limbs', 'wpn-talons'] as const,
  ['flechette-blaster', 'wpn-autopistol'] as const,
  ['taser-goad', 'wpn-force-weapon'] as const,
  // Maniple Verask-Alpha: the Enginseer's axe rings and his servo-arm crunches, galvanic rifles chatter like autoguns, the arquebus cracks like a
  // tachyon arrow, flamers and phosphor guns reuse the flame sounds, grav and plasma culverins thump like a plasma cannon, the Dunecrawler's
  // stubber and Icarus array rattle like the heavy bolter and assault cannon, its Daedalus launcher borrows the hunter-killer, its legs stomp.
  ['omnissian-axe', 'wpn-power-weapon'] as const,
  ['servo-arm', 'wpn-power-fist'] as const,
  ['galvanic-rifle', 'wpn-autogun'] as const,
  ['transuranic-arquebus', 'wpn-tachyon-arrow'] as const,
  ['cognis-flamer', 'wpn-flamer'] as const,
  ['heavy-grav-cannon', 'wpn-plasma-cannon'] as const,
  ['kataphron-plasma-culverin', 'wpn-plasma-cannon'] as const,
  ['phosphor-blaster', 'wpn-pyreblaster'] as const,
  ['kataphron-close-combat-weapon', 'wpn-close-combat-weapon'] as const,
  ['cognis-heavy-stubber', 'wpn-heavy-bolter'] as const,
  ['daedalus-missile-launcher', 'wpn-hunter-killer-missile'] as const,
  ['icarus-array', 'wpn-assault-cannon'] as const,
  ['dunecrawler-legs', 'wpn-brutal-assault-weapon'] as const,
  // Death Guard: the spewer coughs flame, launchers and grenades thump like the Guard's, the manreaper rings like a power weapon,
  // the heavy plague weapon crunches, knives and the injector pistol borrow the plain close-combat and autopistol sounds.
  ['plague-spewer', 'wpn-flamer'] as const,
  ['blight-launcher', 'wpn-grenade-launcher'] as const,
  ['hyper-blight-grenades', 'wpn-grenade-launcher'] as const,
  ['injector-pistol', 'wpn-autopistol'] as const,
  ['manreaper', 'wpn-power-weapon'] as const,
  ['heavy-plague-weapon', 'wpn-power-fist'] as const,
  ['plague-knives', 'wpn-close-combat-weapon'] as const,
  ['improvised-weapon', 'wpn-close-combat-weapon'] as const,
  // Thousand Sons (The Coven of Temporus): inferno bolters bark like the Marine equivalents, the Screamer Invocation crackles like Smite,
  // the missile rack borrows the hunter-killer, the soulreaper cannon rattles like an assault cannon, the khopesh rings like a power blade.
  ['combi-bolter', 'wpn-combi-weapon'] as const,
  ['screamer-invocation', 'wpn-smite'] as const,
  ['hellfyre-missile-rack', 'wpn-hunter-killer-missile'] as const,
  ['soulreaper-cannon', 'wpn-assault-cannon'] as const,
  ['prosperine-khopesh', 'wpn-power-weapon'] as const,
  // Chaos Daemons (Khorne): hellblades and the Bloodmaster's blade ring like power weapons, the Juggernaut's horn crashes like
  // a fist, Flesh Hound fangs tear like talons, and the Gore Hound's burning roar is a flamer.
  ['blade-of-blood', 'wpn-power-weapon'] as const,
  ['hellblade', 'wpn-power-weapon'] as const,
  ['gore-drenched-fangs', 'wpn-talons'] as const,
  ['burning-roar', 'wpn-flamer'] as const,
  // Dark Angels (Mordekai's Judgement): the absolvor barks like a bolt pistol, the bolt rifle like a boltgun, the crozius rings like a power weapon, assault bolters like storm bolters,
  // the Redemptor's Icarus pod borrows the hunter-killer, its macro plasma thumps like a plasma cannon, the gatling rattles like an assault cannon,
  // the fragstorm launcher pops like a grenade launcher and its fist crunches.
  ['absolvor-bolt-pistol', 'wpn-bolt-pistol'] as const,
  ['bolt-rifle', 'wpn-boltgun'] as const,
  ['crozius-arcanum', 'wpn-power-weapon'] as const,
  ['assault-bolters', 'wpn-storm-bolter'] as const,
  ['icarus-rocket-pod', 'wpn-hunter-killer-missile'] as const,
  ['macro-plasma-incinerator', 'wpn-plasma-cannon'] as const,
  ['onslaught-gatling-cannon', 'wpn-assault-cannon'] as const,
  ['fragstorm-grenade-launcher', 'wpn-grenade-launcher'] as const,
  ['redemptor-fist', 'wpn-power-fist'] as const,
  // Dark Angels (The Vengeful Brethren): Zacharial's boltstorm gauntlet chatters like a storm bolter; the Hellblasters' plasma incinerators thump like a plasma cannon.
  ['boltstorm-gauntlet', 'wpn-storm-bolter'] as const,
  ['plasma-incinerator', 'wpn-plasma-cannon'] as const,
  // Black Templars (Siguard's Crusaders): the Neophyte firearm is a light carbine that barks like a boltgun, the master-crafted power weapon rings like a power weapon.
  ['neophyte-firearm', 'wpn-boltgun'] as const,
  ['master-crafted-power-weapon', 'wpn-power-weapon'] as const,
  // The Impulsor's multi-melta spits a melta beam like a meltagun.
  ['multi-melta', 'wpn-meltagun'] as const,
].sort((a, b) => b[0].length - a[0].length)

const WEAPON_TRIM: Partial<Record<SfxId, number>> = {
  'guardian-spear-shot': 0.85,
  'sentinel-blade-strike': 0.8,
  'castellan-axe-cleave': 0.78,
  'pulse-rifle-shot': 0.75,
  'pulse-carbine-burst': 0.7,
  'burst-cannon-whir': 0.72,
  'fusion-blast': 0.65,
  'ion-raker': 0.55,
  'cult-autogun-burst': 0.65,
  'webber-spray': 0.9,
  'wpn-autopistol': 0.66,
  'wpn-boltgun': 0.8,
  'wpn-assault-cannon': 0.3,
  'wpn-autogun': 0.73,
  'wpn-barblauncher': 0.75,
  'wpn-big-choppa': 0.64,
  'wpn-big-shoota': 0.57,
  'wpn-bombast-field-gun': 0.41,
  'wpn-close-combat-weapon': 0.64,
  'wpn-doomsday-blaster': 0.35,
  'wpn-flamer': 0.44,
  'wpn-force-weapon': 0.68,
  'wpn-gauss-flayer': 0.68,
  'wpn-gauss-reaper': 0.65,
  'wpn-grenade-launcher': 0.72,
  'wpn-heavy-bolter': 0.39,
  'wpn-heavy-flamer': 0.41,
  'wpn-hunter-killer-missile': 0.38,
  'wpn-lasgun': 0.72,
  'wpn-malleus-rocket-launcher': 0.62,
  'wpn-meltagun': 0.59,
  'wpn-plasma-cannon': 0.69,
  'wpn-plasma-gun': 0.67,
  'wpn-plasma-pistol': 0.69,
  'wpn-psychoclastic-torrent': 0.33,
  'wpn-pyreblaster': 0.59,
  'wpn-rite-of-possession': 0.7,
  'wpn-rokkit-launcha': 0.47,
  'wpn-shoota': 0.39,
  'wpn-uge-choppa': 0.8,
}

export function weaponSound(weaponId: string): { id: SfxId; volume?: number } | undefined {
  const name = weaponId.slice(weaponId.indexOf('.w.') + 1)
  const hit = WEAPON_SLUGS.find(([slug]) => name.includes(slug))
  if (!hit) return undefined
  const volume = WEAPON_TRIM[hit[1]]
  return volume === undefined ? { id: hit[1] } : { id: hit[1], volume }
}

/** The distinct weapon sounds for one TargetsDeclared, in declaration order. Deduped by sound, so a
 *  squad whose models all fire the same gun gets one shot sound rather than ten stacked (the manager
 *  would throttle them anyway — see MAX_CONCURRENT_PER_ID — but then the *count* would depend on
 *  throttle timing rather than on what was fired). */
function firingSounds(event: Extract<GameEvent, { type: 'TargetsDeclared' }>, lookup?: SoundLookup): EventSound[] {
  const faction = lookup?.factionOfUnit(event.unitId) ?? ''
  const seen = new Set<SoundId>()
  const out: EventSound[] = []
  for (const target of event.targets) {
    const weapon = lookup?.weapon(target.weaponId)
    const { id, volume = 1 } =
      aosWeaponSound(target.weaponId, weapon?.name, weapon ? weapon.type === 'melee' : true) ??
      weaponSound(target.weaponId) ?? FLAVOUR_SOUND[weaponFlavour(target.weaponId, weapon, faction)]
    if (seen.has(id)) continue
    seen.add(id)
    // Second and later weapons in the same declaration duck further, so two guns firing together
    // read as one volley rather than two sounds competing at full level.
    const level = seen.size === 1 ? volume : volume * 0.7
    out.push(level === 1 ? { id } : { id, opts: { volume: level } })
  }
  return out
}

/** Each faction dies in its own voice: a Sister's cry, an Ork's bellow, a Necron's power-down whine.
 *  Unknown factions (or no lookup) fall back to the original generic soldier death. */
const DEATH_SOUND: Record<string, SfxId> = {
  sm: 'death-space-marines',
  'space-marines': 'death-space-marines',
  ork: 'death-orks',
  orks: 'death-orks',
  necrons: 'death-necrons',
  tyranids: 'death-tyranids',
  'astra-militarum': 'death-astra-militarum',
  'adepta-sororitas': 'death-adepta-sororitas',
  'chaos-space-marines': 'death-chaos-space-marines',
  'world-eaters': 'death-chaos-space-marines',
  'grey-knights': 'death-grey-knights',
  'tau-empire': 'death-tau',
  'adeptus-custodes': 'death-adeptus-custodes',
  'genestealer-cults': 'death-genestealer-cults',
  // Cyborg Skitarii go down with a metallic power-down, like the Necrons.
  'adeptus-mechanicus': 'death-necrons',
  // Plague-ridden Chaos Marines die with the Chaos groan.
  'death-guard': 'death-chaos-space-marines',
  // Rubric dust and mutant beastmen both fall with the Chaos Marine death cry.
  'thousand-sons': 'death-chaos-space-marines',
  // Banished daemons howl away in the same guttural voice as the Chaos Space Marines.
  'chaos-daemons': 'death-chaos-space-marines',
  // Space Wolves fall with the same armoured-warrior cry as the Ultramarines-style Marines.
  'space-wolves': 'death-space-marines',
  // Dark Angels are Space Marines and die like them.
  'dark-angels': 'death-space-marines',
  // Sons of Sanguinius fall with the same armoured-warrior cry as other Space Marines.
  'blood-angels': 'death-space-marines',
  // Deathwatch Kill-team veterans fall with the same armoured-warrior cry as the other Space Marines.
  deathwatch: 'death-space-marines',
  // Black Templars are Space Marines and die like them.
  'black-templars': 'death-space-marines',
}

/** Measured decoded RMS runs 0.05-0.40 across these; the loud three are pulled back toward ~0.15. */
const DEATH_TRIM: Partial<Record<SfxId, number>> = {
  'death-adepta-sororitas': 0.7,
  'death-astra-militarum': 0.45,
  'death-chaos-space-marines': 0.4,
  'death-orks': 0.5,
  'death-tyranids': 0.5,
  'death-space-marines': 0.6,
  'death-tau': 0.65,
  'death-adeptus-custodes': 0.8,
}

/** Cities fall with a soldier's cry, Ironjawz with a bellow; two takes of each, picked by the model so a squad
 *  going down does not repeat one voice. */
const AOS_DEATH: Record<string, readonly AosSfxId[]> = {
  cities: ['aos-human-death-1', 'aos-human-death-2'],
  ironjawz: ['aos-orruk-death-1', 'aos-orruk-death-2'],
  // Darkoath raiders and Fyreslayers are men and duardin: the human cries are the nearest voices we have.
  slaves: ['aos-human-death-1', 'aos-human-death-2'],
  fyreslayers: ['aos-human-death-1', 'aos-human-death-2'],
}

function takeFor(modelId: string): number {
  let h = 0
  for (let i = 0; i < modelId.length; i++) h = (h * 31 + modelId.charCodeAt(i)) | 0
  return Math.abs(h)
}

function deathSound(faction: string, modelId = ''): EventSound {
  const aos = AOS_DEATH[faction]
  if (aos) return { id: aos[takeFor(modelId) % aos.length] }
  const id = DEATH_SOUND[faction] ?? 'model-death'
  const volume = DEATH_TRIM[id]
  return volume === undefined ? { id } : { id, opts: { volume } }
}

/** Sounds to play for one engine event. `perspective` (the human seat) is optional — omit it to get
 *  every sound regardless of whose turn it is; pass it to also get "your turn"/victory-or-defeat
 *  lines correct for that seat. `lookup` is what makes firing sounds weapon-accurate. */
export function soundsForEvent(event: GameEvent, perspective?: PlayerId, lookup?: SoundLookup): EventSound[] {
  switch (event.type) {
    case 'RoundStarted':
      return event.round === 1 ? [{ id: 'narr-battle-round-one' }, { id: 'aos-round-start-war-horn', opts: { volume: 0.8 } }] : [{ id: 'aos-round-start-war-horn' }]

    // Rounds 2+ roll for priority (reducer.ts); the drums build to the result the dice tray then shows.
    case 'PriorityRolled':
      return [{ id: 'aos-priority-drumroll' }]

    case 'InitiativeSeized':
      return [{ id: 'aos-marshal-command' }]

    case 'WaaaghCalled':
      return [{ id: 'aos-orruk-roar' }]

    case 'TurnStarted':
      return perspective && event.turn === perspective ? [{ id: 'narr-your-turn' }] : []

    case 'PhaseStarted': {
      const line = PHASE_VOICE_LINE[event.phase]
      if (line) return [{ id: line }]
      return event.phase === 'fight' ? [{ id: 'aos-marshal-command', opts: { volume: 0.7 } }] : []
    }

    case 'DiceRolled':
      return [{ id: 'dice-rattle' }, { id: 'dice-land', opts: { volume: 0.8 } }]

    // The shot itself is voiced by TargetsDeclared, which the engine emits immediately after this
    // one (src/engine/attack.ts) and which names the weapons — see firingSounds.
    case 'AttackSequenceStarted':
      return []

    case 'TargetsDeclared':
      return firingSounds(event, lookup)

    case 'SaveRolled':
      // A cannonball is heard where it lands, saved or not.
      if (/cannonball/.test(event.attack.weaponId)) return [{ id: 'aos-cannonball-impact' }]
      // Armour and ward alike turn a blow aside with a clank of plate; the 42k energy shimmer has no place here.
      if (event.saved) return [{ id: 'aos-armour-hit' }]
      return [{ id: 'hit-impact' }]

    case 'ModelDestroyed':
      return [deathSound(lookup?.factionOfUnit(event.unitId) ?? '', event.modelId)]

    case 'UnitDestroyed':
      return [{ id: 'narr-unit-destroyed' }]

    case 'DeadlyDemiseRolled':
      return event.exploded ? [{ id: 'vehicle-explosion' }] : []

    // A move under way: hooves for riders, a tramp of plate for foot soldiers. Quiet on purpose; one sound per move.
    case 'UnitMoved': {
      if (Object.keys(event.paths ?? {}).length === 0) return []
      const kw = lookup?.keywordsOfUnit?.(event.unitId) ?? []
      if (kw.includes('CAVALRY')) return [{ id: 'aos-horse-gallop', opts: { volume: 0.55 } }]
      if (kw.includes('INFANTRY')) return [{ id: 'aos-armoured-march', opts: { volume: 0.5 } }]
      return []
    }

    // Cities charge on horse with a roar of men, Ironjawz stomp in bellowing.
    case 'ChargeDeclared': {
      const chargeFaction = lookup?.factionOfUnit(event.unitId)
      if (chargeFaction === 'ironjawz') return [{ id: 'aos-orruk-stomp' }, { id: 'aos-orruk-roar', opts: { volume: 0.7 } }]
      // Darkoath and Fyreslayer footsloggers pound in on foot with a battle cry; only the Fellriders thunder.
      if ((chargeFaction === 'slaves' || chargeFaction === 'fyreslayers') && !(lookup?.keywordsOfUnit?.(event.unitId) ?? []).includes('CAVALRY')) {
        return [{ id: 'aos-armoured-march', opts: { volume: 0.7 } }, { id: 'aos-human-battle-cry', opts: { volume: 0.8 } }]
      }
      return [{ id: 'aos-horse-charge' }, { id: 'aos-human-battle-cry', opts: { volume: 0.7 } }]
    }

    // Spearhead emits ObjectiveControlChanged when an objective changes hands (objectives.ts); a hand-off to nobody is silent.
    case 'ObjectiveControlChanged':
      if (event.to === null) return []
      return perspective && event.to === perspective ? [{ id: 'aos-objective-captured' }, { id: 'narr-objective-taken' }] : [{ id: 'aos-objective-captured', opts: { volume: 0.7 } }]

    case 'ObjectiveSecured':
      return event.by === null ? [] : [{ id: 'aos-objective-captured' }]

    case 'VpScored':
      return event.amount < 0 ? [] : [{ id: 'aos-battle-tactic-scored' }]

    case 'CpChanged':
      return event.delta > 0 ? [{ id: 'cp-gained-click' }] : []

    // Spearhead cards: a twist is revealed with the war horn, a card command with the marshal's shout
    case 'TwistDrawn':
      return [{ id: 'aos-round-start-war-horn', opts: { volume: 0.6 } }]
    case 'TacticCommandUsed':
      return [{ id: 'stratagem-whoosh', opts: { volume: 0.5 } }, { id: 'aos-marshal-command', opts: { volume: 0.8 } }]

    case 'StratagemUsed':
      // A command ability: the marshal bellows the order (the 42k "Stratagem!" line is not Spearhead's word for it).
      return [{ id: 'stratagem-whoosh', opts: { volume: 0.5 } }, { id: 'aos-marshal-command', opts: { volume: 0.8 } }]

    case 'BattleShocked':
      return [{ id: 'battle-shock-sting' }]

    case 'ActionRejected':
      return [{ id: 'ui-error' }]

    case 'GameEnded': {
      if (!perspective) return []
      if (event.result.winner === 'draw') return []
      return [{ id: event.result.winner === perspective ? 'aos-victory' : 'aos-defeat' }]
    }

    default:
      return []
  }
}

/** A swing that found nothing: one soft whoosh for a whole batch of hit rolls when any of its dice missed (never one per die). */
export function missWhooshFor(rolls: readonly GameEvent[]): EventSound[] {
  return rolls.some((e) => e.type === 'HitRolled' && !e.hit) ? [{ id: 'aos-miss-whoosh', opts: { volume: 0.7 } }] : []
}

/** Plays every sound mapped from a batch of events (e.g. the events a single step() call returned)
 *  through the given AudioManager. */
export function playEventSounds(audio: AudioManager, events: readonly GameEvent[], perspective?: PlayerId, lookup?: SoundLookup): void {
  for (const event of events) {
    for (const sound of soundsForEvent(event, perspective, lookup)) audio.play(sound.id, sound.opts)
  }
}

/** Victory/defeat narrator line for a finished game, from a given seat's perspective — split out
 *  from soundsForEvent's GameEnded case for callers that already have the GameResult on hand (e.g.
 *  the end screen) rather than the raw event. */
export function endGameVoiceLine(winner: PlayerId | 'draw', perspective: PlayerId): VoiceId | null {
  if (winner === 'draw') return null
  return winner === perspective ? 'narr-victory' : 'narr-defeat'
}
