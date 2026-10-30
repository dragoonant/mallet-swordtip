# Slaves to Darkness — Darkoath Raiders (Spearhead)

Faction id: `slaves` · Army id: `slaves.army.darkoath-raiders` · Grand alliance: Chaos.
Source: `docs/sources/spearhead-slaves-to-darkness.pdf` (4 pages, gitignored), the free Warhammer Community
download for the **Spearhead: Slaves to Darkness — Darkoath Raiders** box (released 7 Dec 2024), fetched
2026-10-30 from
`https://assets.warhammer-community.com/eng_01-04_aos_spearhead_slaves_to_darkness_darkoath_raiders-mcmbaocpba-1o87y80z16.pdf`.
Mechanics and numbers are ported 1:1; all wording below is our own. (The other Slaves to Darkness Spearhead,
*Bloodwind Legion*, lives in the paid Fire and Jade book and the battletome; it is out of scope here.)

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" =
within combat range of an enemy unit. Timing labels follow the core rules' ability-timing vocabulary.
Rule IDs `STD-*` double as test IDs (§8).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `slaves.unit.darkoath-warqueen` | Darkoath Warqueen | 1 | **General** | no | 32 round (inferred from box contents, not stated in source) |
| `slaves.unit.darkoath-savagers` | Darkoath Savagers | 10 (1 is a **Godspeaker**) | Unit | **no** | 28.5 round (inferred; a few command models may sit on 32) |
| `slaves.unit.darkoath-fellriders` | Darkoath Fellriders | 5 | Unit | yes | 60×35 oval (Wahapedia listing) |
| `slaves.unit.darkoath-marauders` | Darkoath Marauders | 10 | Unit | yes | 28.5 round (inferred) |

Total: 4 units, 26 models. The box ships 4× 32 mm round, 17× 28.5 mm round and 5× 60 mm oval bases; the
per-unit split above is our best reading of that. Savagers do **not** have the Reinforcements keyword.

---

## 2. Battle trait

### STD-BT-1 `slaves.ability.oaths-of-darkness` — Oaths of Darkness
- **Timing:** Once per turn (army), your hero phase.
- **Effect:** You may show 1 battle tactic card from your hand to the opponent. That card is your **oath**
  for the rest of this turn.
  1. While it is your oath you can still use its command, or try to score its battle tactic, normally.
  2. If you **score** the oath's battle tactic this turn, the oath is **fulfilled**: the card is not
     discarded but set to one side, where its command stays usable (in any later phase/turn the command
     itself allows). When that command is used, the card is discarded as normal.
  3. Fulfilled cards set aside do **not** count against the 3-card battle-tactic hand limit.
  4. If you use the oath's command **before** scoring it, the card is discarded as normal (oath ends,
     nothing set aside).
  5. At the end of the turn, an oath still in your hand and not fulfilled simply stops being your oath
     (it stays in hand).
- The scored tactic awards its VP normally; only the card's destination changes.

---

## 3. Regiment abilities (pick 1 at army selection)

### STD-RA-1 `slaves.ability.rage-of-arkhar` — Rage of Arkhar
- **Timing:** Once per turn (army), any combat phase.
- **Declare:** Pick a friendly unit that is in combat.
- **Effect:** Until the end of the turn, +1 Attacks and +1 Rend on the target's melee weapons.
  **Companion** weapons are not affected.

### STD-RA-2 `slaves.ability.fearless-invaders` — Fearless Invaders
- **Timing:** Once per turn (army), your movement phase.
- **Declare:** Pick a friendly unit that is in combat.
- **Effect:** If the target uses a **Retreat** ability this turn, it suffers no mortal damage from the
  retreat, and it may still use **Charge** abilities later this turn.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| STD-ENH-1 `slaves.enh.bloodthirsty-blade` | Bloodthirsty Blade | Passive | The general's **Rune-etched Axe** has Rend 2 (printed 1). |
