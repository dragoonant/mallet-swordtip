# Blades of Khorne — Fangs of the Blood God (Spearhead)

Faction id: `khorne` · Army id: `khorne.army.fangs-of-the-blood-god` · Grand alliance: Chaos.
Source: `docs/sources/spearhead-blades-of-khorne.pdf` (4 pages, 10.5 MB, gitignored), "Spearhead: Blades of Khorne - Fangs
of the Blood God", the free Warhammer Community download (Age of Sigmar, Spearhead category). First listed 2025-07-30,
last updated 2026-04-01 (PDF metadata: created 2026-03-12). Fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_01-04_aos_spearhead_blades_of_khorne_fangs_of_the_blood_god-ka6n0z20jt-aeqz1vbnku.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, search term
"khorne"). Stat blocks and ability timings were checked against the rendered pages (the text layer of page 2 is out of order).
Base sizes are not printed in the PDF; they come from the Wahapedia aos4 warscroll pages
(`https://wahapedia.ru/aos4/factions/blades-of-khorne/Karanak`, `/Flesh-Hounds`, `/Claws-of-Karanak`), fetched the same
day with plain curl.

**Which army.** This PDF holds one army: **Fangs of the Blood God** (Karanak, 2×5 Flesh Hounds, 8 Claws of Karanak), the
contents of the current 4th-edition **Spearhead: Blades of Khorne** box. A second, separate download, "Spearhead: Blades
of Khorne - Gore Pilgrims" (Slaughterpriest, 2×5 Blood Warriors, 10 Bloodreavers, 3 Mighty Skullcrushers; listed
2025-11-12), is built from older Bloodbound kits. It is out of scope and only noted in Appendix A.

