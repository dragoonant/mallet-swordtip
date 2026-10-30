# Lumineth Realm-lords — Hurakan Vanguard (Spearhead)

Faction id: `lumineth` · Army id: `lumineth.army.hurakan-vanguard` · Grand alliance: Order.
Source: `docs/sources/spearhead-lumineth-realm-lords.pdf` (4 pages, gitignored), "Spearhead: Lumineth Realm-lords -
Hurakan Vanguard", Warhammer Community downloads (Age of Sigmar), posted 2026-02-04, fetched 2026-10-30 with plain curl
(found through the downloads search API) from
`https://assets.warhammer-community.com/eng_04-02_aos_spearhead_lumineth_realmlords-5ruf50utef-0atmxv5lpx.pdf`.
This is the army in the current 4th-edition **Spearhead: Lumineth Realm-lords** box (Windmage, Windchargers, Wardens,
Spirit of the Wind). The other free Lumineth Spearhead, *Glittering Phalanx* (Cathallar, Sentinels, Wardens, Bladelords:
the older Vanguard-box line-up, posted 2026-04-01, `eng_01-04_aos_spearhead_lumineth_realmlords_glittering_phalanx-vc5h4mvert-lcmzbvmqq9.pdf`),
is out of scope here.
Base sizes are not printed in the PDF; they come from the Wahapedia aos4 Lumineth warscroll pages (read 2026-10-30 in the
built-in browser).
Mechanics and numbers are ported 1:1; all wording below is our own. Rule IDs are stable; tests key on the `LRL-` IDs in §9.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range
of an enemy unit; "wholly within" per CORE-1.2. Timing labels follow the core rules' ability-timing vocabulary. Engine phase
names: Hero phase = `command`, Combat phase = `fight`. Rend is stored as `AP` (negative = more Rend).

---

## 1. Army list

| ID | Unit | Models | Role | Base (mm) |
|---|---|---|---|---|
| `lumineth.unit.hurakan-windmage` | Hurakan Windmage | 1 | **General** | 60×35 oval (Wahapedia) |
| `lumineth.unit.hurakan-windchargers` | Hurakan Windchargers | 5 | Unit | 60×35 oval (Wahapedia) |
| `lumineth.unit.vanari-auralan-wardens` | Vanari Auralan Wardens | 10 | Unit | 32 round (Wahapedia) |
| `lumineth.unit.hurakan-spirit-of-the-wind` | Hurakan Spirit of the Wind | 1 | Unit | 60 round (Wahapedia) |

Total: 4 units, 17 models. One Wizard (the general), one Monster, one Cavalry unit, one Infantry unit besides the general.
Four units fly or ride: the Windmage and the Spirit have **Fly**.

**Reinforcements:** only the **Auralan Wardens** print the Reinforcements keyword, so they are the only unit the core Call
for Reinforcements ability (SPH-12) can replace. The Windmage, Windchargers and Spirit cannot be replaced.

---

## 2. The leeward edge (army-wide state)

Nearly every army rule reads one battlefield edge, the **leeward edge**. It is per player (a Lumineth mirror match has two,
independent), starts unset, and is set by Storm Brewing (LRL-BT-1) in deployment.

- **Edge ids.** The 30"×22" realm battlefield (SPH-1.1) has four edges, named by coordinate: `z-` (long edge, z = −11),
  `x+` (short edge, x = +15), `z+` (long edge, z = +11), `x-` (short edge, x = −15).
- **Clockwise** is as seen from above in the default camera (x to the right, +z toward the bottom of the screen, which is
  what `aos-moves.ts` calls "down the table"): `z-` → `x+` → `z+` → `x-` → `z-`.
- **Distance from a unit to an edge** = the shortest distance from any of its models' bases to that edge line (closest
  points, CORE-1.x). For a terrain feature, the shortest distance from its footprint to the edge line.
- **"Closer to the leeward edge than X"** = strictly smaller distance as defined above.
- **"Must end that move closer to the leeward edge"** **[interp]**: every model of the unit must end the move strictly
  closer to the edge line than it started (for a rigid slide this means the slide has a positive component toward the edge).
