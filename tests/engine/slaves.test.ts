// Slaves to Darkness (Darkoath Raiders) code hooks and rules: docs/spec/factions/slaves-to-darkness.md (STD-*).
// The descriptors, warscrolls and weapons are the real src/data/factions/slaves files on top of the AoS fixture bundle (the enemy
// is the fixture Chaos army), with the Fire and Jade battle tactic deck so the card rules (Oaths, Fell Ritualist) run for real.
import { describe, expect, it } from 'vitest'
import deckJson from '../../src/data/cards/fire-and-jade.json'
import {
  DEFAULT_MODULES, ScriptedRng, SeededRng, abilityService, createContext, unitModels, view,
  type AbilityWindow, type AttackContext, type ChooseOptionDecision, type EngineContext, type GameEvent, type GameState, type PlayerId, type UnitId,
} from '../../src/engine'
import { attackService, deferMortalAfterFight, drainAfterFightMortal, feelNoPainFor, pendingAfterFightMortal } from '../../src/engine/attack'
import { cardHandler, cardsRoundStart, commandWindow, expireCardFlags, fulfilledOf, oathOf, scoreTacticsStep, tacticMet } from '../../src/engine/cards'
import { codeHooks } from '../../src/engine/code-hooks'
import { effectService } from '../../src/engine/effects'
import { hookService } from '../../src/engine/hooks-impl'
import { unitIgnoresRetreatDamage } from '../../src/engine/phases/movement'
import { applyAbilityRerolls } from '../../src/engine/rerolls'
import { weaponService } from '../../src/engine/weapons'
import { whollyWithinUnit } from '../../src/engine/factions/aos-common'
import type { AbilityDescriptor, CardDeckData, DataBundle, DatasheetData, EnhancementData, FactionData, WeaponData } from '../../src/data/types'
import { aosState, makeAosPlayer, withAosBundle } from '../fixtures'
import abilitiesJson from '../../src/data/factions/slaves/abilities.json'
import enhancementsJson from '../../src/data/factions/slaves/enhancements.json'
import weaponsJson from '../../src/data/factions/slaves/weapons.json'
import factionJson from '../../src/data/factions/slaves/faction.json'
import patrolJson from '../../src/data/factions/slaves/patrols/darkoath-raiders.json'
import warqueenJson from '../../src/data/factions/slaves/datasheets/darkoath-warqueen.json'
import savagersJson from '../../src/data/factions/slaves/datasheets/darkoath-savagers.json'
import fellridersJson from '../../src/data/factions/slaves/datasheets/darkoath-fellriders.json'
import maraudersJson from '../../src/data/factions/slaves/datasheets/darkoath-marauders.json'

// ---------- fixtures ----------
const deck = deckJson as CardDeckData

const bundle = (): DataBundle => withAosBundle((b) => {
  // the Fire and Jade deck with a pick-free twist every round (as engine-f6.test.ts does)
  const twist = deck.twists.find((t) => t.id === 'card.twist.take-the-land') as CardDeckData['twists'][number]
  b.cardDecks = { 'rbf.fire-and-jade': { ...deck, twists: [1, 2, 3, 4].map(() => ({ ...twist, side: 'aqshy' })) } }
  for (const a of abilitiesJson as unknown as AbilityDescriptor[]) b.abilities[a.id] = a
  for (const w of weaponsJson as unknown as WeaponData[]) b.weapons[w.id] = w
  for (const d of [warqueenJson, savagersJson, fellridersJson, maraudersJson].flat() as unknown as DatasheetData[]) b.datasheets[d.id] = d
  for (const e of enhancementsJson as unknown as EnhancementData[]) b.enhancements[e.id] = e
  b.factions.slaves = factionJson as unknown as FactionData
  b.patrols[patrolJson.id] = patrolJson as unknown as DataBundle['patrols'][string]
})

const BLADE = 'slaves.enh.bloodthirsty-blade'
const TALISMAN = 'slaves.enh.godshadow-talisman'
const CHAMPION = 'slaves.enh.champion-of-raids'
const RITUALIST = 'slaves.enh.fell-ritualist'
const RAGE = 'slaves.ability.rage-of-arkhar'
const INVADERS = 'slaves.ability.fearless-invaders'
const OATHS = 'slaves.ability.oaths-of-darkness'
const SUPREMACY = 'slaves.ability.oath-of-supremacy'
const VISIONS = 'slaves.ability.visions-of-glory'
const CHAMPION_AB = 'slaves.ability.champion-of-raids'
const AXE = 'slaves.weapon.rune-etched-axe'
const DARKOATH = 'slaves.weapon.darkoath-weapons'
const BLADES = 'slaves.weapon.fellrider-blades'
const HOOVES = 'slaves.weapon.warsteeds-hooves'
const RAIDER = 'slaves.weapon.raider-weapons'
const RAID = 'card.tactic.raid'
const WAR = 'card.tactic.war-of-attrition'
const HOLD = 'card.tactic.hold-ground'

