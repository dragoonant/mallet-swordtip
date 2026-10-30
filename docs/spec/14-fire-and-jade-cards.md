# 14 — Fire and Jade card lists (twist + battle tactic) and battleplan cross-check

Source: Wahapedia, AoS4 "Fire and Jade" rules page (`wahapedia.ru/aos4/the-rules/fire-and-jade/`), read 2026-10-29.
All text below is paraphrased; mechanics and numbers are 1:1. Card/ability names match the source.
This file fills the card gap flagged in `11-spearhead.md` SPH-14.4 and §18. Data shapes: `11-spearhead.md` §16.2/16.3.

Conventions used here:
- **Picker** values are the SPH-9.3 enum: `underdog`, `rollOffWinner`, `underdogElseRollOff` (underdog if there is one, otherwise roll-off winner), `both` (each player acts, active player first). "Underdog else each player" cards are written as `underdog / else each player, active first`.
- "Duration `round`" = until the end of the battle round it was drawn in.
- "Turn-end VP bonus" means an extra VP scored by the active player at `turn.end.scoring` (SPH-8.6 step 3), on top of SPH-11.1. Twist effects timed "after VP are scored" run at `turn.end.afterScoring`.
- A `unit-targeted` pick is made at the moment the twist is drawn (step 3 of SPH-8.2) from units currently on the battlefield.

## 1. Deck sizes

| Deck | Count | Notes |
|---|---|---|
| Aqshy twist deck | **6** | only 4 are ever drawn in a battle (4 rounds), so 2 are never seen |
| Ghyran twist deck | **6** | same |
| Battle tactic deck (per player) | **12** | both players have an identical 12-card list; 3 in hand, 4 rounds |

This answers the missing glyph in SPH-3.1. Total printed cards: 12 twist + 24 tactic (12 per player).

## 2. Twist cards — Aqshy side (`side: 'aqshy'`)

### card.twist.ring-of-fire — Ring of Fire
- Picker: `underdogElseRollOff`. Duration: `round`.
- Pick 1 objective. For the rest of the round it is controlled by nobody, cannot be contested and cannot be gained or held.
- At the end of **every turn** this round, after VP are scored (`turn.end.afterScoring`), roll a D3 for **each unit** that has any model on the picked objective (any part of a base overlapping the circle, SPH-6.2) and inflict that many mortal damage to the unit. One roll per unit. Applies to both players' units.
- Engine note: the objective's prior controller is cleared at draw time; control resumes the normal way (SPH-6.3) next round, starting from "no controller" (the source does not say whether the old controller is restored; default: not restored).

### card.twist.let-the-blood-flow — Let the Blood Flow
- Picker: `underdog` (only for the second paragraph; first paragraph is automatic). Duration: `round`.
- Turn-end VP bonus for **both** players: +1 VP per enemy unit destroyed **during that turn**.
- If one player is the underdog, they pick 1 friendly unit on the battlefield to be *frenzied*: +1 to hit rolls for its combat (melee) attacks for the rest of the round. No underdog means no frenzy.

### card.twist.bloodmarked — Bloodmarked
- Picker: `underdog / else each player, active first`. Duration: `round`.
- With an underdog: the underdog picks **one unit from each army** (so one friendly and one enemy unit) to be *bloodmarked*.
- Without an underdog: each player picks 1 **enemy** unit to bloodmark, active player first.
- At the **end of the battle round**: each player scores +1 VP if the bloodmarked unit of the opposing army (the one in the enemy army) was destroyed during this round. Scoring is at round end, not turn end (window `round.end`, after End of Battle Round abilities, SPH-8.7).
- Ambiguity: "destroyed this round" counts destruction in either player's turn. A bloodmarked unit that is later replaced via Reinforcements does not carry the mark (replacement is a new unit, SPH-12.3).

### card.twist.reclaim-aqshy — Reclaim Aqshy
- Picker: `underdog / else each player, active first`. Duration: `round`.
- With an underdog: the underdog picks **2** objectives. Without: each player picks **1** objective, active player first (the two picks must be different objectives; the source implies two distinct ones).
- Turn-end VP bonus for **both** players: +1 VP for each of the picked objectives they control at that moment. Applies to both turns of the round.

