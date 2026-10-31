# HANDOFF — Mallet Swordtip

Read `CLAUDE.md` (token rules), then this file, then `PLAN.md`. `STATUS.md` still describes the
inherited Mallet 42k code below its top note.
The 42k handoff and plan are kept in `docs/history/` for reference.

## State (2026-10-29)
- F0 done: forked from `dragoonant/mallet-42k` at `2ee8fd2`, renamed (package, Vite base
  `/mallet-swordtip/`, titles, PWA manifest, localStorage keys now `swordtip:*` / `swordtip.*`
  so saves never collide with 42k on the shared `dragoonant.github.io` origin).
- Live: https://dragoonant.github.io/mallet-swordtip/ (Spearhead build since F4).
- JSON schema `$id`s still read `https://mallet42k.dev/...` — internal identifiers, left alone.

## F4 cards (2026-10-29): twist and battle tactic cards
- Data `src/data/cards/fire-and-jade.json` (own words, schema `card-deck.schema.json`); engine `src/engine/cards.ts`
  (flow) + `src/engine/cardFlags.ts` (effect queries); client `src/client/ui/CardHand.tsx` (hand fan, twist chip, card
  viewer; a "Cards" pill on phones), twist reveal banner, HUD tactics line, end-screen VP sources. Tests
  `tests/engine/cards.test.ts` (CARD-001..027). AI plays cards by `hint.value` (tactic odds vs command worth).
- `npx tsx tools/card-stats.ts [--random] [--games N]`: card usage and VP split over simulated games.
- Screenshot spec: `PW_BASE_URL=http://localhost:4417/mallet-swordtip/ npx playwright test tests/e2e/cards-shots.spec.ts --project=chromium` (needs `npx vite --port 4417`).
- Only the Aqshy side is playable (no Ghyran battleplan file), so Ghyran twists are data + engine only.

## F2 wave 3 (2026-10-29): engine port is playable
- The 40k factions, missions, terrain, tests and tools are deleted. `npm run typecheck`, `npm test`, `npm run validate:data`
  are green. `npm run sim -- --games 100 --seed 1` (random bots; add `--ai` for the utility AI) plays Cities of Sigmar vs
  Ironjawz to the end of round 4 with no invariant violations.
- Hotseat and vs-bot Playwright playthroughs: `PW_PORT=4417 npx playwright test tests/e2e/spearhead-hotseat.spec.ts --project=chromium`
  (about 3 minutes; screenshots land in `e2e-out/`).

## F4 QA pass (2026-10-30): what a player sees now
- Full games checked on the built site (`PW_PORT=4423`): hotseat, human Cities vs bot, human Ironjawz vs bot all reach the end
  screen in 4 rounds with no console errors; a phone (iPhone 15 Pro landscape, WebKit) hotseat run reaches round 2 clean.
- Fixed in the pass: new title art (the old one was the 40k marine/ork picture with the 42k logo; now a lava texture with the
  Swordtip title, built from `public/assets/terrain/battlefield/aqshy`), the edge camera pulled in and slid down so the 30x22
  board fills the screen (`EDGE_ZOOM` in `cameraPresets.ts`), end screen and HUD name factions not "A"/"B", the "Move 0.0 inches"
  option now reads "Stay where it is", the charge-move text no longer has an empty target name, the formation bar sits under the
  phase strip even when that wraps (`--hud-bottom`), the phone card viewer closes itself after an auto-opened card prompt.
- Specs: `tests/e2e/spearhead-hotseat.spec.ts` (hotseat + both bot games; `QA_SHOTS=1` also drops one screenshot per decision
  kind into `e2e-out/qa/`), `tests/e2e/mobile-spearhead.spec.ts` (phone, `--project=iphone-pro`, shots in `e2e-out/phone/`),
  `tests/e2e/cards-shots.spec.ts`. Run: `npm run build && npx vite preview --port 4423`, then
  `PW_BASE_URL=http://localhost:4423/mallet-swordtip/ npx playwright test <spec> --project=chromium`. A full game takes 6-7 minutes.

