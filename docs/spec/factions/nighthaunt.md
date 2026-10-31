# Nighthaunt — Slasher Host (Spearhead)

Faction id: `nighthaunt` · Army id: `nighthaunt.army.slasher-host` · Grand alliance: Death.
Source: `docs/sources/spearhead-nighthaunt.pdf` (4 pages, 9.7 MB, gitignored), "Spearhead: Nighthaunt - Slasher Host", the
free Warhammer Community download (Age of Sigmar, Spearhead category). First listed 2025-11-12, last updated 2026-10-28 (PDF
metadata: created 2026-10-06, modified 2026-10-20). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_28-10_aos_spearhead_nighthaunt_slasher_host-mppoj82i9m-j3gforgl2c.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, body
`{"index":"downloads_v2","searchTerm":"nighthaunt"}`). The PDF prints no base sizes; they come from the Wahapedia aos4 warscroll
pages (`wahapedia.ru/aos4/factions/nighthaunt/Knight-of-Shrouds`, `/Spirit-Hosts`, `/Grimghast-Reapers`, `/Chainrasps`),
fetched the same day with plain curl.

**Which army.** The search returns two separate Nighthaunt Spearhead PDFs (one army each). **Slasher Host** (Knight of Shrouds,
3 Spirit Hosts, 2×5 Grimghast Reapers, 2×10 Chainrasps) is the newer of the two (Nov 2025, matching the current **Spearhead:
Nighthaunt** box), so it is the army this spec builds. **Cursed Shacklehorde** (listed 2025-08-27, last updated 2026-04-29,
`https://assets.warhammer-community.com/eng_29-04_aos_spearhead_nighthaunt_cursed_shacklehorde-br9d6bfwzt-4k0qp3is9x.pdf`) is built
from older kits (Spirit Torment, Chainghasts, Bladegheist Revenants, Dreadscythe Harridans, Dreadblade Harrows). It is out of
scope; its rules are recorded in Appendix A so it can be added later without reopening the PDF.

Mechanics and numbers are ported 1:1. All wording below is our own. Rule IDs `NH-*` double as test IDs (§9).

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of an
enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run = `advance`,
Retreat = `fallBack`. Rend is stored as `AP` (negative = more Rend); a printed Rend "-" is 0. "Ward (N+)" maps to the datasheet
`stats.ward` / the engine's `feelNoPain: N` (CORE-13.2: only the best ward counts).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `nighthaunt.unit.knight-of-shrouds` | Knight of Shrouds | 1 | **General** | no | 32 round (Wahapedia) |
| `nighthaunt.unit.spirit-hosts` | Spirit Hosts | 3 | Unit | no | 50 round (Wahapedia) |
| `nighthaunt.unit.grimghast-reapers` | Grimghast Reapers (×2 units) | 5 each | Unit | no | 32 round (Wahapedia) |
| `nighthaunt.unit.chainrasps` | Chainrasps (×2 units) | 10 each | Unit | **yes** | 25 round (Wahapedia) |

Total: 6 units, 34 models. One Hero (the general); no Wizard, no Priest. **Every unit has Fly and a printed Ward (6+).** No
ranged weapons anywhere in the army, and every weapon has Crit (Auto-wound).

---

## 2. Battle traits

