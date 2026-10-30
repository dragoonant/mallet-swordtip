// F6 engine-core: the generic engine mechanisms the Slaves to Darkness (STD-*) and Fyreslayers (FYR-*) faction specs need
// (docs/spec/factions/{slaves-to-darkness,fyreslayers}.md, mapping class (c)). Fixture armies (tests/fixtures/aos.ts) with
// throw-away test code hooks registered for the duration of a test; no faction data is read here.
import { afterEach, describe, expect, it } from 'vitest'
import deckJson from '../../src/data/cards/fire-and-jade.json'
import type { AbilityDescriptor, CardDeckData, DataBundle } from '../../src/data/types'
import {
  DEFAULT_MODULES, ScriptedRng, SeededRng, abilityService, createContext, isCoherent, rollSum, setModelPos, unitModels, view,
  type Action, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameState, type PendingDecision, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService, drainAfterFightMortal, deferMortalAfterFight, feelNoPainFor, pendingAfterFightMortal } from '../../src/engine/attack'
import {
  cardHandler, cardsRoundStart, commandWindow, expireCardFlags, fulfilledOf, oathOf, scoreTacticsStep, setOath, tacticMet,
} from '../../src/engine/cards'
import { codeHooks, type EngineCodeHook } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { commandModule } from '../../src/engine/phases/command'
import { resolveSetUp, unitIgnoresRetreatDamage } from '../../src/engine/phases/movement'
import { readRedeploy, requestRedeploy } from '../../src/engine/redeploy'
import { applyAbilityRerolls } from '../../src/engine/rerolls'
import { horizontalGap } from '../../src/engine/geometry'
import { makeSimSetup, simPairings } from '../../tools/sim-core'
import { aosBundle, aosState, autoDeployAos, withAosBundle } from '../fixtures'

const deck = deckJson as CardDeckData
const noop = () => undefined

// ---------- test code hooks (registered per test, removed afterwards) ----------
const added: string[] = []
function register(hook: EngineCodeHook): void {
  codeHooks[hook.name] = hook
  added.push(hook.name)
}
afterEach(() => { for (const n of added.splice(0)) delete codeHooks[n] })

const ab = (id: string, extra: Partial<AbilityDescriptor>): AbilityDescriptor => ({ id, name: id, text: 'Test ability.', trigger: 'always', ...extra })

// fixture bundle + the Fire and Jade deck with a pick-free twist every round
function bundleWith(patch: (b: DataBundle) => void = noop): DataBundle {
  return withAosBundle((b) => {
    const twist = deck.twists.find((t) => t.id === 'card.twist.take-the-land') as CardDeckData['twists'][number]
    b.cardDecks = { 'rbf.fire-and-jade': { ...deck, twists: [1, 2, 3, 4].map(() => ({ ...twist, side: 'aqshy' })) } }
    patch(b)
  })
}

function dealt(bundle: DataBundle = bundleWith()): GameState {
  const s = aosState({}, bundle)
  autoDeployAos(s, 'A')
  autoDeployAos(s, 'B')
  s.round = 1
  s.phase = 'command'
  s.activePlayer = 'A'
  s.firstPlayer = 'A'
  return s
}

function ctxOf(s: GameState, dice?: number[]): { ctx: EngineContext; events: GameEvent[] } {
  return createContext(s, dice ? new ScriptedRng(dice) : new SeededRng('f6'), DEFAULT_MODULES)
}

function put(s: GameState, unitId: UnitId, x: number, z: number, gap = 1.4): void {
  const u = s.units[unitId]
  u.location = 'board'
  u.models.forEach((id, i) => setModelPos(s.models[id], { x: x + (i % 5) * gap, y: 0, z: z + Math.floor(i / 5) * gap }, 0))
}