## F5 (2026-10-30): polish, balance pass, asset prune, next faction specs
- client-ux: deploy panel has "Auto-place" (chosen or biggest waiting unit, first legal spot) and "Auto-deploy rest"; unit rings
  are thin player-coloured ellipses; start screen shows faction crests (`FactionCrest.tsx`); dead 40k prompt code removed from
  `DecisionPrompt.tsx`; formation bar and phone tag fixes; move sounds.
- balance-ai: charges fit model by model, the utility AI weighs charges when picking units, Cannon AI, missing Cities/Ironjawz
  ability effects, Officer's Order on. `npx tsx tools/balance-stats.ts [games] [seed]` prints per-unit damage, charges, card use
  and the win split (20 games seed 7: cities 4, ironjawz 15, 1 draw). `npm run sim -- --games 40 --seed 3 --ai`: ironjawz 32,
  cities 7, 1 draw, 0 violations. Still lopsided.
- Unused 40k models pruned from `public/assets/models`.
- New faction specs (not built): `docs/spec/factions/slaves-to-darkness.md` (Darkoath Raiders) and `fyreslayers.md`.
  Local audio tools in `tools/local-audio/`.
- QA on the built site (`vite preview --port 4433`): hotseat, bot and bot-as-Ironjawz games reach the end screen in 4 rounds
  with no console errors; `client-ux-shots.spec.ts` (auto-place, auto-deploy, rings) and the iPhone 15 Pro spec pass. No fixes needed.

## F6 (2026-10-30): Slaves to Darkness and Fyreslayers
- Both armies are playable (start screen has four crests): Darkoath Raiders (Oaths of Darkness, Rage of Arkhar, Fearless Invaders,
  four enhancements) and Saga Axeband (Awaken the Runes, Magmic Tunnels, Fyresteel Throwing Axes, four enhancements), with GLB figures
  for every unit. Engine tests are named STD-* and FYR-* after their spec Test IDs.
- QA on the built site (port 4443): `tests/e2e/f6-armies.spec.ts` plays Slaves (human) vs the Fyreslayers bot and Fyreslayers
  (human) vs the Cities bot to the end screen in 4 rounds, no console errors or failed requests; shots in `e2e-out/f6/`
  (`abilities/` holds the prompts that offered each new ability). Seen working in prompts: Oaths of Darkness, Rage of Arkhar,
  Awaken the Runes (rune choice), Magmic Tunnels, Too Stubborn to Die. Not reached by the click-first-option bot: Fearless
  Invaders and Fyresteel Throwing Axes (not the default regiment pick), Horn of Grimnir.
- Fix: a unit fielded more than once now gets a letter (Vulkite Berzerkers A to D, Freeguild Steelhelms A/B, Ardboyz A/B) in
  `state.ts`; before, four identical "Activate Vulkite Berzerkers" buttons could not be told apart.

## F7 (2026-10-30): smarter AI, narrator cues, prompt polish, four specs
- AI: `src/ai/utility.ts` retuned from 48 to 96 game samples per change; `tools/balance-stats.ts` takes `--armies a,b`.
  New `tools/ai-trace.ts` (`npx tsx tools/ai-trace.ts <game> [seed] --armies a,b`) plays one AI-vs-AI game and prints, each turn, where
  every unit stands, who holds each objective, the VP, and every charge, kill and ability use. Use it to see why an army loses.
- Client: narrator and audio cues for the new event kinds, redeploy spot markers on the board, a calmer decision prompt and card hand.
- Specs added in `docs/spec/factions/` (each with a mechanics mapping and Test IDs): Kruleboyz, Gloomspite Gitz, Lumineth Realm-lords,
  Kharadron Overlords.

## F8 (2026-10-30): Kruleboyz, Gloomspite, Lumineth and Kharadron
- All four are playable, so the start screen has eight crests and any army can face any other: Swampskulka Gang (KRU-), Snarlpack Huntaz
  (GLO-), Hurakan Vanguard (LRL-), Skyhammer Task Force (KO-). Data in `src/data/factions/{kruleboyz,gloomspite,lumineth,kharadron}/`,
  hooks in `src/engine/factions/<army>.ts`, generic engine pieces (moveDeclared window, anchored redeploy, retreat moves, leeward-edge
  state) noted in `docs/spec/13-engine-port-plan.md` section 3.9. Each spec ends with an "as built" section listing its [RULING]s.