function game(enhancementId = BLADE, regimentAbilityId = RAGE): GameState {
  const s = aosState({
    players: {
      A: makeAosPlayer('A', { faction: 'slaves', patrolId: 'slaves.army.darkoath-raiders', enhancementId, regimentAbilityId }),
      B: makeAosPlayer('B'),
    },
  }, bundle())
  // bystanders go along the back edges, clear of the middle where the tests work
  for (const p of ['A', 'B'] as const) {
    const sign = p === 'A' ? -1 : 1
    let x = -14.5, row = 0
    for (const u of Object.values(s.units).filter((u) => u.player === p)) {
      const width = u.models.length * (2 * Math.max(...unitModels(s, u.id).map((m) => Math.max(m.base.radius, m.base.radius2 ?? 0))) + 0.15)
      if (x + width > 14.5) { x = -14.5; row++ }
      place(s, u.id, x, sign * (10.2 - 2.2 * row))
      x += width + 0.3
    }
  }
  s.round = 1
  s.phase = 'command'
  s.activePlayer = 'A'
  s.firstPlayer = 'A'
  return s
}

// lay a unit's models in a row along x starting at (x, z); bases never overlap
function place(s: GameState, unitId: UnitId, x: number, z: number): void {
  s.units[unitId].location = 'board'
  let cx = x
  for (const m of unitModels(s, unitId)) {
    const r = Math.max(m.base.radius, m.base.radius2 ?? 0)
    m.pos = { x: cx + r, y: 0, z }
    cx += 2 * r + 0.15
  }
}

// two units face to face, a little over 1" apart (in combat)
function engage(s: GameState, mine: UnitId, theirs: UnitId, x = -5, z = 0): void {
  place(s, mine, x, z - 1.2)
  place(s, theirs, x, z + 1.2)
}

// scripted dice when given (rng.remaining says what is left), otherwise a seeded rng (shuffles, free rolls)
function ctxFor(s: GameState, dice?: number[]): { ctx: EngineContext; events: GameEvent[]; rng: { remaining: number[] } } {
  const rng = dice ? new ScriptedRng(dice) : new SeededRng('slaves')
  const { ctx, events } = createContext(s, rng, DEFAULT_MODULES)
  return { ctx, events, rng: { get remaining() { return dice ? (rng as ScriptedRng).remaining : [] } } }
}

function runWindow(ctx: EngineContext, window: AbilityWindow, player: PlayerId, pick: (topic: string, ids: string[]) => string): string[] {
  const topics: string[] = []
  for (let i = 0; i < 20; i++) {
    if (!abilityService.runWindow(ctx, window, player)) return topics
    const p = ctx.state.pending as ChooseOptionDecision
    topics.push(p.context.topic)
    const choice = pick(p.context.topic, p.options.map((o) => o.id))
    ctx.state.pending = null
    const action = choice === 'pass' ? { type: 'pass' as const, player, decisionId: p.id } : { type: 'chooseOption' as const, player, decisionId: p.id, optionId: choice }
    const rej = abilityService.handler.handle(ctx, action, p)
    if (rej) throw new Error(`rejected: ${rej.reason}`)
  }
  throw new Error('window did not settle')
}

// use `abilityId` once (picking its target / mode), pass on everything else the window offers
function useOnce(ctx: EngineContext, window: AbilityWindow, player: PlayerId, abilityId: string, opts: { target?: string; mode?: string } = {}): string[] {
  let used = false
  return runWindow(ctx, window, player, (topic, ids) => {
    if (topic === 'abilityUse') {
      const hit = used ? undefined : ids.find((id) => id.startsWith(abilityId))
      used = true
      return hit ?? 'pass'
    }
    if (topic === 'abilityTarget') return opts.target ?? ids[0]
    if (topic === 'abilityMode') return opts.mode ?? ids[0]
    return ids[0]
  })
}

// army-level abilities get the player as a third argument (abilities.ts ExtHook)
const targetsFor = (code: string, s: GameState, unitId: UnitId | null, player: PlayerId): UnitId[] =>
  (codeHooks[code].activate!.targets as unknown as (state: GameState, unitId: UnitId | null, player: PlayerId) => UnitId[])(s, unitId, player)

const usableIds = (s: GameState, player: PlayerId, window: AbilityWindow): string[] => abilityService.usable(s, player, window).map((u) => u.abilityId)
const weapon = (s: GameState, unitId: UnitId, weaponId: string, modelIndex = 0) => weaponService.effectiveWeapon(s, s.units[unitId].models[modelIndex], weaponId)

function attackOf(s: GameState, attackerUnitId: UnitId, targetUnitId: UnitId, kind: 'melee' | 'ranged', weaponId: string): AttackContext {
  return {
    kind, overwatch: false, attackerUnitId, attackerModelId: s.units[attackerUnitId].models[0], weapon: s.weapons[weaponId],
    targetUnitId, targetModelId: s.units[targetUnitId].models[0], range: 0, halfRange: false, inCover: false, charged: false, oathTarget: false, attackerInEngagement: true,
  }
}

// the sum of roll modifiers the hit-roll hooks give this attack (a die of 3 is rolled and thrown away)
function hitModifier(s: GameState, attack: AttackContext): number {
  const { ctx } = ctxFor(s, [3])
  const roll = ctx.roll({ purpose: 'hit', player: s.units[attack.attackerUnitId].player, unitId: attack.attackerUnitId })
  return hookService.collect(ctx, 'onHitRoll', { attack, roll: { purpose: 'hit', roll, dieIndex: 0, unmodified: roll.dice[0], rerolled: false } })
    .reduce((n, r) => n + (r.result.kind === 'roll' ? r.result.modifier ?? 0 : 0), 0)
}