// answer the pending decision through `handler` (pass when optionId is null)
function answerWith(handler: { handle: typeof cardHandler.handle }, ctx: EngineContext, optionId: string | null): void {
  const pending = ctx.state.pending as PendingDecision
  ctx.state.pending = null
  const action: Action = optionId === null
    ? { type: 'pass', player: pending.player, decisionId: pending.id }
    : { type: 'chooseOption', player: pending.player, decisionId: pending.id, optionId }
  const rej = handler.handle(ctx, action, pending)
  if (rej) throw new Error(rej.reason)
}
const answer = (ctx: EngineContext, optionId: string | null) => answerWith(cardHandler, ctx, optionId)
const topicOf = (s: GameState): string | null => (s.pending?.kind === 'chooseOption' ? (s.pending as ChooseOptionDecision).context.topic : null)

// =====================================================================================================================
describe('STD-BT-1 Oaths of Darkness: oath and fulfilled battle tactic piles (cards.ts)', () => {
  const RAID = 'card.tactic.raid'
  const WAR = 'card.tactic.war-of-attrition'
  const HOLD = 'card.tactic.hold-ground'

  function raidReady(): GameState {
    const s = dealt()
    put(s, 'A:guard', -4, 2)
    put(s, 'A:boss', -14, -8)
    put(s, 'A:knight', 13.5, -8)
    for (const [i, id] of ['B:boss', 'B:brute', 'B:hawk', 'B:guard'].entries()) put(s, id, -12 + i * 7, 9.5)
    s.cards!.tactics.A.hand = [RAID, HOLD]
    return s
  }

  it('STD-BT-1 the oath card is shown to the opponent; the rest of the hand stays hidden', () => {
    const s = raidReady()
    expect(setOath(s, 'A', RAID)).toBe(true)
    expect(setOath(s, 'A', 'card.tactic.raze')).toBe(false) // not in hand
    expect(oathOf(s, 'A')).toBe(RAID)
    const seen = view(s, 'B').state.cards!.tactics.A
    expect(seen.hand).toContain(RAID)
    expect(seen.hand.filter((id) => id.startsWith('hidden:'))).toHaveLength(1)
    expect(seen.oath).toBe(RAID)
  })

  it('STD-BT-1 a scored oath scores its VP and is set aside as fulfilled, outside the hand', () => {
    const s = raidReady()
    setOath(s, 'A', RAID)
    expect(tacticMet(s, 'A', RAID)).toBe(true)
    const { ctx } = ctxOf(s)
    expect(scoreTacticsStep(ctx)).toBe(true)
    answer(ctx, `score:${RAID}`)
    expect(s.players.A.vp).toBe(1)
    expect(fulfilledOf(s, 'A')).toEqual([RAID])
    expect(s.cards!.tactics.A.scored).toContain(RAID)
    expect(s.cards!.tactics.A.hand).toEqual([HOLD])
    expect(oathOf(s, 'A')).toBeNull()
  })

  it('STD-BT-1 fulfilled cards do not count against the 3-card hand when drawing', () => {
    const s = dealt()
    const { ctx } = ctxOf(s)
    cardsRoundStart(ctx) // round 1 deal: both hands to 3
    while (s.pending) answer(ctx, null)
    const piles = s.cards!.tactics.A
    piles.fulfilled = [piles.hand[0]]
    piles.hand = piles.hand.slice(1)
    s.round = 2
    s.cards!.discardDone.A = 2
    s.cards!.drawRound.B = 2
    s.twist = { ...s.twist, deck: [] }
    const deckBefore = piles.deck.length
    expect(cardsRoundStart(ctx)).toBe(false)
    expect(s.cards!.tactics.A.hand).toHaveLength(3)
    expect(s.cards!.tactics.A.fulfilled).toHaveLength(1)
    expect(s.cards!.tactics.A.deck).toHaveLength(deckBefore - 1)
  })

  it("STD-BT-1 a fulfilled card's command stays usable (even with an empty hand) and is then discarded", () => {
    const s = dealt()
    s.activePlayer = 'B' // War of Attrition's command is used in the enemy hero phase
    s.cards!.tactics.A.hand = []
    s.cards!.tactics.A.fulfilled = [WAR]
    const { ctx } = ctxOf(s)
    expect(commandWindow(ctx, 'hero', 'A')).toBe(true)
    const p = s.pending as ChooseOptionDecision
    const opt = p.options.find((o) => o.id.startsWith(`${WAR}|`)) as { id: string }
    answer(ctx, opt.id)
    expect(fulfilledOf(s, 'A')).toEqual([])
    expect(s.cards!.tactics.A.discard).toContain(WAR)
  })

  it("STD-BT-1 using the oath's command before scoring discards it and ends the oath", () => {
    const s = dealt()
    s.activePlayer = 'B'
    s.cards!.tactics.A.hand = [WAR, HOLD]
    setOath(s, 'A', WAR)
    const { ctx } = ctxOf(s)
    expect(commandWindow(ctx, 'hero', 'A')).toBe(true)
    const p = s.pending as ChooseOptionDecision
    answer(ctx, (p.options.find((o) => o.id.startsWith(`${WAR}|`)) as { id: string }).id)
    expect(s.cards!.tactics.A.discard).toContain(WAR)
    expect(fulfilledOf(s, 'A')).toEqual([])
    expect(oathOf(s, 'A')).toBeNull()
  })

  it('STD-BT-1 an unfulfilled oath stops being the oath at the end of the turn; the card stays in hand', () => {
    const s = raidReady()
    setOath(s, 'A', HOLD)
    expireCardFlags(s, 'turn')
    expect(oathOf(s, 'A')).toBeNull()
    expect(s.cards!.tactics.A.hand).toContain(HOLD)
  })
})