Mechanics and numbers are ported 1:1; all wording below is our own.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within
combat range of an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`,
Combat phase = `fight`; Run = `advance`, Retreat = `fallBack`. Rend is stored as in the other armies' weapon data.
"Ward (N+)" maps to the datasheet `ward: N` / engine `feelNoPain: N` (best ward only). Hit and wound modifiers are capped
at ±1 in total (CORE-2.4). Rule IDs `BOK-*` double as test IDs (§9).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `khorne.unit.karanak` | Karanak | 1 | **General** | no | 75×42 oval (Wahapedia) |
| `khorne.unit.flesh-hounds` (a) | Flesh Hounds | 5 | Unit | **yes** | 60×35 oval (Wahapedia) |
| `khorne.unit.flesh-hounds` (b) | Flesh Hounds | 5 | Unit | **yes** | 60×35 oval |
| `khorne.unit.claws-of-karanak` | Claws of Karanak | 8: 1 Packlord, 1 Hound of Wrath, 2 Brutalisers, 4 Blood Whelps | Unit | **yes** | Packlord 40 round, Hound of Wrath 60×35 oval, Brutalisers 32 round, Blood Whelps 28.5 round (Wahapedia) |

Total: 4 units, 19 models. Both Flesh Hounds units share one warscroll (two patrol entries, `ref` `flesh-hounds-1` /
`flesh-hounds-2`). Karanak is the only Hero. No Wizard, no Priest, nothing has **Fly**, no Monster, no War Machine.
The Claws of Karanak's four model types are rules-identical in Spearhead (same Health, same single weapon, no champion,
standard or musician rules); they exist only as visibly different figures and bases.

---

## 2. Battle traits

### BOK-BT-1 `khorne.ability.the-quarry` — The Quarry
- **Timing:** Start of every battle round (both players' rounds alike; round 1 included, after deployment).
- **Effect:** If **no enemy unit is currently the quarry**, pick 1 enemy unit to become the quarry. The pick may be a unit
  that is **in reserve** (not yet on the battlefield).
- Notes: there is at most one quarry at a time for this army. A quarry stays the quarry until it is destroyed (there is no
  other way to lose the status); then the army has no quarry until the start of the next battle round. A replacement unit
  from Call for Reinforcements is a new unit (CORE-6.16) and is not the quarry. Several rules below only work while the
  quarry is **on the battlefield**.
- RULING: the pick is mandatory when it is offered and at least one enemy unit exists (the card has no Declare step and
  no "you can").

### BOK-BT-2 `khorne.ability.blood-drenched` — Blood-Drenched
- **Timing:** End of any turn, **once per turn** for the army.
- **Declare:** Pick 1 friendly unit that **slew at least one enemy model with a Fight ability this turn**.
- **Effect:** For the rest of the battle, that unit's **melee weapons have Crit (Mortal)**.
- Notes: "slew with a Fight ability" = an enemy model was slain by damage from that unit's combat attacks (their Crit
  (Mortal) damage included). Mortal damage from other abilities (e.g. Furious Bites) does not count. Using it again on a
  unit that already has it changes nothing; the AI never does.
- RULING (CORE-12.1): when a weapon then has two critical-hit abilities (Weapons of the Hunt: Crit (2 Hits) + Crit
  (Mortal)), the attacker picks one per weapon per attack sequence; see C4 for how the engine picks.

---

## 3. Regiment abilities (pick 1 at army selection)

### BOK-RA-1 `khorne.ability.the-scent-of-blood` — The Scent of Blood
- **Timing:** Passive.
- **Effect:** **+1 to hit and +1 to wound** for **combat (melee) attacks** made by friendly units that target an enemy unit
  that has had **any damage points allocated to it this turn** (from any source: shooting, combat, mortal damage).
- Notes: "allocated" = after wards, so fully warded damage does not count; healing afterwards does not undo it. Damage is
  allocated at the end of each attack sequence, so a unit's own first activation against an undamaged target does not
  benefit from itself.

### BOK-RA-2 `khorne.ability.savagery-upon-savagery` — Savagery Upon Savagery
- **Timing:** **Once per battle** (army), any combat phase.
- **Declare:** Pick 1 friendly unit that is **in combat**.
- **Effect:** Until the end of the turn, **+1 Attacks** to that unit's melee weapons; if the unit is a **Hero**, add **D3**
  instead (one roll, applied to each of its melee weapons).

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `khorne.enh.sustained-by-gore` | Sustained by Gore | End of any turn (no printed limit; CORE-3.4 once per phase) | **Heal (D3)** the general. |
| `khorne.enh.evasive-hunter` | Evasive Hunter | Passive | **−1 to hit and −1 to wound** for **shooting attacks** that target the general. |
| `khorne.enh.killing-pounce` | Killing Pounce | **Once per battle**, any charge phase | Until the end of the turn, the general's charge rolls may use **one extra die** (3 dice in total at most). If that extra die is rolled, the general's charge must **end in combat with the quarry**. |
| `khorne.enh.furious-bites` | Furious Bites | End of any turn (once per turn, CORE-3.4) | If the general is **in combat with the quarry**, the quarry suffers **D3 mortal damage**. |

Notes:
- Evasive Hunter stacks with Guarded Hero (CORE-14.2: Karanak is a Hero but not Infantry, so only its −1 to hit applies)
  under the ±1 hit cap, so the hit penalty stays −1; the wound penalty is Evasive Hunter's alone.
- Killing Pounce: "any charge phase" but the general can only charge in its own. A ½" charge end (CORE-9.2) is still needed;
  the quarry requirement is on top. RULING: the extra die is chosen when the ability is used (start of the charge phase,
  before any charge roll); from then until the end of the turn every charge roll of the general uses 3 dice and must end
  in combat with the quarry. approximation: the card lets the player decide per roll; one Charge per phase means only one
  roll is affected in practice. It cannot be used when the quarry is not on the battlefield.

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Printed keywords only (Spearhead warscrolls print no faction keywords;
data adds `CHAOS`, `KHORNE` as factionKeywords like the other armies).

### 5.1 `khorne.unit.karanak` — Karanak (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 7 | 5+ | 2 | 6+ |

Keywords: **Hero, Beast, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Savage Maws and Goreslick Claws (`khorne.weapon.savage-maws-and-goreslick-claws`) | Melee | — | 6 | 4+ | 3+ | 1 | 2 | Anti-Hero (+1 Rend) |

**BOK-AB-1 `khorne.ability.stalk-the-prey` — Stalk the Prey**
- **Timing:** **Any hero phase** (yours or the opponent's; once per phase, CORE-3.4). Move keyword.
- **Effect:** Roll a D6; this unit may move **up to that many inches**.
  - If it was **not in combat** at the start of the move, it **cannot end the move in combat**.
  - If it **was in combat** at the start, it may end in or out of combat.
  - If the quarry is **on the battlefield**, the unit **must end the move closer to the quarry** than it started.
- RULING: the card restricts only where the move ends, so the path may cross enemy combat ranges (as a Retreat may); it is
  not a Normal Move, Run or Retreat (no Retreat damage, no Run/Retreat lock-outs on shooting or charging).
- RULING: "closer" = the closest-model gap (`unitGap`) between Karanak and the quarry strictly decreases.

### 5.2 `khorne.unit.flesh-hounds` — Flesh Hounds (×2 units)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 2 | 6+ | 1 | 6+ |

Keywords: **Beast, Ward (6+), Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Blood-dark Claws (`khorne.weapon.blood-dark-claws`) | Melee | — | 4 | 4+ | 3+ | — | 1 | — |

**BOK-AB-2 `khorne.ability.unflagging-hunters` — Unflagging Hunters**
- **Timing:** Passive.
- **Effect:** **+1 to charge rolls** for this unit.

### 5.3 `khorne.unit.claws-of-karanak` — Claws of Karanak
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 1 | 5+ | 1 | — |

Keywords: **Infantry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Weapons of the Hunt (`khorne.weapon.weapons-of-the-hunt`) | Melee | — | 3 | 4+ | 3+ | — | 1 | Crit (2 Hits) |

Loadout: all 8 models carry Weapons of the Hunt.

**BOK-AB-3 `khorne.ability.pack-hunters` — Pack Hunters**
- **Timing:** Any combat phase (once per phase for this unit, CORE-3.4).
- **Declare:** Pick 1 enemy unit that is **in combat with both this unit and a friendly Flesh Hounds unit**.
- **Effect:** Until the end of the turn, this unit's **combat attacks against that enemy unit** score **critical hits on
  unmodified hit rolls of 5+** (both 5 and 6 trigger Crit (2 Hits), or the crit ability picked under BOK-BT-2).
- Notes: the condition is checked only at the Declare; the effect lasts the turn even if the Flesh Hounds die or leave.

---

## 6. Spells and prayers

None. The army has no Wizard and no Priest, so it never casts or unbinds and cannot use spell/prayer twist or card effects
that need one.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/khorne/*.json`), at most reusing an existing code hook; (b) = new
faction code hook in `src/engine/factions/khorne.ts`, exported as `khorneHooks` and spread into `code-hooks.ts` like
`skavenHooks`. Shared helpers from `aos-common.ts`: `onBoard`, `unitGap`, `enemiesInCombat`, `inCombat`, `inflictMortal`,
`healUnit`, `isDamaged`, `isDatasheet`, `announce`, `paramOf`. (c) = engine change outside the faction file (C1–C4 below).

