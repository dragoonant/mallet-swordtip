# Kharadron Overlords — Skyhammer Task Force (Spearhead)

Faction id: `kharadron` · Army id: `kharadron.army.skyhammer-task-force` · Grand alliance: Order.
Source: `docs/sources/spearhead-kharadron-overlords.pdf` (8 pages, gitignored), "Spearhead: Kharadron Overlords -
Skyhammer Task Force", the free Warhammer Community download (Age of Sigmar, Spearhead category) for the
**Spearhead: Kharadron Overlords** box (Arkanaut Frigate + Admiral + Arkanauts + Skywardens). Listed 2025-11-12,
fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_12-11_aos_spearhead_kharadron_overlords_skyhammer_task_force-juxkvk8zj2-scpnhbxwwv.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`).
Base sizes are not printed in the PDF; they come from the Wahapedia aos4 warscroll pages (fetched the same day).
Mechanics and numbers are ported 1:1; all wording below is our own. (The other Kharadron Spearhead, *Grundstok
Trailblazers* — Endrinmaster, Thunderers, Gunhauler, Endrinriggers — is a separate download built from older kits,
not this box; out of scope here.)

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within
combat range of an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`,
Combat phase = `fight`; Run = `advance`, Retreat = `fallBack`. Rend is stored as `AP` (negative = more Rend).
Rule IDs `KO-*` double as test IDs (§9).

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `kharadron.unit.arkanaut-admiral` | Arkanaut Admiral | 1 | **General** | no | 32 round (Wahapedia) |
| `kharadron.unit.arkanaut-company` (a) | Arkanaut Company (Skypike) | 5: 4 pistol + cutter, 1 Skypike | Unit | **yes** | 25 round (Wahapedia) |
| `kharadron.unit.arkanaut-company-gunners` (b) | Arkanaut Company (Gunners) | 5: 3 pistol + cutter, 1 Volley Gun + Gun Butt, 1 Light Skyhook + Gun Butt | Unit | **yes** | 25 round |
| `kharadron.unit.skywardens` | Skywardens | 3: 2 Vulcaniser Pistol + Skypike, 1 Volley Gun + Gun Butt | Unit | **yes** | 32 round, flying stand (Wahapedia) |
| `kharadron.unit.arkanaut-frigate` | Arkanaut Frigate | 1 | Unit | no | 120×92 oval, flying stand (Wahapedia) |

Total: 5 units, 15 models. Both Arkanaut Company units share one printed warscroll but differ in loadout. As shipped they are
two datasheet ids with identical stats and abilities (the engine fixes a unit's model counts from the datasheet defaults, and the
patrol `wargear` list only swaps weapons, so one datasheet cannot give 4+1 to one unit and 3+1+1 to the other); see §11. No Wizard or Priest. Only the Frigate and the Skywardens have **Fly**.

---

## 2. Battle trait

### KO-BT-1 `kharadron.ability.ply-the-skies` — Ply the Skies
- **Timing:** Reaction — you declared a **non-Charge Move** ability (Normal Move, Run, Retreat; also the
  Redeploy command if the engine lets the Frigate use it) for an **Arkanaut Frigate**.
- **Used by:** that Frigate. No once-per limit beyond one use per declared move.
- **Effect:** Pick 1 friendly **Infantry** unit that is **wholly within the Frigate's combat range (3")** and
  **not in combat**: it is **transported**. Lift it off the battlefield. When the Frigate finishes its move, set
  the unit up again **wholly within 3" of the Frigate** and **not in combat** (CORE-6.13: being set up, it can
  use no Move ability later in that movement phase).
- **Penalty:** a unit transported this turn cannot use **Charge** abilities this turn (KO-RA-1 lifts this).
- Notes: the Admiral, both Arkanaut Companies and the Skywardens are all Infantry and can ride. The Frigate's
  own Retreat still costs it D3 mortal damage (unless KO-RA-2) — the passenger takes none.

