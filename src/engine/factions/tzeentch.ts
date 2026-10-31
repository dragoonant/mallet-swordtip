// Disciples of Tzeentch (Tzaangor Warflock) code hooks: docs/spec/factions/disciples-of-tzeentch.md (DOT-*).
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/tzeentch/abilities.json uses. What each hook needs
// from data:
//
//  tzeentchPredictTheFuture (BT-3)   army ability, hero phase / your, oncePerPhase + params.army. Needs a battle tactic deck. Resolve looks
//        at up to params.look top cards and raises one 'abilityChoice' decision per card (data.code = this hook; options top:<i> /
//        bottom:<i>, i = the card's place in the look: the public action log never names a card), then, with two or more kept
//        on top, one 'first:<j>' pick for the very top. The progress lives in the decision
//        data, the deck is written once at the end. Nothing public names a card.
//  tzeentchCheatDestiny (BT-4)       passive descriptor (trigger always); cards.ts calls onTacticCommandUsed once the command has fully
//        resolved. Raises an optional 'abilityChoice' (bottom:<id>), at most once per phase (phase mark tz:cheat:<player>); the answer
//        moves the card from the discard pile to the bottom of the deck (returnTacticToDeckBottom).
//  tzeentchConstantFlux (RA-1)       passive; statDelta (+1 on the AP axis = -1 Rend) for attacks that target the holder while the
//        holder's player is the underdog. affectsCompanion: an enemy-side reduction reaches Companion weapons too.
//  tzeentchArcaneRitualists (RA-2)   passive; castingRollBonus +params.bonus for the general's own casting rolls while it is wholly
//        within params.range of another friendly unit.
//  tzeentchPredictedStrike (ENH-1)   enemy movement phase, oncePerBattle; target = a visible friendly unit wholly within params.range of
//        the general, not in combat. Queues a slide of up to the D6 rolled, with noCombatPath (aos-moves.ts).
//  tzeentchFoldReality (ENH-2)       a Spell (castingValue in data); target = a visible friendly unit other than the general wholly within
//        params.range of it. On a cast the unit is lifted and set up again anchored on the general (redeploy.ts, markSetUp).
//  tzeentchInfernalGateway (ENH-3)   a Spell; target = a visible enemy unit within params.range. max(params.minDice, discard pile) dice,
//        each params.succeedOn+ is 1 mortal damage.
//  tzeentchMutagenicSorcery (ENH-4)  end of any turn, oncePerTurn; target = a visible enemy unit within params.range of the general that a
//        friendly Tzaangors unit is in combat with. D3, 2+ = that much mortal damage and one slain Tzaangor returns.
//  tzeentchMutativeAura (AB-1)       a Spell on the Shaman; target = a visible enemy unit within params.range. Leaves a marker effect on the
//        target that lasts until the start of the caster's next turn; afterAttackSequence holds params.mortal mortal damage per unmodified
//        hit roll of 1 of the target's combat attacks until its Fight ability is over (deferMortalAfterFight).
//  tzeentchDestinedQuarry (AB-3)     shooting phase / your; target = an enemy unit the unit damaged with shooting this phase. Grants +1 to hit
//        for combat attacks made against it for the rest of the turn (scope 'attacker').
//  tzeentchUnderdog (AB-2) and tzeentchEldritchRaiders (AB-4) are gates on descriptor modifyRoll effects (charge / wound).
//
//  AI hints: tzeentchAbilityTiming / tzeentchTargetBonus below are read by src/ai/utility.ts (abilityTiming / abilityTargetBonus).
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr } from '../../data/types'
import type { Action } from '../actions'
import type { EngineContext } from '../modules'
import type { GameState, PendingDecision, PlayerId, Rejection, UnitId } from '../types'
import { EPS, pointInPolygon, whollyWithinPolygon } from '../geometry'
import { deferMortalAfterFight, damagedByShootingThisPhase } from '../attack'
import { cardName, cardsOf, returnTacticToDeckBottom, tacticOdds } from '../cards'
import { diceExprMean } from '../dice'
import { effectService } from '../effects'
import { losService } from '../los'
import { liftForRedeploy, requestRedeploy } from '../redeploy'
import { boardUnitsOf, modelStats, territoryOf, unitModels } from '../state'
import { weaponService } from '../weapons'
import { checkSlide, writeMoveQueue, type SlideOpts } from './aos-moves'
import {
  announce, enemiesInCombat, inCombat, inflictMortal, isDatasheet, liveModels, liveObjectives, onBoard, paramOf, paramsByCode, returnSlainModels,
  returnableModels, unitContestsObjective, unitGap, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A')

const CODE_PREDICT = 'tzeentchPredictTheFuture'
const CODE_CHEAT = 'tzeentchCheatDestiny'
const CODE_FLUX = 'tzeentchConstantFlux'
const CODE_RITUALISTS = 'tzeentchArcaneRitualists'
const CODE_STRIKE = 'tzeentchPredictedStrike'
const CODE_FOLD = 'tzeentchFoldReality'
const CODE_GATEWAY = 'tzeentchInfernalGateway'
const CODE_MUTAGENIC = 'tzeentchMutagenicSorcery'
const CODE_AURA = 'tzeentchMutativeAura'
const CODE_QUARRY = 'tzeentchDestinedQuarry'
const CODE_UNDERDOG = 'tzeentchUnderdog'
const CODE_RAIDERS = 'tzeentchEldritchRaiders'

const ENH_GATEWAY = 'tzeentch.enh.infernal-gateway'

const unitsOf = (state: GameState, player: PlayerId): UnitId[] => boardUnitsOf(state, player).map((u) => u.id).sort()
const woundsLeft = (state: GameState, unitId: UnitId): number => liveModels(state, unitId).reduce((a, m) => a + m.woundsRemaining, 0)
const pickedOk = (targets: UnitId[], use: { targetUnitIds?: UnitId[] }): boolean => {
  const picked = use.targetUnitIds?.[0]
  return targets.length > 0 && (!picked || targets.includes(picked))
}
const seesUnit = (state: GameState, fromUnit: UnitId, target: UnitId): boolean =>
  fromUnit === target || liveModels(state, fromUnit).some((m) => losService.unitVisible(state, m.id, target))
const generalOf = (state: GameState, player: PlayerId): UnitId | null => {
  const id = state.players[player]?.warlordUnitId
  return id && onBoard(state, id) ? id : null
}
const isTzaangors = (state: GameState, id: UnitId): boolean => isDatasheet(state, id, null, 'tzaangors')
const moveOf = (state: GameState, unitId: UnitId): number => Math.max(0, ...unitModels(state, unitId).map((m) => modelStats(state, m).M))

// ---------- decisions shared by Predict the Future and Cheat Destiny ----------
const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })

