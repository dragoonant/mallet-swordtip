# 12 — Rules test checklist

One row per testable behaviour: `ID | Ref | Tag | given · when → then`. IDs are stable; tests quote them verbatim
(`it('SHOOT-012 crit on unmodified 6 survives a -1')`). Refs point to 10-rules-core (`CORE-x.y`) and 11-spearhead
(`SPH-x.y`); `00 §n` = 00-architecture. Use `ScriptedRng` for dice; dice lists are in consumption order.

Tags: **P0** = must pass for the first playable build (41 rows). **adv** = Advanced Rules / core-only behaviour that
Spearhead mode switches off (SPH-13.1–13.3); test it only in `mode: 'core'` or when a card command reuses the effect.
Untagged = full-rules coverage, due with the module's milestone.

Fixtures (minimal test datasheets, not real data; base mm in brackets):

| Name | Unit | Move | Health | Save | Control | Weapons (Atk / Hit / Wnd / Rend / Dmg) | Keywords |
|---|---|---|---|---|---|---|---|
| Guard | 10 models [32] | 5" | 1 | 4+ | 1 | melee 2 / 4+ / 4+ / – / 1 | INFANTRY |
| Brute | 3 models [40] | 4" | 3 | 3+ | 1 | melee 3 / 4+ / 3+ / 1 / 2 | INFANTRY |
| Boss | 1 model [40] | 4" | 8 | 3+ | 2 | melee 8 / 4+ / 2+ / 1 / 2 | HERO, INFANTRY |
| Knight | 1 model [90×52] | 10" | 7 | 3+ | 2 | ranged 10" 2 / 3+ / 4+ / 1 / 1 Shoot in Combat; melee 5 / 3+ / 4+ / 1 / 2; hooves 2 / 5+ / 3+ / – / 1 Companion | HERO, CAVALRY |
| Cannon | 1 model [120×92] | 3" | 8 | 4+ | 2 | ranged 24" 2 / 4+ / 2+ / 2 / D3+2 | WAR MACHINE |
| Hawk | 1 model [50] | 12" | 4 | 4+ | 1 | melee 3 / 3+ / 3+ / 1 / 1 | FLY |

Coverage tooling: areas are exactly `CORE MEAS ROUND CMD MOVE SHOOT WEAP CHARGE FIGHT DMG MAGIC TERR OBJ SPH CARD
SIM`; IDs match `/\b(CORE|MEAS|ROUND|CMD|MOVE|SHOOT|WEAP|CHARGE|FIGHT|DMG|MAGIC|TERR|OBJ|SPH|CARD|SIM)-\d{3}[a-z]?\b/`.

## CORE — RNG, dice, modifiers, ability framework, reducer

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| CORE-001 | 00 §6 | P0 | `SeededRng('a')` twice · 1000 `next()` each → identical sequences; seed `'b'` → different |
| CORE-002 | CORE-2.1 | | ScriptedRng [1],[2],[5],[6] · roll D3 → 1, 1, 3, 3 |
| CORE-003 | CORE-2.1 | | ScriptedRng [3,4] · roll 2D6 → 7, one `DiceRolled { dice: [3,4] }` |
| CORE-004 | CORE-2.1 | | "D3 roll of 2+" · die 2 → halved 1, fails; die 3 → 2, passes |
| CORE-005 | CORE-2.2 | | a hit die already re-rolled · a second re-roll source applies → no re-roll offered |
| CORE-006 | CORE-2.2 | | +1 hit modifier, die 1 re-rolled to 3 · resolve → total 4 (re-roll before modifier) |
| CORE-007 | CORE-2.2 | | charge roll [1,2] with a re-roll · re-roll → two new dice consumed, old pair discarded |
| CORE-008 | CORE-2.3 | | generic roll-off [4,4,2,5] · resolve → re-roll on tie, second player wins, 4 dice consumed |
| CORE-009 | CORE-2.4 | | hit modifiers {+1,+1} → +1; {−1,−1,−1} → −1; {+1,−1} → 0; same clamp for wound rolls |
| CORE-010 | CORE-2.5 | | save modifiers {+1,+1} → +1; {−1,−1,−1} → −3 (no floor) |
| CORE-011 | CORE-2.5 | | save die 5, Rend 2, save mods {+1,+1} · resolve → 5 − 2 + 1 = 4 (Rend outside the cap) |
| CORE-012 | CORE-2.6 | | Move 2" with −3 → 1"; Rend 1 with −2 → 0; Attacks 5 halved → 2 |
| CORE-013 | CORE-2.7 | | Attacks 3 with "set to 1", "×2", "+1" · evaluate → 3 (set → multiply → add) |
| CORE-014 | CORE-2.9 | | a "treat the roll as 6" effect · roll → no die consumed, value 6 used |
| CORE-015 | CORE-2.10 | | weapon Hit 2+ with +1 · unmodified 1 → fails; same for wound and save rolls |
| CORE-016 | CORE-3.3 | | unit used Normal Move (Core) · same phase → Run and Retreat not offered |
| CORE-017 | CORE-3.4 | | unit used ability X this phase · → X not offered again this phase; offered again next phase |
| CORE-018 | CORE-3.5 | | target behind two Cover features · hit roll → only −1 applied |
| CORE-019 | CORE-3.7 | | a "must" effect that cannot be done · resolve → no partial effect, ability marked used |
| CORE-020 | CORE-3.10 | | Once Per Battle unit ability · used by unit U → still available to another unit with the same warscroll; "(Army)" variant → unavailable army-wide |
| CORE-021 | CORE-3.11 | | "cannot" restriction + a "can" with no override · → cannot wins; with explicit override (Fly) → can |
| CORE-022 | CORE-3.12 | | active and non-active passives set the same characteristic · evaluate → active player's value wins |
| CORE-023 | CORE-3.13 | | both players hold phase-timed abilities · phase runs → all active-player options first, opponent's only after active passes |
| CORE-024 | CORE-3.2 | | an ability is declared · reaction window → active player offered first, players alternate until both pass in a row, then Effect |
| CORE-025 | 00 §2 | P0 | any accepted action · `step` → input state untouched (same ref, deep-equal clone), new state returned |
| CORE-026 | 00 §8 | | `decisionId` ≠ `pending.id` · step → `E_WRONG_DECISION`, state same ref, `events = [ActionRejected]` |
| CORE-027 | 00 §8 | | `action.player` ≠ `pending.player` · step → `E_WRONG_PLAYER` |
| CORE-028 | 00 §8 | | after `BattleEnded` · any action → `E_GAME_OVER`, `pending` null |
| CORE-029 | 00 §6 | P0 | 200-step seeded game · `replay(setup, seed, actions[0..n])` → hash equals `log[n].hashAfter` for every n |
| CORE-030 | 00 §6 | | save at step 120 · load → final hash matches; different major `engineVersion` → refused |
| CORE-031 | SPH-3.5 | | `view(state, 'A')` · → B's tactic hand is a count only, twist and tactic deck order hidden; discards, drawn twists, scored piles visible |

