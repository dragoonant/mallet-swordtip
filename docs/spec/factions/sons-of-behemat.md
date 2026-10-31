# Sons of Behemat — Stone Lobbas (Spearhead)

Faction id: `behemat` · Army id: `behemat.army.stone-lobbas` · Grand alliance: Destruction.
Source: `docs/sources/spearhead-sons-of-behemat.pdf` (2 pages, 6.3 MB, gitignored), "Spearhead: Sons of Behemat - Stone
Lobbas", the free Warhammer Community download (Age of Sigmar, Spearhead category). Listed 2026-09-09 (PDF metadata:
created and modified 2026-07-27). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_09-09_warhammer_age_of_sigmar_spearhead_sons_of_behemat_stone_lobbas-3xyjzwhip1-qjombu1qss.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, body
`{"index":"downloads_v2","searchTerm":"behemat"}`). Stat blocks and ability timing bars were checked against the rendered
pages (the text layer puts the timing labels away from their abilities). The PDF prints no base sizes. The base comes from
the Wahapedia aos4 warscroll page `https://wahapedia.ru/aos4/factions/sons-of-behemat/Rock-hurlers` (matched-play profile:
unit size 3, base 90mm), fetched the same day with plain curl.

**Which army.** Games Workshop publishes two Sons of Behemat Spearhead armies, as two separate PDFs, each of three
gargants. **Stone Lobbas** (Rock-hurler general + 2 Rock-hurlers) is the newer one: it came out on 2026-09-09 with the
September 2026 Sons of Behemat release, the same day as that release's Regiment of Renown download. It uses the new
**Rock-hurlers** warscroll, whose matched-play unit is 3 gargants, so the army is one Rock-hurlers kit. RULING: Stone Lobbas
is the current army, and this spec builds it. *Wallsmasher Stomp* (Mancrusher Gargant general + 2 Mancrusher Gargants,
listed 2026-03-25, PDF made 2026-04-09,
`https://assets.warhammer-community.com/eng_aos_spearhead_sons_of_behemat_wallsmasher_stomp-pixgkvvzk0-hh6q2dgl7y.pdf`) is
built on the older Mancrusher Gargant profile. It is out of scope, and its rules are in Appendix A so it can be added later
without reopening the PDF. That PDF was read but is not kept in `docs/sources/`. No document says outright that a
"Spearhead: Sons of Behemat" box exists. The ruling rests on the release dates and the kit size.

Mechanics and numbers are ported 1:1. All wording below is our own.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of
an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run =
`advance`, Retreat = `fallBack`. Rend is stored as `rend` (data) / `AP` (engine). Ward = `feelNoPain`. Rule IDs `SOB-*` double
as test IDs (§9).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `behemat.unit.boulder-basher` | Rock-hurler (Boulder Basher) | 1 | **General** | **no** (SOB-BT-1 removes it) | 90 round (Wahapedia) |
| `behemat.unit.rock-hurler` (a) | Rock-hurler | 1 | Unit | **yes** | 90 round (Wahapedia) |
| `behemat.unit.rock-hurler` (b) | Rock-hurler | 1 | Unit | **yes** | 90 round (Wahapedia) |

Total: 3 units, 3 models. All three use the one Rock-hurler warscroll (§5.1). The general is its own datasheet because
Boulder Basher adds **Hero** and removes **Reinforcements** (the Kharadron `arkanaut-company` / `-gunners` precedent:
one warscroll, two datasheets). The two plain Rock-hurlers share one datasheet (patrol refs `rock-hurler-1` /
`rock-hurler-2`). No Wizard, no Priest, nothing has **Fly**. All three are **Monster** with Health 12, so all three can use
Power Through (CORE-5.13) against most targets.

---

## 2. Battle traits

### SOB-BT-1 `behemat.ability.boulder-basher` — Boulder Basher
- **Timing:** Army construction (passive).
- **Effect:** The general's warscroll gains the **Hero** keyword and loses **Reinforcements**. So the general cannot be
  brought back by Call for Reinforcements. It is the army's only Hero. The two other Rock-hurlers keep Reinforcements.
- Notes: a Hero that is a Monster gets no Guarded Hero (CORE-14.2).

