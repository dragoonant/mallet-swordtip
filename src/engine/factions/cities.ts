// Cities of Sigmar (Castelite Company) code hooks: docs/spec/factions/cities-castelite-company.md (CITIES-*). WP7.
// Spread into the registry in code-hooks.ts under the `code` names src/data/factions/cities/abilities.json uses. Activated
// abilities use `activate` (hooks.ts ActivatedAbilityHook, run by abilities.ts, which rolls the declared roll first and only
// calls `resolve` on success); passive rules are declarative descriptors that a code hook gates. What each hook needs from data:
//
//  citiesForSigmarCharge (RA-1)    descriptor effect { fightsFirst: true }, scope self; the gate adds "Cavalry that charged this turn".
//  citiesDecisiveCommander (AB-1)  params datasheet, range, returnModels, controlBonus; modes on-your-feet / yield-no-quarter.
//        Yield No Quarter grants a runtime effect and `produce` answers it at onObjectiveControl (+controlBonus, CORE-17.4).
//  citiesDevastatingCharge (AB-3)  roll D6 2+; the hook deals the D3 mortal damage.
//  citiesShotAndShell (AB-4)       params blocked = the Cannonball weapon id; unavailable once the unit used a Move ability this turn.
//  citiesFlask                     enhancement, params heal (dice expression); needs the bearer unit damaged.
//  Heirloom Blade has no code: scope bearer, effect { when: { weaponId }, modifyStat: { stat: 'AP', value: -1 } } (AP = -Rend).
//
//  citiesConsecrateTheLand (AB-2)   roll D6 3+ (descriptor); marks an objective consecrated in mission.custom.consecrated and gives
//        the owner's units a battle-long Ward (6+) effect that `gateEffect` only lets through while the unit contests a consecrated
//        objective its owner still controls.
//  citiesIronweldDiscipline (RA-2)  regiment ability, enemy shooting phase; targets = enemy units the Cannon could shoot; the Cannon
//        then fires its best profile at the target as if it were its shooting phase (attackService.begin + advance).
//  citiesBrazier                    enhancement, end of any turn: return D3 slain models to a Steelhelms unit within params.range (3").
//  citiesGlimmering                 enhancement: a battle-long active effect on the bearer's unit (ensureEffects) whose `produce`
//        answers hit / wound / save rolls with a one-die re-roll, once per phase (phase mark `glim:used`).
//  citiesOfficersOrder (BT-1)       start of each battle round: set one battle tactic card in hand aside (the mode is the card);
//        cards.ts keeps it (officersOrderCard) and makes its command free: used, it returns to the hand, locked for the phase.
import type { AbilityUse, ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr } from '../../data/types'
import type { DeclaredTarget, GameState, PlayerId, RuntimeWeapon, UnitId } from '../types'
import { keywordsOf } from '../state'
import { parseDiceExpr } from '../dice'
import { attackService } from '../attack'
import { effectService } from '../effects'
import { weaponService } from '../weapons'
import { buildShootingWeaponEntries, unitEligibleToShoot } from '../phases/shooting'
import { cardName, officersOrderCard, setOfficersOrder } from '../cards'
import type { EngineContext } from '../modules'
import {
  announce, consecratedFor, consecratedMap, declaredRoll, enemiesInCombat, healUnit, inCombat, inflictMortal, isDamaged, isDatasheet, liveObjectives, onBoard, paramOf, paramsByCode, playerContestsObjective,
  returnableModels, returnSlainModels, unitContestsObjective, unitsWithin, whollyWithinUnit,
} from './aos-common'

const noop = () => undefined

const CODE_DECISIVE = 'citiesDecisiveCommander'
const CANNONBALL = 'cities.weapon.great-cannon-cannonball'

