# 13 — Engine port plan (Mallet 42k → Spearhead)

How to turn the inherited 40k Combat Patrol engine into an AoS 4 Spearhead engine with the least work, ending in a
**playable hotseat game today** (Cities of Sigmar *Castelite Company* vs Ironjawz *Bigmob* on Fire and Jade, Aqshy
side, horizontal map). Rule ids refer to `10-rules-core.md` (CORE), `11-spearhead.md` (SPH) and the faction specs
(CITIES, IJZ). Priorities: **P0** = needed for today's hotseat build, **P1** = next session, **P2** = blocked or
cosmetic.

## 0. Strategy (decisions every package follows)

| ID | Decision |
|---|---|
| PORT-0.1 | **Contracts change additively.** No member of a frozen union/interface is removed or renamed today; new members are optional or new union literals. The 42k client, AI and tools keep compiling while the engine changes underneath. Removals happen in the cleanup package (WP8) or later. |
| PORT-0.2 | **Alias, don't rename** (table PORT-0.3). Where a 40k id has the same mechanics as the AoS concept, keep the id and relabel it in the UI. Renames are an optional P2 cleanup. |
| PORT-0.4 | **Dormant, not deleted.** Services with no Spearhead use but no 40k-faction imports (`stratagems.ts`, `leaders.ts`, `transports.ts`, `effects.ts`, `enhancements.ts`) stay as they are. With CP = 0, no stratagem data, no attachments and no transport data they never raise a decision. |
| PORT-0.5 | **Data before code.** Anything the existing machinery already expresses goes in JSON: objective contest (`objectiveRange: 0`, `objectiveMarkerRadius: 3` reproduces SPH-6.2 with the existing `withinObjectiveRange`), weapon profile choice (`profileGroup`, CITIES-AB-4), simple stat sets (enhancements via `onStatQuery`). |
| PORT-0.6 | **All new player choices are `chooseOption` / `confirm` decisions** with new topics. The client's generic option buttons render them with no new UI. No new `DecisionKind`. |
| PORT-0.7 | **One generic activated-ability loop** (`abilities.ts`, new) serves every "Your/Enemy/Any X Phase", Start/End of Turn ability (CORE-3.13). Faction effects are code hooks; no descriptor DSL work today. |
| PORT-0.8 | Start of Turn and End of Turn are **windows**, not phases: `turn.start`, and the SPH-8.6 sequence `turn.end.abilities` → `turn.end.control` → `turn.end.scoring` → `turn.end.afterScoring` (ROUND-015). The `Phase` union keeps its values. |
| PORT-0.9 | Engine tests are named with `12-rules-test-checklist.md` ids (`it('SHOOT-010 …')`); §5 lists each package's P0 rows, P0 first. Faction tests use the faction spec ids (`CITIES-AB-3`, `IJZ-5.2.1`). Test units are the checklist fixtures (Guard, Brute, Boss, Knight, Cannon, Hawk). |

### PORT-0.3 Alias table (internal id → AoS meaning, UI label)

| Internal id (kept) | AoS meaning | Notes |
|---|---|---|
| `Phase 'command'` | Hero phase | phase module `commandModule` becomes the hero phase |
| `Phase 'fight'` | Combat phase | `FightStep 'fightsFirst'` = Strike-first queue |
| `MoveType 'advance'` | Run (CORE-6.2) | `UnitTurnState.advanceRoll` = run roll; `RollPurpose 'advance'` = run roll |
| `MoveType 'fallBack'` | Retreat (CORE-6.3) | D3 mortal damage to self before the move |
| `Stats.W` / `Sv` / `OC` | Health / Save / Control | `T`, `Ld` unused (optional in data, 0 at runtime) |
| `RuntimeWeapon.skill` | Hit | `wound`, `rend` are new fields (§2) |
| `CoreAbility FEEL_NO_PAIN`, `RollPurpose 'fnp'`, `onFeelNoPainRoll`, `FeelNoPainRolled` | Ward (CORE-13.2) | identical per-damage-point roll; best value only |
| `UnitTurnState.fightsFirst/fightsLast` | Strike-first / Strike-last | |
| `UnitTurnState.arrivedThisTurn` | "set up this turn" (CORE-6.13, IJZ-E2) | |
| `CombatPatrolData`, bucket `patrols`, `Player.patrolId` | Spearhead army (SPH-2) | additive fields §3.4 |
| `warlord` / `Unit.isWarlord` / `Player.warlordUnitId` | general | |
| `MissionData` (`format: 'spearhead'`) | one battleplan × side × deployment map | full `RealmBattlefield` record is P2 |
| `withinEngagementRange` & co. (geometry) | combat range 3" (CORE-1.4) | constants change, names stay |

## 1. Per-file verdicts (`src/engine`)

Verdicts: **keep** (no change), **adapt** (edit in place, keep exports), **replace** (rewrite body, keep file name and
the exports other files import), **delete** (WP8, after no importer is left), **new**.

### 1.1 Core

