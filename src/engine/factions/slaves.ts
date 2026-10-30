// Slaves to Darkness (Darkoath Raiders) code hooks: docs/spec/factions/slaves-to-darkness.md (STD-*). Spread into the registry in
// code-hooks.ts under the `code` names src/data/factions/slaves/abilities.json uses. Activated abilities use `activate`
// (hooks.ts ActivatedAbilityHook, run by abilities.ts); passive rules are declarative descriptors that a code hook gates or answers.
// What each hook needs from data:
//
//  slavesOathsOfDarkness (BT-1)   activated, your hero phase, oncePerTurnArmy; the mode is the hand card to swear on. Modes are listed
//        best first (highest tacticOdds), which is also the AI's pick since the options all tie. cards.ts keeps the pile bookkeeping
//        (setOath / fulfilled / discard on command / lapse at end of turn).
//  slavesRageOfArkhar (RA-1)      activated, any combat phase, oncePerTurnArmy; target = a friendly unit in combat; grants
//        +params.extraAttacks Attacks and +params.extraRend Rend on melee weapons until the end of the turn. Companion weapons are
//        left alone by the engine (weapons.ts effectiveWeapon returns them as printed) and by the `not` condition.
//  slavesFearlessInvaders (RA-2)  activated, your movement phase, oncePerTurnArmy, params.window 'moveDeclared': offered when a
//        friendly unit in combat declares a Retreat (before the retreat damage); grants { chargeAfterFallBack } and
//        { noRetreatDamage } until the end of the turn.
//  slavesChampionOfRaids (ENH-3)  enhancement, activated; target = another friendly unit wholly within params.range of the bearer;
//        grants { reroll: 'all' } that only applies at onChargeRoll (hooks), until the end of the turn. The card says "your charge
//        phase", but the engine's charge-phase ability window opens only after every charge is over, so the data offers it in the
//        movement-phase window that closes just before the charge phase (approximation; same turn, before any charge roll).
//  slavesFellRitualist (ENH-4)    passive marker: extraTacticDraw gives params.extraCards (cards.ts offers the draw and the put-back).
//  slavesOathOfSupremacy (AB-1)   activated, your hero phase; target = a friendly unit wholly within params.range of the Warqueen (she may
//        pick herself); grants { modifyRoll hit +1 } until the start of your next turn.
//  slavesVisionsOfGlory (AB-2)    activated, your hero phase; needs a live Godspeaker model; rolls params.dice dice, each params.succeedOn+
//        is one re-roll for the unit until the start of your next turn. The count lives in mission.custom.visions keyed by the granted
//        effect's id; `produce` spends it on the unit's hit / wound / save rolls and its run roll (see the ledger notes below).
//  Bloodthirsty Blade (AP -1 on the axe), Godshadow Talisman (feelNoPain 4) and Swift Attackers (stealth) are plain descriptors.
//  slavesGloriousDeath (AB-4)     onOwnModelSlain: a model slain by a melee attack while its unit was in combat with the attacker rolls
//        a dice; params.succeedOn+ holds params.mortal mortal damage on the attacker until its Fight ability has resolved.
import type { ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { Effect } from '../../data/types'
import type { DiceRoll, GameState, PlayerId, UnitId } from '../types'
import { distance, ENGAGEMENT_H, EPS } from '../geometry'
import { readDeclaredMove } from '../declared'
import { deferMortalAfterFight } from '../attack'
import { cardName, setOath, tacticOdds } from '../cards'
import { announce, inCombat, liveModels, onBoard, paramOf, paramsByCode, whollyWithinUnit } from './aos-common'

const noop = () => undefined
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

const playerOf = (state: GameState, use: { player?: PlayerId }): PlayerId => use.player ?? state.activePlayer

// ---------- STD-BT-1 Oaths of Darkness ----------
const oathHand = (state: GameState, player: PlayerId): string[] => state.cards?.tactics[player]?.hand ?? []

const oathActivate: ActivatedAbilityHook & { modesFor?(state: GameState, unitId: UnitId | null, player: PlayerId): { id: string; label: string }[] } = {
  canUse: (state, _unitId, use) => oathHand(state, playerOf(state, use)).length > 0,
  // best card first: the one most likely to be scored this turn (the AI takes the first of equally scored modes)
  modesFor: (state, _unitId, player) => [...oathHand(state, player)]
    .sort((a, b) => tacticOdds(state, player, b) - tacticOdds(state, player, a))
    .map((id) => ({ id, label: `Swear an oath on ${cardName(id)}` })),
  resolve(ctx, use) {
    const hand = oathHand(ctx.state, use.player)
    const cardId = use.modeId && hand.includes(use.modeId) ? use.modeId : hand[0]
    if (!cardId || !setOath(ctx.state, use.player, cardId)) return
    // the card is shown to the opponent, so the name goes in the public announcement
    announce(ctx, use, null, `Oaths of Darkness: ${cardName(cardId)} is sworn as the oath for this turn`)
  },
}
const slavesOathsOfDarkness: EngineCodeHook = { name: 'slavesOathsOfDarkness', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: oathActivate }

// ---------- STD-RA-1 Rage of Arkhar ----------
const friendlyInCombat = (state: GameState, player: PlayerId): UnitId[] =>
  Object.values(state.units).filter((u) => u.player === player && u.location === 'board' && inCombat(state, u.id)).map((u) => u.id)

const rageTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] => friendlyInCombat(state, player ?? state.activePlayer)

