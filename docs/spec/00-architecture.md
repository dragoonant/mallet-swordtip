# 00 — Architecture

Source of truth for module boundaries, the engine contract, the decision model and determinism.
Rules content (Age of Sigmar 4 Spearhead port): `10-rules-core.md` (CORE-x.y), `11-spearhead.md` (SPH-x.y), the faction
specs in `factions/`, and `13-engine-port-plan.md` (how the inherited 40k engine is turned into the Spearhead engine:
PORT-0.x decisions, alias table, work packages). Test checklist: `12-rules-test-checklist.md`; checklist ids are the
spec rule ids (PORT-0.9) and every engine test is named with one (`it('ROUND-004 …')`). Data shapes in 20; figures 30;
AI 40; client 50; testing 60. `src/engine/types.ts` is the code form of §3–§7 and must not diverge from this file.
**Contracts change additively during the port (PORT-0.1):** no member of a frozen union/interface is removed or
renamed; new members are optional or new union literals; removals happen in the cleanup package (WP8).

## 1. Modules

| Module | Path | May import | Must not | Runtime |
|---|---|---|---|---|
| engine | `src/engine/` | nothing outside itself (+ JSON types from `src/data/types`) | DOM, React, Three, timers, `Math.random`, `Date` | node + browser |
| data | `src/data/` | schemas only | code with side effects | build-time JSON, validated by `tools/validate-data` |
| ai | `src/ai/` | engine (read-only API), data | client, Three | node + worker |
| client | `src/client/` | engine, ai, data, assets | mutate `GameState` | browser |
| assets | `src/assets/` | Three | engine, ai | browser |
| tools | `tools/` | anything (node scripts) | be imported by src | node |
| tests | `tests/` | everything | — | vitest / playwright |

Path aliases: `@engine/*`, `@ai/*`, `@data/*`, `@client/*`, `@assets/*`. Enforced by an eslint `no-restricted-imports` rule per module (checked in CI).

Dependency direction: `data ← engine ← ai ← client`, `assets ← client`. Engine and ai are headless and run unchanged in the headless simulator (`npm run sim`) and in a web worker.

## 2. Engine contract

Spearhead additions to the contract (13-port-plan §2, all additive): `GameSetup.mode?: 'spearhead'` (absent = spearhead
from now on) and the pre-fills `side?: 'aqshy' | 'ghyran'`, `deploymentMap?`, `defenderTerritory?: 'A' | 'B'`
(terrain pre-fill = `terrainLayoutId`; a pre-filled field skips its SPH-4 decision). `GameSetup.firstTurn` = a PlayerId
pre-fills the round-1 first-turn choice; `'rollOff'` makes the reducer ask the attacker. `PlayerSetup.regimentAbilityId?`
(absent = the army's default regiment ability); `secondaryId`, `attachments`, `reserves`, `battleReadyVp` are optional
(40k only). `createGame` attaches the army's `battleTraits` (source `'battleTrait'`) and the regiment ability (source
`'regiment'`, `Player.regimentAbilityId`) and hook-dispatches both on every unit of the army; the enhancement goes on
the general (= warlord); units with `PatrolUnitData.reserve` start in reserve with `Unit.reserveArrival` set.
`ENGINE_VERSION` is 2.0.0 (42k saves are refused).

```ts
step(state: GameState, action: Action, rng?: Rng): StepResult
interface StepResult {
  state: GameState;              // new state, or the SAME reference when rejected
  events: GameEvent[];           // ordered; empty except [ActionRejected] when rejected
  pending: PendingDecision | null; // what must happen next; null only when phase === 'ended'
  rejection?: Rejection;         // present iff the action was illegal
}
```

