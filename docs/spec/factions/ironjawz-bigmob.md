# Ironjawz Bigmob (Orruk Warclans) — Spearhead data spec

Faction id: `ironjawz` · Army id: `ironjawz.army.bigmob` · Grand alliance: Destruction.
Source: `docs/sources/spearhead-ironjawz-bigmob.pdf` (4 pages, gitignored). Numbers ported 1:1; all
text below is our own paraphrase. Rule IDs `IJZ-<section>.<n>` are stable — tests key on them.

## 1. Army list

| # | List entry id | Unit id | Models | Role | Base (mm) |
|---|---|---|---|---|---|
| IJZ-1.1 | `ironjawz.list.megaboss` | `ironjawz.unit.megaboss` | 1 | **General** | 60 round* |
| IJZ-1.2 | `ironjawz.list.brute-ragerz` | `ironjawz.unit.brute-ragerz` | 3 | Unit | 40 round* |
| IJZ-1.3 | `ironjawz.list.ardboyz-1` | `ironjawz.unit.ardboyz` | 5 | Unit | 32 round* |
| IJZ-1.4 | `ironjawz.list.ardboyz-2` | `ironjawz.unit.ardboyz` | 5 | Unit | 32 round* |
| IJZ-1.5 | `ironjawz.list.brutes` | `ironjawz.unit.brutes` | 5 | Unit (reserve, see IJZ-2.1) | 40 round* |

\* The PDF states no base sizes; these are the standard GW sizes for these kits.

The army is fixed: no wargear options, no points. The player picks 1 regiment ability (§3) and gives
the general 1 enhancement (§4) before deployment.

## 2. Battle traits (always active for this army)

### IJZ-2.1 'Ere We Go! — `ironjawz.ability.ere-we-go`
- **Setup rule:** the Brutes unit (`ironjawz.list.brutes`) is never set up in the deployment phase.
  It starts in reserve.
- **Ability granted to that unit** — timing **Your Movement Phase**, keyword **Core**, usable only from
  **battle round 3 onward**.
- **Effect:** set the unit up anywhere on the battlefield, every model more than 6" from every enemy unit.

