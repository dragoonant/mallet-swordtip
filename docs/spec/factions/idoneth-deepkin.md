# Idoneth Deepkin — Soulraid Hunt (Spearhead)

Faction id: `idoneth` · Army id: `idoneth.army.soulraid-hunt` · Grand alliance: Order.
Source: `docs/sources/spearhead-idoneth-deepkin.pdf` (7 pages, 16.7 MB, gitignored), "Spearhead: Idoneth Deepkin - Soulraid
Hunt", the free Warhammer Community download (Age of Sigmar, Spearhead category). Listed 2025-11-12, last updated 2026-04-01
(PDF metadata: created and modified 2026-03-13). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_01-04_aos_spearhead_idoneth_deepkin_soulraid_hunt-ymkq3pu04e-aymk0cvmbn.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, body
`{"index":"downloads_v2","searchTerm":"idoneth"}`). Stat blocks and ability timings were checked against the rendered pages
(the text layer of page 3 is out of order). The PDF prints no base sizes. They come from the Wahapedia aos4 warscroll pages
(`wahapedia.ru/aos4/factions/idoneth-deepkin/Isharann-Soulscryer`, `/Akhelian-Morrsarr-Guard`, `/Akhelian-Allopex`,
`/Namarti-Thralls`), fetched the same day with plain curl.

**Which army.** The search returns two separate Idoneth Spearhead PDFs, one army each. **Soulraid Hunt** (Isharann
Soulscryer, 3 Akhelian Morrsarr Guard, Akhelian Allopex, 2×5 Namarti Thralls) is exactly the contents of the
**Spearhead: Idoneth Deepkin** box (one Soulscryer, one Allopex, one 3-model Akhelian Guard kit, one 10-model Namarti kit),
and it is the file that got the April 2026 rules update. So it is the army this spec builds. *Akhelian Tide Guard* (Akhelian
King, 3 Morrsarr Guard, 3 Ishlaen Guard, 10 Namarti Reavers; listed 2025-07-16, PDF made 2025-07-15,
`https://assets.warhammer-community.com/eng_aos4_idoneth_deepkin_spearhead_rules-wa1tiv6csl-bndmddnja9.pdf`) needs a King kit and
two Akhelian Guard kits, so it is not one box. RULING: it is out of scope. Its rules are recorded in Appendix A so it can be added
later without reopening its PDF (kept out of `docs/sources/`; re-download from the URL above).

Mechanics and numbers are ported 1:1. All wording below is our own. Rule IDs `IDK-*` double as test IDs (§9).

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of an
enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run = `advance`,
Retreat = `fallBack`. Rend is stored as `AP` (negative = more Rend); a printed Rend "-" is 0. "Ward (N+)" = `feelNoPain: N`.
"Heal (X)" = remove X damage points from the unit (`healUnit`).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `idoneth.unit.isharann-soulscryer` | Isharann Soulscryer | 1 | **General** | no | 32 round (Wahapedia) |
| `idoneth.unit.akhelian-morrsarr-guard` | Akhelian Morrsarr Guard | 3 | Unit | no | 60×35 oval (Wahapedia) |
| `idoneth.unit.akhelian-allopex` | Akhelian Allopex | 1 | Unit | **yes** | 90×52 oval (Wahapedia) |
| `idoneth.unit.namarti-thralls` (a) | Namarti Thralls | 5 | Unit | **yes** | 32 round (Wahapedia) |
| `idoneth.unit.namarti-thralls` (b) | Namarti Thralls | 5 | Unit | **yes** | 32 round |

Total: 5 units, 15 models. Both Thralls units share one warscroll and one datasheet (two patrol entries, `ref` `thralls-1` /
`thralls-2`, `size: 5`). No Wizard, no Priest. The Soulscryer is the only Hero. Morrsarr Guard and the Allopex have **Fly** and
are **Cavalry**. The Allopex is a one-model unit that still has Reinforcements: once destroyed it can be called back as a fresh
unit through the core Call for Reinforcements.

---

## 2. Battle trait

