# 20 — Data schema

All game content is JSON under `src/data/`, validated by `tools/validate-data.ts` (`npm run validate:data`) against
`docs/spec/schemas/*.schema.json` (JSON Schema 2020-12; `src/data/schema/*.schema.json` is the same set, keep the two identical). Every
schema `$id` is `https://mallet42k.dev/schemas/<name>.schema.json`; cross-refs use `common.schema.json#/$defs/…`.
All prose fields (`text`, `name` of abilities) are original wording — never copied from any published book.

**Mallet Swordtip (AoS 4 Spearhead).** The schemas describe Spearhead data (13-engine-port-plan §3) and still accept the inherited
40k data until the cleanup package deletes it (PORT-0.1). Spearhead-only fields are marked **AoS** below. The two shipped Spearhead
armies are `cities.army.castelite-company` and `ironjawz.army.bigmob` (specs in `docs/spec/factions/`).

## 1. Files

| Path | Schema | Content |
|---|---|---|
| `src/data/core/abilities.json` | `ability[]` | shared abilities |
| `src/data/core/stratagems.json` | `stratagem[]` | core stratagems (40k; Spearhead has none, SPH-13.1) |
| `src/data/factions/<faction>/faction.json` | `faction` | keywords, army rule, paint scheme, army list (`combatPatrols`); `detachments` may be `[]` |
| `src/data/factions/<faction>/datasheets/<unit>.json` | `datasheet[]` | one warscroll per file (a one-element array) |
| `src/data/factions/<faction>/weapons.json` | `weapon[]` | |
| `src/data/factions/<faction>/abilities.json` | `ability[]` | battle traits, regiment abilities, enhancement effects, warscroll abilities |
| `src/data/factions/<faction>/stratagems.json` | `stratagem[]` | 40k only |
| `src/data/factions/<faction>/enhancements.json` | `enhancement[]` | |
| `src/data/factions/<faction>/patrols/*.json` | `combat-patrol` | one fixed force (40k) or **AoS** Spearhead army (`mode: 'spearhead'`) |
| `src/data/missions/*.json` | `mission` | **AoS** one battleplan × side × deployment map per file (`format: 'spearhead'`) |
| `src/data/terrain/*.json` | `terrain-layout` | |
| `src/data/index.ts` | — | assembles `DataBundle`, throws on duplicate id |

Ids: lowercase kebab, namespaced by dot: `cities.unit.freeguild-steelhelms`, `cities.weapon.dragoon-pistol`,
`ironjawz.ability.natural-disaster`, `ironjawz.enhancement.armour-of-gork` (40k: `sm.w.bolt-rifle`, `ork.a.waaagh`). Mission and
layout ids are plain kebab (`sph-fire-and-jade-aqshy-horizontal`, `sph-fire-and-jade-standard`). Pattern in `common.schema.json#/$defs/Id`.

## 2. Shared primitives (`common.schema.json`)

| Def | Shape | Notes |
|---|---|---|
| `Id` | `^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*$` | |
| `Keyword` | `^[A-Z0-9][A-Z0-9 '\-]*$` | e.g. `INFANTRY`, `ADEPTUS ASTARTES` |
| `DiceExpr` | integer ≥ 0 **or** `^(\d+)?(D3\|D6)?([+-]\d+)?$` | `"D6"`, `"2D6+1"`, `"D3+3"`, `3` |
| `RollTarget` | integer 2..7 | `3` = needs 3+; `7` = never (no save) |
| `Vec2` | `{x, z}` inches | board plane |
| `Polygon` | `Vec2[]` (≥3, CCW) | |
| `Phase` | `command \| movement \| shooting \| charge \| fight \| any` | |
| `TimingWindowId` | enum, same list as 00-architecture §4 | includes `round.start`, `round.end`, `battle.end` (outside any turn), `movement.moveStarted`, `charge.moveStarted`, `fight.targetsDeclared`, `fight.beforeConsolidate` |
| `MissionRule` | `{id, code, window, params?}` | §9; `code` must exist in the hook registry |
| `Stats` | `{M, Sv, W, OC, ward?, noSave?, T?, Ld?}` | **AoS** `M` Move (inches), `Sv` Save (RollTarget), `W` Health, `OC` Control, `ward` Ward (N+), `noSave` for Save "-". `T`/`Ld` are 40k-only and optional (0 at runtime) |
| `Base` | `{shape: round\|oval, mm, mm2?}` | mm2 = minor axis for oval |
| `Condition` | see §3 | |
| `Effect` | see §3 | |
| `AbilityDescriptor` | see §3 | |
| `WeaponAbility` | `{ability, value?, keyword?, ref?}` | §4 |
| `TargetSpec` | `{role, owner, filter?, state?, count?}` | §6 |

