# Age of Sigmar Spearhead figures (MGSD, 2026-10-29)

Concept art made in Gemini, one chat per army: a clean base figure first, then each other unit made by editing
that image so the style and proportions stay consistent. Each chosen concept went through the Hunyuan3D pipeline
(cutout, 2.1 shape, 2.0 paint, finalize) and became `public/assets/models/<slug>.glb`.

GLB contract (same as the 40k figures): y up, 1 unit = 1 inch, origin at the bottom centre of the base, front faces
+Z, black base included. On oval bases the long axis runs front to back and mounts face along it.

- `<slug>.png`: the chosen concept.
- `rejected/`: earlier candidates (cropped base, crew standing off the base, lance across the horse's head, head
  too small, lanky mounts).
- `sheets/<slug>.png`: front, side and back renders of the finished GLB. `sheets/contact-*.png` holds one army per
  image.

| Slug | Unit id | Base (mm) | Height (in) | Status |
|---|---|---|---|---|
| `cavalier-marshal` | `cities.unit.freeguild-cavalier-marshal` | 90×52 oval | 2.0 | GLB done, checked |
| `freeguild-steelhelm` | `cities.unit.freeguild-steelhelms` | 32 | 1.35 | GLB done, checked |
| `freeguild-cavalier` | `cities.unit.freeguild-cavaliers` | 90×52 oval | 1.9 | GLB done, checked |
| `ironweld-great-cannon` | `cities.unit.ironweld-great-cannon` | 120×92 oval | 1.5 | GLB done, checked (cannon and two crew) |
| `ironjawz-megaboss` | `ironjawz.unit.megaboss` | 60 | 2.1 | GLB done, checked |
| `brute-rager` | `ironjawz.unit.brute-ragerz` | 40 | 1.65 | GLB done, checked |
| `ironjawz-ardboy` | `ironjawz.unit.ardboyz` | 32 | 1.45 | GLB done, checked |
| `ironjawz-brute` | `ironjawz.unit.brutes` | 40 | 1.65 | GLB done, checked |
| `darkoath-warqueen` | Darkoath Warqueen | 32 | 1.45 | GLB done, checked |
| `darkoath-savager` | Darkoath Savagers | 28.5 | 1.3 | GLB done, checked |
| `darkoath-godspeaker` | Darkoath Savagers (Godspeaker) | 28.5 | 1.3 | GLB done, checked |
| `darkoath-fellrider` | Darkoath Fellriders | 60×35 oval | 1.7 | GLB done, checked |
| `darkoath-marauder` | Darkoath Marauders | 28.5 | 1.3 | GLB done, checked |
| `fyr-battlesmith` | Battlesmith | 32 | 1.45 | GLB done, checked |
| `fyr-hearthguard` | Hearthguard Berzerkers | 32 | 1.2 | GLB done, checked |
| `fyr-vulkite` | Vulkite Berzerkers | 32 | 1.15 | GLB done, checked |
| `fyr-vulkite-karl` | Vulkite Berzerkers (unit leader look) | 32 | 1.2 | GLB done, checked |
| `kru-killaboss-gnashtoof` | Killaboss on Great Gnashtoof | 90×52 oval | 2.3 | GLB done, checked (yaw 90) |
| `kru-murknob` | Murknob with Belcha-banna | 40 | 1.8 | GLB done, checked |
| `kru-boltboy` | Man-skewer Boltboyz | 32 | 1.4 | GLB done, checked |
| `kru-gutrippa` | Gutrippaz | 32 | 1.4 | GLB done, checked |
| `glo-snarlboss` | Snarlboss | 75×42 oval | 1.85 | GLB done, checked (yaw 90) |
| `glo-wolfgit-bow` | Wolfgit Retinue (archer) | 60×35 oval | 1.5 | GLB done, checked (yaw 90) |
| `glo-wolfgit-stikka` | Wolfgit Retinue (spear) | 60×35 oval | 1.5 | GLB done, checked (yaw -90) |
| `glo-snarlpack-cavalry` | Snarlpack Cavalry | 75×42 oval | 1.75 | GLB done, checked (yaw 90; lances overhang the base) |
| `glo-sunsteala-wheela` | Sunsteala Wheelas | 120×92 oval | 2.2 | GLB done, checked (yaw 90, `fit` 116) |
| `kru-killbow` | Beast-skewer Killbow | 90×52 oval | 1.1 | GLB done, checked (`fit` 90, bolt overhangs the base front) |
| `lrl-warden` | Vanari Auralan Wardens | 32 | 1.6 | GLB done, checked |
| `lrl-windmage` | Hurakan Windmage | 60×35 oval | 2.0 | GLB done, checked (cape overhangs the base sides) |
| `lrl-windcharger` | Hurakan Windchargers | 60×35 oval | 1.9 | GLB done, checked (yaw 90) |
| `lrl-spirit-of-the-wind` | Hurakan Spirit of the Wind | 60 | 2.4 | GLB done, checked |
| `ko-admiral` | Arkanaut Admiral | 32 | 1.35 | GLB done, checked |
| `ko-arkanaut` | Arkanaut Company (pistol and cutter) | 25 | 1.15 | GLB done, checked |
| `ko-arkanaut-skypike` | Arkanaut Company (Skypike) | 25 | 1.15 | GLB done, checked |
| `ko-arkanaut-volley` | Arkanaut Company (Volley Gun) | 25 | 1.15 | GLB done, checked |
| `ko-arkanaut-skyhook` | Arkanaut Company (Light Skyhook) | 25 | 1.15 | GLB done, checked |
| `ko-skywarden` | Skywardens (pistol and skypike) | 32, flying stem | 1.6 | GLB done, checked |
| `ko-skywarden-volley` | Skywardens (Volley Gun) | 32, flying stem | 1.6 | GLB done, checked |
| `ko-frigate` | Arkanaut Frigate | 120×92 oval, flying stand | 3.4 | GLB done, checked (yaw 90) |

