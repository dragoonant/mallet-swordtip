# 10 — Core rules (Age of Sigmar 4th edition)

Own-words engine specification of the AoS 4th edition core rules plus the Advanced Rules modules (Commands, Terrain,
Magic, Army Composition, Command Models, Battle Tactics). Spearhead-specific overrides live in `11-spearhead.md`;
where Spearhead changes a rule here, the rule says so with **[SH]**. Rule ids `CORE-<section>.<n>` are stable and
are cited by the test checklist. Source: `docs/sources/aos4-core-rules.pdf` pp. 5–43 (gitignored). Where the source
is silent or ambiguous the chosen reading is marked **[interp]**. Coordinates follow 00-architecture §7
(1.0 = 1", XZ board plane, Y up). Mechanics and numbers are 1:1; prose is ours.

## 0. Vocabulary and conventions

| Term | Meaning |
|---|---|
| model / unit | a model is one base with the unit's characteristics; a unit is a group of models that act together |
| warscroll | a unit's rules card: Move, Health, Save, Control, keywords, weapons, abilities |
| commander | the player who owns a unit/model; makes every choice for it |
| active player | the player whose turn it is (whether that turn is first or second in the round) |
| friendly / enemy | relative to the player using a rule |
| `h`, `v`, `dist` | horizontal base-edge gap, vertical gap, `sqrt(h²+v²)` (00-arch §7). Plain "within N"" uses `dist ≤ N` |
| within N" | any part of any base of the unit is within N" (inclusive) |
| wholly within N" | every part of every base of the unit is within N" |
| combat range | the 3"-horizontal, unlimited-vertical cylinder around each model (CORE-1.4) |
| in combat | see CORE-1.5 |
| unmodified roll | the die face after re-rolls and before modifiers |
| damage pool | per-unit temporary tally of damage points inflicted by the ability being resolved |
| damaged | a unit with ≥1 allocated damage point |
| ability | anything a unit or player does; has a timing, optional Declare, optional Used By, Effect, keywords |
| command | an ability with a command point (CP) cost |
| reaction | an ability whose timing is a trigger ("Reaction: you declared X") rather than a phase |
| **[SH]** | overridden or narrowed by Spearhead (`11-spearhead.md`) |

## 1. Measuring and geometry

| Id | Rule |
|---|---|
| CORE-1.1 | All distances are in inches, measured between the closest points of the two bases (closest models of each unit). A model with no base measures from its hull. Players may measure at any time (engine: all geometry queries are free and side-effect-free). |
| CORE-1.2 | A model is *within* N" of something if any part of its base is within N"; *wholly within* if every part of its base is. A unit is within if any model is within; wholly within if every model is wholly within. Same definitions for territories and objectives. |
| CORE-1.3 | Default distance is `dist` (3D). Rules that say "horizontally" use `h` only. **[interp]** ranges, charge end (½"), unbind/banish 30", aura "within 12"" all use `dist`. |
| CORE-1.4 | Combat range of a model: 3" horizontally from the edge of its base, unlimited vertically (a cylinder). A unit's combat range is the union over its models. Test: `h ≤ 3` (no `v` term). |
| CORE-1.5 | Two units of opposing armies are *in combat* with each other while either is within the other's combat range **and** they are visible to each other (CORE-7). A model is in combat with an enemy unit if that unit is within the model's combat range and visible to it. A unit not in combat that enters the combat range of a visible enemy unit has *moved into combat*. |
| CORE-1.6 | Coherency range is ½" measured horizontally (`h ≤ 0.5`, height ignored), unless the warscroll gives a longer value (data field `coherencyRange`). |
| CORE-1.7 | A unit is coherent when its models form one connected group in which every model is within coherency range of ≥1 other model; while the unit has 7+ models every model needs ≥2 others within coherency range. **[interp]** "single group" = the coherency graph is connected. A 1-model unit is always coherent. |
| CORE-1.8 | Whenever a unit is set up or finishes any move it must be coherent. A move (or set-up) that cannot end coherent is illegal and is not offered. |
| CORE-1.9 | Battlefield: territories, neutral territory and objectives come from the battleplan. A unit is within a territory if any base part is inside it; wholly within if all base parts are. An objective on a territory border is within all those territories and wholly within none. **[SH]** board size, territories. |

## 2. Dice, rolls and modifiers

| Id | Rule |
|---|---|
| CORE-2.1 | D6 = one six-sided die. nD6 = sum of n dice. D3 = ceil(D6/2); a "D3 roll of X+" tests the halved value. "X+" means result ≥ X. |
| CORE-2.2 | Re-rolls: a die can be re-rolled at most once; re-rolls happen before modifiers. **[interp]** re-rolling a multi-dice roll (charge 2D6, casting 2D6) re-rolls all its dice unless the rule says otherwise. |
| CORE-2.3 | Roll-off: each player rolls a D6, higher wins, ties roll again unless a rule says otherwise (the priority roll does — CORE-4.9). |
| CORE-2.4 | Hit and wound roll modifiers: sum all positive and negative modifiers, then clamp the total to [−1, +1]. |
| CORE-2.5 | Save roll modifiers: sum all modifiers, then cap at +1; there is no floor (any amount can be subtracted). **[interp]** Rend is a characteristic subtracted separately and is *not* part of the capped modifier sum: `saveTotal = die − rend + min(+1, Σmods)`. |
| CORE-2.6 | Floors: no characteristic or roll can be modified below 1, except Rend, whose floor is 0 ("-"). Fractions (including halving) round down. |
| CORE-2.7 | Characteristic modifier order: (1) set-to-value, (2) multiply/divide, (3) add/subtract. Ties within a step follow Order of Effects (CORE-3.12). Modifiers to a random characteristic apply after it is generated. |
| CORE-2.8 | Random characteristics are generated by the commander every time a rule needs them. Random weapon Attacks: rolled per model each time an Attack ability is declared. Random Damage: rolled per attack each time that attack inflicts damage. |
| CORE-2.9 | An effect that replaces a roll with a fixed value is applied before the die would be rolled (no die is rolled). |
| CORE-2.10 | Unmodified 1s always fail hit, wound and save rolls. |

## 3. Abilities framework

| Id | Rule |
|---|---|
| CORE-3.1 | Almost every action is an ability with a timing (e.g. *Your Movement Phase*, *Any Combat Phase*, *Enemy Hero Phase*, *Start of Any Turn*, *End of Your Turn*, *Deployment Phase*, *Passive*, *Reaction: …*), optional Declare, optional Used By, an Effect and keywords (Core, Attack, Shoot, Fight, Move, Run, Retreat, Charge, Spell, Prayer, Unbind, Banish, Deploy, …). Keyword singular/plural are equivalent. |
| CORE-3.2 | Using an ability: (1) Declare — announce it and resolve its Declare step (pick user, targets, make declared rolls such as charge/casting rolls); (2) Reactions — starting with the active player, players alternate using reactions whose trigger matches, until both pass consecutively; (3) Effect — resolve. Engine: reaction window per declared ability, active player decides first. |
| CORE-3.3 | Rule of One (a): a unit may use at most one ability with the **Core** keyword per phase. |
| CORE-3.4 | Rule of One (b): a unit may use the same ability at most once per phase unless the ability says otherwise (Unbind is the core exception, CORE-15.7). |
| CORE-3.5 | Rule of One (c): a unit is affected by a given passive ability at most once at a time (e.g. two Cover sources = one −1). |
| CORE-3.6 | Passive abilities are never declared; they apply whenever their conditions hold and must be applied when possible. Persisting effects ("for the rest of the turn", "this phase") are treated as passive abilities for their duration. |
| CORE-3.7 | Units using or picked by an ability must be on the battlefield unless the ability says otherwise. "Can" = optional for the commander; "must" = mandatory; if a "must" cannot be done, nothing of it applies but the ability still counts as used. |
| CORE-3.8 | "This unit" = the unit using the ability. If an ability affects several units the user orders them; per-unit dice are rolled and resolved unit by unit. Multiple picks must be different units unless stated. |
| CORE-3.9 | Who uses an ability: warscroll abilities → that unit; abilities that tell you to pick a unit → that unit; enhancements → the bearer; anything else → the player. |
| CORE-3.10 | Once Per Phase / Turn / Battle: per unit when used by a unit, per player when used by a player. "(Army)" variants: once per window for the whole army. |
| CORE-3.11 | Contradictions: a "cannot" beats "can"/"must" unless the second rule explicitly overrides that restriction (e.g. Fly ignores the no-combat-range rule of Normal Move). Otherwise the most recently applied effect wins. |
| CORE-3.12 | Order of effects: passive effects count as more recent than non-passive ones; among passives, active player's > opponent's > neutral (e.g. terrain); the active player orders neutral passives. Simultaneous delayed effects: active player resolves all of theirs first (own order), then the opponent. |
| CORE-3.13 | Phase-timed abilities: in each phase the active player uses all their *Your X Phase* / *Any X Phase* abilities in any order, then the opponent uses *Enemy X Phase* / *Any X Phase* abilities. Exception: Fight abilities (CORE-10). |

## 4. Battle structure

### 4.1 Pre-battle

| Id | Rule |
|---|---|
| CORE-4.1 | Set-up order (unless the battleplan overrides): place objectives at the map's marked points, place terrain, determine territories, deployment phase. **[SH]** |
| CORE-4.2 | Territories: roll-off; the winner assigns territories; the loser decides which player begins deployment. Area belonging to neither is neutral territory. **[SH]** |
| CORE-4.3 | Deployment phase step 1: the player who begins deployment uses all their Deploy Terrain abilities, then the opponent. *Deploy Faction Terrain*: set up an undeployed faction terrain feature wholly within friendly territory, >3" from all objectives and other terrain. |
| CORE-4.4 | Step 2: players alternate Deploy abilities, starting with the player who begins deployment; when one has none left the other continues until done. *Deploy Unit*: set up an undeployed unit wholly within friendly territory and >9" from enemy territory. *Deploy Regiment*: pick a regiment with no deployed units; keep using Deploy abilities without alternating until all its units are down (only units of that regiment). Faction Deploy abilities (e.g. set up in reserve) also count as Deploy abilities. **[SH]** |
| CORE-4.5 | Step 3: the player who begins deployment uses any other Deployment Phase abilities, then the opponent. |
| CORE-4.6 | Engine: record which player finished deploying first (the first to have no Deploy abilities left) — needed by CORE-4.8. |

### 4.2 Battle rounds

| Id | Rule |
|---|---|
| CORE-4.7 | The battle lasts the battleplan's number of battle rounds **[SH: 4]**. Each round = two turns, one per player. |
| CORE-4.8 | Start of round step 1, round 1: the player who finished deploying first chooses who takes the first turn (unless overridden). |
| CORE-4.9 | Start of round step 1, round 2+: *priority roll* — a roll-off; the winner chooses who takes the first turn. On a tie (no re-roll), the player who took the first turn in the previous round chooses. |
| CORE-4.10 | Double turn: if the player who took the second turn of round N takes the first turn of round N+1, they act twice in a row. This is legal; its only core consequence is the Tactical Gambit restriction (CORE-18.2). Engine: emit `doubleTurn` flag for UI/AI. |
| CORE-4.11 | Start of round step 2: underdog = the player with fewer victory points; tie = no underdog (so none in round 1 unless overridden). |
| CORE-4.12 | Start of round step 3: CP are granted (CORE-5.1), then the active (first-turn) player uses Start of Battle Round abilities, then the opponent. |
| CORE-4.13 | At the start of the first battle round only, objective control is determined (CORE-17.4). **[interp]** after CP grant and Start of Battle Round abilities. |
| CORE-4.14 | At the start of battle round 4, every unit that was put in reserve by a Deploy ability and is still in reserve is destroyed. |
| CORE-4.15 | End of round: the active player (the one who took the second turn) uses End of Battle Round abilities, then the opponent. Unspent CP are reset to 0. If the last round has been played the battle ends and the battleplan decides the winner. |

### 4.3 Turn phases

| Id | Rule |
|---|---|
| CORE-4.16 | Each turn has 7 phases in fixed order: Start of Turn → Hero → Movement → Shooting → Charge → Combat → End of Turn. Each phase is entered even if nothing happens. |
| CORE-4.17 | Start of Turn: active player uses *Start of Your Turn* / *Start of Any Turn* abilities, then the opponent uses *Start of Enemy Turn* / *Start of Any Turn* (e.g. Activate Place of Power, Tactical Gambit). |
| CORE-4.18 | Hero phase: spells, prayers, banish, Rally, Magical Intervention (enemy). Movement: Normal Move, Run, Retreat; enemy may Redeploy afterwards. Shooting: Shoot; enemy may Covering Fire afterwards. Charge: Charge; enemy may Counter-charge afterwards. Combat: CORE-10. End of Turn: CORE-4.19. |
| CORE-4.19 | End of Turn: (1) active player uses *End of Your Turn* / *End of Any Turn* abilities, then the opponent uses *End of Enemy Turn* / *End of Any Turn*; (2) objective control is determined (CORE-17.4); (3) the active player scores victory points per the battleplan (and battle tactic, CORE-18). |

## 5. Commands

| Id | Rule |
|---|---|
| CORE-5.1 | At the start of each battle round, after the underdog is determined, each player gains 4 CP; the underdog gains 1 extra. (Army Composition extras — underspend, fewer auxiliaries — are CORE-19.3; **[SH]** may not use them.) |
| CORE-5.2 | A command is any ability with a CP cost. To use it, pay its cost. Limits: each unit uses at most 1 command per phase; each command is used at most once per army per phase. Commands that are reactions follow CORE-3.2 windows. |
| CORE-5.3 | Unused CP are lost at the end of the battle round (CORE-4.15). CP never go negative; a command is not offered if unaffordable. |

### 5.1 Universal commands

| Id | Command | Cost | Timing | Who / condition | Effect |
|---|---|---|---|---|---|
| CORE-5.4 | Rally | 1 | Any Hero Phase | a friendly unit not in combat | Roll 6 D6 (7 with a Musician, CORE-14.11); each 4+ = 1 rally point. Spend in any mix: 1 point = Heal (1) on that unit; points equal to the unit's Health = return 1 slain model (CORE-6.14). Leftover points are lost. |
| CORE-5.5 | Magical Intervention | 1 | Enemy Hero Phase | a friendly Wizard or Priest | That unit uses one Spell or Prayer it knows as if it were your hero phase, at −1 to that casting/chanting roll. Counts against its power level (CORE-15.2). |
| CORE-5.6 | Redeploy | 1 | Enemy Movement Phase | a friendly unit not in combat | Each model moves up to D6" (one roll for the unit **[interp]**); may not pass through or end within any enemy combat range. Keywords Move, Run (so the unit has "used a Run ability this turn" — blocks Covering Fire and Counter-charge for it this turn). |
| CORE-5.7 | At the Double | 1 | Reaction: you declared a Run ability | the running unit | No run roll; the Run distance is Move + 6". |
| CORE-5.8 | Covering Fire | 1 | Enemy Shooting Phase | a friendly unit not in combat that has not used a Run ability this turn | Target = the closest enemy unit that is a legal shooting target for it (ties: commander picks **[interp]**). Resolve its shooting attacks against that unit only, all at −1 to hit. Keywords Attack, Shoot (not Core). |
| CORE-5.9 | Counter-charge | 2 | Enemy Charge Phase | a friendly unit not in combat | That unit uses the Charge ability as if it were your charge phase (all Charge conditions apply, incl. no Run/Retreat this turn; uses its Core slot). |
| CORE-5.10 | Forward to Victory | 1 | Reaction: you declared a Charge ability | the charging unit | Re-roll the charge roll (both dice **[interp]**). |
| CORE-5.11 | All-out Attack | 1 | Reaction: you declared an Attack ability | the attacking unit | +1 to hit rolls for that ability's attacks, including Companion weapons. |
| CORE-5.12 | All-out Defence | 1 | Reaction: opponent declared an Attack ability | one unit targeted by it | +1 to save rolls for that unit for the rest of the phase. |
| CORE-5.13 | Power Through | 1 | End of Any Turn | a friendly unit that charged this turn; target = an enemy unit in combat with it whose Health characteristic is lower than the user's | Inflict D3 mortal damage on the target, then the user may move up to its Move. During that move it may pass through/end in combat ranges of enemy units it was in combat with at the start of the move, but not of any other enemy unit; it need not end in combat. Keyword Move (not Core). |

Notes: Covering Fire and All-out Attack can stack (−1 and +1 net 0). All-out Defence is once per army per phase, so
only one targeted unit per phase can receive it. Charge-phase commands are usable by either player's units in the
appropriate window (Forward to Victory also on a Counter-charge).

## 6. Movement and set-up

### 6.1 Core move abilities

| Id | Ability | Timing | Condition | Effect |
|---|---|---|---|---|
| CORE-6.1 | Normal Move (Core, Move) | Your Movement Phase | not in combat | Move up to Move". May not move into combat at any point of the move. |
| CORE-6.2 | Run (Core, Move, Run) | Your Movement Phase | not in combat | Roll D6 (run roll); move up to Move + roll. May not move into combat at any point. Unit has "used a Run ability this turn" → cannot Shoot or Charge this turn. |
| CORE-6.3 | Retreat (Core, Move, Retreat) | Your Movement Phase | in combat | Inflict D3 mortal damage on itself (damage sequence first **[interp]**), then move up to Move". May pass through enemy combat ranges but must not end within any. Cannot Shoot or Charge this turn. |

| Id | Rule |
|---|---|
| CORE-6.4 | "Cannot move into combat" means no point of any model's path may enter the combat range of a visible enemy unit. **[interp]** visibility is evaluated at each sampled path point; with the engine's LoS model an enemy hidden behind blocking terrain does not block the path. Fly ignores this (CORE-6.10). |
| CORE-6.5 | Model movement: models move one at a time in the commander's order; may pivot freely; no part of the base may travel farther than the allowed distance (path length, including vertical climb). Bases stay parallel to the table. Models may not leave the battlefield, pass through other models (friendly or enemy), or end on top of another model. A model that ends on uneven terrain must be placeable stably (engine: footprint must fit a legal surface). |
| CORE-6.6 | Moving is optional per model and per distance ("up to"). The whole unit must end coherent (CORE-1.8). |
| CORE-6.7 | Terrain: models move over, not through, terrain. Terrain parts ≤1" tall are ignored. Taller parts may be climbed up or down; vertical distance counts against the move. A model may not end mid-climb. |
| CORE-6.8 | Jumping down: a model on terrain may move to an edge and drop any height onto a lower surface or the battlefield; the drop is free but immediately ends that model's move. A move that would end mid-jump is illegal. |
| CORE-6.9 | Impassable / Unstable / manifestations / faction terrain restrict end positions — see CORE-16 and CORE-15.11. |
| CORE-6.10 | Fly (passive, keyword Fly): while moving, ignore other models, terrain and enemy combat ranges; ignore vertical distance (measure the move horizontally). It may still not end a move in combat unless the move's ability allows it (Charge, pile-in). It must end in a legal spot. |

### 6.2 Pile-in

| Id | Rule |
|---|---|
| CORE-6.11 | Pile-in (granted by Fight abilities and some others) when the unit is in combat: pick one enemy unit it is in combat with as the pile-in target. Each model may move up to 3", may pass through enemy combat ranges, and must end no farther from the target unit than it started (`dist` to target non-increasing per model). At the end the unit must still be in combat with every unit it was in combat with before the move. |
| CORE-6.12 | Pile-in when the unit is not in combat (e.g. it charged but lost contact): each model may move up to 3" in any direction and may pass through and end within enemy combat ranges. |

### 6.3 Setting up, reserves, replacement, returned models, tokens

| Id | Rule |
|---|---|
| CORE-6.13 | Setting up a unit: all models must be placed legally (coherent, on legal surfaces); if impossible the ability cannot be used. A unit set up in any phase other than the deployment phase cannot use Move abilities in the movement phase of that turn. |
| CORE-6.14 | Returning slain models / adding models: place them one at a time within coherency range of models of the unit that were not returned/added this turn (if the unit will have 7+ models including the new one, within coherency range of ≥2 such models). New models may be set up in combat only with enemy units the unit is already in combat with. |
| CORE-6.15 | Reserve: units set up "in reserve" are off-table. Reserve units placed by a Deploy ability that are still in reserve at the start of round 4 are destroyed (CORE-4.14). |
| CORE-6.16 | Replacement unit: same warscroll, weapon options and model count as the original unless the ability says otherwise (if it gives a fraction, the commander picks which models). It is a brand-new unit: no keywords, abilities, persisting effects or once-per-battle usage carry over. Each unit can be replaced once; replacements cannot be replaced. **[SH]** Call for Reinforcements uses this. |
| CORE-6.17 | Tokens are not models: ignored for visibility, coherency, movement and targeting; they mark persisting effects and follow their unit after each move/set-up. |

## 7. Visibility

| Id | Rule |
|---|---|
| CORE-7.1 | A target model is visible to an observing model if some straight line (any angle) from any point of the observer to any point of the target passes through no object other than models of the observer's own unit. Any visible sliver suffices. |
| CORE-7.2 | Blocking objects: terrain, and all models not in the observer's unit (enemy and other friendly units). A model is always visible to itself. |
| CORE-7.3 | A unit is visible to an observing unit if ≥1 of its models is visible to ≥1 observing model. |
| CORE-7.4 | Engine: true-LoS via the 00-arch sample-point/raycast model; terrain abilities (Obscuring, CORE-16.6) add rule-based blocking on top of geometry. Objective markers never block. Tokens never block. |

## 8. Shooting

| Id | Rule |
|---|---|
| CORE-8.1 | Shoot (Core, Attack, Shoot), Your Shooting Phase: pick a friendly unit that has not used a Run or Retreat ability this turn; pick target(s) for all its attacks; resolve shooting attacks (CORE-11). |
| CORE-8.2 | Shooting attacks use ranged weapons only. Each target must be within the weapon's Range of the attacking model and visible to it. |
| CORE-8.3 | A unit in combat cannot make shooting attacks, except with weapons that have Shoot in Combat (CORE-12.7). If the shooting unit is in combat it may only target units it is in combat with (CORE-11.2). |
| CORE-8.4 | There is no restriction on targeting enemy units that are in combat with friendly units. |
| CORE-8.5 | Guarded Hero (CORE-14.2) and Obscuring (CORE-16.6) can make a unit an illegal target. |

## 9. Charging

| Id | Rule |
|---|---|
| CORE-9.1 | Charge (Core, Move, Charge), Your Charge Phase: pick a friendly unit that is not in combat and has used no Run or Retreat ability this turn; make a charge roll of 2D6 (Declare step — Forward to Victory reacts to it). |
| CORE-9.2 | Effect: the unit may move up to the charge roll in inches. It may pass through enemy combat ranges. The move must end with the unit within ½" of a visible enemy unit (any model; **[interp]** `dist ≤ 0.5` between some model's base and a visible enemy model's base). If it does, the unit *has charged* (this turn). |
| CORE-9.3 | If no legal end position within ½" of a visible enemy exists, the unit may still decline to move; **[interp]** the charge is then failed, the unit stays put and has not charged, but it has used its Core ability for the phase. Engine offers "end move" only at positions satisfying CORE-9.2 or the start position. |
| CORE-9.4 | No charge target is declared in advance; the charging unit may end in combat with any number of enemy units. |
| CORE-9.5 | Charge into terrain: if an enemy unit wholly on a terrain feature cannot be reached because there is no room to end the move on it, the charger may instead end within ½" of that terrain feature, provided that puts it in combat with an enemy unit wholly on that feature. |
| CORE-9.6 | Faction terrain and manifestations count as charge targets per CORE-16.9 / CORE-15.11. |
| CORE-9.7 | "Charged this turn" persists until end of turn and gates: Fight eligibility when not in combat, Charge (+1 Damage), Anti-charge, Cover negation (CORE-16.5), Power Through. |

## 10. Combat phase and fight order

| Id | Rule |
|---|---|
| CORE-10.1 | Combat phase step 1: the active player uses all Combat Phase abilities that are not Fight abilities, then the opponent does. |
| CORE-10.2 | Fight (Core, Attack, Fight), Any Combat Phase: pick a friendly unit that is in combat or charged this turn. It may pile in (CORE-6.11/6.12). Then, if it is in combat, it must pick one or more enemy units as targets and resolve combat attacks (CORE-11). |
| CORE-10.3 | Step 2: players alternate picking one eligible unit to use a Fight ability, starting with the active player. Every unit that is in combat must fight if able; a unit that charged but is not in combat may fight (optional pile-in). |
| CORE-10.4 | When a player has no eligible units left, the other player picks their remaining eligible units one after another until none remain. |
| CORE-10.5 | A unit fights at most once per phase (Rule of One, Core). Units that become in combat during the phase (e.g. via an enemy pile-in) become eligible. |
| CORE-10.6 | Strike-first: while any Strike-first unit that was in combat when step 2 began has not fought, no other unit may be picked. Players still alternate; a player whose turn it is to pick but who has no Strike-first unit passes that pick **[interp]**. After all such units have fought, the active player makes the next pick and alternation resumes from them. A unit that only came into combat later in the phase gets no benefit from Strike-first. |
| CORE-10.7 | Strike-last: a Strike-last unit may not be picked while any unit in combat without Strike-last has not yet fought. |
| CORE-10.8 | A unit with both Strike-first and Strike-last has neither. Abilities that let a unit "fight immediately after" another do not override Strike-first/last constraints. |
| CORE-10.9 | Note: charging does **not** grant Strike-first. |

## 11. Attack sequence

### 11.1 Targets and attack count

| Id | Rule |
|---|---|
| CORE-11.1 | Targets are picked when the Attack ability is declared. Each model makes attacks equal to each weapon's Attacks (random Attacks per CORE-2.8); by default a model attacks with every weapon of the right type (melee for combat, ranged for shooting) unless the warscroll restricts choice. Attacks may be split among eligible targets as the commander wishes. |
| CORE-11.2 | If the attacking unit is in combat it may only target units it is in combat with. |
| CORE-11.3 | Combat attacks: the target must be within the attacking model's combat range and visible to it; the model must attack with all of its melee weapons. |
| CORE-11.4 | Resolve all attacks against one target unit before the next target (attacker orders targets). After all attacks of the ability are resolved, run the damage sequence (CORE-13). |

### 11.2 One attack

| Id | Step | Rule |
|---|---|---|
| CORE-11.5 | 1. Hit | Attacker rolls D6 + capped modifiers (CORE-2.4). Success if ≥ weapon Hit. Unmodified 1 fails. An unmodified 6 on a *successful* hit is a **critical hit** **[interp: a 6 that still fails after modifiers is not a crit — the sequence has ended]**. On failure the attack ends. |
| CORE-11.6 | 2. Wound | Attacker rolls D6 + capped modifiers. Success if ≥ weapon Wound. Unmodified 1 fails. On failure the attack ends. (There is no critical wound in core.) |
| CORE-11.7 | 3. Save | Defender rolls D6, subtracts the weapon's (modified) Rend, adds capped save modifiers (CORE-2.5). Unmodified 1 fails. If the result ≥ the target's Save, the attack is stopped. Otherwise the attack is successful. **[interp]** a Save of "-" means no save roll is made. |
| CORE-11.8 | 4. Damage | A successful attack adds the weapon's Damage (random per attack) as damage points to the target unit's damage pool. |
| CORE-11.9 | Fast dice: attacks with identical Hit, Wound, Rend, Damage and weapon abilities against the same target may be rolled as a batch (all hits, then wounds, then saves). Engine: always batch identically; each die keeps its own outcome; random Damage is still per attack. Deterministic RNG consumption order: per target in pick order, per weapon profile in warscroll order, hits → wounds → saves → damage rolls. |

## 12. Weapon abilities (passive)

| Id | Ability | Rule |
|---|---|---|
| CORE-12.1 | Crit choice | If a weapon has more than one ability that triggers on a critical hit, the attacker picks one before the attack sequence (engine: per weapon per Attack ability **[interp]**). |
| CORE-12.2 | Anti-X (+1 Rend) | +1 Rend against a target with keyword X or meeting condition X (e.g. Anti-charge = target charged this turn; Anti-Hero, Anti-Monster, Anti-Infantry…). Multiple Anti abilities that apply are cumulative. |
| CORE-12.3 | Charge (+1 Damage) | +1 Damage if the attacking unit charged this turn. |
| CORE-12.4 | Companion | Unaffected by friendly abilities that change weapon characteristics or the attack sequence, except friendly negative modifiers (e.g. Covering Fire's −1 still applies) and abilities that say they affect Companion (All-out Attack does). Enemy abilities affect it normally. Typical use: mounts. |
| CORE-12.5 | Crit (2 Hits) | A critical hit scores 2 hits; roll a wound for each. |
| CORE-12.6 | Crit (Auto-wound) | A critical hit wounds automatically (skip the wound roll); save as normal. |
| CORE-12.7 | Crit (Mortal) | A critical hit inflicts mortal damage equal to the weapon's Damage on the target and the attack ends (no wound, no save). Ward still applies (CORE-13.2). |
| CORE-12.8 | Shoot in Combat | The weapon may be used for shooting attacks while the attacking unit is in combat (targets limited by CORE-11.2). |

## 13. Damage sequence

| Id | Rule |
|---|---|
| CORE-13.1 | After any ability that inflicted damage points finishes, run this per affected unit, one unit at a time. Each commander handles their own units, in an order of their choosing, starting with the active player. Steps: (1) ward saves, (2) allocate and remove slain models. |
| CORE-13.2 | Ward (passive, keyword Ward (N+)): for each damage point in the pool, roll D6; on ≥ N remove it from the pool. Applies to attack damage and mortal damage alike. If a unit has several ward values only the best (lowest) applies. |
| CORE-13.3 | Mortal damage: N mortal damage = add N damage points to the target's pool for that ability (no hit/wound/save). |
| CORE-13.4 | Allocation: allocate the pool one point at a time to the unit's running counter. Each time the counter equals the unit's Health characteristic, one model is slain and the counter resets to 0. Continue until the pool is empty. Damage therefore carries over between models. A non-zero counter persists between abilities; the unit is *damaged* while it is > 0. |
| CORE-13.5 | Slain models: the commander picks which model is removed, but after each removal the unit must be one coherent group; if not, keep removing models (fewest possible) until it is. Models removed for coherency are slain. |
| CORE-13.6 | Destroyed: when the last model is slain the unit is destroyed and remaining points in its pool are discarded. An effect that destroys a unit slays all its models. Engine emits `unitDestroyed` (used by battle tactics, Severed Connection, Reinforcements **[SH]**). |
| CORE-13.7 | Heal (N): remove up to N allocated damage points from the unit's counter (never below 0). Healing never returns slain models (that is CORE-6.14). |

## 14. Keywords and unit-type rules

| Id | Keyword | Rule |
|---|---|---|
| CORE-14.1 | HERO | Leads a regiment (CORE-19); may be the general; can Activate Place of Power (CORE-16.8). |
| CORE-14.2 | Guarded Hero (passive on every HERO that is neither MONSTER nor WAR MACHINE) | While within the combat range of a friendly non-HERO unit: shooting attacks targeting it are −1 to hit; and if it is also INFANTRY it cannot be targeted by shooting attacks from units more than 12" away. |
| CORE-14.3 | INFANTRY | Gates Guarded Hero's 12" clause and some abilities (e.g. Resurrection prayer). No other core rule. |
| CORE-14.4 | MONSTER | Excluded from Guarded Hero. No other core rule — AoS 4th core has **no** monster rampages. Typical Power Through user (needs higher Health than its target). |
| CORE-14.5 | WAR MACHINE | Excluded from Guarded Hero. No other core rule. |
| CORE-14.6 | CAVALRY, BEAST, others | Descriptive only in core; referenced by Anti-X and faction abilities. |
| CORE-14.7 | FLY | Fly movement (CORE-6.10); ignores Cover and Obscuring as a target (CORE-16.5/16.6). |
| CORE-14.8 | WARD (N+) | CORE-13.2. |
| CORE-14.9 | WIZARD (N) / PRIEST (N) | CORE-15. N = power level. |
| CORE-14.10 | CHAMPION (ratio) | Champion models get +1 Attacks on their weapons. No ratio = 1 champion; a ratio such as 1/10 = one per 10 models. |
| CORE-14.11 | MUSICIAN (ratio) | While the unit contains ≥1 musician, its Rally makes one extra rally roll (7 dice). |
| CORE-14.12 | STANDARD BEARER (ratio) | While the unit contains ≥1 standard bearer, +1 to its control score. |
| CORE-14.13 | UNIQUE | Max one per army; cannot be reinforced; cannot take enhancements. |
| CORE-14.14 | WARMASTER | If present, a Warmaster must be the general. |
| CORE-14.15 | Strike-first / Strike-last | Granted by abilities; CORE-10.6–10.8. |
| CORE-14.16 | REINFORCEMENTS | **[SH]** Spearhead keyword: a destroyed unit may return once as a replacement (CORE-6.16); see 11-spearhead. |
| CORE-14.17 | No hero leadership rule | AoS 4th core has no heroic actions, no leader-attachment and no leadership/bravery stat. "Leadership" in AoS 4 means regiment structure (CORE-19) and Guarded Hero only. |

Engine: data stores command-model counts per unit (`champions`, `musicians`, `standardBearers`); when such a model
is slain the bonus is lost once none remain. **[interp]** commander may choose to remove command models last.

## 15. Magic: wizards, priests, manifestations

| Id | Rule |
|---|---|
| CORE-15.1 | Wizards cast spells; Priests chant prayers. Both are abilities with the Spell / Prayer keyword, usable in the commander's hero phase (or via Magical Intervention). |
| CORE-15.2 | Power level N: a Wizard/Priest may use at most N abilities per phase from {Spell, Prayer, Banish} combined. |
| CORE-15.3 | Casting: Declare includes a 2D6 casting roll. If the result < the spell's casting value it fails (no reactions, no effect). |
| CORE-15.4 | Miscast: if the unmodified casting roll has two or more 1s, the spell fails, D3 mortal damage is inflicted on the caster, and that Wizard may use no more spells this phase. |
| CORE-15.5 | Only a casting roll ≥ casting value opens the enemy reaction window. If not unbound, the spell is cast and resolves. |
| CORE-15.6 | Unbind (reaction to an opponent's Spell): a friendly Wizard within 30" of the casting Wizard rolls 2D6; if the result is **strictly greater** than the casting roll the spell is unbound (no effect). At most one Unbind per casting roll. |
| CORE-15.7 | Each Wizard may Unbind up to N times per phase (exception to CORE-3.4); unbinds do not consume the Spell/Prayer/Banish budget. |
| CORE-15.8 | Chanting: Declare includes a D6 chanting roll. Unmodified 1: the prayer fails and the Priest loses D3 ritual points (floor 0). Unmodified 2+: the commander chooses either (a) bank — the Priest gains ritual points equal to the chanting roll (**[interp]** the modified roll, min 1) and the prayer is not answered; or (b) spend — add the Priest's ritual points to the roll; if the total ≥ the chanting value the prayer is answered, resolves, and ritual points reset to 0. **[interp]** if (b) falls short, the prayer fails and ritual points are kept. Ritual points persist across turns. Prayers cannot be unbound. |
| CORE-15.9 | Jealous mages / fickle gods: each spell may be cast by at most one friendly Wizard per turn, and each prayer chanted by at most one friendly Priest per turn, unless it has the Unlimited keyword. Rule of One still limits a unit to once per phase. **[interp]** "used" counts any attempt (failed, miscast or unbound included). |
| CORE-15.10 | Known spells/prayers: those on the warscroll plus the chosen spell, prayer and manifestation lores (CORE-19.6). **[SH]** |
| CORE-15.11 | Manifestations (endless spells from Wizards, invocations from Priests) have their own warscrolls. Only one friendly Wizard/Priest may attempt to summon a given manifestation per turn, and a manifestation removed this turn cannot be re-summoned this turn. They are not units, except: treated as units for movement, combat range, being in combat and setting up other units; can Fight/Shoot if they have weapons; can use Core Move abilities if Move > 0; can be targeted by enemy abilities that pick targets (unaffected by untargeted enemy abilities); take damage and can be destroyed. Move 0 manifestations cannot move and count as units for the movement/combat-range/setting-up purposes only in the combat phase; enemy units may end a charge within ½" of them instead of an enemy unit. Models may move through manifestations but not end on them. Enemy units may end a charge within ½" of any enemy manifestation. |
| CORE-15.12 | Severed connection: if the summoner is slain, its manifestation is removed. |
| CORE-15.13 | Banish Manifestation (Your Hero Phase, keyword Banish, any Wizard or Priest): target a manifestation within 30"; roll 2D6, +1 per additional enemy manifestation on the battlefield beyond the first; on ≥ the manifestation's banishment value it is removed. The same manifestation can be targeted at most once per turn. Consumes power-level budget. |

## 16. Terrain

| Id | Rule |
|---|---|
| CORE-16.1 | Size classes: small fits within 7"×7"; medium fits within 7"×12" (and is not small); large otherwise. A terrain feature may be several scenery pieces that together fit its size footprint and count as one feature. |
| CORE-16.2 | Types → abilities: Obstacle = Cover, Unstable. Obscuring Terrain = Cover, Obscuring, Unstable. Area Terrain = Cover. Place of Power = Cover, Place of Power, Unstable. Faction Terrain = per its warscroll. Players agree each feature's type before the battle (engine: data). Impassable is an ability some features carry. **[SH]** |
| CORE-16.3 | Wholly on: a model's base is on the feature and doesn't overhang its edge; a unit is wholly on if every model is. |
| CORE-16.4 | Behind: when a unit is targeted by an attack, it is behind a feature if every straight line from any attacking model to any target model crosses that feature. Ignore the parts of the feature inside the attacking unit's combat range. Evaluated per (attacking unit, target unit) at targeting. |
| CORE-16.5 | Cover: −1 to hit for attacks (shooting **and** combat) targeting a unit that is behind or wholly on the feature, unless the target charged this turn or has Fly. Rule of One: only −1 regardless of sources. |
| CORE-16.6 | Obscuring: a unit behind or wholly on the feature cannot be targeted by shooting attacks unless it has Fly. **[SH]** check 11-spearhead for any observer-Fly wording. |
| CORE-16.7 | Impassable: models cannot move across, be set up on or end a move on any part. Unstable: models may cross it but cannot be set up on or end any move on any part more than 1" tall. |
| CORE-16.8 | Activate Place of Power (Core, Start of Any Turn): a friendly Hero within 3" of a Place of Power rolls D6. On 1: D3 mortal damage to it. On 2+: a Wizard/Priest gets +1 to casting/chanting rolls this turn; any other Hero may use Unbind and Banish Manifestation this turn as if it were Wizard (1). |
| CORE-16.9 | Faction terrain: not a unit except — treated as a unit in the combat phase for movement, combat range and being in combat (charges may end within ½" of an enemy one); targetable by enemy targeted abilities (immune to untargeted ones); takes damage and can be destroyed; may Fight/Shoot if it has weapons; Move 0 = cannot move (incl. pile-in). Units placed on a faction terrain feature measure range/visibility from the feature and cannot Fight unless stated; if removed, they lose any on-feature role. |

## 17. Objectives, control and victory points

| Id | Rule |
|---|---|
| CORE-17.1 | Objective markers are 40 mm round (radius ≈ 0.787") unless stated; models may cross and end on them; they never block visibility. |
| CORE-17.2 | Contesting (core): a model contests an objective if the marker is within its combat range (`h ≤ 3` from base edge to marker edge; no visibility needed). A unit contests if any of its models does. **[SH]** Spearhead: a model contests only if its base is (partly) on the printed objective circle. |
| CORE-17.3 | For control purposes a unit contests at most one objective: before control is determined, the active player assigns each of their multi-contesting units to one objective, then the opponent does. For all other rules a unit may contest several. |
| CORE-17.4 | Control check (start of round 1 and end of every turn), per objective in an order the active player picks: (1) starting with the active player, each player computes each contesting unit's control score = Σ Control of its contesting models, after modifiers, minimum 1; (2) army control score = Σ over that player's contesting units; (3) higher army score gains control. A tie or 0–0 changes nothing. |
| CORE-17.5 | Control is sticky: an objective stays with its controller until the opponent gains it. |
| CORE-17.6 | Terrain control: same procedure, but not sticky — a feature is controlled only while friendly units win the comparison (uncontested = uncontrolled). Each unit may contest one objective and one terrain feature simultaneously. |
| CORE-17.7 | Victory points are scored by the active player at end-of-turn step 3 per the battleplan. **[SH]** scoring, battle length and tie-breaks are in 11-spearhead. |

## 18. Battle tactics

| Id | Rule |
|---|---|
| CORE-18.1 | Completing the battle tactic you are attempting this turn by the end of your turn scores 4 VP. **[SH]** Spearhead replaces the universal tactics with its own deck/cards. |
| CORE-18.2 | Tactical Gambit (Once Per Battle Round, Start of Your Turn): pick one battle tactic you have not yet attempted to attempt this turn. Not usable if you took the second turn last round and chose to take the first turn this round (the double-turn tax). |
| CORE-18.3 | Universal tactics (matched play; summary): *Do Not Waver* — 2+ friendly units fought this turn and none of yours were destroyed. *Slay the Entourage* — pick a unit in the enemy general's regiment; it is destroyed this turn. *Attack on Two Fronts* — you gained control of 2+ objectives this turn, ≥1 of which the opponent controlled at turn start. *Take Their Land* — pick a terrain feature at least partly in enemy territory and wholly outside yours; control it at end of turn. *Seize the Centre* — 2+ friendly units within 3" of the battlefield centre and not in combat. *Take the Flanks* — ≥1 friendly unit within 6" of each short edge, none wholly within friendly territory, none set up this turn. |

## 19. Army composition (summary; mostly not used by Spearhead)

| Id | Rule |
|---|---|
| CORE-19.1 | Army = faction (+ optional battle formation) + 1–5 regiments + optional auxiliaries + optional 1 faction terrain feature. No single unit may exceed half the points limit. |
| CORE-19.2 | Regiment = 1 Hero + 0–3 non-Hero units from its options; the general's regiment allows 0–4. One general must be picked from the regiment leaders (a Warmaster if any). Reinforced unit = double minimum size and cost (not for size-1 or Unique units). At most 1 Regiment of Renown (its units cannot be general and cannot use the host faction's rules without a matching keyword). |
| CORE-19.3 | Extra CP: an army ≥50 points under the limit gets +1 CP at the start of round 1; the player with fewer auxiliary units gets +1 CP every round (equal = none). |
| CORE-19.4 | Enhancements: at most one per enhancement table; one per type per unit; no duplicates; not on Unique units. |
| CORE-19.5 | Regiment matters at deployment (Deploy Regiment) and for Slay the Entourage. |
| CORE-19.6 | Lores: up to 1 spell lore (all Wizards know it), 1 prayer lore (all Priests), 1 manifestation lore (all Wizards and Priests). |
| CORE-19.7 | **[SH]** Spearhead armies are fixed; 11-spearhead defines general, enhancements and regiment abilities. |

## 20. Delta vs Mallet 42k

Per area of `docs/history/42k-spec/10-rules-core.md`: **keep** (same engine logic), **change** (same slot, new
logic), **drop** (delete), **new** (no 40k counterpart).

| 42k area | Verdict | AoS 4 behaviour |
|---|---|---|
| 0. Vocabulary | change | Engagement Range → combat range; wounds → damage points/Health; Ld/OC/T gone; Save + Rend + Ward; DZ/NML → territories/neutral territory. |
| 1. Battle structure | change | 4 rounds **[SH]** not 5; 7 phases incl. Start of Turn, Hero and End of Turn; turn order re-decided each round by priority roll (round 1: first-to-finish-deploying chooses) → double turns possible; underdog each round. Reactions alternate starting with the **active** player (42k: defender first in targeted windows). Modifier caps: hit/wound ±1 (kept), save +1 max with no floor. |
| 2. Measurement, ER, coherency | change | Combat range 3" horizontal, unlimited vertical, **and requires visibility** (42k ER 1"/5" no LoS). Coherency ½" horizontal (42k 2"/5"); 7+ models still need 2 neighbours. |
| 3.1 Line of sight | keep | True LoS from any point to any point; own-unit models don't block; other models do. |
| 3.2 Terrain categories | change | Ruins/woods/craters replaced by Obstacle / Obscuring / Area / Place of Power / Faction + abilities Cover, Obscuring, Impassable, Unstable, Place of Power; ≤1" terrain ignored; climbing/jump-down movement. |
| 3.3 Benefit of Cover | change | −1 to hit (not +1 save), applies to combat attacks too, negated if target charged or has Fly; target "behind" uses all-lines-cross test ignoring parts in attacker's combat range. |
| 4. Command phase | change | No Command phase: CP 4 per round (+1 underdog), reset at round end; Hero phase hosts spells/prayers/Rally. **No Battle-shock, no Leadership tests** (drop). |
| 5.1 Move units | change | Normal Move / Run (D6, At the Double = +6") / Retreat (D3 mortal to self, no Desperate Escape tests). Normal/Run may not enter combat (visible-enemy combat range); Fly ignores models/terrain/combat ranges. Run/Retreat forbid Shoot and Charge (no Assault exception). |
| 5.2 Reinforcements / Reserves | change | No Deep Strike/Strategic Reserves core rules; reserve units from Deploy abilities die at start of round 4; set-up-this-turn units can't use Move abilities. Spearhead Reinforcements keyword = once-per-unit replacement **[SH]** (new). |
| 5.3 Transports | drop | No transports in AoS core. |
| 5.4 Aircraft | drop | No aircraft rules; Fly keyword covers flyers. |
| 6.1 Shooting sequence | change | Shoot forbidden after Run/Retreat; units in combat can't shoot except Shoot in Combat weapons (no Pistol/Big Guns Never Tire); **may shoot into enemies that are in combat**; Guarded Hero targeting limits. |
| 6.2 Attack sequence | change | Fixed Hit and Wound characteristics (no S vs T table); Rend replaces AP; no invulnerable save; Ward is a separate per-damage-point step after all attacks. Crits only on hit rolls. |
| 6.3 Mortal wounds | change | Mortal damage just enters the damage pool; ward applies; whole-pool allocation means **all damage spills over between models** (42k normal damage doesn't). |
| 6.4 Modifier bookkeeping | change | Hit/wound ±1 cap (same); save +1 cap, unlimited minus; characteristic floor 1 (Rend floor 0); set → multiply → add order; Order of Effects for ties. |
| 7. Weapon abilities | change | Kept-in-spirit: Sustained Hits 1 → Crit (2 Hits); Lethal Hits → Crit (Auto-wound); Devastating Wounds → Crit (Mortal) (triggers on hit crit and ends the sequence); Anti-X → +1 Rend (not crit-wound threshold); Lance → Charge (+1 Damage); Pistol → Shoot in Combat. New: Companion. Drop: Assault, Rapid Fire, Heavy, Blast, Torrent, Melta, Twin-linked, Precision, Hazardous, Ignores Cover, Indirect Fire, Extra Attacks. |
| 8. Charge phase | change | 2D6 kept; no declared targets; may pass through combat ranges; must end within ½" of any visible enemy; Forward to Victory re-roll; Counter-charge in enemy charge phase. No Overwatch-on-charge. |
| 9. Fight phase | change | Strike-first (≈Fights First) and new Strike-last; **chargers get no automatic fight-first**; alternation starts with the **active** player (42k: non-active); pile-in 3" toward a chosen target only at Fight declare; **no consolidate** (Power Through is the closest analogue). |
| 10. Unit-level core abilities | change | Feel No Pain → Ward (best only, also vs mortals). Fights First → Strike-first. Leader/attached units → drop (Guarded Hero instead). Lone Operative → Guarded Hero Infantry 12". Drop: Deadly Demise, Deep Strike, Infiltrators, Scouts, Stealth, Firing Deck. New: Fly, Champion/Musician/Standard Bearer, Wizard/Priest. |
| 11. Stratagems | change | Become commands (CORE-5): each unit 1 command/phase, each command once/army/phase. Fire Overwatch → Covering Fire (enemy shooting phase, closest target, −1 hit; no shooting during enemy moves/charges). Heroic Intervention → Counter-charge (2 CP). Tank Shock → Power Through. Go to Ground/Smokescreen → All-out Defence. New: All-out Attack, Rally, Redeploy, At the Double, Forward to Victory, Magical Intervention. Drop: Command Re-roll, Counter-offensive, Epic Challenge, Grenade, Insane Bravery, Rapid Ingress. |
| 12. Objectives, control, victory | change | Control characteristic summed per unit (min 1 per contesting unit), no Battle-shock zeroing; contest range = combat range in core (**[SH]** on the marker); each unit contests one objective for control; control checked at start of round 1 and end of each turn (not end of each phase); control is sticky by default; terrain control non-sticky. VP per battleplan + battle tactics (4 VP, Tactical Gambit double-turn restriction). |
| 13. Pre-battle sequence | change | Territory roll-off (loser picks who deploys first); faction terrain first; alternate Deploy Unit/Regiment (wholly in territory, >9" from enemy territory); no Scouts/Infiltrators moves; first turn chosen by first-to-finish deploying. **[SH]** overrides. |
| — Magic | new | CORE-15 (casting, miscast, unbind, prayers/ritual points, manifestations, banish). |
| — Healing / returning models | new | Heal (N), Rally, returned models (CORE-6.14, 13.7). |
| — Double turns / underdog | new | CORE-4.9–4.11, 18.2. |
