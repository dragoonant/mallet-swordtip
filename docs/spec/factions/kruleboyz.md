# Kruleboyz — Swampskulka Gang (Spearhead)

Faction id: `kruleboyz` · Army id: `kruleboyz.army.swampskulka-gang` · Grand alliance: Destruction (Orruk Warclans).
Source: `docs/sources/spearhead-kruleboyz-swampskulka-gang.pdf` (9 pages, gitignored), the official Games Workshop
**Spearhead: Orruk Warclans — Swampskulka Gang** rules PDF (Warhammer Community downloads, Age of Sigmar). PDF metadata:
created 2024-12-04, last modified 2025-10-27; the local copy was fetched 2026-10-29. The exact download URL was not
recorded when the file was fetched (no Zone.Identifier stream, and a web search did not turn it up). Fill it in here
the next time the file is downloaded. Page 3 is a photo only. Mechanics and numbers are ported 1:1. All wording below
is our own. Rule IDs `KRU-*` double as test IDs (§9).

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat
range of an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase =
`fight`. Rend is stored as `AP` (negative = more Rend); a printed Rend "-" is 0. This army is a separate faction from
`ironjawz` (same grand alliance, no shared rules).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `kruleboyz.unit.killaboss-on-great-gnashtoof` | Killaboss on Great Gnashtoof | 1 | **General** | no | 90×52 oval (estimate, not stated in source) |
| `kruleboyz.unit.murknob-with-belcha-banna` | Murknob with Belcha-banna | 1 | Unit | no | 40 round (estimate, not stated) |
| `kruleboyz.unit.man-skewer-boltboyz` | Man-skewer Boltboyz | 3 | Unit | no | 32 round (estimate, not stated) |
| `kruleboyz.unit.gutrippaz` (a) | Gutrippaz | 5 | Unit | no | 32 round (estimate, not stated) |
| `kruleboyz.unit.gutrippaz` (b) | Gutrippaz | 5 | Unit | no | 32 round (estimate, not stated) |
| `kruleboyz.unit.beast-skewer-killbow` | Beast-skewer Killbow | 1 | Unit | no | 90×52 oval (estimate, not stated) |

Total: 6 units, 16 models. The two Gutrippaz units share one warscroll. Ranged weapons: Boltboyz and Killbow. There is no
Wizard or Priest, no Monster and no Ward on any warscroll.

**Reinforcements:** none. No warscroll prints the Reinforcements keyword (checked on the rendered pages, not just the text
layer). Call for Reinforcements is therefore never offered to this army.

Base sizes: the PDF gives none. The figures above are estimates from the box photo on page 3 (the Gnashtoof and the
Killbow sit on large ovals, the Murknob on a medium round, the foot orruks on standard rounds). Check them against the
retail box before the data lands.

---

## 2. Battle trait

