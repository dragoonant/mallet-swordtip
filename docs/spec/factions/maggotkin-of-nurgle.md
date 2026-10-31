# Maggotkin of Nurgle — Bleak Host (Spearhead)

Faction id: `nurgle` · Army id: `nurgle.army.bleak-host` · Grand alliance: Chaos.
Source: `docs/sources/spearhead-maggotkin-of-nurgle.pdf` (7 pages, 14.1 MB, gitignored), "Spearhead: Maggotkin of Nurgle –
Bleak Host", the free Warhammer Community download (Age of Sigmar, Spearhead category). Listed 2026-04-01 (PDF metadata:
created 2026-03-13), fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_01-04_aos_spearhead_maggotkin_of_nurgle_bleak_host-anonar5akg-es9llpugle.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/` with body
`{"index":"downloads_v2","searchTerm":"nurgle"}`). Base sizes are not printed in the PDF; they come from the Wahapedia aos4
warscroll pages (fetched the same day with plain curl, `https://wahapedia.ru/aos4/factions/maggotkin-of-nurgle/<Unit>`; the
Scrivener's page is `Spoilpox-Scrivener-Herald-of-Nurgle`).

**Which army.** Games Workshop publishes two Maggotkin Spearhead armies as two separate PDFs. **Bleak Host** (Spoilpox
Scrivener, 2 Pusgoyle Blightlords, 5 Putrid Blightkings, 2×5 Plaguebearers) is the army of the **Spearhead: Maggotkin of
Nurgle** box, so it is the army this spec builds. **Bubonic Cell** (Rotbringer Sorcerer, 2×3 Nurglings, Beast of Nurgle,
10 Rotmire Creed) is the second Spearhead from the battletome era, published as its own PDF
(`https://assets.warhammer-community.com/eng_23-09_aos_spearhead_maggotkin_of_nurgle_bubonic_cell-i5dbcdp8vl-aaeheqk1x1.pdf`,
first listed 2026-01-14, updated 2026-09-23, read 2026-10-30, not stored in `docs/sources/`). It is out of scope. Its rules
are recorded in Appendix A so it can be added later.

