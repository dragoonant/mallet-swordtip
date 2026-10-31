# Daughters of Khaine — Heartflayer Troupe (Spearhead)

Faction id: `daughters` · Army id: `daughters.army.heartflayer-troupe` · Grand alliance: Order.
Source: `docs/sources/spearhead-daughters-of-khaine.pdf` (4 pages, 9.0 MB, gitignored), "Spearhead: Daughters of Khaine -
Heartflayer Troupe", the free Warhammer Community download (Age of Sigmar, Spearhead category). First listed 2026-04-01, last
updated 2026-10-28 (PDF metadata: created 2026-10-06, modified 2026-10-20), fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_28-10_aos_spearhead_daughetrs_of_khaine_heartflayer_troupe-quzpujyq4t-4ufmxrkoky.pdf`
(the "daughetrs" typo is in GW's file name). It was found through the downloads search API
(`POST https://www.warhammer-community.com/api/search/downloads/`, search term "daughters"). Base sizes are not printed in the PDF.
They come from the Wahapedia aos4 warscroll pages, fetched the same day with plain curl
(`https://wahapedia.ru/aos4/factions/daughters-of-khaine/<Unit>`).

**Which army.** Games Workshop lists **two** separate Daughters of Khaine Spearhead PDFs:
- **Heartflayer Troupe**: Melusai Ironscale, 2×5 Witch Aelves, 5 Doomfire Warlocks, 5 Blood Stalkers. These are the contents of
  the **Spearhead: Daughters of Khaine** box, and this PDF was reissued on 2026-10-28.
- **Khainite Shadow Coven** (2026-03-25, `eng_25-03_aos_spearhead_daughters_of_khaine_khainite_shadow_coven-kcxewlylck-jc3xxv1v2v.pdf`,
  4 pages, published with the battletome supplement): Slaughter Queen on Cauldron of Blood, Hag Queen, Bloodwrack Medusa,
  9 Khainite Shadowstalkers, 2×5 Sisters of Slaughter. It is built from separate kits, not from the Spearhead box.

RULING: this spec builds **Heartflayer Troupe**. The Shadow Coven is out of scope. Its rules are recorded in Appendix A so it can
be added later. Its PDF was read from scratch space and is not stored in `docs/sources/`.

Mechanics and numbers are ported 1:1; all wording below is our own.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of an
enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run = `advance`,
Retreat = `fallBack`. Rend is stored as `rend` (data) / `AP` (Rend +1 = `modifyStat AP −1`). Ward = `feelNoPain`. "Combat attacks"
= melee attacks. Rule IDs `DOK-*` double as test IDs (§9).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `daughters.unit.melusai-ironscale` | Melusai Ironscale | 1 | **General** | no | 40 round (Wahapedia) |
| `daughters.unit.witch-aelves` (a) | Witch Aelves | 5 | Unit | **yes** | 25 round (Wahapedia) |
| `daughters.unit.witch-aelves` (b) | Witch Aelves | 5 | Unit | **yes** | 25 round |
| `daughters.unit.doomfire-warlocks` | Doomfire Warlocks | 5 | Unit | no | 60×35 oval (Wahapedia) |
| `daughters.unit.blood-stalkers` | Blood Stalkers | 5 | Unit | no | 40 round (Wahapedia) |

Total: 5 units, 21 models. The two Witch Aelves units share one warscroll and one datasheet (two patrol entries, `ref`
`witch-aelves-1` / `witch-aelves-2`). The Melusai Ironscale is the only Hero. **No Wizard and no Priest**: the Doomfire Warlocks
make a casting roll without the Wizard keyword (RULING §6). Nothing has **Fly**. **Every warscroll prints Ward (6+).**
Wahapedia lists Blood Stalkers and Doomfire Warlocks as reinforceable in matched play. Spearhead follows the printed keyword, so
only the Witch Aelves have Reinforcements.

---

## 2. Battle trait

### DOK-BT-1 `daughters.ability.blood-rites` — Blood Rites
- **Timing:** Passive. At the start of each battle round, every friendly unit gains the rite for that round number and keeps all
  earlier rites, so the bonuses add up. A unit set up later (a replacement from Call for Reinforcements) has the army's current rites.
- **Rites:**

| Round | ID | Rite | Effect (for the unit) |
|---|---|---|---|
| 1 | DOK-BT-2 | Quickening Bloodlust | +1 to **run** rolls. |
| 2 | DOK-BT-3 | Headlong Fury | +1 to **charge** rolls. |
| 3 | DOK-BT-4 | Zealot's Rage | +1 to **hit** rolls for **combat** (melee) attacks. |
| 4 | DOK-BT-5 | Slaughterer's Strength | +1 to **wound** rolls for **combat** (melee) attacks. |