The GLBs are not wired into the game yet. The client's figure slug list needs these slugs before they show up.

## Designs

All designs are original. They use no Games Workshop sculpts, logos or iconography, and the shields carry plain
colours or quartering only.

- Cities of Sigmar: steel plate with crimson and cream cloth. `freeguild-steelhelm` wears a morion and carries a
  halberd and buckler. `freeguild-cavalier` is a visored knight with a raised lance and a quartered kite shield on
  a barded horse. `cavalier-marshal` is a gold-trimmed commander with a plumed open helm, a raised broadsword and a
  crimson cape. `ironweld-great-cannon` is a bronze cannon on a wooden carriage with two goggled crew in leather
  aprons, one holding a ramrod and one a lit fuse.
- Ironjawz: crude riveted iron plate in ochre and black. `ironjawz-ardboy` carries a choppa and a round shield.
  `ironjawz-brute` swings a two-handed hacka. `brute-rager` roars with two cleavers and chained arms.
  `ironjawz-megaboss` wears a crested helm and a black cloak, with a huge choppa and a spiked iron fist.
- Slaves to Darkness (Darkoath): crimson and rust cloth, tarnished bronze, blackened iron, grey fur and ash-blue
  warpaint, with carved oathstone pebbles on cords. `darkoath-warqueen` has a horned bronze half-helm, red braids,
  a crimson cloak and a big bronze axe. `darkoath-savager` is a shaggy-maned, bare-chested berserker with a
  rust-red sash, an iron axe and a hide buckler. `darkoath-godspeaker` is a hooded seer in a bone mask and a
  tattered crimson robe with a charm-hung staff. `darkoath-marauder` wears a horned iron cap and a fur mantle, with
  a bronze sword and a round wooden shield marked with one red scratch. `darkoath-fellrider` is a helmeted raider
  with a curved blade and a javelin quiver on a chunky shaggy black pony. No eight-pointed stars or other Chaos
  sigils.
