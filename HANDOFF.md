# HANDOFF — Mallet Swordtip

Read `CLAUDE.md` (token rules), then this file, then `PLAN.md`. `STATUS.md` still describes the
inherited Mallet 42k code below its top note.
The 42k handoff and plan are kept in `docs/history/` for reference.

## State (2026-10-29)
- F0 done: forked from `dragoonant/mallet-42k` at `2ee8fd2`, renamed (package, Vite base
  `/mallet-swordtip/`, titles, PWA manifest, localStorage keys now `swordtip:*` / `swordtip.*`
  so saves never collide with 42k on the shared `dragoonant.github.io` origin).
- Live: https://dragoonant.github.io/mallet-swordtip/ (the 42k game, renamed, until F4).
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

## Next
- Balance: simulated AI-vs-AI games favour Ironjawz heavily (25 of 30 in the cards stage). Check the Cities AI and the unit stats.
- Ghyran side is data only (no Ghyran battleplan file), so only the Aqshy side is playable.
- Phone: the board is small while a prompt is open and unit tags crowd the objective labels; consider hiding tags during placement.
- `public/assets/models` still holds ~270 MB of 40k models that nothing references; prune before the next Pages deploy if size matters.
- The hover highlight ring on a unit activation is a very thick white ellipse; thin it.
- Dead 40k decision-topic hints (Waaagh, Oath of Moment, Stratagem offers) remain in `DecisionPrompt.tsx`; they never fire in Spearhead.
- Officer's Order (CITIES-BT-1) is still off in the engine.
- Ship: push to `main`; Pages deploys `dist/` at https://dragoonant.github.io/mallet-swordtip/.