- **Ride the Hurricane** is an ability keyword. Four rules carry it: Gale Force, Pulled by the Winds (battle traits), Lifted
  Debris (regiment ability) and Leap into the Storm (Windchargers). Each use counts for Storm Brewing (the edge turns one step
  clockwise after it resolves) and for Scattered to the Winds (a per-round use counter).

---

## 3. Battle traits

### LRL-BT-1 `lumineth.ability.storm-brewing` — Storm Brewing
- **Timing:** Deployment phase (once; the army's leeward edge must be set before the battle starts).
- **Declare:** Pick one battlefield edge.
- **Effect:** That edge becomes your leeward edge. For the rest of the battle, every time a friendly **Ride the Hurricane**
  ability finishes resolving, your leeward edge moves to the next edge clockwise (§2).
- **[interp]** If the player never picks, the engine sets the long edge behind the opponent's territory (the AI's default too).

### LRL-BT-2 `lumineth.ability.pulled-by-the-winds` — Pulled by the Winds
- **Timing:** Once per turn (army), any movement phase (yours or the opponent's). Keyword: **Ride the Hurricane**.
- **Declare:** Pick a friendly unit that is **not in combat**.
- **Effect:** That unit may move up to D6". It must end the move closer to your leeward edge (§2). During the move it may pass
  through enemy combat ranges, but it may not end the move in combat. This is not a Normal Move, Run or Retreat, so it does
  not stop the unit shooting or charging later.

### LRL-BT-3 `lumineth.ability.gale-force` — Gale Force
- **Timing:** Once per turn (army), **Reaction: you declared an Attack ability** (Shoot or Fight). Keyword: **Ride the
  Hurricane**.
- **Used by:** the unit using that Attack ability.
- **Effect:** +1 to hit rolls for that Attack ability's attacks against a target that is closer to your leeward edge than
  the attacking unit. Capped with other hit modifiers at ±1 (CORE-2.5).
- **[interp]** Storm Brewing turns the edge right after Gale Force resolves, i.e. before the attacks are rolled. The
  comparison uses the leeward edge **as it was when Gale Force resolved** (snapshotted into the granted effect); unit positions
  are read live at each hit roll (so a Fight's pile-in counts).

---

## 4. Regiment abilities (pick 1 at army selection)

### LRL-RA-1 `lumineth.ability.lifted-debris` — Lifted Debris
- **Timing:** Your hero phase (Rule of One: once per phase). Keyword: **Ride the Hurricane**.
- **Declare:** Pick an enemy unit that is closer to your leeward edge than the **large terrain feature in your territory**
  (§2 distances). No legal target if your territory has no large feature.
- **Effect:** Roll dice equal to the current battle round number (1–4). Each 3+ inflicts 1 mortal damage on the target (ward
  rolls apply). No visibility or range limit.

### LRL-RA-2 `lumineth.ability.roaring-headwind` — Roaring Headwind
- **Timing:** Once per battle (army), **enemy** hero phase. (No Ride the Hurricane keyword.)
- **Declare:** Pick an enemy unit.
- **Effect:** For the rest of that turn, whenever the target uses a **Move** ability (Normal Move, Run, Retreat, Charge,
  Redeploy and any other ability with the Move keyword) it must end that move closer to **your** leeward edge (§2). The edge is
  read when each move is checked (it may have turned since). Pile-in (part of a Fight ability) is not a Move ability.
- **[interp]** If no legal end position exists for a move, the unit cannot make that move (a charge it rolled for simply fails).

---

## 5. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `lumineth.enh.scattered-to-the-winds` | Scattered to the Winds | Passive | Each enemy unit within 6" of the general has its control score reduced by 1 for each friendly Ride the Hurricane ability used **this battle round** (both turns count). Control score floor of 1 per contesting unit still applies (CORE-17.4). |
| `lumineth.enh.wind-whisperer` | Wind Whisperer | Once per battle (army), any hero phase | Declare: pick a battlefield edge. Effect: it becomes your leeward edge. (Not Ride the Hurricane: no extra turn of the edge.) |
| `lumineth.enh.temple-guardians` | Temple Guardians | Passive | While any friendly **Infantry** units are within the general's combat range (3"), the general and each of those Infantry units have **Ward (5+)**. **[interp]** The general does not count itself: another friendly Infantry unit (in this roster only the Wardens) must be within 3". |
| `lumineth.enh.curved-shots` | Curved Shots | Passive | Range and visibility for the general's shooting attacks may be measured from any point on your leeward edge (in addition to measuring normally). |

---

## 6. Warscrolls

Stat order: Move / Health / Save / Control (/ Ward). Printed keywords only.

### 6.1 `lumineth.unit.hurakan-windmage` — Hurakan Windmage
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 5 | 5+ | 2 | — |

Keywords: **Hero, Wizard, Infantry, Fly** (Wizard with no number = Wizard (1), CORE-15.2).

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Windblast Vortex (`lumineth.weapon.windblast-vortex`) | Ranged | 12" | 1 | 2+ | 3+ | 2 | D3 | — |
| Aspiragillum (`lumineth.weapon.aspiragillum`) | Melee | — | 3 | 3+ | 4+ | 1 | D3 | — |

**LRL-AB-1 `lumineth.ability.guide-the-gusts` — Guide the Gusts**
- **Timing:** Your hero phase.
- **Declare:** Pick a **visible** friendly unit **wholly within 12"** of the Windmage (the Windmage may pick itself, same
  ruling as Icon of Grimnir), then make a **casting roll** of 2D6.
- **Effect:** On 6+, until the end of the turn: the target may Retreat and still Shoot and/or Charge later that turn, and
  Retreat inflicts no mortal damage on it.
- **[interp]** The PDF prints no Spell keyword on this box, but "casting roll" only exists for spells (CORE-15.3), so it is
  treated as a Spell with casting value 6: miscast on a double 1 (CORE-15.4), unbindable by an enemy Wizard (only matters in a
  mirror match; no other shipped army has a Wizard), counts against the Windmage's power level of 1.

### 6.2 `lumineth.unit.hurakan-spirit-of-the-wind` — Hurakan Spirit of the Wind
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 18" | 8 | 4+ | 5 | 5+ |

Keywords: **Monster, Fly, Ward (5+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Bow of the Wind's Vengeance (`lumineth.weapon.bow-of-the-winds-vengeance`) | Ranged | 15" | 4 | 2+ | 3+ | 2 | 2 | — |
| Swirling Shards (`lumineth.weapon.swirling-shards`) | Melee | — | 6 | 2+ | 4+ | — | 1 | — |

**LRL-AB-2 `lumineth.ability.eye-of-the-storm` — Eye of the Storm**
- **Timing:** Passive.
- **Effect:** −1 to hit rolls for attacks (shooting and melee) that target friendly units while they are **wholly within 6"**
  of the Spirit. Includes the Spirit itself **[interp]** (same holder-counts-itself ruling as FYR-AB-1). Checked live at
  each hit roll; capped at ±1 with other hit modifiers.

**LRL-AB-3 `lumineth.ability.hurricane-winds` — Hurricane Winds**
- **Timing:** Any shooting phase (Rule of One: once per phase).
- **Declare:** Pick an enemy unit that had at least one damage point allocated to it **this turn by this unit's shooting
  attacks**.
- **Effect:** Roll a D6. On 3+ the target has **Strike-last** for the rest of the turn.

### 6.3 `lumineth.unit.hurakan-windchargers` — Hurakan Windchargers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 14" | 3 | 4+ | 1 | — |

Keywords: **Cavalry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Windcharger Bow (`lumineth.weapon.windcharger-bow`) | Ranged | 12" | 3 | 3+ | 4+ | 1 | 1 | — |
| Windcharger Blade (`lumineth.weapon.windcharger-blade`) | Melee | — | 1 | 4+ | 4+ | — | 1 | — |
| Treerunner's Claws (`lumineth.weapon.treerunners-claws`) | Melee | — | 2 | 5+ | 3+ | — | 1 | Companion |

**LRL-AB-4 `lumineth.ability.leap-into-the-storm` — Leap into the Storm**
- **Timing:** End of your turn. Keyword: **Ride the Hurricane**.
- **Effect:** If this unit is **not in combat**, take it off the battlefield and set it up again **wholly within 3" of your
  leeward edge** and more than 6" from every enemy unit. Optional (the player may decline). It keeps its wounds and effects;
  not "set up this turn" for later purposes (the turn is ending). Storm Brewing then turns the edge.

### 6.4 `lumineth.unit.vanari-auralan-wardens` — Vanari Auralan Wardens
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 1 | 4+ | 1 | — |

Keywords: **Infantry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Warden Pike and Blade (`lumineth.weapon.warden-pike-and-blade`) | Melee | — | 2 | 3+ | 4+ | — | 1 | Anti-charge (+1 Rend), Crit (Mortal) |

**LRL-AB-5 `lumineth.ability.wall-of-blades` — Wall of Blades**
- **Timing:** Any combat phase (Rule of One: once per phase), no Declare step.
- **Condition:** this unit did **not** charge this turn and is in combat with at least one enemy unit that **did** charge this
  turn.
- **Effect:** Roll a D6; add 1 if that charging enemy unit is **Cavalry** (**[interp]** if several charging enemies are in
  combat with it, +1 when any of them is Cavalry). On 3+ this unit has **Strike-first** for the rest of the turn.

---

## 7. Spells and prayers

One spell-like ability: Guide the Gusts (LRL-AB-1, casting value 6, see the ruling there). No spell lore, no prayers, no
manifestations in Spearhead.

---

## 8. Mechanics mapping

(a) = expressible with existing data (`src/data/factions/lumineth/*.json` descriptors: `timing`, `limit`, `when`, `effect`,
`scope`, `duration`, `keywords`, `declare`, `roll`) or an existing helper; (b) = new faction code hook in
`src/engine/factions/lumineth.ts`, registered in `code-hooks.ts` as `...luminethHooks`; (c) = engine change outside the faction
file (exact shape given).

| Rule | Class | How |
|---|---|---|
| Stats, Fly, Ward (5+) on the Spirit, Reinforcements on Wardens | (a) | Datasheets as Fyreslayers/Slaves: `stats.ward: 5` on the Spirit; keywords HERO/WIZARD/INFANTRY/FLY/MONSTER/CAVALRY/REINFORCEMENTS; `wizard: 1` on the Windmage. Call for Reinforcements via `spearhead-core.ts` (Wardens only). |
| Anti-charge (+1 Rend), Crit (Mortal), Companion | (a) | Weapon abilities `{ ability: 'ANTI', keyword: '@charged' }`, `CRIT_MORTAL`, `COMPANION` (as Fyreslayers / Slaves). |
| Leeward edge state + helpers | (b) | `mission.custom.lrlLeeward: Partial<Record<PlayerId, 'z-'\|'x+'\|'z+'\|'x-'>>` (same storage pattern as `fyrRunes`) and `mission.custom.lrlRth: Partial<Record<PlayerId, { round: number; count: number }>>`. Helpers in `lumineth.ts`: `leewardOf(state, player)`, `setLeeward(state, player, edge)`, `edgeDistanceOfUnit(state, unitId, edge)` (min over models of the base-edge-to-edge-line distance), `edgeDistanceOfPiece(piece, edge)`, `closerToEdge(state, a, b, edge)`, `afterRideTheHurricane(ctx, player)` (count +1 for the current round, then rotate clockwise; emits an `AbilityTriggered` summary "Leeward edge → …"). Every Ride the Hurricane hook calls `afterRideTheHurricane` at the end of its `resolve`. |
| Leeward edge on screen | (c) client | The board shows each Lumineth player's current leeward edge (a coloured wind band along that edge) and its name in the HUD; hover help through `Tooltip.tsx`, never `title=`. Reads `state.mission.custom.lrlLeeward`. |
| LRL-BT-1 Storm Brewing | (b) `luminethStormBrewing` | `timing { kind: 'deployment' }`, `limit oncePerBattle`, `modes` = the 4 edges (`modesFor` labels them "Long edge (your side)", etc.). Resolve: `setLeeward`. `ensureEffects` (idempotent): if the battle has started and no edge is set, set the default (long edge behind the opponent's territory). AI picks that default too. |
| LRL-BT-2 Pulled by the Winds | (b) `luminethPulledByTheWinds` + (c) | `timing { phase: 'movement', whose: 'any' }`, `limit oncePerTurnArmy`, declare a friendly unit not `inCombat`; declared roll D6 = max distance. Uses the Mighty Destroyers move queue (`writeMoveQueue` / `slideOptions` / `applySlide`). Engine change in `factions/aos-moves.ts`: `slideOptions(state, unitId, maxDistance, opts?: { towardEdge?: { axis: 'x' \| 'z'; sign: -1 \| 1 }; mayNotEndInCombat?: boolean })` and the same `opts` on `checkSlide`: reject slides whose component toward the edge is ≤ 0 and (with `mayNotEndInCombat`) slides that end in combat; add a "Toward the leeward edge" heading. Passing through combat ranges is already allowed by a rigid slide. |
| LRL-BT-3 Gale Force | (b) `luminethGaleForce` + (c) | Engine change (abilities.ts + phases): a reaction window for faction abilities. Add `export function runReactionWindow(ctx: EngineContext, player: PlayerId, trigger: { kind: 'youDeclaredAttack'; unitId: UnitId; phase: 'shooting' \| 'fight' }, key: string): boolean` to the abilities service; it offers abilities whose `timing` is `{ kind: 'reaction', trigger: 'youDeclared', keyword: 'ATTACK' }` (new optional `keyword?: AbilityKeyword` on the reaction timing in `src/data/types.ts` + `common.schema.json`; contract note in 00-architecture). Called by `phases/shooting.ts` after `declareTargets` is answered (before `resolve`) and by `phases/fight.ts` when a unit is picked to fight (before pile-in), for the active-in-that-pick player only. Hook resolve grants the attacker an effect `{ modifyRoll: { roll: 'hit', value: 1 } }` with `duration 'untilEndOfPhase'`, gated (`gate`) to attacks whose target is closer to the **snapshotted** edge (`params.edge` stored on the granted effect) than the attacker, and to this one activation (gate also checks `phaseState.attack.attackerUnitId` and an activation counter, so a later activation of the same unit in the phase does not inherit it). Then `afterRideTheHurricane`. AI: use it on the first activation that has a qualifying target. |
| LRL-RA-1 Lifted Debris | (b) `luminethLiftedDebris` | `timing { phase: 'command', whose: 'your' }`, `keywords: ['RIDE_THE_HURRICANE']` (descriptive), `declare` enemy unit; `canUse`/target filter: enemy closer to the leeward edge than `largeFeatureIn(state, player)` (export that helper from `cards.ts`, currently file-private: one-line (c)). Resolve: roll `state.round` D6, count 3+, `inflictMortal(ctx, use, target, n)`; then `afterRideTheHurricane`. AI target: the enemy with the fewest wounds left among legal targets. |
| LRL-RA-2 Roaring Headwind | (b) `luminethRoaringHeadwind` + (c) | `timing { phase: 'command', whose: 'enemy' }`, `limit oncePerBattle`, declare an enemy unit; resolve grants the target a marker effect (`untilEndOfTurn`, params `{ lrlHeadwindBy: player }`). Engine change: `MoveConstraints` (`src/engine/types.ts`, frozen contract: note in 00-architecture §types) gains `mustEndCloserToEdge?: { axis: 'x' \| 'z'; sign: -1 \| 1 } \| null`, enforced in `geometry.ts checkPlacements` per model (end distance to that edge line < start distance). New query on EngineCodeHook: `moveEdgeConstraint?(state: GameState, entry: HookSourceEntry, unitId: UnitId): { axis: 'x' \| 'z'; sign: -1 \| 1 } \| null`, read by `phases/movement.ts buildMoveConstraints`, `phases/charge.ts` (charge moves) and the card Redeploy/slide paths; the hook answers with the caster's **current** leeward edge. The AI's move planner must use the constrained validator (otherwise it proposes rejected moves). |
| LRL-ENH Scattered to the Winds | (b) `luminethScatteredToTheWinds` | Passive. `producesAt: ['onObjectiveControl']`, `produce` returns `{ kind: 'stat', delta: -count }` when `contestingUnitId` is an enemy unit within 6" (`unitsWithin`) of the general and `lrlRth[player].round === state.round`. The existing `unitControlScore` floor/cap logic applies. |
| LRL-ENH Wind Whisperer | (b) `luminethWindWhisperer` | `timing { phase: 'command', whose: 'any' }`, `limit oncePerBattle`, `modes` = the 3 edges that are not the current leeward edge; resolve `setLeeward` (no rotation, no counter). |
| LRL-ENH Temple Guardians | (b) `luminethTempleGuardians` | Passive; `adjustFeelNoPain` like `fyreslayersDutyUntoDeath`: returns threshold 5 when the warded model's unit is the general and some **other** friendly INFANTRY unit is `unitsWithin(…, 3)` of it, or the warded unit is friendly INFANTRY within 3" of the general. |
| LRL-ENH Curved Shots | (b) `luminethCurvedShots` + (c) | Engine change: new EngineCodeHook query `extraShootingOrigins?(state: GameState, entry: HookSourceEntry, shooterModelId: ModelId): Vec2[] \| null`, read by `phases/shooting.ts targetLegality` and `los.ts` for range and visibility: a target is in range/visible if it is from the model **or** from any returned point. The hook returns points every 1" along the current leeward edge (31 or 23 points, `y` = 0) for the general's models only. Attack resolution (cover, half-range rules if any) is unchanged. |
| LRL-AB-1 Guide the Gusts | (a) effects + (c) casting | Effects already exist: `[{ shootAfterFallBack: true }, { chargeAfterFallBack: true }, { noRetreatDamage: true }]`, scope target, `duration 'untilEndOfTurn'` (as STD-RA-2). Engine change (CORE-15 slice, new `src/engine/magic.ts`): `export function castingRoll(ctx: EngineContext, use: AbilityUse, casterUnitId: UnitId, castingValue: number): { cast: boolean; total: number; miscast: boolean }` (2D6; miscast on two 1s → D3 mortal damage to the caster and no more spells this phase; Wizard power level count per phase in `phaseState.marks`), plus `export function unbindWindow(ctx: EngineContext, casterUnitId: UnitId, total: number): boolean` offering each enemy Wizard within 30" (one try per casting roll, CORE-15.6). abilities.ts calls `castingRoll` when a descriptor has `castingValue` (data: `keywords: ['SPELL']`, `castingValue: 6`) instead of the plain declared roll. Declare filter: visible (los.ts) friendly unit wholly within 12" (`whollyWithinUnit`). |
| LRL-AB-2 Eye of the Storm | (b) `luminethEyeOfTheStorm` | Passive; `producesAt: ['onHitRoll']`, `produce` returns `{ kind: 'roll', modifier: -1 }` when the attack's target unit is friendly to the Spirit and `whollyWithinUnit(target, spirit, 6)` (melee and ranged). Data scopes cannot express a target-side hit modifier on an aura (`scope.who: 'attacker'` is self-only), hence code. |
| LRL-AB-3 Hurricane Winds | (b) `luminethHurricaneWinds` + (c) | (c) two small changes: (1) `attack.ts` records, for ranged attacks, a phase mark `shotDmg:<attackerUnitId>><targetUnitId>` when a damage pool allocates ≥ 1 point (helper `damagedByShootingThisPhase(state, attackerUnitId): UnitId[]` exported from attack.ts); (2) `phases/shooting.ts` runs `abilities.runWindow(ctx, 'shooting', active, 'shooting:after:<unitId>')` after each shooting activation resolves (today the active player's window only opens at phase start). Hook: `timing { phase: 'shooting', whose: 'any' }`, target filter = units in that list; roll D6, 3+ → `target.turn.fightsLast = true` (Strike-last already handled in fight.ts, CORE-10.7). |
| LRL-AB-4 Leap into the Storm | (b) `luminethLeapIntoTheStorm` + (c) | `timing { kind: 'endOfTurn', whose: 'your' }`, `canUse` = not `inCombat`. Uses `requestRedeploy` (redeploy.ts). Engine change: `RedeployRequest` gains `region?: Polygon` (here the 3"-deep strip along the leeward edge), honoured by `redeployFormation`/`redeployOptions` as "every model wholly within the region" in addition to `minEnemyDistance: 6`. Then `afterRideTheHurricane`. AI: take the option closest to an objective, else decline if the unit is already wholly within 3" of that edge. |
| LRL-AB-5 Wall of Blades | (b) `luminethWallOfBlades` | `timing { phase: 'fight', whose: 'any' }` (fight.ts already runs combat-phase ability windows first, CORE-10.1). `canUse`: `!unit.turn.chargedThisTurn` and some enemy in `enemiesInCombat` has `turn.chargedThisTurn`. Resolve: D6 (+1 if any such enemy has CAVALRY), 3+ → `unit.turn.fightsFirst = true` (as the Fire and Jade Strike-first card). AI: always use. |
| Hit modifier cap | existing | `dice.ts` clamps hit ±1 (CORE-2.5): Gale Force +1 and an enemy Eye of the Storm −1 cancel; never more than ±1. |
| Ward sources | existing | Spirit printed 5+; Temple Guardians 5+; best ward wins (attack.ts `wardThreshold`). |

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| LRL-ARMY-1 | Hurakan Vanguard roster builds: Windmage general + Windchargers (5) + Wardens (10) + Spirit (1), 17 models, stats and weapons as §6. |
| LRL-ARMY-2 | Only the Wardens can be replaced by Call for Reinforcements. |
| LRL-EDGE-1 | Edge distance / "closer to" uses closest base points; clockwise order is z- → x+ → z+ → x- → z-. |
| LRL-BT-1 | Storm Brewing sets the leeward edge in deployment; unset edge defaults to the long edge behind the enemy. |
| LRL-BT-2 | Each friendly Ride the Hurricane use turns the edge one step clockwise after it resolves; non-RtH abilities (Wind Whisperer, Roaring Headwind) do not. |
| LRL-BT-3 | Pulled by the Winds: once per turn (army), either movement phase, only a unit not in combat, at most D6", must end closer to leeward, may cross but not end in combat. |
| LRL-BT-4 | Gale Force: +1 to hit only against targets closer to the snapshotted leeward edge than the attacker; once per turn (army); offered on Shoot and Fight declarations. |
| LRL-RA-1 | Lifted Debris: only enemies closer to leeward than your territory's large feature; dice = battle round; each 3+ is 1 mortal damage; ward applies. |
| LRL-RA-2 | Roaring Headwind: once per battle in the enemy hero phase; every Move ability of the target that turn must end closer to your (current) leeward edge; pile-in unaffected. |
| LRL-ENH-1 | Scattered to the Winds: −1 control score per RtH use this round for enemies within 6" of the general; count resets next round; floor 1. |
| LRL-ENH-2 | Wind Whisperer: once per battle, any hero phase, sets any edge, no rotation. |
| LRL-ENH-3 | Temple Guardians: Ward (5+) for the general and Infantry within 3" only while another friendly Infantry unit is within 3". |
| LRL-ENH-4 | Curved Shots: the general may target an enemy in range/visible from the leeward edge but not from itself. |
| LRL-AB-1 | Guide the Gusts: casting 6+ lets the target Retreat then Shoot/Charge with no retreat damage; fails below 6; miscast on double 1. |
| LRL-AB-2 | Eye of the Storm: −1 to hit for attacks on friendly units wholly within 6" (incl. the Spirit), not for units partly within. |
| LRL-AB-3 | Hurricane Winds: only a unit this Spirit damaged by shooting this turn; 3+ gives Strike-last until end of turn. |
| LRL-AB-4 | Leap into the Storm: end of your turn, not in combat, set up wholly within 3" of leeward and >6" from enemies; turns the edge. |
| LRL-AB-5 | Wall of Blades: only when not charged and in combat with a charger; +1 vs Cavalry; 3+ gives Strike-first. |
| LRL-WEAP-1 | Warden Pike and Blade: +1 Rend against a unit that charged this turn; crit hit = mortal damage. |
| LRL-WEAP-2 | Treerunner's Claws (Companion) get no friendly buffs (Gale Force's +1 to hit skips them, CORE-12.4); enemy penalties still apply. |
| LRL-WARD-1 | Spirit's printed 5+ and Temple Guardians 5+ do not stack; best ward only. |

---

## 10. Figures (3D pipeline)

Palette for the whole army: ivory-white and pale-gold armour, sky-blue and deep teal cloth, soft lilac-pink wind ribbons and
plumes, polished silver blades, faintly glowing pale-cyan crystal accents. Shared motif: an original three-curl **wind swirl**
sigil (no copied Lumineth runes or GW icons). All figures are original **true MGSD** chibis (~2.5 heads tall, oversized head,
stubby legs); mounts and the spirit are chunky toy-like SD shapes.

| Slug | Unit | Models needed | Base (mm) | Mount | Concept prompt |
|---|---|---|---|---|---|
| `lrl-windmage` | Hurakan Windmage | 1 | 60×35 oval | Yes (cloud spirit) | A true MGSD chibi elf wind-mage, 2.5 heads tall with a huge serene head under a tall pale-gold crescent headdress, stubby legs, long sky-blue cape streaming sideways, holding a short sprinkler-like censer staff, riding on a puffy smiling white cloud spirit with little swirling wind curls. |
| `lrl-windcharger` | Hurakan Windchargers | 1 (×5) | 60×35 oval | Yes (treerunner) | A true MGSD chibi elf archer-rider, 2.5 heads tall with a giant head in a slim ivory helm with a lilac plume, stubby legs, drawing a curved silver bow, astride a chunky round-bodied, long-tailed, beaked running lizard-bird mount in plum-red scales with stubby strong legs and an ivory-and-teal saddle cloth. |
| `lrl-spirit-of-the-wind` | Hurakan Spirit of the Wind | 1 | 60 round | No (monster) | A chunky toy-like SD wind spirit: a big-headed, cheerful, translucent pale-cyan aelf-like figure with swept-back horn-shaped curls, its lower body a tight spinning whirlwind funnel on the base, holding an oversized elegant longbow, lilac ribbons and leaf-like crystal shards orbiting it. |
| `lrl-warden` | Vanari Auralan Wardens | 1 (×10) | 32 round | No | A true MGSD chibi elf pike-guard, 2.5 heads tall with an enormous head in a tall ivory helm with a teal crest, stubby legs in a firm braced stance, long silver pike held forward, small kite shield with an original wind-swirl sigil, sky-blue tabard and pale-gold trim. |
| `lrl-warden-banner` (optional) | Vanari Auralan Wardens (standard look) | 1 (×1) | 32 round | No | The same MGSD chibi pike-guard with a tall pole topped by a crescent-and-swirl standard and a hanging teal banner, so the unit has a visible leader; skip if time is short (no rule uses a champion or standard). |

---

## 11. Engine notes

1. **Two leeward edges in a mirror match.** Everything keys on `lrlLeeward[player]`; never a single global edge.
2. **Rotation order inside one turn.** A Ride the Hurricane use resolves fully, then the edge turns. Later checks in the same
   turn (another RtH ability, Roaring Headwind's live move check, Curved Shots) read the new edge.
3. **New engine pieces, smallest first:** export `largeFeatureIn` (cards.ts); slide `opts` (aos-moves.ts); `RedeployRequest.region`
   (redeploy.ts); per-activation shooting window + `damagedByShootingThisPhase` (shooting.ts, attack.ts); `moveEdgeConstraint` +
   `MoveConstraints.mustEndCloserToEdge` (types.ts contract change); `extraShootingOrigins` (shooting.ts, los.ts);
   `runReactionWindow` (abilities.ts, reaction timing `keyword`); CORE-15 casting slice (`magic.ts`). Contract changes need the
   matching 00-architecture edit.
4. **Fly** units (Windmage, Spirit) use the existing fly movement (CORE-6.10); Pulled by the Winds and Leap into the Storm are
   slides/set-ups, so Fly does not matter there.
5. **AI:** keep it simple. Storm Brewing on the enemy's back edge; Gale Force on the first qualifying attack; Pulled by the Winds
   toward the nearest objective when legal; Lifted Debris every hero phase when a target exists; Roaring Headwind on the enemy
   unit nearest the AI's objectives; Wind Whisperer back to the enemy's back edge once it has rotated away; Wall of Blades always.
