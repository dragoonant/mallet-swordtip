# Gloomspite Gitz — Snarlpack Huntaz (Spearhead)

Faction id: `gloomspite` · Army id: `gloomspite.army.snarlpack-huntaz` · Grand alliance: Destruction.
Source: `docs/sources/spearhead-gloomspite-gitz.pdf` (4 pages, gitignored), "Spearhead: Gloomspite Gitz - Snarlpack
Huntaz", Warhammer Community downloads (Age of Sigmar, Spearhead category), first posted 2025-02-12, last updated
2026-04-01, fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_01-04_aos_spearhead_gloomspite_gitz_snarlpack_hunters-dk3amzdenf-1dhez0axxu.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`).
This is the army in the boxed 4th-edition Gloomspite Gitz Spearhead (the Gitmob wolf riders). A second free Gloomspite
Spearhead, *Bad Moon Madmob* (Loonboss, Moonclan Stabbas, Squig Hoppers, Rockgut Troggoths; posted 2025-11-12), also
exists on the downloads page; it is out of scope here.
Mechanics and numbers are ported 1:1; all wording below is our own. Rule IDs are stable; tests key on the `GLO-` IDs
in section 9.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat
range of an enemy unit; "wholly within" per CORE-1.2. Timing labels follow the core rules' ability-timing vocabulary.
Engine phase names: Hero phase = `command`, Combat phase = `fight`. Rend is stored as `AP` (negative = more Rend), same
encoding as Heirloom Blade (`modifyStat AP -1` = +1 Rend).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `gloomspite.unit.snarlboss` | Snarlboss | 1 | **General** | no | 75×42 oval (estimate, not stated in source) |
| `gloomspite.unit.wolfgit-retinue` | Wolfgit Retinue | 2 (1 bow, 1 stikka) | Unit | no | 60×35 oval (estimate, not stated) |
| `gloomspite.unit.snarlpack-cavalry` (a) | Snarlpack Cavalry | 3 | Unit | no | 75×42 oval (estimate, not stated) |
| `gloomspite.unit.snarlpack-cavalry` (b) | Snarlpack Cavalry | 3 | Unit | no | 75×42 oval (estimate, not stated) |
| `gloomspite.unit.sunsteala-wheelas` (a) | Sunsteala Wheelas | 1 | Unit | no | 120×92 oval (estimate, not stated) |
| `gloomspite.unit.sunsteala-wheelas` (b) | Sunsteala Wheelas | 1 | Unit | no | 120×92 oval (estimate, not stated) |

Total: 6 units, 11 models. Everything is mounted (Cavalry) or a chariot (War Machine); 12" Move across the board.
Ranged weapons: Grot Bows on one Wolfgit and on each Wheela. No Wizard, no Priest, no Ward on any warscroll.
The PDF's warscroll is titled "Sunsteala Wheelas" while the roster lists "1 Sunsteala Wheela" twice: two separate
one-model units sharing one warscroll.

**Reinforcements:** none. No warscroll prints the Reinforcements keyword, so the core Call for Reinforcements ability
is never offered to this army. Base sizes: the PDF gives none; the values above are placeholders to confirm against
the GW base-size guide or Wahapedia before data entry (they only affect footprints and figure scale).

---

## 2. Battle trait

### GLO-BT-1 `gloomspite.ability.fast-as-frazzlegit` — Fast as Frazzlegit
- **Timing:** Passive (whole army).
- **Effect:** (1) Friendly units may use Charge abilities in a turn in which they used a Retreat ability.
  (2) Friendly units never suffer the mortal damage that a Retreat normally inflicts (CORE-6.3).
- Notes: Run still blocks charging (only Retreat is waived). Retreat must still end outside every combat range; the
  same unit may then charge straight back in. This is the army's whole play pattern: hit, pull out for free, hit again.

---

## 3. Regiment abilities (pick 1 at army selection)

### GLO-RA-1 `gloomspite.ability.flankin-force` — Flankin' Force
- **Timing:** Once per battle, start of the first battle round.
- **Effect:** Pick up to 2 friendly units. Lift them off the battlefield and set each up again anywhere on the
  battlefield, every model more than 6" from every enemy unit (no territory limit).
- Mechanically identical to Fyreslayers' Magmic Tunnels (FYR-RA-1).

### GLO-RA-2 `gloomspite.ability.frazzleboom` — Frazzleboom
- **Timing:** Passive. Triggers each time a friendly **War Machine** is destroyed (in this army: a Sunsteala Wheelas
  unit), before its model is removed.
- **Effect:** Pick an enemy unit within 3" of the destroyed War Machine and roll a D3. On a 2 or 3, that enemy unit
  suffers mortal damage equal to the roll (so 2 or 3). On a 1, nothing. No enemy within 3" = nothing happens.
- Distance is measured from the War Machine's position at the moment it was slain.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `gloomspite.enh.kunnin-as-a-snarlfang` | Kunnin' as a Snarlfang | Once per battle, any combat phase | Until the end of the turn, +1 Rend to melee weapons of friendly units while they are **wholly within 12"** of the bearer (bearer included). Live aura, checked per attack. Companion weapons are not affected (the rule does not name them, CORE-12.4). |
| `gloomspite.enh.glare-of-frazzlegit` | Glare of Frazzlegit | Once per battle, any combat phase | Declare: an enemy unit in combat with your general. Effect: −1 to hit rolls for that unit's attacks until the end of the turn. |
| `gloomspite.enh.sunsteala-shard` | Sunsteala Shard | Once per battle, enemy shooting phase | Until the end of the turn, friendly units **wholly within 6"** of the bearer cannot be picked as targets of shooting attacks, except by an attacking unit that is in combat with that target. Live aura. |
| `gloomspite.enh.devious-backstabba` | Devious Backstabba | End of any turn (no use limit) | Declare: an enemy **Hero** in combat with the bearer's unit. Effect: roll a D3; on 2+ that Hero suffers mortal damage equal to the roll. |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control. No warscroll prints a Ward. Printed keywords only (Spearhead warscrolls
print no faction keywords; the datasheet carries `DESTRUCTION`, `GLOOMSPITE GITZ` as factionKeywords like the other
armies). Weapon "Companion" = CORE-12.4 (friendly buffs do not apply unless the buff names Companion weapons).

### 5.1 `gloomspite.unit.snarlboss` — Snarlboss
| Move | Health | Save | Control |
|---|---|---|---|
| 12" | 5 | 5+ | 2 |

Keywords: **Hero, Cavalry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Boss Loppa (`gloomspite.weapon.boss-loppa`) | Melee | — | 5 | 4+ | 4+ | 1 | 2 | — |
| Snarlfang's Slavering Jaws (`gloomspite.weapon.snarlfang-jaws`) | Melee | — | 2 | 4+ | 3+ | 0 | 2 | Companion |

**GLO-AB-1 `gloomspite.ability.great-snarlin-howl` — Great Snarlin' Howl**
- **Timing:** Once per turn (army), your hero phase.
- **Declare:** The targets are this unit **and** one other friendly unit within this unit's combat range (3").
- **Effect:** Roll a D6. On 3+, both targets get +1 Attacks and +1 Rend on their **Companion** melee weapons until the
  end of the turn. (This is one of the few buffs that explicitly reaches Companion weapons.)
- [interp] With no other friendly unit within 3" the ability cannot be declared (the declare needs both targets).

### 5.2 `gloomspite.unit.wolfgit-retinue` — Wolfgit Retinue
| Move | Health | Save | Control |
|---|---|---|---|
| 12" | 2 | 5+ | 1 |

Keywords: **Cavalry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Grot Bow (`gloomspite.weapon.grot-bow`) | Ranged | 15" | 2 | 4+ | 5+ | 0 | 1 | — |
| Stabbin' Stikka (`gloomspite.weapon.stabbin-stikka`) | Melee | — | 2 | 4+ | 5+ | 0 | 1 | — |
| Snarlfang's Slavering Jaws (`gloomspite.weapon.snarlfang-jaws`) | Melee | — | 2 | 4+ | 3+ | 0 | 2 | Companion |

Loadout: one model has Grot Bow + Jaws; the other has Stabbin' Stikka + Jaws (two composition entries, 1 each).

**GLO-AB-2 `gloomspite.ability.i-got-dis-boss` — I Got Dis, Boss**
- **Timing:** Passive.
- **Effect:** While a friendly **Snarlboss** is within this unit's combat range (3", closest models; **not** "wholly"),
  this unit and that Snarlboss both have **Ward (5+)**. Checked live at each ward roll.

### 5.3 `gloomspite.unit.snarlpack-cavalry` — Snarlpack Cavalry
| Move | Health | Save | Control |
|---|---|---|---|
| 12" | 3 | 4+ | 1 |

Keywords: **Cavalry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Pointy Skewas (`gloomspite.weapon.pointy-skewas`) | Melee | — | 4 | 4+ | 5+ | 0 | 1 | Charge (+1 Damage) |
| Giant Snarlfang's Jaws (`gloomspite.weapon.giant-snarlfang-jaws`) | Melee | — | 3 | 4+ | 3+ | 0 | 2 | Companion |

**GLO-AB-3 `gloomspite.ability.frazzleburned-scrap` — Frazzleburned Scrap**
- **Timing:** Passive.
- **Effect:** This unit has **Strike-first** in a turn in which it charged.

### 5.4 `gloomspite.unit.sunsteala-wheelas` — Sunsteala Wheelas
| Move | Health | Save | Control |
|---|---|---|---|
| 12" | 6 | 4+ | 2 |

Keywords: **War Machine**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Grot Bow (`gloomspite.weapon.grot-bow`) | Ranged | 15" | 2 | 4+ | 5+ | 0 | 1 | — |
| Wheela Slicers and Stabbin' Stikka (`gloomspite.weapon.wheela-slicers`) | Melee | — | 4 | 4+ | 4+ | 0 | 1 | — |
| Snarlfangs' Slavering Jaws (`gloomspite.weapon.snarlfangs-jaws-pair`) | Melee | — | 4 | 4+ | 3+ | 0 | 2 | Companion |

(The Wheela's jaws profile has 4 Attacks, two wolves; it is a separate weapon id from the single-wolf 2-Attack jaws.)

**GLO-AB-4 `gloomspite.ability.careening-destruction` — Careening Destruction**
- **Timing:** Your movement phase. Ability keywords: **Core, Move**.
- **Effect:** This unit moves up to its Move characteristic (12"). During the move it may pass through other models
  (friend or foe) and through enemy combat ranges, but it may not finish the move in combat. Then pick up to 1 enemy
  **Infantry** unit that it passed across during that move: that unit suffers D3 mortal damage (no roll to succeed).
- It may be used while the unit is **in combat** (designer's note in the source); it is then a way out of combat that is
  not a Retreat (no Retreat damage to waive, and nothing in the rule stops a later charge or shooting).
- [interp] Using it is this unit's move for the phase: a unit that already made a Normal Move, Run or Retreat this
  phase cannot use it, and a unit that used it cannot also make one of those moves.

---

## 6. Spells and prayers

None. No Wizard or Priest and no lore.

---

## 7. Mechanics mapping

(a) = expressible with existing data (`src/data/factions/*/abilities.json` descriptors: `timing`, `limit`, `when`,
`effect`, `scope`, `duration`, `modes`); (b) = new faction code hook in `src/engine/factions/gloomspite.ts` (spread
into `code-hooks.ts` like `fyreslayersHooks`); (c) = engine change. Every activated ability needs a `code` hook
(abilities.ts always calls `activate.resolve`), so "(b) small" means a 10–30 line hook in the existing patterns.

| Rule | Class | How |
|---|---|---|
| Companion weapons | (a) | Weapon ability `COMPANION` (weapons.ts returns them as printed; attack.ts skips friendly positive roll modifiers). |
| Charge (+1 Damage) | (a) | Weapon ability `CHARGE_DAMAGE` on Pointy Skewas. |
| Wolfgit mixed loadout | (a) | Two `composition` entries (`wolfgit-bow`: grot-bow + snarlfang-jaws; `wolfgit-stikka`: stabbin-stikka + snarlfang-jaws), 1 each. |
| GLO-BT-1 charge after Retreat | (a) | Battle trait passive, scope self (battle traits sit on every unit, hooks-impl.ts), effect `{ chargeAfterFallBack: true }`. charge.ts line ~69 already asks `eligibilityFor(…, 'charge')` for a unit whose `moveType === 'fallBack'`. |
| GLO-BT-1 no Retreat damage | (c) small | Same descriptor also carries `{ noRetreatDamage: true }`, but `unitIgnoresRetreatDamage` (phases/movement.ts) reads only **active** effects (`effectService.activeFor`). Change: also return true when a passive descriptor source held by the unit (`sourcesFor(state)` from hooks-impl.ts, filtered to `holderUnitId === unitId`, code gate passed) carries `noRetreatDamage`. No signature change: `unitIgnoresRetreatDamage(state: GameState, unitId: UnitId): boolean`. (Fallback (b): an `ensureEffects` hook granting a battle-long `{ noRetreatDamage }` effect to every Gitz unit, like `citiesGlimmering`.) |
| GLO-RA-1 Flankin' Force | (a)+(b) reuse | Same mechanism as FYR-RA-1: data `timing startOfRound / your`, `limit oncePerBattle`, `params { round: 1, maxUnits: 2, minEnemyDistance: 6, anywhere: true }`, `code: 'fyreslayersMagmicTunnels'` (the hook keys on its own code and reads params by ability id, so it works for any army). Only its announce text says "Magmic Tunnels … dive into the tunnels": change it to use `state.abilities[use.abilityId].name` (one-line edit in fyreslayers.ts), or register an alias `gloomspiteFlankinForce` that wraps `tunnelsActivate` with its own text. AI: flank the two Snarlpack Cavalry units (the existing `tunnelOrder` puts W ≤ 2 units first, which would pick the Wolfgits; rank by the unit's melee output instead or accept it for v1). |
| GLO-RA-2 Frazzleboom | (b) `gloomspiteFrazzleboom` + (c) small | `onOwnModelSlain(ctx, { ability, unitId, model, by })` (attack.ts already runs it for the regiment ability too): if the slain model's unit has `WAR MACHINE`, find enemy units with a model within 3" of the snapshot `model.pos` (base-to-base); v1 auto-pick the one with the fewest wounds left (ties by id; a human pick later); roll D3, on 2+ inflict that many mortal damage. Timing: inside a combat attack sequence queue it with `deferMortalAfterFight` (as STD-AB-4 Glorious Death); outside any attack sequence inflict at once. (c): a Wheela can also die to shooting, so the deferred-mortal queue must also be drained after a shooting unit's attacks resolve (call `drainAfterFightMortal` from phases/shooting.ts after `shooting.attacksResolved`; rename optional). |
| GLO-ENH Kunnin' as a Snarlfang | (b) small `gloomspiteKunnin` | Activated, `phase fight / any`, `limit oncePerBattle`. Resolve: `effectService.grant(ctx, generalUnit, [{ when: { weaponType: 'melee' }, modifyStat: { stat: 'AP', value: -1 } }], { scope: { who: 'friendly', within: 12, wholly: true }, duration: 'untilEndOfTurn' })` — the exact shape of `fyreslayersPlantTheIcon` (aura held by the bearer, range read per attack). Companion weapons stay unaffected automatically. |
| GLO-ENH Glare of Frazzlegit | (b) small `gloomspiteGlare` | Activated, `phase fight / any`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'enemy', filter: { within: { of: 'self', inches: 3 } } }]` (bearer = general). Resolve: grant the target `{ modifyRoll: { roll: 'hit', value: -1 } }`, scope self, `untilEndOfTurn` (as `slavesRageOfArkhar` grants to its target). Negative, so it also hits the target's Companion attacks; capped at ±1 with other hit modifiers (CORE-2.5). |
| GLO-ENH Sunsteala Shard | (b) `gloomspiteSunstealaShard` + (c) | Activated, `phase shooting / enemy`, `limit oncePerBattle` (the non-active player's window, as Cities' Ironweld Discipline). Resolve: grant the bearer's unit a marker aura `{}` with scope `{ who: 'friendly', within: 6, wholly: true }`, `untilEndOfTurn`. (c) new code-hook field `forbidsShootingTarget?(state: GameState, entry: HookSourceEntry, firingUnitId: UnitId, targetUnitId: UnitId): boolean` + `hookService.shootingTargetForbidden(state, firingUnitId, targetUnitId): boolean`, consulted in `phases/shooting.ts targetLegality` (reject "hidden by the Sunsteala Shard"), in Cities' Ironweld Discipline target list and in the AI's shooting target scoring. The hook answers true while the target is wholly within 6" of the bearer and the firing unit is not in combat with the target (`enemiesInCombat(state, firingUnitId).includes(targetUnitId)` = allowed). The existing `targetRangeCap` (unused in AoS) cannot express "unless in combat with it". AI: use it at the first enemy shooting phase in which an enemy unit could shoot a Gitz unit inside the radius. |
| GLO-ENH Devious Backstabba | (b) small `gloomspiteBackstabba` | Activated, `endOfTurn / any`, no limit, `declare [{ role: 'unit', owner: 'enemy', filter: { keyword: 'HERO', within: { of: 'self', inches: 3 } } }]`. Resolve: roll D3 (`rollSum`), on 2+ `inflictMortal(ctx, use, target, roll)`. `canUse` = bearer on board with an enemy Hero in combat. |
| GLO-AB-1 Great Snarlin' Howl | (b) `gloomspiteSnarlinHowl` + (c) | Activated, `phase command / your`, `limit oncePerTurnArmy`, `roll { dice: 'D6', succeedOn: 3 }`, declare one friendly unit within 3" of the Snarlboss (`filter.within { of: 'self', inches: 3 }`, excluding itself); `canUse` needs such a unit. Resolve: grant both the Snarlboss and the target `[{ when: { weaponType: 'melee', weaponAbility: 'COMPANION' }, modifyStat: { stat: 'A', value: 1 }, affectsCompanion: true }, { when: { weaponType: 'melee', weaponAbility: 'COMPANION' }, modifyStat: { stat: 'AP', value: -1 }, affectsCompanion: true }]`, scope self, `untilEndOfTurn`. (c): add `affectsCompanion?: true` to `Effect` in `src/data/types.ts` (+ `common.schema.json`); in `weapons.ts effectiveWeapon`, for a Companion weapon apply only stat modifiers whose effect carries `affectsCompanion` (pass `companionOnly: true` into the `statFor` query; `hooks-impl.ts statFor` then skips effects without the flag) instead of returning `base`; in `attack.ts rollAttackCount` use that effective weapon for Companion weapons too. Roll-modifier filtering in `runStage` stays as is. |
| GLO-AB-2 I Got Dis, Boss | (b) `gloomspiteIGotDisBoss` | Passive on the Wolfgit Retinue, `adjustFeelNoPain` like `fyreslayersDutyUntoDeath`: for a defending model in the holder unit or in a friendly unit whose datasheet is `params.datasheet` (`gloomspite.unit.snarlboss`, matched with `isDatasheet`), return `params.ward` (5) while `unitsWithin(state, holder, snarlboss, params.range = 3)` — plain closest-model distance, not `whollyWithinUnit`. Could share code with Duty Unto Death through a `params.wholly` flag. |
| GLO-AB-3 Frazzleburned Scrap | (a) | Passive, `when: { unitCharged: true }`, effect `{ fightsFirst: true }`, scope self (same shape as Ironjawz Unleashed Rage). |
| GLO-AB-4 Careening Destruction | (b) `gloomspiteCareening` + (c) | Activated, `phase movement / your`, `keywords ['CORE', 'MOVE']`, no limit (each Wheela once per phase via `canUse`: the unit has not moved this phase, `turn.moveType` unset; allowed while in combat). The move is an engine-built slide like Mighty Destroyers (aos-moves.ts option list + `applySlide`), then a mode step picks the crossed Infantry unit (or none). (c) in aos-moves.ts: `checkSlide(state, unitId, dx, dz, maxDistance, mustEndInCombat, opts?: { passThrough?: boolean; mustEndOutOfCombat?: boolean }): SlideResult` — `passThrough` validates only the end spot against model overlap (path may cross any models and combat ranges, as FLY + `moveThroughModels` do in movement.ts), `mustEndOutOfCombat` rejects an end inside any enemy combat range; `slideOptions(…, opts)` forwards it; and `unitsPassedAcross(state: GameState, unitId: UnitId, dx: number, dz: number): UnitId[]` = enemy units with a model whose base the swept footprint (moving base radius + target base radius vs. the straight path segment) touches. After the move set `unit.turn.moveType = 'normal'` and the unit's moved flag so the movement phase does not offer it another move and Run/Retreat restrictions do not apply. Resolve damage: `inflictMortal(ctx, use, target, D3)`. AI: pick the heading that crosses an enemy Infantry unit with the fewest wounds left and ends nearest an objective; from combat, prefer it over Retreat. |
| War Machine + AI | note | `ai/utility.ts` (line ~305, ~544) treats a war machine as a static gunline (Cities' Great Cannon). The Wheela is a fast melee chariot: key that behaviour on "has a ranged weapon whose range ≥ 24"" or on Cities' datasheet, not on the `WAR MACHINE` keyword. |
| Hit modifier cap | existing | `dice.ts` clamps hit ±1 (CORE-2.5): Glare's −1 does not stack with another −1 on the same attack. |
| Ward sources | existing | Only I Got Dis, Boss gives a Ward; best-ward rule in attack.ts unchanged. |
| Reinforcements | (a) | Nothing to do: no unit has the keyword, so `replaceableUnits` is empty for this army. |

---

## 8. Engine notes

1. **Retreat-and-charge loop (GLO-BT-1):** the AI must learn that a Gitz unit in combat can Retreat for free and then
   charge again in the same turn (resetting Strike-first for the Snarlpack Cavalry and Charge (+1 Damage) for the
   Skewas). Without this the army plays like plain cavalry.
2. **Companion buffs (GLO-AB-1):** the only buff in the four shipped armies plus this one that reaches Companion
   weapons. Every other friendly buff (Kunnin' as a Snarlfang, Cities' or Fyreslayers' auras if ever mixed) must still
   skip Companion weapons; GLO-WEAP-2 guards that.
3. **Enemy-phase windows:** Sunsteala Shard needs the non-active player's activation window at the start of (and
   between activations in) the enemy shooting phase; Glare of Frazzlegit and Kunnin' need it in either combat phase;
   Devious Backstabba in either player's end-of-turn window.
4. **Sunsteala Shard is a live aura:** a unit that leaves the 6" bubble (or is only partly inside) becomes targetable
   again for the rest of that turn.
5. **Frazzleboom ordering:** mortal damage dealt from inside an attack sequence is held until the sequence ends (the
   Glorious Death queue); the 3" check uses the War Machine's slain position, so it does not matter that the model is
   gone by then.
6. **Careening Destruction "passed across":** with engine-built straight slides the swept path is exact; if a free
   drag path is ever allowed for this ability, test every path segment the same way.
7. **Contract impact:** none of the (c) items touch the frozen engine contracts (`types/actions/events/hooks/rng/
   decider/index`) except `Effect.affectsCompanion` in `src/data/types.ts` (data types, plus `common.schema.json`)
   and the new optional `EngineCodeHook.forbidsShootingTarget` in `code-hooks.ts`.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| GLO-ARMY-1 | Snarlpack Huntaz roster builds: Snarlboss general + Wolfgit Retinue (2) + 2× Snarlpack Cavalry (3) + 2× Sunsteala Wheelas (1), 11 models, stats as section 5. |
| GLO-ARMY-2 | No unit has Reinforcements; Call for Reinforcements is never offered to this army. |
| GLO-ARMY-3 | Wolfgit Retinue: one model has Grot Bow + Jaws, the other Stabbin' Stikka + Jaws. |
| GLO-BT-1 | Fast as Frazzlegit: a unit that Retreated this turn may still declare a charge (a unit that Ran may not). |
| GLO-BT-2 | Fast as Frazzlegit: Retreat inflicts no mortal damage on Gitz units. |
| GLO-RA-1 | Flankin' Force: start of round 1 only, once per battle, up to 2 units re-set anywhere > 6" from all enemies. |
| GLO-RA-2 | Frazzleboom fires only when a War Machine is destroyed (not on a Cavalry unit's death). |
| GLO-RA-3 | Frazzleboom: D3 roll of 1 = nothing; 2 or 3 = that much mortal damage to an enemy unit within 3" of the slain Wheela. |
| GLO-RA-4 | Frazzleboom with no enemy within 3" does nothing; a Wheela slain mid-combat-sequence deals its damage after the sequence. |
| GLO-ENH-1 | Kunnin' as a Snarlfang: once per battle in a combat phase; +1 melee Rend only for units wholly within 12" (bearer included), not for Companion weapons, until end of turn. |
| GLO-ENH-2 | Glare of Frazzlegit: only an enemy in combat with the general; −1 to hit for its attacks until end of turn; once per battle. |
| GLO-ENH-3 | Sunsteala Shard: in the enemy shooting phase, friendly units wholly within 6" of the bearer cannot be shot except by a unit in combat with them; expires at end of turn; once per battle. |
| GLO-ENH-4 | Devious Backstabba: end of any turn, enemy Hero in combat with the bearer; D3 roll of 2+ deals that many mortal damage; usable every turn. |
| GLO-AB-1 | Great Snarlin' Howl: on 3+, the Snarlboss and one friendly unit within 3" get +1 Attacks and +1 Rend on Companion melee weapons only, until end of turn. |
| GLO-AB-2 | Great Snarlin' Howl: once per turn for the army; not offered without another friendly unit within 3". |
| GLO-AB-3 | I Got Dis, Boss: Wolfgits and Snarlboss have Ward (5+) only while within 3" of each other (closest models, not wholly). |
| GLO-AB-4 | Frazzleburned Scrap: Snarlpack Cavalry have Strike-first only on a turn they charged. |
| GLO-AB-5 | Careening Destruction: moves up to 12" through models and enemy combat ranges; may start in combat; may not end in combat. |
| GLO-AB-6 | Careening Destruction: D3 mortal damage to one enemy Infantry unit passed across; a non-Infantry unit passed across is not a legal pick. |
| GLO-AB-7 | Careening Destruction counts as the unit's move: no Normal Move/Run/Retreat after it in that phase, and the unit may still shoot and charge. |
| GLO-WEAP-1 | Pointy Skewas get +1 Damage on a turn the Snarlpack Cavalry charged. |
| GLO-WEAP-2 | Companion jaws ignore friendly positive buffs other than Great Snarlin' Howl (e.g. Kunnin' Rend) but take enemy negatives (Glare-style −1 to hit). |

---

## 9a. Implementation notes (F8, as built)

Checked against `docs/sources/spearhead-gloomspite-gitz.pdf`: every number, keyword and timing in sections 2 to 5 matches the PDF.
Code: `src/engine/factions/gloomspite.ts`; data: `src/data/factions/gloomspite/`; tests: `tests/engine/gloomspite.test.ts`,
`tests/data/gloomspite.test.ts`.

- **Test ID numbering.** Section 9 numbers the warscroll abilities differently from section 5 (the rules text there says AB-1 Howl,
  AB-2 I Got Dis, AB-3 Frazzleburned Scrap, AB-4 Careening). The tests follow section 9: GLO-AB-1/2 Howl, AB-3 I Got Dis, AB-4
  Frazzleburned Scrap, AB-5 to AB-7 Careening Destruction; GLO-RA-1 is Flankin' Force and GLO-RA-2 to RA-4 Frazzleboom; GLO-BT-1/2 are
  the two halves of Fast as Frazzlegit. Data-only checks use `GLO-DATA-n`, the AI helpers `GLO-AI-1`.
- **Careening Destruction is offered when the unit declares its move**, not in the end-of-phase window the mapping table assumed (the
  AI activates every unit, so it would never have seen the ability). The data sets `params.window: 'moveDeclared'`; the unit may be
  in combat (it then declared a Retreat, which Careening replaces). The modes are engine-built rigid slides (`slideOptions`
  with `passThrough` + `mustEndOutOfCombat`), one per crossed enemy Infantry unit when the path crosses any ("..., hitting X"; no
  mode names a non-Infantry unit), best first (a victim, then progress toward an objective nobody holds). After the slide the hook
  sets `turn.moveType = 'normal'` (so no Retreat roll, no Run limits) and writes the movement phase's `mv:placements` mark with the
  unit's new positions, so `phases/movement.ts` closes the unit with a zero-length move instead of asking for a second one.
- **Frazzleboom** picks the enemy unit within 3" of the slain War Machine's snapshot position with the fewest wounds left (ties by
  id); a human pick is a later refinement. Inside a Fight or Shooting attack sequence the mortal damage is held with
  `deferMortalAfterFight` (drained by fight.ts and shooting.ts), otherwise it is dealt at once. The D3 is rolled when the Wheela falls.
- **Kunnin' and Sunsteala Shard are live auras** (an effect on the bearer's unit with scope `friendly, wholly`), read at every attack /
  target pick. `canUse` hides them when pointless: Kunnin' needs a unit in the aura that is in combat, the Shard needs an enemy unit
  with a ranged weapon. Glare and Devious Backstabba list their targets (`enemiesInCombat` of the bearer's unit, Heroes only for
  Backstabba), Backstabba's D3 is the data-declared roll (2+ succeeds, the roll is the damage).
- **Great Snarlin' Howl** grants `affectsCompanion` stat modifiers (+1 Attacks, +1 Rend) limited by `when { weaponAbility: COMPANION }`.
- **I Got Dis, Boss** is a code ward (`adjustFeelNoPain`), unit level: any model of the Wolfgits or the Snarlboss has Ward (5+) while
  the two units' closest models are within 3".
- **Flankin' Force** reuses `fyreslayersMagmicTunnels` with `params.preferDatasheets` (the Snarlpack Cavalry are the AI's first picks) and
  `params.redeployText`.
- **AI**: `gloomspiteAbilityTiming` (Careening only when it gets out of combat or runs down Infantry; the Shard only when an enemy shooter
  is in reach) and `retreatsAndCharges` (src/ai/utility.ts counts a free Retreat as a charge set-up and rewards it in combat) live in the
  faction file; utility.ts calls them in `abilityTiming`, `scorePosition` (`chargeNow`) and the `fallBack` score.

---

## 10. Figures (3D pipeline)

Palette for the whole army: bright green grot skin, charcoal-black hooded cloaks and robes, rust-red shields, pennants
and saddle cloths, grey-white shaggy wolves with dark muzzles, dull iron blades, and pale-yellow glowing "stolen
sunlight" shards as the accent. All figures are original designs in the house figure style (docs/FIGURE-STYLE.md), no GW logos, no copied
moon or faction icons (our army sigil is an original sun disc with a jagged bite taken out of it).

| Slug | Unit | Models needed | Base (mm) | Mount | Concept prompt |
|---|---|---|---|---|---|
| `glo-snarlboss` | Snarlboss | 1 | 75×42 oval (est.) | Yes (big wolf) | A goblin chieftain with a pointy-eared green head under a tall black hood and a feathered red hat, short legs, riding a chunky grey-white wolf with a snarling head, swinging a long jagged sword that glows faintly yellow, red round shield with an original bitten-sun sigil. |
| `glo-wolfgit-bow` | Wolfgit Retinue (archer) | 1 | 60×35 oval (est.) | Yes (wolf) | A goblin rider with a grinning green head in a ragged black hood, short legs, drawing a crooked short bow while perched on a chunky big-headed grey wolf with a red saddle cloth and a dangling skull charm. |
| `glo-wolfgit-stikka` | Wolfgit Retinue (spear) | 1 | 60×35 oval (est.) | Yes (wolf) | The same goblin wolf rider, hooded head and short legs, but jabbing forward with a short barbed spear and wearing a red bandana mask, its chunky grey wolf mid-leap. |
| `glo-snarlpack-cavalry` | Snarlpack Cavalry | 1 (×6) | 75×42 oval (est.) | Yes (giant wolf, two riders) | Two small goblins, each with giant hooded heads and short legs, sitting back to back on one extra-chunky grey-white wolf with a fanged head, each pointing a long hooked lance to one side, red pennants and a glowing yellow shard on one lance tip. |
| `glo-sunsteala-wheela` | Sunsteala Wheelas | 1 (×2) | 120×92 oval (est.) | Vehicle (chariot) | A chunky war-cart of bent wicker and iron with big spiked wheels and a glowing yellow sun-shard lamp on a pole, pulled by two big-headed short-legged grey wolves, carrying two goblins, one with a short bow and one with a stabbing spear, red rag banners flapping. |