const topicOf = (s: GameState): string | null => (s.pending?.kind === 'chooseOption' ? (s.pending as ChooseOptionDecision).context.topic : null)
function answer(ctx: EngineContext, optionId: string | null): void {
  const pending = ctx.state.pending as ChooseOptionDecision
  ctx.state.pending = null
  const action = optionId === null
    ? { type: 'pass' as const, player: pending.player, decisionId: pending.id }
    : { type: 'chooseOption' as const, player: pending.player, decisionId: pending.id, optionId }
  const rej = cardHandler.handle(ctx, action, pending)
  if (rej) throw new Error(rej.reason)
}

// ---------- tests ----------
describe('STD-REG registry', () => {
  it('STD-REG every code in the Slaves to Darkness data resolves to a hook, activated ones with an activate block', () => {
    for (const a of abilitiesJson as unknown as AbilityDescriptor[]) {
      if (!a.code) continue
      const hook = codeHooks[a.code]
      expect(hook, `${a.id} -> ${a.code}`).toBeDefined()
      if (a.trigger === 'activated') expect(hook.activate, `${a.code} has no activate`).toBeDefined()
    }
  })
})

describe('STD-BT-1 Oaths of Darkness', () => {
  // A has a unit wholly in B's half and out of combat (Raid is met), another card that is not
  function oathGame(): GameState {
    const s = game()
    place(s, 'A:marauders', -6, 5)
    place(s, 'B:boss', 10, 9)
    place(s, 'B:brute', -12, 9)
    s.cards!.tactics.A.hand = [HOLD, RAID, WAR]
    return s
  }

  it('STD-BT-1 swearing: the hero-phase mode list puts the likeliest card first, the oath is public, the other cards stay hidden', () => {
    const s = oathGame()
    expect(tacticMet(s, 'A', RAID)).toBe(true)
    const modes = codeHooks.slavesOathsOfDarkness.activate as unknown as { modesFor(state: GameState, unitId: null, player: PlayerId): { id: string }[] }
    expect(modes.modesFor(s, null, 'A')[0].id).toBe(RAID)
    const { ctx, events } = ctxFor(s)
    useOnce(ctx, 'hero', 'A', OATHS, { mode: RAID })
    expect(oathOf(s, 'A')).toBe(RAID)
    expect(events.some((e) => e.type === 'AbilityTriggered' && (e as { abilityId?: string }).abilityId === OATHS)).toBe(true)
    const seen = view(s, 'B').state.cards!.tactics.A
    expect(seen.hand).toContain(RAID)
    expect(seen.hand.filter((id) => id.startsWith('hidden:'))).toHaveLength(2)
    expect(seen.oath).toBe(RAID)
  })

  it('STD-BT-1 once per turn for the army: used, it is not offered again until the next turn', () => {
    const s = oathGame()
    expect(usableIds(s, 'A', 'hero')).toContain(OATHS)
    const { ctx } = ctxFor(s)
    useOnce(ctx, 'hero', 'A', OATHS, { mode: HOLD })
    expect(usableIds(s, 'A', 'hero')).not.toContain(OATHS)
    s.round = 2
    expect(usableIds(s, 'A', 'hero')).toContain(OATHS)
    // nothing to swear on with an empty hand
    s.cards!.tactics.A.hand = []
    expect(usableIds(s, 'A', 'hero')).not.toContain(OATHS)
  })

  it('STD-BT-1 a scored oath scores its VP and is fulfilled: set aside outside the hand, not discarded', () => {
    const s = oathGame()
    const { ctx } = ctxFor(s)
    useOnce(ctx, 'hero', 'A', OATHS, { mode: RAID })
    expect(scoreTacticsStep(ctx)).toBe(true)
    answer(ctx, `score:${RAID}`)
    expect(s.players.A.vp).toBe(1)
    expect(fulfilledOf(s, 'A')).toEqual([RAID])
    expect(s.cards!.tactics.A.scored).toContain(RAID)
    expect(s.cards!.tactics.A.hand).toEqual([HOLD, WAR])
    expect(s.cards!.tactics.A.discard).not.toContain(RAID)
    expect(oathOf(s, 'A')).toBeNull()
  })

  it('STD-BT-1 a fulfilled card does not count against the hand of 3 when drawing', () => {
    const s = oathGame()
    const { ctx } = ctxFor(s)
    cardsRoundStart(ctx) // the round 1 deal shuffles the decks and fills both hands
    while (s.pending) answer(ctx, null)
    s.cards!.tactics.A.hand = [HOLD, RAID, WAR]
    useOnce(ctx, 'hero', 'A', OATHS, { mode: RAID })
    expect(scoreTacticsStep(ctx)).toBe(true)
    answer(ctx, `score:${RAID}`)
    expect(s.cards!.tactics.A.hand).toHaveLength(2)
    s.round = 2
    s.cards!.discardDone.A = 2
    s.cards!.drawRound.B = 2
    const before = s.cards!.tactics.A.deck.length
    cardsRoundStart(ctx)
    while (s.pending) answer(ctx, null)
    expect(s.cards!.tactics.A.hand).toHaveLength(3)
    expect(s.cards!.tactics.A.fulfilled).toEqual([RAID])
    expect(s.cards!.tactics.A.deck).toHaveLength(before - 1)
  })

  it("STD-BT-1 a fulfilled oath's command stays usable later, then the card is discarded", () => {
    const s = oathGame()
    s.cards!.tactics.A.hand = []
    s.cards!.tactics.A.fulfilled = [WAR]
    s.activePlayer = 'B' // War of Attrition's command is used in the enemy hero phase
    const { ctx } = ctxFor(s)
    expect(commandWindow(ctx, 'hero', 'A')).toBe(true)
    const opt = (s.pending as ChooseOptionDecision).options.find((o) => o.id.startsWith(`${WAR}|`)) as { id: string }
    answer(ctx, opt.id)
    expect(fulfilledOf(s, 'A')).toEqual([])
    expect(s.cards!.tactics.A.discard).toContain(WAR)
  })

  it("STD-BT-1 using the oath's command before scoring discards it and ends the oath", () => {
    const s = oathGame()
    s.activePlayer = 'B'
    s.cards!.tactics.A.hand = [WAR, HOLD]
    // the hook sets the oath in A's own hero phase; here it is A's card in B's turn, so set it the way the hook does
    const { ctx } = ctxFor(s)
    s.activePlayer = 'A'
    useOnce(ctx, 'hero', 'A', OATHS, { mode: WAR })
    expect(oathOf(s, 'A')).toBe(WAR)
    s.activePlayer = 'B'
    expect(commandWindow(ctx, 'hero', 'A')).toBe(true)
    const opt = (s.pending as ChooseOptionDecision).options.find((o) => o.id.startsWith(`${WAR}|`)) as { id: string }
    answer(ctx, opt.id)
    expect(s.cards!.tactics.A.discard).toContain(WAR)
    expect(fulfilledOf(s, 'A')).toEqual([])
    expect(oathOf(s, 'A')).toBeNull()
  })

  it('STD-BT-1 an oath not fulfilled this turn stops being the oath at the end of the turn; the card stays in hand', () => {
    const s = oathGame()
    const { ctx } = ctxFor(s)
    useOnce(ctx, 'hero', 'A', OATHS, { mode: HOLD })
    expect(oathOf(s, 'A')).toBe(HOLD)
    expireCardFlags(s, 'turn')
    expect(oathOf(s, 'A')).toBeNull()
    expect(s.cards!.tactics.A.hand).toContain(HOLD)
  })
})

