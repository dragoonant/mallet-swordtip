// The single decision prompt (docs/spec/50-client.md §6). Bespoke controls for deployment and the
// four move-family decisions (which need a board click, handled by src/client/interaction/**); every
// other decision kind — including declareTargets/declareCharge, which also accept a click on an enemy
// Figure via UnitsLayer — renders as a plain clickable list here, so no decision can ever get stuck.
import { FloorSelector } from '../interaction/FloorSelector'
import { isClampedMovePending } from '../interaction/moveClamp'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  unitModels,
  type Action, type ChooseOptionTopic, type DecisionOption, type GameEvent, type GameState, type MoveType, type PendingDecision, type PlayerId, type StratagemId,
} from '@/engine'
import { transportService } from '@/engine/transports'
import { useGameStore } from '../store/game'
import { useUiStore } from './uiStore'
import {
  combinedUnitIds, combinedUnitModels, distance2D, formationPlacementsForUnit, modelsAnchor, placementInfo, validateDraft,
  isApproachPending, startDraft, autoDraft, validateApproach, fightersAfter,
} from '../interaction'
import { neededChargeDistance } from '@/engine/phases/charge'
import {
  chargeTargetHelp, moveTypeHelp, objectiveLabel, prettifyId, saveAttackContext,
  shootingTargetHelp, type PromptHelp,
} from './labels'
import { commitStagedDraft } from '../interaction/commitDraft'
import { FormationPicker } from './FormationPicker'
import { requestCameraOverview } from '../board/CameraRig'
import { WeaponPanel } from './WeaponPanel'
import { opensWeaponPanel } from '../interaction/decisions'
import { isOversizeForZone } from '../../engine/geometry'
import { suggestDeployment } from '../../engine/setup'
import { groupLabel, groupUnitIds, soleDeployUnit } from '../interaction/embarkGroup'
import { rerollTrayModel, rollForOffer } from './rerollInfo'
import { RerollTray } from './RerollTray'
import { useCaughtUp } from '../presentation/presentedStore'
import { buttonBase, buttonDanger, buttonPrimary, colors, fontStack, mutedText, panel } from './theme'
import { Tooltip } from './Tooltip'
import { BottomSheet } from './BottomSheet'
import { useFormFactor } from './formFactor'

/** The nearest thing worth orienting a move/charge/pile-in/consolidate destination against — an
 *  objective it lands on, or the nearest enemy unit — so a suggested placement reads as "toward
 *  Boyz, 5.2"" instead of a bare distance. */
function nearestReference(state: GameState, player: PlayerId, at: { x: number; z: number }): string | null {
  let objective: { id: string; d: number } | null = null
  for (const o of Object.values(state.objectives)) {
    if (o.removed) continue
    const d = Math.hypot(at.x - o.pos.x, at.z - o.pos.z)
    if (!objective || d < objective.d) objective = { id: o.id, d }
  }
  if (objective && objective.d <= 3) return `onto ${objective.id} objective`

  let enemy: { name: string; d: number } | null = null
  for (const u of Object.values(state.units)) {
    if (u.player === player || u.location !== 'board') continue
    for (const modelId of u.models) {
      const m = state.models[modelId]
      if (!m) continue
      const d = Math.hypot(at.x - m.pos.x, at.z - m.pos.z)
      if (!enemy || d < enemy.d) enemy = { name: u.name, d }
    }
  }
  return enemy ? `toward ${enemy.name}` : null
}

/** "5.2\" toward Boyz" (or "3.0\" onto west objective") for a moveUnit/chargeMove/pileIn/consolidate
 *  action's placements, relative to the unit's current position — the raw ModelPlacement[] on its
 *  own tells a human nothing about where the suggestion actually goes. */
function placementSummary(state: GameState, unitId: string, placements: { pos: { x: number; z: number } }[]): string {
  const unit = state.units[unitId]
  const models = unitModels(state, unitId)
  if (!unit || models.length === 0 || placements.length === 0) return ''
  const from = modelsAnchor(models)
  const to = { x: placements.reduce((s, p) => s + p.pos.x, 0) / placements.length, z: placements.reduce((s, p) => s + p.pos.z, 0) / placements.length }
  const dist = distance2D(from, to)
  const ref = nearestReference(state, unit.player, to)
  return `${dist.toFixed(1)}"${ref ? ` ${ref}` : ''}`
}

/** Edge-to-edge gap a charging unit still needs to close against the hardest of its declared
 *  targets — the same "roll 2D6, need at least this many inches" a player would work out by eye. */

const KIND_TITLE: Partial<Record<PendingDecision['kind'], string>> = {
  deployUnit: 'Deploy your forces',
  chooseUnitToActivate: 'Choose a unit',
  declareMove: 'Choose a move',
  moveUnit: 'Move the unit',
  declareTargets: 'Choose targets',
  allocateAttack: 'Allocate the attack',
  declareCharge: 'Charge!',
  chargeMove: 'Make the charge move',
  pileIn: 'Pile in',
  consolidate: 'Move',
  chooseFightUnit: 'Choose who fights next',
  chooseOption: 'Choose an option',
  confirm: 'Confirm',
}

/** Per-topic title + one-line explanation of what picking an option actually does — chooseOption's
 *  own KIND_TITLE was one generic label for every mission/secondary/rules-engine pick (M6 gap). */
const CHOOSE_OPTION_INFO: Partial<Record<ChooseOptionTopic, { title: string; hint: string }>> = {
  desperateEscapeCasualty: { title: 'Desperate Escape casualty', hint: 'Choose which model is removed after a failed Desperate Escape roll.' },
  coherencyCull: { title: 'Unit coherency', hint: 'Choose which model(s) to remove so the rest of the unit stays within coherency.' },
  meleeWeapon: { title: 'Choose a melee weapon', hint: "Pick which of this model's melee weapons to fight with." },
  weaponProfile: { title: 'Choose a weapon profile', hint: 'Pick which profile of this weapon to fire.' },
  reserveArrival: { title: 'Bring on reinforcements', hint: 'Choose where this unit arrives from reserves.' },
  leaderAttach: { title: 'Attach a leader', hint: 'Choose which bodyguard unit this leader joins.' },
  hazardousCasualty: { title: 'Hazardous casualty', hint: 'A model must be removed for failing its Hazardous test.' },
  rerollOffer: { title: 'Re-roll a die?', hint: 'Choose a die to re-roll, or keep the result.' },
  abilityChoice: { title: 'Ability choice', hint: 'Choose how this ability applies.' },
  critChoice: { title: 'Pick a critical-hit effect', hint: 'This weapon has more than one critical-hit ability. Pick the one it uses for this attack; the others are ignored.' },
  chooseSide: { title: 'Choose your side', hint: 'Pick which deployment zone your army sets up in.' },
  // Spearhead (13-port-plan §2.1)
  chooseAttacker: { title: 'Attacker or defender?', hint: 'You won the roll-off. The attacker sets up first and picks their army options first; the defender picks the map side and territory, and sets up terrain first.' },
  armyOptions: { title: 'Choose army options', hint: 'Pick one regiment ability for the battle and one enhancement for your general.' },
  battlefieldSide: { title: 'Choose the battlefield side', hint: 'Pick which side of the realm battlefield is played. It fixes the objective layout.' },
  deploymentMap: { title: 'Choose the deployment map', hint: 'Pick how the board is split into two territories, and which one is yours.' },
  placeTerrain: { title: 'Place a terrain feature', hint: 'Choose where this feature stands. It must be clear of objectives and other terrain.' },
  firstTurn: { title: 'Who takes the first turn?', hint: 'Going first means you act first this round, then your opponent. The other player takes the second turn.' },
  priorityChoice: { title: 'You won the priority roll', hint: 'Choose who takes the first turn of this round. If you pick your opponent, you get the last turn of this round and the first of the next: a double turn.' },
  abilityUse: { title: 'Use an ability?', hint: 'Pick an ability to use now, or pass. Each ability can be used at this timing, and army abilities once per turn.' },
  abilityTarget: { title: 'Choose a target', hint: 'Pick the unit this ability affects.' },
  abilityMode: { title: 'Choose an effect', hint: 'This ability has more than one effect. Pick one.' },
  pileInTarget: { title: 'Choose where to pile in', hint: 'Pick the enemy unit this unit moves toward when it piles in (up to 3").' },
  contestedObjective: { title: 'Which objective does this unit contest?', hint: 'The unit touches more than one objective circle. It counts toward one of them.' },
  // Spearhead cards (src/engine/cards.ts)
  twistPick: { title: 'Twist: make your choice', hint: "This round's twist asks you to choose. The choice lasts until the end of the battle round." },
  discardTactics: { title: 'Discard battle tactics?', hint: 'Discard any cards you do not want, one at a time, then keep the rest. You draw back up to three afterwards.' },
  scoreTactics: { title: 'Battle tactic complete!', hint: 'You met the condition on these cards this turn. Score each one for 1 VP (it goes to your scored pile).' },
  extraTactic: { title: 'Draw extra battle tactics?', hint: 'Your general lets you look deeper into the deck: draw the extra cards now, then put the same number back under the deck. Pass to keep the hand you have.' },
  bottomTactic: { title: 'Put a battle tactic back', hint: 'Choose a card from your hand to tuck under the deck (it can come round again much later). Pick on the cards at the left, or use the buttons.' },
  tacticCommand: { title: 'Play a command?', hint: "Spend a battle tactic card for its command. The card is discarded and can no longer be scored. Pass to keep your cards." },
}