- Fyreslayers: ruddy bare chests with plain glowing gold line tattoos, flame-orange beards and crests, burnished
  bronze helms, plain gold bracers and belts, charcoal loincloths. `fyr-vulkite` has a mohawk crest and a glowing
  hand-axe in each fist. `fyr-vulkite-karl` is the same berserker with a fan crest, a plain gold face-mask and two
  bigger axes. `fyr-hearthguard` wears a dragon-snouted bronze helm and holds a glowing poleaxe. `fyr-battlesmith`
  has a braided beard, a battle-axe and a banner pole topped by a plain anvil with gold flames over a blank
  charcoal-and-red banner. No rune copies or GW icons.
- Rejects for these two armies: `darkoath-warqueen-c1` (a realistic dwarf-like miniature, about 3.5 heads tall, and
  an edit did not fix the proportions) and `fyr-vulkite-c1` (mid-leap on a clear acrylic flight stand, feet off
  the base).
- Kruleboyz: sallow yellow-green orruks with long ears and tusked underbites, swamp-brown leathers, rust-iron
  plates, bone trophies and murky teal wraps. `kru-gutrippa` (the base figure) wears a narrow rust-iron helm and
  carries a hooked hacka and a round crimson-and-mustard shield with a crude three-claw scratch. `kru-boltboy` has a
  pointed iron cap and aims a barbed crossbow with green-dripping bolts. `kru-murknob` wears a horned half-helm and
  carries a cleaver and a crooked banner pole topped by a fuming swamp-beast skull over a brown rag.
  `kru-killaboss-gnashtoof` is a warlord in a tall spiked crown-helm with a jagged spear and bone cape, riding a
  chunky purple-grey swamp hound with a huge fanged head. `kru-killbow` (made later, in the same Gemini chat) is a squat giant crossbow on fat wooden wheels with thick
  rust-iron bow arms, a barbed harpoon bolt, bone trophies and a teal rag, crewed by two MGSD orruks, one at the
  winch and one pointing. `kru-gutrippa-boss` was not made.
- Gloomspite Gitz: bright green goblins with huge black-hooded heads, rust-red saddle cloths and rags, chunky
  big-headed grey-white wolves, dull iron and pale-yellow glowing shards. `glo-wolfgit-bow` (the base figure) draws a
  crooked bow; `glo-wolfgit-stikka` wears a red bandana mask and jabs a barbed spear. `glo-snarlboss` has a feathered
  red hat over the hood, a glowing jagged sword and a red shield with our bitten-sun disc. `glo-snarlpack-cavalry`
  carries two goblins with long hooked lances, one with a red pennant and one with a glowing shard tip.
  `glo-sunsteala-wheela` is a wicker cart with spiked wheels, a glowing lamp pole and red rag banners, pulled by two
  wolves and crewed by an archer and a spearman. No moon or GW faction icons.
- Rejects for these two armies: `glo-wolfgit-bow-c1` (the goblin was true MGSD but the wolf had near-realistic
  proportions; an edit gave it a bigger round head and stubbier legs).
- Lumineth Realm-lords: ivory-white and pale-gold armour, sky-blue and teal cloth, lilac-pink ribbons and plumes,
  silver blades and small pale-cyan crystals, with elf faces under the helms. The shields carry our three-curl wind
  swirl. `lrl-warden` (the base figure) wears a tall teal-crested ivory helm and holds a long silver pike and a kite
  shield. `lrl-windmage` wears a pale-gold crescent headdress and a streaming sky-blue cape, and carries a censer-orb
  staff while riding a puffy smiling cloud. `lrl-windcharger` wears a slim ivory helm with a lilac plume and draws a
  silver bow on a chubby plum-red beaked lizard-bird. `lrl-spirit-of-the-wind` is a translucent cyan big-headed spirit
  with wind-curl horns, a whirlwind funnel for a lower body, a pale-gold longbow and orbiting lilac ribbons and
  crystal shards. No Lumineth runes or GW icons.