---

## 3. Regiment abilities (pick 1 at army selection)

### KO-RA-1 `kharadron.ability.assault-boat` — Assault Boat
- **Timing:** Once per battle, your movement phase.
- **Declare:** Pick a friendly unit that was **transported** (KO-BT-1) this turn.
- **Effect:** That unit may still use Charge abilities later this turn (cancels the Ply the Skies penalty).

### KO-RA-2 `kharadron.ability.disengage` — Disengage
- **Timing:** Once per battle, your movement phase.
- **Declare:** Pick a friendly Arkanaut Frigate.
- **Effect:** If it uses a **Retreat** ability this phase, it suffers no mortal damage for retreating and it
  may still use **Shoot** abilities later this turn.

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `kharadron.enh.masterwrought-armour` | Masterwrought Armour | Passive | The general has **Ward (6+)**. |
| `kharadron.enh.flask-of-vintage-gorogna` | Flask of Vintage Gorogna | Once per battle, any hero phase (yours or the enemy's) | **Heal (D6)** the general. |
| `kharadron.enh.no-reward-without-risk` | There's No Reward Without Risk | Once per battle, reaction: you declared a Charge for a unit **wholly within 12" of your general** | You may re-roll that unit's charge roll. |
| `kharadron.enh.leave-no-duardin-behind` | Leave No Duardin Behind | Once per battle, your hero phase | Declare: pick a friendly **Arkanaut Company** wholly within 12" of the general and roll 1 D6 per slain model of that unit. Effect: return 1 slain model per 4+. |

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. **No warscroll prints a Ward.** Printed keywords only
(Spearhead warscrolls print no faction keywords).

### 5.1 `kharadron.unit.arkanaut-admiral` — Arkanaut Admiral
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 6 | 3+ | 2 | — |

Keywords: **Hero, Infantry**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Masterwork Volley Pistol (`kharadron.weapon.masterwork-volley-pistol`) | Ranged | 10" | 3 | 3+ | 3+ | 1 | 2 | Shoot in Combat |
| Skalfhammer (`kharadron.weapon.skalfhammer`) | Melee | — | 3 | 3+ | 2+ | 1 | 3 | — |

**KO-AB-1 `kharadron.ability.always-take-what-you-are-owed` — Always Take What You Are Owed**
- **Timing:** Your hero phase (once per phase for this unit, CORE-3.4).
- **Declare:** Pick a friendly **Arkanaut Company** unit wholly within 12" of this unit.
- **Effect:** Roll a D6; add the result to the target's **control score** (the unit's total on an objective, CORE-17.4) until the
  start of your next turn. [fixed after checking the PDF: the printed text says control score, not the Control characteristic,
  so the bonus is added once per unit and not once per model.]

### 5.2 `kharadron.unit.arkanaut-company` — Arkanaut Company
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 4" | 1 | 4+ | 1 | — |

Keywords: **Infantry, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Privateer Pistol (`kharadron.weapon.privateer-pistol`) | Ranged | 10" | 2 | 4+ | 4+ | — | 1 | Shoot in Combat |
| Aethermatic Volley Gun (`kharadron.weapon.aethermatic-volley-gun`) | Ranged | 15" | 2D6 | 4+ | 4+ | — | 1 | — |
| Light Skyhook (`kharadron.weapon.light-skyhook`) | Ranged | 15" | 1 | 4+ | 3+ | 2 | D3 | — |
| Arkanaut Cutter (`kharadron.weapon.arkanaut-cutter`) | Melee | — | 2 | 4+ | 4+ | — | 1 | — |
| Gun Butt (`kharadron.weapon.gun-butt`) | Melee | — | 1 | 4+ | 5+ | — | 1 | — |
| Skypike (`kharadron.weapon.skypike`) | Melee | — | 2 | 3+ | 3+ | 1 | 2 | Crit (Mortal) |

