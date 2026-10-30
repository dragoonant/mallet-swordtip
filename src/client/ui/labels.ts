// Own-words label helpers translating raw engine/data ids (scoring rule ids, mission rule ids,
// VP/CP event sources, secondary/stratagem ids) into text a player can read without cross-referencing
// the JSON. Pure lookups over DataBundle/GameState — no engine/scoring logic duplicated here beyond a
// generic id-to-title-case fallback for whatever id we don't have a curated name for.
import { anyCardName, isCardId } from './cardInfo'
import type { DiceRoll, GameEvent, GameState, MoveType, PlayerId, RollPurpose, RuntimeWeapon } from '@/engine'
import { horizontalGap, modelStats } from '@/engine'
// Deep import: the charge module owns this geometry and the engine barrel is a frozen contract.
import { neededChargeDistance } from '@/engine/phases/charge'
import type { DataBundle, MissionData, MissionRule, ScoringRule } from '@/data/types'

const SMALL_WORDS = new Set(['and', 'of', 'the', 'for', 'with', 'in', 'on', 'a', 'an', 'but', 'or', 'to'])

/** "raze-hold1-r2-4" -> "Raze Hold 1", "core.s.command-reroll" -> "Command Reroll" — strips the
 *  round-range suffix most scoring rule ids carry and the faction-prefix stratagems/secondaries use,
 *  then title-cases the rest. A fallback for whatever id isn't covered by the curated lookups below. */
