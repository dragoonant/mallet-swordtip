// One classification of "what does this weapon look and sound like", shared by the two presentation
// layers that need it: src/client/audio/eventSounds.ts picks the firing SFX from it, and
// src/client/presentation/director.ts picks the tracer look (vfx's ShotKind) from the same call, so a
// weapon can never sound like a bolter while drawing an ork tracer.
//
// The engine has no client-facing "weapon look" concept and the datasheets carry no sound/vfx field
// (docs/spec/20-data-schema.md §5) — adding one per weapon would be data-entry cost for a palette of
// six SFX. So this derives it from what the data already says: the weapon's own abilities first
// (PSYCHIC/TORRENT/BLAST are unambiguous), then its name, then Strength as a last resort, then the
// firing unit's faction. Ability and name both wrong for a new weapon is the case to watch: add a
// keyword here rather than a field to the schema.
import type { WeaponData } from '@/data/types'

/** The ranged values are exactly vfx's ShotKind (src/client/vfx/types.ts) so the director can pass
 *  one straight through as the tracer look; 'force' is melee-only and has no tracer. */
export type RangedFlavour = 'bolter' | 'shoota' | 'heavy' | 'flame' | 'psychic'
export type MeleeFlavour = 'chain' | 'crush' | 'force'
export type WeaponFlavour = RangedFlavour | MeleeFlavour

const RANGED: ReadonlySet<WeaponFlavour> = new Set<WeaponFlavour>(['bolter', 'shoota', 'heavy', 'flame', 'psychic'])

export function isRangedFlavour(flavour: WeaponFlavour): flavour is RangedFlavour {
  return RANGED.has(flavour)
}

function hasAbility(weapon: WeaponData | undefined, name: string): boolean {
  return !!weapon?.abilities?.some((a) => a.ability === name)
}

/** What the weapon reads as. `weaponId` is matched alongside the name because a weapon the bundle
 *  doesn't have (a stale id in a replay, say) still carries its own id, which is descriptive enough
 *  to classify: "ork.w.rokkit-launcha" is a rokkit with or without its datasheet. `faction` is the
 *  *firing unit's* faction key ('orks', 'space-marines'), used only to decide what a plain infantry
 *  gun sounds like when nothing more specific matched. */