### SOB-BT-2 `behemat.ability.bowled-over` — Bowled Over
- **Timing:** Your shooting phase. No printed limit, so once per phase for the army (CORE-3.4).
- **Declare:** Pick an enemy unit that was **allocated at least 1 damage point by shooting attacks from any friendly unit
  this turn**.
- **Effect:** Roll a D6. On **3+**, until the **start of your next turn**, whenever your opponent makes a **charge roll** for
  that unit, they change the **highest D6** so it equals the **lowest D6** before totalling. With 2D6 the charge roll is
  twice the lower die. A unit with extra charge dice changes only its single highest die. On 1–2 nothing happens.
- Notes: the change applies to the final dice, after any re-roll (Forward to Victory, CORE-5.10). It is not a modifier.
  RULING: "this turn" equals "this shooting phase". The army has no other way to shoot in its own turn, and Covering Fire
  (enemy turn) cannot happen in the same turn as this ability.

### SOB-BT-3 `behemat.ability.close-one-eye` — Close One Eye!
- **Timing:** Your hero phase (once per phase, CORE-3.4).
- **Used by:** your general, which must be on the battlefield.
- **Declare:** Pick **another** friendly unit **wholly within 12"** of the general.
- **Effect:** Add **1 to hit rolls** for that unit's **shooting attacks** for the rest of the turn.
- Notes: the hit modifier cap is ±1 (CORE-2.4). This bonus therefore does not stack with the target's own **Roll** option
  (SOB-AB-1).

---

## 3. Regiment abilities (pick 1 at army selection)

### SOB-RA-1 `behemat.ability.surly-sorts` — Surly Sorts
- **Timing:** **Once per battle**, any combat phase.
- **Declare:** Pick a friendly unit that is **in combat**.
- **Effect:** Add **1 to the Attacks** of that unit's **melee weapons** for the rest of the turn (Massive Club and Rocks
  4 → 5, 'Eadbutt 1 → 2).

### SOB-RA-2 `behemat.ability.greedy-and-grabby` — Greedy and Grabby
- **Timing:** Passive.
- **Effect:** Add **5** to the **control score** of every friendly unit. Each Rock-hurler then has control score 10 on an
  objective it contests (Control 5 + 5).

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `behemat.enh.ard-ead` | 'Ard 'Ead | **Once per battle**, any combat phase | For the rest of the turn, add **1 to hit rolls** for combat attacks made with the general's **'Eadbutt** (4+ → 3+). |
| `behemat.enh.humongous-strides` | Humongous Strides | Passive | Add **1 to charge rolls** for the general. |
| `behemat.enh.lucky-rock` | Lucky Rock | **Once per battle**, your shooting phase | For the rest of the turn, add **1 to the Attacks** of the general's **Hurlin' Rocks** (3 → 4). |
| `behemat.enh.hungry-gobbler` | Hungry Gobbler | End of any turn (once per turn, CORE-3.4) | If the general's **combat attacks** slew **at least one enemy model** this turn, **Heal (D3)** the general. |

Notes: Hungry Gobbler counts kills from the general's melee weapons only. Mortal damage from Power Through or from abilities
is not a combat attack. Heal cannot raise the general above Health 12. 'Ard 'Ead and Lucky Rock can be used before the
relevant attacks in the same phase and last until the end of the turn.

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. **No warscroll prints a Ward.** Printed keywords only (Spearhead
warscrolls print no faction keywords).

### 5.1 `behemat.unit.rock-hurler` / `behemat.unit.boulder-basher` — Rock-hurler
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 12 | 5+ | 5 | — |

Keywords: **Monster, Reinforcements** (the general: **Hero, Monster**, see SOB-BT-1).

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Hurlin' Rocks (`behemat.weapon.hurlin-rocks`) | Ranged | 12" | 3 | 4+ | 2+ | 1 | D3 | — |
| Massive Club and Rocks (`behemat.weapon.massive-club-and-rocks`) | Melee | — | 4 | 4+ | 2+ | 1 | 2 | — |
| 'Eadbutt (`behemat.weapon.eadbutt`) | Melee | — | 1 | 4+ | 2+ | 2 | 3 | — |