### NH-BT-1 `nighthaunt.ability.ethereal` — Ethereal
- **Timing:** Passive.
- **Effect:** Save rolls for friendly units ignore **all** modifiers, positive and negative.
- [RULING] (core rules 17.0 step 3 and the glossary: the defender subtracts the weapon's Rend from the save roll) Rend is a
  negative modifier to the save roll, so a Nighthaunt save roll is the bare die against the Save characteristic (a 4+ save
  stays 4+ against Rend 2). Bonuses (All-out Defence, card save bonuses) are ignored too; an unmodified 1 still fails. See §8.1.

### NH-BT-2 `nighthaunt.ability.wave-of-terror` — Wave of Terror
- **Timing:** Any charge phase.
- **Declare:** A friendly unit that **charged this phase** with a **charge roll of 10+** uses it; pick an **enemy unit within
  1"** of that unit as the target.
- **Effect:** The target has **Strike-last** for the rest of the turn.
- No army-wide limit: each qualifying friendly unit may use it once per phase (CORE-3.3).

---

## 3. Regiment abilities (pick 1 at army selection)

### NH-RA-1 `nighthaunt.ability.death-stalkers` — Death Stalkers
- **Timing:** Once per battle, at the start of the **first** battle round.
- **Declare:** Pick any enemy unit on the battlefield.
- **Effect:** For the rest of the battle, **melee** weapons used for attacks that target that unit get **+1 Rend**.

### NH-RA-2 `nighthaunt.ability.chorus-of-terror` — Chorus of Terror
- **Timing:** Passive.
- **Effect:** **−1 to hit** for **combat (melee)** attacks that target a friendly unit that **charged this turn**.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `nighthaunt.enh.soulfire-ring` | Soulfire Ring | End of any turn | If the general **slew any models this turn**, **Heal (D6)** the general. |
| `nighthaunt.enh.cloaked-in-shadow` | Cloaked in Shadow | Passive | Each phase, **at most 1 enemy unit** may pick the general as a target for attacks (shooting or combat). |
| `nighthaunt.enh.beacon-of-nagashizzar` | Beacon of Nagashizzar | Once per battle, your hero phase | **Return 1 slain model** to **each** friendly unit on the battlefield. |
| `nighthaunt.enh.shadows-edge` | Shadow's Edge | Passive | The general's **Sword of Stolen Hours** gains **Crit (Mortal)**. |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Printed keywords only (Spearhead warscrolls print no faction keywords; the
datasheets carry `factionKeywords: ["DEATH", "NIGHTHAUNT"]`).

### 5.1 `nighthaunt.unit.knight-of-shrouds` — Knight of Shrouds (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 5 | 4+ | 2 | 6+ (4+ while within 1" of the Spirit Hosts, NH-AB-2) |

Keywords: **Hero, Infantry, Fly, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Sword of Stolen Hours (`nighthaunt.weapon.sword-of-stolen-hours`) | Melee | — | 5 | 4+ | 3+ | 1 | 2 | Crit (Auto-wound) (Crit (Mortal) with Shadow's Edge) |

**NH-AB-1 `nighthaunt.ability.discorporate` — Discorporate**
- **Timing:** Your hero phase (once per phase for this unit, CORE-3.4).
- **Declare:** Pick a friendly unit **wholly within 9"** of this unit (this unit itself included).
- **Effect:** The target has **Ward (5+)** until the start of your next turn.

### 5.2 `nighthaunt.unit.spirit-hosts` — Spirit Hosts
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 3 | 4+ | 1 | 6+ |

Keywords: **Infantry, Fly, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Spectral Claws and Daggers (`nighthaunt.weapon.spectral-claws-and-daggers`) | Melee | — | 6 | 4+ | 4+ | — | 1 | Crit (Auto-wound) |

**NH-AB-2 `nighthaunt.ability.drawn-to-war` — Drawn to War**
- **Timing:** Passive.
- **Effect:** Your **general** has **Ward (4+)** while it is **within 1"** of this unit.

### 5.3 `nighthaunt.unit.grimghast-reapers` — Grimghast Reapers (×2 units)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 1 | 4+ | 1 | 6+ |

Keywords: **Infantry, Fly, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Slasher Scythe (`nighthaunt.weapon.slasher-scythe`) | Melee | — | 2 | 4+ | 3+ | 1 | 1 | Crit (Auto-wound) |

**NH-AB-3 `nighthaunt.ability.reaped-like-corn` — Reaped Like Corn**
- **Timing:** Passive.
- **Effect:** This unit's **combat attacks** score critical hits on an **unmodified hit roll of 5+** (instead of 6) when the
  **target unit has 5 or more models**.

### 5.4 `nighthaunt.unit.chainrasps` — Chainrasps (×2 units)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 1 | 5+ | 1 | 6+ |

Keywords: **Infantry, Fly, Reinforcements, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Malignant Weapon (`nighthaunt.weapon.malignant-weapon`) | Melee | — | 2 | 4+ | 5+ | — | 1 | Crit (Auto-wound) |

**NH-AB-4 `nighthaunt.ability.chilling-horde` — Chilling Horde**
- **Timing:** Passive.
- **Effect:** **+1 to wound** for this unit's **combat attacks** if it **charged this turn**.

---

## 6. Spells and prayers

None. The army has no Wizard or Priest and Spearhead has no lores (SPH-13.2).

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/nighthaunt/*.json`), at most a bare-name hook; (b) = new faction code hook in
`src/engine/factions/nighthaunt.ts` (registered in `code-hooks.ts` as `...nighthauntHooks`); (c) = needs an engine change outside
the faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, printed Ward (6+) | (a) | Datasheets as the other armies: `HERO`, `INFANTRY`, `FLY`, `REINFORCEMENTS`; `stats.ward: 6` on all four (as the Fyreslayers datasheets). `factionKeywords ["DEATH", "NIGHTHAUNT"]`. Bases round 32 / 50 / 32 / 25. |
| Crit (Auto-wound) on every weapon | (a) | `CRIT_AUTO_WOUND` (attack.ts critEntry). |
| Fly (all units) | (a) | Existing FLY handling in `phases/movement.ts` and `phases/charge.ts`. |
| Reinforcements (Chainrasps only) | (a) | Core `spearheadCallForReinforcements`. Knight, Spirit Hosts and Reapers cannot be replaced. |
| NH-AB-4 Chilling Horde | (a) | Passive descriptor, scope self, `{ when: { unitCharged: true, weaponType: 'melee' }, modifyRoll: { roll: 'wound', value: 1 } }` (as the Ironjawz / Gloomspite charge bonuses). |
| NH-ENH Shadow's Edge | (a) + (c) C3 | Passive enhancement, scope bearer, `{ when: { weaponId: 'nighthaunt.weapon.sword-of-stolen-hours' }, grantWeaponAbility: { ability: 'CRIT_MORTAL' } }`. The sword already has `CRIT_AUTO_WOUND`, so it then has two crit abilities: by core 20.0 the attacking player picks one before the attack sequence (C3, built F14: `critChoice` decision; the AI takes Crit (Mortal), the higher expected damage). |
| NH-AB-1 Discorporate | (b) `nighthauntDiscorporate` | Activated, `phase command / your`, declare a friendly unit; `targets` keeps units `whollyWithinUnit(target, self, params.range 9)` plus the Knight itself; resolve grants `params.grant [{ feelNoPain: 5 }]` with `duration untilNextTurn` via `effectService.grant` (scope self), then `announce`. Effects sit in `params.grant`, not `effect`. Built as specified. |
| NH-AB-2 Drawn to War | (b) `nighthauntDrawnToWar` | Datasheet passive on the Spirit Hosts. `adjustFeelNoPain(state, entry, modelId, current)`: when `modelId` belongs to the holder player's general unit (`state.players[p].warlordUnitId`) and `unitGap(general, holder) <= params.range (1)`, answer `{ threshold: Math.min(current ?? 7, params.ward 4), modifier: 0 }` (keep the better ward; hooks-impl folds `threshold = r.threshold ?? threshold`). Asked of every source on the board, so the Hosts' entry answers for the Knight. |
| NH-AB-3 Reaped Like Corn | (b) `nighthauntReapedLikeCorn` | Datasheet passive; `produce` at `onHitRoll` returns `{ kind: 'roll', critThreshold: params.critOn (5) }` when the attacker unit is the holder, the weapon is melee and `liveModels(target).length >= params.minModels (5)` (counted when the hit roll is made). `produce` only answers on an ActiveEffect (hooks-impl `collect`), so `ensureEffects` keeps a battle-long empty marker effect on every Reapers unit (as Stormcast Null Pendant); it runs whenever an ability window opens, which is before any combat. attack.ts `runStage` folds `critThreshold` (min). |
| NH-BT-1 Ethereal | (a) + (c) C1 | Army battle trait, passive descriptor, scope self (it sits on every friendly unit), `effect { ignoreModifiers: 'save' }` (F14 Effect value, defender side: it applies to the holder's own save rolls only). attack.ts then rolls the bare die against the Save characteristic: Rend, card save modifiers and bonuses are all dropped; unmodified 1 fails. No code hook needed. |
| NH-BT-2 Wave of Terror | (b) `nighthauntWaveOfTerror` | Activated army trait, `phase charge / any` (offered in the charge phase's closing `runWindow(ctx, 'charge', p)`, for both players, so a Counter-Charge in the enemy phase counts), keyword `UNLIMITED` (abilities.ts otherwise limits an army-level ability to once per phase, CORE-3.4). Qualifying friendly units: `turn.chargedThisTurn` and `turn.chargeRoll >= params.minRoll (10)` (the **modified** total; see §8.3) and no phase mark `nh:wave:<unitId>`. `canUse` = some qualifying unit has an enemy within 1"; `targets` = enemy units with `unitGap <= params.range (1)` of any qualifying unit. Resolve: pick the qualifying unit closest to the target (ties by id), write its phase mark, set `target.turn.fightsLast = true` (as Skaven Cage of Warp Lightning), announce. [approximation] The friendly user is picked automatically, see §8.3. |
| NH-RA-1 Death Stalkers | (b) `nighthauntDeathStalkers` | Regiment, timing `{ kind: 'startOfRound', whose: 'any' }`, `limit oncePerBattle` (the spec's first draft said oncePerTurnArmy; once per battle is the same thing and cannot be re-offered in a later round window), `canUse` only when `state.round === 1`; declare any enemy unit. Resolve sets `state.players[p].oathTargetUnitId = target` and grants every friendly unit a battle-long ActiveEffect `{ when: { oathTarget: true, weaponType: 'melee' }, modifyStat: { stat: 'AP', value: -params.rend } }` (scope self, read through `hookService.isOathTarget`). The effect has to be an ActiveEffect because the hook dispatcher never walks activated descriptors (hooks-impl `sourcesFor`); `ensureEffects` re-grants it to units that arrive later. Companion weapons: none in this army. |
| NH-RA-2 Chorus of Terror | (a) | Data only, no code hook: a passive regiment descriptor with `scope { who: 'attacker' }` and `effect { when: { unitCharged: true, weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: -1 } }`. `scope attacker` makes the hit modifier a target-side effect (hooks-impl `partyFor`), so the descriptor's holder is the attacked unit and `unitCharged` reads the attacked unit. Capped with other hit modifiers at +-1. |
| NH-ENH Soulfire Ring | (b) `nighthauntSoulfireRing` | Activated, `endOfTurn / any`, no declare (the bearer's unit), no limit. `canUse`: attack.ts `slewInFightThisTurn(state, bearerUnit)` (the turn ledger, F14 C1: combat attacks, Crit (Mortal) pools included, slew an enemy model this turn) and the general is on the board and damaged (`isDamaged`). An `onEnemyModelSlain` ledger is not possible here: hook source entries are never built for activated descriptors, so the hook would never be called. Resolve: roll D6 (`ctx.rollExpr('D6')`), `healUnit(ctx, general, n, use.abilityId)`, announce. |
| NH-ENH Cloaked in Shadow | (b) `nighthauntCloakedInShadow` | Passive enhancement marker (a source entry exists for it). `forbidsShootingTarget` and `forbidsFightTarget` return true when `targetUnitId` is the bearer's unit and attack.ts `firstAttackerThisPhase(state, targetUnitId)` names a different attacker unit; the claim is the `atk:tg:` phase mark `attackService.begin` writes, so no ensureEffects or window is involved. |
| NH-ENH Beacon of Nagashizzar | (b) `nighthauntBeaconOfNagashizzar` | Activated, `phase command / your`, `oncePerBattle`, no declare. `canUse`: some friendly unit on the board has `returnableModels > 0`. Resolve: for each friendly unit on the board, `returnSlainModels(ctx, unitId, params.count (1), use.abilityId)` (aos-common; CORE-6.14 placement, full Health), then announce the total. |

**Engine changes (c):**
- **C1 ignore-all on save drops Rend** (built F14, `13-engine-port-plan.md` §3.12): `Effect.ignoreModifiers` gains `'save'`
  (defender side, `onSaveRoll`); in `runStage`'s save branch an ignore-all gives `final = u` (neither Rend nor any modifier) and an
  ignore-negative drops Rend with the other negative modifiers (core 17.0). Unmodified 1 still fails. The dice tray still shows a
  Rend line for that roll (display only).
- **C2 enemy-model-slain observer** (`code-hooks.ts` EngineCodeHook additive, `attack.ts` next to `ownModelSlain`):
  `onEnemyModelSlain?(ctx: EngineContext, entry: HookSourceEntry, info: { slainUnitId: UnitId; model: Model; by: DestroyedBy }): void`,
  called once per slain model for every source entry **held by** `by.unitId`'s unit (`entry.holderUnitId === by.unitId`), after the
  model is removed. Nothing is called when `by.unitId` is null.
- **C3 crit choice** (built F14): [RULING] core rules 20.0: when more than one of a weapon's abilities would apply on a critical hit,
  the attacking model's controlling player picks one of them before the attack sequence starts. A weapon never uses two on one
  critical hit. The engine asks the attacking player (`chooseOption` topic `critChoice`, options = the abilities, `hint.value` =
  expected damage); the AI takes the highest, which for the Sword of Stolen Hours is Crit (Mortal). The priority order drafted
  here earlier is retired.
- **C4 melee target restriction** (built F14) (`code-hooks.ts` additive, `hooks-impl.ts` `fightTargetForbidden(state, fightingUnitId, targetUnitId):
  boolean`, `phases/fight.ts` `legalTargetsFor` + `validateDeclareTargets`): `forbidsFightTarget?(state: GameState, entry:
  HookSourceEntry, fightingUnitId: UnitId, targetUnitId: UnitId): boolean`, the combat twin of `forbidsShootingTarget`, asked of every
  source entry on the board after its gate. Fallback for the claim record if needed: `applyDeclareTargets` in `fight.ts` and
  `shooting.ts` push the phase mark `atk:tg:<targetUnitId>=<attackerUnitId>` for the first unit that declares attacks on each target
  this phase (marks only). Built generically in `attackService.begin`: `firstAttackerThisPhase(state, targetUnitId)` (attack.ts)
  names the unit that first declared attacks on a target this phase, so Cloaked in Shadow's `forbidsFightTarget` /
  `forbidsShootingTarget` can read it without the ensureEffects claim.
- **C2** `onEnemyModelSlain` is built as specified (F14).

---

## 8. Engine notes

1. **Ethereal and Rend** [RULING]: the warscroll says "ignore all modifiers to save rolls (positive and negative)". Rend is the only
   negative save modifier most attacks carry: core 17.0 step 3 has the defender subtract the weapon's Rend from the save roll and
   the glossary says the same, so Rend is a negative modifier and is ignored (C1). Settled F14 for every rule alike: Soulblight's
   Aura of Night (ignore negative save modifiers) now ignores Rend too. Mortal damage skips the save anyway; wards are not save
   rolls and are untouched.
2. **Ward sources:** printed Ward (6+) (every unit), Discorporate (5+, any unit wholly within 9" of the Knight), Drawn to War (4+,
   the general within 1" of the Spirit Hosts). Only the best one counts.
3. **Wave of Terror** [RULING] "the charge roll was 10+" uses the charge roll **after** modifiers (`turn.chargeRoll`), since the text
   does not say unmodified. [approximation] The data model offers army traits with no user unit, so the target pick is the decision
   and the engine picks the qualifying friendly unit within 1" of it (closest first); each friendly unit can still only use it once
   per phase. Strike-last lasts to the end of the turn and cancels against Strike-first (CORE-10.8).
4. **Death Stalkers** [RULING]: the pick lasts the whole battle. If that unit is destroyed and replaced by Call for Reinforcements,
   the replacement is a new unit and is not marked. Against a Nighthaunt target the +1 Rend does nothing (Ethereal).
5. **Cloaked in Shadow** [RULING]: the first enemy unit that declares attacks targeting the general in a phase claims it; that unit
   may keep targeting it (more models, a second Fight from another ability), every other enemy unit may not pick the general that
   phase. Abilities that inflict mortal damage without an attack are not affected.
6. **Soulfire Ring** [RULING]: "slain by your general" = models whose removal `DestroyedBy.unitId` is the general's unit, by any
   attack or mortal damage it caused this turn. The heal happens once per turn end, even when both players' turns produced kills.
7. **Beacon of Nagashizzar**: units with nothing to return (the Knight, full-strength units) get nothing; Spirit Hosts come back at
   full Health. A returned model must be placed per CORE-6.14 (no spot = not returned).
8. **Reaped Like Corn** [RULING]: the 5-model count is taken when the hit rolls are made, before any of the volley's damage.
9. **AI:** Discorporate — the friendly unit in combat (or within 12" of an enemy) with the most models, else the Knight; Wave of Terror —
   always when offered, the enemy unit with the most melee attacks; Death Stalkers — the enemy unit with the best save among those with
   the most Health; Beacon of Nagashizzar — when at least 3 models would return (or a Spirit Host); Soulfire Ring — automatic; keep the
   Knight within 1" of the Spirit Hosts when moving it (Drawn to War) unless charging. [approximation] The last clause is not built: it would
   need a change in `src/ai` movement scoring; the bot treats the Knight like any other Hero when moving.
10. **Defaults for the sim:** regiment Chorus of Terror and enhancement Shadow's Edge come first; Death Stalkers and Beacon of
    Nagashizzar are the last entries in the patrol lists and so the sim's variant games.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| NH-ARMY-1 | Slasher Host builds: Knight of Shrouds general + 3 Spirit Hosts + 2×5 Grimghast Reapers + 2×10 Chainrasps, 34 models, stats as §5. |
| NH-ARMY-2 | Every unit has Fly and Ward (6+); only the Chainrasps can be replaced by Call for Reinforcements. |
| NH-WEAP-1 | Crit (Auto-wound): an unmodified 6 to hit skips the wound roll on every Nighthaunt weapon. |
| NH-BT-1 | Ethereal: a Nighthaunt save of 4+ succeeds on a 4 against Rend 2, and a +1 save bonus does not turn a 3 into a success; an unmodified 1 still fails; enemy units' saves are unaffected. |
| NH-BT-2 | Wave of Terror: a unit that charged with a roll of 10+ gives an enemy within 1" Strike-last this turn; a roll of 9 offers nothing; enemies beyond 1" cannot be picked; each charging unit only once per phase. |
| NH-RA-1 | Death Stalkers: offered at the start of battle round 1 only; melee attacks against the picked unit get +1 Rend for the rest of the battle; other targets unaffected. |
| NH-RA-2 | Chorus of Terror: −1 to hit for melee attacks on a friendly unit that charged this turn; ranged attacks and non-charging units unaffected. |
| NH-ENH-1 | Soulfire Ring: at the end of a turn in which the general slew a model, Heal (D6) the general; no kill, no heal. |
| NH-ENH-2 | Cloaked in Shadow: once one enemy unit has targeted the general this phase, a second enemy unit cannot pick it (shooting and combat); the first unit still can; the claim resets next phase. |
| NH-ENH-3 | Beacon of Nagashizzar: once per battle in your hero phase, every friendly unit with a slain model gets 1 model back. |
| NH-ENH-4 | Shadow's Edge: the Sword of Stolen Hours then has Crit (Mortal) and Crit (Auto-wound); the attacking player picks one before the dice (core 20.0); with Crit (Mortal) each critical hit is 2 mortal damage; the AI picks Crit (Mortal). |
| NH-AB-1 | Discorporate: a friendly unit wholly within 9" of the Knight (or the Knight) gets Ward (5+) until your next turn; a unit partly outside 9" cannot be picked. |
| NH-AB-2 | Drawn to War: the general has Ward (4+) within 1" of the Spirit Hosts and drops back to 6+ (or Discorporate's 5+) beyond it. |
| NH-AB-3 | Reaped Like Corn: Grimghast melee attacks crit on 5+ against a unit of 5+ models, only on 6 against a smaller unit. |
| NH-AB-4 | Chilling Horde: Chainrasps get +1 to wound in melee in a turn they charged, not otherwise. |
| NH-FLY-1 | All four Nighthaunt units move over other models (Fly). |
| NH-REG | Every `code` in the Nighthaunt data resolves to a registered hook (activated ones with an `activate` block). Not a rules id. |
| NH-AI | Utility hints (`nighthauntAbilityTiming`, `nighthauntTargetBonus`, wired in `src/ai/utility.ts`) and whole AI games against Cities with every regiment ability and enhancement. Not a rules id. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own grave-host livery): pale frost-teal spectral bodies fading to a deeper sea-green at the
wispy tails, charcoal-black and dusty grey tattered hoods and robes, rust-brown iron chains, shackles and blades, aged bone skulls,
and small sickly-green soulfire flames as the accent colour. Shared motif: an original cracked-hourglass-and-padlock badge on
belts and blades. No GW logos, no copied Nighthaunt or Nagash icons. All figures are **true MGSD** chibis (~2.5 heads tall,
huge skull-faced hooded head, stubby limbs); ghost tails are **solid, opaque sculpted wisps** that reach down to the base as the
figure's stand (no see-through materials, no transparency).

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `nh-knight-of-shrouds` | Knight of Shrouds | 1 | 32 round | No | A true MGSD chibi ghost knight, 2.5 heads tall with a huge grinning skull under a tall spiked iron crown and a deep black hood, glowing green eye-points, a tattered black cloak over rusty breastplate, holding an oversized rust-red longsword with a tiny hourglass on the hilt, its body tapering into a thick solid frost-teal spectral tail planted on the base. |
| `nh-spirit-host` | Spirit Hosts | 1 (×3) | 50 round | No | A chunky toy-like SD gestalt ghost, a round wobbly frost-teal blob body made of three squashed-together cartoon skull faces with big hollow eyes, four stubby clawed arms holding a little rusty dagger and a chain, wrapped in torn grey rags, sitting on a thick solid swirl of sea-green spectral mist. |
| `nh-grimghast-reaper` | Grimghast Reapers | 1 (×10) | 32 round | No | A true MGSD chibi ghost reaper, 2.5 heads tall with a huge skull wearing a dark red blindfold and a ragged black hood, stubby arms swinging an oversized curved rusty scythe, a short tattered robe flowing into a solid frost-teal ghost tail curling onto the base. |
| `nh-chainrasp` | Chainrasps | 1 (×20) | 25 round | No | A true MGSD chibi shackled ghost, 2.5 heads tall with a huge sad-grinning skull under a torn grey hood, rusty manacles and a dangling ball-and-chain on one wrist, a chipped rusty short blade in the other hand, its ragged robe trailing into a stubby solid frost-teal ghost tail on the base. |

Chainrasps carry a mix of weapons in the kit but the Spearhead gives them one profile, so one figure covers both units (an extra
pose may be added for variety, not as a rules variant). No champion or standard variants: the Spearhead gives them no rules.

---

## Appendix A — Cursed Shacklehorde (separate PDF; out of scope)

Source: "Spearhead: Nighthaunt - Cursed Shacklehorde" (4 pages, PDF created 2026-04-21), the URL above; not saved to
`docs/sources/` in this stage. Bases from Wahapedia (same day). Army id if built: `nighthaunt.army.cursed-shacklehorde`.

**Roster:** Spirit Torment (**General**, 1), Chainghasts (2), Bladegheist Revenants (5) ×2, Dreadscythe Harridans (5) ×2,
Dreadblade Harrows (2). 22 models. No unit has the Reinforcements keyword. Every unit has Fly and **Ward (5+)**.

**Battle traits**
- *Spectral Procession* (setup rule): 1 Bladegheist Revenants unit and 1 Dreadscythe Harridans unit start in **reserve**. From
  battle round 2: **Cackling Arrival** — once per turn (army), your movement phase: pick 1 of your units in reserve and set it up
  anywhere on the battlefield more than 6" from every enemy unit. (Engine: `PlaceRequest` `anywhere` + reserve, as the F12 set-ups.)
- *Ethereal* (passive): ignore **negative** modifiers to save rolls for friendly units (Rend included under the §8.1 ruling;
  `ignoreNegativeModifiers: 'save'` already drops Rend since F14).

**Regiment abilities (pick 1)**
- *Discorporate* — once per turn (army), any hero phase: pick a friendly unit, roll a D6; on 3+ it adds 1 to its save rolls for the
  rest of the turn. (Under Ethereal this +1 would be ignored only if the army also had the all-modifiers version; this army's
  Ethereal ignores negatives only, so the +1 applies.)
- *Mounting Dread* — once per turn (army), end of any turn: pick a friendly unit, roll a D6; on 2+, enemy units in combat with it
  subtract the current battle round number from their control scores (this turn's control check).

**Enhancements**
- *Unholy Visage* — your hero phase: pick a visible enemy unit within 6" of the general, roll a D6; on 3+ it must immediately use a
  Retreat ability as if it were the enemy movement phase.
- *Tales of Horror* — once per battle, any combat phase: pick an enemy Infantry or Cavalry unit within 6" of the general; for the rest
  of the battle, if it is replaced by Call for Reinforcements, the replacement has half the models (rounded up).
- *Deathly Possessor* — any combat phase: pick an enemy Hero within 12" of the general (target) and another enemy unit within the
  target's combat range (victim); roll a D3; on 2+ inflict that much mortal damage on either the target or the victim (your choice).
- *Spectral Howl* — once per battle, any hero phase: pick an enemy unit within 12" of the general; for the rest of the turn it rolls
  1 fewer dice for charge rolls (minimum 1).

**Warscrolls** (Move / Health / Save / Control / Ward; keywords as printed)

| Unit | M | H | Sv | Ctrl | Ward | Keywords | Base (mm) |
|---|---|---|---|---|---|---|---|
| Spirit Torment | 8" | 5 | 5+ | 2 | 5+ | Hero, Infantry, Fly | 40 round |
| Chainghasts | 8" | 3 | 6+ | 2 | 5+ | Infantry, Fly | 32 round |
| Bladegheist Revenants | 8" | 2 | 6+ | 1 | 5+ | Infantry, Fly | 32 round |
| Dreadscythe Harridans | 8" | 2 | 6+ | 1 | 5+ | Infantry, Fly | 32 round |
| Dreadblade Harrows | 12" | 3 | 6+ | 1 | 5+ | Cavalry, Fly | 60×35 oval |

| Weapon (unit) | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Shacklegheist Chains (Spirit Torment) | Melee | — | 5 | 4+ | 3+ | 1 | 2 | Crit (Auto-wound) |
| Ghastflails (Chainghasts) | Ranged | 12" | 2 | 4+ | 3+ | 2 | 1 | Crit (Auto-wound) |
| Ghastflails (Chainghasts) | Melee | — | 2 | 4+ | 3+ | 2 | 1 | Crit (Auto-wound) |
| Tomb Greatblade (Bladegheists) | Melee | — | 2 | 3+ | 3+ | 1 | 1 | Crit (Auto-wound) |
| Scythed Limbs (Harridans) | Melee | — | 3 | 4+ | 4+ | 1 | 1 | Crit (Auto-wound) |
| Dreadblade (Harrows) | Melee | — | 4 | 4+ | 3+ | 1 | 2 | Crit (Auto-wound) |
| Ethereal Steed's Ghostly Hooves and Teeth (Harrows) | Melee | — | 3 | 5+ | 3+ | — | 1 | Crit (Auto-wound), Companion |

**Warscroll abilities**
- Spirit Torment, *Captured Soul Energy* — your hero phase: pick a friendly unit wholly within 12", roll a D6; on 3+ it adds 1 to
  wound rolls for its combat attacks for the rest of the turn.
- Chainghasts, *Another Link in the Chain* — your combat phase: roll a D6, +1 if this unit is wholly within 12" of a friendly Spirit
  Torment; on 3+, for the rest of the turn friendly units wholly within 12" of this unit add 1 to hit rolls for combat attacks.
- Bladegheist Revenants, *Thrashing Desperation* (passive) — while this unit contests an objective you control, enemy units cannot
  end a charge move within ½" of it unless their unmodified charge roll was 5+.
- Dreadscythe Harridans, *Harrowing Shrieks* (passive) — enemy units in combat with this unit cannot be healed or have slain models
  returned.
- Dreadblade Harrows, *Phantasmal Discorporation* — once per battle, your movement phase: remove this unit and set it up again more
  than 6" from every enemy unit (redeploy.ts, PlaceRequest `anywhere`).

Figures, if built later: `nh-spirit-torment`, `nh-chainghast`, `nh-bladegheist`, `nh-dreadscythe-harridan`, `nh-dreadblade-harrow`
(a mount: chunky SD ghost horse), in the §10 palette.