export function weaponFlavour(weaponId: string, weapon: WeaponData | undefined, faction: string): WeaponFlavour {
  const text = `${weaponId} ${weapon?.name ?? ''}`.toLowerCase()
  const melee = weapon ? weapon.type === 'melee' : /choppa|klaw|fist|weapon$|blade|scythe|mace|flail|sword|close-combat|combat weapon/.test(text)
  const psychic = hasAbility(weapon, 'PSYCHIC') || /smite|witchfire|warp|psychic|psilencer|purge soul/.test(text)
  // Gauss weapons flay with a green energy bolt rather than a bullet, so they voice and trace as an energy
  // weapon; the psychic zap is the closest thing in the SFX palette.
  // T'au pulse weapons and the Votann ion blasters, magna-rail rifles and volkanite disintegrators are energy bolts too
  const gauss = /gauss|pulse|\bion.?blaster|magna.?rail|volkanite|\barc\b/.test(text)
  const strength = typeof weapon?.S === 'number' ? weapon.S : 0

  if (melee) {
    // A force weapon crackles rather than revs; everything else splits on whether it crushes or cuts.
    if (psychic || /force|stave|staff|goad/.test(text)) return 'force'
    // Tyranid claws, talons and teeth rend and slash, so they voice as the cutting sound; only a klaw/fist
    // (or a plain crushing profile) is the heavy crunch.
    if (/fist|klaw|hammer|maul(?!er)|smasher|mace|crush|limbs|legs|servo|mutation|sentinel(?![- ]blade)|mining|improvised|gauntlet|dozer|armoured hull|armoured-hull|armoured tracks|tracks|hoove?s|clubbing|celestite.club|war-relic/.test(text)) return 'crush'
    if (/choppa|chain|sword|blade|axe|eviscerator|knife|knives|reaper|claw|talon|teeth|jaws|snappa|stikka|maw|hyperphase|mandible|flail|whip|glaive|spear|lance|khopesh|fang|sickle|scythe|maw|bite|halberd|scimitar|sciansa|scianlar|keldrisaith|lanmari|voltspear|hooks|beak/.test(text)) return 'chain'
    return strength >= 8 ? 'crush' : 'chain'
  }

  if (psychic || gauss) return 'psychic'
  // Age of Sigmar wind magic (Lumineth) crackles like a spell; Kharadron skyhooks are harpoon guns (heavy), their volley guns and the
  // Kruleboyz' poisoned crossbow bolts spit a rattle of green streaks.
  if (/windblast|vortex|wind.s.vengeance/.test(text)) return 'psychic'
  if (/skyhook/.test(text)) return 'heavy'
  if (/crossbow|beast.skewer|volley.gun/.test(text)) return 'shoota'
  // F12: a Stormcast javelin is a lightning bolt (a spell-streak), the Skaven ratling cannons a rattle of slugs, their windlaunchers
  // a heavy lobbed globe, the Seraphon dartpipe a spit of needles and the Spawn's glob of flame acid a gout of fire.
  if (/javelin/.test(text)) return 'psychic'
  if (/ratling/.test(text)) return 'shoota'
  if (/windlauncher/.test(text)) return 'heavy'
  if (/dartpipe|blowpipe|sneeze/.test(text)) return 'shoota' // F14: Nurgle's sneezes are a wet spray
  // F16: a Khainite keldrisaith thrown like a javelin and a doomfire crossbow bolt wreathed in violet flame; Idoneth scryfish are a swarm of
  // darting pale sparks and their razorshell harpoon launcher a heavy bolt; a Tzaangor's arrow of fate is a streak of warpflame.
  if (/doomfire|scryfish|arrow.of.fate/.test(text)) return 'psychic'
  if (/harpoon/.test(text)) return 'heavy'
  // A macro plasma *incinerator* is a plasma gun, not a flame template.
  if (/plasma.*incinerat/.test(text)) return 'heavy'
  // TORRENT is the rules-level marker for a flame template (no hit roll, auto-hits).
  if (hasAbility(weapon, 'TORRENT') || /flame|flamer|burna|pyre|melta|incinerat|fusion|phosphor|sulphur/.test(text)) return 'flame'
  if (/flechette/.test(text)) return 'shoota' // a rattling needle gun, whatever its blaster name
  if (/burst.cannon|rotary.cannon/.test(text)) return 'shoota' // a rattling gun, not an artillery piece
  // Drukhari splinter weapons spit streams of crystal needles (a rattle, whatever the size of the gun); dark lances and
  // disintegrator cannons are heavy energy shots.
  if (/splinter/.test(text)) return 'shoota'
  // BLAST marks the explosive/ordnance profiles; the keywords catch the rest of the big guns, and
  // S7+ catches a heavy profile whose name says nothing (nothing in the current bundle needs it).
  if (hasAbility(weapon, 'BLAST') || /cannon|kannon|rokkit|rocket|missile|thump|mega|lascannon|plasma|blasta|blaster|tachyon|heavy bolter|heavy-bolter|dark.lance|launcher|field-gun|field gun|howitzer|hunter-killer|bombast|malleus|raker|mining.laser|starcannon|bright lance|bright-lance|icarus/.test(text)) return 'heavy'
  // Guard small arms (lasgun, laspistol, autogun) fall through to 'bolter': a rifle crack with a warm orange tracer.
  if (/bolt/.test(text)) return 'bolter'
  // Cultist autoguns are cheap rattling cracks, not bolter thumps. Spat or flung biomass (fleshborers, spore-guns)
  // is a rapid wet spray too; the Tyranid faction fallback does the same for any other plain gun.
  if (/shoota|slugga|dakka|stikk|autopistol|borer|spine|spore|burst cannon|burst-cannon|shuriken|scatter.laser/.test(text) || (/autogun/.test(text) && faction !== 'astra-militarum') || faction === 'orks' || faction === 'ork' || faction === 'tyranids' || faction === 'genestealer-cults') return 'shoota'
  if (faction === 'necrons' || faction === 'tau-empire') return 'psychic'
  return 'bolter'
}