Loadout: every model carries all three weapons. Hurlin' Rocks has no Shoot in Combat unless the unit picks **Drop**.

**SOB-AB-1 `behemat.ability.drop-toss-or-roll` — Drop, Toss or Roll**
- **Timing:** Your shooting phase (once per phase for this unit, CORE-3.4).
- **Effect:** Pick **one** of the options below for this unit until the end of the turn:
  - **Drop:** the unit's ranged weapons have **Shoot in Combat**.
  - **Toss:** add **6"** to the **Range** of the unit's ranged weapons (Hurlin' Rocks 12" → 18").
  - **Roll:** add **1 to hit rolls** for the unit's **shooting attacks**.
- **Restriction:** an option picked for one friendly unit **cannot be picked for another friendly unit in the same turn**.
  With three gargants, each one can take a different option every turn.
- Notes: use it before the unit shoots. Lucky Rock and Toss both apply to the general's Hurlin' Rocks (4 attacks at 18").
  This is the Spearhead wording. The matched-play version (once per turn for the army, any shooting phase, and Drop also
  allows Covering Fire in combat) does **not** apply.

---

## 6. Spells and prayers

None. No Wizard, no Priest, no manifestations. The army cannot unbind.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/behemat/*.json`), at most reusing an existing code hook; (b) = new
faction code hook in `src/engine/factions/behemat.ts`, exported as `behematHooks` and spread into `code-hooks.ts` like
`skavenHooks`. Shared helpers from `aos-common.ts`: `onBoard`, `whollyWithinUnit`, `inCombat`, `announce`, `paramOf`,
`healUnit`, `isDamaged`. (c) = engine change outside the faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, no Ward, base | (a) | Two datasheets with the same profile and the same three weapons: `behemat.unit.boulder-basher` keywords `HERO`, `MONSTER`; `behemat.unit.rock-hurler` keywords `MONSTER`, `REINFORCEMENTS`. Base `{ shape: 'round', mm: 90 }`. Patrol `warlord: 'boulder-basher'`, units `rock-hurler-1`, `rock-hurler-2` (`size: 1`). |
| SOB-BT-1 Boulder Basher | (a) | Expressed by the two datasheets above. The battle-trait descriptor is informational (passive, no effect) so the card shows it. Core `spearheadCallForReinforcements` already offers only units with `REINFORCEMENTS`. |
| Weapons | (a) | Plain weapon data. Hurlin' Rocks `range 12, A 3, hit 4, wound 2, rend 1, D 'D3'`; Massive Club and Rocks `A 4, hit 4, wound 2, rend 1, D 2`; 'Eadbutt `A 1, hit 4, wound 2, rend 2, D 3`. |
| SOB-RA-2 Greedy and Grabby | (a) | Passive regiment descriptor, `trigger 'always'`, scope `self` (the chosen regiment ability sits on every friendly unit, `hooks-impl.ts` source walk), `effect { modifyStat: { stat: 'OC', value: 5 } }` (the Fyreslayers Powerful Presence shape). This is exact here, because every unit in the army, a reinforcement replacement included, is one model, so +5 Control per model equals +5 to the control score. |
| SOB-ENH Humongous Strides | (a) | Passive enhancement, `trigger 'chargeRoll'`, scope `bearer`, `effect { modifyRoll: { roll: 'charge', value: 1 } }` (the Daughters / Ironjawz charge-roll shape). |
| SOB-BT-3 Close One Eye! | (b) `behematGrant` | One shared grant hook (below). Descriptor `timing phase command / your`, `params { targets: 'friendlyWhollyNearGeneral', range: 12, excludeGeneral: true, grant: { modifyRoll: { roll: 'hit', value: 1 }, when: { weaponType: 'ranged' } } }`. `canUse` needs the general on the board. |
| SOB-RA-1 Surly Sorts | (b) `behematGrant` | `timing phase fight / any`, `limit oncePerBattle`, `params { targets: 'friendlyInCombat', grant: { modifyStat: { stat: 'A', value: 1 }, when: { weaponType: 'melee' } } }` (the Khorne Savagery shape). Offered in the start-of-combat window and between fight activations. |
| SOB-ENH 'Ard 'Ead | (b) `behematGrant` | Enhancement, `timing phase fight / any`, `limit oncePerBattle`, `params { targets: 'self', grant: { modifyRoll: { roll: 'hit', value: 1 }, when: { weaponId: 'behemat.weapon.eadbutt' } } }`. |
| SOB-ENH Lucky Rock | (b) `behematGrant` | Enhancement, `timing phase shooting / your`, `limit oncePerBattle`, `params { targets: 'self', grant: { modifyStat: { stat: 'A', value: 1 }, when: { weaponId: 'behemat.weapon.hurlin-rocks' } } }`. |
| `behematGrant` (shared) | (b) | `ActivatedAbilityHook`. `targets(state, unitId)` by `params.targets`: `'self'` = [the user's unit]; `'friendlyInCombat'` = friendly units on the board that are `inCombat`; `'friendlyWhollyNearGeneral'` = friendly units on the board with `whollyWithinUnit(t, general, range)`, minus the general when `excludeGeneral`. `canUse` = the list is non-empty (and the picked target is in it). `resolve`: `effectService.grant(ctx, target, params.grant, { sourceAbilityId, sourceUnitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })` + `announce`. One hook covers four rules, so there are fewer names and fewer tests. |
| SOB-ENH Hungry Gobbler | (b) `behematHungryGobbler` | Enhancement, `timing endOfTurn / any`, no declare (the bearer). `canUse` = general on the board and `slewInFightThisTurn(state, general)` (F14 turn ledger, `attack.ts`: melee kills only, Crit (Mortal) pools of combat attacks included; Power Through and ability mortals excluded) and `isDamaged`. Resolve: `n = rollExpr(params.heal ?? 'D3')`, `healUnit(ctx, general, n, abilityId)`, announce. (`isDamaged` in `canUse` stops the AI from wasting the use. The rule itself would allow a Heal of 0.) |
| SOB-AB-1 Drop, Toss or Roll | (b) `behematDropTossRoll` | Datasheet ability on both datasheets, `timing phase shooting / your`, no declare (the unit itself). `modesFor(state, unitId, player)` = the options of `drop` / `toss` / `roll` that are not yet in the turn ledger `mission.custom.sobDtr[player] = { key: 'round:activePlayer', used: ModeId[] }` (stale key = empty). `canUse` = at least one mode left and the unit on the board. Resolve: record the mode, then grant `untilEndOfTurn` on self: drop → `{ grantWeaponAbility: { ability: 'SHOOT_IN_COMBAT' }, when: { weaponType: 'ranged' } }`; toss → `{ modifyStat: { stat: 'range', value: 6 }, when: { weaponType: 'ranged' } }`; roll → `{ modifyRoll: { roll: 'hit', value: 1 }, when: { weaponType: 'ranged' } }`. Offered at the start of the shooting phase and in the between-activation windows (`shooting:after:<unitId>`, F8), before the unit is picked to shoot. `modesFor` already exists on the activated-hook interface (`abilities.ts`). |
| SOB-BT-2 Bowled Over (declare + roll) | (b) `behematBowledOver` | Battle trait, `timing phase shooting / your`, `declare [{ role: 'unit', owner: 'enemy' }]`, `roll { dice: 'D6', succeedOn: 3 }`. `targets` = enemy units on the board in the union of `damagedByShootingThisPhase(state, f)` over friendly units `f` (`attack.ts` phase marks `shotDmg:a>t`, damage after wards). Offered in the shooting windows after each activation (`shooting:after:<unitId>`, F8). Resolve on 3+: drop any older Bowled Over marker on the target and grant an empty marker effect (scope self, `duration 'untilNextTurn'`), then set `active.expires = { kind: 'nextOwnTurn', round, player: use.player }`. The default expiry belongs to the holder, which is the enemy here, so it is set by hand, as in the Tzeentch Mutative Aura pattern (`tzeentch.ts`). |
| SOB-BT-2 Bowled Over (charge dice) | (b) same hook | `producesAt: ['onChargeRoll']`. `produce(ctx, entry, data)`: only for `entry.active` whose `sourceAbilityId` is this ability and `data.chargingUnitId === entry.holderUnitId`. Let `d = data.roll.roll.dice` (all dice, extra charge dice included, after re-rolls). Return `{ kind: 'roll', modifier: min(d) − max(d) }`. `chargeRollModifier` (`phases/charge.ts`) folds it into the total, and `applyAbilityRerolls` already measures "short" with the modifier included. approximation: the engine adds this as a negative modifier instead of rewriting the die. The total is the same. Two side effects: the dice tray shows the original dice with a "−n" line, and an `ignoreNegativeModifiers: 'charge'` effect would cancel it. No shipped army has that effect (only Soulblight's `save` exists). |

**Engine changes (c):** none. Every piece above uses mechanisms that already exist: the F14 turn ledger
(`slewInFightThisTurn`), the F8 shooting windows and `damagedByShootingThisPhase`, `modesFor`, `chargeRollModifier` /
`produce` at `onChargeRoll`, `Condition.weaponId`, `modifyStat range`, `grantWeaponAbility SHOOT_IN_COMBAT`, and the manual
`expires` override. No frozen contract file changes.

---

## 8. Engine notes

1. **Hit-modifier cap:** Roll and Close One Eye! on the same unit still give only +1 (CORE-2.4). The UI does not need to stop
   the combination. The AI should avoid it (note 5).
2. **Drop in combat:** a Rock-hurler in combat that picked Drop can shoot Hurlin' Rocks at any visible enemy in range,
   including the unit it is fighting (core shooting rules; Spearhead has no "must target the closest" rule except for
   Covering Fire).
3. **Power Through:** with Health 12, the gargants out-health nearly every Spearhead unit. The core end-of-turn Power Through
   (D3 mortal, then a move) is open to them after a charge. Its kills do not feed Hungry Gobbler (note in §4).
4. **Bowled Over ordering:** it can only be declared after friendly shooting has damaged something, so the useful moment is
   after the last gargant has shot. The window after each activation also lets it be used right after the first shot that
   lands. Once per phase.
5. **AI:**
   - Drop, Toss or Roll: a unit in combat takes **Drop**. A unit with no target within 12" but one within 18" takes **Toss**.
     Otherwise it takes **Roll**, unless Close One Eye! is already on it, in which case it takes Toss if anything is in the
     extra range, else Drop. Units are resolved in order of expected damage, so the best shooter gets first pick.
   - Close One Eye!: the Rock-hurler with the most enemy units in 12" (18" when Toss is still free).
   - Bowled Over: after the last shot, the damaged enemy unit with the highest melee threat that is within 12" of a gargant.
   - Surly Sorts: the first combat phase in which a gargant is in combat with an enemy it can finish off (expected melee
     damage ≥ the enemy's wounds left), else the general's first fight.
   - 'Ard 'Ead: the first combat phase the general fights. Lucky Rock: the first shooting phase the general has a target.
   - Hungry Gobbler: always, when it is legal.
6. **Ward sources:** none.
7. **Defaults for the sim:** regiment Greedy and Grabby and enhancement Humongous Strides (both passive, so they work with the
   data alone). Variant games use Surly Sorts and Hungry Gobbler.
8. **Three-model army:** losing one gargant costs a third of the army. Call for Reinforcements (two plain Rock-hurlers)
   matters more here than anywhere else, so the AI's replacement logic should always use it when it is legal.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| SOB-ARMY-1 | Stone Lobbas builds: Boulder Basher general + 2 Rock-hurlers, 3 models, each Move 8" / Health 12 / Save 5+ / Control 5, no Ward. |
| SOB-ARMY-2 | Every model carries Hurlin' Rocks, Massive Club and Rocks and 'Eadbutt with the §5.1 profiles; Hurlin' Rocks has no Shoot in Combat by default. |
| SOB-BT-1 | Boulder Basher: the general has HERO and no REINFORCEMENTS; only the two other Rock-hurlers are ever offered to Call for Reinforcements. |
| SOB-BT-2 | Bowled Over: only enemy units that friendly shooting damaged this turn can be picked; 3+ marks the unit, 1–2 does nothing; once per phase. |
| SOB-BT-3 | Bowled Over mark: the marked unit's charge total uses the lowest die twice (2D6), or replaces only the highest die (3+ dice), after re-rolls; the mark ends at the start of the Sons player's next turn, not the opponent's. |
| SOB-BT-4 | Close One Eye!: needs the general on the board; target another friendly unit wholly within 12"; +1 to its shooting hit rolls for the turn; never the general itself. |
| SOB-RA-1 | Surly Sorts: once per battle, a friendly unit in combat gets +1 Attacks on both melee weapons until end of turn; ranged weapons unchanged. |
| SOB-RA-2 | Greedy and Grabby: each friendly unit's control score on an objective is 10 (5 + 5); a reinforcement replacement too. |
| SOB-ENH-1 | 'Ard 'Ead: once per battle, the general's 'Eadbutt hits on 3+ for the rest of the turn; Massive Club and Rocks unchanged. |
| SOB-ENH-2 | Humongous Strides: +1 to the general's charge rolls only. |
| SOB-ENH-3 | Lucky Rock: once per battle, the general's Hurlin' Rocks makes 4 attacks for the rest of the turn. |
| SOB-ENH-4 | Hungry Gobbler: at the end of a turn in which the general's melee attacks slew an enemy model, Heal (D3) the general; not offered after kills by Power Through or mortal damage only. |
| SOB-AB-1 | Drop: a Rock-hurler in combat can shoot Hurlin' Rocks this turn. |
| SOB-AB-2 | Toss: Hurlin' Rocks reaches an 18" target that is out of range without it. |
| SOB-AB-3 | Roll: +1 to hit for the unit's shooting attacks; with Close One Eye! as well it is still +1 (cap). |
| SOB-AB-4 | Drop, Toss or Roll exclusivity: an option used by one friendly unit is not offered to another the same turn, and all three are offered again next turn. |
| SOB-WEAP-1 | Hurlin' Rocks deals D3 damage, Rend 1; 'Eadbutt Rend 2, Damage 3. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own hill-gargant look): ruddy sun-tanned skin with pink cheeks and noses, wild ginger and
straw-blond hair and beards, patched brown leather and oatmeal sackcloth, frayed rope belts, grey-blue granite boulders with
moss-green patches, rusty iron rings and buckles as small accents. Shared motif: an original crude handprint daubed in red
clay on sacks and belts. No GW logos, no copied Sons of Behemat icons. All figures are **true MGSD** chibis (~2.5 heads tall,
huge head, stubby legs, big hands and feet). Gargants read as giants through chunky toy-like bulk and big boulders, not
through height: each one fills its 90mm base.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `sob-boulder-basher` | Rock-hurler (Boulder Basher, general) | 1 | 90 round | No | A true MGSD chibi hill giant, 2.5 heads tall with an enormous round head, a bulbous red nose, a bristling ginger beard and one eye squinting as it takes aim, a big round belly, stubby tree-trunk legs, a dented iron pot worn as a crown, one huge hand hefting a mossy granite boulder overhead and a fat wooden club with stones lashed on its belt. |
| `sob-rock-hurler` | Rock-hurler | 1 (×2) | 90 round | No | A true MGSD chibi hill giant, 2.5 heads tall with a huge bald head, gap-toothed grin and floppy ears, a sackcloth loincloth, stubby legs with big bare feet, a bulging rope-tied sack of rocks on its back and a granite boulder clutched in both oversized hands, ready to throw. |

The two plain Rock-hurlers share one figure. The general gets its own figure so the player can tell which gargant is the
Hero; the rules give no other visible difference. Wallsmasher Stomp figures (Appendix A) are listed there.

---

## 11. Implementation notes

Not built. Plan: data in `src/data/factions/behemat/` (faction.json, datasheets/{boulder-basher, rock-hurler}.json,
weapons.json, abilities.json, enhancements.json, patrols/stone-lobbas.json); hooks in `src/engine/factions/behemat.ts`
(`behematGrant`, `behematBowledOver`, `behematHungryGobbler`, `behematDropTossRoll`; `...behematHooks` in `code-hooks.ts`);
tests in `tests/engine/behemat.test.ts` and `tests/data/behemat.test.ts`, one per SOB- id. Patrol `battleTraits:
['behemat.ability.boulder-basher', 'behemat.ability.bowled-over', 'behemat.ability.close-one-eye']`, regiment list Greedy and
Grabby (default) then Surly Sorts, enhancement list Humongous Strides (default), 'Ard 'Ead, Lucky Rock, Hungry Gobbler.
Figure mapping keys `<datasheet id>/<modelId>`.

---

## Appendix A — Wallsmasher Stomp (separate PDF; out of scope)

Source: "Spearhead: Sons of Behemat - Wallsmasher Stomp" (2 pages, 18.6 MB), listed 2026-03-25, URL in the header. Army id
if ever built: `behemat.army.wallsmasher-stomp`. General: **Mancrusher Gargant**. Units: 2 Mancrusher Gargants. 3 models.
Base: 90×52 oval according to Wahapedia (`Mancrusher-Gargant-1` and `Scourge-of-Aqshy-Mancrusher-Gargant` battle profiles,
fetched 2026-10-30). This looks small for a gargant, so check it against the kit before building.

**Battle traits.**
- `WSS-BT-1` Bullstomper (army construction): the general has **Hero** (as well as Monster) and loses **Reinforcements**.
- `WSS-BT-2` Bellowing Roar (any combat phase): pick a friendly unit, then an enemy unit in combat with it, and roll a D6.
  On 2+, the enemy unit's attacks are −1 to hit for the rest of the phase.
- `WSS-BT-3` 'Grab Those Rocks and Chuck 'Em!' (your hero phase): your general uses it. Pick another friendly unit wholly
  within 12" of the general. That unit's Throwin' Rocks gets +1 Attacks this turn.

**Regiment abilities.** `WSS-RA-1` Foe-Chompers (passive): each time Stuff 'Em In Me Bag slays an enemy model, Heal (D3) the
unit that used it. `WSS-RA-2` Earth-Shaking Charge (once per phase for the army, any charge phase): pick a friendly unit
that charged this phase and roll a D6 for each enemy unit in combat with it. On 3+, that enemy unit has Strike-last this
turn.

**Enhancements (all passive).** Monstrously Tough (the general's Health is 15, not 12); Extra-Big Bag (the general's Stuff
'Em In Me Bag picks 2 enemy units, one roll each); Lanky Git (the general's charge rolls are 3D6 instead of 2D6, i.e.
`extraChargeDice: 1`); Furiously Territorial (+1 to hit for the general's attacks against an enemy unit that contests an
objective you do not control).

**Warscroll.**

| Unit | Move | Health | Save | Control | Ward | Keywords | Base (mm) |
|---|---|---|---|---|---|---|---|
| Mancrusher Gargant | 8" | 12 | 5+ | 10 | — | Monster, Reinforcements (general: Hero, Monster) | 90×52 oval (Wahapedia, unverified) |

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Throwin' Rocks | Ranged | 12" | 1 | 5+ | 2+ | 2 | D3 | — |
| Massive Club | Melee | — | 4 | 4+ | 2+ | 1 | 2 | — |
| 'Eadbutt | Melee | — | 1 | 4+ | 2+ | 2 | 4 | — |
| Mighty Kick | Melee | — | 1 | 4+ | 2+ | 2 | D3 | — |

**Abilities.**
- Stuff 'Em In Me Bag (any combat phase): pick an enemy unit in combat with this unit and roll a D6. If the roll is at least
  **double** that unit's Health characteristic, 1 of its models is slain. So it works on Health 1–3 models (2+, 4+, 6+) and
  never on Health 4 or more.
- Timber! (passive): when this model is slain, before it is removed, the players roll off. The winner picks a point within
  3" of the model, and each **enemy** unit within 2" of that point suffers D3 mortal damage. Then the model is removed.
  (This needs the `onOwnModelSlain` hook plus a point pick, which is not built for any army yet.)

**Figures (if built).** `sob-bullstomper` (1, general: a true MGSD chibi hill giant with a huge bearded head, a leather
patch over one eye, a heavy tree-trunk club, a bulging loot sack on its belt and a big bare foot raised to stomp);
`sob-mancrusher` (1 ×2: a true MGSD chibi hill giant with a huge grinning head, a rope-tied sack over its shoulder, a club
made from a broken wall beam in one hand and a boulder in the other).