// ---------- DOT-BT-3 Predict the Future ----------
interface PredictData {
  code: string
  cards: string[]
  stage: 'sort' | 'order'
  i: number
  tops: string[]
  bottoms: string[]
}

function raisePredict(ctx: EngineContext, player: PlayerId, abilityId: string, d: PredictData): void {
  const s = ctx.state
  if (d.stage === 'sort') {
    const id = d.cards[d.i]
    const odds = tacticOdds(s, player, id)
    ctx.decide({
      kind: 'chooseOption', player, window: 'phase.end', canPass: false,
      context: { topic: 'abilityChoice', unitId: null, abilityId, data: { ...d } as unknown as Record<string, unknown> },
      // option ids carry the position, not the card: the action log is public and must not name the card or where it went
      options: [
        { id: `top:${d.i}`, label: `Predict the Future (${d.i + 1} of ${d.cards.length}): keep ${cardName(id)} on top of the deck`, action: optionAction(player, `top:${d.i}`), hint: { value: (odds - 0.5) * 2 } },
        { id: `bottom:${d.i}`, label: `Predict the Future (${d.i + 1} of ${d.cards.length}): send ${cardName(id)} to the bottom`, action: optionAction(player, `bottom:${d.i}`), hint: { value: (0.5 - odds) * 2 } },
      ],
    })
    return
  }
  ctx.decide({
    kind: 'chooseOption', player, window: 'phase.end', canPass: false,
    context: { topic: 'abilityChoice', unitId: null, abilityId, data: { ...d } as unknown as Record<string, unknown> },
    options: d.tops.map((id, j) => ({ id: `first:${j}`, label: `Predict the Future: put ${cardName(id)} on the very top`, action: optionAction(player, `first:${j}`), hint: { value: tacticOdds(s, player, id) } })),
  })
}

