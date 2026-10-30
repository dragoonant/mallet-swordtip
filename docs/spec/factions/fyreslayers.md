# Fyreslayers — Saga Axeband (Spearhead)

Faction id: `fyreslayers` · Army id: `fyreslayers.army.saga-axeband` · Grand alliance: Order.
Source: `docs/sources/spearhead-fyreslayers.pdf` (4 pages, gitignored), "Spearhead: Fyreslayers - Saga
Axeband", Warhammer Community downloads (Age of Sigmar), posted 2026-03-25, fetched 2026-10-30 from
`https://assets.warhammer-community.com/eng_aos_spearhead_fyreslayers_saga_axeband-9bngjzbzg0-d3q2qoqm5r.pdf`.
Mechanics and numbers are ported 1:1; all wording below is our own. Rule IDs are stable; tests key on
the `FYR-` IDs in section 9.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" =
within combat range of an enemy unit; "wholly within" per CORE-1.2. Timing labels follow the core rules'
ability-timing vocabulary. Engine phase names: Hero phase = `command`, Combat phase = `fight`.
Rend is stored as `AP` (negative = more Rend), same encoding as Heirloom Blade (`modifyStat AP -1` = +1 Rend).

---

## 1. Army list

| ID | Unit | Models | Role | Base (mm) |
|---|---|---|---|---|
| `fyreslayers.unit.battlesmith` | Battlesmith | 1 | **General** | 32 round (standard, not stated in source) |
| `fyreslayers.unit.hearthguard-berzerkers` | Hearthguard Berzerkers | 5 | Unit | 32 round (standard, not stated) |
| `fyreslayers.unit.vulkite-berzerkers` (a) | Vulkite Berzerkers | 5 | Unit | 32 round (standard, not stated) |
| `fyreslayers.unit.vulkite-berzerkers` (b) | Vulkite Berzerkers | 5 | Unit | 32 round (standard, not stated) |
| `fyreslayers.unit.vulkite-berzerkers` (c) | Vulkite Berzerkers | 5 | Unit | 32 round (standard, not stated) |
| `fyreslayers.unit.vulkite-berzerkers` (d) | Vulkite Berzerkers | 5 | Unit | 32 round (standard, not stated) |

Four separate Vulkite units share one warscroll. Total: 6 units, 26 models. All infantry, no ranged
weapons, no mounts, no Wizard or Priest.

**Reinforcements:** none. No warscroll prints the Reinforcements keyword, so the core Call for
Reinforcements ability is never available to this army; its model recovery comes from Horn of Grimnir
(enhancement) only.

---

## 2. Battle trait

### FYR-BT-1 `fyreslayers.ability.awaken-the-runes` — Awaken the Runes
- **Timing:** Once per battle round, start of your turn.
- **Declare:** Choose one ur-gold rune (table below) that you have not activated yet this battle, then make
  an **activation roll** of D6. Each rune can be activated only once per battle (so at most 4 activations,
  one per round in a 4-round Spearhead game).
- **Effect:** On 1–5 the rune's *standard* effect applies. On a 6 the *standard and enhanced* effects
  both apply. Either way, the effect lasts until the start of your next turn and covers all your units.

| Rune ID | Rune | Standard | Enhanced (6 only, on top of standard) |
|---|---|---|---|
| `fury` | Rune of Fury | +1 to hit rolls for your units' melee (combat) attacks | +1 Attacks to your units' melee weapons |
| `searing-heat` | Rune of Searing Heat | +1 Rend to your units' melee weapons | +1 Damage to your units' melee weapons |
| `fiery-determination` | Rune of Fiery Determination | Your units have Ward (5+) | +1 to save rolls for your units |
| `relentless-zeal` | Rune of Relentless Zeal | +2" Move for your units | +2 to charge rolls for your units |

Notes: the activation roll is never worse than "standard", so a re-roll (Spirit of Grimnir) can only help;
the AI should always re-roll a non-6. Hit-roll modifiers cap at ±1 and save-roll modifiers at +1
(CORE-2.5), so Rune of Fury and Rune of Fiery Determination's enhanced bonus do not stack with other +1s.

---

## 3. Regiment abilities (pick 1 at army selection)

### FYR-RA-1 `fyreslayers.ability.magmic-tunnels` — Magmic Tunnels
- **Timing:** Once per battle, start of the first battle round.
- **Effect:** Choose up to 2 friendly units. Take them off the battlefield and set each up again anywhere
  on the battlefield, every model more than 6" from every enemy unit (no territory limit).

