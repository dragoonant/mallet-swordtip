# Cities of Sigmar — Castelite Company (Spearhead)

Faction id: `cities` · Army id: `cities.army.castelite-company`
Source: `docs/sources/spearhead-cities-castelite-company.pdf` (7 pages, gitignored). Mechanics and
numbers are ported 1:1; all wording below is our own.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" =
within combat range of an enemy unit. Timing labels follow the core rules' ability-timing vocabulary.

---

## 1. Army list

| ID | Unit | Models | Role | Base (mm) |
|---|---|---|---|---|
| `cities.unit.freeguild-cavalier-marshal` | Freeguild Cavalier-Marshal | 1 | **General** | 90×52 oval (standard, not stated in source) |
| `cities.unit.freeguild-steelhelms` (a) | Freeguild Steelhelms | 5 | Unit | 32 round (standard, not stated) |
| `cities.unit.freeguild-steelhelms` (b) | Freeguild Steelhelms | 5 | Unit | 32 round (standard, not stated) |
| `cities.unit.freeguild-cavaliers` | Freeguild Cavaliers | 5 | Unit | 90×52 oval (standard, not stated) |
| `cities.unit.ironweld-great-cannon` | Ironweld Great Cannon | 1 | Unit | 120×92 oval (standard, not stated) |

Two separate Steelhelms units share one warscroll. Total: 5 units, 17 models.

---

## 2. Battle trait

### CITIES-BT-1 `cities.ability.the-officers-order` — The Officer's Order
- **Timing:** Once per battle round, start of the battle round.
- **Declare:** Choose 1 battle tactic card in your hand and set it aside face-down, apart from your other
  tactic cards. Its contents stay hidden from the opponent, but which card is set aside is public.
- **Effect:**
  1. The set-aside card stays set aside until you either use its command or score its battle tactic.
  2. If you use the command printed on it, the card is **not discarded**; it is revealed to the opponent
     and goes back into your hand as a normal tactic card. Its command cannot be used again in the
     same phase it returned.
  3. If you did not use its command, you may still score its battle tactic at the end of your turn as
     normal if its conditions were met; then it is discarded as normal.
  4. If neither happened, it returns to your hand automatically at the end of your turn.
- Design intent: a pre-committed, free command each battle round.

---

## 3. Regiment abilities (pick 1 at army selection)

### CITIES-RA-1 `cities.ability.for-sigmar-charge` — For Sigmar, Charge!
- **Timing:** Passive.
- **Effect:** Friendly **Cavalry** units that made a charge move this turn have **Strike-first**.

### CITIES-RA-2 `cities.ability.ironweld-discipline` — Ironweld Discipline
- **Timing:** Once per turn, enemy shooting phase.
- **Declare:** Choose your Ironweld Great Cannon.
- **Effect:** Roll a D6. On 3+, the Cannon may use its **Shoot** ability as though it were your
  shooting phase.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `cities.enh.flask-of-lethisian-darkwater` | Flask of Lethisian Darkwater | Once per battle, start of any turn | **Heal (D6)** the general. |
| `cities.enh.heirloom-blade` | Heirloom Blade | Passive | The general's **Master-forged Longsword** gets +1 Rend (Rend 1 → 2). |
| `cities.enh.brazier-of-holy-flame` | Brazier of Holy Flame | End of any turn | Declare: choose a friendly Freeguild Steelhelms unit within the general's combat range. Effect: return up to D3 slain models to it. |
| `cities.enh.glimmering` | Glimmering | Passive | Once in each phase, you may re-roll 1 hit roll, or 1 wound roll, or 1 save roll made for the general (one re-roll total per phase, of one of those types). |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control. No unit in this army has a printed Ward. Printed keywords
only (Spearhead warscrolls print no faction keywords; see Engine notes).

### 5.1 `cities.unit.freeguild-cavalier-marshal` — Freeguild Cavalier-Marshal
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 10" | 7 | 3+ | 2 | — |

Keywords: **Hero, Cavalry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Dragoon Pistol (`cities.weapon.dragoon-pistol`) | Ranged | 10" | 2 | 3+ | 4+ | 1 | 1 | Shoot in Combat |
| Master-forged Longsword (`cities.weapon.master-forged-longsword`) | Melee | — | 5 | 3+ | 4+ | 1 | 2 | — |
| Warhorse's Steel-shod Hooves (`cities.weapon.warhorse-hooves`) | Melee | — | 2 | 5+ | 3+ | — | 1 | Companion |

**CITIES-AB-1 `cities.ability.decisive-commander` — Decisive Commander**
- **Timing:** Your hero phase.
- **Declare:** Choose a friendly Freeguild Steelhelms unit wholly within 12" of this unit; roll a D6.
- **Effect:** On 2+, choose one:
  - *On Your Feet!* — if the target is not in combat, return D3 slain models to it.
  - *Yield No Quarter!* — the target gets +3 control score until the start of your next turn.

### 5.2 `cities.unit.freeguild-steelhelms` — Freeguild Steelhelms
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 1 | 4+ | 1 | — |

Keywords: **Infantry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Freeguild Weapon (`cities.weapon.freeguild-weapon`) | Melee | — | 2 | 4+ | 4+ | — | 1 | — |