function finishPredict(ctx: EngineContext, player: PlayerId, abilityId: string, d: PredictData, tops: string[]): void {
  const s = ctx.state
  const piles = cardsOf(s).tactics[player]
  const n = d.cards.length
  // the deck cannot change while the decisions are open; if it somehow did, leave it alone
  const looked = piles.deck.slice(0, n)
  if (looked.length !== n || !looked.every((c) => d.cards.includes(c))) return
  piles.deck = [...tops, ...piles.deck.slice(n), ...d.bottoms]
  ctx.emit({
    type: 'AbilityTriggered', abilityId, sourceUnitId: null, targetUnitId: null, player,
    summary: `Predict the Future: looked at ${n} card${n === 1 ? '' : 's'}, ${tops.length} stay on top and ${d.bottoms.length} go to the bottom`,
  })
}

const predictActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => cardsOf(state).tactics[use.player ?? state.activePlayer].deck.length > 0,
  resolve(ctx, use) {
    const s = ctx.state
    const deck = cardsOf(s).tactics[use.player].deck
    const n = Math.min(num(paramOf(s, use.abilityId, 'look', 3), 3), deck.length)
    if (n <= 0) return
    raisePredict(ctx, use.player, use.abilityId, { code: CODE_PREDICT, cards: deck.slice(0, n), stage: 'sort', i: 0, tops: [], bottoms: [] })
  },
}