const rageActivate: ActivatedAbilityHook = {
  canUse(state, _unitId, use) {
    const targets = rageTargets(state, null, use.player)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: rageTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const attacks = num(paramOf(ctx.state, use.abilityId, 'extraAttacks', 1), 1)
    const rend = num(paramOf(ctx.state, use.abilityId, 'extraRend', 1), 1)
    // Companion weapons are not affected (the Designer's Note); AP is the negative of Rend, so +1 Rend is AP -1
    const when = { weaponType: 'melee' as const, not: { weaponAbility: 'COMPANION' as const } }
    const effects: Effect[] = [{ when, modifyStat: { stat: 'A', value: attacks } }, { when, modifyStat: { stat: 'AP', value: -rend } }]
    ctx.services.effects.grant(ctx, target, effects, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, `Rage of Arkhar: +${attacks} Attacks and +${rend} Rend on melee weapons for the rest of the turn`)
  },
}
const slavesRageOfArkhar: EngineCodeHook = { name: 'slavesRageOfArkhar', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: rageActivate }

// ---------- STD-RA-2 Fearless Invaders ----------
// Offered in the 'moveDeclared' window (data params.window): the friendly unit in combat that has just declared a Retreat, before
// the retreat's mortal damage is rolled. At the end of the movement phase (the plain phase window) the retreat is already over and
// the unit is out of combat, so the ability could never do anything there.
const retreatingUnit = (state: GameState, player: PlayerId): UnitId | null => {
  const d = readDeclaredMove(state)
  const u = d && d.moveType === 'fallBack' ? onBoard(state, d.unitId) : null
  return u && u.player === player && inCombat(state, u.id) ? u.id : null
}
const invadersTargets = (state: GameState, _unitId: UnitId | null, player?: PlayerId): UnitId[] => {
  const id = retreatingUnit(state, player ?? state.activePlayer)
  return id ? [id] : []
}

// AI hint (src/ai/utility.ts scoreDeclareMove): the player can still swear Fearless Invaders this turn, so a Retreat it declares now
// would cost no mortal damage and leave the unit free to charge again
export function slavesFreeRetreatAvailable(state: GameState, player: PlayerId): boolean {
  const reg = state.abilities[state.players[player]?.regimentAbilityId ?? '']
  if (!reg || reg.code !== 'slavesFearlessInvaders') return false
  if (state.activePlayer !== player || state.phase !== 'movement') return false
  return !state.players[player].abilityUses.some((u) => u.abilityId === reg.id && u.round === state.round && u.turn === state.activePlayer)
}

const invadersActivate: ActivatedAbilityHook = {
  canUse(state, _unitId, use) {
    const targets = invadersTargets(state, null, use.player)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: invadersTargets as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const effects: Effect[] = [{ chargeAfterFallBack: true }, { noRetreatDamage: true }]
    ctx.services.effects.grant(ctx, target, effects, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, 'Fearless Invaders: a retreat this turn costs no mortal damage and the unit can still charge')
  },
}
const slavesFearlessInvaders: EngineCodeHook = { name: 'slavesFearlessInvaders', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: invadersActivate }

// ---------- STD-ENH-3 Champion of Raids ----------
const CODE_RAIDS = 'slavesChampionOfRaids'

const raidsTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(paramsByCode(state, src.id, CODE_RAIDS).range, 12)
  return Object.values(state.units)
    .filter((u) => u.id !== src.id && u.player === src.player && u.location === 'board' && whollyWithinUnit(state, u.id, src.id, range))
    .map((u) => u.id)
}

const raidsActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = raidsTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: raidsTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    ctx.services.effects.grant(ctx, target, { reroll: 'all' }, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilEndOfTurn' })
    announce(ctx, use, target, 'Champion of Raids: the unit can re-roll its charge rolls for the rest of the turn')
  },
}
// `hooks` keeps the granted re-roll to charge rolls (hooks-impl keyApplies)
const slavesChampionOfRaids: EngineCodeHook = { name: CODE_RAIDS, kind: 'ability', hook: 'onChargeRoll', hooks: ['onChargeRoll'], run: noop, activate: raidsActivate }