### FYR-RA-2 `fyreslayers.ability.fyresteel-throwing-axes` — Fyresteel Throwing Axes
- **Timing:** Once per turn (army), your shooting phase.
- **Declare:** Choose any number of friendly units that are **not in combat** and are within 10" of at
  least one enemy unit.
- **Effect:** For each chosen unit, pick a **visible** enemy unit within 10" of it and roll a D6. On 4+,
  that enemy unit suffers D3 mortal damage (ward rolls apply as normal). Several throwers may pick the same
  enemy. This is not a Shoot ability, so it is not blocked by having run or retreated.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `fyreslayers.enh.too-stubborn-to-die` | Too Stubborn to Die | Start of any turn (no use limit: both turns of every round) | **Heal (D3)** the general. |
| `fyreslayers.enh.horn-of-grimnir` | Horn of Grimnir | Your hero phase | Declare: only if the general is not in combat. Effect: roll a D6 for each friendly unit on the battlefield with any slain models; on 3+ return 1 slain model to that unit. |
| `fyreslayers.enh.spirit-of-grimnir` | Spirit of Grimnir | Passive | You may re-roll the activation roll for Awaken the Runes (FYR-BT-1). |
| `fyreslayers.enh.powerful-presence` | Powerful Presence | Passive | +3 to the general's Control (5 → 8). |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Every warscroll prints **Ward (6+)** as a keyword.
Printed keywords only (Spearhead warscrolls print no faction keywords; see Engine notes). All weapons are
melee; no unit has a ranged weapon.

### 5.1 `fyreslayers.unit.battlesmith` — Battlesmith
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 5 | 5+ | 5 | 6+ |

Keywords: **Hero, Infantry, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Ancestral Battle-axe (`fyreslayers.weapon.ancestral-battle-axe`) | Melee | — | 5 | 3+ | 3+ | 1 | 2 | — |

**FYR-AB-1 `fyreslayers.ability.icon-of-grimnir` — Icon of Grimnir**
- **Timing:** Passive.
- **Effect:** +1 to save rolls for friendly units while they are **wholly within 12"** of this unit
  (includes the Battlesmith itself). Capped with other save bonuses at +1 total (CORE-2.5).