const tzeentchPredictTheFuture: EngineCodeHook = {
  name: CODE_PREDICT, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: predictActivate,
  answer(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
    if (pending.kind !== 'chooseOption' || action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Predict the Future: pick one of the offered options' }
    const d = pending.context.data as unknown as PredictData
    const abilityId = pending.context.abilityId ?? 'tzeentch.ability.predict-the-future'
    const [verb, at] = action.optionId.split(':')
    if (d.stage === 'sort') {
      if (Number(at) !== d.i || (verb !== 'top' && verb !== 'bottom')) return { code: 'E_NOT_AN_OPTION', reason: 'Predict the Future: top or bottom for the card shown' }
      const id = d.cards[d.i]
      const next: PredictData = { ...d, i: d.i + 1, tops: verb === 'top' ? [...d.tops, id] : d.tops, bottoms: verb === 'bottom' ? [...d.bottoms, id] : d.bottoms }
      if (next.i < next.cards.length) { raisePredict(ctx, pending.player, abilityId, next); return }
      if (next.tops.length >= 2) { raisePredict(ctx, pending.player, abilityId, { ...next, stage: 'order' }); return }
      finishPredict(ctx, pending.player, abilityId, next, next.tops)
      return
    }
    const first = d.tops[Number(at)]
    if (verb !== 'first' || first === undefined) return { code: 'E_NOT_AN_OPTION', reason: 'Predict the Future: pick which kept card goes on the very top' }
    finishPredict(ctx, pending.player, abilityId, d, [first, ...d.tops.filter((c) => c !== first)])
  },
}

// ---------- DOT-BT-4 Cheat Destiny ----------
const cheatMark = (player: PlayerId): string => `tz:cheat:${player}`

const tzeentchCheatDestiny: EngineCodeHook = {
  name: CODE_CHEAT, kind: 'ability', hook: 'onStatQuery', run: noop,
  onTacticCommandUsed(ctx, entry, info) {
    const s = ctx.state
    if (s.phaseState.marks.includes(cheatMark(info.player))) return
    const piles = cardsOf(s).tactics[info.player]
    if (!piles.discard.includes(info.cardId) && !(piles.fulfilled ?? []).includes(info.cardId)) return
    const abilityId = entry.ability?.id ?? entry.source.id
    // the card is already in the discard pile, so this count includes it
    const gateway = tzeentchGatewayWorth(s, info.player)
    ctx.decide({
      kind: 'chooseOption', player: info.player, window: 'phase.end', canPass: true,
      context: { topic: 'abilityChoice', unitId: null, abilityId, data: { code: CODE_CHEAT, cardId: info.cardId } },
      options: [{
        id: `bottom:${info.cardId}`, label: `Cheat Destiny: put ${cardName(info.cardId)} on the bottom of the deck instead of discarding it`,
        action: optionAction(info.player, `bottom:${info.cardId}`), hint: { value: gateway ? -2 : 0.6 },
      }],
    })
  },
  answer(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
    if (pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Cheat Destiny: chooseOption expected' }
    if (action.type === 'pass') return
    if (action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'Cheat Destiny: return the card or decline' }
    const s = ctx.state
    const player = pending.player
    const cardId = String(pending.context.data.cardId ?? '')
    if (action.optionId !== `bottom:${cardId}`) return { code: 'E_NOT_AN_OPTION', reason: 'Cheat Destiny: not the card that was used' }
    if (s.phaseState.marks.includes(cheatMark(player))) return { code: 'E_NOT_AN_OPTION', reason: 'Cheat Destiny: already used this phase' }
    if (!returnTacticToDeckBottom(s, player, cardId)) return { code: 'E_NOT_AN_OPTION', reason: 'Cheat Destiny: that card is not in the discard pile' }
    s.phaseState.marks.push(cheatMark(player))
    ctx.emit({
      type: 'AbilityTriggered', abilityId: pending.context.abilityId ?? 'tzeentch.ability.cheat-destiny', sourceUnitId: null, targetUnitId: null, player,
      summary: 'Cheat Destiny: the used battle tactic card goes face down to the bottom of the deck instead of the discard pile',
    })
  },
}

// ---------- DOT-RA-1 Constant Flux ----------
const tzeentchConstantFlux: EngineCodeHook = {
  name: CODE_FLUX, kind: 'ability', hook: 'onStatQuery', run: noop, affectsCompanion: true,
  // Rend is the AP axis with the sign flipped: +1 on AP = -1 Rend (weapons.ts effectiveWeapon floors Rend at 0)
  statDelta(state, entry, q) {
    if (q.stat !== 'AP' || !q.attack || !q.weapon || q.weapon.rend <= 0) return 0
    const holder = state.units[entry.holderUnitId]
    if (!holder || q.attack.targetUnitId !== holder.id || state.underdog !== holder.player) return 0
    return 1
  },
}

// ---------- DOT-RA-2 Arcane Ritualists ----------
const tzeentchArcaneRitualists: EngineCodeHook = {
  name: CODE_RITUALISTS, kind: 'ability', hook: 'onStatQuery', run: noop,
  castingRollBonus(state, entry, casterUnitId) {
    const holder = onBoard(state, entry.holderUnitId)
    if (!holder || casterUnitId !== holder.id || generalOf(state, holder.player) !== holder.id) return 0
    const range = num(entry.params.range, 6)
    // the general is wholly within `range` of another friendly unit
    return unitsOf(state, holder.player).some((id) => id !== holder.id && whollyWithinUnit(state, holder.id, id, range)) ? num(entry.params.bonus, 1) : 0
  },
}

// ---------- DOT-ENH-1 Predicted Strike ----------
const strikeOpts: SlideOpts = { noCombatPath: true }
const PROBE = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2)

// a cheap legality probe: some short slide exists that keeps clear of enemy combat ranges
const canSlide = (state: GameState, unitId: UnitId): boolean => PROBE.some((a) => checkSlide(state, unitId, Math.cos(a), Math.sin(a), 1, false, strikeOpts).ok)

function strikeTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const general = onBoard(state, unitId)
  if (!general) return []
  const range = num(paramsByCode(state, general.id, CODE_STRIKE).range, 12)
  return unitsOf(state, general.player).filter((id) => whollyWithinUnit(state, id, general.id, range) && !inCombat(state, id) && seesUnit(state, general.id, id) && canSlide(state, id))
}

const strikeActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(strikeTargets(state, unitId), use),
  targets: strikeTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const d = ctx.rollExpr(paramOf<DiceExpr>(s, use.abilityId, 'dice', 'D6'), { purpose: 'ability', player: use.player, unitId: target.id, commandRerollable: false }).total
    writeMoveQueue(s, { abilityId: use.abilityId, player: use.player, maxDistance: d, queue: [target.id], opts: strikeOpts })
    announce(ctx, use, target.id, `Predicted Strike: ${target.name} may move up to ${d}" without entering combat`)
  },
}
const tzeentchPredictedStrike: EngineCodeHook = { name: CODE_STRIKE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: strikeActivate }