describe('STD-RA-1 Rage of Arkhar', () => {
  it('STD-RA-1 +1 Attacks and +1 Rend on the target\'s melee weapons; Companion weapons are untouched; other units too', () => {
    const s = game(RITUALIST)
    engage(s, 'A:fellriders', 'B:guard')
    place(s, 'A:marauders', -12, -7)
    const { ctx } = ctxFor(s)
    expect(weapon(s, 'A:fellriders', BLADES).A).toBe(2)
    useOnce(ctx, 'fight', 'A', RAGE, { target: 'A:fellriders' })
    expect(weapon(s, 'A:fellriders', BLADES)).toMatchObject({ A: 3, rend: 1 })
    expect(weapon(s, 'A:fellriders', HOOVES)).toMatchObject({ A: 2, rend: 0 })
    expect(weapon(s, 'A:marauders', RAIDER)).toMatchObject({ A: 2, rend: 0 })
  })

  it('STD-RA-1 only a unit in combat can be picked, and nothing is offered when no friendly unit is in combat', () => {
    const s = game(RITUALIST)
    expect(usableIds(s, 'A', 'fight')).not.toContain(RAGE)
    engage(s, 'A:marauders', 'B:guard')
    expect(usableIds(s, 'A', 'fight')).toContain(RAGE)
    expect(targetsFor('slavesRageOfArkhar', s, null, 'A')).toEqual(['A:marauders'])
  })

  it('STD-RA-1 expires at the end of the turn, can be used in the enemy combat phase, and only once per turn (army)', () => {
    const s = game(RITUALIST)
    engage(s, 'A:marauders', 'B:guard')
    place(s, 'A:savagers', 5, -1.2)
    place(s, 'B:brute', 5, 1.2)
    s.activePlayer = 'B' // the enemy's combat phase: the ability is "any combat phase"
    const { ctx } = ctxFor(s)
    useOnce(ctx, 'fight', 'A', RAGE, { target: 'A:marauders' })
    expect(weapon(s, 'A:marauders', RAIDER).A).toBe(3)
    expect(weapon(s, 'A:savagers', DARKOATH).A).toBe(2)
    expect(usableIds(s, 'A', 'fight')).not.toContain(RAGE)
    effectService.expire(ctx, 'turnEnd', null)
    expect(weapon(s, 'A:marauders', RAIDER).A).toBe(2)
    s.round = 2
    expect(usableIds(s, 'A', 'fight')).toContain(RAGE)
  })
})

