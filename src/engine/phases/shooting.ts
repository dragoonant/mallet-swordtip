// Shooting phase module, AoS 4 / Spearhead (10-rules-core CORE-8, CORE-11.1, CORE-14.2, CORE-16.6). Steps:
// 'selectUnit' -> 'declareTargets' -> 'resolve' (per unit), then 'enemyAbilities'. The dice live in attack.ts.
//
//  - A unit that ran or retreated this turn cannot Shoot (CORE-8.1). A unit in combat may only fire Shoot in Combat weapons,
//    and only at units it is in combat with (CORE-8.3 / 11.2). Enemies in combat with a friendly unit may be shot (CORE-8.4).
//  - Each (model, weapon) names one target; a weapon's attacks are not split (CORE-11.1, lean). Only one profile of a
//    `profileGroup` may fire per model (CITIES-AB-4).
//  - Guarded Hero (CORE-14.2) and Obscuring (CORE-16.6) can make a unit an illegal target (`targetLegality`).
import type { Action, WeaponTarget } from '../actions'
import { attackService, drainAfterFightMortal, enemyUnitsInCombat, guardedHero, isInCombat, obscuredFrom, unitDistance } from '../attack'
import { distance, EPS } from '../geometry'
import { hookService } from '../hooks-impl'
import { losService } from '../los'
import { notImplementedHandle, otherPlayer, type AdvanceResult, type EngineContext, type PhaseModule } from '../modules'
import { boardUnitsOf, keywordsOf, unitModels } from '../state'
import {
  EngineInvariantError,
  type DeclaredTarget, type GameState, type Id, type Model, type ModelId, type PendingDecision, type PlayerId, type Rejection,
  type RuntimeWeapon, type UnitId, type WeaponId,
} from '../types'
import { weaponService } from '../weapons'
import { filterValid, optionActions, passAction } from './legal'

export { shotThisTurn } from '../attack'
export const SHOT_LOG_KEY = 'shotLog'
export interface ShotLog { round: number; turn: PlayerId; unitIds: UnitId[] }

// ---------- progress markers (phaseState.marks; reset every time the phase is entered) ----------
function readMark(state: GameState, key: string): string | null {
  const prefix = `${key}=`
  const m = state.phaseState.marks.find((x) => x.startsWith(prefix))
  return m ? m.slice(prefix.length) : null
}
function writeMark(state: GameState, key: string, value: string | null): void {
  const prefix = `${key}=`
  state.phaseState.marks = state.phaseState.marks.filter((x) => !x.startsWith(prefix))
  if (value !== null) state.phaseState.marks.push(prefix + value)
}

function actionKey(a: Action): string {
  const { seq: _s, decisionId: _d, player: _p, ...rest } = a as Action & { seq?: number }
  return JSON.stringify(rest, Object.keys(rest).sort())
}
function optionCheck(pending: PendingDecision, action: Action): Rejection | null {
  if (action.type === 'pass') return null
  if (!('options' in pending) || !Array.isArray(pending.options)) return null
  if (action.type === 'chooseOption') {
    return pending.options.some((o) => o.id === action.optionId) ? null : { code: 'E_NOT_AN_OPTION', reason: `option ${action.optionId} is not offered` }
  }
  const key = actionKey(action)
  return pending.options.some((o) => actionKey(o.action) === key) ? null : { code: 'E_NOT_AN_OPTION', reason: 'answer is not one of the offered options' }
}

// ---------- stubs kept for importers outside this package (WP8 removes them) ----------
export function isBigGunsUnit(_state: GameState, _unitId: UnitId): boolean { return false }
export function firingDeckValue(_state: GameState, _unitId: UnitId): number { return 0 }
export function firingDeckWeapons(_state: GameState, _transportUnitId: UnitId): { modelId: ModelId; weaponIds: WeaponId[] }[] { return [] }
export function deferredShootStep(_ctx: EngineContext, _entry: { unitId: UnitId; modelIds: ModelId[] }): 'pending' | 'done' { return 'done' }

const hasAb = (w: RuntimeWeapon, a: 'SHOOT_IN_COMBAT'): boolean => w.abilities.some((x) => x.ability === a)