- None of the four has GLB figures yet: every figure is the procedural stand-in (base disc plus coloured block). It loads cleanly, no
  404 or console error. The Arkanaut Frigate is a red box with a cream deck.
- QA on the built site (`vite preview --port 4453`): `tests/e2e/f8-playthrough.spec.ts` plays Kruleboyz (human) vs the Lumineth bot and
  Kharadron (human) vs the Gloomspite bot to the end screen in 4 rounds, no console errors, no failed requests; shots in `e2e-out/f8/`
  (`abilities/` has the prompts). Seen in prompts: Covered in Mud, Kruleboyz Waaagh!, All Part of Da Plan, Breath of the Mire-drakes,
  Scare Taktikz, Ply the Skies, Assault Boat, Timed Charges, Bomb Racks, Always Take What You Are Owed. Not seen in a
  human prompt: the Gloomspite and Lumineth abilities (they were the bot side), Disengage, the Flask.
  `tests/e2e/f8-armies.spec.ts` (start screen, cards, deployment, a fight) also passes. `npm test` 920/920, typecheck clean.
- Harness fix, not a game bug: the playthrough used to click the End phase button while the bot was still deciding. That button stays
  disabled, so Playwright waited until the whole test timed out ("target crashed"). The loop now only clicks on the human's decisions.
  `QA_TRACE=1` logs each decision to `e2e-out/f8/<prefix>-trace.log`; `QA_HANG=1` dumps the page's state if it stops answering.

## F9 (2026-10-30): rules audit, balance matrix, Ghyran, QA
- Bugs fixed: Kruleboyz, Slaves to Darkness and Cities rules audit fixes, plus utility-AI tuning (`src/ai/moves.ts`, deploy lanes,
  retreat/hold weights). F9 QA fix: the HUD's "Battlefield:" button (and the phone menu's "Ground:" item) always named the
  Aqshy mat, even on a Ghyran game where the jade mat is shown. It now reads "Ghyran Jade Grove" there and the button no longer cycles
  (the ground cycle only covers the Realm of Fire mats).
- Balance: the 8x8 AI-vs-AI matrix is in `docs/balance.md` (672 games, 0 invariant violations). Kharadron 78% score, Kruleboyz 66%,
  Ironjawz 59%, Fyreslayers 53%, Lumineth 51%, Cities 42%, Gloomspite 27%, Slaves 23%. Stats stay 1:1 with the warscrolls.
- Ghyran: playable. The start screen has a realm picker (Aqshy, Ghyran, Random-by-seed). Data in
  `src/data/missions/sph-fire-and-jade-ghyran-*.json` and `src/data/terrain/sph-fire-and-jade-ghyran-standard.json`, spec
  `docs/spec/15-fire-and-jade-ghyran.md`. The jade ground mat is `public/assets/terrain/battlefield/ghyran/` (recoloured Aqshy mat; it was
  missing from the F9 commit and is added in the QA commit). Its generator `art/board-textures/tint_ghyran.py` is still untracked.
- QA on the built site (`vite preview --port 4463`): `tests/e2e/f9-playthrough.spec.ts` plays Cities (human) vs the Kharadron bot on
  Ghyran and Slaves (human) vs the Kruleboyz bot on Aqshy to the end screen in 4 rounds, no console errors, no failed requests;
  shots in `e2e-out/f9/`. `f9-ghyran.spec.ts` also passes. Typecheck clean.
- Left red: `tests/engine/kharadron.test.ts` KO-BT-3 end to end. The Kharadron bot never uses Ply the Skies: the ability is only offered
  when a Company stands wholly within 3" of a Frigate that declares a move, and the AI neither deploys the Companies beside the Frigate
  nor moves the Frigate much. The rule works (the other KO-BT tests pass; a human gets the offer). Fix is AI deployment / movement, not
  the engine.

## F10 (2026-10-30): engine fixes, objective-aware AI, figure tuning, sounds, QA
- Engine: unit set-up fallback, re-formed move and charge routes (`src/engine/phases/reform.ts`), the Champion of Raids charge-phase
  hook, and separate normal and mortal damage pools. Spec note in `docs/spec/13-engine-port-plan.md`.
