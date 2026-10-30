// Spearhead cards (11-spearhead §3/§9/§10, 14-fire-and-jade-cards): twist deck, battle tactic hands, commands and the
// extra scoring windows. Fixture armies (tests/fixtures/aos.ts) with the real Fire and Jade deck data.
import { describe, expect, it } from 'vitest'
import deckJson from '../../src/data/cards/fire-and-jade.json'
import type { CardDeckData, DataBundle } from '../../src/data/types'
import {
  createContext, DEFAULT_MODULES, SeededRng, setModelPos, view, type Action, type EngineContext, type GameEvent, type GameState,
  type PendingDecision, type PlayerId, type StepResult, type UnitId,
} from '../../src/engine'
import {
  TACTIC_NAMES, TWIST_NAMES, cardHandler, cardsRoundEnd, cardsRoundStart, commandWindow, expireCardFlags, maySeizerDraw,
  officersOrderCard, reactionWindow, scoreTacticsStep, setOfficersOrder, tacticMet, twistAfterScoring, twistTurnScoring,
} from '../../src/engine/cards'
import { cardHitRule, cardWard } from '../../src/engine/cardFlags'
import { hookService } from '../../src/engine/hooks-impl'
import { objectiveService } from '../../src/engine/objectives'
import { aosPingEngine, aosState, autoDeployAos, makeAosSetup, withAosBundle } from '../fixtures'

const deck = deckJson as CardDeckData

// the fixture bundle plus the Fire and Jade deck; `twists` replaces the Aqshy twist deck (ids may repeat: one per round)
function cardBundle(twists?: string[]): DataBundle {
  return withAosBundle((b) => {
    const list = twists ? twists.map((id) => ({ ...(deck.twists.find((t) => t.id === id) as CardDeckData['twists'][number]), side: 'aqshy' })) : deck.twists
    b.cardDecks = { 'rbf.fire-and-jade': { ...deck, twists: list } }
  })
}

function play(start: StepResult, bundle: DataBundle, choose?: (s: GameState, p: PendingDecision, legal: Action[]) => Action, maxSteps = 3000) {
  const engine = aosPingEngine()
  let r = start
  const events: GameEvent[] = [...start.events]
  for (let i = 0; i < maxSteps && r.pending; i++) {
    const legal = engine.legalActions(r.state, r.pending) ?? []
    const a = choose ? choose(r.state, r.pending, legal) : legal[0]
    r = engine.step(r.state, a)
    if (r.rejection) throw new Error(`rejected ${r.rejection.code}: ${r.rejection.reason}`)
    events.push(...r.events)
  }
  void bundle
  return { final: r, events }
}

function newGame(bundle: DataBundle, seed = 'cards'): StepResult {
  return aosPingEngine().createGame(makeAosSetup(), seed, bundle)
}

// a fixture state with both armies deployed and the deck dealt (round 1, A active)
function dealt(bundle = cardBundle()): GameState {
  const s = aosState({}, bundle)
  autoDeployAos(s, 'A')
  autoDeployAos(s, 'B')
  s.round = 1
  s.phase = 'command'
  s.activePlayer = 'A'
  s.firstPlayer = 'A'
  return s
}

function ctxFor(s: GameState): { ctx: EngineContext; events: GameEvent[] } {
  return createContext(s, new SeededRng('cards-ctx'), DEFAULT_MODULES)
}

function hand(s: GameState, p: PlayerId, ids: string[]): void {
  s.cards!.tactics[p].hand = [...ids]
}

function put(s: GameState, unitId: UnitId, x: number, z: number): void {
  const u = s.units[unitId]
  u.location = 'board'
  u.models.forEach((id, i) => setModelPos(s.models[id], { x: x + (i % 5) * 1.4, y: 0, z: z + Math.floor(i / 5) * 1.4 }, 0))
}

function answer(ctx: EngineContext, optionId: string | null): void {
  const pending = ctx.state.pending as PendingDecision
  ctx.state.pending = null
  const action: Action = optionId === null
    ? { type: 'pass', player: pending.player, decisionId: pending.id }
    : { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }
  const rej = cardHandler.handle(ctx, action, pending)
  if (rej) throw new Error(rej.reason)
}