| Function | Purpose |
|---|---|
| `createGame(setup: GameSetup, seed: string, bundle?: DataBundle): StepResult` | builds initial state; first `pending` is a deployment decision. The engine never imports data: `bundle` (or one registered once via `registerDataBundle`) supplies it; `replay`/`load` take the same optional argument. Validates the setup (patrol/enhancement/secondary ids, `attachments`, `enhancementChoice.unitRef` present iff the enhancement data has `choice`, keyword matches, same player) and throws `EngineInvariantError` on failure — setup comes from the UI/sim, not from a Decider. Contract additions (Astra Militarum, additive, optional): `PlayerSetup.splitUnits?: string[]` — patrol unit refs the player splits into Patrol Squads; each must name a datasheet with `patrolSquads: { unitSizes }` (sizes sum to the unit size), must not be attached or start in Reserves, otherwise setup fails. The first part keeps id `${player}:${ref}`, further parts get ref `${ref}-${k}` (k = 2, 3, …), each its own unit with `startingStrength` = its size. Grey Knights (additive, optional): `PlayerSetup.unitChoices?: Record<string, string>` — group id → chosen unit ref for the patrol's `unitChoices` groups (an omitted group takes its `default`); an unknown group id or a ref outside the group throws `EngineInvariantError`; unchosen refs are never created and attachments / reserves naming them are dropped (docs/spec/factions/grey-knights.md E1). Transports (Sudden Dawn Cadre, additive, optional): `PlayerSetup.embarked?: { unitRef, transportRef }[]` - units that start the battle embarked in a friendly Transport (the datasheet must carry `transport`; `unitRef` may be a Patrol Squads part ref); createGame throws `EngineInvariantError` when a ref is unknown, the transport has no `transport` data, the unit is attached or in Reserves, or `transportService.canCarry` fails (keyword gates / capacity in models). Embarked units are never offered a deployment drop, are not culled while their transport is on the battlefield, and `RuntimeDatasheet.transport?` mirrors `DatasheetData.transport`. Movement phase: `disembarkCandidates` are appended to the `chooseUnitToActivate` options (choosing one raises a `deployUnit` decision around `transportService.disembarkZone`, `pass` declines), and `offerEmbark` raises a `chooseOption` (`topic: 'other'`, `data.kind: 'embark'`, options `embark:<transportId>` / `stay`) after a Normal / Advance / Fall Back move; a destroyed Transport's passengers disembark via `transportService.emergencyDisembark` after Deadly Demise (R-5.20). `RuntimeModelProfile.keywords?: string[]` carries per-model keywords (`Composition.keywords`); `keywordsOf` is the union over a unit's living models. |
| `step(state, action, rng?)` | pure reducer; never throws for illegal actions (see §8); throws only on programmer error (corrupt state). The RNG is restored from `state.rng`; `rng` is an optional test override (§6) |
| `legalActions(state, pending): Action[] \| null` | enumerates answers when `pending.options` is finite; `null` for continuous decisions (moves) |
| `validate(state, action): Rejection \| null` | same checks `step` performs, no mutation |
| `replay(setup, seed, actions: Action[]): StepResult` | folds `step` from `createGame`; used by load, undo, multiplayer sync, tests |
| `view(state, player): PlayerView` | redacts hidden info (opponent reserves, unrevealed stratagem intent); Deciders only ever see a `PlayerView` |

Rules of the reducer:
1. `state` is immutable; `step` returns structurally new objects (Immer or hand-written spreads; no in-place mutation).
2. No I/O, no clock, no `Math.random`. All randomness through the `Rng` restored from `state.rng` (or the override).
3. One action → zero or more events → exactly one new `pending`. The engine never waits; it *describes* what it needs.
4. Every rule effect emits an event. The client and the AI rebuild everything they show or score from events + state; they never infer from diffs.

## 3. Decision model

The engine never blocks. Whenever the rules need a choice it returns a `PendingDecision`; the next `Action` must answer it (`action.decisionId === pending.id`) or be rejected with `E_WRONG_DECISION`.

```ts
interface PendingDecision {
  id: string;                 // "d:<monotonic int>" unique for the game
  player: PlayerId;           // who must answer ('A' | 'B')
  kind: DecisionKind;         // see table
  window: TimingWindowId;     // where in the sequence (§4)
  context: DecisionContext;   // unit/weapon/target ids relevant to the choice
  options?: DecisionOption[]; // finite legal choices, each with a ready-made Action
  constraints?: MoveConstraints; // continuous decisions: max distance, forbidden regions, coherency; optional `mustTouch` { pos, radius } (Genestealer Cults Cult Ambush return: at least one placed base within 0.05" of that circle, else E_NOT_AN_OPTION; `emptyMoveConstraints` sets it null)
  canPass: boolean;           // whether { type:'pass' } is a legal answer
  deadlineHint?: number;      // ms; advisory for AI/timeouts, engine ignores
}
```

| DecisionKind | Answered by | Typical payload |
|---|---|---|
| `deployUnit` | active player | unit id, model positions |
| `chooseUnitToActivate` | active | unit id or pass (movement, shooting, charge, fight) |
| `declareMove` | active | move type (normal/advance/fallBack/stationary) for the activated unit; the Advance die is rolled on accept; then window `movement.moveStarted` opens |
| `moveUnit` | active | model positions for the declared move type |
| `declareTargets` | active | per-weapon target unit ids |
| `allocateAttack` | defender | 40k only — **never raised** in Spearhead (damage is allocated automatically, CORE-13.4) |
| `declareCharge` | active | charging unit, target unit ids |
| `chargeMove` | active | model positions after successful roll |
| `pileIn` / `consolidate` | fighting player | model positions (`consolidate` is **never raised** in Spearhead) |
| `chooseFightUnit` | alternating | unit id |
| `stratagemWindow` | the player the window is offered to | stratagem id + targets, or pass |
| `reactionWindow` | reacting player | Fire Overwatch / Heroic Intervention / Rapid Ingress / Counter-offensive as `useStratagem` actions, or pass (10-rules R-11.5) |
| `chooseOption` | any | generic enumerated choice (side, oath target, Waaagh!, `rerollOffer` per 10-rules R-6.24, mission picks, …). Spearhead topics (13-port-plan §2.1): `chooseAttacker`, `armyOptions`, `battlefieldSide`, `deploymentMap`, `placeTerrain` (SPH-4, setup module), `firstTurn` (round 1: the attacker picks who goes first) and `priorityChoice` (rounds 2+: the priority-roll winner, on a tie the previous first player) — both answered by the reducer core, options `'A'` / `'B'` = the player who takes the first turn —, `abilityUse` / `abilityTarget` / `abilityMode` (activated abilities, `abilities.ts`), `pileInTarget`, `contestedObjective`, `discardTactics`, `scoreTactics` (last three P1/P2) |
| `commandReroll` | either | use CP reroll on the roll just made, or pass |
| `confirm` | any | acknowledge (battle-shock result, end of game) — `options` = [ok] |

