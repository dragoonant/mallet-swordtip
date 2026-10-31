# Ogor Mawtribes — Warglutt Marauders (Spearhead)

Faction id: `ogors` · Army id: `ogors.army.warglutt-marauders` · Grand alliance: Destruction.
Source: `docs/sources/spearhead-ogor-mawtribes.pdf` (8 pages, 15.0 MB, gitignored), "Spearhead: Ogor Mawtribes – Warglutt
Marauders", the free Warhammer Community download (Age of Sigmar, Spearhead category). Listed 2026-07-15 (PDF metadata:
created 2026-05-27), fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_15-07_aos_spearhead_ogor_mawtribes_warglutt_marauders-l0ewnuqqj7-sqi5tjabsr.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, body
`{"index":"downloads_v2","searchTerm":"ogor","gameSystem":"warhammer-age-of-sigmar","language":"english"}`). Base sizes are
not printed in the PDF; they come from the Wahapedia aos4 warscroll pages (fetched the same day with plain curl,
`https://wahapedia.ru/aos4/factions/ogor-mawtribes/<Unit>`). Stat blocks and ability timing bars were checked against the
rendered pages, not only the text layer.

**Which army.** The search returns three Ogor Spearhead PDFs. Two date from 2025-06-11 (updated 2026-04-01) and are built
from the older kits: **Tyrant's Bellow** (Tyrant, Mournfang, Gluttons, Leadbelchers, Ironblaster) and **Scrapglutt**
(Mantrappers, Ironguts, Gnoblars, Scraplauncher); they are listed in Appendix B only. The newest PDF (2026-07-15) holds two
armies built from the 2026 Ogor model range. **Warglutt Marauders** (pages 1–4: Tyrant, 2+3 Gluttons, 3 Ironguts, 2×1
Maulbeast Cavalry) is the PDF's title army and the Gutbuster warband of the current **Spearhead: Ogor Mawtribes** box, so it is
the army this spec builds. **Mawseeker Mob** (pages 5–8: Butcher, Cleavers, Gutseers, Gorger Mawpack) is recorded in
Appendix A so it can be added later without reopening the PDF.
RULING: the box attribution is inferred (title army, newest release, Wahapedia lists Warglutt Marauders first among the Ogor
Spearheads); the store page was not checked. If the owner's box is Mawseeker Mob, Appendix A has everything needed.

Mechanics and numbers are ported 1:1; all wording below is our own.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of
an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run =
`advance`, Retreat = `fallBack`. Rend is stored as `rend` (data) / `AP`. Ward = `feelNoPain`. "Combat attacks" = attacks made
with melee weapons (a Fight ability). Rule IDs `OGM-*` double as test IDs (§9).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) | Deploys |
|---|---|---|---|---|---|---|
| `ogors.unit.tyrant` | Tyrant | 1 | **General** | no | 50 round (Wahapedia) | normal |
| `ogors.unit.gluttons` (a) | Gluttons | 2 | Unit | no | 40 round (Wahapedia) | normal |
| `ogors.unit.gluttons` (b) | Gluttons | 3 | Unit | no | 40 round | **reserve** (OGM-BT-1) |
| `ogors.unit.ironguts` | Ironguts | 3 | Unit | no | 40 round (Wahapedia) | normal |
| `ogors.unit.maulbeast-cavalry` (a) | Maulbeast Cavalry | 1 | Unit | no | 90×52 oval (Wahapedia) | normal |
| `ogors.unit.maulbeast-cavalry` (b) | Maulbeast Cavalry | 1 | Unit | no | 90×52 oval | **reserve** (OGM-BT-1) |

Total: 6 units, 11 models. Patrol refs `tyrant`, `gluttons-2` (size 2), `gluttons-3` (size 3, reserve), `ironguts`,
`maulbeast-1`, `maulbeast-2` (reserve). No warscroll has the Reinforcements keyword, so **no unit can be replaced** by Call
for Reinforcements. No Wizard, no Priest, nothing has **Fly**, no ranged weapons anywhere in the army. The Tyrant is the
only Hero. No warscroll prints a Ward.

---

## 2. Battle traits

### OGM-BT-1 `ogors.ability.nomadic-warriors` — Nomadic Warriors (+ arrival `ogors.ability.more-ogors-my-lord`)
- **Set-up:** the **3-model Gluttons** unit and **one** Maulbeast Cavalry unit are **not deployed** in the deployment phase;
  they start in reserve.
- **Arrival — More Ogors, My Lord!:** Your movement phase, **from battle round 3**. Each reserve unit may use it (once per
  phase per unit, CORE-5.3). **Effect:** set the unit up anywhere on the battlefield with **every model within 1" of a
  battlefield edge** (any edge, either territory) and **more than 6" from every enemy unit**.