### IDK-BT `idoneth.ability.tides-of-death` — Tides of Death
- **Timing:** Passive. In every battle round, every friendly unit has the one effect that matches the current battle round
  number (both players' turns of that round).
- **IDK-BT-1 Round 1, Low Tide:** subtract 1 from the hit rolls of **shooting attacks** that target this unit.
- **IDK-BT-2 Round 2, Flood Tide:** this unit may use a **Run** ability and still use **Shoot** and/or **Charge** abilities
  later in the same turn.
- **IDK-BT-3 Round 3, High Tide:** this unit has **Strike-first**.
- **IDK-BT-4 Round 4, Ebb Tide:** this unit may use a **Retreat** ability and still use **Shoot** and/or **Charge** abilities
  later in the same turn. The Retreat still costs its normal mortal damage.
- Notes: a Spearhead battle lasts 4 rounds, so every round has a tide. Strike-first against an enemy that also has it cancels
  per core (already in `fight.ts`). The HUD should show the current tide.

---

## 3. Regiment abilities (pick 1 at army selection)

### IDK-RA-1 `idoneth.ability.way-of-the-cresting-wave` — Way of the Cresting Wave
- **Timing:** Passive.
- **Effect:** Friendly **Namarti Thralls** units that **charged this turn** get **+1 Rend** on their melee weapons (Lanmari
  Rend 1 → 2; with Anti-Infantry against an Infantry target, 3).

### IDK-RA-2 `idoneth.ability.ethersea-predators` — Ethersea Predators
- **Timing:** End of any turn, **once per turn for the army**.
- **Declare:** Pick 1 friendly **Cavalry** unit that **used a Fight ability this turn**.
- **Effect:** **Heal (D3)** that unit.
- Notes: the Cavalry here are the Morrsarr Guard and the Allopex. A unit that fought but caused no damage still qualifies; a
  unit that was only attacked does not.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `idoneth.enh.arch-ritualist` | Arch-Ritualist | Passive | Add 1 to the general's roll for **Ritual of the Creeping Mist** (IDK-AB-1), so it works on a 2+. |
| `idoneth.enh.steelshell-armour` | Steelshell Armour | Passive | Every modifier to the general's **save rolls** is ignored, positive and negative (Rend included, F14 core ruling: the bare die against Save 5+; an unmodified 1 still fails). |
| `idoneth.enh.mind-flare` | Mind Flare | **Once per battle**, any combat phase | Declare: pick an enemy unit **in combat with the general**. Until the end of the phase, that unit's attacks **only hit on an unmodified 6**. |
| `idoneth.enh.delicious-morsels` | Delicious Morsels | Your hero phase (no printed limit; CORE-3.4 once per phase) | **Heal (1)** each friendly **Cavalry** unit **within the general's combat range** (3" of the general). |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. **No warscroll in this army prints a Ward.** Printed keywords only (Spearhead
warscrolls print no faction keywords). Stat blocks were read from the rendered pages; the text layer lists them as Move, Control,
Health, Save.

### 5.1 `idoneth.unit.isharann-soulscryer` — Isharann Soulscryer (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 5 | 5+ | 2 | — |

Keywords: **Hero, Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Scryfish Shoal (`idoneth.weapon.scryfish-shoal`) | Ranged | 10" | 8 | 5+ | 5+ | — | 1 | Shoot in Combat, Companion |
| Abyssal Touch (`idoneth.weapon.abyssal-touch`) | Melee | — | 3 | 3+ | 4+ | — | D3 | — |

**IDK-AB-1 `idoneth.ability.ritual-of-the-creeping-mist` — Ritual of the Creeping Mist**
- **Timing:** Your hero phase (once per phase for this unit, CORE-3.4). Not a spell or prayer.
- **Declare:** Pick a **visible friendly unit wholly within 12"** of this unit, then roll a D6.
- **Effect:** On **3+** (2+ with Arch-Ritualist), until the **start of your next turn**, subtract 1 from **wound rolls** for
  attacks that target that unit. On a fail nothing happens.
- [interp] The Soulscryer may pick itself (the card does not say "other").

### 5.2 `idoneth.unit.akhelian-morrsarr-guard` — Akhelian Morrsarr Guard
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 14" | 4 | 4+ | 1 | — |

Keywords: **Cavalry, Fly**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Voltspear (`idoneth.weapon.voltspear`) | Melee | — | 2 | 3+ | 4+ | 1 | 1 | Charge (+1 Damage) |
| Fangmora's Fangs and Lashing Tail (`idoneth.weapon.fangmora-fangs`) | Melee | — | 3 | 4+ | 3+ | 1 | D3 | Companion |

Loadout: every model carries both weapons. No champion, standard or musician rules.