A `chooseOption` decision's `context.data` is an open record; the keys each topic carries are
documented beside `ChooseOptionDecision` in `src/engine/types.ts`. Two topics put numbers there that
the player cannot work out from the visible state:

- `rerollOffer` — `{ rollId, dieIndexes, needed?, purpose?, key? }` (10-rules R-6.24). `dieIndexes` are the dice of that
  roll the ability may still re-roll (never one already re-rolled); `needed` is the d6 each die has to reach and `purpose`
  is `'hit' | 'wound'` (both present on attack rolls; the charge offer carries only `rollId`/`dieIndexes`, whole-roll).
  Options are `reroll` and `keep`. **M9 (fast-roll):** the `chooseOption` action gains an optional `dieIndexes?: number[]`;
  with `optionId: 'reroll'` it must be a non-empty, duplicate-free subset of the offered `dieIndexes` (anything else is
  rejected `E_NOT_AN_OPTION`), and only those dice are re-rolled; absent = every offered die. There is one offer per
  batch, not one per die.
- `fixRollOffer` (M10, thousand-sons Glimpse of Eternity; `ChooseOptionTopic` gains `'fixRollOffer'`, handler `fixRollHandler` in src/engine/fix-roll.ts registered in `DEFAULT_MODULES.topics`) —
  `{ rollId, purpose, dieIndexes, value, key, offer }`, raised by `fixRollGate` after a hit / wound / save / damage roll (and its
  Command Re-roll window) is final, for the roller of a source whose code hook has `fixRoll`. Options are `fix:<i>` (set die `i`
  to `value`, 3 on a D3; the die is then marked re-rolled and the use is stamped in `secondaryState[usedKey]`) and `keep`.
  `AttackSequenceState.mortalQueue[].by` and `DestroyedBy` gain an optional `psychic` flag (kill attribution for
  `psychicKillThisPhase`, src/engine/attack.ts). A `rerollOffer` may also carry `source` (the `DiceRerolled` source id) and, for a
  defender-side one-die re-roll of a failed save (Weaver of Fates), `purpose: 'save'`.
- `miracleDie` (M10, adepta-sororitas Acts of Faith) — `{ purpose, unitId, count, maxSubstitutions, pool, key }`, raised by
  `miracleGate` (src/engine/miracle.ts) right before a D6 hit / wound / save / damage / charge / advance roll of an
  ADEPTA SORORITAS unit when the owner's pool is non-empty (`key` is the roll's `rollOnce` key; battle-shock tests are not
  offered, see STATUS). Options: `skip` and one `use` per distinct pool value; `use` carries `dieIndexes: [i]` (index into
  `pool`, exactly one). The chosen die replaces the first die of the roll (`RollSpec.substitute`, `DiceRoll.substituted`,
  never re-rollable) and its unit joins `Player.miracle.spentThisPhase` (cleared at every phase end).
- `treasureObjective` (M10) — Treasures of Aeons pick at round 1 start: options are the objective markers with no home owner; the answer stores `secondaryState.treasureObjectiveId`. `abilityChoice` is shared by several code hooks and the raising hook names itself in `context.data.code` (`resonantFocusPick`, `plasmacyteSurge`, `cultAmbush` with `data.step` `'marker'` | `'return'`) so the answer reaches the right handler. Genestealer Cults' Cult Ambush keeps its state in `state.mission.custom.cultAmbush` (src/engine/cult-ambush.ts); a successful return arrives through the movement module as `ReinforcementsArrived` with `via: 'deepStrike'`.
- `saveType` — **retired (M9).** The engine picks the save that needs the lower d6 (tie: armour) and never raises this
  decision. The numbers still exist: `CurrentAttack.saveTargets` (display-only, per-attack saves) and `DiceRoll.needed` (a
  batched save roll carries the d6 its dice have to reach).

