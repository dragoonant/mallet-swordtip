# Seraphon — Sunblooded Prowlers (Spearhead)

Faction id: `seraphon` · Army id: `seraphon.army.sunblooded-prowlers` · Grand alliance: Order.
Source: `docs/sources/spearhead-seraphon.pdf` (4 pages, gitignored), "Spearhead: Seraphon - Sunblooded Prowlers", the free
Warhammer Community download (Age of Sigmar, Spearhead category). Download page created 2025-06-11, file revised 2026-10-28,
fetched 2026-10-30 with plain curl from
`https://assets.warhammer-community.com/eng_28-10_aos_spearhead_seraphon_sunblooded_prowlers-2tmuxx6dbn-v5adn2jsz2.pdf`
(found through the downloads search API, `POST https://www.warhammer-community.com/api/search/downloads/`, search term
"seraphon"). The PDF's own heading is **SUNBLOODED PROWLERS** and the box is the **Spearhead: Seraphon** set built from the
new Sunblood Pack, Hunters of Huanchi, Terrawings and Spawn of Chotec kits plus Saurus Warriors.
Base sizes are not printed in the PDF; they come from the Wahapedia aos4 Seraphon unit pages (fetched the same day, plain curl).
Mechanics and numbers are ported 1:1; all wording below is our own. (The other Seraphon Spearhead download, *Starscale
Warhost* — Saurus Oldblood on Carnosaur, 2× 5 Saurus Warriors, 3 Kroxigor — is the older box; out of scope here.)

Conventions: distances in inches; `D3`/`D6` are dice; "combat range" = 3" (core rule); "in combat" = within combat range of
an enemy unit; "wholly within" per CORE-1.2. Engine phase names: Hero phase = `command`, Combat phase = `fight`; Run =
`advance`, Retreat = `fallBack`. Rend is stored as `AP` (negative = more Rend). Rule IDs `SER-*` double as test IDs (§9).
"Combat attacks" = attacks with melee weapons.

---

## 1. Army list

| ID | Unit | Models | Role | Reinforcements | Base (mm) |
|---|---|---|---|---|---|
| `seraphon.unit.sunblood-pack` | Sunblood Pack (with Venomites token) | 3: 1 Sunblood, 2 Saurus Bodyguard | **General** | no | Sunblood 40 round, Bodyguard 32 round; Venomites token 25 round (Wahapedia) |
| `seraphon.unit.saurus-warriors` ×2 | Saurus Warriors | 5 each | Unit | no | 32 round (Wahapedia) |
| `seraphon.unit.hunters-of-huanchi` ×2 | Hunters of Huanchi | 5 each | Unit (reserve, SER-BT-1) | no | 25 round; the Alpha sits on 28.5 (Wahapedia) |
| `seraphon.unit.terrawings` | Terrawings | 3 | Unit | **yes** | 32 round (Wahapedia) |
| `seraphon.unit.spawn-of-chotec` | Spawn of Chotec (with 3 Sun Acolyte tokens) | 1 | Unit (reserve, SER-BT-1) | no | 90×52 oval; Sun Acolyte tokens 25 round (Wahapedia) |

Total: 7 units, 27 models (3 + 10 + 10 + 3 + 1) plus 4 tokens (1 Venomites, 3 Sun Acolytes). The PDF notes that the
whole three-model Sunblood Pack counts as "your general". Only the Terrawings have **Fly** and **Reinforcements**. No
Wizard or Priest. Tokens (SPH-2.7) go in the patrol data: `tokens: { venomites: 1 }` on the Sunblood Pack,
`tokens: { 'sun-acolyte': 3 }` on the Spawn of Chotec. No champion or musician has rules (the Hunters' Alpha and any Saurus
Alpha are cosmetic).

---

## 2. Battle traits

### SER-BT-1 `seraphon.ability.hidden-hunters` — Hidden Hunters (+ `seraphon.ability.chameleon-ambush`)
- **Setup rule:** both Hunters of Huanchi units and the Spawn of Chotec are never set up in the deployment phase; they start
  in reserve.
- **Granted ability — Chameleon Ambush:** timing **Your Movement Phase**, usable only from **battle round 3** onward.
  Effect: set the unit up anywhere on the battlefield, every model more than 6" from every enemy unit.
