# Balance matrix: AI vs AI

Four dated sections follow: F15 (the latest, all sixteen armies), F13 (twelve armies), F10 and F9 (the eight-army runs).

## 2026-10-31, F15

The first matrix with all sixteen Spearhead armies: the twelve from F13 plus Blades of Khorne, Maggotkin of Nurgle,
Nighthaunt and Sylvaneth (added in F14). 120 pairings, 24 games each, 2,880 games, seed 21, Fire and Jade Aqshy, utility AI
on both seats, seats and loadouts alternating as before. Every run reported 0 invariant violations; 173 games were drawn.
The F14 rules audit of the four new armies had landed before the run started, and none of their data or hook files changed
while it ran.

Commands: `npm run sim -- --games 6 --from N --seed 21 --ai --armies a,b` for N = 0, 6, 12 and 18, once per pair of the
sixteen armies taken in the order cities, ironjawz, slaves, fyreslayers, kruleboyz, gloomspite, lumineth, kharadron,
stormcast, skaven, seraphon, soulblight, khorne, nurgle, nighthaunt, sylvaneth, about 20 processes at a time. Splitting a
pairing with `--from` gives the same games as one 24-game run.

### Army overall win rate

Each army played 15 pairings x 24 games = 360 games. "Score" counts a draw as half a win. The last column is the F13 win %
(twelve armies, 11 pairings each).

| army | wins | draws | losses | win % | score % | win % F13 |
|---|---|---|---|---|---|---|
| sylvaneth | 253 | 23 | 84 | 70.3% | 73.5% | new |
| nurgle | 251 | 28 | 81 | 69.7% | 73.6% | new |
| nighthaunt | 226 | 27 | 107 | 62.8% | 66.5% | new |
| kharadron | 221 | 28 | 111 | 61.4% | 65.3% | 63.6% |
| stormcast | 215 | 22 | 123 | 59.7% | 62.8% | 64.8% |
| ironjawz | 208 | 24 | 128 | 57.8% | 61.1% | 59.5% |
| soulblight | 190 | 26 | 144 | 52.8% | 56.4% | 59.1% |
| seraphon | 185 | 28 | 147 | 51.4% | 55.3% | 50.4% |
| kruleboyz | 183 | 22 | 155 | 50.8% | 53.9% | 53.0% |
| fyreslayers | 151 | 18 | 191 | 41.9% | 44.4% | 42.8% |
| lumineth | 148 | 19 | 193 | 41.1% | 43.8% | 41.7% |
| skaven | 128 | 18 | 214 | 35.6% | 38.1% | 37.5% |
| cities | 125 | 28 | 207 | 34.7% | 38.6% | 36.7% |
| gloomspite | 111 | 16 | 233 | 30.8% | 33.1% | 28.0% |
| slaves | 90 | 14 | 256 | 25.0% | 26.9% | 23.9% |
| khorne | 22 | 5 | 333 | 6.1% | 6.8% | new |

### Head-to-head wins (out of 24 games each)

Read across: the number is how many of the 24 games the row army won against the column army.