export function prettifyId(id: string): string {
  let s = id.replace(/-r\d+(?:-\d+)?(?:-(?:first|second))?$/i, '')
  s = s.replace(/^[a-z0-9]+(?:\.[a-z0-9]+)*\./i, '')
  s = s.replace(/[-_.]+/g, ' ').replace(/(\d+)/g, ' $1 ').replace(/\s+/g, ' ').trim()
  if (!s) return id
  return s
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Objectives only ever carry a bare id ("west", "site-a") — no separate display name in the data —
 *  so this is the one place that turns one into something a player didn't have to decode. */
export function objectiveLabel(id: string): string {
  return `${prettifyId(id)} objective`
}

/** Resolves a VpScored/CpChanged `source` id to an own-words name. The engine emits whatever
 *  descriptor id actually granted the points/CP — a mission scoring rule, a mission special rule, a
 *  secondary's own scoring rule, a stratagem, or an ability — so every one of those is checked. */
export function sourceName(state: GameState, bundle: DataBundle | null, source: string): string {
  if (source === 'commandPhase') return 'Hero phase'
  if (isCardId(source)) return anyCardName(bundle, source)
  const strat = state.stratagems[source]
  if (strat) return strat.name
  const ability = state.abilities[source]
  if (ability) return ability.name
  const missionRule = state.mission.rules.find((r) => r.id === source)
  if (missionRule) return prettifyId(missionRule.id)
  const scoringRule = state.mission.scoring.find((r) => r.id === source)
  if (scoringRule) return prettifyId(scoringRule.id)
  if (bundle) {
    for (const patrol of Object.values(bundle.patrols)) {
      for (const secondary of patrol.secondaries) {
        if (secondary.id === source || secondary.scoring.some((r) => r.id === source)) return secondary.name
      }
    }
  }
  return prettifyId(source)
}

/** The secondary a player is actually playing this game (from PlayerSetup.secondaryId), with its
 *  name/text for display — null only if the bundle hasn't loaded (shouldn't happen mid-game). */
export function secondaryFor(bundle: DataBundle | null, state: GameState, player: PlayerId): { id: string; name: string; text: string } | null {
  if (!bundle) return null
  const p = state.players[player]
  const patrol = bundle.patrols[p.patrolId]
  const secondary = patrol?.secondaries.find((s) => s.id === p.secondaryId)
  return secondary ? { id: secondary.id, name: secondary.name, text: secondary.text } : null
}

/** The rule ids that belong to a player's own chosen secondary (not the mission's shared primary
 *  scoring or a mission special rule) — the one thing that actually distinguishes "primary" from
 *  "secondary" VP, since a mission special rule can grant VP under its own id (e.g. Scorched Earth's
 *  "raze-and-ruin") that never appears in state.mission.scoring at all. */
export function secondaryScoringIds(bundle: DataBundle | null, state: GameState, player: PlayerId): Set<string> {
  const secondary = secondaryFor(bundle, state, player)
  if (!bundle || !secondary) return new Set()
  const patrol = bundle.patrols[state.players[player].patrolId]
  const rule = patrol?.secondaries.find((s) => s.id === secondary.id)
  return new Set(rule?.scoring.map((r) => r.id) ?? [])
}

function scoringLineFor(rule: ScoringRule): string {
  switch (rule.rule) {
    case 'custom':
      // Spearhead end-of-turn scoring (SPH-11.1)
      if (rule.code === 'sph.vp.holdOne') return '1 VP at the end of your turn for holding at least one objective'
      if (rule.code === 'sph.vp.holdTwo') return '1 more VP for holding two or more objectives'
      if (rule.code === 'sph.vp.holdMore') return '1 more VP for holding more objectives than your opponent'
      return `${prettifyId(rule.id)} (up to ${rule.cap} VP)`
    case 'holdObjectives':
      return `${rule.pointsPer} VP per objective you hold (cap ${rule.cap})`
    case 'holdMore':
      return `${rule.pointsPer} VP if you hold more objectives than your opponent`
    case 'holdHome':
      return `${rule.pointsPer} VP for holding your home objective`
    case 'holdEnemyHome':
      return `${rule.pointsPer} VP for holding the enemy's home objective`
    case 'holdNamed':
      return `${rule.pointsPer} VP for holding a named objective`
    case 'unitsInEnemyZone':
      return `${rule.pointsPer} VP per unit you have in the enemy's deployment zone`
    case 'destroyedUnits':
      return `${rule.pointsPer} VP per enemy unit destroyed (cap ${rule.cap})`
    case 'razedThisTurn':
      return `${rule.pointsPer} VP for razing a marker this turn`
    case 'claimedSite':
      return `${rule.pointsPer} VP for a Character holding a claimed site`
    case 'claimedSiteConsecutive':
      return `${rule.pointsPer} VP for holding a claimed site across turns`
    default:
      return `${prettifyId(rule.id)} (up to ${rule.cap} VP)`
  }
}

/** One line per distinct scoring "family" — folds the r2-4 / r5-first / r5-second split every
 *  mission's primary uses into a single own-words bullet instead of three near-duplicates. */
export function primaryScoringSummary(mission: MissionData): string[] {
  const families = new Map<string, ScoringRule[]>()
  for (const rule of mission.scoring) {
    const family = rule.id.replace(/-r\d+(?:-\d+)?(?:-(?:first|second))?$/i, '')
    const arr = families.get(family)
    if (arr) arr.push(rule)
    else families.set(family, [rule])
  }
  return Array.from(families.values()).map((rules) => {
    const from = Math.min(...rules.map((r) => r.rounds.from))
    const to = Math.max(...rules.map((r) => r.rounds.to))
    return `${scoringLineFor(rules[0])} — rounds ${from}-${to}`
  })
}

const WINDOW_LABEL: Partial<Record<string, string>> = {
  'command.end': 'end of your Hero phase',
  'command.start': 'start of your Hero phase',
  'turn.end': 'end of your turn',
  'turn.end.scoring': 'end of your turn',
  'turn.start': 'start of your turn',
  'round.end': 'end of the round',
  'round.start': 'start of the round',
  'phase.end': 'end of every phase',
  'battle.end': 'the end of the battle',
}

/** "Scoring: end of your turn (rounds 1-4)" — read off the primary's own-turn scoring
 *  rule, since that's the moment a player actually needs to remember to act before. */
export function primaryScoringWindowHint(mission: MissionData): string | null {
  const rule = mission.scoring.find((r) => r.who === 'active') ?? mission.scoring[0]
  if (!rule) return null
  const windowLabel = WINDOW_LABEL[rule.when] ?? rule.when
  return `Scoring: ${windowLabel} (rounds ${rule.rounds.from}-${rule.rounds.to})`
}

/** Short own-words line for a mission special rule (MissionData.rules[]) — the mission's own `text`
 *  already narrates what it does in prose; this is just a label for the collapsible list. */
export function missionRuleLabel(rule: MissionRule): string {
  return prettifyId(rule.id)
}

// ---------- roll context for decision prompts (docs/spec/50-client.md §6) ----------
// Owner playtest: "I'm given a choice of keeping or re-rolling a dice without even knowing what I'm
// re-rolling for", and "when choosing a save I need to know what I need to roll to make the save
// work… I have no idea what weapon or AP the enemy is using". Both prompts arrive mid-attack-
// sequence, and the PendingDecision's own context carries only the roll (or the model + invuln) —
// everything else the player needs to judge the choice is in the event log the client already keeps.

export const ROLL_PURPOSE_LABEL: Record<RollPurpose, string> = {
  hit: 'To hit',
  wound: 'To wound',
  save: 'Save',
  damage: 'Damage',
  attacks: 'Attacks',
  fnp: 'Ward',
  charge: 'Charge',
  advance: 'Run',
  battleShock: 'Battle-shock',
  desperateEscape: 'Escape',
  hazardous: 'Hazardous',
  deadlyDemise: 'Deadly Demise',
  mortal: 'Mortal wounds',
  rollOff: 'Roll-off',
  firstTurn: 'First turn',
  mission: 'Mission',
  ability: 'Ability',
  stratagem: 'Stratagem',
  priority: 'Priority roll',
  retreat: 'Retreat',
  random: 'Random',
}

function unitNameOf(state: GameState, id: string | null | undefined): string {
  if (!id) return ''
  return state.units[id]?.name ?? id
}

/** "Terminator Squad vs Boyz — To hit" — the Dice Log's own one-line attribution for a roll. */
export function describeRoll(roll: DiceRoll, state: GameState): string {
  const who = unitNameOf(state, roll.unitId) || state.players[roll.player]?.name || roll.player
  const vs = roll.targetUnitId ? ` vs ${unitNameOf(state, roll.targetUnitId)}` : ''
  return `${who}${vs} — ${ROLL_PURPOSE_LABEL[roll.purpose] ?? roll.purpose}`
}

/** The attack currently being resolved, from the log — who is attacking and with what. A save or
 *  Feel No Pain roll is made by the *defender*, so the roll's own unitId is the wrong name to put
 *  next to the weapon; this is where the attacker's name comes from. */
function lastAttack(events: readonly GameEvent[]): { attackerUnitId: string; weaponId: string } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'WoundRolled' || e.type === 'HitRolled' || e.type === 'AttackAllocated') {
      return { attackerUnitId: e.attack.attackerUnitId, weaponId: e.attack.weaponId }
    }
    if (e.type === 'TargetsDeclared' && e.targets[0]) {
      return { attackerUnitId: e.unitId, weaponId: e.targets[0].weaponId }
    }
  }
  return null
}