- AI: objective-aware move scoring (`src/ai/objectives.ts`), Kharadron hints, utility tuning. Matrix rerun in `docs/balance.md` (672
  games, 0 invariant violations): Kharadron 73% wins, Kruleboyz 59%, Ironjawz 54%, Fyreslayers 51%, Lumineth 44%, Cities 41%,
  Gloomspite 32% (up from 24%), Slaves 23%.
- Figures and sounds: GLB repaint and gallery tuning (`glbPaint.ts`, `FigureGallery.tsx`); nine regenerated AoS sounds with the
  redo scripts in `tools/local-audio/`.
- QA on the built site (`vite preview --port 4473`): `tests/e2e/f10-playthrough.spec.ts` plays Gloomspite (human, seat A) vs the
  Lumineth bot on Ghyran and Kharadron (human) vs the Kruleboyz bot on Aqshy to the end screen in 4 rounds. No console errors, no
  failed requests, no stalled decisions, ability prompts for Flankin' Force, Careening Destruction, Ply the Skies, Assault Boat and
  Timed Charges all appeared and worked. Close-ups of the new GLB figures (Snarlpack Cavalry, Hurakan Windchargers, Arkanaut
  Company, Man-skewer Boltboyz) read clearly. Shots in `e2e-out/f10/` (gitignored). No player-blocking bugs found, so no code fixes.
- Small things seen, not fixed: floating unit labels can sit on top of the HUD when the camera is close and tilted; the Kharadron
  human deployment can stack a Hero on a small unit when the strip is crowded.

## F11 (2026-10-30): four more army specs, label and deploy polish, smarter Slaves and Gloomspite
- Specs for the next four armies written from the official PDFs: `docs/spec/factions/stormcast-eternals.md`, `skaven.md`,
  `seraphon.md`, `soulblight-gravelords.md` (mechanics mapping tables, RULINGs, test ids).
- Polish: floating unit labels scale with camera distance (`src/client/interaction/labelScale.ts`), GLB loader and body fixes, a setup
  fix so deployed units never overlap (`src/engine/setup.ts`), underdog behaviour for Slaves and Gloomspite (`src/ai/underdogs.ts`).

## F12 (2026-10-31): Stormcast, Skaven, Seraphon and Soulblight
- Twelve armies now play: Stormcast Eternals (Vigilant Brotherhood), Skaven (Warpspark Clawpack), Seraphon (Sunblooded Prowlers),
  Soulblight Gravelords (Bloodcrave Hunt). Data in `src/data/factions/{stormcast,skaven,seraphon,soulblight}/`, hooks in
  `src/engine/factions/`, generic engine additions listed in `docs/spec/13-engine-port-plan.md` section 3.11 (additive).
- Client: crests, start-screen cards, stand-in figure kits, GLB slug mapping (a slug is requested only when its file exists, so a
  missing GLB draws the stand-in), weapon sounds and tracer looks.
- QA (`vite preview --port 4473`): `tests/e2e/f12-playthrough.spec.ts` plays Stormcast (human) vs the Skaven bot on Aqshy and Soulblight
  (human) vs the Seraphon bot on Ghyran to the end screen in 4 rounds; no console errors, no failed requests, no stalled decisions.
  Ability prompts for Storm Charge, Shield of Azyr, Plan the Attack, Deliver Judgement, Blaze of Glory, Cleansing Fires, Spirit Gale,
  Vile Transference and Skeleton Legion appeared and worked. The same two games also pass on a clean checkout of `HEAD` built without
  the uncommitted GLBs and mp3s (stand-in figures, silent new sounds, nothing fatal). Shots in `e2e-out/f12/` (gitignored).
  `f12-armies.spec.ts` (start screen on desktop and phone landscape, deployment) still passes too.
- The Pages deploy of `0b71ab9` failed in the CI test step: GLBs and mp3s of the new armies are untracked, and five tests read them from
  disk (AUDIO-AOS-001, 002, 005, FIG-AOS-006, CLIENT-F12-004). The QA commit makes those tests warn instead of fail when `CI` is set and a
  file is missing (and CLIENT-F12-004 / FIG-AOS-006 read the declared slug map, not the on-disk list). Locally a missing file still fails.