- Notes: core reserve destruction applies (CORE-4.14 / SPH-7.3): a unit still in reserve at the start of round 4 is
  destroyed, so in practice they must arrive in round 3. A unit set up this way cannot use Move abilities later that phase
  (CORE-6.13). The Terrawings are **not** part of this rule and deploy normally.

### SER-BT-2 `seraphon.ability.vengeance-of-azyr` — Vengeance of Azyr
- **Timing:** End of any turn (army ability; once per turn by its timing).
- **Declare:** every enemy unit that is in combat with at least one friendly **Saurus** unit is a target (no choice).
  Saurus units here: the Sunblood Pack and both Saurus Warriors units.
- **Effect:** Roll one D6 per target (one die per enemy unit, even if it is in combat with several Saurus units). On **4+**
  that target suffers **1 mortal damage**.

---

## 3. Regiment abilities (pick 1 at army selection)

### SER-RA-1 `seraphon.ability.scaled-aegis` — Scaled Aegis
- **Timing:** Once per turn (army), your hero phase.
- **Declare:** pick a friendly **Saurus** unit, then roll a D6.
- **Effect:** On **3+**, that unit has **Ward (6+)** until the start of your next turn.

### SER-RA-2 `seraphon.ability.followers-of-huanchi` — Followers of Huanchi
- **Timing:** Once per turn (army), your shooting phase.
- **Declare:** pick a friendly **Skink** unit (either Hunters of Huanchi unit or the Spawn of Chotec), then roll a D6.
- **Effect:** On **3+**, that unit's **ranged** weapons have **Crit (Auto-wound)** for the rest of the turn. This
  explicitly reaches **Companion** weapons too (the Spawn's Glob of Flame Acid).

---

## 4. Enhancements (give the general exactly 1)

| ID | Name | Timing | Effect |
|---|---|---|---|
| `seraphon.enh.instinctive-commander` | Instinctive Commander | Your hero phase (CORE-3.4: once per phase for the general) | Declare: pick a visible friendly unit wholly within 12" of the general that is not in combat; roll a D6. On **3+**, that unit may at once make a **Normal Move** as though it were your movement phase. |
| `seraphon.enh.savage-mauling` | Savage Mauling | Any combat phase (once per phase) | Declare: pick an enemy unit in combat with the general. Effect: **no Ward rolls** may be made for that unit for the rest of the turn. |
| `seraphon.enh.venomite-swarm` | Venomite Swarm | Any combat phase (once per phase) | Declare: pick an enemy unit in combat with the general. Effect: only if the general's **Venomites token** is still on the battlefield, roll a **D3**. On a **1** the token is removed (nothing else happens). On **2 or 3** the target suffers mortal damage equal to the roll. |
| `seraphon.enh.blessed-by-the-old-ones` | Blessed by the Old Ones | End of any turn; **mandatory** | Declare: if the general has been destroyed, it must use this ability; roll a D6. Effect: on **2+**, set up a replacement unit made of **just the Sunblood model** anywhere on the battlefield, more than 6" from every enemy unit. |

Rulings for the enhancements:
- [RULING] Instinctive Commander may pick the general's own unit. The out-of-phase Normal Move does not use up that unit's
  move for the coming movement phase (it was not the movement phase); it follows every Normal Move restriction (may not
  start in combat, may not move into combat at any point; Fly ignores the latter).
- [RULING] Blessed by the Old Ones has no once-per limit printed, so a failed roll is repeated at the end of every later
  turn while the general stays destroyed. The replacement is a new unit (CORE-6.16): it carries no enhancement, so the
  ability cannot fire a second time; it has no Venomites token (irrelevant: Venomite Swarm is a different enhancement).
- [RULING] The replacement Sunblood **is your general** from then on (`isWarlord`, `players[p].warlordUnitId`), and it still
  "includes a Sunblood", so Scaled Protectors keeps working for it. It is a Hero, so cards that count the general use it.
- The replacement uses the Sunblood Pack warscroll with one model (Health 3); its control score is 1 + 1 (Scaled Protectors).

---

## 5. Warscrolls

Stat order: Move / Health / Save / Control / Ward. **No warscroll prints a Ward.** Printed keywords only (Spearhead
warscrolls print no faction keywords).

### 5.1 `seraphon.unit.sunblood-pack` — Sunblood Pack
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 3 | 4+ | 1 | — |

Keywords: **Hero, Infantry, Saurus**. Models: 1 Sunblood + 2 Saurus Bodyguard, all with the same weapon. The Venomites are a
token (no model, no profile).

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Celestite Weapons (`seraphon.weapon.celestite-weapons`) | Melee | — | 3 | 3+ | 3+ | 1 | 2 | — |

**SER-AB-1 `seraphon.ability.scaled-protectors` — Scaled Protectors**
- **Timing:** Passive.
- **Condition:** only while the unit still has its **Sunblood** model.
- **Effect:** (1) The first damage point that would be allocated to this unit in each phase is ignored (once per phase; it
  covers mortal damage too). (2) Add 1 to this unit's **control score** (once per unit, not per model).
- [RULING] The point is ignored after any Ward rolls (it is the first point that would actually be allocated).
- [interp] The defender allocates damage; the engine kills the Bodyguards before the Sunblood (§7 C3), which is what a
  player would do.

**SER-AB-2 `seraphon.ability.savage-bellow` — Savage Bellow**
- **Timing:** Your hero phase (once per phase for this unit).
- **Declare:** pick a visible friendly unit wholly within 12" of this unit (this unit may pick itself) and roll a D6.
- **Effect:** On **3+**, that unit's weapons (melee and ranged) have **Crit (2 Hits)** for the rest of the turn, **including
  Companion** weapons.

### 5.2 `seraphon.unit.saurus-warriors` — Saurus Warriors
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 2 | 4+ | 1 | — |

Keywords: **Infantry, Saurus**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Celestite Club (`seraphon.weapon.celestite-club`) | Melee | — | 2 | 3+ | 3+ | 1 | 1 | — |

**SER-AB-3 `seraphon.ability.ordered-cohorts` — Ordered Cohorts**
- **Timing:** Passive.
- **Effect:** +1 to save rolls for this unit while it is **contesting an objective that you control**.

### 5.3 `seraphon.unit.hunters-of-huanchi` — Hunters of Huanchi
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 8" | 1 | 6+ | 1 | — |

Keywords: **Infantry, Skink**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Dartpipe (`seraphon.weapon.dartpipe`) | Ranged | 10" | 2 | 3+ | 3+ | — | 1 | — |
| Feeble Claws (`seraphon.weapon.feeble-claws`) | Melee | — | 1 | 4+ | 5+ | — | 1 | — |

**SER-AB-4 `seraphon.ability.star-venom` — Star-Venom**
- **Timing:** Any shooting phase (once per phase for this unit).
- **Declare:** pick an enemy unit that had damage points allocated to it **this turn** by this unit's **Dartpipe** attacks,
  then roll a D6.
- **Effect:** On **2+**, subtract 1 from **wound rolls** for that unit's **combat attacks** for the rest of the turn.
- Note: the Dartpipe is the unit's only ranged weapon and it has no Shoot in Combat, so "damaged by its Dartpipes this
  turn" = "damaged by this unit's shooting this phase" in practice.

### 5.4 `seraphon.unit.terrawings` — Terrawings
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 12" | 2 | 5+ | 1 | — |

Keywords: **Beast, Fly, Reinforcements**

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Snapping Beaks (`seraphon.weapon.snapping-beaks`) | Melee | — | 3 | 4+ | 4+ | — | 1 | Companion |

**SER-AB-5 `seraphon.ability.nerve-shredding-screeches` — Nerve-Shredding Screeches**
- **Timing:** Any combat phase (once per phase for this unit).
- **Declare:** pick an enemy unit in combat with this unit, then roll a D6.
- **Effect:** On **4+**, subtract 1 from **hit rolls** for that unit's **combat attacks** for the rest of the turn.

### 5.5 `seraphon.unit.spawn-of-chotec` — Spawn of Chotec
| Move | Health | Save | Control | Ward |
|---|---|---|---|---|
| 5" | 8 | 5+ | 1 | — |

Keywords: **Beast, Skink** (not Monster, not Infantry). Crew: 3 Sun Acolyte tokens.

| Weapon | Type | Range | Atk | Hit | Wnd | Rend | Dmg | Abilities |
|---|---|---|---|---|---|---|---|---|
| Glob of Flame Acid (`seraphon.weapon.glob-of-flame-acid`) | Ranged | 16" | 1 | 4+ | 2+ | 2 | D3+3 | Companion |
| Fiery Maw (`seraphon.weapon.fiery-maw`) | Melee | — | 3 | 3+ | 3+ | 2 | 3 | Companion |

**SER-AB-6 `seraphon.ability.sun-acolytes` — Sun Acolytes**
- **Timing:** Passive.
- **Effect:** The unit starts with **3 Sun Acolyte tokens**. Its **control score** gains +1 per token it still has. With
  **no** tokens left its control score is **at most 1**. Each **unmodified save roll of 1** made for this unit removes one
  token, but only **after the whole Attack ability has resolved** (the damage point from that failed save still lands).
- Notes: full crew = control score 4. Tokens are lost only to save rolls of 1 (mortal damage has no save, so it never
  costs a token). Tokens stay with the unit while it waits in reserve.

---

## 6. Spells and prayers

None. No Wizard or Priest, no lore.

---

## 7. Mechanics mapping

(a) = expressible today in data (`src/data/factions/seraphon/*.json`), at most a bare-name hook; (b) = new faction code hook
in `src/engine/factions/seraphon.ts` (registered in `code-hooks.ts` as `...seraphonHooks`); (c) = needs an engine change
outside the faction file (C1–C6 below).

| Rule | Class | How |
|---|---|---|
| Stats, keywords, no printed Ward | (a) | Datasheets as the other armies; keywords `HERO`, `INFANTRY`, `SAURUS`, `SKINK`, `BEAST`, `FLY`, `REINFORCEMENTS`. Sunblood Pack models: `sunblood` (`champion: true`) listed FIRST, then `bodyguard` ×2. C3 makes the list order irrelevant to damage, and the enhancement bearer is the unit's first model (`state.ts enhancementBearer`), so the Sunblood carries the general's enhancement and the Pack keeps it as long as the unit lives. |
| Tokens (Venomites, Sun Acolytes) | (a) | Patrol unit `tokens` (`state.ts` copies them to `unit.tokens`). Removal by the hooks below. |
| Companion weapons | (a) | Weapon ability `COMPANION` (CORE-12.4 in `attack.ts` / `weapons.ts`). |
| Fly, Reinforcements (Terrawings) | (a) | Existing FLY handling; core `spearheadCallForReinforcements`. |
| SER-BT-1 Hidden Hunters / Chameleon Ambush | (a) | Copy of Ironjawz 'Ere We Go!: patrol entries for both Hunters units and the Spawn carry `reserve: { ability: 'seraphon.ability.chameleon-ambush' }`; the arrival descriptor is `activated`, `phase movement / your`, `fromRound 3`, `params { fromRound: 3, minEnemyDistance: 6, anywhere: true }`. A passive `hidden-hunters` marker in `battleTraits` carries the text. |
| SER-AB-3 Ordered Cohorts | (a) | Passive, scope self, `effect { when: { unitOnObjectiveControlledBy: 'self' }, modifyRoll: { roll: 'save', value: 1 } }`. |
| SER-RA-1 Scaled Aegis | (b) `seraphonScaledAegis` | `phase command / your`, `limit oncePerTurnArmy`, `roll { dice: 'D6', succeedOn: 3 }`, `duration untilNextTurn`; targets = friendly units with `SAURUS`; resolve grants `{ feelNoPain: 6 }` (same as the Kruleboyz Kunnin' Plan grant shape). |
| SER-RA-2 Followers of Huanchi | (b) `seraphonFollowersOfHuanchi` + (c) C1 | `phase shooting / your`, `oncePerTurnArmy`, roll D6 3+, `untilEndOfTurn`; targets = friendly `SKINK` units on the board; grants `{ when: { weaponType: 'ranged' }, grantWeaponAbility: { ability: 'CRIT_AUTO_WOUND' }, affectsCompanion: true }`. C1 lets the grant reach the Glob of Flame Acid. |
| SER-AB-2 Savage Bellow | (b) `seraphonSavageBellow` + (c) C1 | `phase command / your` (CORE-3.4 once per phase), roll D6 3+, `untilEndOfTurn`; targets = friendly units `whollyWithinUnit(t, self, 12)` and visible (self allowed); grants `{ grantWeaponAbility: { ability: 'CRIT_2_HITS' }, affectsCompanion: true }`. |
| SER-AB-1 Scaled Protectors (+1 control) | (b) `seraphonScaledProtectors` | Passive on the Sunblood Pack; `producesAt ['onObjectiveControl']`: `{ kind: 'stat', delta: 1 }` for its own unit while a `sunblood` model is alive. `hookService.collect` only asks a producer on an ActiveEffect (`entry.active`), so `ensureEffects` puts a battle-long empty marker effect on the holder (the Lumineth `ensureBattleEffect` pattern; abilities.ts runs `ensureEffects` at the top of every ability window). |
| SER-AB-1 Scaled Protectors (ignore first point) | (b) same hook + (c) C2 | The hook answers `ignoresFirstDamagePerPhase(state, entry, unitId)` = true for its holder while the Sunblood lives. |
| Sunblood dies last | (c) C3 | Allocation order change in `attack.ts nextTarget`. |
| SER-AB-4 Star-Venom | (b) `seraphonStarVenom` | `phase shooting / any`, roll D6 2+, `untilEndOfTurn`; targets = `damagedByShootingThisPhase(state, self)` filtered to enemies on the board (the Lumineth precedent); grants the target `{ when: { weaponType: 'melee' }, modifyRoll: { roll: 'wound', value: -1 } }` (scope: the target's own attacks). |
| SER-AB-5 Nerve-Shredding Screeches | (b) `seraphonScreeches` | `phase fight / any`, roll D6 4+, `untilEndOfTurn`; targets = `enemiesInCombat(self)`; grants the target `{ when: { weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: -1 } }` (the `kruleboyzEyeBiterAsh` shape). Star-Venom and Screeches may share one parametrised hook (`params.roll`, `params.stat`). |
| SER-AB-6 Sun Acolytes (control) | (b) `seraphonSunAcolytes` | Passive on the Spawn (same `ensureEffects` marker as Scaled Protectors); `produce` at `onObjectiveControl`: n = `unit.tokens['sun-acolyte'] ?? 0`; n > 0 → `{ kind: 'stat', delta: n }`, n = 0 → `{ kind: 'stat', cap: 1 }` (`unitControlScore` already folds `delta` and `cap`). |
| SER-AB-6 Sun Acolytes (token loss) | (b) same hook + (c) C4 | The hook's `afterAttackSequence` removes `min(saveOnes[spawn], tokens)` tokens and announces it. |
| SER-BT-2 Vengeance of Azyr | (b) `seraphonVengeanceOfAzyr` | Army ability, `endOfTurn / any`, no declare step; targets = the union of `enemiesInCombat(u)` over friendly `SAURUS` units on the board; one D6 each, 4+ → `inflictMortal(ctx, use, t, 1)` (shape of `kruleboyzBreathOfTheMireDrakes`). AI always uses it. |
| ENH Instinctive Commander | (b) `seraphonInstinctiveCommander` | `phase command / your`, roll D6 3+; targets = friendly units on the board, not `inCombat`, `whollyWithinUnit(t, general, 12)` and visible; resolve queues `writeMoveQueue({ kind: 'slide', maxDistance: <target Move via statFor M>, opts: { mayNotEndInCombat: true } })`. Built with `SlideOpts.normalMove` (F12): the end spot must be clear and no model's straight path may enter an enemy combat range (Fly exempt), but it is still a rigid slide from a short heading list, not a free model-by-model Normal Move. C6 (a true out-of-phase Normal Move) was not built. |
| ENH Savage Mauling | (b) `seraphonSavageMauling` | `phase fight / any`; targets = `enemiesInCombat(general)`; resolve pushes the existing card flag `{ kind: 'noWard', source: abilityId, player, unitId: target, objectiveId: null, value: 0, until: 'turn', round }` into `state.cards.flags` (`cardWard` already returns no ward for it; cards.ts clears `turn` flags at the end of the turn — verify). Exporting `cards.ts addFlag` would be tidier (one word). |
| ENH Venomite Swarm | (b) `seraphonVenomiteSwarm` | `phase fight / any`; `canUse` needs `unit.tokens.venomites > 0`; targets = `enemiesInCombat(general)`; resolve rolls D3 (`ctx.rollExpr('D3')`): 1 → `tokens.venomites = 0` + announce; 2–3 → `inflictMortal(ctx, use, t, roll)`. |
| ENH Blessed by the Old Ones | (b) `seraphonBlessedByTheOldOnes` + (c) C5 | End-of-turn descriptor on the general (enhancement), offered while its holder is **destroyed** and not replaced (C5), mandatory. Roll D6; 2+ → `spawnDestroyedUnitCopy(ctx, general, { onlyModels: ['sunblood'] })`, set `copy.replacementOf`, `orig.replaced = true`, make the copy the general, queue a `PlaceRequest` with `anywhere: { minEnemyDistance: 6 }` (C5). |

**Engine changes (c):**
- **C1 grants reach Companion weapons** (`weapons.ts`, `hooks-impl.ts`): today `weapons.ts` returns a Companion weapon's
  printed abilities and never asks `weaponAbilitiesFor`. Change the query to
  `weaponAbilitiesFor(state: GameState, modelId: ModelId, weapon: RuntimeWeapon, attack?: AttackContext, opts?: { companionOnly?: boolean }): WeaponAbility[]`
  and call it for Companion weapons with `companionOnly: true`; then only `grantWeaponAbility` effects whose effect also
  carries `affectsCompanion: true` are added (the same rule `statFor` already applies to stat modifiers, GLO-AB-1). The
  Slaves Rage of Arkhar hooves stay untouched (no `affectsCompanion`).
- **C2 ignore the first damage point each phase** (`code-hooks.ts`, `hooks-impl.ts`, `attack.ts`): new optional
  `EngineCodeHook.ignoresFirstDamagePerPhase?(state: GameState, entry: HookSourceEntry, unitId: UnitId): boolean` folded by
  `hookService.ignoresFirstDamage(state: GameState, unitId: UnitId): boolean`. In `resolvePool` (after the ward rolls and
  before Egomaniak's redirect) and in `allocatePoints`: when it answers true, `points > 0` and the phase mark
  `ignore1:<unitId>` is absent, subtract 1 point, push the mark, and emit `DamageIgnored { unitId, points: 1, source }`
  (additive event in `events.ts`; note it in `13-engine-port-plan.md`).
- **C3 champions take damage last** (`attack.ts nextTarget`): keep "a damaged model first"; otherwise choose among models
  without `champion` while any remain. The Slaves Godspeaker (already `champion: true`) gets the order its spec asked for.
- **C4 save rolls of 1 after an Attack ability** (`attack.ts`, `code-hooks.ts`): while an Attack sequence runs, tally the
  unmodified 1s of `SaveRolled` per target unit; after `AttackSequenceEnded`, call for every source entry on the board
  `EngineCodeHook.afterAttackSequence?(ctx: EngineContext, entry: HookSourceEntry, info: { attackerUnitId: UnitId; saveOnes: Record<UnitId, number> }): void`.
  Token removal emits `TokenRemoved { unitId, token, count, remaining }` (additive event, already named in SPH-2.7).
- **C5 abilities of a destroyed holder + anywhere replacement** (`abilities.ts`, `code-hooks.ts`, `state.ts`,
  `factions/aos-moves.ts`, `factions/spearhead-core.ts`):
  `EngineCodeHook.whileDestroyed?: boolean` — the abilities loop also offers that descriptor at its timing when the holder is
  `location: 'destroyed'` and `!replaced`; with `params.mandatory: true` the decision has `canPass: false` (or the engine
  auto-resolves). `spawnDestroyedUnitCopy(ctx: EngineContext, sourceUnitId: UnitId, opts?: { onlyModels?: string[] }): Unit`
  copies only models whose `datasheetModelId` is listed. `PlaceRequest` gains `anywhere?: { minEnemyDistance: number }`, and
  `replacementOptions` then uses the anywhere formation of `cards.ts` (`anywherePlacements`, exported) instead of the
  territory-edge one.
- **C6 (optional) true out-of-phase Normal Move** (`factions/aos-moves.ts`, `abilities.ts`): `MoveQueue.kind` gains
  `'normal'`, offering the movement phase's own normal-move destinations (path checked against enemy combat ranges, Fly
  respected) and emitting `UnitMoved` with moveType `'normal'` without spending the unit's movement-phase move. Until then
  Instinctive Commander uses the slide approximation above.

---

## 8. Engine notes

1. **Reserves:** 3 of 7 units (both Hunters, the Spawn) start off the table, so rounds 1–2 are played with the Sunblood Pack,
   both Saurus Warriors and the Terrawings. Followers of Huanchi has no legal target before the first ambush.
2. **Sunblood Pack as general:** a three-model general. Cards that test "the general is slain" fire when the whole unit is
   destroyed. Guarded Hero (CORE-14.2) applies to the whole unit, as it is a non-Monster Infantry Hero (no model-count
   limit in the core rule): −1 to be hit by shooting and out of reach beyond 12" while near a friendly non-Hero unit.
3. **Companion and the buffs:** Savage Bellow and Followers of Huanchi name Companion weapons, so they reach the Spawn and
   the Terrawings (C1); enemy debuffs reach Companion weapons anyway (CORE-12.4).
4. **AI:**
   - Chameleon Ambush: arrive in round 3, Hunters on a spot within 10" of the weakest enemy unit (Dartpipe range) or on an
     objective nobody holds; the Spawn within 16" of a high-Save target (Rend 2, D3+3).
   - Scaled Aegis: the Saurus unit nearest an enemy, prefer the general. Followers of Huanchi: the Spawn when it can shoot,
     else the Hunters with the most models. Savage Bellow: the friendly unit about to fight that has the most attacks, else
     itself. Star-Venom: always use. Screeches: always use. Vengeance of Azyr: always.
   - Instinctive Commander: move a Saurus Warriors unit toward the nearest uncontrolled objective. Savage Mauling: only
     against a unit that has a Ward. Venomite Swarm: always (expected 1.33 mortal per use).
5. **Ward sources:** only Scaled Aegis (6+). Savage Mauling switches off enemy wards.
6. **Defaults for the sim:** regiment Scaled Aegis and enhancement Venomite Swarm; variant games Followers of Huanchi and
   Blessed by the Old Ones.

---

## 9. Test IDs

The ids below name the checks (tests/engine/seraphon.test.ts, tests/data/seraphon.test.ts); the AB numbers split the warscroll rules of §5 differently from the rule ids there: AB-1 / AB-2 / AB-3 = Scaled Protectors (ignore, control, allocation), AB-4 = Savage Bellow, AB-5 = Ordered Cohorts, AB-6 = Star-Venom, AB-7 = Screeches, AB-8 / AB-9 = Sun Acolytes. BT-1..3 = Hidden Hunters, reserve destruction, Vengeance of Azyr.

| ID | Mechanic |
|---|---|
| SER-ARMY-1 | Sunblooded Prowlers builds: Sunblood Pack general + 2 Saurus Warriors + 2 Hunters of Huanchi + Terrawings + Spawn of Chotec, 27 models, stats as §5. |
| SER-ARMY-2 | Tokens: the Sunblood Pack starts with 1 Venomites token, the Spawn with 3 Sun Acolyte tokens. |
| SER-ARMY-3 | Reinforcements only on the Terrawings; no other unit is offered for replacement. |
| SER-BT-1 | Hidden Hunters: both Hunters units and the Spawn skip deployment; Chameleon Ambush only from round 3, every model > 6" from enemies, anywhere. |
| SER-BT-2 | A Hunters/Spawn unit still in reserve at the start of round 4 is destroyed. |
| SER-BT-3 | Vengeance of Azyr: end of each turn, one D6 per enemy unit in combat with a friendly Saurus unit, 4+ = 1 mortal; non-Saurus contacts (Terrawings, Spawn) do not count. |
| SER-RA-1 | Scaled Aegis: once per turn, Saurus only, 3+ gives Ward (6+) until your next turn; a 1–2 gives nothing. |
| SER-RA-2 | Followers of Huanchi: once per turn, Skink only, 3+ gives ranged weapons Crit (Auto-wound) this turn, including the Glob of Flame Acid. |
| SER-ENH-1 | Instinctive Commander: 3+ lets a friendly unit wholly within 12" and not in combat make a Normal Move in the hero phase; it may still move in the movement phase. |
| SER-ENH-2 | Savage Mauling: the target makes no Ward rolls until the end of the turn. |
| SER-ENH-3 | Venomite Swarm: D3 of 2–3 deals that much mortal damage; a 1 removes the token and later uses are not offered. |
| SER-ENH-4 | Blessed by the Old Ones: when the general is destroyed, at the end of the turn a 2+ sets up a 1-model Sunblood anywhere > 6" from enemies; it is the general; a 1 retries next turn end. |
| SER-ENH-5 | The Blessed replacement cannot return again and has no enhancement. |
| SER-AB-1 | Scaled Protectors: the first damage point each phase is ignored (mortal damage too); only while the Sunblood lives. |
| SER-AB-2 | Scaled Protectors: +1 to the unit's control score (once, not per model). |
| SER-AB-3 | Damage allocation removes both Bodyguards before the Sunblood. |
| SER-AB-4 | Savage Bellow: 3+ gives a friendly unit wholly within 12" Crit (2 Hits) this turn, Companion weapons included. |
| SER-AB-5 | Ordered Cohorts: +1 save only while contesting an objective you control. |
| SER-AB-6 | Star-Venom: only an enemy damaged by this unit's Dartpipes this turn; 2+ = −1 to wound for its melee attacks this turn. |
| SER-AB-7 | Nerve-Shredding Screeches: enemy in combat with the Terrawings; 4+ = −1 to hit for its melee attacks this turn. |
| SER-AB-8 | Sun Acolytes: control score 1 + tokens (4 at full crew); 0 tokens = at most 1. |
| SER-AB-9 | Sun Acolytes: each unmodified save of 1 removes a token after the Attack ability; the damage still lands; mortal damage removes none. |
| SER-WEAP-1 | Companion weapons ignore friendly buffs that do not name Companion (e.g. All-out Attack does, a plain +1 Attacks does not). |
| SER-WEAP-2 | Glob of Flame Acid deals D3+3 damage at Rend 2, range 16". |
| SER-FLY-1 | Terrawings move over models (Fly); no other unit does. |

---

## 10. Figures (3D pipeline)

Palette for the whole army (our own star-jungle look): turquoise and teal scales with pale cream bellies for the saurus,
leaf-green chameleon skinks that shade to sky blue, black-and-orange salamander skin for the Spawn, dark plum-red
Terrawings, burnished gold armour plates set with glowing star-blue celestite stones. Shared motif: an original
three-ray sunburst disc. No GW logos, no copied Seraphon glyphs or Old One iconography. All figures are **true MGSD** chibis
(~2.5 heads tall, oversized head, stubby legs, big hands and feet); beasts are chunky toy-like SD shapes.

| Slug | Unit | Models needed | Base (mm) | Mount / vehicle | Concept prompt |
|---|---|---|---|---|---|
| `ser-sunblood` | Sunblood Pack (Sunblood) | 1 | 40 round | No | A true MGSD chibi lizard warlord, 2.5 heads tall with a huge spiky-crested reptile head roaring wide, stubby clawed legs, a gold sunburst shield on one arm and a big star-blue crystal-studded club raised overhead, teal scales and gold armour plates. |
| `ser-saurus-bodyguard` | Sunblood Pack (Bodyguard) | 1 (×2) | 32 round | No | A true MGSD chibi lizard guard, 2.5 heads tall with a big blunt-snouted teal head and a gold headband, stubby legs planted wide, a round gold shield and a short crystal-edged mace held ready. |
| `ser-venomites` | Venomites token | 1 | 25 round | No | A tiny chunky toy-like SD cluster of three fat little green-and-yellow snakes coiled around a pebble, oversized cute heads with glistening fangs. |
| `ser-saurus-warrior` | Saurus Warriors | 1 (×10) | 32 round | No | A true MGSD chibi lizard soldier, 2.5 heads tall with an oversized toothy turquoise head, stubby legs, a cream belly, a round gold shield with a sunburst boss and a chunky stone-and-crystal club. |
| `ser-hunter` | Hunters of Huanchi | 1 (×10) | 25 round (Alpha 28.5) | No | A true MGSD chibi chameleon hunter, 2.5 heads tall with a huge round head, big swivel eyes and a curled tail, stubby legs crouched low, leaf-green skin fading to blue, holding a long thin blowpipe to its lips. |
| `ser-terrawing` | Terrawings | 1 (×3) | 32 round, flying stand | No | A chunky toy-like SD baby pterosaur, oversized head with a long pointed beak and a tall crest, short round body, wide leathery plum-red wings with orange edges, tiny clawed feet, flapping on a clear stem. |
| `ser-spawn-of-chotec` | Spawn of Chotec | 1 | 90×52 oval | Beast (large) | A chunky toy-like SD fire salamander, a fat low body with stubby legs, an enormous round head with a wide grinning mouth dripping glowing orange acid, a tall spiny sail-fin along its back in black and orange, and a little gold collar band. |
| `ser-sun-acolyte` | Sun Acolyte token | 1 (×3) | 25 round | No | A true MGSD chibi skink attendant, 2.5 heads tall with a huge head and wide eyes, stubby legs, a sky-blue body and a gold sunburst pendant, carrying a long-handled bronze pot that glows orange at the rim. |

The Sunblood, Bodyguards and tokens need their own figures: the Sunblood's survival switches Scaled Protectors, and the
token count drives Venomite Swarm and the Spawn's control score, so players must see them. No champion or musician
variants: the Hunters' Alpha and any Saurus Alpha have no Spearhead rules (the Alpha only needs the larger base).
