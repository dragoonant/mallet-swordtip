# 11 — Spearhead game mode (engine + data spec)

Own-words spec of the Age of Sigmar 4th edition **Spearhead** battlepack. Rule ids `SPH-<section>.<n>`
are stable and are cited by tests; card ids are `card.twist.<slug>` / `card.tactic.<slug>`.
Mechanics and numbers are ported 1:1; no sentence here is source text.

Sources (local, gitignored, never committed):

| Source | Pages used | What it holds |
|---|---|---|
| `docs/sources/aos4-core-rules.pdf` | 45–59 (Spearhead), 13–14, 27–28 (core 12.0, 24.2, 32.x), 30–32 (Advanced Rules, for what Spearhead drops) | Spearhead battlepack, the **Fire and Jade** realm battlefield + battleplan |
| `docs/sources/spearhead-city-of-ash-gaming-pack.pdf` | 1–8 | **Only two Spearhead armies** (Sentinels of Embergard, Crixxit's Kill-Pack). It has **no** twist cards, battle tactic cards, battleplan, terrain or objective layout — see §15 |

Coordinates follow 00-architecture §7 (Y up, board plane XZ): **x along the long edge, z along the short
edge, origin at the board centre, 1 unit = 1 inch.**

---

## 1. Battlefield

| ID | Rule |
|---|---|
| SPH-1.1 | Every Spearhead battle is played on a **realm battlefield** of **30" × 22"**: x ∈ [−15, 15], z ∈ [−11, 11]. Long edges are z = ±11, short edges x = ±15. |
| SPH-1.2 | A realm battlefield has **two sides**, each themed on one Mortal Realm, with its own printed objective layout and its own twist deck (§3). The side is chosen pre-battle (SPH-4.3). |
| SPH-1.3 | Each realm battlefield ships with one **battleplan** (deployment maps, battle length, scoring, special rules) and one **Spearhead deck** (§3). Data: one `RealmBattlefield` record (§16.1). |
| SPH-1.4 | The battlefield is split into **two territories** by the chosen deployment map. "Friendly territory" = the territory assigned to that player. A point exactly on the dividing line belongs to both territories and is wholly within neither (core 32.0 border rule, applied to any area). |

## 2. Spearhead armies (army composition)

| ID | Rule |
|---|---|
| SPH-2.1 | Each player fields one **Spearhead army**: a fixed list of units with a named **general**. Composition cannot be changed (no points, no options beyond what the army sheet states). Data: `SpearheadArmy` (§16.4). |
| SPH-2.2 | Every army has one or more **battle traits**: always in effect / always available. |
| SPH-2.3 | Every army offers exactly **2 regiment abilities**; the player picks **1** for the battle (SPH-4.2). The other is unavailable for the whole battle. |
| SPH-2.4 | Every army offers exactly **4 enhancements**; the player gives **1** to their **general** (SPH-4.2). Enhancements only ever apply to the general. |
| SPH-2.5 | Units use **Spearhead warscrolls** (from the army sheet), never matched-play warscrolls. |
| SPH-2.6 | Some units carry the **Reinforcements** keyword (§12). |
| SPH-2.7 | **Tokens.** Army sheets may give units tokens (e.g. Kill-Pack: each Gutter Runners unit starts with 1 *Bomb Rat* token; Sentinels: the general starts holding the *Thexa* token, which can pass to enemy units). A token is not a model: it has no base, cannot be targeted and does not contest. State: `unit.tokens: Record<TokenId, number>`; events `TokenGiven`, `TokenRemoved`. Rules for each token live in the faction spec. |

## 3. The Spearhead deck

| ID | Rule |
|---|---|
| SPH-3.1 | A Spearhead deck = **2 twist decks** (one per battlefield side) + **2 battle tactic decks** (one per player; both decks have the same card list). Deck sizes are not stated in the core rules (the number is a missing glyph in the PDF); they come from the realm battlefield's card list. |
| SPH-3.2 | **Twist card**: a special rule that applies to the battle round in which it is drawn (unless the card says it lasts longer, e.g. "until the end of the battle"). Only the twist deck matching the chosen side is used; the other is set aside unused. |
| SPH-3.3 | **Battle tactic card**: two halves, a **battle tactic** (a condition scored at the end of your turn for VP) and a **command** (an ability with its own timing and effect). A card is used for **one** half only, never both. |
| SPH-3.4 | Using a card's command: the command states when it can be used (a phase timing or a **Reaction** trigger) and its effect. After the effect resolves the card is **discarded**. Commands cost nothing (there are no command points, SPH-13.1). The same unit may receive **any number** of commands in the same phase (overrides the Advanced Rules 1-command-per-unit-per-phase limit). |
| SPH-3.5 | Hands are **secret** from the opponent (client hides the AI's/other player's hand in hotseat; the engine stores it per player and redacts it in any opponent-facing view). Discards are **face up** (public). |
| SPH-3.6 | Decks are shuffled with the seeded RNG at setup (`rng.shuffle`), so draws are deterministic per seed and replayable. |

## 4. Pre-battle sequence

Runs once in `createGame` → the first `pending` decisions, in this order:

| ID | Step |
|---|---|
| SPH-4.1 | **Roll-off.** Winner decides who is the **attacker** and who is the **defender**. Decision: `chooseAttacker`. |
| SPH-4.2 | **Army options.** The attacker picks 1 regiment ability (SPH-2.3) and 1 enhancement (SPH-2.4); then the defender does the same. Decision: `chooseRegimentAndEnhancement` (one per player, attacker first). The opponent sees both choices (army rosters are open information). |
| SPH-4.3 | **Battlefield side.** The defender picks which side of the realm battlefield is used (Fire and Jade: `aqshy` or `ghyran`). Decision: `chooseBattlefieldSide`. This fixes the objective layout and the twist deck. |
| SPH-4.4 | **Deployment map + territories.** The defender picks one of the battleplan's deployment maps and decides which territory (A or B) is theirs. Decision: `chooseDeploymentMap { mapId, defenderTerritory }`. |
| SPH-4.5 | **Terrain.** The defender sets up their terrain features, then the attacker sets up theirs (§5). |
| SPH-4.6 | **Decks.** The twist deck for the chosen side is shuffled and placed; each player shuffles one battle tactic deck. |
| SPH-4.7 | **Deployment** (§7), then battle round 1 (§8). Objective control is checked at the start of round 1 (core 32.2). |

## 5. Terrain

| ID | Rule |
|---|---|
| SPH-5.1 | Every battle uses exactly **4 terrain features**: each player sets up **1 large** and **1 small**, defender first (SPH-4.5). Neither player may skip. |
| SPH-5.2 | Placement constraints, each feature: **wholly within** its owner's territory; **more than 6"** from every other terrain feature; **more than 3"** from **both long edges**; **more than 3"** from **enemy territory**; **no overlap at all** (wholly or partly) with any objective circle. The engine rejects an illegal placement (`Rejection: terrainPlacement`). |
| SPH-5.3 | **Large terrain feature** passives: Cover, Obscuring, Unstable. **Small terrain feature** passives: Cover, Unstable. |
| SPH-5.4 | **Cover**: −1 to hit rolls for attacks that target a unit **behind** or **wholly on** this feature, unless the target **charged this turn** or has **Fly**. |
| SPH-5.5 | **Obscuring**: a unit **behind** or **wholly on** this feature cannot be targeted by **shooting** attacks, unless it has **Fly**. |
| SPH-5.6 | **Unstable**: models may move across the feature but may not be set up on, or end any move on, any part of it taller than 1". |
| SPH-5.7 | **Behind** (definition ported from the Terrain rules 1.1, which the Spearhead glossary cites): the target is behind a feature if **no** straight line from **any** attacking model to **any** target model avoids crossing the feature. Parts of the feature inside the **attacker's combat range** (3") are ignored for this test. **Wholly on**: every model's base is on the feature with no part overhanging its edge. |
| SPH-5.8 | Movement over terrain uses the core rules (climb anything > 1" tall, 1" or lower is crossed freely, jump-down rules) — unchanged in Spearhead. |
| SPH-5.9 | Terrain features can be contested/controlled for abilities that reference them (core 32.3): controlled like objectives but control is lost as soon as no friendly unit contests it; a unit can contest 1 objective and 1 terrain feature at once. Contest test for terrain: see issue in §18 (default: a model contests a terrain feature it is wholly or partly on, or that lies within its combat range — core 32.1 analogue). |

Feature footprints are **not in the sources**. Our defaults until real dimensions are confirmed (data, so easy to change):

| Kind | Fire and Jade name | Default footprint (x × z) | Height (tallest part) | Traits |
|---|---|---|---|---|
| `large` | Ruined Domicile | 5" × 3" rectangle, ruin walls on two sides | 4" | cover, obscuring, unstable |
| `small` | Ravaged Shrine | 3" × 2" rectangle | 2" | cover, unstable |

## 6. Objectives

| ID | Rule |
|---|---|
| SPH-6.1 | Objectives are **printed circles** on the realm battlefield; the whole circle is the objective (not just the emblem). Fixed per side (§14/§15); they never move. They don't block visibility and models may stand on them. |
| SPH-6.2 | **Contesting (Spearhead override of core 32.1):** a model contests an objective while **any part of its base overlaps the circle** (wholly or partly on it). Combat range plays no part. A unit contests if any of its models does. |
| SPH-6.3 | **Control** follows core 32.2 unchanged: per objective, each player sums the Control characteristic of their models contesting it (a unit's score can be modified but never drops below 1); higher total gains control; once gained, control **persists** until the opponent gains it (even with nobody on it). Tie = no change. A unit on 2+ objectives contests only one for control: the active player assigns theirs first, then the opponent. |
| SPH-6.4 | Control is evaluated at the **start of battle round 1** and at the **end of every turn** (after end-of-turn abilities, before scoring — SPH-8.6). |
| SPH-6.5 | Objectives have names (Fire and Jade: the five godbeasts). Twists and tactics may refer to objectives by name or by territory. An objective straddling the territory line is in both territories and wholly within neither. |

## 7. Deployment

| ID | Rule |
|---|---|
| SPH-7.1 | Core alternating deployment is **not** used. The **attacker sets up their whole army first**, then the defender sets up their whole army. |
| SPH-7.2 | Every unit must be set up **wholly within friendly territory** and **more than 6" from enemy territory**. Unit coherency rules apply as in core. |
| SPH-7.3 | Abilities that deploy units elsewhere (e.g. into reserve, core 24.1) still apply. At the **start of battle round 4** (the last round) a unit that was set up in reserve **using a Deploy ability** and is still in reserve is destroyed (core 24.1). A unit held back by a battle trait ("not set up during the deployment phase", which is how every shipped Spearhead reserve works: Ironjawz, Nurgle, Ossiarch, Seraphon, Soulblight, Tzeentch, Ogors) is never destroyed for being in reserve. The engine records how each unit went into reserve (`Unit.reserveVia`: the ability, and whether its descriptor has the `DEPLOY` keyword; patrol data `reserve.via`). |
| SPH-7.4 | The attacker is the player who "finished setting up first" for any rule that keys off that. |

## 8. Battle rounds

| ID | Rule |
|---|---|
| SPH-8.1 | The battle lasts **4 battle rounds**; each round has 2 turns (one per player); each turn has the core phases. |
| SPH-8.2 | **Start of battle round sequence** (in order): ① decide first turn (SPH-8.3); ② determine the **underdog** (SPH-8.4); ③ draw and resolve the **twist** (§9); ④ players **draw battle tactics** (§10); ⑤ Start of Battle Round abilities (active player first, then opponent). |
| SPH-8.3 | **First turn.** Round 1: the **attacker** chooses who takes the first turn (overrides core 12.0). Rounds 2–4: **priority roll** (roll-off); the winner chooses who goes first; on a tie, whoever went first last round chooses. |
| SPH-8.4 | **Underdog**: the player with **fewer VP** at that moment is the underdog for the whole round. Tied VP (always in round 1) → no underdog. Store `round.underdog: PlayerId \| null`. |
| SPH-8.5 | **Seizing the initiative**: the player who went **second** last round wins the priority roll and chooses to go **first**. Flag `round.seized = player`. Consequence in SPH-10.4. A double turn caused by the previous-first player choosing to go second is *not* a seize. |
| SPH-8.6 | **End of turn** (core order): ① End of Turn abilities (active player first, then opponent); ② determine objective control (SPH-6.3); ③ the **active player** scores VP (§11). Twist effects timed "after VP are scored" run as step ④. Windows: `turn.end.abilities`, `turn.end.control`, `turn.end.scoring`, `turn.end.afterScoring`. |
| SPH-8.7 | **End of battle round**: End of Battle Round abilities (active player first); then twist effects that last "this battle round" expire. After round 4 the battle ends (§11). |

## 9. Twist cards

| ID | Rule |
|---|---|
| SPH-9.1 | At step ③ of every round's start sequence, **one** twist card is drawn from the side's twist deck and revealed to both players. Its rules take effect **immediately**. |
| SPH-9.2 | A twist lasts for the **current battle round** unless the card states a longer duration. Only one twist is "current" at a time; a longer-lasting effect from an earlier twist keeps running as a persisting effect on its targets. |
| SPH-9.3 | Twists that make a player choose usually give the choice to the **underdog**; if there is none, the players **roll off** and the winner chooses. Engine: a twist effect declares `picker: 'underdog' | 'rollOffWinner' | 'underdogElseRollOff' | 'both'` and raises the matching decision. |
| SPH-9.4 | Twist state: `twist.current: CardId`, `twist.drawn: CardId[]` (public), `twist.deck: CardId[]` (hidden order). Event `TwistDrawn { cardId, round }`. If the deck is empty (should not happen in 4 rounds), no twist is drawn. |

## 10. Battle tactic cards

| ID | Rule |
|---|---|
| SPH-10.1 | **Round 1**: each player draws **3** battle tactic cards. |
| SPH-10.2 | **Rounds 2–4**: each player may first **discard any number** of cards from hand (face up), then **draws until holding 3**. Decision `discardTactics { cardIds[] }`, asked of the player taking the first turn, then the other (source gives no order; hands are hidden so it is cosmetic). |
| SPH-10.3 | Holding/scoring: a tactic is checked at the **end of its owner's turn** (SPH-8.6 step ③). The owner chooses which held tactics whose condition is met to score; each scored tactic = **1 VP** and the card leaves the hand (to the scored pile, public). Tactics are never scored in the opponent's turn. |
| SPH-10.4 | **Seize penalty**: a player who seized the initiative this round (SPH-8.5) **does not draw** battle tactics this round — unless they are the underdog **and** trail by **5 or more VP**. (They may still discard; see §18.) |
| SPH-10.5 | Using a **command** (SPH-3.4) discards the card; it can no longer be scored. Commands with a **Reaction** timing are offered as a decision when their trigger occurs (e.g. "opponent declared an Attack ability"), reusing the existing reaction window plumbing (00-architecture §4). |
| SPH-10.6 | If a tactic deck runs out, the player simply stops drawing. |
| SPH-10.7 | State per player: `tactics.deck` (hidden), `tactics.hand` (hidden from opponent), `tactics.discard`, `tactics.scored`. Events: `TacticsDrawn {player, count}` (count only, card ids redacted for the opponent), `TacticDiscarded`, `TacticScored {cardId, vp}`, `TacticCommandUsed {cardId, unitId?}`. |

## 11. Victory points and victory

| ID | Rule |
|---|---|
| SPH-11.1 | At the end of **each of their own turns** (SPH-8.6 ③) the active player scores: **+1** if they control ≥ 1 objective; **+1** if they control ≥ 2 objectives; **+1** if they control **more** objectives than the opponent; **+1 per battle tactic** completed this turn. Max 3 VP from objectives per turn. |
| SPH-11.2 | Only the active player scores at the end of a turn; the opponent's control does not score for them then. |
| SPH-11.3 | After round 4 ends, the player with **more VP wins**; equal VP = **draw**. No tiebreakers, no early end (a tabled player keeps taking empty turns; the opponent keeps scoring). |
| SPH-11.4 | Scoring rule ids for the data: `sph.vp.holdOne`, `sph.vp.holdTwo`, `sph.vp.holdMore`, `sph.vp.tactic`. |

## 12. Reinforcements

| ID | Rule |
|---|---|
| SPH-12.1 | A player with any **Reinforcements** unit can use **Call for Reinforcements**: Core ability, **once per turn**, in **their movement phase**. |
| SPH-12.2 | Declare: pick a friendly Reinforcements unit that has been **destroyed**. Effect: set up an **identical replacement unit** (core 24.2: same warscroll, same weapons, same model count as the original's starting size) **wholly within friendly territory**, **wholly within 6" of the battlefield edge** (any edge) and **not in combat**. |
| SPH-12.3 | Each Reinforcements unit can be replaced **once**; a replacement unit can never be replaced. The replacement is a **new unit** (core 24.2): no keywords, abilities, tokens or persisting effects gained by the original carry over, and once-per-battle abilities of that unit are available again. Store `unit.replacementOf?: UnitId`, `unit.replaced: boolean`. |
| SPH-12.4 | A replacement unit set up in the movement phase is a normal unit afterwards (it may shoot, charge etc. that turn unless an ability says otherwise). Note for the AI: VP from destroying it is nothing special — Spearhead has no kill points. |

## 13. Spearhead changes to the core rules

| ID | Rule |
|---|---|
| SPH-13.1 | **Advanced Rules are not used.** Consequently: **no command points**, and none of the Advanced Rules commands (All-out Attack, All-out Defence, At the Double, Redeploy, etc.) exist. The **only commands** are the command halves of battle tactic cards (SPH-3.4). |
| SPH-13.2 | **No Magic module**: no unbinding rolls, no miscasts, no manifestations, no "Banish". Spells and prayers on Spearhead warscrolls resolve like any other ability: make the casting/chanting roll the ability states and apply its effect on success. |
| SPH-13.3 | **Terrain**: only the Spearhead terrain rules of §5 apply (no faction terrain, no Places of Power, no other terrain abilities). |
| SPH-13.4 | **Objectives**: contested by being on them (SPH-6.2), not by combat range. |
| SPH-13.5 | **Deployment and first turn**: §7 and SPH-8.3 replace core 10.0 / 12.0 step 1 for round 1. |
| SPH-13.6 | Unchanged core: unit coherency, combat range 3", the 7 turn phases, attack sequence, ward, Guarded Hero (core 25.0), reserve destruction at the start of round 4 (core 24.1), Retreat mortal damage, Fight sequencing. |
| SPH-13.7 | Spearhead warscrolls cannot be used in other modes and other warscrolls cannot be used in Spearhead (data validation: a Spearhead army may only reference datasheets flagged `spearhead: true`). |

## 14. Realm battlefield: Fire and Jade (core rules pp. 55–56)

This is the only realm battlefield whose battleplan is in our sources; it is fully playable and is the
**default** until City of Ash data exists (§15). Id `rbf.fire-and-jade`, battleplan `bp.fire-and-jade`.

### 14.1 Battleplan

| ID | Rule |
|---|---|
| SPH-14.1 | Pre-battle sequence = §4 exactly; sides `aqshy` (Realm of Fire) and `ghyran` (Realm of Life). |
| SPH-14.2 | Deployment = §7; battle length 4 rounds; scoring = §11; victory = SPH-11.3. |
| SPH-14.3 | Deck preparation: the twist deck matching the chosen side (`twist.aqshy` or `twist.ghyran`) is used; each player gets one Fire and Jade battle tactic deck. |
| SPH-14.4 | **Card lists are not in the sources.** The core book only shows the decks face down with a few cropped fragments (not enough to port a single card). Card ids/effects must come from the Fire and Jade deck or Wahapedia (`wahapedia.ru/aos4/...` via the browser) in a later data stage. |

### 14.2 Deployment maps (both sides use the same two maps)

| Map id | Dividing line | Territory A | Deploy zone (more than 6" from enemy territory) | Terrain band (more than 3" from enemy territory and long edges) |
|---|---|---|---|---|
| `map.horizontal` | z = 0 (parallel to the long edges) | z < 0 | A: z < −6 (a 30" × 5" strip); B: z > 6 | A: −8 < z < −3; B: 3 < z < 8 |
| `map.diagonal` | the board diagonal from (−15, +11) to (+15, −11): 11x + 15z = 0 | 11x + 15z < 0 (the −x/−z corner side) | A: 11x + 15z < −111.6 (i.e. distance to the line > 6"; √(11²+15²) = 18.60); B: 11x + 15z > 111.6 | A: 11x + 15z < −55.8 and −8 < z; B mirrored |

"Wholly within" tests use every point of every base (00-architecture §7). Territory B is everything not in A
(the line itself is in both).

### 14.3 Objectives (printed circles; measured from the map art in the core book, ±0.5")

Diameter ≈ **6"** (radius 3") on both sides, measured, not stated — flagged in §18. Data field `radius: 3`.

**Aqshy side** (layout is 180° point-symmetric):

| Objective id | Godbeast | x | z | Territory (horizontal map) |
|---|---|---|---|---|
| `obj.dracothion` | Dracothion | 0 | 0 | both (on the line) |
| `obj.vulcatrix` | Vulcatrix | −11 | −7 | A |
| `obj.ignax` | Ignax | 10 | −7 | A |
| `obj.behemat` | Behemat | −10 | 7 | B |
| `obj.nagendra` | Nagendra | 11 | 7 | B |

**Ghyran side**: the current, measured positions are in `docs/spec/15-fire-and-jade-ghyran.md` §15.3 (the data in
`src/data/missions/sph-fire-and-jade-ghyran-*.json` follows that file). The low-confidence table that used to sit here is retired;
15.3 is the only source for the Ghyran objectives.

Godbeast-to-position mapping is read from the emblems on the map art (centre = Dracothion is confirmed by
the book's battle walkthrough; the rest by emblem shape).

### 14.4 Default terrain layout (ours, for quick start and AI; satisfies SPH-5.2 with the §5 default footprints)

Aqshy side, `map.horizontal`, Territory A = defender. Centres, axis-aligned (rot 0):

| Piece | Owner | Kind | Centre (x, z) | Footprint |
|---|---|---|---|---|
| `tf.a-large` | A | large | (−5.25, −5.5) | 5 × 3 |
| `tf.a-small` | A | small | (5, −4.5) | 3 × 2 |
| `tf.b-large` | B | large | (5.25, 5.5) | 5 × 3 |
| `tf.b-small` | B | small | (−5, 4.5) | 3 × 2 |

Checks: nearest terrain-to-terrain gap 6.25" (> 6); every piece spans 3.5 ≤ |z| ≤ 7, so it is more than 3" from the dividing line and from the long edges; nearest piece-to-objective-circle gap 0.25" (large piece vs Vulcatrix/Behemat); nearest gap to Dracothion 4.85". Any other layout must be validated at runtime by SPH-5.2; the client offers this one as "Standard" and lets players drag pieces within the legal area.

## 15. Realm battlefield: City of Ash — BLOCKED on source

The file `spearhead-city-of-ash-gaming-pack.pdf` (8 pages) contains only:

| Army | Faction | General | Units |
|---|---|---|---|
| Sentinels of Embergard | Cities of Sigmar | Jorvan Kreel, Heir of the Kraken (with the Thexa token) | 1 Mallus Forgepriest, 5 Freeguild Gallants, 5 Freeguild Grenadiers, 5 Freeguild Grenadiers |
| Crixxit's Kill-Pack | Skaven | Deathmaster Crixxit | 1 Deathmaster, 5 Gutter Runners, 5 Gutter Runners, 10 Night Runners (each Gutter Runners unit: 1 Bomb Rat token) |

Those belong in faction specs (`docs/spec/factions/`), not here. The pack has **no** twist cards, battle tactic
cards, battleplan, deployment maps, terrain list or objective positions, so none of the City of Ash
realm battlefield can be specified without inventing rules. Reserved ids and the fill-in list:

| Item | Reserved id / shape | Needed from source |
|---|---|---|
| Realm battlefield | `rbf.city-of-ash` | its two sides (realm names), board size if not 30 × 22 |
| Battleplan | `bp.city-of-ash` | pre-battle changes vs §4, deployment maps, battle length, scoring changes, special rules |
| Objectives | `obj.<name>` per side, `{x, z, radius}` | positions in inches per side |
| Terrain | kinds + footprints | which features, sizes, any extra passives |
| Twist decks | `card.twist.<slug>` × N per side | name, picker, duration, effect for every card |
| Battle tactic deck | `card.tactic.<slug>` × N | tactic condition and command (timing/trigger, declare, effect) for every card |

Until then the game uses Fire and Jade (§14) for every battle; the armies from this pack play there unchanged.

## 16. Data shapes (`src/data/spearhead/`)

### 16.1 `RealmBattlefield`
```ts
{ id: 'rbf.fire-and-jade', name: string, board: { w: 30, h: 22 },
  battleplan: 'bp.fire-and-jade',
  sides: [{ id: 'aqshy', name: string, twistDeck: CardId[],
            objectives: { id: Id, name: string, x: number, z: number, radius: number }[] }, ...],
  deploymentMaps: { id: 'map.horizontal' | 'map.diagonal' | Id,
                    territoryA: Polygon, territoryB: Polygon,   // XZ, closed, shared edge = the line
                    deployDepth: 6, terrainEdgeMargin: 3 }[],
  terrainKinds: { id: 'large' | 'small', name: string, footprint: Polygon, height: number,
                  traits: ('cover' | 'obscuring' | 'unstable')[] }[],
  tacticDeck: CardId[],                 // one copy per player is built from this list
  defaultLayouts: TerrainLayoutId[] }
```

### 16.2 Twist card
```ts
{ id: 'card.twist.<slug>', kind: 'twist', battlefield: RbfId, side: SideId, name: string,
  text: string,                       // our own words, shown in the UI
  picker?: 'underdog' | 'rollOffWinner' | 'underdogElseRollOff' | 'both',
  duration: 'round' | 'battle' | 'immediate',
  effects: AbilityDescriptor[],       // 20-data-schema §3 descriptors; `code` hook when not expressible
}
```

### 16.3 Battle tactic card
```ts
{ id: 'card.tactic.<slug>', kind: 'tactic', battlefield: RbfId, name: string,
  tactic:  { text: string, vp: 1, condition: ScoringCondition | { code: HookId } },  // checked at turn.end.scoring
  command: { name: string, text: string,
             timing: TimingSpec | { reaction: ReactionTrigger },  // e.g. { reaction: 'opponentDeclaredAttack' }
             declare?: TargetSpec, effects: AbilityDescriptor[] } }
```
Slugs are unique across the whole data bundle; when two battlefields share a card name, prefix the slug with the battlefield (`card.twist.coa-<slug>`).

### 16.4 `SpearheadArmy`
```ts
{ id: Id, faction: Id, name: string, general: UnitRef,
  units: { ref: UnitRef, datasheet: Id, models: number, tokens?: Record<TokenId, number> }[],
  battleTraits: AbilityId[], regimentAbilities: [AbilityId, AbilityId],
  enhancements: [AbilityId, AbilityId, AbilityId, AbilityId] }
```
Validation: exactly 2 regiment abilities and 4 enhancements; `general` names a unit in `units`; every datasheet has `spearhead: true`.

### 16.5 `GameSetup` additions
`{ mode: 'spearhead', realmBattlefield: RbfId, players: [{ army: Id, regimentAbility?: AbilityId, enhancement?: AbilityId }] }` — choices left empty become pre-battle decisions (§4); the sim and quick-start may pre-fill them.

## 17. Engine state, decisions, events (summary)

| Kind | Items |
|---|---|
| State | `attacker`, `defender`, `side`, `deploymentMap`, `territory: Record<PlayerId,'A'\|'B'>`, `round (1–4)`, `firstPlayer`, `underdog`, `seized`, `vp`, `objectiveControl: Record<ObjId, PlayerId\|null>`, `twist{deck,current,drawn}`, `tactics[player]{deck,hand,discard,scored}`, `reinforcementUsedThisTurn`, `unit.replacementOf/replaced/tokens` |
| Decisions | `chooseAttacker`, `chooseRegimentAndEnhancement`, `chooseBattlefieldSide`, `chooseDeploymentMap`, `placeTerrain`, `deployUnit`, `chooseFirstTurn`, `twistPick` (per twist picker), `discardTactics`, `scoreTactics`, `useTacticCommand` (offered in matching windows), `assignContestedObjective` (unit on 2+), `callForReinforcements` |
| Events | `AttackerChosen`, `ArmyOptionsChosen`, `SideChosen`, `MapChosen`, `TerrainPlaced`, `PriorityRolled`, `InitiativeSeized`, `UnderdogDetermined`, `TwistDrawn`, `TacticsDrawn`, `TacticDiscarded`, `TacticCommandUsed`, `TacticScored`, `ObjectiveControlChanged`, `VictoryPointsScored{player, rule, vp}`, `UnitReplaced`, `TokenGiven/Removed`, `BattleEnded{winner\|draw}` |

## 18. Open items for later stages

| # | Item | Default until resolved |
|---|---|---|
| 1 | City of Ash realm battlefield content is absent from sources (§15). | Play on Fire and Jade. |
| 2 | Fire and Jade card lists absent (only cropped fragments in the core book). | Resolved: 14-fire-and-jade-cards.md; data in `src/data/cards/fire-and-jade.json`, engine `src/engine/cards.ts` (F4). |
| 3 | Objective circle diameter not stated; measured ≈ 6". Ghyran positions re-measured in 15-fire-and-jade-ghyran.md §15.3. | radius 3; Aqshy as §14.3, Ghyran as 15.3. |
| 4 | Terrain footprints/heights not in sources. | §5 defaults. |
| 5 | Seizing player: may they still discard tactics when they cannot draw? Source only removes the draw. | Allow discard. |
| 6 | Scored tactic card fate isn't stated (only "discard" for commands). | Move to a public scored pile; never reshuffled. |
| 7 | How a unit contests a **terrain feature** in Spearhead (SPH-5.9) — Spearhead only redefines objectives. | On it or within combat range. |
| 8 | Order of tactic discards/draws between players is unstated. | First-turn player, then the other (hidden info, order is cosmetic). |
| 9 | PLAN.md lists "command points" and "spells with unbind" as new; Spearhead uses neither (SPH-13.1/13.2). | Follow this spec. |