## 3. Abilities — declarative descriptors

An ability is `trigger` + `when` + `effect`, optionally limited and scoped. The engine evaluates every
active descriptor at the matching hook; the hook system is defined in 10-rules. `code` is the escape hatch:
bespoke logic lives in `src/engine/hooks/<hookName>.ts` and is registered in a hook registry; `trigger`/`when`
still gate it so bespoke hooks stay cheap. A descriptor with `code` may omit `effect`.

```json
{ "id":"sm.a.example", "name":"…", "text":"own-words summary",
  "trigger":"hitRoll", "when":{"targetKeyword":"VEHICLE"}, "effect":{"reroll":"ones"} }
```

| Field | Type | Notes |
|---|---|---|
| `trigger` | enum | `always phaseStart phaseEnd turnStart turnEnd commandPhase battleShockTest advanceRoll chargeRoll unitMoved unitSelectedToShoot unitSelectedToFight targetsDeclared attacksAllocated hitRoll woundRoll saveRoll damageRoll feelNoPainRoll damageApplied modelDestroyed unitDestroyed deployment reinforcements objectiveControl` and **AoS** `activated` (the descriptor is run by `src/engine/abilities.ts`, never by the hook dispatcher). In Spearhead `feelNoPainRoll` / `feelNoPain` is Ward (PORT-0.3) |
| `timing` | AbilityTiming | **AoS**. `{kind:'passive'}`; `{kind:'phase', phase: command\|movement\|shooting\|charge\|fight, whose: your\|enemy\|any}` (`command` = Hero phase, `fight` = Combat phase); `{kind: startOfTurn\|endOfTurn\|startOfRound\|endOfRound\|deployment, whose}`; `{kind:'reaction', trigger: youDeclared\|opponentDeclaredAttack, abilityId?}`. Absent = legacy 40k trigger-driven descriptor. A descriptor needs one of `effect`, `code`, `timing`, or `trigger: 'activated'` |
| `keywords` | enum[] | **AoS** ability keywords: `CORE ATTACK MOVE RUN CHARGE SPELL PRAYER UNLIMITED` |
| `declare` | TargetSpec[] | **AoS** targets picked at Declare; the code hook may refine them (e.g. match a datasheet id, "wholly within") |
| `roll` | `{dice, succeedOn}` | **AoS** the declared roll, e.g. `{dice:'D6', succeedOn:2}` |
| `modes` | `{id, name, text}[]` | **AoS** "choose one" effects |
| `fromRound` | int | **AoS** first battle round the ability may be used (Ere We Go: 3) |
| `castingValue`, `chantingValue` | int | **AoS** spells and prayers (none shipped yet) |
| `when` | Condition | all keys AND-ed; `any: Condition[]`, `not: Condition` |
| `effect` | Effect \| Effect[] | applied in array order; each entry may carry its own `when` (AND-ed with the descriptor's), e.g. Veteran Instincts = `[{when:{targetKeyword:["MONSTER","VEHICLE"]}, reroll:"all"}, {reroll:"ones"}]` — the first matching entry wins for the same key |
| `scope` | `{who: self\|bearer\|target\|attacker\|friendly\|enemy, within?, keyword?}` | who the effect applies to; `self` = the whole unit (attached unit included); `bearer` = only the model carrying the ability (engine `RuntimeAbility.bearerModelId`); default `self` for abilities, `bearer` for enhancements |
| `duration` | `instant \| untilEndOfPhase \| untilEndOfTurn \| untilNextTurn \| untilEndOfRound \| battle` | default `instant` for roll effects, `battle` for `always`; `untilEndOfRound` = until the start of the next battle round (engine `expires.kind: roundEnd`; Waaagh!, Dead 'ard, Stomp 'Em) |
| `limit` | `oncePerBattle \| oncePerRound \| oncePerTurn \| oncePerPhase \| oncePerTurnArmy` | `oncePerTurnArmy` (**AoS**): once per turn for the whole army |
| `code` | string | hook name; must exist in registry or validation fails. Spearhead hook names are `<faction><Name>` camelCase (`citiesDecisiveCommander`, `ironjawzShieldBash`); `params` carries the numbers the spec states |
| `params` | object | free-form parameters for `code` |

Condition keys (all optional): `phase`, `ownTurn`, `attackerKeyword`, `attackerNotKeyword`, `targetKeyword` (Keyword or Keyword[] = any of),
`targetNotKeyword`, `targetModelKeyword` (the attacked / save-taking model, `attack.targetModelId`, has that keyword per `modelKeywordsOf`; false when no model is known; Black Templars Shield of Zeal), `weaponType (ranged|melee)`, `weaponAbility`, `weaponId`, `range ({within:n} | "half")`,
`targetInCover`, `targetOnObjective`, `targetOnObjectiveControlledBy (self|opponent: target within range of a marker controlled by the holder / the holder's opponent; Aeldari Swift Demise)`, `unitOnObjective`, `unitOnObjectiveControlledBy (self|opponent: the holder's unit, either half, is within range of a marker controlled by the holder / the holder's opponent; Death Guard Remorseless)`, `unitBelowHalf`, `unitStationary`, `unitAdvanced`,
`targetBelowStartingStrength`, `targetBelowHalf`, `targetIsClosestEligible` (Tyranids: Feeding Frenzy / Voracious Assault), `unitFellBack`, `unitCharged`, `unitHasModel` (holder unit has a live model with that modelId; Sororitas Repentia Overseer), `unitBattleShocked`, `friendlyKeywordWithin` ({keyword, within, factionKeyword?}: holder unit is within `within`" of another friendly unit with that keyword; Adeptus Mechanicus), `leaderAttached`, `mortalWound` (onFeelNoPainRoll only: the point saved is a mortal wound), `sourcePsychic` (onFeelNoPainRoll only: the point comes from a [PSYCHIC] weapon or a Psychic-tagged ability's mortal wounds), `roll ({gte,lte, unmodified?})`,
`round ({gte,lte})`, `oathTarget` (target is the marked unit), `strengthVsToughness (gt|gte|eq|lte|lt|double|half — attack S vs target T)`, `any`, `not`.

Effect keys (any subset; unknown keys rejected):

| Key | Value | Meaning |
|---|---|---|
| `when` | Condition | per-entry gate (see `effect` above); not an effect on its own |
| `reroll` | `ones \| fails \| all \| oneDie` | re-roll for the triggering roll; `all` = optional re-roll of successes via `rerollOffer` (10-rules R-6.24), fails auto-re-rolled |
| `modifyRoll` | `{roll, value, armourOnly?}` | roll ∈ hit wound save charge advance battleShock damage; engine applies ±1 cap for hit/wound; `armourOnly` is honoured for `roll:'save'` only (the bonus never improves an invulnerable save, Half-chewed MOR-3.1) |
| `modifyStat` | `{stat, value, cap?}` | stat ∈ A S AP D M T Sv W Ld OC BS WS range; `cap`: the modifier never takes the stat past it (Sv/BS/WS/Ld: not lower; others: not higher) |
| `halveStat` / `halveRoll` / `forbid` | StatName / `'advance'` / `'charge'` or `'overwatch'` | stat halved (rounded up) before additive modifiers; Advance roll halved; charge declaration forbidden, or (`'overwatch'`) the unit cannot Fire Overwatch |
| `setStat` | `{stat, value}` | |
| `invuln` | RollTarget | |
| `feelNoPain` | RollTarget | |
| `ignoreCover` | true | |
| `ignoreModifiers` | `hit \| wound \| all` | |
| `autoResult` | `{roll, outcome: pass\|fail}` | e.g. auto-pass battle-shock |
| `grantWeaponAbility` | WeaponAbility | to the weapons of the models in `scope` (`bearer` → only that model's weapons) matching `when.weaponType` |
| `grantKeyword` | Keyword | |
| `extraAttacks` | DiceExpr | |
| `mortalWounds` | `{count: DiceExpr, on?: unmodified6}` | |
| `damageReduction` | int | subtract from each damage instance, min 1 |
| `halveDamage` | true | round up |
| `cp` | int | gain/refund |
| `vp` | int | |
| `move` | `{distance: DiceExpr, kind: normal\|consolidate\|advance\|surge}` | out-of-sequence move; `surge` applies R-5.9 limits and `params.asCloseAsPossibleTo: target` |
| `fightsFirst` / `fightsLast` | true | |
| `shootAfterAdvance` / `shootAfterFallBack` / `chargeAfterAdvance` / `chargeAfterFallBack` | true | |
| `stealth` | true | −1 to hit for ranged attacks targeting the unit |
| `lethalOn` | `5+` etc | override ability threshold |
| `critWoundAp` | int ≥1 | AP improves by n for an attack whose unmodified wound roll was a critical wound |
| `moveThroughModels` | `true` | models of the unit may cross any model and ignore Engagement Range mid-path (end-position rules unchanged); read directly by movement/charge |
| `autoPassDesperateEscape` | `true` | Desperate Escape tests are passed without rolling; read directly by movement |

Core abilities that are flags rather than rules text go on the datasheet as `coreAbilities:[{ability, value?}]` with
enum `DEEP_STRIKE SCOUTS INFILTRATORS LONE_OPERATIVE LEADER STEALTH DEADLY_DEMISE FIRING_DECK FEEL_NO_PAIN FIGHTS_FIRST`.
The engine implements those natively; data never redefines them.

## 4. Weapons

One entry per profile. Multi-profile weapons share `profileGroup`; a model picks one profile each time it shoots/fights.

| Field | Type | Notes |
|---|---|---|
| `id`, `name` | Id, string | |
| `type` | `ranged \| melee` | |
| `range` | int inches | 0 for melee |
| `A` | DiceExpr | attacks |
| `skill` | RollTarget \| null | **AoS** Hit (N+). 40k BS/WS; null = auto-hit (TORRENT) |
| `wound`, `rend` | RollTarget, int ≥ 0 | **AoS** Wound (N+) and Rend (positive number worsens the save). A weapon needs either `S`+`AP` (40k) or `wound`+`rend` (AoS); a `spearhead` datasheet's weapons must use the AoS pair (checked by `validate-data`) |
| `S`, `AP` | int, int ≤ 0 | 40k only, optional |
| `D` | DiceExpr | damage |
| `abilities` | WeaponAbility[] | enum `ASSAULT HEAVY RAPID_FIRE TORRENT BLAST SUSTAINED_HITS LETHAL_HITS DEVASTATING_WOUNDS ANTI TWIN_LINKED LANCE MELTA IGNORES_COVER INDIRECT_FIRE PISTOL HAZARDOUS PRECISION EXTRA_ATTACKS ONE_SHOT PSYCHIC CUSTOM` plus **AoS** `CRIT_2_HITS CRIT_AUTO_WOUND CRIT_MORTAL CHARGE_DAMAGE COMPANION SHOOT_IN_COMBAT`; `value` for RAPID_FIRE/SUSTAINED_HITS/MELTA (DiceExpr), `keyword`+`value` for ANTI, `ref` (ability id) for CUSTOM. **AoS** `ANTI` means "+`value` Rend against `keyword`"; `keyword: '@charged'` = the target charged this turn (Anti-charge). `CHARGE_DAMAGE` value = bonus damage on a charge turn |
| `profileGroup` | Id | optional |
| `figure` | `{part: Id}` | which weapon part to mount (30-figures) |

## 5. Datasheets

| Field | Type | Notes |
|---|---|---|
| `id`, `faction`, `name` | | |
| `keywords`, `factionKeywords` | Keyword[] | `INFANTRY`, `CHARACTER`, … / `ADEPTUS ASTARTES`, `ORKS` |
| `stats` | Stats | unit default |
| `invuln` | RollTarget | optional |
| `composition` | Composition[] | per model type: `{modelId, name, min, max, default, champion?, keywords? (model-only keywords), base, statsOverride?, weapons:{default: Id[], options: WargearOption[]}, figure}` |
| `WargearOption` | `{replace: Id[], with: Id[], max?: int \| "any", perModels?: int}` | `perModels: 5` = one option per 5 models |
| `abilities` | (Id \| AbilityDescriptor)[] | |
| `coreAbilities` | `{ability, value?}[]` | §3 |
| `leader` | `{attachTo: Id[], effects: (Id\|AbilityDescriptor)[]}` | CHARACTER only |
| `damaged` | `{threshold: int, effect: Effect}` | vehicles/monsters |
| `transport` | `{capacity: int, keywords?: Keyword[], excludeKeywords?: Keyword[], firingDeck?: int}` | transports; capacity counts models; passengers need every `keywords` entry and none of `excludeKeywords` |
| `points` | `{models, points}[]` | 40k only, optional (Spearhead has no points) |
| `spearhead` | boolean | **AoS** the datasheet is a Spearhead warscroll; a Spearhead army may only use these (SPH-13.7) |
| `coherencyRange` | number ≥ 0.5 | **AoS** CORE-1.6: a longer coherency range than ½" |
| `wizard`, `priest` | int | **AoS** power level (P2, none shipped) |
| `figure` | `{archetype, kit, parts?: Record<Slot, Id>}` | see 30-figures; composition entries may override. Spearhead entries use the placeholder kits `generic-infantry/heavy/monster/vehicle` and the ork kits until the house-style figures exist |

AoS keywords are the printed ones (`HERO`, `INFANTRY`, `CAVALRY`, `WAR MACHINE`, `BRUTE`, `REINFORCEMENTS`, `FLY`); faction keywords are display-only. Abilities that name a unit match on datasheet id (`params.datasheet`), never on a keyword.

Unit-level state in the engine (`wounds`, `battleShocked`, `moved`, `advanced`) is not data and is not in the schema.

## 6. Stratagems

| Field | Type | Notes |
|---|---|---|
| `id`, `name`, `text` | | |
| `faction` | Id \| `core` | |
| `detachment` | Id | optional |
| `cost` | int CP | |
| `category` | `battleTactic \| strategicPloy \| wargear \| epicDeed` | |
| `phases` | Phase[] | informational filter for UI |
| `window` | TimingWindowId | when it may be used; the engine offers it only in this window |
| `who` | `active \| reactive \| either` | whose turn it may be used in |
| `condition` | Condition | use-time gating (e.g. the target unit must have been selected as a target) |
| `when` | Condition | application-time gating per triggered attack/roll, same semantics as `AbilityDescriptor.when` |
| `targets` | TargetSpec[] | `{role: unit\|model, owner: friendly\|enemy, filter:{keyword?, notKeyword?, within?:{of: previousTarget\|self\|objective\|controlledObjective, inches}}, state?: selectedToShoot\|targetedByAttack\|chargedThisTurn\|justDestroyed\|inEngagement\|belowHalf\|notYetFought|notYetShot|notYetActivated, count?:int, includeDestroyed?:bool}`; `within.of: controlledObjective` restricts to a marker the active player currently controls (vs. `objective` = any marker in range) |
| `effect` | Effect \| Effect[] | applied to `targets[0]` unless `scope` says otherwise |
| `scope`, `duration`, `limit` | as abilities | default `limit: oncePerPhase` (core: one use per stratagem per phase) |
| `code` | hook name | escape hatch |

## 7. Enhancements

`{id, faction, detachment?, name, text, cost (pts), restriction:{keyword?: Keyword[], notKeyword?: Keyword[]}, effect: AbilityDescriptor | AbilityDescriptor[] | Id, choice?: {unitKeyword}}` — always attaches to one CHARACTER model; `effect.scope` defaults to `{who: bearer}`. `choice` means the player names one friendly unit with that keyword at setup (`PlayerSetup.enhancementChoice.unitRef`; Tellyporta → BOYZ); `createGame` rejects a missing or mismatched ref.

## 8. Factions and combat patrols

`faction`: `{id, name, factionKeyword, armyRule: Id, detachments:[{id, name, rule: Id, stratagems: Id[], enhancements: Id[]}], paintScheme:{primary, secondary, trim, metal, decal} (hex), combatPatrols: Id[]}`.

**Spearhead army** (SPH-2, 13-engine-port-plan §3.4) = a `combat-patrol` file with `mode: 'spearhead'`. Mapping from the SPH-16.4 shape: `general` → `warlord`, `units[].models` → `size`, `stratagems: []`, `secondaries: []`. Extra fields: `battleTraits: Id[]` (ability ids attached to every unit), `regimentAbilities: [{id, default}, {id, default}]` (exactly 2, one default; the chosen one is player-wide), `enhancements` (exactly 4, one default; only ever given to the general), `units[].reserve: {ability}` (the unit starts in reserve and arrives through that ability), `units[].tokens` (P2). The faction's `armyRule` is a passive marker ability (`timing: {kind:'passive'}`) so the 40k setup path finds one. Enhancement `effect` is an ability id whose descriptor has `scope: {who:'bearer'}`.

`combat-patrol`: `{id, faction, name, detachment?, armyRule?: Id (patrol-level override of the faction armyRule), warlord: ref, units:[{ref, datasheet, size, wargear?: [{modelId, count, weapons: Id[]}], patrolSquads?: [{ref, size, wargear: [{modelId, count, weapons: Id[]}]}], attachTo?: ref, enhancement?: Id}], unitChoices?: [{id, refs: ref[], default: ref}] (exactly one ref per group is fielded; Grey Knights Terminators/Dreadknight), stratagems: Id[], enhancements: [{id, default}], secondaries: [{id, name, text, default, scoring: ScoringRule[]}]}`. `ref` is unique inside the patrol and becomes the engine `unitId` prefix. `attachTo` references another unit's `ref` (leader attachment chosen at setup; the setup UI may change it within `leader.attachTo`). Exactly one enhancement and one secondary have `default: true`; the player may swap to the optional one at setup (11-combat-patrol CP-1.4/1.5).

## 9. Missions

| Field | Type | Notes |
|---|---|---|
| `id`, `name`, `format` | | `format: combatPatrol \| incursion \| strikeForce \| spearhead` |
| `board` | `{w, h}` | 44 × 30 for Combat Patrol; **AoS** 30 × 22 |
| `deploymentZones` | `{A: Polygon, B: Polygon}` | inches, board coords. **AoS**: the SPH-7.2 deploy area, i.e. the territory minus the 6" strip next to the dividing line |
| `territories` | `{A: Polygon, B: Polygon}` | **AoS** the two territories of the deployment map (friendly-territory tests, SPH-1.4); optional |
| `objectives` | `{id, x, z, home?, radius?, name?}[]` | marker centre; 40k control radius from `objectiveRange` (3" from marker edge, marker radius 0.79"). **AoS**: `radius` = objective circle (default `objectiveMarkerRadius`), `name` = display name; `objectiveRange: 0` and `objectiveMarkerRadius: 3` reproduce SPH-6.2 (a model contests while any part of its base overlaps the circle) |
| `rounds` | int | 5 (**AoS** 4) |
| `firstTurn` | `roll \| attackerChoice` | |
| `scoring` | ScoringRule[] | `{id, when: TimingWindowId, rounds:{from,to}, who?: active\|opponent\|both\|first\|second, rule, pointsPer, cap, params?, code?}` (`common#/$defs/ScoringRule`, shared with patrol secondaries). `when` may be any window incl. `round.start`/`round.end`/`battle.end`; `who: first/second` = the player who took the first/second turn of the round (round-5 split: `{command.end, 5–5, first}` + `{turn.end, 5–5, second}`, 11-combat-patrol CP-2.1). `rule`: `holdObjectives` (per marker; `params.objectiveIds` restricts, `params.min` = threshold form "≥ n markers"), `holdMore` (`params.allowTie` = a tie, incl. 0 v 0, also scores), `holdHome`, `holdEnemyHome`, `holdNamed` (`params.objectiveIds`, all must be held), `unitsInEnemyZone`, `destroyedUnits`, `razedThisTurn`, `claimedSite`, `claimedSiteConsecutive` (`params.turns`), `custom` (`code`). `params.capGroup` lets several rules share one per-instance cap. |
| `rules` | MissionRule[] | `{id, code, window, params?}` — non-scoring mission rules (Retrieve Intelligence, Irradiated Power Cells, Sabotage Comms, Raze and Ruin, Supply Lines, Break Their Spirit, Claim Sites); `code` validated against the hook registry; state they keep is listed in 11-combat-patrol §2.6 |
| `victory` | `{tie: draw \| fewerDestroyed}` | |
| `terrainLayouts` | Id[] | allowed layouts |

**AoS scoring.** Spearhead scores at the end of the active player's own turn (SPH-11.1) with three `custom` rules, `when: 'turn.end'`, `who: 'active'`, rounds 1–4, `pointsPer: 1`, `cap: 1`: `code: 'sph.vp.holdOne'` (control ≥ 1 objective), `'sph.vp.holdTwo'` (≥ 2), `'sph.vp.holdMore'` (more than the opponent). The reducer never opens `turn.end`; the missions service runs these rules in the `turn.end.scoring` window. `ScoringRule.code` may contain dots. The battle-tactic rule `sph.vp.tactic` is P2 (no card data).

The shipped battleplan is `sph-fire-and-jade-aqshy-horizontal` (SPH-14.2/14.3): territory A is z < 0, B is z > 0, deploy strips |z| from 6 to 11, objectives Dracothion (0, 0), Vulcatrix (−11, −7), Ignax (10, −7), Behemat (−10, 7), Nagendra (11, 7), all radius 3. Diagonal map and the Ghyran side are P1/P2.

## 10. Terrain layouts

`{id, board, pieces: Piece[]}`; `Piece = {id, kind: ruin|crate|barricade|crater|wall|forest, pos: Vec2, rot: number(rad), footprint: Polygon (local), height, traits: (obscuring|cover|breachable|scalable|difficult|impassable|unstable)[], walls?: [{a: Vec2, b: Vec2, height, thickness, gaps?: [{from, to}] }], floors?: [{polygon, height}]}`.
`footprint` is the area used for "wholly within" tests; `walls` are the raycast blockers; `floors` are standable surfaces.

**AoS** (SPH-5): no new `kind`. The large *Ruined Domicile* is `kind: 'ruin'`, a 5 × 3 footprint, two 4"-tall walls, `traits: ['cover','obscuring','unstable']`, no floors. The small *Ravaged Shrine* is `kind: 'crate'`, 3 × 2, height 2, `traits: ['cover','unstable']`. Board `{w: 30, h: 22}`. The shipped layout `sph-fire-and-jade-standard` is the SPH-14.4 table (piece ids `tf-a-large`, `tf-a-small`, `tf-b-large`, `tf-b-small`); the B pieces are rotated π so the layout is point-symmetric.

## 11. Worked examples

Taken from the Strike Force Octavius roster (11-combat-patrol §4); numbers are re-checked by the W2 data agents. Full JSON in `docs/spec/examples/` (validated in CI).

### Datasheet — `docs/spec/examples/datasheet.sm.infernus-squad.json`

```json
{ "id":"sm.infernus-squad", "faction":"sm", "name":"Infernus Squad",
  "keywords":["INFANTRY","IMPERIUM","TACTICUS","INFERNUS SQUAD"], "factionKeywords":["ADEPTUS ASTARTES"],
  "stats":{"M":6,"T":4,"Sv":3,"W":2,"Ld":6,"OC":1},
  "composition":[
    {"modelId":"sergeant","name":"Infernus Sergeant","min":1,"max":1,"default":1,"champion":true,
     "base":{"shape":"round","mm":32},
     "weapons":{"default":["sm.w.bolt-pistol","sm.w.pyreblaster","sm.w.close-combat-weapon"]},
     "figure":{"archetype":"infantry","kit":"sm-tacticus","parts":{"head":"sm.head.sergeant"}}},
    {"modelId":"marine","name":"Infernus Marine","min":4,"max":4,"default":4,
     "base":{"shape":"round","mm":32},
     "weapons":{"default":["sm.w.bolt-pistol","sm.w.pyreblaster","sm.w.close-combat-weapon"]},
     "figure":{"archetype":"infantry","kit":"sm-tacticus"}}],
  "abilities":["sm.a.oath-of-moment"], "coreAbilities":[],
  "points":[{"models":5,"points":0}],
  "figure":{"archetype":"infantry","kit":"sm-tacticus"} }
```

Referenced ability (`abilities.json`), showing the descriptor form:
`{"id":"sm.a.oath-of-moment","name":"Oath of Moment","text":"Pick one enemy unit at the start of your Command phase; until your next Command phase, attacks against it may re-roll the hit roll.","trigger":"hitRoll","when":{"oathTarget":true},"effect":{"reroll":"all"},"code":"oathOfMomentPick","params":{"pickWindow":"command.start"}}` — the re-roll is declarative (`all`: failed dice re-rolled automatically, successes offered via `rerollOffer`, R-6.24); the once-per-turn target pick is a `code` hook that opens a `chooseOption` decision.

Referenced weapon (`weapons.json`): `{"id":"sm.w.pyreblaster","name":"Pyreblaster","type":"ranged","range":12,"A":"D6","skill":null,"S":5,"AP":0,"D":1,"abilities":[{"ability":"TORRENT"},{"ability":"IGNORES_COVER"}],"figure":{"part":"sm.weapon.pyreblaster","hands":2}}`.

### Stratagem — `docs/spec/examples/stratagem.sm.gene-wrought-resilience.json`

```json
{ "id":"sm.s.gene-wrought-resilience", "faction":"sm", "name":"Gene-wrought Resilience",
  "text":"Use when one of your Astartes units is chosen as a target in the opponent's Shooting phase or either player's Fight phase. Until the phase ends, attacks against it whose Strength exceeds the unit's Toughness suffer -1 to wound.",
  "cost":1, "category":"battleTactic", "phases":["shooting","fight"],
  "window":["shooting.targetsDeclared","fight.targetsDeclared"], "who":"either",
  "condition":{"any":[{"phase":"shooting","ownTurn":false},{"phase":"fight"}]},
  "targets":[{"role":"unit","owner":"friendly","filter":{"keyword":"ADEPTUS ASTARTES"},"state":"targetedByAttack","count":1}],
  "when":{"strengthVsToughness":"gt"},
  "effect":{"modifyRoll":{"roll":"wound","value":-1}}, "scope":{"who":"attacker"},
  "duration":"untilEndOfPhase", "limit":"oncePerPhase" }
```

`condition` is checked once when the stratagem is used; `when` is checked on every application (here: per attack, `strengthVsToughness: gt`). The engine stores the resulting effect on the target unit with `scope.who = attacker`; the AI calculator reads the same descriptor (40-ai §2).

## 12. Validation rules beyond JSON Schema (`tools/validate-data.ts`)

Validator: `ajv` (2020-12 class, `strict: true, strictRequired: false`), all schemas added by `$id`, examples in `docs/spec/examples/` validated in CI as a smoke test.

| Check | Failure |
|---|---|
| all `Id` references resolve in the bundle | dangling ref |
| `code` hook names (abilities, stratagems, `ScoringRule.code`, `mission.rules[].code`) exist in `src/engine/hooks/registry.ts` | unknown hook |
| enhancement `choice.unitKeyword` names a keyword some datasheet in the same faction has | unusable choice |
| `composition` default sizes match a `points` entry | size/points mismatch |
| wargear `replace` ids ⊆ `default` | bad option |
| deployment zone polygons inside board, objectives inside board | geometry |
| `combat-patrol.attachTo` targets a unit the leader's `leader.attachTo` allows | illegal attach |
| paint scheme hex colours parse | colour |
| every `text` field ≤ 400 chars | verbosity guard |
| **implemented now** (`checkSpearheadArmy`, `tests/data/spearhead.test.ts`): a `mode: 'spearhead'` army has exactly 2 regiment abilities (SPH-2.3) and 4 enhancements (SPH-2.4), one default of each, a general that is one of its units, only `spearhead: true` datasheets (SPH-13.7), weapons with `wound` + `rend`, and every referenced ability / enhancement / datasheet / weapon id exists | SPH-024 |

The schemas themselves also enforce the SPH-2.3 / 2.4 counts for any file with `mode: 'spearhead'`. The other rows above (hook-name registry, geometry, text length) remain unimplemented.
