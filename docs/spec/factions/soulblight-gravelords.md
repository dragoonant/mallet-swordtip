# Soulblight Gravelords — Bloodcrave Hunt (Spearhead)

Faction id: `soulblight` · Army id: `soulblight.army.bloodcrave-hunt` · Grand alliance: Death.
Source: `docs/sources/spearhead-soulblight-gravelords.pdf` (7 pages, 15.5 MB, gitignored), "Spearhead: Soulblight Gravelords -
Bloodcrave Hunt", the free Warhammer Community download (Age of Sigmar, Spearhead category) for the current
**Spearhead: Soulblight Gravelords** box (Vampire Lord, Deathrattle Skeletons, Blood Knights, Vargheists). Listed 2025-11-12,
updated 2026-04-01 (PDF metadata: created 2026-03-13). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_01-04_aos_spearhead_soulblight_gravelords_bloodcrave_hunt-vdg57qq6dt-h7hylvvtke.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, search term "soulblight").
Base sizes are not printed in the PDF. They come from the Wahapedia aos4 Soulblight warscroll page
(`https://wahapedia.ru/aos4/factions/soulblight-gravelords/warscrolls.html`, fetched the same day).
Mechanics and numbers are ported 1:1. All wording below is our own. (The other Soulblight Spearhead, *Deathrattle Tomb Host*,
has a Wight King, Barrow Guard, Barrow Knights and 2× Deathrattle Skeletons. It is a separate download built from older kits,
not this box, and is out of scope here.)

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of an
enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run = `advance`,
Retreat = `fallBack`. Rend is stored as `AP` (negative = more Rend); a printed Rend "-" is 0. Rule IDs `SBG-*` double as test IDs (§9).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `soulblight.unit.vampire-lord` | Vampire Lord | 1 | **General** | no | 40 round (Wahapedia) |
| `soulblight.unit.deathrattle-skeletons` (a) | Deathrattle Skeletons | 10 | Unit | no | 25 round (Wahapedia) |
| `soulblight.unit.deathrattle-skeletons` (b) | Deathrattle Skeletons | 10 | Unit | no | 25 round |
| `soulblight.unit.blood-knights` | Blood Knights | 5 | Unit | no | 75×42 oval (Wahapedia) |
| `soulblight.unit.vargheists` | Vargheists | 3 | Unit (starts in reserve, SBG-BT-1) | no | 50 round (Wahapedia) |

Total: 5 units, 29 models. No unit has the **Reinforcements** keyword, so the core Call for Reinforcements is never offered.
Endless Legions (SBG-RA-1) is this army's own way to bring back skeletons. The two Skeleton units share one warscroll and
loadout. The Vampire Lord is the only **Wizard**: the keyword is printed with no number, so power level 1 (magic.ts
`wizardLevel`). No Priest. Only the Vargheists have **Fly**. Every warscroll prints **Ward (6+)** as a keyword.

---

## 2. Battle traits

### SBG-BT-1 `soulblight.ability.deaths-descent` / `soulblight.ability.swoop-down` — Death's Descent / Swoop Down
- **Deployment:** the Vargheists unit is **not set up** in the deployment phase. It starts in reserve.
- **Swoop Down (`swoop-down`):** your movement phase, **from battle round 3 onwards**. Keyword **Core**. Effect: set the
  Vargheists up anywhere on the battlefield, every model **more than 6" from all enemy units**.
- Being set up, it cannot use Move abilities for the rest of that movement phase (CORE-6.13). The PDF does not say what happens to
  a reserve unit that never arrives. It gets the same treatment as the Ironjawz Brutes (IJZ-E1). The AI arrives in round 3.

### SBG-BT-2 `soulblight.ability.the-hunger` — The Hunger
- **Timing:** Passive.
- **Effect:** Each time a friendly **Vampire** unit (Vampire Lord, Blood Knights, Vargheists) uses a **Fight** ability: once all of
  its attacks have resolved, **Heal (X)** that unit, where X = the number of **damage points allocated** by those attacks.
- [interp] X counts points actually allocated to enemy models, after ward rolls. That includes the Nightmare's Companion attacks
  and overflow into further models of the same pool. It does not count points that went nowhere because the target unit was wiped
  out. Healing never brings back slain models (CORE-13.7). A unit destroyed during its own Fight gets nothing.