// ---------- DOT-ENH-2 Fold Reality ----------
function foldTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const general = onBoard(state, unitId)
  if (!general) return []
  const range = num(paramsByCode(state, general.id, CODE_FOLD).range, 12)
  return unitsOf(state, general.player).filter((id) => id !== general.id && whollyWithinUnit(state, id, general.id, range) && seesUnit(state, general.id, id))
}

const foldActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(foldTargets(state, unitId), use),
  targets: foldTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const general = onBoard(s, use.unitId)
    const target = onBoard(s, use.targetUnitIds[0])
    if (!general || !target) return
    const range = num(paramOf(s, use.abilityId, 'range', 12), 12)
    const minEnemyDistance = num(paramOf(s, use.abilityId, 'minEnemyDistance', 6), 6)
    const origin = liftForRedeploy(ctx, target.id, use.abilityId)
    // markSetUp: CORE-6.13, the unit counts as set up this turn (no Move abilities in this turn's movement phase)
    requestRedeploy(s, { abilityId: use.abilityId, player: use.player, unitIds: [target.id], minEnemyDistance, anchor: { unitId: general.id, whollyWithin: range }, origin, markSetUp: true })
    announce(ctx, use, target.id, `Fold Reality: ${target.name} vanishes and will be set up again wholly within ${range}" of ${general.name}`)
  },
}
const tzeentchFoldReality: EngineCodeHook = { name: CODE_FOLD, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: foldActivate }

// ---------- DOT-ENH-3 Infernal Gateway ----------
function gatewayTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const general = onBoard(state, unitId)
  if (!general) return []
  const range = num(paramsByCode(state, general.id, CODE_GATEWAY).range, 18)
  return unitsOf(state, other(general.player)).filter((id) => unitGap(state, general.id, id) <= range + EPS && seesUnit(state, general.id, id))
}

const gatewayDice = (state: GameState, player: PlayerId, minDice: number): number => Math.max(minDice, cardsOf(state).tactics[player].discard.length)

const gatewayActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(gatewayTargets(state, unitId), use),
  targets: gatewayTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    const n = gatewayDice(s, use.player, num(paramOf(s, use.abilityId, 'minDice', 3), 3))
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 4), 4)
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: n, mode: 'perDie', unitId: use.unitId, targetUnitId: target.id, commandRerollable: false })
    const hits = roll.final.filter((v) => v >= need).length
    announce(ctx, use, target.id, `Infernal Gateway: ${n} dice, ${hits} scored ${need}+, ${hits} mortal damage on ${target.name}`)
    inflictMortal(ctx, use, target.id, hits)
  },
}
const tzeentchInfernalGateway: EngineCodeHook = { name: CODE_GATEWAY, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: gatewayActivate }

// AI helper: with Infernal Gateway and 3 or more cards in the discard pile, every discard is an extra die, so Cheat Destiny stands down
function tzeentchGatewayWorth(state: GameState, player: PlayerId): boolean {
  const general = generalOf(state, player)
  return !!general && state.units[general].enhancementId === ENH_GATEWAY && cardsOf(state).tactics[player].discard.length >= 3
}

// ---------- DOT-ENH-4 Mutagenic Sorcery ----------
// friendly Tzaangors units in combat with the enemy unit (units with a slain model first)
const tzaangorsAgainst = (state: GameState, player: PlayerId, enemy: UnitId): UnitId[] =>
  unitsOf(state, player).filter((id) => isTzaangors(state, id) && enemiesInCombat(state, id).includes(enemy))
    .sort((a, b) => returnableModels(state, b) - returnableModels(state, a) || (a < b ? -1 : 1))

function mutagenicTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const general = onBoard(state, unitId)
  if (!general) return []
  const range = num(paramsByCode(state, general.id, CODE_MUTAGENIC).range, 12)
  return unitsOf(state, other(general.player)).filter((id) => unitGap(state, general.id, id) <= range + EPS && seesUnit(state, general.id, id) && tzaangorsAgainst(state, general.player, id).length > 0)
}

const mutagenicActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(mutagenicTargets(state, unitId), use),
  targets: mutagenicTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const enemy = onBoard(s, use.targetUnitIds[0])
    if (!enemy) return
    const friendly = tzaangorsAgainst(s, use.player, enemy.id)[0]
    if (!friendly) return
    const dice = paramOf<DiceExpr>(s, use.abilityId, 'dice', 'D3')
    const need = num(paramOf(s, use.abilityId, 'succeedOn', 2), 2)
    const r = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: enemy.id, commandRerollable: false }).total
    if (r < need) {
      announce(ctx, use, enemy.id, `Mutagenic Sorcery: rolled ${r}, nothing happens`)
      return
    }
    announce(ctx, use, enemy.id, `Mutagenic Sorcery: rolled ${r}, ${r} mortal damage on ${enemy.name}`)
    inflictMortal(ctx, use, enemy.id, r)
    if (onBoard(s, friendly) && returnableModels(s, friendly) > 0) {
      const back = returnSlainModels(ctx, friendly, num(paramOf(s, use.abilityId, 'returnModels', 1), 1), use.abilityId)
      if (back > 0) announce(ctx, use, friendly, `Mutagenic Sorcery: ${back} slain model returns to ${s.units[friendly].name}`)
    }
  },
}
const tzeentchMutagenicSorcery: EngineCodeHook = { name: CODE_MUTAGENIC, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: mutagenicActivate }

// ---------- DOT-AB-1 Mutative Aura ----------
function auraTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const mage = onBoard(state, unitId)
  if (!mage) return []
  const range = num(paramsByCode(state, mage.id, CODE_AURA).range, 18)
  return unitsOf(state, other(mage.player)).filter((id) => unitGap(state, mage.id, id) <= range + EPS && seesUnit(state, mage.id, id))
}

const auraActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(auraTargets(state, unitId), use),
  targets: auraTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    // a recast replaces the old marker; the aura lasts until the start of the caster's next turn, not the target's (the default expiry
    // belongs to the unit that holds the effect)
    target.effects = target.effects.filter((e) => e.sourceAbilityId !== use.abilityId)
    // F18 (HOH C3): the effect sits on an enemy unit and lasts until the start of the user's next turn
    const active = effectService.grant(ctx, target.id, {}, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn', expiryOwner: use.player })
    announce(ctx, use, target.id, `Mutative Aura: until the start of the next turn, ${target.name} suffers 1 mortal damage for each unmodified 1 it rolls to hit in combat`)
  },
}

const tzeentchMutativeAura: EngineCodeHook = {
  name: CODE_AURA, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: auraActivate,
  afterAttackSequence(ctx, entry, info) {
    if (!entry.active || !info.combat || info.hitOnes <= 0 || info.attackerUnitId !== entry.holderUnitId) return
    const s = ctx.state
    const target = onBoard(s, entry.holderUnitId)
    if (!target) return
    const abilityId = entry.active.sourceAbilityId
    const count = info.hitOnes * num(entry.params.mortal, 1)
    const caster = other(target.player)
    ctx.emit({
      type: 'AbilityTriggered', abilityId, sourceUnitId: entry.active.sourceUnitId, targetUnitId: target.id, player: caster,
      summary: `Mutative Aura: ${info.hitOnes} unmodified hit roll${info.hitOnes === 1 ? '' : 's'} of 1, ${count} mortal damage on ${target.name} once its Fight ability is resolved`,
    })
    deferMortalAfterFight(s, { targetUnitId: target.id, count, source: abilityId, player: caster })
  },
}

// ---------- DOT-AB-3 Destined Quarry ----------
function quarryTargets(state: GameState, unitId: UnitId | null): UnitId[] {
  const me = onBoard(state, unitId)
  return me ? damagedByShootingThisPhase(state, me.id).filter((id) => onBoard(state, id)?.player === other(me.player)) : []
}

const quarryActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => pickedOk(quarryTargets(state, unitId), use),
  targets: quarryTargets,
  resolve(ctx, use) {
    const s = ctx.state
    const target = onBoard(s, use.targetUnitIds[0])
    if (!target) return
    // scope 'attacker': the holder is the unit being attacked, the modified roll is the attacker's (friendly combat attacks on it)
    effectService.grant(ctx, target.id, { when: { weaponType: 'melee' }, modifyRoll: { roll: 'hit', value: 1 } }, {
      sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'attacker' }, duration: 'untilEndOfTurn',
    })
    announce(ctx, use, target.id, `Destined Quarry: combat attacks against ${target.name} add 1 to their hit rolls for the rest of the turn`)
  },
}
const tzeentchDestinedQuarry: EngineCodeHook = { name: CODE_QUARRY, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: quarryActivate }