describe('card data', () => {
  it('CARD-018 every twist and tactic in the data has an engine implementation with the same name', () => {
    expect(deck.twists).toHaveLength(12)
    expect(deck.tactics).toHaveLength(12)
    for (const t of deck.twists) expect(TWIST_NAMES[t.id]).toBe(t.name)
    for (const t of deck.tactics) {
      expect(TACTIC_NAMES[t.id]?.name).toBe(t.name)
      expect(TACTIC_NAMES[t.id]?.command).toBe(t.command.name)
    }
    expect(deck.twists.filter((t) => t.side === 'aqshy')).toHaveLength(6)
    expect(deck.twists.filter((t) => t.side === 'ghyran')).toHaveLength(6)
  })
})

describe('decks and hands (SPH-3.6, SPH-10)', () => {
  it('CARD-001 the same seed deals identical twist and tactic deck orders', () => {
    const a = newGame(cardBundle(), 'seed-x').state
    const b = newGame(cardBundle(), 'seed-x').state
    expect(a.twist.drawn).toEqual(b.twist.drawn)
    expect(a.twist.deck).toEqual(b.twist.deck)
    expect(a.cards!.tactics).toEqual(b.cards!.tactics)
    const all = [...a.cards!.tactics.A.hand, ...a.cards!.tactics.A.deck].sort()
    expect(all).toEqual(deck.tactics.map((t) => t.id).sort())
  })

  it('CARD-002 each round draws exactly one twist, visible to both players', () => {
    const bundle = cardBundle()
    const { final, events } = play(newGame(bundle), bundle)
    expect(final.state.phase).toBe('ended')
    const drawn = events.filter((e) => e.type === 'TwistDrawn')
    expect(drawn.map((e) => (e as { drawRound: number }).drawRound)).toEqual([1, 2, 3, 4])
    expect(final.state.twist.drawn).toHaveLength(4)
    expect(view(final.state, 'B').state.twist.drawn).toEqual(final.state.twist.drawn)
  })

  it('CARD-003 a round twist is active through its round only', () => {
    const bundle = cardBundle(['card.twist.wreathed-in-smoke', 'card.twist.wreathed-in-smoke', 'card.twist.wreathed-in-smoke', 'card.twist.wreathed-in-smoke'])
    const engine = aosPingEngine()
    let r = newGame(bundle)
    let sawFlag = false
    for (let i = 0; i < 3000 && r.pending; i++) {
      const legal = engine.legalActions(r.state, r.pending) ?? []
      r = engine.step(r.state, legal[0])
      for (const e of r.events) if (e.type === 'RoundEnded') {
        expect(r.state.cards!.flags.filter((f) => f.until === 'round')).toEqual([])
        expect(r.state.twist.current).toBeNull()
      }
      if (r.state.cards!.flags.some((f) => f.kind === 'wreathed')) sawFlag = true
    }
    expect(sawFlag).toBe(true)
  })

  it('CARD-004 underdogElseRollOff: no underdog -> roll-off winner picks; an underdog picks themselves', () => {
    const bundle = cardBundle(['card.twist.grasping-vines', 'card.twist.grasping-vines', 'card.twist.grasping-vines', 'card.twist.grasping-vines'])
    const start = newGame(bundle)
    // round 1: tied VP, so the twist's pick follows a roll-off
    expect(start.events.some((e) => e.type === 'DiceRolled' && e.roll.purpose === 'rollOff')).toBe(true)
    const engine = aosPingEngine()
    let r = start
    let round2Picker: PlayerId | null = null
    for (let i = 0; i < 3000 && r.pending; i++) {
      // give A a lead before round 2 starts so B is the underdog
      if (r.state.round === 1 && r.state.players.A.vp < 5) r = { ...r, state: { ...r.state, players: { ...r.state.players, A: { ...r.state.players.A, vp: 5 } } } }
      const p = r.pending as PendingDecision
      if (r.state.round === 2 && p.kind === 'chooseOption' && p.context.topic === 'twistPick' && round2Picker === null) round2Picker = p.player
      const legal = engine.legalActions(r.state, p) ?? []
      r = engine.step(r.state, legal[0])
      if (round2Picker) break
    }
    expect(round2Picker).toBe('B')
  })

  const NO_PICK = ['card.twist.take-the-land', 'card.twist.take-the-land', 'card.twist.take-the-land', 'card.twist.take-the-land']

  it('CARD-006 round 1: each player holds 3 battle tactics', () => {
    const r = newGame(cardBundle(NO_PICK))
    expect(r.state.cards!.tactics.A.hand).toHaveLength(3)
    expect(r.state.cards!.tactics.B.hand).toHaveLength(3)
    expect(r.state.cards!.tactics.A.deck).toHaveLength(9)
  })

  it('CARD-007 round 2: discard first (first-turn player, then the other), then draw back to 3', () => {
    const bundle = cardBundle()
    const engine = aosPingEngine()
    let r = newGame(bundle)
    const order: PlayerId[] = []
    let firstR2: PlayerId | null = null
    for (let i = 0; i < 3000 && r.pending && r.state.round < 3; i++) {
      const p = r.pending
      if (r.state.round === 2 && firstR2 === null && p.kind === 'chooseOption' && p.context.topic === 'discardTactics') firstR2 = r.state.firstPlayer
      const legal = engine.legalActions(r.state, p) ?? []
      let a = legal[0]
      if (p.kind === 'chooseOption' && p.context.topic === 'discardTactics') {
        if (!order.includes(p.player)) order.push(p.player)
        // discard exactly one card, then keep the rest
        a = r.state.cards!.tactics[p.player].discard.length === 0 ? legal[0] : legal.find((x) => x.type === 'pass') as Action
      }
      r = engine.step(r.state, a)
    }
    expect(order).toEqual([firstR2, firstR2 === 'A' ? 'B' : 'A'])
    for (const p of ['A', 'B'] as PlayerId[]) {
      expect(r.state.cards!.tactics[p].discard).toHaveLength(1)
      expect(r.state.cards!.tactics[p].hand.length).toBe(3)
    }
  })

  it('CARD-008 a player who seized the initiative draws nothing (they may still discard)', () => {
    const s = dealt()
    s.priority.seized = 'A'
    s.underdog = null
    expect(maySeizerDraw(s, 'A')).toBe(false)
    expect(maySeizerDraw(s, 'B')).toBe(true)
  })

  it('CARD-009 a seizer who is the underdog trailing by 5 or more still draws; by 4 they do not', () => {
    const s = dealt()
    s.priority.seized = 'A'
    s.underdog = 'A'
    s.players.B.vp = 5
    s.players.A.vp = 0
    expect(maySeizerDraw(s, 'A')).toBe(true)
    s.players.B.vp = 4
    expect(maySeizerDraw(s, 'A')).toBe(false)
  })

  it('CARD-015 an exhausted tactic deck simply stops drawing', () => {
    const s = dealt()
    s.round = 2
    const c = s.cards!
    c.shuffled = true
    c.tactics.A = { deck: [], hand: ['card.tactic.raid'], discard: [], scored: [] }
    c.tactics.B = { deck: [], hand: [], discard: [], scored: [] }
    c.discardDone = { A: 2, B: 2 }
    const { ctx } = ctxFor(s)
    ctx.once('twist:2')
    expect(cardsRoundStart(ctx)).toBe(false)
    expect(c.tactics.A.hand).toEqual(['card.tactic.raid'])
    expect(c.drawRound).toEqual({ A: 2, B: 2 })
  })
})