| row beat column | cities | ironjawz | slaves | fyreslayers | kruleboyz | gloomspite | lumineth | kharadron | stormcast | skaven | seraphon | soulblight | khorne | nurgle | nighthaunt | sylvaneth |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **cities** | - | 6 | 14 | 6 | 6 | 13 | 10 | 9 | 4 | 15 | 5 | 8 | 16 | 1 | 8 | 4 |
| **ironjawz** | 15 | - | 21 | 17 | 8 | 20 | 11 | 11 | 10 | 15 | 11 | 17 | 22 | 11 | 10 | 9 |
| **slaves** | 9 | 3 | - | 10 | 4 | 7 | 8 | 1 | 5 | 6 | 7 | 3 | 20 | 1 | 2 | 4 |
| **fyreslayers** | 13 | 7 | 13 | - | 13 | 16 | 11 | 6 | 4 | 15 | 9 | 6 | 22 | 9 | 4 | 3 |
| **kruleboyz** | 15 | 15 | 18 | 9 | - | 18 | 13 | 2 | 5 | 17 | 17 | 12 | 24 | 6 | 6 | 6 |
| **gloomspite** | 8 | 3 | 16 | 8 | 6 | - | 11 | 3 | 4 | 8 | 6 | 2 | 23 | 4 | 7 | 2 |
| **lumineth** | 12 | 10 | 16 | 11 | 9 | 11 | - | 7 | 4 | 17 | 6 | 8 | 23 | 4 | 4 | 6 |
| **kharadron** | 15 | 9 | 22 | 16 | 22 | 20 | 14 | - | 9 | 16 | 16 | 11 | 24 | 11 | 7 | 9 |
| **stormcast** | 19 | 12 | 18 | 20 | 19 | 18 | 18 | 11 | - | 18 | 12 | 8 | 24 | 2 | 7 | 9 |
| **skaven** | 9 | 7 | 17 | 9 | 6 | 15 | 7 | 5 | 6 | - | 11 | 6 | 21 | 4 | 1 | 4 |
| **seraphon** | 16 | 12 | 16 | 13 | 5 | 16 | 18 | 5 | 11 | 10 | - | 9 | 24 | 10 | 12 | 8 |
| **soulblight** | 15 | 5 | 19 | 17 | 10 | 21 | 16 | 12 | 15 | 16 | 10 | - | 20 | 1 | 7 | 6 |
| **khorne** | 7 | 1 | 4 | 2 | 0 | 1 | 1 | 0 | 0 | 2 | 0 | 3 | - | 0 | 0 | 1 |
| **nurgle** | 21 | 12 | 22 | 15 | 15 | 20 | 19 | 12 | 16 | 20 | 10 | 20 | 24 | - | 17 | 8 |
| **nighthaunt** | 15 | 12 | 21 | 18 | 15 | 17 | 18 | 13 | 16 | 21 | 12 | 14 | 23 | 6 | - | 5 |
| **sylvaneth** | 18 | 14 | 19 | 20 | 17 | 20 | 18 | 14 | 14 | 18 | 15 | 17 | 23 | 11 | 15 | - |

### Most lopsided pairings

| pairing | first army wins | second army wins | draws |
|---|---|---|---|
| kruleboyz v khorne | 24 | 0 | 0 |
| kharadron v khorne | 24 | 0 | 0 |
| stormcast v khorne | 24 | 0 | 0 |
| seraphon v khorne | 24 | 0 | 0 |
| khorne v nurgle | 0 | 24 | 0 |
| khorne v nighthaunt | 0 | 23 | 1 |
| gloomspite v khorne | 23 | 1 | 0 |
| lumineth v khorne | 23 | 1 | 0 |
| khorne v sylvaneth | 1 | 23 | 0 |
| ironjawz v khorne | 22 | 1 | 1 |
| slaves v kharadron | 1 | 22 | 1 |
| slaves v nurgle | 1 | 22 | 1 |
| cities v nurgle | 1 | 21 | 2 |
| fyreslayers v khorne | 22 | 2 | 0 |
| kruleboyz v kharadron | 2 | 22 | 0 |

### Notes

- Outliers: **Blades of Khorne at 6.1%** (22 wins in 360) is far below 25%, and **Sylvaneth at 70.3%** is just above 70%,
  with **Nurgle** right under it at 69.7%. Slaves to Darkness sit exactly on the line at 25.0%. Nighthaunt land at 62.8%.
- Against the twelve older armies only: Sylvaneth 70.8%, Nurgle 70.1%, Nighthaunt 66.7%, Khorne 7.3%. Nurgle lose only to
  Sylvaneth (8-11), tie Seraphon 10-10 and beat Nighthaunt 17-6; Sylvaneth win the majority of games in all 15 pairings. Khorne's best result is 7-16 against
  Cities; they won 0 games against Kruleboyz, Kharadron, Stormcast, Seraphon, Nurgle and Nighthaunt.