// ---------- STD-ENH-4 Fell Ritualist ----------
// passive marker: cards.ts asks every source on the board for extraTacticDraw after the draw step (the general must be on the table)
const slavesFellRitualist: EngineCodeHook = {
  name: 'slavesFellRitualist', kind: 'ability', hook: 'onStatQuery', run: noop,
  extraTacticDraw: (_state, entry) => num(entry.params.extraCards, 1),
}

// ---------- STD-AB-1 Oath of Supremacy ----------
const supremacyTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const range = num(paramsByCode(state, src.id, 'slavesOathOfSupremacy').range, 12)
  // the text says "a friendly unit wholly within 12" of your general", not "another": the Warqueen may pick herself
  return Object.values(state.units)
    .filter((u) => u.player === src.player && u.location === 'board' && (u.id === src.id || whollyWithinUnit(state, u.id, src.id, range)))
    .map((u) => u.id)
}

const supremacyActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = supremacyTargets(state, unitId)
    const picked = use.targetUnitIds?.[0]
    return targets.length > 0 && (!picked || targets.includes(picked))
  },
  targets: supremacyTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const bonus = num(paramOf(ctx.state, use.abilityId, 'hitBonus', 1), 1)
    const effect: Effect = { modifyRoll: { roll: 'hit', value: bonus } }
    ctx.services.effects.grant(ctx, target, effect, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn' })
    announce(ctx, use, target, `Oath of Supremacy: +${bonus} to hit rolls until the start of your next turn`)
  },
}
const slavesOathOfSupremacy: EngineCodeHook = { name: 'slavesOathOfSupremacy', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: supremacyActivate }

// ---------- STD-AB-2 Visions of Glory ----------
// The re-roll count is a ledger in mission.custom.visions, keyed by the id of the effect resolve() granted to the unit (the effect
// carries the lifetime: it is gone at the start of the owner's next turn, and ensureEffects prunes ledgers of vanished effects).
// A re-roll is spent when `produce` is first asked for a failing roll: one roll-id entry records how many were reserved so the other
// die values of the same roll get the same answer for free. A roll with several failing dice and enough re-rolls left re-rolls all of
// them ('fails'); otherwise it re-rolls one die ('oneDie'). The failing test only sees the roll's own modifiers, so a die that a
// later +1 (Oath of Supremacy) would have rescued can still cost a re-roll: an approximation.
interface VisionsLedger { left: number; rolls: Record<string, 'fails' | 'oneDie'> }
const CODE_VISIONS = 'slavesVisionsOfGlory'

const ledgers = (s: GameState): Record<string, VisionsLedger> => (s.mission.custom.visions as Record<string, VisionsLedger> | undefined) ?? {}
const putLedger = (s: GameState, id: string, l: VisionsLedger): void => { s.mission.custom = { ...s.mission.custom, visions: { ...ledgers(s), [id]: l } } }

const hasGodspeaker = (state: GameState, unitId: UnitId | null): boolean => {
  if (!unitId) return false
  const code = paramsByCode(state, unitId, CODE_VISIONS).godspeakerModel
  const modelId = typeof code === 'string' ? code : 'godspeaker'
  return liveModels(state, unitId).some((m) => m.datasheetModelId === modelId)
}

// does a die with this unmodified value fail the roll (an unmodified 1 always fails)
const dieFails = (u: number, mod: number, needed: number): boolean => u === 1 || u + mod < needed

const visionsActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId) && hasGodspeaker(state, unitId),
  resolve(ctx, use) {
    const unit = onBoard(ctx.state, use.unitId)
    if (!unit || !hasGodspeaker(ctx.state, unit.id)) return
    const dice = num(paramOf(ctx.state, use.abilityId, 'dice', 8), 8)
    const succeedOn = num(paramOf(ctx.state, use.abilityId, 'succeedOn', 4), 4)
    const roll = ctx.roll({ purpose: 'ability', player: use.player, count: dice, mode: 'perDie', unitId: unit.id, commandRerollable: false })
    const gained = roll.final.filter((d) => d >= succeedOn).length
    announce(ctx, use, unit.id, `Visions of Glory: ${dice} dice, ${gained} re-roll${gained === 1 ? '' : 's'} until your next turn`)
    if (gained <= 0) return
    const eff = ctx.services.effects.grant(ctx, unit.id, {}, { sourceAbilityId: use.abilityId, sourceUnitId: unit.id, scope: { who: 'self' }, duration: 'untilNextTurn' })
    putLedger(ctx.state, eff.id, { left: gained, rolls: {} })
  },
}

