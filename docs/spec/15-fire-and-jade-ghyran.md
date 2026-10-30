# 15. Fire and Jade, Ghyran side

The Spearhead battlepack in the core rules (`docs/sources/aos4-core-rules.pdf`, printed pages 50-56) has **one**
battleplan, *Fire and Jade*, played on a double-sided 30" x 22" battlefield. One face is the Realm of Fire (Aqshy), the
other the Realm of Life (Ghyran). Everything about the battle is shared by both faces except three things: which twist
deck is drawn, where the five objectives are printed, and what the board looks like. This file records the Ghyran face.
The Aqshy face is in `11-spearhead.md` section 14 and `src/data/missions/sph-fire-and-jade-aqshy-horizontal.json`.

## 15.1 Where the sources stand

| Question | Answer | Source |
|---|---|---|
| Is there a separate Ghyran battleplan document? | No. The 2024 Spearhead Reference sheet and the Warhammer Community downloads search (queries on Spearhead, Fire and Jade, Ghyran) list only the core book, the reference sheet, the Desolation module and the army packs. None of them prints a second battleplan. | core rules p.55-56, reference sheet, WC downloads |
| Rules that differ on the Ghyran face | Only the twist deck: the defender picks Aqshy or Ghyran in pre-battle step 3, and "the twist deck that corresponds to the side of the battlefield" is the one used. | core rules p.55 |
| Objective layout of the Ghyran face | Not given as a table. The only art of it is the diagonal deployment illustration on p.55 (the horizontal illustration right above it shows the Aqshy layout, which our Aqshy data already matches). | core rules p.55 art |
| Objective size | Not stated; measured 6" across (radius 3), same on both faces. | measured |

Nothing new was downloaded: the core rules already in `docs/sources/` carry everything there is.

## 15.2 Battleplan (same as Aqshy unless noted)

| ID | Rule |
|---|---|
| GHY-1 | Pre-battle sequence, deployment (every unit wholly in its own territory and more than 6" from enemy territory), battle length (4 rounds), start-of-round sequence, victory points (1 for any objective, 1 for two or more, 1 for more than the opponent, 1 per completed battle tactic) and the winner (most VP, equal is a draw) are exactly SPH-4, 7, 8, 11. |
| GHY-2 | Twist deck: the **Ghyran** twist cards (`card.twist.reclaim-ghyran`, `alarielles-blessing`, `take-the-land`, `grasping-vines`, `the-grandfathers-blessing`, `lifespring`; text in `14-fire-and-jade-cards.md`). The Aqshy deck is set aside. Battle tactic decks are the same for both faces. |
| GHY-3 | Deployment map: only the horizontal map is shipped (dividing line z = 0, territory A is z < 0, deployment strips 6" to 11" from the centre line). The diagonal map is not shipped for either face. |
| GHY-4 | Terrain: 1 large and 1 small feature per player, wholly in their territory, more than 6" from every other feature and more than 3" from the long edges and from enemy territory, **not touching any objective circle** (SPH-5.2). Because the objectives sit elsewhere on this face, the Aqshy standard layout is not legal here, so the Ghyran face has its own (15.4). |

## 15.3 Objectives

Board centred on the origin, x along the long edge (-15 to 15), z along the short edge (-11 to 11), territory A is z < 0. All
circles have radius 3". The layout is point-symmetric (turn it half way round and it lands on itself).

| Objective | x | z | Territory (horizontal map) |
|---|---|---|---|
| Dracothion | 0 | 0 | on the line, both |
| Vulcatrix | -7 | -7 | A |
| Nagendra | 7 | 7 | B |
| Behemat | -14 | 0 | on the line, both |
| Ignax | 14 | 0 | on the line, both |

How it was read: the p.55 diagonal illustration was rendered at 400 dpi, the board frame (745 px for 30") gave 24.8 px per inch,
and circles of radius 3" were overlaid until they sat on the printed rings; every centre is within about 0.3" of the
rounded value. Nagendra's coil emblem is legible on the printed ring; the other names come from the godbeast emblem
positions recorded earlier in `11-spearhead.md` 14.3, which only matter for flavour and the two cards that name an
objective (`The Dracothion Dais`, and the Ignax / Behemat tactics).

RULING: the earlier note in `11-spearhead.md` 14.3 put Behemat and Ignax at x = -13 and 13 ("low confidence"). The
overlay fits x = -14 and 14 better, so this file's figures win. At x = 14 the circle runs 2" past the short board edge,
exactly as the printed ring is cut off by the frame; a unit counts as contesting it by being on any part of it.

RULING: the Ghyran layout is assumed to apply to the horizontal deployment map as well, because the book prints no horizontal
art for this face and an objective layout belongs to the mat, not to the deployment map.

Effect on play: only one objective (Vulcatrix or Nagendra) starts inside each player's own territory; three lie on the dividing
line. Holding "more than your opponent" is therefore more of a scrap than on the Aqshy face, where each half holds two.

## 15.4 Standard terrain layout (ours, `sph-fire-and-jade-ghyran-standard`)

| Piece | Owner | Kind | Centre (x, z) | Footprint |
|---|---|---|---|---|
| `tf-a-large` | A | large | (9.25, -5.5) | 5 x 3 |
| `tf-a-small` | A | small | (-1, -5) | 3 x 2 |
| `tf-b-large` | B | large | (-9.25, 5.5) | 5 x 3 |
| `tf-b-small` | B | small | (1, 5) | 3 x 2 |

Checks (all enforced by `tests/data/ghyran.test.ts`): each piece spans 4 <= |z| <= 7, so it is more than 3" from the dividing
line and from the long edges; the nearest gap between two pieces is 6.25"; the nearest piece-to-circle gap is 1.0" (each small
feature to Dracothion; the others are 1.6" or more). Players may still place their own pieces anywhere legal.

## 15.5 Look

The board mat for the Ghyran face is the Aqshy mat re-coloured, not newly made: `art/board-textures/tint_ghyran.py` maps the
scorched ground to moss, grass and pale lichen, turns the glowing lava seams into faint jade veins, and reuses the relief and
roughness maps (`public/assets/terrain/battlefield/ghyran/`). In game the sky, ambient and fill light are leaf-green and
the distant flashes and flares are spore-green (`src/client/board/Lighting.tsx`, `BattlefieldAmbience.tsx`).

## 15.6 Wiring

| Piece | How |
|---|---|
| Data | `src/data/missions/sph-fire-and-jade-ghyran-horizontal.json`, `src/data/terrain/sph-fire-and-jade-ghyran-standard.json`. A battleplan file whose id names a realm side can only be played on that side (`createGameState` refuses a mismatch) and, with no side pre-filled, the engine takes that side without asking the defender (SPH-4.3). |
| Start screen | "Realm side" picker: Aqshy, Ghyran, or Random. Random is a pure function of the seed text, so a seed always plays the same face and a saved game never re-rolls it. `newGame({ realm })` in `src/client/store/game.ts` picks the mission file by data. |
| Sim | `npm run sim -- --games N --seed S --ai --realm aqshy\|ghyran\|random` (default aqshy). `balance-stats.ts` and `ai-trace.ts` honour the same flag through `makeSimSetup`. |
| Tests | `tests/data/ghyran.test.ts` (SPH-005, SPH-009, SIM-017) and `tests/e2e/f9-ghyran.spec.ts`. |

## 15.7 Not done

- The diagonal deployment map, on either face.
- The HUD ground button still cycles only the three Realm of Fire mats; on the Ghyran face it has no visible effect.