- Why Khorne loses: all three of its non-Hero units carry Reinforcements and are meant to come back once, and none ever
  does. The engine cannot find a legal place for the replacement of a Flesh Hounds unit (five 60x35 mm ovals) or the
  Claws of Karanak (four different base sizes), so Call for Reinforcements is never offered for them. The same is true of
  the Cities Freeguild Cavaliers and the Slaves Fellriders. The cause is in `src/engine/factions/aos-moves.ts`
  `reinforcementFormation`: it lays its candidate grid out at the long radius of the largest base, so oval or mixed bases
  end up more than ½" apart and fail coherency. That file is outside this stage; fixing it is the next balance step for
  Khorne. Beyond that the army is fragile (35 Health, 6+ and 5+ saves) and its traced games show it winning early fights
  and then being worn down with nothing coming back.
- The twelve older armies barely moved against each other: their win rates against the older twelve match F13 within 1
  point. The runs are deterministic and every AI change below is gated to the armies it names or to Reinforcements units
  that cannot come back, so the only older cells that changed involve Cities or Slaves (their Cavaliers and Fellriders are
  now valued as units that will not return). Spot check Kharadron v Cities: 15-9 (F13 14-10), within noise.
- AI changes in F15:
  - Killing Pounce (`src/ai/utility.ts` `chargeOutlook` and `scoreDeclareCharge`, hint `khorneChargeFocus` in
    `src/engine/factions/khorne.ts`): position scores used to price the general's charge against the nearest enemy only.
    While the enhancement is unused and the quarry is on the battlefield, they now also price a charge with one more die
    measured to the quarry (the roll must reach ½" of an enemy and 3" of the quarry), and keep whichever is worth more. Once
    Pounce is active, the charge declaration and the charge re-roll value are judged against the quarry only, using the
    engine's own constrained distance. The sim never deals Killing Pounce (it uses the default and the last enhancement,
    Evasive Hunter and Furious Bites), so the matrix cannot see this. A 6-game probe against Cities with Pounce forced in
    used it 4 times with no rejected actions. Test: tests/ai/khorne-ai.test.ts (BOK-AI-1).
  - Khorne joins the Slaves "underdog" hints (`src/ai/underdogs.ts`): what a move leaves the unit open to on the enemy
    turn, the battle tactics it completes, and a heavier weight on held objectives. Traces showed Flesh Hounds running to
    3 or 4" from an enemy (no charge is allowed after a Run) and being charged off the table, and Karanak stepping out
    alone in round 1. A 6-game-a-pairing check against all 15 opponents went from 3 to 7 wins in 90.
  - `expendable` (`src/ai/utility.ts`) now asks whether the engine can set a replacement up before it treats a
    Reinforcements unit as cheap to lose. That keeps Khorne's units, the Cavaliers and the Fellriders from trading as if
    they would come back. It returns to the old behaviour on its own once the placement bug is fixed.
  - `tools/ai-trace.ts --moves` also logs every move (type, gap to the nearest enemy before and after) and every
    charge-phase pick or pass.
- Nurgle, Nighthaunt and Sylvaneth traces and `tools/balance-stats.ts` runs (6 games each against Ironjawz) showed no clearly
  wrong play: they use their abilities every turn they can, charge with their melee units, and Sylvaneth spend their
  Spiterider charges and Heartwood Hunting Horn. Their high rates come from the warscrolls, not from AI mistakes the
  opponents make against them.
- With 24 games a pairing, a single cell can move by 4 or 5 wins from sampling alone, and an army's overall rate by about
  3 points.

## 2026-10-31, F13

The first full matrix with all twelve Spearhead armies: the eight from F10 plus Stormcast Eternals, Skaven, Seraphon and
Soulblight Gravelords (added in F12). 66 pairings, 24 games each, 1,584 games, seed 21, Fire and Jade Aqshy, utility AI on
both seats, seats and loadouts alternating as before. All 66 runs reported 0 invariant violations and every game played
the full 4 rounds. 103 games were drawn.