**Fast-rolled attack dice (M9).** Attacks that share a target and a weapon profile (consecutive `AttackGroup`s, i.e. several
firing models of one unit; `AttackGroup.runLead`) are resolved in batches: ONE hit `DiceRoll` (count N, per-die
evaluation), automatic ability re-rolls as one `ctx.reroll`, at most one `rerollOffer`, one Command Re-roll window
(`commandReroll` context `{ roll, selectableDice: true }` when N > 1 — the stratagem still re-rolls exactly one die,
`CommandRerollAction.dieIndex`), then the same for the wound dice (over the dice that hit, Lethal Hits auto-wounds excluded,
Sustained Hits bonus hits included). The ability re-roll happens before the Command Re-roll window, so a die an ability already
re-rolled is no longer offered to the stratagem (R-1.6). Saves are one `DiceRoll` per batch when every model the defender
could allocate to saves identically (same d6 target after AP/cover/invuln/modifiers, same Feel No Pain; never with Precision
or an impossible save), applied attack by attack through allocation/damage/FNP — an allocation prompt opens only for a
failed save with a real choice; otherwise the old per-attack save flow runs. Attacks aimed at a target with no models left
are lost (no dice, no windows, no events; Hazardous tests still resolve). Events stay one per die (`HitRolled`,
`WoundRolled`, `SaveRolled`) and now carry the optional `rollId` + `dieIndex` of their die inside the batch `DiceRoll`;
`DiceRerolled.indexes` names the re-rolled dice (`before`/`after` are aligned to it). `DiceRoll.needed` (display only) is the
d6 each die has to reach. New optional state: `AttackGroup.batch`/`runLead`, `CurrentAttack.slot`/`saveDie`.

Stratagem and reaction interrupt windows are ordinary `PendingDecision`s of kind `stratagemWindow`/`reactionWindow` offered to the *reacting* player. The engine opens a window only when the reacting player has ≥1 affordable, legal stratagem for that `TimingWindowId` (or a legal reaction); otherwise it skips the window and emits no decision. This keeps human play snappy and bounds AI decisions.

Window ordering when both players could act in the same window: **active player first, then the opponent, always** (CORE-3.2; a fresh `PendingDecision` each). The 40k defender-first rule for targeted windows is gone: `ctx.order.defensive()` now returns the active-first order. Outside a turn the first-turn player goes first (`round.start`, `battle.end`); `round.end` runs active (= second-turn) player first (SPH-8.7).

**Activated abilities (PORT-0.7).** Every "Your / Enemy / Any <phase>", Start / End of Turn, Start / End of Round and deployment ability is run by one service, `services.abilities` (`src/engine/abilities.ts`): `runWindow(ctx, window, player, key?)` offers `chooseOption` topic `abilityUse` until the player passes, then `abilityTarget` / `abilityMode`, the declared roll, then the code hook's `activate.resolve(ctx, use: AbilityUse)` (`hooks.ts`). Descriptors with `trigger: 'activated'` are never dispatched by the hook service.

### Decider

Human UI and AI implement the same interface:

```ts
interface Decider {
  decide(view: PlayerView, pending: PendingDecision, legal: Action[] | null): Promise<Action>;
  cancel?(): void; // abort an in-flight decision (UI teardown, game reset)
}
```

The game loop (client `GameRunner`, or `tools/sim`) is: `pending = result.pending; action = await deciders[pending.player].decide(...); result = step(state, action, rng)`. Nothing else ever calls `step`. A rejected action is fed back to the same Decider with the `Rejection` attached to the next call (`view.lastRejection`).

## 4. Timing windows

Shared enum used by engine (to open windows), data (stratagem / scoring `when`), AI and UI. Prefix = phase. Internal phase
ids stay 40k (PORT-0.3): `command.*` = **Hero phase**, `fight.*` = **Combat phase**. Every row's order is **active player
first** unless stated. Rows marked *kept* stay in the type but the Spearhead engine never opens them:
`command.battleShock`, `movement.moveStarted`, `charge.declared`, `charge.moveStarted`, `charge.moveEnded`,
`fight.beforeConsolidate`, `turn.end`.

| TimingWindowId | Opened for | Notes |
|---|---|---|
| `deployment.unit` | deploying player | per unit placement |
| `round.start` | first-turn player, then second | SPH-8.2 step ⑤, after the first-turn choice / priority roll, the underdog and the twist draw (empty-deck guard): Start of Battle Round abilities (`abilities.runWindow('startOfRound')`). In round 1 objective control is evaluated once afterwards (CORE-4.13, SPH-6.4) |
| `turn.start` | active, then opponent | Start of Turn (CORE-4.17), before the Hero phase; `abilities.runWindow('startOfTurn')` |
| `command.start` | active, then opponent | start of the Hero phase (no CP gain, no battle-shock) |
| `command.end` | active, then opponent | end of the Hero phase |
| `movement.start` | active, then opponent | |
| `movement.unitMoved` | active, then opponent | after each unit's move |
| `movement.reinforcements` | active, then opponent | after each reserve arrival |
| `movement.end` | active, then opponent | |
| `shooting.start` | active, then opponent | |
| `shooting.unitSelected` | active, then opponent | after a unit is chosen to shoot, before targets are declared |
| `shooting.targetsDeclared` | active, then opponent | after targets declared, before hits are rolled |
| `shooting.attacksResolved` | active, then opponent | after one unit finished shooting |
| `charge.start` | active, then opponent | |
| `charge.rolled` | active | after 2D6, before move (re-rolls) |
| `fight.start` | active, then opponent | |
| `fight.unitSelected` | active, then opponent | before pile-in |
| `fight.targetsDeclared` | active, then opponent | after melee targets declared, before attacks |
| `fight.attacksResolved` | active, then opponent | after one unit fought |
| `attack.modelDestroyed` | active, then opponent | once the damage of the attack that slew a model has resolved |
| `any.unitDestroyed` | active, then opponent | |
| `any.rollMade` | roller | only for re-roll abilities (no Command Re-roll, no CP in Spearhead; P1 Glimmering) |
| `phase.end` | active, then opponent | end of every phase |
| `turn.end.abilities` | active, then opponent | SPH-8.6 ①: End of Turn abilities (`abilities.runWindow('endOfTurn')`) |
| `turn.end.control` | active, then opponent | SPH-8.6 ②: objective control is evaluated (`objectives.evaluateControl(ctx, 'turnEnd')`) just before this window opens |
| `turn.end.scoring` | active, then opponent | SPH-8.6 ③: the active player scores (`missions.onWindow`) |
| `turn.end.afterScoring` | active, then opponent | SPH-8.6 ④: effects timed "after VP are scored" |
| `round.end` | second-turn (active) player, then first | SPH-8.7: End of Battle Round abilities (`abilities.runWindow('endOfRound')`); `untilEndOfRound` effects expire after it |
| `battle.end` | first-turn player, then second | after round 4's `round.end` (the battle never ends early, SPH-11.3); then `GameEnded` |