- Notes: a unit set up this way counts as set up this turn (CORE-6.13: no Move abilities this movement phase; it may still
  charge). The PDF says nothing about reserves that never arrive; core Spearhead handling applies (as for Ironjawz 'Ere We Go).
- RULING: "every model" is checked per model base edge to the nearest board edge (≤ 1"), which differs from Tzeentch's
  Fated Arrival ("some model"). For the 3 Gluttons this means a line along an edge.

### OGM-BT-2 `ogors.ability.scoff-down-fresh-flesh` — Scoff Down Fresh Flesh
- **Timing:** End of any turn.
- **Declare:** only if **at least one enemy unit was destroyed this turn**. Pick a friendly unit that **used a Fight ability
  this turn**; that unit uses this ability.
- **Effect:** choose one of three upgrades; it lasts **for the rest of the battle** on that unit:
  - **Raw and Bloody Flesh** — +1 to hit rolls for the unit's combat attacks **if it charged in the same turn**.
  - **Exotic Giblets** — −1 to **ward rolls** made against damage points from the unit's combat attacks.
  - **Steaming Brains** — +3 to the unit's **control score**.
- Rules of One (CORE-5.3): each friendly unit may use it at most once per end-of-turn step, so several units that fought
  can each take an upgrade in the same turn.
- RULING: nothing stops a unit taking the same upgrade again in a later turn. Steaming Brains stacks (+6, +9…). A second
  Raw and Bloody Flesh adds nothing (core caps hit modifiers at +1). A second Exotic Giblets gives −2 on paper; the engine
  clamps the summed ward modifier to ±1 (`wardThreshold`), so approximation: it adds nothing. The AI never repeats Raw or
  Giblets on the same unit.

---

## 3. Regiment abilities (pick 1 at army selection)

### OGM-RA-1 `ogors.ability.brutish-barging` — Brutish Barging
- **Timing:** **Once per battle**, end of **your** turn.
- **Declare:** pick a friendly unit that **charged this turn**.
- **Effect:** roll 2D6; the unit may move up to that many inches. During this move it may pass through the combat ranges of
  enemy units it was **in combat with when the move began**, but it **cannot end the move in combat** (with any enemy).
- RULING: combat ranges of other enemy units may not be entered at any point of the move (the permission names only the
  units it started in combat with). The move is not a Normal Move, Run or Retreat: no Retreat damage, and the CORE-6.13
  "set up this turn" bar does not apply (it is the end of the turn).

### OGM-RA-2 `ogors.ability.blinding-dust-clouds` — Blinding Dust Clouds
- **Timing:** Passive.
- **Effect:** −1 to hit rolls for attacks (shooting and combat) that **target a friendly unit that was set up this turn**.
- Notes: in this army only the OGM-BT-1 arrivals are ever set up mid-battle, so it protects them in the turn they arrive.
  Deployment-phase set-up is not "this turn".

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `ogors.enh.wallwrecker` | Wallwrecker | Passive | The general may **pass across terrain features as though it had Fly** (moves and charges). It does not gain the Fly keyword: model and combat-range rules are unchanged, and it still cannot end on a spot a non-flyer could not end on. |
| `ogors.enh.lungburster` | Lungburster | Passive | Friendly units **wholly within 9"** of the general: when their **run roll** comes up 1, 2 or 3, they may use **4** instead. (The general counts itself.) |
| `ogors.enh.deathcheater` | Deathcheater | Passive | The general has **Ward (6+)** while it is **more than 3" from every other friendly unit**. |
| `ogors.enh.gristlegobbler` | Gristlegobbler | **Once per battle**, end of **any** turn | **Declare:** every enemy unit **in combat with the general** is a target. **Effect:** roll D3 per target and inflict that much **mortal damage** on it; then **Heal (3)** the general. |

RULING: Gristlegobbler needs at least one target to be used (an ability with no legal target cannot be declared); the Heal
does not happen on its own. Lungburster is applied automatically (a value of 4 is never worse than 1–3), after any re-roll
and before modifiers.

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. **No warscroll in this army prints a Ward.** Printed keywords only
(Spearhead warscrolls print no faction keywords). All weapons are melee; no warscroll has a ranged weapon.

### 5.1 `ogors.unit.tyrant` — Tyrant (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 8 | 4+ | 3 | — |

Keywords: **Hero, Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Tyrant's Meatcleavers (`ogors.weapon.tyrants-meatcleavers`) | Melee | — | 4 | 4+ | 2+ | 2 | 3 | — |

Note: the matched-play Tyrant (Wahapedia) gives the Meatcleavers Crit (Mortal); the Spearhead warscroll prints none. We use
the Spearhead card.

**OGM-AB-1 `ogors.ability.roaring-warlord` — Roaring Warlord**
- **Timing:** Your hero phase (once per phase for this unit, CORE-5.3).
- **Declare:** pick a **visible friendly unit within 12"** of the Tyrant, then roll a D6.
- **Effect:** on **3+**, +1 to that unit's **charge rolls** for the rest of the turn. On 1–2 nothing.
- [interp] The Tyrant may pick itself (the card does not say "other").

### 5.2 `ogors.unit.gluttons` — Gluttons (×2 units: 2 and 3 models)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 4 | 5+ | 2 | — |

Keywords: **Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Glutton Weapons (`ogors.weapon.glutton-weapons`) | Melee | — | 4 | 4+ | 2+ | 1 | 2 | — |

Loadout: every model has Glutton Weapons. No champion, standard or musician rules.

**OGM-AB-2 `ogors.ability.wall-of-meat` — Wall of Meat**
- **Timing:** Passive.
- **Effect:** +1 to save rolls for this unit **unless it charged in the same turn** (so always in the enemy's turn, and in
  your own turn when it did not charge).

### 5.3 `ogors.unit.ironguts` — Ironguts
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 4 | 4+ | 2 | — |

Keywords: **Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Irongut Weapon (`ogors.weapon.irongut-weapon`) | Melee | — | 3 | 4+ | 2+ | 2 | 3 | — |

**OGM-AB-3 `ogors.ability.stomping-marauders` — Stomping Marauders**
- **Timing:** Passive.
- **Effect:** +2 to this unit's **control score** (the unit total on an objective, CORE-17.4, not per model) if it
  **charged in the same turn**. In practice: the end-of-turn objective check of a turn in which it charged.

### 5.4 `ogors.unit.maulbeast-cavalry` — Maulbeast Cavalry (×2 units of 1)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 10" | 7 | 3+ | 3 | — |

Keywords: **Cavalry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Gutbiter Weapons (`ogors.weapon.gutbiter-weapons`) | Melee | — | 3 | 4+ | 2+ | 2 | 3 | — |
| Maulbeast's Horns and Fangs (`ogors.weapon.maulbeast-horns-and-fangs`) | Melee | — | 4 | 4+ | 2+ | 1 | 2 | Companion |

Note: the matched-play warscroll gives the Horns and Fangs Charge (+1 Damage) too; the Spearhead card prints only Companion.

**OGM-AB-4 `ogors.ability.shock-and-gore` — Shock and Gore**
- **Timing:** Your combat phase, **once per turn for the army** (both Maulbeast units share one use).
- **Declare:** only if **this unit charged this turn**; pick an **enemy unit in combat with it**, then roll a D6.
- **Effect:** on **3+**, −1 to **wound rolls** for that enemy unit's attacks for the rest of the turn.

---

## 6. Spells and prayers

None. No Wizard or Priest: the army cannot cast, chant or unbind.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/ogors/*.json`), at most reusing an existing code hook; (b) = new faction
code hook in `src/engine/factions/ogors.ts`, exported as `ogorsHooks` and spread into `code-hooks.ts` like `skavenHooks`.
Shared helpers from `aos-common.ts`: `onBoard`, `unitGap`, `whollyWithinUnit`, `enemiesInCombat`, `inCombat`, `inflictMortal`,
`healUnit`, `announce`, `paramOf`, `isDatasheet`. (c) = engine change outside the faction file (§7.1).

| Rule | Class | How |
|---|---|---|
| Stats, keywords, no Ward, no ranged weapons | (a) | Datasheets as the other armies; `HERO`, `INFANTRY`, `CAVALRY`. Bases `{ shape: 'round', mm: 50 / 40 }`, Maulbeast `{ shape: 'oval', mm: 90, mm2: 52 }`. |
| Two Gluttons units, two Maulbeast units | (a) | One datasheet each, two patrol entries (`gluttons-2` size 2, `gluttons-3` size 3; `maulbeast-1`, `maulbeast-2` size 1). No `REINFORCEMENTS` keyword anywhere, so `spearheadCallForReinforcements` never offers a unit. |
| Companion weapon | (a) | Weapon ability `COMPANION` on Maulbeast's Horns and Fangs (as Gloomspite / Seraphon mounts). |
| OGM-BT-1 Nomadic Warriors (reserve) | (a) | Passive text marker `ogors.ability.nomadic-warriors` in `battleTraits`; patrol entries `gluttons-3` and `maulbeast-2` carry `reserve: { ability: 'ogors.ability.more-ogors-my-lord' }`. |
| OGM-BT-1 More Ogors, My Lord! (arrival) | (a) + (c) C1 | Activated `phase movement / your`, `keywords ['CORE']`, `fromRound: 3`, `params { fromRound: 3, minEnemyDistance: 6, anywhere: true, edgeWithin: 1, edgeAll: true }` ('Ere We Go shape plus F16 `edgeWithin`). C1 adds `edgeAll` (every model, not some model). |
| OGM-BT-2 Scoff Down Fresh Flesh | (b) `ogorsScoffDown` + (c) C4 | Army ability, `timing endOfTurn / any`, `declare [{ role: 'unit', owner: 'friendly' }]`, `modes [raw, giblets, brains]`. `canUse` = `state.cards.turnLog.destroyed` holds a unit whose player ≠ yours. Targets = own units on board in `state.cards.turnLog.fought` that have not used it this phase (Rules of One per unit: mark `ogm:scoff:<unit>` in phase marks; `t.abilitiesUsedThisPhase` records the source, not the target). Resolve by mode: **raw** → `effectService.grant(ctx, target, { when: { unitCharged: true, weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: 1 } }, { scope: { who: 'self' }, duration: 'battle' })`; **giblets** → ledger `mission.custom.ogmScoff[unitId].giblets += 1`, read by the C4 hook `wardRollModifier` (−1 when the warded unit's attacker is that unit and `kind === 'melee'`); **brains** → ledger `.brains += 1`, read by `produce` at `onObjectiveControl` (`{ kind: 'stat', delta: 3 × brains }`, the `kharadronTakeWhatYouAreOwed` pattern). If `state.cards` can be null in a game, fall back to a faction ledger fed by `UnitDestroyed` / fight activation events (the `idoneth.ts` FOUGHT ledger pattern). |
| OGM-RA-1 Brutish Barging | (b) `ogorsBrutishBarging` + (c) C5 | Regiment ability, `timing endOfTurn / your`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'friendly' }]`. Targets = own units on board with `turn.chargedThisTurn`. Resolve: `n = rollExpr('2D6')` (announce it); `writeMoveQueue(s, { abilityId, player, maxDistance: n, queue: [target], opts: { combatPathExcept: enemiesInCombat(state, target), mayNotEndInCombat: true } })`. Needs the queue to be stepped in the end-of-turn window (it is for Seething Swarm-style windows; verify `endOfTurn` runs `nextStep`, else add `atWindow: 'endOfTurn'`). |
| OGM-RA-2 Blinding Dust Clouds | (b) `ogorsBlindingDust` (gate) | Passive regiment descriptor, `trigger always`, `scope { who: 'attacker' }` (the Idoneth Low Tide flip), `effect { modifyRoll: { roll: 'hit', value: -1 } }`, `code 'ogorsBlindingDust'` whose `gate(state, holder, entry, data)` passes only when `data.attack.targetUnitId` is a friendly unit with `turn.arrivedThisTurn` or `setUpTurn` = this round and active player (the `ironjawz.ts` `setUpThisTurn` test). Both shooting and combat attacks. |
| OGM-ENH Wallwrecker | (a) + (c) C2 | Passive enhancement, scope bearer, `effect { passAcrossTerrain: true }`. |
| OGM-ENH Lungburster | (a) + (c) C3 | Passive enhancement, `scope { who: 'friendly', within: 9, wholly: true }` (holder counts itself), `effect { rollFloor: { roll: 'advance', value: 4 } }`. |
| OGM-ENH Deathcheater | (b) `ogorsDeathcheater` | Passive enhancement, `code` with `adjustFeelNoPain(state, entry, modelId, current)`: when `modelId` belongs to the bearer's unit and `unitGap(state, bearer, u) > 3` for every other friendly unit on the board, return `{ threshold: 6, modifier: 0 }`, else null (the FYR-AB-3 Duty Unto Death pattern). |
| OGM-ENH Gristlegobbler | (b) `ogorsGristlegobbler` | Enhancement, `timing endOfTurn / any`, `limit oncePerBattle`. `canUse` = general on board and `enemiesInCombat(state, general).length > 0`. Resolve: for each of those units `inflictMortal(ctx, use, id, rollExpr('D3'))` (one D3 each, in id order), then `healUnit(ctx, general, 3, abilityId)`. |
| OGM-AB-1 Roaring Warlord | (b) `ogorsRoaringWarlord` | Activated, `phase command / your`, `roll { dice: 'D6', succeedOn: 3 }`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { range: 12 }`. Targets = own units on board within 12" (`unitGap`) and visible (`losService.unitVisible`), self included. Resolve: `effectService.grant(ctx, target, { modifyRoll: { roll: 'charge', value: 1 } }, { scope: { who: 'self' }, duration: 'untilEndOfTurn' })`. |
| OGM-AB-2 Wall of Meat | (a) | Passive, scope self, `effect { when: { unitCharged: false }, modifyRoll: { roll: 'save', value: 1 } }` (defender side; `hooks-impl` reads `turn.chargedThisTurn`). Test that the flag is false for every unit in the opponent's turn. |
| OGM-AB-3 Stomping Marauders | (b) `ogorsStompingMarauders` | Passive, `trigger objectiveControl`, `producesAt ['onObjectiveControl']`: `{ kind: 'stat', delta: 2 }` when the holder unit `turn.chargedThisTurn`. |
| OGM-AB-4 Shock and Gore | (b) `ogorsShockAndGore` | Activated, `phase fight / your`, `limit oncePerTurnArmy`, `roll { dice: 'D6', succeedOn: 3 }`, `declare [{ role: 'unit', owner: 'enemy' }]`. `canUse` = this unit `turn.chargedThisTurn`; targets = `enemiesInCombat(state, self)`. Resolve: grant the **enemy** unit `{ modifyRoll: { roll: 'wound', value: -1 } }`, scope self, `untilEndOfTurn` (attacker side: its own wound rolls). Offered in the start-of-combat window and between activations. |

### 7.1 Engine changes (c)

- **C1 every-model edge arrival** (`phases/movement.ts`, `factions/aos-moves.ts`): `ArrivalParams` / `SetUpParams +
  edgeAll?: boolean`; `PlaceShape + edgeAll?: boolean`. With `edgeAll`, `resolveSetUp` rejects (`E_OUT_OF_RANGE`, "every model
  must be within 1" of a battlefield edge") unless **every** placed model's base edge is within `edgeWithin` of some board
  edge (`nearBoardEdge` per model, `every` instead of `some`); `reinforcementFormation` / `arrivalCandidates` test the same
  and, for `anywhere` + `edgeWithin`, spread candidates along all four battlefield edges (not only territory edges), laying
  multi-model units as a line parallel to the edge. Additive; Tzeentch Fated Arrival (no `edgeAll`) is unchanged.
- **C2 terrain-only flight** (`src/data/types.ts` `Effect + passAcrossTerrain?: true`, `common.schema.json`, `hooks.ts`
  `EFFECT_HOOKS + passAcrossTerrain: []` (read directly), `terrain.ts`): `isFlyer(state, model)` becomes
  `hasKeyword(…, 'FLY') || hookService.unitHasEffectFlag(state, model.unitId, 'passAcrossTerrain')`, used only by
  `crossesImpassable` and `extraMoveCost` (and the charge / movement path climb cost through them). `movement.ts flyOf`,
  `charge.ts fly` and `aos-moves.ts` normalMove stay keyword-only, so the general still cannot fly over models or combat
  ranges. `hooks.ts` is frozen: the `EFFECT_HOOKS` key is additive and needs the `00-architecture.md` note.
- **C3 run-roll floor** (`src/data/types.ts` `Effect + rollFloor?: { roll: 'advance'; value: number }`, schema,
  `hooks-impl.ts advanceRollFor`, `hooks.ts EFFECT_HOOKS + rollFloor: ['onAdvanceRoll']`): `advanceRollFor` adds
  `'rollFloor'` to the matched keys and sets `v = max(v, floor)` on the rolled value **before** `halveRoll` and `modifyRoll`.
  The run roll event shows the floored value. AI move reach: expected run with the floor = 4.5 (not 3.5).
- **C4 attacker-side ward modifier** (`code-hooks.ts`, `hooks-impl.ts`, `attack.ts wardThreshold`): `EngineCodeHook +
  wardRollModifier?(state, entry, info: WardDenialInfo): number` (the F16 `{ wardedUnitId, attackerUnitId, kind }` shape);
  `HookQueries + wardRollModifierFor(state, info): number` sums the answers of every source entry after its gate.
  `wardThreshold` adds it to `modifier` when an attacker and a kind are known (before the existing ±1 clamp). Additive; the
  data-side `modifyRoll feelNoPain` stays defender-only.
- **C5 selective combat-range path** (`factions/aos-moves.ts`): `SlideOpts + combatPathExcept?: UnitId[]`. `checkSlide` with
  it runs the `noCombatPath` path test against enemy models **not** in the listed units (models of listed units are ignored
  for the path test only), and implies `mayNotEndInCombat` (end test still against every enemy). `slideOptions` does **not**
  return [] for a unit in combat when `combatPathExcept` is set (unlike `noCombatPath`). approximation: rigid slide, as every
  out-of-phase move.

None of C1–C5 touches `types.ts`, `actions.ts`, `events.ts`, `rng.ts`, `decider.ts` or `index.ts`; C2/C3 add keys to the frozen
`hooks.ts` `EFFECT_HOOKS` (additive) and to `src/data/types.ts`, so they need notes in `docs/spec/00-architecture.md` and
`docs/spec/13-engine-port-plan.md`.

---

## 8. Engine notes

1. **No shooting, no magic:** the AI's shooting and casting steps simply have nothing to do for this army; nothing to add.
2. **Reserve timing:** both reserve units become available in the movement phase of battle round 3 (each player's own turn).
   The AI brings both in on the first legal chance, on the edge nearest an objective it does not control, as far forward as
   the 6" rule allows (it still has its charge phase that turn).
3. **Brutish Barging target:** a unit that charged this turn and is still on the board; it may be out of combat by the end
   of the turn (enemy destroyed) and still move. The 2D6 is rolled after the target is picked.
4. **Scoff Down upgrades:** the AI picks Steaming Brains for a unit on or next to an objective, Raw and Bloody Flesh for
   Maulbeast Cavalry and Ironguts (they charge most), Exotic Giblets when the opponent's army has wards; never repeats Raw or
   Giblets on one unit.
5. **AI:** Roaring Warlord — the unit with the best expected charge that has a target 7–10" away (the +1 matters most there);
   Shock and Gore — the enemy unit in combat with the Maulbeast whose expected melee damage is highest, before it fights;
   Gristlegobbler — the first end of turn when the general is in combat and either at ≤ 5 Health or with an enemy unit in
   combat that the D3 could finish; Brutish Barging — end of your turn when a unit that charged could leave a fight it is
   losing or reach an objective within the expected 7".
6. **Ward sources:** Deathcheater (6+, general alone). Exotic Giblets lowers the opponent's wards. Nothing else.
7. **Defaults for the sim:** regiment Blinding Dust Clouds and enhancement Gristlegobbler (both need no engine change);
   variant games Brutish Barging (C5) and Lungburster (C3).

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| OGM-ARMY-1 | Warglutt Marauders builds: Tyrant general + Gluttons (2) + Gluttons (3) + Ironguts (3) + 2× Maulbeast Cavalry (1), 11 models, stats as §5. |
| OGM-ARMY-2 | No unit is ever offered for Call for Reinforcements. |
| OGM-BT-1 | Nomadic Warriors: the 3-model Gluttons and one Maulbeast start in reserve; More Ogors is not offered before battle round 3. |
| OGM-BT-2 | More Ogors: a set-up with any model more than 1" from a battlefield edge, or any model within 6" of an enemy, is rejected; a legal edge set-up anywhere on the board is accepted. |
| OGM-BT-3 | Scoff Down: not offered when no enemy unit was destroyed this turn; only units that fought this turn are targets; each unit once per end of turn. |
| OGM-BT-4 | Raw and Bloody Flesh: +1 to hit for that unit's melee attacks only in turns it charged; lasts the battle. |
| OGM-BT-5 | Exotic Giblets: enemy ward rolls against that unit's melee damage are −1; its other damage and other units' damage unchanged. |
| OGM-BT-6 | Steaming Brains: +3 to that unit's control score; taken twice gives +6. |
| OGM-RA-1 | Brutish Barging: once per battle at end of your turn, a unit that charged moves up to 2D6"; may cross the combat ranges of the units it started in combat with, not others; never ends in combat. |
| OGM-RA-2 | Blinding Dust Clouds: −1 to hit against a friendly unit set up this turn; no penalty the turn after or for units deployed normally. |
| OGM-ENH-1 | Wallwrecker: the general crosses a wall / impassable piece a foot model cannot, with no climb cost; it still cannot pass through enemy combat ranges on a Normal Move. |
| OGM-ENH-2 | Lungburster: a run roll of 1–3 becomes 4 for units wholly within 9" of the general; 5–6 unchanged; units outside unaffected. |
| OGM-ENH-3 | Deathcheater: Ward 6+ only while no other friendly unit is within 3" of the general. |
| OGM-ENH-4 | Gristlegobbler: once per battle, D3 mortal to each enemy unit in combat with the general, then Heal (3); not offered with no enemy in combat. |
| OGM-AB-1 | Roaring Warlord: 3+ gives a visible friendly unit within 12" +1 to charge rolls this turn; 1–2 nothing. |
| OGM-AB-2 | Wall of Meat: Gluttons save +1 except in a turn they charged. |
| OGM-AB-3 | Stomping Marauders: Ironguts control score +2 at the end of a turn they charged; not otherwise. |
| OGM-AB-4 | Shock and Gore: only after this unit charged; 3+ gives the target −1 to wound this turn; once per turn across both Maulbeast units. |
| OGM-WEAP-1 | Maulbeast's Horns and Fangs is a Companion weapon (unaffected by friendly buffs that skip Companion); every weapon in the army is melee. |
| OGM-ENG-C1..C5 | Engine changes §7.1 each get a unit test in `tests/engine/engine-f18.test.ts` (or the next F number). |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own raider livery): ruddy tan ogor skin with pink scars, blackened and rust-streaked
scavenged iron plates, dull crimson and mud-brown rags, bone-white tusks, teeth and trophy bones, warm brass rivets and
buckles as the accent. Shared motif: an original crossed fork-and-cleaver stamped into each round iron belly-plate. No GW
logos, no copied mawtribe or Gutbuster icons. All figures are **true MGSD** chibis (~2.5 heads tall, huge head, stubby legs,
big hands and feet); the Maulbeast is a chunky toy-like SD beast. Effects are solid, never see-through.

| Slug | Unit | Models needed | Base (mm) | Mount | Concept prompt |
|---|---|---|---|---|---|
| `ogm-tyrant` | Tyrant | 1 | 50 round | No | A true MGSD chibi ogre warlord, 2.5 heads tall with a huge bald head, wide grinning jaw full of square teeth, a tall horned iron crest behind his head, a round iron belly-plate stamped with a crossed fork and cleaver, stubby legs, one giant meat-cleaver in each fist. |
| `ogm-glutton` | Gluttons | 1 (×5) | 40 round | No | A true MGSD chibi ogre brawler, 2.5 heads tall with an enormous round head, a dented iron cap and a hungry open mouth, a big dented belly-plate over a bare gut, crimson loincloth, stubby legs, a spiked club in one hand and a chipped cleaver in the other. |
| `ogm-irongut` | Ironguts | 1 (×3) | 40 round | No | A true MGSD chibi armoured ogre veteran, 2.5 heads tall with a huge scowling head under a heavy riveted iron helm with tusks, thick blackened shoulder plates and belly-plate, stubby legs, hefting an oversized two-handed iron glaive over one shoulder. |
| `ogm-maulbeast-cavalry` | Maulbeast Cavalry | 1 (×2) | 90×52 oval | Yes (Maulbeast) | A chunky toy-like SD mount: a stubby barrel-bodied tusked beast with a huge fanged maw, curling horns and a shaggy brown mane, iron plates strapped to its brow, carrying a true MGSD chibi ogre rider (2.5 heads, huge head, iron half-helm) waving a hooked cleaver. |

Gluttons and Ironguts use one figure per unit: the Spearhead gives no champion, standard or musician rules and every model
carries the same weapon profile, so no variants (the two sculpts on the card differ only in which crude weapon is held). Both
Maulbeast Cavalry units share one figure. Mawseeker Mob figures are listed in Appendix A.

---

## 11. Implementation notes

Built (F18). Data `src/data/factions/ogors/` (faction.json `factionKeyword: 'OGOR MAWTRIBES'`, `armyRule` marker
`ogors.ability.warglutt-marauders`; datasheets/{tyrant, gluttons, ironguts, maulbeast-cavalry}.json; weapons.json; abilities.json;
enhancements.json; patrols/warglutt-marauders.json). Hooks `src/engine/factions/ogors.ts` (`...ogorsHooks` in `code-hooks.ts`).
Tests `tests/engine/ogors.test.ts`, `tests/data/ogors.test.ts` (one test per OGM- id, plus OGM-REG and the AI-hint check).
Patrol: `battleTraits: ['ogors.ability.nomadic-warriors', 'ogors.ability.scoff-down-fresh-flesh']`, regiment list Blinding Dust Clouds
(default) then Brutish Barging, enhancement list Gristlegobbler (default), Wallwrecker, Lungburster, Deathcheater. The Gluttons
datasheet is one warscroll (composition 2-3) used by two patrol entries; `gluttons-3` and `maulbeast-2` carry
`reserve: { ability: 'ogors.ability.more-ogors-my-lord' }` and no `via` (the PDF text is a battle trait, so core 24.1 never
destroys them). Figure mapping keys `<datasheet id>/<modelId>`: `ogors.unit.tyrant/tyrant`, `ogors.unit.gluttons/glutton`,
`ogors.unit.ironguts/irongut`, `ogors.unit.maulbeast-cavalry/maulbeast-rider`.

How the rules landed (as built):
- **Scoff Down Fresh Flesh** is an army descriptor with `UNLIMITED` (the engine's once-per-phase rule is per ability and unit, and an
  army ability has no unit) and the phase mark `ogm:scoff:<unitId>` for the once-per-unit rule. The three upgrades are the descriptor's
  data `modes`. Raw and Bloody Flesh is a battle-long declarative effect; Exotic Giblets and Steaming Brains are empty battle-long
  effects whose id keys `mission.custom.ogmScoff`, read by `wardRollModifier` and by `produce` at onObjectiveControl. Both need
  `state.cards.turnLog` (always present in a real game; tests set `s.cards.turnLog` by hand).
- **Stomping Marauders** has no declarative form for a unit-level control bonus, and `produce` is only asked of active effects, so
  `ensureEffects` puts one empty battle-long effect on each Ironguts unit the first time any ability window runs (the hero phase of
  round 1 at the latest, before any objective check).
- **Brutish Barging** is offered when the average roll (7") would let a unit that charged move somewhere that is not combat; the real 2D6
  is rolled after the target is picked and the unit may end up with only "stay" if the roll is small.
- **Shock and Gore** is offered in the combat-phase ability windows, i.e. before the first activation of the phase (there is no window
  between activations), which is enough because the penalty lasts the whole turn.
- AI: the hints are `ogorsAbilityTiming / ogorsTargetBonus / ogorsModeBonus / ogorsOptionUnit` (read by `src/ai/utility.ts`;
  `ogorsOptionUnit` reads the unit out of the `<abilityId>#<unitId>` option id, because the ability-use options carry no unit hint).

## Appendix A — Mawseeker Mob (same PDF, pages 5–8; out of scope)

Army id if ever built: `ogors.army.mawseeker-mob`. General: **Butcher**. Units: 1 Butcher, 3 Cleavers, 3 Gutseers, 5 Gorger
Mawpack. 12 models. Every warscroll here prints **Ward (6+)**. One Wizard (the Butcher, power level 1).

**Army resource — Butcher's Cauldron.** The general's cauldron is either **full** or **empty**; several rules read or flip
it (a `resourceReadout` for the HUD, F14).

**Battle traits.**
- `MWM-BT-1` From Out the Caverns — the Gorger Mawpack starts in reserve. **Frenzied Hunters:** once per battle, start of a
  battle round, from round 2: set it up within 1" of a battlefield edge (some model, as Tzeentch) and more than 6" from all
  enemy units. (Needs a start-of-round arrival window; today arrivals are movement-phase only.)
- `MWM-BT-2` Wot? No Meat!? — passive: the cauldron starts the battle empty.
- `MWM-BT-3` Chuck 'Em in the Pot — end of any turn, **mandatory**: if an enemy unit was destroyed this turn, the cauldron
  becomes full.

**Regiment abilities.** `MWM-RA-1` Dish Testers — any combat phase: if the cauldron is full, pick a visible friendly unit
wholly within 12" of the general; +1 to hit for its combat attacks for the rest of the turn; the cauldron empties.
`MWM-RA-2` Eager Procurers — passive: while the cauldron is empty, friendly units wholly within 12" of the general have +2"
Move.

**Enhancements.** Well-Stocked Larder (start of the first battle round: cauldron becomes full); Generous Portions (end of
any turn: if full, Heal (1) each visible friendly unit wholly within 9" of the general); Disgusting Eater (once per battle,
reaction: the opponent declared a Charge for a visible enemy unit within 12" of the general; subtract D3 from that charge
roll, or, if the cauldron is full, subtract 3 instead and the cauldron empties once that charge is resolved — needs a new
`opponentDeclaredCharge` reaction trigger); Hunger Pangs (once per battle, enemy movement phase: each friendly unit not in
combat may move up to D3"; those not in combat and wholly within 9" of the general while the cauldron is empty move up to
D6" instead; none may end in combat).

**Warscrolls.**

| Unit | Move | Health | Save | Control | Ward | Keywords | Base (mm) |
|---|---|---|---|---|---|---|---|
| Butcher (General) | 6" | 8 | 5+ | 3 | 6+ | Hero, Wizard, Infantry | 50 round |
| Cleavers (3) | 6" | 4 | 5+ | 2 | 6+ | Infantry | 40 round |
| Gutseers (3) | 6" | 4 | 5+ | 2 | 6+ | Infantry | 40 round |
| Gorger Mawpack (5) | 6" | 5 | 6+ | 2 | 6+ | Infantry | 50 round |

| Weapon | Unit | Type | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Butcher's Tools | Butcher | Melee | 4 | 4+ | 2+ | 2 | 3 | — |
| Cleaver's Tools | Cleavers | Melee | 4 | 4+ | 2+ | 2 | 3 | — |
| Gutseers' Tools | Gutseers | Melee | 3 | 4+ | 2+ | 2 | 3 | — |
| Clubs, Claws and Jaws | Gorger Mawpack | Melee | 5 | 4+ | 2+ | 1 | 2 | — |

**Abilities.** Rust-maw (Butcher, your hero phase, spell, casting value 6: a visible enemy unit within 12"; until the start
of your next turn its melee weapons have −1 Rend). Butcher's Cauldron (Butcher, reaction: you declared Rust-maw; if the
cauldron is full roll a D3: on 1 it empties, on 2+ add 2 to the casting roll — the F16 `castingRollBonus` shape). A Taste for
the Arcane (Cleavers, passive: their melee weapons have Crit (2 Hits) while in combat with an enemy Wizard or Priest).
Conduits of Gut Magic (Gutseers, once per turn for the army, any hero phase: the general's next Rust-maw measures range and
visibility from this unit). Bestial Hunger (Gorger Mawpack, passive: in your charge phase, if not in combat and any enemy unit
is within 12", it must declare a Charge, and if the roll lets it end within ½" of a visible enemy unit it must).

**Figures (if built).** `ogm-butcher` (1, 50 round: MGSD chibi pot-bellied ogre shaman with a huge grinning head, a
blood-stained apron, a cleaver and a big iron cauldron on a chain, solid red broth); `ogm-cleaver` (1 ×3, 40 round: MGSD chibi
pale ogre zealot with a stitched-mouth belly-plate, a hook and a cleaver); `ogm-gutseer` (1 ×3, 40 round: MGSD chibi hooded
ogre seer clutching a cleaver and a lumpy offering); `ogm-gorger` (1 ×5, 50 round: MGSD chibi gaunt grey ogre with long
clawed arms, wild hair and a starving open maw).

---

## Appendix B — Other Ogor Spearheads (not built, PDFs not kept)

| Title | Listed / updated | File (assets.warhammer-community.com) | Roster |
|---|---|---|---|
| Tyrant's Bellow | 2025-06-11 / 2026-04-01 | `eng_aos_spearhead_ogor_tyrant-s_bellow-2x4dua4hul-ybq3296fth.pdf` | Tyrant (general), 2 Mournfang Pack, 3 Ogor Gluttons, 3 Ogor Gluttons, 4 Leadbelchers, 1 Ironblaster |
| Scrapglutt | 2025-06-11 / 2026-04-01 | `eng_01-04_aos_spearhead_ogor_mawtribes_scrapglutt-rscn8zyfsn-ersmm4yxe3.pdf` | Mantrappers (general, with Gnoblar / Frost Sabre / Trap tokens), 2 Ironguts, 2 Ironguts, 4 Ironguts, 12 Gnoblars, 1 Gnoblar Scraplauncher |

Both were downloaded on 2026-10-30 only to tell the armies apart; neither is kept in `docs/sources/`.