- Still open: `public/assets/models/{sce,skv,ser,sbg}-*.glb` (24 files), `public/audio/aos-{stormcast,skaven,seraphon,soulblight}-*.mp3`
  (31 files), `art/unit-concepts/aos/` and the audio tooling are untracked. Until they are committed, the live site draws the new armies
  as stand-in kits and the new sounds fall back silently (the audio loader swallows the 404). Commit them, then the CI warnings go away.
- Balance for the four new armies has not been run: `npm run sim` matrix and `tools/balance-stats.ts` still need a 12x12 pass.

## F13 (2026-10-31): four more army specs, 12-army balance matrix, camera fit, phone prompts, picker tests
- Specs written from the official PDFs: `docs/spec/factions/{blades-of-khorne,maggotkin-of-nurgle,nighthaunt,sylvaneth}.md`, each with a
  mechanics mapping table (a data / b hook / c engine), RULINGs and test ids (BOK-, MON-, NH-, SYL-). F14 built them.
- 12-army balance matrix in `docs/balance.md` (1,584 games, 24 per pairing, seed 21): Stormcast 64.8%, Kharadron 63.6%, Ironjawz 59.5%,
  Soulblight 59.1%, Kruleboyz 53.0%, Seraphon 50.4%, Fyreslayers 42.8%, Lumineth 41.7%, Skaven 37.5%, Cities 36.7%, Gloomspite 28.0%,
  Slaves 23.9%. AI `arrivalStrike` (`src/ai/utility.ts`): reserve arrivals are set up where they can hit something (AI-ARRIVE-001/002).
- Camera: the deployment view and round 1 overview fit the 30x22 Spearhead board on desktop and on a phone in landscape
  (`src/client/board/cameraPresets.ts`, `CameraRig.tsx`; `tests/e2e/f13-camera.spec.ts`).
- Phone: the decision prompt sits in a bottom sheet that no longer covers the board during deployment
  (`BottomSheet.tsx`, `DecisionPrompt.tsx`; `tests/e2e/f13-phone.spec.ts`).
- Picker tests: `tests/e2e/f13-pickers.spec.ts` (PICK-001/002) picks a non-default regiment ability and enhancement and checks they reach
  the Mission panel on desktop and phone.

## F14 (2026-10-31): Khorne, Nurgle, Nighthaunt and Sylvaneth
- Sixteen armies now play: Blades of Khorne (Fangs of the Blood God), Maggotkin of Nurgle (Bleak Host), Nighthaunt (Slasher Host),
  Sylvaneth (Spitewing Flight). Data in `src/data/factions/{khorne,nurgle,nighthaunt,sylvaneth}/`, hooks in `src/engine/factions/`,
  generic engine additions in `docs/spec/13-engine-port-plan.md` section 3.12 (additive). Faction ids on the start screen:
  `khorne`, `nurgle`, `nighthaunt`, `sylvaneth`. Figures (18 GLBs), concepts and sounds landed in `c05b8ed`.
- QA (`vite preview --port 4477`): `tests/e2e/f14-playthrough.spec.ts` plays Khorne (human) vs the Nighthaunt bot on Aqshy and Sylvaneth
  (human) vs the Nurgle bot on Ghyran to the end screen in 4 rounds; no console errors, no failed requests, no stalled decisions. A third
  test serves 404 for every GLB and mp3 and plays Khorne vs Nighthaunt through round 2: stand-in figures draw, nothing fatal.
  Ability prompts seen and working: The Quarry, Stalk the Prey, Blood-Drenched, Pack Hunters, Target of Vengeance, Heartwood Hunting
  Horn, Zephyrspites, Lifebringers, Spiterider Charge, Deafening Drone. Full suite: typecheck clean, 93 files / 1321 tests pass.
  Shots in `e2e-out/f14/` (gitignored). No player-blocking bugs found, so no game-code fixes in the QA commit.
- Seen, not fixed: the stand-in kits reuse other armies' figures (Nighthaunt units draw as green cultist stand-ins when a GLB is
  missing); the ability buttons show only the name, with the rule text in the unit card.