// ---------- CITIES-BT-1 The Officer's Order ----------
const officersHand = (state: GameState, player: PlayerId | undefined): string[] => (player ? state.cards?.tactics[player]?.hand ?? [] : [])
const officersActivate: ActivatedAbilityHook & { modesFor?(state: GameState, unitId: UnitId | null, player: PlayerId): { id: string; label: string }[] } = {
  canUse: (state, _unitId, use) => officersHand(state, use.player).length > 0 && !officersOrderCard(state, use.player as PlayerId),
  modesFor: (state, _unitId, player) => officersHand(state, player).map((id) => ({ id, label: `Set aside ${cardName(id)}` })),
  resolve(ctx, use) {
    const hand = officersHand(ctx.state, use.player)
    const cardId = use.modeId && hand.includes(use.modeId) ? use.modeId : hand[0]
    if (!cardId) return
    setOfficersOrder(ctx.state, use.player, cardId)
    // the opponent learns that a card was set aside, not which one
    announce(ctx, use, null, "The Officer's Order: a battle tactic card is set aside; its command is free this round")
  },
}
const citiesOfficersOrder: EngineCodeHook = { name: 'citiesOfficersOrder', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: officersActivate }

// the mode id as data spells it (on-your-feet, onYourFeet, "On Your Feet!") -> a canonical key
const modeKey = (id: string | null): 'feet' | 'yield' | null => {
  const k = (id ?? '').toLowerCase().replace(/[^a-z]/g, '')
  return k.includes('feet') ? 'feet' : k.includes('yield') ? 'yield' : null
}

// ---------- CITIES-RA-1 For Sigmar, Charge! ----------
const citiesForSigmarCharge: EngineCodeHook = {
  name: 'citiesForSigmarCharge', kind: 'ability', hook: 'onEligibility', run: noop,
  gate: (state, holder, entry) => holder.turn.chargedThisTurn && keywordsOf(state, holder.id).includes(String(entry.params.keyword ?? 'CAVALRY')),
}

// ---------- CITIES-AB-1 Decisive Commander ----------
const commanderTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const p = paramsByCode(state, src.id, CODE_DECISIVE)
  const range = typeof p.range === 'number' ? p.range : 12
  return Object.values(state.units)
    .filter((u) => u.player === src.player && u.location === 'board' && isDatasheet(state, u.id, p.datasheet, 'steelhelms') && whollyWithinUnit(state, u.id, src.id, range))
    .map((u) => u.id)
}

const commanderActivate: ActivatedAbilityHook = {
  canUse(state, unitId, use) {
    const targets = commanderTargets(state, unitId)
    if (targets.length === 0) return false
    const picked = use.targetUnitIds?.[0]
    if (picked && !targets.includes(picked)) return false
    // On Your Feet! needs a target that is not in combat and has someone to bring back
    if (picked && modeKey(use.modeId ?? null) === 'feet') return !inCombat(state, picked) && returnableModels(state, picked) > 0
    return true
  },
  targets: commanderTargets,
  resolve(ctx, use: AbilityUse) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    // abilities.ts has already rolled and checked the descriptor's roll; a descriptor without one gets the printed 2+ here
    const { passed, total } = declaredRoll(ctx, use, 2)
    if (!passed) { announce(ctx, use, target, `Decisive Commander: rolled ${total}, no effect`); return }
    const mode = modeKey(use.modeId)
    if (mode === 'feet') {
      if (inCombat(ctx.state, target)) { announce(ctx, use, target, 'On Your Feet!: target is in combat, no effect'); return }
      const dice = paramOf<DiceExpr>(ctx.state, use.abilityId, 'returnModels', 'D3')
      const n = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
      const back = returnSlainModels(ctx, target, n, use.abilityId)
      announce(ctx, use, target, `On Your Feet!: ${back} slain model${back === 1 ? '' : 's'} returned`)
    } else if (mode === 'yield') {
      // +3 control score until the start of the owner's next turn; `produce` below answers it at onObjectiveControl
      ctx.services.effects.grant(ctx, target, {}, { sourceAbilityId: use.abilityId, sourceUnitId: use.unitId, scope: { who: 'self' }, duration: 'untilNextTurn' })
      announce(ctx, use, target, 'Yield No Quarter!: bonus control score until your next turn')
    }
  },
}