function enemyUnits(state: GameState, firingPlayer: PlayerId): UnitId[] {
  return boardUnitsOf(state, otherPlayer(firingPlayer)).map((u) => u.id)
}

// ---------- target legality for one (firing model, weapon, candidate target unit) ----------
export function targetLegality(state: GameState, firingUnitId: UnitId, firingModelId: ModelId, weapon: RuntimeWeapon, targetUnitId: UnitId): Rejection | null {
  const attackerModel = state.models[firingModelId]
  const target = state.units[targetUnitId]
  const targetModels = target && target.location === 'board' ? unitModels(state, targetUnitId) : []
  const details = { modelId: firingModelId, weaponId: weapon.id, targetUnitId }
  if (!attackerModel || targetModels.length === 0) return { code: 'E_INVALID_TARGET', reason: `${targetUnitId} is not on the board`, details }
  if (target.player === state.units[firingUnitId]?.player) return { code: 'E_INVALID_TARGET', reason: 'cannot shoot a friendly unit', details }
  // CORE-8.2: the same model must be within Range and see the target. LRL-ENH Curved Shots (F8): range and visibility may
  // instead be measured from an extra origin point a code hook gives the model (EngineCodeHook.extraShootingOrigins)
  const origins: Model[] = [attackerModel, ...hookService.extraShootingOriginsFor(state, firingModelId).map((p) => ({ ...attackerModel, pos: { x: p.x, y: 0, z: p.z } }))]
  const inRangeOf = (o: Model, tm: Model): boolean => distance(o, tm) <= weapon.range + EPS
  if (!origins.some((o) => targetModels.some((tm) => inRangeOf(o, tm)))) return { code: 'E_NOT_IN_RANGE', reason: `${targetUnitId} is out of ${weapon.id}'s range`, details }
  const seenFrom = (o: Model, tm: Model): boolean => o === attackerModel ? losService.visible(state, firingModelId, tm.id) : losService.visibleFrom(state, o, tm.id)
  if (!origins.some((o) => targetModels.some((tm) => inRangeOf(o, tm) && seenFrom(o, tm)))) {
    return { code: 'E_NO_LOS', reason: `${firingModelId} has no line of sight to ${targetUnitId}`, details }
  }
  // GLO-ENH Sunsteala Shard (F8): an ability can forbid this target (EngineCodeHook.forbidsShootingTarget)
  const forbiddenBy = hookService.shootingTargetForbiddenBy(state, firingUnitId, targetUnitId)
  if (forbiddenBy) return { code: 'E_INVALID_TARGET', reason: `${targetUnitId} cannot be targeted: ${forbiddenBy}`, details }
  // CORE-8.3 / 11.2 / 12.8: in combat -> Shoot in Combat weapons only, at units it is in combat with
  if (isInCombat(state, firingUnitId)) {
    if (!hasAb(weapon, 'SHOOT_IN_COMBAT')) return { code: 'E_IN_COMBAT', reason: `${weapon.id} cannot be used while the unit is in combat`, details }
    if (!enemyUnitsInCombat(state, firingUnitId).includes(targetUnitId)) return { code: 'E_INVALID_TARGET', reason: 'a unit in combat may only target units it is in combat with', details }
  }
  // CORE-14.2 Guarded Hero: an INFANTRY hero next to friendlies cannot be shot from more than 12" away
  if (guardedHero(state, targetUnitId) && keywordsOf(state, targetUnitId).includes('INFANTRY') && unitDistance(state, firingUnitId, targetUnitId) > 12 + EPS) {
    return { code: 'E_INVALID_TARGET', reason: `${targetUnitId} is a Guarded Hero and cannot be targeted from more than 12" away`, details }
  }
  // CORE-16.6 Obscuring
  if (obscuredFrom(state, firingUnitId, targetUnitId)) return { code: 'E_NO_LOS', reason: `${targetUnitId} is hidden by an Obscuring feature`, details }
  return null
}

// ---------- the weapons (and their legal targets) this unit may declare right now ----------
export interface ShootingWeaponEntry { modelId: ModelId; weaponId: WeaponId; profileGroup: Id | null; legalTargets: UnitId[]; attacks: number | null }