describe('STD-RA-2 Fearless Invaders', () => {
  const invadersGame = () => {
    const s = game(RITUALIST, INVADERS)
    engage(s, 'A:marauders', 'B:guard')
    place(s, 'A:savagers', 9, -6) // not in combat
    return s
  }

  it('STD-RA-2 only units in combat can be targeted (movement phase of your own turn)', () => {
    const s = invadersGame()
    expect(usableIds(s, 'A', 'movement')).toContain(INVADERS)
    expect(targetsFor('slavesFearlessInvaders', s, null, 'A')).toEqual(['A:marauders'])
    place(s, 'A:marauders', -5, -6)
    expect(usableIds(s, 'A', 'movement')).not.toContain(INVADERS)
  })

  it('STD-RA-2 the target retreats without mortal damage and may still charge; units that were not targeted still take the damage', () => {
    const s = invadersGame()
    const { ctx } = ctxFor(s)
    expect(unitIgnoresRetreatDamage(s, 'A:marauders')).toBe(false)
    useOnce(ctx, 'movement', 'A', INVADERS, { target: 'A:marauders' })
    expect(unitIgnoresRetreatDamage(s, 'A:marauders')).toBe(true)
    expect(unitIgnoresRetreatDamage(s, 'A:savagers')).toBe(false)
    expect(unitIgnoresRetreatDamage(s, 'A:fellriders')).toBe(false)
    s.units['A:marauders'].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor!(s, 'A:marauders', 'charge')).toBe(true)
    s.units['A:savagers'].turn.moveType = 'fallBack'
    expect(hookService.eligibilityFor!(s, 'A:savagers', 'charge')).not.toBe(true)
    effectService.expire(ctx, 'turnEnd', null)
    expect(unitIgnoresRetreatDamage(s, 'A:marauders')).toBe(false)
  })
})

describe('STD-ENH-1 Bloodthirsty Blade', () => {
  it('STD-ENH-1 the general\'s Rune-etched Axe has Rend 2 (printed 1); with Rage of Arkhar it is 3; nobody else gains it', () => {
    const s = game(BLADE)
    expect(s.weapons[AXE].rend).toBe(1)
    expect(weapon(s, 'A:warqueen', AXE).rend).toBe(2)
    expect(weapon(s, 'A:marauders', RAIDER).rend).toBe(0)
    engage(s, 'A:warqueen', 'B:guard')
    const { ctx } = ctxFor(s)
    useOnce(ctx, 'fight', 'A', RAGE, { target: 'A:warqueen' })
    expect(weapon(s, 'A:warqueen', AXE)).toMatchObject({ rend: 3, A: 6 })
    // without the enhancement the axe keeps its printed Rend
    expect(weapon(game(TALISMAN), 'A:warqueen', AXE).rend).toBe(1)
  })
})

describe('STD-ENH-2 Godshadow Talisman', () => {
  it('STD-ENH-2 the general wards on 4+ (better than the printed 5+); without it, 5+; other units have no ward', () => {
    const s = game(TALISMAN)
    const { ctx } = ctxFor(s)
    const queen = s.units['A:warqueen'].models[0]
    expect(feelNoPainFor(ctx, queen, {} as never)?.threshold).toBe(4)
    expect(feelNoPainFor(ctx, s.units['A:marauders'].models[0], {} as never)).toBeNull()
    const plain = game(BLADE)
    expect(feelNoPainFor(ctxFor(plain).ctx, plain.units['A:warqueen'].models[0], {} as never)?.threshold).toBe(5)
  })
})

describe('STD-ENH-3 Champion of Raids', () => {
  const championGame = () => {
    const s = game(CHAMPION)
    s.phase = 'charge'
    place(s, 'A:warqueen', -4, -6)
    place(s, 'A:marauders', -9, -6) // wholly within 12"
    place(s, 'A:savagers', 2, -6) // spills beyond 12" of the general
    place(s, 'A:fellriders', 9, -6)
    return s
  }

  it('STD-ENH-3 offers another friendly unit wholly within 12" of the general: never herself, nothing beyond 12"', () => {
    const s = championGame()
    const targets = codeHooks.slavesChampionOfRaids.activate!.targets!(s, 'A:warqueen')
    expect(targets).toContain('A:marauders')
    expect(targets).not.toContain('A:warqueen')
    expect(whollyWithinUnit(s, 'A:fellriders', 'A:warqueen', 12)).toBe(false)
    expect(targets).not.toContain('A:fellriders')
    expect(targets.every((id) => whollyWithinUnit(s, id, 'A:warqueen', 12))).toBe(true)
  })

  it('STD-ENH-3 the target re-rolls a short charge roll for the rest of the turn (and a good roll is never re-rolled)', () => {
    const s = championGame()
    const { ctx } = ctxFor(s, [1, 2, 6, 5, 4, 4])
    const data = { chargingUnitId: 'A:marauders', targetUnitIds: [] }
    const short = ctx.roll({ purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId: 'A:marauders' })
    expect(applyAbilityRerolls(ctx, 'onChargeRoll', data, short, 8)).toBe(short) // not granted yet
    useOnce(ctx, 'charge', 'A', CHAMPION_AB, { target: 'A:marauders' })
    const redone = applyAbilityRerolls(ctx, 'onChargeRoll', data, short, 8)
    expect(redone).not.toBe(short)
    expect(redone.dice).toEqual([6, 5])
    const good = ctx.roll({ purpose: 'charge', player: 'A', sides: 6, count: 2, mode: 'sum', unitId: 'A:marauders' })
    expect(applyAbilityRerolls(ctx, 'onChargeRoll', data, good, 8)).toBe(good)
    // another unit has no re-roll
    expect(applyAbilityRerolls(ctx, 'onChargeRoll', { chargingUnitId: 'A:savagers', targetUnitIds: [] }, short, 8)).toBe(short)
    effectService.expire(ctx, 'turnEnd', null)
    expect(applyAbilityRerolls(ctx, 'onChargeRoll', data, short, 8)).toBe(short)
  })
})