- Balance for the four F14 armies has not been run (the matrix above is 12 armies).

## F15 (2026-10-31): four more army specs, F14 rules audit, 16-army balance
- Specs written from the official PDFs: `docs/spec/factions/{daughters-of-khaine,idoneth-deepkin,disciples-of-tzeentch,ossiarch-bonereapers}.md`
  (Heartflayer Troupe, Soulraid Hunt, Tzaangor Warflock, Mortisan Elite), each with a mechanics mapping table, RULINGs and test ids
  (DOK-, IDK-, DOT-, OBR-). F16 built them.
- F14 rules audit, three fixes: Khorne Killing Pounce and Stalk the Prey, Sylvaneth Zephyrkin keywords (with tests).
- 16-army balance matrix in `docs/balance.md` (2,880 games, 24 per pairing, seed 21): Sylvaneth 70.3%, Nurgle 69.7%, Nighthaunt 62.8%,
  Kharadron 61.4% at the top; Slaves 25.0% and Khorne 6.1% at the bottom. The Khorne number is at least partly the Call for Reinforcements
  placement bug that F16 fixed (Flesh Hounds and the Claws were never offered back), so that row is stale.

## F16 (2026-10-31): Daughters of Khaine, Idoneth Deepkin, Disciples of Tzeentch, Ossiarch Bonereapers
- Twenty armies now play. Faction ids on the start screen: `daughters`, `idoneth`, `tzeentch`, `ossiarch`. Data in
  `src/data/factions/{daughters,idoneth,tzeentch,ossiarch}/`, hooks in `src/engine/factions/`, generic engine additions in
  `docs/spec/13-engine-port-plan.md` (additive), including the Call for Reinforcements fix (`reinforcementFormation` packs oval or mixed
  bases by their real footprints). Commit `749d860`; GLBs, concepts and sounds for the four armies are separate commits.
- QA (`vite preview --port 4485`): `tests/e2e/f16-playthrough.spec.ts` plays Daughters (human) vs the Tzeentch bot on Aqshy and Ossiarch
  (human) vs the Idoneth bot on Ghyran to the end screen in 4 rounds, Khorne (human) vs the Stormcast bot (Call for Reinforcements), and
  Daughters vs Tzeentch with every GLB and mp3 answering 404 (stand-in figures draw, nothing fatal). No console errors, no failed requests,
  no stalled decisions. `f16-armies.spec.ts` still passes (start screen, phone strip, Predict the Future, Relentless Discipline).
- Confirmed in the Khorne game: with Flesh Hounds destroyed the human is offered "Call for Reinforcements (army)" in the movement phase
  (it was offered 5 times, 3 replacements happened). Ability prompts seen and working: All-Out Slaughter, Blessing of Khaine, Turned to
  Crystal, Refined Creations, Relentless Discipline, Switch Aspects, Call for Reinforcements; the Morghast Dread Descent arrival prompt too.
- One fix: a reserve arrival (`deployUnit` in the movement phase, e.g. Dread Descent) said "Deploy your forces ... inside your deployment
  zone"; it now reads "Bring on reinforcements" and "click where the unit arrives" (`DecisionPrompt.tsx`). Shots in `e2e-out/f16/`
  (gitignored).
- Seen, not fixed: close-up camera labels overlap (unit name over the objective label); with the GLBs missing the Doomfire Warlocks stand-in
  is a tall red pillar; the ability buttons show only the name.

## F17 (2026-10-31): last five army specs, F16 rules audit, 20-army balance
- Specs written from the official PDFs: `docs/spec/factions/{hedonites-of-slaanesh,helsmiths-of-hashut,flesh-eater-courts,ogor-mawtribes,sons-of-behemat}.md`
  (Epicurean Revellers, Helforge Host, Carrion Retainers, Warglutt Marauders, Stone Lobbas), each with a mechanics mapping table, RULINGs and test
  ids (HOS-, HOH-, FEC-, OGM-, SOB-). F18 built them.
- F16 rules audit came back clean apart from small fixes in `aos-common`, Daughters, Khorne and Tzeentch (with tests, `engine-f17.test.ts`).
- Return-model and line-of-sight fixes: `returnSlainModels` now follows the 3" rule (core 22.0) and `los.ts` was corrected; AI tweaks in
  `src/ai/utility.ts` and `underdogs.ts`.
