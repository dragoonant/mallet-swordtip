# Hedonites of Slaanesh — Epicurean Revellers (Spearhead)

Faction id: `slaanesh` · Army id: `slaanesh.army.epicurean-revellers` · Grand alliance: Chaos.
Source: `docs/sources/spearhead-hedonites-of-slaanesh.pdf` (4 pages, 25.4 MB, gitignored), "Spearhead: Hedonites of Slaanesh -
Epicurean Revellers", the free Warhammer Community download (Age of Sigmar, Spearhead category). First listed and last updated
2026-06-17 (PDF metadata: created 2026-05-15), fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_17-06_aos_spearhead_hedonites_of_slaanesh_epicurean_revellers-h8enq2lijh-3uxfyepywh.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, body
`{"index":"downloads_v2","searchTerm":"slaanesh"}`). Stat blocks, keywords and timing bars were checked against the rendered
pages. Base sizes are not printed in the PDF; they come from the Wahapedia aos4 warscroll pages (fetched the same day with plain
curl, `https://wahapedia.ru/aos4/factions/hedonites-of-slaanesh/<Unit>`), as are the three Herald model names.

**Which army.** The search returns two separate Hedonites Spearhead PDFs. **Epicurean Revellers** (Thricefold Discord, 3 Fiends,
2×10 Daemonettes, 5 Seekers) was published on 2026-06-17 together with the new Hedonites battletome supplement and is the army of
the current **Spearhead: Hedonites of Slaanesh** box, so it is the army this spec builds. **Blades of the Lurid Dream**
(Shardspeaker, Blissbarb Archers, Slickblade Seekers, Slaangor Fiendbloods) is the earlier mortal-Sybarite box (listed
2026-04-01, revised 2026-06-29). It is out of scope; its rules are recorded in Appendix A so it can be added later without
reopening that PDF (`https://assets.warhammer-community.com/eng_29-06_aos_spearhead_hedonites_of_slaanesh_blades_of_the_lurid_dream-pz0rmwhqem-kdikh1iuy5.pdf`,
fetched the same day; not stored in `docs/sources/`).

Mechanics and numbers are ported 1:1; all wording below is our own.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (CORE-1.4); "in combat" = within combat range of a
visible enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run =
`advance`, Retreat = `fallBack`. Rend is stored as `rend` (data) / `AP`. Ward = `feelNoPain`. Control = `OC`. Rule IDs `HOS-*`
double as test IDs (§9).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `slaanesh.unit.thricefold-discord` | Thricefold Discord | 3: Vexmor, Vashtiss the Coiled, Lascivyr the Bladed Blessing (identical rules) | **General** | no | Vexmor 40 round; Vashtiss and Lascivyr 28.5 round (Wahapedia) |
| `slaanesh.unit.fiends` | Fiends | 3 | Unit | no | 75×42 oval (Wahapedia) |
| `slaanesh.unit.daemonettes` (a) | Daemonettes | 10 | Unit | **yes** | 25 round (Wahapedia) |
| `slaanesh.unit.daemonettes` (b) | Daemonettes | 10 | Unit | **yes** | 25 round |
| `slaanesh.unit.seekers` | Seekers | 5 | Unit | no | 60×35 oval (Wahapedia) |

Total: 5 units, 31 models. Both Daemonettes units share one warscroll (two patrol entries, `ref` `daemonettes-1` /
`daemonettes-2`). The general is a **three-model Hero unit**: "your general" means that whole unit; ranges to or from the general
are measured from its closest model, and "wholly within X of your general" uses `whollyWithinUnit(state, subject, general, X)`.
One Wizard unit (the Thricefold Discord, power level 1); no Priest; nothing has **Fly**. Only the Daemonettes print
Reinforcements (the badge on their warscroll), so only they can be replaced.

---

## 2. Battle trait

### HOS-BT-1 `slaanesh.ability.favour-most-fickle` — Favour Most Fickle
- **Timing:** Passive, army-wide (every friendly unit holds it).
- **Count:** the number of friendly units on the battlefield, where each live model of the Thricefold Discord counts as one unit
  on its own (HOS-AB-1 Thricefold Court). Units in reserve or destroyed do not count; a Call for Reinforcements replacement counts
  once set up. Recomputed live every time an effect is asked about. The full army on turn 1 counts **7** (4 units + 3 Heralds).
- **Effect:** exactly one band applies (the bands do not add up):

| Count | Effect on every friendly unit |
|---|---|
| 5 or more | **+2 Control** (per model). |
| 4 | **+1 to hit rolls and +1 to wound rolls** for combat (melee) attacks, **Companion weapons included**. |
| 3 | **+1 to run rolls and charge rolls.** |
| 2 | **Ward (5+).** |
| 1 | **+2 Attacks** on melee weapons, **Companion weapons included**. |

- Notes: the army gets stronger in combat as it shrinks. CORE-2.4 still caps hit and wound modifiers at +1 in total, so the
  4-unit band and Dispensers of Favour (Fiends) do not stack past +1. The Thricefold Discord prints Ward (5+), so the 2-unit band
  changes nothing for it.

---

## 3. Regiment abilities (pick 1 at army selection)