Loadouts — unit (a): 4× Privateer Pistol + Arkanaut Cutter, 1× Skypike. Unit (b): 3× Privateer Pistol +
Arkanaut Cutter, 1× Aethermatic Volley Gun + Gun Butt, 1× Light Skyhook + Gun Butt.

**KO-AB-4 `kharadron.ability.glory-seekers` — Glory-Seekers**
- **Timing:** Passive.
- **Effect:** +1 to hit rolls for this unit's attacks (shooting and combat) that target an enemy unit
  **contesting an objective**. Capped with other hit modifiers at ±1.

### 5.3 `kharadron.unit.skywardens` — Skywardens
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 2 | 4+ | 1 | — |

Keywords: **Infantry, Fly, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Vulcaniser Pistol (`kharadron.weapon.vulcaniser-pistol`) | Ranged | 10" | 3 | 3+ | 3+ | 1 | 1 | Shoot in Combat |
| Aethermatic Volley Gun (shared id, §5.2) | Ranged | 15" | 2D6 | 4+ | 4+ | — | 1 | — |
| Skypike (shared id, §5.2) | Melee | — | 2 | 3+ | 3+ | 1 | 2 | Crit (Mortal) |
| Gun Butt (shared id, §5.2) | Melee | — | 1 | 4+ | 5+ | — | 1 | — |

Loadout: 2× Vulcaniser Pistol + Skypike, 1× Aethermatic Volley Gun + Gun Butt.

**KO-AB-2 `kharadron.ability.timed-charges` — Timed Charges**
- **Timing:** End of any turn (once per turn for this unit).
- **Declare:** Pick an enemy unit **in combat with this unit**, then roll a D6.
- **Effect:** On **2+**: the target suffers **1 mortal damage**, and this unit may **immediately Retreat**
  (move up to its Move, may cross enemy combat ranges, must end outside all of them) **without suffering the
  retreat mortal damage**. Retreating is optional. On a 1 nothing happens.

### 5.4 `kharadron.unit.arkanaut-frigate` — Arkanaut Frigate
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 15 | 3+ | 5 | — |

Keywords: **War Machine, Fly**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Heavy Skyhook (`kharadron.weapon.heavy-skyhook`) | Ranged | 24" | 2 (1 when Battle Damaged) | 4+ | 3+ | 2 | D6 | — |
| Aethershot Carbines (`kharadron.weapon.aethershot-carbines`) | Ranged | 12" | 4 | 3+ | 3+ | 1 | 2 | Shoot in Combat |
| Crew's Boarding Weapons (`kharadron.weapon.crews-boarding-weapons`) | Melee | — | 8 | 4+ | 4+ | — | 1 | — |

**KO-AB-5 `kharadron.ability.battle-damaged` — Battle Damaged**
- **Timing:** Passive.
- **Effect:** While this unit has **10 or more damage points** (5 or fewer Health left), its Heavy Skyhook has
  **Attacks 1**. Healing back above that restores Attacks 2.

**KO-AB-6 `kharadron.ability.bomb-racks` — Bomb Racks**
- **Timing:** Once per battle, your movement phase.
- **Declare:** Pick an enemy unit that this Frigate **passed across** (its base moved over any of that unit's
  models) during a move this phase, then roll a D6.
- **Effect:** On **2+**, the target suffers **D3 mortal damage**.

---

## 6. Spells and prayers

