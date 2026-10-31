# Sylvaneth — Spitewing Flight (Spearhead)

Faction id: `sylvaneth` · Army id: `sylvaneth.army.spitewing-flight` · Grand alliance: Order.
Source: `docs/sources/spearhead-sylvaneth.pdf` (4 pages, 6.4 MB, gitignored), "Spearhead: Sylvaneth - Spitewing Flight", the
free Warhammer Community download (Age of Sigmar, Spearhead category). Listed 2026-03-25 and flagged new (PDF metadata: created
and modified 2026-02-20). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_25-03_aos_spearhead_spitewing_flight_sylvaneth-rtiguzvyhx-f7di7yhcim.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, search term
"sylvaneth").

**Which army.** Warhammer Community lists **two separate** Sylvaneth Spearhead PDFs, both posted 2026-03-25:
**Spitewing Flight** (Arch-Revenant, Gossamid Archers, Spiterider Lancers, Revenant Seekers; flagged new, written 2026-02) and
*Bitterbark Copse* (Branchwych, Treelord, Kurnoth Hunters, Tree-Revenants: the older Vanguard-box line-up, PDF re-saved
2026-04-08, `eng_aos_spearhead_sylvaneth_bitterbark-copse-jqmpmca0ca-baul2djdaq.pdf`). As with Lumineth (*Glittering Phalanx*)
and Seraphon (*Starscale Warhost*), the older-kit line-up is treated as the superseded army and the new all-flying formation
as the current **Spearhead: Sylvaneth** box. RULING: this spec builds **Spitewing Flight**; Bitterbark Copse is recorded in full in
Appendix A so it can be added later without reopening its PDF (kept out of `docs/sources/`, re-download from the URL above).
The PDF prints no base sizes. Those come from the Wahapedia aos4 warscroll pages (`wahapedia.ru/aos4/factions/sylvaneth/
Arch-Revenant`, `/Gossamid-Archers`, `/Spiterider-Lancers`, `/Revenant-Seekers`), fetched the same day with plain curl.
Mechanics and numbers are ported 1:1. All wording below is our own. Rule IDs `SYL-*` double as test IDs (§9).

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of
an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run =
`advance`, Retreat = `fallBack`. Rend is stored as `AP` (negative = more Rend); a printed Rend "-" is 0. "Ward (N+)" maps to
the engine's `feelNoPain: N`.

Army-specific term: **quarry** — the one enemy unit the army has marked (SYL-BT-1). Each player has at most one quarry at a
time. **Chords** — a battle-long counter per player, raised each time that player's quarry is destroyed (SYL-BT-3).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `sylvaneth.unit.arch-revenant` | Arch-Revenant | 1 | **General** | no | 40 round (Wahapedia) |
| `sylvaneth.unit.gossamid-archers` | Gossamid Archers | 5 | Unit | no | 32 round (Wahapedia) |
| `sylvaneth.unit.spiterider-lancers` | Spiterider Lancers | 3 | Unit | no | 60 round (Wahapedia) |
| `sylvaneth.unit.revenant-seekers` | Revenant Seekers | 3 | Unit | no | 60 round (Wahapedia) |

Total: 4 units, 12 models. **No unit has the Reinforcements keyword**, so this army never uses Call for Reinforcements. Every
unit has **Fly**. No Wizard, no Priest. No warscroll prints a Ward and nothing in the army grants one.

---

## 2. Battle traits

### SYL-BT-1 `sylvaneth.ability.target-of-vengeance` — Target of Vengeance
- **Timing:** Once per battle round (army), start of the battle round.
- **Declare:** Only if you have **no quarry on the battlefield** (none picked yet, or the last one was destroyed or is otherwise
  off the battlefield). Pick any enemy unit **on the battlefield** (no range or visibility limit).
- **Effect:** That unit is your **quarry** for the rest of the battle.

### SYL-BT-2 `sylvaneth.ability.airborne-cohesion` — Airborne Cohesion
- **Timing:** Passive.
- **Effect:** Friendly units have a **coherency range of 2"** (instead of ½", CORE-1.6).

### SYL-BT-3 `sylvaneth.ability.song-of-the-hunt` — Song of the Hunt
- **Timing:** Passive.
- **Effect:** You gain **1 chord** each time your quarry is destroyed. The bonuses below are **cumulative** (3 chords gives all
  three) and each applies to a friendly unit only **while it is within 9" of your quarry** (so never while you have no quarry):

| Chords | Name | Bonus |
|---|---|---|
| 1+ | Simple (SYL-BT-4) | **+1 to run rolls and charge rolls** for that unit. |
| 2+ | Tuneful (SYL-BT-5) | **+1 to hit rolls** for that unit's attacks (shooting and combat, any target). |
| 3+ | Melodic (SYL-BT-6) | **+1 to wound rolls** for that unit's attacks (shooting and combat, any target). |

The Heartwood Hunting Horn (SYL-AB-1) makes one unit count 1 extra chord.

---

## 3. Regiment abilities (pick 1 at army selection)

### SYL-RA-1 `sylvaneth.ability.leaves-on-the-wind` — Leaves on the Wind
- **Timing:** Once per battle (army), end of any turn.
- **Declare:** Pick a friendly unit that is **in combat**.
- **Effect:** That unit may at once use the **Retreat** ability as though it were your movement phase (move up to its Move,
  may cross enemy combat ranges, must end out of combat), and it suffers **no mortal damage** for retreating.

