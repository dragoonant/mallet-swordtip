# Mallet Swordtip — Development Plan

Fan game: 3D **Warhammer Age of Sigmar 4th edition Spearhead** (rules ported 1:1, all prose in our
own words) with figures in the house figure style (docs/FIGURE-STYLE.md), played against an AI in the browser and hosted on GitHub Pages.
The name parodies "Spearhead"; the project is a fork of Mallet 42k (40k Combat Patrol).

## Decisions (owner, 2026-10-29)
| Topic | Decision |
|---|---|
| Rules | AoS 4th edition Spearhead, mechanics ported 1:1, own-words text |
| Repo | `dragoonant/mallet-swordtip` (public), forked from `dragoonant/mallet-42k` (`upstream` remote) |
| Factions | Start with **Cities of Sigmar vs Orruk Warclans**. Then Gloomspite Gitz, Slaves to Darkness, Kharadron Overlords / Fyreslayers, Lumineth Realm-lords, and later every Spearhead |
| Sources | No owner PDFs. GW's free AoS core rules PDF + Wahapedia `aos4` pages (WebFetch gets 403 — read them through the browser) |
| Figures | house figure style (docs/FIGURE-STYLE.md), same Hunyuan pipeline as 42k |
| Priority | Playable first (see `CLAUDE.md`) |

## What carries over from Mallet 42k
- **As-is:** client shell, board/camera/terrain rendering, dice tray, audio, presentation director,
  save/continue, phone layout, Pages deploy, Playwright helpers, figure pipeline, workflow scripts.
- **Adapted:** dice, measurement/coherency, LoS, the attack sequence (hit → wound → rend/save →
  ward → damage, crits), 2D6 charges, pile-in, AI deciders, the action log and seeded RNG.
- **New:** hero phase (spells and prayers; Spearhead drops unbinding and command points), priority roll each round (double turns),
  battle tactic cards (the only source of commands), the realm twist deck, reinforcements,
  regiment ability + enhancement choice, 4 battle rounds on the small Spearhead board.

## Milestones
| # | Milestone | Exit criteria |
|---|---|---|
| F0 | Fork | Renamed repo deploys to Pages (still the 42k game underneath) ✅ when Pages is live |
| F1 | Spearhead spec | `docs/spec` rewritten for Spearhead in our own words + test checklist IDs; board size and round structure confirmed against the core rules PDF |
| F2 | Engine | 40k engine adapted: AoS phases, priority roll, commands, spells/prayers, combat sequence; headless sim runs |
| F3 | Data | Cities of Sigmar + Orruk Warclans Spearheads, battle tactics, twists, one realm battlefield |
| F4 | Playable | Hotseat game in the browser, first playthrough screenshot to the owner |
| F5 | AI | Full game vs AI on Pages |
| F6 | Figures | Figures for both Spearheads via Hunyuan |
| F7+ | More | Remaining factions, polish, then 40k-style extras (army painter, bases) |

Rough budget to F5: 5–7M tokens (42k took ≈9M to M5; the client and much of the engine carry over).
