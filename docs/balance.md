# Balance matrix: AI vs AI

Two dated sections follow: F10 (the latest) and F9 (the earlier baseline).

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