// `models` overrides the firing models
export function buildShootingWeaponEntries(ctx: EngineContext, firingUnitId: UnitId, models?: Model[], _opts?: { ignoreAdvance?: boolean }): ShootingWeaponEntry[] {
  const s = ctx.state
  const candidates = enemyUnits(s, s.units[firingUnitId].player)
  const out: ShootingWeaponEntry[] = []
  for (const m of models ?? unitModels(s, firingUnitId)) {
    for (const wid of m.weapons) {
      const w = weaponService.effectiveWeapon(s, m.id, wid)
      if (!w || w.kind !== 'ranged') continue
      if (!weaponService.isAvailable(s, m.id, wid)) continue
      const legalTargets = candidates.filter((t) => targetLegality(s, firingUnitId, m.id, w, t) === null)
      out.push({ modelId: m.id, weaponId: wid, profileGroup: w.profileGroup, legalTargets, attacks: null })
    }
  }
  return out
}

// CORE-8.1: not Run / Retreat this turn, and some weapon has a legal target
export function unitEligibleToShoot(ctx: EngineContext, unitId: UnitId, _opts?: { ignoreAdvance?: boolean }): boolean {
  const s = ctx.state
  const u = s.units[unitId]
  if (!u || u.location !== 'board') return false
  if ((u.turn.moveType === 'advance' || u.turn.moveType === 'fallBack') && !hookService.eligibilityFor?.(s, unitId, 'shoot')) return false
  return buildShootingWeaponEntries(ctx, unitId).some((e) => e.legalTargets.length > 0)
}

// ---------- select ----------
function doSelectUnit(ctx: EngineContext): 'pending' | 'declareTargets' | 'done' {
  const s = ctx.state
  if (readMark(s, 'sh:cur') !== null) return 'declareTargets'
  if (readMark(s, 'sh:ended') !== null) return 'done'
  const active = s.activePlayer
  const activated = new Set(s.phaseState.activated)
  const eligible: UnitId[] = []
  for (const u of boardUnitsOf(s, active)) {
    if (activated.has(u.id) || u.turn.shotThisPhase) continue
    if (!unitEligibleToShoot(ctx, u.id)) continue
    eligible.push(u.id)
  }
  if (eligible.length === 0) return 'done'
  ctx.decide({
    kind: 'chooseUnitToActivate', player: active, window: 'shooting.start', canPass: true,
    context: { phase: 'shooting', eligible },
    options: eligible.map((id) => ({ id, label: id, action: { type: 'chooseUnitToActivate', player: active, decisionId: '', unitId: id } })),
  })
  return 'pending'
}

function doOpenDeclareTargets(ctx: EngineContext): void {
  const s = ctx.state
  const unitId = readMark(s, 'sh:cur')
  if (!unitId) throw new EngineInvariantError('shooting: declareTargets step with no current unit')
  const weapons = buildShootingWeaponEntries(ctx, unitId)
  ctx.decide({
    kind: 'declareTargets', player: s.units[unitId].player, window: 'shooting.start', canPass: true,
    context: { unitId, attackKind: 'ranged', overwatch: false, weapons, engagedWith: enemyUnitsInCombat(s, unitId) },
  })
}

