# Helsmiths of Hashut — Helforge Host (Spearhead)

Faction id: `helsmiths` · Army id: `helsmiths.army.helforge-host` · Grand alliance: Chaos.
Source: `docs/sources/spearhead-helsmiths-of-hashut.pdf` (4 pages, 12.4 MB, gitignored), "Spearhead: Helsmiths of Hashut -
Helforge Host", the free Warhammer Community download (Age of Sigmar, Spearhead category). First listed 2025-09-24, last
updated 2026-04-01 (PDF metadata: created and modified 2026-03-12). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_01-04_aos_spearhead_helsmiths_of_hashut_helforge_host-f9jrp14new-ugnb0veptj.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, body
`{"index":"downloads_v2","searchTerm":"hashut"}`). Stat blocks and ability timings were checked against the rendered pages
(the text layer prints the timing bars apart from their boxes).
Base sizes are not printed in the PDF. They come from the Wahapedia aos4 warscroll pages
(`wahapedia.ru/aos4/factions/helsmiths-of-hashut/War-Despot`, `/Dominator-Engine-with-Immolation-Cannons`, `/Tormentor-Bombard`,
`/Infernal-Cohort-with-Hashutite-Spears`), fetched the same day with plain curl. Wahapedia shows the matched-play warscrolls,
which differ from the Spearhead ones (for example matched-play spears add Anti-Cavalry and the gong works with Rally). Only the
base sizes are taken from it. All rules come from the Spearhead PDF.

**Which army.** The PDF holds a single Spearhead army, **Helforge Host**: War Despot, Dominator Engine with Immolation
Cannons, Tormentor Bombard, and 2×5 Infernal Cohort with Hashutite Spears (one unit with a Gong Carrier). That is the
army of the current **Spearhead: Helsmiths of Hashut** box, so it is the army this spec builds. No appendix is needed. The
same downloads search also lists Warcry warband rules, a Regiments of Renown sheet and two "Scourge of" campaign
supplements for Helsmiths. None of them is Spearhead and all are out of scope.

Mechanics and numbers are ported 1:1. All wording below is our own.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of
an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run =
`advance`, Retreat = `fallBack`. Rend is stored as `rend` (data) / `AP`. "Ward (N+)" maps to the engine's `feelNoPain: N`
(CORE-13.2: only the best ward counts). "DPP" = daemonic power points (HOH-BT-1). Rule IDs `HOH-*` double as test IDs (§9).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `helsmiths.unit.war-despot` | War Despot | 1 | **General** | no | 32 round (Wahapedia) |
| `helsmiths.unit.dominator-engine` | Dominator Engine with Immolation Cannons | 1 | Unit | **yes** | 80 round (Wahapedia) |
| `helsmiths.unit.tormentor-bombard` | Tormentor Bombard | 1 | Unit | no | 100 round (Wahapedia) |
| `helsmiths.unit.infernal-cohort` (a) | Infernal Cohort with Hashutite Spears, **with Gong Carrier** token | 5 | Unit | **yes** | 28.5 round (Wahapedia); token [interp] 28.5 round |
| `helsmiths.unit.infernal-cohort` (b) | Infernal Cohort with Hashutite Spears | 5 | Unit | **yes** | 28.5 round |

Total: 5 units, 13 models plus 1 token. Both Cohort units share one warscroll and one datasheet (two patrol entries, `ref`
`infernal-cohort-gong` / `infernal-cohort`). The Gong Carrier is a token (SPH-2.7), not a model: patrol data
`tokens: { 'gong-carrier': 1 }` on entry (a) only. A token has no profile, cannot be targeted, does not contest and does not
block; it only matters for Strike the Gongs (HOH-AB-5). Wahapedia gives no token base; the figure uses the Cohort base size.
No Wizard, no Priest, nothing has **Fly**. The War Despot is the only Hero. The Dominator Engine and both Cohorts carry the
Reinforcements icon; the War Despot and the Tormentor Bombard do not.

---

## 2. Battle trait

### HOH-BT-1 `helsmiths.ability.harness-daemonic-power` — Harness Daemonic Power
- **Timing:** Once per turn (army), your hero phase. It **must** be used, and at the **start** of each of your hero phases
  (before any other ability of that phase).
- **Effect:** (1) Take every daemonic power point off every friendly unit. (2) You gain DPP equal to the **current battle round
  number + 1** (round 1: 2, round 2: 3, round 3: 4, round 4: 5). (3) Hand them out to friendly units, **at most 3 per unit**.
  (4) Any you did not hand out are lost.
- DPP stay on a unit until step (1) of your next hero phase, so they work through the opponent's turn too.
- [interp] Points go to friendly units on the battlefield (there is no reserve in this army). A replacement unit from Call for
  Reinforcements starts with 0 DPP. A unit may receive 0 points; the player may stop handing out early.
