# Flesh-eater Courts — Carrion Retainers (Spearhead)

Faction id: `fec` · Army id: `fec.army.carrion-retainers` · Grand alliance: Death.
Source: `docs/sources/spearhead-flesh-eater-courts.pdf` (8 pages, 2.8 MB, gitignored), "Spearhead: Flesh Eater-Courts - Carrion
Retainers" (GW's own spelling of the title), the free Warhammer Community download (Age of Sigmar, Spearhead category). Listed
2025-11-12 (PDF metadata: created 2025-03-10, modified 2025-10-27). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_12-11_aos_spearhead_flesh_eater_courts_carrion_retainers-p8mhioxip3-ugpcbnaxvq.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, body
`{"index":"downloads_v2","searchTerm":"flesh-eater","gameSystem":"warhammer-age-of-sigmar","language":"english"}`).

**Which army.** The search returns two Flesh-eater Courts Spearheads in two separate PDFs. **Carrion Retainers** (Abhorrant
Archregent, 10 Cryptguard, 3 Morbheg Knights, Varghulf Courtier) is the army of the current **Spearhead: Flesh-eater Courts**
box (15 models: the same four kits, per the Warhammer Community box announcement and retailer listings), so it is the army this
spec builds. **Charnel Watch** ("Spearhead: Flesh-eater Courts - Charnel Watch", listed 2025-08-27,
`https://assets.warhammer-community.com/eng_aug25_aos_spearhead_rules_fec-2e0llsv3kw-gnsahcoz34.pdf`, 4 pages, not stored in
`docs/sources/`) is built from older kits (Abhorrant Gorewarden, Royal Beastflayers, Crypt Horrors, Crypt Flayers). It is out of
scope; its rules are recorded in Appendix A so it can be added later without reopening the PDF.

The PDF prints no base sizes. They come from the Wahapedia aos4 warscroll pages (`wahapedia.ru/aos4/factions/flesh-eater-courts/
Abhorrant-Archregent`, `/Cryptguard`, `/Morbheg-Knights`, `/Varghulf-Courtier`), fetched the same day with plain curl.
Stat blocks and ability timing bars were checked against the rendered PDF pages (the text layer scrambles the stat diamond).
Mechanics and numbers are ported 1:1. All wording below is our own. Rule IDs `FEC-*` double as test IDs (§9).

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of an
enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run = `advance`,
Retreat = `fallBack`. Rend is stored as `AP` (negative = more Rend). "Ward (N+)" maps to `feelNoPain: N` (only the best ward counts).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `fec.unit.abhorrant-archregent` | Abhorrant Archregent | 1 | **General** | no | 40 round (Wahapedia) |
| `fec.unit.cryptguard` | Cryptguard | 10 | Unit | **yes** | 25 round (Wahapedia) |
| `fec.unit.morbheg-knights` | Morbheg Knights | 3 | Unit | no | 75×42 oval (Wahapedia) |
| `fec.unit.varghulf-courtier` | Varghulf Courtier | 1 | Unit | no | 90×52 oval (Wahapedia) |

Total: 4 units, 15 models. Two Heroes (Archregent, Varghulf Courtier): both collect **noble deeds points** (§2). No Wizard and
no Priest keyword anywhere, but the Archregent makes casting rolls (RULING §6). Only the Morbheg Knights have **Fly**. Every
warscroll prints a Ward: 6+ everywhere except Cryptguard 5+. (Wahapedia's matched-play Morbheg Knights can be reinforced; the
Spearhead warscroll prints no Reinforcements keyword, so they cannot.)

---

## 2. Battle traits

### FEC-BT-1 `fec.ability.noble-deeds` — Noble Deeds
- **Timing:** Passive.
- **Effect:** Each **friendly Hero** keeps its own tally of **noble deeds points** (start 0, **max 6**, excess lost). Each time a
  friendly Hero **uses a Fight ability**, once its attacks are resolved, it gains points equal to the **damage points allocated**
  by that Fight (after saves and wards; overkill on the last model is not allocated). A Hero that is destroyed loses its tally.
- Points are spent by Summon Loyal Subjects (FEC-BT-2) and read by Feeding Frenzy (FEC-BT-3). The Rousing Oration enhancement
  also gives points.