const citiesDecisiveCommander: EngineCodeHook = {
  name: CODE_DECISIVE, kind: 'ability', hook: 'onAbilityDeclared', run: noop,
  activate: commanderActivate,
  // the granted runtime effect adds its control bonus to the holder's score on every objective it contests (floor 1 is the caller's)
  producesAt: ['onObjectiveControl'],
  produce: (ctx, entry, data) => (entry.active && data.contestingUnitId === entry.holderUnitId
    ? { kind: 'stat', delta: paramOf<number>(ctx.state, entry.source.id, 'controlBonus', 3) }
    : null),
}

// ---------- CITIES-AB-3 Devastating Charge ----------
const devastatingChargeActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => !!onBoard(state, unitId) && state.units[unitId as UnitId].turn.chargedThisTurn && inCombat(state, unitId as UnitId),
  targets: (state, unitId) => (unitId && state.units[unitId]?.turn.chargedThisTurn ? enemiesInCombat(state, unitId) : []),
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const { passed, total } = declaredRoll(ctx, use, 2)
    if (!passed) { announce(ctx, use, target, `Devastating Charge: rolled ${total}, no effect`); return }
    const dice = paramOf<DiceExpr>(ctx.state, use.abilityId, 'mortal', 'D3')
    const dmg = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: use.unitId, targetUnitId: target, commandRerollable: false }).total
    announce(ctx, use, target, `Devastating Charge: ${dmg} mortal damage`)
    inflictMortal(ctx, use, target, dmg)
  },
}
const citiesDevastatingCharge: EngineCodeHook = { name: 'citiesDevastatingCharge', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: devastatingChargeActivate }

// ---------- CITIES-AB-4 Shot and Shell ----------
// Cannonball is only selectable when the unit has not used a Move ability (normal move, run, retreat, charge) this turn
const citiesShotAndShell: EngineCodeHook = {
  name: 'citiesShotAndShell', kind: 'ability', hook: 'onStatQuery', run: noop,
  weaponAvailable(state, entry, modelId, weaponId) {
    const model = state.models[modelId]
    if (!model || model.unitId !== entry.holderUnitId) return null
    if (weaponId !== (entry.params.blocked ?? CANNONBALL)) return null
    const t = state.units[entry.holderUnitId].turn
    const moved = t.moveType === 'normal' || t.moveType === 'advance' || t.moveType === 'fallBack' || t.chargedThisTurn
    return moved ? false : null
  },
}

// ---------- Flask of Lethisian Darkwater ----------
const flaskUnit = (state: GameState, unitId: UnitId | null, player: AbilityUse['player'] | undefined): UnitId | null =>
  unitId ?? state.players[player ?? state.activePlayer]?.warlordUnitId ?? null

const flaskActivate: ActivatedAbilityHook = {
  canUse: (state, unitId, use) => {
    const id = flaskUnit(state, unitId, use.player)
    return !!id && !!onBoard(state, id) && isDamaged(state, id)
  },
  resolve(ctx, use) {
    const id = flaskUnit(ctx.state, use.unitId, use.player)
    if (!id || !onBoard(ctx.state, id)) return
    const dice = paramOf<DiceExpr>(ctx.state, use.abilityId, 'heal', 'D6')
    const amount = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: id, commandRerollable: false }).total
    const healed = healUnit(ctx, id, amount, use.abilityId)
    announce(ctx, use, id, `Flask of Lethisian Darkwater: Heal (${amount}), ${healed} damage removed`)
  },
}
const citiesFlask: EngineCodeHook = { name: 'citiesFlask', kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: flaskActivate }

// ---------- CITIES-AB-2 Consecrate the Land ----------
const CODE_CONSECRATE = 'citiesConsecrateTheLand'

// the objectives this unit could consecrate right now: its owner controls them, it contests them, no enemy does, not already done
function consecrateSites(state: GameState, unitId: UnitId | null) {
  const unit = onBoard(state, unitId)
  if (!unit) return []
  const done = consecratedFor(state, unit.player).map((o) => o.id)
  const enemy: PlayerId = unit.player === 'A' ? 'B' : 'A'
  return liveObjectives(state).filter((o) => o.controller === unit.player && !done.includes(o.id) && unitContestsObjective(state, unit.id, o) && !playerContestsObjective(state, enemy, o))
}