---

## 3. Regiment abilities (pick 1 at army selection)

### SBG-RA-1 `soulblight.ability.endless-legions` — Endless Legions
- **Timing:** Once per battle, your movement phase. Keyword **Core**.
- **Declare:** Pick a friendly **Deathrattle Skeletons** unit that has been **destroyed**.
- **Effect:** Set up a **replacement unit** of that warscroll with **D6 models** in **friendly territory**, every model **more than 6"
  from all enemy units**.
- [interp] "in friendly territory" is read as wholly within it, which is how the replacement formation already works. The replacement
  is a new unit (core 24.2) with **starting size = the D6 rolled**, so Skeleton Legion can only bring it back up to that number.
  [RULING] The destroyed unit must not already have been replaced (by the Attack on Two Fronts card); it is marked `replaced`
  afterwards. The replacement is set up this turn (CORE-6.13).
  [RULING] A destroyed replacement (itself a new unit) can be the pick as long as it is not marked `replaced`; the once-per-battle limit
  makes this at most one use anyway. Whether the ability is offered only checks that one model has a legal spot; if the D6 roll then
  gives more models than fit anywhere, the replacement is dropped (the original stays unreplaced) and the use is spent.

### SBG-RA-2 `soulblight.ability.ruinous-chargers` — Ruinous Chargers
- **Timing:** Once per battle, **any charge phase**. The opponent's charge phase matters for the Counter-Charge battle tactic command.
- **Declare:** Pick your **Blood Knights** unit, if it **charged this turn**.
- **Effect:** Each enemy unit that the Blood Knights **passed across** during that Charge ability suffers **D3 mortal damage**
  ([RULING] a separate D3 for each unit).
- Passing across enemy models is only possible through Riders of Ruin (SBG-AB-2), so in practice the targets are enemy **Infantry**
  the knights rode over.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `soulblight.enh.grave-sand-shard` | Grave-Sand Shard | Once per battle, reaction: you declared **Skeleton Legion** for a unit **within 9" of your general** | Add 1 to each legion roll for that use (a modified 6+ returns a model, so 5s count). |
| `soulblight.enh.cloud-of-bats` | Cloud of Bats | Once per battle, your movement phase. Keyword **Core** | Remove the general from the battlefield and set them up again anywhere, more than 6" from all enemy units. |
| `soulblight.enh.aura-of-night` | Aura of Night | Passive | Ignore **negative modifiers** to save rolls for **shooting attacks** that target the general. |
| `soulblight.enh.spirit-gale` | Spirit Gale | **Your hero phase** (no once-per-battle limit) | Declare: casting roll of 2D6. Effect: on **7+**, inflict **1 mortal damage on each enemy unit** on the battlefield. |

- Cloud of Bats: [interp] usable while the general is in combat (nothing forbids it). It is not a Retreat, so there is no mortal
  damage. Being set up, the general cannot use Move abilities for the rest of the phase (CORE-6.13). [RULING] Built on the Magmic
  Tunnels redeploy: the player picks the spot, and passing on the spot decision leaves the general where it stands (the use is spent).
- Aura of Night: [RULING] Rend is a characteristic subtracted from the roll, not a modifier (CORE-2.5 interp in 10-rules-core), so
  Rend still applies. Only negative save modifiers (an ability's or a card's "−1 to save rolls") are dropped. Positive modifiers
  still apply, capped at +1.
- Spirit Gale: [interp] treated as a **Spell** with casting value 7, like Guide the Gusts (LRL-AB-1). The PDF prints no Spell keyword,
  but a casting roll only exists for spells. So a double 1 miscasts (D3 mortal damage to the general, no more spells this phase),
  an enemy Wizard may unbind it, and it uses up the Vampire Lord's single cast for the phase (shared with Vile Transference).

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Printed keywords only (Spearhead warscrolls print no faction keywords).
**Every warscroll prints Ward (6+).** There are no ranged weapons in this army.

### 5.1 `soulblight.unit.vampire-lord` — Vampire Lord
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 5 | 3+ | 2 | 6+ |