| STD-ENH-2 `slaves.enh.godshadow-talisman` | Godshadow Talisman | Passive | The general has **Ward (4+)** (better than her printed 5+; use the best). |
| STD-ENH-3 `slaves.enh.champion-of-raids` | Champion of Raids | Your charge phase | Declare: pick **another** friendly unit wholly within 12" of the general. Effect: the target may re-roll its charge rolls for the rest of the turn. |
| STD-ENH-4 `slaves.enh.fell-ritualist` | Fell Ritualist | Passive | Whenever you draw battle tactic cards while the general is on the battlefield, you may draw 1 extra card, then put 1 card from your hand on the **bottom** of your battle tactic deck. |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Printed keywords only. **No unit has a ranged weapon**
(the Fellriders' javelins are flavour only in this Spearhead).

### 5.1 `slaves.unit.darkoath-warqueen` — Darkoath Warqueen
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 5 | 5+ | 2 | 5+ |

Keywords: **Hero, Infantry, Ward (5+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Rune-etched Axe (`slaves.weapon.rune-etched-axe`) | Melee | — | 5 | 4+ | 3+ | 1 | 2 | Crit (Mortal) |

**STD-AB-1 `slaves.ability.oath-of-supremacy` — Oath of Supremacy**
- **Timing:** Your hero phase.
- **Declare:** Pick a friendly unit wholly within 12" of your general (the Warqueen may pick herself; the
  text does not say "another").
- **Effect:** +1 to hit rolls for the target's attacks until the start of your next turn.

### 5.2 `slaves.unit.darkoath-savagers` — Darkoath Savagers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 1 | 5+ | 1 | — |

Keywords: **Infantry**. Unit composition: 1 of the 10 models is a **Godspeaker** (no separate profile).

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Darkoath Weapons (`slaves.weapon.darkoath-weapons`) | Melee | — | 2 | 4+ | 3+ | — | 1 | Crit (Mortal) |

**STD-AB-2 `slaves.ability.visions-of-glory` — Visions of Glory**
- **Timing:** Your hero phase.
- **Condition:** Only if the unit still has its Godspeaker.
- **Effect:** Roll 8 dice. For each 4+, gain 1 re-roll for this unit that lasts until the start of your
  next turn. Each re-roll can be spent on one **hit**, **wound**, **run** or **save** roll made for this
  unit (one die/roll per re-roll).

### 5.3 `slaves.unit.darkoath-fellriders` — Darkoath Fellriders
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 3 | 5+ | 1 | — |

Keywords: **Cavalry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Fellrider Blades (`slaves.weapon.fellrider-blades`) | Melee | — | 2 | 4+ | 3+ | — | 1 | Charge (+1 Damage) |
| Warsteed's Hooves (`slaves.weapon.warsteeds-hooves`) | Melee | — | 2 | 5+ | 3+ | — | 1 | Companion |

**STD-AB-3 `slaves.ability.swift-attackers` — Swift Attackers**
- **Timing:** Passive.
- **Effect:** −1 to hit rolls for shooting attacks that target this unit.

### 5.4 `slaves.unit.darkoath-marauders` — Darkoath Marauders
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 1 | 5+ | 1 | — |

Keywords: **Infantry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Raider Weapons (`slaves.weapon.raider-weapons`) | Melee | — | 2 | 4+ | 3+ | — | 1 | — |

**STD-AB-4 `slaves.ability.glorious-death` — Glorious Death**
- **Timing:** Passive.
- **Effect:** Each time a model in this unit is slain by a combat (melee) attack while it was in combat with
  the attacking unit, roll a D6. On 5+, the attacking unit suffers 1 mortal damage, applied **after** that
  Fight ability has fully resolved.

---

## 6. Spells and prayers

None. No Wizard or Priest keyword; the Godspeaker's Visions of Glory is a normal ability, not a prayer.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/<id>/*.json`) with at most a bare-name hook;
(b) = new faction code hook in `src/engine/factions/slaves.ts`; (c) = needs an engine change outside the
faction file.

| Rule | Class | How |
|---|---|---|
| Stats, Ward (5+) on Warqueen | (a) | Datasheet `Stats.ward: 5`; keywords HERO/INFANTRY/CAVALRY/REINFORCEMENTS as Cities/Ironjawz. |
| Crit (Mortal), Charge (+1 Damage), Companion | (a) | Weapon abilities `CRIT_MORTAL`, `CHARGE_DAMAGE`, `COMPANION` (already in `attack.ts`). |
| Godspeaker model | (a) | Datasheet model variant `godspeaker` (1 per unit), same weapon; AI wound allocation should remove it last. |
| STD-BT-1 Oaths of Darkness | (b)+(c) | Hook `slavesOathsOfDarkness` (activate: once per turn army, your hero phase, mode = which hand card). Engine (`cards.ts`, `types.ts` `TacticPiles`): add per-player `oath: Id \| null` and `fulfilled: Id[]`; reveal the oath card to the opponent in the hidden-info view; in `scoreTacticsStep` route a scored oath card to `fulfilled` (VP still awarded, still counted in `scored` stats); include `fulfilled` cards in command offers (`offersFor`) and discard on use; exclude `fulfilled` from the 3-card hand limit / draw-up count; using the oath's command before scoring discards it and clears `oath`; clear `oath` at end of turn. |
| STD-RA-1 Rage of Arkhar | (b) | Hook `slavesRageOfArkhar` (like `ironjawzGetStuckIn`): targets = friendly units `inCombat`; grant `[{when:{weaponType:'melee', not:{weaponAbility:'COMPANION'}}, modifyStat:{stat:'A',value:1}}, {same when, modifyStat:{stat:'AP',value:-1}}]`, duration `untilEndOfTurn`. Limit `oncePerTurnArmy`, timing `{phase:'fight', whose:'any'}`. |
| STD-RA-2 Fearless Invaders | (b)+(c) | Hook `slavesFearlessInvaders`: targets = friendly units in combat; grant `{chargeAfterFallBack:true}` + new `{noRetreatDamage:true}` until end of turn. Engine: add `Effect.noRetreatDamage?: true` (`src/data/types.ts`) and make `movement.ts` (line ~298) waive retreat mortal damage when `retreatDamageWaived(...)` **or** the unit has that effect (the card `rally` flag also returns models, so it cannot be reused). Check `charge.ts:68` honours `chargeAfterFallBack` via `eligibilityFor(...,'charge')`. |
| STD-ENH-1 Bloodthirsty Blade | (a) | Effect `{when:{weaponId:'slaves.weapon.rune-etched-axe'}, modifyStat:{stat:'AP',value:-1}}` (as Heirloom Blade); stacks with Rage of Arkhar to Rend 3. |
| STD-ENH-2 Godshadow Talisman | (a) | Effect `{feelNoPain: 4}` scope bearer (as Armour of Gork); best ward wins over printed 5+. |
| STD-ENH-3 Champion of Raids | (b) | Hook `slavesChampionOfRaids`: timing `{phase:'charge', whose:'your'}`, targets = other friendly units wholly within 12" of bearer (`whollyWithinUnit`); grant `{reroll:'all'}` gated to `onChargeRoll` (`hooks:['onChargeRoll']`) until end of turn. Must be offered before any charge is declared. |
| STD-ENH-4 Fell Ritualist | (b)+(c) | Hook `slavesFellRitualist` (passive marker). Engine (`cards.ts` `tacticsStep`): after each draw, if the player holds this enhancement and the general is on the board, offer "draw 1 more?"; if yes draw 1, then a `chooseOption` (topic `bottomTactic`) to put 1 hand card at the bottom of the deck. AI: take it, bottom the lowest `tacticOdds` card. |
| STD-AB-1 Oath of Supremacy | (b) | Hook `slavesOathOfSupremacy`: timing your hero phase; targets = friendly units wholly within 12" of the general (self allowed); grant `{modifyRoll:{roll:'hit',value:1}}` duration `untilNextTurn`. Core ±1 hit cap applies. |
| STD-AB-2 Visions of Glory | (b) | Hook `slavesVisionsOfGlory`: activate (your hero phase, `canUse` needs a live `godspeaker` model) rolls 8D6, stores N = count of 4+ on a unit effect (duration `untilNextTurn`, counter in its params/secondaryState). `producesAt:['onHitRoll','onWoundRoll','onSaveRoll','onAdvanceRoll']`: like `citiesGlimmering`, return `{kind:'roll', reroll:'oneDie'}` for a failing die of this unit and decrement N. Run = `onAdvanceRoll`. |
| STD-AB-3 Swift Attackers | (a) | Effect `{stealth:true}` scope self (`hooks-impl.ts`: stealth = −1 to hit for ranged attacks against the unit). |
| STD-AB-4 Glorious Death | (b)+(c) | Hook `slavesGloriousDeath` on `onModelDestroyed` (`DestroyedHookContext` has `byUnitId`, `kind`): if `kind==='melee'` and the slain model's unit was within 3" of `byUnitId`, roll D6; on 5+ add 1 to a pending-mortal tally keyed by attacker. Engine (`phases/fight.ts`): after a unit's Fight activation fully resolves, drain the tally through `inflictMortal`/the damage sequence (no Glorious Death chain: mortal damage is not a combat attack). Fire even if the Marauders unit is wiped out. |
| Reinforcements (Fellriders, Marauders) | (a) | Core Spearhead (`spearhead-core.ts` Call for Reinforcements). Savagers and Warqueen cannot be replaced. |

---

## 8. Test IDs

- STD-ROSTER-1 — army builds with 4 units / 26 models, Warqueen is general, Reinforcements only on Fellriders and Marauders, Savagers include exactly 1 Godspeaker.
- STD-WS-1 — warscroll stats and weapon profiles load exactly as §5 (incl. Warqueen Ward 5+).
- STD-BT-1 — Oaths of Darkness: oath revealed; scored oath goes to fulfilled pile with VP; its command usable later then discarded; fulfilled cards outside the hand limit; command-before-score discards; unfulfilled oath clears at end of turn; once per turn.
- STD-RA-1 — Rage of Arkhar: +1 A and +1 Rend on melee weapons of a unit in combat, Companion weapons unchanged, expires end of turn, usable in enemy combat phase, once per turn (army).
- STD-RA-2 — Fearless Invaders: target retreats with no mortal damage and may charge the same turn; non-targets still take retreat damage; only units in combat may be targeted.
- STD-ENH-1 — Bloodthirsty Blade: Rune-etched Axe Rend 2 (3 with Rage of Arkhar).
- STD-ENH-2 — Godshadow Talisman: general wards on 4+, not 5+.
- STD-ENH-3 — Champion of Raids: chosen other unit wholly within 12" may re-roll its charge roll this turn; general cannot pick herself; units beyond 12" not offered.
- STD-ENH-4 — Fell Ritualist: extra draw + bottom-of-deck put-back on every draw; skipped when the general is off the board.
- STD-AB-1 — Oath of Supremacy: +1 to hit for the target until the start of your next turn; target must be wholly within 12".
- STD-AB-2 — Visions of Glory: 8 dice, one re-roll per 4+, spendable on hit/wound/run/save rolls of this unit, expire at start of your next turn; unusable once the Godspeaker is slain.
- STD-AB-3 — Swift Attackers: −1 to hit for shooting attacks targeting the Fellriders; melee unaffected.
- STD-AB-4 — Glorious Death: melee-slain model in combat with the attacker → D6, 5+ = 1 mortal on the attacker after the Fight resolves; shooting/mortal kills do not trigger.

---

## 9. Figures

Palette for the army: dark crimson and rust cloth, tarnished bronze and blackened iron, bone and horn,
grey-brown furs, ash-blue warpaint; small carved "oathstone" pebbles on cords as the shared motif. No
eight-pointed stars, no GW sigils — use original jagged scratch-runes instead.

| Slug | Unit | Models needed | Base (mm) | Mount | Concept prompt (TRUE MGSD chibi, ~2.5 heads tall, huge head, stubby legs) |
|---|---|---|---|---|---|
| `darkoath-warqueen` | Darkoath Warqueen | 1 | 32 round | no | A tiny chibi barbarian warrior-queen, ~2.5 heads tall with a huge head under a horned bronze half-helm and wild red braids, stubby legs in fur boots, crimson war-cloak, necklace of carved oathstones, raising an oversized rune-scratched bronze axe. |
| `darkoath-savager` | Darkoath Savagers | 1 (×9) | 28.5 round | no | A chibi tribal berserker ~2.5 heads tall with a giant shaggy-haired head, ash-blue warpaint stripes, bare chest with rust-red sash, stubby legs, a crude iron axe in one fist and a hide buckler in the other. |
| `darkoath-godspeaker` | Darkoath Savagers (Godspeaker) | 1 | 28.5 round | no | A chibi hooded seer ~2.5 heads tall with an oversized head in a bone-and-feather mask, stubby legs under a long tattered crimson robe, clutching a gnarled staff hung with oathstones and glowing ash-blue charms. |
| `darkoath-fellrider` | Darkoath Fellriders | 1 (×5) | 60×35 oval | yes (warsteed) | A chibi horse-raider ~2.5 heads tall with a big helmeted head and tiny legs astride a stocky, big-headed shaggy black steed with bronze-studded barding, waving a curved blade with a quiver of javelins on its back. |
| `darkoath-marauder` | Darkoath Marauders | 1 (×10) | 28.5 round | no | A chibi barbarian footsoldier ~2.5 heads tall with a huge head in a simple iron cap with small horns, grey fur mantle, stubby legs, round wooden shield painted with a crude red scratch-rune, short bronze sword, oathstone pebble on a cord. |

Champion/musician/standard models in the plastic kits are not separate figures here: the Spearhead gives
them no distinct rules, and only the Godspeaker matters to a mechanic (Visions of Glory), so it gets its own
model so players can see whether it is still alive.

---

## 10. As built (engine notes)

Data lives in `src/data/factions/slaves/` (faction, weapons, abilities, enhancements, 4 datasheets, patrol
`slaves.army.darkoath-raiders`); hooks in `src/engine/factions/slaves.ts`, registered in `code-hooks.ts`. Tests:
`tests/data/slaves.test.ts` (STD-ROSTER-1, STD-WS-1) and `tests/engine/slaves.test.ts` (every other id). The
rules above were re-checked against the PDF: no numbers needed fixing. Choices the spec left open:

- **Savagers' models** are listed Savager ×9 then Godspeaker (`champion: true`), so a Godspeaker is removed last when damage
  is allocated by list order. Bases are 28.5 mm for Savagers and Marauders, 32 mm for the Warqueen, 60×35 oval for Fellriders.
- **Companion** (Rage of Arkhar): the engine already returns a Companion weapon as printed, and the effect also carries a
  `not: { weaponAbility: 'COMPANION' }` condition, so the Hooves never gain Attacks or Rend.
- **Oaths of Darkness** modes list the hand best-first by `tacticOdds`; the AI takes the first of equally scored modes, so it
  swears on the card it is likeliest to score. The announcement names the card (it is shown to the opponent).
- **Visions of Glory** keeps a ledger in `mission.custom.visions` keyed by the granted effect's id. A roll with several failing
  dice and enough re-rolls left spends one re-roll per failing die and re-rolls them all; otherwise it re-rolls one die.
  Approximation: failing is judged from the roll's own modifiers, so a later +1 (Oath of Supremacy) can leave a re-roll spent
  on a die that would have passed anyway.
- **Glorious Death** judges "in combat with the attacking unit" once per Fight (first model slain, whole unit still in place,
  mark `glory:<victim>><attacker>` for the phase), so models slain after the near ones are gone still count.
- **Regiment / enhancement defaults:** Rage of Arkhar and Bloodthirsty Blade. The sim's variant games use the last of each
  list (Fearless Invaders, Fell Ritualist).
- **F9 audit (weak armies):** Fearless Invaders was offered only in the end-of-movement window, after every retreat had already
  paid its mortal damage and left combat, so it never did anything. It now carries `params.window: 'moveDeclared'` and is offered
  as a friendly unit in combat declares a Retreat (before the damage roll), for that unit (STD-RA-2 tests). Champion of Raids
  was offered in the charge-phase window, which the engine opens only after every charge is over; it is now offered at the end
  of your movement phase, just before the charge phase (approximation: the engine has no window at the start of the charge
  phase; same turn, before any charge roll; STD-ENH-3 tests).
- **AI hints (F9):** `slavesFreeRetreatAvailable` lets `src/ai/utility.ts` retreat a unit with Charge (+1 Damage) weapons, or one
  losing its fight, when Fearless Invaders is still unused this turn; Oath of Supremacy goes to the unit most likely to fight
  before your next turn (in combat, or a likely Move + charge), weighted by expected damage.
