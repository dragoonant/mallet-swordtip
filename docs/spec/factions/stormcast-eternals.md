# Stormcast Eternals — Vigilant Brotherhood (Spearhead)

Faction id: `stormcast` · Army id: `stormcast.army.vigilant-brotherhood` · Grand alliance: Order.
Source: `docs/sources/spearhead-stormcast-eternals.pdf` (15 pages, gitignored), "Spearhead: Stormcast Eternals - Yndrasta's
Spearhead and Vigilant Brotherhood", the free Warhammer Community download (Age of Sigmar, Spearhead category). Listed
2024-12-18 (PDF metadata: created and modified 2024-12-09). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_aos_spearhead_stormcast_eternals_dec_24-jyo1gqr2pm-0e3gf5ydzh.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, search term
"stormcast"). The PDF holds two armies. **Vigilant Brotherhood** (pp. 9-15) is the army in the current 4th-edition
**Spearhead: Stormcast Eternals** box (Lord-Vigilant on Gryph-stalker, Lord-Veritant, Prosecutors, Liberators) and is the
army specified here. *Yndrasta's Spearhead* (pp. 1-8: Yndrasta, Knight-Vexillor, Annihilators, 2× Vanquishers, Stormstrike
Chariot) is a separate army built from older kits and is out of scope.
The PDF prints no base sizes. Those come from the Wahapedia aos4 warscroll pages (`wahapedia.ru/aos4/factions/stormcast-eternals/
Lord-Vigilant-on-Gryph-Stalker`, `/Lord-Veritant`, `/Prosecutors`, `/Liberators`), fetched the same day with plain curl.
Mechanics and numbers are ported 1:1. All wording below is our own. Rule IDs `SCE-*` double as test IDs (§9).

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat
range of an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase =
`fight`; Run = `advance`, Retreat = `fallBack`. Rend is stored as `AP` (negative = more Rend). "Ward (N+)" maps to the
engine's `feelNoPain: N` (CORE-13.2: only the best ward counts).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `stormcast.unit.lord-vigilant` | Lord-Vigilant on Gryph-stalker | 1 | **General** | no | 90×52 oval (Wahapedia) |
| `stormcast.unit.lord-veritant` | Lord-Veritant (with Gryph-crow token) | 1 | Unit | no | 40 round (Wahapedia) |
| `stormcast.unit.prosecutors` | Prosecutors | 3 | Unit | **yes** | 40 round, flying stand (Wahapedia) |
| `stormcast.unit.liberators` | Liberators | 5: 4 Warhammer, 1 Grandhammer | Unit | **yes** | 40 round (Wahapedia) |

Total: 4 units, 10 models. One Priest (the Lord-Veritant), no Wizard. Only the Prosecutors have **Fly**. The Gryph-crow is a
token (SPH-2.7), not a model: it has no base, cannot be targeted and does not contest.

---

## 2. Battle traits ("Holy Orders")

### SCE-BT-1 `stormcast.ability.shield-of-azyr` — Shield of Azyr
- **Timing:** Once per turn (army), your hero phase.
- **Declare:** Pick any friendly unit.
- **Effect:** That unit has **Ward (5+)** until the start of your next turn.

### SCE-BT-2 `stormcast.ability.storm-charge` — Storm Charge
- **Timing:** Once per battle (army), your charge phase.
- **Declare:** Pick a friendly unit that is **not in combat**.
- **Effect:** This turn the unit may use Charge abilities even though it used a **Run** ability this turn.

---

## 3. Regiment abilities (pick 1 at army selection)

### SCE-RA-1 `stormcast.ability.strike-where-needed` — Strike Where Needed
- **Timing:** Once per battle, **Reaction**: you declared a **Retreat** ability.
- **Used by:** the unit that declared the Retreat.
- **Effect:** That Retreat inflicts **no mortal damage** on the unit, and the unit may still use **Charge** abilities this
  turn although it retreated.

### SCE-RA-2 `stormcast.ability.blaze-of-glory` — Blaze of Glory
- **Timing:** Once per battle, any combat phase.
- **Declare:** Pick a friendly unit that is **in combat**.
- **Effect:** Until the end of the phase, every time a model of that unit is slain, make a **vengeance roll** (D6). On
  **4+**, 1 enemy unit **in combat with that unit** suffers **1 mortal damage**.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `stormcast.enh.hallowed-scrolls` | Hallowed Scrolls | Passive | The general has **Ward (5+)**. |