// ---------- visual families (src/client/vfx/families.ts) ----------
//
// The 5 ranged flavours above are the SFX palette. The vfx layer has 14 looks, a finer split of the same
// weapons: one call classifies a weapon into a VfxFamily from the same evidence (abilities, name, faction).
// weaponFlavour() is deliberately untouched so audio keeps its mapping; `familyFlavour` maps a family back
// onto the SFX palette for any caller that only has a family.
import type { VfxFamily } from './vfx/types'
export type { VfxFamily } from './vfx/types'

export const VFX_FAMILIES: readonly VfxFamily[] = ['bolt', 'autocannon', 'las', 'lascannon', 'plasma', 'melta', 'flamer', 'missile', 'grenade', 'gauss', 'pulse', 'dakka', 'bio', 'psychic', 'cannonball', 'grapeshot', 'flintlock']

export interface VfxClassification {
  family: VfxFamily
  /** 'keyword' = an ability/name rule matched; 'faction' = nothing in the weapon matched, the firing faction decided;
   *  'default' = nothing matched at all (plain bolt). */
  via: 'keyword' | 'faction' | 'default'
}

/** Engine faction ids by the prefix of a weapon id ('ork.w.shoota'), for weapons classified with no faction given. */
const ID_PREFIX_FACTION: [string, string][] = [
  ['ork.', 'ork'], ['khorne.', 'khorne'], ['nurgle.', 'nurgle'], ['nighthaunt.', 'nighthaunt'], ['sylvaneth.', 'sylvaneth'], ['daughters.', 'daughters'], ['idoneth.', 'idoneth'], ['tzeentch.', 'tzeentch'], ['ossiarch.', 'ossiarch'], ['cities.', 'cities'], ['ironjawz.', 'ironjawz'], ['slaves.', 'slaves'], ['fyreslayers.', 'fyreslayers'], ['kruleboyz.', 'kruleboyz'], ['gloomspite.', 'gloomspite'], ['lumineth.', 'lumineth'], ['kharadron.', 'kharadron'], ['stormcast.', 'stormcast'], ['skaven.', 'skaven'], ['seraphon.', 'seraphon'], ['soulblight.', 'soulblight'], ['nec', 'necrons'], ['tyr', 'tyranids'], ['gsc.', 'genestealer-cults'], ['tau.', 'tau-empire'],
  ['am.', 'astra-militarum'], ['lov.', 'leagues-of-votann'], ['gk.', 'grey-knights'], ['csm', 'chaos-space-marines'], ['we.', 'world-eaters'], ['ade', 'adepta-sororitas'], ['cus.', 'adeptus-custodes'], ['drk.', 'drukhari'], ['ael.', 'aeldari'], ['adm.', 'adeptus-mechanicus'], ['dg.', 'death-guard'], ['ths.', 'thousand-sons'], ['sw.', 'space-wolves'], ['da.', 'dark-angels'], ['ba.', 'blood-angels'], ['dw.', 'deathwatch'], ['bt.', 'black-templars'],
]