export interface RerollContext {
  /** "To hit — Terminator Squad's Storm bolter vs Boyz" */
  headline: string
  /** "Rolled 2 — needs 3+." Never asserts an outcome the client would have to re-derive from the
   *  engine's own crit/auto rules; the die and the target are what the decision turns on. */
  detail: string
}

/** " — needs 3+" for the rolls whose target the client can work out exactly, "" otherwise (a charge
 *  needs an engagement distance the client doesn't measure; an Advance has no target at all). Saves
 *  get the fuller armour-vs-AP sentence, since that is the number people get wrong. */
function rerollTargetText(state: GameState, events: readonly GameEvent[], roll: DiceRoll, weapon: RuntimeWeapon | undefined): string {
  switch (roll.purpose) {
    case 'hit':
      return typeof weapon?.skill === 'number' ? ` — needs ${weapon.skill}+` : ''
    case 'wound':
      return weapon ? ` — needs ${weapon.wound}+` : ''
    case 'save': {
      // The engine publishes the target of the save actually being made (armour or invulnerable,
      // whichever the player took) before it rolls — this window opens before SaveRolled exists.
      const targets = saveTargetsInFlight(state)
      const kind = state.phaseState?.attack?.current?.save?.kind
      if (!targets || !kind || kind === 'none') return ''
      const needed = kind === 'invuln' ? targets.invuln : targets.armour
      if (needed === null) return ''
      const basis = kind === 'invuln' ? 'invulnerable save' : `armour save ${targets.sv}+${targets.ap === 0 ? '' : ` against Armour Penetration ${targets.ap}`}${targets.cover ? ' in cover' : ''}`
      return ` — ${basis} needs ${needed}+`
    }
    default:
      return ''
  }
}