| File | Verdict | Concrete change | WP |
|---|---|---|---|
| `types.ts` | adapt | §2.1 (additive) | 1 |
| `actions.ts` | keep | `declareCharge.targetUnitIds` is always `[]` (CORE-9.4); `consolidate`, `useStratagem`, `commandReroll` never offered | 1 |
| `events.ts` | adapt | §2.3 (additive) | 1 |
| `hooks.ts` | adapt | §2.4 (additive) | 1 |
| `rng.ts` | keep | `shuffle` for card decks is P2 (§2.5) | — |
| `decider.ts` | keep | — | — |
| `index.ts` | adapt | drop `export * from './miracle'` and the `miracle`/`fix-roll` handlers from `DEFAULT_MODULES`; wire `abilityService`; keep every export the client imports (§4.2) | 1 |
| `modules.ts` | adapt | `ctx.order.defensive()` returns active-first (CORE-3.2); add `services.abilities` to `Services` | 1 |
| `reducer.ts` | adapt | Turn = `turn.start` window → command(hero) → movement → shooting → charge → fight(combat) → end-of-turn windows (PORT-0.8; `objectives.evaluateControl('turnEnd')` inside `turn.end.control`, `missions` scoring inside `turn.end.scoring`). Round start (SPH-8.2): round 1 attacker chooses first turn (topic `firstTurn`), rounds 2–4 priority roll (CORE-4.9), `underdog` (SPH-8.4), `seized` (SPH-8.5), twist draw with the empty-deck guard (SPH-9.4, CARD-005; no cards exist), then `round.start`. Battle ends after `state.mission.data.rounds` (4). No CP gain, no battle-shock step, no end-of-fight coherency cull (removal for coherency lives in attack allocation, CORE-13.5). Tabled player keeps taking empty turns (SPH-11.3). Strip calls into `pain`, `shadow`, `miracle`, `cult-ambush`, `teleport`, `deferred`. | 1 |
| `state.ts` | adapt | `createGameState` fills AoS runtime fields (§2.1): `wound`, `rend`, `ward`, `objective.radius`, new unit/player fields; Spearhead army options from `PlayerSetup.regimentAbilityId` + `enhancementId` attach the regiment ability (player-scoped) and the enhancement (general); units flagged `reserve` start `location: 'reserves'`. `modelStats` returns `RuntimeStats` with `T`/`Ld` defaulted to 0. | 1 |
| `geometry.ts` | adapt | `ENGAGEMENT_H = 3`, `ENGAGEMENT_V = Infinity` (combat range), coherency ½" horizontal with 7+ models needing 2 neighbours (CORE-1.6/1.7), charge end distance ½" exported as `CHARGE_END = 0.5`. Names unchanged. Pure range only; the visibility half of "in combat" (CORE-1.5) is `los.inCombat` (WP4). | 1 |
| `dice.ts` | adapt | hit/wound modifier clamp ±1 (kept); save modifier cap +1, no floor, Rend applied outside the cap (CORE-2.5); no "unmodified 6 always hits" (CORE-2.10 only fails 1s); `woundRollNeeded` kept as a compat export returning `weapon.wound` | 5 |
| `hooks-impl.ts` | adapt | remove `miracle`, `shadow`, `tyranids`, leader-split gates; `onObjectiveControl` per unit with min-1 control score; keep descriptor evaluation, `scope: 'bearer'` | 1 |
| `code-hooks.ts` | replace | registry of AoS code hooks only: `...citiesHooks, ...ironjawzHooks` + core (Guarded Hero lives in shooting, not here). Drops every 40k faction import. Keep exports `codeHooks`, `pendingReactions`, `consumeReaction`, `pushReaction` (stratagems.ts and phases import them) | 7 |
| `effects.ts` | keep | durations map: "until the start of your next turn" = `nextOwnTurn` | — |
| `enhancements.ts` | keep | general = warlord | — |
| `stratagems.ts` | keep (dormant) | no stratagem data, CP 0 → never opens a window. Becomes the battle-tactic command service in L3 | — |
| `leaders.ts`, `transports.ts` | keep (dormant) | no attachments / transport data; `combinedModels` = unit models | — |
| `weapons.ts` | adapt | new weapon ability names (§3.2): Companion, Shoot in Combat, Charge (+1 Damage), Anti-X (+1 Rend), Crit (2 Hits/Auto-wound/Mortal); Champion +1 Attacks is P1 (no champion in these armies) | 5 |
| `attack.ts` | replace | AoS attack sequence: targets at declare (CORE-11.1–11.4), hit/wound/save fast dice with `rollOnce` batching kept from 42k (CORE-11.9), crits (CORE-11.5, 12.5–12.7), damage pool per target unit, ward per point (CORE-13.2), auto allocation with spill-over and coherency removal (CORE-13.4/13.5), mortal damage into the pool. No `allocateAttack` decision (P0 auto-picks: the damaged model first, then the model farthest from the attacker). Keep exports `attackService`, `AttackService`, `AttackBegin`, `DestroyedBy`, `pruneUnreachableTargets`, `REACTIVE_MOVED_PREFIX`, `shotThisTurn`. | 5 |
| `los.ts` | adapt | true LoS kept (CORE-7); new `inCombat(state, unitA, unitB)` = combat range **and** mutual visibility (CORE-1.5, MEAS-009), used by movement path checks (CORE-6.4) at sampled points and by fight eligibility; Cover becomes −1 to hit for shooting **and** combat, negated if the target charged this turn or has FLY (CORE-16.5); "behind" = every attacker→target line crosses the feature, ignoring parts within the attacker's combat range (CORE-16.4); Obscuring makes a target behind/wholly on a `large` feature un-targetable by shooting unless it has FLY (CORE-16.6, SPH-5.5) | 4 |
| `terrain.ts` | adapt | Unstable: cannot end a move or be set up on a part taller than 1" (CORE-16.7); parts ≤1" ignored; climbing counts vertical distance; jump-down (CORE-6.8) is P1. Fire and Jade pieces reuse kinds `ruin` (large) and `crate` (small) (§3.6) | 4 |
| `missions.ts` | replace | Spearhead scoring at the end of the active player's own turn: +1 hold ≥1, +1 hold ≥2, +1 hold more than opponent (SPH-11.1, ids `sph.vp.*`); `finalResult` = more VP wins, else draw (SPH-11.3); `playerHasForces` always true; reserve units still in reserve at the start of round 4 are destroyed (CORE-4.14). Drops every 40k mission rule and faction import. Keep `missionService` export names. | 3 |
| `objectives.ts` | adapt | contest from data (`objectiveRange 0`, radius 3) = base touches/overlaps the circle (SPH-6.2); control score per unit = Σ Control of contesting models, min 1 (CORE-17.4); sticky (CORE-17.5); evaluated only at start of round 1 and end of each turn (SPH-6.4); a unit on 2+ objectives is auto-assigned to the one its centroid is nearest (P0; the CORE-17.3 player choice is P1); `onObjectiveControl` filter hook (IJZ-5.4.1) | 3 |
| `setup.ts` | adapt | Spearhead pre-battle (SPH-4) as decisions in the SPH-002 order: `chooseAttacker` (roll-off winner) → `armyOptions` (attacker, then defender) → `battlefieldSide` → `deploymentMap` (defender) → `placeTerrain` (defender ×2, attacker ×2; options = engine-generated legal centres on a 0.5" grid filtered by SPH-5.2) → deploy. **A step is skipped when `GameSetup`/`PlayerSetup` pre-fills it** (SPH-16.5): the StartScreen pre-fills army options, side, map and the standard layout, so hotseat players only see the attacker choice, deployment and first turn; **attacker deploys the whole army, then the defender** (SPH-7.1); each unit wholly within friendly territory and more than 6" from enemy territory (SPH-7.2, deploy polygon from data); `reserve` units skip deployment. Records `Player.side`; the round-1 first-turn choice itself is raised by the reducer (WP1, SPH-8.3, topic `firstTurn`). Remove Scouts/Infiltrators/alternation. Keep exports `setupModule`, `rollOff`, `deployFacing`, `autoDeployPlacements`. | 3 |
| `abilities.ts` | new | Generic activated-ability service (PORT-0.7). `usable(state, player, timing)` lists (abilityId, unitId) pairs whose `timing` (§3.3) matches, limits (`limit`, Rule of One CORE-3.3/3.4, `fromRound`) allow, and whose code hook `canUse` passes; `runWindow(ctx, timing, player)` raises `chooseOption` topic `abilityUse` (options + pass) until the player passes, then `abilityTarget` / `abilityMode` decisions, the declared roll via `ctx.rollOnce`, then the hook's `resolve`. Records uses in `Player.abilityUses`. WP1 writes the interface + stub, WP3 the body. | 1 → 3 |
| `version.ts` | adapt | `ENGINE_VERSION = '2.0.0'` (42k saves refused) | 1 |
| `factions/cities.ts`, `factions/ironjawz.ts` | new | code hooks for the two armies (WP7). WP1 creates them as empty `Record<string, CodeHook>` exports. | 1 → 7 |
| `factions/<24 40k files>.ts` | delete | after `code-hooks.ts`, phases, `missions.ts`, `hooks-impl.ts` stop importing them | 8 |
| `cult-ambush.ts`, `deathblow.ts`, `deferred.ts`, `fight-on-death.ts`, `fix-roll.ts`, `fragile-invuln.ts`, `judgement.ts`, `miracle.ts`, `pain.ts`, `shadow.ts`, `teleport.ts` | delete | 40k faction mechanics; importers are stripped by WP1/4/5/7, client/AI importers by WP6 | 8 |

### 1.2 Phase modules (`src/engine/phases`)

| File | Verdict | Concrete change | WP |
|---|---|---|---|
| `command.ts` | replace | Hero phase: `abilities.runWindow('hero', active)` then `('hero', opponent)` for Enemy/Any Hero Phase abilities (CORE-3.13). No CP, no battle-shock. Steps `'activeAbilities' → 'opponentAbilities'`. Spells/prayers (CORE-15) are not needed by either army: P2. | 3 |
| `movement.ts` | adapt | Normal Move (no sampled point of the path may be `los.inCombat` with an enemy, CORE-6.1/6.4); Run = `advance` (D6, blocks Shoot/Charge, CORE-6.2); Retreat = `fallBack` (D3 mortal damage to self via `attackService.queueMortalWounds`, may cross combat ranges, must end outside all, blocks Shoot/Charge, CORE-6.3); units set up this turn cannot move (CORE-6.13). `reinforcements` step becomes **reserve arrival**: units in reserve whose arrival ability (data params `{ fromRound, minEnemyDistance, anywhere }`) allows it are offered a `deployUnit` placement (IJZ-2.1 Ere We Go: round ≥ 3, every model > 6" from every enemy). Then `abilities.runWindow('movement', …)` both players. Strip Overwatch, transports, teleport, surge, big guns; keep `overwatchTargets` as a stub returning `[]` (client import). | 4 |
| `shooting.ts` | adapt | Eligible: not Run/Retreat this turn (CORE-8.1); a unit in combat may only fire Shoot-in-Combat weapons at units it is in combat with (CORE-8.3, 11.2); may target enemies in combat (CORE-8.4); Guarded Hero (CORE-14.2) and Obscuring in `targetLegality`; profile choice by `profileGroup` (CITIES-AB-4). After the active player, `abilities.runWindow('shooting', opponent)` (CITIES-RA-2 is P1). Keep exports `targetLegality`; `firingDeckValue` → 0 and `isBigGunsUnit` → false stubs. | 5 |
| `charge.ts` | adapt | No declared targets; unit not in combat and no Run/Retreat (CORE-9.1); 2D6 via `rollOnce`, raw dice kept in `UnitTurnState.chargeRoll`/`chargeRollUnmodified` (IJZ-E5); move up to the roll, may pass through combat ranges, must end within ½" of a visible enemy model, else it may stay put as a failed charge (CORE-9.2/9.3); `chargedThisTurn` set. Then `abilities.runWindow('charge', …)` both players (CITIES-AB-3). Remove Overwatch, Heroic Intervention, Tank Shock steps. Keep export `neededChargeDistance`. | 4 |
| `fight.ts` | adapt | `abilities.runWindow('fight', …)` first (non-Fight combat abilities, CORE-10.1, IJZ-5.2.1). Then alternating picks **starting with the active player** (CORE-10.3/10.4); eligible = in combat or charged this turn; every unit in combat must fight; Strike-first queue reuses the `fightsFirst` step with the [interp] pass rule (CORE-10.6); pile-in up to 3" toward a chosen target, distance non-increasing (CORE-6.11/6.12, target = closest in P0); a model attacks every target in its combat range (CORE-11.3); no consolidate. Strike-last (CORE-10.7) is P1. Keep export `fightModule`. | 5 |
| `fightEligibility.ts` | adapt | `fightingModelIds`: a model can attack if an enemy model of the target is within its 3" combat range (no base-contact chain) | 5 |
| `legal.ts` | keep | candidate generation unchanged; `repairCoherency` uses the new ½" range | — |
| `README.md` | adapt | point at specs 10/11/13 and the rule-id test naming | 1 |

## 2. Contract changes (frozen files) and matching `00-architecture.md` edits

All additive (PORT-0.1). WP1 makes them, together with the 00-architecture edits, in one commit.

### 2.1 `types.ts`

| Item | Change |
|---|---|
| `SetupStep` | `+ 'firstTurn'` |
| `CommandStep` | `+ 'activeAbilities' \| 'opponentAbilities'` |
| `MovementStep`, `ChargeStep` | `+ 'abilities'` |
| `ShootingStep` | `+ 'enemyAbilities'` |
| `OutOfPhaseMove` | `+ 'abilityMove'` (Mighty Destroyers, P1) |
| `RuntimeStats` (new) | `Stats & { T: number; Ld: number; ward: RollTarget \| null; noSave: boolean }`; `RuntimeDatasheet.stats` and `RuntimeModelProfile.stats` use it |
| `RuntimeWeapon` | `+ wound: RollTarget; rend: number` (`S`, `AP` stay, 0 for AoS data) |
| `RuntimeDatasheet` | `+ spearhead: boolean` |
| `Objective` | `+ radius: number; name: string \| null` |
| `GameState.twist` (new) | `{ deck: Id[]; current: Id \| null; drawn: Id[] }` (always empty today) |
| `UnitTurnState` | `+ chargeRollUnmodified: number \| null; usedCoreThisPhase: boolean; abilitiesUsedThisPhase: Id[]` |
| `Unit` | `+ reserveArrival: AbilityId \| null` (ability that brings it on), `setUpTurn: { round: number; player: PlayerId } \| null`, `replacementOf: UnitId \| null`, `replaced: boolean` (SPH-12, P1), `tokens: Record<string, number>` (SPH-2.7, P2) |
| `Player` | `+ territory: 'A' \| 'B'; regimentAbilityId: Id \| null; battleTraitIds: Id[]; abilityUses: { abilityId: Id; unitId: UnitId \| null; round: number; turn: PlayerId; phase: Phase }[]` |
| `GameState` | `+ underdog: PlayerId \| null; priority: { rolls: Record<PlayerId, number> \| null; seized: PlayerId \| null; doubleTurn: boolean }` |
| `PlayerSetup` | `+ regimentAbilityId?: Id`; `secondaryId`, `battleReadyVp`, `attachments`, `reserves` become optional |
| `GameSetup` | `+ mode?: 'spearhead'` (absent = spearhead from now on); `+ side?: 'aqshy' \| 'ghyran'; deploymentMap?: Id; defenderTerritory?: 'A' \| 'B'` pre-fills (terrain pre-fill = existing `terrainLayoutId`) |
| `ChooseOptionTopic` | `+ 'chooseAttacker' \| 'armyOptions' \| 'battlefieldSide' \| 'deploymentMap' \| 'placeTerrain' \| 'firstTurn' \| 'priorityChoice' \| 'abilityUse' \| 'abilityTarget' \| 'abilityMode' \| 'pileInTarget' \| 'contestedObjective' \| 'discardTactics' \| 'scoreTactics'` (last three P1/P2) |
| `TimingWindowId` (in `src/data/types.ts`) | `+ 'turn.start' \| 'turn.end.abilities' \| 'turn.end.control' \| 'turn.end.scoring' \| 'turn.end.afterScoring'` (old `turn.end` kept, never opened) |
| `RollPurpose` | `+ 'priority' \| 'retreat'` |
| `RejectionCode` | `+ 'E_TERRITORY' \| 'E_IN_COMBAT' \| 'E_ABILITY_USED'` |

### 2.2 `actions.ts` — no change (PORT-0.6).

### 2.3 `events.ts` (additive)

`PriorityRolled { rolls, winner, chooser, firstPlayer }`, `FirstTurnChosen { player }`, `UnderdogDetermined { player | null }`,
`InitiativeSeized { player }`, `DamagePoolResolved { unitId, points, warded, slain }`, `UnitReplaced { unitId, replacementOf }` (P1).
Activated abilities reuse `AbilityTriggered`; returned models reuse `ModelReturned`; ward rolls reuse `FeelNoPainRolled`.

### 2.4 `hooks.ts` (additive)

| Item | Change |
|---|---|
| `CodeHook` | `+ activate?: { canUse(state, unitId, use): boolean; targets?(state, unitId): UnitId[]; modes?: { id: string; label: string }[]; resolve(ctx, use: AbilityUse): void }` — the contract `abilities.ts` calls (PORT-0.7) |
| `AbilityUse` (new) | `{ abilityId; unitId; player; targetUnitIds: UnitId[]; modeId: string \| null; roll: DiceRoll \| null }` |
| `EligibilityHookContext.check` | `+ 'contest'` (IJZ-5.4.1), `+ 'strikeFirst'` (alias of `fightFirst` for new data) |
| `HookName` | `+ 'onAbilityDeclared'` (reaction trigger, P1) |

### 2.5 `rng.ts`, `decider.ts`, `index.ts`

`rng.ts`: P2 `shuffle<T>(rng, items: T[]): T[]` (Fisher–Yates, one `next()` per swap) for card decks (SPH-3.6). `decider.ts`:
unchanged. `index.ts`: see §1.1.

### 2.6 `docs/spec/00-architecture.md` edits (WP1)

| § | Edit |
|---|---|
| §2 | Specs list: 10-rules-core, 11-spearhead, 13-engine-port-plan; checklist ids = spec rule ids (PORT-0.9) |
| §3 | `chooseOption` topic list += §2.1 topics; reaction/ability windows: **active player first, always** (CORE-3.2), delete the defender-first rule for targeted windows; `allocateAttack` and `consolidate` are never raised |
| §4 | Replace the table: drop `command.battleShock`, `movement.moveStarted`, `charge.declared`, `charge.moveStarted`, `charge.moveEnded`, `fight.beforeConsolidate` (kept in the type, never opened); `command.*` = hero phase; add `turn.start` (active, then opponent; Start of Turn abilities) and the four `turn.end.*` windows of PORT-0.8 replacing `turn.end`; `round.start` after priority roll/underdog; `battle.end` after round 4; `any.rollMade` only for re-roll abilities (no Command Re-roll; P1 Glimmering). Every row's order = active first |
| §5 | Events table += §2.3; command family (`CpChanged`, `BattleShock*`) marked "not emitted" |
| §7 | Board 30" × 22" (x ∈ [−15,15], z ∈ [−11,11]); combat range = 3" horizontal, unlimited vertical; coherency ½" horizontal; objectives are circles of radius 3" contested by base overlap; ids for the alias table PORT-0.3 |
| §10 | Add the alias table PORT-0.3 and PORT-0.1 (additive contracts) as settled items |

## 3. Data schema changes (`src/data/types.ts` + `src/data/schema/*.json`)

`src/data/types.ts` is part of the contract (WP1). Schemas, loaders and JSON belong to WP2. Schemas must accept the
40k data until WP8 deletes it.

### 3.1 Warscrolls (`DatasheetData`)

```ts
interface Stats { M: number; W: number /*Health*/; Sv: RollTarget /*Save*/; OC: number /*Control*/;
                  T?: number; Ld?: RollTarget;          // 40k only, optional now
                  ward?: RollTarget; noSave?: boolean }  // AoS: Ward (N+); Save '-' = noSave (CORE-11.7 [interp])
interface DatasheetData { …; spearhead?: boolean; points?: …(optional) }
```
Keywords are printed keywords (`HERO`, `INFANTRY`, `CAVALRY`, `WAR MACHINE`, `BRUTE`, `REINFORCEMENTS`, `FLY`). Faction
keywords go in `factionKeywords` for display only. Abilities that name a unit match on **datasheet id**, never a keyword
(Cities issue). Base sizes are the assumed standard ones from the faction specs.

### 3.2 Weapons (`WeaponData`)

`+ wound?: RollTarget; rend?: number` (required by the schema when the datasheet has `spearhead: true`), `S`, `AP`
optional, `skill` = Hit, `range` 0 for melee. `WeaponAbilityName +=` `'CRIT_2_HITS' | 'CRIT_AUTO_WOUND' | 'CRIT_MORTAL'
| 'CHARGE_DAMAGE' | 'COMPANION' | 'SHOOT_IN_COMBAT'`. `'ANTI'` is reused as **+1 Rend** with `keyword`; Anti-charge uses
`keyword: '@charged'` (target charged this turn).

### 3.3 Abilities (`AbilityDescriptor`), regiment abilities, enhancements, spells/prayers

```ts
type AbilityTiming =
  | { kind: 'passive' }
  | { kind: 'phase'; phase: 'command' | 'movement' | 'shooting' | 'charge' | 'fight'; whose: 'your' | 'enemy' | 'any' }
  | { kind: 'startOfTurn' | 'endOfTurn' | 'startOfRound' | 'endOfRound' | 'deployment'; whose: 'your' | 'enemy' | 'any' }
  | { kind: 'reaction'; trigger: 'youDeclared' | 'opponentDeclaredAttack'; abilityId?: Id }        // P1
interface AbilityDescriptor { …;
  timing?: AbilityTiming;                       // absent = legacy 40k trigger-driven descriptor
  keywords?: ('CORE' | 'ATTACK' | 'MOVE' | 'RUN' | 'CHARGE' | 'SPELL' | 'PRAYER' | 'UNLIMITED')[];
  declare?: TargetSpec[];                       // picked at Declare; code hook may refine
  roll?: { dice: DiceExpr; succeedOn: RollTarget };   // e.g. Decisive Commander D6 2+
  modes?: { id: Id; name: string; text: string }[];    // "choose one" effects
  fromRound?: number;                           // Ere We Go (3)
  castingValue?: number; chantingValue?: number }       // spells/prayers, P2 (no caster in either army)
Limit += 'oncePerTurnArmy'
Trigger += 'activated'                          // descriptor is run by abilities.ts, not the hook dispatcher
```
* **Battle traits**: ability ids listed on the army (§3.4), attached to every unit (scope as the descriptor says).
* **Regiment abilities**: ability ids, two per army; the chosen one is attached player-wide (`Player.regimentAbilityId`).
* **Enhancements**: `EnhancementData` unchanged (`cost: 0`, `restriction: {}`), `effect` = ability ref with `scope.who: 'bearer'`.
* **Spells/prayers** (P2): same descriptor with `keywords: ['SPELL'|'PRAYER']` + `castingValue`/`chantingValue`;
  `DatasheetData.wizard?: number`, `priest?: number` (power level). No engine work today.

### 3.4 Spearhead army = extended `CombatPatrolData` (PORT-0.3)

```ts
interface CombatPatrolData { …; mode?: 'spearhead'; battleTraits?: Id[];
  regimentAbilities?: { id: Id; default: boolean }[] }      // exactly 2 when mode = 'spearhead'
interface PatrolUnitData { …; reserve?: { ability: Id }; tokens?: Record<string, number> }
```
Mapping from SPH-16.4: `general` → `warlord`, `units[].models` → `size`, `enhancements` → `enhancements[{id, default}]`
(exactly 4), `stratagems: []`, `secondaries: []`. Validation (tools/validate-data): 2 regiment abilities, 4 enhancements,
warlord in units, every datasheet `spearhead: true`. P0 defaults (implemented in WP7): Cities regiment *For Sigmar,
Charge!*, enhancement *Heirloom Blade*; Ironjawz regiment *Natural Disaster*, enhancement *Armour of Gork*.

### 3.5 Battleplan = `MissionData` with `format: 'spearhead'`

`format += 'spearhead'`, `objectives[] += radius?: number; name?: string`, `+ territories?: { A: Polygon; B: Polygon }`
(friendly-territory tests), `deploymentZones` = the SPH-7.2 deploy area (territory minus the 6" strip), `objectiveRange: 0`,
`objectiveMarkerRadius: 3`, `rounds: 4`, `firstTurn: 'attackerChoice'`, `scoring` = three `ScoringRule`s with
`rule: 'custom'`, `code: 'sph.vp.holdOne' | 'sph.vp.holdTwo' | 'sph.vp.holdMore'`, `when: 'turn.end'`, `who: 'active'`.
P0 file: `src/data/missions/sph-fire-and-jade-aqshy-horizontal.json` (SPH-14.2/14.3 Aqshy coordinates). Diagonal map
and Ghyran side are P1/P2. The full `RealmBattlefield` record (SPH-16.1) is P2.

### 3.6 Terrain

P0 file `src/data/terrain/sph-fire-and-jade-standard.json` = SPH-14.4 layout. Large *Ruined Domicile* → `kind: 'ruin'`,
5×3 footprint, two 4"-tall walls, `traits: ['cover','obscuring','unstable']`, no floors. Small *Ravaged Shrine* →
`kind: 'crate'`, 3×2, height 2, `traits: ['cover','unstable']`. Board `{ w: 30, h: 22 }`. No new `TerrainKind`.

### 3.7 Twist and battle tactic cards (F4, shipped)

Bucket `DataBundle.cardDecks?: Record<RbfId, CardDeckData>` (`src/data/types.ts`): one file per realm battlefield under
`src/data/cards/` (`fire-and-jade.json`: 12 twists, 6 per side, and the 12 battle tactics), schema
`card-deck.schema.json`. Text is our own words; the engine implements each card by id in `src/engine/cards.ts` (a test,
CARD-018, keeps names in step). Card effects in force live in `GameState.cards.flags` and are read through
`src/engine/cardFlags.ts` by attack.ts (hit / wound / save / rend / ward / Charge damage), objectives.ts (Ring of Fire),
hooks-impl `statFor` (Move halved, Control bonus), charge.ts (one fewer die) and movement.ts (Retreat damage waived).
Decision topics `twistPick`, `discardTactics`, `scoreTactics`, `tacticCommand` are answered by `cards.ts`
(`cardHandler`, routed in reducer `ownerOf`). Commands are offered by `commandWindow` (Hero / Movement / Charge / Combat
phases) and `reactionWindow` (from `ctx.window`: targets declared, charge and retreat rolls). Counter-Charge reuses the
charge module's drive loop (`ChargeState.heroic = true`). Deviations kept on purpose: tactics are scored through a
decision (the owner may decline); "Any ... phase" commands may be used in either turn; Raze counts a unit with any model in
enemy territory within 3" of a long edge; Redeploy offers short slides that do not end in combat (the path is not tested).

### 3.8 F6 engine-core: generic mechanisms for Slaves to Darkness and Fyreslayers (additive)

Contract edits (all additive): `types.ts` `TacticPiles` `+ oath?: Id | null` and `+ fulfilled?: Id[]`; `ChooseOptionTopic`
`+ 'extraTactic' | 'bottomTactic'`. `hooks.ts` `EFFECT_HOOKS` `+ noRetreatDamage: []` (read directly). Data:
`Effect.noRetreatDamage?: true`, `Scope.wholly?: true` (types + `common.schema.json`). Non-frozen: `EngineCodeHook`
`+ onOwnModelSlain`, `+ extraTacticDraw`; `adjustFeelNoPain` is now asked by the AoS ward roll.

| Mechanism | Where | For |
|---|---|---|
| Oath / fulfilled piles: `setOath`, `oathOf`, `clearOath`, `fulfilledOf`; a scored oath goes to `fulfilled` (and stays on `scored`), its command stays offered, used = discarded; oath shown in the opponent's view; lapses at end of turn | `cards.ts` | STD-BT-1 |
| Extra draw: `EngineCodeHook.extraTacticDraw(state, entry, player)`; after the draw step, `extraTactic` (draw / pass) then `bottomTactic` (put back) | `cards.ts` | STD-ENH-4 |
| `Effect.noRetreatDamage` on an active effect waives Retreat damage (`unitIgnoresRetreatDamage`) | `phases/movement.ts` | STD-RA-2 |
| `EngineCodeHook.onOwnModelSlain(ctx, { ability, unitId, model, by })` fires for the slain model's unit, last model included; `deferMortalAfterFight` holds mortal damage, `drainAfterFightMortal` lands it when the Fight activation ends | `attack.ts`, `phases/fight.ts` | STD-AB-4 |
| Ability re-rolls of a short charge roll / a run roll below 4: declarative `reroll` at `onChargeRoll` / `onAdvanceRoll` or a `produce` there (`applyAbilityRerolls`) | `rerolls.ts`, `charge.ts`, `movement.ts` | STD-ENH-3, STD-AB-2 |
| `Scope.wholly`: friendly / enemy auras with `within` count a unit only when every model is wholly within (`unitWhollyWithin`) | `hooks-impl.ts`, `effects.ts` | FYR-AB-1, FYR-AB-2 |
| Code-hook Ward for a unit no scope names: `adjustFeelNoPain` asked for every source; best ward wins | `attack.ts` | FYR-AB-3 |
| Redeploy: `requestRedeploy(state, { abilityId, player, unitIds, minEnemyDistance, markSetUp? })`; the ability loop asks one `abilityMode` (data.redeploy) per unit, spots validated by `resolveSetUp` (the reserve-arrival validator) | `redeploy.ts`, `abilities.ts`, `phases/movement.ts` | FYR-RA-1 |
| Opponent's hero phase window: already in `phases/command.ts` (`timing { kind: 'phase', phase: 'command', whose: 'any' }`) | — | FYR-AB-2 |
| Sim pairs every Spearhead army in the bundle (`simPairings`, `--armies a,b`); the start screen already lists armies from data | `tools/sim-core.ts` | any vs any |

## 4. Client impact

### 4.1 Counts

62 of 170 files in `src/client` import from the engine or data (51 from engine, 22 from data); 120 distinct
(module, symbol) pairs. `src/ai` (5 files) imports engine internals including `judgement` and `stratagems`. With
PORT-0.1/0.4 the engine keeps every symbol the client imports except the deleted 40k helpers, so compile breaks are
limited to the files below; everything else breaks only in labels and behaviour.

### 4.2 Exports the engine must keep (WP1/4/5 own them)

`DEFAULT_SERVICES`, `DEFAULT_MODULES`, `createGame`, `step`, `legalActions`, `validate`, `view`, `save`, `load`,
`advanceGame`, `createContext`, `createGameState`, `hashState`, `registerDataBundle`, `ENGINE_VERSION`,
`deploymentZone`, `modelStats`, `unitModels`, `enemyModelsOnBoard`, `removeModel`, `setModelPos`, `otherPlayer`,
all geometry helpers, `OBJECTIVE_MARKER_RADIUS`, `OBJECTIVE_RANGE`, `withinObjectiveRange`, `diceExprMean`,
`woundRollNeeded`, `neededChargeDistance`, `fightModule`, `fightingModelIds`, `repairCoherency`, `overwatchTargets`
(stub), `firingDeckValue` (stub), `isBigGunsUnit` (stub), `targetLegality`, `deployFacing`, `deployTerrainBlock`,
`terrainService`, `transportService`, `leaderService`.

### 4.3 Minimum client changes for a playable build (WP6)

| Area | Files | Change |
|---|---|---|
| Deleted-helper imports (compile) | `App.tsx`, `Scene.tsx`, `interaction/index.ts`, `interaction/CultAmbushMarkers.tsx` (delete), `interaction/shootPlan.ts`, `ui/fate.ts` (delete), `ui/judgement.ts` (delete), `ui/overwatchInfo.ts`, `ui/eventSummary.ts`, `ui/DecisionPrompt.tsx`, `ui/Hud.tsx`, `ui/UnitCard.tsx`, `ui/StartScreen.tsx`, `ui/labels.ts` | remove teleport / miracle / judgement / cult-ambush / overwatch paths |
| Start screen | `ui/StartScreen.tsx`, `store/game.ts` | army picker = existing patrol picker filtered to `mode: 'spearhead'`; secondary picker becomes the regiment-ability picker (writes `PlayerSetup.regimentAbilityId`); enhancement picker kept; mission fixed to `sph-fire-and-jade-aqshy-horizontal`, layout `sph-fire-and-jade-standard`; hotseat default |
| Labels (PORT-0.3) | `ui/labels.ts`, `ui/PhaseBanner.tsx`, `ui/DecisionPrompt.tsx` (`CHOOSE_OPTION_INFO` for new topics), `ui/eventSummary.ts`, `ui/rerollInfo.ts` | Hero/Combat phases, Run/Retreat, Ward, priority roll, ability-use prompts |
| Stat and weapon display | `ui/UnitCard.tsx`, `ui/UnitDatasheet.tsx`, `ui/UnitCardTooltip.tsx`, `ui/WeaponPanel.tsx`, `ui/compactSheets.ts`, `ui/weaponRules.ts` | Move/Health/Save/Control/Ward; Atk/Hit/Wound/Rend/Dmg; AoS weapon ability names |
| Hide 40k UI | `ui/Hud.tsx`, `ui/StratagemPanel.tsx`, `ui/MissionPanel.tsx` | hide CP, stratagems, battle-shock, secondaries; MissionPanel shows round x/4, VP, underdog |
| Objectives | `board/Objectives.tsx`, `board/objectiveZone.ts` | draw a 3"-radius circle per objective (already data-driven; check visuals) |
| Board | `board/Board.tsx`, `board/Lighting.tsx` | 30×22 board from `state.board`; remove the hard-coded 44 in lighting/texture framing |
| Formations | `interaction/formations.ts`, `interaction/formationValidation.ts` | ½" coherency spacing |
| AI (compile + bot) | `src/ai/utility.ts`, `src/ai/expected.ts`, `src/ai/stratagems.ts` | drop `judgement`; expected damage from `wound`/`rend`/`ward`; `stratagems.ts` → always pass. Hotseat does not need the bot to be good |

Figures: data uses existing 42k kits as placeholders (cannon → artillery body, cavalry → nearest mounted/monster kit,
infantry → biped kits). MGSD figures are F6.

## 5. Work packages (Sonnet implementers, lean mode)

Waves run in order; inside a wave packages run in parallel and own disjoint files. A file passes to the next
wave's owner only after the earlier wave is committed. "Tests" = new test files named with the rule ids listed, plus
`npm run typecheck`. Existing 42k tests are not run until WP8 deletes them (they will fail by design).

### Wave 1

**WP1 — Contracts, core loop, fixtures** (session model writes the contract part, Sonnet the rest)
* Owns: `src/engine/{types,actions,events,hooks,rng,decider,index,modules,version,state,reducer,geometry,hooks-impl}.ts`,
  `src/data/types.ts`, new stubs `src/engine/abilities.ts`, `src/engine/factions/{cities,ironjawz}.ts`,
  `src/engine/phases/README.md`, `docs/spec/00-architecture.md`, `tests/fixtures/*`,
  `tests/engine/{aos-core,aos-geometry}.test.ts`.
* Done: §2 contract edits and §2.6 doc edits; reducer runs a 4-round Spearhead game with ping phase modules on the
  checklist fixtures (Guard, Brute, Boss, Knight, Cannon, Hawk); `abilities.ts` exports its interface with a no-op body;
  every export in §4.2 still exists; typecheck clean (42k tests excluded).
* Tests, P0 rows: CORE-001, CORE-025, CORE-029, MEAS-001, MEAS-017, ROUND-001, ROUND-002, ROUND-004, ROUND-005,
  ROUND-015, ROUND-017, CARD-005. Then, if cheap: the untagged ROUND rows for underdog/seize (SPH-8.4/8.5), MEAS
  coherency rows (MEAS-012–016).

### Wave 2 (6 parallel agents)

**WP2 — Data: two armies, battleplan, terrain**
* Owns: `src/data/{index,paths,README}.ts|md`, `src/data/schema/*`, `docs/spec/schemas/*`, `docs/spec/20-data-schema.md`,
  `tools/validate-data.ts`, new `src/data/factions/{cities,ironjawz}/**`, `src/data/missions/sph-*.json`,
  `src/data/terrain/sph-*.json`, `tests/data/spearhead.test.ts`.
* Done: §3 schemas (accepting 42k data too); Castelite Company and Bigmob entered from the faction specs (all
  abilities, enhancements, both regiment abilities, Brutes `reserve`, cannon `profileGroup`); Fire and Jade Aqshy
  horizontal mission; standard layout; `npm run validate:data` green; 20-data-schema rewritten to match §3.
* Tests: no P0 checklist row; `tests/data/spearhead.test.ts` covers SPH-2.3, SPH-2.4, SPH-13.7 (army validation) and
  SPH-009 (standard layout legal, run against the layout file with a pure SPH-5.2 checker local to the test).

**WP3 — Pre-battle, hero phase, abilities, control and scoring**
* Owns: `src/engine/{setup,objectives,missions,abilities}.ts`, `src/engine/phases/command.ts`,
  `tests/engine/{sph-setup,sph-scoring,abilities}.test.ts`.
* Done: §1 rows for these files; a game starts with roll-off, attacker deploys all, defender deploys all, then hands
  over to the reducer's round start; `abilities.runWindow` works for hero, start/end of turn and any phase the phase modules call it from;
  VP scored at end of own turn.
* Tests, P0 rows: SPH-002, SPH-010, SPH-011, OBJ-001, OBJ-002, OBJ-006, SPH-021. Then the CMD rows for the ability
  loop and Rule of One (CORE-3.3/3.4/3.10/3.13) and OBJ-003/OBJ-005.

**WP4 — Movement, charge, terrain, visibility**
* Owns: `src/engine/phases/{movement,charge,legal}.ts`, `src/engine/{terrain,los}.ts`,
  `tests/engine/{aos-movement,aos-charge,aos-terrain}.test.ts`.
* Done: §1 rows; reserve arrival step generic from data params; `los` exposes `coverPenalty(state, attackerUnit,
  targetUnit)` and `obscured(...)` for WP5.
* Tests, P0 rows: MEAS-009, TERR-001, MOVE-001, MOVE-002, MOVE-005, MOVE-006, CHARGE-001, CHARGE-003. Then MOVE-003/004,
  the TERR rows for Cover/Obscuring/Unstable (CORE-16.4–16.7), and IJZ-2.1 reserve arrival on a fixture unit.

**WP5 — Attack sequence, shooting, combat**
* Owns: `src/engine/{attack,weapons,dice}.ts`, `src/engine/phases/{shooting,fight,fightEligibility}.ts`,
  `tests/engine/{aos-attack,aos-shooting,aos-combat}.test.ts`.
* Done: §1 rows; shooting and combat resolve against fixtures with damage spill-over and ward; Strike-first order.
  Calls `los.coverPenalty/obscured` through the `LosService` interface (stub-safe if WP4 is not merged yet).
* Tests, P0 rows: SHOOT-002, SHOOT-008, SHOOT-010, SHOOT-011, SHOOT-016, SHOOT-019, DMG-001, DMG-006, DMG-010,
  FIGHT-002, FIGHT-003, FIGHT-006, MOVE-018 (pile-in lives in fight.ts). Then the WEAP rows these armies use
  (Anti-charge, Charge (+1 Damage), Companion, Shoot in Combat), Guarded Hero, Strike-first, ward. P1: crit
  abilities, Strike-last.

**WP6 — Client and AI**
* Owns: `src/client/**`, `src/ai/**`, `tests/client/spearhead-*.test.ts`, `tests/ai/*` (may delete 42k-only ones).
* Done: §4.3; `npm run dev` shows the start screen with the two armies; no imports of the helpers deleted in WP8;
  `tests/client/noNativeTooltips.test.ts` passes.
* Tests (P0): a label test for PORT-0.3 (`spearhead-labels.test.ts`), `noNativeTooltips`.

**WP7 — Faction code hooks**
* Owns: `src/engine/factions/{cities,ironjawz}.ts`, `src/engine/code-hooks.ts`,
  `tests/engine/{cities,ironjawz}.test.ts`.
* Done: P0 abilities work through `abilities.ts` / hook points, tested on fixture units with the spec's numbers (real
  data is checked in WP8). P1 abilities are registered with `canUse → false` so picking them is harmless.
* Tests (P0): CITIES-RA-1, CITIES-AB-1 (*Yield No Quarter*; *On Your Feet!* with auto placement), CITIES-AB-3,
  CITIES-AB-4 (Cannonball blocked after a Move ability), Heirloom Blade, Flask of Lethisian Darkwater; IJZ-3.1, IJZ-4.1,
  IJZ-4.2, IJZ-4.3, IJZ-4.4, IJZ-5.1.1, IJZ-5.2.1, IJZ-5.3.1, IJZ-5.4.1.

### Wave 3

**WP8 — Cleanup and integration gate**
* Owns: deletion of the files marked *delete* in §1, `src/data/factions/<40k>/**`, `src/data/missions/cp-*.json`,
  `src/data/terrain/cp-*.json`, `src/data/core/stratagems.json` (→ `[]`), every 42k test under `tests/engine`,
  `tests/client`, `tests/e2e`, `tools/{sim,sim-core,ai-bench,balance-report,deploy-probe,spike-incursion}.ts`, new
  `tests/e2e/spearhead-hotseat.spec.ts`, `tests/engine/fullgame.test.ts`.
* Done: `npm run typecheck`, `npm test`, `npm run validate:data` green; `npm run sim` plays Cities vs Ironjawz to
  `GameEnded` with random deciders for 100 seeds (SIM-001); Playwright hotseat playthrough (both sides driven, deploy → round 4 →
  end screen) with screenshots; commit + push to `main` for Pages.
* Tests, P0 rows: SIM-001, plus a full-game smoke (`fullgame.test.ts`) and the hotseat E2E. Re-run every P0 row: all
  41 must pass.

### Later (not today)

| Id | Scope | Priority |
|---|---|---|
| L1 | Call for Reinforcements (SPH-12, CORE-6.16), Mighty Destroyers + A Proper Ruckus (IJZ-2.2/3.2, needs `onAbilityDeclared` reactions), Ironweld Discipline (CITIES-RA-2), Consecrate the Land, Brazier, Glimmering, CORE-17.3 choice, Strike-last, crit abilities, jump-down, client UI for the SPH-4 decisions beyond pre-fill (drag-to-place terrain), diagonal map | P1 |
| L2 | Spells, prayers, Wizard/Priest power level (CORE-15, SPH-13.2) for later armies; Fly (CORE-6.10) | P2 |
| L3 | Twist and battle tactic cards (SPH-3, 9, 10), Officer's Order (CITIES-BT-1), tokens (SPH-2.7), `rng.shuffle`, full `RealmBattlefield` data, Ghyran side; renames from PORT-0.3 | P2, blocked on card source |