None. No Wizard or Priest, no lore.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/kharadron/*.json`), at most a bare-name hook; (b) = new
faction code hook in `src/engine/factions/kharadron.ts` (registered in `code-hooks.ts` as `...kharadronHooks`);
(c) = needs an engine change outside the faction file.

| Rule | Class | How |
|---|---|---|
| Stats, keywords, no printed Ward | (a) | Datasheets as the other four armies; `HERO`, `INFANTRY`, `FLY`, `WAR MACHINE`, `REINFORCEMENTS` keywords. |
| Two Arkanaut loadouts | (a) | [shipped as two datasheets, see §11] One datasheet with model variants (`arkanaut`, `arkanaut-skypike`, `arkanaut-volley`, `arkanaut-skyhook`); the patrol's two `arkanaut-company` entries pick counts through `PatrolUnitData.wargear` (or composition `default`s plus wargear). List special-weapon models **last** so list-order allocation kills them last (as the StD Godspeaker). Skywardens: `skywarden` ×2, `skywarden-volley` ×1. Reinforcement copies keep the loadout (`spawnDestroyedUnitCopy`). |
| Shoot in Combat, Crit (Mortal), 2D6 / D3 / D6 values | (a) | Weapon abilities `SHOOT_IN_COMBAT`, `CRIT_MORTAL`; dice expressions in `A` / `D`. |
| Fly (Frigate, Skywardens) | (a) | Existing FLY handling in `phases/movement.ts` and `phases/charge.ts`. |
| Reinforcements (both Companies, Skywardens) | (a) | Core `spearheadCallForReinforcements`. Admiral and Frigate cannot be replaced. |
| KO-AB-4 Glory-Seekers | (a) | Passive, scope self, `effect { when: { targetOnObjective: true }, modifyRoll: { roll: 'hit', value: 1 } }` (hooks-impl `unitOnObjective` = within objective range = contesting). Minor caveat: it does not consult `contestAllowed` (Ironjawz You Messin'?); acceptable, or (c) one-line fix there. |
| KO-AB-5 Battle Damaged | (a) | Datasheet `damaged: { threshold: 5, effect: { when: { weaponId: 'kharadron.weapon.heavy-skyhook' }, setStat: { stat: 'A', value: 1 } } }` (hooks-impl adds `damaged` entries while `woundsRemaining <= threshold`). Verify the `damaged` entry reaches the weapon-stat query (`onStatQuery`, A), not only roll hooks; if not, a small (c) in `hooks-impl.ts`. |
| KO-ENH Masterwrought Armour | (a) | Passive enhancement, scope bearer, `{ feelNoPain: 6 }` (as Armour of Gork). |
| KO-ENH Flask of Vintage Gorogna | (a) | Reuse code `citiesFlask` (timing comes from data): `timing { phase: 'command', whose: 'any' }`, `limit oncePerBattle`, `params.heal 'D6'`; `canUse` needs the general damaged. |
| KO-AB-1 Always Take What You Are Owed | (b) `kharadronTakeWhatYouAreOwed` | Activated, `phase command / your`, `limit oncePerPhase`. Targets: friendly units with `isDatasheet(…, 'arkanaut-company')` and `whollyWithinUnit(target, admiral, 12)`. Resolve: roll D6 (`ctx.rollExpr`), grant an empty effect (scope self, duration 'untilNextTurn') and keep `n` in a ledger (`mission.custom.koControl[effect id]`); the hook's `produce` at `onObjectiveControl` returns `{ kind: 'stat', delta: n }` for the contesting unit (a `modifyStat OC` would have added n to every model). |
| KO-ENH Leave No Duardin Behind | (b) `kharadronLeaveNoDuardin` | Shape of `fyreslayersHornOfGrimnir`: `phase command / your`, `oncePerBattle`; targets = Arkanaut Companies wholly within 12" of the general with `returnableModels > 0`; roll `returnableModels` D6 (perDie), `returnSlainModels(ctx, target, count of ≥ params.successOn (4))`. |
| KO-ENH No Reward Without Risk | (b) `kharadronNoRewardWithoutRisk` | Like Visions of Glory's ledger on `onChargeRoll`: `produce` answers `{ kind: 'roll', reroll: 'all' }` when the charging unit is `whollyWithinUnit(charger, general, 12)` and `mission.custom.koNoReward[player]` is unspent; mark it spent on that answer. `rerolls.ts` only asks for a roll that falls short, so the once-per-battle re-roll is never wasted. Data timing stays the reaction (the loop never offers reactions). |
| KO-RA-2 Disengage | (b) `kharadronDisengage` + (c) C1 | Grants the Frigate `[{ noRetreatDamage: true }, { shootAfterFallBack: true }]` until end of turn (`Effect` fields exist; `movement.ts` waives the damage, `hooks-impl` allows the shot after `fallBack`). Problem: movement-phase abilities are only offered **after** all units moved (`doAbilities`), too late. Offer it in the C1 move-declared window when the Frigate declares a Retreat (before the D3 roll); `params.window: 'moveDeclared'`. |
| KO-BT-1 Ply the Skies | (b) `kharadronPlyTheSkies` + (c) C1, C2 | Data timing `{ kind: 'reaction', trigger: 'youDeclared', abilityId: 'core.move' }`, army ability. `canUse`: the declared unit is an Arkanaut Frigate, move type ≠ charge, some friendly INFANTRY unit is `whollyWithinUnit(p, frigate, 3)` and not `inCombat`. Target = that passenger (AI: see §8). Resolve: record the origin placements, lift the unit off the board (location `reserves`; `transportService.embark` may be reused if it needs no capacity keyword, else a `mission.custom.koAboard` record), grant `{ forbid: 'charge' }` until end of turn (charge.ts already honours `chargeForbidden`), and queue a C2 set-up anchored on the Frigate. |
| KO-RA-1 Assault Boat | (b) `kharadronAssaultBoat` | `phase movement / your`, `oncePerBattle`; targets = friendly units carrying the Ply the Skies `forbid` effect this turn; resolve removes that effect from `unit.effects` (filter by `sourceAbilityId`). Offered in the end-of-phase window (fine: charges come later). |
| KO-AB-2 Timed Charges | (b) `kharadronTimedCharges` + (c) C3 | `endOfTurn / any`, per unit; declare roll D6 2+; targets = `enemiesInCombat(self)`. Resolve: `inflictMortal(ctx, use, target, 1)`, then queue an optional retreat for the Skywardens (C3; pass = stay). No retreat mortal damage. |
| KO-AB-6 Bomb Racks | (b) `kharadronBombRacks` + (c) C4 | `phase movement / your`, `oncePerBattle`; targets = `passedAcrossThisPhase(state, frigate)` (C4) still on the board; declare roll D6 2+; resolve `inflictMortal(ctx, use, target, roll D3)`. End-of-phase window is fine (the move has happened). |

**Engine changes (c):**
- **C1 move-declared window** (`phases/movement.ts`, `abilities.ts`): add `'moveDeclared'` to `AbilityWindow`. After
  `declareMove` is answered (and before the Retreat D3 roll / the `moveUnit` decision), movement calls
  `ctx.services.abilities.runWindow(ctx, 'moveDeclared', unit.player, \`md:${unitId}\`)`. Candidates there: reaction
  descriptors `{ trigger: 'youDeclared', abilityId: 'core.move' }` and phase-movement descriptors with
  `params.window: 'moveDeclared'` (which are then not offered in the end-of-phase window). Hooks read the move through a
  new export `readDeclaredMove(state: GameState): { unitId: UnitId; moveType: MoveType } | null` (phase mark
  `mv:declared=`). Check the data schema accepts the sentinel `abilityId: 'core.move'`.
- **C2 anchored set-up** (`redeploy.ts`): `RedeployRequest` gains `anchor?: { unitId: UnitId; whollyWithin: number }`
  and `origin?: ModelPlacement[]`. `redeployOptions(state, unitId, minEnemyDistance, max, anchor?)` builds centres on a
  ring around the anchor and keeps formations wholly within `whollyWithin` of it (`modelsWhollyWithin`); `minEnemyDistance:
  3` gives "not in combat"; `markSetUp: true` (CORE-6.13). Movement drains the queue right after the Frigate's `UnitMoved`
  by calling `runWindow(ctx, 'moveEnded', player, key)` (a window with no abilities, used only to ask queued set-ups).
  [interp] If no legal spot exists, or the Frigate died before moving (its own retreat damage), the passenger goes back to
  `origin` when that is still legal, otherwise to the nearest legal spot to it.
- **C3 ability retreat** (`factions/aos-moves.ts`): `retreatOptions(state: GameState, unitId: UnitId, max = 6): MoveOption[]`
  (rigid slides up to the unit's Move, may cross enemy combat ranges, FLY ignores models, must end outside every enemy
  combat range, coherent, legal terrain) and `applyRetreat(ctx: EngineContext, unitId: UnitId, optionId: string): boolean`
  (emits `UnitMoved` with moveType `'abilityMove'`, no damage). `MoveQueue` gains `kind?: 'slide' | 'retreat'` and the
  abilities move-queue handler dispatches on it.
- **C4 passed across** (`phases/movement.ts`): when a move resolves, for every moved model's path (straight segment when
  no path) record each enemy unit whose model bases the moving base overlaps along the path (`pathCrossesModels`), in a
  phase mark `mv:across:<unitId>=<ids>`; export `passedAcrossThisPhase(state: GameState, unitId: UnitId): UnitId[]`
  (union over all of the unit's moves this phase).

---

## 8. Engine notes

1. **Ply the Skies order:** declare move → C1 window (Ply the Skies / Disengage) → [Retreat D3 roll] → Frigate move →
   C2 set-up of the passenger → next unit. The passenger never takes the Frigate's retreat damage.
2. One passenger per declared move; a Frigate that Runs can still carry (the passenger may not charge anyway unless
   Assault Boat, and as a set-up unit it cannot make its own move that phase).
3. **AI:** Ply the Skies — carry the Arkanaut Company (prefer the Skypike unit) when the Frigate moves toward an
   objective or an enemy, set it up on the option nearest an objective it can contest; Assault Boat — use on a
   transported unit within 12" of an enemy; Disengage — use whenever the Frigate retreats; Bomb Racks — the passed-across
   unit with the fewest wounds left; Always Take What You Are Owed — the Arkanaut Company contesting an objective (else
   nearest one); Timed Charges — always roll, retreat only when the enemy unit in combat has more remaining Health than
   the Skywardens; Leave No Duardin Behind — the Company with the most slain models.
4. **Ward sources:** only Masterwrought Armour (6+) on the general.
5. **Battle Damaged** is checked live at each attack. Nothing in this army heals the Frigate (the Flask heals only the
   general) and it cannot be replaced, so once over the line it stays damaged unless a twist or card heals it.
6. **Defaults for the sim:** regiment Assault Boat and enhancement Leave No Duardin Behind; variant games use Disengage
   and Masterwrought Armour.

---

## 9. Test IDs

| ID | Mechanic |
|---|---|
| KO-ARMY-1 | Skyhammer Task Force builds: Admiral general + 2 Arkanaut Companies + Skywardens + Frigate, 15 models, stats as §5. |
| KO-ARMY-2 | The two Arkanaut Companies carry the two printed loadouts; Skywardens 2 pistol/skypike + 1 volley gun. |
| KO-ARMY-3 | Reinforcements only on both Companies and Skywardens; Admiral and Frigate never offered for replacement. |
| KO-BT-1 | Ply the Skies offered when the Frigate declares Normal Move, Run or Retreat; not for a Charge or for other units. |
| KO-BT-2 | Only an Infantry unit wholly within 3" of the Frigate and not in combat can be picked. |
| KO-BT-3 | Passenger is set up wholly within 3" of the Frigate's end position, not in combat, and cannot move itself that phase. |
| KO-BT-4 | A transported unit cannot charge that turn. |
| KO-BT-5 | Passenger takes no damage from the Frigate's retreat; falls back to its origin if no legal spot exists. |
| KO-RA-1 | Assault Boat: once per battle, only on a unit transported this turn, which may then charge. |
| KO-RA-2 | Disengage: the Frigate's retreat that phase costs no mortal damage and it may shoot later; once per battle. |
| KO-ENH-1 | Masterwrought Armour gives the general Ward (6+). |
| KO-ENH-2 | Flask of Vintage Gorogna heals D6, once per battle, usable in the enemy hero phase. |
| KO-ENH-3 | No Reward Without Risk: one charge re-roll per battle, only for a unit wholly within 12" of the general. |
| KO-ENH-4 | Leave No Duardin Behind: one die per slain model, each 4+ returns a model; Company must be wholly within 12". |
| KO-AB-1 | Always Take What You Are Owed: +D6 Control to an Arkanaut Company wholly within 12" until your next turn. |
| KO-AB-2 | Timed Charges: end of any turn, 2+ inflicts 1 mortal on an enemy in combat with the Skywardens; 1 does nothing. |
| KO-AB-3 | Timed Charges retreat: optional, up to Move, ends outside all combat ranges, no retreat mortal damage. |
| KO-AB-4 | Glory-Seekers: +1 to hit only against a unit contesting an objective (capped at +1). |
| KO-AB-5 | Battle Damaged: Heavy Skyhook Attacks 1 at 10+ damage, 2 below that. |
| KO-AB-6 | Bomb Racks: only a unit the Frigate passed across this phase; 2+ inflicts D3 mortal; once per battle. |
| KO-WEAP-1 | Shoot in Combat pistols and carbines fire while in combat; Volley Gun and skyhooks do not. |
| KO-WEAP-2 | Skypike critical hit deals 2 mortal damage and skips wound and save. |
| KO-WEAP-3 | Aethermatic Volley Gun rolls 2D6 attacks. |
| KO-FLY-1 | Frigate and Skywardens move over models (Fly); Arkanauts and Admiral do not. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own sky-port livery): ivory and deep crimson armour plates, burnished copper and brass
fittings, dark plum leather, glowing aether-green lenses and tubes, grey-white beards. Shared motif: an original
cog-inside-a-cloud badge. No GW logos, no copied Kharadron runes or guild heraldry. All figures are in the house figure style (docs/FIGURE-STYLE.md); the Frigate is a chunky airship.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `ko-admiral` | Arkanaut Admiral | 1 | 32 round | No | A duardin sky-admiral with a head in an ivory-and-copper diving-style helm with a glowing green visor and a big braided grey beard, short legs, crimson coat-tails, a giant piston-driven copper hammer in one fist and a short triple-barrel pistol in the other. |
| `ko-arkanaut` | Arkanaut Company (pistol + cutter) | 1 (×7) | 25 round | No | A duardin sky-sailor with an enormous round helmet with green goggle lenses and a breathing hose, bushy beard, short legs, ivory chest plate with crimson trim, a short curved cutlass in one hand and a chunky brass pistol in the other. |
| `ko-arkanaut-skypike` | Arkanaut Company (Skypike) | 1 | 25 round | No | The same sky-sailor holding a long brass pole-arm with a glowing green aether bulb and a hooked spear tip, braced in a heroic lunge. |
| `ko-arkanaut-volley` | Arkanaut Company (Volley Gun) | 1 | 25 round | No | The same sky-sailor hugging an oversized rotary multi-barrel brass gun with a hand-crank and ammo drum, short legs planted wide. |
| `ko-arkanaut-skyhook` | Arkanaut Company (Light Skyhook) | 1 | 25 round | No | The same sky-sailor shouldering a short harpoon launcher with a big barbed brass hook and coiled chain. |
| `ko-skywarden` | Skywardens (pistol + skypike) | 1 (×2) | 32 round, flying stand | No | A duardin flyer with a giant bubble helmet, a round copper balloon-engine on its back with a little propeller, dangling short legs, a long hooked pike in one hand and a flame-nozzle pistol in the other, hovering on a clear stem. |
| `ko-skywarden-volley` | Skywardens (Volley Gun) | 1 | 32 round, flying stand | No | The same flyer with the backpack balloon-engine, gripping an oversized rotary brass gun with both hands while hovering. |
| `ko-frigate` | Arkanaut Frigate | 1 | 120×92 oval, flying stand | Vehicle | A chunky airship: a short, fat ivory-and-crimson hull with a big rounded prow, two oversized copper balloon-domes on short struts above, glowing green portholes, a large harpoon cannon on the bow, small duardin crew peeking over the rail, floating on a thick clear stand. |

Every special-weapon model gets its own figure because its weapons differ in the rules (and players need to see
whether it is still alive). No champion or musician variants: the Spearhead gives them no rules.

---

## 11. Implementation notes

Shipped (F8). Data `src/data/factions/kharadron/` (army `kharadron.army.skyhammer-task-force`), hooks `src/engine/factions/kharadron.ts`
(`...kharadronHooks` in `code-hooks.ts`), tests `tests/engine/kharadron.test.ts` and `tests/data/kharadron.test.ts` (one test per KO- id).

- **Two Company datasheets.** `kharadron.unit.arkanaut-company` ("Arkanaut Company (Skypike)": models `arkanaut` x4 + `arkanaut-skypike`)
  and `kharadron.unit.arkanaut-company-gunners` ("Arkanaut Company (Gunners)": `arkanaut` x3 + `arkanaut-volley` + `arkanaut-skyhook`).
  Both carry Glory-Seekers and Reinforcements; the Always Take / Leave No Duardin hooks match them by `params.datasheets`. Special
  models are listed last. Figure mapping keys are `<datasheet id>/<modelId>`.
- **Engine hooks used (F8 engine-core):** C1 `moveDeclared` window (Ply the Skies as a reaction `{ youDeclared, abilityId 'core.move' }`,
  Disengage as a movement ability with `params.window 'moveDeclared'`), C2 `liftForRedeploy` + anchored `requestRedeploy` (`atWindow
  'moveEnded'`, `markSetUp`, origin fallback), C3 `MoveQueue kind 'retreat'`, C4 `passedAcrossThisPhase`.
- **Ply the Skies:** one use per Frigate and phase (phase mark `ko:ply:<frigate>`); the descriptor carries UNLIMITED so CORE-3.4 does not
  block a second Frigate. The target step lists the Companies first. The passenger gets `forbid: charge` until end of turn (Assault Boat
  removes the effect granted by Ply the Skies).
- **No Reward Without Risk:** a passive marker. `ensureEffects` puts a battle-long empty effect on the general's unit; `produce` at
  `onChargeRoll` answers `{ kind: 'roll', reroll: 'all' }` only for a charge roll that already fell short (the roll carries `needed`),
  for a charger wholly within 12" of the general, once per battle (`mission.custom.koNoReward[player]`).
- **Flask of Vintage Gorogna:** own hook `kharadronFlask` (the Cities flask announces under its own name); any hero phase, either player's.
- **Timed Charges:** [RULING] the Retreat is only queued when the Skywardens are still in combat after the mortal damage (a Retreat is how
  a unit leaves combat); the player may pass to stay. Move = the unit's Move characteristic (12").
- **AI** (`kharadronAbilityTiming` / `kharadronTargetBonus` / `kharadronModeBonus`, called from `src/ai/utility.ts`): Assault Boat only for a ride that
  ended within 12" of an enemy; Ply the Skies carries the Skypike Company, then the gunners, not the Admiral; Always Take What You Are Owed
  prefers a Company on an objective; Bomb Racks prefers the weakest unit; the Timed Charges retreat is taken only from an enemy with
  more Health left than the Skywardens.
- **Defaults for the sim:** regiment Assault Boat and enhancement Leave No Duardin Behind; variant games Disengage and There's No Reward
  Without Risk (the last entries in the patrol lists).