/** Everything a player needs to answer a Command Re-roll offer: what the roll was for, who made it
 *  with what, against whom, what it came up and what it has to beat.
 *
 *  The target number is computed from the game state, never read back off the roll's own event —
 *  `rollOnce` (src/engine/reducer.ts) opens this window *before* its caller emits HitRolled /
 *  WoundRolled / SaveRolled, so the newest matching event in the log belongs to the PREVIOUS roll and
 *  would quietly show the wrong numbers. The wound table comes from the engine's own
 *  `woundRollNeeded`, not a second copy of the rule here. Modifiers the engine applied are already in
 *  `roll.final`, which is the value shown. */
export function rerollContext(state: GameState, events: readonly GameEvent[], roll: DiceRoll): RerollContext {
  const purpose = ROLL_PURPOSE_LABEL[roll.purpose] ?? roll.purpose
  const rollerName = unitNameOf(state, roll.unitId) || state.players[roll.player]?.name || roll.player
  const weapon = roll.weaponId ? state.weapons[roll.weaponId] : undefined
  const defending = roll.purpose === 'save' || roll.purpose === 'fnp'

  let headline: string
  if (defending) {
    const attacker = lastAttack(events)
    const attackerName = attacker ? unitNameOf(state, attacker.attackerUnitId) : ''
    const weaponName = weapon?.name ?? (attacker ? state.weapons[attacker.weaponId]?.name : undefined)
    const against = weaponName ? ` against ${attackerName ? `${attackerName}'s ` : ''}${weaponName}` : ''
    headline = `${purpose} — ${rollerName}${against}`
  } else {
    const vs = roll.targetUnitId ? ` vs ${unitNameOf(state, roll.targetUnitId)}` : ''
    headline = `${purpose} — ${rollerName}${weapon ? `'s ${weapon.name}` : ''}${vs}`
  }

  const shown = roll.final.length > 0 ? roll.final : roll.dice
  const modified = roll.final.length > 0 && roll.dice.join(',') !== roll.final.join(',') ? ` (rolled ${roll.dice.join(', ')}, modified to ${shown.join(', ')})` : ''
  return { headline, detail: `Rolled ${shown.join(', ')}${modified}${rerollTargetText(state, events, roll, weapon)}.` }
}

/** The numbers for the save currently being rolled, for a Command Re-roll offer on it — the engine
 *  publishes them on the attack before it rolls (`CurrentAttack.saveTargets`), because that window
 *  opens before `SaveRolled` is emitted. Null when no save is in flight. */
export function saveTargetsInFlight(state: GameState): { sv: number; ap: number; cover: boolean; armour: number; invuln: number | null } | null {
  // Optional all the way down: a label helper is called from render and must never throw on a
  // state shape it didn't expect (a fixture, an old save file, a game that hasn't started).
  return state.phaseState?.attack?.current?.saveTargets ?? null
}

/** The incoming attack behind a save, from the log: which weapon and whose. Used for the attacker's
 *  name beside a save roll; the numbers themselves always come from the engine. */