// ---------- DOT-AB-2 Deliver on Fate / DOT-AB-4 Eldritch Raiders (gates on descriptor effects) ----------
const tzeentchUnderdog: EngineCodeHook = {
  name: CODE_UNDERDOG, kind: 'ability', hook: 'onChargeRoll', run: noop,
  gate: (state, holder) => state.underdog === holder.player,
}

const tzeentchEldritchRaiders: EngineCodeHook = {
  name: CODE_RAIDERS, kind: 'ability', hook: 'onWoundRoll', run: noop,
  // SPH-1.4: every model wholly within the opponent's territory (a model on the dividing line is not)
  gate(state, holder) {
    const models = liveModels(state, holder.id)
    if (models.length === 0) return false
    const territory = territoryOf(state, other(holder.player))
    return models.every((m) => whollyWithinPolygon(m, territory))
  },
}

// ---------- a rough damage estimate for the AI hints (kept here so the engine does not import src/ai) ----------
const rollP = (target: number): number => Math.max(1 / 6, Math.min(5 / 6, (7 - target) / 6))

function estimateDamage(state: GameState, attackerId: UnitId, targetId: UnitId, kinds: ('ranged' | 'melee')[]): number {
  const defenders = liveModels(state, targetId)
  if (defenders.length === 0) return 0
  const dst = modelStats(state, defenders[0])
  let total = 0
  for (const m of liveModels(state, attackerId)) {
    for (const wid of m.weapons) {
      const w = weaponService.effectiveWeapon(state, m.id, wid)
      if (!w || !kinds.includes(w.kind)) continue
      const hits = diceExprMean(w.A) * (w.skill === null ? 1 : rollP(w.skill))
      const need = dst.Sv + w.rend
      const unsaved = dst.noSave || need > 6 ? 1 : 1 - rollP(need)
      let dmg = hits * rollP(w.wound) * unsaved * diceExprMean(w.D)
      if (dst.ward !== null) dmg *= 1 - rollP(dst.ward)
      total += dmg
    }
  }
  return total
}

const attacksOf = (state: GameState, unitId: UnitId, kind: 'ranged' | 'melee'): number =>
  liveModels(state, unitId).reduce((n, m) => n + m.weapons.reduce((a, w) => a + (state.weapons[w] && state.weapons[w].kind === kind ? diceExprMean(state.weapons[w].A) : 0), 0), 0)

// enemy melee damage the unit stands to take from the enemy units it is in combat with
const meleeThreat = (state: GameState, unitId: UnitId): number =>
  enemiesInCombat(state, unitId).reduce((n, e) => n + estimateDamage(state, e, unitId, ['melee']), 0)

// the friendly unit in combat that would lose its fight (Fold Reality pulls it out)
const losingUnits = (state: GameState, player: PlayerId): UnitId[] =>
  unitsOf(state, player).filter((id) => inCombat(state, id) && meleeThreat(state, id) >= woundsLeft(state, id) * 0.8)

// a unit that is not on an objective it could reach with a short move: Predicted Strike value
const grabsObjective = (state: GameState, unitId: UnitId): boolean => {
  const u = state.units[unitId]
  if (!u) return false
  return liveObjectives(state).some((o) => o.controller !== u.player && !unitContestsObjective(state, unitId, o) && liveModels(state, unitId).some((m) => Math.hypot(m.pos.x - o.pos.x, m.pos.z - o.pos.z) <= (o.radius ?? 3) + 5))
}