Commands: the F9 command below, once per pair of the twelve armies taken in the order cities, ironjawz, slaves,
fyreslayers, kruleboyz, gloomspite, lumineth, kharadron, stormcast, skaven, seraphon, soulblight
(`npm run sim -- --games 24 --seed 21 --ai --armies a,b`). The runs are deterministic, so one pairing can be rerun alone.

### Army overall win rate

Each army played 11 pairings x 24 games = 264 games. "Score" counts a draw as half a win. The last column is the F10
win % (8-army matrix, 7 pairings each), so the old armies' change mixes the new opponents with the F11/F12 rules work.

| army | wins | draws | losses | win % | score % | win % F10 |
|---|---|---|---|---|---|---|
| stormcast | 171 | 13 | 80 | 64.8% | 67.2% | new |
| kharadron | 168 | 22 | 74 | 63.6% | 67.8% | 73.2% |
| ironjawz | 157 | 18 | 89 | 59.5% | 62.9% | 54.2% |
| soulblight | 156 | 18 | 90 | 59.1% | 62.5% | new |
| kruleboyz | 140 | 17 | 107 | 53.0% | 56.2% | 58.9% |
| seraphon | 133 | 25 | 106 | 50.4% | 55.1% | new |
| fyreslayers | 113 | 15 | 136 | 42.8% | 45.6% | 50.6% |
| lumineth | 110 | 16 | 138 | 41.7% | 44.7% | 43.5% |
| skaven | 99 | 13 | 152 | 37.5% | 40.0% | new |
| cities | 97 | 21 | 146 | 36.7% | 40.7% | 40.5% |
| gloomspite | 74 | 14 | 176 | 28.0% | 30.7% | 32.1% |
| slaves | 63 | 14 | 187 | 23.9% | 26.5% | 23.2% |

### Head-to-head wins (out of 24 games each)

Read across: the number is how many of the 24 games the row army won against the column army.

| row beat column | cities | ironjawz | slaves | fyreslayers | kruleboyz | gloomspite | lumineth | kharadron | stormcast | skaven | seraphon | soulblight |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **cities** | - | 6 | 14 | 6 | 6 | 13 | 10 | 10 | 5 | 15 | 4 | 8 |
| **ironjawz** | 16 | - | 21 | 17 | 8 | 20 | 11 | 11 | 10 | 15 | 11 | 17 |
| **slaves** | 9 | 3 | - | 10 | 3 | 8 | 9 | 1 | 7 | 5 | 4 | 4 |
| **fyreslayers** | 13 | 7 | 13 | - | 13 | 16 | 11 | 6 | 4 | 15 | 9 | 6 |
| **kruleboyz** | 15 | 15 | 17 | 9 | - | 18 | 13 | 2 | 5 | 17 | 17 | 12 |
| **gloomspite** | 8 | 3 | 15 | 8 | 6 | - | 11 | 3 | 4 | 8 | 6 | 2 |
| **lumineth** | 12 | 10 | 15 | 11 | 9 | 11 | - | 7 | 4 | 17 | 6 | 8 |
| **kharadron** | 14 | 9 | 22 | 16 | 22 | 20 | 14 | - | 9 | 16 | 16 | 10 |
| **stormcast** | 19 | 12 | 16 | 20 | 19 | 18 | 18 | 11 | - | 18 | 12 | 8 |
| **skaven** | 9 | 7 | 18 | 9 | 6 | 15 | 7 | 5 | 6 | - | 11 | 6 |
| **seraphon** | 16 | 12 | 18 | 13 | 5 | 16 | 18 | 5 | 11 | 10 | - | 9 |
| **soulblight** | 15 | 5 | 18 | 17 | 10 | 21 | 16 | 13 | 15 | 16 | 10 | - |

### Most lopsided pairings