## MEAS — measurement, combat range, coherency, territories

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| MEAS-001 | CORE-1.1 | P0 | two 32 mm bases, centres 2.26" apart · distance → 1.00" edge to edge |
| MEAS-002 | CORE-1.1 | | 32 mm vs 60 mm, centres 5" apart · distance → 5 − 0.63 − 1.18 = 3.19" |
| MEAS-003 | CORE-1.3 | | bases overlapping in plan, Δy 3" · → `h` 0, `dist` 3 |
| MEAS-004 | CORE-1.2 | | `dist` exactly 6.000 → within 6"; 6.001 → not (inclusive) |
| MEAS-005 | CORE-1.2 | | 5-model unit, 4 bases inside a 6" circle, 5th overlapping its edge · → within, not wholly within |
| MEAS-006 | CORE-1.3 | | aura "within 12"", `h` 7, Δy 10 · → `dist` 12.2, not within |
| MEAS-007 | CORE-1.4 | | `h` 3.00 → in combat range; `h` 3.01 → not |
| MEAS-008 | CORE-1.4 | | `h` 2, Δy 8 · → in combat range (no vertical limit) |
| MEAS-009 | CORE-1.5 | P0 | Brute and Guard at `h` 2 · clear LoS → in combat; a wall blocks all LoS → not in combat |
| MEAS-010 | CORE-1.5 | | only one model pair qualifies · → both units in combat with each other (symmetric) |
| MEAS-011 | CORE-1.5 | | unit not in combat ends a move in a visible enemy's combat range · → `movedIntoCombat` true |
| MEAS-012 | CORE-1.6 | | two Guards `h` 0.50 → coherent; 0.51 → not; `h` 0.3 with Δy 4 → coherent (height ignored) |
| MEAS-013 | CORE-1.6 | | warscroll `coherencyRange: 1` · `h` 0.9 → coherent |
| MEAS-014 | CORE-1.7 | | models in a straight chain · 6 models → coherent; 7 models → not (ends have 1 neighbour) |
| MEAS-015 | CORE-1.7 | | two internally coherent clusters 2" apart · → not coherent (graph disconnected) |
| MEAS-016 | CORE-1.7 | | 1-model unit anywhere · → coherent |
| MEAS-017 | CORE-1.8 | P0 | move or set-up ending out of coherency · step → `E_COHERENCY`, state unchanged |
| MEAS-018 | CORE-1.9, SPH-1.4 | | base straddling the territory line · → within both territories, wholly within neither |
| MEAS-019 | CORE-1.1 | | any geometry query · call it → state hash unchanged (side-effect free) |

