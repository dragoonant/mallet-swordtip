# HANDOFF — Mallet Swordtip

Read `CLAUDE.md` (token rules), then this file, then `PLAN.md`. `STATUS.md` still describes the
inherited Mallet 42k code; it stays accurate until F2/F3 replace the engine and data.
The 42k handoff and plan are kept in `docs/history/` for reference.

## State (2026-10-29)
- F0 done: forked from `dragoonant/mallet-42k` at `2ee8fd2`, renamed (package, Vite base
  `/mallet-swordtip/`, titles, PWA manifest, localStorage keys now `swordtip:*` / `swordtip.*`
  so saves never collide with 42k on the shared `dragoonant.github.io` origin).
- Live: https://dragoonant.github.io/mallet-swordtip/ (the 42k game, renamed, until F4).
- JSON schema `$id`s still read `https://mallet42k.dev/...` — internal identifiers, left alone.

## F2 wave 3 (2026-10-29): engine port is playable
- The 40k factions, missions, terrain, tests and tools are deleted. `npm run typecheck`, `npm test`, `npm run validate:data`
  are green. `npm run sim -- --games 100 --seed 1` (random bots; add `--ai` for the utility AI) plays Cities of Sigmar vs
  Ironjawz to the end of round 4 with no invariant violations.
- Hotseat and vs-bot Playwright playthroughs: `PW_PORT=4417 npx playwright test tests/e2e/spearhead-hotseat.spec.ts --project=chromium`
  (about 3 minutes; screenshots land in `e2e-out/`).

## Next: F1 Spearhead spec
- Source the rules: GW's free AoS core rules PDF and the Spearhead rules/battlepack pages
  (Wahapedia `aos4` blocks WebFetch with 403 — use the browser). Save PDFs to `docs/sources/`
  (gitignored; the repo is public).
- Rewrite `docs/spec/10-rules-core.md` and `11-combat-patrol.md` (→ Spearhead), and
  `12-rules-test-checklist.md` with new IDs. Mark which 42k engine modules are kept, adapted or replaced.
- Spec work runs on the session model at high effort; one workflow stage at a time.