// =====================================================================================================================
describe('STD-ENH-4 Fell Ritualist: extra battle tactic draw (EngineCodeHook.extraTacticDraw)', () => {
  // the hook sits on A's enhancement (bearer = A's general); B has none
  const ritualBundle = () => bundleWith((b) => { b.abilities['fx.a.thick-hide'] = { ...b.abilities['fx.a.thick-hide'], code: 'testRitualist' } })
  const ritualist: EngineCodeHook = { name: 'testRitualist', kind: 'ability', hook: 'onStatQuery', run: noop, extraTacticDraw: () => 1 }

  function ritualGame(): GameState {
    const s = aosState({ players: { A: { name: 'Order', faction: 'fx.order', patrolId: 'fx.order.army', enhancementId: 'fx.e.thick-hide' }, B: { name: 'Chaos', faction: 'fx.chaos', patrolId: 'fx.chaos.army', enhancementId: 'fx.e.keen-edge' } } }, ritualBundle())
    autoDeployAos(s, 'A')
    autoDeployAos(s, 'B')
    s.round = 1
    s.phase = 'command'
    s.activePlayer = 'A'
    s.firstPlayer = 'A'
    return s
  }

  it('STD-ENH-4 after drawing: draw 1 more, then put 1 hand card on the bottom of the deck', () => {
    register(ritualist)
    const s = ritualGame()
    const { ctx } = ctxOf(s)
    expect(cardsRoundStart(ctx)).toBe(true)
    expect(topicOf(s)).toBe('extraTactic')
    expect(s.cards!.tactics.A.hand).toHaveLength(3)
    answer(ctx, 'draw')
    expect(s.cards!.tactics.A.hand).toHaveLength(4)
    expect(cardsRoundStart(ctx)).toBe(true)
    expect(topicOf(s)).toBe('bottomTactic')
    const back = s.cards!.tactics.A.hand[1]
    answer(ctx, `bottom:${back}`)
    expect(cardsRoundStart(ctx)).toBe(false) // B has no Fell Ritualist: plain draw
    const a = s.cards!.tactics.A
    expect(a.hand).toHaveLength(3)
    expect(a.hand).not.toContain(back)
    expect(a.deck[a.deck.length - 1]).toBe(back)
    expect(a.deck).toHaveLength(12 - 4 + 1)
    expect(s.cards!.tactics.B.hand).toHaveLength(3)
  })

  it('STD-ENH-4 declining the extra draw keeps the hand as drawn', () => {
    register(ritualist)
    const s = ritualGame()
    const { ctx } = ctxOf(s)
    cardsRoundStart(ctx)
    answer(ctx, null)
    expect(cardsRoundStart(ctx)).toBe(false)
    expect(s.cards!.tactics.A.hand).toHaveLength(3)
  })

  it('STD-ENH-4 skipped while the general is not on the battlefield', () => {
    register(ritualist)
    const s = ritualGame()
    s.units['A:boss'].location = 'reserves'
    const { ctx } = ctxOf(s)
    expect(cardsRoundStart(ctx)).toBe(false)
    expect(s.cards!.tactics.A.hand).toHaveLength(3)
  })
})