const slavesVisionsOfGlory: EngineCodeHook = {
  name: CODE_VISIONS, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: visionsActivate,
  producesAt: ['onHitRoll', 'onWoundRoll', 'onSaveRoll', 'onAdvanceRoll'],
  produce(ctx, entry, data) {
    const eff = entry.active
    if (!eff) return null
    const s = ctx.state
    const ledger = ledgers(s)[eff.id]
    if (!ledger) return null
    const holder = entry.holderUnitId
    const attack = data.attack as { attackerUnitId: UnitId; targetUnitId: UnitId } | undefined
    const rc = data.roll as { purpose: string; roll: DiceRoll; unmodified: number } | undefined
    if (!rc) return null
    const advance = data.movingUnitId !== undefined
    let mod = 0
    let failing = 1
    if (advance) {
      // the engine only asks for a run roll that fell short; one re-roll fixes one die
      if (data.movingUnitId !== holder) return null
    } else {
      if (!attack) return null
      const mine = rc.purpose === 'save' ? attack.targetUnitId === holder : (rc.purpose === 'hit' || rc.purpose === 'wound') && attack.attackerUnitId === holder
      if (!mine || (rc.roll.rerolled ?? []).length > 0) return null
      const needed = rc.roll.needed
      if (needed === undefined) return null
      const sum = rc.roll.modifiers.reduce((a, m) => a + m.value, 0)
      mod = rc.purpose === 'save' ? sum : Math.max(-1, Math.min(1, sum))
      // this die value passes: nothing to re-roll
      if (!dieFails(rc.unmodified, mod, needed)) return null
      failing = rc.roll.dice.filter((u) => dieFails(u, mod, needed)).length
    }
    const rollId = rc.roll.id
    const known = ledger.rolls[rollId]
    if (known) return { kind: 'roll', reroll: known }
    if (ledger.left <= 0) return null
    const mode: 'fails' | 'oneDie' = failing > 1 && ledger.left >= failing ? 'fails' : 'oneDie'
    const spend = mode === 'fails' ? failing : 1
    putLedger(s, eff.id, { left: ledger.left - spend, rolls: { ...ledger.rolls, [rollId]: mode } })
    return { kind: 'roll', reroll: mode }
  },
  // ledgers of effects that have expired are dropped
  ensureEffects(ctx) {
    const s = ctx.state
    const all = ledgers(s)
    const ids = Object.keys(all)
    if (ids.length === 0) return
    const live = new Set<string>()
    for (const u of Object.values(s.units)) for (const e of u.effects) live.add(e.id)
    const keep = ids.filter((id) => live.has(id))
    if (keep.length === ids.length) return
    s.mission.custom = { ...s.mission.custom, visions: Object.fromEntries(keep.map((id) => [id, all[id]])) }
  },
}

// ---------- STD-AB-4 Glorious Death ----------
const slavesGloriousDeath: EngineCodeHook = {
  name: 'slavesGloriousDeath', kind: 'ability', hook: 'onModelDestroyed', run: noop,
  onOwnModelSlain(ctx, { ability, unitId, model, by }) {
    const s = ctx.state
    // only a combat (melee) attack counts, and only when the slain model's unit was in combat with the attacking unit
    if (by.kind !== 'melee' || !by.unitId || by.unitId === unitId) return
    const attackers = liveModels(s, by.unitId)
    if (attackers.length === 0) return
    // "in combat" is judged once per Fight ability: the first model slain sees the whole unit in place, and the models removed after
    // it (the rest of the same damage) count too, even if the near ones are already gone. The mark lives for the phase.
    const key = `glory:${unitId}>${by.unitId}`
    if (!s.phaseState.marks.includes(key)) {
      const range = Math.max(num(ability.params?.range, ENGAGEMENT_H), ENGAGEMENT_H)
      const inContact = [model, ...liveModels(s, unitId)].some((m) => attackers.some((a) => distance(m, a) <= range + EPS))
      if (!inContact) return
      s.phaseState.marks.push(key)
    }
    const owner = s.units[unitId].player
    const roll = ctx.roll({ purpose: 'ability', player: owner, count: 1, mode: 'perDie', unitId, targetUnitId: by.unitId, commandRerollable: false })
    const need = num(ability.params?.succeedOn, 5)
    const hit = roll.final[0] >= need
    ctx.emit({ type: 'AbilityTriggered', abilityId: ability.id, sourceUnitId: unitId, targetUnitId: by.unitId, summary: `Glorious Death: rolled ${roll.final[0]}${hit ? ', 1 mortal damage once the fight resolves' : ', no effect'}`, player: owner })
    if (hit) deferMortalAfterFight(s, { targetUnitId: by.unitId, count: num(ability.params?.mortal, 1), source: ability.id, player: owner })
  },
}

export const slavesHooks: Record<string, EngineCodeHook> = {
  slavesOathsOfDarkness, slavesRageOfArkhar, slavesFearlessInvaders, slavesChampionOfRaids, slavesFellRitualist,
  slavesOathOfSupremacy, slavesVisionsOfGlory, slavesGloriousDeath,
}