### KRU-BT-1 `kruleboyz.ability.kruleboyz-waaagh` — Kruleboyz Waaagh!
- **Timing:** Once per battle (army), any combat phase (yours or the opponent's).
- **Declare:** The general uses it, so the general must be on the battlefield. Pick one **other** friendly unit that is
  **wholly within 12"** of the general as the target.
- **Effect:** For the rest of this phase, the general and the target both have **Strike-first**.

---

## 3. Regiment abilities (pick 1 at army selection)

### KRU-RA-1 `kruleboyz.ability.covered-in-mud` — Covered in Mud
- **Timing:** Start of the first battle round (once per battle in practice: the window only exists in round 1).
- **Declare:** Pick 1 friendly unit.
- **Effect:** For the rest of the battle, that unit **cannot be seen by enemy models more than 12" away from it**. Line
  of sight is unchanged within 12". The distance is measured from the observing enemy model to the closest model of the
  unit, the same way range is measured.

### KRU-RA-2 `kruleboyz.ability.noisy-racket` — Noisy Racket
- **Timing:** Passive.
- **Effect:** During the **first battle round**, attacks made by enemy units get **−1 to wound**. This covers shooting
  and combat in both players' turns. It caps with other wound modifiers at ±1 (CORE-2.5).

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `kruleboyz.enh.kunnin-plan` | Kunnin' Plan | Once per turn, your hero phase | Declare: pick a friendly unit **wholly within 12"** of the general (the general itself qualifies). Effect: if that unit **Retreats** this turn, it suffers **no mortal damage** for retreating, and it may still use **Shoot** and/or **Charge** abilities later this turn. |
| `kruleboyz.enh.morks-eye-pebble` | Mork's Eye Pebble | Once per battle, **enemy** movement phase | Effect: during the next shooting phase (the opponent's shooting phase that same turn), friendly units have **Ward (5+)** while they are **wholly within 12"** of the general. The range is checked at each ward roll. |
| `kruleboyz.enh.egomaniak` | Egomaniak | Passive | Each time a damage point would be allocated to the general while any **other** friendly unit is within the general's **combat range** (3"), roll a D6. On **4+** that point **must** go to one of those units instead. |
| `kruleboyz.enh.eye-biter-ash` | Eye-biter Ash | Once per battle, any combat phase | Declare: pick an enemy unit **in combat with the general** and roll a D6. Effect: on **1–4** that unit gets **−1 to hit** for the rest of this **phase**. On **5+** it gets −1 to hit for the rest of the **battle**. |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control. No warscroll prints a Ward. Keywords are as printed (Spearhead warscrolls
print no faction keywords). Weapon ability shorthand: Crit (Mortal) = a critical hit deals mortal damage equal to
Damage and skips the wound and save rolls; Crit (Auto-wound) = a critical hit wounds automatically (CORE-12.6);
Companion = the weapon ignores friendly abilities that change its characteristics or attack sequence (CORE-12.4, already
in `attack.ts`; All-out Attack, CORE-5.11, still applies).

### 5.1 `kruleboyz.unit.killaboss-on-great-gnashtoof` — Killaboss on Great Gnashtoof (General)
| Move | Health | Save | Control |
|---|---|---|---|
| 10" | 10 | 3+ | 2 |

Keywords: **Hero, Cavalry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Jagged Boss-stikka (`kruleboyz.weapon.jagged-boss-stikka`) | Melee | — | 4 | 3+ | 3+ | 1 | 2 | Crit (Mortal) |
| Gnashtoof's Bone-crushing Fangs (`kruleboyz.weapon.gnashtoof-fangs`) | Melee | — | 5 | 4+ | 3+ | 1 | 2 | Companion |

**KRU-AB-1 `kruleboyz.ability.all-part-of-da-plan` — All Part of Da Plan**
- **Timing:** Your hero phase. No printed limit, so once per phase for this unit (CORE-3.4).
- **Declare:** Pick a friendly unit **wholly within 9"** of this unit. This unit cannot pick itself.
- **Effect:** **+3 to the target's control score** (added once to the unit's total on an objective, not to each model's Control) until the start of your next turn.

### 5.2 `kruleboyz.unit.murknob-with-belcha-banna` — Murknob with Belcha-banna
| Move | Health | Save | Control |
|---|---|---|---|
| 5" | 6 | 4+ | 5 |

Keywords: **Hero, Infantry** (so Guarded Hero, CORE-14.2, applies)

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Murknob Cleaver (`kruleboyz.weapon.murknob-cleaver`) | Melee | — | 4 | 4+ | 3+ | 1 | 2 | Crit (Mortal) |

**KRU-AB-3 `kruleboyz.ability.breath-of-the-mire-drakes` — Breath of the Mire-drakes**
- **Timing:** Any combat phase. No printed limit, so once per phase (CORE-3.4).
- **Declare:** Usable only while this unit is in combat. Roll a D6 for **each** enemy unit in combat with it.
- **Effect (per enemy unit):** 1 = nothing; 2–5 = **1 mortal damage**; 6 = **D3 mortal damage**.

### 5.3 `kruleboyz.unit.man-skewer-boltboyz` — Man-skewer Boltboyz
| Move | Health | Save | Control |
|---|---|---|---|
| 5" | 2 | 5+ | 1 |