describe('scoring tactics (SPH-10.3)', () => {
  function raidReady(): GameState {
    const s = dealt()
    // A: Guard wholly inside B's territory, far from enemies; Boss and Knight on the two short edges
    put(s, 'A:guard', -4, 2)
    put(s, 'A:boss', -14, -8)
    put(s, 'A:knight', 13.5, -8)
    for (const id of ['B:boss', 'B:brute', 'B:hawk', 'B:guard']) put(s, id, -12 + ['B:boss', 'B:brute', 'B:hawk', 'B:guard'].indexOf(id) * 7, 9.5)
    return s
  }

  it('CARD-010 two met tactics: the owner picks which to score; each is +1 VP and goes to the scored pile', () => {
    const s = raidReady()
    hand(s, 'A', ['card.tactic.raid', 'card.tactic.take-the-flanks', 'card.tactic.hold-ground'])
    expect(tacticMet(s, 'A', 'card.tactic.raid')).toBe(true)
    expect(tacticMet(s, 'A', 'card.tactic.take-the-flanks')).toBe(true)
    const { ctx, events } = ctxFor(s)
    expect(scoreTacticsStep(ctx)).toBe(true)
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(p.context.topic).toBe('scoreTactics')
    expect(p.options.map((o) => o.id)).toEqual(['score:card.tactic.raid', 'score:card.tactic.take-the-flanks'])
    answer(ctx, 'score:card.tactic.raid')
    expect(scoreTacticsStep(ctx)).toBe(true)
    answer(ctx, 'score:card.tactic.take-the-flanks')
    expect(scoreTacticsStep(ctx)).toBe(false)
    expect(s.players.A.vp).toBe(2)
    expect(s.cards!.tactics.A.scored).toEqual(['card.tactic.raid', 'card.tactic.take-the-flanks'])
    expect(s.cards!.tactics.A.hand).toEqual(['card.tactic.hold-ground'])
    expect(events.filter((e) => e.type === 'TacticScored')).toHaveLength(2)
    expect(s.players.A.vpBySource['card.tactic.raid']).toBe(1)
  })

  it('CARD-011 a tactic met during the opponent\'s turn is not scorable then', () => {
    const s = raidReady()
    s.activePlayer = 'B'
    hand(s, 'A', ['card.tactic.raid'])
    hand(s, 'B', [])
    const { ctx } = ctxFor(s)
    expect(scoreTacticsStep(ctx)).toBe(false)
    expect(s.players.A.vp).toBe(0)
  })

  it('CARD-019 War of Attrition, Do Not Waver and Cut Off the Head read the turn log', () => {
    const s = dealt()
    const c = s.cards!
    c.turnLog = { destroyed: ['B:guard'], fought: ['A:guard'] }
    expect(tacticMet(s, 'A', 'card.tactic.war-of-attrition')).toBe(true)
    expect(tacticMet(s, 'A', 'card.tactic.do-not-waver')).toBe(true)
    c.turnLog.destroyed.push('A:guard')
    expect(tacticMet(s, 'A', 'card.tactic.war-of-attrition')).toBe(false)
    expect(tacticMet(s, 'A', 'card.tactic.do-not-waver')).toBe(false)
    expect(tacticMet(s, 'A', 'card.tactic.cut-off-the-head')).toBe(false)
    c.generalSlain.B = { round: 1, turn: 'A' }
    expect(tacticMet(s, 'A', 'card.tactic.cut-off-the-head')).toBe(true)
  })

  it('CARD-020 the flip-count tactics use the turn-start control snapshot', () => {
    const s = dealt()
    for (const id of ['obj-c', 'obj-w']) { s.objectives[id].controllerAtTurnStart = 'B'; s.objectives[id].controller = 'A' }
    expect(tacticMet(s, 'A', 'card.tactic.attack-on-two-fronts')).toBe(true)
    expect(tacticMet(s, 'A', 'card.tactic.take-without-warning')).toBe(true)
    s.objectives['obj-w'].controller = 'B'
    expect(tacticMet(s, 'A', 'card.tactic.attack-on-two-fronts')).toBe(false)
  })
})