**CITIES-AB-2 `cities.ability.consecrate-the-land` — Consecrate the Land**
- **Timing:** Your movement phase.
- **Declare:** Usable only if this unit contests an objective you control that no enemy model contests;
  roll a D6.
- **Effect:** On 3+, that objective becomes **consecrated** (for you). While contesting a consecrated
  objective, friendly units have **Ward (6+)**. If the opponent gains control of it, it stops being
  consecrated.

### 5.3 `cities.unit.freeguild-cavaliers` — Freeguild Cavaliers
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 10" | 3 | 3+ | 1 | — |

Keywords: **Cavalry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Cavalier Weapon (`cities.weapon.cavalier-weapon`) | Melee | — | 3 | 4+ | 4+ | 1 | 1 | Charge (+1 Damage) |
| Warhorse's Steel-shod Hooves (`cities.weapon.warhorse-hooves`) | Melee | — | 2 | 5+ | 3+ | — | 1 | Companion |

**CITIES-AB-3 `cities.ability.devastating-charge` — Devastating Charge**
- **Timing:** Any charge phase.
- **Declare:** Only if this unit charged this phase. Choose an enemy unit in combat with it; roll a D6.
- **Effect:** On 2+, the target suffers D3 mortal damage.

### 5.4 `cities.unit.ironweld-great-cannon` — Ironweld Great Cannon
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 3" | 8 | 4+ | 2 | — |

Keywords: **War Machine, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Great Cannon: Cannonball (`cities.weapon.great-cannon-cannonball`) | Ranged | 24" | 2 | 4+ | 2+ | 2 | D3+2 | — |
| Great Cannon: Grapeshot (`cities.weapon.great-cannon-grapeshot`) | Ranged | 12" | 5 | 3+ | 3+ | 1 | 2 | — |
| Crew's Tools and Sidearms (`cities.weapon.crews-tools-and-sidearms`) | Melee | — | 2 | 4+ | 4+ | — | 1 | — |

**CITIES-AB-4 `cities.ability.shot-and-shell` — Shot and Shell**
- **Timing:** Passive.
- **Effect:** Each time this unit uses a Shoot ability, pick one profile — Cannonball or Grapeshot — for
  all its Great Cannon attacks that activation. Cannonball is only selectable if the unit has not used
  any **Move** ability this turn.

---

## 6. Spells and prayers

None. The army has no Wizard or Priest and no spell/prayer lore. (The Steelhelms' battle priest is
flavour only; Consecrate the Land is a normal ability, not a prayer.)

---

## 7. Engine notes

1. **Battle-tactic card set-aside (CITIES-BT-1):** needs a per-player "set-aside" slot on battle tactic
   cards, hidden-info handling (opponent sees which card, not its face), a "command from card is free
   and card returns to hand" path, a "not usable again this phase" lock, and an end-of-turn auto-return.
   Depends on the Spearhead battle-tactic deck/command system existing in the core engine.
2. **Return slain models** (Decisive Commander *On Your Feet!*, Brazier of Holy Flame): needs a
   per-unit slain-model count capped at starting size and a placement step (returned models set up in
   coherency, within the unit's combat range rules per core). *On Your Feet!* requires target not in
   combat; Brazier has no such check.
3. **Name-based targeting:** "Freeguild Steelhelms" and "Ironweld Great Cannon" are unit names, not
   printed keywords. Match on unit/warscroll id (`cities.unit.freeguild-steelhelms`, etc.).
4. **Consecrated objectives (CITIES-AB-2):** per-objective, per-player flag; grant Ward (6+) to friendly
   units contesting it; clear the flag the moment the opponent gains control. Ward does not stack with a
   better ward (take best).
5. **Control score modifier** (+3 until start of your next turn) needs a timed unit buff that expires at
   a turn boundary owned by the controlling player.
6. **Out-of-phase shooting (CITIES-RA-2):** Cannon gets a full Shoot activation during the enemy
   shooting phase on a 3+. Needs a reaction-style hook at enemy shooting phase; once per turn; Shot and
   Shell still applies (Cannonball blocked only if the Cannon used a Move ability *this* turn — i.e. the
   enemy's turn, normally false).
7. **Weapon profile choice (CITIES-AB-4):** the Cannon's two ranged profiles are mutually exclusive per
   Shoot use; the AI/UI must pick one, and the engine must track whether the unit used a Move ability
   this turn (normal move, run, retreat, charge all count as Move abilities per core).
8. **Strike-first for charged Cavalry (CITIES-RA-1):** conditional keyword grant keyed on a per-turn
   "charged" flag.
9. **Glimmering:** a per-phase, single-use re-roll token for the general covering hit, wound, or save
   rolls; requires a re-roll prompt for a single die.
10. **Weapon abilities used:** Shoot in Combat, Companion, Charge (+1 Damage) — core weapon abilities;
    must exist in the core rules spec.
11. **Reinforcements keyword:** core Spearhead rule (destroyed unit may be replaced once); handled by
    core, not this faction.
12. **Heal (D6)** and **mortal damage** are core primitives.