Keywords: **Hero, Wizard, Infantry, Vampire, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Dynastic War-relic (`soulblight.weapon.dynastic-war-relic`) | Melee | — | 5 | 3+ | 3+ | 1 | 2 | — |

**SBG-AB-1 `soulblight.ability.vile-transference` — Vile Transference**
- **Timing:** Your hero phase (once per phase for this unit, CORE-3.4).
- **Declare:** Pick a **visible** enemy unit **within 6"** of this unit, then make a **casting roll of 2D6**.
- **Effect:** On **6+**, roll as many dice as the target's **Health characteristic**. For each **5+**, inflict **1 mortal damage** on
  the target and **Heal (1)** this unit.
- [interp] Spell with casting value 6 (same ruling as Spirit Gale). Health = the target's printed per-model Health (`modelStats W` of
  its first live model; a Health 1 infantry unit gives 1 die, a Health 12 monster 12). The mortal damage is one pool (wards apply).
  The heal counts the 5+ dice, whatever the target's wards save.

### 5.2 `soulblight.unit.deathrattle-skeletons` — Deathrattle Skeletons
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 1 | 5+ | 1 | 6+ |

Keywords: **Infantry, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Ancient Weapon (`soulblight.weapon.ancient-weapon`) | Melee | — | 2 | 4+ | 4+ | — | 1 | — |

**SBG-AB-4 `soulblight.ability.skeleton-legion` — Skeleton Legion**
- **Timing:** Your combat phase (once per phase for this unit, CORE-3.4). It is not a Fight ability.
- **Effect:** For each **slain model** of this unit, make a **legion roll** of D6. Each **6** returns 1 slain model to the unit (5+ with
  Grave-Sand Shard).
- [interp] The engine offers non-Fight combat-phase abilities at the start of the combat phase (CORE-10.1). So the roll covers
  models slain before then (in the opponent's turn, your hero phase), not ones lost later in the same combat phase. Returned models
  follow CORE-6.14 (`returnSlainModels`: coherent, not in combat range of an enemy) and come back at full Health.

### 5.3 `soulblight.unit.blood-knights` — Blood Knights
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 10" | 3 | 3+ | 1 | 6+ |

Keywords: **Cavalry, Vampire, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Templar Lance or Templar Blade (`soulblight.weapon.templar-lance-or-blade`) | Melee | — | 3 | 3+ | 3+ | 1 | 1 | Charge (+1 Damage) |
| Nightmare's Hooves and Teeth (`soulblight.weapon.nightmares-hooves-and-teeth`) | Melee | — | 3 | 5+ | 3+ | — | 1 | Companion |

Every model carries both weapons. Lance and blade share one profile; the choice is cosmetic.

**SBG-AB-2 `soulblight.ability.riders-of-ruin` — Riders of Ruin**
- **Timing:** Passive.
- **Effect:** Models of this unit may **pass across enemy Infantry models** as if the unit had Fly.
- [RULING] Only the "cross the model" part of Fly. Terrain and combat ranges are treated as normal (CORE-6.4 still forbids a Normal
  Move or Run from entering combat range). So this matters for **Charge** moves and **Retreats**. A move still may not end
  overlapping a model.

### 5.4 `soulblight.unit.vargheists` — Vargheists
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 4 | 5+ | 1 | 6+ |

Keywords: **Infantry, Vampire, Fly, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Murderous Fangs and Talons (`soulblight.weapon.murderous-fangs-and-talons`) | Melee | — | 3 | 4+ | 3+ | 1 | 2 | Crit (2 Hits) |

**SBG-AB-3 `soulblight.ability.the-scent-of-gore` — The Scent of Gore**
- **Timing:** Passive.
- **Effect:** +1 to **wound** rolls for this unit's attacks that target a **damaged** unit (a unit with any damage points allocated,
  i.e. some model below its Health; slain models alone do not count). Capped with other wound modifiers at ±1.
- Checked per attack when the wound roll is made. Damage from the same Fight lands in the pool afterwards, so it does not switch the
  bonus on partway through.

Also carries the battle-trait reserve rule (SBG-BT-1).

---

## 6. Spells and prayers