describe('card commands (SPH-3.4, SPH-10.5)', () => {
  it('CARD-012 using a command discards the card face up; it can no longer be scored', () => {
    const s = dealt()
    hand(s, 'B', ['card.tactic.war-of-attrition'])
    const { ctx, events } = ctxFor(s)
    expect(commandWindow(ctx, 'hero', 'B')).toBe(true)
    const p = s.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(p.context.topic).toBe('tacticCommand')
    answer(ctx, 'card.tactic.war-of-attrition|B:brute')
    expect(s.units['B:brute'].turn.fightsFirst).toBe(true)
    expect(s.cards!.tactics.B.hand).toEqual([])
    expect(s.cards!.tactics.B.discard).toEqual(['card.tactic.war-of-attrition'])
    expect(events.some((e) => e.type === 'TacticCommandUsed')).toBe(true)
    expect(commandWindow(ctx, 'hero', 'B')).toBe(false)
  })

  it('CARD-013 two card commands on the same unit in one phase are both allowed, at no cost', () => {
    const s = dealt()
    hand(s, 'B', ['card.tactic.raid', 'card.tactic.take-without-warning'])
    s.phaseState.attack = { kind: 'ranged', attackerUnitId: 'A:knight', overwatch: false, targets: [], groups: [], current: null, mortalQueue: [], hazardousPending: [], targetUnitIds: ['B:brute'] }
    const { ctx } = ctxFor(s)
    expect(reactionWindow(ctx, 'shooting.targetsDeclared', 'B', 'A:knight', { unitId: 'A:knight' })).toBe(true)
    answer(ctx, 'card.tactic.raid|B:brute')
    expect(reactionWindow(ctx, 'shooting.targetsDeclared', 'B', 'A:knight', { unitId: 'A:knight' })).toBe(true)
    answer(ctx, 'card.tactic.take-without-warning|B:brute')
    expect(s.cards!.flags.map((f) => f.kind).sort()).toEqual(['fightToTheLast', 'steelDefence'])
    expect(cardWard(s, 'B:brute', null)).toEqual({ needed: 5, modifier: 0 })
  })

  it('CARD-014 a held reaction card is offered when the opponent declares an attack on that player', () => {
    const s = dealt()
    hand(s, 'B', ['card.tactic.the-dracothion-dais'])
    hand(s, 'A', ['card.tactic.raid'])
    s.phaseState.attack = { kind: 'ranged', attackerUnitId: 'A:knight', overwatch: false, targets: [], groups: [], current: null, mortalQueue: [], hazardousPending: [], targetUnitIds: ['B:guard'] }
    const { ctx } = ctxFor(s)
    // the attacker's own player is never offered a defensive reaction
    expect(reactionWindow(ctx, 'shooting.targetsDeclared', 'A', 'A:knight', { unitId: 'A:knight' })).toBe(false)
    expect(reactionWindow(ctx, 'shooting.targetsDeclared', 'B', 'A:knight', { unitId: 'A:knight' })).toBe(true)
    answer(ctx, 'card.tactic.the-dracothion-dais|B:guard')
    expect(cardHitRule(s, 'A:knight', 'B:guard', 'ranged').onlySix).toBe(true)
    expect(s.units['B:guard'].turn.fightsLast).toBe(true)
    // passing closes the window for this occurrence
    hand(s, 'B', ['card.tactic.raid'])
    expect(reactionWindow(ctx, 'shooting.targetsDeclared', 'B', 'A:knight', { unitId: 'A:knight' })).toBe(true)
    answer(ctx, null)
    expect(reactionWindow(ctx, 'shooting.targetsDeclared', 'B', 'A:knight', { unitId: 'A:knight' })).toBe(false)
  })

  it('CARD-021 Inspiring Presence adds the roll to a Hero\'s Control for the turn', () => {
    const s = dealt()
    hand(s, 'A', ['card.tactic.raze'])
    const { ctx } = ctxFor(s)
    expect(commandWindow(ctx, 'hero', 'A')).toBe(true)
    answer(ctx, 'card.tactic.raze|A:boss')
    const f = s.cards!.flags.find((x) => x.kind === 'inspiring')!
    expect(f.value).toBeGreaterThanOrEqual(1)
    const m = s.models[s.units['A:boss'].models[0]]
    expect(hookService.statFor(s, { unitId: 'A:boss', modelId: m.id, weapon: null, stat: 'OC' }, 2)).toBe(2 + f.value)
  })
})