- The PDF's designer note suggests coloured dice on the table; the engine keeps the count as a unit token (`daemonic-power`),
  so the unit card shows it.

DPP are read by four warscroll abilities: Black-Hearted Conqueror (HOH-AB-1, which can also lend a unit 1 point),
Daemonic Strength (HOH-AB-2), Ruinous Bombardment (HOH-AB-4) and Daemonic Resilience (HOH-AB-6). Everywhere below,
"the unit's DPP" means its **effective** DPP: its token count, or 1 if it has 0 tokens and Black-Hearted Conqueror covers it.

---

## 3. Regiment abilities (pick 1 at army selection)

### HOH-RA-1 `helsmiths.ability.grinding-advance` — Grinding Advance
- **Timing:** Once per battle, deployment phase (CORE-4.5: after both armies are set up, the player who began deployment uses
  their other deployment-phase abilities first, then the opponent).
- **Declare:** Pick **up to 2** friendly **Infernal Cohort** units.
- **Effect:** Each picked unit may immediately move **up to 3"**. Those units **cannot use Charge abilities in battle round 1**.
- RULING: the move follows Normal Move limits (no passing through or ending within an enemy combat range); armies are at least
  9" apart after deployment, so this only matters on odd maps. The units stay free to Move and Run in round 1; only charging is
  barred.

### HOH-RA-2 `helsmiths.ability.suppressive-bombardment` — Suppressive Bombardment
- **Timing:** Once per turn, your shooting phase.
- **Declare:** Pick an enemy **Infantry** unit that had **any damage points allocated** to it this turn by **shooting attacks of a
  friendly Tormentor Bombard**.
- **Effect:** Until the start of your next turn, that unit rolls **1 fewer die** for its charge rolls, to a minimum of 1 die.
- Notes: "damage allocated" is after wards (a fully warded volley does not qualify). Stacks with the twist/tactic "one fewer
  die" effects, still with a floor of 1 die.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `helsmiths.enh.scroll-of-petrification` | Scroll of Petrification | **Once per battle**, any hero phase (yours or the enemy's) | For the rest of the turn the general has **Ward (2+)**, but it **cannot use abilities** and **cannot be picked as the target of friendly abilities**. |
| `helsmiths.enh.chalice-of-darkness` | Chalice of Darkness | **Once per battle**, your shooting phase | Declare: pick a **visible enemy unit within 12"** of the general. Effect: that unit suffers **D3 mortal damage**. |
| `helsmiths.enh.talisman-of-obsidian` | Talisman of Obsidian | Passive | **Ignore the first damage point** allocated to the general **in each phase**. |
| `helsmiths.enh.amulet-of-burning-hate` | Amulet of Burning Hate | **Once per battle**, any combat phase | For the rest of the turn, the general's attacks score **critical hits on unmodified hit rolls of 5+**. |

RULING (Scroll of Petrification): "cannot use abilities" covers every non-passive ability, Core ones included: the general
cannot Normal Move, Run, Retreat, Charge, Shoot or Fight for the rest of that turn, cannot use its enhancement or warscroll
activations, and no friendly ability or battle tactic command may pick it. Its **passive** abilities (Black-Hearted
Conqueror, the Ward itself) keep working, since a passive ability is never "used" (CORE-3.1). Enemy abilities may still pick
it. Used in the enemy hero phase, it lasts through that enemy turn (no Fight in that combat phase).

RULING (Chalice of Darkness): no Spell keyword and no roll; it simply happens.

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. **No warscroll in this army prints a Ward.** Printed keywords only
(Spearhead warscrolls print no faction keywords). Warscroll stat blocks were checked against the rendered pages.

### 5.1 `helsmiths.unit.war-despot` — War Despot (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 6 | 3+ | 2 | — |

Keywords: **Hero, Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Daemonflame Glaive (`helsmiths.weapon.daemonflame-glaive`) | Melee | — | 5 | 3+ | 3+ | 1 | 2 | Crit (Mortal) |

**HOH-AB-1 `helsmiths.ability.black-hearted-conqueror` — Black-Hearted Conqueror**
- **Timing:** Passive.
- **Effect:** While the War Despot has **at least 1 DPP of its own** (tokens), every other friendly unit that has **0 DPP** counts
  as having **1 DPP** while it is **wholly within 6"** of the Despot **and visible** to it. The range grows by **3" per DPP** the
  Despot has: 1 → 9", 2 → 12", 3 → 15".
- Notes: it never raises a unit above 1 and never stacks with real tokens (a unit with 1+ tokens uses its tokens). It is
  re-checked whenever a DPP value is read (moves change it). If the Despot is slain or has 0 tokens, it gives nothing.