### FEC-BT-2 `fec.ability.summon-loyal-subjects` — Summon Loyal Subjects
- **Timing:** Your movement phase (no printed limit; CORE-3.4 once per phase per Hero, so the Archregent and the Varghulf may
  each use it once).
- **Declare:** Pick a friendly Hero with **at least 1** noble deeds point (that Hero uses the ability).
- **Effect:** Spend any number of that Hero's points, in any mix:
  - **1 point:** return 1 slain model to a friendly **Cryptguard** unit **within 9"** of that Hero;
  - **2 points:** return 1 slain model to a friendly **Morbheg Knights** unit **within 9"** of that Hero.
  Unspent points stay. Returned models are set up per the core return rule (coherency, never above starting strength).

### FEC-BT-3 `fec.ability.feeding-frenzy` — Feeding Frenzy
- **Timing:** Passive.
- **Effect:** Friendly units **wholly within 12"** of any friendly Hero that has **exactly 6** (= the maximum) noble deeds points
  add **1 to the Attacks** of their **melee** weapons. The Hero itself qualifies (a unit is wholly within any range of itself).
  Companion weapons are not affected (CORE-12.4), so the Nightshriekers' Claws and Teeth never gain it. Several 6-point Heroes do
  not stack (+1 total).

---

## 3. Regiment abilities (pick 1 at army selection)

### FEC-RA-1 `fec.ability.crusading-army` — Crusading Army
- **Timing:** Passive. **Effect:** Add **1 to run rolls and to charge rolls** for friendly units.

### FEC-RA-2 `fec.ability.defenders-of-the-realm` — Defenders of the Realm
- **Timing:** Passive. **Effect:** Add **1 to save rolls** for friendly units while they are **contesting an objective you control**.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `fec.enh.ulguan-cloak` | Ulguan Cloak | Passive | The general is **not visible** to enemy models **more than 12"** away from it. |
| `fec.enh.blood-river-chalice` | Blood-River Chalice | **Once per battle**, your hero phase | **Heal (2D3)** the general. |
| `fec.enh.rousing-oration` | Rousing Oration | Your hero phase (CORE-3.4 once per phase) | Roll a D6 for each friendly unit **wholly within 12"** of the general, **not** counting the general itself. Each **5+** gives the general **1 noble deeds point** (cap 6). |
| `fec.enh.crimson-victuals` | Crimson Victuals | Your hero phase (casting roll, see §6) | Declare: pick a **visible enemy unit within 18"** of the general, make a casting roll of 2D6. On **6+**: **D3 mortal damage** to the target. Then, if your **Cryptguard** unit is **within 6"** of the target, you may return **1 slain Cryptguard model per damage point** this ability allocated. |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Printed keywords only (Spearhead warscrolls print no faction keywords).

### 5.1 `fec.unit.abhorrant-archregent` — Abhorrant Archregent (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 6 | 5+ | 2 | 6+ |

Keywords: **Hero, Infantry** (no Wizard keyword; casting level 1, see §6)

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Gory Talons and Fangs (`fec.weapon.gory-talons-and-fangs`) | Melee | — | 5 | 3+ | 3+ | 1 | 2 | — |

**FEC-AB-1 `fec.ability.deranged-transformation` — Deranged Transformation** (casting roll, see §6)
- **Timing:** Your hero phase.
- **Declare:** Pick a **visible friendly unit wholly within 18"** of this unit (itself allowed), make a casting roll of 2D6.
- **Effect:** On **6+**, until the start of your next turn the target gets **+2" Move** and **+1 to wound rolls** for all its attacks.

### 5.2 `fec.unit.cryptguard` — Cryptguard
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 1 | 6+ | 1 | 5+ |

Keywords: **Infantry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Cursed Weapon (`fec.weapon.cursed-weapon`) | Melee | — | 3 | 4+ | 4+ | 1 | 1 | — |

**FEC-AB-2 `fec.ability.royal-bodyguard` — Royal Bodyguard**
- **Timing:** Passive.
- **Effect:** Add **1 to ward rolls** for friendly **Heroes** that are **wholly within this unit's combat range** (every model of the
  Hero within 3" of a Cryptguard model). With the printed 6+ ward this makes the Heroes effectively 5+.

### 5.3 `fec.unit.morbheg-knights` — Morbheg Knights
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 4 | 4+ | 1 | 6+ |