// ---------- AI hints (src/ai/utility.ts abilityTiming / abilityTargetBonus; null = no opinion) ----------
// below -2 the bot passes instead of using the ability. Each hero phase the Shaman has one cast: the enhancement spell beats Mutative
// Aura when it kills or rescues a unit, otherwise Mutative Aura goes on the enemy most likely to fight next.
export function tzeentchAbilityTiming(state: GameState, player: PlayerId, code: string, unitId: UnitId | null): number | null {
  const general = unitId ?? generalOf(state, player)
  switch (code) {
    case CODE_PREDICT:
      return cardsOf(state).tactics[player].deck.length > 0 ? 0 : -3
    case CODE_GATEWAY: {
      if (!general) return -3
      const dice = gatewayDice(state, player, 3)
      const kill = gatewayTargets(state, general).some((id) => woundsLeft(state, id) <= dice * 0.5 + 0.5 || liveModels(state, id).some((m) => m.woundsRemaining <= 2))
      return 0.9 + (kill ? 1 : 0)
    }
    case CODE_FOLD: {
      if (!general) return -3
      const targets = foldTargets(state, general)
      if (losingUnits(state, player).some((id) => targets.includes(id))) return 1.5
      // the other use: drop the Tzaangors into enemy territory (Eldritch Raiders) when the Shaman stands there to anchor the set-up
      const there = liveModels(state, general).some((m) => pointInPolygon({ x: m.pos.x, z: m.pos.z }, territoryOf(state, other(player))))
      const tz = targets.find((id) => isTzaangors(state, id) && !inCombat(state, id) && !liveModels(state, id).every((m) => pointInPolygon({ x: m.pos.x, z: m.pos.z }, territoryOf(state, other(player)))))
      return there && tz ? 0.6 : -3
    }
    case CODE_AURA:
      return general && auraTargets(state, general).length > 0 ? 0.3 : -3
    case CODE_MUTAGENIC:
      return 1
    case CODE_STRIKE: {
      // once per battle: spend it on a unit a short move would put on an objective the enemy holds or nobody holds
      if (!general) return -3
      const targets = strikeTargets(state, general)
      if (targets.some((id) => grabsObjective(state, id))) return 0.5
      return state.round >= 3 && targets.length > 0 ? 0 : -3 // late in the battle an unused once-per-battle ability is worth nothing
    }
    case CODE_QUARRY:
      return 0.5
    default:
      return null
  }
}

export function tzeentchTargetBonus(state: GameState, player: PlayerId, code: string, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit) return null
  switch (code) {
    case CODE_AURA: {
      // the enemy unit that will swing most at us (its melee Attacks, nearer first)
      const gaps = unitsOf(state, player).map((id) => unitGap(state, id, unitId))
      const gap = gaps.length > 0 ? Math.min(...gaps) : 30
      return Math.min(4, attacksOf(state, unitId, 'melee') * 0.15) - Math.min(30, gap) * 0.05
    }
    case CODE_GATEWAY:
    case CODE_MUTAGENIC: {
      // the enemy unit closest to dying, a Hero first on a tie
      const left = Math.max(1, woundsLeft(state, unitId))
      return Math.max(0, 8 - left) * 0.4 + (state.units[unitId].player !== player && liveModels(state, unitId).length === 1 ? 0.3 : 0)
    }
    case CODE_FOLD: {
      // the unit in the worst fight
      return losingUnits(state, player).includes(unitId) ? 3 + meleeThreat(state, unitId) / Math.max(1, woundsLeft(state, unitId)) : isTzaangors(state, unitId) ? 0.5 : 0
    }
    case CODE_STRIKE:
      return (grabsObjective(state, unitId) ? 2 : 0) + moveOf(state, unitId) * 0.02
    case CODE_QUARRY: {
      // the damaged enemy our melee units can reach: their Attacks that can strike it
      return unitsOf(state, player).reduce((n, id) => {
        const reach = moveOf(state, id) + 12
        return n + (unitGap(state, id, unitId) <= reach + EPS ? attacksOf(state, id, 'melee') * 0.1 : 0)
      }, 0)
    }
    default:
      return null
  }
}

export const tzeentchHooks: Record<string, EngineCodeHook> = {
  tzeentchPredictTheFuture, tzeentchCheatDestiny, tzeentchConstantFlux, tzeentchArcaneRitualists, tzeentchPredictedStrike, tzeentchFoldReality,
  tzeentchInfernalGateway, tzeentchMutagenicSorcery, tzeentchMutativeAura, tzeentchDestinedQuarry, tzeentchUnderdog, tzeentchEldritchRaiders,
}