- Kharadron Overlords: ivory plates with deep crimson trim, brass and copper fittings, plum leather, glowing green
  lenses and grey-white braided beards, with our cog-inside-a-cloud badge on the belt. `ko-arkanaut` (the base
  figure) wears a round brass diving helmet with green goggles and carries a cutlass and a flared pistol. The
  `-skypike`, `-volley` and `-skyhook` looks swap in a hooked pole-arm with a green bulb, a six-barrel crank gun with
  an ammo drum, and a shoulder harpoon launcher with a chain. `ko-admiral` has a wide green visor slit, crimson
  coat-tails, a piston hammer and a triple-barrel pistol. `ko-skywarden` and `ko-skywarden-volley` wear glass bubble
  helmets and copper balloon-engine packs with a propeller, and hover on a clear stem. `ko-frigate` is a fat
  ivory-and-crimson hull with two big copper balloon domes, green portholes, a bow harpoon cannon and three tiny
  crew, on a thick clear stand. No GW logos, runes or guild heraldry.
- Rejects: `lrl-warden-c1` (a short sword-like spear and a robot visor), `lrl-windcharger-c1` (a lanky dinosaur
  mount with long legs; an edit that only shortened the tail was also dropped), `ko-arkanaut-c1` (the base was cut
  off at the bottom edge), `kru-killbow-c1` (a realistic ballista cart with no bow arms) and `kru-killbow-c2` (still
  realistic, and the side-on bow arms read as a ring).

## Pipeline notes

- Ovals use `base` (length) plus `base2` (width) in `units.json`. The mounts and the cannon needed `yaw` (90, 90
  and 45) so they face down the base's long axis. The cannon concept has no base and was shaped with `--nocut`.
- `finalize_model.py` used to ignore `yaw`, because glTF import leaves objects in quaternion rotation mode. It now
  sets the rotation mode to `XYZ` first.
- `darkoath-fellrider` (60×35 oval) needed `yaw` 0, not 90: with 90 the pony stood across the oval. Darkoath and
  Fyreslayers used `swordtip_b3_picks.json`; their sheets are `sheets/contact-darkoath.png` and
  `sheets/contact-fyreslayers.png`.

- Kruleboyz and Gloomspite used `swordtip_b4_picks.json` and `swordtip_b5_picks.json`. Every mount and the
  Wheela faced sideways in its concept, so each needed `yaw` 90 (or -90 for `glo-wolfgit-stikka`, which faced the
  other way). The Wheela got `height` 2.2 and `fit` 116 so the cart and wolves fill the 120×92 base. Sheets:
  `sheets/contact-kruleboyz.png` and `sheets/contact-gloomspite.png`.

- Lumineth used `swordtip_b6_picks.json`; Kharadron and `kru-killbow` used `swordtip_b7_picks.json`. The
  Windcharger and the Frigate faced sideways in their concepts and needed `yaw` 90. The Killbow concept was a
  three-quarter view and Hunyuan already put the bolt along +Z, so it needed no yaw, but it got `fit` 90 so the
  machine stays near its oval. The Skywarden stems came through as thin clear posts. Sheets:
  `sheets/contact-lumineth.png` and `sheets/contact-kharadron.png`; the Killbow row was added to the bottom of
  `sheets/contact-kruleboyz.png`.

## Terrain

Painted Gemini concepts (`art/terrain-concepts-aos/<slug>.png`, renders in `art/terrain-concepts-aos/sheets/`) went
through the terrain chain (terrain cutout, 2.1 shape, 2.0 paint, `terrain_post.py --faces 9000`). Like the v5
ruins, each GLB is normalised so its long axis runs along X with length 1, and sits on y = 0 centred on the origin.
`public/assets/terrain/aos/manifest.json` gives each piece's normalised size and intended footprint. The game has to
scale the pieces; nothing is wired up yet.

| Slug | Piece | Intended footprint (in) | Normalised size x/y/z | Status |
|---|---|---|---|---|
| `ruined-domicile` | broken half-timbered stone house with a collapsed roof and a rubble heap | 5 × 3 | 1 / 0.68 / 0.72 | GLB done, checked |
| `ravaged-shrine` | cracked stone shrine on a stepped platform with a toppled statue | 3 × 2 | 1 / 0.85 / 0.91 | GLB done, checked |

At uniform scale, the domicile at 5" long is about 3.6" deep and 3.4" tall. The shrine at 3" long is about 2.7"
deep and 2.6" tall. If the footprint must be exactly 3 × 2, squash the depth or accept the extra.
