# Ossiarch Bonereapers — Mortisan Elite (Spearhead)

Faction id: `ossiarch` · Army id: `ossiarch.army.mortisan-elite` · Grand alliance: Death.
Source: `docs/sources/spearhead-ossiarch-bonereapers.pdf` (4 pages, 6.1 MB, gitignored), "Spearhead: Ossiarch Bonereapers -
Mortisan Elite", the free Warhammer Community download (Age of Sigmar, Spearhead category). First listed 2025-06-11 (PDF
metadata: created 2025-04-09). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_jun25_aos_spearhead_ossiarchbr_rules-oyqrmemltw-ba87liamqd.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, body
`{"index":"downloads_v2","searchTerm":"ossiarch","gameSystem":"warhammer-age-of-sigmar","language":"english"}`). The PDF prints
no base sizes; they come from the Wahapedia aos4 warscroll pages (`wahapedia.ru/aos4/factions/ossiarch-bonereapers/Mortisan-Ossifector`,
`/Immortis-Guard`, `/Necropolis-Stalkers`, `/Morghast-Archai`), fetched the same day with plain curl.

**Which army.** The search returns three separate Ossiarch Spearhead PDFs, one army each:
- **Mortisan Elite** (Mortisan Ossifector, 3 Immortis Guard, 3 Necropolis Stalkers, 2 Morghast Archai; June 2025). This is the
  line-up of the **Spearhead: Ossiarch Bonereapers** box released with the 4th-edition battletome, so it is the army this spec builds.
- *Tithe-Reaper Echelon* (Mortisan Soulreaper, 2×10 Mortek Guard, 5 Kavalos Deathriders, Gothizzar Harvester; listed 2026-02-18,
  PDF re-saved 2026-04-08, pages numbered 85–87 of the Fire and Jade book, `eng_aos_spearhead_fire_and_jade_obr-x8j1lrc6kr-slfvyoftwm.pdf`).
  This is the old Vanguard-box line-up. Recorded in **Appendix A**.
- *Kavalos Vanguard* (Liege-Kavalos, 2×5 Kavalos Deathriders, 8 Teratic Cohort; listed 2026-02-18, flagged new, PDF created
  2026-01-14, `eng_18-02_aos_spearhead_ossiarch_bonereapers_kavalos_vanguard-jbqptot5r8-wv7o91pzot.pdf`). This is a cavalry list built
  from separate kits, not a box. Recorded in **Appendix B**.

RULING: build Mortisan Elite. Both other armies are recorded in full so they can be added later without reopening their PDFs
(they are not saved to `docs/sources/`; re-download them from the URLs above, prefix `https://assets.warhammer-community.com/`).

Mechanics and numbers are ported 1:1. All wording below is our own. Rule IDs `OBR-*` double as test IDs (§9).

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of an
enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run = `advance`,
Retreat = `fallBack`. Rend is stored as `AP` (negative = more Rend); a printed Rend "-" is 0. "Ward (N+)" maps to the datasheet
`stats.ward` / the engine's `feelNoPain: N` (CORE-13.2: only the best ward counts).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `ossiarch.unit.mortisan-ossifector` | Mortisan Ossifector | 1 | **General** | no | 32 round (Wahapedia) |
| `ossiarch.unit.immortis-guard` | Immortis Guard | 3 | Unit | no | 50 round (Wahapedia) |
| `ossiarch.unit.necropolis-stalkers` | Necropolis Stalkers | 3 | Unit | no | 50 round (Wahapedia) |
| `ossiarch.unit.morghast-archai` | Morghast Archai | 2 | Unit (starts in reserve, OBR-BT-1) | no | 60 round (Wahapedia) |

Total: 4 units, 9 models, 41 Health. One Hero (the general), who is also the only **Wizard**. No Priest, no ranged weapons, no
weapon abilities on any printed profile, no Reinforcements anywhere (Call for Reinforcements never applies). **Every unit has a
printed Ward (6+).** Only the Morghast Archai have Fly.

---

## 2. Battle traits

### OBR-BT-1 `ossiarch.ability.heralds-of-nagash` — Heralds of Nagash (set-up rule) + `ossiarch.ability.dread-descent` — Dread Descent
- **Set-up:** the Morghast Archai unit is **not deployed** in the deployment phase; it waits in reserve.
- **Dread Descent** — Once per turn (army), **your movement phase**, from **battle round 2** onwards: set the Morghast Archai up
  **anywhere on the battlefield**, every model **more than 6" from every enemy unit**.
- Notes: the same shape as Nurgle's Daemonic Summoning, Seraphon's Chameleon Ambush and Ironjawz 'Ere We Go, only from round 2.
  RULING: core reserve destruction (CORE-4.14 / SPH-7.3) applies as for those armies: still in reserve at the start of round 4 =
  destroyed. Set up this turn = no Move abilities this phase (CORE-6.13); it may still charge. No Core keyword is printed.

### OBR-BT-2 `ossiarch.ability.relentless-discipline` — Relentless Discipline
- **Timing:** **Once per phase (army)**. The header names no phase: it can be used in any phase, but each effect below names the
  phase it works in, so in practice it is used in **your movement phase**, **your charge phase** and **any combat phase**.