describe('twists (SPH-9, 14-cards §2/§3)', () => {
  function withTwist(id: string): { s: GameState; ctx: EngineContext; events: GameEvent[] } {
    const s = dealt()
    s.twist = { deck: [], current: id, drawn: [id] }
    const { ctx, events } = ctxFor(s)
    return { s, ctx, events }
  }

  it('CARD-022 Ring of Fire: the named objective is out of play, units on it burn after scoring', () => {
    const { s, ctx } = withTwist('card.twist.ring-of-fire')
    put(s, 'B:brute', 0, 0)
    s.objectives['obj-c'].controller = 'B'
    s.cards!.flags.push({ kind: 'ringOfFire', source: 'card.twist.ring-of-fire', player: 'A', unitId: null, objectiveId: 'obj-c', value: 0, until: 'round', round: 1 })
    s.objectives['obj-c'].controller = null
    objectiveService.evaluateControl(ctx, 'turnEnd')
    expect(s.objectives['obj-c'].controller).toBeNull()
    const before = s.units['B:brute'].models.reduce((a, id) => a + (s.models[id]?.woundsRemaining ?? 0), 0)
    twistAfterScoring(ctx)
    const after = s.units['B:brute'].models.reduce((a, id) => a + (s.models[id]?.woundsRemaining ?? 0), 0)
    expect(after).toBeLessThan(before)
  })

  it('CARD-023 Reclaim and Mount the Attack pay extra VP at the end of the active player\'s turn', () => {
    const r = withTwist('card.twist.reclaim-aqshy')
    r.s.objectives['obj-c'].controller = 'A'
    r.s.cards!.flags.push({ kind: 'reclaim', source: 'card.twist.reclaim-aqshy', player: 'A', unitId: null, objectiveId: 'obj-c', value: 0, until: 'round', round: 1 })
    r.s.cards!.flags.push({ kind: 'reclaim', source: 'card.twist.reclaim-aqshy', player: 'A', unitId: null, objectiveId: 'obj-w', value: 0, until: 'round', round: 1 })
    twistTurnScoring(r.ctx)
    expect(r.s.players.A.vp).toBe(1)
    const m = withTwist('card.twist.mount-the-attack')
    for (const id of ['obj-c', 'obj-e']) { m.s.objectives[id].controller = 'A'; m.s.objectives[id].controllerAtTurnStart = 'B' }
    twistTurnScoring(m.ctx)
    expect(m.s.players.A.vp).toBe(2)
    expect(m.s.players.A.vpBySource['card.twist.mount-the-attack']).toBe(2)
  })

  it('CARD-024 Bloodmarked pays the opposing player at the end of the round', () => {
    const { s, ctx } = withTwist('card.twist.bloodmarked')
    s.cards!.flags.push({ kind: 'bloodmarked', source: 'card.twist.bloodmarked', player: 'A', unitId: 'B:guard', objectiveId: null, value: 0, until: 'round', round: 1 })
    s.cards!.roundDestroyed = ['B:guard']
    cardsRoundEnd(ctx)
    expect(s.players.A.vp).toBe(1)
    expect(s.players.B.vp).toBe(0)
    expect(s.twist.current).toBeNull()
    expect(s.cards!.flags).toEqual([])
  })

  it('CARD-025 Wreathed in Smoke: attacks on a unit on the objective only hit on a 6', () => {
    const { s } = withTwist('card.twist.wreathed-in-smoke')
    put(s, 'B:brute', 0, 0)
    s.cards!.flags.push({ kind: 'wreathed', source: 'card.twist.wreathed-in-smoke', player: 'B', unitId: null, objectiveId: 'obj-c', value: 0, until: 'round', round: 1 })
    expect(cardHitRule(s, 'A:guard', 'B:brute', 'melee').onlySix).toBe(true)
    expect(cardHitRule(s, 'A:guard', 'B:hawk', 'melee').onlySix).toBe(false)
  })

  it('CARD-026 Grasping Vines halves Move; Nurgle\'s Rot and Eroding Miasma hit saves and wards', () => {
    const { s } = withTwist('card.twist.grasping-vines')
    s.cards!.flags.push({ kind: 'ensnared', source: 'card.twist.grasping-vines', player: 'A', unitId: 'B:hawk', objectiveId: null, value: 0, until: 'round', round: 1 })
    const m = s.models[s.units['B:hawk'].models[0]]
    expect(hookService.statFor(s, { unitId: 'B:hawk', modelId: m.id, weapon: null, stat: 'M' }, 12)).toBe(6)
    s.cards!.flags.push({ kind: 'noWard', source: 'card.twist.the-grandfathers-blessing', player: 'A', unitId: 'B:hawk', objectiveId: null, value: 0, until: 'round', round: 1 })
    expect(cardWard(s, 'B:hawk', { needed: 5, modifier: 0 })).toBeNull()
  })

  it('CARD-027 a twist pick decision is raised for the picker and recorded as a flag', () => {
    const bundle = cardBundle(['card.twist.wreathed-in-smoke', 'card.twist.wreathed-in-smoke', 'card.twist.wreathed-in-smoke', 'card.twist.wreathed-in-smoke'])
    const r = newGame(bundle)
    const p = r.pending as Extract<PendingDecision, { kind: 'chooseOption' }>
    expect(p.context.topic).toBe('twistPick')
    expect(p.options.map((o) => o.id)).toContain('obj-c')
    const engine = aosPingEngine()
    const next = engine.step(r.state, p.options.find((o) => o.id === 'obj-c')!.action)
    expect(next.state.cards!.flags).toEqual([expect.objectContaining({ kind: 'wreathed', objectiveId: 'obj-c', player: p.player })])
  })
})