export function saveAttackContext(state: GameState, events: readonly GameEvent[], modelId: string): { weaponName: string; ap: number; attackerName: string } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type !== 'WoundRolled' && e.type !== 'AttackAllocated') continue
    const weapon = state.weapons[e.attack.weaponId]
    if (!weapon) continue
    return { weaponName: weapon.name, ap: -weapon.rend, attackerName: unitNameOf(state, e.attack.attackerUnitId) }
  }
  return null
}

// ---------- move types (docs/spec/10-rules-core.md R-5.1 to R-5.6) ----------
// Owner playtest: the three move options were bare words, and what each one costs you is the whole
// decision. This spells it out in the unit's own numbers — "Move up to 5"", not "move up to M".

/** A hover-help card: a heading and a few short lines. */
export interface PromptHelp {
  title: string
  lines: string[]
}

/** The unit's Move characteristic. Taken from the datasheet profile: no ability in either Combat
 *  Patrol roster modifies M (only OC, S and A), so this is exact today — if one is ever added, this
 *  should come from the engine the way CurrentAttack.saveTargets does, rather than being re-derived.
 *  Mixed-profile units report their slowest model, which is what the unit can actually keep up with. */
function unitMove(state: GameState, unitId: string): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  let slowest: number | null = null
  for (const modelId of unit.models) {
    const model = state.models[modelId]
    if (!model) continue
    try {
      const M = modelStats(state, model).M
      slowest = slowest === null ? M : Math.min(slowest, M)
    } catch {
      // a model whose profile can't be resolved just doesn't contribute
    }
  }
  return slowest
}

function unitHasWeaponAbility(state: GameState, unitId: string, ability: string): boolean {
  const unit = state.units[unitId]
  if (!unit) return false
  for (const modelId of unit.models) {
    for (const weaponId of state.models[modelId]?.weapons ?? []) {
      if (state.weapons[weaponId]?.abilities.some((a) => a.ability === ability)) return true
    }
  }
  return false
}

/** What one move type means for this particular unit, for the hover help on a `declareMove` prompt (CORE-6).
 *  Null for a type that isn't a move (or a unit that can't be resolved). PORT-0.3: advance = Run, fallBack = Retreat. */
export function moveTypeHelp(state: GameState, unitId: string, moveType: MoveType): PromptHelp | null {
  const unit = state.units[unitId]
  if (!unit) return null
  const M = unitMove(state, unitId)
  const far = M === null ? 'its Move' : `${M}"`

  switch (moveType) {
    case 'normal':
      return {
        title: 'Normal move',
        lines: [
          `Move each model up to ${far}. A unit that starts in combat cannot make a normal move; it must Retreat or stay.`,
          'The unit can still shoot and charge this turn.',
        ],
      }
    case 'advance':
      return {
        title: 'Run',
        lines: [
          M === null
            ? 'Roll a die and add it to the unit\'s Move for this phase.'
            : `Roll a die and add it to the move: ${M + 1}" to ${M + 6}" this phase.`,
          'The unit cannot shoot or charge this turn.',
        ],
      }
    case 'stationary':
      return {
        title: 'Stay put',
        lines: ['No model moves. Nothing is given up: the unit can still shoot and charge.'],
      }
    case 'fallBack':
      return {
        title: 'Retreat',
        lines: [
          `Move each model up to ${far}, and the unit must end the move out of combat with every enemy.`,
          'The unit takes D3 mortal damage first, and cannot shoot or charge this turn.',
        ],
      }
    default:
      return null
  }
}

// ---------- shooting and charge: what an option actually commits you to ----------

/** 2D6 >= `needed`, as a percentage — a charge's whole risk in one number. */
function chargeOdds(needed: number): number {
  let ways = 0
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= needed) ways++
  return Math.round((ways / 36) * 100)
}

function unitModelCount(state: GameState, unitId: string): number {
  return state.units[unitId]?.models.filter((m) => !!state.models[m]).length ?? 0
}