/** An ability prompt whose every real option ends in a distance, e.g. `Toward Dracothion (12.0")`: the options are headings for a slide. */
function isHeadingList(options?: readonly { id: string; label?: string }[]): boolean {
  const real = (options ?? []).filter((o) => typeof o.label === 'string')
  return real.length >= 2 && real.every((o) => /\(\d+(\.\d+)?"\)$/.test(o.label!))
}

/** "enemy" / "friendly" when every option of an ability-target prompt is a unit of that side, else null. */
function targetSide(options: readonly { id: string }[] | undefined, state: GameState | undefined, player: string | undefined): 'enemy' | 'friendly' | null {
  if (!options || !state || !player || options.length === 0) return null
  const units = options.map((o) => state.units[o.id])
  if (units.some((u) => !u)) return null
  if (units.every((u) => u.player !== player)) return 'enemy'
  if (units.every((u) => u.player === player)) return 'friendly'
  return null
}

export function chooseOptionInfoFor(
  context: { topic: ChooseOptionTopic; abilityId: string | null; unitId?: string | null; data?: Record<string, unknown> },
  options?: readonly { id: string; label?: string }[],
  state?: GameState,
  player?: string,
): { title: string; hint: string } | undefined {
  if (context.topic === 'other' && context.data?.kind === 'embark') {
    const uname = context.unitId && state ? groupLabel(state, context.unitId) : undefined
    return {
      title: `Embark ${uname ?? 'this unit'}?`,
      hint: 'The unit finishes its move beside a friendly transport. Climbing aboard takes it off the battlefield; staying keeps it on the board where it is.',
    }
  }
  // twist picks name their card, and say what kind of thing is being picked
  if (context.topic === 'twistPick' && typeof context.data?.label === 'string') {
    const kind = context.data.kind === 'objective' ? 'Pick an objective' : context.data.kind === 'friendlyUnit' ? 'Pick one of your units' : context.data.kind === 'enemyUnit' ? 'Pick an enemy unit' : 'Pick an effect'
    return { title: `Twist · ${context.data.label}`, hint: `${kind}. The choice lasts until the end of the battle round. Open the twist card (bottom left) to read it in full.` }
  }
  if (context.topic === 'extraTactic' && typeof context.data?.count === 'number') {
    const n = context.data.count
    return {
      title: `Draw ${n} extra battle tactic ${n === 1 ? 'card' : 'cards'}?`,
      hint: `Your general lets you look deeper into the deck: draw ${n === 1 ? 'one more card' : `${n} more cards`} now, then put ${n === 1 ? 'one card' : `${n} cards`} back under the deck. Pass to keep the hand you have.`,
    }
  }
  // A unit lifted off the board by an ability (Magmic Tunnels) is set up again: the spots are board positions, shown on hover
  if (context.topic === 'abilityMode' && context.data?.redeploy === true) {
    const uname = context.unitId && state ? groupLabel(state, context.unitId) : undefined
    return {
      title: `Set up ${uname ?? 'the unit'} again`,
      hint: `The unit was lifted off the battlefield. Pick the spot where it stands again; the candidate spots are ringed on the board, and the one you point at lights up. Pass to put it back where it was.`,
    }
  }
  // A unit sliding or retreating under an ability's power (A Proper Ruckus, Careening Destruction, a Frigate's Disengage): options are headings
  if (context.topic === 'abilityMode' && context.data?.move === true) {
    const uname = context.unitId && state ? groupLabel(state, context.unitId) : undefined
    return {
      title: `Move ${uname ?? 'the unit'}`,
      hint: `Pick a heading and the unit slides that way in a straight line (the distance is in the label). It cannot end in a spot it could not stand in. Leave it here keeps the unit where it is.`,
    }
  }
  // A replacement unit is set up on the board (Call for Reinforcements and kin)
  if (context.topic === 'abilityMode' && context.data?.place === true) {
    const uname = context.unitId && state ? groupLabel(state, context.unitId) : undefined
    return { title: `Set up ${uname ?? 'the replacement'}`, hint: 'Choose where the unit appears. Every spot offered is legal.' }
  }
  // F14: a weapon with two critical-hit abilities (core rules 20.0): the attacker picks one before any dice are rolled.
  if (context.topic === 'critChoice') {
    const weapon = typeof context.data?.weaponName === 'string' ? context.data.weaponName : undefined
    const target = typeof context.data?.targetUnitId === 'string' && state ? state.units[context.data.targetUnitId]?.name : undefined
    return {
      title: `${weapon ?? 'This weapon'}: pick a critical-hit effect`,
      hint: `Only one of its critical-hit abilities counts for this attack${target ? ` on ${target}` : ''}. Each option shows the average extra damage that effect is worth per critical hit; the unit being attacked lights up on the board.`,
    }
  }
  // F14: Nurgle's Embrace spends the army's disease points one at a time on an enemy unit in combat with it.
  if (context.topic === 'abilityChoice' && typeof context.data?.points === 'number' && context.abilityId && state?.abilities[context.abilityId]) {
    const left = context.data.points
    return {
      title: `${state.abilities[context.abilityId].name}: spend a disease point`,
      hint: `${left} disease point${left === 1 ? '' : 's'} left. Pick an enemy unit in combat with your army: each point spent there is a dice roll, and a 5+ is 1 mortal damage. Pass to stop spending.`,
    }
  }
  // Any other ability prompt carries the ability's own name, so "Choose an effect" says which ability is asking
  // (Storm Brewing's edge, Wind Whisperer, Careening Destruction, Guide the Gusts ...).
  const ab = context.abilityId && state ? state.abilities[context.abilityId] : undefined
  if (ab && (context.topic === 'abilityMode' || context.topic === 'abilityTarget')) {
    const base = CHOOSE_OPTION_INFO[context.topic]
    // An ability that slides a unit along a chosen line (Careening Destruction) lists its headings as the effects
    if (context.topic === 'abilityMode' && isHeadingList(options)) {
      return {
        title: `${ab.name}: pick a heading`,
        hint: 'Pick the line the unit travels along; the distance is in each label. It moves in a straight line and cannot end in a spot it could not stand in. Pass to leave it where it is.',
      }
    }
    const side = context.topic === 'abilityTarget' ? targetSide(options, state, player) : null
    return {
      title: `${ab.name}: ${context.topic === 'abilityTarget' ? 'choose a target' : 'choose an effect'}`,
      hint: side === 'enemy' ? 'Pick the enemy unit this ability hits.' : side === 'friendly' ? 'Pick the friendly unit this ability affects.' : base?.hint ?? '',
    }
  }
  return CHOOSE_OPTION_INFO[context.topic]
}

/** Pass buttons whose engine word reads as giving something up. */
function passLabelFor(pending: PendingDecision): string {
  if (pending.kind === 'chooseOption') {
    if (pending.context.topic === 'extraTactic') return 'Keep my hand'
    if (pending.context.topic === 'abilityMode' && pending.context.data?.redeploy === true) return 'Leave it where it was'
    if (pending.context.topic === 'abilityMode' && pending.context.data?.move === true) return 'Leave it here'
  }
  return PASS_LABEL[pending.kind] ?? 'Pass'
}

/** "Pass" is the engine's word for declining, but for some prompts it reads as giving something up
 *  rather than as the safe half of the choice the player was offered. */
const PASS_LABEL: Partial<Record<PendingDecision['kind'], string>> = {
  commandReroll: 'Keep the roll',
  declareTargets: 'Fire nothing',
}

const MOVE_TYPE_LABEL: Partial<Record<MoveType, string>> = {
  normal: 'Normal move',
  advance: 'Run',
  stationary: 'Stay put',
  fallBack: 'Retreat',
}

const REACTION_LABEL: Record<string, string> = {
  overwatch: 'Fire Overwatch',
  heroicIntervention: 'Heroic Intervention',
  rapidIngress: 'Rapid Ingress',
  counterOffensive: 'Counter-offensive',
}

/** "Boy #3 · 2 wounds left" — which figure a model id is and how hurt it already is. The raw
 *  datasheetModelId ("boy", "terminator") says nothing about *which* one; its place in the unit and
 *  the wounds it has left do, and that is what a pick between models is actually about. */
function modelLabel(state: GameState, modelId: string): string {
  const model = state.models[modelId]
  if (!model) return modelId
  const index = state.units[model.unitId]?.models.indexOf(modelId) ?? -1
  const w = model.woundsRemaining
  return `${prettifyId(model.datasheetModelId)}${index >= 0 ? ` #${index + 1}` : ''} · ${w} ${w === 1 ? 'wound' : 'wounds'} left`
}

function describeAction(a: Action, state: GameState): string {
  const unitName = (id: string) => state.units[id]?.name ?? id
  switch (a.type) {
    case 'pass':
      return 'Pass'
    case 'chooseUnitToActivate': {
      const tid = a.unitId && state.phase === 'movement' ? transportService.transportOf(state, a.unitId) : null
      return tid ? `Disembark ${groupLabel(state, a.unitId)} from ${unitName(tid)}` : `Activate ${unitName(a.unitId)}`
    }
    case 'chooseFightUnit':
      return `Fight with ${unitName(a.unitId)}`
    case 'declareMove':
      // Matches the help card's own titles (labels.ts moveTypeHelp), and reads as the rulebook does
      // rather than as the enum does ("fallBack move").
      return MOVE_TYPE_LABEL[a.moveType] ?? a.moveType
    case 'declareTargets':
      return a.targets.length > 0 ? `Target ${unitName(a.targets[0].targetUnitId)}` : 'Hold fire'
    case 'declareCharge': {
      const names = a.targetUnitIds.map(unitName).join(', ')
      // The engine's own number (phases/charge.ts), so the button, the hover card and the roll the
      // dice are judged against are all the same figure. The label this replaced measured something
      // else — 3D distance, no Engagement Range subtracted, worst target rather than closest — and
      // read "need 12.6"" beside a card correctly saying the roll needed a 10.
      const needed = neededChargeDistance(state, a.unitId, a.targetUnitIds)
      return needed !== null ? `Charge ${names} — needs ${Math.max(2, Math.ceil(needed))}+` : `Charge ${names}`
    }
    case 'moveUnit':
    case 'chargeMove':
    case 'pileIn':
    case 'consolidate': {
      const verb = { moveUnit: 'Move', chargeMove: 'Charge move', pileIn: 'Pile in', consolidate: 'Consolidate' }[a.type]
      const summary = placementSummary(state, a.unitId, a.placements)
      if (/^0\.0"/.test(summary)) return a.type === 'moveUnit' ? 'Stay where it is' : `${verb}: stay in place`
      return summary ? `${verb} ${summary}` : verb
    }
    case 'allocateAttack': {
      // The raw datasheetModelId ("boy", "terminator") says nothing about *which* one — its place in
      // the unit and the wounds it has left do, and that is what the choice is actually about. Hover
      // lights the figure itself (hoverTargetFor).
      return state.models[a.modelId] ? modelLabel(state, a.modelId) : `Allocate to ${a.modelId}`
    }
    case 'useStratagem': {
      const strat = state.stratagems[a.stratagemId]
      const name = strat?.name ?? a.stratagemId
      const cost = ''
      const targets: string[] = (a.targets.unitIds ?? []).map(unitName)
      for (const mid of a.targets.modelIds ?? []) targets.push(state.models[mid] ? modelLabel(state, mid) : mid)
      if (a.targets.objectiveId) targets.push(objectiveLabel(a.targets.objectiveId))
      return `${name}${cost}${targets.length > 0 ? `: ${targets.join(', ')}` : ''}`
    }
    case 'commandReroll':
      return 'Re-roll'
    case 'confirm':
      return 'Confirm'
    case 'chooseOption':
      return a.optionId
    case 'resign':
      return 'Resign'
    case 'deployUnit':
      return a.toReserves ? `Hold ${unitName(a.unitId)} in reserve` : `Deploy ${unitName(a.unitId)} here`
    default:
      // Exhaustive today, but a future Action variant should still render as *something* clickable
      // rather than crash — hence the cast (this branch is unreachable for the current union).
      return `${(a as Action).type} option`
  }
}

/** chooseOption topics whose option ids are model ids (which figure is removed). */
const MODEL_PICK_TOPICS: ReadonlySet<ChooseOptionTopic> = new Set<ChooseOptionTopic>(['hazardousCasualty', 'desperateEscapeCasualty', 'coherencyCull'])

/** Label a single option button for the kinds whose engine-provided DecisionOption.label is either
 *  a raw id ("A:terminator-squad", a bare objective id) or too terse to explain the choice — everyone
 *  else keeps the engine's own label untouched. */
function labelForOption(pending: PendingDecision, state: GameState, events: readonly GameEvent[], o: { id: string; label: string; action: Action }): string {
  switch (pending.kind) {
    case 'chooseUnitToActivate':
    case 'chooseFightUnit':
    case 'stratagemWindow':
    case 'reactionWindow':
    // The engine labels these with the bare move type ('normal', 'fallBack').
    case 'declareMove':
    // The engine labels these "allocate to A:terminator-squad#0" — a model id, which says nothing
    // about which figure it is or how hurt it already is.
    case 'allocateAttack':
      return describeAction(o.action, state)
    case 'chooseOption': {
      // The engine labels these "remove M:boy#3" — a model id; say which figure it is instead.
      if (MODEL_PICK_TOPICS.has(pending.context.topic) && state.models[o.id]) return modelLabel(state, o.id)
      if (pending.context.topic === 'other' && pending.context.data?.kind === 'embark') {
        if (o.id === 'stay') return 'Stay on the battlefield'
        const tr = state.units[o.id.replace(/^embark:/, '')]
        if (tr) return `Embark ${pending.context.unitId ? groupLabel(state, pending.context.unitId) : 'the unit'} into ${tr.name}`
      }
      // A slide prompt already names its unit in the title; drop the engine's repeated "Unit name: " from every heading.
      const uid = pending.context.unitId
      const uname = uid ? state.units[uid]?.name : undefined
      if (uname && pending.context.topic === 'abilityMode' && o.label.startsWith(`${uname}: `)) return o.label.slice(uname.length + 2)
      // A critical-hit pick shows what each effect is worth (the engine's expected damage per critical hit).
      if (pending.context.topic === 'critChoice') {
        const v = pending.options.find((x) => x.id === o.id)?.hint?.value
        if (typeof v === 'number') return `${o.label} (about ${v.toFixed(2)} damage per critical hit)`
      }
      return o.label
    }
    default:
      return o.label
  }
}

/** The hover-help card for an option, where one can be written. These are the choices whose options
 *  are rules in disguise: what each commits the unit to is the decision, and the button can only
 *  carry a name. */
function helpForAction(state: GameState, action: Action | undefined): PromptHelp | null {
  if (!action) return null
  switch (action.type) {
    case 'declareMove':
      return moveTypeHelp(state, action.unitId, action.moveType)
    case 'declareTargets':
      return shootingTargetHelp(state, action.targets)
    case 'declareCharge':
      return chargeTargetHelp(state, action.unitId, action.targetUnitIds)
    default:
      return null
  }
}

/** What an option is "about", for the board-hover highlight (M6 gap: prompts named units/objectives
 *  the player couldn't match to the board; owner playtest: the same for allocateAttack's models —
 *  "when I hover over the button it should light up the appropriate figure on the game board").
 *  Every option that names a unit gets one: where it names two (attacker and target) the target wins,
 *  because the acting unit is already the one the player is looking at. */
type HoverTarget = { kind: 'unit'; ids: string[] } | { kind: 'model'; id: string } | { kind: 'objective'; id: string } | { kind: 'spot'; id: string; unitId: string | null }

/** The board position a redeploy option (`at:<x>:<z>`) names, else null. */
export function spotOfOption(optionId: string): { x: number; z: number } | null {
  const m = /^at:(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)$/.exec(optionId)
  return m ? { x: Number(m[1]), z: Number(m[2]) } : null
}

const isRedeploy = (pending: PendingDecision): boolean => pending.kind === 'chooseOption' && pending.context.topic === 'abilityMode' && pending.context.data?.redeploy === true

const unitsOf = (ids: readonly string[]): HoverTarget | null => (ids.length > 0 ? { kind: 'unit', ids: [...new Set(ids)] } : null)

function hoverTargetFor(state: GameState, pending: PendingDecision, action: Action, optionId: string): HoverTarget | null {
  switch (action.type) {
    // Allocating an attack picks one model out of a unit, so the highlight has to be that one figure.
    case 'allocateAttack':
      return { kind: 'model', id: action.modelId }
    // Shooting and charge options name the enemy unit(s) to hit: light them up so "which one is that?"
    // never needs asking.
    case 'declareTargets':
      return unitsOf(action.targets.map((t) => t.targetUnitId))
    case 'declareCharge':
      return unitsOf(action.targetUnitIds)
    // Picking which of your own units acts (activate / fight / move type / suggested placement / deploy).
    case 'chooseUnitToActivate':
    case 'chooseFightUnit':
    case 'declareMove':
    case 'moveUnit':
    case 'chargeMove':
    case 'pileIn':
    case 'consolidate':
    case 'deployUnit':
      return unitsOf([action.unitId])
    case 'useStratagem': {
      const t = action.targets
      if (t.unitIds && t.unitIds.length > 0) return unitsOf(t.unitIds)
      if (t.modelIds && t.modelIds.length > 0) return { kind: 'model', id: t.modelIds[0] }
      if (t.objectiveId) return { kind: 'objective', id: t.objectiveId }
      return null
    }
    case 'chooseOption': {
      // Unit-naming prompts (leader attach, twist picks) name a unit by id; the model-removal prompts name a
      // model; objective prompts name an objective. A pick between
      // weapons or ability modes has no board object of its own, so it lights the unit it is about.
      if (pending.kind !== 'chooseOption' || pending.context.topic === 'rerollOffer') return null
      // A critical-hit pick is about the unit being attacked, not the attacker.
      if (pending.context.topic === 'critChoice' && typeof pending.context.data?.targetUnitId === 'string') return unitsOf([pending.context.data.targetUnitId])
      // A redeploy spot: the position itself lights up on the board, and so does the unit that is being set up
      if (isRedeploy(pending) && spotOfOption(optionId)) return { kind: 'spot', id: optionId, unitId: pending.context.unitId ?? null }
      if (state.units[optionId]) return { kind: 'unit', ids: [optionId] }
      if (state.models[optionId]) return { kind: 'model', id: optionId }
      if (state.objectives[optionId]) return { kind: 'objective', id: optionId }
      return pending.context.unitId ? unitsOf([pending.context.unitId]) : null
    }
    default:
      return null
  }
}

// A pending decision is player input the game is blocked on — it must never be visually covered (and,
// more importantly, never have its buttons occluded from pointer hit-testing) by anything else on
// screen, including the dice tray (src/client/dice/DiceTray.tsx, zIndex 20) sharing this same bottom-
// centre real estate while an attack's dice are still animating. Every one of this file's own absolutely-
// positioned containers (wrap/deployWrap/bannerWrap) sits above that.
const PROMPT_Z_INDEX = 30
const wrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  left: '50%',
  bottom: 10,
  transform: 'translateX(-50%)',
  width: 460,
  maxWidth: 'calc(100vw - 440px)',
  padding: '10px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  pointerEvents: 'auto',
  zIndex: PROMPT_Z_INDEX,
}
// Deployment-only dock: a wide, short strip along the very bottom of the screen (owner playtest
// 2026-10: the old tall left sidebar ate too much of the board). Combat Patrol's deployment zones
// (src/data/missions/cp-0*.json) are full-board-width strips hugging the board's near/far edge, which
// with the overview camera project to bands ending around ~74% of viewport height — so the strip is
// capped well under a quarter of the height and its roster scrolls inside it rather than growing up
// into the near-side zone. Left/right insets clear the Stratagems tab (bottom-left) and the event-log
// drawer tab (right edge).
const deployWrap: CSSProperties = {
  ...panel,
  position: 'absolute',
  left: 200,
  right: 56,
  bottom: 10,
  maxHeight: '22vh',
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  overflowY: 'auto',
  pointerEvents: 'auto',
  zIndex: PROMPT_Z_INDEX,
}
// --- compact (phone) variants: used only when useFormFactor().compact, inside the BottomSheet ---
const TOUCH_MIN = 44
/** Touch-size a button style: >= 44px tall. */
const touchBtn = (b: CSSProperties, extra: CSSProperties = {}): CSSProperties => ({ ...b, minHeight: TOUCH_MIN, fontSize: 14, padding: '0 16px', ...extra })
const rowCompact: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }
const deployRowCompact: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const optionListCompact: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
// phone landscape strip (BottomSheet `strip`): one horizontally scrolling row per list, options first, the rest of the prompt below it
const optionListStrip: CSSProperties = { display: 'flex', gap: 8, order: -1 }
const deployRowStrip: CSSProperties = { display: 'flex', gap: 8, flex: '1 1 0%', minWidth: 0, order: -1 }
const autoRowStrip: CSSProperties = { display: 'flex', flexWrap: 'nowrap', gap: 6, alignItems: 'center', flex: '0 0 auto', order: -1 }
const optionBtnCompact: CSSProperties = { whiteSpace: 'normal', textAlign: 'left', flex: '1 1 200px', lineHeight: 1.25, padding: '8px 12px', minHeight: TOUCH_MIN, fontSize: 14 }
/** Pick-to-confirm bar on touch: the tapped choice's name on a wide button, plus a way to back out. */
const armedChooseBtn: CSSProperties = { flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }
const heading: CSSProperties = { fontWeight: 700, fontSize: 14, paddingRight: 30 }
const hint: CSSProperties = { ...mutedText }
const infoBlock: CSSProperties = { ...mutedText, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px' }

/** Info block under the prompt title. When `collapsible` (phone layout with an action panel such as the weapon panel
 *  open) it folds to a single ellipsised line with a "More" toggle so the panel's action row keeps the room; the
 *  whole line is the 44px tap target. Otherwise it renders exactly the original two-part block. It is a div with
 *  role="button", not a <button>, only so the sheet's blanket button sizing doesn't apply to the expanded text. */
function CollapsibleInfo({ testId, head, collapsible, children }: { testId: string; head: string; collapsible: boolean; children: ReactNode }) {
  const [more, setMore] = useState(false)
  if (!collapsible) {
    return (
      <div style={infoBlock} data-testid={testId}>
        <div style={{ color: colors.text, fontWeight: 600 }}>{head}</div>
        <div>{children}</div>
      </div>
    )
  }
  const toggle = () => setMore((m) => !m)
  return (
    <div style={{ ...infoBlock, padding: '0 8px' }} data-testid={testId} data-collapsed={more ? 'false' : 'true'}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={more}
        data-testid={`${testId}-more`}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: TOUCH_MIN, cursor: 'pointer', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <span style={{ flex: '1 1 auto', minWidth: 0, color: colors.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{head}</span>
        <span style={{ flex: '0 0 auto', color: colors.accent, fontWeight: 600 }}>{more ? 'Less ▴' : 'More ▾'}</span>
      </div>
      {more && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  )
}
const stratList: CSSProperties = { margin: '4px 0 0 16px', padding: 0, fontSize: 11.5 }
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }
/** The deploy palette (unit chips + Reserves buttons) as one wrapping row for the bottom strip
 *  (`deployWrap`); it scrolls inside its own box past two rows so the strip stays short. */
const deployRowWide: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 96, overflowY: 'auto' }
const optionList: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 130, overflowY: 'auto' }
/** How long the pointer has to rest on an option before its help appears — long enough that moving
 *  across the row to the option you want doesn't flash three cards on the way. */
const HELP_DELAY_MS = 450
// Anchored to the prompt panel, not to the hovered button: the option row is an overflow:auto
// scroller (`optionList`), which clips anything positioned outside its box — a card above a button
// was in the DOM and measurable, but painted away to nothing.
const helpCard: CSSProperties = {
  ...panel,
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  left: 0,
  width: 300,
  padding: '8px 10px',
  fontSize: 12,
  lineHeight: 1.45,
  pointerEvents: 'none', // never steals the click the player is about to make
  zIndex: 40,
}
const helpTitle: CSSProperties = { fontWeight: 700, marginBottom: 4 }
/** On a phone the help card sits in the sheet's scrolling body instead of floating over the board. */
const helpCardInline: CSSProperties = { ...helpCard, position: 'static', bottom: 'auto', width: 'auto', pointerEvents: 'auto' }

/** Hover help for one option, shown above the row (the prompt itself is at the bottom of the
 *  screen, so a card below it would be off-screen). */
function OptionHelp({ help, inline = false }: { help: PromptHelp; inline?: boolean }) {
  return (
    <div style={inline ? helpCardInline : helpCard} data-testid="option-help" role="tooltip">
      <div style={helpTitle}>{help.title}</div>
      {help.lines.map((line, i) => (
        <div key={i} style={{ color: i === 0 ? colors.text : colors.muted, marginTop: i === 0 ? 0 : 3 }}>
          {line}
        </div>
      ))}
    </div>
  )
}
function hasOptions(p: PendingDecision): p is Extract<PendingDecision, { options: DecisionOption[] }> {
  return 'options' in p
}

const bannerWrap: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 12,
  transform: 'translateX(-50%)',
  fontFamily: fontStack,
  color: colors.muted,
  background: colors.bg,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '8px 16px',
  zIndex: PROMPT_Z_INDEX,
}

/** The prompt can be tucked away so it never hides the board (owner: an Overwatch prompt covered most of
 *  the screen): a minimise button in the panel's corner, and a pill in its place to bring it back. */
export function DecisionPrompt() {
  const pending = useGameStore((s) => s.pending)
  const botSeat = useGameStore((s) => s.botSeat)
  const minimizedFor = useUiStore((s) => s.promptMinimizedFor)
  const minimizePrompt = useUiStore((s) => s.minimizePrompt)
  const minimized = !!pending && pending.player !== botSeat && minimizedFor === pending.id
  return (
    <>
      <div style={{ display: minimized ? 'none' : 'contents' }}>
        <DecisionPromptBody />
      </div>
      {minimized && (
        <button style={{ ...bannerWrap, ...buttonPrimary, cursor: 'pointer', pointerEvents: 'auto' }} data-testid="btn-prompt-restore" onClick={() => minimizePrompt(null)}>
          ▲ Show prompt: {KIND_TITLE[pending.kind] ?? 'decision'}
        </button>
      )}
    </>
  )
}

function MinimizeButton({ decisionId }: { decisionId: string }) {
  const minimizePrompt = useUiStore((s) => s.minimizePrompt)
  return (
    <Tooltip title="Minimise" body="Hide this prompt to see the board. A button at the bottom brings it back.">
      <button
        style={{ ...buttonBase, position: 'absolute', top: 6, right: 6, padding: '0 8px', lineHeight: '20px', fontSize: 14 }}
        data-testid="btn-prompt-minimize"
        aria-label="Minimise prompt"
        onClick={() => minimizePrompt(decisionId)}
      >
        –
      </button>
    </Tooltip>
  )
}

function DecisionPromptBody() {
  const state = useGameStore((s) => s.state)
  const pending = useGameStore((s) => s.pending)
  const legal = useGameStore((s) => s.legal)
  const events = useGameStore((s) => s.events)
  const pendingSeq = useGameStore((s) => s.pendingSeq)
  const caughtUp = useCaughtUp(pendingSeq)
  const botSeat = useGameStore((s) => s.botSeat)
  const dispatch = useGameStore((s) => s.dispatch)
  const draft = useUiStore((s) => s.draft)
  const setDraft = useUiStore((s) => s.setDraft)
  const setPreviewDraft = useUiStore((s) => s.setPreviewDraft)
  const deployFramed = useRef(false)
  const humanDeployLeft = useRef(0)
  const deployTargetUnitId = useUiStore((s) => s.deployTargetUnitId)
  const setDeployTarget = useUiStore((s) => s.setDeployTarget)
  const autoDeployFor = useUiStore((s) => s.autoDeployFor)
  const setAutoDeployFor = useUiStore((s) => s.setAutoDeployFor)
  const resetForDecision = useUiStore((s) => s.resetForDecision)
  const hoverUnit = useUiStore((s) => s.hoverUnit)
  const hoverModel = useUiStore((s) => s.hoverModel)
  const hoverObjective = useUiStore((s) => s.hoverObjective)
  const shootStage = useUiStore((s) => s.shootStage)
  const hoverSpot = useUiStore((s) => s.hoverSpot)
  const setCandidateSpots = useUiStore((s) => s.setCandidateSpots)
  const clearBoardHover = () => {
    hoverUnit(null)
    hoverModel(null)
    hoverObjective(null)
    hoverSpot(null)
  }
  const applyBoardHover = (target: HoverTarget | null) => {
    if (target?.kind === 'unit') hoverUnit(target.ids)
    if (target?.kind === 'model') hoverModel(target.id)
    if (target?.kind === 'objective') hoverObjective(target.id)
    if (target?.kind === 'spot') {
      hoverSpot(target.id)
      if (target.unitId) hoverUnit(target.unitId)
    }
  }
  const { compact, portrait } = useFormFactor()
  const formationKind = useUiStore((s) => s.formationKind)
  const formationFacing = useUiStore((s) => s.formationFacing)
  const primeFormation = useUiStore((s) => s.primeFormation)
  const recallFormation = useUiStore((s) => s.recallFormation)

  // Delayed hover help on an option (currently the move types — see moveTypeHelp). Kept here rather
  // than in each button so only one card is ever open, and so the timer is cancelled on unmount.
  const [helpFor, setHelpFor] = useState<string | null>(null)
  const helpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelHelp = () => {
    if (helpTimer.current !== null) clearTimeout(helpTimer.current)
    helpTimer.current = null
    setHelpFor(null)
  }
  const scheduleHelp = (id: string) => {
    if (helpTimer.current !== null) clearTimeout(helpTimer.current)
    helpTimer.current = setTimeout(() => setHelpFor(id), HELP_DELAY_MS)
  }
  useEffect(() => () => { if (helpTimer.current !== null) clearTimeout(helpTimer.current) }, [])

  // Touch has no hover, so a choice is two taps: the first "arms" it (its unit lights up on the board, its
  // help card shows, its ghost previews), the second — on the same choice, or the Choose button — commits.
  const [armedId, setArmedId] = useState<string | null>(null)
  const helpRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (compact && helpFor) helpRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [compact, helpFor])

  // A hovered option button lights its unit on the board; that highlight must never outlive the button.
  // Unmounting skips onMouseLeave, so clear on unmount, and again whenever the options stop being on
  // screen (opponent's turn, dice still resolving) while the pointer may still be resting on one.
  const optionsHidden = !state || !pending || pending.player === botSeat || !caughtUp
  useEffect(() => {
    if (optionsHidden) clearBoardHover()
  }, [optionsHidden]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => clearBoardHover, []) // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { resetForDecision(); cancelHelp(); setArmedId(null) }, [pending?.id])

  // A redeploy offers board spots: ring every candidate while the human's prompt is open (see SpotMarkers), nothing otherwise.
  useEffect(() => {
    const spots = pending && pending.player !== botSeat && caughtUp && isRedeploy(pending) && pending.kind === 'chooseOption'
      ? pending.options.flatMap((o) => { const at = spotOfOption(o.id); return at ? [{ id: o.id, ...at }] : [] })
      : []
    setCandidateSpots(spots)
    return () => setCandidateSpots([])
  }, [pending?.id, botSeat, caughtUp]) // eslint-disable-line react-hooks/exhaustive-deps

  // A mid-game disembark names exactly one unit: pre-select it so the very next board click places it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pending?.kind === 'deployUnit' && state?.phase === 'movement' && pending.player !== botSeat) {
      const sole = soleDeployUnit(state, pending.context.unitIds)
      if (sole) setDeployTarget(sole)
    }
  }, [pending?.id])

  // M4 formation memory (#5): a move-family decision already knows its unit, so it can be primed
  // the moment it becomes pending — 'keep' at the remembered facing if this unit has one, else
  // 'keep' with facing left on "auto" (recomputed from direction of travel on the first click).
  // Deployment doesn't know its target unit yet (that's a separate click on the palette above), so
  // it's primed by the effect below instead, once `deployTargetUnitId` is set.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pending) return
    const info = placementInfo(pending)
    if (!info) return
    const mem = recallFormation(info.unitId)
    if (mem) primeFormation('keep', mem.facing, false)
    else primeFormation('keep', 0, true)
  }, [pending?.id])

  // Pile in / consolidate: open with every model where it stands so it can be dragged right away
  // (staying put is always an option); a board click or "Auto" still replaces the draft.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state || !isApproachPending(pending) || pending.player === botSeat) return
    setDraft(startDraft(state, pending))
  }, [pending?.id])

  // "Auto-deploy rest": answer each of this seat's deploy decisions with the engine's suggested spot until nothing is left.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoDeployFor) return
    if (!state || state.phase !== 'deployment') { setAutoDeployFor(null); return }
    if (!pending || pending.kind !== 'deployUnit' || !caughtUp) return
    if (pending.player === botSeat || pending.player !== autoDeployFor) return
    const sug = suggestDeployment(state)
    if (!sug) { setAutoDeployFor(null); return }
    dispatch({ type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId: sug.unitId, placements: sug.placements })
  }, [pending?.id, autoDeployFor, caughtUp, state?.phase])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pending || pending.kind !== 'deployUnit' || !deployTargetUnitId) return
    primeFormation('line', 0, true)
  }, [pending?.id, deployTargetUnitId])

  // Phone: the formation strip and the folded sheet cover the bottom third of the screen, which is exactly where the
  // default view puts a deployment zone. Once a unit is picked, ease the camera over the zone's centre so the area to
  // tap sits in the open middle of the screen.
  useEffect(() => {
    if (!compact || !pending || pending.kind !== 'deployUnit' || !deployTargetUnitId || pending.player === botSeat) return
    const zone = pending.context.zone as { x: number; z: number }[] | undefined
    if (!zone || zone.length === 0) return
    useUiStore.getState().focusCamera({
      x: zone.reduce((a, p) => a + p.x, 0) / zone.length,
      z: zone.reduce((a, p) => a + p.z, 0) / zone.length,
    })
    if (state?.phase === 'deployment') deployFramed.current = true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, pending?.id, deployTargetUnitId])

  // Phone: that zoom-in must not outlive deployment. Ease back to the overview once the deployment phase is over, or
  // as soon as the human's last unit is down (the bot may still be deploying). The unit count is read while the
  // human's own deploy decision is open: a count of 1 means the unit being placed is the last one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!compact) { deployFramed.current = false; return }
    if (pending?.kind === 'deployUnit' && pending.player !== botSeat && state?.phase === 'deployment') humanDeployLeft.current = pending.context.unitIds.length
    if (!deployFramed.current) return
    const humanDone = state?.phase !== 'deployment' || (pending?.kind === 'deployUnit' && pending.player === botSeat && humanDeployLeft.current <= 1)
    if (humanDone) {
      deployFramed.current = false
      requestCameraOverview()
    }
  }, [compact, state?.phase, pending?.id, pending?.kind, pending?.player])

  if (!state || !pending) return null

  if (pending.player === botSeat) {
    return <div style={compact ? { ...bannerWrap, bottom: 8 } : bannerWrap}>Opponent is thinking…</div>
  }

  // The dice that raised this decision haven't finished showing yet — don't offer a choice about them.
  if (!caughtUp) {
    if (compact) {
      return (
        <BottomSheet testId="prompt" title="Resolving dice…" autoKey={pending.id}>
          <div style={hint} data-testid="prompt-resolving">Resolving dice…</div>
        </BottomSheet>
      )
    }
    return (
      <div style={wrap} data-testid="prompt">
        <MinimizeButton decisionId={pending.id} />
        <div style={hint} data-testid="prompt-resolving">Resolving dice…</div>
      </div>
    )
  }

  const info = placementInfo(pending)
  const activeDraft = draft && draft.decisionId === pending.id ? draft : null
  const passAction = legal?.find((a) => a.type === 'pass') ?? null

  const approach = isApproachPending(pending) ? pending : null
  const draftValidation = activeDraft
    ? approach
      ? validateApproach(state, approach, combinedUnitModels(state, activeDraft.unitId), activeDraft.placements, combinedUnitIds(state, activeDraft.unitId))
      : validateDraft(
        state,
        combinedUnitModels(state, activeDraft.unitId),
        activeDraft.placements,
        pending.kind === 'deployUnit' ? null : (info?.constraints ?? null),
        combinedUnitIds(state, activeDraft.unitId),
        true,
      )
    : null

  const confirmDraft = () => {
    commitStagedDraft()
  }

  const resetDraft = () => {
    if (!activeDraft) return
    if (approach) { setDraft(startDraft(state, approach)); return }
    const placements = formationPlacementsForUnit(state, activeDraft.unitId, activeDraft.anchor, formationFacing, formationKind)
    if (placements.length > 0) setDraft({ ...activeDraft, placements })
  }

  const bespoke = pending.kind === 'deployUnit' || !!info
  // Placement decisions keep the board-click UI as the primary path, but still offer the engine's
  // own pre-validated candidates below — e.g. a coherency repair after a mid-move casualty can be
  // a placement our own delta-translate can't produce, so the fallback list must stay reachable.
  const showFallbackList = pending.kind !== 'deployUnit'
  const listItems: { id: string; label: string; action: Action }[] = (
    hasOptions(pending)
      ? pending.options.map((o) => ({ id: o.id, label: labelForOption(pending, state, events, o), action: o.action }))
      : (legal ?? []).map((a, i) => ({ id: `${a.type}-${i}`, label: describeAction(a, state), action: a }))
  )
    // Decisions with no engine-provided options list every *legal action*, and passing is one of
    // them — which put a second "Pass" in the row next to the dedicated button below.
    .filter((it) => it.action.type !== 'pass' || !passAction)

  // Hover help for whichever option the pointer has rested on.
  const activeHelp = helpForAction(state, listItems.find((it) => it.id === helpFor)?.action)

  const chooseOptionInfo = pending.kind === 'chooseOption' ? chooseOptionInfoFor(pending.context, pending.options, state, pending.player) : undefined

  // Both re-roll prompts (Command Re-roll, and an ability's own rerollOffer) are answered in the
  // interactive dice tray (RerollTray.tsx) instead of this panel's text and buttons: the whole roll is shown
  // as dice and the player clicks the ones to re-roll. The roll itself comes with the decision for Command
  // Re-roll; a rerollOffer names only its id, so it's looked up.
  const rerollRoll = pending.kind === 'commandReroll'
    ? pending.context.roll
    : pending.kind === 'chooseOption' && pending.context.topic === 'rerollOffer'
      ? rollForOffer(state, pending.context.data)
      : null
  if (rerollRoll && (pending.kind === 'commandReroll' || pending.kind === 'chooseOption') && rerollTrayModel(state, events, pending, rerollRoll)) {
    const keepAction: Action | null = pending.kind === 'commandReroll'
      ? passAction
      : ((hasOptions(pending) ? pending.options : []).find((o) => o.id === 'keep')?.action ?? null)
    if (compact) {
      return (
        <BottomSheet testId="prompt" title={KIND_TITLE[pending.kind] ?? 'Re-roll'} autoKey={pending.id}>
          <RerollTray key={pending.id} state={state} events={events} pending={pending} roll={rerollRoll} keepAction={keepAction} />
        </BottomSheet>
      )
    }
    return (
      <div style={wrap} data-testid="prompt">
        <MinimizeButton decisionId={pending.id} />
        <RerollTray key={pending.id} state={state} events={events} pending={pending} roll={rerollRoll} keepAction={keepAction} />
      </div>
    )
  }

  const weaponPanelOpen = opensWeaponPanel(pending) && shootStage?.decisionId === pending.id
  // The weapon panel was only reachable by clicking an enemy figure, so players never found it: give
  // it a button too, opened on the first enemy any weapon can reach (the panel retargets from there).
  const firstShootTarget = opensWeaponPanel(pending)
    ? listItems.flatMap((it) => (it.action.type === 'declareTargets' ? it.action.targets.map((t) => t.targetUnitId) : []))[0]
    : undefined
  const kindTitle = chooseOptionInfo?.title ?? KIND_TITLE[pending.kind] ?? pending.kind
  const isDeploy = pending.kind === 'deployUnit'
  // A mid-game disembark names exactly one unit: a lone unit, or both halves of an attached Leader + bodyguard pair (E3).
  const soleDisembark = isDeploy && state.phase === 'movement' ? soleDeployUnit(state, pending.context.unitIds) : null
  const disembarkId = soleDisembark && transportService.transportOf(state, soleDisembark) ? soleDisembark : null
  const kindTitleShown = disembarkId ? `Disembark ${groupLabel(state, disembarkId)}` : kindTitle
  // Phone landscape: a pick-from-a-list prompt is one slim strip (BottomSheet `strip`) so the board, and the player's own
  // deployment zone with it, stays in view. Placement-by-tap prompts other than deployment keep their own docked layout.
  const strip = compact && !portrait && !weaponPanelOpen && (isDeploy || !bespoke)
  const sheetTitle = strip && isDeploy && !disembarkId
    ? (
      <>
        {kindTitle}
        <span style={{ fontWeight: 400, opacity: 0.7 }}> · {deployTargetUnitId ? 'tap your zone to place it' : 'pick a unit, then tap your zone'}</span>
      </>
    )
    : kindTitleShown

  // --- touch (compact) plumbing: arm / disarm a choice ---
  const disarm = () => {
    setArmedId(null)
    cancelHelp()
    setPreviewDraft(null)
    clearBoardHover()
  }
  const armOption = (
    id: string,
    hasHelp: boolean,
    withPlacements: Extract<Action, { type: 'moveUnit' | 'chargeMove' | 'pileIn' | 'consolidate' }> | null,
    hoverTarget: HoverTarget | null,
  ) => {
    disarm()
    setArmedId(id)
    if (hasHelp) setHelpFor(id)
    if (withPlacements) setPreviewDraft({ decisionId: pending.id, unitId: withPlacements.unitId, anchor: { x: 0, z: 0 }, placements: withPlacements.placements })
    applyBoardHover(hoverTarget)
  }

  const bodyTop = (
    <>
      {chooseOptionInfo && <div style={hint}>{chooseOptionInfo.hint}</div>}
      {pending.kind === 'declareTargets' && (
        <CollapsibleInfo
          key={weaponPanelOpen ? 'panel' : 'plain'}
          collapsible={compact && weaponPanelOpen}
          testId="shoot-context"
          head={`${state.units[pending.context.unitId]?.name ?? pending.context.unitId} — ${
            pending.context.overwatch ? 'Fire Overwatch (every hit needs an unmodified 6)' : pending.context.attackKind === 'melee' ? 'pick who to fight' : 'pick a target'
          }`}
        >
          {pending.context.attackKind === 'ranged'
            ? `${compact ? 'Tap' : 'Click'} an enemy (or Choose weapons…) to pick which weapons fire at whom, or use a Target button to fire everything that can reach it at once. `
            : 'Every weapon that can see the unit you pick fires at it. '}
          {compact ? 'Tap an option once' : 'Hover an option'} for its weapons, the target&apos;s Health, Save and Ward, and what each weapon needs to hit and wound.
          {pending.context.engagedWith.length > 0 &&
            ` In combat with ${pending.context.engagedWith.map((u) => state.units[u]?.name ?? u).join(', ')}.`}
        </CollapsibleInfo>
      )}

      {pending.kind === 'declareTargets' && weaponPanelOpen && (
        <WeaponPanel key={pending.id} state={state} pending={pending} passAction={passAction} dispatch={dispatch} />
      )}

      {pending.kind === 'declareCharge' && (
        <div style={infoBlock} data-testid="charge-context">
          <div style={{ color: colors.text, fontWeight: 600 }}>
            {state.units[pending.context.unitId]?.name ?? pending.context.unitId} — charge

          </div>
          <div>
            Roll 2D6 and move up to that far. The unit must finish within ½" of an enemy model, or the charge fails and the
            unit stays where it is. {compact ? 'Tap an option once' : 'Hover an option'} for the distance, the roll it needs and the odds.
          </div>
        </div>
      )}

      {pending.kind === 'chargeMove' && (
        <div style={infoBlock} data-testid="charge-move-context">
          <div style={{ color: colors.text, fontWeight: 600 }}>Charge roll: {pending.context.roll}&quot;</div>
          <div>
            Move each model up to {pending.context.roll}&quot;. The unit has to finish within ½&quot; of an enemy unit, or the charge fails.
          </div>
        </div>
      )}

      {(pending.kind === 'pileIn' || pending.kind === 'consolidate') && (
        <div style={infoBlock} data-testid="pile-in-context">
          Drag each model up to {pending.context.distance}&quot; (its grey ring) or leave it where it stands.
          {pending.kind === 'pileIn' ? ' Moved models must end closer to the enemy.' : ' Moved models must end closer to the enemy or an objective.'}
          {activeDraft && (() => {
            const f = fightersAfter(state, activeDraft.unitId, activeDraft.placements)
            const total = activeDraft.placements.length
            return <div data-testid="pile-in-fighters" style={{ color: f.size > 0 ? '#ffb347' : colors.text, fontWeight: 600, marginTop: 4 }}>⚔ {f.size} of {total} models will be able to fight (orange rings)</div>
          })()}
        </div>
      )}

      {pending.kind === 'chooseOption' && pending.context.topic === 'hazardousCasualty' && (() => {
        const weaponId = typeof pending.context.data.weaponId === 'string' ? pending.context.data.weaponId : null
        const die = typeof pending.context.data.die === 'number' ? pending.context.data.die : null
        const weapon = weaponId ? state.weapons[weaponId]?.name : null
        return (
          <div style={infoBlock} data-testid="hazardous-context">
            {weapon ?? 'A Hazardous weapon'} failed its Hazardous test{die !== null ? ` (rolled ${die})` : ''} — a model
            carrying it is destroyed. Choose which model is lost.
          </div>
        )
      })()}

      {pending.kind === 'allocateAttack' && (() => {
        // Same gap as the save choice: the prompt named models but never said what was hitting them.
        const ctx = saveAttackContext(state, events, pending.context.eligibleModels[0] ?? '')
        const dmg = pending.context.damage
        return (
          <div style={infoBlock} data-testid="allocate-context">
            <div style={{ color: colors.text, fontWeight: 600 }}>
              {pending.context.mortal ? 'Mortal wounds' : 'A wound gets through'}
              {ctx?.weaponName ? ` — ${ctx.weaponName} (Rend ${-ctx.ap})` : ''}
              {dmg !== null ? ` · Damage ${dmg}` : ''}
            </div>
            <div>
              From {state.units[pending.context.attackerUnitId]?.name ?? pending.context.attackerUnitId} against{' '}
              {state.units[pending.context.targetUnitId]?.name ?? pending.context.targetUnitId}. Choose which model takes it — {compact ? 'tap an option once' : 'hover an option'}
              to light that figure up on the board.
              {pending.context.precision ? ' Precision: an attached character can be picked out.' : ''}
            </div>
          </div>
        )
      })()}

      {pending.kind === 'deployUnit' && (
        <div className={strip ? 'm42-hscroll' : undefined} style={strip ? deployRowStrip : compact ? deployRowCompact : deployRowWide}>
          {(soleDisembark ? [soleDisembark] : pending.context.unitIds).map((uid) => (
            <button
              key={uid}
              style={{ ...(uid === deployTargetUnitId ? buttonPrimary : buttonBase), flexShrink: 0, textAlign: 'left' }}
              onClick={() => setDeployTarget(uid)}
            >
              {soleDisembark ? groupLabel(state, uid) : state.units[uid]?.name ?? uid}
            </button>
          ))}
          {pending.context.reservesAllowed.map((uid) => {
            const reserveAction = legal?.find((a) => a.type === 'deployUnit' && a.unitId === uid && a.toReserves)
            if (!reserveAction) return null
            const abandon = false
            const nm = state.units[uid]?.name ?? uid
            return (
              <Tooltip key={`res-${uid}`} title="Abandon" body="A teleporting unit that is not placed is destroyed." disabled={!abandon}>
                <button
                  style={{ ...(abandon ? buttonDanger : buttonBase), flexShrink: 0, textAlign: 'left' }}
                  onClick={() => {
                    if (abandon && !window.confirm(`Abandon ${nm}? It cannot return to Reserves and will be destroyed.`)) return
                    dispatch(reserveAction)
                  }}
                >
                  {abandon ? `Abandon ${nm} (destroyed)` : `Reserves: ${nm}`}
                </button>
              </Tooltip>
            )
          })}
        </div>
      )}

      {pending.kind === 'deployUnit' && state.phase === 'deployment' && pending.player !== botSeat && (() => {
        const sug = suggestDeployment(state, deployTargetUnitId && pending.context.unitIds.includes(deployTargetUnitId) ? deployTargetUnitId : undefined)
        const running = autoDeployFor === pending.player
        return (
          <div style={strip ? autoRowStrip : { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }} data-testid="deploy-auto-row">
            <Tooltip title="Auto-place" disabled={compact} body="Sets the chosen unit (or the biggest one waiting) down in the first spot that still leaves room for the rest of your army.">
              <button
                style={strip ? { ...buttonBase, whiteSpace: 'nowrap' } : buttonBase}
                disabled={!sug}
                data-testid="btn-deploy-auto-place"
                onClick={() => sug && dispatch({ type: 'deployUnit', player: pending.player, decisionId: pending.id, unitId: sug.unitId, placements: sug.placements })}
              >
                Auto-place
              </button>
            </Tooltip>
            <Tooltip title="Auto-deploy rest" disabled={compact} body="Places every unit you still have to deploy, biggest first, each in the first legal spot left.">
              <button
                style={strip ? { ...buttonBase, whiteSpace: 'nowrap' } : buttonBase}
                disabled={!sug}
                data-testid="btn-deploy-auto-rest"
                onClick={() => setAutoDeployFor(running ? null : pending.player)}
              >
                {running ? 'Stop auto-deploy' : 'Auto-deploy rest'}
              </button>
            </Tooltip>
            {sug && !sug.fitsAll && (
              <span style={strip ? { fontSize: 12, color: colors.accent, whiteSpace: 'nowrap' } : { fontSize: 12, color: colors.accent }} data-testid="deploy-auto-warning">
                {strip ? 'Big units first!' : 'Heads up: not every waiting unit fits after this one. Place the big ones by hand first.'}
              </span>
            )}
          </div>
        )
      })()}

      {pending.kind === 'deployUnit' && state.phase === 'deployment' && (() => {
        // Rules Commentary "Deploying Units": a model too big for the zone must be set up touching your battlefield edge
        const names = pending.context.unitIds
          .map((id) => state.units[id])
          .filter((u) => u && u.models.some((id) => isOversizeForZone(state.models[id].base, pending.context.zone)))
          .map((u) => u.name)
        if (names.length === 0) return null
        return (
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }} data-testid="oversize-edge-note">
            {names.join(', ')}: too big for this deployment zone, so it has to be set up with its base touching your battlefield edge. Drag it to that edge and it snaps into place.
          </div>
        )
      })()}

      {disembarkId && (() => {
        const auto = legal?.find((a): a is Extract<Action, { type: 'deployUnit' }> => a.type === 'deployUnit' && !a.toReserves && a.placements.length > 0)
        if (!auto) return null
        return (
          <button
            style={{ ...buttonPrimary, marginTop: 6 }}
            data-testid="btn-disembark-auto"
            onClick={() => {
              setDeployTarget(auto.unitId)
              const first = auto.placements[0]
              setDraft({ decisionId: pending.id, unitId: auto.unitId, anchor: { x: first.pos.x, z: first.pos.z }, placements: auto.placements })
            }}
          >
            Auto-place beside the transport
          </button>
        )
      })()}

      {bespoke && !(strip && isDeploy) && (
        <div style={hint}>
          {disembarkId
            ? `${compact ? 'Tap' : 'Click'} within 3" of ${state.units[transportService.transportOf(state, disembarkId) ?? '']?.name ?? 'the transport'} to set the unit down${groupUnitIds(state, disembarkId).length > 1 ? ' (its attached Leader lands with it)' : ''}, or pass to keep it aboard.`
            : pending.kind === 'deployUnit'
            ? deployTargetUnitId
              ? `${compact ? 'Tap' : 'Click'} inside your deployment zone to place the unit.`
              : `Pick a unit above, then ${compact ? 'tap' : 'click'} inside your zone.`
            : approach
              ? (compact ? 'Drag a model to move just it; switch on Whole unit to move them all. A red ring says why it is not allowed.' : 'Drag a model to move just it (Shift-drag moves them all). A red ring says why it is not allowed.')
              : `${compact ? 'Tap' : 'Click'} the board to set a destination — a range ring shows how far the unit can go.`}
        </div>
      )}

    </>
  )
  const bodyBottom = (
    <>
      {(activeDraft || isClampedMovePending(pending)) && <FloorSelector />}

      {!compact && activeDraft && draftValidation && !draftValidation.ok && (
        <div style={{ ...hint, color: colors.danger }} data-testid="draft-issue">
          Can&apos;t confirm: {draftValidation.reasons.join(', ')}
        </div>
      )}

      {showFallbackList && !weaponPanelOpen && (
        <div className={strip ? 'm42-hscroll' : undefined} style={strip ? optionListStrip : compact ? optionListCompact : optionList}>
          {info && listItems.length > 0 && <div style={compact ? { ...hint, flexBasis: '100%' } : hint}>Or use a suggested placement — {compact ? 'tap one to preview it, tap again to use it' : 'hover one to preview it'}:</div>}
          {listItems.map((it) => {
            // moveUnit/chargeMove/pileIn/consolidate options carry their own placements — hovering
            // one shows a ghost of where it lands (PlacementOverlay), same colour as a real draft.
            const withPlacements =
              it.action.type === 'moveUnit' || it.action.type === 'chargeMove' || it.action.type === 'pileIn' || it.action.type === 'consolidate'
                ? it.action
                : null
            const hoverTarget = hoverTargetFor(state, pending, it.action, it.id)
            // The card itself is rendered at panel level (see activeHelp) so the option row, which
            // is an overflow:auto scroller, can't clip it.
            const hasHelp = helpForAction(state, it.action) !== null
            return (
              <button
                key={it.id}
                data-testid={`prompt-option-${it.id}`}
                style={compact ? { ...(armedId === it.id ? buttonPrimary : buttonBase), ...optionBtnCompact } : buttonBase}
                aria-pressed={compact ? armedId === it.id : undefined}
                onFocus={() => !compact && hasHelp && setHelpFor(it.id)}
                onBlur={() => { if (!compact) cancelHelp() }}
                onMouseEnter={() => {
                  if (compact) return // touch: the first tap arms the choice instead (see onClick)
                  if (hasHelp) scheduleHelp(it.id)
                  if (withPlacements) setPreviewDraft({ decisionId: pending.id, unitId: withPlacements.unitId, anchor: { x: 0, z: 0 }, placements: withPlacements.placements })
                  applyBoardHover(hoverTarget)
                }}
                onMouseLeave={() => {
                  if (compact) return
                  cancelHelp()
                  setPreviewDraft(null)
                  clearBoardHover()
                }}
                onClick={() => {
                  if (compact) {
                    // Touch has no hover: the first tap on a choice that has something to show (help, a ghost, a unit
                    // to light) arms it; a second tap on the same choice, or the Choose button, commits it.
                    const previewable = hasHelp || !!withPlacements || !!hoverTarget || /^pt:/.test(it.id)
                    if (previewable && armedId !== it.id) {
                      armOption(it.id, hasHelp, withPlacements, hoverTarget)
                      return
                    }
                    disarm()
                    dispatch(it.action)
                    setDraft(null)
                    return
                  }
                  cancelHelp()
                  setPreviewDraft(null)
                  clearBoardHover()
                  dispatch(it.action)
                  setDraft(null)
                }}
              >
                {it.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )

  if (compact) {
    const armedItem = armedId ? (listItems.find((it) => it.id === armedId) ?? null) : null
    const showChooseWeapons = !!firstShootTarget && !weaponPanelOpen
    const showPass = !!passAction && !weaponPanelOpen
    const chooseWeaponsBtn = showChooseWeapons ? (
      <button style={touchBtn(buttonPrimary)} data-testid="btn-choose-weapons" onClick={() => useUiStore.getState().stageShoot(pending.id, firstShootTarget)}>
        Choose weapons…
      </button>
    ) : null
    const passBtn = showPass && passAction ? (
      <button style={touchBtn(buttonBase)} data-testid="btn-pass" onClick={() => dispatch(passAction)}>
        {passLabelFor(pending)}
      </button>
    ) : null
    // Confirm / Cancel for a staged move live in TouchActionBar (bottom centre); the sheet lifts clear of it.
    const footerRow = approach || activeDraft || chooseWeaponsBtn || passBtn ? (
      <div style={rowCompact}>
        {approach && (
          <button style={touchBtn(buttonBase)} data-testid="btn-auto-approach" onClick={() => setDraft(autoDraft(state, approach, legal))}>
            {approach.kind === 'pileIn' ? 'Auto pile in' : 'Auto consolidate'}
          </button>
        )}
        {activeDraft && (
          <button style={touchBtn(buttonBase)} data-testid="btn-reset-formation" onClick={resetDraft}>
            Reset
          </button>
        )}
        {chooseWeaponsBtn}
        {passBtn}
      </div>
    ) : null
    const chooseArmed = (item: NonNullable<typeof armedItem>) => { disarm(); dispatch(item.action); setDraft(null) }
    const armedBar = armedItem ? (
      <div style={rowCompact}>
        <button style={touchBtn(buttonBase)} data-testid="btn-armed-back" onClick={disarm}>
          Back
        </button>
        <button style={touchBtn(buttonPrimary, armedChooseBtn)} data-testid="btn-armed-choose" onClick={() => chooseArmed(armedItem)}>
          Choose: {armedItem.label}
        </button>
      </div>
    ) : null
    const collapsedPrimary = armedItem ? (
      <button style={touchBtn(buttonPrimary, { ...armedChooseBtn, flex: '0 1 46%' })} data-testid="btn-armed-choose" onClick={() => chooseArmed(armedItem)}>
        Choose: {armedItem.label}
      </button>
    ) : activeDraft ? null : (chooseWeaponsBtn ?? passBtn)
    return (
      <>
        <FormationPicker />
        <BottomSheet
          testId="prompt"
          title={sheetTitle}
          strip={strip}
          // a decision answered by tapping the board opens tucked away; a staged move collapses itself
          auto={isDeploy ? !!deployTargetUnitId || !!activeDraft : bespoke || !!activeDraft}
          autoKey={pending.id}
          staged={!!activeDraft}
          summary={collapsedPrimary}
          footer={armedBar ?? footerRow}
        >
          {activeHelp && (
            <div ref={helpRef}>
              <OptionHelp help={activeHelp} inline />
            </div>
          )}
          {bodyTop}
          {bodyBottom}
        </BottomSheet>
      </>
    )
  }

  return (
    <>
      <FormationPicker />
      <div style={isDeploy ? deployWrap : wrap} data-testid="prompt">
      <MinimizeButton decisionId={pending.id} />
      {activeHelp && <OptionHelp help={activeHelp} />}
      <div style={heading}>{kindTitleShown}</div>
      {bodyTop}
      <div style={row}>
        {approach && (
          <button style={buttonBase} data-testid="btn-auto-approach" onClick={() => setDraft(autoDraft(state, approach, legal))}>
            {approach.kind === 'pileIn' ? 'Auto pile in' : 'Auto consolidate'}
          </button>
        )}
        {activeDraft && (
          <>
            <Tooltip title="Can't confirm" body={draftValidation && !draftValidation.ok ? draftValidation.reasons.join(', ') : undefined} disabled={!draftValidation || draftValidation.ok} wrap>
              <button
                style={draftValidation && !draftValidation.ok ? { ...buttonPrimary, opacity: 0.5, cursor: 'not-allowed' } : buttonPrimary}
                data-testid="btn-confirm"
                disabled={!!draftValidation && !draftValidation.ok}
                onClick={confirmDraft}
              >
                Confirm
              </button>
            </Tooltip>
            <button style={buttonBase} data-testid="btn-reset-formation" onClick={resetDraft}>
              Reset
            </button>
            <button style={buttonDanger} data-testid="btn-cancel" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </>
        )}
        {firstShootTarget && !weaponPanelOpen && (
          <button style={buttonPrimary} data-testid="btn-choose-weapons" onClick={() => useUiStore.getState().stageShoot(pending.id, firstShootTarget)}>
            Choose weapons…
          </button>
        )}
        {passAction && !weaponPanelOpen && (
          <button style={buttonBase} data-testid="btn-pass" onClick={() => dispatch(passAction)}>
            {passLabelFor(pending)}
          </button>
        )}
      </div>

      {bodyBottom}
      </div>
    </>
  )
}