### card.twist.mount-the-attack — Mount the Attack
- Picker: `underdog` (second paragraph only). Duration: `round`.
- Turn-end VP bonus for the active player: +1 VP for each objective they control at end of turn that their **opponent controlled at the start of that turn** (flip count). Needs a snapshot of `objectiveControl` at turn start (`turn.start`).
- The underdog (if any) picks 1 friendly unit to be the *spearhead*: its melee weapons have the **Charge (+1 Damage)** weapon ability for the rest of the round.

### card.twist.wreathed-in-smoke — Wreathed in Smoke
- Picker: `underdogElseRollOff`. Duration: `round`.
- Pick 1 objective. Until the end of the round, for any attack that **targets a unit contesting that objective**, a hit roll succeeds only on an **unmodified 6**. Applies to all attackers, both players, shooting and melee.

## 3. Twist cards — Ghyran side (`side: 'ghyran'`)

### card.twist.reclaim-ghyran — Reclaim Ghyran
Identical rules to Reclaim Aqshy (section 2): underdog picks 2 objectives, otherwise each player picks 1 (active first); each player gets +1 VP at the end of their own turn for each picked objective they control. Duration `round`. Same slug family, distinct id from the Aqshy copy.

### card.twist.alarielles-blessing — Alarielle's Blessing
- Picker: `underdogElseRollOff` picks **one of two effects** (the picker chooses; the choice applies to the picker's own army). Duration: `round`.
  - **Shield of Thorns:** pick 1 friendly unit on the battlefield. For the round it has Ward (6+). If it already has a ward save, add +1 to its ward rolls instead.
  - **Rain of Jade:** pick up to 3 **different** friendly units on the battlefield. Heal (D3) each, rolling separately per unit, immediately.

### card.twist.take-the-land — Take the Land
- Picker: `underdog` (second paragraph only). Duration: `round`.
- Turn-end VP bonus for the active player: +1 VP if there are more **friendly** models contesting the **large terrain feature in enemy territory** than enemy models contesting it. (Each player is judged against the large feature on the opposing side of the board.)
- The underdog (if any) adds +1 to wound rolls for attacks by their units that target a unit contesting **a** large terrain feature (either one). Only the underdog gets this, for the round.
- Needs a terrain-contest test (SPH-5.9 / §18): the source here does not define it; use the default in SPH-5.9.

### card.twist.grasping-vines — Grasping Vines
- Picker: `underdogElseRollOff`. Duration: `round`.
- Pick 1 enemy unit (enemy of the picker) on the battlefield. It is *ensnared* for the round: its Move characteristic is halved, and it rolls **one fewer dice** on charge rolls.

### card.twist.the-grandfathers-blessing — The Grandfather's Blessing
- Picker: `underdogElseRollOff` picks **one of two effects**. Duration: `round`.
  - **Nurgle's Rot:** pick 1 enemy unit on the battlefield; subtract 1 from its save rolls for the round.
  - **Eroding Miasma:** pick 1 enemy unit on the battlefield; no ward rolls can be made for it this round.

### card.twist.lifespring — Lifespring
- Picker: `underdogElseRollOff`. Duration: `round`.
- Pick 1 objective; it becomes a *lifespring* for the round.
- Turn-end VP bonus for **both** players: +1 VP at the end of their own turn if they control that objective.
- At the end of every turn this round, after VP are scored (`turn.end.afterScoring`), Heal (1) each unit contesting that objective (both players' units).

## 4. Battle tactic cards (`card.tactic.<slug>`, 12 cards, identical deck for each player)

Each card = a **tactic** (scored at end of its owner's turn, 1 VP, SPH-10.3) and a **command** (one-shot, discards the card). A card is used for one half only. Wording of the tactic conditions is checked at `turn.end.scoring`, i.e. after objective control is resolved (SPH-8.6).

Command notation: `Used by` / `Declare` is the targeting clause; "Reaction" commands are offered when the trigger happens (SPH-10.5). "Any X phase" / "Enemy X phase" means that phase of either player's turn / the opponent's turn only. Command timing "Enemy ... Phase" means the card owner uses it during the *opponent's* turn.

| id | Name | Tactic (complete at end of your turn if...) | Command timing | Command effect |
|---|---|---|---|---|
| card.tactic.war-of-attrition | War of Attrition | at least one enemy unit was destroyed this turn AND more enemy units than friendly units were destroyed this turn | Enemy Hero phase | Stand Guard. Declare: a friendly unit. It has Strike-First for the turn. |
| card.tactic.raid | Raid | at least one friendly unit is wholly within enemy territory and not in combat | Reaction: opponent declared an Attack ability | Steel Defence. Used by: a friendly unit targeted by that ability. Ignore Rend on attacks that target it for the phase. |
| card.tactic.take-the-flanks | Take the Flanks | there is a friendly unit within 3" of **each** short battlefield edge (needs at least two different units; one unit cannot be near both) | Enemy Movement phase | Redeploy (keywords Move, Run). Declare: a friendly unit not in combat. It moves up to D6" and may not enter combat at any point of that move. |
| card.tactic.take-without-warning | Take Without Warning | you gained control of an objective this turn that your opponent controlled at the start of the turn AND none of the units contesting that objective used a Fight ability this turn | Reaction: opponent declared an Attack ability | Fight to the Last. Used by: a friendly unit targeted by that ability. It has Ward (5+) for the phase. |
| card.tactic.hold-ground | Hold Ground | more friendly models than enemy models are contesting the large terrain feature in **your** territory | Any Combat phase | Rise to the Challenge. Declare: a friendly Hero. Heal (D6) it. |
| card.tactic.cut-off-the-head | Cut Off the Head | the enemy general was slain this turn, OR the enemy general was slain in an earlier turn and at least one enemy unit was destroyed this turn | Enemy Charge phase | Counter-Charge. Declare: a friendly unit not in combat. It may use a Charge ability as if it were your charge phase. |
| card.tactic.the-ignax-dais | The Ignax Dais | you control the Ignax objective at the end of your turn | Reaction: you declared a Charge ability | Forward to Victory. Used by: the unit using that Charge. You may re-roll the charge roll. |
| card.tactic.the-behemat-dais | The Behemat Dais | you control the Behemat objective at the end of your turn | Any Hero phase | Scroll of Arcane Bolt. Declare: a friendly Hero, a visible enemy unit within 12" of it; roll a dice. On 2+ inflict D3 mortal damage on that enemy unit. |
| card.tactic.the-dracothion-dais | The Dracothion Dais | you control the Dracothion objective at the end of your turn | Reaction: opponent declared a Shoot ability | Go to Ground. Used by: a friendly unit targeted by it. Until end of phase only unmodified hit rolls of 6 hit it, but it has Strike-Last this turn. |
| card.tactic.raze | Raze | at least one friendly unit is within 3" of a long battlefield edge **while in enemy territory** | Any Hero phase | Inspiring Presence. Declare: a friendly Hero. Roll a dice; for the rest of the turn add the result to that Hero's Control characteristic. |
| card.tactic.attack-on-two-fronts | Attack on Two Fronts | you control 2 objectives that your opponent controlled at the start of the turn | Any Movement phase | Call Reinforcements. Declare: a friendly Infantry or Cavalry unit that started with 5+ models, has been destroyed and has not been replaced. Set up a replacement of **D3 models** from it anywhere on the battlefield more than 6" from all enemy units. |
| card.tactic.do-not-waver | Do Not Waver | at least one friendly unit used a Fight ability this turn AND no friendly unit was destroyed this turn | Reaction: you declared a Retreat ability | Fall Back and Rally. Used by: the retreating unit. The Retreat's mortal damage is not inflicted. After it resolves, roll a dice per slain model of that unit; each 5+ returns one slain model to the unit. |

Notes for the implementer:
- Tactic ids use the card name's slug. Names containing an apostrophe elsewhere (twists) drop it (`alarielles-blessing`).
- Commands never cost anything and can stack with other commands on the same unit in the same phase (SPH-3.4).
- Territory tests: "wholly within enemy territory" (Raid) uses SPH-7/00-architecture territory geometry; "in enemy territory" for Raze means any part of the unit counts only if it is within 3" of a long edge **and** the unit is in the enemy's territory; the source does not say whether this is wholly or partly (default: the unit counts if at least one model's base is in enemy territory and within 3" of a long edge; flag for owner).
- "Slain" general (Cut Off the Head): the source says "slain", which means the general model died, not that the unit was destroyed. Track `general.slainTurn`.
- "Used a Fight ability" (Take Without Warning, Do Not Waver) is the core Fight ability being used by a unit; count both players' units for Take Without Warning (any unit contesting).
- Call Reinforcements here is a card effect that works for a unit destroyed earlier and is separate from the once-per-turn Call for Reinforcements ability (SPH-12). A unit can only be replaced once between them: set the `replaced` flag. The D3-model replacement is not an "identical" unit (it has only D3 models) and, like any replacement, cannot itself be replaced.

## 5. Battleplan, objectives and terrain cross-check against `11-spearhead.md`

Confirmed identical (no action): 4 battle rounds; attacker sets up whole army first, 6" from enemy territory; pre-battle order (roll-off, attacker picks regiment ability + enhancement then defender, defender picks side, defender picks deployment map and which territory is whose, defender sets terrain first); start-of-round order (first turn / priority roll, underdog, twist, tactics, Start of Battle Round abilities); VP scoring (1 / 1 / 1 / 1 per tactic); draw only; board 30" x 22"; terrain counts (2 large, 2 small, one of each per player); passives Cover/Obscuring/Unstable and their rules text; Reinforcements ability (SPH-12 matches word for word in effect).

Fills or differs:
1. **Tactics hand (SPH-10.1/10.2):** matches. Round 1 draw 3; later rounds discard any number first (face up), then draw back to 3. Seizing: the source repeats the "unless underdog and VP gap 5 or more" exception and says nothing about discarding when seizing, so SPH-10.4's open point (can they still discard) remains open.
2. **"Behind a terrain feature" definition differs.** The Fire and Jade page defines it with a single line from the **closest point on the attacking model's base to the closest point on a model in the target unit's base**: if no such line avoids crossing the feature, the target is behind it. SPH-5.7 describes a "no line from any attacker to any target model" test with a 3" combat-range exemption. The page has no combat-range exemption. If you want 1:1 with this page, use the closest-points test. (Terrain Rules 1.1 may refine it; check before changing code.)
3. **Terrain placement margins** (more than 6" between features, more than 3" from both long edges and from enemy territory, not on top of an objective wholly or partly): same as SPH-5.2. The page gives **no feature footprints or heights**; the SPH-5 default table remains invented.
4. **Objective contesting (6.1):** page says "on an objective (wholly or partially)". SPH-6.2 turns that into base overlap; consistent.
5. **Godbeast objectives:** the page says each objective is named after a godbeast but the list/positions are an **image only** (`img/Obj_Spearhead.png`) and not readable as text. The names Ignax, Behemat and Dracothion are confirmed to exist by the tactic cards (Dais cards). Vulcatrix and Nagendra are not mentioned in the text of any card (they are not on a tactic card). Positions in SPH-14.3 are unchanged and unverified.
6. **Deployment maps** are images (`Spearhead_map.png`, `Spearhead_longmap.png`); no text contradicts SPH-14.2.
7. **Twist-driven rules needing engine support not yet in 11-spearhead:** end-of-turn "extra VP" modifiers; end-of-round VP (Bloodmarked); per-turn snapshot of objective control (Mount the Attack, Take Without Warning, Attack on Two Fronts); a "mortal damage per unit on objective" end-of-turn effect (Ring of Fire); objective states `disabled` and `lifespring` / `wreathed`; the frenzy/spearhead/ensnared/bloodmarked unit flags; `generalSlainTurn`; a Reaction window for Attack, Shoot, Charge and Retreat declarations.
8. **Terrain contesting** is used by Take the Land and Hold Ground, so SPH-5.9 (how a model contests a terrain feature) must be settled; the page does not define it.

## 6. Gaps

- Objective and deployment map layouts: image only, not captured.
- The page's "FAQ / Errata" blocks are empty/collapsed; no errata captured.
- No terrain footprints or heights on the page.
- Whether Ring of Fire restores the old controller afterwards is unstated.
- Whether tactic commands marked "Any ... phase" may be used in the opponent's turn is unstated; here "Any" is treated as either player's turn, "Enemy" as opponent's turn only.
