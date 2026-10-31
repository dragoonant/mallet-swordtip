// Pre-game setup screen (docs/spec/50-client.md §5, Spearhead edition, 13-port-plan §4.3). Pick your army (any of the twenty-five:
// Cities of Sigmar, Fyreslayers, Lumineth Realm-lords, Kharadron Overlords, Stormcast Eternals, Seraphon, Slaves to Darkness, Skaven,
// Soulblight Gravelords, Ironjawz, Kruleboyz, Gloomspite Gitz, Blades of Khorne, Maggotkin of Nurgle, Nighthaunt, Sylvaneth, Daughters of Khaine, Idoneth Deepkin, Disciples of Tzeentch, Ossiarch Bonereapers, Hedonites of Slaanesh, Helsmiths of Hashut, Flesh-eater Courts, Ogor Mawtribes and Sons of Behemat; any pairing, mirrors included), its regiment ability and enhancement, a bot or a second seat on this
// device, and Start. The battleplan is fixed (Fire and Jade, standard terrain); only its realm side (Aqshy, Ghyran or random) is picked.
// The engine asks the remaining pre-battle questions (attacker, deployment, first turn) as ordinary prompts.
import { FactionCrest } from './FactionCrest'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { loadBundle } from '../../data'
import type { DataBundle } from '../../data/types'
import { AI_DIFFICULTY_OPTIONS, DEFAULT_AI_DIFFICULTY, DEFAULT_SPEARHEAD_FACTIONS, regimentChoices, resolveFactionId, resolvePatrol, spearheadArmies, spearheadMission, resolveRealm, useGameStore, type AiDifficulty, type FactionKey, type RealmChoice, type OpponentKind } from '../store/game'
import { phaseLabel, relativeTime, shouldConfirmReplace, type SaveEnvelope } from '../store/saveGame'
import { randomArmyPaint, usePaintStore } from '../figures/paint'
import { PainterPanel } from './PainterPanel'
import { Tooltip } from './Tooltip'
import { buttonActive, buttonBase, buttonDanger, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'

// Own-words one-liners per faction id. A faction with no entry here still appears (name only).
export const FACTION_BLURBS: Record<string, string> = {
  cities: 'Frontier soldiers of the human cities: drilled spearmen, hard-riding cavalry and a heavy cannon, led by a cavalry marshal who rallies the charge.',
  ironjawz: 'Iron-clad orruk warbands: huge brutes and armoured boyz who smash through anything in reach, with a pack of heavies that crashes in late from nowhere.',
  slaves: 'Oath-sworn raiders from the wild north: a fearless queen, shrieking savagers and fast riders who swear to win glory by deed, and fight harder when they keep their word.',
  fyreslayers: 'Stout gold-hungry duardin berserkers wreathed in rune-fire: fast on the charge, hard to put down, and able to burrow out of one place and into another.',
  kruleboyz: 'Sneaky swamp orruks: poisoned crossbow bolts, hooked blades and a mud-slick boss on a lanky beast, who play dirty and hit hardest when the Waaagh! is up.',
  gloomspite: 'A howling pack of grot wolf-riders and a rickety sun-stealing war-cart: quick to flank, quick to run, and quicker to come back and stab you in the back.',
  lumineth: 'Serene wind-aelves who fight with the weather: a spirit of the gale, cloud-borne mages and mounted archers, and a wall of pikes, steering the whole board toward one leeward edge.',
  kharadron: 'Brass-and-aether sky-duardin: a volley-gun company that shoots even in melee, flying skywardens and a fat armoured airship that ferries units across the field.',
  stormcast: 'Lightning-forged knights in gold and midnight blue: a gryph-riding lord, a blindfolded witch-hunter whose crow keeps him safe, hammer-wielding Liberators and javelin-throwing winged Prosecutors who drop in from the sky.',
  skaven: 'A seething tide of ratmen from under the cities: swarms of Clanrats that keep coming back, hulking Stormfiends, a scheming Grey Seer and a warp-lightning cannon that fries whatever it points at.',
  seraphon: 'Lizard-warriors of the star-jungle: a Sunblood with hard-to-kill bodyguards, blowpipe skinks who ambush from hiding, flapping Terrawings and a fire-spitting beast whose acolytes keep it fighting.',
  soulblight: 'A vampire lord at the head of a night-court hunt: an endless line of rattling skeletons, charging Blood Knights and bat-winged Vargheists, and a pale lord who casts spells and vanishes in a cloud of bats.',
  khorne: 'A bloodthirsty hunting pack: a three-headed daemon hound and his snarling Flesh Hounds, fed by fanatics with hooked axes, who mark one enemy as their quarry and fight harder for every wound it already bears.',
  nurgle: 'A shambling plague-host that refuses to stay dead: a bookkeeping daemon, a rot-fly rider, bloated Blightkings and a rabble of one-eyed Plaguebearers, every one of them ward-hardened and spreading disease with each lucky blow.',
  nighthaunt: 'A wailing grave-host of chained and scythe-swinging spirits led by a ghost knight: hard to hurt, gliding over walls and bodies, and sweeping across the field in a cold wave of terror.',
  sylvaneth: 'A swift hunting flight of tree-spirits: a glaive-wielding Arch-Revenant, hovering Gossamid archers and dragonspite riders who swoop in, all chasing one marked quarry and singing louder with each kill.',
  daughters: 'Blood-drunk temple warriors: a serpent-bodied champion, a whirling pack of Witch Aelves, dark-steed sorcerers who hurl black fire and coiled archers whose arrows hunt hearts, each round of fighting winding the whole troupe tighter.',
  idoneth: 'Raiders from the deep who fight with the tides: a stooped soul-seer, eel-riding knights, a snapping war-shark and eyeless thralls, hitting harder or faster as the tide turns from round to round.',
  tzeentch: 'A scheming flock of bird-headed beast-men: a sorcerer on a flying disc, sword-wielding Tzaangors and spear-armed Enlightened, plus Skyfire archers, who can wait in reserve and peek at the cards before they are dealt.',
  slaanesh: 'Languid, cruel daemon courtiers: three preening Heralds who count as three units, pincered Fiends, two packs of quick-clawed Daemonettes and Seekers racing ahead on long-necked steeds, all swayed by a favour that shifts with the size of the army.',
  helsmiths: 'Furnace-lords of the black north: a glaive-swinging War Despot, spearmen of the Infernal Cohort, a horned engine that belches fire and a siege mortar, all drinking in daemonic power that is handed out afresh every round.',
  fec: 'A mad court that thinks itself noble: a crowned Archregent, rusty-halberd Cryptguard, bat-riding Morbheg Knights and a hulking Varghulf, all earning noble deeds in battle that they spend to stand the fallen back up.',
  ogors: 'A gluttonous warband of belly-plated ogres: a cleaver-wielding Tyrant, brawling Gluttons, iron-helmed Ironguts and tusked Maulbeast riders, with some of them held back to burst out of the board edge late in the game.',
  behemat: 'Hill giants with more boulder than sense: a pair of Rock-hurlers and a Boulder Basher who lob stones across the field, drop them on toes in melee or simply roll them, and are big enough to hold an objective on their own.',
  ossiarch: 'Cold, drilled constructs of bone: a sculptor-mage who barks the ranks into order, shield-and-halberd bodyguards, four-armed duelists and winged Morghasts that swoop in from the second round.',
}

// The Grand Alliance of each army: the coloured edge on its tile and the line under its blurb.
export const FACTION_ALLIANCE: Record<string, 'Order' | 'Chaos' | 'Death' | 'Destruction'> = {
  cities: 'Order', fyreslayers: 'Order', lumineth: 'Order', kharadron: 'Order', stormcast: 'Order', seraphon: 'Order',
  sylvaneth: 'Order', daughters: 'Order', idoneth: 'Order',
  slaves: 'Chaos', skaven: 'Chaos', khorne: 'Chaos', nurgle: 'Chaos', tzeentch: 'Chaos',
  slaanesh: 'Chaos', helsmiths: 'Chaos',
  soulblight: 'Death', nighthaunt: 'Death', ossiarch: 'Death', fec: 'Death',
  ironjawz: 'Destruction', kruleboyz: 'Destruction', gloomspite: 'Destruction', ogors: 'Destruction', behemat: 'Destruction',
}
const ALLIANCE_COLOR: Record<string, string> = { Order: '#6fa8ff', Chaos: '#c966e0', Death: '#5fd8b0', Destruction: '#ec8a3c' }

// Preferred card order on the start screen (anything else follows, in data order).
// Grouped by Grand Alliance (Order, Chaos, Death, Destruction), so each alliance sits together in the grid and shares an edge colour.
const FACTION_ORDER = ['cities', 'fyreslayers', 'lumineth', 'kharadron', 'stormcast', 'seraphon', 'sylvaneth', 'daughters', 'idoneth', 'slaves', 'skaven', 'khorne', 'nurgle', 'tzeentch', 'slaanesh', 'helsmiths', 'soulblight', 'nighthaunt', 'ossiarch', 'fec', 'ironjawz', 'kruleboyz', 'gloomspite', 'ogors', 'behemat']

// Own-words one-liners for the regiment abilities and enhancements shown on the cards; the full rules text from the data is the
// tooltip. An id without an entry here falls back to its data text.
export const OPTION_BLURBS: Record<string, string> = {
  'cities.ability.for-sigmar-charge': 'Cavalry that charged this turn swing first in the fight.',
  'cities.ability.ironweld-discipline': 'In your opponent\'s shooting phase your cannon may fire too, on a 3+.',
  'ironjawz.ability.natural-disaster': 'A charge roll of 8+ (before bonuses) gives that unit +1 Attacks on its melee weapons.',
  'ironjawz.ability.a-proper-ruckus': 'Once per battle, the free 3" move of Mighty Destroyers is offered to every unit at once.',
  'slaves.ability.rage-of-arkhar': "Once a turn, one unit in combat swings harder: +1 Attacks and +1 Rend on its melee weapons (a mount's hooves excepted).",
  'slaves.ability.fearless-invaders': 'Once a turn, a unit in combat can retreat without the mortal damage, and may still charge afterwards.',
  'slaves.enh.bloodthirsty-blade': "Your general's rune-etched axe has Rend 2.",
  'slaves.enh.godshadow-talisman': 'Your general shrugs off damage on a 4+ (Ward).',
  'slaves.enh.champion-of-raids': 'In your charge phase, another unit within 12" of your general may re-roll its charges.',
  'slaves.enh.fell-ritualist': 'While your general lives, each time you draw tactic cards you draw 1 extra, then tuck 1 card under your deck.',
  'fyreslayers.ability.magmic-tunnels': 'Once per battle, at the start of round 1, lift up to 2 units off the board and set them down anywhere, clear of the enemy.',
  'fyreslayers.ability.fyresteel-throwing-axes': 'Once a turn, units not in combat hurl axes at a visible enemy within 10": on a 4+ it takes D3 mortal damage.',
  'fyreslayers.enh.too-stubborn-to-die': 'At the start of any turn, your general heals D3 damage.',
  'fyreslayers.enh.horn-of-grimnir': 'In your hero phase, if your general is not in combat, a unit that has lost models may get one back on a 3+ (rolled per unit).',
  'fyreslayers.enh.spirit-of-grimnir': 'You may re-roll the roll that wakes a rune each turn.',
  'fyreslayers.enh.powerful-presence': 'Your general counts as Control +3 on objectives.',
  'kruleboyz.ability.covered-in-mud': 'Once per battle, a chosen unit is caked in swamp muck: enemies more than 12" away cannot see it, so cannot shoot it.',
  'kruleboyz.ability.noisy-racket': 'In the first round, enemy units wound at -1: the racket puts them off.',
  'kruleboyz.enh.kunnin-plan': 'Once a turn, a nearby unit can retreat for free and still shoot and charge afterwards.',
  'kruleboyz.enh.morks-eye-pebble': 'Once per battle, in the enemy movement phase, units near your general get a 5+ Ward for the shooting phase after it.',
  'kruleboyz.enh.egomaniak': 'While a friendly unit stands close, damage meant for your general slides onto that unit on a 4+.',
  'kruleboyz.enh.eye-biter-ash': 'Once per battle, an enemy fighting your general hits at -1 for the phase, or for the rest of the battle on a 5+.',
  'gloomspite.ability.flankin-force': 'Once per battle, in round 1, lift up to 2 units off the board and set them down anywhere more than 6" from the enemy.',
  'gloomspite.ability.frazzleboom': 'When one of your war machines is destroyed, it blows up on a nearby enemy for D3 mortal damage on a 2 or 3.',
  'gloomspite.enh.kunnin-as-a-snarlfang': 'Once per battle, in a combat phase, nearby units add 1 Rend to their melee weapons (mounts excepted) until the turn ends.',
  'gloomspite.enh.glare-of-frazzlegit': 'Once per battle, an enemy fighting your general hits at -1 until the turn ends.',
  'gloomspite.enh.sunsteala-shard': 'Once per battle, in the enemy shooting phase, units near your general cannot be shot at unless the shooter is already in combat with them.',
  'gloomspite.enh.devious-backstabba': 'At the end of any turn, an enemy Hero fighting your general may take D3 mortal damage on a 2+.',
  'lumineth.ability.lifted-debris': 'In your hero phase, hurl debris at an enemy unit: roll a dice per round so far, and each 3+ is 1 mortal damage.',
  'lumineth.ability.roaring-headwind': 'Once per battle, in the enemy hero phase, pick an enemy unit: every move it makes this turn must end nearer your leeward edge.',
  'lumineth.enh.scattered-to-the-winds': 'Enemy units close to your general lose control for each hurricane ability you used this round (never below 1).',
  'lumineth.enh.wind-whisperer': 'Once per battle, in a hero phase, choose any board edge to be your leeward edge.',
  'lumineth.enh.temple-guardians': 'While friendly infantry stand close to your general, the general and nearby infantry have a 5+ Ward.',
  'lumineth.enh.curved-shots': 'Your general may shoot as if standing anywhere on your leeward edge.',
  'kharadron.ability.assault-boat': 'Once per battle, a unit that was carried by Ply the Skies may still charge this turn.',
  'kharadron.ability.disengage': 'Once per battle, your Frigate retreats without mortal damage and can still shoot afterwards.',
  'kharadron.enh.leave-no-duardin-behind': 'Once per battle, a nearby Arkanaut Company rolls for each slain model, and each 4+ brings one back.',
  'kharadron.enh.masterwrought-armour': 'Your general shrugs off damage on a 6+ (Ward).',
  'kharadron.enh.flask-of-vintage-gorogna': 'Once per battle, in a hero phase, your general heals D6 damage.',
  'kharadron.enh.no-reward-without-risk': 'Once per battle, a nearby unit that declares a charge may re-roll the charge roll.',
  'stormcast.ability.blaze-of-glory': 'Once per battle, in a combat phase, a unit in combat may hit an enemy with 1 mortal damage on a 4+ for each of its models slain.',
  'stormcast.ability.strike-where-needed': 'Once per battle, a unit can retreat without the mortal damage and still charge afterwards.',
  'stormcast.enh.hallowed-scrolls': 'Your general shrugs off damage on a 5+ (Ward).',
  'stormcast.enh.quicksilver-draught': 'Once per battle, in a combat phase, your general strikes first for the rest of that phase.',
  'stormcast.enh.null-pendant': "Once per battle, at the end of a turn, enemies on your general's objective may lose control: roll per unit, and each 2+ is taken off its score.",
  'stormcast.enh.morrdas-talon': "Your general's greataxe causes mortal damage on a critical hit.",
  'skaven.ability.endless-swarm-of-rats': 'When a Clanrats unit uses Seething Swarm, it brings back D6 slain models instead of D3.',
  'skaven.ability.warpstone-laced-armour': 'Once per battle, when the enemy attacks your Stormfiends, they have a 5+ Ward until the end of the turn.',
  'skaven.enh.skilled-manipulator': 'Your general has a 4+ Ward while standing within 1" of Clanrats.',
  'skaven.enh.skitterleap': 'A spell (6): in your hero phase, whisk your general off the board and set it down anywhere more than 6" from the enemy.',
  'skaven.enh.scurry-away': "In a combat phase, on a 3+ your general's unit retreats at once, with no mortal damage.",
  'skaven.enh.cage-of-warp-lightning': 'Once per battle, in a combat phase, a nearby enemy unit strikes last on a 2+, but a 1 hurts your general.',
  'seraphon.ability.scaled-aegis': 'Once a turn, in your hero phase, on a 3+ a Saurus unit gets a 6+ Ward until your next turn.',
  'seraphon.ability.followers-of-huanchi': "Once a turn, in your shooting phase, on a 3+ a Skink unit's ranged weapons wound automatically on a critical hit.",
  'seraphon.enh.instinctive-commander': 'In your hero phase, on a 3+ a nearby friendly unit that is not in combat makes a Normal Move.',
  'seraphon.enh.savage-mauling': 'In a combat phase, an enemy unit fighting your general can make no Ward rolls for the rest of the turn.',
  'seraphon.enh.venomite-swarm': 'In a combat phase, while the Venomites token lasts, an enemy fighting your general may take D3 mortal damage (a 1 loses the token).',
  'seraphon.enh.blessed-by-the-old-ones': "If your general falls, roll at each turn's end: on a 2+ the Sunblood returns and leads again.",
  'soulblight.ability.endless-legions': 'Once per battle, a destroyed Skeletons unit is replaced by D6 models set up in your territory, clear of the enemy.',
  'soulblight.ability.ruinous-chargers': 'Once per battle, after your Blood Knights charge, each enemy unit they rode past takes D3 mortal damage.',
  'soulblight.enh.spirit-gale': 'A spell (7): in your hero phase, every enemy unit on the board takes 1 mortal damage.',
  'soulblight.enh.grave-sand-shard': 'Once per battle, Skeleton Legion rolls for a unit near your general get +1.',
  'soulblight.enh.cloud-of-bats': 'Once per battle, in your movement phase, your general vanishes in a flurry of bats and lands anywhere more than 6" from the enemy.',
  'soulblight.enh.aura-of-night': 'Negative modifiers to saves against shooting aimed at your general are ignored.',
  'cities.enh.flask-of-lethisian-darkwater': 'Once per battle, your general heals D6 damage.',
  'cities.enh.heirloom-blade': 'Your general\'s longsword hits harder against armour: +1 Rend.',
  'cities.enh.brazier-of-holy-flame': 'At the end of any turn, up to D3 fallen Steelhelms stand up near your general.',
  'cities.enh.glimmering': 'Once a phase, re-roll one hit, wound or save made for your general.',
  'ironjawz.enhancement.amberbone-whetstone': 'Your general\'s melee weapons have Rend 2.',
  'ironjawz.enhancement.trophy-skulls': 'Your general counts as Control 5 on objectives.',
  'ironjawz.enhancement.armour-of-gork': 'Your general shrugs off damage on a 6+ (Ward).',
  'ironjawz.enhancement.mega-bossy': 'After your general charges, nearby units add 1 to their charge rolls.',
  'khorne.ability.the-scent-of-blood': 'Combat attacks against an enemy unit that has already taken damage this turn add 1 to hit and 1 to wound.',
  'khorne.ability.savagery-upon-savagery': 'Once per battle, in a combat phase, a unit in combat gets +1 Attacks on its melee weapons (+D3 for a Hero) until the turn ends.',
  'khorne.enh.evasive-hunter': 'Shooting attacks aimed at your general hit and wound at -1.',
  'khorne.enh.sustained-by-gore': 'At the end of any turn, your general heals D3 damage.',
  'khorne.enh.killing-pounce': 'Once per battle, in your charge phase, your general rolls one extra charge die, but then has to finish the charge in combat with your quarry.',
  'khorne.enh.furious-bites': 'At the end of any turn, if your general is fighting your quarry, the quarry takes D3 mortal damage.',
  'nurgle.ability.infested-with-wonders': 'When a friendly model is slain, an enemy unit touching it may take 1 mortal damage on a 4+ before it is removed.',
  'nurgle.ability.locus-of-fecundity': 'Once a turn, in your hero phase, a friendly unit heals D3 damage.',
  'nurgle.enh.pestilent-breath': 'In your shooting phase, an enemy unit within 7" of your general takes 1 mortal damage for each of its models that rolls a 5+.',
  'nurgle.enh.summoner-of-plaguebearers': 'At the end of any turn, a Plaguebearers unit close to your general gets one slain model back.',
  'nurgle.enh.gardener-of-nurgle': 'If your general holds an objective alone, a 3+ in your movement phase makes it desecrated: your units there get a 4+ Ward until the enemy takes it.',
  'nurgle.enh.gift-of-febrile-frenzy': 'Once per battle, in a combat phase, friendly units close to your general add 1 to the Attacks of their melee weapons.',
  'nighthaunt.ability.chorus-of-terror': 'Hit rolls for combat attacks against a friendly unit that charged this turn are at -1.',
  'nighthaunt.ability.death-stalkers': 'Once, at the start of round 1, mark an enemy unit: your melee weapons have +1 Rend against it for the rest of the battle.',
  'nighthaunt.enh.shadows-edge': "Your general's sword gains Crit (Mortal) next to Crit (Auto-wound); you pick which one applies before each attack.",
  'nighthaunt.enh.soulfire-ring': 'At the end of any turn, if your general slew models in combat, it heals D6 damage.',
  'nighthaunt.enh.cloaked-in-shadow': 'In each phase only one enemy unit may target your general with its attacks.',
  'nighthaunt.enh.beacon-of-nagashizzar': 'Once per battle, in your hero phase, every friendly unit gets one slain model back.',
  'sylvaneth.ability.lifebringers': 'Once a turn, at the end of any turn, every friendly unit heals D3 damage (rolled for each unit).',
  'sylvaneth.ability.leaves-on-the-wind': 'Once per battle, at the end of any turn, a friendly unit in combat can retreat at once, with no mortal damage.',
  'sylvaneth.enh.head-of-the-hunt': "While your quarry is within 9\" and visible, your general's melee weapons have +1 Rend.",
  'sylvaneth.enh.bold-spirit': 'Once per battle, in a hero phase, friendly units close to your general add 1 to the wound rolls of their combat attacks for the turn.',
  'sylvaneth.enh.cunning-pursuer': 'While your general is in combat, friendly units within 12" add 1 to their charge rolls (2 if it fights your quarry).',
  'sylvaneth.enh.zephyrkin': 'After your general charges and fights, it may move up to 2D6" but cannot end that move in combat.',
  'daughters.ability.blessing-of-khaine': 'Once a turn, in any combat phase, a friendly unit close to your general (not the general) adds 1 to its ward rolls for the phase.',
  'daughters.ability.murderous-epiphany': "Once per battle, in your hero phase, every friendly unit gets next round's blood rite right away and keeps it.",
  'daughters.enh.fuelled-by-revenge': 'Your Blood Stalkers within 12" of your general have +1 Rend on their melee weapons.',
  'daughters.enh.bathed-in-blood': 'Each time your general slays an enemy model, it heals 1 damage.',
  'daughters.enh.flask-of-shademist': 'Once per battle, in a combat phase, enemy attacks against your units close to your general are at -1 to hit for the phase.',
  'daughters.enh.zealous-orator': 'In your hero phase, a friendly unit near your general that is not in combat rolls for each slain model: a 5+ brings it back.',
  'idoneth.ability.way-of-the-cresting-wave': 'Your Namarti Thralls that charged this turn have +1 Rend on their melee weapons.',
  'idoneth.ability.ethersea-predators': 'Once a turn, at the end of any turn, a friendly Cavalry unit that fought heals D3 damage.',
  'idoneth.enh.steelshell-armour': "Every modifier to your general's save rolls is ignored, good and bad, Rend included.",
  'idoneth.enh.arch-ritualist': 'Your general adds 1 to the roll for Ritual of the Creeping Mist.',
  'idoneth.enh.mind-flare': 'Once per battle, in a combat phase, an enemy unit fighting your general only hits on an unmodified 6 until the phase ends.',
  'idoneth.enh.delicious-morsels': 'In your hero phase, every friendly Cavalry unit near your general heals 1 damage.',
  'tzeentch.ability.constant-flux': 'While you are the underdog, enemy weapons aimed at your units have 1 less Rend (never below 0).',
  'tzeentch.ability.arcane-ritualists': 'Your general adds 1 to its casting rolls while it stands close to another friendly unit.',
  'tzeentch.enh.mutagenic-sorcery': 'At the end of any turn, a D3 aimed at a visible enemy near your general: on a 2+ it takes that much mortal damage and a Tzaangor fighting it comes back.',
  'tzeentch.enh.predicted-strike': "Once per battle, in the enemy's movement phase, a friendly unit near your general that is not in combat may move up to D6\".",
  'tzeentch.enh.fold-reality': 'A spell (6): in your hero phase, a friendly unit near your general is lifted off and set down again near it, away from the enemy.',
  'tzeentch.enh.infernal-gateway': 'A spell (5): in your hero phase, 3 dice of mortal-damage chances (4+) against an enemy within 18"; more dice if you have discarded many tactics.',
  'ossiarch.ability.immaculate-generalship': 'Every discipline roll you make is at +1.',
  'ossiarch.ability.peerless-cohesion': 'Once a turn you may use Relentless Discipline a second time in the same phase, on a different unit.',
  'ossiarch.enh.lode-of-saturation': 'Melee weapons attacking your general have 1 less Rend (never below 0).',
  'ossiarch.enh.shard-storm': 'A spell (7): in your hero phase, a dice per model of a visible enemy unit within 12"; each 5+ is 1 mortal damage.',
  'ossiarch.enh.mend-constructs': 'A spell (6): in your hero phase, a friendly unit near your general heals D3 damage.',
  'ossiarch.enh.helm-of-tyranny': 'Once per battle, at the end of your turn, a 3+ cuts 3 from the control score of an enemy unit within 12" of your general for the rest of the turn.',
  'slaanesh.ability.bringers-of-degradation': 'When you pick a unit to fight, you may pick two Daemonettes units: the second fights straight after the first.',
  'slaanesh.ability.daemonic-onslaught': 'Once per battle, after both armies are set up, a Seekers or Fiends unit close to your general makes a free Normal Move.',
  'slaanesh.enh.high-courtiers': 'While your general stands close to a Daemonettes unit, both have a 5+ Ward.',
  'slaanesh.enh.twisted-grace': 'When your general charged this turn, it piles in D6" further.',
  'slaanesh.enh.excess-of-violence': 'Once per battle, in a combat phase, a nearby unit (your general too) gets Crit (2 Hits) on its melee weapons until your next turn.',
  'slaanesh.enh.irresistible-soul-musk': 'Once per battle, in your movement phase, lift a nearby Seekers or Fiends unit off the board and set it down anywhere more than 6" from the enemy.',
  'helsmiths.ability.grinding-advance': 'Once per battle, after both armies are set up, up to 2 Infernal Cohorts shuffle forward 3" (but cannot charge in round 1).',
  'helsmiths.ability.suppressive-bombardment': 'Once a turn, an Infantry unit hurt by your Tormentor Bombard\'s shooting rolls one fewer die when it charges.',
  'helsmiths.enh.talisman-of-obsidian': 'In each phase your general ignores the first damage point dealt to it.',
  'helsmiths.enh.amulet-of-burning-hate': 'Once per battle, in a combat phase, your general scores a critical hit on any unmodified hit roll of 5+.',
  'helsmiths.enh.chalice-of-darkness': 'Once per battle, in your shooting phase, a visible enemy within 12" of your general takes D3 mortal damage.',
  'helsmiths.enh.scroll-of-petrification': 'Once per battle, in a hero phase, your general has a 2+ Ward for the turn, but cannot use abilities or be picked by yours.',
  'fec.ability.crusading-army': 'Your units add 1 to their run rolls and charge rolls.',
  'fec.ability.defenders-of-the-realm': 'Your units add 1 to their saves while they contest an objective you control.',
  'fec.enh.ulguan-cloak': 'Enemies more than 12" from your general cannot see it, so cannot shoot it.',
  'fec.enh.blood-river-chalice': 'Once per battle, in your hero phase, your general heals 2D3 damage.',
  'fec.enh.rousing-oration': 'In your hero phase, roll for each other unit near your general: every 5+ gives the general a noble deed.',
  'fec.enh.crimson-victuals': 'A spell (6): in your hero phase, a visible enemy within 18" takes D3 mortal damage and a nearby Cryptguard unit gets slain models back.',
  'ogors.ability.brutish-barging': 'Once per battle, at the end of your turn, a unit that charged moves 2D6" through the enemy it was fighting, but cannot end in combat.',
  'ogors.ability.blinding-dust-clouds': 'Attacks against a unit that was set up this turn (arrivals) are at -1 to hit.',
  'ogors.enh.gristlegobbler': 'Once per battle, at the end of any turn, every enemy fighting your general takes D3 mortal damage, then it heals 3.',
  'ogors.enh.wallwrecker': 'Your general walks and charges over terrain as though it could fly.',
  'ogors.enh.lungburster': 'Nearby units that roll a 1, 2 or 3 to run may count it as a 4.',
  'ogors.enh.deathcheater': 'Your general has a 6+ Ward while it stands more than 3" from every other friendly unit.',
  'behemat.ability.surly-sorts': 'Once per battle, in a combat phase, a unit in combat gets +1 Attacks on its melee weapons for the turn.',
  'behemat.ability.greedy-and-grabby': 'Every one of your units counts +5 towards control of an objective.',
  'behemat.enh.humongous-strides': 'Your general adds 1 to its charge rolls.',
  'behemat.enh.ard-ead': 'Once per battle, in a combat phase, your general\'s \'Eadbutt hits at +1 for the turn.',
  'behemat.enh.lucky-rock': 'Once per battle, in your shooting phase, your general\'s Hurlin\' Rocks get +1 Attacks.',
  'behemat.enh.hungry-gobbler': 'At the end of any turn in which your general\'s combat attacks slew a model, it heals D3.',
}

interface FactionChoice {
  id: string
  label: string
  blurb: string
  alliance: string
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Title art (public/assets/ui/title-bg.webp, 1024x572) fills the whole screen (cover, anchored a little
// above centre so the logo survives cropping). It shows alone for INTRO_MS — a click or key skips it —
// then a dark scrim and the setup card fade in over it. The card is centred and scrolls inside itself
// with Start Battle pinned at the bottom, so the page never needs scrolling. Portrait screens show the
// whole art at full width over a blurred fill instead, since cover would crop the logo away.
const TITLE_BG = `${import.meta.env.BASE_URL}assets/ui/title-bg.webp`
const INTRO_MS = 3000
const layoutCss = `
.ss-overlay { position: fixed; inset: 0; overflow: hidden; font-family: ${fontStack};
  color: ${colors.text}; background: #08080c; display: flex; align-items: center; justify-content: center;
  box-sizing: border-box; padding: var(--safe-top, 0px) var(--safe-right, 0px) var(--safe-bottom, 0px) var(--safe-left, 0px); }
.ss-overlay::before { content: ''; position: fixed; inset: -40px; pointer-events: none;
  background: url(${TITLE_BG}) center / cover no-repeat; filter: blur(18px) brightness(0.45); }
.ss-overlay::after { content: ''; position: fixed; inset: 0; pointer-events: none;
  background: url(${TITLE_BG}) center 30% / cover no-repeat; }
.ss-scrim { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: rgba(4, 4, 8, 0.72);
  opacity: 0; transition: opacity 900ms ease; }
.ss-card { position: relative; z-index: 2; width: 1180px; max-width: calc(100% - 32px); box-sizing: border-box;
  max-height: calc(100vh - 48px); max-height: calc(100dvh - 48px - var(--safe-top, 0px) - var(--safe-bottom, 0px)); opacity: 0; visibility: hidden; transform: translateY(14px);
  transition: opacity 900ms ease, transform 900ms ease, visibility 0s linear 900ms; }
.ss-ready .ss-scrim { opacity: 1; }
.ss-ready .ss-card { opacity: 1; visibility: visible; transform: none; transition: opacity 900ms ease, transform 900ms ease; }
.ss-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 26px; overflow-y: auto;
  min-height: 0; flex: 1 1 auto; padding-right: 4px; }
.ss-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
@media (max-width: 1100px) { .ss-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 700px) { .ss-grid { grid-template-columns: 1fr; } }
@media (max-width: 700px) { .ss-card { max-width: calc(100% - 16px); } }
@media (max-height: 460px) {
  .ss-card { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px - var(--safe-top, 0px) - var(--safe-bottom, 0px)); }
}
@media (max-aspect-ratio: 1/1) {
  .ss-overlay::after { background-size: 100vw auto; background-position: center 30%; }
}
/* Phones (html[data-ff=compact], set by formFactor.ts): one scrolling column, 44px targets, 16px form text so iOS
   does not zoom on focus. Works in portrait and in landscape down to 667x375. */
html[data-ff="compact"] .ss-card { max-width: calc(100% - 16px); padding: 12px !important; gap: 10px !important;
  max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); }
html[data-ff="compact"] .ss-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; overflow-y: auto; overflow-x: hidden;
  overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch; padding-right: 0; }
html[data-ff="compact"] .ss-col { gap: 10px; }
html[data-ff="compact"] .ss-card button { min-height: 44px; white-space: normal; text-align: center; touch-action: manipulation; }
html[data-ff="compact"] .ss-card select,
html[data-ff="compact"] .ss-card input[type="text"] { min-height: 44px; font-size: 16px; box-sizing: border-box; }
html[data-ff="compact"] .ss-card input[type="checkbox"] { width: 24px; height: 24px; flex: none; margin: 0; }
html[data-ff="compact"] .ss-check { display: flex; align-items: center; gap: 10px; min-height: 44px; }
html[data-ff="compact"] .ss-field { display: flex; flex-direction: column; gap: 6px; }
html[data-ff="compact"] .ss-card button[aria-pressed] { font-size: 12px !important; }
html[data-ff="compact"] .ss-secondary { font-size: 13px; }
/* Twenty-five army tiles, grouped by Grand Alliance: 5 x 5 in a desktop column and on a phone held upright; a phone held sideways has the
   width for 9 x 3 (iPhone 15 Pro landscape, 852x393: each tile ~88px wide with a two-line name and a 25px crest; the grid scrolls). */
html[data-ff="compact"] .ss-armies { gap: 4px !important; }
html[data-ff="compact"] .ss-card .ss-armies button[aria-pressed] { padding: 4px 1px !important; font-size: 9.5px !important; gap: 2px !important; }
html[data-ff="compact"] .ss-armies .ss-badge { width: 32px !important; height: 32px !important; }
html[data-ff="compact"] .ss-armies .ss-badge svg { width: 28px; height: 28px; }
@media (orientation: landscape) { html[data-ff="compact"] .ss-armies { grid-template-columns: repeat(9, minmax(0, 1fr)) !important; }
  html[data-ff="compact"] .ss-card .ss-armies button[aria-pressed] { font-size: 8px !important; min-height: 64px; padding: 3px 0 !important; }
  html[data-ff="compact"] .ss-armies .ss-badge { width: 28px !important; height: 28px !important; }
  html[data-ff="compact"] .ss-armies .ss-badge svg { width: 25px; height: 25px; } }
.ss-armies button { border-top-width: 3px !important; }
${Object.entries(ALLIANCE_COLOR).map(([name, c]) => `.ss-armies button[data-alliance="${name}"] { border-top-color: ${c} !important; }`).join(' ')}
.ss-alliance { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: ${colors.muted}; margin-top: -4px; }
.ss-alliance i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
`

// Automated browsers (Playwright) skip the intro so E2E runs don't wait on it.
const skipIntro = typeof navigator !== 'undefined' && navigator.webdriver

const card: CSSProperties = { ...panel, background: 'rgba(12, 12, 18, 0.86)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }
const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }
const label: CSSProperties = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, color: colors.muted, marginBottom: -6 }
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
const input: CSSProperties = { ...buttonBase, flex: 1, cursor: 'text' }
const blurb: CSSProperties = { ...mutedText, marginTop: -8 }
// Twenty-five armies sit five by five (the CSS class makes it nine by three on a phone held sideways); never an orphan card.
const factionGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 5 }
const factionCard: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '5px 2px', fontSize: 10.5, lineHeight: 1.15, textAlign: 'center', whiteSpace: 'normal', minWidth: 0, overflowWrap: 'anywhere' }
const factionBadge: CSSProperties = { width: 46, height: 46, borderRadius: 6, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.text, fontSize: 30, fontWeight: 700 }
const saveCard: CSSProperties = { flex: 'none', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 6, border: `1px solid ${colors.accent}`, background: 'rgba(255,255,255,0.05)' }
const noticeText: CSSProperties = { flex: 'none', margin: 0, padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.05)', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }
const confirmBackdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const errorText: CSSProperties = { color: colors.danger, fontSize: 13 }
const missionBlurb: CSSProperties = { ...mutedText, marginTop: -6, fontSize: 12 }
const missionList: CSSProperties = { margin: '2px 0 0', paddingLeft: 16, fontSize: 11.5, color: colors.muted }
const optionCard: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, textAlign: 'left' as const }
const pickList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const pickItem: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', textAlign: 'left', whiteSpace: 'normal', padding: '7px 10px', lineHeight: 1.25 }
const pickName: CSSProperties = { fontWeight: 700, fontSize: 13 }
const pickText: CSSProperties = { fontSize: 11.5, color: 'inherit', opacity: 0.78, fontWeight: 400 }