### IJZ-2.2 Mighty Destroyers — `ironjawz.ability.mighty-destroyers`
- **Timing:** Once Per Turn (Army), **Any Hero Phase** (yours or the opponent's).
- **Declare:** pick one friendly unit that was not set up this turn.
- **Effect:** the target may move up to 3". This move may end in combat (may move into combat). If the
  target was in combat when the move began, it must also be in combat when the move ends.

## 3. Regiment abilities (pick 1)

| ID | Ability id | Timing | Effect |
|---|---|---|---|
| IJZ-3.1 | `ironjawz.ability.natural-disaster` | Passive | When a friendly unit makes a charge roll whose **unmodified** total is 8+, that unit's melee weapons get +1 Attacks for the rest of the turn. |
| IJZ-3.2 | `ironjawz.ability.a-proper-ruckus` | Once Per Battle, **Reaction: you declared Mighty Destroyers** (IJZ-2.2) | Instead of the single declared target, every friendly unit on the battlefield that was not set up this turn becomes a target of that Mighty Destroyers use (each may make the 3" move). |

## 4. Enhancements (general only, pick 1)

| ID | Enhancement id | Timing | Effect |
|---|---|---|---|
| IJZ-4.1 | `ironjawz.enhancement.amberbone-whetstone` | Passive | The general's melee weapons have Rend **2** (set, not +2). |
| IJZ-4.2 | `ironjawz.enhancement.trophy-skulls` | Passive | The general's Control characteristic is **5** (set). |
| IJZ-4.3 | `ironjawz.enhancement.armour-of-gork` | Passive | The general has **Ward (6+)**. |
| IJZ-4.4 | `ironjawz.enhancement.mega-bossy` | Passive | If the general charged this turn, then for the rest of that turn friendly units get +1 to charge rolls while they are wholly within 12" of the general. |

## 5. Warscrolls

Keywords below are exactly as printed. The PDF prints no faction keywords; the data should add
`DESTRUCTION`, `ORRUK WARCLANS`, `IRONJAWZ` to every unit (engine/UI only, nothing in this army keys on them).
No unit has a ward unless an enhancement grants one. No unit has ranged weapons. No spells or prayers
(no Wizard or Priest in the army).

### IJZ-5.1 Megaboss — `ironjawz.unit.megaboss`

| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 8 | 3+ | 2 | — |

Keywords: `HERO`, `INFANTRY`.

| Melee weapon | Weapon id | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|
| Boss-choppa | `ironjawz.weapon.boss-choppa` | 8 | 4+ | 2+ | 1 | 2 | — |

**IJZ-5.1.1 Get Stuck In, Ladz! — `ironjawz.ability.get-stuck-in-ladz`**
- Timing: **Your Hero Phase**.
- Declare: pick this unit, or a friendly `BRUTE` unit wholly within 12" of it.
- Effect: roll a D6. On 2+, the target's melee weapons get +1 Attacks until the start of your next turn.

### IJZ-5.2 Ardboyz — `ironjawz.unit.ardboyz`

| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 2 | 3+ | 1 | — |

Keywords: `INFANTRY`.

| Melee weapon | Weapon id | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|
| Choppa or Stikka | `ironjawz.weapon.choppa-or-stikka` | 2 | 4+ | 3+ | 1 | 1 | Anti-charge (+1 Rend) |

**IJZ-5.2.1 Shield Bash — `ironjawz.ability.shield-bash`**
- Timing: **Any Combat Phase**.
- Declare: pick an enemy unit within 1" of this unit.
- Effect: roll a D6 for each model in this unit that is within 3" of the target. Each 6 inflicts 1 mortal
  damage on the target.

### IJZ-5.3 Brute Ragerz — `ironjawz.unit.brute-ragerz`

| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 3 | 5+ | 1 | — |

Keywords: `INFANTRY`, `BRUTE`, `REINFORCEMENTS`.

| Melee weapon | Weapon id | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|
| Rager Weapons | `ironjawz.weapon.rager-weapons` | 3 | 4+ | 2+ | 1 | 2 | — |

**IJZ-5.3.1 Unleashed Rage — `ironjawz.ability.unleashed-rage`**
- Timing: **Passive**.
- Effect: while this unit charged this turn, it has Strike-first.

### IJZ-5.4 Brutes — `ironjawz.unit.brutes`

| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 3 | 3+ | 1 | — |

Keywords: `INFANTRY`, `BRUTE`.

| Melee weapon | Weapon id | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|
| Brute Weapons | `ironjawz.weapon.brute-weapons` | 3 | 4+ | 3+ | 1 | 2 | — |

**IJZ-5.4.1 You Messin'? — `ironjawz.ability.you-messin`**
- Timing: **Passive**.
- Effect: enemy units whose Health characteristic is 1 or 2 cannot contest objectives while they are in
  combat with this unit.

Also carries the battle-trait reserve rule and ability IJZ-2.1.

## 6. Engine notes

- **IJZ-E1 Reserve arrival (IJZ-2.1).** Needs a Spearhead reserve state: the Brutes unit skips
  deployment, gets a movement-phase setup action gated on `round >= 3`, placement validated as every model
  > 6" from every enemy model, anywhere on the board (no territory/edge limit). The source does not say
  what happens if it never arrives; follow the core rule for units left in reserve (check
  `aos4-core-rules.pdf`), and the AI should arrive in round 3.
- **IJZ-E2 "Not set up this turn."** Mighty Destroyers and A Proper Ruckus exclude units set up this turn
  (reserve arrivals, Reinforcements replacements). Track `unit.setUpTurn` (round + player turn).
- **IJZ-E3 Out-of-phase move into combat (IJZ-2.2).** A 3" move in a hero phase that may end in combat
  (normal moves cannot), with the constraint "started in combat ⇒ must end in combat". Usable in the
  opponent's hero phase too, so it needs a reaction window for the non-active player. Once per turn
  army-wide.
- **IJZ-E4 Reaction ability (IJZ-3.2).** First "Reaction: you declared X" in this army: a window opened
  after Mighty Destroyers is declared, which swaps the single target for a multi-target set; each target
  then resolves its own 3" move (player picks the order). Once per battle.
- **IJZ-E5 Unmodified charge roll (IJZ-3.1).** The charge event must expose the raw 2D6 total separately
  from modifiers (Mega Bossy's +1 does not count toward the 8+). Buff: +1 Attacks to all melee weapons of
  that unit, `untilEndOfTurn`.
- **IJZ-E6 Characteristic set vs modify.** Amberbone Whetstone sets Rend to 2 and Trophy Skulls sets
  Control to 5; these are overrides, not additive modifiers. Decide the order against other modifiers
  (none in this army modify Rend or Control on the general).
- **IJZ-E7 Mega Bossy aura (IJZ-4.4).** Conditional aura: active only after the general completed a
  charge this turn; checks "wholly within 12" of the general" at the moment each later charge roll is made.
- **IJZ-E8 Attacks buffs stack.** Get Stuck In, Ladz! (until the start of your next turn, so it also
  covers the opponent's combat phase) and Natural Disaster (rest of turn) can both apply: up to +2 Attacks.
- **IJZ-E9 Core weapon/unit abilities used here:** Anti-charge (+1 Rend) — +1 Rend for attacks against a
  unit that charged this turn; Strike-first (Unleashed Rage); Ward (Armour of Gork); Reinforcements
  keyword (Brute Ragerz can be replaced once via the core Call for Reinforcements ability, page 57 of
  the core rules); mortal damage (Shield Bash).
- **IJZ-E10 Objective contest filter (IJZ-5.4.1).** The objective-control step must drop enemy units
  with base Health 1–2 that are in combat with the Brutes unit; it does not change their Control value.
- **IJZ-E12 Gated passives carry their effect in data.** Natural Disaster (`modifyStat A +1`, melee),
  Mega Bossy (`modifyRoll charge +1`) and Amberbone Whetstone (`modifyStat AP -1` on the Rend 1 Boss-choppa,
  i.e. Rend 2) are descriptors whose code hook only gates the effect; the shipped data lacked the effects
  until the balance audit, so none of the three did anything in play.
- **IJZ-E11 Shield Bash counting.** Counts Ardboyz models within 3" of the target (not within 1"),
  rolled at the declaration moment.