### HOS-RA-1 `slaanesh.ability.bringers-of-degradation` — Bringers of Degradation
- **Timing:** Passive.
- **Effect:** In the combat phase, when it is your turn to pick a unit to fight, you may pick **two friendly Daemonettes units**
  instead of one. The second one fights **immediately after** the first finishes; then the pick passes to the opponent as normal
  (the pair is one turn of picking).
- RULING: the second Daemonettes unit must be one you could legally pick at that moment (eligible, not yet fought, and allowed
  by the Strike-first / Strike-last ordering of CORE-10.6/10.7). Otherwise the option is not offered.

### HOS-RA-2 `slaanesh.ability.daemonic-onslaught` — Daemonic Onslaught
- **Timing:** **Once per battle, deployment phase** (CORE-4.5 step 3: once every unit is set up, the player who began deployment
  uses their Deployment Phase abilities, then the opponent).
- **Declare:** Pick a friendly **Seekers or Fiends** unit **wholly within 12"** of your general.
- **Effect:** That unit may make a **Normal Move** as though it were your movement phase (up to its Move, never through or ending
  inside an enemy combat range; it may leave friendly territory).

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `slaanesh.enh.twisted-grace` | Twisted Grace | Passive | When the general **piles in** in a turn in which it **charged**, add **D6"** to its pile-in distance (3" + D6", one roll for the unit's pile-in). |
| `slaanesh.enh.high-courtiers` | High Courtiers | Passive | While the general is **wholly within the combat range** of a friendly **Daemonettes** unit (every Herald within 3" of some model of that unit), the general **and that Daemonettes unit** have **Ward (5+)**. |
| `slaanesh.enh.excess-of-violence` | Excess of Violence | **Once per battle**, any combat phase | Declare: pick a **visible** friendly unit **wholly within 12"** of the general (the general itself is allowed). Effect: its **melee weapons, Companion weapons included**, have **Crit (2 Hits)** until the start of your next turn. |
| `slaanesh.enh.irresistible-soul-musk` | Irresistible Soul-Musk | **Once per battle**, your movement phase | Declare: pick a **visible** friendly **Seekers or Fiends** unit **wholly within 12"** of the general. Effect: take it off the battlefield and set it up again **anywhere** on the battlefield **more than 6" from every enemy unit**. |

Notes: High Courtiers only adds something for the Daemonettes (the Heralds already print Ward 5+). Irresistible Soul-Musk is a
set-up in the movement phase, so CORE-6.13 applies: the unit cannot use Move abilities for the rest of that movement phase; it may
still charge (the Skaven Skitterleap ruling).

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Wards are printed in the keyword line on these warscrolls. Printed keywords
only (Spearhead warscrolls print no faction keywords; data adds name keywords where an ability needs them, see §7).

### 5.1 `slaanesh.unit.thricefold-discord` — Thricefold Discord (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 3 | 5+ | 2 | 5+ |

Keywords: **Infantry, Hero, Wizard** (Wizard power level 1). 3 models, Health 3 each.

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Thricefold Arsenal (`slaanesh.weapon.thricefold-arsenal`) | Melee | — | 3 | 3+ | 3+ | 1 | 2 | — |

Every model carries the Thricefold Arsenal. (The matched-play warscroll differs: Wound 4+ and Crit (2 Hits). The Spearhead card
prints 3+ and no ability; the card wins.)

**HOS-AB-1 `slaanesh.ability.thricefold-court` — Thricefold Court**
- **Timing:** Passive.
- **Effect:** For Favour Most Fickle only, each model of this unit counts as a separate unit (3 while all live, fewer as they
  die, 0 when the unit is destroyed).

**HOS-AB-2 `slaanesh.ability.dispensers-of-favour` — Dispensers of Favour** (Spell, casting value 6)
- **Timing:** Your hero phase.
- **Declare:** Pick **up to X different friendly units wholly within 12"** of this unit, where **X = the number of models in
  this unit** at that moment, then make a casting roll of 2D6.
- **Effect:** On a cast (6+, not unbound), each target gets the effect for its type, until the start of your next turn:
  - **Daemonettes:** its weapons have **Anti-charge (+1 Rend)** (+1 Rend against a unit that charged this turn).
  - **Seekers:** **+2" Move**.
  - **Fiends:** **+1 to hit rolls** for its combat attacks.
- Notes: a target of any other type gets nothing, so the engine offers only Daemonettes, Seekers and Fiends units. RULING: no
  Spell keyword is printed; the casting roll makes it a spell (unbind, miscast for D3 mortal damage on this unit, power level as
  CORE-15).

### 5.2 `slaanesh.unit.fiends` — Fiends
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 10" | 4 | 5+ | 1 | 6+ |

Keywords: **Beast** (descriptive only, CORE-14.6). 3 models.

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Deadly Pincers and Barbed Stinger (`slaanesh.weapon.deadly-pincers-and-barbed-stinger`) | Melee | — | 4 | 4+ | 3+ | 1 | D3 | — |

**HOS-AB-3 `slaanesh.ability.soporific-musk` — Soporific Musk**
- **Timing:** Any charge phase, **once per turn for the army**.
- **Declare:** If this unit is **not in combat**: pick a **visible enemy unit within 9"** of it. If it **is in combat**: pick an
  **enemy unit in combat with it**. Then roll a D6.
- **Effect:** On **4+**, the target has **Strike-last** for the rest of the turn. On 1–3 nothing happens.

### 5.3 `slaanesh.unit.daemonettes` — Daemonettes (×2 units)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 1 | 6+ | 1 | 6+ |

Keywords: **Infantry, Reinforcements** (data adds the name keyword `DAEMONETTES`, see §7). 10 models.

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Piercing Claws (`slaanesh.weapon.piercing-claws`) | Melee | — | 2 | 3+ | 4+ | 1 | 1 | — |

No champion, standard or musician rules.

**HOS-AB-4 `slaanesh.ability.lithe-and-swift` — Lithe and Swift**
- **Timing:** Passive.
- **Effect:** **+1 Attacks** on this unit's Piercing Claws if the unit **charged this turn**.

### 5.4 `slaanesh.unit.seekers` — Seekers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 14" | 3 | 6+ | 1 | 6+ |

Keywords: **Cavalry**. 5 models. Not Reinforcements.

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Agonising Claws (`slaanesh.weapon.agonising-claws`) | Melee | — | 3 | 3+ | 4+ | 1 | 1 | Anti-Cavalry (+1 Rend) |
| Steed's Poisoned Tongue (`slaanesh.weapon.steeds-poisoned-tongue`) | Melee | — | 2 | 3+ | 4+ | — | 1 | Companion |

**HOS-AB-5 `slaanesh.ability.quicksilver-speed` — Quicksilver Speed**
- **Timing:** Passive.
- **Effect:** When this unit makes a run roll and the die shows **1, 2 or 3**, it may count it as **4** instead (before
  modifiers such as Favour's +1). The engine always takes it (it can only help).

---

## 6. Spells and prayers

Dispensers of Favour (HOS-AB-2) is the only spell. The Thricefold Discord is a Wizard (1): one cast attempt per hero phase, and it
may try to unbind one enemy spell per enemy hero phase (CORE-15.6, automatic in the engine). Its power level does not grow with
the number of Heralds. No lore, no manifestations, no Priest.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/slaanesh/*.json`), at most reusing an existing code hook; (b) = new faction
code hook in `src/engine/factions/slaanesh.ts`, exported as `slaaneshHooks` and spread into `code-hooks.ts` like `daughtersHooks`.
Shared helpers from `aos-common.ts`: `onBoard`, `liveModels`, `whollyWithinUnit`, `unitGap`, `enemiesInCombat`, `inCombat`,
`announce`, `paramOf`, `isDatasheet`, `hasKeyword`. (c) = engine change outside the faction file (C1–C6 below).

| Rule | Class | How |
|---|---|---|
| Stats, keywords, printed Wards, power level | (a) | Datasheets as the other armies; `HERO`, `WIZARD`, `INFANTRY`, `BEAST`, `CAVALRY`, `REINFORCEMENTS`. Printed Wards as the datasheet stat `"ward": N` (the Nighthaunt pattern). Thricefold `wizard: 1`. Bases `{ shape: 'round', mm }` / `{ shape: 'oval', mm: 75, mm2: 42 }` / `{ mm: 60, mm2: 35 }`. Thricefold Discord = one datasheet, three model entries `vexmor` (40 round), `vashtiss` (28.5), `lascivyr` (28.5), same stats and weapon. |
| Daemonettes ×2, Reinforcements | (a) | One datasheet, two patrol entries (`size: 10`). Core `spearheadCallForReinforcements`; the other three units are never offered. |
| Name keywords `DAEMONETTES`, `SEEKERS`, `FIENDS` | (a) | Added to the datasheets' `keywords` so hooks and conditions can find the unit types (invisible to players, changes no other rule). |
| HOS-AB-4 Lithe and Swift | (a) | Passive, scope self, `effect { when: { unitCharged: true, weaponId: 'slaanesh.weapon.piercing-claws' }, modifyStat: { stat: 'A', value: 1 } }`. |
| Anti-Cavalry (+1 Rend), Companion | (a) | Weapon data `{ ability: 'ANTI', keyword: 'CAVALRY' }`, `{ ability: 'COMPANION' }`. |
| HOS-AB-1 Thricefold Court | (a) | Passive descriptor with no effect, read by `favourCount` (below) through `isDatasheet(..., 'thricefold-discord')`. |
| HOS-BT-1 Favour Most Fickle | (b) `slaaneshFavourMostFickle` + (c) C1 | Passive battle trait, scope self, the `daughtersBloodRites` shape: one descriptor whose effect array carries every band: `{ modifyStat: { stat: 'OC', value: 2 } }`, `{ when: { weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: 1 }, affectsCompanion: true }`, the same for `wound`, `{ modifyRoll: { roll: 'advance', value: 1 } }`, `{ modifyRoll: { roll: 'charge', value: 1 } }`, `{ feelNoPain: 5 }`, `{ when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 2 }, affectsCompanion: true }`. `gate(state, holder, entry, data)` reads which stat / roll / ward is being asked (like `riteQuery`) and opens only the effects of the band `favourBand(favourCount(state, holder.player))`: OC → band 5+, hit/wound → 4, advance/charge → 3, ward → 2, Attacks → 1. `favourCount` = friendly units on the board, the Thricefold Discord counted as its live model count. `resourceReadout` shows "Favour: 7 units — +2 Control" in the HUD. Exported `favourCount` for tests and the AI. C1 is needed only for the +1 hit / wound reaching Companion weapons. |
| HOS-RA-1 Bringers of Degradation | (b) `slaaneshBringersOfDegradation` + (c) C4 | Regiment ability, `timing phase fight / any`, `params.window 'afterFight'` (offered only in the F14 `fightAfter` window, which runs for the player whose unit just fought). `canUse` = the unit that just fought (`readDeclaredAttack(state).unitId`, phase fight) is a friendly `DAEMONETTES` unit that was a normal pick (not itself chained) and another friendly Daemonettes unit is pickable now (`fightPickable(state, id)`). `targets` = those units. Resolve: `chainFight(state, target)`. `whose: any` because the trait applies whenever it is your turn to pick, in either player's combat phase. |
| HOS-RA-2 Daemonic Onslaught | (b) `slaaneshDaemonicOnslaught` + (c) C5 | Regiment ability, `timing { kind: 'deployment', whose: 'your' }`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params.range 12`. `targets` = friendly `SEEKERS` / `FIENDS` units with `whollyWithinUnit(t, general, 12)` and a legal slide. Resolve: `writeMoveQueue(s, { abilityId, player, maxDistance: Move, queue: [target], opts: { normalMove: true } })` (the SKV-BT-1 slide queue). approximation: rigid slide from the engine's heading list, as every out-of-phase move. |
| ENH Twisted Grace | (b) `slaaneshTwistedGrace` + (c) C3 | Passive enhancement; hook `pileInBonus(state, entry, unitId)` returns `'D6'` when `unitId` is the bearer's unit and `unit.turn.chargedThisTurn`, else null. |
| ENH High Courtiers | (b) `slaaneshHighCourtiers` | Passive enhancement; `adjustFeelNoPain(state, entry, modelId, current)` (asked of every source on the board, the FYR-AB-3 pattern): if the model's unit is the general or a friendly `DAEMONETTES` unit, and some friendly Daemonettes unit D has `whollyWithinUnit(general, D, 3)` with the model's unit being the general or D, answer `{ threshold: min(current, 5), modifier: 0 }`; else null. |
| ENH Excess of Violence | (b) `slaaneshExcessOfViolence` | Enhancement, `timing phase fight / any`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params.range 12`. `targets` = friendly units on the board, `whollyWithinUnit(t, general, 12)` and visible from a general model (`losService.unitVisible`; the general itself counts). Resolve: `effectService.grant(ctx, target, { when: { weaponType: 'melee' }, grantWeaponAbility: { ability: 'CRIT_2_HITS' }, affectsCompanion: true }, { scope: { who: 'self' }, duration: 'untilNextTurn' })`. Offered in the start-of-combat window and between activations. |
| ENH Irresistible Soul-Musk | (b) `slaaneshSoulMusk` | Enhancement, `timing phase movement / your`, `limit oncePerBattle`, declare a friendly unit. `targets` = visible friendly `SEEKERS` / `FIENDS` units wholly within 12" of the general. Resolve: `requestRedeploy(s, { abilityId, player, unitIds: [target], minEnemyDistance: 6, markSetUp: true })` (Skitterleap / Magmic Tunnels pattern; anywhere on the board). |
| HOS-AB-2 Dispensers of Favour | (b) `slaaneshDispensersOfFavour` + (c) C6 | Activated, `timing phase command / your`, `keywords ['SPELL']`, `castingValue 6`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params.range 12`. `targets` = friendly `DAEMONETTES` / `SEEKERS` / `FIENDS` units wholly within 12" of the caster; `maxTargets` = live models of the caster. Resolve per target, `duration 'untilNextTurn'`, scope self: Daemonettes `{ grantWeaponAbility: { ability: 'ANTI', keyword: '@charged' } }`; Seekers `{ modifyStat: { stat: 'M', value: 2 } }`; Fiends `{ when: { weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: 1 } }`. |
| HOS-AB-3 Soporific Musk | (b) `slaaneshSoporificMusk` | Activated, `timing phase charge / any`, `limit oncePerTurnArmy`, `declare [{ role: 'unit', owner: 'enemy' }]`, `roll { dice: 'D6', succeedOn: 4 }`, `params.range 9`. `targets` = `inCombat(self)` ? `enemiesInCombat(self)` : visible enemy units on the board within 9" (`unitGap`). Resolve (on a pass): `target.turn.fightsLast = true` (the `skavenCageOfWarpLightning` pattern; turn flag = "rest of the turn"). Offered in the end-of-charge-phase window (both players, active first). |
| HOS-AB-5 Quicksilver Speed | (a) + (c) C2 | Passive, scope self, `effect { rollFloor: { roll: 'advance', value: 4 } }` (built as `Effect.rollFloor`, ENG-F18-2). |

**Engine changes (c):**
- **C1 Companion roll modifiers** (`hooks.ts` frozen, additive; `hooks-impl.ts`; `attack.ts`): `RollModifierResult + affectsCompanion?:
  boolean`; `hooks-impl` copies `Effect.affectsCompanion` onto the roll result of a `modifyRoll` match; `attack.ts runStage` skips a
  friendly positive modifier on a Companion weapon only when `!r.affectsCompanion` (today it always skips, CORE-12.4). Additive:
  no shipped effect sets `affectsCompanion` on a `modifyRoll`.
- **C2 run-roll floor** (built as ENG-F18-2; `src/data/types.ts` + `common.schema.json` + `hooks-impl.ts`): `Effect.rollFloor?: { roll: 'advance'; value: number }` (this spec first called it `runRollFloor`).
  `advanceRollFor(state, unitId, rolled)` first replaces `rolled` with `max(rolled, floor)` (the highest floor among the unit's
  matching effects; read at `onAdvanceRoll`), then halves / adds modifiers as today. The dice tray notes "counted as 4".
  `EFFECT_HOOKS + rollFloor: ['onAdvanceRoll']` (frozen `hooks.ts`, additive).
- **C3 pile-in bonus** (`code-hooks.ts`, `hooks-impl.ts`, `phases/fight.ts`): `EngineCodeHook.pileInBonus?(state: GameState,
  entry: HookSourceEntry, unitId: UnitId): DiceExpr | null` → `hookService.pileInBonusFor(state, unitId): DiceExpr[]`. In the
  activation's pile-in step, before planning, `fight.ts` rolls the bonuses once per activation (`ctx.rollOnce('fi:pileBonus:<act>',
  { purpose: 'ability', ... })`), stores the total in the mark, and uses `dist = pileInDistance(...) + bonus` for `planPileIn`,
  `legalPileIns` and `pileInRejection`; an `AbilityTriggered` line names the source.
- **C4 chained fight** (`phases/fight.ts`): `export function chainFight(state: GameState, unitId: UnitId): void` writes the phase
  mark `fi:chain:<player>=<unitId>`; `fightPickable(state, unitId): boolean` (exported) = what the pick step would offer now. In
  the pick step, right after an activation of `player` resolves (after the `fightAfter` window), a pending chain mark for that
  player activates the named unit immediately (no `selectToFight` decision, same Strike-first / Strike-last checks), clears the
  mark, and the alternation then continues as if `player` had made one pick. A chained activation never offers another chain.
- **C5 deployment-phase abilities** (`setup.ts`, `abilities.ts`): CORE-4.5 step 3. When the last unit has been set up (before the
  reducer leaves `deployment`), `setup.ts` calls `ctx.services.abilities.runWindow(ctx, 'deployment', p, 'deploy:abilities:' + p)`
  for the player who began deployment (the attacker), then the opponent, returning `'pending'` while a decision is open. The window
  already maps to `deployment.unit` and `timingMatches` accepts `{ kind: 'deployment' }`; `nextStep` must also drain a MoveQueue
  in this window (`slideOptions` / `applySlide` need nothing phase-specific). Units moved here are not "set up this turn".
- **C6 multi-target declare** (`hooks.ts` `ActivatedAbilityHook`, `abilities.ts`): `ActivatedAbilityHook + maxTargets?(state:
  GameState, unitId: UnitId | null): number`. When it returns N > 1 the declare step repeats the `abilityTarget` decision, each time
  without the units already picked and, after the first pick, with a "Done" option, until N units are picked, the player picks
  Done, or no candidate is left; `use.targetUnitIds` carries them all (it is already an array). Single-target abilities unchanged.
  The casting roll comes after the picks, as the card orders it.

C1, C2 and C6 touch the frozen `hooks.ts`, additively only (an optional `RollModifierResult` field, an `EFFECT_HOOKS` key, an
optional `ActivatedAbilityHook` method). C2 changes `src/data/types.ts` and the schema. All
need a note in `docs/spec/13-engine-port-plan.md` (a new §3.x) and `docs/spec/00-architecture.md` where frozen files change.

---

## 8. Engine notes

1. **Favour count timing:** the band is read when an effect is evaluated (stat query, roll, ward), never cached, so a unit
   destroyed mid-phase changes the band for the next attack. A Herald slain lowers the count by one.
2. **Favour and Companion:** only the 4-unit and 1-unit bands name Companion weapons; the Steed's Poisoned Tongue takes them
   (C1 for the roll band, existing `affectsCompanion` for Attacks). Control and Ward bands have nothing to do with weapons.
3. **Modifier caps:** hit / wound +1 from Favour and +1 from Dispensers (Fiends) cap at +1 (CORE-2.4); run / charge +1 has no cap.
   Quicksilver Speed's 4 is applied before the +1 (a rolled 2 becomes 4, then 5).
4. **Dispensers X:** counted at declaration; Heralds slain later do not undo the effects. A miscast deals D3 mortal damage to the
   Thricefold Discord.
5. **Bringers ordering:** the chained second Daemonettes unit piles in and fights fully before the opponent picks; a Strike-last
   Daemonettes unit can only be chained once only Strike-last units remain.
6. **Soporific Musk window:** the enemy's charge phase is where it shines (after their charges, before combat). The army limit
   means one use per turn whoever's turn it is.
7. **Twisted Grace:** the extra D6" adds to the 3" pile-in of all three Heralds (one roll); CORE-6.11 pile-in limits still
   apply (no model ends farther from the target).
8. **AI:** Daemonic Onslaught — Seekers toward the nearest objective not held by the AI, else Fiends toward the centre; Bringers — always chain when both Daemonettes
   units can fight; Dispensers — targets in order Fiends (if in or near combat), Daemonettes (if an enemy charged them or will),
   Seekers (if out of combat); Soporific Musk — in the enemy's charge phase, the charging enemy unit with the highest melee damage
   estimate in combat with friends, else in its own charge phase the enemy unit the Fiends charged; Excess of Violence — the
   first combat phase where a friendly unit with ≥ 8 melee attacks is in combat; Irresistible Soul-Musk — move Seekers or Fiends
   onto an uncontested objective, or out of a losing combat; Quicksilver Speed and Favour need no choice.
9. **Defaults for the sim:** regiment Bringers of Degradation and enhancement High Courtiers; variant games Daemonic Onslaught and
   Excess of Violence.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| HOS-ARMY-1 | Epicurean Revellers builds: Thricefold Discord general (3 models) + 3 Fiends + 2×10 Daemonettes + 5 Seekers, 31 models, stats as §5. |
| HOS-ARMY-2 | Printed Wards: Thricefold 5+, Fiends 6+, Daemonettes 6+, Seekers 6+. |
| HOS-ARMY-3 | Reinforcements only on both Daemonettes units; Thricefold, Fiends and Seekers never offered for replacement. |
| HOS-BT-1 | Favour count: full army counts 7 (Heralds count one each); a destroyed unit or slain Herald lowers it; reserve units do not count. |
| HOS-BT-2 | Band 5+: +2 Control per model, nothing else from Favour. |
| HOS-BT-3 | Band 4: +1 hit and +1 wound on melee attacks, Steed's Poisoned Tongue included; capped at +1 with Dispensers. |
| HOS-BT-4 | Band 3: +1 run and +1 charge rolls only. |
| HOS-BT-5 | Band 2: every friendly unit has Ward 5+. |
| HOS-BT-6 | Band 1: +2 Attacks on melee weapons, Companion included. |
| HOS-RA-1 | Bringers of Degradation: after one Daemonettes unit fights, the other fights next before the opponent picks; never chains a third; not offered when the second is not pickable. |
| HOS-RA-2 | Daemonic Onslaught: offered once in the deployment phase after all units are set up (attacker first); Seekers / Fiends wholly within 12" of the general only; Normal Move never ends in or passes through enemy combat range. |
| HOS-ENH-1 | Twisted Grace: the general's pile-in reaches 3" + D6" only in a turn it charged. |
| HOS-ENH-2 | High Courtiers: Ward 5+ for a Daemonettes unit while every Herald is within 3" of it; none when one Herald is outside. |
| HOS-ENH-3 | Excess of Violence: Crit (2 Hits) on the target's melee and Companion weapons until the start of your next turn; once per battle; target visible and wholly within 12". |
| HOS-ENH-4 | Irresistible Soul-Musk: Seekers / Fiends set up more than 6" from every enemy; no Move abilities after it that movement phase; once per battle. |
| HOS-AB-1 | Thricefold Court: a Thricefold with 2 live Heralds adds 2 to the Favour count. |
| HOS-AB-2 | Dispensers of Favour: cast 6+; up to X targets where X = live Heralds; Daemonettes Anti-charge (+1 Rend), Seekers +2" Move, Fiends +1 hit, all until your next turn; can be unbound. |
| HOS-AB-3 | Soporific Musk: 4+ gives Strike-last for the rest of the turn; target visible within 9" when out of combat, an enemy in combat with the Fiends when in combat; once per turn for the army, either charge phase. |
| HOS-AB-4 | Lithe and Swift: Piercing Claws 3 Attacks after a charge, 2 otherwise. |
| HOS-AB-5 | Quicksilver Speed: a run roll of 1–3 counts as 4; 5–6 unchanged; Favour +1 applied after. |
| HOS-WEAP-1 | Agonising Claws gain +1 Rend against Cavalry; Steed's Poisoned Tongue is Companion; Deadly Pincers deal D3. |
| HOS-MAG-1 | The Thricefold Discord attempts at most one spell per hero phase and may unbind one enemy spell. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own court livery): pale lilac and porcelain-white skin, deep violet and magenta leathers and
silks, burnished gold trim, glossy black claws and horns, soft teal and pearl accents, rose-pink hair. Shared motif: an original
crescent cradling a teardrop gem, worn as jewellery and painted on silks. No GW logos, no copy of the Slaanesh rune or any GW
Hedonite icon. All figures are **true MGSD** chibis (~2.5 heads tall, huge head, stubby legs, big hands and feet); the Fiends and
the Seekers' steeds are chunky toy-like SD beasts. Hair, silks and musk effects are solid sculpted shapes, never see-through.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `hos-vexmor` | Thricefold Discord (Vexmor) | 1 | 40 round | No | A true MGSD chibi daemon courtier, 2.5 heads tall with an oversized lilac head, a tall swept gold headdress, a smug half-lidded smile and long rose-pink hair, stubby legs under a flowing violet gown, one hand a big glossy black crab claw and the other holding a crooked gold sceptre crowned with a teardrop gem. |
| `hos-vashtiss` | Thricefold Discord (Vashtiss the Coiled) | 1 | 28.5 round | No | A true MGSD chibi daemon courtier, 2.5 heads tall with a huge porcelain-white head, curled black ram horns and a sly fanged grin, a stubby lilac snake-tail body coiled into a spring beneath a magenta silk bodice, one black claw raised and the other twirling a gold fan-blade. |
| `hos-lascivyr` | Thricefold Discord (Lascivyr the Bladed Blessing) | 1 | 28.5 round | No | A true MGSD chibi daemon blade-dancer, 2.5 heads tall with a huge lilac head, a gold crescent crown and a big pink ponytail, stubby legs on tiptoe in a twirl, a long curved gold sword in one hand and a black sickle claw in the other, teal silk ribbons frozen mid-swirl as solid shapes. |
| `hos-fiend` | Fiends | 1 (×3) | 75×42 oval | No (beast) | A chunky toy-like SD daemon beast with a huge round lilac head, big glossy black eyes, a long pink tongue and a small sweet-then-wicked smile, a stubby four-legged body with pearl-scale plates, two oversized black crab pincers and a curled scorpion tail tipped with a gold barb, solid rose-pink musk puffs around its feet. |
| `hos-daemonette` | Daemonettes | 1 (×20) | 25 round | No | A true MGSD chibi daemon handmaiden, 2.5 heads tall with an oversized porcelain-lilac head, big dark eyes, a wicked grin and a wild sculpted rose-pink ponytail, stubby legs on hoof-like tiptoes, wrapped in violet leather straps with gold rings, one arm ending in a big glossy black crab claw. |
| `hos-seeker` | Seekers | 1 (×5) | 60×35 oval | Yes (daemon steed) | A true MGSD chibi daemon handmaiden rider with a huge lilac head and pink ponytail, one black crab claw raised, riding sidesaddle on a chunky toy-like long-necked two-legged daemon steed with a round pearl-white head, a long lolling pink tongue, gold bridle and a stubby striped tail, both mid-sprint. |

The three Heralds get their own figures because the kit sculpts them as three named characters on two base sizes, even though
their rules are identical. Daemonettes and Seekers use one figure each: the Spearhead gives no champion, standard or musician
rules. Blades of the Lurid Dream figures (Appendix A) are listed there.

---

## 11. Implementation notes

Built (F18). Layout: `src/data/factions/slaanesh/` (faction.json, datasheets/{thricefold-discord, fiends, daemonettes, seekers}.json,
weapons.json, abilities.json, enhancements.json, patrols/epicurean-revellers.json); hooks in `src/engine/factions/slaanesh.ts`
(`...slaaneshHooks` in `code-hooks.ts`; AI hints `slaaneshAbilityTiming` / `slaaneshTargetBonus` exported there and dispatched from
`src/ai/utility.ts` by the `slaanesh` code prefix); tests `tests/engine/slaanesh.test.ts` and `tests/data/slaanesh.test.ts` (one test
per HOS- id; the HOS-AB-5 / HOS-BT tests drive the real data on the AoS fixture bundle) and `tests/engine/engine-f18.test.ts` (ENG-F18-1..14
for C1-C6). Patrol `battleTraits: ['slaanesh.ability.favour-most-fickle']`; regiment list Bringers of Degradation (default), Daemonic
Onslaught; enhancement list High Courtiers (default), Twisted Grace, Excess of Violence, Irresistible Soul-Musk. Figure mapping keys
`<datasheet id>/<modelId>` (`slaanesh.unit.thricefold-discord/vexmor` etc.; client work, not part of the engine stage).

Decisions made while building (all additive):
- **Favour gate.** `slaaneshFavourMostFickle.gate` tells the seven effects apart by the hook data: `data.stat` ('OC' / 'A') for the stat
  queries, `data.roll.purpose` ('hit' / 'wound' / 'fnp') for attack and ward rolls, `chargingUnitId` / `movingUnitId` for the charge
  and run rolls. With no data (any query that is not one of these) the gate is closed. The Ward band rides the data `feelNoPain: 5`
  effect, not `adjustFeelNoPain`.
- **Dispensers of Favour** accepts only Daemonettes, Seekers and Fiends units as targets (the other types would get nothing); the
  caster itself is never one. `maxTargets` is read when the declare step starts; the casting roll comes after the picks.
- **Daemonic Onslaught** offers a unit only when it is not in combat and a short Normal-Move slide exists (probe), so the window never
  opens an empty move decision.
- **Irresistible Soul-Musk** redeploys through `requestRedeploy`; `redeploy.ts redeployFormation` closes its rows up to an oval base's
  short side, otherwise a 5-model unit of 60x35 mm ovals (the Seekers) could never keep coherency and the unit found no spot.
- **Enhancement bearer.** The engine puts the enhancement on the general's first model (Vexmor), and an enhancement is lost with its
  bearer. The spec gives it to the whole three-model general, so `slaaneshFavourMostFickle.onOwnModelSlain` hands the enhancement to
  the next surviving model of the Thricefold Discord the moment its bearer is slain (it is only gone with the last model).
- **Soporific Musk** target in combat = `enemiesInCombat` (range only), out of combat = visible within 9". The flag set is
  `turn.fightsLast`, which lapses with the turn.

---

## Appendix A — Blades of the Lurid Dream (separate PDF; out of scope)

Army id if ever built: `slaanesh.army.blades-of-the-lurid-dream`. General: **Shardspeaker of Slaanesh**. Units: 5 Blissbarb
Archers + 1 Blissbrew Homonculus, 5 Blissbarb Archers, 5 Slickblade Seekers, 3 Slaangor Fiendbloods (2 with Razor-sharp Claws, 1
with Razor-sharp Claw and Gilded Weapon). 20 models. Source PDF: `eng_29-06_..._blades_of_the_lurid_dream-pz0rmwhqem-kdikh1iuy5.pdf`
(4 pages, metadata created 2026-06-15, revised 2026-06-17).

**Battle trait. Temptations of Slaanesh** — you get 6 temptation dice at the start of each battle round (unused ones are lost at
its end). Whenever the opponent fails a hit, wound or save roll, you may offer a temptation die: if they accept, that roll
becomes a 6 that cannot be re-rolled or modified and you gain D6 depravity points; if they refuse, the unit the roll was made
for suffers D3 mortal damage. At most one offer per enemy unit per phase. Depravity thresholds (cumulative, every friendly unit):
12+ may Run and still Charge; 18+ melee weapons have Crit (Mortal); 24+ Ward (5+).

**Regiment abilities.** Unparalleled Speed — once per battle, any combat phase: a friendly unit has Strike-first this phase.
Locus of Diversion — your movement phase: a friendly unit may Retreat and still Shoot and/or Charge later this turn.

**Enhancements.** Sceptre of Domination (any combat phase: a D6 per enemy unit in combat with the general, 5+ = Strike-last this
phase); Twisted Mirror (once per turn, your shooting phase: an enemy unit within 9" of the general, D6 4+ = −1 to its save rolls
until your next turn); Cacophonic Choir (your hero phase, casting roll 2D6, 6+: roll a D6 "cacophony" value; each enemy unit
within 6" of the general with Control below it suffers D3 mortal damage, rolled per unit); Pendant of Slaanesh (your hero phase:
Heal (D3) the general).

**Warscrolls.**

| Unit | Move | Health | Save | Control | Ward | Keywords | Base (mm) |
|---|---|---|---|---|---|---|---|
| Shardspeaker of Slaanesh (General) | 6" | 5 | 5+ | 2 | — | Hero, Wizard, Infantry | 32 round |
| Slickblade Seekers | 12" | 4 | 5+ | 1 | — | Cavalry, Reinforcements | 75×42 oval |
| Blissbarb Archers (+ Homonculus) | 6" | 1 | 6+ | 1 | — | Infantry, Reinforcements | 28.5 round (Homonculus 25) |
| Slaangor Fiendbloods | 6" | 3 | 5+ | 1 | — | Infantry, Reinforcements | 40 round |

| Weapon | Unit | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|---|
| Haze Staff | Shardspeaker | Melee | — | 3 | 3+ | 4+ | 1 | D3 | — |
| Slickblade Glaive | Slickblade Seekers | Melee | — | 3 | 3+ | 4+ | 1 | 1 | Charge (+1 Damage) |
| Exalted Steed's Poisoned Tongue | Slickblade Seekers | Melee | — | 3 | 3+ | 4+ | — | 1 | Companion |
| Blissbarb Bow | Blissbarb Archers (not the Homonculus) | Ranged | 18" | 2 | 3+ | 4+ | 1 | 1 | — |
| Sybarite Blade | Blissbarb Archers + Homonculus | Melee | — | 1 | 3+ | 4+ | — | 1 | — |
| Razor-sharp Claws | Slaangor (2 models) | Melee | — | 4 | 4+ | 3+ | 1 | 2 | — |
| Razor-sharp Claw and Gilded Weapon | Slaangor (1 model) | Melee | — | 5 | 4+ | 3+ | 1 | 2 | — |

**Abilities.** Vision of Damnation (Shardspeaker, your hero phase, casting roll 2D6, 6+: roll 6 dice, +1 depravity point per
4+). Unrivalled Velocity (Slickblade Seekers, passive: re-roll charge rolls). Light-Footed Killers (Blissbarb Archers, passive: may
Shoot after Running). Slaughter at Any Cost (Slaangor, enemy shooting phase: if any damage was allocated to the unit this turn, it
may make a Normal Move as though it were your movement phase).

**Figures (if built).** `hos-shardspeaker` (1, 32 round: MGSD chibi masked sorcerer in layered violet robes holding a hand mirror
and a smoking staff, solid lilac mist-sprites curling round); `hos-slickblade-seeker` (1 ×5, 75×42 oval, mount: chibi masked rider
with a long glaive on a chunky SD long-necked daemon steed); `hos-blissbarb-archer` (1 ×10, 28.5 round: chibi masked archer with a
recurve bow and a pink-feathered quiver); `hos-blissbrew-homonculus` (1, 25 round: tiny round imp swinging a censer of solid
violet smoke); `hos-slaangor` (1 ×2, 40 round: chunky chibi horned beast-man with claw hands and silk sashes);
`hos-slaangor-gilded` (1, 40 round: the same beast-man with a gilded cleaver in one hand).
