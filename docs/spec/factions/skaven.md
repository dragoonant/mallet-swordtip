# Skaven — Warpspark Clawpack (Spearhead)

Faction id: `skaven` · Army id: `skaven.army.warpspark-clawpack` · Grand alliance: Chaos.
Source: `docs/sources/spearhead-skaven.pdf` (15 pages, 30.8 MB, gitignored), "Spearhead: Skaven – Gnawfeast Clawpack and
Warpspark Clawpack", the free Warhammer Community download (Age of Sigmar, Spearhead category). First listed 2024-09-30,
last updated 2026-04-01 (PDF metadata: created 2026-03-13), fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_01-04_aos_spearhead_skaven_gnawfeast_clawpack-zorddipson-dpnghi1nvc.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, search term
"skaven"). Base sizes are not printed in the PDF; they come from the Wahapedia aos4 warscroll pages (fetched the same day
with plain curl, `https://wahapedia.ru/aos4/factions/skaven/<Unit>`).

**Which army.** The one PDF holds two Spearhead armies. **Warpspark Clawpack** (pages 9–15: Grey Seer, 3 Stormfiends,
Warp Lightning Cannon, 2×10 Clanrats) is the army of the **Spearhead: Skaven** box, so it is the army this spec builds.
**Gnawfeast Clawpack** (pages 1–8: Clawlord on Gnaw-beast, Grey Seer, Warlock Engineer, 2×10 Clanrats, 3 Rat Ogors) is
built from the Skaventide launch-box models. It is out of scope, but its rules are recorded in Appendix A so it can be
added later without reopening the PDF.