Mechanics and numbers are ported 1:1. All wording below is our own.

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within
combat range of an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`,
Combat phase = `fight`; Run = `advance`, Retreat = `fallBack`. Rend is stored as `rend` (data) / `AP`. Ward = `feelNoPain`.
Rule IDs `MON-*` double as test IDs (§9).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `nurgle.unit.spoilpox-scrivener` | Spoilpox Scrivener | 1 | **General** | no | 40 round (Wahapedia) |
| `nurgle.unit.pusgoyle-blightlord` (a) | Pusgoyle Blightlord | 1 | Unit | no | 60 round (Wahapedia) |
| `nurgle.unit.pusgoyle-blightlord` (b) | Pusgoyle Blightlord | 1 | Unit (reserve, MON-BT-1) | no | 60 round |
| `nurgle.unit.putrid-blightkings` | Putrid Blightkings | 5 | Unit | no | 40 round (Wahapedia) |
| `nurgle.unit.plaguebearers` (a) | Plaguebearers | 5 | Unit | no | 32 round (Wahapedia) |
| `nurgle.unit.plaguebearers` (b) | Plaguebearers | 5 | Unit (reserve, MON-BT-1) | no | 32 round |

Total: 6 units, 18 models. **No unit has the Reinforcements keyword**, so Call for Reinforcements is never offered to this
army. Both Blightlord units share one datasheet (patrol entries `pusgoyle-blightlord-1` / `-2`); both Plaguebearers units share
one datasheet (`plaguebearers-1` / `-2`). Every warscroll prints **Ward (5+)**. No Wizard, no Priest. The Blightlords are the
only **Fly** units. The Scrivener is the only Hero.

---

## 2. Battle traits

### MON-BT-1 `nurgle.ability.the-infectious-hosts` — The Infectious Hosts (+ `nurgle.ability.daemonic-summoning`)
- **Setup rule:** one Pusgoyle Blightlord unit and one Plaguebearers unit are **not set up** in the deployment phase. They
  start in reserve.
- **Granted ability: Daemonic Summoning.** Timing **your movement phase**, usable only from **battle round 3** onward.
  Keyword **Core**. Effect: set the unit up anywhere on the battlefield, every model **more than 6" from all enemy units**.
- Notes: identical in shape to Ironjawz 'Ere We Go, Seraphon Chameleon Ambush and Soulblight Swoop Down. RULING: core reserve
  destruction (CORE-4.14 / SPH-7.3) applies as for those armies: a unit still in reserve at the start of round 4 is
  destroyed, so in practice both arrive in round 3. A unit set up this way cannot use Move abilities later that phase
  (CORE-6.13). approximation: the card lets the player choose *which* Blightlord and *which* Plaguebearers unit wait; the
  two of each are identical, so the data fixes the second entry of each.

### MON-BT-2 `nurgle.ability.diseased` — Diseased
- **Timing:** Passive.
- **Effect:** Each time an attack made by a friendly model scores a **critical hit**, the army gains **1 disease point**.
  The pool is capped at **7**; points over the cap are lost.
- Notes: counts every crit die once (a crit that becomes 2 hits, or that turns into mortal damage through Crit (Mortal), is
  still one crit). Companion weapons count (counting a crit changes nothing about the weapon). Attacks with no hit roll
  score no crits. Crits in either player's turn count (a combat in the enemy turn feeds the pool too).

### MON-BT-3 `nurgle.ability.nurgles-embrace` — Nurgle's Embrace
- **Timing:** End of **any** turn (army ability, once per turn).
- **Effect:** Spend any number of disease points. For each point spent, pick an **enemy unit in combat with any friendly
  unit** and roll a D6; on **5+** that unit suffers **1 mortal damage**. The same enemy unit may be picked for several
  points.
- Notes: each point is its own pick-and-roll. Spending 0 is allowed (pass). Spent points leave the pool at once.

---

## 3. Regiment abilities (pick 1 at army selection)

### MON-RA-1 `nurgle.ability.locus-of-fecundity` — Locus of Fecundity
- **Timing:** Your hero phase, **once per phase** (army ability, so once in your hero phase).
- **Declare:** Pick a friendly unit (any range, on the battlefield).
- **Effect:** **Heal (D3)** that unit.

### MON-RA-2 `nurgle.ability.infested-with-wonders` — Infested with Wonders
- **Timing:** Passive.
- **Effect:** Each time a friendly model is **slain**, before it is removed, you may pick an **enemy unit within 1"** of that
  model and roll a D6; on **4+** that enemy unit suffers **1 mortal damage**.
- Notes: any cause of death counts (attacks, mortal damage, abilities). Distance is measured from the slain model's position
  at the moment it died. It is optional, but there is never a reason to refuse it.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `nurgle.enh.summoner-of-plaguebearers` | Summoner of Plaguebearers | End of any turn (once per turn, CORE-3.4) | Pick a friendly **Plaguebearers** unit **wholly within 14"** of the general and return **1 slain model** to it. |
| `nurgle.enh.gardener-of-nurgle` | Gardener of Nurgle | Your movement phase (no printed limit; once per phase, CORE-3.4) | Only if the general is **contesting an objective that no enemy model contests**: roll a D6. On **3+** that objective becomes **desecrated** for you. Friendly units have **Ward (4+)** while they contest a desecrated objective. The desecration ends the moment your **opponent gains control** of that objective. |
| `nurgle.enh.pestilent-breath` | Pestilent Breath | Your shooting phase (once per phase, CORE-3.4) | Pick an **enemy unit within 7"** of the general (no visibility needed) and roll a D6 **for each model** in it; each **5+** inflicts **1 mortal damage** on that unit. Not a Shoot ability: the general may still shoot with Disgusting Sneezes in the same phase. |
| `nurgle.enh.gift-of-febrile-frenzy` | Gift of Febrile Frenzy | **Once per battle**, any combat phase | Until the end of the phase, friendly units add **1 to the Attacks** of their **melee** weapons while they are **wholly within 7"** of the general (the general included). Companion weapons are not affected (CORE-12.4: the card does not name them). |

RULING (Gardener): an objective that becomes uncontrolled (nobody holds it) stays desecrated; only the opponent taking
control ends it. Several objectives can be desecrated over a battle. A desecrated objective helps only its owner.

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. Printed keywords only (Spearhead warscrolls print no faction keywords).
Warscroll stat blocks were checked against the rendered pages.

### 5.1 `nurgle.unit.spoilpox-scrivener` — Spoilpox Scrivener (General)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 5 | 5+ | 2 | 5+ |

Keywords: **Hero, Infantry, Ward (5+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Disgusting Sneezes (`nurgle.weapon.disgusting-sneezes`) | Ranged | 7" | D6 | 2+ | 4+ | — | 1 | Shoot in Combat |
| Distended Maw (`nurgle.weapon.distended-maw`) | Melee | — | 3 | 4+ | 3+ | 1 | 2 | — |

**MON-AB-1 `nurgle.ability.keep-counting` — Keep Counting, I'm Watching You**
- **Timing:** Your hero phase (once per phase for this unit, CORE-3.4).
- **Declare:** Pick a friendly **Plaguebearers** unit **wholly within 14"** of this unit.
- **Effect:** Choose one mode; it lasts **until the start of your next turn**:
  - **Tally of Blows:** +1 to the Attacks of the target's melee weapons.
  - **Recorded Stamina:** +1 to the target's save rolls.

### 5.2 `nurgle.unit.pusgoyle-blightlord` — Pusgoyle Blightlord (×2 units of 1)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 8 | 4+ | 2 | 5+ |

Keywords: **Cavalry, Fly, Ward (5+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Blighted Scythe (`nurgle.weapon.blighted-scythe`) | Melee | — | 3 | 3+ | 3+ | 2 | 1 | — |
| Rot Fly's Mouthparts and Sting (`nurgle.weapon.rot-fly-mouthparts`) | Melee | — | 6 | 4+ | 2+ | — | 1 | Companion |

**MON-AB-2 `nurgle.ability.wrack-and-ruin` — Wrack and Ruin**
- **Timing:** Any charge phase (once per phase for this unit, CORE-3.4).
- **Declare:** Only if this unit **charged this phase**: pick an **enemy unit within 1"** of it and roll a D6.
- **Effect:** On **2+**, the target suffers **D3 mortal damage**.

### 5.3 `nurgle.unit.putrid-blightkings` — Putrid Blightkings
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 3 | 3+ | 1 | 5+ |

Keywords: **Infantry, Ward (5+)**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Blighted Weapon (`nurgle.weapon.blighted-weapon`) | Melee | — | 4 | 3+ | 3+ | 1 | 1 | — |

Loadout: all 5 models carry a Blighted Weapon. No champion, standard or musician rules.

**MON-AB-3 `nurgle.ability.relentless-attackers` — Relentless Attackers**
- **Timing:** End of any turn (once per turn for this unit).
- **Declare:** Pick an enemy **Infantry** unit **in combat with this unit**. Roll a D6 for **each model of this unit that is
  within the target's combat range** (3" of any target model).
- **Effect:** Each roll **greater than the target's Health characteristic** inflicts **1 mortal damage** on the target.
- Notes: against Health 1 a 2+ scores, Health 2 a 3+, Health 3 a 4+ … Health 6 or more can never be hurt. The printed Health
  is used, not wounds left. Non-Infantry enemies (Cavalry, Monster, War Machine, Beast, Hero-only keyword sets without
  Infantry) cannot be picked.

### 5.4 `nurgle.unit.plaguebearers` — Plaguebearers (×2 units)
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 2 | 6+ | 1 | 5+ |

Keywords: **Infantry, Ward (5+)** (data adds the name keyword `PLAGUEBEARERS`, see §7)

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Plaguesword (`nurgle.weapon.plaguesword`) | Melee | — | 1 | 4+ | 3+ | — | 1 | Crit (Mortal) |

Loadout: all 5 models carry a Plaguesword. No champion, standard or musician rules.

**MON-AB-4 `nurgle.ability.cloud-of-flies` — Cloud of Flies**
- **Timing:** Passive.
- **Effect:** −1 to hit rolls for **shooting** attacks that target this unit. Melee attacks are unaffected.

---

## 6. Spells and prayers

None. No Wizard or Priest in the army; the Scrivener cannot unbind. Enemy spells resolve unopposed.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/nurgle/*.json`), at most reusing an existing code hook; (b) = new faction
code hook in `src/engine/factions/nurgle.ts`, exported as `nurgleHooks` and spread into `code-hooks.ts` like `skavenHooks`.
Shared helpers from `aos-common.ts`: `onBoard`, `whollyWithinUnit`, `unitGap`, `enemiesInCombat`, `inCombat`, `inflictMortal`,
`announce`, `paramOf`, `declaredRoll`, `healUnit`, `isDamaged`, `returnSlainModels`, `returnableModels`, `isDatasheet`,
`unitContestsObjective`, `playerContestsObjective`, `liveObjectives`. (c) = engine change outside the faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, printed Ward (5+) | (a) | Datasheets as the other armies: `stats.ward: 5` on every datasheet (Fyreslayers pattern); `HERO`, `INFANTRY`, `CAVALRY`, `FLY`. Base shapes `{ shape: 'round', mm }`. |
| Two Blightlords, two Plaguebearers | (a) | One datasheet each, two patrol entries each (`size: 1` / `size: 5`). No `REINFORCEMENTS` keyword anywhere, so core `spearheadCallForReinforcements` offers nothing. |
| Name keyword `PLAGUEBEARERS` | (a) | Add `"PLAGUEBEARERS"` to the Plaguebearers datasheet `keywords` so Keep Counting and Summoner of Plaguebearers can filter by keyword (invisible to players, changes no other rule). |
| Weapons: Shoot in Combat, Companion, Crit (Mortal) | (a) | `SHOOT_IN_COMBAT` (Disgusting Sneezes), `COMPANION` (Rot Fly), `CRIT_MORTAL` (Plaguesword); D6 attacks as a dice expression. |
| MON-AB-4 Cloud of Flies | (a) | Passive, scope self, `effect { stealth: true }` (exactly Slaves Swift Attackers; `hooks-impl.ts` maps `stealth` to −1 hit for ranged attacks only). |
| MON-BT-1 Infectious Hosts / Daemonic Summoning | (a) | Exactly 'Ere We Go / Swoop Down: passive `the-infectious-hosts` marker in `battleTraits` (text only) + activated `daemonic-summoning` (`phase movement / your`, `keywords ['CORE']`, `fromRound: 3`, `params { fromRound: 3, minEnemyDistance: 6, anywhere: true }`); patrol entries `pusgoyle-blightlord-2` and `plaguebearers-2` carry `reserve: { ability: 'nurgle.ability.daemonic-summoning' }`. Movement's reserve-arrival step and the round-4 reserve destruction do the rest. |
| MON-BT-2 Diseased | (b) `nurgleDiseased` + (c) C1 | Passive battle trait descriptor with the code. `onOwnCriticalHits(ctx, { ability, unitId, count })` (C1) adds `count` to `mission.custom.mnDisease[player]`, capped at `params.max` (7), and emits `AbilityTriggered` "Diseased: +n disease points (now x/7)" when the total changes. Helper `diseasePoints(state, player)` exported for the other hooks and the client. |
| MON-BT-3 Nurgle's Embrace | (b) `nurgleEmbrace` | Army ability, `timing endOfTurn / any`, `limit oncePerTurnArmy`, no declare. `canUse` = `diseasePoints ≥ 1` and some enemy unit on board is in combat with a friendly unit. Resolve: raise a `chooseOption` (topic `abilityChoice`, `context.data.code: 'nurgleEmbrace'`; `hooks-impl.ts` hands a decision whose data names a code hook to that hook's `answer`, the Resonant Focus route; check the reducer routes the topic to the hook service, else use `pick`) listing every eligible enemy unit plus "Stop"; `answer` spends 1 point, rolls the D6 (purpose `'ability'`), on 5+ `inflictMortal(…, 1)`, then re-raises the same choice while points remain and a target exists (targets re-read each time: a unit wiped by an earlier point drops out). |
| MON-RA-1 Locus of Fecundity | (b) `nurgleLocusOfFecundity` | Regiment ability (army), `timing phase command / your`, `limit oncePerTurnArmy`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { heal: 'D3' }`. Targets = friendly units on board that `isDamaged`. Resolve: `healUnit(ctx, target, rollExpr('D3'), abilityId)` (same body as `citiesFlask` with a free target). |
| MON-RA-2 Infested with Wonders | (b) `nurgleInfestedWithWonders` | Passive regiment descriptor with the code; `onOwnModelSlain` (attack.ts already dispatches it for the player's regiment ability, with the model snapshot at death) = the Gloomspite Frazzleboom shape: enemy units with a live model within `params.range` (1") of the snapshot, auto-pick the one with the fewest wounds left (ties: unit id), roll D6 `succeedOn 4`, 1 mortal. Inside an attack sequence the mortal waits for `deferMortalAfterFight` (as Frazzleboom), else `inflictMortal` at once. approximation: the engine picks the enemy unit (the player is not asked per slain model). |
| MON-ENH Summoner of Plaguebearers | (b) `nurgleSummoner` | Enhancement, `timing endOfTurn / any`, `limit oncePerTurn`, `declare [{ role: 'unit', owner: 'friendly' }]`, `params { range: 14, keyword: 'PLAGUEBEARERS', returnModels: 1 }`. Targets = friendly units with the keyword, `whollyWithinUnit(t, general, 14)` and `returnableModels > 0`. Resolve: `returnSlainModels(ctx, target, 1, abilityId)` (the `citiesBrazier` body with a fixed 1). |
| MON-ENH Gardener of Nurgle | (b) `nurgleGardener` | Enhancement, `timing phase movement / your`, `roll { dice: 'D6', succeedOn: 3 }`. `canUse` = some live objective the general `unitContestsObjective` and the opponent does not `playerContestsObjective`. Resolve: `mission.custom.mnDesecrated = { …, [objId]: player }` (AI / default: the first such objective not already desecrated), then grant a battle-long `{ feelNoPain: 4 }` effect to every friendly unit, `gateEffect` = holder contests an objective desecrated for its player. `ensureEffects` drops entries whose objective `controller` is now the opponent (unlike Cities `consecratedFor`, an uncontrolled objective stays desecrated). Same skeleton as `citiesConsecrateTheLand`, own ledger. The engine takes the best ward, so 4+ replaces the printed 5+ while it applies. |
| MON-ENH Pestilent Breath | (b) `nurglePestilentBreath` | Enhancement, `timing phase shooting / your`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params { range: 7, succeedOn: 5 }`. Targets = enemy units on board within 7" (`unitGap`) of the general; no visibility. Resolve: roll `liveModels(target).length` D6 in one roll, count ≥ 5, `inflictMortal(ctx, use, target, n)` when n > 0. Offered in the shooting window before or after the general's own shooting (not a Shoot ability, so it does not use up the unit's shooting). |
| MON-ENH Gift of Febrile Frenzy | (b) `nurgleFebrileFrenzy` | Enhancement, `timing phase fight / any`, `limit oncePerBattle`, no declare. Resolve: `effectService.grant(ctx, general, { when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } }, { scope: { who: 'friendly', within: 7, wholly: true }, duration: 'untilEndOfPhase' })` (the Gloomspite / Fyreslayers aura-grant pattern; the scope is evaluated at each attack, so units that move into or out of 7" during the phase gain or lose it; no `affectsCompanion`, so the Rot Fly is excluded). Offered in the start-of-combat window (before the first fight pick) and between fight activations. |
| MON-AB-1 Keep Counting, I'm Watching You | (b) `nurgleKeepCounting` | `timing phase command / your`, `declare [{ role: 'unit', owner: 'friendly' }]`, `modes [{ id: 'tally-of-blows' }, { id: 'recorded-stamina' }]`, `params { range: 14, keyword: 'PLAGUEBEARERS' }`. Targets = friendly units with the keyword `whollyWithinUnit(t, self, 14)`. Resolve: grant to the target, scope self, `duration 'untilNextTurn'`: tally = `{ when: { weaponType: 'melee' }, modifyStat: { stat: 'A', value: 1 } }`; stamina = `{ modifyRoll: { roll: 'save', value: 1 } }` (the Cities Decisive Commander modes shape). |
| MON-AB-2 Wrack and Ruin | (b) `nurgleWrackAndRuin` | `timing phase charge / any`, `roll { dice: 'D6', succeedOn: 2 }`, `declare [{ role: 'unit', owner: 'enemy' }]`, `params { range: 1, damage: 'D3' }`. `canUse` = `turn.chargedThisTurn` (this phase = the charge phase it charged in). Targets = enemy units with `unitGap ≤ 1` (not the whole 3" combat range, which is why `citiesDevastatingCharge` is not reused as-is). Resolve: `inflictMortal(ctx, use, target, rollExpr('D3'))`. |
| MON-AB-3 Relentless Attackers | (b) `nurgleRelentlessAttackers` | `timing endOfTurn / any`, `limit oncePerTurn`, `declare [{ role: 'unit', owner: 'enemy' }]`. Targets = `enemiesInCombat(self)` with keyword `INFANTRY`. Resolve: `n` = models of self with any target model within 3" (base to base); roll `n` D6 in one roll; `h` = the target datasheet's Health characteristic (`stats.W`, printed, not modified); mortal = count of dice > `h`; `inflictMortal` when > 0. `canUse` false when no target or `h ≥ 6`. |
| Disease point readout | (c) C2 | Client only, see below. |

**Engine changes (c):**
- **C1 critical-hit dispatch** (`src/engine/code-hooks.ts`, `src/engine/attack.ts`): `EngineCodeHook` gains
  `onOwnCriticalHits?(ctx: EngineContext, info: { ability: RuntimeAbility; unitId: UnitId; weaponId: WeaponId; count: number }): void`.
  In the hit stage of `attack.ts`, right after the `HitRolled` events for one weapon group are emitted, compute
  `count = st.outs.filter((o) => o.success && o.critical).length` and, when `count > 0`, call it for
  `ownAbilityCodes(state, attackerUnit)` (the attacking unit's datasheet abilities plus its player's battle traits and regiment
  ability, the same set `onOwnModelSlain` uses). One call per weapon group per attack sequence. HIT_MORTAL weapons and
  auto-hit groups produce no call (they roll no hit dice). Additive; no frozen-contract change (`code-hooks.ts` is not frozen).
- **C2 disease point readout** (`src/client/…` HUD, owner of the HUD file): show "Disease 3/7" beside the player's command
  points while the player's army has the `nurgle.ability.diseased` battle trait, reading `mission.custom.mnDisease[player]`
  through the exported `diseasePoints(state, player)`. Hover help via the shared styled `Tooltip.tsx` (no `title=`). Nurgle's
  Embrace's option list shows the remaining points in its prompt text.

Neither change touches `src/engine/{types,actions,events,hooks,rng,decider,index}.ts` or `src/data/types.ts`. C1 needs a line in
`docs/spec/13-engine-port-plan.md` (a new §3.x row: `onOwnCriticalHits`, for MON-BT-2).

---

## 8. Engine notes

1. **Disease ledger:** `mission.custom.mnDisease: Record<PlayerId, number>` (kept in `mission.custom` so the frozen `GameState`
   type is unchanged, as `consecrated` / `fyrRunes`). Starts at 0, never above 7, never below 0. It survives saves (the whole
   state is serialised).
2. **Ward sources:** printed Ward (5+) on every unit; Gardener of Nurgle 4+ while contesting a desecrated objective. The best
   ward wins (`attack.ts wardThreshold`); they never stack.
3. **Reserves:** 2 of 6 units (one Blightlord, one Plaguebearers) start off the table, so rounds 1–2 are played with
   the Scrivener, a Blightlord, the Blightkings and 5 Plaguebearers. Summoner of Plaguebearers and Keep Counting cannot
   target the reserve Plaguebearers until they arrive (`location !== 'board'`).
4. **Relentless Attackers and Infested with Wonders in one end of turn:** order is the active player's abilities first
   (CORE end-of-turn ordering, as the other armies). A Blightking killed by an enemy end-of-turn ability still triggers
   Infested with Wonders.
5. **Diseased timing:** points from the crits of an attack sequence are in the pool before that sequence ends, so Nurgle's
   Embrace at the end of the same turn can spend them.
6. **Gift of Febrile Frenzy** is a phase-long aura: a Blightlord whose model ends a pile-in outside 7" loses the bonus for
   its own activation. The Scrivener counts itself.
7. **AI:** Daemonic Summoning — arrive in round 3 (forced by the round-4 destruction), each unit at the legal spot nearest the
   objective with the closest contest; Diseased — automatic; Nurgle's Embrace — spend every point each end of turn while a
   target exists, each point on the eligible enemy unit with the fewest wounds left (a kill), else the enemy Hero, else the
   enemy unit in combat with the most friendly models; Locus of Fecundity — the damaged friendly unit with the most damage
   points, Blightlords before others when tied; Infested with Wonders — automatic; Summoner — always when legal, the unit
   with the most slain models; Gardener — always when legal, on the objective nearest the board centre; Pestilent Breath —
   the in-range enemy unit with the most models; Gift of Febrile Frenzy — the first combat phase in which at least two
   friendly units wholly within 7" of the general are in combat; Keep Counting — Tally of Blows when the target is in combat
   or within 12" of an enemy unit, else Recorded Stamina; Wrack and Ruin — always, the target with the fewest wounds left;
   Relentless Attackers — always when legal, the target with the lowest Health and then the most Blightkings in range.
8. **Defaults for the sim:** regiment Infested with Wonders (passive, no decisions) and enhancement Pestilent Breath; variant
   games Locus of Fecundity and Gardener of Nurgle.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| MON-ARMY-1 | Bleak Host builds: Spoilpox Scrivener general + 2×1 Pusgoyle Blightlord + 5 Putrid Blightkings + 2×5 Plaguebearers, 18 models, stats as §5, every unit Ward 5+. |
| MON-ARMY-2 | No unit is offered Call for Reinforcements (no Reinforcements keyword in the army). |
| MON-BT-1 | Infectious Hosts: the second Blightlord and second Plaguebearers start in reserve; Daemonic Summoning is offered only in your movement phase from round 3, places every model more than 6" from all enemies, and a unit still in reserve at the start of round 4 is destroyed. |
| MON-BT-2 | Diseased: each critical hit by a friendly attack adds 1 disease point (Crit (Mortal) and Companion crits included, in either player's turn); the pool never exceeds 7. |
| MON-BT-3 | Nurgle's Embrace: end of any turn, each spent point rolls a D6 against an enemy unit in combat with a friendly unit, 5+ = 1 mortal; points are deducted; not offered with 0 points or no eligible target; once per turn. |
| MON-RA-1 | Locus of Fecundity: your hero phase, heals D3 on any damaged friendly unit; once per hero phase; never returns slain models. |
| MON-RA-2 | Infested with Wonders: a slain friendly model rolls against an enemy unit within 1" of where it died, 4+ = 1 mortal; no enemy within 1" = nothing; works for a unit's last model. |
| MON-ENH-1 | Summoner of Plaguebearers: end of any turn returns 1 slain model to a Plaguebearers unit wholly within 14" of the general; not offered when none is missing a model or in range. |
| MON-ENH-2 | Gardener of Nurgle: needs the general on an objective no enemy contests; 3+ desecrates it; friendly units contesting it have Ward 4+; the opponent gaining control ends it; an uncontrolled objective stays desecrated. |
| MON-ENH-3 | Pestilent Breath: your shooting phase, one D6 per model of an enemy unit within 7" of the general, each 5+ = 1 mortal; no line of sight needed; the general may still shoot. |
| MON-ENH-4 | Gift of Febrile Frenzy: once per battle in a combat phase, melee weapons of friendly units wholly within 7" of the general get +1 Attacks until the phase ends; Companion weapons (Rot Fly) do not. |
| MON-AB-1 | Keep Counting: a Plaguebearers unit wholly within 14" gets +1 melee Attacks or +1 to save rolls until the start of your next turn; other units cannot be picked. |
| MON-AB-2 | Wrack and Ruin: only in the charge phase the Blightlord charged in, against an enemy within 1"; 2+ = D3 mortal. |
| MON-AB-3 | Relentless Attackers: end of any turn, one die per Blightking within 3" of an enemy Infantry unit in combat; each die above the target's Health characteristic = 1 mortal; non-Infantry targets are refused. |
| MON-AB-4 | Cloud of Flies: −1 to hit for shooting attacks against Plaguebearers; melee attacks unchanged. |
| MON-WEAP-1 | Disgusting Sneezes roll D6 attacks, hit on 2+ and can shoot while the Scrivener is in combat. |
| MON-WEAP-2 | Plaguesword crits become 1 mortal damage each (Crit (Mortal)) and still feed Diseased. |
| MON-WEAP-3 | Rot Fly's Mouthparts and Sting is a Companion weapon: unaffected by Gift of Febrile Frenzy and other friendly characteristic boosts. |
| MON-AI-1 | The AI arrives with both reserve units in round 3 and spends all disease points at the end of each turn when a target exists. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own plague-garden livery): pallid olive and sickly yellow-green skin, rust-brown corroded
iron, verdigris-green bronze, cracked bone horns, dirty cream and mustard rags, with plum-purple and pink blisters as the
accent colour. Flies are fat, solid, cartoon-round bugs on short stalks (no see-through wings or haze). Shared motif: an
original drooping mushroom-cap shape and a small cracked iron bell on straps. No GW logos and no copy of the three-circle
plague-god sigil or any GW heraldry. All figures are **true MGSD** chibis (~2.5 heads tall, huge head, stubby legs, big hands
and feet); the Rot Fly mount is a chunky toy-like SD bug.

| Slug | Unit | Models needed | Base (mm) | Mount | Concept prompt |
|---|---|---|---|---|---|
| `mon-spoilpox-scrivener` | Spoilpox Scrivener | 1 | 40 round | No | A true MGSD chibi daemon bookkeeper, 2.5 heads tall with an enormous round pallid-green head, one bone horn, three small grumpy yellow eyes and a long trunk-like drooling snout, stubby legs under a round split belly, holding a huge unrolling parchment tally scroll and a quill, two solid fat flies orbiting on stalks. |
| `mon-pusgoyle-blightlord` | Pusgoyle Blightlord | 1 (×2) | 60 round | Yes (Rot Fly) | A chunky toy-like SD giant bloated fly with a fat round abdomen, big glossy red compound eyes, stubby legs, short opaque leathery wings and a curled stinger, ridden by a true MGSD chibi rotting knight with a huge single-horned rusty helm, a round belly, stubby legs, a long rusty scythe and a cracked iron bell hanging from the saddle. |
| `mon-putrid-blightking` | Putrid Blightkings | 1 (×5) | 40 round | No | A true MGSD chibi bloated plague warrior, 2.5 heads tall with an enormous horned rusty helm showing one glowing eye slit, a round pallid belly with a purple blister, stubby legs, verdigris armour plates and an oversized notched rusty cleaver-axe. |
| `mon-plaguebearer` | Plaguebearers | 1 (×10) | 32 round | No | A true MGSD chibi one-eyed daemon foot-soldier, 2.5 heads tall with a huge round sickly-green head, a single big yellow eye and a single bent horn, a toothy grin, a little pot belly, stubby legs and a long jagged rusty sword, one solid fat fly perched on its horn. |

The two Blightlords are the same figure (identical rules). Blightkings and Plaguebearers use one figure each: the Spearhead
gives no champion, standard or musician rules, so no variants. Bubonic Cell figures (Appendix A) are listed there.

---

## 11. Implementation notes

Built (F14). Data `src/data/factions/nurgle/` (faction.json, datasheets/{spoilpox-scrivener, pusgoyle-blightlord, putrid-blightkings,
plaguebearers}.json, weapons.json, abilities.json, enhancements.json, patrols/bleak-host.json); hooks `src/engine/factions/nurgle.ts`
(`...nurgleHooks` in `code-hooks.ts`); AI hints `nurgleAbilityTiming` / `nurgleTargetBonus` / `nurgleModeBonus`, wired in
`src/ai/utility.ts` beside the other armies; tests `tests/engine/nurgle.test.ts`, `tests/data/nurgle.test.ts`, one test per MON- id.
Patrol `battleTraits: ['nurgle.ability.the-infectious-hosts', 'nurgle.ability.diseased', 'nurgle.ability.nurgles-embrace']`, regiment
list Infested with Wonders (default) then Locus of Fecundity, enhancement list Pestilent Breath (default), Summoner of Plaguebearers,
Gardener of Nurgle, Gift of Febrile Frenzy. Figure mapping keys `<datasheet id>/<modelId>`; model ids `spoilpox-scrivener`,
`pusgoyle-blightlord`, `putrid-blightking`, `plaguebearer`.

As built, where it differs from or adds to §7:
- C1 (`onOwnCriticalHits`) and the C2 readout hook (`resourceReadout`, folded by `factionResources`) came from the engine-core stage
  (13-engine-port-plan §3.12). `nurgleDiseased` implements both; the HUD itself is client work, not done here.
- Nurgle's Embrace raises its question in the `turn.end.abilities` window as a `chooseOption` with topic `abilityChoice` and
  `data.code: 'nurgleEmbrace'`; `hookService.handler` hands the answer to the hook's `answer`, `pass` means "stop". Each option's
  `hint` is `{ value, unitId }` (a likely kill, then the enemy Hero, then the busiest fight) so the AI takes the best target.
  `embraceTargets(state, player)` is exported for tests and the client.
- Gardener of Nurgle is not offered for an objective that is already desecrated for the player (it would change nothing); the site it
  picks is the eligible one nearest the board centre. The ward effect carries the enhancement ability's own id, so a mirror match shares one
  `mnDesecrated` map (an objective is only ever desecrated for one player).
- Relentless Attackers refuses Infantry targets whose printed Health is 6 or more (its dice could never score), in the target list,
  not only in `canUse`. Printed Health is read from the datasheet model's `stats.W`.
- Infested with Wonders also triggers for models removed by the coherency check (the engine routes those through the same slain-model
  path); approximation: the engine picks the enemy unit (fewest wounds left, ties by unit id).
- Sim (`npm run sim -- --games 20 --seed 5 --ai --armies nurgle,<other>`, default regiment and enhancement on games 0-1 of each four, variants on
  games 2-3): vs Cities 15-4 (1 draw), Ironjawz 12-6 (2), Kharadron 17-3, Stormcast 17-3, Slaves 19-1; no violations.
  Nurgle wins easily because every warscroll prints Ward 5+; no tuning was done.

## Appendix A — Bubonic Cell (separate PDF; out of scope)

Army id if ever built: `nurgle.army.bubonic-cell`. General: **Rotbringer Sorcerer**. Units: 2×3 Nurglings, 1 Beast of Nurgle,
10 Rotmire Creed. 17 models. Source: the Bubonic Cell PDF named at the top (4 pages, 4.4 MB).

**Battle traits.**
- `BCL-BT-1` Cycle of Corruption — in battle round 1 roll a D6 to pick which Cycle ability is active (re-roll a 5 or 6);
  every later round the next one in the sequence replaces it: 1 Numberless Pests → 2 Plague of Misery → 3 Burgeoning Filth →
  4 Nauseous Revulsion → back to 1. All four are passive, keyword **Cycle**:
  - Numberless Pests: −1 to hit rolls for attacks that target friendly units.
  - Plague of Misery: enemy units within 6" of any friendly unit cannot use abilities that heal or return slain models.
  - Burgeoning Filth: −3 to the control scores of enemy units while they are in combat with any friendly unit.
  - Nauseous Revulsion: −1 to charge rolls for enemy units.

**Regiment abilities.** `BCL-RA-1` Corruption of the Land — once per turn (army), end of your turn: pick a terrain feature
and roll a D6 for each enemy unit within 3" of it; on 4+ that unit suffers D3 mortal damage. `BCL-RA-2` Putrefied Ground — once
per battle, enemy hero phase: for the rest of the turn enemy units have −1 Move and −1 to run rolls.

**Enhancements.** Unnatural Vitality (passive: the general has Ward 4+); Subcutaneous Suppuration (passive: −1 to wound rolls
for attacks that target the general); Gaseous Emanation (once per battle, any combat phase: an enemy unit within the general's
combat range has Strike-last for the rest of the turn); Overripe Death's Heads (your shooting phase: if the general is not in
combat, a visible enemy unit within 7" takes 1 mortal damage on a 4+).

**Warscrolls.**

| Unit | Move | Health | Save | Control | Ward | Keywords | Base (mm) |
|---|---|---|---|---|---|---|---|
| Rotbringer Sorcerer (General) | 4" | 6 | 5+ | 2 | 6+ | Hero, Wizard, Infantry | 32 round |
| Nurglings (×2 units of 3) | 4" | 4 | 6+ | 1 | 5+ | Beast | 40 round |
| Beast of Nurgle | 7" | 8 | 5+ | 1 | 5+ | Beast | 60 round |
| Rotmire Creed (10) | 5" | 1 | 6+ | 1 | 6+ | Infantry, Reinforcements | 25 / 28.5 / 32 round (Wahapedia lists the leader models on 32, two on 28.5, the rest on 25) |

| Weapon | Unit | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|---|
| Rotwood Staff | Rotbringer Sorcerer | Melee | — | 3 | 4+ | 3+ | 1 | D3 | — |
| Tiny Razor-Sharp Teeth | Nurglings | Melee | — | 5 | 5+ | 5+ | — | 1 | Crit (Auto-wound) |
| Filthy Claws and Slobbering Maw | Beast of Nurgle | Melee | — | 5 | 4+ | 3+ | 1 | D3 | Companion |
| Contagion Blowpipes | Rotmire Creed | Ranged | 12" | 2 | 4+ | 3+ | — | 1 | Crit (Auto-wound) |
| Bilewood Weapons | Rotmire Creed | Melee | — | 2 | 4+ | 4+ | — | 1 | — |

**Abilities.** Fleshy Abundance (Sorcerer, your hero phase, casting roll 2D6 needing 6+: a friendly unit wholly within 12"
gives −1 to wound rolls for attacks that target it until the start of your next turn; RULING if built: a spell, as Skaven
Wither). Endless Swarm (Nurglings, end of any turn: Heal (D3) this unit). Attention Seekers (Beast, any charge phase, if it
charged: pick an enemy unit in combat with it and roll a D3; on 2+ that unit suffers mortal damage equal to the roll).
Bilewood Stilts (Rotmire Creed, passive: no mortal damage for Retreating).

**Figures (if built).** `mon-rotbringer-sorcerer` (1, 32 round: MGSD chibi hooded plague mage with a huge cowled head, a
crooked rotwood staff sprouting mushrooms and a little cracked bell); `mon-nurglings` (1 ×6, 40 round: a chunky pile of three
or four tiny grinning green mites tumbling over each other, each one a ball-shaped head with stubby limbs); `mon-beast-of-nurgle`
(1, 60 round: a chunky toy-like giant happy slug with a wide drooling grin, stubby arms and a crown of solid pink tentacles);
`mon-rotmire-creed` (1 ×10, 25 round: MGSD chibi swamp cultist on short wooden stilts with a huge hooded head, mossy rags and a
long blowpipe).
