# Disciples of Tzeentch — Tzaangor Warflock (Spearhead)

Faction id: `tzeentch` · Army id: `tzeentch.army.tzaangor-warflock` · Grand alliance: Chaos.
Source: `docs/sources/spearhead-disciples-of-tzeentch.pdf` (4 pages, 2.4 MB, gitignored), "Spearhead: Disciples of Tzeentch -
Tzaangor Warflocks", the free Warhammer Community download (Age of Sigmar, Spearhead category). Listed 2026-02-04 (PDF
metadata: created and modified 2025-12-19). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_04-02_aos_spearhead_disciples_of_tzeentch-4mldohmkit-qcunidsq7c.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, search term
"tzeentch"). The PDF prints no base sizes. Those come from the Wahapedia aos4 warscroll pages
(`wahapedia.ru/aos4/factions/disciples-of-tzeentch/Tzaangor-Shaman`, `/Tzaangor-Enlightened`, `/Tzaangor-Skyfires`,
`/Tzaangors`), fetched the same day with plain curl. Stats were checked against the rendered pages.

**Which army.** Games Workshop publishes two separate Tzeentch Spearhead PDFs. **Tzaangor Warflock** (this PDF: Tzaangor
Shaman, 10 Tzaangors, 3 Tzaangor Enlightened, 3 Tzaangor Skyfires) is the army in the current **Spearhead: Disciples of
Tzeentch** box (the new Tzaangor kits), so it is the army this spec builds. **Fluxblade Coven** (a second download, 14 pages,
listed 2026-04-01, `https://assets.warhammer-community.com/eng_01-04_aos_spearhead_disciples_of_tzeentch_fluxblade_coven-maph6dtofo-iasdohuesc.pdf`)
is the older army (Magister on Disc, Flamers, Screamers, 2×5 Tzaangors, Kairic Acolytes). It is out of scope; its rules are
recorded in Appendix A so it can be added later without reopening the PDF. That PDF was read but not kept in `docs/sources/`.

Mechanics and numbers are ported 1:1. All wording below is our own. Rule IDs `DOT-*` double as test IDs (§9).

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of
an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run =
`advance`, Retreat = `fallBack`. Rend is stored as `AP` (negative = more Rend). "Ward (N+)" = `feelNoPain: N`. "Underdog" =
`state.underdog` (CORE-4.11: the player with fewer VP at the start of the battle round; none on a tie, so none in round 1).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `tzeentch.unit.tzaangor-shaman` | Tzaangor Shaman (on a Disc) | 1 | **General** | no | 40 round (Wahapedia) |
| `tzeentch.unit.tzaangors` | Tzaangors | 10 | Unit | no | 32 round (Wahapedia) |
| `tzeentch.unit.tzaangor-enlightened` | Tzaangor Enlightened (on Discs) | 3 | Unit (reserve, DOT-BT-1) | no | 40 round (Wahapedia) |
| `tzeentch.unit.tzaangor-skyfires` | Tzaangor Skyfires (on Discs) | 3 | Unit | no | 40 round (Wahapedia) |

Total: 4 units, 17 models. **No warscroll prints the Reinforcements keyword**, so Call for Reinforcements (SPH-12) never
applies to this army. One Wizard (the Shaman, power level 1 per Wahapedia; the PDF prints "Wizard" only); no Priest. The
Shaman, Enlightened and Skyfires have **Fly**; the Tzaangors do not. No warscroll prints a Ward. The Shaman is the only Hero.
The Enlightened start off the table (DOT-BT-1).

---

## 2. Battle traits

### DOT-BT-1 `tzeentch.ability.fated-arrival` — Fated Arrival (reserve)
- **Setup:** the Tzaangor Enlightened unit is **not set up in the deployment phase**; it starts in reserve.
- **Timing:** Your movement phase, **from battle round 2** onwards (rounds 2 and 3 in practice, see below).
- **Effect:** Set the unit up **wholly within friendly territory**, **within 1" of a battlefield edge** (any edge) and **more
  than 6" from every enemy unit**.
- RULING: "within 1" of a battlefield edge" is met when at least one model's base is within 1" of an edge (CORE "within" for a
  unit); every model must still be wholly within friendly territory.
- RULING: core reserve destruction applies as for 'Ere We Go / Chameleon Ambush (CORE-4.14): an Enlightened unit still in
  reserve at the start of round 4 is destroyed (test DOT-BT-2).
- CORE-6.13: having been set up this turn, the unit cannot use Move abilities in that movement phase; it may still shoot and
  charge.

### DOT-BT-3 `tzeentch.ability.predict-the-future` — Predict the Future
- **Timing:** Your hero phase (once per phase for the army, CORE-3.4).
- **Effect:** Look at up to the **top 3 cards** of your battle tactic deck (fewer if the deck holds fewer) without adding
  them to your hand. Put each one back face down on **either the top or the bottom** of the deck, in any order you like.
- Nothing is revealed to the opponent. With an empty deck it does nothing (the engine does not offer it).

### DOT-BT-4 `tzeentch.ability.cheat-destiny` — Cheat Destiny
- **Timing:** Reaction: you used the **command on a battle tactic card**.
- **Effect:** Instead of discarding that card, put it face down on the **bottom of your battle tactic deck**.
- RULING: no limit is printed; it is used at most **once per phase** for the army (CORE-3.4, the SKV-BT-1 reading). It is
  optional (a player may want the discard, see DOT-ENH-3).