## ROUND — battle structure, priority, turn order, phases

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| ROUND-001 | SPH-8.1 | P0 | new Spearhead game · play through → exactly 4 rounds × 2 turns, then `BattleEnded` |
| ROUND-002 | CORE-4.16 | P0 | any turn · advance → `PhaseStarted` for startOfTurn, hero, movement, shooting, charge, combat, endOfTurn in order, empty phases included |
| ROUND-003 | CORE-4.16 | | movement phase pending · opponent sends `endPhase` → `E_WRONG_PLAYER`; active player → next phase |
| ROUND-004 | SPH-8.3 | P0 | round 1 start · → `chooseFirstTurn` pending for the attacker; defender's answer rejected; no `PriorityRolled` |
| ROUND-005 | CORE-4.9, SPH-8.3 | P0 | round 2, priority [5,2] → A chooses; [2,5] → B chooses |
| ROUND-006 | CORE-4.9 | | round 2, priority [3,3], A went first in round 1 · → no re-roll (2 dice consumed), A chooses |
| ROUND-007 | CORE-4.10 | | B went second in round 1 and is chosen to go first in round 2 · → `doubleTurn` true, B's turns run back to back |
| ROUND-008 | SPH-8.5 | | B (second in R1) wins priority and picks first · → `round.seized = B`, `InitiativeSeized` |
| ROUND-009 | SPH-8.5 | | A (first in R1) wins priority and picks second · → B goes first, double turn, `seized` null |
| ROUND-010 | SPH-8.5 | | tie, A (first last round) chooses B to go first · → `seized` null (B did not win the roll) |
| ROUND-011 | SPH-8.4 | | VP 5–3 at round start → underdog = the player on 3; 4–4 → null; round 1 → null |
| ROUND-012 | SPH-8.2 | | start of round 2 · → events in order `PriorityRolled`, `UnderdogDetermined`, `TwistDrawn`, `TacticsDrawn`, then Start of Battle Round windows |
| ROUND-013 | CORE-4.12 | | both players hold Start of Battle Round abilities · → first-turn player's window first |
| ROUND-014 | CORE-4.17 | | Start of Turn · → active player's Start-of-Your/Any-Turn options, then opponent's Start-of-Enemy/Any-Turn |
| ROUND-015 | SPH-8.6 | P0 | end of turn · → windows `turn.end.abilities` (active, then opponent) → `turn.end.control` → `turn.end.scoring` → `turn.end.afterScoring` |
| ROUND-016 | SPH-8.7 | | twist with duration `round` · end of round → End of Battle Round abilities (active = second-turn player first), then the effect expires |
| ROUND-017 | SPH-11.3 | P0 | after round 4 · VP 7–5 → `BattleEnded { winner }`; 6–6 → `BattleEnded { draw }` |
| ROUND-018 | SPH-11.3 | | B has no units left in round 2 · continue → B's turns still run every phase, A keeps scoring, no early end |
| ROUND-019 | CORE-4.14, SPH-7.3 | | unit still in reserve at start of round 4 · → destroyed (`UnitDestroyed`) before the first turn of round 4 |
| ROUND-020 | CORE-4.13, SPH-6.4 | | start of round 1 · → objective control determined once after Start of Battle Round abilities; not at start of round 2 |
| ROUND-021 | CORE-4.18 | | hero phase, opponent holds an Enemy Hero Phase ability · → offered only after the active player passes |
| ROUND-022 | SPH-7.4 | | rule keyed on "finished deploying first" · → resolves to the attacker |
| ROUND-023 | CORE-4.8 | adv | core mode, round 1 · → player who finished deploying first chooses first turn |
| ROUND-024 | CORE-4.11 | adv | core mode, round 1 · → no underdog; priority roll still only from round 2 |

## CMD — commands