### SYL-RA-2 `sylvaneth.ability.lifebringers` — Lifebringers
- **Timing:** Once per turn (army), end of any turn.
- **Effect:** **Heal (D3)** every friendly unit on the battlefield (one D3 per unit, RULING §8.4).

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `sylvaneth.enh.head-of-the-hunt` | Head of the Hunt (SYL-ENH-1) | Passive | **+1 Rend** to the general's melee weapons while your quarry is **within 9" of and visible to** the general. |
| `sylvaneth.enh.zephyrkin` | Zephyrkin (SYL-ENH-2) | Reaction: you declared a **Fight** ability for your general | Only if the general **charged this turn**. After that Fight ability has been resolved, the general may move up to **2D6"**; it cannot end that move in combat. |
| `sylvaneth.enh.bold-spirit` | Bold Spirit (SYL-ENH-3) | Once per battle (army), any hero phase | For the rest of the turn, **+1 to wound rolls** for **combat** attacks by friendly units while they are **within the general's combat range** (3"). |
| `sylvaneth.enh.cunning-pursuer` | Cunning Pursuer (SYL-ENH-4) | Passive | While the general is **in combat**, **+1 to charge rolls** for friendly units **wholly within 12"** of it; **+2 instead** while the general is in combat **with your quarry**. |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Printed keywords only (Spearhead warscrolls print no faction keywords).

### 5.1 `sylvaneth.unit.arch-revenant` — Arch-Revenant (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 6 | 4+ | 2 | — |

Keywords: **Hero, Infantry, Fly**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Arch-Revenant's Glaive (`sylvaneth.weapon.arch-revenants-glaive`) | Melee | — | 5 | 3+ | 4+ | 1 | 2 | — |