// a battle-long Ward (6+) on every unit of the player; gateEffect below decides when it counts
function grantConsecratedWard(ctx: EngineContext, player: PlayerId, abilityId: string, sourceUnitId: UnitId | null): void {
  for (const u of Object.values(ctx.state.units)) {
    if (u.player !== player || u.location === 'destroyed') continue
    if (u.effects.some((e) => e.sourceAbilityId === abilityId)) continue
    effectService.grant(ctx, u.id, { feelNoPain: num(paramOf(ctx.state, abilityId, 'ward', 6), 6) }, { sourceAbilityId: abilityId, sourceUnitId, scope: { who: 'self' }, duration: 'battle' })
  }
}

const consecrateActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => consecrateSites(state, unitId).length > 0,
  resolve(ctx, use) {
    const unit = onBoard(ctx.state, use.unitId)
    if (!unit) return
    const sites = consecrateSites(ctx.state, unit.id)
    if (sites.length === 0) return
    const { passed, total } = declaredRoll(ctx, use, 3)
    if (!passed) { announce(ctx, use, null, `Consecrate the Land: rolled ${total}, no effect`); return }
    const obj = sites[0]
    ctx.state.mission.custom.consecrated = { ...consecratedMap(ctx.state), [obj.id]: unit.player }
    grantConsecratedWard(ctx, unit.player, use.abilityId, unit.id)
    announce(ctx, use, null, 'Consecrate the Land: the objective is consecrated, friendly units on it have Ward (6+)')
  },
}

const citiesConsecrateTheLand: EngineCodeHook = {
  name: CODE_CONSECRATE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: consecrateActivate,
  // the granted Ward only counts while the holder contests an objective consecrated for its owner (and still held by them)
  gateEffect(state, holder) {
    if (!holder || holder.location !== 'board') return false
    return consecratedFor(state, holder.player).some((o) => unitContestsObjective(state, holder.id, o))
  },
  // called by abilities.ts at the top of every window: a consecration lapses when the enemy takes the objective; replacement
  // units (Call for Reinforcements) inherit the Ward
  ensureEffects(ctx) {
    const map = consecratedMap(ctx.state)
    const keep: Record<string, PlayerId> = {}
    let changed = false
    for (const [id, owner] of Object.entries(map)) {
      if (ctx.state.objectives[id]?.controller === owner) keep[id] = owner
      else changed = true
    }
    if (changed) ctx.state.mission.custom.consecrated = keep
    const ab = Object.values(ctx.state.abilities).find((a) => a.code === CODE_CONSECRATE)
    if (!ab) return
    for (const owner of new Set(Object.values(keep))) grantConsecratedWard(ctx, owner, ab.id, null)
  },
}

// ---------- CITIES-RA-2 Ironweld Discipline ----------
const CODE_DISCIPLINE = 'citiesIronweldDiscipline'

const disciplineCannons = (state: GameState, player: PlayerId): UnitId[] => {
  const reg = state.players[player]?.regimentAbilityId
  const want = state.abilities[reg ?? '']?.params?.datasheet
  return Object.values(state.units)
    .filter((u) => u.player === player && u.location === 'board' && isDatasheet(state, u.id, want, 'great-cannon'))
    .map((u) => u.id)
}

// state-only stand-in for the shooting helpers, which read nothing but ctx.state
const stateCtx = (state: GameState): EngineContext => ({ state } as unknown as EngineContext)

const avgOf = (e: RuntimeWeapon['A']): number => { const p = parseDiceExpr(e); return p.sides === null ? p.flat : (p.count * (p.sides + 1)) / 2 + p.flat }
const chance = (t: number | null): number => (t === null ? 1 : Math.max(1 / 6, Math.min(5 / 6, (7 - t) / 6)))
const expectedDamage = (w: RuntimeWeapon): number => avgOf(w.A) * chance(w.skill) * chance(w.wound) * avgOf(w.D) * (1 + Math.min(3, w.rend) / 12)