- **Declare:** pick a friendly unit (on the battlefield).
- **Effect:** make a **discipline roll** of D6, **+1 if the target is wholly within 12" of your general**. On **4+** pick one effect
  that matches the current phase:
  - *Your movement phase:* **+2" Move** for the target for the rest of the phase.
  - *Your charge phase:* **+1 to charge rolls** for the target for the rest of the phase.
  - *Any combat phase:* **+1 to wound rolls** for the target's **combat attacks** for the rest of the phase.
  - *Any combat phase:* the target has **Ward (5+)** for the rest of the phase.
- On 1–3 nothing happens, and the use is still spent.
- "Discipline roll" is a term of this army only. Its modifiers: +1 wholly within 12" of the general (this rule), +1 Immaculate
  Generalship (OBR-RA-2), +1 for the Morghast while **not** wholly within 12" of the general (OBR-AB-5). RULING: it is not a hit,
  wound or save roll, so an unmodified 1 does **not** auto-fail; with +2 or +3 a roll of 1–2 can still succeed.

---

## 3. Regiment abilities (pick 1 at army selection)

### OBR-RA-1 `ossiarch.ability.peerless-cohesion` — Peerless Cohesion
- **Timing:** Once per turn (army), **reaction: you declared Relentless Discipline**.
- **Effect:** you may use Relentless Discipline **a second time this phase**, but it must target a **different unit** from the first use.
- Net effect: one extra Relentless Discipline per turn (not per phase), in the same phase as the first one.

### OBR-RA-2 `ossiarch.ability.immaculate-generalship` — Immaculate Generalship
- **Timing:** Passive.
- **Effect:** **+1 to every discipline roll** you make.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `ossiarch.enh.shard-storm` | Shard Storm | Your hero phase | Declare: a **visible enemy unit within 12"** of the general; casting roll 2D6. On **7+**: roll one D6 per model in the target unit; each **5+** = **1 mortal damage** to it. |
| `ossiarch.enh.mend-constructs` | Mend Constructs | Your hero phase | Declare: a **visible friendly unit wholly within 12"** of the general; casting roll 2D6. On **6+**: **Heal (D3)** the target. |
| `ossiarch.enh.lode-of-saturation` | Lode of Saturation | Passive | **−1 Rend** (to a minimum of 0) for **melee weapons** used for **combat attacks** that target the general. |
| `ossiarch.enh.helm-of-tyranny` | Helm of Tyranny | Once per battle, **end of your turn** | Declare: an **enemy unit within 12"** of the general; roll a D6. On **3+**: **−3 to its control score** for the rest of the turn. |

RULING (as Skaven Skitterleap, Lumineth Guide the Gusts, Soulblight Spirit Gale): Shard Storm and Mend Constructs ask for a
casting roll but print no Spell keyword. A casting roll only exists for spells, so both are **Spells** with casting values 7 and 6:
double 1 miscasts (CORE-15.4), an enemy Wizard may unbind (engine auto-unbind, LRL ruling), and they share the general's one
spell per hero phase with Refined Creations (OBR-MAG-1). No printed once-per limit, so CORE-3.4 (once per phase) applies.

Helm of Tyranny timing [RULING]: end-of-turn abilities resolve before the end-of-turn control check (reducer `endTurnChain`:
abilities, then `evaluateControl('turnEnd')`, then scoring), so the −3 counts for **this** turn's control and scoring. The engine's
control-score floor (CORE-17.4) still applies.

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Printed keywords only (Spearhead warscrolls print no faction keywords; the
datasheets carry `factionKeywords: ["DEATH", "OSSIARCH BONEREAPERS"]`).

### 5.1 `ossiarch.unit.mortisan-ossifector` — Mortisan Ossifector (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 5 | 4+ | 2 | 6+ (5+ within 3" of the Immortis Guard, OBR-AB-2) |

Keywords: **Hero, Wizard, Infantry, Ward (6+)** (Wizard without a number = Wizard (1), one spell per phase)

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Ossified Talons (`ossiarch.weapon.ossified-talons`) | Melee | — | 3 | 4+ | 4+ | — | 2 | — |

**OBR-AB-1 `ossiarch.ability.refined-creations` — Refined Creations** (Spell, casting value 5)
- **Timing:** Your hero phase (once per phase for this unit, CORE-3.4).
- **Declare:** a **visible friendly unit wholly within 12"** of this unit (this unit itself included), then a casting roll of 2D6.
- **Effect:** on **5+**, the target's **melee weapons have Crit (2 Hits)** until the **start of your next turn**.
- RULING: no Spell keyword is printed; the casting roll makes it a spell (see §4). No weapon in this army has another crit ability,
  so no `critChoice` ever arises inside the army.

### 5.2 `ossiarch.unit.immortis-guard` — Immortis Guard
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 4 | 3+ | 1 | 6+ |

Keywords: **Infantry, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Dread Halberd (`ossiarch.weapon.dread-halberd`) | Melee | — | 3 | 3+ | 3+ | 1 | 2 | — |

**OBR-AB-2 `ossiarch.ability.soulbound-protectors` — Soulbound Protectors**
- **Timing:** Passive.
- **Effect:** your **general** has **Ward (5+)** while it is **within this unit's combat range** (within 3" of any Immortis Guard model).