export function validateDeclareTargets(state: GameState, action: Action, pending: PendingDecision & { kind: 'declareTargets' }): Rejection | null {
  if (action.type === 'pass') return pending.canPass ? null : { code: 'E_PASS_NOT_ALLOWED', reason: 'this unit must declare targets or none' }
  if (action.type !== 'declareTargets') return { code: 'E_NOT_AN_OPTION', reason: 'expected declareTargets' }
  if (action.unitId !== pending.context.unitId) return { code: 'E_INVALID_TARGET', reason: 'targets are for the wrong unit', details: { expected: pending.context.unitId } }
  const seen = new Set<string>()
  const profileChosen = new Map<string, WeaponId>()
  for (const t of action.targets) {
    if (t.attacks != null) return { code: 'E_SCHEMA', reason: 'attacks may only be set for melee (combat phase) targets', details: { modelId: t.modelId, weaponId: t.weaponId } }
    const dup = `${t.modelId}::${t.weaponId}`
    if (seen.has(dup)) return { code: 'E_SCHEMA', reason: `${t.weaponId} on ${t.modelId} is listed more than once`, details: { modelId: t.modelId, weaponId: t.weaponId } }
    seen.add(dup)
    const entry = pending.context.weapons.find((w) => w.modelId === t.modelId && w.weaponId === t.weaponId)
    if (!entry) return { code: 'E_INVALID_TARGET', reason: `${t.weaponId} on ${t.modelId} is not available this activation`, details: { modelId: t.modelId, weaponId: t.weaponId } }
    if (!entry.legalTargets.includes(t.targetUnitId)) {
      const w = weaponService.effectiveWeapon(state, t.modelId, t.weaponId)
      return targetLegality(state, action.unitId, t.modelId, w, t.targetUnitId) ?? { code: 'E_INVALID_TARGET', reason: `${t.targetUnitId} is not a legal target for ${t.weaponId}`, details: { modelId: t.modelId, weaponId: t.weaponId, targetUnitId: t.targetUnitId } }
    }
    if (entry.profileGroup) {
      const key = `${t.modelId}::${entry.profileGroup}`
      const chosen = profileChosen.get(key)
      if (chosen && chosen !== t.weaponId) return { code: 'E_INVALID_TARGET', reason: `only one profile of ${entry.profileGroup} may be fired per activation`, details: { modelId: t.modelId, profileGroup: entry.profileGroup } }
      profileChosen.set(key, t.weaponId)
    }
  }
  return null
}

// ---------- resolve ----------
function doResolve(ctx: EngineContext): 'pending' | 'selectUnit' {
  const s = ctx.state
  const unitId = readMark(s, 'sh:resolveUnit')
  if (!unitId) return 'selectUnit'
  // LRL-BT-3 Gale Force (F8): reactions to declaring a Shoot attack, the shooting player only, before any dice
  if (ctx.services.abilities.runReactionWindow?.(ctx, s.units[unitId]?.player ?? s.activePlayer, { kind: 'youDeclaredAttack', unitId, phase: 'shooting' }, `sh:${unitId}`)) return 'pending'
  // CORE-3.2: the active player is always offered first
  if (ctx.window('shooting.targetsDeclared', unitId, ctx.order.active(), { unitId })) return 'pending'
  if (s.phaseState.attack && attackService.advance(ctx) === 'pending') return 'pending'
  if (ctx.window('shooting.attacksResolved', unitId, ctx.order.active(), { unitId })) return 'pending'
  if (s.phaseState.attack && attackService.advance(ctx) === 'pending') return 'pending'
  // GLO-RA-2 Frazzleboom (F8): mortal damage a death trigger held during the attacks resolves once the shooting is over
  drainAfterFightMortal(ctx)
  // F8: both players' Shooting Phase abilities between activations (Hurricane Winds after this unit's shots, active player
  // first; Sunsteala Shard for the opponent)
  for (const p of ctx.order.active()) if (ctx.services.abilities.runWindow(ctx, 'shooting', p, `shooting:after:${unitId}`)) return 'pending'
  writeMark(s, 'sh:resolveUnit', null)
  return 'selectUnit'
}

// ---------- legal-action candidates: one declaration per target unit (every weapon able to hit it), plus pass ----------
function shootingLegalActions(state: GameState, pending: PendingDecision): Action[] | null {
  if (pending.kind !== 'declareTargets') return optionActions(pending)
  const { unitId, weapons } = pending.context
  const all = [...new Set(weapons.flatMap((w) => w.legalTargets))]
  const candidates: Action[] = []
  for (const target of all) {
    const targets: WeaponTarget[] = []
    const groups = new Set<string>()
    for (const e of weapons) {
      if (!e.legalTargets.includes(target)) continue
      if (e.profileGroup) { const g = `${e.modelId}::${e.profileGroup}`; if (groups.has(g)) continue; groups.add(g) }
      targets.push({ modelId: e.modelId, weaponId: e.weaponId, targetUnitId: target, ...(e.profileGroup ? { profileGroup: e.profileGroup } : {}) })
    }
    if (targets.length > 0) candidates.push({ type: 'declareTargets', player: pending.player, decisionId: pending.id, unitId, targets })
  }
  const out = filterValid(candidates, (a) => validateDeclareTargets(state, a, pending), 6)
  if (pending.canPass) out.push(passAction(pending))
  return out
}