describe('STD-ENH-4 Fell Ritualist', () => {
  it('STD-ENH-4 after the draw: the player may draw 1 more, then puts 1 card on the bottom of the deck; the opponent draws normally', () => {
    const s = game(RITUALIST)
    const { ctx } = ctxFor(s)
    expect(cardsRoundStart(ctx)).toBe(true)
    expect(topicOf(s)).toBe('extraTactic')
    expect(s.cards!.tactics.A.hand).toHaveLength(3)
    answer(ctx, 'draw')
    expect(s.cards!.tactics.A.hand).toHaveLength(4)
    expect(cardsRoundStart(ctx)).toBe(true)
    expect(topicOf(s)).toBe('bottomTactic')
    const back = s.cards!.tactics.A.hand[1]
    answer(ctx, `bottom:${back}`)
    expect(cardsRoundStart(ctx)).toBe(false)
    const a = s.cards!.tactics.A
    expect(a.hand).toHaveLength(3)
    expect(a.deck[a.deck.length - 1]).toBe(back)
    expect(s.cards!.tactics.B.hand).toHaveLength(3)
  })

  it('STD-ENH-4 it happens on every draw, may be declined, and is skipped while the general is off the battlefield', () => {
    const s = game(RITUALIST)
    const { ctx } = ctxFor(s)
    cardsRoundStart(ctx)
    answer(ctx, null) // decline
    expect(cardsRoundStart(ctx)).toBe(false)
    expect(s.cards!.tactics.A.hand).toHaveLength(3)
    // the next round's draw asks again
    s.round = 2
    s.cards!.discardDone.A = 2
    s.cards!.drawRound.B = 2
    s.cards!.tactics.A.hand = s.cards!.tactics.A.hand.slice(0, 1)
    cardsRoundStart(ctx)
    expect(topicOf(s)).toBe('extraTactic')
    answer(ctx, null)
    // general off the table: no offer
    const t = game(RITUALIST)
    t.units['A:warqueen'].location = 'reserves'
    expect(cardsRoundStart(ctxFor(t).ctx)).toBe(false)
    expect(t.cards!.tactics.A.hand).toHaveLength(3)
  })
})

describe('STD-AB-1 Oath of Supremacy', () => {
  const supremacyGame = () => {
    const s = game(RITUALIST)
    place(s, 'A:warqueen', -4, -6)
    place(s, 'A:marauders', -9, -6)
    place(s, 'A:fellriders', 9, -6) // out of range
    place(s, 'B:guard', -4, 1)
    return s
  }

  it('STD-AB-1 targets are friendly units wholly within 12" of the general, herself included', () => {
    const s = supremacyGame()
    const targets = codeHooks.slavesOathOfSupremacy.activate!.targets!(s, 'A:warqueen')
    expect(targets).toContain('A:warqueen')
    expect(targets).toContain('A:marauders')
    expect(targets).not.toContain('A:fellriders')
    expect(targets).not.toContain('B:guard')
  })

  it('STD-AB-1 +1 to hit rolls for the target\'s attacks until the start of your next turn; nobody else gets it', () => {
    const s = supremacyGame()
    const { ctx } = ctxFor(s)
    const hit = (id: UnitId) => hitModifier(s, attackOf(s, id, 'B:guard', 'melee', id === 'A:marauders' ? RAIDER : AXE))
    expect(hit('A:marauders')).toBe(0)
    useOnce(ctx, 'hero', 'A', SUPREMACY, { target: 'A:marauders' })
    expect(hit('A:marauders')).toBe(1)
    expect(hit('A:warqueen')).toBe(0)
    // the enemy's attacks against the target are not changed
    expect(hitModifier(s, attackOf(s, 'B:guard', 'A:marauders', 'melee', 'fx.w.guard-spear'))).toBe(0)
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(hit('A:marauders')).toBe(0)
  })
})