**FYR-AB-2 `fyreslayers.ability.plant-the-icon` — Plant the Icon**
- **Timing:** Once per battle, any hero phase (yours or the opponent's).
- **Effect:** Until the end of this turn, friendly units have **Ward (5+)** while they are wholly within
  12" of this unit. The range is checked whenever a ward roll is made (a moving aura, not a snapshot).

### 5.2 `fyreslayers.unit.hearthguard-berzerkers` — Hearthguard Berzerkers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 2 | 6+ | 1 | 6+ |

Keywords: **Infantry, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Flamestrike Poleaxe (`fyreslayers.weapon.flamestrike-poleaxe`) | Melee | — | 2 | 3+ | 3+ | 1 | 2 | Crit (Mortal) |

**FYR-AB-3 `fyreslayers.ability.duty-unto-death` — Duty Unto Death**
- **Timing:** Passive.
- **Effect:** While your general is **wholly within this unit's combat range** (3"), this unit and your
  general both have **Ward (5+)**. Checked live at each ward roll.

### 5.3 `fyreslayers.unit.vulkite-berzerkers` — Vulkite Berzerkers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 2 | 6+ | 1 | 6+ |

Keywords: **Infantry, Ward (6+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Fyresteel Handaxes (`fyreslayers.weapon.fyresteel-handaxes`) | Melee | — | 2 | 4+ | 3+ | 1 | 1 | Anti-charge (+1 Rend) |

**FYR-AB-4 `fyreslayers.ability.whirlwind-of-destruction` — Whirlwind of Destruction**
- **Timing:** Passive.
- **Effect:** +1 Attacks to this unit's melee weapons if it charged this turn.

---

## 6. Spells and prayers

None. No Wizard or Priest and no lore. (The Battlesmith's icon and the runes are abilities, not prayers.)

---

## 7. Mechanics mapping

(a) = expressible with existing data (`src/data/factions/*/abilities.json` descriptors: `timing`, `limit`,
`when`, `effect`, `scope`, `duration`, `modes`); (b) = new faction code hook in
`src/engine/factions/fyreslayers.ts` (registered like `citiesHooks` / `ironjawzHooks`); (c) = engine change.

| Rule | Class | How |
|---|---|---|
| Ward (6+) on every warscroll | (a) | `stats.ward: 6` on each datasheet model (`Stats.ward`). |
| Anti-charge (+1 Rend) | (a) | Weapon ability `{ ability: 'ANTI', keyword: '@charged' }` (as Ironjawz Ardboyz/Brutes). |
| Crit (Mortal) | (a) | Weapon ability `CRIT_MORTAL`. |
| FYR-AB-4 Whirlwind of Destruction | (a) | Passive, `when: { unitCharged: true, weaponType: 'melee' }`, `modifyStat { stat: 'A', value: 1 }`. |
| FYR-ENH Powerful Presence | (a) | Passive enhancement, `modifyStat { stat: 'OC', value: 3 }` on the bearer (cf. Trophy Skulls' `setStat`). |
| FYR-ENH Too Stubborn to Die | (b) `fyreslayersTooStubborn` | `startOfTurn` / `whose: 'any'`, no limit; `healUnit(ctx, generalUnit, D3)`. Same shape as `citiesFlask` minus the once-per-battle limit (`canUse` = general on board and damaged). |
| FYR-ENH Horn of Grimnir | (b) `fyreslayersHornOfGrimnir` | `phase command / your`; `canUse` = general on board, not `inCombat`, and some friendly unit has `returnableModels > 0`; resolve: per such unit roll D6 (deterministic order: unit id order), 3+ → `returnSlainModels(ctx, unit, 1, …)`. |
| FYR-ENH Spirit of Grimnir | (b) inside `fyreslayersAwakenTheRunes` | Awaken reads `paramsByCode(state, general, 'fyreslayersSpiritOfGrimnir')` (bare marker hook, like `ironjawzAmberbone`); if present and the roll is not 6, re-roll once automatically (re-rolling can never hurt). Emit both rolls. |
| FYR-BT-1 Awaken the Runes | (b) `fyreslayersAwakenTheRunes` | Activated army ability, `timing startOfTurn / your`, `limit oncePerRound` (`params.army: true`). `modesFor` returns the runes not yet used this battle (track in a per-player list, e.g. `entry.params`-keyed use log or a `usedRunes` field on the ability's use records). Resolve: roll D6 (+Spirit re-roll), then `effects.grant` on every friendly unit on the board, `scope { who: 'self' }`, `duration 'untilNextTurn'`, with the rune's effect list (rows below). |
| Rune of Fury std / enh | (a) effect payload | `{ when: { weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: 1 } }`; enh adds `{ when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } }`. |
| Rune of Searing Heat std / enh | (a) effect payload | `{ when: { weaponType: 'melee' }, modifyStat: { stat: 'AP', value: -1 } }`; enh adds `modifyStat { stat: 'D', value: 1 }` (melee). |
| Rune of Fiery Determination std / enh | (a) effect payload | `{ feelNoPain: 5 }` (best-ward rule already in attack.ts); enh adds `modifyRoll { roll: 'save', value: 1 }`. |
| Rune of Relentless Zeal std / enh | (a) effect payload | `modifyStat { stat: 'M', value: 2 }`; enh adds `modifyRoll { roll: 'charge', value: 2 }`. Check the movement module reads granted M modifiers for normal moves and runs. |
| FYR-AB-1 Icon of Grimnir | (c) small, or (b) | Needs "**wholly** within 12"" on a friendly aura. Preferred (c): add `wholly?: true` to `Scope` in `src/data/types.ts` + `common.schema.json`, honoured where `scope.within` is read (`hooks-impl.ts` party check, `effects.ts` aura collection) using `whollyWithinUnit`. Then pure data: passive, `scope { who: 'friendly', within: 12, wholly: true }`, `modifyRoll save +1`. Fallback (b) `fyreslayersIconOfGrimnir` with a per-party gate calling `whollyWithinUnit`. The holder must count itself (holder is wholly within its own range). |
| FYR-AB-2 Plant the Icon | (a) once FYR-AB-1's `wholly` exists | Activated, `phase command / any`, `limit oncePerBattle`, `effect { feelNoPain: 5 }`, `scope { who: 'friendly', within: 12, wholly: true }`, `duration 'untilEndOfTurn'` granted on the Battlesmith (aura travels with it). Needs the activated-ability loop to offer it in the **opponent's** hero phase (Cities' Ironweld Discipline already uses an `enemy`-phase timing). |
| FYR-AB-3 Duty Unto Death | (b) `fyreslayersDutyUntoDeath` | Passive on the Hearthguard. Gate (`onStatQuery`/ward query) true when the general's unit is `whollyWithinUnit(general, holder, 3)`; grants Ward 5+ to the holder **and** to the general's unit. No data `scope` can name "the general", so the general's half is code: `producesAt: ['onFeelNoPainRoll']` (or the ward stat query) returning 5 when the defender is the general and the gate holds. |
| FYR-RA-2 Fyresteel Throwing Axes | (b) `fyreslayersThrowingAxes` | Activated army ability, `phase shooting / your`, `limit oncePerTurnArmy`. `canUse`: some friendly unit not `inCombat` with a visible enemy (los.ts) within 10". Resolve: for each eligible thrower (all, by default — there is no downside), pick a target (player choice when the UI supports multi-pairs; v1 auto-pick: the visible enemy within 10" with the fewest wounds left, ties by id), roll D6, 4+ → `inflictMortal(ctx, use, target, D3)`. One use covers all throwers. |
| FYR-RA-1 Magmic Tunnels | (c) + (b) `fyreslayersMagmicTunnels` | Needs an **immediate redeploy** at `startOfRound` round 1 (`timing startOfRound / your`, `limit oncePerBattle`, gate `round === 1`). Engine change: a placement request that lifts up to 2 chosen units off the board and places each using the existing reserve-arrival validator in `phases/movement.ts` (`minDistanceFromEnemies: 6`, `anywhere: true`, coherency), outside the movement phase. Reuse `writePlaceRequest` / the arrival placement UI; units keep their state (not "set up this turn" for charge purposes — set `setUpTurn` per core CORE-6.13 if needed). Must resolve before the first turn's priority-dependent steps; AI: move the two Vulkite units nearest the centre to spots just over 6" from the nearest enemy. |
| Reinforcements | (a) | Nothing to do: no unit has the keyword, so `replaceableUnits` is always empty for this army. |
| Hit / save modifier caps | existing | `dice.ts` clamps hit ±1 and save +1 (CORE-2.5); Rune of Fury + any other hit buff and Icon + Fiery Determination enhanced are capped. |

---

## 8. Engine notes

1. **Per-rune once-per-battle (FYR-BT-1):** the generic `limit` covers "once per battle round" for the
   trait; the "each rune once per battle" rule lives in the hook (`modesFor` hides used runes). The UI
   should show the 4 runes with used ones greyed (styled tooltip, never `title=`).
2. **Rune buffs are granted per unit** at activation. This army has no reserves and no Reinforcements, so
   no unit can join the board mid-effect; if Magmic Tunnels ever ran after an activation it would not
   matter either, since lifted units keep their granted effects.
3. **Ward sources:** printed 6+, Rune of Fiery Determination 5+, Plant the Icon 5+, Duty Unto Death 5+.
   Only the best applies (CORE-13.2); none stack.
4. **Two live "wholly within" auras** (Icon of Grimnir, Plant the Icon) and one live "wholly within combat
   range" check (Duty Unto Death) are evaluated at roll time, not when the ability was used.
5. **Plant the Icon in the opponent's hero phase** needs the non-active player's activation window at the
   start/through the enemy hero phase.
6. **Throwing Axes visibility** uses the core LOS rule (CORE-7.x) from any model of the thrower to any
   model of the target; range 10" unit-to-unit (closest models).
7. **Horn of Grimnir** places returned models with `returnSlainModels` (automatic placement, not in
   enemy combat range).

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| FYR-ARMY-1 | Saga Axeband roster builds: Battlesmith general + 1 Hearthguard + 4 Vulkite units, 26 models, stats as section 5. |
| FYR-ARMY-2 | No unit has Reinforcements; Call for Reinforcements is never offered to this army. |
| FYR-BT-1 | Awaken the Runes is offered at the start of your turn, once per battle round. |
| FYR-BT-2 | A rune already activated this battle is not offered again. |
| FYR-BT-3 | Activation roll 1–5 applies standard only; 6 applies standard + enhanced. |
| FYR-BT-4 | Rune effects expire at the start of your next turn (still active in the opponent's turn). |
| FYR-RUNE-1 | Rune of Fury: +1 to hit for melee attacks (capped at +1 total); enhanced +1 melee Attacks. |
| FYR-RUNE-2 | Rune of Searing Heat: +1 melee Rend; enhanced +1 melee Damage. |
| FYR-RUNE-3 | Rune of Fiery Determination: Ward (5+) replaces Ward (6+); enhanced +1 save (capped). |
| FYR-RUNE-4 | Rune of Relentless Zeal: +2" Move; enhanced +2 charge roll. |
| FYR-RA-1 | Magmic Tunnels: start of round 1 only, once per battle, up to 2 units re-set >6" from all enemies. |
| FYR-RA-2 | Throwing Axes: only units not in combat with a visible enemy within 10" may throw. |
| FYR-RA-3 | Throwing Axes: 4+ inflicts D3 mortal damage per thrower; ward applies. |
| FYR-RA-4 | Throwing Axes: once per turn for the whole army. |
| FYR-ENH-1 | Too Stubborn to Die heals D3 at the start of each turn (both players' turns). |
| FYR-ENH-2 | Horn of Grimnir: blocked while the general is in combat; each damaged unit returns 1 model on 3+. |
| FYR-ENH-3 | Spirit of Grimnir re-rolls a non-6 activation roll. |
| FYR-ENH-4 | Powerful Presence: general's Control 5 → 8. |
| FYR-AB-1 | Icon of Grimnir: +1 save only for units wholly within 12" (partly within gets nothing); includes the Battlesmith. |
| FYR-AB-2 | Plant the Icon: once per battle, either hero phase, Ward (5+) wholly within 12" until end of turn. |
| FYR-AB-3 | Duty Unto Death: Hearthguard and general get Ward (5+) only while the general is wholly within 3" of the Hearthguard. |
| FYR-AB-4 | Whirlwind of Destruction: +1 melee Attacks only on a turn the Vulkites charged. |
| FYR-WEAP-1 | Fyresteel Handaxes get +1 Rend against a unit that charged this turn. |
| FYR-WEAP-2 | Flamestrike Poleaxe crit hit deals 2 mortal damage and skips wound/save. |
| FYR-WARD-1 | With several ward sources only the best applies. |

---

## 10. Figures (3D pipeline)

Palette for the whole army: ruddy tan skin with glowing molten-gold rune inlays, flame-orange crests and
beards, burnished bronze-gold helmets and bracers, charcoal-black loincloths and belts, ember-red accents.
All figures are original **true MGSD** chibis (~2.5 heads tall, oversized head, stubby legs, big hands),
no GW logos, no copied icons (our god-symbol is an original flaming anvil-and-beard sigil).

| Slug | Unit | Models needed | Base (mm) | Mount | Concept prompt |
|---|---|---|---|---|---|
| `fyr-battlesmith` | Battlesmith | 1 | 32 round | No | A true MGSD chibi duardin war-poet, 2.5 heads tall with a huge bearded head under a bronze crested helm, stubby legs, gripping a broad battle-axe in one fist and a tall banner-pole topped with an original flaming anvil sigil in the other, glowing gold runes on bare ruddy arms, flame-orange beard and crest. |
| `fyr-hearthguard` | Hearthguard Berzerkers | 1 (×5) | 32 round | No | A true MGSD chibi duardin bodyguard, 2.5 heads tall with an enormous head in a tall bronze dragon-snouted helm with a flame-orange crest, stubby legs, holding a long two-handed poleaxe whose blade glows like hot metal, bare chest with molten-gold rune inlays and a heavy gold belt. |
| `fyr-vulkite` | Vulkite Berzerkers | 1 (×20) | 32 round | No | A true MGSD chibi duardin berserker, 2.5 heads tall with a giant head, wild flame-orange beard and mohawk crest bursting from a small bronze helm, stubby legs in a mid-leap pose, a short glowing hand-axe in each fist, ruddy bare torso etched with blazing gold runes. |
| `fyr-vulkite-karl` (optional) | Vulkite Berzerkers (unit leader look) | 1 (×4, one per unit) | 32 round | No | The same MGSD chibi berserker with a taller fan-shaped crest, a gold face-mask visor and a bigger notched axe, so each Vulkite unit has a visible leader; skip if the pipeline is short on time (rules do not use a champion). |