No lore. Two casting-roll abilities, both treated as Spells (see the [interp] at §4 and SBG-AB-1): **Vile Transference** (casting
value 6, warscroll) and **Spirit Gale** (casting value 7, only with that enhancement). The Vampire Lord is Wizard (1), so it casts **at
most one of them per hero phase**. Enemy Wizards may unbind them (magic.ts). No prayers.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/soulblight/*.json`), at most a bare-name hook. (b) = new faction code hook in
`src/engine/factions/soulblight.ts` (registered in `code-hooks.ts` as `...soulblightHooks`). (c) = needs an engine change outside the
faction file (detailed below the table).

| Rule | Class | How |
|---|---|---|
| Stats, keywords, printed Ward (6+) | (a) | Datasheets as the other armies; `ward: 6` on all four (as Fyreslayers); keywords `HERO`, `WIZARD`, `INFANTRY`, `CAVALRY`, `VAMPIRE`, `FLY`. Two patrol entries share `deathrattle-skeletons`, as Kruleboyz Gutrippaz. |
| Charge (+1 Damage), Companion, Crit (2 Hits) | (a) | Weapon abilities `CHARGE_DAMAGE`, `COMPANION`, `CRIT_2_HITS`. |
| Fly (Vargheists) | (a) | Existing FLY handling in `phases/movement.ts` and `phases/charge.ts`. |
| SBG-BT-1 Death's Descent / Swoop Down | (a) | Exactly 'Ere We Go (Ironjawz): passive `deaths-descent` + activated `swoop-down` (`phase movement / your`, `keywords ['CORE']`, `fromRound: 3`, `params { fromRound: 3, minEnemyDistance: 6, anywhere: true }`); patrol entry `reserve: { ability: 'soulblight.ability.swoop-down' }`. Movement's reserve-arrival step does the rest. |
| SBG-AB-3 The Scent of Gore | (b) `soulblightScentOfGore` | Passive, scope self, effect `{ modifyRoll: { roll: 'wound', value: 1 } }`; gate-only hook (`hooks: ['onWoundRoll']`, `gate` reads `data.attack.targetUnitId` → `isDamaged`, aos-common). No `Condition` for "target damaged" exists; a `targetDamaged?: boolean` Condition would make it (a) instead. |
| SBG-AB-1 Vile Transference | (b) `soulblightVileTransference` | Activated, `phase command / your`, `keywords ['SPELL']`, `castingValue: 6` (abilities.ts calls `castingRoll`). Targets: enemy units visible (los.ts) and `unitsWithin(self, t, 6)`. Resolve: `n` = `modelStats(first live model).W` dice via `ctx.roll`, `k` = count ≥ `params.successOn` (5); `inflictMortal(ctx, use, target, k)`, then `healUnit(ctx, self, k, id)`. |
| SBG-ENH Spirit Gale | (b) `soulblightSpiritGale` | Enhancement, activated, `phase command / your`, no limit, `keywords ['SPELL']`, `castingValue: 7`, caster = bearer. Resolve: `inflictMortal(ctx, use, e, 1)` for every enemy unit `onBoard`. |
| SBG-AB-4 Skeleton Legion | (b) `soulblightSkeletonLegion` | Shape of `kharadronLeaveNoDuardin` / `fyreslayersHornOfGrimnir`: `phase fight / your`, self target, `canUse` = `returnableModels(self) > 0`; roll `returnableModels` D6s (one per slain model, capped by starting size), count ≥ `params.successOn` (6), or ≥ 5 in the shard mode; `returnSlainModels(ctx, self, count, id)`. `modesFor` adds a "Use Grave-Sand Shard" mode while the shard is unspent (see next row). |
| SBG-ENH Grave-Sand Shard | (b) `soulblightGraveSandShard` | Marker hook like A Proper Ruckus (IJZ-3.2): the reaction timing is never offered by the loop. Skeleton Legion's `modesFor` offers the shard mode when the player's general bears it, the shard's ability has no entry in `players[p].abilityUses` (its `limit` is `oncePerBattle`), and `unitsWithin(skeletons, general, 9)`. Choosing it pushes that ability use (the ledger) and lowers the legion target to 5. |
| SBG-ENH Aura of Night | (a) + (c) C5 | Passive enhancement, scope bearer, `{ when: { weaponType: 'ranged' }, ignoreNegativeModifiers: 'save' }` (new Effect field, C5). |
| SBG-ENH Cloud of Bats | (b) `soulblightCloudOfBats` | Enhancement, `phase movement / your`, `oncePerBattle`, `keywords ['CORE']`. `canUse`: general on board and `redeployOptions(state, general, 6).length > 0`. Resolve: `requestRedeploy(s, { abilityId, player, unitIds: [general], minEnemyDistance: 6, markSetUp: true })` (Magmic Tunnels path; abilities.ts asks the spot). Offered in the end-of-phase window. |
| SBG-RA-1 Endless Legions | (b) `soulblightEndlessLegions` + (c) C4 | Army ability, `phase movement / your`, `oncePerBattle`, `keywords ['CORE']`. Targets: own units `location 'destroyed'`, `isDatasheet(…, 'deathrattle-skeletons')`, `!replaced`, with a legal spot (C4 options non-empty). Resolve: roll D6, `spawnUnitCopy(s, orig, n)` (state.ts; startingStrength = n), `copy.replacementOf = orig`, `orig.replaced = true`, `writePlaceRequest(s, { …, edgeBand: false, minEnemyDistance: 6 })` (C4). |
| SBG-RA-2 Ruinous Chargers | (b) `soulblightRuinousChargers` + (c) C3 | Army ability, `phase charge / any`, `oncePerBattle`. `canUse`: the player's Blood Knights are on board, `turn.chargedThisTurn` is true, and `passedAcrossThisPhase(state, knights)` (aos-moves) holds an enemy unit still on the board. Resolve: for each such unit roll D3 (`ctx.rollExpr`) and `inflictMortal`. Offered in the end-of-charge-phase window (charge.ts `runWindow(ctx, 'charge', p)` for both players). |
| SBG-AB-2 Riders of Ruin | (a) + (c) C2 | Passive, scope self, `{ passAcrossKeyword: 'INFANTRY' }` (new Effect field, C2). |
| SBG-BT-2 The Hunger | (b) `soulblightTheHunger` + (c) C1 | Passive battle trait. Hook member `onOwnFightResolved` (C1): when the fighting unit has `VAMPIRE` and is on board, `healUnit(ctx, unitId, damageAllocated, id)`. Announce only when it heals > 0. |

**Engine changes (c):**
- **C1 heal after a Fight** (`attack.ts`, `phases/fight.ts`, `code-hooks.ts`): `resolvePool` adds each `take` it allocates from a pool
  whose `by.kind === 'melee'` and `by.unitId` is set to a phase mark `fightDmg:<attackerUnitId>=<n>`. Export
  `fightDamageAllocated(state: GameState, unitId: UnitId): number` and `clearFightDamage(state: GameState, unitId: UnitId): void`.
  `driveFightUnit` calls, right after `drainAfterFightMortal(ctx)` and before `finishUnit`, a new
  `ownFightResolved(ctx: EngineContext, unitId: UnitId): void`. Like `ownModelSlain`, this collects the codes of the unit's datasheet
  abilities, its player's battle traits and regiment ability, de-duplicated, and calls `EngineCodeHook.onOwnFightResolved?(ctx: EngineContext,
  info: { ability: RuntimeAbility; unitId: UnitId; damageAllocated: number }): void`, then clears the mark. Deferred Glorious Death
  mortals are not counted, because they are not this unit's attacks.
- **C2 pass across by keyword** (`src/data/types.ts` Effect, `common.schema.json`, `hooks-impl.ts`, `phases/movement.ts`,
  `phases/charge.ts`): Effect gains `passAcrossKeyword?: Keyword`. Add
  `hookService.passAcrossKeywords(state: GameState, unitId: UnitId): Keyword[]` (passive descriptors + ActiveEffects, as
  `unitHasEffectFlag`). The path tests (movement.ts `pathCrossesModels(fp, r.path, [...enemies, ...otherFriendly])`; charge.ts lines
  ~172 and ~400) drop from `enemies` every model whose unit has one of those keywords. Combat-range rules and end-position overlap
  checks stay unchanged. The `EFFECT_HOOKS` key `passAcrossKeyword: []` goes in `hooks.ts` (frozen: additive, note in
  13-engine-port-plan.md).
- **C3 charge records passed across** (`phases/charge.ts` `applyChargeMove`): after the move is applied, call
  `recordPassedAcross(s, unitId, unitsPassedAcrossPaths(s, unitId, paths))` (aos-moves.ts), using the per-model paths of the
  `chargeMove` action (straight segments when none), exactly as movement.ts does for ordinary moves (F8 C4).
- **C4 replacement shape** (`factions/aos-moves.ts`, `factions/spearhead-core.ts`): `PlaceRequest` gains
  `edgeBand?: boolean` (default true) and `minEnemyDistance?: number` (default: only "not in combat").
  `reinforcementFormation(state, player, models, coherencyRange, centre, shape?: { edgeBand?: boolean; minEnemyDistance?: number })` and
  `reinforcementOptions(…, max, shape?)` skip the 6" edge-band test when `edgeBand === false` and reject a spot within
  `minEnemyDistance` of an enemy model (horizontal gap). `replacementOptions` / `placeReplacement` take the shape from the pending
  request (abilities.ts passes `place`). Call for Reinforcements is unchanged (no shape).
- **C5 ignore negative save modifiers** (`src/data/types.ts`, schema, `hooks.ts` RollModifierResult, `hooks-impl.ts`, `attack.ts`):
  Effect gains `ignoreNegativeModifiers?: RollName`. hooks-impl answers it at the matching roll hook as
  `{ kind: 'roll', ignoreNegative: true }`, and `RollModifierResult` gains `ignoreNegative?: boolean` (frozen contract: additive, note in
  13-engine-port-plan.md). In `runStage` the save branch uses
  `netSaveModifier(ent.ignoreNeg ? mods.filter((m) => m > 0) : mods)`. Rend (`p.rend`) is untouched. Card save modifiers
  (`cardSaveModifier`) arrive in `statics` and are filtered the same way.

---

## 8. Engine notes

1. **Hero phase:** Vile Transference and Spirit Gale share the Vampire Lord's single cast (Wizard 1). A miscast on either ends
   casting for the phase.
2. **The Hunger order:** attacks → ward rolls → damage allocated → slain models removed → Glorious-Death style deferred mortals →
   The Hunger heals. A Vampire unit wiped out by those deferred mortals is not healed.
3. **Blood Knights charge:** Riders of Ruin lets the charge path cross enemy Infantry. Every enemy unit crossed is recorded (C3).
   Ruinous Chargers is offered once all charges of the phase are done. The Blood Knights may also be the Counter-Charge unit in the
   opponent's charge phase, which is why the timing is "any".
4. **Skeletons:** Skeleton Legion is offered at the start of your combat phase (CORE-10.1). Endless Legions brings a destroyed unit
   back with D6 models in the end-of-movement window, so it can charge that turn (set up this turn only blocks Move abilities in
   the movement phase, CORE-6.13).
5. **AI** (hints in `soulblight.ts`, wired into `src/ai/utility.ts`; the ability-use options carry no unit, so the casters are looked up as
   the player's general). Spells: the Lord has one cast per hero phase, so the bot compares expected mortal damage, Vile Transference
   `P(2D6 >= 6) * Health / 3` (x1.5 while the Lord is damaged) against Spirit Gale `P(2D6 >= 7) * enemy units on the table`, and
   declines the lesser one (timing -3). Vile Transference picks the target with the most Health. Cloud of Bats: when the Lord is in
   combat with more enemy Health than its own wounds left, or, from round 2, to reach an objective it does not stand on that is not
   ours and has no enemy model within 9" of its centre; the spot is the best-scoring redeploy option. Endless Legions: as soon as a
   Skeletons unit is destroyed; the spot is scored like a move (`abilityPlacementScore` now also reads `place` decisions). Ruinous
   Chargers: whenever offered; a Blood Knights charge path that crosses enemy units earns +4 per unit (max 2) while it is unspent
   (`soulblightChargeBonus`; the engine's charge candidates rarely cross anything, so it fires seldom). Skeleton Legion: always;
   the Grave-Sand Shard mode when 4 or more models are slain, else the plain mode. Swoop Down: the engine's arrival from round 3.
6. **Ward sources:** every unit has Ward (6+) from its warscroll; nothing improves it.
7. **Defaults for the sim:** regiment Endless Legions and enhancement Spirit Gale; variant games Ruinous Chargers and Grave-Sand Shard
   (Cloud of Bats and Aura of Night as further variants).

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| SBG-ARMY-1 | Bloodcrave Hunt builds: Vampire Lord general + 2×10 Deathrattle Skeletons + 5 Blood Knights + 3 Vargheists, 29 models, stats and Ward (6+) as §5. |
| SBG-ARMY-2 | No unit has Reinforcements; Call for Reinforcements is never offered for this army. |
| SBG-BT-1 | Vargheists start in reserve; Swoop Down not offered before round 3; sets them up anywhere > 6" from every enemy model; no move that phase. |
| SBG-BT-2 | The Hunger heals a Vampire unit by the damage points its Fight allocated (after wards, Companion included); not Skeletons; no model returns. |
| SBG-BT-3 | The Hunger gives nothing for points saved by enemy wards, and nothing to a unit destroyed before it would heal. |
| SBG-RA-1 | Endless Legions: once per battle, a destroyed Skeletons unit returns as a new unit of D6 models wholly in own territory, > 6" from enemies (no edge band). |
| SBG-RA-2 | Endless Legions replacement has starting size D6: Skeleton Legion never takes it above that. |
| SBG-RA-3 | Ruinous Chargers: only if the Blood Knights charged this turn; D3 mortal to each enemy unit passed across in that charge; once per battle; usable in the opponent's charge phase. |
| SBG-ENH-1 | Grave-Sand Shard: legion rolls of 5 also return models, only for Skeletons within 9" of the general, once per battle. |
| SBG-ENH-2 | Cloud of Bats: once per battle the general is set up again anywhere > 6" from enemies, also from combat, with no retreat damage. |
| SBG-ENH-3 | Aura of Night: a −1 save modifier is ignored against shooting attacks on the general; Rend still applies; melee attacks unaffected. |
| SBG-ENH-4 | Spirit Gale: casting 7+ inflicts 1 mortal on every enemy unit on the battlefield (not reserves); usable every hero phase. |
| SBG-MAG-1 | The Vampire Lord casts at most one of Vile Transference / Spirit Gale per hero phase; a double 1 miscasts (D3 mortal to the Lord); enemy Wizards may unbind. |
| SBG-AB-1 | Vile Transference: casting 6+; dice = target's Health characteristic; each 5+ = 1 mortal on the target and Heal (1) on the Lord; target visible and within 6". |
| SBG-AB-2 | Riders of Ruin: a Blood Knights charge (and Retreat) may cross enemy Infantry models, but not Cavalry/Monster models; may not end overlapping. |
| SBG-AB-3 | The Scent of Gore: +1 to wound only against a damaged target (a slain-model-only unit is not damaged). |
| SBG-AB-4 | Skeleton Legion: one D6 per slain model, each 6 returns a model at full Health, never above starting size; offered in your combat phase. |
| SBG-WEAP-1 | Templar weapons deal 2 damage on a turn the Blood Knights charged (Charge +1 Damage); Nightmare's Hooves ignore friendly buffs (Companion). |
| SBG-WEAP-2 | Murderous Fangs and Talons: a critical hit scores 2 hits. |
| SBG-FLY-1 | Vargheists move over models (Fly); Blood Knights do not cross non-Infantry models. |
| SBG-REG | Every `code` in the Soulblight data resolves to a registered hook; activated ones carry an `activate` block. |
| SBG-DATA-1..4 | Shipped data: Spearhead army checks and schema validation; warscroll stats, keywords and Ward; weapon profiles; the real game builds with every regiment ability / enhancement choice (Vargheists in reserve). |
| SBG-AI | AI hints: spell choice by expected damage, Cloud of Bats timing, shard mode, Blood Knights charge-path bonus. |
| SBG-E2E | Full AI games of the Bloodcrave Hunt run to the end without a rejection and use its abilities. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own night-court livery): deep crimson lacquered armour, black-teal cloth and capes, bone ivory,
tarnished gold trim, chalk-pale vampire skin, glowing red eyes; skeleton eyes glow pale green. Shared motif: an original sigil of a
single fang inside a blood drop. No GW logos, no copied Soulblight dynasty heraldry or banner icons. All figures are **true MGSD**
chibis (~2.5 heads tall, oversized head, stubby legs, big hands). Mounts are chunky toy-like SD shapes.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `sbg-vampire-lord` | Vampire Lord | 1 | 40 round | No | A true MGSD chibi vampire noble, 2.5 heads tall with a huge pale head, flowing crimson hair, tiny fangs and glowing red eyes, stubby legs in black-teal plate with crimson trim, a tall bat-wing collar cloak, holding an ornate gold-and-black flanged mace in one hand and a little kite shield with a fang-drop sigil in the other, a few cartoon bats swirling at the hem. |
| `sbg-skeleton` | Deathrattle Skeletons | 1 (×20; ×16 if both optional variants are made) | 25 round | No | A true MGSD chibi skeleton warrior, 2.5 heads tall with an oversized round skull under a dented bronze pointed helm, glowing green eye sockets, stubby bony legs, a tattered black-teal tabard, a chipped short spear and a small round rusty shield. |
| `sbg-skeleton-champion` (optional) | Deathrattle Skeletons (unit leader look) | 1 (×2) | 25 round | No | The same MGSD chibi skeleton with a taller crested helm, a ragged crimson half-cape and a spiked bronze mace raised high; skip if the pipeline is short on time (no rules use it). |
| `sbg-skeleton-standard` (optional) | Deathrattle Skeletons (banner look) | 1 (×2) | 25 round | No | The same MGSD chibi skeleton hugging a tall pole with a torn crimson banner showing a plain fang-drop sigil; skip if short on time (no rules use it). |
| `sbg-blood-knight` | Blood Knights | 1 (×5, or ×4 with the optional leader) | 75×42 oval | Mount (skeletal nightmare horse) | A true MGSD chibi vampire knight, 2.5 heads tall with a big pale head under a crimson horned helm with a raised visor, red eyes, stubby legs, riding a chunky toy-like armoured skeletal horse with a fanged skull face and crimson barding, a long gold-tipped lance couched under one arm. |
| `sbg-blood-knight-kastellan` (optional) | Blood Knights (unit leader look) | 1 | 75×42 oval | Mount | The same MGSD chibi knight and chunky nightmare horse, with a taller swept crest, a black-teal cape and a curved templar sword instead of the lance; skip if short on time. |
| `sbg-vargheist` | Vargheists | 1 (×3) | 50 round | No (winged beast) | A true MGSD chibi bat-beast, 2.5 heads tall with a huge bat head, big pointed ears, a spiky crimson mane and a wide fanged grin, chalk-white body, stubby clawed legs, oversized leathery brown-and-crimson wings spread wide, long hooked talons on its tiny arms, crouched to pounce. |

Every unit that has rules gets its own figure. The optional skeleton and knight leader variants are look-only; the rules give
champions, banners and musicians nothing in this Spearhead.

---

## 11. Implementation notes

Built (F12). Data: `src/data/factions/soulblight/` (faction, 4 datasheets, weapons, abilities, enhancements, patrol `bloodcrave-hunt` with the
Vargheists `reserve` entry). Hooks: `src/engine/factions/soulblight.ts` (`...soulblightHooks` in `code-hooks.ts`: `soulblightScentOfGore`,
`soulblightVileTransference`, `soulblightSpiritGale`, `soulblightSkeletonLegion`, `soulblightGraveSandShard`, `soulblightCloudOfBats`,
`soulblightEndlessLegions`, `soulblightRuinousChargers`, `soulblightTheHunger`). Engine items C1-C5 (§7) are in with notes in
`docs/spec/13-engine-port-plan.md` §3.11. AI hints per §8.5 (`src/ai/utility.ts` calls `soulblightAbilityTiming`, `soulblightTargetBonus`,
`soulblightModeBonus`, `soulblightChargeBonus`). Tests: `tests/engine/soulblight.test.ts` (one test per SBG- id) and
`tests/data/soulblight.test.ts`.