describe('STD-AB-2 Visions of Glory', () => {
  const godspeaker = (s: GameState) => s.units['A:savagers'].models.find((id) => s.models[id].datasheetModelId === 'godspeaker') as string
  const ledger = (s: GameState) => Object.values((s.mission.custom.visions ?? {}) as Record<string, { left: number }>)[0]

  // a hit roll of the given dice (3 needs 4+) as the attack code hands it to the hooks
  function rollFor(ctx: EngineContext, s: GameState, purpose: 'hit' | 'save', unitId: UnitId, dice: number[], needed = 4) {
    const roll = ctx.roll({ purpose, player: s.units[unitId].player, count: dice.length, mode: 'perDie', unitId, needed })
    expect(roll.dice).toEqual(dice)
    return roll
  }
  const askHit = (ctx: EngineContext, attack: AttackContext, roll: ReturnType<typeof rollFor>, u: number) =>
    hookService.collect(ctx, 'onHitRoll', { attack, roll: { purpose: 'hit', roll, dieIndex: 0, unmodified: u, rerolled: false } })
      .flatMap((r) => (r.result.kind === 'roll' && r.result.reroll ? [r.result.reroll] : []))

  it('STD-AB-2 rolls 8 dice; each 4+ is one re-roll for the unit', () => {
    const s = game(RITUALIST)
    const { ctx, rng } = ctxFor(s, [4, 3, 6, 1, 5, 2, 4, 3])
    useOnce(ctx, 'hero', 'A', VISIONS)
    expect(rng.remaining).toEqual([])
    expect(ledger(s).left).toBe(4)
    expect(s.units['A:savagers'].effects.some((e) => e.sourceAbilityId === VISIONS)).toBe(true)
    // once per phase and unit: not offered a second time
    expect(usableIds(s, 'A', 'hero')).not.toContain(VISIONS)
  })

  it('STD-AB-2 re-rolls hit, wound and save rolls and the run roll of this unit only, each spending from the pool', () => {
    const s = game(RITUALIST)
    const { ctx } = ctxFor(s, [4, 4, 4, 4, 4, 4, 4, 4, /* hit */ 2, 6, 1, /* hit again */ 1, 5, /* wound */ 2, /* save */ 3, /* run */ 1, 6, /* other */ 1])
    useOnce(ctx, 'hero', 'A', VISIONS)
    expect(ledger(s).left).toBe(8)
    const mine = attackOf(s, 'A:savagers', 'B:guard', 'melee', DARKOATH)
    const hit1 = rollFor(ctx, s, 'hit', 'A:savagers', [2, 6, 1])
    // two failing dice and enough re-rolls: both are re-rolled, the passing 6 is not a failure; every die value gets the same answer
    expect(askHit(ctx, mine, hit1, 2)).toEqual(['fails'])
    expect(askHit(ctx, mine, hit1, 1)).toEqual(['fails'])
    expect(askHit(ctx, mine, hit1, 6)).toEqual([])
    expect(ledger(s).left).toBe(6)
    // a single failing die is re-rolled alone
    const hit2 = rollFor(ctx, s, 'hit', 'A:savagers', [1, 5])
    expect(askHit(ctx, mine, hit2, 1)).toEqual(['oneDie'])
    expect(ledger(s).left).toBe(5)
    // wound rolls too
    const wound = rollFor(ctx, s, 'hit', 'A:savagers', [2], 3)
    expect(hookService.collect(ctx, 'onWoundRoll', { attack: mine, roll: { purpose: 'wound', roll: wound, dieIndex: 0, unmodified: 2, rerolled: false } })
      .some((r) => r.result.kind === 'roll' && r.result.reroll === 'oneDie')).toBe(true)
    expect(ledger(s).left).toBe(4)
    // saves of this unit: the attack is the enemy's, the target is ours
    const theirs = attackOf(s, 'B:guard', 'A:savagers', 'melee', 'fx.w.guard-spear')
    const save = rollFor(ctx, s, 'save', 'A:savagers', [3], 5)
    expect(hookService.collect(ctx, 'onSaveRoll', { attack: theirs, roll: { purpose: 'save', roll: save, dieIndex: 0, unmodified: 3, rerolled: false } })
      .some((r) => r.result.kind === 'roll' && r.result.reroll === 'oneDie')).toBe(true)
    expect(ledger(s).left).toBe(3)
    // the run roll
    const run = ctx.roll({ purpose: 'advance', player: 'A', sides: 6, count: 1, mode: 'sum', unitId: 'A:savagers' })
    expect(applyAbilityRerolls(ctx, 'onAdvanceRoll', { movingUnitId: 'A:savagers' }, run, 4)).not.toBe(run)
    expect(ledger(s).left).toBe(2)
    // other units of the army and the enemy never use them
    const other = rollFor(ctx, s, 'hit', 'A:savagers', [1])
    expect(askHit(ctx, attackOf(s, 'A:marauders', 'B:guard', 'melee', RAIDER), other, 1)).toEqual([])
    expect(ledger(s).left).toBe(2)
  })

  it('STD-AB-2 in a real melee attack the re-rolls fix the failed hit dice', () => {
    const s = game(RITUALIST)
    engage(s, 'A:savagers', 'B:brute')
    // 8 successes for Visions; then 2 hits (2, 2 fail) -> re-rolled (5, 4) ; 2 wounds (4, 4) ; 2 saves (1, 1) fail
    const { ctx, events, rng } = ctxFor(s, [4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 5, 4, 4, 4, 1, 1])
    useOnce(ctx, 'hero', 'A', VISIONS)
    const wounds = () => unitModels(s, 'B:brute').reduce((a, m) => a + m.woundsRemaining, 0)
    expect(wounds()).toBe(9)
    attackService.begin(ctx, { kind: 'melee', attackerUnitId: 'A:savagers', overwatch: false, targets: [{ modelId: s.units['A:savagers'].models[0], weaponId: DARKOATH, targetUnitId: 'B:brute', profileGroup: null, attacks: null }] })
    attackService.advance(ctx)
    expect(rng.remaining).toEqual([])
    expect(events.filter((e) => e.type === 'DiceRerolled')).toHaveLength(1)
    expect(wounds()).toBe(7)
    expect(ledger(s).left).toBe(6)
  })

  it('STD-AB-2 the re-rolls expire at the start of your next turn', () => {
    const s = game(RITUALIST)
    const { ctx } = ctxFor(s, [4, 4, 4, 4, 4, 4, 4, 4, 2])
    useOnce(ctx, 'hero', 'A', VISIONS)
    const mine = attackOf(s, 'A:savagers', 'B:guard', 'melee', DARKOATH)
    const roll = rollFor(ctx, s, 'hit', 'A:savagers', [2])
    effectService.expire(ctx, 'nextOwnTurn', 'A')
    expect(askHit(ctx, mine, roll, 2)).toEqual([])
    codeHooks.slavesVisionsOfGlory.ensureEffects!(ctx)
    expect(s.mission.custom.visions).toEqual({})
  })

  it('STD-AB-2 unusable once the Godspeaker is slain, and with no 4+ nothing is gained', () => {
    const s = game(RITUALIST)
    expect(usableIds(s, 'A', 'hero')).toContain(VISIONS)
    const { ctx } = ctxFor(s)
    attackService.finishDestroy(ctx, godspeaker(s), { player: 'B', unitId: 'B:brute', modelId: s.units['B:brute'].models[0], kind: 'melee' })
    expect(s.units['A:savagers'].models).toHaveLength(9)
    expect(usableIds(s, 'A', 'hero')).not.toContain(VISIONS)
    const t = game(RITUALIST)
    useOnce(ctxFor(t, [1, 2, 3, 1, 2, 3, 1, 2]).ctx, 'hero', 'A', VISIONS)
    expect(t.units['A:savagers'].effects.some((e) => e.sourceAbilityId === VISIONS)).toBe(false)
  })
})