In Spearhead the only commands are battle-tactic card halves (CARD area). The `adv` rows define the shared
effects; when a Fire and Jade card's command matches one, its test reuses the row ID with `mode: 'spearhead'`.

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| CMD-001 | SPH-13.1 | | Spearhead game · any window → no CP in state, no universal command among legal actions |
| CMD-002 | CORE-5.1 | adv | start of round · → each player +4 CP; the underdog +5 |
| CMD-003 | CORE-5.3 | adv | 0 CP · → no command offered; CP never below 0 |
| CMD-004 | CORE-5.3 | adv | 3 CP left at end of round · → reset to 0 |
| CMD-005 | CORE-5.2 | adv | unit U received a command this phase · → no second command can target U this phase |
| CMD-006 | CORE-5.2 | adv | All-out Attack used for unit U · → not offered for unit V in the same phase; offered next phase |
| CMD-007 | CORE-5.4 | adv | Brute unit in combat · hero phase → Rally not offered |
| CMD-008 | CORE-5.4 | adv | Brute, 1 slain, counter 1 · Rally [4,4,5,1,2,6] → 4 points: 3 return 1 model, 1 heals counter to 0, leftovers lost |
| CMD-009 | CORE-5.4, CORE-14.11 | adv | unit with a Musician · Rally → 7 dice; after the musician is slain → 6 dice |
| CMD-010 | CORE-5.5 | adv | Wizard(1), enemy hero phase · Magical Intervention → casts at −1, power-level budget used |
| CMD-011 | CORE-5.6 | adv | enemy movement phase, Redeploy roll [4] · → up to 4" for every model, cannot enter or end in enemy combat range |
| CMD-012 | CORE-5.6 | adv | unit used Redeploy · later that turn → Covering Fire and Counter-charge not offered for it |
| CMD-013 | CORE-5.7 | adv | Run declared, At the Double used · → no run die consumed, distance = Move + 6 |
| CMD-014 | CORE-5.8 | adv | enemy shooting phase, Covering Fire · → target forced to the closest legal target, all hits −1 |
| CMD-015 | CORE-5.8 | adv | Covering Fire + All-out Attack · hit modifier → net 0 |
| CMD-016 | CORE-5.8 | adv | unit in combat, or that ran this turn · → Covering Fire not offered |
| CMD-017 | CORE-5.9 | adv | enemy charge phase, 1 CP · → Counter-charge not offered (costs 2) |
| CMD-018 | CORE-5.9 | adv | Counter-charge used · → full Charge rules (2D6, ½" end), consumes the unit's Core slot that phase |
| CMD-019 | CORE-5.10 | adv | charge roll [1,2], Forward to Victory · → both dice re-rolled; also offered on a Counter-charge |
| CMD-020 | CORE-5.11 | adv | All-out Attack on Knight's melee · → +1 hit on longsword and on Companion hooves |
| CMD-021 | CORE-5.12 | adv | All-out Defence on target T · → +1 save on T for the rest of the phase, including later abilities |
| CMD-022 | CORE-5.13 | adv | Boss charged, in combat with Brutes (Health 3 < 8) · end of turn Power Through → D3 mortal, then move up to 4" |
| CMD-023 | CORE-5.13 | adv | Power Through target with Health ≥ user's · → not a legal target |
| CMD-024 | CORE-5.13 | adv | Power Through move · may pass through the start enemy's combat range; entering another enemy's → `E_ENGAGEMENT` |

## MOVE — movement, pile-in, set-up

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| MOVE-001 | CORE-6.1 | P0 | Guard, Move 5" · path 5.00 → accepted; 5.01 → `E_OUT_OF_RANGE` |
| MOVE-002 | CORE-6.1, CORE-6.4 | P0 | Normal Move whose path crosses a visible enemy's combat range, ending outside · → `E_ENGAGEMENT` |
| MOVE-003 | CORE-6.4 | | same path, enemy hidden behind blocking terrain · → accepted |
| MOVE-004 | CORE-6.1 | | unit in combat · movement phase → only Retreat offered |
| MOVE-005 | CORE-6.2 | P0 | Run, die [4] · → up to Move + 4; later this turn Shoot and Charge not offered |
| MOVE-006 | CORE-6.3 | P0 | Retreat, D3 die [5] · → 3 mortal resolved through the damage sequence first, then move; ending in enemy combat range → `E_ENGAGEMENT` |
| MOVE-007 | CORE-6.3 | | Retreat path through enemy combat range, ending outside · → accepted; Shoot and Charge not offered after |
| MOVE-008 | CORE-6.5 | | path through any other model's base, or ending overlapping · → `E_OVERLAP` |
| MOVE-009 | CORE-6.5 | | any base part beyond the board edge · → rejected |
| MOVE-010 | CORE-6.5 | | model pivots 180° and moves 3" · → 3" spent (pivot free) |
| MOVE-011 | CORE-6.6 | | 3 of 10 models move, rest stay · → accepted if coherent |
| MOVE-012 | CORE-6.7 | | climb a 3" wall after 2" horizontal · → 5" spent |
| MOVE-013 | CORE-6.7 | | cross a 1" ledge · → only horizontal distance spent |
| MOVE-014 | CORE-6.7 | | move ending on a vertical face mid-climb · → rejected |
| MOVE-015 | CORE-6.8 | | jump down 4" from a ledge · → free, ends that model's move; further path → rejected |
| MOVE-016 | CORE-6.10 | | Hawk Normal Move over models and through enemy combat ranges · → accepted, vertical ignored; ending in combat range → `E_ENGAGEMENT` |
| MOVE-017 | CORE-6.13 | | unit set up this turn outside deployment · same movement phase → no Move ability offered |
| MOVE-018 | CORE-6.11 | P0 | pile-in, a model ends farther from the pile-in target than it started · → rejected; ≤3" and not farther → accepted |
| MOVE-019 | CORE-6.11 | | pile-in that leaves combat with a unit it was in combat with · → rejected |
| MOVE-020 | CORE-6.11 | | pile-in through an enemy combat range into combat with a second enemy · → accepted |
| MOVE-021 | CORE-6.12 | | charged unit not in combat · pile-in 3" in any direction, ending in combat → accepted |
| MOVE-022 | CORE-6.14 | | return a slain model · → must be within coherency of a non-returned model (2 if unit reaches 7+); in combat only with units already in combat |
| MOVE-023 | CORE-6.17 | | unit with a token moves · → token follows; token ignored for coherency, LoS and overlap |

## SHOOT — shooting and the attack sequence (shared with combat)

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| SHOOT-001 | CORE-8.1 | | unit ran or retreated this turn · shooting phase → Shoot not offered |
| SHOOT-002 | CORE-8.2 | P0 | Knight pistol 10" · target at 10.00 → legal; 10.01 → `E_NOT_IN_RANGE` |
| SHOOT-003 | CORE-8.2 | | target not visible to the shooting model · → `E_NO_LOS` for that model; other models with LoS may still shoot |
| SHOOT-004 | CORE-8.3, CORE-12.8 | | Knight in combat with Brutes · Shoot → pistol only, only at Brutes; Cannon in combat → no shooting |
| SHOOT-005 | CORE-8.4 | | enemy unit in combat with a friendly unit · → legal shooting target |
| SHOOT-006 | CORE-11.1 | | 2-model unit · → model 1 targets X, model 2 targets Y in one Shoot |
| SHOOT-007 | CORE-11.1 | | unit with two ranged weapons · Shoot → both fire unless the warscroll restricts choice |
| SHOOT-008 | CORE-11.4 | P0 | Shoot at X then Y · → all X attacks resolve before Y; no model removed until the damage sequence after the whole ability |
| SHOOT-009 | CORE-11.9 | | 2 targets, 2 profiles · → dice consumed per target, per profile in warscroll order, hits → wounds → saves → damage |
| SHOOT-010 | CORE-11.5 | P0 | Hit 4+ · die 4 → hit; die 3 → miss, no wound die consumed |
| SHOOT-011 | CORE-11.6 | P0 | Wound 3+ · die 3 → wound; die 2 → fails, no save die consumed |
| SHOOT-012 | CORE-11.5 | | Hit 4+ with −1 · unmodified 6 → hit and critical |
| SHOOT-013 | CORE-11.5 | | Hit 6+ with −1 · unmodified 6 → 5, miss, not critical |
| SHOOT-014 | CORE-11.5 | | Hit 4+ with +1 · die 5 → 6, hit, not critical |
| SHOOT-015 | CORE-11.6 | | unmodified 6 on a wound roll · → ordinary wound (no critical wound) |
| SHOOT-016 | CORE-11.7 | P0 | Save 4+ vs Rend 1 · die 5 → 4, stopped; die 4 → 3, attack succeeds |
| SHOOT-017 | CORE-11.7 | | Save "–" · → no save die consumed, attack succeeds |
| SHOOT-018 | CORE-11.7 | | Save 2+ with +1 · unmodified 1 → fails |
| SHOOT-019 | CORE-11.8 | P0 | successful attack, Damage 2 · → target pool +2 |
| SHOOT-020 | CORE-2.8, CORE-11.8 | | Cannon D3+2, 2 successful attacks · damage dice [2,5] → pool 3 + 5 = 8; no damage die for failed attacks |
| SHOOT-021 | CORE-14.2 | | Boss within combat range of a friendly Guard · enemy shooting → −1 hit |
| SHOOT-022 | CORE-14.2 | | same Boss (INFANTRY) · shooter 12.01" away → not targetable; 12.00" → targetable |
| SHOOT-023 | CORE-14.2 | | Cannon or a MONSTER hero next to friendlies · → no Guarded Hero; combat attacks never affected |
| SHOOT-024 | CORE-16.6, SPH-5.5 | | target behind a large feature · → not a shooting target; Hawk behind it → targetable |

## WEAP — weapon abilities, command models

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| WEAP-001 | CORE-12.1 | | weapon with two crit abilities · Attack declared → one crit choice per weapon per ability |
| WEAP-002 | CORE-12.2 | | Anti-charge weapon · target charged this turn → Rend +1; not charged → unchanged |
| WEAP-003 | CORE-12.2 | | Anti-Hero and Anti-Infantry vs Boss · → Rend +2 (cumulative) |
| WEAP-004 | CORE-12.3 | | Charge (+1 Damage), attacker charged this turn · → Damage 2 (1 + 1); same unit next turn → 1 |
| WEAP-005 | CORE-12.4 | | Knight under a friendly "+1 Attacks" buff · → longsword 6 attacks, Companion hooves stay 2 |
| WEAP-006 | CORE-12.4 | | Knight hooves vs a target with Cover, under friendly Covering Fire · → hooves still take both −1s (clamped to −1) |
| WEAP-007 | CORE-12.5 | | Crit (2 Hits), one critical hit · → 2 wound rolls |
| WEAP-008 | CORE-12.6 | | Crit (Auto-wound), critical hit · → no wound die, save rolled |
| WEAP-009 | CORE-12.7 | | Crit (Mortal), Damage 2, critical hit · → 2 mortal damage, attack ends (no wound/save dice), ward still rolled |
| WEAP-010 | CORE-12.8 | | Shoot in Combat weapon while in combat · → usable, targets limited to units in combat with it |
| WEAP-011 | CORE-14.10 | | unit with a Champion · → champion's weapons +1 Attacks; champion slain → bonus gone |
| WEAP-012 | CORE-2.8 | | random Attacks D3 on 3 models · Attack declared → 3 dice rolled, one per model, once per declare |
| WEAP-013 | CORE-2.6 | | Rend 1 with −2 · → Rend 0, save unchanged |
| WEAP-014 | CORE-11.3 | | Knight fights · → must use longsword and hooves; only targets in its combat range and visible |

## CHARGE — charging

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| CHARGE-001 | CORE-9.1 | P0 | unit in combat, or ran/retreated this turn · charge phase → Charge not offered |
| CHARGE-002 | CORE-9.1 | | charge roll [3,4] · → move up to 7"; path 7.01 → `E_OUT_OF_RANGE` |
| CHARGE-003 | CORE-9.2 | P0 | end with one model at `dist` 0.50 from a visible enemy → `charged` true; best gap 0.51 → not a legal end |
| CHARGE-004 | CORE-9.2 | | charge path crossing another enemy's combat range · → accepted |
| CHARGE-005 | CORE-9.2 | | end within ½" of an enemy that is not visible (wall between) · → not a legal end |
| CHARGE-006 | CORE-9.3 | | roll too short for any legal end · → only "stay" offered; `charged` false; unit's Core slot used |
| CHARGE-007 | CORE-9.4 | | charge ends within ½" of two enemy units · → in combat with both, no target declared up front |
| CHARGE-008 | CORE-9.2 | | only 1 of 5 models ends within ½" · → legal if the unit is coherent |
| CHARGE-009 | CORE-9.5 | | enemy wholly on a feature with no room · end within ½" of the feature that puts it in combat → legal |
| CHARGE-010 | CORE-9.7 | | `charged` set in turn 1 · end of turn → cleared |
| CHARGE-011 | CORE-6.10 | | Hawk charges over a model and terrain · → accepted, distance measured horizontally |
| CHARGE-012 | SPH-12.4, CORE-6.13 | | replacement unit set up this movement phase · charge phase → Charge offered |
| CHARGE-013 | CORE-9.6, CORE-15.11 | adv | ends within ½" of an enemy manifestation only · → legal charge end |

## FIGHT — combat phase and fight order

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| FIGHT-001 | CORE-10.1 | | both players hold non-Fight Combat Phase abilities · → active player's, then opponent's, all before the first Fight pick |
| FIGHT-002 | CORE-10.3 | P0 | both players have eligible units · → first Fight pick belongs to the active player, then alternate |
| FIGHT-003 | CORE-10.4 | P0 | A has 1 eligible unit, B has 3 · after A's unit fights → B picks its remaining units one after another |
| FIGHT-004 | CORE-10.3 | | player holds an in-combat unit that has not fought · pass / endPhase → `E_PASS_NOT_ALLOWED` |
| FIGHT-005 | CORE-10.3 | | unit that charged but is not in combat · → may fight (pile-in any direction) or pass; no attacks if still not in combat |
| FIGHT-006 | CORE-10.5 | P0 | unit already fought · → not offered again this phase |
| FIGHT-007 | CORE-10.5 | | enemy pile-in brings a fresh unit into combat · → that unit becomes eligible this phase |
| FIGHT-008 | CORE-10.6 | | active A has no Strike-first, B has one Strike-first unit · → A's pick is skipped, B's unit fights, then A picks next |
| FIGHT-009 | CORE-10.6 | | both have Strike-first units · → alternate among them from the active player; when all have fought the active player picks next |
| FIGHT-010 | CORE-10.6 | | Strike-first unit that entered combat mid-phase · → no priority, picked as a normal unit |
| FIGHT-011 | CORE-10.7 | | Strike-last unit while an unfought non-Strike-last unit is in combat · → not pickable; its player passes the pick if nothing else |
| FIGHT-012 | CORE-10.8 | | unit with both Strike-first and Strike-last · → ordered as a normal unit |
| FIGHT-013 | CORE-10.8 | | "fight immediately after" effect · → still blocked while a Strike-first unit is unfought |
| FIGHT-014 | CORE-10.9 | | active player's unit charged, opponent has an older combat · → charger gets no fight-first; pick order is plain alternation from the active player |
| FIGHT-015 | CORE-6.11, CORE-10.2 | | pile-in target not in combat with the fighter · → `E_INVALID_TARGET` |
| FIGHT-016 | CORE-11.2, CORE-11.3 | | fighter in combat with X; Y is 4" away · combat attacks at Y → `E_INVALID_TARGET` |
| FIGHT-017 | CORE-10.2 | | all enemies in combat with a not-charged unit destroyed before its pick · → no longer eligible |
| FIGHT-018 | CORE-10.3 | | combat phase with no unit in combat or charged · → phase ends with no Fight decision |

## DMG — damage sequence, ward, healing

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| DMG-001 | CORE-13.1 | P0 | one Attack ability with 6 successful attacks · → one damage sequence after the last attack, not per attack |
| DMG-002 | CORE-13.1 | | one ability damages units of both players · → active player's units resolve first, each commander orders their own |
| DMG-003 | CORE-13.2 | | Ward (5+), pool 4 · dice [5,4,6,1] → 2 points removed, 2 allocated |
| DMG-004 | CORE-13.2 | | Ward (6+) vs 3 mortal damage · → one ward die per point |
| DMG-005 | CORE-13.2 | | unit with Ward (6+) and Ward (5+) · → only 5+ rolled, once per point |
| DMG-006 | CORE-13.4 | P0 | 3 Brutes (Health 3), pool 7 · → 2 slain, counter 1 (spill-over) |
| DMG-007 | CORE-13.4 | | same unit, next ability pool 2 · → counter 3 → third Brute slain |
| DMG-008 | CORE-13.4 | | counter > 0 · → unit `damaged` true; Heal to 0 → false |
| DMG-009 | CORE-13.5 | | removing the commander's pick splits the unit · → further models removed (fewest possible) and counted as slain |
| DMG-010 | CORE-13.6 | P0 | last model slain with points left in pool · → unit destroyed, remainder discarded, one `UnitDestroyed` |
| DMG-011 | CORE-13.3 | | 3 mortal damage · → no hit/wound/save dice, 3 points pooled |
| DMG-012 | CORE-13.7 | | counter 1, Heal (2) · → counter 0; slain models not returned |
| DMG-013 | CORE-6.14 | | return D3 slain models to a unit missing 1 · die [6] → only 1 returned (capped at starting size) |
| DMG-014 | CORE-14 note | | unit with a standard bearer takes losses · → commander may remove command models last; bonus lost when none remain |
| DMG-015 | CORE-13.6 | | "destroy that unit" effect · → all models slain, `UnitDestroyed` |

## MAGIC — spells and prayers

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| MAGIC-001 | SPH-13.2 | | Spearhead, casting roll ≥ value · → effect resolves; opponent gets no Unbind option |
| MAGIC-002 | SPH-13.2 | | Spearhead, casting roll [1,1] · → spell fails, no mortal damage, caster not locked out |
| MAGIC-003 | SPH-13.2 | | Spearhead · → no Banish, no manifestation summon among legal actions |
| MAGIC-004 | CORE-15.2 | adv | Wizard (1) cast once this phase · → no further Spell/Prayer/Banish offered |
| MAGIC-005 | CORE-15.3 | adv | casting value 7, roll 6 · → fails, no reaction window |
| MAGIC-006 | CORE-15.4 | adv | casting roll [1,1] · → fails, D3 mortal on caster, no more spells for it this phase |
| MAGIC-007 | CORE-15.6 | adv | cast 7 · unbind 7 → spell resolves; unbind 8 → unbound |
| MAGIC-008 | CORE-15.6 | adv | enemy Wizard 30.01" away · → no Unbind offered; at most one Unbind per casting roll |
| MAGIC-009 | CORE-15.7 | adv | Wizard (2) · → 2 unbinds per phase, casting budget untouched |
| MAGIC-010 | CORE-15.8 | adv | chanting roll unmodified 1, ritual points 2 · D3 [4] → points 0 (floor) |
| MAGIC-011 | CORE-15.8 | adv | chanting roll 4, bank · → +4 ritual points, prayer not answered |
| MAGIC-012 | CORE-15.8 | adv | 3 ritual points + roll 3 vs value 6, spend · → answered, points 0; vs value 7 → fails, points kept |
| MAGIC-013 | CORE-15.9 | adv | spell attempted (even failed) by Wizard W1 · → same spell not offered to W2 this turn; Unlimited exempt |
| MAGIC-014 | CORE-15.12 | adv | summoner slain · → its manifestation removed |
| MAGIC-015 | CORE-15.13 | adv | Banish with 1 extra enemy manifestation · → 2D6 + 1 vs banishment value; same manifestation not targeted twice per turn |

## TERR — terrain and visibility

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| TERR-001 | CORE-7.1 | P0 | a sliver of target base visible past a wall · → visible; fully occluded → not |
| TERR-002 | CORE-7.2 | | another friendly unit between shooter and target fully occluding · → not visible; own unit's models never block |
| TERR-003 | CORE-7.4 | | objective marker or token on the line of sight · → never blocks |
| TERR-004 | CORE-16.4, SPH-5.7 | | every line from attackers to target crosses the feature → behind; one clear line → not behind |
| TERR-005 | CORE-16.4 | | the only crossing part lies within the attacker's 3" combat range · → not behind |
| TERR-006 | SPH-5.4 | | target behind a small feature · shooting → −1 hit |
| TERR-007 | CORE-16.5 | | target wholly on a feature · combat attacks → −1 hit |
| TERR-008 | SPH-5.4 | | target behind a feature that charged this turn, or is Hawk · → no Cover |
| TERR-009 | CORE-16.3 | | one base overhangs the feature edge · → not wholly on, no Cover unless behind |
| TERR-010 | CORE-2.4 | | Cover −1 plus Guarded Hero −1 · → net −1 (hit clamp) |
| TERR-011 | SPH-5.5 | | target wholly on a large feature · → not a shooting target; still a combat target |
| TERR-012 | SPH-5.3 | | target behind a small feature · → shooting legal (no Obscuring) |
| TERR-013 | SPH-5.6 | | move ending on a 4" part of a large feature · → rejected; crossing it → accepted; ending on a ≤1" part → accepted |
| TERR-014 | SPH-5.6 | | set-up on a >1" part · → rejected |
| TERR-015 | CORE-16.1 | | footprints 7×7 → small; 7×12 → medium; 8×12 → large |
| TERR-016 | SPH-13.3 | | Spearhead data with an `impassable` or `placeOfPower` trait · `validate:data` → error |
| TERR-017 | SPH-5.9, CORE-17.6 | | unit on a feature, opponent absent · → controlled; unit leaves → uncontrolled (not sticky) |
| TERR-018 | CORE-16.7 | adv | path across Impassable terrain · → `E_OVERLAP` |
| TERR-019 | CORE-16.8 | adv | Hero within 3" of a Place of Power · D6 [1] → D3 mortal; [2+] Wizard +1 cast this turn |

## OBJ — objectives and control

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| OBJ-001 | SPH-6.2 | P0 | base overlapping the circle by 0.01" → contests; 0.01" clear → not; 2" away (in combat range) → not |
| OBJ-002 | SPH-6.3 | P0 | 3 Guards (Control 1) vs Boss (Control 2) contesting · control check → Guards' player gains it (3 > 2) |
| OBJ-003 | CORE-17.4 | | unit with a −5 Control modifier contesting · → unit score 1 (minimum) |
| OBJ-004 | CORE-14.12 | | unit with a standard bearer contesting · → unit score +1 |
| OBJ-005 | SPH-6.3 | | A controls it, scores tie 2–2 · → A keeps it; 0–0 → A keeps it |
| OBJ-006 | SPH-6.3 | P0 | A's unit leaves an A-controlled objective, nobody on it · → A still controls (sticky) |
| OBJ-007 | SPH-6.3 | | unit overlapping 2 circles · → `assignContestedObjective`, active player's units first; counts only on the assigned one |
| OBJ-008 | SPH-6.4 | | an end-of-turn ability moves a unit onto an objective · → control check after it, before scoring, includes it |
| OBJ-009 | SPH-6.4 | | unit steps off and back onto an objective mid-turn · → control unchanged until the end-of-turn check |
| OBJ-010 | SPH-6.4 | | start of round 1 · → control evaluated, `ObjectiveControlChanged` for each newly held objective |
| OBJ-011 | SPH-17 | | control check with no change · → no `ObjectiveControlChanged` emitted |
| OBJ-012 | SPH-6.5 | | Dracothion (on the horizontal line) · → in both territories, wholly in neither |
| OBJ-013 | CORE-17.2 | adv | core mode, marker edge at `h` 3.0 from base, no LoS · → contests |

## SPH — Spearhead pre-battle, deployment, reinforcements, scoring

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| SPH-001 | SPH-1.1 | | model placed with base past x = 15 or z = 11 · → rejected |
| SPH-002 | SPH-4 | P0 | `createGame` · → decisions in order: chooseAttacker (roll-off winner), army options (attacker, defender), side, map (defender), terrain (defender ×2, attacker ×2), deploy |
| SPH-003 | SPH-4.1 | | roll-off [3,3,5,2] · → re-roll on tie, first player wins and picks attacker |
| SPH-004 | SPH-4.2 | | army options · → exactly 1 of 2 regiment abilities and 1 of 4 enhancements; enhancement on the general; the other regiment ability never offered |
| SPH-005 | SPH-4.3 | | defender picks `ghyran` · → Ghyran objectives and twist deck used; Aqshy deck set aside |
| SPH-006 | SPH-4.4 | | defender picks `map.diagonal`, territory B · → territories set; attacker gets A |
| SPH-007 | SPH-5.1 | | a player tries to skip terrain or place 2 large · → rejected |
| SPH-008 | SPH-5.2 | | terrain not wholly in own territory / ≤6" from other terrain / ≤3" from a long edge / ≤3" from enemy territory / touching an objective circle · → each `terrainPlacement` |
| SPH-009 | SPH-14.4 | | default Aqshy horizontal layout · validate → all four pieces legal |
| SPH-010 | SPH-7.1 | P0 | attacker has undeployed units · defender deploy → `E_WRONG_PLAYER`; attacker finishes → defender deploys whole army |
| SPH-011 | SPH-7.2 | P0 | horizontal map, territory A · base edge at z = −6.00 → rejected; −6.01 → accepted; base crossing z = 0 → rejected |
| SPH-012 | SPH-14.2 | | diagonal map · deploy point with 11x + 15z = −111.5 → rejected; −111.7 → accepted |
| SPH-013 | SPH-13.5 | | Spearhead · → no alternating deployment, no 9" rule |
| SPH-014 | SPH-7.3 | | unit deployed to reserve · → off-table, destroyed at start of round 4 if still there |
| SPH-015 | SPH-12.1 | | own movement phase, a destroyed Reinforcements unit · → Call for Reinforcements offered once this turn; never in the enemy's turn |
| SPH-016 | SPH-12.2 | | replacement set-up · not wholly in friendly territory, or not wholly within 6" of an edge, or in combat → rejected |
| SPH-017 | SPH-12.3 | | replacement of a destroyed 5-model unit that had a token and a used Once Per Battle · → 5 models, no token, ability available again |
| SPH-018 | SPH-12.3 | | replacement destroyed · → cannot be replaced; original without Reinforcements keyword → never offered |
| SPH-019 | SPH-12.4 | | replacement set up · that movement phase no Move abilities; shooting and charge phases → offered |
| SPH-020 | SPH-11.1 | | end of own turn, controls 1 of 5, opponent 2 · → +1 VP |
| SPH-021 | SPH-11.1 | P0 | controls 2, opponent 2 → +2; controls 3, opponent 1 → +3; controls 0 → 0 |
| SPH-022 | SPH-11.1 | | controls 4 and completes 2 tactics · → +3 (cap) + 2 = 5 VP, rules `sph.vp.holdOne/holdTwo/holdMore/tactic` |
| SPH-023 | SPH-11.2 | | end of A's turn, B controls 3 · → B scores nothing |
| SPH-024 | SPH-2.1, SPH-13.7 | | army data referencing a datasheet without `spearhead: true`, or with 3 enhancements · `validate:data` → error |
| SPH-025 | SPH-2.7 | | token on a unit · → not targetable, never contests; `TokenGiven` / `TokenRemoved` emitted on change |

## CARD — twist and battle tactic cards

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| CARD-001 | SPH-3.6 | | same seed twice · setup → identical twist and tactic deck orders |
| CARD-002 | SPH-9.1 | | each round start · → exactly one `TwistDrawn { cardId, round }`, visible to both players |
| CARD-003 | SPH-9.2 | | `round` twist drawn in round 2 · → active through round 2 only; a `battle` twist persists to the end |
| CARD-004 | SPH-9.3 | | twist with `underdogElseRollOff` · underdog exists → their decision; no underdog → roll-off, winner decides |
| CARD-005 | SPH-9.4 | P0 | empty twist deck (current data) · round start → no twist, no error, game continues |
| CARD-006 | SPH-10.1 | | round 1 · → each player holds 3 tactics |
| CARD-007 | SPH-10.2 | | round 2, hand of 2 · discard 1 → draw to 3; order first-turn player then the other |
| CARD-008 | SPH-10.4 | | player seized this round · → may discard, draws nothing |
| CARD-009 | SPH-10.4 | | seizer is underdog trailing by 5 VP → draws; trailing by 4 → does not |
| CARD-010 | SPH-10.3 | | end of own turn, 2 met tactics · → owner picks which to score; each +1 VP and moves to the public scored pile |
| CARD-011 | SPH-10.3 | | tactic condition met during the opponent's turn · → not scorable then; rechecked at the end of the owner's turn |
| CARD-012 | SPH-3.3, SPH-10.5 | | card's command used · → card discarded face up, never scorable |
| CARD-013 | SPH-3.4 | | two card commands on the same unit in one phase · → both allowed, no cost |
| CARD-014 | SPH-10.5 | | held card with reaction "opponent declared an Attack" · opponent declares → `useTacticCommand` offered in that reaction window |
| CARD-015 | SPH-10.6 | | tactic deck exhausted · draw step → stops without error |
| CARD-016 | SPH-10.7 | | opponent's `TacticsDrawn` in `view` · → count only, no card ids |
| CARD-017 | SPH-3.5 | | tactic discarded · → visible to the opponent in `view` |

## SIM — headless simulator invariants

| ID | Ref | Tag | given · when → then |
|---|---|---|---|
| SIM-001 | 60 | P0 | 100 seeded AI vs AI Spearhead games · run → every game reaches `BattleEnded`, no `EngineInvariantError` |
| SIM-002 | 00 §6 | | same seed twice · → identical final hash |
| SIM-003 | CORE-1.8, CORE-6.5 | | after every accepted step · → every unit coherent, no base off-board, no overlapping bases |
| SIM-004 | SPH-11.1 | | every turn · → VP monotonic, objective VP per turn ≤ 3 |
| SIM-005 | CORE-13.4 | | every state · → each unit's damage counter < its Health; destroyed units hold 0 models |
| SIM-006 | SPH-6.4 | | every state change · → `objectiveControl` changes only in start-of-round-1 and `turn.end.control` windows |
| SIM-007 | SPH-13.1, SPH-13.2 | | all legal-action lists in Spearhead · → no CP command, Unbind, Banish or manifestation action ever offered |
| SIM-008 | CORE-10.4 | | every game · → each combat phase ends in a bounded number of steps (no fight-order livelock) |