// the Cannon's targets: enemy units any of its weapons could hit right now
const disciplineTargets = (state: GameState, player: PlayerId): UnitId[] => {
  const out = new Set<UnitId>()
  const ctx = stateCtx(state)
  for (const id of disciplineCannons(state, player)) {
    if (!unitEligibleToShoot(ctx, id)) continue
    for (const e of buildShootingWeaponEntries(ctx, id)) for (const t of e.legalTargets) out.add(t)
  }
  return [...out]
}

// the Cannon fires in the ENEMY shooting phase, so with no player given the user is whoever is not the active player
const otherThanActive = (state: GameState): PlayerId => (state.activePlayer === 'A' ? 'B' : 'A')

const disciplineActivate: ActivatedAbilityHook = {
  canUse: (state, _unitId, use) => disciplineTargets(state, use.player ?? otherThanActive(state)).length > 0,
  targets: ((state: GameState, _unitId: UnitId | null, player?: PlayerId) => disciplineTargets(state, player ?? otherThanActive(state))) as ActivatedAbilityHook['targets'],
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const cannon = disciplineCannons(ctx.state, use.player).find((id) => buildShootingWeaponEntries(ctx, id).some((e) => e.legalTargets.includes(target)))
    if (!cannon) return
    const entries = buildShootingWeaponEntries(ctx, cannon).filter((e) => e.legalTargets.includes(target))
    // one profile per profile group per model: the one with the best expected damage
    const best = new Map<string, { score: number; e: (typeof entries)[number] }>()
    for (const e of entries) {
      const w = weaponService.effectiveWeapon(ctx.state, e.modelId, e.weaponId)
      const key = e.profileGroup ? `${e.modelId}::${e.profileGroup}` : `${e.modelId}::${e.weaponId}`
      const score = expectedDamage(w)
      const cur = best.get(key)
      if (!cur || score > cur.score) best.set(key, { score, e })
    }
    const targets: DeclaredTarget[] = [...best.values()].map(({ e }) => ({ modelId: e.modelId, weaponId: e.weaponId, targetUnitId: target, profileGroup: e.profileGroup, attacks: null }))
    if (targets.length === 0) return
    announce(ctx, use, target, `Ironweld Discipline: the ${ctx.state.units[cannon].name} fires on its own initiative`)
    attackService.begin(ctx, { kind: 'ranged', attackerUnitId: cannon, overwatch: false, targets })
    attackService.advance(ctx)
    ctx.state.units[cannon].turn.shotThisPhase = true
  },
}
const citiesIronweldDiscipline: EngineCodeHook = { name: CODE_DISCIPLINE, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: disciplineActivate }

// ---------- Brazier of Holy Flame ----------
const CODE_BRAZIER = 'citiesBrazier'

const brazierTargets = (state: GameState, unitId: UnitId | null): UnitId[] => {
  const src = onBoard(state, unitId)
  if (!src) return []
  const p = paramsByCode(state, src.id, CODE_BRAZIER)
  const range = num(p.range, 3)
  return Object.values(state.units)
    .filter((u) => u.player === src.player && u.location === 'board' && isDatasheet(state, u.id, p.datasheet, 'steelhelms') && unitsWithin(state, src.id, u.id, range) && returnableModels(state, u.id) > 0)
    .map((u) => u.id)
}

const brazierActivate: ActivatedAbilityHook = {
  canUse: (state, unitId) => brazierTargets(state, unitId).length > 0,
  targets: brazierTargets,
  resolve(ctx, use) {
    const target = use.targetUnitIds[0]
    if (!target || !onBoard(ctx.state, target)) return
    const dice = paramOf<DiceExpr>(ctx.state, use.abilityId, 'returnModels', 'D3')
    const n = ctx.rollExpr(dice, { purpose: 'ability', player: use.player, unitId: target, commandRerollable: false }).total
    const back = returnSlainModels(ctx, target, n, use.abilityId)
    announce(ctx, use, target, `Brazier of Holy Flame: ${back} slain model${back === 1 ? '' : 's'} returned`)
  },
}
const citiesBrazier: EngineCodeHook = { name: CODE_BRAZIER, kind: 'ability', hook: 'onAbilityDeclared', run: noop, activate: brazierActivate }