| pairing | first army wins | second army wins | draws |
|---|---|---|---|
| slaves v kharadron | 1 | 22 | 1 |
| kruleboyz v kharadron | 2 | 22 | 0 |
| gloomspite v soulblight | 2 | 21 | 1 |
| ironjawz v slaves | 21 | 3 | 0 |
| ironjawz v gloomspite | 20 | 3 | 1 |
| gloomspite v kharadron | 3 | 20 | 1 |
| fyreslayers v stormcast | 4 | 20 | 0 |
| cities v stormcast | 5 | 19 | 0 |
| slaves v kruleboyz | 3 | 17 | 4 |
| slaves v seraphon | 4 | 18 | 2 |
| slaves v soulblight | 4 | 18 | 2 |
| kruleboyz v stormcast | 5 | 19 | 0 |
| gloomspite v stormcast | 4 | 18 | 2 |
| lumineth v stormcast | 4 | 18 | 2 |
| slaves v skaven | 5 | 18 | 1 |
| cities v seraphon | 4 | 16 | 4 |

### Notes

- No army is above 70%. Stormcast Eternals lead at 64.8% and Kharadron Overlords are next at 63.6%. Slaves to Darkness are
  the one outlier, below 25% (23.9%), as in every matrix since F9. Gloomspite Gitz are next lowest at 28.0%.
- The new armies all sit within the field: Stormcast 64.8%, Soulblight 59.1%, Seraphon 50.4%, Skaven 37.5%. Stormcast
  beat everyone except Soulblight (8-15) and come out level with Kharadron (11-9) and Seraphon (12-11). Their weak
  spot is Soulblight. Skaven beat only Slaves, Gloomspite and Seraphon (11-10).
- Kharadron dropped from 73.2% to 63.6%: they still beat every old army except Ironjawz (9-11), but Stormcast and
  Soulblight both hold them level or better. Slaves-Kharadron (1-22) and Kruleboyz-Kharadron (2-22) are the most
  one-sided cells.