### 5.2 `helsmiths.unit.dominator-engine` — Dominator Engine with Immolation Cannons
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 10 | 2+ | 2 | — |

Keywords: **War Machine, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Immolation Cannons (`helsmiths.weapon.immolation-cannons`) | Ranged | 8" | 5 | 2+ | 4+ | 1 | D3 | Shoot in Combat |
| Horns and Pummelling Strikes (`helsmiths.weapon.horns-and-pummelling-strikes`) | Melee | — | 3 | 4+ | 3+ | 1 | D3 | — |

**HOH-AB-2 `helsmiths.ability.daemonic-strength` — Daemonic Strength**
- **Timing:** Passive.
- **Effect:** For **each** DPP this unit has (0–3): **+1"** to its Move characteristic and **+1 Attacks** on **each** of its
  weapons (both the Immolation Cannons and the Horns). At 3 DPP: Move 9", Cannons 8 attacks, Horns 6 attacks.
- Notes: a Move characteristic bonus also lengthens Run (Move + D6) and every "up to its Move" move; it does not change charge
  rolls.

### 5.3 `helsmiths.unit.tormentor-bombard` — Tormentor Bombard
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 8 | 3+ | 2 | — |

Keywords: **War Machine**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Torrent of Ruinous Energy (`helsmiths.weapon.torrent-of-ruinous-energy`) | Ranged | 30" | 4 | 3+ | 3+ | 1 | D3 | Anti-Cavalry (+1 Rend), Anti-Infantry (+1 Rend) |
| Artillerist Weapons (`helsmiths.weapon.artillerist-weapons`) | Melee | — | 3 | 4+ | 4+ | — | 1 | — |

No Shoot in Combat. A unit with both Cavalry and Infantry would take +2 Rend (CORE-12.2, cumulative).

**HOH-AB-3 `helsmiths.ability.calculated-trajectory` — Calculated Trajectory**
- **Timing:** Passive.
- **Effect:** **+1 to hit** for this unit's **shooting** attacks against an enemy unit that has **5 or more models** and is **more
  than 12"** from this unit.
- Notes: model count = models currently on the battlefield when the attacks are made. Distance = closest-model gap (the
  Bombard is one model). The usual hit-roll modifier cap (+1) applies.

**HOH-AB-4 `helsmiths.ability.ruinous-bombardment` — Ruinous Bombardment**
- **Timing:** Once per turn (army), your shooting phase.
- **Declare:** Only if this unit **used a Shoot ability this turn** and **every one of its attacks targeted the same enemy unit**;
  that unit is the first target. Then you may pick **as many other enemy units within 6" of that target as this unit has DPP**
  (0–3) as extra targets.
- **Effect:** Roll a D6 per target. On **3+**, that unit's **control score is reduced by 3** for the rest of the turn.
- Notes: the control score floor of 1 per contesting unit (CORE-17.4) still applies. The main point is the end-of-turn control
  check of your own turn. With 0 DPP there is exactly one target. [interp] When there are no more candidates than DPP, the
  engine takes them all (each pick only hurts the enemy).

### 5.4 `helsmiths.unit.infernal-cohort` — Infernal Cohort with Hashutite Spears (×2 units)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 1 | 3+ | 1 | — |

Keywords: **Infantry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Hashutite Spear (`helsmiths.weapon.hashutite-spear`) | Melee | — | 2 | 3+ | 4+ | — | 1 | Anti-charge (+1 Rend) |

Loadout: all 5 models carry a Hashutite Spear. No champion, standard or musician rules.

**HOH-AB-5 `helsmiths.ability.strike-the-gongs` — Strike the Gongs**
- **Timing:** Once per battle (per unit), any hero phase.
- **Effect:** This unit's Gong Carrier (if it has one) is a token. You may **remove the Gong Carrier** from the battlefield and
  **return D3 slain models** to this unit.
- Notes: only the unit set up with the token can use it (the other Cohort has no token, so it is never offered). [interp] It is
  offered only while the token is on the table and the unit has at least one slain model. Returned models are placed by
  CORE-6.14 (coherent, out of enemy combat range), never above 5.
- RULING: a replacement Cohort from Call for Reinforcements has no Gong Carrier (the token left with the destroyed unit).

**HOH-AB-6 `helsmiths.ability.daemonic-resilience` — Daemonic Resilience**
- **Timing:** Passive.
- **Effect** by this unit's DPP:

| DPP | Effect |
|---|---|
| 0 | nothing |
| 1 | Ward (6+) |
| 2 | Ward (5+) |
| 3 | Ward (5+) **and** ignore the first damage point allocated to this unit in each phase |

---

## 6. Spells and prayers