**Quarry helper (b):** the quarry is stored as a token `quarry: 1` on the enemy unit (SPH-2.7 tokens; `UnitCard` already
lists tokens, so players see it). `khorneQuarryOf(state, player)` = the unit not owned by `player`, location board or reserve
(not destroyed), with `tokens.quarry > 0`. This works in a Khorne mirror match too (each army's quarry sits on the other
army's units). `quarryOnBoard(state, player)` = the same, location board only.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, Ward 6+, bases | (a) | Datasheets as the other armies; `HERO`, `BEAST`, `INFANTRY`, `REINFORCEMENTS`; `ward: 6` on Karanak and Flesh Hounds. Bases `{ shape: 'oval', mm: 75, mm2: 42 }`, `{ shape: 'oval', mm: 60, mm2: 35 }`; Claws composition with per-model bases (Packlord 40, Hound of Wrath oval 60×35, Brutaliser 32, Blood Whelp 28.5; per-model `base` as `stormfiends.json`). Claws list order: Blood Whelps, Brutalisers, Hound of Wrath, Packlord last (all Health 1; purely cosmetic, keeps the Packlord figure longest). |
| Flesh Hounds ×2, Claws, Reinforcements | (a) | One Flesh Hounds datasheet, two patrol entries (`size: 5`); Claws one entry (`size: 8`). Core `spearheadCallForReinforcements`; Karanak cannot be replaced. |
| Anti-Hero (+1 Rend) | (a) | Weapon `abilities: [{ ability: 'ANTI', keyword: 'HERO', value: 1 }]` (attack.ts `antiBonus`). |
| Crit (2 Hits) | (a) | `{ ability: 'CRIT_2_HITS' }`. |
| BOK-AB-2 Unflagging Hunters | (a) | Passive, scope self, `effect { modifyRoll: { roll: 'charge', value: 1 } }`. |
| BOK-ENH Evasive Hunter | (a) | Passive enhancement, `scope { who: 'attacker' }` (flips the side: holder = the attacked unit, the attacker's roll is modified; the Kruleboyz Scare Taktikz pattern), `effect [{ modifyRoll: { roll: 'hit', value: -1 }, when: { weaponType: 'ranged' } }, { modifyRoll: { roll: 'wound', value: -1 }, when: { weaponType: 'ranged' } }]`. |
| BOK-ENH Sustained by Gore | (b) `khorneSustainedByGore` | Enhancement, `timing endOfTurn / any`, `params.heal 'D3'`. `canUse` = general on board and `isDamaged`. Resolve: roll `params.heal`, `healUnit(ctx, general, n, abilityId)`, announce under its own name (same body as `fyreslayersTooStubborn`, whose announce text is hard-coded, hence a thin copy). |
| BOK-BT-1 The Quarry | (b) `khorneTheQuarry` | Battle trait, `timing startOfRound / any`, `params.mandatory: true` (no pass while offered), `declare [{ role: 'unit', owner: 'enemy' }]`. `canUse` = `khorneQuarryOf(state, player)` is null. `targets` = enemy units with location `board` **or `reserve`** (the hook supplies the list; if the generic declare filter drops off-board units, the hook raises its own `chooseOption` and answers it with `answer`). Resolve: `unit.tokens = { ...unit.tokens, quarry: 1 }`, announce "X is the quarry". Destroyed units keep the token but `khorneQuarryOf` ignores them. |
| BOK-BT-2 Blood-Drenched | (b) `khorneBloodDrenched` + (c) C1 | Battle trait, `timing endOfTurn / any`, `limit oncePerTurnArmy`, `declare [{ role: 'unit', owner: 'friendly' }]`. `targets` = friendly units on board with `slewInFightThisTurn(state, id)` and not already holding this effect. Resolve: `effects.grant(ctx, id, { grantWeaponAbility: { ability: 'CRIT_MORTAL' }, when: { weaponType: 'melee' } }, { scope: { who: 'self' }, duration: 'battle' })`. |
| BOK-RA-1 The Scent of Blood | (a) + (b) gate `khorneScentOfBlood` + (c) C1 | Passive regiment descriptor (sits on every friendly unit), scope self, `effect [{ modifyRoll: { roll: 'hit', value: 1 }, when: { weaponType: 'melee' } }, { modifyRoll: { roll: 'wound', value: 1 }, when: { weaponType: 'melee' } }]`, `code khorneScentOfBlood` whose `gate(state, holder, entry, data)` returns `damagedThisTurn(state, data.attack.targetUnitId)` (false with no attack in `data`). |
| BOK-RA-2 Savagery Upon Savagery | (b) `khorneSavagery` | Regiment ability, `timing phase fight / any`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'friendly' }]`. Targets = friendly units on board and `inCombat`. Resolve: `n = HERO keyword ? rollExpr('D3') : 1`; grant `{ modifyStat: { stat: 'A', value: n }, when: { weaponType: 'melee' } }`, scope self, `duration 'untilEndOfTurn'`. Offered in the start-of-combat window and between fight activations. |
| BOK-ENH Killing Pounce | (b) `khorneKillingPounce` + (c) C3 | Enhancement, `timing phase charge / any`, `params.window 'phaseStart'` (F10 chargeStart window), `limit oncePerBattle`. `canUse` = general on board, not in combat, and `quarryOnBoard`. Resolve: grant the general `{ extraChargeDice: 1 }` until end of turn (`chargeDiceCount` = 3; never above 3 in this army) and record the commitment (the granted ActiveEffect carries `code khorneKillingPounce`). The same hook answers C3 `chargeMustEndInCombatWith(state, entry, unitId)` = `[quarry]` while that ActiveEffect is on `unitId` (`entry.active` set). |
| BOK-ENH Furious Bites | (b) `khorneFuriousBites` | Enhancement, `timing endOfTurn / any` (once per turn by CORE-3.4 since end of turn is one phase). `canUse` = general on board and the quarry is in `enemiesInCombat(state, general)`. Resolve: `inflictMortal(ctx, use, quarry, rollExpr('D3'))`. No roll to pass. |
| BOK-AB-1 Stalk the Prey | (b) `khorneStalkThePrey` + (c) C2 | Datasheet ability, `timing phase command / any`, keyword `MOVE`. `canUse` = on board and at least one legal slide for 6" exists (cheap pre-check; the real distance is rolled). Resolve: `d = rollExpr('D6')`; `writeMoveQueue(s, { abilityId, player, maxDistance: d, queue: [self], opts })` with `opts = inCombat(self) ? { endFree: true } : { mayNotEndInCombat: true }` plus `closerToUnit: quarry` when `quarryOnBoard`. If no slide is legal after the roll, the move is skipped (announce "no legal move"). |
| BOK-AB-3 Pack Hunters | (b) `khornePackHunters` | Datasheet ability, `timing phase fight / any`, `declare [{ role: 'unit', owner: 'enemy' }]`. Targets = enemy units in `enemiesInCombat(state, self)` that are also in combat with a friendly unit `isDatasheet(…, 'khorne.unit.flesh-hounds')` on board. Resolve: grant self `{ lethalOn: 5, when: { weaponType: 'melee' } }` (crit threshold 5 at onHitRoll, hooks-impl `lethalOn`), `duration 'untilEndOfTurn'`, and store the target in a ledger `mission.custom.bokPack[effectId] = targetUnitId`; `gateEffect(state, holder, entry, data)` passes only when `data.attack.targetUnitId === ledger[entry.active.id]` (the `luminethHurricaneWinds` / `citiesConsecrate` gateEffect pattern). Prune ledger entries whose effect is gone at the next grant. |

**Engine changes (c):**
- **C1 turn ledger** (`attack.ts`, non-frozen): `state.mission.custom.turnLedger = { key: '<round>:<activePlayer>', damaged:
  UnitId[], slewInFight: UnitId[] }`, treated as empty whenever `key` differs from the current turn (no reset hook
  needed). `flushDamage` adds the target unit to `damaged` whenever a pool allocates ≥ 1 point (normal or mortal, any
  source, after wards / redirects / ignored points). `slayModel` adds `by.unitId` to `slewInFight` when `by.kind ===
  'melee'` (that already covers the Crit (Mortal) pools of combat attacks, which keep `kind 'melee'` in `by`) and the slain
  model's player differs from `by.player`. Exports `damagedThisTurn(state, unitId): boolean` and
  `slewInFightThisTurn(state, unitId): boolean`. A unit wiped out by the attack counts as damaged and slain.
- **C2 slide options** (`factions/aos-moves.ts`): `SlideOpts + closerToUnit?: UnitId` and `+ endFree?: boolean`.
  `closerToUnit`: `checkSlide` rejects unless `unitGap(after) < unitGap(before) − EPS` to that unit ("the move must end
  closer to <name>"); `slideOptions` puts a "Toward <name>" heading first (direction centroid → that unit's nearest model)
  and adds the diagonals. `endFree`: the unit started in combat but neither must end in combat (overrides the IJZ-2.2
  default) nor must leave it. Combat ranges on the path are not checked (as the default slide). approximation: rigid slide
  from the heading list, like every out-of-phase move.
- **C3 charge target constraint** (`code-hooks.ts`, `hooks-impl.ts`, `phases/charge.ts`): `EngineCodeHook +
  chargeMustEndInCombatWith?(state, entry, unitId): UnitId[] | null`, folded by `hookService.chargeMustEndInCombatWithFor(state,
  unitId)` over every source entry (ActiveEffects included). `charge.ts` passes the result as `MoveConstraints.mustEndInEngagementWith`
  (already supported by `geometry.ts checkPlacements`; engagement = combat range 3") in `chargeMoveRejection` and the
  candidate builder, and the reach pre-check / AI `chargeProb` measure only to those units. Empty / null = no constraint.
- **C4 crit choice** (`attack.ts`, CORE-12.1): when an effective weapon has more than one of `CRIT_MORTAL` / `CRIT_2_HITS` /
  `CRIT_AUTO_WOUND`, pick the one with the higher expected damage against the batch's target instead of "first listed":
  `CRIT_MORTAL` = Damage; `CRIT_2_HITS` = hits per crit (its `value`, default 2) × P(wound) × P(save fails after rend) ×
  Damage; `CRIT_AUTO_WOUND` = P(save fails after rend) × Damage; ties keep the first listed. [interp] the attacker would choose; the engine chooses for both humans
  and AI (no extra decision). Weapons of the Hunt with Crit (Mortal) then use Crit (Mortal) against any save of 5+ or better
  and Crit (2 Hits) against 6+ or no save. Additive: no current weapon has two crit abilities.

None of C1–C4 touches `src/engine/{types,actions,events,hooks,rng,decider,index}.ts` or `src/data/types.ts`; C2–C4 need a
row in `docs/spec/13-engine-port-plan.md` (a new §3.x for this army).

---

## 8. Engine notes

1. **Quarry lifecycle:** picked at the round-start window by the Khorne player; it is the only Khorne rule offered there.
   A quarry in reserve still counts as "a quarry exists" (no new pick) but Stalk the Prey's closer rule, Killing Pounce
   and Furious Bites need it on the battlefield. Destroyed quarry → no quarry until the next round start.
2. **End of turn order:** Furious Bites, Sustained by Gore and Blood-Drenched are all end-of-turn abilities; the owner picks
   the order (the AI: Furious Bites, then Blood-Drenched, then Sustained by Gore). Furious Bites' mortal damage never feeds
   Blood-Drenched (kind `mortal`, not a Fight ability).
3. **Blood-Drenched stacking:** Crit (Mortal) on Karanak's weapon makes each crit 2 mortal damage with no wound/save; on
   Flesh Hounds 1 mortal; on the Claws see C4. Pack Hunters' 5+ crits feed whichever crit ability applies.
4. **Scent of Blood timing:** the ledger is per turn, so damage dealt in the opponent's turn does not carry into yours.
   Typical use: shoot-free army, so the opener is a charge by one unit, then the second unit's combat attacks get +1/+1.
5. **Savagery on Karanak:** D3 is rolled once at resolve; the effect is a flat stat modifier until end of turn.
6. **AI:** The Quarry — the enemy unit with the highest threat that Karanak can reach soonest (prefer the enemy general if
   within 20", else the closest enemy unit with Health ≤ 10; reserve units only if nothing is on the board). Stalk the
   Prey — use in every hero phase where a legal move ends closer to the quarry, or in the enemy hero phase to step out of a
   losing combat. Killing Pounce — when the 2-dice chance to reach the quarry is < 60% and the 3-dice chance ≥ 40%.
   Savagery — on Karanak when it is in combat with the quarry or an enemy Hero, else the unit in combat with the most
   attacks. Pack Hunters — always when legal. Blood-Drenched — Karanak first, then the Claws, then Flesh Hounds.
   Furious Bites and Sustained by Gore — always when legal.
7. **Defaults for the sim:** regiment The Scent of Blood (passive) and enhancement Evasive Hunter (passive); variant games
   Savagery Upon Savagery and Killing Pounce.
8. **Ward sources:** printed Ward (6+) on Karanak and Flesh Hounds; nothing in the army improves it.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| BOK-ARMY-1 | Fangs of the Blood God builds: Karanak general + 2×5 Flesh Hounds + 8 Claws of Karanak, 19 models, stats as §5. |
| BOK-ARMY-2 | Claws of Karanak hold 1 Packlord, 1 Hound of Wrath, 2 Brutalisers, 4 Blood Whelps with their own bases; all Health 1 with Weapons of the Hunt. |
| BOK-ARMY-3 | Reinforcements on both Flesh Hounds units and the Claws; Karanak never offered for replacement. |
| BOK-BT-1 | The Quarry: at round start with no quarry the player must pick an enemy unit (reserve allowed); with a living quarry nothing is offered. |
| BOK-BT-1b | The quarry is lost only when destroyed; a new one is picked at the next round start, never mid-round; a replacement unit is not the quarry. |
| BOK-BT-2 | Blood-Drenched: only a unit that slew an enemy model with combat attacks this turn can be picked; its melee weapons have Crit (Mortal) for the rest of the battle; once per turn. |
| BOK-BT-2b | A model slain by Furious Bites or other ability mortal damage does not qualify a unit for Blood-Drenched. |
| BOK-RA-1 | The Scent of Blood: melee attacks get +1 hit and +1 wound only against an enemy unit that had damage allocated this turn; never for shooting; resets next turn. |
| BOK-RA-2 | Savagery Upon Savagery: +1 Attacks to melee weapons of a friendly unit in combat until end of turn; +D3 for a Hero; once per battle. |
| BOK-ENH-1 | Sustained by Gore: Heal (D3) the general at the end of any turn; not offered while undamaged. |
| BOK-ENH-2 | Evasive Hunter: −1 hit and −1 wound for shooting attacks targeting the general; melee attacks unaffected; hit penalty stays −1 with Guarded Hero. |
| BOK-ENH-3 | Killing Pounce: general charges with 3 dice for the rest of the turn and the charge must end in combat with the quarry; not offered without a quarry on the board; once per battle. |
| BOK-ENH-4 | Furious Bites: D3 mortal damage to the quarry at end of any turn only while the general is in combat with it. |
| BOK-AB-1 | Stalk the Prey: in any hero phase Karanak moves up to D6"; out of combat it cannot end in combat; in combat it may end in or out. |
| BOK-AB-1b | Stalk the Prey: with the quarry on the board every accepted move ends closer to it; with the quarry in reserve or none, no closer rule. |
| BOK-AB-2 | Unflagging Hunters: Flesh Hounds add 1 to charge rolls. |
| BOK-AB-3 | Pack Hunters: only an enemy unit in combat with both the Claws and a friendly Flesh Hounds unit can be picked; Claws' melee attacks against it crit on unmodified 5+ until end of turn; other targets crit on 6 only. |
| BOK-WEAP-1 | Savage Maws and Goreslick Claws: Rend 2 against a Hero, Rend 1 otherwise. |
| BOK-WEAP-2 | Weapons of the Hunt: each critical hit scores 2 hits. |
| BOK-WEAP-3 | Weapons of the Hunt with Blood-Drenched: the engine picks Crit (Mortal) against a 5+ or better save and Crit (2 Hits) against a 6+ save (C4). |
| BOK-ENG-C1 | Turn ledger: `damagedThisTurn` / `slewInFightThisTurn` are true after the event in this turn and false in the next. |
| BOK-ENG-C2 | Slide `closerToUnit` rejects a slide that does not reduce the gap; `endFree` lets an in-combat unit end out of combat. |
| BOK-ENG-C3 | `chargeMustEndInCombatWith` rejects a charge that ends ½" from another enemy but not in combat with the named unit. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own blood-hunt livery): deep crimson and raw-meat red hides, blackened iron and dark
brass armour and collars, bone-white horns and teeth, dark leather straps, ember-orange eyes. Shared motif: an original
three-fang notch mark (three short downward triangles side by side) stamped on collars and plates. No GW logos, no copy of
the Khorne skull rune or any Khorne iconography. All figures are **true MGSD** chibis (~2.5 heads tall, huge head, stubby
legs, big paws/hands); the beasts are chunky toy-like SD quadrupeds with oversized heads. Effects (drool, blood spatter)
are solid sculpted shapes, never see-through.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `bok-karanak` | Karanak | 1 | 75×42 oval | No (a beast hero, no rider) | A chunky toy-like SD three-headed daemon hound, its three oversized round heads (wide fanged grins, ember-orange eyes) taking up half its body, stubby thick legs with big clawed paws, crimson hide with dark-brass collar frills and spiky black-iron ridge plates down its back, one solid red drool blob hanging from the middle jaw. |
| `bok-flesh-hound` | Flesh Hounds | 1 (×10) | 60×35 oval | No | A chunky toy-like SD daemon hound with a single huge head and big toothy grin, ember eyes, stubby legs and fat paws, crimson skin, a wide flared dark-brass collar with the three-fang notch, short black spines along its back. |
| `bok-claws-packlord` | Claws of Karanak (Packlord) | 1 | 40 round | No | A true MGSD chibi barbarian hunt-leader, 2.5 heads tall with an enormous head wearing a hound-skull mask and a black fur mantle, stubby legs, dark-brass shoulder guard, a hooked axe in one big hand and a short chain flail in the other. |
| `bok-claws-hound-of-wrath` | Claws of Karanak (Hound of Wrath) | 1 | 60×35 oval | No | A chunky toy-like SD mortal war-hound bred by the cultists, oversized scarred head with a spiked iron muzzle-cage, stubby legs, red-brown hide with leather harness straps and a broken chain leash, distinct from the daemon hounds by its plain fur and iron (not brass) collar. |
| `bok-claws-brutaliser` | Claws of Karanak (Brutalisers) | 1 (×2) | 32 round | No | A true MGSD chibi hulking cultist bruiser, 2.5 heads tall with a huge shaved head, a dark-brass jaw guard and red war paint, stubby legs, bare arms with leather wraps, dragging a heavy spiked iron cleaver bigger than its body. |
| `bok-claws-blood-whelp` | Claws of Karanak (Blood Whelps) | 1 (×4) | 28.5 round | No | A true MGSD chibi wild young cultist, 2.5 heads tall with an enormous head of spiky red-dyed hair and a feral fanged grin, stubby legs in ragged crimson trousers, a short notched blade in one hand and a length of hooked chain in the other. |

Karanak and the Flesh Hounds are the army's signature figures and must read as daemons at a glance (crimson skin, brass
collars). The four Claws variants are distinct sculpts for looks only; the rules treat all eight models the same, so the
Blood Whelp figure may stand in for any missing variant.

---

## 11. Implementation notes

Not built yet. Planned layout: data `src/data/factions/khorne/` (faction.json, datasheets/{karanak, flesh-hounds,
claws-of-karanak}.json, weapons.json, abilities.json, enhancements.json, patrols/fangs-of-the-blood-god.json); hooks
`src/engine/factions/khorne.ts` (`...khorneHooks` in `code-hooks.ts`; AI hints `khorneAbilityTiming` / `khorneTargetBonus`
wired in `src/ai/utility.ts` as for Skaven). Tests: `tests/engine/khorne.test.ts`, `tests/data/khorne.test.ts` (one test per
BOK- id). Patrol `battleTraits: ['khorne.ability.the-quarry', 'khorne.ability.blood-drenched']`, regiment list The Scent of
Blood (default) then Savagery Upon Savagery, enhancement list Evasive Hunter (default), Sustained by Gore, Killing Pounce,
Furious Bites. Figure mapping keys `<datasheet id>/<modelId>` (`khorne.unit.claws-of-karanak/packlord`, `/hound-of-wrath`,
`/brutaliser`, `/blood-whelp`). Order of work: C1–C4 first (generic), then data, then the hooks.

---

## Appendix A — Gore Pilgrims (separate download; out of scope)

"Spearhead: Blades of Khorne - Gore Pilgrims" (`https://assets.warhammer-community.com/eng_01-04_aos_spearhead_blades_of_khorne_bloodbound_gore_pilgrims-r1xwzo5jaf-hkweqb74wl.pdf`,
7 pages, 23 MB, listed 2025-11-12, last updated 2026-04-01) is a second Blades of Khorne Spearhead built from older
Bloodbound kits: General **Slaughterpriest**; units 2×5 Blood Warriors, 10 Bloodreavers, 3 Mighty Skullcrushers. Its
battle traits run on a blood tithe point pool spent on effects such as extra D6" moves for up to D3 units. It is not the
army of the current box; it was only skimmed to identify it and its rules are not recorded here. It is not saved under
`docs/sources/` (that file name belongs to Fangs of the Blood God); fetch it again if this army is ever built.