### 5.3 `ossiarch.unit.necropolis-stalkers` — Necropolis Stalkers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 4 | 4+ | 1 | 6+ |

Keywords: **Infantry, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Stalker Blades (`ossiarch.weapon.stalker-blades`) | Melee | — | 4 | 3+ | 3+ | 2 | 1 | — |

**OBR-AB-3/4 `ossiarch.ability.switch-aspects` — Switch Aspects**
- **Timing:** Any combat phase (once per phase for this unit, CORE-3.4).
- **Effect:** pick one, lasting for the **rest of the turn**:
  - **Blade-parry Aspect** (OBR-AB-3): **−1 to hit** for **combat attacks** that target this unit.
  - **Destroyer Aspect** (OBR-AB-4): **no ward rolls** may be made against damage points inflicted by this unit's **combat attacks**.
- A later use in the same turn (the opponent's combat phase is a different turn) picks again; within one turn it can only be used
  once (it is once per phase and each turn has one combat phase).

### 5.4 `ossiarch.unit.morghast-archai` — Morghast Archai
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 10" | 6 | 3+ | 2 | 6+ |

Keywords: **Infantry, Fly, Ward (6+)** (no Monster, no Hero)

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Spirit Weapons (`ossiarch.weapon.spirit-weapons`) | Melee | — | 3 | 3+ | 2+ | 2 | 3 | — |

**OBR-AB-5 `ossiarch.ability.morghast-heralds` — Heralds of Nagash (warscroll)**
- **Timing:** Passive.
- **Effect:** **+1 to discipline rolls for this unit** (Relentless Discipline targeting it) while it is **not wholly within 12"** of your
  general. Together with OBR-BT-2's own +1 inside 12", the Morghast always roll with at least +1.
- Name clash: the battle trait (OBR-BT-1) and this warscroll rule print the same name; the ids keep them apart.

---

## 6. Spells and prayers

Three spell-like abilities, all cast by the Ossifector (the general): Refined Creations (OBR-AB-1, casting value 5) and, if taken,
Shard Storm (7) or Mend Constructs (6). The Ossifector is Wizard (1): **one spell per hero phase**, so the enhancement spell competes
with Refined Creations. No lore, no prayers, no manifestations (SPH-13.2).

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/ossiarch/*.json`), at most a bare-name hook or an existing hook reused with
params; (b) = new faction code hook in `src/engine/factions/ossiarch.ts` (registered in `code-hooks.ts` as `...ossiarchHooks`);
(c) = needs an engine change outside the faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, printed Ward (6+) | (a) | Datasheets as the other armies: `HERO`, `WIZARD`, `INFANTRY`, `FLY`; `stats.ward: 6` on all four (Nighthaunt / Fyreslayers datasheets). `factionKeywords ["DEATH", "OSSIARCH BONEREAPERS"]`. Bases round 32 / 50 / 50 / 60. No weapon abilities. |
| Fly (Morghast) | (a) | Existing FLY handling in `phases/movement.ts` / `phases/charge.ts`. |
| OBR-BT-1 Heralds of Nagash / Dread Descent | (a) | Copy of Nurgle Daemonic Summoning: passive `heralds-of-nagash` marker in `battleTraits` (text only) + activated `dread-descent` (`phase movement / your`, `limit oncePerTurnArmy`, `fromRound: 2`, `params { fromRound: 2, minEnemyDistance: 6, anywhere: true }`, no CORE keyword). Patrol entry `morghast-archai` carries `reserve: { ability: 'ossiarch.ability.dread-descent' }`. Movement's reserve-arrival step and the round-4 reserve destruction do the rest. |
| OBR-BT-2 Relentless Discipline | (b) `ossiarchRelentlessDiscipline` | One hook behind **three** activated battle-trait descriptors (one per phase, so each window offers only the effects that work there): `relentless-discipline` (`phase movement / your`, `params.window 'moveDeclared'`: offered after a unit declares a Normal Move / Run / Retreat, before the Run roll; the target is that unit, `readDeclaredMove`), `relentless-discipline-charge` (`phase charge / your`, `params.window 'phaseStart'`: the F10 `chargeStart` window before any charge is picked; any friendly unit on the board) and `relentless-discipline-combat` (`phase fight / any`, offered in the start-of-combat windows `fight:active` / `fight:enemy`; `modes [wound, ward]`). All three carry `keywords ['UNLIMITED']`, `params.army: true` and **no data limit**: the hook enforces once per phase (army) itself by the phase mark `obr:rd:<n>` holding the target ids used this phase (`canUse` = no entry yet, or one entry and Peerless Cohesion available, see OBR-RA-1). Resolve: `ctx.roll` D6 (purpose `ability`), add `+1` if `whollyWithinUnit(target, general, 12)`, `+1` if the player's regiment is Immaculate Generalship, `+1` if the target holds `ossiarch.ability.morghast-heralds` and is not wholly within 12" of the general (no general = that +1 applies, the first does not); on total ≥ 4 grant scope self, `duration 'untilEndOfPhase'`: movement `{ modifyStat: { stat: 'M', value: 2 } }`, charge `{ modifyRoll: { roll: 'charge', value: 1 } }`, combat mode wound `{ when: { weaponType: 'melee' }, modifyRoll: { roll: 'wound', value: 1 } }`, mode ward `{ feelNoPain: 5 }`; push the target id to the mark either way; announce roll, total and effect. |
| OBR-RA-1 Peerless Cohesion | (b) `ossiarchPeerlessCohesion` | Marker hook like Ironjawz A Proper Ruckus / Soulblight Grave-Sand Shard: the `youDeclared` reaction (`abilityId 'ossiarch.ability.relentless-discipline'`, `limit oncePerTurnArmy`) is never offered by the loop. Instead `ossiarchRelentlessDiscipline.canUse` allows a second use in a phase when the player's `regimentAbilityId` is Peerless Cohesion and its ability has no use this turn in `players[p].abilityUses`; `targets` then excludes the ids in `obr:rd:<n>`; choosing it pushes the Peerless Cohesion ability use (the ledger). |
| OBR-RA-2 Immaculate Generalship | (a) | Passive regiment marker (text only); read by `ossiarchRelentlessDiscipline` (`state.players[p].regimentAbilityId`). |
| OBR-ENH Shard Storm | (b) `ossiarchShardStorm` | Enhancement, `phase command / your`, `keywords ['SPELL']`, `castingValue 7`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params { range: 12, succeedOn: 5 }`. `targets` = enemy units on the board within 12" (`unitGap`) of the bearer and visible (`losService.unitVisible`). abilities.ts routes `castingValue` through `magic.castingRoll` and resolves only on a cast. Resolve: roll `liveModels(target).length` D6 (purpose `ability`), count 5+, `inflictMortal(ctx, use, target, n)` when n > 0, announce. |
| OBR-ENH Mend Constructs | (b) `ossiarchMendConstructs` | Enhancement, `phase command / your`, `keywords ['SPELL']`, `castingValue 6`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { range: 12, heal: 'D3' }`. `targets` = visible friendly units `whollyWithinUnit(target, bearer, 12)` (the general included) that are damaged (`isDamaged`). Resolve: `healUnit(ctx, target, ctx.rollExpr('D3'), use.abilityId)`, announce. |
| OBR-ENH Lode of Saturation | (a) | Passive enhancement, `scope { who: 'attacker' }` (target-held: the holder is the attacked general, hooks-impl `partyFor`), `effect { when: { weaponType: 'melee' }, modifyStat: { stat: 'AP', value: 1 }, affectsCompanion: true }`. `effectiveWeapon` is called with the attack context (attack.ts 392 / 476), so target-held scopes resolve; `weapons.ts` clamps Rend at 0. `affectsCompanion` because this is an **enemy** ability for the attacker, and CORE-12.4 lets enemy abilities change Companion weapons. If the target-held scope does not reach `onStatQuery` for an enhancement, fall back to (b) `statDelta` returning +1 on `q.stat 'AP'` when `q.attack?.targetUnitId` is the bearer's unit and the weapon is melee (Sylvaneth Head of the Hunt pattern). |
| OBR-ENH Helm of Tyranny | (b) `ossiarchHelmOfTyranny` | Enhancement, `endOfTurn / your`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params { range: 12, control: 3, succeedOn: 3 }`. `targets` = enemy units on the board within 12" of the bearer (no visibility needed). Resolve: D6; on 3+ grant the target an empty marker effect (`duration 'untilEndOfTurn'`, code `ossiarchHelmOfTyranny`); `producesAt ['onObjectiveControl']`, `produce` returns `{ kind: 'stat', delta: -params.control }` for the marked unit (Kruleboyz All Part of Da Plan, sign flipped; Lumineth Scattered to the Winds for a negative delta). |
| OBR-AB-1 Refined Creations | (b) `ossiarchRefinedCreations` | Datasheet ability, `phase command / your`, `keywords ['SPELL']`, `castingValue 5`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { range: 12 }`. `targets` = visible friendly units `whollyWithinUnit(target, self, 12)` plus self. Resolve: `effectService.grant(ctx, target, { when: { weaponType: 'melee' }, grantWeaponAbility: { ability: 'CRIT_2_HITS' } }, { scope: { who: 'self' }, duration: 'untilNextTurn' })` (Khorne / Seraphon grant pattern; no `affectsCompanion`: no Companion weapons in the army). |
| OBR-AB-2 Soulbound Protectors | (a) | Reuse the existing `nighthauntDrawnToWar` hook (Nighthaunt AB-2: `adjustFeelNoPain` gives the holder player's general `params.ward` while `unitGap(general, holder) <= params.range`) on a passive Immortis Guard descriptor with `params { range: 3, ward: 5 }`. If cross-faction reuse is unwanted, copy it as `ossiarchSoulboundProtectors` (b) with the same body. |
| OBR-AB-3 Switch Aspects: Blade-parry | (b) `ossiarchSwitchAspects` | Activated datasheet ability, `phase fight / any`, `modes [{ id: 'parry' }, { id: 'destroyer' }]`, no declare (self). Parry: grant self `{ when: { weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: -1 } }` with `scope { who: 'attacker' }`, `duration 'untilEndOfTurn'` (Kruleboyz line 236 grants a target-side effect the same way). Hit modifiers cap at ±1. |
| OBR-AB-4 Switch Aspects: Destroyer | (b) + (c) C1 | Destroyer mode: write the turn mark `obr:destroyer:<unitId>` (marks cleared at turn end via a `untilEndOfTurn` empty marker effect on the Stalkers carrying the code, so a source entry exists). `forbidsWard(state, entry, info)` (C1) answers true when `entry.holderUnitId === info.attackerUnitId`, the mark is present and `info.kind === 'melee'` (Crit (Mortal) pools of combat attacks keep kind melee). |
| OBR-AB-5 Heralds of Nagash (warscroll) | (a) | Passive marker on the Morghast datasheet (text only); read by `ossiarchRelentlessDiscipline`. |
| OBR-MAG-1 Wizard (1), casting | (a) | `magic.ts` `wizardLevel` reads the WIZARD keyword = 1 spell per phase; `castingRoll` (2D6, miscast on double 1), auto-unbind by enemy Wizards within 30". |

**Engine changes (c):**
- **C1 attacker-side ward denial** (`code-hooks.ts` EngineCodeHook additive, `hooks-impl.ts` HookQueries additive, `attack.ts`):
  `forbidsWard?(state: GameState, entry: HookSourceEntry, info: { wardedUnitId: UnitId; attackerUnitId: UnitId; kind: DestroyedBy['kind'] }): boolean`,
  asked of every source entry on the board (ActiveEffects included) after its gate, through
  `hookService.wardForbidden(state, info): boolean`. `wardThreshold(ctx, unitId, rep, mortal, attackerUnitId)` gains a
  `kind: DestroyedBy['kind'] | null` argument (`resolvePool` passes `pool.by.kind`; `feelNoPainFor` passes null) and returns `null`
  (no ward roll at all) when `attackerUnitId` and `kind` are set and `wardForbidden` says so. It is the attacker-side twin of the
  card flag `noWard` (Seraphon Savage Mauling, `cardWard`), which denies every ward of the target unit. No frozen contract changes.

---

## 8. Engine notes

1. **Ward sources:** printed Ward (6+) (every unit), Soulbound Protectors (5+, the general within 3" of the Immortis Guard),
   Relentless Discipline ward mode (5+, one combat phase). Only the best one counts; none stacks.
2. **Relentless Discipline windows** [approximation]: the PDF lets it be used at any point of the phase. The engine offers the
   movement effect only when a unit has just declared its move (that unit is the target), the charge effect only at the start of the
   charge phase, and the combat effects only in the start-of-combat windows (both players, active first). Using it later in those
   phases could never do more than this, except reacting to the order of combat picks. [approximation] The effect is chosen with the
   declaration (data `modes`), before the discipline roll; the printed order rolls first. The roll does not depend on the choice, so
   the outcome is the same.
3. **Discipline roll** [RULING]: success is the modified total ≥ 4, with no unmodified-1 failure (§2). The roll is a plain ability
   roll: no re-rolls from core abilities.
4. **Peerless Cohesion** [RULING]: once per turn means one extra use per turn. The second use must be in the same phase as the first
   and on a different unit; the first target may not be picked again that phase.
5. **Dread Descent**: rounds 2 and 3 only in practice (reserve destruction at the start of round 4). The Morghast are an empty slot
   for the first battle round: Relentless Discipline cannot target them and enemy abilities cannot reach them while in reserve.
6. **Destroyer Aspect** [RULING]: it removes ward rolls only against this unit's combat attacks (normal and crit-mortal damage of
   those attacks), not against mortal damage from other sources, and it does not touch saves.
7. **Spells:** one cast per hero phase for the Ossifector. Refined Creations on 5+ is the default cast; Shard Storm (7+) and Mend
   Constructs (6+) replace it when better.
8. **Refined Creations** [RULING]: "wholly within 12" of this unit" includes the Ossifector itself (as Nighthaunt Discorporate). The
   Crit (2 Hits) lasts through the opponent's turn and ends at the start of your next turn.
9. **AI:** Relentless Discipline — movement: the first unit that declares a move toward an objective or enemy more than its Move
   away; charge: the friendly unit with the most expected melee damage whose needed roll is 7+; combat: ward on the friendly unit in
   combat with the most enemy melee attacks against it, else +1 wound on the friendly unit with the most melee attacks in combat;
   always take the Peerless Cohesion second use. Switch Aspects — Destroyer when the Stalkers' combat targets have a ward, else
   Blade-parry when they are in combat. Refined Creations — the Morghast or Stalkers in or near combat, else Immortis Guard. Shard
   Storm — the enemy unit with the most models. Mend Constructs — the most damaged friendly unit when damage ≥ 2. Helm of Tyranny
   — the enemy unit contesting the objective the player most nearly controls. Dread Descent — round 2, more than 6" from enemies,
   nearest to an objective the enemy holds.
10. **Defaults for the sim:** regiment Immaculate Generalship and enhancement Lode of Saturation come first; Peerless Cohesion and
    Helm of Tyranny are the last entries in the patrol lists and so the sim's variant games.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| OBR-ARMY-1 | Mortisan Elite builds: Ossifector general + 3 Immortis Guard + 3 Necropolis Stalkers + 2 Morghast Archai, 9 models, stats and weapons as §5. |
| OBR-ARMY-2 | Every unit has Ward (6+); only the Morghast have Fly; no unit can be replaced by Call for Reinforcements. |
| OBR-BT-1 | Heralds of Nagash / Dread Descent: the Morghast are not deployed; arrival is offered in your movement phase from round 2 (not round 1), every model more than 6" from enemies, anywhere on the board; still in reserve at the start of round 4 = destroyed. |
| OBR-BT-2 | Relentless Discipline roll: D6 + 1 when the target is wholly within 12" of the general; 4+ applies the effect, 3 does nothing; once per phase for the army. |
| OBR-BT-3 | Movement effect: +2" Move for that unit for the rest of the phase (Run allowance includes it). |
| OBR-BT-4 | Charge effect: +1 to that unit's charge roll this phase. |
| OBR-BT-5 | Combat effect (wound): +1 to wound for its melee attacks this phase, in either player's combat phase. |
| OBR-BT-6 | Combat effect (ward): Ward (5+) this phase; it replaces the printed 6+ (best ward only). |
| OBR-RA-1 | Peerless Cohesion: a second Relentless Discipline in the same phase on a different unit; the first target cannot be picked again; only once per turn. |
| OBR-RA-2 | Immaculate Generalship: +1 to discipline rolls (stacks with the 12" bonus: a 2 succeeds wholly within 12"). |
| OBR-ENH-1 | Shard Storm: casting 7+ rolls one D6 per model of a visible enemy within 12"; each 5+ is 1 mortal damage; below 7 nothing. |
| OBR-ENH-2 | Mend Constructs: casting 6+ heals D3 on a visible friendly unit wholly within 12"; slain models do not return. |
| OBR-ENH-3 | Lode of Saturation: a Rend 2 melee attack on the general resolves at Rend 1, Rend 1 at 0, Rend 0 stays 0; ranged attacks unaffected; Companion weapons affected. |
| OBR-ENH-4 | Helm of Tyranny: once per battle at the end of your turn, on 3+ an enemy unit within 12" has −3 control score for that turn's control check; gone next turn. |
| OBR-AB-1 | Refined Creations: casting 5+ gives a friendly unit wholly within 12" (or the Ossifector) Crit (2 Hits) on melee weapons until your next turn. |
| OBR-AB-2 | Soulbound Protectors: the general has Ward (5+) within 3" of the Immortis Guard and 6+ beyond. |
| OBR-AB-3 | Switch Aspects (Blade-parry): −1 to hit for melee attacks on the Stalkers for the rest of the turn; ranged attacks unaffected. |
| OBR-AB-4 | Switch Aspects (Destroyer): no ward rolls against the Stalkers' melee damage this turn; wards against other units' attacks still roll. |
| OBR-AB-5 | Morghast Heralds of Nagash: +1 to the Morghast's discipline roll when not wholly within 12" of the general; inside 12" only the trait's own +1. |
| OBR-MAG-1 | The Ossifector casts one spell per hero phase (Refined Creations or the enhancement spell); a double 1 miscasts; an enemy Wizard may unbind. |
| OBR-FLY-1 | The Morghast move over other models (Fly). |
| OBR-REG | Every `code` in the Ossiarch data resolves to a registered hook (activated ones with an `activate` block). Not a rules id. |
| OBR-AI | Utility hints (`ossiarchAbilityTiming`, `ossiarchTargetBonus`, wired in `src/ai/utility.ts`) and whole AI games against Cities with every regiment ability and enhancement. Not a rules id. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own bone-legion livery): polished ivory and warm bone for skulls, ribs and limbs; deep midnight-blue
lacquered armour plates with dull bronze rims; glowing verdigris-teal blades, eye-lights and soul-gems as the accent colour; dark
oxblood-red cloth strips. Shared motif: an original faceted teal soul-gem set in a bone ring, worn on chests and weapon hilts. No GW
logos, no copied Ossiarch or Nagash icons. All figures are **true MGSD** chibis (~2.5 heads tall, huge skull head, stubby legs);
glowing effects are **solid, opaque sculpted shapes** (no see-through materials, no transparency).

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `obr-mortisan-ossifector` | Mortisan Ossifector | 1 | 32 round | No | A true MGSD chibi bone-sculptor mage, 2.5 heads tall with a huge elongated skull wearing a tall spiked bone crown, teal eye-lights, a midnight-blue robe with oxblood sash, four stubby bony arms (two holding a chisel and a little femur wand), and a solid teal ribbon of sculpted soul-mist coiling up from the base around its legs. |
| `obr-immortis-guard` | Immortis Guard | 1 (×3) | 50 round | No | A chunky true MGSD chibi bone bodyguard, 2.5 heads tall and extra broad, with a huge horned skull helm, glowing teal eye-slits, a big midnight-blue rib-shaped tower shield in one stubby arm and an oversized teal-bladed halberd in the other, oxblood loincloth, short sturdy bone legs. |
| `obr-necropolis-stalker` | Necropolis Stalkers | 1 (×3) | 50 round | No | A true MGSD chibi four-armed bone duelist, 2.5 heads tall with a huge cluster of three cartoon skull faces on one head, each with teal eye-lights, four stubby arms each gripping a curved teal sword, midnight-blue shoulder plates and a tattered oxblood tabard, crouched on short bony legs. |
| `obr-morghast-archai` | Morghast Archai | 1 (×2) | 60 round | No | A true MGSD chibi winged bone herald, 2.5 heads tall with a huge horned skull under a tall bronze-rimmed midnight-blue helm, two chunky stubby bone wings with solid teal sculpted feather-shards, a long teal-bladed glaive held in both stubby arms, oxblood cloth strips, standing on short clawed bone legs. |

Immortis Guard, Stalkers and Morghast each use one sculpt per unit (the kits' weapon options are not rules variants in this
Spearhead). No champion or standard variants: the Spearhead gives them no rules.

---

## Appendix A — Tithe-Reaper Echelon (separate PDF; out of scope)

Source: "Spearhead: Ossiarch Bonereapers - Tithe-Reaper Echelon" (4 pages, 18.0 MB, PDF created 2026-04-08, listed 2026-02-18), the
URL above; not saved to `docs/sources/`. Bases from Wahapedia (same day). Army id if built: `ossiarch.army.tithe-reaper-echelon`.

**Roster:** Mortisan Soulreaper (**General**, 1), Mortek Guard (10) ×2, Kavalos Deathriders (5), Gothizzar Harvester (1). 27 models.
No unit has the Reinforcements keyword. Every unit has Ward (6+).

**Battle traits**
- *Reserve Contingent* (set-up rule): one Mortek Guard unit starts in **reserve**. From battle round 3: **Contingent Arrival** — your
  movement phase, keyword **Core**: set it up wholly within 3" of a battlefield edge and more than 6" from every enemy unit
  (`PlaceRequest` edge band + `minEnemyDistance`, the 'Ere We Go shape).
- *Ossiarch Commands* (resource): at the start of each battle round you get **2 Ossiarch command points**; each Ossiarch Command costs
  1; the same unit cannot use more than one Ossiarch Command per phase; unspent points are lost at the end of the round. (Needs a
  per-player point pool; `resourceReadout` can show it.)

**Regiment abilities (pick 1)** — both are Ossiarch Commands.
- *Impenetrable Ranks* — once per battle, any combat phase: pick a friendly unit; **+1 to its ward rolls** until the end of the phase.
- *Re-form Ranks* — once per battle, your movement phase: pick a friendly Mortek Guard unit in combat; it may Retreat this phase with
  no Retreat mortal damage.

**Enhancements**
- *Empower Nadirite Weapons* — your hero phase: a visible friendly Mortek Guard unit wholly within 12" of the general; casting roll
  2D6; on 5+, **+1 Rend** on its melee weapons until the start of your next turn.
- *Unstoppable Commander* — your movement phase: a friendly Mortek Guard unit wholly within 12" of the general; D6; on 2+, **+3" Move**
  this phase.
- *Murderous Drive* (passive): the general's Soulreaper Scythe has **Crit (2 Hits)**.
- *Marrowpact* (passive): each time the general uses a Fight ability, after its attacks, **Heal (X)** the general, X = damage points
  those attacks allocated (`onOwnFightResolved`, the Soulblight shape).

**Warscrolls** (Move / Health / Save / Control / Ward; keywords as printed)

| Unit | M | H | Sv | Ctrl | Ward | Keywords | Base (mm) |
|---|---|---|---|---|---|---|---|
| Mortisan Soulreaper | 5" | 5 | 4+ | 2 | 6+ | Hero, Wizard, Infantry | 32 round |
| Mortek Guard | 4" | 1 | 4+ | 1 | 6+ | Infantry | 25 round |
| Kavalos Deathriders | 10" | 3 | 4+ | 1 | 6+ | Cavalry | 60×35 oval |
| Gothizzar Harvester | 6" | 10 | 4+ | 5 | 6+ | Monster | 105×70 oval |

| Weapon (unit) | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Soulreaper Scythe (Soulreaper) | Melee | — | 3 | 4+ | 3+ | 2 | 2 | — |
| Nadirite Spear (Mortek Guard) | Melee | — | 2 | 3+ | 4+ | — | 1 | Anti-charge (+1 Rend) |
| Nadirite Spear (Deathriders) | Melee | — | 3 | 3+ | 4+ | 1 | 1 | Charge (+1 Damage) |
| Kavalos Steed's Hooves and Teeth (Deathriders) | Melee | — | 2 | 5+ | 3+ | — | 1 | Companion |
| Death's Head Maw (Harvester) | Ranged | 12" | 4 | 4+ | 4+ | 1 | 1 | — |
| Soulcrusher Bludgeons (Harvester) | Melee | — | 6 | 4+ | 2+ | 2 | 2 | — |
| Ossified Hooves and Tail (Harvester) | Melee | — | 4 | 4+ | 3+ | 1 | 2 | — |

**Warscroll abilities**
- Soulreaper, *Drain Vitality* — your hero phase, spell: a visible enemy unit within 18"; casting roll 2D6; on 6+, −1 to hit for its
  attacks until the start of your next turn.
- Soulreaper, *Reknit Construct* — your movement phase, Ossiarch Command: a friendly unit wholly within 12" and not in combat; Heal (D3)
  it, or, if it is undamaged, return slain models whose combined Health is D3 or less.
- Mortek Guard, *Nadirite Assault* — any combat phase, Ossiarch Command: its melee weapons have Crit (2 Hits) until the end of the phase.
- Deathriders, *Deathrider Wedge* — your charge phase, Ossiarch Command: this phase it may pass across enemy Infantry as if it had Fly
  (`passAcrossKeyword`), and after it charges you may pick an enemy unit it passed across and roll a D6; on 2+, D3 mortal damage to it.
- Harvester, *Bone Harvest* (passive) — each time an enemy model in combat with it is slain, it gains 1 bone-tithe point (max 6).
- Harvester, *Repair Construct* — end of any turn: a friendly Mortek Guard unit within 6"; roll a D6 per bone-tithe point; each 4+
  returns 1 slain model; then reset the points to 0.

Figures, if built later: `obr-mortisan-soulreaper`, `obr-mortek-guard`, `obr-kavalos-deathrider` (a mount: chunky SD bone horse),
`obr-gothizzar-harvester` (a monster: chunky toy-like SD four-legged bone beast), in the §10 palette.

---

## Appendix B — Kavalos Vanguard (separate PDF; out of scope)

Source: "Spearhead: Ossiarch Bonereapers - Kavalos Vanguard" (4 pages, 9.6 MB, PDF created 2026-01-14, listed 2026-02-18), the URL
above; not saved to `docs/sources/`. Bases from Wahapedia (same day). Army id if built: `ossiarch.army.kavalos-vanguard`.

**Roster:** Liege-Kavalos (**General**, 1), Kavalos Deathriders (5) ×2, Teratic Cohort (8: 1 Kavalos Centari, 2 Mortek Cykloptians,
5 Teratic Prowlers and Aviarch Harpies). 19 models. Only the Teratic Cohort has Reinforcements. Every unit has Ward (6+).

**Battle traits**
- *Calculated Feint* (passive): Retreat abilities inflict no mortal damage on friendly **Cavalry** units.
- *Kavalos Lance* — once per turn (army), your hero phase: pick a friendly unit; for the rest of the turn it may pass across enemy
  models as if it had Fly.

**Regiment abilities (pick 1)**
- *Feigned Retreat* — once per battle, your movement phase: for the rest of the turn friendly units may use Charge abilities even after
  a Retreat that turn.
- *Reinforced Constructs* — once per battle, any combat phase: pick a friendly unit; it has Ward (5+) for the rest of the turn.

**Enhancements**
- *Mighty Archaeossian* (passive): the general has Ward (5+).
- *Murderous Blade* (passive): the general's Commander's Blade has Crit (2 Hits).
- *Imperious Commander* — your movement phase: a visible friendly unit wholly within 12" of the general; D6; on 3+, +2" Move for the
  rest of the turn.
- *Cold Savagery* — any combat phase: only if the general did not charge this turn and is in combat; a visible friendly unit wholly
  within 12" of the general; D6; on 3+, +1 Rend on its melee weapons, Companion weapons included, for the rest of the turn.

**Warscrolls** (Move / Health / Save / Control / Ward; keywords as printed)

| Unit | M | H | Sv | Ctrl | Ward | Keywords | Base (mm) |
|---|---|---|---|---|---|---|---|
| Liege-Kavalos | 10" | 7 | 3+ | 2 | 6+ | Hero, Cavalry | 80 round (Wahapedia) |
| Kavalos Deathriders | 10" | 3 | 4+ | 1 | 6+ | Cavalry | 60×35 oval |
| Teratic Cohort | 7" | 1 | 5+ | 1 | 6+ | Beast, Reinforcements | Centari 60×35 oval; Cykloptians 32 round; Prowlers / Harpies 28.5 round |

| Weapon (unit) | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Commander's Blade (Liege) | Melee | — | 5 | 3+ | 4+ | 1 | 2 | Charge (+1 Damage) |
| Kavalos Steed's Hooves, Teeth and Barbed Tails (Liege) | Melee | — | 4 | 5+ | 3+ | — | 1 | Companion |
| Kavalos Blade (Deathriders) | Melee | — | 3 | 3+ | 4+ | 1 | 1 | — |
| Kavalos Steed's Hooves and Teeth (Deathriders) | Melee | — | 2 | 5+ | 3+ | — | 1 | Companion |
| Cohort Weapons (Teratic Cohort) | Melee | — | 2 | 3+ | 4+ | 1 | 1 | — |

**Warscroll abilities**
- Liege-Kavalos, *Signal the Advance* — your hero phase: a visible friendly unit wholly within 12"; D6; on 3+, +1 to its charge rolls
  for the rest of the turn.
- Deathriders, *Wheel About* — any combat phase: if it charged this turn, roll a D6; on 3+ it may move up to its Move, through enemy
  combat ranges, but may not end in combat (`SlideOpts` `passThrough` + `mustEndOutOfCombat`).
- Teratic Cohort, *Bone-deep Savagery* — any movement phase, keywords Core, Move: it may move 3"; if it can move into combat it must;
  if it started in combat it must end in combat.
- Teratic Cohort, Beast (the Wahapedia page notes a control-score cap of 1 for Beast units; the PDF itself prints no such rule).

Figures, if built later: `obr-liege-kavalos` (a mount: chunky SD armoured bone horse), `obr-kavalos-deathrider`, and a mixed
`obr-teratic-cohort` set (centaur, cyclops, prowler and harpy constructs), in the §10 palette.
