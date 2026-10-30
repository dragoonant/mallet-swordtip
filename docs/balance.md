# Balance matrix: AI vs AI

Date: 2026-10-30. This is the first full matrix after the F9 rules and AI fixes. It records how the eight
Spearhead armies fare against each other when both seats are played by the utility AI, so it measures the
rules plus the AI's skill with each army, not what a good human would manage. Unit stats are the official
warscroll values and are not tuned; any imbalance seen here is a rules bug, an AI weakness or a real
feature of the army.

## Setup

- 28 pairings (every unordered pair of the 8 armies), 24 games per pairing, 672 games in all.
- Seed 21, Fire and Jade Aqshy battleplan, utility AI on both seats (`--ai`).
- Seats alternate every game and the alternate regiment ability and enhancement are used in half of the
  games (this is how the sim builds its pairings), so neither the first seat nor a single loadout decides a pairing.
- Every game ran 4 rounds. All 28 runs reported 0 invariant violations.

## Commands

One run per pairing (the armies in the example are the first pair):

```
npm run sim -- --games 24 --seed 21 --ai --armies cities,ironjawz
```

The other 27 pairings are the same command with the armies swapped for each remaining pair taken in the order
cities, ironjawz, slaves, fyreslayers, kruleboyz, gloomspite, lumineth, kharadron. The sim prints the
wins per army, the draws and the violation count, and exits non-zero if any invariant is broken.
Per-unit diagnostics for a pair come from `npx tsx tools/balance-stats.ts --armies a,b 24 21`, and a
turn-by-turn account of one game from `npx tsx tools/ai-trace.ts`.

## Army overall win rate

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

## Head-to-head wins (out of 24 games each)

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

## Every pairing, most lopsided first

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

## Reading the result

- Kharadron Overlords win about three games in four and beat every other army, so they are the clear outlier
  at the top. Kruleboyz and Ironjawz sit above even.
- Slaves to Darkness and Gloomspite Gitz win roughly one game in four or fewer, and Cities of Sigmar
  is below even; those three are the armies to look at first for AI play problems or missed rules.
- Fyreslayers and Lumineth are close to even.
- The spread between the best and worst army (about 54 points) is wide for a game whose scoring is
  objective-driven, which hints the AI uses some armies' tools (ranged fire and speed for Kharadron, a hard-hitting
  charge for Kruleboyz and Ironjawz) far better than the others' (attrition and buffs). That is a guess, not a finding.
- Draws are rare except in pairings that involve Lumineth or Kruleboyz.