**IDK-AB-2 `idoneth.ability.biovoltaic-blast` — Biovoltaic Blast**
- **Timing:** **Once per battle**, any charge phase.
- **Declare:** Only if this unit **charged this phase**. Pick an enemy unit **within 1"** of this unit, then roll one D6 per
  model in this unit (live models).
- **Effect:** Each die scoring **4–5** inflicts **1 mortal damage** on the target; each **6+** inflicts **D3 mortal damage**.
  Add 1 to every die if the target has **more models** than this unit (then a 3 counts as 4, a 5 as 6+).

### 5.3 `idoneth.unit.akhelian-allopex` — Akhelian Allopex
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 8 | 4+ | 2 | — |

Keywords: **Cavalry, Fly, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Razorshell Harpoon Launcher (`idoneth.weapon.razorshell-harpoon-launcher`) | Ranged | 18" | 2 | 3+ | 2+ | 1 | 3 | Anti-Monster (+1 Rend) |
| Barbed Hooks and Blades (`idoneth.weapon.barbed-hooks-and-blades`) | Melee | — | 4 | 3+ | 4+ | 1 | 1 | — |
| Allopex's Ferocious Bite (`idoneth.weapon.allopex-bite`) | Melee | — | 3 | 4+ | 2+ | 2 | 2 | Companion |

The harpoon has no Shoot in Combat.

**IDK-AB-3 `idoneth.ability.bloodthirsty-predators` — Bloodthirsty Predators**
- **Timing:** Passive.
- **Effect:** The **Allopex's Ferocious Bite** has **+1 Attacks** (3 → 4) while this unit is **within 6"** of any enemy unit
  that is **damaged** (has damage points allocated) **or** that **had a model slain this turn** (any cause).
- Notes: the second clause matters for enemy units of 1-Health models, which never stay damaged. The ability names the Companion
  weapon itself, so it reaches it (CORE-12.4 only shields Companion weapons from other abilities).

### 5.4 `idoneth.unit.namarti-thralls` — Namarti Thralls (×2 units)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 1 | 5+ | 1 | — |

Keywords: **Infantry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Lanmari (`idoneth.weapon.lanmari`) | Melee | — | 2 | 3+ | 4+ | 1 | 1 | Anti-Infantry (+1 Rend) |

Loadout: all 5 models carry a Lanmari. No champion, standard or musician rules.

**IDK-AB-4 `idoneth.ability.sweeping-blows` — Sweeping Blows**
- **Timing:** Passive.
- **Effect:** The Lanmari has **+1 Damage** (1 → 2) for attacks that target an enemy **Monster**.

---

## 6. Spells and prayers