describe('hidden information (SPH-3.5, SPH-10.7)', () => {
  it('CARD-016 the opponent\'s hand and every deck order are hidden in view; TacticsDrawn carries a count only', () => {
    const r = newGame(cardBundle(['card.twist.take-the-land', 'card.twist.take-the-land', 'card.twist.take-the-land', 'card.twist.take-the-land']))
    const v = view(r.state, 'A').state
    expect(v.cards!.tactics.A.hand).toEqual(r.state.cards!.tactics.A.hand)
    expect(v.cards!.tactics.B.hand.every((id) => id.startsWith('hidden:'))).toBe(true)
    expect(v.cards!.tactics.A.deck.every((id) => id.startsWith('hidden:'))).toBe(true)
    expect(v.twist.deck.every((id) => id.startsWith('hidden:'))).toBe(true)
    const drawn = r.events.filter((e) => e.type === 'TacticsDrawn')
    expect(drawn).toHaveLength(2)
    for (const e of drawn) expect(Object.keys(e)).not.toContain('cardId')
  })

  it('CARD-017 a discarded tactic is visible to the opponent', () => {
    const s = dealt()
    s.cards!.tactics.B.discard = ['card.tactic.raid']
    expect(view(s, 'A').state.cards!.tactics.B.discard).toEqual(['card.tactic.raid'])
  })
})