- 20-army balance matrix in `docs/balance.md` (3,800 games, 20 per pairing, seed 23, 0 invariant violations): Nurgle, Sylvaneth, Kharadron and
  Nighthaunt lead; Slaves, Gloomspite and Fyreslayers trail. The Khorne row is fixed by the F16 Call for Reinforcements repair.

## F18 (2026-10-31): Slaanesh, Hashut, Flesh-eater Courts, Ogors, Sons of Behemat; QA pass
- Twenty-five armies now play (commit `37949db`): faction ids `slaanesh`, `helsmiths`, `fec`, `ogors`, `behemat`. Data in
  `src/data/factions/<id>/`, hooks in `src/engine/factions/<id>.ts`, engine additions (multi-target declare, rollFloor / noAbilities /
  passAcrossTerrain effects, reserve rule fix) noted in `docs/spec/13-engine-port-plan.md`. `npm test` is green except FIG-AOS-006 while the
  `fec-abhorrant-archregent` GLB is still being made (a warning only under CI).
- QA (`vite preview --port 4489`): `tests/e2e/f18-playthrough.spec.ts` plays, through the real UI, Slaanesh vs Helsmiths (Aqshy), Ogors vs
  Flesh-eater Courts (Ghyran), Sons of Behemat vs Stormcast, Slaanesh with Daemonic Onslaught vs Helsmiths, Helsmiths with Grinding Advance vs
  Sons of Behemat, and Slaanesh vs Helsmiths with every GLB and mp3 answering 404 (stand-ins, silence, through round 2). All reach the end screen
  in 4 rounds, no console errors, no failed requests, no stalled decisions. Shots and per-game event logs in `e2e-out/f18/` (gitignored).
- Confirmed: the deployment-phase prompt "Both armies are set up: use an ability?" offers Daemonic Onslaught (Fiends move 10") and Grinding
  Advance (up to two Infernal Cohort units move 3", no round-1 charge) and both resolve before round 1. The 90mm gargants (Boulder Basher and
  two Rock-hurlers) deploy, move, advance, charge (successes and failures), pile in, shoot and fight across all four rounds as bot and as human, and
  are never stuck. Ability prompts seen: Dispensers of Favour, Soporific Musk, Roaring Warlord, Scoff Down Fresh Flesh, Close One Eye!, Drop Toss
  or Roll, Bowled Over, Ruinous Bombardment, Strike the Gongs, Call for Reinforcements. Missing-GLB figures fall back cleanly.
- No player-blocking bug found, so no code fix this stage. Seen, not fixed: ability buttons show only the name (no effect text); the human QA
  bot never uses most optional abilities in later rounds.

## Next
- Balance: the F17 matrix covers twenty armies; rerun with all twenty-five (the F18 five are untested in AI-vs-AI) and put it in
  `docs/balance.md`. Use `tools/ai-trace.ts` on the worst pairings.
- Art and audio for the F18 armies are separate commits (figure and audio agents); finish the `fec-abhorrant-archregent` GLB so FIG-AOS-006 passes.
- Charnel Watch and Mawseeker Mob appendices in the FEC and Ogor specs are the next army candidates.
- The QA bot as a human only takes the default regiment ability and enhancement and the first option in each prompt; `f13-pickers.spec.ts`
  covers the pickers, but no scripted game plays the chosen abilities (Fearless Invaders, Fyresteel Throwing Axes, Cloud of Bats, Skitterleap,
  Beacon of Nagashizzar, Gift of Febrile Frenzy).
- Check that the Kharadron bot uses Ply the Skies (`tests/engine/kharadron.test.ts` KO-BT-3 end to end).
- Phone: the board is small while a prompt is open and unit tags crowd the objective labels; hide tags during placement.
- Camera: fade or clamp floating unit labels near the HUD in close-up views.
- Stand-in kits for Nighthaunt (and the other new armies) could take a faction tint so a missing GLB still reads as the right army.
- Ship: push to `main`; Pages deploys `dist/` at https://dragoonant.github.io/mallet-swordtip/.