- A card returned this way was never discarded: it does not count for Infernal Gateway (DOT-ENH-3).

---

## 3. Regiment abilities (pick 1 at army selection)

### DOT-RA-1 `tzeentch.ability.constant-flux` — Constant Flux
- **Timing:** Passive.
- **Effect:** While **you are the underdog**, subtract **1** from the **Rend** of weapons used for attacks that **target
  friendly units** (any attacker, shooting and combat, Companion weapons included).
- Rend never goes below 0 (a Rend "–" weapon is unchanged).

### DOT-RA-2 `tzeentch.ability.arcane-ritualists` — Arcane Ritualists
- **Timing:** Passive.
- **Effect:** Add **1** to **casting rolls** for your general while the general is **wholly within 6" of another friendly
  unit** (every model of the general has some model of that other unit within 6"; the PDF reads "while they are wholly
  within 6" of another friendly unit"). Fixed 2026-10-30: this file first had the two units the wrong way round (every model
  of the other unit wholly within 6" of the general), which is far harder to meet for a 10-model unit.
- Casting rolls only, not unbinding rolls. A miscast is still an unmodified double 1. The modified total is what an enemy
  unbind roll must beat.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `tzeentch.enh.predicted-strike` (DOT-ENH-1) | Predicted Strike | **Once per battle**, enemy movement phase | Declare: pick a **visible** friendly unit **wholly within 12"** of the general that is **not in combat**. Effect: it may move up to **D6"**. It may not pass through any enemy unit's combat range and may not end in combat. |
| `tzeentch.enh.fold-reality` (DOT-ENH-2) | Fold Reality | Your hero phase | Declare: pick a **visible** friendly unit **wholly within 12"** of the general, then make a casting roll of 2D6. Effect: on **6+**, remove it from the battlefield and set it up again **wholly within 12" of the general** and **more than 6" from every enemy unit**. |
| `tzeentch.enh.infernal-gateway` (DOT-ENH-3) | Infernal Gateway | Your hero phase | Declare: pick a **visible enemy** unit **within 18"** of the general, then make a casting roll of 2D6. Effect: on **5+**, roll **3 dice, or one die per battle tactic card you have discarded this battle** (your choice); each **4+** inflicts **1 mortal damage** on the target. |
| `tzeentch.enh.mutagenic-sorcery` (DOT-ENH-4) | Mutagenic Sorcery | End of any turn | Declare: pick a **visible enemy** unit **within 12"** of the general (enemy target), then a friendly **Tzaangors** unit **in combat with** it (friendly target). Effect: roll a **D3**. On **2+**, the enemy target suffers **mortal damage equal to the roll**, and you **may return 1 slain model** to the Tzaangors. |

RULING (spells): Fold Reality and Infernal Gateway ask for a casting roll but print no Spell keyword. As for the Skaven
Skitterleap and Wither, they are treated as **Spells** with casting value 6 and 5 (can be unbound, miscast on a double 1, use
one of the Shaman's casts for the phase). The same holds for Mutative Aura (DOT-AB-1, casting value 7).
RULING (Fold Reality): the general cannot pick itself: once removed, "wholly within 12" of your general" cannot be measured.
A unit in combat may be picked (the card does not forbid it); it is set up more than 6" from enemies, so it leaves combat.
The moved unit is "set up" this turn (CORE-6.13: no Move abilities in this turn's movement phase).
RULING (Infernal Gateway): more dice never hurt, so the engine rolls `max(3, discarded)` dice without asking. "Discarded this
battle" = the cards in your discard pile (SPH-10.2 hand discards and used commands; scored cards and cards sent back by Cheat
Destiny are not in it).
RULING (Predicted Strike): the general may pick its own unit (it is wholly within 12" of itself). "Visible" = visible to the
general for all four enhancements.
Mutagenic Sorcery has no printed limit: once per turn (CORE-3.4; end of turn is one step). It needs the general on the
battlefield and the Tzaangors in combat with the target. Returning a model is optional and needs a slain model (CORE-6.14).

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. **No warscroll in this army prints a Ward.** Printed keywords only
(Spearhead warscrolls print no faction keywords; Wahapedia adds CHAOS, DISCIPLES OF TZEENTCH, ARCANITE, WARFLOCK, which no
rule here reads). Champion / Musician / Standard Bearer exist only on the matched-play warscrolls, not here.

### 5.1 `tzeentch.unit.tzaangor-shaman` — Tzaangor Shaman (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 14" | 6 | 5+ | 2 | — |

Keywords: **Hero, Wizard, Cavalry, Fly** (Wizard power level 1)

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Staff of Change and Ritual Dagger (`tzeentch.weapon.staff-of-change`) | Melee | — | 3 | 4+ | 3+ | 1 | D3 | — |
| Disc's Teeth and Horns (`tzeentch.weapon.discs-teeth-and-horns`) | Melee | — | 2 | 4+ | 3+ | 1 | D3 | Companion |

**DOT-AB-1 `tzeentch.ability.mutative-aura` — Mutative Aura** (Spell, casting value 7, RULING §4)
- **Timing:** Your hero phase.
- **Declare:** Pick a **visible enemy** unit **within 18"** of this unit, then make a casting roll of 2D6.
- **Effect:** On **7+** (not unbound), until the **start of your next turn**: every time an **unmodified hit roll of 1** is
  made for a **combat attack** by that target, the target suffers **1 mortal damage**, applied **after its Fight ability has
  resolved** (all such damage from one Fight lands together, ward applies).
- Notes: shooting attacks do not count. Companion weapons count (their hit rolls are the target's combat attacks). The roll
  that counts is the final die after any re-roll. Auto-hitting weapons roll no hit dice and never trigger it.

### 5.2 `tzeentch.unit.tzaangors` — Tzaangors
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 2 | 5+ | 1 | — |

Keywords: **Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Savage Blades and Vicious Beak (`tzeentch.weapon.savage-blades`) | Melee | — | 3 | 4+ | 3+ | 1 | 1 | — |

Loadout: all 10 models carry the same weapon (the kit's sword-and-shield and paired-blade builds share one profile).

**DOT-AB-4 `tzeentch.ability.eldritch-raiders` — Eldritch Raiders**
- **Timing:** Passive.
- **Effect:** Add **1** to **wound rolls** for this unit's attacks while the unit is **wholly within enemy territory** (every
  model wholly within the opponent's territory, SPH-1.4).

### 5.3 `tzeentch.unit.tzaangor-enlightened` — Tzaangor Enlightened
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 14" | 4 | 4+ | 1 | — |

Keywords: **Cavalry, Fly**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Tzeentchian Spear and Vicious Beak (`tzeentch.weapon.tzeentchian-spear`) | Melee | — | 3 | 4+ | 3+ | 1 | 2 | — |
| Disc's Teeth and Horns (`tzeentch.weapon.discs-teeth-and-horns`) | Melee | — | 2 | 4+ | 3+ | 1 | D3 | Companion |

**DOT-AB-2 `tzeentch.ability.deliver-on-fate` — Deliver on Fate**
- **Timing:** Passive.
- **Effect:** Add **1** to **charge rolls** for this unit while **you are the underdog**.

### 5.4 `tzeentch.unit.tzaangor-skyfires` — Tzaangor Skyfires
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 14" | 4 | 4+ | 1 | — |

Keywords: **Cavalry, Fly**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Arrow of Fate (`tzeentch.weapon.arrow-of-fate`) | Ranged | 18" | 2 | 4+ | 3+ | 1 | 2 | — |
| Bow Stave and Vicious Beak (`tzeentch.weapon.bow-stave`) | Melee | — | 1 | 4+ | 3+ | — | 1 | — |
| Disc's Teeth and Horns (`tzeentch.weapon.discs-teeth-and-horns`) | Melee | — | 2 | 4+ | 3+ | 1 | D3 | Companion |

No ranged weapon has Shoot in Combat.

**DOT-AB-3 `tzeentch.ability.destined-quarry` — Destined Quarry**
- **Timing:** Your shooting phase (once per phase for this unit), after this unit has shot.
- **Declare:** Pick an **enemy unit** that had **at least 1 damage point allocated** to it **this phase by this unit's
  shooting attacks** (after wards).
- **Effect:** For the **rest of the turn**, add **1** to **hit rolls** for **combat attacks** made by **friendly units** that
  target that enemy unit.
- Notes: no visibility or range check at the declaration. The bonus is a hit-roll modifier, so it reaches Companion weapons
  (CORE-12.4 bars only characteristic changes) and is capped at +1 with any other hit modifier (CORE hit cap).

---

## 6. Spells and prayers

Mutative Aura (DOT-AB-1, CV 7, on the Shaman's warscroll) plus, with the matching enhancement, Fold Reality (CV 6) or
Infernal Gateway (CV 5) (RULING §4). The Shaman is a Wizard (1): **one cast attempt per hero phase**, so each hero phase it is
Mutative Aura **or** the enhancement spell; a failed or unbound attempt still spends it. Arcane Ritualists adds +1 to these
casting rolls. The Shaman may attempt to unbind one enemy spell per enemy hero phase (CORE-15.6, automatic in the engine). No
lore, no manifestations, no Priest.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/tzeentch/*.json`), at most reusing an existing code hook; (b) = new
faction code hook in `src/engine/factions/tzeentch.ts`, exported as `tzeentchHooks` and spread into `code-hooks.ts` like
`skavenHooks`. Shared helpers from `aos-common.ts`: `onBoard`, `whollyWithinUnit`, `unitGap`, `inCombat`, `enemiesInCombat`,
`inflictMortal`, `announce`, `paramOf`, `isDatasheet`, `returnSlainModels`, `returnableModels`; `generalOf` as in
`kruleboyz.ts`; visibility via `losService.unitVisible`. (c) = engine change outside the faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, power level, bases | (a) | Datasheets as the other armies; `HERO`, `WIZARD`, `CAVALRY`, `FLY`, `INFANTRY`; Shaman `wizard: 1`; all bases `{ shape: 'round', mm: 40 }` / `32`. No `REINFORCEMENTS` keyword anywhere, so `spearheadCallForReinforcements` never offers a unit. |
| Disc's Teeth and Horns (Companion) | (a) | One shared weapon id with `abilities: [{ ability: 'COMPANION' }]` on all three disc datasheets (Seraphon / Gloomspite pattern). |
| DOT-BT-1 Fated Arrival | (a) + (c) C2 | Passive marker `tzeentch.ability.warflock-ambush` (text) in `battleTraits` + activated `tzeentch.ability.fated-arrival` (`phase movement / your`, `fromRound: 2`, `params { fromRound: 2, minEnemyDistance: 6, anywhere: false, territory: true, edgeWithin: 1 }`); patrol entry for the Enlightened carries `reserve: { ability: 'tzeentch.ability.fated-arrival' }`. Movement's reserve-arrival step and the round-4 destruction do the rest once C2 lands. |
| DOT-BT-3 Predict the Future | (b) `tzeentchPredictTheFuture` | Army ability, `timing phase command / your`, no declare. `canUse` = `cardsOf(s).tactics[p].deck.length > 0`. Resolve takes `n = min(3, deck.length)` top cards (`deck[0]` is the top, cards.ts draws from the front) and raises one `chooseOption { topic: 'abilityChoice', data: { code, cards } }` per card, answered by the hook's `answer`: options `top:<id>` / `bottom:<id>`; then, if 2+ went on top, one more pick "which goes on the very top" (approximation: with 3 on top the other two keep their looked-at order). Bottom cards are appended in the order chosen. Writes `cards.tactics[p].deck`. The decision context lists card ids; it is the owner's decision, so `redactCards` / the opponent view must not show it (same rule as the hand). |
| DOT-BT-4 Cheat Destiny | (b) `tzeentchCheatDestiny` + (c) C4 | Battle trait carrying `code`; `onTacticCommandUsed` (C4) raises `chooseOption { topic: 'abilityChoice', canPass: true, data: { code, cardId } }` unless used this phase (mark `tz:cheat`); `answer` → `returnTacticToDeckBottom(s, p, cardId)` and announce. |
| DOT-RA-1 Constant Flux | (b) `tzeentchConstantFlux` | Passive regiment descriptor with `code`; the regiment ability sits on every friendly unit (hooks-impl `sourcesFor`). `statDelta(state, entry, q)`: when `q.stat === 'AP'`, `q.attack?.targetUnitId === entry.holderUnitId`, `state.underdog === holder.player` and `q.weapon.rend > 0` (base) → `+1` (AP is −Rend; `effectiveWeapon` floors Rend at 0 anyway). `affectsCompanion: true` so enemy Companion weapons are reduced too (an enemy ability, not a friendly characteristic change). |
| DOT-RA-2 Arcane Ritualists | (b) `tzeentchArcaneRitualists` + (c) C1 | Passive regiment descriptor with `code`; `castingRollBonus(state, entry, casterUnitId)` = 1 when `casterUnitId === entry.holderUnitId`, the holder is the general and some other friendly unit on the board has the general `whollyWithinUnit(general, other, 6)`. |
| DOT-ENH-1 Predicted Strike | (b) `tzeentchPredictedStrike` | Enhancement, `timing phase movement / enemy`, `limit oncePerBattle`, `keywords ['MOVE']`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params.range 12`. Targets = friendly units on board, `whollyWithinUnit(t, general, 12)`, not `inCombat`, visible to the general (self allowed). Resolve: `d = rollExpr('D6')`; `writeMoveQueue(s, { abilityId, player, maxDistance: d, queue: [target], opts: { noCombatPath: true } })` (F14 `noCombatPath`: the normal-move path test even for FLY units, implies `mayNotEndInCombat`). Offered in the end-of-movement window of the enemy phase (the SKV-BT-1 window). |
| DOT-ENH-2 Fold Reality | (b) `tzeentchFoldReality` | Enhancement, `timing phase command / your`, `keywords ['SPELL']`, `castingValue 6`, `declare [{ role: 'unit', owner: 'friendly' }]`. Targets = friendly units on board other than the general, `whollyWithinUnit(t, general, 12)`, visible. Resolve (only on a cast): `liftForRedeploy` then `requestRedeploy(s, { abilityId, player, unitIds: [target], minEnemyDistance: 6, anchor: { unitId: general, whollyWithin: 12 }, origin, markSetUp: true })` (LRL-AB-4 / KO-BT-1 pattern). |
| DOT-ENH-3 Infernal Gateway | (b) `tzeentchInfernalGateway` | Enhancement, `timing phase command / your`, `keywords ['SPELL']`, `castingValue 5`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params.range 18`. Targets = enemy units on board within 18" of the general (`unitGap`) and visible. Resolve: `n = max(3, cardsOf(s).tactics[p].discard.length)`; roll `n` D6; `inflictMortal(ctx, use, target, count of 4+)`. |
| DOT-ENH-4 Mutagenic Sorcery | (b) `tzeentchMutagenicSorcery` | Enhancement, `timing endOfTurn / any`, `limit oncePerTurn`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params.range 12`. Targets = enemy units on board within 12" of the general, visible to it, and in combat with a friendly unit for which `isDatasheet(…, 'tzaangors')`. Resolve: `r = rollExpr('D3')`; on `r >= 2`: `inflictMortal(ctx, use, enemy, r)`, then `returnSlainModels(ctx, tzaangors, 1, abilityId)` when `returnableModels > 0` (always taken: no downside). |
| DOT-AB-1 Mutative Aura | (b) `tzeentchMutativeAura` + (c) C3 | Activated, `timing phase command / your`, `keywords ['SPELL']`, `castingValue 7`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params.range 18`. Resolve: `effectService.grant(ctx, target, {}, { sourceAbilityId, sourceUnitId: caster, scope: { who: 'self' }, duration: 'untilNextTurn' })` (marker effect on the enemy target) and then `active.expires = { kind: 'nextOwnTurn', round, player: caster player }`: `grant` ties `untilNextTurn` to the player that holds the effect, which would end the aura at the start of the ENEMY's turn, one turn too early. The same hook's `afterAttackSequence(ctx, entry, info)` (C3): when `entry.active` is set, `info.attackerUnitId === entry.holderUnitId`, `info.combat` and `info.hitOnes > 0` → `deferMortalAfterFight(s, { targetUnitId: holder, count: info.hitOnes, source: abilityId, player: caster player })` (STD-AB-4 plumbing: drained when the Fight activation ends, ward applies). |
| DOT-AB-2 Deliver on Fate | (a) + (b) gate `tzeentchUnderdog` | Passive descriptor `trigger chargeRoll`, `effect { modifyRoll: { roll: 'charge', value: 1 } }`, `code: 'tzeentchUnderdog'`; the hook is a bare `gate: (state, holder) => state.underdog === holder.player` (Ironjawz Mega-bossy pattern). |
| DOT-AB-3 Destined Quarry | (b) `tzeentchDestinedQuarry` | Activated, `timing phase shooting / your`, `declare [{ role: 'unit', owner: 'enemy' }]`. Targets = `damagedByShootingThisPhase(state, self)` (LRL-AB-3, after wards). Offered in the existing `shooting:after:<unitId>` window. Resolve: `effectService.grant(ctx, target, [{ when: { weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: 1 } }], { scope: { who: 'attacker' }, duration: 'untilEndOfTurn' })` (Khorne Evasive Hunter / Kruleboyz grant pattern: `who: 'attacker'` applies to attacks that target the holder). |
| DOT-AB-4 Eldritch Raiders | (a) + (b) gate `tzeentchEldritchRaiders` | Passive descriptor `trigger woundRoll`, `effect { modifyRoll: { roll: 'wound', value: 1 } }`, `code` gate: every live model of the holder `whollyWithinPolygon(fp(m), territoryOf(state, opponent(holder.player)))` (`stormcast.ts` `objectiveWhollyInTerritory` pattern; a model on the dividing line is not wholly within, SPH-1.4). |
| Spell budget, unbind | (a) | `magic.ts` already counts one cast per phase for a Wizard (1) across Mutative Aura and the enhancement spell, and runs the Shaman's unbind. |

**Engine changes (c):**
- **C1 casting roll bonus** (`magic.ts`, `code-hooks.ts`): `EngineCodeHook + castingRollBonus?(state: GameState, entry:
  HookSourceEntry, casterUnitId: UnitId): number`. `castingRoll` sums the answers of every source entry held by the caster
  (`sourcesFor`, `gateOpen`) and uses `total = dice + bonus` for the casting-value test and the unbind comparison; the miscast
  test stays on the unmodified dice. The `AbilityTriggered` summary shows "rolled X+1". No frozen file changes.
- **C2 territory / edge arrival** (`phases/movement.ts`, `factions/aos-moves.ts`): `ArrivalParams` and `SetUpParams + territory?:
  boolean, edgeWithin?: number`. `setUpConstraints` uses `region = territoryOf(state, player)` when `territory` (today
  `anywhere: false` means the deployment zone, which is smaller than the territory in Spearhead, SPH-7.2); `raiseArrival` passes
  the same polygon as `context.zone`. `resolveSetUp` with `edgeWithin` rejects (`E_OUT_OF_RANGE`, "must be set up within 1" of
  a battlefield edge") unless some placed model's base edge is within `edgeWithin` of a board edge. `PlaceShape + edgeWithin`
  for the arrival suggestions: `reinforcementFormation` replaces the 6" band test with "the finished unit has a model within N"
  of an edge" and the AI's arrival candidates use centres along the territory's board edges. `MoveConstraints` (frozen
  `types.ts`) is not touched: the edge test lives in `resolveSetUp`.
- **C3 hit ones per sequence** (`attack.ts`, `code-hooks.ts`): `afterAttackSequence` info `+ hitOnes: number` (unmodified 1s on
  the attacking unit's hit dice in this sequence, final die after re-rolls, every weapon of the sequence) `+ combat: boolean`
  (`a.kind === 'melee'`). Tallied next to `saveOnesTally` from `runStage` outs of the hit stage (`o.u === 1`). Additive; the
  Seraphon user ignores the new fields.
- **C4 used-tactic reaction** (`cards.ts`, `code-hooks.ts`): `EngineCodeHook + onTacticCommandUsed?(ctx: EngineContext, entry:
  HookSourceEntry, info: { player: PlayerId; cardId: Id }): void`, called once per source (the player's battle traits /
  regiment ability, any one holder) **after** the command has fully resolved: in `useCommand` when `def.resolve` returns
  without yielding, and in the `tacticCommand` follow-up branch when the follow-up completes. Only for the normal hand path
  (not The Officer's Order card, which goes back to hand anyway). New export `returnTacticToDeckBottom(s, p, cardId)`: removes
  the card from `discard` (or `fulfilled`) and appends it to `deck`; no new event (the card
  stays hidden). The hook may raise a decision; cards.ts must let the command loop yield to it as it does for follow-ups.

None of C1–C4 touches the frozen contracts in `src/engine/{types,actions,events,hooks,rng,decider,index}.ts`; they need a §3.13
note in `docs/spec/13-engine-port-plan.md` when built.

---

## 8. Engine notes

1. **Wizard budget:** Mutative Aura and Fold Reality / Infernal Gateway share the Shaman's one cast per hero phase. The AI
   picks the enhancement spell when it would kill a unit or rescue one, else Mutative Aura on the enemy unit most likely to
   fight next turn (most melee attacks within 12" of a friendly unit).
2. **Mutative Aura timing:** the effect lasts through the enemy turn and this turn's combat phase (it was cast in your hero
   phase). The mortal damage of one Fight lands after that whole Fight (both weapons, all targets), before the next unit is
   picked. A unit with no models left after its own Fight takes nothing.
3. **Underdog checks** (Constant Flux, Deliver on Fate) read `state.underdog` live: it is fixed at the start of the round
   (CORE-4.11), so it holds for the whole round. Round 1 has no underdog.
4. **Fated Arrival placement:** a unit of three 40mm bases fits in a corner pocket of friendly territory; the reserve arrival may
   fail when every edge stretch of the territory is within 6" of an enemy, in which case the unit waits (and is destroyed at
   round 4, CORE-4.14). The AI brings it in in round 2 on the edge stretch nearest an enemy unit or contested objective that is
   more than 6" away.
5. **Cheat Destiny vs. Infernal Gateway:** a returned card is not in the discard pile. The AI returns every used card unless
   its enhancement is Infernal Gateway and the discard pile already holds 3 or more cards (then each discard adds a die).
6. **Predict the Future AI:** keep on top the cards `tacticOdds` rates ≥ 0.5 for next round (highest on the very top), send the
   rest to the bottom. Use it every hero phase while the deck has cards.
7. **Destined Quarry AI:** after the Skyfires shoot, pick the damaged unit that a friendly unit is in combat with or can charge
   this turn (most friendly melee attacks in reach); skip when none.
8. **Predicted Strike AI:** once, to move a unit onto or toward an objective it does not yet contest, or a Skyfires unit out of
   enemy charge reach; Fold Reality AI: lift a unit that is in combat and losing, or drop the Tzaangors deep into enemy territory
   (Eldritch Raiders) within 12" of the general.
9. **Mutagenic Sorcery AI:** always when legal (no downside).
10. **Ward sources:** none in this army.
11. **Defaults for the sim:** regiment Constant Flux and enhancement Mutagenic Sorcery (both need no engine change); variant
    games Arcane Ritualists (C1) and Infernal Gateway / Fold Reality. Fated Arrival needs C2 before the army can play at all.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| DOT-ARMY-1 | Tzaangor Warflock builds: Tzaangor Shaman general + 10 Tzaangors + 3 Enlightened + 3 Skyfires, 17 models, stats as §5, bases 40/32 round. |
| DOT-DATA-1 / DOT-DATA-2 | The shipped data (patrol, stats, bases, reserve flag, Fated Arrival params) matches this file; every Tzeentch file validates. |
| DOT-REG | Every `code` in the Tzeentch abilities resolves to a hook; activated ones have an `activate` block. |
| DOT-AI-1 | AI hints: Infernal Gateway beats Mutative Aura only when it can kill; Fold Reality only to rescue; Predict the Future needs a deck. |
| DOT-ARMY-2 | No unit has Reinforcements; Call for Reinforcements is never offered. |
| DOT-BT-1 | Fated Arrival: the Enlightened start in reserve; arrival offered only in your movement phase from round 2; every model wholly within friendly territory, some model within 1" of an edge, all more than 6" from enemies; rejected otherwise. |
| DOT-BT-2 | The Enlightened still in reserve at the start of round 4 are destroyed; an arrived unit cannot Move that phase. |
| DOT-BT-3 | Predict the Future: looks at up to 3 top cards; each goes to top or bottom as chosen; hand and discard unchanged; not offered with an empty deck. |
| DOT-BT-4 | Cheat Destiny: after a tactic command resolves, the card can go to the bottom of the deck instead of the discard pile; at most once per phase; declining leaves it discarded. |
| DOT-RA-1 | Constant Flux: while underdog, an attack on a friendly unit loses 1 Rend (never below 0, Companion weapons too); no change when not underdog or in round 1. |
| DOT-RA-2 | Arcane Ritualists: +1 to the general's casting roll only while another friendly unit is wholly within 6"; a double 1 still miscasts; unbind compares to the modified total. |
| DOT-ENH-1 | Predicted Strike: once per battle in the enemy movement phase, a visible friendly unit wholly within 12" and not in combat moves up to D6" without crossing or ending in combat range (FLY too). |
| DOT-ENH-2 | Fold Reality: casting 6+ sets a friendly unit (not the general) up wholly within 12" of the general and more than 6" from enemies; it counts as set up this turn. |
| DOT-ENH-3 | Infernal Gateway: casting 5+ rolls max(3, discard pile size) dice, 1 mortal per 4+ on a visible enemy within 18". |
| DOT-ENH-4 | Mutagenic Sorcery: end of any turn, D3; on 2+ that much mortal damage to the enemy and 1 Tzaangor returned; needs the Tzaangors in combat with a visible enemy within 12" of the general. |
| DOT-AB-1 | Mutative Aura: casting 7+; until your next turn each unmodified hit 1 on the target's combat attacks deals it 1 mortal after its Fight; shooting 1s do not count. |
| DOT-AB-2 | Deliver on Fate: +1 to the Enlightened's charge roll only while underdog. |
| DOT-AB-3 | Destined Quarry: only an enemy the Skyfires damaged this phase may be picked; friendly combat attacks on it get +1 to hit for the rest of the turn; shooting attacks do not. |
| DOT-AB-4 | Eldritch Raiders: +1 to wound only while every Tzaangor is wholly within enemy territory. |
| DOT-WEAP-1 | Disc's Teeth and Horns is a Companion weapon on the Shaman, Enlightened and Skyfires; friendly characteristic buffs skip it. |
| DOT-MAG-1 | The Shaman attempts at most one spell per hero phase (Mutative Aura or the enhancement spell) and may unbind one enemy spell. |
| DOT-ENG-C1 | Engine C1: `castingRollBonus` raises the casting total, not the miscast check. |
| DOT-ENG-C2 | Engine C2: `territory` / `edgeWithin` arrival params validate and suggest legal spots. |
| DOT-ENG-C3 | Engine C3: `afterAttackSequence` reports `hitOnes` and `combat`. |
| DOT-ENG-C4 | Engine C4: `onTacticCommandUsed` fires once after the command resolves; `returnTacticToDeckBottom` moves the card. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own livery): cobalt-blue and sky-blue skin and feathers, turquoise and teal cloth, polished
gold and bronze trim, with magenta-pink and electric-blue sorcerous flame as the accent colours. Shared motif: an original
crescent-moon-and-feather emblem on cloth and disc rims. No GW logos, no copied Tzeentch eye or flame sigils. All figures are
in the house figure style (docs/FIGURE-STYLE.md). The flying discs are chunky
shapes held up by a **solid** sculpted swirl of turquoise flame (opaque, never see-through) down to the base.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `dot-tzaangor-shaman` | Tzaangor Shaman | 1 | 40 round | Yes (disc) | A bird-headed goat-beast sorcerer with a blue beaked head, long curling gold-tipped horns and big glowing pink eyes, short legs under a flowing turquoise robe, waving a tall crooked staff topped with a spinning gold crescent and holding a tiny curved knife, riding a chunky gold-rimmed flying disc with short fangs and two little horns on a solid swirl of turquoise flame. |
| `dot-tzaangor` | Tzaangors | 1 (×10) | 32 round | No | An avian goat-beastman warrior with a blue beaked head, short curving horns and a feather crest, short legs with hooves, a teal loincloth with gold trim, gripping an oversized curved gold-edged sword and a round teal shield with an original crescent-and-feather emblem. |
| `dot-tzaangor-enlightened` | Tzaangor Enlightened | 1 (×3) | 40 round | Yes (disc) | A bird-headed goat-beast knight with a blue beaked head wearing a tall gold crested helm and a smug half-lidded stare, short legs, turquoise robes and gold shoulder plates, holding a long gold spear with a curved blade, standing on a chunky gold-rimmed flying disc with short fangs on a solid swirl of turquoise flame. |
| `dot-tzaangor-skyfire` | Tzaangor Skyfires | 1 (×3) | 40 round | Yes (disc) | A bird-headed goat-beast archer with a blue beaked head, sweeping horns and a feather mohawk, short legs, a quiver of chunky rainbow-feathered arrows, drawing an oversized curved gold bow with a glowing pink arrow, riding a chunky bronze flying disc with little side horns on a solid swirl of turquoise flame. |

One figure per unit: no unit has model-to-model weapon differences in the rules, and the Spearhead gives no champion,
standard or musician rules. The disc is part of each figure (one GLB, not a separate mount model). Fluxblade figures
(Appendix A) are listed there.

---

## 11. Implementation notes

Built 2026-10-30. Data: `src/data/factions/tzeentch/` (faction.json, datasheets/{tzaangor-shaman, tzaangors, tzaangor-enlightened,
tzaangor-skyfires}.json, weapons.json, abilities.json, enhancements.json, patrols/tzaangor-warflock.json). Hooks:
`src/engine/factions/tzeentch.ts` (`tzeentchHooks`, spread into `code-hooks.ts`; AI hints `tzeentchAbilityTiming` /
`tzeentchTargetBonus` called from `src/ai/utility.ts` abilityTiming / abilityTargetBonus). Tests: `tests/engine/tzeentch.test.ts`,
`tests/data/tzeentch.test.ts` (one test per DOT- id; the shipped-data checks are DOT-DATA-1/2, the registry check DOT-REG, the AI
hints DOT-AI-1), engine C1–C4 in `tests/engine/engine-f16.test.ts`.
Patrol `battleTraits: ['tzeentch.ability.warflock-ambush', 'tzeentch.ability.predict-the-future', 'tzeentch.ability.cheat-destiny']`,
regiment list Constant Flux (default) then Arcane Ritualists, enhancement list Mutagenic Sorcery (default), Predicted Strike, Fold
Reality, Infernal Gateway. Figure mapping keys `<datasheet id>/<modelId>` with model ids `tzaangor-shaman`, `tzaangor`,
`tzaangor-enlightened`, `tzaangor-skyfire`.

Built as specified, with these decisions the spec left open:
- Predict the Future keeps its progress in the decision data (`stage`, `i`, `tops`, `bottoms`); the deck is rewritten once, after the
  last answer. No event names a card.
- Cheat Destiny is a passive descriptor (`trigger: always`), because `cards.ts` finds the source through the passive source list; its
  once-per-phase mark is the phase mark `tz:cheat:<player>`, set only when the card is actually returned (declining costs nothing).
- Predicted Strike is only offered when the target has some legal slide (a 1" probe on 12 bearings), so the once-per-battle use is not
  wasted on a unit that cannot move.
- Mutagenic Sorcery picks the friendly Tzaangors unit itself: the one in combat with the enemy target that has the most slain models.
  `returnSlainModels` refuses a spot within combat range of an enemy, so a model cannot return into a unit completely surrounded.
- Mutative Aura's 1s are tallied by the engine per attack sequence (C3) and held with `deferMortalAfterFight` until the Fight ability
  is over.

## Appendix A — Fluxblade Coven (second PDF, 14 pages; out of scope)

Army id if ever built: `tzeentch.army.fluxblade-coven`. Source: the Fluxblade Coven URL above (listed 2026-04-01, PDF created
2026-03-13). Bases from Wahapedia aos4 (same day): Magister on Disc 50 round, Flamers 32, Screamers 32, Tzaangors 32, Kairic
Acolytes 32.

**Roster:** General **Magister on Disc of Tzeentch**; 3 Flamers of Tzeentch; 3 Screamers of Tzeentch; 5 Tzaangors; 5
Tzaangors; 10 Kairic Acolytes (6 units, 27 models). Reinforcements keyword on both Tzaangors units and the Kairic
Acolytes.

**Battle trait — Masters of Destiny** (once per battle, start of the first battle round): roll 9 dice and set them aside as
destiny dice. During the battle, instead of rolling, you may use a destiny die as the result of a casting roll, Run roll,
charge roll, hit roll, wound roll or save roll (the save is still modified by Rend). Rolls of several D6 need that many
destiny dice (a 2D6 casting roll takes 2). A replaced roll counts as unmodified and cannot be re-rolled or modified unless a
rule says so. A used die is discarded.

**Regiment abilities:** *Transient Forms* (passive): each time a friendly Kairic Acolytes model is slain in the combat phase,
roll a D6; on 4+ return 1 slain model to a friendly Tzaangors unit within 9" of the slain model. *Eternal Conflagration*
(passive): +1 Rend for ranged weapons of friendly Flamers of Tzeentch units.

**Enhancements:** *Shield of Fate* (your hero phase): pick a visible friendly unit wholly within 18" of the general, casting
roll 2D6; on 6+ until the start of your next turn it has Ward (6+), or +1 to its ward rolls if it already has a ward.
*Glimpse the Future* (your hero phase): if you hold fewer than 6 destiny dice, casting roll 2D6; on 7+ roll a die and add it
to your destiny dice. *Daemonheart* (once per battle, any combat phase): pick an enemy unit within 1" of the general; it
suffers mortal damage equal to the battle round number. *Timeslip Pendant* (once per battle, any combat phase): pick an enemy
unit within 9" of the general; it has Strike-last this phase.

**Warscrolls** (Move / Health / Save / Control; weapons Range, Atk, Hit, Wnd, Rend, Dmg):
- **Magister on Disc of Tzeentch** — 14" / 6 / 4+ / 2; Hero, Wizard, Cavalry, Fly. Tzeentchian Runestaff 18", 1, 3+, 4+, –, D3;
  Warpsteel Sword (melee) 3, 3+, 4+, –, D3; Disc's Teeth and Horns (melee) 2, 4+, 3+, 1, D3, Companion. *Bolt of Change* (your
  hero phase): visible enemy within 18", casting 2D6; on 6+ D3 mortal damage; if any model is slain, return 1 slain model to a
  friendly Tzaangors unit wholly within 18" of the Magister.
- **Kairic Acolytes** — 5" / 1 / 5+ / 1; Infantry, Reinforcements. Sorcerous Bolts 18", 1, 4+, 3+, –, 1; Cursed Blade (melee)
  2, 4+, 4+, –, 1. *Gestalt Sorcery* (your shooting phase): casting 2D6; on 6+ the unit's Sorcerous Bolts get +1 Rend this
  phase.
- **Screamers of Tzeentch** — 14" / 3 / 5+ / 1; Beast, Fly, Ward (6+). Lamprey Bite (melee) 3, 4+, 3+, 1, 1. *Slashing Fins*
  (your movement phase): pick an enemy unit any model of this unit passed across this phase; roll a die per model that did;
  each 4+ = 1 mortal damage.
- **Tzaangors** (×2) — 6" / 2 / 5+ / 1; Infantry, Reinforcements. Savage Blade and Vicious Beak (melee) 2, 4+, 3+, –, 1.
  *Long-Planned Strike* (passive): while wholly within enemy territory, the unit's melee weapons have Crit (2 Hits).
- **Flamers of Tzeentch** — 9" / 2 / 5+ / 1; Infantry, Fly, Ward (6+). Wyrdflame 12", 3, 3+, 4+, –, D3; Flaming Maws (melee)
  3, 3+, 4+, –, 1. *Capricious Wyrdflame* (passive): +1 to hit for this unit's attacks against a unit of 5 or more models.

Mapping hints: destiny dice need a new engine hook on every listed roll (a "replace this roll" decision before the dice are
thrown; `fixRoll` in code-hooks.ts is the nearest existing shape); Slashing Fins = `passedAcrossThisPhase` (F8);
Long-Planned Strike = granted `CRIT_2_HITS` behind the DOT-AB-4 territory gate; Timeslip Pendant = the SKV Cage of Warp
Lightning shape; Transient Forms = `onOwnModelSlain` + `returnSlainModels`.

Figures if ever built (same palette): `dot-magister-on-disc` (a robed human sorcerer with a head in a tall
gold-and-blue hood, short legs, a crystal-topped staff and a curved sword, standing on a chunky flying disc on a solid flame
swirl), `dot-kairic-acolyte` (a masked human cultist with a head in a beaked gold mask, bare muscled arms,
a curved blade and a flame-shaped shield), `dot-screamer` (a chunky flying manta-shark daemon, magenta and blue,
with a big round toothy mouth and fin blades, on a solid flame stem), `dot-flamer` (a chunky tube-bodied daemon
with a frilly skirt, waving arms ending in solid sculpted pink-and-blue flames and a big gaping grin).