describe("CITIES-BT-1 The Officer's Order (card side)", () => {
  it("CITIES-BT-1 the set-aside card's command is free: the card goes back to hand, not to the discard pile, and is locked for that phase", () => {
    const s = dealt()
    hand(s, 'B', ['card.tactic.war-of-attrition'])
    setOfficersOrder(s, 'B', 'card.tactic.war-of-attrition')
    const { ctx, events } = ctxFor(s)
    expect(commandWindow(ctx, 'hero', 'B')).toBe(true)
    answer(ctx, 'card.tactic.war-of-attrition|B:brute')
    expect(s.units['B:brute'].turn.fightsFirst).toBe(true)
    expect(s.cards!.tactics.B.hand).toEqual(['card.tactic.war-of-attrition'])
    expect(s.cards!.tactics.B.discard).toEqual([])
    expect(officersOrderCard(s, 'B')).toBeNull()
    // revealed: the summary names the card
    const used = events.find((e) => e.type === 'TacticCommandUsed') as { summary: string } | undefined
    expect(used?.summary).toContain("The Officer's Order")
    // not again in the phase it came back
    expect(commandWindow(ctx, 'hero', 'B', 'hero:again')).toBe(false)
    // a normal card again from the next battle round: using it now discards it
    s.round = 2
    expect(commandWindow(ctx, 'hero', 'B', 'hero:r2')).toBe(true)
    answer(ctx, 'card.tactic.war-of-attrition|B:brute')
    expect(s.cards!.tactics.B.discard).toEqual(['card.tactic.war-of-attrition'])
  })

  it("CITIES-BT-1 an unused set-aside card stays hidden from the opponent and returns at the end of its owner's turn", () => {
    const s = dealt()
    hand(s, 'A', ['card.tactic.raid', 'card.tactic.hold-ground'])
    setOfficersOrder(s, 'A', 'card.tactic.hold-ground')
    const seen = view(s, 'B').state.mission.custom.officersOrder as Record<string, string>
    expect(seen.A).toBe('hidden:hand:1')
    s.activePlayer = 'B'
    expireCardFlags(s, 'turn')
    expect(officersOrderCard(s, 'A')).toBe('card.tactic.hold-ground')
    s.activePlayer = 'A'
    expireCardFlags(s, 'turn')
    expect(officersOrderCard(s, 'A')).toBeNull()
    expect(s.cards!.tactics.A.hand).toEqual(['card.tactic.raid', 'card.tactic.hold-ground'])
  })
})