// =====================================================================================================================
describe('STD-RA-2 Fearless Invaders: Effect.noRetreatDamage', () => {
  it('STD-RA-2 a granted noRetreatDamage effect waives the retreat damage of that unit only', () => {
    const s = dealt()
    const { ctx } = ctxOf(s)
    expect(unitIgnoresRetreatDamage(s, 'A:guard')).toBe(false)
    effectService.grant(ctx, 'A:guard', [{ chargeAfterFallBack: true }, { noRetreatDamage: true }], { sourceAbilityId: 'fx.a.order-regiment-1', sourceUnitId: null, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    expect(unitIgnoresRetreatDamage(s, 'A:guard')).toBe(true)
    expect(unitIgnoresRetreatDamage(s, 'A:knight')).toBe(false)
    // the same grant still lets the unit charge after retreating
    s.units['A:guard'].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor!(s, 'A:guard', 'charge')).toBe(true)
  })
})

// =====================================================================================================================
describe('STD-AB-4 Glorious Death: own-model-slain hook and after-fight mortal damage (attack.ts, fight.ts)', () => {
  const gloryBundle = () => bundleWith((b) => {
    b.abilities['fx.a.glory'] = ab('fx.a.glory', { code: 'testGlory' })
    b.datasheets['fx.guard'] = { ...b.datasheets['fx.guard'], abilities: ['fx.a.glory'] }
  })
  const slain: { unitId: string; kind: string; by: string | null }[] = []
  const glory: EngineCodeHook = {
    name: 'testGlory', kind: 'ability', hook: 'onModelDestroyed', run: noop,
    onOwnModelSlain(ctx, info) {
      slain.push({ unitId: info.unitId, kind: info.by.kind, by: info.by.unitId })
      if (info.by.kind === 'melee' && info.by.unitId) deferMortalAfterFight(ctx.state, { targetUnitId: info.by.unitId, count: 1, source: info.ability.id, player: ctx.state.units[info.unitId].player })
    },
  }

  it('STD-AB-4 fires for every slain model, the last one included, and holds the damage until drained', () => {
    register(glory)
    slain.length = 0
    const s = dealt(gloryBundle())
    const { ctx } = ctxOf(s)
    const guard = [...s.units['B:guard'].models]
    // 7 models slain by A's general in combat, then the last 3 as well (unit wiped)
    for (const id of guard) attackService.finishDestroy(ctx, id, { player: 'A', unitId: 'A:boss', modelId: s.units['A:boss'].models[0], kind: 'melee' })
    expect(s.units['B:guard'].location).toBe('destroyed')
    expect(slain.filter((x) => x.unitId === 'B:guard')).toHaveLength(10)
    expect(pendingAfterFightMortal(s)).toHaveLength(10)
    const boss = s.models[s.units['A:boss'].models[0]]
    const before = boss.woundsRemaining
    drainAfterFightMortal(ctx)
    expect(pendingAfterFightMortal(s)).toHaveLength(0)
    expect(s.units['A:boss'].location).toBe('destroyed') // 10 mortal damage on an 8-wound general
    void before
  })

  it('STD-AB-4 shooting and mortal kills report their kind; the hook decides (no damage held)', () => {
    register(glory)
    slain.length = 0
    const s = dealt(gloryBundle())
    const { ctx } = ctxOf(s)
    const [m1, m2] = s.units['B:guard'].models
    attackService.finishDestroy(ctx, m1, { player: 'A', unitId: 'A:knight', modelId: s.units['A:knight'].models[0], kind: 'ranged' })
    attackService.finishDestroy(ctx, m2, { player: 'A', unitId: 'A:knight', modelId: null, kind: 'mortal' })
    expect(slain.map((x) => x.kind)).toEqual(['ranged', 'mortal'])
    expect(pendingAfterFightMortal(s)).toHaveLength(0)
  })

  it('STD-AB-4 held damage lands on a 3-model unit after the fight and goes through the ward roll', () => {
    const s = dealt()
    const { ctx } = ctxOf(s, [6, 1]) // no ward on the fixture: dice unused
    deferMortalAfterFight(s, { targetUnitId: 'B:brute', count: 2, source: 'test', player: 'A' })
    drainAfterFightMortal(ctx)
    const wounds = unitModels(s, 'B:brute').reduce((a, m) => a + m.woundsRemaining, 0)
    expect(wounds).toBe(9 - 2)
  })
})

// =====================================================================================================================
describe('FYR-AB-1 / FYR-AB-2 Scope.wholly ("wholly within" auras)', () => {
  const auraBundle = (wholly: boolean) => bundleWith((b) => {
    b.abilities['fx.a.icon'] = ab('fx.a.icon', { effect: { modifyStat: { stat: 'OC', value: 3 } }, scope: { who: 'friendly', within: 6, ...(wholly ? { wholly: true as const } : {}) } })
    b.datasheets['fx.boss'] = { ...b.datasheets['fx.boss'], abilities: ['fx.a.icon'] }
  })
  const oc = (s: GameState, unitId: UnitId) => hookService.statFor(s, { unitId, modelId: null, weapon: null, stat: 'OC' }, 1)

  function auraGame(wholly: boolean): GameState {
    const s = dealt(auraBundle(wholly))
    put(s, 'A:boss', 0, -6)
    put(s, 'A:guard', -2.8, -3.5) // 2 rows of 5, all within 6" of the boss
    for (const [i, id] of ['B:boss', 'B:brute', 'B:hawk', 'B:guard'].entries()) put(s, id, -12 + i * 7, 9.5)
    put(s, 'A:knight', 10, -9)
    put(s, 'A:cannon', -12, -9)
    return s
  }

  it('FYR-AB-1 a wholly-within aura reaches a unit only while every model is wholly within range', () => {
    const s = auraGame(true)
    expect(oc(s, 'A:guard')).toBe(4)
    expect(oc(s, 'A:boss')).toBe(4) // the holder counts itself
    // one model steps out so that it is only partly within: nothing for the whole unit
    const last = s.models[s.units['A:guard'].models[9]]
    const boss = s.models[s.units['A:boss'].models[0]]
    setModelPos(last, { x: boss.pos.x + 6.3, y: 0, z: boss.pos.z }, 0)
    expect(horizontalGap(last, boss)).toBeLessThan(6)
    expect(oc(s, 'A:guard')).toBe(1)
    // a plain "within" aura still reaches it
    const t = auraGame(false)
    setModelPos(t.models[t.units['A:guard'].models[9]], { x: t.models[t.units['A:boss'].models[0]].pos.x + 6.3, y: 0, z: t.models[t.units['A:boss'].models[0]].pos.z }, 0)
    expect(oc(t, 'A:guard')).toBe(4)
  })

  it('FYR-AB-2 a granted (activated) aura with wholly travels with its holder and follows the same rule', () => {
    const s = dealt()
    put(s, 'A:boss', 0, -6)
    put(s, 'A:guard', -2.8, -3.5)
    const { ctx } = ctxOf(s)
    effectService.grant(ctx, 'A:boss', { modifyStat: { stat: 'OC', value: 2 } }, { sourceAbilityId: 'fx.a.order-regiment-1', sourceUnitId: 'A:boss', scope: { who: 'friendly', within: 6, wholly: true }, duration: 'untilEndOfTurn' })
    expect(effectService.activeFor(s, 'A:guard')).toHaveLength(1)
    expect(oc(s, 'A:guard')).toBe(3)
    put(s, 'A:boss', 12, -9)
    expect(effectService.activeFor(s, 'A:guard')).toHaveLength(0)
    expect(oc(s, 'A:guard')).toBe(1)
  })
})

// =====================================================================================================================
describe("FYR-AB-2 Plant the Icon: activation window in the opponent's hero phase", () => {
  it("FYR-AB-2 an 'any hero phase' ability is offered to the non-active player after the active player's window", () => {
    const used: PlayerId[] = []
    register({
      name: 'testPlant', kind: 'ability', hook: 'onAbilityDeclared', run: noop,
      activate: { canUse: () => true, resolve: (_ctx, use) => { used.push(use.player as PlayerId) } },
    })
    const s = dealt(bundleWith((b) => {
      b.abilities['fx.a.plant'] = ab('fx.a.plant', { trigger: 'activated', code: 'testPlant', timing: { kind: 'phase', phase: 'command', whose: 'any' }, limit: 'oncePerBattle' })
      b.datasheets['fx.hawk'] = { ...b.datasheets['fx.hawk'], abilities: ['fx.a.plant'] } // only B fields a Hawk
    }))
    expect(abilityService.usable(s, 'B', 'hero').map((u) => u.abilityId)).toContain('fx.a.plant')
    const { ctx } = ctxOf(s)
    commandModule.enter(ctx)
    expect(commandModule.advance(ctx)).toBe('pending')
    const p = s.pending as ChooseOptionDecision
    expect(p.player).toBe('B')
    expect(p.context.topic).toBe('abilityUse')
    answerWith(abilityService.handler, ctx, p.options[0].id)
    expect(commandModule.advance(ctx)).toBe('done') // once per battle: nothing left to offer
    expect(used).toEqual(['B'])
    expect(abilityService.usable(s, 'B', 'hero').map((u) => u.abilityId)).not.toContain('fx.a.plant')
  })
})

// =====================================================================================================================
describe('FYR-AB-3 Duty Unto Death: a code hook gives the general a Ward (adjustFeelNoPain)', () => {
  it("FYR-AB-3 the hook's ward reaches the general's unit wherever the source sits; the best ward wins", () => {
    let open = true
    register({
      name: 'testDuty', kind: 'ability', hook: 'onStatQuery', run: noop,
      adjustFeelNoPain(state, entry, modelId, current) {
        const holder = state.units[entry.holderUnitId]
        const general = state.players[holder.player].warlordUnitId
        if (!open || state.models[modelId]?.unitId !== general) return null
        return { threshold: Math.min(current ?? 7, 5), modifier: 0 }
      },
    })
    const dutyBundle = (bossWard?: number) => bundleWith((b) => {
      b.abilities['fx.a.duty'] = ab('fx.a.duty', { code: 'testDuty' })
      b.datasheets['fx.knight'] = { ...b.datasheets['fx.knight'], abilities: ['fx.a.duty'] } // only A fields a Knight
      if (bossWard) b.datasheets['fx.boss'] = { ...b.datasheets['fx.boss'], stats: { ...b.datasheets['fx.boss'].stats, ward: bossWard } }
    })
    const s = dealt(dutyBundle())
    const { ctx } = ctxOf(s)
    const general = s.models[s.units['A:boss'].models[0]]
    expect(feelNoPainFor(ctx, general.id, {} as never)?.threshold).toBe(5)
    expect(feelNoPainFor(ctx, s.units['A:guard'].models[0], {} as never)).toBeNull()
    expect(feelNoPainFor(ctx, s.units['B:boss'].models[0], {} as never)).toBeNull()
    open = false
    expect(feelNoPainFor(ctx, general.id, {} as never)).toBeNull()
    // FYR-WARD-1: with a better ward already present, the better one stays
    open = true
    const t = dealt(dutyBundle(4))
    const tctx = ctxOf(t).ctx
    expect(feelNoPainFor(tctx, t.units['A:boss'].models[0], {} as never)?.threshold).toBe(4)
  })
})

// =====================================================================================================================
describe('FYR-RA-1 Magmic Tunnels: start-of-round redeploy (redeploy.ts + abilities.ts)', () => {
  function tunnelGame(): GameState {
    const s = dealt()
    put(s, 'A:guard', -12, -9)
    put(s, 'A:knight', 0, -9)
    return s
  }

  it('FYR-RA-1 each lifted unit is set up again more than 6" from every enemy, coherent, keeping its effects', () => {
    const s = tunnelGame()
    const { ctx } = ctxOf(s)
    effectService.grant(ctx, 'A:guard', { modifyStat: { stat: 'OC', value: 1 } }, { sourceAbilityId: 'fx.a.order-regiment-1', sourceUnitId: null, scope: { who: 'self' }, duration: 'battle' })
    requestRedeploy(s, { abilityId: 'fx.a.order-regiment-1', player: 'A', unitIds: ['A:guard', 'A:knight', 'B:boss'], minEnemyDistance: 6 })
    expect(readRedeploy(s)?.unitIds).toEqual(['A:guard', 'A:knight']) // only own units on the board
    const before = unitModels(s, 'A:guard').map((m) => ({ ...m.pos }))
    expect(abilityService.runWindow(ctx, 'startOfRound', 'A')).toBe(true)
    let p = s.pending as ChooseOptionDecision
    expect(p.context.topic).toBe('abilityMode')
    expect(p.context.unitId).toBe('A:guard')
    expect(p.options.length).toBeGreaterThan(0)
    answerWith(abilityService.handler, ctx, p.options[0].id)
    const enemies = Object.values(s.models).filter((m) => s.units[m.unitId].player === 'B' && s.units[m.unitId].location === 'board')
    for (const m of unitModels(s, 'A:guard')) for (const e of enemies) expect(horizontalGap(m, e)).toBeGreaterThan(6)
    expect(isCoherent(unitModels(s, 'A:guard'), s.datasheets['fx.guard'].coherencyRange)).toBe(true)
    expect(unitModels(s, 'A:guard').map((m) => m.pos)).not.toEqual(before)
    expect(s.units['A:guard'].effects).toHaveLength(1)
    expect(s.units['A:guard'].setUpTurn).toBeNull()
    // the second unit: pass keeps it where it is
    expect(abilityService.runWindow(ctx, 'startOfRound', 'A')).toBe(true)
    p = s.pending as ChooseOptionDecision
    expect(p.context.unitId).toBe('A:knight')
    const knightAt = { ...unitModels(s, 'A:knight')[0].pos }
    answerWith(abilityService.handler, ctx, null)
    expect(unitModels(s, 'A:knight')[0].pos).toEqual(knightAt)
    expect(abilityService.runWindow(ctx, 'startOfRound', 'A')).toBe(false)
    expect(readRedeploy(s)).toBeNull()
  })

  it('FYR-RA-1 the shared set-up validator rejects a spot within 6" of an enemy and accepts the unit over its own old spot', () => {
    const s = tunnelGame()
    const enemy = s.models[s.units['B:boss'].models[0]]
    const knight = unitModels(s, 'A:knight')[0]
    const near = resolveSetUp(s, 'A:knight', [{ modelId: knight.id, pos: { x: enemy.pos.x, y: 0, z: enemy.pos.z - 6 }, facing: 0 }], { minEnemyDistance: 6, anywhere: true })
    expect(near.rejection).not.toBeNull()
    const same = resolveSetUp(s, 'A:knight', [{ modelId: knight.id, pos: { ...knight.pos }, facing: knight.facing }], { minEnemyDistance: 6, anywhere: true })
    expect(same.rejection).toBeNull()
  })
})

// =====================================================================================================================
describe('STD-ENH-3 / STD-AB-2 ability re-rolls of charge and run rolls (rerolls.ts)', () => {
  it('STD-ENH-3 a granted { reroll: all } gated to onChargeRoll re-rolls a short charge roll, never a good one', () => {
    register({ name: 'testRaids', kind: 'ability', hook: 'onChargeRoll', run: noop, hooks: ['onChargeRoll'] })
    const s = dealt(bundleWith((b) => {
      b.abilities['fx.a.raids'] = ab('fx.a.raids', { code: 'testRaids' })
      b.datasheets['fx.cannon'] = { ...b.datasheets['fx.cannon'], abilities: ['fx.a.raids'] }
    }))
    const { ctx } = ctxOf(s, [1, 2, 6, 5, 4, 4])
    const data = { chargingUnitId: 'A:guard', targetUnitIds: [] }
    const roll1 = ctx.roll({ purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId: 'A:guard' })
    expect(applyAbilityRerolls(ctx, 'onChargeRoll', data, roll1, 8)).toBe(roll1) // no source yet
    effectService.grant(ctx, 'A:guard', { reroll: 'all' }, { sourceAbilityId: 'fx.a.raids', sourceUnitId: 'A:boss', scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    expect(rollSum(applyAbilityRerolls(ctx, 'onChargeRoll', data, roll1, 8))).toBe(11)
    const roll2 = ctx.roll({ purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId: 'A:guard' })
    expect(applyAbilityRerolls(ctx, 'onChargeRoll', data, roll2, 8)).toBe(roll2) // 4+4 already makes it
    // another unit's short charge is not affected (scope self)
    expect(applyAbilityRerolls(ctx, 'onChargeRoll', { chargingUnitId: 'A:knight', targetUnitIds: [] }, roll2, 12)).toBe(roll2)
  })

  it('STD-AB-2 a produce hook at onAdvanceRoll re-rolls one low run die and is only asked for a low roll', () => {
    let asked = 0
    register({
      name: 'testVisions', kind: 'ability', hook: 'onStatQuery', run: noop, producesAt: ['onAdvanceRoll'],
      produce(_ctx, entry, data) {
        if (data.movingUnitId !== entry.holderUnitId) return null
        asked++
        return { kind: 'roll', reroll: 'oneDie' }
      },
    })
    const s = dealt(bundleWith((b) => {
      b.abilities['fx.a.visions'] = ab('fx.a.visions', { code: 'testVisions' })
      b.datasheets['fx.cannon'] = { ...b.datasheets['fx.cannon'], abilities: ['fx.a.visions'] }
    }))
    const { ctx } = ctxOf(s, [2, 5, 6])
    effectService.grant(ctx, 'A:guard', {}, { sourceAbilityId: 'fx.a.visions', sourceUnitId: 'A:guard', scope: { who: 'self' }, duration: 'untilNextTurn' })
    const low = ctx.roll({ purpose: 'advance', player: 'A', sides: 6, count: 1, mode: 'sum', unitId: 'A:guard' })
    expect(rollSum(applyAbilityRerolls(ctx, 'onAdvanceRoll', { movingUnitId: 'A:guard' }, low, 4))).toBe(5)
    const high = ctx.roll({ purpose: 'advance', player: 'A', sides: 6, count: 1, mode: 'sum', unitId: 'A:guard' })
    applyAbilityRerolls(ctx, 'onAdvanceRoll', { movingUnitId: 'A:guard' }, high, 4)
    expect(asked).toBe(1)
  })
})

// =====================================================================================================================
describe('SIM-ARMIES data-driven army list', () => {
  it('SIM-ARMIES the sim pairs every Spearhead army in the bundle and cycles the pairings', () => {
    const b = withAosBundle((x) => {
      const third = structuredClone(x.patrols['fx.chaos.army'])
      x.patrols['fx.third.army'] = { ...third, id: 'fx.third.army', faction: 'fx.chaos' }
    })
    const pairs = simPairings(b)
    expect(pairs).toHaveLength(3)
    const seen = new Set<string>()
    for (let g = 0; g < 12; g++) {
      const setup = makeSimSetup(b, g, 'fx-1')
      seen.add([setup.players.A.patrolId, setup.players.B.patrolId].sort().join('|'))
    }
    expect(seen.size).toBe(3)
    // two armies: unchanged alternation (game 0 / game 1 swap seats)
    expect(simPairings(aosBundle)).toEqual([['fx.chaos.army', 'fx.order.army']])
    expect(makeSimSetup(aosBundle, 0, 'fx-1').players.A.patrolId).toBe('fx.chaos.army')
    expect(makeSimSetup(aosBundle, 1, 'fx-1').players.A.patrolId).toBe('fx.order.army')
    expect(simPairings(b, ['fx.order.army', 'fx.third.army'])).toEqual([['fx.order.army', 'fx.third.army']])
  })
})