export const shootingModule: PhaseModule = {
  name: 'shooting',
  legalActions(state, pending) { return shootingLegalActions(state, pending) },
  enter(ctx) {
    ctx.state.step = 'selectUnit'
    ctx.state.phaseState.activated = []
    ctx.state.phaseState.attack = null
  },
  advance(ctx): AdvanceResult {
    const s = ctx.state
    for (;;) {
      // CORE-3.13: abilities of the active player's Shooting Phase first
      if (!ctx.marked('sh:ab:active')) {
        if (ctx.services.abilities.runWindow(ctx, 'shooting', s.activePlayer, 'shooting:active')) return 'pending'
        // F8: the opponent's Shooting Phase abilities are also offered before the first shot (GLO-ENH Sunsteala Shard)
        if (ctx.services.abilities.runWindow(ctx, 'shooting', otherPlayer(s.activePlayer), 'shooting:enemy:start')) return 'pending'
        ctx.once('sh:ab:active')
      }
      if (s.step === 'selectUnit') {
        const r = doSelectUnit(ctx)
        if (r === 'pending') return 'pending'
        s.step = r === 'done' ? 'enemyAbilities' : r
        continue
      }
      if (s.step === 'declareTargets') {
        doOpenDeclareTargets(ctx)
        return 'pending'
      }
      if (s.step === 'resolve') {
        const r = doResolve(ctx)
        if (r === 'pending') return 'pending'
        s.step = r
        continue
      }
      if (s.step === 'enemyAbilities') {
        // the opponent's Shooting Phase abilities come after the active player is done (CORE-3.13)
        if (!ctx.marked('sh:ab:enemy')) {
          if (ctx.services.abilities.runWindow(ctx, 'shooting', otherPlayer(s.activePlayer), 'shooting:enemy')) return 'pending'
          ctx.once('sh:ab:enemy')
        }
        return 'done'
      }
      throw new EngineInvariantError(`shooting: unexpected step ${s.step}`)
    }
  },
  validate(_state, action, pending) {
    if (pending.kind === 'declareTargets') return validateDeclareTargets(_state, action, pending)
    return optionCheck(pending, action)
  },
  handle(ctx, action, pending): Rejection | void {
    const s = ctx.state
    if (action.type === 'pass') {
      if (pending.kind === 'chooseUnitToActivate') { writeMark(s, 'sh:ended', '1'); return }
      if (pending.kind === 'declareTargets') { writeMark(s, 'sh:cur', null); s.step = 'selectUnit'; return }
      return { code: 'E_NOT_AN_OPTION', reason: `shooting: pass is not valid for ${pending.kind}` }
    }
    if (pending.kind === 'chooseUnitToActivate' && action.type === 'chooseUnitToActivate') {
      if (!s.phaseState.activated.includes(action.unitId)) s.phaseState.activated.push(action.unitId)
      writeMark(s, 'sh:cur', action.unitId)
      s.step = 'declareTargets'
      return
    }
    if (pending.kind === 'declareTargets' && action.type === 'declareTargets') {
      writeMark(s, 'sh:cur', null)
      if (action.targets.length === 0) { s.step = 'selectUnit'; return }
      s.units[action.unitId].turn.shotThisPhase = true
      const targets: DeclaredTarget[] = action.targets.map((t) => ({ modelId: t.modelId, weaponId: t.weaponId, targetUnitId: t.targetUnitId, profileGroup: t.profileGroup ?? null, attacks: null }))
      attackService.begin(ctx, { kind: 'ranged', attackerUnitId: action.unitId, overwatch: false, targets })
      writeMark(s, 'sh:resolveUnit', action.unitId)
      s.step = 'resolve'
      return
    }
    return notImplementedHandle('shooting')(ctx, action, pending)
  },
}

