// Spearhead card systems (11-spearhead §3, §9, §10; 14-fire-and-jade-cards): the twist deck, each player's battle tactic
// hand, card commands and the extra scoring the cards bring. Card text lives in the data bundle (src/data/cards/*.json);
// this module implements every card by id. State: GameState.cards (types.ts CardsState) plus GameState.twist.
//
// Flow, all re-entrant (state + marks, so the reducer can call the same function again after every answered decision):
//   round start (reducer startRoundChain, SPH-8.2 ③④): shuffle once (seeded RNG, SPH-3.6) -> draw the twist -> its picks
//     (chooseOption 'twistPick') -> each player, first-turn player first: discard any number (round 2+, 'discardTactics')
//     then draw back up to 3 (round 1: draw 3), unless they seized the initiative (SPH-10.4).
//   card commands: `commandWindow` from the phase modules (Hero, Movement, Charge, Combat phases, both players) and
//     `reactionWindow` from ctx.window (targets declared, charge / retreat rolls). One 'tacticCommand' decision lists every
//     card x target pair; using one discards the card face up (SPH-10.5). Redeploy / Call Reinforcements ask one more
//     'tacticCommand' answer (where to move / set up).
//   end of turn (reducer endTurnChain, SPH-8.6 ③④): twist VP, then the active player scores met tactics ('scoreTactics',
//     1 VP each, card to the public scored pile), then after-scoring twist effects (Ring of Fire, Lifespring).
//   end of round: Bloodmarked VP, round-long flags lapse, the twist ends.
import type { CardDeckData, DataBundle, TwistPicker } from '../data/types'
import type { Action } from './actions'
import { attackService } from './attack'
import {
  cardNoRetreatDamage, emptyCardsState, flagsOf, isLargeFeature, modelsOnFeature, objectiveByName, objectiveDisabled,
  unitOnObjective, unitsOnObjective,
} from './cardFlags'
import { rollSum } from './dice'
import { ENGAGEMENT_H, EPS, anyWithinEngagementRange, basesOverlap, checkPlacements, dist2D, distance, emptyMoveConstraints, pointInPolygon, whollyOnBoard, whollyWithinPolygon, type Footprint } from './geometry'
import { applySlide, checkSlide, parseAt, parseSlide, slideOptions } from './factions/aos-moves'
import { healUnit, inCombat, returnSlainModels, returnableModels } from './factions/aos-common'
import { losService } from './los'
import { awardVp } from './missions'
import { codeHookFor, hookService, sourceGateOpen, sourcesFor } from './hooks-impl'
import { otherPlayer, type DecisionHandler, type EngineContext, type WindowTrigger } from './modules'
import { canDeclareCharge, neededChargeDistance } from './phases/charge'
import { boardModelsOf, datasheetOf, enemyModelsOnBoard, keywordsOf, modelStats, setModelPos, spawnUnitCopy, territoryOf, unitModels } from './state'
import { terrainService } from './terrain'
import type {
  CardFlag, CardFlagKind, CardsState, DecisionOption, GameState, Id, Model, ObjectiveId, PendingDecision, PlayerId, Rejection,
  TwistPick, UnitId, Vec2,
} from './types'

// ---------- ids and names (names mirror src/data/cards/fire-and-jade.json; a test keeps them in step) ----------
export const TWIST_NAMES: Record<string, string> = {
  'card.twist.ring-of-fire': 'Ring of Fire',
  'card.twist.let-the-blood-flow': 'Let the Blood Flow',
  'card.twist.bloodmarked': 'Bloodmarked',
  'card.twist.reclaim-aqshy': 'Reclaim Aqshy',
  'card.twist.mount-the-attack': 'Mount the Attack',
  'card.twist.wreathed-in-smoke': 'Wreathed in Smoke',
  'card.twist.reclaim-ghyran': 'Reclaim Ghyran',
  'card.twist.alarielles-blessing': "Alarielle's Blessing",
  'card.twist.take-the-land': 'Take the Land',
  'card.twist.grasping-vines': 'Grasping Vines',
  'card.twist.the-grandfathers-blessing': "The Grandfather's Blessing",
  'card.twist.lifespring': 'Lifespring',
}

export const TWIST_PICKERS: Record<string, TwistPicker> = {
  'card.twist.ring-of-fire': 'underdogElseRollOff',
  'card.twist.let-the-blood-flow': 'underdog',
  'card.twist.bloodmarked': 'underdogElseEach',
  'card.twist.reclaim-aqshy': 'underdogElseEach',
  'card.twist.mount-the-attack': 'underdog',
  'card.twist.wreathed-in-smoke': 'underdogElseRollOff',
  'card.twist.reclaim-ghyran': 'underdogElseEach',
  'card.twist.alarielles-blessing': 'underdogElseRollOff',
  'card.twist.take-the-land': 'underdog',
  'card.twist.grasping-vines': 'underdogElseRollOff',
  'card.twist.the-grandfathers-blessing': 'underdogElseRollOff',
  'card.twist.lifespring': 'underdogElseRollOff',
}

export const TACTIC_NAMES: Record<string, { name: string; command: string }> = {
  'card.tactic.war-of-attrition': { name: 'War of Attrition', command: 'Stand Guard' },
  'card.tactic.raid': { name: 'Raid', command: 'Steel Defence' },
  'card.tactic.take-the-flanks': { name: 'Take the Flanks', command: 'Redeploy' },
  'card.tactic.take-without-warning': { name: 'Take Without Warning', command: 'Fight to the Last' },
  'card.tactic.hold-ground': { name: 'Hold Ground', command: 'Rise to the Challenge' },
  'card.tactic.cut-off-the-head': { name: 'Cut Off the Head', command: 'Counter-Charge' },
  'card.tactic.the-ignax-dais': { name: 'The Ignax Dais', command: 'Forward to Victory' },
  'card.tactic.the-behemat-dais': { name: 'The Behemat Dais', command: 'Scroll of Arcane Bolt' },
  'card.tactic.the-dracothion-dais': { name: 'The Dracothion Dais', command: 'Go to Ground' },
  'card.tactic.raze': { name: 'Raze', command: 'Inspiring Presence' },
  'card.tactic.attack-on-two-fronts': { name: 'Attack on Two Fronts', command: 'Call Reinforcements' },
  'card.tactic.do-not-waver': { name: 'Do Not Waver', command: 'Fall Back and Rally' },
}

export const cardName = (id: Id): string => TWIST_NAMES[id] ?? TACTIC_NAMES[id]?.name ?? id
export const HAND_SIZE = 3
export const DEFAULT_REALM_BATTLEFIELD = 'rbf.fire-and-jade'

// ---------- state ----------
export function cardsOf(s: GameState): CardsState {
  if (!s.cards) s.cards = emptyCardsState()
  return s.cards
}

// createGameState: the card lists of the bundle's realm battlefield (none in hand-built test bundles)
export function initialCardsState(bundle: DataBundle): CardsState {
  const c = emptyCardsState()
  const decks = bundle.cardDecks ?? {}
  const deck: CardDeckData | undefined = decks[DEFAULT_REALM_BATTLEFIELD] ?? Object.values(decks)[0]
  if (!deck) return c
  for (const t of deck.twists) if (TWIST_NAMES[t.id]) (c.pool.twists[t.side] ??= []).push(t.id)
  c.pool.tactics = deck.tactics.map((t) => t.id).filter((id) => TACTIC_NAMES[id])
  return c
}

const unitName = (s: GameState, id: UnitId | null | undefined): string => (id ? s.units[id]?.name ?? id : 'army')
const objectiveName = (s: GameState, id: ObjectiveId): string => s.objectives[id]?.name ?? id
const boardUnits = (s: GameState, p: PlayerId) => Object.values(s.units).filter((u) => u.player === p && u.location === 'board' && unitModels(s, u.id).length > 0)
const liveObjectives = (s: GameState) => Object.values(s.objectives).filter((o) => !o.removed)
const optionAction = (player: PlayerId, optionId: string): Action => ({ type: 'chooseOption', player, decisionId: '', optionId })