- The army's **rite level** = the highest rite held: `max(battle round, epiphany round + 1)` (see DOK-RA-1), capped at 4.
- Notes: the CORE-2.5 ±1 cap on hit and wound rolls applies. Companion weapons (Dark Steed's Vicious Bite) do not take friendly
  positive modifiers (engine reading of CORE-12.4, same as the Sylvaneth spec §8.7), so Zealot's Rage and Slaughterer's Strength
  do not reach the bite. Shooting attacks never gain rites 3–4.

---

## 3. Regiment abilities (pick 1 at army selection)

### DOK-RA-1 `daughters.ability.murderous-epiphany` — Murderous Epiphany
- **Timing:** **Once per battle**, your hero phase.
- **Effect:** Every friendly unit gains, right now, the rite it would gain at the start of the **next** battle round. It keeps that
  rite for the rest of the battle and does not gain it a second time at the next round start.
- Notes: nothing to gain in battle round 4 (there is no fifth rite), so it is not offered then. Used in round *r*, the rite level
  becomes *r*+1 for the rest of round *r*. From round *r*+1 it matches the round number again.

### DOK-RA-2 `daughters.ability.blessing-of-khaine` — Blessing of Khaine
- **Timing:** **Once per turn (army)**, any combat phase.
- **Declare:** Pick a friendly unit **wholly within 12"** of your general. **Not the general itself.**
- **Effect:** **+1 to ward rolls** for that unit for the rest of this phase (Ward 6+ becomes 5+ in effect; every unit here has Ward 6+).
- Notes: needs the general on the battlefield. Usable in both players' combat phases, once in each turn.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `daughters.enh.bathed-in-blood` | Bathed in Blood | Passive | Each time the general slays an enemy model (any attack or ability of the general), **Heal (1)** the general. |
| `daughters.enh.fuelled-by-revenge` | Fuelled by Revenge | Passive | **+1 Rend** for the **melee** weapons of friendly **Blood Stalkers** units while they are **wholly within 12"** of the general. |
| `daughters.enh.flask-of-shademist` | Flask of Shademist | **Once per battle**, any combat phase | Until the end of the phase, **−1 to hit** for attacks that target friendly units **while** they are wholly within 12" of the general. This is checked at each attack, and the general's own unit counts. |
| `daughters.enh.zealous-orator` | Zealous Orator | Your hero phase (no printed limit; CORE-3.4 once per phase) | Declare: a friendly unit **wholly within 9"** of the general that is **not in combat**. Roll a D6 for each slain model of that unit. For each **5+**, return 1 slain model to it. |

- [interp] Bathed in Blood counts every enemy model whose slaying is credited to the general's unit: Keldrisaíth (ranged and melee)
  and Turned to Crystal mortal damage. Each slain model heals 1 when it is removed, and the heal is capped at full Health.
- [interp] Zealous Orator may pick the general (the card does not exclude it), but a 1-model unit on the battlefield has no slain models.

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Printed keywords only (Spearhead warscrolls print no faction keywords). Stat
blocks were checked against the rendered pages. Every unit has Ward (6+), printed among its keywords.

### 5.1 `daughters.unit.melusai-ironscale` — Melusai Ironscale (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 6 | 5+ | 2 | 6+ |

Keywords: **Hero, Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Keldrisaíth (`daughters.weapon.keldrisaith-ranged`) | Ranged | 12" | 2 | 3+ | 3+ | 1 | D3 | — |
| Keldrisaíth (`daughters.weapon.keldrisaith`) | Melee | — | 6 | 3+ | 4+ | 1 | 2 | — |

The ranged Keldrisaíth has no Shoot in Combat.

**DOK-AB-1 `daughters.ability.all-out-slaughter` — All-Out Slaughter**
- **Timing:** Your hero phase (once per phase for this unit, CORE-3.4).
- **Declare:** Pick a friendly unit **wholly within 12"** of this unit. **Not this unit.**
- **Effect:** **+1 Attacks** to the target's **melee** weapons for the rest of the turn. Companion weapons are not affected
  (CORE-12.4 engine reading, §2).

**DOK-AB-2 `daughters.ability.turned-to-crystal` — Turned to Crystal**
- **Timing:** End of any turn (once per turn for this unit).
- **Declare:** Pick an enemy unit **within 1"** of this unit (closest models), then roll a D6.
- **Effect:** On **2+**, the target suffers **1 mortal damage**.

### 5.2 `daughters.unit.witch-aelves` — Witch Aelves (×2 units)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 1 | 6+ | 1 | 6+ |

Keywords: **Infantry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Paired Sciansá (`daughters.weapon.paired-sciansa`) | Melee | — | 3 | 3+ | 4+ | — | 1 | Crit (Auto-wound) |

Loadout: all 5 models carry Paired Sciansá. No champion, standard or musician rules.

**DOK-AB-5 `daughters.ability.frenzied-fervour` — Frenzied Fervour**
- **Timing:** Passive.
- **Effect:** **+1 Rend** to this unit's melee weapons if it **charged this turn**.

### 5.3 `daughters.unit.doomfire-warlocks` — Doomfire Warlocks
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 14" | 3 | 5+ | 1 | 6+ |

Keywords: **Cavalry** (no Wizard keyword)

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Doomfire Crossbow (`daughters.weapon.doomfire-crossbow`) | Ranged | 10" | 2 | 3+ | 4+ | — | 1 | — |
| Cursed Scimitar (`daughters.weapon.cursed-scimitar`) | Melee | — | 2 | 3+ | 4+ | 1 | 1 | — |
| Dark Steed's Vicious Bite (`daughters.weapon.dark-steeds-vicious-bite`) | Melee | — | 2 | 5+ | 3+ | — | 1 | Companion |

Loadout: all 5 models carry all three weapons. The crossbow has no Shoot in Combat.

**DOK-AB-4 `daughters.ability.doomfire` — Doomfire** (casting value 6, see RULING §6)
- **Timing:** Your hero phase.
- **Declare:** Pick a **visible enemy unit within 12"** of this unit, then make a casting roll of 2D6.
- **Effect:** On **6+** (and not unbound), the target suffers **D3 mortal damage**.

### 5.4 `daughters.unit.blood-stalkers` — Blood Stalkers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 2 | 5+ | 1 | 6+ |

Keywords: **Infantry** (data adds the name keyword `BLOOD STALKERS`, see §7)

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Heartseeker Bow (`daughters.weapon.heartseeker-bow`) | Ranged | 18" | 3 | 3+ | 4+ | 1 | 1 | Crit (Auto-wound) |
| Scianlar (`daughters.weapon.scianlar`) | Melee | — | 2 | 3+ | 4+ | — | 1 | — |

Loadout: all 5 models carry both. The bow has no Shoot in Combat.

**DOK-AB-3 `daughters.ability.heartseekers` — Heartseekers**
- **Timing:** Passive.
- **Effect:** This unit's **shooting** attacks score critical hits on an **unmodified 5+** (instead of 6) if it has **not used a
  Move ability this turn**. Normal Move, Run, Retreat and Charge all have the Move keyword (core rules), so any of them turns it off.
  Combined with the bow's Crit (Auto-wound), a 5 or 6 auto-wounds.

---

## 6. Spells and prayers

No Wizard, no Priest, no lore, no manifestations. The army never unbinds.

**Doomfire** (DOK-AB-4) is the only casting roll. RULING: it is treated as a **Spell** with casting value 6, the same reading as
Skaven Wither (SKV-AB-2) and Soulblight Spirit Gale (a casting roll only exists for spells, core Magic 2.0):
- an enemy Wizard within 30" may try to unbind it;
- a double 1 miscasts: D3 mortal damage to the Warlocks, and no further Doomfire that phase;
- the Warlocks may attempt it **once per hero phase** (they have a casting level of 1);
- they are **not Wizards**. They cannot unbind, and rules that name Wizards (Places of Power, cards) ignore them.
  The PDF deliberately prints no Wizard keyword.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/daughters/*.json`), at most reusing an existing code hook; (b) = new faction
code hook in `src/engine/factions/daughters.ts`, exported as `daughtersHooks` and spread into `code-hooks.ts` after
`...sylvanethHooks`. Shared helpers from `aos-common.ts`: `onBoard`, `whollyWithinUnit`, `unitGap`, `inCombat`, `inflictMortal`,
`healUnit`, `announce`, `paramOf`, `returnSlainModels`, `returnableModels`. (c) = engine change outside the faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, Ward 6+ on all | (a) | Datasheets as the other armies, `stats.ward: 6` on all four. `HERO`, `INFANTRY`, `CAVALRY`, `REINFORCEMENTS`. Bases `{ shape: 'round', mm: 40 / 25 / 40 }`, Warlocks `{ shape: 'oval', mm: 60, mm2: 35 }` (mm along the facing). |
| Witch Aelves ×2, Reinforcements | (a) | One datasheet, two patrol entries (`size: 5`). Core `spearheadCallForReinforcements`; nothing else can be replaced. |
| Name keyword `BLOOD STALKERS` | (a) | Add `"BLOOD STALKERS"` to the Blood Stalkers datasheet `keywords` so Fuelled by Revenge can find it (Clanrats precedent). Players never see it and it changes no other rule. |
| Weapons | (a) | `CRIT_AUTO_WOUND` (Paired Sciansá, Heartseeker Bow), `COMPANION` (Vicious Bite). Two Keldrisaíth weapon ids (ranged / melee), each named "Keldrisaíth". |
| DOK-AB-5 Frenzied Fervour | (a) | Passive, scope self, `effect { when: { unitCharged: true, weaponType: 'melee' }, modifyStat: { stat: 'AP', value: -1 } }` (Nighthaunt / Fyreslayers pattern). |
| DOK-ENH Fuelled by Revenge | (a) | Passive enhancement, `scope { who: 'friendly', within: 12, wholly: true, keyword: 'BLOOD STALKERS' }`, `effect { when: { weaponType: 'melee' }, modifyStat: { stat: 'AP', value: -1 } }`. `hooks-impl.ts scopeMatches` already applies `scope.keyword` and `wholly`. |
| DOK-AB-3 Heartseekers | (a) + (b) gate `daughtersHeartseekers` | Passive descriptor, scope self, `effect { when: { weaponType: 'ranged' }, lethalOn: 5 }`. `lethalOn` → `{ kind: 'roll', critThreshold }` at `onHitRoll` (`hooks-impl.ts`), which `attack.ts runStage` folds as a min. The gate is a copy of `kruleboyzPickEmOff`: false when `turn.moveType` is `normal` / `advance` / `fallBack` or `turn.chargedThisTurn`. approximation: out-of-phase slides (`aos-moves.ts applySlide`, e.g. from a card) set no turn flag. Nothing in this army moves the Blood Stalkers that way. |
| DOK-BT-1..5 Blood Rites | (b) `daughtersBloodRites` | One passive battle-trait descriptor, scope self, four effects: `modifyRoll advance +1`, `modifyRoll charge +1`, `{ when: { weaponType: 'melee' }, modifyRoll hit +1 }`, `{ when: { weaponType: 'melee' }, modifyRoll wound +1 }`; `params { advance: 1, charge: 2, hit: 3, wound: 4 }`. The `gate` is a copy of `sylvanethSongOfTheHunt` (`songQuery` reads the roll kind and rolling unit from the hook data). It returns true when the roller is the holder and `bloodRiteLevel(state, holder.player) >= params[kind]`. Export `bloodRiteLevel(state, player) = min(4, max(state.round, epi + 1))`, where `epi` = `mission.custom.dokEpiphany[player]` (absent → 0). `resourceReadout`: `{ id: 'daughters.rites', label: 'Blood Rites', value: level, max: 4, help: names of the rites held }`. |
| DOK-RA-1 Murderous Epiphany | (b) `daughtersMurderousEpiphany` | Regiment ability, activated, `timing phase command / your`, `limit oncePerBattle`, no declare. `canUse` = `state.round <= 3`. Resolve: `mission.custom.dokEpiphany[player] = state.round`; announce the new rite. `bloodRiteLevel` then reads it, and the rite stays because `max` never drops. |
| DOK-RA-2 Blessing of Khaine | (b) `daughtersBlessingOfKhaine` | Regiment ability, `timing phase fight / any`, `limit oncePerTurnArmy`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { range: 12, grant: [{ modifyRoll: { roll: 'feelNoPain', value: 1 } }] }`, `duration untilEndOfPhase`. Targets = friendly board units other than the general's, with `whollyWithinUnit(t, general, 12)`. Resolve = the Stormcast `grantHook` body. `attack.ts wardThreshold` already sums `onFeelNoPainRoll` modifiers (defender side, `naturalSide`), and `cardWard` clamps them to ±1. It is offered in the combat windows (start of the combat phase, and between activations). |
| DOK-ENH Bathed in Blood | (b) `daughtersBathedInBlood` | Passive enhancement with `onEnemyModelSlain(ctx, entry, { slainUnitId, model, by })` (F14, fired for sources held by `by.unitId`): `healUnit(ctx, entry.holderUnitId, 1, abilityId)`. `inflictMortal` credits `use.unitId`, so Turned to Crystal kills count. |
| DOK-ENH Flask of Shademist | (b) `daughtersFlaskOfShademist` | Enhancement, `timing phase fight / any`, `limit oncePerBattle`, no declare. Resolve: for every friendly unit on the board, `effects.grant(ctx, u, { modifyRoll: { roll: 'hit', value: -1 } }, { scope: { who: 'attacker' }, duration: 'untilEndOfPhase', sourceAbilityId })` (Scare Taktikz flip). `gateActive(state, entry)` returns true only while the general is on the board and `whollyWithinUnit(state, entry.holderUnitId, general, 12)` (general's unit: always). So units that pile in or out of the 12" gain or lose it per attack. Units arriving later in the phase are not covered (none can arrive in a combat phase). |
| DOK-ENH Zealous Orator | (b) `daughtersZealousOrator` | Enhancement, `timing phase command / your`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { range: 9, succeedOn: 5 }`. Targets = friendly board units `whollyWithinUnit(t, general, 9)`, `!inCombat`, `returnableModels > 0`. Resolve: roll `returnableModels(t)` D6 (`ctx.roll`, purpose `'ability'`), `n` = count ≥ 5, then `returnSlainModels(ctx, t, n, abilityId)`. |
| DOK-AB-1 All-Out Slaughter | (b) `daughtersAllOutSlaughter` | `timing phase command / your`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { range: 12, grant: [{ when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } }] }`, `duration untilEndOfTurn`. Targets = friendly board units ≠ self with `whollyWithinUnit(t, self, 12)`. The resolve body is the same as Blessing of Khaine (one shared `grantTo(name, targetsFn)` helper in `daughters.ts`). |
| DOK-AB-2 Turned to Crystal | (b) `daughtersTurnedToCrystal` | `timing endOfTurn / any`, `limit oncePerTurn`, `declare [{ role: 'unit', owner: 'enemy' }]`, `roll { dice: 'D6', succeedOn: 2 }`. Targets = enemy board units with `unitGap(self, t) <= 1`. abilities.ts rolls the declared D6 and calls resolve only on success: `inflictMortal(ctx, use, target, 1)`. |
| DOK-AB-4 Doomfire | (b) `daughtersDoomfire` + (c) C1 | Activated, `timing phase command / your`, `keywords ['SPELL']`, `castingValue 6`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params { range: 12, damage: 'D3' }`. Targets = visible enemy units within 12" (`unitGap`, `losService.unitVisible`). abilities.ts routes a `castingValue` descriptor through `magic.castingRoll` (as for Wither). Resolve: `inflictMortal(ctx, use, target, rollExpr('D3'))`. Datasheet `castingLevel: 1` (C1), no `wizard`. |

**Engine change (c):**
- **C1 casting without being a Wizard** (`src/data/types.ts` `DatasheetData + castingLevel?: number`, `datasheet.schema.json`,
  `src/engine/magic.ts`): new `export function castingLevel(state: GameState, unitId: UnitId): number` =
  `Math.max(wizardLevel(state, unitId), datasheet.castingLevel ?? 0)`. `canCast` compares the phase's cast count against
  `castingLevel` instead of `wizardLevel`. The unbind candidate filter (`wizardLevel(...) > unbinds`) and every other Wizard test
  keep `wizardLevel`, so a `castingLevel`-only unit casts but never unbinds and is never a Wizard. A miscast's D3 mortal already
  goes to the casting unit. The change is additive: no existing datasheet sets the field. No frozen contract file changes. Add a
  line to `docs/spec/13-engine-port-plan.md` when it lands.

---

## 8. Engine notes

1. **Rite timing:** `bloodRiteLevel` reads `state.round` at the moment of the roll, so "start of the battle round" needs no
   round-start hook. During deployment and before round 1 nothing applies (`round` 0). Effects are read per roll, so a unit
   that was set up later is covered.
2. **Epiphany in round 1** gives Headlong Fury (+1 charge) in round 1. In round 2 it gives Zealot's Rage (+1 hit, melee), and in
   round 3 Slaughterer's Strength (+1 wound, melee). The engine stores only the round in which it was used.
3. **Blessing of Khaine vs. the cap:** ward modifiers clamp to ±1 (`cardWard`), so a card that also adds +1 to ward rolls does not stack past +1.
4. **Flask of Shademist** stacks with cover and other −1s only up to the CORE-2.5 −1 cap on hit rolls.
5. **AI:** Murderous Epiphany is used in the first hero phase (round ≤ 3) where a friendly unit is in combat or within 12" of an
   enemy, preferring round 2 (+1 hit) when both apply. Blessing of Khaine goes to the friendly unit in combat with the highest
   enemy melee damage estimate against it. All-Out Slaughter goes to a Witch Aelves unit in combat or within charge reach (most
   models), else the Warlocks. Doomfire targets the enemy with the fewest wounds left within range (a kill), else the Hero.
   Turned to Crystal is always used. Flask of Shademist is used in the first combat phase where ≥ 2 friendly units within 12" of
   the general are in combat. Zealous Orator targets the out-of-combat unit with the most slain models. Heartseekers: the AI's
   movement planner keeps Blood Stalkers still when they already have a target in range (expected damage ×1.33 vs moving).
6. **Ward sources:** printed 6+ everywhere; Blessing of Khaine +1 modifier (one unit, one phase). Nothing sets a better threshold.
7. **Defaults for the sim:** regiment Blessing of Khaine (default) then Murderous Epiphany; enhancement Fuelled by Revenge (default,
   pure data), then Bathed in Blood, Flask of Shademist, Zealous Orator.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| DOK-ARMY-1 | Heartflayer Troupe builds: Melusai Ironscale general + 2×5 Witch Aelves + 5 Doomfire Warlocks + 5 Blood Stalkers, 21 models, stats as §5. |
| DOK-ARMY-2 | Every unit has Ward 6+; the Warlocks are Cavalry on 60×35 ovals; the Ironscale has both Keldrisaíth profiles. |
| DOK-ARMY-3 | Reinforcements only on the two Witch Aelves units; the Ironscale, Warlocks and Blood Stalkers are never offered for replacement. |
| DOK-BT-1 | Blood Rites are cumulative by battle round: round 3 has run +1, charge +1 and melee hit +1, but not wound +1. |
| DOK-BT-2 | Quickening Bloodlust: +1 to run rolls from round 1. |
| DOK-BT-3 | Headlong Fury: +1 to charge rolls from round 2, not in round 1 (without the Epiphany). |
| DOK-BT-4 | Zealot's Rage: +1 to hit for melee attacks only from round 3; shooting attacks and the Companion bite do not gain it. |
| DOK-BT-5 | Slaughterer's Strength: +1 to wound for melee attacks only in round 4. |
| DOK-RA-1 | Murderous Epiphany: once per battle in your hero phase grants next round's rite now, keeps it, no double gain next round; not offered in round 4. |
| DOK-RA-2 | Blessing of Khaine: +1 ward for a unit wholly within 12" of the general (never the general) this phase; once per turn for the army; usable in the enemy combat phase. |
| DOK-ENH-1 | Bathed in Blood: each enemy model slain by the general (attack or Turned to Crystal) heals the general 1, never above full Health. |
| DOK-ENH-2 | Fuelled by Revenge: Blood Stalkers melee Rend +1 only while wholly within 12" of the general; the bow is unchanged. |
| DOK-ENH-3 | Flask of Shademist: −1 to hit against friendly units wholly within 12" of the general for that phase only; units outside 12" unaffected; once per battle. |
| DOK-ENH-4 | Zealous Orator: one D6 per slain model, each 5+ returns one; unit must be wholly within 9" and not in combat. |
| DOK-AB-1 | All-Out Slaughter: +1 Attacks to a friendly unit's melee weapons (not Companion) for the turn; cannot target the Ironscale. |
| DOK-AB-2 | Turned to Crystal: end of any turn, an enemy within 1" takes 1 mortal on 2+; nothing on a 1; once per turn. |
| DOK-AB-3 | Heartseekers: bow crits (and auto-wounds) on 5+ if the unit used no Move ability this turn; 6 only after a move, run, retreat or charge. |
| DOK-AB-4 | Doomfire: casting 6+ deals D3 mortal to a visible enemy within 12"; can be unbound; a double 1 miscasts on the Warlocks. |
| DOK-AB-5 | Frenzied Fervour: Witch Aelves melee Rend +1 only in a turn they charged. |
| DOK-WEAP-1 | Paired Sciansá and Heartseeker Bow crits auto-wound; the Vicious Bite is a Companion weapon; no ranged weapon shoots in combat. |
| DOK-MAG-1 | The Doomfire Warlocks cast at most once per hero phase and never attempt to unbind an enemy spell (C1 `castingLevel`). |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own temple livery): deep crimson and oxblood cloth, glossy black leather, warm bronze trim and
blades, pale porcelain skin with dark-teal warpaint stripes, long silver-white hair, emerald-teal serpent scales on the Melusai,
and blood-red as the accent. The shared motif is an original three-drop teardrop sigil, painted on cloth and shields. No GW logos,
no copied Khaine rune or temple icons. All figures are **true MGSD** chibis (~2.5 heads tall, huge head, stubby legs, big hands);
the steeds and serpent tails are chunky, toy-like SD shapes, and flames and effects are solid, not see-through.

| Slug | Unit | Models needed | Base (mm) | Mount | Concept prompt |
|---|---|---|---|---|---|
| `dok-melusai-ironscale` | Melusai Ironscale | 1 | 40 round | No (serpent body) | A true MGSD chibi serpent-woman champion, 2.5 heads tall with an enormous head, fierce eyes and a tall swept silver-white ponytail under a bronze crested circlet, a stubby human torso in crimson and black leather on a short, thick, coiled emerald snake tail, holding a long bronze glaive-staff with a curved blade at each end. |
| `dok-witch-aelf` | Witch Aelves | 1 (×10) | 25 round | No | A true MGSD chibi aelf zealot, 2.5 heads tall with a huge head, wild silver-white hair in a high ponytail, teal warpaint stripes and a fierce grin, stubby legs in black boots, a crimson wrap and harness, holding two short curved bronze knives mid-twirl. |
| `dok-doomfire-warlock` | Doomfire Warlocks | 1 (×5) | 60×35 oval | Yes: dark steed | A chunky toy-like MGSD chibi black horse with a big round head, short thick legs and a crimson saddle cloth, ridden by a tiny MGSD chibi hooded aelf sorcerer, huge head with a glowing violet rune on his brow, a stubby crossbow on his back and a curved bronze scimitar wreathed in solid black-and-violet flame. |
| `dok-blood-stalker` | Blood Stalkers | 1 (×5) | 40 round | No (serpent body) | A true MGSD chibi serpent-woman archer, 2.5 heads tall with a huge head, silver-white braids and a slim bronze half-mask, a stubby torso in crimson leather on a short coiled teal-scaled snake tail, drawing a big dark-wood recurve bow with a solid glowing red arrow nocked. |

The two Witch Aelves units share one figure: the Spearhead gives no champion, standard or musician rules, so no variants are
needed. The Blood Stalkers look alike in the rules too, so one figure covers all five (the kit's second pose is not needed).
The Shadow Coven figures (Appendix A) are listed there.

---

## 11. Implementation notes

Built (F16). Data: `src/data/factions/daughters/` (faction.json, datasheets/{melusai-ironscale, witch-aelves, doomfire-warlocks,
blood-stalkers}.json, weapons.json, abilities.json, enhancements.json, patrols/heartflayer-troupe.json with
`battleTraits: ['daughters.ability.blood-rites']`, `warlord: 'melusai-ironscale'`). Hooks: `src/engine/factions/daughters.ts`
(`...daughtersHooks` in `code-hooks.ts`; AI hints `daughtersAbilityTiming` / `daughtersTargetBonus` wired into `src/ai/utility.ts` by the
`daughters` code prefix). Tests: `tests/engine/daughters.test.ts`, `tests/data/daughters.test.ts`, one per DOK- id. Figure mapping keys
`<datasheet id>/<modelId>`.

Notes from the build:
- The Doomfire Warlocks datasheet carries `castingLevel: 1` at the top level (next to `stats`), not inside `stats`.
- Murderous Epiphany stores the battle round it was used in (`mission.custom.dokEpiphany[player]`); `bloodRiteLevel` is
  `min(4, max(round, usedRound + 1))`, and 0 before round 1 whatever the ledger says.
- Flask of Shademist grants its -1 to every friendly unit on the board when it is used; `gateActive` switches it off per attack for a
  unit outside 12" of the general, so a unit that moves in or out of range gains or loses it within the phase.
- A mortal-damage kill by Turned to Crystal heals Bathed in Blood because `onEnemyModelSlain` hears every slain model credited to the
  general's unit.
- approximation: the AI's movement planner does not hold the Blood Stalkers still for Heartseekers (§8 item 5); it only uses the ability
  hints. Blood Stalkers that did not move still crit on 5+ whenever they happen to stand still.
- Client wiring (crest, start screen, figures, audio, `weaponFlavour.ts` vfx keywords for Keldrisaith / Heartseeker Bow) is not part of
  this file's stage.

---

## Appendix A — Khainite Shadow Coven (separate PDF, 2026-03-25; out of scope)

Army id if ever built: `daughters.army.khainite-shadow-coven`. General: **Slaughter Queen on Cauldron of Blood**. Units: 1 Hag
Queen, 1 Bloodwrack Medusa, 9 Khainite Shadowstalkers, 2×5 Sisters of Slaughter. 18 models. One Wizard (the Medusa); two Priests
(the Slaughter Queen and the Hag Queen). All warscrolls print Ward (6+) as a corner badge.

**Battle trait.** `KSC-BT-1` Shadowmasked — once per turn, any charge phase: pick a friendly Infantry unit that is in combat and did
not charge this turn. For the rest of the turn, combat attacks that target it get −1 to hit and −1 to wound.

**Regiment abilities.** `KSC-RA-1` Bleed Them Pale — once per battle, any combat phase: pick a friendly Infantry unit in combat that
did not charge this turn; it may move 6" but may not end in combat. `KSC-RA-2` Murderous Strike — passive: +1 Rend to the melee
weapons of friendly Infantry units that charged this turn.

**Enhancements.** Shadow Avatar (once per battle, your combat phase: +1 Rend to the general's melee weapons for the rest of the
turn); Frenzied Exhortations (your hero phase: a visible friendly unit wholly within 12" of the general; D6, on 3+ it gets +1 to
ward rolls for the rest of the turn); Boiling Blood (your shooting phase: a visible enemy unit within 12" of the general; roll a
D6, and if it equals or beats the target's Save characteristic, halve its Move until the start of your next turn); Bladed Impact
(any charge phase: if the general charged this phase, an enemy unit within 1"; roll a D3, on 2+ deal that many mortal damage).

**Warscrolls.**

| Unit | Move | Health | Save | Control | Ward | Keywords | Base (mm, Wahapedia) |
|---|---|---|---|---|---|---|---|
| Slaughter Queen on Cauldron of Blood (General) | 6" | 12 | 4+ | 5 | 6+ | Hero, Priest, War Machine | 120×92 oval |
| Hag Queen | 6" | 5 | 5+ | 2 | 6+ | Hero, Priest, Infantry | 25 round |
| Bloodwrack Medusa | 8" | 6 | 5+ | 2 | 6+ | Hero, Wizard, Infantry | 40 round |
| Sisters of Slaughter (×2) | 6" | 1 | 6+ | 1 | 6+ | Infantry, Reinforcements | 25 round |
| Khainite Shadowstalkers (9) | 6" | 1 | 5+ | 1 | 6+ | Infantry | 28.5 round (40 for a leader model; the Spearhead gives none) |

| Weapon | Unit | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|---|
| Shrine Guardians' Blades | Slaughter Queen | Melee | — | 9 | 3+ | 4+ | 1 | 2 | — |
| Blade of Khaine | Hag Queen | Melee | — | 5 | 3+ | 4+ | 1 | 2 | — |
| Bloodwrack Spear | Medusa | Melee | — | 5 | 3+ | 4+ | 1 | 2 | — |
| Kruiplash | Sisters of Slaughter | Melee | — | 3 | 3+ | 4+ | — | 1 | — |
| Cursed Bolts and Missiles | Shadowstalkers | Ranged | 10" | 2 | 3+ | 4+ | 1 | 1 | — |
| Blades of Murder | Shadowstalkers | Melee | — | 2 | 3+ | 4+ | 1 | 1 | — |

**Abilities.** Consecrated Revulsion (Slaughter Queen, your hero phase: a visible friendly Infantry unit wholly within 12"; D6, on
3+ it gets +1 to save rolls until the start of your next turn). Bloody Incitement (Hag Queen, any combat phase: a visible friendly
unit wholly within 12"; if the Hag Queen is in combat, that unit's melee weapons gain Crit (Auto-wound) for the rest of the turn;
otherwise this happens only on a D6 roll of 3+). Exsanguinating Glare (Medusa, your shooting phase: an enemy unit in combat with it,
or, if it is not in combat, a visible enemy within 12"; D6, on 3+ deal 1 mortal damage, and if that slew a model deal 1 more).
Dance of Death (Sisters of Slaughter, once per turn for the army, enemy combat phase: if in combat, move 2D6", may pass through
enemy combat ranges but must end in combat). Shadow Leap (Shadowstalkers, once per battle, your movement phase: remove the unit and
set it up anywhere more than 6" from all enemy units).

**Figures (if built).** `dok-slaughter-queen-cauldron` (1, 120×92 oval, war machine: a chunky toy-like bladed bronze shrine-cart
holding a steaming cauldron of solid red liquid, a big SD statue of a many-armed warrior goddess-figure of our own design behind it,
and a MGSD chibi priestess with a huge head standing at the rim); `dok-hag-queen` (1, 25 round: MGSD chibi priestess with a tall
headdress, a curved knife and a bronze goblet); `dok-bloodwrack-medusa` (1, 40 round: MGSD chibi serpent-sorceress with a huge
head, a crown of small chunky snakes and a long spear); `dok-sister-of-slaughter` (1 ×10, 25 round: MGSD chibi gladiator aelf
with a bronze face-cage helm, a barbed whip and a small round buckler-blade); `dok-shadowstalker` (1 ×9, 28.5 round: MGSD chibi
hooded aelf assassin trailing solid black smoke, with twin daggers).