function FactionCard({ id, name, alliance, active, onPick, testId }: { id: string; name: string; alliance: string; active: boolean; onPick: () => void; testId?: string }) {
  return (
    <button type="button" data-testid={testId} data-alliance={alliance || undefined} style={{ ...(active ? buttonActive : buttonBase), ...factionCard }} aria-pressed={active} onClick={onPick}>
      <span className="ss-badge" style={factionBadge} aria-hidden="true"><FactionCrest faction={id} name={name} size={40} /></span>
      <span>{name}</span>
    </button>
  )
}

interface PickItem { id: string; name: string; text: string }

/** A short list of cards, one picked: the name, an own-words one-liner and the full rules text in the shared tooltip. */
function PickList({ items, selected, onPick, testId, itemTestId }: { items: PickItem[]; selected: string | undefined; onPick: (id: string) => void; testId: string; itemTestId: string }) {
  return (
    <div style={pickList} role="radiogroup" data-testid={testId}>
      {items.map((it) => {
        const on = it.id === selected
        return (
          <Tooltip key={it.id} title={it.name} body={it.text} placement="right">
            <button type="button" role="radio" aria-checked={on} aria-pressed={on} data-testid={`${itemTestId}-${it.id}`} style={{ ...(on ? buttonActive : buttonBase), ...pickItem }} onClick={() => onPick(it.id)}>
              <span style={pickName}>{it.name}</span>
              <span style={pickText}>{OPTION_BLURBS[it.id] ?? it.text}</span>
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}

/** Regiment ability + enhancement pickers for one seat (SPH-2.3 / 2.4): exactly two regiment abilities and four enhancements. */
function ArmyOptions({ bundle, factionKey, regiment, setRegiment, enhancement, setEnhancement, who }: {
  bundle: DataBundle
  factionKey: FactionKey
  regiment: string
  setRegiment: (id: string) => void
  enhancement: string
  setEnhancement: (id: string) => void
  who: string
}) {
  const army = resolvePatrol(bundle, factionKey)
  if (!army) return null
  const regiments = regimentChoices(bundle, army)
  const regimentId = regiments.find((r) => r.id === regiment)?.id ?? regiments.find((r) => r.default)?.id ?? regiments[0]?.id
  const enhancementId = army.enhancements.find((e) => e.id === enhancement)?.id ?? army.enhancements.find((e) => e.default)?.id ?? army.enhancements[0]?.id
  return (
    <>
      <div style={label}>Regiment ability (pick 1 of {regiments.length})</div>
      <PickList items={regiments.map((r) => ({ id: r.id, name: r.name, text: r.text }))} selected={regimentId} onPick={setRegiment} testId={`setup-regiment-${who}`} itemTestId={`setup-regiment-${who}`} />
      <div style={label}>General's enhancement (pick 1 of {army.enhancements.length})</div>
      <PickList
        items={army.enhancements.map((e) => ({ id: e.id, name: bundle.enhancements[e.id]?.name ?? e.id, text: bundle.enhancements[e.id]?.text ?? '' }))}
        selected={enhancementId} onPick={setEnhancement} testId={`setup-enhancement-${who}`} itemTestId={`setup-enhancement-${who}`}
      />
    </>
  )
}

export function StartScreen({ onStarted }: { onStarted: () => void }) {
  const newGame = useGameStore((s) => s.newGame)
  const loading = useGameStore((s) => s.loading)
  const error = useGameStore((s) => s.error)
  const [bundle, setBundle] = useState<DataBundle | null>(null)
  const [faction, setFaction] = useState<FactionKey>(DEFAULT_SPEARHEAD_FACTIONS.player)
  const [opponentFaction, setOpponentFaction] = useState<string>(DEFAULT_SPEARHEAD_FACTIONS.opponent)
  const [opponent, setOpponent] = useState<OpponentKind>('hotseat')
  const [difficulty, setDifficulty] = useState<AiDifficulty>(DEFAULT_AI_DIFFICULTY)
  const [seed, setSeed] = useState<string>(() => randomSeed())
  const [realmChoice, setRealmChoice] = useState<RealmChoice>('aqshy')
  const [regimentA, setRegimentA] = useState('')
  const [enhancementA, setEnhancementA] = useState('')
  const [regimentB, setRegimentB] = useState('')
  const [enhancementB, setEnhancementB] = useState('')
  const [ready, setReady] = useState(skipIntro)
  // The game saved on this device (autosaved after every action), if it can still be continued.
  const [saved, setSaved] = useState<SaveEnvelope | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [painting, setPainting] = useState(false)
  const saveNotice = useGameStore((s) => s.saveNotice)
  const dismissSaveNotice = useGameStore((s) => s.dismissSaveNotice)
  const inspectSave = useGameStore((s) => s.inspectSave)
  const continueSavedGame = useGameStore((s) => s.continueSavedGame)

  useEffect(() => {
    setSaved(inspectSave())
  }, [inspectSave])

  const resume = async () => {
    const ok = await continueSavedGame()
    if (ok) onStarted()
    else setSaved(null) // bad saves were discarded by the store (the notice explains); a data-load failure keeps it
  }

  useEffect(() => {
    if (ready) return
    const show = () => setReady(true)
    const timer = window.setTimeout(show, INTRO_MS)
    window.addEventListener('keydown', show)
    window.addEventListener('pointerdown', show)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', show)
      window.removeEventListener('pointerdown', show)
    }
  }, [ready])

  useEffect(() => {
    let cancelled = false
    void loadBundle().then((b) => {
      if (!cancelled) setBundle(b)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Every faction that has a Spearhead army, in data order.
  const factions = useMemo<FactionChoice[]>(() => {
    if (!bundle) return []
    const ids = [...new Set(spearheadArmies(bundle).map((p) => p.faction))]
    const rank = (id: string) => { const i = FACTION_ORDER.indexOf(id); return i < 0 ? FACTION_ORDER.length : i }
    return ids.map((id) => ({ id, label: bundle.factions[id]?.name ?? id, blurb: FACTION_BLURBS[id] ?? '', alliance: FACTION_ALLIANCE[id] ?? '' })).sort((a, b) => rank(a.id) - rank(b.id))
  }, [bundle])
  const factionId = resolveFactionId(faction)
  const activeFaction = factions.find((f) => f.id === factionId)
  const opponentActive = factions.find((f) => f.id === opponentFaction)
  const army = bundle ? resolvePatrol(bundle, faction) : undefined
  // Random is settled by the seed text (shown below it), so the same seed always plays the same realm.
  const realm = resolveRealm(realmChoice, seed)
  const mission = bundle ? spearheadMission(bundle, realm) : undefined

  // a faction missing from the bundle (data still loading) falls back to the first one that exists
  useEffect(() => {
    if (!factions.length) return
    if (!factions.some((f) => f.id === factionId)) setFaction(factions[0].id)
    if (!factions.some((f) => f.id === opponentFaction)) setOpponentFaction((factions.find((f) => f.id !== factions[0].id) ?? factions[0]).id)
  }, [factions, factionId, opponentFaction])
  useEffect(() => { setRegimentA(''); setEnhancementA('') }, [faction])
  useEffect(() => { setRegimentB(''); setEnhancementB('') }, [opponentFaction])

  // Starting over an existing save asks first (the start button opens the question; "Start new game" runs start()).
  const requestStart = () => {
    if (shouldConfirmReplace()) setConfirmReplace(true)
    else void start()
  }

  const start = async () => {
    setConfirmReplace(false)
    // The opponent gets a fresh random colour scheme every game (game-only; your saved paint is untouched).
    usePaintStore.getState().setSeatPaint('B', randomArmyPaint())
    try {
      await newGame({
        playerFaction: faction,
        opponentFaction,
        patrolId: army?.id,
        opponent,
        seed,
        realm: realmChoice,
        regimentAbilityId: regimentA || undefined,
        enhancementId: enhancementA || undefined,
        opponentRegimentAbilityId: regimentB || undefined,
        opponentEnhancementId: enhancementB || undefined,
        difficulty: opponent === 'bot' ? difficulty : undefined,
      })
      onStarted()
    } catch {
      // error surfaced via store.error below
    }
  }

  return (
    <div className={ready ? 'ss-overlay ss-ready' : 'ss-overlay'} data-testid="start-screen">
      <style>{layoutCss}</style>
      <h1 style={srOnly}>Mallet Swordtip: Spearhead</h1>
      <div className="ss-scrim" />
      <div className="ss-card" style={card}>
        {saveNotice && (
          <p style={noticeText} data-testid="save-notice" role="status">
            <span>{saveNotice}</span>
            <button style={buttonBase} onClick={dismissSaveNotice}>OK</button>
          </p>
        )}
        {saved && (
          <div style={saveCard} data-testid="continue-card">
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ fontWeight: 600 }} data-testid="continue-factions">{saved.meta.factions.A} vs {saved.meta.factions.B}</div>
              <div style={mutedText} data-testid="continue-detail">
                {saved.meta.phase === 'ended' ? 'Finished' : `Round ${saved.meta.round} · ${phaseLabel(saved.meta.phase)}`} ·{' '}
                {saved.meta.opponent === 'bot'
                  ? `vs bot${saved.meta.difficulty ? ` (${AI_DIFFICULTY_OPTIONS.find((d) => d.key === saved.meta.difficulty)?.label ?? saved.meta.difficulty})` : ''}`
                  : 'hot-seat'}
              </div>
              <div style={mutedText} data-testid="continue-time">Last played {relativeTime(saved.savedAt)}</div>
            </div>
            <button style={{ ...buttonPrimary, padding: '10px 18px' }} data-testid="continue-game" disabled={loading} onClick={() => void resume()}>
              {loading ? 'Loading…' : 'Continue'}
            </button>
          </div>
        )}
        <div className="ss-grid">
        <div className="ss-col">

        <div style={label}>Your Army</div>
        <div className="ss-armies" style={factionGrid} data-testid="setup-patrol-A">
          {factions.map((f) => (
            <FactionCard key={f.id} id={f.id} testId={`setup-army-A-${f.id}`} name={f.label} alliance={f.alliance} active={f.id === factionId} onPick={() => setFaction(f.id)} />
          ))}
        </div>
        {activeFaction?.alliance && <div className="ss-alliance" data-testid="setup-alliance-A"><i style={{ background: ALLIANCE_COLOR[activeFaction.alliance] }} />Grand Alliance: {activeFaction.alliance}</div>}
        {activeFaction?.blurb && <p style={blurb}>{activeFaction.blurb}</p>}
        {bundle && <ArmyOptions bundle={bundle} factionKey={faction} regiment={regimentA} setRegiment={setRegimentA} enhancement={enhancementA} setEnhancement={setEnhancementA} who="A" />}

        </div>
        <div className="ss-col">
        <div style={label}>Battleplan</div>
        <div style={{ ...optionCard, fontSize: 13 }} data-testid="setup-mission">
          <strong>{mission?.name ?? 'Fire and Jade'}</strong>
          <div style={mutedText}>{realm === 'ghyran' ? 'Ghyran' : 'Aqshy'} side · horizontal split · 30" × 22" · {mission?.rounds ?? 4} battle rounds</div>
        </div>
        <div style={label}>Realm side</div>
        <div style={row} data-testid="setup-realm">
          {([['aqshy', 'Aqshy (fire)'], ['ghyran', 'Ghyran (jade)'], ['random', 'Random']] as const).map(([id, text]) => (
            <button key={id} style={realmChoice === id ? buttonActive : buttonBase} data-testid={`setup-realm-${id}`} aria-pressed={realmChoice === id} onClick={() => setRealmChoice(id)}>
              {text}
            </button>
          ))}
        </div>
        {realmChoice === 'random' && <p style={missionBlurb} data-testid="setup-realm-random-note">Random is decided by the seed below: this seed plays {realm === 'ghyran' ? 'Ghyran' : 'Aqshy'}.</p>}
        <p style={missionBlurb}>
          {realm === 'ghyran'
            ? 'The Realm of Life: a jade-green board, objectives spread along the middle line and into two opposite corners, and the Ghyran twist deck of vines, blessings and healing springs.'
            : 'The Realm of Fire: a scorched board with an objective in each corner of the field, and the Aqshy twist deck of rings of fire, bloodshed and smoke.'}
        </p>
        {mission?.text && <p style={missionBlurb}>{mission.text}</p>}
        <ul style={missionList} data-testid="setup-mission-scoring">
          <li>At the end of your own turn you score 1 VP for holding at least one objective.</li>
          <li>1 more VP for holding two or more objectives.</li>
          <li>1 more VP for holding more objectives than your opponent.</li>
          <li>Objectives are 3" circles; a unit touching the circle contests it, and the higher total Control holds it.</li>
          <li>The winner is whoever has the most VP after round {mission?.rounds ?? 4}.</li>
        </ul>
        <p style={missionBlurb}>The attacker, deployment and who goes first are decided in play, with the roll-off and priority rolls.</p>

        </div>
        <div className="ss-col">
        <div style={label}>Opponent</div>
        <div style={row} data-testid="setup-opponent">
          <button style={opponent === 'bot' ? buttonActive : buttonBase} onClick={() => setOpponent('bot')}>
            Bot
          </button>
          <button style={opponent === 'hotseat' ? buttonActive : buttonBase} onClick={() => setOpponent('hotseat')}>
            Hotseat (pass the device)
          </button>
        </div>

        <div style={label}>Opponent's Army</div>
        <div className="ss-armies" style={factionGrid} data-testid="setup-opponent-faction">
          {factions.map((f) => (
            <FactionCard key={f.id} id={f.id} testId={`setup-army-B-${f.id}`} name={f.label} alliance={f.alliance} active={f.id === opponentFaction} onPick={() => setOpponentFaction(f.id)} />
          ))}
        </div>
        {opponentActive?.alliance && <div className="ss-alliance" data-testid="setup-alliance-B"><i style={{ background: ALLIANCE_COLOR[opponentActive.alliance] }} />Grand Alliance: {opponentActive.alliance}</div>}
        {opponentActive?.blurb && <p style={blurb}>{opponentActive.blurb}</p>}
        {bundle && <ArmyOptions bundle={bundle} factionKey={opponentFaction} regiment={regimentB} setRegiment={setRegimentB} enhancement={enhancementB} setEnhancement={setEnhancementB} who="B" />}

        {opponent === 'bot' && (
          <>
            <div style={label}>Bot Strength</div>
            <div style={row} data-testid="setup-difficulty">
              {AI_DIFFICULTY_OPTIONS.map((d) => (
                <button key={d.key} style={d.key === difficulty ? buttonActive : buttonBase} onClick={() => setDifficulty(d.key)}>
                  {d.label}
                </button>
              ))}
            </div>
            <p style={blurb}>{AI_DIFFICULTY_OPTIONS.find((d) => d.key === difficulty)?.blurb}</p>
          </>
        )}

        <div style={label}>Seed</div>
        <div style={row}>
          <input style={input} data-testid="setup-seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
          <button style={buttonBase} onClick={() => setSeed(randomSeed())}>
            Reroll
          </button>
        </div>

        </div>
        </div>

        {error && <p style={errorText}>{error}</p>}

        <div style={{ ...row, flex: 'none', flexWrap: 'nowrap' }}>
          <button style={{ ...buttonBase, padding: '12px 16px' }} data-testid="open-painter" onClick={() => setPainting(true)}>
            Paint army
          </button>
          <button style={{ ...buttonPrimary, flex: 1, padding: '12px 16px', fontSize: 15 }} data-testid="start-game" disabled={loading || !bundle} onClick={requestStart}>
            {loading ? 'Loading…' : 'Start Battle'}
          </button>
        </div>
      </div>
      {confirmReplace && (
        <div style={confirmBackdrop} data-testid="replace-save-confirm" role="alertdialog" aria-modal="true" aria-label="Replace saved game">
          <div style={{ ...card, maxWidth: 420 }}>
            <strong>Start a new game?</strong>
            <p style={{ margin: 0, fontSize: 13 }}>
              You have a game in progress{saved ? ` (${saved.meta.factions.A} vs ${saved.meta.factions.B}, round ${saved.meta.round})` : ''}. Starting a new battle replaces it, and the old one cannot be brought back.
            </p>
            <div style={row}>
              <button style={{ ...buttonPrimary, flex: 1 }} data-testid="replace-save-keep" onClick={() => setConfirmReplace(false)}>Keep my saved game</button>
              <button style={{ ...buttonDanger, flex: 1 }} data-testid="replace-save-confirm-start" onClick={() => void start()}>Start new game</button>
            </div>
          </div>
        </div>
      )}
      {painting && <PainterPanel factions={factions} initialFaction={factionId} onClose={() => setPainting(false)} />}
    </div>
  )
}