Mechanics and numbers are ported 1:1; all wording below is our own.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within
combat range of an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`,
Combat phase = `fight`; Run = `advance`, Retreat = `fallBack`. Rend is stored as `rend` (data) / `AP`. Ward = `feelNoPain`.
Rule IDs `SKV-*` double as test IDs (§9).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `skaven.unit.grey-seer` | Grey Seer | 1 | **General** | no | 32 round (Wahapedia) |
| `skaven.unit.stormfiends` | Stormfiends | 3: 1 Shock Gauntlets, 1 Windlaunchers + Clubbing Blows, 1 Ratling Cannons + Clubbing Blows | Unit | no | 60 round (Wahapedia) |
| `skaven.unit.warp-lightning-cannon` | Warp Lightning Cannon | 1 | Unit | no | 120×92 oval (Wahapedia) |
| `skaven.unit.clanrats` (a) | Clanrats | 10 | Unit | **yes** | 25 round (Wahapedia) |
| `skaven.unit.clanrats` (b) | Clanrats | 10 | Unit | **yes** | 25 round |

Total: 5 units, 25 models. Both Clanrats units share one warscroll and one datasheet (two patrol entries, `ref`
`clanrats-1` / `clanrats-2`). One Wizard (the Grey Seer, power level 1); no Priest; nothing has **Fly**. The Grey Seer is
the only Hero.

---

## 2. Battle trait

### SKV-BT-1 `skaven.ability.always-three-clawsteps-ahead` — Always Three Clawsteps Ahead
- **Timing:** Enemy movement phase, **once per phase** for the army.
- **Declare:** Pick 1 friendly unit that is **not in combat**.
- **Effect:** That unit may make a **Normal Move** as though it were your own movement phase (up to its Move, may not
  pass through or end within enemy combat ranges; terrain and coherency rules as normal).
- Notes: the Warp Lightning Cannon (Move 3") can use it too. It is not a Run, so the unit adds no Run roll.

---

## 3. Regiment abilities (pick 1 at army selection)

### SKV-RA-1 `skaven.ability.warpstone-laced-armour` — Warpstone-Laced Armour
- **Timing:** Once per battle, reaction: your **opponent declared an Attack ability** (Shoot or Fight) that **targets your
  Stormfiends** unit.
- **Used by:** your Stormfiends unit.
- **Effect:** The Stormfiends have **Ward (5+)** until the end of the turn.

### SKV-RA-2 `skaven.ability.endless-swarm-of-rats` — Endless Swarm of Rats
- **Timing:** Passive.
- **Effect:** Whenever a friendly Clanrats unit uses **Seething Swarm** (SKV-AB-4), it returns **D6** slain models
  instead of D3.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `skaven.enh.skilled-manipulator` | Skilled Manipulator | Passive | The general has **Ward (4+)** while it is **within 1"** of any friendly **Clanrats** unit. |
| `skaven.enh.skitterleap` | Skitterleap | Your hero phase (no printed once-per limit; CORE-3.4 once per phase) | Casting roll 2D6; on **6+**: take the general off the battlefield and set it up again anywhere on the battlefield **more than 6" from every enemy unit**. It cannot use **Move** abilities in the next movement phase (= this turn's). |
| `skaven.enh.scurry-away` | Scurry Away | Any combat phase (once per phase, CORE-3.4) | Roll a D6; on **3+** the general's unit may **immediately Retreat** as though it were your movement phase, and suffers **no mortal damage** for it. |
| `skaven.enh.cage-of-warp-lightning` | Cage of Warp Lightning | **Once per battle**, any combat phase | Declare: pick a **visible enemy unit within 6"** of the general, roll a D6. On **2+** that unit has **Strike-last** for the phase. On a **1**, the general suffers **1 mortal damage** (and nothing else happens). |

RULING: Skitterleap asks for a casting roll but the card prints no Spell keyword. It is treated as a **Spell** (casting
value 6, can be unbound, miscasts on a double 1, uses one of the Grey Seer's casts for the phase), the same as Wither.

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. **No warscroll in this army prints a Ward.** Printed keywords only
(Spearhead warscrolls print no faction keywords). Warscroll stat blocks were checked against the rendered pages.

### 5.1 `skaven.unit.grey-seer` — Grey Seer (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 5 | 6+ | 2 | — |

Keywords: **Hero, Wizard, Infantry** (Wizard power level 1)

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Warpstone Staff (`skaven.weapon.warpstone-staff`) | Melee | — | 3 | 4+ | 4+ | 1 | D3 | — |

**SKV-AB-1 `skaven.ability.will-of-the-horned-rat` — Will of the Horned Rat**
- **Timing:** Your hero phase (once per phase for this unit, CORE-3.4). Not a spell.
- **Declare:** Pick a friendly unit **wholly within 13"** of this unit, then roll a D6.
- **Effect:** On **3+**, add the **rolled number** to that unit's **control score** (the unit total on an objective,
  CORE-17.4, not per model) until the start of your next turn. On 1–2 nothing happens.
- [interp] The Grey Seer may pick itself (a unit is wholly within any range of itself; the card does not say "other").

**SKV-AB-2 `skaven.ability.wither` — Wither** (Spell, casting value 6)
- **Timing:** Your hero phase.
- **Declare:** Pick a **visible enemy unit within 13"** of this unit, then make a casting roll of 2D6.
- **Effect:** If cast (6+ and not unbound), the target suffers **D3 mortal damage**.
- RULING: no Spell keyword is printed; the casting roll makes it a spell (unbind, miscast, power level as CORE-15).

### 5.2 `skaven.unit.stormfiends` — Stormfiends
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 6 | 4+ | 2 | — |

Keywords: **Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Ratling Cannons (`skaven.weapon.ratling-cannons`) | Ranged | 15" | 3D6 | 4+ | 3+ | 1 | 1 | — |
| Windlaunchers (`skaven.weapon.windlaunchers`) | Ranged | 15" | 3 | 4+ | 3+ | 2 | D3 | — |
| Shock Gauntlets (`skaven.weapon.shock-gauntlets`) | Melee | — | 4 | 4+ | 2+ | 1 | 2 | Crit (D6 Hits), see SKV-AB-3 |
| Clubbing Blows (`skaven.weapon.clubbing-blows`) | Melee | — | 4 | 4+ | 2+ | — | 2 | — |

Loadout: 1× Shock Gauntlets; 1× Windlaunchers + Clubbing Blows; 1× Ratling Cannons + Clubbing Blows. No ranged weapon has
Shoot in Combat.

**SKV-AB-3 `skaven.ability.shock-gauntlets` — Shock Gauntlets**
- **Timing:** Passive.
- **Effect:** When an attack with this unit's Shock Gauntlets scores a **critical hit**, it scores **D6 hits** instead of
  1 (roll the D6 per critical hit); each of those hits makes its own wound roll (no auto-wound, no mortal).

### 5.3 `skaven.unit.warp-lightning-cannon` — Warp Lightning Cannon
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 3" | 8 | 4+ | 2 | — |

Keywords: **War Machine**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Warp Lightning Blast (`skaven.weapon.warp-lightning-blast`) | Ranged | 20" | 2D6 | 4+ | see SKV-AB-5 | see SKV-AB-5 | see SKV-AB-5 | — |
| Crew's Teeth and Knives (`skaven.weapon.crews-teeth-and-knives`) | Melee | — | D6 | 4+ | 5+ | — | 1 | — |

**SKV-AB-5 `skaven.ability.warp-lightning-blast` — Warp Lightning Blast**
- **Timing:** Passive.
- **Effect:** All attacks made with this weapon in one phase must target **the same enemy unit**. Every **hit** inflicts
  **1 mortal damage** on the target and that attack's sequence stops there (no wound roll, no save roll; the target's
  ward still applies, being mortal damage). Critical hits have no extra effect.

### 5.4 `skaven.unit.clanrats` — Clanrats (×2 units)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 6" | 1 | 5+ | 1 | — |

Keywords: **Infantry, Reinforcements** (data adds the name keyword `CLANRATS`, see §7)

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Rusty Blade (`skaven.weapon.rusty-blade`) | Melee | — | 2 | 4+ | 5+ | — | 1 | — |

Loadout: all 10 models carry a Rusty Blade. No champion, standard or musician rules.

**SKV-AB-4 `skaven.ability.seething-swarm` — Seething Swarm**
- **Timing:** End of any turn (once per turn for this unit).
- **Effect:** Return up to **D3** slain models to this unit (**D6** with SKV-RA-2). No range or combat condition; usable
  in combat. A replacement unit from Call for Reinforcements has it too.

---

## 6. Spells and prayers

Wither (SKV-AB-2, Grey Seer warscroll) and Skitterleap (enhancement, RULING above). Both casting value 6. The Grey Seer is a
Wizard (1): one cast attempt per hero phase, so in a phase it is Wither **or** Skitterleap. It may attempt to unbind one
enemy spell per enemy hero phase (CORE-15.6, automatic in the engine). No lore, no manifestations, no Priest.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/skaven/*.json`), at most reusing an existing code hook; (b) = new
faction code hook in `src/engine/factions/skaven.ts`, exported as `skavenHooks` and spread into `code-hooks.ts` like
`kruleboyzHooks`. Shared helpers from `aos-common.ts`: `onBoard`, `whollyWithinUnit`, `enemiesInCombat`, `inCombat`,
`inflictMortal`, `announce`, `paramOf`, `returnSlainModels`, `returnableModels`. (c) = engine change outside the faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, no printed Ward, power level | (a) | Datasheets as the other armies; `HERO`, `WIZARD`, `INFANTRY`, `WAR MACHINE`, `REINFORCEMENTS`. Grey Seer `wizard: 1` (or the WIZARD keyword default). Base shapes `{ shape: 'round', mm }` / `{ shape: 'oval', mm: 120, mm2: 92 }`. |
| Stormfiends three loadouts | (a) | One datasheet, model variants `stormfiend-gauntlets`, `stormfiend-windlaunchers`, `stormfiend-ratling` (one each); all Health 6. List order: Windlaunchers, Ratling, Gauntlets last (the AI's allocation kills list-order first; the Gauntlets are the best melee). |
| Clanrats ×2, Reinforcements | (a) | One datasheet, two patrol entries (`size: 10`). Core `spearheadCallForReinforcements`; Grey Seer, Stormfiends and Cannon cannot be replaced. |
| Name keyword `CLANRATS` | (a) | Add `"CLANRATS"` to the Clanrats datasheet `keywords` so Skilled Manipulator can find it (Spearhead prints no name keywords; this one is invisible to players and changes no other rule). |
| SKV-ENH Skilled Manipulator | (a) | Passive enhancement, scope bearer, `effect { feelNoPain: 4, when: { friendlyKeywordWithin: { keyword: 'CLANRATS', within: 1 } } }` (`hooks-impl.ts` `friendlyKeywordWithin` = closest-model distance to another friendly unit with the keyword). The engine takes the best ward, so it never stacks with Warpstone-Laced Armour (that one is Stormfiends only anyway). |
| SKV-AB-2 Wither | (b) `skavenWither` | Activated, `timing phase command / your`, `keywords ['SPELL']`, `castingValue 6`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params { range: 13, damage: 'D3' }`. `targets` = enemy units on board within 13" (`unitGap`) and visible (`losService.unitVisible` from any caster model). abilities.ts already routes a `castingValue` descriptor through `magic.castingRoll` (Guide the Gusts pattern) and only resolves on a cast. Resolve: `inflictMortal(ctx, use, target, rollExpr(D3))`. |
| SKV-ENH Skitterleap | (b) `skavenSkitterleap` | Enhancement, `timing phase command / your`, `keywords ['SPELL']`, `castingValue 6`, no declare target (the bearer). Resolve: `requestRedeploy(s, { abilityId, player, unitIds: [general], minEnemyDistance: 6, markSetUp: true })` (Magmic Tunnels pattern; the set-up asks the player for a spot anywhere on the board). `markSetUp` gives CORE-6.13 "no Move abilities this movement phase", which is exactly "the following movement phase" since this is the hero phase of the same turn. |
| SKV-AB-1 Will of the Horned Rat | (b) `skavenWillOfTheHornedRat` | `phase command / your`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { range: 13, succeedOn: 3 }`. Targets = friendly units on board with `whollyWithinUnit(t, seer, 13)` (self included). The hook rolls the D6 itself (the number matters, so it is not a plain pass/fail declared roll). On 3+ grant an empty marker effect (scope self, `duration 'untilNextTurn'`) and record `n` in a ledger `mission.custom.skvControl[effectId] = n`; `produce` at `onObjectiveControl` returns `{ kind: 'stat', delta: n }` once for that unit. Same shape as `kharadronTakeWhatYouAreOwed` / `kruleboyzAllPartOfDaPlan` (control score, not per-model OC). |
| SKV-AB-4 Seething Swarm | (b) `skavenSeethingSwarm` | Activated, `timing endOfTurn / any`, `limit oncePerTurn`, no declare (the unit itself). `canUse` = `returnableModels(state, self) > 0`. Resolve: dice = `'D6'` when `state.players[player].regimentAbilityId === 'skaven.ability.endless-swarm-of-rats'`, else `params.returnModels` (`'D3'`); `n = rollExpr(dice)`; `returnSlainModels(ctx, self, n, abilityId)`. Same body as `citiesBrazier` with the target fixed to self. |
| SKV-RA-2 Endless Swarm of Rats | (a) | Passive regiment descriptor with no effect; it is read by `skavenSeethingSwarm` through `regimentAbilityId` (the `ironjawz` / `fyreslayers` pattern). |
| SKV-ENH Cage of Warp Lightning | (b) `skavenCageOfWarpLightning` | Enhancement, `timing phase fight / any`, `limit oncePerBattle`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params.range 6`. Targets = enemy units on board within 6" of the general and visible. The hook rolls the D6 itself (both results do something). 2+: `unit.turn.fightsLast = true` (the `luminethHurricaneWinds` pattern; the turn flag outlasts the phase, but the combat phase is the turn's last fighting, so this equals "this phase"). 1: `inflictMortal(ctx, use, general, 1)`. Must be offered in the start-of-combat window (before the first fight pick), like Kruleboyz Waaagh!. |
| SKV-ENH Scurry Away | (b) `skavenScurryAway` | Enhancement, `timing phase fight / any`, no limit (CORE-3.4), `roll { dice: 'D6', succeedOn: 3 }`. `canUse` = the general is in combat (Retreat needs it). Resolve: grant `{ noRetreatDamage: true }` until end of turn and queue `writeMoveQueue(s, { abilityId, player, maxDistance: Move, queue: [general], kind: 'retreat' })` (C3 from Kharadron Timed Charges: `retreatOptions` / `applyRetreat`, which already apply no damage). Offered in the start-of-combat window and between fight activations (any time the general's player may act). |
| SKV-BT-1 Always Three Clawsteps Ahead | (b) `skavenThreeClawsteps` + (c) C1 | Army ability, `timing phase movement / enemy`, `limit oncePerTurnArmy` (= once in the enemy movement phase), `declare [{ role: 'unit', owner: 'friendly' }]`. Targets = friendly units on board, not `inCombat`, not set up this turn, with at least one legal slide. Resolve: `writeMoveQueue(s, { abilityId, player, maxDistance: Move characteristic, queue: [target], opts: { mayNotEndInCombat: true, normalMove: true } })` (the Pulled by the Winds / Mighty Destroyers slide queue). Offered in the existing enemy-movement window (end of the opponent's movement phase, the Mork's Eye Pebble window). |
| SKV-RA-1 Warpstone-Laced Armour | (b) `skavenWarpstoneArmour` + (c) C2 | Regiment ability, `timing { kind: 'reaction', trigger: 'opponentDeclaredAttack' }`, `limit oncePerBattle`. `canUse` = the declared attack's targets include a friendly unit with `isDatasheet(…, 'stormfiends')`. Resolve: `effectService.grant(ctx, stormfiends, { feelNoPain: 5 }, { scope: { who: 'self' }, duration: 'untilEndOfTurn' })`. |
| SKV-AB-3 Shock Gauntlets (D6 hits per crit) | (a) + (c) C3 | Weapon data `abilities: [{ ability: 'CRIT_2_HITS', value: 'D6' }]` once C3 lands. |
| SKV-AB-5 Warp Lightning Blast | (a) + (c) C4 | Weapon data `abilities: [{ ability: 'HIT_MORTAL', value: 1 }]`, placeholders `wound: 6, rend: 0, D: 1` (never read; UI prints "see ability" for a HIT_MORTAL weapon). "Same unit for every attack in a phase": the shooting phase already gives each declaration one target unit, and the Cannon has one model with one ranged weapon, so this holds without code. approximation: a second shot in the same phase (only possible through a card) is not forced onto the first target. |

**Engine changes (c):**
- **C1 normal-move slide** (`factions/aos-moves.ts`): `SlideOpts` gains `normalMove?: boolean`. `checkSlide` with
  `normalMove` rejects a slide whose swept path (each model's straight segment, base radius + 3") comes within any enemy
  model's combat range at any point, and implies `mayNotEndInCombat`. `slideOptions` forwards it. approximation: the move is
  a rigid slide from the engine's short heading list (as every out-of-phase move in the game), not a free-form Normal Move.
- **C2 opponent attack reaction** (`abilities.ts`, `phases/shooting.ts`, `phases/fight.ts`, `declared.ts`):
  `ReactionTrigger` gains `{ kind: 'opponentDeclaredAttack'; unitId: UnitId; phase: 'shooting' | 'fight'; targetUnitIds:
  UnitId[] }`; new `AbilityWindow` `'attackTargeted'`; `timingMatches` lets reaction descriptors `{ trigger:
  'opponentDeclaredAttack' }` (already in `AbilityTiming`) match only that window. `DeclaredAttack` (readDeclaredAttack)
  gains `targetUnitIds?: UnitId[]`. shooting.ts `doResolve` calls `runReactionWindow(ctx, opponent(player), { kind:
  'opponentDeclaredAttack', … }, \`sht:${unitId}\`)` right after the existing youDeclared window (targets are known there);
  fight.ts calls it after `doDeclareTargets` and before `doAttacks`. Export `readDeclaredAttack(state)` already exists; hooks
  read `targetUnitIds` from it.
- **C3 crit hit count** (`src/data/types.ts` comment + `attack.ts`): `CRIT_2_HITS` reads an optional `value: DiceExpr`
  = the number of hits a critical hit scores (default 2). In `attack.ts` the `copies` for a critical hit become
  `rollExpr(value)` (one roll per critical hit, purpose `'ability'`, attacker's roll); `HitRolled.extraHits` = copies − 1.
  Weapon label "Crit (D6 Hits)". Data schema (`common.schema.json`) already allows `value` on a weapon ability.
- **C4 hit = mortal** (`src/data/types.ts` `WeaponAbilityName` + `attack.ts` + schema enum): new `'HIT_MORTAL'` (value =
  mortal damage per hit, default 1). In the hit stage loop, every successful hit (critical or not) adds `value` mortal
  damage to the pool (`addToPool(..., true, ...)`, as `CRIT_MORTAL` does for crits) and is not passed to the wound stage.
  Additive: no existing weapon has it.

None of C1–C4 touches the frozen contracts in `src/engine/{types,actions,events,hooks,rng,decider,index}.ts`; C3/C4
change `src/data/types.ts` and need a note in `docs/spec/13-engine-port-plan.md`.

---

## 8. Engine notes

1. **Wizard budget:** Wither and Skitterleap share the Grey Seer's single cast per hero phase (magic.ts counts attempts).
   A failed Skitterleap still spends it.
2. **Skitterleap and the Cannon screen:** the redeploy spot validator already enforces "more than 6" from enemies"; the
   general keeps its wounds and effects. The card bars Move abilities only in the following **movement phase** (Normal
   Move, Run, Retreat). [RULING] it may still charge in the charge phase of that turn, because the card names the movement
   phase only. `Unit.setUpTurn` (set by `markSetUp`) is read only by `phases/movement.ts`, not by charge.ts, so `markSetUp:
   true` gives exactly this.
3. **Scurry Away timing:** the general's player may use it at any point they can act in a combat phase; the AI uses it
   at the start of the combat phase when the general is in combat with a unit that could kill it (enemy melee damage
   estimate ≥ remaining Health) and otherwise keeps it.
4. **Strike-last vs. strike-first:** a unit with both cancels out per core; `fight.ts` already resolves the pair.
5. **AI:** Always Three Clawsteps Ahead — move a Clanrats unit onto or toward the nearest objective it does not contest,
   else move the Cannon to a spot that gains line of sight; Warpstone-Laced Armour — use against the first attack whose
   expected damage on the Stormfiends is ≥ 6; Will of the Horned Rat — the friendly unit contesting the most closely
   contested objective; Wither — the enemy unit with the fewest wounds left within range (a kill), else the Hero;
   Skitterleap — only when the Grey Seer is in combat or within 6" of an enemy that can charge it and a safe spot exists
   (never with Wither available on a kill); Cage of Warp Lightning — first combat phase where an enemy unit within 6" of
   the general is in combat with a friendly unit and has not fought; Seething Swarm — always (no downside).
6. **Ward sources:** Skilled Manipulator (4+ near Clanrats, general only), Warpstone-Laced Armour (5+, Stormfiends, one
   turn). Nothing else.
7. **Defaults for the sim:** regiment Endless Swarm of Rats and enhancement Skilled Manipulator (both passive, playable
   with no engine change); variant games Warpstone-Laced Armour and Cage of Warp Lightning.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| SKV-ARMY-1 | Warpspark Clawpack builds: Grey Seer general + Stormfiends + Warp Lightning Cannon + 2×10 Clanrats, 25 models, stats as §5. |
| SKV-ARMY-2 | Stormfiends have one Shock Gauntlets, one Windlaunchers + Clubbing Blows, one Ratling Cannons + Clubbing Blows model. |
| SKV-ARMY-3 | Reinforcements only on both Clanrats units; Grey Seer, Stormfiends and Cannon never offered for replacement. |
| SKV-BT-1 | Always Three Clawsteps Ahead: offered once in the enemy movement phase, never in your own; a unit in combat cannot be picked. |
| SKV-BT-2 | The move is up to the unit's Move, never passes through or ends inside an enemy combat range. |
| SKV-RA-1 | Warpstone-Laced Armour: offered only when an enemy attack targets the Stormfiends; Ward 5+ until end of turn; once per battle. |
| SKV-RA-2 | Endless Swarm of Rats: Seething Swarm returns D6 instead of D3. |
| SKV-ENH-1 | Skilled Manipulator: Ward 4+ only while within 1" of a friendly Clanrats unit; none otherwise. |
| SKV-ENH-2 | Skitterleap: casting 6+ sets the general up more than 6" from all enemies; it cannot use Move abilities that movement phase; shares the one cast with Wither. |
| SKV-ENH-3 | Scurry Away: 3+ lets the general Retreat in a combat phase with no mortal damage; 1–2 nothing; needs the general in combat. |
| SKV-ENH-4 | Cage of Warp Lightning: 2+ gives a visible enemy within 6" Strike-last; a 1 deals 1 mortal to the general; once per battle. |
| SKV-AB-1 | Will of the Horned Rat: 3+ adds the rolled number once to the target's control score until your next turn; 1–2 nothing; wholly within 13". |
| SKV-AB-2 | Wither: casting 6+ deals D3 mortal to a visible enemy within 13"; can be unbound. |
| SKV-AB-3 | Shock Gauntlets: each critical hit becomes D6 hits, each rolling to wound. |
| SKV-AB-4 | Seething Swarm: end of any turn returns up to D3 slain models, never above starting strength; works in combat. |
| SKV-AB-5 | Warp Lightning Blast: each hit deals 1 mortal damage with no wound or save roll; the target's ward still rolls. |
| SKV-WEAP-1 | Ratling Cannons roll 3D6 attacks; Windlaunchers deal D3; Crew's Teeth and Knives roll D6 attacks. |
| SKV-WEAP-2 | No Skaven ranged weapon in this army can shoot while its unit is in combat. |
| SKV-MAG-1 | The Grey Seer attempts at most one spell per hero phase and may unbind one enemy spell. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own under-city livery): grubby brown and grey fur, pink tails and noses, rusty iron and
tarnished bronze, frayed dirty-green and bone-white rags, glowing sickly-green "warp" crystals and sparks as the accent
colour. Shared motif: an original three-scratch claw mark painted on cloth and plates. No GW logos, no copied Skaven
clan icons or the horned-rat sigil. All figures are **true MGSD** chibis (~2.5 heads tall, huge head, stubby legs, big
hands and feet); the Cannon is a chunky toy-like SD war machine.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `skv-grey-seer` | Grey Seer | 1 | 32 round | No | A true MGSD chibi rat-sorcerer, 2.5 heads tall with an enormous pale-white rat head, big curling ram horns, glowing green eyes and a sly grin, stubby legs under a tattered grey robe, holding a crooked staff topped with a glowing green crystal and a tiny swinging bell. |
| `skv-clanrat` | Clanrats | 1 (×20) | 25 round | No | A true MGSD chibi ratman foot-soldier, 2.5 heads tall with a huge brown rat head, buck teeth and twitchy whiskers, a dented rusty helmet, stubby legs, a long pink tail, a patched round wooden shield and a notched rusty short sword. |
| `skv-stormfiend-gauntlets` | Stormfiends (Shock Gauntlets) | 1 | 60 round | No | A chunky MGSD chibi hulking rat-brute, 2.5 heads tall with a giant rat head, a tiny shrivelled rat rider wired to its back, stubby legs, bronze armour plates and two oversized bronze fists crackling with green lightning coils. |
| `skv-stormfiend-windlaunchers` | Stormfiends (Windlaunchers) | 1 | 60 round | No | The same chunky MGSD rat-brute with a little wired rat rider, carrying twin stubby mortar tubes on its forearms loaded with glowing green glass gas-globes, a heavy iron club-weight on its tail. |
| `skv-stormfiend-ratling` | Stormfiends (Ratling Cannons) | 1 | 60 round | No | The same chunky MGSD rat-brute with a little wired rat rider, both arms replaced by oversized spinning multi-barrel bronze guns with ammo drums and green muzzle glow. |
| `skv-warp-lightning-cannon` | Warp Lightning Cannon | 1 | 120×92 oval | War machine | A chunky toy-like SD war machine: a stubby wooden-and-iron cart on big wobbly wheels carrying a fat bronze cannon with a cracked glowing green crystal in a cage at its breech and copper coils sparking green lightning, two tiny MGSD chibi rat crew (one cranking, one cowering) riding along. |

Each Stormfiend gets its own figure because its weapons differ in the rules. Clanrats use one figure for all 20 models: the
Spearhead gives no champion, standard or musician rules, so no variants. Gnawfeast figures (Appendix A) are listed there.

---

## 11. Implementation notes

Not built yet. Planned files: data `src/data/factions/skaven/` (faction.json, datasheets/{grey-seer, stormfiends,
warp-lightning-cannon, clanrats}.json, weapons.json, abilities.json, enhancements.json, patrols/warpspark-clawpack.json),
hooks `src/engine/factions/skaven.ts` (`...skavenHooks` in `code-hooks.ts`), tests `tests/engine/skaven.test.ts` and
`tests/data/skaven.test.ts` (one test per SKV- id). Patrol `battleTraits: ['skaven.ability.always-three-clawsteps-ahead']`,
regiment list Endless Swarm (default) then Warpstone-Laced Armour, enhancement list Skilled Manipulator (default),
Skitterleap, Scurry Away, Cage of Warp Lightning. Figure mapping keys `<datasheet id>/<modelId>`.

---

## Appendix A — Gnawfeast Clawpack (same PDF, pages 1–8; out of scope)

Army id if ever built: `skaven.army.gnawfeast-clawpack`. General: **Clawlord on Gnaw-beast**. Units: 1 Grey Seer (as §5.1,
identical warscroll), 1 Warlock Engineer, 2×10 Clanrats (as §5.4), 3 Rat Ogors. 17 models.

**Battle traits.**
- `GNF-BT-1` The Lurking Vermintide — once per battle, deployment phase (Deploy): pick a friendly unit not yet deployed; it
  goes into reserve "in the tunnels". Any unit still in the tunnels at the end of battle round 3 that has not used Gnawhole
  Ambush is destroyed.
- `GNF-BT-2` Gnawhole Ambush — your movement phase (Core): pick a friendly unit in the tunnels and set it up wholly within
  6" of **a corner of the battlefield** and more than 9" from every enemy unit. (Reuse the Ironjawz/Fyreslayers reserve
  arrival; new: corner-anchored region = 6" quarter-circle per corner.)

**Regiment abilities.** `GNF-RA-1` Warpstone-Laced Bullets — once per battle, your shooting phase: pick one ranged weapon a
friendly unit carries; it has Crit (Mortal) for the phase. `GNF-RA-2` Too Quick to Hit-Hit — passive: friendly units take
no mortal damage for Retreating (army-wide `noRetreatDamage`).

**Enhancements.** Warpstone Charm (passive: −1 to save rolls of enemy units in combat with the general); Skryre
Connections (passive: the general's Ratling Pistol has Attacks 2D6 instead of D6); Cloak of Stitched Victories (passive:
the general has Ward 5+, replacing the printed 6+); Lead the Seething Horde (reaction: you declared Call for
Reinforcements; the replacement may instead be set up wholly within 13" of the general and not in combat).

**Warscrolls.**

| Unit | Move | Health | Save | Control | Ward | Keywords | Base (mm) |
|---|---|---|---|---|---|---|---|
| Clawlord on Gnaw-beast (General) | 9" | 7 | 4+ | 2 | 6+ | Hero, Cavalry | 75×42 oval |
| Warlock Engineer | 6" | 5 | 5+ | 2 | — | Hero, Infantry | 32 round |
| Rat Ogors (2 melee + 1 Warpfire Gun) | 6" | 4 | 5+ | 1 | — | Infantry | 50 round |

| Weapon | Unit | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|---|
| Ratling Pistol | Clawlord | Ranged | 10" | D6 | 3+ | 3+ | 1 | 1 | Crit (Auto-wound), Shoot in Combat |
| Warpforged Halberd | Clawlord | Melee | — | 5 | 3+ | 4+ | 1 | 2 | — |
| Gnaw-beast's Chisel Fangs | Clawlord | Melee | — | 4 | 4+ | 3+ | 1 | D3 | Companion |
| Warplock Musket | Warlock Engineer | Ranged | 24" | 2 | 3+ | 3+ | 2 | D3 | Crit (Auto-wound) |
| Warpforged Dagger | Warlock Engineer | Melee | — | 3 | 4+ | 4+ | — | 2 | — |
| Warpfire Gun | Rat Ogors (1 model) | Ranged | 10" | 2D6 | 2+ | 4+ | 2 | 1 | Shoot in Combat |
| Claws, Blades and Fangs | Rat Ogors (all) | Melee | — | 5 | 4+ | 3+ | 1 | 2 | — |

**Abilities.** Cornered Rat (Clawlord, passive: while damaged, Warpforged Halberd +3 Attacks). More-More Warp Energy!
(Warlock Engineer, reaction: you declared a Shoot ability for it and it has not used a Move ability this turn; roll a D6:
2+ the Musket's Damage becomes 3 for the phase, 1 = D3 mortal damage to the Engineer). Unleashed Warp-Fury (Rat Ogors, once
per battle, any combat phase: the unit suffers D3 mortal damage, then its melee weapons get +1 Attacks for the phase).
Grey Seer and Clanrats as §5.1 / §5.4.

**Figures (if built).** `skv-clawlord-gnawbeast` (1, 75×42 oval, mount: a chunky toy-like long-legged hairless rat-beast
with chisel teeth carrying a MGSD chibi armoured rat-warlord with a halberd and a stubby multi-barrel pistol);
`skv-warlock-engineer` (1, 32 round: MGSD chibi rat tinkerer with brass goggles, a backpack generator with green sparks and
a long musket); `skv-rat-ogor` (1 ×2, 50 round: chunky MGSD chibi rat-brute with blade-arms and stitched patches);
`skv-rat-ogor-warpfire` (1, 50 round: the same brute with a stubby flame cannon grafted to one arm, green fire at the nozzle).