Keywords: **Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Man-skewer Crossbow (`kruleboyz.weapon.man-skewer-crossbow`) | Ranged | 18" | 2 | 4+ | 3+ | 1 | 2 | Crit (Auto-wound) |
| Jaggedy Blade (`kruleboyz.weapon.jaggedy-blade`) | Melee | — | 1 | 4+ | 3+ | 0 | 1 | Crit (Mortal) |

**KRU-AB-5 `kruleboyz.ability.pick-em-off` — Pick 'Em Off**
- **Timing:** Passive.
- **Effect:** **+1 to hit** for this unit's **shooting** attacks if it has **not used a Move ability this turn**. Normal
  move, Run, Retreat and charge moves all count as Move abilities, and so does any out-of-phase move granted by an
  ability. A unit that stayed still in its movement phase, or that is shooting in the opponent's turn without having
  moved, gets the bonus.

### 5.4 `kruleboyz.unit.gutrippaz` — Gutrippaz
| Move | Health | Save | Control |
|---|---|---|---|
| 5" | 2 | 5+ | 1 |

Keywords: **Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Wicked Hacka (`kruleboyz.weapon.wicked-hacka`) | Melee | — | 2 | 4+ | 3+ | 0 | 1 | Crit (Mortal) |

**KRU-AB-4 `kruleboyz.ability.scare-taktikz` — Scare Taktikz**
- **Timing:** Any combat phase. No printed limit, so once per phase per unit (CORE-3.4).
- **Effect:** Roll a D6. On **3+**, attacks that **target this unit** get **−1 to hit** for the rest of this phase,
  **except** attacks made by **Hero** units. It caps with cover, Guarded Hero and Eye-biter Ash at −1 (CORE-2.5).

### 5.5 `kruleboyz.unit.beast-skewer-killbow` — Beast-skewer Killbow
| Move | Health | Save | Control |
|---|---|---|---|
| 5" | 5 | 5+ | 2 |

Keywords: **War Machine**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Beast-skewer Bolts (`kruleboyz.weapon.beast-skewer-bolts`) | Ranged | 24" | 2 | 4+ | 2+ | 2 | D6 | Crit (Auto-wound) |
| Jaggedy Blades (`kruleboyz.weapon.jaggedy-blades`) | Melee | — | 2 | 4+ | 3+ | 0 | 1 | Crit (Mortal) |

(The Killbow crew's melee weapon is "Jaggedy Blade**s**", 2 Attacks. The Boltboyz carry the 1-Attack "Jaggedy Blade".
These are two separate weapon ids.)

**KRU-AB-2 `kruleboyz.ability.skewered` — Skewered**
- **Timing:** Passive.
- **Effect:** The Beast-skewer Bolts have **Damage 6** instead of D6 when the target has the **Monster** keyword.

---

## 6. Spells and prayers

None. The army has no Wizard, no Priest and no lore.

---

## 7. Mechanics mapping

(a) = expressible with existing data (`src/data/factions/*/abilities.json` descriptors: `timing`, `limit`, `when`,
`effect`, `scope`, `duration`, `params`); (b) = new faction code hook in `src/engine/factions/kruleboyz.ts`, exported as
`kruleboyzHooks` and spread into `code-hooks.ts` like `fyreslayersHooks`. Activated abilities always need an `activate`
block (abilities.ts has no generic grant). Shared helpers come from `aos-common.ts`: `onBoard`, `whollyWithinUnit`,
`enemiesInCombat`, `inflictMortal`, `announce`, `paramOf`. (c) = engine change.