export function classifyVfxFamily(weaponId: string, weapon: WeaponData | undefined, faction: string): VfxClassification {
  const text = `${weaponId.slice(weaponId.indexOf('.w.') + 1)} ${weapon?.name ?? ''}`.toLowerCase()
  const fac = faction || ID_PREFIX_FACTION.find(([p]) => weaponId.startsWith(p))?.[1] || ''
  const kw = (family: VfxFamily): VfxClassification => ({ family, via: 'keyword' })

  if (hasAbility(weapon, 'PSYCHIC') || /smite|witchfire|psychic|psychoclastic|psilencer|psycannon|purge soul|rite of possession|rite-of-possession/.test(text)) return kw('psychic')
  // Age of Sigmar black powder, ahead of the generic "cannon" rule: an iron ball, a spray of grapeshot, a pistol's lead.
  if (/cannonball/.test(text)) return kw('cannonball')
  if (/grapeshot/.test(text)) return kw('grapeshot')
  if (/dragoon.pistol|flintlock|handgun|blunderbuss|musket/.test(text)) return kw('flintlock')
  // Age of Sigmar wind and aether: Lumineth windblasts are spell-streaks and their silver bows a bright pulse; Kharadron skyhooks are harpoon
  // bolts, volley guns a rattling stream and their pistols and carbines black-powder shots; crossbow bolts and grot bows are hard kinetic streaks.
  if (/windblast|vortex/.test(text)) return kw('psychic')
  if (/wind.s.vengeance/.test(text)) return kw('pulse')
  if (/skyhook/.test(text)) return kw('missile')
  if (/volley.gun/.test(text)) return kw('dakka')
  // F12: Skaven warp lightning is a spell-streak, ratling cannons a dakka rattle and windlaunchers lobbed globes; a Stormcast javelin is a
  // bright lightning-pulse and a Seraphon dartpipe a needle of venom.
  if (/warp.?lightning/.test(text)) return kw('psychic')
  if (/ratling/.test(text)) return kw('dakka')
  if (/windlauncher/.test(text)) return kw('grenade')
  if (/stormcall|javelin/.test(text)) return kw('pulse')
  if (/dartpipe|blowpipe/.test(text)) return kw('bio')
  // F14: Nurgle's sneezes spray a cloud of spat plague, a Gossamid bow looses a thorn arrow as a hard kinetic streak.
  if (/sneeze/.test(text)) return kw('bio')
  if (/gossamid.bow/.test(text)) return kw('bolt')
  // F16: Khainite heartseeker bows and thrown keldrisaiths are hard kinetic streaks (the Doomfire crossbow too: blood-red bolts); Idoneth scryfish
  // are a swarm of pale soul-energy streaks, their razorshell harpoon launcher a lobbed missile; a Tzaangor's arrow of fate is a bright
  // crystal-tipped streak.
  if (/heartseeker|keldrisaith|doomfire/.test(text)) return kw('bolt')
  if (/scryfish/.test(text)) return kw('pulse')
  if (/harpoon/.test(text)) return kw('missile')
  if (/\barrow/.test(text)) return kw('pulse')
  if (/volley.pistol|privateer|vulcaniser|aethershot|carbine/.test(text)) return kw('flintlock')
  if (/crossbow|beast.skewer|grot.bow|windcharger.bow/.test(text)) return kw('bolt')
  // Spat, flung or sprayed biomass: Tyranid guns, and the cult's webber.
  if (/fleshborer|barb|devourer|venom|spine|spore|acid|borer|webber|web/.test(text) || (fac === 'tyranids' && !/torrent/.test(text))) return kw('bio')
  if (/gauss|tachyon|doomsday|necron|\barc\b/.test(text)) return kw('gauss')
  if (/melta|fusion/.test(text) || hasAbility(weapon, 'MELTA')) return kw('melta')
  if (/plasma.*incinerat/.test(text)) return kw('plasma')
  if (hasAbility(weapon, 'TORRENT') || /flame|flamer|burna|pyre|incinerat|phosphor|sulphur/.test(text)) return kw('flamer')
  // Drukhari: splinter weapons are streams of crystal needles, dark lances are heavy beams, disintegrators a bright pulse.
  if (/splinter/.test(text)) return kw('dakka')
  if (/dark.?lance/.test(text)) return kw('lascannon')
  if (/disintegrator/.test(text)) return kw('pulse')
  if (/pulse|ion.?raker|railgun|rail.?rifle|burst.?cannon|markerlight|\bion.?blaster|magna.?rail|volkanite|shuriken/.test(text)) return kw('pulse')
  if (/grenade|krak|frag|demolition|charge cache|satchel/.test(text)) return kw('grenade')
  if (/rokkit|rocket|missile|thump|hunter.?killer|bombast|field.?gun|howitzer|launcher|mortar|malleus|kannon/.test(text)) return kw('missile')
  if (/bright.?lance/.test(text)) return kw('lascannon')
  if (/scatter.?laser/.test(text)) return kw('las')
  if (/lascannon|las.?cannon|laser|beam/.test(text)) return kw('lascannon')
  if (/flechette/.test(text)) return kw('bolt')
  if (/plasma|blaster|blasta|supercharge|starcannon/.test(text)) return kw(fac === 'ork' || fac === 'orks' ? 'dakka' : 'plasma')
  if (/shoota|slugga|dakka|stikk|big.?shoota|kopta|saddlegit/.test(text)) return kw('dakka')
  if (/autocannon|assault cannon|assault-cannon|hylas|auto.?rifle|heavy.?bolter|heavy.?stubber|stubber|seismic|icarus|cannon/.test(text)) return kw('autocannon')
  if (/lasgun|laspistol|lascarbine|las.?pistol|radium|galvanic/.test(text)) return kw('las')
  // Hurled iron (a javelin, a throwing axe) flies as a hard kinetic streak, like the other black-powder-free slugs.
  if (/javelin|throwing.?axe/.test(text)) return kw('bolt')
  if (/arquebus/.test(text)) return kw('bolt') // a heavy slug-thrower: a hard kinetic crack, not a las beam
  if (/bolt|combi|storm|hurricane|spear|castellan|sentinel blade|sentinel-blade|autogun|autopistol|hybrid firearm|neophyte firearm|neophyte-firearm|pistol|sniper|small.?arms/.test(text)) return kw('bolt')
  switch (fac) {
    case 'ork': case 'orks': return { family: 'dakka', via: 'faction' }
    case 'tyranids': return { family: 'bio', via: 'faction' }
    case 'necrons': return { family: 'gauss', via: 'faction' }
    case 'tau-empire': case 'leagues-of-votann': return { family: 'pulse', via: 'faction' }
    case 'astra-militarum': return { family: 'las', via: 'faction' }
    case 'grey-knights': return { family: 'psychic', via: 'faction' }
    case 'drukhari': return { family: 'dakka', via: 'faction' }
    case 'aeldari': return { family: 'pulse', via: 'faction' }
    case 'adeptus-mechanicus': return { family: 'las', via: 'faction' }
    case 'chaos-daemons': return { family: 'psychic', via: 'faction' }
    default: return { family: 'bolt', via: 'default' }
  }
}

/** The visual family of a ranged weapon. */
export function vfxFamily(weaponId: string, weapon: WeaponData | undefined, faction: string): VfxFamily {
  return classifyVfxFamily(weaponId, weapon, faction).family
}

const FAMILY_FLAVOUR: Record<VfxFamily, RangedFlavour> = {
  bolt: 'bolter', autocannon: 'heavy', las: 'bolter', lascannon: 'heavy', plasma: 'heavy', melta: 'flame', flamer: 'flame',
  missile: 'heavy', grenade: 'heavy', gauss: 'psychic', pulse: 'psychic', dakka: 'shoota', bio: 'shoota', psychic: 'psychic',
  cannonball: 'heavy', grapeshot: 'shoota', flintlock: 'bolter',
}

/** A family mapped back onto the 5 SFX/tracer flavours. */
export function familyFlavour(family: VfxFamily): RangedFlavour {
  return FAMILY_FLAVOUR[family]
}