// ---------- Glimmering ----------
const CODE_GLIMMERING = 'citiesGlimmering'
const GLIM_MARK = 'glim:used'

const citiesGlimmering: EngineCodeHook = {
  name: CODE_GLIMMERING, kind: 'ability', hook: 'onStatQuery', run: noop,
  producesAt: ['onHitRoll', 'onWoundRoll', 'onSaveRoll'],
  // answers on the active effect ensureEffects put on the bearer's unit: re-roll the first failed die of the first roll the bearer
  // makes or defends with in a phase (hit, wound or save), once per phase
  produce(ctx, entry, data) {
    const attack = data.attack as { attackerUnitId: UnitId; targetUnitId: UnitId } | undefined
    const rc = data.roll as { purpose: string; roll: { needed?: number; modifiers: { value: number }[] }; unmodified: number } | undefined
    if (!entry.active || !attack || !rc) return null
    const mine = rc.purpose === 'save' ? attack.targetUnitId === entry.holderUnitId : (rc.purpose === 'hit' || rc.purpose === 'wound') && attack.attackerUnitId === entry.holderUnitId
    if (!mine || ctx.state.phaseState.marks.includes(GLIM_MARK)) return null
    const needed = rc.roll.needed
    if (needed === undefined) return null
    const sum = rc.roll.modifiers.reduce((a, m) => a + m.value, 0)
    const mod = rc.purpose === 'save' ? sum : Math.max(-1, Math.min(1, sum))
    if (rc.unmodified !== 1 && rc.unmodified + mod >= needed) return null // this die passes: nothing to re-roll
    ctx.state.phaseState.marks.push(GLIM_MARK)
    return { kind: 'roll', reroll: 'oneDie' }
  },
  // the bearer's unit carries a battle-long effect so `produce` has an active entry to answer on
  ensureEffects(ctx) {
    for (const ab of Object.values(ctx.state.abilities)) {
      if (ab.code !== CODE_GLIMMERING || ab.source !== 'enhancement' || !ab.bearerModelId) continue
      const unitId = ctx.state.models[ab.bearerModelId]?.unitId
      const unit = unitId ? ctx.state.units[unitId] : undefined
      if (!unit || unit.effects.some((e) => e.sourceAbilityId === ab.id)) continue
      effectService.grant(ctx, unit.id, {}, { sourceAbilityId: ab.id, sourceUnitId: unit.id, scope: { who: 'self' }, duration: 'battle' })
    }
  },
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

export const citiesHooks: Record<string, EngineCodeHook> = {
  citiesForSigmarCharge, citiesDecisiveCommander, citiesDevastatingCharge, citiesShotAndShell, citiesFlask,
  citiesConsecrateTheLand, citiesIronweldDiscipline, citiesBrazier, citiesGlimmering,
  citiesOfficersOrder,
}

// ---------- AI hints (read by src/ai/utility.ts objectivePull) ----------
// How much of a held marker's pull a Cities unit should feel. The Castelite Company holds ground with its Steelhelms and the
// Cannon; the Cavaliers and the Marshal are the counter-charge (Strike-first once they charge, Devastating Charge), so while a
// line holder is still on the table they guard nothing themselves and go where the next charge is. null = no opinion.
export function citiesHoldWeight(state: GameState, unitId: UnitId): number | null {
  const unit = state.units[unitId]
  if (!unit || unit.location !== 'board' || !unit.datasheetId.startsWith('cities.unit.freeguild-cavalier')) return null
  const holders = Object.values(state.units).some((u) => u.player === unit.player && u.location === 'board'
    && (isDatasheet(state, u.id, undefined, 'steelhelms') || isDatasheet(state, u.id, undefined, 'great-cannon')))
  return holders ? 0.4 : null
}
