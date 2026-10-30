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
// P1 (registered with canUse false so choosing them is harmless): citiesConsecrateTheLand, citiesIronweldDiscipline,
// citiesBrazier, citiesOfficersOrder; citiesGlimmering is a bare name.
import type { AbilityUse, ActivatedAbilityHook } from '../hooks'
import type { EngineCodeHook } from '../code-hooks'
import type { DiceExpr } from '../../data/types'
import type { GameState, UnitId } from '../types'
import { keywordsOf } from '../state'
import { announce, declaredRoll, enemiesInCombat, healUnit, inCombat, inflictMortal, isDamaged, isDatasheet, onBoard, paramOf, paramsByCode, returnableModels, returnSlainModels, whollyWithinUnit } from './aos-common'

const noop = () => undefined

const CODE_DECISIVE = 'citiesDecisiveCommander'
const CANNONBALL = 'cities.weapon.great-cannon-cannonball'

// P1 stub: the ability is registered so data may name it, but it can never be used yet
const parked = (name: string): EngineCodeHook => ({
  name, kind: 'ability', hook: 'onAbilityDeclared', run: noop,
  activate: { canUse: () => false, resolve: noop },
})

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

export const citiesHooks: Record<string, EngineCodeHook> = {
  citiesForSigmarCharge, citiesDecisiveCommander, citiesDevastatingCharge, citiesShotAndShell, citiesFlask,
  // P1: registered, never usable yet
  citiesConsecrateTheLand: parked('citiesConsecrateTheLand'),
  citiesIronweldDiscipline: parked('citiesIronweldDiscipline'),
  citiesBrazier: parked('citiesBrazier'),
  citiesOfficersOrder: parked('citiesOfficersOrder'),
  citiesGlimmering: { name: 'citiesGlimmering', kind: 'ability', hook: 'onStatQuery', run: noop },
}