function shuffle<T>(ctx: EngineContext, list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.rng.next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// rough worth of a unit for the AI's picks: remaining wounds plus weapons carried
export function unitWorth(s: GameState, unitId: UnitId): number {
  let w = 0
  for (const m of unitModels(s, unitId)) w += m.woundsRemaining + m.weapons.length * 0.5
  return w
}

const centroid = (models: Model[]): Vec2 => ({ x: models.reduce((a, m) => a + m.pos.x, 0) / Math.max(1, models.length), z: models.reduce((a, m) => a + m.pos.z, 0) / Math.max(1, models.length) })

function nearestEnemyGap(s: GameState, unitId: UnitId): number {
  const u = s.units[unitId]
  if (!u) return Infinity
  const mine = unitModels(s, unitId)
  let best = Infinity
  for (const e of enemyModelsOnBoard(s, u.player)) for (const m of mine) best = Math.min(best, distance(m, e))
  return best
}

function gapToObjective(s: GameState, player: PlayerId, objectiveId: ObjectiveId): number {
  const o = s.objectives[objectiveId]
  if (!o) return Infinity
  let best = Infinity
  for (const m of boardModelsOf(s, player)) best = Math.min(best, dist2D(m.pos, o.pos) - (o.radius ?? 3))
  return Math.max(0, best)
}

// ---------- events the cards track (reducer emit) ----------
export function trackCardEvent(s: GameState, e: { type: string; unitId?: UnitId }): void {
  const c = s.cards
  if (!c) return
  if (e.type === 'UnitDestroyed' && e.unitId) {
    c.turnLog.destroyed.push(e.unitId)
    c.roundDestroyed.push(e.unitId)
    const u = s.units[e.unitId]
    if (u && s.players[u.player]?.warlordUnitId === e.unitId && !c.generalSlain[u.player]) c.generalSlain[u.player] = { round: s.round, turn: s.activePlayer }
  } else if (e.type === 'FightUnitSelected' && e.unitId) {
    if (!c.turnLog.fought.includes(e.unitId)) c.turnLog.fought.push(e.unitId)
  }
}

// start of every turn: fresh turn log and the objective-control snapshot the flip-count cards read
export function cardsTurnStart(s: GameState): void {
  const c = cardsOf(s)
  c.turnLog = { destroyed: [], fought: [] }
  for (const o of Object.values(s.objectives)) o.controllerAtTurnStart = o.controller
}

export function expireCardFlags(s: GameState, until: CardFlag['until']): void {
  // CITIES-BT-1: a card set aside by The Officer's Order that was neither used nor scored goes back at the end of its owner's turn
  if (until === 'turn') clearOfficersOrder(s, s.activePlayer)
  // STD-BT-1: an oath not fulfilled this turn stops being the oath (the card stays in the hand)
  if (until === 'turn') clearOath(s, s.activePlayer)
  const c = s.cards
  if (!c || c.flags.length === 0) return
  c.flags = c.flags.filter((f) => f.until !== until)
}

// ---------- CITIES-BT-1 The Officer's Order: one battle tactic card set aside per battle round ----------
// Kept in mission.custom (types.ts is a frozen contract): officersOrder[player] = the set-aside card (it stays in the hand, so
// scoring and command offers see it), officersLock[player] = the card whose command came back this phase and cannot be used
// again until the phase changes.
interface OfficersLock { cardId: Id; round: number; turn: PlayerId; phase: string }
const officersMap = (s: GameState): Partial<Record<PlayerId, Id>> => (s.mission.custom.officersOrder as Partial<Record<PlayerId, Id>> | undefined) ?? {}
export function officersOrderCard(s: GameState, p: PlayerId): Id | null {
  const id = officersMap(s)[p]
  return id && s.cards?.tactics[p].hand.includes(id) ? id : null
}
export function setOfficersOrder(s: GameState, p: PlayerId, cardId: Id): void {
  s.mission.custom = { ...s.mission.custom, officersOrder: { ...officersMap(s), [p]: cardId } }
}
export function clearOfficersOrder(s: GameState, p: PlayerId): void {
  const m = officersMap(s)
  if (m[p] === undefined) return
  const next = { ...m }
  delete next[p]
  s.mission.custom = { ...s.mission.custom, officersOrder: next }
}
// ---------- STD-BT-1 Oaths of Darkness: an oath card per turn, fulfilled cards set to one side ----------
// Generic piles any faction hook may use: setOath marks a hand card as the turn's oath (shown to the opponent). Scoring the oath
// moves it to `fulfilled` (it also stays on the public scored record) instead of leaving it on the table; a fulfilled card's
// command can be used later (then it is discarded). Using the oath's command before scoring it discards it as normal. The oath
// lapses at the end of the turn (expireCardFlags 'turn'). Fulfilled cards are not in the hand, so the 3-card limit ignores them.
export function oathOf(s: GameState, p: PlayerId): Id | null {
  const piles = s.cards?.tactics[p]
  const id = piles?.oath ?? null
  return id && piles?.hand.includes(id) ? id : null
}
export function fulfilledOf(s: GameState, p: PlayerId): Id[] {
  return s.cards?.tactics[p]?.fulfilled ?? []
}
export function setOath(s: GameState, p: PlayerId, cardId: Id): boolean {
  const piles = cardsOf(s).tactics[p]
  if (!piles || !piles.hand.includes(cardId)) return false
  piles.oath = cardId
  return true
}
export function clearOath(s: GameState, p: PlayerId): void {
  const piles = s.cards?.tactics[p]
  if (piles && piles.oath) piles.oath = null
}
// the cards whose commands a player may use: the hand plus the fulfilled oaths
const commandCards = (s: GameState, p: PlayerId): Id[] => {
  const piles = s.cards?.tactics[p]
  return piles ? [...piles.hand, ...(piles.fulfilled ?? [])] : []
}

function officersLocked(s: GameState, p: PlayerId, cardId: Id): boolean {
  const l = (s.mission.custom.officersLock as Partial<Record<PlayerId, OfficersLock>> | undefined)?.[p]
  return !!l && l.cardId === cardId && l.round === s.round && l.turn === s.activePlayer && l.phase === s.phase
}

function addFlag(s: GameState, f: Omit<CardFlag, 'round' | 'value' | 'unitId' | 'objectiveId'> & Partial<Pick<CardFlag, 'value' | 'unitId' | 'objectiveId'>>): void {
  cardsOf(s).flags.push({ value: 0, unitId: null, objectiveId: null, ...f, round: s.round })
}

// ============================================================================================================
// Battle tactics: conditions (SPH-10.3) and the AI's sense of how likely each one is (0..1)
// ============================================================================================================
const enemyDestroyedThisTurn = (s: GameState, p: PlayerId): number => (s.cards?.turnLog.destroyed ?? []).filter((id) => s.units[id] && s.units[id].player !== p).length
const friendlyDestroyedThisTurn = (s: GameState, p: PlayerId): number => (s.cards?.turnLog.destroyed ?? []).filter((id) => s.units[id] && s.units[id].player === p).length
const flipped = (s: GameState, p: PlayerId): ObjectiveId[] => liveObjectives(s).filter((o) => o.controller === p && o.controllerAtTurnStart === otherPlayer(p)).map((o) => o.id)
const reach = (m: Model): number => Math.max(m.base.radius, m.base.radius2 ?? m.base.radius)

function wholeInEnemyTerritory(s: GameState, unitId: UnitId, p: PlayerId): boolean {
  const poly = territoryOf(s, otherPlayer(p))
  const ms = unitModels(s, unitId)
  return ms.length > 0 && ms.every((m) => whollyWithinPolygon(m, poly))
}

function nearShortEdge(s: GameState, m: Model, side: -1 | 1): boolean {
  const hw = s.board.w / 2
  return side < 0 ? m.pos.x - reach(m) <= -hw + 3 + EPS : m.pos.x + reach(m) >= hw - 3 - EPS
}

function razeModel(s: GameState, m: Model, p: PlayerId): boolean {
  const hh = s.board.h / 2
  const nearLong = m.pos.z - reach(m) <= -hh + 3 + EPS || m.pos.z + reach(m) >= hh - 3 - EPS
  return nearLong && pointInPolygon({ x: m.pos.x, z: m.pos.z }, territoryOf(s, otherPlayer(p)))
}

// exported for LRL-RA-1 Lifted Debris (F8)
export function largeFeatureIn(s: GameState, territoryOwner: PlayerId) {
  const poly = territoryOf(s, territoryOwner)
  return Object.values(s.board.pieces).find((p) => isLargeFeature(p) && pointInPolygon(p.pos, poly)) ?? null
}

function daisHeld(s: GameState, p: PlayerId, name: string): boolean {
  const id = objectiveByName(s, name)
  return !!id && s.objectives[id].controller === p
}

export function tacticMet(s: GameState, p: PlayerId, cardId: Id): boolean {
  const opp = otherPlayer(p)
  switch (cardId) {
    case 'card.tactic.war-of-attrition': {
      const e = enemyDestroyedThisTurn(s, p)
      return e >= 1 && e > friendlyDestroyedThisTurn(s, p)
    }
    case 'card.tactic.raid':
      return boardUnits(s, p).some((u) => wholeInEnemyTerritory(s, u.id, p) && !inCombat(s, u.id))
    case 'card.tactic.take-the-flanks': {
      const units = boardUnits(s, p)
      const left = units.filter((u) => unitModels(s, u.id).some((m) => nearShortEdge(s, m, -1))).map((u) => u.id)
      const right = units.filter((u) => unitModels(s, u.id).some((m) => nearShortEdge(s, m, 1))).map((u) => u.id)
      return left.some((a) => right.some((b) => a !== b))
    }
    case 'card.tactic.take-without-warning': {
      const fought = new Set(s.cards?.turnLog.fought ?? [])
      return flipped(s, p).some((oid) => !unitsOnObjective(s, oid).some((u) => fought.has(u)))
    }
    case 'card.tactic.hold-ground': {
      const piece = largeFeatureIn(s, p)
      return !!piece && modelsOnFeature(s, p, piece) > modelsOnFeature(s, opp, piece)
    }
    case 'card.tactic.cut-off-the-head': {
      const slain = s.cards?.generalSlain[opp]
      if (!slain) return false
      if (slain.round === s.round && slain.turn === s.activePlayer) return true
      return enemyDestroyedThisTurn(s, p) >= 1
    }
    case 'card.tactic.the-ignax-dais': return daisHeld(s, p, 'Ignax')
    case 'card.tactic.the-behemat-dais': return daisHeld(s, p, 'Behemat')
    case 'card.tactic.the-dracothion-dais': return daisHeld(s, p, 'Dracothion')
    case 'card.tactic.raze':
      return boardUnits(s, p).some((u) => unitModels(s, u.id).some((m) => razeModel(s, m, p)))
    case 'card.tactic.attack-on-two-fronts':
      return flipped(s, p).length >= 2
    case 'card.tactic.do-not-waver': {
      const fought = (s.cards?.turnLog.fought ?? []).some((id) => s.units[id]?.player === p)
      return fought && friendlyDestroyedThisTurn(s, p) === 0
    }
    default: return false
  }
}

const clamp01 = (v: number): number => Math.max(0.02, Math.min(0.95, v))

// distance from the unit's nearest model to a polygon (0 when inside)
function gapToPolygon(s: GameState, p: PlayerId, poly: Vec2[], filter?: (m: Model) => boolean): number {
  let best = Infinity
  for (const m of boardModelsOf(s, p)) {
    if (filter && !filter(m)) continue
    if (pointInPolygon({ x: m.pos.x, z: m.pos.z }, poly)) return 0
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      const dx = b.x - a.x, dz = b.z - a.z
      const t = Math.max(0, Math.min(1, ((m.pos.x - a.x) * dx + (m.pos.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
      best = Math.min(best, Math.hypot(m.pos.x - (a.x + t * dx), m.pos.z - (a.z + t * dz)))
    }
  }
  return best
}

// how likely the tactic is to be completed at the end of one of the player's coming turns (AI keeps, discards and spends by it)
export function tacticOdds(s: GameState, p: PlayerId, cardId: Id): number {
  if (tacticMet(s, p, cardId)) return 0.9
  const opp = otherPlayer(p)
  const hw = s.board.w / 2, hh = s.board.h / 2
  switch (cardId) {
    case 'card.tactic.war-of-attrition':
    case 'card.tactic.do-not-waver': {
      const close = boardUnits(s, p).filter((u) => nearestEnemyGap(s, u.id) <= 9).length
      return clamp01((cardId === 'card.tactic.do-not-waver' ? 0.15 : 0.2) + 0.1 * close)
    }
    case 'card.tactic.raid': return clamp01(0.75 - gapToPolygon(s, p, territoryOf(s, opp)) / 10)
    case 'card.tactic.take-the-flanks': {
      const gap = (side: -1 | 1): number => Math.min(...boardModelsOf(s, p).map((m) => Math.max(0, side < 0 ? m.pos.x - reach(m) + hw - 3 : hw - 3 - m.pos.x - reach(m))), Infinity)
      return clamp01((1 - gap(-1) / 10) * (1 - gap(1) / 10))
    }
    case 'card.tactic.take-without-warning':
    case 'card.tactic.attack-on-two-fronts': {
      const theirs = liveObjectives(s).filter((o) => o.controller === opp && gapToObjective(s, p, o.id) <= 9).length
      return cardId === 'card.tactic.take-without-warning' ? clamp01(0.1 + 0.25 * theirs) : clamp01(theirs >= 2 ? 0.3 : 0.05)
    }
    case 'card.tactic.hold-ground': {
      const piece = largeFeatureIn(s, p)
      if (!piece) return 0.02
      const near = boardModelsOf(s, p).some((m) => dist2D(m.pos, piece.pos) <= 9)
      return near ? 0.45 : 0.15
    }
    case 'card.tactic.cut-off-the-head': {
      if (s.cards?.generalSlain[opp]) return 0.45
      const gen = s.units[s.players[opp].warlordUnitId]
      if (!gen || gen.location !== 'board') return 0.1
      const ms = unitModels(s, gen.id)
      const W = ms.reduce((a, m) => a + modelStats(s, m).W, 0)
      const left = ms.reduce((a, m) => a + m.woundsRemaining, 0)
      return clamp01(0.08 + 0.5 * (1 - left / Math.max(1, W)) + (nearestEnemyGap(s, gen.id) <= 9 ? 0.15 : 0))
    }
    case 'card.tactic.the-ignax-dais':
    case 'card.tactic.the-behemat-dais':
    case 'card.tactic.the-dracothion-dais': {
      const name = cardId.includes('ignax') ? 'Ignax' : cardId.includes('behemat') ? 'Behemat' : 'Dracothion'
      const id = objectiveByName(s, name)
      if (!id) return 0.02
      const gap = gapToObjective(s, p, id)
      const theirs = s.objectives[id].controller === opp
      return clamp01((gap <= 1 ? 0.6 : gap <= 8 ? 0.45 : 0.15) - (theirs ? 0.1 : 0))
    }
    case 'card.tactic.raze': {
      const enemy = territoryOf(s, opp)
      const gap = gapToPolygon(s, p, enemy, (m) => Math.abs(m.pos.z) >= hh - 6)
      return clamp01(0.5 - gap / 15)
    }
    default: return 0.1
  }
}

// ============================================================================================================
// Twists (SPH-9): draw, picks, scoring, after-scoring effects
// ============================================================================================================
function rollOffWinner(ctx: EngineContext): PlayerId {
  for (let i = 0; i < 50; i++) {
    const a = ctx.roll({ purpose: 'rollOff', player: 'A', commandRerollable: false })
    const b = ctx.roll({ purpose: 'rollOff', player: 'B', commandRerollable: false })
    if (a.final[0] !== b.final[0]) return a.final[0] > b.final[0] ? 'A' : 'B'
  }
  return ctx.state.firstPlayer
}

// who makes a twist's choice (SPH-9.3); 'underdogElseEach' = every player in first-turn order when there is no underdog
function choosers(ctx: EngineContext, picker: TwistPicker): PlayerId[] {
  const u = ctx.state.underdog
  switch (picker) {
    case 'underdog': return u ? [u] : []
    case 'underdogElseRollOff': return [u ?? rollOffWinner(ctx)]
    case 'rollOffWinner': return [rollOffWinner(ctx)]
    case 'underdogElseEach': return u ? [u] : ctx.order.first()
    case 'none': return []
  }
}

function pick(cardId: Id, player: PlayerId, kind: TwistPick['kind'], flag: CardFlagKind | null, tag: string, extra: Partial<TwistPick> = {}): TwistPick {
  return { cardId, player, kind, flag, optional: false, tag, ...extra }
}

// SPH-9.1: the drawn twist takes effect: queue its picks (resolved by processPicks) and set flags that need no choice
function beginTwist(ctx: EngineContext, id: Id): void {
  const s = ctx.state
  const c = cardsOf(s)
  const who = choosers(ctx, TWIST_PICKERS[id] ?? 'none')
  const picks: TwistPick[] = []
  switch (id) {
    case 'card.twist.ring-of-fire': for (const p of who) picks.push(pick(id, p, 'objective', 'ringOfFire', 'rof')); break
    case 'card.twist.wreathed-in-smoke': for (const p of who) picks.push(pick(id, p, 'objective', 'wreathed', 'smoke')); break
    case 'card.twist.lifespring': for (const p of who) picks.push(pick(id, p, 'objective', 'lifespring', 'spring')); break
    case 'card.twist.let-the-blood-flow': for (const p of who) picks.push(pick(id, p, 'friendlyUnit', 'frenzy', 'frenzy')); break
    case 'card.twist.mount-the-attack': for (const p of who) picks.push(pick(id, p, 'friendlyUnit', 'spearhead', 'spearhead')); break
    case 'card.twist.grasping-vines': for (const p of who) picks.push(pick(id, p, 'enemyUnit', 'ensnared', 'vines')); break
    case 'card.twist.bloodmarked':
      if (s.underdog) picks.push(pick(id, s.underdog, 'friendlyUnit', 'bloodmarked', 'bm-own'), pick(id, s.underdog, 'enemyUnit', 'bloodmarked', 'bm-enemy'))
      else for (const p of who) picks.push(pick(id, p, 'enemyUnit', 'bloodmarked', `bm-${p}`))
      break
    case 'card.twist.reclaim-aqshy':
    case 'card.twist.reclaim-ghyran':
      if (s.underdog) picks.push(pick(id, s.underdog, 'objective', 'reclaim', 'reclaim'), pick(id, s.underdog, 'objective', 'reclaim', 'reclaim'))
      else for (const p of who) picks.push(pick(id, p, 'objective', 'reclaim', 'reclaim'))
      break
    case 'card.twist.alarielles-blessing':
      for (const p of who) picks.push(pick(id, p, 'mode', null, 'gift', { modes: [{ id: 'shield', label: 'Shield of Thorns: one unit gains Ward (6+), or +1 to its ward rolls' }, { id: 'rain', label: 'Rain of Jade: up to three units each heal D3' }] }))
      break
    case 'card.twist.the-grandfathers-blessing':
      for (const p of who) picks.push(pick(id, p, 'mode', null, 'curse', { modes: [{ id: 'rot', label: "Nurgle's Rot: an enemy unit gets -1 to its save rolls" }, { id: 'miasma', label: 'Eroding Miasma: an enemy unit cannot make ward rolls' }] }))
      break
    case 'card.twist.take-the-land':
      if (s.underdog) addFlag(s, { kind: 'takeTheLand', source: id, player: s.underdog, until: 'round' })
      break
    default: break
  }
  c.picks.push(...picks)
}

function pickCandidates(s: GameState, p: TwistPick): { id: string; label: string }[] {
  const taken = new Set(p.exclude ?? [])
  // picks sharing a tag must differ (Reclaim's objectives); other flags of the same twist this round count as taken too
  for (const f of flagsOf(s)) if (f.source === p.cardId && f.kind === p.flag) { if (f.objectiveId) taken.add(f.objectiveId); if (f.unitId) taken.add(f.unitId) }
  switch (p.kind) {
    case 'objective':
      return liveObjectives(s).filter((o) => !taken.has(o.id)).map((o) => ({ id: o.id, label: o.name ?? o.id }))
    case 'friendlyUnit':
      return boardUnits(s, p.player).filter((u) => !taken.has(u.id)).map((u) => ({ id: u.id, label: u.name }))
    case 'enemyUnit':
      return boardUnits(s, otherPlayer(p.player)).filter((u) => !taken.has(u.id)).map((u) => ({ id: u.id, label: u.name }))
    case 'mode':
      return p.modes ?? []
  }
}

// AI hint: how good this pick is for the picker
function pickValue(s: GameState, p: TwistPick, id: string): number {
  const me = p.player, opp = otherPlayer(me)
  const models = (player: PlayerId, oid: ObjectiveId) => unitsOnObjective(s, oid).filter((u) => s.units[u].player === player).reduce((a, u) => a + unitModels(s, u).length, 0)
  if (p.kind === 'objective') {
    const o = s.objectives[id]
    const mine = o.controller === me ? 2 : o.controller === opp ? -2 : 0
    switch (p.flag) {
      case 'ringOfFire': return -mine + (models(opp, id) - models(me, id)) * 0.5
      case 'wreathed': return models(me, id) - models(opp, id) * 0.5
      default: return mine + 1 - gapToObjective(s, me, id) / 6 // reclaim, lifespring: places we hold or can reach
    }
  }
  if (p.kind === 'mode') {
    if (id === 'rain') return boardUnits(s, me).filter((u) => unitModels(s, u.id).some((m) => m.woundsRemaining < modelStats(s, m).W)).length >= 1 ? 1 : 0.2
    if (id === 'shield') return 0.5
    if (id === 'miasma') return boardUnits(s, opp).some((u) => unitModels(s, u.id).some((m) => modelStats(s, m).ward !== null)) ? 1 : 0.1
    return 0.5
  }
  const worth = unitWorth(s, id)
  if (p.flag === 'bloodmarked') {
    // a marked unit of your own scores for the enemy if it dies: mark the safest; an enemy one: mark the easiest kill
    return s.units[id]?.player === me ? Math.min(nearestEnemyGap(s, id), 30) / 3 : 10 - unitModels(s, id).reduce((a, m) => a + m.woundsRemaining, 0) / 2
  }
  if (p.flag === null) { // Rain of Jade: heal where damage is
    return unitModels(s, id).reduce((a, m) => a + (modelStats(s, m).W - m.woundsRemaining), 0)
  }
  if (p.flag === 'ensnared') return worth / 4 + (nearestEnemyGap(s, id) < 12 ? 1 : 0)
  return worth / 4
}

function pickLabel(s: GameState, p: TwistPick): string {
  return TWIST_NAMES[p.cardId] ?? p.cardId
}

// raise the next twist pick; true while one is pending
function processPicks(ctx: EngineContext): boolean {
  const s = ctx.state
  const c = cardsOf(s)
  while (c.picks.length > 0) {
    const head = c.picks[0]
    const cands = pickCandidates(s, head)
    if (cands.length === 0) { c.picks.shift(); continue }
    ctx.decide({
      kind: 'chooseOption', player: head.player, window: 'round.start', canPass: head.optional,
      context: { topic: 'twistPick', unitId: null, abilityId: head.cardId, data: { cardId: head.cardId, kind: head.kind, flag: head.flag, label: pickLabel(s, head) } },
      options: cands.map((o) => ({ id: o.id, label: o.label, action: optionAction(head.player, o.id), hint: { value: pickValue(s, head, o.id) } })),
    })
    return true
  }
  return false
}

function applyPick(ctx: EngineContext, head: TwistPick, choice: string): void {
  const s = ctx.state
  const c = cardsOf(s)
  if (head.kind === 'mode') {
    const follow: TwistPick[] = []
    if (choice === 'shield') follow.push(pick(head.cardId, head.player, 'friendlyUnit', 'shieldOfThorns', 'shield'))
    if (choice === 'rain') for (let i = 0; i < 3; i++) follow.push(pick(head.cardId, head.player, 'friendlyUnit', null, 'rain', { optional: true }))
    if (choice === 'rot') follow.push(pick(head.cardId, head.player, 'enemyUnit', 'saveMinus', 'rot'))
    if (choice === 'miasma') follow.push(pick(head.cardId, head.player, 'enemyUnit', 'noWard', 'miasma'))
    c.picks.splice(0, 0, ...follow)
    ctx.emit({ type: 'TwistPicked', cardId: head.cardId, objectiveId: null, unitId: null, mode: choice, player: head.player })
    return
  }
  if (head.kind === 'objective') {
    if (head.flag) addFlag(s, { kind: head.flag, source: head.cardId, player: head.player, objectiveId: choice, until: 'round' })
    if (head.flag === 'ringOfFire') {
      const o = s.objectives[choice]
      if (o && o.controller !== null) {
        const from = o.controller
        o.controller = null
        ctx.emit({ type: 'ObjectiveControlChanged', objectiveId: o.id, from, to: null, levels: { A: 0, B: 0 }, player: head.player })
      }
    }
    for (const p of c.picks) if (p.tag === head.tag && p.cardId === head.cardId) p.exclude = [...(p.exclude ?? []), choice]
    ctx.emit({ type: 'TwistPicked', cardId: head.cardId, objectiveId: choice, unitId: null, mode: null, player: head.player })
    return
  }
  // a unit
  if (head.flag) addFlag(s, { kind: head.flag, source: head.cardId, player: head.player, unitId: choice, until: 'round' })
  else if (head.tag === 'rain') {
    const r = ctx.roll({ purpose: 'ability', player: head.player, sides: 3, count: 1, mode: 'sum', unitId: choice, commandRerollable: false })
    healUnit(ctx, choice, rollSum(r), head.cardId)
  }
  for (const p of c.picks) if (p.tag === head.tag && p.cardId === head.cardId) p.exclude = [...(p.exclude ?? []), choice]
  ctx.emit({ type: 'TwistPicked', cardId: head.cardId, objectiveId: null, unitId: choice, mode: null, player: head.player })
}

// twist VP at the end of the active player's turn (SPH-8.6 ③, 14-cards "turn-end VP bonus")
export function twistTurnScoring(ctx: EngineContext): void {
  const s = ctx.state
  const id = s.twist.current
  if (!id) return
  const p = s.activePlayer
  const opp = otherPlayer(p)
  const flags = flagsOf(s)
  let vp = 0
  switch (id) {
    case 'card.twist.let-the-blood-flow': vp = enemyDestroyedThisTurn(s, p); break
    case 'card.twist.reclaim-aqshy':
    case 'card.twist.reclaim-ghyran':
      vp = flags.filter((f) => f.kind === 'reclaim' && f.objectiveId && s.objectives[f.objectiveId]?.controller === p).length
      break
    case 'card.twist.mount-the-attack': vp = flipped(s, p).length; break
    case 'card.twist.take-the-land': {
      const piece = largeFeatureIn(s, opp)
      vp = piece && modelsOnFeature(s, p, piece) > modelsOnFeature(s, opp, piece) ? 1 : 0
      break
    }
    case 'card.twist.lifespring':
      vp = flags.some((f) => f.kind === 'lifespring' && f.objectiveId && s.objectives[f.objectiveId]?.controller === p) ? 1 : 0
      break
    default: break
  }
  if (vp > 0) awardVp(ctx, p, vp, id)
}

// after VP are scored at the end of every turn (SPH-8.6 ④): Ring of Fire burns, the Lifespring heals
export function twistAfterScoring(ctx: EngineContext): void {
  const s = ctx.state
  for (const f of [...flagsOf(s)]) {
    if (!f.objectiveId) continue
    if (f.kind === 'ringOfFire') {
      for (const uid of unitsOnObjective(s, f.objectiveId)) {
        const u = s.units[uid]
        if (!u || u.location !== 'board') continue
        const r = ctx.roll({ purpose: 'mortal', player: u.player, sides: 3, count: 1, mode: 'sum', unitId: uid, commandRerollable: false })
        ctx.emit({ type: 'AbilityTriggered', abilityId: f.source, sourceUnitId: null, targetUnitId: uid, summary: `Ring of Fire burns ${u.name} for ${rollSum(r)}`, player: f.player })
        attackService.queueMortalWounds(ctx, uid, rollSum(r), f.source, false)
      }
    } else if (f.kind === 'lifespring') {
      for (const uid of unitsOnObjective(s, f.objectiveId)) healUnit(ctx, uid, 1, f.source)
    }
  }
}

// end of the battle round: Bloodmarked pays out, round-long effects lapse, the twist ends (SPH-8.7, SPH-9.2)
export function cardsRoundEnd(ctx: EngineContext): void {
  const s = ctx.state
  const c = s.cards
  if (!c) return
  if (s.twist.current === 'card.twist.bloodmarked') {
    for (const p of ctx.order.first()) {
      const hit = c.flags.some((f) => f.kind === 'bloodmarked' && f.unitId && s.units[f.unitId]?.player !== p && c.roundDestroyed.includes(f.unitId))
      if (hit) awardVp(ctx, p, 1, 'card.twist.bloodmarked')
    }
  }
  expireCardFlags(s, 'round')
  c.roundDestroyed = []
  c.picks = []
  s.twist = { ...s.twist, current: null }
}

// ============================================================================================================
// Round start (SPH-8.2 ③ twist, ④ battle tactics)
// ============================================================================================================
function ensureShuffled(ctx: EngineContext): void {
  const s = ctx.state
  const c = cardsOf(s)
  if (c.shuffled) return
  c.shuffled = true
  const side = typeof s.mission.custom.side === 'string' ? s.mission.custom.side : (s.setup.side ?? 'aqshy')
  const twists = c.pool.twists[side] ?? []
  if (twists.length > 0) s.twist = { deck: shuffle(ctx, twists), current: null, drawn: [] }
  for (const p of ['A', 'B'] as PlayerId[]) c.tactics[p] = { deck: shuffle(ctx, c.pool.tactics), hand: [], discard: [], scored: [] }
}

// SPH-10.4: a player who seized the initiative draws nothing, unless they are the underdog trailing by 5 or more
export function maySeizerDraw(s: GameState, p: PlayerId): boolean {
  if (s.priority.seized !== p) return true
  return s.underdog === p && s.players[otherPlayer(p)].vp - s.players[p].vp >= 5
}

function tacticsStep(ctx: EngineContext, p: PlayerId): boolean {
  const s = ctx.state
  const c = cardsOf(s)
  if (c.drawRound[p] >= s.round) return false
  const piles = c.tactics[p]
  // SPH-10.2: rounds 2-4, discard any number first (one card per answer, pass = keep the rest)
  if (s.round > 1 && c.discardDone[p] < s.round && piles.hand.length > 0) {
    ctx.decide({
      kind: 'chooseOption', player: p, window: 'round.start', canPass: true,
      context: { topic: 'discardTactics', unitId: null, abilityId: null, data: { hand: [...piles.hand], seized: s.priority.seized === p, mayDraw: maySeizerDraw(s, p) } },
      options: piles.hand.map((id) => ({ id: `discard:${id}`, label: `Discard ${cardName(id)}`, action: optionAction(p, `discard:${id}`), hint: { value: 0.3 - tacticOdds(s, p, id) } })),
    })
    return true
  }
  c.discardDone[p] = s.round
  if (maySeizerDraw(s, p) && cardMark(s, drawKey(s, p)) === undefined) {
    const n = Math.max(0, Math.min(HAND_SIZE - piles.hand.length, piles.deck.length))
    if (n > 0) {
      piles.hand = [...piles.hand, ...piles.deck.slice(0, n)]
      piles.deck = piles.deck.slice(n)
      ctx.emit({ type: 'TacticsDrawn', count: n, player: p })
    }
    setCardMark(s, drawKey(s, p), n)
  }
  // STD-ENH-4 Fell Ritualist: after drawing, optionally draw 1 more, then put 1 hand card on the bottom of the deck
  if (extraDrawStep(ctx, p)) return true
  c.drawRound[p] = s.round
  return false
}

// the largest extra draw any of the player's sources on the board grants (EngineCodeHook.extraTacticDraw)
export function extraTacticDraws(s: GameState, p: PlayerId): number {
  let best = 0
  for (const entry of sourcesFor(s)) {
    const spec = codeHookFor(entry.code)
    if (!spec?.extraTacticDraw) continue
    const holder = s.units[entry.holderUnitId]
    if (!holder || holder.player !== p || holder.location !== 'board') continue
    best = Math.max(best, spec.extraTacticDraw(s, entry, p))
  }
  return best
}

// round-scoped progress of the draw step; kept in mission.custom because the draw happens before any phase starts
const drawKey = (s: GameState, p: PlayerId): string => `drawn:${s.round}:${p}`
const extraKey = (s: GameState, p: PlayerId): string => `extra:${s.round}:${p}`
const bottomKey = (s: GameState, p: PlayerId): string => `bottom:${s.round}:${p}`
function cardMark(s: GameState, key: string): unknown { return (s.mission.custom.cardMarks as Record<string, unknown> | undefined)?.[key] }
function setCardMark(s: GameState, key: string, v: unknown): void {
  s.mission.custom = { ...s.mission.custom, cardMarks: { ...((s.mission.custom.cardMarks as Record<string, unknown> | undefined) ?? {}), [key]: v } }
}

function extraDrawStep(ctx: EngineContext, p: PlayerId): boolean {
  const s = ctx.state
  const piles = cardsOf(s).tactics[p]
  // only after an actual draw (a seizing player who draws nothing gets no extra draw)
  const drawn = cardMark(s, drawKey(s, p))
  if (typeof drawn !== 'number' || drawn <= 0) return false
  const owed = cardMark(s, bottomKey(s, p))
  if (typeof owed === 'number' && owed > 0) {
    if (piles.hand.length === 0) { setCardMark(s, bottomKey(s, p), 0); return false }
    ctx.decide({
      kind: 'chooseOption', player: p, window: 'round.start', canPass: false,
      context: { topic: 'bottomTactic', unitId: null, abilityId: null, data: { hand: [...piles.hand] } },
      options: piles.hand.map((id) => ({ id: `bottom:${id}`, label: `Put ${cardName(id)} on the bottom of the deck`, action: optionAction(p, `bottom:${id}`), hint: { value: 1 - tacticOdds(s, p, id) } })),
    })
    return true
  }
  if (cardMark(s, extraKey(s, p)) !== undefined) return false
  const extra = Math.min(extraTacticDraws(s, p), piles.deck.length)
  if (extra <= 0) { setCardMark(s, extraKey(s, p), 0); return false }
  const plural = extra === 1 ? 'card' : 'cards'
  ctx.decide({
    kind: 'chooseOption', player: p, window: 'round.start', canPass: true,
    context: { topic: 'extraTactic', unitId: null, abilityId: null, data: { count: extra } },
    options: [{ id: 'draw', label: `Draw ${extra} more battle tactic ${plural}, then put ${extra} back on the bottom`, action: optionAction(p, 'draw'), hint: { value: 0.5 } }],
  })
  return true
}

// SPH-8.2 ③ and ④; true while a decision is pending
export function cardsRoundStart(ctx: EngineContext): boolean {
  const s = ctx.state
  const c = cardsOf(s)
  ensureShuffled(ctx)
  if (ctx.once(`twist:${s.round}`)) {
    const next = s.twist.deck.length > 0 ? s.twist.deck[0] : null
    if (next !== null) {
      s.twist = { deck: s.twist.deck.slice(1), current: next, drawn: [...s.twist.drawn, next] }
      ctx.emit({ type: 'TwistDrawn', cardId: next, drawRound: s.round, player: s.firstPlayer })
      beginTwist(ctx, next)
    } else {
      s.twist = { ...s.twist, current: null }
    }
  }
  if (processPicks(ctx)) return true
  if (c.pool.tactics.length === 0) return false
  for (const p of ctx.order.first()) if (tacticsStep(ctx, p)) return true
  return false
}

// ============================================================================================================
// Scoring tactics at the end of the owner's turn (SPH-10.3)
// ============================================================================================================
export function scoreTacticsStep(ctx: EngineContext): boolean {
  const s = ctx.state
  const c = s.cards
  if (!c) return false
  const p = s.activePlayer
  const key = `${s.round}:${p}`
  if (c.scoreDone === key) return false
  const met = c.tactics[p].hand.filter((id) => tacticMet(s, p, id))
  if (met.length === 0) { c.scoreDone = key; return false }
  ctx.decide({
    kind: 'chooseOption', player: p, window: 'turn.end.scoring', canPass: true,
    context: { topic: 'scoreTactics', unitId: null, abilityId: null, data: { met } },
    options: met.map((id) => ({ id: `score:${id}`, label: `Score ${cardName(id)} (+1 VP)`, action: optionAction(p, `score:${id}`), hint: { value: 5 } })),
  })
  return true
}

// ============================================================================================================
// Card commands (SPH-3.4, SPH-10.5)
// ============================================================================================================
export type CommandSlot = 'hero' | 'movement' | 'charge' | 'fight' | 'reactAttacked' | 'reactShot' | 'reactCharge' | 'reactRetreat'

interface CommandCtx { trigger: WindowTrigger | undefined; window: string }
interface CommandDef {
  slot: CommandSlot
  whose: 'your' | 'enemy' | 'any'
  targets(s: GameState, p: PlayerId, cc: CommandCtx): string[]
  label?(s: GameState, target: string): string
  // AI estimate of what using it now is worth, in VP-ish units (keeping the card is worth its tactic odds)
  value(s: GameState, p: PlayerId, target: string, cc: CommandCtx): number
  // 'yield': the caller must look at the state again before offering more (Counter-Charge starts a charge)
  resolve(ctx: EngineContext, p: PlayerId, target: string, cc: CommandCtx, cardId: Id): 'yield' | void
}

const attackTargets = (s: GameState, p: PlayerId): UnitId[] => (s.phaseState.attack?.targetUnitIds ?? []).filter((id) => s.units[id]?.player === p && s.units[id]?.location === 'board')
const isHero = (s: GameState, id: UnitId): boolean => keywordsOf(s, id).includes('HERO')
const missingWounds = (s: GameState, id: UnitId): number => unitModels(s, id).reduce((a, m) => a + (modelStats(s, m).W - m.woundsRemaining), 0)
const rollOf = (s: GameState, cc: CommandCtx) => (cc.trigger?.rollId && s.phaseState.lastRoll?.id === cc.trigger.rollId ? s.phaseState.lastRoll : null)

function maxRendAgainst(s: GameState): number {
  let r = 0
  for (const t of s.phaseState.attack?.targets ?? []) r = Math.max(r, s.weapons[t.weaponId]?.rend ?? 0)
  return r
}

function reinforceCandidates(s: GameState, p: PlayerId): UnitId[] {
  return Object.values(s.units)
    .filter((u) => u.player === p && u.location === 'destroyed' && !u.replaced && u.replacementOf === null && u.startingStrength >= 5)
    .filter((u) => { const kw = keywordsOf(s, u.id); return kw.includes('INFANTRY') || kw.includes('CAVALRY') })
    .map((u) => u.id)
}

const COMMANDS: Record<string, CommandDef> = {
  'card.tactic.war-of-attrition': {
    slot: 'hero', whose: 'enemy',
    targets: (s, p) => boardUnits(s, p).filter((u) => !u.turn.fightsFirst).map((u) => u.id),
    value: (s, _p, t) => (nearestEnemyGap(s, t) <= ENGAGEMENT_H + 0.5 ? 0.55 : nearestEnemyGap(s, t) <= 10 ? 0.15 : -0.5),
    resolve(ctx, _p, t) { const u = ctx.state.units[t]; if (u) u.turn.fightsFirst = true },
  },
  'card.tactic.raid': {
    slot: 'reactAttacked', whose: 'any',
    targets: (s, p) => attackTargets(s, p),
    value: (s) => maxRendAgainst(s) * 0.3 - 0.05,
    resolve(ctx, p, t, _cc, cardId) { addFlag(ctx.state, { kind: 'steelDefence', source: cardId, player: p, unitId: t, until: 'phase' }) },
  },
  'card.tactic.take-the-flanks': {
    slot: 'movement', whose: 'enemy',
    targets: (s, p) => boardUnits(s, p).filter((u) => !inCombat(s, u.id)).map((u) => u.id),
    value: () => 0.05,
    resolve(ctx, p, t, _cc, cardId) {
      const r = ctx.roll({ purpose: 'ability', player: p, sides: 6, count: 1, mode: 'sum', unitId: t, commandRerollable: false })
      cardsOf(ctx.state).followUp = { kind: 'slide', cardId, player: p, unitId: t, max: rollSum(r) }
    },
  },
  'card.tactic.take-without-warning': {
    slot: 'reactAttacked', whose: 'any',
    targets: (s, p) => attackTargets(s, p),
    value: (s, _p, t) => 0.3 + (unitModels(s, t).some((m) => modelStats(s, m).ward === null) ? 0.15 : 0),
    resolve(ctx, p, t, _cc, cardId) { addFlag(ctx.state, { kind: 'fightToTheLast', source: cardId, player: p, unitId: t, until: 'phase' }) },
  },
  'card.tactic.hold-ground': {
    slot: 'fight', whose: 'any',
    targets: (s, p) => boardUnits(s, p).filter((u) => isHero(s, u.id) && missingWounds(s, u.id) > 0).map((u) => u.id),
    value: (s, _p, t) => Math.min(1, missingWounds(s, t) * 0.18),
    resolve(ctx, p, t, _cc, cardId) {
      const r = ctx.roll({ purpose: 'ability', player: p, sides: 6, count: 1, mode: 'sum', unitId: t, commandRerollable: false })
      healUnit(ctx, t, rollSum(r), cardId)
    },
  },
  'card.tactic.cut-off-the-head': {
    slot: 'charge', whose: 'enemy',
    targets: (s, p) => boardUnits(s, p).filter((u) => !s.phaseState.activated.includes(u.id) && canDeclareCharge(s, u.id)).map((u) => u.id),
    value: (s, _p, t) => { const d = neededChargeDistance(s, t); return d === null ? -1 : d <= 6 ? 0.6 : d <= 8 ? 0.3 : 0.05 },
    resolve(ctx, _p, t) {
      const s = ctx.state
      s.phaseState.charge = { unitId: t, targetUnitIds: [], roll: null, rerolled: false, distance: null, heroic: true }
      if (!s.phaseState.activated.includes(t)) s.phaseState.activated.push(t)
      ctx.emit({ type: 'ChargeDeclared', unitId: t, targetUnitIds: [], heroic: true, player: s.units[t].player })
      return 'yield'
    },
  },
  'card.tactic.the-ignax-dais': {
    slot: 'reactCharge', whose: 'any',
    targets: (s, p, cc) => { const r = rollOf(s, cc); return r && r.purpose === 'charge' && r.player === p && r.unitId && s.units[r.unitId] ? [r.unitId] : [] },
    value: (s, _p, t, cc) => {
      const r = rollOf(s, cc)
      const need = neededChargeDistance(s, t)
      if (!r || need === null) return -1
      return rollSum(r) + EPS < need && need <= 12 ? 0.9 : -1
    },
    resolve(ctx, _p, _t, cc, cardId) {
      const r = rollOf(ctx.state, cc)
      if (r) ctx.reroll(r, r.dice.map((_d, i) => i), cardId)
    },
  },
  'card.tactic.the-behemat-dais': {
    slot: 'hero', whose: 'any',
    targets: (s, p) => {
      const out: string[] = []
      for (const h of boardUnits(s, p).filter((u) => isHero(s, u.id))) {
        const hm = unitModels(s, h.id)[0]
        if (!hm) continue
        for (const e of boardUnits(s, otherPlayer(p))) {
          const near = unitModels(s, e.id).some((m) => distance(hm, m) <= 12 + EPS)
          if (near && losService.unitVisible(s, hm.id, e.id)) out.push(`${h.id}>${e.id}`)
        }
      }
      return out
    },
    label: (s, t) => { const [h, e] = t.split('>'); return `${unitName(s, h)} at ${unitName(s, e)}` },
    value: (s, _p, t) => { const e = t.split('>')[1]; const left = unitModels(s, e).reduce((a, m) => a + m.woundsRemaining, 0); return 0.45 + (left <= 3 ? 0.3 : 0) },
    resolve(ctx, p, t, _cc, cardId) {
      const s = ctx.state
      const [h, e] = t.split('>')
      const r = ctx.roll({ purpose: 'ability', player: p, unitId: h, commandRerollable: false })
      if (r.final[0] < 2) { ctx.emit({ type: 'AbilityTriggered', abilityId: cardId, sourceUnitId: h, targetUnitId: e, summary: `Scroll of Arcane Bolt: rolled ${r.final[0]}, it fizzles`, player: p }); return }
      const d = ctx.roll({ purpose: 'mortal', player: p, sides: 3, count: 1, mode: 'sum', unitId: h, targetUnitId: e, commandRerollable: false })
      const hm = unitModels(s, h)[0]
      ctx.emit({ type: 'AbilityTriggered', abilityId: cardId, sourceUnitId: h, targetUnitId: e, summary: `Scroll of Arcane Bolt hits ${unitName(s, e)} for ${rollSum(d)}`, player: p })
      attackService.queueMortalWounds(ctx, e, rollSum(d), cardId, false, hm ? { player: p, unitId: h, modelId: hm.id } : undefined)
    },
  },
  'card.tactic.the-dracothion-dais': {
    slot: 'reactShot', whose: 'any',
    targets: (s, p) => attackTargets(s, p),
    value: (s, _p, t) => 0.25 + Math.min(0.4, unitWorth(s, t) / 40),
    resolve(ctx, p, t, _cc, cardId) {
      addFlag(ctx.state, { kind: 'goToGround', source: cardId, player: p, unitId: t, until: 'phase' })
      const u = ctx.state.units[t]
      if (u) u.turn.fightsLast = true
    },
  },
  'card.tactic.raze': {
    slot: 'hero', whose: 'any',
    targets: (s, p) => boardUnits(s, p).filter((u) => isHero(s, u.id)).map((u) => u.id),
    value: (s, p, t) => {
      const on = liveObjectives(s).find((o) => unitOnObjective(s, t, o.id) && !objectiveDisabled(s, o.id))
      if (!on) return -0.5
      const enemyOn = unitsOnObjective(s, on.id).some((u) => s.units[u].player !== p)
      return enemyOn ? 0.6 : 0.1
    },
    resolve(ctx, p, t, _cc, cardId) {
      const r = ctx.roll({ purpose: 'ability', player: p, unitId: t, commandRerollable: false })
      addFlag(ctx.state, { kind: 'inspiring', source: cardId, player: p, unitId: t, value: r.final[0], until: 'turn' })
      ctx.emit({ type: 'AbilityTriggered', abilityId: cardId, sourceUnitId: t, targetUnitId: t, summary: `Inspiring Presence: +${r.final[0]} Control this turn`, player: p })
    },
  },
  'card.tactic.attack-on-two-fronts': {
    slot: 'movement', whose: 'any',
    targets: (s, p) => reinforceCandidates(s, p).filter((id) => anywherePlacements(s, p, id, 1).length > 0),
    value: () => 0.85,
    resolve(ctx, p, t, _cc, cardId) {
      const s = ctx.state
      const r = ctx.roll({ purpose: 'ability', player: p, sides: 3, count: 1, mode: 'sum', unitId: t, commandRerollable: false })
      const copy = spawnUnitCopy(s, t, Math.max(1, rollSum(r)))
      copy.replacementOf = t
      s.units[t].replaced = true
      cardsOf(s).followUp = { kind: 'place', cardId, player: p, unitId: copy.id }
    },
  },
  'card.tactic.do-not-waver': {
    slot: 'reactRetreat', whose: 'any',
    targets: (s, p, cc) => { const r = rollOf(s, cc); return r && r.purpose === 'retreat' && r.player === p && r.unitId && s.units[r.unitId] ? [r.unitId] : [] },
    value: (s, _p, t) => 0.35 + Math.min(0.5, returnableModels(s, t) * 0.12),
    resolve(ctx, p, t, _cc, cardId) { addFlag(ctx.state, { kind: 'rally', source: cardId, player: p, unitId: t, until: 'phase' }) },
  },
}

export const commandSlotOf = (cardId: Id): CommandSlot | null => COMMANDS[cardId]?.slot ?? null

function whoseOk(s: GameState, p: PlayerId, whose: CommandDef['whose']): boolean {
  if (whose === 'any') return true
  return whose === 'your' ? p === s.activePlayer : p !== s.activePlayer
}

interface Offer { id: string; cardId: Id; target: string; label: string; value: number }

function offersFor(s: GameState, p: PlayerId, slots: CommandSlot[], cc: CommandCtx): Offer[] {
  const c = s.cards
  if (!c) return []
  const out: Offer[] = []
  const setAside = officersOrderCard(s, p)
  const fulfilled = fulfilledOf(s, p)
  for (const cardId of commandCards(s, p)) {
    const def = COMMANDS[cardId]
    if (!def || !slots.includes(def.slot) || !whoseOk(s, p, def.whose)) continue
    if (officersLocked(s, p, cardId)) continue
    for (const t of def.targets(s, p, cc)) {
      // F18 (HOH C4, Effect.noAbilities): a friendly unit under it cannot be picked by a command
      if (s.units[t]?.player === p && hookService.unitHasEffectFlag(s, t, 'noAbilities')) continue
      // a set-aside card (CITIES-BT-1) comes back after its command, so using it costs nothing
      // a fulfilled oath (STD-BT-1) can no longer be scored, so keeping it is worth little
      const keep = cardId === setAside ? -0.2 : fulfilled.includes(cardId) ? 0.05 : tacticOdds(s, p, cardId)
      out.push({
        id: `${cardId}|${t}`, cardId, target: t,
        label: `${TACTIC_NAMES[cardId].command} (${TACTIC_NAMES[cardId].name}): ${def.label ? def.label(s, t) : unitName(s, t)}`,
        value: def.value(s, p, t, cc) - keep,
      })
    }
  }
  return out
}

function raiseOffer(ctx: EngineContext, p: PlayerId, offers: Offer[], data: Record<string, unknown>): void {
  ctx.decide({
    kind: 'chooseOption', player: p, window: 'phase.end', canPass: true,
    context: { topic: 'tacticCommand', unitId: null, abilityId: null, data: { ...data, cards: [...new Set(offers.map((o) => o.cardId))] } },
    options: offers.map((o): DecisionOption => ({ id: o.id, label: o.label, action: optionAction(p, o.id), hint: { value: o.value, card: o.cardId } })),
  })
}

function useCommand(ctx: EngineContext, p: PlayerId, cardId: Id, target: string, cc: CommandCtx): 'yield' | void {
  const s = ctx.state
  const c = cardsOf(s)
  const piles = c.tactics[p]
  // CITIES-BT-1: the set-aside card is shown to the opponent and goes back into the hand instead of the discard pile
  const officers = officersOrderCard(s, p) === cardId
  if (officers) {
    clearOfficersOrder(s, p)
    s.mission.custom = {
      ...s.mission.custom,
      officersLock: { ...((s.mission.custom.officersLock as Record<string, OfficersLock> | undefined) ?? {}), [p]: { cardId, round: s.round, turn: s.activePlayer, phase: s.phase } },
    }
  } else if (!piles.hand.includes(cardId) && (piles.fulfilled ?? []).includes(cardId)) {
    // STD-BT-1: a fulfilled oath's command is used, the card is discarded
    piles.fulfilled = (piles.fulfilled ?? []).filter((id) => id !== cardId)
    piles.discard = [...piles.discard, cardId]
  } else {
    piles.hand = piles.hand.filter((id) => id !== cardId)
    piles.discard = [...piles.discard, cardId]
    // STD-BT-1: the oath's command used before it was scored: the card is discarded and the oath ends
    if (piles.oath === cardId) piles.oath = null
  }
  // F16 (TZE C4): the player's onTacticCommandUsed sources hear about the card once its command has fully resolved
  if (!officers) queueTacticUsed(s, p, cardId)
  const def = COMMANDS[cardId]
  const unitId = target.includes('>') ? target.split('>')[0] : s.units[target] ? target : null
  const tail = officers ? ` (The Officer's Order: ${cardName(cardId)} returns to hand)` : ''
  ctx.emit({ type: 'TacticCommandUsed', cardId, unitId, summary: `${TACTIC_NAMES[cardId]?.command ?? cardId}: ${def.label ? def.label(s, target) : unitName(s, target)}${tail}`, player: p })
  return def.resolve(ctx, p, target, cc, cardId)
}

// ---------- F16 (TZE C4, DOT-BT-4 Cheat Destiny): reactions to a used battle tactic command ----------
// useCommand queues one phase mark per (card, battle trait / regiment ability whose code has onTacticCommandUsed); the queue is
// drained once the command has fully resolved (follow-up included): by the handler right after the command, else by the next
// commandWindow / reactionWindow call. A hook may raise a decision; the rest of the queue waits until it is answered.
const TACTIC_USED = 'cards:tacticUsed:'
function queueTacticUsed(s: GameState, p: PlayerId, cardId: Id): void {
  const owner = s.players[p]
  const ids = [...(owner?.battleTraitIds ?? []), ...(owner?.regimentAbilityId ? [owner.regimentAbilityId] : [])]
  for (const id of [...new Set(ids)]) {
    if (!codeHookFor(s.abilities[id]?.code)?.onTacticCommandUsed) continue
    s.phaseState.marks.push(`${TACTIC_USED}${p}|${cardId}|${id}`)
  }
}
// true when a hook raised a decision (the caller yields)
function tacticUsedStep(ctx: EngineContext): boolean {
  const s = ctx.state
  if (s.pending || s.cards?.followUp) return false
  for (;;) {
    const i = s.phaseState.marks.findIndex((m) => m.startsWith(TACTIC_USED))
    if (i < 0) return false
    const [p, cardId, abilityId] = s.phaseState.marks[i].slice(TACTIC_USED.length).split('|') as [PlayerId, Id, Id]
    s.phaseState.marks.splice(i, 1)
    const spec = codeHookFor(s.abilities[abilityId]?.code)
    const entry = sourcesFor(s).find((e) => e.ability?.id === abilityId && e.active === null && s.units[e.holderUnitId]?.player === p && s.units[e.holderUnitId]?.location === 'board' && sourceGateOpen(s, e))
    if (!spec?.onTacticCommandUsed || !entry) continue
    spec.onTacticCommandUsed(ctx, entry, { player: p, cardId })
    if (s.pending) return true
  }
}
// F16 (TZE C4): puts a used battle tactic card (discard pile or fulfilled oaths) at the bottom of its owner's deck. The deck
// order is hidden, so no event; false when the card is in neither pile
export function returnTacticToDeckBottom(s: GameState, p: PlayerId, cardId: Id): boolean {
  const piles = s.cards?.tactics[p]
  if (!piles) return false
  if (piles.discard.includes(cardId)) piles.discard = piles.discard.filter((id) => id !== cardId)
  else if ((piles.fulfilled ?? []).includes(cardId)) piles.fulfilled = (piles.fulfilled ?? []).filter((id) => id !== cardId)
  else return false
  piles.deck = [...piles.deck, cardId]
  return true
}

// ---------- follow-ups (one extra answer after Redeploy / Call Reinforcements) ----------
function followUpOptions(s: GameState): { id: string; label: string }[] {
  const f = s.cards?.followUp
  if (!f) return []
  if (f.kind === 'slide') {
    // Redeploy may not end in combat
    return slideOptions(s, f.unitId, f.max).filter((o) => {
      const sl = parseSlide(o.id)
      if (!sl) return false
      if (sl.dx === 0 && sl.dz === 0) return true
      const chk = checkSlide(s, f.unitId, sl.dx, sl.dz, f.max, false)
      return chk.ok && !chk.endsInCombat
    })
  }
  return anywherePlacements(s, f.player, f.unitId, 5).map((c) => ({ id: `at:${c.x}:${c.z}`, label: `Set up at (${c.x.toFixed(0)}, ${c.z.toFixed(0)})` }))
}

function followUpStep(ctx: EngineContext, data: Record<string, unknown>): boolean {
  const s = ctx.state
  const c = s.cards
  const f = c?.followUp
  if (!c || !f) return false
  const opts = followUpOptions(s)
  if (opts.length === 0) {
    if (f.kind === 'place') dropReplacement(s, f.unitId)
    c.followUp = null
    return false
  }
  ctx.decide({
    kind: 'chooseOption', player: f.player, window: 'phase.end', canPass: f.kind === 'slide',
    context: { topic: 'tacticCommand', unitId: f.unitId, abilityId: f.cardId, data: { ...data, followUp: f.kind } },
    options: opts.map((o) => ({ id: o.id, label: o.label, action: optionAction(f.player, o.id), hint: { value: followUpValue(s, f.player, o.id) } })),
  })
  return true
}

function followUpValue(s: GameState, p: PlayerId, optionId: string): number {
  const at = parseAt(optionId)
  if (at) return -Math.min(...liveObjectives(s).map((o) => dist2D(at, o.pos))) / 10
  return optionId === 'mv:0:0' ? 0 : 0.1
}

function dropReplacement(s: GameState, unitId: UnitId): void {
  const u = s.units[unitId]
  if (!u) return
  const orig = u.replacementOf
  for (const mid of u.models) delete s.models[mid]
  delete s.units[unitId]
  if (orig && s.units[orig]) s.units[orig].replaced = false
}

// Call Reinforcements: a compact formation anywhere wholly on the board, more than 6" from every enemy model
function anywhereFormation(s: GameState, player: PlayerId, models: Model[], coherencyRange: number | undefined, centre: Vec2): { modelId: string; pos: { x: number; y: number; z: number }; facing: number }[] | null {
  if (models.length === 0) return null
  const mine = new Set(models.map((m) => m.id))
  const others = boardModelsOf(s, player).filter((m) => !mine.has(m.id))
  const enemies = enemyModelsOnBoard(s, player)
  const rmax = Math.max(...models.map(reach))
  const step = 2 * rmax + 0.12
  const pts: Vec2[] = []
  const span = Math.ceil(Math.sqrt(models.length) + 2)
  for (let j = -span; j <= span; j++) for (let i = -span; i <= span; i++) pts.push({ x: centre.x + (i + (Math.abs(j) % 2) * 0.5) * step, z: centre.z + j * step * 0.88 })
  pts.sort((a, b) => dist2D(a, centre) - dist2D(b, centre))
  const placed: Footprint[] = []
  const out: { modelId: string; pos: { x: number; y: number; z: number }; facing: number }[] = []
  const facing = pointInPolygon(centre, territoryOf(s, player)) ? (territoryOf(s, player).reduce((a, v) => a + v.z, 0) > 0 ? -Math.PI / 2 : Math.PI / 2) : 0
  for (const m of models) {
    let chosen: Footprint | null = null
    for (const p of pts) {
      const cand: Footprint = { pos: { x: Math.round(p.x * 1000) / 1000, y: 0, z: Math.round(p.z * 1000) / 1000 }, facing, base: m.base }
      if (!whollyOnBoard(cand, s.board)) continue
      if (placed.some((o) => basesOverlap(cand, o)) || others.some((o) => basesOverlap(cand, o))) continue
      if (enemies.some((e) => distance(cand, e) <= 6 + EPS)) continue
      if (!terrainService.canEndAt(s, m, cand.pos).ok) continue
      chosen = cand
      break
    }
    if (!chosen) return null
    placed.push(chosen)
    out.push({ modelId: m.id, pos: chosen.pos, facing })
  }
  const check = checkPlacements({
    unitModels: models, placements: out, constraints: emptyMoveConstraints(1e9, { mustEndOutsideEngagement: true, coherency: true }),
    otherFriendly: others, enemies, board: s.board, coherencyRange,
  })
  if (check.rejection) return null
  if (out.some((o) => anyWithinEngagementRange({ pos: o.pos, facing, base: models[0].base }, enemies))) return null
  return out
}

// models of a unit to set up: the live models of a spawned copy, or (for the targets check) the destroyed unit's snapshot
function placementModels(s: GameState, unitId: UnitId): Model[] {
  const u = s.units[unitId]
  if (!u) return []
  if (u.models.length > 0 && u.location !== 'destroyed') return unitModels(s, unitId)
  return (u.destroyedModels ?? []).slice(0, 1)
}

function anywherePlacements(s: GameState, player: PlayerId, unitId: UnitId, max: number): Vec2[] {
  const models = placementModels(s, unitId)
  if (models.length === 0) return []
  const range = datasheetOf(s, unitId).coherencyRange
  const found: Vec2[] = []
  const hw = s.board.w / 2, hh = s.board.h / 2
  for (let z = -hh + 1.5; z <= hh - 1.5 + EPS; z += 2) {
    for (let x = -hw + 1.5; x <= hw - 1.5 + EPS; x += 2) {
      const centre = { x, z }
      if (anywhereFormation(s, player, models, range, centre)) { found.push(centre); if (max <= 1) return found }
    }
  }
  if (found.length <= max) return found
  // spread: closest to objectives first, then keep picks at least 4" apart
  found.sort((a, b) => Math.min(...liveObjectives(s).map((o) => dist2D(a, o.pos))) - Math.min(...liveObjectives(s).map((o) => dist2D(b, o.pos))))
  const picks: Vec2[] = []
  for (const f of found) { if (picks.length >= max) break; if (!picks.some((p) => dist2D(p, f) < 4)) picks.push(f) }
  return picks
}

function placeReinforcement(ctx: EngineContext, unitId: UnitId, centre: Vec2): boolean {
  const s = ctx.state
  const u = s.units[unitId]
  if (!u) return false
  const placements = anywhereFormation(s, u.player, unitModels(s, unitId), datasheetOf(s, unitId).coherencyRange, centre)
  if (!placements) return false
  for (const p of placements) { const m = s.models[p.modelId]; if (m) setModelPos(m, p.pos, p.facing) }
  u.location = 'board'
  u.setUpTurn = { round: s.round, player: u.player }
  u.turn.arrivedThisTurn = true
  ctx.emit({ type: 'UnitDeployed', unitId, toReserves: false, player: u.player })
  ctx.emit({ type: 'UnitReplaced', unitId, replacementOf: u.replacementOf as UnitId, player: u.player })
  return true
}

// ---------- the windows ----------
const passMark = (key: string, p: PlayerId): string => `cards:pass:${key}:${p}`

// phase-timed commands (Hero / Movement / Charge / Combat phase). Re-entrant: call again with the same arguments after
// every answered decision; false once the player passed or has nothing to use. `key` separates occurrences in one phase.
export function commandWindow(ctx: EngineContext, slot: 'hero' | 'movement' | 'charge' | 'fight', p: PlayerId, key: string = slot): boolean {
  const s = ctx.state
  if (s.pending) return true
  const c = s.cards
  if (!c) return false
  const data = { mode: 'command', slot, key, player: p }
  if (followUpStep(ctx, data)) return true
  if (tacticUsedStep(ctx)) return true
  if (s.phaseState.marks.includes(passMark(key, p))) return false
  if (commandCards(s, p).length === 0) return false
  const offers = offersFor(s, p, [slot], { trigger: undefined, window: slot })
  if (offers.length === 0) return false
  raiseOffer(ctx, p, offers, data)
  return true
}

const REACTION_SLOTS: Partial<Record<string, CommandSlot[]>> = {
  'shooting.targetsDeclared': ['reactAttacked', 'reactShot'],
  'fight.targetsDeclared': ['reactAttacked'],
  'any.rollMade': ['reactCharge', 'reactRetreat'],
}

// Reaction commands (SPH-10.5), offered from ctx.window before stratagem windows. Same re-entrancy as commandWindow.
export function reactionWindow(ctx: EngineContext, window: string, p: PlayerId, key: string, trigger?: WindowTrigger): boolean {
  const s = ctx.state
  const c = s.cards
  if (!c) return false
  if (s.pending || tacticUsedStep(ctx)) return true
  if (commandCards(s, p).length === 0) return false
  const slots = REACTION_SLOTS[window]
  if (!slots) return false
  const k = `${window}|${key}`
  if (s.phaseState.marks.includes(passMark(k, p))) return false
  const offers = offersFor(s, p, slots, { trigger, window })
  if (offers.length === 0) return false
  raiseOffer(ctx, p, offers, { mode: 'reaction', window, key: k, player: p, trigger: trigger ?? null })
  return true
}

// ---------- after a retreat (Fall Back and Rally) ----------
export const retreatDamageWaived = cardNoRetreatDamage

export function rallyAfterRetreat(ctx: EngineContext, unitId: UnitId): void {
  const s = ctx.state
  const f = flagsOf(s).find((x) => x.kind === 'rally' && x.unitId === unitId)
  if (!f) return
  cardsOf(s).flags = flagsOf(s).filter((x) => x !== f)
  const n = returnableModels(s, unitId)
  if (n <= 0) return
  const r = ctx.roll({ purpose: 'ability', player: f.player, sides: 6, count: n, mode: 'perDie', unitId, commandRerollable: false })
  const back = r.final.filter((v) => v >= 5).length
  const got = back > 0 ? returnSlainModels(ctx, unitId, back, f.source) : 0
  ctx.emit({ type: 'AbilityTriggered', abilityId: f.source, sourceUnitId: unitId, targetUnitId: unitId, summary: `Fall Back and Rally: ${got} model${got === 1 ? '' : 's'} return`, player: f.player })
}

// ============================================================================================================
// Decision handler: twistPick, discardTactics, scoreTactics, tacticCommand
// ============================================================================================================
export const CARD_TOPICS = new Set(['twistPick', 'discardTactics', 'scoreTactics', 'tacticCommand', 'extraTactic', 'bottomTactic'])

function handle(ctx: EngineContext, action: Action, pending: PendingDecision): Rejection | void {
  if (pending.kind !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'cards: expected a chooseOption decision' }
  const s = ctx.state
  const c = cardsOf(s)
  const p = pending.player
  const topic = pending.context.topic
  const data = pending.context.data as Record<string, unknown>
  if (action.type !== 'pass' && action.type !== 'chooseOption') return { code: 'E_NOT_AN_OPTION', reason: 'cards: expected chooseOption or pass' }
  const choice = action.type === 'chooseOption' ? action.optionId : null
  switch (topic) {
    case 'twistPick': {
      const head = c.picks[0]
      if (!head) return { code: 'E_NOT_AN_OPTION', reason: 'cards: no twist pick is open' }
      c.picks.shift()
      if (choice !== null) applyPick(ctx, head, choice)
      return
    }
    case 'discardTactics': {
      if (choice === null) { c.discardDone[p] = s.round; return }
      const id = choice.replace(/^discard:/, '')
      const piles = c.tactics[p]
      if (!piles.hand.includes(id)) return { code: 'E_NOT_AN_OPTION', reason: `${id} is not in hand` }
      piles.hand = piles.hand.filter((x) => x !== id)
      piles.discard = [...piles.discard, id]
      ctx.emit({ type: 'TacticDiscarded', cardId: id, player: p })
      return
    }
    case 'scoreTactics': {
      if (choice === null) { c.scoreDone = `${s.round}:${p}`; return }
      const id = choice.replace(/^score:/, '')
      const piles = c.tactics[p]
      if (!piles.hand.includes(id) || !tacticMet(s, p, id)) return { code: 'E_NOT_AN_OPTION', reason: `${id} cannot be scored now` }
      const oath = oathOf(s, p) === id
      piles.hand = piles.hand.filter((x) => x !== id)
      piles.scored = [...piles.scored, id]
      // STD-BT-1: a scored oath is fulfilled and set to one side; its command stays usable
      if (oath) { piles.fulfilled = [...(piles.fulfilled ?? []), id]; piles.oath = null }
      if (officersMap(s)[p] === id) clearOfficersOrder(s, p)
      ctx.emit({ type: 'TacticScored', cardId: id, vp: 1, player: p })
      awardVp(ctx, p, 1, id)
      return
    }
    case 'extraTactic': {
      const piles = c.tactics[p]
      const n = Math.min(Number(data.count ?? 1), piles.deck.length)
      setCardMark(s, extraKey(s, p), choice === null ? 0 : n)
      if (choice === null || n <= 0) return
      piles.hand = [...piles.hand, ...piles.deck.slice(0, n)]
      piles.deck = piles.deck.slice(n)
      ctx.emit({ type: 'TacticsDrawn', count: n, player: p })
      setCardMark(s, bottomKey(s, p), n)
      return
    }
    case 'bottomTactic': {
      const piles = c.tactics[p]
      const id = (choice ?? '').replace(/^bottom:/, '')
      if (!piles.hand.includes(id)) return { code: 'E_NOT_AN_OPTION', reason: `${id} is not in hand` }
      piles.hand = piles.hand.filter((x) => x !== id)
      piles.deck = [...piles.deck, id]
      if (piles.oath === id) piles.oath = null
      const owed = cardMark(s, bottomKey(s, p))
      setCardMark(s, bottomKey(s, p), Math.max(0, (typeof owed === 'number' ? owed : 1) - 1))
      return
    }
    case 'tacticCommand': {
      if (data.followUp) {
        const f = c.followUp
        if (!f) return { code: 'E_NOT_AN_OPTION', reason: 'cards: nothing to finish' }
        if (f.kind === 'slide') {
          if (choice !== null) {
            const sl = parseSlide(choice)
            if (!sl || !applySlide(ctx, f.unitId, sl.dx, sl.dz, f.max)) return { code: 'E_OUT_OF_RANGE', reason: 'that move is not possible' }
          }
          c.followUp = null
          tacticUsedStep(ctx)
          return
        }
        const at = choice ? parseAt(choice) : null
        if (!at || !placeReinforcement(ctx, f.unitId, at)) return { code: 'E_TERRITORY', reason: 'the reinforcements cannot be set up there' }
        c.followUp = null
        tacticUsedStep(ctx)
        return
      }
      const key = String(data.key ?? '')
      if (choice === null) { s.phaseState.marks.push(passMark(key, p)); return }
      const [cardId, target] = [choice.slice(0, choice.indexOf('|')), choice.slice(choice.indexOf('|') + 1)]
      if (!commandCards(s, p).includes(cardId) || !COMMANDS[cardId]) return { code: 'E_NOT_AN_OPTION', reason: `${cardId} is not in hand` }
      useCommand(ctx, p, cardId, target, { trigger: (data.trigger as WindowTrigger | null) ?? undefined, window: String(data.window ?? data.slot ?? '') })
      tacticUsedStep(ctx)
      return
    }
    default:
      return { code: 'E_NOT_AN_OPTION', reason: `cards: no handler for ${topic}` }
  }
}

export const cardHandler: DecisionHandler = { handle }

// ---------- views (SPH-3.5, CARD-016/017): the opponent's hand and every deck order are hidden ----------
export function redactCards(state: GameState, viewer: PlayerId): GameState {
  const c = state.cards
  const hide = (ids: Id[], tag: string): Id[] => ids.map((_id, i) => `hidden:${tag}:${i}`)
  const opp = otherPlayer(viewer)
  const cards: CardsState | undefined = c
    ? {
      ...c,
      tactics: {
        ...c.tactics,
        [viewer]: { ...c.tactics[viewer], deck: hide(c.tactics[viewer].deck, 'deck') },
        // STD-BT-1: the opponent's oath card is shown face up in its hand slot
        [opp]: { ...c.tactics[opp], deck: hide(c.tactics[opp].deck, 'deck'), hand: hide(c.tactics[opp].hand, 'hand').map((h, i) => (c.tactics[opp].hand[i] === oathOf(state, opp) ? c.tactics[opp].hand[i] : h)) },
      } as CardsState['tactics'],
    }
    : undefined
  // CITIES-BT-1: which card is set aside is public, its face is not
  const aside = officersMap(state)[opp]
  const idx = aside && c ? c.tactics[opp].hand.indexOf(aside) : -1
  const mission = aside ? { ...state.mission, custom: { ...state.mission.custom, officersOrder: { ...officersMap(state), [opp]: idx >= 0 ? `hidden:hand:${idx}` : null } } } : state.mission
  return { ...state, mission, cards, twist: { ...state.twist, deck: hide(state.twist.deck, 'twist') } }
}

export function twistFlagSummary(s: GameState): { kind: CardFlagKind; label: string }[] {
  return flagsOf(s).map((f) => ({ kind: f.kind, label: f.objectiveId ? objectiveName(s, f.objectiveId) : unitName(s, f.unitId) }))
}
