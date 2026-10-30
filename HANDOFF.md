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
  four enhancements) and Saga Axeband (Awaken the Runes, Magmic Tunnels, Fyresteel Throwing Axes, four enhancements), with MGSD GLBs
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
- None of the four has MGSD GLBs yet: every figure is the procedural stand-in (base disc plus coloured block). It loads cleanly, no
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

## Next
- Balance: Gloomspite (32%) and Slaves (23%) still trail; read `docs/balance.md`, then `tools/balance-stats.ts --armies a,b` and
  `tools/ai-trace.ts` on their worst pairings. Pull Kharadron (73%) back by AI play, not stats.
- Check that the Kharadron bot now uses Ply the Skies (`tests/engine/kharadron.test.ts` KO-BT-3 end to end) after the F10 AI hints.
- Add a regiment-ability / enhancement picker test pass for Fearless Invaders and Fyresteel Throwing Axes (the QA bot only takes the default).
- Phone: the board is small while a prompt is open and unit tags crowd the objective labels; hide tags during placement.
- Camera: fade or clamp floating unit labels near the HUD in close-up views.
- Ship: push to `main`; Pages deploys `dist/` at https://dragoonant.github.io/mallet-swordtip/.
