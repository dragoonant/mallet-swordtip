# Age of Sigmar Spearhead figures (MGSD, 2026-10-29)

Concept art made in Gemini, one chat per army: a clean base figure first, then each other unit made by editing
that image so the style and proportions stay consistent. Each chosen concept went through the Hunyuan3D pipeline
(cutout, 2.1 shape, 2.0 paint, finalize) and became `public/assets/models/<slug>.glb`.

GLB contract (same as the 40k figures): y up, 1 unit = 1 inch, origin at the bottom centre of the base, front faces
+Z, black base included. On oval bases the long axis runs front to back and mounts face along it.

- `<slug>.png`: the chosen concept.
- `rejected/`: earlier candidates (cropped base, crew standing off the base, lance across the horse's head, head
  too small).
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

## Pipeline notes

- Ovals use `base` (length) plus `base2` (width) in `units.json`. The mounts and the cannon needed `yaw` (90, 90
  and 45) so they face down the base's long axis. The cannon concept has no base and was shaped with `--nocut`.
- `finalize_model.py` used to ignore `yaw`, because glTF import leaves objects in quaternion rotation mode. It now
  sets the rotation mode to `XYZ` first.

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