None. No Wizard or Priest in the army. Ritual of the Creeping Mist is a plain ability with a D6 roll (it cannot be unbound).

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/idoneth/*.json`), at most reusing an existing code hook; (b) = new faction
code hook in `src/engine/factions/idoneth.ts`, exported as `idonethHooks` and spread into `code-hooks.ts` like `skavenHooks`.
Shared helpers from `aos-common.ts`: `onBoard`, `whollyWithinUnit`, `unitsWithin`, `unitGap`, `enemiesInCombat`, `inCombat`,
`inflictMortal`, `announce`, `paramOf`, `isDamaged`, `healUnit`, `isDatasheet`, `hasKeyword`. (c) = engine change outside the
faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, no Ward | (a) | Datasheets as the other armies; `HERO`, `INFANTRY`, `CAVALRY`, `FLY`, `REINFORCEMENTS`. Bases `{ shape: 'round', mm: 32 }`, `{ shape: 'oval', mm: 60, mm2: 35 }`, `{ shape: 'oval', mm: 90, mm2: 52 }`. |
| Thralls ×2, Reinforcements on Thralls and Allopex | (a) | One Thralls datasheet, two patrol entries (`size: 5`). Core `spearheadCallForReinforcements`; the Soulscryer and Morrsarr Guard are never offered. |
| Weapon abilities | (a) | Scryfish Shoal `SHOOT_IN_COMBAT` + `COMPANION`; Voltspear `CHARGE_DAMAGE` (value 1); Fangmora's Fangs and the Bite `COMPANION`; Harpoon `{ ability: 'ANTI', keyword: 'MONSTER', value: 1 }`; Lanmari `{ ability: 'ANTI', keyword: 'INFANTRY', value: 1 }` (khorne / ironjawz pattern). |
| IDK-BT-1 Low Tide | (a) | Battle-trait descriptor `idoneth.ability.tides-of-death-low`, `trigger 'hitRoll'`, passive, `scope { who: 'attacker' }` (the Evasive Hunter / Chorus of Terror pattern: holder = the targeted Idoneth unit), `effect { when: { round: { lte: 1 }, weaponType: 'ranged' }, modifyRoll: { roll: 'hit', value: -1 } }`. |
| IDK-BT-2..4 Flood / High / Ebb Tide | (a) | Battle-trait descriptor `idoneth.ability.tides-of-death`, `trigger 'always'`, passive, `scope self`, effect list with per-entry `when.round` (hooks-impl `evaluateCondition` reads `c.round` against `state.round`): `{ when: { round: { gte: 2, lte: 2 } }, shootAfterAdvance: true }`, `{ … round 2, chargeAfterAdvance: true }`, `{ when: { round: { gte: 3, lte: 3 } }, fightsFirst: true }`, `{ … round 4, shootAfterFallBack: true }`, `{ … round 4, chargeAfterFallBack: true }`. All five keys are `ELIGIBILITY_KEYS`, answered at `onEligibility` from a code-less passive (Frazzleburned Scrap pattern). Patrol `battleTraits: ['idoneth.ability.tides-of-death', 'idoneth.ability.tides-of-death-low']`; the cards UI shows them as one trait (the low entry carries `params.hidden: true` or the client groups by name). |
| Tide readout | (b) `idonethTides` | Code on the main trait with only `resourceReadout(state, ability, player)` → `{ id: 'idoneth.tide', label: 'Tide: <Low/Flood/High/Ebb Tide>', value: round 1..4, max: 4, help }` (F14 MON C2; `FactionResource.value` is a number, so the tide name rides in the label). Purely informational; `run: noop`, no `hooks`, so the declarative effects stay as they are. Shipped as built: the second descriptor is named "Tides of Death (Low Tide)" with `params.hidden: true` (the client does not read it yet, so the cards UI lists two entries). |
| IDK-RA-1 Way of the Cresting Wave | (a) | Passive regiment descriptor, `trigger 'always'`, `scope self` (regiment abilities sit on every unit), `effect { when: { unitCharged: true, weaponType: 'melee', unitHasModel: 'namarti-thrall' }, modifyStat: { stat: 'AP', value: -1 } }` (Heirloom Blade encoding; `unitHasModel` matches the Thralls' datasheet model id, so no name keyword is needed). |
| IDK-RA-2 Ethersea Predators | (b) `idonethEtherseaPredators` | Activated, `timing endOfTurn / any`, `limit oncePerTurnArmy`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { heal: 'D3' }`. The same code also implements `onOwnFightResolved(ctx, { unitId })` (fires for the regiment ability's code on every fighting friendly unit, `attack.ts ownAbilityCodes`) and records `unitId` in `mission.custom.idkFought = { key: 'round:activePlayer', units }` (stale key = empty). Targets = friendly units on board with `CAVALRY` whose id is in the current ledger. Resolve: `healUnit(ctx, target, rollExpr('D3'), abilityId)`. `canUse` also needs the target to be damaged (healing an undamaged unit is a no-op; skip offering it). |
| IDK-ENH Arch-Ritualist | (a) | Passive enhancement descriptor with no effect; read by `idonethCreepingMist` (is the caster the bearer of `idoneth.enh.arch-ritualist`). Endless Swarm pattern. |
| IDK-ENH Steelshell Armour | (a) | Passive enhancement, `scope bearer`, `trigger 'saveRoll'`, `effect { ignoreModifiers: 'save' }` (F14 §3.12: bare die vs Save, Rend dropped, positive modifiers dropped too). |
| IDK-ENH Mind Flare | (b) `idonethMindFlare` | Enhancement, `timing phase fight / any`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'enemy' }]`. Targets = `enemiesInCombat(state, general)`. Resolve: `effects.grant(ctx, target, { onlySixes: 'hit' }, { scope: { who: 'self' }, duration: 'untilEndOfPhase' })` (holder = the enemy unit, its own hit rolls; exact through (c) C2, which the engine-core stage landed: only an unmodified 6 hits, whatever the modifiers). Offered in the start-of-combat window and between fight activations (Cage of Warp Lightning pattern). The first draft used `autoResult` fail on unmodified rolls up to 5 (an approximation); C2 replaced it. |
| IDK-ENH Delicious Morsels | (b) `idonethDeliciousMorsels` | Enhancement, `timing phase command / your`, no declare. `canUse` = some friendly `CAVALRY` unit on board with `unitGap(unit, general) <= 3` is damaged. Resolve: `healUnit(ctx, u, 1, abilityId)` for each such unit. |
| IDK-AB-1 Ritual of the Creeping Mist | (b) `idonethCreepingMist` | Activated, `timing phase command / your`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { range: 12, succeedOn: 3 }`. Targets = friendly units on board, `whollyWithinUnit(t, caster, 12)`, visible from a caster model (`losService.unitVisible`; the caster itself counts). The hook rolls the D6 itself (no declared `roll`, so the +1 can be added): `total = d6 + (caster bears Arch-Ritualist ? 1 : 0)`, success on `total >= 3`. On success `effects.grant(ctx, target, { modifyRoll: { roll: 'wound', value: -1 } }, { scope: { who: 'attacker' }, duration: 'untilNextTurn' })` (Scare Taktikz pattern). |
| IDK-AB-2 Biovoltaic Blast | (b) `idonethBiovoltaicBlast` | Activated, `timing phase charge / any`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params { requires: 'charged', within: 1 }` (Devastating Charge pattern for the window and the charged gate). `canUse` = `turn.chargedThisTurn` and some enemy within 1" (`unitGap <= 1`). Resolve: `n` = live models of this unit; `bonus = liveModels(target) > n ? 1 : 0`; roll `n`D6 in one `rollOnce` (purpose `'ability'`); per die `v = d + bonus`: `v >= 6` → add `rollExpr('D3')`, `v >= 4` → add 1; `inflictMortal(ctx, use, target, total)` once. |
| IDK-AB-3 Bloodthirsty Predators | (b) `idonethBloodthirstyPredators` + (c) C1 | Passive datasheet descriptor with code: `statDelta(state, entry, q)` (F14) returns `+1` when `q.stat === 'A'` and `q.weapon.id === 'idoneth.weapon.allopex-bite'` and some enemy unit on board within 6" (`unitGap`) is `isDamaged` or `lostModelThisTurn` (C1). The hook sets `affectsCompanion: true` (the Bite is Companion and the ability names it). |
| IDK-AB-4 Sweeping Blows | (a) | Passive, `scope self`, `effect { when: { weaponId: 'idoneth.weapon.lanmari', targetKeyword: 'MONSTER' }, modifyStat: { stat: 'D', value: 1 } }` (Kruleboyz Skewered pattern, `modifyStat` instead of `setStat`). |

**Engine changes (c):**
- **C1 lost-model ledger** (`attack.ts`): the F14 turn ledger gains a field, `TurnLedger + lostModels: UnitId[]`, noted for the
  slain model's unit wherever a model is slain (`finishDestroy` and any other model-removal path that is a slay, any damage source:
  attacks, mortal damage from abilities, retreat damage; not models removed by redeploys or Call for Reinforcements). New export
  `export function lostModelThisTurn(state: GameState, unitId: UnitId): boolean`. Same staleness rule as `damagedThisTurn`
  (key `round:activePlayer`). Additive; no frozen contract (the ledger lives in `mission.custom`). Add a row to
  `docs/spec/13-engine-port-plan.md`.
- **C1 and C2 both landed** in the F16 engine-core stage (`lostModelThisTurn`, `Effect.onlySixes`), and Idoneth uses both. **C2 (exact Mind Flare)** (`src/data/types.ts` `Effect` + `common.schema.json` + `attack.ts`): `Effect.onlySixes?:
  'hit'`; `runStage` ORs it into `StageParams.onlySix` for the holder's hit rolls (the same path Wreathed in Smoke / Go to Ground
  cards use: success iff the unmodified die is 6). Needs `EFFECT_HOOKS` `+ onlySixes: ['onHitRoll']` in `hooks.ts` (frozen,
  additive) and a note in `00-architecture.md`. (Shipped.)

No other engine work: the round condition, eligibility keys, `ignoreModifiers: 'save'`, `statDelta`, `onOwnFightResolved`,
`resourceReadout`, `ANTI` and `CHARGE_DAMAGE` all exist.

---

## 8. Engine notes

1. **Tides and the AI:** the AI's move planner must read eligibility (`onEligibility` 'shoot' / 'charge' after `advance` /
   `fallBack`) instead of assuming a Run forbids a charge; in round 2 a Run-then-charge with the 14" Morrsarr Guard is the
   army's main threat. In round 4 Retreat-then-charge lets a unit re-charge a different target.
2. **Low Tide** only touches **shooting** attacks and only in round 1, in both players' turns.
3. **Way of the Cresting Wave + Anti-Infantry:** both add Rend, so a charging Thralls unit hits Infantry at Rend 3.
4. **Steelshell Armour vs. Creeping Mist:** the Mist changes the attacker's wound roll, not the save, so both work on the
   Soulscryer together.
5. **Ethersea Predators timing:** offered in the end-of-turn window of both turns. The ledger is fed by fight activations of
   the current turn only; a unit that fought in the enemy's combat phase qualifies at the end of that enemy turn.
6. **Biovoltaic Blast window:** the "charged this phase" gate means it is only usable in the owner's charge phase, after the
   unit's charge move (the existing charge-phase window after charges, as Devastating Charge).
7. **AI hints** (`idonethAbilityTiming` / `idonethTargetBonus` wired in `src/ai/utility.ts`, like Skaven): Ritual of the
   Creeping Mist — the friendly unit in or nearest to combat with the strongest enemy melee unit, Cavalry first; Biovoltaic
   Blast — always when it charged, prefer a target with more models (the +1); Mind Flare — first combat phase where the general
   is in combat with an enemy unit that has not fought yet; Ethersea Predators — the most damaged qualifying Cavalry; Delicious
   Morsels — whenever a damaged Cavalry unit is within 3" of the general.
8. **Shipped AI wiring:** `idonethAbilityTiming` / `idonethTargetBonus` are called from `abilityTiming` / `abilityTargetBonus` in `src/ai/utility.ts`, and `idonethMoveThenCharge(state, unitId, moveType)` (true for a Run in round 2 and a Retreat in round 4) lets the move scorer count a charge after those moves. The Retreat score itself is not changed: unlike Fast as Frazzlegit, an Ebb Tide Retreat still costs its mortal damage.
9. **Defaults for the sim:** regiment Way of the Cresting Wave and enhancement Steelshell Armour (both passive, data-only);
   variant games Ethersea Predators and Mind Flare.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| IDK-ARMY-1 | Soulraid Hunt builds: Soulscryer general + 3 Morrsarr Guard + Allopex + 2×5 Thralls, 15 models, stats as §5. |
| IDK-ARMY-2 | Reinforcements only on the Allopex and both Thralls units; the Soulscryer and Morrsarr Guard are never offered. |
| IDK-BT-1 | Low Tide: −1 to hit for shooting attacks against any friendly unit in round 1 only; melee unaffected. |
| IDK-BT-2 | Flood Tide: in round 2 a unit that Ran may still shoot and charge; in round 1 it may not. |
| IDK-BT-3 | High Tide: every friendly unit has Strike-first in round 3 only. |
| IDK-BT-4 | Ebb Tide: in round 4 a unit that Retreated may still shoot and charge (and still took Retreat damage). |
| IDK-RA-1 | Way of the Cresting Wave: Thralls that charged this turn get +1 Rend on the Lanmari; not without a charge; no other unit. |
| IDK-RA-2 | Ethersea Predators: end of turn, heals D3 on a Cavalry unit that fought this turn; a Cavalry unit that did not fight is not offered; once per turn for the army. |
| IDK-ENH-1 | Arch-Ritualist: Ritual of the Creeping Mist succeeds on a rolled 2. |
| IDK-ENH-2 | Steelshell Armour: the general's save ignores Rend and positive modifiers; an unmodified 1 still fails. |
| IDK-ENH-3 | Mind Flare: the picked enemy unit in combat with the general hits only on unmodified 6s for the phase; once per battle. |
| IDK-ENH-4 | Delicious Morsels: heals 1 on each friendly Cavalry unit within 3" of the general; none beyond 3". |
| IDK-AB-1 | Ritual of the Creeping Mist: 3+ gives −1 to wound for attacks on a visible friendly unit wholly within 12" until your next turn; 1–2 nothing. |
| IDK-AB-2 | Biovoltaic Blast: only after a charge, target within 1"; one die per model, 4–5 = 1 mortal, 6+ = D3; +1 per die when the target has more models; once per battle. |
| IDK-AB-3 | Bloodthirsty Predators: Bite Attacks 4 within 6" of a damaged enemy unit or one that lost a model this turn; 3 otherwise. |
| IDK-AB-4 | Sweeping Blows: Lanmari Damage 2 against a Monster, 1 otherwise. |
| IDK-WEAP-1 | Harpoon gets +1 Rend vs Monster; Lanmari +1 Rend vs Infantry; Voltspear +1 Damage on the charge; Scryfish Shoal shoots in combat. |
| IDK-WEAP-2 | Companion weapons (Scryfish Shoal, Fangmora's Fangs, the Bite) ignore friendly buffs other than Bloodthirsty Predators. |
| IDK-ENG-1 | (C1) `lostModelThisTurn` is true after any slain model this turn and resets on the next turn. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own deep-sea livery): deep ocean teal and midnight blue cloth, pearl-white and pale sea-glass
armour plates with tarnished bronze trim, pale blue-grey aelf skin with long white or silver hair, glowing cyan bioluminescence
as the accent (eyes of the beasts, spear tips, fish). Shared motif: an original spiral-shell crest with three wave lines,
painted on shields and cloth. No GW logos, no copied enclave icons. All figures are **true MGSD** chibis (~2.5 heads tall, huge
head, stubby legs, big hands and feet); the eel and shark mounts are chunky toy-like SD sea beasts that "swim" on a solid coral
stand, every water or glow effect solid and opaque, never see-through.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `idk-isharann-soulscryer` | Isharann Soulscryer | 1 | 32 round | No | A true MGSD chibi hunched old sea-aelf seer, 2.5 heads tall with an enormous pale head, long thin white hair and a wise squint, stubby legs under a ragged teal scale-patterned robe, leaning on a tall crooked coral staff hung with a pearl lantern, with three solid little cyan-glowing fish circling on a curl of solid sculpted water. |
| `idk-morrsarr-guard` | Akhelian Morrsarr Guard | 1 (×3) | 60×35 oval | Yes (eel) | A true MGSD chibi armoured sea-aelf knight with a huge pearl-white crested helm, stubby legs, a small round shell shield and a long lance crackling with solid cyan sparks, riding a chunky toy-like SD fat eel with big glowing eyes, a stubby fin crest and a short curling tail, posed on a solid coral stand. |
| `idk-akhelian-allopex` | Akhelian Allopex | 1 | 90×52 oval | Yes (shark) | A chunky toy-like SD war-shark, round-bodied with a huge toothy grin, small blank white eyes and blade-like fins, wearing a bronze harness with a stubby harpoon launcher on its back, crewed by a tiny MGSD chibi sea-aelf rider with a hook-blade, on a solid coral stand. |
| `idk-namarti-thrall` | Namarti Thralls | 1 (×10) | 32 round | No | A true MGSD chibi eyeless sea-aelf warrior, 2.5 heads tall with a huge smooth pale head, no eyes and a calm small mouth, a teal shell-plate tunic, stubby legs and an oversized two-handed curved glaive with a crescent blade. |

Morrsarr Guard use one figure for all three models and Thralls one for all ten: the Spearhead gives no champion, standard or
musician rules, so no variants. Tide Guard figures (Appendix A) are listed there.

---

## 11. Implementation plan

Data: `src/data/factions/idoneth/` (faction.json, datasheets/{isharann-soulscryer, akhelian-morrsarr-guard, akhelian-allopex,
namarti-thralls}.json, weapons.json, abilities.json, enhancements.json, patrols/soulraid-hunt.json). Hooks:
`src/engine/factions/idoneth.ts` (`...idonethHooks` in `code-hooks.ts`). Tests: `tests/engine/idoneth.test.ts`,
`tests/data/idoneth.test.ts` (one test per IDK- id). C1 lands in `attack.ts` with a test in the engine-core test file of its
stage. Patrol regiment list Way of the Cresting Wave (default) then Ethersea Predators; enhancement list Steelshell Armour
(default), Arch-Ritualist, Mind Flare, Delicious Morsels. Figure mapping keys `<datasheet id>/<modelId>` (model ids
`soulscryer`, `morrsarr-guard`, `allopex`, `namarti-thrall`).

---

## Appendix A — Akhelian Tide Guard (separate PDF; out of scope)

Army id if ever built: `idoneth.army.akhelian-tide-guard`. Source: the 4-page PDF named in the header (listed 2025-07-16).
General: **Akhelian King**. Units: 3 Akhelian Morrsarr Guard, 3 Akhelian Ishlaen Guard, 10 Namarti Reavers (Reinforcements). 17
models.

**Battle trait.** `TG-BT-1` Royal Imperative — once per battle (army), any combat phase, only in battle round 3: pick one for
the rest of the round: *Into Them!* (friendly units have Strike-first) or *Strike Sure* (friendly melee weapons have Crit
(Mortal)).

**Regiment abilities.** `TG-RA-1` The Spear of Asphoren — once per turn (army), any charge phase: pick a friendly unit not in
combat; +1 to its charge rolls for the rest of the turn. `TG-RA-2` The Shield of Ulchiss — once per turn (army), your movement
phase: pick a friendly unit in combat; for the rest of the turn its Retreats inflict no mortal damage on it.

**Enhancements.** Dutiful Souls (once per battle, your hero phase: pick a friendly unit wholly within 12" of the general; return
1 slain model, or D3 if it is Infantry); Shimmering Amulet (passive: the general has Ward 5+); Voltaic Charge (passive: the
general's Akhelian Royal Weapons gain Charge (+1 Damage)); Soul Stealer (end of any turn: if the general is in combat, Heal (D3)
the general).

**Warscrolls.**

| Unit | Move | Health | Save | Control | Ward | Keywords | Base (mm) |
|---|---|---|---|---|---|---|---|
| Akhelian King (General) | 12" | 7 | 3+ | 2 | — | Hero, Cavalry, Fly | 60 (Wahapedia; shape not given) |
| Akhelian Morrsarr Guard | 14" | 4 | 4+ | 1 | — | Cavalry, Fly | 60×35 oval |
| Akhelian Ishlaen Guard | 14" | 4 | 4+ | 1 | — | Cavalry, Fly | 60×35 oval |
| Namarti Reavers | 7" | 1 | 5+ | 1 | — | Infantry, Reinforcements | 32 round |

| Weapon | Unit | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|---|
| Akhelian Royal Weapons | King | Melee | — | 5 | 3+ | 4+ | 1 | 2 | — |
| Deepmare's Fangs, Talons and Lashing Tails | King | Melee | — | 4 | 4+ | 3+ | 1 | 2 | Companion |
| Voltspear | Morrsarr | Melee | — | 2 | 3+ | 4+ | 1 | 1 | Charge (+1 Damage) |
| Fangmora's Fangs and Lashing Tail | Morrsarr, Ishlaen | Melee | — | 3 | 4+ | 3+ | 1 | D3 | Companion |
| Helsabre | Ishlaen | Melee | — | 3 | 3+ | 4+ | 1 | 1 | — |
| Whisperbow | Reavers | Ranged | 12" | 2 | 3+ | 4+ | 1 | 1 | — |
| Keening Blade | Reavers | Melee | — | 1 | 3+ | 4+ | — | 1 | — |

**Abilities.** Raiders' Resolve (King, your hero phase: pick another friendly unit wholly within the King's combat range, roll
a D6; 3+ = +1 to its save rolls until the start of your next turn). Wave Rider (King, any charge phase: if it charged this
phase, pick an enemy within 1" and roll a D3; on 2+ that many mortal damage). Biovoltaic Blast, **Tide Guard version**
(Morrsarr, once per battle, any charge phase: after a charge, an enemy within 1"; one D6 per model, +1 per die if the target has
more models; each 3+ = 1 mortal damage — differs from §5.2). Biovoltaic Barrier (Ishlaen, once per battle, any combat phase:
pick an enemy unit in combat with it, roll a D6; 3+ = −1 to the Attacks of that unit's weapons for the rest of the turn).
Strike on the Move (Reavers, passive: may shoot after Running or Retreating that turn).

**Figures (if built).** `idk-akhelian-king` (1, 60: MGSD chibi sea-aelf king with a tall finned crown-helm and a long
glaive, on a chunky toy-like SD sea-horse-dragon mount with a curling tail); `idk-ishlaen-guard` (1 ×3, 60×35 oval: the
Morrsarr eel rider with a curved sabre and a big round glowing shield instead of the lance); `idk-namarti-reaver` (1 ×10, 32
round: MGSD chibi eyeless sea-aelf archer with a light curved bow and a short blade on the hip). Morrsarr Guard reuse
`idk-morrsarr-guard`.