## 5. Actions and events

Action envelope: `{ type, player, decisionId, seq, payload }`. `seq` is assigned by the engine on accept (= index in the action log). Payload types are per `type`; full list in `src/engine/types.ts`; the set of `type` strings equals the DecisionKind answers plus `pass`, `useStratagem`, `commandReroll`, `resign`. `declareTargets.targets[]` may repeat a (model, weapon) pair with `attacks` to split one melee weapon between units (R-9.7).

Event families (all events carry `seq`, `turn`, `phase`, `player`):

| Family | Events |
|---|---|
| game | `GameCreated`, `RoundStarted`, `RoundEnded`, `TurnStarted`, `PhaseStarted`, `PhaseEnded`, `GameEnded` |
| round start (Spearhead, SPH-8.2–8.5) | `FirstTurnChosen` { first } (every round), `PriorityRolled` { rolls, winner (null on a tie), chooser, firstPlayer, doubleTurn } (rounds 2+, emitted with the choice), `InitiativeSeized` (envelope `player` = the seizer), `UnderdogDetermined` { underdog } |
| damage (AoS, CORE-13) | `DamagePoolResolved` { unitId, points, warded, slain }; ward rolls reuse `FeelNoPainRolled`, returned models reuse `ModelReturned`, activated abilities reuse `AbilityTriggered` |
| reinforcements (P1, SPH-12) | `UnitReplaced` { unitId, replacementOf } |
| command | `CpChanged`, `BattleShockTested`, `BattleShocked`, `BattleShockRecovered` — **not emitted** in Spearhead (no CP, no battle-shock) |
| movement | `MoveDeclared` (moveType), `UnitMoved` (moveType, path per model), `UnitAdvanced` (roll; after any halve/modify effects), `UnitFellBack`, `ReinforcementsArrived` (`via`: `'deepStrike' | 'strategicReserves' | 'rapidIngress' | 'nextWave' | 'teleportAssault'` — additive member `'teleportAssault'` (Grey Knights Teleport Assault arrival: Deep Strike constraints, any round) plus the new event `UnitRemovedFromBattlefield` { unitId, source } (a unit sent to Reserves by an ability; record store in `Player.secondaryState.teleportAssault`, src/engine/teleport.ts); additive member `'nextWave'`: Astra Militarum Send in the Next Wave, a spawned unit set up within 9" of its owner's battlefield edge outside Engagement Range) |
| shooting/fight | `AttackSequenceStarted`, `TargetsDeclared`, `HitRolled`, `WoundRolled`, `SaveRolled`, `DamageApplied`, `FeelNoPainRolled`, `ModelDestroyed`, `UnitDestroyed` (both carry `byUnitId` **and** `byModelId`; null for mortal wounds / culls (Deadly Demise names the exploding model, its unit and owner: `AttackSequenceState.mortalQueue[].by`, RC-072) — Wrath of the Emperor and Bag the Big 'Un key on the model), `AttackSequenceEnded` |
| charge | `ChargeDeclared`, `ChargeRolled`, `ChargeFailed`, `ChargeMoved`, `PiledIn`, `Consolidated` |
| stratagem | `StratagemUsed`, `StratagemWindowOpened`, `StratagemWindowClosed`, `AbilityTriggered` (id, source, effect summary) |
| reanimation (M10, necrons) | `WoundsRegained` { unitId, modelId, amount, source }, `ModelReturned` { unitId, modelId, pos, source } — emitted by Reanimation Protocols (docs/spec/factions/necrons.md NEC-2.2); `Unit.destroyedModels` (snapshot of every removed model, filled by `state.removeModel`) is what a returned model is taken from |
| death blow (M11, tyranids) | `ModelRemovalDeferred` { unitId, modelId, source } — the model is not removed yet (`Model.pendingRemoval` = { byPlayer, byUnitId, byModelId, kind, source }); `ModelDestroyed` / `UnitDestroyed` follow, with the stored attribution, once it has fought or declined (docs/spec/factions/tyranids.md TYR-6.1). Also `RollModifierResult.extraDice` (hooks.ts): extra dice for `onBattleShockTest` (Synapse) |
| miracle / deferred removal (M10, adepta-sororitas) | `MiracleDieGained` { player, value, source }, `MiracleDieSpent` { player, value, mode: 'substitute' | 'discard', unitId, rollId, purpose, source }, `ModelRemovalDeferred` { unitId, modelId, source } — docs/spec/factions/adepta-sororitas.md §7 E1/E4. `Player.miracle` { dice, spentThisPhase } (all players, empty unless the army has Acts of Faith); `Model.removalDeferred` (0 W model kept for A Martyr's Death: excluded from `state.unitModels`, so untargetable, no OC; `unitModelsAll` includes it); `PhaseState.deferredRemovals`; `FightSubStep` gains `'deferred'` (between `attacks` and `consolidate`); `EffectRequest.deferRemoval` (collected from `onModelDestroyed` BEFORE the model is removed); `PlayerSetup.splitUnits` (Patrol Squads, E5: listed patrol refs become their `patrolSquads` parts); `AttackRollHookContext.mortal` (E2) and `RollModifierResult.critWoundAp` (E3) |
| armour-only save modifier (patrol orks--morgrim-s-butchas) | `RollModifierResult.armourOnly?` (hooks.ts): onSaveRoll modifier that applies to an armour save, never an invulnerable save; from data `Effect.modifyRoll.armourOnly`. docs/spec/factions/orks--morgrim-s-butchas.md §7.1 C1 |
| save kind + save re-roll of 1s (patrol dark-angels--the-vengeful-brethren) | `saveKind: 'armour' \| 'invuln'` in the untyped `onSaveRoll` hook `data` record only (hooks.ts is NOT edited): every `onSaveRoll` collect payload from the save stage carries the kind being rolled (absent in the saveSetup pre-pass). `doSaveStage` / `doSaveBatch` auto re-roll every save of 1 (once per roll key, mark `onesSaveDone:<key>`) when a defender-side `onSaveRoll` result is `{ reroll: 'ones' }`, BEFORE `rollOnce` opens the Command Re-roll window (same pattern as rollBatchD6 / the damage roll), so a re-rolled die is never offered a Command Re-roll. docs/spec/factions/dark-angels--the-vengeful-brethren.md §7.1 E1 |
| dice | `DiceRolled` { purpose, dice: number[], modifiers, final } — one per physical roll, always emitted even when also covered by a family event |
| objectives | `ObjectiveControlChanged`, `VpScored` (source, amount) |
| meta | `ActionRejected` { code, reason }, `DecisionRequested` { pending } |

Events are the only channel to the UI (zustand store subscribes) and the dice log. Events are serialisable JSON.

## 6. Determinism, log, replay, save

| Concern | Rule |
|---|---|
| RNG | `Rng { next(): number /* [0,1) */; roll(sides: 3\|6): number; serialize(): string }`. Reference impl: xoshiro128** seeded from `sha256(seedString)`. **`state.rng` is authoritative**: `step` calls `restoreRng(state.rng)`, uses it, and writes `serialize()` back, so `step` is a pure function of (state, action) and a game is replayable from the action log alone. The optional `rng` parameter is a test override; its `serialize()` output is written back the same way (`ScriptedRng` serialises its remaining queue as `scripted:<dice>`). |
| Roll logging | every call to `rng.roll` inside `step` produces a `DiceRolled` event with `purpose` (e.g. `hit`, `wound`, `save`, `charge`, `advance`, `battleShock`, `damage`, `fnp`, `firstTurn`). |
| Action log | `state.log: Action[]` append-only (seq order). `state.hash` = fnv1a of canonical JSON of state minus `log`, recomputed per step (cheap, used by replay/multiplayer asserts). |
| Replay | `replay(setup, seed, log)` must reproduce `state.hash` at every seq. CI runs this on every recorded sim game. |
| Save | `SaveFile { version: 1, engineVersion, setup, seed, actions, finalHash }`. Load = replay (a save made with a `ScriptedRng` override replays only with the same override). Optional `snapshot` for fast resume; a mismatch between snapshot hash and replay hash is a hard error. |
| Undo (hotseat) | replay to `seq - 1`. Vs AI: undo allowed only for actions that emitted no `DiceRolled` event (prevents re-rolling by undo). |
| Versioning | `engineVersion` semver (2.0.0 since the Spearhead port; 1.x = Mallet 42k); a save with a different major is refused. Data files carry `dataVersion`; the hash includes it. |

## 7. Space and models

| Item | Definition |
|---|---|
| Unit of length | 1.0 = 1 inch, everywhere (engine, data, client). Millimetre base sizes are converted once at data load (`mm / 25.4`). |
| Axes | Y up. Board plane is XZ. Right-handed (Three.js convention). |
| Board | Spearhead realm battlefield 30 × 22: x ∈ [−15, 15] (long edge), z ∈ [−11, 11]. Origin at centre. Territories (`MissionData.territories`, keyed `'A'` / `'B'` = `Player.territory`) and deploy areas (`deploymentZones`, same keys) come from the battleplan. |
| Facing | radians around Y; cosmetic only (no facing rules). |
| Model | `{ id, unitId, datasheetModelId, pos: {x,y,z}, facing, base: { shape:'round'\|'oval', radius, radius2? }, height, woundsRemaining, flags }`. `pos` is the base centre at ground contact; `y` = terrain surface height under the base. |
| Base-to-base distance | horizontal gap `h = max(0, dist2D(a,b) − ra − rb)` (oval: ellipse gap approximated by sampled edge points), vertical gap `v = |ya − yb|`; reported distance = `sqrt(h² + v²)`. |
| Combat range | `h ≤ 3`, unlimited vertically (CORE-1.4); kept under the 40k names `ENGAGEMENT_H = 3`, `ENGAGEMENT_V = Infinity`, `withinEngagementRange` (pure range). "In combat" (CORE-1.5) = combat range **and** mutual visibility: `los.inCombat` |
| Coherency | ½" horizontally, height ignored (`COHERENCY_H = 0.5`, `isCoherent(models, range?)`; warscroll `coherencyRange` overrides, CORE-1.6); 7+ models need 2 neighbours; one connected group (CORE-1.7) |
| Charge end | within ½" of a visible enemy model (`CHARGE_END = 0.5`, CORE-9.2) |
| Objectives | circles of radius 3" (`Objective.radius`, default `OBJECTIVE_MARKER_RADIUS = 3`), contested while a base touches or overlaps the circle (`OBJECTIVE_RANGE = 0`, SPH-6.2); `Objective.name` for display |
| AoS aliases (PORT-0.3) | Phase `command` = Hero, `fight` = Combat; MoveType `advance` = Run, `fallBack` = Retreat; `Stats.W/Sv/OC` = Health/Save/Control (`T`, `Ld` optional in data, 0 at runtime in `RuntimeStats`); `RuntimeWeapon.skill` = Hit, new `wound`/`rend`; `FEEL_NO_PAIN` / `'fnp'` / `onFeelNoPainRoll` / `FeelNoPainRolled` = Ward; `fightsFirst/fightsLast` = Strike-first/-last; `arrivedThisTurn` = set up this turn; `CombatPatrolData` / `patrols` / `Player.patrolId` = Spearhead army; `warlord` = general; `MissionData` with `format: 'spearhead'` = battleplan |
| Sample points for LoS | base centre at heights {0.2, height/2, height} plus 4 base-edge points at height/2; details in 11-rules. |
| Terrain | polygons in XZ with height; ruins have wall segments (thin boxes) used by raycasts. |
| Precision | positions rounded to 1/1000 inch on write to keep hashes stable across platforms. |

## 8. Error handling

`step` never throws on bad input from a Decider. Illegal → `rejection: { code, reason, details? }`, `state` is the same object, `pending` unchanged, `events = [ActionRejected]`.

| Code | Meaning |
|---|---|
| `E_WRONG_DECISION` | `decisionId` does not match `pending.id` |
| `E_WRONG_PLAYER` | action.player ≠ pending.player |
| `E_NOT_AN_OPTION` | finite decision, answer not in `options` |
| `E_OUT_OF_RANGE` | move/charge/pile-in exceeds allowed distance |
| `E_COHERENCY` | unit would end out of coherency |
| `E_OVERLAP` | base overlaps model or impassable terrain |
| `E_ENGAGEMENT` | ends within engagement range illegally, or leaves it illegally |
| `E_NO_LOS` / `E_NOT_IN_RANGE` | target not visible / not in range |
| `E_INVALID_TARGET` | target keyword/ownership/eligibility fails |
| `E_INSUFFICIENT_CP` | stratagem cost |
| `E_STRATAGEM_USED` | once-per-phase/turn/battle limit |
| `E_PASS_NOT_ALLOWED` | `canPass` false |
| `E_GAME_OVER` | phase is `ended` |
| `E_SCHEMA` | payload shape wrong (validated with the JSON schema in 20) |

Programmer errors (corrupt state, missing datasheet) throw `EngineInvariantError`; the sim treats these as test failures.

## 9. Performance budgets

| Target | Budget |
|---|---|
| `step` (no LoS) | p50 < 0.5 ms, p99 < 3 ms (node, M1) |
| `step` with LoS raycasts (declare targets) | < 10 ms for 20 vs 20 models |
| `legalActions` | < 5 ms |
| headless sim | ≥ 5 full games/s single-threaded, ≥ 100 games in CI < 60 s |
| AI tier 1 decision | p50 < 50 ms, p99 < 300 ms; Monte Carlo decisions ≤ 1.5 s (in a worker, cancellable) |
| client | 60 fps on an M1 laptop with 40 models + terrain; ≤ 150 draw calls; ≤ 1.0 M triangles on screen |
| bundle | ≤ 2.5 MB gzip JS (excl. glTF); first interactive < 3 s on Pages |
| memory | `GameState` JSON < 200 KB; event log for a full game < 5 MB |

## 10. Settled items

- Spearhead port (13-engine-port-plan): contracts change additively (PORT-0.1) and 40k ids are aliased, not renamed (PORT-0.2, alias table PORT-0.3 in §7). Additions made in WP1: `types.ts` — steps `SetupStep 'firstTurn'`, `CommandStep 'activeAbilities' | 'opponentAbilities'`, `MovementStep` / `ChargeStep 'abilities'`, `ShootingStep 'enemyAbilities'`, `OutOfPhaseMove 'abilityMove'`; `RuntimeStats` (= data `Stats` with `T`, `Ld`, `ward`, `noSave` resolved) on `RuntimeDatasheet.stats` / `RuntimeModelProfile.stats`; `RuntimeWeapon.wound` / `rend`; `RuntimeDatasheet.spearhead` (+ optional `coherencyRange`); `RuntimeAbility.source += 'regiment' | 'battleTrait'`; `Objective.radius` / `name`; `UnitTurnState.chargeRollUnmodified` / `usedCoreThisPhase` / `abilitiesUsedThisPhase`; `Unit.reserveArrival` / `setUpTurn` / `replacementOf` / `replaced` / `tokens`; `Player.territory` / `regimentAbilityId` / `battleTraitIds` / `abilityUses` (`AbilityUseRecord`); `GameState.twist` / `underdog` / `priority`; the `PlayerSetup` / `GameSetup` fields of §2; the `ChooseOptionTopic`s of §3; `RollPurpose 'priority' | 'retreat'`; `RejectionCode 'E_TERRITORY' | 'E_IN_COMBAT' | 'E_ABILITY_USED'`. `events.ts` — the §5 Spearhead events (the existing `FirstTurnChosen { first }` is reused). `hooks.ts` — `HookName 'onAbilityDeclared'` (+ `AbilityDeclaredHookContext`), `AbilityUse`, `ActivatedAbilityHook`, `CodeHook.activate?`, `EligibilityHookContext.check += 'contest' | 'strikeFirst'`, `ObjectiveHookContext.contestingUnitId? / controlScore?` with `StatModifierResult` answers for `onObjectiveControl`, `TRIGGER_HOOK.activated`. `modules.ts` — `Services.abilities: AbilityService`. `src/data/types.ts` — the 13-port-plan §3 data additions (optional `Stats.T/Ld`, `ward`, `noSave`; `WeaponData.wound/rend`, optional `S/AP`; AoS `WeaponAbilityName`s; `AbilityTiming`, descriptor `timing/keywords/declare/roll/modes/fromRound/castingValue/chantingValue`, `Trigger 'activated'`, `Limit 'oncePerTurnArmy'`; `DatasheetData.spearhead/coherencyRange/wizard/priest`, optional `points`; `CombatPatrolData.mode/battleTraits/regimentAbilities`; `PatrolUnitData.reserve/tokens`; `MissionData.format 'spearhead'`, `objectives[].radius/name`, `territories`; the `turn.start` / `turn.end.*` `TimingWindowId`s). `index.ts` no longer re-exports `miracle.ts`; the `miracleDie` / `fixRollOffer` topics are no longer routed.

- LoS sample point set and ruins "wholly within": 10-rules §3.
- `reactionWindow` vs `stratagemWindow` and window ordering: 10-rules R-11.5.
- Multi-patrol contract addition (additive, optional; Space Marines Strike Team Solarien): `types.ts` — `Player.stratagemIds?: StratagemId[]` holds the stratagem ids of the player's own patrol (filled from `patrol.stratagems` in `state.ts`). Core stratagems are always owned; `ownedBy` in `stratagems.ts` checks membership in this list, and when the value is absent it falls back to faction-wide ownership (`stratagem.faction === player.faction`), so existing states and single-patrol factions behave unchanged.
- Astra Militarum contract additions (all additive and optional, nothing removed): `hooks.ts` — `StatModifierResult` gains `cap?: number` (a stat is never better than this value, Take Cover!) and `halve?: boolean` (Artillery Strike halves M); `EFFECT_HOOKS` gains the keys `halveStat` (`onStatQuery`), `halveRoll` (`onAdvanceRoll`) and `forbid` (`onEligibility`) for the matching `Effect` fields. `index.ts` re-exports `modelKeywordsOf`, `spawnUnitCopy` (clones a destroyed unit with fresh ids, full wounds and original per-model loadouts; Send in the Next Wave), `recordModelAttacked` and `modelHasAttacked` (per-model "has made an attack" flag read by the Gunnery Officer Lone Operative grant). `types.ts` — `ActiveEffect.bearerModelId?: ModelId` limits a `scope.who === 'bearer'` ActiveEffect to one model (Epic Challenge: only the picked CHARACTER model, never its whole unit).
- Tyranids Insidious Infiltrators contract additions (additive, nothing removed): `hooks.ts` — `EFFECT_HOOKS` gains the keys `moveThroughModels` and `autoPassDesperateEscape`, both with empty hook lists (the matching `Effect` fields are read directly by `movement.ts` / `charge.ts`, Predators, Not Prey; docs/spec/factions/tyranids--insidious-infiltrators.md §7.1 C2).