Keywords: **Cavalry, Fly**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Grisly Lance (`fec.weapon.grisly-lance`) | Melee | — | 2 | 3+ | 4+ | 1 | 1 | Charge (+1 Damage) |
| Nightshrieker's Claws and Teeth (`fec.weapon.nightshrieker-claws`) | Melee | — | 3 | 4+ | 3+ | 1 | 2 | Companion |

Every model carries both weapons.

**FEC-AB-3 `fec.ability.predators-pounce` — Predator's Pounce**
- **Timing:** Passive.
- **Effect:** This unit may use **Charge** abilities in a turn in which it used a **Retreat** ability, and suffers **no mortal
  damage** when it Retreats.

### 5.4 `fec.unit.varghulf-courtier` — Varghulf Courtier
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 10" | 8 | 5+ | 2 | 6+ |

Keywords: **Hero, Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Immense Claws (`fec.weapon.immense-claws`) | Melee | — | 7 | 4+ | 3+ | 1 | 2 | — |
| Dagger-like Fangs (`fec.weapon.dagger-like-fangs`) | Melee | — | 1 | 3+ | 2+ | 2 | 3 | — |

**FEC-AB-4 `fec.ability.victory-feast` — Victory Feast**
- **Timing:** End of any turn (both players' turns; CORE-3.4 once per phase).
- **Condition:** At least one enemy model was **slain by this unit this turn** (its attacks or any damage it caused).
- **Effect:** **Heal (D6)** this unit. Then it **may immediately Retreat** and suffers **no mortal damage** for it.
- RULING: the Retreat is the core Retreat ability, which needs the unit to be in combat; out of combat only the Heal happens.

---

## 6. Spells and prayers

Deranged Transformation (FEC-AB-1) and Crimson Victuals (enhancement). Both casting value 6. RULING (same as Daughters Doomfire
DOK-AB-4): the Archregent prints no Wizard keyword, but a casting roll only exists for spells, so both are **Spells**: datasheet
`castingLevel: 1` (F16), one cast attempt per hero phase (so Deranged Transformation **or** Crimson Victuals each phase), enemy
Wizards may unbind them, a double 1 miscasts. The Archregent is **not a Wizard**: it never unbinds and Wizard-only rules ignore it.
No lore, no manifestations, no Priest.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/fec/*.json`), at most reusing an existing code hook; (b) = new faction code hook in
`src/engine/factions/fec.ts`, exported as `fecHooks` and spread into `code-hooks.ts` like the other armies. Shared helpers from
`aos-common.ts`: `onBoard`, `liveModels`, `hasKeyword`, `whollyWithinUnit`, `unitGap`, `inCombat`, `inflictMortal`, `healUnit`,
`returnableModels`, `returnSlainModels`, `announce`, `paramOf`; `writeMoveQueue` / `retreatOptions` from `aos-moves.ts`.
(c) = engine change outside the faction file.

Ledger: `mission.custom.fecDeeds: Record<UnitId, number>` (0..6 per Hero unit). Helpers in `fec.ts`: `deedsOf(state, unitId)`,
`addDeeds(ctx, unitId, n)` (clamps to 6, emits `AbilityTriggered` "Noble deeds n/6"), `spendDeeds(state, unitId, n)`.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, wards, bases | (a) | Datasheets as the other armies; `HERO`, `INFANTRY`, `CAVALRY`, `FLY`, `REINFORCEMENTS`; `feelNoPain` 6 (Cryptguard 5). Bases `{ shape: 'round', mm: 40 }` / `{ shape: 'oval', mm: 75, mm2: 42 }` / `{ shape: 'oval', mm: 90, mm2: 52 }`. Archregent `castingLevel: 1` (F16), no WIZARD. |
| Cryptguard Reinforcements | (a) | Core `spearheadCallForReinforcements`; only the Cryptguard are offered. |
| Name keywords `CRYPTGUARD`, `MORBHEG KNIGHTS` | (a) | Add to those datasheets' `keywords` (invisible to players) so Summon Loyal Subjects and Crimson Victuals find "your Cryptguard / Morbheg Knights unit"; or test `isDatasheet` in the hook (preferred, no keyword change). |
| Grisly Lance Charge (+1 Damage); Nightshrieker Companion | (a) | Weapon abilities `{ ability: 'CHARGE_DAMAGE', value: 1 }`, `{ ability: 'COMPANION' }`. |
| FEC-BT-1 Noble Deeds | (b) `fecNobleDeeds` | Battle-trait passive marker (`hook: 'onStatQuery', run: noop`) with `onOwnFightResolved(ctx, { unitId, damageAllocated })` (attack.ts calls it for the battle-trait code on every friendly unit that fought, the Soulblight Hunger pattern): if the unit is on board, has `HERO` and `damageAllocated > 0`, `addDeeds(ctx, unitId, damageAllocated)`. The same hook also carries `onEnemyModelSlain` (see FEC-AB-4). |
| Noble deeds HUD | (b) | `resourceReadout` on the Hero warscroll codes (`fecDerangedTransformation` → `{ id: 'fec.deeds.<unitId>', label: 'Archregent deeds', value, max: 6 }`, `fecVictoryFeast` → Varghulf), since `factionResources` reads each unit's datasheet abilities and one battle-trait readout can show only one number. Hidden (null) once that Hero is destroyed. |
| FEC-BT-2 Summon Loyal Subjects | (b) `fecSummonLoyalSubjects` | Activated battle trait, `timing phase movement / your`, `keywords ['UNLIMITED']` (CORE-3.4 is enforced per Hero by the phase mark `fec:summoned:<heroId>`, so the Archregent and the Varghulf may each use it once), `declare [{ role: 'unit', owner: 'friendly' }]` (the spending Hero). `targets` = friendly HERO units on board with `deedsOf > 0` that have a legal split. Modes come from `modesFor(state, null, player, [heroId])` (F18, ENG-F18-6): every `k<n>c<m>` split (n Knights at 2 points, m Cryptguard at 1 point) the Hero's points, the slain models and the 9" check (`unitGap`) allow, best first. Resolve calls `returnSlainModels` and spends points only for models actually returned (CORE-6.14 can place fewer). No approximation: any per-point split is offered. |
| FEC-BT-3 Feeding Frenzy | (b) `fecFeedingFrenzy` | Battle-trait descriptor, scope `self` (the trait sits on every unit), effect `{ when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } }`; the code's `gate` is true when some friendly HERO on board has `deedsOf >= 6` and the holder is `whollyWithinUnit` 12" of it (the Hero qualifies for itself). One descriptor per unit, so it never stacks; Companion weapons are skipped by the engine (CORE-12.4). |
| FEC-RA-1 Crusading Army | (a) | Passive regiment, scope `{ who: 'self' }` (a regiment ability sits on every unit, Gloomspite / Daughters pattern), effects `[{ modifyRoll: { roll: 'advance', value: 1 } }, { modifyRoll: { roll: 'charge', value: 1 } }]`. |
| FEC-RA-2 Defenders of the Realm | (a) | Passive regiment, scope `{ who: 'self' }`, effect `{ modifyRoll: { roll: 'save', value: 1 }, when: { unitOnObjectiveControlledBy: 'self' } }` (hooks-impl `targetOnControlledObjective` = a model within objective range of a marker the holder's player controls). |
| FEC-ENH Ulguan Cloak | (b) `fecUlguanCloak` | Passive enhancement marker. los.ts `hiddenBeyondFor` reads `{ hiddenBeyond }` only off `unit.effects`, never off passive descriptors, so `ensureEffects` (run at the top of every ability window, idempotent) grants the bearer's unit a battle-long `{ hiddenBeyond: 12 }` effect. |
| FEC-ENH Blood-River Chalice | (b) `fecBloodRiverChalice` | Enhancement, `timing phase command / your`, `limit oncePerBattle`, scope bearer, params `{ heal: '2D3' }`. `canUse` needs a damaged general (so a use is never wasted); the log names the Chalice. |
| FEC-ENH Rousing Oration | (b) `fecRousingOration` | Enhancement, `timing phase command / your`, no declare. `canUse` = general on board and `deedsOf < 6`. Resolve: units = friendly on-board units ≠ general with `whollyWithinUnit(u, general, 12)`; roll `count = units.length` D6 (one `ctx.roll`, `mode: 'perDie'`), `addDeeds(general, number of 5+)`. |
| FEC-ENH Crimson Victuals | (b) `fecCrimsonVictuals` | Enhancement, `timing phase command / your`, `keywords ['SPELL']`, `castingValue 6`, `declare [{ role: 'unit', owner: 'enemy' }]`, params `{ range: 18, damage: 'D3', returnRange: 6 }`. Targets = enemy units within 18" of the general and visible. Resolve: note the Cryptguard unit within 6" of the target, snapshot the target's live model ids and `woundsRemaining`; `inflictMortal(ctx, use, target, rollExpr(D3))` (no attack sequence runs in the hero phase, so it resolves at once); allocated = Σ(before) − Σ(after, slain = 0) over the snapshot; then `returnSlainModels(ctx, cryptguard, allocated, abilityId)`. RULING: the 6" check is made before the damage (a target that is wiped out has no models to measure to). |
| FEC-AB-1 Deranged Transformation | (b) `fecDerangedTransformation` | Activated, `timing phase command / your`, `keywords ['SPELL']`, `castingValue 6`, `declare [{ role: 'unit', owner: 'friendly' }]`, `duration 'untilNextTurn'`, `params { range: 18, grant: [{ modifyStat: { stat: 'M', value: 2 } }, { modifyRoll: { roll: 'wound', value: 1 } }] }`. Targets = friendly units on board, visible to the Archregent, `whollyWithinUnit(t, self, 18)` (self included). Resolve: `effectService.grant` params.grant to the target (the Stormcast Shield of Azyr grant shape). Also carries the Archregent's deeds readout. |
| FEC-AB-2 Royal Bodyguard | (a) | Passive warscroll ability on Cryptguard, scope `{ who: 'friendly', within: 3, wholly: true, keyword: 'HERO' }` (hooks-impl `Scope.wholly` = every model of the other unit within range of the holder), effect `{ modifyRoll: { roll: 'feelNoPain', value: 1 } }` (the Daughters Blessing of Khaine ward modifier). |
| FEC-AB-3 Predator's Pounce | (a) | Passive, scope self, effects `{ chargeAfterFallBack: true, noRetreatDamage: true }` (Gloomspite / Idoneth flags). |
| FEC-AB-4 Victory Feast | (b) `fecVictoryFeast` | Warscroll ability on the Varghulf, `timing endOfTurn / any`, no declare (self), params `{ heal: 'D6' }`. Activated descriptors are not hook source entries, so the kill is recorded by the passive battle trait: `fecNobleDeeds.onEnemyModelSlain(ctx, entry)` (attack.ts calls it for every source held by the slaying unit) writes `mission.custom.fecFeast[unitId] = '<round>:<activePlayer>'`. `canUse` = the record equals the current turn key. Resolve: clear the record, `healUnit(ctx, self, rollExpr(D6))`; if `inCombat(self)` and `retreatOptions` has a move, `writeMoveQueue(s, { abilityId, player, maxDistance: Move, queue: [self], kind: 'retreat' })` (`applyRetreat` never deals retreat damage; the options include "stay", which makes the Retreat optional) and set `turn.moveType = 'fallBack'`. The end-of-turn ability window drains move queues like every other window (abilities.ts). Also carries the Varghulf's deeds readout. |

**Engine changes (c):** none (the F18 engine-core items `modesFor` with declared targets and `UNLIMITED` per-Hero tracking are used as they stand). Verified while building:
- `onOwnFightResolved` is called for the **battle-trait** code (attack.ts `ownAbilityCodes`), as Soulblight's Hunger relies on. `onEnemyModelSlain` is asked of every source entry held by the slaying unit, passive battle traits included.
- The `endOfTurn` window drains a queued Retreat (abilities.ts `nextStep`) before control is evaluated; tested with the real window.
- `factionResources` lists datasheet-ability readouts per unit (it does, hooks-impl.ts), so two Hero counters show side by side.

---

## 8. Engine notes

1. **Casting budget:** Deranged Transformation and Crimson Victuals share the Archregent's single cast per hero phase
   (`castingLevel` 1). A failed or unbound cast still spends it.
2. **Noble deeds sources:** only the Hero's own Fight ability (any combat phase, including fights granted out of sequence) and
   Rousing Oration. Mortal damage from Crimson Victuals is not a Fight and gives nothing. Damage negated by a ward is not allocated.
3. **Feeding Frenzy is binary:** it switches on only at 6 points, so spending points with Summon Loyal Subjects switches it off.
   The AI must weigh that (see 6).
4. **Heroes' ward:** Royal Bodyguard adds to the ward roll (6+ → 5+). A modified ward roll still fails on a natural 1.
5. **Victory Feast and Varghulf positioning:** the free end-of-turn Retreat happens after the enemy's combat phase too, so the
   Varghulf can leave a fight it started in the enemy turn, then charge again in its own turn (no Predator's Pounce needed, since
   the Retreat was last turn).
6. **AI** (`fecAbilityTiming` / `fecTargetBonus` / `fecModeBonus`, wired in `src/ai/utility.ts`): Summon Loyal Subjects — spend only when (a) the Hero is below 6 and cannot reach 6 next combat anyway, or (b) a Knights
   model can return (2 points for 4 Health is the best rate); otherwise keep 6 for Feeding Frenzy while friendly melee units are
   wholly within 12". Deranged Transformation — the friendly unit about to charge (Knights or Varghulf) or one 2" short of an
   objective; Crimson Victuals over Deranged Transformation when the Cryptguard are below half and within 6" of a damaged enemy, or
   when D3 kills a unit. Rousing Oration — every hero phase while the general is below 6 with ≥ 2 units wholly within 12".
   Blood-River Chalice — when the general has ≥ 4 damage. Victory Feast Retreat — take it when the Varghulf would otherwise stay in
   combat with an enemy whose melee damage estimate ≥ its remaining Health, or when a Retreat lands it on an objective.
7. **Defaults for the sim:** regiment Crusading Army, enhancement Ulguan Cloak (both passive); variant games Defenders of the Realm
   and Rousing Oration.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| FEC-ARMY-1 | Carrion Retainers builds: Archregent general + 10 Cryptguard + 3 Morbheg Knights + Varghulf Courtier, 15 models, stats as §5. |
| FEC-ARMY-2 | Reinforcements only on the Cryptguard; Knights, Varghulf and Archregent never offered for replacement. |
| FEC-ARMY-3 | Archregent has casting level 1, no Wizard keyword: casts one spell per hero phase, never unbinds. |
| FEC-BT-1 | Noble Deeds: a Hero's Fight gives points equal to damage allocated (ward-saved points excluded), capped at 6; non-Heroes gain nothing; each Hero keeps its own tally. |
| FEC-BT-2 | Summon Loyal Subjects: 1 point returns 1 Cryptguard, 2 points return 1 Knight, both within 9" of the spending Hero; never above starting strength; only spent points for models placed; movement phase only. |
| FEC-BT-3 | Feeding Frenzy: +1 Attacks to melee weapons wholly within 12" of a 6-point Hero; none at 5 points; Companion weapons unchanged; two 6-point Heroes still +1. |
| FEC-RA-1 | Crusading Army: +1 to run rolls and charge rolls for every friendly unit. |
| FEC-RA-2 | Defenders of the Realm: +1 save only while contesting an objective you control; none on a contested or enemy-held marker. |
| FEC-ENH-1 | Ulguan Cloak: enemy models more than 12" away cannot see (or shoot) the general; within 12" they can. |
| FEC-ENH-2 | Blood-River Chalice: heals 2D3 on the general once per battle in your hero phase. |
| FEC-ENH-3 | Rousing Oration: one D6 per friendly unit wholly within 12" except the general; each 5+ gives the general 1 point, cap 6. |
| FEC-ENH-4 | Crimson Victuals: casting 6+ deals D3 mortal to a visible enemy within 18"; with the Cryptguard within 6" of the target, returns one Cryptguard model per damage point allocated; shares the one cast with Deranged Transformation; can be unbound. |
| FEC-AB-1 | Deranged Transformation: casting 6+ gives a friendly unit wholly within 18" +2" Move and +1 to wound until your next turn. |
| FEC-AB-2 | Royal Bodyguard: +1 to ward rolls for a Hero wholly within 3" of the Cryptguard; none when only partly within. |
| FEC-AB-3 | Predator's Pounce: Knights can charge after Retreating and take no Retreat mortal damage. |
| FEC-AB-4 | Victory Feast: at the end of a turn in which the Varghulf slew a model it heals D6 and may Retreat with no mortal damage; nothing if it slew nothing. |
| FEC-WEAP-1 | Grisly Lance deals 2 damage on a turn the Knights charged, 1 otherwise; Nightshrieker's Claws are Companion. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own "mad court" livery): sickly grey-green and corpse-pale skin, dried-blood crimson and rusty
red rags worn as "royal" tabards, tarnished gold paper crowns and goblet trim, bone-white bone ornaments, bat-wing purples on the
flying beasts. Shared motif: an original crooked three-point crown stitched on cloth. No GW logos, no copied Flesh-eater Courts
heraldry. All figures are in the house figure style (docs/FIGURE-STYLE.md); the mounts and the
Varghulf are chunky beasts. Gore is kept cartoon-light (solid red splashes, no exposed anatomy).

| Slug | Unit | Models needed | Base (mm) | Mount | Concept prompt |
|---|---|---|---|---|---|
| `fec-abhorrant-archregent` | Abhorrant Archregent | 1 | 40 round | No | A vampire king with a pale bald head, pointed ears, big red eyes and a fanged grin, a lopsided gold paper crown, a tattered crimson cape over a bony grey body with short clawed legs, one long-taloned hand raised in a dramatic royal gesture. |
| `fec-cryptguard` | Cryptguard | 1 (×10) | 25 round | No | A ghoul guard with a grey-green head, wide hungry eyes and a drooling toothy mouth, a dented helmet too big for it, a rusty breastplate and crimson rag tabard, short legs, holding a notched old halberd proudly like a knight. |
| `fec-morbheg-knight` | Morbheg Knights | 1 (×3) | 75×42 oval | Yes (Nightshrieker) | A chunky giant bat-beast with huge ears, a squashed snout, big leathery purple wings folded up and powerful frog-like hind legs crouched to leap, ridden by a ghoul knight with a head, a crooked crown-helm and a long bone-tipped lance. |
| `fec-varghulf-courtier` | Varghulf Courtier | 1 | 90×52 oval | No (monster-sized single model) | A chunky hunched vampire beast, round and top-heavy with a bat-eared head, giant fangs and glowing red eyes, oversized clawed forearms knuckling the ground, short short hind legs, ragged purple bat wings and a scrap of crimson cloak with a tiny gold crown stuck on one ear. |

The Cryptguard use one figure for all 10 models: the Spearhead gives no champion, standard or musician rules. The three Knights
are identical in the rules. Charnel Watch figures (Appendix A) are listed there.

---

## 11. Implementation notes

Built 2026-10-31 (F18). Layout, matching the other armies: data `src/data/factions/fec/` (faction.json, datasheets/{abhorrant-
archregent, cryptguard, morbheg-knights, varghulf-courtier}.json, weapons.json, abilities.json, enhancements.json,
patrols/carrion-retainers.json); hooks `src/engine/factions/fec.ts` (`...fecHooks` in `code-hooks.ts`); tests
`tests/engine/fec.test.ts`, `tests/data/fec.test.ts` (one test per FEC- id). Patrol `battleTraits: ['fec.ability.noble-deeds',
'fec.ability.summon-loyal-subjects', 'fec.ability.feeding-frenzy']`, regiment list Crusading Army (default) then Defenders of the
Realm, enhancement list Ulguan Cloak (default), Blood-River Chalice, Rousing Oration, Crimson Victuals. Figure mapping keys
`<datasheet id>/<modelId>`. The AI hints are three dispatch lines in `src/ai/utility.ts` (timing, target bonus, mode bonus) calling `fecAbilityTiming`,
`fecTargetBonus` and `fecModeBonus`. Extra tests beyond the id table: FEC-REG (every code resolves), FEC-BT-2b (range, once per phase, leftover
points), FEC-AI (hints). Figure mapping, crest, start-screen blurb and palette entries are the client's, not part of this file set.

---

## Appendix A — Charnel Watch (separate PDF, listed 2025-08-27; out of scope)

Army id if ever built: `fec.army.charnel-watch`. General: **Abhorrant Gorewarden**. Units: 10 Royal Beastflayers, 3 Crypt Horrors,
3 Crypt Flayers. 17 models. Stats below are from the PDF text layer; re-check against the page images before building.

**Battle traits.**
- `CHW-BT-1` Delusions and Madness — mandatory, once per battle round (army), start of each battle round. Round 1: pick a Delusion.
  Later rounds: roll a D6 (the "delusion roll"); 1–3 you must pick a **different** Delusion from last time, 4+ the **same** one.
  You "believe" the picked Delusion for the round. The Delusion pool = the two battle-trait Delusions below + the Delusion from
  the chosen regiment ability (RULING to confirm: the regiment abilities are themselves Delusions).
- `CHW-BT-2` Delusion of the Great Feast — once per turn (army), end of any turn, only while believed: every friendly unit Heals (1);
  a **Serfs** unit instead returns D3 slain models.
- `CHW-BT-3` Delusion of the Knightly Host — passive while believed: when a friendly **Hero** or **Knights** unit's unmodified charge
  roll is 8+, it adds 1 to hit rolls for its melee attacks for the rest of the turn.

**Regiment abilities (both Delusions, passive while believed).** `CHW-RA-1` Delusion of the Sentinel: +1 to ward rolls for friendly
units while every model in the unit is contesting an objective. `CHW-RA-2` Delusion of the Hunter: +1 to wound rolls for melee
attacks of friendly units while no model in the unit is contesting an objective.

**Enhancements.** Almost Lucid (once per battle, reaction: you declared Delusions and Madness: re-roll the delusion roll);
Companion of the Hunt (end of any turn: if the general is not in combat it may move 3", never into combat); A Worthy Challenge
(once per battle, any combat phase: pick an enemy unit that began the battle with 3 or fewer models and is in combat with the
general; the opponent accepts — for the phase the general and that unit must aim every attack at each other — or refuses — that
unit has Strike-last for the phase); Choirmaster (once per battle, your shooting phase: pick a visible enemy unit within 6" of the
general; for the rest of the turn friendly ranged weapons get +1 Damage against it).

**Warscrolls.**

| Unit | Move | Health | Save | Control | Ward | Keywords | Base (mm, Wahapedia) |
|---|---|---|---|---|---|---|---|
| Abhorrant Gorewarden (General) | 12" | 7 | 5+ | 2 | 6+ | Hero, Wizard, Infantry, Fly | 40 round |
| Royal Beastflayers (10) | 6" | 1 | 6+ | 1 | 6+ | Infantry, Serfs | Flaymaster + Baron 32, 2 Offal Hounds 40, 3 Trackers 25, 3 Gore-Squires 28.5 round |
| Crypt Horrors (3) | 7" | 4 | 5+ | 1 | 6+ | Infantry, Knights, Reinforcements | 50 round |
| Crypt Flayers (3) | 12" | 4 | 5+ | 1 | 6+ | Infantry, Knights, Fly | 50 round |

| Weapon | Unit | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|---|
| Gory Talons and Fangs | Gorewarden | Melee | — | 5 | 3+ | 3+ | 1 | 2 | — |
| Beastflayer Weapons | Royal Beastflayers | Melee | — | 3 | 4+ | 4+ | — | 1 | — |
| Club and Septic Talons | Crypt Horrors | Melee | — | 4 | 4+ | 3+ | 1 | 2 | — |
| Death Scream | Crypt Flayers | Ranged | 10" | 4 | 4+ | 3+ | 2 | 1 | Shoot in Combat |
| Piercing Talons | Crypt Flayers | Melee | — | 4 | 4+ | 3+ | 1 | 1 | — |

**Abilities.** Sound the Pursuit (Gorewarden, your hero phase, casting 6+: a friendly unit wholly within 12" rolls one extra
charge die, max 3, until your next turn, and drops one die of its choice). Lie of the Land (Beastflayers, your movement phase: if
not in combat and wholly within 6" of a battlefield edge, remove and set up again wholly within 6" of a battlefield edge and more
than 6" from every enemy unit). Holy Blades of Bone (Crypt Horrors, any combat phase: pick an enemy unit in combat with them that
charged this turn; D6 per model in it, each 5+ = 1 mortal damage). Unholy Chorus (Crypt Flayers, your shooting phase: pick a
visible enemy unit within 10"; for the rest of the turn subtract from its control score the damage points this unit's shooting
allocated to it this phase).

**Figures (if built).** `fec-abhorrant-gorewarden` (1, 40 round: winged vampire with a head, big ring of keys and
a crown, bat wings); `fec-royal-beastflayer` (ghoul hunters on 25/28.5 round), `fec-royal-flaymaster` (32 round, vampire
huntsman with a hunting horn), `fec-offal-hound` (40 round, chunky mutant ghoul-hound); `fec-crypt-horror` (1 ×3, 50 round:
chunky swollen ghoul brute with a femur club); `fec-crypt-flayer` (1 ×3, 50 round: chunky ghoul with leathery bat wings
and an open screaming mouth, solid purple sound rings).