/** Closest approach between any model of two units, in inches (base to base). */
function unitGap(state: GameState, a: string, b: string): number | null {
  let best = Infinity
  for (const am of state.units[a]?.models ?? []) {
    for (const bm of state.units[b]?.models ?? []) {
      const ma = state.models[am]
      const mb = state.models[bm]
      if (!ma || !mb) continue
      best = Math.min(best, horizontalGap(ma, mb))
    }
  }
  return best === Infinity ? null : best
}

const inches = (n: number): string => `${n < 10 ? n.toFixed(1) : Math.round(n)}"`

/** What firing this unit's weapons at one target would mean: the target's own defences, and for each weapon its
 *  Attacks, Hit, Wound, Rend and Damage (CORE-11). Before modifiers, the same caveat the Dice Log carries. */
export function shootingTargetHelp(
  state: GameState,
  targets: readonly { modelId: string; weaponId: string; targetUnitId: string }[],
): PromptHelp | null {
  const first = targets[0]
  if (!first) return null
  const targetUnitId = first.targetUnitId
  const target = state.units[targetUnitId]
  if (!target) return null
  const targetName = target.name ?? targetUnitId
  const defender = state.models[target.models[0]]
  let health: number | null = null
  let save: number | null = null
  let ward: number | null = null
  let noSave = false
  if (defender) {
    try {
      const stats = modelStats(state, defender)
      health = stats.W
      save = stats.Sv
      ward = stats.ward
      noSave = stats.noSave
    } catch {
      // unresolvable profile: the weapon lines below still stand on their own
    }
  }

  const lines: string[] = []
  const gap = unitGap(state, state.models[first.modelId]?.unitId ?? '', targetUnitId)
  lines.push(
    `${targetName}: ${unitModelCount(state, targetUnitId)} model(s)` +
      (health !== null ? `, Health ${health}` : '') +
      (noSave ? ', no Save' : save !== null ? `, Save ${save}+` : '') +
      (ward !== null ? `, Ward ${ward}+` : '') +
      (gap !== null ? ` — ${inches(gap)} away` : ''),
  )

  // One line per distinct weapon, with how many models are firing it.
  const byWeapon = new Map<string, number>()
  for (const t of targets) byWeapon.set(t.weaponId, (byWeapon.get(t.weaponId) ?? 0) + 1)
  const MAX_WEAPON_LINES = 4
  let shown = 0
  for (const [weaponId, count] of byWeapon) {
    const w = state.weapons[weaponId]
    if (!w) continue
    if (shown >= MAX_WEAPON_LINES) {
      lines.push(`…and ${byWeapon.size - shown} more weapon(s).`)
      break
    }
    shown++
    const hit = typeof w.skill === 'number' ? `hits on ${w.skill}+` : 'hits automatically'
    lines.push(`${count}× ${w.name} — ${w.A} attack(s), ${hit}, wounds on ${w.wound}+, Rend ${w.rend}, damage ${w.D}.`)
  }
  return { title: `Shoot ${targetName}`, lines }
}

/** What declaring this charge would need: the 2D6 roll and the odds. There are no declared targets in Spearhead
 *  (CORE-9.4), so `targetUnitIds` is just the units the prompt is hovering over. `needed` comes from the engine's own
 *  `neededChargeDistance`, the same function the charge roll is judged against. */
export function chargeTargetHelp(state: GameState, unitId: string, targetUnitIds: readonly string[]): PromptHelp | null {
  if (targetUnitIds.length === 0) return null
  const names = targetUnitIds.map((id) => state.units[id]?.name ?? id)
  let needed: number | null = null
  try {
    needed = neededChargeDistance(state, unitId, [...targetUnitIds])
  } catch {
    needed = null
  }
  const lines: string[] = []
  if (needed === null) {
    lines.push('The distance to this target cannot be measured from here.')
  } else {
    const roll = Math.max(2, Math.ceil(needed))
    lines.push(`Closest model is ${inches(needed)} short of touching distance — the 2D6 charge roll needs ${roll}+ (${chargeOdds(roll)}%).`)
  }
  lines.push('A charging unit must finish within ½" of an enemy model. A failed charge leaves the unit where it was.')
  return { title: `Charge ${names.join(' and ')}`, lines }
}