None. The army has no Wizard and no Priest, so it never casts and never unbinds. Chalice of Darkness is not a spell.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/helsmiths/*.json`), at most reusing an existing code hook; (b) = new
faction code hook in `src/engine/factions/helsmiths.ts`, exported as `helsmithsHooks` and spread into `code-hooks.ts` like
`skavenHooks`. Shared helpers from `aos-common.ts`: `onBoard`, `whollyWithinUnit`, `unitGap`, `inCombat`, `inflictMortal`,
`announce`, `paramOf`, `returnSlainModels`, `returnableModels`, `removeTokens`, `isDatasheet`, `hasKeyword`, `liveModels`.
(c) = engine change outside the faction file (listed after the table).

Shared faction helper: `dppOf(state, unitId)` = `unit.tokens['daemonic-power'] ?? 0` (the raw count) and
`effectiveDpp(state, unitId)` = raw count if > 0, else 1 when some friendly War Despot (`isDatasheet(…, 'war-despot')`) on the
board has raw DPP n ≥ 1, `whollyWithinUnit(unit, despot, 6 + 3n)` and the unit is visible to the Despot
(`losService.unitVisible` from the Despot model), else 0. Every DPP-reading hook below calls `effectiveDpp`, except Black-Hearted
Conqueror's own range and gate, which read the Despot's raw count.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, base sizes | (a) | Datasheets as the other armies; `HERO`, `INFANTRY`, `WAR MACHINE`, `REINFORCEMENTS`. Bases `{ shape: 'round', mm }` (32 / 80 / 100 / 28.5). |
| Cohort ×2, Dominator Reinforcements | (a) | One Cohort datasheet, two patrol entries (`size: 5`). Core `spearheadCallForReinforcements` offers the Dominator and both Cohorts, never the Despot or the Bombard. |
| Gong Carrier token | (a) | Patrol entry (a) `tokens: { 'gong-carrier': 1 }` (`state.ts` copies to `unit.tokens`). |
| Weapons | (a) | Glaive `CRIT_MORTAL`; Immolation Cannons `SHOOT_IN_COMBAT`; Torrent `[{ ANTI, keyword 'CAVALRY', value 1 }, { ANTI, keyword 'INFANTRY', value 1 }]`; Hashutite Spear `{ ANTI, keyword '@charged', value 1 }` (attack.ts: +1 Rend per Anti that applies, cumulative). |
| HOH-BT-1 Harness Daemonic Power | (b) `helsmithsHarness` + (c) C2 | Battle trait, `trigger activated`, `timing phase command / your`, `limit oncePerTurnArmy`, `params { mandatory: true, max: 3 }`. Resolve: every friendly unit `tokens['daemonic-power'] = 0` (one `TokenRemoved` per unit that had any), pool `n = state.round + 1` kept in `mission.custom.hohPool[player]`, then raise the allocation loop (Nurgle's Embrace pattern, `chooseOption` topic `abilityChoice`, `data.code = 'helsmithsHarness'`, answered by the hook's `answer`): options = friendly units on the board with < 3 tokens, label "Harness Daemonic Power (k left): <unit> (has m)"; each pick adds 1 token and re-raises while points and eligible units remain; pass = stop, the rest are lost (announce). Each option carries `hint { value, unitId }` for the AI (§8). `resourceReadout` shows "Daemonic power n to allocate" only while the pool is non-zero (optional HUD nicety). |
| HOH-AB-1 Black-Hearted Conqueror | (b) `helsmithsConqueror` | Passive descriptor with no effect (a marker the helper looks for; the range and gate live in `effectiveDpp`). Nothing is granted, so units moving in and out of the aura need no `ensureEffects` bookkeeping. |
| HOH-AB-2 Daemonic Strength | (b) `helsmithsDaemonicStrength` | Passive on the Dominator; `statDelta(state, entry, q)`: holder = `q.unitId`, `n = effectiveDpp`; `q.stat === 'M'` → n; `q.stat === 'A'` with `q.weapon` set → n; else 0. |
| HOH-AB-6 Daemonic Resilience | (b) `helsmithsDaemonicResilience` | Passive on the Cohorts. `adjustFeelNoPain(state, entry, modelId, current)`: holder of the model, n = `effectiveDpp`; n = 1 → threshold 6, n ≥ 2 → 5, else null (best ward wins). `ignoresFirstDamagePerPhase(state, entry, unitId)`: true when `unitId` is the holder and `effectiveDpp` = 3 (which needs 3 real tokens). |
| HOH-AB-3 Calculated Trajectory | (a) + (b) `helsmithsCalculatedTrajectory` | Passive, scope self, `effect { when: { weaponType: 'ranged', not: { range: { within: 12 } } }, modifyRoll: { roll: 'hit', value: 1 } }`; hook `hook 'onHitRoll'` with `gate(state, holder, entry, data)`: `liveModels(state, data.attack.targetUnitId).length >= params.minModels (5)` (the Khorne Scent of Blood gate pattern). |
| HOH-AB-4 Ruinous Bombardment | (b) `helsmithsRuinousBombardment` | Activated, `timing phase shooting / your`, `limit oncePerTurnArmy`, `params { range: 6, succeedOn: 3, control: -3 }`. Target record: the same hook's `afterAttackSequence(ctx, entry, info)` (called for the Bombard's own source entry) runs when `info.attackerUnitId === holder && !info.combat`, reads `readDeclaredAttack(state).targetUnitIds` (set by shooting.ts before the dice) and stores `mission.custom.hohShots[holder] = { key: 'round:activePlayer', targets }` (merging repeated sequences of the same turn). `canUse`: a fresh record whose target set has exactly one unit still on the board. Resolve: candidates = other enemy units on the board within 6" (`unitGap`) of the first target; k = `effectiveDpp(bombard)`; if candidates ≤ k take all, else raise k `abilityChoice` picks (pass = stop). One D6 per target; 3+ → grant an empty marker effect (scope self, `untilEndOfTurn`) and ledger `mission.custom.hohControl[effectId] = -3`; `produce` at `onObjectiveControl` returns `{ kind: 'stat', delta: -3 }` for a unit holding a live marker (Skaven Will of the Horned Rat ledger, sign flipped). `unitControlScore` keeps the min-1 floor. |
| HOH-AB-5 Strike the Gongs | (b) `helsmithsStrikeTheGongs` | Activated, `timing phase command / any`, `limit oncePerBattle`, `params { token: 'gong-carrier', returnModels: 'D3' }`, no declare (the unit itself). `canUse` = `unit.tokens['gong-carrier'] > 0 && returnableModels(state, self) > 0`. Resolve: `removeTokens(ctx, self, 'gong-carrier')`, `n = rollExpr('D3')`, `returnSlainModels(ctx, self, n, abilityId)`, announce. The Seething Swarm body plus a token. |
| HOH-RA-1 Grinding Advance | (b) `helsmithsGrindingAdvance` + (c) C1 | Regiment ability, `timing { kind: 'deployment', whose: 'your' }`, `limit oncePerBattle`, `params { distance: 3, maxTargets: 2 }`. Declare up to 2 Cohorts: the hook offers modes "both Cohorts" / "first only" / "second only" (`modesFor`, only units with a legal slide). Resolve: grant each picked unit `{ forbid: 'charge', when: { round: { lte: 1 } } }` (scope self, duration `battle`), then `writeMoveQueue(s, { abilityId, player, maxDistance: 3, queue, opts: { normalMove: true } })` (the Clawsteps slide queue). |
| HOH-RA-2 Suppressive Bombardment | (b) `helsmithsSuppressiveBombardment` + (c) C3 | Regiment ability, `timing phase shooting / your`, `limit oncePerTurn`, `declare [{ role: 'unit', owner: 'enemy' }]`. `targets` = enemy units with `INFANTRY` in `damagedByShootingThisPhase(state, b)` for any friendly Bombard `b` (the ability is your shooting phase only, and the Bombard only shoots in it, so "this phase" = "this turn"). Resolve: `effectService.grant(ctx, target, { extraChargeDice: -1 }, { …, scope: { who: 'self' }, duration: 'untilNextTurn', expiryOwner: player })`. `chargeDiceCount` already sums dice and floors at 1. |
| ENH Talisman of Obsidian | (b) `helsmithsTalisman` | Passive enhancement, scope bearer; `ignoresFirstDamagePerPhase(state, entry, unitId)` = `unitId === entry.holderUnitId`. |
| ENH Chalice of Darkness | (b) `helsmithsChalice` | Enhancement, `timing phase shooting / your`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params { range: 12, damage: 'D3' }`. Targets = enemy units on the board within 12" of the general and visible from it (Wither's target code without the casting roll). Resolve: `inflictMortal(ctx, use, target, rollExpr('D3'))`. |
| ENH Amulet of Burning Hate | (b) `helsmithsAmulet` | Enhancement, `timing phase fight / any`, `limit oncePerBattle`, no declare. Resolve: `effectService.grant(ctx, general, { lethalOn: 5 }, { scope: { who: 'self' }, duration: 'untilEndOfTurn' })` (`lethalOn` → `critThreshold`, attack.ts). Offered in the start-of-combat window and between fight activations. |
| ENH Scroll of Petrification | (b) `helsmithsScroll` + (c) C4 | Enhancement, `timing phase command / any`, `limit oncePerBattle`. Resolve: grant the general `[{ feelNoPain: 2 }, { noAbilities: true }]`, scope self, `untilEndOfTurn`. Without C4 only the Ward half works (do not ship it that way; see §8.6). |

**Engine changes (c):**
- **C1 deployment-phase ability window** (`reducer.ts`): CORE-4.5 step 3 is not run today (Lumineth's Storm Brewing moved itself
  to the round-1 start for that reason). In the `s.phase === 'deployment'` branch, before `startRoundChain`, call
  `abilityWindows(ctx, modules, 'deployment', [firstDeployer, other], 'deploy:abilities')`, where `firstDeployer` is the player
  who began deployment (the attacker in Spearhead, SPH-7.1). `AbilityWindow 'deployment'`, its display id `deployment.unit`
  and `timingMatches` for `kind 'deployment'` already exist. The window must drain a `MoveQueue` (it does: `runWindow` runs
  `nextStep` first in every window). The Grinding Advance slide then happens before the first-turn choice, as on the table.
  Fallback if C1 is refused: Lumineth's approach (`timing startOfRound`, round 1, `oncePerBattle`), approximation: the move
  comes after the attacker has picked who goes first.
- **C2 mandatory abilities first** (`abilities.ts runWindow`): when any usable candidate has `params.mandatory`, the
  `abilityUse` offer lists **only** the mandatory candidates (still `canPass: false`); the others come back once it is used.
  This makes Harness happen at the start of the hero phase, before Strike the Gongs or the Scroll. Only other user today:
  Seraphon's Blessed by the Old Ones, whose offer is unchanged (it is the only ability in its window).
- **C3 expiry owner** (`effects.ts`): `EffectGrant + expiryOwner?: PlayerId`; `grant` passes `grant.expiryOwner ?? unit.player`
  to `expiryFor`. Today `untilNextTurn` on an **enemy** unit expires at the start of the **enemy's** next turn, i.e. right after
  your turn, before its charge phase, which would make Suppressive Bombardment do nothing. Additive; no existing caller changes.
- **C4 `Effect.noAbilities`** (`src/data/types.ts` + `common.schema.json`, `hooks.ts EFFECT_HOOKS + noAbilities: []` read
  directly, `hooks-impl.ts unitHasEffectFlag` flag union + `'noAbilities'`): while active on a unit, (1) `abilities.ts
  usableFor` drops every candidate whose `unitId` is that unit; (2) `abilities.ts` drops the unit from every **friendly**
  target list (`hook.targets` results and declared friendly targets) and `cards.ts` drops it from battle tactic command
  targets; (3) the Core abilities skip it: `phases/movement.ts` (no Normal Move / Run / Retreat), `phases/shooting.ts` (not
  selectable to shoot), `phases/charge.ts` (not eligible), `phases/fight.ts` (not pickable to fight; it can still be attacked).
  Passive descriptors and enemy targeting are untouched.

None of C1–C4 changes `types.ts`, `actions.ts`, `events.ts`, `rng.ts`, `decider.ts` or `index.ts`; C4 adds one key to the
frozen `hooks.ts` `EFFECT_HOOKS` (additive, the `noRetreatDamage` precedent) and to `src/data/types.ts`, so it needs a note in
`docs/spec/13-engine-port-plan.md`.

---

## 8. Engine notes

1. **DPP storage:** `unit.tokens['daemonic-power']` (0–3). Tokens survive the enemy turn and are cleared only by Harness.
   `spawnDestroyedUnitCopy` already starts a replacement with no tokens, which is right for both DPP and the Gong Carrier.
2. **Effective DPP is computed, never stored.** Black-Hearted Conqueror's "counts as 1" changes as units move, so every
   reader calls `effectiveDpp` at the moment it needs the number (ward roll, stat query, Ruinous Bombardment resolve).
   `statFor` for the Dominator therefore depends on the Despot's position; the AI's move search sees it through `statFor`.
3. **Harness timing:** with C2 the hero window offers Harness alone first; it cannot be passed. In the enemy hero phase it is
   not offered (your hero phase only). A double turn gives a second Harness in the next round as normal.
4. **Ruinous Bombardment record:** the Bombard has one model and one ranged weapon, but the engine lets a model split a
   weapon's attacks; the record keeps the union of targets across the turn, and more than one unit means "not all the same
   target". A record from another turn is stale (key `round:activePlayer`).
5. **Suppressive Bombardment and Covering Fire:** Spearhead has no Covering Fire, so the Bombard only shoots in your shooting
   phase; `damagedByShootingThisPhase` is exact.
6. **Scroll of Petrification without C4** would leave the 2+ Ward with no cost, a large buff. The patrol must list exactly 4
   enhancements (validate-data), so C4 is a prerequisite of the army stage rather than a later fix; never make the Scroll the
   default.
7. **AI:**
   - Harness allocation (hint values): 1 point on the Despot first when at least one other friendly unit would sit wholly within
     9" of it (it lends everyone nearby a point); then the Dominator up to 3 if it is in combat or within 6 + Move + 6" of an
     enemy; then the Cohort in combat or nearest an enemy up to 2 (Ward 5+), then the third point to it (first damage ignored);
     then the Bombard (extra Ruinous targets) only when 2+ enemy units stand within 6" of each other in its range; leftovers to
     the Despot (longer aura).
   - Grinding Advance: both Cohorts straight toward the nearest objective. Suppressive Bombardment: the damaged enemy
     Infantry unit nearest any friendly unit. Ruinous Bombardment: always when legal; extra targets = enemy units contesting
     objectives first.
   - Strike the Gongs: when the gong Cohort has lost 2+ models, or before the last hero phase of the battle if it lost any.
   - Scroll: in the enemy hero phase when the general is within 12" of enemy units able to charge or shoot it and its Health
     left ≤ 3, never in your own turn (it would bar your moves and fights). Chalice: the enemy unit with the fewest wounds left
     within 12" (a kill), else the enemy Hero. Amulet: the first combat phase where the general is in combat.
8. **Ward sources:** Daemonic Resilience (Cohorts, 6+/5+), Scroll of Petrification (general, 2+, one turn). Nothing else.
9. **Defaults for the sim:** regiment Suppressive Bombardment (needs C3), enhancement Talisman of Obsidian (passive, no engine
   change). Variant games: Grinding Advance (needs C1) and Amulet of Burning Hate.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| HOH-ARMY-1 | Helforge Host builds: War Despot general + Dominator Engine + Tormentor Bombard + 2×5 Infernal Cohort, 13 models, stats and bases as §5. |
| HOH-ARMY-2 | Reinforcements: the Dominator and both Cohorts can be replaced; the Despot and the Bombard never are. |
| HOH-ARMY-3 | Exactly one Cohort starts with one `gong-carrier` token; the other has none. |
| HOH-BT-1 | Harness: offered first and alone at the start of your hero phase, cannot be passed, not offered in the enemy hero phase; it clears every friendly unit's DPP. |
| HOH-BT-2 | Harness grants round + 1 points (2/3/4/5); at most 3 per unit; stopping early loses the rest. |
| HOH-BT-3 | DPP stay through the enemy turn and are cleared only at your next hero phase. |
| HOH-RA-1 | Grinding Advance: offered once in the deployment window after both armies are set up; up to 2 Cohorts slide ≤ 3" without entering enemy combat range. |
| HOH-RA-2 | Grinding Advance: the moved Cohorts cannot charge in round 1 and can in round 2; unmoved units are unaffected. |
| HOH-RA-3 | Suppressive Bombardment: only enemy Infantry with damage allocated by the Bombard's shooting this turn can be picked; once per turn. |
| HOH-RA-4 | Suppressive Bombardment: the target rolls 1 fewer charge die (never below 1) through the enemy's next turn; gone at the start of your next turn. |
| HOH-ENH-1 | Scroll of Petrification: Ward 2+ for the rest of the turn; the general cannot move, shoot, charge, fight or use abilities, and friendly abilities and commands cannot pick it; once per battle. |
| HOH-ENH-2 | Chalice of Darkness: D3 mortal damage to a visible enemy within 12" of the general; your shooting phase only; once per battle. |
| HOH-ENH-3 | Talisman of Obsidian: the first damage point allocated to the general in each phase is ignored; the second is not. |
| HOH-ENH-4 | Amulet of Burning Hate: the general's unmodified 5s and 6s to hit are critical (Crit (Mortal) on the Glaive) until end of turn; once per battle. |
| HOH-AB-1 | Black-Hearted Conqueror: a 0-DPP friendly unit wholly within 6" + 3"/DPP of a Despot with DPP and visible to it counts as 1; nothing when the Despot has 0; never adds to real tokens. |
| HOH-AB-2 | Daemonic Strength: +1" Move and +1 Attacks on each weapon per DPP (3 DPP: Move 9", Cannons 8, Horns 6). |
| HOH-AB-3 | Calculated Trajectory: +1 to hit only against a target with 5+ models more than 12" away; no bonus at 12" or against 4 models. |
| HOH-AB-4 | Ruinous Bombardment: needs a Shoot this turn at one single unit; extra targets = DPP among enemies within 6" of it; 3+ gives −3 control score until end of turn (floor 1). |
| HOH-AB-5 | Strike the Gongs: removes the token and returns up to D3 slain models; not offered without the token or with no slain models; once per battle. |
| HOH-AB-6 | Daemonic Resilience: 1 DPP Ward 6+, 2 DPP Ward 5+, 3 DPP Ward 5+ and the first damage point each phase ignored. |
| HOH-WEAP-1 | Daemonflame Glaive critical hits deal mortal damage; Dominator and Bombard weapons deal D3. |
| HOH-WEAP-2 | Immolation Cannons can shoot while the Dominator is in combat; the Torrent cannot. |
| HOH-WEAP-3 | Torrent of Ruinous Energy gets +1 Rend against Infantry and +1 against Cavalry. |
| HOH-WEAP-4 | Hashutite Spear gets +1 Rend against a unit that charged this turn. |
| HOH-AI-1 | The AI's Harness allocation follows §8.7 (Despot point first when it covers a unit, then the Dominator). |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own furnace-lord livery): tarnished bronze and dark brass armour, soot-black iron, deep
crimson and oxblood cloth, polished obsidian-black stone, gold trim, and **solid glowing green daemonfire** as the accent
colour (flames, eyes and weapon edges, opaque, never see-through). Duardin faces have curled jet-black beards and short
boar-like tusks. Shared motif: an original flame-in-an-anvil glyph stamped on plates and shields. No GW logos and no copies
of the Helsmiths bull-head sigil or any other GW icon; bull horns appear only as general shapes. All figures are **true
MGSD** chibis (~2.5 heads tall, huge head, stubby legs, big hands and feet); the engines are chunky toy-like SD machines.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `hoh-war-despot` | War Despot | 1 | 32 round | No | A true MGSD chibi duardin warlord, 2.5 heads tall with an enormous head under a tall flared bronze helm with two short curved black horns, a huge curled jet-black beard with gold rings, little tusks and glowing green eyes, stubby legs in layered bronze-and-black plate with a crimson tabard, gripping an oversized glaive whose cleaver blade burns with solid green flame. |
| `hoh-dominator-engine` | Dominator Engine with Immolation Cannons | 1 | 80 round | War machine (walker) | A chunky toy-like SD daemon engine: a round, squat black-iron and bronze walker shaped like a stubby horned bull, a big grinning furnace face with solid green fire in its mouth and eyes, short piston legs, and both arms replaced by fat flared bronze cannons belching solid green flame, two little chimneys puffing solid dark smoke balls. |
| `hoh-tormentor-bombard` | Tormentor Bombard | 1 | 100 round | War machine | A chunky toy-like SD siege engine: a fat bronze mortar on a squat iron carriage with stubby clawed legs, a caged crackling solid green-and-purple energy orb in a rune-plated furnace at its breech, plus two tiny MGSD chibi duardin crew in crimson aprons, one holding a long ramrod and one a giant wrench. |
| `hoh-infernal-cohort` | Infernal Cohort with Hashutite Spears | 1 (×10) | 28.5 round | No | A true MGSD chibi duardin spear warrior, 2.5 heads tall with a huge head in a tall conical bronze helmet with a face guard, a curled black beard and tusks peeking out, stubby legs in black scale armour with a crimson skirt, a tall bronze-rimmed shield bearing the flame-in-anvil glyph and a long black-iron spear whose tip glows solid green. |
| `hoh-gong-carrier` | Gong Carrier (token) | 1 | 28.5 round [interp] | No | A true MGSD chibi hobgoblin porter, 2.5 heads tall with a huge grey-green head, big floppy ears and a nervous toothy grin, stubby legs bowed under a wooden back-frame holding a big round bronze gong engraved with the flame-in-anvil glyph, a padded mallet in one hand. |

The Cohort uses one figure for all 10 models: the Spearhead gives no champion, standard or musician rules. The Gong Carrier
token gets its own figure because Strike the Gongs depends on it being on the table and players must see whether it is
still there. No variants elsewhere: each other unit is a single model.

---

## 11. Implementation notes

Not built yet. Planned layout, matching the other armies: data in `src/data/factions/helsmiths/` (faction.json,
datasheets/{war-despot, dominator-engine, tormentor-bombard, infernal-cohort}.json, weapons.json, abilities.json,
enhancements.json, patrols/helforge-host.json); hooks in `src/engine/factions/helsmiths.ts` (`...helsmithsHooks` in
`code-hooks.ts`; AI hints next to the others in `src/ai/utility.ts` if the generic utility does not cover them); tests
`tests/engine/helsmiths.test.ts` and `tests/data/helsmiths.test.ts`, one test per HOH- id (§9). Patrol
`battleTraits: ['helsmiths.ability.harness-daemonic-power']`; regiment list Suppressive Bombardment (default) then Grinding
Advance; enhancement list Talisman of Obsidian (default), Amulet of Burning Hate, Chalice of Darkness, Scroll of
Petrification (C4 must land first, §8.6). Engine changes C1–C4 (§7) go in the engine-core stage before the army
stage, with tests `tests/engine/engine-f18.test.ts` (or the next free F number) named `F18-HOH-…`.