describe('STD-AB-3 Swift Attackers', () => {
  it('STD-AB-3 shooting attacks that target the Fellriders subtract 1 from the hit roll; melee and other targets are unaffected', () => {
    const s = game(RITUALIST)
    const shot = (target: UnitId, kind: 'ranged' | 'melee') => hitModifier(s, attackOf(s, 'B:hawk', target, kind, 'fx.w.hawk-talons'))
    expect(shot('A:fellriders', 'ranged')).toBe(-1)
    expect(shot('A:fellriders', 'melee')).toBe(0)
    expect(shot('A:marauders', 'ranged')).toBe(0)
    expect(shot('A:savagers', 'ranged')).toBe(0)
  })
})

describe('STD-AB-4 Glorious Death', () => {
  const marauderIds = (s: GameState) => s.units['A:marauders'].models
  const byBrute = (s: GameState, kind: 'melee' | 'ranged' | 'mortal') => ({ player: 'B' as PlayerId, unitId: 'B:brute', modelId: kind === 'mortal' ? null : s.units['B:brute'].models[0], kind })

  it('STD-AB-4 a model slain by a melee attack while in combat with the attacker rolls a dice: 5+ is 1 mortal damage after the Fight', () => {
    const s = game(RITUALIST)
    engage(s, 'A:marauders', 'B:brute')
    const { ctx, rng } = ctxFor(s, [5, 4])
    attackService.finishDestroy(ctx, marauderIds(s)[0], byBrute(s, 'melee'))
    expect(pendingAfterFightMortal(s)).toHaveLength(1)
    expect(pendingAfterFightMortal(s)[0]).toMatchObject({ targetUnitId: 'B:brute', count: 1, player: 'A' })
    attackService.finishDestroy(ctx, marauderIds(s)[0], byBrute(s, 'melee')) // a 4: nothing
    expect(pendingAfterFightMortal(s)).toHaveLength(1)
    expect(rng.remaining).toEqual([])
    // nothing lands until the Fight ability has resolved
    const wounds = () => unitModels(s, 'B:brute').reduce((a, m) => a + m.woundsRemaining, 0)
    expect(wounds()).toBe(9)
    drainAfterFightMortal(ctx)
    expect(wounds()).toBe(8)
  })

  it('STD-AB-4 shooting kills, mortal kills and models whose unit was not in combat with the attacker do not trigger (no dice rolled)', () => {
    const s = game(RITUALIST)
    engage(s, 'A:marauders', 'B:brute')
    const { ctx, rng } = ctxFor(s, [6])
    attackService.finishDestroy(ctx, marauderIds(s)[0], byBrute(s, 'ranged'))
    attackService.finishDestroy(ctx, marauderIds(s)[0], byBrute(s, 'mortal'))
    expect(pendingAfterFightMortal(s)).toHaveLength(0)
    expect(rng.remaining).toEqual([6])
    place(s, 'B:brute', -5, 8) // far away: a melee kill still needs combat with the attacker
    attackService.finishDestroy(ctx, marauderIds(s)[0], byBrute(s, 'melee'))
    expect(pendingAfterFightMortal(s)).toHaveLength(0)
    expect(rng.remaining).toEqual([6])
  })

  it('STD-AB-4 fires for every model slain, even when the unit is wiped out', () => {
    const s = game(RITUALIST)
    engage(s, 'A:marauders', 'B:brute')
    const { ctx } = ctxFor(s, Array.from({ length: 10 }, () => 5))
    for (const id of [...marauderIds(s)]) attackService.finishDestroy(ctx, id, byBrute(s, 'melee'))
    expect(s.units['A:marauders'].location).toBe('destroyed')
    expect(pendingAfterFightMortal(s)).toHaveLength(10)
  })

  it('STD-AB-4 the held damage goes through the ordinary damage path (it is not a combat attack, so it cannot chain)', () => {
    const s = game(RITUALIST)
    engage(s, 'A:marauders', 'B:brute')
    const { ctx } = ctxFor(s)
    deferMortalAfterFight(s, { targetUnitId: 'B:brute', count: 3, source: 'slaves.ability.glorious-death', player: 'A' })
    drainAfterFightMortal(ctx)
    expect(unitModels(s, 'B:brute').reduce((a, m) => a + m.woundsRemaining, 0)).toBe(6)
    expect(unitModels(s, 'A:marauders')).toHaveLength(10)
    expect(pendingAfterFightMortal(s)).toHaveLength(0)
  })
})