| Rule | Class | How |
|---|---|---|
| Stats, keywords HERO / CAVALRY / INFANTRY / WAR MACHINE | (a) | Datasheets as the other four armies; no `ward`, no `REINFORCEMENTS`. Base shapes per §1 (`Base { shape: 'oval', mm, mm2 }`). |
| Crit (Mortal), Crit (Auto-wound), Companion | (a) | Weapon abilities `CRIT_MORTAL`, `CRIT_AUTO_WOUND`, `COMPANION` (attack.ts already handles all three; Companion weapons skip `effectiveWeapon`). |
| Reinforcements | (a) | Nothing to do: no unit has the keyword, so `spearhead-core.ts` never offers Call for Reinforcements. |
| KRU-BT-1 Kruleboyz Waaagh! | (b) `kruleboyzWaaagh` | Battle trait, `timing { kind: 'phase', phase: 'fight', whose: 'any' }`, `limit oncePerBattle`, `params.army: true`, `params.range: 12`. `canUse` = general on board and `targets` non-empty. `targets` = other friendly units on board with `whollyWithinUnit(t, general, 12)`. Resolve: `effects.grant` `{ fightsFirst: true }` (scope self, `duration 'untilEndOfPhase'`) on the general and on the target. fight.ts already reads `fightsFirst` through `eligibilityFor(..., 'fightFirst')`. The use must be offered in the start-of-combat window, before the first fight pick. AI: use it in the first combat phase where the general is in combat and some other unit wholly within 12" is in combat too (pick the one in combat with the most enemy models). |
| KRU-RA-1 Covered in Mud | (b) `kruleboyzCoveredInMud` + (c) | Regiment ability, `timing startOfRound / your`, `limit oncePerBattle`, `params.round: 1`, gate `state.round === params.round` (the Magmic Tunnels pattern). Target = 1 friendly unit on board. Resolve: grant `{ hiddenBeyond: 12 }` (scope self, `duration 'battle'`). **Engine (c):** add `hiddenBeyond?: number` to `Effect` in `src/data/types.ts` plus `common.schema.json` ("the holder unit is not visible to enemy models more than this many inches away"). In `src/engine/los.ts` add `export function hiddenBeyondFor(state: GameState, unitId: UnitId): number \| null` (lowest `hiddenBeyond` among `unit.effects`, else null) and `function hiddenFrom(state: GameState, observer: Model, targetUnitId: UnitId): boolean` (the observer belongs to the other player, and the observer's distance to the closest model of the target unit, measured as the range check measures it, is greater than N + EPS). `visible`, `visibleFrom`, `fullyVisible`, `unitVisible` and `unitFullyVisible` return false when `hiddenFrom` is true. Everything else (shooting targets, Throwing Axes, Ironweld Discipline, the AI's target lists) follows through losService. "In combat" is unaffected because 3" < 12". Note: `targetRangeCap` in code-hooks.ts looks similar but is not wired into the AoS shooting phase, and it only covers ranged attacks, so it cannot replace this change. AI: pick the Killbow if alive, else the Boltboyz. |
| KRU-RA-2 Noisy Racket | (a) | Passive regiment descriptor: `effect { modifyRoll: { roll: 'wound', value: -1 } }`, `scope { who: 'enemy' }` (no `within`), `when { round: { lte: 1 } }`. Regiment abilities sit on every unit of the army (hooks-impl.ts), and R-10.11 counts one source once, so the −1 applies a single time. The modifier sits on the attacker's side, so `scope enemy` matches the attacking unit. |
| KRU-ENH Kunnin' Plan | (b) `kruleboyzKunninPlan` | Enhancement, `timing phase command / your`, `limit oncePerTurn`, `params.range: 12`. Targets = friendly units on board wholly within 12" of the bearer, bearer included (like `slavesOathOfSupremacy`). Resolve: grant `[{ noRetreatDamage: true }, { shootAfterFallBack: true }, { chargeAfterFallBack: true }]`, `duration 'untilEndOfTurn'` (the `slavesFearlessInvaders` pattern plus `shootAfterFallBack`, which shooting.ts:119 already honours). All three only matter if the unit actually retreats. AI: target a unit in combat that the AI plans to retreat; if none, skip. |
| KRU-ENH Mork's Eye Pebble | (b) `kruleboyzMorksEyePebble` | Enhancement, `timing phase movement / enemy`, `limit oncePerBattle`, `params { ward: 5, range: 12 }`. Resolve: grant on the general `{ feelNoPain: 5, when: { phase: 'shooting' } }`, `scope { who: 'friendly', within: 12, wholly: true }`, `duration 'untilEndOfTurn'`. This is the `fyreslayersPlantTheIcon` aura plus a phase gate, so the range is read at each ward roll and the general counts itself. Check that the activation loop opens an **enemy movement phase** window for the non-active player (Ironweld Discipline already uses an enemy-phase window). AI: use it when the opponent has a ranged unit within its weapon range of a Kruleboyz unit wholly within 12" of the general. |
| KRU-ENH Egomaniak | (b) `kruleboyzEgomaniak` + (c) | **Engine (c):** add to `EngineCodeHook` in code-hooks.ts: `redirectDamage?(state: GameState, entry: HookSourceEntry, unitId: UnitId): { candidates: UnitId[]; succeedOn: number } \| null`, plus a `hookService.damageRedirectFor(state: GameState, unitId: UnitId): { candidates: UnitId[]; succeedOn: number } \| null` that returns the first non-null answer. In `attack.ts resolvePool`, after the ward loop and before allocation: if a redirect applies and `points > 0`, roll `points` D6 (purpose `'redirect'`, owner's roll). Each die ≥ `succeedOn` moves 1 point off the general. Moved points go to one recipient, auto-picked as the candidate with the most total wounds remaining (ties by unit id), and are allocated straight to its models with no second ward roll (they already took the general's ward). Emit a new `DamageRedirected { fromUnitId, toUnitId, points, player }` event. Hook: `redirectDamage` answers only when `unitId` is the bearer's unit and it returns the other friendly units on board within 3" (`unitsWithin`) with `succeedOn: 4`. Ordering choice: the ward comes first, then Egomaniak, which is the Kruleboyz player's better order. Works for mortal damage too, because "damage point" covers both. |
| KRU-ENH Eye-biter Ash | (b) `kruleboyzEyeBiterAsh` | Enhancement, `timing phase fight / any`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'enemy' }]`. Targets = `enemiesInCombat(state, general)`. The hook rolls the D6 itself (both results do something, so this is not a pass/fail declared roll). Resolve: grant on the **enemy** unit `{ modifyRoll: { roll: 'hit', value: -1 } }`, scope self, `duration` = `'untilEndOfPhase'` on 1–4 or `'battle'` on 5+, with `sourceUnitId` = the general. The effect must outlive the general, so check that no cleanup drops effects whose source unit died. AI: use it in the first combat phase where the general is in combat, on the enemy unit with the most melee attacks. |
| KRU-AB-1 All Part of Da Plan | (b) `kruleboyzAllPartOfDaPlan` | `timing phase command / your`, `params { range: 9, control: 3 }`. Targets = **other** friendly units wholly within 9". Grant an empty marker effect, scope self, `duration 'untilNextTurn'`; the hook's `produce` at `onObjectiveControl` adds `params.control` once to that unit's control score (F9 fix: it used to grant `modifyStat OC +3`, which is +3 per model, so a 5-model Gutrippaz unit gained +15). AI: the unit contesting the most contested objective. |
| KRU-AB-2 Skewered | (a) + (c) | Passive descriptor on the Killbow: `effect { when: { weaponId: 'kruleboyz.weapon.beast-skewer-bolts', targetKeyword: 'MONSTER' }, setStat: { stat: 'D', value: 6 } }`. attack.ts calls `effectiveWeapon(..., actx)` with the target, so the target-keyword condition resolves. **Engine (c), found while building:** `weapons.ts effectiveWeapon` only ran stat queries on a flat Damage, so a `setStat D` never reached the dice weapon `D6`. It now probes a dice Damage with two very different bases and takes the set value when they agree (a set is in force; additive modifiers still leave a dice Damage alone). No army in the game has a Monster yet, so the test uses a synthetic one. |
| KRU-AB-3 Breath of the Mire-drakes | (b) `kruleboyzBreathOfTheMireDrakes` | `timing phase fight / any`, no limit (CORE-3.4 once per phase). `canUse` = `enemiesInCombat(holder).length > 0`. Resolve: for each enemy unit in combat (unit id order) roll a D6: 2–5 → `inflictMortal(ctx, use, enemy, 1)`; 6 → `inflictMortal(ctx, use, enemy, D3)`. Shape like `ironjawzShieldBash`. AI: always use it when in combat (it has no downside). |
| KRU-AB-4 Scare Taktikz | (b) `kruleboyzScareTaktikz` | `timing phase fight / any`, no limit, descriptor `roll { dice: 'D6', succeedOn: 3 }` (abilities.ts rolls and only calls `resolve` on success). `canUse` needs the unit in combat (only a unit in combat can be attacked in the combat phase, so offering it otherwise would only add prompts). Resolve: grant on self `{ modifyRoll: { roll: 'hit', value: -1 }, when: { attackerNotKeyword: 'HERO' } }`, `scope { who: 'attacker' }` (hooks-impl.ts flips the side, so the holder being attacked modifies the attacker's hit roll), `duration 'untilEndOfPhase'`. AI: use it at the start of every combat phase where the unit is in combat with a non-Hero enemy. |
| KRU-AB-5 Pick 'Em Off | (b) `kruleboyzPickEmOff` (gate only) | Passive descriptor `effect { when: { weaponType: 'ranged' }, modifyRoll: { roll: 'hit', value: 1 } }`, scope self, plus `gate`: false when `turn.moveType` is `normal`, `advance` or `fallBack`, or `turn.chargedThisTurn` is set (the `citiesShotAndShell` test). `Condition.unitStationary` will not do, because it needs `moveType === 'stationary'`, and `null` (never asked, opponent's turn) must also get the bonus. Out-of-phase moves (`aos-moves.ts applySlide`) set no turn flag today. If a Kruleboyz unit ever gains one, add `UnitTurnState.abilityMoved` (c). |
| Hit / wound modifier caps | existing | `dice.ts` clamps hit and wound at ±1 (CORE-2.5): Scare Taktikz + Eye-biter Ash + cover + Guarded Hero total −1 at most; Noisy Racket stacks with nothing else in this army. |

---

## 8. Engine notes

1. **Two engine changes** are needed: `Effect.hiddenBeyond` read by `los.ts` (Covered in Mud), and the damage-redirect
   hook in `attack.ts resolvePool` (Egomaniak). Both are additive. Neither touches the frozen contracts beyond new
   optional fields (`Effect` in `src/data/types.ts`, `EngineCodeHook` in code-hooks.ts, one new event in `events.ts`).
   The `events.ts` change needs a matching note in `docs/spec/00-architecture.md` if that file still lists the event union.
2. **Strike-first in both players' combat phases:** Kruleboyz Waaagh! and Eye-biter Ash are "any combat phase". The
   activation loop must offer them to the non-active player at the start of the opponent's combat phase too.
3. **Enemy movement phase window** (Mork's Eye Pebble): the non-active player needs an activation window in the
   opponent's movement phase. If one does not exist yet, offer it at the end of that phase. The rule only says "in the
   enemy movement phase", and the benefit starts in the following shooting phase, so the end of the phase is fine.
4. **Covered in Mud and the camera / UI:** a hidden unit is still drawn for the opponent (this is not stealth
   deployment). Only targeting changes. The target picker should say why a unit cannot be targeted, using the styled
   tooltip and never `title=`.
5. **Egomaniak recipient choice:** the rule lets the owner choose a recipient for each point. v1 auto-picks one
   recipient for the whole batch (most wounds left). A later UI decision can open a `chooseOption` per batch.
6. **No Ward printed:** the only Ward source in this army is Mork's Eye Pebble (5+, shooting phase only).
7. **Pick 'Em Off in the opponent's turn:** `moveType` is reset each turn, so a Boltboyz unit shooting out of phase in
   the opponent's turn (if any command allows it) gets the bonus. That matches the text ("this turn").
8. **Built in F8** (`src/engine/factions/kruleboyz.ts`, data `src/data/factions/kruleboyz/`, tests `tests/engine/kruleboyz.test.ts` and
   `tests/data/kruleboyz.test.ts`, one test per KRU id). Decisions taken while building:
   - Egomaniak's dice use the roll purpose `'ability'` (not a new `'redirect'` purpose); one recipient takes the whole batch (engine-core ruling).
   - Covered in Mud's `hiddenBeyond` effect is granted with duration `'battle'` and no source unit, so it outlives the general. Eye-biter Ash's
     effect sits on the enemy unit and also outlives the general (tested).
   - Kruleboyz Waaagh! and Covered in Mud are army abilities (`unitId` null in the offer); the general is `players[p].warlordUnitId`.
   - Mork's Eye Pebble is granted on the general as an aura with `when: { phase: 'shooting' }`, `duration 'untilEndOfTurn'`: it is offered at the
     end of the enemy movement phase and lasts through that turn's shooting phase only.
   - Scare Taktikz and Breath of the Mire-drakes are only offered while the unit is in combat (pure range, `inCombat`). Waaagh!, All Part of Da
     Plan, Kunnin' Plan and Eye-biter Ash are offered whenever they have a legal target.
   - AI hints are two functions in the faction file, `kruleboyzAbilityTiming` and `kruleboyzTargetBonus`, called from `src/ai/utility.ts`
     (`abilityTiming`, `abilityTargetBonus`; two small insertions): Waaagh! waits for the general and a neighbour to both be in combat, Mork's Eye
     Pebble for an enemy gun in range of a covered unit, Eye-biter Ash for a unit with 6+ melee attacks (or round 3), Kunnin' Plan for a unit in
     range that is in combat; Covered in Mud prefers the Killbow, then the Boltboyz; All Part of Da Plan prefers a unit on an objective.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| KRU-ARMY-1 | Swampskulka Gang roster builds: Killaboss general, Murknob, 3 Boltboyz, 2×5 Gutrippaz, Killbow; 6 units / 16 models; stats and weapons as §5. |
| KRU-ARMY-2 | No unit has Reinforcements; Call for Reinforcements is never offered to this army. |
| KRU-BT-1 | Kruleboyz Waaagh!: once per battle, offered in either player's combat phase, needs the general on the board. |
| KRU-BT-2 | Kruleboyz Waaagh!: the target must be another friendly unit wholly within 12" of the general (partly within is refused). |
| KRU-BT-3 | Kruleboyz Waaagh!: the general and the target fight in the Strike-first step this phase only. |
| KRU-RA-1 | Covered in Mud: offered at the start of round 1 only; one unit. |
| KRU-RA-2 | Covered in Mud: enemy models more than 12" away cannot see or shoot the unit; within 12" they can; friendly visibility is unchanged; it lasts the whole battle. |
| KRU-RA-3 | Noisy Racket: enemy attacks get −1 to wound in round 1 (shooting and combat, both turns), not in round 2. |
| KRU-ENH-1 | Kunnin' Plan: the target retreats with no mortal damage, then can shoot and charge that turn; targets must be wholly within 12" of the general. |
| KRU-ENH-2 | Mork's Eye Pebble: once per battle in the enemy movement phase; Ward (5+) for friendly units wholly within 12" of the general during the shooting phase, not in the combat phase. |
| KRU-ENH-3 | Egomaniak: with a friendly unit within 3", each point bound for the general moves on 4+; with none in range, nothing moves; redirected points go to a unit within 3". |
| KRU-ENH-4 | Eye-biter Ash: the target must be in combat with the general; on 1–4 the −1 to hit ends with the phase; on 5+ it lasts the battle (still on in a later round, even if the general is slain). |
| KRU-AB-1 | All Part of Da Plan: +3 to the control score of another unit wholly within 9" until your next turn (once per unit, not per model); the Killaboss cannot target itself. |
| KRU-AB-2 | Skewered: Beast-skewer Bolts deal 6 damage per unsaved hit against a Monster, D6 otherwise. |
| KRU-AB-3 | Breath of the Mire-drakes: one roll per enemy unit in combat; 1 = 0, 2–5 = 1, 6 = D3 mortal damage; unavailable out of combat. |
| KRU-AB-4 | Scare Taktikz: on 3+, non-Hero attacks against the Gutrippaz get −1 to hit this phase; Hero attacks are unaffected; a failed roll does nothing. |
| KRU-AB-5 | Pick 'Em Off: +1 to hit for the crossbows after standing still or when never moved this turn; no bonus after a normal move, run, retreat or charge. |
| KRU-WEAP-1 | Crit (Auto-wound) on the crossbow and the bolts skips the wound roll on an unmodified 6 to hit. |
| KRU-WEAP-2 | Gnashtoof's Fangs (Companion) ignore friendly characteristic buffs (CORE-12.4), while the Boss-stikka takes them. |
| KRU-CAP-1 | Scare Taktikz + Eye-biter Ash + cover against the same attack total −1 to hit (CORE-2.5). |

---

## 10. Figures (3D pipeline)

Palette for the whole army: sallow yellow-green orruk skin, swamp-brown leathers and wraps, dark rust-iron and tarnished
bronze armour plates, bone trophies, and **original** crimson-and-mustard shields painted with a crude three-claw scratch
mark (our own symbol, never GW's shield faces or glyphs). Accents in murky teal and peat black. All figures are
original **true MGSD** chibis: ~2.5 heads tall, oversized heads with long pointed ears and big underbites, stubby legs,
big hands. Beasts and war machines are chunky toy-like SD shapes. No GW logos or copied iconography.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `kru-killaboss-gnashtoof` | Killaboss on Great Gnashtoof | 1 | 90×52 oval (est.) | Yes: beast mount | A true MGSD chibi orruk warlord, 2.5 heads tall with a huge sly grinning head under a tall spiked rust-iron helm, stubby legs, waving a long jagged spear, riding a chunky toy-like lanky swamp-hound beast with a huge fanged head, mottled purple-grey hide and bronze collar plates. |
| `kru-murknob` | Murknob with Belcha-banna | 1 | 40 round (est.) | No | A true MGSD chibi orruk champion, 2.5 heads tall with an oversized scheming head in a horned iron half-helm, stubby legs, a heavy cleaver in one fist and a tall crooked banner-pole topped with a gaping dried swamp-lizard skull puffing green fumes. |
| `kru-boltboy` | Man-skewer Boltboyz | 1 (×3) | 32 round (est.) | No | A true MGSD chibi orruk sharpshooter, 2.5 heads tall with a giant head in a pointed iron cap with one squinting eye, stubby legs planted wide, aiming an oversized barbed crossbow with green-dripping bolts, quiver on its hip. |
| `kru-gutrippa` | Gutrippaz | 1 (×10) | 32 round (est.) | No | A true MGSD chibi lanky orruk warrior, 2.5 heads tall with a huge underbitten head in a narrow rust-iron helm, stubby legs, a hooked hacka blade in one hand and a round crimson-and-mustard shield with a crude three-claw scratch mark in the other. |
| `kru-gutrippa-boss` (optional) | Gutrippaz (unit leader look) | 1 (×2, one per unit) | 32 round (est.) | No | The same MGSD chibi Gutrippa with a taller crested helm, a trophy-skull belt and a bigger two-handed hacka, so each unit has a visible leader; skip if the pipeline is short (the rules give it nothing). |
| `kru-killbow` | Beast-skewer Killbow | 1 (crew sculpted on) | 90×52 oval (est.) | Yes: war machine | A chunky toy-like SD giant bolt-thrower on stubby wooden wheels with a harpoon-sized barbed bolt loaded, crewed by two tiny MGSD chibi orruks (2.5 heads tall, huge heads, stubby legs), one cranking the winch and one squinting along the bolt. |