**SYL-AB-1 `sylvaneth.ability.heartwood-hunting-horn` — Heartwood Hunting Horn**
- **Timing:** Your hero phase (once per phase for this unit, CORE-3.4).
- **Declare:** Pick a **visible** friendly unit **wholly within 12"** of this unit (this unit itself may be picked, RULING §8.6).
- **Effect:** Until the start of your next turn, when working out which Song of the Hunt bonuses apply to that unit, you count
  as having **1 more chord** than you do. It gives nothing while you have no quarry (every bonus needs the quarry within 9").

### 5.2 `sylvaneth.unit.gossamid-archers` — Gossamid Archers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 2 | 5+ | 1 | — |

Keywords: **Infantry, Fly**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Gossamid Bow (`sylvaneth.weapon.gossamid-bow`) | Ranged | 12" | 2 | 3+ | 4+ | 1 | 1 | Shoot in Combat |
| Cruel Talons (`sylvaneth.weapon.cruel-talons`) | Melee | — | 1 | 3+ | 4+ | 0 | 1 | — |

Loadout: all 5 models carry both weapons.

**SYL-AB-2 `sylvaneth.ability.zephyrspites` — Zephyrspites** (ability keyword **Move**)
- **Timing:** Reaction: you declared a **Shoot** ability for this unit.
- **Effect:** After that Shoot ability has been resolved, this unit may move up to **D6"**. No part of that move may enter
  combat (RULING §8.2: Fly does not lift this; a unit in combat cannot make the move).

### 5.3 `sylvaneth.unit.spiterider-lancers` — Spiterider Lancers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 5 | 4+ | 2 | — |

Keywords: **Cavalry, Fly**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Spiterider Lance (`sylvaneth.weapon.spiterider-lance`) | Melee | — | 3 | 3+ | 4+ | 1 | 1 | Charge (+1 Damage) |
| Dragonspite's Mandibles (`sylvaneth.weapon.dragonspite-mandibles`) | Melee | — | 3 | 4+ | 3+ | 1 | 2 | Companion |

Loadout: all 3 models carry both weapons.

**SYL-AB-3 `sylvaneth.ability.spiterider-charge` — Spiterider Charge**
- **Timing:** Any charge phase (once per phase for this unit).
- **Declare:** Only if this unit **charged this phase**. Pick a **visible** enemy unit **within 1"** of this unit.
- **Effect:** Roll a D3; **add 1** if the target is your **quarry**. On a (modified) **2+**, inflict mortal damage on the target
  equal to the (modified) roll (so 2-3, or 2-4 against the quarry).

### 5.4 `sylvaneth.unit.revenant-seekers` — Revenant Seekers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 5 | 4+ | 2 | — |

Keywords: **Cavalry, Fly**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Seeker's Sickle (`sylvaneth.weapon.seekers-sickle`) | Melee | — | 3 | 3+ | 4+ | 1 | 1 | Crit (Mortal) |
| Dragonspite's Mandibles (`sylvaneth.weapon.dragonspite-mandibles`) | Melee | — | 3 | 4+ | 3+ | 1 | 2 | Companion |

Loadout: all 3 models carry both weapons. The mandibles profile is identical to the Lancers' and shares the weapon id.

**SYL-AB-4 `sylvaneth.ability.deafening-drone` — Deafening Drone**
- **Timing:** Any combat phase (once per phase for this unit).
- **Declare:** Only if this unit **did not charge this turn**. Pick an enemy unit **in combat with** this unit.
- **Effect:** Roll a D6. If the roll is **greater than the target's Control characteristic**, subtract **1 from the Attacks** of
  the target's **melee** weapons (Companion weapons included: an enemy ability, CORE-12.4) for the rest of the turn. Attacks
  cannot go below 1 (CORE-2.6).

---

## 6. Spells and prayers

None. No Wizard or Priest, no lores (SPH-13.2).

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/sylvaneth/*.json`), at most a bare-name hook; (b) = new faction code hook in
`src/engine/factions/sylvaneth.ts` (registered in `code-hooks.ts` as `...sylvanethHooks`); (c) = needs an engine change outside the
faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, no Ward, no Reinforcements | (a) | Datasheets as the other armies: `HERO`, `INFANTRY`, `CAVALRY`, `FLY`. No `REINFORCEMENTS` anywhere, so `spearheadCallForReinforcements` is never offered (as any army whose units all lack it). Bases `{ shape: 'round', mm: 40 / 32 / 60 / 60 }`. |
| Weapons | (a) | `SHOOT_IN_COMBAT` (Gossamid Bow), `CHARGE_DAMAGE` (Spiterider Lance; attack.ts `chargeBonus`), `CRIT_MORTAL` (Seeker's Sickle), `COMPANION` (Mandibles). One shared `sylvaneth.weapon.dragonspite-mandibles`. |
| Fly (every unit) | (a) | Existing FLY handling in `phases/movement.ts`, `phases/charge.ts`, `aos-moves.ts` (CORE-6.10). |
| SYL-BT-2 Airborne Cohesion | (a) | Datasheet `coherencyRange: 2` on all four warscrolls (the battle trait is always on and covers every friendly unit; nothing in this army is ever outside it). Its descriptor stays in data as a passive with no effect so the UI can show it. Movement, charge, fight, setup, cards, redeploy and `aos-common.ts coherencyRangeOf` already read the field (SCE Skirmishers precedent). |
| SYL-BT-1 Target of Vengeance | (b) `sylvanethTargetOfVengeance` | Activated, data timing `startOfRound`, `limit oncePerRound` (the round-start window runs once per round and the trait is army-wide, so the per-round limit is exact). `canUse`: `!quarryOnBoard(state, player)`. `targets`: every enemy unit with `location === 'board'`. Resolve: append the target to `mission.custom.sylQuarry[player] = { current: unitId, past: UnitId[] }` (past = every unit ever picked). Exported helpers `quarryOf(state, player): UnitId \| null` (current, only while on the battlefield) and `chordsOf(state, player): number` = number of `past` ids whose unit is **destroyed** (`unit.location === 'destroyed'`; removed-and-replaced units count, a unit merely off the board in reserve does not). Counting from the ledger means no unit-destroyed hook is needed: a chord can only matter once a new quarry exists, which is never before the next round start. Announce the pick; the client shows a quarry marker on that unit (§8.9). |
| SYL-BT-3..6 Song of the Hunt | (b) `sylvanethSongOfTheHunt` | Passive descriptor carrying four declarative `modifyRoll +1` effects (advance, charge, hit, wound), switched on by the code hook's `gate`. A passive `produce` hook cannot do this: `collect` only asks `produce` of active effects, and `advanceRollFor` never asks it at all. The gate reads which roll is being asked about from the hook data (`attack` + `roll.purpose` hit / wound, `chargingUnitId`, `movingUnitId`), requires the rolling unit to be the holder, the quarry (`quarryOf`) to be within 9" (closest models, `unitGap`), and `chordsOf(state, p) + hornBonus(state, u)` to reach 1 (advance, charge), 2 (hit) or 3 (wound). The hit / wound bonus applies to any attack by the unit (any target, ranged and melee); the CORE-2.5 ±1 cap on hit and wound rolls applies (`dice.ts`). `resourceReadout` shows `Chords n/3` and the quarry's name for the HUD. |
| SYL-AB-1 Heartwood Hunting Horn | (b) `sylvanethHeartwoodHorn` | Activated, `phase command / your`; declare friendly; `targets` keeps `whollyWithinUnit(target, self, 12)` and `losService.unitVisible(self → target)` (self always qualifies). Resolve grants an empty marker effect `{ sourceAbilityId }` to the target with `duration untilNextTurn` (expires at the start of the owner's next turn). `hornBonus(state, u)` = 1 while `u` holds such a marker (two horns never stack: one Arch-Revenant). |
| SYL-RA-1 Leaves on the Wind | (b) `sylvanethLeavesOnTheWind` | The SKV Scurry Away shape: activated, `endOfTurn / any`, `limit oncePerBattle`, declare friendly `inEngagement`; `canUse` also needs a legal non-stay `retreatOptions(state, u, moveOf(u))`. Resolve: `writeMoveQueue(s, { abilityId, player, maxDistance: moveOf(s, u), queue: [u], kind: 'retreat' })` (`applyRetreat` inflicts no damage, may cross combat ranges, must end out of combat). Set `unit.turn.moveType = 'fallBack'` (as though it retreated in the movement phase; nothing reads it this late in the turn). |
| SYL-RA-2 Lifebringers | (b) `sylvanethLifebringers` | Activated, `endOfTurn / any`, `limit oncePerTurnArmy`, no declare. `canUse`: some friendly unit on the battlefield `isDamaged`. Resolve: for each damaged friendly unit on the battlefield (unit-id order), roll one D3 and `healUnit(ctx, u, d3, abilityId)` (Cities / Fyreslayers / Kharadron precedent). An undamaged unit has nothing to heal, so no die is rolled for it (same outcome). |
| SYL-ENH-1 Head of the Hunt | (b) `sylvanethHeadOfTheHunt` + (c) C1 | Passive enhancement, scope bearer, code hook with `statDelta` (C1): for `q.stat === 'AP'`, a melee `q.weapon` of the bearer's model, return `-1` while `quarryOf` is within 9" of the bearer's unit and `losService.unitVisible(bearer unit → quarry)`; else 0. A plain `modifyStat` effect cannot carry this: no `Condition` reads the quarry, and `statFor` does not ask code hooks today. |
| SYL-ENH-2 Zephyrkin | (b) `sylvanethZephyrkin` + (c) C2, C3 | Data timing `{ kind: 'reaction', trigger: 'youDeclared', keyword: 'ATTACK' }`, no ability keywords (the card prints none, unlike Zephyrspites' Move; audit F14 removed a stray `MOVE`) (offered in the `attackDeclared` window that fight.ts opens when a unit is picked to fight). `canUse`: `readDeclaredAttack(state)` is `{ phase: 'fight', unitId: <the bearer's unit> }` and `unit.turn.chargedThisTurn`. Resolve: roll 2D6 now, then `writeMoveQueue(s, { abilityId, player, maxDistance: roll, queue: [unit], opts: { mayNotEndInCombat: true }, atWindow: 'fightAfter' })` (C2), so the queue waits until the `fightAfter` window that fight.ts opens once that unit's Fight ability is resolved (C3). Fly keeps the path free of combat-range limits (CORE-6.10); only the end spot must be out of combat. If the general is slain during its fight the queue is dropped (abilities.ts already filters off-board units). |
| SYL-ENH-3 Bold Spirit | (b) `sylvanethBoldSpirit` | Activated, `phase command / any`, `limit oncePerBattle`, no declare (the bearer's unit). Resolve grants a marker effect on the bearer's unit, `duration untilEndOfTurn`. `producesAt: ['onWoundRoll']`: `+1` for a **melee** attack whose attacker unit `u` belongs to the bearer's player while the bearer's unit holds the marker and `unitGap(state, u, bearerUnit) <= 3` (the general's own unit included, gap 0; RULING §8.5). Read per attack, so units that move into or out of range mid-turn gain or lose it. |
| SYL-ENH-4 Cunning Pursuer | (b) `sylvanethCunningPursuer` | Passive enhancement. `ensureEffects` keeps a battle-long empty marker effect on the bearer's unit (the SCE Null Pendant / KO There's No Reward shape), because `produce` only answers on active effects. `producesAt: ['onChargeRoll']`: when the charging unit `u` (friendly to the bearer) is wholly within 12" of the bearer's unit (`whollyWithinUnit`) and the bearer's unit `inCombat`: `+2` if `enemiesInCombat(bearer)` includes `quarryOf(...)`, else `+1`. Stacks with Simple (+1) as two separate modifiers (charge rolls have no ±1 cap in AoS). |
| SYL-AB-2 Zephyrspites | (b) `sylvanethZephyrspites` + (c) C2, C4 | Data timing `{ kind: 'reaction', trigger: 'youDeclared', keyword: 'ATTACK' }`; `canUse`: the declared attack is `{ phase: 'shooting', unitId: self }`. Resolve: roll D6, `writeMoveQueue(s, { …, maxDistance: roll, queue: [self], opts: { noCombatPath: true }, atWindow: 'shooting' })` (C2: the next `shooting` window is the `shooting:after:<unitId>` one that shooting.ts already opens after the activation). `noCombatPath` (C4) = the `normalMove` path test without the Fly exemption, plus `mayNotEndInCombat`. The queue is skipped (not offered) when the unit is in combat when it comes up (RULING §8.2). |
| SYL-AB-3 Spiterider Charge | (b) `sylvanethSpiteriderCharge` | Activated, `phase charge / any` (offered in the end-of-charge-phase window, after every charge move). `canUse`: `unit.turn.chargedThisTurn` and the charge happened this phase (the phase is a charge phase of the turn it charged; a Counter-Charge charge in the opponent's phase qualifies). `targets`: enemy units within 1" (`unitGap <= 1`) and visible. Resolve: D3, `+1` when target is `quarryOf(...)`; if total ≥ 2, `inflictMortal(ctx, use, target, total)`. |
| SYL-AB-4 Deafening Drone | (b) `sylvanethDeafeningDrone` | Activated, `phase fight / any`; `canUse`: `!unit.turn.chargedThisTurn` and `enemiesInCombat(self)` non-empty; `targets` = those. Resolve: D6; compare with the target's printed Control (`max` of `modelStats(...).OC` over its live models). If greater, grant the **target** `{ when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: -1 }, affectsCompanion: true }` with `duration untilEndOfTurn`, `sourceUnitId` = the Seekers (an enemy effect, so it reaches Companion weapons). `statFor` floors Attacks at 1 (CORE-2.6) — approximation: `weapons.ts effectiveWeapon` only applies a stat delta to a flat Attacks characteristic, so a weapon whose Attacks is a dice expression (`D6`, the Skaven cannon crew's knives are the only melee case) is not reduced. Every other melee weapon in the game has flat Attacks. |

**Engine changes (c):**
- **C1 code-hook stat deltas** (`code-hooks.ts` EngineCodeHook additive, `hooks-impl.ts` `statFor`): `statDelta?(state: GameState,
  entry: HookSourceEntry, q: StatQuery): number`. `statFor` sums it over the active hook sources (as `collect` does for `produce`)
  into the additive `delta`, after halving; skipped when `q.companionOnly` unless the hook sets `affectsCompanion: true` on the spec.
  State-only (no ctx), so it is safe inside `effectiveWeapon`. Client weapon cards and AI `expected.ts` see it through `statFor`.
- **C2 move queues bound to a window** (`factions/aos-moves.ts`, `abilities.ts`): `MoveQueue + atWindow?: AbilityWindow`. The
  abilities loop (`nextStep`) leaves a queue with `atWindow` untouched unless the running window equals it (the
  `RedeployRequest.atWindow` rule, F8). A queue still waiting at the end of the phase is dropped (phase marks are cleared).
- **C3 after-fight window** (`phases/fight.ts`, `abilities.ts AbilityWindow + 'fightAfter'`): right after `ownFightResolved(ctx,
  unitId)` (both call sites), `if (ctx.services.abilities.runWindow(ctx, 'fightAfter', unit.player, 'fight:after:' + unitId)) return
  'pending'` on a progress key so it runs once per activation. The window offers **no** descriptors except ones with
  `params.window: 'afterFight'` (none today); it exists to run `ensureEffects` and drain queued moves / set-ups. Mirrors the F8
  `shooting:after:<unitId>` window but cannot change what other armies are offered.
- **C4 slide without the Fly exemption** (`factions/aos-moves.ts`): `SlideOpts + noCombatPath?: boolean` — the F12 `normalMove`
  sampled-path test (no model's path may come within an enemy combat range) applied **even when every model has FLY**; implies
  `mayNotEndInCombat`. `slideOptions` drops every option for a unit that starts in combat (each path would start inside a range).

---

## 8. Engine notes

1. **Which army** [RULING]: see the header. If the owner prefers Bitterbark Copse, Appendix A holds everything needed.
2. **Zephyrspites** [RULING]: the ability's own "no part of the move may enter combat" is a specific restriction that Fly does not
   override (otherwise the clause would do nothing for an all-Fly unit). A Gossamid unit that is in combat after shooting (it has
   Shoot in Combat) cannot make the move at all. approximation: the D6 is rolled when the reaction is used, before the attacks;
   no rule reads it in between, and the move stays optional ("up to").
3. **Target of Vengeance** [RULING]: picking is optional but the AI always picks when it can. A quarry that is set up again
   (Leaves on the Wind on the enemy side, reserves, redeploys) stays the quarry; only destruction ends it. A destroyed quarry that
   the enemy replaces with Call for Reinforcements gives a chord; the new copy is a different unit and is not the quarry. If no
   enemy unit is on the battlefield at round start, nothing happens. In a Sylvaneth mirror each side has its own quarry and chords.
4. **Lifebringers** [RULING]: Heal (D3) is rolled separately for each friendly unit. It is usable at the end of both players'
   turns (once per turn), so up to twice per battle round.
5. **Bold Spirit** [RULING]: "within your general's combat range" includes the general's own unit. Only combat (melee) attacks.
   "Any hero phase" means the opponent's too; the effect then lasts for the opponent's turn.
6. **Heartwood Hunting Horn** [RULING]: the Arch-Revenant may pick itself (visible to itself, CORE-7.2; wholly within 12" of itself).
   The extra chord only changes which Song bonuses apply; it is not a real chord and never counts for anything else.
7. **Song of the Hunt and Companion** [RULING]: attack.ts `runStage` drops friendly positive roll modifiers on a Companion weapon (CORE-12.4: friendly abilities do not help it), so the +1 hit / +1 wound of Song of the Hunt, and Bold Spirit's +1 wound, do **not** reach the Dragonspite's Mandibles; they do reach every other weapon of the army. (The Stormcast spec §8.6 reads CORE-12.4 the other way for Plan the Attack; the engine, which treats all armies alike, is followed here.) Deafening Drone is an enemy ability and lowers Companion attacks too (CORE-12.4, `affectsCompanion`).
8. **Spiterider Charge**: the D3 is not a declared roll that can fail the ability; a 1 against a non-quarry target simply does
   nothing. The mortal damage is resolved through the normal damage sequence (wards apply).
9. **Client**: the quarry needs a visible marker on the enemy unit (reuse the oath / Bloodmarked marker style) and the chord count
   in the army panel (styled tooltip, no `title=`). The roster card shows "Quarry: <unit>" and "Chords: n".
10. **AI** (ability-use options carry no unit hint; `sylvanethAbilityTiming` falls back to the general for the general-bound
    abilities): Target of Vengeance — the enemy unit with the lowest `wounds left / expected damage from this army in one turn`,
    tie-break nearest to the most friendly units; Heartwood Horn — the friendly unit nearest the quarry with the most attacks
    (Lancers on a charge turn); Leaves on the Wind — a friendly unit in combat that will lose the fight (more enemy attacks than its
    own wounds left) or that just finished a charge and is stuck on a bad target; Lifebringers — whenever any unit is damaged;
    Bold Spirit — the hero phase before a turn in which ≥2 friendly units will fight within 3" of the general; Spiterider Charge —
    always, quarry first, then the unit with fewest wounds left; Deafening Drone — always, the in-combat enemy with the lowest
    Control and the most melee attacks; Zephyrspites — always, ending out of the shooting range of the nearest enemy shooters and
    away from enemy charge reach; Zephyrkin — always, toward cover or an objective out of combat.
11. **Defaults for the sim**: regiment Lifebringers and enhancement Head of the Hunt; variant games use Leaves on the Wind and
    Zephyrkin (the last entries in the patrol lists).

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| SYL-ARMY-1 | Spitewing Flight builds: Arch-Revenant general + 5 Gossamid Archers + 3 Spiterider Lancers + 3 Revenant Seekers, 12 models, stats as §5. |
| SYL-ARMY-2 | No unit is offered Call for Reinforcements (no Reinforcements keyword). |
| SYL-ARMY-3 | Every unit has Fly and moves over models; no unit has a Ward. |
| SYL-BT-1 | Target of Vengeance: offered at round start only while no quarry is on the battlefield; marks any enemy unit on the battlefield; not offered again while it lives; offered again the round after it is destroyed. |
| SYL-BT-2 | Airborne Cohesion: friendly units stay coherent with models up to 2" apart (5 Gossamids spread 2" apart are legal). |
| SYL-BT-3 | Song chords: +1 chord per destroyed quarry; a quarry that leaves the battlefield without being destroyed gives none; a replaced (reinforced) quarry gives one. |
| SYL-BT-4 | Simple (1+ chord): +1 to run and charge rolls only for units within 9" of the quarry; nothing with 0 chords. |
| SYL-BT-5 | Tuneful (2+ chords): +1 to hit for units within 9" of the quarry, against any target; capped at +1 overall. |
| SYL-BT-6 | Melodic (3+ chords): +1 to wound for units within 9" of the quarry; with 3 chords Simple and Tuneful apply too. |
| SYL-RA-1 | Leaves on the Wind: end of any turn, a friendly unit in combat retreats up to its Move with no mortal damage and ends out of combat; once per battle. |
| SYL-RA-2 | Lifebringers: end of any turn, every damaged friendly unit heals its own D3; once per turn; never returns slain models. |
| SYL-ENH-1 | Head of the Hunt: general's melee Rend +1 while the quarry is within 9" and visible; not beyond 9", not when hidden, not with no quarry. |
| SYL-ENH-2 | Zephyrkin: offered when the general is picked to fight after charging; after its attacks it may move up to 2D6" and must end out of combat; not offered if it did not charge; no ability keywords (none printed). |
| SYL-ENH-3 | Bold Spirit: once per battle, any hero phase; rest of turn +1 to wound for melee attacks by friendly units within 3" of the general (general included); ranged attacks unaffected. |
| SYL-ENH-4 | Cunning Pursuer: while the general is in combat, +1 to charge rolls for friendly units wholly within 12"; +2 when it is in combat with the quarry; nothing when the general is not in combat. |
| SYL-AB-1 | Heartwood Hunting Horn: target counts 1 extra chord until your next turn (0 chords + horn = Simple only); needs a quarry within 9" to matter; target visible and wholly within 12". |
| SYL-AB-2 | Zephyrspites: after the Gossamids shoot they may move up to D6"; the path may not enter any enemy combat range even with Fly; not offered while in combat. |
| SYL-AB-3 | Spiterider Charge: only for Lancers that charged this phase; visible enemy within 1"; D3 (+1 vs quarry), 2+ deals that much mortal damage; a 1 does nothing. |
| SYL-AB-4 | Deafening Drone: only if the Seekers did not charge; D6 > target Control gives -1 Attacks to the target's melee weapons (Companion included) for the turn, floor 1; equal or lower does nothing. |
| SYL-WEAP-1 | Spiterider Lance deals 2 damage per unsaved attack on the turn the Lancers charged, 1 otherwise. |
| SYL-WEAP-2 | Seeker's Sickle unmodified 6 to hit deals 1 mortal damage and skips wound and save. |
| SYL-WEAP-3 | Dragonspite's Mandibles (Companion) ignore friendly weapon-characteristic modifiers and friendly roll bonuses (Song of the Hunt's +1 to hit does not help them, §8.7). |
| SYL-WEAP-4 | Gossamid Bow may shoot while the unit is in combat (Shoot in Combat). |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own forest-spirit livery): warm bark-brown wooden bodies with pale birch-white faces, spring-green
leaf cloaks and hair, teal-to-cyan translucent-looking (but solid, opaque) insect wings, amber-gold glowing eyes and sap accents.
The two dragonspite cavalry units are told apart by mount colour: Lancers on teal-green dragonspites, Seekers on autumn
russet-orange ones. Shared motif: an original three-leaf spiral badge carved into shields and bark. No GW logos, no copied
Sylvaneth glyphs, Wargrove runes or sculpt details. All riders and infantry are **true MGSD** chibis (~2.5 heads tall, huge head,
stubby legs, big hands); dragonspites are chunky, toy-like SD insect-dragons. Wings and effects are solid shapes, never
see-through.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `syl-arch-revenant` | Arch-Revenant | 1 | 40 round | No (wings are a companion spite on its back) | A true MGSD chibi tree-spirit warrior, 2.5 heads tall with a huge pale birch-wood face, glowing amber eyes and a tall crown of curling antler-branches, stubby bark legs, a big round leaf-shield on one arm and a long glaive with a curved green blade, carried aloft by a chubby little dragonfly-spite clinging to its back with four big solid teal wings. |
| `syl-gossamid-archer` | Gossamid Archers | 1 (×5) | 32 round | No | A true MGSD chibi slender forest-spirit archer, 2.5 heads tall with a huge pale wooden face, long trailing leaf-green hair and amber eyes, stubby dangling legs, hovering on a pair of solid teal moth-wings sprouting from a small spite hugging its chest, drawing an oversized curved living-wood bow with a fat grub-tipped arrow. |
| `syl-spiterider-lancer` | Spiterider Lancers | 1 (×3) | 60 round | Mount (teal-green dragonspite) | A true MGSD chibi bark-skinned rider, 2.5 heads tall with a huge antlered wooden head, stubby legs and a big leaf-shield, levelling a long thorn-tipped lance, seated on a chunky toy-like SD insect-dragon with a round segmented teal-green body, big friendly compound eyes, curved mandibles, short claw legs and two pairs of solid stubby wings. |
| `syl-revenant-seeker` | Revenant Seekers | 1 (×3) | 60 round | Mount (russet dragonspite) | A true MGSD chibi bark-skinned rider, 2.5 heads tall with a huge hooded wooden face and glowing amber eyes, stubby legs, swinging an oversized crescent sickle with a pale green blade, seated on a chunky toy-like SD insect-dragon with a round segmented autumn russet-orange body, curved mandibles, short claw legs and two pairs of solid stubby amber wings. |

No champion, musician or standard variants: the Spearhead gives none of them rules. Bitterbark Copse figures are listed in
Appendix A.

---

## 11. Implementation notes

Built (F14). Data `src/data/factions/sylvaneth/` (`faction.json`, `abilities.json`, `enhancements.json`, `weapons.json`,
`datasheets/{arch-revenant,gossamid-archers,spiterider-lancers,revenant-seekers}.json`, `patrols/spitewing-flight.json` with
`battleTraits` [Target of Vengeance, Airborne Cohesion, Song of the Hunt], regiment list Lifebringers (default) then Leaves on
the Wind, enhancement list Head of the Hunt (default), Bold Spirit, Cunning Pursuer, Zephyrkin); hooks
`src/engine/factions/sylvaneth.ts` (`...sylvanethHooks` in `code-hooks.ts`; AI hints `sylvanethAbilityTiming` /
`sylvanethTargetBonus` wired in `src/ai/utility.ts`); tests `tests/engine/sylvaneth.test.ts` and `tests/data/sylvaneth.test.ts`,
one test per SYL- id plus `SYL-REG` (every code resolves) and `SYL-AI` (the hints). Engine changes C1-C4 are in port plan §3.12.

Open items for other owners: the client does not yet draw the quarry marker (§8.9) or show the `Chords` resource; the AI's
shooting / charge target scoring does not yet prefer the quarry for units within 9" (only the Target of Vengeance, Spiterider
Charge, Heartwood Horn, Leaves on the Wind and Deafening Drone picks are scored); the DecisionPrompt has no title for the
`critChoice` topic (not used by this army).

Existing mechanisms this army reuses: `coherencyRange` (SCE Skirmishers), `CHARGE_DAMAGE` / `CRIT_MORTAL` / `COMPANION` /
`SHOOT_IN_COMBAT`, the `attackDeclared` reaction window (`youDeclared` + `ATTACK`, F8), the `shooting:after:<unitId>` window
(F8), `retreatOptions` / MoveQueue `kind: 'retreat'` (KO Timed Charges, SKV Scurry Away), `healUnit`, `inflictMortal`,
`modifyRoll` effects with a code `gate` at `onAdvanceRoll` / `onChargeRoll` / `onHitRoll` / `onWoundRoll`, `produce` at
`onChargeRoll` / `onWoundRoll`, `affectsCompanion`, `startOfRound` windows, `mission.custom` ledgers (SCE Plan the Attack, Null
Pendant), `whollyWithinUnit`, `unitGap`, `enemiesInCombat`, `losService.unitVisible`.

---

## Appendix A — Bitterbark Copse (separate PDF; out of scope)

Source: "Spearhead: Sylvaneth - Bitterbark Copse", Warhammer Community download listed 2026-03-25 (PDF metadata: created
2026-04-08), 4 pages, 21.4 MB, fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_aos_spearhead_sylvaneth_bitterbark-copse-jqmpmca0ca-baul2djdaq.pdf`. Not stored in
`docs/sources/`. Bases from the Wahapedia aos4 pages (`/Branchwych`, `/Treelord`, `/Kurnoth-Hunters-with-Greatbows`,
`/Tree-Revenants`), same day. Rule IDs `SYL-A-*`.

### A.1 Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `sylvaneth.unit.branchwych` | Branchwych | 1 | **General** | no | 32 round |
| `sylvaneth.unit.treelord` | Treelord | 1 | Unit | no | 70 round (Wahapedia lists 70mm) |
| `sylvaneth.unit.kurnoth-hunters` | Kurnoth Hunters (greatbows) | 3 | Unit | no | 50 round |
| `sylvaneth.unit.tree-revenants` | Tree-Revenants | 5 | Unit | **yes** | 32 round |

### A.2 Battle traits
- **SYL-A-BT-1 Ley Lines** — Once per turn (army), end of any turn. **Heal (1)** every friendly unit within 3" of any terrain feature.
- **SYL-A-BT-2 Strike and Fade** — Once per turn (army), end of any turn. Declare: a friendly unit that used a **Fight** ability this
  turn and is within 3" of any terrain feature; roll a D6. On **2+** remove it and set it up again with **every model within 3" of
  a terrain feature** and **more than 6" from all enemy units**.

### A.3 Regiment abilities (pick 1)
- **SYL-A-RA-1 Vengeful Spirits of the Land** — Once per turn, end of any turn. Declare: an enemy unit **contesting an objective**;
  roll a D6. On **4+**, **D3 mortal damage** to it.
- **SYL-A-RA-2 Walkers of the Hidden Paths** — Once per turn, your movement phase. Declare: a friendly unit within 3" of any terrain
  feature and **not in combat**. Remove it and set it up again **more than 6" from all enemy units** (anywhere else on the
  battlefield); it cannot use **Move** abilities for the rest of the phase.

### A.4 Enhancements
| Name | Timing | Effect |
|---|---|---|
| Regrowth | Your hero phase | Declare: a visible friendly unit wholly within 18" of the general; casting roll 2D6. On **5+**, **Heal (D6)** it. |
| Gnarled Warrior | Passive | Ignore negative modifiers to the general's **save** rolls (F12 `ignoreNegativeModifiers: 'save'`). |
| Treesong | Your hero phase | Declare: a visible friendly unit wholly within 12" of the general; casting roll 2D6. On **7+**, **+1 Rend** to that unit's melee weapons until the start of your next turn. |
| Seed of Rebirth | Passive, once per battle | When the general would be destroyed, roll a D6 before removing it: on **3+** it is not destroyed, any damage still to be allocated to it is discarded, then **Heal (1)** it. |

### A.5 Warscrolls

| Unit | Move | Health | Save | Control | Ward | Keywords |
|---|---|---|---|---|---|---|
| Branchwych | 6" | 5 | 5+ | 2 | — | Hero, Wizard, Infantry |
| Treelord | 5" | 14 | 3+ | 5 | — | Monster |
| Kurnoth Hunters | 5" | 5 | 4+ | 2 | — | Infantry |
| Tree-Revenants | 6" | 2 | 5+ | 1 | — | Infantry, Reinforcements |

| Unit | Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|---|
| Branchwych | Greenwood Scythe and Bittergrub | Melee | — | 3 | 3+ | 4+ | 1 | D3 | — |
| Treelord | Strangleroots | Ranged | 10" | 3 | 3+ | 2+ | 1 | 2 | Shoot in Combat |
| Treelord | Sweeping Blows | Melee | — | 5 | 4+ | 2+ | 1 | 2 | — |
| Treelord | Massive Impaling Talons | Melee | — | 2 | 4+ | 2+ | 2 | 3 | — (Battle Damaged) |
| Kurnoth Hunters | Kurnoth Greatbow | Ranged | 18" | 2 | 3+ | 3+ | 1 | 2 | — |
| Kurnoth Hunters | Vicious Claws | Melee | — | 3 | 3+ | 3+ | 0 | 1 | — |
| Tree-Revenants | Enchanted Blade | Melee | — | 2 | 3+ | 4+ | 1 | 1 | — |

Warscroll abilities:
- **SYL-A-AB-1 Verdurous Harmony** (Branchwych) — Your hero phase. Declare: a visible friendly unit wholly within 18"; casting roll
  2D6. On **7+** return **1** slain model to it, or **D3** if it is a **Tree-Revenants** unit (`returnSlainModels`).
- **SYL-A-AB-2 Groundshaker** (Treelord) — Any combat phase. Declare: an enemy unit in combat with this unit; D6. On **4+** it has
  **Strike-last** this phase.
- **SYL-A-AB-3 Battle Damaged** (Treelord) — Passive. While it has **10+ damage points**, Massive Impaling Talons has **Attacks 1**.
- **SYL-A-AB-4 Envoys of the Everqueen** (Kurnoth Hunters) — Passive. While this unit contests an objective, friendly units
  contesting that objective have **Ward (6+)**.
- **SYL-A-AB-5 Martial Memories** (Tree-Revenants) — Any combat phase. Pick one for this unit, this phase: **+1 to hit** rolls for
  its attacks, or **+1 to save** rolls for it.

### A.6 Figures (if the army is added)

| Slug | Unit | Models needed | Base (mm) | Mount | Concept prompt |
|---|---|---|---|---|---|
| `syl-branchwych` | Branchwych | 1 | 32 round | No | A true MGSD chibi tree-witch, 2.5 heads tall with a huge bark face, antler-branch crown and amber eyes, stubby root legs, a big curved green scythe and a chubby grub familiar peeking from her shoulder. |
| `syl-treelord` | Treelord | 1 | 70 round | Monster | A chunky toy-like SD walking tree giant with a huge round knotted face and glowing amber eyes, short stump legs with root toes, oversized talon-branch hands and a leafy summer canopy on its head. |
| `syl-kurnoth-hunter` | Kurnoth Hunters | 1 (×3) | 50 round | No | A true MGSD chibi tall bark-warrior, 2.5 heads tall with a huge antlered wooden head, stubby legs braced wide, drawing an oversized living-wood greatbow with a thick green arrow. |
| `syl-tree-revenant` | Tree-Revenants | 1 (×5) | 32 round | No | A true MGSD chibi lithe forest-spirit swordsman, 2.5 heads tall with a huge pale wooden mask-face and leaf hair, stubby legs in a fencing stance, holding a curved enchanted blade with a faint green edge. |