| `stormcast.enh.morrdas-talon` | Morrda's Talon | Passive | The general's **Hallowed Greataxe** gains **Crit (Mortal)**. |
| `stormcast.enh.quicksilver-draught` | Quicksilver Draught | Once per battle, any combat phase | The general has **Strike-first** for the rest of this phase. |
| `stormcast.enh.null-pendant` | Null Pendant | Once per battle, end of any turn | Declare: roll a D6 for **each enemy unit contesting the same objective as the general**. Effect: for each roll of **2+**, subtract that roll from that enemy unit's **control score** this turn. |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. **No warscroll prints a Ward** (the Lord-Veritant's comes from its
ability). Printed keywords only (Spearhead warscrolls print no faction keywords).

### 5.1 `stormcast.unit.lord-vigilant` — Lord-Vigilant on Gryph-stalker (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 8 | 3+ | 2 | — |

Keywords: **Hero, Cavalry** (no Fly).

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Hallowed Greataxe (`stormcast.weapon.hallowed-greataxe`) | Melee | — | 5 | 3+ | 3+ | 2 | 2 | — (Crit (Mortal) with Morrda's Talon) |
| Gryph-stalker's Beak and Talons (`stormcast.weapon.gryph-stalker-beak-and-talons`) | Melee | — | 3 | 4+ | 3+ | 1 | 2 | Companion |

**SCE-AB-1 `stormcast.ability.deliver-judgement` — Deliver Judgement**
- **Timing:** Once per battle, any combat phase.
- **Declare:** Pick a friendly **non-Hero** unit **wholly within 12"** of this unit.
- **Effect:** This phase the target may use **2 Fight abilities** (an exception to CORE-3.4 / CORE-10.5). As soon as it has
  used the first, it has **Strike-last** for the rest of the phase.

**SCE-AB-2 `stormcast.ability.plan-the-attack` — Plan the Attack**
- **Timing:** Your hero phase (once per phase for this unit, CORE-3.4).
- **Declare:** Pick an objective that you **do not control** (enemy-held or neutral).
- **Effect:** For the rest of the turn, add **+1 to hit rolls** for **combat (melee)** attacks by friendly units that target
  an enemy unit **contesting that objective**. Capped with other hit modifiers at ±1.

### 5.2 `stormcast.unit.lord-veritant` — Lord-Veritant
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 6 | 3+ | 2 | — (5+ while the Gryph-crow is on the battlefield, SCE-AB-4) |

Keywords: **Hero, Priest, Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Staff of Abjuration (`stormcast.weapon.staff-of-abjuration`) | Melee | — | 1 | 3+ | 3+ | 1 | 3 | — |
| Judgement Blade (`stormcast.weapon.judgement-blade`) | Melee | — | 3 | 3+ | 3+ | 1 | D3 | Anti-Wizard (+1 Rend), Anti-Priest (+1 Rend) |

Loadout: the one model carries both weapons.

**SCE-AB-3 `stormcast.ability.cleansing-fires` — Cleansing Fires**
- **Timing:** Your hero phase (once per phase for this unit).
- **Declare:** Pick a **visible** enemy unit **within 12"** of this unit, then make a **chanting roll** of D6.
- **Effect:** On **3+**, roll a D6 for **each model** in the target; each **5+** inflicts **1 mortal damage** on the target.
- Not a Prayer: the ability carries no Prayer keyword and no chanting value. SPH-13.2 (no magic module): the roll is a plain
  declared roll; no ritual points, no penalty on a 1 beyond failing, and it cannot be used through Magical Intervention.

**SCE-AB-4 `stormcast.ability.sense-unholy-sorcery` — Sense Unholy Sorcery**
- **Timing:** Passive.
- **Effect:** The unit's **Gryph-crow** is a token (it starts on the battlefield with the unit). While the Gryph-crow is on
  the battlefield, this unit has **Ward (5+)**. Whenever you roll an **unmodified 1** on a ward roll for this unit, remove
  the Gryph-crow from the battlefield (for the rest of the battle).

### 5.3 `stormcast.unit.prosecutors` — Prosecutors
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 2 | 3+ | 1 | — |

Keywords: **Infantry, Fly, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Stormcall Javelin (thrown) (`stormcast.weapon.stormcall-javelin-ranged`) | Ranged | 10" | 1 | 3+ | 3+ | 1 | D3 | — |
| Stormcall Javelin (`stormcast.weapon.stormcall-javelin`) | Melee | — | 3 | 3+ | 3+ | 1 | 1 | — |

Loadout: all 3 models carry both profiles. No Shoot in Combat.

**SCE-AB-5 `stormcast.ability.heralds-of-righteousness` — Heralds of Righteousness**
- **Timing:** Passive.
- **Effect:** This unit's charge rolls use **1 extra dice** (3D6 instead of 2D6, all summed; see §8).

**SCE-AB-6 `stormcast.ability.skirmishers` — Skirmishers**
- **Timing:** Passive.
- **Effect:** This unit's **coherency range is 2"** (instead of ½", CORE-1.6).

### 5.4 `stormcast.unit.liberators` — Liberators
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 2 | 3+ | 1 | — |

Keywords: **Infantry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Warhammer (`stormcast.weapon.warhammer`) | Melee | — | 2 | 3+ | 3+ | 1 | 1 | Crit (Mortal) |
| Grandhammer (`stormcast.weapon.grandhammer`) | Melee | — | 2 | 3+ | 3+ | 1 | 2 | Crit (Mortal) |

Loadout: 4× Warhammer, 1× Grandhammer.

**SCE-AB-7 `stormcast.ability.stalwart-defenders` — Stalwart Defenders**
- **Timing:** Passive.
- **Effect:** **+3 to this unit's control score** while it contests an objective that is **wholly within friendly territory**
  (added once to the unit's total on that objective, CORE-17.4, not once per model).

---

## 6. Spells and prayers

None. The Lord-Veritant is a Priest but its warscroll grants no prayer, and Spearhead has no lores (SPH-13.2).
Cleansing Fires is an ordinary ability with a declared roll (SCE-AB-3). The **Priest** keyword matters only as a target
keyword for Anti-Priest weapons (this army's own Judgement Blade, and any later army's).

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/stormcast/*.json`), at most a bare-name hook; (b) = new faction code
hook in `src/engine/factions/stormcast.ts` (registered in `code-hooks.ts` as `...stormcastHooks`); (c) = needs an engine
change outside the faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, no printed Ward | (a) | Datasheets as the other armies: `HERO`, `CAVALRY`, `PRIEST`, `INFANTRY`, `FLY`, `REINFORCEMENTS`. Lord-Vigilant base `{ shape: 'oval', mm: 90, mm2: 52 }`. `PRIEST` is a new keyword in data (no engine code reads it except Anti-X). |
| Liberators loadout | (a) | One datasheet with model variants `liberator` ×4 and `liberator-grandhammer` ×1, the Grandhammer **listed last** so list-order allocation kills it last (as the Arkanaut specials). Reinforcement copies keep the loadout (`spawnDestroyedUnitCopy`). |
| Prosecutor javelin (2 profiles), Veritant's 2 weapons | (a) | Two weapon ids per javelin (ranged + melee, same display name, as other dual-profile weapons); every model carries both. |
| Crit (Mortal), Companion, Anti-Wizard / Anti-Priest | (a) | `CRIT_MORTAL`; `COMPANION`; two `{ ability: 'ANTI', keyword: 'WIZARD', value: 1 }` / `{ … 'PRIEST' … }` entries (attack.ts `antiBonus` adds +1 Rend per matching entry, cumulative per CORE-12.2). |
| Fly (Prosecutors) | (a) | Existing FLY handling in `phases/movement.ts` and `phases/charge.ts`. |
| Reinforcements (Prosecutors, Liberators) | (a) | Core `spearheadCallForReinforcements`. The two Heroes cannot be replaced. |
| SCE-AB-6 Skirmishers | (a) | Datasheet `coherencyRange: 2` (CORE-1.6). First army to use it; movement, charge, fight, setup, cards, reinforcement and redeploy planners already read it. |
| SCE-ENH Hallowed Scrolls | (a) | Passive enhancement, scope bearer, `{ feelNoPain: 5 }` (as Masterwrought Armour / Armour of Gork). |
| SCE-ENH Morrda's Talon | (a) | Passive enhancement, scope bearer, `{ when: { weaponId: 'stormcast.weapon.hallowed-greataxe' }, grantWeaponAbility: { ability: 'CRIT_MORTAL' } }` (hooks-impl merges granted weapon abilities, as Champion Duellist). |
| SCE-BT-1 Shield of Azyr | (b) `stormcastShieldOfAzyr` | The three plain "give X to a unit" abilities share one factory (`grantHook` in `stormcast.ts`) and are registered under three code names (`stormcastShieldOfAzyr`, `stormcastStormCharge`, `stormcastQuicksilverDraught`), because `ActivatedAbilityHook.targets` does not receive the ability id and so cannot tell the descriptors apart. Activated; resolve grants `params.grant` (Effect[]) to the declared target, or to the user's own unit when the descriptor declares no target, for the descriptor `duration`, via `ctx.services.effects.grant(…, { sourceAbilityId, sourceUnitId, scope: { who: 'self' }, duration })`, then `announce`. The effects sit in `params.grant`, **not** `effect`, so `unitHasEffectFlag` never reads them as a passive. Shield of Azyr: `phase command / your`, `limit oncePerTurnArmy`, declare any friendly unit, `params.grant [{ feelNoPain: 5 }]`, `duration untilNextTurn`. |
| SCE-BT-2 Storm Charge | (b) `stormcastStormCharge` | `phase charge / your`, `params.window 'phaseStart'` (the F10 `chargeStart` window, before any unit is picked to charge, so the timing is exact), `limit oncePerBattle`, declare a friendly unit (`targets` keeps those `!inCombat`), `params.grant [{ chargeAfterAdvance: true }]`, `duration untilEndOfTurn` (hooks-impl answers `onEligibility` charge after `advance`). |
| SCE-ENH Quicksilver Draught | (b) `stormcastQuicksilverDraught` | `phase fight / any`, `oncePerBattle`, no declare (the bearer's unit), `params.grant [{ fightsFirst: true }]`, `duration untilEndOfPhase`. Offered in combat-phase step 1, before fight.ts snapshots the Strike-first queue (CORE-10.6). |
| SCE-RA-1 Strike Where Needed | (b) `stormcastStrikeWhereNeeded` | The STD-RA-2 Fearless Invaders shape, as its own hook (that one announces under its own name): data timing `{ kind: 'reaction', trigger: 'youDeclared', abilityId: 'core.move' }` (abilities.ts offers it in the F8 `moveDeclared` window, before the retreat D3 roll), `limit oncePerBattle`. `canUse`/`targets`: `readDeclaredMove(state)` is a `fallBack` by a friendly unit. Resolve grants `[{ noRetreatDamage: true }, { chargeAfterFallBack: true }]` until end of turn. Factor `retreatingUnit` / `invadersTargets` out of `slaves.ts` into `aos-common.ts` (or export them) rather than copying. AI: generalise `slavesFreeRetreatAvailable` to accept this code too and to honour `oncePerBattle`. |
| SCE-RA-2 Blaze of Glory | (b) `stormcastBlazeOfGlory` | Activated, `phase fight / any`, `oncePerBattle`, declare friendly `inEngagement`. Resolve grants an empty marker effect (scope self, `untilEndOfPhase`). `onOwnModelSlain` (attack.ts `ownModelSlain` already dispatches the regiment ability): when the slain model's unit carries this marker, roll D6 (`params.succeedOn` 4); on success pick an enemy unit in combat with that unit (the attacker `by.unitId` when it is in combat with it, else the one with the fewest wounds left; judged from the slain model's snapshot when it was the last), and deal `params.mortal` (1) through `deferMortalAfterFight` inside an attack sequence, `inflictMortal` otherwise (as GLO-RA-2 Frazzleboom). |
| SCE-ENH Null Pendant | (b) `stormcastNullPendant` | Activated, `endOfTurn / any`, `oncePerBattle` (the `turn.end.abilities` step runs before `turn.end.control`, CORE-4.19, so it lands on this turn's control check). `canUse`: the general's unit contests ≥1 objective that an enemy unit also contests. Resolve: one D6 per enemy unit contesting any objective the general contests (`unitContestsObjective`); each 2+ is stored in `mission.custom.sceNull[enemyUnitId] = { roll, round, turn }`; a battle-long marker on the bearer (`ensureEffects`, as LRL Scattered to the Winds) lets `produce` at `onObjectiveControl` return `{ kind: 'stat', delta: -roll }` for `contestingUnitId` while the stored round/turn is the current one. The caller keeps the CORE-17.4 floor of 1. |
| SCE-AB-1 Deliver Judgement | (b) `stormcastDeliverJudgement` + (c) C1 | Activated, `phase fight / any`, `oncePerBattle`, declare friendly `notKeyword HERO` (hook checks `whollyWithinUnit(target, self, 12)`). Resolve: `grantExtraFight(ctx.state, target, { strikeLastAfterFirst: true })` (C1). AI: the non-Hero unit in combat with the most attacks (Liberators), only when it is in combat at the start of the phase. |
| SCE-AB-2 Plan the Attack | (b) `stormcastPlanTheAttack` | Activated, `phase command / your`. `modesFor` = live objectives the player does not control (`mission` control state), best first for the AI (most friendly units within 12", then most enemy Control on it). Resolve stores `mission.custom.scePlan[player] = { objectiveId, round, turn }`. While that ledger names the current turn, `ensureEffects` keeps an `untilEndOfTurn` marker on every friendly unit on the battlefield (so a unit set up later this turn is covered and the Lord-Vigilant's death changes nothing); `produce` at `onHitRoll` answers `{ kind: 'roll', modifier: 1 }` for a **melee** attack by the marker's holder whose target `unitContestsObjective(target, obj)` (as LRL Eye of the Storm, attacker side, sign flipped). |
| SCE-AB-3 Cleansing Fires | (b) `stormcastCleansingFires` | Activated, `phase command / your`, data `roll { dice: 'D6', succeedOn: 3 }` (abilities.ts rolls it; failure uses the ability up), declare enemy within self 12"; `targets` keeps `losService.unitVisible` (as FYR Throwing Axes). Resolve: roll `liveModels(target).length` D6 (`perDie`), count ≥ `params.successOn` (5), `inflictMortal(ctx, use, target, n)`. |
| SCE-AB-4 Sense Unholy Sorcery | (b) `stormcastSenseUnholySorcery` + (c) C3 | Token: patrol entry `tokens: { "gryph-crow": 1 }` (PatrolUnitData.tokens → `unit.tokens`, SPH-2.7). Ward: `adjustFeelNoPain` answers `{ threshold: params.ward (5), modifier: 0 }` for the holder's models while `unit.tokens['gryph-crow'] > 0` (as FYR Duty Unto Death). Removal: `afterWardRoll` (C3) sets the token to 0 and announces when any die of a ward roll for the holder unit is an unmodified 1. |
| SCE-AB-5 Heralds of Righteousness | (a) + (c) C2 | Passive descriptor, scope self, `{ extraChargeDice: 1 }` (new Effect field, C2). |
| SCE-AB-7 Stalwart Defenders | (b) `stormcastStalwartDefenders` | Passive marker (`ensureEffects`, battle-long, on the holder); `produce` at `onObjectiveControl` returns `{ kind: 'stat', delta: params.control (3) }` when `contestingUnitId` is the holder and the objective's marker disc (`obj.radius ?? objectiveMarkerRadius`) lies wholly inside `territoryOf(state, holder.player)` (helper `objectiveWhollyInTerritory(state, obj, player)` in the faction file, `whollyWithinPolygon` on a circle footprint). On the Fire and Jade maps the two objectives in each half (z = ±7, radius 3) qualify; the centre one does not. |

**Engine changes (c):**
- **C1 extra Fight ability** (`phases/fight.ts`, export): `grantExtraFight(state: GameState, unitId: UnitId, opts?: {
  strikeLastAfterFirst?: boolean }): void` writes the phase mark `fi:extra:<unitId>=<json { left: 1, strikeLast }>`.
  `eligibleFighters` lets a unit that is in `fight.fought` through again while its mark has `left > 0` (still subject to
  CORE-10.2 eligibility and to Strike-last waiting). `finishUnit`, for a unit with such a mark that has not used it, sets
  `turn.fightsLast = true` when `strikeLast` (CORE-10.7: it now waits until every other unit in combat has fought; CORE-10.8 still
  cancels against Strike-first) and keeps it pickable; after the second activation it decrements `left` to 0. The second
  activation is exempt from CORE-3.3 / 3.4 / 10.5 for that unit only. If the unit is first picked in the Strike-first step,
  the second pick falls into the `remaining` step. No contract types change (marks only).
- **C2 extra charge dice** (`src/data/types.ts` Effect + `src/data/schema` effect definition, `hooks-impl.ts`, `phases/charge.ts`,
  `events.ts` additive): Effect gains `extraChargeDice?: number`. `hookService.chargeDiceBonus(state: GameState, unitId: UnitId):
  number` sums it over the unit's passive descriptors and active effects (attached halves included). `driveCharge` rolls
  `cardChargeDice(s, unitId) + hookService.chargeDiceBonus(s, unitId)` dice, summed (Grasping Vines' "one fewer" then gives 2).
  `chargeRollUnmodified` is the sum of all dice. The reachability pre-check ("can it reach with at most 12") uses `6 × dice`.
  `ChargeState.roll` and the frozen `ChargeRolled.dice: [number, number]` keep the first two dice; `ChargeRolled` gains optional
  `allDice?: number[]` (additive) so the dice tray can show the third die. AI charge odds (`src/ai`) must use the dice count.
  Note in `docs/spec/13-engine-port-plan.md`.
- **C3 ward-roll observer** (`code-hooks.ts` EngineCodeHook additive, `attack.ts` `resolvePool`): `afterWardRoll?(ctx: EngineContext,
  entry: HookSourceEntry, info: { unitId: UnitId; dice: number[]; needed: number }): void`, called once per ward roll, after the
  dice are read, for each hook source held by the warded unit. The dice of that same roll still use the ward they were rolled
  against (the crow leaves after the roll, not mid-roll).

---

## 8. Engine notes

1. **Heralds of Righteousness** [RULING]: "roll 1 additional dice" for a charge roll = 3D6, all three summed (the core rules have no
   discard step). Ironjawz-style "unmodified charge roll" tests and a charge re-roll see the 3-dice total.
2. **Deliver Judgement order:** combat-phase step 1 (abilities) → the target fights normally when picked → after that activation it
   has Strike-last → it is picked again once every other unit in combat has fought (or when only Strike-last units remain).
   [interp] A target that is not in combat and did not charge cannot fight at all, so the AI only picks a unit in combat. If the
   second activation finds no enemy in range it still piles in (CORE-6.11) and then has no targets.
3. **Sense Unholy Sorcery** [RULING]: any unmodified 1 on any ward roll for the Lord-Veritant removes the crow, including a ward from
   Shield of Azyr; a 1 never saves anyway. With the crow gone the unit has no ward unless another source gives one.
4. **Strike Where Needed** is a reaction to the Retreat declaration, so the retreat damage is waived before it is rolled; it only
   exists in your movement phase (Retreat is a movement-phase ability).
5. **Null Pendant** [RULING]: if the general contests more than one objective, every enemy unit contesting any of them is rolled
   for, once each. The reduction lasts for this turn's control check only and cannot take a unit below a control score of 1
   (CORE-17.4).
6. **Plan the Attack** [interp]: "an objective you do not control" is judged when the ability is declared; the bonus keeps working
   for the rest of the turn even if control changes. The +1 applies to Companion attacks too (a hit modifier, not a weapon
   characteristic, CORE-12.4).
7. **Blaze of Glory** [RULING]: it triggers on any slain model of the unit this phase (combat attacks, mortal damage), not only on
   melee kills; the enemy unit must be in combat with the slain model's unit when the roll is made.
8. **Ward sources:** Shield of Azyr (5+, any unit), Hallowed Scrolls (5+, general), Gryph-crow (5+, Lord-Veritant). None stack.
9. **AI:** (the ability-use options carry no unit hint, so `stormcastAbilityTiming` falls back to the general for the three general-bound abilities: Quicksilver Draught, Null Pendant, Deliver Judgement) Shield of Azyr — the friendly unit in combat with the most enemy attacks nearby, else the unit holding the most contested
   objective; Storm Charge — only for a unit that ran this turn and has an enemy within its charge reach; Strike Where Needed — the
   first Retreat it can cover; Blaze of Glory — the friendly unit in combat with the most models (Liberators), at the start of a
   combat phase in which an enemy unit in combat with it is still to fight; Deliver Judgement — Liberators, then Prosecutors, only
   if in combat; Plan the Attack — every hero phase when a friendly unit is within 12" of an objective it does not control;
   Cleansing Fires — the visible enemy unit with the most models; Quicksilver Draught — when the general is in combat and did not
   charge; Null Pendant — only when it flips or keeps an objective at this end of turn.
10. **Defaults for the sim:** regiment Blaze of Glory and enhancement Hallowed Scrolls; variant games use Strike Where Needed and
    Morrda's Talon (the last entries in the patrol lists).

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| SCE-ARMY-1 | Vigilant Brotherhood builds: Lord-Vigilant general + Lord-Veritant + 3 Prosecutors + 5 Liberators, 10 models, stats as §5. |
| SCE-ARMY-2 | Liberators carry 4 Warhammers and 1 Grandhammer (Grandhammer model allocated last); Prosecutors carry both javelin profiles. |
| SCE-ARMY-3 | Reinforcements only on Prosecutors and Liberators; the two Heroes are never offered for replacement. |
| SCE-ARMY-4 | The Lord-Veritant starts with 1 Gryph-crow token; the token is not a model (no base, no Control, not targetable). |
| SCE-BT-1 | Shield of Azyr: any friendly unit gets Ward (5+) until your next turn; once per turn for the army, your hero phase only. |
| SCE-BT-2 | Storm Charge: offered at the start of your charge phase, once per battle; a unit that ran this turn may then charge; not a unit in combat. |
| SCE-RA-1 | Strike Where Needed: offered when a friendly unit declares a Retreat; no retreat mortal damage; that unit may charge this turn; once per battle. |
| SCE-RA-2 | Blaze of Glory: until end of phase each slain model rolls a D6, 4+ deals 1 mortal damage to an enemy unit in combat with the unit; once per battle. |
| SCE-ENH-1 | Hallowed Scrolls gives the general Ward (5+). |
| SCE-ENH-2 | Morrda's Talon: Hallowed Greataxe critical hits deal 2 mortal damage and skip wound and save; the Beak and Talons do not. |
| SCE-ENH-3 | Quicksilver Draught: the general has Strike-first this combat phase only; once per battle. |
| SCE-ENH-4 | Null Pendant: one D6 per enemy unit contesting the general's objective; 2+ subtracts the roll from that unit's control score this turn (floor 1); 1 does nothing. |
| SCE-AB-1 | Deliver Judgement: a non-Hero unit wholly within 12" fights twice this phase and has Strike-last after its first fight; Heroes and units beyond 12" cannot be picked; once per battle. |
| SCE-AB-2 | Plan the Attack: only an objective you do not control; +1 to hit for friendly melee attacks on units contesting it, rest of turn; ranged attacks unaffected. |
| SCE-AB-3 | Cleansing Fires: chanting roll 3+ then one D6 per target model, each 5+ is 1 mortal damage; 1-2 does nothing; target visible and within 12". |
| SCE-AB-4 | Sense Unholy Sorcery: Ward (5+) while the crow is present; an unmodified 1 on a ward roll removes the crow and the ward with it. |
| SCE-AB-5 | Heralds of Righteousness: Prosecutors roll 3D6 (summed) for charges; other units roll 2D6. |
| SCE-AB-6 | Skirmishers: Prosecutors stay coherent at up to 2" apart; other units need ½". |
| SCE-AB-7 | Stalwart Defenders: +3 control score on an objective wholly within friendly territory; nothing on the centre or enemy objectives. |
| SCE-WEAP-1 | Warhammer / Grandhammer Crit (Mortal) deals Damage as mortal damage on an unmodified 6 to hit. |
| SCE-WEAP-2 | Judgement Blade gets +1 Rend against a Wizard, +1 against a Priest, +2 against a unit that is both. |
| SCE-WEAP-3 | Companion Beak and Talons ignore friendly weapon-characteristic modifiers. |
| SCE-FLY-1 | Prosecutors move over models (Fly); the Lord-Vigilant, Lord-Veritant and Liberators do not. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own storm-knight livery): burnished gold plate with deep midnight-blue panels and cloth,
silver-white trims, pale cyan glowing eye-slits and lightning accents, white feathers. Shared motif: an original
three-pronged lightning-fork-in-a-ring badge. No GW logos, no copied Stormcast hammer-and-comet icons, sigils or Stormhost
heraldry. All figures are in the house figure style (docs/FIGURE-STYLE.md); the
Gryph-stalker is a chunky beast.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `sce-lord-vigilant` | Lord-Vigilant on Gryph-stalker | 1 | 90×52 oval | Mount (Gryph-stalker) | An armoured storm-knight lord with a huge gold helm with a midnight-blue crest and glowing cyan eye-slit, short legs, gripping an oversized double-bladed greataxe, riding a chunky beast that mixes a big-eyed hawk head and a lean four-legged hound body with folded wings, short thick legs and a fluffy feathered tail. |
| `sce-lord-veritant` | Lord-Veritant | 1 | 40 round | No | A storm-knight witch-hunter with a huge gold helm wrapped by a blue cloth blindfold band, short legs, a long dark-blue cloak, a sword in one hand and a tall staff topped with a little burning cyan-flame brazier in the other. |
| `sce-gryph-crow` | Lord-Veritant's Gryph-crow (token) | 1 | none (token, sits beside the Veritant) | No | A small chubby crow-griffin, round body with head and big eyes, dark blue-black feathers with a gold beak and a pale cyan glint in its eyes, perched alert with wings half-spread. Hidden when the token is removed. |
| `sce-prosecutor` | Prosecutors | 1 (×3) | 40 round, flying stand | No | A winged storm-knight with a huge gold helm and glowing cyan visor, short dangling legs, big white feathered wings made of light, holding a long crackling javelin overhead ready to throw, hovering on a clear stem. |
| `sce-liberator` | Liberators (Warhammer) | 1 (×4) | 40 round | No | A heavy storm-knight infantryman with a huge rounded gold helm and blue plume, short legs planted wide, a big tower shield with an original lightning-ring badge in one hand and a chunky one-handed warhammer in the other. |
| `sce-liberator-grandhammer` | Liberators (Grandhammer) | 1 | 40 round | No | The same storm-knight infantryman without a shield, swinging an oversized two-handed hammer with a glowing cyan head over one shoulder. |

The Grandhammer model gets its own figure because its weapon differs in the rules (and players need to see whether it is
still alive). No champion (Prime) or musician variants: the Spearhead gives them no rules.

---

## 11. Implementation notes

Built (F12). Data `src/data/factions/stormcast/` (`faction.json`, `abilities.json`, `enhancements.json`, `weapons.json`,
`datasheets/{lord-vigilant,lord-veritant,prosecutors,liberators}.json`, `patrols/vigilant-brotherhood.json` with the Gryph-crow
token on the Lord-Veritant entry; Blaze of Glory and Hallowed Scrolls are the defaults and come first, Strike Where Needed and
Morrda's Talon are the last entries and so the sim's variant games), hooks `src/engine/factions/stormcast.ts` (`...stormcastHooks`
in `code-hooks.ts`), AI hints `stormcastAbilityTiming` / `stormcastTargetBonus` / `stormcastModeBonus` read from
`src/ai/utility.ts` next to the other armies' (three one-line hooks; the dispatch there is by code prefix). Tests:
`tests/engine/stormcast.test.ts` (SCE-BT, RA, ENH, AB, WEAP, FLY, ARMY-3, plus SCE-REG and the AI hints) and
`tests/data/stormcast.test.ts` (SCE-ARMY-1, 2, 4, SCE-WS). Engine changes C1-C3 landed in the engine-core stage
(`docs/spec/13-engine-port-plan.md` §3.11); everything else is data plus the faction file.

Shipped behaviours worth knowing:
- Plan the Attack stores its pick in `mission.custom.scePlan[player]`; a marker effect (`untilEndOfTurn`) is kept on every friendly
  unit on the battlefield while the pick names the current turn (`ensureEffects` runs at the top of each ability window, so a unit set
  up later in the turn is marked before the next attack). The Companion Beak and Talons get the +1 to hit as well (a hit modifier).
- Null Pendant keeps its rolls in `mission.custom.sceNull[enemyUnitId]` (roll, round, turn, owner) and `produce` at
  `onObjectiveControl` subtracts them; stale rolls are dropped by `ensureEffects`.
- Blaze of Glory is a marker effect on the picked unit for the phase; the vengeance mortal damage uses `deferMortalAfterFight` inside
  an attack sequence and `attackService.queueMortalWounds` otherwise. When the slain model's attacker is in combat with the unit it is
  the one hit, otherwise the enemy unit in combat with the fewest wounds left.
- The sim exercises every ability (24+ games with each enhancement), the bot picks the first of the best-first Plan the Attack
  objectives, and holds Storm Charge, Quicksilver Draught, Null Pendant, Blaze of Glory and Deliver Judgement until they matter.

Existing mechanisms this army reuses: `moveDeclared` reaction window (F8, Strike Where Needed), `chargeStart` window
(F10, Storm Charge), effect flags `noRetreatDamage` / `chargeAfterFallBack` / `chargeAfterAdvance` / `fightsFirst`,
`turn.fightsLast` (Strike-last), `onOwnModelSlain` + `deferMortalAfterFight` (Blaze of Glory), `onObjectiveControl`
`produce` deltas (Stalwart Defenders, Null Pendant), `onHitRoll` `produce` (Plan the Attack), `adjustFeelNoPain` (Gryph-crow
ward), `unit.tokens` (SPH-2.7), datasheet `coherencyRange`, `ANTI` with a keyword, `grantWeaponAbility`.