- AI change in F13 (src/ai/utility.ts `arrivalStrike`): a unit arriving from reserve (Seraphon Hunters of Huanchi and
  Spawn of Chotec through Chameleon Ambush, the Soulblight Vargheists through Swoop Down, the Ironjawz Brutes) is now set
  up where it can hit something that turn. A shooter wants an enemy within its range and a melee unit wants an enemy in
  charge reach, weighted by the dice odds. Spots inside the 6" set-up exclusion are dropped before validation. Before
  this, ambushers were set down near their own objectives, out of range (a traced Seraphon game put both Hunters units
  12"+ from every enemy). Tests: tests/ai/arrivals.test.ts (AI-ARRIVE-001/002).
- The change only touches armies with reserve arrivals. The matrix is deterministic, and pairings without one came out
  identical to a run before the change: Kharadron-Cities 14-10, Fyreslayers-Cities 13-6, Kruleboyz-Cities 15-6,
  Stormcast-Cities 19-5. Ironjawz-Cities moved from 13-8 to 16-6 (the Brutes now drop in to charge).
- Ability use by the new armies (traces and `tools/balance-stats.ts`, 8 games each): Stormcast spend Shield of Azyr,
  Storm Charge (on a unit that ran within charge reach), Deliver Judgement and Blaze of Glory in combat. Strike Where
  Needed uses the shared free-Retreat AI hint, and Heralds of Righteousness is data. The Skaven Warp Lightning Cannon
  deals about 8 mortal damage a game from the back line, and Wither is only cast when an enemy is within 13" of the Grey
  Seer, who mostly holds the home objective. Seraphon use Screeches, Savage Bellow, Scaled Aegis and Star Venom every
  turn they can, and the Spawn uses its breath. Soulblight use Endless Legions after a Skeletons unit is destroyed,
  Skeleton Legion each combat phase, and Spirit Gale or Vile Transference, whichever is worth more. The Hunger heals
  after fights. No faction hint section needed changing.
- With 24 games a pairing, a single cell can move by 4 or 5 wins from sampling alone, and an army's overall rate by about
  3 points.

## 2026-10-30, F10

The full matrix rerun after the F10 fixes, set up exactly as the F9 run (28 pairings, 24 games each, 672 games,
seed 21, Fire and Jade Aqshy, utility AI on both seats, seats and loadouts alternating). All 28 runs reported
0 invariant violations, and every game played out the full 4 rounds (mean rounds 4.00 in every pairing, no run
stalled or hit an action cap). Same commands as in the F9 section below.

### Army overall win rate

Each army played 7 pairings x 24 games = 168 games. "Score" counts a draw as half a win. The last two
columns compare with the F9 win % (points of win %).

| army | wins | draws | losses | win % | score % | win % F9 | change (points) |
|---|---|---|---|---|---|---|---|
| kharadron | 123 | 7 | 38 | 73.2% | 75.3% | 75.0% | -1.8 |
| kruleboyz | 99 | 9 | 60 | 58.9% | 61.6% | 61.3% | -2.4 |
| ironjawz | 91 | 10 | 67 | 54.2% | 57.1% | 56.0% | -1.8 |
| fyreslayers | 85 | 10 | 73 | 50.6% | 53.6% | 49.4% | +1.2 |
| lumineth | 73 | 16 | 79 | 43.5% | 48.2% | 45.8% | -2.4 |
| cities | 68 | 13 | 87 | 40.5% | 44.3% | 39.3% | +1.2 |
| gloomspite | 54 | 11 | 103 | 32.1% | 35.4% | 24.4% | +7.7 |
| slaves | 39 | 4 | 125 | 23.2% | 24.4% | 21.4% | +1.8 |

### Head-to-head wins (out of 24 games each)

Read across: the number is how many of the 24 games the row army won against the column army.

| row beat column | cities | ironjawz | slaves | fyreslayers | kruleboyz | gloomspite | lumineth | kharadron |
|---|---|---|---|---|---|---|---|---|
| **cities** | - | 10 | 15 | 8 | 6 | 12 | 11 | 6 |
| **ironjawz** | 11 | - | 20 | 15 | 6 | 16 | 13 | 10 |
| **slaves** | 9 | 3 | - | 6 | 2 | 10 | 7 | 2 |
| **fyreslayers** | 13 | 8 | 17 | - | 13 | 16 | 11 | 7 |
| **kruleboyz** | 17 | 17 | 20 | 9 | - | 18 | 12 | 6 |
| **gloomspite** | 8 | 7 | 14 | 8 | 6 | - | 9 | 2 |
| **lumineth** | 12 | 8 | 17 | 10 | 10 | 11 | - | 5 |
| **kharadron** | 17 | 14 | 22 | 17 | 17 | 20 | 16 | - |

### Every pairing, most lopsided first

| pairing | first army wins | second army wins | draws |
|---|---|---|---|
| slaves v kharadron | 2 | 22 | 0 |
| slaves v kruleboyz | 2 | 20 | 2 |
| gloomspite v kharadron | 2 | 20 | 2 |
| ironjawz v slaves | 20 | 3 | 1 |
| kruleboyz v gloomspite | 18 | 6 | 0 |
| cities v kruleboyz | 6 | 17 | 1 |
| cities v kharadron | 6 | 17 | 1 |
| ironjawz v kruleboyz | 6 | 17 | 1 |
| slaves v fyreslayers | 6 | 17 | 1 |
| kruleboyz v kharadron | 6 | 17 | 1 |
| lumineth v kharadron | 5 | 16 | 3 |
| slaves v lumineth | 7 | 17 | 0 |
| fyreslayers v kharadron | 7 | 17 | 0 |
| ironjawz v gloomspite | 16 | 7 | 1 |
| fyreslayers v gloomspite | 16 | 8 | 0 |
| ironjawz v fyreslayers | 15 | 8 | 1 |
| cities v slaves | 15 | 9 | 0 |
| cities v fyreslayers | 8 | 13 | 3 |
| ironjawz v lumineth | 13 | 8 | 3 |
| cities v gloomspite | 12 | 8 | 4 |
| ironjawz v kharadron | 10 | 14 | 0 |
| slaves v gloomspite | 10 | 14 | 0 |
| fyreslayers v kruleboyz | 13 | 9 | 2 |
| kruleboyz v lumineth | 12 | 10 | 2 |
| gloomspite v lumineth | 9 | 11 | 4 |
| cities v ironjawz | 10 | 11 | 3 |
| cities v lumineth | 11 | 12 | 1 |
| fyreslayers v lumineth | 11 | 10 | 3 |

### Change from F9

- Kharadron Overlords still lead and still beat every other army, but their win rate slipped by under two
  points (75.0% to 73.2%); Ironjawz-Kharadron is now 10-14, much closer than the F9 7-15.
- Gloomspite Gitz moved the most, up nearly eight points (24.4% to 32.1%), and now beat Slaves to Darkness
  (14-10, against 10-13 in F9) and run close to Lumineth (9-11); they stay second-worst, but only 8 points behind Cities
  instead of 15.
- Slaves to Darkness are still last (21.4% to 23.2%); they stay at 2 or 3 wins out of 24 against Kharadron,
  Kruleboyz and Ironjawz, so the gap to the rest is not closed.
- Cities of Sigmar and Fyreslayers each gained about a point; Lumineth lost two and a half. Kruleboyz and
  Ironjawz each lost about two points but keep their places in the upper half.
- The ranking order is unchanged from F9; Lumineth and Cities are now 3 points apart instead of 6.5.
- The spread between best and worst army is 50 points (73.2% against 23.2%), down from 54. Draws fell from 46
  to 40 of 672 games.
- With 24 games a pairing, a single cell can move by 4 or 5 wins from sampling alone, so changes of a couple of
  points in an army's overall rate are within noise; only the Gloomspite gain is clearly larger.

## F9 matrix

This is the first full matrix after the F9 rules and AI fixes (earlier run, kept for comparison). It records how the eight
Spearhead armies fare against each other when both seats are played by the utility AI, so it measures the
rules plus the AI's skill with each army, not what a good human would manage. Unit stats are the official
warscroll values and are not tuned; any imbalance seen here is a rules bug, an AI weakness or a real
feature of the army.

### Setup

- 28 pairings (every unordered pair of the 8 armies), 24 games per pairing, 672 games in all.
- Seed 21, Fire and Jade Aqshy battleplan, utility AI on both seats (`--ai`).
- Seats alternate every game and the alternate regiment ability and enhancement are used in half of the
  games (this is how the sim builds its pairings), so neither the first seat nor a single loadout decides a pairing.
- Every game ran 4 rounds. All 28 runs reported 0 invariant violations.

### Commands

One run per pairing (the armies in the example are the first pair):

```
npm run sim -- --games 24 --seed 21 --ai --armies cities,ironjawz
```

The other 27 pairings are the same command with the armies swapped for each remaining pair taken in the order
cities, ironjawz, slaves, fyreslayers, kruleboyz, gloomspite, lumineth, kharadron. The sim prints the
wins per army, the draws and the violation count, and exits non-zero if any invariant is broken.
Per-unit diagnostics for a pair come from `npx tsx tools/balance-stats.ts --armies a,b 24 21`, and a
turn-by-turn account of one game from `npx tsx tools/ai-trace.ts`.

### Army overall win rate

Each army played 7 pairings x 24 games = 168 games. "Score" counts a draw as half a win.

| army | wins | draws | losses | win % | score % |
|---|---|---|---|---|---|
| kharadron | 126 | 11 | 31 | 75.0% | 78.3% |
| kruleboyz | 103 | 16 | 49 | 61.3% | 66.1% |
| ironjawz | 94 | 11 | 63 | 56.0% | 59.2% |
| fyreslayers | 83 | 11 | 74 | 49.4% | 52.7% |
| lumineth | 77 | 17 | 74 | 45.8% | 50.9% |
| cities | 66 | 10 | 92 | 39.3% | 42.3% |
| gloomspite | 41 | 10 | 117 | 24.4% | 27.4% |
| slaves | 36 | 6 | 126 | 21.4% | 23.2% |

### Head-to-head wins (out of 24 games each)

Read across: the number is how many of the 24 games the row army won against the column army. A row and its
mirrored cell sum to 24 minus the draws.

| row beat column | cities | ironjawz | slaves | fyreslayers | kruleboyz | gloomspite | lumineth | kharadron |
|---|---|---|---|---|---|---|---|---|
| **cities** | - | 13 | 18 | 4 | 2 | 18 | 9 | 2 |
| **ironjawz** | 10 | - | 22 | 15 | 8 | 19 | 13 | 7 |
| **slaves** | 5 | 2 | - | 7 | 1 | 13 | 6 | 2 |
| **fyreslayers** | 18 | 7 | 16 | - | 10 | 16 | 11 | 5 |
| **kruleboyz** | 17 | 15 | 22 | 12 | - | 18 | 12 | 7 |
| **gloomspite** | 6 | 5 | 10 | 6 | 5 | - | 6 | 3 |
| **lumineth** | 15 | 6 | 16 | 12 | 9 | 14 | - | 5 |
| **kharadron** | 21 | 15 | 22 | 18 | 14 | 19 | 17 | - |

### Every pairing, most lopsided first

| pairing | first army wins | second army wins | draws |
|---|---|---|---|
| slaves v kruleboyz | 1 | 22 | 1 |
| ironjawz v slaves | 22 | 2 | 0 |
| slaves v kharadron | 2 | 22 | 0 |
| cities v kharadron | 2 | 21 | 1 |
| gloomspite v kharadron | 3 | 19 | 2 |
| cities v kruleboyz | 2 | 17 | 5 |
| cities v fyreslayers | 4 | 18 | 2 |
| ironjawz v gloomspite | 19 | 5 | 0 |
| cities v slaves | 18 | 5 | 1 |
| fyreslayers v kharadron | 5 | 18 | 1 |
| kruleboyz v gloomspite | 18 | 5 | 1 |
| cities v gloomspite | 18 | 6 | 0 |
| lumineth v kharadron | 5 | 17 | 2 |
| slaves v lumineth | 6 | 16 | 2 |
| fyreslayers v gloomspite | 16 | 6 | 2 |
| slaves v fyreslayers | 7 | 16 | 1 |
| ironjawz v fyreslayers | 15 | 7 | 2 |
| ironjawz v kharadron | 7 | 15 | 2 |
| gloomspite v lumineth | 6 | 14 | 4 |
| ironjawz v kruleboyz | 8 | 15 | 1 |
| ironjawz v lumineth | 13 | 6 | 5 |
| kruleboyz v kharadron | 7 | 14 | 3 |
| cities v lumineth | 9 | 15 | 0 |
| cities v ironjawz | 13 | 10 | 1 |
| slaves v gloomspite | 13 | 10 | 1 |
| kruleboyz v lumineth | 12 | 9 | 3 |
| fyreslayers v kruleboyz | 10 | 12 | 2 |
| fyreslayers v lumineth | 11 | 12 | 1 |

### Reading the result

- Kharadron Overlords win about three games in four and beat every other army, so they are the clear outlier
  at the top. Kruleboyz and Ironjawz sit above even.
- Slaves to Darkness and Gloomspite Gitz win roughly one game in four or fewer, and Cities of Sigmar
  is below even; those three are the armies to look at first for AI play problems or missed rules.
- Fyreslayers and Lumineth are close to even.
- The spread between the best and worst army (about 54 points) is wide for a game whose scoring is
  objective-driven, which hints the AI uses some armies' tools (ranged fire and speed for Kharadron, a hard-hitting
  charge for Kruleboyz and Ironjawz) far better than the others' (attrition and buffs). That is a guess, not a finding.
- Draws are rare except in pairings that involve Lumineth or Kruleboyz.
